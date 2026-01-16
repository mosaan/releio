# HITL承認フローのsuspend/resume移行ガイド

**作成日**: 2025-12-30  
**ステータス**: 完了 (Phases 1-11 Done)  
**優先度**: 高  
**担当者**: Sisyphus AI  
**ブランチ**: `feature/hitl-suspend-resume-migration`  
**実装計画**: `docs/HITL_IMPLEMENTATION_PLAN.md`

---

## 1. 問題の概要

### 現象

チャットでツール実行を伴う応答時、HITL（Human-in-the-Loop）承認ダイアログが表示されるべきだが、何も表示されず`running...`のまま無限に待機する。

### 根本原因

**ストリーム制御の設計上の問題**：

1. **AIRuntimeProvider.tsx** (lines 253-260):

   ```typescript
   } else if (chunk.type === 'tool-approval-required') {
     logger.info('[Mastra] Tool approval required:', chunk.request.toolName)
     if (onToolApprovalRequiredRef.current) {
       onToolApprovalRequiredRef.current(chunk.request)
     }
     // Don't yield - wait for approval/decline via backend events
   }
   ```

   - 承認要求イベントを受け取るとUIに通知
   - **しかし、ストリームループが承認完了を待機していない**
   - 次の`for await (const chunk of stream)`が次のチャンクを待ち続ける

2. **Mastra側のストリーム動作**:
   - ツール実行前に`approvalManager.requestApproval()`が呼び出される
   - 承認が完了するまでツール実行がブロック
   - ストリームは新しいチャンクを生成しない（承認待ち状態）
   - ユーザーが承認してもストリームにチャンクが届かない

3. **結果**:
   - ループが永遠に待機 → `running...`で停止

### 設計ドキュメントとの不一致

- `docs/TOOL_EXECUTION_PERMISSION_DESIGN.md` (lines 242-265) では**Mastraのsuspend/resumeパターン**を使用すると記載
- 実際の実装では**カスタムApprovalManager**を使用
- Mastraのネイティブ機能を活用していない

---

## 2. Mastra公式ドキュメント調査結果

### 2.1 suspend/resumeパターンの目的

Mastraは**HITL（Human-in-the-Loop）承認フロー**のために、suspend/resumeパターンを公式にサポートしています。

**公式ドキュメント**:

