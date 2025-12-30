# リリースプロセス

Releio のリリース手順（ビルド・署名・配布）を記述する。

---

## リリースチェックリスト

- [ ] バージョン番号更新（`package.json`）
- [ ] CHANGELOG.md 更新
- [ ] `npm run typecheck` 成功
- [ ] `npm run lint` 成功
- [ ] `npm run test` 成功
- [ ] ビルド実行（`npm run build:win` / `npm run build:mac`）
- [ ] インストーラー動作確認
- [ ] GitHub Release 作成
- [ ] `latest.yml` / `latest-mac.yml` アップロード

---

## ビルドコマンド

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

---

## 成果物

### Windows

- `dist/Releio-Setup-X.X.X.exe` (インストーラー)
- `dist/latest.yml` (更新メタデータ)

### macOS

- `dist/Releio-X.X.X.dmg`
- `dist/latest-mac.yml`

---

## GitHub Release

1. GitHub Releases で新規リリース作成
2. タグ: `vX.X.X`
3. タイトル: `Release vX.X.X`
4. 説明: CHANGELOG.md から抜粋
5. ファイル添付:
   - Windows: `.exe`, `latest.yml`
   - macOS: `.dmg`, `.dmg.blockmap`, `latest-mac.yml`

---

## バージョニング

**セマンティックバージョニング**: `MAJOR.MINOR.PATCH`

- **MAJOR**: 破壊的変更
- **MINOR**: 新機能追加
- **PATCH**: バグ修正

---

## 次のステップ

- CI/CD 自動化（GitHub Actions）
- コード署名自動化
