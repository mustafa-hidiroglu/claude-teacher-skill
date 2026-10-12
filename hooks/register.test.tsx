import { test, expect, mock } from 'claude-code/testing'

import { parse } from './register'

const HOME = '/home/learner'
const TOPIC = `${HOME}/.claude/teacher/c-programming`
const DAY = 86_400_000
// 2026-10-12, midday UTC, so the local day is the same everywhere it runs.
const NOW = Date.UTC(2026, 9, 12, 12)

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 },
} as const

// Stand-ins for the engine beneath the plugin. `files` is the disk.
const engine = (on: any, files: Record<string, string> = {}) => {
  const toasts: string[] = []
  const prompts: string[] = []
  on('ui.render', ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('skill.prompt', (_$: any, e: any) => ({ text: e.text }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_$: any, e: any) => (toasts.push(e.text), { value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_$: any, e: any) => (prompts.push(e.text), { text: e.text }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.append', (_$: any, e: any, next: any) => next(e))
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: e.name } }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('fs.read', (_$: any, e: any) => (e.path in files ? { value: files[e.path] } : { deny: 'missing' }))
  on('fs.exists', (_$: any, e: any) => ({ value: e.path in files }))
  on('fs.list', (_$: any, e: any) => {
    const names = new Set(
      Object.keys(files)
        .filter(p => p.startsWith(`${e.path}/`))
        .map(p => p.slice(e.path.length + 1).split('/')[0]),
    )
    return { value: [...names].map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('fs.stat', (_$: any, e: any) =>
    e.path in files ? { value: { kind: 'file', size: 1, mtimeMs: 1 } } : { deny: 'missing' },
  )
  mock.env(on, { HOME })
  const clock = mock.clock(on, { now: NOW })
  return { toasts, prompts, clock }
}

const mountBand = async ($: any, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'teacher', surface, ...BAND })

const bandText = async ($: any, surface: 'terminal' | 'desktop') => {
  const ui = await mountBand($, surface)
  const found = await ui.find({ type: 'Text', text: /TEACHING MODE/ })
  await ui.unmount()
  return found
}

const teach = ($: any, args: string) => $.skill.prompt({ skill: 'teach', text: `# Teach\n\nARGUMENTS: ${args}` })

const reply = ($: any, uuid: string, agentId?: string) =>
  $.session.append({
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: 'Pointers hold addresses.' }] },
    door: 'response',
    origin: { kind: 'model', model: 'test' },
    uuid,
    ...(agentId ? { agentId } : {}),
  })

const said = ($: any, uuid: string) =>
  $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: '256' }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid,
  })

const turn = ($: any, id: string) => $.turn.start({ text: 'hi', turnId: id })

// The reply's drawing: false when the engine drew it, else its box colour and heading.
const boxed = async ($: any, uuid: string) => {
  const ui = await $.ui.mount({
    plugin: 'teacher',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: uuid,
    props: { text: 'Pointers hold addresses.', isFirstOfReply: true },
  })
  const label = await ui.find({ type: 'Text', text: /🎓 Teacher/ })
  const box = await ui.find({ type: 'Markdown' })
  const tree = await ui.drawn()
  await ui.unmount()
  if (!box) return false
  return `${label ? 'label' : 'box'}:${tree.props.borderColor}`
}

test('parse mirrors the skill dispatch', async () => {
  expect(parse('C programming', null)).toEqual({ topic: 'C programming', activity: 'lesson' })
  expect(parse('quiz', { topic: 'C', activity: 'lesson' })).toEqual({ topic: 'C', activity: 'quiz' })
  expect(parse('homework check 2 C', null)).toEqual({ topic: 'C', activity: 'homework check' })
  expect(parse('hands-on', null)).toEqual({ topic: 'recent topic', activity: 'exercise' })
  expect(parse('learn exercise physiology', null)).toEqual({ topic: 'exercise physiology', activity: 'lesson' })
  expect(parse('QUIT now', { topic: 'C', activity: 'lesson' })).toBeNull()
  expect(parse('flashcards pointers', null)).toEqual({ topic: 'pointers', activity: 'flashcards' })
  expect(parse('feynman', { topic: 'C', activity: 'lesson' })).toEqual({ topic: 'C', activity: 'teach-back' })
  expect(parse('teach-back C', null)).toEqual({ topic: 'C', activity: 'teach-back' })
  expect(parse('review', { topic: 'C', activity: 'quiz' })).toEqual({ topic: 'C', activity: 'review' })
  expect(parse('cheatsheet', { topic: 'C', activity: 'lesson' })).toEqual({ topic: 'C', activity: 'cheatsheet' })
  expect(parse('progress C', null)).toEqual({ topic: 'C', activity: 'progress' })
  expect(parse('constructor functions', null)).toEqual({ topic: 'constructor functions', activity: 'lesson' })
  expect(parse('__proto__', null)).toEqual({ topic: '__proto__', activity: 'lesson' })
  expect(parse('flashcards python 3', null)).toEqual({ topic: 'python 3', activity: 'flashcards' })
  expect(parse('homework check', { topic: 'C', activity: 'lesson' })).toEqual({ topic: 'C', activity: 'homework check' })
  expect(parse('learn review techniques', null)).toEqual({ topic: 'review techniques', activity: 'lesson' })
})

