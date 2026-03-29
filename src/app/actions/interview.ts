"use server";

import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createStreamableValue } from "@ai-sdk/rsc";
import {
  buildInterviewSystemPrompt,
  buildEvaluationPrompt,
  buildFinalEvaluationPrompt,
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
      const { textStream } = streamText({
        model: anthropic("claude-sonnet-4-6"),
        system: systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
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

/** フェーズ評価をストリーミング生成し、合否判定も返す */
export async function evaluate(
  phase: InterviewPhase,
  companyType: string,
  companySize: string,
  situation: Situation,
  messages: Message[],
  allPhaseResults: { phase: string; passed: boolean }[]
) {
  const evalPrompt = buildEvaluationPrompt(phase, companyType, situation);

  const stream = createStreamableValue("");
  const resultPromise = createStreamableValue<{
    passed: boolean;
    nextPhase: InterviewPhase | null;
  } | null>(null);

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

      // LangGraphの条件エッジロジック: 合否判定
      const passed = fullText.includes("【通過】");

      // 次のフェーズを判定（グラフの条件エッジに相当）
      let nextPhase: InterviewPhase | null = null;
      if (passed) {
        const phases: InterviewPhase[] = ["first", "second", "final"];
        const currentIndex = phases.indexOf(phase);
        if (currentIndex < phases.length - 1) {
          nextPhase = phases[currentIndex + 1];
        }
        // final で通過 → nextPhase = null → 最終評価へ
      }
      // 不通過 → nextPhase = null, passed = false → 不合格END

      stream.done();
      resultPromise.update({ passed, nextPhase });
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

/** 最終評価をストリーミング生成 */
export async function finalEvaluate(
  companyType: string,
  companySize: string,
  situation: Situation,
  allMessages: Record<string, Message[]>
) {
  const finalPrompt = buildFinalEvaluationPrompt(companyType, situation);

  const allConversation = (["first", "second", "final"] as const)
    .map((p) => {
      const phaseLabel = PHASE_CONFIG[p].label;
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
