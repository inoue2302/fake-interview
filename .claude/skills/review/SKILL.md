# コードレビュー スキル

PR のコードレビューを6つの専門サブエージェントで並列実行し、GitHub PR にレビューコメントを投稿する。

## 使い方

```
/review <PR番号>
```

## 実行手順

### 1. PR情報の取得

```bash
gh pr view <PR番号> --json number,title,body,headRefName,baseRefName
gh pr diff <PR番号>
```

PR の diff 全体を取得し、変更内容を把握する。

### 2. サブエージェントの並列実行

以下の6つのサブエージェントを **Task ツールで並列に** 起動する。
各サブエージェントには PR の diff を渡し、それぞれの専門観点でレビューさせる。

| エージェント | ファイル | 観点 |
|---|---|---|
| review-logic | `.claude/agents/review-logic.md` | バグ、エッジケース、非同期処理 |
| review-naming | `.claude/agents/review-naming.md` | 命名規則、可読性、マジックナンバー |
| review-performance | `.claude/agents/review-performance.md` | ループ効率、メモリリーク、再レンダリング |
| review-security | `.claude/agents/review-security.md` | XSS、機密情報露出、認証漏れ |
| review-errorhandling | `.claude/agents/review-errorhandling.md` | try-catch妥当性、エラー握りつぶし |
| review-testing | `.claude/agents/review-testing.md` | テスト有無、境界値、網羅性 |

各サブエージェントへのプロンプト：

```
以下のPR diffをレビューしてください。あなたの専門観点のみに集中し、
指摘事項をJSON配列で返してください。指摘がなければ空配列 [] を返してください。

PR: #<番号> <タイトル>

<diff内容>
```

### 3. 結果の集約

全サブエージェントの結果（JSON配列）を集約する。

- 各指摘に severity バッジを付与:
  - 🔴 `must` — マージ前に必ず修正
  - 🟡 `imo` — 修正推奨だが判断は委ねる
  - 🟢 `nits` — 軽微な改善提案

### 4. GitHub PR へのレビュー投稿

集約した指摘を GitHub PR レビューとして投稿する。

**レビューイベントの判定:**
- `must` が 1件以上 → `REQUEST_CHANGES`
- `must` が 0件 → `COMMENT`

**レビューボディのフォーマット:**

```markdown
## 🤖 AI Code Review

| Severity | Count |
|----------|-------|
| 🔴 must | N |
| 🟡 imo | N |
| 🟢 nits | N |

---

レビュー観点: ロジック / 命名・可読性 / パフォーマンス / セキュリティ / エラーハンドリング / テスト
```

**インラインコメントのフォーマット:**

各指摘を PR のインラインコメントとして投稿する。`gh api` を使用する。

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/reviews \
  --method POST \
  -f event="COMMENT" \
  -f body="レビューサマリー" \
  --jq '.id'
```

個別のインラインコメントは `create_pull_request_review` の `comments` パラメータを使って一括投稿する。

各コメントのフォーマット:
```
{severity_badge} **[{観点}]** {メッセージ}

💡 **提案:** {改善提案}
```

### 5. 結果のサマリー表示

レビュー完了後、ユーザーにサマリーを表示する:
- 指摘の総数と severity 別の内訳
- must がある場合は警告を強調
- レビュー投稿先の PR URL