test('band appears on /teach and disappears on /teach quit, with toasts', async ($, on) => {
  const { toasts } = engine(on)
  mock.store(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await bandText($, surface)).toBeUndefined()
    await teach($, 'C programming')
    expect(await bandText($, surface)).toBeDefined()
    await $.skill.prompt({ skill: 'teacher:teach', text: '# Teach\n\nARGUMENTS: quit' })
    expect(await bandText($, surface)).toBeUndefined()
  }
  expect(toasts.filter(t => t.startsWith('🎓 Entered teaching mode · C programming'))).toHaveLength(2)
  expect(toasts.filter(t => t.startsWith('Left teaching mode'))).toHaveLength(2)
})

test('other skills leave the band alone', async ($, on) => {
  engine(on)
  await $.skill.prompt({ skill: 'commit', text: 'ARGUMENTS: quiz' })
  expect(await bandText($, 'terminal')).toBeUndefined()
})

test('the teaching_mode tool turns it off for plain-language quit', async ($, on) => {
  engine(on)
  mock.store(on)
  await teach($, 'recursion')
  expect(await bandText($, 'terminal')).toBeDefined()
  const res = await $.tool.call({ tool: 'mcp__teacher__teaching_mode', active: false } as any)
  expect(res.result).toBe('Teaching mode off.')
  expect(await bandText($, 'terminal')).toBeUndefined()
})

test('band buttons send plain words; the band takes the activity colour', async ($, on) => {
  const { prompts } = engine(on)
  mock.store(on)
  await teach($, 'quiz C programming')
  const ui = await mountBand($)
  const label = await ui.find({ type: 'Text', text: /TEACHING MODE/ })
  expect(label?.props.backgroundColor).toBe('yellow')
  await ui.press({ key: 'hint' })
  await ui.press({ key: 'quit' })
  await ui.unmount()
  expect(prompts).toEqual(['give me a hint', 'quit teaching mode'])
})

test('band hides action buttons while the teacher is replying', async ($, on) => {
  engine(on)
  mock.store(on)
  await teach($, 'C programming')
  const ui = await $.ui.mount({ plugin: 'teacher', surface: 'terminal', ...BAND, props: { ...BAND.props, isWorking: true } })
  expect(await ui.find({ type: 'Button', key: 'hint' } as any)).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'panel' } as any)).toBeDefined()
  await ui.unmount()
})

test('band hotkeys are letters, never digits', async ($, on) => {
  engine(on)
  mock.store(on)
  await teach($, 'C programming')
  const ui = await mountBand($)
  for (const key of ['quiz', 'hint', 'cards', 'review', 'panel', 'quit']) {
    const button = await ui.find({ type: 'Button', key } as any)
    expect(button?.props.hotkey).toMatch(/^[a-z]$/)
  }
  await ui.unmount()
})

test("another plugin's prompt is not drawn as the learner's", async ($, on) => {
  engine(on)
  mock.store(on)
  await teach($, 'C programming')
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'loop tick' }] },
    door: 'prompt',
    origin: { kind: 'plugin', name: 'other' },
    uuid: 'other',
  } as any)
  const ui = await $.ui.mount({
    plugin: 'teacher',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'other',
    props: { text: 'loop tick', origin: { kind: 'plugin', name: 'other' }, isExpanded: false },
  } as any)
  expect(await ui.find({ type: 'Text', text: /🙋 You/ })).toBeUndefined()
  await ui.unmount()
})

test('timed activities show a running clock', async ($, on) => {
  const { clock } = engine(on)
  mock.store(on)
  await teach($, 'exercise C programming')
  await clock.advance(65_000)
  const ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /⏱ 1:05/ })).toBeDefined()
  await ui.unmount()

  await teach($, 'C programming')
  const lessonBand = await mountBand($)
  expect(await lessonBand.find({ type: 'Text', text: /⏱/ })).toBeUndefined()
  await lessonBand.unmount()
})

test('the streak counts days kept in the store', async ($, on) => {
  engine(on)
  mock.store(on, { days: ['2026-10-10', '2026-10-11'] })
  await teach($, 'C programming')
  const ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /🔥 3-day streak/ })).toBeDefined()
  await ui.unmount()
})

