import { PDFDocument, degrees } from 'pdf-lib'

export interface SourcePdf {
  id: string
  bytes: Uint8Array
}

export interface PageDescriptor {
  id: number           // UI キー（ユニーク）
  sourceId: string     // ソースPDFのID
  srcIndex: number     // ソース内ページ番号（0始まり）
  rotation: number     // 追加回転（0 / 90 / 180 / 270）
}

/** PDF バイト列を読み込んでページ数を返す */
export async function getPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return doc.getPageCount()
}

/**
 * 現在の pages 定義に従って PDF を構築し Uint8Array を返す。
 * 削除・並び替え・回転をすべて反映する。
 */
export async function buildPdf(
  sources: Map<string, SourcePdf>,
  pages: PageDescriptor[],
): Promise<Uint8Array> {
  const outDoc = await PDFDocument.create()

  // ソースごとにまとめてコピーするためにキャッシュ
  const docCache = new Map<string, PDFDocument>()

  for (const p of pages) {
    let srcDoc = docCache.get(p.sourceId)
    if (!srcDoc) {
      const src = sources.get(p.sourceId)
      if (!src) throw new Error(`Source not found: ${p.sourceId}`)
      srcDoc = await PDFDocument.load(src.bytes, { ignoreEncryption: true })
      docCache.set(p.sourceId, srcDoc)
    }
    const [copied] = await outDoc.copyPages(srcDoc, [p.srcIndex])
    // 元ページの回転 + 追加回転
    const origRotation = copied.getRotation().angle
    copied.setRotation(degrees((origRotation + p.rotation) % 360))
    outDoc.addPage(copied)
  }

  return outDoc.save()
}

/**
 * splitAt 番目（0始まり）でページを分割し [前半, 後半] を返す。
 * splitAt はページ数（例: 3 なら 0–2 / 3– に分割）。
 */
export async function splitPdf(
  sources: Map<string, SourcePdf>,
  pages: PageDescriptor[],
  splitAt: number,
): Promise<[Uint8Array, Uint8Array]> {
  const first  = await buildPdf(sources, pages.slice(0, splitAt))
  const second = await buildPdf(sources, pages.slice(splitAt))
  return [first, second]
}

/** Uint8Array をブラウザでダウンロードさせる */
export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
