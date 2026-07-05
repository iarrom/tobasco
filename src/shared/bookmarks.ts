// [FORK] Shared helpers for the browser bookmarks bar. Bookmarks are global
// (client-wide) and persist in the workspace session next to browserUrlHistory.
import type { Bookmark } from './types'
import { redactKagiSessionToken } from './browser-url'
import { normalizeBrowserHistoryUrl } from './workspace-session-browser-history'

export const MAX_BOOKMARKS = 500

/** Compare/dedup key for a bookmark URL — reuses the history normalizer so a
 *  bookmarked page and its history entry agree on identity. */
export function normalizeBookmarkUrl(url: string): string {
  return normalizeBrowserHistoryUrl(url)
}

function isBookmarkLike(value: unknown): value is Bookmark {
  if (!value || typeof value !== 'object') {
    return false
  }
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.url === 'string' &&
    typeof entry.title === 'string' &&
    (entry.faviconUrl === null || typeof entry.faviconUrl === 'string')
  )
}

/** Validate, redact, dedupe by normalized URL, re-index sortOrder, and cap.
 *  Tolerant of partially-corrupt persisted input: bad entries are dropped
 *  rather than failing the whole list. */
export function normalizeBookmarks(entries: readonly unknown[]): Bookmark[] {
  const seen = new Set<string>()
  const ordered = [...entries]
    .filter(isBookmarkLike)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const result: Bookmark[] = []
  for (const entry of ordered) {
    const safeUrl = redactKagiSessionToken(entry.url)
    const key = normalizeBookmarkUrl(safeUrl)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push({
      id: entry.id,
      url: safeUrl,
      title: entry.title,
      faviconUrl: entry.faviconUrl ?? null,
      createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : 0,
      sortOrder: result.length
    })
    if (result.length >= MAX_BOOKMARKS) {
      break
    }
  }
  return result
}

export function isUrlBookmarked(bookmarks: readonly Bookmark[], url: string): boolean {
  const key = normalizeBookmarkUrl(url)
  return bookmarks.some((entry) => normalizeBookmarkUrl(entry.url) === key)
}