test('replies written in teaching mode are boxed in the activity colour', async ($, on) => {
  engine(on)
  mock.store(on)
  await reply($, 'before')
  await teach($, 'C programming')
  await reply($, 'during')
  await reply($, 'scout', 'agent-1')
  await teach($, 'quiz')
  await turn($, 'q')
  await reply($, 'quiz')
  await teach($, 'quit')
  await turn($, 'after-turn')
  await reply($, 'after')

  expect(await boxed($, 'before')).toBe(false)
  expect(await boxed($, 'during')).toBe('label:magenta')
  expect(await boxed($, 'scout')).toBe(false)
  expect(await boxed($, 'quiz')).toBe('label:yellow')
  expect(await boxed($, 'after')).toBe(false)
})

test('one reply is one box: label once, kept through a plain-language quit', async ($, on) => {
  engine(on)
  mock.store(on)
  await teach($, 'pointers')
  await turn($, 't1')
  await reply($, 'a')
  await reply($, 'b')
  await $.tool.call({ tool: 'mcp__teacher__teaching_mode', active: false } as any)
  await reply($, 'c')
  expect(await boxed($, 'a')).toBe('label:magenta')
  expect(await boxed($, 'b')).toBe('box:magenta')
  expect(await boxed($, 'c')).toMatch(/^box:/)

  await turn($, 't2')
  await reply($, 'd')
  expect(await boxed($, 'd')).toBe(false)
})

test('rows without text are not tagged', async ($, on) => {
  engine(on)
  mock.store(on)
  await teach($, 'pointers')
  await $.session.append({
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'Read', input: {} }] },
    door: 'response',
    origin: { kind: 'model', model: 'test' },
    uuid: 'tool-only',
  })
  await reply($, 'text')
  expect(await boxed($, 'tool-only')).toBe(false)
  expect(await boxed($, 'text')).toBe('label:magenta')
})

test("the learner's own messages are boxed while teaching", async ($, on) => {
  engine(on)
  mock.store(on)
  await said($, 'u0')
  await teach($, 'C programming')
  await said($, 'u1')
  const draw = async (uuid: string) => {
    const ui = await $.ui.mount({
      plugin: 'teacher',
      surface: 'terminal',
      component: 'UserMessage',
      requestId: uuid,
      props: { text: '256', origin: { kind: 'composer' }, isExpanded: false },
    } as any)
    const found = await ui.find({ type: 'Text', text: /🙋 You/ })
    await ui.unmount()
    return found !== undefined
  }
  expect(await draw('u0')).toBe(false)
  expect(await draw('u1')).toBe(true)
})

test('the progress pane reads the topic files', async ($, on) => {
  engine(on, {
    [`${TOPIC}/progress.md`]:
      '# C programming\n- goal: embedded\n\n## Covered\n- overflow: solid\n- signed: shaky (wraps)\n\n## Quizzes\n- 2026-10-11: 4/5\n\n## Next\n- pointers\n',
    [`${TOPIC}/flashcards.md`]: '### c-1\n- box: 1\n- due: 2026-10-12\n### c-2\n- box: 2\n- due: 2026-10-30\n',
    [`${TOPIC}/mistakes.md`]: '- 2026-10-11 · signed · wraps → undefined behaviour\n',
  })
  mock.store(on)
  await teach($, 'C programming')
  const pane = await $.ui.mount({
    plugin: 'teacher',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'teach-panel',
    props: {},
  } as any)
  expect(await pane.find({ type: 'Text', text: /1 solid · 1 shaky/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /latest 80%/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^1 due$/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /1\. pointers/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /wraps → undefined behaviour/ })).toBeDefined()
  await pane.unmount()
})

test('a session without teaching does not extend the streak', async ($, on) => {
  const { clock } = engine(on)
  mock.store(on)
  // A session today with no lesson, then a lesson tomorrow: one day, no streak.
  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })
  await clock.advance(DAY)
  await teach($, 'C programming')
  const ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /TEACHING MODE/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /🔥/ })).toBeUndefined()
  await ui.unmount()
})

test('session start toasts the flashcards that are due', async ($, on) => {
  const { toasts } = engine(on, {
    [`${TOPIC}/progress.md`]: '# C programming\n',
    [`${TOPIC}/flashcards.md`]: '### a\n- box: 1\n- due: 2026-10-11\n### b\n- box: 2\n- due: now\n### c\n- box: 3\n- due: 2026-11-01\n',
  })
  mock.store(on)
  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 0))
  expect(toasts).toContain('🃏 2 flashcards due · C programming — /teacher:teach flashcards C programming')
})
