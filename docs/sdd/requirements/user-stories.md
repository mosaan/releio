# ユーザーストーリー

本ドキュメントでは、Releio の機能要求をユーザーストーリー形式で記述し、優先度・受入基準・関連ユースケースを明示する。

- **対象読者**: 開発チーム、プロダクトマネージャー、QA
- **目的**: スプリント計画、実装タスクの基盤、受入テストシナリオ作成
- **関連**: `requirements/personas.md`, `requirements/use-cases.md`, `requirements/acceptance-criteria.md`

---

## ストーリー形式

```
As a [ペルソナ],
I want to [行動・機能],
So that [目的・価値].
```

### 優先度（MoSCoW）

- **Must Have**: MVP必須（P0）
- **Should Have**: 初期リリース推奨（P1）
- **Could Have**: Phase 2以降（P2）
- **Won't Have (Now)**: 将来検討（P3）

### 状態

- ✅ Done
- 🚧 In Progress
- 📝 To Do
- 💡 Proposed

---

## エピック 1: AI チャット基盤

### US-001: AI プロバイダー設定

**優先度**: Must Have  
**状態**: ✅ Done  
**ペルソナ**: 開発者, パワーユーザー  
**関連 UC**: UC-007

**ストーリー**:  
As a **開発者**,  
I want to **設定画面で複数の AI プロバイダー（OpenAI / Anthropic / Google）を登録し、API キー・モデルを管理**する,  
So that **複数のプロバイダーを使い分けてタスクに最適な AI を選択できる**.

**受入基準**:

- [ ] 設定画面に「AI プロバイダー」タブが存在する
- [ ] 「新規プロバイダー追加」ボタンで追加フォーム表示
- [ ] OpenAI / Anthropic / Google から選択可能
- [ ] API キー入力後、「モデル一覧を取得」ボタンでモデル取得成功
- [ ] 取得したモデルをチェックボックスで選択・保存可能
- [ ] `ai_provider_configurations` テーブルに保存されること
- [ ] 無効な API キーの場合、エラーメッセージ表示

**技術ノート**:

- `src/backend/settings/ai-settings.ts`: `createProviderConfiguration()`
- UI: `src/renderer/src/components/Settings/AIProviderSettings.tsx`

---

### US-002: AI チャット実行

**優先度**: Must Have  
**状態**: ✅ Done  
**ペルソナ**: 全ペルソナ  
**関連 UC**: UC-001

**ストーリー**:  
As a **ライトユーザー**,  
I want to **チャット画面でテキストを入力し、AI からリアルタイムで応答を受け取る**,  
So that **質問応答・文章添削・コード生成を即座に実行できる**.

**受入基準**:

- [ ] チャット画面に入力欄とメッセージ履歴が表示される
- [ ] テキスト入力 → Enter / 送信ボタンで送信可能
- [ ] AI 応答がストリーミング形式で逐次表示される（0.1秒以内に開始）
- [ ] ストリーミング中に「停止」ボタンで中断可能
- [ ] 応答完了後、`chat_messages` テーブルに保存される
- [ ] エラー時（API キー無効・レート制限）はトースト通知表示

**技術ノート**:

- Backend: `MastraChatService.streamText()`
- Renderer: AssistantUI の `useThread()` フック
- IPC: `mastraChatChunk` / `mastraChatEnd` / `mastraChatError` イベント

---

### US-003: 複数セッション管理

**優先度**: Should Have  
**状態**: ✅ Done  
**ペルソナ**: 開発者  
**関連 UC**: UC-001

**ストーリー**:  
As a **開発者**,  
I want to **複数のチャットセッションを作成・切り替え・削除**する,  
So that **プロジェクトごと・タスクごとに会話を整理できる**.

**受入基準**:

- [ ] サイドバーにセッション一覧表示
- [ ] 「新規セッション」ボタンでセッション作成
- [ ] セッションクリックで切り替え（履歴読み込み）
- [ ] セッション右クリック → 「名前変更」「削除」メニュー表示
- [ ] 削除時は確認ダイアログ表示
- [ ] 最後に開いたセッションを次回起動時に自動復元

**技術ノート**:

