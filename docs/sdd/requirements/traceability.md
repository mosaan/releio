# トレーサビリティマトリックス

本ドキュメントでは、要求（ユーザーストーリー）から実装（Bounded Context → API → DB テーブル）への対応関係を示す。

- **対象読者**: 開発チーム、QA、プロダクトマネージャー
- **目的**: 要求実装状況の確認、影響範囲分析、テスト範囲の特定
- **関連**: `requirements/user-stories.md`, `architecture/context-map.md`, `data-model/erd.md`

---

## 1. ユーザーストーリー → Bounded Context → API

| US ID  | ユーザーストーリー         | 主要 BC                  | IPC API                                                                                                                                                                         | Backend API/Service                                                                                                                           |
| ------ | -------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| US-001 | AI プロバイダー設定        | Settings Management      | `getAISettingsV2`<br>`saveAISettingsV2`<br>`createProviderConfiguration`<br>`updateProviderConfiguration`<br>`deleteProviderConfiguration`<br>`refreshModelsFromAPI`            | `AISettingsService`<br>`createProviderConfiguration()`<br>`updateProviderConfiguration()`<br>`refreshModelsFromAPI()`                         |
| US-002 | AI チャット実行            | AI Chat Management       | `getMastraStatus`<br>`startMastraSession`<br>`streamMastraText`<br>`abortMastraStream`                                                                                          | `MastraChatService`<br>`startSession()`<br>`streamText()`<br>`abortStream()`                                                                  |
| US-003 | 複数セッション管理         | AI Chat Management       | `createChatSession`<br>`getChatSession`<br>`listChatSessions`<br>`updateChatSession`<br>`deleteChatSession`<br>`searchChatSessions`<br>`getLastSessionId`<br>`setLastSessionId` | `ChatSessionStore`<br>`createSession()`<br>`getSession()`<br>`listSessions()`<br>`updateSession()`<br>`deleteSession()`<br>`searchSessions()` |
| US-004 | MCP サーバー登録           | MCP Integration          | `listMCPServers`<br>`addMCPServer`<br>`updateMCPServer`<br>`removeMCPServer`<br>`getMCPResources`<br>`getMCPTools`<br>`getMCPPrompts`                                           | `MCP Manager`<br>`addServer()`<br>`updateServer()`<br>`removeServer()`<br>`listResources()`<br>`listTools()`                                  |
| US-005 | MCP ツール自動実行         | MCP Integration          | `streamMastraText` (ツール呼び出し含む)                                                                                                                                         | `MastraToolService`<br>`getAllTools()`<br>`MCP Manager.callTool()`                                                                            |
| US-006 | HITL ツール承認            | MCP Integration          | `approveToolCall`<br>`declineToolCall`                                                                                                                                          | `ToolPermissionService`<br>`shouldAutoApproveSync()`                                                                                          |
| US-007 | ツール権限ルール管理       | Settings Management      | `listToolPermissionRules`<br>`getToolPermissionRule`<br>`createToolPermissionRule`<br>`updateToolPermissionRule`<br>`deleteToolPermissionRule`                                  | `ToolPermissionService`<br>`createRule()`<br>`updateRule()`<br>`deleteRule()`                                                                 |
| US-008 | トークン使用量監視         | Conversation Compression | `getTokenUsage`<br>`checkCompressionNeeded`                                                                                                                                     | `CompressionService`<br>`checkContext()`<br>`getTokenBreakdown()`<br>`TokenCounter`                                                           |
| US-009 | 会話自動圧縮               | Conversation Compression | `getCompressionSettings`<br>`setCompressionSettings`<br>`compressConversation`<br>`getCompressionPreview`<br>`getCompressionSummaries`                                          | `CompressionService`<br>`autoCompress()`<br>`SummarizationService`<br>`ModelConfigService`                                                    |
| US-010 | 圧縮設定カスタマイズ       | Conversation Compression | `getCompressionSettings`<br>`setCompressionSettings`                                                                                                                            | `settings` テーブル (key-value)                                                                                                               |
| US-011 | プロキシ設定               | Network Configuration    | `getProxySettings`<br>`setProxySettings`<br>`getSystemProxySettings`<br>`testProxyConnection`<br>`testFullConnection`                                                           | `ProxySettings`<br>`getSystemProxySettings()`<br>`testProxyConnection()`                                                                      |
| US-012 | カスタム証明書設定         | Network Configuration    | `getCertificateSettings`<br>`setCertificateSettings`<br>`getSystemCertificateSettings`<br>`testCertificateConnection`<br>`testCombinedConnection`                               | `CertificateSettings`<br>`getSystemCertificateSettings()`<br>`testCertificateConnection()`                                                    |
| US-013 | 初回セットアップウィザード | Settings Management      | （既存 API の組み合わせ）                                                                                                                                                       | （新規 UI のみ、API は既存）                                                                                                                  |
| US-014 | 会話履歴検索               | AI Chat Management       | `searchChatSessions`                                                                                                                                                            | `ChatSessionStore.searchSessions()`                                                                                                           |
| US-015 | 会話履歴エクスポート       | AI Chat Management       | `exportSession` (未実装)                                                                                                                                                        | （Phase 2 実装予定）                                                                                                                          |
| US-016 | 自動更新                   | Settings Management      | Main プロセス IPC イベント:<br>`update-available`<br>`update-not-available`<br>`update-download-progress`<br>`update-downloaded`<br>`update-error`                              | `Updater`<br>`checkForUpdates()`<br>`downloadUpdate()`<br>`quitAndInstall()`                                                                  |

