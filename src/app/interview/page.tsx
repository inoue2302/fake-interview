"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import InterviewChat from "@/components/InterviewChat";
import type { InterviewPhase } from "@/data/prompts";

function InterviewContent() {
  const searchParams = useSearchParams();
  const companyType = searchParams.get("type") ?? "startup";
  const companySize = searchParams.get("size") ?? "small";
  const situationParam = searchParams.get("situation");
  const startPhase = (searchParams.get("startPhase") ?? "first") as InterviewPhase | "final-evaluate";

  const situation = situationParam
    ? JSON.parse(decodeURIComponent(situationParam))
    : { business: "", hiringReason: "", desiredTrait: "" };

  return (
    <InterviewChat
      companyType={companyType}
      companySize={companySize}
      situation={situation}
      startPhase={startPhase}
    />
  );
}

export default function InterviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      }
    >
      <InterviewContent />
    </Suspense>
  );
}
