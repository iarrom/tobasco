import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session-resume'

/** Pick the live agent-status entry for this tab. A tab's panes are keyed
 *  `${tabId}:${leafId}`; the single active agent pane is the one whose paneKey
 *  carries this tab id. (Split-aware resolution refines per-leaf in U8/U9; the
 *  view today resolves the tab's agent pane.)
 *
 *  Lives in its own module so the #19 selector (`useShallow(findTabAgentEntry)`)
 *  is unit-testable without importing the store-coupled view component. */
export function findTabAgentEntry(
  agentStatusByPaneKey: Record<string, AgentStatusEntry>,
  terminalTabId: string
): AgentStatusEntry | undefined {
  const prefix = `${terminalTabId}:`
  for (const [paneKey, entry] of Object.entries(agentStatusByPaneKey)) {
    if (paneKey.startsWith(prefix)) {
      return entry
    }
  }
  return undefined
}

/** [FORK] The tab's persisted sleeping-session record, when one exists. Agent
 *  status is renderer memory only, so after an app relaunch this record is the
 *  sole source of the session id/transcript path until the resumed agent's
 *  hooks report again — it lets the chat render history instead of a blank
 *  pane while (or in case) the in-place resume boots. */
export function findTabSleepingAgentSession(
  sleepingAgentSessionsByPaneKey: Record<string, SleepingAgentSessionRecord>,
  terminalTabId: string
): SleepingAgentSessionRecord | undefined {
  const prefix = `${terminalTabId}:`
  for (const [paneKey, record] of Object.entries(sleepingAgentSessionsByPaneKey)) {
    if (paneKey.startsWith(prefix) || record.tabId === terminalTabId) {
      return record
    }
  }
  return undefined
}
