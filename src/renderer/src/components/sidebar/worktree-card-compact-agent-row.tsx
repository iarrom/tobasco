import React, { useCallback } from 'react'
import { Archive, ChevronRight, Pin, PinOff } from 'lucide-react'
import { agentStateLabel } from '@/components/AgentStateDot'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { AgentIcon } from '@/lib/agent-catalog'
import { agentTypeToIconAgent, formatAgentTypeLabel } from '@/lib/agent-status'
import { cn } from '@/lib/utils'
import { getAgentDotState } from './worktree-card-agent-summary'
import { translate } from '@/i18n/i18n'
import { getAgentRowPrimaryText } from '@/lib/agent-row-primary-text'
import CacheTimer, { usePromptCacheCountdownForPane } from './CacheTimer'

function formatShortTimeAgo(ts: number, now: number): string {
  const delta = now - ts
  if (delta < 60_000) {
    return 'now'
  }
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h`
  }
  return `${Math.floor(hours / 24)}d`
}

function lastEnteredDoneAt(agent: DashboardAgentRowData): number | null {
  const entry = agent.entry
  if (entry.state === 'done') {
    return entry.stateStartedAt
  }
  for (let i = (entry.stateHistory?.length ?? 0) - 1; i >= 0; i--) {
    if (entry.stateHistory[i].state === 'done') {
      return entry.stateHistory[i].startedAt
    }
  }
  return null
}

function getCompactAgentPrimary(agent: DashboardAgentRowData): string {
  const prompt = getAgentRowPrimaryText(agent.entry)
  if (prompt) {
    return prompt
  }
  // [FORK] Черновик нового чата без промпта читается именем таба (как в
  // панели), а не словом состояния.
  const tabLabel = agent.tab.customTitle ?? agent.tab.generatedTitle ?? agent.tab.title
  return tabLabel || agentStateLabel(getAgentDotState(agent))
}

function getCompactAgentSecondary(agent: DashboardAgentRowData): string {
  if (agent.entry.interrupted === true) {
    return 'Interrupted by user'
  }
  if (agent.state === 'working') {
    const toolName = agent.entry.toolName?.trim() ?? ''
    const toolInput = agent.entry.toolInput?.trim() ?? ''
    if (toolName && toolInput) {
      return `${toolName}: ${toolInput}`
    }
    if (toolName) {
      return toolName
    }
  }
  return agent.entry.lastAssistantMessage?.trim() || formatAgentTypeLabel(agent.agentType)
}

function getCompactAgentTime(agent: DashboardAgentRowData, now: number): string | null {
  const doneAt = lastEnteredDoneAt(agent)
  if (doneAt !== null) {
    return formatShortTimeAgo(doneAt, now)
  }
  const startedAt = agent.startedAt > 0 ? agent.startedAt : agent.entry.stateStartedAt
  return startedAt > 0 ? formatShortTimeAgo(startedAt, now) : null
}

function stopActivationKeyPropagation(e: React.KeyboardEvent): void {
  // Why: the surrounding worktree list handles Enter/Space as row activation.
  // Focused nested buttons need those keys to stay local.
  if (e.key === 'Enter' || e.key === ' ') {
    e.stopPropagation()
  }
}

type CompactAgentRowProps = {
  agent: DashboardAgentRowData
  now: number
  onActivate: (tabId: string, paneKey: string) => void
  // Why: send-popover target mode temporarily turns compact sidebar rows into
  // the picker surface, matching the full DashboardAgentRow behavior.
  sendTargetStatus?: 'eligible' | 'disabled' | 'sending'
  sendTargetDisabledReason?: string
  onSendTargetClick?: (paneKey: string) => void
  childAgentCount?: number
  childAgentsExpanded?: boolean
  onToggleChildAgents?: () => void
  reserveDisclosureGutter?: boolean
  isFocusedPane?: boolean
  hideIdentityIcon?: boolean
  /** [FORK] Непрочитанность строки — для янтарного кружка завершённой работы. */
  isUnvisited?: boolean
  /** [FORK] Hover-действия строки: пин (закрепить сверху) и архив (закрыть). */
  isPinned?: boolean
  onTogglePin?: () => void
  onArchive?: () => void
  cacheTimerActive?: boolean
}

export const CompactAgentRow = React.memo(function CompactAgentRow({
  agent,
  now,
  onActivate,
  sendTargetStatus,
  sendTargetDisabledReason,
  onSendTargetClick,
  childAgentCount,
  childAgentsExpanded = false,
  onToggleChildAgents,
  reserveDisclosureGutter = false,
  isFocusedPane = false,
  hideIdentityIcon = false,
  isUnvisited = false,
  isPinned = false,
  onTogglePin,
  onArchive,
  cacheTimerActive = true
}: CompactAgentRowProps) {
  const hasChildDisclosure =
    typeof childAgentCount === 'number' &&
    childAgentCount > 0 &&
    typeof onToggleChildAgents === 'function'
  const dotState = getAgentDotState(agent)
  const chatStarted = getAgentRowPrimaryText(agent.entry).length > 0
  const rowIndicator = !chatStarted
    ? ('draft' as const)
    : isUnvisited && (dotState === 'done' || dotState === 'idle')
      ? ('unread-done' as const)
      : null
  const primary = getCompactAgentPrimary(agent)
  const isLineageChild = agent.lineage?.depth === 1
  const secondary = getCompactAgentSecondary(agent)
  const shortTime = getCompactAgentTime(agent, now)
  const cacheTimer = usePromptCacheCountdownForPane(agent.paneKey, cacheTimerActive)

  const handleActivate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onActivate(agent.tab.id, agent.paneKey)
    },
    [agent.paneKey, agent.tab.id, onActivate]
  )
  const handleSendTargetClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (!sendTargetStatus) {
        return
      }
      const target = e.target
      if (
        target instanceof Element &&
        target.closest('button, a, input, textarea, select, [role="button"]')
      ) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      if (sendTargetStatus === 'eligible') {
        onSendTargetClick?.(agent.paneKey)
      }
    },
    [agent.paneKey, onSendTargetClick, sendTargetStatus]
  )
  const handleToggleChildren = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      onToggleChildAgents?.()
    },
    [onToggleChildAgents]
  )

  const rowBody = (
    <>
      {hasChildDisclosure ? (
        <button
          type="button"
          className="compact-agent-child-disclosure-button flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-worktree-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring"
          aria-label={translate(
            'auto.components.sidebar.worktree.card.compact.agents.a128d7006b',
            '{{value0}} {{value1}} child {{value2}}',
            {
              value0: childAgentsExpanded ? 'Hide' : 'Show',
              value1: childAgentCount,
              value2: childAgentCount === 1 ? 'agent' : 'agents'
            }
          )}
          aria-expanded={childAgentsExpanded}
          onClick={handleToggleChildren}
          onKeyDown={stopActivationKeyPropagation}
        >
          <ChevronRight
            className={cn(
              'size-3 transition-transform duration-150',
              childAgentsExpanded && 'rotate-90'
            )}
            aria-hidden
          />
        </button>
      ) : reserveDisclosureGutter ? (
        <span className="size-4 shrink-0" aria-hidden />
      ) : null}
      {/* [FORK] Единый минимальный индикатор вместо стейт-дота: приглушённый
          кружок — драфт (чат не начат), янтарный — агент завершил и не
          прочитано. Слот фиксированной ширины — небольшой внутренний отступ
          строки, куда кружок встаёт, не сдвигая текст. */}
      <span className="flex w-2.5 shrink-0 items-center justify-center" aria-hidden>
        {rowIndicator === 'draft' ? (
          <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        ) : rowIndicator === 'unread-done' ? (
          <span className="size-1.5 rounded-full bg-amber-500" />
        ) : null}
      </span>
      {!hideIdentityIcon && (
        <span className="inline-flex shrink-0" title={formatAgentTypeLabel(agent.agentType)}>
          <AgentIcon agent={agentTypeToIconAgent(agent.agentType)} size={13} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        {/* Why: the selected-row fill is strong enough to wash out the dimmed
            prompt/secondary text, so lift both toward full foreground when focused. */}
        <span className={isFocusedPane ? 'text-foreground' : 'text-muted-foreground/90'}>
          {primary}
        </span>
        {secondary && (
          <span className={isFocusedPane ? 'text-foreground/70' : 'text-muted-foreground/65'}>
            {' '}
            - {secondary}
          </span>
        )}
      </span>
      {hasChildDisclosure && !childAgentsExpanded && (
        <span
          className={cn(
            'shrink-0 text-[10px] tabular-nums',
            isFocusedPane ? 'text-foreground/70' : 'text-muted-foreground/70'
          )}
        >
          +{childAgentCount}
        </span>
      )}
      {/* [FORK] Hover-действия (Cursor-стиль): пин и архив справа, перед временем. */}
      {onTogglePin || onArchive ? (
        <span
          className={cn(
            'flex shrink-0 items-center gap-0.5',
            isPinned
              ? ''
              : 'opacity-0 transition-opacity group-hover/compact-agent-row:opacity-100 group-focus-within/compact-agent-row:opacity-100'
          )}
        >
          {onTogglePin ? (
            <button
              type="button"
              aria-label={isPinned ? 'Открепить сессию' : 'Закрепить сессию'}
              title={isPinned ? 'Открепить' : 'Закрепить'}
              className="flex size-5 items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-worktree-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onTogglePin()
              }}
              onKeyDown={stopActivationKeyPropagation}
            >
              {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            </button>
          ) : null}
          {onArchive ? (
            <button
              type="button"
              aria-label="Архивировать сессию"
              title="Архивировать"
              className="flex size-5 items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-worktree-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onArchive()
              }}
              onKeyDown={stopActivationKeyPropagation}
            >
              <Archive className="size-3.5" />
            </button>
          ) : null}
        </span>
      ) : null}
      {cacheTimer && <CacheTimer startedAt={cacheTimer.startedAt} ttlMs={cacheTimer.ttlMs} />}
      {shortTime && (
        <span
          className={cn(
            'shrink-0 text-[10px] tabular-nums',
            // Why: the muted timestamp drops out against the selected-row fill.
            isFocusedPane ? 'text-foreground/70' : 'text-muted-foreground/60',
            // [FORK] На hover время уступает место кнопкам пина/архива (Cursor-стиль).
            (onTogglePin || onArchive) &&
              'group-hover/compact-agent-row:hidden group-focus-within/compact-agent-row:hidden'
          )}
        >
          {shortTime}
        </span>
      )}
    </>
  )

  return (
    <div
      draggable={false}
      className={cn(
        'compact-agent-row group/compact-agent-row min-w-0 cursor-pointer rounded-sm px-1 text-sm leading-none',
        'text-muted-foreground worktree-agent-row-hover',
        hasChildDisclosure && 'worktree-agent-lineage-parent-row',
        isLineageChild && 'worktree-agent-lineage-child-row',
        // [FORK] Чуть выше строка (28px) — просторнее и легче кликать.
        'flex h-7 items-center gap-1',
        isFocusedPane && 'bg-worktree-sidebar-accent',
        sendTargetStatus === 'sending' && 'cursor-progress opacity-75',
        sendTargetStatus === 'disabled' && 'cursor-default opacity-60'
      )}
      onClickCapture={handleSendTargetClickCapture}
      onClick={handleActivate}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDragStart={(e) => e.stopPropagation()}
      data-focused-agent-pane={isFocusedPane ? 'true' : undefined}
      data-agent-send-target={sendTargetStatus}
      role={agent.lineage ? 'treeitem' : undefined}
      aria-level={agent.lineage ? agent.lineage.depth + 1 : undefined}
      aria-expanded={hasChildDisclosure ? childAgentsExpanded : undefined}
      title={sendTargetDisabledReason ?? `${primary}${secondary ? ` - ${secondary}` : ''}`}
    >
      {rowBody}
    </div>
  )
})
