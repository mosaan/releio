# ネットワークセキュリティ

企業ネットワーク環境での AI API 接続対応（プロキシ・カスタム証明書）を記述する。

---

## プロキシ設定

### サポート形式

- **HTTP プロキシ**: `http://proxy.example.com:8080`
- **HTTPS プロキシ**: `https://proxy.example.com:8443`
- **認証**: Basic 認証（ユーザー名・パスワード）
- **環境変数**: `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`

### 設定取得

1. **手動設定**: UI で入力
2. **システム検出**: OS プロキシ設定を自動取得
   - Windows: `netsh winhttp show proxy`
   - macOS: `scutil --proxy`

### 実装

```typescript
// src/backend/settings/fetch.ts

export function createFetchWithProxyAndCertificates(
  proxySettings: ProxySettings,
  certSettings: CertificateSettings
): typeof fetch {
  const httpsAgent = new HttpsProxyAgent({
    proxy: proxySettings.httpsProxy || proxySettings.httpProxy,
    auth: proxySettings.username
      ? `${proxySettings.username}:${proxySettings.password}`
      : undefined,
    ca: certSettings.customCertificates,
    rejectUnauthorized: !certSettings.allowInvalidCertificates
  })

  return (url, options) => fetch(url, { ...options, agent: httpsAgent })
}
```

---

## カスタム証明書

### サポート形式

- **PEM / CRT ファイル**: カスタム CA 証明書
- **システム証明書**: Windows 証明書ストアから自動取得

### 証明書検証

- **デフォルト**: 証明書検証有効
- **自己署名証明書**: 明示的に許可が必要（`allowInvalidCertificates=true`）

### 実装

```typescript
// src/backend/settings/certificate.ts

export async function getSystemCertificateSettings(): Promise<CertificateSettings> {
  if (process.platform === 'win32') {
    // certutil コマンドで証明書エクスポート
    const { stdout } = await execPromise('certutil -store -enterprise Root')
    // PEM 形式に変換
    return { customCertificates: [pemCert] }
  }
  return { customCertificates: [] }
}
```

---

## 接続テスト

### テスト URL

- AI API: `https://api.openai.com`
- Anthropic: `https://api.anthropic.com`
- Google: `https://generativelanguage.googleapis.com`

### テスト手順

1. プロキシ設定適用
2. カスタム証明書適用
3. テスト URL に HEAD リクエスト
4. HTTP Status 200 or 401（認証エラーOK）なら成功

### UI フィードバック

- **成功**: 緑チェックマーク ✅
- **失敗**: 赤エラーアイコン ❌ + エラーメッセージ
  - 「プロキシ認証に失敗しました」
  - 「証明書の検証に失敗しました」

---

## セキュリティ考慮事項

1. **認証情報暗号化**: プロキシパスワードは `safeStorage` で暗号化
2. **ログマスキング**: パスワードはログに出力しない
3. **HTTPS 強制**: AI API 呼び出しは HTTPS のみ
4. **タイムアウト**: 接続テストは 30秒でタイムアウト

---

## トラブルシューティング

| 症状             | 原因                       | 対処                              |
| ---------------- | -------------------------- | --------------------------------- |
| プロキシ認証失敗 | ユーザー名・パスワード不正 | 再入力                            |
| 証明書エラー     | 自己署名証明書             | `allowInvalidCertificates` 有効化 |
| タイムアウト     | プロキシ URL 不正          | URL 確認                          |

---

## 次のステップ

- PAC（Proxy Auto-Config）スクリプト対応（Phase 2）
- クライアント証明書認証対応（Phase 2）
