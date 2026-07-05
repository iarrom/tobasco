// [FORK] Панель агент-сессий (Cursor-раскладка: левый сайдбар → панель →
// вкладки). Полоса сессий-табов активного worktree + тело: native-чат для
// поддерживаемых агентов, живой терминал (портал из TerminalPaneOverlayLayer)
// для остальных. Выбор сессии живёт в fork-сторе agent-panel-state.
import { Maximize2, MessageSquare, Minimize2, SquareTerminal } from 'lucide-react'
import { useCallback, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store'
import { SYNC_FIT_PANES_EVENT } from '@/constants/terminal'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { getAgentCatalog, AgentIcon } from '@/lib/agent-catalog'
import { orderTabLaunchAgents } from '@/components/tab-bar/tab-agent-launch-options'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'
import { AgentSessionTabStrip } from '@/components/agent-panel/AgentSessionTabStrip'
import {
  defaultAgentPanelSessionView,
  isAgentPanelManagedTab
} from '@/components/agent-panel/agent-panel-managed-tab'
import {
  buildAgentPanelSessions,
  resolveAgentPanelPtyId,
  resolveAgentPanelTargetSession
} from '@/components/agent-panel/agent-panel-session-model'
import { useAgentPanelState } from '@/components/agent-panel/agent-panel-state'
import { isNativeChatSupportedAgent } from './native-chat-availability'
import { useAgentChatColumnState } from './agent-chat-column-state'
import NativeChatView from './NativeChatView'

const EMPTY_TERMINAL_TABS: readonly never[] = []

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
 *  new agent can be started straight from the panel (Cursor parity). */
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
                launchAgentInNewTab({ agent, worktreeId })
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
  const { expanded, toggleExpanded } = useAgentChatColumnState(
    useShallow((s) => ({ expanded: s.expanded, toggleExpanded: s.toggleExpanded }))
  )

  const rows = useWorktreeAgentRows(activeWorktreeId ?? '', activeWorktreeId != null)
  const terminalTabs = useAppStore((s) =>
    activeWorktreeId
      ? (s.tabsByWorktree[activeWorktreeId] ?? EMPTY_TERMINAL_TABS)
      : EMPTY_TERMINAL_TABS
  )
  const sessions = useMemo(() => buildAgentPanelSessions(rows, terminalTabs), [rows, terminalTabs])

  const selectedSessionKey = useAgentPanelState((s) =>
    activeWorktreeId ? (s.selectedSessionKeyByWorktree[activeWorktreeId] ?? null) : null
  )
  const activeTabId = useAppStore((s) =>
    activeWorktreeId ? (s.activeTabIdByWorktree[activeWorktreeId] ?? null) : null
  )
  const target = useMemo(
    () => resolveAgentPanelTargetSession(sessions, selectedSessionKey, activeTabId),
    [sessions, selectedSessionKey, activeTabId]
  )
  const targetTab = useMemo(
    () => terminalTabs.find((tab) => tab.id === target?.tabId) ?? null,
    [terminalTabs, target?.tabId]
  )

  const viewOverride = useAgentPanelState((s) =>
    target ? s.sessionViewBySessionKey[target.key] : undefined
  )
  const setSessionView = useAgentPanelState((s) => s.setSessionView)
  const chatCapable = isNativeChatSupportedAgent(target?.agent ?? null)
  const view = target ? (viewOverride ?? defaultAgentPanelSessionView(target.agent)) : 'chat'
  const showTerminal = target != null && (!chatCapable || view === 'terminal')

  const ptyMaps = useAppStore(
    useShallow((s) => ({
      ptyIdsByTabId: s.ptyIdsByTabId,
      terminalLayoutsByTabId: s.terminalLayoutsByTabId
    }))
  )
  const targetPtyId = target
    ? resolveAgentPanelPtyId(
        target,
        ptyMaps.ptyIdsByTabId,
        ptyMaps.terminalLayoutsByTabId,
        targetTab?.ptyId
      )
    : null

  // Панельная сессия не должна держать viewMode==='chat': TerminalPane
  // отрисовал бы собственный чат-оверлей поверх портированного терминала.
  // viewMode живёт на unified-табе (его и читает TerminalPane), не на
  // TerminalTab — проверять и сбрасывать нужно именно unified.
  const targetUnifiedTab = useAppStore((s) =>
    activeWorktreeId && target
      ? ((s.unifiedTabsByWorktree[activeWorktreeId] ?? []).find(
          (tab) => tab.contentType === 'terminal' && tab.entityId === target.tabId
        ) ?? null)
      : null
  )
  useEffect(() => {
    if (targetTab && isAgentPanelManagedTab(targetTab) && targetUnifiedTab?.viewMode === 'chat') {
      useAppStore.getState().setTabViewMode(targetUnifiedTab.id, 'terminal')
    }
  }, [targetTab, targetUnifiedTab])

  // Публикуем хост панельного терминала: TerminalPaneOverlayLayer портирует
  // TerminalPane выбранной сессии в тело панели (см. agent-panel-state).
  const panelHostTabId = showTerminal && target ? target.tabId : null
  useEffect(() => {
    if (!activeWorktreeId) {
      return
    }
    const worktreeId = activeWorktreeId
    useAgentPanelState.getState().setPanelTerminalHostTabId(worktreeId, panelHostTabId)
    return () => {
      useAgentPanelState.getState().setPanelTerminalHostTabId(worktreeId, null)
    }
  }, [activeWorktreeId, panelHostTabId])

  // Перефит xterm после смены хоста/сессии — портал меняет геометрию контейнера.
  useEffect(() => {
    if (!showTerminal) {
      return
    }
    const frame = requestAnimationFrame(() => {
      window.dispatchEvent(new Event(SYNC_FIT_PANES_EVENT))
    })
    return () => cancelAnimationFrame(frame)
  }, [showTerminal, target?.tabId])

  const setPanelTerminalBodyElement = useAgentPanelState((s) => s.setPanelTerminalBodyElement)

  return (
    <div className="relative flex h-full w-full min-h-0 flex-col">
      {/* 4px drag strip + 32px row = 36px top band, so bg-card and border-b
          line up with the center column's tab chrome (TabGroupSplitLayout)
          and the sidebar's titlebar-left seam. */}
      <div className="h-[4px] shrink-0 bg-card" data-terminal-focus-release-surface="true" />
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border bg-card pr-1.5">
        {activeWorktreeId && sessions.length > 0 ? (
          <AgentSessionTabStrip
            worktreeId={activeWorktreeId}
            sessions={sessions}
            activeSessionKey={target?.key ?? null}
          />
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        {target && chatCapable ? (
          <button
            type="button"
            onClick={() => setSessionView(target.key, view === 'chat' ? 'terminal' : 'chat')}
            aria-label={view === 'chat' ? 'Показать терминал' : 'Показать чат'}
            title={view === 'chat' ? 'Показать терминал' : 'Показать чат'}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          >
            {view === 'chat' ? (
              <SquareTerminal className="size-3.5" />
            ) : (
              <MessageSquare className="size-3.5" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          onClick={toggleExpanded}
          aria-label={expanded ? 'Свернуть чат' : 'Развернуть чат'}
          title={expanded ? 'Свернуть чат' : 'Развернуть чат'}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
        >
          {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {target ? (
          showTerminal ? (
            // Цель портала живого TerminalPane выбранной сессии (тот же
            // приём, что activity-terminal-portal): пейн не перемонтируется,
            // TUI-состояние (alt-screen) сохраняется.
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div
                ref={setPanelTerminalBodyElement}
                className="absolute inset-0 min-h-0 min-w-0"
                data-agent-panel-terminal-body="true"
              />
            </div>
          ) : (
            <NativeChatView
              key={target.key}
              terminalTabId={target.tabId}
              paneKey={target.paneKey ?? `${target.tabId}:`}
              targetPtyId={targetPtyId}
              launchAgent={targetTab?.launchAgent ?? null}
            />
          )
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
