// Pure readers for the files the teach skill keeps in ~/.claude/teacher/<slug>/.
// The learner can edit those files, so everything here is parsed as data and
// a line that doesn't fit is skipped.

import type { Board } from '../types'

const DAY = 86_400_000

// §1 of the skill: lowercase, [a-z0-9-] only, dashes collapsed, 60 chars.
export const slug = (topic: string) =>
  topic
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '')

// A local calendar day as YYYY-MM-DD.
export const dayOf = (ms: number) => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY)

// Consecutive days ending today, or yesterday if today has none yet.
export const streak = (days: readonly string[], today: string) => {
  const have = new Set(days.map(dayNumber))
  let cursor = dayNumber(today)
  if (!have.has(cursor)) cursor -= 1
  let count = 0
  while (have.has(cursor)) {
    count += 1
    cursor -= 1
  }
  return count
}

const BARS = '▁▂▃▄▅▆▇█'

// One bar per score in 0..1.
export const sparkline = (scores: readonly number[]) =>
  scores.map(s => BARS[Math.min(BARS.length - 1, Math.max(0, Math.round(s * (BARS.length - 1))))]).join('')

const sections = (text: string) => {
  const out = new Map<string, string[]>()
  let current = ''
  for (const line of text.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)
    if (heading?.[1]) {
      current = heading[1].toLowerCase()
      out.set(current, [])
    } else if (/^\s*-\s+/.test(line)) {
      out.get(current)?.push(line.replace(/^\s*-\s+/, '').trim())
    }
  }
  return out
}

const field = (text: string, name: string) =>
  new RegExp(`^-\\s*${name}:\\s*(.+)$`, 'mi').exec(text)?.[1]?.trim()

export const parseProgress = (text: string) => {
  const parts = sections(text)
  const covered = (parts.get('covered') ?? []).flatMap(line => {
    const m = /^(.+?):\s*(solid|shaky)\b/i.exec(line)
    return m?.[1] && m[2] ? [{ item: m[1].trim(), state: m[2].toLowerCase() as 'solid' | 'shaky' }] : []
  })
  const quizzes = (parts.get('quizzes') ?? []).flatMap(line => {
    // The score follows the date's colon: `2026-10-12: 4/5, missed: ...`.
    const m = /:\s*(\d+)\s*\/\s*(\d+)/.exec(line)
    const got = Number(m?.[1])
    const total = Number(m?.[2])
    return total > 0 && got <= total ? [got / total] : []
  })
  const homework = (parts.get('homework') ?? []).filter(line => /^hw-\d+:/i.test(line))
  const open = homework.filter(line => /^hw-\d+:\s*assigned\b/i.test(line)).length
  return {
    title: /^#\s+(.+?)\s*$/m.exec(text)?.[1] ?? '',
    goal: field(text, 'goal') ?? '',
    level: field(text, 'level') ?? '',
    solid: covered.filter(c => c.state === 'solid').length,
    shaky: covered.filter(c => c.state === 'shaky').map(c => c.item),
    quizzes,
    homeworkWaiting: open,
    next: (parts.get('next') ?? []).slice(0, 3),
  }
}

export const parseDeck = (text: string, today: string) => {
  const boxes = [0, 0, 0, 0, 0]
  let due = 0
  for (const card of text.split(/^###\s+/m).slice(1)) {
    const box = Number(field(card, 'box'))
    if (!(box >= 1 && box <= 5)) continue
    boxes[box - 1] = (boxes[box - 1] ?? 0) + 1
    // No date (an older deck) or `now` is due; an unreadable date is not.
    const when = field(card, 'due')
    if (!when || when === 'now' || (/^\d{4}-\d{2}-\d{2}$/.test(when) && when <= today)) due += 1
  }
  return { boxes, due }
}

// `- YYYY-MM-DD · <item> · <misconception> → <fix>`, newest last.
export const parseMistakes = (text: string) =>
  text
    .split('\n')
    .filter(line => /^-\s*\d{4}-\d{2}-\d{2}\s*·/.test(line))
    .map(line => line.replace(/^-\s*/, '').trim())

export const makeBoard = (
  topic: string,
  files: { progress?: string; deck?: string; mistakes?: string },
  today: string,
): Board => {
  const progress = files.progress ? parseProgress(files.progress) : null
  const deck = files.deck ? parseDeck(files.deck, today) : null
  return {
    topic: progress?.title || topic,
    hasProgress: progress !== null,
    goal: progress?.goal ?? '',
    level: progress?.level ?? '',
    solid: progress?.solid ?? 0,
    shaky: progress?.shaky ?? [],
    quizzes: progress?.quizzes.slice(-12) ?? [],
    homeworkWaiting: progress?.homeworkWaiting ?? 0,
    next: progress?.next ?? [],
    deck,
    mistakes: files.mistakes ? parseMistakes(files.mistakes).slice(-3) : [],
  }
}
