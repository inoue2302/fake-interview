"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { readStreamableValue } from "@ai-sdk/rsc";
import { chat, evaluate, finalEvaluate } from "@/app/actions/interview";
import { PHASE_CONFIG, PHASES_ORDER, type InterviewPhase } from "@/data/prompts";
import type { Situation } from "@/data/situations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Message = { role: "user" | "assistant"; content: string };

type PhaseResultData = {
  evaluation: string;
  passed: boolean;
  nextPhase: InterviewPhase | null;
};

type InterviewState =
  | { status: "interviewing"; phase: InterviewPhase; questionIndex: number }
  | { status: "evaluating"; phase: InterviewPhase }
  | { status: "phase-result"; phase: InterviewPhase; result: PhaseResultData }
  | { status: "final-evaluating" }
  | { status: "failed"; phase: InterviewPhase; evaluation: string }
  | { status: "complete"; finalEvaluation: string };

type Props = {
  companyType: string;
  companySize: string;
  situation: Situation;
};

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
  const [phaseResults, setPhaseResults] = useState<
    { phase: string; passed: boolean }[]
  >([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  // フェーズ開始時の面接官の最初の発言
  const startPhase = useCallback(
    async (phase: InterviewPhase) => {
      setStreaming(true);
      setStreamingText("");

      const { text } = await chat(phase, companyType, companySize, situation, []);

      let accumulated = "";
      for await (const chunk of readStreamableValue(text)) {
        if (chunk) {
          accumulated = chunk;
          setStreamingText(accumulated);
        }
      }

      setMessages([{ role: "assistant", content: accumulated }]);
      setStreamingText("");
      setStreaming(false);
      setState({ status: "interviewing", phase, questionIndex: 1 });
    },
    [companyType, companySize, situation]
  );

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

    const { text } = await chat(
      phase,
      companyType,
      companySize,
      situation,
      newMessages
    );

    let accumulated = "";
    for await (const chunk of readStreamableValue(text)) {
      if (chunk) {
        accumulated = chunk;
        setStreamingText(accumulated);
      }
    }

    const updatedMessages = [
      ...newMessages,
      { role: "assistant" as const, content: accumulated },
    ];
    setMessages(updatedMessages);
    setStreamingText("");
    setStreaming(false);

    if (questionIndex >= config.questionsCount) {
      setAllMessages((prev) => ({ ...prev, [phase]: updatedMessages }));
      setState({ status: "evaluating", phase });
    } else {
      setState({
        status: "interviewing",
        phase,
        questionIndex: questionIndex + 1,
      });
    }
  };

  // 評価実行（LangGraphの条件エッジで合否分岐）
  useEffect(() => {
    if (state.status !== "evaluating") return;

    const { phase } = state;
    const phaseMessages = allMessages[phase] ?? messages;

    (async () => {
      setStreaming(true);
      setStreamingText("");

      const { text, result } = await evaluate(
        phase,
        companyType,
        companySize,
        situation,
        phaseMessages,
        phaseResults
      );

      // ストリーミングで評価テキストを表示
      let evalText = "";
      for await (const chunk of readStreamableValue(text)) {
        if (chunk) {
          evalText = chunk;
          setStreamingText(evalText);
        }
      }

      // 合否結果を取得
      let resultData: { passed: boolean; nextPhase: InterviewPhase | null } = {
        passed: false,
        nextPhase: null,
      };
      for await (const chunk of readStreamableValue(result)) {
        if (chunk) resultData = chunk;
      }

      setPhaseResults((prev) => [
        ...prev,
        { phase, passed: resultData.passed },
      ]);
      setStreamingText("");
      setStreaming(false);

      if (!resultData.passed) {
        // 条件エッジ: 不合格 → fail_end
        setState({ status: "failed", phase, evaluation: evalText });
      } else {
        setState({
          status: "phase-result",
          phase,
          result: {
            evaluation: evalText,
            passed: true,
            nextPhase: resultData.nextPhase,
          },
        });
      }
    })();
  }, [
    state,
    allMessages,
    messages,
    companyType,
    companySize,
    situation,
    phaseResults,
  ]);

  // 次のフェーズへ or 最終評価へ
  const handleNextPhase = () => {
    if (state.status !== "phase-result") return;

    const { result } = state;
    if (result.nextPhase) {
      // 条件エッジ: 合格 → advance_phase → 次の面接
      setMessages([]);
      startPhase(result.nextPhase);
    } else {
      // 条件エッジ: 最終面接通過 → final_evaluate
      setState({ status: "final-evaluating" });
    }
  };

  // 最終評価実行
  useEffect(() => {
    if (state.status !== "final-evaluating") return;

    (async () => {
      setStreaming(true);
      setStreamingText("");

      const { text } = await finalEvaluate(
        companyType,
        companySize,
        situation,
        allMessages
      );

      let accumulated = "";
      for await (const chunk of readStreamableValue(text)) {
        if (chunk) {
          accumulated = chunk;
          setStreamingText(accumulated);
        }
      }

      setStreamingText("");
      setStreaming(false);
      setState({ status: "complete", finalEvaluation: accumulated });
    })();
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
      : state.status === "phase-result" || state.status === "failed"
        ? state.phase
        : "final";

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
              // 不合格フェーズは赤色に
              const isFailed =
                state.status === "failed" && p === state.phase;
              return (
                <div
                  key={p}
                  className={`w-8 h-1 rounded-full ${
                    isFailed
                      ? "bg-red-400"
                      : isActive
                        ? "bg-pink-400"
                        : "bg-muted"
                  }`}
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
                {state.status === "evaluating" ||
                state.status === "final-evaluating"
                  ? "評価"
                  : phaseConfig.role}
              </div>
              <div className="whitespace-pre-wrap">{streamingText}</div>
            </div>
          </div>
        )}

        {/* タイピングインジケーター */}
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

        {/* フェーズ結果（通過） */}
        {state.status === "phase-result" && (
          <Card className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 mt-4">
            <CardContent className="pt-2">
              <div className="text-xs font-bold text-green-600 mb-2">
                {PHASE_CONFIG[state.phase].label} ― 通過！
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">
                {state.result.evaluation}
              </div>
              <Button
                onClick={handleNextPhase}
                className="mt-4 rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-violet-500 text-white font-bold border-none"
              >
                {state.result.nextPhase
                  ? `${PHASE_CONFIG[state.result.nextPhase].label}へ進む`
                  : "最終結果を見る"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* フェーズ結果（不合格） */}
        {state.status === "failed" && (
          <Card className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 mt-4">
            <CardContent className="pt-2">
              <div className="text-xs font-bold text-red-500 mb-2">
                {PHASE_CONFIG[state.phase].label} ― 不通過
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">
                {state.evaluation}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                残念ながらここで面接終了です。
              </p>
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={() => router.push("/")}
                  variant="outline"
                  className="rounded-full"
                >
                  もう一回チャレンジ
                </Button>
              </div>
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
