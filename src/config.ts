import { UserError } from '@missionsquad/fastmcp'
import dotenv from 'dotenv'

dotenv.config()

const DEFAULT_BASE_URL = 'https://api.x.ai/v1'
const DEFAULT_MODEL = 'grok-4-1-fast-reasoning'
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_BACKOFF_FACTOR = 1.5
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 60
const DEFAULT_BURST_LIMIT = 10
const DEFAULT_MAX_RESULTS = 20
const USER_AGENT = 'grok-mcp/0.3.0'

export interface AppConfig {
  defaultApiKey?: string
  defaultBaseUrl: string
  defaultModel: string
  maxRetries: number
  timeoutMs: number
  backoffFactor: number
  maxRequestsPerMinute: number
  burstLimit: number
  defaultMaxResults: number
  userAgent: string
}

export interface ResolvedRequestConfig {
  apiKey: string
  baseUrl: string
  model: string
  maxRetries: number
  timeoutMs: number
  backoffFactor: number
  maxRequestsPerMinute: number
  burstLimit: number
  defaultMaxResults: number
  userAgent: string
}

function readOptionalEnvString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function readHiddenString(
  extraArgs: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = extraArgs?.[key]

  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new UserError(`Hidden argument "${key}" must be a string when provided.`)
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new UserError(`Hidden argument "${key}" must be a non-empty string when provided.`)
  }

  return trimmed
}

export function createAppConfigFromEnv(source: NodeJS.ProcessEnv): AppConfig {
  return {
    defaultApiKey: readOptionalEnvString(source.XAI_API_KEY),
    defaultBaseUrl: DEFAULT_BASE_URL,
    defaultModel: DEFAULT_MODEL,
    maxRetries: DEFAULT_MAX_RETRIES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    backoffFactor: DEFAULT_BACKOFF_FACTOR,
    maxRequestsPerMinute: DEFAULT_MAX_REQUESTS_PER_MINUTE,
    burstLimit: DEFAULT_BURST_LIMIT,
    defaultMaxResults: DEFAULT_MAX_RESULTS,
    userAgent: USER_AGENT,
  }
}

export const appConfig: AppConfig = createAppConfigFromEnv(process.env)

export function resolveRequestConfig(
  extraArgs: Record<string, unknown> | undefined,
  defaults: AppConfig = appConfig,
): ResolvedRequestConfig {
  const apiKey = readHiddenString(extraArgs, 'xaiApiKey') ?? defaults.defaultApiKey

  if (!apiKey) {
    throw new UserError(
      'xAI API credentials are required. Configure the hidden secret "xaiApiKey" for this MissionSquad server, ' +
        'or set XAI_API_KEY for local standalone use.'
    )
  }

  return {
    apiKey,
    baseUrl: defaults.defaultBaseUrl,
    model: defaults.defaultModel,
    maxRetries: defaults.maxRetries,
    timeoutMs: defaults.timeoutMs,
    backoffFactor: defaults.backoffFactor,
    maxRequestsPerMinute: defaults.maxRequestsPerMinute,
    burstLimit: defaults.burstLimit,
    defaultMaxResults: defaults.defaultMaxResults,
    userAgent: defaults.userAgent,
  }
}
