# MCP サーバー統合の設計方針

このドキュメントでは、Electron AI Starter Template に Model Context Protocol (MCP) サーバー接続機能を追加するための設計方針を定義します。

## 目次

- [現状分析](#現状分析)
- [MCP とは](#mcp-とは)
- [統合の目的とスコープ](#統合の目的とスコープ)
- [アーキテクチャ設計](#アーキテクチャ設計)
- [実装計画](#実装計画)
- [データモデル](#データモデル)
- [API 設計](#api-設計)
- [UI/UX 設計](#uiux-設計)
- [セキュリティ考慮事項](#セキュリティ考慮事項)
- [実装フェーズ](#実装フェーズ)
- [今後の拡張性](#今後の拡張性)

---

## 現状分析

### プロジェクトの現在のアーキテクチャ

本プロジェクトは、標準的な Electron の2プロセスモデルを拡張した **3プロセス構成** を採用しています。

```mermaid
graph TB
    Main["Main Process<br/>(src/main/)<br/><br/>• アプリライフサイクル<br/>• ウィンドウ管理<br/>• IPC通信のハブ"]

    Backend["Backend Process<br/>(src/backend/)<br/><br/>• AI処理<br/>• ストリーミング<br/>• DB操作<br/>• 設定管理"]

    Renderer["Renderer Process<br/>(src/renderer/)<br/><br/>• React UI<br/>• チャット画面<br/>• ユーザー操作"]

    Main -->|IPC| Backend
    Main -->|IPC| Renderer
```

### 現在の AI プロバイダー統合

現在、以下の AI プロバイダーに対応しています：

- **Anthropic** (Claude)
- **OpenAI** (GPT)
- **Google** (Gemini)

**統合方法**:
- `src/backend/ai/factory.ts` でプロバイダー管理
- **Vercel AI SDK (`ai` パッケージ v4.3.17)** を使用
- 各プロバイダーの API を直接呼び出し
- `streamText()` によるストリーミング対応

**重要**: AI SDK v4.2+ は **MCP を公式サポート**しており、`experimental_createMCPClient` API が利用可能です。

### IPC 通信の特徴

本プロジェクトでは、**MessagePort ベースの直接通信** を採用しており、`src/common/connection.ts` の `Connection` クラスが全ての通信を管理しています。

**通信パターン**:
1. **invoke/handle**: リクエスト-レスポンス（同期的）
2. **publishEvent/onEvent**: イベント通知（非同期的）

---

## MCP とは

### Model Context Protocol の概要

**MCP (Model Context Protocol)** は、Anthropic が2024年11月に発表した、AI アシスタントと外部データソースを接続するためのオープンスタンダードです。

**特徴**:
- クライアント・サーバーアーキテクチャ
- JSON-RPC ベースの通信
- 3つのプリミティブ: Resources、Tools、Prompts
- 複数の言語に対応した公式 SDK (TypeScript、Python など)

### MCP のアーキテクチャ

```mermaid
graph LR
    Client["MCP Client<br/>(AI アプリケーション)"] <-->|JSON-RPC| Server1["MCP Server 1<br/>(ファイルシステム)"]
    Client <-->|JSON-RPC| Server2["MCP Server 2<br/>(GitHub API)"]
    Client <-->|JSON-RPC| Server3["MCP Server 3<br/>(データベース)"]
```

### MCP のプリミティブ

| プリミティブ | 説明 | 例 |
|------------|------|-----|
| **Resources** | 読み取り専用のデータエンドポイント | ファイル内容、データベースレコード |
| **Tools** | LLM が実行可能なアクション | ファイル作成、API 呼び出し |
| **Prompts** | 再利用可能なプロンプトテンプレート | プロジェクト分析プロンプト |

### トランスポート

MCP は複数のトランスポート方式をサポートしています：

- **stdio**: 標準入出力を使ったローカルプロセス通信
- **HTTP/SSE**: リモートサーバーとの通信（Streamable HTTP）

### Vercel AI SDK の MCP サポート

**重要な発見**: 本プロジェクトが既に使用している **Vercel AI SDK (v4.2+) は MCP を公式サポート**しています。

**サポート機能**:
- ✅ **Tools**: 完全サポート（自動変換）
- ✅ **Resources**: 完全サポート（`listResources()`, `readResource()`, `includeResources` オプション）
- ✅ **Prompts**: 完全サポート（`listPrompts()`）
- ✅ **stdio transport**: ローカルサーバー用
- ✅ **HTTP/SSE transport**: リモートサーバー用（本番推奨）

**主要 API**:
```typescript
import { experimental_createMCPClient } from 'ai'

const mcpClient = experimental_createMCPClient({
  transport: {
    type: 'stdio',
    command: 'node',
    args: ['path/to/server.js']
  }
})

// Tools を取得して streamText() に渡せる
const tools = await mcpClient.getTools()

// Resources も includeResources: true でツール化可能
const resourceTools = await mcpClient.getTools({ includeResources: true })
```

**メリット**:
- `@modelcontextprotocol/sdk` を直接使用する必要がない
- AI SDK との統合がシームレス
- 型安全性が保証される
- Vercel が継続的にメンテナンス

---

## 統合の目的とスコープ

### 目的

1. **拡張性の向上**: AI に外部コンテキストを提供する標準的な方法を確立
2. **再利用性**: 既存の MCP サーバーエコシステムを活用
3. **統一的な管理**: 複数の MCP サーバーを一元管理

### スコープ

**含まれるもの**:
- ✅ MCP サーバーへの接続管理
- ✅ stdio トランスポートのサポート（ローカルサーバー）
- ✅ Resources、Tools、Prompts の取得と表示
- ✅ MCP ツールの実行
- ✅ 設定 UI での MCP サーバー管理
- ✅ 既存 AI 統合との連携

**含まれないもの (将来の拡張)**:
- ⏳ HTTP/SSE トランスポート（リモートサーバー）※ AI SDK はサポート済み
- ❌ MCP サーバーの自動検出
- ❌ カスタム MCP サーバーの開発サポート

---

## アーキテクチャ設計

### 全体アーキテクチャ

```mermaid
graph TB
    subgraph "Renderer Process"
        UI[Settings UI<br/>MCP サーバー管理]
        Chat[Chat UI<br/>AI 会話]
    end

    subgraph "Backend Process"
        MCPManager[MCP Manager<br/>接続管理]
        AISDK[AI SDK<br/>experimental_createMCPClient]
        AIHandler[AI Handler<br/>streamText統合]
        DB[(Database<br/>設定保存)]
    end

    subgraph "External MCP Servers"
        Server1[MCP Server 1<br/>filesystem]
        Server2[MCP Server 2<br/>github]
        Server3[MCP Server N<br/>custom]
    end

    UI -->|IPC| MCPManager
    Chat -->|IPC| AIHandler
    MCPManager --> DB
    MCPManager --> AISDK
    AISDK -->|stdio| Server1
    AISDK -->|stdio| Server2
    AISDK -->|stdio| Server3
    AIHandler -->|ツール取得| MCPManager
    AIHandler -->|tools渡し| AISDK
```

### プロセス配置の方針

**MCP Client の配置場所**: Backend Process

**理由**:
1. **子プロセス管理**: MCP サーバーは Node.js の子プロセスとして起動されるため、Backend Process で管理するのが自然
2. **既存パターンとの一貫性**: AI 統合も Backend Process にあり、統一的な設計
3. **セキュリティ**: Renderer Process からの直接アクセスを避ける
4. **リソース管理**: 長時間実行されるプロセスの管理が容易

### IPC 通信設計

既存の `Connection` クラスを活用し、MCP 関連の新しいチャンネルを追加します。

**新規追加するチャンネル**:

| チャンネル名 | 方向 | 説明 |
|------------|------|------|
| `listMCPServers` | Renderer → Backend | 登録済み MCP サーバー一覧取得 |
| `addMCPServer` | Renderer → Backend | MCP サーバーを追加 |
| `updateMCPServer` | Renderer → Backend | MCP サーバーを更新 |
| `removeMCPServer` | Renderer → Backend | MCP サーバーを削除 |
| `getMCPResources` | Renderer → Backend | Resources 一覧取得 |
| `getMCPTools` | Renderer → Backend | Tools 一覧取得 |
| `getMCPPrompts` | Renderer → Backend | Prompts 一覧取得 |
| `callMCPTool` | Renderer → Backend | Tool を実行 |
| `mcpServerStatusChanged` | Backend → Renderer | サーバー接続状態の変化 (event) |

### MCP サーバーのライフサイクル

MCP サーバーの起動・停止は **`enabled` フィールドに基づいて自動的に管理**されます。

**基本方針**:
- **Enabled なサーバーは常に起動状態を維持**
- ユーザーが明示的に Connect/Disconnect する必要はない
- `enabled` の状態変更が起動・停止のトリガーとなる

**ライフサイクルのタイミング**:

1. **アプリ起動時**
   - データベースから全サーバー設定を読み込み
   - `enabled: true` のサーバーをすべて起動
   - 起動に失敗したサーバーはエラー状態として記録

2. **サーバー追加時**（UI から `addMCPServer()` 呼び出し）
   - データベースに設定を保存
   - `enabled: true` の場合、即座に起動
   - `enabled: false` の場合、起動しない

3. **サーバー更新時**（UI から `updateMCPServer()` 呼び出し）
   - `enabled` の状態変化に応じて処理:
     - `false → true`: サーバーを起動
     - `true → false`: サーバーを停止
     - `true → true`: 再起動（設定変更を反映）
     - `false → false`: 何もしない
   - コマンド・引数・環境変数の変更時は再起動が必要

4. **サーバー削除時**（UI から `removeMCPServer()` 呼び出し）
   - サーバーが起動中の場合、停止してから削除
   - データベースから設定を削除

5. **アプリ終了時**
   - すべての起動中サーバーを停止
   - クリーンアップ処理を実行

**UI への影響**:
- サーバー一覧には各サーバーの**接続状態**を表示（Connected / Disconnected / Error）
- **Enabled トグル**のみ提供（Connect/Disconnect ボタンは不要）
- Enabled を OFF にすると即座に停止、ON にすると即座に起動

**エラーハンドリング**:
- 起動に失敗したサーバーは Error 状態として UI に表示
- エラーメッセージを保存し、ユーザーに通知
- 自動リトライは行わない（ユーザーが設定を修正して再度 Enabled に）

---

## 実装計画

### ディレクトリ構造

```
src/
├── backend/
│   ├── mcp/
│   │   ├── index.ts              # MCP マネージャー公開 API
│   │   ├── manager.ts            # MCP マネージャー本体（AI SDK使用）
│   │   ├── server-config.ts     # サーバー設定管理
│   │   └── types.ts             # MCP 関連の型定義（AI SDK型の再エクスポート）
│   ├── handler.ts               # ← MCP メソッドを追加
│   └── ...
├── common/
│   └── types.ts                 # ← MCP 関連の共通型を追加
├── renderer/src/
│   ├── components/
│   │   └── settings/
│   │       └── mcp-settings.tsx # MCP 設定画面
│   └── lib/
│       └── mcp.ts               # MCP クライアント API
└── ...
```

**注**: `client-wrapper.ts` は不要です。AI SDK の `experimental_createMCPClient` を直接使用します。

### 主要コンポーネント

#### 1. MCP Manager (`src/backend/mcp/manager.ts`)

**責務**:
- MCP サーバーの起動・停止管理（AI SDK の `experimental_createMCPClient` 使用）
- 複数サーバーの並行管理
- サーバー設定の読み込み・保存
- クライアントインスタンスのライフサイクル管理
- アプリ起動時の自動起動処理

**実装例**:
```typescript
import { experimental_createMCPClient } from 'ai'

class MCPManager {
  private clients: Map<string, ReturnType<typeof experimental_createMCPClient>> = new Map()
  private serverConfigs: Map<string, MCPServerConfig> = new Map()

  // アプリ起動時に呼び出される
  async initialize(): Promise<void> {
    const configs = await this.loadServerConfigs()
    for (const config of configs) {
      this.serverConfigs.set(config.id, config)
      if (config.enabled) {
        await this.start(config.id)
      }
    }
  }

  async start(serverId: string): Promise<Result<void>> {
    const config = this.serverConfigs.get(serverId)
    if (!config) return error('Server config not found')

    const client = experimental_createMCPClient({
      transport: {
        type: 'stdio',
        command: config.command,
        args: config.args,
        env: config.env
      }
    })

    this.clients.set(serverId, client)
    return ok(undefined)
  }

  async stop(serverId: string): Promise<Result<void>> {
    const client = this.clients.get(serverId)
    if (client) {
      // クライアントのクリーンアップ
      this.clients.delete(serverId)
    }
    return ok(undefined)
  }

  // サーバー追加時に呼び出される
  async addServer(config: Omit<MCPServerConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<string>> {
    const serverId = generateId()
    const fullConfig = {
      ...config,
      id: serverId,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    await this.saveServerConfig(fullConfig)
    this.serverConfigs.set(serverId, fullConfig)

    // enabled なら即座に起動
    if (fullConfig.enabled) {
      await this.start(serverId)
    }

    return ok(serverId)
  }

  // サーバー更新時に呼び出される
  async updateServer(serverId: string, updates: Partial<MCPServerConfig>): Promise<Result<void>> {
    const config = this.serverConfigs.get(serverId)
    if (!config) return error('Server not found')

    const wasEnabled = config.enabled
    const newConfig = { ...config, ...updates, updatedAt: new Date() }

    await this.saveServerConfig(newConfig)
    this.serverConfigs.set(serverId, newConfig)

    // enabled 状態の変化に応じて処理
    if (!wasEnabled && newConfig.enabled) {
      // 起動
      await this.start(serverId)
    } else if (wasEnabled && !newConfig.enabled) {
      // 停止
      await this.stop(serverId)
    } else if (wasEnabled && newConfig.enabled) {
      // 設定変更時は再起動
      await this.stop(serverId)
      await this.start(serverId)
    }

    return ok(undefined)
  }

  async listResources(serverId: string): Promise<Result<MCPResource[]>> {
    const client = this.clients.get(serverId)
    if (!client) return error('Server not connected')

    const resources = await client.listResources()
    return ok(resources)
  }

  async getTools(serverId: string, includeResources = false): Promise<Result<MCPTool[]>> {
    const client = this.clients.get(serverId)
    if (!client) return error('Server not connected')

    const tools = await client.getTools({ includeResources })
    return ok(tools)
  }

  async listPrompts(serverId: string): Promise<Result<MCPPrompt[]>> {
    const client = this.clients.get(serverId)
    if (!client) return error('Server not connected')

    const prompts = await client.listPrompts()
    return ok(prompts)
  }

  // AI統合用: 全サーバーのツールを取得
  async getAllTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = []
    for (const [serverId, client] of this.clients) {
      // サーバー設定からincludeResourcesを取得
      const config = await this.getServerConfig(serverId)
      const tools = await client.getTools({ includeResources: config.includeResources })
      allTools.push(...tools)
    }
    return allTools
  }

  // サーバー設定を取得（データベースから）
  private async getServerConfig(serverId: string): Promise<MCPServerConfig> {
    // データベースからサーバー設定を取得
    // 実装詳細は省略
  }
}
```

**重要なポイント**:
- `@modelcontextprotocol/sdk` は使用しない
- AI SDK の型定義をそのまま利用（型変換不要）
- **各サーバーの `includeResources` 設定を尊重**: サーバーごとに制御可能
- `streamText()` に直接渡せる形式でツールを取得
- **デフォルトは `includeResources: false`**: コンテキスト圧迫を避けるため

#### 2. Handler 拡張 (`src/backend/handler.ts`)

既存の `Handler` クラスに MCP メソッドを追加します。

```typescript
export class Handler {
  private _mcpManager: MCPManager

  // 既存メソッド...

  // MCP メソッド
  async listMCPServers(): Promise<Result<MCPServerConfig[]>>
  async addMCPServer(config: Omit<MCPServerConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<string>>
  async updateMCPServer(serverId: string, updates: Partial<MCPServerConfig>): Promise<Result<void>>
  async removeMCPServer(serverId: string): Promise<Result<void>>
  async getMCPResources(serverId: string): Promise<Result<MCPResource[]>>
  async getMCPTools(serverId: string): Promise<Result<MCPTool[]>>
  async getMCPPrompts(serverId: string): Promise<Result<MCPPrompt[]>>
  async callMCPTool(serverId: string, toolName: string, args: unknown): Promise<Result<unknown>>
}
```

---

## データモデル

### データベーススキーマ拡張

**新規テーブル**: `mcp_servers`

```typescript
// src/backend/db/schema.ts
export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').notNull().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  command: text('command').notNull(),
  args: text('args', { mode: 'json' }).notNull(),  // string[]
  env: text('env', { mode: 'json' }),              // Record<string, string> | null
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  includeResources: integer('include_resources', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})
```

**フィールド説明**:

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | string | ユニーク ID (UUID) |
| `name` | string | サーバー名 (例: "Filesystem Server") |
| `description` | string? | 説明文 |
| `command` | string | 実行コマンド (例: "node") |
| `args` | string[] | コマンド引数 (例: ["path/to/server.js"]) |
| `env` | object? | 環境変数 (例: {"API_KEY": "..."}) |
| `enabled` | boolean | サーバーを有効にするか（有効にすると自動的に起動される） |
| `includeResources` | boolean | Resources をツールとして含めるか（デフォルト: false） |
| `createdAt` | Date | 作成日時 |
| `updatedAt` | Date | 更新日時 |

### TypeScript 型定義

```typescript
// src/common/types.ts

export interface MCPServerConfig {
  id: string
  name: string
  description?: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean           // サーバーを有効にするか（有効にすると自動的に起動される）
  includeResources: boolean  // Resources をツールとして含めるか（デフォルト: false）
  createdAt: Date
  updatedAt: Date
}

export interface MCPServerStatus {
  serverId: string
  connected: boolean
  error?: string
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface MCPTool {
  name: string
  description?: string
  inputSchema: object  // JSON Schema
}

export interface MCPPrompt {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
}
```

---

## API 設計

### Backend API (Handler メソッド)

#### サーバー管理

**`listMCPServers()`**
```typescript
// リクエスト: なし
// レスポンス: Result<MCPServerConfig[]>
await window.backend.listMCPServers()
```

**`addMCPServer(config)`**
```typescript
// リクエスト: MCPServerConfig (id, createdAt, updatedAt を除く)
// レスポンス: Result<string>  // 作成された ID
await window.backend.addMCPServer({
  name: "Filesystem Server",
  command: "node",
  args: ["/path/to/server.js"],
  enabled: true,  // true の場合、追加時点で起動される
  includeResources: false
})
```

**`updateMCPServer(serverId, config)`**
```typescript
// リクエスト: serverId, Partial<MCPServerConfig>
// レスポンス: Result<void>
// enabled の変更や設定変更時にサーバーを自動的に再起動
await window.backend.updateMCPServer("server-123", {
  enabled: false  // サーバーを停止
})
```

**`removeMCPServer(serverId)`**
```typescript
// リクエスト: serverId
// レスポンス: Result<void>
// 起動中の場合は自動的に停止してから削除
await window.backend.removeMCPServer("server-123")
```

#### リソース・ツール・プロンプト取得

**`getMCPResources(serverId)`**
```typescript
// リクエスト: serverId
// レスポンス: Result<MCPResource[]>
const result = await window.backend.getMCPResources("server-123")
```

**`getMCPTools(serverId)`**
```typescript
// リクエスト: serverId
// レスポンス: Result<MCPTool[]>
const result = await window.backend.getMCPTools("server-123")
```

**`getMCPPrompts(serverId)`**
```typescript
// リクエスト: serverId
// レスポンス: Result<MCPPrompt[]>
const result = await window.backend.getMCPPrompts("server-123")
```

#### ツール実行

**`callMCPTool(serverId, toolName, args)`**
```typescript
// リクエスト: serverId, toolName, args
// レスポンス: Result<unknown>
const result = await window.backend.callMCPTool(
  "server-123",
  "read_file",
  { path: "/path/to/file.txt" }
)
```

### イベント通知

**`mcpServerStatusChanged`**

サーバーの接続状態が変化したときに通知されます。

```typescript
window.backend.onEvent('mcpServerStatusChanged', (event: AppEvent) => {
  const status = event.payload as MCPServerStatus
  console.log(`Server ${status.serverId} is now ${status.connected ? 'connected' : 'disconnected'}`)
})
```

---

## UI/UX 設計

### 設定画面の拡張

**新規追加**: Settings 画面に "MCP Servers" タブを追加

```
Settings
├── AI Providers (既存)
├── MCP Servers (新規) ← MCP サーバー管理
└── Database (既存)
```

### MCP Servers タブの構成

```
┌─────────────────────────────────────────────────────┐
│ MCP Servers                                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [+ Add Server]                                     │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ Filesystem Server              [Enabled: ON]  │ │
│  │ Access local files and directories            │ │
│  │ Command: node /path/to/fs-server.js           │ │
│  │ Status: Connected ✓                           │ │
│  │ [Edit] [Delete]                               │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ GitHub Server                  [Enabled: OFF] │ │
│  │ Interact with GitHub repositories             │ │
│  │ Command: npx -y @github/mcp-server            │ │
│  │ Status: Stopped                               │ │
│  │ [Edit] [Delete]                               │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ Database Server                [Enabled: ON]  │ │
│  │ Query and manage databases                    │ │
│  │ Command: python /path/to/db-server.py         │ │
│  │ Status: Error (Connection refused)            │ │
│  │ [Edit] [Delete]                               │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**要素**:
- サーバー名、説明
- **Enabled トグル**: ON/OFF 切り替え（ON にすると起動、OFF にすると停止）
- 接続ステータス (Connected / Stopped / Error)
- アクション: Edit / Delete
- Connect/Disconnect ボタンは不要（Enabled トグルで制御）

### Add/Edit Server ダイアログ

```
┌─────────────────────────────────────────────────────┐
│ Add MCP Server                            [×]       │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Server Name *                                       │
│ ┌───────────────────────────────────────────────┐  │
│ │ Filesystem Server                             │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ Description                                         │
│ ┌───────────────────────────────────────────────┐  │
│ │ Access local files and directories            │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ Command *                                           │
│ ┌───────────────────────────────────────────────┐  │
│ │ node                                          │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ Arguments (one per line) *                          │
│ ┌───────────────────────────────────────────────┐  │
│ │ /path/to/server.js                            │  │
│ │ --config                                       │  │
│ │ /path/to/config.json                          │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ Environment Variables (optional)                    │
│ ┌─────────────────────┬─────────────────────────┐  │
│ │ Key                 │ Value                   │  │
│ ├─────────────────────┼─────────────────────────┤  │
│ │ API_KEY             │ sk-...                  │  │
│ │ LOG_LEVEL           │ debug                   │  │
│ └─────────────────────┴─────────────────────────┘  │
│ [+ Add Variable]                                    │
│                                                     │
│ ☑ Enabled                                           │
│   (Server will start automatically when enabled)   │
│                                                     │
│ ☐ Include resources as tools                       │
│   (Warning: May increase context size for this     │
│    server. Use only if resources are limited.)     │
│                                                     │
│              [Cancel]  [Save]                       │
└─────────────────────────────────────────────────────┘
```

**設定の説明**:
- **Enabled**: サーバーを有効にするかどうか（有効にすると追加時点で起動され、以降常に起動状態を維持）
- **Include resources as tools**: このサーバーの Resources を AI のツールとして扱うかどうか
- **デフォルト**:
  - `enabled: true` (すぐに使える状態にする)
  - `includeResources: false` (コンテキスト圧迫を避ける)
- **用途例**:
  - ファイルシステムサーバー（大量のファイル）: includeResources OFF 推奨
  - GitHubサーバー（限定的なリソース）: includeResources ON も可
  - カスタムサーバー: 用途に応じて選択

### MCP Resources/Tools ブラウザ (将来の拡張)

接続されたサーバーのリソースやツールを一覧・実行できるビューを提供します。

```
┌─────────────────────────────────────────────────────┐
│ MCP Resources & Tools                               │
├─────────────────────────────────────────────────────┤
│ Server: [Filesystem Server ▼]                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Resources (12)                                      │
│ ┌───────────────────────────────────────────────┐  │
│ │ 📄 /home/user/documents/readme.md             │  │
│ │ 📄 /home/user/documents/notes.txt             │  │
│ │ 📁 /home/user/projects/                       │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ Tools (5)                                           │
│ ┌───────────────────────────────────────────────┐  │
│ │ 🔧 read_file                                  │  │
│ │    Read the contents of a file                │  │
│ │    [Execute]                                   │  │
│ │                                                │  │
│ │ 🔧 write_file                                 │  │
│ │    Write content to a file                    │  │
│ │    [Execute]                                   │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## セキュリティ考慮事項

### 1. コマンド実行のリスク

MCP サーバーは任意のコマンドを実行するため、セキュリティリスクがあります。

**対策**:
- ✅ ユーザーが明示的に追加したサーバーのみ実行
- ✅ サーバー設定は暗号化せず、ユーザーの責任で管理
- ✅ UI で実行コマンドを明示的に表示
- ⚠️ サンドボックス化は今回のスコープ外（将来の拡張）

### 2. 環境変数の管理

API キーなどの機密情報が環境変数に含まれる可能性があります。

**対策**:
- ✅ 環境変数はデータベースに平文で保存（既存の AI 設定と同様）
- ✅ userData ディレクトリのパーミッションで保護
- ⚠️ OS キーチェーン統合は将来の拡張

### 3. MCP サーバーとの通信

**対策**:
- ✅ stdio トランスポートを使用（ローカルプロセス間通信）
- ✅ JSON-RPC メッセージの検証
- ✅ タイムアウト設定

---

## 実装フェーズ

### フェーズ 1: 基礎実装 (MVP)

**目標**: MCP サーバーを追加し、自動的に起動してリソース一覧を取得できる

**タスク**:
1. ~~`@modelcontextprotocol/sdk` のインストール~~ → **不要**（AI SDK v4.3.17 に含まれる）
2. データベーススキーマの追加とマイグレーション
3. `MCPManager` の基本実装（`experimental_createMCPClient` 使用）
   - `start(serverId)`, `stop(serverId)`, `listResources(serverId)`
   - アプリ起動時に Enabled サーバーを自動起動
4. Handler への MCP メソッド追加
   - `listMCPServers()`, `addMCPServer()`, `updateMCPServer()`, `removeMCPServer()`
   - `getMCPResources()`, `getMCPTools()`, `getMCPPrompts()`
5. `src/common/types.ts` への型定義追加
6. Renderer 側 API の実装（`window.backend.*` 経由）
7. Settings UI の基本実装（サーバー追加・一覧表示・Enabled トグル）

**成功基準**:
- ✅ MCP サーバーを設定画面から追加できる
- ✅ Enabled にしたサーバーが自動的に起動される（AI SDK の `experimental_createMCPClient` 経由）
- ✅ Enabled トグルで起動・停止を切り替えられる
- ✅ リソース一覧を取得・表示できる

**実装の簡素化**:
- `MCPClientWrapper` の実装は不要
- 型変換ロジックも不要（AI SDK の型をそのまま使用）
- 低レベルの MCP プロトコル処理は AI SDK が担当
- Connect/Disconnect UI は不要（Enabled トグルで制御）

### フェーズ 2: 機能拡張 (Tools サポート)

**目標**: Tools のサポート、複数サーバー管理の安定化

**タスク**:
1. `listTools()` の実装
2. `callTool()` の実装
3. 複数サーバーの並行管理の安定化
4. エラーハンドリングの強化（再起動失敗時の処理など）
5. Settings UI の拡張（ツール一覧表示、ツール実行）
6. サーバー状態の監視とエラー通知

**成功基準**:
- ✅ 複数の MCP サーバーを同時に起動できる
- ✅ ツールを実行できる
- ✅ サーバーのエラー状態を適切に処理・表示できる

### フェーズ 3: AI 統合

**目標**: AI チャットから MCP リソースやツールを利用できる

**タスク**:
1. `MCPManager.getAllTools()` の実装
   - 全サーバーのツールを集約
   - 各サーバーの `includeResources` 設定を尊重
   - データベースからサーバー設定を取得するヘルパーメソッド追加
2. `streamAIText()` に MCP ツールを渡す実装
   ```typescript
   // src/backend/handler.ts
   async streamAIText(messages: AIMessage[]): Promise<Result<string>> {
     // 既存のAI設定取得...

     // MCP ツールを取得（各サーバーの設定に基づく）
     const mcpTools = await this._mcpManager.getAllTools()

     // streamText() に渡す
     const sessionId = await streamText(
       config,
       messages,
       mcpTools,  // ← MCP ツールを追加
       (channel, event) => this._rendererConnection.publishEvent(channel, event)
     )

     return ok(sessionId)
   }
   ```
3. チャット UI でのツール実行結果の表示（Assistant UI が対応）

**成功基準**:
- ✅ AI がツールを実行できる（MCP Tools を `streamText()` に渡すだけ）
- ✅ サーバーごとに Resources をツールとして扱うかどうか制御可能
- ✅ ユーザーがツール実行を確認・承認できる

**AI SDK による簡素化**:
- MCP Tools は AI SDK のツール形式に自動変換される
- `streamText()` の `tools` パラメータに直接渡せる
- ツール実行のハンドリングも AI SDK が担当

**設計上の配慮**:
- **サーバーごとの設定**: `includeResources` はサーバー設定の一部
- **デフォルトは `false`**: コンテキスト圧迫を避けるため
- **柔軟性**: ファイルシステムサーバーは OFF、GitHubサーバーは ON など、サーバーの特性に応じて設定可能

### フェーズ 4: 高度な機能 (将来の拡張)

- **Prompts サポート**
  - `listPrompts()` の実装
  - プロンプトテンプレートの取得と表示
  - プロンプトテンプレートの活用（チャット UI での利用）
  - 注: 現時点では Prompts を活用している MCP サーバーはほとんどないため、優先度は低い
- **HTTP/SSE トランスポートのサポート**（AI SDK は既にサポート済み）
- MCP サーバーの自動検出
- カスタムサーバー開発サポート
- パフォーマンス最適化
- リソースキャッシング

---

## 今後の拡張性

### 1. HTTP/SSE トランスポートのサポート

リモート MCP サーバーへの接続を可能にします。

**変更点**:
- `MCPServerConfig` に `transport: 'stdio' | 'http'` フィールドを追加
- HTTP トランスポート設定の UI 追加
- 認証機能の追加（API キーなど）

**実装例**:
```typescript
// AI SDK は既に HTTP トランスポートをサポート
const client = experimental_createMCPClient({
  transport: {
    type: 'http',  // または 'sse'
    url: 'https://api.example.com/mcp',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  }
})
```

**メリット**:
- Vercel など本番環境へのデプロイが可能
- クラウドホストされた MCP サーバーへのアクセス
- AI SDK が既にサポート済みなので実装が容易

### 2. MCP サーバーマーケットプレイス

公式・コミュニティが提供する MCP サーバーを簡単にインストールできる機能。

**実装案**:
- GitHub からサーバーリストを取得
- ワンクリックインストール
- 自動アップデート

### 3. カスタム MCP サーバー開発支援

プロジェクト内でカスタム MCP サーバーを開発できる環境を提供。

**実装案**:
- テンプレートジェネレーター
- デバッグツール
- ホットリロード対応

### 4. AI ツール実行の承認フロー

セキュリティ向上のため、AI がツールを実行する前にユーザーの承認を求める。

**UI**:
```
┌─────────────────────────────────────────────────────┐
│ Tool Execution Request                              │
├─────────────────────────────────────────────────────┤
│ The AI wants to execute the following tool:         │
│                                                     │
│ Server: Filesystem Server                           │
│ Tool: write_file                                    │
│                                                     │
│ Arguments:                                          │
│ {                                                   │
│   "path": "/home/user/notes.txt",                  │
│   "content": "Meeting notes..."                    │
│ }                                                   │
│                                                     │
│              [Deny]  [Approve]                      │
└─────────────────────────────────────────────────────┘
```

---

## 参考資料

### MCP 公式リソース
- [Model Context Protocol - 公式サイト](https://modelcontextprotocol.io)
- [MCP TypeScript SDK - GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Servers - GitHub](https://github.com/modelcontextprotocol/servers)
- [Anthropic MCP ドキュメント](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)

### Vercel AI SDK（本プロジェクトで使用）
- [AI SDK - MCP Tools ドキュメント](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- [AI SDK - experimental_createMCPClient API リファレンス](https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client)
- [AI SDK - Node.js MCP クックブック](https://ai-sdk.dev/cookbook/node/mcp-tools)
- [AI SDK 4.2 リリースノート](https://vercel.com/blog/ai-sdk-4-2)

### 本プロジェクト
- [開発者向けドキュメント](./FOR_DEVELOPERS.md)
- [IPC 通信の詳細解説](./IPC_COMMUNICATION_DEEP_DIVE.md)
- [AI プロバイダー拡張ガイド](./EXTENDING_AI_PROVIDERS.md)

---

**更新日**: 2025-11-09
**承認日**: 2025-11-09
**バージョン**: 2.3 (Final)
**ステータス**: ✅ Approved (承認済み - 実装可能)
**変更履歴**:
- v2.3: MCP サーバーのライフサイクル設計を明確化、`autoConnect` フィールドを削除し `enabled` のみで管理 → **承認済み**
- v2.2: フェーズ 2 を Tools に集中、Prompts サポートをフェーズ 4（将来の拡張）に移動
- v2.1: `includeResources` をサーバーごとの設定に変更（MCPServerConfig に配置）
- v2.0: AI SDK の MCP サポートを反映した設計に変更（`experimental_createMCPClient` 使用）
- v1.0: 初版（`@modelcontextprotocol/sdk` 直接使用）
