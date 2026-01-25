"""
Custom exceptions for Grok MCP Server.
"""


class GrokMCPError(Exception):
    """Base exception for Grok MCP Server."""

    def __init__(self, message: str, error_code: str = "UNKNOWN_ERROR"):
        super().__init__(message)
        self.message = message
        self.error_code = error_code


class ConfigurationError(GrokMCPError):
    """Raised when configuration is invalid."""

    def __init__(self, message: str):
        super().__init__(message, "CONFIGURATION_ERROR")


class APIError(GrokMCPError):
    """Base exception for API-related errors."""

    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message, "API_ERROR")
        self.status_code = status_code


class AuthenticationError(APIError):
    """Raised when API authentication fails."""

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, 401)
        self.error_code = "AUTHENTICATION_ERROR"


class RateLimitError(APIError):
    """Raised when API rate limit is exceeded."""

    def __init__(self, message: str = "Rate limit exceeded", retry_after: int = None):
        super().__init__(message, 429)
        self.error_code = "RATE_LIMIT_ERROR"
        self.retry_after = retry_after


class InvalidQueryError(GrokMCPError):
    """Raised when search query is invalid."""

    def __init__(self, message: str):
        super().__init__(message, "INVALID_QUERY")


class SearchError(GrokMCPError):
    """Raised when search operation fails."""

    def __init__(self, message: str, search_type: str = None):
        super().__init__(message, "SEARCH_ERROR")
        self.search_type = search_type


class TimeoutError(GrokMCPError):
    """Raised when request times out."""

    def __init__(self, message: str = "Request timed out"):
        super().__init__(message, "TIMEOUT_ERROR")


class NetworkError(GrokMCPError):
    """Raised when network connection fails."""

    def __init__(self, message: str):
        super().__init__(message, "NETWORK_ERROR")


class ResponseParsingError(GrokMCPError):
    """Raised when response cannot be parsed."""

    def __init__(self, message: str):
        super().__init__(message, "RESPONSE_PARSING_ERROR")