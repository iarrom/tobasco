// [FORK] Cursor-вид сайдбара: командные строки сверху (New Agent / Search /
// Automations / Customize), секция Pinned, затем Workspaces — папки проектов
// с плоским списком агент-сессий (worktree скрыт, он живёт в шапке чата).
import React, { useMemo, useState } from 'react'
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
  Search,
  Settings2,
  SquarePen
} from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useNow } from '@/components/dashboard/useNow'
import { AgentSessionLaunchMenu } from '@/components/agent-panel/AgentSessionTabStrip'
import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { openWorkspaceCreationComposerWithTourHandoff } from '@/components/contextual-tours/workspace-creation-tour-handoff'
import { translate } from '@/i18n/i18n'
import SidebarWorkspaceOptionsMenu from '../SidebarWorkspaceOptionsMenu'
import { AgentsViewAgentRowItem } from './AgentsViewRows'
import { useAgentsViewData, type AgentsViewProjectSection } from './use-agents-view-data'

// Why: Cursor shows roughly a screen of recent sessions per project before
// folding the tail behind "More"; unbounded lists bury other projects.
const MAX_VISIBLE_ROWS_PER_PROJECT = 15
const PROJECT_COLLAPSE_KEY_PREFIX = 'agents-view:'

function CommandRow({
  icon,
  label,
  ...props
}: {
  icon: React.ReactNode
  label: string
} & React.ComponentProps<'button'>): React.JSX.Element {
  // Why: spread/ref passthrough keeps the row usable as a Radix `asChild`
  // trigger (AgentSessionLaunchMenu) — dropping props left New Agent inert.
  return (
    <button
      type="button"
      {...props}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm tracking-tight text-worktree-sidebar-foreground/60 transition-colors hover:bg-worktree-sidebar-foreground/8"
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-worktree-sidebar-foreground/30">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  )
}

function AgentsViewCommandRows(): React.JSX.Element {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const openModal = useAppStore((s) => s.openModal)
  const openAutomationsPage = useAppStore((s) => s.openAutomationsPage)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)

  const newAgentRow = (
    <CommandRow
      icon={<SquarePen className="size-4" strokeWidth={1.75} />}
      label={translate('auto.components.sidebar.agentsView.newAgent', 'New Agent')}
      onClick={activeWorktreeId ? undefined : () => openWorkspaceCreationComposerWithTourHandoff()}
    />
  )

  return (
    <div className="flex flex-col gap-0.5 px-2 pt-2 pb-1">
      {/* Why: with an active workspace, New Agent starts a session right there
          (Cursor semantics); with none, fall back to workspace creation. */}
      {activeWorktreeId ? (
        <AgentSessionLaunchMenu worktreeId={activeWorktreeId} trigger={newAgentRow} />
      ) : (
        newAgentRow
      )}
      <CommandRow
        icon={<Search className="size-4" strokeWidth={1.75} />}
        label={translate('auto.components.sidebar.SidebarNav.80611a8b10', 'Search')}
        onClick={() => openModal('worktree-palette')}
      />
      <CommandRow
        icon={<CalendarClock className="size-4" strokeWidth={1.75} />}
        label={translate('auto.components.sidebar.SidebarNav.f323383e9a', 'Automations')}
        onClick={openAutomationsPage}
      />
      <CommandRow
        icon={<Settings2 className="size-4" strokeWidth={1.75} />}
        label={translate('auto.components.sidebar.agentsView.customize', 'Customize')}
        onClick={openSettingsPage}
      />
    </div>
  )
}

