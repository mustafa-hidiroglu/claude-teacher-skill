export type Lesson = {
  topic: string
  activity: string
  // When the current activity began (ms), for the band's timer.
  since?: number
}

// How a row written in teaching mode is drawn: its colour, and whether it
// carries the heading.
export type ReplyMark = { color: string; label: boolean }

export type TurnMark = { teaching: boolean; labeled: boolean }

// What the progress pane shows, read from the topic's files.
export type Board = {
  topic: string
  hasProgress: boolean
  goal: string
  level: string
  solid: number
  shaky: string[]
  quizzes: number[]
  homeworkWaiting: number
  next: string[]
  deck: { boxes: number[]; due: number } | null
  mistakes: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'teacher': {
      lesson: Lesson | null
      // Per transcript row: how a reply written in teaching mode is drawn.
      reply: StateFamily<ReplyMark | null>
      // Per transcript row: a learner prompt written in teaching mode.
      answer: StateFamily<boolean>
      // The running turn: did it start in teaching mode, has it shown the label?
      turn: TurnMark
      board: Board | null
      streak: number
      // Seconds the current timed activity has run, ticked by the band's timer.
      elapsed: number
    }
  }
}