---

## 2. Bounded Context → DB テーブル

| Bounded Context              | 主要 DB テーブル                                       | 補助テーブル                                                         |
| ---------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| **AI Chat Management**       | `chat_sessions`<br>`chat_messages`<br>`message_parts`  | `tool_invocations`                                                   |
| **MCP Integration**          | `mcp_servers`                                          | `tool_permission_rules`<br>`message_parts` (tool_call/tool_result)   |
| **Conversation Compression** | `session_snapshots`<br>`model_configs`                 | `chat_sessions` (summary フィールド)<br>`settings` (compression設定) |
| **Network Configuration**    | `settings` (key-value)                                 | -                                                                    |
| **Settings Management**      | `settings`<br>`mcp_servers`<br>`tool_permission_rules` | -                                                                    |

---

## 3. DB テーブル → カラム詳細

### 3.1 `settings` (汎用Key-Value設定)

| カラム  | 型   | 主キー | 用途           |
| ------- | ---- | ------ | -------------- |
| `key`   | text | ✅     | 設定キー       |
| `value` | json | -      | 設定値（JSON） |

**格納データ例**:

- `ai_settings_v2`: AI プロバイダー設定
- `proxy_settings`: プロキシ設定
- `certificate_settings`: 証明書設定
- `compression:global-defaults`: グローバル圧縮設定
- `compression:{sessionId}`: セッション別圧縮設定
- `last_session_id`: 最後に開いたセッションID

---

### 3.2 `mcp_servers` (MCP サーバー設定)

| カラム              | 型        | 主キー | 外部キー | 用途                                                               |
| ------------------- | --------- | ------ | -------- | ------------------------------------------------------------------ |
| `id`                | text      | ✅     | -        | サーバーID (UUID)                                                  |
| `name`              | text      | -      | -        | サーバー名                                                         |
| `description`       | text      | -      | -        | 説明                                                               |
| `command`           | text      | -      | -        | 実行コマンド (例: `npx`)                                           |
| `args`              | json      | -      | -        | 引数配列 (例: `["-y", "@modelcontextprotocol/server-filesystem"]`) |
| `env`               | json      | -      | -        | 環境変数 (例: `{"API_KEY": "xxx"}`)                                |
| `enabled`           | boolean   | -      | -        | 有効/無効                                                          |
| `include_resources` | boolean   | -      | -        | リソース取得を有効化                                               |
| `created_at`        | timestamp | -      | -        | 作成日時                                                           |
| `updated_at`        | timestamp | -      | -        | 更新日時                                                           |

**関連 US**: US-004, US-008

---

### 3.3 `chat_sessions` (チャットセッション)

| カラム                | 型      | 主キー | 外部キー | 用途                           |
| --------------------- | ------- | ------ | -------- | ------------------------------ |
| `id`                  | text    | ✅     | -        | セッションID (UUID)            |
| `title`               | text    | -      | -        | セッション名                   |
| `created_at`          | integer | -      | -        | 作成日時 (UNIX timestamp)      |
| `updated_at`          | integer | -      | -        | 更新日時                       |
| `last_message_at`     | integer | -      | -        | 最終メッセージ日時             |
| `archived_at`         | integer | -      | -        | アーカイブ日時                 |
| `pinned_at`           | integer | -      | -        | ピン留め日時                   |
| `provider_config_id`  | text    | -      | -        | 使用した AI プロバイダー設定ID |
| `model_id`            | text    | -      | -        | 使用したモデルID               |
| `message_count`       | integer | -      | -        | メッセージ数                   |
| `data_schema_version` | integer | -      | -        | データスキーマバージョン       |
| `summary`             | text    | -      | -        | セッション要約（手動）         |
| `summary_updated_at`  | integer | -      | -        | 要約更新日時                   |
| `color`               | text    | -      | -        | UI 表示色                      |
| `metadata`            | text    | -      | -        | 追加メタデータ (JSON)          |

