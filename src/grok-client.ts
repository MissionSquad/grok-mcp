import {
  APIError,
  AuthenticationError,
  NetworkError,
  RateLimitError,
  ResponseParsingError,
  TimeoutError,
} from './errors.js'
import type { ResolvedRequestConfig } from './config.js'

export interface SearchPostsOptions {
  query: string
  maxResults?: number
  handles?: string[]
  dateRange?: {
    start?: string
    end?: string
  }
  analysisMode?: 'basic' | 'comprehensive'
}

export interface SearchUsersOptions {
  query: string
  maxResults?: number
}

export interface SearchThreadsOptions {
  query: string
  maxResults?: number
}

export interface GetTrendsOptions {
  location?: string
}

export interface GrokClientDependencies {
  fetchImpl?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

type JsonObject = Record<string, unknown>

export class GrokClient {
  private readonly fetchImpl: typeof fetch

  private readonly now: () => number

  private readonly sleep: (ms: number) => Promise<void>

  private requestTimes: number[] = []

  constructor(
    public readonly config: ResolvedRequestConfig,
    dependencies: GrokClientDependencies = {},
  ) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch
    this.now = dependencies.now ?? Date.now
    this.sleep = dependencies.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': this.config.userAgent,
    }
  }

  shouldRateLimit(): boolean {
    const now = this.now()

    this.requestTimes = this.requestTimes.filter((time) => now - time < 60_000)

    if (this.requestTimes.length >= this.config.maxRequestsPerMinute) {
      return true
    }

    const recentRequests = this.requestTimes.filter((time) => now - time < 10_000)
    return recentRequests.length >= this.config.burstLimit
  }

  async waitForRateLimit(): Promise<void> {
    if (!this.shouldRateLimit()) {
      return
    }

    const oldestRequest = Math.min(...this.requestTimes)
    const waitMs = Math.max(60_000 - (this.now() - oldestRequest), 0)
    if (waitMs > 0) {
      await this.sleep(waitMs)
    }
  }

  async searchPosts(options: SearchPostsOptions): Promise<JsonObject> {
    const maxResults = options.maxResults ?? this.config.defaultMaxResults
    const xSearchTool: JsonObject = { type: 'x_search' }

    if (options.handles?.length) {
      xSearchTool.allowed_x_handles = options.handles.slice(0, 10)
    }

    if (options.dateRange?.start) {
      xSearchTool.from_date = options.dateRange.start
    }

    if (options.dateRange?.end) {
      xSearchTool.to_date = options.dateRange.end
    }

    let prompt = `Search X for posts about: ${options.query}. Return up to ${maxResults} relevant results.`
    if (options.analysisMode === 'comprehensive') {
      prompt += ' Provide comprehensive analysis including sentiment, engagement patterns, and key themes.'
    }

    return this.makeRequest('POST', '/responses', {
      model: this.config.model,
      input: [{ role: 'user', content: prompt }],
      tools: [xSearchTool],
    })
  }

  async searchUsers(options: SearchUsersOptions): Promise<JsonObject> {
    const maxResults = options.maxResults ?? this.config.defaultMaxResults

    return this.makeRequest('POST', '/responses', {
      model: this.config.model,
      input: [
        {
          role: 'user',
          content: `Search X for users related to: ${options.query}. Return up to ${maxResults} relevant user profiles with their handles, bios, and follower counts.`,
        },
      ],
      tools: [{ type: 'x_search' }],
    })
  }

  async searchThreads(options: SearchThreadsOptions): Promise<JsonObject> {
    const maxResults = options.maxResults ?? this.config.defaultMaxResults

    return this.makeRequest('POST', '/responses', {
      model: this.config.model,
      input: [
        {
          role: 'user',
          content: `Search X for conversation threads about: ${options.query}. Return up to ${maxResults} complete conversation threads with context and replies.`,
        },
      ],
      tools: [{ type: 'x_search' }],
    })
  }

  async getTrends(options: GetTrendsOptions = {}): Promise<JsonObject> {
    const locationText = options.location ? ` in ${options.location}` : ''

    return this.makeRequest('POST', '/responses', {
      model: this.config.model,
      input: [
        {
          role: 'user',
          content: `What are the current trending topics and hashtags on X${locationText}? Provide a comprehensive analysis of what people are talking about right now.`,
        },
      ],
      tools: [{ type: 'x_search' }],
    })
  }

  async healthCheck(): Promise<JsonObject> {
    try {
      const response = await this.makeRequest('GET', '/models')
      return { status: 'healthy', models: response }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private async makeRequest(method: 'GET' | 'POST', endpoint: string, body?: JsonObject): Promise<JsonObject> {
    await this.waitForRateLimit()
    this.requestTimes.push(this.now())

    let lastError: Error | undefined

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchJson(method, endpoint, body)

        if (response.status === 401) {
          throw new AuthenticationError('Invalid API key or authentication failed.')
        }

        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('retry-after')
          const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : 60
          throw new RateLimitError('API rate limit exceeded.', Number.isNaN(retryAfter) ? 60 : retryAfter)
        }

        if (response.status >= 400) {
          const errorMessage = await extractErrorMessage(response)
          throw new APIError(errorMessage, response.status)
        }

        const text = await response.text()
        try {
          return JSON.parse(text) as JsonObject
        } catch (error) {
          throw new ResponseParsingError(
            `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      } catch (error) {
        if (error instanceof AuthenticationError || error instanceof RateLimitError || error instanceof APIError) {
          throw error
        }

        lastError = normalizeNetworkError(error)

        if (attempt < this.config.maxRetries) {
          const waitMs = this.config.backoffFactor ** attempt * 1_000
          await this.sleep(waitMs)
          continue
        }
      }
    }

    throw lastError ?? new APIError('Unexpected error while calling xAI API.')
  }

  private async fetchJson(method: 'GET' | 'POST', endpoint: string, body?: JsonObject): Promise<Response> {
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      return await this.fetchImpl(`${this.config.baseUrl}${endpoint}`, {
        method,
        headers: this.getHeaders(),
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutHandle)
    }
  }
}

function normalizeNetworkError(error: unknown): Error {
  if (error instanceof TimeoutError || error instanceof NetworkError || error instanceof ResponseParsingError) {
    return error
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new TimeoutError(`Request timed out after the configured timeout.`)
  }

  if (error instanceof Error) {
    return new NetworkError(`Network error: ${error.message}`)
  }

  return new NetworkError(`Network error: ${String(error)}`)
}

async function extractErrorMessage(response: Response): Promise<string> {
  const fallback = `API request failed with status ${response.status}.`
  const text = await response.text()

  if (!text) {
    return fallback
  }

  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string }
    if (typeof parsed.error === 'string') {
      return parsed.error
    }
    if (parsed.error && typeof parsed.error === 'object' && typeof parsed.error.message === 'string') {
      return parsed.error.message
    }
    return fallback
  } catch {
    return fallback
  }
}
