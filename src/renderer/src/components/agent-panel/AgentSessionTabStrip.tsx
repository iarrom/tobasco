// [FORK] Полоса сессий-табов панели агентов: по чипу на каждую агент-сессию
// активного worktree (иконка агента, заголовок, статус, закрытие) + меню «+»
// для запуска нового агента. Источник строк тот же, что у сайдбара
// (useWorktreeAgentRows), поэтому retained/lineage-сессии уже учтены.
import { Plus, X } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import type { TuiAgent } from '../../../../shared/types'
import type { LaunchSource } from '../../../../shared/telemetry-events'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { AgentIcon, getAgentCatalog } from '@/lib/agent-catalog'
import { AgentStateDot, type AgentDotState } from '@/components/AgentStateDot'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { orderTabLaunchAgents } from '@/components/tab-bar/tab-agent-launch-options'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { closeTerminalTab } from '../terminal/terminal-tab-actions'
import type { AgentPanelSession } from './agent-panel-session-model'
import { useAgentPanelState } from './agent-panel-state'

function toDotState(state: AgentPanelSession['state']): AgentDotState {
  switch (state) {
    case 'working':
    case 'blocked':
    case 'waiting':
    case 'done':
    case 'idle':
      return state
    case 'starting':
      return 'working'
  }
}

function sessionIconAgent(session: AgentPanelSession): TuiAgent | null {
  return session.agent && session.agent !== 'unknown' ? (session.agent as TuiAgent) : null
}

export function AgentSessionLaunchMenu({
  worktreeId,
  trigger,
  onBeforeLaunch,
  launchSource
}: {
  worktreeId: string
  trigger: React.ReactNode
  /** Запуск не с активного worktree (сайдбар): активировать его перед стартом,
   *  чтобы панель показала новую сессию. */
  onBeforeLaunch?: () => void
  launchSource?: LaunchSource
}): React.JSX.Element {
  const defaultAgent = useAppStore((s) => s.settings?.defaultTuiAgent)
  const { detectedIds } = useDetectedAgents(null)
  const agents = useMemo(
    () => orderTabLaunchAgents(defaultAgent, detectedIds ?? []),
    [defaultAgent, detectedIds]
  )
  const catalog = useMemo(() => getAgentCatalog(), [])

  const onLaunch = useCallback(
    (agent: TuiAgent) => {
      onBeforeLaunch?.()
      launchAgentInNewTab({ agent, worktreeId, ...(launchSource ? { launchSource } : {}) })
    },
    [launchSource, onBeforeLaunch, worktreeId]
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {agents.length > 0 ? (
          agents.map((agent) => (
            <DropdownMenuItem key={agent} onSelect={() => onLaunch(agent)}>
              <AgentIcon agent={agent} size={14} />
              <span className="min-w-0 truncate">
                {catalog.find((entry) => entry.id === agent)?.label ?? agent}
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>Агенты не найдены</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AgentSessionTabStrip({
  worktreeId,
  sessions,
  activeSessionKey
}: {
  worktreeId: string
  sessions: readonly AgentPanelSession[]
  activeSessionKey: string | null
}): React.JSX.Element {
  const selectSession = useAgentPanelState((s) => s.selectSession)

  const onClose = useCallback(
    (session: AgentPanelSession) => {
      closeTerminalTab(session.tabId)
      useAgentPanelState.getState().clearSessionSelection(worktreeId, session.tabId)
    },
    [worktreeId]
  )

  return (
    <div
      role="tablist"
      aria-label="Сессии агентов"
      className="agent-session-tab-strip flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1"
    >
      {sessions.map((session) => {
        const isActive = session.key === activeSessionKey
        const isRetained = session.row?.rowSource === 'retained'
        return (
          <div
            key={session.key}
            role="tab"
            aria-selected={isActive}
            data-current={isActive || undefined}
            tabIndex={0}
            onClick={() => selectSession(worktreeId, session.key)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                selectSession(worktreeId, session.key)
              }
            }}
            title={session.title}
            className={cn(
              'group flex h-6 max-w-40 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-xs transition-colors',
              isActive
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              isRetained && 'opacity-60'
            )}
          >
            <AgentIcon agent={sessionIconAgent(session)} size={13} />
            <span className="min-w-0 flex-1 truncate">{session.title}</span>
            <AgentStateDot state={toDotState(session.state)} />
            {!isRetained ? (
              <button
                type="button"
                aria-label="Закрыть сессию"
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(session)
                }}
                className="flex size-3.5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-foreground/10"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        )
      })}
      <AgentSessionLaunchMenu
        worktreeId={worktreeId}
        trigger={
          <button
            type="button"
            aria-label="Новая сессия агента"
            title="Новая сессия агента"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        }
      />
    </div>
  )
}
