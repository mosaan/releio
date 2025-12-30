# シーケンス図

本ドキュメントでは、Releio の主要なユースケースフローを Mermaid シーケンス図で示す。

- **参照元**: `src/backend/mastra/`, `src/backend/compression/`, `src/main/updater.ts`, `src/backend/handler.ts`
- **関連**: `architecture/overview.md`, `architecture/integration-patterns.md`

---

## 1. AI ストリーミング応答（Mastra + AI SDK v5）

Renderer からユーザー入力を受け取り、Backend で Mastra Agent を介して AI プロバイダーと通信し、リアルタイムでストリーミング応答を返す基本フローを示す。

```mermaid
sequenceDiagram
    participant User
    participant Renderer
    participant Backend as Backend<br/>(MastraChatService)
    participant Mastra as Mastra Agent
    participant AI as AI Provider<br/>(OpenAI/Anthropic/Google)
    participant DB as SQLite DB

    User->>Renderer: メッセージ入力
    Renderer->>Backend: streamMastraText(sessionId, messages)

    Backend->>Backend: ensureAgent() - AI設定読み込み・Agent初期化
    Backend->>Mastra: stream(messages, {threadId, resourceId})
    Mastra->>AI: POST /chat/completions (streaming)

    loop Stream Chunks
        AI-->>Mastra: Delta chunk (text-delta)
        Mastra-->>Backend: value.type='text-delta'
        Backend-->>Renderer: Event: mastraChatChunk
        Renderer-->>User: テキスト部分表示（UI更新）
    end

    AI-->>Mastra: finish event
    Mastra-->>Backend: value.type='finish'
    Backend->>Backend: onFinish() コールバック実行
    Backend->>DB: INSERT chat_messages (role='assistant', parts=[text])
    Backend-->>Renderer: Event: mastraChatEnd
    Renderer-->>User: 完了UI表示
```

**特記事項**:

- `MastraChatService.streamText()` は streamId を即座に返却し、非同期で `runStreaming()` タスクを起動。
- `fullStream.getReader()` で ReadableStream を逐次処理。
- テキストが複数チャンクに分割される場合、`currentTextBlock` をフラッシュして `parts` 配列に格納。
- ストリーム完了後、`onFinish` コールバックで `ChatSessionStore.addMessage()` を呼び出し永続化。

---

## 2. MCP ツール呼び出し + HITL 承認フロー

AI がツール呼び出しを指示した場合、権限ルールを評価して自動承認または人間による承認（HITL）を経て実行するフローを示す。

```mermaid
sequenceDiagram
    participant User
    participant Renderer
    participant Backend as Backend<br/>(MastraChatService)
    participant Mastra as Mastra Agent
    participant ToolService as MastraToolService
    participant PermSvc as ToolPermissionService
    participant MCPMgr as MCP Manager
    participant MCP as MCP Server<br/>(stdio/SSE)
    participant DB as SQLite DB

    Note over Backend,Mastra: AI応答中にツール呼び出し指示
    Mastra-->>Backend: value.type='tool-call'<br/>{toolCallId, toolName, input}
    Backend->>Backend: publishEvent('mastraToolCall')
    Backend-->>Renderer: Event: mastraToolCall

    Mastra->>ToolService: execute tool via createTool wrapper
    ToolService->>PermSvc: shouldAutoApproveSync(serverId, toolName)

    alt 自動承認ルール適用
        PermSvc-->>ToolService: true (auto-approve)
        ToolService->>MCPMgr: callTool(serverId, toolName, args)
        MCPMgr->>MCP: JSON-RPC: tools/call
        MCP-->>MCPMgr: result
        MCPMgr-->>ToolService: result
        ToolService-->>Mastra: result
    else 承認必要（HITL）
        PermSvc-->>ToolService: false (requires approval)
        ToolService->>Renderer: Event: toolApprovalRequest<br/>{toolName, args}
        Renderer->>User: ダイアログ表示「ツール実行を承認しますか？」
        User->>Renderer: 承認 / 拒否
        alt ユーザー承認
            Renderer->>Backend: approveToolCall(runId, toolCallId)
            Backend->>ToolService: execute継続
            ToolService->>MCPMgr: callTool(...)
            MCPMgr->>MCP: tools/call
            MCP-->>MCPMgr: result
            MCPMgr-->>ToolService: result
            ToolService-->>Mastra: result
        else ユーザー拒否
            Renderer->>Backend: declineToolCall(runId, toolCallId, reason)
            Backend->>Mastra: AbortError
            Mastra-->>Backend: error event
            Backend-->>Renderer: Event: mastraChatError
        end
    end

    Mastra-->>Backend: value.type='tool-result'<br/>{toolCallId, output}
    Backend->>Backend: parts.push({kind:'tool_result'})
    Backend-->>Renderer: Event: mastraToolResult
    Backend->>DB: INSERT message parts (tool_invocation + tool_result)

    Note over Mastra,AI: AI がツール結果を使って応答を続行
    Mastra->>AI: 続きのストリーミング（tool_result含む）
    AI-->>Mastra: 追加のテキスト応答
```

