// [FORK] Bookmarks bar rendered under the browser toolbar (reference row 3).
// Chips navigate the active pane on click, reorder via native drag, and expose
// open / rename / remove through a right-click context menu. Reads global
// bookmarks from the store; the only prop is how to navigate the active pane.
import { useState } from 'react'
import { Globe } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'

type BrowserBookmarksBarProps = {
  onNavigate: (url: string) => void
  /** [FORK] Opens the bookmark in a new in-app browser tab placed next to the
   *  current one. Also bound to middle-click on the chip. */
  onOpenInNewTab?: (bookmark: { url: string; title: string }) => void
}

function BookmarkFavicon({ faviconUrl }: { faviconUrl: string | null }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  if (!faviconUrl || failed) {
    return <Globe className="size-3.5 shrink-0 text-blue-500" />
  }
  return (
    <img
      src={faviconUrl}
      alt=""
      className="size-3.5 shrink-0 rounded-sm object-contain"
      onError={() => setFailed(true)}
    />
  )
}

function RenameBookmarkInput({
  initialValue,
  onCommit,
  onCancel
}: {
  initialValue: string
  onCommit: (value: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(initialValue)
  return (
    <input
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onCommit(value)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
      className="h-6 w-32 shrink-0 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      spellCheck={false}
    />
  )
}

export function BrowserBookmarksBar({
  onNavigate,
  onOpenInNewTab
}: BrowserBookmarksBarProps): React.JSX.Element | null {
  const bookmarks = useAppStore((s) => s.bookmarks)
  const removeBookmark = useAppStore((s) => s.removeBookmark)
  const renameBookmark = useAppStore((s) => s.renameBookmark)
  const reorderBookmarks = useAppStore((s) => s.reorderBookmarks)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  if (bookmarks.length === 0) {
    return null
  }

  const moveBookmark = (targetId: string): void => {
    if (!dragId || dragId === targetId) {
      return
    }
    const ids = bookmarks.map((entry) => entry.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from === -1 || to === -1) {
      return
    }
    ids.splice(from, 1)
    ids.splice(to, 0, dragId)
    reorderBookmarks(ids)
  }

  return (
    <div
      className="scrollbar-sleek flex items-center gap-0.5 overflow-x-auto border-b border-border/70 bg-background/95 px-2 py-1"
      data-orca-browser-bookmarks-bar="true"
    >
      {bookmarks.map((bookmark) =>
        renamingId === bookmark.id ? (
          <RenameBookmarkInput
            key={bookmark.id}
            initialValue={bookmark.title}
            onCommit={(value) => {
              renameBookmark(bookmark.id, value)
              setRenamingId(null)
            }}
            onCancel={() => setRenamingId(null)}
          />
        ) : (
          <ContextMenu key={bookmark.id}>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                draggable
                onDragStart={() => setDragId(bookmark.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => moveBookmark(bookmark.id)}
                onClick={() => onNavigate(bookmark.url)}
                onAuxClick={(event) => {
                  // Why: middle-click opens in a new adjacent tab, matching
                  // browser convention.
                  if (event.button === 1 && onOpenInNewTab) {
                    event.preventDefault()
                    onOpenInNewTab(bookmark)
                  }
                }}
                title={bookmark.url}
                className={cn(
                  'group flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  dragId === bookmark.id && 'opacity-50'
                )}
              >
                <BookmarkFavicon faviconUrl={bookmark.faviconUrl} />
                <span className="max-w-[12rem] truncate">{bookmark.title}</span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => onNavigate(bookmark.url)}>
                {translate('components.browser.bookmarks.open', 'Open')}
              </ContextMenuItem>
              {onOpenInNewTab ? (
                <ContextMenuItem onSelect={() => onOpenInNewTab(bookmark)}>
                  {translate('components.browser.bookmarks.openNewTab', 'Open in new tab')}
                </ContextMenuItem>
              ) : null}
              <ContextMenuItem onSelect={() => void window.api.shell.openUrl(bookmark.url)}>
                {translate('components.browser.bookmarks.openExternal', 'Open in default browser')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => setRenamingId(bookmark.id)}>
                {translate('components.browser.bookmarks.rename', 'Rename')}
              </ContextMenuItem>
              <ContextMenuItem variant="destructive" onSelect={() => removeBookmark(bookmark.id)}>
                {translate('components.browser.bookmarks.remove', 'Remove')}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      )}
    </div>
  )
}
