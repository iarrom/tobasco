// [FORK] Dead-agent guard for native-chat sends. After host sleep (or an agent
// crash) the CLI can exit while its shell and pane survive; the chat's blind
// pty write would then execute the message as a shell command. Before each
// send we inspect the pane's foreground process — when the agent is gone we
// relaunch it with its provider resume command in the same shell and deliver
// only once the resumed agent owns the foreground again.

import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import {
  inspectRuntimeTerminalProcess,
  isRemoteRuntimePtyId,
  sendRuntimePtyInput
} from '@/runtime/runtime-terminal-inspection'
import { buildAgentResumeStartupPlan } from '@/lib/tui-agent-startup'
import { getResumeLaunchPlatform } from '@/lib/resume-sleeping-agent-session'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import { isExpectedAgentProcess } from '../../../../shared/agent-process-recognition'
import { TUI_AGENT_CONFIG } from '../../../../shared/tui-agent-config'
import {
  isResumableTuiAgent,
  type AgentProviderSessionMetadata
} from '../../../../shared/agent-session-resume'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../../shared/tui-agent-launch-defaults'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import type { TuiAgent } from '../../../../shared/types'
import type { NativeChatResolvedTarget } from './native-chat-composer-target'
import {
  classifyNativeChatAgentForeground,
  type NativeChatAgentLiveness
} from './native-chat-agent-liveness'

// Why: the liveness probe sits on every send — it must never make a healthy
// send feel slow, so an unresponsive inspection fails open as 'unknown'.
const LIVENESS_PROBE_TIMEOUT_MS = 4000
const RESUME_READY_TIMEOUT_MS = 15_000
const RESUME_POLL_INTERVAL_MS = 250
// Why: foreground match means the binary started, not that its TUI accepts a
// bracketed paste yet; pasting into a half-booted TUI garbles the frame.
const RESUME_PASTE_SETTLE_MS = 750

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return await Promise.race([
    promise,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms))
  ])
}

function getTuiAgentConfig(agent: string): (typeof TUI_AGENT_CONFIG)[TuiAgent] | null {
  return Object.prototype.hasOwnProperty.call(TUI_AGENT_CONFIG, agent)
    ? TUI_AGENT_CONFIG[agent as TuiAgent]
    : null
}

/** Probe whether the pane's agent CLI still owns the terminal foreground. */
export async function checkNativeChatAgentLiveness(
  target: NativeChatResolvedTarget,
  agent: string
): Promise<NativeChatAgentLiveness> {
  const config = getTuiAgentConfig(agent)
  if (!config) {
    return 'unknown'
  }
  try {
    const inspection = await withTimeout(
      inspectRuntimeTerminalProcess(target.settings, target.ptyId),
      LIVENESS_PROBE_TIMEOUT_MS
    )
    if (!inspection) {
      return 'unknown'
    }
    return classifyNativeChatAgentForeground({
      foregroundProcess: inspection.foregroundProcess,
      hasChildProcesses: inspection.hasChildProcesses,
      expectedProcess: config.expectedProcess
    })
  } catch {
    return 'unknown'
  }
}

function findPaneForPtyId(
  state: AppState,
  ptyId: string
): { tabId: string; paneKey: string } | null {
  for (const [tabId, layout] of Object.entries(state.terminalLayoutsByTabId)) {
    for (const [leafId, leafPtyId] of Object.entries(layout?.ptyIdsByLeafId ?? {})) {
      if (leafPtyId === ptyId) {
        return { tabId, paneKey: makePaneKey(tabId, leafId) }
      }
    }
  }
  return null
}

/** Provider-session lookup for a pane, exported for tests. Live agent status
 *  wins; the persisted sleeping record covers the cold-start case — agent
 *  status is renderer memory only, so after an app relaunch the record is the
 *  sole surviving source of the resume session id. */
export function findAgentProviderSessionForPane(
  state: Pick<AppState, 'agentStatusByPaneKey' | 'sleepingAgentSessionsByPaneKey'>,
  pane: { tabId: string; paneKey: string },
  agent: string
): AgentProviderSessionMetadata | null {
  const direct = state.agentStatusByPaneKey[pane.paneKey]?.providerSession
  if (direct) {
    return direct
  }
  // Why: layout leaves can be recreated (split/reload) while the hook entry
  // keeps the original paneKey — fall back to any entry on the same tab.
  for (const entry of Object.values(state.agentStatusByPaneKey)) {
    const entryTabId = entry.tabId ?? entry.paneKey.split(':')[0]
    if (entryTabId === pane.tabId && entry.agentType === agent && entry.providerSession) {
      return entry.providerSession
    }
  }
  const sleepingDirect = state.sleepingAgentSessionsByPaneKey[pane.paneKey]
  if (sleepingDirect && sleepingDirect.agent === agent) {
    return sleepingDirect.providerSession
  }
  for (const [paneKey, record] of Object.entries(state.sleepingAgentSessionsByPaneKey)) {
    const recordTabId = record.tabId ?? paneKey.split(':')[0]
    if (recordTabId === pane.tabId && record.agent === agent) {
      return record.providerSession
    }
  }
  return null
}

