import type { Context, Tool } from '@missionsquad/fastmcp'
import { UserError } from '@missionsquad/fastmcp'
import { z } from 'zod'
import { appConfig, resolveRequestConfig, type AppConfig } from './config.js'
import {
  APIError,
  AuthenticationError,
  InvalidQueryError,
  RateLimitError,
  SearchError,
} from './errors.js'
import { GrokClient } from './grok-client.js'
import { ResponseFormatter } from './response-formatter.js'

const analysisModeSchema = z.enum(['basic', 'comprehensive'])

export const SearchPostsSchema = z.object({
  query: z.string().trim().min(1, 'Query cannot be empty').max(1000),
  max_results: z.number().int().min(1).max(100).default(20),
  handles: z.array(z.string()).max(10).optional().transform((value) => value?.map((handle) => handle.replace(/^@+/, ''))),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  analysis_mode: analysisModeSchema.default('basic'),
})

export const SearchUsersSchema = z.object({
  query: z.string().trim().min(1, 'Query cannot be empty').max(1000),
  max_results: z.number().int().min(1).max(50).default(20),
})

export const SearchThreadsSchema = z.object({
  query: z.string().trim().min(1, 'Query cannot be empty').max(1000),
  max_results: z.number().int().min(1).max(20).default(10),
})

export const GetTrendsSchema = z.object({
  location: z.string().optional(),
  max_results: z.number().int().min(1).max(50).default(20),
})

export const HealthCheckSchema = z.object({})

type ToolContext = Context<undefined>

export function createToolDefinitions(defaults: AppConfig = appConfig): Tool<undefined, z.ZodTypeAny>[] {
  return [
    {
      name: 'search_posts',
      description: 'Search X.com posts with advanced filtering and analysis options.',
      parameters: SearchPostsSchema,
      execute: async (args, context) =>
        executeTool(context, defaults, async (client) => {
          const result = await client.searchPosts({
            query: args.query,
            maxResults: args.max_results,
            handles: args.handles,
            dateRange: {
              start: args.start_date,
              end: args.end_date,
            },
            analysisMode: args.analysis_mode,
          })

          const formatted = ResponseFormatter.formatSearchResponse({
            rawResponse: result,
            searchType: 'posts',
            query: args.query,
            analysisMode: args.analysis_mode,
          })

          return formatSearchSummary(formatted)
        }),
    },
    {
      name: 'search_users',
      description: 'Search for X.com users and profiles.',
      parameters: SearchUsersSchema,
      execute: async (args, context) =>
        executeTool(context, defaults, async (client) => {
          const result = await client.searchUsers({
            query: args.query,
            maxResults: args.max_results,
          })

          const formatted = ResponseFormatter.formatSearchResponse({
            rawResponse: result,
            searchType: 'users',
            query: args.query,
          })

          return formatSearchSummary(formatted)
        }),
    },
    {
      name: 'search_threads',
      description: 'Search X.com conversation threads and replies.',
      parameters: SearchThreadsSchema,
      execute: async (args, context) =>
        executeTool(context, defaults, async (client) => {
          const result = await client.searchThreads({
            query: args.query,
            maxResults: args.max_results,
          })

          const formatted = ResponseFormatter.formatSearchResponse({
            rawResponse: result,
            searchType: 'threads',
            query: args.query,
          })

          return formatSearchSummary(formatted)
        }),
    },
    {
      name: 'get_trends',
      description: 'Get trending topics and hashtags on X.com.',
      parameters: GetTrendsSchema,
      execute: async (args, context) =>
        executeTool(context, defaults, async (client) => {
          const result = await client.getTrends({
            location: args.location,
          })

          const formatted = ResponseFormatter.formatSearchResponse({
            rawResponse: result,
            searchType: 'trends',
            query: `trends_${args.location ?? 'global'}`,
          })

          return formatSearchSummary(formatted)
        }),
    },
    {
      name: 'health_check',
      description: 'Check the health and status of the Grok API connection.',
      parameters: HealthCheckSchema,
      execute: async (_args, context) =>
        executeTool(context, defaults, async (client) => {
          const result = await client.healthCheck()
          const formatted = ResponseFormatter.formatHealthCheckResponse(result)
          return formatHealthCheckSummary(formatted)
        }),
    },
  ]
}

async function executeTool(
  context: ToolContext,
  defaults: AppConfig,
  run: (client: GrokClient) => Promise<string>,
): Promise<string> {
  try {
    const requestConfig = resolveRequestConfig(context.extraArgs, defaults)
    const client = new GrokClient(requestConfig)
    return await run(client)
  } catch (error) {
    throw toToolUserError(error)
  }
}

function toToolUserError(error: unknown): UserError {
  if (error instanceof UserError) {
    return error
  }

  if (error instanceof InvalidQueryError) {
    return new UserError(error.message)
  }

  if (error instanceof AuthenticationError) {
    return new UserError(
      'xAI API authentication failed. Verify the hidden secret "xaiApiKey" for this MissionSquad server, or update XAI_API_KEY for local standalone use.'
    )
  }

  if (error instanceof RateLimitError) {
    return new UserError(
      `The xAI API rate limit was exceeded${error.retryAfter ? `; retry after ${error.retryAfter} seconds` : ''}.`
    )
  }

  if (error instanceof SearchError || error instanceof APIError) {
    return new UserError(error.message)
  }

  if (error instanceof Error) {
    return new UserError(error.message)
  }

  return new UserError(String(error))
}

function formatSearchSummary(
  formatted: ReturnType<typeof ResponseFormatter.formatSearchResponse>,
): string {
  // xAI returns a generated answer, not a structured list of posts. Never infer
  // empty search results from our optional heuristic extraction of that prose.
  const sources = formatted.citations
    .map((citation) => citation.url)
    .filter((url): url is string => typeof url === 'string' && !formatted.content.includes(url))

  return sources.length > 0
    ? `${formatted.content}\n\nSources:\n${sources.map((url) => `- ${url}`).join('\n')}`
    : formatted.content
}

function formatHealthCheckSummary(
  formatted: ReturnType<typeof ResponseFormatter.formatHealthCheckResponse>,
): string {
  let responseText = 'Grok MCP Server Health Check\n'
  responseText += `Status: ${formatted.status}\n`
  responseText += `Timestamp: ${formatted.timestamp}\n`

  const details = formatted.details
  if (typeof details.error === 'string') {
    responseText += `Error: ${details.error}\n`
  } else if (details.models && typeof details.models === 'object') {
    const modelData = (details.models as { data?: unknown }).data
    if (Array.isArray(modelData)) {
      responseText += `Available models: ${modelData.length}\n`
    }
  }

  return responseText.trimEnd()
}
