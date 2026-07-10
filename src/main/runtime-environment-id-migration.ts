import type { PersistedUIState, WorkspaceSessionState } from '../shared/types'
import { parseRemoteRuntimePtyId, toRemoteRuntimePtyId } from '../shared/remote-runtime-pty-id'
import { toRuntimeExecutionHostId } from '../shared/execution-host'

/**
 * Carrier sweep for runtime-environment re-adoption (see
 * runtime-environment-readoption.ts).
 *
 * reassignRuntimeEnvironmentId re-points repos/worktree metas, but the removed
 * environment's id is also embedded in other persisted state: remote runtime
 * pty ids ("remote:<environmentId>@@<handle>") inside the workspace session,
 * persisted open-file records, and the sidebar host-scope arrays. Any survivor
 * resurfaces later as `Unknown environment: <old id>` at launch/reattach time,
 * so every carrier must migrate together.
 *
 * All helpers mutate in place (matching how the Store edits this.state) and
 * return whether anything changed so callers can gate scheduleSave.
 */

function rewriteRuntimePtyId(
  ptyId: string,
  oldEnvironmentId: string,
  newEnvironmentId: string
): string | null {
  const parsed = parseRemoteRuntimePtyId(ptyId)
  if (!parsed || parsed.environmentId !== oldEnvironmentId) {
    return null
  }
  return toRemoteRuntimePtyId(parsed.handle, newEnvironmentId)
}

function rewriteRuntimePtyIdRecordValues(
  record: Record<string, string> | undefined,
  oldEnvironmentId: string,
  newEnvironmentId: string
): boolean {
  if (!record) {
    return false
  }
  let changed = false
  for (const [key, ptyId] of Object.entries(record)) {
    const next = rewriteRuntimePtyId(ptyId, oldEnvironmentId, newEnvironmentId)
    if (next) {
      record[key] = next
      changed = true
    }
  }
  return changed
}

/** Re-point every old-environment-id carrier inside one workspace session partition. */
export function migrateWorkspaceSessionRuntimeEnvironmentId(
  session: WorkspaceSessionState,
  oldEnvironmentId: string,
  newEnvironmentId: string
): boolean {
  let changed = false
  for (const tabs of Object.values(session.tabsByWorktree ?? {})) {
    for (const tab of tabs) {
      if (!tab.ptyId) {
        continue
      }
      const next = rewriteRuntimePtyId(tab.ptyId, oldEnvironmentId, newEnvironmentId)
      if (next) {
        tab.ptyId = next
        changed = true
      }
    }
  }
  for (const layout of Object.values(session.terminalLayoutsByTabId ?? {})) {
    if (
      rewriteRuntimePtyIdRecordValues(layout.ptyIdsByLeafId, oldEnvironmentId, newEnvironmentId)
    ) {
      changed = true
    }
  }
  if (
    rewriteRuntimePtyIdRecordValues(
      session.remoteSessionIdsByTabId,
      oldEnvironmentId,
      newEnvironmentId
    )
  ) {
    changed = true
  }
  for (const files of Object.values(session.openFilesByWorktree ?? {})) {
    for (const file of files) {
      if (file.runtimeEnvironmentId === oldEnvironmentId) {
        file.runtimeEnvironmentId = newEnvironmentId
        changed = true
      }
    }
  }
  return changed
}

/** Re-point the sidebar host-scope arrays pinned to the old runtime host id. */
export function migrateUiHostScopeRuntimeEnvironmentId(
  ui: PersistedUIState,
  oldEnvironmentId: string,
  newEnvironmentId: string
): boolean {
  const oldHostId = toRuntimeExecutionHostId(oldEnvironmentId)
  const newHostId = toRuntimeExecutionHostId(newEnvironmentId)
  let changed = false
  if (ui.workspaceHostScope === oldHostId) {
    ui.workspaceHostScope = newHostId
    changed = true
  }
  if (ui.visibleWorkspaceHostIds?.includes(oldHostId)) {
    ui.visibleWorkspaceHostIds = [
      ...new Set(ui.visibleWorkspaceHostIds.map((id) => (id === oldHostId ? newHostId : id)))
    ]
    changed = true
  }
  if (ui.workspaceHostOrder?.includes(oldHostId)) {
    ui.workspaceHostOrder = [
      ...new Set(ui.workspaceHostOrder.map((id) => (id === oldHostId ? newHostId : id)))
    ]
    changed = true
  }
  return changed
}
