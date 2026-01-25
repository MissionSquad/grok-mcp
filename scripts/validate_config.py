#!/usr/bin/env python3
"""
Configuration validation script for Grok MCP Server.

This script validates the configuration and tests basic functionality
without making real API calls.
"""

import asyncio
import sys
import os

# Add the src directory to the path so we can import our modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from grok_mcp.config import GrokConfig
from grok_mcp.server import handle_list_tools, handle_list_resources


async def validate_configuration():
    """Validate configuration settings."""
    print("🔧 Validating Configuration...")

    config = GrokConfig()

    # Check if API key is set
    api_key_set = config.API_KEY != "your-xai-api-key-here" and config.API_KEY
    print(f"  ✅ API Key configured: {api_key_set}")

    if not api_key_set:
        print("  ⚠️  Warning: API key not configured. Set XAI_API_KEY environment variable.")

    # Validate configuration
    is_valid = config.validate()
    print(f"  ✅ Configuration valid: {is_valid}")

    # Test headers
    headers = config.get_headers()
    print(f"  ✅ Headers generated: {len(headers)} headers")

    return is_valid


async def test_mcp_protocol():
    """Test MCP protocol implementation."""
    print("\n🔌 Testing MCP Protocol...")

    try:
        # Test tool listing
        tools = await handle_list_tools()
        print(f"  ✅ Tools available: {len(tools)}")

        for tool in tools:
            print(f"    - {tool.name}: {tool.description[:50]}...")

        # Test resource listing
        resources = await handle_list_resources()
        print(f"  ✅ Resources available: {len(resources)}")

        for resource in resources:
            print(f"    - {resource.uri}: {resource.name}")

        return True

    except Exception as e:
        print(f"  ❌ MCP Protocol test failed: {e}")
        return False


async def test_basic_functionality():
    """Test basic functionality without API calls."""
    print("\n⚙️  Testing Basic Functionality...")

    try:
        from grok_mcp.search_tools import SearchPostsRequest, SearchUsersRequest
        from grok_mcp.response_formatter import ResponseFormatter

        # Test request validation
        request = SearchPostsRequest(query="test query", max_results=10)
        print(f"  ✅ Request validation: query='{request.query}', max_results={request.max_results}")

        # Test response formatter
        formatter = ResponseFormatter()
        mock_response = {
            "id": "test-123",
            "choices": [{"message": {"content": "Test response"}}]
        }

        formatted = formatter.format_search_response(
            raw_response=mock_response,
            search_type="posts",
            query="test",
            analysis_mode="basic"
        )

        print(f"  ✅ Response formatting: {len(formatted)} fields generated")

        return True

    except Exception as e:
        print(f"  ❌ Basic functionality test failed: {e}")
        return False


def print_configuration_guide():
    """Print configuration guide for Claude Desktop."""
    print("\n📋 Claude Desktop Configuration Guide:")
    print("\n1. Find your Claude Desktop configuration file:")
    print("   - macOS: ~/Library/Application Support/Claude/claude_desktop_config.json")
    print("   - Windows: %APPDATA%\\Claude\\claude_desktop_config.json")
    print("   - Linux: ~/.config/Claude/claude_desktop_config.json")

    print("\n2. Add this configuration to your claude_desktop_config.json:")

    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    config_template = f'''{{
  "mcpServers": {{
    "grok-search": {{
      "command": "uv",
      "args": ["run", "python", "-m", "grok_mcp.server"],
      "cwd": "{current_dir}",
      "env": {{
        "XAI_API_KEY": "your-xai-api-key-here"
      }}
    }}
  }}
}}'''

    print(config_template)

    print("\n3. Replace 'your-xai-api-key-here' with your actual xAI API key")
    print("4. Restart Claude Desktop")
    print("5. The Grok search tools should now be available in Claude Desktop")


async def main():
    """Main validation function."""
    print("🚀 Grok MCP Server Validation")
    print("=" * 50)

    config_valid = await validate_configuration()
    mcp_valid = await test_mcp_protocol()
    functionality_valid = await test_basic_functionality()

    print("\n📊 Validation Results:")
    print(f"  Configuration: {'✅ PASS' if config_valid else '❌ FAIL'}")
    print(f"  MCP Protocol: {'✅ PASS' if mcp_valid else '❌ FAIL'}")
    print(f"  Basic Functionality: {'✅ PASS' if functionality_valid else '❌ FAIL'}")

    overall_status = all([config_valid, mcp_valid, functionality_valid])

    if overall_status:
        print("\n🎉 All validations passed! The server is ready to use.")
        print_configuration_guide()
    else:
        print("\n❌ Some validations failed. Please check the errors above.")
        return 1

    return 0


if __name__ == "__main__":
    try:
        exit_code = asyncio.run(main())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n⚠️  Validation interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Unexpected error: {e}")
        sys.exit(1)