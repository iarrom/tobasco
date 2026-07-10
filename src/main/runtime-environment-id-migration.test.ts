import { describe, it, expect } from 'vitest'
import {
  migrateUiHostScopeRuntimeEnvironmentId,
  migrateWorkspaceSessionRuntimeEnvironmentId
} from './runtime-environment-id-migration'
import { toRemoteRuntimePtyId } from '../shared/remote-runtime-pty-id'
import type { PersistedUIState, TerminalTab, WorkspaceSessionState } from '../shared/types'

const OLD_ID = 'e1ab2caa-5eef-4eed-a19f-faa12b12bbff'
const NEW_ID = '0f9d41d2-1111-4222-8333-444455556666'

function makeSession(overrides: Partial<WorkspaceSessionState> = {}): WorkspaceSessionState {
  return {
    activeRepoId: null,
    activeWorktreeId: null,
    activeTabId: null,
    tabsByWorktree: {},
    terminalLayoutsByTabId: {},
    ...overrides
  }
}

function makeTab(ptyId: string | null): TerminalTab {
  return {
    id: 'tab-1',
    ptyId,
    worktreeId: 'wt-1',
    title: 'Terminal',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

describe('migrateWorkspaceSessionRuntimeEnvironmentId', () => {
  it('rewrites remote runtime pty ids carrying the old environment id', () => {
    const session = makeSession({
      tabsByWorktree: { 'wt-1': [makeTab(toRemoteRuntimePtyId('pty-7', OLD_ID))] },
      terminalLayoutsByTabId: {
        'tab-1': {
          root: null,
          activeLeafId: null,
          expandedLeafId: null,
          ptyIdsByLeafId: { 'leaf-1': toRemoteRuntimePtyId('pty-8', OLD_ID) }
        }
      },
      remoteSessionIdsByTabId: { 'tab-1': toRemoteRuntimePtyId('pty-7', OLD_ID) }
    })

    expect(migrateWorkspaceSessionRuntimeEnvironmentId(session, OLD_ID, NEW_ID)).toBe(true)
    expect(session.tabsByWorktree['wt-1']![0]!.ptyId).toBe(toRemoteRuntimePtyId('pty-7', NEW_ID))
    expect(session.terminalLayoutsByTabId['tab-1']!.ptyIdsByLeafId!['leaf-1']).toBe(
      toRemoteRuntimePtyId('pty-8', NEW_ID)
    )
    expect(session.remoteSessionIdsByTabId!['tab-1']).toBe(toRemoteRuntimePtyId('pty-7', NEW_ID))
  })

  it('rewrites persisted open-file environment stamps', () => {
    const session = makeSession({
      openFilesByWorktree: {
        'wt-1': [
          {
            filePath: '/repo/a.ts',
            relativePath: 'a.ts',
            worktreeId: 'wt-1',
            language: 'typescript',
            runtimeEnvironmentId: OLD_ID
          }
        ]
      }
    })

    expect(migrateWorkspaceSessionRuntimeEnvironmentId(session, OLD_ID, NEW_ID)).toBe(true)
    expect(session.openFilesByWorktree!['wt-1']![0]!.runtimeEnvironmentId).toBe(NEW_ID)
  })

  it('leaves other-environment pty ids and local tabs untouched', () => {
    const otherPtyId = toRemoteRuntimePtyId('pty-9', 'some-other-env')
    const session = makeSession({
      tabsByWorktree: { 'wt-1': [makeTab(otherPtyId), makeTab(null)] }
    })

    expect(migrateWorkspaceSessionRuntimeEnvironmentId(session, OLD_ID, NEW_ID)).toBe(false)
    expect(session.tabsByWorktree['wt-1']![0]!.ptyId).toBe(otherPtyId)
  })
})

describe('migrateUiHostScopeRuntimeEnvironmentId', () => {
  it('re-points the host scope arrays pinned to the old runtime host id', () => {
    const ui = {
      workspaceHostScope: `runtime:${OLD_ID}`,
      visibleWorkspaceHostIds: ['local', `runtime:${OLD_ID}`],
      workspaceHostOrder: [`runtime:${OLD_ID}`, 'local']
    } as unknown as PersistedUIState

    expect(migrateUiHostScopeRuntimeEnvironmentId(ui, OLD_ID, NEW_ID)).toBe(true)
    expect(ui.workspaceHostScope).toBe(`runtime:${NEW_ID}`)
    expect(ui.visibleWorkspaceHostIds).toEqual(['local', `runtime:${NEW_ID}`])
    expect(ui.workspaceHostOrder).toEqual([`runtime:${NEW_ID}`, 'local'])
  })

  it('reports no change when nothing references the old id', () => {
    const ui = {
      workspaceHostScope: 'local',
      visibleWorkspaceHostIds: ['local'],
      workspaceHostOrder: ['local']
    } as unknown as PersistedUIState

    expect(migrateUiHostScopeRuntimeEnvironmentId(ui, OLD_ID, NEW_ID)).toBe(false)
  })
})
