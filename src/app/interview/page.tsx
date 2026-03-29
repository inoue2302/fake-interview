"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import InterviewChat from "@/components/InterviewChat";
import { useInterviewStore } from "@/store/interview";

export default function InterviewPage() {
  const router = useRouter();
  const { companyType, companySize, situation, currentPhase } =
    useInterviewStore();

  useEffect(() => {
    if (!situation) {
      router.replace("/");
    }
  }, [situation, router]);

  if (!situation) return null;

  return (
    <InterviewChat
      companyType={companyType}
      companySize={companySize}
      situation={situation}
      startPhase={currentPhase}
    />
  );
}
