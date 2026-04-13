import type { Resource } from '@missionsquad/fastmcp'
import { appConfig, resolveRequestConfig, type AppConfig } from './config.js'
import { GrokClient } from './grok-client.js'

export function createResources(defaults: AppConfig = appConfig): Resource[] {
  return [
    {
      uri: 'grok://config',
      name: 'Server Configuration',
      description: 'Current Grok MCP runtime configuration metadata.',
      mimeType: 'application/json',
      load: async () => ({
        text: JSON.stringify(
          {
            server_name: 'grok-search-mcp',
            version: '0.3.0',
            model: defaults.defaultModel,
            base_url: defaults.defaultBaseUrl,
            max_retries: defaults.maxRetries,
            timeout_ms: defaults.timeoutMs,
            env_fallback_api_key_configured: Boolean(defaults.defaultApiKey),
            hidden_secret_note:
              'Per-call hidden secrets are not exposed through MCP resources. Use the health_check tool to validate the active request configuration.',
          },
          null,
          2,
        ),
      }),
    },
    {
      uri: 'grok://health',
      name: 'Health Status',
      description: 'Health status for the Grok MCP runtime.',
      mimeType: 'application/json',
      load: async () => ({
        text: JSON.stringify(await loadHealthResource(defaults), null, 2),
      }),
    },
  ]
}

async function loadHealthResource(defaults: AppConfig): Promise<Record<string, unknown>> {
  if (!defaults.defaultApiKey) {
    return {
      status: 'unconfigured',
      message:
        'Resources do not receive per-call hidden secrets. Configure XAI_API_KEY for local fallback health checks, or use the health_check tool to validate MissionSquad hidden-secret execution.',
    }
  }

  const config = resolveRequestConfig(undefined, defaults)
  const client = new GrokClient(config)
  return client.healthCheck()
}