function findWorktreeIdForTab(state: AppState, tabId: string): string | null {
  for (const [worktreeId, tabs] of Object.entries(state.tabsByWorktree)) {
    if (tabs.some((tab) => tab.id === tabId)) {
      return worktreeId
    }
  }
  return null
}

async function waitForResumedAgentForeground(
  target: NativeChatResolvedTarget,
  expectedProcess: string
): Promise<boolean> {
  // Why: not agent-ready-wait's waitForAgentReady — its terminal-title
  // heuristic can report the DEAD agent's stale idle title as "ready" and
  // release the paste into a shell that is still launching the resume.
  const deadline = Date.now() + RESUME_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(RESUME_POLL_INTERVAL_MS)
    try {
      const inspection = await inspectRuntimeTerminalProcess(target.settings, target.ptyId)
      if (isExpectedAgentProcess(inspection.foregroundProcess ?? '', expectedProcess)) {
        await sleep(RESUME_PASTE_SETTLE_MS)
        return true
      }
    } catch {
      // Transient inspection errors — keep polling until the deadline.
    }
  }
  return false
}

async function runNativeChatAgentRevival(
  target: NativeChatResolvedTarget,
  agent: string
): Promise<boolean> {
  if (!isResumableTuiAgent(agent)) {
    return false
  }
  const state = useAppStore.getState()
  const pane = findPaneForPtyId(state, target.ptyId)
  if (!pane) {
    return false
  }
  const providerSession = findAgentProviderSessionForPane(state, pane, agent)
  if (!providerSession) {
    return false
  }
  const worktreeId = findWorktreeIdForTab(state, pane.tabId)
  const plan = buildAgentResumeStartupPlan({
    agent,
    providerSession,
    cmdOverrides: state.settings?.agentCmdOverrides ?? {},
    agentArgs: resolveTuiAgentLaunchArgs(agent, state.settings?.agentDefaultArgs),
    agentEnv: resolveTuiAgentLaunchEnv(agent, state.settings?.agentDefaultEnv),
    platform: worktreeId ? getResumeLaunchPlatform(worktreeId) : CLIENT_PLATFORM,
    isRemote: isRemoteRuntimePtyId(target.ptyId)
  })
  if (!plan) {
    return false
  }
  // The pane's shell survived (that's how death was detected), so the resume
  // command runs in it directly; the original launch env still lives in the
  // shell's environment, so plan.env is intentionally not re-applied.
  sendRuntimePtyInput(target.settings, target.ptyId, `${plan.launchCommand}\r`)
  return await waitForResumedAgentForeground(target, plan.expectedProcess)
}

const revivalsByPtyId = new Map<string, Promise<boolean>>()

/** Relaunch a dead agent in its own pane via the provider resume command.
 *  Concurrent callers for the same pty share one revival attempt. */
export function reviveNativeChatAgent(
  target: NativeChatResolvedTarget,
  agent: string
): Promise<boolean> {
  const existing = revivalsByPtyId.get(target.ptyId)
  if (existing) {
    return existing
  }
  const revival = runNativeChatAgentRevival(target, agent)
    .catch(() => false)
    .finally(() => {
      revivalsByPtyId.delete(target.ptyId)
    })
  revivalsByPtyId.set(target.ptyId, revival)
  return revival
}

/**
 * Run a native-chat pty send behind the liveness guard: alive/unknown sends
 * immediately; a dead agent is revived first and `perform` runs only once the
 * resumed CLI owns the foreground, so the message can't leak into the shell.
 */
export function sendNativeChatWithAgentGuard(args: {
  target: NativeChatResolvedTarget
  agent: string
  perform: () => void
}): void {
  const { target, agent, perform } = args
  void (async () => {
    const liveness = await checkNativeChatAgentLiveness(target, agent)
    if (liveness !== 'dead') {
      perform()
      return
    }
    const revived = await reviveNativeChatAgent(target, agent)
    if (revived) {
      perform()
      return
    }
    toast.error(
      translate(
        'components.native-chat.revival.failed',
        'The agent exited and its session could not be resumed — relaunch it in the terminal.'
      )
    )
  })()
}
