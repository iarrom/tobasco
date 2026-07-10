import type { Store } from './persistence'
import {
  isUserManagedRuntimeEnvironment,
  type KnownRuntimeEnvironment
} from '../shared/runtime-environments'

/**
 * Re-adoption of workspaces orphaned when a runtime environment was removed.
 *
 * Repos, worktree metas, session partitions and persisted remote pty ids store
 * only the (random) environment id, so removing a paired server strands them on
 * a dead id — every launch then fails with `Unknown environment: <old id>`.
 * When the user re-pairs the same server (e.g. after switching to a Tailscale
 * address), a fresh id is minted and nothing links the old workspaces to it.
 *
 * Two healing paths, mirroring ssh-target-readoption.ts:
 * - Tombstones: removal records the server's E2EE public keys; a later re-pair
 *   with a matching key re-points every carrier onto the new id.
 * - Dangling-stamp fallback: pre-tombstone removals left orphans with no
 *   identity record. When exactly ONE user-managed environment is paired, any
 *   dangling runtime stamp can only reasonably belong to it, so adopt them.
 */

function log(message: string): void {
  console.info(`[runtime-environment-readoption] ${message}`)
}

/**
 * Re-point orphaned carriers onto `newEnvironment` if a removed environment
 * with the same server public key is tombstoned. Consumes the matching
 * tombstone(s). Returns the number of carriers re-adopted.
 */
export function readoptOrphanedWorkspacesForEnvironment(
  store: Store,
  newEnvironment: KnownRuntimeEnvironment
): number {
  const tombstones = store.getRemovedRuntimeEnvironmentTombstones()
  if (tombstones.length === 0) {
    return 0
  }
  const newKeys = new Set(newEnvironment.endpoints.map((endpoint) => endpoint.publicKeyB64))
  let readopted = 0
  for (const tombstone of tombstones) {
    // Why: a re-added environment can't share the id of one that still exists,
    // but guard anyway so we never re-point a live environment onto itself.
    if (tombstone.oldEnvironmentId === newEnvironment.id) {
      store.removeRemovedRuntimeEnvironmentTombstone(tombstone.oldEnvironmentId)
      continue
    }
    if (!tombstone.publicKeysB64.some((key) => newKeys.has(key))) {
      continue
    }
    const count = store.reassignRuntimeEnvironmentId(tombstone.oldEnvironmentId, newEnvironment.id)
    if (count > 0) {
      log(
        `re-adopted ${count} carrier(s) from removed environment ${tombstone.oldEnvironmentId} onto ${newEnvironment.id}`
      )
    }
    readopted += count
    // Consume the tombstone whether or not it re-pointed anything: the server
    // has returned, so the record has served its purpose.
    store.removeRemovedRuntimeEnvironmentTombstone(tombstone.oldEnvironmentId)
  }
  return readopted
}

/**
 * Fallback heal for orphans created before tombstones existed: stamps pointing
 * at an environment id that is neither paired nor tombstoned. Only adopts when
 * exactly one user-managed environment is paired — with several, the owner is
 * ambiguous and guessing could mislink two genuinely different servers.
 */
export function selfHealDanglingRuntimeEnvironmentStamps(
  store: Store,
  knownEnvironments: KnownRuntimeEnvironment[]
): number {
  const userManaged = knownEnvironments.filter(isUserManagedRuntimeEnvironment)
  if (userManaged.length !== 1) {
    return 0
  }
  const adopter = userManaged[0]!
  const knownIds = new Set(knownEnvironments.map((environment) => environment.id))
  const tombstonedIds = new Set(
    store.getRemovedRuntimeEnvironmentTombstones().map((t) => t.oldEnvironmentId)
  )
  let healed = 0
  for (const environmentId of store.getReferencedRuntimeEnvironmentIds()) {
    if (knownIds.has(environmentId) || tombstonedIds.has(environmentId)) {
      continue
    }
    const count = store.reassignRuntimeEnvironmentId(environmentId, adopter.id)
    if (count > 0) {
      log(`healed ${count} dangling carrier(s) from ${environmentId} onto ${adopter.id}`)
    }
    healed += count
  }
  return healed
}
