# プロキシと証明書のカスタマイズ機能実装

## 概要

企業プロキシ環境（Zscaler等）でのアプリケーション使用を可能にするため、プロキシとHTTPS証明書検証のカスタマイズ機能を実装する。

**設計文書**: [docs/PROXY_AND_CERTIFICATE_DESIGN.md](../docs/PROXY_AND_CERTIFICATE_DESIGN.md) ✅ 承認済み

## 提供する機能

- **システムモード**: OS標準のプロキシ・証明書設定を自動使用
- **カスタムモード**: アプリ独自の設定をUI画面で設定
- **無設定モード**: 現状維持（プロキシなし）

**第1フェーズ**: Windowsのみ対応

## 実装フェーズ

### フェーズ1: 基盤実装（Windows システムモード）

**目標**: Windowsシステム設定を使用してAI接続を可能にする

#### タスク

- [ ] **依存関係追加**
  ```bash
  pnpm add https-proxy-agent node-fetch
  pnpm add @cypress/get-windows-proxy win-ca
  pnpm add -D @types/node-fetch
  ```

- [ ] **プラットフォーム層実装**
  - [ ] `src/backend/platform/windows/proxy.ts` - Windowsプロキシ設定取得
  - [ ] `src/backend/platform/windows/certificate.ts` - Windows証明書取得

- [ ] **設定管理層実装**
  - [ ] `src/backend/settings/proxy.ts` - プロキシ設定管理
  - [ ] `src/backend/settings/certificate.ts` - 証明書設定管理
  - [ ] `src/common/types.ts` - ProxySettings, CertificateSettings型定義

- [ ] **Fetch Builder実装**
  - [ ] `src/backend/ai/fetch.ts` - カスタムfetch作成関数

- [ ] **AI Factory変更**
  - [ ] `src/backend/ai/factory.ts` - カスタムfetchの適用

- [ ] **データベースマイグレーション**
  - [ ] デフォルト設定の追加（システムモード）

- [ ] **テスト**
  - [ ] Windowsプロキシ環境でAI接続テスト
  - [ ] ログ出力の確認

**成果物**:
- Windowsシステムプロキシ・証明書でAI接続可能
- ログにプロキシ使用状況を出力

---

### フェーズ2: UI実装（カスタムモード）

**目標**: ユーザーが設定画面でプロキシ・証明書をカスタマイズ可能にする

#### タスク

- [ ] **IPC API追加**
  - [ ] プロキシ設定の取得・更新API
  - [ ] 証明書設定の取得・更新API
  - [ ] 接続テストAPI

- [ ] **UI コンポーネント実装**
  - [ ] `src/renderer/src/components/settings/ProxySettings.tsx`
    - モード選択UI
    - カスタム設定入力フォーム
    - 接続テストボタン
  - [ ] `src/renderer/src/components/settings/CertificateSettings.tsx`
    - モード選択UI
    - ファイルアップロード
  - [ ] 既存Settings画面への統合

- [ ] **バックエンド機能追加**
  - [ ] 接続テスト機能実装
  - [ ] カスタムCA証明書ファイルの保存・読み込み

- [ ] **データ暗号化**
  - [ ] プロキシ認証情報の暗号化（既存のAPIキー暗号化と同じ方法）

- [ ] **テスト**
  - [ ] カスタムプロキシ設定での接続テスト
  - [ ] UI操作の確認

**成果物**:
- 完全な設定UI
- カスタムプロキシ・証明書での接続

---

### フェーズ3: エラーハンドリングと改善

**目標**: ユーザーフレンドリーなエラー処理と使いやすさの向上

#### タスク

- [ ] **エラーハンドリング**
  - [ ] プロキシ接続エラーの検出と表示
  - [ ] 証明書エラーの検出と表示
  - [ ] 分かりやすいエラーメッセージ

- [ ] **ログ改善**
  - [ ] プロキシ使用状況のログ
  - [ ] 証明書検証のログ
  - [ ] デバッグ情報

- [ ] **ドキュメント**
  - [ ] `docs/PROXY_CONFIGURATION.md`作成
  - [ ] トラブルシューティングガイド
  - [ ] `CLAUDE.md`に使用方法を追加

- [ ] **テスト**
  - [ ] 各種エラーケースのテスト
  - [ ] ドキュメントのレビュー

**成果物**:
- 完全なエラーハンドリング
- ユーザー向けドキュメント

---

## 技術スタック

- **プロキシエージェント**: `https-proxy-agent`
- **Fetch実装**: `node-fetch`
- **Windowsプロキシ取得**: `@cypress/get-windows-proxy`
- **Windows証明書取得**: `win-ca`

## 参考資料

- 設計文書: `docs/PROXY_AND_CERTIFICATE_DESIGN.md`
- AI SDK ドキュメント: https://sdk.vercel.ai/providers
- https-proxy-agent: https://www.npmjs.com/package/https-proxy-agent
- @cypress/get-windows-proxy: https://www.npmjs.com/package/@cypress/get-windows-proxy
- win-ca: https://www.npmjs.com/package/win-ca

## 注意事項

### 既知のリスク

1. **PAC（Proxy Auto-Config）ファイル**: 第1フェーズでは固定プロキシのみサポート
2. **プロキシ認証**: 第1フェーズではBasic認証のみ、NTLM等は将来対応
3. **証明書の更新**: 企業CA証明書の更新時にアプリ再起動が必要

### セキュリティ考慮事項

- プロキシ認証情報はデータベース内で暗号化保存
- ログに機密情報を出力しない
- カスタムCA証明書の妥当性チェック

---

## 対象バージョン

v0.2.0

## ラベル提案

- `enhancement`
- `proxy`
- `security`
- `windows`
