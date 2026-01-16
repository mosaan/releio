# MCPツール実行許可システム設計書

## 1. 概要

本文書は、MCPサーバーから提供されるツールの実行に対して、事前設定した許可ルールに基づく自動許可と、それ以外のケースでのユーザー承認を実現するための設計を記録する。

### 1.1 背景

現在のReleioプロジェクトでは、MCPサーバーとの接続機能を通じてツールを利用可能にしているが、**すべてのツール実行が無条件で自動許可**されている状態である。セキュリティとユーザーコントロールの観点から、以下の機能が必要とされる：

1. **事前設定した許可ルール**に合致するツール実行は自動許可
2. **ルールに合致しない場合**はユーザーに承認を求める（Human-in-the-Loop）

### 1.2 現状の実装

```
src/backend/mcp/manager.ts:615-651 (getAllTools)
  ↓ ツールを収集
src/backend/handler.ts:206-218 (streamAIText)
  ↓ ツールをstreamText()に渡す
src/backend/ai/stream.ts:51-60 (streamSessionText)
  ↓ AIがツールを呼び出し
  → 無条件で自動実行（許可確認なし）
```

---

## 2. 技術調査結果

### 2.1 AI SDK v5（現在使用中: ai@5.0.92）

#### 機能概要

AI SDK v5には**組み込みのツール実行許可システムは存在しない**が、Human-in-the-Loopパターンを実装するためのプリミティブが提供されている。

#### 実装パターン

**ツール定義（execute関数なし = 承認必要）:**

```typescript
import { tool, ToolSet } from 'ai'
import { z } from 'zod'

const getWeatherInformation = tool({
  description: 'show the weather in a given city to the user',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.string()
  // execute関数がない = 人間の承認が必要
})

const getLocalTime = tool({
  description: 'get the local time for a specified location',
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.string(),
  // execute関数がある = 自動実行
  execute: async ({ location }) => '10am'
})
```

**フロントエンド側での承認UI:**

```typescript
import { isStaticToolUIPart, getStaticToolName } from 'ai'

// ツール呼び出しの状態を確認
if (isStaticToolUIPart(part) && part.state === 'input-available') {
  const toolName = getStaticToolName(part)
  // 承認UIを表示
  await addToolOutput({
    toolCallId: part.toolCallId,
    tool: toolName,
    output: 'Yes, confirmed.' // or 'No, denied.'
  })
  sendMessage()
}
```

**バックエンド側での処理:**

```typescript
// ユーザーの承認結果を処理
switch (part.output) {
  case 'Yes, confirmed.':
    const result = await executeWeatherTool(part.input)
    writer.write({
      type: 'tool-output-available',
      toolCallId: part.toolCallId,
      output: result
    })
    break
  case 'No, denied.':
    writer.write({
      type: 'tool-output-available',
      toolCallId: part.toolCallId,
      output: 'Error: User denied access'
    })
    break
}
```

#### v5での制限事項

- 許可ルール機能は組み込まれていない（カスタム実装が必要）
- ツールごとに`execute`関数の有無で承認要否を制御
- MCPツールは外部から提供されるため、`execute`関数を直接制御できない
- **カスタムラッパーの実装が必須**

---

### 2.2 AI SDK v6（Beta - 2025年12月22日リリース）

#### 機能概要

AI SDK v6では**ネイティブのツール実行承認機能（Tool Execution Approval）**が追加された。

#### 主要な新機能

**1. `needsApproval`フラグ:**

```typescript
import { tool } from 'ai'
import { z } from 'zod'

export const runCommand = tool({
  description: 'Run a shell command',
  inputSchema: z.object({
    command: z.string().describe('The shell command to execute')
  }),
  needsApproval: true, // 常に承認が必要
  execute: async ({ command }) => {
    // 実行ロジック
  }
})
```

**2. 条件付き承認（関数）:**

```typescript
const runCommand = tool({
  description: 'Run a shell command',
  inputSchema: z.object({
    command: z.string()
  }),
  // 入力に基づいて動的に判断
  needsApproval: async ({ command }) => command.includes('rm -rf'),
  execute: async ({ command }) => {
    /* 実行ロジック */
  }
})
```

**3. ToolLoopAgentによる統合:**

