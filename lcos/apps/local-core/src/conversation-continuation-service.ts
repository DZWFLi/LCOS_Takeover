import { mergeBoundConversationContext } from './conversation-context.js'
import { randomUUID } from 'node:crypto'
import type {
  ContextPackItemV0,
  ContinuationActionV1,
  ContinuationExternalEvidenceV1,
  ContinuationOperationJournalRowV1,
  ContinuationProviderAdapterV1,
  ContinuationRecoveryProjectionV1,
  ContinuationReconcileRequestV1,
  ContinuationStepAdvanceRequestV1,
  ContinuationStepKindV1,
  ContinuationStepStateV1,
  ContinuationSubmitRequestV1,
  ProviderSendPayloadV1,
  ProviderContextResolutionEvidenceV1,
  ProviderResolvedContextReferenceV1,
  ContinuityAttachBundleV1,
  OrderedRunReferenceV2,
  ProjectEventOrigin,
  ProviderContinuationOperationResultV1,
} from '@local-creative-os/contracts'
import { continuationExternalEvidenceFromReceiptV1, projectContinuationRecoveryV1 } from '@local-creative-os/contracts'
import { ContinuationCoreBindStaleRevisionError, type SqliteMetadataRepository } from './metadata-repository.js'
import type { ProjectEventHub } from './project-events/project-event-hub.js'
import { readArtifactIndexBody } from './search-artifact-body.js'
import { hashFileSha256 } from './file-registry-service.js'

export interface ContinuationSubmitResultV1 {
  readonly projection: ContinuationRecoveryProjectionV1
  /** true = 本调用新建了 journal；false = 已存在（幂等复用，绝不再 create）。 */
  readonly created: boolean
}

/** 该动作需要尚未接线的能力（如 T1 projection retry）；调用方应禁用该按钮，不点后无果。 */
export class RecoveryActionUnsupportedError extends Error {
  constructor(action: ContinuationActionV1, reason: string) {
    super(`Continuation action ${action} is unsupported: ${reason}`)
    this.name = 'RecoveryActionUnsupportedError'
  }
}


/** stale guard：action 执行前 expectedRevision 不匹配则拒绝（Sprint 1A 验收 6）。 */
export class ContinuationStaleRevisionError extends Error {
  constructor(operationId: string, expected: number, actual: number) {
    super(`Continuation operation ${operationId} revision mismatch: expected ${expected}, actual ${actual}.`)
    this.name = 'ContinuationStaleRevisionError'
  }
}

const CONTINUATION_CAPABILITIES: { readonly externalCreate: boolean } = { externalCreate: true }
/** Matches the existing LCOS single-prompt body ceiling; aggregate context fails closed above it. */
const CONTINUATION_CONTEXT_TOTAL_CHAR_LIMIT = 200_000

/**
 * Sprint 1A（T6）：Continuation Operation Journal + Read Projection。
 * 只组合既有 repository / contracts 纯投影，不创建第二份 continuation 数据库语义。
 * 本服务是 canonical producer：T7 adapter 消费 submit/advance/reconcile 写事实，
 * T3/T5 后续只读 projection 的 target-specific allowedActions。
 */
export class ConversationContinuationService {
  constructor(
    private readonly metadata: SqliteMetadataRepository,
    private readonly events: ProjectEventHub,
  ) {}

  /** 提交续工：journal 存在则幂等返回（绝不产生第二次 create intent）。 */
  submit(input: ContinuationSubmitRequestV1, origin?: ProjectEventOrigin): ContinuationSubmitResultV1 {
    if (this.metadata.getProject(input.projectId) === undefined) throw new Error('Project not found.')
    const globalExisting = this.metadata.getContinuationOperationJournalByOperationId(input.operationId)
    if (globalExisting !== undefined && globalExisting.projectId !== input.projectId) {
      throw new Error('Continuation operationId is already used by another project.')
    }
    const connected = input.connectedConversationId === undefined
      ? undefined
      : this.metadata.getConnectedConversation(input.projectId, input.connectedConversationId)
    if (input.connectedConversationId !== undefined && connected === undefined) {
      throw new Error('Connected conversation not found in project.')
    }
    if (connected !== undefined && connected.provider !== input.provider) {
      throw new Error('Connected conversation provider does not match continuation provider.')
    }
    const existing = this.metadata.getContinuationOperationJournal(input.projectId, input.operationId)
    if (existing !== undefined) {
      if (!sameContinuationSubmit(existing, input)) throw new Error('Continuation operationIdempotency conflict.')
      this.events.publish(input.projectId, {
        channel: 'continuity',
        type: 'continuity.changed',
        ...(origin === undefined ? {} : { origin }),
        entityRefs: [input.operationId],
        payload: { kind: 'continuation.submit_duplicate', operationId: input.operationId },
      })
      return { projection: projectContinuationRecoveryV1(existing, CONTINUATION_CAPABILITIES), created: false }
    }

    const now = new Date().toISOString()
    const runtimeThreadId = input.runtimeThreadId?.trim() || (
      input.connectedConversationId === undefined
        ? `core-continuation-${randomUUID()}`
        : `core-conversation-${input.connectedConversationId}`
    )
    const row: ContinuationOperationJournalRowV1 = {
      schemaVersion: 1,
      operationId: input.operationId,
      projectId: input.projectId,
      connectedConversationId: input.connectedConversationId ?? null,
      mode: input.mode,
      contextInheritance: input.contextInheritance,
      checkout: input.checkout,
      provider: input.provider,
      runtimeThreadId,
      steps: { external_create: 'not_started', core_bind: 'not_started', attach: 'not_started', projection: 'not_started' },
      cancel: 'none',
      ...(input.orderedReferences === undefined ? {} : { orderedReferences: input.orderedReferences }),
      revision: 0,
      createdAt: now,
      updatedAt: now,
    }
    this.metadata.saveContinuationOperationJournal(row)
    this.events.publish(input.projectId, {
      channel: 'continuity',
      type: 'continuity.changed',
      ...(origin === undefined ? {} : { origin }),
      entityRefs: [input.operationId],
      payload: { kind: 'continuation.submitted', operationId: input.operationId, mode: input.mode, provider: input.provider,
        ...(input.connectedConversationId === undefined ? {} : { connectedConversationId: input.connectedConversationId }) },
    })
    return { projection: projectContinuationRecoveryV1(row, CONTINUATION_CAPABILITIES), created: true }
  }

  read(projectId: string, operationId: string): ContinuationRecoveryProjectionV1 | undefined {
    const row = this.metadata.getContinuationOperationJournal(projectId, operationId)
    return row === undefined ? undefined : projectContinuationRecoveryV1(row, CONTINUATION_CAPABILITIES)
  }

