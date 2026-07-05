// [FORK] Loads a composer image attachment (absolute local path) into a
// displayable blob URL for the thumbnail + fullscreen preview. Reuses the
// editor's cached IPC loader (`loadLocalImageAbsolutePath`) because the renderer
// runs on http://localhost in dev where `file://` <img> srcs are blocked — the
// loader reads bytes over IPC and hands back a cached blob URL. Re-loads on the
// same window-focus invalidation the editor previews use.

import { useEffect, useState } from 'react'
import { loadLocalImageAbsolutePath, onImageCacheInvalidated } from '../editor/useLocalImageSrc'

export function useNativeChatImagePreview(absolutePath: string): string | undefined {
  const [generation, setGeneration] = useState(0)
  useEffect(() => onImageCacheInvalidated(() => setGeneration((value) => value + 1)), [])

  const [src, setSrc] = useState<string | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    // Attachments come from clipboard-paste temp files and OS-picked/dropped
    // images that live outside the workspace roots, so the fs read the loader
    // performs would be denied. The user attached them explicitly, so authorize
    // the path for the read-only preview IPC before loading.
    void window.api.fs
      .authorizeExternalPath({ targetPath: absolutePath })
      .catch(() => {})
      .then(() => loadLocalImageAbsolutePath(absolutePath))
      .then((url) => {
        if (!cancelled) {
          setSrc(url ?? undefined)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(undefined)
        }
      })
    return () => {
      cancelled = true
    }
  }, [absolutePath, generation])

  return src
}