```typescript
import { ToolLoopAgent } from 'ai'

const agent = new ToolLoopAgent({
  model: 'anthropic/claude-sonnet-4.5',
  tools: {
    weather: weatherTool,
    command: runCommand // needsApproval: true
  }
})
```

**4. フロントエンド統合:**

```typescript
import { ChatAddToolApproveResponseFunction } from 'ai';

function CommandToolView({
  invocation,
  addToolApprovalResponse,
}: {
  invocation: UIToolInvocation<typeof runCommand>;
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
}) {
  if (invocation.state === 'approval-requested') {
    return (
      <div>
        <p>Run command: {invocation.input.command}?</p>
        <button onClick={() =>
          addToolApprovalResponse({ id: invocation.approval.id, approved: true })
        }>
          Approve
        </button>
        <button onClick={() =>
          addToolApprovalResponse({ id: invocation.approval.id, approved: false })
        }>
          Deny
        </button>
      </div>
    );
  }
  // ...
}
```

#### v6の利点

| 項目         | AI SDK v5        | AI SDK v6                       |
| ------------ | ---------------- | ------------------------------- |
| 承認機能     | カスタム実装必要 | `needsApproval`フラグで簡単     |
| 条件付き承認 | 手動実装         | 関数で動的判断可能              |
| UI統合       | 複雑なパターン   | `addToolApprovalResponse`で簡潔 |
| 型安全性     | 部分的           | 完全な型推論                    |
| Agent抽象化  | なし             | `ToolLoopAgent`クラス           |

#### マイグレーション

```bash
npx @ai-sdk/codemod upgrade v6
```

---

### 2.3 Mastra Framework

#### 機能概要

Mastraは**本格的なHuman-in-the-Loop（HITL）機能**を組み込みで提供している。

#### ツールレベルの承認

```typescript
import { createTool } from '@mastra/core'

const deleteTool = createTool({
  id: 'delete-data',
  description: 'Delete records from database',
  inputSchema: z.object({
    count: z.number(),
    table: z.string()
  }),
  execute: async ({ context }) => {
    return await deleteRecords(context)
  },
  requireApproval: true // 承認必須
})
```

#### 条件付きサスペンド

```typescript
const transferTool = createTool({
  id: 'transfer-money',
  execute: async ({ context, suspend, resumeData }) => {
    // 金額が大きい場合のみサスペンド
    if (context.amount > 1000 && !resumeData) {
      return await suspend({
        reason: `Transfer of $${context.amount} requires approval`
      })
    }

    if (resumeData?.approved) {
      await executeTransfer(context)
      return 'Transfer completed'
    }

    return 'Transfer cancelled'
  },
  suspendSchema: z.object({ reason: z.string() }),
  resumeSchema: z.object({ approved: z.boolean() })
})
```

#### エージェントレベルの承認

```typescript
const stream = await agent.stream('Delete old user records', {
  requireToolApproval: true // 全ツールに適用
})

// 承認/拒否
await agent.approveToolCall({ runId: stream.runId })
await agent.declineToolCall({ runId: stream.runId })
```

#### 自動再開オプション

```typescript
const agent = new Agent({
  id: 'my-agent',
  tools: { weatherTool },
  defaultOptions: {
    autoResumeSuspendedTools: true // 会話フローで自動再開
  }
})
```

#### Mastraの利点

| 項目               | 説明                                       |
| ------------------ | ------------------------------------------ |
| 組み込みHITL       | `requireApproval`で簡単に設定              |
| ワークフロー統合   | `suspend()`/`resume()`パターン             |
| スナップショット   | 状態をストレージに永続化                   |
| 条件付きロジック   | `suspendSchema`/`resumeSchema`で複雑な条件 |
| ストリーミング対応 | `tool-call-approval`チャンクタイプ         |

---

## 3. 推奨アプローチ

### 3.1 短期的対応（AI SDK v5継続）

現在のAI SDK v5を継続使用する場合、**カスタムツールラッパー**を実装する必要がある。

#### アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                      Permission Rules                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ { toolName: "read_file", autoApprove: true }            ││
│  │ { toolName: "write_file", autoApprove: false }          ││
│  │ { toolName: "delete_*", autoApprove: false }            ││
│  │ { pattern: "dangerous_*", autoApprove: false }          ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Tool Permission Layer                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ wrapToolWithPermission(tool, rules) {                   ││
│  │   if (matchesAutoApproveRule(tool, rules)) {            ││
│  │     return tool; // 自動実行                            ││
│  │   }                                                     ││
│  │   return toolWithApprovalRequired(tool);                ││
│  │ }                                                       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      MCP Manager                             │
│  getAllTools() → wrapWithPermissions() → streamText()       │
└─────────────────────────────────────────────────────────────┘
```

#### 実装コンポーネント

**1. 許可ルール定義:**

```typescript
interface ToolPermissionRule {
  toolName?: string // 完全一致
  pattern?: string // ワイルドカードパターン
  serverId?: string // MCPサーバーID
  autoApprove: boolean // 自動許可するか
  condition?: (input: unknown) => boolean // 条件関数
}

interface ToolPermissionConfig {
  defaultAutoApprove: boolean // デフォルト動作
  rules: ToolPermissionRule[]
}
```

**2. ツールラッパー:**

```typescript
function wrapToolsWithPermission(
  tools: Record<string, Tool>,
  config: ToolPermissionConfig
): Record<string, Tool> {
  const wrapped: Record<string, Tool> = {}

  for (const [name, tool] of Object.entries(tools)) {
    const shouldAutoApprove = evaluateRules(name, config)

    if (shouldAutoApprove) {
      wrapped[name] = tool // そのまま
    } else {
      // execute関数を削除して承認必須に
      wrapped[name] = {
        ...tool,
        execute: undefined // 承認待ち状態にする
      }
    }
  }

  return wrapped
}
```

**3. フロントエンド承認UI:**

```typescript
// renderer側でtool-callイベントを受け取り、承認UIを表示
function ToolApprovalDialog({ toolCall, onApprove, onDeny }) {
  return (
    <Dialog>
      <DialogTitle>ツール実行の承認</DialogTitle>
      <DialogContent>
        <p>ツール: {toolCall.toolName}</p>
        <pre>{JSON.stringify(toolCall.input, null, 2)}</pre>
      </DialogContent>
      <DialogActions>
        <Button onClick={onDeny}>拒否</Button>
        <Button onClick={onApprove}>承認</Button>
      </DialogActions>
    </Dialog>
  );
}
```

#### 工数見積もり（v5カスタム実装）

| タスク                       | 工数        |
| ---------------------------- | ----------- |
| 許可ルールシステム設計・実装 | 2-3日       |
| ツールラッパー実装           | 2-3日       |
| フロントエンド承認UI         | 2-3日       |
| バックエンド承認フロー       | 2-3日       |
| テスト・デバッグ             | 2-3日       |
| **合計**                     | **10-15日** |

---

### 3.2 中期的対応（AI SDK v6への移行）

#### 推奨理由

1. **ネイティブサポート**: `needsApproval`フラグで簡単に実装
2. **条件付き承認**: 関数で動的に判断可能
3. **型安全性**: 完全な型推論
4. **将来性**: 長期サポートが期待できる

#### 移行手順

```bash
# 1. 自動マイグレーション
npx @ai-sdk/codemod upgrade v6

# 2. 依存関係更新
pnpm update ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google @ai-sdk/mcp
```

#### v6での実装

```typescript
// MCPツールをラップして承認設定を追加
function wrapMCPToolsForApproval(
  mcpTools: Record<string, Tool>,
  config: ToolPermissionConfig
): Record<string, Tool> {
  const wrapped: Record<string, Tool> = {}

  for (const [name, tool] of Object.entries(mcpTools)) {
    const rule = findMatchingRule(name, config.rules)

    wrapped[name] = {
      ...tool,
      needsApproval:
        rule?.autoApprove === false
          ? true
          : rule?.condition
            ? (input) => !rule.condition!(input)
            : !config.defaultAutoApprove
    }
  }

  return wrapped
}
```

#### 工数見積もり（v6移行）

| タスク                           | 工数      |
| -------------------------------- | --------- |
| v6マイグレーション実行・動作確認 | 1-2日     |
| 許可ルール設定UI                 | 1-2日     |
| MCPツールラッパー調整            | 1日       |
| フロントエンド承認UI（v6対応）   | 1-2日     |
| テスト・デバッグ                 | 1-2日     |
| **合計**                         | **5-9日** |

---

### 3.3 長期的対応（Mastraへの移行）

#### 推奨理由

1. **本格的なエージェント機能**: ワークフロー、メモリ、RAG
2. **組み込みHITL**: `requireApproval`とsuspend/resumeパターン
3. **スナップショット永続化**: 状態管理が堅牢
4. **将来の拡張性**: エージェント機能の拡張が容易

#### 現在のMastraサービス状況

プロジェクトには既に`MastraChatService`（`src/backend/mastra/MastraChatService.ts`）が存在するが、まだMVP段階で以下の制限がある：

- Azure未サポート
- ツール統合なし
- HITL未実装

#### Mastra完全移行後の実装

```typescript
import { Agent, createTool } from '@mastra/core'