- `ChatSessionStore.createSession()`, `updateSession()`, `deleteSession()`
- UI: `SessionList.tsx`, `SessionItem.tsx`

---

## エピック 2: MCP ツール統合

### US-004: MCP サーバー登録

**優先度**: Must Have  
**状態**: ✅ Done  
**ペルソナ**: 開発者, パワーユーザー  
**関連 UC**: UC-008

**ストーリー**:  
As a **開発者**,  
I want to **GUI で MCP サーバーを登録し、コマンド・引数・環境変数を設定**する,  
So that **CLI 設定ファイルを編集せずに MCP ツールを追加できる**.

**受入基準**:

- [ ] 設定画面に「MCP サーバー」タブ存在
- [ ] 「新規サーバー追加」ボタンでフォーム表示
- [ ] サーバー名、コマンド、引数配列、環境変数（JSON）を入力可能
- [ ] 「保存」で `mcp_servers` テーブルに保存
- [ ] 保存後、Backend が自動的にサーバー起動（stdio）
- [ ] ステータス表示: 🟢 Running / 🔴 Stopped
- [ ] エラー時は stderr ログ表示

**技術ノート**:

- Backend: `MCP Manager.addServer()`, `startServer()`
- UI: `MCPServerSettings.tsx`, `MCPServerForm.tsx`

---

### US-005: MCP ツール自動実行

**優先度**: Must Have  
**状態**: ✅ Done  
**ペルソナ**: 開発者  
**関連 UC**: UC-002

**ストーリー**:  
As a **開発者**,  
I want to **AI が応答中にツールを自動実行し、結果を使って応答を続行**する,  
So that **手動でコマンド実行せずに AI が作業を完結できる**.

**受入基準**:

- [ ] AI がツール呼び出しを指示（例: `filesystem_read`）
- [ ] Backend が自動的に MCP サーバーにツール実行リクエスト送信
- [ ] ツール実行結果が AI に返却される
- [ ] UI にツール実行ログ表示（折りたたみ可能）
- [ ] エラー時は AI がエラーメッセージをユーザーに説明
- [ ] `chat_messages.parts` に `tool_invocation` + `tool_result` 記録

**技術ノート**:

- `MastraToolService.getAllToolsWithPermissions()`
- `MastraChatService` の `tool-call` / `tool-result` イベント処理
- UI: `ToolExecutionLog.tsx`

---

### US-006: HITL ツール承認

**優先度**: Should Have  
**状態**: 🚧 In Progress (Phase 3.2)  
**ペルソナ**: エンタープライズユーザー  
**関連 UC**: UC-005

**ストーリー**:  
As an **エンタープライズユーザー**,  
I want to **AI がツールを実行する前に承認ダイアログで内容を確認**する,  
So that **意図しない操作（ファイル削除・外部API課金）を防止できる**.

**受入基準**:

- [ ] ツール実行前に承認ダイアログ表示（ツール名・引数・説明）
- [ ] 「承認」「拒否」「今後このツールは自動承認」選択肢
- [ ] 承認時: ツール実行続行
- [ ] 拒否時: AI に拒否通知 → 代替案提示
- [ ] 「今後自動承認」選択時: `tool_permission_rules` に保存
- [ ] 次回から該当ツールは自動実行（ダイアログなし）

**技術ノート**:

- `ToolPermissionService.shouldAutoApproveSync()`
- Mastra の `requireApproval` フラグ統合（Phase 3.2 実装中）
- UI: `ToolApprovalDialog.tsx`

---

### US-007: ツール権限ルール管理

**優先度**: Should Have  
**状態**: ✅ Done  
**ペルソナ**: エンタープライズユーザー  
**関連 UC**: UC-005

**ストーリー**:  
As an **エンタープライズユーザー**,  
I want to **設定画面でツール権限ルール（自動承認・要承認・拒否）を一覧・編集**する,  
So that **ツールごとのセキュリティポリシーを一元管理できる**.

**受入基準**:

- [ ] 設定画面に「ツール権限」タブ存在
- [ ] 既存ルール一覧表示（ツール名・モード・優先度）
- [ ] 「新規ルール追加」ボタンでフォーム表示
- [ ] ツール名パターン（正規表現 or 完全一致）、モード（auto_approve / require_approval / deny）を設定
- [ ] 優先度（数値、昇順で評価）を設定
- [ ] ルール編集・削除可能
- [ ] `tool_permission_rules` テーブルに保存

