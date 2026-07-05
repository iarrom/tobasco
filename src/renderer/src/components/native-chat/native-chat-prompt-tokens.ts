// [FORK] Splits a sent prompt into text/token segments so the transcript can
// render slash-tool tokens (a leading `/command`, `$skill` references) in the
// Cursor amber. Pure so the tokenization rules stay unit-testable.

export type PromptTokenSegment = { kind: 'token' | 'text'; value: string }

// Letter-first so dollar amounts ($5x) and numbered paths never highlight —
// command and skill names always start with a letter.
const LEADING_COMMAND_RE = /^\/[A-Za-z][A-Za-z0-9_:.-]*/
// `$skill-name` at start-of-text or after whitespace/open-paren, mirroring the
// composer's insertion format.
const SKILL_TOKEN_RE = /(^|[\s(])(\$[A-Za-z][A-Za-z0-9_-]*)/g

/** Segment `text` around its tokens, or null when it contains none (callers
 *  fall back to the normal markdown renderer). */
export function segmentNativeChatPromptTokens(text: string): PromptTokenSegment[] | null {
  const segments: PromptTokenSegment[] = []
  let cursor = 0
  let found = false

  const lead = text.match(LEADING_COMMAND_RE)
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
      segments.push({ kind: 'token', value: match[2] })
      cursor = tokenStart + match[2].length
      found = true
    }
    match = SKILL_TOKEN_RE.exec(text)
  }

  if (!found) {
    return null
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) })
  }
  return segments
}
