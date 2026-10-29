import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parentIdOf(node) {
  const value = node?.parent_id ?? node?.parentId
  return typeof value === 'string' && value ? value : undefined
}

function sizeOf(node) {
  const width = Number(node?.measured?.width ?? node?.width ?? node?.style?.width)
  const height = Number(node?.measured?.height ?? node?.height ?? node?.style?.height)
  return { width: Number.isFinite(width) && width > 0 ? width : 360,
    height: Number.isFinite(height) && height > 0 ? height : 280 }
}

function identitySnapshot(node) {
  return { id: String(node.id), type: node.type ?? null, position: node.position ?? null,
    parentId: parentIdOf(node) ?? null, data: node.data ?? null }
}

function sortedMembers(rows) {
  return rows.map(row => ({ type: String(row.memberRef?.type ?? ''), id: String(row.memberRef?.id ?? '') }))
    .sort((left, right) => left.type.localeCompare(right.type) || left.id.localeCompare(right.id))
}

function repositoryBindings(facade, projectId) {
  const rows = facade?.core?.repository?.getProjectionBindings?.(projectId)
  assert.ok(Array.isArray(rows), 'The isolated facade must expose its real Core ProjectionBinding readback.')
  return rows.filter(row => String(row.projectId) === projectId)
}

function requireBinding(bindings, { projectId, canvasId, spatialId, entityType, entityId }) {
  const matches = bindings.filter(row => String(row.canvasId) === canvasId
    && String(row.spatialId) === spatialId && String(row.entityType) === entityType && String(row.entityId) === entityId)
  assert.equal(matches.length, 1, `Expected one exact ${entityType} binding for ${spatialId} → ${entityId}.`)
  const binding = matches[0]
  assert.equal(String(binding.projectId), projectId)
  assert.equal(String(binding.spatialKind), 'node')
  return binding
}

function facadeData(response, label, allowedStatuses = [200]) {
  assert.ok(isRecord(response), `${label}: facadeCall must return {status,payload}.`)
  assert.ok(allowedStatuses.includes(Number(response.status)),
    `${label}: unexpected status ${response.status}: ${JSON.stringify(response.payload)}`)
  assert.equal(response.payload?.code, 0, `${label}: missing TapNow facade success envelope.`)
  assert.ok(isRecord(response.payload?.data), `${label}: missing facade data DTO.`)
  return response.payload.data
}

function coreValueRecord(value, label) {
  assert.ok(isRecord(value), `${label}: expected the original Core value DTO.`)
  return value
}

/**
 * Build a real two-level Collection fixture through the existing owners.
 * The caller has already created the inner Collection, projected its carrier,
 * and used the original first-open space producer for its frame and children.
 * This helper only creates one synthetic sibling text and then asks the same
 * Core Assembly/projection/first-open path to contain the existing inner host.
 */
