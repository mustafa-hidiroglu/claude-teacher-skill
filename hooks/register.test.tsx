import { test, expect } from 'claude-code/testing'

import { parse } from './register'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 },
} as const

// Stand-ins for the engine beneath the plugin.
const engine = (on: any) => {
  on('ui.render', ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('skill.prompt', (_$: any, e: any) => ({ text: e.text }))
  on('ui.status', () => ({ value: undefined }))
}

const bandText = async ($: any, surface: 'terminal' | 'desktop') => {
  const ui = await $.ui.mount({ plugin: 'teacher', surface, ...BAND })
  const found = await ui.find({ type: 'Text', text: /TEACHING MODE/ })
  await ui.unmount()
  return found
}

test('parse mirrors the skill dispatch', async () => {
  expect(parse('C programming', null)).toEqual({ topic: 'C programming', activity: 'lesson' })
  expect(parse('quiz', { topic: 'C', activity: 'lesson' })).toEqual({ topic: 'C', activity: 'quiz' })
  expect(parse('homework check 2 C', null)).toEqual({ topic: 'C', activity: 'homework check' })
  expect(parse('hands-on', null)).toEqual({ topic: 'recent topic', activity: 'exercise' })
  expect(parse('learn exercise physiology', null)).toEqual({ topic: 'exercise physiology', activity: 'lesson' })
  expect(parse('QUIT now', { topic: 'C', activity: 'lesson' })).toBeNull()
})

test('band appears on /teach and disappears on /teach quit', async ($, on) => {
  engine(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await bandText($, surface)).toBeUndefined()

    await $.skill.prompt({ skill: 'teach', text: '# Teach\n...\n\nARGUMENTS: C programming' })
    expect(await bandText($, surface)).toBeDefined()

    await $.skill.prompt({ skill: 'teacher:teach', text: '# Teach\n\nARGUMENTS: quit' })
    expect(await bandText($, surface)).toBeUndefined()
  }
})

test('other skills leave the band alone', async ($, on) => {
  engine(on)
  await $.skill.prompt({ skill: 'commit', text: 'ARGUMENTS: quiz' })
  expect(await bandText($, 'terminal')).toBeUndefined()
})

test('the teaching_mode tool turns it off for plain-language quit', async ($, on) => {
  engine(on)
  await $.skill.prompt({ skill: 'teach', text: 'ARGUMENTS: recursion' })
  expect(await bandText($, 'terminal')).toBeDefined()
  const res = await $.tool.call({ tool: 'mcp__teacher__teaching_mode', active: false } as any)
  expect(res.result).toBe('Teaching mode off.')
  expect(await bandText($, 'terminal')).toBeUndefined()
})
