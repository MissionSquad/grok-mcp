"""
Tests for MCP server.
"""

import json
import pytest
from unittest.mock import AsyncMock, patch
from pathlib import Path

from src.grok_mcp.server import (
    handle_list_tools,
    handle_call_tool,
    handle_list_resources,
    handle_read_resource,
)
from src.grok_mcp.config import GrokConfig


@pytest.fixture
def mock_responses():
    """Load mock API responses from fixtures."""
    fixtures_path = Path(__file__).parent / "fixtures" / "mock_responses.json"
    with open(fixtures_path) as f:
        return json.load(f)


@pytest.mark.asyncio
class TestMCPServer:
    """Test cases for MCP server handlers."""

    async def test_list_tools(self):
        """Test tool listing."""
        tools = await handle_list_tools()

        assert len(tools) == 5
        tool_names = [tool.name for tool in tools]

        assert "search_posts" in tool_names
        assert "search_users" in tool_names
        assert "search_threads" in tool_names
        assert "get_trends" in tool_names
        assert "health_check" in tool_names

        # Check search_posts tool schema
        search_posts_tool = next(tool for tool in tools if tool.name == "search_posts")
        schema = search_posts_tool.inputSchema

        assert "query" in schema["properties"]
        assert schema["properties"]["query"]["maxLength"] == 1000
        assert "max_results" in schema["properties"]
        assert schema["properties"]["max_results"]["maximum"] == 100
        assert "analysis_mode" in schema["properties"]
        assert "basic" in schema["properties"]["analysis_mode"]["enum"]
        assert "comprehensive" in schema["properties"]["analysis_mode"]["enum"]

    @patch('src.grok_mcp.server.mcp_search_posts')
    async def test_call_tool_search_posts(self, mock_search_posts):
        """Test search_posts tool call."""
        mock_search_posts.return_value = "Test search results"

        result = await handle_call_tool("search_posts", {
            "query": "AI technology",
            "max_results": 10,
            "analysis_mode": "basic"
        })

        assert len(result) == 1
        assert result[0].type == "text"
        assert result[0].text == "Test search results"

        mock_search_posts.assert_called_once_with(
            query="AI technology",
            max_results=10,
            handles=None,
            start_date=None,
            end_date=None,
            analysis_mode="basic"
        )

    @patch('src.grok_mcp.server.mcp_search_users')
    async def test_call_tool_search_users(self, mock_search_users):
        """Test search_users tool call."""
        mock_search_users.return_value = "User search results"

        result = await handle_call_tool("search_users", {
            "query": "AI researchers",
            "max_results": 15
        })

        assert len(result) == 1
        assert result[0].text == "User search results"

        mock_search_users.assert_called_once_with(
            query="AI researchers",
            max_results=15
        )

    @patch('src.grok_mcp.server.mcp_search_threads')
    async def test_call_tool_search_threads(self, mock_search_threads):
        """Test search_threads tool call."""
        mock_search_threads.return_value = "Thread search results"

        result = await handle_call_tool("search_threads", {
            "query": "AI ethics",
            "max_results": 5
        })

        assert len(result) == 1
        assert result[0].text == "Thread search results"

        mock_search_threads.assert_called_once_with(
            query="AI ethics",
            max_results=5
        )

    @patch('src.grok_mcp.server.mcp_get_trends')
    async def test_call_tool_get_trends(self, mock_get_trends):
        """Test get_trends tool call."""
        mock_get_trends.return_value = "Trending topics"

        result = await handle_call_tool("get_trends", {
            "location": "United States",
            "max_results": 25
        })

        assert len(result) == 1
        assert result[0].text == "Trending topics"

        mock_get_trends.assert_called_once_with(
            location="United States",
            max_results=25
        )

    @patch('src.grok_mcp.server.mcp_health_check')
    async def test_call_tool_health_check(self, mock_health_check):
        """Test health_check tool call."""
        mock_health_check.return_value = "Health status"

        result = await handle_call_tool("health_check", {})

        assert len(result) == 1
        assert result[0].text == "Health status"

        mock_health_check.assert_called_once()

    async def test_call_tool_unknown(self):
        """Test unknown tool call."""
        result = await handle_call_tool("unknown_tool", {})

        assert len(result) == 1
        assert "Error executing unknown_tool" in result[0].text
        assert "Unknown tool" in result[0].text

    @patch('src.grok_mcp.server.mcp_search_posts')
    async def test_call_tool_with_exception(self, mock_search_posts):
        """Test tool call with exception."""
        mock_search_posts.side_effect = Exception("Test error")

        result = await handle_call_tool("search_posts", {"query": "test"})

        assert len(result) == 1
        assert "Error executing search_posts" in result[0].text
        assert "Test error" in result[0].text

    async def test_list_resources(self):
        """Test resource listing."""
        resources = await handle_list_resources()

        assert len(resources) == 2
        resource_uris = [resource.uri for resource in resources]

        assert "grok://config" in resource_uris
        assert "grok://health" in resource_uris

        config_resource = next(res for res in resources if res.uri == "grok://config")
        assert config_resource.name == "Server Configuration"
        assert config_resource.mimeType == "application/json"

        health_resource = next(res for res in resources if res.uri == "grok://health")
        assert health_resource.name == "Health Status"
        assert health_resource.mimeType == "application/json"

    async def test_read_resource_config(self):
        """Test reading config resource."""
        result = await handle_read_resource("grok://config")

        config_data = json.loads(result)
        assert config_data["server_name"] == "grok-search-mcp"
        assert config_data["version"] == "0.1.0"
        assert config_data["model"] == GrokConfig.MODEL
        assert config_data["base_url"] == GrokConfig.BASE_URL
        assert "api_key_configured" in config_data

    @patch('src.grok_mcp.server.mcp_health_check')
    async def test_read_resource_health(self, mock_health_check):
        """Test reading health resource."""
        mock_health_check.return_value = "Health check result"

        result = await handle_read_resource("grok://health")

        assert result == "Health check result"
        mock_health_check.assert_called_once()

    @patch('src.grok_mcp.server.mcp_health_check')
    async def test_read_resource_health_error(self, mock_health_check):
        """Test reading health resource with error."""
        mock_health_check.side_effect = Exception("Health check failed")

        result = await handle_read_resource("grok://health")

        error_data = json.loads(result)
        assert error_data["status"] == "error"
        assert "Health check failed" in error_data["message"]

    async def test_read_resource_unknown(self):
        """Test reading unknown resource."""
        with pytest.raises(ValueError) as exc_info:
            await handle_read_resource("grok://unknown")

        assert "Unknown resource" in str(exc_info.value)

    async def test_config_validation(self):
        """Test configuration validation."""
        # Test valid config
        config = GrokConfig()
        config.API_KEY = "valid-key"
        config.TIMEOUT_SECONDS = 30
        config.MAX_RETRIES = 3

        assert config.validate() is True

        # Test invalid API key
        config.API_KEY = "your-xai-api-key-here"
        assert config.validate() is False

        config.API_KEY = ""
        assert config.validate() is False

        # Test invalid timeout
        config.API_KEY = "valid-key"
        config.TIMEOUT_SECONDS = 0
        assert config.validate() is False

        # Test invalid retries
        config.TIMEOUT_SECONDS = 30
        config.MAX_RETRIES = -1
        assert config.validate() is False

    async def test_config_headers(self):
        """Test configuration header generation."""
        config = GrokConfig()
        config.API_KEY = "test-api-key"

        headers = config.get_headers()

        assert headers["Authorization"] == "Bearer test-api-key"
        assert headers["Content-Type"] == "application/json"
        assert "grok-mcp" in headers["User-Agent"]