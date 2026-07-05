import { describe, expect, it } from 'vitest'
import {
  buildNativeChatEffortCommand,
  buildNativeChatFastCommand,
  buildNativeChatModelCommand,
  buildNativeChatThinkingCommand
} from './native-chat-model-command'

describe('native-chat model command builders', () => {
  it('builds a plain model command for the 200K window', () => {
    expect(buildNativeChatModelCommand('opus', '200k')).toBe('/model opus')
    expect(buildNativeChatModelCommand('sonnet', '200k')).toBe('/model sonnet')
  })

  it('appends the [1m] suffix for the 1M window', () => {
    expect(buildNativeChatModelCommand('opus', '1m')).toBe('/model opus[1m]')
  })

  it('builds effort commands with the raw level id', () => {
    expect(buildNativeChatEffortCommand('xhigh')).toBe('/effort xhigh')
    expect(buildNativeChatEffortCommand('max')).toBe('/effort max')
  })

  it('builds thinking config commands as key=value', () => {
    expect(buildNativeChatThinkingCommand(true)).toBe('/config thinking=true')
    expect(buildNativeChatThinkingCommand(false)).toBe('/config thinking=false')
  })

  it('builds fast commands as on/off', () => {
    expect(buildNativeChatFastCommand(true)).toBe('/fast on')
    expect(buildNativeChatFastCommand(false)).toBe('/fast off')
  })
})
