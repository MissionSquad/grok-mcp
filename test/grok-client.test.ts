import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  APIError,
  AuthenticationError,
  NetworkError,
  RateLimitError,
  TimeoutError,
} from '../src/errors.js'
import { GrokClient } from '../src/grok-client.js'
import type { ResolvedRequestConfig } from '../src/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function loadFixtures(): Promise<Record<string, Record<string, unknown>>> {
  const raw = await readFile(resolve(__dirname, 'fixtures/mock-responses.json'), 'utf8')
  return JSON.parse(raw) as Record<string, Record<string, unknown>>
}

function createConfig(): ResolvedRequestConfig {
  return {
    apiKey: 'test-api-key',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-4-1-fast-reasoning',
    maxRetries: 2,
    timeoutMs: 1_000,
    backoffFactor: 1.5,
    maxRequestsPerMinute: 60,
    burstLimit: 10,
    defaultMaxResults: 20,
    userAgent: 'grok-mcp/0.3.0',
  }
}

describe('GrokClient', () => {
  it('builds authenticated headers', () => {
    const client = new GrokClient(createConfig())

    expect(client.getHeaders()).toEqual({
      Authorization: 'Bearer test-api-key',
      'Content-Type': 'application/json',
      'User-Agent': 'grok-mcp/0.3.0',
    })
  })

  it('searches posts successfully', async () => {
    const fixtures = await loadFixtures()
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixtures.search_posts_success), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const client = new GrokClient(createConfig(), { fetchImpl })
    const result = await client.searchPosts({ query: 'AI technology', maxResults: 10 })

    expect(result.id).toBe('chatcmpl-test-123')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('checks health successfully', async () => {
    const fixtures = await loadFixtures()
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixtures.health_check_success), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const client = new GrokClient(createConfig(), { fetchImpl })
    const result = await client.healthCheck()

    expect(result.status).toBe('healthy')
    expect(result.models).toBeDefined()
  })

  it('throws authentication errors', async () => {
    const fixtures = await loadFixtures()
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixtures.api_error_401), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const client = new GrokClient(createConfig(), { fetchImpl })

    await expect(client.searchPosts({ query: 'test' })).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('throws rate limit errors with retry-after', async () => {
    const fixtures = await loadFixtures()
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixtures.api_error_429), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'retry-after': '60' },
      }),
    )

    const client = new GrokClient(createConfig(), { fetchImpl })

    await expect(client.searchPosts({ query: 'test' })).rejects.toEqual(expect.objectContaining<Partial<RateLimitError>>({
      retryAfter: 60,
    }))
  })

  it('throws API errors for non-auth server failures', async () => {
    const fixtures = await loadFixtures()
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixtures.api_error_500), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const client = new GrokClient(createConfig(), { fetchImpl })

    await expect(client.searchPosts({ query: 'test' })).rejects.toBeInstanceOf(APIError)
  })

  it('throws timeout errors when fetch aborts', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException('Request timed out', 'AbortError'))
    const client = new GrokClient(createConfig(), { fetchImpl })

    await expect(client.searchPosts({ query: 'test' })).rejects.toBeInstanceOf(TimeoutError)
  })

  it('throws network errors when fetch fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('Network connection failed'))
    const client = new GrokClient(createConfig(), { fetchImpl })

    await expect(client.searchPosts({ query: 'test' })).rejects.toBeInstanceOf(NetworkError)
  })

  it('retries temporary failures before succeeding', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('Timeout 1', 'AbortError'))
      .mockRejectedValueOnce(new DOMException('Timeout 2', 'AbortError'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ test: 'response' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    const client = new GrokClient(createConfig(), { fetchImpl, sleep })
    const result = await client.searchPosts({ query: 'test' })

    expect(result.test).toBe('response')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('detects rate limiting from recent request history', () => {
    const now = 1_000_000
    const client = new GrokClient(createConfig(), { now: () => now })
    ;(client as unknown as { requestTimes: number[] }).requestTimes = Array.from({ length: 60 }, (_, index) => now - index)

    expect(client.shouldRateLimit()).toBe(true)
  })
})
