# Grok MCP Server

> Search X.com in real-time with xAI's Grok API - directly from Claude

[![PyPI version](https://img.shields.io/pypi/v/grok-mcp.svg)](https://pypi.org/project/grok-mcp/)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)

<!-- MCP Registry verification: mcp-name: io.github.guzus/grok-mcp -->

A [Model Context Protocol](https://modelcontextprotocol.io/) server that brings **real-time X/Twitter search** to Claude. Powered by xAI's Live Search API, it provides instant access to posts, users, threads, and trending topics.

## Why Grok MCP?

- **Real-time data** - Access live X.com content, not cached or outdated information
- **Native Claude integration** - Works seamlessly with Claude Desktop and Claude Code
- **Simple setup** - One command to install, one config to add
- **Open source** - MIT licensed, community-driven

## Quick Start

### 1. Get an xAI API Key

Get your API key from [console.x.ai](https://console.x.ai)

### 2. Install

```bash
uvx grok-mcp
```

### 3. Configure Claude

**For Claude Code** - Add to `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "grok": {
      "command": "uvx",
      "args": ["grok-mcp"],
      "env": {
        "XAI_API_KEY": "your-api-key"
      }
    }
  }
}
```

**For Claude Desktop** - Add to your config file:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "grok": {
      "command": "uvx",
      "args": ["grok-mcp"],
      "env": {
        "XAI_API_KEY": "your-api-key"
      }
    }
  }
}
```

### 4. Use It

Ask Claude things like:
- "Search X for posts about AI"
- "What's trending on X right now?"
- "Find tweets from @elonmusk about Tesla"

## Available Tools

| Tool | Description |
|------|-------------|
| `search_posts` | Search posts with filters (handles, date range, analysis mode) |
| `search_users` | Find user profiles |
| `search_threads` | Discover conversation threads |
| `get_trends` | Get trending topics by location |
| `health_check` | Verify API connection |

## Examples

### Search Posts
```
Search X for posts about "AI safety" from the last week
```

### Filter by User
```
Find recent posts from @anthropic about Claude
```

### Get Trends
```
What are the trending topics in tech right now?
```

## Development

```bash
# Clone
git clone https://github.com/guzus/grok-mcp.git
cd grok-mcp

# Install dependencies
uv sync --dev

# Run tests
uv run pytest

# Run locally
XAI_API_KEY=your-key uv run python -m grok_mcp
```

## Architecture

```
src/grok_mcp/
├── server.py           # MCP server implementation
├── grok_client.py      # xAI Live Search API client
├── search_tools.py     # Tool implementations
├── response_formatter.py
├── config.py
└── exceptions.py
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [PyPI Package](https://pypi.org/project/grok-mcp/)
- [xAI API Docs](https://docs.x.ai/)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

---

Built with [xAI Grok](https://x.ai/) and [Model Context Protocol](https://modelcontextprotocol.io/)
