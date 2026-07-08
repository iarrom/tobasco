// [FORK] Доставка отредактированного пузыря (click-to-edit): тот же путь, что
// у композера — guard оживления агента, запись в pty, оптимистичное эхо.
import { useCallback } from 'react'
import { useNativeChatDeliverMessage } from './use-native-chat-composer-send'
import { getSettingsForAgentTabRuntimeOwner } from '@/lib/agent-paste-draft'
import type { NativeChatResolvedTarget } from './native-chat-composer-target'

export function useNativeChatEditedMessageSend(args: {
  terminalTabId: string
  targetPtyId: string | null
  agent: string
  onOptimisticSend: (text: string, imagePaths?: string[]) => void
}): (text: string) => void {
  const { terminalTabId, targetPtyId, agent, onOptimisticSend } = args
  const resolveTarget = useCallback((): NativeChatResolvedTarget | null => {
    if (!targetPtyId) {
      return null
    }
    return { ptyId: targetPtyId, settings: getSettingsForAgentTabRuntimeOwner(terminalTabId) }
  }, [targetPtyId, terminalTabId])
  const wrapOutgoing = useCallback((text: string) => text, [])
  const deliver = useNativeChatDeliverMessage({
    agent,
    resolveTarget,
    wrapOutgoing,
    onOptimisticSend
  })
  return useCallback((text: string) => deliver(text, []), [deliver])
}
