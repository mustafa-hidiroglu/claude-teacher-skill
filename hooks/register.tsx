import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Lesson } from '../types'

const lesson = atom({ plugin: 'teacher', key: 'lesson' } as const, null)

const SUBCOMMANDS: Record<string, string> = {
  quiz: 'quiz',
  homework: 'homework',
  exercise: 'exercise',
  'hands-on': 'exercise',
}

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
  if (word in SUBCOMMANDS) {
    const topicWords = word === 'homework' && rest[0]?.toLowerCase() === 'check' ? rest.slice(1) : rest
    const topic = topicWords.filter(w => !/^\d+$/.test(w)).join(' ')
    const activity = word === 'homework' && rest[0]?.toLowerCase() === 'check' ? 'homework check' : SUBCOMMANDS[word]
    return { topic: topic || keep, activity }
  }
  return { topic: args || 'choosing a topic', activity: 'lesson' }
}

const show = async ($: EngineInterface, next: Lesson | null) => {
  await update($, lesson, () => next)
  $.ui.status(next ? `🎓 Teaching · ${next.topic}` : undefined)
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
          activity: { type: 'string', description: 'lesson, quiz, homework, homework check or exercise' },
        },
        required: ['active'],
      },
    })
    const current = await read($, lesson)
    $.ui.status(current ? `🎓 Teaching · ${current.topic}` : undefined)
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, lesson)
    if (e.props.hasSurvey || current === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text backgroundColor="magenta" color="white" bold>
          {' 🎓 TEACHING MODE '}
        </Text>
        <Text color="magenta" bold>
          {` ${current.topic}`}
        </Text>
        <Text dimColor>
          {` · ${current.activity} · /teach quit to leave`}
        </Text>
      </Box>
    )
  })
}
