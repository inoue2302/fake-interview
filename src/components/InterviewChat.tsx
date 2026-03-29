"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PHASE_CONFIG, PHASES_ORDER, type InterviewPhase } from "@/data/prompts";
import type { Situation } from "@/data/situations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Message = { role: "user" | "assistant"; content: string };

type InterviewState =
  | { status: "interviewing"; phase: InterviewPhase; questionIndex: number }
  | { status: "evaluating"; phase: InterviewPhase }
  | { status: "phase-result"; phase: InterviewPhase; evaluation: string }
  | { status: "final-evaluating" }
  | { status: "complete"; finalEvaluation: string };

type Props = {
  companyType: string;
  companySize: string;
  situation: Situation;
};

async function streamChat(
  body: Record<string, unknown>,
  onChunk: (text: string) => void,
  onDone: () => void
) {
  const res = await fetch("/api/interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") {
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.text) onChunk(parsed.text);
        } catch {
          // skip
        }
      }
    }
  }
  onDone();
}

export default function InterviewChat({
  companyType,
  companySize,
  situation,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<InterviewState>({
    status: "interviewing",
    phase: "first",
    questionIndex: 0,
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [allMessages, setAllMessages] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initializedRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  // フェーズ開始時の面接官の最初の発言
  const startPhase = useCallback(
    (phase: InterviewPhase) => {
      setStreaming(true);
      setStreamingText("");
      let accumulated = "";

      streamChat(
        {
          action: "chat",
          phase,
          companyType,
          companySize,
          situation,
          messages: [],
        },
        (text) => {
          accumulated += text;
          setStreamingText(accumulated);
        },
        () => {
          setMessages([{ role: "assistant", content: accumulated }]);
          setStreamingText("");
          setStreaming(false);
          setState({
            status: "interviewing",
            phase,
            questionIndex: 1,
          });
        }
      );
    },
    [companyType, companySize, situation]
  );

  // 初回マウント時に一次面接開始
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      startPhase("first");
    }
  }, [startPhase]);

  const handleSend = async () => {
    if (!input.trim() || streaming || state.status !== "interviewing") return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    setStreamingText("");

    const { phase, questionIndex } = state;
    const config = PHASE_CONFIG[phase];

    // 最後の質問への回答後 → 評価へ
    if (questionIndex >= config.questionsCount) {
      // 面接官の最後のリアクション
      let accumulated = "";
      await streamChat(
        {
          action: "chat",
          phase,
          companyType,
          companySize,
          situation,
          messages: newMessages,
        },
        (text) => {
          accumulated += text;
          setStreamingText(accumulated);
        },
        () => {
          const finalMessages = [
            ...newMessages,
            { role: "assistant" as const, content: accumulated },
          ];
          setMessages(finalMessages);
          setStreamingText("");
          setStreaming(false);

          // このフェーズの会話を保存
          setAllMessages((prev) => ({ ...prev, [phase]: finalMessages }));

          // 評価開始
          setState({ status: "evaluating", phase });
        }
      );
      return;
    }

    // 通常の質問続行
    let accumulated = "";
    await streamChat(
      {
        action: "chat",
        phase,
        companyType,
        companySize,
        situation,
        messages: newMessages,
      },
      (text) => {
        accumulated += text;
        setStreamingText(accumulated);
      },
      () => {
        setMessages([
          ...newMessages,
          { role: "assistant", content: accumulated },
        ]);
        setStreamingText("");
        setStreaming(false);
        setState({
          status: "interviewing",
          phase,
          questionIndex: questionIndex + 1,
        });
      }
    );
  };

  // 評価実行
  useEffect(() => {
    if (state.status !== "evaluating") return;

    const { phase } = state;
    const phaseMessages = allMessages[phase] ?? messages;
    setStreaming(true);
    setStreamingText("");
    let accumulated = "";

    streamChat(
      {
        action: "evaluate",
        phase,
        companyType,
        companySize,
        situation,
        messages: phaseMessages,
      },
      (text) => {
        accumulated += text;
        setStreamingText(accumulated);
      },
      () => {
        setStreamingText("");
        setStreaming(false);
        setState({ status: "phase-result", phase, evaluation: accumulated });
      }
    );
  }, [state, allMessages, messages, companyType, companySize, situation]);

  // 次のフェーズへ or 最終評価へ
  const handleNextPhase = () => {
    if (state.status !== "phase-result") return;

    const currentPhaseIndex = PHASES_ORDER.indexOf(state.phase);
    if (currentPhaseIndex < PHASES_ORDER.length - 1) {
      const nextPhase = PHASES_ORDER[currentPhaseIndex + 1];
      setMessages([]);
      startPhase(nextPhase);
    } else {
      // 最終評価
      setState({ status: "final-evaluating" });
    }
  };

  // 最終評価実行
  useEffect(() => {
    if (state.status !== "final-evaluating") return;

    setStreaming(true);
    setStreamingText("");
    let accumulated = "";

    streamChat(
      {
        action: "final-evaluate",
        phase: "final",
        companyType,
        companySize,
        situation,
        messages: [],
        allMessages,
      },
      (text) => {
        accumulated += text;
        setStreamingText(accumulated);
      },
      () => {
        setStreamingText("");
        setStreaming(false);
        setState({ status: "complete", finalEvaluation: accumulated });
      }
    );
  }, [state, allMessages, companyType, companySize, situation]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentPhase =
    state.status === "interviewing" || state.status === "evaluating"
      ? state.phase
      : state.status === "phase-result"
        ? state.phase
        : state.status === "final-evaluating" || state.status === "complete"
          ? "final"
          : "first";

  const phaseConfig = PHASE_CONFIG[currentPhase];

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      {/* ヘッダー */}
      <header className="border-b bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg">{phaseConfig.label}</h1>
            <p className="text-xs text-muted-foreground">
              {phaseConfig.subtitle} ― {phaseConfig.role}
            </p>
          </div>
          <div className="flex gap-1">
            {PHASES_ORDER.map((p) => {
              const idx = PHASES_ORDER.indexOf(currentPhase);
              const pIdx = PHASES_ORDER.indexOf(p);
              const isActive = pIdx <= idx;
              return (
                <div
                  key={p}
                  className={`w-8 h-1 rounded-full ${isActive ? "bg-pink-400" : "bg-muted"}`}
                />
              );
            })}
          </div>
        </div>
      </header>

      {/* メッセージエリア */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {/* シチュエーション表示 */}
        {messages.length <= 1 && state.status === "interviewing" && (
          <Card className="bg-muted/50 mb-4">
            <CardContent className="text-xs text-muted-foreground space-y-1 pt-1">
              <div>
                <span className="font-bold text-orange-400">事業: </span>
                {situation.business}
              </div>
              <div>
                <span className="font-bold text-pink-400">募集背景: </span>
                {situation.hiringReason}
              </div>
              <div>
                <span className="font-bold text-violet-400">求める人材: </span>
                {situation.desiredTrait}
              </div>
            </CardContent>
          </Card>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-pink-500 text-white rounded-br-md"
                  : "bg-card ring-1 ring-foreground/10 rounded-bl-md"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="text-[10px] font-bold text-muted-foreground mb-1">
                  {phaseConfig.role}
                </div>
              )}
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {/* ストリーミング中 */}
        {streaming && streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-card ring-1 ring-foreground/10 rounded-bl-md">
              <div className="text-[10px] font-bold text-muted-foreground mb-1">
                {state.status === "evaluating" || state.status === "final-evaluating"
                  ? "評価"
                  : phaseConfig.role}
              </div>
              <div className="whitespace-pre-wrap">{streamingText}</div>
            </div>
          </div>
        )}

        {/* ストリーミング中のインジケーター */}
        {streaming && !streamingText && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2.5 bg-card ring-1 ring-foreground/10 rounded-bl-md">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0.1s]" />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        )}

        {/* フェーズ結果 */}
        {state.status === "phase-result" && (
          <Card className="bg-gradient-to-r from-orange-50 to-pink-50 dark:from-orange-950/20 dark:to-pink-950/20 mt-4">
            <CardContent className="pt-2">
              <div className="text-xs font-bold text-pink-500 mb-2">
                {PHASE_CONFIG[state.phase].label}の評価
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">
                {state.evaluation}
              </div>
              <Button
                onClick={handleNextPhase}
                className="mt-4 rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-violet-500 text-white font-bold border-none"
              >
                {PHASES_ORDER.indexOf(state.phase) < PHASES_ORDER.length - 1
                  ? `${PHASE_CONFIG[PHASES_ORDER[PHASES_ORDER.indexOf(state.phase) + 1]].label}へ進む`
                  : "最終結果を見る"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 最終結果 */}
        {state.status === "complete" && (
          <Card className="bg-gradient-to-r from-violet-50 to-pink-50 dark:from-violet-950/20 dark:to-pink-950/20 mt-4">
            <CardContent className="pt-2">
              <div className="text-xs font-bold text-violet-500 mb-2">
                総合評価
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">
                {state.finalEvaluation}
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={() => router.push("/")}
                  variant="outline"
                  className="rounded-full"
                >
                  もう一回やる
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 入力エリア */}
      {state.status === "interviewing" && (
        <div className="border-t bg-card px-4 py-3">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="回答を入力..."
              disabled={streaming}
              rows={1}
              className="flex-1 resize-none rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-50"
            />
            <Button
              onClick={handleSend}
              disabled={streaming || !input.trim()}
              className="rounded-xl bg-pink-500 hover:bg-pink-600 text-white border-none px-4"
            >
              送信
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Enterで送信 / Shift+Enterで改行
          </p>
        </div>
      )}
    </div>
  );
}
