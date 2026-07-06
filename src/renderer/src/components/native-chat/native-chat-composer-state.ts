// Pure state machine for the native chat composer. Given the current draft,
// caret position, sent-input history, and the active agent's known slash
// commands/skills, it derives the autocomplete mode, the
// query, and the filtered suggestions. Keeping this DOM-free makes the slash /
// mention / skill / history behavior unit-testable; the .tsx only owns rendering and
// the actual textarea/caret wiring.

import type { DiscoveredSkill } from '../../../../shared/skills'
import {
  filterSlashCommands,
  isSlashCommandDraft,
  applySlashSuggestion,
  slashCommandDispatchText,
  type SlashCommandSuggestion
} from '../../../../shared/native-chat-slash-commands'

export type { SlashCommandSuggestion }
export { filterSlashCommands, isSlashCommandDraft, applySlashSuggestion, slashCommandDispatchText }

export type ComposerAutocompleteMode = 'none' | 'slash' | 'mention' | 'skill'

export type ComposerAutocomplete =
  | { mode: 'none' }
  | { mode: 'slash'; query: string; suggestions: SlashCommandSuggestion[] }
  | { mode: 'mention'; query: string }
  | { mode: 'skill'; query: string; suggestions: DiscoveredSkill[] }

export type ComposerDerivation = {
  autocomplete: ComposerAutocomplete
}

/**
 * Detect the active autocomplete trigger from the text before the caret.
 *
 * Rules (intentionally conservative to avoid firing inside ordinary prose):
 *  - Slash: the draft starts with `/` and the caret is within that first token
 *    (no whitespace between `/` and the caret). Agent slash commands are only
 *    valid at the very start of the input, mirroring how the TUIs accept them.
 *  - Mention: an `@` immediately preceded by start-of-input or whitespace, with
 *    no whitespace between it and the caret. Works anywhere in the line so you
 *    can reference a file mid-sentence.
 */
export function deriveComposerAutocomplete(
  draft: string,
  caret: number,
  agentCommands: readonly SlashCommandSuggestion[],
  skills: readonly DiscoveredSkill[] = []
): ComposerAutocomplete {
  const before = draft.slice(0, caret)

  // Slash: only at the absolute start of the input, and only while the caret is
  // still inside the unbroken command token.
  if (before.startsWith('/') && !/\s/.test(before)) {
    const query = before.slice(1)
    return { mode: 'slash', query, suggestions: filterSlashCommands(agentCommands, query) }
  }

  const mentionMatch = before.match(/(?:^|\s)@(\S*)$/)
  if (mentionMatch) {
    return { mode: 'mention', query: mentionMatch[1] }
  }

  const skillMatch = before.match(/(?:^|\s)\$(\S*)$/)
  if (skillMatch) {
    const query = skillMatch[1]
    return { mode: 'skill', query, suggestions: filterSkillSuggestions(skills, query) }
  }

  return { mode: 'none' }
}

// ─── [FORK] Universal slash menu (Cursor parity) ────────────────────────────
// Typing `/` opens one sectioned menu — Skills, Commands, Modes — instead of
// the bare command list. Pure builders here; the composer owns the wiring.

export type NativeChatComposerMode = {
  id: 'plan'
  label: string
  description?: string
  active: boolean
}

export type UniversalSlashItem =
  | { kind: 'skill'; skill: DiscoveredSkill }
  | { kind: 'command'; command: SlashCommandSuggestion }
  | { kind: 'mode'; mode: NativeChatComposerMode }

const UNIVERSAL_SLASH_SKILL_CAP = 5
const UNIVERSAL_SLASH_COMMAND_CAP = 8

/** Flat, keyboard-navigable item list for the universal `/` menu, ordered the
 *  way the sections render: Skills, Commands, Modes. */
export function buildUniversalSlashItems(params: {
  query: string
  commands: readonly SlashCommandSuggestion[]
  skills: readonly DiscoveredSkill[]
  modes: readonly NativeChatComposerMode[]
}): UniversalSlashItem[] {
  const normalized = params.query.toLowerCase()
  const skills = filterSkillSuggestions(params.skills, params.query).slice(
    0,
    UNIVERSAL_SLASH_SKILL_CAP
  )
  const commands = filterSlashCommands(params.commands, params.query).slice(
    0,
    UNIVERSAL_SLASH_COMMAND_CAP
  )
  const modes = params.modes.filter(
    (mode) =>
      normalized === '' ||
      mode.id.startsWith(normalized) ||
      mode.label.toLowerCase().startsWith(normalized)
  )
  return [
    ...skills.map((skill) => ({ kind: 'skill' as const, skill })),
    ...commands.map((command) => ({ kind: 'command' as const, command })),
    ...modes.map((mode) => ({ kind: 'mode' as const, mode }))
  ]
}

