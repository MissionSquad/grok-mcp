"""
Tests for search tools.
"""

import json
import pytest
from unittest.mock import AsyncMock, patch
from pathlib import Path

from src.grok_mcp.search_tools import (
    SearchTools,
    SearchPostsRequest,
    SearchUsersRequest,
    SearchThreadsRequest,
    GetTrendsRequest,
    mcp_search_posts,
    mcp_search_users,
    mcp_search_threads,
    mcp_get_trends,
    mcp_health_check,
)
from src.grok_mcp.config import GrokConfig
from src.grok_mcp.exceptions import InvalidQueryError, SearchError


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
    return config


class TestRequestModels:
    """Test request model validation."""

    def test_search_posts_request_valid(self):
        """Test valid search posts request."""
        request = SearchPostsRequest(
            query="AI technology",
            max_results=10,
            handles=["@user1", "user2"],  # Should clean @ symbols
            analysis_mode="basic"
        )

        assert request.query == "AI technology"
        assert request.max_results == 10
        assert request.handles == ["user1", "user2"]  # @ symbols removed
        assert request.analysis_mode == "basic"

    def test_search_posts_request_invalid_query(self):
        """Test invalid query validation."""
        with pytest.raises(InvalidQueryError):
            SearchPostsRequest(query="")

        with pytest.raises(InvalidQueryError):
            SearchPostsRequest(query="   ")

    def test_search_posts_request_invalid_analysis_mode(self):
        """Test invalid analysis mode validation."""
        with pytest.raises(InvalidQueryError):
            SearchPostsRequest(query="test", analysis_mode="invalid")

    def test_search_users_request_valid(self):
        """Test valid search users request."""
        request = SearchUsersRequest(query="AI researchers", max_results=15)

        assert request.query == "AI researchers"
        assert request.max_results == 15

    def test_search_threads_request_valid(self):
        """Test valid search threads request."""
        request = SearchThreadsRequest(query="AI ethics discussion", max_results=5)

        assert request.query == "AI ethics discussion"
        assert request.max_results == 5

    def test_get_trends_request_valid(self):
        """Test valid get trends request."""
        request = GetTrendsRequest(location="United States", max_results=25)

        assert request.location == "United States"
        assert request.max_results == 25


@pytest.mark.asyncio
class TestSearchTools:
    """Test cases for SearchTools."""

    @patch('src.grok_mcp.search_tools.GrokClient')
    async def test_search_posts_success(self, mock_client_class, grok_config, mock_responses):
        """Test successful post search."""
        mock_client = AsyncMock()
        mock_client.search_posts.return_value = mock_responses["search_posts_success"]
        mock_client_class.return_value.__aenter__.return_value = mock_client

        tools = SearchTools(grok_config)
        request = SearchPostsRequest(query="AI technology", max_results=10)

        result = await tools.search_posts(request)

        assert result["query"] == "AI technology"
        assert result["search_type"] == "posts"
        assert "content" in result
        assert "posts" in result

        mock_client.search_posts.assert_called_once_with(
            query="AI technology",
            max_results=10,
            handles=None,
            date_range=None,
            analysis_mode="basic",
        )

    @patch('src.grok_mcp.search_tools.GrokClient')
    async def test_search_users_success(self, mock_client_class, grok_config, mock_responses):
        """Test successful user search."""
        mock_client = AsyncMock()
        mock_client.search_users.return_value = mock_responses["search_users_success"]
        mock_client_class.return_value.__aenter__.return_value = mock_client

        tools = SearchTools(grok_config)
        request = SearchUsersRequest(query="AI researchers")

        result = await tools.search_users(request)

        assert result["query"] == "AI researchers"
        assert result["search_type"] == "users"
        assert "users" in result

        mock_client.search_users.assert_called_once_with(
            query="AI researchers",
            max_results=20,
        )

    @patch('src.grok_mcp.search_tools.GrokClient')
    async def test_search_threads_success(self, mock_client_class, grok_config, mock_responses):
        """Test successful thread search."""
        mock_client = AsyncMock()
        mock_client.search_threads.return_value = mock_responses["search_threads_success"]
        mock_client_class.return_value.__aenter__.return_value = mock_client

        tools = SearchTools(grok_config)
        request = SearchThreadsRequest(query="AI ethics")

        result = await tools.search_threads(request)

        assert result["query"] == "AI ethics"
        assert result["search_type"] == "threads"
        assert "threads" in result

        mock_client.search_threads.assert_called_once_with(
            query="AI ethics",
            max_results=10,
        )

    @patch('src.grok_mcp.search_tools.GrokClient')
    async def test_get_trends_success(self, mock_client_class, grok_config, mock_responses):
        """Test successful trends retrieval."""
        mock_client = AsyncMock()
        mock_client.get_trends.return_value = mock_responses["get_trends_success"]
        mock_client_class.return_value.__aenter__.return_value = mock_client

        tools = SearchTools(grok_config)
        request = GetTrendsRequest(location="United States")

        result = await tools.get_trends(request)

        assert "trends_United States" in result["query"]
        assert result["search_type"] == "trends"
        assert "trends" in result

        mock_client.get_trends.assert_called_once_with(location="United States")

    @patch('src.grok_mcp.search_tools.GrokClient')
    async def test_health_check_success(self, mock_client_class, grok_config, mock_responses):
        """Test successful health check."""
        mock_client = AsyncMock()
        mock_client.health_check.return_value = {"status": "healthy", "models": mock_responses["health_check_success"]}
        mock_client_class.return_value.__aenter__.return_value = mock_client

        tools = SearchTools(grok_config)

        result = await tools.health_check()

        assert result["service"] == "grok-mcp-server"
        assert result["status"] == "healthy"
        assert "details" in result

        mock_client.health_check.assert_called_once()

    @patch('src.grok_mcp.search_tools.GrokClient')
    async def test_search_error_handling(self, mock_client_class, grok_config):
        """Test error handling in search operations."""
        mock_client = AsyncMock()
        mock_client.search_posts.side_effect = Exception("API connection failed")
        mock_client_class.return_value.__aenter__.return_value = mock_client

        tools = SearchTools(grok_config)
        request = SearchPostsRequest(query="test")

        with pytest.raises(SearchError) as exc_info:
            await tools.search_posts(request)

        assert "Failed to search posts" in str(exc_info.value)
        assert exc_info.value.search_type == "posts"

    @patch('src.grok_mcp.search_tools.GrokClient')
    async def test_health_check_error_handling(self, mock_client_class, grok_config):
        """Test error handling in health check."""
        mock_client = AsyncMock()
        mock_client.health_check.side_effect = Exception("Connection failed")
        mock_client_class.return_value.__aenter__.return_value = mock_client

        tools = SearchTools(grok_config)

        result = await tools.health_check()

        assert result["status"] == "unhealthy"
        assert "error" in result["details"]


