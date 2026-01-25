"""
X.com search tools for Grok MCP Server.

This module implements the MCP tools for searching X.com content using Grok's API,
including posts, users, threads, and trending topics.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from .config import SearchConfig, GrokConfig
from .exceptions import InvalidQueryError, SearchError
from .grok_client import GrokClient
from .response_formatter import ResponseFormatter

logger = logging.getLogger(__name__)


class SearchPostsRequest(BaseModel):
    """Request model for searching X.com posts."""

    query: str = Field(..., description="Search query for X.com posts", max_length=1000)
    max_results: Optional[int] = Field(
        default=20, description="Maximum number of results to return", ge=1, le=100
    )
    handles: Optional[List[str]] = Field(
        default=None, description="Filter by specific user handles (without @)"
    )
    start_date: Optional[str] = Field(
        default=None, description="Start date for search (YYYY-MM-DD format)"
    )
    end_date: Optional[str] = Field(
        default=None, description="End date for search (YYYY-MM-DD format)"
    )
    analysis_mode: str = Field(
        default="basic",
        description="Analysis mode: 'basic' or 'comprehensive'",
    )

    @field_validator("query")
    @classmethod
    def validate_query(cls, v):
        if not v or not v.strip():
            raise InvalidQueryError("Query cannot be empty")
        return v.strip()

    @field_validator("analysis_mode")
    @classmethod
    def validate_analysis_mode(cls, v):
        if not SearchConfig.validate_analysis_mode(v):
            raise InvalidQueryError(
                f"Invalid analysis mode: {v}. Must be one of: {SearchConfig.VALID_ANALYSIS_MODES}"
            )
        return v

    @field_validator("handles")
    @classmethod
    def validate_handles(cls, v):
        if v:
            # Remove @ symbols if present
            cleaned_handles = [handle.lstrip("@") for handle in v]
            return cleaned_handles
        return v


class SearchUsersRequest(BaseModel):
    """Request model for searching X.com users."""

    query: str = Field(..., description="Search query for X.com users", max_length=1000)
    max_results: Optional[int] = Field(
        default=20, description="Maximum number of results to return", ge=1, le=50
    )

    @field_validator("query")
    @classmethod
    def validate_query(cls, v):
        if not v or not v.strip():
            raise InvalidQueryError("Query cannot be empty")
        return v.strip()


class SearchThreadsRequest(BaseModel):
    """Request model for searching X.com conversation threads."""

    query: str = Field(..., description="Search query for conversation threads", max_length=1000)
    max_results: Optional[int] = Field(
        default=10, description="Maximum number of threads to return", ge=1, le=20
    )

    @field_validator("query")
    @classmethod
    def validate_query(cls, v):
        if not v or not v.strip():
            raise InvalidQueryError("Query cannot be empty")
        return v.strip()


class GetTrendsRequest(BaseModel):
    """Request model for getting trending topics."""

    location: Optional[str] = Field(
        default=None, description="Location for trending topics (e.g., 'United States', 'Global')"
    )
    max_results: Optional[int] = Field(
        default=20, description="Maximum number of trends to return", ge=1, le=50
    )


class SearchTools:
    """Implementation of X.com search tools for MCP."""

    def __init__(self, config: Optional[GrokConfig] = None):
        """Initialize search tools with configuration."""
        self.config = config or GrokConfig()
        self.formatter = ResponseFormatter()

    async def search_posts(self, request: SearchPostsRequest) -> Dict[str, Any]:
        """Search X.com posts using Grok API."""
        try:
            logger.info(f"Searching posts for query: {request.query}")

            # Prepare date range if specified
            date_range = None
            if request.start_date or request.end_date:
                date_range = {
                    "start": request.start_date,
                    "end": request.end_date,
                }

            async with GrokClient(self.config) as client:
                raw_response = await client.search_posts(
                    query=request.query,
                    max_results=request.max_results,
                    handles=request.handles,
                    date_range=date_range,
                    analysis_mode=request.analysis_mode,
                )

            # Format the response
            formatted_response = self.formatter.format_search_response(
                raw_response=raw_response,
                search_type=SearchConfig.SEARCH_POSTS,
                query=request.query,
                analysis_mode=request.analysis_mode,
            )

            logger.info(f"Successfully searched posts, found data for query: {request.query}")
            return formatted_response

        except Exception as e:
            logger.error(f"Error searching posts: {e}")
            if isinstance(e, (InvalidQueryError, SearchError)):
                raise
            else:
                raise SearchError(f"Failed to search posts: {str(e)}", SearchConfig.SEARCH_POSTS)

    async def search_users(self, request: SearchUsersRequest) -> Dict[str, Any]:
        """Search X.com users using Grok API."""
        try:
            logger.info(f"Searching users for query: {request.query}")

            async with GrokClient(self.config) as client:
                raw_response = await client.search_users(
                    query=request.query,
                    max_results=request.max_results,
                )

            # Format the response
            formatted_response = self.formatter.format_search_response(
                raw_response=raw_response,
                search_type=SearchConfig.SEARCH_USERS,
                query=request.query,
            )

            logger.info(f"Successfully searched users for query: {request.query}")
            return formatted_response

        except Exception as e:
            logger.error(f"Error searching users: {e}")
            if isinstance(e, (InvalidQueryError, SearchError)):
                raise
            else:
                raise SearchError(f"Failed to search users: {str(e)}", SearchConfig.SEARCH_USERS)

    async def search_threads(self, request: SearchThreadsRequest) -> Dict[str, Any]:
        """Search X.com conversation threads using Grok API."""
        try:
            logger.info(f"Searching threads for query: {request.query}")

            async with GrokClient(self.config) as client:
                raw_response = await client.search_threads(
                    query=request.query,
                    max_results=request.max_results,
                )

            # Format the response
            formatted_response = self.formatter.format_search_response(
                raw_response=raw_response,
                search_type=SearchConfig.SEARCH_THREADS,
                query=request.query,
            )

            logger.info(f"Successfully searched threads for query: {request.query}")
            return formatted_response

        except Exception as e:
            logger.error(f"Error searching threads: {e}")
            if isinstance(e, (InvalidQueryError, SearchError)):
                raise
            else:
                raise SearchError(f"Failed to search threads: {str(e)}", SearchConfig.SEARCH_THREADS)

    async def get_trends(self, request: GetTrendsRequest) -> Dict[str, Any]:
        """Get trending topics on X.com using Grok API."""
        try:
            logger.info(f"Getting trends for location: {request.location or 'Global'}")

            async with GrokClient(self.config) as client:
                raw_response = await client.get_trends(location=request.location)

            # Format the response
            formatted_response = self.formatter.format_search_response(
                raw_response=raw_response,
                search_type=SearchConfig.SEARCH_TRENDS,
                query=f"trends_{request.location or 'global'}",
            )

            logger.info(f"Successfully retrieved trends for location: {request.location or 'Global'}")
            return formatted_response

        except Exception as e:
            logger.error(f"Error getting trends: {e}")
            if isinstance(e, SearchError):
                raise
            else:
                raise SearchError(f"Failed to get trends: {str(e)}", SearchConfig.SEARCH_TRENDS)

    async def health_check(self) -> Dict[str, Any]:
        """Perform health check on the Grok API connection."""
        try:
            logger.info("Performing health check")

            async with GrokClient(self.config) as client:
                health_data = await client.health_check()

            formatted_response = self.formatter.format_health_check_response(health_data)

            logger.info(f"Health check completed with status: {health_data.get('status', 'unknown')}")
            return formatted_response

        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return self.formatter.format_health_check_response({
                "status": "unhealthy",
                "error": str(e),
            })


# Tool function wrappers for MCP registration
async def mcp_search_posts(query: str, max_results: int = 20, handles: Optional[List[str]] = None,
                          start_date: Optional[str] = None, end_date: Optional[str] = None,
                          analysis_mode: str = "basic") -> str:
    """MCP tool for searching X.com posts."""
    try:
        request = SearchPostsRequest(
            query=query,
            max_results=max_results,
            handles=handles,
            start_date=start_date,
            end_date=end_date,
            analysis_mode=analysis_mode,
        )

        tools = SearchTools()
        result = await tools.search_posts(request)

        # Return formatted string for MCP
        if "error" in result:
            return f"Error searching posts: {result['error']['message']}"

        posts = result.get("posts", [])
        if not posts:
            return f"No posts found for query: {query}"

        response_text = f"Found {len(posts)} posts for query: {query}\n\n"
        for i, post in enumerate(posts[:5], 1):  # Limit to first 5 for readability
            response_text += f"{i}. {post.get('content', 'No content')}\n"
            if 'author' in post:
                response_text += f"   Author: {post['author']}\n"
            if 'engagement' in post:
                response_text += f"   {post['engagement']}\n"
            response_text += "\n"

        return response_text

    except Exception as e:
        return f"Error searching posts: {str(e)}"


async def mcp_search_users(query: str, max_results: int = 20) -> str:
    """MCP tool for searching X.com users."""
    try:
        request = SearchUsersRequest(query=query, max_results=max_results)
        tools = SearchTools()
        result = await tools.search_users(request)

        if "error" in result:
            return f"Error searching users: {result['error']['message']}"

        users = result.get("users", [])
        if not users:
            return f"No users found for query: {query}"

        response_text = f"Found {len(users)} users for query: {query}\n\n"
        for i, user in enumerate(users[:10], 1):
            response_text += f"{i}. @{user.get('username', 'Unknown')}\n"
            if 'profile_url' in user:
                response_text += f"   Profile: {user['profile_url']}\n"
            response_text += "\n"

        return response_text

    except Exception as e:
        return f"Error searching users: {str(e)}"


async def mcp_search_threads(query: str, max_results: int = 10) -> str:
    """MCP tool for searching X.com conversation threads."""
    try:
        request = SearchThreadsRequest(query=query, max_results=max_results)
        tools = SearchTools()
        result = await tools.search_threads(request)

        if "error" in result:
            return f"Error searching threads: {result['error']['message']}"

        threads = result.get("threads", [])
        if not threads:
            return f"No conversation threads found for query: {query}"

        response_text = f"Found {len(threads)} conversation threads for query: {query}\n\n"
        for i, thread in enumerate(threads, 1):
            response_text += f"{i}. {thread.get('type', 'Thread')}\n"
            response_text += f"   {thread.get('summary', 'No summary available')}\n"
            if 'participant_count' in thread:
                response_text += f"   Participants: {thread['participant_count']}\n"
            response_text += "\n"

        return response_text

    except Exception as e:
        return f"Error searching threads: {str(e)}"


async def mcp_get_trends(location: Optional[str] = None, max_results: int = 20) -> str:
    """MCP tool for getting trending topics on X.com."""
    try:
        request = GetTrendsRequest(location=location, max_results=max_results)
        tools = SearchTools()
        result = await tools.get_trends(request)

        if "error" in result:
            return f"Error getting trends: {result['error']['message']}"

        trends = result.get("trends", [])
        if not trends:
            return f"No trending topics found for location: {location or 'Global'}"

        location_text = f" for {location}" if location else " (Global)"
        response_text = f"Trending topics{location_text}:\n\n"

        for i, trend in enumerate(trends[:15], 1):
            response_text += f"{i}. {trend.get('topic', 'Unknown trend')}"
            if trend.get('category') == 'hashtag':
                response_text += f" (#{trend.get('hashtag', '').lstrip('#')})"
            response_text += "\n"
            if 'description' in trend:
                response_text += f"   {trend['description']}\n"
            response_text += "\n"

        return response_text

    except Exception as e:
        return f"Error getting trends: {str(e)}"


async def mcp_health_check() -> str:
    """MCP tool for checking API health."""
    try:
        tools = SearchTools()
        result = await tools.health_check()

        status = result.get("status", "unknown")
        timestamp = result.get("timestamp", "unknown")

        response_text = f"Grok MCP Server Health Check\n"
        response_text += f"Status: {status}\n"
        response_text += f"Timestamp: {timestamp}\n"

        if "details" in result:
            details = result["details"]
            if "error" in details:
                response_text += f"Error: {details['error']}\n"
            elif "models" in details:
                response_text += f"Available models: {len(details.get('models', {}).get('data', []))}\n"

        return response_text

    except Exception as e:
        return f"Health check failed: {str(e)}"