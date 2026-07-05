// [FORK] Message the agent receives when the user clicks Build on a plan: leave
// plan mode and implement the saved plan, working the To-do in order. Pure so the
// exact wording stays unit-testable and shared by the card + the plan tab.

import { nativeChatPlanRelativePath } from './native-chat-plan-instruction'

export function buildNativeChatPlanExecuteMessage(planPath: string): string {
  const rel = nativeChatPlanRelativePath(planPath)
  return [
    `Implement the plan in \`${rel}\`.`,
    'Work through its `## To-do` checklist in order, checking off each item as',
    'you complete it. You may now edit files and run the necessary commands.'
  ].join(' ')
}
