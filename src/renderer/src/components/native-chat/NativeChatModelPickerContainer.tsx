// [FORK] Wires the Cursor-style model picker to the running agent: owns the
// persisted selection and turns each change into one Claude Code slash command
// typed into the TUI. Kept out of NativeChatComposer so that file stays within
// the max-lines budget and the picker's send logic lives next to the picker.

import { useCallback } from 'react'
import type { AgentType } from '../../../../shared/agent-status-types'
import { sendNativeChatMessage } from './native-chat-runtime-send'
import type { NativeChatResolvedTarget } from './native-chat-composer-target'
import type { NativeChatModelSelectionState } from './use-native-chat-model-selection'
import { NativeChatModelPicker } from './NativeChatModelPicker'
import {
  buildNativeChatEffortCommand,
  buildNativeChatFastCommand,
  buildNativeChatModelCommand,
  buildNativeChatThinkingCommand
} from './native-chat-model-command'

export type NativeChatModelPickerContainerProps = {
  agent: AgentType
  disabled: boolean
  resolveTarget: () => NativeChatResolvedTarget | null
  /** Selection state is owned by the composer so the plan-mode toggle, the
   *  send-wrapper, and this picker all read one source of truth. */
  selection: NativeChatModelSelectionState['selection']
  update: NativeChatModelSelectionState['update']
}

export function NativeChatModelPickerContainer({
  agent,
  disabled,
  resolveTarget,
  selection,
  update
}: NativeChatModelPickerContainerProps): React.JSX.Element | null {
  const send = useCallback(
    (command: string) => {
      const target = resolveTarget()
      if (!target || disabled) {
        return
      }
      sendNativeChatMessage(target.settings, target.ptyId, command)
    },
    [disabled, resolveTarget]
  )

  // Only Claude Code exposes the `/model` `/effort` `/config` `/fast` commands
  // this picker drives; other agents get no picker until they're wired.
  if (agent !== 'claude') {
    return null
  }

  return (
    <NativeChatModelPicker
      selection={selection}
      disabled={disabled}
      onSelectModel={(alias) => {
        update({ model: alias })
        send(buildNativeChatModelCommand(alias, selection.context))
      }}
      onSelectContext={(context) => {
        update({ context })
        send(buildNativeChatModelCommand(selection.model, context))
      }}
      onSelectEffort={(level) => {
        update({ effort: level })
        send(buildNativeChatEffortCommand(level))
      }}
      onToggleThinking={(enabled) => {
        update({ thinking: enabled })
        send(buildNativeChatThinkingCommand(enabled))
      }}
      onToggleFast={(enabled) => {
        update({ fast: enabled })
        send(buildNativeChatFastCommand(enabled))
      }}
    />
  )
}
