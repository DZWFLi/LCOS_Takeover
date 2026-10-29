import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'

import { HuabuAgentletContinuationAdapterV1 } from '../src/huabu-agentlet-continuation-adapter.js'
import { HuabuAgentletHostTransportV1, HuabuHostHttpError } from '../src/huabu-agentlet-host-transport.js'

interface RequestRecord {
  readonly method: string
  readonly url: string
  readonly authorization: string | undefined
  readonly body: unknown
}

class HostProtocolServer {
  readonly requests: RequestRecord[] = []
  private readonly server: Server
  private port = 0
  respond = true
  failureStatus = 0

  constructor() {
    this.server = createServer((request, response) => void this.handle(request, response))
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve))
    const address = this.server.address()
    if (address === null || typeof address === 'string') throw new Error('Host test server did not bind.')
    this.port = address.port
  }

  async close(): Promise<void> {
    this.server.closeAllConnections?.()
    await new Promise<void>((resolve) => {
      if (!this.server.listening) {
        resolve()
        return
      }
      this.server.close(() => resolve())
    })
  }

  url(): string { return `http://127.0.0.1:${this.port}` }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const raw = Buffer.concat(chunks).toString('utf8')
    const body = raw === '' ? undefined : JSON.parse(raw) as unknown
    this.requests.push({ method: request.method ?? '', url: request.url ?? '', authorization: request.headers.authorization, body })
    if (!this.respond) return
    response.setHeader('content-type', 'application/json')
    if (this.failureStatus !== 0) {
      response.statusCode = this.failureStatus
      response.end(JSON.stringify({ error: { code: 'bridge_not_mounted', message: 'Host unavailable' } }))
      return
    }
    const path = request.url ?? ''
    if (request.method === 'GET' && path.endsWith('/sessions')) {
      response.end(JSON.stringify({ agentletId: 'machine-a', agents: [{ sessionId: 'session-1', transportSessionId: 'session-1', externalSessionId: 'native-1', threadId: 'thread-1', appId: 'thread-1', pid: 42, cwd: 'E:/work', status: 'running' }] }))
      return
    }
    if (request.method === 'POST' && path.endsWith('/sessions')) {
      response.end(JSON.stringify({ agentletId: 'machine-a', sessionId: 'session-2', pid: 43, cwd: 'E:/work' }))
      return
    }
    if (request.method === 'GET' && path.endsWith('/sessions/session-1')) {
      response.end(JSON.stringify({ agentletId: 'machine-a', sessionId: 'session-1', transportSessionId: 'session-1', externalSessionId: 'native-1', threadId: 'thread-1', appId: 'thread-1', pid: 42, cwd: 'E:/work', status: 'running' }))
      return
    }
    if (request.method === 'POST' && path.endsWith('/sessions/session-1/stop')) {
      response.end(JSON.stringify({ agentletId: 'machine-a', sessionId: 'session-1', stopped: true }))
      return
    }
    if (request.method === 'POST' && path.endsWith('/sessions/session-1/prompt')) {
      response.end(JSON.stringify({ agentletId: 'machine-a', threadId: 'thread-1', externalSessionId: 'native-1', transportSessionId: 'session-1', text: 'continued', stopReason: 'end_turn' }))
      return
    }
    if (request.method === 'POST' && path.endsWith('/continuation/input-request')) {
      response.end(JSON.stringify({ handled: true }))
      return
    }
    if (request.method === 'POST' && path.endsWith('/sessions/session-1/context-attachments')) {
      const input = body as { messageId: string; correlationId: string }
      response.end(JSON.stringify({ attachmentId: `attachment:${input.messageId}`, messageId: input.messageId, correlationId: input.correlationId }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ error: { code: 'session_not_found', message: 'missing' } }))
  }
}

let server: HostProtocolServer | undefined

afterEach(async () => {
  if (server !== undefined) {
    await server.close()
    server = undefined
  }
})

