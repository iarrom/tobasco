// [FORK] Pair a message's folded tool blocks into per-action steps (Cursor-style
// one-line-per-tool rendering). Claude emits a tool call and its result as
// adjacent blocks; we pair each result to the most recent still-open call, and
// keep orphan results (a tool-role message with no preceding call) as their own
// step so no output is dropped. Pure so the pairing rules stay unit-testable.

import {
  isToolCallBlock,
  isToolResultBlock,
  type NativeChatBlock,
  type NativeChatToolCallBlock,
  type NativeChatToolResultBlock
} from '../../../../shared/native-chat-types'

export type NativeChatToolStepPair = {
  call: NativeChatToolCallBlock | null
  result: NativeChatToolResultBlock | null
}

export function pairToolBlocks(blocks: readonly NativeChatBlock[]): NativeChatToolStepPair[] {
  const steps: NativeChatToolStepPair[] = []
  for (const block of blocks) {
    if (isToolCallBlock(block)) {
      steps.push({ call: block, result: null })
      continue
    }
    if (!isToolResultBlock(block)) {
      continue
    }
    // Attach to the most recent call still awaiting a result; otherwise keep the
    // result as a standalone orphan step.
    let attached = false
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].call && !steps[i].result) {
        steps[i].result = block
        attached = true
        break
      }
    }
    if (!attached) {
      steps.push({ call: null, result: block })
    }
  }
  return steps
}
