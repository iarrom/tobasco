import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { useAppStore } from '../../store'
import type { AgentType } from '../../../../shared/agent-status-types'
import { NATIVE_FILE_DROP_TARGET } from '../../../../shared/native-file-drop'
import { sendRuntimePtyInput } from '@/runtime/runtime-terminal-inspection'
import { getSettingsForAgentTabRuntimeOwner } from '@/lib/agent-paste-draft'
import { getAgentSlashCommands } from './native-chat-agent-commands'
import {
  applyMentionSuggestion,
  applySkillSuggestion,
  deriveComposerAutocomplete,
  EMPTY_HISTORY,
  type HistoryState
} from './native-chat-composer-state'
import { readNativeChatDraftCache } from './native-chat-draft-cache'
import { useNativeChatDraft } from './use-native-chat-draft'
import { NativeChatComposerField } from './NativeChatComposerField'
import {
  nativeChatComposerTargetIsRemote,
  resolveNativeChatImagePasteTarget,
  type NativeChatResolvedTarget
} from './native-chat-composer-target'
import { useNativeChatSkills } from './use-native-chat-skills'
import { useNativeChatComposerAttachments } from './use-native-chat-composer-attachments'
import { useNativeChatComposerPaste } from './use-native-chat-composer-paste'
// [FORK] Чипы пастнутых дампов элементов.
import type { PastedElementDump } from './native-chat-prompt-tokens'
import { useNativeChatComposerDictation } from './use-native-chat-composer-dictation'
import { useNativeChatComposerKeyDown } from './use-native-chat-composer-keydown'
import { NativeChatModelPickerContainer } from './NativeChatModelPickerContainer'
import { NativeChatComposerAddMenu } from './NativeChatComposerAddMenu'
import type { NativeChatModelSelectionState } from './use-native-chat-model-selection'
import type { NativeChatPlanModeState } from './use-native-chat-plan-mode'
import { useNativeChatPlanComposer } from './use-native-chat-plan-composer'
import { useNativeChatUniversalSlash } from './use-native-chat-universal-slash'
import { useNativeChatComposerSend } from './use-native-chat-composer-send'
import { useNativeChatComposerQueue } from './use-native-chat-composer-queue'
import { NativeChatSendQueue } from './NativeChatSendQueue'

// Why: a plain ESC byte is what the agent TUIs read as the interrupt key over a
// PTY (matching how xterm forwards Escape). The richer interrupt-intent
// inference (agent-interrupt-intent.ts) is driven by the existing PTY input
// observers, so writing ESC through the same send path feeds that machinery.
const ESC = '\x1b'

export type NativeChatComposerProps = {
  /** Tab hosting the agent; used to resolve the live ptyId + runtime settings. */
  terminalTabId: string
  /** Specific split-pane PTY this chat view owns. */
  targetPtyId: string | null
  agent: AgentType
  /**
   * Mobile presence-lock seam (R8): when a mobile client holds the pty, desktop
   * sends must be guarded rather than silently dropped. U9 wires the real lock
   * state in; until then this defaults to `true` (sendable) and the composer
   * already renders the guarded/disabled affordance when it is `false`.
   */
  canSend?: boolean
  /** True while the hosted TUI reports an in-flight turn; swaps Send to Stop. */
  isWorking?: boolean
  /** Interrupt the hosted agent, usually by sending ESC into the PTY. */
  onStop?: () => void
  /** Optional optimistic-send hook: called with the sent text so the view can
   *  render a "queued" echo until the real transcript turn lands (mobile parity). */
  onOptimisticSend?: (text: string, imagePaths?: string[]) => void
  /** Called with a dispatched slash command (e.g. `/clear`) so the view can show
   *  a small "Ran /clear" system line — slash commands aren't chat turns and
   *  otherwise leave no visible trace that anything happened. */
  onSlashCommand?: (command: string) => void
  /** [FORK] Persisted per-agent model selection, owned by the view so the
   *  composer, the plan status line, and the docked plan card share one source. */
  modelSelection: NativeChatModelSelectionState
  /** [FORK] Per-tab Plan toggle, owned by the view (same sharing rationale) —
   *  scoped per conversation so Plan in one project can't flip other chats. */
  planModeState: NativeChatPlanModeState
  /** [FORK] Pause auto-flushing the send queue (e.g. an interactive question
   *  card is up and a queued turn would answer it by accident). */
  queuePaused?: boolean
}

