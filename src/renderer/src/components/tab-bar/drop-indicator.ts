export type DropIndicator = 'left' | 'right' | null

// Why: the theme's accent color is too subtle for a drag-and-drop insertion
// cue. A vivid blue matches VS Code's tab.dragAndDropBorder and is immediately
// visible against all tab backgrounds. Pseudo-elements sit above the tab's
// own border so the indicator does not shift layout.
export function getDropIndicatorClasses(dropIndicator: DropIndicator): string {
  if (dropIndicator === 'left') {
    return "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-blue-500 before:z-10 before:content-['']"
  }
  if (dropIndicator === 'right') {
    return "after:absolute after:inset-y-0 after:right-0 after:w-[2px] after:bg-blue-500 after:z-10 after:content-['']"
  }
  return ''
}

// [FORK] Cursor-style text-chip tabs: no bottom selection bar — the active tab
// reads via its rounded pill background instead. Kept as 'hidden' so upstream
// call sites (`{isActive && <span className={...} />}`) need no edits.
export const ACTIVE_TAB_INDICATOR_CLASSES = 'hidden'

// [FORK] Rounded text chips (bookmarks-bar idiom): active gets a subtle pill
// wash, inactive is plain muted text that brightens on hover.
export function getTabRootStateClasses(isActive: boolean): string {
  return isActive
    ? 'rounded-md bg-[color-mix(in_srgb,var(--foreground)_8%,var(--card))] text-foreground'
    : 'rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground'
}

// [FORK] No per-tab separators or top border — chips float on the strip.
export function getTabStripBorderClasses(
  _hasTabsToRight: boolean,
  _options?: { includeTopBorder?: boolean }
): string {
  return ''
}
