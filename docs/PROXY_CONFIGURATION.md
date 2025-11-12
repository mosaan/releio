# プロキシと証明書の設定ガイド

**最終更新**: 2025-11-09
**ステータス**: ✅ Windows 11 環境で完全動作確認済み

このドキュメントでは、企業ネットワーク環境でアプリケーションを使用するためのプロキシと証明書の設定方法について説明します。

## 目次

- [概要](#概要)
- [プロキシ設定](#プロキシ設定)
  - [システムプロキシモード](#システムプロキシモード)
  - [カスタムプロキシモード](#カスタムプロキシモード)
  - [プロキシなしモード](#プロキシなしモード)
- [証明書設定](#証明書設定)
  - [システム証明書モード](#システム証明書モード)
  - [カスタム証明書モード](#カスタム証明書モード)
  - [デフォルトモード](#デフォルトモード)
- [接続テスト](#接続テスト)
- [トラブルシューティング](#トラブルシューティング)
- [セキュリティに関する注意事項](#セキュリティに関する注意事項)

## 概要

このアプリケーションは、企業ネットワーク環境での使用を想定して、以下の機能を提供しています：

- **自動設定**: 初回起動時に Windows システム設定を自動検出・保存
- **プロキシサーバーのサポート**: HTTP/HTTPS プロキシ経由での通信
- **認証プロキシのサポート**: ユーザー名/パスワード認証が必要なプロキシ
- **カスタム証明書**: 企業の CA 証明書を使用した HTTPS 通信
- **接続テスト**: 設定が正しいことを確認する機能

### 初回起動時の動作

アプリケーションを初めて起動すると、以下の処理が自動的に実行されます：

1. **Windows システムプロキシの検出**: レジストリから現在のプロキシ設定を読み取り
2. **Windows 証明書ストアの読み込み**: 信頼されたルート証明書を取得
3. **設定の保存**: 検出した設定をデータベースに保存
4. **即座に適用**: すべての AI API リクエストに自動適用

プロキシが設定されていない環境では、自動的に「プロキシなし」モードになります。

### 動作フロー

```mermaid
graph TB
    A[AI API リクエスト] --> B{プロキシ設定}
    B -->|System| C[Windows システムプロキシを使用]
    B -->|Custom| D[カスタムプロキシを使用]
    B -->|None| E[プロキシなし]

    C --> F{証明書設定}
    D --> F
    E --> F

    F -->|System| G[Windows 証明書ストアを使用]
    F -->|Custom| H[カスタム証明書を使用]
    F -->|Default| I[Node.js デフォルト証明書]

    G --> J[AI API へリクエスト送信]
    H --> J
    I --> J
```

## プロキシ設定

アプリケーションの設定画面で「Proxy Settings」カードからプロキシを設定できます。

### システムプロキシモード

Windows のシステムプロキシ設定を自動的に読み込んで使用します。

**設定手順:**

1. 設定画面を開く
2. 「Proxy Mode」で「System Proxy」を選択
3. 「Reload System Settings」ボタンで現在のシステム設定を読み込む
4. 設定内容を確認
5. 「Save Settings」ボタンで保存

**読み込まれる設定:**
- HTTP プロキシ (`HTTP_PROXY`)
- HTTPS プロキシ (`HTTPS_PROXY`)
- プロキシ除外リスト (`NO_PROXY`)

**注意事項:**
- Windows のインターネット オプション → 接続 → LAN の設定 で設定されたプロキシが使用されます
- システムプロキシの認証情報は読み込めないため、認証が必要な場合は「Custom Proxy」モードを使用してください

#### PAC（Proxy Auto-Config）ファイルについて

**⚠️ 現在の制限**: PAC ファイル（自動プロキシ設定スクリプト）は現時点ではサポートされていません。

Windows の「自動プロキシセットアップ」で「セットアップスクリプトを使う」が有効になっている場合、システムプロキシモードは動作しません。

**Workaround（回避策）**:

1. **PAC ファイルの URL を確認**:
   - Windows 設定 → ネットワークとインターネット → プロキシ
   - 「セットアップスクリプトを使う」の「スクリプトのアドレス」を確認
   - 例: `http://proxy.company.com/proxy.pac`

2. **PAC ファイルの内容を確認**:
   - ブラウザでスクリプトアドレスを開く
   - `FindProxyForURL` 関数内のプロキシサーバーアドレスを確認
   ```javascript
   // PAC ファイルの例
   function FindProxyForURL(url, host) {
     return "PROXY proxy.company.com:8080; DIRECT";
   }
   ```
   - この例では `proxy.company.com:8080` がプロキシサーバーです

3. **カスタムモードで設定**:
   - Proxy Mode: `Custom Proxy` を選択
   - HTTP Proxy: `http://proxy.company.com:8080`
   - HTTPS Proxy: `http://proxy.company.com:8080`
   - 認証が必要な場合はユーザー名/パスワードも入力
   - Save Settings

4. **接続テスト**:
   - 「Test Connection」ボタンで動作確認

**PowerShell でスクリプトアドレスを確認する方法**:
```powershell
Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name AutoConfigURL
```

**将来の対応予定**: PAC ファイルの完全サポートは将来のバージョンで実装を予定しています。

### カスタムプロキシモード

プロキシサーバーのアドレスと認証情報を手動で設定します。

**設定手順:**

1. 設定画面を開く
2. 「Proxy Mode」で「Custom Proxy」を選択
3. 以下の情報を入力:
   - **HTTP Proxy**: HTTP プロキシの URL (例: `http://proxy.company.com:8080`)
   - **HTTPS Proxy**: HTTPS プロキシの URL (例: `https://proxy.company.com:8443`)
   - **No Proxy**: プロキシを使用しないホストのリスト (例: `localhost, *.local, 127.0.0.1`)
   - **Username**: プロキシ認証のユーザー名 (オプション)
   - **Password**: プロキシ認証のパスワード (オプション)
4. 「Test Connection」ボタンで接続をテスト
5. 「Save Settings」ボタンで保存

**プロキシ URL の形式:**

```
http://proxy.example.com:8080
https://proxy.example.com:8443
```

**No Proxy の形式:**

カンマ区切りで複数のパターンを指定できます：

```
localhost, 127.0.0.1, *.local, 192.168.*, <local>
```

- `*.local` - `.local` で終わるすべてのホスト
- `<local>` - ドットを含まないすべてのホスト（ローカルネットワーク）
- 完全一致のホスト名または IP アドレス

**認証プロキシの例:**

ユーザー名/パスワード認証が必要なプロキシの場合：

1. HTTP Proxy: `http://proxy.company.com:8080`
2. Username: `your-username`
3. Password: `your-password`

### プロキシなしモード

プロキシを使用せず、インターネットに直接接続します。

**設定手順:**

1. 設定画面を開く
2. 「Proxy Mode」で「No Proxy」を選択
3. 「Save Settings」ボタンで保存

## 証明書設定

アプリケーションの設定画面で「Certificate Settings」カードから証明書を設定できます。

### システム証明書モード

Windows の証明書ストアから証明書を読み込んで使用します。

**設定手順:**

1. 設定画面を開く
2. 「Certificate Mode」で「System Certificates」を選択
3. 読み込まれた証明書の数を確認
4. 「Test Connection」ボタンで HTTPS 接続をテスト
5. 「Save Settings」ボタンで保存

**読み込まれる証明書:**
- Windows の信頼されたルート証明機関の証明書
- 企業の CA 証明書（Windows に追加されている場合）

**証明書の再読み込み:**

Windows の証明書ストアが更新された場合、「Reload System Certificates」ボタンで再読み込みできます。

### カスタム証明書モード

カスタム CA 証明書を手動でインポートして使用します。

**設定手順:**

1. 設定画面を開く
2. 「Certificate Mode」で「Custom Certificates」を選択
3. （現在準備中）証明書ファイルをインポート

**注意:** カスタム証明書のインポート機能は今後のリリースで提供予定です。

### デフォルトモード

Node.js のデフォルト証明書を使用します。

**設定手順:**

1. 設定画面を開く
2. 「Certificate Mode」で「Default (Node.js)」を選択
3. 「Save Settings」ボタンで保存

**注意:** 企業の CA 証明書が必要な環境では、このモードでは接続に失敗する可能性があります。

### セキュリティオプション

証明書検証の動作を制御できます：

- **Reject unauthorized certificates (Recommended)**: 無効な証明書を拒否（推奨）
- **Accept all certificates (Insecure)**: すべての証明書を受け入れ（非推奨）

**警告:** 「Accept all certificates」オプションは、中間者攻撃のリスクがあるため、開発環境以外では使用しないでください。

## 接続テスト

設定が正しいことを確認するために、接続テスト機能を使用できます。

### プロキシ接続テスト

**実行方法:**

1. プロキシ設定を入力（保存は不要）
2. 「Test Connection」ボタンをクリック
3. 結果を確認

**成功時の表示:**

```
✓ Connected!
Proxy connection successful (123ms)
```

**失敗時の表示例:**

```
✗ Failed
Connection timeout - proxy server may be unreachable

Details: ETIMEDOUT
Type: timeout
```

### 証明書接続テスト

**実行方法:**

1. 証明書設定を選択（保存は不要）
2. 「Test Connection」ボタンをクリック
3. 結果を確認

**成功時の表示:**

```
✓ Connected!
HTTPS connection successful (234ms)
```

**失敗時の表示例:**

```
✗ Failed
Unable to verify certificate - CA certificate may be missing

Details: UNABLE_TO_VERIFY_LEAF_SIGNATURE
Type: certificate
```

### テスト接続先

接続テストでは、以下の URL に対してリクエストを送信します：

- **HTTP テスト**: `http://www.google.com`
- **HTTPS テスト**: `https://www.google.com`

企業のファイアウォールで Google へのアクセスがブロックされている場合、テストは失敗します。

## トラブルシューティング

### プロキシ関連の問題

#### 「Connection timeout - proxy server may be unreachable」

**原因:**
- プロキシサーバーのアドレスまたはポートが間違っている
- プロキシサーバーが停止している
- ファイアウォールでブロックされている

**解決方法:**
1. プロキシ URL を確認（例: `http://proxy.company.com:8080`）
2. ネットワーク管理者にプロキシ設定を確認
3. Windows のシステムプロキシ設定を確認
4. 「System Proxy」モードを試す

#### 「Proxy authentication failed - check username and password」

**原因:**
- ユーザー名またはパスワードが間違っている
- プロキシ認証の方式がサポートされていない

**解決方法:**
1. ユーザー名とパスワードを再入力
2. ネットワーク管理者に認証情報を確認
3. プロキシの認証方式を確認（Basic 認証をサポート）

#### 「Cannot reach proxy server - check proxy URL and port」

**原因:**
- プロキシサーバーが存在しない
- DNS 名前解決が失敗している

**解決方法:**
1. プロキシのホスト名が正しいか確認
2. `ping proxy.company.com` でホストに到達できるか確認
3. IP アドレスで試す（例: `http://192.168.1.100:8080`）

### 証明書関連の問題

#### 「Unable to verify certificate - CA certificate may be missing」

**原因:**
- 企業の CA 証明書が信頼されたルート証明機関に追加されていない
- 証明書チェーンが不完全

**解決方法:**
1. Windows の証明書マネージャーで CA 証明書を確認:
   - `certmgr.msc` を実行
   - 「信頼されたルート証明機関」→「証明書」を確認
2. 企業の CA 証明書を Windows に追加
3. 「Reload System Certificates」ボタンで再読み込み
4. 「System Certificates」モードを使用

#### 「Self-signed certificate in chain」

**原因:**
- 自己署名証明書が使用されている（開発環境など）
- 企業の CA 証明書が信頼されていない

**解決方法:**

**本番環境:**
1. 企業の CA 証明書を Windows の信頼されたルート証明機関に追加
2. アプリケーションを再起動
3. 「System Certificates」モードを使用

**開発環境のみ:**
1. 「Security」で「Accept all certificates (Insecure)」を選択
2. **警告**: この設定は本番環境では使用しないでください

#### 「Certificate has expired」

**原因:**
- サーバーの証明書が期限切れ

**解決方法:**
1. ネットワーク管理者に証明書の更新を依頼
2. システムの日時が正しいことを確認

### AI API 接続の問題

#### AI チャットが動作しない

**確認手順:**

1. **プロキシ設定を確認:**
   - 設定画面 → Proxy Settings → Test Connection

2. **証明書設定を確認:**
   - 設定画面 → Certificate Settings → Test Connection

3. **API キーを確認:**
   - 設定画面 → AI Settings → API Key が正しく設定されているか

4. **ログを確認:**
   - ログファイルの場所:
     - 開発環境: `./tmp/logs/app.log`
     - 本番環境: `%APPDATA%/Releio/logs/app.log`
   - エラーメッセージを確認

**ログの例:**

```
[2025-11-09 10:23:45.123] [error] [backend:ai] Failed to connect to API
[2025-11-09 10:23:45.124] [error] [backend:ai] UNABLE_TO_VERIFY_LEAF_SIGNATURE
```

このエラーが出た場合、証明書設定を確認してください。

### その他の問題

#### 設定を保存できない

**解決方法:**
1. アプリケーションを再起動
2. データベースファイルの権限を確認
3. ディスク容量を確認

#### 設定が反映されない

**解決方法:**
1. 「Save Settings」ボタンで設定を保存したか確認
2. アプリケーションを再起動
3. 設定画面を開いて設定が保存されているか確認

### 技術的な既知の問題（開発者向け）

以下の問題は v0.1.0 で修正済みですが、古いバージョンを使用している場合は更新してください：

#### 「getWindowsProxy is not a function」または「winCa.inject is not a function」

**原因（v0.1.0 より前）:**
- CommonJS モジュールの dynamic import の誤り
- `@cypress/get-windows-proxy` と `win-ca` を named import として扱っていた

**修正済み（v0.1.0）:**
- `.default` import に変更
- コミット: `5b000df`

**回避策（古いバージョン）:**
1. アプリケーションを最新バージョンに更新

#### 証明書読み込みでアプリケーションがハングする

**原因（v0.1.0 より前）:**
- `win-ca` API の使用方法が間違っていた
- 存在しない `inject()` メソッドを呼び出していた

**修正済み（v0.1.0）:**
- `ondata`/`onend` コールバックパターンに変更
- コミット: `5df0316`

**回避策（古いバージョン）:**
1. アプリケーションを最新バージョンに更新

#### AI チャットでレスポンスが表示されない

**確認項目:**
1. ログで「AI response streaming completed successfully」が表示されているか確認
2. ブラウザコンソールでエラーがないか確認
3. アプリケーションを最新バージョンに更新

**注意**: v0.1.0 以降、すべての既知の問題は修正されています。

## セキュリティに関する注意事項

### プロキシ認証情報の保存

- プロキシのユーザー名とパスワードは、アプリケーションのデータベースに**暗号化されずに**保存されます
- データベースファイルへのアクセスを制限してください
- 可能であれば、Windows 統合認証を使用するプロキシを推奨します

### 証明書検証の無効化

**「Accept all certificates」オプションについて:**

- このオプションは、SSL/TLS 証明書の検証を完全に無効化します
- 中間者攻撃（Man-in-the-Middle Attack）のリスクがあります
- **本番環境では絶対に使用しないでください**
- 開発環境やテスト環境でのみ、一時的に使用してください

**推奨設定:**

- **本番環境**:
  - Certificate Mode: `System Certificates`
  - Security: `Reject unauthorized certificates`

- **開発環境**:
  - Certificate Mode: `System Certificates` または `Custom Certificates`
  - Security: `Reject unauthorized certificates`（推奨）

### ログファイルの管理

- ログファイルにはプロキシ URL が記録されますが、認証情報は記録されません
- ログファイルは以下の形式で記録されます:
  ```
  Using HTTPS proxy for request { host: 'api.anthropic.com', proxy: 'http://***:***@proxy.company.com:8080' }
  ```
- 認証情報は `***:***` にマスクされます

## 関連ドキュメント

- [開発者向けプロジェクト概要](./FOR_DEVELOPERS.md) - アーキテクチャとデバッグ方法
- [プロキシと証明書機能の設計ドキュメント](./PROXY_AND_CERTIFICATE_DESIGN.md) - 技術設計の詳細
- [IPC 通信の詳細](./IPC_COMMUNICATION_DEEP_DIVE.md) - プロセス間通信の仕組み

## サポート

問題が解決しない場合は、以下の情報を含めてサポートに連絡してください：

1. エラーメッセージ（スクリーンショットまたはログ）
2. プロキシ設定（認証情報は含めないでください）
3. 証明書設定
4. 接続テストの結果
5. ログファイルの関連部分（`./tmp/logs/app.log` または `%APPDATA%/Releio/logs/app.log`）

**注意:** 認証情報（ユーザー名/パスワード、API キー）は送信しないでください。
