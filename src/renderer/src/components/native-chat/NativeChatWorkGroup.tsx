// [FORK] Renders one agent response's intermediate work (thinking + tool
// actions). While the turn is live only the CURRENT action shows — a single
// shimmering line that tickers to the next action (old line slides up and
// fades, the new one rises from below). Once the final answer arrives (or the
// agent stops) the full step trail collapses under a muted "Worked for …"
// summary the user can expand. Intermediate work is dimmed so only the final
// answer reads full-strength.
import { useMemo, useState } from 'react'
import { ChevronDown, SquareChevronRight } from 'lucide-react'
import CommentMarkdown, {
  type CommentMarkdownLinkClickHandler
} from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { MessageRow } from './NativeChatMessageRow'
import { formatWorkedDuration } from './native-chat-turn-groups'
import {
  deriveCurrentLiveAction,
  deriveLiveProseMessages,
  NativeChatLiveActionTicker
} from './native-chat-live-action-ticker'

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
  // Live: только текущее действие одной строкой (см. комментарий модуля).
  const liveAction = useMemo(() => (live ? deriveCurrentLiveAction(steps) : null), [live, steps])
  // [FORK] Промежуточная проза, которую агент стримит между вызовами инструментов
  // (Claude пишет её отдельными assistant-сообщениями в транскрипт). Рендерим её
  // инлайн над тикером текущего действия — иначе результаты видны только в конце.
  const liveProse = useMemo(() => (live ? deriveLiveProseMessages(steps) : []), [live, steps])

  if (live) {
    // [FORK] gap-4: разделяем стримящиеся этапы (проза между вызовами и текущее
    // действие-тикер) заметным вертикальным ритмом, а не липким mb-1.
    return (
      <div className="flex flex-col gap-4 opacity-80">
        {liveProse.map((prose) => (
          <CommentMarkdown
            key={prose.id}
            content={prose.markdown}
            variant="document"
            className="text-sm leading-relaxed text-foreground"
            onLinkClick={onLinkClick}
            allowFileUriLinks={allowFileUriLinks}
          />
        ))}
        <NativeChatLiveActionTicker
          action={liveAction}
          onLinkClick={onLinkClick}
          allowFileUriLinks={allowFileUriLinks}
        />
      </div>
    )
  }

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
        <span className="text-sm text-muted-foreground">{summary}</span>
      </button>
      {open ? (
        <div className="mt-1 flex flex-col gap-3 border-l-2 border-border/60 pl-2.5 opacity-70">
          {renderedSteps}
        </div>
      ) : null}
    </div>
  )
}
