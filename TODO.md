# TODO: AIエージェント対応の改善項目

本プロジェクトで追加すべき、AIエージェントにとって有益な開発環境構築に関する項目をまとめています。

参考: `D:\Dev\ai-friendly-electron-dev\docs\03_unified_architecture.md`

---

## 優先度: 高 🔴

### 1. 統合ロギングシステムの改善

**現状**: electron-logを使用しているが、JSON Lines形式での出力は未実装

**追加すべき内容**:
- [ ] JSON Lines形式でのログ出力（機械可読性の向上）
- [ ] 構造化されたログフォーマット（timestamp, level, processType, message, error）
- [ ] 未処理エラーの統合ログへの出力（uncaughtException, unhandledRejection）
- [ ] Renderer Processのエラーハンドラー統合

**参考**: `D:\Dev\ai-friendly-electron-dev\docs\04_ai_agent_information_access.md` セクション1

**実装箇所**:
- `src/main/logger.ts`
- `src/backend/logger.ts`
- `src/renderer/src/lib/logger.ts`

---

### 2. electron-trpcによる型安全なIPC通信

**現状**: contextBridge + electronAPIのみを使用

**追加すべき内容**:
- [ ] electron-trpcの導入
- [ ] Main Process側のtRPCルーター定義
- [ ] Renderer Process側のtRPCクライアント設定
- [ ] Zodスキーマによる入力バリデーション
- [ ] JSDocコメントによる詳細なAPI仕様の記述
- [ ] 既存のIPC通信をtRPCに移行

**参考**: `D:\Dev\ai-friendly-electron-dev\docs\03_unified_architecture.md` セクション3

**メリット**:
- 完全な型安全性（Renderer ⇔ Main Process間）
- AIエージェントが型定義からAPI仕様を自動推論可能
- 自己文書化されたAPI

**実装箇所**:
- `src/main/trpc/` (新規)
- `src/preload/index.ts`
- `src/renderer/src/trpc.ts` (新規)

---

### 3. electron-mcp-serverの統合

**現状**: MCPサーバは使っているが、electron-mcp-serverは未使用

**追加すべき内容**:
- [ ] electron-mcp-serverのセットアップ
- [ ] React DevToolsの統合
- [ ] 開発環境での状態公開（`window.__APP_STORES__`、`window.__GET_APP_STATE__`）
- [ ] グローバル型定義の追加（`src/global.d.ts`）
- [ ] デバッグヘルパー関数の実装

**参考**: `D:\Dev\ai-friendly-electron-dev\docs\04_ai_agent_information_access.md` セクション2

**メリット**:
- Renderer Processの内部状態への直接アクセス
- DOM構造、React状態、Zustand storeの取得
- リアルタイムなデバッグ情報の取得

**実装箇所**:
- `.claude/mcp.json` (MCP設定)
- `src/main/index.ts` (React DevTools)
- `src/renderer/src/debug/` (新規)
- `src/global.d.ts` (新規)

---

### 4. PlaywrightによるE2Eテスト

**現状**: backendのみVitestでテスト

**追加すべき内容**:
- [ ] Playwrightのインストールと設定
- [ ] playwright.config.tsの作成
- [ ] JSON形式のテスト結果出力設定
- [ ] スクリーンショット、ビデオの保存設定
- [ ] サンプルE2Eテストの実装

**参考**: `D:\Dev\ai-friendly-electron-dev\docs\03_unified_architecture.md` セクション5

**実装箇所**:
- `playwright.config.ts` (新規)
- `tests/e2e/` (新規)
- `test-results/` (出力先)

---

## 優先度: 中 🟡

### 5. Zustand + Redux DevToolsミドルウェア

**現状**: 状態管理ライブラリは使用していない（要確認）

**追加すべき内容**:
- [ ] Zustandのインストール
- [ ] Redux DevToolsミドルウェアの設定
- [ ] 開発環境でのストア公開（`window.__ZUSTAND_STORES__`）
- [ ] 既存のReactローカルステートをZustandに移行（必要に応じて）

