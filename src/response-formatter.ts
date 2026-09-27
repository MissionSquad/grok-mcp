import { ResponseParsingError, SearchError } from './errors.js'

const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]*/g
const USERNAME_PATTERN = /@(\w+)/g
const HASHTAG_PATTERN = /#(\w+)/g

export interface Citation {
  url?: string
  title?: string
}

export interface Metadata {
  response_id?: unknown
  model?: unknown
  created?: unknown
  usage?: unknown
  response_time_ms?: unknown
}

export interface FormattedSearchResponse {
  query: string
  search_type: string
  analysis_mode: 'basic' | 'comprehensive'
  timestamp: string
  content: string
  citations: Citation[]
  raw_response: Record<string, unknown> | null
  metadata: Metadata
  posts?: Array<Record<string, unknown>>
  users?: Array<Record<string, unknown>>
  threads?: Array<Record<string, unknown>>
  trends?: Array<Record<string, unknown>>
}

export interface FormattedHealthResponse {
  service: string
  status: string
  timestamp: string
  details: Record<string, unknown>
}

export class ResponseFormatter {
  static formatSearchResponse(options: {
    rawResponse: Record<string, unknown>
    searchType: string
    query: string
    analysisMode?: 'basic' | 'comprehensive'
  }): FormattedSearchResponse {
    ResponseFormatter.validateResponse(options.rawResponse)
    const analysisMode = options.analysisMode ?? 'basic'
    const { content, citations } = ResponseFormatter.extractContent(options.rawResponse)

    const formatted: FormattedSearchResponse = {
      query: options.query,
      search_type: options.searchType,
      analysis_mode: analysisMode,
      timestamp: new Date().toISOString(),
      content,
      citations,
      raw_response: analysisMode === 'comprehensive' ? options.rawResponse : null,
      metadata: ResponseFormatter.extractMetadata(options.rawResponse),
    }

    if (options.searchType === 'posts') {
      formatted.posts = ResponseFormatter.extractPosts(content)
    }

    if (options.searchType === 'users') {
      formatted.users = ResponseFormatter.extractUsers(content)
    }

    if (options.searchType === 'threads') {
      formatted.threads = ResponseFormatter.extractThreads(content)
    }

    if (options.searchType === 'trends') {
      formatted.trends = ResponseFormatter.extractTrends(content)
    }

    return formatted
  }

  static formatHealthCheckResponse(healthData: Record<string, unknown>): FormattedHealthResponse {
    return {
      service: 'grok-mcp-server',
      status: typeof healthData.status === 'string' ? healthData.status : 'unknown',
      timestamp: new Date().toISOString(),
      details: healthData,
    }
  }