**特記事項**:

- `MastraToolService.getAllToolsWithPermissions()` で `ToolPermissionService` の評価結果に基づき `requireApproval` フラグを設定。
- Mastra の `createTool()` は `requireApproval: true` の場合、内部で承認フローを起動（Phase 3 実装）。
- **Phase 3.2 TODO**: 現在 `approveToolCall` / `declineToolCall` はログ出力のみ。Mastra HITL API との統合が必要。

---

## 3. 会話圧縮トリガー（自動圧縮）

トークン使用量が閾値を超過した際、古いメッセージを要約して `session_snapshots` に保存し、コンテキストサイズを削減するフローを示す。

```mermaid
sequenceDiagram
    participant User
    participant Renderer
    participant Backend as Backend<br/>(Handler)
    participant CompSvc as CompressionService
    participant TokenCtr as TokenCounter
    participant SumSvc as SummarizationService
    participant Store as ChatSessionStore
    participant DB as SQLite DB
    participant AI as AI Provider<br/>(要約生成)

    User->>Renderer: メッセージ入力
    Renderer->>Backend: getTokenUsage(sessionId, provider, model, input)
    Backend->>CompSvc: checkContext(sessionId, provider, model, input)

    CompSvc->>Store: getSession(sessionId)
    Store-->>CompSvc: session + messages
    CompSvc->>Store: buildAIContext(sessionId)
    Store-->>CompSvc: contextMessages (既存サマリー含む)

    CompSvc->>TokenCtr: countConversationTokens(contextMessages)
    TokenCtr-->>CompSvc: totalTokens
    CompSvc->>CompSvc: currentTokenCount + additionalInput tokens
    CompSvc->>CompSvc: thresholdTokenCount = contextLimit * threshold (e.g., 95%)

    alt トークン使用量 > 閾値
        CompSvc-->>Backend: {needsCompression: true, ...}
        Backend-->>Renderer: TokenUsageInfo (needsCompression=true)
        Renderer->>User: 「圧縮が推奨されます」通知

        User->>Renderer: 圧縮実行 or 自動圧縮
        Renderer->>Backend: compressConversation(sessionId, provider, model, apiKey)
        Backend->>CompSvc: autoCompress({sessionId, ...})

        CompSvc->>CompSvc: retentionBudget計算（最新N件保持）
        CompSvc->>CompSvc: messagesToCompress = messages.slice(0, retentionIndex)

        CompSvc->>SumSvc: summarize(messagesToCompress, provider, model, apiKey)
        SumSvc->>AI: POST /chat/completions (要約プロンプト)
        AI-->>SumSvc: summary text
        SumSvc-->>CompSvc: summary

        CompSvc->>TokenCtr: countText(summary)
        TokenCtr-->>CompSvc: summaryTokens

        CompSvc->>Store: createSnapshot({sessionId, kind='summary', content, messageCutoffId, tokenCount})
        Store->>DB: INSERT session_snapshots
        DB-->>Store: summaryId
        Store-->>CompSvc: summaryId

        CompSvc->>CompSvc: 新トークン数 = summaryTokens + retainedMessagesTokens
        CompSvc-->>Backend: {compressed: true, summaryId, compressionRatio}
        Backend-->>Renderer: CompressionResult
        Renderer->>User: 「圧縮完了（XX% 削減）」通知
    else トークン使用量 <= 閾値
        CompSvc-->>Backend: {needsCompression: false}
        Backend-->>Renderer: TokenUsageInfo (needsCompression=false)
    end
```