// MCPツールをMastraツールに変換
function convertMCPToolsToMastra(
  mcpTools: Record<string, Tool>,
  config: ToolPermissionConfig
): Record<string, MastraTool> {
  const converted: Record<string, MastraTool> = {}

  for (const [name, tool] of Object.entries(mcpTools)) {
    const rule = findMatchingRule(name, config.rules)

    converted[name] = createTool({
      id: name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      requireApproval: !rule?.autoApprove,
      execute: async ({ context }) => {
        // MCP経由で実行
        return await executeMCPTool(name, context)
      }
    })
  }

  return converted
}

// エージェント設定
const agent = new Agent({
  id: 'releio-assistant',
  model: 'anthropic/claude-sonnet-4.5',
  tools: convertMCPToolsToMastra(mcpTools, config),
  defaultOptions: {
    requireToolApproval: false // ツールレベルで制御
  }
})
```

#### 工数見積もり（Mastra完全移行）

| タスク                | 工数        |
| --------------------- | ----------- |
| Mastra Agent統合      | 3-5日       |
| MCPツール変換レイヤー | 2-3日       |
| HITL実装              | 2-3日       |
| ストレージ設定        | 1日         |
| フロントエンド統合    | 2-3日       |
| 既存機能移行          | 3-5日       |
| テスト・デバッグ      | 3-5日       |
| **合計**              | **16-25日** |

---

## 4. 結論と推奨

### 4.1 推奨パス

```
現在（v5） ──────────────────────────────────────────▶ 将来
    │                                                    │
    ▼                                                    ▼
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│短期対応  │ ──▶ │v6移行   │ ──▶ │v6で安定 │ ──▶ │Mastra   │
│v5カスタム│     │承認機能 │     │運用     │     │完全移行 │
│(10-15日) │     │(5-9日)  │     │         │     │(16-25日)│
└─────────┘     └─────────┘     └─────────┘     └─────────┘
     ↓                ↓               ↓               ↓
 すぐに必要      推奨経路       中期目標       長期目標
```

### 4.2 最終推奨

| 状況                                 | 推奨アプローチ                                  |
| ------------------------------------ | ----------------------------------------------- |
| **すぐに機能が必要**                 | v5カスタム実装（10-15日）                       |
| **1-2ヶ月の猶予がある**              | **v6移行を推奨**（5-9日）← 最もコスト効率が良い |
| **将来のエージェント拡張を見据える** | Mastra完全移行（16-25日）                       |

### 4.3 補足

- AI SDK v6は2025年12月22日にリリースされたばかりのため、安定性を確認しながら移行することを推奨
- Mastraへの移行は、README.mdのロードマップにも記載されており、長期的には検討価値がある
- 許可ルールの設定UIは、どのアプローチを選んでも実装が必要

---

## 5. 参考リソース

### AI SDK

- [AI SDK v6発表ブログ](https://vercel.com/blog/ai-sdk-6)
- [Human-in-the-Loop Cookbook](https://ai-sdk.dev/cookbook/next/human-in-the-loop)
- [Tool Execution Approval Documentation](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-execution-approval)
- [Migration Guide v5 to v6](https://v6.ai-sdk.dev/docs/migration-guides/migration-guide-6-0)

### Mastra

- [Mastra公式ドキュメント](https://mastra.ai/docs)
- [HITL: Ask Before Acting](https://mastra.ai/blog/tool-approval)
- [Suspend & Resume](https://mastra.ai/docs/workflows/pausing-execution)
- [GitHub Repository](https://github.com/mastra-ai/mastra)

---

## 更新履歴

| 日付       | バージョン | 変更内容 |
| ---------- | ---------- | -------- |
| 2025-12-26 | 1.0        | 初版作成 |
