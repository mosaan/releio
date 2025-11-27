# ユースケース設計（UC-02, UC-03, UC-05, UC-06, UC-07）―推敲フェーズ補完

目的: 反復2で不足していた主要ユースケースの設計観点を、現行実装のインターフェイスと責務分担に合わせて明文化する。Renderer/Main/Backendの3プロセス構成を前提とし、IPC/APIコントラクトの入口を示す。

## 共通前提とインフラ
- IPCブリッジは`@common/connection`を介し、Renderer→Backend (`backend.handler`) と Renderer→Main (`main.handler`) を分離する。
- Backendは`Handler`クラス（`src/backend/handler.ts`）でユースケース別の公開メソッドを提供し、内部では`ChatSessionStore`、`CompressionService`、`ai-settings.ts`、`settings/proxy.ts`等のサービスを組み合わせる。
- 永続化はDrizzle ORM (`src/backend/db/schema.ts`) を通じて`tmp/db/app.db`に保存される。設定は`settings`テーブル、チャットは`chatSessions/chatMessages/messageParts/toolInvocations/sessionSnapshots`を使用。
- エラーは`Result<OK, string>`でRendererへ返却し、UIはメッセージ/ダイアログでフィードバックする。

## UC-01: AIと会話する（エラー/永続化観点）
- **入口**: `backend.handler.streamAIText(messages, { modelSelection?, chatSessionId? })` → `ai/stream.ts`。
- **永続化フロー**: Rendererの`AIRuntimeProvider`が`chatSessionId`付き送信時にユーザーメッセージを`addChatMessage`で即時保存。Backendはストリーム完了時に累積したテキスト/ツール呼び出しパートを`ChatSessionStore.addMessage`へ一括保存し、受信済みツール結果を`recordToolInvocationResult`で反映する（`tool_result`パート生成＋`tool_invocations`更新）。
- **エラーフロー**: ストリーム失敗時は`aiChatError`イベントで`{ sessionId, error: string }`を発火。`MessagePrimitive.Error`が短いメッセージを表示するが、分類・詳細表示・入力自動復元は未実装。ユーザーは手動で再編集して送信する。
- **履歴復元**: セッション切替時に`getChatSession`のレスポンス（メッセージ+パート+`compressionSummaries`）を`convertMessagesToThreadFormat`で`assistant-ui`ランタイムへインポートし、直近履歴と圧縮マーカーを再構成する。
- **ギャップ**: 失敗メッセージの自動復元・ワンクリック再送・エラー分類/詳細トグルなし。失敗したアシスタント応答は保存されず、ユーザー側メッセージのみDBに残る。

## UC-02: セッション管理
- **入口**: `backend.handler`  
  - `createSession(CreateSessionRequest): Result<string>`  
  - `getSession(id): Result<ChatSessionWithMessages | null>`  
  - `listSessions(options): Result<ChatSessionRow[]>`  
  - `searchSessions(query): Result<ChatSessionRow[]>`  
  - `deleteSession(id): Result<void>`  
  - `setLastSessionId(id)/getLastSessionId(): Result<string | null>`
- **責務**:
  - `ChatSessionStore`がDB整合性（メッセージ数カウント、cascade delete）を保証。
  - Renderer側`SessionList`/`ChatPanel`はISO8601タイムスタンプで表示・ソートし、`includeArchived`のON/OFFをUIで選択する（デフォルトはアーカイブ除外）。
  - `lastSessionId`は起動時復元に利用し、存在しないIDの場合はUIがフェールセーフで新規作成にフォールバックする。セッション読込時に`compressionSummaries`も受け取り、履歴表示に挿入する。
- **例外/エラー設計**:
  - セッション未存在時は`Result.error('Session ... not found')`を返却し、UIはトースト+リスト再取得を行う。
  - DB障害時は`error`ログを残し、ユーザーには簡潔なメッセージを表示。

## UC-03: AIプロバイダー設定管理
- **入口**: `backend.handler`  
  - `getAISettingsV2(): Result<AISettingsV2>`（v1→v2自動移行含む）  
  - `saveAISettingsV2(settings): Result<void>`  
  - `create/update/deleteProviderConfiguration`  
  - `add/update/deleteModel`  
  - `refreshModelsFromAPI(configId): Result<AIModelDefinition[]>`
- **責務**:
  - `ai-settings.ts`が設定スキーマ整合性とv1→v2移行を担保し、`defaultSelection`を維持する。
  - `defaultSelection`は移行時に設定されるのみでUIからの変更導線はなく、ModelSelectorはlocalStorageに選択を保持する。
  - モデル解決は`StreamAIOptions.modelSelection`→明示指定`provider/model`→v1設定(`ai`キー)の順。`FACTORY`のデフォルトモデルで足りない値を補う。
  - Rendererは編集フォームで`enabled`/`modelRefreshEnabled`を切替可能（後者は保存のみで自動処理なし）にし、未設定APIキーの場合は保存前にバリデートする。