  /** 项目内 journal 列表投影（Recovery body 入口；按 updatedAt 倒序）。 */
  list(projectId: string): readonly ContinuationRecoveryProjectionV1[] {
    return this.metadata.listContinuationOperationJournals(projectId).map((row) => projectContinuationRecoveryV1(row, CONTINUATION_CAPABILITIES))
  }

  /**
   * 步骤推进（T7 adapter / recovery 流程调用）。
   * 幂等：目标步骤已 confirmed/not_applicable 时不可再推进（防重复写回证据覆盖真相）；
   * outcome_unknown 只允许收敛到 confirmed/failed（携带 evidence）。
   */
  advanceStep(
    projectId: string,
    operationId: string,
    input: ContinuationStepAdvanceRequestV1,
    origin?: ProjectEventOrigin,
  ): ContinuationRecoveryProjectionV1 {
    const row = this.metadata.getContinuationOperationJournal(projectId, operationId)
    if (row === undefined) throw new Error('Continuation operation not found.')
    this.assertStale(row, input.expectedRevision)
    if (input.externalEvidence !== undefined) assertExternalEvidence(input.externalEvidence, row.provider)
    const current = row.steps[input.step]
    if (current === 'confirmed' || current === 'not_applicable') {
      throw new Error(`Continuation step ${input.step} is already settled (${current}).`)
    }
    // external_create 的 confirmed 在任何情况下都必须带 external evidence（证明外部 session 真实存在），
    // 不得用本地判定/文案冒充外部 receipt；否则 migration 无法区分真实 create 与伪造 result。
    if (input.step === 'external_create' && input.outcome === 'confirmed' && input.externalEvidence === undefined) {
      throw new Error('Confirmed external create requires externalEvidence.')
    }
    // computed key 在 strict 下无法用展开直接收窄，先构建可变副本再按守卫过的字面量赋值。
    const nextSteps = { ...row.steps } as { [K in ContinuationStepKindV1]: ContinuationStepStateV1 }
    nextSteps[input.step] = input.outcome
    const next: ContinuationOperationJournalRowV1 = {
      ...row,
      steps: nextSteps,
      ...(input.externalEvidence === undefined ? {} : { externalEvidence: input.externalEvidence }),
      ...(input.errorEvidence === undefined && row.errorEvidence === undefined ? {} : { errorEvidence: input.errorEvidence ?? row.errorEvidence }),
      revision: row.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    const persisted = input.expectedRevision === undefined
      ? (this.metadata.saveContinuationOperationJournal(next), true)
      : this.metadata.saveContinuationOperationJournalIfRevision(next, input.expectedRevision)
    if (!persisted) {
      const fresh = this.metadata.getContinuationOperationJournal(projectId, operationId)
      throw new ContinuationStaleRevisionError(operationId, input.expectedRevision ?? row.revision, fresh?.revision ?? row.revision)
    }
    this.events.publish(projectId, {
      channel: 'continuity',
      type: 'continuity.changed',
      ...(origin === undefined ? {} : { origin }),
      entityRefs: [operationId],
      payload: { kind: 'continuation.step_advanced', operationId, step: input.step, outcome: input.outcome, revision: next.revision },
    })
    return projectContinuationRecoveryV1(next, CONTINUATION_CAPABILITIES)
  }

  /** 发起 cancel intent（本地记账；外部终态由 T7 后续 reconcile/confirmed receipt 收敛）。 */
  requestCancel(projectId: string, operationId: string, expectedRevision?: number, origin?: ProjectEventOrigin): ContinuationRecoveryProjectionV1 {
    const row = this.metadata.getContinuationOperationJournal(projectId, operationId)
    if (row === undefined) throw new Error('Continuation operation not found.')
    this.assertStale(row, expectedRevision)
    if (row.cancel !== 'none') throw new Error(`Cancel is already ${row.cancel}.`)
    const next = this.metadata.claimContinuationCancel(projectId, operationId, row.revision)
    if (next === undefined) {
      const fresh = this.metadata.getContinuationOperationJournal(projectId, operationId)
      if (fresh !== undefined && fresh.revision !== row.revision) throw new ContinuationStaleRevisionError(operationId, row.revision, fresh.revision)
      throw new Error(`Cancel is already ${fresh?.cancel ?? 'unavailable'}.`)
    }
    this.events.publish(projectId, {
      channel: 'continuity',
      type: 'continuity.changed',
      ...(origin === undefined ? {} : { origin }),
      entityRefs: [operationId],
      payload: { kind: 'continuation.cancel_requested', operationId, revision: next.revision },
    })
    return projectContinuationRecoveryV1(next, CONTINUATION_CAPABILITIES)
  }

  /**
   * reconcile：收敛 outcome_unknown。只有明确外部证据/结论时才收敛；
   * 无证据请求保持 unknown（诚实降级），返回当前投影。
   */
  reconcile(
    projectId: string,
    operationId: string,
    input: ContinuationReconcileRequestV1 = {},
    origin?: ProjectEventOrigin,
  ): ContinuationRecoveryProjectionV1 {
    const row = this.metadata.getContinuationOperationJournal(projectId, operationId)
    if (row === undefined) throw new Error('Continuation operation not found.')
    this.assertStale(row, input.expectedRevision)
    if (input.externalEvidence !== undefined) assertExternalEvidence(input.externalEvidence, row.provider)

    const hasUnknown = Object.values(row.steps).includes('outcome_unknown') || row.cancel === 'outcome_unknown'
    if (!hasUnknown) return projectContinuationRecoveryV1(row, CONTINUATION_CAPABILITIES)

    // 只收敛明确的步骤：external_create 用 externalConfirmed/externalEvidence；其余需适配器显式推进。
    let step: ContinuationStepKindV1 | null = null
    if (row.steps.external_create === 'outcome_unknown') step = 'external_create'
    else if (row.steps.core_bind === 'outcome_unknown') step = 'core_bind'
    else if (row.steps.attach === 'outcome_unknown') step = 'attach'
    else if (row.steps.projection === 'outcome_unknown') step = 'projection'
    if (step === 'external_create' && input.externalConfirmed === true) {
      if (input.externalEvidence === undefined) throw new Error('Reconcile external_confirmed requires externalEvidence.')
      return this.advanceStep(projectId, operationId, {
        step,
        outcome: 'confirmed',
        externalEvidence: input.externalEvidence,
      }, origin)
    }
    if (step === 'external_create' && input.externalConfirmed === false) {
      return this.advanceStep(projectId, operationId, {
        step,
        outcome: 'failed',
        ...(input.errorEvidence === undefined ? {} : { errorEvidence: input.errorEvidence }),
      }, origin)
    }
    if (row.cancel === 'outcome_unknown' && input.externalConfirmed === false) {
      // 外部确认不存在来进行中的 create → cancel 收敛为 confirmed。
      const next: ContinuationOperationJournalRowV1 = {
        ...row,
        cancel: 'confirmed',
        ...(input.externalEvidence === undefined ? {} : { externalEvidence: input.externalEvidence }),
        ...(input.errorEvidence === undefined ? {} : { errorEvidence: input.errorEvidence }),
        revision: row.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      this.metadata.saveContinuationOperationJournal(next)
      return projectContinuationRecoveryV1(next, CONTINUATION_CAPABILITIES)
    }
    return projectContinuationRecoveryV1(row, CONTINUATION_CAPABILITIES)
  }

  /**
   * Sprint 1B（T7）：provider cancel receipt → journal cancel 轴（cancel 三态上链）。
   * outcome_unknown/unresolved → journal cancel=outcome_unknown（诚实保留未知，等待 reconcile 收敛）；
   * accepted → 外部只接受 stop 请求，未确认终态，cancel 保持当前值不推进。
   */
  applyProviderCancelReceipt(
    projectId: string,
    operationId: string,
    input: {
      readonly outcome: 'accepted' | 'outcome_unknown' | 'unresolved'
      readonly externalEvidence?: ContinuationExternalEvidenceV1
      readonly errorEvidence?: string
      readonly expectedRevision?: number
    },
    origin?: ProjectEventOrigin,
  ): ContinuationRecoveryProjectionV1 {
    const row = this.metadata.getContinuationOperationJournal(projectId, operationId)
    if (row === undefined) throw new Error('Continuation operation not found.')
    this.assertStale(row, input.expectedRevision)
    if (row.cancel === 'confirmed') throw new Error('Continuation cancel is already confirmed.')
    if (input.outcome === 'accepted') return projectContinuationRecoveryV1(row, CONTINUATION_CAPABILITIES)
    const next: ContinuationOperationJournalRowV1 = {
      ...row,
      cancel: 'outcome_unknown',
      ...(input.externalEvidence === undefined ? {} : { externalEvidence: input.externalEvidence }),
      ...(input.errorEvidence === undefined && row.errorEvidence === undefined ? {} : { errorEvidence: input.errorEvidence ?? row.errorEvidence }),
      revision: row.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    this.metadata.saveContinuationOperationJournal(next)
    this.events.publish(projectId, {
      channel: 'continuity',
      type: 'continuity.changed',
      ...(origin === undefined ? {} : { origin }),
      entityRefs: [operationId],
      payload: { kind: 'continuation.cancel_outcome_unknown', operationId, outcome: input.outcome, revision: next.revision },
    })
    return projectContinuationRecoveryV1(next, CONTINUATION_CAPABILITIES)
  }

  /**
   * recovery intent → T6 service → T7 adapter → receipt → journal（用户链路闭环）。
   * 只执行当前 allowedActions 明确放行的动作；T1 未接线的 projection retry 抛
   * RecoveryActionUnsupportedError（调用方禁用按钮）。副作用经 advanceStep/reconcile/
   * cancel 落 journal，返回 fresh projection（Work View 回读）。
   */
  async executeRecoveryAction(
    projectId: string,
    operationId: string,
    action: ContinuationActionV1,
    adapter: ContinuationProviderAdapterV1,
    expectedRevision?: number,
  ): Promise<ContinuationRecoveryProjectionV1> {
    const row = this.metadata.getContinuationOperationJournal(projectId, operationId)
    if (row === undefined) throw new Error('Continuation operation not found.')
    this.assertStale(row, expectedRevision)
    const projection = projectContinuationRecoveryV1(row, CONTINUATION_CAPABILITIES)
    if (!projection.allowedActions.some((a) => a.action === action)) {
      throw new Error(`Continuation action ${action} is not allowed for operation ${operationId}.`)
    }
    switch (action) {
      case 'recover_external':
        return this.#recoverExternal(projectId, operationId, this.#claimSideEffect(projectId, operationId, row, 'external_create'), adapter)
      case 'recover_bind':
        return this.#recoverBind(projectId, operationId, this.#claimSideEffect(projectId, operationId, row, 'core_bind'), adapter)
      case 'retry_attach':
        throw new RecoveryActionUnsupportedError(action, 'message-scoped attach recovery requires a stable messageId and frozen context resolution; retry through sendPrompt with the same messageId.')
      case 'retry_projection':
        throw new RecoveryActionUnsupportedError(action, 'projection retry 需要 T1 projection service（未接线）。')
      case 'reconcile':
        return this.#reconcileWithAdapter(projectId, operationId, row, adapter)
      case 'cancel_request':
        return this.#cancelWithAdapter(projectId, operationId, row, adapter, expectedRevision)
      default:
        throw new RecoveryActionUnsupportedError(action, '未知动作。')
    }
  }

  /** Send one prompt through the canonical owner bound to this continuation. */
  async sendPrompt(
    projectId: string,
    operationId: string,
    payload: ProviderSendPayloadV1,
    adapter: ContinuationProviderAdapterV1,
    correlationId = operationId,
    options: {
      readonly orderedReferences?: readonly OrderedRunReferenceV2[]
      readonly messageId?: string
    } = {},
  ): Promise<ProviderContinuationOperationResultV1> {
    const row = this.metadata.getContinuationOperationJournal(projectId, operationId)
    if (row === undefined) throw new Error('Continuation operation not found.')
    const explicitReferences = options.orderedReferences ?? []
    const messageId = options.messageId
    const existingReceipt = messageId === undefined
      ? undefined
      : row.promptReceipts?.find((entry) => entry.messageId === messageId)
    if (existingReceipt !== undefined && JSON.stringify(existingReceipt.explicitReferences ?? existingReceipt.orderedReferences) !== JSON.stringify(explicitReferences)) {
      // A conflicting request must not overwrite the original message snapshot.
      return this.promptReceipt(row, adapter.adapterId, undefined, explicitReferences, 'failed',
        'prompt_reference_conflict', 'The same messageId was already used with a different context reference set.')
    }
    if (existingReceipt?.sendReceipt?.outcome === 'sent') return existingReceipt.sendReceipt
    const merged = existingReceipt === undefined
      ? mergeBoundConversationContext(this.metadata, projectId, row.connectedConversationId, explicitReferences)
      : { references: existingReceipt.orderedReferences }
    const orderedReferences = merged.references
    if (merged.unsupported !== undefined) {
      return this.promptReceipt(row, adapter.adapterId, undefined, orderedReferences, 'unsupported',
        'persistent_context_unsupported', merged.unsupported)
    }
    if (orderedReferences.length > 0 && messageId === undefined) {
      return this.promptReceipt(row, adapter.adapterId, undefined, orderedReferences, 'failed',
        'context_message_id_required', 'Message-scoped context requires a stable messageId.')
    }
    const externalSessionId = row.externalEvidence?.externalSessionId
    if (externalSessionId === undefined) {
      const unresolved: ProviderContinuationOperationResultV1 = {
        schemaVersion: 1,
        operationId,
        correlationId,
        provider: row.provider,
        adapterId: adapter.adapterId,
        action: 'send',
        outcome: 'unresolved',
        ...(row.runtimeThreadId === undefined ? {} : { threadId: row.runtimeThreadId }),
        contextAttached: false,
        nativeFork: false,
        degradedFromNativeFork: false,
        retryAction: 'reconcile',
        error: { code: 'no_external_identity', message: 'No external session identity to send to.', retryable: false, outcomeUnknown: true },
        observedAt: new Date().toISOString(),
      }
      this.recordPromptReceipt(projectId, operationId, messageId, orderedReferences, unresolved, 'send', row.revision, undefined, explicitReferences)
      return unresolved
    }

    if (orderedReferences.length > 0 && existingReceipt?.attachReceipt?.outcome === 'attached' && existingReceipt.contextResolution === undefined) {
      return this.promptReceipt(
        row,
        adapter.adapterId,
        messageId,
        orderedReferences,
        'failed',
        'context_resolution_evidence_missing',
        'A confirmed attach receipt has no frozen Core revision evidence; refusing to change its content on retry.',
        explicitReferences,
      )
    }
    const resolvedContext = orderedReferences.length === 0
      ? {
          ok: true as const,
          value: [] as readonly ProviderResolvedContextReferenceV1[],
          evidence: [] as readonly ProviderContextResolutionEvidenceV1[],
        }
      : await this.resolveProviderContextReferences(projectId, orderedReferences, existingReceipt?.contextResolution)
    if (!resolvedContext.ok) {
      return this.promptReceipt(
        row,
        adapter.adapterId,
        messageId,
        orderedReferences,
        'unsupported',
        resolvedContext.code,
        resolvedContext.message,
        explicitReferences,
      )
    }

    let confirmedAttachReceipt = existingReceipt?.attachReceipt?.outcome === 'attached'
      && existingReceipt.attachReceipt.contextAttached === true
      ? existingReceipt.attachReceipt
      : undefined
    if (orderedReferences.length > 0 && confirmedAttachReceipt === undefined) {
      if (messageId === undefined) throw new Error('Message-scoped context is missing its stable messageId.')
      const attachReceipt = await adapter.attachContext({
        operationId,
        correlationId,
        provider: row.provider,
        ...(row.runtimeThreadId === undefined ? {} : { threadId: row.runtimeThreadId }),
        externalSessionId,
        ...(row.externalEvidence?.transportSessionId === undefined ? {} : { transportSessionId: row.externalEvidence.transportSessionId }),
        messageId,
        orderedReferences,
        contextResolution: resolvedContext.evidence,
        bundle: continuationBundleForRowV1(row, orderedReferences),
      })
      this.recordPromptReceipt(projectId, operationId, messageId, orderedReferences, attachReceipt, 'attach', row.revision, resolvedContext.evidence, explicitReferences)
      // An unsupported/failed/unknown attach must stop before prompt send. The
      // caller keeps the same messageId and the journal receipt exposes the
      // only safe recovery action; no provider prompt is silently sent.
      if (!(attachReceipt.outcome === 'attached' && attachReceipt.contextAttached)) return attachReceipt
      confirmedAttachReceipt = attachReceipt
    }
    const payloadWithContext = confirmedAttachReceipt?.contextAttachmentId === undefined || messageId === undefined
      ? payload
      : {
          ...payload,
          contextAttachment: {
            attachmentId: confirmedAttachReceipt.contextAttachmentId,
            messageId,
            correlationId: confirmedAttachReceipt.correlationId,
            orderedReferences,
            contextResolution: resolvedContext.evidence,
            resolvedReferences: resolvedContext.value,
          },
        }
    const sent = await adapter.send({
      operationId,
      correlationId,
      provider: row.provider,
      runtimeScope: projectId,
      ...(row.runtimeThreadId === undefined ? {} : { threadId: row.runtimeThreadId }),
      externalSessionId,
      ...(row.externalEvidence?.transportSessionId === undefined ? {} : { transportSessionId: row.externalEvidence.transportSessionId }),
      payload: payloadWithContext,
    })
    this.recordPromptReceipt(projectId, operationId, messageId, orderedReferences, sent, 'send', undefined, resolvedContext.evidence, explicitReferences)
    return sent
  }

  /** Persist one message-scoped provider receipt in the existing journal JSON. */
  recordPromptReceipt(
    projectId: string,
    operationId: string,
    messageId: string | undefined,
    orderedReferences: readonly OrderedRunReferenceV2[],
    receipt: ProviderContinuationOperationResultV1,
    phase: 'attach' | 'send',
    expectedRevision?: number,
    contextResolution?: readonly ProviderContextResolutionEvidenceV1[],
    explicitReferences?: readonly OrderedRunReferenceV2[],
  ): void {
    if (messageId === undefined) return
    const row = this.metadata.getContinuationOperationJournal(projectId, operationId)
    if (row === undefined) throw new Error('Continuation operation not found.')
    this.assertStale(row, expectedRevision)
    const promptReceipts = [...(row.promptReceipts ?? [])]
    const index = promptReceipts.findIndex((entry) => entry.messageId === messageId)
    const existing = index < 0 ? undefined : promptReceipts[index]
    if (existing !== undefined && JSON.stringify(existing.orderedReferences) !== JSON.stringify(orderedReferences)) {
      throw new Error('The same messageId was already used with a different context reference set.')
    }
    const retainedContextResolution = contextResolution ?? existing?.contextResolution
    const nextReceipt = {
      messageId,
      orderedReferences: [...orderedReferences],
      ...((existing?.explicitReferences ?? explicitReferences) === undefined ? {} : { explicitReferences: [...(existing?.explicitReferences ?? explicitReferences)!] }),
      ...(retainedContextResolution === undefined
        ? {}
        : { contextResolution: [...retainedContextResolution] }),
      receipt,
      ...(phase === 'attach'
        ? { attachReceipt: receipt }
        : { sendReceipt: receipt, ...(existing?.attachReceipt === undefined ? {} : { attachReceipt: existing.attachReceipt }) }),
      updatedAt: new Date().toISOString(),
    }
    if (index < 0) promptReceipts.push(nextReceipt)
    else promptReceipts[index] = nextReceipt
    const next: ContinuationOperationJournalRowV1 = {
      ...row,
      promptReceipts,
      revision: row.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    const persisted = this.metadata.saveContinuationOperationJournalIfRevision(next, row.revision)
    if (!persisted) {
      const fresh = this.metadata.getContinuationOperationJournal(projectId, operationId)
      throw new ContinuationStaleRevisionError(operationId, row.revision, fresh?.revision ?? row.revision)
    }
    this.events.publish(projectId, {
      channel: 'continuity',
      type: 'continuity.changed',
      entityRefs: [operationId],
      payload: { kind: 'continuation.prompt_receipt_recorded', operationId, messageId, outcome: receipt.outcome, action: receipt.action, revision: next.revision },
    })
  }

  private promptReceipt(
    row: ContinuationOperationJournalRowV1,
    adapterId: string,
    messageId: string | undefined,
    orderedReferences: readonly OrderedRunReferenceV2[],
    outcome: 'failed' | 'unsupported',
    code: string,
    message: string,
    explicitReferences?: readonly OrderedRunReferenceV2[],
  ): ProviderContinuationOperationResultV1 {
    const receipt: ProviderContinuationOperationResultV1 = {
      schemaVersion: 1,
      operationId: row.operationId,
      correlationId: row.operationId,
      provider: row.provider,
      adapterId,
      action: 'attach_context',
      outcome,
      ...(row.externalEvidence?.externalSessionId === undefined ? {} : { externalSessionId: row.externalEvidence.externalSessionId }),
      contextAttached: false,
      nativeFork: false,
      degradedFromNativeFork: false,
      retryAction: 'reconcile',
      error: { code, message, retryable: false, outcomeUnknown: false },
      observedAt: new Date().toISOString(),
    }
    if (messageId !== undefined) this.recordPromptReceipt(row.projectId, row.operationId, messageId, orderedReferences, receipt, 'attach', row.revision, undefined, explicitReferences)
    return receipt
  }

  /** Resolve only artifact-backed references into ACP embedded text. Other kinds stay honest unsupported. */
  private async resolveProviderContextReferences(
    projectId: string,
    orderedReferences: readonly OrderedRunReferenceV2[],
    frozenResolution?: readonly ProviderContextResolutionEvidenceV1[],
  ): Promise<
    | {
        readonly ok: true
        readonly value: readonly ProviderResolvedContextReferenceV1[]
        readonly evidence: readonly ProviderContextResolutionEvidenceV1[]
      }
    | { readonly ok: false; readonly code: string; readonly message: string }
  > {
    const resolved: ProviderResolvedContextReferenceV1[] = []
    const evidence: ProviderContextResolutionEvidenceV1[] = []
    let totalChars = 0
    const references = [...orderedReferences].sort((left, right) => left.order - right.order)
    if (frozenResolution !== undefined && frozenResolution.length !== references.length) {
      return { ok: false, code: 'context_resolution_conflict', message: 'Frozen context resolution does not match the message reference count.' }
    }
    for (const [index, reference] of references.entries()) {
      const ref = reference.ref
      const frozen = frozenResolution?.[index]
      const mode = reference.mode ?? 'full'
      if (frozen !== undefined && (frozen.order !== reference.order || frozen.mode !== mode || JSON.stringify(frozen.ref) !== JSON.stringify(ref))) {
        return { ok: false, code: 'context_resolution_conflict', message: 'Frozen context resolution does not match the message reference identity/order.' }
      }
      let artifactId: string
      let requestedRevisionId: string | undefined
      if (frozen !== undefined) {
        artifactId = frozen.artifactId
        requestedRevisionId = frozen.revisionId
      } else if (ref.type === 'artifact') {
        artifactId = ref.artifactId
        requestedRevisionId = ref.revisionId
      } else if (ref.type === 'view') {
        const view = this.metadata.getArtifactView(ref.viewId)
        if (view === undefined) return { ok: false, code: 'context_reference_not_found', message: `Artifact view ${ref.viewId} was not found.` }
        artifactId = String(view.artifactId)
        requestedRevisionId = view.revisionId === undefined ? undefined : String(view.revisionId)
      } else {
        return { ok: false, code: 'context_reference_resolution_unsupported', message: `Provider context resolution is not implemented for ${ref.type} references.` }
      }
      const artifact = this.metadata.getArtifact(artifactId)
      if (artifact === undefined || String(artifact.projectId) !== projectId) {
        return { ok: false, code: 'context_reference_not_found', message: `Artifact ${artifactId} is outside this project or missing.` }
      }
      const revisionId = requestedRevisionId ?? (artifact.currentRevisionId === undefined ? undefined : String(artifact.currentRevisionId))
      const revision = revisionId === undefined ? undefined : this.metadata.getArtifactRevision(revisionId)
      if (revision === undefined || String(revision.artifactId) !== artifactId) {
        return { ok: false, code: 'context_revision_not_found', message: `Revision for artifact ${artifactId} was not found.` }
      }
      const fileRecord = this.metadata.getFileRecord(String(revision.fileRecordId))
      const contentHash = String(revision.contentHash)
      if (frozen !== undefined && (
        frozen.revisionId !== revisionId
        || frozen.fileRecordId !== String(revision.fileRecordId)
        || frozen.contentHash !== contentHash
      )) {
        return { ok: false, code: 'context_resolution_conflict', message: `Frozen revision evidence for artifact ${artifactId} no longer matches Core metadata.` }
      }
      if (fileRecord === undefined || String(fileRecord.observedHash) !== contentHash) {
        return { ok: false, code: 'context_content_stale', message: `Artifact ${artifactId} does not match its frozen revision hash.` }
      }
      let actualHash: string
      try {
        actualHash = await hashFileSha256(fileRecord.observedPath)
      } catch {
        return { ok: false, code: 'context_content_unavailable', message: `Artifact ${artifactId} cannot be read for provider context.` }
      }
      if (actualHash !== contentHash) {
        return { ok: false, code: 'context_content_stale', message: `Artifact ${artifactId} changed on disk after its frozen revision was recorded.` }
      }
      const maxChars = mode === 'summary' ? 12_000 : mode === 'structure' ? 40_000 : 200_000
      const text = (await readArtifactIndexBody({
        fileRecord,
        maxChars,
        projectId,
        artifactId,
      })).trim()
      if (text === '') {
        return { ok: false, code: 'context_content_unavailable', message: `Artifact ${artifactId} has no readable text evidence for provider context.` }
      }
      totalChars += text.length
      if (totalChars > CONTINUATION_CONTEXT_TOTAL_CHAR_LIMIT) {
        return {
          ok: false,
          code: 'context_budget_exceeded',
          message: `Resolved provider context exceeds the ${CONTINUATION_CONTEXT_TOTAL_CHAR_LIMIT}-character message budget.`,
        }
      }
      resolved.push({
        order: reference.order,
        mode,
        ref,
        title: frozen?.title ?? artifact.title,
        mimeType: 'text/plain',
        text,
      })
      evidence.push({
        order: reference.order,
        mode,
        ref,
        artifactId,
        revisionId: String(revision.id),
        fileRecordId: String(revision.fileRecordId),
        contentHash,
        title: frozen?.title ?? artifact.title,
      })
    }
    return { ok: true, value: resolved, evidence }
  }

  /** Notify existing collaboration subscribers after a prompt turn is committed. */
  publishTimelineAppended(projectId: string, connectedConversationId: string, messageId: string): void {
    this.events.publish(projectId, {
      channel: 'continuity',
      type: 'continuity.changed',
      entityRefs: [connectedConversationId, messageId],
      payload: { kind: 'conversation.timeline_appended', connectedConversationId, messageId },
    })
  }

  async #recoverExternal(
    projectId: string,
    operationId: string,
    row: ContinuationOperationJournalRowV1,
    adapter: ContinuationProviderAdapterV1,
  ): Promise<ContinuationRecoveryProjectionV1> {
    // native_full_fork：先试 provider native fork；unsupported → degrade 到 create + ContinuityAttachBundle，
    // 诚实返回 degradation receipt（T7 V2：provider 不支持 native fork 时只能 create + bundle，不冒充 fork）。
    if (row.mode === 'native_full_fork') {
      const sourceExternalSessionId = this.#sourceExternalSessionIdForFork(projectId, row)
      if (sourceExternalSessionId !== undefined) {
        const forkReceipt = await adapter.nativeFork({
          operationId,
          correlationId: operationId,
          provider: row.provider,
          sourceExternalSessionId,
          bundle: continuationBundleForRowV1(row),
        })
        if (forkReceipt.outcome === 'external_created' && forkReceipt.nativeFork) {
          return this.#applyCreateReceipt(projectId, operationId, forkReceipt, row.revision)
        }
        if (forkReceipt.outcome === 'external_created') {
          return this.#applyCreateReceipt(projectId, operationId, forkReceipt, row.revision,
            'provider returned a session without native fork proof; treated as degraded create')
        }
        if (forkReceipt.outcome === 'unsupported' && forkReceipt.degradedFromNativeFork) {
          const createReceipt = await adapter.createSession({
            operationId,
            correlationId: operationId,
            provider: row.provider,
            runtimeScope: projectId,
            ...(row.runtimeThreadId === undefined ? {} : { threadId: row.runtimeThreadId }),
            createVariant: 'long_lived',
            bundle: continuationBundleForRowV1(row),
          })
          if (createReceipt.outcome === 'external_created') {
            const evidence = continuationExternalEvidenceFromReceiptV1(createReceipt)
            if (evidence === undefined) throw new Error('External created receipt missing provider-native session identity.')
            return this.advanceStep(projectId, operationId, {
              step: 'external_create',
              outcome: 'confirmed',
              externalEvidence: evidence,
              errorEvidence: `native fork unsupported by provider; degraded to create + continuity attach bundle (${forkReceipt.error?.code ?? 'native_fork_unsupported'})`,
              expectedRevision: row.revision,
            })
          }
          return this.#applyCreateReceipt(projectId, operationId, createReceipt, row.revision,
            'native fork unsupported by provider; attempted create + continuity attach bundle')
        }
        return this.#applyCreateReceipt(projectId, operationId, forkReceipt, row.revision)
      }
      // 无 fork 源（connectedConversation 无 external ref）：直接 create（degrade 语义同上，不冒充 fork）。
    }
    const receipt = await adapter.createSession({
      operationId,
      correlationId: operationId,
      provider: row.provider,
      runtimeScope: projectId,
      ...(row.runtimeThreadId === undefined ? {} : { threadId: row.runtimeThreadId }),
      createVariant: row.mode === 'blank_new' ? 'blank' : 'long_lived',
      bundle: continuationBundleForRowV1(row),
    })
    return this.#applyCreateReceipt(projectId, operationId, receipt, row.revision,
      row.mode === 'native_full_fork' ? 'native fork source unavailable; degraded to create + continuity attach bundle' : undefined)
  }

