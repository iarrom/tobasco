import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ListChecks, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import type { NativeChatLiveSession } from './use-native-chat-live-session'
import { orderNativeChatMessages } from './native-chat-message-grouping'
import { stripNoiseMessages, unwrapPlanPromptMessages } from './native-chat-noise'
import { foldToolMessages, splitNativeChatBlocks } from './native-chat-tool-fold'
import { isNearBottom, shouldShowJumpToLatest, type ScrollGeometry } from './native-chat-autoscroll'
import { MessageRow } from './NativeChatMessageRow'
import { NativeChatWorkGroup } from './NativeChatWorkGroup'
import { buildNativeChatTurnGroups } from './native-chat-turn-groups'
import { NATIVE_CHAT_STREAMING_ID } from '../../../../shared/native-chat-streaming'

/** Trailing muted descriptor for a finished "Thought" step, derived from the
 *  gap between the reasoning message and the turn's next message. */
function formatThoughtDuration(start: number | null, end: number | null | undefined): string {
  if (typeof start !== 'number' || typeof end !== 'number' || end <= start) {
    return translate('components.native-chat.thought.briefly', 'briefly')
  }
  const seconds = Math.round((end - start) / 1000)
  if (seconds < 2) {
    return translate('components.native-chat.thought.briefly', 'briefly')
  }
  if (seconds < 60) {
    return translate('components.native-chat.thought.forSeconds', 'for {{count}}s', {
      count: seconds
    })
  }
  return translate('components.native-chat.thought.forMinutes', 'for {{count}}m', {
    count: Math.round(seconds / 60)
  })
}

function geometryOf(el: HTMLElement): ScrollGeometry {
  return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
}

/** [FORK] Plan-mode status line shown after the turn's "Worked for…" summary:
 *  "Creating plan…" shimmers while the plan turn runs; "Created plan" is a muted
 *  affordance that opens the plan tab once the plan file is written. */
function NativeChatPlanStatusLine({
  status,
  title,
  onOpen
}: {
  status: 'creating' | 'created'
  /** [FORK] Заголовок плана для карточки «Created plan». */
  title?: string | null
  onOpen?: () => void
}): React.JSX.Element {
  const label =
    status === 'creating'
      ? translate('components.native-chat.plan.creating', 'Creating plan…')
      : translate('components.native-chat.plan.created', 'Created plan')
  const content = (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <ListChecks className="size-3.5 shrink-0" />
      <span className={cn(status === 'creating' && 'native-chat-step-shimmer')}>{label}</span>
    </span>
  )
  // [FORK] Готовый план — карточка как в Cursor: приглушённый лейбл, заголовок
  // плана, шеврон справа; вся карточка открывает план.
  if (status === 'created' && onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-input bg-card px-4 py-2.5 text-left shadow-xs transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
      >
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{label}</span>
          {title ? <span className="block truncate text-sm text-foreground">{title}</span> : null}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    )
  }
  return <div className="py-0.5">{content}</div>
}

// [FORK] Shimmering muted "Thinking…" label instead of the stock bouncing dots,
// matching the active thought-step treatment. When the TUI live preview knows
// what the agent is doing, its spinner status replaces the static label
// («Hardening transcript watcher…» instead of «Thinking…»).
function TypingIndicatorRow({ label }: { label?: string | null }): React.JSX.Element {
  return (
    <div
      className="flex items-center justify-start"
      aria-label={translate('components.native-chat.status.responding', 'Agent is responding')}
      aria-live="polite"
    >
      <div className="flex h-8 items-center text-muted-foreground">
        <span className="native-chat-step-shimmer text-sm font-medium">
          {label ? `${label}…` : translate('components.native-chat.thought.active', 'Thinking…')}
        </span>
      </div>
    </div>
  )
}

