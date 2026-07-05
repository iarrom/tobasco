// [FORK] Renders saved quick commands (run on select) plus an "Add quick
// command…" entry inside the "+" new-tab menu. Editing/deleting existing
// commands lives in Settings › Quick Commands; this section is the fast
// run + create surface that previously sat in the tab-bar action cluster.
import React from 'react'
import { Play, Plus } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { TabBarQuickCommandsController } from './use-tab-bar-quick-commands'

type TabBarQuickCommandsMenuItemsProps = {
  controller: TabBarQuickCommandsController
  /** Focus the terminal tab created by a run (local runtime). */
  onFocusTerminal: (tabId: string) => void
  /** Focus the next active terminal when the run tab id is host-assigned. */
  onFocusNewActiveTerminal: () => void
}

function TabBarQuickCommandsMenuItemsInner({
  controller,
  onFocusTerminal,
  onFocusNewActiveTerminal
}: TabBarQuickCommandsMenuItemsProps): React.JSX.Element {
  const { commands, runCommand, addCommand } = controller
  const runAndFocus = (command: (typeof commands)[number]): void => {
    const result = runCommand(command)
    if (result?.tabId) {
      onFocusTerminal(result.tabId)
    } else {
      onFocusNewActiveTerminal()
    }
  }
  return (
    <>
      {commands.map((command) => (
        <DropdownMenuItem
          key={command.id}
          onSelect={() => runAndFocus(command)}
          className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
          title={translate(
            'auto.components.tab.bar.TabBarQuickCommandsButton.b775303755',
            'Run quick command: {{value0}}',
            { value0: command.label }
          )}
        >
          <Play className="size-3.5 shrink-0" fill="currentColor" strokeWidth={0} />
          <span className="flex-1 truncate">{command.label}</span>
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem
        onSelect={addCommand}
        className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium text-muted-foreground"
      >
        <Plus className="size-4" />
        {translate(
          'auto.components.tab.bar.TabBarQuickCommandsButton.a2c7a33831',
          'Add Quick Command…'
        )}
      </DropdownMenuItem>
    </>
  )
}

export const TabBarQuickCommandsMenuItems = React.memo(TabBarQuickCommandsMenuItemsInner)
