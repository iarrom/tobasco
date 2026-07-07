// [FORK] Provider-session lookup used by the dead-agent send guard. The
// sleeping-record fallback is what makes the guard work across a full app
// restart: agent status is renderer memory, so the persisted record is the
// only surviving source of the resume session id.
import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session-resume'
import { findAgentProviderSessionForPane } from './native-chat-agent-revival'

const pane = { tabId: 'tab-1', paneKey: 'tab-1:leaf-1' }

function entry(
  overrides: Partial<AgentStatusEntry> & Pick<AgentStatusEntry, 'paneKey'>
): AgentStatusEntry {
  return {
    state: 'working',
    prompt: '',
    updatedAt: 0,
    stateStartedAt: 0,
    stateHistory: [],
    agentType: 'claude',
    ...overrides
  }
}

function record(
  overrides: Partial<SleepingAgentSessionRecord> & Pick<SleepingAgentSessionRecord, 'paneKey'>
): SleepingAgentSessionRecord {
  return {
    worktreeId: 'wt-1',
    agent: 'claude',
    providerSession: { key: 'session_id', id: 'sess-sleeping' },
    prompt: '',
    state: 'done',
    capturedAt: 0,
    updatedAt: 0,
    ...overrides
  }
}

describe('findAgentProviderSessionForPane', () => {
  it('prefers the live entry over the sleeping record', () => {
    expect(
      findAgentProviderSessionForPane(
        {
          agentStatusByPaneKey: {
            'tab-1:leaf-1': entry({
              paneKey: 'tab-1:leaf-1',
              providerSession: { key: 'session_id', id: 'sess-live' }
            })
          },
          sleepingAgentSessionsByPaneKey: { 'tab-1:leaf-1': record({ paneKey: 'tab-1:leaf-1' }) }
        },
        pane,
        'claude'
      )
    ).toEqual({ key: 'session_id', id: 'sess-live' })
  })

  it('falls back to the pane sleeping record after a cold start', () => {
    expect(
      findAgentProviderSessionForPane(
        {
          agentStatusByPaneKey: {},
          sleepingAgentSessionsByPaneKey: { 'tab-1:leaf-1': record({ paneKey: 'tab-1:leaf-1' }) }
        },
        pane,
        'claude'
      )
    ).toEqual({ key: 'session_id', id: 'sess-sleeping' })
  })

  it('falls back to a same-tab sleeping record when the leaf was recreated', () => {
    expect(
      findAgentProviderSessionForPane(
        {
          agentStatusByPaneKey: {},
          sleepingAgentSessionsByPaneKey: {
            'tab-1:leaf-old': record({ paneKey: 'tab-1:leaf-old', tabId: 'tab-1' })
          }
        },
        pane,
        'claude'
      )
    ).toEqual({ key: 'session_id', id: 'sess-sleeping' })
  })

  it('ignores sleeping records for another agent or another tab', () => {
    expect(
      findAgentProviderSessionForPane(
        {
          agentStatusByPaneKey: {},
          sleepingAgentSessionsByPaneKey: {
            'tab-1:leaf-1': record({ paneKey: 'tab-1:leaf-1', agent: 'codex' }),
            'tab-2:leaf-1': record({ paneKey: 'tab-2:leaf-1', tabId: 'tab-2' })
          }
        },
        pane,
        'claude'
      )
    ).toBeNull()
  })
})
