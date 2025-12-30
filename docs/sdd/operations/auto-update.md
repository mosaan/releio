# 自動更新設計

electron-updater による自動更新の設計を記述する。

---

## 更新フロー

1. **起動時チェック**（3秒遅延）: `autoUpdater.checkForUpdates()`
2. **新バージョン検出**: UI にバナー表示
3. **ダウンロード**: ユーザーが「ダウンロード」クリック
4. **インストール**: ダウンロード完了後、「再起動」ボタン表示
5. **再起動**: `autoUpdater.quitAndInstall()` 実行

---

## 設定

```typescript
// src/main/updater-config.ts

export const updaterConfig: UpdaterConfig = {
  enabled: true,
  updateServerUrl: undefined, // GitHub Releases
  channel: 'latest'
}
```

---

## 更新サーバー

**デフォルト**: GitHub Releases  
**ファイル**: `latest.yml` (Windows), `latest-mac.yml` (macOS)

---

## セキュリティ

- **署名検証**: electron-updater がデフォルトで実施
- **HTTPS**: 更新ファイルは HTTPS 経由で取得

---

## ユーザー操作

- **自動**: 起動時チェック（バックグラウンド）
- **手動**: 設定画面「アップデートを確認」ボタン
- **スキップ**: 「後で」ボタンで延期可能

---

## 次のステップ

- ベータチャネル対応（Phase 2）
- リリースノート表示改善
