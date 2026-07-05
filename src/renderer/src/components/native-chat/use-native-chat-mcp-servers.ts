// [FORK] Lists MCP servers configured for the pane's worktree, for the composer
// "+" menu. There is no runtime MCP API, so this reuses the settings-side config
// inspection (reads .mcp.json / agent config candidates off disk) and flattens
// the discovered servers. Local sessions only; fetched lazily when the menu opens.

import { useEffect, useState } from 'react'
import { useAppStore } from '../../store'
import type { McpServerSummary } from '../../../../shared/mcp-config'
import { loadMcpConfigInspections } from '../settings/mcp-config-inspection'
import { resolveNativeChatSkillDiscoveryCwd } from './use-native-chat-skills'

export function useNativeChatMcpServers(
  terminalTabId: string,
  enabled: boolean
): McpServerSummary[] {
  const [servers, setServers] = useState<McpServerSummary[]>([])
  const cwd = useAppStore((state) => resolveNativeChatSkillDiscoveryCwd(state, terminalTabId))

  useEffect(() => {
    if (!enabled || !cwd) {
      return
    }
    let cancelled = false
    loadMcpConfigInspections(cwd, undefined)
      .then((inspections) => {
        if (cancelled) {
          return
        }
        // Dedupe by name across config files; a later (project) config wins.
        const byName = new Map<string, McpServerSummary>()
        for (const inspection of inspections) {
          if (!inspection.exists) {
            continue
          }
          for (const server of inspection.servers) {
            byName.set(server.name, server)
          }
        }
        setServers([...byName.values()])
      })
      .catch(() => {
        if (!cancelled) {
          setServers([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [cwd, enabled])

  return servers
}
