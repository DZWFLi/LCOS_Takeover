type JsonRecord = Record<string, any>
type CollectionMemberRef = { readonly type: string; readonly id: string }

const MEMBER_TYPES = new Set(['artifact', 'note', 'collection', 'scope', 'workspace', 'conversation', 'run'])

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function failWith(fail: (status: number, code: string, message: string) => never,
  status: number, code: string, message: string): never {
  return fail(status, code, message)
}

/**
 * Read-only bridge from an already-bound Core Collection to TapNow's native pile DTO.
 * It never creates a binding, rewrites membership, or infers members from labels.
 */
export function createNativePileCollectionProjection({ repository, projectId, spatial, projectParent, fail }: {
  readonly repository: {
    getWorkspaces(projectId: string): readonly JsonRecord[]
    getCollection(collectionId: string): JsonRecord | undefined
    listCollectionMemberships(projectId: string, collectionId?: string): readonly JsonRecord[]
    getProjectionBindings(projectId: string): readonly JsonRecord[]
    findProjectionBinding(projectId: string, canvasId: string, spatialKind: string, entityType: string, entityId: string): JsonRecord | undefined
    getArtifactView(viewId: string): JsonRecord | undefined
    getArtifact(artifactId: string): JsonRecord | undefined
  }
  readonly projectId: string
  readonly spatial: { read(canvasId: string): Promise<any> }
  readonly projectParent?: (canvasId: string, carrier: JsonRecord, nodes: readonly JsonRecord[]) => { parent_id: string } | Record<string, never>
  readonly fail: (status: number, code: string, message: string) => never
}) {
  function owner(canvasId: string, collectionId: string) {
    if (!nonEmpty(canvasId) || !nonEmpty(collectionId)) {
      failWith(fail, 400, 'INVALID_ARGUMENT', 'A Canvas id and canonical Collection id are required.')
    }
    const workspaces = repository.getWorkspaces(projectId).filter(row => String(row.canvasId ?? '') === canvasId)
    if (workspaces.length !== 1 || String(workspaces[0]?.projectId ?? '') !== projectId) {
      failWith(fail, 404, 'COLLECTION_WORKSPACE_UNAVAILABLE', 'Pile projection needs one exact Workspace owned by this project and Canvas.')
    }
    const collection = repository.getCollection(collectionId)
    if (!collection || String(collection.id ?? '') !== collectionId || String(collection.projectId ?? '') !== projectId) {
      failWith(fail, 404, 'COLLECTION_NOT_FOUND', 'The canonical Collection is not owned by this project.')
    }
    const matches = repository.getProjectionBindings(projectId).filter(row => row.projectId === projectId
      && row.canvasId === canvasId && row.spatialKind === 'node'
      && row.entityType === 'collection' && String(row.entityId ?? '') === collectionId)
    if (matches.length > 1) failWith(fail, 409, 'COLLECTION_BINDING_AMBIGUOUS', 'The current Canvas has multiple native carriers for this Core Collection.')
    return { workspace: workspaces[0]!, collection, binding: matches[0] }
  }

  function memberProjection(canvasId: string, collectionId: string, nodes: readonly JsonRecord[]) {
    const members = repository.listCollectionMemberships(projectId, collectionId)
    const seenMembers = new Set<string>()
    const rows = repository.getProjectionBindings(projectId).filter(row => row.projectId === projectId
      && row.canvasId === canvasId && row.spatialKind === 'node')
    const bySpatialId = new Map<string, JsonRecord>()
    for (const binding of rows) {
      const spatialId = String(binding.spatialId ?? '')
      if (!nonEmpty(spatialId) || !nonEmpty(binding.entityType) || !nonEmpty(binding.entityId)) {
        failWith(fail, 409, 'COLLECTION_MEMBER_BINDING_INVALID', 'A current Canvas ProjectionBinding is incomplete.')
      }
      if (bySpatialId.has(spatialId)) {
        failWith(fail, 409, 'COLLECTION_MEMBER_BINDING_AMBIGUOUS', 'A current Canvas member node has multiple Core identities.')
      }
      bySpatialId.set(spatialId, binding)
    }
    const nodesById = new Map<string, JsonRecord>()
    for (const node of nodes) {
      const id = String(node.id ?? '')
      if (!nonEmpty(id) || nodesById.has(id)) {
        failWith(fail, 409, 'COLLECTION_MEMBER_NODE_ID_AMBIGUOUS', 'The current Canvas has missing or duplicate member NodeIDs.')
      }
      nodesById.set(id, node)
    }

    const projected: string[] = []
    const seenNodeIds = new Set<string>()
    let projectedMemberCount = 0
    for (const row of members) {
      const collectionRef = record(row.memberRef) as CollectionMemberRef | undefined
      if (String(row.collectionId ?? '') !== collectionId || !collectionRef
        || !MEMBER_TYPES.has(collectionRef.type) || !nonEmpty(collectionRef.id)) {
        failWith(fail, 409, 'COLLECTION_MEMBER_INVALID', 'Core returned an incomplete or unsupported canonical Collection member.')
      }
      const memberKey = JSON.stringify([collectionRef.type, collectionRef.id])
      if (seenMembers.has(memberKey)) failWith(fail, 409, 'COLLECTION_MEMBER_DUPLICATE', 'Core returned a duplicate canonical Collection member.')
      seenMembers.add(memberKey)
      const matchingSpatialIds: string[] = []
      for (const [spatialId, binding] of bySpatialId) {
        if (!nodesById.has(spatialId) || nodesById.get(spatialId)?.type === 'frame') continue
        const direct = binding.entityType === collectionRef.type && String(binding.entityId) === collectionRef.id
        const viewOfArtifact = collectionRef.type === 'artifact' && binding.entityType === 'view'
          ? repository.getArtifactView(String(binding.entityId))
          : undefined
        const artifactViewMatch = viewOfArtifact !== undefined
          && String(viewOfArtifact.artifactId ?? '') === collectionRef.id
          && String(repository.getArtifact(collectionRef.id)?.projectId ?? '') === projectId
        if (direct || artifactViewMatch) matchingSpatialIds.push(spatialId)
      }
      if (matchingSpatialIds.length) projectedMemberCount += 1
      for (const spatialId of matchingSpatialIds) {
        if (!seenNodeIds.has(spatialId)) {
          projected.push(spatialId)
          seenNodeIds.add(spatialId)
        }
      }
    }
    return { nodeIds: projected, unprojectedMemberCount: members.length - projectedMemberCount }
  }

  function memberNodeIds(canvasId: string, collectionId: string, nodes: readonly JsonRecord[]): string[] {
    return memberProjection(canvasId, collectionId, nodes).nodeIds
  }

  function unprojectedMemberCount(canvasId: string, collectionId: string, nodes: readonly JsonRecord[]): number {
    return memberProjection(canvasId, collectionId, nodes).unprojectedMemberCount
  }

  function node(canvasId: string, source: JsonRecord, nodes: readonly JsonRecord[]) {
    const spatialId = String(source?.id ?? '')
    if (!nonEmpty(spatialId)) return undefined
    const spatialBindings = repository.getProjectionBindings(projectId).filter(row => row.projectId === projectId
      && row.canvasId === canvasId && row.spatialKind === 'node' && String(row.spatialId ?? '') === spatialId)
    if (spatialBindings.length === 0 || spatialBindings[0]?.entityType !== 'collection') return undefined
    if (spatialBindings.length !== 1) failWith(fail, 409, 'COLLECTION_BINDING_AMBIGUOUS', 'The Collection carrier has conflicting canonical identities.')
    const collectionId = String(spatialBindings[0]!.entityId ?? '')
    const { workspace, collection, binding } = owner(canvasId, collectionId)
    if (!binding || String(binding.spatialId ?? '') !== spatialId || source.type === 'frame') {
      failWith(fail, 409, 'COLLECTION_CARRIER_UNAVAILABLE', 'The existing Core Collection binding has no exact non-frame TapNow carrier.')
    }
    const savedRef = record(source.data?.lcos_collection_ref)
    if (savedRef && (savedRef.projectId !== projectId || savedRef.canvasId !== canvasId
      || savedRef.workspaceId !== String(workspace.id) || savedRef.collectionId !== collectionId)) {
      failWith(fail, 409, 'COLLECTION_CARRIER_MISMATCH', 'The saved carrier echo conflicts with its exact Core Collection binding.')
    }
    const parentId = typeof source.parentId === 'string' && source.parentId ? source.parentId
      : typeof source.parent_id === 'string' && source.parent_id ? source.parent_id : undefined
    let nativeParent: { parent_id: string } | Record<string, never> = {}
    if (parentId) {
      if (!projectParent) failWith(fail, 501, 'COLLECTION_PARENT_NOT_CONNECTED', 'Parented pile carriers need the original group presentation owner.')
      const projected = projectParent(canvasId, source, nodes)
      if (!projected || projected.parent_id !== parentId || Object.keys(projected).some(key => key !== 'parent_id')) {
        failWith(fail, 409, 'COLLECTION_PARENT_PRESENTATION_MISMATCH', 'The saved pile carrier parent has no exact original group presentation.')
      }
      nativeParent = { parent_id: parentId }
    }
    const size = source.measured ?? source.size ?? source.style ?? {}
    return {
      id: spatialId,
      canvas_id: canvasId,
      type: 'pile',
      position: source.position,
      measured: { width: Number(size.width ?? source.width ?? 248), height: Number(size.height ?? source.height ?? 244) },
      ...nativeParent,
      data: {
        id: spatialId,
        title: collection.title,
        memberIds: memberNodeIds(canvasId, collectionId, nodes),
        lcos_native_collection: true,
        lcos_collection_ref: { projectId, canvasId, workspaceId: String(workspace.id), collectionId },
      },
    }
  }

  async function readBinding(canvasId: string, collectionId: string) {
    const { workspace, collection, binding } = owner(canvasId, collectionId)
    if (!binding) return { canvas_id: canvasId, workspace_id: String(workspace.id), collection_id: collectionId,
      collection, binding: null, node: null }
    const saved = await spatial.read(canvasId)
    const nodes = saved?.state?.nodes
    if (!Array.isArray(nodes)) failWith(fail, 503, 'COLLECTION_CANVAS_UNAVAILABLE', 'The original Canvas snapshot has no native node list.')
    const carriers = nodes.filter((row: JsonRecord) => String(row.id ?? '') === String(binding.spatialId))
    if (carriers.length !== 1) failWith(fail, 409, 'COLLECTION_CARRIER_UNAVAILABLE', 'The Core Collection binding has no unique saved Canvas carrier.')
    const projected = node(canvasId, carriers[0]!, nodes)
    if (!projected) failWith(fail, 409, 'COLLECTION_BINDING_CHANGED', 'The Core Collection carrier changed while reading its native pile projection.')
    return { canvas_id: canvasId, workspace_id: String(workspace.id), collection_id: collectionId,
      collection, binding, node: projected, owner: 'existing Core Collection + existing ProjectionBinding + TapNow native pile DTO' }
  }

  async function project(canvasId: string, collectionId: string) {
    const result = await readBinding(canvasId, collectionId)
    if (!result.binding || !result.node) failWith(fail, 409, 'COLLECTION_BINDING_REQUIRED', 'Native pile pilot only projects an existing Core Collection carrier; it does not create a binding.')
    return { ...result, provider_execution_started: false }
  }

  return { node, readBinding, project, memberNodeIds, unprojectedMemberCount }
}
