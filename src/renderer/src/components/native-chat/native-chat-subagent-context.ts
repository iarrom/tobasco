// [FORK] Lets deeply-nested tool steps resolve a sub-agent's side transcript
// without prop-drilling: the chat view provides its agent + transcript path,
// the sub-agent step derives `<session>/subagents/agent-<id>.jsonl` from it.

import { createContext } from 'react'
import type { AgentType } from '../../../../shared/agent-status-types'

export type NativeChatSubagentContextValue = {
  agent: AgentType
  parentTranscriptPath: string | null
}

export const NativeChatSubagentContext = createContext<NativeChatSubagentContextValue>({
  agent: 'claude',
  parentTranscriptPath: null
})
