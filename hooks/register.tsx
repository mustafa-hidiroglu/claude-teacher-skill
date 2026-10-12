import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, Lesson, ReplyMark } from '../types'
import { dayOf, makeBoard, slug, sparkline, streak as streakOf } from './board'

const lesson = atom({ plugin: 'teacher', key: 'lesson' } as const, null)
const reply = atom({ plugin: 'teacher', key: 'reply' } as const, null)
const answer = atom({ plugin: 'teacher', key: 'answer' } as const, false)
const turn = atom({ plugin: 'teacher', key: 'turn' } as const, { teaching: false, labeled: false })
const board = atom({ plugin: 'teacher', key: 'board' } as const, null)
const streak = atom({ plugin: 'teacher', key: 'streak' } as const, 0)
const elapsed = atom({ plugin: 'teacher', key: 'elapsed' } as const, 0)

const SUBCOMMANDS: Record<string, string> = {
  quiz: 'quiz',
  homework: 'homework',
  exercise: 'exercise',
  'hands-on': 'exercise',
  flashcards: 'flashcards',
  review: 'review',
  'teach-back': 'teach-back',
  feynman: 'teach-back',
  cheatsheet: 'cheatsheet',
  progress: 'progress',
}

// Being tested is yellow, doing is green, recall practice is blue, the rest
// of teaching is magenta. The learner's own messages are cyan.
const COLORS: Record<string, string> = {
  quiz: 'yellow',
  review: 'yellow',
  'homework check': 'yellow',
  exercise: 'green',
  homework: 'green',
  flashcards: 'blue',
  'teach-back': 'blue',
}
const ACCENT = 'magenta'
const LEARNER = 'cyan'
const colorOf = (activity: string | undefined) => (activity && COLORS[activity]) || ACCENT

const TIMED = new Set(['quiz', 'review', 'exercise', 'flashcards'])

const PANE = 'teach-panel'
const DAYS_KEY = 'days'

// Band buttons send these as the learner's own words; the skill reads them
// mid-lesson the same as typed ones. Letters, not digits: a digit typed into
// an empty prompt presses a band button, and quiz answers are often numbers.
const ACTIONS = [
  { key: 'quiz', hotkey: 'q', label: 'Quiz', text: 'quiz me' },
  { key: 'hint', hotkey: 'h', label: 'Hint', text: 'give me a hint' },
  { key: 'cards', hotkey: 'c', label: 'Cards', text: "let's do flashcards" },
  { key: 'review', hotkey: 'r', label: 'Review', text: "let's do a quick review" },
] as const

const isTeachSkill = (skill: string) => skill === 'teach' || skill.endsWith(':teach')

// The expanded skill text ends with "ARGUMENTS: <what the user typed>".
const argsOf = (text: string) => {
  const at = text.lastIndexOf('ARGUMENTS:')
  return at === -1 ? '' : text.slice(at + 'ARGUMENTS:'.length).trim()
}

// Mirrors the skill's §0 dispatch. Returns null for quit.
export const parse = (args: string, current: Lesson | null): Lesson | null => {
  const [first = '', ...rest] = args.split(/\s+/).filter(Boolean)
  const word = first.toLowerCase()
  const keep = current?.topic ?? 'recent topic'

  if (word === 'quit') return null
  if (word === 'learn') return { topic: rest.join(' ') || keep, activity: 'lesson' }
  const activity = Object.hasOwn(SUBCOMMANDS, word) ? SUBCOMMANDS[word] : undefined
  if (activity !== undefined) {
    if (word === 'homework' && rest[0]?.toLowerCase() === 'check') {
      // `homework check [N] [concept]`: N is the homework number, not the topic.
      const topicWords = /^\d+$/.test(rest[1] ?? '') ? rest.slice(2) : rest.slice(1)
      return { topic: topicWords.join(' ') || keep, activity: 'homework check' }
    }
    return { topic: rest.join(' ') || keep, activity }
  }
  return { topic: args || 'choosing a topic', activity: 'lesson' }
}

const clockText = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// ---- files the skill keeps ------------------------------------------------

// undefined when no home directory is known: the file features then stay off.
const teacherDir = async ($: EngineInterface) => {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  return home ? `${home}/.claude/teacher` : undefined
}

const readOr = async ($: EngineInterface, path: string) => {
  try {
    return await $.fs.read(path)
  } catch {
    return undefined
  }
}

