import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const nativeCoreLiveContinuationServiceSource = 'lcos/apps/local-core/src/conversation-continuation-service.ts'
export const nativeCoreLiveContinuationContractSource = 'lcos/packages/contracts/src/conversation-continuation.ts'
export const nativeCoreLiveContinuationComposeSource = 'lcos/apps/local-core/src/compose.ts'

function canonical(source, sourcePath, relative, marker) {
  if (typeof source !== 'string') throw new TypeError('Original source text is required.')
  if (typeof sourcePath !== 'string' || path.resolve(sourcePath).toLowerCase() !== path.resolve(root, relative).toLowerCase())
    throw new Error('Live continuation adaptation requires its exact original sourcePath.')
  return source.includes(marker) ? null : source.replaceAll('\r\n', '\n')
}
function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Live continuation source seam changed; original sources remain read-only.')
  return source.replace(before, after)
}
const tick = String.fromCharCode(96)

export function transformNativeCoreLiveContinuationContract(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, nativeCoreLiveContinuationContractSource, 'native-live-continuation-request-owner')
  if (next === null) return source
  for (const name of ['ContinuationOperationJournalRowV1', 'ContinuationRecoveryProjectionV1']) {
    const start = next.indexOf('export interface ' + name + ' {')
    if (start < 0) throw new Error('Original continuation interface is missing.')
    const seam = '  readonly connectedConversationId: string | null'
    const index = next.indexOf(seam, start)
    if (index < 0 || index > next.indexOf('\n}', start)) throw new Error('Original continuation identity seam is missing.')
    next = next.slice(0, index) + next.slice(index).replace(seam, seam + '\n  /** native-live-continuation-request-owner: original submit source, distinct from the bound target. */\n  readonly requestConnectedConversationId?: string | null')
  }
  return once(next, '    connectedConversationId: row.connectedConversationId,', [
    '    connectedConversationId: row.connectedConversationId,',
    '    ...(row.requestConnectedConversationId === undefined ? {} : { requestConnectedConversationId: row.requestConnectedConversationId }),',
  ].join('\n'))
}

