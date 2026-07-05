// [FORK] Image attachment previews in the composer, Cursor-style: small
// thumbnails that open a fullscreen modal on click. Replaces the old filename
// chips. Thumbnails load through the cached IPC image loader (see
// use-native-chat-image-preview) since `file://` <img> srcs are blocked in dev.

import { useState } from 'react'
import { Image as ImageIcon, X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useNativeChatImagePreview } from './use-native-chat-image-preview'
import {
  NativeChatImagePreviewModal,
  nativeChatAttachmentLabel
} from './NativeChatImagePreviewModal'
import type { NativeChatComposerImageAttachment } from './NativeChatComposerField'

function NativeChatAttachmentThumbnail({
  attachment,
  onOpen,
  onRemove
}: {
  attachment: NativeChatComposerImageAttachment
  onOpen: () => void
  onRemove: () => void
}): React.JSX.Element {
  const previewSrc = useNativeChatImagePreview(attachment.path)
  const label = nativeChatAttachmentLabel(attachment.path)
  return (
    <div className="group/thumb relative size-14">
      <button
        type="button"
        onClick={onOpen}
        title={label}
        aria-label={translate(
          'components.native-chat.composer.openImagePreview',
          'Open image preview'
        )}
        className="size-full overflow-hidden rounded-md border border-border bg-muted/40 outline-none transition-colors hover:border-muted-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {previewSrc ? (
          <img src={previewSrc} alt={label} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-5" />
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={translate(
          'components.native-chat.composer.removeAttachment',
          'Remove attachment'
        )}
        className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/thumb:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

export function NativeChatAttachmentThumbnails({
  attachments,
  onRemove
}: {
  attachments: readonly NativeChatComposerImageAttachment[]
  onRemove: (id: string) => void
}): React.JSX.Element | null {
  const [openPath, setOpenPath] = useState<string | null>(null)
  if (attachments.length === 0) {
    return null
  }
  return (
    <div className="mb-2 flex flex-wrap gap-2 px-1">
      {attachments.map((attachment) => (
        <NativeChatAttachmentThumbnail
          key={attachment.id}
          attachment={attachment}
          onOpen={() => setOpenPath(attachment.path)}
          onRemove={() => onRemove(attachment.id)}
        />
      ))}
      {openPath ? (
        <NativeChatImagePreviewModal path={openPath} onClose={() => setOpenPath(null)} />
      ) : null}
    </div>
  )
}
