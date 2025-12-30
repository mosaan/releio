# ユースケース一覧

本ドキュメントでは、Releio の主要ユースケースを一覧化し、境界づけられたコンテキスト（Bounded Context）との対応関係を示す。

- **対象読者**: 開発チーム、QA、プロダクトマネージャー
- **目的**: 機能スコープの明確化、テストシナリオ作成の基盤
- **関連**: `requirements/personas.md`, `requirements/user-stories.md`, `architecture/context-map.md`

---

## ユースケース分類

### 優先度定義

- **P0 (Critical)**: MVP必須。これがないとアプリの価値提供不可
- **P1 (High)**: 初期リリースで強く推奨。ユーザー体験の根幹
- **P2 (Medium)**: Phase 2 以降。利便性向上・差別化要素
- **P3 (Low)**: 将来検討。Nice-to-have

### 状態定義

- **✅ Implemented**: 実装済み
- **🚧 In Progress**: 実装中
- **📝 Planned**: 計画済み（未着手）
- **💡 Proposed**: 提案段階（未確定）

---

## UC-001: AI チャット（基本会話）

| 項目                | 内容                                  |
| ------------------- | ------------------------------------- |
| **ID**              | UC-001                                |
| **名称**            | AI チャットによる質問応答・コード生成 |
| **優先度**          | P0 (Critical)                         |
| **状態**            | ✅ Implemented                        |
| **Bounded Context** | AI Chat Management                    |
| **主要ペルソナ**    | 開発者, ライトユーザー                |

### 概要

ユーザーがテキスト入力し、AI プロバイダー（OpenAI / Anthropic / Google）からストリーミング応答を受け取る基本フロー。

### 事前条件

- AI プロバイダー設定完了（API キー、モデル選択）
- セッションが作成済み or 新規セッション自動作成

### 基本フロー

1. ユーザーが入力欄にテキスト入力 → 送信
2. Renderer → Backend: `streamMastraText(sessionId, messages)`
3. Backend: Mastra Agent 経由で AI API 呼び出し（ストリーミング）
4. Backend → Renderer: `mastraChatChunk` イベント（リアルタイム）
5. Renderer: UI に部分テキスト表示
6. Backend: 完了時に `chat_messages` テーブルに保存
7. Renderer: 完了 UI 表示

### 代替フロー

- **A1: ストリーム中断**  
  ユーザーが「停止」ボタン → `abortMastraStream(streamId)` → AbortController でキャンセル

- **A2: API エラー**  
  API キー無効 / レート制限 → エラーイベント送信 → UI にエラートースト表示

### 成果物

- `chat_messages` レコード（role='user', role='assistant', parts=[{kind:'text'}]）
- UI チャット履歴更新

### 関連 BC

- AI Chat Management (コア)
- Settings Management (AI プロバイダー設定)

---

## UC-002: MCP ツール呼び出し（自動実行）

| 項目                | 内容                              |
| ------------------- | --------------------------------- |
| **ID**              | UC-002                            |
| **名称**            | MCP ツールの自動実行（HITL なし） |
| **優先度**          | P1 (High)                         |
| **状態**            | ✅ Implemented                    |
| **Bounded Context** | MCP Integration                   |
| **主要ペルソナ**    | 開発者, パワーユーザー            |

### 概要

AI が応答中にツール呼び出しを指示した場合、権限ルールに基づき自動承認されたツールを実行し、結果を AI に返す。

### 事前条件

- MCP サーバーが登録済み・起動中
- ツールに対する `ToolPermissionRule` が `mode='auto_approve'` で設定済み

### 基本フロー

1. AI 応答中に `tool-call` イベント（ツール名・引数）
2. Backend: `MastraToolService` でツール実行準備
3. `ToolPermissionService.shouldAutoApproveSync()` 評価 → true
4. `MCP Manager.callTool(serverId, toolName, args)` 実行
5. MCP Server: JSON-RPC `tools/call` → 結果返却
6. Backend: `tool-result` イベント送信
7. Renderer: ツール実行ログ UI 表示（折りたたみ可能）
8. AI: ツール結果を使って応答続行

### 代替フロー

- **A1: MCP サーバーエラー**  
  サーバー未起動 / ツール存在しない → エラー結果を AI に返却 → AI がエラーメッセージをユーザーに説明

- **A2: ツールタイムアウト**  
  30秒以内に応答なし → タイムアウトエラー → AI に通知

### 成果物

- `chat_messages` の `parts` に `tool_invocation` + `tool_result` 追加
- UI にツール実行履歴表示（JSON折りたたみ）

### 関連 BC

