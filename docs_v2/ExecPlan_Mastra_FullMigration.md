# Mastra完全移行 実行計画（ExecPlan）

本ドキュメントは `.agent/PLANS.md` に従い、Releio v2のMastra完全移行を実現するための実行計画を示す。UC1（基本チャット）MVPの完了から、UC2（MCPツール実行）のHITL（Human-in-the-Loop）ツール承認システムまでを対象とする。進捗に応じて常に更新し、単体で新人が追従できる完全自給の手順書として維持する。

---

## Purpose / Big Picture

Mastraフレームワークを用いてReleioのBackendを完全刷新し、以下の機能を実現する：

1. **UC1: 基本的なAI会話** - Mastraによるストリーミングチャット（MVP実装済み、動作確認待ち）
2. **UC2: MCPツール実行** - MCPサーバーからのツール呼び出しとHITLによる実行許可システム
3. **UC3: 会話スレッド管理** - Mastra Threads + Memoryによる永続化（将来フェーズ）

ユーザーは設定画面からツール実行の許可ルールを定義でき、ルールに合致するツールは自動実行され、合致しないツールはUIで承認を求められる。これにより、セキュリティとユーザーコントロールを両立した安全なAIエージェント体験を提供する。

---

## Progress

### Milestone 1: UC1 MVP完了（基本チャット）

- [x] (2025-11-27 23:05+09:00) リポジトリ構成と企画書確認
- [x] (2025-11-27 23:15+09:00) 要求・分析・設計ドキュメント初版作成
- [x] (2025-11-27 23:23+09:00) Mastra依存追加、Backend/Renderer MVP実装、typecheck通過
- [x] (2025-12-26) 動作確認（手動チャット送受信）と最終整備

### Milestone 2: MCPツール統合（Mastraネイティブ）

- [x] (2025-12-26) 現行MCP実装の調査と移行計画策定
- [x] (2025-12-26) MastraツールへのMCPツール変換レイヤー実装（MastraToolService.ts）
- [x] (2025-12-26) Mastra Agent へのツール統合
- [x] (2025-12-26) 動作確認（ツール呼び出しの送受信）

### Milestone 3: ツール実行許可システム（HITL）

- [x] (2025-12-26) 許可ルール設定のDBスキーマ設計・実装
- [x] (2025-12-26) ツール許可判定ロジック実装（ToolPermissionService.ts）
- [x] (2025-12-26) Backend HITL対応（`requireApproval` / suspend-resume）
- [x] (2025-12-26) フロントエンド承認UI実装（ToolApprovalDialog.tsx）
- [x] (2025-12-26) 設定画面のルール管理UI実装（ToolPermissionSettings.tsx）
- [x] (2025-12-26) 統合テストと動作確認（59 renderer tests pass）

### Milestone 4: 既存v1機能の移行・削除

- [x] (2025-12-27) v1チャット経路との並行運用テスト
- [x] (2025-12-27) メインチャットをMastra経路に移行（AIRuntimeProvider.tsx）
- [x] (2025-12-27) MastraMvpChat test page削除、v1 routes deprecated
- [x] (2025-12-27) v1ストリーミングコード削除（stream.ts, stream-session-store.ts, index.ts）
- [x] (2025-12-27) v1 handlerメソッド削除（streamAIText, abortAIText, getAIModels, testAIProviderConnection）
- [x] (2025-12-27) renderer v1 AI lib削除（src/renderer/src/lib/ai.ts）
- [x] (2025-12-27) ドキュメント更新

> **Note**: `factory.ts` と `fetch.ts` は以下のサービスで引き続き使用されるため保持:
>
> - CompressionService（要約モデル作成）
> - ai-settings.ts（API からモデル一覧取得）
> - connectionTest.ts（プロキシ/証明書テスト）

---

## Surprises & Discoveries

- MastraのAI SDK v5互換ストリームは`UIMessage`の`id/parts`が必要。単純な`role/content`だけでは型エラーとなるためIDを付与して送信する必要があった。
- (2025-12-26) Mastraには`requireApproval`フラグと`suspend()`/`resume()`パターンによるネイティブHITL機能が存在することを確認。AI SDK v6の`needsApproval`より柔軟な条件付きサスペンドが可能。

---

## Decision Log

