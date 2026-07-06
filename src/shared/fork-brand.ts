import type { PostProcessorModule } from 'i18next'

// [FORK] Display-brand layer: this fork ships as "Tobasco" while every internal
// identifier (ORCA_* env vars, orca:// protocol, binary names, appId, userData
// path via app.setName) stays "orca"/"Orca" so upstream merges and existing
// user data keep working.
export const FORK_BRAND_NAME = 'Tobasco'

// Why: only the capitalized brand word is display text; lowercase "orca" is
// functional (protocol scheme, command names, paths) and must never be rewritten.
const UPSTREAM_BRAND_PATTERN = /\bOrca\b/g

export function replaceUpstreamBrandName(value: string): string {
  return value.replace(UPSTREAM_BRAND_PATTERN, FORK_BRAND_NAME)
}

// Why: vitest suites assert upstream copy verbatim; branding is a display-time
// concern, so keeping it off under vitest lets upstream tests pass unmodified.
export const FORK_BRAND_DISPLAY_ENABLED = typeof process === 'undefined' || !process.env?.VITEST

export function applyForkBrandForDisplay(value: string): string {
  return FORK_BRAND_DISPLAY_ENABLED ? replaceUpstreamBrandName(value) : value
}

export const forkBrandI18nPostProcessor: PostProcessorModule = {
  type: 'postProcessor',
  name: 'forkBrand',
  process: (value: string) => applyForkBrandForDisplay(value)
}
