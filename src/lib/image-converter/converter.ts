export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff'

export type JpegSubsample = 'auto' | '4:4:4' | '4:2:2' | '4:2:0'
export type TiffCompression = 'none' | 'lzw' | 'deflate' | 'jpeg'
export type ResizeMode = 'width' | 'height' | 'fit' | 'cover'

export interface ConvertOptions {
  format: OutputFormat

  // 共通品質 (JPEG/WebP/AVIF: 1–100)
  quality: number

  // PNG 専用
  pngCompression: number       // 0 (無圧縮) – 9 (最大圧縮)
  pngInterlace: boolean

  // JPEG 専用
  jpegProgressive: boolean
  jpegSubsample: JpegSubsample

  // WebP 専用
  webpLossless: boolean
  webpEffort: number           // 0 (速い) – 6 (高品質)

  // AVIF 専用
  avifLossless: boolean
  avifSpeed: number            // 0 (遅い/高品質) – 8 (速い/低品質)

  // TIFF 専用
  tiffCompression: TiffCompression

  // 共通
  stripMetadata: boolean

  // リサイズ
  resizeEnabled: boolean
  resizeMode: ResizeMode
  resizeWidth: number
  resizeHeight: number
}

export interface ConvertResult {
  blob: Blob
  filename: string
  sizeBytes: number
}

export const DEFAULT_OPTIONS: ConvertOptions = {
  format: 'webp',
  quality: 80,
  pngCompression: 6,
  pngInterlace: false,
  jpegProgressive: false,
  jpegSubsample: 'auto',
  webpLossless: false,
  webpEffort: 4,
  avifLossless: false,
  avifSpeed: 5,
  tiffCompression: 'lzw',
  stripMetadata: false,
  resizeEnabled: false,
  resizeMode: 'width',
  resizeWidth: 1920,
  resizeHeight: 1080,
}

let vipsInstance: any = null

