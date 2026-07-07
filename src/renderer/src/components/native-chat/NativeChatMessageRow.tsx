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

/** Inline controls for an agent message (mobile AgentControls parity): copy the
 *  message's prose, and scroll so this message's top aligns to the viewport top.
 *  Reveals on hover / keyboard focus like the prior copy affordance. */
function AgentControls({
  markdown,
  onScrollToTop,
  className
}: {
  markdown: string
  onScrollToTop: () => void
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <NativeChatCopyButton text={markdown} />
      <button
        type="button"
        onClick={onScrollToTop}
        aria-label={translate(
          'components.native-chat.scrollMessageToTop',
          'Scroll this message to top'
        )}
        title={translate('components.native-chat.scrollMessageToTop', 'Scroll this message to top')}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  deliveryFailed = false
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
}): React.JSX.Element | null {
  const rowRef = useRef<HTMLDivElement | null>(null)
  // Collapse the pinned (sticky) user prompt to 2 lines; click toggles full text.
  const [userExpanded, setUserExpanded] = useState(false)
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
    return (
      // [FORK] Only the latest user prompt is pinned to the top of the scroll
      // viewport while its turn scrolls under it, so the agent's current working
      // context stays visible. Full-column bg occludes the content scrolling
      // beneath. Only the last prompt is sticky — sibling sticky rows would all
      // pin at top:0 and overlap instead of replacing one another.
      <div
        ref={rowRef}
        className={cn(
          'flex flex-col items-end gap-0.5',
          sticky && 'sticky top-0 z-10 bg-background pb-1'
        )}
      >
        <div
          className={cn(
            'max-w-[85%] rounded-xl rounded-tr-sm border border-border bg-card px-3 py-2 text-xs text-card-foreground',
            // Pinned prompt collapses to 2 lines; click/Enter toggles full text.
            sticky && 'cursor-pointer'
          )}
          {...(sticky
            ? {
                role: 'button',
                tabIndex: 0,
                'aria-expanded': userExpanded,
                onClick: () => setUserExpanded((v) => !v),
                onKeyDown: (event: React.KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setUserExpanded((v) => !v)
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
                    className="text-xs"
                    onLinkClick={onLinkClick}
                    allowFileUriLinks={allowFileUriLinks}
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
        'group relative max-w-full text-xs leading-relaxed text-foreground',
        isSystem && 'text-xs text-muted-foreground'
      )}
    >
      {showControls ? (
        <AgentControls
          markdown={markdown}
          onScrollToTop={scrollToTop}
          className="absolute -top-1 right-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        />
      ) : null}
      <NativeChatMessageImageAttachments blocks={prose} />
      {markdown ? (
        <CommentMarkdown
          content={markdown}
          variant="document"
          className="text-xs"
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
    </div>
  )
}
