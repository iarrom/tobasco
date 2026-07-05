import { describe, expect, it } from 'vitest'
import { describeToolAction, extractCommandBinaries } from './native-chat-tool-verb'

describe('extractCommandBinaries', () => {
  it('lists distinct binaries across &&, ||, |, ; and newlines', () => {
    expect(extractCommandBinaries('git status && echo "---" && git branch --show-current')).toEqual(
      ['git', 'echo']
    )
    expect(extractCommandBinaries('cat file | grep foo | sort')).toEqual(['cat', 'grep', 'sort'])
  })

  it('skips leading env-var assignments to reach the real binary', () => {
    expect(extractCommandBinaries('FOO=1 BAR=2 node script.js')).toEqual(['node'])
  })

  it('reduces paths to their basename and caps the list', () => {
    expect(extractCommandBinaries('/usr/bin/python3 a.py')).toEqual(['python3'])
    expect(extractCommandBinaries('a; b; c; d; e; f')).toHaveLength(4)
  })
})

describe('describeToolAction', () => {
  it('maps Bash to "Ran" with the description as label and binaries as hint', () => {
    const action = describeToolAction('Bash', {
      command: 'git status && echo done',
      description: 'Check git status'
    })
    expect(action).toMatchObject({
      verb: 'Ran',
      activeVerb: 'Running',
      label: 'Check git status',
      hint: 'git, echo'
    })
  })

  it('falls back to the first command line when there is no description', () => {
    const action = describeToolAction('Bash', { command: 'ls -la\nmore' })
    expect(action.label).toBe('ls -la')
  })

  it('uses the file basename for file tools', () => {
    expect(describeToolAction('Read', { file_path: '/a/b/types.ts' })).toMatchObject({
      verb: 'Read',
      label: 'types.ts'
    })
    expect(describeToolAction('Edit', { file_path: '/a/b/TabBar.tsx' })).toMatchObject({
      verb: 'Edited',
      label: 'TabBar.tsx'
    })
  })

  it('uses the pattern for search tools', () => {
    expect(describeToolAction('Grep', { pattern: 'foo.*bar' })).toMatchObject({
      verb: 'Searched',
      label: 'foo.*bar'
    })
  })

  it('falls back to the raw tool name for unknown tools', () => {
    expect(describeToolAction('MysteryTool', { x: 1 })).toMatchObject({
      verb: 'MysteryTool',
      activeVerb: 'MysteryTool'
    })
  })
})
