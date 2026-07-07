import { describe, expect, it } from 'vitest'
import {
  MAX_PLAN_MODE_ENTRIES,
  normalizePlanModeTabs,
  planModeScopeKey,
  withPlanModeEntry
} from './use-native-chat-plan-mode'

describe('planModeScopeKey', () => {
  it('scopes by agent and tab so two projects never share a toggle', () => {
    expect(planModeScopeKey('claude', 'tab-a')).toBe('claude:tab-a')
    expect(planModeScopeKey('claude', 'tab-a')).not.toBe(planModeScopeKey('claude', 'tab-b'))
  })
})

describe('normalizePlanModeTabs', () => {
  it('returns an empty map for non-object values', () => {
    expect(normalizePlanModeTabs(undefined)).toEqual({})
    expect(normalizePlanModeTabs(null)).toEqual({})
    expect(normalizePlanModeTabs('claude:tab')).toEqual({})
    expect(normalizePlanModeTabs(['claude:tab'])).toEqual({})
  })

  it('keeps only literal-true entries', () => {
    expect(
      normalizePlanModeTabs({ 'claude:a': true, 'claude:b': false, 'claude:c': 'yes' })
    ).toEqual({ 'claude:a': true })
  })
})

describe('withPlanModeEntry', () => {
  it('adds and removes entries without mutating the input', () => {
    const base = { 'claude:a': true } as Record<string, true>
    const enabled = withPlanModeEntry(base, 'claude:b', true)
    expect(enabled).toEqual({ 'claude:a': true, 'claude:b': true })
    const disabled = withPlanModeEntry(enabled, 'claude:a', false)
    expect(disabled).toEqual({ 'claude:b': true })
    expect(base).toEqual({ 'claude:a': true })
  })

  it('prunes the oldest entries past the cap', () => {
    let map: Record<string, true> = {}
    for (let i = 0; i < MAX_PLAN_MODE_ENTRIES; i += 1) {
      map = withPlanModeEntry(map, `claude:tab-${i}`, true)
    }
    const overflowed = withPlanModeEntry(map, 'claude:tab-new', true)
    expect(Object.keys(overflowed)).toHaveLength(MAX_PLAN_MODE_ENTRIES)
    expect(overflowed['claude:tab-0']).toBeUndefined()
    expect(overflowed['claude:tab-new']).toBe(true)
  })

  it('re-inserting an existing key moves it to the newest position', () => {
    let map: Record<string, true> = {}
    for (let i = 0; i < MAX_PLAN_MODE_ENTRIES; i += 1) {
      map = withPlanModeEntry(map, `claude:tab-${i}`, true)
    }
    map = withPlanModeEntry(map, 'claude:tab-0', true)
    map = withPlanModeEntry(map, 'claude:tab-new', true)
    expect(map['claude:tab-0']).toBe(true)
    expect(map['claude:tab-1']).toBeUndefined()
  })
})
