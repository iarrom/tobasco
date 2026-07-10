// [FORK] Live streaming preview for Claude panes, parsed from the agent TUI's
// alt-screen viewport. The JSONL transcript only receives a record when a whole
// content block completes, so during long reasoning/answers the chat used to
// hang on a static "Thinking…". The TUI, however, renders everything live: a
// spinner status line ("✢ Hardening transcript watcher… (thinking)") and the
// in-flight answer streaming into the last ⏺ prose block. This module extracts
// those two signals from a decoded viewport frame. Best-effort by design: a
// null result must always degrade to the current (transcript-only) behavior.

export type ClaudeTuiLivePreview = {
  /** The spinner's status text (verbatim, without the trailing ellipsis and
   *  parenthetical), e.g. "Hardening transcript watcher" or "Wrangling". */
  status: string | null
  /** True while the parenthetical reports the model is reasoning. */
  thinking: boolean
  /** The in-flight assistant prose streaming into the last ⏺ block, reflowed
   *  to paragraphs; null when the last content above the spinner is not prose. */
  prose: string | null
  /** The last ⏺ action/tool head above the spinner (wrapped rows re-joined,
   *  e.g. "Write(/repo/Plans/x.md)" or "Reading 1 file…"); null when the last
   *  block is prose. Lets the UI react to work the transcript hasn't recorded
   *  yet — a tool call only lands there once its input finishes generating. */
  action: string | null
}

// Spinner glyphs Claude Code cycles through while working. `·` doubles as an
// inline separator inside the parenthetical, so the match is line-anchored.
const SPINNER_LINE_PATTERN = /^[✢✳✻✽·✶✦∴+*] (.+?)(?:…|\.\.\.)\s*(?:\((.+)\))?$/

// A ⏺ line that is a tool call rather than prose: `⏺ Name(args…` — the TUI
// renders tool headers as an identifier immediately followed by an open paren.
const TOOL_CALL_HEAD_PATTERN = /^⏺ {1,2}[A-Za-z][\w .-]*\(/

// Collapsed step summaries ("Ran 2 shell commands", "Listed 1 directory, ran
// 1 shell command") — count-plus-noun rows the TUI leaves under committed work.
const STEP_SUMMARY_PATTERN =
  /\b\d+\s+(?:shell command|file|director|pattern|line|todo|page|agent|search)/i

const RULER_PATTERN = /^─{10,}$/

// How far above the composer the spinner can sit (todo panel + tip rows).
const SPINNER_SCAN_WINDOW = 16

function isSkippableBetweenProseAndSpinner(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length === 0) {
    return true
  }
  // ⎿ attachments (tool results, todo panel, tips) and their wrapped
  // continuation rows — the latter indent deeper than the 2-space prose body.
  if (trimmed.startsWith('⎿') || trimmed.startsWith('◼') || trimmed.startsWith('◻')) {
    return true
  }
  if (/^\s{4,}/.test(line)) {
    return true
  }
  return STEP_SUMMARY_PATTERN.test(trimmed)
}

/** Locate the composer box (the last pair of full-width rulers) and return the
 *  index of its top ruler, or the line count when no composer is visible. */
function composerTopIndex(lines: string[]): number {
  const rulers: number[] = []
  for (let i = lines.length - 1; i >= 0 && rulers.length < 2; i--) {
    if (RULER_PATTERN.test(lines[i].trim())) {
      rulers.push(i)
    }
  }
  return rulers.length === 2 ? rulers[1] : lines.length
}

function parseSpinner(
  lines: string[],
  before: number
): { index: number; status: string; thinking: boolean } | null {
  // The spinner sits just above the composer, below all committed content —
  // scan a bounded tail window so ⏺ prose containing an ellipsis higher up
  // can't be mistaken for it.
  const from = Math.max(0, before - SPINNER_SCAN_WINDOW)
  for (let i = before - 1; i >= from; i--) {
    const match = SPINNER_LINE_PATTERN.exec(lines[i].trim())
    if (!match) {
      continue
    }
    const parenthetical = match[2] ?? ''
    return {
      index: i,
      status: match[1].trim(),
      thinking: parenthetical.includes('thinking')
    }
  }
  return null
}

/** Re-join a tool head's wrapped rows ("⏺ Write(/repo/Pla" + "ns/x.md)") into
 *  one string. Continuations align under the argument, so they indent deeper
 *  than prose; paths wrap mid-token, hence no separator when joining. */