export async function initVips(): Promise<void> {
  if (vipsInstance) return

  const Vips = (await import('wasm-vips')).default

  // COEP 回避: Worker URL を Blob URL に差し替える
  let capturedWorkerUrl = ''
  const OrigWorker = globalThis.Worker
  globalThis.Worker = function (url: string | URL, opts?: WorkerOptions): Worker {
    if (!capturedWorkerUrl) {
      capturedWorkerUrl = url instanceof URL ? url.href : String(url)
      throw new Error('__vips_capture__')
    }
    return new OrigWorker(url, opts)
  } as unknown as typeof Worker

  try {
    await Vips()
  } catch (e: any) {
    if (!e?.message?.includes('__vips_capture__')) {
      globalThis.Worker = OrigWorker
      throw e
    }
  } finally {
    globalThis.Worker = OrigWorker
  }

  if (!capturedWorkerUrl) throw new Error('Failed to capture vips worker URL')

  const workerText = await fetch(capturedWorkerUrl).then((r) => r.text())
  const blobUrl = URL.createObjectURL(new Blob([workerText], { type: 'application/javascript' }))

  try {
    vipsInstance = await Vips({ mainScriptUrlOrBlob: blobUrl })
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

export function isVipsReady(): boolean {
  return vipsInstance !== null
}

export async function convertImage(file: File, opts: ConvertOptions): Promise<ConvertResult> {
  if (!vipsInstance) throw new Error('wasm-vips が初期化されていません')

  const buffer = await file.arrayBuffer()
  const uint8 = new Uint8Array(buffer)

  let img = vipsInstance.Image.newFromBuffer(uint8)

  try {
    // ─── リサイズ ───────────────────────────────────────────
    if (opts.resizeEnabled) {
      const srcW: number = img.width
      const srcH: number = img.height

      let targetW: number | undefined
      let targetH: number | undefined

      if (opts.resizeMode === 'width') {
        targetW = opts.resizeWidth
      } else if (opts.resizeMode === 'height') {
        targetH = opts.resizeHeight
      } else if (opts.resizeMode === 'fit') {
        // アスペクト比を維持して両辺が指定サイズ以内に収まるよう縮小
        const scaleW = opts.resizeWidth / srcW
        const scaleH = opts.resizeHeight / srcH
        const scale = Math.min(scaleW, scaleH, 1)
        targetW = Math.round(srcW * scale)
        targetH = Math.round(srcH * scale)
      } else if (opts.resizeMode === 'cover') {
        // 両辺を指定サイズ以上にしてクロップ
        targetW = opts.resizeWidth
        targetH = opts.resizeHeight
      }

      if (opts.resizeMode === 'cover' && targetW && targetH) {
        img = vipsInstance.Image.thumbnailBuffer(uint8, targetW, {
          height: targetH,
          crop: vipsInstance.Interesting.centre,
        })
      } else if (targetW) {
        img = vipsInstance.Image.thumbnailBuffer(uint8, targetW, {
          height: targetH ?? 100000,
          crop: vipsInstance.Interesting.none,
        })
      }
    }

    // ─── メタデータ削除 ──────────────────────────────────────
    // strip オプションは各 saveBuffer に渡す

    const strip = opts.stripMetadata
    const q = Math.max(1, Math.min(100, opts.quality))

    // ─── フォーマット変換 ────────────────────────────────────
    let outBuffer: Uint8Array

    switch (opts.format) {
      case 'jpeg': {
        const subsampleMap: Record<JpegSubsample, number> = {
          auto: 0,
          '4:4:4': vipsInstance.ForeignJpegSubsample?.off ?? 1,
          '4:2:2': 2,
          '4:2:0': vipsInstance.ForeignJpegSubsample?.on ?? 0,
        }
        outBuffer = img.jpegsaveBuffer({
          Q: q,
          interlace: opts.jpegProgressive,
          strip,
          subsample_mode: subsampleMap[opts.jpegSubsample],
          optimize_coding: true,
        })
        break
      }
      case 'png': {
        outBuffer = img.pngsaveBuffer({
          compression: opts.pngCompression,
          interlace: opts.pngInterlace,
          strip,
        })
        break
      }
      case 'webp': {
        if (opts.webpLossless) {
          outBuffer = img.webpsaveBuffer({ lossless: true, effort: opts.webpEffort, strip })
        } else {
          outBuffer = img.webpsaveBuffer({ Q: q, effort: opts.webpEffort, strip })
        }
        break
      }
      case 'avif': {
        if (opts.avifLossless) {
          outBuffer = img.avifsaveBuffer({ lossless: true, speed: opts.avifSpeed, strip })
        } else {
          outBuffer = img.avifsaveBuffer({ Q: q, speed: opts.avifSpeed, strip })
        }
        break
      }
      case 'tiff': {
        const comprMap: Record<TiffCompression, number> = {
          none:    vipsInstance.ForeignTiffCompression?.none    ?? 1,
          lzw:     vipsInstance.ForeignTiffCompression?.lzw     ?? 5,
          deflate: vipsInstance.ForeignTiffCompression?.deflate ?? 6,
          jpeg:    vipsInstance.ForeignTiffCompression?.jpeg    ?? 2,
        }
        outBuffer = img.tiffsaveBuffer({ compression: comprMap[opts.tiffCompression], strip })
        break
      }
      default:
        throw new Error(`未対応のフォーマット: ${opts.format}`)
    }

    const mimeMap: Record<OutputFormat, string> = {
      jpeg: 'image/jpeg',
      png:  'image/png',
      webp: 'image/webp',
      avif: 'image/avif',
      tiff: 'image/tiff',
    }

    const blob = new Blob([outBuffer.buffer as ArrayBuffer], { type: mimeMap[opts.format] })
    const baseName = file.name.replace(/\.[^.]+$/, '')
    const ext = opts.format === 'jpeg' ? 'jpg' : opts.format
    const filename = `${baseName}.${ext}`

    return { blob, filename, sizeBytes: blob.size }
  } finally {
    img.delete()
  }
}
