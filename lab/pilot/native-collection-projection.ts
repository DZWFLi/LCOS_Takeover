import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'
import type { Gen2Host } from '../../lcos/apps/web-gen2/src/host/projectionFacade.ts'
import { readWorksitePresentations } from '../../lcos/apps/web-gen2/src/spatial/worksiteProjectionInput.ts'

type NodeRecord = Record<string, any>
type CollectionParentProjector = (canvasId: string, carrier: NodeRecord, nodes: readonly NodeRecord[])
  => { parent_id: string } | Record<string, never>

/** A narrow invocation of the existing projector, not a second projector or
 * Collection store. Canonical membership must already have been received. */
export function createNativeCollectionProjection({ repository, projectId, spatial, projectionHost, fail, projectParent }: {
  repository: SqliteMetadataRepository
  projectId: string
  spatial: { read(canvasId: string): Promise<any> }
  projectionHost: (canvasId: string) => Gen2Host
  fail: (status: number, code: string, message: string) => never
  /** Read-only echo of an already-saved, exact original Collection-frame parent. */
  projectParent?: CollectionParentProjector
}) {
  function owner(canvasId: string, collectionId: string) {
    const workspaces = repository.getWorkspaces(projectId).filter(row => row.canvasId === canvasId)
    if (workspaces.length !== 1) fail(404, 'COLLECTION_WORKSPACE_UNAVAILABLE', 'Collection projection requires one exact project Workspace.')
    const collection = repository.getCollection(collectionId)
    if (!collection || String(collection.projectId) !== projectId) fail(404, 'COLLECTION_NOT_FOUND', 'Collection is not owned by this project.')
    return { workspace: workspaces[0]!, collection }
  }

  function node(canvasId: string, carrier: NodeRecord, nodes?: readonly NodeRecord[]) {
    const matches = repository.getProjectionBindings(projectId).filter(row => row.canvasId === canvasId
      && row.spatialKind === 'node' && row.spatialId === String(carrier.id))
    const binding = matches.find(row => row.entityType === 'collection')
    if (!binding) return undefined
    if (matches.length !== 1) fail(409, 'COLLECTION_BINDING_AMBIGUOUS', 'Collection carrier has conflicting canonical bindings.')
    const { workspace, collection } = owner(canvasId, binding.entityId)
    const camelParentId = typeof carrier.parentId === 'string' && carrier.parentId ? carrier.parentId : undefined
    const snakeParentId = typeof carrier.parent_id === 'string' && carrier.parent_id ? carrier.parent_id : undefined
    if (camelParentId && snakeParentId && camelParentId !== snakeParentId) {
      fail(409, 'COLLECTION_PARENT_ID_MISMATCH', 'The saved Collection carrier has conflicting original parent identities.')
    }
    const savedParentId = camelParentId ?? snakeParentId
    let nativeParent: { parent_id: string } | Record<string, never> = {}
    if (savedParentId) {
      // This is a display-only echo. Never accept a caller-supplied parent or
      // guess from a Collection member relation; the injected original frame
      // projector must resolve this exact saved parent in the same Canvas.
      if (!nodes || !projectParent) {
        fail(501, 'COLLECTION_PARENT_NOT_CONNECTED', 'Parented Collection carriers need the original Collection-frame presentation owner.')
      }
      const projectedParent = projectParent(canvasId, carrier, nodes)
      if (!projectedParent || projectedParent.parent_id !== savedParentId
        || Object.keys(projectedParent).some(key => key !== 'parent_id')) {
        fail(409, 'COLLECTION_PARENT_PRESENTATION_MISMATCH', 'The saved Collection carrier parent has no exact original group presentation.')
      }
      nativeParent = { parent_id: savedParentId }
    }
    const size = carrier.measured ?? carrier.size ?? carrier.style ?? {}
    return { id: String(carrier.id), canvas_id: canvasId, type: 'lcos-collection',
      position: carrier.position, measured: { width: Number(size.width ?? carrier.width ?? 248), height: Number(size.height ?? carrier.height ?? 244) },
      ...nativeParent,
      data: { id: String(carrier.id), title: collection.title,
        lcos_collection_ref: { projectId, canvasId, workspaceId: String(workspace.id), collectionId: String(collection.id) } } }
  }

  async function readBinding(canvasId: string, collectionId: string) {
    const { workspace } = owner(canvasId, collectionId)
    const binding = repository.findProjectionBinding(projectId, canvasId, 'node', 'collection', collectionId)
    if (!binding) return { canvas_id: canvasId, workspace_id: String(workspace.id), collection_id: collectionId, binding: null }
    const saved = await spatial.read(canvasId)
    const nodes = saved?.state?.nodes
    if (!Array.isArray(nodes)) fail(503, 'COLLECTION_CANVAS_UNAVAILABLE', 'The original Canvas snapshot has no native node list.')
    const carrier = nodes.find((row: NodeRecord) => String(row.id) === binding.spatialId)
    if (!carrier) fail(409, 'COLLECTION_CARRIER_UNAVAILABLE', 'The canonical binding has no saved spatial carrier; no replacement identity was guessed.')
    const projected = node(canvasId, carrier, nodes)
    if (!projected) fail(409, 'COLLECTION_BINDING_CHANGED', 'The Collection binding changed while reading its carrier.')
    return { canvas_id: canvasId, workspace_id: String(workspace.id), collection_id: collectionId, binding, node: projected }
  }

  async function project(canvasId: string, collectionId: string) {
    const { collection } = owner(canvasId, collectionId)
    const host = projectionHost(canvasId)
    const graph = await host.projects.getProjectGraph(projectId)
    if (!graph) fail(404, 'PROJECT_NOT_FOUND', 'The Collection projection project is unavailable.')
    const presentations = await readWorksitePresentations(host.projects, projectId, graph, canvasId)
    if (presentations?.length !== 1 || !presentations[0]!.state.memberEntityRefs?.some(ref => ref.type === 'collection' && ref.id === collectionId)) {
      fail(409, 'COLLECTION_NOT_RECEIVED', 'The current worksite has not received this canonical Collection; no membership was fabricated.')
    }
    await host.nodeProjector.projectEntity({ projectId, entityType: 'collection', entityId: collectionId,
      kind: 'file', sourceKind: 'collection', title: collection.title, size: { width: 248, height: 244 } })
    return { ...await readBinding(canvasId, collectionId), owner: 'original ProjectToSpaceProjection / Core binding / Huabu carrier',
      provider_execution_started: false }
  }

  return { node, project, readBinding }
}
