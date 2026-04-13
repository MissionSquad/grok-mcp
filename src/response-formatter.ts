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

  private static extractContent(rawResponse: Record<string, unknown>): { content: string; citations: Citation[] } {
    const output = Array.isArray(rawResponse.output) ? rawResponse.output : undefined
    if (output) {
      for (const outputItem of output) {
        if (!outputItem || typeof outputItem !== 'object' || outputItem.type !== 'message') {
          continue
        }

        const contentItems = Array.isArray(outputItem.content) ? outputItem.content : []
        for (const contentItem of contentItems) {
          if (!contentItem || typeof contentItem !== 'object' || contentItem.type !== 'output_text') {
            continue
          }

          const content = typeof contentItem.text === 'string' ? contentItem.text : ''
          const annotations: unknown[] = Array.isArray(contentItem.annotations) ? contentItem.annotations : []
          const citations = annotations
            .filter((annotation: unknown): annotation is { type: string; url?: string; title?: string } => {
              return Boolean(
                annotation &&
                  typeof annotation === 'object' &&
                  'type' in annotation &&
                  annotation.type === 'url_citation'
              )
            })
            .map((annotation: { url?: string; title?: string }) => ({
              url: annotation.url,
              title: annotation.title,
            }))

          return { content, citations }
        }
      }
    }

    const choices = Array.isArray(rawResponse.choices) ? rawResponse.choices : []
    const firstChoice = choices[0]
    if (firstChoice && typeof firstChoice === 'object') {
      const message = firstChoice.message
      if (message && typeof message === 'object' && typeof message.content === 'string') {
        return { content: message.content, citations: [] }
      }
    }

    return { content: '', citations: [] }
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
