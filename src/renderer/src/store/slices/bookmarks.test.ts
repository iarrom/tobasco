import { describe, expect, it } from 'vitest'
import { createTestStore } from './store-test-helpers'
import { ORCA_BROWSER_BLANK_URL } from '../../../../shared/constants'

describe('bookmarks slice', () => {
  it('adds a bookmark with captured title and favicon', () => {
    const store = createTestStore()
    store.getState().addBookmark({
      url: 'https://example.com',
      title: 'Example',
      faviconUrl: 'https://example.com/icon.png'
    })
    const bookmarks = store.getState().bookmarks
    expect(bookmarks).toHaveLength(1)
    expect(bookmarks[0]).toMatchObject({
      url: 'https://example.com',
      title: 'Example',
      faviconUrl: 'https://example.com/icon.png',
      sortOrder: 0
    })
  })

  it('ignores blank and duplicate URLs', () => {
    const store = createTestStore()
    const { addBookmark } = store.getState()
    addBookmark({ url: ORCA_BROWSER_BLANK_URL, title: 'blank' })
    addBookmark({ url: 'about:blank', title: 'blank' })
    addBookmark({ url: 'https://dupe.com', title: 'One' })
    addBookmark({ url: 'https://dupe.com/', title: 'Two' })
    expect(store.getState().bookmarks).toHaveLength(1)
  })

  it('removes by id and by URL, re-indexing sortOrder', () => {
    const store = createTestStore()
    const { addBookmark } = store.getState()
    addBookmark({ url: 'https://a.com', title: 'A' })
    addBookmark({ url: 'https://b.com', title: 'B' })
    addBookmark({ url: 'https://c.com', title: 'C' })

    const bId = store.getState().bookmarks.find((entry) => entry.url === 'https://b.com')!.id
    store.getState().removeBookmark(bId)
    store.getState().removeBookmarkByUrl('https://a.com')

    const remaining = store.getState().bookmarks
    expect(remaining.map((entry) => entry.url)).toEqual(['https://c.com'])
    expect(remaining[0].sortOrder).toBe(0)
  })

  it('renames a bookmark, ignoring blank titles', () => {
    const store = createTestStore()
    store.getState().addBookmark({ url: 'https://a.com', title: 'A' })
    const id = store.getState().bookmarks[0].id
    store.getState().renameBookmark(id, '   ')
    expect(store.getState().bookmarks[0].title).toBe('A')
    store.getState().renameBookmark(id, 'Renamed')
    expect(store.getState().bookmarks[0].title).toBe('Renamed')
  })

  it('reorders and preserves entries omitted from the id list', () => {
    const store = createTestStore()
    const { addBookmark } = store.getState()
    addBookmark({ url: 'https://a.com', title: 'A' })
    addBookmark({ url: 'https://b.com', title: 'B' })
    addBookmark({ url: 'https://c.com', title: 'C' })

    const ids = store.getState().bookmarks.map((entry) => entry.id)
    // Move the last before the first; omit the middle id to prove it survives.
    store.getState().reorderBookmarks([ids[2], ids[0]])

    const urls = store.getState().bookmarks.map((entry) => entry.url)
    expect(urls).toEqual(['https://c.com', 'https://a.com', 'https://b.com'])
    expect(store.getState().bookmarks.map((entry) => entry.sortOrder)).toEqual([0, 1, 2])
  })

  it('hydrates and normalizes from a persisted session', () => {
    const store = createTestStore()
    store.getState().hydrateBookmarks({
      bookmarks: [
        { id: '1', url: 'https://a.com', title: 'A', faviconUrl: null, createdAt: 0, sortOrder: 3 },
        {
          id: '2',
          url: 'https://a.com/',
          title: 'dupe',
          faviconUrl: null,
          createdAt: 0,
          sortOrder: 4
        }
      ]
    } as never)
    expect(store.getState().bookmarks).toHaveLength(1)
    expect(store.getState().bookmarks[0].sortOrder).toBe(0)
  })
})
