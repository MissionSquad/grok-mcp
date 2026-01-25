"""
Grok X.com Search MCP Server.

This module implements the main MCP server for X.com search integration using Grok API.
It provides tools for searching posts, users, conversation threads, and trending topics.
"""

import asyncio
import logging
import sys
from typing import Any, Dict, List, Optional

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    Resource,
    Tool,
    TextContent,
    ImageContent,
    EmbeddedResource,
)

from .config import GrokConfig, SearchConfig
from .exceptions import ConfigurationError
from .search_tools import (
    mcp_search_posts,
    mcp_search_users,
    mcp_search_threads,
    mcp_get_trends,
    mcp_health_check,
)

# Configure logging - minimal output for clean UX
logging.basicConfig(
    level=logging.WARNING,
    format="%(message)s",
    handlers=[logging.StreamHandler(sys.stderr)]
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Initialize server
server = Server("grok-search-mcp")


@server.list_tools()
async def handle_list_tools() -> List[Tool]:
    """List all available tools for X.com search."""
    logger.info("Listing available tools")

    return [
        Tool(
            name="search_posts",
            description="Search X.com posts with advanced filtering and analysis options",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query for X.com posts",
                        "maxLength": 1000,
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results to return (1-100)",
                        "minimum": 1,
                        "maximum": 100,
                        "default": 20,
                    },
                    "handles": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Filter by specific user handles (without @)",
                        "default": None,
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Start date for search (YYYY-MM-DD format)",
                        "default": None,
                    },
                    "end_date": {
                        "type": "string",
                        "description": "End date for search (YYYY-MM-DD format)",
                        "default": None,
                    },
                    "analysis_mode": {
                        "type": "string",
                        "enum": ["basic", "comprehensive"],
                        "description": "Analysis depth: basic for quick results, comprehensive for detailed analysis",
                        "default": "basic",
                    },
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="search_users",
            description="Search for X.com users and profiles",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query for X.com users",
                        "maxLength": 1000,
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results to return (1-50)",
                        "minimum": 1,
                        "maximum": 50,
                        "default": 20,
                    },
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="search_threads",
            description="Search X.com conversation threads and replies",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query for conversation threads",
                        "maxLength": 1000,
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of threads to return (1-20)",
                        "minimum": 1,
                        "maximum": 20,
                        "default": 10,
                    },
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="get_trends",
            description="Get trending topics and hashtags on X.com",
            inputSchema={
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "Location for trending topics (e.g., 'United States', 'Global')",
                        "default": None,
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of trends to return (1-50)",
                        "minimum": 1,
                        "maximum": 50,
                        "default": 20,
                    },
                },
                "required": [],
            },
        ),
        Tool(
            name="health_check",
            description="Check the health and status of the Grok API connection",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": [],
            },
        ),
    ]


@server.call_tool()
async def handle_call_tool(name: str, arguments: Dict[str, Any]) -> List[TextContent]:
    """Handle tool calls for X.com search operations."""
    logger.info(f"Calling tool: {name} with arguments: {arguments}")

    try:
        if name == "search_posts":
            result = await mcp_search_posts(
                query=arguments["query"],
                max_results=arguments.get("max_results", 20),
                handles=arguments.get("handles"),
                start_date=arguments.get("start_date"),
                end_date=arguments.get("end_date"),
                analysis_mode=arguments.get("analysis_mode", "basic"),
            )
        elif name == "search_users":
            result = await mcp_search_users(
                query=arguments["query"],
                max_results=arguments.get("max_results", 20),
            )
        elif name == "search_threads":
            result = await mcp_search_threads(
                query=arguments["query"],
                max_results=arguments.get("max_results", 10),
            )
        elif name == "get_trends":
            result = await mcp_get_trends(
                location=arguments.get("location"),
                max_results=arguments.get("max_results", 20),
            )
        elif name == "health_check":
            result = await mcp_health_check()
        else:
            raise ValueError(f"Unknown tool: {name}")

        return [TextContent(type="text", text=result)]

    except Exception as e:
        logger.error(f"Error executing tool {name}: {e}")
        error_message = f"Error executing {name}: {str(e)}"
        return [TextContent(type="text", text=error_message)]


@server.list_resources()
async def handle_list_resources() -> List[Resource]:
    """List available resources."""
    logger.info("Listing available resources")

    return [
        Resource(
            uri="grok://config",
            name="Server Configuration",
            description="Current server configuration and status",
            mimeType="application/json",
        ),
        Resource(
            uri="grok://health",
            name="Health Status",
            description="Current health status of the Grok API connection",
            mimeType="application/json",
        ),
    ]


@server.read_resource()
async def handle_read_resource(uri: str) -> str:
    """Handle resource read requests."""
    logger.info(f"Reading resource: {uri}")

    if uri == "grok://config":
        config_info = {
            "server_name": "grok-search-mcp",
            "version": "0.1.0",
            "model": GrokConfig.MODEL,
            "base_url": GrokConfig.BASE_URL,
            "max_retries": GrokConfig.MAX_RETRIES,
            "timeout_seconds": GrokConfig.TIMEOUT_SECONDS,
            "api_key_configured": bool(GrokConfig.API_KEY and GrokConfig.API_KEY != "your-xai-api-key-here"),
        }
        import json
        return json.dumps(config_info, indent=2)

    elif uri == "grok://health":
        try:
            health_result = await mcp_health_check()
            return health_result
        except Exception as e:
            error_info = {
                "status": "error",
                "message": str(e),
                "timestamp": str(asyncio.get_event_loop().time()),
            }
            import json
            return json.dumps(error_info, indent=2)

    else:
        raise ValueError(f"Unknown resource: {uri}")


def _print_banner():
    """Print startup banner."""
    print("Grok MCP Server v0.2.1", file=sys.stderr)
    print("Real-time X.com search powered by xAI", file=sys.stderr)


def _print_error(message: str):
    """Print error message."""
    print(f"\n[Error] {message}", file=sys.stderr)


async def main():
    """Main server entry point."""
    _print_banner()

    # Validate configuration
    if not GrokConfig.validate():
        _print_error("XAI_API_KEY not configured")
        print("\nTo use this MCP server, set your xAI API key:", file=sys.stderr)
        print("  1. Get a key from https://console.x.ai", file=sys.stderr)
        print("  2. Add to your MCP config:", file=sys.stderr)
        print('     "env": { "XAI_API_KEY": "your-key" }', file=sys.stderr)
        print("\nDocs: https://github.com/guzus/grok-mcp", file=sys.stderr)
        raise ConfigurationError("XAI_API_KEY not configured")

    print(f"Model: {GrokConfig.MODEL}", file=sys.stderr)
    print("Ready.", file=sys.stderr)

    # Run the server
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options()
        )


def run_server():
    """Run the MCP server."""
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutdown.", file=sys.stderr)
    except ConfigurationError:
        sys.exit(1)
    except Exception as e:
        _print_error(str(e))
        sys.exit(1)


if __name__ == "__main__":
    run_server()