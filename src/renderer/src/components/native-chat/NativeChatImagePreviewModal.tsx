// [FORK] Shared fullscreen image preview for native chat: the composer
// attachment thumbnails and the sent-message thumbnails both open it. Bytes load
// through the cached IPC loader (see use-native-chat-image-preview) since
// `file://` <img> srcs are blocked in dev.

import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { basename } from '@/lib/path'
import { isNativeChatPastedImagePath } from './native-chat-image-paste'
import { useNativeChatImagePreview } from './use-native-chat-image-preview'

export function nativeChatAttachmentLabel(path: string): string {
  return isNativeChatPastedImagePath(path)
    ? translate('components.native-chat.composer.pastedImageLabel', 'Pasted image')
    : basename(path)
}

export function NativeChatImagePreviewModal({
  path,
  onClose
}: {
  path: string
  onClose: () => void
}): React.JSX.Element {
  const previewSrc = useNativeChatImagePreview(path)
  const label = nativeChatAttachmentLabel(path)
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'top-1/2 left-1/2 flex max-h-[90vh] w-auto max-w-[90vw] -translate-x-1/2 -translate-y-1/2',
          'items-center justify-center border-none bg-transparent p-0 shadow-none'
        )}
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">
          {translate('components.native-chat.composer.imagePreview', 'Image preview')}
        </DialogDescription>
        {previewSrc ? (
          <img
            src={previewSrc}
            alt={label}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label={translate('components.native-chat.composer.closePreview', 'Close preview')}
          className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
        >
          <X className="size-4" />
        </button>
      </DialogContent>
    </Dialog>
  )
}
