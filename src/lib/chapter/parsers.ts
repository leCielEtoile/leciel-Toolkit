export interface Chapter {
  time: string
  name: string
}

export type FormatKey = 'davinci' | 'premiereedl' | 'premieretxt' | 'premierecsv'

export function detectFileFormat(content: string, filename = ''): FormatKey | null {
  if (!content || typeof content !== 'string') return null

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
  if (/\d{2}:\d{2}:\d{2}(:\d{2})?/.test(content) && /[,\t]/.test(content)) {
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
  if (lines[0] && (lines[0].includes('アセット名') || lines[0].includes('インポイント') || lines[0].includes('説明') || !lines[0].match(/\d{2}:\d{2}:\d{2}/))) {
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
      const timeMatch = parts[0].trim().match(/(\d{2}:\d{2}:\d{2})(:\d{2})?/)
      if (timeMatch) chapters.push({ time: timeMatch[1], name: parts[1].trim() })
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

    const timeMatch = fields[inPointIndex]?.trim().match(/(\d{2}):(\d{2}):(\d{2})(?::(\d{2}))?/)
    if (!timeMatch) continue

    const timeCode = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`
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

export function getFormatDisplayName(format: FormatKey | null): string {
  switch (format) {
    case 'davinci':      return 'DaVinci Resolve EDL'
    case 'premiereedl':  return 'Premiere Pro EDL'
    case 'premieretxt':  return 'Premiere Pro マーカーテキスト'
    case 'premierecsv':  return 'Premiere Pro マーカーCSV'
    default:             return '不明'
  }
}

export const PARSERS: Record<FormatKey, (content: string) => Chapter[]> = {
  davinci:     parseDaVinciEDL,
  premiereedl: parsePremiereEDL,
  premieretxt: parsePremiereTxtMarkers,
  premierecsv: parsePremiereCSVMarkers,
}
