import { create } from "zustand";
import type { InterviewPhase } from "@/data/prompts";
import type { Situation } from "@/data/situations";

type Message = { role: "user" | "assistant"; content: string };

type InterviewStore = {
  // 設定
  companyType: string;
  companySize: string;
  situation: Situation | null;

  // 面接状態
  currentPhase: InterviewPhase;
  allMessages: Record<string, Message[]>;

  // 結果
  resultStatus: "passed" | "failed" | "complete" | "evaluating" | null;
  resultPhase: string;
  evaluation: string;
  nextPhase: InterviewPhase | null;
  skipToCeo: boolean;
  isCeoRoute: boolean;

  // アクション
  setConfig: (
    companyType: string,
    companySize: string,
    situation: Situation
  ) => void;
  setCurrentPhase: (phase: InterviewPhase) => void;
  savePhaseMessages: (phase: string, messages: Message[]) => void;
  setResult: (result: {
    status: "passed" | "failed" | "complete" | "evaluating";
    phase: string;
    evaluation: string;
    nextPhase?: InterviewPhase | null;
    skipToCeo?: boolean;
    isCeoRoute?: boolean;
  }) => void;
  reset: () => void;
};

export const useInterviewStore = create<InterviewStore>((set) => ({
  companyType: "",
  companySize: "",
  situation: null,
  currentPhase: "first",
  allMessages: {},
  resultStatus: null,
  resultPhase: "",
  evaluation: "",
  nextPhase: null,
  skipToCeo: false,
  isCeoRoute: false,

  setConfig: (companyType, companySize, situation) =>
    set({ companyType, companySize, situation }),

  setCurrentPhase: (phase) => set({ currentPhase: phase }),

  savePhaseMessages: (phase, messages) =>
    set((state) => ({
      allMessages: { ...state.allMessages, [phase]: messages },
    })),

  setResult: (result) =>
    set({
      resultStatus: result.status,
      resultPhase: result.phase,
      evaluation: result.evaluation,
      nextPhase: result.nextPhase ?? null,
      skipToCeo: result.skipToCeo ?? false,
      isCeoRoute: result.isCeoRoute ?? false,
    }),

  reset: () =>
    set({
      companyType: "",
      companySize: "",
      situation: null,
      currentPhase: "first",
      allMessages: {},
      resultStatus: null,
      resultPhase: "",
      evaluation: "",
      nextPhase: null,
      skipToCeo: false,
      isCeoRoute: false,
    }),
}));
