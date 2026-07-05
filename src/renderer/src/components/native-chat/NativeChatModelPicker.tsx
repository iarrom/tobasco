// [FORK] Cursor-style model picker rendered in the composer footer next to the
// "+" button. Two columns in one popover: models on the left, an Options panel
// (Thinking / Fast / Context / Effort) on the right — mirroring Cursor's layout.
// Each interaction fires exactly one Claude Code slash command via the callbacks
// so the running agent switches immediately; the picker persists display state.

import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  NATIVE_CHAT_CLAUDE_MODELS,
  NATIVE_CHAT_CONTEXT_OPTIONS,
  NATIVE_CHAT_EFFORT_OPTIONS,
  type NativeChatContextWindow,
  type NativeChatEffortLevel
} from '../../../../shared/native-chat-model-catalog'
import {
  describeNativeChatModelSelection,
  type NativeChatModelSelection
} from './native-chat-model-selection'

export type NativeChatModelPickerProps = {
  selection: NativeChatModelSelection
  disabled: boolean
  onSelectModel: (alias: string) => void
  onSelectEffort: (level: NativeChatEffortLevel) => void
  onSelectContext: (context: NativeChatContextWindow) => void
  onToggleThinking: (enabled: boolean) => void
  onToggleFast: (enabled: boolean) => void
}

function SectionHeader({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground">
      {children}
    </div>
  )
}

function ChoiceRow({
  label,
  selected,
  onSelect
}: {
  label: string
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
    >
      <span className="truncate">{label}</span>
      {selected ? <Check className="size-4 shrink-0 text-foreground" /> : null}
    </button>
  )
}

function ToggleRow({
  label,
  checked,
  onToggle
}: {
  label: string
  checked: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
    >
      <span className="truncate">{label}</span>
      <span
        className={cn(
          'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-foreground' : 'bg-muted-foreground/30'
        )}
      >
        <span
          className={cn(
            'pointer-events-none block size-3 rounded-full bg-background shadow-sm transition-transform',
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          )}
        />
      </span>
    </button>
  )
}

export function NativeChatModelPicker({
  selection,
  disabled,
  onSelectModel,
  onSelectEffort,
  onSelectContext,
  onToggleThinking,
  onToggleFast
}: NativeChatModelPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-7 gap-1 rounded-full px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
        >
          <span className="truncate">{describeNativeChatModelSelection(selection)}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" sideOffset={6} className="w-[19rem] p-0">
        <div className="flex divide-x divide-border/60">
          <div className="flex w-1/2 flex-col p-1">
            <SectionHeader>
              {translate('components.native-chat.composer.model.modelsHeader', 'Models')}
            </SectionHeader>
            {NATIVE_CHAT_CLAUDE_MODELS.map((model) => (
              <ChoiceRow
                key={model.alias}
                label={model.label}
                selected={selection.model === model.alias}
                onSelect={() => onSelectModel(model.alias)}
              />
            ))}
          </div>
          <div className="flex w-1/2 flex-col p-1">
            <SectionHeader>
              {translate('components.native-chat.composer.model.optionsHeader', 'Options')}
            </SectionHeader>
            <ToggleRow
              label={translate('components.native-chat.composer.model.thinking', 'Thinking')}
              checked={selection.thinking}
              onToggle={() => onToggleThinking(!selection.thinking)}
            />
            <ToggleRow
              label={translate('components.native-chat.composer.model.fast', 'Fast')}
              checked={selection.fast}
              onToggle={() => onToggleFast(!selection.fast)}
            />
            <SectionHeader>
              {translate('components.native-chat.composer.model.contextHeader', 'Context')}
            </SectionHeader>
            {NATIVE_CHAT_CONTEXT_OPTIONS.map((option) => (
              <ChoiceRow
                key={option.id}
                label={option.label}
                selected={selection.context === option.id}
                onSelect={() => onSelectContext(option.id)}
              />
            ))}
            <SectionHeader>
              {translate('components.native-chat.composer.model.effortHeader', 'Effort')}
            </SectionHeader>
            {NATIVE_CHAT_EFFORT_OPTIONS.map((option) => (
              <ChoiceRow
                key={option.id}
                label={option.label}
                selected={selection.effort === option.id}
                onSelect={() => onSelectEffort(option.id)}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
