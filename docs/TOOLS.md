# ツール一覧

leciel ToolKit に含まれるツールの一覧です。

---

## PDF編集ツール

**URL:** `/tools/pdf-editor`

PDFのページ閲覧・並び替え・削除・回転・結合・分割を行います。

**機能:**
- ページサムネイル一覧表示
- ドラッグ&ドロップによるページ並び替え
- ページ単位の削除・回転（90° / 180° / 270°）
- 複数PDFの結合
- ページ範囲指定による分割
- 処理済みPDFのダウンロード

**使用ライブラリ:** `pdf-lib`（生成）、`pdfjs-dist`（レンダリング・サムネイル）

---

## 画像変換ツール

**URL:** `/tools/image-converter`

複数フォーマット間で画像を変換します。

**対応フォーマット:** JPEG / PNG / WebP / AVIF / JXL / HEIF

**機能:**
- ドラッグ&ドロップ対応
- 複数ファイルの一括変換
- 品質・リサイズ設定
- 変換後ファイルのダウンロード

**使用ライブラリ:** `wasm-vips`（WebAssembly）

**注意:** SharedArrayBuffer を要求するため、`Cross-Origin-Embedder-Policy: require-corp` / `Cross-Origin-Opener-Policy: same-origin` ヘッダーが必要。本番は `_headers` ファイル、開発時は Vite ミドルウェアで対応済み。

---

## 画像メタデータ削除ツール

**URL:** `/tools/metadata-remover`

PNG・JPEG画像から EXIF・IPTC・XMP・ICC などのメタデータを完全に削除します。

**削除対象メタデータ:**
- GPS位置情報
- 撮影日時・カメラ設定（EXIF）
- 著作権・編集履歴（XMP）
- 作者・キャプション（IPTC）
- カラープロファイル（ICC）

**機能:**
- PNG / JPEG 対応
- プレビュー表示
- ワンクリックで処理 & ダウンロード

**使用API:** Canvas API（ブラウザ標準）

---

## QRコード読み取りツール

**URL:** `/tools/qr-reader`

カメラまたは画像ファイルからQRコードを読み取ります。

**機能:**
- カメラでリアルタイムスキャン
- 画像ファイルから読み取り（PNG / JPEG / WebP 等）
- 結果のクリップボードコピー

**使用API:** Camera API、Canvas API（ブラウザ標準）

---

## YouTubeチャプター変換ツール

**URL:** `/tools/chapter-converter`

Premiere Pro・DaVinci Resolve のマーカーを YouTube チャプター形式（タイムスタンプ）に変換します。

**対応入力フォーマット:**
- DaVinci Resolve EDL（マーカー付き）
- Premiere Pro EDL（マーカー付き）
- Premiere Pro マーカーテキスト（`.txt` 書き出し）
- Premiere Pro マーカーCSV（`.csv` 書き出し）

**機能:**
- ドラッグ&ドロップ / テキスト直接貼り付け
- 時間補正（00:00:00 開始に自動調整）
- チャプター編集（追加・編集・削除）
- 重複削除・時間順ソート
- ダウンロード・クリップボードコピー
