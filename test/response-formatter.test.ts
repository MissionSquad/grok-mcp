import { ResponseParsingError, SearchError } from '../src/errors.js'
import { ResponseFormatter } from '../src/response-formatter.js'

function format(rawResponse: Record<string, unknown>) {
  return ResponseFormatter.formatSearchResponse({ rawResponse, searchType: 'posts', query: 'bitcoin' })
}

function message(text: string, annotations: unknown[] = []) {
  return { type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations }] }
}

describe('ResponseFormatter', () => {
  it('collects all answer blocks and deduplicates citations without exposing reasoning', () => {
    const url = 'https://x.com/example/status/123'
    const result = format({
      status: 'completed',
      output: [
        { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Private reasoning' }] },
        message(''),
        { type: 'web_search_call', status: 'completed' },
        message('### Bitcoin posts', [{ type: 'url_citation', url, title: 'Bitcoin post' }]),
        { type: 'message', role: 'assistant', content: [
          { type: 'output_text', text: '| Author | Post |\n| --- | --- |\n| **@example** | Bitcoin news |', annotations: [{ type: 'url_citation', url }] },
          { type: 'output_text', text: 'Sentiment: mixed.', annotations: [{ type: 'url_citation', url: 'https://x.com/another/status/456' }] },
        ] },
      ],
    })

    expect(result.content).toBe('### Bitcoin posts\n\n| Author | Post |\n| --- | --- |\n| **@example** | Bitcoin news |\n\nSentiment: mixed.')
    expect(result.content).not.toContain('Private reasoning')
    expect(result.citations).toEqual([{ url, title: 'Bitcoin post' }, { url: 'https://x.com/another/status/456' }])
  })

  it('preserves a genuine no-match answer', () => {
    expect(format({ status: 'completed', output: [message('No matching posts were found in the requested date range.')] }).content)
      .toBe('No matching posts were found in the requested date range.')
  })

  it('merges response citations and validates annotation URLs', () => {
    const url = 'https://x.com/example/status/123'
    const result = format({
      status: 'completed',
      output: [message('Search answer', [
        { type: 'url_citation', url, title: 'Example' },
        { type: 'url_citation', url: 'javascript:alert(1)' },
        { type: 'url_citation', url: 'not a URL' },
        { type: 'url_citation', url: 42 },
        null,
      ])],
      citations: [url, 'https://x.com/another/status/456', null, {}],
    })
    expect(result.citations).toEqual([{ url, title: 'Example' }, { url: 'https://x.com/another/status/456' }])
  })

  it('rejects Responses API answers without a completion status', () => {
    expect(() => format({ object: 'response', output: [message('Unverified answer')] }))
      .toThrow('missing its completion status')
  })

  it.each([{}, { status: 'completed', output: [] }, { status: 'completed', output: [message('   ')] }, { status: 'completed', output: [{ type: 'reasoning' }] }, { status: 'completed', output: [null, 42, { type: 'message', content: [null] }] }])
    ('rejects missing answer text instead of returning empty results: %j', (response) => {
      expect(() => format(response)).toThrow(ResponseParsingError)
    })

  it.each(['failed', 'incomplete', 'cancelled', 'in_progress', 'queued'])('rejects a %s response even if it has partial text', (status) => {
    expect(() => format({ status, output: [message('Partial result')] })).toThrow(SearchError)
  })

  it('surfaces provider errors and incomplete reasons', () => {
    expect(() => format({ status: 'failed', error: { message: 'Search is unavailable' } })).toThrow('Search is unavailable')
    expect(() => format({ error: { message: 'Search is unavailable' } })).toThrow('Search is unavailable')
    expect(() => format({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } })).toThrow('max_output_tokens')
  })

  it('surfaces refusals as errors', () => {
    expect(() => format({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'I cannot fulfill that request.' }] }] }))
      .toThrow('I cannot fulfill that request.')
  })

  it('retains legacy chat completion support', () => {
    expect(format({ choices: [{ message: { content: 'A legacy answer.' } }] }).content).toBe('A legacy answer.')
  })
})