- **例外/エラー設計**:
  - APIキー欠如、無効な`providerConfigId/modelId`は`Error`をthrowし`Result.error`でUIへ返却。UIはフォームエラー表示。
  - モデル更新でAPIが空を返した場合は既存モデルを維持し、警告メッセージを表示する（log warnを伴う）。

## UC-05: ネットワーク設定管理（プロキシ/証明書/接続テスト）
- **入口**: `backend.handler`  
  - `getProxySettings()/setProxySettings(ProxySettings)`  
  - `getCertificateSettings()/setCertificateSettings(CertificateSettings)`  
  - `testProxyConnection/testCertificateConnection/testCombinedConnection`
- **責務**:
  - `settings/proxy.ts`がモードごとの解決（system/custom/none）と初期化を実施。Windowsのみ`getSystemProxySettings`を実装し、他OSはnoneでフェイルセーフ。
  - `settings/certificate.ts`がWindows証明書ストア読込・カスタムCA保存を担当。
  - `settings/connectionTest.ts`が`createCustomFetch`を用いてAIエンドポイントへのテストアクセスを行い、`ConnectionTestResult`に詳細を含める。
  - Rendererは結果を「成功/警告/失敗 + 詳細メッセージ」で表示し、保存とテストを分離したUIにする。
- **例外/エラー設計**:
  - OSサポート外や取得失敗時は`mode='none'`で返却しつつwarnログ。UIは「システム設定を取得できませんでした」と案内。
  - テスト失敗時は`status='error'`と`details`を表示し、プロキシ認証・証明書検証エラーを明示。

## UC-06: アプリケーション更新
- **入口**: `main.handler`  
  - `checkForUpdates(): Result<UpdateCheckResult>`  
  - `downloadUpdate(): Result<void>`  
  - `quitAndInstall(): Result<void>`
- **責務**:
  - `updater.ts`が`electron-updater`のイベントを購読し、RendererへIPCイベント（available/progress/downloaded/error）をブロードキャスト。
  - `updater-config.ts`が`ELECTRON_UPDATER_CONFIG`または`updater.json`から設定を読み込む。UIが設定編集を持たないため、環境変数/ファイルで変更する前提。
  - Rendererの`UpdateNotification`がユーザー選択（Download/Restart/Dismiss）を管理し、メインウィンドウが閉じてもプロセスが残る状態に注意して`quitAndInstall`を実行する。
- **例外/エラー設計**:
  - Updater未初期化時は`Result.error`を返し、Rendererは再試行ボタンを非活性化する。
  - ダウンロード失敗は進捗イベントで通知され、UIはリトライ操作を提供する。

## UC-07: 会話履歴圧縮（内部）
- **入口**: `backend.handler`  
  - `compressConversation(sessionId, CompressionSettings): Result<CompressionResult>`  
  - `getCompressionPreview(sessionId, settings): Result<CompressionPreview>`  
  - `getCompressionSummaries(sessionId): Result<CompressionSummary[]>`
- **責務**:
  - `CompressionService`がトークン計測(`TokenCounter`)と要約(`SummarizationService`)を統合し、`sessionSnapshots`に`kind=summary`を保存する。カットオフ以降のメッセージは保持。
  - `ModelConfigService`が圧縮用モデル選択を解決する。設定未指定時は既定の圧縮モデル/プロバイダーを適用。
  - 呼び出し元（`ConversationController`）はAIストリーミング開始前に`compressIfNeeded`を実行し、`buildAIContext`でサマリ+最近メッセージをコンテキスト化する。
- **例外/エラー設計**:
  - 圧縮不要の場合は`compressed=false`で返却し、UIは「圧縮不要」を表示するだけでメッセージ削除は行わない。
  - 要約失敗時はエラーを返し、セッションデータを変更しない。ログに詳細を残し、ユーザーにはリトライを促す。

## インターフェイス一覧（トレース用）
- Renderer↔Backend IPC: `backend.handler`で上記メソッドを公開。`@common/types`の`Result`ラッパーを返す。
- Renderer↔Main IPC: 更新関連のみ`main.handler`経由。
- DBマッピング: `chatSessions`（セッションメタ）、`chatMessages`/`messageParts`/`toolInvocations`（メッセージ・ツール）、`sessionSnapshots`（圧縮要約）、`settings`（AI/ネットワーク/アップデート設定）。

## 変更履歴
- 2025-11-26: 初版（UC-02/03/05/06/07の設計補完、現行実装ベース）
