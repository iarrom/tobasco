// [FORK] Cursor-style send queue: messages submitted while the agent is mid-turn
// wait above the composer instead of steering the live run. One message flushes
// per idle transition (the next flush waits until the agent reports working
// again), so a stack of queued turns plays out sequentially.

import { useCallback, useEffect, useRef, useState } from 'react'

export type NativeChatQueuedMessage = {
  id: string
  text: string
  imagePaths: readonly string[]
}

function createQueuedMessageId(): string {
  return `nc-queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Why: the "working" signal comes from agent hooks and lags the pty write; if
// that event is ever missed the queue must not wedge forever.
const FLUSH_ACK_TIMEOUT_MS = 8000
// Why: hold a beat after the agent goes idle so a transient between-steps blip
// (or an interactive card about to appear) doesn't fire a queued turn into it.
const FLUSH_DEBOUNCE_MS = 350

export function useNativeChatSendQueue(params: {
  /** True while the hosted agent runs a turn — the queue holds. */
  isWorking: boolean
  /** Gate for auto-flush: false while sends must pause (no pty, presence lock,
   *  interactive question card). Manual force-send ignores this. */
  canFlush: boolean
  deliver: (text: string, imagePaths: readonly string[]) => void
}): {
  items: NativeChatQueuedMessage[]
  enqueue: (text: string, imagePaths: readonly string[]) => void
  remove: (id: string) => void
  /** Force-send a row immediately, even while the agent is still working. */
  sendNow: (id: string) => void
  /** Remove and return a row (the composer's edit action). */
  take: (id: string) => NativeChatQueuedMessage | null
} {
  const { isWorking, canFlush, deliver } = params
  const [items, setItems] = useState<NativeChatQueuedMessage[]>([])
  const itemsRef = useRef(items)
  itemsRef.current = items

  // After a flush, wait until the agent acknowledges the turn (isWorking flips
  // true) before flushing the next row; the ack timer is the missed-event escape.
  const awaitingWorkRef = useRef(false)
  const ackTimerRef = useRef<number | null>(null)
  const [ackTick, setAckTick] = useState(0)

  const clearAckTimer = useCallback((): void => {
    if (ackTimerRef.current !== null) {
      window.clearTimeout(ackTimerRef.current)
      ackTimerRef.current = null
    }
  }, [])

  if (isWorking && awaitingWorkRef.current) {
    awaitingWorkRef.current = false
    clearAckTimer()
  }

  useEffect(() => clearAckTimer, [clearAckTimer])

  useEffect(() => {
    if (items.length === 0 || isWorking || !canFlush || awaitingWorkRef.current) {
      return
    }
    const head = items[0]
    const timer = window.setTimeout(() => {
      awaitingWorkRef.current = true
      clearAckTimer()
      ackTimerRef.current = window.setTimeout(() => {
        ackTimerRef.current = null
        awaitingWorkRef.current = false
        // Re-render so the flush effect re-evaluates with the cleared gate.
        setAckTick((tick) => tick + 1)
      }, FLUSH_ACK_TIMEOUT_MS)
      deliver(head.text, head.imagePaths)
      setItems((prev) => prev.filter((item) => item.id !== head.id))
    }, FLUSH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [items, isWorking, canFlush, deliver, clearAckTimer, ackTick])

  const enqueue = useCallback((text: string, imagePaths: readonly string[]): void => {
    setItems((prev) => [
      ...prev,
      { id: createQueuedMessageId(), text, imagePaths: [...imagePaths] }
    ])
  }, [])

  const remove = useCallback((id: string): void => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const sendNow = useCallback(
    (id: string): void => {
      const item = itemsRef.current.find((entry) => entry.id === id)
      if (!item) {
        return
      }
      setItems((prev) => prev.filter((entry) => entry.id !== id))
      deliver(item.text, item.imagePaths)
    },
    [deliver]
  )

  const take = useCallback((id: string): NativeChatQueuedMessage | null => {
    const item = itemsRef.current.find((entry) => entry.id === id) ?? null
    if (item) {
      setItems((prev) => prev.filter((entry) => entry.id !== id))
    }
    return item
  }, [])

  return { items, enqueue, remove, sendNow, take }
}
