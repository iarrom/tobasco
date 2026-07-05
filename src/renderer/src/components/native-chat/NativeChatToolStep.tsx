// [FORK] One Cursor-style action line for a single tool call paired with its
// result: `▸ Ran  <description>   git, echo  ⌄`. Collapsed by default; expands in
// place to the command/diff and its output. While the call is the agent's active
// (still-running) step, the label shimmers and uses the present-tense verb.
import { useState } from 'react'
import { ChevronDown, SquareChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type {
  NativeChatToolCallBlock,
  NativeChatToolResultBlock
} from '../../../../shared/native-chat-types'
import { diffFromText, diffFromToolCall } from './native-chat-diff'
import { describeToolAction, type ToolActionLabel } from './native-chat-tool-verb'
import { NativeChatDiffView } from './NativeChatDiffView'
import { isSubagentToolName } from './native-chat-subagent'
import { NativeChatSubagentStep } from './NativeChatSubagentStep'

const MAX_TOOL_RESULT_CHARS = 4000

function isShellCall(name: string): boolean {
  return name === 'Bash' || name === 'shell'
}

function firstCommand(input: unknown): string | null {
  if (input && typeof input === 'object') {
    const command =
      (input as Record<string, unknown>).command ?? (input as Record<string, unknown>).cmd
    if (typeof command === 'string' && command.trim().length > 0) {
      return command
    }
  }
  return null
}

export function NativeChatToolStep({
  call,
  result,
  active
}: {
  /** The tool call, or null for an orphan tool-result with no preceding call. */
  call: NativeChatToolCallBlock | null
  result: NativeChatToolResultBlock | null
  /** The agent's currently-running step — drives the shimmer + present-tense verb. */
  active: boolean
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  // [FORK] Sub-agent launches get their own one-line row with a live inline
  // preview of the sub-agent's transcript instead of the generic tool step.
  if (call && isSubagentToolName(call.name)) {
    return <NativeChatSubagentStep call={call} result={result} active={active} />
  }
  const { verb, activeVerb, label, hint }: ToolActionLabel = call
    ? describeToolAction(call.name, call.input)
    : {
        verb: translate('components.native-chat.tool.result', 'Result'),
        activeVerb: translate('components.native-chat.tool.result', 'Result'),
        label: result?.output.split('\n')[0]?.slice(0, 80) ?? ''
      }

  const callDiff = call ? diffFromToolCall(call.name, call.input) : null
  const command = call && isShellCall(call.name) ? firstCommand(call.input) : null
  const resultDiff = result ? diffFromText(result.output) : null
  const hasDetail = callDiff !== null || command !== null || result !== null || label.length > 40

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
          <span className="native-chat-step-shimmer min-w-0 truncate text-xs">
            <span className="font-medium">{activeVerb}</span>
            {label ? <span> {label}</span> : null}
            {hint ? <span> {hint}</span> : null}
          </span>
        ) : (
          <>
            <span className="shrink-0 text-xs font-medium text-foreground/90">{verb}</span>
            {label ? (
              <span className="min-w-0 truncate text-xs text-muted-foreground" title={label}>
                {label}
              </span>
            ) : null}
            {hint ? (
              <span className="shrink-0 truncate text-xs text-muted-foreground/60">{hint}</span>
            ) : null}
          </>
        )}
      </button>
      {expanded ? (
        <div className="space-y-1.5 py-1 pl-5">
          {callDiff ? <NativeChatDiffView lines={callDiff} /> : null}
          {!callDiff && command ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-accent p-2 font-mono text-[11px] text-foreground/80 scrollbar-sleek">
              <span className="select-none text-muted-foreground">$ </span>
              {command}
            </pre>
          ) : null}
          {result && resultDiff ? <NativeChatDiffView lines={resultDiff} /> : null}
          {result && !resultDiff ? (
            <pre
              className={cn(
                'max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-accent p-2 font-mono text-[11px] scrollbar-sleek',
                result.isError ? 'text-destructive' : 'text-foreground/80'
              )}
            >
              {result.output.length > MAX_TOOL_RESULT_CHARS
                ? `${result.output.slice(0, MAX_TOOL_RESULT_CHARS)}…`
                : result.output}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
