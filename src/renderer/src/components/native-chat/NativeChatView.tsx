import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store'
import { APP_MENU_PASTE_EVENT } from '@/lib/app-menu-paste'
import type { TuiAgent } from '../../../../shared/types'
import type { NativeChatSession } from '../../../../shared/native-chat-types'
import { resolveNativeChatSession } from './native-chat-pane-resolution'
import { useNativeChatLiveSession } from './use-native-chat-live-session'
import { selectNativeChatViewState } from './native-chat-view-state'
import { NativeChatMessageList } from './NativeChatMessageList'
import { NativeChatComposer, type NativeChatComposerHandle } from './NativeChatComposer'
import { NATIVE_FILE_DROP_TARGET } from '../../../../shared/native-file-drop'
import { useNativeChatFileDrag } from './use-native-chat-file-drag'
import { NativeChatFileDropOverlay } from './NativeChatFileDropOverlay'
import { nativeChatComposerTargetIsRemote } from './native-chat-composer-target'
import { useNativeChatFontScale } from './use-native-chat-font-scale'
import { useNativeChatCanSend } from './use-native-chat-can-send'
import { NativeChatInteractiveCard } from './NativeChatInteractiveCard'
import { NativeChatEmptyState } from './NativeChatEmptyState'
import { useNativeChatInteractiveSend } from './use-native-chat-interactive-send'
import { findTabAgentEntry } from './native-chat-tab-agent-entry'
import {
  shouldClearNativeChatWorkingSuppression,
  shouldShowNativeChatWorking
} from './native-chat-working-suppression'
import {
  applyCommandMarkerBoundaries,
  appendPendingSendCache,
  commandMarkersAsMessages,
  appendCommandMarkerCache,
  pendingSendsAsMessages,
  prunePendingSends,
  readCommandMarkerCache,
  readPendingSendCache,
  writePendingSendCache,
  type NativeChatCommandMarker,
  type NativeChatPendingSend
} from './native-chat-pending'
import {
  deriveNativeChatStreamingText,
  nativeChatStreamingMessage
} from '../../../../shared/native-chat-streaming'
import {
  shouldFocusNativeChatComposerFromEditingKey,
  shouldFocusNativeChatPaneFromPointerTarget,
  shouldRedirectNativeChatTyping
} from './native-chat-typing-redirect'
import { useNativeChatContextMenu } from './use-native-chat-context-menu'
import type { NativeChatContextMenuActions } from './use-native-chat-context-menu'
import { resolveNativeChatFileLinkContext } from './native-chat-file-link'
import { useNativeChatFileLinkClick } from './use-native-chat-file-link-click'
import { useNativeChatPlan } from './use-native-chat-plan'
import { NativeChatReviewPlanCard } from './NativeChatReviewPlanCard'
import { NativeChatSubagentContext } from './native-chat-subagent-context'

const emptyNativeChatContextMenuActions: Omit<NativeChatContextMenuActions, 'onPaste'> = {
  onSplitRight: () => {},
  onSplitDown: () => {},
  canEqualizePaneSizes: false,
  onEqualizePaneSizes: () => {},
  canExpandPane: false,
  isPaneExpanded: false,
  onToggleExpand: () => {},
  onForkAgentSession: () => {},
  onSetTitle: () => {},
  onCopyTerminalId: () => {},
  onCopyPaneId: () => {},
  canClosePane: false,
  onClosePane: () => {}
}

export type NativeChatViewProps = {
  /** The terminal tab hosting the agent. paneKey is `${tabId}:${leafId}`. */
  terminalTabId: string
  /** Specific split leaf this chat surface replaces. */
  paneKey?: string
  /** PTY bound to `paneKey`, used for composer and interactive-card sends. */
  targetPtyId?: string | null
  /** Launch-time agent hint from the TerminalTab, when Orca started one. */
  launchAgent?: TuiAgent | null
  /** Return this pane to the hosted terminal surface. */
  onSwitchToTerminal?: () => void
  contextMenuActions?: Omit<NativeChatContextMenuActions, 'onPaste'>
}

