export type Notice = { id: string; title: string; detail: string }

declare module 'claude-code' {
  interface PluginState {
    'heads-up': { notice: Notice | null; checking: boolean; clearAt: number }
  }
}
