// [FORK] Framing for `workspacePorts.tunnel`: TCP streams between a remote
// runtime host and the desktop client, multiplexed over one E2EE WebSocket
// subscription. Rides the terminal stream codec because the runtime's binary
// dispatch decodes every client frame with decodeTerminalStreamFrame.
import {
  TerminalStreamOpcode,
  decodeTerminalStreamJson,
  encodeTerminalStreamFrame,
  encodeTerminalStreamJson,
  type TerminalStreamFrame
} from './terminal-stream-protocol'

export const PORT_TUNNEL_RPC_METHOD = 'workspacePorts.tunnel'
export const PORT_TUNNEL_CAPABILITY = 'workspace-ports.tunnel.v1'
// Why: the runtime routes client->server frames by pre-registered streamId, so
// opens announce their new streamId on a fixed control stream the handler
// registers up front. Data/close frames then flow on the announced streamId.
export const PORT_TUNNEL_CONTROL_STREAM_ID = 0
export const PORT_TUNNEL_FIRST_STREAM_ID = 1

// Why: the tunnel exposes services on the remote host itself, not a general
// proxy into the host's network. Only loopback-equivalent targets are allowed.
const PORT_TUNNEL_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

export function isPortTunnelLoopbackHost(host: string): boolean {
  return PORT_TUNNEL_LOOPBACK_HOSTS.has(host.toLowerCase())
}

export function encodePortTunnelOpenFrame(streamId: number, seq: number): Uint8Array {
  return encodeTerminalStreamFrame({
    opcode: TerminalStreamOpcode.TunnelOpen,
    streamId: PORT_TUNNEL_CONTROL_STREAM_ID,
    seq,
    payload: encodeTerminalStreamJson({ streamId })
  })
}

export function decodePortTunnelOpenStreamId(frame: TerminalStreamFrame): number | null {
  const payload = decodeTerminalStreamJson<{ streamId?: unknown }>(frame.payload)
  const streamId = payload?.streamId
  return typeof streamId === 'number' && Number.isInteger(streamId) && streamId > 0
    ? streamId
    : null
}

export function encodePortTunnelDataFrame(
  streamId: number,
  seq: number,
  data: Uint8Array
): Uint8Array {
  return encodeTerminalStreamFrame({
    opcode: TerminalStreamOpcode.TunnelData,
    streamId,
    seq,
    payload: data
  })
}

export function encodePortTunnelCloseFrame(
  streamId: number,
  seq: number,
  reason?: string
): Uint8Array {
  return encodeTerminalStreamFrame({
    opcode: TerminalStreamOpcode.TunnelClose,
    streamId,
    seq,
    payload: reason ? encodeTerminalStreamJson({ reason }) : new Uint8Array()
  })
}

export function decodePortTunnelCloseReason(frame: TerminalStreamFrame): string | null {
  if (frame.payload.length === 0) {
    return null
  }
  const payload = decodeTerminalStreamJson<{ reason?: unknown }>(frame.payload)
  return typeof payload?.reason === 'string' ? payload.reason : null
}
