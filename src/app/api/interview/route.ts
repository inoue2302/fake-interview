import Anthropic from "@anthropic-ai/sdk";
import {
  buildInterviewSystemPrompt,
  buildEvaluationPrompt,
  buildFinalEvaluationPrompt,
  type InterviewPhase,
} from "@/data/prompts";
import type { Situation } from "@/data/situations";

const anthropic = new Anthropic();

type MessageRole = "user" | "assistant";
type Message = { role: MessageRole; content: string };

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

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  if (action === "evaluate") {
    const evalPrompt = buildEvaluationPrompt(phase, companyType, situation);

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: evalPrompt,
      messages: [
        {
          role: "user",
          content: `以下が面接のやり取りです:\n\n${messages.map((m) => `${m.role === "assistant" ? "面接官" : "候補者"}: ${m.content}`).join("\n\n")}\n\n評価コメントをお願いします。`,
        },
      ],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
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

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: finalPrompt,
      messages: [
        {
          role: "user",
          content: `以下が全面接のやり取りです:\n\n${allConversation}\n\n総合評価をお願いします。`,
        },
      ],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
