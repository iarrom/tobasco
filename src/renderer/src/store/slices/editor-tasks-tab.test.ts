// [FORK] Задачи как вкладка: openTasksEditorTab открывает виртуальный
// editor-таб модуля Tasks и не плодит дубликаты при повторном клике.
import { describe, expect, it } from 'vitest'
import { tasksEditorTabId } from '@/lib/tasks-editor-tab'
import { createTestStore } from './store-test-helpers'

describe('openTasksEditorTab', () => {
  it('opens a virtual tasks tab and activates the editor surface', () => {
    const store = createTestStore()

    store.getState().openTasksEditorTab('wt-1', 'Tasks')

    const id = tasksEditorTabId('wt-1')
    const file = store.getState().openFiles.find((f) => f.id === id)
    expect(file).toMatchObject({
      id,
      filePath: id,
      relativePath: 'Tasks',
      worktreeId: 'wt-1',
      mode: 'tasks',
      isDirty: false
    })
    expect(store.getState().activeFileId).toBe(id)
    expect(store.getState().activeTabType).toBe('editor')
    expect(store.getState().activeFileIdByWorktree['wt-1']).toBe(id)
  })

  it('reuses the existing tasks tab instead of duplicating it', () => {
    const store = createTestStore()

    store.getState().openTasksEditorTab('wt-1', 'Tasks')
    store.getState().openTasksEditorTab('wt-1', 'Tasks')

    const id = tasksEditorTabId('wt-1')
    expect(store.getState().openFiles.filter((f) => f.id === id)).toHaveLength(1)
  })

  it('keeps tasks tabs out of the persisted edit-file session payload', () => {
    const store = createTestStore()

    store.getState().openTasksEditorTab('wt-1', 'Tasks')

    // Why: restart only restores edit-mode files (workspace-session.ts); the
    // virtual tab must not leak a synthetic orca-tasks:// path into the payload.
    const editFiles = store.getState().openFiles.filter((f) => f.mode === 'edit')
    expect(editFiles).toHaveLength(0)
  })
})
