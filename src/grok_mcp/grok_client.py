"""
Grok API client for X.com search integration.

This module provides a robust HTTP client for interacting with xAI's Grok API,
including authentication, retry logic, rate limiting, and comprehensive error handling.
"""

import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional, Union

import httpx

from .config import GrokConfig
from .exceptions import (
    APIError,
    AuthenticationError,
    NetworkError,
    RateLimitError,
    ResponseParsingError,
    TimeoutError,
)

logger = logging.getLogger(__name__)


class GrokClient:
    """Async client for Grok API integration."""

    def __init__(self, config: Optional[GrokConfig] = None):
        """Initialize Grok client with configuration."""
        self.config = config or GrokConfig()
        self._client: Optional[httpx.AsyncClient] = None
        self._last_request_time = 0.0
        self._request_count = 0
        self._request_times: List[float] = []

    async def __aenter__(self):
        """Async context manager entry."""
        await self._ensure_client()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()

    async def _ensure_client(self) -> httpx.AsyncClient:
        """Ensure HTTP client is initialized."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.config.TIMEOUT_SECONDS),
                headers=self.config.get_headers(),
                limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            )
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    def _should_rate_limit(self) -> bool:
        """Check if we should rate limit requests."""
        now = time.time()

        # Clean up old request times (older than 1 minute)
        self._request_times = [
            t for t in self._request_times if now - t < 60
        ]

        # Check if we're hitting rate limits
        if len(self._request_times) >= self.config.MAX_REQUESTS_PER_MINUTE:
            return True

        # Check burst limit
        recent_requests = [
            t for t in self._request_times if now - t < 10
        ]
        if len(recent_requests) >= self.config.BURST_LIMIT:
            return True

        return False

    async def _wait_for_rate_limit(self):
        """Wait if we need to respect rate limits."""
        if self._should_rate_limit():
            # Calculate wait time
            oldest_request = min(self._request_times) if self._request_times else time.time()
            wait_time = 60 - (time.time() - oldest_request)
            if wait_time > 0:
                logger.info(f"Rate limiting: waiting {wait_time:.2f} seconds")
                await asyncio.sleep(wait_time)

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Make HTTP request with retry logic."""
        client = await self._ensure_client()
        url = f"{self.config.BASE_URL}/{endpoint.lstrip('/')}"

        await self._wait_for_rate_limit()
        self._request_times.append(time.time())

        last_exception = None
        for attempt in range(self.config.MAX_RETRIES + 1):
            try:
                if method.upper() == "GET":
                    response = await client.get(url, params=params)
                elif method.upper() == "POST":
                    response = await client.post(url, json=data, params=params)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")

                # Handle HTTP status codes
                if response.status_code == 401:
                    raise AuthenticationError("Invalid API key or authentication failed")
                elif response.status_code == 429:
                    retry_after = int(response.headers.get("retry-after", 60))
                    raise RateLimitError(
                        "API rate limit exceeded", retry_after=retry_after
                    )
                elif response.status_code >= 400:
                    error_msg = f"API request failed with status {response.status_code}"
                    try:
                        error_data = response.json()
                        if "error" in error_data:
                            err = error_data["error"]
                            # Handle both string and object error formats
                            error_msg = err if isinstance(err, str) else err.get("message", error_msg)
                    except (json.JSONDecodeError, KeyError):
                        pass
                    raise APIError(error_msg, status_code=response.status_code)

                # Parse response
                try:
                    return response.json()
                except json.JSONDecodeError as e:
                    raise ResponseParsingError(f"Failed to parse JSON response: {e}")

            except httpx.TimeoutException as e:
                last_exception = TimeoutError(f"Request timed out: {e}")
            except httpx.NetworkError as e:
                last_exception = NetworkError(f"Network error: {e}")
            except (RateLimitError, AuthenticationError, APIError):
                # Don't retry these errors
                raise
            except Exception as e:
                last_exception = APIError(f"Unexpected error: {e}")

            if attempt < self.config.MAX_RETRIES:
                wait_time = self.config.BACKOFF_FACTOR ** attempt
                logger.warning(
                    f"Request failed (attempt {attempt + 1}/{self.config.MAX_RETRIES + 1}), "
                    f"retrying in {wait_time:.2f} seconds: {last_exception}"
                )
                await asyncio.sleep(wait_time)

        # All retries exhausted
        raise last_exception

    async def search_posts(
        self,
        query: str,
        max_results: Optional[int] = None,
        handles: Optional[List[str]] = None,
        date_range: Optional[Dict[str, str]] = None,
        analysis_mode: str = "basic",
    ) -> Dict[str, Any]:
        """Search X.com posts using Grok's Live Search x_search tool."""
        max_results = max_results or self.config.DEFAULT_MAX_RESULTS

        # Build the x_search tool configuration
        x_search_tool: Dict[str, Any] = {"type": "x_search"}

        if handles:
            x_search_tool["allowed_x_handles"] = handles[:10]  # Max 10 handles

        if date_range:
            if "start" in date_range:
                x_search_tool["from_date"] = date_range["start"]
            if "end" in date_range:
                x_search_tool["to_date"] = date_range["end"]

        # Prepare the search payload for Grok's Live Search API
        prompt = f"Search X for posts about: {query}. Return up to {max_results} relevant results."
        if analysis_mode == "comprehensive":
            prompt += " Provide comprehensive analysis including sentiment, engagement patterns, and key themes."

        search_data = {
            "model": self.config.MODEL,
            "input": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            "tools": [x_search_tool],
        }

        return await self._make_request("POST", "/responses", data=search_data)

    async def search_users(
        self,
        query: str,
        max_results: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Search for X.com users using Grok's Live Search."""
        max_results = max_results or self.config.DEFAULT_MAX_RESULTS

        search_data = {
            "model": self.config.MODEL,
            "input": [
                {
                    "role": "user",
                    "content": f"Search X for users related to: {query}. Return up to {max_results} relevant user profiles with their handles, bios, and follower counts.",
                }
            ],
            "tools": [{"type": "x_search"}],
        }

        return await self._make_request("POST", "/responses", data=search_data)

    async def search_threads(
        self,
        query: str,
        max_results: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Search for X.com conversation threads using Grok's Live Search."""
        max_results = max_results or self.config.DEFAULT_MAX_RESULTS

        search_data = {
            "model": self.config.MODEL,
            "input": [
                {
                    "role": "user",
                    "content": f"Search X for conversation threads about: {query}. Return up to {max_results} complete conversation threads with context and replies.",
                }
            ],
            "tools": [{"type": "x_search"}],
        }

        return await self._make_request("POST", "/responses", data=search_data)

    async def get_trends(
        self,
        location: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get trending topics on X.com using Grok's Live Search."""
        location_text = f" in {location}" if location else ""

        search_data = {
            "model": self.config.MODEL,
            "input": [
                {
                    "role": "user",
                    "content": f"What are the current trending topics and hashtags on X{location_text}? Provide a comprehensive analysis of what people are talking about right now.",
                }
            ],
            "tools": [{"type": "x_search"}],
        }

        return await self._make_request("POST", "/responses", data=search_data)

    async def health_check(self) -> Dict[str, Any]:
        """Perform health check on the API."""
        try:
            response = await self._make_request("GET", "/models")
            return {"status": "healthy", "models": response}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}