export function NativeChatMessageList({
  session,
  isWorking,
  fontScale,
  onLinkClick,
  allowFileUriLinks = false,
  failedDeliveryMessageIds,
  // [FORK]
  planStatus = null,
  planTitle = null,
  onOpenPlan,
  onEditSendUserMessage,
  liveStatus = null
}: {
  session: NativeChatLiveSession
  isWorking: boolean
  /** Chat-only text multiplier (1 = default), driven by the zoom shortcuts. */
  fontScale: number
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
  failedDeliveryMessageIds?: ReadonlySet<string>
  /** [FORK] Plan-mode transcript status: shimmering "Creating plan…" while the
   *  plan turn works, "Created plan" (clickable) once the plan file is written. */
  planStatus?: 'creating' | 'created' | null
  /** [FORK] Заголовок готового плана — для Cursor-карточки в переписке. */
  planTitle?: string | null
  onOpenPlan?: () => void
  /** [FORK] Отправка отредактированного сообщения (click-to-edit пузыря). */
  onEditSendUserMessage?: (text: string) => void
  /** [FORK] Живой статус из TUI-вьюпорта агента (спиннер): лейбл текущего
   *  действия и признак «модель размышляет». */
  liveStatus?: { label: string; thinking: boolean } | null
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [stuckToBottom, setStuckToBottom] = useState(true)
  const [showJump, setShowJump] = useState(false)

  // Why: mirror stuck state into a ref so the auto-scroll layout effect can read
  // it without depending on it — depending on stuckToBottom (which scrollToBottom
  // sets) would re-fire the effect in a self-loop.
  const stuckToBottomRef = useRef(stuckToBottom)
  stuckToBottomRef.current = stuckToBottom

  const { hasMore, loadingEarlier, loadEarlier } = session

  // Strip harness noise (task-notifications, system reminders, slash-command
  // envelopes) before folding so they don't render as the user's own bubbles —
  // matching the mobile chat. Then fold each turn's tool activity into the
  // assistant message it belongs to, ordered stably, so a turn's tools collapse
  // under one run.
  const messages = useMemo(
    () =>
      foldToolMessages(
        orderNativeChatMessages(unwrapPlanPromptMessages(stripNoiseMessages(session.messages)))
      ),
    [session.messages]
  )

  const hasStreamingBubble = messages.some((message) => message.id === NATIVE_CHAT_STREAMING_ID)

  // The agent's active step is the last transcript message while working, unless
  // the answer is already streaming (then the streaming bubble leads, no step
  // shimmers). Drives the shimmer on exactly one step's label; the typing dots
  // only show when there's no active step to shimmer.
  const activeStepId = useMemo(() => {
    if (!isWorking || hasStreamingBubble || messages.length === 0) {
      return null
    }
    // [FORK] While the TUI spinner reports the model is reasoning, the last
    // transcript step is finished work — shimmering it would claim a tool is
    // still running. The live status row below takes over instead.
    if (liveStatus?.thinking) {
      return null
    }
    const last = messages.at(-1)
    if (!last) {
      return null
    }
    const { tools } = splitNativeChatBlocks(last.blocks)
    if (last.role === 'reasoning' || tools.length > 0) {
      return last.id
    }
    return null
  }, [isWorking, hasStreamingBubble, messages, liveStatus?.thinking])

  // Duration descriptor for each finished "Thought" step, from the gap to the
  // turn's next message.
  const thoughtDurationById = useMemo(() => {
    const map = new Map<string, string>()
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'reasoning') {
        map.set(
          messages[i].id,
          formatThoughtDuration(messages[i].timestamp, messages[i + 1]?.timestamp)
        )
      }
    }
    return map
  }, [messages])

  // Group each agent response's intermediate work so it collapses to a single
  // "Worked for …" line once the final answer lands (Cursor parity).
  const groups = useMemo(
    () => buildNativeChatTurnGroups(messages, { working: isWorking }),
    [messages, isWorking]
  )

  // Only the latest user prompt sticks to the top (see MessageRow) — pinning
  // every user row would stack overlapping headers instead of replacing them.
  const lastUserMessageId = useMemo(
    () => messages.findLast((message) => message.role === 'user')?.id ?? null,
    [messages]
  )

  const showTypingIndicator = isWorking && !hasStreamingBubble && activeStepId === null

  // When an older page prepends, the scroll content grows above the viewport.
  // Capture the pre-render scroll height so the layout effect can restore the
  // user's position (no jump) instead of letting the browser keep scrollTop.
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    const geometry = geometryOf(el)
    const stick = isNearBottom(geometry)
    setStuckToBottom(stick)
    setShowJump(shouldShowJumpToLatest(stick, geometry))
    // Near the top — page in older history, anchoring the current position so the
    // prepend doesn't yank the view.
    if (geometry.scrollTop < 80 && hasMore && !loadingEarlier) {
      prependAnchorRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop }
      loadEarlier()
    }
  }, [hasMore, loadingEarlier, loadEarlier])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    el.scrollTop = el.scrollHeight
    setStuckToBottom(true)
    setShowJump(false)
  }, [])

  // Align a single message's top to the top of the scroll viewport.
  const scrollMessageToTop = useCallback((el: HTMLElement) => {
    const container = scrollRef.current
    if (!container) {
      return
    }
    const delta = el.getBoundingClientRect().top - container.getBoundingClientRect().top
    container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' })
  }, [])

  // Re-pin to the bottom when new content arrives, but only if the user hasn't
  // scrolled up. Layout effect so the jump happens before paint (no flicker).
  // When an older page just prepended, restore the prior position instead.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && prependAnchorRef.current) {
      // Preserve the viewport: shift scrollTop by however much taller the content
      // got, so the message the user was reading stays put.
      const grew = el.scrollHeight - prependAnchorRef.current.scrollHeight
      el.scrollTop = prependAnchorRef.current.scrollTop + grew
      prependAnchorRef.current = null
      return
    }
    if (stuckToBottomRef.current) {
      scrollToBottom()
    }
  }, [messages.length, isWorking, showTypingIndicator, scrollToBottom])

  // [FORK] Snap-точка отправки (Cursor): новое сообщение пользователя встаёт
  // к верхней кромке вьюпорта и остаётся там sticky-пином, а ответ агента
  // растёт под ним. Позже штатного stick-to-bottom эффекта — переопределяет его.
  const lastUserSnapRef = useRef<string | null>(lastUserMessageId)
  useLayoutEffect(() => {
    if (lastUserSnapRef.current === lastUserMessageId) {
      return
    }
    lastUserSnapRef.current = lastUserMessageId
    const container = scrollRef.current
    if (!container || !lastUserMessageId) {
      return
    }
    const row = container.querySelector(`[data-user-message-id="${CSS.escape(lastUserMessageId)}"]`)
    if (row instanceof HTMLElement) {
      container.scrollTop += row.getBoundingClientRect().top - container.getBoundingClientRect().top
    }
  }, [lastUserMessageId])

  // Keep the affordances in sync if the container resizes (e.g. composer mounts,
  // viewport reflow) without a scroll event.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(handleScroll)
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleScroll])

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        // [FORK] No container padding-top: the sticky user prompt pins flush to
        // the very top. Initial breathing room lives on the inner column instead
        // (it scrolls away), so the sticky header sits against the top edge.
        className="scrollbar-sleek h-full overflow-y-auto px-3 pb-32 sm:px-4"
      >
        <div
          // [FORK] max-w-xl, чтобы лента сообщений совпадала по ширине с композером
          // (единая центрированная колонка, как в Cursor). pt-10: верхний отступ
          // ленты, который прокручивается (в отличие от паддинга контейнера).
          className="mx-auto flex w-full max-w-xl flex-col gap-5 pt-10"
          // Why: `zoom` scales the chat transcript's text and layout together,
          // scoped to this container so the rest of the app is untouched. It's
          // the desktop analog of the mobile pinch-zoom (Chromium/Electron only).
          style={{ zoom: fontScale }}
        >
          {hasMore ? (
            <div className="flex justify-center py-1">
              <button
                type="button"
                onClick={loadEarlier}
                disabled={loadingEarlier}
                className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                {loadingEarlier
                  ? translate('components.native-chat.loadingEarlier', 'Loading…')
                  : translate('components.native-chat.loadEarlier', 'Load earlier messages')}
              </button>
            </div>
          ) : null}
          {groups.map((group) =>
            group.kind === 'work' ? (
              <NativeChatWorkGroup
                key={group.id}
                steps={group.steps}
                live={group.live}
                durationMs={group.durationMs}
                activeStepId={activeStepId}
                thoughtDurationById={thoughtDurationById}
                onScrollMessageToTop={scrollMessageToTop}
                onLinkClick={onLinkClick}
                allowFileUriLinks={allowFileUriLinks}
              />
            ) : (
              <MessageRow
                key={group.message.id}
                message={group.message}
                isActiveStep={false}
                thoughtDurationLabel=""
                sticky={group.message.id === lastUserMessageId}
                deliveryFailed={failedDeliveryMessageIds?.has(group.message.id) === true}
                onScrollMessageToTop={scrollMessageToTop}
                onLinkClick={onLinkClick}
                allowFileUriLinks={allowFileUriLinks}
                onEditSend={onEditSendUserMessage}
              />
            )
          )}
          {planStatus ? (
            <NativeChatPlanStatusLine status={planStatus} title={planTitle} onOpen={onOpenPlan} />
          ) : null}
          {showTypingIndicator ? <TypingIndicatorRow label={liveStatus?.label} /> : null}
        </div>
      </div>
      {showJump ? (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label={translate('components.native-chat.jumpToLatest', 'Jump to latest')}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown className="size-3.5" />
          <span>{translate('components.native-chat.jumpToLatest', 'Jump to latest')}</span>
        </button>
      ) : null}
    </div>
  )
}
