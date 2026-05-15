import type { PDFDocumentProxy } from 'pdfjs-dist'

let pdfjs: typeof import('pdfjs-dist') | null = null

export async function initRenderer(): Promise<void> {
  if (typeof window === 'undefined') return   // SSR/Node.js ガード
  if (pdfjs) return
  pdfjs = await import('pdfjs-dist')

  // Vite の ?url インポートで worker を Blob URL 化して COEP 制約を回避
  const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  const workerUrl  = workerMod.default as string

  // 同一オリジン経由で取得し BlobURL に変換（CDN 依存なし）
  try {
    const text    = await fetch(workerUrl).then(r => r.text())
    const blob    = new Blob([text], { type: 'application/javascript' })
    pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob)
  } catch {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  }
}

/** PDF バイト列から PDFDocumentProxy を取得 */
export async function openDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  if (!pdfjs) await initRenderer()
  // slice() でコピーを渡す。pdfjs は ArrayBuffer を worker に転送（detach）するため
  // 呼び出し元の Uint8Array が無効化されないようにする。
  return pdfjs!.getDocument({
    data: bytes.slice(),
    cMapUrl: '/_astro/cmaps/',
    cMapPacked: true,
  }).promise
}

/**
 * 指定ページを canvas に描画し DataURL を返す。
 * @param doc   openDocument() で得た PDFDocumentProxy
 * @param pageIndex 0 始まりページ番号
 * @param targetWidth レンダリング幅 px（高さはアスペクト比に従う）
 */
export async function renderPageToDataUrl(
  doc: PDFDocumentProxy,
  pageIndex: number,
  targetWidth = 400,
): Promise<string> {
  const page     = await doc.getPage(pageIndex + 1)       // pdfjs は 1 始まり
  const viewport = page.getViewport({ scale: 1 })
  const scale    = targetWidth / viewport.width
  const scaled   = page.getViewport({ scale })

  const canvas    = document.createElement('canvas')
  canvas.width    = Math.round(scaled.width)
  canvas.height   = Math.round(scaled.height)
  const ctx       = canvas.getContext('2d')!

  await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise
  page.cleanup()

  return canvas.toDataURL('image/jpeg', 0.85)
}
