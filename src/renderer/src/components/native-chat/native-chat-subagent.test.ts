// [FORK] Sub-agent detection/parsing rules for the native chat.
import { describe, expect, it } from 'vitest'
import {
  extractSubagentAgentId,
  isBackgroundSubagentLaunchResult,
  isSubagentToolName,
  subagentLaunchFromInput,
  subagentTranscriptPath
} from './native-chat-subagent'

describe('isSubagentToolName', () => {
  it('matches the Claude launcher tools only', () => {
    expect(isSubagentToolName('Agent')).toBe(true)
    expect(isSubagentToolName('Task')).toBe(true)
    expect(isSubagentToolName('Bash')).toBe(false)
  })
})

describe('subagentLaunchFromInput', () => {
  it('prefers the description and keeps the agent type', () => {
    expect(
      subagentLaunchFromInput({
        description: 'Map tab system',
        subagent_type: 'Explore',
        prompt: 'Long prompt…'
      })
    ).toEqual({ description: 'Map tab system', subagentType: 'Explore' })
  })

  it('falls back to the prompt first line, then a generic label', () => {
    expect(subagentLaunchFromInput({ prompt: 'Find flaky tests\nDetails…' }).description).toBe(
      'Find flaky tests'
    )
    expect(subagentLaunchFromInput(null).description).toBe('Sub-agent')
  })
})

describe('agentId + transcript path', () => {
  const LAUNCH_ACK =
    'Async agent launched successfully.\nagentId: a6f2dda24db91094a (internal ID - do not mention)'

  it('extracts the agentId from the launch acknowledgement', () => {
    expect(extractSubagentAgentId(LAUNCH_ACK)).toBe('a6f2dda24db91094a')
    expect(extractSubagentAgentId('done, no id here')).toBeNull()
  })

  it('detects background launches', () => {
    expect(isBackgroundSubagentLaunchResult(LAUNCH_ACK)).toBe(true)
    expect(isBackgroundSubagentLaunchResult('Final report text')).toBe(false)
  })

  it('derives the side transcript path next to the parent session file', () => {
    expect(subagentTranscriptPath('/p/proj/sess-1.jsonl', 'abc123')).toBe(
      '/p/proj/sess-1/subagents/agent-abc123.jsonl'
    )
    expect(subagentTranscriptPath('/p/proj/not-a-transcript.txt', 'abc123')).toBeNull()
  })
})
