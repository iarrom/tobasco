// [FORK] Liveness classification for the native-chat dead-agent guard: the
// probe must fail open (unknown) on anything but a positively identified dead
// pane, or healthy sends would get blocked behind a revival that isn't needed.

import { describe, it, expect } from 'vitest'
import { classifyNativeChatAgentForeground } from './native-chat-agent-liveness'

describe('classifyNativeChatAgentForeground', () => {
  it('reports alive when the expected agent owns the foreground', () => {
    expect(
      classifyNativeChatAgentForeground({
        foregroundProcess: 'claude',
        hasChildProcesses: true,
        expectedProcess: 'claude'
      })
    ).toBe('alive')
  })

  it('matches the expected process case-insensitively and by basename', () => {
    expect(
      classifyNativeChatAgentForeground({
        foregroundProcess: '/usr/local/bin/Claude',
        hasChildProcesses: true,
        expectedProcess: 'claude'
      })
    ).toBe('alive')
  })

  it('reports dead when the shell prompt owns the foreground', () => {
    for (const shell of ['zsh', 'bash', 'fish']) {
      expect(
        classifyNativeChatAgentForeground({
          foregroundProcess: shell,
          hasChildProcesses: false,
          expectedProcess: 'claude'
        })
      ).toBe('dead')
    }
  })

  it('reports dead for a foreground-less pty with no children', () => {
    expect(
      classifyNativeChatAgentForeground({
        foregroundProcess: null,
        hasChildProcesses: false,
        expectedProcess: 'claude'
      })
    ).toBe('dead')
  })

  it('stays unknown for interpreter wrappers so sends fail open', () => {
    expect(
      classifyNativeChatAgentForeground({
        foregroundProcess: 'node',
        hasChildProcesses: true,
        expectedProcess: 'codex'
      })
    ).toBe('unknown')
  })

  it('stays unknown for an unrecognized foreground process', () => {
    expect(
      classifyNativeChatAgentForeground({
        foregroundProcess: 'vim',
        hasChildProcesses: false,
        expectedProcess: 'claude'
      })
    ).toBe('unknown')
  })

  it('stays unknown when the foreground is missing but children exist', () => {
    expect(
      classifyNativeChatAgentForeground({
        foregroundProcess: null,
        hasChildProcesses: true,
        expectedProcess: 'claude'
      })
    ).toBe('unknown')
  })
})
