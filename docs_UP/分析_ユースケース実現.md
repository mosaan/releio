# ユースケース実現（分析）―全主要ユースケース

アーキテクチャ上重要と判断したユースケースについて、現行実装（`src/backend/*`, `src/main/*`, `src/renderer/*`）に即したラフな実現シナリオをまとめる。バウンダリ/コントロール/エンティティは`docs_UP/分析_分析モデル.md`のパッケージに対応する。

## UC-01: AIと会話する（ストリーミング + MCPツール呼び出し）

### シナリオ概要
- ユーザーがチャット画面からメッセージを送信する。
- RendererはBackendへストリーミング要求を送り、Backendがモデル選択・MCPツール連携を調停する。
- AIプロバイダーからのトークンとツール呼び出し要求を逐次UIへ反映し、永続化する。

### シーケンス（ラフ）
```plantuml
@startuml
actor User
participant ChatUI <<boundary>>
participant RendererChatController <<control>>
participant ConversationController <<control>>
participant SessionController <<control>>
participant MCPController <<control>>
participant "AI Provider" as AI <<entity>>
participant "MCP Server" as MCP <<entity>>

User -> ChatUI : 1. メッセージ入力
ChatUI -> RendererChatController : 2. sendMessage(sessionId, text)
RendererChatController -> SessionController : 3. ユーザーメッセージ保存(pending)
RendererChatController -> ConversationController : 4. streamAIText(messages, modelSelection)
ConversationController -> MCPController : 5. 使用可能ツールの収集
ConversationController -> AI : 6. ストリーミング開始(messages, tools)
AI --> ConversationController : 7. トークン/ツール呼び出し要求
ConversationController -> ChatUI : 8. ストリームイベント中継
ConversationController -> SessionController : 9. assistantメッセージを更新(streaming/ログ)

alt ツール呼び出しがある場合
  ConversationController -> MCPController : 10. callTool(serverId, tool, args)
  MCPController -> MCP : 11. ツール実行(stdio)
  MCP --> MCPController : 12. 実行結果/エラー
  MCPController --> ConversationController : 13. ツール結果
  ConversationController -> AI : 14. ツール結果をAIへ返送
end

ConversationController -> SessionController : 15. 完了状態・トークン数を保存
ConversationController -> ChatUI : 16. 最終レスポンス表示（streaming→completed）
@enduml
```

### 留意点
- モデル選択とAPIキー解決は`AISettingsV2`（プロバイダー設定）を優先し、Fallbackとして旧設定を使う。
- コンテキスト長の確認と圧縮判断は`CompressionController`が行い、必要に応じてスナップショットを追加する。
- 失敗時はストリーム停止・エラーイベントを即時UIに返し、セッション側にエラーを記録する。

## UC-02: 会話セッションを管理する（作成/一覧/検索/削除）

### シナリオ概要
- ユーザーがセッション一覧から新規作成・既存セッション選択・検索・削除を行う。
- RendererはBackendの`ChatSessionStore`経由でDrizzle ORMの`chatSessions`/`chatMessages`/`messageParts`へCRUDを実行し、最後に開いたセッションIDを`settings`に保持する。

### シーケンス（ラフ）
```plantuml
@startuml
actor User
participant SessionListUI <<boundary>>
participant RendererSessionController <<control>>
participant SessionController <<control>>
participant ChatSessionStore <<entity>>

== 新規セッション作成 ==
User -> SessionListUI : 1. New Sessionクリック
SessionListUI -> RendererSessionController : 2. createSession(title?, providerConfigId?, modelId?)
RendererSessionController -> SessionController : 3. createSession(request)
SessionController -> ChatSessionStore : 4. insert chatSessions
ChatSessionStore --> SessionController : 5. sessionId
SessionController -> ChatSessionStore : 6. setLastSessionId(sessionId)
SessionController --> RendererSessionController : 7. sessionId
RendererSessionController --> SessionListUI : 8. UIへ反映

== 一覧/検索 ==
User -> SessionListUI : 1. 一覧/検索表示
SessionListUI -> RendererSessionController : 2. listSessions({sortBy, includeArchived}) / searchSessions(query)
RendererSessionController -> SessionController : 3. listSessions/searchSessions
SessionController -> ChatSessionStore : 4. select chatSessions (+ archived filter)
ChatSessionStore --> RendererSessionController : 5. rows
RendererSessionController --> SessionListUI : 6. 表示

== 削除 ==
User -> SessionListUI : 1. セッション削除
SessionListUI -> RendererSessionController : 2. deleteSession(sessionId)
RendererSessionController -> SessionController : 3. deleteSession
SessionController -> ChatSessionStore : 4. delete chatSessions (cascade messages/parts/toolInvocations)
ChatSessionStore --> RendererSessionController : 5. 完了
RendererSessionController --> SessionListUI : 6. UI更新
@enduml
```

