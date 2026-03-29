/**
 * LangGraph 面接フローグラフ
 *
 * 面接の状態遷移を管理する。LLMのストリーミング呼び出し自体はAI SDKで行い、
 * LangGraphは「次にどのフェーズに進むか」の判定（条件エッジ）を担当する。
 *
 * グラフ構造:
 *   [START] → [evaluate] → 条件エッジ(routeAfterEvaluation)
 *                            ├ 不合格         → [fail_end]      → [END]
 *                            ├ 通常合格       → [advance_phase]  → [END]
 *                            ├ スコア9以上    → [skip_to_ceo]    → [END]
 *                            ├ CEO面接完了    → [ceo_complete]   → [END]
 *                            └ 最終面接通過   → [final_evaluate] → [END]
 */

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import type { InterviewPhase } from "@/data/prompts";
import type { Situation } from "@/data/situations";

// ─── State定義 ───

export type ChatMessage = { role: "user" | "assistant"; content: string };

const InterviewState = Annotation.Root({
  companyType: Annotation<string>,
  companySize: Annotation<string>,
  situation: Annotation<Situation>,
  currentPhase: Annotation<InterviewPhase>,

  // 評価テキスト（evaluateノードへの入力）
  evaluationText: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // 判定結果（グラフの出力）
  passed: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),
  score: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 5,
  }),
  nextPhase: Annotation<InterviewPhase | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  skipToCeo: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),
  outcome: Annotation<
    "advance" | "skip_to_ceo" | "final_evaluate" | "ceo_complete" | "fail"
  >({
    reducer: (_, update) => update,
    default: () => "advance",
  }),
});

export type InterviewGraphInput = typeof InterviewState.Update;
export type InterviewGraphOutput = typeof InterviewState.State;

// ─── ノード定義 ───

/** 評価テキストからスコアと合否を抽出する */
function evaluateNode(state: InterviewGraphOutput) {
  const { evaluationText, currentPhase } = state;

  const passed = evaluationText.includes("【通過】");

  const scoreMatch = evaluationText.match(/内部スコア:\s*(\d+)\s*\/\s*10/);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 5;

  return { passed, score };
}

/** 条件エッジ: 合否 + スコアで分岐先を決定 */
function routeAfterEvaluation(
  state: InterviewGraphOutput
): "advance_phase" | "skip_to_ceo" | "final_evaluate" | "ceo_complete" | "fail_end" {
  if (!state.passed) return "fail_end";

  // CEO面接フェーズの完了
  if (state.currentPhase === "ceo") return "ceo_complete";

  // 高スコア（9以上）かつ最終面接以外 → 社長面接スキップ
  if (state.score >= 9 && state.currentPhase !== "final") return "skip_to_ceo";

  // 最終面接通過 → 総合評価
  if (state.currentPhase === "final") return "final_evaluate";

  // 通常合格 → 次のフェーズ
  return "advance_phase";
}

/** 次のフェーズに進む */
function advancePhaseNode(state: InterviewGraphOutput) {
  const phases: InterviewPhase[] = ["first", "second", "final"];
  const currentIndex = phases.indexOf(state.currentPhase);
  const nextPhase = phases[currentIndex + 1];

  return {
    nextPhase,
    skipToCeo: false,
    outcome: "advance" as const,
  };
}

/** 社長面接にスキップ */
function skipToCeoNode() {
  return {
    nextPhase: "ceo" as InterviewPhase,
    skipToCeo: true,
    outcome: "skip_to_ceo" as const,
  };
}

/** 不合格終了 */
function failEndNode() {
  return {
    nextPhase: null,
    skipToCeo: false,
    outcome: "fail" as const,
  };
}

/** 最終評価へ（通常ルート） */
function finalEvaluateNode() {
  return {
    nextPhase: null,
    skipToCeo: false,
    outcome: "final_evaluate" as const,
  };
}

/** CEO面接完了 */
function ceoCompleteNode() {
  return {
    nextPhase: null,
    skipToCeo: false,
    outcome: "ceo_complete" as const,
  };
}

// ─── グラフ構築 ───

const builder = new StateGraph(InterviewState)
  .addNode("evaluate", evaluateNode)
  .addNode("advance_phase", advancePhaseNode)
  .addNode("skip_to_ceo", skipToCeoNode)
  .addNode("fail_end", failEndNode)
  .addNode("final_evaluate", finalEvaluateNode)
  .addNode("ceo_complete", ceoCompleteNode)
  .addEdge(START, "evaluate")
  .addConditionalEdges("evaluate", routeAfterEvaluation, [
    "advance_phase",
    "skip_to_ceo",
    "final_evaluate",
    "ceo_complete",
    "fail_end",
  ])
  .addEdge("advance_phase", END)
  .addEdge("skip_to_ceo", END)
  .addEdge("fail_end", END)
  .addEdge("final_evaluate", END)
  .addEdge("ceo_complete", END);

export const interviewGraph = builder.compile();
