// [FORK] Drag-over detection for the native chat, so dropping an image file
// anywhere over the pane shows a clear overlay. The preload swallows the final
// `drop` event (paths arrive via window.api.ui.onFileDrop), but the drag events
// are ordinary DOM events we can observe ourselves. A depth counter keeps the
// overlay stable across dragenter/leave on nested children; a document-level
// drop/dragend listener resets it since our own `drop` never fires.

import { useCallback, useEffect, useRef, useState } from 'react'
import { hasNativeFileDragTypes } from '../../../../shared/native-file-drop'

export type NativeChatFileDragState = {
  isFileDragOver: boolean
  dragHandlers: {
    onDragEnter: (event: React.DragEvent<HTMLElement>) => void
    onDragLeave: (event: React.DragEvent<HTMLElement>) => void
  }
}

export function useNativeChatFileDrag(enabled: boolean): NativeChatFileDragState {
  const [isFileDragOver, setIsFileDragOver] = useState(false)
  const dragDepth = useRef(0)

  const reset = useCallback(() => {
    dragDepth.current = 0
    setIsFileDragOver(false)
  }, [])

  const onDragEnter = useCallback(
    (event: React.DragEvent<HTMLElement>): void => {
      // Only native OS file drags raise the overlay; in-app drags (e.g. a file
      // path from the tree) carry the internal MIME type and route elsewhere.
      if (!enabled || !hasNativeFileDragTypes(event.dataTransfer.types)) {
        return
      }
      dragDepth.current += 1
      setIsFileDragOver(true)
    },
    [enabled]
  )

  const onDragLeave = useCallback((event: React.DragEvent<HTMLElement>): void => {
    if (!hasNativeFileDragTypes(event.dataTransfer.types)) {
      return
    }
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setIsFileDragOver(false)
    }
  }, [])

  // The preload calls stopPropagation on the native `drop`, so our own onDrop
  // never fires — reset from the document level on any drop/dragend.
  useEffect(() => {
    document.addEventListener('drop', reset, true)
    document.addEventListener('dragend', reset, true)
    return () => {
      document.removeEventListener('drop', reset, true)
      document.removeEventListener('dragend', reset, true)
    }
  }, [reset])

  return { isFileDragOver, dragHandlers: { onDragEnter, onDragLeave } }
}
