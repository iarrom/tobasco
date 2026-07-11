import { connect, type Socket } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TerminalStreamOpcode,
  decodeTerminalStreamFrame,
  type TerminalStreamFrame
} from '../../shared/terminal-stream-protocol'
import { encodePortTunnelDataFrame } from '../../shared/port-tunnel-protocol'
import { closeAllBrowserPortTunnels, ensureBrowserPortTunnel } from './remote-browser-port-tunnel'

const { subscribeRuntimeEnvironmentMock, resolveEnvironmentMock } = vi.hoisted(() => ({
  subscribeRuntimeEnvironmentMock: vi.fn(),
  resolveEnvironmentMock: vi.fn()
}))

vi.mock('../ipc/runtime-environment-transport-routing', () => ({
  subscribeRuntimeEnvironment: subscribeRuntimeEnvironmentMock
}))
vi.mock('../../shared/runtime-environment-store', () => ({
  resolveEnvironment: resolveEnvironmentMock
}))

type SubscriptionCallbacks = {
  onEvent: (payload: unknown) => void
  onClose: () => void
}

function createSubscriptionStub(): {
  sentFrames: TerminalStreamFrame[]
  callbacks: () => SubscriptionCallbacks
  close: ReturnType<typeof vi.fn>
} {
  const sentFrames: TerminalStreamFrame[] = []
  let callbacks: SubscriptionCallbacks | null = null
  const close = vi.fn()
  subscribeRuntimeEnvironmentMock.mockImplementation(
    async (
      _userDataPath: string,
      _selector: string,
      _method: string,
      _params: unknown,
      _timeoutMs: number,
      subscriptionCallbacks: SubscriptionCallbacks
    ) => {
      callbacks = subscriptionCallbacks
      queueMicrotask(() => {
        subscriptionCallbacks.onEvent({
          type: 'response',
          response: { id: 'r', ok: true, result: { type: 'ready' }, _meta: { runtimeId: 'rt' } }
        })
      })
      return {
        requestId: 'req-1',
        close,
        sendBinary: (bytes: Uint8Array) => {
          const frame = decodeTerminalStreamFrame(bytes)
          if (frame) {
            sentFrames.push(frame)
          }
          return true
        }
      }
    }
  )
  return { sentFrames, callbacks: () => callbacks!, close }
}

function connectLocal(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect({ port, host: '127.0.0.1' }, () => resolve(socket))
    socket.once('error', reject)
  })
}

describe('ensureBrowserPortTunnel', () => {
  beforeEach(() => {
    resolveEnvironmentMock.mockReturnValue({ id: 'env-1' })
  })
  afterEach(() => {
    closeAllBrowserPortTunnels()
    subscribeRuntimeEnvironmentMock.mockReset()
    resolveEnvironmentMock.mockReset()
  })

  it('opens a local listener and relays socket data as tunnel frames', async () => {
    const stub = createSubscriptionStub()
    const tunnel = await ensureBrowserPortTunnel('/tmp/user-data', {
      selector: 'env-1',
      port: 5173,
      host: 'localhost'
    })
    expect(tunnel.localPort).toBeGreaterThan(0)

    const socket = await connectLocal(tunnel.localPort)
    socket.write('GET / HTTP/1.1\r\n')
    await vi.waitFor(() => {
      expect(
        stub.sentFrames.some((frame) => frame.opcode === TerminalStreamOpcode.TunnelOpen)
      ).toBe(true)
      const data = stub.sentFrames.find((frame) => frame.opcode === TerminalStreamOpcode.TunnelData)
      expect(data).toBeDefined()
      expect(new TextDecoder().decode(data!.payload)).toContain('GET / HTTP/1.1')
    })

    // Why: remote responses must land on the matching local socket.
    const openFrame = stub.sentFrames.find(
      (frame) => frame.opcode === TerminalStreamOpcode.TunnelOpen
    )!
    const streamId = JSON.parse(new TextDecoder().decode(openFrame.payload)).streamId as number
    const received: Buffer[] = []
    socket.on('data', (chunk: Buffer) => received.push(chunk))
    stub.callbacks().onEvent({
      type: 'binary',
      bytes: encodePortTunnelDataFrame(streamId, 0, new TextEncoder().encode('HTTP/1.1 200 OK'))
    })
    await vi.waitFor(() => {
      expect(Buffer.concat(received).toString()).toContain('HTTP/1.1 200 OK')
    })
    socket.destroy()
  })

  it('reuses an existing tunnel for the same environment and port', async () => {
    createSubscriptionStub()
    const first = await ensureBrowserPortTunnel('/tmp/user-data', {
      selector: 'env-1',
      port: 5173
    })
    const second = await ensureBrowserPortTunnel('/tmp/user-data', {
      selector: 'env-1',
      port: 5173
    })
    expect(second.localPort).toBe(first.localPort)
    expect(subscribeRuntimeEnvironmentMock).toHaveBeenCalledTimes(1)
  })

  it('rejects when the runtime reports an error response', async () => {
    subscribeRuntimeEnvironmentMock.mockImplementation(
      async (
        _userDataPath: string,
        _selector: string,
        _method: string,
        _params: unknown,
        _timeoutMs: number,
        subscriptionCallbacks: SubscriptionCallbacks
      ) => {
        queueMicrotask(() => {
          subscriptionCallbacks.onEvent({
            type: 'response',
            response: {
              id: 'r',
              ok: false,
              error: { code: 'method_not_found', message: 'Unknown RPC method' },
              _meta: { runtimeId: 'rt' }
            }
          })
        })
        return { requestId: 'req-1', close: vi.fn(), sendBinary: () => true }
      }
    )
    await expect(
      ensureBrowserPortTunnel('/tmp/user-data', { selector: 'env-1', port: 5173 })
    ).rejects.toThrow('Unknown RPC method')
  })

  it('rejects non-loopback hosts without contacting the runtime', async () => {
    await expect(
      ensureBrowserPortTunnel('/tmp/user-data', {
        selector: 'env-1',
        port: 80,
        host: 'example.com'
      })
    ).rejects.toThrow('port_tunnel_host_not_loopback')
    expect(subscribeRuntimeEnvironmentMock).not.toHaveBeenCalled()
  })
})
