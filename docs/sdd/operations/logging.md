# 統合ログ設計

Releio の 3 プロセス統合ログシステムを記述する。

---

## ログアーキテクチャ

```
Main Process ──→ app.log
Backend Process ──→ process.send({type:'log'}) ──→ Main ──→ app.log
Renderer Process ──→ ipcRenderer.send('log') ──→ Main ──→ app.log
```

**統合先**: `app.log`（electron-log 管理、1MB ローテーション）

---

## ログレベル

| レベル  | 用途     | 例                              |
| ------- | -------- | ------------------------------- |
| `info`  | 正常動作 | AI 呼び出し開始、セッション作成 |
| `warn`  | 警告     | リトライ発生、非推奨 API 使用   |
| `error` | エラー   | API 失敗、DB エラー、クラッシュ |

---

## ログ形式

```
[2025-01-15 12:34:56.789] [INFO] [Context] Action {"key":"value"}
```

**テンプレート**:

```typescript
logger.info('[Context] Action', { key: 'value' })
```

---

## 主要ログポイント

### AI Chat

- `[Mastra] Agent initialized`
- `[Mastra] Streaming start`
- `[Mastra] Chunk received`
- `[Mastra] Tool execution completed`
- `[Mastra] Stream aborted`

### MCP

- `[MCP] Server starting`
- `[MCP] Server running`
- `[MCP] Tool call failed`

### Compression

- `[Compression] Context check`
- `[Compression] Compression completed`

---

## ログファイル

- **パス**: `%APPDATA%/releio/logs/app.log` (Windows)
- **ローテーション**: 1MB/ファイル、最大 10 ファイル
- **保持期間**: 無制限（ユーザーが手動削除）

---

## センシティブ情報のマスキング

```typescript
logger.info('[API] Calling AI', { apiKey: '***' }) // マスキング
```

**禁止**: API キー・パスワード・証明書をログ出力しない

---

## 次のステップ

- ログ閲覧 UI（Phase 2）
- エラーログのクラウド送信（将来検討）