@pytest.mark.asyncio
class TestMCPFunctions:
    """Test MCP function wrappers."""

    @patch('src.grok_mcp.search_tools.SearchTools.search_posts')
    async def test_mcp_search_posts_success(self, mock_search):
        """Test MCP search posts function."""
        mock_search.return_value = {
            "posts": [
                {"content": "Test post 1", "author": "@user1"},
                {"content": "Test post 2", "author": "@user2"}
            ]
        }

        result = await mcp_search_posts("AI technology", max_results=10)

        assert "Found 2 posts" in result
        assert "Test post 1" in result
        assert "@user1" in result

    @patch('src.grok_mcp.search_tools.SearchTools.search_posts')
    async def test_mcp_search_posts_no_results(self, mock_search):
        """Test MCP search posts with no results."""
        mock_search.return_value = {"posts": []}

        result = await mcp_search_posts("nonexistent query")

        assert "No posts found" in result

    @patch('src.grok_mcp.search_tools.SearchTools.search_posts')
    async def test_mcp_search_posts_error(self, mock_search):
        """Test MCP search posts error handling."""
        mock_search.return_value = {"error": {"message": "API error"}}

        result = await mcp_search_posts("test query")

        assert "Error searching posts: API error" in result

    @patch('src.grok_mcp.search_tools.SearchTools.search_users')
    async def test_mcp_search_users_success(self, mock_search):
        """Test MCP search users function."""
        mock_search.return_value = {
            "users": [
                {"username": "user1", "profile_url": "https://x.com/user1"},
                {"username": "user2", "profile_url": "https://x.com/user2"}
            ]
        }

        result = await mcp_search_users("AI researchers")

        assert "Found 2 users" in result
        assert "@user1" in result
        assert "https://x.com/user1" in result

    @patch('src.grok_mcp.search_tools.SearchTools.search_threads')
    async def test_mcp_search_threads_success(self, mock_search):
        """Test MCP search threads function."""
        mock_search.return_value = {
            "threads": [
                {"type": "conversation_thread", "summary": "Discussion about AI", "participant_count": 5}
            ]
        }

        result = await mcp_search_threads("AI ethics")

        assert "Found 1 conversation threads" in result
        assert "Discussion about AI" in result
        assert "Participants: 5" in result

    @patch('src.grok_mcp.search_tools.SearchTools.get_trends')
    async def test_mcp_get_trends_success(self, mock_trends):
        """Test MCP get trends function."""
        mock_trends.return_value = {
            "trends": [
                {"topic": "AI", "category": "hashtag", "hashtag": "#AI"},
                {"topic": "Technology", "category": "trending_topic"}
            ]
        }

        result = await mcp_get_trends("Global")

        assert "Trending topics for Global" in result
        assert "AI (#AI)" in result
        assert "Technology" in result

    @patch('src.grok_mcp.search_tools.SearchTools.health_check')
    async def test_mcp_health_check_success(self, mock_health):
        """Test MCP health check function."""
        mock_health.return_value = {
            "service": "grok-mcp-server",
            "status": "healthy",
            "timestamp": "2024-01-01T00:00:00",
            "details": {"models": {"data": [{"id": "grok-beta"}]}}
        }

        result = await mcp_health_check()

        assert "Grok MCP Server Health Check" in result
        assert "Status: healthy" in result
        assert "Available models: 1" in result