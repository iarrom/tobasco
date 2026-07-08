// [FORK] Капчур-хендлеры корня чат-пейна: правый клик снимает выделение для
// контекст-меню, левый фокусирует пейн, набор вне инпутов уходит в композер.
import type { NativeChatComposerHandle } from './NativeChatComposer'
import {
  shouldFocusNativeChatComposerFromEditingKey,
  shouldFocusNativeChatPaneFromPointerTarget,
  shouldRedirectNativeChatTyping
} from './native-chat-typing-redirect'

export function buildNativeChatPaneCaptureHandlers(args: {
  rootRef: React.RefObject<HTMLDivElement | null>
  composerRef: React.RefObject<NativeChatComposerHandle | null>
  onSelectionCapture: () => void
}): {
  onPointerDownCapture: (event: React.PointerEvent) => void
  onKeyDownCapture: (event: React.KeyboardEvent) => void
} {
  const { rootRef, composerRef, onSelectionCapture } = args
  return {
    onPointerDownCapture: (event) => {
      if (event.button === 2) {
        onSelectionCapture()
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (event.button === 0 && shouldFocusNativeChatPaneFromPointerTarget(event.target)) {
        rootRef.current?.focus({ preventScroll: true })
      }
    },
    onKeyDownCapture: (event) => {
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
    }
  }
}