- Decision: MVPではAzureプロバイダーをMastra経路から除外し、サポート外として明示する。  
  Rationale: MastraのOpenAI互換設定ではAzure特有のURL/認証形態対応が未確認で、初期MVPの安定性を優先するため。  
  Date/Author: 2025-11-27 / Codex

- Decision: ツール実行許可システムはMastraのネイティブHITL機能（`requireApproval`）を使用し、AI SDK v6への移行は行わない。  
  Rationale: 既にMastra完全移行を決定しており、MastraのHITL機能は条件付きサスペンドやスナップショット永続化など、より高度な機能を提供する。AI SDK v6への中間移行は工数が無駄になる。  
  Date/Author: 2025-12-26 / Sisyphus

- Decision: 許可ルールはDBに永続化し、サーバー単位・ツール単位・パターンマッチングの3レベルで設定可能とする。  
  Rationale: ユーザーがMCPサーバーごとに信頼レベルを設定したり、特定のツールのみ承認必須にしたりする柔軟性が必要。  
  Date/Author: 2025-12-26 / Sisyphus

---

## Outcomes & Retrospective

### Phase 1-4 完了（2025-12-27）

**成果**:

- Mastraフレームワークへの完全移行を達成
- メインチャットがMastraストリーミングを使用（`streamMastraText`）
- HITLツール承認システム実装完了（ToolApprovalDialog, ToolPermissionSettings）
- 59件のRendererテストが全て成功
- v1コード（`src/backend/ai/`）を完全削除

**学んだこと**:

- MastraのネイティブHITL機能（`requireApproval`）はAI SDK v6より柔軟
- MCPツールからMastraツールへの変換は比較的シンプル
- SessionManagerでMastraセッション状態を管理する設計が効果的

**残課題**:

- Azure providerはMastra経路で未サポート（意図的な除外）
- 本番環境での大規模テストは未実施

---

## Context and Orientation

### 現行アーキテクチャ（v1）

```
Main Process (Electron)
    ↓ IPC
Backend Process
├── src/backend/ai/stream.ts      ← AI SDK v5ベースのカスタムストリーミング
├── src/backend/mcp/manager.ts    ← MCPサーバー管理（@ai-sdk/mcp使用）
├── src/backend/handler.ts        ← API公開、MCPツールをstreamText()に渡す
└── src/backend/mastra/           ← Mastra MVP（UC1）
    ↓ Events
Renderer Process
├── Thread/AIRuntimeProvider経由でチャット
└── SessionManager（DB上のセッション管理）
```

### 目標アーキテクチャ（v2 Mastra完全移行後）

```
Main Process (Electron)
    ↓ IPC
Backend Process
├── src/backend/mastra/
│   ├── MastraChatService.ts      ← Mastra Agent（チャット）
│   ├── MastraToolService.ts      ← MCP→Mastraツール変換
│   └── ToolPermissionService.ts  ← 許可ルール判定
├── src/backend/mcp/manager.ts    ← MCPサーバー管理（維持、ツール収集のみ）
└── src/backend/db/schema.ts      ← 許可ルールテーブル追加
    ↓ Events (mastraChatChunk, mastraToolApproval, etc.)
Renderer Process
├── Mastra専用チャットUI
├── ツール承認ダイアログ
└── 設定画面（許可ルール管理）
```

### 関連ドキュメント

- `docs_v2/開発企画書.md` - v2全体計画
- `docs_v2/要求定義_UC1_MastraMVP.md` - UC1要求
- `docs_v2/設計方針_UC1_MastraMVP.md` - UC1設計
- `docs/TOOL_EXECUTION_PERMISSION_DESIGN.md` - ツール実行許可システム調査結果

---

## Plan of Work

### Phase 1: UC1 MVP完了（残作業）

1. 開発モードでアプリを起動し、Mastraチャット画面でメッセージ送受信を手動確認
2. エラーがあれば修正し、typecheck再実行
3. ExecPlanのProgressを更新

### Phase 2: MCPツールのMastra統合

1. **MCP→Mastraツール変換レイヤー設計**
   - 現行`MCPManager.getAllTools()`が返すAI SDK形式ツールをMastra形式に変換
   - Mastraの`createTool()`を使用してラップ
   - 許可フラグ（`requireApproval`）を注入可能な構造にする

