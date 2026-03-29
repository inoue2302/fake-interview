"use server";

import { streamText, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createStreamableValue } from "@ai-sdk/rsc";
import {
  interviewGraph,
  type InterviewGraphOutput,
} from "@/lib/interview-graph";
import {
  buildInterviewSystemPrompt,
  buildEvaluationPrompt,
  buildFinalEvaluationPrompt,
  buildCeoEvaluationPrompt,
  PHASE_CONFIG,
  type InterviewPhase,
} from "@/data/prompts";
import type { Situation } from "@/data/situations";

type Message = { role: "user" | "assistant"; content: string };

/** 面接官の発言をストリーミング生成 */
export async function chat(
  phase: InterviewPhase,
  companyType: string,
  companySize: string,
  situation: Situation,
  messages: Message[],
  isLastAnswer: boolean = false
) {
  let systemPrompt = buildInterviewSystemPrompt(
    phase,
    companyType,
    companySize,
    situation
  );

  if (isLastAnswer) {
    systemPrompt += `\n\n## 重要：最後の回答への応答
これは候補者の最後の回答です。絶対に新しい質問をしないでください。
回答への短い感想・コメントを1〜2行で返すだけにしてください。
「〜ですか？」「〜教えてください」のような質問文は禁止です。`;
  }

  const stream = createStreamableValue("");

  (async () => {
    try {
      const apiMessages =
        messages.length > 0
          ? messages.map((m) => ({ role: m.role, content: m.content }))
          : [{ role: "user" as const, content: "面接よろしくお願いします。" }];

      const { textStream } = streamText({
        model: anthropic("claude-sonnet-4-6"),
        system: systemPrompt,
        messages: apiMessages,
        maxOutputTokens: 300,
      });

      for await (const chunk of textStream) {
        stream.append(chunk);
      }

      stream.done();
    } catch (e) {
      stream.error(e instanceof Error ? e : new Error("Stream failed"));
    }
  })();

  return { text: stream.value };
}

/** LangGraphで判定した結果の型 */
export type EvaluateResult = {
  passed: boolean;
  score: number;
  nextPhase: InterviewPhase | null;
  skipToCeo: boolean;
  outcome: "advance" | "skip_to_ceo" | "final_evaluate" | "ceo_complete" | "fail";
  evaluation: string;
};

/**
 * フェーズ評価を一括生成し、LangGraphで条件エッジ判定。
 * ストリーミング不要（結果ページに遷移するだけなので）。
 */
export async function evaluate(
  phase: InterviewPhase,
  companyType: string,
  companySize: string,
  situation: Situation,
  messages: Message[]
): Promise<EvaluateResult> {
  const evalPrompt = buildEvaluationPrompt(phase, companyType, situation);

  const { text: evalText } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: evalPrompt,
    messages: [
      {
        role: "user",
        content: `以下が面接のやり取りです:\n\n${messages.map((m) => `${m.role === "assistant" ? "面接官" : "候補者"}: ${m.content}`).join("\n\n")}\n\n評価コメントをお願いします。`,
      },
    ],
    maxOutputTokens: 300,
  });

  // LangGraphのグラフを実行して条件エッジで分岐判定
  const graphResult: InterviewGraphOutput = await interviewGraph.invoke({
    companyType,
    companySize,
    situation,
    currentPhase: phase,
    evaluationText: evalText,
  });

  return {
    passed: graphResult.passed,
    score: graphResult.score,
    nextPhase: graphResult.nextPhase,
    skipToCeo: graphResult.skipToCeo,
    outcome: graphResult.outcome,
    evaluation: evalText,
  };
}

/** 社長面接の評価を一括生成 */
export async function ceoEvaluate(
  companyType: string,
  companySize: string,
  situation: Situation,
  ceoMessages: Message[]
): Promise<string> {
  const ceoPrompt = buildCeoEvaluationPrompt(companyType, situation);

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: ceoPrompt,
    messages: [
      {
        role: "user",
        content: `以下が社長面接のやり取りです:\n\n${ceoMessages.map((m) => `${m.role === "assistant" ? "社長" : "候補者"}: ${m.content}`).join("\n\n")}\n\n評価をお願いします。`,
      },
    ],
    maxOutputTokens: 500,
  });

  return text;
}

/** 最終評価を一括生成 */
export async function finalEvaluate(
  companyType: string,
  companySize: string,
  situation: Situation,
  allMessages: Record<string, Message[]>
): Promise<string> {
  const finalPrompt = buildFinalEvaluationPrompt(companyType, situation);

  const phases = Object.keys(allMessages);
  const allConversation = phases
    .map((p) => {
      const phaseLabel = PHASE_CONFIG[p as InterviewPhase]?.label ?? p;
      const msgs = allMessages[p] ?? [];
      return `## ${phaseLabel}\n${msgs.map((m) => `${m.role === "assistant" ? "面接官" : "候補者"}: ${m.content}`).join("\n\n")}`;
    })
    .join("\n\n---\n\n");

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: finalPrompt,
    messages: [
      {
        role: "user",
        content: `以下が全面接のやり取りです:\n\n${allConversation}\n\n総合評価をお願いします。`,
      },
    ],
    maxOutputTokens: 500,
  });

  return text;
}