**関連 US**: US-002, US-003, US-014

---

### 3.4 `chat_messages` (チャットメッセージ)

| カラム              | 型      | 主キー | 外部キー                        | 用途                                       |
| ------------------- | ------- | ------ | ------------------------------- | ------------------------------------------ |
| `id`                | text    | ✅     | -                               | メッセージID (UUID)                        |
| `session_id`        | text    | -      | ✅ `chat_sessions.id` (CASCADE) | 所属セッション                             |
| `role`              | text    | -      | -                               | ロール (`user` / `assistant` / `system`)   |
| `state`             | text    | -      | -                               | 状態 (`completed` / `streaming` / `error`) |
| `sequence`          | integer | -      | -                               | セッション内での順序                       |
| `created_at`        | integer | -      | -                               | 作成日時                                   |
| `completed_at`      | integer | -      | -                               | 完了日時                                   |
| `input_tokens`      | integer | -      | -                               | 入力トークン数                             |
| `output_tokens`     | integer | -      | -                               | 出力トークン数                             |
| `error`             | text    | -      | -                               | エラーメッセージ                           |
| `metadata`          | text    | -      | -                               | 追加メタデータ (JSON)                      |
| `parent_message_id` | text    | -      | `chat_messages.id` (SET NULL)   | 親メッセージ（分岐用）                     |
| `deleted_at`        | integer | -      | -                               | 削除日時（論理削除）                       |

**インデックス**:

- `idx_chat_messages_session_sequence` (session_id, sequence)
- `idx_chat_messages_session_created` (session_id, created_at)

**関連 US**: US-002, US-003

---

### 3.5 `message_parts` (メッセージパーツ)

| カラム            | 型      | 主キー | 外部キー                        | 用途                                              |
| ----------------- | ------- | ------ | ------------------------------- | ------------------------------------------------- |
| `id`              | text    | ✅     | -                               | パーツID (UUID)                                   |
| `message_id`      | text    | -      | ✅ `chat_messages.id` (CASCADE) | 所属メッセージ                                    |
| `session_id`      | text    | -      | ✅ `chat_sessions.id` (CASCADE) | 所属セッション                                    |
| `kind`            | text    | -      | -                               | 種別 (`text` / `tool_invocation` / `tool_result`) |
| `sequence`        | integer | -      | -                               | メッセージ内での順序                              |
| `content_text`    | text    | -      | -                               | テキストコンテンツ                                |
| `content_json`    | text    | -      | -                               | JSON コンテンツ                                   |
| `mime_type`       | text    | -      | -                               | MIME タイプ                                       |
| `size_bytes`      | integer | -      | -                               | サイズ（バイト）                                  |
| `tool_call_id`    | text    | -      | -                               | ツール呼び出しID                                  |
| `tool_name`       | text    | -      | -                               | ツール名                                          |
| `status`          | text    | -      | -                               | ステータス                                        |
| `error_code`      | text    | -      | -                               | エラーコード                                      |
| `error_message`   | text    | -      | -                               | エラーメッセージ                                  |
| `related_part_id` | text    | -      | `message_parts.id` (SET NULL)   | 関連パーツ                                        |
| `metadata`        | text    | -      | -                               | メタデータ (JSON)                                 |
| `created_at`      | integer | -      | -                               | 作成日時                                          |
| `updated_at`      | integer | -      | -                               | 更新日時                                          |

**インデックス**:

- `idx_message_parts_message_sequence` (message_id, sequence)
- `idx_message_parts_session_kind` (session_id, kind)
- `idx_message_parts_tool_call_id` (tool_call_id) - UNIQUE

**関連 US**: US-002, US-005

---

### 3.6 `tool_invocations` (ツール実行履歴)

