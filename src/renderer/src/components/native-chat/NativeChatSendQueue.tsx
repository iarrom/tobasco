// [FORK] Cursor-style queued-message rows docked above the composer while the
// agent works. Each row shows the pending prompt with hover-revealed icon
// actions: edit (back into the composer), force-send, and remove.

import { ArrowUp, Pencil, X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { NativeChatQueuedMessage } from './use-native-chat-send-queue'

function QueueActionButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-input/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  )
}

export function NativeChatSendQueue({
  items,
  onEdit,
  onSendNow,
  onRemove
}: {
  items: readonly NativeChatQueuedMessage[]
  onEdit: (id: string) => void
  onSendNow: (id: string) => void
  onRemove: (id: string) => void
}): React.JSX.Element | null {
  if (items.length === 0) {
    return null
  }
  return (
    // Horizontal padding + max-w-xl mirror NativeChatComposerField's wrapper so
    // queued rows line up exactly with the composer box edges.
    <div className="px-3 sm:px-4">
      <div className="mx-auto mb-1.5 flex w-full max-w-xl flex-col gap-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="group flex items-center gap-2 rounded-lg border border-input bg-card px-2.5 py-1.5 dark:bg-input/30"
          >
            <span className="min-w-0 flex-1 truncate text-xs">
              {item.text.trim().length > 0
                ? item.text
                : translate('components.native-chat.queue.imageOnly', 'Image attachment')}
            </span>
            {item.imagePaths.length > 0 ? (
              <span className="shrink-0 rounded bg-muted px-1 text-[10px] leading-4 text-muted-foreground">
                {item.imagePaths.length}{' '}
                {translate('components.native-chat.queue.imagesBadge', 'img')}
              </span>
            ) : null}
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <QueueActionButton
                label={translate('components.native-chat.queue.edit', 'Edit message')}
                onClick={() => onEdit(item.id)}
              >
                <Pencil className="size-3" />
              </QueueActionButton>
              <QueueActionButton
                label={translate('components.native-chat.queue.sendNow', 'Send now')}
                onClick={() => onSendNow(item.id)}
              >
                <ArrowUp className="size-3.5" />
              </QueueActionButton>
              <QueueActionButton
                label={translate('components.native-chat.queue.remove', 'Remove from queue')}
                onClick={() => onRemove(item.id)}
              >
                <X className="size-3.5" />
              </QueueActionButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
