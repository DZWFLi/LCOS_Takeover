const handlers = new Map(); let owner; let gatewayConnection;
import {acpSessionRegistry} from "../../../../lcos/huabu/external/agenetes/packages/acp-driver/src/session-registry.ts"
const gateway = { getAgentlet: id => id===owner?.agentletId ? {status:"connected"} : undefined, getSession: (id,sessionId) => id===owner?.agentletId && sessionId===gatewayConnection?.sessionId ? gatewayConnection : undefined };
const getAgentletGateway = () => gateway;
const forbidden = () => { throw new Error("Unexpected side effect in original handler regression"); };
const ensureAcpSession = forbidden, forwardAcpPermissionRequestToCore = forbidden, answerProviderRunInput = forbidden, registerProviderRunInput = forbidden, removeProviderRunInput = forbidden, reportEntryState = forbidden;
function errorBody(code: string, message: string): ContinuationErrorBody {
  return { error: { code, message } };
}
function connectedGateway(
  agentletId: string,
):
  | { ok: true; gateway: NonNullable<ReturnType<typeof getAgentletGateway>> }
  | { ok: false; status: 503; body: ContinuationErrorBody } {
  const gateway = getAgentletGateway();
  if (gateway === null) {
    return {
      ok: false,
      status: 503,
      body: errorBody(
        'bridge_not_mounted',
        'Huabu Agentlet Gateway is not mounted.',
      ),
    };
  }
  const agentlet = gateway.getAgentlet(agentletId);
  if (agentlet === undefined || agentlet.status !== 'connected') {
    return {
      ok: false,
      status: 503,
      body: errorBody(
        'placement_unavailable',
        `Agentlet ${agentletId} is not connected.`,
      ),
    };
  }
  return { ok: true, gateway };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function asThreadId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}
