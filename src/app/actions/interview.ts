"use server";

import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createStreamableValue } from "@ai-sdk/rsc";
import {
  buildInterviewSystemPrompt,
  buildEvaluationPrompt,
  buildFinalEvaluationPrompt,
  type InterviewPhase,
} from "@/data/prompts";
import type { Situation } from "@/data/situations";

type Message = { role: "user" | "assistant"; content: string };

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

export async function evaluate(
  phase: InterviewPhase,
  companyType: string,
  companySize: string,
  situation: Situation,
  messages: Message[]
) {
  const evalPrompt = buildEvaluationPrompt(phase, companyType, situation);

  const stream = createStreamableValue("");

  (async () => {
    try {
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
        stream.append(chunk);
      }

      stream.done();
    } catch (e) {
      stream.error(e instanceof Error ? e : new Error("Stream failed"));
    }
  })();

  return { text: stream.value };
}

export async function finalEvaluate(
  companyType: string,
  companySize: string,
  situation: Situation,
  allMessages: Record<string, Message[]>
) {
  const finalPrompt = buildFinalEvaluationPrompt(companyType, situation);

  const allConversation = (["first", "second", "final"] as const)
    .map((p) => {
      const phaseLabel =
        p === "first" ? "一次面接" : p === "second" ? "二次面接" : "最終面接";
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
