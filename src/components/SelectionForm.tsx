"use client";

import { useState } from "react";
import {
  COMPANY_TYPES,
  type CompanyTypeId,
  type CompanySizeId,
} from "@/types/interview";

const STEP_LABELS = ["会社タイプ", "規模感", "確認"] as const;
const STEPS = ["type", "size", "confirm"] as const;

export default function SelectionForm() {
  const [step, setStep] = useState<"type" | "size" | "confirm">("type");
  const [companyType, setCompanyType] = useState<CompanyTypeId | null>(null);
  const [companySize, setCompanySize] = useState<CompanySizeId | null>(null);

  const selectedType = COMPANY_TYPES.find((t) => t.id === companyType);
  const selectedSize = selectedType?.sizes.find((s) => s.id === companySize);
  const currentIndex = STEPS.indexOf(step);

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      {/* ステップインジケーター */}
      <div className="flex items-center justify-center gap-2 mb-10">
        {STEP_LABELS.map((label, i) => {
          const isActive = currentIndex >= i;
          const isCurrent = currentIndex === i;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`w-8 h-0.5 rounded-full transition-colors ${isActive ? "bg-pink-400" : "bg-zinc-200"}`}
                />
              )}
              <div
                className={`text-sm font-bold transition-colors ${
                  isCurrent
                    ? "text-pink-500"
                    : isActive
                      ? "text-zinc-700"
                      : "text-zinc-300"
                }`}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Step 1: 会社タイプ選択 */}
      {step === "type" && (
        <div>
          <h2 className="text-2xl font-extrabold text-center mb-1">
            どんな会社を受ける？ 🏢
          </h2>
          <p className="text-zinc-400 text-center text-sm mb-8">
            会社タイプで面接官のキャラが変わるよ！
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COMPANY_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => {
                  setCompanyType(type.id);
                  setCompanySize(null);
                  setStep("size");
                }}
                className="group flex flex-col items-start gap-1 rounded-2xl border-2 border-zinc-100 bg-white p-5 text-left transition-all hover:border-pink-300 hover:shadow-lg hover:shadow-pink-100/50 hover:-translate-y-0.5 active:translate-y-0"
              >
                <span className="text-3xl mb-1">{type.emoji}</span>
                <span className="font-bold text-zinc-800 group-hover:text-pink-600">
                  {type.label}
                </span>
                <span className="text-sm text-zinc-400">
                  {type.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: 規模感選択 */}
      {step === "size" && selectedType && (
        <div>
          <h2 className="text-2xl font-extrabold text-center mb-1">
            会社の規模は？ 👥
          </h2>
          <p className="text-zinc-400 text-center text-sm mb-8">
            規模で質問の雰囲気が変わるよ！
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {selectedType.sizes.map((size) => (
              <button
                key={size.id}
                onClick={() => {
                  setCompanySize(size.id);
                  setStep("confirm");
                }}
                className="group flex flex-col items-center gap-1 rounded-2xl border-2 border-zinc-100 bg-white p-5 text-center transition-all hover:border-violet-300 hover:shadow-lg hover:shadow-violet-100/50 hover:-translate-y-0.5 active:translate-y-0"
              >
                <span className="font-bold text-zinc-800 group-hover:text-violet-600">
                  {size.label}
                </span>
                <span className="text-sm text-zinc-400">
                  {size.description}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setStep("type")}
            className="mt-6 text-sm text-zinc-300 hover:text-pink-400 mx-auto block transition-colors"
          >
            ← 戻る
          </button>
        </div>
      )}

      {/* Step 3: 確認 */}
      {step === "confirm" && selectedType && selectedSize && (
        <div className="text-center">
          <h2 className="text-2xl font-extrabold mb-2">
            準備OK？ ✨
          </h2>
          <p className="text-zinc-400 text-sm mb-8">
            この内容で面接スタート！
          </p>
          <div className="inline-flex flex-col gap-4 rounded-2xl border-2 border-zinc-100 bg-white p-8 mb-8 shadow-sm">
            <div className="flex items-center gap-4">
              <span className="text-3xl">{selectedType.emoji}</span>
              <div className="text-left">
                <div className="text-xs font-bold text-pink-400">
                  会社タイプ
                </div>
                <div className="font-bold text-zinc-800">
                  {selectedType.label}
                </div>
              </div>
            </div>
            <div className="h-px bg-zinc-100" />
            <div className="flex items-center gap-4">
              <span className="text-3xl">👥</span>
              <div className="text-left">
                <div className="text-xs font-bold text-violet-400">
                  規模感
                </div>
                <div className="font-bold text-zinc-800">
                  {selectedSize.label}（{selectedSize.description}）
                </div>
              </div>
            </div>
          </div>
          <div>
            <button className="rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-violet-500 text-white px-10 py-3.5 font-bold text-base shadow-lg shadow-pink-200/50 transition hover:shadow-xl hover:shadow-pink-300/50 hover:-translate-y-0.5 active:translate-y-0">
              面接をはじめる 🎤
            </button>
          </div>
          <button
            onClick={() => setStep("size")}
            className="mt-5 text-sm text-zinc-300 hover:text-violet-400 transition-colors"
          >
            ← 戻る
          </button>
        </div>
      )}
    </div>
  );
}
