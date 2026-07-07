// [FORK] Состояние панели агент-сессий: выбранная сессия по worktree, режим
// chat/terminal по сессии и collapse списка агентов в сайдбаре. Отдельный
// fork-стор (как agent-chat-column-state) — ноль площади конфликта с upstream.
// Выбор и collapse персистятся в localStorage; режим сессии — эфемерный,
// потому что paneKey меняется между перезапусками.
import { create } from 'zustand'
import type { AgentPanelSessionView } from './agent-panel-managed-tab'

const SELECTION_STORAGE_KEY = 'fork.agentPanel.selectionByWorktree'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'fork.agentPanel.sidebarAgentsCollapsed'
const PINNED_AGENT_TABS_STORAGE_KEY = 'fork.agentPanel.pinnedAgentTabIds'

function loadStoredRecord<T>(key: string): Record<string, T> {
  if (typeof localStorage === 'undefined') {
    return {}
  }
  try {
    const raw = localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, T>
    }
  } catch {
    // повреждённое значение — начинаем с чистого состояния
  }
  return {}
}

function persistRecord(key: string, value: Record<string, unknown>): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // квота/приватный режим — селекция останется на срок сессии
  }
}

type AgentPanelState = {
  /** Ключ выбранной сессии по worktree: paneKey либо синтетический `tabId:`. */
  selectedSessionKeyByWorktree: Record<string, string>
  /** Режим отображения по ключу сессии; отсутствие = дефолт по агенту. */
  sessionViewBySessionKey: Record<string, AgentPanelSessionView>
  /** Свёрнут ли список агентов под worktree-карточкой в сайдбаре. */
  sidebarAgentsCollapsedByWorktreeId: Record<string, boolean>
  /** Закреплённые агент-сессии (по tabId): держатся сверху списка в сайдбаре. */
  pinnedAgentTabIds: Record<string, boolean>
  /** Таб, чей TerminalPane сейчас хостится в теле панели (режим 'terminal').
   *  Публикуется колонкой; TerminalPaneOverlayLayer по нему портирует пейн.
   *  Эфемерное состояние — не персистится. */
  panelTerminalHostTabIdByWorktree: Record<string, string>
  /** DOM-цель портала — тело панели (absolute inset-0, см. AgentChatColumn). */
  panelTerminalBodyElement: HTMLElement | null
  selectSession: (worktreeId: string, sessionKey: string) => void
  /** Сброс выбора при закрытии сессии; чистит и режим отображения. */
  clearSessionSelection: (worktreeId: string, tabId: string) => void
  setSessionView: (sessionKey: string, view: AgentPanelSessionView) => void
  toggleSidebarAgentsCollapsed: (worktreeId: string) => void
  toggleAgentPinned: (tabId: string) => void
  setPanelTerminalHostTabId: (worktreeId: string, tabId: string | null) => void
  setPanelTerminalBodyElement: (element: HTMLElement | null) => void
}

/** tabId из ключа сессии (paneKey `tabId:leafId` или синтетический `tabId:`). */
export function agentPanelSessionKeyTabId(sessionKey: string): string {
  const separator = sessionKey.indexOf(':')
  return separator > 0 ? sessionKey.slice(0, separator) : sessionKey
}

export const useAgentPanelState = create<AgentPanelState>((set) => ({
  selectedSessionKeyByWorktree: loadStoredRecord<string>(SELECTION_STORAGE_KEY),
  sessionViewBySessionKey: {},
  sidebarAgentsCollapsedByWorktreeId: loadStoredRecord<boolean>(SIDEBAR_COLLAPSED_STORAGE_KEY),
  pinnedAgentTabIds: loadStoredRecord<boolean>(PINNED_AGENT_TABS_STORAGE_KEY),
  panelTerminalHostTabIdByWorktree: {},
  panelTerminalBodyElement: null,
  selectSession: (worktreeId, sessionKey) => {
    set((state) => {
      const next = { ...state.selectedSessionKeyByWorktree, [worktreeId]: sessionKey }
      persistRecord(SELECTION_STORAGE_KEY, next)
      return { selectedSessionKeyByWorktree: next }
    })
  },
  clearSessionSelection: (worktreeId, tabId) => {
    set((state) => {
      const selected = state.selectedSessionKeyByWorktree[worktreeId]
      const views: Record<string, AgentPanelSessionView> = {}
      for (const [key, view] of Object.entries(state.sessionViewBySessionKey)) {
        if (agentPanelSessionKeyTabId(key) !== tabId) {
          views[key] = view
        }
      }
      if (!selected || agentPanelSessionKeyTabId(selected) !== tabId) {
        return { sessionViewBySessionKey: views }
      }
      const next = { ...state.selectedSessionKeyByWorktree }
      delete next[worktreeId]
      persistRecord(SELECTION_STORAGE_KEY, next)
      return { selectedSessionKeyByWorktree: next, sessionViewBySessionKey: views }
    })
  },
  setSessionView: (sessionKey, view) => {
    set((state) => ({
      sessionViewBySessionKey: { ...state.sessionViewBySessionKey, [sessionKey]: view }
    }))
  },
  toggleAgentPinned: (tabId) => {
    set((state) => {
      const next = { ...state.pinnedAgentTabIds }
      if (next[tabId]) {
        delete next[tabId]
      } else {
        next[tabId] = true
      }
      persistRecord(PINNED_AGENT_TABS_STORAGE_KEY, next)
      return { pinnedAgentTabIds: next }
    })
  },
  toggleSidebarAgentsCollapsed: (worktreeId) => {
    set((state) => {
      const next = {
        ...state.sidebarAgentsCollapsedByWorktreeId,
        [worktreeId]: !state.sidebarAgentsCollapsedByWorktreeId[worktreeId]
      }
      persistRecord(SIDEBAR_COLLAPSED_STORAGE_KEY, next)
      return { sidebarAgentsCollapsedByWorktreeId: next }
    })
  },
  setPanelTerminalHostTabId: (worktreeId, tabId) => {
    set((state) => {
      const current = state.panelTerminalHostTabIdByWorktree[worktreeId]
      if ((current ?? null) === tabId) {
        return state
      }
      const next = { ...state.panelTerminalHostTabIdByWorktree }
      if (tabId === null) {
        delete next[worktreeId]
      } else {
        next[worktreeId] = tabId
      }
      return { panelTerminalHostTabIdByWorktree: next }
    })
  },
  setPanelTerminalBodyElement: (element) => {
    set((state) =>
      state.panelTerminalBodyElement === element ? state : { panelTerminalBodyElement: element }
    )
  }
}))
