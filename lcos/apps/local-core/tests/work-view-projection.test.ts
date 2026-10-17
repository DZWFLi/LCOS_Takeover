import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { BridgeResultEnvelopeV0, BridgeRuntimePort, BridgeTaskEnvelopeV0, BridgeTaskIdentity } from '../src/runtime-adapter.js'
import { ContextManifestService } from '../src/context-manifest-service.js'
import { ConversationIdentityService } from '../src/conversation-identity-service.js'
import { ConversationWorkViewProjectionService } from '../src/conversation-work-view-projection-service.js'
import { ConversationContinuationService } from '../src/conversation-continuation-service.js'
import { SqliteMetadataRepository } from '../src/metadata-repository.js'
import { ProjectEventHub } from '../src/project-events/project-event-hub.js'
import { ReceiverRuntimeService } from '../src/receiver-runtime-service.js'
import { RuntimeAdapterService } from '../src/runtime-adapter.js'
import { RuntimeApplicationService } from '../src/runtime-application-service.js'
import { RuntimeResultIngestionService } from '../src/runtime-result-ingestion.js'
import { RuntimeReviewService } from '../src/runtime-review-service.js'
import { SessionLifecycleService } from '../src/session-lifecycle-service.js'
import { createMvpSampleSnapshot } from '../src/mvp-sample-project.js'
import { createLocalCoreServer, type LocalCoreServer } from '../src/server.js'
import { forwardAcpPermissionRequestToCore } from '../../../huabu/apps/server/src/modules/agent/acp/provider-run-event-sink.js'

const cleanup: string[] = []
const repositories: SqliteMetadataRepository[] = []
const servers: LocalCoreServer[] = []
const now = '2026-09-12T00:00:00.000Z'

class FakeBridge implements BridgeRuntimePort {
  answeredInputs: Array<{ taskId: string; requestId: string }> = []
  async createTask(envelope: BridgeTaskEnvelopeV0): Promise<BridgeTaskIdentity> {
    return { taskId: `task-${envelope.lcosRunId}`, lcosRunId: envelope.lcosRunId, status: 'assigned', requestFingerprint: envelope.requestFingerprint, contractVersion: envelope.contractVersion }
  }
  async findTaskByRunId(): Promise<BridgeTaskIdentity | undefined> { return undefined }
  async getResult(): Promise<BridgeResultEnvelopeV0 | undefined> { return undefined }
  async answerInput(taskId: string, response: { readonly requestId: string }): Promise<void> {
    this.answeredInputs.push({ taskId, requestId: response.requestId })
  }
  async cancelTask(): Promise<void> { /* noop */ }
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'lcos-work-view-'))
  cleanup.push(root)
  const graph = createMvpSampleSnapshot(join(root, 'project'), now)
  const metadata = new SqliteMetadataRepository(join(root, 'metadata.sqlite'))
  repositories.push(metadata)
  metadata.save(graph)
  const events = new ProjectEventHub()
  const projectId = String(graph.project.id)
  const receivers = new ReceiverRuntimeService(metadata, events)
  const conversation = receivers.connectConversation({
    projectId,
    conversationRef: 'work-view-target',
    executorId: 'executor-1',
    provider: 'codex',
    label: '工作台目标会话',
  })
  const lifecycle = new SessionLifecycleService(metadata, events)
  // 最小会话投影 stub：只验证聚合 contentStatus 派生，不引入完整 import 机制。
  const conversationsStub = {
    getProjection: (_projectId: string, sessionId: string) =>
      sessionId === 'session-1'
        ? { session: { schemaVersion: 1, id: 'session-1', projectId, workspaceId: null, createdAt: now, updatedAt: now } }
        : undefined,
  } as never
  const identity = new ConversationIdentityService(metadata, conversationsStub, lifecycle, events)
  const continuation = new ConversationContinuationService(metadata, events)
  const workView = new ConversationWorkViewProjectionService(metadata, identity, continuation)
  // 带 receiverRef 的 Run 创建链（Work View attention section 数据源）。
  const review = new RuntimeReviewService(metadata, () => now, () => 'retry-one')
  let idSequence = 0
  const bridge = new FakeBridge()
  const runtimeAdapter = new RuntimeAdapterService(metadata, bridge, 'mvp-fast-build', () => now)
  const runtimeApplication = new RuntimeApplicationService(
    metadata,
    new ContextManifestService(metadata),
    runtimeAdapter,
    new RuntimeResultIngestionService(metadata, bridge, () => now),
    review,
    () => now,
    () => idSequence++ === 0 ? 'run-one' : `run-one-${idSequence}`,
  )
  return { root, metadata, projectId, conversationId: conversation.id, identity, continuation, workView, runtimeApplication, runtimeAdapter, graph }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
  for (const repository of repositories.splice(0)) {
    try { repository.close() } catch { /* already closed */ }
  }
  for (const path of cleanup.splice(0)) void rm(path, { recursive: true, force: true, maxRetries: 3 }).catch(() => { /* best effort */ })
})

