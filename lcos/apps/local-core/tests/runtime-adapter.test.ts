import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  continuationExternalEvidenceFromReceiptV1,
  createContinuationJournalRowV1,
  type ContinuationExternalEvidenceV1,
  type PersistedContextManifestV0,
} from '@local-creative-os/contracts'
import type { Run, RuntimeDispatch } from '@local-creative-os/domain'

import type {
  BridgeResultEnvelopeV0,
  BridgeRuntimePort,
  BridgeTaskEnvelopeV0,
  BridgeTaskIdentity,
} from '../src/runtime-adapter.js'
import {
  createTaskRequestFingerprint,
  RuntimeAdapterError,
  RuntimeAdapterService,
} from '../src/runtime-adapter.js'
import { DevFakeAgentletTransportV1 } from '../src/dev-fake-agentlet-transport.js'
import { HuabuAgentletContinuationAdapterV1 } from '../src/huabu-agentlet-continuation-adapter.js'
import { SqliteMetadataRepository } from '../src/metadata-repository.js'
import { createMvpSampleSnapshot } from '../src/mvp-sample-project.js'

const roots: string[] = []
const repositories: SqliteMetadataRepository[] = []
const now = '2026-07-29T12:00:00.000Z'

afterEach(() => {
  for (const repository of repositories.splice(0)) repository.close()
  for (const root of roots.splice(0)) void Promise.resolve().then(() => { try { rmSync(root, { recursive: true, force: true }) } catch { /* best effort */ } })
})

class FakeBridge implements BridgeRuntimePort {
  createCalls = 0
  executeCalls = 0
  lookupCalls = 0
  envelope: BridgeTaskEnvelopeV0 | undefined
  task: BridgeTaskIdentity | undefined
  createError: Error | undefined
  executeError: Error | undefined
  executeTaskIds: string[] = []
  bindingSeenAtExecute: boolean | undefined
  bindingProbe: (() => boolean) | undefined

  async createTask(envelope: BridgeTaskEnvelopeV0): Promise<BridgeTaskIdentity> {
    this.createCalls += 1
    this.envelope = envelope
    if (this.createError !== undefined) throw this.createError
    return this.task ?? {
      taskId: 'task-one',
      lcosRunId: envelope.lcosRunId,
      status: 'queued',
      requestFingerprint: envelope.requestFingerprint,
      contractVersion: envelope.contractVersion,
    }
  }

  async findTaskByRunId(): Promise<BridgeTaskIdentity | undefined> {
    this.lookupCalls += 1
    return this.task
  }

  async executeTask(taskId: string, runId: string) {
    this.executeCalls += 1
    this.executeTaskIds.push(taskId)
    this.bindingSeenAtExecute = this.bindingProbe?.()
    if (this.executeError !== undefined) throw this.executeError
    const task = this.task ?? {
      taskId,
      lcosRunId: runId,
      status: 'assigned',
      requestFingerprint: this.envelope?.requestFingerprint ?? 'fingerprint',
      contractVersion: this.envelope?.contractVersion ?? 'bridge-task-v1',
    }
    return { replayed: this.executeCalls > 1, task, execution: { status: this.executeCalls > 1 ? 'completed' : 'dispatching' } }
  }

  async getResult(): Promise<BridgeResultEnvelopeV0 | undefined> {
    return undefined
  }

  async getCapabilities() {
    return {
      primaryContractVersion: 'bridge-task-v1',
      providers: [
        { provider: 'workbuddy', executionMode: 'pull', outputIntents: ['create', 'revise', 'analyze'], contractVersions: ['bridge-task-v1'] },
        { provider: 'codex', executionMode: 'pull', outputIntents: ['create', 'revise', 'analyze'], contractVersions: ['bridge-task-v1'] },
      ],
    }
  }
}

