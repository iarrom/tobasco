// [FORK] Composer-side plan-mode glue: derives the toggle handler (surfaced
// inside the "+" menu), the amber "Plan" pill shown next to the "+" button while
// active (clicking it turns plan mode off), the plan-mode placeholder, and the
// outgoing-prompt wrapper — all from the per-tab plan-mode state. Kept out of
// NativeChatComposer so that file stays within the max-lines budget.

import { ListChecks } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { NativeChatPlanModeState } from './use-native-chat-plan-mode'
import { wrapNativeChatPlanPrompt } from './native-chat-plan-instruction'

export type NativeChatPlanComposer = {
  /** Whether this agent supports plan mode (Claude-only) — gates the menu row. */
  supportsPlanMode: boolean
  planMode: boolean
  togglePlanMode: () => void
  /** Amber "Plan" pill next to the "+" button while active; click turns it off. */
  planPill: React.ReactNode
  placeholder: string | undefined
  /** Wrap a chat turn with the plan directive; slash commands pass through. */
  wrapOutgoing: (text: string, isSlashCommand: boolean) => string
}

export function useNativeChatPlanComposer(params: {
  agent: string
  planModeState: NativeChatPlanModeState
}): NativeChatPlanComposer {
  const { agent, planModeState } = params
  const supportsPlanMode = agent === 'claude'
  const planMode = supportsPlanMode && planModeState.planMode
  const togglePlanMode = (): void => {
    planModeState.setPlanMode(!planModeState.planMode)
  }
  return {
    supportsPlanMode,
    planMode,
    togglePlanMode,
    planPill: planMode ? (
      <button
        type="button"
        onClick={togglePlanMode}
        aria-label={translate('components.native-chat.composer.planMode.disable', 'Turn off Plan')}
        className="flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-warning outline-none transition-colors hover:bg-warning/10 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
      >
        <ListChecks className="size-3.5" />
        <span>{translate('components.native-chat.composer.planMode.active', 'Plan')}</span>
      </button>
    ) : null,
    placeholder: planMode
      ? translate(
          'components.native-chat.composer.planPlaceholder',
          'Plan and design before building…'
        )
      : undefined,
    wrapOutgoing: (text, isSlashCommand) =>
      planMode && !isSlashCommand ? wrapNativeChatPlanPrompt(text) : text
  }
}