describe('HuabuAgentletHostTransportV1', () => {
  it('maps spawn/list/status/stop through the Host HTTP facade with bearer auth', async () => {
    server = new HostProtocolServer()
    await server.start()
    const transport = new HuabuAgentletHostTransportV1({
      hostBaseUrl: server.url(), agentletId: 'machine-a', authToken: 'host-token', spawnCommand: 'codex --acp', spawnCwd: 'E:/work',
    })

    const spawned = await transport.spawn({
      agentletId: 'machine-a', appId: 'op-2', threadId: 'thread-1',
      sessionId: 'session-1', externalSessionId: 'native-1',
    })
    const listed = await transport.list('machine-a')
    const status = await transport.getSession('machine-a', 'session-1')
    const stopped = await transport.stop({ agentletId: 'machine-a', sessionId: 'session-1' })

    expect(spawned).toMatchObject({ sessionId: 'session-2', pid: 43 })
    expect(listed.agents[0]).toMatchObject({ sessionId: 'session-1', externalSessionId: 'native-1', transportSessionId: 'session-1', threadId: 'thread-1' })
    expect(status).toMatchObject({ sessionId: 'session-1', externalSessionId: 'native-1', transportSessionId: 'session-1', threadId: 'thread-1', pid: 42 })
    expect(stopped.stopped).toBe(true)
    expect(server.requests).toHaveLength(4)
    expect(server.requests.every((request) => request.authorization === 'Bearer host-token')).toBe(true)
    expect(server.requests[0]?.body).toMatchObject({
      appId: 'op-2', threadId: 'thread-1', sessionId: 'session-1', externalSessionId: 'native-1',
      sessionSpec: { command: 'codex --acp', cwd: 'E:/work' },
    })
  })

  it('does not treat sendResource as prompt transport', async () => {
    server = new HostProtocolServer()
    await server.start()
    const transport = new HuabuAgentletHostTransportV1({ hostBaseUrl: server.url(), agentletId: 'machine-a' })
    const adapter = new HuabuAgentletContinuationAdapterV1(transport, { agentletId: 'machine-a' })
    const result = await adapter.send({
      operationId: 'op-send', correlationId: 'op-send', provider: 'codex', externalSessionId: 'session-1',
      payload: { text: 'continue' },
    })
    expect(result.outcome).toBe('unsupported')
    expect(result.error?.code).toBe('prompt_transport_not_wired')
    expect(server.requests).toHaveLength(0)
  })

  it('sends prompt through the canonical transport session and preserves both identities', async () => {
    server = new HostProtocolServer()
    await server.start()
    const transport = new HuabuAgentletHostTransportV1({ hostBaseUrl: server.url(), agentletId: 'machine-a' })
    const receipt = await transport.sendPrompt({ agentletId: 'machine-a', threadId: 'thread-1', runtimeScope: 'project-1', externalSessionId: 'native-1', transportSessionId: 'session-1', text: '继续' })

    expect(receipt).toMatchObject({ externalSessionId: 'native-1', transportSessionId: 'session-1', threadId: 'thread-1', text: 'continued' })
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]?.body).toEqual({ threadId: 'thread-1', runtimeScope: 'project-1', externalSessionId: 'native-1', text: '继续' })
  })

  it('returns a Run answer to the exact Huabu ACP input owner', async () => {
    server = new HostProtocolServer()
    await server.start()
    const transport = new HuabuAgentletHostTransportV1({ hostBaseUrl: server.url(), authToken: 'host-token' })

    await expect(transport.answerProviderInput('run-1', 'task-1', {
      requestId: 'permission-1',
      selectedOptions: ['allow-once'],
    })).resolves.toBe(true)

    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/acp/continuation/input-request',
      authorization: 'Bearer host-token',
      body: {
        correlation: { lcosRunId: 'run-1', externalTaskId: 'task-1' },
        requestId: 'permission-1',
        selectedOptions: ['allow-once'],
      },
    })
  })

  it('gets an explicit message-scoped attach receipt before forwarding the same manifest with the prompt', async () => {
    server = new HostProtocolServer()
    await server.start()
    const transport = new HuabuAgentletHostTransportV1({ hostBaseUrl: server.url(), agentletId: 'machine-a' })
    const orderedReferences = [{ order: 0, mode: 'summary' as const, ref: { type: 'artifact' as const, artifactId: 'artifact-1', revisionId: 'revision-1' } }]
    const contextResolution = [{ ...orderedReferences[0]!, artifactId: 'artifact-1', revisionId: 'revision-1', fileRecordId: 'file-1', contentHash: 'hash-1', title: 'Brief' }]
    const resolvedReferences = [{ ...orderedReferences[0]!, title: 'Brief', mimeType: 'text/plain' as const, text: 'UNIQUE-ATTACH-7429' }]
    const attached = await transport.attachContext({
      agentletId: 'machine-a', threadId: 'thread-1', externalSessionId: 'native-1', transportSessionId: 'session-1',
      messageId: 'message-1', correlationId: 'corr-1', orderedReferences, contextResolution,
    })
    expect(attached).toEqual({ attachmentId: 'attachment:message-1', messageId: 'message-1', correlationId: 'corr-1' })

    await transport.sendPrompt({
      agentletId: 'machine-a', threadId: 'thread-1', externalSessionId: 'native-1', transportSessionId: 'session-1', text: '继续',
      contextAttachment: { ...attached, orderedReferences, contextResolution, resolvedReferences },
    })
    expect(server.requests).toHaveLength(2)
    expect(server.requests[0]?.url).toContain('/context-attachments')
    expect(server.requests[0]?.body).toMatchObject({ orderedReferences, contextResolution })
    expect(JSON.stringify(server.requests[0]?.body)).not.toContain('UNIQUE-ATTACH-7429')
    expect(server.requests[1]?.body).toMatchObject({
      contextAttachment: { attachmentId: 'attachment:message-1', messageId: 'message-1', correlationId: 'corr-1', orderedReferences, contextResolution, resolvedReferences },
    })
  })

  it('classifies Host HTTP failures and timeout without pretending success', async () => {
    server = new HostProtocolServer()
    await server.start()
    const transport = new HuabuAgentletHostTransportV1({ hostBaseUrl: server.url(), agentletId: 'machine-a', timeoutMs: 20 })
    server.respond = false
    await expect(transport.list('machine-a')).rejects.toThrow(/timed out/)

    const missing = new HuabuAgentletHostTransportV1({ hostBaseUrl: server.url(), agentletId: 'machine-a', timeoutMs: 20 })
    server.respond = true
    server.failureStatus = 503
    await expect(missing.list('machine-a')).rejects.toBeInstanceOf(HuabuHostHttpError)
    server.failureStatus = 0
    await expect(missing.getSession('machine-a', 'missing')).resolves.toBeUndefined()
  })
})
