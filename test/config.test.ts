import { UserError } from '@missionsquad/fastmcp'
import { createAppConfigFromEnv, resolveRequestConfig } from '../src/config.js'

describe('config', () => {
  it('reads env fallback credentials', () => {
    const config = createAppConfigFromEnv({
      XAI_API_KEY: 'env-key',
    })

    expect(config.defaultApiKey).toBe('env-key')
    expect(config.defaultBaseUrl).toBe('https://api.x.ai/v1')
    expect(config.defaultModel).toBe('grok-4.3')
  })

  it('prefers hidden xaiApiKey over env fallback', () => {
    const config = createAppConfigFromEnv({
      XAI_API_KEY: 'env-key',
    })

    const resolved = resolveRequestConfig({ xaiApiKey: 'hidden-key' }, config)

    expect(resolved.apiKey).toBe('hidden-key')
  })

  it('uses a trimmed model override while preserving hidden authentication', () => {
    const config = createAppConfigFromEnv({ XAI_MODEL: ' grok-4.7 ' })
    const resolved = resolveRequestConfig({ xaiApiKey: 'hidden-key' }, config)

    expect(resolved.model).toBe('grok-4.7')
    expect(resolved.apiKey).toBe('hidden-key')
  })

  it('uses the default model for an empty override', () => {
    expect(createAppConfigFromEnv({ XAI_MODEL: ' ' }).defaultModel).toBe('grok-4.3')
  })

  it('throws when the hidden xaiApiKey is the wrong type', () => {
    const config = createAppConfigFromEnv({})

    expect(() => resolveRequestConfig({ xaiApiKey: 123 }, config)).toThrow(UserError)
    expect(() => resolveRequestConfig({ xaiApiKey: 123 }, config)).toThrow(
      'Hidden argument "xaiApiKey" must be a string when provided.'
    )
  })

  it('throws a remediation error when no credentials are available', () => {
    const config = createAppConfigFromEnv({})

    expect(() => resolveRequestConfig(undefined, config)).toThrow(UserError)
    expect(() => resolveRequestConfig(undefined, config)).toThrow(
      'Configure the hidden secret "xaiApiKey"'
    )
  })
})
