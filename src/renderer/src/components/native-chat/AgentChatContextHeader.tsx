// [FORK] Cursor-стиль контекстной шапки чата: «проект ▾  ветка ▾  где ▾».
// Ветка — поиск по локальным веткам + checkout; «где» — worktree проекта и
// создание нового. Метка ветки читает worktree.branch, так что смена ветки
// агентом отражается сама (git-common watcher обновляет store).
import { Check, ChevronDown, GitFork, Monitor } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Worktree } from '../../../../shared/types'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree-id'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { branchName } from '@/lib/git-utils'
import { getRuntimeEnvironmentIdForRepo } from '@/lib/repo-runtime-owner'
import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { openWorkspaceCreationComposerWithTourHandoff } from '@/components/contextual-tours/workspace-creation-tour-handoff'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'

const EMPTY_WORKTREES: readonly Worktree[] = []

function headerTriggerClassName(extra?: string): string {
  return cn(
    'flex h-6 min-w-0 shrink items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground/80 transition-colors hover:bg-input/30 hover:text-foreground',
    extra
  )
}

function hostLabelFor(hostId: string | undefined, sshTargetLabels: Map<string, string>): string {
  if (!hostId || hostId === 'local') {
    return navigator.userAgent.includes('Mac') ? 'This Mac' : 'This machine'
  }
  if (hostId.startsWith('ssh:')) {
    const targetId = hostId.slice('ssh:'.length)
    return sshTargetLabels.get(targetId) ?? targetId
  }
  return hostId
}

