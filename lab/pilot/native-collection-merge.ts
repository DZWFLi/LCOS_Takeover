import { isDeepStrictEqual as equal } from 'node:util'
import { randomUUID } from 'node:crypto'
import { executeCanvasCommands, getAbsolutePosition } from '../../lcos/huabu/packages/shared/src/canvas-engine/index.ts'
import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'

type Row = Record<string, any>
type Snapshot = { version: number; state: { nodes: Row[]; edges: Row[] } }
const copy = <T>(value: T): T => structuredClone(value)
const key = (member: Row) => JSON.stringify([member.memberRef?.type, member.memberRef?.id])
const sorted = (members: Row[]) => [...members].sort((a, b) => key(a).localeCompare(key(b)))
const record = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
const geometry = (node: Row) => ({ id: node.id, type: node.type, position: node.position,
  parentId: node.parentId ?? null, size: { width: node.measured?.width ?? node.width ?? node.style?.width,
    height: node.measured?.height ?? node.height ?? node.style?.height } })

/** One extension of the existing Collection space/O8 owner. Core retains both
 * Collection identities; only target membership and the source's current-Canvas
 * projection change. No extra Canvas, history stack, SQL, or model execution. */
export function createNativeCollectionMerge({ repository, projectId, spatial, projectNativeNodes, fail }: {
  repository: SqliteMetadataRepository; projectId: string
  spatial: { withCanvasLock<T>(canvasId: string, work: (locked: { read(): Promise<any>; execute(commands: any[]): Promise<any> }) => Promise<T>): Promise<T> }
  projectNativeNodes: (canvasId: string, snapshot: any) => Promise<Row[]>
  fail: (status: number, code: string, message: string) => never
}) {
  function owner(canvasId: string, sourceCollectionId: string, targetCollectionId: string) {
    if (![canvasId, sourceCollectionId, targetCollectionId].every(text) || sourceCollectionId === targetCollectionId) {
      fail(400, 'INVALID_COLLECTION_MERGE', 'Merge needs two different Collections on one Canvas.')
    }
    const workspaces = repository.getWorkspaces(projectId).filter(w => String(w.canvasId) === canvasId)
    const source = repository.getCollection(sourceCollectionId), target = repository.getCollection(targetCollectionId)
    if (workspaces.length !== 1 || String(workspaces[0]?.projectId) !== projectId
      || String(source?.projectId) !== projectId || String(target?.projectId) !== projectId) {
      fail(409, 'COLLECTION_MERGE_OWNER_MISMATCH', 'Both Collections and the unique Workspace must belong to the same project.')
    }
    return { workspaceId: String(workspaces[0]!.id), source: source!, target: target! }
  }
  const memberships = (id: string) => copy(repository.listCollectionMemberships(projectId, id)) as Row[]
  const binding = (canvasId: string, id: string) => {
    const rows = repository.getProjectionBindings(projectId).filter(b => b.canvasId === canvasId && b.spatialKind === 'node'
      && b.entityType === 'collection' && b.entityId === id)
    if (rows.length > 1) fail(409, 'COLLECTION_MERGE_BINDING_AMBIGUOUS', 'A Collection has multiple Canvas carriers.')
    return rows[0]
  }
  function canonicalMember(ref: Row): boolean {
    switch (ref?.type) {
      case 'artifact': return String(repository.getArtifact(ref.id)?.projectId) === projectId
      case 'note': return String(repository.getNote(ref.id)?.projectId) === projectId
      case 'collection': return String(repository.getCollection(ref.id)?.projectId) === projectId
      case 'scope': return repository.getScopes(projectId).some(scope => String(scope.id) === ref.id && scope.kind !== 'collection')
      case 'workspace': return String(repository.getWorkspace(ref.id)?.projectId) === projectId
      case 'conversation': return !!repository.getConnectedConversation(projectId, ref.id)
      case 'run': return String(repository.getRun(ref.id)?.projectId) === projectId
      default: return false
    }
  }
  function validateNesting(targetId: string, members: Row[]) {
    const edges = repository.listCollectionMemberships(projectId).filter(m => String(m.collectionId) !== targetId && m.memberRef.type === 'collection')
    const graph = new Map<string, string[]>()
    for (const member of [...edges, ...members.filter(m => m.memberRef.type === 'collection')]) {
      graph.set(String(member.collectionId), [...(graph.get(String(member.collectionId)) ?? []), member.memberRef.id])
    }
    const visit = (id: string, path: Set<string>, depth: number) => {
      if (path.has(id) || depth > 2) fail(409, 'COLLECTION_MERGE_NESTING_CONFLICT', 'Merge would create a Collection cycle or exceed its supported nesting depth.')
      for (const child of graph.get(id) ?? []) visit(child, new Set(path).add(id), depth + 1)
    }
    for (const id of graph.keys()) visit(id, new Set(), 0)
  }
  function validateSnapshot(snapshot: any): asserts snapshot is Snapshot {
    if (!record(snapshot) || !Number.isSafeInteger(snapshot.version) || snapshot.version < 0
      || !Array.isArray(snapshot.state?.nodes) || !Array.isArray(snapshot.state?.edges)
      || new Set(snapshot.state.nodes.map((n: Row) => n.id)).size !== snapshot.state.nodes.length) {
      fail(409, 'COLLECTION_MERGE_SNAPSHOT_UNAVAILABLE', 'Original Canvas snapshot is incomplete or ambiguous.')
    }
  }
  function carrier(snapshot: Snapshot, id: string, collectionId: string, workspaceId: string, canvasId: string) {
    const node = snapshot.state.nodes.find(n => n.id === id)
    if (!node || node.type === 'frame' || node.parentId || node.dragging || node.data?.locked
      || !record(node.data) || node.data.src || node.data.content || node.data.text) {
      fail(409, 'COLLECTION_MERGE_CARRIER_UNAVAILABLE', 'Merge requires two unlocked root Collection carriers; authored material is never consumed as a folder.')
    }
    const ref = node.data.lcos_collection_ref
    if (ref && (ref.projectId !== projectId || ref.canvasId !== undefined && ref.canvasId !== canvasId
      || ref.workspaceId !== workspaceId || ref.collectionId !== collectionId)) {
      fail(409, 'COLLECTION_MERGE_CARRIER_MISMATCH', 'Saved carrier reference conflicts with its canonical binding.')
    }
    const box = geometry(node)
    if (!Number.isFinite(box.position?.x) || !Number.isFinite(box.position?.y) || !Number.isFinite(box.size.width)
      || !Number.isFinite(box.size.height) || box.size.width <= 0 || box.size.height <= 0) fail(409, 'COLLECTION_MERGE_GEOMETRY_UNAVAILABLE', 'Folder geometry is not confirmed.')
    return node
  }
  function commandsFor(snapshot: Snapshot, merge: Row, undo: boolean): Row[] {
    const from = undo ? merge.after : merge.before, to = undo ? merge.before : merge.after
    const fromIds = new Set(from.map((n: Row) => n.id)), toIds = new Set(to.map((n: Row) => n.id))
    const commands: Row[] = []
    const creates = to.filter((n: Row) => !fromIds.has(n.id))
    if (creates.length) commands.push({ type: 'CREATE_NODES', nodes: creates.map((node: Row) => ({ id: node.id, nodeType: node.type,
      data: copy(node.data), position: copy(node.position), size: geometry(node).size, selectOnCreate: false })) })
    for (const node of to) {
      const previous = from.find((n: Row) => n.id === node.id)
      if ((node.parentId ?? null) !== (previous?.parentId ?? null)) commands.push({ type: 'SET_NODE_PARENT', nodeIds: [node.id], parentId: node.parentId ?? null })
    }
    const removed = from.filter((n: Row) => !toIds.has(n.id))
    // Every child is explicitly moved before its source frame leaves. No
    // recursive delete is allowed to carry a material along for the ride.
    for (const node of removed.filter((n: Row) => n.type === 'frame')) commands.push({ type: 'DISSOLVE_FRAME', frameId: node.id })
    const leaves = removed.filter((n: Row) => n.type !== 'frame').map((n: Row) => n.id)
    if (leaves.length) commands.push({ type: 'DELETE_NODES', nodeIds: leaves })
    const moves = to.filter((n: Row) => !equal(geometry(n), geometry(from.find((x: Row) => x.id === n.id) ?? {})))
    if (moves.length) commands.push({ type: 'SET_NODE_GEOMETRY', items: moves.map((node: Row) => ({ nodeId: node.id,
      position: copy(node.position), size: geometry(node).size })) })
    return commands
  }
  function simulate(snapshot: Snapshot, commands: Row[], canvasId: string): Snapshot {
    const result = executeCanvasCommands({ commands, source: 'ui' } as never, { ...copy(snapshot.state), canvasId } as never)
    if (result.commandResults.length !== commands.length || result.commandResults.some(r => !r.applied && r.reason !== 'no-op')) {
      fail(409, 'COLLECTION_MERGE_PLAN_REJECTED', 'Original spatial executor rejected the complete merge plan before mutation.')
    }
    return { ...snapshot, state: { nodes: result.writeResult.nodes as Row[], edges: result.writeResult.edges as Row[] } }
  }
  async function prepare(input: { canvasId: string; sourceCollectionId: string; targetCollectionId: string }) {
    const owned = owner(input.canvasId, input.sourceCollectionId, input.targetCollectionId)
    return spatial.withCanvasLock(input.canvasId, async locked => {
      const snapshot = await locked.read(); validateSnapshot(snapshot)
      const sourceBinding = binding(input.canvasId, input.sourceCollectionId), targetBinding = binding(input.canvasId, input.targetCollectionId)
      if (!sourceBinding || !targetBinding) fail(409, 'COLLECTION_MERGE_BINDING_REQUIRED', 'Both Collections need an existing exact Canvas binding.')
      const source = carrier(snapshot, sourceBinding!.spatialId, input.sourceCollectionId, owned.workspaceId, input.canvasId)
      const target = carrier(snapshot, targetBinding!.spatialId, input.targetCollectionId, owned.workspaceId, input.canvasId)
      const sourceMembers = memberships(input.sourceCollectionId), beforeMembers = memberships(input.targetCollectionId)
      const additions = sourceMembers.filter(member => !beforeMembers.some(row => key(row) === key(member)))
        .map(member => ({ ...member, collectionId: input.targetCollectionId, relationId: 'collection-member-' + randomUUID(), addedAt: new Date().toISOString() }))
      const afterMembers = [...beforeMembers, ...additions]
      if (afterMembers.some(m => !canonicalMember(m.memberRef))) fail(409, 'COLLECTION_MERGE_MEMBER_UNAVAILABLE', 'A member is no longer readable in this project.')
      validateNesting(input.targetCollectionId, afterMembers)
      const frames = snapshot.state.nodes.filter(node => node.type === 'frame' && node.data?.lcosCollectionId === input.sourceCollectionId)
      const targetFrames = snapshot.state.nodes.filter(node => node.type === 'frame' && node.data?.lcosCollectionId === input.targetCollectionId)
      if (frames.length > 1 || targetFrames.length > 1 || [...frames, ...targetFrames].some(n => n.parentId || n.dragging || n.data?.locked)
        || frames.some(n => n.data?.lcosCollectionNodeId !== source.id) || targetFrames.some(n => n.data?.lcosCollectionNodeId !== target.id)) {
        fail(409, 'COLLECTION_MERGE_FRAME_CONFLICT', 'Collection frames must have exact unlocked original owners.')
      }
      const removedIds = new Set([source.id, ...frames.map(n => n.id)])
      if (snapshot.state.edges.some(edge => removedIds.has(edge.source) || removedIds.has(edge.target))) {
        fail(409, 'COLLECTION_MERGE_CONNECTED_CARRIER', 'This folder has connected lines; merge cannot discard their meaning.')
      }
      const children = frames.length ? snapshot.state.nodes.filter(node => node.parentId === frames[0].id) : []
      if (children.some(n => n.type === 'frame' || n.dragging || n.data?.locked)) fail(409, 'COLLECTION_MERGE_CHILD_CONFLICT', 'Nested or locked spatial members cannot be moved by this merge.')
      // Every affected child must still have one exact Core material binding
      // which is represented by the source's complete canonical membership.
      const allBindings = repository.getProjectionBindings(projectId).filter(b => b.canvasId === input.canvasId && b.spatialKind === 'node')
      for (const child of children) {
        const rows = allBindings.filter(b => b.spatialId === child.id)
        const b = rows[0], view = b?.entityType === 'view' ? repository.getArtifactView(b.entityId) : undefined
        if (rows.length !== 1 || !sourceMembers.some(m => m.memberRef.type === b.entityType && m.memberRef.id === b.entityId
          || m.memberRef.type === 'artifact' && view && m.memberRef.id === String(view.artifactId))) {
          fail(409, 'COLLECTION_MERGE_CHILD_MEMBERSHIP_MISMATCH', 'The source frame contains a node outside its exact Core membership.')
        }
      }
      const before = copy([source, ...frames, ...children, target, ...targetFrames])
      const after = before.filter(n => !removedIds.has(n.id)).map(node => {
        if (!children.some(c => c.id === node.id)) return node
        const world = getAbsolutePosition(snapshot.state.nodes as never[], node.id)
        const destination = targetFrames[0]
        const origin = destination ? getAbsolutePosition(snapshot.state.nodes as never[], destination.id) : {x:0,y:0}
        if (!world || !origin) fail(409, 'COLLECTION_MERGE_GEOMETRY_UNAVAILABLE', 'Member world geometry is not available.')
        return { ...node, parentId: destination?.id, position: {x:world!.x-origin!.x,y:world!.y-origin!.y} }
      })
      const merge: Row = { projectId, ...input, workspaceId: owned.workspaceId, sourceNodeId: source.id, targetNodeId: target.id,
        sourceVersion: snapshot.version, sourceBinding: copy(sourceBinding), sourceMembers, beforeMembers, afterMembers, before, after }
      const commands = commandsFor(snapshot, merge, false).filter(command => command.type !== 'SET_NODE_GEOMETRY'), planned = simulate(snapshot, commands, input.canvasId)
      const scope = new Set(before.map(n => n.id))
      merge.after = planned.state.nodes.filter(n => scope.has(n.id))
      const [beforeNodes, projectedAfter] = await Promise.all([projectNativeNodes(input.canvasId, snapshot), projectNativeNodes(input.canvasId, planned)])
      const sourceNative = beforeNodes.find(n => n.id === source.id), targetNative = beforeNodes.find(n => n.id === target.id)
      if (!sourceNative || !targetNative || sourceNative.type !== 'pile' || targetNative.type !== 'pile') {
        fail(409, 'COLLECTION_MERGE_NATIVE_CARRIER_UNAVAILABLE', 'Merge is available only through the two original native Pile carriers.')
      }
      const memberIds = [...new Set([...(targetNative!.data.memberIds ?? []), ...(sourceNative!.data.memberIds ?? [])])]
      const nativeAfter = projectedAfter.map(n => n.id === target.id ? { ...n, data: { ...n.data, memberIds } } : n)
      merge.nativeBefore = beforeNodes.filter(n => scope.has(n.id))
      merge.nativeAfter = nativeAfter.filter(n => scope.has(n.id))
      return { project_id: projectId, canvas_id: input.canvasId, workspace_id: owned.workspaceId,
        source_collection_id: input.sourceCollectionId, target_collection_id: input.targetCollectionId,
        source_node_id: source.id, target_node_id: target.id, source_version: snapshot.version,
        before_nodes: merge.nativeBefore, after_nodes: merge.nativeAfter, merge, committed: false, provider_execution_started: false }
    })
  }
  function validateOperation(operation: any, canvasId: string): Row {
    const merge = operation?.merge
    if (!record(operation) || Object.keys(operation).sort().join(',') !== 'kind,merge,operationId,phase,version'
      || operation.kind !== 'collection-merge' || operation.version !== 1 || !text(operation.operationId)
      || !['apply','undo','redo'].includes(operation.phase) || !record(merge)
      || merge.projectId !== projectId || merge.canvasId !== canvasId
      || !['workspaceId','sourceCollectionId','targetCollectionId','sourceNodeId','targetNodeId'].every(k => text(merge[k]))
      || !Number.isSafeInteger(merge.sourceVersion) || merge.sourceVersion < 0
      || !['sourceMembers','beforeMembers','afterMembers','before','after','nativeBefore','nativeAfter'].every(k => Array.isArray(merge[k]))) {
      fail(400, 'INVALID_COLLECTION_MERGE_OPERATION', 'Expected one complete original O8 Collection merge intent.')
    }
    const owned = owner(canvasId, merge.sourceCollectionId, merge.targetCollectionId)
    if (owned.workspaceId !== merge.workspaceId || merge.sourceNodeId === merge.targetNodeId) fail(409, 'COLLECTION_MERGE_OWNER_MISMATCH', 'Merge identity changed.')
    for (const name of ['beforeMembers','afterMembers','sourceMembers']) {
      if (new Set(merge[name].map(key)).size !== merge[name].length || merge[name].some((m: Row) => !text(m.relationId) || !text(m.addedAt)
        || !canonicalMember(m.memberRef) || m.collectionId !== (name === 'sourceMembers' ? merge.sourceCollectionId : merge.targetCollectionId))) {
        fail(409, 'COLLECTION_MERGE_MEMBER_UNAVAILABLE', 'Merge member identity is incomplete or foreign.')
      }
    }
    const desiredKeys = new Set([...merge.beforeMembers, ...merge.sourceMembers].map(key))
    if (desiredKeys.size !== merge.afterMembers.length || merge.afterMembers.some((m: Row) => !desiredKeys.has(key(m)))
      || merge.beforeMembers.some((m: Row) => !merge.afterMembers.some((a: Row) => equal(a,m)))) {
      fail(409, 'COLLECTION_MERGE_MEMBER_SET_MISMATCH', 'Merge must flatten the complete target and source membership, preserving existing target relations.')
    }
    validateNesting(merge.targetCollectionId, merge.afterMembers)
    if (!record(merge.sourceBinding) || merge.sourceBinding.projectId !== projectId || merge.sourceBinding.canvasId !== canvasId
      || merge.sourceBinding.spatialKind !== 'node' || merge.sourceBinding.spatialId !== merge.sourceNodeId
      || merge.sourceBinding.entityType !== 'collection' || merge.sourceBinding.entityId !== merge.sourceCollectionId) {
      fail(409,'COLLECTION_MERGE_BINDING_MISMATCH','Recorded source binding is not the same project/Canvas/Collection.')
    }
    carrier({version:0,state:{nodes:merge.before,edges:[]}},merge.sourceNodeId,merge.sourceCollectionId,merge.workspaceId,canvasId)
    const before = new Map(merge.before.map((n: Row) => [n.id,n])), after = new Map(merge.after.map((n: Row) => [n.id,n]))
    if (before.size !== merge.before.length || after.size !== merge.after.length || !before.has(merge.sourceNodeId)
      || after.has(merge.sourceNodeId) || !before.has(merge.targetNodeId) || !after.has(merge.targetNodeId)
      || [...after.keys()].some(id => !before.has(id))) fail(409, 'COLLECTION_MERGE_NODE_SET_MISMATCH', 'Merge can only remove its source carrier and owned frame.')
    const removed = merge.before.filter((n: Row) => !after.has(n.id))
    if (removed.some((n: Row) => n.id !== merge.sourceNodeId && !(n.type === 'frame' && n.data?.lcosCollectionId === merge.sourceCollectionId
      && n.data?.lcosCollectionNodeId === merge.sourceNodeId)) || !equal(before.get(merge.targetNodeId),after.get(merge.targetNodeId))) {
      fail(409, 'COLLECTION_MERGE_NODE_SET_MISMATCH', 'Merge cannot remove materials or alter the target carrier.')
    }
    for (const node of merge.after) {
      const previous = before.get(node.id) as Row
      if (node.type !== previous.type || !equal(node.data,previous.data)) fail(409,'COLLECTION_MERGE_AUTHORED_DATA_CHANGED','Merge cannot alter existing node content or authored data.')
    }
    return merge
  }
  function verifyActions(actions: any, merge: Row, undo: boolean) {
    if (!Array.isArray(actions) || actions.some(a => !['create','update','delete'].includes(a?.action))) fail(400, 'COLLECTION_MERGE_ACTION_MISMATCH', 'Expected complete native merge actions.')
    const from: Row[] = undo ? merge.nativeAfter : merge.nativeBefore, to: Row[] = undo ? merge.nativeBefore : merge.nativeAfter
    const fromMap = new Map(from.map(n=>[n.id,n])), toMap = new Map(to.map(n=>[n.id,n]))
    const expected = new Map<string,string>()
    for (const [id,node] of fromMap) if (!toMap.has(id)) expected.set(id,'delete'); else if (!equal(node,toMap.get(id))) expected.set(id,'update')
    for (const [id] of toMap) if (!fromMap.has(id)) expected.set(id,'create')
    const actual = new Map<string,Row>()
    for (const action of actions) for (const node of action.action === 'delete' ? action.delete_ids ?? [] : action[action.action === 'create' ? 'creates' : 'updates'] ?? []) {
      const id = typeof node === 'string' ? node : node.id
      if (actual.has(id) || expected.get(id) !== action.action) fail(409,'COLLECTION_MERGE_ACTION_MISMATCH','A native merge action is duplicate or outside the exact plan.')
      if (action.action !== 'delete') {
        const desired = toMap.get(id)!, previous = fromMap.get(id)
        // Original r6 create DTOs include canvas_id; its PC update DTOs use
        // the owning request envelope instead. Explicit foreign IDs still fail.
        if (node.type !== desired.type || (action.action === 'create' || node.canvas_id !== undefined) && node.canvas_id !== merge.canvasId
          || node.position && !equal(node.position,desired.position)
          || node.parent_id !== undefined && node.parent_id !== (desired.parent_id ?? '')
          || node.measured && !equal(node.measured,desired.measured)
          || node.data && !equal(node.data,desired.data)) fail(409,'COLLECTION_MERGE_ACTION_MISMATCH','Native merge data or geometry differs from its exact plan.')
        if (action.action === 'create' && (!node.data || !node.position || !node.measured)
          || action.action === 'update' && previous && equal(previous,desired)) fail(409,'COLLECTION_MERGE_ACTION_MISMATCH','Native merge action is incomplete or unchanged.')
        if (Object.keys(node).some(k=>!['id','type','canvas_id','position','parent_id','measured','width','height','data'].includes(k))) fail(409,'COLLECTION_MERGE_ACTION_MISMATCH','Native merge includes an unplanned authored field.')
      }
      actual.set(id,{action:action.action,node})
    }
    if (actual.size !== expected.size) fail(409,'COLLECTION_MERGE_ACTION_SET_INCOMPLETE','Original merge actions were split or incomplete.')
  }
  async function applyOperation(input: {canvasId:string;expectedVersion:number;operation:any;actions:unknown}) {
    const merge = validateOperation(input.operation,input.canvasId), undo = input.operation.phase === 'undo'
    verifyActions(input.actions,merge,undo)
    return spatial.withCanvasLock(input.canvasId,async locked=>{
      const snapshot=await locked.read();validateSnapshot(snapshot)
      if(snapshot.version!==input.expectedVersion)fail(409,'CANVAS_VERSION_CONFLICT','Canvas changed before merge persistence; current edits remain in the original O8.')
      if(!equal(sorted(memberships(merge.sourceCollectionId)),sorted(merge.sourceMembers)))fail(409,'COLLECTION_MERGE_SOURCE_CHANGED','Source membership changed after merge preparation.')
      const targetMembers=memberships(merge.targetCollectionId), currentBinding=binding(input.canvasId,merge.sourceCollectionId)
      const coreBefore=equal(sorted(targetMembers),sorted(merge.beforeMembers))&&currentBinding?.spatialId===merge.sourceNodeId
      const coreAfter=equal(sorted(targetMembers),sorted(merge.afterMembers))&&!currentBinding
      if(undo&&coreAfter&&repository.getProjectionBindings(projectId).some(b=>b.canvasId===input.canvasId&&b.spatialKind==='node'&&b.spatialId===merge.sourceNodeId))fail(409,'COLLECTION_MERGE_SOURCE_NODE_REUSED','The source NodeID is now used by another Core entity.')
      if(!coreBefore&&!coreAfter)fail(409,'COLLECTION_MERGE_MEMBERSHIP_CHANGED','A Collection membership or source binding has changed; later work is preserved.')
      const targetBinding=binding(input.canvasId,merge.targetCollectionId)
      if(targetBinding?.spatialId!==merge.targetNodeId)fail(409,'COLLECTION_MERGE_TARGET_CHANGED','Target carrier changed.')
      const side=(expected:Row[])=>expected.every(n=>{const actual=snapshot.state.nodes.find(a=>a.id===n.id);return !!actual&&equal(geometry(actual),geometry(n))&&equal(actual.data,n.data)})
      const removed=merge.before.filter((n:Row)=>!merge.after.some((a:Row)=>a.id===n.id))
      const spaceBefore=side(merge.before), spaceAfter=side(merge.after)&&removed.every((n:Row)=>!snapshot.state.nodes.some(a=>a.id===n.id))
      if(!spaceBefore&&!spaceAfter)fail(409,'COLLECTION_MERGE_SPATIAL_STATE_CHANGED','Current Canvas is not on an exact side of this original merge.')
      if(spaceBefore) {
        carrier(snapshot,merge.sourceNodeId,merge.sourceCollectionId,merge.workspaceId,input.canvasId)
        carrier(snapshot,merge.targetNodeId,merge.targetCollectionId,merge.workspaceId,input.canvasId)
        const incident=new Set(removed.map((n:Row)=>n.id))
        if(snapshot.state.edges.some(e=>incident.has(e.source)||incident.has(e.target)))fail(409,'COLLECTION_MERGE_CONNECTED_CARRIER','A connected folder cannot be consumed by merge.')
      }
      const additions=merge.afterMembers.filter((m:Row)=>!merge.beforeMembers.some((b:Row)=>key(b)===key(m)))
      const wantsCoreBefore=undo, wantsSpaceBefore=undo
      const audit=repository.listMutationChangeSets(projectId,1000).some(change=>change.operationId===input.operation.operationId
        && equal(change.changes.filter(c=>c.type==='collection_membership_add').map((c:any)=>c.membership).sort((a:Row,b:Row)=>key(a).localeCompare(key(b))),sorted(additions)))
      if(undo&&!audit)fail(409,'COLLECTION_MERGE_FORWARD_UNCONFIRMED','Undo needs the existing Core merge ChangeSet; no invented restore was accepted.')
      const needCore=wantsCoreBefore?!coreBefore:!coreAfter,needSpace=wantsSpaceBefore?!spaceBefore:!spaceAfter
      const commands=needSpace?commandsFor(snapshot,merge,undo):[]
      const planned=commands.length?simulate(snapshot,commands,input.canvasId):snapshot
      const desired=undo?merge.before:merge.after
      const scopeIds=new Set(merge.before.map((n:Row)=>n.id))
      for(const node of snapshot.state.nodes)if(!scopeIds.has(node.id)){
        const changed=planned.state.nodes.find(n=>n.id===node.id)
        if(!changed||!equal(geometry(changed),geometry(node))||!equal(changed.data,node.data))fail(409,'COLLECTION_MERGE_UNPLANNED_CHANGE','Merge would change a node outside its exact original scope.')
      }
      if(coreBefore&&spaceBefore){
        if(input.operation.phase==='apply'&&merge.sourceVersion!==snapshot.version)fail(409,'CANVAS_VERSION_CONFLICT','Merge prepare version is stale.')
        const actualNative=await projectNativeNodes(input.canvasId,snapshot)
        const expectedBefore=actualNative.filter(n=>scopeIds.has(n.id))
        const sourceNative=actualNative.find(n=>n.id===merge.sourceNodeId),targetNative=actualNative.find(n=>n.id===merge.targetNodeId)
        if(!sourceNative||!targetNative||sourceNative.type!=='pile'||targetNative.type!=='pile')fail(409,'COLLECTION_MERGE_NATIVE_CARRIER_UNAVAILABLE','Original Pile identity changed.')
        const simulated=undo?simulate(snapshot,commandsFor(snapshot,merge,false),input.canvasId):planned
        const projected=await projectNativeNodes(input.canvasId,simulated)
        const memberIds=[...new Set([...(targetNative.data.memberIds??[]),...(sourceNative.data.memberIds??[])])]
        const expectedAfter=projected.filter(n=>scopeIds.has(n.id)).map(n=>n.id===merge.targetNodeId?{...n,data:{...n.data,memberIds}}:n)
        const byId=(rows:Row[])=>[...rows].sort((a,b)=>a.id.localeCompare(b.id))
        if(!equal(byId(expectedBefore),byId(merge.nativeBefore))||!equal(byId(expectedAfter),byId(merge.nativeAfter)))fail(409,'COLLECTION_MERGE_NATIVE_PLAN_MISMATCH','Native merge content differs from the real Core projection.')
        const derived=simulate(snapshot,commandsFor(snapshot,merge,false).filter(command=>command.type!=='SET_NODE_GEOMETRY'),input.canvasId)
        if(!merge.after.every((node:Row)=>{const expected=derived.state.nodes.find(n=>n.id===node.id);return expected&&equal(geometry(expected),geometry(node))}))fail(409,'COLLECTION_MERGE_MEMBER_POSITION_MISMATCH','Merge geometry differs from the original executor parent-transfer result.')
        const sourceFrames=merge.before.filter((n:Row)=>n.type==='frame'&&n.data?.lcosCollectionId===merge.sourceCollectionId)
        for(const node of merge.after){
          const previous=merge.before.find((n:Row)=>n.id===node.id)
          if(previous.parentId&&sourceFrames.some((frame:Row)=>frame.id===previous.parentId)){
            const beforeWorld=getAbsolutePosition(snapshot.state.nodes as never[],node.id),afterWorld=getAbsolutePosition(derived.state.nodes as never[],node.id)
            if(!beforeWorld||!afterWorld||Math.abs(beforeWorld.x-afterWorld.x)>1e-7||Math.abs(beforeWorld.y-afterWorld.y)>1e-7)fail(409,'COLLECTION_MERGE_MEMBER_POSITION_MISMATCH','Merge cannot move a source member in world space.')
          }
        }
      }
      if(!desired.every((n:Row)=>{const actual=planned.state.nodes.find(a=>a.id===n.id);return actual&&equal(geometry(actual),geometry(n))}))fail(409,'COLLECTION_MERGE_PLAN_REJECTED','Original executor cannot restore the exact merge geometry.')
      const commitCore = () => {
        const now=new Date().toISOString(),changes=additions.map((membership:Row)=>({type:undo?'collection_membership_remove':'collection_membership_add',membership,
          inverse:{type:undo?'collection_membership_add':'collection_membership_remove',membership},forward:{type:undo?'collection_membership_remove':'collection_membership_add',membership},
          appliedFingerprint:`collection-membership:${membership.relationId}:${undo?'absent':'present'}`}))
        repository.runCurationMutation(()=>{
          if(undo) repository.upsertProjectionBinding(merge.sourceBinding)
          else repository.deleteProjectionBinding(projectId,input.canvasId,'node','collection',merge.sourceCollectionId)
          return {projectId,...(undo?{collectionMembershipDeletes:additions}:{collectionMembershipAdds:additions}),
            changeSet:{schemaVersion:1,id:'changeset-'+randomUUID(),projectId,operationId:input.operation.operationId,actorKind:'web',changes,status:'applied',createdAt:now}}
        })
      }
      // A carrier is classified by its existing binding on every read. Keep
      // that binding until deletion commits; restore it before recreating the
      // same source node on Undo. Partial cross-system results stay on an exact
      // recoverable side and the existing O8 save owns any explicit retry.
      if(undo&&needCore)commitCore()
      if(commands.length) {
        const receipt=await locked.execute(commands)
        if(!record(receipt)||receipt.fromVersion!==snapshot.version||!Number.isSafeInteger(receipt.toVersion)
          ||receipt.results?.length!==commands.length||receipt.results.some((r:Row)=>!r.applied&&r.reason!=='no-op'))fail(409,'COLLECTION_MERGE_SPATIAL_UNCONFIRMED','Core merge is recorded; original spatial save is not confirmed. Keep O8 and read back before retrying.')
      }
      if(!undo&&needCore)commitCore()
      const after=await locked.read();validateSnapshot(after)
      const expectedMembers=undo?merge.beforeMembers:merge.afterMembers
      if(!equal(sorted(memberships(merge.targetCollectionId)),sorted(expectedMembers))
        ||!equal(sorted(memberships(merge.sourceCollectionId)),sorted(merge.sourceMembers))
        ||!desired.every((n:Row)=>{const actual=after.state.nodes.find(a=>a.id===n.id);return actual&&equal(geometry(actual),geometry(n))})
        ||!undo&&removed.some((n:Row)=>after.state.nodes.some(a=>a.id===n.id)))fail(409,'COLLECTION_MERGE_READBACK_UNCONFIRMED','Merge result is not fully confirmed; neither Collection domain entity was removed.')
      return {canvas_id:input.canvasId,workspace_id:merge.workspaceId,source_collection_id:merge.sourceCollectionId,target_collection_id:merge.targetCollectionId,
        merged:!undo,source_domain_preserved:true,core_saved:true,spatial_saved:true,idempotent:!needCore&&!needSpace,from_version:snapshot.version,to_version:after.version,provider_execution_started:false}
    })
  }
  return {prepare,applyOperation}
}

