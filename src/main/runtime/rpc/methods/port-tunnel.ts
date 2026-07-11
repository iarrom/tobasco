// [FORK] `workspacePorts.tunnel`: relays TCP connections to a loopback port on
// this host over the runtime's binary WebSocket stream, so remote clients can
// render dev servers in a local webview instead of the browser screencast.
import { createConnection, type Socket } from 'node:net'
import { z } from 'zod'
import { defineStreamingMethod, type RpcAnyMethod } from '../core'
import {
  TerminalStreamOpcode,
  type TerminalStreamFrame
} from '../../../../shared/terminal-stream-protocol'
import {
  PORT_TUNNEL_CONTROL_STREAM_ID,
  PORT_TUNNEL_RPC_METHOD,
  decodePortTunnelOpenStreamId,
  encodePortTunnelCloseFrame,
  encodePortTunnelDataFrame,
  isPortTunnelLoopbackHost
} from '../../../../shared/port-tunnel-protocol'

const PortTunnelParams = z.object({
  port: z.number().int().min(1).max(65535),
  host: z.string().optional()
})

type PortTunnelStream = {
  socket: Socket
  unregister: () => void
  lastError: string | null
}

export const PORT_TUNNEL_METHODS: RpcAnyMethod[] = [
  defineStreamingMethod({
    name: PORT_TUNNEL_RPC_METHOD,
    params: PortTunnelParams,
    handler: async (
      params,
      { runtime, connectionId, requestId, sendBinary, registerBinaryStreamHandler, signal },
      emit
    ) => {
      if (!sendBinary || !registerBinaryStreamHandler || !connectionId) {
        throw new Error('binary_tunnel_stream_required')
      }
      const requestedHost = params.host ?? '127.0.0.1'
      if (!isPortTunnelLoopbackHost(requestedHost)) {
        throw new Error('port_tunnel_host_not_loopback')
      }
      // Why: 0.0.0.0 means "all interfaces" for listeners and is not a valid
      // dial target everywhere; the loopback address reaches the same service.
      const dialHost = requestedHost === '0.0.0.0' ? '127.0.0.1' : requestedHost

      let closed = false
      let seq = 0
      const streams = new Map<number, PortTunnelStream>()
      let resolveClosed = (): void => {}
      const closedPromise = new Promise<void>((resolve) => {
        resolveClosed = resolve
      })

      const sendCloseFrame = (streamId: number, reason: string | null): void => {
        if (!closed) {
          sendBinary(encodePortTunnelCloseFrame(streamId, seq++, reason ?? undefined))
        }
      }
      const detachStream = (streamId: number, notifyClient: boolean): void => {
        const stream = streams.get(streamId)
        if (!stream) {
          return
        }
        streams.delete(streamId)
        stream.unregister()
        stream.socket.destroy()
        if (notifyClient) {
          sendCloseFrame(streamId, stream.lastError)
        }
      }
      const openStream = (streamId: number): void => {
        if (closed || streams.has(streamId)) {
          return
        }
        const socket = createConnection({ host: dialHost, port: params.port })
        // Why: Nagle adds ~40ms per small HTTP write on top of the WebSocket
        // round-trip; the tunnel is latency-bound, not throughput-bound.
        socket.setNoDelay(true)
        const stream: PortTunnelStream = {
          socket,
          lastError: null,
          // Why: registered synchronously so data frames the client sent right
          // after its open frame find the handler (frames arrive in order).
          unregister: registerBinaryStreamHandler(streamId, (frame: TerminalStreamFrame) => {
            if (streams.get(streamId) !== stream) {
              return
            }
            if (frame.opcode === TerminalStreamOpcode.TunnelData) {
              // Why: writes issued before 'connect' are queued by net.Socket,
              // so no explicit pre-connect buffering is needed here.
              socket.write(Buffer.from(frame.payload))
            } else if (frame.opcode === TerminalStreamOpcode.TunnelClose) {
              detachStream(streamId, false)
            }
          })
        }
        streams.set(streamId, stream)
        socket.on('data', (chunk: Buffer) => {
          if (!closed && streams.get(streamId) === stream) {
            sendBinary(encodePortTunnelDataFrame(streamId, seq++, chunk))
          }
        })
        socket.on('error', (error: Error) => {
          stream.lastError = error.message
        })
        socket.on('close', () => {
          if (streams.get(streamId) === stream) {
            streams.delete(streamId)
            stream.unregister()
            sendCloseFrame(streamId, stream.lastError)
          }
        })
      }

      const unregisterControl = registerBinaryStreamHandler(
        PORT_TUNNEL_CONTROL_STREAM_ID,
        (frame) => {
          if (frame.opcode !== TerminalStreamOpcode.TunnelOpen) {
            return
          }
          const streamId = decodePortTunnelOpenStreamId(frame)
          if (streamId !== null && streamId !== PORT_TUNNEL_CONTROL_STREAM_ID) {
            openStream(streamId)
          }
        }
      )
      const closeTunnel = (): void => {
        if (closed) {
          return
        }
        for (const streamId of Array.from(streams.keys())) {
          detachStream(streamId, false)
        }
        closed = true
        unregisterControl()
        resolveClosed()
      }

      signal?.addEventListener('abort', closeTunnel, { once: true })
      runtime.registerSubscriptionCleanup(
        `ports-tunnel:${connectionId}:${requestId ?? params.port}`,
        closeTunnel,
        connectionId
      )
      emit({ type: 'ready', port: params.port, host: dialHost })
      await closedPromise
    }
  })
]
