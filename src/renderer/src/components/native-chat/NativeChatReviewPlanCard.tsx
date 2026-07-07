// [FORK] Cursor-style "Review Plan" card docked above the composer once Plan mode
// produces a plan. Shows the plan title + preview, opens the full plan tab on
// click, and offers an amber Build button (with a model-picker chevron) to start
// executing the plan. Dismissible; reappears if a newer plan is written.

import { useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  NATIVE_CHAT_CLAUDE_MODELS,
  nativeChatModelLabel
} from '../../../../shared/native-chat-model-catalog'

const IS_MAC = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')
const BUILD_SHORTCUT_HINT = IS_MAC ? '⌘⏎' : 'Ctrl+↵'

export function NativeChatReviewPlanCard({
  title,
  preview,
  buildModelAlias,
  onSelectBuildModel,
  onOpen,
  onBuild,
  onDismiss
}: {
  title: string
  preview: string
  /** Model alias used when Build runs; shown in the chevron dropdown. */
  buildModelAlias: string
  onSelectBuildModel: (alias: string) => void
  onOpen: () => void
  onBuild: () => void
  onDismiss: () => void
}): React.JSX.Element {
  // Cmd/Ctrl+Enter builds while the card is visible (the button advertises the
  // chord). Capture phase so the composer's own Enter handling never races it.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const modifier = IS_MAC ? event.metaKey : event.ctrlKey
      if (event.key !== 'Enter' || !modifier || event.shiftKey || event.altKey) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      onBuild()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onBuild])

  return (
    <div className="mx-auto w-full max-w-xl px-3 pb-1 sm:px-4">
      <div className="rounded-lg border border-border bg-card p-2 shadow-sm">
        <div className="mb-0.5 flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">
            {translate('components.native-chat.plan.reviewTitle', 'Review Plan')}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={translate('components.native-chat.plan.dismiss', 'Dismiss plan')}
            className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-input/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="block w-full text-left focus-visible:outline-none"
        >
          <div className="text-[13px] font-semibold leading-snug text-card-foreground">{title}</div>
          {preview ? (
            <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {preview}
            </p>
          ) : null}
        </button>
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="truncate text-[11px] text-muted-foreground">
            {nativeChatModelLabel(buildModelAlias)}
          </span>
          <div className="inline-flex items-stretch overflow-hidden rounded-md">
            <Button
              type="button"
              size="sm"
              onClick={onBuild}
              className="h-6 gap-1 rounded-none rounded-l-md px-2 text-xs bg-warning text-warning-foreground hover:bg-warning/85"
            >
              {translate('components.native-chat.plan.build', 'Build')}
              <span className="text-[10px] text-warning-foreground/70">{BUILD_SHORTCUT_HINT}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  aria-label={translate('components.native-chat.plan.buildModel', 'Build model')}
                  className="h-6 rounded-none rounded-r-md border-l border-warning-foreground/20 bg-warning px-1 text-warning-foreground hover:bg-warning/85"
                >
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" sideOffset={6} className="w-44">
                {NATIVE_CHAT_CLAUDE_MODELS.map((model) => (
                  <DropdownMenuItem
                    key={model.alias}
                    onSelect={() => onSelectBuildModel(model.alias)}
                    className={cn(
                      'text-sm',
                      model.alias === buildModelAlias && 'font-medium text-foreground'
                    )}
                  >
                    {model.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  )
}
