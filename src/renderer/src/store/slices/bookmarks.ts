// [FORK] Global browser bookmarks slice. Backs the bookmarks bar rendered under
// the browser toolbar. Bookmarks are client-wide (not worktree-scoped) and
// persist in the workspace session alongside browserUrlHistory — see
// workspace-session-host-split.ts (FIELD_OWNERSHIP.bookmarks = 'global').
import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { Bookmark, WorkspaceSessionState } from '../../../../shared/types'
import {
  isUrlBookmarked,
  normalizeBookmarks,
  normalizeBookmarkUrl
} from '../../../../shared/bookmarks'
import { ORCA_BROWSER_BLANK_URL } from '../../../../shared/constants'
import { createBrowserUuid } from '@/lib/browser-uuid'

type AddBookmarkInput = {
  url: string
  title: string
  faviconUrl?: string | null
}

export type BookmarksSlice = {
  bookmarks: Bookmark[]
  /** Whether the bookmarks bar is shown under the browser toolbar (List toggle). */
  bookmarksBarVisible: boolean
  toggleBookmarksBar: () => void
  /** Add the given page as a bookmark; no-op for blank/empty or already-bookmarked URLs. */
  addBookmark: (input: AddBookmarkInput) => void
  removeBookmark: (id: string) => void
  /** Remove whichever bookmark matches the URL (used by the toolbar star toggle). */
  removeBookmarkByUrl: (url: string) => void
  renameBookmark: (id: string, title: string) => void
  reorderBookmarks: (orderedIds: string[]) => void
  hydrateBookmarks: (session: WorkspaceSessionState) => void
}

function reindex(bookmarks: Bookmark[]): Bookmark[] {
  return bookmarks.map((entry, index) => ({ ...entry, sortOrder: index }))
}

export const createBookmarksSlice: StateCreator<AppState, [], [], BookmarksSlice> = (set, get) => ({
  bookmarks: [],
  bookmarksBarVisible: true,
  toggleBookmarksBar: () => set((s) => ({ bookmarksBarVisible: !s.bookmarksBarVisible })),
  addBookmark: ({ url, title, faviconUrl }) => {
    const trimmed = url?.trim()
    if (!trimmed || trimmed === ORCA_BROWSER_BLANK_URL || trimmed === 'about:blank') {
      return
    }
    if (isUrlBookmarked(get().bookmarks, trimmed)) {
      return
    }
    set((s) => ({
      bookmarks: reindex([
        ...s.bookmarks,
        {
          id: createBrowserUuid(),
          url: trimmed,
          title: title.trim() || trimmed,
          faviconUrl: faviconUrl ?? null,
          createdAt: Date.now(),
          sortOrder: s.bookmarks.length
        }
      ])
    }))
  },
  removeBookmark: (id) => {
    set((s) => ({ bookmarks: reindex(s.bookmarks.filter((entry) => entry.id !== id)) }))
  },
  removeBookmarkByUrl: (url) => {
    const key = normalizeBookmarkUrl(url)
    set((s) => ({
      bookmarks: reindex(s.bookmarks.filter((entry) => normalizeBookmarkUrl(entry.url) !== key))
    }))
  },
  renameBookmark: (id, title) => {
    const nextTitle = title.trim()
    if (!nextTitle) {
      return
    }
    set((s) => ({
      bookmarks: s.bookmarks.map((entry) =>
        entry.id === id ? { ...entry, title: nextTitle } : entry
      )
    }))
  },
  reorderBookmarks: (orderedIds) => {
    set((s) => {
      const byId = new Map(s.bookmarks.map((entry) => [entry.id, entry]))
      const next: Bookmark[] = []
      for (const id of orderedIds) {
        const entry = byId.get(id)
        if (entry) {
          next.push(entry)
          byId.delete(id)
        }
      }
      // Why: keep any bookmarks the caller's id list omitted (added concurrently)
      // so a stale reorder can never silently drop entries.
      for (const entry of s.bookmarks) {
        if (byId.has(entry.id)) {
          next.push(entry)
        }
      }
      return { bookmarks: reindex(next) }
    })
  },
  hydrateBookmarks: (session) => {
    set({ bookmarks: normalizeBookmarks(session.bookmarks ?? []) })
  }
})
