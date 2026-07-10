import { describe, it, expect } from 'vitest'
import {
  readoptOrphanedWorkspacesForEnvironment,
  selfHealDanglingRuntimeEnvironmentStamps
} from './runtime-environment-readoption'
import type { Store } from './persistence'
import type {
  KnownRuntimeEnvironment,
  RemovedRuntimeEnvironmentTombstone
} from '../shared/runtime-environments'

function makeEnvironment(
  overrides: Partial<KnownRuntimeEnvironment> = {}
): KnownRuntimeEnvironment {
  return {
    id: 'env-new',
    name: 'Home server',
    createdAt: 1,
    updatedAt: 1,
    lastUsedAt: null,
    runtimeId: null,
    endpoints: [
      {
        id: 'ws-env-new',
        kind: 'websocket',
        label: 'WebSocket',
        endpoint: 'wss://100.64.0.1:1234',
        deviceToken: 'token',
        publicKeyB64: 'server-key-A'
      }
    ],
    preferredEndpointId: 'ws-env-new',
    ...overrides
  }
}

/** Minimal in-memory store exposing only what re-adoption touches. */
function makeFakeStore(
  tombstones: RemovedRuntimeEnvironmentTombstone[],
  referencedIds: string[] = []
) {
  const reassigned: { oldId: string; newId: string }[] = []
  let current = [...tombstones]
  const store = {
    getRemovedRuntimeEnvironmentTombstones: () => [...current],
    removeRemovedRuntimeEnvironmentTombstone: (oldEnvironmentId: string) => {
      current = current.filter((t) => t.oldEnvironmentId !== oldEnvironmentId)
    },
    getReferencedRuntimeEnvironmentIds: () => [...referencedIds],
    reassignRuntimeEnvironmentId: (oldEnvironmentId: string, newEnvironmentId: string) => {
      reassigned.push({ oldId: oldEnvironmentId, newId: newEnvironmentId })
      return 1
    }
  } as unknown as Store
  return { store, reassigned, remaining: () => current }
}

const tombstone = (
  overrides: Partial<RemovedRuntimeEnvironmentTombstone> = {}
): RemovedRuntimeEnvironmentTombstone => ({
  oldEnvironmentId: 'env-old',
  publicKeysB64: ['server-key-A'],
  name: 'Home server',
  removedAt: 1,
  ...overrides
})

describe('readoptOrphanedWorkspacesForEnvironment', () => {
  it('re-adopts and consumes the tombstone on matching server key', () => {
    const fake = makeFakeStore([tombstone()])
    const count = readoptOrphanedWorkspacesForEnvironment(fake.store, makeEnvironment())
    expect(count).toBe(1)
    expect(fake.reassigned).toEqual([{ oldId: 'env-old', newId: 'env-new' }])
    expect(fake.remaining()).toHaveLength(0)
  })

  it('ignores tombstones from a different server', () => {
    const fake = makeFakeStore([tombstone({ publicKeysB64: ['other-server-key'] })])
    const count = readoptOrphanedWorkspacesForEnvironment(fake.store, makeEnvironment())
    expect(count).toBe(0)
    expect(fake.reassigned).toEqual([])
    expect(fake.remaining()).toHaveLength(1)
  })

  it('drops a tombstone that resolves to the live environment id without re-pointing', () => {
    const fake = makeFakeStore([tombstone({ oldEnvironmentId: 'env-new' })])
    const count = readoptOrphanedWorkspacesForEnvironment(fake.store, makeEnvironment())
    expect(count).toBe(0)
    expect(fake.reassigned).toEqual([])
    expect(fake.remaining()).toHaveLength(0)
  })
})

describe('selfHealDanglingRuntimeEnvironmentStamps', () => {
  it('adopts dangling stamps when exactly one user-managed environment exists', () => {
    const fake = makeFakeStore([], ['env-dangling', 'env-new'])
    const healed = selfHealDanglingRuntimeEnvironmentStamps(fake.store, [makeEnvironment()])
    expect(healed).toBe(1)
    expect(fake.reassigned).toEqual([{ oldId: 'env-dangling', newId: 'env-new' }])
  })

  it('does nothing when several user-managed environments are paired', () => {
    const fake = makeFakeStore([], ['env-dangling'])
    const healed = selfHealDanglingRuntimeEnvironmentStamps(fake.store, [
      makeEnvironment(),
      makeEnvironment({ id: 'env-2', name: 'Other server' })
    ])
    expect(healed).toBe(0)
    expect(fake.reassigned).toEqual([])
  })

  it('leaves tombstoned ids alone so a later re-pair adopts them precisely', () => {
    const fake = makeFakeStore([tombstone()], ['env-old'])
    const healed = selfHealDanglingRuntimeEnvironmentStamps(fake.store, [makeEnvironment()])
    expect(healed).toBe(0)
    expect(fake.reassigned).toEqual([])
  })

  it('ignores ephemeral-vm environments when counting adopters', () => {
    const fake = makeFakeStore([], ['env-dangling'])
    const healed = selfHealDanglingRuntimeEnvironmentStamps(fake.store, [
      makeEnvironment(),
      makeEnvironment({ id: 'vm-1', name: 'VM', source: 'ephemeral-vm' })
    ])
    expect(healed).toBe(1)
    expect(fake.reassigned).toEqual([{ oldId: 'env-dangling', newId: 'env-new' }])
  })
})
