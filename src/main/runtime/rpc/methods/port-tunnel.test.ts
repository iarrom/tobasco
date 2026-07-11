import { createServer, type AddressInfo, type Server, type Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcContext, RpcStreamingMethod } from '../core'
import {
  TerminalStreamOpcode,
  decodeTerminalStreamFrame,
  type TerminalStreamFrame
} from '../../../../shared/terminal-stream-protocol'
import {
  encodePortTunnelCloseFrame,
  encodePortTunnelDataFrame,
  encodePortTunnelOpenFrame
} from '../../../../shared/port-tunnel-protocol'
import { PORT_TUNNEL_METHODS } from './port-tunnel'

const tunnelMethod = PORT_TUNNEL_METHODS[0] as RpcStreamingMethod

type TestHarness = {
  ctx: RpcContext
  emitted: unknown[]
  framesOut: TerminalStreamFrame[]
  deliverFrame: (bytes: Uint8Array) => void
  abort: AbortController
}

function createHarness(): TestHarness {
  const emitted: unknown[] = []
  const framesOut: TerminalStreamFrame[] = []
  const handlers = new Map<number, (frame: TerminalStreamFrame) => void>()
  const abort = new AbortController()
  const ctx = {
    runtime: {
      getRuntimeId: () => 'test-runtime',
      registerSubscriptionCleanup: vi.fn()
    } as unknown as OrcaRuntimeService,
    connectionId: 'conn-1',
    requestId: 'req-1',
    signal: abort.signal,
    sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => {
      const frame = decodeTerminalStreamFrame(bytes)
      if (frame) {
        framesOut.push(frame)
      }
      return true
    },
    registerBinaryStreamHandler: (
      streamId: number,
      handler: (frame: TerminalStreamFrame) => void
    ) => {
      handlers.set(streamId, handler)
      return () => handlers.delete(streamId)
    }
  } as unknown as RpcContext
  return {
    ctx,
    emitted,
    framesOut,
    abort,
    deliverFrame: (bytes) => {
      const frame = decodeTerminalStreamFrame(bytes)
      if (frame) {
        handlers.get(frame.streamId)?.(frame)
      }
    }
  }
}

async function startEchoServer(): Promise<{ server: Server; port: number; sockets: Socket[] }> {
  const sockets: Socket[] = []
  const server = createServer((socket) => {
    sockets.push(socket)
    socket.on('data', (chunk) => socket.write(chunk))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, port: (server.address() as AddressInfo).port, sockets }
}

describe('workspacePorts.tunnel', () => {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.()
    }
  })

  it('rejects non-loopback hosts', async () => {
    const harness = createHarness()
    await expect(
      tunnelMethod.handler({ port: 80, host: 'example.com' }, harness.ctx, () => {})
    ).rejects.toThrow('port_tunnel_host_not_loopback')
  })

  it('relays TCP data both ways for an opened stream', async () => {
    const { server, port, sockets } = await startEchoServer()
    cleanups.push(() => server.close())
    const harness = createHarness()
    const done = tunnelMethod.handler({ port, host: '127.0.0.1' }, harness.ctx, (result) =>
      harness.emitted.push(result)
    )
    cleanups.push(() => harness.abort.abort())

    await vi.waitFor(() => {
      expect(harness.emitted).toContainEqual({ type: 'ready', port, host: '127.0.0.1' })
    })

    harness.deliverFrame(encodePortTunnelOpenFrame(5, 0))
    harness.deliverFrame(encodePortTunnelDataFrame(5, 1, new TextEncoder().encode('ping')))

    await vi.waitFor(() => {
      const dataFrame = harness.framesOut.find(
        (frame) => frame.opcode === TerminalStreamOpcode.TunnelData && frame.streamId === 5
      )
      expect(dataFrame).toBeDefined()
      expect(new TextDecoder().decode(dataFrame!.payload)).toBe('ping')
    })

    // Why: a server-side close must notify the client so it can drop the
    // local socket instead of leaving it half-open.
    sockets[0]?.end()
    await vi.waitFor(() => {
      expect(
        harness.framesOut.some(
          (frame) => frame.opcode === TerminalStreamOpcode.TunnelClose && frame.streamId === 5
        )
      ).toBe(true)
    })

    harness.abort.abort()
    await done
  })

  it('closes the remote socket when the client sends a close frame', async () => {
    const { server, port, sockets } = await startEchoServer()
    cleanups.push(() => server.close())
    const harness = createHarness()
    const done = tunnelMethod.handler({ port, host: '127.0.0.1' }, harness.ctx, (result) =>
      harness.emitted.push(result)
    )
    cleanups.push(() => harness.abort.abort())

    await vi.waitFor(() => {
      expect(harness.emitted).toContainEqual({ type: 'ready', port, host: '127.0.0.1' })
    })
    harness.deliverFrame(encodePortTunnelOpenFrame(9, 0))
    await vi.waitFor(() => {
      expect(sockets.length).toBe(1)
    })

    harness.deliverFrame(encodePortTunnelCloseFrame(9, 1))
    await vi.waitFor(() => {
      expect(sockets[0]!.destroyed || sockets[0]!.readableEnded).toBe(true)
    })

    // Why: the stream was detached by the client; its close must not echo
    // back as a server-initiated close frame.
    expect(
      harness.framesOut.some(
        (frame) => frame.opcode === TerminalStreamOpcode.TunnelClose && frame.streamId === 9
      )
    ).toBe(false)

    harness.abort.abort()
    await done
  })

  it('reports connection failures with a close frame carrying the reason', async () => {
    // Why: grab a port that is guaranteed closed by binding and releasing it.
    const { server, port } = await startEchoServer()
    await new Promise<void>((resolve) => server.close(() => resolve()))

    const harness = createHarness()
    const done = tunnelMethod.handler({ port, host: '127.0.0.1' }, harness.ctx, (result) =>
      harness.emitted.push(result)
    )
    cleanups.push(() => harness.abort.abort())

    await vi.waitFor(() => {
      expect(harness.emitted).toContainEqual({ type: 'ready', port, host: '127.0.0.1' })
    })
    harness.deliverFrame(encodePortTunnelOpenFrame(3, 0))

    await vi.waitFor(() => {
      const closeFrame = harness.framesOut.find(
        (frame) => frame.opcode === TerminalStreamOpcode.TunnelClose && frame.streamId === 3
      )
      expect(closeFrame).toBeDefined()
      expect(new TextDecoder().decode(closeFrame!.payload)).toContain('ECONNREFUSED')
    })

    harness.abort.abort()
    await done
  })

  it('maps 0.0.0.0 to the loopback dial target', async () => {
    const { server, port } = await startEchoServer()
    cleanups.push(() => server.close())
    const harness = createHarness()
    const done = tunnelMethod.handler({ port, host: '0.0.0.0' }, harness.ctx, (result) =>
      harness.emitted.push(result)
    )
    cleanups.push(() => harness.abort.abort())

    await vi.waitFor(() => {
      expect(harness.emitted).toContainEqual({ type: 'ready', port, host: '127.0.0.1' })
    })

    harness.abort.abort()
    await done
  })
})
