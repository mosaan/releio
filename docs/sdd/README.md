# Releio SDD（Software Design Document）

本ディレクトリは、Electron デスクトップアプリ「Releio」の設計成果物（SDD）を一元管理します。

- 対象読者: 開発者（Main/Backend/Renderer）、テックリード、レビュー担当
- 方針: 実装と乖離しない「参照可能な設計」を維持する（実装が真実、SDDは追従）
- 言語: 日本語

## 読み順（推奨）

1. `domain/vision.md`（目的・スコープ）
2. `domain/glossary.yaml`（用語）
3. `architecture/context-map.md`（境界）
4. `architecture/overview.md`（3プロセス全体像）
5. `architecture/sequence-diagrams.md`（主要フロー）
6. `api-specs/ipc-contract.md`（Renderer↔Backend/Main 契約）
7. `data-model/erd.md`（永続化モデル）
8. `security/hitl.md`（ツール承認/権限）
9. `security/network.md`（プロキシ/証明書）
10. `adr/`（重要な設計判断）

## ディレクトリ構成

- `domain/`
  - `vision.md`: ドメインビジョン（What/Why/Scope）
  - `glossary.yaml`: コア用語集（Entity/VO/Service/Enum）
- `architecture/`
  - `context-map.md`: 境界づけられたコンテキストと関係
  - `overview.md`: 3プロセス構成・主要モジュール
  - `integration-patterns.md`: 同期/非同期・ACL・データ所有
  - `sequence-diagrams.md`: 主要ユースフロー（Mermaid）
- `requirements/`
  - `personas.md`: ペルソナ
  - `use-cases.md`: ユースケース一覧（UC→BC対応）
  - `user-stories.md`: ユーザーストーリー（優先度・範囲）
  - `acceptance-criteria.md`: 横断受入基準（品質/エラー/境界）
  - `non-functional.md`: 非機能要求（性能/セキュリティ/運用/互換）
  - `feature-breakdown.md`: 機能分解（依存・優先度）
  - `traceability.md`: トレーサビリティ（要求→BC→API→DB）
- `domain-design/`
  - `aggregates.md`: 集約設計
  - `state-machines.md`: 状態遷移（Message/Tool/MCP/Session）
  - `events.md`: ドメインイベント
  - `services.md`: サービス仕様（アプリ/ドメイン/インフラ）
  - `errors.md`: エラー設計（分類/復旧/UX）
- `data-model/`
  - `logical-model.md`: 論理データモデル（概念→テーブル）
  - `physical-model.md`: 物理データモデル（テーブル/制約/Index）
  - `erd.md`: ER図（Mermaid）
  - `migrations.md`: マイグレーション運用
- `api-specs/`
  - `ipc-contract.md`: IPC 契約（Renderer↔Backend/Main）
  - `trpc.md`: tRPC 仕様（現状: ping）
  - `external-integrations.md`: 外部連携（AI Provider/MCP/ネットワーク）
- `security/`
  - `hitl.md`: HITL（ツール承認フロー/許可ルール/監査）
  - `network.md`: ネットワーク（プロキシ/証明書/接続テスト）
- `operations/`
  - `logging.md`: 3プロセス統合ログ
  - `auto-update.md`: 自動更新（electron-updater）
  - `release-process.md`: リリース手順（ビルド/署名/配布）
- `adr/`
  - `README.md`: ADR 一覧・テンプレ
  - `ADR-0001..`: 重要判断の記録
- `validation/`
  - `artifact-consistency.md`: 整合性チェック観点（最終パス用）

## 更新ルール

- **追加・変更は PR と同時**: 実装変更が設計を変える場合、同じ変更セットで SDD も更新する。
- **真実は実装**: SDD は「仕様の押し付け」ではなく、「実装を理解するための地図」とする。
- **リンクの維持**: 参照先が増減したら `docs/sdd/README.md` と `requirements/traceability.md` を更新する。
- **Mermaid 推奨**: 図は Markdown + Mermaid を基本とする。

## 既存技術ドキュメント（参照）

- `docs/IPC_COMMUNICATION_DEEP_DIVE.md`（MessagePort IPCの深掘り）
- `docs/MCP_INTEGRATION_DESIGN.md`（MCP統合の設計背景）
- `docs/PROXY_AND_CERTIFICATE_DESIGN.md` / `docs/PROXY_CONFIGURATION.md`（ネットワーク対応）
- `docs/CONVERSATION_HISTORY_COMPRESSION_*.md`（圧縮設計）
- `docs/AUTO_UPDATE.md`（自動更新）