  /** native_full_fork 的 fork 源 = connectedConversation 的 conversationRef（外部 session 稳定引用）。 */
  #sourceExternalSessionIdForFork(projectId: string, row: ContinuationOperationJournalRowV1): string | undefined {
    if (row.connectedConversationId === null) return undefined
    const connected = this.metadata.getConnectedConversation(projectId, row.connectedConversationId)
    if (connected === undefined || connected.provider !== row.provider) return undefined
    if (connected.conversationRef.startsWith('pending-')) return undefined
    return connected.conversationRef
  }

  #applyCreateReceipt(
    projectId: string,
    operationId: string,
    receipt: ProviderContinuationOperationResultV1,
    expectedRevision: number,
    degradationEvidence?: string,
  ): ContinuationRecoveryProjectionV1 {
    if (receipt.outcome === 'external_created') {
      const evidence = continuationExternalEvidenceFromReceiptV1(receipt)
      if (evidence === undefined) throw new Error('External created receipt missing provider-native session identity.')
      return this.advanceStep(projectId, operationId, {
        step: 'external_create', outcome: 'confirmed', externalEvidence: evidence,
        expectedRevision,
        ...(degradationEvidence === undefined ? {} : { errorEvidence: degradationEvidence }),
      })
    }
    if (receipt.outcome === 'outcome_unknown') {
      return this.advanceStep(projectId, operationId, { step: 'external_create', outcome: 'outcome_unknown', expectedRevision, ...(receipt.error === undefined ? {} : { errorEvidence: receipt.error.message }) })
    }
    return this.advanceStep(projectId, operationId, { step: 'external_create', outcome: 'failed', expectedRevision, ...(receipt.error === undefined ? {} : { errorEvidence: receipt.error.message }) })
  }

  async #recoverBind(
    projectId: string,
    operationId: string,
    row: ContinuationOperationJournalRowV1,
    adapter: ContinuationProviderAdapterV1,
  ): Promise<ContinuationRecoveryProjectionV1> {
    const externalSessionId = row.externalEvidence?.externalSessionId
    if (externalSessionId === undefined) throw new Error('No external session identity to bind.')
    const receipt = await adapter.continueExisting({
      operationId,
      correlationId: operationId,
      provider: row.provider,
      runtimeScope: projectId,
      ...(row.runtimeThreadId === undefined ? {} : { threadId: row.runtimeThreadId }),
      externalSessionId,
      ...(row.externalEvidence?.transportSessionId === undefined ? {} : { transportSessionId: row.externalEvidence.transportSessionId }),
      bundle: continuationBundleForRowV1(row),
    })
    if (receipt.outcome === 'resumed') {
      // 外部会话已恢复 ≠ Core 绑定完成：Repository 在一个 SQLite
      // BEGIN IMMEDIATE 内同时写 canonical ConnectedConversation 与 journal。
      try {
        const boundExternalSessionId = receipt.externalSessionId ?? externalSessionId
        const evidence = continuationExternalEvidenceFromReceiptV1(receipt)
        const bound = this.metadata.confirmContinuationCoreBind({
          projectId,
          operationId,
          expectedRevision: row.revision,
          externalSessionId: boundExternalSessionId,
          ...(evidence === undefined ? {} : { externalEvidence: evidence }),
          fallbackConnectedConversationId: row.connectedConversationId ?? `connected-conversation-${randomUUID()}`,
        })
        this.events.publish(projectId, {
          channel: 'continuity',
          type: 'continuity.changed',
          entityRefs: [operationId, bound.connectedConversation.id],
          payload: { kind: 'continuation.core_bind_confirmed', operationId, revision: bound.journal.revision, connectedConversationId: bound.connectedConversation.id },
        })
        return projectContinuationRecoveryV1(bound.journal, CONTINUATION_CAPABILITIES)
      } catch (error: unknown) {
        // A CAS race is a stale client/worker view, not a provider bind
        // failure. Preserve it as a conflict so callers must re-read.
        if (error instanceof ContinuationCoreBindStaleRevisionError) {
          throw new ContinuationStaleRevisionError(operationId, error.expected, error.actual)
        }
        return this.advanceStep(projectId, operationId, {
          step: 'core_bind',
          outcome: 'failed',
          expectedRevision: row.revision,
          errorEvidence: error instanceof Error ? error.message : String(error),
        })
      }
    }
    if (receipt.outcome === 'outcome_unknown') {
      return this.advanceStep(projectId, operationId, { step: 'core_bind', outcome: 'outcome_unknown', expectedRevision: row.revision, ...(receipt.error === undefined ? {} : { errorEvidence: receipt.error.message }) })
    }
    return this.advanceStep(projectId, operationId, { step: 'core_bind', outcome: 'failed', expectedRevision: row.revision, ...(receipt.error === undefined ? {} : { errorEvidence: receipt.error.message }) })
  }

  async #reconcileWithAdapter(
    projectId: string,
    operationId: string,
    row: ContinuationOperationJournalRowV1,
    adapter: ContinuationProviderAdapterV1,
  ): Promise<ContinuationRecoveryProjectionV1> {
    const receipt = await adapter.recoverExisting({
      operationId,
      correlationId: operationId,
      provider: row.provider,
      runtimeScope: projectId,
      ...(row.externalEvidence?.externalSessionId === undefined ? {} : { externalSessionId: row.externalEvidence.externalSessionId }),
      ...(row.externalEvidence?.transportSessionId === undefined ? {} : { transportSessionId: row.externalEvidence.transportSessionId }),
      ...(row.runtimeThreadId === undefined ? {} : { threadId: row.runtimeThreadId }),
      identityHints: Array.from(new Set([
        row.runtimeThreadId,
        row.externalEvidence?.transportSessionId,
        row.externalEvidence?.externalSessionId,
        row.externalEvidence?.correlationId,
        operationId,
      ].filter((value): value is string => value !== undefined && value !== ''))),
    })
    if (receipt.outcome === 'recovered') {
      const evidence = continuationExternalEvidenceFromReceiptV1(receipt)
      return this.reconcile(projectId, operationId, {
        externalConfirmed: true,
        ...(evidence === undefined ? {} : { externalEvidence: evidence }),
      })
    }
    if (receipt.outcome === 'unresolved' || receipt.outcome === 'outcome_unknown') {
      // A lookup miss or transport ambiguity is not proof that the external session is gone.
      // Preserve unknown so recovery cannot silently reopen create.
      const current = this.metadata.getContinuationOperationJournal(projectId, operationId)
      if (current?.steps.external_create === 'outcome_unknown') {
        return this.advanceStep(projectId, operationId, {
          step: 'external_create',
          outcome: 'outcome_unknown',
          ...(receipt.error === undefined ? {} : { errorEvidence: receipt.error.message }),
        })
      }
      return this.reconcile(projectId, operationId, {})
    }
    return this.reconcile(projectId, operationId, {})
  }

  async #cancelWithAdapter(
    projectId: string,
    operationId: string,
    row: ContinuationOperationJournalRowV1,
    adapter: ContinuationProviderAdapterV1,
    expectedRevision: number | undefined,
  ): Promise<ContinuationRecoveryProjectionV1> {
    // 本地意图记账（requested）→ 外部 stop → 三态收敛
    const requested = this.requestCancel(projectId, operationId, expectedRevision)
    const externalSessionId = requested.externalEvidence?.externalSessionId
    if (externalSessionId === undefined) return requested
    const receipt = await adapter.cancel({
      operationId,
      correlationId: operationId,
      provider: row.provider,
      externalSessionId,
      ...(requested.externalEvidence?.transportSessionId === undefined ? {} : { transportSessionId: requested.externalEvidence.transportSessionId }),
      ...(requested.runtimeThreadId === undefined ? {} : { threadId: requested.runtimeThreadId }),
    })
    if (receipt.outcome === 'accepted') return requested
    return this.applyProviderCancelReceipt(projectId, operationId, {
      outcome: receipt.outcome === 'outcome_unknown' || receipt.outcome === 'unresolved' ? receipt.outcome : 'outcome_unknown',
      ...(receipt.error === undefined ? {} : { errorEvidence: receipt.error.message }),
    })
  }

  /** resolve 收敛：操作已投影且无未决 cancel 时标记终态（由 T1 projection receipt 触发；本 Sprint 保留语义入口）。 */
  private assertStale(row: ContinuationOperationJournalRowV1, expectedRevision: number | undefined): void {
    if (expectedRevision !== undefined && expectedRevision !== row.revision) {
      throw new ContinuationStaleRevisionError(row.operationId, expectedRevision, row.revision)
    }
  }

  #claimSideEffect(
    projectId: string,
    operationId: string,
    row: ContinuationOperationJournalRowV1,
    step: 'external_create' | 'core_bind' | 'attach',
  ): ContinuationOperationJournalRowV1 {
    const claimed = this.metadata.claimContinuationOperationStep(projectId, operationId, step, row.revision)
    if (claimed !== undefined) return claimed
    const fresh = this.metadata.getContinuationOperationJournal(projectId, operationId)
    if (fresh !== undefined && fresh.revision !== row.revision) throw new ContinuationStaleRevisionError(operationId, row.revision, fresh.revision)
    throw new Error(`Continuation action for ${step} is already claimed or no longer allowed.`)
  }
}