function setup(target: number | 'none' = 1, overrides: Partial<Run> = {}) {
  const dbRoot = mkdtempSync(join(tmpdir(), 'lcos-adapter-db-'))
  const projectRoot = mkdtempSync(join(tmpdir(), 'lcos-adapter-project-'))
  roots.push(dbRoot, projectRoot)
  const repository = new SqliteMetadataRepository(join(dbRoot, 'metadata.sqlite'))
  repositories.push(repository)
  const snapshot = createMvpSampleSnapshot(projectRoot, now)
  repository.save(snapshot)
  const canonicalJson = JSON.stringify({
    schemaVersion: 0,
    project: { id: snapshot.project.id, name: snapshot.project.name },
    lockedElements: ['PortaSplit'],
  })
  const manifestHash = createHash('sha256').update(canonicalJson).digest('hex')
  const manifest: PersistedContextManifestV0 = {
    id: `manifest-${manifestHash}` as PersistedContextManifestV0['id'],
    projectId: snapshot.project.id,
    schemaVersion: 0,
    targetArtifactId: snapshot.artifacts[1]!.id,
    targetRevisionId: snapshot.artifactRevisions[1]!.id,
    canonicalJson,
    manifestHash,
    createdAt: now,
  }
  repository.createContextManifest(manifest)
  const outputIntent = overrides.outputIntent ?? 'revise'
  const run: Run = {
    id: 'run-adapter-one' as Run['id'],
    projectId: snapshot.project.id,
    workspaceId: snapshot.workspaces[0]!.id,
    ...(target === 'none' || outputIntent !== 'revise'
      ? {}
      : {
          targetArtifactId: snapshot.artifacts[target]!.id,
          targetRevisionId: snapshot.artifactRevisions[target]!.id,
        }),
    contextManifestId: manifest.id,
    provider: overrides.provider ?? 'workbuddy',
    requestedProvider: overrides.requestedProvider ?? overrides.provider ?? 'workbuddy',
    outputIntent,
    returnGroupId: 'return-group-adapter-one',
    status: 'created',
    instruction: overrides.instruction ?? 'Revise the Markdown script.',
    createdAt: now,
    updatedAt: now,
  }
  const dispatch: RuntimeDispatch = {
    id: 'dispatch-adapter-one' as RuntimeDispatch['id'],
    runId: run.id,
    provider: 'workbuddy',
    idempotencyKey: String(run.id),
    status: 'planned',
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  repository.createRunWithDispatch(run, dispatch)
  return { projectRoot, repository, run }
}

function bindExplicitAcpReceiver(
  repository: SqliteMetadataRepository,
  run: Run,
  input: {
    readonly connectedConversationId?: string
    readonly provider?: 'codex' | 'workbuddy'
    readonly externalSessionId?: string
    readonly transportSessionId?: string
    readonly threadId?: string
    readonly agentletId?: string
    readonly includeOwnerEvidence?: boolean
    readonly externalEvidence?: ContinuationExternalEvidenceV1
  } = {},
) {
  const projectId = String(run.projectId)
  const provider = input.provider ?? run.provider
  const connectedConversationId = input.connectedConversationId ?? 'connected-acp-one'
  const externalSessionId = input.externalEvidence?.externalSessionId ?? input.externalSessionId ?? 'acp-native-one'
  const transportSessionId = input.externalEvidence?.transportSessionId ?? input.transportSessionId ?? 'transport-one'
  const threadId = input.externalEvidence?.threadId ?? input.threadId ?? 'thread-one'
  const journal = createContinuationJournalRowV1({
    operationId: `operation-${String(run.id)}`,
    projectId,
    connectedConversationId,
    mode: 'continue_existing',
    contextInheritance: 'inherit',
    checkout: 'shared',
    provider,
  }, now)
  const pending = {
    ...journal,
    steps: { ...journal.steps, external_create: 'confirmed' as const, core_bind: 'pending' as const },
    externalEvidence: input.externalEvidence ?? {
      schemaVersion: 1 as const,
      provider,
      externalSessionId,
      transportSessionId,
      threadId,
      ...(input.includeOwnerEvidence === false ? {} : {
        agentletId: input.agentletId ?? 'machine-a',
        runtimeScope: projectId,
      }),
      correlationId: `correlation-${String(run.id)}`,
      createdAt: now,
    },
  }
  repository.saveContinuationOperationJournal(pending)
  const bound = repository.confirmContinuationCoreBind({
    projectId,
    operationId: pending.operationId,
    expectedRevision: pending.revision,
    externalSessionId,
    externalEvidence: pending.externalEvidence,
    fallbackConnectedConversationId: connectedConversationId,
  })
  const connected = repository.upsertConnectedConversation({
    ...bound.connectedConversation,
    executorId: input.agentletId ?? 'machine-a',
  })
  repository.setRunComposerFields(String(run.id), { receiverConversationId: connected.id })
  return connected
}

describe('RuntimeAdapterService', () => {
  it('matches the frozen Bridge canonical fingerprint fixture', () => {
    expect(createTaskRequestFingerprint({
      contractVersion: 'bridge-task-v0',
      lcosRunId: 'run-mvp-fixture-001',
      idempotencyKey: 'run-mvp-fixture-001',
      provider: 'workbuddy',
      taskType: 'markdown_script_revision',
      runtimeInputPackPath: 'C:\\LCOS_MVP_SAMPLE\\runtime\\runtime-input-pack.json',
      expectedOutputs: [{
        absolutePath: 'C:\\LCOS_MVP_SAMPLE\\staging\\script-draft-run-mvp-fixture-001.md',
        mode: 'create_new_file',
      }],
      timeoutSeconds: 600,
      reportMode: 'short',
    })).toBe('8b0f08d1c8661429f2e7966f0e2d266cf384cf0c073937f6ee1b2dbe5b504815')
  })

  it('materializes one immutable pack and binds an idempotent Bridge Task', async () => {
    const { repository, run } = setup()
    const bridge = new FakeBridge()
    const service = new RuntimeAdapterService(repository, bridge, 'mvp-fast-build', () => now)

    const first = await service.dispatch(run.id)
    const second = await service.dispatch(run.id)

    expect(first.externalTaskId).toBe('task-one')
    expect(second).toEqual(first)
    expect(bridge.createCalls).toBe(1)
    expect(repository.getRuntimeDispatch(run.id)?.status).toBe('bound')
    expect(repository.getRuntimeDispatch(run.id)?.attemptCount).toBe(1)
    expect(repository.getRun(run.id)?.status).toBe('queued')
    expect(bridge.envelope).toMatchObject({
      contractVersion: 'bridge-task-v1',
      outputIntent: 'revise',
      taskType: 'markdown_script_revision',
      outputPolicy: { allowZeroFiles: false, allowAdditionalFiles: false, maxFiles: 1 },
      expectedOutputs: [expect.objectContaining({
        action: 'modified',
        role: 'primary',
        mediaType: 'text/markdown',
      })],
    })
    const packPath = bridge.envelope!.runtimeInputPackPath
    expect(JSON.parse(readFileSync(packPath, 'utf8'))).toMatchObject({
      contractVersion: 'runtime-input-pack-v0',
      lcosRunId: String(run.id),
      contextManifest: { lockedElements: ['PortaSplit'] },
      compiledContextPrompt: {
        serializerVersion: 'context-prompt-v1',
        stablePrefixHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        dynamicTail: expect.stringContaining('Revise the Markdown script.'),
      },
      contextCacheTelemetry: {
        serializerVersion: 'context-prompt-v1',
        stablePrefixHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        provider: 'workbuddy',
      },
    })

  })

  it('freezes an explicit receiver as an ACP analyze target, binds before execute, and never executes ordinary tasks', async () => {
    const { repository, run } = setup('none', {
      outputIntent: 'analyze', provider: 'codex', requestedProvider: 'codex', instruction: 'Analyze this project.',
    })
    const providerAdapter = new HuabuAgentletContinuationAdapterV1(
      new DevFakeAgentletTransportV1(),
      { adapterId: 'roundtrip-adapter', agentletId: 'machine-a' },
    )
    const providerReceipt = await providerAdapter.createSession({
      operationId: 'roundtrip-operation',
      correlationId: 'roundtrip-correlation',
      provider: 'codex',
      runtimeScope: String(run.projectId),
      threadId: 'thread-one',
      createVariant: 'long_lived',
      bundle: {} as never,
    })
    const providerEvidence = continuationExternalEvidenceFromReceiptV1(providerReceipt)!
    expect(providerEvidence).toMatchObject({
      agentletId: 'machine-a',
      runtimeScope: String(run.projectId),
      threadId: 'thread-one',
    })
    const connected = bindExplicitAcpReceiver(repository, run, { externalEvidence: providerEvidence })
    expect(repository.getConversationSessionRuntimeIdentity(
      String(run.projectId), connected.conversationSessionId!,
    )?.originMeta).toMatchObject({
      continuationAgentletId: 'machine-a',
      continuationRuntimeScope: String(run.projectId),
      continuationExternalSessionId: providerEvidence.externalSessionId,
      continuationTransportSessionId: providerEvidence.transportSessionId,
      continuationThreadId: 'thread-one',
    })
    const bridge = new FakeBridge()
    bridge.bindingProbe = () => repository.getRuntimeBinding(run.id) !== undefined
    const service = new RuntimeAdapterService(repository, bridge, 'mvp-fast-build', () => now)

    await service.dispatch(run.id)

    expect(bridge.envelope).toMatchObject({
      outputIntent: 'analyze',
      executionTarget: {
        kind: 'huabu-acp-existing-session-v1',
        agentletId: 'machine-a',
        threadId: 'thread-one',
        externalSessionId: providerEvidence.externalSessionId,
        transportSessionId: providerEvidence.transportSessionId,
        runtimeScope: String(run.projectId),
      },
    })
    expect(bridge.bindingSeenAtExecute).toBe(true)
    expect(bridge.executeCalls).toBe(1)
    await service.dispatch(run.id)
    expect(bridge.createCalls).toBe(1)
    expect(bridge.executeCalls).toBe(2)

    const ordinary = setup('none', { outputIntent: 'analyze', instruction: 'Analyze without a receiver.' })
    const ordinaryBridge = new FakeBridge()
    await new RuntimeAdapterService(ordinary.repository, ordinaryBridge, 'mvp-fast-build', () => now).dispatch(ordinary.run.id)
    await new RuntimeAdapterService(ordinary.repository, ordinaryBridge, 'mvp-fast-build', () => now).dispatch(ordinary.run.id)
    expect(ordinaryBridge.executeCalls).toBe(0)
    expect(ordinaryBridge.envelope).not.toHaveProperty('executionTarget')
  })

  it('fails closed before Bridge create for a receiver target on create/revise or with mismatched identity', async () => {
    const revise = setup()
    bindExplicitAcpReceiver(revise.repository, revise.run, { provider: 'workbuddy' })
    const reviseBridge = new FakeBridge()
    await expect(new RuntimeAdapterService(revise.repository, reviseBridge, 'mvp-fast-build', () => now).dispatch(revise.run.id))
      .rejects.toMatchObject({ detail: { code: 'CONTRACT_UNSUPPORTED', retryable: false } })
    expect(reviseBridge.createCalls).toBe(0)

    const mismatch = setup('none', {
      outputIntent: 'analyze', provider: 'codex', requestedProvider: 'codex', instruction: 'Analyze.',
    })
    bindExplicitAcpReceiver(mismatch.repository, mismatch.run, { provider: 'workbuddy' })
    const mismatchBridge = new FakeBridge()
    await expect(new RuntimeAdapterService(mismatch.repository, mismatchBridge, 'mvp-fast-build', () => now).dispatch(mismatch.run.id))
      .rejects.toMatchObject({ detail: { code: 'CONTRACT_UNSUPPORTED', retryable: false } })
    expect(mismatchBridge.createCalls).toBe(0)

    const identityMismatch = setup('none', {
      outputIntent: 'analyze', provider: 'codex', requestedProvider: 'codex', instruction: 'Analyze.',
    })
    const identityConversation = bindExplicitAcpReceiver(identityMismatch.repository, identityMismatch.run)
    identityMismatch.repository.rebindConnectedConversationRef(
      String(identityMismatch.run.projectId), identityConversation.id, 'different-native-session',
    )
    const identityBridge = new FakeBridge()
    await expect(new RuntimeAdapterService(identityMismatch.repository, identityBridge, 'mvp-fast-build', () => now).dispatch(identityMismatch.run.id))
      .rejects.toMatchObject({ detail: { code: 'CONTRACT_UNSUPPORTED', retryable: false } })
    expect(identityBridge.createCalls).toBe(0)
  })

  it('does not create a targeted task when the Bridge has no explicit execute capability', async () => {
    const { repository, run } = setup('none', {
      outputIntent: 'analyze', provider: 'codex', requestedProvider: 'codex', instruction: 'Analyze.',
    })
    bindExplicitAcpReceiver(repository, run)
    const createTask = vi.fn<BridgeRuntimePort['createTask']>()
    const bridge: BridgeRuntimePort = {
      createTask,
      findTaskByRunId: async () => undefined,
      getResult: async () => undefined,
    }
    await expect(new RuntimeAdapterService(repository, bridge, 'mvp-fast-build', () => now).dispatch(run.id))
      .rejects.toMatchObject({ detail: { code: 'CONTRACT_UNSUPPORTED', retryable: false } })
    expect(createTask).not.toHaveBeenCalled()
  })

  it('fails closed for legacy canonical sessions that predate agentlet/runtime-scope evidence', async () => {
    const { repository, run } = setup('none', {
      outputIntent: 'analyze', provider: 'codex', requestedProvider: 'codex', instruction: 'Analyze.',
    })
    bindExplicitAcpReceiver(repository, run, { includeOwnerEvidence: false, agentletId: 'executor-is-not-an-agentlet' })
    const bridge = new FakeBridge()

    await expect(new RuntimeAdapterService(repository, bridge, 'mvp-fast-build', () => now).dispatch(run.id))
      .rejects.toMatchObject({ detail: { code: 'CONTRACT_UNSUPPORTED', retryable: false } })
    expect(bridge.createCalls).toBe(0)
    expect(bridge.executeCalls).toBe(0)
  })

  it('retries the idempotent execute endpoint with the same bound task after an unknown execute outcome', async () => {
    const { repository, run } = setup('none', {
      outputIntent: 'analyze', provider: 'codex', requestedProvider: 'codex', instruction: 'Analyze.',
    })
    bindExplicitAcpReceiver(repository, run)
    const bridge = new FakeBridge()
    bridge.executeError = new Error('execute response timed out')
    const service = new RuntimeAdapterService(repository, bridge, 'mvp-fast-build', () => now)

    await expect(service.dispatch(run.id)).rejects.toMatchObject({ detail: { code: 'BRIDGE_UNAVAILABLE', retryable: true } })
    expect(repository.getRuntimeBinding(run.id)?.externalTaskId).toBe('task-one')
    expect(repository.getRuntimeDispatch(run.id)?.status).toBe('recovery_required')
    bridge.executeError = undefined

    await expect(service.recover(run.id)).resolves.toMatchObject({ externalTaskId: 'task-one' })
    expect(bridge.createCalls).toBe(1)
    expect(bridge.executeCalls).toBe(2)
    expect(bridge.executeTaskIds).toEqual(['task-one', 'task-one'])
  })

  it('fails unsupported revise targets BEFORE any Bridge create call', async () => {
    const { repository, run } = setup(2)
    const bridge = new FakeBridge()
    const service = new RuntimeAdapterService(repository, bridge, 'mvp-fast-build', () => now)

    await expect(service.dispatch(run.id)).rejects.toMatchObject({
      detail: { code: 'UNSUPPORTED_OUTPUT_FORMAT', retryable: false },
    })
    expect(bridge.createCalls).toBe(0)
    expect(repository.getRuntimeBinding(run.id)).toBeUndefined()
    expect(repository.getRuntimeDispatch(run.id)?.status).toBe('planned')
  })

  it('fails revise without a target before dispatch', async () => {
    const { repository, run } = setup('none')
    const bridge = new FakeBridge()
    const service = new RuntimeAdapterService(repository, bridge, 'mvp-fast-build', () => now)

    await expect(service.dispatch(run.id)).rejects.toMatchObject({
      detail: { code: 'CONTRACT_UNSUPPORTED', retryable: false },
    })
    expect(bridge.createCalls).toBe(0)
    expect(repository.getRuntimeBinding(run.id)).toBeUndefined()
    expect(repository.getRuntimeDispatch(run.id)?.status).toBe('planned')
  })

  it('marks an uncertain create as recovery_required and recovers by lookup without another create', async () => {
    const { repository, run } = setup()
    const bridge = new FakeBridge()
    bridge.createError = new Error('connection reset')
    const service = new RuntimeAdapterService(repository, bridge, 'mvp-fast-build', () => now)

    await expect(service.dispatch(run.id)).rejects.toMatchObject({
      detail: { code: 'BRIDGE_UNAVAILABLE', retryable: true },
    })
    expect(repository.getRuntimeDispatch(run.id)?.status).toBe('recovery_required')

    bridge.createError = undefined
    bridge.task = {
      taskId: 'task-recovered',
      lcosRunId: String(run.id),
      status: 'assigned',
      requestFingerprint: bridge.envelope!.requestFingerprint,
      contractVersion: 'bridge-task-v0',
    }
    const binding = await service.recover(run.id)
    expect(binding.externalTaskId).toBe('task-recovered')
    expect(bridge.lookupCalls).toBe(1)
    expect(bridge.createCalls).toBe(1)
    expect(repository.getRuntimeDispatch(run.id)?.status).toBe('bound')
  })

  it('refuses to overwrite a changed RuntimeInputPack during recovery', async () => {
    const { repository, run } = setup()
    const bridge = new FakeBridge()
    bridge.createError = new Error('connection reset')
    const service = new RuntimeAdapterService(repository, bridge, 'mvp-fast-build', () => now)

    await expect(service.dispatch(run.id)).rejects.toBeInstanceOf(RuntimeAdapterError)
    writeFileSync(bridge.envelope!.runtimeInputPackPath, '{"tampered":true}\n')
    bridge.createError = undefined

    await expect(service.recover(run.id)).rejects.toMatchObject({
      detail: { code: 'BRIDGE_UNAVAILABLE' },
    })
    expect(bridge.createCalls).toBe(1)
    expect(repository.getRuntimeDispatch(run.id)?.status).toBe('recovery_required')
  })

  it('keeps provider review out of canonical Run status during explicit sync', async () => {
    const { repository, run } = setup()
    const bridge = new FakeBridge()
    const service = new RuntimeAdapterService(repository, bridge, 'mvp-fast-build', () => now)
    await service.dispatch(run.id)
    repository.updateRunStatus(run.id, 'running', now)
    bridge.task = {
      taskId: 'task-one',
      lcosRunId: String(run.id),
      status: 'review',
      requestFingerprint: bridge.envelope!.requestFingerprint,
      contractVersion: 'bridge-task-v0',
    }

    const binding = await service.sync(run.id)
    expect(binding.providerStatus).toBe('review')
    expect(repository.getRun(run.id)?.status).toBe('running')
  })

  it('returns a canonical TASK_NOT_FOUND error when sync has no binding', async () => {
    const { repository, run } = setup()
    const service = new RuntimeAdapterService(repository, new FakeBridge(), 'mvp-fast-build', () => now)
    await expect(service.sync(run.id)).rejects.toBeInstanceOf(RuntimeAdapterError)
  })
  it('only advertises Runtime Host managed providers as automatic', async () => {
    const { repository } = setup()
    const bridge = new FakeBridge()
    const service = new RuntimeAdapterService(
      repository,
      bridge,
      'mvp-fast-build',
      () => now,
      undefined,
      new Set(['codex']),
    )

    const statuses = await service.providersStatus()
    expect(statuses.find((item) => item.provider === 'codex')).toMatchObject({ availability: 'ready', executionMode: 'automatic' })
    expect(statuses.find((item) => item.provider === 'workbuddy')).toMatchObject({ availability: 'manual', executionMode: 'manual' })
    expect(statuses.find((item) => item.provider === 'auto')).toMatchObject({ availability: 'ready', executionMode: 'automatic' })
  })

})
