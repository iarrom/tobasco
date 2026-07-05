import { describe, expect, it } from 'vitest'
import {
  canOpenMarkdownPreview,
  getDefaultMarkdownViewMode,
  getEditorToggleModes,
  getMarkdownViewModes,
  isMarkdownPreviewShortcut
} from './markdown-preview-controls'

describe('getMarkdownViewModes', () => {
  it('offers preview, source and rich for markdown edit tabs', () => {
    // [FORK] Read-only preview joined the edit-tab modes and leads the toggle.
    expect(
      getMarkdownViewModes({
        language: 'markdown',
        mode: 'edit'
      })
    ).toEqual(['preview', 'source', 'rich'])
  })

  it('offers source and rich for single-file markdown diffs', () => {
    expect(
      getMarkdownViewModes({
        language: 'markdown',
        mode: 'diff',
        diffSource: 'unstaged'
      })
    ).toEqual(['source', 'rich'])
  })

  it('does not offer preview for mermaid edit tabs', () => {
    expect(
      getMarkdownViewModes({
        language: 'mermaid',
        mode: 'edit'
      })
    ).toEqual(['source', 'rich'])
  })

  it('keeps notebook toggles to source and rich without Changes', () => {
    expect(
      getEditorToggleModes({
        language: 'notebook',
        mode: 'edit'
      })
    ).toEqual(['source', 'rich'])
  })
})

describe('markdown preview helpers', () => {
  it('defaults markdown edit tabs to read-only preview', () => {
    // [FORK] Markdown opens rendered read-only; editing is an explicit toggle.
    expect(
      getDefaultMarkdownViewMode({
        language: 'markdown',
        mode: 'edit'
      })
    ).toBe('preview')
  })

  it('defaults markdown diffs to source mode', () => {
    expect(
      getDefaultMarkdownViewMode({
        language: 'markdown',
        mode: 'diff',
        diffSource: 'unstaged'
      })
    ).toBe('source')
  })

  it('opens dedicated preview tabs only for markdown edit tabs', () => {
    expect(
      canOpenMarkdownPreview({
        language: 'markdown',
        mode: 'edit'
      })
    ).toBe(true)
    expect(
      canOpenMarkdownPreview({
        language: 'markdown',
        mode: 'diff',
        diffSource: 'unstaged'
      })
    ).toBe(false)
  })

  it('matches the VS Code-style shortcut on macOS and Windows/Linux', () => {
    expect(
      isMarkdownPreviewShortcut(
        {
          key: 'V',
          metaKey: true,
          ctrlKey: false,
          shiftKey: true,
          altKey: false
        } as KeyboardEvent,
        'darwin'
      )
    ).toBe(true)
    expect(
      isMarkdownPreviewShortcut(
        {
          key: 'v',
          metaKey: false,
          ctrlKey: true,
          shiftKey: true,
          altKey: false
        } as KeyboardEvent,
        'linux'
      )
    ).toBe(true)
    expect(
      isMarkdownPreviewShortcut(
        {
          key: 'v',
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false
        } as KeyboardEvent,
        'linux'
      )
    ).toBe(false)
  })
})
