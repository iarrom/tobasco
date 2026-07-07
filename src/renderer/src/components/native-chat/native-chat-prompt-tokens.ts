// [FORK] Splits a sent prompt into text/token segments so the transcript can
// render slash-tool tokens (a leading `/command`, `$skill` references) in the
// Cursor amber, and pasted devtools element dumps (`<div …> … in Component
// (at /path)`) as one compact link-blue element chip. Pure so the
// tokenization rules stay unit-testable.

export type PromptTokenSegment =
  | { kind: 'token' | 'text'; value: string }
  | { kind: 'element'; value: string; label: string }

// Letter-first so dollar amounts ($5x) and numbered paths never highlight —
// command and skill names always start with a letter.
const LEADING_COMMAND_RE = /^\/[A-Za-z][A-Za-z0-9_:.-]*/
// `$skill-name` at start-of-text or after whitespace/open-paren, mirroring the
// composer's insertion format.
const SKILL_TOKEN_RE = /(^|[\s(])(\$[A-Za-z][A-Za-z0-9_-]*)/g

// A pasted element dump: an opening `<tag …` line, arbitrary markup/inner text,
// then at least one React-style stack line `in Component (at /path/file.tsx)`.
// The stack line is the strong signal — a plain `<div` in prose never gets one.
const ELEMENT_OPEN_RE = /^<([a-zA-Z][\w-]*)([\s/>]|$)/
const ELEMENT_STACK_LINE_RE = /^\s*in \S.*\(at [^)\n]+\)\s*$/
// How far (in lines) the first stack line may sit from the opening tag line.
const ELEMENT_MAX_BLOCK_LINES = 120

type ElementBlock = { start: number; end: number; label: string }

function extractElementBlocks(text: string): ElementBlock[] {
  const blocks: ElementBlock[] = []
  const lines = text.split('\n')
  // Precompute each line's start offset in `text`.
  const offsets: number[] = []
  let acc = 0
  for (const line of lines) {
    offsets.push(acc)
    acc += line.length + 1
  }
  for (let i = 0; i < lines.length; i += 1) {
    const open = lines[i]!.match(ELEMENT_OPEN_RE)
    if (!open) {
      continue
    }
    let firstStack = -1
    const scanEnd = Math.min(lines.length, i + ELEMENT_MAX_BLOCK_LINES)
    for (let j = i + 1; j < scanEnd; j += 1) {
      if (ELEMENT_STACK_LINE_RE.test(lines[j]!)) {
        firstStack = j
        break
      }
    }
    if (firstStack === -1) {
      continue
    }
    let lastStack = firstStack
    while (lastStack + 1 < lines.length && ELEMENT_STACK_LINE_RE.test(lines[lastStack + 1]!)) {
      lastStack += 1
    }
    blocks.push({
      start: offsets[i]!,
      end: offsets[lastStack]! + lines[lastStack]!.length,
      label: `<${open[1]!}>`
    })
    i = lastStack
  }
  return blocks
}

/** Slash/skill tokenization of one plain-text piece. `allowLeadingCommand` is
 *  true only for the piece at the very start of the prompt. */
function segmentSlashSkillTokens(
  text: string,
  allowLeadingCommand: boolean
): { segments: PromptTokenSegment[]; found: boolean } {
  const segments: PromptTokenSegment[] = []
  let cursor = 0
  let found = false

  const lead = allowLeadingCommand ? text.match(LEADING_COMMAND_RE) : null
  if (lead) {
    segments.push({ kind: 'token', value: lead[0] })
    cursor = lead[0].length
    found = true
  }

  SKILL_TOKEN_RE.lastIndex = cursor
  let match = SKILL_TOKEN_RE.exec(text)
  while (match !== null) {
    const tokenStart = match.index + match[1].length
    if (tokenStart >= cursor) {
      if (tokenStart > cursor) {
        segments.push({ kind: 'text', value: text.slice(cursor, tokenStart) })
      }
      segments.push({ kind: 'token', value: match[2]! })
      cursor = tokenStart + match[2]!.length
      found = true
    }
    match = SKILL_TOKEN_RE.exec(text)
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) })
  }
  return { segments, found }
}

/** Segment `text` around its tokens and element dumps, or null when it contains
 *  none (callers fall back to the normal markdown renderer). */
export function segmentNativeChatPromptTokens(text: string): PromptTokenSegment[] | null {
  const blocks = extractElementBlocks(text)
  const segments: PromptTokenSegment[] = []
  let found = blocks.length > 0
  let cursor = 0

  const pushText = (piece: string, atStart: boolean): void => {
    if (piece.length === 0) {
      return
    }
    const sub = segmentSlashSkillTokens(piece, atStart)
    found = found || sub.found
    segments.push(...sub.segments)
  }

  for (const block of blocks) {
    pushText(text.slice(cursor, block.start), cursor === 0)
    segments.push({
      kind: 'element',
      value: text.slice(block.start, block.end),
      label: block.label
    })
    cursor = block.end
  }
  pushText(text.slice(cursor), cursor === 0)

  return found ? segments : null
}
