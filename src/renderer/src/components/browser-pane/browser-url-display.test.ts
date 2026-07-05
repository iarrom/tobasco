import { describe, expect, it } from 'vitest'
import { formatBrowserUrlDisplay } from './browser-url-display'

describe('formatBrowserUrlDisplay', () => {
  it('splits scheme, host, and path', () => {
    expect(formatBrowserUrlDisplay('https://wcbot.localhost/results')).toEqual({
      scheme: 'https://',
      host: 'wcbot.localhost',
      path: '/results'
    })
  })

  it('drops a lone trailing slash from the path', () => {
    expect(formatBrowserUrlDisplay('https://example.com/')).toEqual({
      scheme: 'https://',
      host: 'example.com',
      path: ''
    })
  })

  it('keeps query and hash in the path', () => {
    const { path } = formatBrowserUrlDisplay('https://x.com/a?b=1#c')
    expect(path).toBe('/a?b=1#c')
  })

  it('falls back to host-only for non-URL input', () => {
    expect(formatBrowserUrlDisplay('about:blank')).toEqual({
      scheme: '',
      host: 'about:blank',
      path: ''
    })
    expect(formatBrowserUrlDisplay('search terms')).toEqual({
      scheme: '',
      host: 'search terms',
      path: ''
    })
  })
})
