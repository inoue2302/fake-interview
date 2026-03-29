"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useInterviewStore } from "@/store/interview";
import {
  COMPANY_TYPES,
  type CompanyTypeId,
  type CompanySizeId,
} from "@/types/interview";
import { generateSituation, type Situation } from "@/data/situations";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STEP_LABELS = ["会社タイプ", "規模感", "確認"] as const;
const STEPS = ["type", "size", "confirm"] as const;

export default function SelectionForm() {
  const router = useRouter();
  const { setConfig, reset } = useInterviewStore();
  const [step, setStep] = useState<"type" | "size" | "confirm">("type");
  const [companyType, setCompanyType] = useState<CompanyTypeId | null>(null);
  const [companySize, setCompanySize] = useState<CompanySizeId | null>(null);
  const [situation, setSituation] = useState<Situation | null>(null);

  const selectedType = COMPANY_TYPES.find((t) => t.id === companyType);
  const selectedSize = selectedType?.sizes.find((s) => s.id === companySize);
  const currentIndex = STEPS.indexOf(step);

  const handleShuffle = useCallback(() => {
    if (companyType) {
      setSituation(generateSituation(companyType));
    }
  }, [companyType]);

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      {/* ステップインジケーター */}
      <div className="flex items-center justify-center gap-0 mb-10">
        {STEP_LABELS.map((label, i) => {
          const isActive = currentIndex >= i;
          const isCurrent = currentIndex === i;
          return (
            <div key={label} className="flex items-center">
              {i > 0 && (
                <div
                  className={`w-10 h-0.5 transition-colors ${isActive ? "bg-pink-400" : "bg-muted"}`}
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    isCurrent
                      ? "bg-pink-500 text-white shadow-md shadow-pink-200"
                      : isActive
                        ? "bg-pink-100 text-pink-600"
                        : "bg-muted text-muted-foreground/40"
                  }`}
                >
                  {i + 1}
                </div>
                <span
                  className={`text-[10px] font-bold transition-colors ${
                    isCurrent
                      ? "text-pink-500"
                      : isActive
                        ? "text-foreground"
                        : "text-muted-foreground/40"
                  }`}
                >
                  {label}
                </span>
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
          <p className="text-muted-foreground text-center text-sm mb-8">
            会社タイプで面接官のキャラが変わるよ！
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COMPANY_TYPES.map((type) => (
              <Card
                key={type.id}
                className="cursor-pointer transition-all hover:border-pink-300 hover:shadow-lg hover:shadow-pink-100/50 hover:-translate-y-0.5 active:translate-y-0"
                onClick={() => {
                  setCompanyType(type.id);
                  setCompanySize(null);
                  setSituation(null);
                  setStep("size");
                }}
              >
                <CardHeader>
                  <span className="text-3xl">{type.emoji}</span>
                  <CardTitle className="group-hover/card:text-pink-600">
                    {type.label}
                  </CardTitle>
                  <CardDescription>{type.description}</CardDescription>
                </CardHeader>
              </Card>
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
          <p className="text-muted-foreground text-center text-sm mb-8">
            規模で質問の雰囲気が変わるよ！
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {selectedType.sizes.map((size) => (
              <Card
                key={size.id}
                className="cursor-pointer text-center transition-all hover:border-violet-300 hover:shadow-lg hover:shadow-violet-100/50 hover:-translate-y-0.5 active:translate-y-0"
                onClick={() => {
                  setCompanySize(size.id);
                  setSituation(generateSituation(selectedType.id));
                  setStep("confirm");
                }}
              >
                <CardHeader className="items-center">
                  <CardTitle className="group-hover/card:text-violet-600">
                    {size.label}
                  </CardTitle>
                  <CardDescription>{size.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
          <Button
            variant="ghost"
            onClick={() => setStep("type")}
            className="mt-6 mx-auto block text-muted-foreground hover:text-pink-400"
          >
            ← 戻る
          </Button>
        </div>
      )}

      {/* Step 3: 確認 */}
      {step === "confirm" && selectedType && selectedSize && situation && (
        <div className="text-center">
          <h2 className="text-2xl font-extrabold mb-2">準備OK？ ✨</h2>
          <p className="text-muted-foreground text-sm mb-8">
            この内容で面接スタート！
          </p>

          {/* 会社タイプ・規模感 */}
          <Card className="inline-flex flex-col mb-4">
            <CardContent className="flex flex-col gap-4 pt-2">
              <div className="flex items-center gap-4">
                <span className="text-3xl">{selectedType.emoji}</span>
                <div className="text-left">
                  <div className="text-xs font-bold text-pink-400">
                    会社タイプ
                  </div>
                  <div className="font-bold">{selectedType.label}</div>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center gap-4">
                <span className="text-3xl">👥</span>
                <div className="text-left">
                  <div className="text-xs font-bold text-violet-400">
                    規模感
                  </div>
                  <div className="font-bold">
                    {selectedSize.label}（{selectedSize.description}）
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* シチュエーション */}
          <Card className="inline-flex flex-col mb-8 text-left">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  今回のシチュエーション
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleShuffle}
                  className="text-muted-foreground hover:text-pink-500"
                >
                  🔀 シャッフル
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <div className="text-xs font-bold text-orange-400 mb-0.5">
                  事業内容
                </div>
                <div className="text-sm">{situation.business}</div>
              </div>
              <div>
                <div className="text-xs font-bold text-pink-400 mb-0.5">
                  募集背景
                </div>
                <div className="text-sm">{situation.hiringReason}</div>
              </div>
              <div>
                <div className="text-xs font-bold text-violet-400 mb-0.5">
                  求める人材像
                </div>
                <div className="text-sm">{situation.desiredTrait}</div>
              </div>
            </CardContent>
          </Card>

          <div>
            <Button
              size="lg"
              onClick={() => {
                reset();
                setConfig(companyType!, companySize!, situation!);
                router.push("/interview");
              }}
              className="rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-violet-500 text-white px-10 py-6 font-bold text-base shadow-lg shadow-pink-200/50 hover:shadow-xl hover:shadow-pink-300/50 hover:-translate-y-0.5 active:translate-y-0 border-none"
            >
              面接をはじめる 🎤
            </Button>
          </div>
          <Button
            variant="ghost"
            onClick={() => setStep("size")}
            className="mt-5 text-muted-foreground hover:text-violet-400"
          >
            ← 戻る
          </Button>
        </div>
      )}
    </div>
  );
}
