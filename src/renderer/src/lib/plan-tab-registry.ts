// [FORK] Runtime-only registry connecting a plan document tab to the native chat
// pane that produced it. The plan tab renders in another split group, so its
// header needs the chat's pty context (Build / model slash-commands) without
// prop threading through upstream tab plumbing. Keyed by absolute plan path;
// entries are session-scoped — after an app restart the tab simply renders as a
// plain markdown preview.

import { useSyncExternalStore } from 'react'

export type PlanTabContext = {
  planPath: string
  /** `Plans/<name>.md` suffix used by the Build execute message. */
  relativePath: string
  title: string
  agent: string
  terminalTabId: string
  targetPtyId: string | null
  worktreeId: string
}

const contextsByPlanPath = new Map<string, PlanTabContext>()
const contextListeners = new Set<() => void>()

type PlanBuiltListener = (planPath: string) => void
const builtListeners = new Set<PlanBuiltListener>()

export function registerPlanTabContext(context: PlanTabContext): void {
  contextsByPlanPath.set(context.planPath, context)
  for (const listener of contextListeners) {
    listener()
  }
}

export function getPlanTabContext(planPath: string): PlanTabContext | null {
  return contextsByPlanPath.get(planPath) ?? null
}

function subscribePlanTabContexts(listener: () => void): () => void {
  contextListeners.add(listener)
  return () => {
    contextListeners.delete(listener)
  }
}

/** The registered context for `planPath`, re-rendering if registration lands
 *  after the tab mounted (e.g. chat re-opens the same plan). */
export function usePlanTabContext(planPath: string): PlanTabContext | null {
  return useSyncExternalStore(subscribePlanTabContexts, () => getPlanTabContext(planPath))
}

/** Build ran from the plan tab header — lets the owning chat hide its Review
 *  Plan card and sync its in-memory plan-mode state. */
export function notifyPlanBuilt(planPath: string): void {
  for (const listener of builtListeners) {
    listener(planPath)
  }
}

export function onPlanBuilt(listener: PlanBuiltListener): () => void {
  builtListeners.add(listener)
  return () => {
    builtListeners.delete(listener)
  }
}
