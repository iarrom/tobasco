// [FORK] Wiring for the universal `/` menu: assembles the flat item list
// (skills for the pane's agent, the agent's slash commands, composer modes) and
// owns what "choosing" each item kind means — including the command insert /
// dispatch paths that used to live inline in NativeChatComposer.

import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { AgentType } from '../../../../shared/agent-status-types'
import { translate } from '@/i18n/i18n'
import { emitNativeChatMessageSent } from '@/lib/native-chat-telemetry'
import { sendNativeChatMessage } from './native-chat-runtime-send'
import {
  applySlashSkillSuggestion,
  applySlashSuggestion,
  buildUniversalSlashItems,
  pushHistory,
  slashCommandDispatchText,
  stripLeadingSlashToken,
  type ComposerAutocomplete,
  type HistoryState,
  type NativeChatComposerMode,
  type SlashCommandSuggestion,
  type UniversalSlashItem
} from './native-chat-composer-state'
import {
  nativeChatComposerTargetIsRemote,
  type NativeChatResolvedTarget
} from './native-chat-composer-target'
import { useNativeChatAddMenuSkills } from './use-native-chat-add-menu-skills'

export type UniversalSlashChooseIntent = 'submit' | 'insert'

export function useNativeChatUniversalSlash(params: {
  agent: AgentType
  terminalTabId: string
  autocomplete: ComposerAutocomplete
  draft: string
  caret: number
  agentCommands: readonly SlashCommandSuggestion[]
  disabled: boolean
  supportsPlanMode: boolean
  planMode: boolean
  togglePlanMode: () => void
  resolveTarget: () => NativeChatResolvedTarget | null
  onSlashCommand?: (command: string) => void
  setDraft: (next: string | ((previous: string) => string)) => void
  setCaret: (caret: number) => void
  setActiveSuggestion: (index: number) => void
  setHistory: Dispatch<SetStateAction<HistoryState>>
  setNotice: (notice: string | null) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
}): {
  slashItems: UniversalSlashItem[]
  chooseSlashItem: (item: UniversalSlashItem, intent: UniversalSlashChooseIntent) => void
} {
  const {
    agent,
    terminalTabId,
    autocomplete,
    draft,
    caret,
    agentCommands,
    disabled,
    supportsPlanMode,
    planMode,
    togglePlanMode,
    resolveTarget,
    onSlashCommand,
    setDraft,
    setCaret,
    setActiveSuggestion,
    setHistory,
    setNotice,
    textareaRef
  } = params

  // Discovery is deferred until the user actually types `/` (same probe used by
  // the "+" menu, so Claude panes see their skills too).
  const skills = useNativeChatAddMenuSkills(agent, terminalTabId, draft.startsWith('/'))

  const modes = useMemo<NativeChatComposerMode[]>(
    () =>
      supportsPlanMode
        ? [
            {
              id: 'plan',
              label: translate('components.native-chat.slash.planMode', 'Plan'),
              description: translate(
                'components.native-chat.slash.planModeDescription',
                'Research and write a plan before coding'
              ),
              active: planMode
            }
          ]
        : [],
    [supportsPlanMode, planMode]
  )

  const slashItems = useMemo<UniversalSlashItem[]>(
    () =>
      autocomplete.mode === 'slash'
        ? buildUniversalSlashItems({
            query: autocomplete.query,
            commands: agentCommands,
            skills,
            modes
          })
        : [],
    [autocomplete, agentCommands, skills, modes]
  )

  // Insert the command into the draft (Tab / previously the menu click path).
  const chooseSlash = useCallback(
    (command: SlashCommandSuggestion): void => {
      const next = applySlashSuggestion(command)
      setDraft(next)
      setCaret(next.length)
      setActiveSuggestion(0)
      textareaRef.current?.focus()
    },
    [setDraft, setCaret, setActiveSuggestion, textareaRef]
  )

  // Dispatch the command straight to the TUI (Enter / menu click).
  const dispatchSlash = useCallback(
    (command: SlashCommandSuggestion): void => {
      const next = slashCommandDispatchText(command)
      const target = resolveTarget()
      if (!target || disabled) {
        return
      }
      sendNativeChatMessage(target.settings, target.ptyId, next)
      // Surface the command as a system line (this is the autocomplete-menu
      // dispatch path; the typed-Enter path in `send` does the same).
      onSlashCommand?.(next.trim())
      emitNativeChatMessageSent({
        agent,
        runtime: nativeChatComposerTargetIsRemote(target.ptyId) ? 'remote' : 'local'
      })
      setHistory((prev) => pushHistory(prev, next))
      setDraft('')
      setCaret(0)
      setActiveSuggestion(0)
      setNotice(null)
    },
    [
      agent,
      disabled,
      resolveTarget,
      onSlashCommand,
      setDraft,
      setCaret,
      setActiveSuggestion,
      setHistory,
      setNotice
    ]
  )

  const chooseSlashItem = useCallback(
    (item: UniversalSlashItem, intent: UniversalSlashChooseIntent): void => {
      if (item.kind === 'command') {
        if (intent === 'submit') {
          dispatchSlash(item.command)
        } else {
          chooseSlash(item.command)
        }
        return
      }
      if (item.kind === 'skill') {
        const result = applySlashSkillSuggestion(draft, caret, item.skill.name)
        setDraft(result.draft)
        setCaret(result.caret)
        setActiveSuggestion(0)
        textareaRef.current?.focus()
        return
      }
      // Mode: toggle it and consume the `/query` token.
      togglePlanMode()
      const result = stripLeadingSlashToken(draft, caret)
      setDraft(result.draft)
      setCaret(result.caret)
      setActiveSuggestion(0)
      textareaRef.current?.focus()
    },
    [
      dispatchSlash,
      chooseSlash,
      draft,
      caret,
      togglePlanMode,
      setDraft,
      setCaret,
      setActiveSuggestion,
      textareaRef
    ]
  )

  return { slashItems, chooseSlashItem }
}
