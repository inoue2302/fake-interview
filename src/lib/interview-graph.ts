import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";
import {
  buildInterviewSystemPrompt,
  buildEvaluationPrompt,
  buildFinalEvaluationPrompt,
  PHASE_CONFIG,
  type InterviewPhase,
} from "@/data/prompts";
import type { Situation } from "@/data/situations";

// ─── State定義 ───

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type PhaseResult = {
  phase: InterviewPhase;
  evaluation: string;
  passed: boolean;
  score?: number;
};

const InterviewState = Annotation.Root({
  // 設定（不変）
  companyType: Annotation<string>,
  companySize: Annotation<string>,
  situation: Annotation<Situation>,

  // 現在のフェーズ
  currentPhase: Annotation<InterviewPhase>,

  // フェーズごとの会話履歴
  phaseMessages: Annotation<Record<string, ChatMessage[]>>({
    reducer: (prev, update) => ({ ...prev, ...update }),
    default: () => ({}),
  }),

  // 各フェーズの評価結果
  phaseResults: Annotation<PhaseResult[]>({
    reducer: (prev, update) => [...prev, ...update],
    default: () => [],
  }),

  // 最終評価
  finalEvaluation: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // 現在のフェーズの面接官応答（ストリーミング用）
  currentResponse: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // グラフの次のアクション指示
  action: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "start_phase",
  }),
});

export type InterviewStateType = typeof InterviewState.State;

const model = new ChatAnthropic({
  model: "claude-sonnet-4-6",
  maxTokens: 300,
});

// ─── ノード定義 ───

/** 面接官の発言を生成するノード */
async function interviewNode(state: InterviewStateType) {
  const { currentPhase, companyType, companySize, situation, phaseMessages } =
    state;
  const messages = phaseMessages[currentPhase] ?? [];

  const systemPrompt = buildInterviewSystemPrompt(
    currentPhase,
    companyType,
    companySize,
    situation
  );

  const langchainMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
  ];

  const response = await model.invoke(langchainMessages);
  const responseText =
    typeof response.content === "string"
      ? response.content
      : response.content
          .filter((c) => c.type === "text")
          .map((c) => ("text" in c ? c.text : ""))
          .join("");

  // 会話履歴にアシスタントの応答を追加
  const updatedMessages = [
    ...messages,
    { role: "assistant" as const, content: responseText },
  ];

  return {
    phaseMessages: { [currentPhase]: updatedMessages },
    currentResponse: responseText,
    action: "wait_user", // ユーザーの回答を待つ
  };
}

/** フェーズ評価を生成するノード */
async function evaluateNode(state: InterviewStateType) {
  const { currentPhase, companyType, companySize, situation, phaseMessages } =
    state;
  const messages = phaseMessages[currentPhase] ?? [];

  const evalPrompt = buildEvaluationPrompt(currentPhase, companyType, situation);
  const conversationText = messages
    .map(
      (m) =>
        `${m.role === "assistant" ? "面接官" : "候補者"}: ${m.content}`
    )
    .join("\n\n");

  const response = await model.invoke([
    { role: "system", content: evalPrompt },
    {
      role: "user",
      content: `以下が面接のやり取りです:\n\n${conversationText}\n\n評価コメントをお願いします。`,
    },
  ]);

  const evalText =
    typeof response.content === "string"
      ? response.content
      : response.content
          .filter((c) => c.type === "text")
          .map((c) => ("text" in c ? c.text : ""))
          .join("");

  // 【通過】を含むか判定
  const passed = evalText.includes("【通過】");

  // 内部スコアを抽出
  const scoreMatch = evalText.match(/内部スコア:\s*(\d+)\s*\/\s*10/);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 5;

  return {
    phaseResults: [{ phase: currentPhase, evaluation: evalText, passed, score }],
    currentResponse: evalText,
    action: passed ? "next" : "fail",
  };
}

