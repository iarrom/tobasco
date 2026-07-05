// @vitest-environment happy-dom

// [FORK] Queue semantics: hold while the agent works, flush one row per idle
// transition, gate the next flush on the agent acknowledging the turn, and
// force-send/edit/remove act immediately regardless of the working state.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useNativeChatSendQueue, type NativeChatQueuedMessage } from './use-native-chat-send-queue'

type HookProps = { isWorking: boolean; canFlush: boolean }

function setup(initial: HookProps) {
  const deliver = vi.fn()
  const hook = renderHook(
    (props: HookProps) =>
      useNativeChatSendQueue({ isWorking: props.isWorking, canFlush: props.canFlush, deliver }),
    { initialProps: initial }
  )
  return { deliver, hook }
}

describe('useNativeChatSendQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('holds queued messages while the agent works', () => {
    const { deliver, hook } = setup({ isWorking: true, canFlush: true })
    act(() => hook.result.current.enqueue('first', []))
    act(() => hook.result.current.enqueue('second', []))
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(deliver).not.toHaveBeenCalled()
    expect(hook.result.current.items.map((i) => i.text)).toEqual(['first', 'second'])
  })

  it('flushes one message per idle transition, waiting for the working ack', () => {
    const { deliver, hook } = setup({ isWorking: true, canFlush: true })
    act(() => hook.result.current.enqueue('first', []))
    act(() => hook.result.current.enqueue('second', []))

    // Agent goes idle: after the debounce only the head is delivered.
    hook.rerender({ isWorking: false, canFlush: true })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver).toHaveBeenCalledWith('first', [])
    expect(hook.result.current.items.map((i) => i.text)).toEqual(['second'])

    // Still idle but no ack yet — the second row must wait.
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(deliver).toHaveBeenCalledTimes(1)

    // The agent picks up the turn, then finishes — the second row flushes.
    hook.rerender({ isWorking: true, canFlush: true })
    hook.rerender({ isWorking: false, canFlush: true })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(deliver).toHaveBeenCalledTimes(2)
    expect(deliver).toHaveBeenLastCalledWith('second', [])
    expect(hook.result.current.items).toEqual([])
  })

  it('does not auto-flush while paused (interactive prompt)', () => {
    const { deliver, hook } = setup({ isWorking: false, canFlush: false })
    act(() => hook.result.current.enqueue('answer later', []))
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(deliver).not.toHaveBeenCalled()
  })

  it('force-sends a row immediately even while working', () => {
    const { deliver, hook } = setup({ isWorking: true, canFlush: true })
    act(() => hook.result.current.enqueue('urgent', ['/tmp/a.png']))
    const id = hook.result.current.items[0].id
    act(() => hook.result.current.sendNow(id))
    expect(deliver).toHaveBeenCalledWith('urgent', ['/tmp/a.png'])
    expect(hook.result.current.items).toEqual([])
  })

  it('take removes and returns the row for editing', () => {
    const { deliver, hook } = setup({ isWorking: true, canFlush: true })
    act(() => hook.result.current.enqueue('draft me', []))
    const id = hook.result.current.items[0].id
    // Why the ref-object: TS control-flow narrows a plain `let` to null across
    // the act() closure and rejects the property read below.
    const taken: { value: NativeChatQueuedMessage | null } = { value: null }
    act(() => {
      taken.value = hook.result.current.take(id)
    })
    expect(taken.value?.text).toBe('draft me')
    expect(hook.result.current.items).toEqual([])
    expect(deliver).not.toHaveBeenCalled()
  })

  it('recovers via the ack timeout if the working signal never arrives', () => {
    const { deliver, hook } = setup({ isWorking: true, canFlush: true })
    act(() => hook.result.current.enqueue('first', []))
    act(() => hook.result.current.enqueue('second', []))
    hook.rerender({ isWorking: false, canFlush: true })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(deliver).toHaveBeenCalledTimes(1)
    // No working ack ever arrives — after the timeout the gate clears and the
    // next flush goes out on the following debounce tick.
    act(() => {
      vi.advanceTimersByTime(9000)
    })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(deliver).toHaveBeenCalledTimes(2)
    expect(deliver).toHaveBeenLastCalledWith('second', [])
  })
})
