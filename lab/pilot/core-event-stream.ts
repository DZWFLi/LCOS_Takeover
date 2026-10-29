import type { IncomingMessage, ServerResponse } from 'node:http'

export interface CoreEventStreamOptions {
  readonly coreOrigin: string
  readonly projectId: string
  readonly connectTimeoutMs?: number
}

interface ActiveStream {
  readonly controller: AbortController
  readonly request: IncomingMessage
  readonly response: ServerResponse
  reader?: ReadableStreamDefaultReader<Uint8Array>
  connectTimedOut: boolean
  clientClosed: boolean
}

const ROUTE_PREFIX = '/api/lcos/core/projects/'
const ROUTE_SUFFIX = '/events'
const SENSITIVE_QUERY_KEYS = new Set([
  'authorization', 'cookie', 'token', 'access_token', 'api_key', 'apikey', 'password', 'secret', 'credential',
])

function checkedLoopbackOrigin(value: string): URL {
  let origin: URL
  try {
    origin = new URL(value)
  } catch {
    throw new Error('coreOrigin must be an explicit loopback HTTP origin.')
  }
  if (origin.protocol !== 'http:'
    || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(origin.hostname)
    || !origin.port
    || origin.username !== ''
    || origin.password !== ''
    || origin.pathname !== '/'
    || origin.search !== ''
    || origin.hash !== '') {
    throw new Error('coreOrigin must be an explicit loopback HTTP origin without credentials or path.')
  }
  return origin
}

function sendLocalError(response: ServerResponse, status: number, code: string, message: string): void {
  if (response.headersSent || response.destroyed) return
  const body = Buffer.from(JSON.stringify({ ok: false, error: { code, message } }), 'utf8')
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(body.byteLength),
  })
  response.end(body)
}

function abortError(): Error {
  const error = new Error('Core event stream was closed.')
  error.name = 'AbortError'
  return error
}

function waitForDrain(response: ServerResponse, signal: AbortSignal): Promise<void> {
  if (signal.aborted || response.destroyed) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      response.off('drain', onDrain)
      response.off('close', onClose)
      signal.removeEventListener('abort', onAbort)
    }
    const onDrain = () => { cleanup(); resolve() }
    const onClose = () => { cleanup(); reject(abortError()) }
    const onAbort = () => { cleanup(); reject(abortError()) }
    response.once('drain', onDrain)
    response.once('close', onClose)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function pumpBytes(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  response: ServerResponse,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted && !response.destroyed && !response.writableEnded) {
    const chunk = await reader.read()
    if (chunk.done) return
    if (chunk.value.byteLength === 0) continue
    // Only one upstream chunk is handed to Node at a time. A false write waits
    // for drain before reading again, so a slow client cannot grow an unbounded
    // relay buffer.
    if (!response.write(Buffer.from(chunk.value))) await waitForDrain(response, signal)
  }
}

function rawRequestTarget(request: IncomingMessage, url: URL): string {
  return typeof request.url === 'string' && request.url.length > 0
    ? request.url
    : `${url.pathname}${url.search}`
}

function nonSseHeaders(upstream: Response): Record<string, string> {
  const headers: Record<string, string> = {}
  const contentType = upstream.headers.get('content-type')
  const contentLength = upstream.headers.get('content-length')
  const cacheControl = upstream.headers.get('cache-control')
  if (contentType !== null) headers['content-type'] = contentType
  if (contentLength !== null) headers['content-length'] = contentLength
  if (cacheControl !== null) headers['cache-control'] = cacheControl
  return headers
}

/**
 * Relays the existing Core ProjectEventHub SSE route byte-for-byte. It owns no
 * event bus and does not synthesize frames; dispose() aborts active Core fetches.
 */
