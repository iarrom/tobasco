// [FORK] Builds the exact one-line Claude Code slash commands the model picker
// types into the running TUI. Verified against Claude Code docs: `/model
// <alias>`, the `[1m]` context suffix, `/effort <level>`, `/config
// thinking=<bool>`, and `/fast <on|off>` all apply immediately mid-session.
// Pure string builders so the send path stays IO-free and testable.

import type {
  NativeChatContextWindow,
  NativeChatEffortLevel
} from '../../../../shared/native-chat-model-catalog'

/** `/model opus` or, for the 1M window, `/model opus[1m]`. Context is part of the
 *  model alias in Claude Code, so a window change re-sends the `/model` command. */
export function buildNativeChatModelCommand(
  alias: string,
  context: NativeChatContextWindow
): string {
  return `/model ${alias}${context === '1m' ? '[1m]' : ''}`
}

export function buildNativeChatEffortCommand(level: NativeChatEffortLevel): string {
  return `/effort ${level}`
}

export function buildNativeChatThinkingCommand(enabled: boolean): string {
  return `/config thinking=${enabled ? 'true' : 'false'}`
}

export function buildNativeChatFastCommand(enabled: boolean): string {
  return `/fast ${enabled ? 'on' : 'off'}`
}
