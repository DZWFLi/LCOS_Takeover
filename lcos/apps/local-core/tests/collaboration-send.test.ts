import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { ConversationImportService } from '../src/conversation-import-service.js'
import { ConversationContinuationService } from '../src/conversation-continuation-service.js'
import { ProjectEventHub } from '../src/project-events/project-event-hub.js'
import { ReceiverRuntimeService } from '../src/receiver-runtime-service.js'
import { SqliteMetadataRepository } from '../src/metadata-repository.js'
import { createMvpSampleSnapshot } from '../src/mvp-sample-project.js'
import { createLocalCoreServer, type LocalCoreServer } from '../src/server.js'
import { DevFakeAgentletTransportV1 } from '../src/dev-fake-agentlet-transport.js'

const roots: string[] = []
const repositories: SqliteMetadataRepository[] = []
const importers: ConversationImportService[] = []
const servers: LocalCoreServer[] = []
const previousTransport = process.env.LCOS_RECOVERY_TRANSPORT

afterEach(async () => {
  if (previousTransport === undefined) delete process.env.LCOS_RECOVERY_TRANSPORT
  else process.env.LCOS_RECOVERY_TRANSPORT = previousTransport
  await Promise.all(servers.splice(0).map((server) => server.close()))
  for (const importer of importers.splice(0)) importer.close()
  for (const repository of repositories.splice(0)) repository.close()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup() {
  process.env.LCOS_RECOVERY_TRANSPORT = 'fake'
  const root = await mkdtemp(join(tmpdir(), 'lcos-collaboration-send-'))
  roots.push(root)
  const graph = createMvpSampleSnapshot(join(root, 'project'), '2026-09-20T00:00:00.000Z')
  const metadata = new SqliteMetadataRepository(join(root, 'metadata.sqlite'))
  repositories.push(metadata)
  metadata.save(graph)
  const events = new ProjectEventHub()
  const projectId = String(graph.project.id)
  const receiver = new ReceiverRuntimeService(metadata, events)
  const conversation = receiver.connectConversation({ projectId, conversationRef: 'provider-session-1', executorId: 'agentlet-1', provider: 'codex', label: '真实会话' })
  const importer = new ConversationImportService(metadata)
  importers.push(importer)
  const imported = await importer.importManual(projectId, {
    title: '已绑定会话', scopeId: String(graph.scopes[0]!.id),
    entries: [{ role: 'user', contentText: '之前的问题' }, { role: 'assistant', contentText: '之前的回答' }],
  })
  metadata.linkConnectedConversationSession(projectId, conversation.id, imported.session.id)
  const continuation = new ConversationContinuationService(metadata, events)
  const operation = continuation.submit({
    schemaVersion: 1, operationId: 'op-send', projectId, connectedConversationId: conversation.id,
    mode: 'continue_existing', contextInheritance: 'inherit', checkout: 'shared', provider: 'codex',
    runtimeThreadId: `core-conversation-${conversation.id}`,
  })
  continuation.advanceStep(projectId, operation.projection.operationId, {
    step: 'external_create', outcome: 'confirmed', externalEvidence: {
      schemaVersion: 1, provider: 'codex', externalSessionId: 'provider-session-1', transportSessionId: 'transport-session-1',
      threadId: `core-conversation-${conversation.id}`, correlationId: 'op-send', createdAt: '2026-09-20T00:00:01.000Z',
    },
  })
  const server = createLocalCoreServer({ metadataRepository: metadata })
  servers.push(server)
  const address = await server.start()
  return { baseUrl: `http://${address.host}:${address.port}`, metadata, importer, projectId, conversationId: conversation.id, sessionId: imported.session.id, continuation }
}

async function send(baseUrl: string, projectId: string, conversationId: string, input: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/projects/${projectId}/connected-conversations/${conversationId}/collaboration-send`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  })
  return { status: response.status, body: await response.json() as { ok?: boolean; value?: { messages?: unknown[] }; error?: { message?: string } } }
}

describe('collaboration-send：原会话纵切', () => {
  it('成功发送后写入 canonical Conversation，并出现在 collaboration timeline；messageId 重试幂等', async () => {
    const { baseUrl, projectId, conversationId, sessionId, importer } = await setup()
    const input = { messageId: 'turn-1', continuationOperationId: 'op-send', text: '继续刚才的方案' }
    const first = await send(baseUrl, projectId, conversationId, input)
    expect(first.status).toBe(200)
    const second = await send(baseUrl, projectId, conversationId, input)
    expect(second.status).toBe(200)
    expect(DevFakeAgentletTransportV1.lastInstance?.promptCalls).toBe(1)
    const messages = importer.getMessages(sessionId, { limit: 20 })
    expect(messages.filter((message) => message.sourceEventId?.startsWith('turn-1:')).map((message) => message.role)).toEqual(['user', 'assistant'])
    const timeline = await fetch(`${baseUrl}/projects/${projectId}/connected-conversations/${conversationId}/collaboration-timeline`).then((response) => response.json()) as { value: { kind: string; refs?: { messageId?: string } }[] }
    expect(timeline.value.filter((item) => item.kind === 'user_message' || item.kind === 'agent_message')).toHaveLength(4)
    expect(timeline.value.some((item) => item.refs?.messageId?.includes('turn-1'))).toBe(true)
  })

  it('operation 不属于目标 connected conversation 时拒绝，且不写入消息', async () => {
    const { baseUrl, projectId, conversationId, continuation, sessionId, metadata, importer } = await setup()
    const other = new ReceiverRuntimeService(metadata, new ProjectEventHub()).connectConversation({ projectId, conversationRef: 'other-session', executorId: 'agentlet-1', provider: 'codex' })
    continuation.submit({ schemaVersion: 1, operationId: 'op-other', projectId, connectedConversationId: other.id, mode: 'continue_existing', contextInheritance: 'inherit', checkout: 'shared', provider: 'codex' })
    const result = await send(baseUrl, projectId, conversationId, { messageId: 'turn-mismatch', continuationOperationId: 'op-other', text: '不应发送' })
    expect(result.status).toBe(409)
    const messages = importer.getMessages(sessionId, { limit: 20 })
    expect(messages.some((message) => message.sourceEventId?.startsWith('turn-mismatch:'))).toBe(false)
  })

  it('provider outcome_unknown 不写入 Core 消息', async () => {
    const { baseUrl, projectId, conversationId, continuation, sessionId, importer } = await setup()
    continuation.submit({ schemaVersion: 1, operationId: 'op-unknown', projectId, connectedConversationId: conversationId, mode: 'continue_existing', contextInheritance: 'inherit', checkout: 'shared', provider: 'codex' })
    continuation.advanceStep(projectId, 'op-unknown', { step: 'external_create', outcome: 'outcome_unknown' })
    const result = await send(baseUrl, projectId, conversationId, { messageId: 'turn-unknown', continuationOperationId: 'op-unknown', text: '不应重复发送' })
    expect(result.status).toBe(409)
    const messages = importer.getMessages(sessionId, { limit: 20 })
    expect(messages.some((message) => message.sourceEventId?.startsWith('turn-unknown:'))).toBe(false)
  })

  it('已有 pending reservation 时不再次调用 provider', async () => {
    const { baseUrl, projectId, conversationId, importer, sessionId } = await setup()
    importer.reserveContinuationPrompt(projectId, sessionId, { messageId: 'turn-pending', userText: '外部结果未知' })
    const result = await send(baseUrl, projectId, conversationId, { messageId: 'turn-pending', continuationOperationId: 'op-send', text: '外部结果未知' })
    expect(result.status).toBe(409)
    expect(DevFakeAgentletTransportV1.lastInstance?.promptCalls).toBe(0)
  })

  it('未显式绑定 conversationSession 时 fail-close', async () => {
    const { baseUrl, projectId, conversationId, metadata } = await setup()
    metadata.linkConnectedConversationSession(projectId, conversationId, null)
    const result = await send(baseUrl, projectId, conversationId, { messageId: 'turn-no-session', continuationOperationId: 'op-send', text: '不应发送' })
    expect(result.status).toBe(409)
  })

  it('targetRefs 非空时 fail-close，不静默丢弃上下文引用', async () => {
    const { baseUrl, projectId, conversationId, importer, sessionId } = await setup()
    const result = await send(baseUrl, projectId, conversationId, { messageId: 'turn-refs', continuationOperationId: 'op-send', text: '带引用发送', targetRefs: ['artifact:a'] })
    expect(result.status).toBe(409)
    expect(importer.getMessages(sessionId, { limit: 20 }).some((message) => message.sourceEventId?.startsWith('turn-refs:'))).toBe(false)
  })

  it('typed orderedReferences 在 Huabu attach unsupported 时 fail-close，并按 messageId 持久 receipt', async () => {
    const { baseUrl, projectId, conversationId, sessionId, importer, continuation } = await setup()
    const first = await send(baseUrl, projectId, conversationId, {
      messageId: 'turn-context-a',
      continuationOperationId: 'op-send',
      text: '带第一组引用发送',
      orderedReferences: [{ order: 0, ref: { type: 'artifact', artifactId: 'artifact-a' } }],
    })
    expect(first.status).toBe(409)
    expect(DevFakeAgentletTransportV1.lastInstance?.promptCalls).toBe(0)
    const firstProjection = continuation.read(projectId, 'op-send')
    expect(firstProjection?.promptReceipts?.find((receipt) => receipt.messageId === 'turn-context-a')?.receipt).toMatchObject({
      action: 'attach_context',
      outcome: 'unsupported',
      contextAttached: false,
    })

    const second = await send(baseUrl, projectId, conversationId, {
      messageId: 'turn-context-b',
      continuationOperationId: 'op-send',
      text: '带第二组引用发送',
      orderedReferences: [{ order: 0, ref: { type: 'view', viewId: 'view-b' } }],
    })
    expect(second.status).toBe(409)
    const secondProjection = continuation.read(projectId, 'op-send')
    expect(secondProjection?.promptReceipts?.map((receipt) => receipt.messageId)).toEqual(['turn-context-a', 'turn-context-b'])
    expect(importer.getMessages(sessionId, { limit: 20 }).some((message) => message.sourceEventId?.startsWith('turn-context-'))).toBe(false)
  })

  it('provider 明确失败会释放 pending reservation，允许同 messageId 安全重试', async () => {
    const { baseUrl, projectId, conversationId } = await setup()
    DevFakeAgentletTransportV1.lastInstance?.failNextPromptOnce()
    const input = { messageId: 'turn-known-failure', continuationOperationId: 'op-send', text: '失败后重试' }
    expect((await send(baseUrl, projectId, conversationId, input)).status).toBe(409)
    expect((await send(baseUrl, projectId, conversationId, input)).status).toBe(200)
    expect(DevFakeAgentletTransportV1.lastInstance?.promptCalls).toBe(2)
  })

  it('provider 已接受但 assistant 为空时保留 reservation，重试不再次发送', async () => {
    const { baseUrl, projectId, conversationId } = await setup()
    DevFakeAgentletTransportV1.lastInstance?.sendEmptyPromptOnce()
    const input = { messageId: 'turn-empty-response', continuationOperationId: 'op-send', text: '响应缺失后恢复' }
    expect((await send(baseUrl, projectId, conversationId, input)).status).toBe(409)
    expect((await send(baseUrl, projectId, conversationId, input)).status).toBe(409)
    expect(DevFakeAgentletTransportV1.lastInstance?.promptCalls).toBe(1)
  })
})
