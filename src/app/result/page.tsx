"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function ResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const evaluation = decodeURIComponent(searchParams.get("evaluation") ?? "");
  const isCeoRoute = searchParams.get("ceo") === "true";
  const status = searchParams.get("status") ?? "complete"; // "complete" | "failed"
  const phase = searchParams.get("phase") ?? "";

  if (!evaluation) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">結果がありません</p>
      </div>
    );
  }

  const isFailed = status === "failed";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-16">
      <div className="w-full max-w-lg">
        {/* タイトル */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">
            {isFailed ? "😢" : isCeoRoute ? "🌟" : "🎉"}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            {isFailed ? "面接結果" : isCeoRoute ? "特別選考結果" : "最終結果"}
          </h1>
          {isFailed && phase && (
            <p className="text-muted-foreground text-sm">
              {phase}で選考終了となりました
            </p>
          )}
        </div>

        {/* 結果カード */}
        <Card
          className={
            isFailed
              ? "bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20"
              : isCeoRoute
                ? "bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 ring-2 ring-yellow-300"
                : "bg-gradient-to-r from-violet-50 to-pink-50 dark:from-violet-950/20 dark:to-pink-950/20"
          }
        >
          <CardContent className="pt-4">
            <div
              className={`text-xs font-bold mb-3 ${
                isFailed
                  ? "text-red-500"
                  : isCeoRoute
                    ? "text-yellow-600"
                    : "text-violet-500"
              }`}
            >
              {isFailed
                ? "選考結果"
                : isCeoRoute
                  ? "⭐ 社長からの総合評価"
                  : "総合評価"}
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {evaluation}
            </div>
          </CardContent>
        </Card>

        {/* アクション */}
        <div className="flex flex-col items-center gap-3 mt-8">
          <Button
            onClick={() => router.push("/")}
            className="rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-violet-500 text-white px-8 py-5 font-bold border-none shadow-lg shadow-pink-200/50"
          >
            {isFailed ? "もう一回チャレンジ" : "もう一回やる"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      }
    >
      <ResultContent />
    </Suspense>
  );
}