describe('ConversationWorkViewProjectionService（T6 聚合）', () => {
  it('returns identity-only aggregate when no import session is linked (honest contentStatus)', async () => {
    const { workView, projectId, conversationId } = await setup()
    const value = workView.get(projectId, conversationId)
    expect(value).toBeDefined()
    expect(value?.connectedConversation.id).toBe(conversationId)
    expect(value?.identity?.connectedConversation.id).toBe(conversationId)
    expect(value?.contentStatus).toBe('identity_only')
    expect(value?.runs).toEqual([])
    expect(value?.operations).toEqual([])
  })

  it('returns content_pending after a session is linked; reach stays present', async () => {
    const { workView, identity, projectId, conversationId } = await setup()
    identity.linkSession(projectId, conversationId, 'session-1')
    const value = workView.get(projectId, conversationId)
    expect(value?.contentStatus).toBe('content_pending')
    expect(value?.identity?.conversationSession?.id).toBe('session-1')
    expect(value?.reach).toBeDefined()
  })

  it('lists the conversation-linked run (receiverRef) in the aggregate runs section', async () => {
    const { workView, runtimeApplication, projectId, conversationId, graph } = await setup()
    const target = graph.artifacts.find((artifact) => artifact.kind === 'markdown')!
    const created = await runtimeApplication.create(String(graph.project.id), {
      instruction: 'Continue the script work.',
      outputIntent: 'revise',
      targetArtifactId: String(target.id),
      workspaceId: String(graph.workspaces[0]!.id),
      receiverRef: { connectedConversationId: conversationId },
    })
    const value = workView.get(projectId, conversationId)
    expect(value?.runs.map((run) => run.runId)).toContain(String(created.review.run.id))
    expect(value?.runs[0]?.status).toBeDefined()
  })

  it('lists only continuation operations belonging to this conversation', async () => {
    const { workView, continuation, projectId, conversationId } = await setup()
    continuation.submit({
      schemaVersion: 1,
      operationId: 'op-a',
      projectId,
      connectedConversationId: conversationId,
      mode: 'continue_existing',
      contextInheritance: 'inherit',
      checkout: 'shared',
      provider: 'codex',
    })
    const value = workView.get(projectId, conversationId)
    expect(value?.operations.map((op) => op.operationId)).toEqual(['op-a'])
  })

  it('returns undefined for a missing connected conversation', async () => {
    const { workView, projectId } = await setup()
    expect(workView.get(projectId, 'ghost-conv')).toBeUndefined()
  })
})

