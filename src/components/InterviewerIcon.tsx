export default function InterviewerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* 背景円 */}
      <circle cx="60" cy="60" r="58" fill="url(#bg-gradient)" />

      {/* 体（スーツ） */}
      <path
        d="M30 105C30 85 42 75 60 75C78 75 90 85 90 105"
        fill="#374151"
      />
      {/* 襟 */}
      <path
        d="M52 75L60 90L68 75"
        fill="#1f2937"
      />
      {/* ネクタイ */}
      <path
        d="M57 82L60 95L63 82L60 80Z"
        fill="url(#tie-gradient)"
      />
      {/* シャツ */}
      <path
        d="M55 75L52 82L60 80L68 82L65 75"
        fill="white"
      />

      {/* 顔 */}
      <circle cx="60" cy="48" r="22" fill="#fcd9b6" />

      {/* 髪 */}
      <path
        d="M38 42C38 28 48 22 60 22C72 22 82 28 82 42C82 38 78 30 60 30C42 30 38 38 38 42Z"
        fill="#1f2937"
      />
      <path
        d="M38 42C36 42 36 48 38 48C38 44 40 40 38 42Z"
        fill="#1f2937"
      />
      <path
        d="M82 42C84 42 84 48 82 48C82 44 80 40 82 42Z"
        fill="#1f2937"
      />

      {/* 眉毛 */}
      <path d="M48 40L55 39" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M65 39L72 40" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />

      {/* 目 */}
      <circle cx="52" cy="46" r="2.5" fill="#1f2937" />
      <circle cx="68" cy="46" r="2.5" fill="#1f2937" />
      <circle cx="53" cy="45" r="0.8" fill="white" />
      <circle cx="69" cy="45" r="0.8" fill="white" />

      {/* 口（にっこり） */}
      <path
        d="M54 56Q60 61 66 56"
        stroke="#c07a5a"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* メガネ */}
      <rect x="45" y="41" width="13" height="10" rx="3" stroke="#6b7280" strokeWidth="1.2" fill="none" />
      <rect x="62" y="41" width="13" height="10" rx="3" stroke="#6b7280" strokeWidth="1.2" fill="none" />
      <path d="M58 46H62" stroke="#6b7280" strokeWidth="1.2" />

      {/* 吹き出し */}
      <rect x="78" y="10" width="36" height="22" rx="6" fill="white" />
      <path d="M82 32L86 28L90 32" fill="white" />
      <text x="96" y="25" textAnchor="middle" fontSize="12" fill="#374151" fontWeight="bold">?!</text>

      <defs>
        <linearGradient id="bg-gradient" x1="0" y1="0" x2="120" y2="120">
          <stop offset="0%" stopColor="#fed7aa" />
          <stop offset="50%" stopColor="#fecdd3" />
          <stop offset="100%" stopColor="#ddd6fe" />
        </linearGradient>
        <linearGradient id="tie-gradient" x1="60" y1="80" x2="60" y2="95">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  );
}