function joinActionHead(lines: string[], blockStart: number): string {
  let action = lines[blockStart].replace(/^⏺ {1,2}/, '').trim()
  for (let i = blockStart + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!/^\s{4,}\S/.test(line) || line.trim().startsWith('⎿')) {
      break
    }
    action += line.trim()
  }
  return action
}

/** Reflow a ⏺ block's wrapped viewport rows into paragraph text. */
function reflowProse(lines: string[]): string {
  const paragraphs: string[] = []
  let current: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      if (current.length > 0) {
        paragraphs.push(current.join(' '))
        current = []
      }
      continue
    }
    current.push(trimmed)
  }
  if (current.length > 0) {
    paragraphs.push(current.join(' '))
  }
  return paragraphs.join('\n\n').trim()
}

/**
 * Parse one decoded viewport frame (see decodeTuiViewportLines). Returns null
 * when the frame carries no live-work signal (idle composer, finished turn).
 */
export function parseClaudeTuiLivePreview(lines: string[]): ClaudeTuiLivePreview | null {
  const composerTop = composerTopIndex(lines)
  const spinner = parseSpinner(lines, composerTop)
  if (!spinner) {
    return null
  }

  // Walk up from the spinner, skipping its attachment rows. The nearest
  // remaining content decides whether an answer is streaming. A ⏺ head is
  // never skippable — action rows like "⏺ Reading 1 file…" would otherwise
  // match the count-noun summary pattern.
  let contentEnd = spinner.index - 1
  while (
    contentEnd >= 0 &&
    !lines[contentEnd].startsWith('⏺') &&
    isSkippableBetweenProseAndSpinner(lines[contentEnd])
  ) {
    contentEnd--
  }

  let prose: string | null = null
  let action: string | null = null
  if (contentEnd >= 0) {
    // Find the ⏺ marker opening the block this content belongs to.
    let blockStart = contentEnd
    while (blockStart >= 0 && !lines[blockStart].startsWith('⏺')) {
      blockStart--
    }
    const head = blockStart >= 0 ? lines[blockStart] : null
    // Every row between the head and the tail must be a blank or an indented
    // continuation — a column-0 marker in between (user ❯, turn summary ✻)
    // means the tail belongs to something else entirely.
    const blockOwnsContent =
      head !== null &&
      lines
        .slice(blockStart + 1, contentEnd + 1)
        .every((line) => line.trim().length === 0 || /^\s/.test(line))
    if (head !== null && blockOwnsContent) {
      if (TOOL_CALL_HEAD_PATTERN.test(head)) {
        action = joinActionHead(lines, blockStart)
      } else if (blockStart === contentEnd && /(?:…|\.\.\.)$/.test(head.trim())) {
        // Single-line "⏺ Reading 1 file…" style action row.
        action = head.replace(/^⏺ {1,2}/, '').trim()
      } else {
        const body = [head.replace(/^⏺ {1,2}/, ''), ...lines.slice(blockStart + 1, contentEnd + 1)]
        const reflowed = reflowProse(body)
        prose = reflowed.length > 0 ? reflowed : null
      }
    }
  }

  return { status: spinner.status, thinking: spinner.thinking, prose, action }
}

/** Loose fingerprint for cross-representation text comparison: the TUI renders
 *  markdown (bold/backticks/links stripped, wrapped lines rejoined), so the
 *  transcript's raw markdown never matches it verbatim. */
function fingerprint(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * Decide what part of parsed viewport prose is genuinely in-flight. The
 * viewport keeps showing committed paragraphs while follow-up work runs (and
 * a streaming continuation can share its ⏺ block with an already-committed
 * paragraph), so the committed test runs PER PARAGRAPH: paragraphs already in
 * the recent transcript prose are dropped, and only the new tail is returned.
 * Null when nothing new is streaming.
 */
export function deriveTuiStreamingProse(args: {
  prose: string | null
  /** Concatenated recent assistant prose (see recentAssistantProseText). */
  recentAssistantProse: string
}): string | null {
  const { prose, recentAssistantProse } = args
  if (!prose) {
    return null
  }
  // Containment, not equality: long content scrolls out of the alt screen, so
  // the viewport may only show a paragraph's tail.
  const committedKey = fingerprint(recentAssistantProse)
  const fresh = prose
    .split('\n\n')
    .filter((paragraph) => {
      const key = fingerprint(paragraph)
      return key.length > 0 && !committedKey.includes(key)
    })
    .join('\n\n')
  return fresh.length > 0 ? fresh : null
}
