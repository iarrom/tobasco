// [FORK] Row for a launched sub-agent (Task/Agent tool), Cursor-style: an
// indented bullet-list item — `• <what it does>  <agent type>` with a shimmer
// while it runs and the result's first line as a muted status underneath once
// done. Clicking expands an inline preview panel — the sub-agent's own action
// sequence read live from its side transcript — inside the same chat window.

import { useContext, useMemo, useState } from 'react'
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

  // Cursor shows the sub-agent's one-line summary under the title; the sync
  // launch result's first line is our equivalent. Hidden while the full text is
  // expanded right below.
  const statusLine =
    finalText && !expanded
      ? (finalText
          .split('\n')
          .find((line) => line.trim().length > 0)
          ?.trim() ?? null)
      : null

  return (
    <div className="pl-4">
      <button
        type="button"
        onClick={() => expandable && setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-start gap-2 py-0.5 text-left',
          expandable ? 'cursor-pointer' : 'cursor-default'
        )}
      >
        <span
          aria-hidden
          className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground/60"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5 text-sm">
            <span
              className={cn(
                'min-w-0 truncate text-foreground/90',
                running && 'native-chat-step-shimmer'
              )}
              title={launch.description}
            >
              {launch.description}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {launch.subagentType ?? translate('components.native-chat.subagent.verb', 'Agent')}
            </span>
            {background ? (
              <span className="shrink-0 text-[10px] text-muted-foreground/70">
                {translate('components.native-chat.subagent.background', 'background')}
              </span>
            ) : null}
          </span>
          {statusLine ? (
            <span className="block truncate text-sm text-muted-foreground" title={statusLine}>
              {statusLine}
            </span>
          ) : null}
        </span>
      </button>
      {expanded ? (
        <div className="ml-3.5 mt-0.5 max-h-72 overflow-y-auto rounded-lg border border-border/60 bg-card/40 px-2.5 py-1.5 scrollbar-sleek">
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
