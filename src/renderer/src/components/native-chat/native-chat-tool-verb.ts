// [FORK] Maps a tool call to a Cursor-style compact action label: a verb
// ("Ran", "Read", "Edited", "Searched", …), a short object label (a command
// description, a file basename, a search pattern), and an optional muted hint
// (e.g. the distinct binaries a Bash command invokes → "git, echo"). Kept pure
// so the label rules are unit-testable without rendering.

import { basename } from '../../lib/path'
import { summarizeToolInput } from './native-chat-tool-summary'

export type ToolActionLabel = {
  /** Past-tense verb for a completed step ("Ran"). */
  verb: string
  /** Present-continuous verb shown while the step is still running ("Running"). */
  activeVerb: string
  /** Short object of the action (command description, file name, pattern). */
  label: string
  /** Optional muted trailing hint (e.g. Bash binaries "git, echo"). */
  hint?: string
}

type VerbPair = { verb: string; activeVerb: string }

// Why: normalize both Claude Code (Bash/Read/Edit/…) and Codex-style
// (shell/apply_patch) tool names to one verb vocabulary.
const VERB_BY_TOOL: Record<string, VerbPair> = {
  Bash: { verb: 'Ran', activeVerb: 'Running' },
  BashOutput: { verb: 'Read output', activeVerb: 'Reading output' },
  shell: { verb: 'Ran', activeVerb: 'Running' },
  Read: { verb: 'Read', activeVerb: 'Reading' },
  Write: { verb: 'Wrote', activeVerb: 'Writing' },
  Edit: { verb: 'Edited', activeVerb: 'Editing' },
  MultiEdit: { verb: 'Edited', activeVerb: 'Editing' },
  NotebookEdit: { verb: 'Edited', activeVerb: 'Editing' },
  str_replace: { verb: 'Edited', activeVerb: 'Editing' },
  apply_patch: { verb: 'Edited', activeVerb: 'Editing' },
  Grep: { verb: 'Searched', activeVerb: 'Searching' },
  Glob: { verb: 'Searched', activeVerb: 'Searching' },
  LS: { verb: 'Listed', activeVerb: 'Listing' },
  WebFetch: { verb: 'Fetched', activeVerb: 'Fetching' },
  WebSearch: { verb: 'Searched web', activeVerb: 'Searching web' },
  Task: { verb: 'Delegated', activeVerb: 'Delegating' },
  TodoWrite: { verb: 'Updated plan', activeVerb: 'Updating plan' },
  ExitPlanMode: { verb: 'Created plan', activeVerb: 'Creating plan' }
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : null
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }
  return null
}

/** Distinct leading binaries a shell command invokes, across `&&`, `||`, `|`,
 *  `;` and newlines — e.g. `git status && echo x` → "git, echo". Best-effort and
 *  capped so the hint stays a one-glance summary. */
export function extractCommandBinaries(command: string): string[] {
  const seen = new Set<string>()
  for (const segment of command.split(/&&|\|\||[|;\n]/)) {
    // Skip leading env-var assignments (FOO=bar) to reach the real binary.
    const tokens = segment.trim().split(/\s+/)
    let index = 0
    while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
      index++
    }
    const binary = tokens[index]
    if (binary && /^[A-Za-z0-9._/-]+$/.test(binary)) {
      seen.add(basename(binary))
    }
    if (seen.size >= 4) {
      break
    }
  }
  return [...seen]
}

/** Build the compact action label for a tool call. */
export function describeToolAction(name: string, input: unknown): ToolActionLabel {
  const pair = VERB_BY_TOOL[name] ?? { verb: name, activeVerb: name }
  const obj = asRecord(input)

  if ((name === 'Bash' || name === 'shell') && obj) {
    const description = firstString(obj, ['description'])
    const command = firstString(obj, ['command', 'cmd']) ?? ''
    const label = description ?? command.split('\n')[0] ?? ''
    const binaries = command ? extractCommandBinaries(command) : []
    return {
      ...pair,
      label: summarizeToolInput(label),
      ...(binaries.length > 0 ? { hint: binaries.join(', ') } : {})
    }
  }

  if (obj) {
    const filePath = firstString(obj, ['file_path', 'path', 'notebook_path'])
    if (filePath) {
      return { ...pair, label: basename(filePath) }
    }
    const pattern = firstString(obj, ['pattern', 'query', 'url'])
    if (pattern) {
      return { ...pair, label: summarizeToolInput(pattern) }
    }
    const description = firstString(obj, ['description', 'subagent_type', 'prompt'])
    if (description) {
      return { ...pair, label: summarizeToolInput(description) }
    }
  }

  return { ...pair, label: summarizeToolInput(input) }
}
