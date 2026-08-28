# siren2345_tools

個人ツール集。第一弾は **Kitesurf**（Cloudflare のエージェント向けブラウザ）を、
MCP と shell コマンドの両方から使えるようにしたラッパ。

目的は **JS で描画されるサイト** を正しく読んでること。`WebFetch` 等はサーバー側で
JS を実行しないので SPA 等で中身が空になるが、Kitesurf はボートの JS エンジンで描画済み
の HTML / Markdown を返す。

## できること

| 用途 | 手段 |
|---|---|
| Claude Code / Cursor / Gemini CLI からツールとして使う | **MCP**（`kitesurf-mcp.js`） |
| ターミナルから 1 発で使う | **shell**（`kitesurf.js` / `kitesurf`） |

### MCP のツール一覧

| ツール | 内容 |
|---|---|
| `markdown` | ページを描画して Markdown で返す（JS 描画サイトの読み込みに最適） |
| `html` | 描画済み HTML を返す（`/content` 相当） |
| `links` | 描画済みページからリンクを抽出 |
| `screenshot` | 描画済みページのスクショット（`image/png` / base64） |

## 前提

- **Node.js**（外部依存ゼロ、`global fetch` 使用）
- **Cloudflare アカウント**（無料）＋ API トークン
  - トークン権限: `Browser Rendering - Edit`
  - `ACCOUNT_ID`: ダッシュボード URL の `/x/<ここ>` の部分

## セットアップ

1. 資格情報を用意する
   ```bash
   cp mcp/kitesurf/creds.env.example mcp/kitesurf/creds.env
   # mcp/kitesurf/creds.env に ACCOUNT_ID と TOKEN を記入
   ```
   - `creds.env` は `.gitignore` 除外対象（コミットしない）
2. 各ハーネスに MCP を追加（下）

## 使い方 — MCP

### Claude Code
```
claude mcp add kitesurf node -- "C:\Users\ru628\siren2345_tools\mcp\kitesurf\kitesurf-mcp.js"
```

### Cursor / Windsurf（settings.json）
```json
{
  "mcpServers": {
    "kitesurf": {
      "command": "node",
      "args": ["C:\\Users\\ru628\\siren2345_tools\\mcp\\kitesurf\\kitesurf-mcp.js"]
    }
  }
}
```

追加された `markdown` / `html` / `links` / `screenshot` ツールを使うだけ。

## 使い方 — shell

```bash
node mcp/kitesurf/kitesurf.js markdown  <URL> [--wait networkidle2] [--user-agent "..."]
node mcp/kitesurf/kitesurf.js content  <URL>
node mcp/kitesurf/kitesurf.js links    <URL>
node mcp/kitesurf/kitesurf.js screenshot <URL> --out shot.png [--wait networkidle2]
```

- `--wait` は JS で後から埋まる SPA で有効（`domcontentloaded` / `networkidle2` / `networkidle0`）
- 資格情報は環境変数 `CF_ACCOUNT_ID` / `CF_BROWSER_RUN_TOKEN`、もしくは `mcp/kitesurf/creds.env` を読む

## 制約（Cloudflare 公式・現状）

- **ステートレス & バースト向き**。長期認証セッション・TLS フィンガープリント系 bot 対策は不可
- **reCAPTCHA 等の bot 保護は突破できない**（Browser Run は常にボットとして識別）
  - 突破にはログイン済みクッキー渡し等が必要（それでもかかれる場合あり）
- 再生・WebGL は非対応（映像・3D は Chromium 側）

## リポジトリ構造

```
siren2345_tools/
└── mcp/
    └── kitesurf/
        ├── kitesurf.js        # shell ツール本体
        ├── kitesurf-mcp.js    # MCP サーバー（stdio）
        ├── kitesurf           # shell ラッパ
        ├── creds.env          # 実情報（gitignore 除外、未コミット）
        ├── creds.env.example  # 模板
        └── .gitignore
```

## 更新フロー

変更 → `git add -A` → `commit` → `push`。`main` は `origin/main` を追跡。