describe('受控 waiting Run → Work View 回答 → 同一 Run 继续执行（真实 HTTP）', () => {
  it('provider event → durable waiting_input → Work View → existing answer route resumes the same Run', async () => {
    const { root, runtimeApplication, runtimeAdapter, projectId, conversationId, graph } = await setup()
    const providerAnswers: Array<{ runId: string; taskId: string; requestId: string; selectedOptions: readonly string[] }> = []
    const providerInputPort = {
      answerProviderInput: async (answeredRunId: string, taskId: string, response: { readonly requestId: string; readonly selectedOptions?: readonly string[] }) => {
        providerAnswers.push({
          runId: answeredRunId,
          taskId,
          requestId: response.requestId,
          selectedOptions: response.selectedOptions ?? [],
        })
        return true
      },
    }
    runtimeAdapter.attachProviderInputResponsePort(providerInputPort)
    const target = graph.artifacts.find((artifact) => artifact.kind === 'markdown')!
    const created = await runtimeApplication.create(String(graph.project.id), {
      instruction: '分析当前资料。',
      outputIntent: 'revise',
      targetArtifactId: String(target.id),
      workspaceId: String(graph.workspaces[0]!.id),
      receiverRef: { connectedConversationId: conversationId },
    })
    const runId = String(created.review.run.id)
    await runtimeApplication.dispatch(runId)
    let db = repositories[repositories.length - 1]!

    let server = createLocalCoreServer({ metadataRepository: db, runtimeApplicationService: runtimeApplication })
    servers.push(server)
    let address = await server.start()
    let baseUrl = `http://127.0.0.1:${address.port}`
    const headers = { 'content-type': 'application/json' }

    const correlation = { lcosRunId: runId, externalTaskId: `task-${runId}` }
    const acpPermissionRequest = {
      requestId: 'input-wv-1',
      toolCall: { title: '按方案 A 还是 B 继续？' },
      options: [
        { optionId: 'A', name: '方案 A', kind: 'allow_once' as const },
        { optionId: 'B', name: '方案 B', kind: 'reject_once' as const },
      ],
    }
    // Fixture starts at the same ACP permission_request value emitted by the
    // real AcpAgentClient notifier; Huabu's production sink performs the HTTP
    // normalization and Core correlation check.
    await forwardAcpPermissionRequestToCore(baseUrl, 'unused-with-open-test-server', correlation, acpPermissionRequest)

    // 同一 provider event replay 不新增第二个请求，也不重复发 waiting event。
    await forwardAcpPermissionRequestToCore(baseUrl, 'unused-with-open-test-server', correlation, acpPermissionRequest)
    expect(db.listRunInputRequests(runId)).toHaveLength(1)
    expect(db.getRunEvents(created.review.run.id).filter((event) => event.type === 'run.waiting_input')).toHaveLength(1)

    const trimmedReplay = await fetch(`${baseUrl}/runtime/provider-events`, {
      method: 'POST', headers, body: JSON.stringify({
        contractVersion: 'provider-run-event-v1',
        type: 'waiting_input',
        correlation: { lcosRunId: ` ${runId} `, externalTaskId: ` task-${runId} ` },
        request: {
          requestId: ' input-wv-1 ',
          prompt: ' 按方案 A 还是 B 继续？ ',
          options: [' A ', ' B '],
          allowFreeText: false,
        },
      }),
    })
    expect(trimmedReplay.status).toBe(200)
    expect(db.listRunInputRequests(runId)).toHaveLength(1)

    const emptyCorrelation = await fetch(`${baseUrl}/runtime/provider-events`, {
      method: 'POST', headers, body: JSON.stringify({
        contractVersion: 'provider-run-event-v1',
        type: 'waiting_input',
        correlation: { lcosRunId: runId, externalTaskId: '   ' },
        request: {
          requestId: 'input-empty-correlation',
          prompt: '继续？',
          options: ['A'],
          allowFreeText: false,
        },
      }),
    })
    expect(emptyCorrelation.status).toBe(400)

    // run/task 任一 correlation 不匹配都 fail-close。
    await expect(forwardAcpPermissionRequestToCore(
      baseUrl,
      'unused-with-open-test-server',
      { lcosRunId: runId, externalTaskId: 'task-for-another-run' },
      { ...acpPermissionRequest, requestId: 'input-wv-wrong' },
    )).rejects.toThrow('Local Core rejected ACP permission_request (409)')
    expect(db.listRunInputRequests(runId)).toHaveLength(1)

    // 1) Work View 聚合列出 waiting run
    const wv1 = await fetch(`${baseUrl}/projects/${projectId}/connected-conversations/${conversationId}/work-view`)
    const body1 = await wv1.json() as { value: { runs: Array<{ runId: string; status: string }> } }
    expect(body1.value.runs.find((run) => run.runId === runId)?.status).toBe('waiting_input')

    // Core restart 后 pending request 与 Work View 投影仍从 SQLite 恢复。
    await server.close()
    servers.splice(servers.indexOf(server), 1)
    db.close()
    repositories.splice(repositories.indexOf(db), 1)
    db = new SqliteMetadataRepository(join(root, 'metadata.sqlite'))
    repositories.push(db)
    const restartedBridge = new FakeBridge()
    const restartedReview = new RuntimeReviewService(db, () => now, () => 'retry-after-reload')
    const restartedAdapter = new RuntimeAdapterService(db, restartedBridge, 'mvp-fast-build', () => now)
    restartedAdapter.attachProviderInputResponsePort({ answerProviderInput: async () => false })
    const restartedApplication = new RuntimeApplicationService(
      db,
      new ContextManifestService(db),
      restartedAdapter,
      new RuntimeResultIngestionService(db, restartedBridge, () => now),
      restartedReview,
      () => now,
      () => 'after-reload',
    )
    server = createLocalCoreServer({ metadataRepository: db, runtimeApplicationService: restartedApplication })
    servers.push(server)
    address = await server.start()
    baseUrl = `http://127.0.0.1:${address.port}`
    const reloadedWorkView = await fetch(`${baseUrl}/projects/${projectId}/connected-conversations/${conversationId}/work-view`)
    const reloadedBody = await reloadedWorkView.json() as { value: { runs: Array<{ runId: string; status: string }> } }
    expect(reloadedBody.value.runs.find((run) => run.runId === runId)?.status).toBe('waiting_input')

    // 2) 读题
    const questionResponse = await fetch(`${baseUrl}/runs/${runId}/input-request`)
    expect(questionResponse.status).toBe(200)
    const question = await questionResponse.json() as { value: { question: string; requestId: string } }
    expect(question.value.question).toContain('方案 A 还是 B')
    expect(db.getRunInputRequest(question.value.requestId)?.responseTarget).toBe('huabu-acp')

    // Huabu restart / lost owner is an honest unresolved outcome: the Run and
    // pending request stay waiting instead of falling through to Bridge and
    // pretending the suspended ACP turn resumed.
    const lostOwnerResponse = await fetch(`${baseUrl}/runs/${runId}/input-request`, {
      method: 'POST', headers, body: JSON.stringify({ requestId: question.value.requestId, selectedOptions: ['A'] }),
    })
    const lostOwnerBody = await lostOwnerResponse.json() as { value: { providerError?: { code: string } } }
    expect(lostOwnerResponse.status).toBe(200)
    expect(lostOwnerBody.value.providerError?.code).toBe('PROVIDER_INPUT_NOT_FOUND')
    expect(db.getRun(runId)?.status).toBe('waiting_input')
    expect(db.getRunInputRequest(question.value.requestId)?.status).toBe('pending')
    expect(restartedBridge.answeredInputs).toEqual([])

    restartedAdapter.attachProviderInputResponsePort(providerInputPort)

    // 3) 回答原 Run
    const answerResponse = await fetch(`${baseUrl}/runs/${runId}/input-request`, {
      method: 'POST', headers, body: JSON.stringify({ requestId: question.value.requestId, selectedOptions: ['A'] }),
    })
    expect(answerResponse.status).toBe(200)
    expect(providerAnswers).toEqual([{
      runId,
      taskId: `task-${runId}`,
      requestId: 'input-wv-1',
      selectedOptions: ['A'],
    }])
    expect(restartedBridge.answeredInputs).toEqual([])

    const sameAnswerReplay = await fetch(`${baseUrl}/runs/${runId}/input-request`, {
      method: 'POST', headers, body: JSON.stringify({ requestId: question.value.requestId, selectedOptions: ['A'] }),
    })
    expect(sameAnswerReplay.status).toBe(200)
    expect(providerAnswers).toHaveLength(1)

    const conflictingAnswer = await fetch(`${baseUrl}/runs/${runId}/input-request`, {
      method: 'POST', headers, body: JSON.stringify({ requestId: question.value.requestId, selectedOptions: ['B'] }),
    })
    expect(conflictingAnswer.status).toBe(409)

    // 4) 同一 Run 继续执行：waiting_input → queued（runId 不变）
    const wv2 = await fetch(`${baseUrl}/projects/${projectId}/connected-conversations/${conversationId}/work-view`)
    const body2 = await wv2.json() as { value: { runs: Array<{ runId: string; status: string }> } }
    const resumed = body2.value.runs.find((run) => run.runId === runId)
    expect(resumed?.status).toBe('queued')
    expect(resumed?.runId).toBe(runId)
  })
})