### 留意点
- `listSessions`は`includeArchived=false`が既定、`sortBy`は`updatedAt/createdAt/title`を選択可能。
- 削除はcascadeで関連メッセージ・ツール呼び出しも削除される。
- `getSession`はパーツ/ツール呼び出しをJOINして返却し、UIはISO8601に変換済みのタイムスタンプを扱う。

## UC-03: AIプロバイダー設定を管理する（作成/編集/削除/モデル更新）

### シナリオ概要
- ユーザーがAI設定画面でプロバイダー構成（APIキー、Base URL、モデル一覧、既定選択）をCRUDする。
- Backendは`ai-settings.ts`で`ai_v2`設定をDrizzle `settings`テーブルに保存し、必要に応じてv1からv2へ自動移行する。
- モデル更新はプロバイダー別API（OpenAI/Azureの`/v1/models`）を手動で呼び、返却が空なら現状維持、返却があればAPIモデルを置換しつつカスタムモデルを保持する。

### シーケンス（ラフ）
```plantuml
@startuml
actor User
participant AISettingsUI <<boundary>>
participant RendererAISettingsController <<control>>
participant AISettingsController <<control>>
participant AISettingsStore <<entity>>
participant ProviderAPI <<entity>>

== 取得 ==
User -> AISettingsUI : 1. 設定画面を開く
AISettingsUI -> RendererAISettingsController : 2. loadAISettings()
RendererAISettingsController -> AISettingsController : 3. getAISettingsV2()
AISettingsController -> AISettingsStore : 4. getSetting(ai_v2) or migrate from ai(v1)
AISettingsStore --> RendererAISettingsController : 5. settings v2

== 作成/編集 ==
User -> AISettingsUI : 1. 新規/編集
AISettingsUI -> RendererAISettingsController : 2. saveProvider(config)
RendererAISettingsController -> AISettingsController : 3. create/update/delete providerConfig
AISettingsController -> AISettingsStore : 4. setSetting(ai_v2)
AISettingsStore --> RendererAISettingsController : 5. 保存完了

== モデル更新 ==
User -> AISettingsUI : 1. 「モデルを再取得」
AISettingsUI -> RendererAISettingsController : 2. refreshModels(configId)
RendererAISettingsController -> AISettingsController : 3. refreshModelsFromAPI(configId)
AISettingsController -> ProviderAPI : 4. list models (provider-specific)
ProviderAPI --> AISettingsController : 5. modelIds
AISettingsController -> AISettingsStore : 6. replace API models + keep custom, save
AISettingsStore --> RendererAISettingsController : 7. updated models
@enduml
```

### 留意点
- モデル選択は`StreamAIOptions.modelSelection`から`providerConfigId/modelId`で指定され、BackendでAPIキーとBase URLを確定する。
- Azureは`resourceName/useDeploymentBasedUrls`を含む`AzureProviderConfig`に従い、モデル取得にはbaseURLが必須。
- モデル刷新はAPIがモデル一覧を返した場合にのみAPIモデルを全置換し、`source=custom`のモデルは保持する。APIが空/未対応の場合は既存モデルを維持する。

## UC-04: MCPサーバーを管理する（登録と起動）

### シナリオ概要
- ユーザーがMCPサーバー設定を追加・有効化し、提供ツール/リソースを取得する。
- Backendがサーバープロセスを起動し、状態変化をRendererへ通知する。