/**
 * Native chat surface for an agent terminal. Resolves the pane to its agent +
 * session id, streams the assembled conversation via the U4 live-session hook,
 * and renders the message list, live status, and all empty/loading/error
 * states. When no session id is known yet the hook surfaces live hook state on
 * an empty transcript; a true scrollback-scrape fallback (U6) is wired but only
 * runs when scrollback is obtainable — it degrades to the empty state otherwise.
 */
export default function NativeChatView({
  terminalTabId,
  paneKey: preferredPaneKey,
  targetPtyId = null,
  launchAgent,
  onSwitchToTerminal,
  contextMenuActions
}: NativeChatViewProps): React.JSX.Element {
  // Select only this tab's status entry (shallow-compared) so an unrelated
  // pane's status tick doesn't re-render this view or re-run the resolution.
  const agentStatusEntry = useAppStore(
    useShallow((s) =>
      preferredPaneKey
        ? s.agentStatusByPaneKey[preferredPaneKey]
        : findTabAgentEntry(s.agentStatusByPaneKey, terminalTabId)
    )
  )

  const resolution = useMemo(() => {
    // paneKey: prefer the live entry's key; fall back to the tab id so the hook
    // still has a stable key to select live status by before any pane reports.
    const paneKey = preferredPaneKey ?? agentStatusEntry?.paneKey ?? `${terminalTabId}:`
    return resolveNativeChatSession({
      paneKey,
      launchAgent,
      ...(agentStatusEntry ? { agentStatusEntry } : {}),
      ptyId: targetPtyId
    })
  }, [agentStatusEntry, terminalTabId, preferredPaneKey, targetPtyId, launchAgent])

  if (!resolution) {
    return <NativeChatEmptyState kind="not-agent" />
  }

  return (
    <NativeChatResolvedView
      paneKey={resolution.paneKey}
      agent={resolution.agent}
      sessionId={resolution.sessionId}
      transcriptPath={resolution.transcriptPath}
      targetPtyId={targetPtyId}
      terminalTabId={terminalTabId}
      onSwitchToTerminal={onSwitchToTerminal}
      contextMenuActions={contextMenuActions}
    />
  )
}