describe('GET /projects/:pid/connected-conversations/:cid/work-view（partial 200）', () => {
  it('serves identity-only aggregate with 200', async () => {
    const { root } = await setup()
    const databasePath = join(root, 'metadata.sqlite')
    repositories.forEach((repo) => { try { repo.close() } catch { /* noop */ } })
    repositories.length = 0

    const metadata = new SqliteMetadataRepository(databasePath)
    repositories.push(metadata)
    const graph = createMvpSampleSnapshot(join(root, 'project-http'), now)
    metadata.save(graph)
    const httpProjectId = String(graph.project.id)
    const events = new ProjectEventHub()
    const receivers = new ReceiverRuntimeService(metadata, events)
    const conversation = receivers.connectConversation({
      projectId: httpProjectId, conversationRef: 'http-target', executorId: 'e', provider: 'codex', label: 'HTTP 工作台',
    })

    const server = createLocalCoreServer({ metadataRepository: metadata })
    servers.push(server)
    const address = await server.start()
    const baseUrl = `http://127.0.0.1:${address.port}`
    const response = await fetch(`${baseUrl}/projects/${httpProjectId}/connected-conversations/${conversation.id}/work-view`)
    expect(response.status).toBe(200)
    const body = await response.json() as { value: { contentStatus: string; connectedConversationId: string; runs: unknown[]; operations: unknown[] } }
    expect(body.value.connectedConversationId).toBe(conversation.id)
    expect(body.value.contentStatus).toBe('identity_only')
    expect(body.value.runs).toEqual([])
    expect(body.value.operations).toEqual([])

    const missing = await fetch(`${baseUrl}/projects/${httpProjectId}/connected-conversations/ghost/work-view`)
    expect(missing.status).toBe(404)
  })
})
