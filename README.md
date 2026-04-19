# leciel ToolKit

ブラウザ上で動作するウェブツール集。すべての処理はクライアントサイドで完結し、サーバーへのデータ送信は行いません。

**サイト:** https://tool.leciel.site

## ツール一覧

[docs/TOOLS.md](docs/TOOLS.md) を参照してください。

## 技術スタック

| 項目 | 内容 |
|---|---|
| フレームワーク | Astro 5 (static output) |
| UIコンポーネント | Svelte 5 |
| スタイリング | Tailwind CSS v4 |
| 言語 | TypeScript |
| パッケージマネージャー | pnpm |
| ホスティング | Cloudflare Pages |

主要ライブラリ: `pdf-lib`, `pdfjs-dist`, `wasm-vips`

## ローカル開発

```bash
pnpm install
pnpm dev
```

## デプロイ

`main` ブランチへのプッシュで Cloudflare Pages に自動デプロイされます。

## プライバシー

- すべての処理はブラウザ内で実行
- ファイルはサーバーにアップロードされない
- `localStorage` にはダークモード設定のみ保存

## ライセンス

[MIT](LICENSE)
