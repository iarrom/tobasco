// [FORK] Detects the plan produced during Plan mode by scanning the assembled
// transcript for the agent's own write of a `Plans/<name>.md` file. This is the
// "plan created" signal that drives the status line, the docked Review Plan card,
// and the plan tab — no native plan mode, no fragile text markers. Pure so it
// stays unit-testable off the assembled session.

import { isToolCallBlock, type NativeChatMessage } from '../../../../shared/native-chat-types'
import { basename, joinPath } from '../../lib/path'
import {
  isNativeChatPlanFilePath,
  nativeChatPlanRelativePath,
  nativeChatPlanTitleAndPreview
} from './native-chat-plan-instruction'

/** Tool names that write file content, across Claude Code and Codex-style agents. */
const WRITE_TOOL_NAMES = new Set(['Write', 'create_file', 'str_replace_editor'])

export type NativeChatDetectedPlan = {
  /** Absolute (or best-effort) path to the plan file, for reading + the tab. */
  path: string
  /** `Plans/<name>.md` suffix, for display and the execute message. */
  relativePath: string
  title: string
  preview: string
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path)
}

function readStringField(input: unknown, keys: string[]): string | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const record = input as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }
  return null
}

/** The most recent `Plans/*.md` write in the transcript, or null. Title/preview
 *  come from the write's `content` when present (agents include it), else the
 *  filename. */
export function deriveLatestNativeChatPlan(
  messages: readonly NativeChatMessage[],
  worktreePath?: string
): NativeChatDetectedPlan | null {
  let latest: NativeChatDetectedPlan | null = null
  for (const message of messages) {
    for (const block of message.blocks) {
      if (!isToolCallBlock(block) || !WRITE_TOOL_NAMES.has(block.name)) {
        continue
      }
      const filePath = readStringField(block.input, ['file_path', 'path', 'filePath'])
      if (!filePath || !isNativeChatPlanFilePath(filePath, worktreePath)) {
        continue
      }
      const absolutePath =
        isAbsolutePath(filePath) || !worktreePath ? filePath : joinPath(worktreePath, filePath)
      const content = readStringField(block.input, ['content', 'file_text', 'new_str'])
      const { title, preview } = nativeChatPlanTitleAndPreview(
        content ?? '',
        basename(filePath).replace(/\.md$/i, '')
      )
      // Keep the LAST matching write so re-plans supersede earlier drafts.
      latest = {
        path: absolutePath,
        relativePath: nativeChatPlanRelativePath(filePath),
        title,
        preview
      }
    }
  }
  return latest
}
