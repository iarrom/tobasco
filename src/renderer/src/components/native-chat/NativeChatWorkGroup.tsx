// [FORK] Renders one agent response's intermediate work (thinking + tool
// actions). While the turn is live the steps show expanded and shimmering; once
// the final answer arrives (or the agent stops) they collapse under a muted
// "Worked for …" summary the user can expand. Intermediate work is dimmed so
// only the final answer reads full-strength.
import { useState } from 'react'
import { ChevronDown, SquareChevronRight } from 'lucide-react'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { MessageRow } from './NativeChatMessageRow'
import { formatWorkedDuration } from './native-chat-turn-groups'

type NativeChatWorkGroupProps = {
  steps: NativeChatMessage[]
  live: boolean
  durationMs: number | null
  activeStepId: string | null
  thoughtDurationById: Map<string, string>
  onScrollMessageToTop: (el: HTMLElement) => void
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
}

export function NativeChatWorkGroup({
  steps,
  live,
  durationMs,
  activeStepId,
  thoughtDurationById,
  onScrollMessageToTop,
  onLinkClick,
  allowFileUriLinks = false
}: NativeChatWorkGroupProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  const renderedSteps = steps.map((message) => (
    <MessageRow
      key={message.id}
      message={message}
      isActiveStep={message.id === activeStepId}
      thoughtDurationLabel={thoughtDurationById.get(message.id) ?? ''}
      onScrollMessageToTop={onScrollMessageToTop}
      onLinkClick={onLinkClick}
      allowFileUriLinks={allowFileUriLinks}
    />
  ))

  // Live: steps stay visible (slightly dimmed) with the active one shimmering.
  if (live) {
    return <div className="flex flex-col gap-3 opacity-80">{renderedSteps}</div>
  }

  const durationLabel = formatWorkedDuration(durationMs)
  const summary = durationLabel
    ? translate('components.native-chat.workedFor', 'Worked for {{duration}}', {
        duration: durationLabel
      })
    : translate('components.native-chat.worked', 'Worked')

  // Collapsed: a muted one-liner that expands to the (dimmed) step trail.
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-0.5 text-left"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <SquareChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs text-muted-foreground">{summary}</span>
      </button>
      {open ? (
        <div className="mt-1 flex flex-col gap-3 border-l-2 border-border/60 pl-2.5 opacity-70">
          {renderedSteps}
        </div>
      ) : null}
    </div>
  )
}
