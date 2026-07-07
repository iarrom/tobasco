// [FORK] One-line row for a launched sub-agent (Task/Agent tool), Cursor-style:
// `▸ Agent  <what it does>` with a shimmer while it runs. Clicking expands an
// inline preview panel — the sub-agent's own action sequence read live from its
// side transcript — inside the same chat window.

import { useContext, useMemo, useState } from 'react'
import { Bot, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  isTextBlock,
  type NativeChatMessage,
  type NativeChatToolCallBlock,
  type NativeChatToolResultBlock
} from '../../../../shared/native-chat-types'
import { splitNativeChatBlocks } from './native-chat-tool-fold'
import { pairToolBlocks } from './native-chat-tool-pairing'
import { describeToolAction } from './native-chat-tool-verb'
import {
  extractSubagentAgentId,
  isBackgroundSubagentLaunchResult,
  subagentLaunchFromInput,
  subagentTranscriptPath
} from './native-chat-subagent'
import { NativeChatSubagentContext } from './native-chat-subagent-context'
import { useNativeChatSubagentPreview } from './use-native-chat-subagent-preview'

type PreviewRow = { id: string; kind: 'thought' | 'text' | 'tool'; label: string }

function previewRowsFromMessages(messages: readonly NativeChatMessage[]): PreviewRow[] {
  const rows: PreviewRow[] = []
  for (const message of messages) {
    const { prose, tools } = splitNativeChatBlocks(message.blocks)
    if (message.role === 'reasoning') {
      const text = prose
        .filter(isTextBlock)
        .map((block) => block.text)
        .join(' ')
        .trim()
      if (text) {
        rows.push({ id: `${message.id}:thought`, kind: 'thought', label: text })
      }
      continue
    }
    if (message.role === 'assistant' || message.role === 'user') {
      const text = prose
        .filter(isTextBlock)
        .map((block) => block.text)
        .join(' ')
        .trim()
      if (text) {
        rows.push({ id: `${message.id}:text`, kind: 'text', label: text })
      }
    }
    pairToolBlocks(tools).forEach((step, index) => {
      if (!step.call) {
        return
      }
      const action = describeToolAction(step.call.name, step.call.input)
      rows.push({
        id: `${message.id}:tool:${index}`,
        kind: 'tool',
        label: [action.verb, action.label].filter(Boolean).join(' ')
      })
    })
  }
  return rows
}

export function NativeChatSubagentStep({
  call,
  result,
  active
}: {
  call: NativeChatToolCallBlock
  result: NativeChatToolResultBlock | null
  active: boolean
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const { agent, parentTranscriptPath } = useContext(NativeChatSubagentContext)

  const launch = useMemo(() => subagentLaunchFromInput(call.input), [call.input])
  const agentId = result ? extractSubagentAgentId(result.output) : null
  const background = result ? isBackgroundSubagentLaunchResult(result.output) : false
  // Sync runs shimmer until their result lands; background launches keep their
  // transcript live (the launch ack is not completion).
  const running = active || result === null
  const live = running || background

  const previewPath =
    agentId && parentTranscriptPath ? subagentTranscriptPath(parentTranscriptPath, agentId) : null
  const finalText = result && !background && !agentId ? result.output : null
  const expandable = previewPath !== null || finalText !== null

  const preview = useNativeChatSubagentPreview({
    enabled: expanded && previewPath !== null,
    live,
    agent,
    transcriptPath: previewPath
  })
  const rows = useMemo(() => previewRowsFromMessages(preview.messages), [preview.messages])

  return (
    <div>
      <button
        type="button"
        onClick={() => expandable && setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-center gap-1.5 py-0.5 text-left',
          expandable ? 'cursor-pointer' : 'cursor-default'
        )}
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <Bot className="size-3.5 shrink-0 text-muted-foreground" />
        <span
          className={cn('min-w-0 truncate text-sm', running && 'native-chat-step-shimmer')}
          title={launch.description}
        >
          <span className="font-medium">
            {translate('components.native-chat.subagent.verb', 'Agent')}
          </span>{' '}
          <span className={running ? undefined : 'text-muted-foreground'}>
            {launch.description}
          </span>
        </span>
        {background ? (
          <span className="shrink-0 text-[10px] text-muted-foreground/70">
            {translate('components.native-chat.subagent.background', 'background')}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div className="ml-5 mt-0.5 max-h-72 overflow-y-auto rounded-lg border border-border/60 bg-card/40 px-2.5 py-1.5 scrollbar-sleek">
          {previewPath ? (
            rows.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className={cn(
                      'text-xs',
                      row.kind === 'thought' && 'italic text-muted-foreground/80',
                      row.kind === 'text' && 'text-foreground/90',
                      row.kind === 'tool' && 'text-muted-foreground'
                    )}
                  >
                    <span className={cn(row.kind !== 'tool' && 'line-clamp-3 whitespace-pre-wrap')}>
                      {row.kind === 'tool' ? `· ${row.label}` : row.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-1 text-xs text-muted-foreground">
                {preview.loaded
                  ? translate(
                      'components.native-chat.subagent.emptyTranscript',
                      'No sub-agent activity recorded yet.'
                    )
                  : translate('components.native-chat.subagent.loading', 'Loading…')}
              </div>
            )
          ) : finalText ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words py-1 font-mono text-[11px] text-foreground/80 scrollbar-sleek">
              {finalText}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
