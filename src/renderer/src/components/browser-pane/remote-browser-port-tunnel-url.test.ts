import { describe, expect, it } from 'vitest'
import {
  getTunnelableRemoteBrowserTarget,
  mapLocalBrowserUrlToRemote,
  mapRemoteBrowserUrlToLocal
} from './remote-browser-port-tunnel-url'

describe('getTunnelableRemoteBrowserTarget', () => {
  it('extracts loopback http targets with explicit ports', () => {
    expect(getTunnelableRemoteBrowserTarget('http://localhost:5173/app?x=1')).toEqual({
      host: 'localhost',
      port: 5173
    })
    expect(getTunnelableRemoteBrowserTarget('http://127.0.0.1:3000/')).toEqual({
      host: '127.0.0.1',
      port: 3000
    })
    expect(getTunnelableRemoteBrowserTarget('http://0.0.0.0:8080')).toEqual({
      host: '0.0.0.0',
      port: 8080
    })
    expect(getTunnelableRemoteBrowserTarget('http://[::1]:9000')).toEqual({
      host: '::1',
      port: 9000
    })
  })

  it('applies scheme default ports', () => {
    expect(getTunnelableRemoteBrowserTarget('http://localhost/')).toEqual({
      host: 'localhost',
      port: 80
    })
    expect(getTunnelableRemoteBrowserTarget('https://localhost/')).toEqual({
      host: 'localhost',
      port: 443
    })
  })

  it('rejects non-loopback and non-http urls', () => {
    expect(getTunnelableRemoteBrowserTarget('https://example.com')).toBeNull()
    expect(getTunnelableRemoteBrowserTarget('http://192.168.0.5:5173')).toBeNull()
    expect(getTunnelableRemoteBrowserTarget('file:///tmp/index.html')).toBeNull()
    expect(getTunnelableRemoteBrowserTarget('about:blank')).toBeNull()
    expect(getTunnelableRemoteBrowserTarget('not a url')).toBeNull()
  })
})

describe('mapRemoteBrowserUrlToLocal', () => {
  const target = { host: 'localhost', port: 5173 }

  it('rewrites the port and keeps path/query/hash', () => {
    expect(mapRemoteBrowserUrlToLocal('http://localhost:5173/a/b?q=1#frag', target, 61000)).toBe(
      'http://localhost:61000/a/b?q=1#frag'
    )
  })

  it('is the identity when the local port matches the remote port', () => {
    expect(mapRemoteBrowserUrlToLocal('http://localhost:5173/app', target, 5173)).toBe(
      'http://localhost:5173/app'
    )
  })

  it('rewrites 0.0.0.0 to localhost', () => {
    expect(
      mapRemoteBrowserUrlToLocal('http://0.0.0.0:8080/', { host: '0.0.0.0', port: 8080 }, 8080)
    ).toBe('http://localhost:8080/')
  })

  it('leaves urls for other hosts or ports untouched', () => {
    expect(mapRemoteBrowserUrlToLocal('http://localhost:8000/', target, 61000)).toBe(
      'http://localhost:8000/'
    )
    expect(mapRemoteBrowserUrlToLocal('https://example.com/', target, 61000)).toBe(
      'https://example.com/'
    )
  })
})

describe('mapLocalBrowserUrlToRemote', () => {
  const target = { host: 'localhost', port: 5173 }

  it('restores the canonical remote host and port', () => {
    expect(mapLocalBrowserUrlToRemote('http://127.0.0.1:61000/a?q=1', target, 61000)).toBe(
      'http://localhost:5173/a?q=1'
    )
    expect(mapLocalBrowserUrlToRemote('http://localhost:61000/', target, 61000)).toBe(
      'http://localhost:5173/'
    )
  })

  it('keeps loopback urls on other ports untouched so new tunnels can spawn', () => {
    expect(mapLocalBrowserUrlToRemote('http://localhost:8000/', target, 61000)).toBe(
      'http://localhost:8000/'
    )
  })

  it('keeps external urls untouched', () => {
    expect(mapLocalBrowserUrlToRemote('https://example.com/', target, 61000)).toBe(
      'https://example.com/'
    )
    expect(mapLocalBrowserUrlToRemote('about:blank', target, 61000)).toBe('about:blank')
  })

  it('restores bracketed ipv6 hosts', () => {
    expect(
      mapLocalBrowserUrlToRemote('http://127.0.0.1:61000/', { host: '::1', port: 9000 }, 61000)
    ).toBe('http://[::1]:9000/')
  })
})
