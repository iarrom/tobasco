import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import CommentMarkdown, {
  type CommentMarkdownLinkClickHandler
} from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  isTextBlock,
  type NativeChatBlock,
  type NativeChatMessage
} from '../../../../shared/native-chat-types'
import { splitNativeChatBlocks } from './native-chat-tool-fold'
import { NativeChatMessageImageAttachments } from './NativeChatMessageImageAttachments'
import { NativeChatToolStep } from './NativeChatToolStep'
import { NativeChatThoughtStep } from './NativeChatThoughtStep'
import { pairToolBlocks } from './native-chat-tool-pairing'
import { NativeChatCopyButton } from './NativeChatCopyButton'
import { segmentNativeChatPromptTokens } from './native-chat-prompt-tokens'
import { NativeChatPromptText } from './NativeChatPromptText'
// [FORK] Инлайн-редактор пользовательского сообщения (Cursor-стиль).
import { NativeChatUserMessageEditor } from './NativeChatUserMessageEditor'

function proseToMarkdown(blocks: NativeChatBlock[]): string {
  return blocks
    .map((block) => {
      if (isTextBlock(block)) {
        return block.text
      }
      return ''
    })
    .filter((part) => part.length > 0)
    .join('\n\n')
}

// Cursor-style "5h ago" under the answer; static per render — the transcript
// re-renders often enough that the label stays fresh.
function formatAnsweredAgo(timestamp: number, now: number): string | null {
  const delta = now - timestamp
  if (delta < 0) {
    return null
  }
  if (delta < 60_000) {
    return 'just now'
  }
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  return `${Math.floor(hours / 24)}d ago`
}

/** Inline controls for an agent message (mobile AgentControls parity): copy the
 *  message's prose, and scroll so this message's top aligns to the viewport top.
 *  Rendered in flow under the message (Cursor-style), always visible, with the
 *  answer's age at the left. */
function AgentControls({
  markdown,
  timestamp,
  onScrollToTop,
  className
}: {
  markdown: string
  timestamp: number | null
  onScrollToTop: () => void
  className?: string
}): React.JSX.Element {
  const agoLabel = timestamp !== null ? formatAnsweredAgo(timestamp, Date.now()) : null
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {agoLabel ? (
        <span className="mr-0.5 text-[11px] text-muted-foreground/60">{agoLabel}</span>
      ) : null}
      <NativeChatCopyButton text={markdown} />
      <button
        type="button"
        onClick={onScrollToTop}
        aria-label={translate(
          'components.native-chat.scrollMessageToTop',
          'Scroll this message to top'
        )}
        title={translate('components.native-chat.scrollMessageToTop', 'Scroll this message to top')}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-input/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowUp className="size-3.5" />
      </button>
    </div>
  )
}

/** One message: prose first, then the turn's tool activity as Cursor-style
 *  per-action step lines. Monochrome per STYLEGUIDE: user prompts read as a
 *  lifted card, assistant prose as body copy, reasoning as a compact "Thought"
 *  step. The active step's label shimmers while the agent works. */
