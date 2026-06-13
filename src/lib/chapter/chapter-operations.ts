import type { Chapter } from './parsers'

export function chaptersToString(chapters: Chapter[]): string {
  return chapters.map((c) => `${c.time} ${c.name}`).join('\n')
}

// H:MM:SS / HH:MM:SS → HH:MM:SS、M:SS / MM:SS → 00:MM:SS に正規化。
// 不正な入力は null を返す。
export function normalizeTime(timeStr: string): string | null {
  const parts = timeStr.trim().split(':').map((p) => p.trim())
  if (parts.length === 3) {
    const [h, m, s] = parts.map(Number)
    if ([h, m, s].some(isNaN) || m >= 60 || s >= 60) return null
    return [String(h).padStart(2, '0'), String(m).padStart(2, '0'), String(s).padStart(2, '0')].join(':')
  }
  if (parts.length === 2) {
    const [m, s] = parts.map(Number)
    if ([m, s].some(isNaN) || s >= 60) return null
    return ['00', String(m).padStart(2, '0'), String(s).padStart(2, '0')].join(':')
  }
  return null
}

export function stringToChapters(str: string): Chapter[] {
  if (!str) return []
  return str
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      const match = line.match(/^(\d{1,2}(?::\d{2}){1,2})\s+(.+)$/)
      if (!match) return []
      const time = normalizeTime(match[1])
      return time ? [{ time, name: match[2] }] : []
    })
}

export function shiftChapterTimes(chapters: Chapter[], shiftBack = true): Chapter[] {
  return chapters.map((c) => {
    const [h, m, s] = c.time.split(':').map(Number)
    let total = h * 3600 + m * 60 + s
    total = shiftBack ? Math.max(total - 3600, 0) : total + 3600
    return {
      time: [
        String(Math.floor(total / 3600)).padStart(2, '0'),
        String(Math.floor((total % 3600) / 60)).padStart(2, '0'),
        String(total % 60).padStart(2, '0'),
      ].join(':'),
      name: c.name,
    }
  })
}

export function sortChaptersByTime(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((a, b) => timeToSeconds(a.time) - timeToSeconds(b.time))
}

export function formatChapters(chapters: Chapter[]): Chapter[] {
  const seen = new Set<string>()
  const unique = chapters.filter((c) => {
    if (seen.has(c.time)) return false
    seen.add(c.time)
    return true
  })
  return sortChaptersByTime(unique)
}

export function timeToSeconds(timeStr: string): number {
  const [h, m, s] = timeStr.split(':').map(Number)
  return h * 3600 + m * 60 + s
}

export function isValidTimeFormat(timeStr: string): boolean {
  return normalizeTime(timeStr) !== null
}
