# AI Context — leciel ToolKit

> Read this before touching any code. Covers everything needed to work without extra searches.
> For detailed per-tool specs, see [docs/TOOLS.md](TOOLS.md).

## What This Is
Static browser-only tool collection. No server-side processing. All tools run 100% in-browser.
- Live: https://tool.leciel.site
- Deploy: push to `main` → Cloudflare Pages auto-deploys

## Stack
| Layer | Tech |
|---|---|
| Framework | Astro 5 (static output) |
| UI components | Svelte 5 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| Language | TypeScript (strict) |
| Package manager | pnpm |
| Hosting | Cloudflare Pages |

Key libraries: `pdf-lib`, `pdfjs-dist`, `wasm-vips` (image conversion via WASM), `tesseract.js` (OCR via WASM), `jszip` (ZIP archive generation)

## Directory Map
```
src/
  pages/
    index.astro                  # Home — tool card list
    tools/
      pdf-editor/index.astro
      pdf-to-image/index.astro
      image-converter/index.astro
      metadata-remover/index.astro
      qr-reader/index.astro
      chapter-converter/index.astro
      ocr/index.astro
  components/                    # Svelte UI components (one per tool + shared)
    Header.svelte
    Toast.svelte
    FileDropZone.svelte
    DarkModeToggle.svelte
    PdfEditor.svelte
    PdfPreviewModal.svelte
    PdfSplitModal.svelte
    PdfToImage.svelte
    ImageConverter.svelte
    MetadataRemover.svelte
    QrReader.svelte
    ChapterConverter.svelte
    OcrTool.svelte
    ToolInfo.astro               # Shared tool description block
  layouts/
    ToolLayout.astro             # Shared layout for all tool pages
  lib/                           # Business logic (no UI)
    utils.ts                     # formatSize(), triggerDownload()
    toast.svelte.ts              # Svelte toast state store
    pdf/
      pdf-engine.ts              # pdf-lib operations (merge, split, rotate, delete)
      pdf-renderer.ts            # pdfjs-dist rendering / thumbnails
      pdf-to-image.ts            # Canvas-based PDF→image conversion + ZIP packaging
    image-converter/
      converter.ts               # wasm-vips image format conversion
    ocr/
      ocr-engine.ts              # tesseract.js Worker management / OCR logic
    metadata/
      client-processor.ts        # EXIF/IPTC/XMP strip logic
    chapter/
      parsers.ts                 # EDL / CSV / TXT marker parsers
      chapter-operations.ts      # Chapter list mutations
  styles/
    global.css                   # CSS variables (design tokens), dark mode
public/                          # Static assets
astro.config.ts                  # Vite plugins: wasm, tailwind, COEP/COOP headers, copy bcmap files
```

## Tools Summary
| Route | Component | Key libs |
|---|---|---|
| `/tools/pdf-editor` | `PdfEditor.svelte` | pdf-lib, pdfjs-dist |
| `/tools/pdf-to-image` | `PdfToImage.svelte` | pdfjs-dist, Canvas API, jszip |
| `/tools/image-converter` | `ImageConverter.svelte` | wasm-vips (WASM, needs COEP/COOP) |
| `/tools/metadata-remover` | `MetadataRemover.svelte` | Canvas API |
| `/tools/qr-reader` | `QrReader.svelte` | Camera API, Canvas |
| `/tools/chapter-converter` | `ChapterConverter.svelte` | Custom parsers |
| `/tools/ocr` | `OcrTool.svelte` | tesseract.js (WASM) |

## Architecture Patterns
- **Pages** = thin shells; mount a single Svelte component with `client:load`
- **Components** = UI state only; delegate logic to `src/lib/`
- **lib/** = pure TS, no Svelte imports; testable in isolation
- **Toast** = global Svelte store in `toast.svelte.ts`, imported by components
- **Dark mode** = CSS class on `<html>`, toggled via `DarkModeToggle.svelte`, persisted to `localStorage`

## Special Build Concerns
- `wasm-vips` needs `Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Opener-Policy: same-origin` — scoped to `/tools/image-converter` via `_headers` (prod) and Vite middleware (dev)
- `pdfjs-dist` bcmap files are copied to `/_astro/cmaps/` by a custom Vite plugin in `astro.config.ts`
- `wasm-vips` companion WASM files (`vips-jxl.wasm`, `vips-heif.wasm`) are similarly copied to `/_astro/`

## CSS Design Tokens
All colors/spacing via CSS variables defined in `src/styles/global.css`.
Key vars: `--color-primary`, `--background`, `--surface-container`, `--text`, `--text-muted`, `--outline-variant`, `--elev-1..3`