/** Replace the leading `/query` token (slash mode ⇒ everything before the
 *  caret) with the skill's `$name ` reference. */
export function applySlashSkillSuggestion(
  draft: string,
  caret: number,
  skillName: string
): { draft: string; caret: number } {
  const insertion = `$${skillName} `
  return { draft: insertion + draft.slice(caret), caret: insertion.length }
}

/** Drop the leading `/query` token (e.g. after a mode toggle consumed it). */
export function stripLeadingSlashToken(
  draft: string,
  caret: number
): { draft: string; caret: number } {
  return { draft: draft.slice(caret).replace(/^\s+/, ''), caret: 0 }
}

export function filterSkillSuggestions(
  skills: readonly DiscoveredSkill[],
  query: string
): DiscoveredSkill[] {
  const normalized = query.toLowerCase()
  const installed = skills.filter((skill) => skill.installed)
  if (normalized === '') {
    return installed.slice(0, 12)
  }
  return installed
    .filter((skill) => {
      const name = skill.name.toLowerCase()
      const dirName = skill.directoryPath.split(/[\\/]/).findLast(Boolean)?.toLowerCase()
      return name.startsWith(normalized) || dirName?.startsWith(normalized)
    })
    .slice(0, 12)
}

export type HistoryState = {
  /** Most-recent-last list of previously sent drafts. */
  entries: readonly string[]
  /** Cursor into `entries`; null means "live draft" (not recalling). */
  index: number | null
}

export const EMPTY_HISTORY: HistoryState = { entries: [], index: null }

/** Append a sent draft to history and reset the recall cursor. Blank sends and
 *  immediate duplicates of the last entry are not recorded (shell-style). */
export function pushHistory(history: HistoryState, sent: string): HistoryState {
  if (sent.trim() === '') {
    return { entries: history.entries, index: null }
  }
  if (history.entries.at(-1) === sent) {
    return { entries: history.entries, index: null }
  }
  return { entries: [...history.entries, sent], index: null }
}

export type HistoryRecall = {
  history: HistoryState
  /** The draft text to show, or null to leave the live draft untouched. */
  draft: string | null
}

/**
 * Move one step toward older entries (Up arrow). From the live draft this jumps
 * to the most recent entry; thereafter it walks backward and clamps at the
 * oldest. Returns the recalled draft, or null when there is nothing to recall.
 */
export function recallPrevious(history: HistoryState): HistoryRecall {
  if (history.entries.length === 0) {
    return { history, draft: null }
  }
  const nextIndex =
    history.index === null ? history.entries.length - 1 : Math.max(0, history.index - 1)
  return {
    history: { entries: history.entries, index: nextIndex },
    draft: history.entries[nextIndex]
  }
}

/**
 * Move one step toward newer entries (Down arrow). Walking past the newest entry
 * returns to the live (empty) draft and clears the recall cursor. Returns null
 * draft when not currently recalling.
 */
export function recallNext(history: HistoryState): HistoryRecall {
  if (history.index === null) {
    return { history, draft: null }
  }
  const nextIndex = history.index + 1
  if (nextIndex >= history.entries.length) {
    return { history: { entries: history.entries, index: null }, draft: '' }
  }
  return {
    history: { entries: history.entries, index: nextIndex },
    draft: history.entries[nextIndex]
  }
}

/** Replace the active `@query` token before the caret with the chosen path.
 *  Returns the new full draft and the caret offset to place after insertion. */
export function applyMentionSuggestion(
  draft: string,
  caret: number,
  path: string
): { draft: string; caret: number } {
  const before = draft.slice(0, caret)
  const after = draft.slice(caret)
  const match = before.match(/(^|\s)@(\S*)$/)
  if (!match) {
    return { draft, caret }
  }
  const tokenStart = before.length - match[2].length - 1 // -1 for the '@'
  const insertion = `@${path} `
  const nextBefore = before.slice(0, tokenStart) + insertion
  return { draft: nextBefore + after, caret: nextBefore.length }
}

export function applySkillSuggestion(
  draft: string,
  caret: number,
  skillName: string
): { draft: string; caret: number } {
  const before = draft.slice(0, caret)
  const after = draft.slice(caret)
  const match = before.match(/(^|\s)\$(\S*)$/)
  if (!match) {
    return { draft, caret }
  }
  const tokenStart = before.length - match[2].length - 1 // -1 for the '$'
  const insertion = `$${skillName} `
  const nextBefore = before.slice(0, tokenStart) + insertion
  return { draft: nextBefore + after, caret: nextBefore.length }
}
