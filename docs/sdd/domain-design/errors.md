# エラー設計

本ドキュメントでは、Releio のエラー分類・ハンドリング戦略・ユーザー向けメッセージ設計を記述する。

- **対象読者**: 開発チーム、QA
- **目的**: 一貫したエラー処理、ユーザーフレンドリーなエラーメッセージ
- **関連**: `requirements/acceptance-criteria.md`, `domain-design/state-machines.md`

---

## エラー分類

### 1. システムエラー（System Errors）

**原因**: プログラムバグ、環境問題  
**例**: DB 接続失敗、メモリ不足、未処理例外  
**対応**: ログ記録 + ユーザーに「予期しないエラーが発生しました」通知

### 2. バリデーションエラー（Validation Errors）

**原因**: ユーザー入力不正  
**例**: 空の API キー、無効な URL、トークン数が負  
**対応**: 入力フォーム横にエラーメッセージ表示

### 3. ビジネスルールエラー（Business Rule Errors）

**原因**: ビジネスロジック制約違反  
**例**: セッション削除済み、ツール自動承認拒否  
**対応**: 明確なエラーメッセージ + 代替案提示

### 4. 外部システムエラー（External System Errors）

**原因**: 外部 API・サービスの障害  
**例**: AI API エラー、MCP サーバークラッシュ、ネットワーク断  
**対応**: リトライ + ユーザーに「一時的な問題」通知

### 5. ユーザーキャンセル（User Cancellation）

**原因**: ユーザーの明示的な操作  
**例**: ストリーム停止、ツール実行拒否  
**対応**: エラーとして扱わない、ログに記録のみ

---

## Result 型パターン

Releio では `Result<T, E>` 型で成功/失敗を明示的に扱う。

### 型定義

```typescript
// @common/result.ts

export type Result<T, E = string> = { status: 'ok'; value: T } | { status: 'error'; error: E }

export function ok<T>(value: T): Result<T, never> {
  return { status: 'ok', value }
}

export function error<E>(err: E): Result<never, E> {
  return { status: 'error', error: err }
}

export function isOk<T, E>(result: Result<T, E>): result is { status: 'ok'; value: T } {
  return result.status === 'ok'
}
```

### 使用例

```typescript
// Backend API
async getSetting(key: string): Promise<Result<unknown, string>> {
  try {
    const value = await getSetting(key)
    return ok(value)
  } catch (err) {
    logger.error('Failed to get setting', { key, error: err })
    return error(err instanceof Error ? err.message : 'Unknown error')
  }
}

// Frontend 呼び出し側
const result = await window.api.backend.invoke('getSetting', { key: 'theme' })
if (isOk(result)) {
  console.log('Setting value:', result.value)
} else {
  showToast('設定の取得に失敗しました: ' + result.error, 'error')
}
```

---

## エラーコード体系

### フォーマット

```
{Category}-{SubCategory}-{Number}
```

### カテゴリ

| コード | カテゴリ             | 例                                    |
| ------ | -------------------- | ------------------------------------- |
| `SYS`  | システムエラー       | `SYS-DB-001`: DB 接続失敗             |
| `VAL`  | バリデーションエラー | `VAL-INPUT-001`: API キー空           |
| `BIZ`  | ビジネスルールエラー | `BIZ-SESSION-001`: セッション削除済み |
| `EXT`  | 外部システムエラー   | `EXT-AI-001`: AI API エラー           |
| `NET`  | ネットワークエラー   | `NET-PROXY-001`: プロキシ認証失敗     |

### 主要エラーコード一覧

| エラーコード       | 説明                 | ユーザーメッセージ例                                                        |
| ------------------ | -------------------- | --------------------------------------------------------------------------- |
| `EXT-AI-001`       | AI API 認証エラー    | 「API キーが無効です。設定画面で確認してください。」                        |
| `EXT-AI-002`       | AI API レート制限    | 「API レート制限に達しました。しばらく待ってから再試行してください。」      |
| `EXT-AI-003`       | AI API タイムアウト  | 「AI サーバーからの応答がありません。ネットワーク接続を確認してください。」 |
| `EXT-MCP-001`      | MCP サーバー起動失敗 | 「MCP サーバーの起動に失敗しました。コマンドとパスを確認してください。」    |
| `EXT-MCP-002`      | MCP ツール実行エラー | 「ツール実行に失敗しました: {toolName}」                                    |
| `NET-PROXY-001`    | プロキシ認証失敗     | 「プロキシ認証に失敗しました。ユーザー名・パスワードを確認してください。」  |
| `NET-PROXY-002`    | プロキシ接続失敗     | 「プロキシサーバーに接続できません。URL を確認してください。」              |
| `NET-CERT-001`     | 証明書検証失敗       | 「SSL 証明書の検証に失敗しました。証明書パスを確認してください。」          |
| `VAL-INPUT-001`    | 必須フィールド空     | 「{fieldName} は必須です。」                                                |
| `VAL-INPUT-002`    | 無効な形式           | 「{fieldName} の形式が正しくありません。」                                  |
| `BIZ-SESSION-001`  | セッション不在       | 「セッションが見つかりません。削除されたか、無効なIDです。」                |
| `BIZ-COMPRESS-001` | 圧縮失敗             | 「会話の圧縮に失敗しました: {reason}」                                      |
| `SYS-DB-001`       | DB エラー            | 「データベース操作に失敗しました。アプリを再起動してください。」            |
| `SYS-UPDATE-001`   | 更新チェック失敗     | 「アップデートの確認に失敗しました。ネットワーク接続を確認してください。」  |

---

## エラーハンドリング戦略

### 1. API レイヤー（IPC ハンドラ）

