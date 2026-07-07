// [FORK] The composer's submit path, extracted from NativeChatComposer so that
// file stays within the max-lines budget. Frames the draft (+ images) and writes
// it to the running agent, wrapping the turn with the plan-mode directive when
// active, then clears the composer and records history/telemetry.

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { emitNativeChatMessageSent } from '@/lib/native-chat-telemetry'
import { sendNativeChatWithAgentGuard } from './native-chat-agent-revival'
import {
  sendNativeChatMessage,
  sendNativeChatMessageWithImageAttachments,
  submitNativeChatPrompt
} from './native-chat-runtime-send'
import { isSlashCommandDraft, pushHistory, type HistoryState } from './native-chat-composer-state'
import {
  nativeChatComposerTargetIsRemote,
  type NativeChatResolvedTarget
} from './native-chat-composer-target'
import type { NativeChatComposerImageAttachment } from './NativeChatComposerField'

/** [FORK] The actual chat-turn delivery (non-slash): frame text (+ images),
 *  write to the pty, echo optimistically, record telemetry. Shared by the
 *  direct submit path and the send-queue flush/force-send paths. */
export function useNativeChatDeliverMessage(params: {
  agent: string
  resolveTarget: () => NativeChatResolvedTarget | null
  wrapOutgoing: (text: string, isSlashCommand: boolean) => string
  onOptimisticSend?: (text: string, imagePaths?: string[]) => void
}): (text: string, imagePaths: readonly string[]) => void {
  const { agent, resolveTarget, wrapOutgoing, onOptimisticSend } = params
  return useCallback(
    (text: string, imagePaths: readonly string[]) => {
      const target = resolveTarget()
      if (!target) {
        return
      }
      // In plan mode, wrap the chat turn with the research-only directive so the
      // agent produces a plan instead of editing; the optimistic echo below still
      // shows the raw text. Wrapping happens at delivery time so a queued turn
      // respects the plan-mode state in effect when it actually goes out.
      const outgoingText = wrapOutgoing(text, false)
      // The liveness guard keeps a message from executing in the bare shell
      // when the agent died (e.g. across host sleep): dead panes get their
      // agent resumed in place before the pty write goes out.
      sendNativeChatWithAgentGuard({
        target,
        agent,
        perform: () => {
          if (imagePaths.length > 0) {
            sendNativeChatMessageWithImageAttachments(target.settings, target.ptyId, outgoingText, [
              ...imagePaths
            ])
          } else if (text.trim().length > 0) {
            sendNativeChatMessage(target.settings, target.ptyId, outgoingText)
          } else {
            submitNativeChatPrompt(target.settings, target.ptyId)
          }
        }
      })
      onOptimisticSend?.(text, [...imagePaths])
      // U10 telemetry — adoption + local-vs-remote runtime split.
      emitNativeChatMessageSent({
        agent,
        runtime: nativeChatComposerTargetIsRemote(target.ptyId) ? 'remote' : 'local'
      })
    },
    [agent, resolveTarget, wrapOutgoing, onOptimisticSend]
  )
}

export function useNativeChatComposerSend(params: {
  agent: string
  draft: string
  imageAttachments: readonly NativeChatComposerImageAttachment[]
  disabled: boolean
  resolveTarget: () => NativeChatResolvedTarget | null
  wrapOutgoing: (text: string, isSlashCommand: boolean) => string
  onOptimisticSend?: (text: string, imagePaths?: string[]) => void
  onSlashCommand?: (command: string) => void
  /** [FORK] When set (agent mid-turn), chat turns are queued instead of sent;
   *  slash commands still go straight to the TUI. */
  enqueue?: ((text: string, imagePaths: readonly string[]) => void) | null
  setDraft: (next: string | ((previous: string) => string)) => void
  setCaret: (caret: number) => void
  setHistory: Dispatch<SetStateAction<HistoryState>>
  clearImageAttachments: () => void
  setNotice: (notice: string | null) => void
}): () => void {
  const {
    agent,
    draft,
    imageAttachments,
    disabled,
    resolveTarget,
    wrapOutgoing,
    onOptimisticSend,
    onSlashCommand,
    enqueue,
    setDraft,
    setCaret,
    setHistory,
    clearImageAttachments,
    setNotice
  } = params

  const deliver = useNativeChatDeliverMessage({
    agent,
    resolveTarget,
    wrapOutgoing,
    onOptimisticSend
  })

  return useCallback(() => {
    const text = draft
    const imagePaths = imageAttachments.map((attachment) => attachment.path)
    if ((text.trim() === '' && imagePaths.length === 0) || disabled) {
      return
    }
    const target = resolveTarget()
    if (!target) {
      return
    }
    // Slash commands are TUI controls, not chat turns — never attach images to
    // one, never queue one. Otherwise images are deferred to submit (like text)
    // so the GUI chips and TUI input stay in sync: images, text, Enter atomically.
    const isSlashCommand = isSlashCommandDraft(text)
    if (isSlashCommand) {
      // Guarded like chat turns: a slash command typed at a dead agent would
      // otherwise run in the bare shell (e.g. `/clear` → command not found).
      sendNativeChatWithAgentGuard({
        target,
        agent,
        perform: () => sendNativeChatMessage(target.settings, target.ptyId, text)
      })
      // Slash commands don't echo a user bubble, but DO surface a small "Ran
      // /clear" system line so the command leaves a visible trace.
      onSlashCommand?.(text.trim())
      emitNativeChatMessageSent({
        agent,
        runtime: nativeChatComposerTargetIsRemote(target.ptyId) ? 'remote' : 'local'
      })
    } else if (enqueue) {
      enqueue(text, imagePaths)
    } else {
      deliver(text, imagePaths)
    }
    setHistory((prev) => pushHistory(prev, text))
    setDraft('')
    setCaret(0)
    clearImageAttachments()
    setNotice(null)
  }, [
    agent,
    clearImageAttachments,
    deliver,
    draft,
    imageAttachments,
    disabled,
    enqueue,
    resolveTarget,
    onSlashCommand,
    setDraft,
    setCaret,
    setHistory,
    setNotice
  ])
}
