// [FORK] Detects inline-code tokens that name a repo file (`src/x/y.ts`,
// `path/file.tsx:12`, `a/b.css:10:4`) so the markdown preview can render them
// as clickable file chips. Pure so the matching rules stay unit-testable.

export type MarkdownInlineFileReference = {
  /** Worktree-root-relative path (no leading `./`). */
  path: string
  line?: number
  column?: number
}

// Requires at least one directory segment and a short alphanumeric extension —
// bare filenames are ambiguous (no reliable root to resolve against) and stay
// plain code. Trailing `:line[:col]` is optional; `,`-separated extra line
// refs (`types.ts:811,847`) resolve to the first target.
const INLINE_FILE_REFERENCE_RE =
  /^(?:\.\/)?((?:[\w@.-]+\/)+[\w@.-]+\.[A-Za-z][A-Za-z0-9]{0,7})(?::(\d+)(?::(\d+))?)?$/

export function matchMarkdownInlineFileReference(text: string): MarkdownInlineFileReference | null {
  const trimmed = text.trim()
  if (trimmed.length === 0 || /\s/.test(trimmed)) {
    return null
  }
  const primary = trimmed.split(',')[0]
  const match = INLINE_FILE_REFERENCE_RE.exec(primary)
  if (!match) {
    return null
  }
  const reference: MarkdownInlineFileReference = { path: match[1] }
  if (match[2] !== undefined) {
    reference.line = Number(match[2])
  }
  if (match[3] !== undefined) {
    reference.column = Number(match[3])
  }
  return reference
}
