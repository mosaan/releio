# DOC_REMAP: チャット系ドキュメントの統一プロセス成果物マッピング

目的: `docs/CHAT_ERROR_HANDLING_DESIGN.md`、`docs/CHAT_SESSION_PERSISTENCE_REQUIREMENTS.md`、`docs/CHAT_SESSION_PERSISTENCE.md` の有効記述を、統一プロセスの成果物（「統一プロセス：02_成果物と責任ワーカー.md」で示される要求/分析/設計/実装/テストの枠）へ再配置する計画を示す。

## ソース別の再配置方針

### 1) docs/CHAT_ERROR_HANDLING_DESIGN.md
- **要求_補足要求の仕様書.md（要求ワークフロー）**  
  - チャット送信失敗時のUX要件を反映（エラー表示、再送ガイダンス、ユーザー入力保全）。  
  - 現行実装の状態を注記: `aiChatError`は文字列のみ、`MessagePrimitive.Error`で短いエラー表示、入力の自動復元やエラー分類は未実装。
- **設計_ユースケース設計.md（設計ワークフロー／UC-01: AIと会話する）**  
  - エラーフローと再送シーケンスを設計レベルで記述（送信→エラーイベント→UI表示→手動再送、入力復元なし）。  
  - 現行UIコンポーネント（assistant-uiの`MessagePrimitive.Error`）とバックエンドイベント（`aiChatError`）の対応を明示。

### 2) docs/CHAT_SESSION_PERSISTENCE_REQUIREMENTS.md
- **要求_補足要求の仕様書.md（要求ワークフロー）**  
  - 永続化の機能要求/NFRを現行実装ベースで整理（セッション/メッセージ/パート/ツール呼び出し/スナップショット保存、libsql+Drizzle、セッション復元）。  
  - 未実装・将来項目は明確に「未対応」として残す（ページング、部分削除、編集など）。
- **設計_設計モデル.md（設計ワークフロー）**  
  - データモデルの要約（`chat_sessions`/`chat_messages`/`message_parts`/`tool_invocations`/`session_snapshots`）と責務分担（`ChatSessionStore`、`Handler`、`AIRuntimeProvider`）を追記。  
  - ランタイム技術をlibsqlクライアント+Drizzleに更新し、ストリーミング時の保存順序（ユーザーメッセージ事前保存、アシスタント完了時保存、ツール結果反映）を記載。
- **設計_ユースケース設計.md（設計ワークフロー／UC-02: セッション管理）**  
  - セッション作成/切替/復元フローと`getLastSessionId`利用、メッセージ読み込み・表示の現行挙動を整理。  
  - エラーパス（セッション未存在時のフォールバック、DBエラー時のResult返却）を追加。

### 3) docs/CHAT_SESSION_PERSISTENCE.md（旧ExecPlan）
- **設計_設計モデル.md（設計ワークフロー）**  
  - 実装済みの意思決定を反映（パート指向スキーマ、ツール呼び出しライフサイクル、セッションスナップショット、`convertMessagesToThreadFormat`による履歴復元）。  
  - Drizzle/libsqlベースのクラス構成（`ChatSessionStore`/`Handler`/`AIRuntimeProvider`）を明文化。
- **テスト_テスト戦略.md（テストワークフロー）**  
  - 最新テスト状況を反映：`tests/backend/ChatSessionStore.test.ts`は合格、圧縮系テスト（CompressionService/integration）はタイムアウトで未グリーン。  
  - 残課題として圧縮ワークフローのテストタイムアウト改善と長尺シナリオの計測を追加。

## メモ
- データ永続化の要件/設計は「要求/設計」成果物に主に写像する。テスト状態は「テスト」成果物で現状を明示。  
- エラーUXは「要求（フィードバック/信頼性）」と「設計（UC-01の例外フロー）」に分けて反映する。  
- 反映後、ソース3文書は削除予定。
