import type { Chapter } from './parsers'

// テキスト出力時の時刻形式。内部の時刻は常に HH:MM:SS。
//   hms:     HH:MM:SS 固定（00:03:45）
//   short:   自動短縮。1時間未満は M:SS、1時間以上は H:MM:SS（3:45 / 1:02:30）
//   aligned: 自動短縮しつつ、最長の行に桁数を揃える（03:45 / 0:03:45 など）
export type TimeFormat = 'hms' | 'short' | 'aligned'

export const TIME_FORMAT_LABELS: Record<TimeFormat, string> = {
  hms: 'HH:MM:SS 固定',
  short: '自動短縮',
  aligned: '自動短縮（最長に桁数を揃える）',
}

function toParts(time: string): [number, number, number] | null {
  const parts = time.split(':').map(Number)
  return parts.length === 3 && !parts.some(isNaN) ? [parts[0], parts[1], parts[2]] : null
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export function toShortTime(time: string): string {
  const p = toParts(time)
  if (!p) return time
  const [h, m, s] = p
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`
}

export function chaptersToString(chapters: Chapter[], format: TimeFormat = 'hms'): string {
  if (format === 'hms') return chapters.map((c) => `${c.time} ${c.name}`).join('\n')
  if (format === 'short') return chapters.map((c) => `${toShortTime(c.time)} ${c.name}`).join('\n')

  // aligned: 最長の行に合わせる。時間あり→ H:MM:SS（時は最大桁に0埋め）、なし→ 分が2桁ある場合 MM:SS、なければ M:SS
  const all = chapters.map((c) => toParts(c.time))
  const valid = all.filter((p): p is [number, number, number] => p !== null)
  const maxH = Math.max(0, ...valid.map((p) => p[0]))
  const maxM = Math.max(0, ...valid.map((p) => p[1]))
  const hDigits = String(maxH).length
  return chapters
    .map((c, i) => {
      const p = all[i]
      if (!p) return `${c.time} ${c.name}`
      const [h, m, s] = p
      const time = maxH > 0
        ? `${String(h).padStart(hDigits, '0')}:${pad2(m)}:${pad2(s)}`
        : `${maxM >= 10 ? pad2(m) : String(m)}:${pad2(s)}`
      return `${time} ${c.name}`
    })
    .join('\n')
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
