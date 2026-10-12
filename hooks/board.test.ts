import { test, expect } from 'claude-code/testing'

import { makeBoard, parseDeck, parseMistakes, parseProgress, slug, sparkline, streak } from './board'

const PROGRESS = `# C programming
- goal: systems / embedded
- level: beginner

## Covered
- chars are numbers: solid
- unsigned overflow: solid
- signed overflow: shaky (thinks it wraps like unsigned)
- not a status line

## Next
- & and %p
- pointers
- pointer arithmetic
- arrays

## Quizzes
- 2026-10-09: 3/5, missed: signed overflow
- 2026-10-11: 4/5, missed: none
- 2026-10-12: 9/5 (bad line)
- 2026/10/12: 2/4

## Homework
- hw-1: graded 4/5 — overflow
- hw-2: assigned — addresses
- hw-3: graded 3/4 — assigned reading
`

const DECK = `# Flashcards
### c-1
- item: chars are numbers
- box: 3
- due: 2026-10-20
### c-2
- item: unsigned overflow
- box: 1
- due: 2026-10-12
### c-3
- item: signed overflow
- box: 2
- due: now
### c-4
- box: 9
### c-5
- box: 4
- due: Oct 20
`

test('slug follows the skill', () => {
  expect(slug('C programming')).toBe('c-programming')
  expect(slug('  ../Big O!! ')).toBe('big-o')
  expect(slug('a'.repeat(59) + ' b')).toBe('a'.repeat(59))
})

test('streak counts back from today or yesterday', () => {
  expect(streak(['2026-10-10', '2026-10-11', '2026-10-12'], '2026-10-12')).toBe(3)
  expect(streak(['2026-10-10', '2026-10-11'], '2026-10-12')).toBe(2)
  expect(streak(['2026-10-09', '2026-10-11'], '2026-10-12')).toBe(1)
  expect(streak(['2026-10-01'], '2026-10-12')).toBe(0)
  expect(streak(['2026-09-30', '2026-10-01'], '2026-10-01')).toBe(2)
})

test('sparkline maps 0..1 to bars', () => {
  expect(sparkline([0, 0.5, 1])).toBe('▁▅█')
})

test('progress.md is read as data', () => {
  const p = parseProgress(PROGRESS)
  expect(p.title).toBe('C programming')
  expect(p.goal).toBe('systems / embedded')
  expect(p.solid).toBe(2)
  expect(p.shaky).toEqual(['signed overflow'])
  expect(p.quizzes).toEqual([0.6, 0.8, 0.5])
  expect(p.homeworkWaiting).toBe(1)
  expect(p.next).toEqual(['& and %p', 'pointers', 'pointer arithmetic'])
})

test('a card is due on or before today, or when it has no date', () => {
  expect(parseDeck(DECK, '2026-10-12')).toEqual({ boxes: [1, 1, 1, 1, 0], due: 2 })
  expect(parseDeck(DECK, '2026-10-20')).toEqual({ boxes: [1, 1, 1, 1, 0], due: 3 })
})

test('mistakes keep only journal lines', () => {
  const text = '# Mistakes\n- 2026-10-11 · signed overflow · wraps → it is undefined\nnoise\n- not dated'
  expect(parseMistakes(text)).toEqual(['2026-10-11 · signed overflow · wraps → it is undefined'])
})

test('a board with no files says so', () => {
  const b = makeBoard('recursion', {}, '2026-10-12')
  expect(b.hasProgress).toBe(false)
  expect(b.deck).toBeNull()
  expect(b.topic).toBe('recursion')
})
