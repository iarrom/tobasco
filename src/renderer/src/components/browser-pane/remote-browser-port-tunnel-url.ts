// [FORK] URL mapping for tunneled remote browser panes. The store keeps the
// canonical remote URL (http://localhost:5173) while the local webview loads
// the tunneled address; these helpers translate between the two.

export type TunnelableRemoteBrowserTarget = {
  host: string
  port: number
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

function normalizeHostname(hostname: string): string {
  // Why: URL.hostname wraps IPv6 in brackets ([::1]); the tunnel protocol and
  // target comparisons use the bare address.
  return hostname.toLowerCase().replace(/^\[|\]$/g, '')
}

function getEffectivePort(url: URL): number {
  if (url.port) {
    return Number(url.port)
  }
  return url.protocol === 'https:' ? 443 : 80
}

export function getTunnelableRemoteBrowserTarget(
  url: string
): TunnelableRemoteBrowserTarget | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }
  const host = normalizeHostname(parsed.hostname)
  if (!LOOPBACK_HOSTNAMES.has(host)) {
    return null
  }
  return { host, port: getEffectivePort(parsed) }
}

export function mapRemoteBrowserUrlToLocal(
  url: string,
  target: TunnelableRemoteBrowserTarget,
  localPort: number
): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  const host = normalizeHostname(parsed.hostname)
  if (host !== target.host || getEffectivePort(parsed) !== target.port) {
    return url
  }
  // Why: 0.0.0.0 is a listen-side wildcard, not a reliable navigation target.
  if (host === '0.0.0.0') {
    parsed.hostname = 'localhost'
  }
  parsed.port = String(localPort)
  return parsed.toString()
}

export function mapLocalBrowserUrlToRemote(
  url: string,
  target: TunnelableRemoteBrowserTarget,
  localPort: number
): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return url
  }
  const host = normalizeHostname(parsed.hostname)
  if (!LOOPBACK_HOSTNAMES.has(host) || getEffectivePort(parsed) !== localPort) {
    return url
  }
  parsed.hostname = target.host === '::1' ? '[::1]' : target.host
  parsed.port = String(target.port)
  return parsed.toString()
}