```typescript
// Backend Handler
async streamMastraText(...): Promise<Result<string, string>> {
  try {
    const streamId = await mastraChatService.streamText(...)
    return ok(streamId)
  } catch (err) {
    logger.error('[Mastra] streamText failed', { error: err })

    // エラー種別に応じたメッセージ
    if (err instanceof AuthenticationError) {
      return error('EXT-AI-001: API キーが無効です')
    } else if (err instanceof RateLimitError) {
      return error('EXT-AI-002: API レート制限に達しました')
    } else if (err instanceof TimeoutError) {
      return error('EXT-AI-003: タイムアウトしました')
    } else {
      return error(`予期しないエラー: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }
}
```

### 2. サービスレイヤー

```typescript
// MastraChatService
async streamText(...) {
  const selection = await this.ensureAgent()

  if (!selection) {
    throw new Error('有効な AI プロバイダー設定がありません')
  }

  const streamId = randomUUID()
  const abortController = new AbortController()

  this.runStreaming({...}).catch(err => {
    if (isAbortError(err)) {
      logger.info('[Mastra] Stream aborted', { streamId })
    } else {
      logger.error('[Mastra] Stream failed', { streamId, error: err })
      publishEvent('mastraChatError', { sessionId, streamId, error: err.message })
    }
  })

  return streamId
}
```

### 3. UI レイヤー（Renderer）

```typescript
// Frontend
async function handleSendMessage(message: string) {
  setIsLoading(true)
  setError(null)

  const result = await window.api.backend.invoke('streamMastraText', {
    sessionId,
    messages: [...history, { role: 'user', content: message }]
  })

  if (isOk(result)) {
    setStreamId(result.value)
  } else {
    setError(result.error)

    // エラーコードに応じた処理
    if (result.error.includes('EXT-AI-001')) {
      // API キーエラー → 設定画面へ誘導
      showErrorDialog({
        title: 'API キーエラー',
        message: result.error,
        actions: [
          { label: 'settings' へ移動', onClick: () => navigate('/settings') }
        ]
      })
    } else {
      // 一般エラー → トースト表示
      showToast(result.error, 'error')
    }
  }

  setIsLoading(false)
}
```

---

## リトライ戦略

### 1. 指数バックオフ

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt)
        logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
          error: lastError.message
        })
        await sleep(delay)
      }
    }
  }

  throw lastError
}
```

### 2. リトライ対象エラー

| エラー種別             | リトライ | 最大回数 | バックオフ          |
| ---------------------- | -------- | -------- | ------------------- |
| ネットワーク接続エラー | ✅       | 3        | 指数 (1s → 2s → 4s) |
| AI API レート制限      | ✅       | 2        | 線形 (5s → 10s)     |
| AI API タイムアウト    | ✅       | 2        | 固定 (3s → 3s)      |
| 認証エラー             | ❌       | 0        | -                   |
| バリデーションエラー   | ❌       | 0        | -                   |
| DB ロック              | ✅       | 5        | 固定 (500ms)        |

---

## ユーザーメッセージ設計原則

### 1. 明確性

**何が起きたか + どうすればよいか**

✅ **Good**:  
「API キーが無効です。設定画面で API キーを確認してください。」

❌ **Bad**:  
「401 Unauthorized」

---

### 2. 簡潔性

**1-2 文で完結**

✅ **Good**:  
「ネットワーク接続に失敗しました。接続を確認してください。」

❌ **Bad**:  
「ネットワーク接続を確立しようとしましたが、リモートサーバーから応答がありませんでした。これはファイアウォール、プロキシ設定、または一時的なサーバー障害が原因である可能性があります...」

---

### 3. 技術詳細の排除

**ユーザー向けは平易な言葉、ログには技術詳細**

✅ **Good** (ユーザーメッセージ):  
「MCP サーバーの起動に失敗しました。」

✅ **Good** (ログ):

```
[MCP] Failed to start server: spawn ENOENT, command='npx', args=['-y', '@invalid/package']
```

❌ **Bad** (ユーザーメッセージ):  
「Error: spawn ENOENT at Process.ChildProcess.\_handle.onexit」

---

### 4. アクション提示

**次に何をすべきか明示**

✅ **Good**:  
「圧縮に失敗しました。古いメッセージを削除してから再試行してください。」

❌ **Bad**:  
「圧縮に失敗しました。」

---

## エラー境界（Error Boundaries）

### React Error Boundary

```typescript
// Renderer
class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('[React] Unhandled error', { error, errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          resetError={() => this.setState({ hasError: false, error: null })}
        />
      )
    }
    return this.props.children
  }
}
```

---

## グローバルエラーハンドラ

### Main / Backend プロセス

```typescript
// electron-log の errorHandler
import logger from './logger'

process.on('uncaughtException', (err) => {
  logger.error('[Process] Uncaught exception', { error: err.message, stack: err.stack })
  // クラッシュせず、エラー記録のみ
})

process.on('unhandledRejection', (reason) => {
  logger.error('[Process] Unhandled rejection', { reason })
})
```

### Renderer プロセス

```typescript
window.addEventListener('error', (event) => {
  logger.error('[Window] Unhandled error', { message: event.message, filename: event.filename })
})

window.addEventListener('unhandledrejection', (event) => {
  logger.error('[Window] Unhandled promise rejection', { reason: event.reason })
})
```

---

## まとめ

Releio のエラー設計原則:

1. **Result 型**: 成功/失敗を型で明示
2. **エラーコード**: 分類・原因特定を容易化
3. **リトライ戦略**: 一時的障害を自動復旧
4. **ユーザーメッセージ**: 明確・簡潔・アクション提示
5. **ログ記録**: 技術詳細はログに、ユーザーには平易な表現

**次のステップ**:

- 各エラーコードに対応するテストケース作成
- エラーメッセージの多言語対応（Phase 2）
- エラー監視ダッシュボード（将来）
