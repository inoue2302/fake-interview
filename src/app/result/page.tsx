"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PHASE_CONFIG, type InterviewPhase } from "@/data/prompts";
import { useInterviewStore } from "@/store/interview";

export default function ResultPage() {
  const router = useRouter();
  const {
    resultStatus,
    resultPhase,
    evaluation,
    nextPhase,
    skipToCeo,
    isCeoRoute,
    setCurrentPhase,
  } = useInterviewStore();

  useEffect(() => {
    if (!resultStatus) {
      router.replace("/");
    }
  }, [resultStatus, router]);

  if (!resultStatus || !evaluation) return null;

  const isFailed = resultStatus === "failed";
  const isPassed = resultStatus === "passed";
  const isComplete = resultStatus === "complete";

  const handleNextPhase = () => {
    if (!nextPhase) return;
    setCurrentPhase(nextPhase);
    router.push("/interview");
  };

  const handleFinalEvaluate = () => {
    setCurrentPhase("final");
    router.push("/interview?final=true");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-16">
      <div className="w-full max-w-lg">
        {/* タイトル */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">
            {isFailed
              ? "😢"
              : skipToCeo
                ? "🌟"
                : isPassed
                  ? "✅"
                  : isCeoRoute
                    ? "🌟"
                    : "🎉"}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            {isFailed
              ? "面接結果"
              : skipToCeo
                ? "特別選考ルート"
                : isPassed
                  ? `${resultPhase} 通過！`
                  : isCeoRoute
                    ? "特別選考結果"
                    : "最終結果"}
          </h1>
          {isFailed && resultPhase && (
            <p className="text-muted-foreground text-sm">
              {resultPhase}で選考終了となりました
            </p>
          )}
          {isPassed && !skipToCeo && nextPhase && (
            <p className="text-muted-foreground text-sm">
              次は{PHASE_CONFIG[nextPhase].label}です
            </p>
          )}
        </div>

        {/* 結果カード */}
        <Card
          className={
            isFailed
              ? "bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20"
              : skipToCeo || isCeoRoute
                ? "bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 ring-2 ring-yellow-300"
                : isPassed
                  ? "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20"
                  : "bg-gradient-to-r from-violet-50 to-pink-50 dark:from-violet-950/20 dark:to-pink-950/20"
          }
        >
          <CardContent className="pt-4">
            <div
              className={`text-xs font-bold mb-3 ${
                isFailed
                  ? "text-red-500"
                  : skipToCeo || isCeoRoute
                    ? "text-yellow-600"
                    : isPassed
                      ? "text-green-600"
                      : "text-violet-500"
              }`}
            >
              {isFailed
                ? "選考結果"
                : skipToCeo
                  ? "⭐ 特別選考"
                  : isPassed
                    ? `${resultPhase}の評価`
                    : isCeoRoute
                      ? "⭐ 社長からの総合評価"
                      : "総合評価"}
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {evaluation}
            </div>
          </CardContent>
        </Card>

        {/* 社長面接スキップの説明 */}
        {skipToCeo && (
          <Card className="mt-4 bg-yellow-100 dark:bg-yellow-900/30">
            <CardContent className="pt-4">
              <p className="font-bold text-yellow-800 dark:text-yellow-300 text-sm">
                あなたの回答が非常に高く評価されました。
              </p>
              <p className="text-yellow-700 dark:text-yellow-400 mt-1 text-sm">
                通常の選考フローを飛ばして、社長が直接面接したいとのことです。
              </p>
            </CardContent>
          </Card>
        )}

        {/* アクション */}
        <div className="flex flex-col items-center gap-3 mt-8">
          {isPassed && nextPhase && (
            <Button
              onClick={handleNextPhase}
              className="rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-violet-500 text-white px-8 py-5 font-bold border-none shadow-lg shadow-pink-200/50"
            >
              {skipToCeo
                ? "⭐ 社長面接へ"
                : `${PHASE_CONFIG[nextPhase].label}へ進む`}
            </Button>
          )}

          {isPassed && !nextPhase && (
            <Button
              onClick={handleFinalEvaluate}
              className="rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-violet-500 text-white px-8 py-5 font-bold border-none shadow-lg shadow-pink-200/50"
            >
              最終結果を見る
            </Button>
          )}

          {(isFailed || isComplete) && (
            <Button
              onClick={() => router.push("/")}
              className="rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-violet-500 text-white px-8 py-5 font-bold border-none shadow-lg shadow-pink-200/50"
            >
              {isFailed ? "もう一回チャレンジ" : "もう一回やる"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
