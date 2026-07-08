// [FORK] Plain-text prompt renderer used when a sent message carries slash-tool
// tokens or pasted element dumps: tokens paint amber, element dumps collapse to
// a link-blue `<tag>` chip (Cursor parity), the rest stays plain. Trades
// markdown rendering for token highlighting — prompts built through the slash
// tool are plain text in practice.

import { cn } from '@/lib/utils'
import type { PromptTokenSegment } from './native-chat-prompt-tokens'

export function NativeChatPromptText({
  segments,
  className
}: {
  segments: readonly PromptTokenSegment[]
  className?: string
}): React.JSX.Element {
  return (
    // text-sm: тот же 14px, что у markdown-ответов (CommentMarkdown) — размер
    // текста в пузыре пользователя и в ленте не должен расходиться.
    <div className={cn('whitespace-pre-wrap break-words text-sm', className)}>
      {segments.map((segment, index) =>
        segment.kind === 'token' ? (
          <span key={index} className="font-medium text-warning">
            {segment.value}
          </span>
        ) : segment.kind === 'element' ? (
          // Full pasted dump stays available on hover; the bubble shows only the
          // compact link-blue element name.
          <span
            key={index}
            title={segment.value.length > 600 ? `${segment.value.slice(0, 600)}…` : segment.value}
            className="font-medium text-blue-600 dark:text-blue-400"
          >
            {segment.label}
          </span>
        ) : (
          <span key={index}>{segment.value}</span>
        )
      )}
    </div>
  )
}
