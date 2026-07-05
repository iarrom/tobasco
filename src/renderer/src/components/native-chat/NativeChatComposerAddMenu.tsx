// [FORK] Cursor-style "+" menu for the composer. Replaces the bare attach button
// with a dropdown: Image (pick a file), Skills (discovered, insert a reference),
// and MCP Servers (configured servers for the worktree). Built to grow — Plan /
// Debug / model modes slot in later as sibling items/submenus.

import { useState } from 'react'
import { BookOpen, Check, Image as ImageIcon, ListChecks, Plus, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { AgentType } from '../../../../shared/agent-status-types'
import { useNativeChatAddMenuSkills } from './use-native-chat-add-menu-skills'
import { useNativeChatMcpServers } from './use-native-chat-mcp-servers'

export type NativeChatComposerAddMenuProps = {
  agent: AgentType
  terminalTabId: string
  disabled: boolean
  /** Whether the pane runs locally — MCP config is only read for local sessions. */
  localSession: boolean
  onAttachImage: () => void
  onInsertSkill: (skillName: string) => void
  /** [FORK] Plan mode lives in this menu (Claude-only). Undefined hides the row. */
  planMode?: boolean
  onTogglePlanMode?: () => void
}

function EmptyRow({ label }: { label: string }): React.JSX.Element {
  return <div className="px-2 py-1.5 text-xs text-muted-foreground">{label}</div>
}

export function NativeChatComposerAddMenu({
  agent,
  terminalTabId,
  disabled,
  localSession,
  onAttachImage,
  onInsertSkill,
  planMode = false,
  onTogglePlanMode
}: NativeChatComposerAddMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const skills = useNativeChatAddMenuSkills(agent, terminalTabId, open)
  const mcpServers = useNativeChatMcpServers(terminalTabId, open && localSession)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          disabled={disabled}
          aria-label={translate('components.native-chat.composer.addMenu.trigger', 'Add context')}
          className="size-7 rounded-full bg-accent text-accent-foreground hover:bg-accent/80 pointer-coarse:size-11"
        >
          <Plus className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-56">
        <DropdownMenuItem onSelect={onAttachImage} className="gap-2">
          <ImageIcon className="size-4 text-muted-foreground" />
          {translate('components.native-chat.composer.addMenu.image', 'Image')}
        </DropdownMenuItem>
        {onTogglePlanMode ? (
          // Toggle-style row: closing the menu on select is fine; the amber
          // indicator under the composer reflects the on-state.
          <DropdownMenuItem
            onSelect={onTogglePlanMode}
            className={cn('gap-2', planMode && 'text-warning focus:text-warning')}
          >
            <ListChecks
              className={cn('size-4', planMode ? 'text-warning' : 'text-muted-foreground')}
            />
            <span className="flex-1">
              {translate('components.native-chat.composer.planMode.enable', 'Plan')}
            </span>
            {planMode ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            {translate('components.native-chat.composer.addMenu.skills', 'Skills')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="scrollbar-sleek max-h-72 w-60 overflow-y-auto">
            {skills.length === 0 ? (
              <EmptyRow
                label={translate(
                  'components.native-chat.composer.addMenu.noSkills',
                  'No skills found'
                )}
              />
            ) : (
              skills.map((skill) => (
                <DropdownMenuItem
                  key={skill.id}
                  onSelect={() => onInsertSkill(skill.name)}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="truncate font-medium">{skill.name}</span>
                  {skill.description ? (
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {skill.description}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <Server className="size-4 text-muted-foreground" />
            {translate('components.native-chat.composer.addMenu.mcpServers', 'MCP Servers')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="scrollbar-sleek max-h-72 w-60 overflow-y-auto">
            {mcpServers.length === 0 ? (
              <EmptyRow
                label={translate(
                  'components.native-chat.composer.addMenu.noMcpServers',
                  'No MCP servers configured'
                )}
              />
            ) : (
              mcpServers.map((server) => (
                // Read-only for now: Claude Code has no per-message MCP toggle.
                <div
                  key={server.name}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm"
                  title={server.issue ?? server.command ?? server.url}
                >
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      server.status === 'enabled' ? 'bg-primary' : 'bg-muted-foreground/40'
                    )}
                  />
                  <span className="truncate">{server.name}</span>
                </div>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
