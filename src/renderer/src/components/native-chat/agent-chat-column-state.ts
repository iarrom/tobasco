// [FORK] UI-состояние колонки-чата агента (ширина + развёрнутость).
// Отдельный fork-стор, чтобы не трогать основной store/index.ts и types.ts —
// ноль площади конфликта с upstream. Ширина персистится в localStorage.
import { create } from 'zustand'

export const MIN_CHAT_COLUMN_WIDTH = 280
export const MAX_CHAT_COLUMN_WIDTH = 760
const DEFAULT_CHAT_COLUMN_WIDTH = 380
const WIDTH_STORAGE_KEY = 'fork.agentChatColumn.width'

function clampWidth(width: number): number {
  return Math.min(MAX_CHAT_COLUMN_WIDTH, Math.max(MIN_CHAT_COLUMN_WIDTH, Math.round(width)))
}

function loadInitialWidth(): number {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_CHAT_COLUMN_WIDTH
  }
  const raw = Number(localStorage.getItem(WIDTH_STORAGE_KEY))
  return Number.isFinite(raw) && raw > 0 ? clampWidth(raw) : DEFAULT_CHAT_COLUMN_WIDTH
}

type AgentChatColumnState = {
  width: number
  expanded: boolean
  setWidth: (width: number) => void
  toggleExpanded: () => void
}

export const useAgentChatColumnState = create<AgentChatColumnState>((set) => ({
  width: loadInitialWidth(),
  expanded: false,
  setWidth: (width) => {
    const clamped = clampWidth(width)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(clamped))
    }
    set({ width: clamped })
  },
  toggleExpanded: () => set((s) => ({ expanded: !s.expanded }))
}))
