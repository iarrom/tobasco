// [FORK] Remote-workspace browser pages pointing at a loopback dev server
// render in a LOCAL webview over a TCP tunnel instead of the CDP screencast:
// native rendering and input latency, with only HTTP crossing the network.
import { useEffect, useState, type ReactElement } from 'react'
import { Loader2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { TunnelableRemoteBrowserTarget } from './remote-browser-port-tunnel-url'

type TunnelPhase =
  | { kind: 'connecting' }
  | { kind: 'ready'; localPort: number }
  | { kind: 'fallback' }

export function TunneledBrowserPagePane({
  runtimeEnvironmentId,
  target,
  renderLocalPane,
  renderFallback
}: {
  runtimeEnvironmentId: string
  target: TunnelableRemoteBrowserTarget
  renderLocalPane: (localPort: number) => ReactElement
  renderFallback: () => ReactElement
}): ReactElement {
  const [phase, setPhase] = useState<TunnelPhase>({ kind: 'connecting' })

  useEffect(() => {
    let cancelled = false
    setPhase({ kind: 'connecting' })
    window.api.runtimeEnvironments
      .ensureBrowserPortTunnel({
        selector: runtimeEnvironmentId,
        port: target.port,
        host: target.host
      })
      .then((tunnel) => {
        if (!cancelled) {
          setPhase({ kind: 'ready', localPort: tunnel.localPort })
        }
      })
      .catch(() => {
        // Why: old hosts without workspacePorts.tunnel (or an unreachable
        // port) still get a working pane via the screencast path.
        if (!cancelled) {
          setPhase({ kind: 'fallback' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [runtimeEnvironmentId, target.host, target.port])

  if (phase.kind === 'ready') {
    return renderLocalPane(phase.localPort)
  }
  if (phase.kind === 'fallback') {
    return renderFallback()
  }
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background">
      <div className="flex max-w-sm flex-col items-center gap-2 px-6 text-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <div className="text-sm font-medium text-foreground">
          {translate(
            'auto.components.browser.pane.TunneledBrowserPagePane.connecting',
            'Connecting to the remote port'
          )}
        </div>
      </div>
    </div>
  )
}
