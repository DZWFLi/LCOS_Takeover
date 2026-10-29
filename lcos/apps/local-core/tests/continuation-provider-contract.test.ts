import { createHash } from 'node:crypto'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type {
  CapabilityClaimV1,
  ContinuityAttachBundleV1,
  ContinuationSubmitRequestV1,
} from '@local-creative-os/contracts'
import { continuationExternalEvidenceFromReceiptV1 } from '@local-creative-os/contracts'
import {
  classifyHuabuTransportErrorV1,
  HuabuAgentletContinuationAdapterV1,
  type HuabuAgentletSessionInfoV1,
  type HuabuAgentletTransportV1,
} from '../src/huabu-agentlet-continuation-adapter.js'
import { ConversationImportService } from '../src/conversation-import-service.js'
import { ConversationContinuationService } from '../src/conversation-continuation-service.js'
import { SqliteMetadataRepository } from '../src/metadata-repository.js'
import { ProjectEventHub } from '../src/project-events/project-event-hub.js'
import { ReceiverRuntimeService } from '../src/receiver-runtime-service.js'
import { createMvpSampleSnapshot } from '../src/mvp-sample-project.js'

const cleanup: string[] = []
const repositories: SqliteMetadataRepository[] = []

function bundleFixture(projectId: string): ContinuityAttachBundleV1 {
  const intent = {
    type: 'continue_work' as const,
    objectViewIds: [] as readonly string[],
    goal: '继续',
    constraints: [] as readonly string[],
    evidenceKeys: [] as readonly string[],
    suggestedSkillIds: [] as readonly string[],
    confidence: 0.5,
  }
  return {
    schemaVersion: 1,
    projectId,
    workspaceId: null,
    intent,
    contextPack: { schemaVersion: 0, projectId, workspaceId: null, intent, items: [], selectedCount: 0, pinnedCount: 0, relatedCount: 0 },
    skillTarget: { intentType: 'continue_work', supportingSkillIds: [], target: '', sideEffect: 'READ_ONLY', requiresApproval: false, reason: '' },
    selectedViewIds: [],
    sourceRefs: [],
    generatedAt: '2026-09-12T00:00:00.000Z',
  }
}

interface FakeTransportOverrides {
  readonly spawnError?: Error
  readonly spawnSessionId?: string
  readonly stopError?: Error
  readonly stopResult?: { readonly stopped: boolean }
  readonly sendError?: Error
  readonly sendPromptError?: Error
  readonly sendPromptResult?: { readonly externalSessionId: string; readonly transportSessionId: string; readonly threadId: string; readonly text?: string; readonly stopReason?: string }
  readonly attachContextError?: Error
  readonly attachContextResult?: { readonly attachmentId: string; readonly messageId: string; readonly correlationId: string }
  readonly getSessionResult?: HuabuAgentletSessionInfoV1 | undefined
  readonly listAgents?: readonly HuabuAgentletSessionInfoV1[]
  readonly probeClaims?: Readonly<Partial<Record<'createSession' | 'continueExisting' | 'attachContext' | 'send' | 'status' | 'cancel' | 'recoverExisting', CapabilityClaimV1>>>
}

class FakeHuabuTransport implements HuabuAgentletTransportV1 {
  readonly kind = 'fake'
  spawnCalls = 0
  readonly getSessionCalls: string[] = []
  readonly stopCalls: string[] = []
  readonly attachCalls: string[] = []
  readonly promptContexts: unknown[] = []
  private readonly overrides: FakeTransportOverrides

  constructor(overrides: FakeTransportOverrides = {}) {
    this.overrides = overrides
  }

  async spawn(_params: { readonly agentletId: string; readonly appId: string; readonly threadId?: string; readonly runtimeScope?: string; readonly sessionId?: string; readonly externalSessionId?: string }): Promise<{ readonly sessionId: string; readonly pid: number; readonly cwd?: string }> {
    this.spawnCalls += 1
    if (this.overrides.spawnError !== undefined) throw this.overrides.spawnError
    return { sessionId: this.overrides.spawnSessionId ?? 'fake-session-1', pid: 4242, cwd: '/tmp/fake' }
  }

  async stop(params: { readonly agentletId: string; readonly sessionId: string }): Promise<{ readonly stopped: boolean }> {
    this.stopCalls.push(params.sessionId)
    if (this.overrides.stopError !== undefined) throw this.overrides.stopError
    return this.overrides.stopResult ?? { stopped: true }
  }

  async list(_agentletId: string): Promise<{ readonly agents: readonly HuabuAgentletSessionInfoV1[] }> {
    return { agents: this.overrides.listAgents ?? [] }
  }

  async getSession(_agentletId: string, sessionId: string): Promise<HuabuAgentletSessionInfoV1 | undefined> {
    this.getSessionCalls.push(sessionId)
    if (this.overrides.getSessionResult !== undefined) return this.overrides.getSessionResult
    const agents = this.overrides.listAgents ?? []
    return agents.find((agent) => agent.sessionId === sessionId)
  }

  async sendResource(_params: { readonly agentletId: string; readonly sessionId: string; readonly text?: string; readonly resourceRef?: string }): Promise<void> {
    if (this.overrides.sendError !== undefined) throw this.overrides.sendError
  }

