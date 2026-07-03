// [FORK] Постоянный бар-чат активного агента (Cursor-раскладка: левый сайдбар →
// чат → вкладки). Самостоятельная обёртка над NativeChatView: резолвит агента
// активного воркспейса из стора (без pane-manager), даёт ресайз ширины и режим
// «развернуть на весь центр».
import { Maximize2, Minimize2 } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { TuiAgent } from '../../../../shared/types'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { useAppStore } from '../../store'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { getAgentCatalog, AgentIcon } from '@/lib/agent-catalog'
import { orderTabLaunchAgents } from '@/components/tab-bar/tab-agent-launch-options'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { useAgentChatColumnState } from './agent-chat-column-state'
import { findTabAgentEntry } from './native-chat-tab-agent-entry'
import NativeChatView from './NativeChatView'

type ResolvedAgentTarget = {
  terminalTabId: string
  paneKey: string
  launchAgent: TuiAgent | null
  targetPtyId: string | null
}

/** Resolve the active worktree's agent chat target purely from store state —
 *  the live pane manager (which TerminalPane uses) isn't available here. */
function useActiveAgentTarget(): ResolvedAgentTarget | null {
  const snapshot = useAppStore(
    useShallow((s) => ({
      worktreeId: s.activeWorktreeId,
      activeTabId: s.activeWorktreeId ? s.activeTabIdByWorktree[s.activeWorktreeId] : null,
      agentStatusByPaneKey: s.agentStatusByPaneKey,
      tabsByWorktree: s.tabsByWorktree,
      ptyIdsByTabId: s.ptyIdsByTabId,
      terminalLayoutsByTabId: s.terminalLayoutsByTabId
    }))
  )

  return useMemo(() => {
    const { worktreeId } = snapshot
    if (!worktreeId) {
      return null
    }

    // Prefer the active tab's agent; fall back to any agent attributed to this
    // worktree (survives before the tab is mounted / focused).
    const entry =
      (snapshot.activeTabId
        ? findTabAgentEntry(snapshot.agentStatusByPaneKey, snapshot.activeTabId)
        : null) ??
      Object.values(snapshot.agentStatusByPaneKey).find((e) => e.worktreeId === worktreeId) ??
      null
    const parsed = entry ? parsePaneKey(entry.paneKey) : null
    if (entry && parsed) {
      const { tabId, leafId } = parsed
      const launchAgent =
        snapshot.tabsByWorktree[worktreeId]?.find((t) => t.id === tabId)?.launchAgent ?? null
      // Replicate getPtyIdForPaneKey: prefer the leaf-bound pty, else the tab's
      // first live pty. Needed for sends.
      const tabPtyIds = snapshot.ptyIdsByTabId[tabId] ?? []
      const leafPty = snapshot.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId?.[leafId]
      const targetPtyId = leafPty && tabPtyIds.includes(leafPty) ? leafPty : (tabPtyIds[0] ?? null)
      return { terminalTabId: tabId, paneKey: entry.paneKey, launchAgent, targetPtyId }
    }

    // [FORK] Just-launched agent: no status entry yet, but the active tab carries
    // launchAgent — resolve its chat immediately so the column picks it up.
    const { activeTabId } = snapshot
    if (activeTabId) {
      const tab = snapshot.tabsByWorktree[worktreeId]?.find((t) => t.id === activeTabId)
      if (tab?.launchAgent) {
        const tabPtyIds = snapshot.ptyIdsByTabId[activeTabId] ?? []
        return {
          terminalTabId: activeTabId,
          paneKey: `${activeTabId}:`,
          launchAgent: tab.launchAgent,
          targetPtyId: tab.ptyId ?? tabPtyIds[0] ?? null
        }
      }
    }
    return null
  }, [snapshot])
}

/** Drag handle on the column's right edge. Dragging right widens the chat. */
function ChatColumnResizeHandle(): React.JSX.Element {
  const setWidth = useAgentChatColumnState((s) => s.setWidth)
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = useAgentChatColumnState.getState().width
      const onMove = (move: PointerEvent) => setWidth(startWidth + (move.clientX - startX))
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [setWidth]
  )
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      className="absolute top-0 right-0 z-20 h-full w-1 cursor-col-resize hover:bg-ring/40"
    />
  )
}

/** Empty-state launcher: offers the same agents as the tab-bar "+" menu, so a
 *  new agent can be started straight from the chat bar (Cursor parity). */
function AgentChatLaunchChoices({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const defaultAgent = useAppStore((s) => s.settings?.defaultTuiAgent)
  const { detectedIds } = useDetectedAgents(null) // local detection
  const agents = useMemo(
    () => orderTabLaunchAgents(defaultAgent, detectedIds ?? []),
    [defaultAgent, detectedIds]
  )
  const catalog = useMemo(() => getAgentCatalog(), [])

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-[260px] flex-col gap-0.5">
        <p className="mb-1 px-2 text-xs font-medium text-muted-foreground/70">Запустить агента</p>
        {agents.length > 0 ? (
          agents.map((agent) => (
            <button
              key={agent}
              type="button"
              onClick={() => {
                const result = launchAgentInNewTab({ agent, worktreeId })
                // [FORK] Чат живёт в колонке → таб агента в центре открываем
                // терминалом, чтобы не дублировать чат.
                if (result?.tabId) {
                  useAppStore.getState().setTabViewMode(result.tabId, 'terminal')
                }
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
            >
              <AgentIcon agent={agent} size={16} />
              <span className="min-w-0 truncate">
                {catalog.find((entry) => entry.id === agent)?.label ?? agent}
              </span>
            </button>
          ))
        ) : (
          <p className="px-2 text-xs text-muted-foreground/60">Агенты не найдены.</p>
        )}
      </div>
    </div>
  )
}

export function AgentChatColumn(): React.JSX.Element {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const target = useActiveAgentTarget()
  const { expanded, toggleExpanded } = useAgentChatColumnState(
    useShallow((s) => ({ expanded: s.expanded, toggleExpanded: s.toggleExpanded }))
  )

  return (
    <div className="relative flex h-full w-full min-h-0 flex-col">
      {/* Slim chrome: expand/collapse to/from full center width. */}
      <div className="flex h-7 shrink-0 items-center justify-end px-1.5">
        <button
          type="button"
          onClick={toggleExpanded}
          aria-label={expanded ? 'Свернуть чат' : 'Развернуть чат'}
          title={expanded ? 'Свернуть чат' : 'Развернуть чат'}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
        >
          {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {target ? (
          <NativeChatView
            terminalTabId={target.terminalTabId}
            paneKey={target.paneKey}
            targetPtyId={target.targetPtyId}
            launchAgent={target.launchAgent}
          />
        ) : activeWorktreeId ? (
          <AgentChatLaunchChoices worktreeId={activeWorktreeId} />
        ) : null}
      </div>

      {/* No resize affordance in full-width mode. */}
      {expanded ? null : <ChatColumnResizeHandle />}
    </div>
  )
}

export default AgentChatColumn