export function transformNativeCoreLiveContinuationService(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, nativeCoreLiveContinuationServiceSource, 'native-live-continuation-owner')
  if (next === null) return source
  next = once(next, [
    '    const runtimeThreadId = input.runtimeThreadId?.trim() || (',
    '      input.connectedConversationId === undefined',
    '        ? ' + tick + 'core-continuation-${randomUUID()}' + tick,
    '        : ' + tick + 'core-conversation-${input.connectedConversationId}' + tick,
    '    )',
  ].join('\n'), [
    '    // native-live-continuation-owner: a new conversation never borrows its source ACP thread.',
    "    const trustedSource = input.mode === 'continue_existing'",
    '      ? this.#trustedExistingIdentity(input.projectId, input.connectedConversationId, input.provider)',
    '      : undefined',
    '    const runtimeThreadId = input.runtimeThreadId?.trim() || trustedSource?.threadId || ' + tick + 'core-continuation-${randomUUID()}' + tick,
  ].join('\n'))
  next = once(next, '      connectedConversationId: input.connectedConversationId ?? null,', [
    '      connectedConversationId: input.connectedConversationId ?? null,',
    '      requestConnectedConversationId: input.connectedConversationId ?? null,',
  ].join('\n'))
  next = once(next, "      case 'recover_external':\n        return this.#recoverExternal", [
    "      case 'recover_external':",
    "        if (row.mode === 'continue_existing') this.#requireExistingIdentity(projectId, row, action)",
    '        return this.#recoverExternal',
  ].join('\n'))
  next = once(next, "      case 'recover_bind':\n        return this.#recoverBind", [
    "      case 'recover_bind':",
    "        if (row.mode === 'continue_existing') this.#requireExistingIdentity(projectId, row, action)",
    '        return this.#recoverBind',
  ].join('\n'))
  next = once(next, '  async #recoverExternal(', [
    '  #trustedExistingIdentity(projectId: string, sourceId: string | null | undefined, provider: string): {',
    '    externalSessionId: string; transportSessionId: string; threadId: string; agentletId: string; runtimeScope: string;',
    '  } | undefined {',
    '    if (sourceId == null) return undefined',
    '    const connected = this.metadata.getConnectedConversation(projectId, sourceId)',
    '    if (connected === undefined || connected.projectId !== projectId || connected.provider !== provider || connected.conversationSessionId === undefined) return undefined',
    '    const session = this.metadata.getConversationSessionRuntimeIdentity(projectId, connected.conversationSessionId)',
    '    if (session === undefined || session.projectId !== projectId || session.provider !== provider) return undefined',
    '    const origin = session.originMeta',
    '    const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim() !== "" && value === value.trim()',
    '    if (!nonempty(origin.continuationExternalSessionId) || origin.continuationExternalSessionId !== connected.conversationRef',
    '      || origin.continuationExternalSessionId.startsWith("pending-") || origin.continuationProvider !== provider',
    '      || !nonempty(origin.continuationThreadId) || !nonempty(origin.continuationTransportSessionId)',
    '      || !nonempty(origin.continuationAgentletId) || origin.continuationRuntimeScope !== projectId) return undefined',
    '    return { externalSessionId: origin.continuationExternalSessionId, transportSessionId: origin.continuationTransportSessionId,',
    '      threadId: origin.continuationThreadId, agentletId: origin.continuationAgentletId, runtimeScope: projectId }',
    '  }',
    '',
    '  #requireExistingIdentity(projectId: string, row: ContinuationOperationJournalRowV1, action: ContinuationActionV1) {',
    '    const sourceId = row.requestConnectedConversationId === undefined ? row.connectedConversationId : row.requestConnectedConversationId',
    '    const identity = this.#trustedExistingIdentity(projectId, sourceId, row.provider)',
    '    if (identity === undefined || row.runtimeThreadId !== identity.threadId',
    '      || (row.externalEvidence !== undefined && !continuationReceiptMatchesOwner(row.externalEvidence, identity))) {',
    '      throw new RecoveryActionUnsupportedError(action, "原对话没有可核实的外部连接身份，无法恢复；本次没有新建或发送。")',
    '    }',
    '    return identity',
    '  }',
    '',
    '  async #recoverExternal(',
  ].join('\n'))
  next = once(next, [
    '  ): Promise<ContinuationRecoveryProjectionV1> {',
    '    // native_full_fork：先试 provider native fork；unsupported → degrade 到 create + ContinuityAttachBundle，',
  ].join('\n'), [
    '  ): Promise<ContinuationRecoveryProjectionV1> {',
    "    if (row.mode === 'continue_existing') {",
    "      const identity = this.#requireExistingIdentity(projectId, row, 'recover_external')",
    '      const receipt = await adapter.continueExisting({ operationId, correlationId: operationId, provider: row.provider,',
    '        ...identity, bundle: continuationBundleForRowV1(row) })',
    "      if (receipt.outcome === 'resumed' && continuationReceiptMatchesOwner(receipt, identity)) {",
    '        const evidence = continuationExternalEvidenceFromReceiptV1(receipt)',
    '        if (evidence === undefined) throw new Error("Existing receipt has no provider session identity.")',
    "        return this.advanceStep(projectId, operationId, { step: 'external_create', outcome: 'confirmed', externalEvidence: evidence, expectedRevision: row.revision })",
    '      }',
    "      return this.advanceStep(projectId, operationId, { step: 'external_create',",
    "        outcome: receipt.outcome === 'outcome_unknown' || receipt.outcome === 'resumed' ? 'outcome_unknown' : 'failed',",
    '        expectedRevision: row.revision, errorEvidence: receipt.error?.message ?? "恢复回执与原对话身份不一致；本次未绑定或发送。" })',
    '    }',
    '    // native_full_fork：先试 provider native fork；unsupported → degrade 到 create + ContinuityAttachBundle，',
  ].join('\n'))
  next = once(next, "        const boundExternalSessionId = receipt.externalSessionId ?? externalSessionId\n        const evidence = continuationExternalEvidenceFromReceiptV1(receipt)", [
    '        const boundExternalSessionId = receipt.externalSessionId ?? externalSessionId',
    '        if (row.externalEvidence !== undefined && !continuationReceiptMatchesOwner(receipt, row.externalEvidence)) {',
    '          throw new Error("恢复回执与已确认的外部连接身份不一致；没有更改原对话。")',
    '        }',
    "        if (row.mode !== 'continue_existing' && this.metadata.getConnectedConversationByRef(projectId, boundExternalSessionId) !== undefined) {",
    '          throw new Error("新建返回了已绑定的对话身份；没有更改原对话。")',
    '        }',
    '        const evidence = continuationExternalEvidenceFromReceiptV1(receipt)',
  ].join('\n'))
  next = once(next, '          fallbackConnectedConversationId: row.connectedConversationId ?? ' + tick + 'connected-conversation-${randomUUID()}' + tick + ',', [
    "          fallbackConnectedConversationId: row.mode === 'continue_existing' && row.connectedConversationId !== null",
    '            ? row.connectedConversationId : ' + tick + 'connected-conversation-${randomUUID()}' + tick + ',',
  ].join('\n'))
  next = once(next, [
    '  const runtimeThreadId = input.runtimeThreadId?.trim() || (',
    '    input.connectedConversationId === undefined',
    '      ? undefined',
    '      : ' + tick + 'core-conversation-${input.connectedConversationId}' + tick,
    '  )',
  ].join('\n'), [
    '  const originalRequestRecorded = existing.requestConnectedConversationId !== undefined',
    '  const runtimeThreadId = input.runtimeThreadId?.trim() || (',
    '    !originalRequestRecorded && input.connectedConversationId !== undefined',
    '      ? ' + tick + 'core-conversation-${input.connectedConversationId}' + tick + ' : undefined',
    '  )',
  ].join('\n'))
  next = once(next, '    && existing.connectedConversationId === (input.connectedConversationId ?? null)', '    && (originalRequestRecorded ? existing.requestConnectedConversationId : existing.connectedConversationId) === (input.connectedConversationId ?? null)')
  next += '\n' + [
    '/** Compare only original receipt identity fields, never titles/history or a substitute session. */',
    'function continuationReceiptMatchesOwner(actual: { readonly externalSessionId?: string; readonly transportSessionId?: string; readonly threadId?: string; readonly agentletId?: string; readonly runtimeScope?: string },',
    '  expected: { readonly externalSessionId: string; readonly transportSessionId?: string; readonly threadId?: string; readonly agentletId?: string; readonly runtimeScope?: string }): boolean {',
    '  return actual.externalSessionId === expected.externalSessionId',
    "    && (['transportSessionId', 'threadId', 'agentletId', 'runtimeScope'] as const).every(key => expected[key] === undefined || actual[key] === expected[key])",
    '}',
  ].join('\n') + '\n'
  return next
}

