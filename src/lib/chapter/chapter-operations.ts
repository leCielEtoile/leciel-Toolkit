import type { Chapter } from './parsers'

export function chaptersToString(chapters: Chapter[]): string {
  return chapters.map((c) => `${c.time} ${c.name}`).join('\n')
}

export function stringToChapters(str: string): Chapter[] {
  if (!str) return []
  return str
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      const match = line.match(/^(\d{2}:\d{2}:\d{2})\s+(.+)$/)
      return match ? [{ time: match[1], name: match[2] }] : []
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

export function secondsToTime(seconds: number): string {
  return [
    String(Math.floor(seconds / 3600)).padStart(2, '0'),
    String(Math.floor((seconds % 3600) / 60)).padStart(2, '0'),
    String(seconds % 60).padStart(2, '0'),
  ].join(':')
}

export function isValidTimeFormat(timeStr: string): boolean {
  return /^\d{2}:\d{2}:\d{2}$/.test(timeStr)
}
