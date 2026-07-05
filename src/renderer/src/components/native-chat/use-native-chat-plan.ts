// [FORK] Plan-mode controller for the native chat view: owns the persisted model
// selection (shared with the composer), detects the plan the agent writes to
// `Plans/*.md`, and exposes the open/build/dismiss actions for the Review Plan
// card + the transcript status line. Kept out of NativeChatView so that file
// stays within the max-lines budget.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { getSettingsForAgentTabRuntimeOwner } from '@/lib/agent-paste-draft'
import { openNativeChatPlanTab } from '@/lib/open-plan-tab'
import { onPlanBuilt, registerPlanTabContext } from '@/lib/plan-tab-registry'
import {
  useNativeChatModelSelection,
  type NativeChatModelSelectionState
} from './use-native-chat-model-selection'
import {
  deriveLatestNativeChatPlan,
  type NativeChatDetectedPlan
} from './native-chat-plan-detection'
import { buildNativeChatPlanExecuteMessage } from './native-chat-plan-build'
import { buildNativeChatModelCommand } from './native-chat-model-command'
import { sendNativeChatMessage } from './native-chat-runtime-send'
import type { NativeChatFileLinkContext } from './native-chat-file-link'

export type NativeChatPlanController = {
  modelSelection: NativeChatModelSelectionState
  planStatus: 'creating' | 'created' | null
  showPlanCard: boolean
  plan: NativeChatDetectedPlan | null
  openPlan: () => void
  buildPlan: () => void
  selectBuildModel: (alias: string) => void
  dismissPlan: () => void
}

export function useNativeChatPlan(params: {
  agent: string
  terminalTabId: string
  targetPtyId: string | null
  messages: readonly NativeChatMessage[]
  fileLinkContext: NativeChatFileLinkContext | null
  isWorking: boolean
}): NativeChatPlanController {
  const { agent, terminalTabId, targetPtyId, messages, fileLinkContext, isWorking } = params
  const modelSelection = useNativeChatModelSelection(agent)
  const planMode = agent === 'claude' && modelSelection.selection.planMode
  const [dismissedPlanPath, setDismissedPlanPath] = useState<string | null>(null)
  // Built is tracked separately from dismissed: X only hides the card (the
  // "Created plan" line stays as the way back to the plan), while Build hides
  // both — the plan is being executed, the status line is done.
  const [builtPlanPath, setBuiltPlanPath] = useState<string | null>(null)

  const plan = useMemo(
    () => deriveLatestNativeChatPlan(messages, fileLinkContext?.worktreePath),
    [messages, fileLinkContext?.worktreePath]
  )
  const planStatus: 'creating' | 'created' | null =
    isWorking && planMode ? 'creating' : plan && plan.path !== builtPlanPath ? 'created' : null

  const openPlan = useCallback(() => {
    if (!plan || !fileLinkContext) {
      return
    }
    // Register first so the tab mounts straight into the plan chrome
    // (breadcrumb + model + Build) instead of the standard editor header.
    registerPlanTabContext({
      planPath: plan.path,
      relativePath: plan.relativePath,
      title: plan.title,
      agent,
      terminalTabId,
      targetPtyId,
      worktreeId: fileLinkContext.worktreeId
    })
    openNativeChatPlanTab({
      planPath: plan.path,
      worktreeId: fileLinkContext.worktreeId,
      worktreePath: fileLinkContext.worktreePath,
      runtimeEnvironmentId: fileLinkContext.runtimeEnvironmentId
    })
  }, [plan, fileLinkContext, agent, terminalTabId, targetPtyId])

  // Auto-open the plan tab the moment the agent writes `Plans/*.md` in a live
  // turn (Cursor parity). Gated on having seen this pane working so a cold
  // transcript restore never yanks a split open; once per plan path.
  const sawWorkingRef = useRef(false)
  if (isWorking) {
    sawWorkingRef.current = true
  }
  const autoOpenedPlanPathRef = useRef<string | null>(null)
  useEffect(() => {
    if (!planMode || !plan || !sawWorkingRef.current) {
      return
    }
    if (autoOpenedPlanPathRef.current === plan.path) {
      return
    }
    autoOpenedPlanPathRef.current = plan.path
    openPlan()
  }, [planMode, plan, openPlan])

  const selectBuildModel = useCallback(
    (alias: string) => {
      const next = modelSelection.update({ model: alias })
      if (targetPtyId) {
        sendNativeChatMessage(
          getSettingsForAgentTabRuntimeOwner(terminalTabId),
          targetPtyId,
          buildNativeChatModelCommand(alias, next.context)
        )
      }
    },
    [modelSelection, targetPtyId, terminalTabId]
  )

  const buildPlan = useCallback(() => {
    if (!plan) {
      return
    }
    // Leave plan mode and tell the agent to implement the saved plan.
    modelSelection.update({ planMode: false })
    if (targetPtyId) {
      sendNativeChatMessage(
        getSettingsForAgentTabRuntimeOwner(terminalTabId),
        targetPtyId,
        buildNativeChatPlanExecuteMessage(plan.relativePath)
      )
    }
    setDismissedPlanPath(plan.path)
    setBuiltPlanPath(plan.path)
  }, [plan, modelSelection, targetPtyId, terminalTabId])

  const dismissPlan = useCallback(() => {
    if (plan) {
      setDismissedPlanPath(plan.path)
    }
  }, [plan])

  // Build can also run from the plan tab's header (another split group): hide
  // the card and sync this instance's persisted plan-mode state.
  useEffect(
    () =>
      onPlanBuilt((path) => {
        setDismissedPlanPath(path)
        setBuiltPlanPath(path)
        modelSelection.update({ planMode: false })
      }),
    [modelSelection]
  )

  return {
    modelSelection,
    planStatus,
    showPlanCard: plan !== null && plan.path !== dismissedPlanPath,
    plan,
    openPlan,
    buildPlan,
    selectBuildModel,
    dismissPlan
  }
}