- MCP Integration (コア)
- AI Chat Management (ツール結果をメッセージに統合)

---

## UC-003: 会話圧縮（自動・手動）

| 項目                | 内容                         |
| ------------------- | ---------------------------- |
| **ID**              | UC-003                       |
| **名称**            | トークン超過時の会話自動圧縮 |
| **優先度**          | P1 (High)                    |
| **状態**            | ✅ Implemented               |
| **Bounded Context** | Conversation Compression     |
| **主要ペルソナ**    | 開発者, パワーユーザー       |

### 概要

長時間会話でトークン数が閾値を超えた際、古いメッセージを要約して `session_snapshots` に保存し、コンテキストサイズを削減する。

### 事前条件

- セッションにメッセージが一定数蓄積
- 圧縮設定（`threshold: 0.95`, `retentionTokens: 2000`）が有効

### 基本フロー

1. Renderer: メッセージ入力前に `getTokenUsage(sessionId, provider, model, input)` 呼び出し
2. Backend: `CompressionService.checkContext()` でトークン計測
3. トークン使用量 > 閾値 → `needsCompression=true` 返却
4. Renderer: 「圧縮を推奨します」通知（自動実行 or ユーザー承認）
5. Backend: `compressConversation()` 実行
   - 古いメッセージを要約（AI API 使用）
   - `session_snapshots` に summary レコード作成
   - `messageCutoffId` 記録
6. Backend: 圧縮結果返却（圧縮率、トークン削減数）
7. Renderer: 「圧縮完了（75% 削減）」通知

### 代替フロー

- **A1: 手動圧縮**  
  ユーザーが設定画面で「今すぐ圧縮」ボタン → `force=true` で実行

- **A2: 圧縮不要**  
  トークン使用量が閾値以下 → `compressed=false` 返却 → 通知なし

### 成果物

- `session_snapshots` レコード（kind='summary', content=要約テキスト）
- 次回の AI 呼び出し時、要約が system メッセージとして挿入

### 関連 BC

- Conversation Compression (コア)
- AI Chat Management (コンテキスト構築時に要約を参照)

---

## UC-004: プロキシ・証明書設定

| 項目                | 内容                                             |
| ------------------- | ------------------------------------------------ |
| **ID**              | UC-004                                           |
| **名称**            | 企業ネットワーク対応（プロキシ・カスタム証明書） |
| **優先度**          | P1 (High)                                        |
| **状態**            | ✅ Implemented                                   |
| **Bounded Context** | Network Configuration                            |
| **主要ペルソナ**    | エンタープライズユーザー                         |

### 概要

企業プロキシ・カスタム SSL 証明書を設定し、AI API 接続を可能にする。

### 事前条件

- ユーザーがプロキシ URL・認証情報・証明書パスを知っている

### 基本フロー

1. 設定画面 → ネットワークタブ
2. プロキシ設定:
   - HTTP/HTTPS プロキシ URL 入力
   - 認証（ユーザー名・パスワード）入力（任意）
   - システム設定検出ボタン → OS プロキシ設定を自動取得
3. 証明書設定:
   - カスタム CA 証明書パス指定（.pem / .crt）
   - システム証明書検出ボタン → Windows証明書ストアから自動取得
4. 「接続テスト」ボタン → Backend: `testCombinedConnection()`
5. テスト成功 → 緑チェックマーク表示
6. 「保存」ボタン → `settings` テーブルに保存
7. 以降の AI API 呼び出しで自動適用

### 代替フロー

- **A1: 接続テスト失敗**  
  プロキシ認証エラー → エラーメッセージ表示「プロキシ認証に失敗しました。ユーザー名・パスワードを確認してください」

- **A2: 証明書検証失敗**  
  証明書パス不正 → エラーメッセージ「証明書ファイルが見つかりません」

### 成果物

- `settings` テーブル: `proxy_settings`, `certificate_settings` レコード
- AI API fetch 時に `createFetchWithProxyAndCertificates()` 適用

### 関連 BC

- Network Configuration (コア)
- Settings Management (設定保存)

---

## UC-005: HITL ツール承認フロー

| 項目                | 内容                             |
| ------------------- | -------------------------------- |
| **ID**              | UC-005                           |
| **名称**            | Human-in-the-Loop ツール実行承認 |
| **優先度**          | P2 (Medium)                      |
| **状態**            | 🚧 In Progress (Phase 3.2)       |
| **Bounded Context** | MCP Integration                  |
| **主要ペルソナ**    | エンタープライズユーザー, 開発者 |

### 概要

AI がツールを実行しようとした際、事前設定した権限ルールに基づき、ユーザーに承認ダイアログを表示する。

### 事前条件