| カラム               | 型      | 主キー | 外部キー                        | 用途                                           |
| -------------------- | ------- | ------ | ------------------------------- | ---------------------------------------------- |
| `id`                 | text    | ✅     | -                               | 実行ID (UUID)                                  |
| `session_id`         | text    | -      | ✅ `chat_sessions.id` (CASCADE) | 所属セッション                                 |
| `message_id`         | text    | -      | ✅ `chat_messages.id` (CASCADE) | 所属メッセージ                                 |
| `invocation_part_id` | text    | -      | ✅ `message_parts.id` (CASCADE) | tool_invocation パーツ                         |
| `result_part_id`     | text    | -      | `message_parts.id` (SET NULL)   | tool_result パーツ                             |
| `tool_call_id`       | text    | -      | -                               | ツール呼び出しID (UNIQUE)                      |
| `tool_name`          | text    | -      | -                               | ツール名                                       |
| `input_json`         | text    | -      | -                               | 入力 (JSON)                                    |
| `output_json`        | text    | -      | -                               | 出力 (JSON)                                    |
| `status`             | text    | -      | -                               | ステータス (`pending` / `completed` / `error`) |
| `error_code`         | text    | -      | -                               | エラーコード                                   |
| `error_message`      | text    | -      | -                               | エラーメッセージ                               |
| `latency_ms`         | integer | -      | -                               | 実行時間（ミリ秒）                             |
| `started_at`         | integer | -      | -                               | 開始日時                                       |
| `completed_at`       | integer | -      | -                               | 完了日時                                       |
| `created_at`         | integer | -      | -                               | 作成日時                                       |
| `updated_at`         | integer | -      | -                               | 更新日時                                       |

**インデックス**:

- `idx_tool_invocations_tool_name` (tool_name)
- `idx_tool_invocations_status_completed` (status, completed_at)
- `idx_tool_invocations_session_created` (session_id, created_at)

**関連 US**: US-005

---

### 3.7 `session_snapshots` (セッション圧縮スナップショット)

| カラム              | 型      | 主キー | 外部キー                        | 用途                               |
| ------------------- | ------- | ------ | ------------------------------- | ---------------------------------- |
| `id`                | text    | ✅     | -                               | スナップショットID (UUID)          |
| `session_id`        | text    | -      | ✅ `chat_sessions.id` (CASCADE) | 所属セッション                     |
| `kind`              | text    | -      | -                               | 種別 (`summary` / `checkpoint`)    |
| `content_json`      | text    | -      | -                               | コンテンツ (JSON) - 要約テキスト等 |
| `message_cutoff_id` | text    | -      | ✅ `chat_messages.id` (CASCADE) | カットオフメッセージ               |
| `token_count`       | integer | -      | -                               | トークン数                         |
| `created_at`        | integer | -      | -                               | 作成日時                           |
| `updated_at`        | integer | -      | -                               | 更新日時                           |

**インデックス**:

- `idx_session_snapshots_kind` (session_id, kind)

**関連 US**: US-009

---

### 3.8 `model_configs` (モデル設定)

| カラム                          | 型        | 主キー | 用途                                             |
| ------------------------------- | --------- | ------ | ------------------------------------------------ |
| `id`                            | text      | ✅     | モデルID (`provider:model`)                      |
| `provider`                      | text      | -      | プロバイダー (`openai` / `anthropic` / `google`) |
| `model`                         | text      | -      | モデル名 (`gpt-4o` / `claude-3-5-sonnet` 等)     |
| `max_input_tokens`              | integer   | -      | 最大入力トークン数                               |
| `max_output_tokens`             | integer   | -      | 最大出力トークン数                               |
| `default_compression_threshold` | real      | -      | デフォルト圧縮閾値 (0.95)                        |
| `recommended_retention_tokens`  | integer   | -      | 推奨保持トークン数 (1000)                        |
| `source`                        | text      | -      | データソース (`api` / `manual` / `default`)      |
| `last_updated`                  | timestamp | -      | 最終更新日時                                     |
| `created_at`                    | timestamp | -      | 作成日時                                         |

**インデックス**:

- `idx_model_configs_provider` (provider)

**関連 US**: US-008, US-009

---

### 3.9 `tool_permission_rules` (ツール権限ルール)

| カラム         | 型      | 主キー | 用途                                         |
| -------------- | ------- | ------ | -------------------------------------------- |
| `id`           | text    | ✅     | ルールID (UUID)                              |
| `server_id`    | text    | -      | MCP サーバーID (NULL = 全サーバー)           |
| `tool_name`    | text    | -      | ツール名 (NULL = 全ツール)                   |
| `tool_pattern` | text    | -      | ツール名パターン (ワイルドカード `delete_*`) |
| `auto_approve` | integer | -      | 自動承認 (1=自動, 0=要承認)                  |
| `priority`     | integer | -      | 優先度（昇順評価）                           |
| `created_at`   | text    | -      | 作成日時                                     |
| `updated_at`   | text    | -      | 更新日時                                     |

