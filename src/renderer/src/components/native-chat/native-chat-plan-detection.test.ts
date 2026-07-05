import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { deriveLatestNativeChatPlan } from './native-chat-plan-detection'
import { buildNativeChatPlanExecuteMessage } from './native-chat-plan-build'

function toolMsg(id: string, name: string, input: unknown): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'tool-call', name, input }],
    timestamp: 0,
    source: 'transcript'
  }
}

describe('deriveLatestNativeChatPlan', () => {
  it('detects a Write to Plans/*.md and extracts title/preview', () => {
    const messages = [
      toolMsg('a', 'Write', {
        file_path: '/repo/Plans/auth.md',
        content: '# Auth Plan\n\nMigrate the login flow.\n\n## To-do\n- [ ] step'
      })
    ]
    expect(deriveLatestNativeChatPlan(messages, '/repo')).toEqual({
      path: '/repo/Plans/auth.md',
      relativePath: 'Plans/auth.md',
      title: 'Auth Plan',
      preview: 'Migrate the login flow.'
    })
  })

  it('joins a relative write path onto the worktree root', () => {
    const messages = [toolMsg('a', 'Write', { file_path: 'Plans/x.md', content: '# X' })]
    expect(deriveLatestNativeChatPlan(messages, '/repo')?.path).toBe('/repo/Plans/x.md')
  })

  it('ignores non-plan writes', () => {
    const messages = [
      toolMsg('a', 'Write', { file_path: 'src/index.ts', content: 'x' }),
      toolMsg('b', 'Read', { file_path: '/repo/Plans/a.md' })
    ]
    expect(deriveLatestNativeChatPlan(messages, '/repo')).toBeNull()
  })

  it('keeps the last plan when several are written', () => {
    const messages = [
      toolMsg('a', 'Write', { file_path: 'Plans/old.md', content: '# Old' }),
      toolMsg('b', 'Write', { file_path: 'Plans/new.md', content: '# New' })
    ]
    expect(deriveLatestNativeChatPlan(messages, '/repo')?.relativePath).toBe('Plans/new.md')
  })
})

describe('buildNativeChatPlanExecuteMessage', () => {
  it('references the plan path and the To-do', () => {
    const msg = buildNativeChatPlanExecuteMessage('/repo/Plans/auth.md')
    expect(msg).toContain('`Plans/auth.md`')
    expect(msg).toContain('To-do')
  })
})
