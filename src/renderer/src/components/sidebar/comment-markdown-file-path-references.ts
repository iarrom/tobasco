// [FORK] Linkify bare workspace file paths in agent prose — `reports/seo/x.md`,
// `src/a/b.ts:12:3`, `C:\repo\x.ts` — so they open in-app exactly like the
// explicit file links agents sometimes emit. Mirrors the remarkGitHubReferences
// text-node splitting in CommentMarkdown.tsx. Only text outside links/images is
// touched; an inline-code span whose whole content is a path gets wrapped in a
// link (agents habitually backtick paths).

type MarkdownNode = {
  type: string
  value?: string
  children?: MarkdownNode[]
}

type MarkdownLinkNode = MarkdownNode & {
  type: 'link'
  url: string
  title: null
  children: MarkdownNode[]
}

// A path is at least two segments joined by / or \ whose last segment carries a
// short extension, optionally prefixed (./ ../ ~/ / C:\) and suffixed with
// :line[:col]. Segments stay ASCII word-ish, so prose («и/или», dates in text)
// and version strings (1.4.129-rc.10 — no separator) never match.
const FILE_PATH_PATTERN =
  /(?:\.{1,2}[\\/]|~[\\/]|[A-Za-z]:[\\/]|[\\/])?[\w@.-]+(?:[\\/][\w@.-]+)+\.[A-Za-z0-9]{1,8}(?::\d+(?::\d+)?)?/g

// remark-gfm autolinks http(s)/www URLs, but a bare `example.com/page.html`
// stays plain text and would pass the path pattern — reject candidates whose
// first segment reads as a domain.
const DOMAIN_LIKE_FIRST_SEGMENT =
  /^[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|io|dev|ai|app|co|ru|me|so|sh|xyz)$/i

function firstSegment(candidate: string): string {
  return candidate.split(/[\\/]/).find((segment) => segment.length > 0) ?? ''
}

function isLinkifiablePath(candidate: string): boolean {
  return !DOMAIN_LIKE_FIRST_SEGMENT.test(firstSegment(candidate))
}

/** A match glued to path-ish context on its left (mid-URL, mid-path) is not a
 *  standalone reference. */
function isEmbeddedMatch(value: string, index: number): boolean {
  if (index === 0) {
    return false
  }
  return /[\w@.:~\\/-]/.test(value[index - 1] ?? '')
}

function fileLinkNode(path: string, children: MarkdownNode[]): MarkdownLinkNode {
  return { type: 'link', url: path, title: null, children }
}

function splitFilePathText(value: string): MarkdownNode[] {
  const parts: MarkdownNode[] = []
  let cursor = 0
  for (const match of value.matchAll(FILE_PATH_PATTERN)) {
    const label = match[0]
    const index = match.index ?? 0
    if (isEmbeddedMatch(value, index) || !isLinkifiablePath(label)) {
      continue
    }
    if (index > cursor) {
      parts.push({ type: 'text', value: value.slice(cursor, index) })
    }
    parts.push(fileLinkNode(label, [{ type: 'text', value: label }]))
    cursor = index + label.length
  }
  if (cursor === 0) {
    return [{ type: 'text', value }]
  }
  if (cursor < value.length) {
    parts.push({ type: 'text', value: value.slice(cursor) })
  }
  return parts
}

function isWholeCodeSpanPath(value: string): boolean {
  FILE_PATH_PATTERN.lastIndex = 0
  const match = FILE_PATH_PATTERN.exec(value)
  FILE_PATH_PATTERN.lastIndex = 0
  return match !== null && match.index === 0 && match[0] === value && isLinkifiablePath(value)
}

function transformChildren(node: MarkdownNode): void {
  if (!node.children || node.type === 'link' || node.type === 'image') {
    return
  }
  const nextChildren: MarkdownNode[] = []
  for (const child of node.children) {
    if (child.type === 'text' && child.value !== undefined) {
      for (const part of splitFilePathText(child.value)) {
        nextChildren.push(part)
      }
      continue
    }
    if (child.type === 'inlineCode' && child.value && isWholeCodeSpanPath(child.value.trim())) {
      nextChildren.push(fileLinkNode(child.value.trim(), [child]))
      continue
    }
    transformChildren(child)
    nextChildren.push(child)
  }
  node.children = nextChildren
}

export function remarkFilePathReferences(): () => (tree: MarkdownNode) => void {
  return () => (tree) => transformChildren(tree)
}
