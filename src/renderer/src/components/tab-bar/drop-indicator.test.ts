import { describe, expect, it } from 'vitest'
import {
  ACTIVE_TAB_INDICATOR_CLASSES,
  getDropIndicatorClasses,
  getTabRootStateClasses,
  getTabStripBorderClasses
} from './drop-indicator'

describe('getDropIndicatorClasses', () => {
  it('returns left pseudo-element classes for "left" indicator', () => {
    const classes = getDropIndicatorClasses('left')
    expect(classes).toContain('before:left-0')
    expect(classes).toContain('before:bg-blue-500')
    expect(classes).toContain('before:w-[2px]')
    expect(classes).toContain('before:absolute')
    expect(classes).toContain('before:inset-y-0')
    expect(classes).toContain('before:z-10')
  })

  it('returns right pseudo-element classes for "right" indicator', () => {
    const classes = getDropIndicatorClasses('right')
    expect(classes).toContain('after:right-0')
    expect(classes).toContain('after:bg-blue-500')
    expect(classes).toContain('after:w-[2px]')
    expect(classes).toContain('after:absolute')
    expect(classes).toContain('after:inset-y-0')
    expect(classes).toContain('after:z-10')
  })

  it('returns an empty string for null indicator', () => {
    expect(getDropIndicatorClasses(null)).toBe('')
  })

  it('uses before pseudo-element for left and after for right', () => {
    const left = getDropIndicatorClasses('left')
    const right = getDropIndicatorClasses('right')
    // Left uses before: prefix, right uses after: prefix
    expect(left).toMatch(/^before:/)
    expect(right).toMatch(/^after:/)
    expect(left).not.toContain('after:')
    expect(right).not.toContain('before:')
  })
})

// [FORK] Cursor-style text chips: no bottom selection bar, no per-tab borders;
// active reads via a rounded pill wash.
describe('ACTIVE_TAB_INDICATOR_CLASSES', () => {
  it('is hidden — the pill background is the selection marker', () => {
    expect(ACTIVE_TAB_INDICATOR_CLASSES).toBe('hidden')
  })
})

describe('getTabStripBorderClasses', () => {
  it('draws no separators between chip tabs', () => {
    expect(getTabStripBorderClasses(true)).toBe('')
    expect(getTabStripBorderClasses(false)).toBe('')
    expect(getTabStripBorderClasses(true, { includeTopBorder: false })).toBe('')
  })
})

describe('getTabRootStateClasses', () => {
  it('returns the shared selected-tab surface treatment', () => {
    const classes = getTabRootStateClasses(true)
    expect(classes).toContain('rounded-md')
    expect(classes).toContain('bg-[color-mix(in_srgb,var(--foreground)_8%,var(--card))]')
    expect(classes).toContain('text-foreground')
    expect(classes).not.toContain('hover:text-foreground')
  })

  it('returns the shared inactive-tab surface treatment', () => {
    const classes = getTabRootStateClasses(false)
    expect(classes).toContain('rounded-md')
    expect(classes).not.toContain('bg-card')
    expect(classes).toContain('text-muted-foreground')
    expect(classes).toContain('hover:text-foreground')
  })
})
