"""
Response formatting utilities for Grok MCP Server.

This module handles formatting of Grok API responses for optimal consumption
by Claude Desktop and other MCP clients.
"""

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

import logging

logger = logging.getLogger(__name__)


class ResponseFormatter:
    """Formats Grok API responses for MCP consumption."""

    @staticmethod
    def format_search_response(
        raw_response: Dict[str, Any],
        search_type: str,
        query: str,
        analysis_mode: str = "basic",
    ) -> Dict[str, Any]:
        """Format search response for MCP client consumption."""
        try:
            # Extract content from Live Search API response format
            content = ""
            citations = []

            # New Live Search API format (v1/responses endpoint)
            if "output" in raw_response:
                for output_item in raw_response["output"]:
                    if output_item.get("type") == "message" and "content" in output_item:
                        for content_item in output_item["content"]:
                            if content_item.get("type") == "output_text":
                                content = content_item.get("text", "")
                                # Extract annotations/citations
                                for annotation in content_item.get("annotations", []):
                                    if annotation.get("type") == "url_citation":
                                        citations.append({
                                            "url": annotation.get("url"),
                                            "title": annotation.get("title"),
                                        })

            # Fallback to old chat completions format
            elif "choices" in raw_response and raw_response["choices"]:
                choice = raw_response["choices"][0]
                if "message" in choice:
                    content = choice["message"].get("content", "")

            formatted_response = {
                "query": query,
                "search_type": search_type,
                "analysis_mode": analysis_mode,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "content": content,
                "citations": citations,
                "raw_response": raw_response if analysis_mode == "comprehensive" else None,
            }

            # Add parsed results based on search type
            if search_type == "posts":
                formatted_response["posts"] = ResponseFormatter._extract_posts(content)
            elif search_type == "users":
                formatted_response["users"] = ResponseFormatter._extract_users(content)
            elif search_type == "threads":
                formatted_response["threads"] = ResponseFormatter._extract_threads(content)
            elif search_type == "trends":
                formatted_response["trends"] = ResponseFormatter._extract_trends(content)

            # Add metadata
            formatted_response["metadata"] = ResponseFormatter._extract_metadata(raw_response)

            return formatted_response

        except Exception as e:
            logger.error(f"Error formatting response: {e}")
            return {
                "query": query,
                "search_type": search_type,
                "error": f"Failed to format response: {str(e)}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "raw_response": raw_response,
            }

    @staticmethod
    def _extract_posts(content: str) -> List[Dict[str, Any]]:
        """Extract post information from content."""
        posts = []

        # Try to find structured post data in the content
        # This is a simplified parser - in reality, Grok would provide structured data
        lines = content.split('\n')
        current_post = {}

        for line in lines:
            line = line.strip()
            if not line:
                if current_post:
                    posts.append(current_post)
                    current_post = {}
                continue

            # Look for patterns that indicate post metadata
            if line.startswith('@'):
                current_post['author'] = line.split()[0]
                current_post['content'] = ' '.join(line.split()[1:])
            elif 'likes:' in line.lower() or 'retweets:' in line.lower():
                current_post['engagement'] = line
            elif any(keyword in line.lower() for keyword in ['posted', 'tweeted', 'ago']):
                current_post['timestamp'] = line
            else:
                if 'content' in current_post:
                    current_post['content'] += ' ' + line
                else:
                    current_post['content'] = line

        # Add the last post if it exists
        if current_post:
            posts.append(current_post)

        return posts

    @staticmethod
    def _extract_users(content: str) -> List[Dict[str, Any]]:
        """Extract user information from content."""
        users = []

        # Extract user mentions and profiles from content
        user_pattern = r'@(\w+)'
        mentions = re.findall(user_pattern, content)

        for mention in set(mentions):  # Remove duplicates
            users.append({
                'username': mention,
                'profile_url': f'https://x.com/{mention}',
                'mentioned_in_context': True
            })

        return users

    @staticmethod
    def _extract_threads(content: str) -> List[Dict[str, Any]]:
        """Extract thread information from content."""
        threads = []

        # Look for conversation patterns in content
        # This is simplified - real implementation would parse structured thread data
        if 'thread' in content.lower() or 'conversation' in content.lower():
            threads.append({
                'type': 'conversation_thread',
                'summary': content[:200] + '...' if len(content) > 200 else content,
                'participant_count': len(re.findall(r'@\w+', content)),
            })

        return threads

    @staticmethod
    def _extract_trends(content: str) -> List[Dict[str, Any]]:
        """Extract trending topics from content."""
        trends = []

        # Look for hashtag patterns
        hashtag_pattern = r'#(\w+)'
        hashtags = re.findall(hashtag_pattern, content)

        for hashtag in set(hashtags):  # Remove duplicates
            trends.append({
                'hashtag': f'#{hashtag}',
                'topic': hashtag,
                'category': 'hashtag'
            })

        # Look for trending topic mentions
        trend_keywords = ['trending', 'popular', 'viral', 'breaking']
        lines = content.split('\n')

        for line in lines:
            if any(keyword in line.lower() for keyword in trend_keywords):
                trends.append({
                    'topic': line.strip(),
                    'category': 'trending_topic',
                    'description': line.strip()
                })

        return trends

    @staticmethod
    def _extract_metadata(raw_response: Dict[str, Any]) -> Dict[str, Any]:
        """Extract metadata from raw API response."""
        metadata = {
            "response_id": raw_response.get("id"),
            "model": raw_response.get("model"),
            "created": raw_response.get("created"),
        }

        # Extract usage information if available
        if "usage" in raw_response:
            metadata["usage"] = raw_response["usage"]

        # Extract timing information
        if "response_time" in raw_response:
            metadata["response_time_ms"] = raw_response["response_time"]

        return metadata

    @staticmethod
    def format_error_response(
        error: Exception,
        query: str,
        search_type: str,
    ) -> Dict[str, Any]:
        """Format error response for MCP client."""
        return {
            "query": query,
            "search_type": search_type,
            "error": {
                "type": type(error).__name__,
                "message": str(error),
                "code": getattr(error, "error_code", "UNKNOWN_ERROR"),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "success": False,
        }

    @staticmethod
    def format_health_check_response(health_data: Dict[str, Any]) -> Dict[str, Any]:
        """Format health check response."""
        return {
            "service": "grok-mcp-server",
            "status": health_data.get("status", "unknown"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": health_data,
        }

    @staticmethod
    def clean_content(content: str) -> str:
        """Clean and sanitize content for MCP consumption."""
        if not content:
            return ""

        # Remove excessive whitespace
        content = re.sub(r'\s+', ' ', content)

        # Remove potential markdown artifacts that might interfere with Claude
        content = re.sub(r'```[\w]*\n?', '', content)

        # Ensure proper line endings
        content = content.replace('\r\n', '\n').replace('\r', '\n')

        return content.strip()

    @staticmethod
    def extract_citations(content: str) -> List[str]:
        """Extract citation URLs from content."""
        url_pattern = r'https?://[^\s<>"{}|\\^`[\]]*'
        urls = re.findall(url_pattern, content)

        # Filter for X.com URLs and clean them
        citations = []
        for url in urls:
            if 'x.com' in url or 'twitter.com' in url:
                # Clean URL of any trailing punctuation
                url = re.sub(r'[.,;:!?]+$', '', url)
                citations.append(url)

        return list(set(citations))  # Remove duplicates