# チャットセッション永続化設計文書

## 概要

このドキュメントは、チャットセッション（会話履歴）の記録・再開機構の設計仕様をまとめたものです。ユーザーがアプリケーションを終了してから再起動した場合でも、以前の会話を復元して継続できる機能を提供します。

**最終更新**: 2025-11-12  
**ステータス**: 要件定義フェーズ

---

## 目次

1. [背景と問題](#背景と問題)
2. [設計の目的](#設計の目的)
3. [用語定義](#用語定義)
4. [要件仕様](#要件仕様)
5. [データモデル](#データモデル)
6. [システムアーキテクチャ](#システムアーキテクチャ)
7. [API 仕様](#api-仕様)
8. [ユーザーフロー](#ユーザーフロー)
9. [スキーマバージョン管理](#スキーマバージョン管理)
10. [エラーハンドリング](#エラーハンドリング)
11. [マイグレーション戦略](#マイグレーション戦略)
12. [実装計画](#実装計画)

---

## 背景と問題

### 現在の状態

現在のアプリケーションでは、チャットセッションがメモリ上にのみ保持されています：

- **制限事項**：
  - アプリを再起動するとチャット履歴が消失
  - 長時間の会話を保存できない
  - 同じトピックの複数の会話を管理できない
  - 会話の履歴を後から参照できない

### ユーザーニーズ

- 中断した会話を後から再開したい
- 複数のセッション（トピックごと）を管理したい
- 過去の会話を検索・参照したい
- セッションをエクスポート・共有したい（将来）

---

## 設計の目的

1. **会話の永続化**: チャット履歴をデータベースに安全に保存
2. **セッション管理**: 複数のチャットセッションを管理・切り替え
3. **再開機能**: 保存されたセッションを復元して会話継続
4. **メタデータ管理**: セッションの作成日時、最終更新日時、タイトル等を管理
5. **スケーラビリティ**: 大量のメッセージとセッションに対応
6. **バックワード互換性**: 既存機能への影響を最小化

---

## 用語定義

| 用語 | 定義 |
|------|------|
| **セッション** | 1 つの会話スレッド。複数のメッセージで構成される |
| **メッセージ** | ユーザーまたは AI の 1 つの発話。テキスト、メタデータを含む |
| **メッセージスレッド** | メッセージの連続。セッションを形成 |
| **セッションメタデータ** | セッションのタイトル、作成日時、最終更新日時、モデル情報など |
| **ツール呼び出し** | MCP ツールの実行記録（呼び出し、結果含む） |
| **永続化** | データベースへの保存・復元処理 |

---

## 要件仕様

### 機能要件（FR）

#### FR1: セッション管理

- **FR1.1**: 新規セッション作成
  - ユーザーが新しいチャットを開始できる
  - 自動的にセッション ID を生成
  - デフォルトタイトルは日時 or ユーザー指定

- **FR1.2**: セッション一覧表示
  - すべてのセッションを一覧で表示
  - タイトル、最終更新日時でソート可能
  - タイトル・メッセージ内容で検索可能

- **FR1.3**: セッション削除
  - 不要なセッションを削除（ハードデリート）
  - 削除前に確認プロンプトを表示
  - DB からセッションとすべてのメッセージが完全に削除される

- **FR1.4**: セッションタイトル編集
  - セッションのタイトルを後から変更可能
  - 空文字は許可しない

- **FR1.5**: セッション切り替え
  - 複数セッション間をシームレスに切り替え可能
  - 前のセッション状態は保存

#### FR2: メッセージ永続化

- **FR2.1**: メッセージ保存
  - ユーザー入力とAI応答の両方を保存
  - タイムスタンプ、ロール（user/assistant/system）を記録

- **FR2.2**: メッセージ表示
  - セッション内のすべてのメッセージを新しい順に表示
  - ページング対応（大規模セッションに対応）

- **FR2.3**: メッセージ削除
  - 特定のメッセージを削除可能
  - または会話の一部を削除可能

- **FR2.4**: メッセージ編集
  - ユーザーメッセージの再編集・再送信機能
  - AI の応答以降を削除して再送信

#### FR3: セッション再開

- **FR3.1**: 自動復元
  - アプリ起動時に最後に使用したセッションを復元
  - ユーザー設定で自動復元を ON/OFF 可能

- **FR3.2**: 手動復元
  - セッション一覧から選択して復元
  - 復元後すぐに会話継続可能

- **FR3.3**: コンテキスト復元
  - セッション作成時の AI モデル設定を復元
  - または起動時のデフォルトモデルを使用

#### FR4: メタデータ管理

- **FR4.1**: セッションメタデータ
  - id（UUID）
  - title（ユーザー設定）
  - createdAt（ISO 8601）
  - updatedAt（ISO 8601）
  - modelConfig（使用 AI モデル情報）
  - messageCount（メッセージ数）

- **FR4.2**: メッセージメタデータ
  - id（UUID）
  - sessionId（所属セッション）
  - role（user/assistant/system）
  - content（メッセージ本文）
  - timestamp（ISO 8601）
  - toolCalls（MCP ツール呼び出し情報）
  - usage（トークン使用量など）

#### FR5: ツール呼び出し履歴

- **FR5.1**: ツール呼び出し記録
  - MCP ツール呼び出しの名前、入力、出力を記録
  - タイムスタンプを記録

- **FR5.2**: ツール呼び出し表示
  - メッセージ内に「ツール使用」インジケータを表示

### 非機能要件（NFR）

#### NFR1: パフォーマンス

- **NFR1.1**: レスポンス時間
  - セッション一覧取得: < 500ms（100 セッション）
  - メッセージ読み込み: < 1000ms（1000 メッセージ）
  - セッション切り替え: < 200ms

- **NFR1.2**: スケーラビリティ
  - 1000 セッション、10K メッセージまでスムーズに対応
  - 必要に応じてページング実装

#### NFR2: データ整合性

- **NFR2.1**: ACID 特性
  - メッセージ保存時はトランザクション保証
  - 部分的な保存を防ぐ

- **NFR2.2**: 同時実行制御
  - 複数プロセスからの同時アクセス対応
  - libsql（SQLite ベース）のロック機構を活用

#### NFR3: ストレージ

- **NFR3.1**: ディスク容量
  - 1 メッセージ平均 1KB （テキストのみ）
  - 10K メッセージ = 約 10MB
  - ユーザーデータディレクトリ配下に保存

- **NFR3.2**: クリーンアップ
  - 古いセッション（90 日以上未使用）の自動削除オプション（手動で OFF 可能）
  - ユーザーが明示的に手動削除可能（ハードデリート）

#### NFR4: セキュリティ

- **NFR4.1**: アクセス制御
  - セッションはローカルユーザーのみアクセス可能
  - API キー等の機密情報は保存しない

- **NFR4.2**: データ保護
  - センシティブデータ（API キー）は保存対象外
  - ローカル暗号化検討（将来）

#### NFR5: 可用性

- **NFR5.1**: バックアップ
  - セッションデータのバックアップ機能（将来）
  - クラウド同期検討（将来）

- **NFR5.2**: 復旧
  - DB 破損時の修復メカニズム
  - フォールバック: メモリ内セッション

---

## データモデル

### アーキテクチャ方針

**マルチレベルの正規化テーブル設計**を採用します。理由：

1. **正規化スキーマ（3NF）**: データ整合性が高く、保守性に優れている
2. **OPENCODE 設計の踏襲**: 既存の成功事例（Session → Message → Part 階層）を SQL テーブルで実装
3. **柔軟なクエリ**: ツール実行統計、エラー分析など SQL で直接実行可能
4. **将来への拡張性**: 要約・圧縮機能を後から追加しやすい
5. **段階的復元**: UI はメッセージ一覧を取得し、必要に応じてパートを遅延ロード可能

### スキーマ設計

```sql
-- 1. セッション（トップレベル）
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,      -- Unix timestamp (integer)
  updated_at INTEGER NOT NULL,      -- Unix timestamp (integer)

  -- メタデータ（プロバイダー設定の保持）
  provider_config_id TEXT,          -- AIProviderConfiguration.id
  model_id TEXT,                    -- AIModelDefinition.id

  -- スキーマバージョン管理
  data_schema_version INTEGER NOT NULL DEFAULT 1,

  -- UI キャッシュ
  message_count INTEGER NOT NULL DEFAULT 0
);

-- 2. メッセージ（role: user | assistant | system）
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,

  -- メッセージ属性
  role TEXT NOT NULL,              -- 'user' | 'assistant' | 'system'
  created_at INTEGER NOT NULL,     -- Unix timestamp (integer)
  completed_at INTEGER,            -- assistant の streaming 完了時刻 (Unix timestamp)

  -- トークン使用量
  input_tokens INTEGER,
  output_tokens INTEGER,

  -- エラー情報
  error TEXT,                      -- JSON: { name, message, details }

  -- メッセージ分岐対応（将来拡張用）
  parent_message_id TEXT,

  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL
);

-- 3. メッセージパート（text | tool_call）
CREATE TABLE message_parts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  session_id TEXT NOT NULL,

  -- パートタイプ
  type TEXT NOT NULL,              -- 'text' | 'tool_call'

  -- 時系列
  created_at INTEGER NOT NULL,     -- Unix timestamp (integer)
  updated_at INTEGER NOT NULL,     -- Unix timestamp (integer)

  -- テキストパート用
  content TEXT,

  -- ツール呼び出しパート用（メタデータのみ、実行結果は tool_call_results）
  tool_call_id TEXT UNIQUE,
  tool_name TEXT,
  tool_input TEXT,                 -- JSON
  tool_input_text TEXT,            -- 整形済み表示用

  -- その他メタデータ
  metadata TEXT,                   -- JSON

  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- 4. ツール呼び出し結果
CREATE TABLE tool_call_results (
  id TEXT PRIMARY KEY,
  part_id TEXT NOT NULL UNIQUE,
  message_id TEXT NOT NULL,
  session_id TEXT NOT NULL,

  -- ツール識別情報
  tool_call_id TEXT NOT NULL UNIQUE,
  tool_name TEXT NOT NULL,

  -- 実行結果
  output TEXT,                     -- JSON
  status TEXT NOT NULL,            -- 'success' | 'error'
  error TEXT,
  error_code TEXT,

  -- 実行時刻
  started_at INTEGER,              -- Unix timestamp (integer)
  completed_at INTEGER,            -- Unix timestamp (integer)

  -- 記録
  created_at INTEGER NOT NULL,     -- Unix timestamp (integer)
  updated_at INTEGER NOT NULL,     -- Unix timestamp (integer)

  FOREIGN KEY (part_id) REFERENCES message_parts(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- インデックス戦略
CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX idx_message_parts_message_id ON message_parts(message_id);
CREATE INDEX idx_message_parts_session_id ON message_parts(session_id);
CREATE INDEX idx_message_parts_tool_call_id ON message_parts(tool_call_id);
CREATE INDEX idx_tool_call_results_message_id ON tool_call_results(message_id);
CREATE INDEX idx_tool_call_results_tool_name ON tool_call_results(tool_name);
```

### TypeScript インターフェース

```typescript
// セッション（DBレコード型）
interface ChatSessionRow {
  id: string
  title: string
  createdAt: number              // Unix timestamp (integer)
  updatedAt: number              // Unix timestamp (integer)
  providerConfigId?: string      // AIProviderConfiguration.id
  modelId?: string               // AIModelDefinition.id
  dataSchemaVersion: number
  messageCount: number
}

// メッセージ（DBレコード型）
interface ChatMessageRow {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  createdAt: number              // Unix timestamp (integer)
  completedAt?: number           // Unix timestamp (integer)
  inputTokens?: number
  outputTokens?: number
  error?: string                 // JSON string
  parentMessageId?: string
}

// メッセージパート（DBレコード型）
interface MessagePartRow {
  id: string
  messageId: string
  sessionId: string
  type: 'text' | 'tool_call'
  createdAt: number              // Unix timestamp (integer)
  updatedAt: number              // Unix timestamp (integer)

  // text タイプ
  content?: string

  // tool_call タイプ（メタデータのみ、ステータスは tool_call_results）
  toolCallId?: string
  toolName?: string
  toolInput?: string             // JSON string
  toolInputText?: string
  metadata?: string              // JSON string
}

// ツール呼び出し結果（DBレコード型）
interface ToolCallResultRow {
  id: string
  partId: string
  messageId: string
  sessionId: string
  toolCallId: string
  toolName: string
  output?: string                // JSON string
  status: 'success' | 'error'
  error?: string
  errorCode?: string
  startedAt?: number             // Unix timestamp (integer)
  completedAt?: number           // Unix timestamp (integer)
  createdAt: number              // Unix timestamp (integer)
  updatedAt: number              // Unix timestamp (integer)
}

// ドメイン型（UI/API 向け）- Date/ISO 8601 に変換済み
interface TextPart {
  type: 'text'
  id: string
  content: string
  createdAt: string              // ISO 8601 (UI表示用)
}

interface ToolCallPart {
  type: 'tool_call'
  id: string
  toolCallId: string
  toolName: string
  input: unknown                 // Parsed JSON
  inputText: string
  // ステータスは tool_call_results から取得
  status: 'pending' | 'success' | 'error'  // pending: 結果なし, success/error: 結果あり
  result?: {
    output?: unknown             // Parsed JSON
    error?: string
    errorCode?: string
  }
  startedAt?: string             // ISO 8601 (UI表示用)
  completedAt?: string           // ISO 8601 (UI表示用)
}

// 複合メッセージ（UI に返すデータ）
interface ChatMessageWithParts {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  createdAt: string              // ISO 8601 (UI表示用)
  completedAt?: string           // ISO 8601 (UI表示用)
  inputTokens?: number
  outputTokens?: number
  error?: { name: string; message: string; details?: unknown }  // Parsed JSON
  parentMessageId?: string
  parts: (TextPart | ToolCallPart)[]
}

// セッション + メッセージ（セッション復元時）
interface ChatSessionWithMessages {
  id: string
  title: string
  createdAt: string              // ISO 8601 (UI表示用)
  updatedAt: string              // ISO 8601 (UI表示用)
  providerConfigId?: string
  modelId?: string
  dataSchemaVersion: number
  messageCount: number
  messages: ChatMessageWithParts[]
}

// API リクエスト型
interface CreateSessionRequest {
  title?: string
  providerConfigId?: string      // AIProviderConfiguration.id
  modelId?: string               // AIModelDefinition.id
}

interface AddMessageRequest {
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  parts: AddMessagePartRequest[] // 複数パートを一括で保存
  inputTokens?: number
  outputTokens?: number
  error?: { name: string; message: string; details?: unknown }
}

interface AddMessagePartRequest {
  type: 'text' | 'tool_call'
  // text
  content?: string
  // tool_call
  toolCallId?: string
  toolName?: string
  input?: unknown
}

interface UpdateToolCallResultRequest {
  toolCallId: string
  output?: unknown
  status: 'success' | 'error'
  error?: string
  errorCode?: string
}

interface DeleteMessagesAfterRequest {
  sessionId: string
  messageId: string
}
```

### 現状の Renderer（UI）上のメッセージ構造

現在のレンダラーでは `@assistant-ui/react` ライブラリを使用しており、メッセージは以下の構造で扱われています。

**AIMessage（Backend ↔ Renderer の基本メッセージ型）**:

```typescript
// src/common/types.ts
export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string  // プレーンテキスト（ツール情報は含まない）
}
```

**Backend イベントペイロード（ストリーミング中の通知）**:

```typescript
// ツール呼び出し開始イベント
interface ToolCallPayload {
  sessionId: string
  toolCallId: string
  toolName: string
  input: unknown
}

// ツール実行結果イベント
interface ToolResultPayload {
  sessionId: string
  toolCallId: string
  toolName: string
  output: unknown
}
```

**ThreadMessage (assistant-ui のメッセージ型)**:

```typescript
interface ThreadMessage {
  role: 'user' | 'assistant' | 'system'
  content: ContentPart[]           // テキストとツール呼び出しの混合
  id: string
}

// コンテンツ部品（複合型）
type ContentPart = TextPart | ToolCallPart

interface TextPart {
  type: 'text'
  text: string
}

interface ToolCallPart {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: unknown                     // ツール入力パラメータ
  argsText: string                  // JSON 文字列化
  result?: unknown                  // ツール出力（実行結果）
}
```

**データフロー**:

1. **Backend → Renderer**: ストリーミング中は `aiChatChunk` イベント（テキスト）と `aiToolCall`/`aiToolResult` イベント（ツール）を個別送信
2. **Renderer 内流通**: `ThreadMessage[]` に変換（ContentPart[] を含む）
3. **表示**: TextPart は Markdown として、ToolCallPart は折りたたみ可能なカードとして表示

### 採用設計の理念

OPENCODE は Storage を JSON ファイルで実装していますが、本プロジェクトでは同じ論理構造を SQL テーブルで実装します：

### 4テーブル構造の役割分担

1. **chat_sessions（セッション）**
   - メタデータ（title、createdAt、updatedAt、providerConfigId、modelId など）
   - セッション全体の管理

2. **chat_messages（メッセージ）**
   - role（user/assistant/system）、タイムスタンプ、トークン使用量
   - メッセージ単位の管理

3. **message_parts（メッセージ内の部分）**
   - type（text/tool_call）ごとの内容
   - **ツール呼び出しのメタデータ**：tool_call_id, tool_name, tool_input
   - **重要**：実行ステータスや結果は含まない（INSERT のみ、UPDATE なし）

4. **tool_call_results（ツール実行結果）**
   - **ツール実行の結果**：output, status（success/error）, error
   - **実行時間**：started_at, completed_at
   - message_parts とは **1:1 関係**（tool_call_id で紐付け）
   - **時系列の分離**：ツール呼び出し（即座）と結果（数秒後）は別タイミングで記録

### テーブル分離の理由

**なぜ message_parts に tool_status を持たせないのか？**

```
【ストリーミング中の時系列】
1. aiToolCall イベント → message_parts に INSERT（tool_input のみ）
2. ツール実行中...（数秒〜数十秒）
3. aiToolResult イベント → tool_call_results に INSERT（output, status）
```

- `message_parts` は **呼び出し時に一度だけ INSERT**（更新不要）
- `tool_call_results` は **結果が到着したら INSERT**（INSERT のみ、UPDATE 不要）
- **2つのテーブル = 2つの時点** を明確に分離

**正規化テーブル設計のメリット**:
- ✅ **正規化スキーマ**: 3NF に従い、データ整合性が高い
- ✅ **効率的なクエリ**: 特定ツール実行の統計、エラーメッセージの集計など SQL で直接実行可能
- ✅ **段階的な拡張**: 将来「要約メッセージ」や「コンパクション」を追加しやすい
- ✅ **OPENCODE との親和性**: 同じレベルの階層構造を採用
- ✅ **INSERT のみで完結**: UPDATE 不要、データ整合性が保ちやすい

---

## システムアーキテクチャ

### 層構造

```
┌─────────────────────────────────────────────────────┐
│              Renderer (React)                       │
│  - ChatInterface Component                          │
│  - SessionList Component                            │
│  - SessionManager Context                           │
└─────────────────────┬───────────────────────────────┘
                      │ IPC/RPC
┌─────────────────────▼───────────────────────────────┐
│              Handler (Backend)                      │
│  - addChatMessage()                                 │
│  - getChatSession()                                 │
│  - listChatSessions()                               │
│  - deleteChatSession()                              │
│  - updateToolCallResult()                           │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│        ChatSessionStore (Business Logic)            │
│  - Session CRUD（テーブル操作）                     │
│  - Message 操作（メッセージ・パート追加）           │
│  - ツール結果更新                                   │
│  - タイムスタンプ・メタデータ管理                    │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│         Database Layer (better-sqlite3 + Drizzle)   │
│  - chat_sessions table                              │
│  - chat_messages table                              │
│  - message_parts table                              │
│  - tool_call_results table                          │
└─────────────────────┬───────────────────────────────┘
                      │
           ┌──────────▼──────────┐
           │   SQLite DB File    │
           │  (app.db)           │
           └─────────────────────┘
```

### コンポーネント責務

#### Renderer Layer

- セッション一覧 UI 表示
- 現在のセッション切り替え
- メッセージ入力・表示
- SessionManager Context で状態管理
- ローカルストレージ: lastSessionId

#### Backend Handler

- IPC API エントリーポイント
- リクエスト検証
- ChatSessionStore に委譲
- ストリーミング中のイベント（aiToolCall, aiToolResult）をフックして永続化

#### ChatSessionStore

- Session CRUD 操作（テーブル操作）
- Message・Part 追加（複数テーブルへの INSERT）
- ツール結果更新（tool_call_results への INSERT/UPDATE）
- データベーストランザクション管理
- Unix timestamp ↔ ISO 8601 変換

#### Database Layer

- Drizzle ORM スキーマ定義
- テーブル操作（4 テーブル）
- インデックス管理（session_id, created_at, tool_call_id など）

### データフロー：メッセージ追加（ストリーミング完了時）

```typescript
// Renderer -> Backend IPC
await backend.addChatMessage({
  sessionId: 'session-123',
  role: 'assistant',
  parts: [
    { type: 'text', content: 'Hello! I can help you with that.' },
    { type: 'tool_call', toolCallId: 'call_abc', toolName: 'filesystem_read', input: { path: 'file.txt' } }
  ],
  inputTokens: 120,
  outputTokens: 45
})

// Handler
async addChatMessage(request: AddMessageRequest) {
  return await chatSessionStore.addMessage(request)
}

// ChatSessionStore
async addMessage(request: AddMessageRequest) {
  const messageId = generateUUID()
  const now = Date.now()

  // 1. メッセージレコード挿入
  await db.insert(chatMessages).values({
    id: messageId,
    sessionId: request.sessionId,
    role: request.role,
    createdAt: now,
    completedAt: now,  // ストリーミング完了後なので即座に完了扱い
    inputTokens: request.inputTokens,
    outputTokens: request.outputTokens,
    error: request.error ? JSON.stringify(request.error) : null
  })

  // 2. パートレコード挿入（複数）
  for (const part of request.parts) {
    const partId = generateUUID()
    await db.insert(messageParts).values({
      id: partId,
      messageId,
      sessionId: request.sessionId,
      type: part.type,
      createdAt: now,
      updatedAt: now,
      content: part.type === 'text' ? part.content : null,
      toolCallId: part.type === 'tool_call' ? part.toolCallId : null,
      toolName: part.type === 'tool_call' ? part.toolName : null,
      toolInput: part.type === 'tool_call' ? JSON.stringify(part.input) : null,
      toolInputText: part.type === 'tool_call' ? JSON.stringify(part.input, null, 2) : null
      // tool_status は削除（結果は tool_call_results で管理）
    })
  }

  // 3. セッション更新（messageCount, updatedAt）
  await db.update(chatSessions)
    .set({
      messageCount: sql`${chatSessions.messageCount} + 1`,
      updatedAt: now
    })
    .where(eq(chatSessions.id, request.sessionId))

  return { messageId }
}
```

---

## 画面構成案

以下は Assistant UI の例（会話一覧 + 会話ビュー）を参考にした画面構成案です。
目的は「セッション一覧から選んで復元・継続する」操作を直感的に行える UI を提供することです。


### レイアウト（デスクトップ）

デスクトップアプリ専用の想定です。レイアウトはシンプルに二分割を基本とします。

1. 左カラム: セッション一覧（SessionList）
  - 新規セッションボタン
  - セッション項目（タイトル・最終更新・プレビュー）
  - ソフト削除済の表示切替

2. 中央カラム: 会話エリア（ChatPanel）
  - セッションヘッダ（タイトル、モデル情報、最終更新、アクション）
  - メッセージストリーム（MessageList）
    - 仮想化（大量レンダリング対策）
    - ストリーミングチャンクのリアルタイム表示（typing / partial）
    - ツール呼び出しカード（ToolCallCard）を埋め込み表示
  - 入力エリア（InputBar）
    - プロンプト履歴／ショートカット
    - モデル選択トグル（ModelSelector）
    - 送信 / 中止 ボタン（Streaming 中は中止）

### コンポーネント一覧と責務


- SessionList
  - Props: { sessions: ChatSession[], selectedId?: string }
  - Events: onSelect(sessionId), onCreate(), onDelete(sessionId), onRename(sessionId, title)
  - 責務: セッション取得（listChatSessions）, 新規作成トリガ

- ChatPanel
  - Props: { session: ChatSession }
  - Events: onAddMessage(req: AddMessageRequest), onEditMessage(...), onDeleteAfter(...)
  - 責務: メッセージ表示、ストリーミング UI の受け渡し、入力エリアとの接続

- MessageList
  - Props: { messages: ChatMessage[] }
  - 責務: 仮想スクロール、各種バブル（user/assistant/system）、ツール呼び出しレンダリング

- MessageBubble
  - Props: { message: ChatMessage }
  - 責務: role に応じた UI、ツール呼び出しインライン表示、編集/リトライ操作

- ToolCallCard
  - Props: { toolCall: ToolCallRecord }
  - 責務: ツール入力/出力の表示、再実行や詳細表示

- InputBar
  - Props: { defaultModel?: AIModelSelection }
  - Events: onSend(content, options), onAbort()
  - 責務: 送信、パラメータ指定、クイックプロンプト

- ModelSelector
  - Props: { value?: AIModelSelection }
  - Events: onChange(selection)
  - 責務: Provider/Model の切り替え UI（v2 の設定と連携）

### UI と既存 Backend API のマッピング

- 初期表示: Handler.getLastSessionId() → getChatSession() または createChatSession()
- セッション一覧: Handler.listChatSessions()
- セッション作成: Handler.createChatSession()
- メッセージ送信ワークフロー（簡素化）:
  1. ユーザーがメッセージを送信 → Renderer はまず Handler.addChatMessage() でユーザーメッセージを保存（即時保存）し、UI に表示する。
  2. その後 Renderer は Handler.streamAIText(...) を呼び出して AI ストリーミングを開始する。
  3. ストリーミング中はチャンクを UI に逐次表示する（未保存の一時表示）。
  4. ストリーミングが完了（aiChatEnd イベント受信）したタイミングで、完全な assistant メッセージを Handler.addChatMessage() で保存する。
  
- メッセージ編集/再送: editChatMessage(), deleteMessagesAfter() → 再送は streamAIText を呼び出し
- ツール呼び出し表示/結果: stream.ts で publishEvent('aiToolCall'/'aiToolResult') を受けて UI 側で ToolCallCard を更新

### ストリーミング UX の考慮点

- AI の応答は逐次チャンクで到着するため、MessageList は「編集中/確定前」状態を扱う必要がある（表示は逐次更新するが、永続化は完了時のみ行う）
- 中止（Abort）操作は InputBar の中止ボタンで発火 → Handler.abortAIText(sessionId)
- 永続化タイミング: assistant メッセージは "ストリーミング完了（aiChatEnd）" のタイミングでのみ DB に保存する。これにより保存タイミングを簡素化する。

### 編集・リトライワークフロー

- ユーザーは自分のメッセージを編集してから deleteMessagesAfter(messageId) を呼び出し、再度送信（streamAIText）できる
- assistant の応答を途中から再生成したい場合は、該当メッセージ以降を削除し再送

### パフォーマンス / 大量データ対策

- MessageList は仮想化（react-virtual、virtuoso など）を利用してレンダリング負荷を抑える
- messageCount をキャッシュして一覧のサムネイル表示を高速化
- 備考: Key-Value ストアでセッション全体を JSON として保存する方式では「最新 N 件のみを DB から取り出す」操作は困難であるため、当面はセッション全体をロードする設計とし、極端に長いセッションは別途アーカイブ等で対処する（現時点でページングは実装しない）

### アクセシビリティ & キーボード操作

- 主要操作にキーボードショートカットを提供（新規: Ctrl/Cmd+N、送信: Ctrl/Cmd+Enter）
- メッセージ入力は ARIA attributes を付与、スクリーンリーダー向けに role/labels を整備

### 実装フェーズ（UI 側）

1. SessionList + ChatPanel（基本レイアウト）
2. InputBar と送信フロー（addChatMessage によるユーザーメッセージ保存 + streamAIText による応答取得。assistant は完了時に保存）
3. ストリーミング表示（aiChatChunk のハンドリング）
4. ToolCallCard 表示（aiToolCall / aiToolResult）
5. パフォーマンス最適化（仮想化）

---

## API 仕様

### Backend API (IPC/RPC)

#### セッション操作

```typescript
// セッション作成
createChatSession(request: CreateSessionRequest): Promise<Result<string>>  // Returns sessionId

// セッション一覧取得（メタデータのみ、メッセージ含まない）
listChatSessions(options?: {
  limit?: number,
  offset?: number,
  sortBy?: 'updatedAt' | 'createdAt' | 'title'
}): Promise<Result<ChatSessionRow[]>>

// セッション取得（メッセージ・パート含む）
getChatSession(sessionId: string): Promise<Result<ChatSessionWithMessages | null>>

// セッション更新（タイトル、プロバイダー設定など）
updateChatSession(sessionId: string, updates: Partial<Pick<ChatSessionRow, 'title' | 'providerConfigId' | 'modelId'>>): Promise<Result<void>>

// セッション削除（CASCADE によりメッセージ・パートも削除）
deleteChatSession(sessionId: string): Promise<Result<void>>

// セッション検索（タイトル検索）
searchChatSessions(query: string): Promise<Result<ChatSessionRow[]>>
```

#### メッセージ操作

```typescript
// メッセージ追加（メッセージ + 複数パートを一括追加）
addChatMessage(request: AddMessageRequest): Promise<Result<string>>  // Returns messageId

// メッセージ削除（指定メッセージ以降を削除）
deleteMessagesAfter(sessionId: string, messageId: string): Promise<Result<void>>

// ツール呼び出し結果の更新（ストリーミング中に呼ばれる）
updateToolCallResult(request: UpdateToolCallResultRequest): Promise<Result<void>>
```

#### セッション復元

```typescript
// 最後に使用したセッション ID を取得（Settings テーブルから）
getLastSessionId(): Promise<Result<string | null>>

// 最後に使用したセッション ID を保存（Settings テーブルへ）
setLastSessionId(sessionId: string): Promise<Result<void>>
```

### 実装上の注意点

- **メッセージ追加時**:
  - トランザクション内で chat_messages, message_parts（複数）を INSERT
  - chat_sessions.messageCount と updatedAt を UPDATE
  - Unix timestamp で保存、API レスポンスは ISO 8601 に変換

- **メッセージ削除時**:
  - 指定メッセージ以降の chat_messages を DELETE（CASCADE で parts, results も削除）
  - messageCount を再計算して chat_sessions を UPDATE

- **セッション読み込み時**:
  - chat_messages, message_parts, tool_call_results を JOIN して取得
  - Unix timestamp を ISO 8601 に変換
  - JSON フィールド（toolInput, output, error）をパース

- **トランザクション**:
  - メッセージ追加は単一トランザクション（message + parts の整合性保証）
  - Drizzle ORM の `db.transaction()` を使用

---

## ユーザーフロー

### フロー1: 新規会話開始

```
ユーザー起動
  ↓
アプリ初期化
  ├─ 最後のセッション ID を取得
  ├─ 存在すれば復元、なければ新規作成
  ↓
新規セッション作成 (createChatSession)
  ├─ ID: UUID
  ├─ Title: "Chat-{timestamp}"
  ├─ CreatedAt: now
  ↓
ChatInterface に表示
```

### フロー2: メッセージ送信・保存

```
ユーザー: メッセージ入力 → 送信
  ↓
Renderer: ① ユーザーメッセージを即座に DB 保存
  ├─ addChatMessage({ role: 'user', parts: [{ type: 'text', content: '...' }] })
  ├─ UI に即座に表示
  ↓
Renderer: ② AI ストリーミング開始
  ├─ streamAIText(messages, options)
  ↓
Backend: ストリーミング処理（stream.ts）
  ├─ aiChatChunk イベント送信（テキスト）
  ├─ aiToolCall イベント送信（ツール呼び出し開始）
  ├─ aiToolResult イベント送信（ツール実行結果）
  ├─ aiChatEnd イベント送信（完了）
  ↓
Renderer: ③ ストリーミング完了時にアシスタントメッセージを DB 保存
  ├─ 蓄積した全パート（text, tool_call）を整形
  ├─ addChatMessage({
  │    role: 'assistant',
  │    parts: [
  │      { type: 'text', content: '完全なテキスト' },
  │      { type: 'tool_call', toolCallId, toolName, input }
  │    ],
  │    inputTokens, outputTokens
  │  })
  ↓
Backend: ChatSessionStore
  ├─ トランザクション開始
  ├─ chat_messages INSERT
  ├─ message_parts INSERT（複数）
  ├─ chat_sessions UPDATE（messageCount, updatedAt）
  ├─ コミット
  ↓
永続化完了
```

### フロー3: セッション切り替え

```
ユーザー: SessionList からセッションクリック
  ↓
Renderer: setLastSessionId(sessionId)
  ├─ Backend に通知（Settings テーブル更新）
  ↓
Renderer: getChatSession(sessionId)
  ├─ セッション + メッセージ + パート すべて取得
  ├─ JOIN で chat_messages, message_parts, tool_call_results を結合
  ↓
ChatInterface: メッセージ表示
  ├─ ThreadMessage[] に変換
  ├─ テキストパート、ツールパートをレンダリング
```

### フロー4: アプリ再起動後に会話再開

```
ユーザー: アプリ起動
  ↓
Backend: 初期化
  ├─ getLastSessionId() で最後のセッション取得
  ↓
Renderer: 最後のセッションを復元
  ├─ getChatSession(lastSessionId)
  ├─ セッション + メッセージ + パート すべて取得
  ↓
前回の会話が表示される
  ↓
ユーザー: 新しいメッセージ入力 → 会話継続
```

---

## スキーマバージョン管理

### 目的

データベーススキーマが将来変更される場合（テーブル構造、カラム追加など）に、段階的にマイグレーションを行う仕組みです。

### バージョン管理戦略

**Drizzle Kit のマイグレーション機能**を使用します：

1. **スキーマ変更時**: `pnpm run drizzle-kit generate` で migration SQL を生成
2. **アプリ起動時**: `db/index.ts` で自動的にマイグレーション実行
3. **バージョン記録**: Drizzle の `__drizzle_migrations` テーブルで管理

### マイグレーション例

```bash
# 新しいカラムを追加する場合
# 1. schema.ts を編集
# 2. マイグレーション生成
pnpm run drizzle-kit generate

# 3. アプリ起動時に自動適用（db/index.ts で migrate() 実行）
```

### セッションごとの data_schema_version フィールド

`data_schema_version` は各セッションのデータ構造バージョンを記録します：

- **v1（初期）**: 基本的なメッセージ・パート構造
- **v2（将来）**: 要約メッセージ、アーカイブパートなどの追加

**読み込み時の互換性処理**:

```typescript
async getChatSession(sessionId: string): Promise<ChatSessionWithMessages | null> {
  const session = await db.select()
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId))

  if (!session) return null

  // 古いバージョンのセッションを検出
  if (session.dataSchemaVersion < CURRENT_DATA_SCHEMA_VERSION) {
    logger.info(`Session ${sessionId} is v${session.dataSchemaVersion}, upgrading to v${CURRENT_DATA_SCHEMA_VERSION}`)
    // 必要に応じてデータ変換処理を実行
  }

  // メッセージ・パートを取得...
}
```

### メリット

1. **Drizzle 標準機能**: テーブル構造変更は Drizzle Kit で自動管理
2. **段階的対応**: 読み込み時に dataSchemaVersion をチェックして互換性処理
3. **保守性**: マイグレーション SQL は `resources/db/migrations/` に記録
4. **監査**: どのセッションが何バージョンかを追跡可能

---

## エラーハンドリング

### エラーシナリオと対応

| シナリオ | エラー | 対応 |
|---------|--------|------|
| DB 接続失敗 | DatabaseError | メモリ内セッション fallback |
| セッション不在 | SessionNotFound | エラー表示 + 新規セッション作成オプション |
| メッセージ保存失敗 | SaveError | ユーザー通知 + リトライボタン |
| 大量メッセージ読み込み | Timeout | ページング実装 + 警告表示 |
| 不正なセッション ID | ValidationError | エラー返却 |
| マイグレーション失敗 | MigrationError | ログ記録 + fallback 処理 |

### エラー復旧戦略

1. **自動復旧**: 一時的なエラーは自動リトライ（最大 3 回）
2. **ユーザー操作**: ユーザーが明示的にリトライ
3. **フォールバック**: DB 不可時はメモリ内セッション
4. **グレースフルデグラデーション**: セッション機能なしで動作

---

## マイグレーション戦略

### 段階的な実装

**フェーズ 1: スキーマ定義（1-2 week）**
- Drizzle schema 定義
- マイグレーション生成
- テーブル作成

**フェーズ 2: Backend API 実装（2-3 week）**
- ChatSessionManager 実装
- CRUD 操作実装
- ユニットテスト

**フェーズ 3: Handler 統合（1 week）**
- Handler に API メソッド追加
- IPC/RPC インテグレーション
- エラーハンドリング

**フェーズ 4: Renderer UI 実装（2-3 week）**
- SessionList コンポーネント
- SessionManager Context
- ChatInterface 修正

**フェーズ 5: 統合テスト・チューニング（1-2 week）**
- E2E テスト
- パフォーマンステスト
- UX 調整

### バックワード互換性

- 既存コードはメモリ内セッション使用可能（オプション）
- DB 移行は段階的（オンボーディング）
- フラグで機能 ON/OFF 切り替え可能

---

## 実装計画

### 実装の優先順位

1. **必須（MVP）**
   - Drizzle スキーマ定義（4 テーブル構造）
   - DB マイグレーション
   - ChatSessionStore 実装（CRUD + 複雑クエリ）
   - Handler IPC API 統合

2. **高優先度**
   - Renderer UI コンポーネント（SessionList、ChatPanel、MessageList）
   - SessionManager Context 状態管理
   - ストリーミング → パート保存フロー
   - セッション復元・切り替え

3. **中優先度**
   - エラーハンドリング・再試行
   - ツール呼び出し統計 API
   - セッション検索・フィルター
   - パフォーマンス最適化（インデックス、キャッシュ）

4. **低優先度（将来）**
   - セッションエクスポート
   - 自動要約・圧縮機能
   - クラウド同期
   - バージョン管理画面

### 実装チェックリスト

**フェーズ 1: DB スキーマ・Store 実装**

- [ ] Drizzle スキーマ定義
  - [ ] chat_sessions テーブル（snake_case カラム名、integer timestamp）
  - [ ] chat_messages テーブル（snake_case カラム名、integer timestamp）
  - [ ] message_parts テーブル（snake_case カラム名、integer timestamp）
  - [ ] tool_call_results テーブル（snake_case カラム名、integer timestamp）
  - [ ] インデックス定義（session_id, created_at, tool_call_id など）
- [ ] DB マイグレーション生成（`pnpm run drizzle-kit generate`）
- [ ] ChatSessionStore クラス実装
  - [ ] `createSession(title, providerConfigId, modelId)` - Returns sessionId
  - [ ] `getSession(sessionId)` - メッセージ・パート・結果を JOIN で取得、ISO 8601 変換
  - [ ] `listSessions(options)` - 一覧取得（メタデータのみ）
  - [ ] `updateSession(sessionId, updates)` - タイトル、設定更新
  - [ ] `deleteSession(sessionId)` - CASCADE でメッセージ・パートも削除
  - [ ] `addMessage(request: AddMessageRequest)` - トランザクション内で message + parts 追加
  - [ ] `updateToolCallResult(request)` - tool_call_results テーブル INSERT/UPDATE
  - [ ] `deleteMessagesAfter(sessionId, messageId)` - 以降削除 + messageCount 再計算
  - [ ] Unix timestamp ↔ ISO 8601 変換ヘルパー関数

**フェーズ 2: Handler IPC 統合**

- [ ] Backend API メソッド追加（`src/backend/handlers/`）
  - [ ] `createChatSession(request)` - Returns sessionId
  - [ ] `listChatSessions(options)`
  - [ ] `getChatSession(sessionId)`
  - [ ] `updateChatSession(sessionId, updates)`
  - [ ] `deleteChatSession(sessionId)`
  - [ ] `addChatMessage(request)` - Returns messageId
  - [ ] `updateToolCallResult(request)`
  - [ ] `deleteMessagesAfter(sessionId, messageId)`
  - [ ] `getLastSessionId()` / `setLastSessionId(sessionId)` - Settings テーブル経由
- [ ] ストリーミング完了時の永続化
  - [ ] Renderer 側で aiChatEnd イベント受信時に addChatMessage() 呼び出し
  - [ ] 蓄積したパート（text, tool_call）を整形して送信
  - [ ] ツール結果は既に updateToolCallResult() で保存済み
- [ ] エラーハンドリング・トランザクション
  - [ ] Drizzle の `db.transaction()` でメッセージ追加を保証

**フェーズ 3: ユニットテスト**

- [ ] ChatSessionStore テスト
  - [ ] CRUD 操作（create, get, list, update, delete）
  - [ ] メッセージ追加・完了
  - [ ] ツール呼び出しパート追加・結果更新
  - [ ] トランザクション整合性
- [ ] Handler API テスト
- [ ] ストリーミング → persist フロー テスト

**フェーズ 4: Renderer UI**

- [ ] SessionList コンポーネント
  - [ ] セッション一覧表示
  - [ ] 新規セッション作成ボタン
  - [ ] セッション選択・切り替え
  - [ ] セッション削除
- [ ] ChatPanel コンポーネント
  - [ ] ヘッダー（セッション名、モデル情報）
  - [ ] MessageList（仮想化）
  - [ ] InputBar（テキスト入力、送信、中止）
- [ ] MessageBubble コンポーネント
  - [ ] ユーザーメッセージ表示
  - [ ] Assistant メッセージ表示（streaming 中）
  - [ ] パート分割表示（TextPart、ToolCallPart）
- [ ] ToolCallCard コンポーネント
  - [ ] ツール入力・出力表示
  - [ ] 実行状態表示（pending/running/completed/error）
- [ ] SessionManager Context
  - [ ] 現在セッション管理
  - [ ] セッション一覧管理
  - [ ] メッセージ一覧管理
- [ ] ストリーミング UI
  - [ ] リアルタイムチャンク表示
  - [ ] ツール呼び出しカード動的更新
  - [ ] 中止ボタン機能

**フェーズ 5: 統合テスト・最適化**

- [ ] E2E テスト（セッション作成 → メッセージ送信 → 結果保存）
- [ ] パフォーマンステスト（1000+ メッセージ）
- [ ] UI レスポンシブテスト
- [ ] キャッシュ戦略検証

### 開発タイムライン（概算）

| フェーズ | 内容 | 期間 |
|---------|------|------|
| Phase 1 | DB スキーマ + ChatSessionStore 実装 | 1 週間 |
| Phase 2 | Handler IPC 統合 + ストリーミングフロー | 1 週間 |
| Phase 3 | ユニットテスト + 修正 | 3-4 日 |
| Phase 4 | Renderer UI 実装 | 1.5 週間 |
| Phase 5 | 統合テスト・最適化 | 1 週間 |

**合計**: 約 5-5.5 週間

---

## まとめ

このドキュメントでは、チャットセッション永続化機構の設計を提案しました。

**採用した方式：マルチレベル正規化テーブル設計（OPENCODE 準拠）**

### メリット

1. **正規化スキーマ（3NF）**: データ整合性が高い
2. **SQL 効率性**: ツール統計、エラー分析が直接可能
3. **OPENCODE 準拠**: 既存の成功事例を踏襲
4. **将来拡張性**: 要約・圧縮機能を後から追加容易
5. **段階的復元**: UI は遅延ロード対応可能

### テーブル構造

```
chat_sessions (セッションメタデータ)
  ↓ (1..*)
chat_messages (role: user/assistant/system)
  ↓ (1..*)
message_parts (type: text/tool_call)
  ↓ (0..1 for tool_call)
tool_call_results (ツール実行結果)
```

### 実装のポイント

- **トランザクション**: メッセージ追加時は単一トランザクション
- **ストリーミング完了時のみ永続化**: assistant メッセージは `completedAt` で判定
- **ツール呼び出し**:  パート追加 → 結果更新の 2 段階
- **インデックス戦略**: 会話復元のキー（sessionId, messageId, createdAt）に集中
- **UI キャッシュ**: `messageCount` で一覧表示高速化
- **エラーハンドリング**: ツール実行失敗時も部分的に保存可能
- **スキーマバージョン管理**: 将来の拡張に備え `dataSchemaVersion` で追跡

### 推奨される次のステップ

1. **実装開始準備**
   - Drizzle スキーマ定義ファイル作成
   - ChatSessionStore 基盤クラス実装
   - DB マイグレーション生成（drizzle-kit generate）
   - テストコードのテンプレート作成

2. **並行作業**
   - Handler IPC API メソッド追加
   - ストリーミングフロー統合（streaming 完了時に message 保存）
   - Renderer UI コンポーネント基盤

3. **検証・最適化**
   - ユニットテスト実行
   - E2E テスト（セッション作成 → 保存 → 復元）
   - パフォーマンス測定（1000+ メッセージ）
   - 本番環境シミュレーション

4. **将来への備え**
   - スキーマバージョン v2 の計画立案
   - 要約・圧縮機能の検討
   - アーカイブ・削除ポリシーの設計

---

**最終確認**

- ✅ OPENCODE の設計パターンを踏襲
- ✅ マルチレベル正規化テーブル（4 テーブル構造）
- ✅ 効率的なクエリ可能（SQL 直接実行）
- ✅ 長期保守性確保（3NF スキーマ）
- ✅ ストリーミング完了時のみ永続化
- ✅ ツール呼び出し結果の正確な追跡
- ✅ Drizzle Kit によるマイグレーション管理
- ✅ Unix timestamp で保存、ISO 8601 で API 提供
- ✅ better-sqlite3 + Drizzle ORM の既存スタックを活用
- ✅ AIProviderConfiguration + AIModelDefinition の v2 設定に対応


