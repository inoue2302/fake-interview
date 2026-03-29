"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { readStreamableValue } from "@ai-sdk/rsc";
import {
  chat,
  evaluate,
  finalEvaluate,
} from "@/app/actions/interview";
import { PHASE_CONFIG, PHASES_ORDER, type InterviewPhase } from "@/data/prompts";
import type { Situation } from "@/data/situations";
import { useInterviewStore } from "@/store/interview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Message = { role: "user" | "assistant"; content: string };

type InterviewState =
  | { status: "interviewing"; phase: InterviewPhase; questionIndex: number }
  | { status: "closing"; phase: InterviewPhase }
  | { status: "evaluating"; phase: InterviewPhase }
;

type Props = {
  companyType: string;
  companySize: string;
  situation: Situation;
  startPhase?: InterviewPhase | "final-evaluate";
};

export default function InterviewChat({
  companyType,
  companySize,
  situation,
  startPhase: initialPhase = "first",
}: Props) {
  const router = useRouter();
  const store = useInterviewStore();

  const [state, setState] = useState<InterviewState>({
    status: "interviewing",
    phase: initialPhase === "final-evaluate" ? "final" : initialPhase,
    questionIndex: 0,
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [allMessages, setAllMessages] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const evaluatingRef = useRef(false);
  const closingRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  const startPhaseHandler = useCallback(
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
      const phase = initialPhase === "final-evaluate" ? "final" as InterviewPhase : initialPhase;
      startPhaseHandler(phase);
    }
  }, [startPhaseHandler, initialPhase]);

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

    // 最後の回答の場合、面接官に新しい質問をさせないよう指示を追加
    const isLastAnswer = questionIndex >= config.questionsCount;
    const chatMessages = isLastAnswer
      ? [
          ...newMessages,
          {
            role: "user" as const,
            content:
              "[システム指示] これが最後の回答です。新しい質問はせず、回答への短い感想だけ1〜2行で返してください。",
          },
        ]
      : newMessages;

    const { text } = await chat(
      phase,
      companyType,
      companySize,
      situation,
      chatMessages
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

    if (isLastAnswer) {
      setAllMessages((prev) => ({ ...prev, [phase]: updatedMessages }));
      store.savePhaseMessages(phase, updatedMessages);
      setState({ status: "closing", phase });
    } else {
      setState({
        status: "interviewing",
        phase,
        questionIndex: questionIndex + 1,
      });
    }
  };

  // 締めの挨拶（固定テキスト）を表示
  useEffect(() => {
    if (state.status !== "closing") return;
    if (closingRef.current) return;
    closingRef.current = true;

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content:
          "本日はお時間いただきありがとうございました。結果は追ってご連絡いたします。",
      },
    ]);
  }, [state]);

  // 「結果を見る」ボタン押下 → 評価実行
  const handleViewResult = () => {
    if (state.status !== "closing") return;
    const { phase } = state;
    evaluatingRef.current = false;
    setState({ status: "evaluating", phase });
  };

  // 評価実行（非ストリーミング → 結果ページへ遷移）
  useEffect(() => {
    if (state.status !== "evaluating") return;
    if (evaluatingRef.current) return;
    evaluatingRef.current = true;

    const { phase } = state;
    const phaseMessages = allMessages[phase] ?? messages;

    (async () => {
      setStreaming(true);

      const resultData = await evaluate(
        phase,
        companyType,
        companySize,
        situation,
        phaseMessages
      );

      setStreaming(false);

      // LangGraphの条件エッジによる分岐結果をstoreに保存して結果ページへ
      switch (resultData.outcome) {
        case "fail":
          store.setResult({
            status: "failed",
            phase: PHASE_CONFIG[phase].label,
            evaluation: resultData.evaluation,
          });
          router.push("/result");
          break;
        case "skip_to_ceo":
          store.setResult({
            status: "passed",
            phase: PHASE_CONFIG[phase].label,
            evaluation: resultData.evaluation,
            nextPhase: "ceo",
            skipToCeo: true,
          });
          router.push("/result");
          break;
        case "final_evaluate":
        case "ceo_complete": {
          // 最終面接 or CEO面接通過 → 直接最終評価を実行
          const finalEvalText = await finalEvaluate(
            companyType,
            companySize,
            situation,
            { ...allMessages, [phase]: phaseMessages }
          );
          store.setResult({
            status: "complete",
            phase: "総合",
            evaluation: finalEvalText,
            isCeoRoute: resultData.outcome === "ceo_complete",
          });
          router.push("/result");
          break;
        }
        default:
          store.setResult({
            status: "passed",
            phase: PHASE_CONFIG[phase].label,
            evaluation: resultData.evaluation,
            nextPhase: resultData.nextPhase,
          });
          router.push("/result");
          break;
      }
    })();
  }, [state, allMessages, messages, companyType, companySize, situation, store, router]);

  const currentPhase =
    state.status === "interviewing" ||
    state.status === "closing" ||
    state.status === "evaluating"
      ? state.phase
      : "final";

  const phaseConfig = PHASE_CONFIG[currentPhase];

  // 社長面接中かどうか
  const isInCeoInterview =
    state.status === "interviewing" && state.phase === "ceo";
  const isCeoEval = false;

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      {/* ヘッダー */}
      <header className="border-b bg-card px-4 py-3">
        {/* フェーズ名 + 面接官情報 */}
        <div className="mb-2">
          {isInCeoInterview || isCeoEval ? (
            <h1 className="font-bold text-lg">
              ⭐ {PHASE_CONFIG.ceo.label}
              <span className="text-xs font-normal text-muted-foreground ml-2">
                {PHASE_CONFIG.ceo.subtitle} ― {PHASE_CONFIG.ceo.role}
              </span>
            </h1>
          ) : (
            <h1 className="font-bold text-lg">
              {phaseConfig.label}
              <span className="text-xs font-normal text-muted-foreground ml-2">
                {phaseConfig.subtitle} ― {phaseConfig.role}
              </span>
            </h1>
          )}
        </div>
        {/* プログレスバー */}
        <div className="flex items-center gap-1">
          {PHASES_ORDER.map((p, i) => {
            const idx = PHASES_ORDER.indexOf(currentPhase);
            const isActive = i <= idx;
            const isCurrent = i === idx;
            const isFailed = false;
            const showCeo =
              isInCeoInterview ||
              isCeoEval ||
              false;
            return (
              <div key={p} className="flex items-center gap-1 flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-full h-2 rounded-full transition-all ${
                      isFailed
                        ? "bg-red-400"
                        : isCurrent
                          ? "bg-pink-500"
                          : isActive
                            ? "bg-pink-300"
                            : "bg-muted"
                    }`}
                  />
                  <span
                    className={`text-[10px] mt-1 transition-colors ${
                      isFailed
                        ? "text-red-500 font-bold"
                        : isCurrent
                          ? "text-pink-500 font-bold"
                          : isActive
                            ? "text-muted-foreground"
                            : "text-muted-foreground/40"
                    }`}
                  >
                    {PHASE_CONFIG[p].label}
                  </span>
                </div>
                {/* 社長面接ルートの特別バー（最後のフェーズの後に表示） */}
                {i === PHASES_ORDER.length - 1 && showCeo && (
                  <div className="flex flex-col items-center flex-1">
                    <div className="w-full h-2 rounded-full bg-yellow-400" />
                    <span className="text-[10px] mt-1 text-yellow-600 font-bold">
                      社長面接
                    </span>
                  </div>
                )}
              </div>
            );
          })}
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
                {isInCeoInterview
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

      {/* 結果を見るボタン */}
      {state.status === "closing" && (
        <div className="border-t bg-card px-4 py-4">
          <Button
            onClick={handleViewResult}
            className="w-full rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-violet-500 text-white py-5 font-bold border-none shadow-lg shadow-pink-200/50"
          >
            結果を見る
          </Button>
        </div>
      )}

      {/* 評価中のローディング */}
      {state.status === "evaluating" && (
        <div className="border-t bg-card px-4 py-4 text-center">
          <p className="text-sm text-muted-foreground animate-pulse">
            評価中です...
          </p>
        </div>
      )}
    </div>
  );
}
