"""
Grok X.com Search MCP Server.

A Model Context Protocol (MCP) server for searching X.com content using xAI's Grok API.
Provides tools for searching posts, users, conversation threads, and trending topics.
"""

from .server import run_server
from .config import GrokConfig, SearchConfig
from .search_tools import SearchTools

__version__ = "0.2.1"
__author__ = "Claude Code"
__description__ = "MCP server for Grok X.com search integration using xAI API"

__all__ = [
    "run_server",
    "GrokConfig",
    "SearchConfig",
    "SearchTools",
]