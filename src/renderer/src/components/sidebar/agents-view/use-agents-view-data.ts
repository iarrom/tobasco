// [FORK] Данные Cursor-вида сайдбара: проекты → плоский список агент-сессий
// всех worktree проекта, отсортированный по свежести. Worktree-уровень скрыт —
// он виден в шапке чата, а не в дереве.
import { useMemo } from 'react'
import type { Repo } from '../../../../../shared/types'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import { applyAgentRowLineage } from '@/components/dashboard/agent-row-lineage'
import { buildAgentRowLineageTree } from '@/components/dashboard/agent-row-lineage-model'
import { migrationUnsupportedToAgentStatusEntry } from '@/lib/migration-unsupported-agent-entry'
import { useAppStore } from '@/store'
import { useAgentPanelState } from '@/components/agent-panel/agent-panel-state'
import { buildWorktreeAgentRows } from '../worktree-agent-rows'
import {
  selectLiveAgentStatusEntriesForWorktree,
  selectMigrationUnsupportedEntriesForWorktree,
  selectRetainedAgentEntriesForWorktree,
  selectRuntimeAgentOrchestrationForWorktree,
  selectTerminalLayoutsForWorktree
} from '../worktree-agent-row-selectors'
import {
  selectLivePtyIdsForWorktree,
  selectRuntimePaneTitlesForWorktree
} from '../worktree-card-status-inputs'

export type AgentsViewRow = {
  worktreeId: string
  agent: DashboardAgentRow
  /** Orchestration children folded under this root row. */
  children: DashboardAgentRow[]
  /** Recency for flat ordering, newest first. */
  sortTime: number
}

export type AgentsViewProjectSection = {
  repo: Repo
  rows: AgentsViewRow[]
}

export type AgentsViewData = {
  sections: AgentsViewProjectSection[]
  pinnedRows: AgentsViewRow[]
}

function agentRowSortTime(row: DashboardAgentRow): number {
  // Why: updatedAt advances on every ping (freshest signal), startedAt covers
  // rows that never pinged again, tab.createdAt covers drafts with no entry.
  return Math.max(row.entry.updatedAt ?? 0, row.startedAt, row.tab.createdAt ?? 0)
}

export function useAgentsViewData(): AgentsViewData {
  const repos = useAppStore((s) => s.repos)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const migrationUnsupportedByPtyId = useAppStore((s) => s.migrationUnsupportedByPtyId)
  const retainedAgentsByPaneKey = useAppStore((s) => s.retainedAgentsByPaneKey)
  const runtimeAgentOrchestrationByPaneKey = useAppStore(
    (s) => s.runtimeAgentOrchestrationByPaneKey
  )
  const runtimePaneTitlesByTabId = useAppStore((s) => s.runtimePaneTitlesByTabId)
  const ptyIdsByTabId = useAppStore((s) => s.ptyIdsByTabId)
  const terminalLayoutsByTabId = useAppStore((s) => s.terminalLayoutsByTabId)
  // Why: freshness boundaries expire without new data; the epoch tick forces
  // stale-decay recomputation (same contract as useWorktreeAgentRows).
  const agentStatusEpoch = useAppStore((s) => s.agentStatusEpoch)
  const pinnedAgentTabIds = useAgentPanelState((s) => s.pinnedAgentTabIds)

  return useMemo<AgentsViewData>(() => {
    const now = Date.now()
    const selectorState = {
      agentStatusByPaneKey,
      migrationUnsupportedByPtyId,
      retainedAgentsByPaneKey,
      runtimeAgentOrchestrationByPaneKey,
      runtimePaneTitlesByTabId,
      ptyIdsByTabId,
      tabsByWorktree,
      terminalLayoutsByTabId
    }

    const pinnedRows: AgentsViewRow[] = []
    const sections: AgentsViewProjectSection[] = repos.map((repo) => {
      const rows: AgentsViewRow[] = []
      for (const worktree of worktreesByRepo[repo.id] ?? []) {
        if (worktree.isArchived) {
          continue
        }
        const liveEntries = selectLiveAgentStatusEntriesForWorktree(selectorState, worktree.id)
        const migrationUnsupported = selectMigrationUnsupportedEntriesForWorktree(
          selectorState,
          worktree.id
        )
        const entries =
          migrationUnsupported.length > 0
            ? [
                ...liveEntries,
                ...migrationUnsupported.flatMap((unsupported) => {
                  const entry = migrationUnsupportedToAgentStatusEntry(unsupported)
                  return entry ? [entry] : []
                })
              ]
            : liveEntries
        const worktreeRows = applyAgentRowLineage(
          buildWorktreeAgentRows({
            tabs: tabsByWorktree[worktree.id] ?? [],
            entries,
            retained: selectRetainedAgentEntriesForWorktree(selectorState, worktree.id),
            runtimePaneTitlesByTabId: selectRuntimePaneTitlesForWorktree(
              selectorState,
              worktree.id
            ),
            ptyIdsByTabId: selectLivePtyIdsForWorktree(selectorState, worktree.id),
            terminalLayoutsByTabId: selectTerminalLayoutsForWorktree(selectorState, worktree.id),
            runtimeAgentOrchestrationByPaneKey: selectRuntimeAgentOrchestrationForWorktree(
              selectorState,
              worktree.id
            ),
            now
          })
        )
        const tree = buildAgentRowLineageTree(worktreeRows)
        for (const agent of tree.rootRows) {
          const children = tree.childrenByParentPaneKey.get(agent.paneKey) ?? []
          const row: AgentsViewRow = {
            worktreeId: worktree.id,
            agent,
            children,
            sortTime: agentRowSortTime(agent)
          }
          if (pinnedAgentTabIds[agent.tab.id]) {
            pinnedRows.push(row)
          } else {
            rows.push(row)
          }
        }
      }
      rows.sort((a, b) => b.sortTime - a.sortTime)
      return { repo, rows }
    })
    pinnedRows.sort((a, b) => b.sortTime - a.sortTime)
    return { sections, pinnedRows }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    repos,
    worktreesByRepo,
    tabsByWorktree,
    agentStatusByPaneKey,
    migrationUnsupportedByPtyId,
    retainedAgentsByPaneKey,
    runtimeAgentOrchestrationByPaneKey,
    runtimePaneTitlesByTabId,
    ptyIdsByTabId,
    terminalLayoutsByTabId,
    agentStatusEpoch,
    pinnedAgentTabIds
  ])
}
