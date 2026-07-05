// [FORK] Matching rules for clickable file chips in the markdown preview.
import { describe, expect, it } from 'vitest'
import { matchMarkdownInlineFileReference } from './markdown-inline-file-reference'

describe('matchMarkdownInlineFileReference', () => {
  it('matches repo paths with directories and code extensions', () => {
    expect(matchMarkdownInlineFileReference('src/shared/types.ts')).toEqual({
      path: 'src/shared/types.ts'
    })
    expect(matchMarkdownInlineFileReference('./fork/README.md')).toEqual({
      path: 'fork/README.md'
    })
  })

  it('parses trailing :line and :line:col, and comma line lists', () => {
    expect(matchMarkdownInlineFileReference('src/a/b.tsx:12')).toEqual({
      path: 'src/a/b.tsx',
      line: 12
    })
    expect(matchMarkdownInlineFileReference('src/a/b.css:10:4')).toEqual({
      path: 'src/a/b.css',
      line: 10,
      column: 4
    })
    expect(matchMarkdownInlineFileReference('src/shared/types.ts:811,847')).toEqual({
      path: 'src/shared/types.ts',
      line: 811
    })
  })

  it('rejects bare filenames, prose, and non-file tokens', () => {
    expect(matchMarkdownInlineFileReference('types.ts')).toBeNull()
    expect(matchMarkdownInlineFileReference('run src/a/b.ts now')).toBeNull()
    expect(matchMarkdownInlineFileReference('isNativeChatSupportedAgent')).toBeNull()
    expect(matchMarkdownInlineFileReference("contentType: 'terminal'")).toBeNull()
    expect(matchMarkdownInlineFileReference('a/b')).toBeNull()
  })
})
