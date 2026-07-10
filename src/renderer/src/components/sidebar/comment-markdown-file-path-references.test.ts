import { describe, expect, it } from 'vitest'
import { remarkFilePathReferences } from './comment-markdown-file-path-references'

type Node = {
  type: string
  value?: string
  url?: string
  children?: Node[]
}

function paragraph(children: Node[]): Node {
  return { type: 'root', children: [{ type: 'paragraph', children }] }
}

function transform(tree: Node): Node {
  remarkFilePathReferences()()(tree)
  return tree
}

function paragraphChildren(tree: Node): Node[] {
  return tree.children?.[0]?.children ?? []
}

describe('remarkFilePathReferences', () => {
  it('linkifies a bare relative path inside prose', () => {
    const tree = paragraph([
      {
        type: 'text',
        value: 'Тестовый прогон создал отчёт (reports/seo/2026-07-10.md), и он показал'
      }
    ])
    const children = paragraphChildren(transform(tree))
    expect(children.map((c) => c.type)).toEqual(['text', 'link', 'text'])
    expect(children[1].url).toBe('reports/seo/2026-07-10.md')
    expect(children[1].children?.[0]?.value).toBe('reports/seo/2026-07-10.md')
  })

  it('keeps a :line:col suffix on the link target', () => {
    const tree = paragraph([{ type: 'text', value: 'смотри src/main/updater.ts:42:7 тут' }])
    const children = paragraphChildren(transform(tree))
    expect(children[1].url).toBe('src/main/updater.ts:42:7')
  })

  it('linkifies absolute, dotted and Windows paths', () => {
    for (const path of [
      '/Users/x/repo/Plans/auth.md',
      './scripts/build.mjs',
      'C:\\repo\\src\\index.ts'
    ]) {
      const tree = paragraph([{ type: 'text', value: `файл ${path} готов` }])
      const children = paragraphChildren(transform(tree))
      expect(children.map((c) => c.type)).toEqual(['text', 'link', 'text'])
      expect(children[1].url).toBe(path)
    }
  })

  it('wraps an inline-code span that is entirely a path', () => {
    const tree = paragraph([{ type: 'inlineCode', value: 'reports/seo/2026-07-10.md' }])
    const children = paragraphChildren(transform(tree))
    expect(children[0].type).toBe('link')
    expect(children[0].url).toBe('reports/seo/2026-07-10.md')
    expect(children[0].children?.[0]?.type).toBe('inlineCode')
  })

  it('leaves non-path prose, versions and domain-like tokens alone', () => {
    for (const value of [
      'и/или так, 24/7 без перерыва',
      'версия 1.4.129-rc.10 вышла',
      'см. example.com/page.html и github.io/docs.html'
    ]) {
      const tree = paragraph([{ type: 'text', value }])
      const children = paragraphChildren(transform(tree))
      expect(children).toHaveLength(1)
      expect(children[0].type).toBe('text')
    }
  })

  it('does not touch text already inside a link', () => {
    const tree = paragraph([
      {
        type: 'link',
        url: 'https://example.com/a/b.md',
        children: [{ type: 'text', value: 'docs/readme.md' }]
      }
    ])
    const children = paragraphChildren(transform(tree))
    expect(children[0].type).toBe('link')
    expect(children[0].children?.[0]?.type).toBe('text')
  })

  it('skips a path glued into a URL tail', () => {
    const tree = paragraph([
      { type: 'text', value: 'https://cdn.host/static/app/main.js работает' }
    ])
    const children = paragraphChildren(transform(tree))
    expect(children).toHaveLength(1)
    expect(children[0].type).toBe('text')
  })
})
