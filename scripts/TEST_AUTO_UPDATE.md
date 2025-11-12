# Auto-Update機能のテスト手順

このガイドでは、Electron自動更新機能をローカル環境でテストする方法を説明します。

## 前提条件

- Node.js 20以上
- pnpm

## テスト手順

### ステップ1: 初期バージョン（0.1.0）をビルド

```bash
# 依存関係のインストール
pnpm install

# バージョンを0.1.0に設定（すでに設定済み）
# package.jsonで確認: "version": "0.1.0"

# Windowsインストーラーをビルド
pnpm run build:win
```

ビルド完了後、以下のファイルが生成されます：
- `dist/releio-0.1.0-setup.exe`
- `dist/latest.yml`

### ステップ2: 初期バージョンをインストール

1. `dist/releio-0.1.0-setup.exe`を実行
2. インストール完了後、アプリを**起動せず**次のステップへ

### ステップ3: 環境変数を設定（開発モード）

`.env`ファイルを作成：

```bash
MAIN_VITE_USER_DATA_PATH=./tmp
ELECTRON_UPDATER_CONFIG='{"enabled":true,"updateServerUrl":"http://localhost:5000","channel":"latest"}'
```

### ステップ4: 新バージョン（0.2.0）をビルド

```bash
# package.jsonのバージョンを更新
# "version": "0.1.0" → "version": "0.2.0"

# 再度ビルド
pnpm run build:win
```

生成ファイル：
- `dist/releio-0.2.0-setup.exe`
- `dist/latest.yml`（0.2.0の情報に更新される）

### ステップ5: 更新サーバーのセットアップ

```bash
# 更新ファイル用ディレクトリを作成
mkdir -p dist-updates

# 新バージョンのファイルをコピー
cp dist/releio-0.2.0-setup.exe dist-updates/
cp dist/latest.yml dist-updates/

# SHA512ハッシュを確認（自動生成されているはず）
cat dist-updates/latest.yml
```

**latest.ymlの例**:
```yaml
version: 0.2.0
releaseDate: '2025-11-12T07:00:00.000Z'
files:
  - url: releio-0.2.0-setup.exe
    sha512: abcd1234...（自動生成されたハッシュ）
    size: 123456789
path: releio-0.2.0-setup.exe
sha512: abcd1234...（自動生成されたハッシュ）
releaseNotes: |
  ## 新機能
  - 自動更新機能を追加
  - UIの改善
```

### ステップ6: 更新サーバーを起動

```bash
# Node.js HTTP サーバーを起動
pnpm run update-server
```

サーバーが起動したら、以下のように表示されます：
```
Starting up http-server, serving dist-updates

http-server version: 14.1.1

Available on:
  http://127.0.0.1:5000
  http://192.168.x.x:5000
Hit CTRL-C to stop the server
```

ブラウザで確認：
- http://localhost:5000/latest.yml （YAMLファイルが表示されればOK）
- http://localhost:5000/releio-0.2.0-setup.exe （ダウンロードが始まればOK）

### ステップ7: アプリを起動してテスト

```bash
# 開発モードで起動
pnpm run dev
```

**期待される動作**:

1. **起動後3秒待つ** → バックグラウンドで更新チェック
2. **更新ダイアログが表示される**:
   - タイトル: "Update Available"
   - メッセージ: "A new version (0.2.0) is available..."
   - リリースノートが表示される
3. **"Download Now"をクリック**:
   - ダウンロード進捗ダイアログが表示される
   - 進捗バー、転送量、速度が表示される
4. **ダウンロード完了**:
   - "Update Ready"ダイアログが表示される
   - "Restart Now"ボタンが表示される
5. **"Restart Now"をクリック**:
   - アプリが終了し、新バージョンがインストールされる
   - アプリが再起動する（0.2.0になっている）

## トラブルシューティング

### ダイアログが表示されない

1. **ログを確認**:
   ```bash
   tail -f ./tmp/logs/app.log | grep Updater
   ```

2. **環境変数を確認**:
   ```bash
   cat .env | grep ELECTRON_UPDATER_CONFIG
   ```

3. **サーバーが起動しているか確認**:
   ```bash
   curl http://localhost:5000/latest.yml
   ```

### "No update available"エラー

**原因**: バージョン比較の問題

**確認事項**:
- package.jsonのversionが正しく更新されているか
- dist-updates/latest.ymlのversionが0.2.0になっているか
- アプリ内で`app.getVersion()`が0.1.0を返しているか

**デバッグ**:
```javascript
// src/main/updater.tsに以下を追加してログ確認
console.log('Current version:', app.getVersion())
console.log('Latest version:', result.updateInfo.version)
```

### ダウンロードエラー

**原因**: ファイルが見つからない、またはハッシュ不一致

**確認事項**:
- `dist-updates/`に.exeファイルが存在するか
- latest.ymlのファイル名が正しいか
- SHA512ハッシュが正しいか（electron-builderが自動生成）

### キャッシュのクリア

テストを繰り返す場合、キャッシュをクリア：

```bash
# 一時ファイルを削除
rm -rf ./tmp

# 開発モードで再起動
pnpm run dev
```

## 本番環境でのテスト

### ステップ1: updater.jsonを配置

Windowsインストール後、以下の場所に`updater.json`を作成：

```
C:\Users\<username>\AppData\Local\Releio\updater.json
```

**updater.jsonの内容**:
```json
{
  "enabled": true,
  "updateServerUrl": "http://localhost:5000",
  "channel": "latest"
}
```

### ステップ2: 本番ビルドを起動

```bash
# ビルド済みのアプリを起動
# スタートメニューまたはデスクトップから起動
```

### ステップ3: 更新サーバーを起動

```bash
pnpm run update-server
```

### ステップ4: アプリ起動

インストールしたアプリを起動し、3秒待つと更新通知が表示されます。

## プレリリースバージョンのテスト

semverライブラリを使用しているため、プレリリース識別子も正しく処理されます：

```bash
# package.jsonでバージョンを設定
"version": "0.2.0-beta.1"

# ビルド
pnpm run build:win

# 0.1.0 → 0.2.0-beta.1 への更新が正しく動作することを確認
```

**プレリリースの比較例**:
- `0.1.0` < `0.2.0-beta.1` ✅ 更新される
- `0.2.0-beta.1` < `0.2.0-beta.2` ✅ 更新される
- `0.2.0-beta.2` < `0.2.0` ✅ 更新される
- `0.2.0` > `0.2.0-beta.1` ❌ 更新されない

## チェックリスト

テストの各段階で確認：

- [ ] 0.1.0のインストーラーがビルドできた
- [ ] 0.1.0がインストールできた
- [ ] 0.2.0のインストーラーがビルドできた
- [ ] latest.ymlが正しく生成された
- [ ] 更新サーバーが起動できた
- [ ] latest.ymlにブラウザでアクセスできた
- [ ] アプリ起動後、更新ダイアログが表示された
- [ ] リリースノートが表示された
- [ ] ダウンロードが開始された
- [ ] 進捗バーが表示された
- [ ] ダウンロードが完了した
- [ ] "Restart Now"をクリックしてインストールできた
- [ ] 再起動後、0.2.0になっていた

## 参考

詳細なドキュメントは`docs/AUTO_UPDATE.md`を参照してください。
