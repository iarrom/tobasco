/** [FORK] Right-click context menu for Linear issue rows (Linear-parity Tasks
 *  page). Mirrors Linear's row menu: Status / Priority / Assignee / Due date /
 *  Labels / Estimate submenus with optimistic updates, plus Start workspace,
 *  Copy, and Open in Linear. Submenu data (states/labels/members) is fetched
 *  only while the menu is open — the body mounts with the portal content. */
import React, { useCallback } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Gauge,
  Tag,
  UserRound
} from 'lucide-react'
import { toast } from 'sonner'

import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { LinearPriorityIcon } from '@/components/linear-priority-icon'
import { getLinearPriorityLabel } from '@/components/task-page-localized-options'
import { useTeamLabels, useTeamMembers, useTeamStates } from '@/hooks/useIssueMetadata'
import { linearUpdateIssue } from '@/runtime/runtime-linear-client'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import type { LinearIssue, LinearIssueUpdate } from '../../../../shared/types'
import { LinearStateIcon } from './LinearStateIcon'

const ESTIMATE_OPTIONS = [1, 2, 3, 5, 8]

type LinearIssueContextMenuProps = {
  issue: LinearIssue
  sourceContext?: TaskSourceContext | null
  onStartWorkspace?: (issue: LinearIssue) => void
  onOpenExternal?: (issue: LinearIssue) => void
  children: React.ReactNode
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function MenuBody({
  issue,
  sourceContext,
  onStartWorkspace,
  onOpenExternal
}: Omit<LinearIssueContextMenuProps, 'children'>): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const patchLinearIssue = useAppStore((s) => s.patchLinearIssue)
  const providerSettings = sourceContext ?? settings
  const states = useTeamStates(issue.team.id || null, providerSettings, issue.workspaceId)
  const labels = useTeamLabels(issue.team.id || null, providerSettings, issue.workspaceId)
  const members = useTeamMembers(issue.team.id || null, providerSettings, issue.workspaceId)

  // Why: optimistic patch + revert-on-failure mirrors LinearStateCell so rows
  // update instantly while the write is in flight (incl. over SSH).
  const mutateIssue = useCallback(
    (
      updates: LinearIssueUpdate,
      optimistic: Partial<LinearIssue>,
      revert: Partial<LinearIssue>
    ) => {
      patchLinearIssue(issue.id, optimistic)
      void linearUpdateIssue(providerSettings, issue.id, updates, issue.workspaceId)
        .then((result) => {
          if (result.ok === false) {
            patchLinearIssue(issue.id, revert)
            toast.error(
              result.error ??
                translate(
                  'auto.components.tasks.contextMenu.updateFailed',
                  'Failed to update issue'
                )
            )
            return
          }
          useAppStore.getState().recordFeatureInteraction('linear-tasks')
        })
        .catch(() => {
          patchLinearIssue(issue.id, revert)
          toast.error(
            translate('auto.components.tasks.contextMenu.updateFailed', 'Failed to update issue')
          )
        })
    },
    [issue.id, issue.workspaceId, patchLinearIssue, providerSettings]
  )

  const copyToClipboard = useCallback((value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      toast.success(translate('auto.components.tasks.contextMenu.copied', 'Copied'))
    })
  }, [])

  const currentStateId = states.data.find(
    (state) => state.name === issue.state.name && state.type === issue.state.type
  )?.id

  const dueDateChoices = [
    {
      key: 'today',
      label: translate('auto.components.tasks.contextMenu.dueToday', 'Today'),
      value: toIsoDate(new Date())
    },
    {
      key: 'tomorrow',
      label: translate('auto.components.tasks.contextMenu.dueTomorrow', 'Tomorrow'),
      value: toIsoDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
    },
    {
      key: 'next-week',
      label: translate('auto.components.tasks.contextMenu.dueNextWeek', 'Next week'),
      value: toIsoDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
    }
  ]

  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <LinearStateIcon type={issue.state.type} color={issue.state.color} className="size-3.5" />
          {translate('auto.components.TaskPage.154b0fa623', 'Status')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-44">
          {states.data.map((state) => (
            <ContextMenuItem
              key={state.id}
              onSelect={() => {
                if (state.id === currentStateId) {
                  return
                }
                mutateIssue(
                  { stateId: state.id },
                  { state: { name: state.name, type: state.type, color: state.color } },
                  { state: issue.state }
                )
              }}
            >
              <LinearStateIcon type={state.type} color={state.color} className="size-3.5" />
              {state.name}
              {state.id === currentStateId ? <Check className="ml-auto size-3.5" /> : null}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <LinearPriorityIcon priority={issue.priority} className="size-3.5" />
          {translate('auto.components.TaskPage.c8d5bec5f7', 'Priority')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-44">
          {[0, 1, 2, 3, 4].map((priority) => (
            <ContextMenuItem
              key={priority}
              onSelect={() => {
                if (priority === issue.priority) {
                  return
                }
                mutateIssue({ priority }, { priority }, { priority: issue.priority })
              }}
            >
              <LinearPriorityIcon priority={priority} className="size-3.5" />
              {getLinearPriorityLabel(priority)}
              {priority === issue.priority ? <Check className="ml-auto size-3.5" /> : null}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <UserRound className="size-3.5" />
          {translate('auto.components.TaskPage.d2a876ca53', 'Assignee')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-52">
          <ContextMenuItem
            onSelect={() => {
              if (!issue.assignee) {
                return
              }
              mutateIssue(
                { assigneeId: null },
                { assignee: undefined },
                { assignee: issue.assignee }
              )
            }}
          >
            {translate('auto.components.TaskPage.42a9160321', 'Unassigned')}
            {!issue.assignee ? <Check className="ml-auto size-3.5" /> : null}
          </ContextMenuItem>
          {members.data.map((member) => (
            <ContextMenuItem
              key={member.id}
              onSelect={() => {
                if (member.id === issue.assignee?.id) {
                  return
                }
                mutateIssue(
                  { assigneeId: member.id },
                  {
                    assignee: {
                      id: member.id,
                      displayName: member.displayName,
                      avatarUrl: member.avatarUrl
                    }
                  },
                  { assignee: issue.assignee }
                )
              }}
            >
              {member.displayName}
              {member.id === issue.assignee?.id ? <Check className="ml-auto size-3.5" /> : null}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <CalendarDays className="size-3.5" />
          {translate('auto.components.tasks.options.dueDate', 'Due date')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-44">
          {dueDateChoices.map((choice) => (
            <ContextMenuItem
              key={choice.key}
              onSelect={() =>
                mutateIssue(
                  { dueDate: choice.value },
                  { dueDate: choice.value },
                  { dueDate: issue.dueDate }
                )
              }
            >
              {choice.label}
              {issue.dueDate === choice.value ? <Check className="ml-auto size-3.5" /> : null}
            </ContextMenuItem>
          ))}
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              if (!issue.dueDate) {
                return
              }
              mutateIssue({ dueDate: null }, { dueDate: null }, { dueDate: issue.dueDate })
            }}
          >
            {translate('auto.components.tasks.contextMenu.noDueDate', 'No due date')}
            {!issue.dueDate ? <Check className="ml-auto size-3.5" /> : null}
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Tag className="size-3.5" />
          {translate('auto.components.TaskPage.d0ca4aa1d0', 'Labels')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-52">
          {labels.data.map((label) => {
            const active = issue.labelIds.includes(label.id)
            return (
              <ContextMenuItem
                key={label.id}
                onSelect={(event) => {
                  // Why: keep the menu open for multi-label toggling, like Linear.
                  event.preventDefault()
                  const nextIds = active
                    ? issue.labelIds.filter((id) => id !== label.id)
                    : [...issue.labelIds, label.id]
                  const nextNames = labels.data
                    .filter((l) => nextIds.includes(l.id))
                    .map((l) => l.name)
                  mutateIssue(
                    { labelIds: nextIds },
                    { labelIds: nextIds, labels: nextNames },
                    { labelIds: issue.labelIds, labels: issue.labels }
                  )
                }}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: label.color }}
                  aria-hidden
                />
                {label.name}
                {active ? <Check className="ml-auto size-3.5" /> : null}
              </ContextMenuItem>
            )
          })}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Gauge className="size-3.5" />
          {translate('auto.components.tasks.options.estimate', 'Estimate')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-44">
          <ContextMenuItem
            onSelect={() => {
              if (issue.estimate === null || issue.estimate === undefined) {
                return
              }
              mutateIssue({ estimate: null }, { estimate: null }, { estimate: issue.estimate })
            }}
          >
            {translate('auto.components.tasks.contextMenu.noEstimate', 'No estimate')}
            {issue.estimate === null || issue.estimate === undefined ? (
              <Check className="ml-auto size-3.5" />
            ) : null}
          </ContextMenuItem>
          {ESTIMATE_OPTIONS.map((estimate) => (
            <ContextMenuItem
              key={estimate}
              onSelect={() => {
                if (estimate === issue.estimate) {
                  return
                }
                mutateIssue({ estimate }, { estimate }, { estimate: issue.estimate })
              }}
            >
              {estimate}
              {estimate === issue.estimate ? <Check className="ml-auto size-3.5" /> : null}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      {onStartWorkspace ? (
        <ContextMenuItem onSelect={() => onStartWorkspace(issue)}>
          <ArrowRight className="size-3.5" />
          {translate('auto.components.tasks.contextMenu.startWorkspace', 'Start workspace')}
        </ContextMenuItem>
      ) : null}

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Copy className="size-3.5" />
          {translate('auto.components.tasks.contextMenu.copy', 'Copy')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-44">
          <ContextMenuItem onSelect={() => copyToClipboard(issue.identifier)}>
            {translate('auto.components.tasks.contextMenu.copyId', 'Copy ID')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => copyToClipboard(issue.title)}>
            {translate('auto.components.tasks.contextMenu.copyTitle', 'Copy title')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => copyToClipboard(issue.url)}>
            {translate('auto.components.tasks.contextMenu.copyUrl', 'Copy URL')}
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      {onOpenExternal ? (
        <ContextMenuItem onSelect={() => onOpenExternal(issue)}>
          <ExternalLink className="size-3.5" />
          {translate('auto.components.tasks.header.openInLinear', 'Open in Linear')}
        </ContextMenuItem>
      ) : null}
    </>
  )
}

export function LinearIssueContextMenu({
  issue,
  sourceContext,
  onStartWorkspace,
  onOpenExternal,
  children
}: LinearIssueContextMenuProps): React.JSX.Element {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      {/* Why: the body (and its team metadata fetches) mounts only while the
          menu is open — rows stay cheap. */}
      <ContextMenuContent className="w-52">
        <MenuBody
          issue={issue}
          sourceContext={sourceContext}
          onStartWorkspace={onStartWorkspace}
          onOpenExternal={onOpenExternal}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}