function ProjectSection({
  section,
  now
}: {
  section: AgentsViewProjectSection
  now: number
}): React.JSX.Element {
  const collapsedGroups = useAppStore((s) => s.collapsedGroups)
  const toggleCollapsedGroup = useAppStore((s) => s.toggleCollapsedGroup)
  const projectWorktrees = useAppStore((s) => s.worktreesByRepo[section.repo.id])
  const [showAll, setShowAll] = useState(false)
  const collapseKey = `${PROJECT_COLLAPSE_KEY_PREFIX}${section.repo.id}`
  const expanded = !collapsedGroups.has(collapseKey)
  const visibleRows = showAll ? section.rows : section.rows.slice(0, MAX_VISIBLE_ROWS_PER_PROJECT)
  const hiddenCount = section.rows.length - visibleRows.length
  // Why: the folder-level "+" starts an agent in the project's primary
  // checkout (Cursor: new agents default to main); fall back to the most
  // recently active workspace when the primary isn't registered.
  const launchWorktreeId = useMemo(() => {
    const candidates = (projectWorktrees ?? []).filter((w) => !w.isArchived)
    const main = candidates.find((w) => w.isMainWorktree)
    if (main) {
      return main.id
    }
    return [...candidates].sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0]?.id ?? null
  }, [projectWorktrees])

  return (
    <div className="flex flex-col gap-0.5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => toggleCollapsedGroup(collapseKey)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggleCollapsedGroup(collapseKey)
          }
        }}
        aria-expanded={expanded}
        className="group/project-row flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm tracking-tight text-worktree-sidebar-foreground/80 transition-colors hover:bg-worktree-sidebar-foreground/8"
      >
        {/* Иконка папки, по наведению — шеврон (как в Cursor). */}
        <span className="relative flex size-4 shrink-0 items-center justify-center text-worktree-sidebar-foreground/40">
          <span className="group-hover/project-row:hidden">
            {expanded ? (
              <FolderOpen className="size-4" strokeWidth={1.75} />
            ) : (
              <Folder className="size-4" strokeWidth={1.75} />
            )}
          </span>
          <span className="hidden group-hover/project-row:block">
            {expanded ? (
              <ChevronDown className="size-4" strokeWidth={1.75} />
            ) : (
              <ChevronRight className="size-4" strokeWidth={1.75} />
            )}
          </span>
        </span>
        <span className="min-w-0 flex-1 truncate">{section.repo.displayName}</span>
        {launchWorktreeId ? (
          <AgentSessionLaunchMenu
            worktreeId={launchWorktreeId}
            onBeforeLaunch={() => void activateWorktreeFromSidebar(launchWorktreeId)}
            trigger={
              <button
                type="button"
                aria-label={translate(
                  'auto.components.sidebar.agentsView.newAgentInProject',
                  'New agent in {{value0}}',
                  { value0: section.repo.displayName }
                )}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="flex size-5 shrink-0 items-center justify-center rounded-md text-worktree-sidebar-foreground/60 opacity-0 transition-opacity hover:bg-worktree-sidebar-foreground/12 hover:text-worktree-sidebar-foreground group-hover/project-row:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring data-[state=open]:opacity-100"
              >
                <Plus className="size-3.5" strokeWidth={2.25} />
              </button>
            }
          />
        ) : null}
      </div>
      {expanded && visibleRows.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {visibleRows.map((row) => (
            <AgentsViewAgentRowItem key={row.agent.paneKey} row={row} now={now} />
          ))}
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex h-7 w-full items-center rounded-md pl-[30px] pr-2 text-left text-sm text-muted-foreground/60 transition-colors hover:bg-worktree-sidebar-foreground/8 hover:text-muted-foreground"
            >
              {translate('auto.components.sidebar.agentsView.more', 'More')}
              <ChevronRight className="ml-1 size-3" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function AgentsSidebarView(): React.JSX.Element {
  const openModal = useAppStore((s) => s.openModal)
  const { sections, pinnedRows } = useAgentsViewData()
  // Why: one 30s tick for every visible row instead of a timer per row.
  const now = useNow(30_000)

  return (
    <>
      <AgentsViewCommandRows />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek px-2 pb-2">
        {pinnedRows.length > 0 ? (
          <>
            <div className="flex h-8 items-center px-2 pt-2">
              <span className="text-xs font-semibold text-muted-foreground/80 select-none">
                {translate('auto.components.sidebar.agentsView.pinned', 'Pinned')}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {pinnedRows.map((row) => (
                <AgentsViewAgentRowItem key={row.agent.paneKey} row={row} now={now} />
              ))}
            </div>
          </>
        ) : null}

        <div className="flex h-8 items-center justify-between gap-2 px-2 pt-2">
          <span
            className="text-xs font-semibold text-muted-foreground/80 select-none"
            data-sidebar-section-title="workspaces"
          >
            {translate('auto.components.sidebar.agentsView.workspaces', 'Workspaces')}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <SidebarWorkspaceOptionsMenu />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label={translate(
                    'auto.components.sidebar.SidebarHeader.25a95899c9',
                    'Add Project'
                  )}
                  onClick={() => openModal('add-repo')}
                >
                  <FolderPlus className="size-3.5" strokeWidth={2.25} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {translate('auto.components.sidebar.SidebarHeader.25a95899c9', 'Add Project')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className={cn('flex flex-col gap-0.5', sections.length === 0 && 'px-2 pt-1')}>
          {sections.length === 0 ? (
            <span className="text-xs text-muted-foreground/60">
              {translate(
                'auto.components.sidebar.agentsView.emptyProjects',
                'Add a project to get started'
              )}
            </span>
          ) : (
            sections.map((section) => (
              <ProjectSection key={section.repo.id} section={section} now={now} />
            ))
          )}
        </div>
      </div>
    </>
  )
}

export default AgentsSidebarView