function asReference(value: unknown): AcpContinuationReference | undefined {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.order) ||
    (value.order as number) < 0 ||
    !isRecord(value.ref)
  )
    return undefined;
  const type = value.ref.type;
  if (
    ![
      'artifact',
      'view',
      'scope',
      'workspace',
      'conversation',
      'component',
    ].includes(String(type))
  )
    return undefined;
  const identityKey =
    type === 'artifact'
      ? 'artifactId'
      : type === 'view'
        ? 'viewId'
        : type === 'scope'
          ? 'scopeId'
          : type === 'workspace'
            ? 'workspaceId'
            : type === 'conversation'
              ? 'conversationSessionId'
              : 'componentId';
  if (
    typeof value.ref[identityKey] !== 'string' ||
    String(value.ref[identityKey]).trim() === ''
  )
    return undefined;
  const mode = value.mode;
  if (
    mode !== undefined &&
    !['full', 'summary', 'structure'].includes(String(mode))
  )
    return undefined;
  const ref: Record<string, string | undefined> & { type: string } = {
    type: String(type),
    [identityKey]: String(value.ref[identityKey]),
  };
  if (type === 'artifact' && typeof value.ref.revisionId === 'string')
    ref.revisionId = value.ref.revisionId;
  if (type === 'component' && typeof value.ref.presentationId === 'string')
    ref.presentationId = value.ref.presentationId;
  return {
    order: value.order as number,
    ...(mode === undefined
      ? {}
      : { mode: mode as 'full' | 'summary' | 'structure' }),
    ref,
  };
}
function asOrderedReferences(
  value: unknown,
): readonly AcpContinuationReference[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const references = value.map(asReference);
  if (references.some((reference) => reference === undefined)) return undefined;
  const concrete = references as AcpContinuationReference[];
  if (
    new Set(concrete.map((reference) => reference.order)).size !==
    concrete.length
  )
    return undefined;
  return concrete;
}
function asResolvedReferences(
  value: unknown,
): readonly AcpResolvedContinuationReference[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const references = value.map(
    (item): AcpResolvedContinuationReference | undefined => {
      const base = asReference(item);
      if (
        base === undefined ||
        !isRecord(item) ||
        typeof item.title !== 'string' ||
        item.title.trim() === '' ||
        item.mimeType !== 'text/plain' ||
        typeof item.text !== 'string' ||
        item.text.trim() === ''
      )
        return undefined;
      return {
        ...base,
        title: item.title,
        mimeType: 'text/plain',
        text: item.text,
      };
    },
  );
  if (references.some((reference) => reference === undefined)) return undefined;
  return references as AcpResolvedContinuationReference[];
}
function asContextResolution(
  value: unknown,
): readonly AcpContinuationResolutionEvidence[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const evidence = value.map(
    (item): AcpContinuationResolutionEvidence | undefined => {
      const base = asReference(item);
      // native-mixed-scope-host: keep original manifest/session/message owner.
      if (base !== undefined && isRecord(item) && item.kind === 'scope') {
        if (base.ref.type !== 'scope' || base.mode !== 'full'
          || typeof item.scopeId !== 'string' || item.scopeId !== base.ref.scopeId
          || typeof item.presentationId !== 'string' || item.presentationId.trim() === ''
          || typeof item.title !== 'string' || item.title.trim() === ''
          || typeof item.text !== 'string' || item.text.trim() === '' || item.text.length > 200_000
          || !Array.isArray(item.members) || item.members.length === 0
          || item.members.some(member => !isRecord(member) || !isRecord(member.ref) || typeof member.ref.type !== 'string' || typeof member.ref.id !== 'string' || !Array.isArray(member.path)))
          return undefined;
        return { ...base, kind: 'scope', scopeId: item.scopeId, presentationId: item.presentationId,
          title: item.title, text: item.text, members: item.members };
      }
      if (
        base === undefined ||
        !isRecord(item) ||
        typeof item.artifactId !== 'string' ||
        item.artifactId.trim() === '' ||
        typeof item.revisionId !== 'string' ||
        item.revisionId.trim() === '' ||
        typeof item.fileRecordId !== 'string' ||
        item.fileRecordId.trim() === '' ||
        typeof item.contentHash !== 'string' ||
        item.contentHash.trim() === '' ||
        typeof item.title !== 'string' ||
        item.title.trim() === ''
      )
        return undefined;
      return {
        ...base,
        artifactId: item.artifactId,
        revisionId: item.revisionId,
        fileRecordId: item.fileRecordId,
        contentHash: item.contentHash,
        title: item.title,
      };
    },
  );
  if (evidence.some((item) => item === undefined)) return undefined;
  return evidence as AcpContinuationResolutionEvidence[];
}
function contextAttachmentId(
  threadId: string,
  messageId: string,
  correlationId: string,
): string {
  return `lcos-context:${encodeURIComponent(threadId)}:${encodeURIComponent(messageId)}:${encodeURIComponent(correlationId)}`;
}
function asContextManifestBody(body: ContextAttachmentBody):
  | (AcpContinuationContextManifest & {
      readonly threadId: string;
      readonly externalSessionId: string;
    })
  | undefined {
  const threadId = asThreadId(body.threadId);
  const externalSessionId = asThreadId(body.externalSessionId);
  const messageId = asThreadId(body.messageId);
  const correlationId = asThreadId(body.correlationId);
  const orderedReferences = asOrderedReferences(body.orderedReferences);
  const contextResolution = asContextResolution(body.contextResolution);
  if (
    threadId === undefined ||
    externalSessionId === undefined ||
    messageId === undefined ||
    correlationId === undefined ||
    orderedReferences === undefined ||
    contextResolution === undefined ||
    contextResolution.length !== orderedReferences.length
  )
    return undefined;
  for (let index = 0; index < orderedReferences.length; index += 1) {
    const ordered = orderedReferences[index];
    const resolved = contextResolution[index];
    if (
      ordered === undefined ||
      resolved === undefined ||
      ordered.order !== resolved.order ||
      JSON.stringify(ordered.ref) !== JSON.stringify(resolved.ref) ||
      ordered.mode !== resolved.mode
    )
      return undefined;
  }
  return {
    threadId,
    externalSessionId,
    messageId,
    correlationId,
    attachmentId: contextAttachmentId(threadId, messageId, correlationId),
    orderedReferences,
    contextResolution,
  };
}
function supportsEmbeddedContext(owner: AcpSessionEntry): boolean {
  const capabilities = owner.client.initializeResult?.agentCapabilities;
  if (!isRecord(capabilities)) return false;
  const promptCapabilities = capabilities.promptCapabilities;
  return (
    isRecord(promptCapabilities) && promptCapabilities.embeddedContext === true
  );
}
function asContextAttachment(
  value: unknown,
  threadId: string,
  externalSessionId: string,
): AcpContinuationContextAttachment | undefined {
  if (!isRecord(value)) return undefined;
  const manifest = asContextManifestBody({
    ...value,
    threadId,
    externalSessionId,
  });
  const resolvedReferences = asResolvedReferences(value.resolvedReferences);
  if (
    manifest === undefined ||
    value.attachmentId !== manifest.attachmentId ||
    resolvedReferences === undefined ||
    resolvedReferences.length !== manifest.orderedReferences.length
  )
    return undefined;
  for (let index = 0; index < manifest.orderedReferences.length; index += 1) {
    const resolution = manifest.contextResolution[index];
    const resolved = resolvedReferences[index];
    if (
      resolution === undefined ||
      resolved === undefined ||
      resolution.order !== resolved.order ||
      resolution.mode !== resolved.mode ||
      JSON.stringify(resolution.ref) !== JSON.stringify(resolved.ref) ||
      resolution.title !== resolved.title ||
      ('kind' in resolution && resolution.kind === 'scope' && resolution.text !== resolved.text)
    )
      return undefined;
  }
  return { ...manifest, resolvedReferences };
}
function asPromptBody(body: PromptBody):
  | {
      readonly threadId: string;
      readonly externalSessionId: string;
      readonly text: string;
      readonly runtimeScope?: string;
      readonly runCorrelation?: LcosRunCorrelation;
      readonly contextAttachment?: AcpContinuationContextAttachment;
    }
  | undefined {
  const threadId = asThreadId(body.threadId);
  const externalSessionId = asThreadId(body.externalSessionId);
  if (
    threadId === undefined ||
    externalSessionId === undefined ||
    typeof body.text !== 'string' ||
    body.text.trim() === ''
  )
    return undefined;
  if (
    body.runCorrelation !== undefined &&
    (!isRecord(body.runCorrelation) ||
      typeof body.runCorrelation.lcosRunId !== 'string' ||
      body.runCorrelation.lcosRunId.trim() === '' ||
      typeof body.runCorrelation.externalTaskId !== 'string' ||
      body.runCorrelation.externalTaskId.trim() === '' ||
      Object.keys(body.runCorrelation).some(
        (key) => !['lcosRunId', 'externalTaskId'].includes(key),
      ))
  ) {
    return undefined;
  }
  const contextAttachment =
    body.contextAttachment === undefined
      ? undefined
      : asContextAttachment(
          body.contextAttachment,
          threadId,
          externalSessionId,
        );
  if (body.contextAttachment !== undefined && contextAttachment === undefined)
    return undefined;
  return {
    threadId,
    externalSessionId,
    text: body.text,
    ...(typeof body.runtimeScope === 'string' && body.runtimeScope.trim() !== ''
      ? { runtimeScope: body.runtimeScope.trim() }
      : {}),
    ...(isRecord(body.runCorrelation) &&
    typeof body.runCorrelation.lcosRunId === 'string' &&
    body.runCorrelation.lcosRunId.trim() !== '' &&
    typeof body.runCorrelation.externalTaskId === 'string' &&
    body.runCorrelation.externalTaskId.trim() !== ''
      ? {
          runCorrelation: {
            lcosRunId: body.runCorrelation.lcosRunId.trim(),
            externalTaskId: body.runCorrelation.externalTaskId.trim(),
          },
        }
      : {}),
    ...(contextAttachment === undefined ? {} : { contextAttachment }),
  };
}
async function ensureContinuationOwner(
  app: Parameters<FastifyPluginAsync>[0],
  agentletId: string,
  threadId: string,
  sessionSpec: Extract<SpawnParams['sessionSpec'], { command?: string }>,
  runtimeScope: string | undefined,
  priorSessionId?: string,
) {
  const command = sessionSpec.command;
  if (typeof command !== 'string' || command.trim() === '')
    throw new Error('Continuation ACP owner requires an ACP command.');
  return ensureAcpSession({
    agentletId,
    threadId,
    binding: {
      alias: 'LCOS continuation',
      profileId: `continuation:${threadId}`,
    },
    cwd: sessionSpec.cwd,
    recipe: {
      command,
      cwd: sessionSpec.cwd,
      autoRestart: true,
      alias: 'LCOS continuation',
    },
    namespace: { name: runtimeScope ?? threadId },
    ...(priorSessionId === undefined ? {} : { priorSessionId }),
    logger: app.log,
  });
}
function projectSession(connection: AgentletConnection): {
  readonly agentletId: string;
  readonly sessionId: string;
  readonly externalSessionId?: string;
  readonly transportSessionId: string;
  readonly appId?: string;
  readonly pid?: number;
  readonly cwd?: string;
  readonly status: string;
  readonly threadId?: string;
} {
  const profile = connection.sessionProfile;
  // native-live-host-owner-projection: daemon hello need not carry appId.
  const candidate = acpSessionRegistry.getByTransportSession(connection.agentletId, connection.sessionId);
  const hintedThread = asThreadId(profile?.appId);
  const owner = candidate !== undefined && (hintedThread === undefined || hintedThread === candidate.threadId) ? candidate : undefined;
  const threadId = owner?.threadId;
  return {
    agentletId: connection.agentletId,
    sessionId: connection.sessionId,
    transportSessionId: connection.sessionId,
    ...(owner === undefined ? {} : { externalSessionId: owner.sessionId }),
    ...(typeof profile?.appId === 'string' ? { appId: profile.appId } : {}),
    ...(profile?.agent === undefined
      ? {}
      : { pid: profile.agent.pid, cwd: profile.agent.cwd }),
    status: connection.status,
    ...(threadId === undefined ? {} : { threadId }),
  };
}
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function textFromUpdate(update: SessionUpdate): string {
  const envelope = record(update);
  const content = record(envelope?.content);
  return envelope?.sessionUpdate === 'agent_message_chunk' &&
    content?.type === 'text' &&
    typeof content.text === 'string'
    ? content.text
    : '';
}
function referenceIdentity(reference: AcpContinuationReference): string {
  const ref = reference.ref;
  return (
    ref.artifactId ??
    ref.viewId ??
    ref.scopeId ??
    ref.workspaceId ??
    ref.conversationSessionId ??
    ref.componentId ??
    'unknown'
  );
}
export function continuationReferenceBlocks(
  attachment: AcpContinuationContextAttachment,
): AcpContentBlock[] {
  return [...attachment.resolvedReferences]
    .sort((left, right) => left.order - right.order)
    .map((reference) => {
      const identity = referenceIdentity(reference);
      const resolution = attachment.contextResolution.find(
        (item) => item.order === reference.order,
      );
      return {
        type: 'resource' as const,
        resource: {
          uri: `lcos://reference/${encodeURIComponent(reference.ref.type)}/${encodeURIComponent(identity)}`,
          mimeType: reference.mimeType,
          text: reference.text,
        },
        _meta: {
          lcos: {
            attachmentId: attachment.attachmentId,
            messageId: attachment.messageId,
            correlationId: attachment.correlationId,
            order: reference.order,
            mode: reference.mode ?? 'full',
            ref: reference.ref,
            ...(resolution === undefined
              ? {}
              : {
                  resolution: resolution.kind === 'scope'
                    ? { kind: 'scope', scopeId: resolution.scopeId, presentationId: resolution.presentationId, members: resolution.members }
                    : { artifactId: resolution.artifactId, revisionId: resolution.revisionId, contentHash: resolution.contentHash },
                }),
          },
        },
      };
    });
}
export async function promptExistingAcpSession(
  entry: AcpSessionEntry,
  text: string,
  contextAttachment?: AcpContinuationContextAttachment,
  signal?: AbortSignal,
  onPermissionRequest?: PermissionNotifier,
): Promise<AcpContinuationPromptReceipt> {
  if (entry.selectionsReplay !== null) await entry.selectionsReplay;
  let assembled = '';
  const blocks: AcpContentBlock[] = [
    ...(contextAttachment === undefined
      ? []
      : continuationReferenceBlocks(contextAttachment)),
    { type: 'text', text },
  ];
  const result = await entry.client.prompt(
    entry.sessionId,
    blocks,
    (update) => {
      assembled += textFromUpdate(update);
    },
    signal,
    onPermissionRequest ??
      ((request) => {
        // A continuation without an LCOS-correlated input owner still fails
        // closed. The Host route supplies a notifier only after validating
        // the canonical Run + external Task correlation.
        entry.client.resolvePermission(request.requestId, { cancelled: true });
      }),
  );
  if (!entry.persistedToDisk) {
    entry.persistedToDisk = true;
    reportEntryState(entry);
  }
  return {
    text: assembled,
    ...(result.stopReason === undefined
      ? {}
      : { stopReason: result.stopReason }),
  };
}
const continuationTransportRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: AnswerProviderInputBody }>(
    '/continuation/input-request',
    async (request, reply) => {
      const body = request.body ?? {};
      const correlation = isRecord(body.correlation)
        ? body.correlation
        : undefined;
      if (
        correlation === undefined ||
        typeof correlation.lcosRunId !== 'string' ||
        correlation.lcosRunId.trim() === '' ||
        typeof correlation.externalTaskId !== 'string' ||
        correlation.externalTaskId.trim() === '' ||
        typeof body.requestId !== 'string' ||
        body.requestId.trim() === '' ||
        !Array.isArray(body.selectedOptions) ||
        body.selectedOptions.some((value) => typeof value !== 'string')
      ) {
        return reply
          .status(400)
          .send(
            errorBody(
              'invalid_input_response',
              'Run correlation, requestId and selectedOptions are required.',
            ),
          );
      }
      const result = answerProviderRunInput(
        {
          lcosRunId: correlation.lcosRunId.trim(),
          externalTaskId: correlation.externalTaskId.trim(),
        },
        body.requestId.trim(),
        body.selectedOptions as string[],
      );
      if (result === 'not_found') {
        return reply
          .status(404)
          .send(
            errorBody(
              'provider_input_not_found',
              'No suspended ACP permission request matches this Run correlation.',
            ),
          );
      }
      if (result !== 'answered') {
        return reply
          .status(409)
          .send(
            errorBody(
              result,
              'The selected option cannot resolve this ACP permission request.',
            ),
          );
      }
      return { handled: true };
    },
  );

  app.get<{ Params: AgentletParams }>(
    '/continuation/agentlets/:agentletId/sessions',
    async (request, reply) => {
      const target = connectedGateway(request.params.agentletId);
      if (!target.ok) return reply.status(target.status).send(target.body);
      try {
        const result = await target.gateway.listOnAgentlet(
          request.params.agentletId,
        );
        return {
          agentletId: request.params.agentletId,
          agents: result.agents.map((agent) => {
            const connection = target.gateway.getSession(
              request.params.agentletId,
              agent.sessionId,
            );
            return connection === undefined
              ? agent
              : projectSession(connection);
          }),
        };
      } catch (error: unknown) {
        return reply
          .status(503)
          .send(
            errorBody(
              'gateway_list_failed',
              error instanceof Error ? error.message : String(error),
            ),
          );
      }
    },
  );

  app.post<{ Params: AgentletParams; Body: SpawnBody }>(
    '/continuation/agentlets/:agentletId/sessions',
    async (request, reply) => {
      const input = asSpawnParams(request.body ?? {});
      if (input === undefined) {
        return reply
          .status(400)
          .send(
            errorBody(
              'invalid_spawn_request',
              'appId and sessionSpec are required.',
            ),
          );
      }
      const target = connectedGateway(request.params.agentletId);
      if (!target.ok) return reply.status(target.status).send(target.body);
      try {
        const threadId = asThreadId((request.body ?? {}).threadId);
        if (threadId !== undefined) {
          const body = request.body ?? {};
          const owner = await ensureContinuationOwner(
            app,
            request.params.agentletId,
            threadId,
            input.sessionSpec as Extract<
              SpawnParams['sessionSpec'],
              { command?: string }
            >,
            typeof body.runtimeScope === 'string'
              ? body.runtimeScope
              : undefined,
            asThreadId(body.externalSessionId),
          );
          const connection = target.gateway.getSession(
            request.params.agentletId,
            owner.sessionId,
          );
          return {
            agentletId: request.params.agentletId,
            sessionId: owner.sessionId,
            externalSessionId: owner.sessionId,
            transportSessionId: owner.sessionId,
            threadId,
            ...(connection?.sessionProfile?.agent?.pid === undefined
              ? {}
              : { pid: connection.sessionProfile.agent.pid }),
            ...(connection?.sessionProfile?.agent?.cwd === undefined
              ? {}
              : { cwd: connection.sessionProfile.agent.cwd }),
          };
        }
        const result = await target.gateway.spawnOnAgentlet(
          request.params.agentletId,
          input,
        );
        return { agentletId: request.params.agentletId, ...result };
      } catch (error: unknown) {
        return reply
          .status(503)
          .send(
            errorBody(
              'gateway_spawn_failed',
              error instanceof Error ? error.message : String(error),
            ),
          );
      }
    },
  );

  app.get<{ Params: SessionParams }>(
    '/continuation/agentlets/:agentletId/sessions/:sessionId',
    async (request, reply) => {
      const target = connectedGateway(request.params.agentletId);
      if (!target.ok) return reply.status(target.status).send(target.body);
      const session = target.gateway.getSession(
        request.params.agentletId,
        request.params.sessionId,
      );
      if (session === undefined) {
        return reply
          .status(404)
          .send(
            errorBody('session_not_found', 'Agentlet session was not found.'),
          );
      }
      return projectSession(session);
    },
  );

  app.post<{ Params: SessionParams }>(
    '/continuation/agentlets/:agentletId/sessions/:sessionId/stop',
    async (request, reply) => {
      const target = connectedGateway(request.params.agentletId);
      if (!target.ok) return reply.status(target.status).send(target.body);
      try {
        const session = target.gateway.getSession(
          request.params.agentletId,
          request.params.sessionId,
        );
        const threadId = asThreadId(session?.sessionProfile?.appId);
        const result = await target.gateway.stopOnAgentlet(
          request.params.agentletId,
          { sessionId: request.params.sessionId },
        );
        if (threadId !== undefined)
          acpSessionRegistry.remove(request.params.agentletId, threadId);
        return {
          agentletId: request.params.agentletId,
          sessionId: request.params.sessionId,
          ...result,
        };
      } catch (error: unknown) {
        return reply
          .status(503)
          .send(
            errorBody(
              'gateway_stop_failed',
              error instanceof Error ? error.message : String(error),
            ),
          );
      }
    },
  );

  app.post<{ Params: SessionParams; Body: ContextAttachmentBody }>(
    '/continuation/agentlets/:agentletId/sessions/:sessionId/context-attachments',
    async (request, reply) => {
      const target = connectedGateway(request.params.agentletId);
      if (!target.ok) return reply.status(target.status).send(target.body);
      const input = asContextManifestBody(request.body ?? {});
      if (input === undefined)
        return reply
          .status(400)
          .send(
            errorBody(
              'invalid_context_attachment',
              'threadId, externalSessionId, messageId, correlationId and non-empty orderedReferences are required.',
            ),
          );
      const connection = target.gateway.getSession(
        request.params.agentletId,
        request.params.sessionId,
      );
      if (connection === undefined)
        return reply
          .status(404)
          .send(
            errorBody('session_not_found', 'Agentlet session was not found.'),
          );
      const profileThreadId = asThreadId(connection.sessionProfile?.appId);
      if (profileThreadId !== undefined && profileThreadId !== input.threadId)
        return reply
          .status(409)
          .send(
            errorBody(
              'thread_session_mismatch',
              'Transport session is bound to another Core thread.',
            ),
          );
      const owner = acpSessionRegistry.get(
        request.params.agentletId,
        input.threadId,
      );
      if (owner === undefined || owner.client.isClosed)
        return reply
          .status(409)
          .send(
            errorBody(
              'acp_owner_not_found',
              'No live Huabu ACP owner exists for this Core thread.',
            ),
          );
      if (owner.sessionId !== input.externalSessionId)
        return reply
          .status(409)
          .send(
            errorBody(
              'acp_session_mismatch',
              'ACP native session does not match the canonical owner.',
            ),
          );
      if (!supportsEmbeddedContext(owner))
        return reply
          .status(501)
          .send(
            errorBody(
              'embedded_context_unsupported',
              'The live ACP provider did not advertise promptCapabilities.embeddedContext.',
            ),
          );

      // The live ACP owner explicitly advertised embeddedContext. The Host
      // confirms this message-scoped manifest without sending a model turn or
      // materializing daemon files. The deterministic receipt is restart-safe.
      return {
        attachmentId: input.attachmentId,
        messageId: input.messageId,
        correlationId: input.correlationId,
      };
    },
  );

  app.post<{ Params: SessionParams; Body: PromptBody }>(
    '/continuation/agentlets/:agentletId/sessions/:sessionId/prompt',
    async (request, reply) => {
      const target = connectedGateway(request.params.agentletId);
      if (!target.ok) return reply.status(target.status).send(target.body);
      const input = asPromptBody(request.body ?? {});
      if (input === undefined)
        return reply
          .status(400)
          .send(
            errorBody(
              'invalid_prompt_request',
              'threadId, externalSessionId and text are required.',
            ),
          );
      const connection = target.gateway.getSession(
        request.params.agentletId,
        request.params.sessionId,
      );
      if (connection === undefined)
        return reply
          .status(404)
          .send(
            errorBody('session_not_found', 'Agentlet session was not found.'),
          );
      const profileThreadId = asThreadId(connection.sessionProfile?.appId);
      if (profileThreadId !== undefined && profileThreadId !== input.threadId) {
        return reply
          .status(409)
          .send(
            errorBody(
              'thread_session_mismatch',
              'Transport session is bound to another Core thread.',
            ),
          );
      }
      const owner = acpSessionRegistry.get(
        request.params.agentletId,
        input.threadId,
      );
      if (owner === undefined || owner.client.isClosed) {
        return reply
          .status(409)
          .send(
            errorBody(
              'acp_owner_not_found',
              'No live Huabu ACP owner exists for this Core thread.',
            ),
          );
      }
      if (owner.sessionId !== input.externalSessionId) {
        return reply
          .status(409)
          .send(
            errorBody(
              'acp_session_mismatch',
              'ACP native session does not match the canonical owner.',
            ),
          );
      }
      const runCorrelation = input.runCorrelation;
      const registeredRequestIds = new Set<string>();
      if (
        input.contextAttachment !== undefined &&
        !supportsEmbeddedContext(owner)
      ) {
        return reply
          .status(501)
          .send(
            errorBody(
              'embedded_context_unsupported',
              'The live ACP provider no longer advertises promptCapabilities.embeddedContext.',
            ),
          );
      }
      try {
        const result = await promptExistingAcpSession(
          owner,
          input.text,
          input.contextAttachment,
          undefined,
          runCorrelation === undefined
            ? undefined
            : (permissionRequest: Parameters<PermissionNotifier>[0]) => {
                if (
                  permissionRequest.requestId.trim() === '' ||
                  permissionRequest.requestId !== permissionRequest.requestId.trim() ||
                  permissionRequest.options.some(
                    (option) => option.optionId.trim() === '' || option.optionId !== option.optionId.trim(),
                  )
                ) {
                  app.log.error(
                    'ACP permission request ids must be non-empty canonical strings.',
                  );
                  owner.client.resolvePermission(permissionRequest.requestId, {
                    cancelled: true,
                  });
                  return;
                }
                const coreBaseUrl = process.env.LCOS_CORE_URL;
                const coreApiToken = process.env.LOCAL_CORE_API_TOKEN;
                if (
                  coreBaseUrl === undefined ||
                  coreBaseUrl.trim() === '' ||
                  coreApiToken === undefined ||
                  coreApiToken.trim() === ''
                ) {
                  app.log.error(
                    'LCOS_CORE_URL and LOCAL_CORE_API_TOKEN are required to forward a correlated ACP permission request.',
                  );
                  owner.client.resolvePermission(permissionRequest.requestId, {
                    cancelled: true,
                  });
                  return;
                }
                registerProviderRunInput(
                  runCorrelation,
                  permissionRequest.requestId,
                  permissionRequest.options.map((option) => option.optionId),
                  owner,
                );
                registeredRequestIds.add(permissionRequest.requestId);
                void forwardAcpPermissionRequestToCore(
                  coreBaseUrl,
                  coreApiToken,
                  runCorrelation,
                  permissionRequest,
                ).catch((error: unknown) => {
                  removeProviderRunInput(
                    runCorrelation,
                    permissionRequest.requestId,
                  );
                  registeredRequestIds.delete(permissionRequest.requestId);
                  app.log.error(
                    { err: error },
                    'Failed to forward ACP permission request to Local Core.',
                  );
                  // A mismatched or unavailable Core never becomes implicit
                  // approval. Resolve the exact suspended request as denied.
                  owner.client.resolvePermission(permissionRequest.requestId, {
                    cancelled: true,
                  });
                });
              },
        );
        return {
          threadId: input.threadId,
          externalSessionId: owner.sessionId,
          transportSessionId: connection.sessionId,
          text: result.text,
          stopReason: result.stopReason,
        };
      } catch (error: unknown) {
        return reply
          .status(503)
          .send(
            errorBody(
              'acp_prompt_failed',
              error instanceof Error ? error.message : String(error),
            ),
          );
      } finally {
        if (runCorrelation !== undefined) {
          for (const requestId of registeredRequestIds) {
            removeProviderRunInput(runCorrelation, requestId);
          }
        }
      }
    },
  );
};
export async function callOriginalHost(kind, params, body, entry, connectionOverride) {
  owner=entry; acpSessionRegistry.set(entry.agentletId,entry.threadId,entry); gatewayConnection={sessionId:params.sessionId,agentletId:params.agentletId,status:"connected",sessionProfile:{appId:entry.threadId},...connectionOverride};
  if(!handlers.size) await continuationTransportRoutes({ post:(path,handler)=>handlers.set("POST "+path,handler), get:(path,handler)=>handlers.set("GET "+path,handler), log:{error:forbidden,warn:forbidden,info:()=>{}} });
  const base="/continuation/agentlets/:agentletId/sessions/:sessionId"; const path=kind==="read"?base:base+"/"+kind; const handler=handlers.get((kind==="read"?"GET ":"POST ")+path); if(!handler)throw new Error("Original handler missing");
  let status=200,returned; const reply={status:value=>{status=value;return reply},send:value=>{returned=value;return value}};
  const result=await handler({params,body},reply); return {status,value:returned??result};
}