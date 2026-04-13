export class GrokMcpError extends Error {
  constructor(
    message: string,
    public readonly errorCode: string = 'UNKNOWN_ERROR',
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class ConfigurationError extends GrokMcpError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR')
  }
}

export class APIError extends GrokMcpError {
  constructor(
    message: string,
    public readonly statusCode: number = 0,
  ) {
    super(message, 'API_ERROR')
  }
}

export class AuthenticationError extends APIError {
  constructor(message = 'Authentication failed') {
    super(message, 401)
  }
}

export class RateLimitError extends APIError {
  constructor(
    message = 'Rate limit exceeded',
    public readonly retryAfter?: number,
  ) {
    super(message, 429)
  }
}

export class InvalidQueryError extends GrokMcpError {
  constructor(message: string) {
    super(message, 'INVALID_QUERY')
  }
}

export class SearchError extends GrokMcpError {
  constructor(
    message: string,
    public readonly searchType?: string,
  ) {
    super(message, 'SEARCH_ERROR')
  }
}

export class TimeoutError extends GrokMcpError {
  constructor(message = 'Request timed out') {
    super(message, 'TIMEOUT_ERROR')
  }
}

export class NetworkError extends GrokMcpError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR')
  }
}

export class ResponseParsingError extends GrokMcpError {
  constructor(message: string) {
    super(message, 'RESPONSE_PARSING_ERROR')
  }
}
