import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NATIVE_CHAT_MODEL_SELECTION,
  describeNativeChatModelSelection,
  normalizeNativeChatModelSelection
} from './native-chat-model-selection'

describe('normalizeNativeChatModelSelection', () => {
  it('returns the default for null/undefined', () => {
    expect(normalizeNativeChatModelSelection(undefined)).toEqual(
      DEFAULT_NATIVE_CHAT_MODEL_SELECTION
    )
    expect(normalizeNativeChatModelSelection(null)).toEqual(DEFAULT_NATIVE_CHAT_MODEL_SELECTION)
  })

  it('fills invalid or missing fields from the default', () => {
    expect(
      normalizeNativeChatModelSelection({ model: 'bogus', effort: 'nope', context: 'xxl' })
    ).toEqual(DEFAULT_NATIVE_CHAT_MODEL_SELECTION)
  })

  it('keeps valid fields', () => {
    expect(
      normalizeNativeChatModelSelection({
        model: 'sonnet',
        effort: 'low',
        context: '1m',
        thinking: false,
        fast: true,
        planMode: true
      })
    ).toEqual({
      model: 'sonnet',
      effort: 'low',
      context: '1m',
      thinking: false,
      fast: true,
      planMode: true
    })
  })

  it('defaults planMode to false when missing or invalid', () => {
    expect(normalizeNativeChatModelSelection({ model: 'opus' }).planMode).toBe(false)
    expect(normalizeNativeChatModelSelection({ planMode: 'yes' }).planMode).toBe(false)
  })
})

describe('describeNativeChatModelSelection', () => {
  it('shows model and effort labels', () => {
    expect(
      describeNativeChatModelSelection({
        model: 'opus',
        effort: 'high',
        context: '200k',
        thinking: true,
        fast: false,
        planMode: false
      })
    ).toBe('Opus 4.8  High')
  })

  it('appends a 1M marker for the extended window', () => {
    expect(
      describeNativeChatModelSelection({
        model: 'opus',
        effort: 'xhigh',
        context: '1m',
        thinking: true,
        fast: false,
        planMode: false
      })
    ).toBe('Opus 4.8  Extra High · 1M')
  })
})
