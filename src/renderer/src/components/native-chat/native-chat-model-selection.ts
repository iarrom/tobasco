// [FORK] Selection state for the native-chat model picker plus the pure helpers
// that normalize persisted values and derive the compact button label
// ("Opus 4.8  High"). No IO here so it stays unit-testable.

import {
  NATIVE_CHAT_CLAUDE_MODELS,
  NATIVE_CHAT_CONTEXT_OPTIONS,
  NATIVE_CHAT_EFFORT_OPTIONS,
  nativeChatContextLabel,
  nativeChatEffortLabel,
  nativeChatModelLabel,
  type NativeChatContextWindow,
  type NativeChatEffortLevel
} from '../../../../shared/native-chat-model-catalog'

// Plan mode is deliberately NOT part of this selection: it is scoped per tab
// (use-native-chat-plan-mode), while the model choice is a per-agent memory —
// keeping the toggle here made Plan in one project flip every chat's composer.
export type NativeChatModelSelection = {
  /** `/model` alias (opus/sonnet/haiku). */
  model: string
  effort: NativeChatEffortLevel
  context: NativeChatContextWindow
  thinking: boolean
  fast: boolean
}

// Why: matches the state shown in the reference UI (Opus, High, Thinking on,
// Fast off). Nothing is sent to the agent on mount — commands fire only on an
// explicit user change — so this is purely the picker's opening display.
export const DEFAULT_NATIVE_CHAT_MODEL_SELECTION: NativeChatModelSelection = {
  model: 'opus',
  effort: 'high',
  context: '200k',
  thinking: true,
  fast: false
}

function isEffortLevel(value: unknown): value is NativeChatEffortLevel {
  return NATIVE_CHAT_EFFORT_OPTIONS.some((option) => option.id === value)
}

function isContextWindow(value: unknown): value is NativeChatContextWindow {
  return NATIVE_CHAT_CONTEXT_OPTIONS.some((option) => option.id === value)
}

/** Coerce an untrusted (persisted/legacy) value into a valid selection, filling
 *  any missing or invalid field from the default so a stale localStorage blob
 *  can never crash the picker. */
export function normalizeNativeChatModelSelection(value: unknown): NativeChatModelSelection {
  const raw = (value ?? {}) as Partial<Record<keyof NativeChatModelSelection, unknown>>
  const model = NATIVE_CHAT_CLAUDE_MODELS.some((option) => option.alias === raw.model)
    ? (raw.model as string)
    : DEFAULT_NATIVE_CHAT_MODEL_SELECTION.model
  return {
    model,
    effort: isEffortLevel(raw.effort) ? raw.effort : DEFAULT_NATIVE_CHAT_MODEL_SELECTION.effort,
    context: isContextWindow(raw.context)
      ? raw.context
      : DEFAULT_NATIVE_CHAT_MODEL_SELECTION.context,
    thinking:
      typeof raw.thinking === 'boolean'
        ? raw.thinking
        : DEFAULT_NATIVE_CHAT_MODEL_SELECTION.thinking,
    fast: typeof raw.fast === 'boolean' ? raw.fast : DEFAULT_NATIVE_CHAT_MODEL_SELECTION.fast
  }
}

/** Compact trigger label, e.g. "Opus 4.8  High" or "Opus 4.8  High · 1M". */
export function describeNativeChatModelSelection(selection: NativeChatModelSelection): string {
  const base = `${nativeChatModelLabel(selection.model)}  ${nativeChatEffortLabel(selection.effort)}`
  return selection.context === '1m' ? `${base} · ${nativeChatContextLabel('1m')}` : base
}