function NativeChatResolvedView({
  paneKey,
  agent,
  sessionId,
  transcriptPath,
  targetPtyId,
  terminalTabId,
  onSwitchToTerminal,
  contextMenuActions
}: {
  paneKey: string
  agent: NativeChatSession['agent']
  sessionId: string | null
  transcriptPath: string | null
  targetPtyId: string | null
  terminalTabId: string
  onSwitchToTerminal?: () => void
  contextMenuActions?: Omit<NativeChatContextMenuActions, 'onPaste'>
}): React.JSX.Element {
  const session = useNativeChatLiveSession({ paneKey, agent, sessionId, transcriptPath })
  // Live hook state for this pane, selected directly so the working indicator
  // flips the instant the agent reports 'working' — even when switching to chat
  // mid-turn before the transcript merge has caught up.
  const hookWorking = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.state === 'working')
  // The agent's in-progress reply preview (hook), shown as a live streaming
  // bubble while it works — before the completed turn flushes to the transcript.
  const hookPreview = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.lastAssistantMessage)
  // [FORK] While a question/approval card is up, the send queue must not flush —
  // a queued turn would land as the answer to the prompt.
  const interactivePromptActive = useAppStore((s) =>
    Boolean(s.agentStatusByPaneKey[paneKey]?.interactivePrompt)
  )
  const canSend = useNativeChatCanSend(targetPtyId)
  // [FORK] Drag-and-drop image overlay: only local sends can attach files, so
  // gate the overlay to a live local pty (remote drops would fail with a notice).
  const fileDrag = useNativeChatFileDrag(
    canSend && targetPtyId !== null && !nativeChatComposerTargetIsRemote(targetPtyId)
  )
  // Reuse the verified composer send path for interactive cards and composer
  // stop (Stop sends ESC, the agent-TUI interrupt key).
  const interactiveSend = useNativeChatInteractiveSend(terminalTabId, targetPtyId, agent)
  const [workingInterrupted, setWorkingInterrupted] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<NativeChatComposerHandle>(null)
  const fileLinkContext = useAppStore(
    useShallow((s) => resolveNativeChatFileLinkContext(s, terminalTabId))
  )
  // Delegate to the composer so a pane-level Cmd/Ctrl+V (or context-menu /
  // app-menu paste) attaches a clipboard image when present, falling back to
  // text — matching the textarea's own paste behavior and the hosted TUI.
  const pasteClipboardIntoComposer = useCallback(() => {
    composerRef.current?.pasteFromClipboard()
  }, [])
  const contextMenu = useNativeChatContextMenu({
    rootRef,
    onSwitchToTerminal,
    actions: {
      onPaste: pasteClipboardIntoComposer,
      ...(contextMenuActions ?? emptyNativeChatContextMenuActions)
    }
  })

  // Handle Cmd/Ctrl+V at the pane root rather than relying on the composer
  // textarea's own onPaste: the React-bound onPaste proved unreliable here (the
  // composer can mount more than once, and the live `paste` event does not
  // consistently dispatch to the textarea's React handler). A root capture
  // listener catches the paste for the focused pane in every case.
  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }
    const onPaste = (event: ClipboardEvent): void => {
      composerRef.current?.handlePasteEvent(event)
    }
    // Capture phase so the image is intercepted before the textarea's own
    // bubble-phase onPaste fires (which would otherwise attach it twice).
    root.addEventListener('paste', onPaste, { capture: true })
    return () => {
      root.removeEventListener('paste', onPaste, { capture: true })
    }
  }, [])

  // Real Cmd/Ctrl+V is claimed by the Edit > Paste menu accelerator, which
  // sends this app-menu paste event instead of producing a DOM `paste` event on
  // the composer. Route it into the composer whenever focus is anywhere inside
  // this chat pane — including the composer textarea itself (the previous
  // non-interactive-target guard skipped exactly the focused-textarea case,
  // which is why Cmd+V appeared to do nothing).
  useEffect(() => {
    const onAppMenuPaste = (event: Event): void => {
      const root = rootRef.current
      const activeElement = document.activeElement
      if (!root || !(activeElement instanceof Element) || !root.contains(activeElement)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      pasteClipboardIntoComposer()
    }

    window.addEventListener(APP_MENU_PASTE_EVENT, onAppMenuPaste)
    return () => {
      window.removeEventListener(APP_MENU_PASTE_EVENT, onAppMenuPaste)
    }
  }, [pasteClipboardIntoComposer])

  // Optimistic "queued" sends (mobile parity): a composer send is echoed
  // immediately and pruned once its real user turn lands in the transcript, so
  // the message never vanishes between send and transcript catch-up.
  const commandMarkerScope = useMemo(
    () => ({ paneKey, agent, sessionId }),
    [paneKey, agent, sessionId]
  )
  const pendingScope = useMemo(() => ({ paneKey, agent }), [paneKey, agent])
  const [pending, setPending] = useState<NativeChatPendingSend[]>(() =>
    readPendingSendCache(pendingScope)
  )
  const pendingCounter = useRef(0)
  // Slash commands aren't chat turns, so they get a small local "Ran /clear"
  // system line instead of a user bubble. Capped + cached per conversation.
  const [commandMarkers, setCommandMarkers] = useState<NativeChatCommandMarker[]>(() =>
    readCommandMarkerCache(commandMarkerScope)
  )
  // Reset the optimistic queue only when the pane/agent changes. A fresh launch
  // often learns its provider session id after the first send; clearing pending
  // on that transition briefly flashes the empty state before the transcript
  // user turn lands.
  useEffect(() => {
    setPending(readPendingSendCache(pendingScope))
    setWorkingInterrupted(false)
  }, [pendingScope])
  // Command markers are session-scoped because slash commands like /clear are
  // local feedback for a specific transcript boundary.
  useEffect(() => {
    setCommandMarkers(readCommandMarkerCache(commandMarkerScope))
    setWorkingInterrupted(false)
  }, [commandMarkerScope])
  // Prune echoes whose real user turn is now in the transcript.
  useEffect(() => {
    setPending((prev) =>
      writePendingSendCache(pendingScope, prunePendingSends(prev, session.messages))
    )
  }, [session.messages, pendingScope])
  const onOptimisticSend = useCallback(
    (text: string, imagePaths?: string[]) => {
      setWorkingInterrupted(false)
      pendingCounter.current += 1
      const entry: NativeChatPendingSend = {
        id: `${pendingCounter.current}`,
        text,
        sentAt: Date.now(),
        ...(imagePaths ? { imagePaths } : {})
      }
      setPending(appendPendingSendCache(pendingScope, entry))
    },
    [pendingScope]
  )
  const onSlashCommand = useCallback(
    (command: string) => {
      setCommandMarkers(appendCommandMarkerCache(commandMarkerScope, command))
    },
    [commandMarkerScope]
  )

  const sessionAfterCommandBoundaries = useMemo<typeof session>(() => {
    const messages = applyCommandMarkerBoundaries(session.messages, commandMarkers)
    return messages === session.messages ? session : { ...session, messages }
  }, [session, commandMarkers])

  // The streaming preview bubble (if any) sits after the transcript but before
  // the optimistic user echoes — same order mobile uses.
  const streamingText = useMemo(
    () =>
      deriveNativeChatStreamingText({
        messages: sessionAfterCommandBoundaries.messages,
        previewText: hookPreview,
        working: hookWorking
      }),
    [sessionAfterCommandBoundaries.messages, hookPreview, hookWorking]
  )
  const sessionWithPending = useMemo<typeof session>(() => {
    if (pending.length === 0 && commandMarkers.length === 0 && !streamingText) {
      return sessionAfterCommandBoundaries
    }
    return {
      ...sessionAfterCommandBoundaries,
      messages: [
        ...sessionAfterCommandBoundaries.messages,
        ...commandMarkersAsMessages(commandMarkers),
        ...(streamingText ? [nativeChatStreamingMessage(streamingText)] : []),
        ...pendingSendsAsMessages(pending, sessionAfterCommandBoundaries.messages)
      ]
    }
  }, [sessionAfterCommandBoundaries, pending, commandMarkers, streamingText])
  // Derive the view state from the pending-augmented session so a send into an
  // otherwise-empty conversation flips to the list (showing the queued bubble)
  // instead of staying on the empty state.
  const viewState = selectNativeChatViewState(sessionWithPending)

  const isConversation = viewState.kind === 'ready'
  // Drive "working" from the live hook state too: when toggling to chat while the
  // agent is mid-turn, the merged transcript may not yet reflect the in-flight
  // turn, but the hook already says 'working' — show the indicator immediately.
  const viewWorking = viewState.kind === 'ready' && viewState.isWorking
  useEffect(() => {
    if (shouldClearNativeChatWorkingSuppression({ viewWorking, hookWorking })) {
      setWorkingInterrupted(false)
    }
  }, [viewWorking, hookWorking])
  const isWorking = shouldShowNativeChatWorking({
    isConversation,
    viewWorking,
    hookWorking,
    interrupted: workingInterrupted
  })

  // [FORK] Plan mode: persisted selection shared with the composer + the plan
  // detected from the agent's `Plans/*.md` write, driving the status line, the
  // Review Plan card, and the plan tab.
  const plan = useNativeChatPlan({
    agent,
    terminalTabId,
    targetPtyId,
    messages: sessionWithPending.messages,
    fileLinkContext,
    isWorking
  })

  const stopAgent = useCallback(() => {
    setWorkingInterrupted(true)
    interactiveSend.cancel()
  }, [interactiveSend])
  const nativeChatFileLinkClick = useNativeChatFileLinkClick(fileLinkContext)

  // Chat-only font zoom via Cmd/Ctrl +/-/0, gated to the live conversation so
  // the chord is inert on the loading/empty/error states and elsewhere.
  const fontScale = useNativeChatFontScale(isConversation)

  // [FORK] Sub-agent steps resolve their side transcripts relative to this
  // pane's transcript path (see native-chat-subagent-context).
  const subagentContextValue = useMemo(
    () => ({ agent, parentTranscriptPath: transcriptPath }),
    [agent, transcriptPath]
  )

  return (
    <NativeChatSubagentContext.Provider value={subagentContextValue}>
      <div
        ref={rootRef}
        data-native-chat-root="true"
        // [FORK] Whole-pane image drop: the marker routes any drop over the chat to
        // the composer's onFileDrop handler; the overlay shows it's working.
        data-native-file-drop-target={NATIVE_FILE_DROP_TARGET.composer}
        onDragEnter={fileDrag.dragHandlers.onDragEnter}
        onDragLeave={fileDrag.dragHandlers.onDragLeave}
        tabIndex={-1}
        onPointerDownCapture={(event) => {
          if (event.button === 2) {
            contextMenu.onSelectionCapture()
            event.preventDefault()
            event.stopPropagation()
            return
          }
          if (event.button === 0 && shouldFocusNativeChatPaneFromPointerTarget(event.target)) {
            rootRef.current?.focus({ preventScroll: true })
          }
        }}
        onKeyDownCapture={(event) => {
          // Backspace/Delete outside an input focuses the composer (like typing)
          // but inserts nothing — let the now-focused field handle the keystroke.
          if (shouldFocusNativeChatComposerFromEditingKey(event)) {
            composerRef.current?.focus()
            return
          }
          if (!shouldRedirectNativeChatTyping(event)) {
            return
          }
          if (!composerRef.current?.insertTypedText(event.key)) {
            return
          }
          event.preventDefault()
          event.stopPropagation()
        }}
        onMouseUpCapture={contextMenu.onSelectionCapture}
        onKeyUpCapture={contextMenu.onSelectionCapture}
        onContextMenuCapture={contextMenu.onContextMenuCapture}
        className="relative flex h-full min-h-0 w-full flex-col bg-background focus:outline-none"
      >
        {fileDrag.isFileDragOver ? <NativeChatFileDropOverlay /> : null}
        <div className="flex min-h-0 flex-1 flex-col">
          {viewState.kind === 'loading' ? (
            <NativeChatEmptyState kind="loading" />
          ) : viewState.kind === 'error' ? (
            <NativeChatEmptyState kind="error" message={viewState.message} />
          ) : viewState.kind === 'empty' ? null : ( // центрируется по вертикали нижним flex-1 спейсером — как в Cursor. // [FORK] Пустой чат: убрали заглушку «Start a chat…», композер
            <NativeChatMessageList
              session={sessionWithPending}
              isWorking={isWorking}
              fontScale={fontScale.scale}
              onLinkClick={nativeChatFileLinkClick}
              allowFileUriLinks={fileLinkContext !== null}
              planStatus={plan.planStatus}
              onOpenPlan={plan.openPlan}
            />
          )}
        </div>
        {/* Live interactive cards (question / approval) render just above the
          composer while the agent's interactivePrompt is present (mobile parity). */}
        <NativeChatInteractiveCard paneKey={paneKey} send={interactiveSend} canSend={canSend} />
        {/* [FORK] Cursor-style Review Plan card: appears once Plan mode writes a
          plan; opens the full plan (right split) and Builds it. */}
        {plan.showPlanCard && plan.plan ? (
          <NativeChatReviewPlanCard
            title={plan.plan.title}
            preview={plan.plan.preview}
            buildModelAlias={plan.modelSelection.selection.model}
            onSelectBuildModel={plan.selectBuildModel}
            onOpen={plan.openPlan}
            onBuild={plan.buildPlan}
            onDismiss={plan.dismissPlan}
          />
        ) : null}
        {/* canSend reflects the mobile presence-lock: when a mobile client holds
          the pty, the composer shows its guarded state instead of racing the
          mobile driver (R8). */}
        {/* [FORK] Scale the composer with the same chat zoom (Cmd/Ctrl +/-/0) so the
          input font stays in step with the transcript text. */}
        <div style={{ zoom: fontScale.scale } as React.CSSProperties}>
          <NativeChatComposer
            ref={composerRef}
            terminalTabId={terminalTabId}
            targetPtyId={targetPtyId}
            agent={agent}
            canSend={canSend}
            isWorking={isWorking}
            onStop={stopAgent}
            onOptimisticSend={onOptimisticSend}
            onSlashCommand={onSlashCommand}
            modelSelection={plan.modelSelection}
            queuePaused={interactivePromptActive}
          />
        </div>
        {/* [FORK] Нижний спейсер: в пустом чате балансирует верхний flex-1,
          выставляя композер по центру пейна (как в Cursor). */}
        {viewState.kind === 'empty' ? <div className="flex-1" /> : null}
        {contextMenu.menu}
      </div>
    </NativeChatSubagentContext.Provider>
  )
}