  async attachContext(params: { readonly agentletId: string; readonly threadId: string; readonly externalSessionId: string; readonly transportSessionId?: string; readonly messageId: string; readonly correlationId: string; readonly orderedReferences: readonly { readonly order: number; readonly ref: unknown }[]; readonly contextResolution: readonly unknown[] }): Promise<{ readonly attachmentId: string; readonly messageId: string; readonly correlationId: string }> {
    this.attachCalls.push(params.messageId)
    if (this.overrides.attachContextError !== undefined) throw this.overrides.attachContextError
    return this.overrides.attachContextResult ?? { attachmentId: `attachment:${params.messageId}`, messageId: params.messageId, correlationId: params.correlationId }
  }

  async sendPrompt(params: { readonly agentletId: string; readonly threadId: string; readonly runtimeScope?: string; readonly externalSessionId: string; readonly transportSessionId?: string; readonly text: string; readonly contextAttachment?: unknown }): Promise<{ readonly externalSessionId: string; readonly transportSessionId: string; readonly threadId: string; readonly text?: string; readonly stopReason?: string }> {
    this.promptContexts.push(params.contextAttachment)
    if (this.overrides.sendPromptError !== undefined) throw this.overrides.sendPromptError
    return this.overrides.sendPromptResult ?? { externalSessionId: 'native-1', transportSessionId: 'transport-1', threadId: 'thread-1', text: '已继续', stopReason: 'end_turn' }
  }

  async probe(): Promise<{ readonly session: Readonly<Partial<Record<'createSession' | 'continueExisting' | 'attachContext' | 'send' | 'status' | 'cancel' | 'recoverExisting', CapabilityClaimV1>>>; readonly limitations?: readonly string[] }> {
    return { session: this.overrides.probeClaims ?? {}, limitations: ['fake transport'] }
  }
}

afterEach(async () => {
  for (const repository of repositories.splice(0)) {
    try { repository.close() } catch { /* already closed */ }
  }
  for (const path of cleanup.splice(0)) void rm(path, { recursive: true, force: true, maxRetries: 3 }).catch(() => { /* best effort */ })
})

describe('HuabuAgentletContinuationAdapter probe（unknown 默认 + 证据来源）', () => {
  it('nativeFork/attachContext/isolatedWorktree/resolver stay unknown without an authoritative probe', async () => {
    const adapter = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport(), { adapterId: 'adapter-a' })
    const snapshot = await adapter.probe({ provider: 'huabu-agentlet', adapterId: 'adapter-a', probeId: 'probe-1' })
    expect(snapshot.session.nativeFullHistoryFork.value).toBe('unknown')
    expect(snapshot.session.attachContext.value).toBe('unknown')
    expect(snapshot.checkout.isolatedWorktree.value).toBe('unknown')
    expect(snapshot.checkout.resolver.value).toBe('unknown')
    expect(snapshot.session.createSession.value).toBe('unknown')
    expect(snapshot.limitations).toContain('fake transport')
  })

  it('declared probe results are honored and the snapshot is cached until force', async () => {
    const transport = new FakeHuabuTransport({ probeClaims: { createSession: { value: true, source: 'gateway_probe', observedAt: '2026-09-12T00:00:00.000Z' } } })
    const adapter = new HuabuAgentletContinuationAdapterV1(transport, { adapterId: 'adapter-a' })
    const first = await adapter.probe({ provider: 'huabu-agentlet', adapterId: 'adapter-a', probeId: 'probe-1' })
    expect(first.session.createSession.value).toBe(true)
    const second = await adapter.probe({ provider: 'huabu-agentlet', adapterId: 'adapter-a', probeId: 'probe-2' })
    expect(second.probeId).toBe('probe-1') // cached snapshot reused
    const forced = await adapter.probe({ provider: 'huabu-agentlet', adapterId: 'adapter-a', probeId: 'probe-3', force: true })
    expect(forced.probeId).toBe('probe-3')
  })
})