export async function createNestedCollectionFixture({ projectId, canvasId, workspaceId,
  innerCollectionId, innerCollectionNodeId, innerFrameId, facade, facadeCall, coreValue } = {}) {
  for (const [key, value] of Object.entries({ projectId, canvasId, workspaceId, innerCollectionId,
    innerCollectionNodeId, innerFrameId })) {
    assert.equal(typeof value, 'string', `${key} must be an exact non-empty string.`)
    assert.ok(value.trim(), `${key} must not be empty.`)
  }
  assert.equal(typeof facadeCall, 'function')
  assert.equal(typeof coreValue, 'function')
  assert.equal(String(facade?.core?.projectId ?? ''), projectId, 'Fixture must use the exact disposable Core project.')

  const repository = facade.core.repository
  assert.ok(repository && typeof repository.getCollection === 'function')
  const workspaceRows = facade.workspaces?.filter(row => String(row.projectId) === projectId
    && String(row.id) === workspaceId && String(row.canvasId) === canvasId) ?? []
  assert.equal(workspaceRows.length, 1, 'One exact Core Workspace must own this project/canvas pair.')
  const workspace = workspaceRows[0]
  assert.equal(workspace.preferredSurface, 'main', 'Nested Collection fixture is scoped to the existing Main Canvas.')
  assert.equal(repository.getWorkspaces(projectId).filter(row => String(row.id) === workspaceId
    && String(row.canvasId) === canvasId && String(row.projectId) === projectId).length, 1)

  const projectPath = '/projects/' + encodeURIComponent(projectId)
  const canvasPath = '/api/canvas/v1/canvases/' + encodeURIComponent(canvasId)
  const collectionPath = collectionId => projectPath + '/collections/' + encodeURIComponent(collectionId)
  const spacePath = collectionId => '/api/lcos/canvases/' + encodeURIComponent(canvasId)
    + '/collections/' + encodeURIComponent(collectionId) + '/space'

  const innerCollection = repository.getCollection(innerCollectionId)
  assert.ok(innerCollection, 'The supplied inner Collection must already exist in Core.')
  assert.equal(String(innerCollection.id), innerCollectionId)
  assert.equal(String(innerCollection.projectId), projectId)

  const innerSpaceReadResponse = await facadeCall('GET', spacePath(innerCollectionId))
  const innerSpaceRead = facadeData(innerSpaceReadResponse, 'read existing inner Collection space')
  assert.equal(String(innerSpaceRead.canvas_id), canvasId)
  assert.equal(String(innerSpaceRead.workspace_id), workspaceId)
  assert.equal(String(innerSpaceRead.collection_id), innerCollectionId)
  assert.equal(String(innerSpaceRead.collection_node_id), innerCollectionNodeId)
  assert.equal(String(innerSpaceRead.frame_id), innerFrameId)
  assert.equal(innerSpaceRead.created, false, 'The helper must reuse, not recreate, the supplied inner frame.')

  const innerSnapshot = await facade.spatial.read(canvasId)
  assert.ok(innerSnapshot?.state && Array.isArray(innerSnapshot.state.nodes))
  const innerNodes = innerSnapshot.state.nodes
  const innerFrame = innerNodes.find(node => String(node.id) === innerFrameId)
  const innerCarrier = innerNodes.find(node => String(node.id) === innerCollectionNodeId)
  assert.equal(innerFrame?.type, 'frame')
  assert.equal(String(innerFrame?.data?.lcosCollectionId ?? ''), innerCollectionId)
  assert.equal(String(innerFrame?.data?.lcosCollectionNodeId ?? ''), innerCollectionNodeId)
  assert.equal(parentIdOf(innerFrame), undefined, 'The existing inner frame must start at the Main root.')
  assert.ok(innerCarrier, 'The exact existing inner Collection carrier must be present on this Canvas.')
  assert.equal(parentIdOf(innerCarrier), undefined, 'The carrier must be free before it is nested.')
  const bindingsBefore = repositoryBindings(facade, projectId)
  requireBinding(bindingsBefore, { projectId, canvasId, spatialId: innerCollectionNodeId,
    entityType: 'collection', entityId: innerCollectionId })

  const innerChildren = innerNodes.filter(node => parentIdOf(node) === innerFrameId)
  assert.ok(innerChildren.some(node => node.type === 'image'), 'The existing inner frame must contain its canonical image member.')
  assert.ok(innerChildren.some(node => ['note', 'text'].includes(String(node.type))),
    'The existing inner frame must contain its canonical text member.')
  assert.ok(innerChildren.length >= 2)
  const childIds = innerChildren.map(node => String(node.id)).sort()
  assert.equal(new Set(childIds).size, childIds.length)
  for (const child of innerChildren) {
    const binding = bindingsBefore.filter(row => String(row.canvasId) === canvasId && String(row.spatialId) === String(child.id))
    assert.equal(binding.length, 1, `Inner child ${child.id} must have one exact Core binding.`)
    assert.equal(String(binding[0].projectId), projectId)
    assert.equal(String(binding[0].spatialKind), 'node')
    assert.ok(['artifact', 'view'].includes(String(binding[0].entityType)))
    assert.ok(String(binding[0].entityId))
  }
  const innerChildrenBefore = new Map(innerChildren.map(node => [String(node.id), identitySnapshot(node)]))
  const originalNodeSnapshots = new Map(innerNodes.map(node => [String(node.id), identitySnapshot(node)]))

  const canvasBeforeCreate = facadeData(await facadeCall('GET', canvasPath), 'read Main before sibling creation')
  assert.equal(String(canvasBeforeCreate.id), canvasId)
  assert.equal(String(canvasBeforeCreate.workspace_id), workspaceId)
  assert.ok(Number.isSafeInteger(canvasBeforeCreate.version))
  const existingIds = new Set(canvasBeforeCreate.nodes.map(node => String(node.id)))
  assert.ok(existingIds.has(innerCollectionNodeId) && existingIds.has(innerFrameId))

  // Place the synthetic sibling beyond existing root-level node extents. This
  // is only the initial position of a newly-created fixture node; the later
  // parent/relative layout is exclusively owned by the original space API.
  const rootNodes = canvasBeforeCreate.nodes.filter(node => !parentIdOf(node))
  const maxRootRight = rootNodes.reduce((max, node) => {
    const x = Number(node.position?.x)
    return Number.isFinite(x) ? Math.max(max, x + sizeOf(node).width) : max
  }, 0)
  const siblingPosition = { x: Math.ceil(maxRootRight + 180), y: 180 }
  const siblingNodeId = 'node-' + randomUUID()
  const fixtureKey = randomUUID()
  const siblingTitle = '合成嵌套集合成员 · ' + fixtureKey.slice(0, 8)
  const siblingText = `# ${siblingTitle}\n\n仅用于隔离空间嵌套验证；不是外部项目材料，也未执行模型。\nfixture:${fixtureKey}`
  const siblingCreate = {
    id: siblingNodeId,
    type: 'text',
    position: siblingPosition,
    measured: { width: 360, height: 280 },
    data: { type: 'generate', title: siblingTitle, text: siblingText, prompt: '' },
  }
  assert.equal(Object.hasOwn(siblingCreate, 'lcos_ref'), false,
    'Fresh canonical identity must be generated by the original Core lifecycle, never supplied by the fixture.')
  const createOperationId = 'native-nested-sibling-' + randomUUID()
  const createResponse = await facadeCall('POST', canvasPath + '/nodes:batchActions', {
    canvas_id: canvasId,
    actions: [{ action: 'create', creates: [siblingCreate] }],
    lcos_operation: { version: 1, operationId: createOperationId, kind: 'create', phase: 'apply' },
  })
  const createReceipt = facadeData(createResponse, 'create canonical sibling text', [200])
  assert.equal(createReceipt.canvas_id, canvasId)
  assert.equal(createReceipt.core_saved, true)
  assert.equal(createReceipt.spatial_saved, true)
  assert.equal(createReceipt.lifecycle_results?.length, 1)
  assert.deepEqual(createReceipt.lifecycle_results[0]?.operation,
    { version: 1, operationId: createOperationId, kind: 'create', phase: 'apply' })
  assert.equal(createReceipt.client_to_spatial_ids?.[siblingNodeId], siblingNodeId)
  const siblingRef = createReceipt.lcos_refs?.[siblingNodeId]
  assert.ok(isRecord(siblingRef), 'The original Core text producer must return its exact canonical ref.')
  assert.equal(siblingRef.version, 1)
  assert.equal(siblingRef.entityType, 'artifact')
  assert.equal(String(siblingRef.entityId), String(siblingRef.artifactId))
  assert.ok(String(siblingRef.artifactId) && String(siblingRef.artifactViewId) && String(siblingRef.revisionId))

  const siblingBinding = requireBinding(repositoryBindings(facade, projectId), { projectId, canvasId,
    spatialId: siblingNodeId, entityType: 'artifact', entityId: String(siblingRef.artifactId) })
  const graphAfterCreate = coreValueRecord(await coreValue('GET', projectPath + '/graph'), 'read Core graph after native create')
  const siblingArtifact = graphAfterCreate.artifacts?.find(row => String(row.id) === String(siblingRef.artifactId))
  const siblingView = graphAfterCreate.artifactViews?.find(row => String(row.id) === String(siblingRef.artifactViewId))
  const siblingRevision = graphAfterCreate.artifactRevisions?.find(row => String(row.id) === String(siblingRef.revisionId))
  const siblingFileRecord = graphAfterCreate.fileRecords?.find(row => String(row.id) === String(siblingRevision?.fileRecordId ?? ''))
  assert.equal(String(siblingArtifact?.projectId), projectId)
  assert.equal(String(siblingArtifact?.title), siblingTitle)
  assert.equal(String(siblingView?.artifactId), String(siblingArtifact?.id))
  assert.equal(String(siblingView?.scopeId), String(workspace.scopeId))
  assert.equal(String(siblingRevision?.artifactId), String(siblingArtifact?.id))
  assert.ok(String(siblingRevision?.fileRecordId))
  assert.equal(String(siblingFileRecord?.projectId), projectId)
  const siblingCanvasAfterCreate = facadeData(await facadeCall('GET', canvasPath), 'read sibling after native create')
  const siblingNode = siblingCanvasAfterCreate.nodes.find(node => String(node.id) === siblingNodeId)
  assert.ok(siblingNode)
  assert.equal(String(siblingNode.data?.lcos_ref?.artifactId ?? siblingNode.lcos_ref?.artifactId), String(siblingRef.artifactId))
  assert.equal(parentIdOf(siblingNode), undefined)
  const siblingRefSnapshot = { ...siblingRef }

  const outerMembers = [
    { type: 'collection', id: innerCollectionId },
    { type: 'artifact', id: String(siblingRef.artifactId) },
  ]
  const outerTitle = '合成嵌套集合外层 · ' + fixtureKey.slice(0, 8)
  const outerCollection = coreValueRecord(await coreValue('POST', projectPath + '/collections', {
    title: outerTitle, members: outerMembers,
  }), 'create outer Core Collection')
  const outerCollectionId = String(outerCollection.id ?? '')
  assert.ok(outerCollectionId)
  assert.equal(String(outerCollection.projectId), projectId)
  const readOuterCollection = coreValueRecord(await coreValue('GET', collectionPath(outerCollectionId)), 'read outer Core Collection')
  assert.equal(String(readOuterCollection.id), outerCollectionId)
  assert.equal(String(readOuterCollection.projectId), projectId)
  const outerMemberRead = coreValueRecord(await coreValue('GET', collectionPath(outerCollectionId) + '/members'),
    'read outer Core Collection members')
  assert.equal(String(outerMemberRead.collection?.id), outerCollectionId)
  const outerMembersReadback = sortedMembers(outerMemberRead.members ?? [])
  assert.deepEqual(outerMembersReadback, outerMembers.map(row => ({ ...row }))
    .sort((left, right) => left.type.localeCompare(right.type) || left.id.localeCompare(right.id)))

  const assemblyResponse = await facadeCall('POST', '/api/lcos/core' + projectPath + '/assembly/apply', {
    schemaVersion: 1,
    projectId,
    sourceRefs: [{ kind: 'collection', id: outerCollectionId }],
    targetRef: { kind: 'main' },
  })
  assert.equal(Number(assemblyResponse?.status), 200,
    `receive outer Collection into Main: unexpected Core status ${assemblyResponse?.status}: ${JSON.stringify(assemblyResponse?.payload)}`)
  assert.equal(assemblyResponse?.payload?.ok, true, 'Assembly Apply must preserve the original Core {ok,value} envelope.')
  const assembly = coreValueRecord(assemblyResponse.payload.value, 'receive outer Collection into Main')
  const assemblyRows = assembly.results?.filter(row => row.sourceRef?.kind === 'collection'
    && String(row.sourceRef.id) === outerCollectionId) ?? []
  assert.equal(assemblyRows.length, 1)
  assert.equal(assemblyRows[0].status, 'applied')
  assert.equal(assemblyRows[0].channel, 'presentation-membership')
  const rootScopes = repository.getScopes(projectId).filter(scope => scope.kind === 'root')
  assert.equal(rootScopes.length, 1)
  assert.equal(String(assemblyRows[0].presentationId), 'presentation:context:' + String(rootScopes[0].id))

  const projectedResponse = await facadeCall('POST', '/api/lcos/canvases/' + encodeURIComponent(canvasId)
    + '/collections:project', { collectionId: outerCollectionId })
  const projected = facadeData(projectedResponse, 'project outer collection carrier')
  assert.equal(projected.canvas_id, canvasId)
  assert.equal(projected.workspace_id, workspaceId)
  assert.equal(projected.collection_id, outerCollectionId)
  assert.equal(projected.provider_execution_started, false)
  const outerCarrierId = String(projected.binding?.spatialId ?? projected.node?.id ?? '')
  assert.ok(outerCarrierId)
  assert.equal(String(projected.binding?.projectId), projectId)
  assert.equal(String(projected.binding?.canvasId), canvasId)
  assert.equal(String(projected.binding?.entityType), 'collection')
  assert.equal(String(projected.binding?.entityId), outerCollectionId)
  assert.equal(String(projected.binding?.spatialKind), 'node')
  assert.equal(String(projected.node?.id), outerCarrierId)
  assert.equal(projected.node?.type, 'lcos-collection')

  const outerBinding = requireBinding(repositoryBindings(facade, projectId), { projectId, canvasId,
    spatialId: outerCarrierId, entityType: 'collection', entityId: outerCollectionId })
  assert.equal(String(outerBinding.canvasId), canvasId)
  requireBinding(repositoryBindings(facade, projectId), { projectId, canvasId,
    spatialId: innerCollectionNodeId, entityType: 'collection', entityId: innerCollectionId })

  const canvasBeforeOuterSpace = facadeData(await facadeCall('GET', canvasPath), 'read Canvas before outer first-open')
  assert.equal(canvasBeforeOuterSpace.id, canvasId)
  assert.equal(canvasBeforeOuterSpace.workspace_id, workspaceId)
  assert.ok(Number.isSafeInteger(canvasBeforeOuterSpace.version))
  const preOuterNodes = await facade.spatial.read(canvasId)
  const priorInnerFrame = preOuterNodes.state.nodes.find(node => String(node.id) === innerFrameId)
  const priorInnerCarrier = preOuterNodes.state.nodes.find(node => String(node.id) === innerCollectionNodeId)
  const priorSibling = preOuterNodes.state.nodes.find(node => String(node.id) === siblingNodeId)
  const priorOuterCarrier = preOuterNodes.state.nodes.find(node => String(node.id) === outerCarrierId)
  assert.equal(parentIdOf(priorInnerFrame), undefined)
  assert.equal(parentIdOf(priorInnerCarrier), undefined)
  assert.equal(parentIdOf(priorSibling), undefined)
  assert.ok(priorOuterCarrier)
  assert.equal(parentIdOf(priorOuterCarrier), undefined)
  const outerPreVersion = Number(preOuterNodes.version)
  const spaceApplyResponse = await facadeCall('POST', spacePath(outerCollectionId), {
    collectionNodeId: outerCarrierId,
    expectedVersion: outerPreVersion,
  })
  const outerOriginalSpaceReceipt = facadeData(spaceApplyResponse, 'first-open outer Collection space', [200])
  assert.equal(String(outerOriginalSpaceReceipt.canvas_id), canvasId)
  assert.equal(String(outerOriginalSpaceReceipt.workspace_id), workspaceId)
  assert.equal(String(outerOriginalSpaceReceipt.collection_id), outerCollectionId)
  assert.equal(outerOriginalSpaceReceipt.from_version, outerPreVersion)
  assert.equal(outerOriginalSpaceReceipt.to_version, outerPreVersion + 1)
  assert.equal(outerOriginalSpaceReceipt.created, true)
  assert.equal(outerOriginalSpaceReceipt.provider_execution_started, false)
  const expectedOuterChildIds = [innerFrameId, innerCollectionNodeId, siblingNodeId].sort()
  assert.deepEqual((outerOriginalSpaceReceipt.node_ids ?? []).map(String).sort(), expectedOuterChildIds)
  const outerFrameId = String(outerOriginalSpaceReceipt.frame_id ?? '')
  assert.ok(outerFrameId)
  const outerSpaceRead = facadeData(await facadeCall('GET', spacePath(outerCollectionId)), 'read outer Collection space after first-open')
  assert.equal(String(outerSpaceRead.canvas_id), canvasId)
  assert.equal(String(outerSpaceRead.workspace_id), workspaceId)
  assert.equal(String(outerSpaceRead.collection_id), outerCollectionId)
  assert.equal(String(outerSpaceRead.collection_node_id), outerCarrierId)
  assert.equal(String(outerSpaceRead.frame_id), outerFrameId)
  assert.equal(outerSpaceRead.version, outerOriginalSpaceReceipt.to_version)
  assert.equal(outerSpaceRead.created, false)
  assert.equal(outerSpaceRead.provider_execution_started, false)
  assert.deepEqual((outerSpaceRead.node_ids ?? []).map(String).sort(), expectedOuterChildIds)

  const nativeAfterOuter = await facade.spatial.read(canvasId)
  assert.equal(nativeAfterOuter.version, outerOriginalSpaceReceipt.to_version)
  const nativeOuterFrame = nativeAfterOuter.state.nodes.find(node => String(node.id) === outerFrameId)
  assert.equal(nativeOuterFrame?.type, 'frame')
  assert.equal(String(nativeOuterFrame?.data?.lcosCollectionId ?? ''), outerCollectionId)
  assert.equal(String(nativeOuterFrame?.data?.lcosCollectionNodeId ?? ''), outerCarrierId)
  assert.equal(parentIdOf(nativeOuterFrame), undefined)
  const nativeOuterChildren = nativeAfterOuter.state.nodes.filter(node => parentIdOf(node) === outerFrameId)
  assert.deepEqual(nativeOuterChildren.map(node => String(node.id)).sort(), expectedOuterChildIds)
  assert.equal(parentIdOf(nativeAfterOuter.state.nodes.find(node => String(node.id) === innerFrameId)), outerFrameId)
  assert.equal(parentIdOf(nativeAfterOuter.state.nodes.find(node => String(node.id) === innerCollectionNodeId)), outerFrameId)
  assert.equal(parentIdOf(nativeAfterOuter.state.nodes.find(node => String(node.id) === siblingNodeId)), outerFrameId)

  const innerFrameAfter = nativeAfterOuter.state.nodes.find(node => String(node.id) === innerFrameId)
  assert.equal(String(innerFrameAfter?.data?.lcosCollectionId ?? ''), innerCollectionId)
  assert.equal(String(innerFrameAfter?.data?.lcosCollectionNodeId ?? ''), innerCollectionNodeId)
  for (const child of innerChildren) {
    const after = nativeAfterOuter.state.nodes.find(node => String(node.id) === String(child.id))
    assert.equal(parentIdOf(after), innerFrameId, `Nesting may move the existing inner frame, but not detach its child ${child.id}.`)
    assert.deepEqual(after.position, child.position, `Nested first-open must retain inner-relative geometry for ${child.id}.`)
    assert.deepEqual(after.data, child.data, `Nested first-open must not rewrite the Core-bound child identity for ${child.id}.`)
  }

  const allowedChangedIds = new Set([outerFrameId, outerCarrierId, innerFrameId, innerCollectionNodeId, siblingNodeId])
  for (const [id, before] of originalNodeSnapshots) {
    if (allowedChangedIds.has(id)) continue
    const after = nativeAfterOuter.state.nodes.find(node => String(node.id) === id)
    assert.ok(after, `An unrelated pre-existing node disappeared: ${id}`)
    assert.deepEqual(identitySnapshot(after), before,
      `An unrelated/root-free View or node changed under outer Collection first-open: ${id}`)
  }

  const canvas = facadeData(await facadeCall('GET', canvasPath), 'read projected nested Canvas after first-open')
  assert.equal(canvas.id, canvasId)
  assert.equal(canvas.workspace_id, workspaceId)
  assert.equal(canvas.version, outerOriginalSpaceReceipt.to_version)
  const outerGroup = canvas.nodes.find(node => String(node.id) === outerFrameId)
  assert.equal(outerGroup?.type, 'group')
  assert.equal(String(outerGroup?.data?.lcosCollectionId ?? ''), outerCollectionId)
  assert.equal(String(outerGroup?.data?.lcosCollectionNodeId ?? ''), outerCarrierId)
  assert.equal(parentIdOf(outerGroup), undefined)
  const projectedOuterChildren = canvas.nodes.filter(node => parentIdOf(node) === outerFrameId)
  assert.deepEqual(projectedOuterChildren.map(node => String(node.id)).sort(), expectedOuterChildIds)
  const projectedInnerFrame = canvas.nodes.find(node => String(node.id) === innerFrameId)
  assert.equal(projectedInnerFrame?.type, 'group')
  assert.equal(parentIdOf(projectedInnerFrame), outerFrameId)
  assert.equal(String(projectedInnerFrame?.data?.lcosCollectionId ?? ''), innerCollectionId)
  assert.equal(String(projectedInnerFrame?.data?.lcosCollectionNodeId ?? ''), innerCollectionNodeId)
  assert.equal(parentIdOf(canvas.nodes.find(node => String(node.id) === innerCollectionNodeId)), outerFrameId)
  const projectedSibling = canvas.nodes.find(node => String(node.id) === siblingNodeId)
  assert.ok(projectedSibling && ['note', 'text'].includes(String(projectedSibling.type)))
  assert.equal(parentIdOf(projectedSibling), outerFrameId)
  assert.equal(String(projectedSibling.data?.lcos_ref?.artifactId ?? projectedSibling.lcos_ref?.artifactId), String(siblingRef.artifactId))

  const bindingsAfter = repositoryBindings(facade, projectId)
  requireBinding(bindingsAfter, { projectId, canvasId, spatialId: innerCollectionNodeId,
    entityType: 'collection', entityId: innerCollectionId })
  requireBinding(bindingsAfter, { projectId, canvasId, spatialId: outerCarrierId,
    entityType: 'collection', entityId: outerCollectionId })
  requireBinding(bindingsAfter, { projectId, canvasId, spatialId: siblingNodeId,
    entityType: 'artifact', entityId: String(siblingRef.artifactId) })
  for (const child of innerChildren) {
    const prior = bindingsBefore.find(row => String(row.canvasId) === canvasId && String(row.spatialId) === String(child.id))
    const after = bindingsAfter.filter(row => String(row.canvasId) === canvasId && String(row.spatialId) === String(child.id))
    assert.equal(after.length, 1)
    assert.deepEqual({ projectId: after[0].projectId, canvasId: after[0].canvasId, spatialKind: after[0].spatialKind,
      spatialId: after[0].spatialId, entityType: after[0].entityType, entityId: after[0].entityId },
    { projectId: prior.projectId, canvasId: prior.canvasId, spatialKind: prior.spatialKind,
      spatialId: prior.spatialId, entityType: prior.entityType, entityId: prior.entityId })
  }

  const coreMembersAfter = coreValueRecord(await coreValue('GET', collectionPath(outerCollectionId) + '/members'),
    'read outer Core members after space projection')
  assert.deepEqual(sortedMembers(coreMembersAfter.members ?? []), outerMembersReadback,
    'Spatial nesting must not rewrite canonical Core Collection membership.')
  const graphFinal = coreValueRecord(await coreValue('GET', projectPath + '/graph'), 'read final Core graph')
  const finalArtifact = graphFinal.artifacts?.find(row => String(row.id) === String(siblingRef.artifactId))
  const finalView = graphFinal.artifactViews?.find(row => String(row.id) === String(siblingRef.artifactViewId))
  const finalRevision = graphFinal.artifactRevisions?.find(row => String(row.id) === String(siblingRef.revisionId))
  assert.deepEqual({ artifactId: String(finalArtifact?.id), title: String(finalArtifact?.title),
    viewId: String(finalView?.id), viewArtifactId: String(finalView?.artifactId),
    revisionId: String(finalRevision?.id), revisionArtifactId: String(finalRevision?.artifactId) },
  { artifactId: String(siblingRef.artifactId), title: siblingTitle, viewId: String(siblingRef.artifactViewId),
    viewArtifactId: String(siblingRef.artifactId), revisionId: String(siblingRef.revisionId),
    revisionArtifactId: String(siblingRef.artifactId) })

  const fixtureWrites = [
    { producer: 'original native nodes:batchActions + Core text lifecycle', operation: createReceipt.lifecycle_results[0].operation,
      nodeId: siblingNodeId, ref: siblingRefSnapshot, spatialSaved: createReceipt.spatial_saved, coreSaved: createReceipt.core_saved },
    { producer: 'original Core Collections API', collectionId: outerCollectionId, members: outerMembers },
    { producer: 'original Core Assembly Apply', targetRef: { kind: 'main' }, receipt: assemblyRows[0] },
    { producer: 'original Gen2Host collection projection binding', collectionId: outerCollectionId, carrierId: outerCarrierId,
      binding: { projectId, canvasId, workspaceId, spatialKind: 'node', entityType: 'collection', entityId: outerCollectionId } },
    { producer: 'original collection space first-open API', receipt: outerOriginalSpaceReceipt },
  ]

  return { outerCollectionId, outerCarrierId, outerFrameId, siblingNodeId, siblingRef: siblingRefSnapshot,
    outerMembers, canvas, fixtureWrites, outerOriginalSpaceReceipt }
}