**参考**: `D:\Dev\ai-friendly-electron-dev\docs\03_unified_architecture.md` セクション2

**メリット**:
- MCPサーバ経由で状態を取得可能
- Redux DevToolsで状態変更を可視化
- シンプルなAPI

**実装箇所**:
- `src/renderer/src/stores/` (新規)

---

### 6. テスト結果のJSON出力

**現状**: Vitestは使っているが、JSON出力は未確認

**追加すべき内容**:
- [ ] Vitestの設定でJSON reporterを追加
- [ ] テスト結果の出力先設定（`test-results/vitest-results.json`）
- [ ] カバレッジ情報のJSON出力設定

**参考**: `D:\Dev\ai-friendly-electron-dev\docs\04_ai_agent_information_access.md` セクション4

**実装箇所**:
- `vitest.config.backend.ts`

**設定例**:
```typescript
export default defineConfig({
  test: {
    reporters: ['verbose', 'json'],
    outputFile: {
      json: './test-results/vitest-results.json',
    },
    coverage: {
      reporter: ['json', 'lcov', 'text'],
    },
  },
});
```

---

### 7. パフォーマンスメトリクスの収集

**現状**: 未実装

**追加すべき内容**:
- [ ] パフォーマンス監視クラスの実装
- [ ] Main/Renderer ProcessのCPU・メモリ使用量の定期収集
- [ ] JSON Lines形式での出力（`logs/performance.jsonl`）
- [ ] 高負荷時の警告ログ出力

**参考**: `D:\Dev\ai-friendly-electron-dev\docs\04_ai_agent_information_access.md` セクション6

**メリット**:
- パフォーマンスボトルネックの特定
- メモリリークの検出
- 時系列データの分析

**実装箇所**:
- `src/main/monitoring/performanceMonitor.ts` (新規)
- `src/main/index.ts` (起動時に開始)

---

## 優先度: 低 🟢

### 8. TypeDocによるドキュメント自動生成

**現状**: 未実装

**追加すべき内容**:
- [ ] TypeDocのインストールと設定
- [ ] typedoc.jsonの作成
- [ ] 自動生成スクリプトの追加（`pnpm run docs:generate`）
- [ ] JSDocコメントの追加（特にIPC API、主要な関数）
- [ ] IPC API一覧のJSON出力スクリプト

**参考**: `D:\Dev\ai-friendly-electron-dev\docs\03_unified_architecture.md` セクション8

**実装箇所**:
- `typedoc.json` (新規)
- `package.json` (scripts追加)
- `docs/api/` (生成先)

---

### 9. 静的解析結果のファイル出力

**現状**: typecheck、lintは実行しているが、ファイル出力は未確認

**追加すべき内容**:
- [ ] TypeScript型チェック結果をファイルに出力（`typecheck.log`）
- [ ] ESLint結果をJSON形式で出力（`eslint-results.json`）
- [ ] `--pretty false` オプションでANSIカラーコードを除去
- [ ] package.jsonスクリプトの更新

**参考**: `D:\Dev\ai-friendly-electron-dev\docs\04_ai_agent_information_access.md` セクション5

**実装箇所**:
- `package.json` (scripts更新)

**コマンド例**:
```json
{
  "scripts": {
    "typecheck": "tsc --noEmit --pretty false > typecheck.log 2>&1 || true",
    "lint": "eslint src --ext .ts,.tsx --format json --output-file eslint-results.json"
  }
}
```

---

### 10. ビルドエラーの構造化

**現状**: 未確認

**追加すべき内容**:
- [ ] ビルドエラーをファイルに保存（`build-errors.log`）
- [ ] 開発サーバーのエラーをファイルに保存（`dev-errors.log`）

**参考**: `D:\Dev\ai-friendly-electron-dev\docs\04_ai_agent_information_access.md` セクション3

**実装箇所**:
- `package.json` (scripts更新)

---