// The topic's folder by slug, else the folder whose progress.md changed last.
const topicFolder = async ($: EngineInterface, topic: string | undefined) => {
  const base = await teacherDir($)
  if (!base) return undefined
  const wanted = topic ? slug(topic) : ''
  if (wanted && (await $.fs.exists(`${base}/${wanted}/progress.md`))) return `${base}/${wanted}`
  let best: { path: string; at: number } | undefined
  for (const entry of await $.fs.list(base).catch(() => [])) {
    if (entry.kind !== 'dir') continue
    const path = `${base}/${entry.name}`
    const at = await $.fs
      .stat(`${path}/progress.md`)
      .then(s => s.mtimeMs)
      .catch(() => -1)
    if (at >= 0 && (!best || at > best.at)) best = { path, at }
  }
  return best?.path
}

const loadBoard = async ($: EngineInterface, folder: string, topic: string): Promise<Board> =>
  makeBoard(
    topic,
    {
      progress: await readOr($, `${folder}/progress.md`),
      deck: await readOr($, `${folder}/flashcards.md`),
      mistakes: await readOr($, `${folder}/mistakes.md`),
    },
    dayOf(await $.clock.now()),
  )

const refreshBoard = async ($: EngineInterface) => {
  const current = await read($, lesson)
  const folder = await topicFolder($, current?.topic)
  const next = folder ? await loadBoard($, folder, current?.topic ?? folder.split('/').pop() ?? '') : null
  await update($, board, () => next)
}

// ---- streak and timer -------------------------------------------------------

// Only a day with teaching in it counts; `record` is false for a plain read.
const markToday = async ($: EngineInterface, record = true) => {
  const today = dayOf(await $.clock.now())
  const stored = await $.store.get(DAYS_KEY)
  const days = Array.isArray(stored) ? stored.filter((d): d is string => typeof d === 'string') : []
  const kept = !record || days.includes(today) ? days : [...days, today].slice(-60)
  if (kept !== days) await $.store.set(DAYS_KEY, kept)
  await update($, streak, () => streakOf(kept, today))
}

let timer: { cancel: () => void } | undefined

// Synchronous up to the new interval, so two overlapping calls can't leave
// an interval nobody cancels.
const runTimer = ($: EngineInterface, current: Lesson | null) => {
  timer?.cancel()
  timer = undefined
  if (!current || !TIMED.has(current.activity) || current.since === undefined) return
  const since = current.since
  const tick = async () => {
    const seconds = Math.max(0, Math.floor(((await $.clock.now()) - since) / 1000))
    await update($, elapsed, () => seconds)
  }
  timer = $.clock.every(1000, () => void tick().catch(() => undefined))
  void tick().catch(() => undefined)
}

// ---- teaching mode on and off ----------------------------------------------

const show = async ($: EngineInterface, next: Lesson | null) => {
  const now = await $.clock.now()
  let previous: Lesson | null = null
  const stored = await update($, lesson, value => {
    previous = value
    if (!next) return null
    const same = value && value.topic === next.topic && value.activity === next.activity
    return { ...next, since: same ? value.since : now }
  })
  $.ui.status(stored ? `🎓 Teaching · ${stored.topic}` : undefined)
  if (stored && !previous) $.ui.toast(`🎓 Entered teaching mode · ${stored.topic}`)
  if (!stored && previous) $.ui.toast('Left teaching mode · back to normal Claude')
  runTimer($, stored)
  if (stored) {
    await markToday($).catch(() => undefined)
    await refreshBoard($).catch(() => undefined)
  }
}