export function transformNativeCoreLiveContinuationCompose(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, nativeCoreLiveContinuationComposeSource, 'native-live-continuation-timeout')
  if (next === null) return source
  next = once(next, '        hostBaseUrl: process.env.HUABU_HOST_URL,', [
    '        hostBaseUrl: process.env.HUABU_HOST_URL,',
    '        // native-live-continuation-timeout: retain the original default unless explicitly configured.',
    '        ...((value => Number.isInteger(value) && value > 0 && value <= 360_000 ? { timeoutMs: value } : {})(Number(process.env.HUABU_HOST_TIMEOUT_MS))),',
  ].join('\n'))
  next = once(next, '  let recoveryAdapter: HuabuAgentletContinuationAdapterV1 | undefined = undefined', [
    '  let recoveryAdapter: HuabuAgentletContinuationAdapterV1 | undefined = undefined',
    '  let liveContinuationTransport: HuabuAgentletHostTransportV1 | undefined',
  ].join('\n'))
  next = once(next, '      new HuabuAgentletHostTransportV1({', '      (liveContinuationTransport = new HuabuAgentletHostTransportV1({')
  next = once(next, "        ...(process.env.HUABU_AGENTLET_SPAWN_CWD === undefined ? {} : { spawnCwd: process.env.HUABU_AGENTLET_SPAWN_CWD }),\n      }),", "        ...(process.env.HUABU_AGENTLET_SPAWN_CWD === undefined ? {} : { spawnCwd: process.env.HUABU_AGENTLET_SPAWN_CWD }),\n      })),")
  next = once(next, '    : async () => {\n        try {\n          return await recoveryAdapter.probe({', '    : async (target?: { projectId: string; connectedConversationId: string }) => {\n        try {\n          const snapshot = await recoveryAdapter.probe({')
  next = once(next, '            probeId: '+tick+'collab-read:${Date.now()}'+tick+',\n          })\n        } catch {', [
    '            probeId: '+tick+'collab-read:${Date.now()}'+tick+',',
    '          })',
    '          // Read only the same original transport and canonical identity; journal bind alone is not a live owner.',
    '          if (liveContinuationTransport === undefined || target === undefined || metadata === undefined) return snapshot',
    '          const connected = metadata.getConnectedConversation(target.projectId, target.connectedConversationId)',
    '          const session = connected?.conversationSessionId === undefined ? undefined : metadata.getConversationSessionRuntimeIdentity(target.projectId, connected.conversationSessionId)',
    '          const origin = session?.originMeta',
    '          const text = (value: unknown): value is string => typeof value === "string" && value.trim() !== "" && value === value.trim()',
    '          const trusted = connected !== undefined && session !== undefined && session.provider === connected.provider',
    '            && origin?.continuationProvider === connected.provider && origin.continuationExternalSessionId === connected.conversationRef',
    '            && text(origin.continuationExternalSessionId) && text(origin.continuationTransportSessionId)',
    '            && text(origin.continuationThreadId) && text(origin.continuationAgentletId) && origin.continuationRuntimeScope === target.projectId',
    '            && origin.continuationAgentletId === (process.env.HUABU_AGENTLET_ID ?? "lcos-default-agentlet")',
    '          const unavailable = (reason: string, untrusted = false) => ({ ...snapshot, session: { ...snapshot.session,',
    '            send: { value: "unknown" as const, source: "gateway_probe" as const, observedAt: new Date().toISOString(), limitation: reason },',
    '            ...(untrusted ? { continueExisting: { value: "unknown" as const, source: "protocol_inspection" as const, observedAt: new Date().toISOString(), limitation: reason } } : {}),',
    '          } })',
    '          if (!trusted || origin === undefined) return unavailable("暂时无法恢复这条对话，请重新连接。", true)',
    '          try {',
    '            const observed = await liveContinuationTransport.getSession(origin.continuationAgentletId as string, origin.continuationTransportSessionId as string)',
    '            if (observed === undefined || observed.status !== "connected"',
    '              || observed.externalSessionId !== origin.continuationExternalSessionId',
    '              || observed.transportSessionId !== origin.continuationTransportSessionId',
    '              || observed.threadId !== origin.continuationThreadId) return unavailable("会话已断开，请重新连接。")',
    '            return snapshot',
    '          } catch { return unavailable("暂时无法连接，请核对或重新连接。") }',
    '        } catch {',
  ].join('\n'))
  return next
}

