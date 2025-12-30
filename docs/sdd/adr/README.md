# Architecture Decision Records (ADR)

Releio の重要なアーキテクチャ判断を記録する。

---

## ADR 一覧

| ID | タイトル | 状態 | 日付 |
|----|---------|------|------|
| ADR-0001 | 3プロセスアーキテクチャ採用 | Accepted | 2024-11-15 |
| ADR-0002 | Drizzle ORM + SQLite 採用 | Accepted | 2024-11-15 |
| ADR-0003 | Mastra フレームワーク採用 | Accepted | 2024-12-20 |
| ADR-0004 | MessagePort IPC 採用 | Accepted | 2024-11-15 |
| ADR-0005 | Result 型パターン採用 | Accepted | 2024-11-15 |

---

## ADR テンプレート

```markdown
# ADR-XXXX: [タイトル]

## 状態
[Proposed | Accepted | Deprecated | Superseded]

## コンテキスト
[判断が必要になった背景・課題]

## 決定
[採用した解決策]

## 理由
[なぜこの解決策を選んだか]

## 結果
[判断の結果、トレードオフ]

## 代替案
[検討したが採用しなかった案]

## 関連 ADR
[関連する他の ADR]
```

---

## 次のステップ

- 新たな重要判断時に ADR を作成
- 既存判断の見直し（年1回）
