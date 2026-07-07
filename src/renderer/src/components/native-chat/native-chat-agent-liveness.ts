// [FORK] Pure liveness classification for the native-chat dead-agent guard.
// Kept IO-free (shared imports only, no aliases) so it stays unit-testable —
// the probing/revival IO lives in native-chat-agent-revival.ts.

import { isExpectedAgentProcess } from '../../../../shared/agent-process-recognition'
import { isShellProcess } from '../../../../shared/shell-process-detection'

export type NativeChatAgentLiveness = 'alive' | 'dead' | 'unknown'

/**
 * Classify a foreground-process probe. Only a positively identified shell
 * prompt (or a childless, foreground-less pty) counts as 'dead' — interpreter
 * wrappers (node/python) and unknown names stay 'unknown' so a real send is
 * never blocked by a fuzzy probe.
 */
export function classifyNativeChatAgentForeground(args: {
  foregroundProcess: string | null
  hasChildProcesses: boolean
  expectedProcess: string
}): NativeChatAgentLiveness {
  const foreground = args.foregroundProcess ?? ''
  if (isExpectedAgentProcess(foreground, args.expectedProcess)) {
    return 'alive'
  }
  if (foreground && isShellProcess(foreground)) {
    return 'dead'
  }
  if (!foreground && !args.hasChildProcesses) {
    return 'dead'
  }
  return 'unknown'
}
