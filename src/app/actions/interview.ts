"use server";

import { streamText } from "ai";
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
  messages: Message[]
) {
  const systemPrompt = buildInterviewSystemPrompt(
    phase,
    companyType,
    companySize,
    situation
  );

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
};

/**
 * フェーズ評価をストリーミング生成し、
 * LangGraphのグラフを実行して条件エッジで次の行き先を判定する。
 */
export async function evaluate(
  phase: InterviewPhase,
  companyType: string,
  companySize: string,
  situation: Situation,
  messages: Message[]
) {
  const evalPrompt = buildEvaluationPrompt(phase, companyType, situation);

  const stream = createStreamableValue("");
  const resultPromise = createStreamableValue<EvaluateResult | null>(null);

  (async () => {
    try {
      let fullText = "";
      const { textStream } = streamText({
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

      for await (const chunk of textStream) {
        fullText += chunk;
        stream.append(chunk);
      }

      // LangGraphのグラフを実行して条件エッジで分岐判定
      const graphResult: InterviewGraphOutput = await interviewGraph.invoke({
        companyType,
        companySize,
        situation,
        currentPhase: phase,
        evaluationText: fullText,
      });

      stream.done();
      resultPromise.update({
        passed: graphResult.passed,
        score: graphResult.score,
        nextPhase: graphResult.nextPhase,
        skipToCeo: graphResult.skipToCeo,
        outcome: graphResult.outcome,
      });
      resultPromise.done();
    } catch (e) {
      stream.error(e instanceof Error ? e : new Error("Stream failed"));
      resultPromise.error(
        e instanceof Error ? e : new Error("Evaluation failed")
      );
    }
  })();

  return { text: stream.value, result: resultPromise.value };
}

/** 社長面接の評価をストリーミング生成 → LangGraphで判定 */
export async function ceoEvaluate(
  companyType: string,
  companySize: string,
  situation: Situation,
  ceoMessages: Message[]
) {
  const ceoPrompt = buildCeoEvaluationPrompt(companyType, situation);

  const stream = createStreamableValue("");

  (async () => {
    try {
      const { textStream } = streamText({
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

/** 最終評価をストリーミング生成 */
export async function finalEvaluate(
  companyType: string,
  companySize: string,
  situation: Situation,
  allMessages: Record<string, Message[]>
) {
  const finalPrompt = buildFinalEvaluationPrompt(companyType, situation);

  const phases = Object.keys(allMessages);
  const allConversation = phases
    .map((p) => {
      const phaseLabel = PHASE_CONFIG[p as InterviewPhase]?.label ?? p;
      const msgs = allMessages[p] ?? [];
      return `## ${phaseLabel}\n${msgs.map((m) => `${m.role === "assistant" ? "面接官" : "候補者"}: ${m.content}`).join("\n\n")}`;
    })
    .join("\n\n---\n\n");

  const stream = createStreamableValue("");

  (async () => {
    try {
      const { textStream } = streamText({
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