**インデックス**:

- `idx_tool_permission_rules_server` (server_id)
- `idx_tool_permission_rules_priority` (priority)

**関連 US**: US-006, US-007

---

## 4. ユーザーストーリー → テストシナリオ

| US ID  | テスト種別  | テストシナリオ概要             | 対象ファイル/API                |
| ------ | ----------- | ------------------------------ | ------------------------------- |
| US-001 | Unit        | AI プロバイダー CRUD 操作      | `AISettingsService.test.ts`     |
| US-001 | Integration | モデル一覧取得（実API）        | `ai-settings.test.ts`           |
| US-002 | Unit        | Mastra Agent 初期化            | `MastraChatService.test.ts`     |
| US-002 | Integration | AI ストリーミング（モック）    | `streamMastraText.test.ts`      |
| US-003 | Unit        | セッション CRUD                | `ChatSessionStore.test.ts`      |
| US-003 | Integration | セッション切り替え             | `SessionManager.test.tsx`       |
| US-004 | Unit        | MCP サーバー CRUD              | `mcp-manager.test.ts`           |
| US-004 | Integration | MCP サーバー起動・停止         | `mcp-integration.test.ts`       |
| US-005 | Unit        | ツール変換（MCP→Mastra）       | `MastraToolService.test.ts`     |
| US-005 | E2E         | ツール実行（filesystem_read）  | 手動テスト                      |
| US-006 | Unit        | 権限ルール評価                 | `ToolPermissionService.test.ts` |
| US-006 | E2E         | HITL 承認ダイアログ            | 手動テスト (Phase 3.2)          |
| US-007 | Unit        | ルール CRUD                    | `ToolPermissionService.test.ts` |
| US-008 | Unit        | トークン計測                   | `TokenCounter.test.ts`          |
| US-008 | Integration | コンテキストチェック           | `CompressionService.test.ts`    |
| US-009 | Unit        | 要約生成                       | `SummarizationService.test.ts`  |
| US-009 | Integration | 自動圧縮フロー                 | `CompressionService.test.ts`    |
| US-011 | Unit        | プロキシ設定保存・読込         | `proxy.test.ts`                 |
| US-011 | Integration | プロキシ接続テスト             | `connectionTest.test.ts`        |
| US-012 | Unit        | 証明書設定保存・読込           | `certificate.test.ts`           |
| US-012 | Integration | 証明書接続テスト               | `connectionTest.test.ts`        |
| US-014 | Unit        | セッション検索                 | `ChatSessionStore.test.ts`      |
| US-016 | Unit        | 更新チェック                   | `updater.test.ts`               |
| US-016 | E2E         | 更新ダウンロード・インストール | 手動テスト                      |

---

## 5. 影響範囲分析（変更時の影響テーブル）

### 例: `chat_messages` テーブルにカラム追加した場合

| 影響範囲        | 変更対象                                | 影響度 |
| --------------- | --------------------------------------- | ------ |
| DB Schema       | `src/backend/db/schema.ts`              | 高     |
| Migration       | `resources/db/migrations/XXXX_*.sql`    | 高     |
| Backend Service | `ChatSessionStore.ts` (CRUD更新)        | 中     |
| IPC API         | 型定義 `@common/chat-types.ts`          | 中     |
| Frontend UI     | `SessionManager.tsx` (表示更新)         | 低     |
| テスト          | `ChatSessionStore.test.ts` (追加テスト) | 中     |

---

## 6. トレーサビリティ検証チェックリスト

リリース前に以下を確認:

- [ ] 全 US に対応する IPC API が存在する
- [ ] 全 API に対応する Backend Service が実装されている
- [ ] 全 DB テーブルに対応する Drizzle Schema が定義されている
- [ ] 全 US に対応するテストシナリオが存在する
- [ ] 全 US の受入基準が満たされている（`acceptance-criteria.md` 参照）

---

## まとめ

本トレーサビリティマトリックスにより、以下が可能となる:

1. **要求追跡**: ユーザーストーリーから実装まで一貫して追跡可能
2. **影響範囲分析**: テーブル変更時の影響を迅速に特定
3. **テスト網羅性**: 各要求に対するテスト範囲を明確化
4. **整合性検証**: 要求と実装の乖離を検出

**次のステップ**:

- 変更時はマトリックスを更新
- 定期的に整合性を検証（CI で自動化可能）
- 新機能追加時は必ずマッピングを追加
