// [FORK] Discovers skills for the composer "+" menu. Unlike the codex-only
// `$`-autocomplete (use-native-chat-skills), this surfaces skills for whichever
// agent owns the pane so the menu is populated for Claude too. Discovery is
// scoped to the pane's worktree cwd.

import { useEffect, useState } from 'react'
import { useAppStore } from '../../store'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { DiscoveredSkill, SkillProvider } from '../../../../shared/skills'
import { resolveNativeChatSkillDiscoveryCwd } from './use-native-chat-skills'

function providersForAgent(agent: AgentType): SkillProvider[] {
  // Every agent can use generic agent-skills; each also sees its own provider's.
  if (agent === 'codex') {
    return ['codex', 'agent-skills']
  }
  if (agent === 'claude') {
    return ['claude', 'agent-skills']
  }
  return ['agent-skills']
}

export function useNativeChatAddMenuSkills(
  agent: AgentType,
  terminalTabId: string,
  enabled: boolean
): DiscoveredSkill[] {
  const [skills, setSkills] = useState<DiscoveredSkill[]>([])
  const cwd = useAppStore((state) => resolveNativeChatSkillDiscoveryCwd(state, terminalTabId))

  useEffect(() => {
    if (!enabled) {
      return
    }
    let cancelled = false
    const allowed = new Set(providersForAgent(agent))
    void window.api.skills
      .discover(cwd ? { cwd } : undefined)
      .then((result) => {
        if (cancelled) {
          return
        }
        setSkills(
          result.skills.filter((skill) => skill.providers.some((provider) => allowed.has(provider)))
        )
      })
      .catch(() => {
        if (!cancelled) {
          setSkills([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [agent, cwd, enabled])

  return skills
}