// The topic with the most flashcards due today, for the startup toast.
const dueCards = async ($: EngineInterface) => {
  const base = await teacherDir($)
  if (!base) return undefined
  const today = dayOf(await $.clock.now())
  let best: { topic: string; due: number } | undefined
  for (const entry of await $.fs.list(base).catch(() => [])) {
    if (entry.kind !== 'dir') continue
    const deck = await readOr($, `${base}/${entry.name}/flashcards.md`)
    if (!deck) continue
    const b = makeBoard(entry.name, { deck, progress: await readOr($, `${base}/${entry.name}/progress.md`) }, today)
    const due = b.deck?.due ?? 0
    if (due > 0 && (!best || due > best.due)) best = { topic: b.topic, due }
  }
  return best
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'teaching_mode',
      description:
        'Turns the teaching-mode indicator on or off. Call with active:false when the learner leaves teaching mode in plain language (e.g. "quit", "stop teaching"); call with active:true and a topic or activity when they change.',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean' },
          topic: { type: 'string' },
          activity: {
            type: 'string',
            description:
              'lesson, quiz, homework, homework check, exercise, flashcards, review, teach-back, cheatsheet or progress',
          },
        },
        required: ['active'],
      },
    })
    await $.command.register({
      name: PANE,
      description: 'Show your teaching progress in a side pane',
    })
    const current = await read($, lesson)
    $.ui.status(current ? `🎓 Teaching · ${current.topic}` : undefined)
    runTimer($, current)
    await markToday($, current !== null).catch(() => undefined)
    // Off the startup path: reading every topic folder can take a moment.
    void dueCards($)
      .then(due => {
        if (due) $.ui.toast(`🃏 ${due.due} flashcard${due.due === 1 ? '' : 's'} due · ${due.topic} — /teacher:teach flashcards ${due.topic}`)
      })
      .catch(() => undefined)
    return next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    if (isTeachSkill(e.skill)) {
      await show($, parse(argsOf(e.text), await read($, lesson)))
    }
    return next(e)
  })

  on('tool.call', { tool: 'mcp__teacher__teaching_mode' }, async ($, e) => {
    const input = e as unknown as { active: boolean; topic?: string; activity?: string }
    const current = await read($, lesson)
    const nextLesson = input.active
      ? { topic: input.topic || current?.topic || 'recent topic', activity: input.activity || current?.activity || 'lesson' }
      : null
    await show($, nextLesson)
    return { result: nextLesson ? `Teaching mode on: ${nextLesson.topic}` : 'Teaching mode off.' }
  }).catch(() => ({ deny: 'teacher: could not update the indicator.' }))

  // The pane follows the skill's own writes to the topic folder.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const path = (e as unknown as { file_path?: unknown }).file_path
    if ((e.tool === 'Write' || e.tool === 'Edit') && typeof path === 'string' && path.includes('/.claude/teacher/')) {
      await refreshBoard($).catch(() => undefined)
    }
    return result
  })

  on('command.run', { command: PANE }, async $ => {
    await refreshBoard($)
    const { isPlaced } = await $.ui.open({ id: PANE, title: '🎓 Progress' })
    return { text: isPlaced ? 'Progress pane opened.' : 'Progress pane is waiting for a wider window.' }
  })

  // A reply belongs to teaching mode if its turn started there, so a
  // plain-language quit mid-reply doesn't leave the reply half boxed.
  on('turn.start', async ($, e, next) => {
    const teaching = (await read($, lesson)) !== null
    await update($, turn, () => ({ teaching, labeled: false }))
    return next(e)
  })

  // Tag each main-chat text block written while teaching, so it alone is boxed.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    const hasText = e.message.content.some(block => block.type === 'text')
    if (e.agentId === undefined && hasText) {
      const current = await read($, lesson)
      if (current !== null || (await read($, turn)).teaching) {
        let label = false
        await update($, turn, value => {
          label = !value.labeled
          return { teaching: value.teaching, labeled: true }
        })
        const mark: ReplyMark = { color: colorOf(current?.activity), label }
        await update($, memberOf(reply, { requestId: e.uuid }), () => mark)
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // And each thing the learner types while teaching.
  on('session.append', { door: 'prompt' }, async ($, e, next) => {
    const typed = e.origin.kind === 'composer' || (e.origin.kind === 'plugin' && 'name' in e.origin && e.origin.name === 'teacher')
    if (e.agentId === undefined && typed && (await read($, lesson)) !== null) {
      await update($, memberOf(answer, { requestId: e.uuid }), () => true)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const mark = await read($, memberOf(reply, e))
    if (mark === null) return next(e)

    // Markdown, not next(e): it lays out to the box's width, not the viewport's.
    const { Box, Text, Markdown } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={mark.color} paddingX={1}>
        {mark.label && (
          <Text color={mark.color} bold>
            🎓 Teacher
          </Text>
        )}
        <Markdown text={e.props.text} />
      </Box>
    )
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!(await read($, memberOf(answer, e)))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={LEARNER} paddingX={1}>
        <Text color={LEARNER} bold>
          🙋 You
        </Text>
        <Text>{e.props.text}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, lesson)
    if (e.props.hasSurvey || current === null) return next(e)

    const color = colorOf(current.activity)
    const days = await read($, streak)
    const seconds = TIMED.has(current.activity) ? await read($, elapsed) : undefined
    const say = (text: string) => () => void $.prompt.submit({ text, asUser: true }).catch(() => undefined)
    const openPanel = () =>
      void refreshBoard($)
        .then(() => $.ui.open({ id: PANE, title: '🎓 Progress' }))
        .catch(() => undefined)

    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" borderStyle="double" borderColor={color} paddingX={1}>
        <Box>
          <Text backgroundColor={color} color="black" bold>
            {' 🎓 TEACHING MODE '}
          </Text>
          <Text color={color} bold>
            {` ${current.topic}`}
          </Text>
          <Text color={color}>{` · ${current.activity}`}</Text>
          {seconds !== undefined && <Text color={color}>{` · ⏱ ${clockText(seconds)}`}</Text>}
          {days >= 2 && <Text color="red">{` · 🔥 ${days}-day streak`}</Text>}
        </Box>
        <Box>
          {/* Hidden mid-reply: a press then would queue a turn behind this one. */}
          {!e.props.isWorking &&
            ACTIONS.map(a => (
              <Button key={a.key} label={`${a.label}  `} hotkey={a.hotkey} plain onPress={say(a.text)} />
            ))}
          <Button key="panel" label="Progress  " hotkey="p" plain onPress={openPanel} />
          {!e.props.isWorking && (
            <Button key="quit" label="Quit" hotkey="x" plain onPress={say('quit teaching mode')} />
          )}
        </Box>
        <Text dimColor>
          {e.props.isWorking
            ? 'buttons come back when the teacher finishes · /teach quit to leave'
            : 'click a button, or ctrl+x tab then its key · /teach quit to leave'}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const b = await read($, board)
    if (b === null || !b.hasProgress) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No progress yet. Start with /teacher:teach &lt;topic&gt;.</Text>
        </Box>
      )
    }

    const total = b.solid + b.shaky.length
    const width = 12
    const filled = total === 0 ? 0 : Math.round((b.solid / total) * width)
    const latest = b.quizzes.at(-1)

    return (
      <Box flexDirection="column">
        <Text color={ACCENT} bold>
          {b.topic}
        </Text>
        {(b.goal || b.level) && <Text dimColor>{[b.goal, b.level].filter(Boolean).join(' · ')}</Text>}
        <Text> </Text>
        <Text>
          <Text bold>Covered  </Text>
          <Text color="green">{'█'.repeat(filled)}</Text>
          <Text color="yellow">{'█'.repeat(width - filled)}</Text>
          {`  ${b.solid} solid · ${b.shaky.length} shaky`}
        </Text>
        {b.shaky.length > 0 && <Text color="yellow">{`  shaky: ${b.shaky.join(', ')}`}</Text>}
        <Text>
          <Text bold>Quizzes  </Text>
          {b.quizzes.length === 0 ? (
            <Text dimColor>none yet</Text>
          ) : (
            <Text color={ACCENT}>{`${sparkline(b.quizzes)}  latest ${Math.round((latest ?? 0) * 100)}%`}</Text>
          )}
        </Text>
        <Text>
          <Text bold>Cards    </Text>
          {b.deck === null ? (
            <Text dimColor>no deck yet</Text>
          ) : (
            <Text>
              <Text color={b.deck.due > 0 ? 'blue' : undefined} bold={b.deck.due > 0}>{`${b.deck.due} due`}</Text>
              <Text dimColor>{`  boxes 1–5: ${b.deck.boxes.join(' ')}`}</Text>
            </Text>
          )}
        </Text>
        {b.homeworkWaiting > 0 && (
          <Text>
            <Text bold>Homework </Text>
            {`${b.homeworkWaiting} open`}
          </Text>
        )}
        {b.next.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text bold>Next</Text>
            {b.next.map((item, i) => (
              <Text>{`  ${i + 1}. ${item}`}</Text>
            ))}
          </Box>
        )}
        {b.mistakes.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text bold>Recent mistakes</Text>
            {b.mistakes.map(m => (
              <Text dimColor>{`  ${m}`}</Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
