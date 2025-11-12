# 自動更新機能クイックテストガイド

5分で自動更新機能をテストできる簡単ガイドです。

## 準備（初回のみ）

```bash
# 依存関係のインストール
pnpm install

# .envファイルを作成
cat > .env << 'EOF'
MAIN_VITE_USER_DATA_PATH=./tmp
ELECTRON_UPDATER_CONFIG='{"enabled":true,"updateServerUrl":"http://localhost:5000","channel":"latest"}'
EOF
```

## クイックテスト（2バージョン間の更新テスト）

### ターミナル1: 最初のバージョン（0.1.0）を準備

```bash
# 現在のバージョンを確認（0.1.0のはず）
grep '"version"' package.json

# Windows向けビルド（数分かかる）
pnpm run build:win

# 更新サーバー用ディレクトリに移動（最初は空）
mkdir -p dist-updates
```

### ターミナル2: 新バージョン（0.2.0）を準備

```bash
# バージョンを0.2.0に変更
sed -i 's/"version": "0.1.0"/"version": "0.2.0"/' package.json

# 再度ビルド
pnpm run build:win

# 更新ファイルをコピー
cp dist/electron-ai-starter-0.2.0-setup.exe dist-updates/
cp dist/latest.yml dist-updates/

# 更新サーバーを起動
pnpm run update-server
```

**出力例**:
```
Starting up http-server, serving dist-updates

http-server version: 14.1.1

Available on:
  http://127.0.0.1:5000
  http://192.168.x.x:5000
Hit CTRL-C to stop the server
```

### ターミナル3: アプリを起動してテスト

```bash
# バージョンを0.1.0に戻す（テスト用）
sed -i 's/"version": "0.2.0"/"version": "0.1.0"/' package.json

# 開発モードで起動
pnpm run dev
```

### 期待される動作

1. ⏱️ **3秒待つ** → 自動で更新チェック
2. 🔔 **ダイアログ表示**: "Update Available - A new version (0.2.0) is available..."
3. 📥 **"Download Now"クリック** → ダウンロード進捗表示
4. ✅ **ダウンロード完了**: "Update Ready - Version 0.2.0 has been downloaded..."
5. 🔄 **"Restart Now"クリック** → アプリ再起動（0.2.0になる）

## ログ確認

別のターミナルでログを監視：

```bash
# 更新関連のログのみ表示
tail -f ./tmp/logs/app.log | grep -i update

# または、全ログを表示
tail -f ./tmp/logs/app.log
```

**正常なログ例**:
```
[2025-11-12 08:00:00.000] [info] [Updater] Update server URL set to: http://localhost:5000
[2025-11-12 08:00:03.123] [info] [Updater] Checking for updates...
[2025-11-12 08:00:03.456] [info] [Updater] Update available: 0.2.0 (current: 0.1.0)
[2025-11-12 08:00:10.789] [info] [Updater] Starting update download...
[2025-11-12 08:00:11.000] [info] [Updater] Download progress: 25.00% (...)
[2025-11-12 08:00:15.234] [info] [Updater] Update downloaded: 0.2.0
```

## トラブルシューティング

### ダイアログが表示されない

**原因1: 更新サーバーが起動していない**
```bash
# 確認
curl http://localhost:5000/latest.yml

# サーバーを再起動
pnpm run update-server
```

**原因2: バージョンが同じ**
```bash
# 現在のバージョンを確認
grep '"version"' package.json

# latest.ymlのバージョンを確認
grep 'version:' dist-updates/latest.yml

# バージョンが異なることを確認（例: package.json=0.1.0, latest.yml=0.2.0）
```

**原因3: 環境変数が設定されていない**
```bash
# .envファイルを確認
cat .env | grep ELECTRON_UPDATER_CONFIG

# 環境変数を再設定
source .env
```

### "No update available"エラー

**症状**: ダイアログは表示されるが、"Download Now"をクリックするとエラー

**原因**: バージョン比較が正しく動作していない（既に修正済み）

**確認**:
```bash
# ログでバージョン比較を確認
tail -f ./tmp/logs/app.log | grep "current:"
```

## 元のバージョンに戻す

テスト後、バージョンを元に戻す：

```bash
# package.jsonを0.1.0に戻す
sed -i 's/"version": "0.2.0"/"version": "0.1.0"/' package.json

# キャッシュをクリア
rm -rf ./tmp

# dist-updatesをクリア（オプション）
rm -rf dist-updates
```

## 次のステップ

詳細なテスト手順は `scripts/TEST_AUTO_UPDATE.md` を参照してください。

本番環境でのデプロイ方法は `docs/AUTO_UPDATE.md` を参照してください。