2. **Mastra Agent へのツール統合**
   - `MastraChatService`にツール対応を追加
   - `MastraToolService`（新規）でツール変換と実行を担当
   - ツール呼び出し/結果のイベントを定義（`mastraToolCall`, `mastraToolResult`）

3. **動作確認**
   - MCPサーバー起動状態でツールを含むチャットを実行
   - ツールが呼び出され、結果がストリームに反映されることを確認

### Phase 3: ツール実行許可システム（HITL）

1. **許可ルールのDBスキーマ設計**

   ```typescript
   // src/backend/db/schema.ts に追加
   export const toolPermissionRules = sqliteTable('tool_permission_rules', {
     id: text('id').primaryKey(),
     serverId: text('server_id'), // null = 全サーバー対象
     toolName: text('tool_name'), // null = 全ツール対象
     toolPattern: text('tool_pattern'), // ワイルドカード（例: "delete_*"）
     autoApprove: integer('auto_approve').notNull(), // 1=自動許可, 0=承認必要
     priority: integer('priority').notNull().default(0), // 高い方が優先
     createdAt: text('created_at').notNull(),
     updatedAt: text('updated_at').notNull()
   })
   ```

2. **ToolPermissionService実装**

   ```typescript
   // src/backend/mastra/ToolPermissionService.ts
   class ToolPermissionService {
     // ルールに基づいて許可判定
     shouldAutoApprove(serverId: string, toolName: string): boolean

     // CRUD操作
     addRule(rule: ToolPermissionRule): Promise<void>
     updateRule(id: string, updates: Partial<ToolPermissionRule>): Promise<void>
     deleteRule(id: string): Promise<void>
     listRules(): Promise<ToolPermissionRule[]>
   }
   ```

3. **Mastraツールへの許可フラグ注入**

   ```typescript
   // MCPツールをMastraツールに変換する際に許可フラグを設定
   function convertMCPToolToMastra(
     mcpTool: AISDKTool,
     serverId: string,
     permissionService: ToolPermissionService
   ): MastraTool {
     const autoApprove = permissionService.shouldAutoApprove(serverId, mcpTool.name)

     return createTool({
       id: mcpTool.name,
       description: mcpTool.description,
       inputSchema: mcpTool.inputSchema,
       requireApproval: !autoApprove, // 自動許可でない場合は承認必要
       execute: async ({ context }) => {
         // MCPツール実行
       }
     })
   }
   ```

4. **Backend HITLイベント対応**
   - ツール承認待ち状態のイベント: `mastraToolApprovalRequired`
   - 承認/拒否API: `approveToolCall(runId, toolCallId)`, `declineToolCall(runId, toolCallId)`
   - Handler/Serverへの追加

5. **フロントエンド承認UI**
   - `ToolApprovalDialog`コンポーネント作成
   - 承認待ちツール一覧表示
   - 承認/拒否ボタンとAPI呼び出し
   - ツール実行結果の表示

6. **設定画面ルール管理UI**
   - 許可ルール一覧表示
   - ルール追加/編集/削除フォーム
   - サーバー選択、ツール名/パターン入力、許可設定

### Phase 4: v1機能の移行・削除

1. Mastra経路と既存v1経路の並行運用テスト
2. v1経路の段階的廃止（コメントアウト→削除）
3. 関連ドキュメント更新

---

## Concrete Steps

### Phase 1 詳細手順

```bash
# 開発モード起動
pnpm run dev

# Mastraチャット画面に遷移
# 1. ホーム画面から「Mastra MVP」導線をクリック
# 2. セッション開始ボタンをクリック
# 3. メッセージ入力・送信
# 4. ストリーミング応答が表示されることを確認
# 5. Abortボタンで中断を確認
```

### Phase 2 詳細手順

1. `src/backend/mastra/MastraToolService.ts` を新規作成
2. `src/backend/mcp/manager.ts` の `getAllTools()` を利用してMCPツールを取得
3. Mastra形式に変換し、Agentに渡す
4. `src/common/types.ts` にイベント型を追加
5. `src/backend/handler.ts` にツール関連API追加
6. Renderer側のイベントハンドラ追加

### Phase 3 詳細手順

