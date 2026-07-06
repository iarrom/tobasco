// [FORK] Extracted from NativeChatView to keep that file within the max-lines
// budget; logic mirrors upstream's inline launch-prompt session composition.

import { useMemo } from 'react'
import type { NativeChatLaunchPrompt } from '@/lib/native-chat-launch-prompt'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  applyCommandMarkerBoundaries,
  launchPromptAsMessage,
  type NativeChatCommandMarker
} from './native-chat-pending'

type SessionLike = { messages: NativeChatMessage[] }

/** Seeds the optimistic launch-prompt bubble into the transcript, applies slash
 *  command boundaries, and reports the launch prompt's failed-delivery id set. */
export function useNativeChatLaunchPromptSession<S extends SessionLike>(
  session: S,
  paneLaunchPrompt: NativeChatLaunchPrompt | null,
  commandMarkers: NativeChatCommandMarker[]
): {
  sessionAfterCommandBoundaries: S
  failedLaunchPromptMessageIds: ReadonlySet<string> | undefined
} {
  const launchPromptMessage = useMemo(
    () => launchPromptAsMessage(paneLaunchPrompt, session.messages),
    [paneLaunchPrompt, session.messages]
  )
  const sessionWithLaunchPrompt = useMemo<S>(() => {
    if (!launchPromptMessage) {
      return session
    }
    return { ...session, messages: [...session.messages, launchPromptMessage] }
  }, [launchPromptMessage, session])

  const sessionAfterCommandBoundaries = useMemo<S>(() => {
    const messages = applyCommandMarkerBoundaries(sessionWithLaunchPrompt.messages, commandMarkers)
    return messages === sessionWithLaunchPrompt.messages
      ? sessionWithLaunchPrompt
      : { ...sessionWithLaunchPrompt, messages }
  }, [sessionWithLaunchPrompt, commandMarkers])

  const launchPromptVisible =
    launchPromptMessage !== null &&
    sessionAfterCommandBoundaries.messages.some((message) => message.id === launchPromptMessage.id)
  const failedLaunchPromptMessageIds = useMemo(() => {
    if (!paneLaunchPrompt?.failed || !launchPromptVisible || !launchPromptMessage) {
      return undefined
    }
    return new Set([launchPromptMessage.id])
  }, [paneLaunchPrompt?.failed, launchPromptMessage, launchPromptVisible])

  return { sessionAfterCommandBoundaries, failedLaunchPromptMessageIds }
}
