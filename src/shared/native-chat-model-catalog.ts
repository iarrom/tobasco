// [FORK] Catalog for the Cursor-style native-chat model picker. Orca drives the
// Claude Code TUI over a PTY, so this describes the choices the picker offers and
// maps them to the exact one-line slash commands Claude Code accepts mid-session
// (`/model`, `/effort`, `/config thinking=`, `/fast`). Lives in shared (like
// `commit-message-agent-spec.ts`) so its brand/token labels are the single source
// of truth for both the picker UI and the compact trigger label.

/** Reasoning-effort levels Claude Code accepts via `/effort <level>`. Mirrors the
 *  Cursor effort menu (Low → Max) shown in the reference UI. */
export type NativeChatEffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Context-window choice. `1m` maps to Claude Code's `[1m]` model-alias suffix. */
export type NativeChatContextWindow = '200k' | '1m'

/** A model row in the picker. `alias` is the argument passed to `/model`. */
export type NativeChatModelOption = {
  alias: string
  label: string
}

export type NativeChatEffortOption = {
  id: NativeChatEffortLevel
  label: string
}

export type NativeChatContextOption = {
  id: NativeChatContextWindow
  label: string
}

// Why: Claude Code resolves aliases (opus/sonnet/haiku) to the account's
// supported model IDs, so hardcoded version IDs can be rejected by
// Bedrock/Vertex. Labels track the current model names for the picker only.
export const NATIVE_CHAT_CLAUDE_MODELS: readonly NativeChatModelOption[] = [
  { alias: 'fable', label: 'Fable 5' },
  { alias: 'opus', label: 'Opus 4.8' },
  { alias: 'sonnet', label: 'Sonnet 4.6' },
  { alias: 'haiku', label: 'Haiku 4.5' }
]

export const NATIVE_CHAT_EFFORT_OPTIONS: readonly NativeChatEffortOption[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra High' },
  { id: 'max', label: 'Max' }
]

export const NATIVE_CHAT_CONTEXT_OPTIONS: readonly NativeChatContextOption[] = [
  { id: '200k', label: '200K' },
  { id: '1m', label: '1M' }
]

export function nativeChatModelLabel(alias: string): string {
  return NATIVE_CHAT_CLAUDE_MODELS.find((model) => model.alias === alias)?.label ?? alias
}

export function nativeChatEffortLabel(level: NativeChatEffortLevel): string {
  return NATIVE_CHAT_EFFORT_OPTIONS.find((option) => option.id === level)?.label ?? level
}

export function nativeChatContextLabel(context: NativeChatContextWindow): string {
  return NATIVE_CHAT_CONTEXT_OPTIONS.find((option) => option.id === context)?.label ?? context
}