**技術ノート**:

- `ToolPermissionService.createRule()`, `updateRule()`, `deleteRule()`
- UI: `ToolPermissionSettings.tsx`

---

## エピック 3: 会話圧縮

### US-008: トークン使用量監視

**優先度**: Should Have  
**状態**: ✅ Done  
**ペルソナ**: パワーユーザー  
**関連 UC**: UC-009

**ストーリー**:  
As a **パワーユーザー**,  
I want to **チャット画面でトークン使用量をリアルタイム表示**する,  
So that **コンテキスト限界に達する前に圧縮・整理できる**.

**受入基準**:

- [ ] チャット画面上部にトークンメーター表示（現在トークン数 / 最大トークン数）
- [ ] プログレスバー色変化: 緑（<70%）、黄（70-90%）、赤（>90%）
- [ ] 「詳細」クリックでトークン内訳表示（システム・要約・通常メッセージ・ツール定義）
- [ ] メッセージ入力時に追加トークン数をプレビュー
- [ ] 閾値超過時にトースト通知「圧縮を推奨します」

**技術ノート**:

- `CompressionService.checkContext()`, `getTokenBreakdown()`
- UI: `TokenMeter.tsx`, `TokenBreakdownDialog.tsx`

---

### US-009: 会話自動圧縮

**優先度**: Should Have  
**状態**: ✅ Done  
**ペルソナ**: 開発者, パワーユーザー  
**関連 UC**: UC-003

**ストーリー**:  
As a **開発者**,  
I want to **トークン使用量が閾値を超えた際、古いメッセージを自動要約**する,  
So that **長時間会話を継続でき、コンテキスト切断を回避できる**.

**受入基準**:

- [ ] トークン使用量が閾値（デフォルト 95%）超過時、圧縮推奨通知
- [ ] 「今すぐ圧縮」ボタンで圧縮実行
- [ ] Backend が古いメッセージを要約（AI API 使用）
- [ ] 要約を `session_snapshots` に保存（kind='summary'）
- [ ] 次回 AI 呼び出し時、要約が system メッセージとして挿入
- [ ] 圧縮完了通知「圧縮完了（75% 削減）」
- [ ] 自動圧縮設定 ON の場合、通知なしで自動実行

**技術ノート**:

- `CompressionService.autoCompress()`
- `ChatSessionStore.buildAIContext()` が要約を挿入
- UI: `CompressionNotification.tsx`

---

### US-010: 圧縮設定カスタマイズ

**優先度**: Could Have  
**状態**: 📝 To Do  
**ペルソナ**: パワーユーザー  
**関連 UC**: UC-009

**ストーリー**:  
As a **パワーユーザー**,  
I want to **圧縮閾値（%）・保持メッセージ数をスライダーで調整**する,  
So that **タスクに応じて圧縮頻度を最適化できる**.

**受入基準**:

- [ ] 設定画面 or チャット画面に「圧縮設定」ダイアログ
- [ ] 閾値スライダー（70% - 100%）、デフォルト 95%
- [ ] 保持トークン数スライダー（500 - 5000）、デフォルト 2000
- [ ] 自動圧縮 ON/OFF トグル
- [ ] 設定変更が即座に反映（リアルタイム）
- [ ] セッションごと or グローバル設定を選択可能

**技術ノート**:

- `settings` テーブル: `compression:${sessionId}` or `compression:global-defaults`
- UI: `CompressionSettingsDialog.tsx`

---

## エピック 4: エンタープライズネットワーク対応

### US-011: プロキシ設定

**優先度**: Should Have  
**状態**: ✅ Done  
**ペルソナ**: エンタープライズユーザー  
**関連 UC**: UC-004

**ストーリー**:  
As an **エンタープライズユーザー**,  
I want to **GUI で HTTP/HTTPS プロキシを設定し、接続テスト**する,  
So that **社内プロキシ経由で AI API にアクセスできる**.

**受入基準**:

