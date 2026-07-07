// [FORK] Мост «вставить текст в композер активного чата» для внешних
// поверхностей (аннотации браузера по ⌘L и т.п.). Композер (см.
// NativeChatComposerField) слушает событие и дописывает текст в драфт.
export const NATIVE_CHAT_COMPOSER_INSERT_EVENT = 'fork-native-chat-composer-insert'

export type NativeChatComposerInsertDetail = { text: string }

export function requestNativeChatComposerInsert(text: string): void {
  if (text.trim().length === 0) {
    return
  }
  window.dispatchEvent(
    new CustomEvent<NativeChatComposerInsertDetail>(NATIVE_CHAT_COMPOSER_INSERT_EVENT, {
      detail: { text }
    })
  )
}

/** Драфт + вставка: пустой драфт заменяется, непустой дополняется с новой строки. */
export function appendToComposerDraft(draft: string, text: string): string {
  if (draft.trim().length === 0) {
    return text
  }
  return draft.endsWith('\n') ? `${draft}${text}` : `${draft}\n${text}`
}
