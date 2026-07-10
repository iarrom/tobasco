import { describe, expect, it } from 'vitest'
import {
  isNativeChatPlanFilePath,
  nativeChatPlanRelativePath,
  nativeChatPlanTitleAndPreview,
  unwrapNativeChatPlanPrompt,
  wrapNativeChatPlanPrompt
} from './native-chat-plan-instruction'

describe('wrapNativeChatPlanPrompt', () => {
  it('prefixes a directive and keeps the task text', () => {
    const wrapped = wrapNativeChatPlanPrompt('Migrate the auth flow')
    expect(wrapped).toContain('Plan mode')
    expect(wrapped).toContain('Plans/<kebab-case-title>.md')
    expect(wrapped).toContain('## To-do')
    expect(wrapped).toContain('Migrate the auth flow')
  })

  it('returns empty/whitespace input unchanged', () => {
    expect(wrapNativeChatPlanPrompt('')).toBe('')
    expect(wrapNativeChatPlanPrompt('   ')).toBe('   ')
  })
})

describe('unwrapNativeChatPlanPrompt', () => {
  it('round-trips the wrapped task text exactly', () => {
    const task = 'Нам надо сделать privacy policy,\ncookie banner с google analytics'
    expect(unwrapNativeChatPlanPrompt(wrapNativeChatPlanPrompt(task))).toBe(task)
  })

  it('returns null for a plain (non-wrapped) prompt', () => {
    expect(unwrapNativeChatPlanPrompt('just fix the bug')).toBeNull()
  })

  it('returns null when the wrapper has no task body', () => {
    expect(unwrapNativeChatPlanPrompt('You are in Plan mode. Do NOT edit code.')).toBeNull()
  })

  it('does not trip on a user prompt that merely mentions Task:', () => {
    expect(unwrapNativeChatPlanPrompt('см. Task:\nописание')).toBeNull()
  })
})

describe('isNativeChatPlanFilePath', () => {
  it('matches a .md directly under Plans/', () => {
    expect(isNativeChatPlanFilePath('Plans/auth.md')).toBe(true)
    expect(isNativeChatPlanFilePath('/repo/Plans/auth-migration.md')).toBe(true)
    expect(isNativeChatPlanFilePath('repo\\Plans\\auth.md')).toBe(true)
    expect(isNativeChatPlanFilePath('./Plans/x.md')).toBe(true)
  })

  it('rejects non-plan writes', () => {
    expect(isNativeChatPlanFilePath('src/index.ts')).toBe(false)
    expect(isNativeChatPlanFilePath('Plans/notes.txt')).toBe(false)
    expect(isNativeChatPlanFilePath('docs/Plans.md')).toBe(false)
    expect(isNativeChatPlanFilePath('Plans/sub/deep.md')).toBe(false)
    expect(isNativeChatPlanFilePath('')).toBe(false)
  })

  it('enforces the worktree root for absolute paths', () => {
    expect(isNativeChatPlanFilePath('/repo/Plans/a.md', '/repo')).toBe(true)
    expect(isNativeChatPlanFilePath('/other/Plans/a.md', '/repo')).toBe(false)
    // relative paths are accepted regardless of a given root
    expect(isNativeChatPlanFilePath('Plans/a.md', '/repo')).toBe(true)
  })
})

describe('nativeChatPlanRelativePath', () => {
  it('reduces to the Plans/<name>.md suffix', () => {
    expect(nativeChatPlanRelativePath('/repo/Plans/auth.md')).toBe('Plans/auth.md')
    expect(nativeChatPlanRelativePath('Plans/auth.md')).toBe('Plans/auth.md')
  })
})

describe('nativeChatPlanTitleAndPreview', () => {
  it('takes the H1 title and first paragraph', () => {
    const md = '# Migrate Auth\n\nMove the login flow to the new provider.\n\n## Steps\n- do it'
    expect(nativeChatPlanTitleAndPreview(md)).toEqual({
      title: 'Migrate Auth',
      preview: 'Move the login flow to the new provider.'
    })
  })

  it('falls back to the given title when no H1', () => {
    expect(nativeChatPlanTitleAndPreview('just text', 'auth').title).toBe('auth')
  })

  it('gathers a multi-line intro paragraph', () => {
    const md = '# T\n\nLine one\nline two\n\nrest'
    expect(nativeChatPlanTitleAndPreview(md).preview).toBe('Line one line two')
  })
})
