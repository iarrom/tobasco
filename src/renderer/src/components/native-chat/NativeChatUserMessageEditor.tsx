// [FORK] Инлайн-редактирование отправленного сообщения (Cursor-стиль): клик по
// пузырю превращает его в мини-композер на той же поверхности; ↑ (или Enter)
// шлёт отредактированный текст агенту новым ходом, Esc закрывает без отправки.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

export function NativeChatUserMessageEditor({
  initialText,
  onSend,
  onCancel
}: {
  initialText: string
  onSend: (text: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [text, setText] = useState(initialText)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Фокус с кареткой в конце — редактирование продолжает мысль, не затирает её.
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [])

  const send = useCallback(() => {
    const trimmed = text.trim()
    if (trimmed.length === 0) {
      return
    }
    onSend(trimmed)
  }, [onSend, text])

  return (
    <div
      className={cn(
        // Та же поверхность, что у композера и пузыря сообщения.
        'w-full max-w-[85%] rounded-xl rounded-tr-sm border border-input bg-card p-1.5 shadow-xs dark:bg-input/30'
      )}
    >
      <textarea
        ref={textareaRef}
        value={text}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
            return
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            send()
          }
        }}
        className={cn(
          'scrollbar-sleek field-sizing-content max-h-64 min-h-10 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none',
          'placeholder:text-muted-foreground/60'
        )}
      />
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="px-2 text-[11px] text-muted-foreground/70">
          {translate('components.native-chat.editMessage.hint', 'Esc to cancel')}
        </span>
        <button
          type="button"
          aria-label={translate('components.native-chat.editMessage.send', 'Send edited message')}
          title={translate('components.native-chat.editMessage.send', 'Send edited message')}
          disabled={text.trim().length === 0}
          onClick={send}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowUp className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