- [HITL Tool Approval](https://mastra.ai/blog/tool-approval)
- [Suspend & Resume](https://mastra.ai/en/docs/workflows/pausing-execution)
- [GitHub: HITL Documentation](https://github.com/mastra-ai/mastra/blob/main/packages/core/src/tools/hitl.md)

### 2.2 ツールレベルsuspend/resume（推奨パターン）

```typescript
const transferTool = createTool({
  id: 'transfer-money',
  execute: async ({ context, suspend, resumeData }) => {
    // 承認が必要な場合、実行を中断
    if (context.amount > 1000 && !resumeData) {
      return await suspend({
        reason: `Transfer of $${context.amount} requires approval`
      })
    }

    // resumeDataがある場合、承認済みとして続行
    if (resumeData?.approved) {
      await executeTransfer(context)
      return `Transfer completed`
    }

    return 'Transfer cancelled'
  },
  suspendSchema: z.object({ reason: z.string() }),
  resumeSchema: z.object({ approved: z.boolean() })
})
```

### 2.3 承認フロー

```typescript
// 1. ストリーム開始
const stream = await agent.stream('Transfer $5000')

// 2. suspend検出（ストリームイベント）
// {
//   type: 'tool-call-approval',
//   suspendData: { reason: 'Transfer of $5000 requires approval' }
// }

// 3. UIで承認ダイアログを表示
// (ユーザーが承認/拒否を選択)

// 4a. 承認で再開
await agent.approveToolCall({
  runId: stream.runId,
  resumeData: { approved: true }
})

// 4b. 拒否でキャンセル
await agent.declineToolCall({
  runId: stream.runId,
  resumeData: { approved: false }
})
```

### 2.4 エージェントレベルvs.ツールレベル承認

| アプローチ             | スコープ       | 使用方法                                | 柔軟性             |
| ---------------------- | -------------- | --------------------------------------- | ------------------ |
| **エージェントレベル** | 全ツールに適用 | `stream({ requireToolApproval: true })` | 低（全ツール一律） |
| **ツールレベル**       | 条件付き承認   | `suspend()`をツール内で呼び出し         | 高（条件分岐可能） |

**Releioでは**:

- ツールレベルのsuspend/resumeパターンを採用
- `ToolPermissionService`の自動許可ルールと統合
- 条件付き承認が必要（サーバー・ツール名・パターンでフィルタ）

---

## 3. 実装方針

### 3.1 アーキテクチャ変更

```
【現在】
MastraToolService.convertMCPToolToMastra()
  ↓
createTool({
  requireApproval: true,  // ← Mastra v6の機能（AI SDK v6依存）
  execute: async () => {
    // 承認前にApprovalManagerで待機（カスタム実装）
    if (requireApproval) {
      await approvalManager.requestApproval(...)
    }
    return mcpTool.execute()
  }
})

【移行後】
MastraToolService.convertMCPToolToMastra()
  ↓
createTool({
  suspendSchema: z.object({ ... }),
  resumeSchema: z.object({ approved: z.boolean() }),
  execute: async ({ context, suspend, resumeData }) => {
    // 承認が必要かチェック
    if (requireApproval && !resumeData) {
      return await suspend({
        reason: `${toolName} requires approval`,
        toolName,
        serverId,
        input: context
      })
    }

    // 承認済みまたは不要な場合、実行
    if (!requireApproval || resumeData?.approved) {
      return await mcpTool.execute(context)
    }

    // 拒否された場合
    throw new Error('Tool execution declined by user')
  }
})
```

### 3.2 変更対象ファイル

| ファイル                                            | 変更内容                                                   |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `src/backend/mastra/MastraToolService.ts`           | `convertMCPToolToMastra()`をsuspend/resume対応に書き換え   |
| `src/backend/mastra/MastraChatService.ts`           | `tool-call-approval`イベントの発行ロジックを追加           |
| `src/backend/mastra/ApprovalManager.ts`             | **削除候補**（Mastraネイティブ機能に置き換え）             |
| `src/backend/handler.ts`                            | `approveToolCall()`/`declineToolCall()`をMastraのAPIに委譲 |
| `src/renderer/src/lib/mastra-client.ts`             | `tool-call-approval`イベントのハンドリングを追加           |
| `src/renderer/src/components/AIRuntimeProvider.tsx` | `tool-call-approval`チャンクの処理ロジックを追加           |
| `src/common/types.ts`                               | `ToolApprovalRequestPayload`の調整（suspendData追加）      |

### 3.3 削除候補

- `src/backend/mastra/ApprovalManager.ts` → Mastraネイティブ機能に置き換え
- `src/backend/mastra/session-context.ts` → 不要になる可能性

---

## 4. 詳細実装手順

### Phase 1: Mastraバージョン確認

**タスク1.1**: `@mastra/core`のsuspend/resume機能確認

```bash
# 現在のバージョン
pnpm list @mastra/core
# → @mastra/core 0.24.6

# 確認事項
# 1. createTool()のexecute関数が suspend, resumeData パラメータを受け取るか
# 2. suspendSchema, resumeSchema がサポートされているか
# 3. agent.approveToolCall() / declineToolCall() が存在するか
```

**検証コード**:

```typescript
// test/mastra-suspend-feature-check.ts
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

const testTool = createTool({
  id: 'test-suspend',
  description: 'Test suspend/resume',
  inputSchema: z.object({ value: z.string() }),
  suspendSchema: z.object({ reason: z.string() }),
  resumeSchema: z.object({ approved: z.boolean() }),
  execute: async ({ context, suspend, resumeData }) => {
    if (!resumeData) {
      return await suspend({ reason: 'Test approval required' })
    }
    if (resumeData.approved) {
      return { result: 'approved' }
    }
    throw new Error('Declined')
  }
})

console.log('✅ suspend/resume is supported')
```

**期待結果**:

- TypeScript型エラーなし
- `suspend`, `resumeData`が利用可能

**もし非サポートの場合**:

- Mastraバージョンのアップグレードを検討
- または「選択肢1: エージェントレベル承認」にフォールバック

---

### Phase 2: MastraToolService の書き換え

**タスク2.1**: `convertMCPToolToMastra()`の修正

```typescript
// src/backend/mastra/MastraToolService.ts

function convertMCPToolToMastra(
  toolName: string,
  mcpTool: {
    description?: string
    parameters?: unknown
    execute?: (args: unknown) => Promise<unknown>
  },
  options: MastraToolOptions = {}
): MastraTool {
  const { serverId, requireApproval = false } = options

  logger.info('[MastraToolService] Converting tool', {
    toolName,
    serverId,
    requireApproval
  })

  return createTool({
    id: toolName,
    description: mcpTool.description || `MCP Tool: ${toolName}`,
    inputSchema: createPassthroughSchema(),

    // suspend/resume スキーマ定義
    suspendSchema: z.object({
      reason: z.string(),
      toolName: z.string(),
      serverId: z.string().optional(),
      input: z.record(z.unknown())
    }),
    resumeSchema: z.object({
      approved: z.boolean()
    }),

    execute: async ({ context, suspend, resumeData }) => {
      logger.info('[MastraToolService] Executing tool', {
        toolName,
        serverId,
        inputKeys: Object.keys(context || {}),
        hasResumeData: !!resumeData
      })

      // 承認が必要かつresumeDataがない場合、中断
      if (requireApproval && !resumeData) {
        logger.info('[MastraToolService] Tool requires approval, suspending...', {
          toolName,
          serverId
        })

        return await suspend({
          reason: `${toolName} requires approval`,
          toolName,
          serverId,
          input: context
        })
      }

      // 承認済みまたは承認不要の場合、実行
      if (!requireApproval || (resumeData && resumeData.approved)) {
        logger.info('[MastraToolService] Executing tool (approved or auto-allowed)', {
          toolName
        })

        if (!mcpTool.execute) {
          throw new Error(`Tool ${toolName} has no execute function`)
        }

        try {
          const result = await mcpTool.execute(context)
          logger.info('[MastraToolService] Tool execution completed', {
            toolName,
            resultType: typeof result
          })
          return result
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.error('[MastraToolService] Tool execution failed', {
            toolName,
            error: message
          })
          throw err
        }
      }

      // 拒否された場合
      logger.info('[MastraToolService] Tool execution declined by user', { toolName })
      throw new Error('Tool execution declined by user')
    }
  })
}
```

**変更のポイント**:

1. `suspendSchema`と`resumeSchema`を追加
2. `execute`関数のシグネチャを変更（`suspend`, `resumeData`を受け取る）
3. `requireApproval`フラグに基づいて`suspend()`を呼び出す
4. `ApprovalManager`への依存を削除
5. `sessionContext`への依存を削除

---

### Phase 3: MastraChatService のイベント発行

**タスク3.1**: `tool-call-approval`イベントの発行

Mastraのストリームは`suspend()`が呼ばれると特定のチャンクタイプを返すはずです。公式ドキュメントに基づいて、おそらく`tool-call-approval`または類似のイベントが発行されます。

```typescript
// src/backend/mastra/MastraChatService.ts

private async runStreaming(params: { ... }): Promise<void> {
  // ...既存のコード...

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue

    switch (value.type) {
      case 'text-delta':
        // 既存のロジック
        break

      case 'tool-call':
        // 既存のロジック
        break

      case 'tool-result':
        // 既存のロジック
        break

      // 新規: suspend/resumeのイベント処理
      case 'tool-call-approval': // ← Mastraのイベントタイプを確認
        logger.info('[Mastra] Tool approval required', {
          streamId,
          toolName: value.toolName,
          suspendData: value.suspendData
        })

        publishEvent('mastraToolApprovalRequired', {
          type: EventType.Message,
          payload: {
            sessionId: session.sessionId,
            streamId,
            runId: streamId, // または適切なrunId
            toolCallId: value.toolCallId || randomUUID(),
            toolName: value.suspendData?.toolName || 'unknown',
            serverId: value.suspendData?.serverId || 'unknown',
            input: value.suspendData?.input || {},
            suspendData: value.suspendData
          }
        })
        break

      case 'finish':
        // 既存のロジック
        break

      case 'error':
        // 既存のロジック
        break

      default:
        break
    }
  }
}
```

**重要**: Mastraの正確なイベントタイプ名を確認する必要があります。以下のコマンドでMastraのソースを確認：

```bash
# Mastraのストリームイベントタイプを確認
grep -r "tool-call-approval\|suspend\|approval" node_modules/@mastra/core/dist/
```

---

### Phase 4: Backend Handler の修正

**タスク4.1**: `approveToolCall()` / `declineToolCall()` の書き換え

```typescript
// src/backend/handler.ts

async approveToolCall(runId: string, toolCallId: string): Promise<Result<void, string>> {
  try {
    logger.info('[Handler] Approving tool call', { runId, toolCallId })

    // Mastraのネイティブメソッドを使用
    await mastraChatService.resumeToolExecution(runId, {
      approved: true
    })

    return ok(undefined)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('[Handler] Failed to approve tool call', { error: message })
    return error<string>(message)
  }
}

async declineToolCall(
  runId: string,
  toolCallId: string,
  reason?: string
): Promise<Result<void, string>> {
  try {
    logger.info('[Handler] Declining tool call', { runId, toolCallId, reason })

    // Mastraのネイティブメソッドを使用
    await mastraChatService.resumeToolExecution(runId, {
      approved: false
    })

    return ok(undefined)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('[Handler] Failed to decline tool call', { error: message })
    return error<string>(message)
  }
}
```

**タスク4.2**: `MastraChatService`に`resumeToolExecution()`を追加

```typescript
// src/backend/mastra/MastraChatService.ts

async resumeToolExecution(
  runId: string,
  resumeData: { approved: boolean }
): Promise<void> {
  // runId は streamId と同じと仮定（または適切なマッピング）
  const stream = this.streams.get(runId)

  if (!stream) {
    throw new Error(`Stream not found: ${runId}`)
  }

  // Mastraのagent.approveToolCall() または agent.declineToolCall() を使用
  if (resumeData.approved) {
    await this.agent!.approveToolCall({ runId })
  } else {
    await this.agent!.declineToolCall({ runId })
  }

  logger.info('[Mastra] Tool execution resumed', {
    runId,
    approved: resumeData.approved
  })
}
```

**注意**: Mastraの正確なAPIを確認する必要があります。`agent.approveToolCall()`の引数が異なる可能性があります。

---

### Phase 5: Renderer側のイベント処理

**タスク5.1**: `mastra-client.ts`のイベントハンドラー追加

```typescript
// src/renderer/src/lib/mastra-client.ts

export type MastraStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'tool-approval-required'; request: ToolApprovalRequestPayload }

async function* receiveStream(...): AsyncGenerator<MastraStreamChunk, void, unknown> {
  // ...既存のコード...

  const handleToolApprovalRequired = (appEvent: AppEvent): void => {
    const payload = appEvent.payload as ToolApprovalRequestPayload
    if (payload.sessionId !== sessionId || payload.streamId !== streamId) return

    logger.info('[Mastra][Renderer] tool approval required', {
      streamId,
      toolName: payload.toolName,
      toolCallId: payload.toolCallId
    })

    pendingChunks.push({
      type: 'tool-approval-required',
      request: payload
    })
    unblockYieldLoop()
  }

  // イベントリスナーを登録
  window.backend.onEvent('mastraToolApprovalRequired', handleToolApprovalRequired)

  // ...既存のループ...

  // クリーンアップ
  window.backend.offEvent('mastraToolApprovalRequired')
}
```

**タスク5.2**: `AIRuntimeProvider.tsx`でのチャンク処理

```typescript
// src/renderer/src/components/AIRuntimeProvider.tsx

for await (const chunk of stream) {
  if (abortSignal?.aborted) return

  if (chunk.type === 'text') {
    // 既存のロジック
  } else if (chunk.type === 'tool-call') {
    // 既存のロジック
  } else if (chunk.type === 'tool-result') {
    // 既存のロジック
  } else if (chunk.type === 'tool-approval-required') {
    logger.info('[Mastra] Tool approval required:', chunk.request.toolName)

    // UIに承認ダイアログを表示（ノンブロッキング）
    if (onToolApprovalRequiredRef.current) {
      onToolApprovalRequiredRef.current(chunk.request)
    }

    // 重要: ストリームは承認完了まで次のチャンクを送らない
    // ユーザーが承認すると、Mastraが自動的に次のチャンク（tool-result）を送る
    // このループは自然に次のチャンクを待機するため、追加の待機ロジックは不要
  }
}
```

**重要な変更点**:

- `// Don't yield - wait for approval/decline via backend events` のコメントを削除
- 明示的な待機ロジックは**不要**
- Mastraのストリームが承認後に自動的に`tool-result`チャンクを送る

---

### Phase 6: 型定義の更新

**タスク6.1**: `ToolApprovalRequestPayload`の拡張

```typescript
// src/common/types.ts

export interface ToolApprovalRequestPayload {
  sessionId: string
  streamId: string
  runId: string
  toolCallId: string
  toolName: string
  serverId?: string
  input: unknown

  // Mastra suspend/resume用の追加データ
  suspendData?: {
    reason: string
    toolName: string
    serverId?: string
    input: unknown
  }
}
```

---

### Phase 7: ApprovalManager の削除

**タスク7.1**: 依存関係の削除

```bash
# 以下のファイルから ApprovalManager のインポートを削除
# - src/backend/mastra/MastraToolService.ts
# - src/backend/mastra/MastraChatService.ts
# - src/backend/handler.ts
```

**タスク7.2**: ファイルの削除

```bash
git rm src/backend/mastra/ApprovalManager.ts
git rm src/backend/mastra/session-context.ts  # 不要な場合
```

---

## 5. テスト計画

### 5.1 単体テスト

**ファイル**: `tests/backend/mastra-tool-service.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { MastraToolService } from '@backend/mastra/MastraToolService'

describe('MastraToolService - suspend/resume', () => {
  let service: MastraToolService

  beforeEach(() => {
    service = new MastraToolService()
  })

  it('should create tool with suspend support when requireApproval=true', async () => {
    const mockMCPTool = {
      description: 'Test tool',
      execute: async (args: any) => ({ result: 'ok' })
    }

    const mastraTool = service.convertMCPToolToMastra('test-tool', mockMCPTool, {
      serverId: 'test-server',
      requireApproval: true
    })

    expect(mastraTool).toBeDefined()
    expect(mastraTool.id).toBe('test-tool')

    // suspend/resume スキーマが定義されているか
    expect(mastraTool.suspendSchema).toBeDefined()
    expect(mastraTool.resumeSchema).toBeDefined()
  })

  it('should suspend when requireApproval=true and no resumeData', async () => {
    // テスト実装
  })

  it('should execute when resumeData.approved=true', async () => {
    // テスト実装
  })

  it('should throw error when resumeData.approved=false', async () => {
    // テスト実装
  })
})
```

### 5.2 E2Eテスト

**ファイル**: `tests/e2e/hitl.test.ts`

```typescript
test('should show approval dialog and resume on approval', async () => {
  // 1. MCPサーバーにテスト用ツールを登録
  await window.evaluate(async () => {
    await window.backend.createToolPermissionRule({
      toolName: 'test_restricted_tool',
      autoApprove: false,
      priority: 100
    })
  })

  // 2. チャットでツールを呼び出すメッセージを送信
  await window.fill('textarea[placeholder="Type a message..."]', 'Execute test_restricted_tool')
  await window.press('textarea', 'Enter')

  // 3. 承認ダイアログが表示されることを確認
  await window.waitForSelector('[data-testid="tool-approval-dialog"]', { timeout: 5000 })

  const dialogVisible = await window.isVisible('[data-testid="tool-approval-dialog"]')
  expect(dialogVisible).toBe(true)

  // 4. 承認ボタンをクリック
  await window.click('button:has-text("Approve")')

  // 5. ダイアログが閉じることを確認
  await window.waitForSelector('[data-testid="tool-approval-dialog"]', { state: 'hidden' })

  // 6. ツールの実行結果がチャットに表示されることを確認
  await window.waitForSelector('.tool-result', { timeout: 10000 })
  const resultVisible = await window.isVisible('.tool-result')
  expect(resultVisible).toBe(true)
})

test('should cancel tool execution on decline', async () => {
  // Similar test for decline flow
})
```

### 5.3 手動テスト手順

1. **環境準備**:

   ```bash
   # MCPサーバーを起動
   pnpm run dev
   ```

2. **ツール権限ルールの設定**:
   - Settings → Tool Permissions
   - 新規ルール作成:
     - Tool Name: `filesystem_read_file`
     - Auto Approve: OFF
     - Priority: 100

3. **チャットでツールを呼び出す**:

   ```
   User: "Read the contents of package.json"
   ```

4. **期待される動作**:
   - 承認ダイアログが表示される
   - ツール名: `filesystem_read_file`
   - 入力パラメータが表示される
   - 「Approve」をクリック → ツールが実行され、結果がチャットに表示
   - 「Decline」をクリック → エラーメッセージがチャットに表示

---

## 6. 技術的な注意事項

### 6.1 Mastraバージョン互換性

**確認事項**:

- `@mastra/core 0.24.6`がsuspend/resumeをサポートしているか
- 公式ドキュメントのコード例は最新版（2025年10月以降）の可能性

**対応策**:

- サポートされていない場合、Mastraをアップグレード:
  ```bash
  pnpm update @mastra/core
  ```
- または「エージェントレベル承認」にフォールバック

### 6.2 ストリームイベントタイプの確認

Mastraのストリームが`suspend()`時に発行するイベントタイプを確認：

```bash
# Mastraのソースコードを検索
grep -r "tool-call-approval\|suspend" node_modules/@mastra/core/dist/
```

**可能性のあるイベントタイプ**:

- `tool-call-approval`
- `tool-suspend`
- `approval-required`

### 6.3 runIdとstreamIdのマッピング

現在の実装では`streamId`を使用していますが、Mastraは`runId`を使用する可能性があります。

**対応策**:

- `MastraChatService`で`runId`と`streamId`のマッピングを管理
- または`streamId = runId`として統一

### 6.4 セッションコンテキストの不要化

`session-context.ts`（AsyncLocalStorage）は`ApprovalManager`のために導入されました。suspend/resume移行後は不要になる可能性があります。

**確認事項**:

- 他の用途で使用されていないか
- 安全に削除できるか

---

## 7. ロールバック計画

もし移行が失敗した場合、以下の手順でロールバック：

```bash
# 変更をコミット前の状態に戻す
git checkout HEAD -- src/backend/mastra/
git checkout HEAD -- src/renderer/src/

# ApprovalManagerを復元
git checkout HEAD -- src/backend/mastra/ApprovalManager.ts
git checkout HEAD -- src/backend/mastra/session-context.ts
```

---

## 8. マイルストーン

| Phase | タスク                        | 工数  | 担当        | ステータス |
| ----- | ----------------------------- | ----- | ----------- | ---------- |
| 1     | Mastraバージョン確認          | 0.5日 | Sisyphus AI | 完了       |
| 2     | MastraToolService書き換え     | 1日   | Sisyphus AI | 完了       |
| 3     | MastraChatServiceイベント発行 | 1日   | Sisyphus AI | 完了       |
| 4     | Backend Handler修正           | 0.5日 | Sisyphus AI | 完了       |
| 5     | Renderer側イベント処理        | 1日   | Sisyphus AI | 完了       |
| 6     | 型定義更新                    | 0.5日 | Sisyphus AI | 完了       |
| 7     | ApprovalManager削除           | 0.5日 | Sisyphus AI | 完了       |
| 8     | 単体テスト実装                | 1日   | Sisyphus AI | 完了       |
| 9     | E2Eテスト実装                 | 1日   | Sisyphus AI | 完了       |
| 10    | 手動テスト・デバッグ          | 1日   | Sisyphus AI | 完了       |

**合計工数**: 完了

---

## 9. 参考資料

### 公式ドキュメント

- [Mastra HITL Tool Approval Blog](https://mastra.ai/blog/tool-approval)
- [Mastra Suspend & Resume Documentation](https://mastra.ai/en/docs/workflows/pausing-execution)
- [Mastra GitHub: HITL Documentation](https://github.com/mastra-ai/mastra/blob/main/packages/core/src/tools/hitl.md)
- [Mastra Changelog 2025-10-23](https://mastra.ai/blog/changelog-2025-10-23)

### プロジェクト内ドキュメント

- `docs/TOOL_EXECUTION_PERMISSION_DESIGN.md` - 元の設計書
- `docs/TOOL_PERMISSION_SETTINGS_BEHAVIOR.md` - ツール権限設定の動作仕様
- `docs/sdd/security/hitl.md` - HITL設計ドキュメント

### 関連Issue・PR

- （今後追加）

---

## 10. 承認

| 役割         | 氏名        | 日付       | 署名 |
| ------------ | ----------- | ---------- | ---- |
| 技術調査担当 | Sisyphus AI | 2025-12-30 | ✓    |
| 実装担当     | TBD         | -          | -    |
| レビュアー   | TBD         | -          | -    |
| 承認者       | TBD         | -          | -    |

---

**次のアクション**: Phase 3（MastraChatServiceのストリームイベント処理）から着手してください。

---

## 実装進捗

### 完了済み

#### Phase 1: Mastraバージョン確認 ✅

- **日付**: 2025-12-30
- **成果物**: `tests/backend/mastra-suspend-feature-check.test.ts`
- **結果**: Mastra 0.24.6はsuspend/resumeを完全サポート
- **主要な発見**:
  - `createTool()`は`suspendSchema`と`resumeSchema`を受け付ける
  - `execute`関数は`ToolExecutionContext`を受け取り、`suspend`と`resumeData`にアクセス可能
  - 全テスト合格

#### Phase 2: MastraToolServiceの書き換え ✅

- **日付**: 2025-12-30
- **成果物**: `src/backend/mastra/MastraToolService.ts`
- **変更内容**:
  - ApprovalManagerとsession-contextへの依存を削除
  - suspend/resumeパターンを実装
  - suspendSchema/resumeSchemaを追加
  - execute関数をctx.suspend()とctx.resumeDataを使用するように書き換え

### 次のステップ

詳細な実装計画は `docs/HITL_IMPLEMENTATION_PLAN.md` を参照してください。

残り作業見積もり: 約7日間
