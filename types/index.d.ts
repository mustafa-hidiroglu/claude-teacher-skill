export type Lesson = { topic: string; activity: string }

declare module 'claude-code' {
  interface PluginState {
    'teacher': { lesson: Lesson | null }
  }
}