- [ ] 設定画面に「ネットワーク」タブ → 「プロキシ設定」セクション
- [ ] HTTP プロキシ URL 入力欄（例: `http://proxy.company.com:8080`）
- [ ] HTTPS プロキシ URL 入力欄（任意）
- [ ] 認証（ユーザー名・パスワード）入力欄（任意）
- [ ] 「システム設定を検出」ボタン → OS プロキシ設定を自動取得
- [ ] 「接続テスト」ボタン → テスト URL（`https://api.openai.com`）に接続
- [ ] テスト成功: 緑チェックマーク表示
- [ ] テスト失敗: エラーメッセージ表示（原因詳細）

**技術ノート**:

- `src/backend/settings/proxy.ts`: `setProxySettings()`, `getSystemProxySettings()`
- `testProxyConnection()`: `HttpsProxyAgent` 使用
- UI: `NetworkSettings.tsx`

---

### US-012: カスタム証明書設定

**優先度**: Should Have  
**状態**: ✅ Done  
**ペルソナ**: エンタープライズユーザー  
**関連 UC**: UC-004

**ストーリー**:  
As an **エンタープライズユーザー**,  
I want to **カスタム CA 証明書を設定し、社内証明書検証エラーを回避**する,  
So that **自己署名証明書環境でも AI API にアクセスできる**.

**受入基準**:

- [ ] 設定画面「ネットワーク」タブ → 「証明書設定」セクション
- [ ] カスタム CA 証明書パス入力欄（.pem / .crt）
- [ ] 「ファイル選択」ダイアログで証明書ファイル選択
- [ ] 「システム証明書を検出」ボタン → Windows証明書ストアから自動取得
- [ ] 「接続テスト」ボタン → HTTPS 接続検証
- [ ] テスト成功: 証明書が正しく適用されたことを確認

**技術ノート**:

- `src/backend/settings/certificate.ts`: `setCertificateSettings()`, `getSystemCertificateSettings()`
- Windows: `certutil` コマンド経由で証明書取得
- `createFetchWithProxyAndCertificates()` で証明書適用

---

## エピック 5: ユーザビリティ

### US-013: 初回セットアップウィザード

**優先度**: Could Have  
**状態**: 📝 To Do  
**ペルソナ**: ライトユーザー  
**関連 UC**: UC-010

**ストーリー**:  
As a **ライトユーザー**,  
I want to **初回起動時にウィザード形式で AI プロバイダーを設定**する,  
So that **複雑な設定画面を見ずに即座に利用開始できる**.

**受入基準**:

- [ ] 初回起動時（`ai_provider_configurations` が空）、ウィザード画面表示
- [ ] ステップ 1: プロバイダー選択（OpenAI / Anthropic / Google）
- [ ] ステップ 2: API キー入力 + 取得方法のリンク
- [ ] ステップ 3: モデル選択（デフォルト推奨モデルを提示）
- [ ] 「完了」ボタンで設定保存 → チャット画面へ遷移
- [ ] 「スキップ」ボタンで後で設定可能

**技術ノート**:

- UI: `SetupWizard.tsx`, `WizardStep.tsx`
- `settings` テーブル: `setup_completed` フラグ

---

### US-014: 会話履歴検索

**優先度**: Should Have  
**状態**: ✅ Done  
**ペルソナ**: エンタープライズユーザー, パワーユーザー  
**関連 UC**: UC-006

**ストーリー**:  
As a **パワーユーザー**,  
I want to **過去のセッションをキーワード検索**する,  
So that **以前の会話を素早く見つけて再利用できる**.

**受入基準**:

- [ ] セッション一覧画面に検索ボックス存在
- [ ] キーワード入力 → リアルタイム検索（debounce 300ms）
- [ ] `chat_messages.content` を全文検索（SQLite FTS5 想定）
- [ ] 検索結果にセッション名・最終更新日時・一致箇所プレビュー表示
- [ ] 検索結果 0 件時: 「一致するセッションがありません」表示

**技術ノート**:

- `ChatSessionStore.searchSessions(query)`
- SQLite: FTS5 仮想テーブル（将来対応）or `LIKE` クエリ（現状）
- UI: `SessionSearchBar.tsx`

---

