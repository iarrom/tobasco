// [FORK] Cursor-style chrome for a plan document tab: replaces the standard
// editor header when the open file is a plan produced by the native chat.
// Breadcrumb (worktree › Plans › title) on the left; model picker, amber Build
// and an overflow menu on the right. Build tells the owning chat's agent to
// implement the saved plan (same message as the Review Plan card).

import { ChevronDown, ChevronRight, Ellipsis } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import { getSettingsForAgentTabRuntimeOwner } from '@/lib/agent-paste-draft'
import { notifyPlanBuilt, type PlanTabContext } from '@/lib/plan-tab-registry'
import { translate } from '@/i18n/i18n'
import {
  NATIVE_CHAT_CLAUDE_MODELS,
  nativeChatModelLabel
} from '../../../../shared/native-chat-model-catalog'
import { useNativeChatModelSelection } from '../native-chat/use-native-chat-model-selection'
import { buildNativeChatModelCommand } from '../native-chat/native-chat-model-command'
import { buildNativeChatPlanExecuteMessage } from '../native-chat/native-chat-plan-build'
import { sendNativeChatMessage } from '../native-chat/native-chat-runtime-send'

export function PlanTabHeader({
  context,
  filePath
}: {
  context: PlanTabContext
  filePath: string
}): React.JSX.Element {
  const worktreeName = useAppStore(
    (s) => findWorktreeById(s.worktreesByRepo, context.worktreeId)?.displayName ?? null
  )
  const mdViewMode = useAppStore((s) => s.markdownViewMode[filePath] ?? 'preview')
  const setMarkdownViewMode = useAppStore((s) => s.setMarkdownViewMode)
  const modelSelection = useNativeChatModelSelection(context.agent)
  const canSend = context.targetPtyId !== null

  const sendToAgent = (message: string): void => {
    if (!context.targetPtyId) {
      return
    }
    sendNativeChatMessage(
      getSettingsForAgentTabRuntimeOwner(context.terminalTabId),
      context.targetPtyId,
      message
    )
  }

  const handleSelectModel = (alias: string): void => {
    const next = modelSelection.update({ model: alias })
    sendToAgent(buildNativeChatModelCommand(alias, next.context))
  }

  const handleBuild = (): void => {
    // Leave plan mode (persisted), tell the agent to implement the plan, and let
    // the owning chat hide its Review Plan card.
    modelSelection.update({ planMode: false })
    sendToAgent(buildNativeChatPlanExecuteMessage(context.relativePath))
    notifyPlanBuilt(context.planPath)
  }

  const breadcrumb = [...(worktreeName ? [worktreeName] : []), 'Plans', context.title]

  return (
    <div className="editor-header">
      <div className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground">
        {breadcrumb.map((segment, index) => {
          const last = index === breadcrumb.length - 1
          return (
            <span key={`${segment}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? <ChevronRight className="size-3 shrink-0 opacity-60" /> : null}
              <span className={cn('truncate', last && 'text-foreground/90')}>{segment}</span>
            </span>
          )
        })}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!canSend}
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              aria-label={translate('components.native-chat.plan.buildModel', 'Build model')}
            >
              {nativeChatModelLabel(modelSelection.selection.model)}
              <ChevronDown className="size-3 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-44">
            {NATIVE_CHAT_CLAUDE_MODELS.map((model) => (
              <DropdownMenuItem
                key={model.alias}
                onSelect={() => handleSelectModel(model.alias)}
                className={cn(
                  'text-sm',
                  model.alias === modelSelection.selection.model && 'font-medium text-foreground'
                )}
              >
                {model.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          size="sm"
          disabled={!canSend}
          onClick={handleBuild}
          className="h-7 px-3 text-xs font-medium bg-warning text-warning-foreground hover:bg-warning/85"
        >
          {translate('components.native-chat.plan.build', 'Build')}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={translate('components.native-chat.plan.tab.menu', 'Plan menu')}
            >
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-44">
            <DropdownMenuItem
              onSelect={() =>
                setMarkdownViewMode(filePath, mdViewMode === 'preview' ? 'source' : 'preview')
              }
            >
              {mdViewMode === 'preview'
                ? translate('components.native-chat.plan.tab.editSource', 'Edit source')
                : translate('components.native-chat.plan.tab.viewRendered', 'View rendered')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void window.api.ui.writeClipboardText(filePath)}>
              {translate('components.native-chat.plan.tab.copyPath', 'Copy path')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
