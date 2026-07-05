import { describe, expect, it } from 'vitest'
import { pairToolBlocks } from './native-chat-tool-pairing'
import type { NativeChatBlock } from '../../../../shared/native-chat-types'

const call = (name: string): NativeChatBlock => ({ type: 'tool-call', name, input: {} })
const result = (output: string): NativeChatBlock => ({ type: 'tool-result', output })

describe('pairToolBlocks', () => {
  it('pairs each call with the immediately following result', () => {
    const steps = pairToolBlocks([call('Bash'), result('ok'), call('Read'), result('body')])
    expect(steps).toHaveLength(2)
    expect(steps[0].call?.name).toBe('Bash')
    expect(steps[0].result?.output).toBe('ok')
    expect(steps[1].call?.name).toBe('Read')
    expect(steps[1].result?.output).toBe('body')
  })

  it('leaves a trailing call without a result as in-flight (result null)', () => {
    const steps = pairToolBlocks([call('Bash')])
    expect(steps).toEqual([{ call: expect.objectContaining({ name: 'Bash' }), result: null }])
  })

  it('attaches results to the most recent open call when calls are batched', () => {
    const steps = pairToolBlocks([call('A'), call('B'), result('rb'), result('ra')])
    // 'rb' fills B (most recent open), then 'ra' fills A.
    expect(steps[0].call?.name).toBe('A')
    expect(steps[0].result?.output).toBe('ra')
    expect(steps[1].call?.name).toBe('B')
    expect(steps[1].result?.output).toBe('rb')
  })

  it('keeps an orphan result (no preceding call) as its own step', () => {
    const steps = pairToolBlocks([result('orphan')])
    expect(steps).toEqual([{ call: null, result: expect.objectContaining({ output: 'orphan' }) }])
  })
})
