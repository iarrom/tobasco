// [FORK] Opens a generated plan document as a rendered markdown preview in a
// NEW TAB of the current group — no split; the plan joins the pane the user is
// already in. Reuses the existing editor machinery (no new tab kind) so it
// stays merge-safe against fast upstream.

import { useAppStore } from '@/store'
import { getRelativePathInsideRoot } from '@/lib/path'

export function openNativeChatPlanTab(params: {
  planPath: string
  worktreeId: string
  worktreePath: string
  runtimeEnvironmentId?: string | null
}): void {
  const state = useAppStore.getState()
  const { worktreeId, worktreePath, planPath } = params

  const targetGroupId =
    state.activeGroupIdByWorktree[worktreeId] ?? state.groupsByWorktree[worktreeId]?.[0]?.id ?? null
  if (!targetGroupId) {
    return
  }

  const relativePath = getRelativePathInsideRoot(planPath, worktreePath) ?? planPath

  state.openFile(
    {
      filePath: planPath,
      relativePath,
      worktreeId,
      language: 'markdown',
      runtimeEnvironmentId: params.runtimeEnvironmentId ?? null,
      mode: 'edit'
    },
    { targetGroupId }
  )
  // Render the plan (headings, code, task-list To-do, mermaid) rather than raw
  // source. The editor keys markdown view mode by fileId, which is the filePath.
  state.setMarkdownViewMode(planPath, 'preview')
}
