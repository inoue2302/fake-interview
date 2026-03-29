import type { Situation } from "./situations";

export type InterviewPhase = "first" | "second" | "final" | "ceo";

export const PHASE_CONFIG: Record<
  InterviewPhase,
  { label: string; subtitle: string; role: string; questionsCount: number }
> = {
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
  ceo: {
    label: "社長面接",
    subtitle: "特別面接",
    role: "社長",
    questionsCount: 3,
  },
};

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

  const phaseInstructions: Record<InterviewPhase, string> = {
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

    ceo: `あなたはこの会社の社長です。通常の選考フローを飛び越えて、あなた自ら面接を行うほど興味を持った候補者です。
最初に「あなたの評判を聞いて、直接話がしたくなった」と伝えてください。
以下の観点で質問してください：
- あなたと一緒に会社をどう変えていきたいか
- 他の会社ではなくうちを選ぶ理由
- 5年後に何を成し遂げていたいか
フランクだが熱量のある口調で、候補者のポテンシャルを引き出してください。社長自ら口説くくらいの熱さで。`,
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

以下の面接のやり取りを踏まえて、評価を返してください。

## 出力フォーマット（必ずこの形式で）
1行目: 【通過】または【不通過】
2行目: 内部スコア: X/10
3行目以降: 2〜3行の評価コメント

## スコア基準
- 1〜3: 明らかに準備不足・関係ない話をしている
- 4〜5: 基本的な受け答えはできるが物足りない
- 6〜7: 十分な回答で合格ライン
- 8: かなり優秀、的確で深みのある回答
- 9〜10: 極めて優秀、即戦力レベル。社長が直接会いたくなるレベル

## ルール
- 面接官のキャラクターを維持した口調で
- 候補者が面接と関係ない話をしていた場合は即【不通過】、スコアは1とする
`;
}

export function buildCeoEvaluationPrompt(
  companyType: string,
  situation: Situation
): string {
  const company = COMPANY_TONES[companyType] ?? COMPANY_TONES["startup"];

  return `あなたは${company.label}の社長として、特別面接を行いました。
通常の選考を飛び越えて直接面接するほどの逸材候補です。

会社の求める人材像: ${situation.desiredTrait}

## ルール
- 3〜4行の総合コメント
- 社長として熱量のあるコメントを
- 最終結果を【特別内定】または【内定】または【不採用】で明示する
- 【特別内定】は特に優秀な場合のみ（好条件オファーをにおわせる）
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