function sameContinuationSubmit(existing: ContinuationOperationJournalRowV1, input: ContinuationSubmitRequestV1): boolean {
  const runtimeThreadId = input.runtimeThreadId?.trim() || (
    input.connectedConversationId === undefined
      ? undefined
      : `core-conversation-${input.connectedConversationId}`
  )
  return existing.projectId === input.projectId
    && existing.connectedConversationId === (input.connectedConversationId ?? null)
    && existing.mode === input.mode
    && existing.contextInheritance === input.contextInheritance
    && existing.checkout === input.checkout
    && existing.provider === input.provider
    && (runtimeThreadId === undefined || existing.runtimeThreadId === runtimeThreadId)
    && JSON.stringify(existing.orderedReferences ?? []) === JSON.stringify(input.orderedReferences ?? [])
}

function assertExternalEvidence(evidence: ContinuationExternalEvidenceV1, provider: string): void {
  if (evidence.schemaVersion !== 1
    || evidence.provider !== provider
    || typeof evidence.externalSessionId !== 'string' || evidence.externalSessionId.trim() === ''
    || typeof evidence.correlationId !== 'string' || evidence.correlationId.trim() === ''
    || typeof evidence.createdAt !== 'string' || evidence.createdAt.trim() === ''
    || (evidence.agentletId !== undefined && (evidence.agentletId.trim() === '' || evidence.agentletId !== evidence.agentletId.trim()))
    || (evidence.runtimeScope !== undefined && (evidence.runtimeScope.trim() === '' || evidence.runtimeScope !== evidence.runtimeScope.trim()))) {
    throw new Error('External evidence is invalid or does not match the continuation provider.')
  }
}

