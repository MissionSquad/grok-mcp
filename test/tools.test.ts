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
    defaultModel: 'grok-4.3',
    maxRetries: 0,
    timeoutMs: 5_000,
    backoffFactor: 1.5,
    maxRequestsPerMinute: 60,
    burstLimit: 10,
    defaultMaxResults: 20,
    userAgent: 'grok-mcp/0.3.1',
    ...overrides,
  }
}

describe('tools', () => {
  afterEach(() => vi.unstubAllGlobals())

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

    expect(result).toContain('**@user1**')
    expect(result).toContain('**@user3**')
    expect(result).not.toContain('No posts found')
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

  it.each(['search_posts', 'search_users', 'search_threads', 'get_trends'])('preserves provider prose and sources in %s', async (name) => {
    const answer = '| Name | Details |\n| --- | --- |\n| Example | Bitcoin discussion |'
    const url = 'https://x.com/example/status/123'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      object: 'response',
      status: 'completed',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: answer, annotations: [{ type: 'url_citation', url }] }] }],
    }))))
    const tool = createToolDefinitions(createDefaults({ defaultApiKey: 'env-key' })).find((tool) => tool.name === name)!

    const result = await tool.execute({ query: 'bitcoin', max_results: 20, analysis_mode: 'basic' }, createContext())

    expect(result).toBe(`${answer}\n\nSources:\n- ${url}`)
  })

  it('keeps all posts and comprehensive analysis instead of truncating at five', async () => {
    const posts = Array.from({ length: 6 }, (_, i) => `${i + 1}. @user${i}: Bitcoin post ${i}`).join('\n\n')
    const analysis = 'Sentiment: mixed. Key themes include adoption and volatility.'
    const url = 'https://x.com/example/status/123'
    const answer = `${posts}\n\n${analysis}\n\n[[1]](${url})`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: answer, annotations: [{ type: 'url_citation', url }] }] }],
    }))))
    const tool = createToolDefinitions(createDefaults({ defaultApiKey: 'env-key' })).find((tool) => tool.name === 'search_posts')!

    expect(await tool.execute({ query: 'bitcoin', max_results: 20, analysis_mode: 'comprehensive' }, createContext())).toBe(answer)
  })

  it('preserves an explicit provider no-match answer', async () => {
    const answer = 'No matching posts were found for this query and date range.'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: answer }] }],
    }))))
    const tool = createToolDefinitions(createDefaults({ defaultApiKey: 'env-key' })).find((tool) => tool.name === 'search_posts')!

    expect(await tool.execute({ query: 'bitcoin' }, createContext())).toBe(answer)
  })

  it.each([
    { status: 'completed', output: [] },
    { status: 'failed', error: { message: 'Search unavailable' } },
    { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
  ])('surfaces unusable provider responses as MCP errors: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))))
    const tool = createToolDefinitions(createDefaults({ defaultApiKey: 'env-key' })).find((tool) => tool.name === 'search_posts')!

    await expect(tool.execute({ query: 'bitcoin' }, createContext())).rejects.toBeInstanceOf(UserError)
  })

  it('surfaces an unavailable model as an error instead of no posts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'The requested model is unavailable.' },
    }), { status: 404 })))
    const tool = createToolDefinitions(createDefaults({ defaultApiKey: 'env-key' })).find((tool) => tool.name === 'search_posts')!

    await expect(tool.execute({ query: 'bitcoin' }, createContext())).rejects.toThrow('The requested model is unavailable.')
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

    expect(result).toContain('Current trending topics:')
    expect(result).toContain('TechNews')
  })
})
