// [FORK] Plain-text prompt renderer used when a sent message carries slash-tool
// tokens: tokens paint amber (Cursor parity), the rest stays plain. Trades
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
    <div className={cn('whitespace-pre-wrap break-words text-[13px]', className)}>
      {segments.map((segment, index) =>
        segment.kind === 'token' ? (
          <span key={index} className="font-medium text-warning">
            {segment.value}
          </span>
        ) : (
          <span key={index}>{segment.value}</span>
        )
      )}
    </div>
  )
}
