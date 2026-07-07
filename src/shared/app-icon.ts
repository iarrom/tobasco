import { FORK_FIXED_APP_ICON } from './fork-brand'

export const APP_ICON_OPTIONS = [
  { id: 'classic', label: 'Classic Orca' },
  { id: 'watercolor', label: 'Watercolor Orca' },
  { id: 'blue', label: 'Blue Orca' }
] as const

export type AppIconId = (typeof APP_ICON_OPTIONS)[number]['id']

export const DEFAULT_APP_ICON_ID: AppIconId = 'classic'

export function normalizeAppIconId(value: unknown): AppIconId {
  // [FORK] Icon switching is disabled: saved values collapse to the bundled
  // icon, and the startup 'classic' path clears any pinned Finder icon.
  if (FORK_FIXED_APP_ICON) {
    return DEFAULT_APP_ICON_ID
  }
  return APP_ICON_OPTIONS.some((option) => option.id === value)
    ? (value as AppIconId)
    : DEFAULT_APP_ICON_ID
}