### シーケンス（ラフ）
```plantuml
@startuml
actor User
participant SettingsUI <<boundary>>
participant RendererSettingsController <<control>>
participant MCPController <<control>>
database "DB" as DB
participant "MCP Server Process" as MCP <<entity>>

User -> SettingsUI : 1. サーバー情報入力(command, args, env, enabled)
SettingsUI -> RendererSettingsController : 2. 保存要求
RendererSettingsController -> MCPController : 3. add/updateMCPServer(config)
MCPController -> DB : 4. 設定を永続化
MCPController -> MCP : 5. 有効サーバーを起動(stdio接続)
MCPController -> SettingsUI : 6. ステータス通知(connected/stopped/error)
SettingsUI -> MCPController : 7. listTools/listResources
MCPController -> MCP : 8. ツール/リソース取得
MCP --> MCPController : 9. 定義・stderr詳細
MCPController --> SettingsUI : 10. 一覧表示・デバッグ情報
@enduml
```

### 留意点
- サーバーごとの状態（connected/stopped/error）は`statusEmitter`経由で全Rendererへブロードキャストされる。
- stderr/exitコードなどのデバッグ情報は、エラー時にUIへ返却し設定見直しを促す。
- AIストリーミングは有効なMCPツール一覧を毎回集約するため、UC-01とUC-04の連携点としてMCP設定の正確性が重要。

## UC-05: ネットワーク設定を管理する（プロキシ/証明書/接続テスト）

### シナリオ概要
- ユーザーがネットワーク設定画面でプロキシ・証明書モードを選択し、接続テストを実行する。
- Backendは`settings/proxy.ts`と`settings/certificate.ts`で`settings`テーブルに保存し、モードに応じてOS設定を読み込む。テストは`settings/connectionTest.ts`でAIプロバイダーへのフェッチを実行する。

### シーケンス（ラフ）
```plantuml
@startuml
actor User
participant NetworkSettingsUI <<boundary>>
participant RendererNetworkController <<control>>
participant NetworkSettingsController <<control>>
participant ProxySettingsStore <<entity>>
participant CertificateSettingsStore <<entity>>
participant ProviderFetch <<entity>>

== 読み込み ==
User -> NetworkSettingsUI : 1. 画面表示
NetworkSettingsUI -> RendererNetworkController : 2. loadProxy/Certificate()
RendererNetworkController -> NetworkSettingsController : 3. getProxySettings/getCertificateSettings
NetworkSettingsController -> ProxySettingsStore : 4. load + system fallback
NetworkSettingsController -> CertificateSettingsStore : 5. load + system fallback
ProxySettingsStore --> RendererNetworkController : 6. proxy settings
CertificateSettingsStore --> RendererNetworkController : 7. certificate settings

== 保存 ==
User -> NetworkSettingsUI : 1. 保存
NetworkSettingsUI -> RendererNetworkController : 2. saveProxySettings/saveCertificateSettings
RendererNetworkController -> NetworkSettingsController : 3. setProxySettings/setCertificateSettings
NetworkSettingsController -> Stores : 4. setSetting(proxy/certificate)

== 接続テスト ==
User -> NetworkSettingsUI : 1. 接続テスト開始
NetworkSettingsUI -> RendererNetworkController : 2. testConnection(mode)
RendererNetworkController -> NetworkSettingsController : 3. testProxy/Certificate/Combined
NetworkSettingsController -> ProviderFetch : 4. fetch via createCustomFetch(proxy, certificates)
ProviderFetch --> NetworkSettingsController : 5. 成否/詳細
NetworkSettingsController --> RendererNetworkController : 6. ConnectionTestResult
RendererNetworkController --> NetworkSettingsUI : 7. UI表示
@enduml
```

### 留意点
- 初回起動時はプロキシ/証明書とも`system`モードに初期化される。Windowsのみシステム取得を実装。
- テストはプロキシ/証明書/複合の3種類を個別に実施し、`ConnectionTestResult`で成功・警告・失敗理由を返す。
- `createCustomFetch`でプロキシ・CAバンドルをNode Fetchへ注入し、AI/モデル取得経路と共通化する。

## UC-06: アプリケーションを更新する（静的サーバー利用）

