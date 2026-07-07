// [FORK] Per-tab persisted Plan-mode toggle for the native chat. Plan mode is a
// property of one conversation, not of the agent type — when it lived in the
// per-agent model-selection blob, toggling Plan in one project flipped every
// claude chat's composer and wrapped their sends in the plan directive. The
// whole state is one bounded localStorage map keyed `${agent}:${terminalTabId}`
// so closed tabs cannot grow storage forever.

import { useCallback, useState } from 'react'

const STORAGE_KEY = 'orca:native-chat-plan-mode-tabs'
// Bound the persisted map; oldest entries (insertion order) are dropped first.
export const MAX_PLAN_MODE_ENTRIES = 64

export function planModeScopeKey(agent: string, terminalTabId: string): string {
  return `${agent}:${terminalTabId}`
}

/** Coerce an untrusted persisted value into the map shape. Only `true` entries
 *  survive — a disabled tab is deleted from the map, never stored as false. */
export function normalizePlanModeTabs(value: unknown): Record<string, true> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  const map: Record<string, true> = {}
  for (const [key, enabled] of Object.entries(value)) {
    if (enabled === true) {
      map[key] = true
    }
  }
  return map
}

/** Pure toggle: a new map with the entry set/cleared, re-inserted last so the
 *  cap prunes the least-recently-toggled tabs first. */
export function withPlanModeEntry(
  map: Record<string, true>,
  key: string,
  enabled: boolean
): Record<string, true> {
  const next: Record<string, true> = {}
  for (const existing of Object.keys(map)) {
    if (existing !== key) {
      next[existing] = true
    }
  }
  if (enabled) {
    next[key] = true
  }
  const keys = Object.keys(next)
  for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_PLAN_MODE_ENTRIES))) {
    delete next[stale]
  }
  return next
}

function readPlanModeTabs(): Record<string, true> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? normalizePlanModeTabs(JSON.parse(raw)) : {}
  } catch {
    // Corrupt blob or storage disabled (e.g. locked-down SSH webview): treat as
    // all-off rather than break the composer.
    return {}
  }
}

function writePlanModeTabs(map: Record<string, true>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Persisting is best-effort; a failed write must not break the toggle.
  }
}

export type NativeChatPlanModeState = {
  planMode: boolean
  setPlanMode: (enabled: boolean) => void
}

export function useNativeChatPlanMode(
  agent: string,
  terminalTabId: string
): NativeChatPlanModeState {
  const key = planModeScopeKey(agent, terminalTabId)
  const [planModeByKey, setPlanModeByKey] = useState<Record<string, boolean>>(() => ({
    [key]: readPlanModeTabs()[key] === true
  }))

  // Lazily hydrate a newly-focused tab's state without an effect so the first
  // render already reflects the persisted toggle (same pattern as the model
  // selection hook).
  const planMode = planModeByKey[key] ?? readPlanModeTabs()[key] === true
  if (planModeByKey[key] === undefined) {
    setPlanModeByKey((prev) => ({ ...prev, [key]: planMode }))
  }

  const setPlanMode = useCallback(
    (enabled: boolean): void => {
      writePlanModeTabs(withPlanModeEntry(readPlanModeTabs(), key, enabled))
      setPlanModeByKey((prev) => ({ ...prev, [key]: enabled }))
    },
    [key]
  )

  return { planMode, setPlanMode }
}
