// [FORK] Quick commands were moved out of the tab-bar action cluster into the
// "+" new-tab menu. This hook holds the shared state (repo resolution, visible
// command list, run + add actions) and renders the add dialog. The dialog is
// returned so the caller can mount it OUTSIDE the "+" DropdownMenu — a
// DropdownMenuItem's onSelect closes the menu, which would otherwise unmount an
// inline dialog before it opens.
import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import {
  createTerminalQuickCommandDraft,
  TerminalQuickCommandDialog
} from '@/components/terminal-quick-commands/TerminalQuickCommandDialog'
import {
  getTerminalQuickCommandScope,
  isTerminalQuickCommandComplete
} from '../../../../shared/terminal-quick-commands'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree-id'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { runQuickCommandInNewTab } from '@/lib/run-quick-command-in-new-tab'
import type { TerminalQuickCommand } from '../../../../shared/types'

export type TabBarQuickCommandsController = {
  /** Whether the current worktree maps to a real repo. Folder-mode worktrees
   *  and floating terminals have no repo scope, so the section stays hidden. */
  available: boolean
  /** Repo-scoped commands first, then global — the run order shown in the menu. */
  commands: TerminalQuickCommand[]
  addCommand: () => void
  /** Runs the command in a new tab; returns the created tab id (null for
   *  paired web/SSH runtimes that create the tab on the host). */
  runCommand: (command: TerminalQuickCommand) => { tabId: string } | null
  /** Add dialog element; mount at the TabBar level, not inside the "+" menu. */
  dialog: React.JSX.Element | null
}

type UseTabBarQuickCommandsArgs = {
  worktreeId: string
  groupId: string
}

export function useTabBarQuickCommands({
  worktreeId,
  groupId
}: UseTabBarQuickCommandsArgs): TabBarQuickCommandsController {
  const allCommands = useAppStore((s) => s.settings?.terminalQuickCommands)
  const updateSettings = useAppStore((s) => s.updateSettings)
  // ?? []: test harnesses stub the store with partial snapshots that omit repos.
  const repos = useAppStore((s) => s.repos ?? [])

  // Why: floating terminals share a synthetic worktree id with no separator, so
  // naive `getRepoIdFromWorktreeId` would return that sentinel as a "repo id".
  // Resolve to a real repo from the workspace; otherwise treat as no repo.
  const repoId = useMemo(() => {
    if (worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
      return null
    }
    const candidate = getRepoIdFromWorktreeId(worktreeId)
    return repos.some((r) => r.id === candidate) ? candidate : null
  }, [worktreeId, repos])

  const commands = useMemo(() => {
    const repoList: TerminalQuickCommand[] = []
    const globalList: TerminalQuickCommand[] = []
    for (const command of allCommands ?? []) {
      if (!isTerminalQuickCommandComplete(command)) {
        continue
      }
      const scope = getTerminalQuickCommandScope(command)
      if (scope.type === 'global') {
        globalList.push(command)
      } else if (scope.type === 'repo' && repoId !== null && scope.repoId === repoId) {
        repoList.push(command)
      }
    }
    return [...repoList, ...globalList]
  }, [allCommands, repoId])

  // Why: the draft must be a stable reference while the dialog is open — the
  // dialog re-seeds its internal state whenever the `command` prop identity
  // changes, so a fresh draft per render would wipe the user's input.
  const [addDraft, setAddDraft] = useState<TerminalQuickCommand | null>(null)

  const addCommand = (): void => {
    if (!repoId) {
      return
    }
    setAddDraft(createTerminalQuickCommandDraft({ type: 'repo', repoId }))
  }

  const runCommand = (command: TerminalQuickCommand): { tabId: string } | null => {
    return runQuickCommandInNewTab({ command, worktreeId, groupId })
  }

  const handleSaveCommand = (next: TerminalQuickCommand): void => {
    const current = useAppStore.getState().settings?.terminalQuickCommands ?? []
    const isEdit = current.some((c) => c.id === next.id)
    const nextList = isEdit ? current.map((c) => (c.id === next.id ? next : c)) : [...current, next]
    void updateSettings({ terminalQuickCommands: nextList })
  }

  const dialog = repoId ? (
    <TerminalQuickCommandDialog
      open={addDraft !== null}
      mode="add"
      command={addDraft ?? createTerminalQuickCommandDraft({ type: 'repo', repoId })}
      repos={repos}
      onOpenChange={(open) => !open && setAddDraft(null)}
      onSave={handleSaveCommand}
    />
  ) : null

  return {
    available: repoId !== null,
    commands,
    addCommand,
    runCommand,
    dialog
  }
}