export type NativeChatComposerHandle = {
  focus: () => boolean
  insertTypedText: (text: string) => boolean
  /** Handle a paste event captured at the pane root (the OS frequently
   *  retargets the paste off the focused textarea, so its own onPaste can't be
   *  relied on). An image is intercepted and attached; text falls through. */
  handlePasteEvent: (event: {
    clipboardData: DataTransfer | null
    preventDefault: () => void
    defaultPrevented: boolean
  }) => void
  /** Paste the clipboard into the composer with no event in hand (menu paste):
   *  an image becomes an attachment, otherwise text is inserted at the caret. */
  pasteFromClipboard: () => void
}

/**
 * Rich native input for the chat view. Sends prompts into the running agent
 * through the same verified runtime path as typed input (KTD4), so the agent
 * cannot distinguish native input from keystrokes. Enter sends; Shift+Enter
 * inserts a newline; multi-line is bracketed-paste wrapped; Esc interrupts.
 * Slash-command and `@file` autocomplete are agent-aware; image paste persists a
 * temp file and injects the agent-appropriate path (or reports unsupported).
 */
export const NativeChatComposer = forwardRef<NativeChatComposerHandle, NativeChatComposerProps>(
  function NativeChatComposer(
    {
      terminalTabId,
      targetPtyId,
      agent,
      canSend = true,
      isWorking = false,
      onStop,
      onOptimisticSend,
      onSlashCommand,
      modelSelection,
      planModeState,
      queuePaused = false
    },
    ref
  ): React.JSX.Element {
    // Scope key shared with image attachments so an unsent draft + its attached
    // images survive the composer unmounting on a TUI/GUI toggle.
    const draftScopeKey = targetPtyId ?? terminalTabId
    const { draft, setDraft } = useNativeChatDraft(draftScopeKey)
    // [FORK] Дампы элементов, распознанные при вставке, — чипы над полем ввода.
    const [elementAttachments, setElementAttachments] = useState<PastedElementDump[]>([])
    const attachElementDumps = useCallback((dumps: PastedElementDump[]) => {
      setElementAttachments((prev) => [...prev, ...dumps])
    }, [])
    const removeElementAttachment = useCallback((index: number) => {
      setElementAttachments((prev) => prev.filter((_, i) => i !== index))
    }, [])
    const clearElementAttachments = useCallback(() => setElementAttachments([]), [])
    // [FORK] Model selection is owned by the view so the picker and the plan
    // surfaces share one source; plan mode arrives separately (per-tab state).
    const { selection, update: updateModelSelection } = modelSelection
    const [caret, setCaret] = useState(draft.length)
    const [history, setHistory] = useState<HistoryState>(EMPTY_HISTORY)
    const [activeSuggestion, setActiveSuggestion] = useState(0)
    const [notice, setNotice] = useState<string | null>(null)
    const skills = useNativeChatSkills(agent, terminalTabId)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const {
      dictationDisabled,
      isDictating,
      isDictationHoldMode,
      toggleDictation,
      startHoldDictation,
      stopHoldDictation
    } = useNativeChatComposerDictation(textareaRef)

    // Place the caret at the end of the (possibly restored) draft when the
    // composer is reused for a different pane. Adjusted during render (matching
    // the draft reload) so caret and text stay consistent on the first paint.
    const lastDraftScopeKey = useRef(draftScopeKey)
    if (lastDraftScopeKey.current !== draftScopeKey) {
      lastDraftScopeKey.current = draftScopeKey
      setCaret(readNativeChatDraftCache(draftScopeKey).length)
    }

    const agentCommands = useMemo(() => getAgentSlashCommands(agent), [agent])
    const autocomplete = useMemo(
      () =>
        deriveComposerAutocomplete(draft, caret, agentCommands, agent === 'codex' ? skills : []),
      [draft, caret, agentCommands, agent, skills]
    )

    // Resolve the live ptyId for this chat leaf; runtime owner settings route
    // local vs remote (SSH) sends.
    const resolveTarget = useCallback((): NativeChatResolvedTarget | null => {
      if (!targetPtyId) {
        return null
      }
      return { ptyId: targetPtyId, settings: getSettingsForAgentTabRuntimeOwner(terminalTabId) }
    }, [targetPtyId, terminalTabId])

    const hasPty = targetPtyId !== null
    const disabled = !hasPty || !canSend

    // [FORK] Plan mode (Claude-only): the toggle lives inside the "+" menu, an
    // amber indicator shows under the input while active, and the outgoing-prompt
    // wrapper turns each turn into a research-only plan request.
    const {
      supportsPlanMode,
      planMode,
      togglePlanMode,
      planPill,
      placeholder: planPlaceholder,
      wrapOutgoing
    } = useNativeChatPlanComposer({ agent, planModeState })

    const syncCaret = useCallback((el: HTMLTextAreaElement) => {
      setCaret(el.selectionStart ?? el.value.length)
    }, [])

    const {
      imageAttachments,
      attachLocalPaths,
      attachHostResolvedImagePaths,
      clearImageAttachments,
      removeImageAttachment
    } = useNativeChatComposerAttachments({
      attachmentScopeKey: targetPtyId ?? terminalTabId,
      caret,
      resolveTarget,
      textareaRef,
      setCaret,
      setDraft,
      setNotice
    })
    const sendButtonDisabled = isWorking
      ? !hasPty || !onStop
      : disabled ||
        (draft.trim() === '' && imageAttachments.length === 0 && elementAttachments.length === 0)

    const insertTypedText = useCallback(
      (text: string): boolean => {
        const textarea = textareaRef.current
        if (!textarea || textarea.disabled) {
          return false
        }
        const selectionStart = textarea.selectionStart ?? caret
        const selectionEnd = textarea.selectionEnd ?? selectionStart
        const next = `${draft.slice(0, selectionStart)}${text}${draft.slice(selectionEnd)}`
        const nextCaret = selectionStart + text.length
        textarea.focus()
        setDraft(next)
        setCaret(nextCaret)
        setHistory((prev) => ({ entries: prev.entries, index: null }))
        setActiveSuggestion(0)
        requestAnimationFrame(() => {
          textarea.setSelectionRange(nextCaret, nextCaret)
        })
        return true
      },
      [caret, draft, setDraft]
    )

    const focus = useCallback((): boolean => {
      const textarea = textareaRef.current
      if (!textarea || textarea.disabled) {
        return false
      }
      textarea.focus()
      return true
    }, [])

    const resolveImagePasteTarget = useCallback(
      () => resolveNativeChatImagePasteTarget(useAppStore.getState(), terminalTabId),
      [terminalTabId]
    )

    const { handlePaste, pasteFromClipboard } = useNativeChatComposerPaste({
      agent,
      disabled,
      caret,
      attachHostResolvedImagePaths,
      resolveImagePasteTarget,
      insertTypedText,
      attachElementDumps,
      setCaret,
      setNotice
    })

    useImperativeHandle(
      ref,
      () => ({ focus, insertTypedText, handlePasteEvent: handlePaste, pasteFromClipboard }),
      [focus, insertTypedText, handlePaste, pasteFromClipboard]
    )

    useEffect(() => {
      return window.api.ui.onFileDrop((payload) => {
        if (payload.target !== NATIVE_FILE_DROP_TARGET.composer) {
          return
        }
        attachLocalPaths(payload.paths)
      })
    }, [attachLocalPaths])

    const pickAttachment = useCallback(() => {
      void (async () => {
        const filePath = await window.api.shell.pickAttachment()
        if (!filePath) {
          return
        }
        attachLocalPaths([filePath])
      })()
    }, [attachLocalPaths])

    // [FORK] Cursor-style send queue: while the agent is mid-turn, chat turns
    // wait above the composer and flush one-by-one as the agent goes idle.
    const sendQueue = useNativeChatComposerQueue({
      agent,
      isWorking,
      disabled,
      queuePaused,
      resolveTarget,
      wrapOutgoing,
      onOptimisticSend,
      setDraft,
      setCaret,
      attachLocalPaths,
      textareaRef
    })

    const send = useNativeChatComposerSend({
      agent,
      draft,
      imageAttachments,
      elementAttachments,
      clearElementAttachments,
      disabled,
      resolveTarget,
      wrapOutgoing,
      onOptimisticSend,
      onSlashCommand,
      enqueue: sendQueue.enqueueWhileWorking,
      setDraft,
      setCaret,
      setHistory,
      clearImageAttachments,
      setNotice
    })

    // [FORK] Cursor-style model picker next to the "+" button; the container owns
    // the persisted selection and types the matching slash command into the TUI.
    const modelPicker = (
      <NativeChatModelPickerContainer
        agent={agent}
        disabled={disabled}
        resolveTarget={resolveTarget}
        selection={selection}
        update={updateModelSelection}
      />
    )

    // [FORK] Cursor-style "+" menu (Image / Plan mode / Skills / MCP Servers)
    // replacing the bare attach button. Skills insert the app's `$name` reference.
    const addMenu = (
      <NativeChatComposerAddMenu
        agent={agent}
        terminalTabId={terminalTabId}
        disabled={disabled}
        localSession={targetPtyId !== null && !nativeChatComposerTargetIsRemote(targetPtyId)}
        onAttachImage={pickAttachment}
        onInsertSkill={(skillName) => insertTypedText(`$${skillName} `)}
        planMode={supportsPlanMode ? planMode : undefined}
        onTogglePlanMode={supportsPlanMode ? togglePlanMode : undefined}
      />
    )

    const interrupt = useCallback(() => {
      if (isWorking && onStop) {
        onStop()
        return
      }
      const target = resolveTarget()
      if (!target) {
        return
      }
      sendRuntimePtyInput(target.settings, target.ptyId, ESC)
    }, [isWorking, onStop, resolveTarget])

    // [FORK] Universal `/` menu (Cursor parity): Skills + Commands + Modes in one
    // sectioned popover; the hook owns command insert/dispatch semantics too.
    const { slashItems, chooseSlashItem } = useNativeChatUniversalSlash({
      agent,
      terminalTabId,
      autocomplete,
      draft,
      caret,
      agentCommands,
      disabled,
      supportsPlanMode,
      planMode,
      togglePlanMode,
      resolveTarget,
      onSlashCommand,
      setDraft,
      setCaret,
      setActiveSuggestion,
      setHistory,
      setNotice,
      textareaRef
    })

    const handleKeyDown = useNativeChatComposerKeyDown({
      autocomplete,
      activeSuggestion,
      draft,
      caret,
      history,
      slashItems,
      chooseSlashItem,
      interrupt,
      send,
      setActiveSuggestion,
      setDraft,
      setCaret,
      setHistory
    })

    return (
      <>
        <NativeChatSendQueue
          items={sendQueue.items}
          onEdit={sendQueue.editQueuedMessage}
          onSendNow={sendQueue.sendNow}
          onRemove={sendQueue.remove}
        />
        <NativeChatComposerField
          textareaRef={textareaRef}
          draft={draft}
          disabled={disabled}
          hasPty={hasPty}
          canSend={canSend}
          autocomplete={autocomplete}
          activeSuggestion={activeSuggestion}
          notice={notice}
          imageAttachments={imageAttachments}
          elementAttachments={elementAttachments}
          onRemoveElementAttachment={removeElementAttachment}
          sendButtonDisabled={sendButtonDisabled}
          isWorking={isWorking}
          attachDisabled={disabled}
          dictationDisabled={dictationDisabled}
          isDictating={isDictating}
          isDictationHoldMode={isDictationHoldMode}
          modelPicker={modelPicker}
          addMenu={addMenu}
          planPill={planPill}
          placeholder={planPlaceholder}
          onDraftChange={(value, element) => {
            setDraft(value)
            setHistory((prev) => ({ entries: prev.entries, index: null }))
            syncCaret(element)
            setActiveSuggestion(0)
          }}
          onTextareaSelect={syncCaret}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          slashItems={slashItems}
          onChooseSlashItem={(item) => chooseSlashItem(item, 'submit')}
          onAcceptMention={() => {
            if (autocomplete.mode !== 'mention') {
              return
            }
            const result = applyMentionSuggestion(draft, caret, autocomplete.query)
            setDraft(result.draft)
            setCaret(result.caret)
            textareaRef.current?.focus()
          }}
          onChooseSkill={(skill) => {
            const result = applySkillSuggestion(draft, caret, skill.name)
            setDraft(result.draft)
            setCaret(result.caret)
            setActiveSuggestion(0)
            textareaRef.current?.focus()
          }}
          onRemoveImageAttachment={(id) => removeImageAttachment(id)}
          onAttach={pickAttachment}
          onDictationToggle={toggleDictation}
          onDictationHoldStart={startHoldDictation}
          onDictationHoldEnd={stopHoldDictation}
          onSend={send}
          onStop={onStop}
        />
      </>
    )
  }
)
