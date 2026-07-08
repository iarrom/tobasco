// [FORK] Строки агент-сессий Cursor-вида: обёртка над CompactAgentRow с
// активацией, пином, архивом и подсветкой фокуса. Worktree строки не видно —
// клик активирует и воркспейс, и сессию.
import React, { useCallback, useState } from 'react'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import { useAgentPanelState } from '@/components/agent-panel/agent-panel-state'
import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { CompactAgentRow } from '../worktree-card-compact-agent-row'
import { activateWorktreeAgentRowTab, archiveWorktreeAgentRow } from '../worktree-agent-row-actions'
import { agentRowMatchesFocusedKey, useFocusedAgentPaneKey } from '../focused-agent-row-highlight'
import type { AgentsViewRow } from './use-agents-view-data'

export function AgentsViewAgentRowItem({
  row,
  now
}: {
  row: AgentsViewRow
  now: number
}): React.JSX.Element {
  const { worktreeId, agent, children } = row
  const pinnedAgentTabIds = useAgentPanelState((s) => s.pinnedAgentTabIds)
  const toggleAgentPinned = useAgentPanelState((s) => s.toggleAgentPinned)
  const focusedAgentPaneKey = useFocusedAgentPaneKey(worktreeId)
  const [childrenExpanded, setChildrenExpanded] = useState(true)

  const handleActivate = useCallback(
    (tabId: string, paneKey: string) => {
      activateWorktreeAgentRowTab(worktreeId, tabId, paneKey)
    },
    [worktreeId]
  )
  // Why: retained rows are hibernation evidence — the pane is gone, so jump to
  // the workspace itself (waking it if needed) instead of a dead pane focus.
  const handleActivateRetained = useCallback(() => {
    void activateWorktreeFromSidebar(worktreeId)
  }, [worktreeId])

  const renderRow = (agentRow: DashboardAgentRow, isRoot: boolean): React.JSX.Element => (
    <CompactAgentRow
      key={agentRow.paneKey}
      agent={agentRow}
      now={now}
      hideIdentityIcon
      hideSecondaryText
      // Why: rows read as the same card as project folders (Cursor look) —
      // full width, folder radius, text indented one level. h-7 matches the
      // folder row's py-1 + text-sm ≈ 28px.
      className="rounded-md pl-4 pr-2"
      isPinned={Boolean(pinnedAgentTabIds[agentRow.tab.id])}
      onTogglePin={() => toggleAgentPinned(agentRow.tab.id)}
      onArchive={() => archiveWorktreeAgentRow(agentRow, worktreeId)}
      onActivate={agentRow.rowSource === 'retained' ? handleActivateRetained : handleActivate}
      childAgentCount={isRoot && children.length > 0 ? children.length : undefined}
      childAgentsExpanded={childrenExpanded}
      onToggleChildAgents={
        isRoot && children.length > 0 ? () => setChildrenExpanded((v) => !v) : undefined
      }
      isFocusedPane={agentRowMatchesFocusedKey(agentRow.paneKey, focusedAgentPaneKey)}
    />
  )

  return (
    <>
      {renderRow(agent, true)}
      {children.length > 0 && childrenExpanded ? (
        <div className="flex flex-col gap-0.5 pl-4">
          {children.map((child) => renderRow(child, false))}
        </div>
      ) : null}
    </>
  )
}
