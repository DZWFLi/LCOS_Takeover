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
export {asContextManifestBody,asContextAttachment};
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