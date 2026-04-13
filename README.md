# MissionSquad Grok MCP Server

TypeScript MCP server for searching X.com with xAI Grok. This runtime is MissionSquad hidden-secret compatible and uses `@missionsquad/fastmcp`.

## Runtime Contract

- Public tool schemas do not expose authentication fields.
- MissionSquad injects the hidden `xaiApiKey` per tool call.
- The server reads hidden values from `context.extraArgs`.
- `XAI_API_KEY` remains available only as a local standalone fallback.

## Tools

- `search_posts`
- `search_users`
- `search_threads`
- `get_trends`
- `health_check`

## Resources

- `grok://config`
- `grok://health`

`grok://health` can only use the local env fallback. Per-call MissionSquad hidden secrets are not available to MCP resources, so use the `health_check` tool to validate the active request configuration.

## Local Development

```bash
npm install
npm run build
npm test
XAI_API_KEY=your-api-key npm start
```

## Claude Desktop Example

Use env fallback outside MissionSquad:

```json
{
  "mcpServers": {
    "grok": {
      "command": "npx",
      "args": ["-y", "@missionsquad/mcp-grok"],
      "env": {
        "XAI_API_KEY": "your-xai-api-key"
      }
    }
  }
}
```

## MissionSquad Registration

Recommended MissionSquad server registration:

```json
{
  "name": "mcp-grok",
  "transportType": "stdio",
  "command": "node",
  "args": ["/absolute/path/to/dist/server.js"],
  "secretNames": ["xaiApiKey"],
  "secretFields": [
    {
      "name": "xaiApiKey",
      "label": "xAI API key",
      "description": "xAI API key used to authenticate Grok API requests.",
      "required": true,
      "inputType": "password"
    }
  ],
  "enabled": true
}
```

## Package Scripts

- `npm run build`
- `npm test`
- `npm run dev`

## License

MIT. See [LICENSE](LICENSE).
