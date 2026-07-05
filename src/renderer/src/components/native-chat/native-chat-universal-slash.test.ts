// [FORK] Universal `/` menu building + prompt token highlighting rules.
import { describe, expect, it } from 'vitest'
import {
  applySlashSkillSuggestion,
  buildUniversalSlashItems,
  stripLeadingSlashToken,
  type NativeChatComposerMode
} from './native-chat-composer-state'
import { segmentNativeChatPromptTokens } from './native-chat-prompt-tokens'
import type { DiscoveredSkill } from '../../../../shared/skills'

function skill(name: string): DiscoveredSkill {
  return {
    id: `skill-${name}`,
    name,
    description: `${name} description`,
    installed: true,
    providers: ['claude'],
    directoryPath: `/skills/${name}`,
    sourceLabel: 'project'
  } as unknown as DiscoveredSkill
}

const PLAN_MODE: NativeChatComposerMode = {
  id: 'plan',
  label: 'Plan',
  description: 'Research first',
  active: false
}

describe('buildUniversalSlashItems', () => {
  it('orders sections Skills → Commands → Modes and filters by query', () => {
    const items = buildUniversalSlashItems({
      query: '',
      commands: [{ name: 'clear', description: 'Clear' }],
      skills: [skill('create-rule')],
      modes: [PLAN_MODE]
    })
    expect(items.map((item) => item.kind)).toEqual(['skill', 'command', 'mode'])
  })

  it('matches modes by label prefix and drops non-matching sections', () => {
    const items = buildUniversalSlashItems({
      query: 'pl',
      commands: [{ name: 'clear' }],
      skills: [skill('create-rule')],
      modes: [PLAN_MODE]
    })
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('mode')
  })

  it('matches skills by name prefix', () => {
    const items = buildUniversalSlashItems({
      query: 'crea',
      commands: [{ name: 'clear' }],
      skills: [skill('create-rule'), skill('shadcn')],
      modes: [PLAN_MODE]
    })
    expect(items.filter((item) => item.kind === 'skill')).toHaveLength(1)
  })
})

describe('slash token editing helpers', () => {
  it('replaces the leading /query with the skill reference', () => {
    expect(applySlashSkillSuggestion('/crea rest', 5, 'create-rule')).toEqual({
      draft: '$create-rule  rest',
      caret: '$create-rule '.length
    })
  })

  it('strips the consumed /query token on mode toggle', () => {
    expect(stripLeadingSlashToken('/plan', 5)).toEqual({ draft: '', caret: 0 })
  })
})

describe('segmentNativeChatPromptTokens', () => {
  it('returns null for plain prose', () => {
    expect(segmentNativeChatPromptTokens('just a normal message')).toBeNull()
  })

  it('highlights a leading /command token', () => {
    expect(segmentNativeChatPromptTokens('/deploy to prod')).toEqual([
      { kind: 'token', value: '/deploy' },
      { kind: 'text', value: ' to prod' }
    ])
  })

  it('highlights $skill tokens anywhere in the text', () => {
    expect(segmentNativeChatPromptTokens('use $shadcn for the dialog')).toEqual([
      { kind: 'text', value: 'use ' },
      { kind: 'token', value: '$shadcn' },
      { kind: 'text', value: ' for the dialog' }
    ])
  })

  it('does not treat mid-word slashes or dollar amounts as tokens', () => {
    expect(segmentNativeChatPromptTokens('path a/b costs $5x')).toBeNull()
  })
})
