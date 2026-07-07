// [FORK] Инлайн-список агентов под worktree-карточкой. Дисклоузер живёт в
// самой строке воркспейса (чеврон в title row WorktreeCard, Cursor-стиль) —
// отдельной строки-заголовка «Агенты · N» больше нет. Collapse-состояние — в
// fork-сторе панели агентов (персистится в localStorage).
import { useAgentPanelState } from '@/components/agent-panel/agent-panel-state'

export function SidebarWorktreeAgentsSection({
  worktreeId,
  className,
  children
}: {
  worktreeId: string
  className?: string
  children: React.ReactNode
}): React.JSX.Element | null {
  const collapsed = useAgentPanelState(
    (s) => s.sidebarAgentsCollapsedByWorktreeId[worktreeId] ?? false
  )

  if (collapsed) {
    return null
  }
  // Пустое состояние обрабатывает сам список (WorktreeCardAgents рендерит
  // null без агентов); тесты карточки ожидают его смонтированным.
  return <div className={className}>{children}</div>
}

export default SidebarWorktreeAgentsSection
