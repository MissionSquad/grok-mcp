import { UserError } from '@missionsquad/fastmcp'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { createToolDefinitions } from '../src/tools.js'
import type { AppConfig } from '../src/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function loadFixtures(): Promise<Record<string, Record<string, unknown>>> {
  const raw = await readFile(resolve(__dirname, 'fixtures/mock-responses.json'), 'utf8')
  return JSON.parse(raw) as Record<string, Record<string, unknown>>
}

function createContext(extraArgs?: Record<string, unknown>) {
  return {
    session: undefined,
    reportProgress: vi.fn().mockResolvedValue(undefined),
    log: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
    extraArgs,
  }
}

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

describe('tools', () => {
  it('exports the current tool surface', () => {
    const tools = createToolDefinitions()

    expect(tools).toHaveLength(5)
    expect(tools.map((tool) => tool.name)).toEqual([
      'search_posts',
      'search_users',
      'search_threads',
      'get_trends',
      'health_check',
    ])
  })

  it('does not expose xaiApiKey in the public tool schema', () => {
    const tools = createToolDefinitions()
    const searchPostsTool = tools.find((tool) => tool.name === 'search_posts')
    const schema = searchPostsTool?.parameters as unknown as z.AnyZodObject

    expect(searchPostsTool).toBeDefined()
    expect(schema.shape.xaiApiKey).toBeUndefined()
  })

  it('executes search_posts with hidden credentials', async () => {
    const fixtures = await loadFixtures()
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixtures.search_posts_success), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const tools = createToolDefinitions({
      ...createDefaults(),
      defaultApiKey: 'env-key',
    })
    const searchPosts = tools.find((tool) => tool.name === 'search_posts')!

    vi.stubGlobal('fetch', fetchImpl)

    const result = await searchPosts.execute(
      {
        query: 'AI technology',
        max_results: 10,
        analysis_mode: 'basic',
      },
      createContext({ xaiApiKey: 'hidden-key' }),
    )

    expect(result).toContain('Found 3 posts')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][1]?.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer hidden-key' }),
    )
  })

  it('throws a remediation error when credentials are missing', async () => {
    const tools = createToolDefinitions(createDefaults())
    const healthCheck = tools.find((tool) => tool.name === 'health_check')!

    await expect(healthCheck.execute({}, createContext())).rejects.toBeInstanceOf(UserError)
    await expect(healthCheck.execute({}, createContext())).rejects.toThrow('Configure the hidden secret "xaiApiKey"')
  })

  it('formats trends output', async () => {
    const fixtures = await loadFixtures()
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixtures.get_trends_success), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const tools = createToolDefinitions(createDefaults({ defaultApiKey: 'env-key' }))
    const getTrends = tools.find((tool) => tool.name === 'get_trends')!

    vi.stubGlobal('fetch', fetchImpl)

    const result = await getTrends.execute(
      {
        location: 'Global',
        max_results: 20,
      },
      createContext(),
    )

    expect(result).toContain('Trending topics for Global')
    expect(result).toContain('TechNews')
  })
})
