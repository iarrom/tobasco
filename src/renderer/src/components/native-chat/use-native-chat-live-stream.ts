// [FORK] The chat's live in-flight signal, per agent. Claude gets its preview
// scraped from the agent TUI's viewport (transcript records only land when a
// whole content block completes; the hook's lastAssistantMessage carries tool
// output, not prose). Other agents keep the hook-preview path.
import { useMemo, useRef } from 'react'
import type { AgentType, NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  deriveNativeChatStreamingText,
  recentAssistantProseText
} from '../../../../shared/native-chat-streaming'
import { deriveTuiStreamingProse } from './claude-tui-live-preview'
import { useClaudeTuiLivePreview } from './use-claude-tui-live-preview'

export type NativeChatLiveStream = {
  /** Text for the synthetic streaming bubble, or null to show none. */
  streamingText: string | null
  /** TUI spinner status for the typing indicator («Hardening…» over the static
   *  «Thinking…») plus the model-is-reasoning flag. Claude panes only. */
  liveStatus: { label: string; thinking: boolean } | null
  /** The viewport's current ⏺ action head (e.g. "Write(/repo/Plans/x.md)") —
   *  visible before the transcript records the call. Claude panes only. */
  liveAction: string | null
}

export function useNativeChatLiveStream(args: {
  agent: AgentType
  targetPtyId: string | null
  hookWorking: boolean
  hookPreview: string | null | undefined
  messages: readonly NativeChatMessage[]
}): NativeChatLiveStream {
  const { agent, targetPtyId, hookWorking, hookPreview, messages } = args
  const tuiPreview = useClaudeTuiLivePreview({
    ptyId: targetPtyId,
    enabled: hookWorking && agent === 'claude'
  })

  // Sticky prose: TUI frames alternate between showing the streamed paragraph
  // and showing follow-up tool activity, so a frame without prose must NOT
  // blank the bubble — hold the last streamed prose until the transcript
  // supersedes it (the per-paragraph committed filter below returns null) or
  // the turn ends. Keyed by pane so a pane switch never leaks prose across.
  const heldProseRef = useRef<{ ptyId: string | null; prose: string } | null>(null)
  if (!hookWorking || heldProseRef.current?.ptyId !== targetPtyId) {
    heldProseRef.current = null
  }
  if (tuiPreview?.prose) {
    heldProseRef.current = { ptyId: targetPtyId, prose: tuiPreview.prose }
  }
  const candidateProse = tuiPreview?.prose ?? heldProseRef.current?.prose ?? null

  const streamingText = useMemo(() => {
    if (agent === 'claude') {
      return hookWorking
        ? deriveTuiStreamingProse({
            prose: candidateProse,
            recentAssistantProse: recentAssistantProseText(messages)
          })
        : null
    }
    return deriveNativeChatStreamingText({
      messages,
      previewText: hookPreview,
      working: hookWorking,
      agent
    })
  }, [messages, hookPreview, hookWorking, agent, candidateProse])

  const liveStatus =
    agent === 'claude' && hookWorking && tuiPreview?.status
      ? { label: tuiPreview.status, thinking: tuiPreview.thinking }
      : null

  return {
    streamingText,
    liveStatus,
    liveAction: hookWorking ? (tuiPreview?.action ?? null) : null
  }
}
