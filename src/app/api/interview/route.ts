import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  buildInterviewSystemPrompt,
  buildEvaluationPrompt,
  buildFinalEvaluationPrompt,
  type InterviewPhase,
} from "@/data/prompts";
import type { Situation } from "@/data/situations";

type Message = { role: "user" | "assistant"; content: string };

type RequestBody = {
  action: "chat" | "evaluate" | "final-evaluate";
  phase: InterviewPhase;
  companyType: string;
  companySize: string;
  situation: Situation;
  messages: Message[];
  allMessages?: Record<string, Message[]>;
};

export async function POST(request: Request) {
  const body: RequestBody = await request.json();
  const { action, phase, companyType, companySize, situation, messages } = body;

  if (action === "chat") {
    const systemPrompt = buildInterviewSystemPrompt(
      phase,
      companyType,
      companySize,
      situation
    );

    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      maxOutputTokens: 300,
    });

    return result.toTextStreamResponse();
  }

  if (action === "evaluate") {
    const evalPrompt = buildEvaluationPrompt(phase, companyType, situation);

    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: evalPrompt,
      messages: [
        {
          role: "user",
          content: `以下が面接のやり取りです:\n\n${messages.map((m) => `${m.role === "assistant" ? "面接官" : "候補者"}: ${m.content}`).join("\n\n")}\n\n評価コメントをお願いします。`,
        },
      ],
      maxOutputTokens: 300,
    });

    return result.toTextStreamResponse();
  }

  if (action === "final-evaluate") {
    const finalPrompt = buildFinalEvaluationPrompt(companyType, situation);
    const allMessages = body.allMessages ?? {};

    const allConversation = (["first", "second", "final"] as const)
      .map((p) => {
        const phaseLabel =
          p === "first" ? "一次面接" : p === "second" ? "二次面接" : "最終面接";
        const msgs = allMessages[p] ?? [];
        return `## ${phaseLabel}\n${msgs.map((m) => `${m.role === "assistant" ? "面接官" : "候補者"}: ${m.content}`).join("\n\n")}`;
      })
      .join("\n\n---\n\n");

    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: finalPrompt,
      messages: [
        {
          role: "user",
          content: `以下が全面接のやり取りです:\n\n${allConversation}\n\n総合評価をお願いします。`,
        },
      ],
      maxOutputTokens: 500,
    });

    return result.toTextStreamResponse();
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
