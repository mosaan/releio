# MastraベースUC1 MVP ExecPlan

本ドキュメントは .agent/PLANS.md に従い、Releio v2方向づけフェーズの「UC1: 基本的なAI会話」をMastraベースで成立させるための実行計画を示す。進捗に応じて常に更新し、単体で新人が追従できる完全自給の手順書として維持する。

## Purpose / Big Picture

Mastraを用いた最小限の会話MVPを3プロセス構成上で動かし、v1カスタム実装からの置き換え可能性を実証する。Rendererから新設するMastra経路でメッセージを送信し、BackendがMastraを用いてストリーミング応答を返し、UI上で確認できる状態を到達点とする。

## Progress

- [x] (2025-11-27 23:05+09:00) リポジトリ構成と企画書（docs_v2/開発企画書.md）を確認し、UC1が最優先であることを把握。
- [ ] 要求・分析・設計ドキュメントの初版をdocs_v2に作成。
- [ ] Mastra技術調査（パッケージAPIの確認・必要依存の特定）。
- [ ] MastraベースのBackendチャネル新設とRenderer連携の実装。
- [ ] 動作確認（手動チャット送受信・typecheck）と計画の更新。

## Surprises & Discoveries

- 未記載。

## Decision Log

- 未記載。

## Outcomes & Retrospective

- 未記載。

## Context and Orientation

現行はai SDK v5ベースのカスタムstreamingをBackend（src/backend/ai/stream.ts）で実装し、Handler経由でRendererにイベントを送っている。RendererはThread/AIRuntimeProvider経由でwindow.backend.streamAITextを呼び、SessionManagerがDB（Drizzle）上のセッションを扱う。Mastra依存は未導入。docs_v2には企画書のみ。Unified Process系の成果物はdocs_UP配下に参考例がある。三プロセス接続はsrc/backend/server.tsでHandlerメソッドを公開する設計。

## Plan of Work

1. 要求・分析・設計ドキュメント整備  
   docs_v2にUC1向けの要求定義書、分析メモ（ドメイン/ユースケース実現）、設計方針（Mastra適用アーキテクチャ・API/I/F）を順次作成し、更新ごとにコミット。既存docs_UPを参照しつつ、本案件に必要な最小セットに絞る。
2. Mastra API調査と依存追加  
   npmパッケージ（例: mastra、@mastra/core系）の型定義を確認し、UC1に必要なエンティティ（memory/threads、chat推論）を特定。package.jsonへ追記し、pnpmでインストール。
3. BackendのMastra経路新設  
   src/backend/mastra/配下にサービスを追加し、Mastraのclient初期化、スレッド/リソース管理（MVPは最低限の永続化方針、必要なら一時ファイル/DBを利用）とストリーミング応答を実装。Handlerとcommon/typesに新メソッド/イベントを追加し、Connection経由でrendererへchunk/end/errorを発火する。
4. Renderer側のMVP UI追加  
   既存チャットは維持したまま、Mastra経路専用の簡易UI（新規ページまたはタブ）を追加。入力→送信→ストリーム表示ができるようにし、最低限のセッションID表示/再開をサポート。window.backendの新メソッドを呼び出す薄いクライアントを用意。
5. 動作確認とドキュメント更新  
   typecheck（node/webいずれか、時間優先でnodeを先行）と手動チャットの送受信を確認。ExecPlanのProgress/Decision/Surprisesを更新し、完了時点で振り返りを記載。

## Concrete Steps

- docs_v2に以下を作成: 要求定義（UC1範囲と成功条件）、分析ノート（メッセージフローとデータ）、設計指針（Mastra導入ポイント、API設計、イベントチャネル、永続化方針）。コミット単位は更新ごと。
- `pnpm add mastra`（必要に応じて関連パッケージを追加）。package.json/lockを更新。
- Backend: `src/backend/mastra/`に設定/サービス/mapperを追加。Handlerに`startMastraSession`, `sendMastraMessage`（ストリーム開始）, `abortMastraSession`などを追加し、Eventチャネル`mastraChatChunk/End/Error`をpublish。`src/common/types.ts`でAPIとイベントを定義。`src/backend/server.ts`はhandler経由で自動公開されるためメソッド追加のみでOK。
- Renderer: window.backend型定義更新後、`src/renderer/src/lib/mastra-client.ts`を作り、専用UIコンポーネント（例: `components/MastraMvpChat.tsx`）を追加。ホーム/チャットページに遷移導線を用意。
- 検証: `pnpm run typecheck:node`（可能なら`typecheck:web`も）を実行し、Mastraチャット画面でメッセージ送信→ストリーミング応答がUIに表示されることを手動確認。

## Validation and Acceptance

- コマンド: `pnpm run typecheck:node`が成功すること（失敗時は修正して再実行）。時間許せば`pnpm run typecheck:web`も成功。
- 手動確認: アプリ起動（開発モード）またはUIコンポーネントのストーリーレベルで、Mastraチャット導線からユーザー発話を送信し、ストリーミングで応答テキストが逐次表示され、完了・エラーイベントが発火することを確認する。
- API受入: Renderer側が新規BackendメソッドでセッションIDを受け取り、Abort時は中断イベントが返ること。既存チャット経路に副作用がないこと。

## Idempotence and Recovery

- pnpmインストールは再実行可。Mastra初期化が失敗した場合はログを確認し、環境変数(APIキー)をセットして再起動する。新イベントは既存チャネルと別管理とし、衝突時はプレフィックスを確認して修正可能。

## Artifacts and Notes

- 主要成果物: docs_v2/配下の要求/分析/設計ドキュメント、ExecPlan最新版、Mastraサービス実装ファイル、Renderer UI追加ファイル。
- ログ: Backend loggerでMastra初期化とストリーム状態をINFOで記録し、エラー時はメッセージを記載する。

## Interfaces and Dependencies

- 依存: npmパッケージ`mastra`（および必要なサブパッケージ）。既存の`ai`や`@ai-sdk/*`は温存。
- Backend API（新規追加予定）: `startMastraSession(resourceId?: string) -> Result<{ sessionId: string }>`、`streamMastraText(sessionId: string, messages: AIMessage[]) -> Result<string>`（戻りは内部streamId）、`abortMastraStream(streamId: string)`など。イベントチャネル`mastraChatChunk|End|Error|Aborted`でpayloadに`{ sessionId, streamId, chunk? }`を載せる。
- Renderer: 上記APIをwindow.backendに追加し、libクライアントがAbort/再開を扱う。UIは受信chunkを逐次描画するだけの最小構成とする。