### シナリオ概要
- アプリ起動後、Mainが`updater.ts`を初期化し3秒後に非同期で更新確認を行う。結果はIPC経由でRendererへ通知され、ユーザーがダウンロード/インストールを選択する。
- 設定は開発時は`ELECTRON_UPDATER_CONFIG`、本番は実行ファイル隣接の`updater.json`から読み込む。

### シーケンス（ラフ）
```plantuml
@startuml
actor User
participant RendererApp <<boundary>>
participant RendererUpdateController <<control>>
participant MainHandler <<control>>
participant Updater <<entity>>
participant UpdateServer <<entity>>

== 起動とチェック ==
RendererApp -> RendererUpdateController : 1. バックエンド接続完了
RendererUpdateController -> MainHandler : 2. ping/checkForUpdates? (手動チェック)
MainHandler -> Updater : 3. checkForUpdates()
Updater -> UpdateServer : 4. fetch latest.yml
UpdateServer --> Updater : 5. update info
Updater -> RendererUpdateController : 6. update-available / not-available

== ダウンロード ==
User -> RendererApp : 1. 「Download Now」
RendererApp -> RendererUpdateController : 2. downloadUpdate()
RendererUpdateController -> MainHandler : 3. downloadUpdate()
MainHandler -> Updater : 4. download
Updater -> RendererUpdateController : 5. progress events
Updater -> RendererUpdateController : 6. update-downloaded

== インストール ==
User -> RendererApp : 1. 「Restart Now」
RendererApp -> RendererUpdateController : 2. quitAndInstall()
RendererUpdateController -> MainHandler : 3. quitAndInstall()
MainHandler -> Updater : 4. quitAndInstall()
@enduml
```

### 留意点
- Windows向け`generic`プロバイダーを前提。SHA-512署名は`electron-updater`が検証。
- 更新イベントはRendererの`UpdateNotification`で購読し、UIダイアログを表示する。
- `Updater`未初期化時はIPCハンドラが`Updater not initialized`を返すため、Main起動順序に依存。

## UC-07: 会話履歴を圧縮する（内部ユースケース）

### シナリオ概要
- 長いセッションのトークン量を削減するため、Backendの`CompressionService`が要約スナップショットを作成し、以後のAIコンテキスト構築時にサマリを先頭に挿入する。
- 要約作成には`TokenCounter`でトークン数を算出し、`SummarizationService`でモデルへ要約を依頼する（現在はプレースホルダ/ベースライン実装）。結果は`sessionSnapshots.kind=summary`として保存する。

### シーケンス（ラフ）
```plantuml
@startuml
participant ConversationController <<control>>
participant CompressionController <<control>>
participant CompressionService <<entity>>
participant TokenCounter <<entity>>
participant SummarizationService <<entity>>
participant ChatSessionStore <<entity>>

ConversationController -> CompressionController : 1. compressIfNeeded(sessionId, settings)
CompressionController -> ChatSessionStore : 2. getSession(messages)
CompressionController -> TokenCounter : 3. countTokens(messages)
alt 閾値超過
  CompressionController -> CompressionService : 4. compress(sessionId, messages, settings)
  CompressionService -> TokenCounter : 5. countTokens
  CompressionService -> SummarizationService : 6. summarize(messages)
  SummarizationService --> CompressionService : 7. summary text
  CompressionService -> ChatSessionStore : 8. createSnapshot(kind=summary, cutoffId, tokenCount)
  CompressionService --> CompressionController : 9. CompressionResult(compressed, summaryId,…)
else 閾値未満
  CompressionController --> ConversationController : 4'. not needed
end
CompressionController -> ChatSessionStore : 10. buildAIContext() （summaryメッセージ+最近のメッセージ）
CompressionController --> ConversationController : 11. コンテキスト返却
@enduml
```

### 留意点
- スナップショットは`sessionSnapshots`に保存され、`buildAIContext`でサマリ+cutoff以降のメッセージを返す。
- `CompressionSettings`は閾値/ターゲット長/サマリ格納の挙動を規定し、UIから渡される想定。現状はBackend側で直接呼び出され、UIの設定化はAD-008で別途設計予定。
- 圧縮実行時にメッセージ削除は行わない（サマリ追加のみ）。後続の実装で保持ポリシー設定と連動予定。
