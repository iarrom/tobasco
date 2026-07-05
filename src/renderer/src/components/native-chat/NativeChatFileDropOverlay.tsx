// [FORK] Full-pane overlay shown while a native file is dragged over the chat,
// so drag-and-drop reads as working. pointer-events-none so the drop still
// reaches the underlying drop-target element (the preload resolves paths from
// the `data-native-file-drop-target="composer"` marker on the chat root).

import { ImagePlus } from 'lucide-react'
import { translate } from '@/i18n/i18n'

export function NativeChatFileDropOverlay(): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="absolute inset-2 rounded-xl border-2 border-dashed border-primary/50 bg-background/70 backdrop-blur-sm" />
      <div className="relative flex flex-col items-center gap-2 text-center">
        <ImagePlus className="size-7 text-primary" />
        <span className="text-sm font-medium text-foreground">
          {translate('components.native-chat.composer.dropImage', 'Drop image to attach')}
        </span>
      </div>
    </div>
  )
}
