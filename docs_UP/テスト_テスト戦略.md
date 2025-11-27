# テスト戦略（方向づけフェーズ・現状整理）

反復1におけるテストワークフローの現状を、実装済みのテスト資産に基づいて整理します。ここで示す方針と課題を次反復（推敲フェーズ）での改善計画の起点とします。

## 目的と前提
- 現行のテストスコープ・環境・既知の課題を可視化し、優先すべき改善点を共有する。
- 方向づけフェーズのため、詳細なテストケース設計や自動化網羅は行わず、ベースラインの整備状況を記録する。
- 参照元: `package.json` のテストスクリプト、`vitest.config.backend.ts`, `vitest.config.renderer.ts`, `tests/backend/*`, `tests/renderer/*`, `tests/setup*.ts`。

## 現行スコープとカバレッジ

### Backend（Vitest / Electron Nodeランナー）
- 主な対象モジュール: AI設定 (`ai-settings-v3.test.ts`)、セッション永続化 (`ChatSessionStore.test.ts`/`database.test.ts`)、MCP管理 (`mcp-manager.test.ts`)、ユーティリティ (`utils.test.ts`)。
- AI設定テストはv1→v2移行・CRUD・カスタムモデル追加/削除を検証するのみで、モデルAPI更新の挙動（空レスポンス保持を含む）や設定/チャットUI・E2Eは未カバー。
- プロキシ/証明書/カスタムfetch (`proxy.test.ts`, `certificate.test.ts`, `fetch.test.ts`) は現行グリーン。`ChatSessionStore.test.ts`/`ChatSessionStore.extensions.test.ts`も通過（libsqlファイルDBをテストヘルパーで生成）。
- 圧縮系の長尺シナリオ（`CompressionService.test.ts`の一部、`compression/__tests__/integration.test.ts`）は現状10sタイムアウトで失敗。フルワークフロー/パフォーマンステストがボトルネック。
- DBはlibsqlクライアントを実ファイルで使用（`tests/backend/database-helper.ts`）。`tests/setup.ts` で `MAIN_VITE_USER_DATA_PATH` を `tests/tmp` 配下へ強制設定。

### Renderer（Vitest + happy-dom）
- 対象: セッション管理コンテキスト (`SessionManager.test.tsx`)。バックエンドIPCは `tests/setup-renderer.ts` の `window.backend` モックで置き換え。
- UIコンポーネント（SessionList, ChatPanel, AIストリーミング表示など）のテストは未実装。モックロガーで`electron-log/renderer`依存を回避。

### 共同スコープ
- E2E/結合テスト、アップデートフロー、MCP子プロセスの実行パスは未カバー。圧縮/要約の閾値動作も自動テストなし。

## テスト環境とセットアップ
- **ランナー**: Vitest。Backendは `cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run --config vitest.config.backend.ts` を利用し、ネイティブ依存を考慮して `pool: 'forks'` を設定。
- **環境変数**: `tests/setup.ts` により `MAIN_VITE_USER_DATA_PATH` をテスト専用パスに設定（DB/ログのパス解決用）。`.env` の読み込みも実施。
- **モック**: Rendererは `window.backend`/`connectBackend` を全面モックし、`electron-log/renderer` をスタブ化。Backend側は重要依存のモックは各テストファイル内で個別に設定。
- **依存パッケージ**: Rendererテストには `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `happy-dom` が必要（`package.json` に開発依存として追加済み）。

## 実行手順（現状）
- Backend: `pnpm run test:backend` は圧縮統合テストのタイムアウト（4件）で失敗する。安定系のみ実行する場合は対象ファイルを指定する:  
  `pnpm run test:backend -- tests/backend/ChatSessionStore.test.ts tests/backend/database.test.ts tests/backend/ai-settings-v3.test.ts tests/backend/proxy.test.ts tests/backend/certificate.test.ts tests/backend/fetch.test.ts tests/backend/mcp-manager.test.ts src/backend/compression/__tests__/TokenCounter.test.ts src/backend/compression/__tests__/SummarizationService.test.ts src/backend/compression/__tests__/ChatSessionStore.extensions.test.ts src/backend/compression/__tests__/ModelConfigService.test.ts`  
  （`CompressionService.test.ts`と`compression/__tests__/integration.test.ts`は現状タイムアウト）
- Renderer: `pnpm run test:renderer`（watch/UIオプションは`test:renderer:watch`/`test:renderer:ui`）。happy-dom環境でヘッドレス実行。

## 既知の課題とリスク
- **圧縮テストのタイムアウト**: フル圧縮ワークフロー/多段圧縮/性能シナリオが10sでtimeoutし、VitestのRPCもタイムアウト警告を出す。シナリオ短縮、テスト専用モデル/モック化、タイムアウト延長のいずれかが必要。
- **DB密結合テスト**: Backendテストの多くが実DBファイルを前提としており、ユニットテストとインテグレーションテストの境界が不明瞭。並列実行時の競合リスクあり。
- **Rendererカバレッジ不足**: UI/ストリーミング表示、エラーハンドリング、設定フォームなど主要UIが未テスト。メッセージポート断など重要な例外パスの確認がない。
- **E2E欠如**: 3プロセス統合（Main/Backend/Renderer）、MCP子プロセス実行、アップデートフローを通した動作確認が自動化されていない。

## 次反復（推敲フェーズ）の改善アイテム（優先度順）
1. **Backendインフラのテスタビリティ向上**: ロガー初期化の遅延化、DB接続の注入化で`proxy/cert/fetch`テストをグリーンにする。テスト専用ブートストラップの導入を検討。
2. **Rendererユースケースカバレッジ拡大**: SessionList/ChatPanel/AIストリーミング表示のハッピーパスとエラーパスをTesting Libraryで追加。モックIPCのシナリオ強化。
3. **統合テストの足場作り**: MCP子プロセスのモック／実プロセス起動を含む結合テストのスモークを追加し、MessagePort再配布やAbortフローを確認。
4. **データ分離と固定化**: テストデータのフィクスチャ化と一時DBの自動クリーンアップを標準化し、並列実行でも安全な形に整備。
5. **計測とゲート**: カバレッジ収集の有効化と、CIでの最小ゲートライン設定（例: 主要モジュールで行数/ブランチカバレッジ30%を暫定目標）を検討。

## 運用メモ
- ローカルでのデバッグ実行時にパス関連のエラーが出た場合、`MAIN_VITE_USER_DATA_PATH` が想定パスにあるかを確認すること。
- MCP関連のテストを追加する際は、`utilityProcess`との整合を取るため、プロセス起動をモックするか、テスト専用のスタブサーバーを用意すること。