- MCP サーバーが登録済み
- ツール権限ルールで `mode='require_approval'` が設定済み

### 基本フロー

1. AI 応答中に `tool-call` イベント
2. Backend: `ToolPermissionService.shouldAutoApproveSync()` → false
3. Backend → Renderer: `toolApprovalRequest` イベント（ツール名・引数・説明）
4. Renderer: モーダルダイアログ表示
   - ツール名: `filesystem_read`
   - 引数: `{path: "/etc/passwd"}`
   - 「承認」「拒否」「今後このツールは自動承認」
5. ユーザー: 「拒否」クリック
6. Renderer → Backend: `declineToolCall(runId, toolCallId, reason)`
7. Backend: Mastra に拒否通知 → AI がエラーメッセージを生成
8. Renderer: AI 応答「ツール実行が拒否されました。別の方法を試します」

### 代替フロー

- **A1: ユーザー承認**  
  「承認」クリック → `approveToolCall()` → ツール実行続行

- **A2: 自動承認ルール追加**  
  「今後このツールは自動承認」選択 → `createToolPermissionRule(mode='auto_approve')` → 次回から自動実行

### 成果物

- `tool_permission_rules` レコード（ユーザーが「今後自動承認」選択時）
- ツール実行ログ（承認/拒否履歴）

### 関連 BC

- MCP Integration (コア)
- Settings Management (権限ルール保存)

---

## UC-006: 会話履歴の検索・エクスポート

| 項目                | 内容                                             |
| ------------------- | ------------------------------------------------ |
| **ID**              | UC-006                                           |
| **名称**            | 過去の会話を全文検索・エクスポート               |
| **優先度**          | P2 (Medium)                                      |
| **状態**            | ✅ Implemented (検索), 📝 Planned (エクスポート) |
| **Bounded Context** | AI Chat Management                               |
| **主要ペルソナ**    | エンタープライズユーザー, パワーユーザー         |

### 概要

ユーザーが過去のセッションをキーワード検索し、監査用に会話履歴を JSON / CSV でエクスポートする。

### 事前条件

- 複数のセッションが保存済み

### 基本フロー（検索）

1. セッション一覧画面 → 検索ボックスに「Electron IPC」入力
2. Backend: `searchChatSessions(query)` 呼び出し
3. SQLite: `chat_messages.content` を全文検索（FTS5 インデックス利用想定）
4. 一致したセッションリスト返却
5. Renderer: 検索結果表示（セッション名・最終更新日時）

### 基本フロー（エクスポート）

1. セッション詳細画面 → 「エクスポート」ボタン
2. フォーマット選択ダイアログ（JSON / CSV / Markdown）
3. Backend: セッション全メッセージ取得 + フォーマット変換
4. ファイル保存ダイアログ → ユーザーが保存先選択
5. エクスポート完了通知

### 代替フロー

- **A1: 検索結果 0 件**  
  「一致するセッションがありません」表示

- **A2: エクスポート失敗**  
  ファイル書き込み権限なし → エラー通知

### 成果物

- 検索結果セッションリスト
- エクスポートファイル（`session_2025-01-15.json`）

### 関連 BC

- AI Chat Management (コア)

---

## UC-007: 複数 AI プロバイダー管理

| 項目                | 内容                                         |
| ------------------- | -------------------------------------------- |
| **ID**              | UC-007                                       |
| **名称**            | 複数 AI プロバイダー・モデルの登録・切り替え |
| **優先度**          | P0 (Critical)                                |
| **状態**            | ✅ Implemented                               |
| **Bounded Context** | Settings Management                          |
| **主要ペルソナ**    | パワーユーザー, 開発者                       |

### 概要

OpenAI / Anthropic / Google / Azure を同時登録し、チャット画面でプロバイダー・モデルを切り替える。

### 事前条件

- なし（初回起動時に設定可能）

### 基本フロー

1. 設定画面 → AI プロバイダータブ
2. 「新規プロバイダー追加」ボタン
3. プロバイダー選択（OpenAI / Anthropic / Google / Azure）
4. API キー入力、Base URL（任意）、モデル一覧取得
5. 「モデル一覧を取得」ボタン → API 経由でモデルリスト取得
6. 利用可能モデルをチェックボックスで選択
7. 「保存」→ `ai_provider_configurations` + `ai_model_definitions` 保存
8. チャット画面: プロバイダー・モデル選択ドロップダウンに反映

### 代替フロー

- **A1: API キー無効**  
  モデル一覧取得失敗 → エラー表示「API キーが無効です」

- **A2: Azure 固有設定**  
  Azure の場合、Deployment Name, API Version 入力欄表示