**特記事項**:

- `CompressionService.checkContext()` でモデルの `maxInputTokens` と `threshold` 設定（デフォルト 95%）を比較。
- 保持するメッセージ数は `retentionTokens` 設定（デフォルト 2000 トークン）に基づく。
- 既存サマリーがある場合、`summaryPrefix` として連結し、累積的な要約を生成。
- 要約メッセージは `role='system', id='summary-...'` として `ChatSessionStore.buildAIContext()` が挿入。
- **Auto Compress 設定**: `CompressionSettings.autoCompress` が true の場合、Renderer は自動的に圧縮実行可能。

---

## 4. 自動更新フロー（electron-updater）

アプリ起動時または手動トリガーでアップデート確認、ダウンロード、インストールを行うフローを示す。

```mermaid
sequenceDiagram
    participant User
    participant Renderer
    participant Main as Main Process<br/>(Updater)
    participant AutoUpdater as electron-updater
    participant Server as Update Server<br/>(GitHub Releases)
    participant OS

    Note over Main,AutoUpdater: アプリ起動時（3秒遅延）
    Main->>Main: initialize(config, mainWindow)
    Main->>AutoUpdater: checkForUpdates()
    AutoUpdater->>Server: GET latest.yml
    Server-->>AutoUpdater: latest.yml (version, files)

    alt 新バージョン検出
        AutoUpdater-->>Main: 'update-available' event
        Main->>Main: _isUpdateAvailable = true
        Main->>Renderer: IPC: 'update-available' {version, releaseNotes}
        Renderer->>User: 通知「アップデート v1.2.0 が利用可能です」

        User->>Renderer: 「ダウンロード」クリック
        Renderer->>Main: IPC: downloadUpdate()
        Main->>AutoUpdater: downloadUpdate()
        AutoUpdater->>Server: GET app-setup-1.2.0.exe

        loop ダウンロード進捗
            Server-->>AutoUpdater: chunk data
            AutoUpdater-->>Main: 'download-progress' event
            Main->>Renderer: IPC: 'update-download-progress' {percent, transferred, total}
            Renderer->>User: プログレスバー更新
        end

        Server-->>AutoUpdater: download complete
        AutoUpdater-->>Main: 'update-downloaded' event
        Main->>Renderer: IPC: 'update-downloaded' {version}
        Renderer->>User: 「インストール準備完了」通知

        User->>Renderer: 「今すぐ再起動してインストール」クリック
        Renderer->>Main: IPC: quitAndInstall()
        Main->>Main: _isQuittingToInstall = true
        Main->>Main: removeAllListeners('window-all-closed', 'before-quit')
        Main->>AutoUpdater: quitAndInstall(false, true)
        AutoUpdater->>OS: アプリ終了 + インストーラー起動
        OS->>User: インストーラー UI
        User->>OS: インストール完了
        OS->>User: アプリ再起動
    else 新バージョンなし
        AutoUpdater-->>Main: 'update-not-available' event
        Main->>Renderer: IPC: 'update-not-available'
        Note over Renderer: 通知なし（ログのみ）
    end

    alt エラー発生（ネットワーク/署名検証失敗）
        AutoUpdater-->>Main: 'error' event
        Main->>Renderer: IPC: 'update-error' {message, code}
        Renderer->>User: エラー通知「アップデート確認に失敗しました」
    end
```

