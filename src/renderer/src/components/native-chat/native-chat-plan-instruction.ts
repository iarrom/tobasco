// [FORK] Plan mode is a Cursor-style research-only posture for the Claude native
// chat. Orca is a GUI over the Claude Code TUI with no readable/settable native
// plan-mode state, so enforcement is instruction-based: each chat turn is wrapped
// with a directive that forbids mutations and requires the agent to save the plan
// to `Plans/<slug>.md` ending in a sequential To-do. Pure string helpers so the
// wrapper, path matching, and title/preview extraction stay unit-testable.

const PLAN_DIR = 'Plans'

/** Directive prepended to a user turn while plan mode is on. Kept deterministic
 *  (no per-send state) so the wrapper is a pure function of the user's text. */
const PLAN_MODE_DIRECTIVE = [
  'You are in Plan mode. Do NOT edit code, create or run migrations, execute',
  'mutating commands, or change anything on disk except the plan document itself.',
  'Only read, search, and verify to fully understand the work.',
  '',
  `Produce a complete implementation plan and save it to \`${PLAN_DIR}/<kebab-case-title>.md\``,
  'in the workspace root. The document MUST:',
  '- open with a single `# <Title>` heading and a short summary paragraph,',
  '- end with a `## To-do` section written as a sequential GFM checklist',
  '  (`- [ ] step one`, `- [ ] step two`, …) covering the work in order.',
  '',
  'Do not implement anything yet — only research and write the plan.'
].join('\n')

/** Wrap a normal chat turn with the plan-mode directive. Slash commands and empty
 *  submits are handled by the caller and must not be wrapped. */
export function wrapNativeChatPlanPrompt(userText: string): string {
  const trimmed = userText.trim()
  if (trimmed.length === 0) {
    return userText
  }
  return `${PLAN_MODE_DIRECTIVE}\n\n---\n\nTask:\n${userText}`
}

/** Normalize path separators and drop a leading `./` so Windows and POSIX paths
 *  compare the same way. */
function toPosix(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

/** True when a written file path is a plan document: a `.md` file directly inside
 *  a `Plans/` folder. Accepts absolute or worktree-relative paths; when
 *  `worktreePath` is given, an absolute path must live under it. */
export function isNativeChatPlanFilePath(path: string, worktreePath?: string): boolean {
  if (typeof path !== 'string' || path.trim().length === 0) {
    return false
  }
  const normalized = toPosix(path.trim())
  if (!/\.md$/i.test(normalized)) {
    return false
  }
  if (worktreePath) {
    const root = toPosix(worktreePath.trim()).replace(/\/+$/, '')
    if (normalized.startsWith('/') && !normalized.startsWith(`${root}/`)) {
      return false
    }
  }
  // `Plans/<name>.md` as the final two segments (any depth of parents allowed).
  return new RegExp(`(?:^|/)${PLAN_DIR}/[^/]+\\.md$`, 'i').test(normalized)
}

/** The `Plans/<name>.md` suffix of a plan path, used for display and for the
 *  execute message so it reads the same regardless of absolute prefix. */
export function nativeChatPlanRelativePath(path: string): string {
  const normalized = toPosix(path.trim())
  const match = normalized.match(new RegExp(`(?:^|/)(${PLAN_DIR}/[^/]+\\.md)$`, 'i'))
  return match?.[1] ?? normalized
}

export type NativeChatPlanSummary = { title: string; preview: string }

/** Extract a card title (first `# H1`, else the filename) and a one-line preview
 *  (first non-heading paragraph) from the plan markdown. */
export function nativeChatPlanTitleAndPreview(
  markdown: string,
  fallbackTitle = 'Plan'
): NativeChatPlanSummary {
  const lines = markdown.split(/\r?\n/)
  let title = ''
  const previewParts: string[] = []
  for (const line of lines) {
    const heading = line.match(/^#\s+(.+?)\s*$/)
    if (heading && title.length === 0) {
      title = heading[1].trim()
      continue
    }
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      if (previewParts.length > 0) {
        break
      }
      continue
    }
    // Skip further headings / list markers when gathering the intro paragraph.
    if (/^#{1,6}\s/.test(trimmed) || /^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      if (previewParts.length > 0) {
        break
      }
      continue
    }
    previewParts.push(trimmed)
  }
  return {
    title: title.length > 0 ? title : fallbackTitle,
    preview: previewParts.join(' ')
  }
}
