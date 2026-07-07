import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import DashboardAgentRow from '@/components/dashboard/DashboardAgentRow'
import { useNow } from '@/components/dashboard/useNow'
import { deriveRunningAgentSendTargets } from '@/lib/running-agent-targets'
import { selectSendTargetInputs } from './worktree-card-send-target-inputs'
import { useWorktreeAgentRows } from './useWorktreeAgentRows'
import { cn } from '@/lib/utils'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { agentRowMatchesFocusedKey, useFocusedAgentPaneKey } from './focused-agent-row-highlight'
import {
  CompactAgentExpansion,
  CompactAgentRow,
  CompactAgentSummaryButton
} from './worktree-card-compact-agents'
import { buildAgentRowLineageTree } from '@/components/dashboard/agent-row-lineage-model'
import { DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE } from '../../../../shared/constants'
import { revealElementInScrollContainer } from './worktree-sidebar-reveal'
import { translate } from '@/i18n/i18n'
// [FORK] Панель агент-сессий: клик по managed-строке выбирает сессию в панели
// вместо активации скрытого таба в группе.
import { AGENT_PANEL_ENABLED } from '@/components/agent-panel/agent-panel-managed-tab'
import { useAgentPanelState } from '@/components/agent-panel/agent-panel-state'
import {
  activateWorktreeAgentRowTab,
  archiveWorktreeAgentRow,
  partitionPinnedAgentRoots
} from './worktree-agent-row-actions'
// [/FORK]

export const SUPPRESS_WORKTREE_LIST_SCROLL_ADJUSTMENT_EVENT =
  'orca-suppress-worktree-list-scroll-adjustment'

const dispatchSuppressScrollAdjustment = () => {
  window.dispatchEvent(new CustomEvent(SUPPRESS_WORKTREE_LIST_SCROLL_ADJUSTMENT_EVENT))
}

function revealCompactAgentCard(agentListRoot: HTMLElement | null): void {
  const sidebarElement = agentListRoot?.closest('[data-worktree-sidebar]')
  const worktreeOptionElement = agentListRoot?.closest('[role="option"]')
  if (!(sidebarElement instanceof HTMLElement) || !worktreeOptionElement) {
    return
  }
  revealElementInScrollContainer(sidebarElement, worktreeOptionElement, 'auto')
}

type Props = {
  worktreeId: string
  agents?: DashboardAgentRowData[]
  /** Controls spacing from the card body above. Passed in so the parent can
   *  decide whether a divider is appropriate — e.g. suppressed when the card
   *  chrome already provides visual separation. */
  className?: string
  /** [FORK] The sidebar wraps this list in its own «Агенты · N» disclosure;
   *  skip the compact "N agents" summary row so the card has one accordion. */
  suppressCompactSummary?: boolean
}

/**
 * Inline agent list rendered directly inside WorktreeCard when the
 * 'inline-agents' card property is enabled. Gives persistent per-card
 * visibility of each agent's live state, prompt, and last message.
 *
 * Reuses useWorktreeAgentRows + DashboardAgentRow so row layout and the
 * derivation stay consistent with the inline agent activity on each card.
 */
const WorktreeCardAgents = React.memo(function WorktreeCardAgents({
  worktreeId,
  agents: precomputedAgents,
  className,
  suppressCompactSummary
}: Props) {
  const selectedAgents = useWorktreeAgentRows(worktreeId, precomputedAgents === undefined)
  const agents = precomputedAgents ?? selectedAgents
  if (agents.length === 0) {
    return null
  }
  // Why: gate the 30s tick behind non-empty rows by mounting the inner body
  // only when there's something to show. The setInterval lives in the inner
  // component's useNow, so idle worktrees don't pay per-card timer cost.
  return (
    <WorktreeCardAgentsBody
      worktreeId={worktreeId}
      agents={agents}
      className={className}
      suppressCompactSummary={suppressCompactSummary}
    />
  )
})

type BodyProps = {
  worktreeId: string
  agents: DashboardAgentRowData[]
  className?: string
  suppressCompactSummary?: boolean
}

