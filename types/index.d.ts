export type Advice = { id: string; level: 'info' | 'warn'; text: string }
export type CoachStats = {
  startedAt: number
  prompts: number
  corrections: number
  shipPrompts: number
  tokens: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-coach': {
      stats: CoachStats
      advice: Advice[]
      dismissed: string[]
    }
  }
}
