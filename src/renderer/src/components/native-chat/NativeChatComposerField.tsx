import type { ClipboardEventHandler, KeyboardEventHandler, RefObject } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NATIVE_FILE_DROP_TARGET } from '../../../../shared/native-file-drop'
import type { ComposerAutocomplete, UniversalSlashItem } from './native-chat-composer-state'
import { NativeChatMentionHint, NativeChatSkillMenu } from './NativeChatAutocompleteMenus'
import { NativeChatUniversalSlashMenu } from './NativeChatUniversalSlashMenu'
import { NativeChatComposerActions } from './NativeChatComposerActions'
import { NativeChatAttachmentThumbnails } from './NativeChatAttachmentThumbnails'
import { nativeChatComposerPlaceholder } from './native-chat-composer-target'
import type { DiscoveredSkill } from '../../../../shared/skills'

export type NativeChatComposerFieldProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  draft: string
  disabled: boolean
  hasPty: boolean
  canSend: boolean
  autocomplete: ComposerAutocomplete
  activeSuggestion: number
  notice: string | null
  imageAttachments: readonly NativeChatComposerImageAttachment[]
  sendButtonDisabled: boolean
  isWorking: boolean
  attachDisabled: boolean
  dictationDisabled: boolean
  isDictating: boolean
  isDictationHoldMode: boolean
  /** [FORK] Cursor-style model picker rendered next to the "+" button. */
  modelPicker?: React.ReactNode
  /** [FORK] Cursor-style "+" menu replacing the bare attach button. */
  addMenu?: React.ReactNode
  /** [FORK] Amber "Plan" pill shown right of "+" while plan mode is on. */
  planPill?: React.ReactNode
  /** [FORK] Overrides the textarea placeholder (e.g. plan-mode prompt hint). */
  placeholder?: string
  onDraftChange: (value: string, element: HTMLTextAreaElement) => void
  onTextareaSelect: (element: HTMLTextAreaElement) => void
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>
  /** [FORK] Universal `/` menu items (skills / commands / modes). */
  slashItems: readonly UniversalSlashItem[]
  onChooseSlashItem: (item: UniversalSlashItem) => void
  onAcceptMention: () => void
  onChooseSkill: (skill: DiscoveredSkill) => void
  onRemoveImageAttachment: (id: string) => void
  onAttach: () => void
  onDictationToggle: () => void
  onDictationHoldStart: () => void
  onDictationHoldEnd: () => void
  onSend: () => void
  onStop?: () => void
}

export type NativeChatComposerImageAttachment = {
  id: string
  path: string
}

export function NativeChatComposerField({
  textareaRef,
  draft,
  disabled,
  hasPty,
  canSend,
  autocomplete,
  activeSuggestion,
  notice,
  imageAttachments,
  sendButtonDisabled,
  isWorking,
  attachDisabled,
  dictationDisabled,
  isDictating,
  isDictationHoldMode,
  modelPicker,
  addMenu,
  planPill,
  placeholder,
  onDraftChange,
  onTextareaSelect,
  onKeyDown,
  onPaste,
  slashItems,
  onChooseSlashItem,
  onAcceptMention,
  onChooseSkill,
  onRemoveImageAttachment,
  onAttach,
  onDictationToggle,
  onDictationHoldStart,
  onDictationHoldEnd,
  onSend,
  onStop
}: NativeChatComposerFieldProps): React.JSX.Element {
  return (
    <div className="shrink-0 bg-background">
      <div className="px-3 py-2 sm:px-4">
        {/* [FORK] Уже композер (max-w-xl вместо 3xl) — компактнее, как в Cursor. */}
        <div className="relative mx-auto w-full max-w-xl">
          {autocomplete.mode === 'slash' && slashItems.length > 0 ? (
            <NativeChatUniversalSlashMenu
              items={slashItems}
              activeIndex={activeSuggestion}
              onChoose={onChooseSlashItem}
            />
          ) : null}
          {autocomplete.mode === 'mention' ? (
            <NativeChatMentionHint query={autocomplete.query} onAccept={onAcceptMention} />
          ) : null}
          {autocomplete.mode === 'skill' ? (
            <NativeChatSkillMenu
              suggestions={autocomplete.suggestions}
              activeIndex={activeSuggestion}
              onChoose={onChooseSkill}
            />
          ) : null}
          {notice ? (
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageOff className="size-3.5 shrink-0" />
              <span>{notice}</span>
            </div>
          ) : null}
          <div
            data-native-file-drop-target={NATIVE_FILE_DROP_TARGET.composer}
            className={cn(
              'rounded-xl border border-input bg-card p-1.5 shadow-xs transition-colors',
              // [FORK] Убрали focus-ring/border на композере чата — лишняя подсветка отвлекает.
              'dark:bg-input/30'
            )}
          >
            <NativeChatAttachmentThumbnails
              attachments={imageAttachments}
              onRemove={onRemoveImageAttachment}
            />
            <textarea
              ref={textareaRef}
              value={draft}
              disabled={disabled}
              rows={2}
              onChange={(e) => onDraftChange(e.target.value, e.currentTarget)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onSelect={(e) => onTextareaSelect(e.currentTarget)}
              placeholder={placeholder ?? nativeChatComposerPlaceholder(hasPty, canSend)}
              // Why: coarse-pointer min-height follows the app's touch target convention.
              // scrollbar-sleek keeps the overflow gutter from showing the heavy
              // native scrollbar once the draft exceeds max-height.
              // field-sizing-content grows the textarea with the draft between
              // min-h/max-h (auto-resize without JS), then scrolls past max-h.
              className={cn(
                'scrollbar-sleek field-sizing-content min-h-12 max-h-64 w-full resize-none bg-transparent px-2 py-1 text-[13px] outline-none pointer-coarse:min-h-14',
                'placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50'
              )}
            />
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <NativeChatComposerActions
                attachDisabled={attachDisabled}
                dictationDisabled={dictationDisabled}
                sendDisabled={sendButtonDisabled}
                isWorking={isWorking}
                isDictating={isDictating}
                isDictationHoldMode={isDictationHoldMode}
                modelPicker={modelPicker}
                addMenu={addMenu}
                planPill={planPill}
                onAttach={onAttach}
                onDictationToggle={onDictationToggle}
                onDictationHoldStart={onDictationHoldStart}
                onDictationHoldEnd={onDictationHoldEnd}
                onSend={onSend}
                onStop={onStop}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
