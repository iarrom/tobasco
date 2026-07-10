import { describe, expect, it } from 'vitest'
import { buildNativeChatTurnGroups, formatWorkedDuration } from './native-chat-turn-groups'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'

let seq = 0
function msg(
  role: NativeChatMessage['role'],
  blocks: NativeChatMessage['blocks'],
  timestamp: number | null = null
): NativeChatMessage {
  seq += 1
  return { id: `m${seq}`, role, blocks, timestamp, source: 'transcript' }
}
const text = (t: string) => ({ type: 'text', text: t }) as const
const toolCall = (name: string) => ({ type: 'tool-call', name, input: {} }) as const

describe('buildNativeChatTurnGroups', () => {
  it('collapses reasoning + tools into a work group and keeps the final answer separate', () => {
    const messages = [
      msg('user', [text('do it')]),
      msg('reasoning', [text('thinking')]),
      msg('assistant', [toolCall('Bash')]),
      msg('assistant', [text('done')])
    ]
    const groups = buildNativeChatTurnGroups(messages, { working: false })
    expect(groups.map((g) => g.kind)).toEqual(['message', 'work', 'message'])
    const work = groups[1]
    if (work.kind !== 'work') {
      throw new Error('expected work group')
    }
    expect(work.steps).toHaveLength(2)
    expect(work.live).toBe(false)
    expect(groups[2].kind === 'message' && groups[2].message.role).toBe('assistant')
  })

  it('marks the trailing work group live while working with no answer yet', () => {
    const messages = [
      msg('user', [text('go')]),
      msg('reasoning', [text('hmm')]),
      msg('assistant', [toolCall('Read')])
    ]
    const groups = buildNativeChatTurnGroups(messages, { working: true })
    expect(groups.map((g) => g.kind)).toEqual(['message', 'work'])
    expect(groups[1].kind === 'work' && groups[1].live).toBe(true)
  })

  it('stays live when intermediate prose lands mid-turn (no premature "Worked")', () => {
    const messages = [
      msg('user', [text('release it')]),
      msg('assistant', [toolCall('Bash')]),
      msg('assistant', [text('Committed, pushed to main, running the build:')])
    ]
    const groups = buildNativeChatTurnGroups(messages, { working: true })
    expect(groups.map((g) => g.kind)).toEqual(['message', 'work', 'message'])
    // The trailing prose is an intermediate result while the agent still works —
    // the steps must stay live instead of seesawing collapsed/expanded as the
    // next tool call arrives.
    expect(groups[1].kind === 'work' && groups[1].live).toBe(true)
  })

  it('does not collapse a plain answer with no work steps', () => {
    const messages = [msg('user', [text('hi')]), msg('assistant', [text('hello')])]
    const groups = buildNativeChatTurnGroups(messages, { working: false })
    expect(groups.map((g) => g.kind)).toEqual(['message', 'message'])
  })

  it('keeps a preamble text before tools inside the work steps, not the answer', () => {
    const messages = [
      msg('user', [text('q')]),
      msg('assistant', [text('let me check')]),
      msg('assistant', [toolCall('Grep')]),
      msg('assistant', [text('final answer')])
    ]
    const groups = buildNativeChatTurnGroups(messages, { working: false })
    expect(groups.map((g) => g.kind)).toEqual(['message', 'work', 'message'])
    const work = groups[1]
    if (work.kind !== 'work') {
      throw new Error('expected work group')
    }
    expect(work.steps).toHaveLength(2)
  })

  it('computes duration from first step to the answer', () => {
    const messages = [
      msg('user', [text('q')], 0),
      msg('reasoning', [text('t')], 1000),
      msg('assistant', [toolCall('Bash')], 2000),
      msg('assistant', [text('a')], 5000)
    ]
    const groups = buildNativeChatTurnGroups(messages, { working: false })
    const work = groups[1]
    if (work.kind !== 'work') {
      throw new Error('expected work group')
    }
    expect(work.durationMs).toBe(4000)
  })
})

describe('formatWorkedDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatWorkedDuration(45_000)).toBe('45s')
    expect(formatWorkedDuration(5 * 60_000)).toBe('5m')
    expect(formatWorkedDuration((60 + 3) * 60_000)).toBe('1h 3m')
    expect(formatWorkedDuration(120 * 60_000)).toBe('2h')
  })

  it('returns null for unknown/zero durations', () => {
    expect(formatWorkedDuration(null)).toBeNull()
    expect(formatWorkedDuration(0)).toBeNull()
  })
})
