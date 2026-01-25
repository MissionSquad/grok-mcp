"""
Entry point for running the Grok MCP Server as a module.

Usage:
    uv run python -m grok_mcp.server
    or
    uv run python -m grok_mcp
"""

from .server import run_server

if __name__ == "__main__":
    run_server()