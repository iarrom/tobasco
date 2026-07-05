// [FORK] Cursor-style compact "Thought" step for the agent's reasoning. Collapsed
// to a one-line label ("Thought briefly" / "Thinking…") that expands to the full
// reasoning text. While it is the agent's active step the label shimmers.
import { useState } from 'react'
import { ChevronDown, SquareChevronRight } from 'lucide-react'
import CommentMarkdown, {
  type CommentMarkdownLinkClickHandler
} from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

export function NativeChatThoughtStep({
  markdown,
  active,
  durationLabel,
  onLinkClick,
  allowFileUriLinks = false
}: {
  markdown: string
  /** The agent's currently-running step — drives the shimmer + "Thinking…". */
  active: boolean
  /** Trailing muted descriptor when done, e.g. "briefly" or "for 12s". */
  durationLabel: string
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = markdown.trim().length > 0

  return (
    <div>
      <button
        type="button"
        onClick={() => hasDetail && setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-center gap-1.5 py-0.5 text-left',
          hasDetail ? 'cursor-pointer' : 'cursor-default'
        )}
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <SquareChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        {active ? (
          <span className="native-chat-step-shimmer text-xs font-medium">
            {translate('components.native-chat.thought.active', 'Thinking…')}
          </span>
        ) : (
          <span className="text-xs">
            <span className="font-medium text-foreground/90">
              {translate('components.native-chat.thought.done', 'Thought')}
            </span>
            {durationLabel ? <span className="text-muted-foreground"> {durationLabel}</span> : null}
          </span>
        )}
      </button>
      {expanded ? (
        <div className="border-l-2 border-border/60 py-1 pl-3 text-xs italic text-muted-foreground">
          <CommentMarkdown
            content={markdown}
            variant="document"
            className="text-xs"
            onLinkClick={onLinkClick}
            allowFileUriLinks={allowFileUriLinks}
          />
        </div>
      ) : null}
    </div>
  )
}
