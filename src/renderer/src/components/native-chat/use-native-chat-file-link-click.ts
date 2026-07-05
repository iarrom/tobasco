// [FORK] Resolves clicks on file links in the chat transcript to an editor open,
// extracted from NativeChatView so that file stays within the max-lines budget.

import { useCallback } from 'react'
import { openDetectedFilePath } from '@/components/terminal-pane/terminal-file-open-routing'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { resolveNativeChatFileLink, type NativeChatFileLinkContext } from './native-chat-file-link'

export function useNativeChatFileLinkClick(
  fileLinkContext: NativeChatFileLinkContext | null
): CommentMarkdownLinkClickHandler | undefined {
  const onLinkClick = useCallback<CommentMarkdownLinkClickHandler>(
    (event, href) => {
      const target = resolveNativeChatFileLink(href, fileLinkContext)
      if (!target || !fileLinkContext) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      openDetectedFilePath(target.absolutePath, target.line, target.column, {
        worktreeId: fileLinkContext.worktreeId,
        worktreePath: fileLinkContext.worktreePath,
        runtimeEnvironmentId: fileLinkContext.runtimeEnvironmentId,
        openWithSystemDefault: event.shiftKey
      })
    },
    [fileLinkContext]
  )
  return fileLinkContext ? onLinkClick : undefined
}
