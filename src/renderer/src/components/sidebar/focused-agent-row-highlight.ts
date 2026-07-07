import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { isTerminalLeafId, makePaneKey } from '../../../../shared/stable-pane-id'
// [FORK] Подсветка выбранной в панели сессии (см. useFocusedAgentPaneKey).
import { AGENT_PANEL_ENABLED } from '@/components/agent-panel/agent-panel-managed-tab'
import { useAgentPanelState } from '@/components/agent-panel/agent-panel-state'

export type FocusedAgentRowHighlightState = Pick<
  AppState,
  | 'activeWorktreeId'
  | 'activeTabType'
  | 'activeTabId'
  | 'tabsByWorktree'
  | 'terminalLayoutsByTabId'
  | 'agentStatusByPaneKey'
  | 'retainedAgentsByPaneKey'
  | 'migrationUnsupportedByPtyId'
>

export function getFocusedAgentPaneKeyForWorktree(
  state: FocusedAgentRowHighlightState,
  worktreeId: string
): string | null {
  if (state.activeWorktreeId !== worktreeId || state.activeTabType !== 'terminal') {
    return null
  }

  const activeTabId = state.activeTabId
  if (!activeTabId) {
    return null
  }

  const activeTabBelongsToWorktree = (state.tabsByWorktree[worktreeId] ?? []).some(
    (tab) => tab.id === activeTabId
  )
  if (!activeTabBelongsToWorktree) {
    return null
  }

  const activeLeafId = state.terminalLayoutsByTabId[activeTabId]?.activeLeafId
  if (!activeLeafId || !isTerminalLeafId(activeLeafId)) {
    return null
  }

  const activePaneKey = makePaneKey(activeTabId, activeLeafId)
  // Why: the inline card lists every agent attributed to this worktree, even
  // after its status decays to idle. Highlight whichever displayed row matches
  // the focused pane — gating on freshness left clicked-into stale rows with no
  // selection coloring.
  if (state.agentStatusByPaneKey[activePaneKey]) {
    return activePaneKey
  }

  if (state.retainedAgentsByPaneKey[activePaneKey]?.worktreeId === worktreeId) {
    return activePaneKey
  }

  const hasMigrationUnsupportedRow = Object.values(state.migrationUnsupportedByPtyId).some(
    (entry) => entry.paneKey === activePaneKey
  )
  return hasMigrationUnsupportedRow ? activePaneKey : null
}

/** [FORK] Строка агента совпадает с ключом подсветки: точный paneKey либо
 *  синтетический `tabId:` только что запущенной сессии (лист ещё не известен). */
export function agentRowMatchesFocusedKey(paneKey: string, focusedKey: string | null): boolean {
  if (!focusedKey) {
    return false
  }
  return focusedKey.endsWith(':') ? paneKey.startsWith(focusedKey) : paneKey === focusedKey
}

export function useFocusedAgentPaneKey(worktreeId: string): string | null {
  // [FORK] Панель агентов: подсвечиваем сессию, выбранную в панели активного
  // воркспейса — это «активный открытый агент», единственная подсветка в
  // сайдбаре (карточка воркспейса активность больше не подкрашивает).
  const panelSelectedKey = useAgentPanelState((s) =>
    AGENT_PANEL_ENABLED ? (s.selectedSessionKeyByWorktree[worktreeId] ?? null) : null
  )
  const worktreeIsActive = useAppStore((s) => s.activeWorktreeId === worktreeId)
  const focusedByActivePane = useAppStore((state) =>
    getFocusedAgentPaneKeyForWorktree(state, worktreeId)
  )
  if (worktreeIsActive && panelSelectedKey) {
    return panelSelectedKey
  }
  return focusedByActivePane
}