describe('adapter create / continue / send / status / cancel / recover（unknown 语义）', () => {
  it('createSession success returns external_created with a provider-native session identity', async () => {
    const adapter = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport(), { adapterId: 'adapter-a' })
    const receipt = await adapter.createSession({
      operationId: 'op-1', correlationId: 'corr-1', provider: 'codex', createVariant: 'blank', bundle: bundleFixture('p-1'),
    })
    expect(receipt.action).toBe('create')
    expect(receipt.outcome).toBe('external_created')
    expect(receipt.externalSessionId).toBe('fake-session-1')
    expect(receipt.retryAction).toBe('none')
  })

  it('createSession transport timeout → outcome_unknown + reconcile（绝不自动 retry create）', async () => {
    const adapter = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport({ spawnError: new Error('connect timed out after 3000ms') }), { adapterId: 'adapter-a' })
    const receipt = await adapter.createSession({
      operationId: 'op-1', correlationId: 'corr-1', provider: 'codex', createVariant: 'blank', bundle: bundleFixture('p-1'),
    })
    expect(receipt.outcome).toBe('outcome_unknown')
    expect(receipt.retryAction).toBe('reconcile')
    expect(receipt.error?.outcomeUnknown).toBe(true)
    expect(receipt.error?.retryable).toBe(false)
  })

  it('continueExisting resumes the same identity; identity-known failure is failed, not unknown', async () => {
    const adapter = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport(), { adapterId: 'adapter-a' })
    const ok = await adapter.continueExisting({
      operationId: 'op-2', correlationId: 'corr-2', provider: 'codex', externalSessionId: 'ext-1', bundle: bundleFixture('p-1'),
    })
    expect(ok.outcome).toBe('resumed')

    const failing = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport({ spawnError: new Error('session resume unavailable') }), { adapterId: 'adapter-a' })
    const bad = await failing.continueExisting({
      operationId: 'op-2', correlationId: 'corr-2', provider: 'codex', externalSessionId: 'ext-1', bundle: bundleFixture('p-1'),
    })
    expect(bad.outcome).toBe('failed')
    expect(bad.error?.outcomeUnknown).toBe(false)
  })

  it('nativeFork stays unsupported while message-scoped attach requires an exact owner and returns a provider receipt', async () => {
    const transport = new FakeHuabuTransport()
    const adapter = new HuabuAgentletContinuationAdapterV1(transport, { adapterId: 'adapter-a' })
    const fork = await adapter.nativeFork({
      operationId: 'op-3', correlationId: 'corr-3', provider: 'codex', sourceExternalSessionId: 'ext-1', bundle: bundleFixture('p-1'),
    })
    expect(fork.outcome).toBe('unsupported')
    expect(fork.degradedFromNativeFork).toBe(true)

    const attach = await adapter.attachContext({
      operationId: 'op-4', correlationId: 'corr-4', provider: 'codex', externalSessionId: 'ext-1', transportSessionId: 'transport-1', threadId: 'thread-1', messageId: 'message-1', orderedReferences: [{ order: 0, ref: { type: 'artifact', artifactId: 'artifact-1' } }], contextResolution: [{ order: 0, mode: 'full', ref: { type: 'artifact', artifactId: 'artifact-1' }, artifactId: 'artifact-1', revisionId: 'revision-1', fileRecordId: 'file-1', contentHash: 'hash-1', title: 'Brief' }], bundle: bundleFixture('p-1'),
    })
    expect(attach).toMatchObject({ outcome: 'attached', contextAttached: true, contextAttachmentId: 'attachment:message-1', messageId: 'message-1' })
    expect(transport.attachCalls).toEqual(['message-1'])
  })

  it('attach timeout is outcome_unknown and never falls through to prompt', async () => {
    const adapter = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport({ attachContextError: new Error('attach timed out') }), { adapterId: 'adapter-a' })
    const attach = await adapter.attachContext({
      operationId: 'op-4b', correlationId: 'corr-4b', provider: 'codex', externalSessionId: 'ext-1', threadId: 'thread-1', messageId: 'message-1', orderedReferences: [{ order: 0, ref: { type: 'artifact', artifactId: 'artifact-1' } }], contextResolution: [{ order: 0, mode: 'full', ref: { type: 'artifact', artifactId: 'artifact-1' }, artifactId: 'artifact-1', revisionId: 'revision-1', fileRecordId: 'file-1', contentHash: 'hash-1', title: 'Brief' }], bundle: bundleFixture('p-1'),
    })
    expect(attach).toMatchObject({ outcome: 'outcome_unknown', retryAction: 'reconcile', contextAttached: false, messageId: 'message-1' })
  })

  it('send is honest unsupported until the Huabu ACP session owner is exposed', async () => {
    const adapter = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport(), { adapterId: 'adapter-a' })
    const receipt = await adapter.send({ operationId: 'op-5', correlationId: 'corr-5', provider: 'codex', externalSessionId: 'ext-1', payload: { kind: 'prompt', text: '继续' } })
    expect(receipt.outcome).toBe('unsupported')
    expect(receipt.error?.code).toBe('prompt_transport_not_wired')
    expect(receipt.error?.outcomeUnknown).toBe(false)
  })

  it('prompt send preserves canonical owner identity and assembled text', async () => {
    const transport = new FakeHuabuTransport({ sendPromptResult: { externalSessionId: 'native-1', transportSessionId: 'transport-1', threadId: 'core-thread-1', text: '答复' } })
    const adapter = new HuabuAgentletContinuationAdapterV1(transport, { adapterId: 'adapter-a' })
    const receipt = await adapter.send({ operationId: 'op-5b', correlationId: 'corr-5b', provider: 'codex', externalSessionId: 'native-1', transportSessionId: 'transport-1', threadId: 'core-thread-1', runtimeScope: 'project-1', payload: { kind: 'prompt', text: '继续' } })
    expect(receipt).toMatchObject({ outcome: 'sent', externalSessionId: 'native-1', transportSessionId: 'transport-1', threadId: 'core-thread-1', responseText: '答复' })
  })

  it('prompt send timeout is outcome_unknown and reconcile, while resource stays unsupported', async () => {
    const timeoutAdapter = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport({ sendPromptError: new Error('prompt timed out') }), { adapterId: 'adapter-a' })
    const unknown = await timeoutAdapter.send({ operationId: 'op-5c', correlationId: 'corr-5c', provider: 'codex', externalSessionId: 'native-1', threadId: 'core-thread-1', payload: { kind: 'prompt', text: '继续' } })
    expect(unknown).toMatchObject({ outcome: 'outcome_unknown', retryAction: 'reconcile' })
    const resource = await timeoutAdapter.send({ operationId: 'op-5d', correlationId: 'corr-5d', provider: 'codex', externalSessionId: 'native-1', threadId: 'core-thread-1', payload: { kind: 'resource', resourceRef: 'file:///tmp/a' } })
    expect(resource).toMatchObject({ outcome: 'unsupported', error: { code: 'resource_transport_unsupported' } })
  })

  it('status lookup miss is unresolved (not proof of termination); query error is outcome_unknown', async () => {
    const adapter = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport(), { adapterId: 'adapter-a' })
    const miss = await adapter.status({ operationId: 'op-6', correlationId: 'corr-6', provider: 'codex', externalSessionId: 'ghost' })
    expect(miss.outcome).toBe('unresolved')
    expect(miss.error?.code).toBe('session_not_found')

    const found = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport({ getSessionResult: { sessionId: 'ext-1', status: 'running', pid: 7, cwd: '/tmp' } }), { adapterId: 'adapter-a' })
    const hit = await found.status({ operationId: 'op-6', correlationId: 'corr-6', provider: 'codex', externalSessionId: 'ext-1' })
    expect(hit.outcome).toBe('accepted')
    expect(hit.pid).toBe(7)
  })

  it('status and cancel use the Gateway transport identity without replacing the ACP native identity', async () => {
    const transport = new FakeHuabuTransport({
      listAgents: [{
        sessionId: 'transport-1',
        transportSessionId: 'transport-1',
        externalSessionId: 'native-1',
        threadId: 'core-thread-1',
        status: 'running',
      }],
    })
    const adapter = new HuabuAgentletContinuationAdapterV1(transport, { adapterId: 'adapter-a' })

    const status = await adapter.status({
      operationId: 'op-distinct', correlationId: 'corr-distinct', provider: 'codex',
      externalSessionId: 'native-1', transportSessionId: 'transport-1', threadId: 'core-thread-1',
    })
    expect(status).toMatchObject({
      outcome: 'accepted', externalSessionId: 'native-1', transportSessionId: 'transport-1', threadId: 'core-thread-1',
    })
    expect(transport.getSessionCalls).toEqual(['transport-1'])

    const cancelled = await adapter.cancel({
      operationId: 'op-distinct', correlationId: 'corr-distinct', provider: 'codex',
      externalSessionId: 'native-1', transportSessionId: 'transport-1', threadId: 'core-thread-1',
    })
    expect(cancelled).toMatchObject({
      outcome: 'accepted', externalSessionId: 'native-1', transportSessionId: 'transport-1', threadId: 'core-thread-1',
    })
    expect(transport.stopCalls).toEqual(['transport-1'])
  })

  it('cancel timeout → cancel_unknown; confirmed stop → accepted', async () => {
    const timeout = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport({ stopError: new Error('stop timed out') }), { adapterId: 'adapter-a' })
    const unknownReceipt = await timeout.cancel({ operationId: 'op-7', correlationId: 'corr-7', provider: 'codex', externalSessionId: 'ext-1' })
    expect(unknownReceipt.outcome).toBe('outcome_unknown')
    expect(unknownReceipt.retryAction).toBe('cancel_unknown')

    const ok = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport(), { adapterId: 'adapter-a' })
    const acceptedReceipt = await ok.cancel({ operationId: 'op-7', correlationId: 'corr-7', provider: 'codex', externalSessionId: 'ext-1' })
    expect(acceptedReceipt.outcome).toBe('accepted')
  })

  it('recoverExisting lookup miss → unresolved and never performs a second create', async () => {
    const transport = new FakeHuabuTransport()
    const adapter = new HuabuAgentletContinuationAdapterV1(transport, { adapterId: 'adapter-a' })
    const receipt = await adapter.recoverExisting({ operationId: 'op-8', correlationId: 'corr-8', provider: 'codex', identityHints: ['ghost-session'] })
    expect(receipt.outcome).toBe('unresolved')
    expect(receipt.retryAction).toBe('reconcile')
    expect(receipt.error?.code).toBe('recover_lookup_miss')
    // 禁止隐式 create：spawn 一次都不允许发生
    expect(transport.spawnCalls).toBe(0)
  })

  it('recoverExisting hit by identity hint returns recovered with the same external session', async () => {
    const transport = new FakeHuabuTransport({ listAgents: [{ sessionId: 'ext-1', appId: 'app-1', pid: 9, cwd: '/tmp', status: 'running' }] })
    const adapter = new HuabuAgentletContinuationAdapterV1(transport, { adapterId: 'adapter-a' })
    const receipt = await adapter.recoverExisting({ operationId: 'op-8', correlationId: 'corr-8', provider: 'codex', identityHints: ['app-1'] })
    expect(receipt.outcome).toBe('recovered')
    expect(receipt.externalSessionId).toBe('ext-1')
  })

  it('recoverExisting resolves a stable Core thread to distinct ACP and Gateway identities', async () => {
    const transport = new FakeHuabuTransport({ listAgents: [{
      sessionId: 'transport-1',
      transportSessionId: 'transport-1',
      externalSessionId: 'native-1',
      threadId: 'core-thread-1',
      appId: 'core-thread-1',
      status: 'running',
    }] })
    const adapter = new HuabuAgentletContinuationAdapterV1(transport, { adapterId: 'adapter-a' })
    const receipt = await adapter.recoverExisting({
      operationId: 'op-distinct-recover', correlationId: 'corr-distinct', provider: 'codex',
      threadId: 'core-thread-1', identityHints: ['core-thread-1'],
    })
    expect(receipt).toMatchObject({
      outcome: 'recovered', externalSessionId: 'native-1', transportSessionId: 'transport-1', threadId: 'core-thread-1',
    })
    expect(transport.spawnCalls).toBe(0)
  })
})

