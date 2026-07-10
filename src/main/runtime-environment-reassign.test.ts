import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { toRemoteRuntimePtyId } from '../shared/remote-runtime-pty-id'
import type { Repo } from '../shared/types'

const testState = { dir: '' }

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.dir
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => ciphertext.toString('utf-8').slice('encrypted:'.length)
  }
}))

vi.mock('./telemetry/client', () => ({ track: vi.fn() }))
vi.mock('./telemetry/cohort-classifier', () => ({
  getCohortAtEmit: vi.fn(() => ({ nth_repo_added: 2 }))
}))

/** Reset modules and dynamically import Store so the data-file path picks up the current testState.dir */
async function createStore() {
  vi.resetModules()
  const { Store, initDataPath } = await import('./persistence')
  initDataPath()
  return new Store()
}

const makeRepo = (overrides: Partial<Repo> = {}): Repo => ({
  id: 'r1',
  path: '/repo',
  displayName: 'test',
  badgeColor: '#fff',
  addedAt: 1,
  ...overrides
})

const OLD_ID = 'e1ab2caa-5eef-4eed-a19f-faa12b12bbff'
const NEW_ID = '0f9d41d2-1111-4222-8333-444455556666'

describe('Store.reassignRuntimeEnvironmentId', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-test-'))
  })

  afterEach(() => {
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('re-points repos, worktree metas, and the session partition onto the new id', async () => {
    const store = await createStore()
    store.addRepo(makeRepo({ id: 'r1', executionHostId: `runtime:${OLD_ID}` }))
    store.setWorktreeMeta('r1::/repo/wt', { displayName: 'wt', hostId: `runtime:${OLD_ID}` })
    store.setWorkspaceSession(
      {
        activeRepoId: 'r1',
        activeWorktreeId: null,
        activeTabId: null,
        tabsByWorktree: {
          'r1::/repo/wt': [
            {
              id: 'tab-1',
              ptyId: toRemoteRuntimePtyId('pty-7', OLD_ID),
              worktreeId: 'r1::/repo/wt',
              title: 'claude',
              customTitle: null,
              color: null,
              sortOrder: 0,
              createdAt: 1
            }
          ]
        },
        terminalLayoutsByTabId: {}
      },
      `runtime:${OLD_ID}`
    )

    const count = store.reassignRuntimeEnvironmentId(OLD_ID, NEW_ID)

    expect(count).toBeGreaterThan(0)
    expect(store.getRepo('r1')!.executionHostId).toBe(`runtime:${NEW_ID}`)
    expect(store.getWorktreeMeta('r1::/repo/wt')!.hostId).toBe(`runtime:${NEW_ID}`)
    const migrated = store.getWorkspaceSession(`runtime:${NEW_ID}`)
    expect(migrated.tabsByWorktree['r1::/repo/wt']![0]!.ptyId).toBe(
      toRemoteRuntimePtyId('pty-7', NEW_ID)
    )
    // The old partition key is gone — nothing left to resurrect the dead id.
    expect(store.getWorkspaceSession(`runtime:${OLD_ID}`).tabsByWorktree).toEqual({})
  })

  it('leaves local and other-host repos untouched', async () => {
    const store = await createStore()
    store.addRepo(makeRepo({ id: 'local-repo', path: '/local' }))
    store.addRepo(makeRepo({ id: 'ssh-repo', path: '/remote', executionHostId: 'ssh:target-1' }))

    const count = store.reassignRuntimeEnvironmentId(OLD_ID, NEW_ID)

    expect(count).toBe(0)
    expect(store.getRepo('local-repo')!.executionHostId).toBeUndefined()
    expect(store.getRepo('ssh-repo')!.executionHostId).toBe('ssh:target-1')
  })

  it('tracks referenced runtime environment ids across carriers', async () => {
    const store = await createStore()
    store.addRepo(makeRepo({ id: 'r1', executionHostId: `runtime:${OLD_ID}` }))
    store.setWorktreeMeta('r1::/repo/wt', { displayName: 'wt', hostId: `runtime:${NEW_ID}` })

    expect(store.getReferencedRuntimeEnvironmentIds().sort()).toEqual([NEW_ID, OLD_ID].sort())
  })
})
