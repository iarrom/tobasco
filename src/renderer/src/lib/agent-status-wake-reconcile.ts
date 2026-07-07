// [FORK] After host sleep an agent CLI can die while its shell and pane
// survive. No pty:exit fires (the shell lives on), so the hook-reported
// status — often 'working' — sticks forever and the UI keeps claiming the
// agent is busy. On window wake we probe each live status entry's pane and
// flip positively-dead agents to done+interrupted, preserving providerSession
// so the native-chat dead-agent guard can still resume the session on demand.

import { useAppStore } from '@/store'
import { inspectRuntimeTerminalProcess } from '@/runtime/runtime-terminal-inspection'
import { classifyNativeChatAgentForeground } from '@/components/native-chat/native-chat-agent-liveness'
import { TUI_AGENT_CONFIG } from '../../../shared/tui-agent-config'
import type { TuiAgent } from '../../../shared/types'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'

// Why: wake recovery fires on every window focus/visibility flip; probing the
// process table each time would be wasteful. One sweep per window is enough —
// a dead agent stays dead until something relaunches it.
const RECONCILE_MIN_INTERVAL_MS = 30_000

let lastSweepAt = 0
let sweepInFlight = false

function getExpectedProcess(agentType: string | undefined): string | null {
  if (!agentType || !Object.prototype.hasOwnProperty.call(TUI_AGENT_CONFIG, agentType)) {
    return null
  }
  return TUI_AGENT_CONFIG[agentType as TuiAgent].expectedProcess
}

function resolvePtyIdForPaneKey(paneKey: string): string | null {
  const separatorIndex = paneKey.indexOf(':')
  if (separatorIndex === -1) {
    return null
  }
  const tabId = paneKey.slice(0, separatorIndex)
  const leafId = paneKey.slice(separatorIndex + 1)
  const layout = useAppStore.getState().terminalLayoutsByTabId[tabId]
  return layout?.ptyIdsByLeafId?.[leafId] ?? null
}

function markAgentStatusExited(paneKey: string, entry: AgentStatusEntry): void {
  const now = Date.now()
  useAppStore.getState().setAgentStatus(
    paneKey,
    {
      state: 'done',
      prompt: entry.prompt,
      agentType: entry.agentType,
      lastAssistantMessage: entry.lastAssistantMessage,
      interrupted: true
    },
    entry.terminalTitle,
    { updatedAt: now, stateStartedAt: now },
    {
      tabId: entry.tabId,
      worktreeId: entry.worktreeId,
      terminalHandle: entry.terminalHandle
    },
    // Why: a 'done' transition drops providerSession unless metadata re-supplies
    // it; the resume path needs the id to revive this exact session later.
    entry.providerSession ? { providerSession: entry.providerSession } : undefined
  )
}

async function sweepAgentStatuses(): Promise<void> {
  const state = useAppStore.getState()
  const entries = Object.entries(state.agentStatusByPaneKey).filter(
    ([, entry]) => entry.state !== 'done'
  )
  for (const [paneKey, entry] of entries) {
    const expectedProcess = getExpectedProcess(entry.agentType)
    if (!expectedProcess) {
      continue
    }
    const ptyId = resolvePtyIdForPaneKey(paneKey)
    if (!ptyId) {
      continue
    }
    try {
      const inspection = await inspectRuntimeTerminalProcess(state.settings, ptyId)
      const liveness = classifyNativeChatAgentForeground({
        foregroundProcess: inspection.foregroundProcess,
        hasChildProcesses: inspection.hasChildProcesses,
        expectedProcess
      })
      if (liveness !== 'dead') {
        continue
      }
      const current = useAppStore.getState().agentStatusByPaneKey[paneKey]
      // Why: skip when a fresh hook event landed mid-probe — the agent spoke,
      // so it is not dead, whatever the (older) inspection said.
      if (!current || current.updatedAt !== entry.updatedAt || current.state === 'done') {
        continue
      }
      markAgentStatusExited(paneKey, current)
    } catch {
      // Inconclusive probe (pty torn down mid-sweep, transient RPC error) —
      // leave the entry alone; the next wake sweep will retry.
    }
  }
}

/** Probe live agent-status panes after window wake and clear statuses whose
 *  agent process died (e.g. across host sleep). Throttled and re-entrancy-safe;
 *  safe to call from every focus/visibility recovery pass. */
export function reconcileAgentStatusesAfterWake(): void {
  const now = Date.now()
  if (sweepInFlight || now - lastSweepAt < RECONCILE_MIN_INTERVAL_MS) {
    return
  }
  lastSweepAt = now
  sweepInFlight = true
  void sweepAgentStatuses().finally(() => {
    sweepInFlight = false
  })
}