1. `resources/db/migrations/` に新しいマイグレーションSQL作成
2. `src/backend/db/schema.ts` にテーブル定義追加
3. `src/backend/mastra/ToolPermissionService.ts` 実装
4. `MastraToolService` に `ToolPermissionService` を注入
5. `src/common/types.ts` に承認イベント型追加
6. `src/backend/handler.ts` に承認API追加
7. `src/renderer/src/components/ToolApprovalDialog.tsx` 実装
8. `src/renderer/src/components/settings/ToolPermissionSettings.tsx` 実装
9. 設定ページにルート追加

---

## Validation and Acceptance

### Phase 1 受入条件

- `pnpm run typecheck` が成功
- Mastraチャット画面でメッセージ送信→ストリーミング表示→完了
- Abortボタンで中断が機能

### Phase 2 受入条件

- MCPサーバー（例: filesystem）が接続状態
- チャットでツールを使うプロンプト（例: 「現在のディレクトリのファイル一覧を表示して」）
- ツールが呼び出され、結果がチャットに反映
- `mastraToolCall`, `mastraToolResult` イベントがログに出力

### Phase 3 受入条件

- 許可ルールが未設定の場合、すべてのツールで承認ダイアログが表示
- 「自動許可」ルールを追加すると、該当ツールは承認なしで実行
- 承認ダイアログで「拒否」を選択すると、ツール実行がスキップ
- 設定画面でルールのCRUD操作が可能
- DBにルールが永続化（アプリ再起動後も維持）

---

## Idempotence and Recovery

- pnpmインストールは再実行可
- DBマイグレーションは`drizzle-kit`により冪等
- Mastra初期化失敗時はログを確認し、APIキー設定後に再起動
- ツール変換レイヤーはMCPサーバー未接続でも空リストを返すため安全

---

## Artifacts and Notes

### 主要成果物

| Phase   | 成果物                                                         |
| ------- | -------------------------------------------------------------- |
| Phase 1 | UC1 MVP動作確認完了                                            |
| Phase 2 | `MastraToolService.ts`, ツールイベント定義                     |
| Phase 3 | `ToolPermissionService.ts`, DBマイグレーション, 承認UI, 設定UI |
| Phase 4 | v1経路削除、ドキュメント更新                                   |

### ログ出力

- `[Mastra]` プレフィックスでチャット初期化、ストリーム状態を記録
- `[Mastra Tool]` プレフィックスでツール呼び出し/結果/承認状態を記録
- `[Permission]` プレフィックスでルール評価結果を記録

---

## Interfaces and Dependencies

### 依存パッケージ

- `@mastra/core` (0.24系) - Mastra本体
- `ai` (5.x) - AI SDK（既存、Mastraが内部利用）
- `@ai-sdk/mcp` - MCP統合（既存、ツール収集に利用）

### Backend API（追加予定）

```typescript
// Phase 2
streamMastraTextWithTools(sessionId: string, messages: AIMessage[]): Result<string>

// Phase 3
approveToolCall(runId: string, toolCallId?: string): Result<void>
declineToolCall(runId: string, toolCallId?: string): Result<void>
listToolPermissionRules(): Result<ToolPermissionRule[]>
addToolPermissionRule(rule: Omit<ToolPermissionRule, 'id'>): Result<string>
updateToolPermissionRule(id: string, updates: Partial<ToolPermissionRule>): Result<void>
deleteToolPermissionRule(id: string): Result<void>
```

### イベントチャネル

```typescript
// Phase 2
'mastraToolCall': { sessionId, streamId, toolCallId, toolName, input }
'mastraToolResult': { sessionId, streamId, toolCallId, toolName, output }

// Phase 3
'mastraToolApprovalRequired': { sessionId, runId, toolCallId, toolName, input }
'mastraToolApprovalResolved': { sessionId, runId, toolCallId, approved: boolean }
```

---

## 変更履歴

| 日付       | 変更内容                                                             |
| ---------- | -------------------------------------------------------------------- |
| 2025-11-27 | UC1 MVP ExecPlan初版作成                                             |
| 2025-12-26 | ツール実行許可システム（HITL）要件を追加し、完全移行計画として再構成 |
| 2025-12-27 | Phase 1-4完了：Mastra完全移行達成、v1コード削除                      |