const WorktreeCardAgentsBody = React.memo(function WorktreeCardAgentsBody({
  worktreeId,
  agents,
  className,
  suppressCompactSummary
}: BodyProps) {
  const agentActivityDisplayMode =
    useAppStore((s) => s.agentActivityDisplayMode) ?? DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE
  const dropAgentStatus = useAppStore((s) => s.dropAgentStatus)
  const dismissRetainedAgent = useAppStore((s) => s.dismissRetainedAgent)
  const agentSendPopoverTargetMode = useAppStore((s) => s.agentSendPopoverTargetMode)
  const agentStatusEpoch = useAppStore((s) => s.agentStatusEpoch)
  // Why: these five maps are read only to derive send-target eligibility, which
  // matters only while the send-target popover targets THIS card. Two of them
  // (runtimePaneTitlesByTabId, agentStatusByPaneKey) churn on every pane-title
  // and agent-status write app-wide, so subscribing to them unconditionally made
  // every mounted agent body re-render on unrelated terminals. Gate the
  // subscription: return a stable empty constant when the popover isn't ours, so
  // useShallow keeps the same result and idle bodies stop reacting to the churn.
  const sendTargetInputs = useAppStore(useShallow((s) => selectSendTargetInputs(s, worktreeId)))
  const sendPromptToSidebarAgentTarget = useAppStore((s) => s.sendPromptToSidebarAgentTarget)
  const focusedAgentPaneKey = useFocusedAgentPaneKey(worktreeId)
  const compactAgentListRootRef = useRef<HTMLDivElement | null>(null)

  // Why: subscribe to the ack map reference (Object.is equality) and derive
  // per-agent unvisited flags locally. Keeps the inline list's bold/mute
  // behavior consistent with how acks flow elsewhere — rows bold on first
  // appearance and mute once the user has visited the agent's tab
  // (useAutoAckViewedAgent acks automatically on terminal focus). Without
  // this, all inline rows stayed muted regardless of attention state.
  const acknowledgedAgentsByPaneKey = useAppStore((s) => s.acknowledgedAgentsByPaneKey)
  const unvisitedByPaneKey = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const a of agents) {
      const ackAt = acknowledgedAgentsByPaneKey[a.paneKey] ?? 0
      out[a.paneKey] = ackAt < a.entry.stateStartedAt
    }
    return out
  }, [agents, acknowledgedAgentsByPaneKey])

  const handleDismissAgent = useCallback(
    (paneKey: string) => {
      dropAgentStatus(paneKey)
      dismissRetainedAgent(paneKey)
    },
    [dropAgentStatus, dismissRetainedAgent]
  )

  const isAgentSendTargetModeActive = agentSendPopoverTargetMode?.worktreeId === worktreeId
  const sendTargetsByPaneKey = useMemo(() => {
    void agentStatusEpoch
    if (!isAgentSendTargetModeActive) {
      return new Map<
        string,
        { status: 'eligible' | 'disabled' | 'sending'; disabledReason?: string }
      >()
    }

    return new Map(
      deriveRunningAgentSendTargets(sendTargetInputs, worktreeId).map((target) => [
        target.paneKey,
        agentSendPopoverTargetMode?.status === 'sending' &&
        agentSendPopoverTargetMode.sendingPaneKey === target.paneKey
          ? { status: 'sending' as const, disabledReason: 'Sending...' }
          : target.disabledReason
            ? { status: target.status, disabledReason: target.disabledReason }
            : { status: target.status }
      ])
    )
  }, [
    // Why: stale-boundary timers bump this epoch without replacing the status
    // map, so target eligibility must derive again when freshness flips.
    agentStatusEpoch,
    agentSendPopoverTargetMode?.sendingPaneKey,
    agentSendPopoverTargetMode?.status,
    isAgentSendTargetModeActive,
    // sendTargetInputs is a stable empty constant while inactive and a
    // shallow-compared bundle of the five maps while active, so it covers all
    // five former deps in one reference.
    sendTargetInputs,
    worktreeId
  ])

  const handleSendTargetClick = useCallback(
    (paneKey: string) => {
      void sendPromptToSidebarAgentTarget(paneKey)
    },
    [sendPromptToSidebarAgentTarget]
  )

  const handleActivateAgentTab = useCallback(
    (tabId: string, paneKey: string) => activateWorktreeAgentRowTab(worktreeId, tabId, paneKey),
    [worktreeId]
  )
  const handleActivateRetainedAgent = useCallback(() => {
    // Why: hibernation-retained rows are passive completion evidence. Activating
    // the worktree would resume sleeping sessions, so the row itself is inert.
  }, [])

  // Why: own one 30s tick per non-empty inline list. Cards with zero agents
  // never mount this component (see WorktreeCardAgents), so idle worktrees
  // don't pay any timer cost.
  const now = useNow(30_000)
  // [FORK] Пины сверху + «архив» строки — см. worktree-agent-row-actions.
  const pinnedAgentTabIds = useAgentPanelState((s) => s.pinnedAgentTabIds)
  const toggleAgentPinned = useAgentPanelState((s) => s.toggleAgentPinned)
  const { rootRows: rootAgents, childrenByParentPaneKey } = useMemo(
    () => partitionPinnedAgentRoots(buildAgentRowLineageTree(agents), pinnedAgentTabIds),
    [agents, pinnedAgentTabIds]
  )
  const handleArchiveAgent = useCallback(
    (agent: DashboardAgentRowData) => archiveWorktreeAgentRow(agent, worktreeId),
    [worktreeId]
  )
  const hasLineage = childrenByParentPaneKey.size > 0
  const [collapsedLineageParents, setCollapsedLineageParents] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [compactRootListExpanded, setCompactRootListExpanded] = useState(false)

  useLayoutEffect(() => {
    if (compactRootListExpanded && agentActivityDisplayMode === 'compact') {
      dispatchSuppressScrollAdjustment()
      // Why: defer the reveal scroll out of the expand commit. Running it inline
      // forces a synchronous sidebar layout that blocks the animation's opening
      // frames (a visible jump); next-frame keeps the open smooth and the
      // ScrollBehavior 'auto' still lands before the height transition finishes.
      const handle = requestAnimationFrame(() => {
        revealCompactAgentCard(compactAgentListRootRef.current)
      })
      return () => cancelAnimationFrame(handle)
    }
    return undefined
  }, [agentActivityDisplayMode, compactRootListExpanded])
  const toggleLineageParent = useCallback((paneKey: string) => {
    dispatchSuppressScrollAdjustment()
    setCollapsedLineageParents((current) => {
      const next = new Set(current)
      if (next.has(paneKey)) {
        next.delete(paneKey)
      } else {
        next.add(paneKey)
      }
      return next
    })
  }, [])

  const stopBubble = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  // Why: when any root row has a disclosure chevron, root leaf siblings reserve
  // a matching leading spacer so the state-dot column stays aligned across the
  // card. Descendants already have the child rail indent, so adding this spacer
  // there double-indents child agents.
  const anyRootHasChildren = rootAgents.some(
    (agent) => (childrenByParentPaneKey.get(agent.paneKey) ?? []).length > 0
  )

  const renderAgentBranch = (
    agent: DashboardAgentRowData,
    ancestorPaneKeys: ReadonlySet<string> = new Set()
  ): React.ReactNode => {
    if (ancestorPaneKeys.has(agent.paneKey)) {
      // Why: orchestration metadata is external state and can be malformed.
      // Bail out of repeated ancestors instead of recursing forever.
      return null
    }
    const childAgents = childrenByParentPaneKey.get(agent.paneKey) ?? []
    const hasChildAgents = childAgents.length > 0
    const isRootAgent = ancestorPaneKeys.size === 0
    // Why: spawned child agents are actionable work, so they should be visible
    // as soon as the parent appears; the disclosure remains available to fold noise.
    const expanded = !collapsedLineageParents.has(agent.paneKey)
    const sendTarget = isAgentSendTargetModeActive
      ? (sendTargetsByPaneKey.get(agent.paneKey) ?? {
          status: 'disabled' as const,
          disabledReason: 'Agent is not available'
        })
      : undefined
    const descendantAncestorPaneKeys = new Set(ancestorPaneKeys)
    descendantAncestorPaneKeys.add(agent.paneKey)
    return (
      <React.Fragment key={agent.paneKey}>
        <DashboardAgentRow
          agent={agent}
          onDismiss={handleDismissAgent}
          onActivate={
            agent.rowSource === 'retained' ? handleActivateRetainedAgent : handleActivateAgentTab
          }
          now={now}
          // Why: bold an agent row until the user has visited its tab.
          // useAutoAckViewedAgent acks automatically when the user
          // focuses the agent's tab, which mutes the row in lockstep.
          isUnvisited={unvisitedByPaneKey[agent.paneKey] ?? false}
          // Why: inline rows pack tighter than a full-panel layout;
          // 'md' reads as a second ~12px glyph users confuse with the
          // agent identity icon right next to it. 'sm' keeps the two
          // distinguishable at a glance.
          stateDotSize="sm"
          // Why: in the per-card inline list clicking the row jumps
          // directly to the agent, so the expand chevron is redundant.
          // Keep the identity glyph (Claude/Gemini/…) so users can tell
          // agents apart at a glance within a worktree.
          hideExpand
          // Why: fold orchestration children under the parent row's leading
          // chevron so a parent reads as a tree node, not as a separate
          // disclosure stripe below it. Variant B in the mockups.
          childAgentCount={hasChildAgents ? childAgents.length : undefined}
          childAgentsExpanded={expanded}
          onToggleChildAgents={
            hasChildAgents ? () => toggleLineageParent(agent.paneKey) : undefined
          }
          // Why: keep leaf rows aligned with parent rows in the same card —
          // see anyRootHasChildren above.
          reserveDisclosureGutter={isRootAgent && anyRootHasChildren && !hasChildAgents}
          isFocusedPane={agentRowMatchesFocusedKey(agent.paneKey, focusedAgentPaneKey)}
          sendTargetStatus={sendTarget?.status}
          sendTargetDisabledReason={sendTarget?.disabledReason}
          onSendTargetClick={isAgentSendTargetModeActive ? handleSendTargetClick : undefined}
          // Why: the disclosure variant uses chevron + indentation to show
          // hierarchy. The legacy L-connector / vertical-trunk decorations
          // are pinned to a fixed left offset that doesn't match the
          // chevron-shifted column and read as floating fragments.
          hideLineageConnectors
        />
        {hasChildAgents && expanded ? (
          <div className="worktree-agent-lineage-children">
            {childAgents.map((childAgent) =>
              renderAgentBranch(childAgent, descendantAncestorPaneKeys)
            )}
          </div>
        ) : null}
      </React.Fragment>
    )
  }

  const renderCompactAgentBranch = (
    agent: DashboardAgentRowData,
    ancestorPaneKeys: ReadonlySet<string> = new Set(),
    cacheTimerActive = true
  ): React.ReactNode => {
    if (ancestorPaneKeys.has(agent.paneKey)) {
      return null
    }
    const childAgents = childrenByParentPaneKey.get(agent.paneKey) ?? []
    const hasChildAgents = childAgents.length > 0
    const isRootAgent = ancestorPaneKeys.size === 0
    const expanded = !collapsedLineageParents.has(agent.paneKey)
    const sendTarget = isAgentSendTargetModeActive
      ? (sendTargetsByPaneKey.get(agent.paneKey) ?? {
          status: 'disabled' as const,
          disabledReason: 'Agent is not available'
        })
      : undefined
    const descendantAncestorPaneKeys = new Set(ancestorPaneKeys)
    descendantAncestorPaneKeys.add(agent.paneKey)
    return (
      <React.Fragment key={agent.paneKey}>
        <CompactAgentRow
          agent={agent}
          now={now}
          // [FORK] Cursor-стиль: строка агента — просто текст, без иконки тула.
          hideIdentityIcon={AGENT_PANEL_ENABLED}
          isUnvisited={unvisitedByPaneKey[agent.paneKey] ?? false}
          isPinned={Boolean(pinnedAgentTabIds[agent.tab.id])}
          onTogglePin={() => toggleAgentPinned(agent.tab.id)}
          onArchive={() => handleArchiveAgent(agent)}
          onActivate={
            agent.rowSource === 'retained' ? handleActivateRetainedAgent : handleActivateAgentTab
          }
          sendTargetStatus={sendTarget?.status}
          sendTargetDisabledReason={sendTarget?.disabledReason}
          onSendTargetClick={isAgentSendTargetModeActive ? handleSendTargetClick : undefined}
          childAgentCount={hasChildAgents ? childAgents.length : undefined}
          childAgentsExpanded={expanded}
          onToggleChildAgents={
            hasChildAgents ? () => toggleLineageParent(agent.paneKey) : undefined
          }
          reserveDisclosureGutter={isRootAgent && anyRootHasChildren && !hasChildAgents}
          isFocusedPane={agentRowMatchesFocusedKey(agent.paneKey, focusedAgentPaneKey)}
          cacheTimerActive={cacheTimerActive}
        />
        {hasChildAgents ? (
          <CompactAgentExpansion expanded={expanded}>
            <div className="worktree-agent-lineage-children flex flex-col gap-0.5">
              {childAgents.map((childAgent) =>
                renderCompactAgentBranch(
                  childAgent,
                  descendantAncestorPaneKeys,
                  cacheTimerActive && expanded
                )
              )}
            </div>
          </CompactAgentExpansion>
        ) : null}
      </React.Fragment>
    )
  }

  if (agentActivityDisplayMode === 'compact') {
    const summaryAgents = hasLineage ? rootAgents : agents
    // Why: compact worktree cards keep multiple active agents to a single
    // predictable status line, even when there are only two agents. In
    // send-target mode, rows are the picker surface, so keep targets visible.
    const shouldUseSummaryRow =
      summaryAgents.length > 1 && !isAgentSendTargetModeActive && !suppressCompactSummary
    const subjectLabel = `${hasLineage ? rootAgents.length : agents.length} agents`

    return (
      <div
        ref={compactAgentListRootRef}
        className={cn('flex flex-col mt-1 gap-0.5', className)}
        onClick={stopBubble}
        onDoubleClick={stopBubble}
        onMouseDown={stopBubble}
        onPointerDown={stopBubble}
        role={hasLineage ? 'tree' : 'group'}
        aria-label={translate('auto.components.sidebar.WorktreeCardAgents.1b0a156717', 'Agents')}
        data-compact-agent-list="true"
      >
        {agents.length === 0 ? null : shouldUseSummaryRow ? (
          // Why: the worktree card is already the surface. Expanded compact
          // agents stay a quiet tree; only the collapsed summary reads as a pill.
          <div
            className={cn(
              'compact-agent-summary-panel',
              compactRootListExpanded && 'compact-agent-summary-panel-expanded'
            )}
          >
            <CompactAgentSummaryButton
              agents={summaryAgents}
              subjectLabel={subjectLabel}
              expanded={compactRootListExpanded}
              onToggle={() => {
                dispatchSuppressScrollAdjustment()
                setCompactRootListExpanded((expanded) => !expanded)
              }}
            />
            <CompactAgentExpansion expanded={compactRootListExpanded}>
              {rootAgents.map((rootAgent) =>
                renderCompactAgentBranch(rootAgent, new Set(), compactRootListExpanded)
              )}
            </CompactAgentExpansion>
          </div>
        ) : (
          rootAgents.map((rootAgent) => renderCompactAgentBranch(rootAgent))
        )}
      </div>
    )
  }

  return (
    // Why: swallow bubbling so clicks on the gutter around the agent rows
    // don't reach WorktreeCard's activate / edit-meta handlers.
    <div
      className={cn('flex flex-col mt-1', className)}
      onClick={stopBubble}
      onDoubleClick={stopBubble}
      onMouseDown={stopBubble}
      onPointerDown={stopBubble}
      role={hasLineage ? 'tree' : 'group'}
      aria-label={translate('auto.components.sidebar.WorktreeCardAgents.1b0a156717', 'Agents')}
    >
      {rootAgents.map((rootAgent) => renderAgentBranch(rootAgent))}
    </div>
  )
})

export default WorktreeCardAgents
