// [FORK] Group the folded transcript into render groups so the view can collapse
// a finished turn's intermediate work (thinking + tool actions) under a single
// "Worked for …" summary and show only the final answer full-strength. Segments
// by user/system messages (turnId isn't reliably populated by the decoders), and
// within each agent response splits the trailing plain-text answer from the work
// steps that produced it. Pure so the segmentation rules stay unit-testable.

import {
  isTextBlock,
  isToolCallBlock,
  isToolResultBlock,
  type NativeChatMessage
} from '../../../../shared/native-chat-types'

export type NativeChatTurnGroup =
  | { kind: 'message'; message: NativeChatMessage }
  | {
      kind: 'work'
      id: string
      /** The intermediate step messages (reasoning + tool-bearing turns). */
      steps: NativeChatMessage[]
      /** The agent is still working this turn with no answer yet — render the
       *  steps live (expanded, shimmering) rather than collapsed. */
      live: boolean
      /** Wall-clock the work spanned, or null when timestamps are unavailable. */
      durationMs: number | null
    }

function hasToolBlocks(message: NativeChatMessage): boolean {
  return message.blocks.some((block) => isToolCallBlock(block) || isToolResultBlock(block))
}

function hasText(message: NativeChatMessage): boolean {
  return message.blocks.some((block) => isTextBlock(block) && block.text.trim().length > 0)
}

/** A trailing plain assistant reply — the turn's final answer, shown full color. */
function isAnswerMessage(message: NativeChatMessage): boolean {
  return message.role === 'assistant' && !hasToolBlocks(message) && hasText(message)
}

function isResponseMessage(message: NativeChatMessage): boolean {
  return message.role !== 'user' && message.role !== 'system'
}

function computeDurationMs(steps: NativeChatMessage[], answer: NativeChatMessage[]): number | null {
  const start = steps[0]?.timestamp
  const end = answer[0]?.timestamp ?? steps.at(-1)?.timestamp
  if (typeof start !== 'number' || typeof end !== 'number' || end <= start) {
    return null
  }
  return end - start
}

export function buildNativeChatTurnGroups(
  messages: NativeChatMessage[],
  options: { working: boolean }
): NativeChatTurnGroup[] {
  const groups: NativeChatTurnGroup[] = []
  let i = 0
  while (i < messages.length) {
    const message = messages[i]
    if (!isResponseMessage(message)) {
      groups.push({ kind: 'message', message })
      i++
      continue
    }
    // Gather the agent's response: the run of messages until the next user/system
    // message.
    let j = i
    while (j < messages.length && isResponseMessage(messages[j])) {
      j++
    }
    const run = messages.slice(i, j)
    const isLastResponse = j >= messages.length

    // The final answer is the maximal trailing run of plain assistant replies.
    let split = run.length
    while (split > 0 && isAnswerMessage(run[split - 1])) {
      split--
    }
    const steps = run.slice(0, split)
    const answer = run.slice(split)

    if (steps.length === 0) {
      for (const answerMessage of answer) {
        groups.push({ kind: 'message', message: answerMessage })
      }
    } else {
      // Live while this turn is still in flight — trailing prose mid-turn is an
      // INTERMEDIATE result (Claude interleaves prose between tool batches), not
      // the final answer, so it must not collapse the steps to "Worked for …":
      // the next tool call would re-expand them and the header would seesaw.
      // Collapse happens only when the agent stops.
      const live = options.working && isLastResponse
      groups.push({
        kind: 'work',
        id: `work:${steps[0].id}`,
        steps,
        live,
        durationMs: computeDurationMs(steps, answer)
      })
      for (const answerMessage of answer) {
        groups.push({ kind: 'message', message: answerMessage })
      }
    }
    i = j
  }
  return groups
}

/** Compact wall-clock label for the collapsed work summary, e.g. "5m", "45s",
 *  "1h 3m". Returns null when the duration is unknown. */
export function formatWorkedDuration(durationMs: number | null): string | null {
  if (durationMs === null || durationMs <= 0) {
    return null
  }
  const totalSeconds = Math.round(durationMs / 1000)
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  const totalMinutes = Math.round(totalSeconds / 60)
  if (totalMinutes < 60) {
    return `${totalMinutes}m`
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}
