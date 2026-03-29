import type { Situation } from "./situations";

export type InterviewPhase = "first" | "second" | "final";

export const PHASE_CONFIG = {
  first: {
    label: "一次面接",
    subtitle: "人事面接",
    role: "人事担当",
    questionsCount: 3,
  },
  second: {
    label: "二次面接",
    subtitle: "現場技術面接",
    role: "現場エンジニア",
    questionsCount: 3,
  },
  final: {
    label: "最終面接",
    subtitle: "役員面接",
    role: "役員",
    questionsCount: 3,
  },
} as const;

export const PHASES_ORDER: InterviewPhase[] = ["first", "second", "final"];

type CompanyTypeLabel = {
  label: string;
  tone: string;
};

const COMPANY_TONES: Record<string, CompanyTypeLabel> = {
  startup: {
    label: "スタートアップ",
    tone: "カジュアルでフランクな口調。スピード感を大事にする。敬語は使うが堅くない。",
  },
  "web-venture": {
    label: "Web系ベンチャー",
    tone: "フラットで技術リスペクトのある口調。エンジニアリングの話が好き。",
  },
  "foreign-consulting": {
    label: "外資コンサル",
    tone: "論理的で簡潔な口調。やや圧迫感がある。曖昧な回答には深掘りする。",
  },
  enterprise: {
    label: "大手メーカー・SIer",
    tone: "丁寧で礼儀正しい口調。ルールや手順を重視する。",
  },
};

function buildSituationContext(
  companyType: string,
  companySize: string,
  situation: Situation
): string {
  const company = COMPANY_TONES[companyType] ?? COMPANY_TONES["startup"];
  return `
## 会社情報
- 会社タイプ: ${company.label}
- 規模: ${companySize}
- 事業内容: ${situation.business}
- 募集背景: ${situation.hiringReason}
- 求める人材像: ${situation.desiredTrait}

## 面接官の口調
${company.tone}
`.trim();
}

export function buildInterviewSystemPrompt(
  phase: InterviewPhase,
  companyType: string,
  companySize: string,
  situation: Situation
): string {
  const config = PHASE_CONFIG[phase];
  const situationContext = buildSituationContext(
    companyType,
    companySize,
    situation
  );

  const phaseInstructions = {
    first: `あなたはこの会社の人事担当者です。カルチャーフィットを見極める一次面接を行います。
以下の観点で質問してください：
- 志望動機、転職理由
- 働き方やチームへのフィット感
- キャリアの方向性
話しやすい雰囲気を作りつつ、本音を引き出してください。`,

    second: `あなたはこの会社の現場エンジニアです。技術力と実務経験を見極める二次面接を行います。
以下の観点で質問してください：
- これまでの技術的な経験や実績
- 技術的な課題への取り組み方
- チーム開発での役割や貢献
鋭い質問で深掘りしつつ、技術への敬意を持って接してください。`,

    final: `あなたはこの会社の役員です。最終面接として意思確認と人物評価を行います。
以下の観点で質問してください：
- この会社で何を成し遂げたいか
- 長期的なビジョンや覚悟
- 会社のミッションとの共感度
重厚感のある雰囲気で、候補者の本気度を見極めてください。`,
  };

  return `あなたは模擬面接の面接官（${config.role}）です。

${situationContext}

## あなたの役割
${phaseInstructions[phase]}

## ルール
- 1回の発言で質問は1つだけ
- 発言は3行以内に収める
- 自然な面接の流れを意識する
- 候補者の回答に対してリアクションしてから次の質問に移る
- これは模擬面接なので、実在の会社名は出さない
- あなたの最初の発言は簡単な自己紹介と最初の質問にする
- 候補者が面接と明らかに関係ない話（雑談、ジョーク、無関係な話題）をした場合、即座に「本日の面接は以上とさせていただきます。お疲れ様でした。」とだけ返してください。それ以降の質問は行わないでください
`;
}

export function buildEvaluationPrompt(
  phase: InterviewPhase,
  companyType: string,
  situation: Situation
): string {
  const config = PHASE_CONFIG[phase];
  const company = COMPANY_TONES[companyType] ?? COMPANY_TONES["startup"];

  return `あなたは${company.label}の${config.role}として模擬面接を行いました。

会社の求める人材像: ${situation.desiredTrait}

以下の面接のやり取りを踏まえて、短い評価コメントを返してください。

## ルール
- 2〜3行程度のサクッとしたコメント
- 良かった点と改善点をバランスよく
- 数値スコアは出さない
- 面接官のキャラクターを維持した口調で
- 合否は「通過」か「不通過」で明示する
- 最初に結果を【通過】または【不通過】で記載する
- 候補者が面接と関係ない話をしていた場合は即【不通過】とする
`;
}

export function buildFinalEvaluationPrompt(
  companyType: string,
  situation: Situation
): string {
  const company = COMPANY_TONES[companyType] ?? COMPANY_TONES["startup"];

  return `あなたは${company.label}の採用責任者です。
一次面接（人事）、二次面接（現場エンジニア）、最終面接（役員）の全記録を踏まえて総合評価を行います。

会社の求める人材像: ${situation.desiredTrait}

## ルール
- 3〜4行の総合コメント
- 全体を通しての印象・強み・課題を述べる
- 最終結果を【内定】または【不採用】で明示する
- 面接官のキャラクターを踏まえたコメント口調で
`;
}