export function createNativeCoreLiveContinuationTransforms() {
  return {
    [nativeCoreLiveContinuationServiceSource]: transformNativeCoreLiveContinuationService,
    [nativeCoreLiveContinuationContractSource]: transformNativeCoreLiveContinuationContract,
    [nativeCoreLiveContinuationComposeSource]: transformNativeCoreLiveContinuationCompose,
    ['lcos/apps/local-core/src/collaboration-projection-service.ts']: transformNativeCoreLiveContinuationProjection,
    ['lcos/apps/local-core/src/huabu-agentlet-host-transport.ts']: transformNativeCoreLiveContinuationHostTransport,
    ['lcos/huabu/external/agenetes/packages/acp-driver/src/client.ts']: transformNativeCoreLiveAcpClientIdentity,
    ['lcos/huabu/external/agenetes/packages/acp-driver/src/session.ts']: transformNativeCoreLiveAcpEnsureConnection,
    ['lcos/huabu/external/agenetes/packages/acp-driver/src/spawn-orchestrator.ts']: transformNativeCoreLiveSpawnConnection,
    ['lcos/huabu/external/agenetes/packages/acp-driver/src/session-registry.ts']: transformNativeCoreLiveAcpRegistryIdentity,
    ['lcos/huabu/apps/server/src/modules/agent/acp/continuation-transport.route.ts']: transformNativeCoreLiveHostOwnerProjection,
  }
}

