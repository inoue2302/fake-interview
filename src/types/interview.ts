export const COMPANY_TYPES = [
  {
    id: "startup",
    label: "スタートアップ",
    description: "カジュアル・スピード重視",
    emoji: "🚀",
    sizes: [
      { id: "small", label: "〜10人", description: "創業期" },
      { id: "medium", label: "11〜30人", description: "シード〜シリーズA" },
      { id: "large", label: "31〜100人", description: "シリーズB以降" },
    ],
  },
  {
    id: "web-venture",
    label: "Web系ベンチャー",
    description: "エンジニアリング重視・フラット",
    emoji: "💻",
    sizes: [
      { id: "small", label: "〜50人", description: "少数精鋭" },
      { id: "medium", label: "51〜300人", description: "成長フェーズ" },
      { id: "large", label: "300人〜", description: "メガベンチャー" },
    ],
  },
  {
    id: "foreign-consulting",
    label: "外資コンサル",
    description: "論理的・やや圧迫感",
    emoji: "🏢",
    sizes: [
      { id: "small", label: "〜100人", description: "ブティック系" },
      { id: "medium", label: "101〜1000人", description: "中堅ファーム" },
      { id: "large", label: "1000人〜", description: "Big4・MBB級" },
    ],
  },
  {
    id: "enterprise",
    label: "大手メーカー・SIer",
    description: "丁寧・ルール重視",
    emoji: "🏭",
    sizes: [
      { id: "small", label: "〜500人", description: "中堅企業" },
      { id: "medium", label: "501〜5000人", description: "大手" },
      { id: "large", label: "5000人〜", description: "超大手" },
    ],
  },
] as const;

export type CompanyTypeId = (typeof COMPANY_TYPES)[number]["id"];
export type CompanySizeId = (typeof COMPANY_TYPES)[number]["sizes"][number]["id"];
