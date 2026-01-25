"""
Tests for Grok API client.
"""

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, patch
from pathlib import Path

import httpx

from src.grok_mcp.grok_client import GrokClient
from src.grok_mcp.config import GrokConfig
from src.grok_mcp.exceptions import (
    AuthenticationError,
    RateLimitError,
    APIError,
    TimeoutError,
    NetworkError,
)


@pytest.fixture
def mock_responses():
    """Load mock API responses from fixtures."""
    fixtures_path = Path(__file__).parent / "fixtures" / "mock_responses.json"
    with open(fixtures_path) as f:
        return json.load(f)


@pytest.fixture
def grok_config():
    """Test configuration."""
    config = GrokConfig()
    config.API_KEY = "test-api-key"
    config.TIMEOUT_SECONDS = 5
    config.MAX_RETRIES = 2
    return config


@pytest.mark.asyncio
class TestGrokClient:
    """Test cases for GrokClient."""

    async def test_init(self, grok_config):
        """Test client initialization."""
        client = GrokClient(grok_config)
        assert client.config == grok_config
        assert client._client is None

    async def test_context_manager(self, grok_config):
        """Test client as context manager."""
        async with GrokClient(grok_config) as client:
            assert client._client is not None
            assert not client._client.is_closed

    @patch('httpx.AsyncClient.post')
    async def test_search_posts_success(self, mock_post, grok_config, mock_responses):
        """Test successful post search."""
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = mock_responses["search_posts_success"]

        async with GrokClient(grok_config) as client:
            result = await client.search_posts("AI technology", max_results=10)

        assert result["id"] == "chatcmpl-test-123"
        assert result["model"] == "grok-beta"
        assert len(result["choices"]) == 1
        mock_post.assert_called_once()

    @patch('httpx.AsyncClient.post')
    async def test_search_users_success(self, mock_post, grok_config, mock_responses):
        """Test successful user search."""
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = mock_responses["search_users_success"]

        async with GrokClient(grok_config) as client:
            result = await client.search_users("AI researchers")

        assert result["id"] == "chatcmpl-test-456"
        assert "ai_researcher" in result["choices"][0]["message"]["content"]
        mock_post.assert_called_once()

    @patch('httpx.AsyncClient.post')
    async def test_search_threads_success(self, mock_post, grok_config, mock_responses):
        """Test successful thread search."""
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = mock_responses["search_threads_success"]

        async with GrokClient(grok_config) as client:
            result = await client.search_threads("AI ethics")

        assert result["id"] == "chatcmpl-test-789"
        assert "conversation_thread" in result["choices"][0]["message"]["content"]
        mock_post.assert_called_once()

    @patch('httpx.AsyncClient.post')
    async def test_get_trends_success(self, mock_post, grok_config, mock_responses):
        """Test successful trends retrieval."""
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = mock_responses["get_trends_success"]

        async with GrokClient(grok_config) as client:
            result = await client.get_trends()

        assert result["id"] == "chatcmpl-test-101"
        assert "#TechNews" in result["choices"][0]["message"]["content"]
        mock_post.assert_called_once()

    @patch('httpx.AsyncClient.get')
    async def test_health_check_success(self, mock_get, grok_config, mock_responses):
        """Test successful health check."""
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = mock_responses["health_check_success"]

        async with GrokClient(grok_config) as client:
            result = await client.health_check()

        assert result["status"] == "healthy"
        assert "models" in result
        mock_get.assert_called_once()

    @patch('httpx.AsyncClient.post')
    async def test_authentication_error(self, mock_post, grok_config, mock_responses):
        """Test authentication error handling."""
        mock_post.return_value.status_code = 401
        mock_post.return_value.json.return_value = mock_responses["api_error_401"]

        async with GrokClient(grok_config) as client:
            with pytest.raises(AuthenticationError):
                await client.search_posts("test query")

    @patch('httpx.AsyncClient.post')
    async def test_rate_limit_error(self, mock_post, grok_config, mock_responses):
        """Test rate limit error handling."""
        mock_post.return_value.status_code = 429
        mock_post.return_value.headers = {"retry-after": "60"}
        mock_post.return_value.json.return_value = mock_responses["api_error_429"]

        async with GrokClient(grok_config) as client:
            with pytest.raises(RateLimitError) as exc_info:
                await client.search_posts("test query")

            assert exc_info.value.retry_after == 60

    @patch('httpx.AsyncClient.post')
    async def test_api_error(self, mock_post, grok_config, mock_responses):
        """Test general API error handling."""
        mock_post.return_value.status_code = 500
        mock_post.return_value.json.return_value = mock_responses["api_error_500"]

        async with GrokClient(grok_config) as client:
            with pytest.raises(APIError) as exc_info:
                await client.search_posts("test query")

            assert exc_info.value.status_code == 500

    @patch('httpx.AsyncClient.post')
    async def test_timeout_error(self, mock_post, grok_config):
        """Test timeout error handling."""
        mock_post.side_effect = httpx.TimeoutException("Request timed out")

        async with GrokClient(grok_config) as client:
            with pytest.raises(TimeoutError):
                await client.search_posts("test query")

    @patch('httpx.AsyncClient.post')
    async def test_network_error(self, mock_post, grok_config):
        """Test network error handling."""
        mock_post.side_effect = httpx.NetworkError("Network connection failed")

        async with GrokClient(grok_config) as client:
            with pytest.raises(NetworkError):
                await client.search_posts("test query")

    @patch('httpx.AsyncClient.post')
    async def test_retry_logic(self, mock_post, grok_config):
        """Test retry logic with temporary failures."""
        # First two calls fail, third succeeds
        mock_post.side_effect = [
            httpx.TimeoutException("Timeout 1"),
            httpx.TimeoutException("Timeout 2"),
            AsyncMock(status_code=200, json=AsyncMock(return_value={"test": "response"}))
        ]

        async with GrokClient(grok_config) as client:
            # Mock the sleep to speed up test
            with patch('asyncio.sleep'):
                result = await client.search_posts("test query")

        assert result["test"] == "response"
        assert mock_post.call_count == 3

    async def test_rate_limiting_logic(self, grok_config):
        """Test rate limiting logic."""
        client = GrokClient(grok_config)

        # Should not rate limit initially
        assert not client._should_rate_limit()

        # Add requests to simulate rate limiting
        import time
        now = time.time()
        client._request_times = [now - i for i in range(60)]  # 60 requests in last minute

        # Should now rate limit
        assert client._should_rate_limit()

    async def test_close_client(self, grok_config):
        """Test client cleanup."""
        client = GrokClient(grok_config)
        await client._ensure_client()

        assert client._client is not None

        await client.close()

        # Client should be closed or None after cleanup
        assert client._client is None or client._client.is_closed