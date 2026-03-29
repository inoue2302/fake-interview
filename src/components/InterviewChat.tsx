"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { readStreamableValue } from "@ai-sdk/rsc";
import {
  chat,
  evaluate,
  finalEvaluate,
  ceoEvaluate,
  type EvaluateResult,
} from "@/app/actions/interview";
import { PHASE_CONFIG, PHASES_ORDER, type InterviewPhase } from "@/data/prompts";
import type { Situation } from "@/data/situations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Message = { role: "user" | "assistant"; content: string };

type PhaseResultData = {
  evaluation: string;
  passed: boolean;
  score: number;
  nextPhase: InterviewPhase | null;
  skipToCeo: boolean;
};

type InterviewState =
  | { status: "interviewing"; phase: InterviewPhase; questionIndex: number }
  | { status: "evaluating"; phase: InterviewPhase }
  | { status: "phase-result"; phase: InterviewPhase; result: PhaseResultData }
  | { status: "ceo-skip-announcement"; fromPhase: InterviewPhase; score: number; evaluation: string }
  | { status: "final-evaluating" }
  | { status: "ceo-evaluating" }
  | { status: "failed"; phase: InterviewPhase; evaluation: string }
  | { status: "complete"; finalEvaluation: string; isCeoRoute: boolean };

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
      if (phase === "ceo") {
        setState({ status: "ceo-evaluating" });
      } else {
        setState({ status: "evaluating", phase });
      }
    } else {
      setState({
        status: "interviewing",
        phase,
        questionIndex: questionIndex + 1,
      });
    }
  };

  // 評価実行
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
        phaseMessages
      );

      let evalText = "";
      for await (const chunk of readStreamableValue(text)) {
        if (chunk) {
          evalText = chunk;
          setStreamingText(evalText);
        }
      }

      let resultData: EvaluateResult = {
        passed: false,
        score: 5,
        nextPhase: null,
        skipToCeo: false,
        outcome: "fail",
      };
      for await (const chunk of readStreamableValue(result)) {
        if (chunk) resultData = chunk;
      }

      setStreamingText("");
      setStreaming(false);

      // LangGraphの条件エッジによる分岐結果で状態遷移
      switch (resultData.outcome) {
        case "fail":
          setState({ status: "failed", phase, evaluation: evalText });
          break;
        case "skip_to_ceo":
          setState({
            status: "ceo-skip-announcement",
            fromPhase: phase,
            score: resultData.score,
            evaluation: evalText,
          });
          break;
        default:
          setState({
            status: "phase-result",
            phase,
            result: {
              evaluation: evalText,
              passed: true,
              score: resultData.score,
              nextPhase: resultData.nextPhase,
              skipToCeo: resultData.skipToCeo,
            },
          });
          break;
      }
    })();
  }, [state, allMessages, messages, companyType, companySize, situation]);

  const handleNextPhase = () => {
    if (state.status !== "phase-result") return;

    const { result } = state;
    if (result.nextPhase) {
      setMessages([]);
      startPhase(result.nextPhase);
    } else {
      setState({ status: "final-evaluating" });
    }
  };

  // 社長面接へスキップ
  const handleSkipToCeo = () => {
    setMessages([]);
    startPhase("ceo");
  };

  // 最終評価
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
      setState({ status: "complete", finalEvaluation: accumulated, isCeoRoute: false });
    })();
  }, [state, allMessages, companyType, companySize, situation]);

  // 社長面接の評価
  useEffect(() => {
    if (state.status !== "ceo-evaluating") return;

    const ceoMessages = allMessages["ceo"] ?? [];

    (async () => {
      setStreaming(true);
      setStreamingText("");

      const { text } = await ceoEvaluate(
        companyType,
        companySize,
        situation,
        ceoMessages
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
      setState({ status: "complete", finalEvaluation: accumulated, isCeoRoute: true });
    })();
  }, [state, allMessages, companyType, companySize, situation]);

  const currentPhase =
    state.status === "interviewing" || state.status === "evaluating"
      ? state.phase
      : state.status === "phase-result" || state.status === "failed"
        ? state.phase
        : state.status === "ceo-skip-announcement"
          ? state.fromPhase
          : "final";

  const phaseConfig = PHASE_CONFIG[currentPhase];

  // 社長面接中かどうか
  const isInCeoInterview =
    state.status === "interviewing" && state.phase === "ceo";
  const isCeoEval = state.status === "ceo-evaluating";

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      {/* ヘッダー */}
      <header className="border-b bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            {isInCeoInterview || isCeoEval ? (
              <>
                <h1 className="font-bold text-lg">
                  ⭐ {PHASE_CONFIG.ceo.label}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {PHASE_CONFIG.ceo.subtitle} ― {PHASE_CONFIG.ceo.role}
                </p>
              </>
            ) : (
              <>
                <h1 className="font-bold text-lg">{phaseConfig.label}</h1>
                <p className="text-xs text-muted-foreground">
                  {phaseConfig.subtitle} ― {phaseConfig.role}
                </p>
              </>
            )}
          </div>
          <div className="flex gap-1">
            {PHASES_ORDER.map((p) => {
              const idx = PHASES_ORDER.indexOf(currentPhase);
              const pIdx = PHASES_ORDER.indexOf(p);
              const isActive = pIdx <= idx;
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
            {/* 社長面接ルートの場合、特別なインジケーター */}
            {(isInCeoInterview ||
              isCeoEval ||
              state.status === "ceo-skip-announcement" ||
              (state.status === "complete" && state.isCeoRoute)) && (
              <div className="w-8 h-1 rounded-full bg-yellow-400" />
            )}
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
                  {isInCeoInterview
                    ? PHASE_CONFIG.ceo.role
                    : phaseConfig.role}
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
                state.status === "final-evaluating" ||
                state.status === "ceo-evaluating"
                  ? "評価"
                  : isInCeoInterview
                    ? PHASE_CONFIG.ceo.role
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

        {/* 社長面接スキップ演出 */}
        {state.status === "ceo-skip-announcement" && (
          <Card className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 mt-4 ring-2 ring-yellow-300">
            <CardContent className="pt-2">
              <div className="text-xs font-bold text-yellow-600 mb-2">
                ⭐ 特別選考ルート
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed mb-3">
                {state.evaluation}
              </div>
              <div className="bg-yellow-100 dark:bg-yellow-900/30 rounded-lg p-3 text-sm">
                <p className="font-bold text-yellow-800 dark:text-yellow-300">
                  あなたの回答が非常に高く評価されました。
                </p>
                <p className="text-yellow-700 dark:text-yellow-400 mt-1">
                  通常の選考フローを飛ばして、社長が直接面接したいとのことです。
                </p>
              </div>
              <Button
                onClick={handleSkipToCeo}
                className="mt-4 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 text-white font-bold border-none shadow-lg shadow-yellow-200/50"
              >
                ⭐ 社長面接へ
              </Button>
            </CardContent>
          </Card>
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

        {/* 不合格 */}
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
          <Card
            className={`mt-4 ${
              state.isCeoRoute
                ? "bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 ring-2 ring-yellow-300"
                : "bg-gradient-to-r from-violet-50 to-pink-50 dark:from-violet-950/20 dark:to-pink-950/20"
            }`}
          >
            <CardContent className="pt-2">
              <div
                className={`text-xs font-bold mb-2 ${state.isCeoRoute ? "text-yellow-600" : "text-violet-500"}`}
              >
                {state.isCeoRoute ? "⭐ 社長からの総合評価" : "総合評価"}
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex flex-col gap-1.5"
          >
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => {
                  if (e.target.value.length <= 250) setInput(e.target.value);
                }}
                maxLength={250}
                disabled={streaming}
                rows={3}
                placeholder={streaming ? "応答を待っています..." : "回答を入力..."}
                className={`w-full resize-none rounded-xl border bg-background px-4 py-3 pr-14 text-sm leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none transition-all ${
                  input.length > 200
                    ? "border-red-400 focus:ring-2 focus:ring-red-300"
                    : "border-border focus:ring-2 focus:ring-pink-300"
                } disabled:opacity-50`}
              />
              <button
                type="submit"
                disabled={streaming || !input.trim() || input.length > 200}
                className="absolute right-2 top-2 rounded-lg bg-pink-500 p-2 text-white transition-all hover:bg-pink-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                aria-label="送信"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </button>
            </div>
            {input.length > 200 && (
              <p className="text-xs text-red-400">
                200文字以内で入力してください
              </p>
            )}
            <div className="flex justify-between">
              <p className="text-[10px] text-muted-foreground">
                送信ボタンで回答
              </p>
              {input.length > 0 && (
                <p className={`text-[10px] ${input.length > 200 ? "text-red-400" : "text-muted-foreground"}`}>
                  {input.length}/200
                </p>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
