// [FORK] Sub-agent (Task/Agent tool) detection for the native chat: identifies
// launcher tool calls, extracts the launch description and the agentId from the
// launch result, and resolves the side transcript Claude Code writes under
// `<sessionId>/subagents/agent-<agentId>.jsonl`. Pure so the parsing rules stay
// unit-testable.

const SUBAGENT_TOOL_NAMES = new Set(['Agent', 'Task'])

export function isSubagentToolName(name: string): boolean {
  return SUBAGENT_TOOL_NAMES.has(name)
}

export type SubagentLaunch = {
  /** Short human description of the sub-agent's task (the one-line label). */
  description: string
  subagentType: string | null
}

export function subagentLaunchFromInput(input: unknown): SubagentLaunch {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  const subagentType =
    typeof record.subagent_type === 'string' && record.subagent_type.trim().length > 0
      ? record.subagent_type.trim()
      : null
  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : ''
  return {
    description: description || prompt.split('\n')[0]?.slice(0, 120) || 'Sub-agent',
    subagentType
  }
}

/** The launcher result echoes `agentId: <id>` for async/background launches. */
export function extractSubagentAgentId(resultOutput: string): string | null {
  const match = resultOutput.match(/agentId:\s*([A-Za-z0-9_-]{6,})/)
  return match ? match[1] : null
}

/** True when the result is the async-launch acknowledgement — the sub-agent is
 *  still working in the background after this result lands. */
export function isBackgroundSubagentLaunchResult(resultOutput: string): boolean {
  return /agent launched successfully/i.test(resultOutput)
}

/** `<projectDir>/<sessionId>.jsonl` → `<projectDir>/<sessionId>/subagents/agent-<id>.jsonl` */
export function subagentTranscriptPath(
  parentTranscriptPath: string,
  agentId: string
): string | null {
  if (!/\.jsonl$/i.test(parentTranscriptPath)) {
    return null
  }
  const base = parentTranscriptPath.replace(/\.jsonl$/i, '')
  // Preserve the parent path's separator style (Windows transcripts use `\`).
  const sep = parentTranscriptPath.includes('\\') ? '\\' : '/'
  return `${base}${sep}subagents${sep}agent-${agentId}.jsonl`
}
