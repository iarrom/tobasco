// [FORK] Действия строк агентов в сайдбаре (Cursor-стиль): партиция «пины
// сверху» и «архив» (закрыть живую сессию / зачистить retained-след).
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import { useAppStore } from '@/store'
import { useAgentPanelState } from '@/components/agent-panel/agent-panel-state'
import { closeTerminalTab } from '../terminal/terminal-tab-actions'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { isAgentPanelManagedTab } from '@/components/agent-panel/agent-panel-managed-tab'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { dismissStaleAgentRowByKey } from '../terminal-pane/stale-agent-row'

type AgentRowLineageTree = {
  rootRows: DashboardAgentRow[]
  childrenByParentPaneKey: Map<string, DashboardAgentRow[]>
}

export function partitionPinnedAgentRoots<T extends AgentRowLineageTree>(
  tree: T,
  pinnedAgentTabIds: Record<string, boolean>
): T {
  const pinned = tree.rootRows.filter((row) => pinnedAgentTabIds[row.tab.id])
  if (pinned.length === 0) {
    return tree
  }
  const rest = tree.rootRows.filter((row) => !pinnedAgentTabIds[row.tab.id])
  return { ...tree, rootRows: [...pinned, ...rest] }
}

export function archiveWorktreeAgentRow(agent: DashboardAgentRow, worktreeId: string): void {
  const state = useAppStore.getState()
  if (agent.rowSource === 'retained') {
    state.dropAgentStatus(agent.paneKey)
    state.dismissRetainedAgent(agent.paneKey)
    return
  }
  closeTerminalTab(agent.tab.id)
  useAgentPanelState.getState().clearSessionSelection(worktreeId, agent.tab.id)
}

/** Клик по строке агента: активирует воркспейс и открывает сессию — панельную
 *  в панели агентов, обычную фокусом пейна. Черновик (`tabId:`) и стейл-ключи
 *  обрабатываются как в прежнем инлайн-хендлере WorktreeCardAgents. */
export function activateWorktreeAgentRowTab(
  worktreeId: string,
  tabId: string,
  paneKey: string
): void {
  // Черновик панельной сессии: лист ещё неизвестен — выбираем сессию в панели.
  if (paneKey === `${tabId}:`) {
    activateAndRevealWorktree(worktreeId)
    const draftTab = useAppStore.getState().tabsByWorktree[worktreeId]?.find((t) => t.id === tabId)
    if (draftTab && isAgentPanelManagedTab(draftTab)) {
      useAgentPanelState.getState().selectSession(worktreeId, paneKey)
    }
    return
  }
  const parsed = parsePaneKey(paneKey)
  if (!parsed) {
    // Why: malformed or legacy numeric keys cannot be resolved safely after
    // pane replay/remount, so drop the stale row instead of guessing.
    console.warn('[WorktreeCardAgents] malformed paneKey, skipping pane focus', paneKey)
    dismissStaleAgentRowByKey(paneKey)
    return
  }
  if (parsed.tabId !== tabId) {
    console.warn('[WorktreeCardAgents] paneKey tabId mismatch, dismissing row', { tabId, paneKey })
    dismissStaleAgentRowByKey(paneKey)
    return
  }
  // Why: route through activateAndRevealWorktree so cross-repo clicks also set
  // activeRepoId, record nav history, clear sidebar filters and reveal the card.
  activateAndRevealWorktree(worktreeId)
  const tabs = useAppStore.getState().tabsByWorktree[worktreeId] ?? []
  const clickedTab = tabs.find((t) => t.id === tabId)
  if (clickedTab) {
    // Панельная сессия: таб скрыт из таб-бара — выбираем сессию в панели.
    if (isAgentPanelManagedTab(clickedTab)) {
      useAgentPanelState.getState().selectSession(worktreeId, paneKey)
      return
    }
    activateTabAndFocusPane(tabId, parsed.leafId, {
      ackPaneKeyOnSuccess: paneKey,
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
  } else {
    const liveEntry = useAppStore.getState().agentStatusByPaneKey[paneKey]
    if (liveEntry?.worktreeId === worktreeId) {
      // Why: orchestration worker status can be worktree-attributed before the
      // renderer knows its tab; keep the live row visible.
      return
    }
    dismissStaleAgentRowByKey(paneKey)
  }
}
