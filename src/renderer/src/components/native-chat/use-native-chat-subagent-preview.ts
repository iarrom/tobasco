// [FORK] Reads a sub-agent's side transcript for the inline preview panel:
// windowed read through the existing nativeChat IPC (transcriptPath overrides
// the session lookup), re-polled while the panel is open and the sub-agent may
// still be running, folded with the same pipeline the main chat uses.

import { useEffect, useState } from 'react'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { stripNoiseMessages } from './native-chat-noise'
import { orderNativeChatMessages } from './native-chat-message-grouping'
import { foldToolMessages } from './native-chat-tool-fold'

const SUBAGENT_PREVIEW_LIMIT = 120
const SUBAGENT_PREVIEW_POLL_MS = 2000

export function useNativeChatSubagentPreview(params: {
  enabled: boolean
  /** Keep polling while true (sub-agent may still be appending). */
  live: boolean
  agent: AgentType
  transcriptPath: string | null
}): { messages: NativeChatMessage[]; loaded: boolean; error: string | null } {
  const { enabled, live, agent, transcriptPath } = params
  const [messages, setMessages] = useState<NativeChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !transcriptPath) {
      return
    }
    let cancelled = false
    let timer: number | null = null

    const readOnce = async (): Promise<void> => {
      try {
        const result = await window.api.nativeChat.readSession(
          agent,
          `subagent:${transcriptPath}`,
          SUBAGENT_PREVIEW_LIMIT,
          transcriptPath
        )
        if (cancelled) {
          return
        }
        if ('error' in result) {
          setError(result.error)
        } else {
          setError(null)
          setMessages(
            foldToolMessages(orderNativeChatMessages(stripNoiseMessages(result.messages)))
          )
        }
      } catch (readError) {
        if (!cancelled) {
          setError(readError instanceof Error ? readError.message : String(readError))
        }
      } finally {
        if (!cancelled) {
          setLoaded(true)
          if (live) {
            timer = window.setTimeout(() => void readOnce(), SUBAGENT_PREVIEW_POLL_MS)
          }
        }
      }
    }

    void readOnce()
    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [enabled, live, agent, transcriptPath])

  return { messages, loaded, error }
}
