import { translate } from '@/i18n/i18n'
import { isRemoteRuntimePtyId } from '@/runtime/runtime-terminal-inspection'
import type { getSettingsForAgentTabRuntimeOwner } from '@/lib/agent-paste-draft'
import type { AppState } from '@/store/types'
import { getConnectionIdFromState } from '@/lib/connection-context'
import { resolveNativeChatFileLinkContext } from './native-chat-file-link'
import type { NativeChatImagePasteTarget } from './use-native-chat-composer-paste'

export type NativeChatResolvedTarget = {
  ptyId: string
  settings: ReturnType<typeof getSettingsForAgentTabRuntimeOwner>
}

/** Upper bound for clipboard text pulled into the composer via Cmd/Ctrl+V, so a
 *  pathological clipboard can't stall the round-trip. */
export const NATIVE_CHAT_CONTEXT_PASTE_MAX_BYTES = 16 * 1024 * 1024

export function nativeChatComposerPlaceholder(hasPty: boolean, canSend: boolean): string {
  if (!hasPty) {
    return translate(
      'components.native-chat.composer.noPty',
      'No live terminal — toggle back to reconnect.'
    )
  }
  if (!canSend) {
    return translate('components.native-chat.composer.locked', 'Input is held by another device.')
  }
  return translate('components.native-chat.composer.placeholder', 'Send a message…')
}

export function nativeChatComposerTargetIsRemote(ptyId: string | null): boolean {
  return ptyId !== null && isRemoteRuntimePtyId(ptyId)
}

/** Resolve the host a clipboard-pasted image must be written to. For an SSH pane
 *  the image has to land on the remote host (the agent reads it there), so this
 *  returns the worktree's connectionId — otherwise a local temp path would name a
 *  file the remote agent can't open and the paste would be lost. */
export function resolveNativeChatImagePasteTarget(
  state: AppState,
  terminalTabId: string
): NativeChatImagePasteTarget {
  const context = resolveNativeChatFileLinkContext(state, terminalTabId)
  return {
    connectionId: getConnectionIdFromState(state, context?.worktreeId ?? null) ?? null,
    runtimeEnvironmentId: context?.runtimeEnvironmentId ?? null
  }
}

export function formatNativeChatFileReference(filePath: string): string {
  const escaped = filePath.replace(/"/g, '\\"')
  return /\s/.test(filePath) ? `@"${escaped}"` : `@${filePath}`
}
