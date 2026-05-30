import type { Chapter } from './parsers'

function timeToMs(time: string): number {
  const [h, m, s] = time.split(':').map(Number)
  return (h * 3600 + m * 60 + s) * 1000
}

export function chaptersToFfmetadata(chapters: Chapter[]): string {
  const lines: string[] = [';FFMETADATA1']

  for (let i = 0; i < chapters.length; i++) {
    const start = timeToMs(chapters[i].time)
    const end = i + 1 < chapters.length ? timeToMs(chapters[i + 1].time) : start + 1000

    lines.push('')
    lines.push('[CHAPTER]')
    lines.push('TIMEBASE=1/1000')
    lines.push(`START=${start}`)
    lines.push(`END=${end}`)
    lines.push(`title=${chapters[i].name}`)
  }

  return lines.join('\n')
}

export function chaptersToMkvXml(chapters: Chapter[]): string {
  const atoms = chapters.map((c) => {
    const time = `${c.time}.000000000`
    const name = c.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return [
      '    <ChapterAtom>',
      `      <ChapterTimeStart>${time}</ChapterTimeStart>`,
      '      <ChapterDisplay>',
      `        <ChapterString>${name}</ChapterString>`,
      '        <ChapterLanguage>und</ChapterLanguage>',
      '      </ChapterDisplay>',
      '    </ChapterAtom>',
    ].join('\n')
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Chapters>',
    '  <EditionEntry>',
    atoms.join('\n'),
    '  </EditionEntry>',
    '</Chapters>',
  ].join('\n')
}