describe('classifyHuabuTransportErrorV1', () => {
  it('timeout/disconnect errors are outcome_unknown and non-retryable', () => {
    expect(classifyHuabuTransportErrorV1(new Error('connect timed out after 3000ms')).outcomeUnknown).toBe(true)
    expect(classifyHuabuTransportErrorV1(new Error('ECONNRESET')).outcomeUnknown).toBe(true)
    expect(classifyHuabuTransportErrorV1(new Error('resume unavailable')).outcomeUnknown).toBe(false)
  })
})

describe('T7 receipt → T6 journal 集成（Provider 成功/Core 失败 + cancel 三态上链）', () => {
  async function setupT6() {
    const root = await mkdtemp(join(tmpdir(), 'lcos-continuation-adapter-'))
    cleanup.push(root)
    const graph = createMvpSampleSnapshot(join(root, 'project'), '2026-09-12T00:00:00.000Z')
    const databasePath = join(root, 'metadata.sqlite')
    const metadata = new SqliteMetadataRepository(databasePath)
    repositories.push(metadata)
    metadata.save(graph)
    const events = new ProjectEventHub()
    const projectId = String(graph.project.id)
    const service = new ConversationContinuationService(metadata, events)
    const receivers = new ReceiverRuntimeService(metadata, events)
    const conversation = receivers.connectConversation({
      projectId,
      conversationRef: 'adapter-integration-target',
      executorId: 'executor-1',
      provider: 'codex',
      label: '续工目标',
    })
    return { root, databasePath, metadata, service, projectId, conversationId: conversation.id }
  }

  function submitInput(projectId: string, conversationId: string, operationId: string): ContinuationSubmitRequestV1 {
    return {
      schemaVersion: 1,
      operationId,
      projectId,
      connectedConversationId: conversationId,
      mode: 'continue_existing',
      contextInheritance: 'inherit',
      checkout: 'shared',
      provider: 'codex',
    }
  }

  it('Provider success → Core bind failure：journal 保留外部 identity，只允许 recover_bind，绝不二次 create', async () => {
    const { service, projectId, conversationId } = await setupT6()
    const adapter = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport({ spawnSessionId: 'ext-created' }), { adapterId: 'adapter-a' })
    const opId = 'op-provider-success'
    service.submit(submitInput(projectId, conversationId, opId))
    const createReceipt = await adapter.createSession({
      operationId: opId, correlationId: 'corr-p', provider: 'codex', runtimeScope: projectId,
      createVariant: 'long_lived', bundle: bundleFixture(projectId),
    })
    const evidence = continuationExternalEvidenceFromReceiptV1(createReceipt)
    expect(evidence?.externalSessionId).toBe('ext-created')
    expect(evidence?.agentletId).toBe('lcos-default-agentlet')
    expect(evidence?.runtimeScope).toBe(projectId)

    const bound = service.advanceStep(projectId, opId, { step: 'external_create', outcome: 'confirmed', externalEvidence: evidence! })
    expect(bound.status).toBe('binding')

    const failed = service.advanceStep(projectId, opId, { step: 'core_bind', outcome: 'failed', errorEvidence: 'bind-timeout' })
    expect(failed.status).toBe('recovering')
    expect(failed.externalEvidence?.externalSessionId).toBe('ext-created')
    const actions = failed.allowedActions.map((action) => action.action)
    expect(actions).toContain('recover_bind')
    expect(actions).not.toContain('recover_external')
  })

  it('pins the original revision across send-unknown, Current mutation, and database reload without repeating attach', async () => {
    const { root, databasePath, metadata, service, projectId, conversationId } = await setupT6()
    const operationId = 'op-pinned-context-retry'
    const messageId = 'message-pinned-context'
    const orderedReferences = [{ order: 0, ref: { type: 'artifact' as const, artifactId: 'artifact-brief' } }]
    service.submit(submitInput(projectId, conversationId, operationId))
    service.advanceStep(projectId, operationId, {
      step: 'external_create',
      outcome: 'confirmed',
      externalEvidence: {
        schemaVersion: 1,
        provider: 'codex',
        externalSessionId: 'native-1',
        transportSessionId: 'transport-1',
        threadId: 'core-thread-1',
        correlationId: operationId,
        createdAt: '2026-09-12T00:00:00.000Z',
      },
    })

    const firstTransport = new FakeHuabuTransport({ sendPromptError: new Error('prompt timed out') })
    const firstAdapter = new HuabuAgentletContinuationAdapterV1(firstTransport, { adapterId: 'adapter-a' })
    const first = await service.sendPrompt(
      projectId,
      operationId,
      { kind: 'prompt', text: 'Use the attached brief.' },
      firstAdapter,
      messageId,
      { messageId, orderedReferences },
    )
    expect(first.outcome).toBe('outcome_unknown')
    expect(firstTransport.attachCalls).toEqual([messageId])
    expect(firstTransport.promptContexts).toHaveLength(1)
    expect(JSON.stringify(firstTransport.promptContexts[0])).toContain('PortaSplit MVP Brief')
    const frozen = metadata.getContinuationOperationJournal(projectId, operationId)?.promptReceipts?.[0]?.contextResolution?.[0]
    expect(frozen).toMatchObject({ artifactId: 'artifact-brief', revisionId: 'revision-brief-initial' })

    const artifact = metadata.getArtifact('artifact-brief')!
    const previousRevision = metadata.getArtifactRevision('revision-brief-initial')!
    const nextBody = '# Replacement Brief\n\nUNIQUE-NEW-CURRENT-MUST-NOT-LEAK\n'
    const nextPath = join(root, 'project', 'brief-v2.md')
    await writeFile(nextPath, nextBody, 'utf8')
    const nextStat = await stat(nextPath)
    const nextHash = createHash('sha256').update(nextBody, 'utf8').digest('hex')
    const nextFileRecord = {
      id: 'file-brief-v2' as typeof previousRevision.fileRecordId,
      projectId: artifact.projectId,
      observedPath: nextPath,
      observedHash: nextHash as typeof previousRevision.contentHash,
      size: nextStat.size,
      modifiedAt: nextStat.mtime.toISOString(),
      mimeType: 'text/markdown',
      availability: 'current' as const,
      observedAt: '2026-09-12T00:01:00.000Z',
    }
    metadata.commitManagedTextRevision({
      artifact,
      previousRevision,
      newFileRecord: nextFileRecord,
      newRevision: {
        id: 'revision-brief-v2' as typeof previousRevision.id,
        artifactId: artifact.id,
        fileRecordId: nextFileRecord.id,
        contentHash: nextFileRecord.observedHash,
        source: 'external',
        status: 'current',
        parentRevisionId: previousRevision.id,
        createdAt: '2026-09-12T00:01:00.000Z',
      },
    })
    expect(metadata.getArtifact('artifact-brief')?.currentRevisionId).toBe('revision-brief-v2')

    metadata.close()
    const reopened = new SqliteMetadataRepository(databasePath)
    repositories.push(reopened)
    const resumed = new ConversationContinuationService(reopened, new ProjectEventHub())
    const retryTransport = new FakeHuabuTransport()
    const retryAdapter = new HuabuAgentletContinuationAdapterV1(retryTransport, { adapterId: 'adapter-a' })
    const retry = await resumed.sendPrompt(
      projectId,
      operationId,
      { kind: 'prompt', text: 'Use the attached brief.' },
      retryAdapter,
      messageId,
      { messageId, orderedReferences },
    )
    expect(retry.outcome).toBe('sent')
    expect(retryTransport.attachCalls).toEqual([])
    expect(retryTransport.promptContexts).toHaveLength(1)
    expect(JSON.stringify(retryTransport.promptContexts[0])).toContain('PortaSplit MVP Brief')
    expect(JSON.stringify(retryTransport.promptContexts[0])).not.toContain('UNIQUE-NEW-CURRENT-MUST-NOT-LEAK')
    expect(reopened.getContinuationOperationJournal(projectId, operationId)?.promptReceipts?.[0]?.contextResolution?.[0]).toEqual(frozen)
  })

  it('fails closed before attach when multiple resolved references exceed the message context budget', async () => {
    const { root, metadata, service, projectId, conversationId } = await setupT6()
    const operationId = 'op-context-budget'
    service.submit(submitInput(projectId, conversationId, operationId))
    service.advanceStep(projectId, operationId, {
      step: 'external_create',
      outcome: 'confirmed',
      externalEvidence: {
        schemaVersion: 1,
        provider: 'codex',
        externalSessionId: 'native-budget',
        transportSessionId: 'transport-budget',
        threadId: 'core-thread-budget',
        correlationId: operationId,
        createdAt: '2026-09-12T00:00:00.000Z',
      },
    })

    const artifact = metadata.getArtifact('artifact-brief')!
    const previousRevision = metadata.getArtifactRevision('revision-brief-initial')!
    const largeBody = `# Large context\n\n${'x'.repeat(110_000)}`
    const largePath = join(root, 'project', 'brief-large.md')
    await writeFile(largePath, largeBody, 'utf8')
    const largeStat = await stat(largePath)
    const largeHash = createHash('sha256').update(largeBody, 'utf8').digest('hex')
    const fileRecord = {
      id: 'file-brief-large' as typeof previousRevision.fileRecordId,
      projectId: artifact.projectId,
      observedPath: largePath,
      observedHash: largeHash as typeof previousRevision.contentHash,
      size: largeStat.size,
      modifiedAt: largeStat.mtime.toISOString(),
      mimeType: 'text/markdown',
      availability: 'current' as const,
      observedAt: '2026-09-12T00:02:00.000Z',
    }
    metadata.commitManagedTextRevision({
      artifact,
      previousRevision,
      newFileRecord: fileRecord,
      newRevision: {
        id: 'revision-brief-large' as typeof previousRevision.id,
        artifactId: artifact.id,
        fileRecordId: fileRecord.id,
        contentHash: fileRecord.observedHash,
        source: 'external',
        status: 'current',
        parentRevisionId: previousRevision.id,
        createdAt: '2026-09-12T00:02:00.000Z',
      },
    })

    const transport = new FakeHuabuTransport()
    const adapter = new HuabuAgentletContinuationAdapterV1(transport, { adapterId: 'adapter-a' })
    const result = await service.sendPrompt(
      projectId,
      operationId,
      { kind: 'prompt', text: 'Use both references.' },
      adapter,
      'message-budget',
      {
        messageId: 'message-budget',
        orderedReferences: [
          { order: 0, ref: { type: 'artifact', artifactId: 'artifact-brief' } },
          { order: 1, ref: { type: 'artifact', artifactId: 'artifact-brief' } },
        ],
      },
    )
    expect(result).toMatchObject({
      outcome: 'unsupported',
      error: { code: 'context_budget_exceeded' },
    })
    expect(transport.attachCalls).toEqual([])
    expect(transport.promptContexts).toEqual([])
  })

  it('cancel 三态上链：adapter timeout receipt → journal outcome_unknown → reconcile 收敛 confirmed', async () => {
    const { service, projectId, conversationId } = await setupT6()
    const opId = 'op-cancel-chain'
    service.submit(submitInput(projectId, conversationId, opId))
    service.advanceStep(projectId, opId, {
      step: 'external_create', outcome: 'confirmed',
      externalEvidence: { schemaVersion: 1, provider: 'codex', externalSessionId: 'ext-1', correlationId: 'corr-1', createdAt: '2026-09-12T00:00:00.000Z' },
    })

    const adapter = new HuabuAgentletContinuationAdapterV1(new FakeHuabuTransport({ stopError: new Error('stop timed out') }), { adapterId: 'adapter-a' })
    const cancelReceipt = await adapter.cancel({ operationId: opId, correlationId: 'corr-1', provider: 'codex', externalSessionId: 'ext-1' })
    expect(cancelReceipt.outcome).toBe('outcome_unknown')
    expect(cancelReceipt.retryAction).toBe('cancel_unknown')

    // T7 cancel receipt → journal cancel 轴：outcome_unknown 诚实上链
    const journaled = service.applyProviderCancelReceipt(projectId, opId, { outcome: cancelReceipt.outcome, errorEvidence: cancelReceipt.error?.message })
    expect(journaled.cancel).toBe('outcome_unknown')
    expect(journaled.status).toBe('outcome_unknown')
    expect(journaled.allowedActions.map((action) => action.action)).toEqual(['reconcile'])

    // 外部确认 session 不存在 → cancel 收敛 confirmed（Sprint 1A reconcile 语义）
    const converged = service.reconcile(projectId, opId, { externalConfirmed: false, errorEvidence: '外部 session 不存在' })
    expect(converged.cancel).toBe('confirmed')
    expect(converged.status).toBe('cancelled')
    expect(converged.allowedActions).toHaveLength(0)
    expect(service.read(projectId, opId)?.revision).toBe(3)
  })

  it('keeps durable body context across reload/retry and removes it only from later messages', async () => {
    const { databasePath, metadata, service, projectId, conversationId } = await setupT6()
    const importer = new ConversationImportService(metadata)
    const scopeId = String(metadata.getScopes(projectId).find((scope) => scope.kind === 'root')!.id)
    const imported = await importer.importManual(projectId, { title: '上下文会话', scopeId, entries: [{ role: 'user', contentText: '继续' }] })
    metadata.linkConnectedConversationSession(projectId, conversationId, imported.session.id)
    importer.close()
    const viewId = String(metadata.getArtifactViews('artifact-brief')[0]!.id)
    metadata.upsertRelation({ id: 'relation-persistent' as never, projectId: projectId as never, sourceEntityType: 'artifact', sourceEntityId: imported.session.conversationArtifactId!, targetEntityType: 'view', targetEntityId: viewId, kind: 'conversation_context', createdAt: '2026-09-27T00:00:00Z', updatedAt: '2026-09-27T00:00:00Z' })
    const operationId = 'op-durable-body'
    service.submit(submitInput(projectId, conversationId, operationId))
    service.advanceStep(projectId, operationId, { step: 'external_create', outcome: 'confirmed', externalEvidence: { schemaVersion: 1, provider: 'codex', externalSessionId: 'native-1', transportSessionId: 'transport-1', threadId: 'core-thread-1', correlationId: operationId, createdAt: '2026-09-27T00:00:00Z' } })
    const failedTransport = new FakeHuabuTransport({ sendPromptError: new Error('prompt timed out') })
    await service.sendPrompt(projectId, operationId, { kind: 'prompt', text: '按材料继续' }, new HuabuAgentletContinuationAdapterV1(failedTransport, { adapterId: 'adapter-a' }), 'message-durable', { messageId: 'message-durable' })
    expect(failedTransport.attachCalls).toEqual(['message-durable'])
    expect(JSON.stringify(failedTransport.promptContexts[0])).toContain('PortaSplit MVP Brief')
    const frozen = metadata.getContinuationOperationJournal(projectId, operationId)?.promptReceipts?.[0]
    expect(frozen?.orderedReferences).toEqual([{ order: 0, ref: { type: 'view', viewId } }])
    const explicitTransport = new FakeHuabuTransport()
    const explicit = [{ order: 7, mode: 'summary' as const, ref: { type: 'artifact' as const, artifactId: 'artifact-brief' } }]
    await service.sendPrompt(projectId, operationId, { kind: 'prompt', text: '只需摘要' }, new HuabuAgentletContinuationAdapterV1(explicitTransport, { adapterId: 'adapter-a' }), 'message-explicit', { messageId: 'message-explicit', orderedReferences: explicit })
    const combined = metadata.getContinuationOperationJournal(projectId, operationId)?.promptReceipts?.find((receipt) => receipt.messageId === 'message-explicit')
    expect(combined?.orderedReferences).toEqual(explicit)
    expect(combined?.explicitReferences).toEqual(explicit)
    const conflict = await service.sendPrompt(projectId, operationId, { kind: 'prompt', text: '只需摘要' }, new HuabuAgentletContinuationAdapterV1(explicitTransport, { adapterId: 'adapter-a' }), 'message-explicit', { messageId: 'message-explicit', orderedReferences: [] })
    expect(conflict.error?.code).toBe('prompt_reference_conflict')
    expect(explicitTransport.promptContexts).toHaveLength(1)
    metadata.deleteRelation('relation-persistent')
    metadata.close()
    const reopened = new SqliteMetadataRepository(databasePath); repositories.push(reopened)
    const resumed = new ConversationContinuationService(reopened, new ProjectEventHub())
    const retryTransport = new FakeHuabuTransport()
    const retryAdapter = new HuabuAgentletContinuationAdapterV1(retryTransport, { adapterId: 'adapter-a' })
    const retry = await resumed.sendPrompt(projectId, operationId, { kind: 'prompt', text: '按材料继续' }, retryAdapter, 'message-durable', { messageId: 'message-durable' })
    expect(retry.outcome).toBe('sent')
    expect(retryTransport.attachCalls).toEqual([])
    expect(JSON.stringify(retryTransport.promptContexts[0])).toContain('PortaSplit MVP Brief')
    await resumed.sendPrompt(projectId, operationId, { kind: 'prompt', text: '按材料继续' }, retryAdapter, 'message-durable', { messageId: 'message-durable' })
    expect(retryTransport.promptContexts).toHaveLength(1)
    const nextTransport = new FakeHuabuTransport()
    await resumed.sendPrompt(projectId, operationId, { kind: 'prompt', text: '下一条' }, new HuabuAgentletContinuationAdapterV1(nextTransport, { adapterId: 'adapter-a' }), 'message-next', { messageId: 'message-next' })
    expect(nextTransport.attachCalls).toEqual([])
    expect(nextTransport.promptContexts).toEqual([undefined])
  })

  it.each(['note', 'scope', 'missing'])('does not silently send without unsupported or missing durable %s context', async (kind) => {
    const { metadata, service, projectId, conversationId } = await setupT6()
    const scopeId = String(metadata.getScopes(projectId)[0]!.id)
    if (kind === 'note') metadata.upsertNote({ id: 'bound-note' as never, projectId: projectId as never, anchor: { type: 'project' }, body: '不可静默漏发', createdAt: '2026-09-27T00:00:00Z', updatedAt: '2026-09-27T00:00:00Z' })
    metadata.upsertRelation({ id: 'bound-unsupported' as never, projectId: projectId as never,
      sourceEntityType: 'conversation', sourceEntityId: conversationId,
      targetEntityType: kind === 'note' ? 'note' : kind === 'scope' ? 'scope' : 'view',
      targetEntityId: kind === 'note' ? 'bound-note' : kind === 'scope' ? scopeId : 'deleted-view',
      kind: 'conversation_context', createdAt: '2026-09-27T00:00:00Z', updatedAt: '2026-09-27T00:00:00Z' })
    const operationId = `op-block-${kind}`
    service.submit(submitInput(projectId, conversationId, operationId))
    service.advanceStep(projectId, operationId, { step: 'external_create', outcome: 'confirmed', externalEvidence: { schemaVersion: 1, provider: 'codex', externalSessionId: 'native-1', correlationId: operationId, createdAt: '2026-09-27T00:00:00Z' } })
    const transport = new FakeHuabuTransport()
    const receipt = await service.sendPrompt(projectId, operationId, { kind: 'prompt', text: '带材料发送' }, new HuabuAgentletContinuationAdapterV1(transport, { adapterId: 'adapter-a' }), 'blocked', { messageId: 'blocked' })
    expect(receipt.outcome).toBe('unsupported')
    expect(transport.attachCalls).toEqual([])
    expect(transport.promptContexts).toEqual([])
  })

})
