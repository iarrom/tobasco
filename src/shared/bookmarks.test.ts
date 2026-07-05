import { describe, expect, it } from 'vitest'
import { isUrlBookmarked, MAX_BOOKMARKS, normalizeBookmarks } from './bookmarks'
import type { Bookmark } from './types'

function makeBookmark(overrides: Partial<Bookmark> & { url: string }): Bookmark {
  return {
    id: overrides.id ?? `id-${overrides.url}`,
    url: overrides.url,
    title: overrides.title ?? overrides.url,
    faviconUrl: overrides.faviconUrl ?? null,
    createdAt: overrides.createdAt ?? 0,
    sortOrder: overrides.sortOrder ?? 0
  }
}

describe('normalizeBookmarks', () => {
  it('orders by sortOrder and re-indexes contiguously', () => {
    const result = normalizeBookmarks([
      makeBookmark({ url: 'https://b.com', sortOrder: 5 }),
      makeBookmark({ url: 'https://a.com', sortOrder: 1 })
    ])
    expect(result.map((b) => b.url)).toEqual(['https://a.com', 'https://b.com'])
    expect(result.map((b) => b.sortOrder)).toEqual([0, 1])
  })

  it('dedupes by normalized URL, keeping the first occurrence', () => {
    const result = normalizeBookmarks([
      makeBookmark({ id: 'first', url: 'https://example.com/', sortOrder: 0 }),
      makeBookmark({ id: 'second', url: 'https://example.com', sortOrder: 1 })
    ])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('first')
  })

  it('drops malformed entries instead of throwing', () => {
    const result = normalizeBookmarks([
      makeBookmark({ url: 'https://ok.com' }),
      { id: 5, url: null } as unknown as Bookmark,
      'nope' as unknown as Bookmark
    ])
    expect(result.map((b) => b.url)).toEqual(['https://ok.com'])
  })

  it('caps at MAX_BOOKMARKS', () => {
    const many = Array.from({ length: MAX_BOOKMARKS + 25 }, (_, i) =>
      makeBookmark({ url: `https://site${i}.com`, sortOrder: i })
    )
    expect(normalizeBookmarks(many)).toHaveLength(MAX_BOOKMARKS)
  })
})

describe('isUrlBookmarked', () => {
  const bookmarks = [makeBookmark({ url: 'https://example.com/path' })]

  it('matches regardless of trailing slash / case in host', () => {
    expect(isUrlBookmarked(bookmarks, 'https://EXAMPLE.com/path')).toBe(true)
    expect(isUrlBookmarked(bookmarks, 'https://example.com/other')).toBe(false)
  })
})