export function transformNativeCoreLiveContinuationHostTransport(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, 'lcos/apps/local-core/src/huabu-agentlet-host-transport.ts', 'native-live-continuation-create-declaration')
  if (next === null) return source
  next = once(next, '        orderedReferences: params.orderedReferences,', [
    '        // Wire representation follows Core full-by-default; the caller/journal refs remain unchanged.',
    "        orderedReferences: params.orderedReferences.map(reference => ({ ...reference, mode: reference.mode ?? 'full' })),",
  ].join('\n'))
  next = once(next, '        ...(params.contextAttachment === undefined ? {} : { contextAttachment: params.contextAttachment }),', [
    '        ...(params.contextAttachment === undefined ? {} : { contextAttachment: {',
    '          ...params.contextAttachment,',
    "          orderedReferences: params.contextAttachment.orderedReferences.map(reference => ({ ...reference, mode: reference.mode ?? 'full' })),",
    '        } }),',
  ].join('\n'))

  next = once(next, '          status: claim(),', [
    '          // native-live-continuation-create-declaration: reachable Host + an explicit spawn recipe, not proof of a created session.',
    '          ...(typeof this.options.spawnCommand === "string" && this.options.spawnCommand.trim() !== ""',
    '            ? { createSession: { value: true as const, source: "adapter_declaration" as const, observedAt: now, evidenceRef: "HuabuAgentletHostTransportV1.spawn" },',
    '                continueExisting: { value: true as const, source: "adapter_declaration" as const, observedAt: now, evidenceRef: "HuabuAgentletHostTransportV1.spawn:externalSessionId" } } : {}),',
    '          status: claim(),',
  ].join('\n'))
  return once(next, "          'create/continue/cancel are delegated to Huabu Host but are not probed because they have external side effects',", [
    "          'createSession is declared only for a reachable Host with an explicit spawn recipe; no session is created during the probe',",
    "          'continueExisting declares only an exact prior-session attempt; success requires original provider resume/load and canonical identity proof, never fallback create',",
    "          'cancel remains unprobed because it has external side effects',",
  ].join('\n'))
}

export function transformNativeCoreLiveContinuationProjection(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, 'lcos/apps/local-core/src/collaboration-projection-service.ts', 'native-live-target-capability')
  if (next === null) return source
  next = once(next, 'export type CollaborationCapabilityProbe = () => Promise<ProviderContinuationCapabilitySnapshotV1 | undefined>', [
    '// native-live-target-capability: the existing probe reads this exact canonical target.',
    'export type CollaborationCapabilityProbe = (target?: { projectId: string; connectedConversationId: string }) => Promise<ProviderContinuationCapabilitySnapshotV1 | undefined>',
  ].join('\n'))
  next = once(next, '    const snapshot = await this.probeSafely()', '    const snapshot = await this.probeSafely({ projectId, connectedConversationId })')
  next = once(next, '  private async probeSafely(): Promise<ProviderContinuationCapabilitySnapshotV1 | undefined> {', '  private async probeSafely(target: { projectId: string; connectedConversationId: string }): Promise<ProviderContinuationCapabilitySnapshotV1 | undefined> {')
  next = once(next, '      return await this.probeCapability()', '      return await this.probeCapability(target)')
  return next
}