export function MessageRow({
  message,
  isActiveStep,
  thoughtDurationLabel,
  sticky = false,
  onScrollMessageToTop,
  onLinkClick,
  allowFileUriLinks = false,
  deliveryFailed = false,
  onEditSend
}: {
  message: NativeChatMessage
  /** This row is the agent's currently-running step (shimmer its label). */
  isActiveStep: boolean
  /** Trailing muted descriptor for a finished "Thought" step. */
  thoughtDurationLabel: string
  /** Pin this user prompt to the top of the scroll viewport (last prompt only,
   *  so multiple sticky rows can't overlap). */
  sticky?: boolean
  /** Align this message's top to the top of the scroll viewport. */
  onScrollMessageToTop: (el: HTMLElement) => void
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
  deliveryFailed?: boolean
  /** [FORK] Отправка отредактированного текста агенту; включает click-to-edit. */
  onEditSend?: (text: string) => void
}): React.JSX.Element | null {
  const rowRef = useRef<HTMLDivElement | null>(null)
  // Collapse the pinned (sticky) user prompt to 2 lines; click toggles full text.
  const [userExpanded, setUserExpanded] = useState(false)
  // [FORK] Клик по пузырю открывает инлайн-редактор (Cursor-стиль).
  const [editing, setEditing] = useState(false)
  const { prose, tools } = useMemo(() => splitNativeChatBlocks(message.blocks), [message.blocks])
  const toolSteps = useMemo(() => pairToolBlocks(tools), [tools])
  // The active tool line is the last call still awaiting a result, else the last
  // step — only shimmered when this row is the active step.
  const activeToolIndex = useMemo(() => {
    if (toolSteps.length === 0) {
      return -1
    }
    for (let i = toolSteps.length - 1; i >= 0; i--) {
      if (toolSteps[i].call && !toolSteps[i].result) {
        return i
      }
    }
    return toolSteps.length - 1
  }, [toolSteps])
  const markdown = proseToMarkdown(prose)
  const hasImages = prose.some((block) => block.type === 'image-ref')
  const isUser = message.role === 'user'
  // [FORK] Sent prompts carrying slash-tool tokens (/command, $skill) render
  // through the token highlighter (amber, Cursor parity) instead of markdown.
  const promptTokenSegments = useMemo(
    () => (isUser && markdown ? segmentNativeChatPromptTokens(markdown) : null),
    [isUser, markdown]
  )
  const isReasoning = message.role === 'reasoning'
  const isSystem = message.role === 'system'

  const scrollToTop = useCallback(() => {
    if (rowRef.current) {
      onScrollMessageToTop(rowRef.current)
    }
  }, [onScrollMessageToTop])

  // Reasoning renders as a compact "Thought" step (Cursor parity), shimmering
  // while it's the agent's active step. Skip a finished empty thought entirely.
  if (isReasoning) {
    if (markdown.length === 0 && !isActiveStep) {
      return null
    }
    return (
      <NativeChatThoughtStep
        markdown={markdown}
        active={isActiveStep}
        durationLabel={thoughtDurationLabel}
        onLinkClick={onLinkClick}
        allowFileUriLinks={allowFileUriLinks}
      />
    )
  }

  // Skip rows with nothing renderable so the transcript shows no empty/ghost
  // bubble. After all hooks, so hook order stays unconditional.
  if (markdown.length === 0 && !hasImages && tools.length === 0) {
    return null
  }

  if (isUser) {
    // Why: an optimistic echo is rendered identically to a real user turn (no
    // muting, no "Queued" label) so that when the real transcript turn lands and
    // replaces it, there is no visible state change — the send just appears and
    // stays. (A distinct "queued" treatment flickered normal→queued→normal as the
    // transcript caught up.)
    if (editing && onEditSend) {
      return (
        <div
          ref={rowRef}
          data-user-message-id={message.id}
          className="flex flex-col items-end gap-0.5"
        >
          <NativeChatUserMessageEditor
            initialText={markdown}
            onSend={(text) => {
              setEditing(false)
              onEditSend(text)
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )
    }
    const canEdit = onEditSend !== undefined && markdown.length > 0
    return (
      // [FORK] Only the latest user prompt is pinned to the top of the scroll
      // viewport while its turn scrolls under it, so the agent's current working
      // context stays visible. Full-column bg occludes the content scrolling
      // beneath. Only the last prompt is sticky — sibling sticky rows would all
      // pin at top:0 and overlap instead of replacing one another.
      <div
        ref={rowRef}
        // [FORK] Адрес строки для снапа отправленного сообщения к верху вьюпорта.
        data-user-message-id={message.id}
        className={cn(
          'flex flex-col items-end gap-0.5',
          sticky && 'sticky top-0 z-10 bg-background pb-1'
        )}
      >
        <div
          className={cn(
            // [FORK] Та же поверхность, что у композера (NativeChatComposerField):
            // border-input + bg-card (dark: bg-input/30) — пузырь и инпут читаются
            // как один материал.
            'max-w-[85%] rounded-xl rounded-tr-sm border border-input bg-card px-3 py-2 text-sm text-card-foreground shadow-xs dark:bg-input/30',
            // [FORK] Клик открывает инлайн-редактор; у прижатого промпта клик
            // сперва раскрывает клип из 2 строк, второй клик — редактор.
            (sticky || canEdit) && 'cursor-pointer'
          )}
          {...(sticky || canEdit
            ? {
                role: 'button',
                tabIndex: 0,
                'aria-expanded': userExpanded,
                onClick: () => {
                  if (sticky && !userExpanded) {
                    setUserExpanded(true)
                    return
                  }
                  if (canEdit) {
                    setEditing(true)
                  }
                },
                onKeyDown: (event: React.KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    if (sticky && !userExpanded) {
                      setUserExpanded(true)
                    } else if (canEdit) {
                      setEditing(true)
                    }
                  }
                }
              }
            : {})}
        >
          {markdown ? (
            <>
              <NativeChatMessageImageAttachments blocks={prose} />
              <div className={cn(sticky && !userExpanded && 'line-clamp-2')}>
                {promptTokenSegments ? (
                  <NativeChatPromptText segments={promptTokenSegments} />
                ) : (
                  <CommentMarkdown
                    content={markdown}
                    variant="document"
                    className="text-sm"
                    onLinkClick={onLinkClick}
                    allowFileUriLinks={allowFileUriLinks}
                    // [FORK] Bare file paths in agent prose become in-app links
                    // only when this pane can resolve them (same gate as file:).
                    linkifyFilePaths={allowFileUriLinks}
                  />
                )}
              </div>
            </>
          ) : (
            <NativeChatMessageImageAttachments blocks={prose} />
          )}
        </div>
        {deliveryFailed ? (
          <div className="max-w-[85%] text-[11px] text-destructive/80">
            {translate(
              'components.native-chat.launchPromptNotDelivered',
              'Not delivered — check the terminal'
            )}
          </div>
        ) : null}
      </div>
    )
  }

  // Plain assistant prose is the copyable unit; reasoning/system asides stay
  // chrome-free. The controls reveal on hover (and on keyboard focus-within).
  const showControls = !isReasoning && !isSystem && markdown.length > 0

  return (
    <div
      ref={rowRef}
      className={cn(
        'group relative max-w-full text-sm leading-relaxed text-foreground',
        isSystem && 'text-xs text-muted-foreground'
      )}
    >
      <NativeChatMessageImageAttachments blocks={prose} />
      {markdown ? (
        <CommentMarkdown
          content={markdown}
          variant="document"
          className="text-sm"
          onLinkClick={onLinkClick}
          allowFileUriLinks={allowFileUriLinks}
        />
      ) : null}
      {toolSteps.length > 0 ? (
        <div className="mt-1 flex flex-col">
          {toolSteps.map((step, i) => (
            <NativeChatToolStep
              key={i}
              call={step.call}
              result={step.result}
              active={isActiveStep && i === activeToolIndex}
            />
          ))}
        </div>
      ) : null}
      {showControls ? (
        // [FORK] Cursor-style: controls sit in flow under the answer, right-
        // aligned and always visible, with the answer's age at their left.
        <AgentControls
          markdown={markdown}
          timestamp={message.timestamp}
          onScrollToTop={scrollToTop}
          className="mt-0.5 justify-end"
        />
      ) : null}
    </div>
  )
}