/** 合否 + スコアによる分岐ルーター（LangGraphの条件エッジ） */
function routeAfterEvaluation(
  state: InterviewStateType
): "advance_phase" | "final_evaluate" | "fail_end" | "skip_to_ceo" {
  const lastResult = state.phaseResults[state.phaseResults.length - 1];
  if (!lastResult?.passed) return "fail_end";

  // 高スコア（9以上）かつ最終面接以外 → 社長面接スキップ
  const score = lastResult.score ?? 5;
  if (score >= 9 && state.currentPhase !== "final") return "skip_to_ceo";

  if (state.currentPhase === "final") return "final_evaluate";
  return "advance_phase";
}

/** 社長面接にスキップするノード */
function skipToCeoNode(state: InterviewStateType) {
  return {
    currentPhase: "ceo" as InterviewPhase,
    action: "start_phase",
  };
}

/** 次のフェーズに進むノード */
function advancePhaseNode(state: InterviewStateType) {
  const phases: InterviewPhase[] = ["first", "second", "final"];
  const currentIndex = phases.indexOf(state.currentPhase);
  const nextPhase = phases[currentIndex + 1];

  return {
    currentPhase: nextPhase,
    action: "start_phase",
  };
}

/** 不合格終了ノード */
function failEndNode(state: InterviewStateType) {
  const lastResult = state.phaseResults[state.phaseResults.length - 1];
  return {
    finalEvaluation: lastResult?.evaluation ?? "不合格となりました。",
    action: "complete",
  };
}

/** 最終評価ノード */
async function finalEvaluateNode(state: InterviewStateType) {
  const { companyType, companySize, situation, phaseMessages } = state;

  const finalPrompt = buildFinalEvaluationPrompt(companyType, situation);

  const allConversation = (["first", "second", "final"] as const)
    .map((p) => {
      const phaseLabel = PHASE_CONFIG[p].label;
      const msgs = phaseMessages[p] ?? [];
      return `## ${phaseLabel}\n${msgs.map((m) => `${m.role === "assistant" ? "面接官" : "候補者"}: ${m.content}`).join("\n\n")}`;
    })
    .join("\n\n---\n\n");

  const finalModel = new ChatAnthropic({
    model: "claude-sonnet-4-6",
    maxTokens: 500,
  });

  const response = await finalModel.invoke([
    { role: "system", content: finalPrompt },
    {
      role: "user",
      content: `以下が全面接のやり取りです:\n\n${allConversation}\n\n総合評価をお願いします。`,
    },
  ]);

  const evalText =
    typeof response.content === "string"
      ? response.content
      : response.content
          .filter((c) => c.type === "text")
          .map((c) => ("text" in c ? c.text : ""))
          .join("");

  return {
    finalEvaluation: evalText,
    currentResponse: evalText,
    action: "complete",
  };
}

// ─── グラフ構築 ───

const builder = new StateGraph(InterviewState)
  .addNode("interview", interviewNode)
  .addNode("evaluate", evaluateNode)
  .addNode("advance_phase", advancePhaseNode)
  .addNode("skip_to_ceo", skipToCeoNode)
  .addNode("fail_end", failEndNode)
  .addNode("final_evaluate", finalEvaluateNode)
  .addEdge(START, "interview")
  .addEdge("interview", END) // ユーザー回答待ち → 一旦停止
  .addConditionalEdges("evaluate", routeAfterEvaluation, [
    "advance_phase",
    "skip_to_ceo",
    "final_evaluate",
    "fail_end",
  ])
  .addEdge("advance_phase", "interview")
  .addEdge("skip_to_ceo", "interview") // 社長面接へ
  .addEdge("fail_end", END)
  .addEdge("final_evaluate", END);

export const interviewGraph = builder.compile();

// ─── ヘルパー関数 ───

/** 面接グラフの初期状態を作成 */
export function createInitialState(
  companyType: string,
  companySize: string,
  situation: Situation
): typeof InterviewState.Update {
  return {
    companyType,
    companySize,
    situation,
    currentPhase: "first" as InterviewPhase,
    action: "start_phase",
  };
}
