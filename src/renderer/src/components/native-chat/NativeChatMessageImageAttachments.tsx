// [FORK] Renders a sent message's image attachments (image-ref blocks) as small
// clickable thumbnails that open the shared fullscreen preview — matching the
// composer chips so an image looks the same before and after it is sent.
// Falls back to an icon + filename chip while the preview loads or if the ref
// carries no local path (e.g. an external url).

import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { NativeChatBlock } from '../../../../shared/native-chat-types'
import { useNativeChatImagePreview } from './use-native-chat-image-preview'
import {
  NativeChatImagePreviewModal,
  nativeChatAttachmentLabel
} from './NativeChatImagePreviewModal'

function MessageImageThumbnail({
  path,
  label,
  onOpen
}: {
  path: string
  label: string
  onOpen: () => void
}): React.JSX.Element {
  const previewSrc = useNativeChatImagePreview(path)
  if (!previewSrc) {
    return (
      <div
        className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
        title={label}
      >
        <ImageIcon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      title={label}
      aria-label={translate(
        'components.native-chat.composer.openImagePreview',
        'Open image preview'
      )}
      className="size-14 overflow-hidden rounded-md border border-border bg-muted/40 outline-none transition-colors hover:border-muted-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img src={previewSrc} alt={label} className="size-full object-cover" />
    </button>
  )
}

export function NativeChatMessageImageAttachments({
  blocks
}: {
  blocks: NativeChatBlock[]
}): React.JSX.Element | null {
  const [openPath, setOpenPath] = useState<string | null>(null)
  const images = blocks.filter((block) => block.type === 'image-ref')
  if (images.length === 0) {
    return null
  }
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {images.map((image, index) => {
        const path = image.path
        const label = path ? nativeChatAttachmentLabel(path) : (image.alt ?? image.url ?? 'Image')
        if (!path) {
          return (
            <div
              key={`${label}-${index}`}
              className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
              title={label}
            >
              <ImageIcon className="size-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </div>
          )
        }
        return (
          <MessageImageThumbnail
            key={`${path}-${index}`}
            path={path}
            label={label}
            onOpen={() => setOpenPath(path)}
          />
        )
      })}
      {openPath ? (
        <NativeChatImagePreviewModal path={openPath} onClose={() => setOpenPath(null)} />
      ) : null}
    </div>
  )
}