export function transformNativeCoreLiveAcpClientIdentity(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, 'lcos/huabu/external/agenetes/packages/acp-driver/src/client.ts', 'native-live-client-transport')
  if (next === null) return source
  next = once(next, '  constructor(connection: AgentConnection, opts: AcpAgentClientOptions) {', '  constructor(private readonly connection: AgentConnection, opts: AcpAgentClientOptions) {')
  return once(next, '  get isClosed(): boolean {', [
    '  /** native-live-client-transport: read the identity from the original connection, never a second session map. */',
    '  get transportSessionId(): string { return this.connection.sessionId; }',
    '  isConnectedTo(connection: AgentConnection | undefined): boolean { return !this._closed && connection === this.connection && connection?.status === "connected"; }',
    '',
    '  get isClosed(): boolean {',
  ].join('\n'))
}
export function transformNativeCoreLiveAcpRegistryIdentity(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, 'lcos/huabu/external/agenetes/packages/acp-driver/src/session-registry.ts', 'native-live-registry-transport')
  if (next === null) return source
  return once(next, '  /** Register a fresh session for one placement/thread pair. */', [
    '  /** native-live-registry-transport: exact original connection lookup; ambiguity and closed owners fail closed. */',
    '  getByTransportSession(agentletId: string, transportSessionId: string, connection: Parameters<AcpAgentClient["isConnectedTo"]>[0]): AcpSessionEntry | undefined {',
    '    const owners = [...this.byPlacementAndThread.values()].filter(entry => entry.agentletId === agentletId',
    '      && !entry.client.isClosed && entry.client.transportSessionId === transportSessionId && entry.client.isConnectedTo(connection));',
    '    return owners.length === 1 ? owners[0] : undefined;',
    '  }',
    '',
    '  /** Register a fresh session for one placement/thread pair. */',
  ].join('\n'))
}
export function transformNativeCoreLiveHostOwnerProjection(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, 'lcos/huabu/apps/server/src/modules/agent/acp/continuation-transport.route.ts', 'native-live-host-owner-projection')
  if (next === null) return source
  return once(next, [
    '  const threadId = asThreadId(profile?.appId);',
    '  const owner =',
    '    threadId === undefined',
    '      ? undefined',
    '      : acpSessionRegistry.get(connection.agentletId, threadId);',
  ].join('\n'), [
    '  // native-live-host-owner-projection: daemon hello need not carry appId.',
    '  const candidate = acpSessionRegistry.getByTransportSession(connection.agentletId, connection.sessionId, connection);',
    '  const hintedThread = asThreadId(profile?.appId);',
    '  const owner = candidate !== undefined && (hintedThread === undefined || hintedThread === candidate.threadId) ? candidate : undefined;',
    '  const threadId = owner?.threadId;',
  ].join('\n'))
}

export function transformNativeCoreLiveAcpEnsureConnection(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, 'lcos/huabu/external/agenetes/packages/acp-driver/src/session.ts', 'native-live-ensure-current-connection')
  if (next === null) return source
  return once(next, '  const registeredEntry = acpSessionRegistry.get(agentletId, threadId);', [
    '  const registeredEntry = acpSessionRegistry.get(agentletId, threadId);',
    '  // native-live-ensure-current-connection: a reused transport id is not the same live connection.',
    '  if (registeredEntry && !registeredEntry.client.isClosed',
    '    && !registeredEntry.client.isConnectedTo(gateway.getSession(agentletId, registeredEntry.client.transportSessionId))) {',
    '    registeredEntry.client.shutdown("transport_connection_unavailable");',
    '  }',
  ].join('\n'))
}
export function transformNativeCoreLiveSpawnConnection(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, 'lcos/huabu/external/agenetes/packages/acp-driver/src/spawn-orchestrator.ts', 'native-live-spawn-current-connection')
  if (next === null) return source
  next = once(next, 'interface CachedAgent {', 'interface CachedAgent {\n  /** native-live-spawn-current-connection: original gateway handle, not a second identity map. */\n  connection?: object;')
  next = once(next, "    if (conn && conn.status === 'connected') {", "    if (conn && conn.status === 'connected' && conn === cached.connection) {")
  return once(next, '  threadToAgent.set(cacheKey, {\n    sessionId,', '  threadToAgent.set(cacheKey, {\n    connection: gateway.getSession(agentlet.agentletId, sessionId),\n    sessionId,')
}
