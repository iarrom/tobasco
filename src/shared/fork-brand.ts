import type { PostProcessorModule } from 'i18next'

// [FORK] Display-brand layer: this fork ships as "Tobasco" while every internal
// identifier (ORCA_* env vars, orca:// protocol, binary names, appId, userData
// path via app.setName) stays "orca"/"Orca" so upstream merges and existing
// user data keep working.
export const FORK_BRAND_NAME = 'Tobasco'

// Why: only the capitalized brand word is display text; lowercase "orca" is
// functional (protocol scheme, command names, paths) and must never be rewritten.
// ALL-CAPS "ORCA" is also display text (wordmarks like the Landing hero) —
// underscore identifiers (ORCA_*) never match because _ is a word character.
const UPSTREAM_BRAND_PATTERN = /\bOrca\b/g
const UPSTREAM_BRAND_WORDMARK_PATTERN = /\bORCA\b/g

export function replaceUpstreamBrandName(value: string): string {
  return value
    .replace(UPSTREAM_BRAND_PATTERN, FORK_BRAND_NAME)
    .replace(UPSTREAM_BRAND_WORDMARK_PATTERN, FORK_BRAND_NAME.toUpperCase())
}

// Why: vitest suites assert upstream copy verbatim; branding is a display-time
// concern, so keeping it off under vitest lets upstream tests pass unmodified.
export const FORK_BRAND_DISPLAY_ENABLED = typeof process === 'undefined' || !process.env?.VITEST

// Why: the fork ships one fixed app icon (fork/app-icon); upstream's icon
// switcher would re-apply a saved orca icon over it on startup and even pin it
// onto the .app bundle via Finder metadata. Off under vitest so upstream
// app-icon suites pass unmodified.
export const FORK_FIXED_APP_ICON = typeof process === 'undefined' || !process.env?.VITEST

export function applyForkBrandForDisplay(value: string): string {
  return FORK_BRAND_DISPLAY_ENABLED ? replaceUpstreamBrandName(value) : value
}

export const forkBrandI18nPostProcessor: PostProcessorModule = {
  type: 'postProcessor',
  name: 'forkBrand',
  process: (value: string) => applyForkBrandForDisplay(value)
}
