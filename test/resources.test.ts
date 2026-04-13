import { createResources } from '../src/resources.js'
import type { AppConfig } from '../src/config.js'

function createDefaults(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    defaultApiKey: undefined,
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4-1-fast-reasoning',
    maxRetries: 0,
    timeoutMs: 5_000,
    backoffFactor: 1.5,
    maxRequestsPerMinute: 60,
    burstLimit: 10,
    defaultMaxResults: 20,
    userAgent: 'grok-mcp/0.3.0',
    ...overrides,
  }
}

describe('resources', () => {
  it('exports the current resource surface', () => {
    const resources = createResources(createDefaults())

    expect(resources.map((resource) => resource.uri)).toEqual(['grok://config', 'grok://health'])
  })

  it('returns safe configuration metadata', async () => {
    const resources = createResources(createDefaults({ defaultApiKey: 'env-key' }))
    const configResource = resources.find((resource) => resource.uri === 'grok://config')!

    const result = await configResource.load()
    const payload = JSON.parse((result as { text: string }).text) as Record<string, unknown>

    expect(payload.server_name).toBe('grok-search-mcp')
    expect(payload.base_url).toBe('https://api.x.ai/v1')
    expect(payload.env_fallback_api_key_configured).toBe(true)
    expect(payload.hidden_secret_note).toBeDefined()
  })

  it('returns an unconfigured health response when only hidden auth is available', async () => {
    const resources = createResources(createDefaults())
    const healthResource = resources.find((resource) => resource.uri === 'grok://health')!

    const result = await healthResource.load()
    const payload = JSON.parse((result as { text: string }).text) as Record<string, unknown>

    expect(payload.status).toBe('unconfigured')
    expect(String(payload.message)).toContain('Resources do not receive per-call hidden secrets')
  })
})
