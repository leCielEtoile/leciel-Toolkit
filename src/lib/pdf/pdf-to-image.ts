import JSZip from 'jszip'
import { openDocument } from './pdf-renderer'
import { triggerDownload } from '../utils'
import type { PDFDocumentProxy } from 'pdfjs-dist'

export type OutputMode = 'split' | 'merge'
export type MergeDirection = 'vertical' | 'horizontal'
export type ImageFormat = 'png' | 'jpeg' | 'webp'

export interface ConvertOptions {
  mode: OutputMode
  direction: MergeDirection
  pageRange: { start: number; end: number } | null  // null = 全ページ
  format: ImageFormat
  quality: number        // 0.01〜1.0
  targetWidth: number    // ページ幅 px（解像度制御）
  background: string     // '#ffffff' | 'transparent'
  gap: number            // ページ間余白 px（merge時）
  padding: number        // 外側パディング px（merge時）
}

export interface ConvertProgress {
  current: number
  total: number
}

const MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/** PDFの1ページをCanvasにレンダリングして返す */
async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageIndex: number,
  targetWidth: number,
  background: string,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale: 1 })
  const scale = targetWidth / viewport.width
  const scaled = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(scaled.width)
  canvas.height = Math.round(scaled.height)
  const ctx = canvas.getContext('2d')!

  if (background !== 'transparent') {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise
  page.cleanup()

  return canvas
}

/** CanvasをBlobに変換 */
function canvasToBlob(canvas: HTMLCanvasElement, format: ImageFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas to Blob conversion failed'))
      },
      MIME[format],
      quality,
    )
  })
}

/** 複数Canvasを1枚に結合 */
function mergeCanvases(
  canvases: HTMLCanvasElement[],
  direction: MergeDirection,
  gap: number,
  padding: number,
  background: string,
): HTMLCanvasElement {
  if (canvases.length === 0) throw new Error('No canvases to merge')

  let totalWidth: number
  let totalHeight: number

  if (direction === 'vertical') {
    totalWidth = Math.max(...canvases.map(c => c.width)) + padding * 2
    totalHeight = canvases.reduce((sum, c) => sum + c.height, 0)
      + gap * (canvases.length - 1)
      + padding * 2
  } else {
    totalWidth = canvases.reduce((sum, c) => sum + c.width, 0)
      + gap * (canvases.length - 1)
      + padding * 2
    totalHeight = Math.max(...canvases.map(c => c.height)) + padding * 2
  }

  const master = document.createElement('canvas')
  master.width = totalWidth
  master.height = totalHeight
  const ctx = master.getContext('2d')!

  if (background !== 'transparent') {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, totalWidth, totalHeight)
  }

  let offset = padding
  for (const canvas of canvases) {
    if (direction === 'vertical') {
      const x = padding + Math.round((totalWidth - padding * 2 - canvas.width) / 2)
      ctx.drawImage(canvas, x, offset)
      offset += canvas.height + gap
    } else {
      const y = padding + Math.round((totalHeight - padding * 2 - canvas.height) / 2)
      ctx.drawImage(canvas, offset, y)
      offset += canvas.width + gap
    }
  }

  return master
}

/**
 * PDFバイト列を画像に変換してダウンロードする。
 * @param bytes     PDF バイト列
 * @param baseName  ダウンロードファイルのベース名（拡張子なし）
 * @param options   変換設定
 * @param onProgress 進捗コールバック
 */
export async function convertPdfToImages(
  bytes: Uint8Array,
  baseName: string,
  options: ConvertOptions,
  onProgress?: (p: ConvertProgress) => void,
): Promise<void> {
  const doc = await openDocument(bytes)
  const totalPages = doc.numPages

  const { start, end } = options.pageRange
    ? { start: options.pageRange.start - 1, end: options.pageRange.end - 1 }
    : { start: 0, end: totalPages - 1 }

  const targetPages: number[] = []
  for (let i = start; i <= Math.min(end, totalPages - 1); i++) {
    targetPages.push(i)
  }

  const ext = options.format

  if (options.mode === 'split') {
    if (targetPages.length === 1) {
      onProgress?.({ current: 0, total: 1 })
      const canvas = await renderPageToCanvas(doc, targetPages[0], options.targetWidth, options.background)
      const blob = await canvasToBlob(canvas, options.format, options.quality)
      onProgress?.({ current: 1, total: 1 })
      triggerDownload(blob, `${baseName}_p${targetPages[0] + 1}.${ext}`)
    } else {
      const zip = new JSZip()
      for (let i = 0; i < targetPages.length; i++) {
        onProgress?.({ current: i, total: targetPages.length })
        const pageIdx = targetPages[i]
        const canvas = await renderPageToCanvas(doc, pageIdx, options.targetWidth, options.background)
        const blob = await canvasToBlob(canvas, options.format, options.quality)
        const num = String(pageIdx + 1).padStart(3, '0')
        zip.file(`${baseName}_p${num}.${ext}`, blob)
      }
      onProgress?.({ current: targetPages.length, total: targetPages.length })
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      triggerDownload(zipBlob, `${baseName}_images.zip`)
    }
  } else {
    const canvases: HTMLCanvasElement[] = []
    for (let i = 0; i < targetPages.length; i++) {
      onProgress?.({ current: i, total: targetPages.length })
      const canvas = await renderPageToCanvas(doc, targetPages[i], options.targetWidth, options.background)
      canvases.push(canvas)
    }
    const merged = mergeCanvases(canvases, options.direction, options.gap, options.padding, options.background)
    const blob = await canvasToBlob(merged, options.format, options.quality)
    onProgress?.({ current: targetPages.length, total: targetPages.length })
    triggerDownload(blob, `${baseName}_merged.${ext}`)
  }
}
