// [FORK] The context object lives apart from the provider .tsx and imports
// only React. The provider module also exported this hook, so it was never a
// clean Fast Refresh boundary: a dev HMR invalidation reaching it (via its
// @/store or i18n imports) re-ran createContext, and the mounted provider kept
// serving the stale context while consumers read the new one — crashing every
// TerminalPane with "must be used inside provider" until a full reload.
import { createContext, useContext } from 'react'

export type LinkRoutingPreferenceDialogOptions = {
  url?: string
  preview?: boolean
  openLinksInAppDefault?: boolean
}

export type LinkRoutingPreferenceDialogContextValue = (
  options?: LinkRoutingPreferenceDialogOptions
) => Promise<boolean>

export const LinkRoutingPreferenceDialogContext =
  createContext<LinkRoutingPreferenceDialogContextValue | null>(null)

export function useLinkRoutingPreferenceDialog(): LinkRoutingPreferenceDialogContextValue {
  const requestPreference = useContext(LinkRoutingPreferenceDialogContext)
  if (!requestPreference) {
    throw new Error(
      'useLinkRoutingPreferenceDialog must be used inside LinkRoutingPreferenceDialogProvider'
    )
  }
  return requestPreference
}
