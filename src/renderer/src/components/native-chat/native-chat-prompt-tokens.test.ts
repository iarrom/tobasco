import { describe, expect, it } from 'vitest'
import {
  extractPastedElementDumps,
  segmentNativeChatPromptTokens
} from './native-chat-prompt-tokens'

const ELEMENT_DUMP = [
  '<button type="button" aria-label="Copy message" class="flex size-6 shr...">',
  '  <svg ...>',
  '</button>',
  '  in NativeChatCopyButton (at /src/components/native-chat/NativeChatCopyButton.tsx)',
  '  in AgentControls (at /src/components/native-chat/NativeChatMessageRow.tsx)'
].join('\n')

describe('segmentNativeChatPromptTokens', () => {
  it('keeps plain text un-segmented', () => {
    expect(segmentNativeChatPromptTokens('just a question about <T> generics')).toBeNull()
  })

  it('segments a leading /command and $skill tokens', () => {
    const out = segmentNativeChatPromptTokens('/review use $verify here')
    expect(out).toEqual([
      { kind: 'token', value: '/review' },
      { kind: 'text', value: ' use ' },
      { kind: 'token', value: '$verify' },
      { kind: 'text', value: ' here' }
    ])
  })

  it('collapses a pasted element dump into one element segment', () => {
    const out = segmentNativeChatPromptTokens(`почини кнопку\n\n${ELEMENT_DUMP}\n\nона сломана`)
    expect(out).not.toBeNull()
    const element = out!.find((segment) => segment.kind === 'element')
    expect(element).toMatchObject({ kind: 'element', label: 'NativeChatCopyButton.tsx' })
    expect((element as { value: string }).value).toContain('in AgentControls')
    const text = out!
      .filter((segment) => segment.kind === 'text')
      .map((segment) => segment.value)
      .join('')
    expect(text).toContain('почини кнопку')
    expect(text).toContain('она сломана')
    expect(text).not.toContain('NativeChatCopyButton')
  })

  it('handles a self-closing single-line element dump', () => {
    const out = segmentNativeChatPromptTokens(
      '<span class="size-2 rounded-..." />\n  in CompactAgentRow2 (at /src/components/sidebar/worktree-card-compact-agent-row.tsx)'
    )
    expect(out).toEqual([
      expect.objectContaining({ kind: 'element', label: 'worktree-card-compact-agent-row.tsx' })
    ])
  })

  it('collapses multiple dumps to multiple chips', () => {
    const out = segmentNativeChatPromptTokens(`${ELEMENT_DUMP}\nа должно быть так\n${ELEMENT_DUMP}`)
    const elements = out!.filter((segment) => segment.kind === 'element')
    expect(elements).toHaveLength(2)
  })

  it('ignores markup without a devtools stack line', () => {
    expect(
      segmentNativeChatPromptTokens('<div class="a">\n  hello\n</div>\nno stack here')
    ).toBeNull()
  })
})

describe('extractPastedElementDumps', () => {
  it('splits pasted text into dump chips and a plain remainder', () => {
    const text = `посмотри сюда\n${ELEMENT_DUMP}\nи почини`
    const out = extractPastedElementDumps(text)
    expect(out?.dumps).toHaveLength(1)
    expect(out?.dumps[0]).toMatchObject({ label: 'NativeChatCopyButton.tsx' })
    expect(out?.remainder).toBe('посмотри сюда\n\nи почини')
  })

  it('returns null for text without element dumps', () => {
    expect(extractPastedElementDumps('обычный текст с <div> в прозе')).toBeNull()
  })
})
