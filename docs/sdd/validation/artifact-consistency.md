# 成果物整合性チェック

SDD 成果物間の整合性を検証する観点を記述する。

---

## チェックリスト

### 1. 要求 → 実装

- [ ] 全ユーザーストーリーに対応する API が存在する（`requirements/traceability.md` 参照）
- [ ] 全 API に対応する Backend Service が実装されている
- [ ] 全 US の受入基準が満たされている（`requirements/acceptance-criteria.md` 参照）

### 2. アーキテクチャ → 実装

- [ ] `architecture/context-map.md` の BC が `src/backend` ディレクトリ構造と一致
- [ ] `architecture/sequence-diagrams.md` のフローが実装と一致
- [ ] `architecture/integration-patterns.md` の IPC パターンが `@common/connection.ts` と一致

### 3. データモデル → DB

- [ ] `data-model/erd.md` のテーブルが `src/backend/db/schema.ts` と一致
- [ ] 外部キー制約が `schema.ts` で定義されている
- [ ] インデックスが `schema.ts` で定義されている

### 4. API 仕様 → 実装

- [ ] `api-specs/ipc-contract.md` の API が `src/backend/handler.ts` に実装されている
- [ ] 全 API が `Result<T, E>` を返却している
- [ ] イベント定義が `@common/types.ts` の `AppEvent` と一致

### 5. ドメイン設計 → 実装

- [ ] `domain-design/aggregates.md` の集約が対応する Service クラスに実装されている
- [ ] `domain-design/state-machines.md` の状態遷移が実装されている
- [ ] `domain-design/events.md` のイベントが発行されている

---

## 検証方法

### 自動検証（可能な項目）

```typescript
// 例: API 網羅性チェック
const ipcAPIs = Object.keys(RendererBackendAPI) // 型定義から抽出
const handlerMethods = Object.getOwnPropertyNames(Handler.prototype) // 実装から抽出

const missing = ipcAPIs.filter((api) => !handlerMethods.includes(api))
if (missing.length > 0) {
  console.error('Missing implementations:', missing)
}
```

### 手動検証（レビュー時）

- PR レビュー時に関連 SDD ドキュメントを確認
- 設計変更時は SDD を同時更新

---

## 不整合時の対処

1. **実装が真実**: SDD を実装に合わせて更新
2. **SDD が正**: 実装を SDD に合わせて修正
3. **判断記録**: 不整合の理由を ADR に記録

---

## 定期レビュー

- **頻度**: 四半期ごと
- **対象**: 全 SDD ドキュメント
- **責任者**: テックリード

---

## まとめ

SDD の価値は「実装との整合性」にある。不整合を放置せず、継続的に更新する。