export function AgentChatContextHeader({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element | null {
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const repos = useAppStore((s) => s.repos)
  const repoWorktrees = useAppStore((s) => s.worktreesByRepo[repoId] ?? EMPTY_WORKTREES)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const runtimeEnvironmentId = useAppStore((s) => getRuntimeEnvironmentIdForRepo(s, repoId))

  const repo = repos.find((r) => r.id === repoId) ?? null
  const worktree = repoWorktrees.find((w) => w.id === worktreeId) ?? null

  const [branchPickerOpen, setBranchPickerOpen] = useState(false)
  const [branches, setBranches] = useState<string[] | null>(null)
  const [checkoutPending, setCheckoutPending] = useState(false)
  // Why: checkout succeeds before the git watcher refreshes worktree.branch;
  // bridge the gap so the label doesn't flash the old branch.
  const [optimisticBranch, setOptimisticBranch] = useState<string | null>(null)

  // Why: worktree.branch is a full ref (`refs/heads/main`); pickers and the
  // trigger label speak short names, matching `git.localBranches` output.
  const currentBranch = optimisticBranch ?? (worktree?.branch ? branchName(worktree.branch) : null)

  useEffect(() => {
    if (optimisticBranch && worktree?.branch && branchName(worktree.branch) === optimisticBranch) {
      setOptimisticBranch(null)
    }
  }, [optimisticBranch, worktree?.branch])

  const target: RuntimeClientTarget = runtimeEnvironmentId
    ? { kind: 'environment', environmentId: runtimeEnvironmentId }
    : { kind: 'local' }
  const worktreeSelector = toRuntimeWorktreeSelector(worktreeId)

  const loadBranches = useCallback(async (): Promise<void> => {
    try {
      const result = await callRuntimeRpc<{ current: string | null; branches: string[] }>(
        target,
        'git.localBranches',
        { worktree: worktreeSelector },
        { timeoutMs: 15_000 }
      )
      setBranches(result.branches)
    } catch (error) {
      setBranches([])
      toast.error('Failed to list branches', {
        description: error instanceof Error ? error.message : String(error)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeEnvironmentId, worktreeSelector])

  const handleBranchPickerOpenChange = useCallback(
    (open: boolean) => {
      setBranchPickerOpen(open)
      if (open) {
        setBranches(null)
        void loadBranches()
      }
    },
    [loadBranches]
  )

  const handleCheckout = useCallback(
    async (branch: string): Promise<void> => {
      if (branch === currentBranch) {
        setBranchPickerOpen(false)
        return
      }
      setCheckoutPending(true)
      try {
        await callRuntimeRpc(
          target,
          'git.checkout',
          { worktree: worktreeSelector, branch },
          { timeoutMs: 30_000 }
        )
        setOptimisticBranch(branch)
        setBranchPickerOpen(false)
      } catch (error) {
        toast.error('Checkout failed', {
          description: error instanceof Error ? error.message : String(error)
        })
      } finally {
        setCheckoutPending(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentBranch, runtimeEnvironmentId, worktreeSelector]
  )

  if (!repo || !worktree) {
    return null
  }

  const visibleWorktrees = repoWorktrees.filter((w) => !w.isArchived)
  const hostLabel = hostLabelFor(worktree.hostId, sshTargetLabels)
  // Why: put the current branch first with its badge (Cursor layout) so the
  // list answers "where am I" before offering alternatives.
  const orderedBranches =
    branches === null
      ? null
      : [
          ...(currentBranch && branches.includes(currentBranch) ? [currentBranch] : []),
          ...branches.filter((b) => b !== currentBranch)
        ]

  return (
    <div className="flex h-7 shrink-0 items-center gap-0.5 border-b border-border bg-card px-1.5">
      {/* Проект */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={headerTriggerClassName('font-medium text-foreground/90')}
          >
            <span className="min-w-0 truncate">{repo.displayName}</span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground/60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {repos.map((r) => (
            <DropdownMenuItem
              key={r.id}
              onSelect={() => {
                if (r.id === repo.id) {
                  return
                }
                const candidates = (useAppStore.getState().worktreesByRepo[r.id] ?? [])
                  .filter((w) => !w.isArchived)
                  .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
                if (candidates[0]) {
                  void activateWorktreeFromSidebar(candidates[0].id)
                }
              }}
            >
              <span className="min-w-0 flex-1 truncate">{r.displayName}</span>
              {r.id === repo.id ? <Check className="size-3.5 shrink-0" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Ветка */}
      <Popover open={branchPickerOpen} onOpenChange={handleBranchPickerOpenChange}>
        <PopoverTrigger asChild>
          <button type="button" className={headerTriggerClassName()}>
            <span className="min-w-0 truncate">{currentBranch ?? 'detached'}</span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground/60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Search branches..." autoFocus />
            <CommandList className="max-h-72">
              <CommandEmpty>
                {branches === null ? 'Loading branches…' : 'No branches found.'}
              </CommandEmpty>
              {orderedBranches?.map((branch) => (
                <CommandItem
                  key={branch}
                  value={branch}
                  disabled={checkoutPending}
                  onSelect={() => void handleCheckout(branch)}
                >
                  <span className="min-w-0 flex-1 truncate">{branch}</span>
                  {branch === currentBranch ? (
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      Current
                      <Check className="size-3.5" />
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Где выполняется: worktree проекта + New Worktree */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={headerTriggerClassName()}>
            <Monitor className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span className="min-w-0 truncate">{hostLabel}</span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground/60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-muted-foreground">Run on</DropdownMenuLabel>
          {visibleWorktrees.map((w) => (
            <DropdownMenuItem
              key={w.id}
              onSelect={() => {
                if (w.id !== worktreeId) {
                  void activateWorktreeFromSidebar(w.id)
                }
              }}
            >
              <span className="min-w-0 flex-1 truncate">{w.displayName}</span>
              {w.branch ? (
                <span className="max-w-32 shrink-0 truncate text-xs text-muted-foreground">
                  {branchName(w.branch)}
                </span>
              ) : null}
              {w.id === worktreeId ? <Check className="size-3.5 shrink-0" /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openWorkspaceCreationComposerWithTourHandoff()}>
            <GitFork className="size-3.5" />
            New Worktree
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default AgentChatContextHeader