  static cleanContent(content: string): string {
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\s+/g, ' ').replace(/```[\w]*\n?/g, '').trim()
  }

  static extractCitations(content: string): string[] {
    const matches = content.match(URL_PATTERN) ?? []

    return [...new Set(matches
      .filter((url) => url.includes('x.com') || url.includes('twitter.com'))
      .map((url) => url.replace(/[.,;:!?]+$/g, '')))]
  }

  private static validateResponse(rawResponse: Record<string, unknown>): void {
    const { status, error, incomplete_details: incompleteDetails } = rawResponse
    if ((rawResponse.object === 'response' || 'output' in rawResponse) && status === undefined) {
      throw new ResponseParsingError('xAI search response is missing its completion status.')
    }
    if (error != null || (status !== undefined && status !== 'completed')) {
      const detail = isRecord(error) && typeof error.message === 'string'
        ? error.message
        : typeof error === 'string'
          ? error
          : isRecord(incompleteDetails) && typeof incompleteDetails.reason === 'string'
            ? incompleteDetails.reason
            : undefined
      throw new SearchError(
        `xAI search response ${typeof status === 'string' ? status : 'failed'}${detail ? `: ${detail}` : '.'}`,
      )
    }
  }

  private static extractContent(rawResponse: Record<string, unknown>): { content: string; citations: Citation[] } {
    const textParts: string[] = []
    const citations = new Map<string, Citation>()
    const addCitation = (url: unknown, title?: unknown): void => {
      if (typeof url !== 'string') {
        return
      }
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          return
        }
      } catch {
        return
      }
      if (!citations.has(url)) {
        citations.set(url, typeof title === 'string' ? { url, title } : { url })
      }
    }

    if (Array.isArray(rawResponse.output)) {
      for (const outputItem of rawResponse.output) {
        if (!isRecord(outputItem) || outputItem.type !== 'message' ||
          (outputItem.role !== undefined && outputItem.role !== 'assistant')) {
          continue
        }

        const contentItems: unknown[] = Array.isArray(outputItem.content) ? outputItem.content : []
        for (const contentItem of contentItems) {
          if (!isRecord(contentItem)) {
            continue
          }
          if (contentItem.type === 'refusal') {
            throw new SearchError(
              typeof contentItem.refusal === 'string' ? contentItem.refusal : 'xAI refused the search request.',
            )
          }
          if (contentItem.type !== 'output_text') {
            continue
          }
          if (typeof contentItem.text === 'string' && contentItem.text.trim()) {
            textParts.push(contentItem.text)
          }
          const annotations: unknown[] = Array.isArray(contentItem.annotations) ? contentItem.annotations : []
          for (const annotation of annotations) {
            if (isRecord(annotation) && annotation.type === 'url_citation') {
              addCitation(annotation.url, annotation.title)
            }
          }
        }
      }
    } else {
      // Preserve compatibility with older Chat Completions responses.
      const choices: unknown[] = Array.isArray(rawResponse.choices) ? rawResponse.choices : []
      const firstChoice = choices[0]
      const message = isRecord(firstChoice) ? firstChoice.message : undefined
      if (isRecord(message) && typeof message.content === 'string' && message.content.trim()) {
        textParts.push(message.content)
      }
    }

    if (textParts.length === 0) {
      throw new ResponseParsingError('xAI returned no usable search answer text; this does not indicate that no results were found.')
    }

    const responseCitations: unknown[] = Array.isArray(rawResponse.citations) ? rawResponse.citations : []
    for (const citation of responseCitations) {
      addCitation(citation)
    }

    return { content: textParts.join('\n\n'), citations: [...citations.values()] }
  }

  private static extractPosts(content: string): Array<Record<string, unknown>> {
    const posts: Array<Record<string, unknown>> = []
    const lines = content.split('\n')
    let currentPost: Record<string, unknown> = {}

    for (const rawLine of lines) {
      const line = rawLine.trim()

      if (!line) {
        if (Object.keys(currentPost).length > 0) {
          posts.push(currentPost)
          currentPost = {}
        }
        continue
      }

      const normalizedLine = line.replace(/^\d+\.\s*/, '')

      if (normalizedLine.startsWith('@')) {
        const [author, ...rest] = normalizedLine.split(/\s+/)
        currentPost.author = author.replace(/:$/, '')
        currentPost.content = rest.join(' ').replace(/^:\s*/, '')
        continue
      }

      if (Object.keys(currentPost).length === 0) {
        continue
      }

      if (normalizedLine.toLowerCase().includes('likes:') || normalizedLine.toLowerCase().includes('retweets:')) {
        currentPost.engagement = normalizedLine
        continue
      }

      if (/(posted|tweeted|ago)/i.test(normalizedLine)) {
        currentPost.timestamp = normalizedLine
        continue
      }

      currentPost.content = typeof currentPost.content === 'string'
        ? `${currentPost.content} ${normalizedLine}`.trim()
        : normalizedLine
    }

    if (Object.keys(currentPost).length > 0) {
      posts.push(currentPost)
    }

    return posts
  }

  private static extractUsers(content: string): Array<Record<string, unknown>> {
    const users = new Set<string>()
    let match: RegExpExecArray | null

    while ((match = USERNAME_PATTERN.exec(content)) !== null) {
      users.add(match[1])
    }

    return [...users].map((username) => ({
      username,
      profile_url: `https://x.com/${username}`,
      mentioned_in_context: true,
    }))
  }

  private static extractThreads(content: string): Array<Record<string, unknown>> {
    if (!/(thread|conversation)/i.test(content)) {
      return []
    }

    const participantMatches = content.match(USERNAME_PATTERN) ?? []

    return [
      {
        type: 'conversation_thread',
        summary: content.length > 200 ? `${content.slice(0, 200)}...` : content,
        participant_count: participantMatches.length,
      },
    ]
  }

  private static extractTrends(content: string): Array<Record<string, unknown>> {
    const hashtags = new Set<string>()
    let hashtagMatch: RegExpExecArray | null

    while ((hashtagMatch = HASHTAG_PATTERN.exec(content)) !== null) {
      hashtags.add(hashtagMatch[1])
    }

    const trends: Array<Record<string, unknown>> = [...hashtags].map((topic) => ({
      hashtag: `#${topic}`,
      topic,
      category: 'hashtag',
    }))

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed && /(trending|popular|viral|breaking)/i.test(trimmed)) {
        trends.push({
          topic: trimmed,
          category: 'trending_topic',
          description: trimmed,
        })
      }
    }

    return trends
  }

  private static extractMetadata(rawResponse: Record<string, unknown>): Metadata {
    const metadata: Metadata = {
      response_id: rawResponse.id,
      model: rawResponse.model,
      created: rawResponse.created,
    }

    if (rawResponse.usage !== undefined) {
      metadata.usage = rawResponse.usage
    }

    if (rawResponse.response_time !== undefined) {
      metadata.response_time_ms = rawResponse.response_time
    }

    return metadata
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
