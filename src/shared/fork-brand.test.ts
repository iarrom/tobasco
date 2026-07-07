import { describe, expect, it } from 'vitest'

import {
  FORK_BRAND_DISPLAY_ENABLED,
  applyForkBrandForDisplay,
  forkBrandI18nPostProcessor,
  replaceUpstreamBrandName
} from './fork-brand'

describe('replaceUpstreamBrandName', () => {
  it('replaces the standalone capitalized brand word', () => {
    expect(replaceUpstreamBrandName('Explore Orca')).toBe('Explore Tobasco')
    expect(replaceUpstreamBrandName('Orca is still running')).toBe('Tobasco is still running')
    expect(replaceUpstreamBrandName("in Orca's browser")).toBe("in Tobasco's browser")
    expect(replaceUpstreamBrandName('relaunch Orca.')).toBe('relaunch Tobasco.')
  })

  it('replaces every occurrence in one string', () => {
    expect(replaceUpstreamBrandName('Orca and Orca again')).toBe('Tobasco and Tobasco again')
  })

  it('replaces the brand adjacent to CJK text', () => {
    expect(replaceUpstreamBrandName('Orcaを再起動')).toBe('Tobascoを再起動')
  })

  it('replaces the all-caps wordmark', () => {
    expect(replaceUpstreamBrandName('ORCA')).toBe('TOBASCO')
  })

  it('keeps lowercase functional identifiers untouched', () => {
    expect(replaceUpstreamBrandName('orca://pair?code=abc')).toBe('orca://pair?code=abc')
    expect(replaceUpstreamBrandName('/usr/local/bin/orca')).toBe('/usr/local/bin/orca')
    expect(replaceUpstreamBrandName('orca-ide serve')).toBe('orca-ide serve')
    expect(replaceUpstreamBrandName('ORCA_AGENT_HOOK_TOKEN')).toBe('ORCA_AGENT_HOOK_TOKEN')
  })

  it('keeps compound identifiers without a word boundary untouched', () => {
    expect(replaceUpstreamBrandName('OrcaCreatedBranch')).toBe('OrcaCreatedBranch')
  })
})

describe('applyForkBrandForDisplay', () => {
  it('is disabled under vitest so upstream copy assertions stay valid', () => {
    expect(FORK_BRAND_DISPLAY_ENABLED).toBe(false)
    expect(applyForkBrandForDisplay('Explore Orca')).toBe('Explore Orca')
    expect(forkBrandI18nPostProcessor.process('Explore Orca', 'k', {}, undefined)).toBe(
      'Explore Orca'
    )
  })
})