### 成果物

- `ai_provider_configurations` レコード（複数プロバイダー保存可能）
- `ai_model_definitions` レコード（プロバイダーごとのモデル）

### 関連 BC

- Settings Management (コア)
- AI Chat Management (選択されたプロバイダー・モデルで AI 呼び出し)

---

## UC-008: MCP サーバー登録・監視

| 項目                | 内容                                    |
| ------------------- | --------------------------------------- |
| **ID**              | UC-008                                  |
| **名称**            | MCP サーバーの GUI 登録・ステータス監視 |
| **優先度**          | P1 (High)                               |
| **状態**            | ✅ Implemented                          |
| **Bounded Context** | MCP Integration                         |
| **主要ペルソナ**    | パワーユーザー, 開発者                  |

### 概要

GUI で MCP サーバーを登録し、起動状態・stderr ログをリアルタイム監視する。

### 事前条件

- なし（初回起動時に設定可能）

### 基本フロー

1. 設定画面 → MCP サーバータブ
2. 「新規サーバー追加」ボタン
3. 設定入力:
   - サーバー名（例: `mcp-filesystem`）
   - コマンド（例: `npx`）
   - 引数（例: `["-y", "@modelcontextprotocol/server-filesystem", "/Users/user/projects"]`）
   - 環境変数（任意、JSON形式）
4. 「保存」→ `mcp_servers` テーブルに保存
5. Backend: MCP Manager がサーバー起動（stdio）
6. ステータス表示:
   - 🟢 Running (PID表示)
   - 🔴 Stopped (stderr 最終エラー表示)
7. ツール一覧・リソース一覧タブで利用可能な機能確認

### 代替フロー

- **A1: サーバー起動失敗**  
  コマンドが存在しない / 引数不正 → stderr ログ表示 → ユーザーが修正

- **A2: サーバークラッシュ**  
  実行中に異常終了 → ステータスが「Stopped」に変化 → stderr ログで原因確認

### 成果物

- `mcp_servers` レコード
- MCP Manager の内部プロセスマップ（stdio 接続）
- UI にツール・リソース・プロンプト一覧表示

### 関連 BC

- MCP Integration (コア)
- Settings Management (サーバー設定保存)

---

## UC-009: トークン使用量監視・圧縮設定

| 項目                | 内容                                                 |
| ------------------- | ---------------------------------------------------- |
| **ID**              | UC-009                                               |
| **名称**            | トークン使用量のリアルタイム監視・圧縮パラメータ調整 |
| **優先度**          | P2 (Medium)                                          |
| **状態**            | ✅ Implemented (監視), 📝 Planned (UI改善)           |
| **Bounded Context** | Conversation Compression                             |
| **主要ペルソナ**    | パワーユーザー, 開発者                               |

### 概要

チャット画面でトークン使用量をプログレスバー表示し、圧縮設定（閾値・保持メッセージ数）をスライダーで調整する。

### 事前条件

- セッションが存在し、メッセージが蓄積

### 基本フロー

1. チャット画面: 入力欄上部にトークンメーター表示
   - 現在: 12,500 / 16,000 (78%)
   - プログレスバー色: 緑（<70%）、黄（70-90%）、赤（>90%）
2. ユーザーが「詳細」クリック → トークン内訳表示:
   - システムメッセージ: 500
   - 要約: 2,000
   - 通常メッセージ: 8,000
   - ツール定義: 2,000
3. 圧縮設定ボタン → モーダル表示:
   - 閾値: 95% （スライダー 70% - 100%）
   - 保持トークン数: 2000 （スライダー 500 - 5000）
   - 自動圧縮: ON/OFF トグル
4. 設定変更 → 即座に反映（次回トークン計測時に適用）

### 代替フロー

- **A1: 閾値超過通知**  
  トークン使用量が閾値を超えた瞬間、トースト通知「圧縮を推奨します」 → ユーザーが「今すぐ圧縮」クリック

### 成果物

- UI トークンメーター更新
- `settings` テーブル: 圧縮設定レコード（セッションごと or グローバル）

### 関連 BC

- Conversation Compression (コア)
- AI Chat Management (トークン計測)

---

## UC-010: 初回セットアップウィザード

| 項目                | 内容                                   |
| ------------------- | -------------------------------------- |
| **ID**              | UC-010                                 |
| **名称**            | 初回起動時の AI プロバイダー設定ガイド |
| **優先度**          | P2 (Medium)                            |
| **状態**            | 📝 Planned                             |
| **Bounded Context** | Settings Management                    |
| **主要ペルソナ**    | ライトユーザー, 開発者                 |

### 概要

