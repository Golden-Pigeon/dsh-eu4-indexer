import type { IndexerService } from '../service.js'
import { failure } from '../util.js'
export const API_PATH = '/api/eu4-indexer'
/** Connection owns authentication, origin checks and owner-only admission. */
export function createApi(service: IndexerService) {
  return async (request: Request) => {
    try {
      if (request.method === 'GET')
        return Response.json(
          await service.dispatch(
            { operation: 'state' },
            { signal: request.signal },
          ),
          {
            headers: { 'cache-control': 'no-store' },
          },
        )
      if (request.method !== 'POST')
        return new Response('Method not allowed', { status: 405 })
      if (
        !/^application\/json(?:;|$)/i.test(
          request.headers.get('content-type') ?? '',
        )
      )
        return new Response('JSON required', { status: 415 })
      const text = await request.text()
      if (Buffer.byteLength(text) > 131072)
        return new Response('Request too large', { status: 413 })
      const result = await service.dispatch(JSON.parse(text), {
        signal: request.signal,
      })
      return Response.json(result, {
        headers: { 'cache-control': 'no-store' },
      })
    } catch (error) {
      return Response.json(failure(error), {
        status:
          failure(error).code === 'busy' ||
          failure(error).code === 'index_in_use'
            ? 409
            : 400,
        headers: { 'cache-control': 'no-store' },
      })
    }
  }
}