**特記事項**:

- `Updater` クラスは `src/main/updater.ts` で実装。Main プロセスのみで動作。
- `autoUpdater.autoDownload = false` により、ユーザー承認後にダウンロード開始。
- `autoUpdater.autoInstallOnAppQuit = false` により、明示的な `quitAndInstall()` 呼び出しが必要。
- `_isQuittingToInstall` フラグで通常の quit ハンドラと区別し、インストーラー起動を妨げないよう配慮。
- **開発環境**: `NODE_ENV=development` の場合、更新確認はスキップされる。
- **設定**: `UpdaterConfig` で `enabled`, `updateServerUrl`, `channel` を制御可能（`src/main/updater-config.ts`）。

---

## 5. IPC メッセージフロー（Connection 層）

Renderer ↔ Backend / Main 間の MessagePort IPC 通信パターンを示す。

```mermaid
sequenceDiagram
    participant Renderer
    participant Preload
    participant Main
    participant Backend as Backend<br/>(Utility Process)

    Note over Renderer,Backend: Connection 確立（アプリ起動時）
    Main->>Backend: utilityProcess.fork()
    Backend->>Main: process.send({type:'ready'})
    Main->>Renderer: preload bridge 経由で MessagePort 渡す

    Note over Renderer,Backend: RPC 呼び出し（invoke/result パターン）
    Renderer->>Preload: window.api.backend.invoke('getSetting', {key: 'theme'})
    Preload->>Backend: MessagePort.postMessage({type:'invoke', id, method, params})
    Backend->>Backend: Handler.getSetting(key)
    Backend->>Backend: Result<T,E> 生成
    Backend-->>Preload: MessagePort.postMessage({type:'result', id, data})
    Preload-->>Renderer: Promise resolve(data)

    Note over Renderer,Backend: イベント配信（event パターン）
    Backend->>Backend: publishEvent('mastraChatChunk', {sessionId, chunk})
    Backend-->>Preload: MessagePort.postMessage({type:'event', channel, payload})
    Preload->>Renderer: eventBus.emit('mastraChatChunk', payload)
    Renderer->>Renderer: UI イベントハンドラ実行

    Note over Renderer,Main: Renderer ↔ Main (Update イベント)
    Main->>Renderer: webContents.send('update-available', data)
    Renderer->>Renderer: useEffect で IPC イベントリスナー登録
```

**特記事項**:

- `@common/connection.ts` で `Connection` クラスが `invoke / result / event` の 3 種メッセージを統一処理。
- `invoke` は `Promise<Result<T,E>>` を返し、タイムアウト時は `TimeoutError`。
- `event` は pub/sub パターン。Backend から Renderer への一方向通知。
- Main ↔ Renderer は従来の `ipcMain / ipcRenderer` も併用（Auto-update イベント等）。

---

## まとめ

上記 5 つのシーケンス図は、Releio の主要なランタイムフローを網羅する:

1. **AI ストリーミング**: ユーザー入力 → AI 応答 → UI 更新 → DB 永続化
2. **MCP ツール + HITL**: AI ツール呼び出し → 権限評価 → 承認フロー → 実行 → 結果記録
3. **会話圧縮**: トークン超過検知 → 古メッセージ要約 → スナップショット保存 → コンテキスト削減
4. **自動更新**: 起動時チェック → 新版検出 → ダウンロード → インストーラー起動
5. **IPC 通信**: MessagePort RPC + イベントバス

これらのフローは `architecture/integration-patterns.md` で定義した同期/非同期パターン、ACL、データ所有権ルールに準拠している。
