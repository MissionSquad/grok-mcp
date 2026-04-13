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

          return formatPostsSummary(formatted, args.query)
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

          return formatUsersSummary(formatted, args.query)
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

          return formatThreadsSummary(formatted, args.query)
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

          return formatTrendsSummary(formatted, args.location)
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

function formatPostsSummary(
  formatted: ReturnType<typeof ResponseFormatter.formatSearchResponse>,
  query: string,
): string {
  const posts = formatted.posts ?? []

  if (posts.length === 0) {
    return `No posts found for query: ${query}`
  }

  let responseText = `Found ${posts.length} posts for query: ${query}\n\n`
  for (const [index, post] of posts.slice(0, 5).entries()) {
    responseText += `${index + 1}. ${String(post.content ?? 'No content')}\n`
    if (typeof post.author === 'string') {
      responseText += `   Author: ${post.author}\n`
    }
    if (typeof post.engagement === 'string') {
      responseText += `   ${post.engagement}\n`
    }
    responseText += '\n'
  }

  return responseText.trimEnd()
}

function formatUsersSummary(
  formatted: ReturnType<typeof ResponseFormatter.formatSearchResponse>,
  query: string,
): string {
  const users = formatted.users ?? []

  if (users.length === 0) {
    return `No users found for query: ${query}`
  }

  let responseText = `Found ${users.length} users for query: ${query}\n\n`
  for (const [index, user] of users.slice(0, 10).entries()) {
    responseText += `${index + 1}. @${String(user.username ?? 'Unknown')}\n`
    if (typeof user.profile_url === 'string') {
      responseText += `   Profile: ${user.profile_url}\n`
    }
    responseText += '\n'
  }

  return responseText.trimEnd()
}

function formatThreadsSummary(
  formatted: ReturnType<typeof ResponseFormatter.formatSearchResponse>,
  query: string,
): string {
  const threads = formatted.threads ?? []

  if (threads.length === 0) {
    return `No conversation threads found for query: ${query}`
  }

  let responseText = `Found ${threads.length} conversation threads for query: ${query}\n\n`
  for (const [index, thread] of threads.entries()) {
    responseText += `${index + 1}. ${String(thread.type ?? 'Thread')}\n`
    responseText += `   ${String(thread.summary ?? 'No summary available')}\n`
    if (typeof thread.participant_count === 'number') {
      responseText += `   Participants: ${thread.participant_count}\n`
    }
    responseText += '\n'
  }

  return responseText.trimEnd()
}

function formatTrendsSummary(
  formatted: ReturnType<typeof ResponseFormatter.formatSearchResponse>,
  location: string | undefined,
): string {
  const trends = formatted.trends ?? []
  const locationText = location ? ` for ${location}` : ' (Global)'

  if (trends.length === 0) {
    return `No trending topics found for location: ${location ?? 'Global'}`
  }

  let responseText = `Trending topics${locationText}:\n\n`
  for (const [index, trend] of trends.slice(0, 15).entries()) {
    responseText += `${index + 1}. ${String(trend.topic ?? 'Unknown trend')}`
    if (trend.category === 'hashtag' && typeof trend.hashtag === 'string') {
      responseText += ` (${trend.hashtag})`
    }
    responseText += '\n'
    if (typeof trend.description === 'string') {
      responseText += `   ${trend.description}\n`
    }
    responseText += '\n'
  }

  return responseText.trimEnd()
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
