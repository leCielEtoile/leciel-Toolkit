import { normalizeTime } from './chapter-operations'

export interface Chapter {
  time: string
  name: string
}

export type FormatKey = 'davinci' | 'premiereedl' | 'premieretxt' | 'premierecsv' | 'plain'

// H:MM:SS / HH:MM:SS / M:SS / MM:SS（末尾のフレーム :FF は許容して無視）
const FLEX_TIME = /(?<!\d)(\d{1,2}(?::\d{2}){1,3})(?!\d)/

function extractTime(text: string): string | null {
  const m = text.match(FLEX_TIME)
  if (!m) return null
  const parts = m[1].split(':')
  // 4要素 (HH:MM:SS:FF) はフレームを除去
  return normalizeTime(parts.slice(0, 3).join(':'))
}

export function detectFileFormat(content: string, filename = ''): FormatKey | null {
  if (!content || typeof content !== 'string') return null

  // 先頭行が「時刻 タイトル」形式（拡張子より優先）
  if (/^\s*\uFEFF?\d{1,2}(?::\d{2}){1,2}\s+\S/.test(content)) return 'plain'

  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext === 'csv') return 'premierecsv'
    if (ext === 'txt') return 'premieretxt'
  }

  if (content.includes('|M:')) return 'davinci'
  if (content.includes('* FROM CLIP NAME:')) return 'premiereedl'
  if (
    (content.includes('アセット名') && content.includes('インポイント') && content.includes('説明')) ||
    (content.includes('シーケンス') && /\d{2}:\d{2}:\d{2}:\d{2}/.test(content) && /\t/.test(content))
  ) return 'premieretxt'
  if (/^\s*\uFEFF?マーカー/.test(content) || /^\s*\uFEFF?Marker/.test(content) || /^\s*\uFEFF?(Name|名前)/.test(content)) return 'premierecsv'
  if (FLEX_TIME.test(content) && /[,\t]/.test(content)) {
    return content.includes(',') ? 'premierecsv' : 'premieretxt'
  }

  return null
}

export function parseDaVinciEDL(content: string): Chapter[] {
  if (!content) return []

  const lines = content.split(/\r?\n/)
  const chapters: Chapter[] = []
  let lastTime: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const timeMatch = lines[i].match(/(\d{2}:\d{2}:\d{2}):\d{2}/)
    if (timeMatch) lastTime = timeMatch[1]

    if (lastTime && i + 1 < lines.length) {
      const chapterMatch = lines[i + 1].match(/\|M:(.+?)\|D:/)
      if (chapterMatch) {
        chapters.push({ time: lastTime, name: chapterMatch[1].trim() })
        lastTime = null
        i++
      }
    }
  }

  return chapters
}

export function parsePremiereEDL(content: string): Chapter[] {
  if (!content) return []

  const lines = content.split(/\r?\n/)
  const chapters: Chapter[] = []
  let lastTime: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const timeMatch = lines[i].match(/(\d{2}:\d{2}:\d{2}):\d{2}/)
    if (timeMatch) lastTime = timeMatch[1]

    if (lastTime && i + 1 < lines.length) {
      const chapterMatch = lines[i + 1].match(/\* FROM CLIP NAME:\s*(.+)/)
      if (chapterMatch) {
        chapters.push({ time: lastTime, name: chapterMatch[1].trim() })
        lastTime = null
        i++
      }
    }
  }

  return chapters
}

export function parsePremiereTxtMarkers(content: string): Chapter[] {
  if (!content) return []

  const lines = content.split(/\r?\n/)
  const chapters: Chapter[] = []

  let startIndex = 0
  if (lines[0] && (lines[0].includes('アセット名') || lines[0].includes('インポイント') || lines[0].includes('説明') || !FLEX_TIME.test(lines[0]))) {
    startIndex = 1
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const parts = line.split(/\t+/)
    if (parts.length >= 3) {
      const timeMatch = parts[1].trim().match(/(\d{2}:\d{2}:\d{2}):\d{2}/)
      if (timeMatch) chapters.push({ time: timeMatch[1], name: parts[2].trim() })
    } else if (parts.length === 2) {
      const time = extractTime(parts[0].trim())
      if (time) chapters.push({ time, name: parts[1].trim() })
    }
  }

  return chapters
}

export function parsePremiereCSVMarkers(content: string): Chapter[] {
  if (!content) return []

  content = content.replace(/^\uFEFF|\uFFFE/, '').replace(/[\u00DE\u00FC\u00AB\u00FE\u00FF]/g, '')

  const lines = content.split(/\r?\n/)
  const chapters: Chapter[] = []
  if (lines.length <= 1) return chapters

  const headers = lines[0].split(/\t|,/)
  let markerNameIndex = -1
  let descriptionIndex = -1
  let inPointIndex = -1

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim().toLowerCase()
    if (h.includes('マーカー名') || h.includes('name') || h.includes('名前')) markerNameIndex = i
    else if (h.includes('説明') || h.includes('コメント') || h.includes('description') || h.includes('comment')) descriptionIndex = i
    else if (h.includes('イン') || h.includes('インポイント') || h.includes('in') || h.includes('start')) inPointIndex = i
  }

  if (inPointIndex === -1) inPointIndex = 2

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = line.split(/\t|,/)
    if (fields.length <= inPointIndex) continue

    const timeCode = extractTime(fields[inPointIndex]?.trim() ?? '')
    if (!timeCode) continue
    let title = ''

    if (markerNameIndex >= 0 && fields[markerNameIndex]?.trim()) {
      title = fields[markerNameIndex].trim()
    } else if (descriptionIndex >= 0 && fields[descriptionIndex]?.trim()) {
      title = fields[descriptionIndex].trim()
    }

    if (!title) title = `マーカー ${chapters.length + 1}`
    chapters.push({ time: timeCode, name: title })
  }

  return chapters
}

// 「時刻 タイトル」の1行1チャプター形式（YouTube チャプターと同形式）
export function parsePlainChapters(content: string): Chapter[] {
  if (!content) return []
  return content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .flatMap((line) => {
      const m = line.trim().match(/^(\d{1,2}(?::\d{2}){1,2})\s+(.+)$/)
      const time = m ? normalizeTime(m[1]) : null
      return m && time ? [{ time, name: m[2].trim() }] : []
    })
}

export function getFormatDisplayName(format: FormatKey | null): string {
  switch (format) {
    case 'davinci':      return 'DaVinci Resolve EDL'
    case 'premiereedl':  return 'Premiere Pro EDL'
    case 'premieretxt':  return 'Premiere Pro マーカーテキスト'
    case 'premierecsv':  return 'Premiere Pro マーカーCSV'
    case 'plain':        return '時刻 + タイトル形式'
    default:             return '不明'
  }
}

export const PARSERS: Record<FormatKey, (content: string) => Chapter[]> = {
  davinci:     parseDaVinciEDL,
  premiereedl: parsePremiereEDL,
  premieretxt: parsePremiereTxtMarkers,
  premierecsv: parsePremiereCSVMarkers,
  plain:       parsePlainChapters,
}
