"""
Configuration management for Grok X.com Search MCP Server.

Following the project's "Single Source of Truth" principle, all configuration
is defined directly in code rather than using environment variables.
"""

import os
from typing import Optional


class GrokConfig:
    """Configuration for Grok API integration."""

    # API Configuration
    API_KEY: str = os.getenv("XAI_API_KEY", "your-xai-api-key-here")
    BASE_URL: str = "https://api.x.ai/v1"
    MODEL: str = "grok-4-1-fast-reasoning"  # Grok 4.1 fast reasoning model

    # Request Configuration
    MAX_RETRIES: int = 3
    TIMEOUT_SECONDS: int = 60  # Live Search can take longer
    BACKOFF_FACTOR: float = 1.5  # Exponential backoff multiplier

    # Rate Limiting
    MAX_REQUESTS_PER_MINUTE: int = 60
    BURST_LIMIT: int = 10  # Maximum burst requests

    # Search Configuration
    DEFAULT_MAX_RESULTS: int = 20
    MAX_QUERY_LENGTH: int = 1000

    # Cache Configuration
    CACHE_TTL_SECONDS: int = 1800  # 30 minutes
    MAX_CACHE_SIZE: int = 1000  # Maximum cached responses

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    @classmethod
    def validate(cls) -> bool:
        """Validate configuration settings."""
        if not cls.API_KEY or cls.API_KEY == "your-xai-api-key-here":
            return False

        if cls.TIMEOUT_SECONDS <= 0:
            return False

        if cls.MAX_RETRIES < 0:
            return False

        return True

    @classmethod
    def get_headers(cls) -> dict[str, str]:
        """Get HTTP headers for API requests."""
        return {
            "Authorization": f"Bearer {cls.API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "grok-mcp/0.1.0",
        }


class SearchConfig:
    """Configuration for X.com search tools."""

    # Search Types
    SEARCH_POSTS = "posts"
    SEARCH_USERS = "users"
    SEARCH_THREADS = "threads"
    SEARCH_TRENDS = "trends"

    # Valid search types
    VALID_SEARCH_TYPES = {SEARCH_POSTS, SEARCH_USERS, SEARCH_THREADS, SEARCH_TRENDS}

    # Analysis Modes
    BASIC_ANALYSIS = "basic"
    COMPREHENSIVE_ANALYSIS = "comprehensive"

    VALID_ANALYSIS_MODES = {BASIC_ANALYSIS, COMPREHENSIVE_ANALYSIS}

    # Date Range Limits
    MAX_DAYS_BACK: int = 30  # Maximum days to search back

    @classmethod
    def validate_search_type(cls, search_type: str) -> bool:
        """Validate search type."""
        return search_type in cls.VALID_SEARCH_TYPES

    @classmethod
    def validate_analysis_mode(cls, mode: str) -> bool:
        """Validate analysis mode."""
        return mode in cls.VALID_ANALYSIS_MODES


# Global configuration instance
config = GrokConfig()
search_config = SearchConfig()