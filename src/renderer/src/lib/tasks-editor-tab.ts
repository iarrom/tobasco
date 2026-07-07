// [FORK] Идентификатор виртуального editor-таба модуля Tasks (см.
// openTasksEditorTab). Живёт отдельным модулем, чтобы sync-слои могли отличать
// таб задач от настоящих файлов, не импортируя весь editor-слайс.
export const TASKS_EDITOR_TAB_ID_PREFIX = 'orca-tasks://'

export function tasksEditorTabId(worktreeId: string): string {
  return `${TASKS_EDITOR_TAB_ID_PREFIX}${worktreeId}`
}

export function isTasksEditorTabId(id: string): boolean {
  return id.startsWith(TASKS_EDITOR_TAB_ID_PREFIX)
}