/** RFC 4122 风格 operationId（T7 提供 correlationId；operationId 始终由 Core 侧稳定生成以便重试复用）。 */
export function createContinuationOperationId(): string {
  return `continuation-op-${randomUUID()}`
}

/** 由 journal 行构建最小 ContinuityAttachBundle（T7 adapter 输入；不携带第二份 context truth）。 */
export function continuationBundleForRowV1(
  row: ContinuationOperationJournalRowV1,
  orderedReferences: readonly OrderedRunReferenceV2[] = row.orderedReferences ?? [],
): ContinuityAttachBundleV1 {
  const generatedAt = new Date().toISOString()
  const references = orderedReferences
  const intent = {
    type: 'continue_work' as const,
    objectViewIds: references.map(referenceViewIdForBundleV1),
    goal: references.length === 0
      ? `续工（${row.mode}）`
      : `续工（${row.mode}）· 携带 ${references.length} 项引用`,
    constraints: [] as readonly string[],
    evidenceKeys: [] as readonly string[],
    suggestedSkillIds: [] as readonly string[],
    confidence: 0.5,
    confidenceBand: 'low' as const,
    source: 'explicit' as const,
    createdAt: generatedAt,
  }
  return {
    schemaVersion: 1,
    projectId: row.projectId,
    workspaceId: null,
    provider: row.provider,
    intent,
    contextPack: {
      schemaVersion: 0, projectId: row.projectId, workspaceId: null, intent,
      items: references.map((reference) => contextPackItemFromReferenceV1(reference)),
      selectedCount: references.length, pinnedCount: 0, relatedCount: 0,
      retrievedCount: 0, estimatedTokens: 0, tokenBudget: 0, truncated: false,
      createdAt: generatedAt,
    },
    skillTarget: { intentType: 'continue_work', supportingSkillIds: [], target: '', sideEffect: 'READ_ONLY', requiresApproval: false, reason: '' },
    selectedViewIds: references.map(referenceViewIdForBundleV1),
    sourceRefs: references.map((reference) => ({
      sourceType: reference.ref.type,
      sourceRef: referenceEntityIdForBundleV1(reference),
      observedAt: generatedAt,
    })),
    generatedAt,
  }
}