### 11. 情報アクセス方法のドキュメント化

**現状**: CLAUDE.mdには一部記載あり

**追加すべき内容**:
- [ ] README.mdにAIエージェント向けの情報アクセスセクションを追加
- [ ] ログファイル、テスト結果、ドキュメントの場所を明記
- [ ] ファイルパスの一貫性を保つ

**参考**: `D:\Dev\ai-friendly-electron-dev\docs\04_ai_agent_information_access.md` セクション「情報アクセスのベストプラクティス」

**実装箇所**:
- `README.md`
- `CLAUDE.md`

**推奨構造**:
```
<project-root>/
├── logs/
│   ├── app.log              # 統合ログ
│   ├── errors.jsonl         # エラーログ（任意）
│   └── performance.jsonl    # パフォーマンスメトリクス
├── test-results/
│   ├── vitest-results.json
│   ├── playwright-results.json
│   └── screenshots/
├── coverage/
│   └── coverage-final.json
├── docs/
│   ├── api/                 # 自動生成APIドキュメント
│   └── ipc-api-list.json    # IPC API一覧（任意）
├── typecheck.log
└── eslint-results.json
```

---

### 12. React DevToolsの統合確認

**現状**: 未確認

**追加すべき内容**:
- [ ] electron-devtools-installerのインストール確認
- [ ] React DevToolsのインストール実装確認
- [ ] Redux DevToolsのインストール（Zustand用）

**参考**: `D:\Dev\ai-friendly-electron-dev\docs\03_unified_architecture.md` セクション7

**実装箇所**:
- `src/main/index.ts`

---

## 検討事項 🤔

### 13. Utility Process APIの活用

**現状**: backendプロセスは別プロセスで実行しているが、Electron公式のUtility Process APIは未使用

**検討内容**:
- [ ] 現在のbackendプロセスの起動方法を確認
- [ ] Utility Process APIへの移行の必要性を検討
- [ ] 移行する場合のメリット・デメリットを評価

**参考**: `D:\Dev\ai-friendly-electron-dev\docs\05_general_best_practices.md` セクション「Main Processでの長時間処理は絶対に避ける」

**注意**: Utility Process APIはElectron 22+で導入された公式推奨の方法。現在のbackendプロセスがどのように起動されているか確認が必要。

---

## 実装の優先順位

### 優先度: 高 🔴
1. **統合ロギングシステムの改善** - 最も基本的で重要
2. **electron-trpcによる型安全なIPC通信** - 大きな変更だが効果大
3. **electron-mcp-serverの統合** - デバッグ支援の強化
4. **PlaywrightによるE2Eテスト** - テストカバレッジの拡大

### 優先度: 中 🟡
5. **Zustand + Redux DevTools** - 状態管理の改善
6. **テスト結果のJSON出力** - 既存テストの改善
7. **パフォーマンスメトリクスの収集** - パフォーマンス監視

### 優先度: 低 🟢
8. **TypeDocによるドキュメント自動生成** - API仕様の明確化
9. **静的解析結果のファイル出力** - すぐに実装可能
10. **その他** - ビルドエラーの構造化、ドキュメント化、React DevTools確認など

---

## 参考リソース

- [ai-friendly-electron-dev: 統一アーキテクチャ設計](D:\Dev\ai-friendly-electron-dev\docs\03_unified_architecture.md)
- [ai-friendly-electron-dev: コーディングエージェントによる情報アクセス方法](D:\Dev\ai-friendly-electron-dev\docs\04_ai_agent_information_access.md)
- [ai-friendly-electron-dev: 一般的なベストプラクティス](D:\Dev\ai-friendly-electron-dev\docs\05_general_best_practices.md)
- [electron-trpc公式ドキュメント](https://electron-trpc.dev/)
- [electron-mcp-server](https://github.com/halilural/electron-mcp-server)
- [TypeDoc](https://typedoc.org/)
- [Playwright](https://playwright.dev/)
- [Zustand](https://github.com/pmndrs/zustand)
