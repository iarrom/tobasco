// [FORK] Bundles the composer's send-queue wiring (delivery, queue state, and
// the edit-back-into-composer action) so NativeChatComposer stays within the
// max-lines budget. See use-native-chat-send-queue.ts for the queue semantics.

import { useCallback, type RefObject } from 'react'
import { useNativeChatDeliverMessage } from './use-native-chat-composer-send'
import { useNativeChatSendQueue, type NativeChatQueuedMessage } from './use-native-chat-send-queue'
import type { NativeChatResolvedTarget } from './native-chat-composer-target'

export function useNativeChatComposerQueue(params: {
  agent: string
  isWorking: boolean
  disabled: boolean
  queuePaused: boolean
  resolveTarget: () => NativeChatResolvedTarget | null
  wrapOutgoing: (text: string, isSlashCommand: boolean) => string
  onOptimisticSend?: (text: string, imagePaths?: string[]) => void
  setDraft: (next: string | ((previous: string) => string)) => void
  setCaret: (caret: number) => void
  attachLocalPaths: (paths: string[]) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
}): {
  items: NativeChatQueuedMessage[]
  /** Non-null while the agent works — the composer submit path queues turns. */
  enqueueWhileWorking: ((text: string, imagePaths: readonly string[]) => void) | null
  sendNow: (id: string) => void
  remove: (id: string) => void
  /** Pull the row back into the composer (text + re-attached images). */
  editQueuedMessage: (id: string) => void
} {
  const {
    agent,
    isWorking,
    disabled,
    queuePaused,
    resolveTarget,
    wrapOutgoing,
    onOptimisticSend,
    setDraft,
    setCaret,
    attachLocalPaths,
    textareaRef
  } = params

  const deliver = useNativeChatDeliverMessage({
    agent,
    resolveTarget,
    wrapOutgoing,
    onOptimisticSend
  })
  const queue = useNativeChatSendQueue({
    isWorking,
    canFlush: !disabled && !queuePaused,
    deliver
  })

  const editQueuedMessage = useCallback(
    (id: string): void => {
      const item = queue.take(id)
      if (!item) {
        return
      }
      setDraft(item.text)
      setCaret(item.text.length)
      if (item.imagePaths.length > 0) {
        attachLocalPaths([...item.imagePaths])
      }
      textareaRef.current?.focus()
    },
    [queue, setDraft, setCaret, attachLocalPaths, textareaRef]
  )

  return {
    items: queue.items,
    enqueueWhileWorking: isWorking ? queue.enqueue : null,
    sendNow: queue.sendNow,
    remove: queue.remove,
    editQueuedMessage
  }
}
