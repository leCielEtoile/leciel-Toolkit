import { createWorker } from 'tesseract.js'
import type Tesseract from 'tesseract.js'

// ─── 公開インターフェース ──────────────────────────────────────

export interface OcrResult {
  text: string
  confidence: number  // 0–100
}

export interface ProgressInfo {
  status: string
  progress: number  // 0–100
}

export type ProgressCallback = (info: ProgressInfo) => void

// ─── Worker キャッシュ ─────────────────────────────────────────
// 同一言語セットでの連続認識を高速化するためシングルトンで保持。
// 言語が変わったときだけ再生成する。

let cachedWorker: Tesseract.Worker | null = null
let cachedLangKey = ''

// ─── ステータス日本語マッピング ────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  'loading tesseract core':  'Tesseract エンジンを読み込み中…',
  'loading language traineddata': '言語データを取得中…',
  'initializing tesseract':  'Tesseract を初期化中…',
  'initializing api':        'API を初期化中…',
  'recognizing text':        'テキストを認識中…',
}

function toLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

// ─── Worker 取得（キャッシュ or 新規生成） ─────────────────────

async function getWorker(
  langs: string[],
  onProgress: ProgressCallback,
): Promise<Tesseract.Worker> {
  const langKey = [...langs].sort().join('+')

  if (cachedWorker && cachedLangKey === langKey) {
    return cachedWorker
  }

  // 言語が変わった場合は古い Worker を破棄
  if (cachedWorker) {
    await cachedWorker.terminate()
    cachedWorker = null
    cachedLangKey = ''
  }

  // createWorker の workerRes promise は 'load' 以外のステップ失敗時に
  // pending のまま残る設計のため、errorHandler で wrapper Promise に繋ぐ
  const worker = await new Promise<Tesseract.Worker>((resolve, reject) => {
    createWorker(langs, undefined, {
      logger: (m: Tesseract.LoggerMessage) => {
        onProgress({
          status: toLabel(m.status),
          progress: Math.round(m.progress * 100),
        })
      },
      errorHandler: (err: unknown) => {
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    }).then(resolve).catch(reject)
  })

  cachedWorker = worker
  cachedLangKey = langKey
  return worker
}

// ─── OCR 実行 ─────────────────────────────────────────────────

export async function recognize(
  image: File | Blob,
  langs: string[],
  onProgress: ProgressCallback,
): Promise<OcrResult> {
  // Svelte 5 の $state は配列を Proxy でラップするため、
  // postMessage でシリアライズできなくなる。スプレッドで生配列に変換する。
  const rawLangs = [...langs]
  if (rawLangs.length === 0) throw new Error('言語を1つ以上選択してください')

  const worker = await getWorker(rawLangs, onProgress)

  onProgress({ status: 'テキストを認識中…', progress: 0 })

  const { data } = await worker.recognize(image)

  return {
    text: data.text.trim(),
    confidence: Math.round(data.confidence),
  }
}

// ─── Worker 解放 ───────────────────────────────────────────────

export async function disposeWorker(): Promise<void> {
  if (cachedWorker) {
    await cachedWorker.terminate()
    cachedWorker = null
    cachedLangKey = ''
  }
}