### US-015: 会話履歴エクスポート

**優先度**: Could Have  
**状態**: 📝 To Do  
**ペルソナ**: エンタープライズユーザー  
**関連 UC**: UC-006

**ストーリー**:  
As an **エンタープライズユーザー**,  
I want to **セッションを JSON / CSV / Markdown 形式でエクスポート**する,  
So that **監査・アーカイブ・他ツールとの連携ができる**.

**受入基準**:

- [ ] セッション詳細画面に「エクスポート」ボタン
- [ ] フォーマット選択ダイアログ（JSON / CSV / Markdown）
- [ ] ファイル保存ダイアログでユーザーが保存先選択
- [ ] エクスポート完了通知
- [ ] エラー時（権限不足）はエラーメッセージ表示

**技術ノート**:

- Backend: `exportSession(sessionId, format)` API 追加
- Electron: `dialog.showSaveDialog()` でファイル保存
- UI: `ExportDialog.tsx`

---

## エピック 6: 自動更新

### US-016: 自動更新通知・インストール

**優先度**: Should Have  
**状態**: ✅ Done  
**ペルソナ**: 全ペルソナ  
**関連 UC**: UC-011

**ストーリー**:  
As a **ライトユーザー**,  
I want to **アプリ起動時に新バージョンを自動検出し、ワンクリックでインストール**する,  
So that **最新機能・バグ修正を手動ダウンロードせずに適用できる**.

**受入基準**:

- [ ] アプリ起動 3 秒後、バックグラウンドで新バージョン確認
- [ ] 新バージョン検出時、画面右上に通知バナー表示
- [ ] 「ダウンロード」ボタンでバックグラウンドダウンロード開始
- [ ] ダウンロード進捗をプログレスバーで表示
- [ ] ダウンロード完了 → 「今すぐ再起動してインストール」ボタン表示
- [ ] 「再起動」クリック → アプリ終了 → インストーラー起動
- [ ] インストール完了 → 新バージョンで自動起動

**技術ノート**:

- Main: `src/main/updater.ts` (`electron-updater`)
- UI: `UpdateNotification.tsx`, `UpdateProgressBar.tsx`
- イベント: `update-available`, `update-download-progress`, `update-downloaded`

---

## ストーリーポイント・見積もり（参考）

| Story ID | 機能                       | ストーリーポイント | 状態           |
| -------- | -------------------------- | ------------------ | -------------- |
| US-001   | AI プロバイダー設定        | 5                  | ✅ Done        |
| US-002   | AI チャット実行            | 8                  | ✅ Done        |
| US-003   | 複数セッション管理         | 5                  | ✅ Done        |
| US-004   | MCP サーバー登録           | 8                  | ✅ Done        |
| US-005   | MCP ツール自動実行         | 13                 | ✅ Done        |
| US-006   | HITL ツール承認            | 8                  | 🚧 In Progress |
| US-007   | ツール権限ルール管理       | 5                  | ✅ Done        |
| US-008   | トークン使用量監視         | 5                  | ✅ Done        |
| US-009   | 会話自動圧縮               | 8                  | ✅ Done        |
| US-010   | 圧縮設定カスタマイズ       | 3                  | 📝 To Do       |
| US-011   | プロキシ設定               | 5                  | ✅ Done        |
| US-012   | カスタム証明書設定         | 5                  | ✅ Done        |
| US-013   | 初回セットアップウィザード | 5                  | 📝 To Do       |
| US-014   | 会話履歴検索               | 3                  | ✅ Done        |
| US-015   | 会話履歴エクスポート       | 5                  | 📝 To Do       |
| US-016   | 自動更新                   | 5                  | ✅ Done        |

**合計**: 91 ポイント  
**完了**: 71 ポイント（78%）  
**残り**: 20 ポイント（22%）

---

## 次のステップ

本ユーザーストーリーを基に、以下を作成する:

- `requirements/acceptance-criteria.md`: 横断的な受入基準（性能・セキュリティ・エラーハンドリング）
- `requirements/feature-breakdown.md`: ストーリーから実装タスクへの分解
- `requirements/traceability.md`: ストーリー → BC → API → DB テーブルのトレーサビリティ