初回起動時、ウィザード形式で AI プロバイダーを設定し、即座に利用開始できるようにする。

### 事前条件

- アプリ初回起動（`ai_provider_configurations` が空）

### 基本フロー

1. アプリ起動 → ウィザード画面表示
2. ステップ 1: プロバイダー選択
   - OpenAI / Anthropic / Google から選択（ロゴ付きカード UI）
3. ステップ 2: API キー入力
   - API キー取得方法のリンク表示
   - 入力欄にペースト
4. ステップ 3: モデル選択（自動取得）
   - デフォルトモデルを推奨（例: GPT-4o）
   - 「詳細設定」で Base URL 変更可能
5. 「完了」→ 設定保存 → チャット画面へ遷移

### 代替フロー

- **A1: スキップ**  
  「後で設定する」ボタン → 設定画面へのショートカット表示

- **A2: API キー検証失敗**  
  ステップ 2 で「次へ」→ バックエンドで検証 → エラー表示「API キーが無効です」

### 成果物

- `ai_provider_configurations` 初期レコード
- ウィザード完了フラグ（`settings` テーブル）

### 関連 BC

- Settings Management (コア)

---

## UC-011: 自動更新

| 項目                | 内容                                           |
| ------------------- | ---------------------------------------------- |
| **ID**              | UC-011                                         |
| **名称**            | アプリケーションの自動更新（electron-updater） |
| **優先度**          | P1 (High)                                      |
| **状態**            | ✅ Implemented                                 |
| **Bounded Context** | Settings Management                            |
| **主要ペルソナ**    | 全ペルソナ                                     |

### 概要

GitHub Releases から最新版を自動検出し、バックグラウンドでダウンロード・インストールする。

### 事前条件

- `UpdaterConfig.enabled = true`（デフォルト有効）
- インターネット接続

### 基本フロー

1. アプリ起動 3 秒後、バックグラウンドで `checkForUpdates()`
2. 新バージョン検出 → Renderer に通知
3. UI: 画面右上に「アップデート v1.2.0 が利用可能です」バナー表示
4. ユーザー: 「ダウンロード」クリック
5. Backend: `downloadUpdate()` 実行（バックグラウンド）
6. ダウンロード進捗をプログレスバーで表示
7. ダウンロード完了 → 「今すぐ再起動してインストール」ボタン表示
8. ユーザー: 「再起動」クリック
9. Main: `quitAndInstall()` → アプリ終了 → インストーラー起動
10. インストール完了 → 新バージョンで再起動

### 代替フロー

- **A1: 新バージョンなし**  
  起動時チェックで最新版と判定 → 通知なし

- **A2: ダウンロード失敗**  
  ネットワークエラー → エラー通知「アップデートのダウンロードに失敗しました」

- **A3: ユーザーが後で実行**  
  「後で」ボタン → バナー非表示、設定画面に「アップデート保留中」表示

### 成果物

- 新バージョンのアプリケーション（インストール済み）
- ログ: `app.log` に更新履歴記録

### 関連 BC

- Settings Management (更新設定)
- Main Process (electron-updater 統合)

---

## ユースケース × Bounded Context マッピング

| UC ID  | ユースケース名             | 主要 BC                  | 関連 BC             |
| ------ | -------------------------- | ------------------------ | ------------------- |
| UC-001 | AI チャット                | AI Chat Management       | Settings Management |
| UC-002 | MCP ツール呼び出し         | MCP Integration          | AI Chat Management  |
| UC-003 | 会話圧縮                   | Conversation Compression | AI Chat Management  |
| UC-004 | プロキシ・証明書設定       | Network Configuration    | Settings Management |
| UC-005 | HITL ツール承認            | MCP Integration          | Settings Management |
| UC-006 | 会話履歴検索・エクスポート | AI Chat Management       | -                   |
| UC-007 | AI プロバイダー管理        | Settings Management      | AI Chat Management  |
| UC-008 | MCP サーバー登録・監視     | MCP Integration          | Settings Management |
| UC-009 | トークン監視・圧縮設定     | Conversation Compression | AI Chat Management  |
| UC-010 | 初回セットアップ           | Settings Management      | -                   |
| UC-011 | 自動更新                   | Settings Management      | Main Process        |

---

## 次のステップ

本ユースケース一覧を基に、以下を作成する:

- `requirements/user-stories.md`: 各ユースケースをユーザーストーリー形式で詳細化
- `requirements/acceptance-criteria.md`: ユースケースごとの受入基準
- `requirements/feature-breakdown.md`: 機能分解と実装タスク
- `requirements/traceability.md`: 要求 → BC → API → DB のトレーサビリティマトリックス