/** 引用 → bundle 的 viewId（view 直接用 viewId；实体用实体 id 作投影键）。 */
function referenceViewIdForBundleV1(reference: OrderedRunReferenceV2): string {
  const ref = reference.ref
  switch (ref.type) {
    case 'view': return ref.viewId
    case 'artifact': return ref.artifactId
    case 'scope': return ref.scopeId
    case 'workspace': return ref.workspaceId
    case 'conversation': return ref.conversationSessionId
    case 'component': return ref.componentId
  }
}

/** 引用 → bundle 的 sourceRef（实体 id 稳定键）。 */
function referenceEntityIdForBundleV1(reference: OrderedRunReferenceV2): string {
  const ref = reference.ref
  switch (ref.type) {
    case 'view': return ref.viewId
    case 'artifact': return ref.artifactId
    case 'scope': return ref.scopeId
    case 'workspace': return ref.workspaceId
    case 'conversation': return ref.conversationSessionId
    case 'component': return ref.componentId
  }
}

/** 引用 → ContextPackItemV0（selected bucket，source=selected；无内容测量则 estimatedTokens=0，诚实不伪造）。 */
function contextPackItemFromReferenceV1(reference: OrderedRunReferenceV2): ContextPackItemV0 {
  const ref = reference.ref
  const viewId = referenceViewIdForBundleV1(reference)
  const entityId = referenceEntityIdForBundleV1(reference)
  return {
    viewId,
    ...(ref.type === 'artifact' ? { artifactId: ref.artifactId } : {}),
    title: `${ref.type}:${entityId.slice(0, 12)}`,
    bucket: 'selected',
    source: 'selected',
    level: 'L1',
    reason: '续工显式引用',
    provenance: `continuation:ordered-reference:${reference.order}`,
    estimatedTokens: 0,
  }
}
