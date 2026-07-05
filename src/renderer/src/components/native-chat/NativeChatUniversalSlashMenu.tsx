// [FORK] Cursor-style universal `/` menu: one popover with Skills, Commands and
// Modes sections, filtered live as the query is typed. Rows share a single flat
// keyboard index with the composer (ArrowUp/Down + Enter/Tab).

import { useEffect, useRef } from 'react'
import { ListChecks, Sparkles, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { UniversalSlashItem } from './native-chat-composer-state'

function itemKey(item: UniversalSlashItem): string {
  if (item.kind === 'skill') {
    return `skill:${item.skill.id}`
  }
  if (item.kind === 'command') {
    return `command:${item.command.name}`
  }
  return `mode:${item.mode.id}`
}

function sectionLabel(kind: UniversalSlashItem['kind']): string {
  if (kind === 'skill') {
    return translate('components.native-chat.slash.skills', 'Skills')
  }
  if (kind === 'command') {
    return translate('components.native-chat.slash.commands', 'Commands')
  }
  return translate('components.native-chat.slash.modes', 'Modes')
}

function ItemIcon({ item }: { item: UniversalSlashItem }): React.JSX.Element {
  if (item.kind === 'skill') {
    return <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
  }
  if (item.kind === 'command') {
    return <Zap className="size-3.5 shrink-0 text-muted-foreground" />
  }
  return (
    <ListChecks
      className={cn(
        'size-3.5 shrink-0',
        item.mode.active ? 'text-warning' : 'text-muted-foreground'
      )}
    />
  )
}

function itemTitle(item: UniversalSlashItem): string {
  if (item.kind === 'skill') {
    return item.skill.name
  }
  if (item.kind === 'command') {
    return `/${item.command.name}`
  }
  return item.mode.label
}

function itemDescription(item: UniversalSlashItem): string | undefined {
  if (item.kind === 'skill') {
    return item.skill.description ?? undefined
  }
  if (item.kind === 'command') {
    return item.command.description
  }
  return item.mode.description
}

export function NativeChatUniversalSlashMenu({
  items,
  activeIndex,
  onChoose
}: {
  items: readonly UniversalSlashItem[]
  activeIndex: number
  onChoose: (item: UniversalSlashItem) => void
}): React.JSX.Element {
  const activeItemRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, items])

  return (
    <div className="scrollbar-sleek absolute bottom-full left-0 right-0 mb-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md">
      {items.map((item, index) => {
        const firstOfSection = index === 0 || items[index - 1].kind !== item.kind
        const description = itemDescription(item)
        return (
          <div key={itemKey(item)}>
            {firstOfSection ? (
              <div className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium text-muted-foreground first:pt-0.5">
                {sectionLabel(item.kind)}
              </div>
            ) : null}
            <button
              ref={index === activeIndex ? activeItemRef : null}
              type="button"
              onClick={() => onChoose(item)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                index === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground'
              )}
            >
              <ItemIcon item={item} />
              <span className="shrink-0 font-medium">{itemTitle(item)}</span>
              {item.kind === 'mode' && item.mode.active ? (
                <span className="shrink-0 text-[11px] text-warning">
                  {translate('components.native-chat.slash.modeOn', 'on')}
                </span>
              ) : null}
              {description ? (
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {description}
                </span>
              ) : null}
            </button>
          </div>
        )
      })}
    </div>
  )
}