export function createCoreEventStream(options: CoreEventStreamOptions): {
  handle(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean>
  dispose(): Promise<void>
} {
  const coreOrigin = checkedLoopbackOrigin(options.coreOrigin)
  const projectId = options.projectId
  if (projectId.trim() === '' || projectId === '.' || projectId === '..'
    || projectId.includes('/') || projectId.includes('\\')) {
    throw new Error('projectId must be a non-empty opaque project id.')
  }
  const connectTimeoutMs = options.connectTimeoutMs ?? 5_000
  if (!Number.isFinite(connectTimeoutMs) || connectTimeoutMs <= 0) {
    throw new Error('connectTimeoutMs must be a positive finite number.')
  }

  const active = new Set<ActiveStream>()
  let disposed = false

  const handle = async (request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> => {
    const rawTarget = rawRequestTarget(request, url)
    const rawPath = rawTarget.split('?', 1)[0] ?? ''
    if (!rawPath.startsWith(ROUTE_PREFIX)) return false
    const encodedProjectId = rawPath.slice(ROUTE_PREFIX.length, rawPath.endsWith(ROUTE_SUFFIX)
      ? -ROUTE_SUFFIX.length
      : undefined)
    if (!rawPath.endsWith(ROUTE_SUFFIX) || encodedProjectId.length === 0 || encodedProjectId.includes('/')) return false

    if (request.method?.toUpperCase() !== 'GET') {
      response.setHeader('allow', 'GET')
      sendLocalError(response, 405, 'METHOD_NOT_ALLOWED', 'Core event streams require GET.')
      return true
    }
    if (url.username !== '' || url.password !== '') {
      sendLocalError(response, 400, 'INVALID_CORE_EVENT_URL', 'Core event URL must not contain credentials.')
      return true
    }
    if (/%(?:2f|5c|2e)/i.test(rawPath) || rawPath.includes('\\')) {
      sendLocalError(response, 400, 'INVALID_CORE_EVENT_PATH', 'Encoded path separators and dot segments are not allowed.')
      return true
    }

    let incomingProjectId: string
    try {
      incomingProjectId = decodeURIComponent(encodedProjectId)
    } catch {
      sendLocalError(response, 400, 'INVALID_CORE_EVENT_PATH', 'Project id is not valid URL encoding.')
      return true
    }
    if (incomingProjectId === '' || incomingProjectId === '.' || incomingProjectId === '..'
      || incomingProjectId.includes('/') || incomingProjectId.includes('\\')) {
      sendLocalError(response, 400, 'INVALID_CORE_EVENT_PATH', 'Project id must be one opaque path segment.')
      return true
    }
    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        sendLocalError(response, 400, 'CREDENTIAL_QUERY_NOT_ALLOWED', 'Credentials cannot be supplied in Core event query parameters.')
        return true
      }
    }
    if (disposed) {
      sendLocalError(response, 503, 'CORE_EVENT_RELAY_CLOSED', 'Core event relay has been disposed.')
      return true
    }

    const controller = new AbortController()
    const state: ActiveStream = { controller, request, response, connectTimedOut: false, clientClosed: false }
    active.add(state)
    const closeClient = () => {
      if (response.writableEnded) return
      state.clientClosed = true
      controller.abort()
      void state.reader?.cancel().catch(() => undefined)
    }
    const onResponseClose = () => closeClient()
    request.once('aborted', closeClient)
    response.once('close', onResponseClose)
    response.once('error', closeClient)

    const targetPath = `/projects/${encodeURIComponent(incomingProjectId)}/events${url.search}`
    const target = new URL(targetPath, coreOrigin)
    const timer = setTimeout(() => {
      state.connectTimedOut = true
      controller.abort()
    }, connectTimeoutMs)
    timer.unref?.()

    try {
      let upstream: Response
      try {
        // Deliberately forward no caller cookies, authorization, or other headers.
        upstream = await fetch(target, {
          method: 'GET',
          redirect: 'error',
          headers: { accept: 'text/event-stream' },
          signal: controller.signal,
        })
      } catch (error: unknown) {
        if (!state.clientClosed && !response.destroyed) {
          sendLocalError(response, state.connectTimedOut ? 504 : 502,
            state.connectTimedOut ? 'CORE_EVENT_CONNECT_TIMEOUT' : 'CORE_EVENT_TRANSPORT_UNAVAILABLE',
            state.connectTimedOut ? 'Local Core event stream did not connect before the timeout.' : 'Local Core event stream is unavailable.')
        }
        return true
      } finally {
        clearTimeout(timer)
      }

      if (controller.signal.aborted || response.destroyed) {
        await upstream.body?.cancel().catch(() => undefined)
        return true
      }

      // Scope the relay to the configured isolated project. For a foreign id,
      // let Core produce its authoritative 404; if that Core unexpectedly has
      // the project, close it without exposing its event stream.
      if (incomingProjectId !== projectId && upstream.ok) {
        await upstream.body?.cancel().catch(() => undefined)
        sendLocalError(response, 404, 'NOT_FOUND', 'Project not found.')
        return true
      }

      const contentType = upstream.headers.get('content-type') ?? ''
      if (upstream.status === 200 && contentType.toLowerCase().split(';', 1)[0]?.trim() === 'text/event-stream') {
        if (upstream.body === null) {
          sendLocalError(response, 502, 'CORE_EVENT_STREAM_INVALID', 'Local Core returned an empty event stream.')
          return true
        }
        response.writeHead(200, {
          'content-type': contentType,
          'cache-control': upstream.headers.get('cache-control')?.includes('no-transform')
            ? upstream.headers.get('cache-control')!
            : 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': upstream.headers.get('x-accel-buffering') ?? 'no',
        })
        response.flushHeaders()
      } else {
        // Preserve Core's non-200 status and response bytes. A 200 that is not
        // SSE is a protocol failure, never advertised as an event stream.
        if (upstream.status === 200) {
          await upstream.body?.cancel().catch(() => undefined)
          sendLocalError(response, 502, 'CORE_EVENT_STREAM_INVALID', 'Local Core did not return text/event-stream.')
          return true
        }
        response.writeHead(upstream.status, nonSseHeaders(upstream))
        response.flushHeaders()
      }

      const reader = upstream.body?.getReader()
      if (reader === undefined) {
        response.end()
        return true
      }
      state.reader = reader
      try {
        await pumpBytes(reader, response, controller.signal)
        if (!response.destroyed && !response.writableEnded) response.end()
      } catch {
        if (!response.destroyed && !response.writableEnded) response.end()
      } finally {
        state.reader = undefined
        try { reader.releaseLock() } catch { /* cancelled stream */ }
      }
      return true
    } finally {
      clearTimeout(timer)
      request.off('aborted', closeClient)
      response.off('close', onResponseClose)
      response.off('error', closeClient)
      active.delete(state)
    }
  }

  const dispose = async (): Promise<void> => {
    if (disposed) return
    disposed = true
    const cancellation = [...active].map(async (state) => {
      state.controller.abort()
      await state.reader?.cancel().catch(() => undefined)
      if (!state.response.destroyed && !state.response.writableEnded) {
        if (state.response.headersSent) state.response.end()
        else state.response.destroy()
      }
    })
    await Promise.all(cancellation)
  }

  return { handle, dispose }
}
