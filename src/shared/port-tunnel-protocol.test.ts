import { describe, expect, it } from 'vitest'
import {
  PORT_TUNNEL_CONTROL_STREAM_ID,
  decodePortTunnelCloseReason,
  decodePortTunnelOpenStreamId,
  encodePortTunnelCloseFrame,
  encodePortTunnelDataFrame,
  encodePortTunnelOpenFrame,
  isPortTunnelLoopbackHost
} from './port-tunnel-protocol'
import { TerminalStreamOpcode, decodeTerminalStreamFrame } from './terminal-stream-protocol'

describe('port tunnel protocol', () => {
  it('round-trips an open frame on the control stream', () => {
    const frame = decodeTerminalStreamFrame(encodePortTunnelOpenFrame(42, 3))
    expect(frame).not.toBeNull()
    expect(frame!.opcode).toBe(TerminalStreamOpcode.TunnelOpen)
    expect(frame!.streamId).toBe(PORT_TUNNEL_CONTROL_STREAM_ID)
    expect(frame!.seq).toBe(3)
    expect(decodePortTunnelOpenStreamId(frame!)).toBe(42)
  })

  it('rejects open payloads without a positive integer streamId', () => {
    const frame = decodeTerminalStreamFrame(encodePortTunnelOpenFrame(42, 0))!
    expect(decodePortTunnelOpenStreamId({ ...frame, payload: new Uint8Array() })).toBeNull()
    expect(
      decodePortTunnelOpenStreamId({
        ...frame,
        payload: new TextEncoder().encode(JSON.stringify({ streamId: -1 }))
      })
    ).toBeNull()
  })

  it('round-trips data frames with the raw payload', () => {
    const payload = new Uint8Array([1, 2, 3, 250])
    const frame = decodeTerminalStreamFrame(encodePortTunnelDataFrame(7, 11, payload))
    expect(frame!.opcode).toBe(TerminalStreamOpcode.TunnelData)
    expect(frame!.streamId).toBe(7)
    expect(Array.from(frame!.payload)).toEqual([1, 2, 3, 250])
  })

  it('round-trips close frames with and without a reason', () => {
    const withReason = decodeTerminalStreamFrame(encodePortTunnelCloseFrame(7, 1, 'refused'))!
    expect(withReason.opcode).toBe(TerminalStreamOpcode.TunnelClose)
    expect(decodePortTunnelCloseReason(withReason)).toBe('refused')

    const withoutReason = decodeTerminalStreamFrame(encodePortTunnelCloseFrame(7, 2))!
    expect(decodePortTunnelCloseReason(withoutReason)).toBeNull()
  })

  it('only accepts loopback hosts', () => {
    expect(isPortTunnelLoopbackHost('localhost')).toBe(true)
    expect(isPortTunnelLoopbackHost('127.0.0.1')).toBe(true)
    expect(isPortTunnelLoopbackHost('::1')).toBe(true)
    expect(isPortTunnelLoopbackHost('0.0.0.0')).toBe(true)
    expect(isPortTunnelLoopbackHost('LOCALHOST')).toBe(true)
    expect(isPortTunnelLoopbackHost('example.com')).toBe(false)
    expect(isPortTunnelLoopbackHost('192.168.1.10')).toBe(false)
  })
})
