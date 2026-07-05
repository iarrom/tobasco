// [FORK] Split a URL into scheme / host / path so the address bar can emphasize
// the host and dim the scheme + path, matching the reference browser chrome.
export type BrowserUrlDisplay = {
  /** e.g. "https://" — rendered muted. */
  scheme: string
  /** e.g. "wcbot.localhost" — rendered in the foreground color. */
  host: string
  /** e.g. "/results" — rendered muted. Empty for a bare origin. */
  path: string
}

export function formatBrowserUrlDisplay(url: string): BrowserUrlDisplay {
  const trimmed = url.trim()
  try {
    const parsed = new URL(trimmed)
    // Why: only web URLs get the host-emphasis split. about:/file:/data: and the
    // like have an empty or misleading host, so show them whole (nothing dimmed).
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host) {
      const rest = `${parsed.pathname}${parsed.search}${parsed.hash}`
      return {
        scheme: `${parsed.protocol}//`,
        host: parsed.host,
        // Why: a bare origin ("https://host/") reads cleaner without a lone "/".
        path: rest === '/' ? '' : rest
      }
    }
    return { scheme: '', host: trimmed, path: '' }
  } catch {
    // Non-URL input (partial typing, search terms): show as-is in the host slot.
    return { scheme: '', host: trimmed, path: '' }
  }
}
