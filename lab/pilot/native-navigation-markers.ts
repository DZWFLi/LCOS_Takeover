import type { NavigationResolutionV0, SpatialMarkerIntentV0, SpatialMarkerTargetRefV0 } from '../../lcos/packages/contracts/src/navigation-marker';

export type NativeNavigationScene = { projectId: string; canvasId: string; workspaceId: string; surfaceRef: string; api: any };
/** A spatial node is a GUI identity, never a fabricated Core entity/surface. */
export type NativeNavigationNodeTarget = { kind: 'native-node'; projectId: string; canvasId: string; nodeId: string };
export type NativeNavigationTarget = SpatialMarkerTargetRefV0 | NativeNavigationNodeTarget;
export type NativeNavigationNodeMarker = { kind: 'native-node'; id: string; projectId: string; scope: 'local'; sourceSurfaceRef: string;
  nativeNode: { canvasId: string; nodeId: string }; title: string };
export type NativeNavigationRecord = SpatialMarkerIntentV0 | NativeNavigationNodeMarker;
export type NativeNavigationFacts = { markers: SpatialMarkerIntentV0[]; graph: any; bindings: any[];
  nativeMarkers?: NativeNavigationNodeMarker[];
  /** One request's saved Canvas evidence, reused by the directory, never a second persisted store. */
  nativeCanvas?: { canvasId: string; nodes: Row[] };
  availability?: { conversations: boolean; runs: boolean; resultSlots?: boolean } };
type Row = Record<string, any>;
type Current = () => boolean;
export type NativeNavigationPending = { kind: 'create' | 'remove'; targetRef?: SpatialMarkerTargetRefV0; nativeNode?: NativeNavigationNodeTarget; nodeId?: string; markerId?: string };
type Attempt = NativeNavigationPending & { scene: NativeNavigationScene; active: boolean;
  createReceipt?: SpatialMarkerIntentV0; removeAcknowledged?: boolean; nativeAcknowledged?: boolean };
const attempts = new Map<string, Attempt>();
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const rows = (value: any): Row[] => Array.isArray(value) ? value : [];
export const isNativeNavigationNodeMarker = (value: NativeNavigationRecord): value is NativeNavigationNodeMarker => (value as NativeNavigationNodeMarker).kind === 'native-node';
export const nativeNavigationRecords = (facts: NativeNavigationFacts): NativeNavigationRecord[] => [...facts.markers, ...(facts.nativeMarkers ?? [])];
export const nativeNavigationRecordTarget = (marker: NativeNavigationRecord): NativeNavigationTarget => isNativeNavigationNodeMarker(marker)
  ? { kind: 'native-node', projectId: marker.projectId, ...marker.nativeNode } : marker.targetRef;
export const sameNativeNavigationTarget = (a?: NativeNavigationTarget, b?: NativeNavigationTarget) => !!a && !!b
  && a.projectId === b.projectId && a.kind === b.kind && (a.kind === 'native-node' && b.kind === 'native-node'
    ? a.canvasId === b.canvasId && a.nodeId === b.nodeId : a.kind !== 'native-node' && b.kind !== 'native-node' && a.id === b.id);
const sameTarget = (a?: SpatialMarkerTargetRefV0, b?: SpatialMarkerTargetRefV0) => !!a && !!b && a.projectId === b.projectId && a.kind === b.kind && a.id === b.id;
const samePlace = (a: NativeNavigationScene, b: NativeNavigationScene) => a.projectId === b.projectId && a.canvasId === b.canvasId && a.workspaceId === b.workspaceId && a.surfaceRef === b.surfaceRef;
const stableSurface = (value: unknown): value is SpatialMarkerIntentV0['sourceSurfaceRef'] => typeof value === 'string' && /^(?:main|assembly|(?:scope|workspace|conversation):.+)$/.test(value);
const targetShape = (value: any, projectId: string): value is SpatialMarkerTargetRefV0 => !!value && value.projectId === projectId && ['view', 'entity', 'surface'].includes(value.kind) && text(value.id);
const error = (message: string, outcome: 'rejected' | 'unknown' = 'rejected', status?: number) => Object.assign(new Error(message), { outcome, ...(status === undefined ? {} : { status }) });
const base = (scene: NativeNavigationScene) => '/api/lcos/core/projects/' + encodeURIComponent(scene.projectId);
function requireScene(scene: NativeNavigationScene, isCurrent?: Current) {
  if (![scene.projectId, scene.canvasId, scene.workspaceId].every(text) || !stableSurface(scene.surfaceRef) || !scene.api || isCurrent?.() === false)
    throw error('原现场或 API 已变化，未向旧目标追加修改。');
}
async function request(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<any> {
  const response = await fetch(path, { method, signal, cache: 'no-store', redirect: 'error',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const payload = await response.json();
  if (!response.ok || payload?.ok !== true) throw error(payload?.error?.message || '导航记录暂未确认。', 'rejected', response.status);
  if (!Object.prototype.hasOwnProperty.call(payload, 'value')) throw error('导航返回缺少真实记录。');
  return payload.value;
}
function validateMarkers(value: any, projectId: string): SpatialMarkerIntentV0[] {
  if (!Array.isArray(value)) throw error('固定目标列表暂不可读取。');
  const ids = new Set<string>();
  for (const marker of value) {
    if (!marker || marker.projectId !== projectId || !text(marker.id) || ids.has(marker.id) || !targetShape(marker.targetRef, projectId)
      || !['local', 'cross-surface'].includes(marker.scope) || marker.scope === 'local' && !stableSurface(marker.sourceSurfaceRef)
      || marker.sourceSurfaceRef !== undefined && !stableSurface(marker.sourceSurfaceRef) || !text(marker.createdAt) || !text(marker.updatedAt))
      throw error('固定目标记录的项目或身份不一致。');
    ids.add(marker.id);
  }
  return value;
}

/** Independent Core reads only. Run/conversation facts are the existing read
 * models, not a requirement to create or execute a Run. No coordinates copied. */
export async function readNativeNavigationFacts(scene: NativeNavigationScene, signal?: AbortSignal): Promise<NativeNavigationFacts> {
  requireScene(scene);
  const prefix = base(scene);
  const reads = await Promise.allSettled([
    request(prefix + '/spatial-markers', 'GET', undefined, signal), request(prefix + '/graph', 'GET', undefined, signal),
    request(prefix + '/spatial/bindings', 'GET', undefined, signal), request(prefix + '/connected-conversations', 'GET', undefined, signal),
    request(prefix + '/execution-projection', 'GET', undefined, signal),
  ]);
  if(signal?.aborted)throw signal.reason??error('原导航读取已取消。');
  for(const result of reads.slice(0,3))if(result.status==='rejected')throw result.reason;
  const [markers,graph,bindings]=reads.slice(0,3).map(result=>(result as PromiseFulfilledResult<any>).value);
  if (graph?.project?.id !== scene.projectId || !Array.isArray(bindings))
    throw error('原项目导航事实不完整，未采用其他项目记录。');
  const conversationRead=reads[3]!,executionRead=reads[4]!;
  const conversations=conversationRead.status==='fulfilled'&&Array.isArray(conversationRead.value)
    &&conversationRead.value.every(row=>row?.projectId===scene.projectId)?conversationRead.value:null;
  const execution=executionRead.status==='fulfilled'&&executionRead.value?.projectId===scene.projectId&&Array.isArray(executionRead.value.runs)
    &&executionRead.value.runs.every((row:Row)=>row?.projectId===scene.projectId)?executionRead.value:null;
  const resultSlots=execution&&Array.isArray(execution.resultSlots)&&execution.resultSlots.every((row:Row)=>row?.projectId===scene.projectId)?execution.resultSlots:null;
  const facts: NativeNavigationFacts = { markers: validateMarkers(markers, scene.projectId), graph: { ...graph, connectedConversations: conversations??[], runs: execution?.runs??[], resultSlots: resultSlots??[] }, bindings,
    availability:{conversations:conversations!==null,runs:execution!==null,resultSlots:resultSlots!==null} };
  // This original Canvas GET is the saved spatial owner. Local unsaved state
  // is not evidence that a pin has persisted; Core facts remain independent.
  try { const nodes = await readNativeNavigationCanvas(scene.canvasId, signal); facts.nativeCanvas = { canvasId: scene.canvasId, nodes }; facts.nativeMarkers = nativeNavigationNodeMarkers(scene, facts, nodes); }
  catch (cause) { if (signal?.aborted) throw cause; }
  return facts;
}

/** Exact canonical identity, never title/position/first binding. The visible
 * native carrier remains the geometry owner. Unsupported entities may still
 * honestly resolve as unresolved in the old Core resolver. */
export function nativeNavigationTarget(node: Row | undefined, scene: NativeNavigationScene, facts: NativeNavigationFacts): SpatialMarkerTargetRefV0 | undefined {
  if (!node || !text(node.id) || node.data?.id !== node.id || node.canvas_id !== undefined && node.canvas_id !== scene.canvasId
    || facts.graph?.project?.id !== scene.projectId) return;
  const graph = facts.graph;
  const owners = rows(graph.workspaces).filter(row => row.id === scene.workspaceId && row.projectId === scene.projectId && row.canvasId === scene.canvasId && !row.archivedAt);
  if (owners.length !== 1) return;
  const bindings = facts.bindings.filter(row => row?.projectId === scene.projectId && row.canvasId === scene.canvasId && row.spatialKind === 'node' && row.spatialId === node.id);
  if (bindings.length !== 1) return;
  const binding = bindings[0], data = node.data;
  const refFields = ['lcos_ref', 'lcos_collection_ref', 'lcos_conversation_ref', 'lcos_execution_ref', 'lcos_run_ref', 'lcos_member_ref'];
  if (refFields.filter(key => data[key] !== undefined).length !== 1) return;
  const ownEntity = (field: string, id: string) => rows(graph[field]).filter(row => row.id === id && row.projectId === scene.projectId && !row.archivedAt).length === 1;
  const ref = data.lcos_ref;
  if (ref) {
    if (ref.version !== 1 || ![ref.artifactId, ref.artifactViewId, ref.revisionId].every(text)
      || ref.entityType !== binding.entityType || ref.entityId !== binding.entityId
      || !(binding.entityType === 'artifact' && binding.entityId === ref.artifactId || binding.entityType === 'view' && binding.entityId === ref.artifactViewId)
      || !ownEntity('artifacts', ref.artifactId)) return;
    const views = rows(graph.artifactViews).filter(view => view.id === ref.artifactViewId && (view.projectId === undefined || view.projectId === scene.projectId)
      && view.artifactId === ref.artifactId && view.revisionId === ref.revisionId && ownEntity('scopes', view.scopeId));
    const revisions = rows(graph.artifactRevisions).filter(row => row.id === ref.revisionId && row.artifactId === ref.artifactId
      && (row.projectId === undefined || row.projectId === scene.projectId));
    if (views.length !== 1 || revisions.length !== 1) return;
    return { projectId: scene.projectId, kind: 'view', id: ref.artifactViewId };
  }
  // Run and ResultSlot keep their real typed identities; neither is renamed
  // to the other to make a generic GUI action available.
  if (data.lcos_execution_ref && !['run', 'result-slot'].includes(data.lcos_execution_ref.entityType)) return;
  const typed = data.lcos_collection_ref ? { ref: data.lcos_collection_ref, type: 'collection', id: data.lcos_collection_ref.collectionId }
    : data.lcos_conversation_ref ? { ref: data.lcos_conversation_ref, type: 'conversation', id: data.lcos_conversation_ref.connectedConversationId }
    : data.lcos_execution_ref ? { ref: data.lcos_execution_ref, type: data.lcos_execution_ref.entityType, id: data.lcos_execution_ref.entityId }
    : data.lcos_run_ref ? { ref: data.lcos_run_ref, type: 'run', id: data.lcos_run_ref.runId }
    : data.lcos_member_ref ? { ref: data.lcos_member_ref, type: data.lcos_member_ref.entityType, id: data.lcos_member_ref.entityId } : undefined;
  const fields: Record<string, string> = { collection: 'collections', conversation: 'connectedConversations', run: 'runs', 'result-slot': 'resultSlots', note: 'notes', scope: 'scopes', workspace: 'workspaces' };
  if (!typed || !text(typed.id) || !fields[typed.type] || typed.ref.projectId !== scene.projectId || typed.ref.canvasId !== scene.canvasId
    || typed.ref.workspaceId !== scene.workspaceId || binding.entityType !== typed.type || binding.entityId !== typed.id || !ownEntity(fields[typed.type]!, typed.id)) return;
  // entity refs are untyped in the existing contract: reject a cross-table id
  // collision rather than making Core choose a different canonical entity.
  if (Object.values(fields).reduce((count, field) => count + rows(graph[field]).filter(row => row.id === typed.id && row.projectId === scene.projectId).length, 0)
    + rows(graph.artifacts).filter(row => row.id === typed.id && row.projectId === scene.projectId).length !== 1) return;
  return { projectId: scene.projectId, kind: 'entity', id: typed.id };
}

/** Ordinary nodes need only their exact original scene/node identity. Any
 * supplied canonical ref/binding must still pass its original typed owner. */
export function nativeNavigationNodeTarget(node: Row | undefined, scene: NativeNavigationScene, facts: NativeNavigationFacts): NativeNavigationTarget | undefined {
  const canonical = nativeNavigationTarget(node, scene, facts); if (canonical) return canonical;
  if (!node || !text(node.id) || node.data?.id !== node.id || node.canvas_id !== undefined && node.canvas_id !== scene.canvasId
    || typeof node.data?.lcos_gui_navigation_pin !== 'boolean'
    || facts.graph?.project?.id !== scene.projectId || ['lcos_ref','lcos_collection_ref','lcos_conversation_ref','lcos_execution_ref','lcos_run_ref','lcos_member_ref',
      'lcos_result_ref','lcos_file_ref','lcos_method_member_ref','lcosCollectionId','lcosCollectionNodeId','lcos_native_collection'].some(key => node.data[key] !== undefined)) return;
  const owners = rows(facts.graph.workspaces).filter(row => row.id === scene.workspaceId && row.projectId === scene.projectId && row.canvasId === scene.canvasId && !row.archivedAt);
  if (owners.length !== 1 || facts.bindings.some(row => row?.canvasId === scene.canvasId && row.spatialKind === 'node' && row.spatialId === node.id)) return;
  if(rows(facts.graph.scopes).filter(row=>row.id===owners[0]!.scopeId&&row.projectId===scene.projectId&&!row.archivedAt).length!==1)return;
  return { kind: 'native-node', projectId: scene.projectId, canvasId: scene.canvasId, nodeId: node.id };
}
/** A promoted ResultSlot keeps its exact shared marker. Its material toolbar
 * still authors the View; this additional identity is read-only projection. */
export function nativeNavigationNodeTargets(node: Row | undefined, scene: NativeNavigationScene, facts: NativeNavigationFacts): NativeNavigationTarget[] {
  const primary = nativeNavigationNodeTarget(node, scene, facts); if (!primary) return [];
  const targets: NativeNavigationTarget[] = [primary], ref = node?.data?.lcos_ref, result = node?.data?.lcos_result_ref;
  if (primary.kind !== 'view' || !result || !ref || result.projectId !== scene.projectId || result.canvasId !== scene.canvasId
    || result.workspaceId !== scene.workspaceId || !text(result.slotId) || result.artifactId !== ref.artifactId
    || result.artifactViewId !== ref.artifactViewId || result.revisionId !== ref.revisionId) return targets;
  const workspace = rows(facts.graph.workspaces).filter(row => row.id === scene.workspaceId && row.projectId === scene.projectId && row.canvasId === scene.canvasId && !row.archivedAt);
  const slots = rows(facts.graph.resultSlots).filter(row => row.id === result.slotId && row.projectId === scene.projectId && !row.archivedAt);
  const fields=['artifacts','collections','connectedConversations','runs','resultSlots','notes','scopes','workspaces'];
  if (workspace.length !== 1 || slots.length !== 1 || fields.reduce((count,field)=>count+rows(facts.graph[field]).filter(row=>row.id===result.slotId&&row.projectId===scene.projectId).length,0)!==1) return targets;
  const slot=slots[0]!;
  if(slot.artifactId===ref.artifactId&&slot.artifactViewId===ref.artifactViewId&&slot.scopeId===workspace[0]!.scopeId
    &&(slot.workspaceId===undefined||slot.workspaceId===scene.workspaceId))targets.push({projectId:scene.projectId,kind:'entity',id:result.slotId});
  return targets;
}
export async function readNativeNavigationCanvas(canvasId: string, signal?: AbortSignal): Promise<Row[]> {
  const response = await fetch('/api/canvas/v1/canvases/' + encodeURIComponent(canvasId), { signal, cache: 'no-store', redirect: 'error' });
  const payload = await response.json(), value = payload.data ?? payload.value;
  if (!response.ok || !(payload.ok === true || payload.code === 0) || value?.id !== canvasId || !Array.isArray(value.nodes)) throw error('原画布固定记录暂时无法读取。');
  return value.nodes;
}
export function nativeNavigationNodeMarkers(scene: NativeNavigationScene, facts: NativeNavigationFacts, nodes: readonly Row[]): NativeNavigationNodeMarker[] {
  return nodes.flatMap(node => {
    const target = nativeNavigationNodeTarget(node, scene, facts);
    return target?.kind === 'native-node' && node.data.lcos_gui_navigation_pin === true ? [{ kind: 'native-node' as const,
      id: 'native-node:' + JSON.stringify([scene.canvasId, node.id]), projectId: scene.projectId, scope: 'local' as const, sourceSurfaceRef: scene.surfaceRef,
      nativeNode: { canvasId: scene.canvasId, nodeId: node.id }, title: String(node.data.title ?? node.data.label ?? '已固定节点') }] : [];
  });
}

export async function resolveNativeNavigationTarget(scene: NativeNavigationScene, target: SpatialMarkerTargetRefV0, signal?: AbortSignal): Promise<NavigationResolutionV0> {
  requireScene(scene);
  if (!targetShape(target, scene.projectId)) throw error('导航目标与当前项目不一致。');
  const result = await request(base(scene) + '/navigation/resolve', 'POST', { targetRef: target }, signal);
  if (result?.status === 'unresolved' && ['cross-project', 'target-missing', 'unknown-target-kind', 'unknown-surface'].includes(result.reason)) return result;
  if (result?.status !== 'resolved' || result.target?.projectId !== scene.projectId || !stableSurface(result.target.surfaceRef)
    || !['main', 'context', 'workflow', 'scene', 'conversation', 'collection', 'assembly'].includes(result.target.surfaceKind)
    || result.target.worldPosition !== undefined && (![result.target.worldPosition.x, result.target.worldPosition.y].every(Number.isFinite)))
    throw error('导航解析返回的准确项目或现场未确认。');
  return result;
}

const matching = (marker: SpatialMarkerIntentV0, scene: NativeNavigationScene, target: SpatialMarkerTargetRefV0) => marker.scope === 'local'
  && marker.sourceSurfaceRef === scene.surfaceRef && sameTarget(marker.targetRef, target);
const keyFor = (scene: NativeNavigationScene, suffix: unknown) => JSON.stringify([scene.projectId, scene.canvasId, scene.workspaceId, scene.surfaceRef, suffix]);
const liveNode = (scene: NativeNavigationScene, id: string) => scene.api.getNode?.(id) ?? scene.api.getNodes?.().find((node: Row) => node.id === id);
const definiteRejection = (cause: any) => cause?.outcome === 'rejected' && [400, 401, 403, 404, 405, 409, 422].includes(cause.status);
function currentTarget(scene: NativeNavigationScene, id: string, facts: NativeNavigationFacts, target: SpatialMarkerTargetRefV0, isCurrent: Current) {
  requireScene(scene, isCurrent);
  const node = liveNode(scene, id);
  if (!node || node.dragging || node.data?.locked || !sameTarget(nativeNavigationTarget(node, scene, facts), target))
    throw error('原节点或准确引用已变化，未提交固定。');
}

export function nativeNavigationMarkerPending(scene: NativeNavigationScene): NativeNavigationPending[] {
  return [...attempts.values()].filter(attempt => samePlace(attempt.scene, scene)).map(({ kind, targetRef, nativeNode, nodeId, markerId }) => ({ kind, targetRef, nativeNode, nodeId, markerId }));
}

/** Only GETs. A missing record after a lost CREATE reply is not proof that a
 * late request cannot commit, so it stays pending and is never replayed. */
export async function verifyNativeNavigationMarkerPending(scene: NativeNavigationScene, isCurrent: Current): Promise<{ status: 'confirmed' | 'unknown'; facts: NativeNavigationFacts; changed?: true }> {
  requireScene(scene, isCurrent);
  const facts = await readNativeNavigationFacts(scene); requireScene(scene, isCurrent);
  let changed = false;
  for (const [key, attempt] of attempts) {
    if (!samePlace(attempt.scene, scene) || attempt.active) continue;
    if (attempt.nativeNode) {
      // A saved true confirms a create. A missing/false read cannot establish
      // that an unacknowledged old write will not arrive later.
      let pinned = facts.nativeMarkers?.some(marker => sameNativeNavigationTarget(nativeNavigationRecordTarget(marker), attempt.nativeNode));
      if(attempt.nativeNode.canvasId!==scene.canvasId){
        pinned=undefined;
        try{const nodes=await readNativeNavigationCanvas(attempt.nativeNode.canvasId);requireScene(scene,isCurrent);
          const owners=rows(facts.graph.workspaces).filter(row=>row.projectId===scene.projectId&&row.canvasId===attempt.nativeNode!.canvasId&&!row.archivedAt);
          const matches=nodes.filter(row=>row.id===attempt.nativeNode!.nodeId);
          if(owners.length===1&&matches.length===1&&sameNativeNavigationTarget(nativeNavigationNodeTarget(matches[0],{...scene,canvasId:attempt.nativeNode.canvasId,workspaceId:owners[0]!.id},facts),attempt.nativeNode))pinned=matches[0]!.data?.lcos_gui_navigation_pin===true;
        }catch(cause){requireScene(scene,isCurrent);}
      }
      if (attempt.nativeAcknowledged || attempt.kind === 'create' && pinned) {
        attempts.delete(key); if (attempt.nativeAcknowledged && pinned !== (attempt.kind === 'create')) changed = true;
      }
      continue;
    }
    const matches = attempt.kind === 'create' ? facts.markers.filter(marker => matching(marker, scene, attempt.targetRef!)) : [];
    const acknowledged = attempt.kind === 'create' ? !!attempt.createReceipt : attempt.removeAcknowledged === true;
    const stillApplied = attempt.kind === 'create' ? matches.length === 1
      && (!attempt.createReceipt || matches[0]!.id === attempt.createReceipt.id)
      : !facts.markers.some(marker => marker.id === attempt.markerId);
    // A valid original ACK proves that this request completed. A later DELETE,
    // CREATE or Undo can supersede it; that is current state, not a late request.
    // Without that ACK, absent CREATE still cannot prove no late commit.
    if (acknowledged || stillApplied) { attempts.delete(key); if (acknowledged && !stillApplied) changed = true; }
  }
  return { status: nativeNavigationMarkerPending(scene).length ? 'unknown' : 'confirmed', facts, ...(changed ? { changed: true as const } : {}) };
}

export async function createNativeNavigationMarker(scene: NativeNavigationScene, nodeId: string, facts: NativeNavigationFacts, isCurrent: Current): Promise<NativeNavigationRecord> {
  requireScene(scene, isCurrent);
  const target = nativeNavigationNodeTarget(liveNode(scene, nodeId), scene, facts);
  if (!target) throw error('这个原节点的准确目标尚未确认。');
  if (target.kind === 'native-node') return setNativeNavigationNodePinned(scene, target, true, isCurrent);
  const key = keyFor(scene, ['create', target.kind, target.id]);
  if (attempts.has(key)) throw error('上一笔固定结果尚未确认，请只读核对；不会重复提交。', 'unknown');
  // Reserve before asynchronous reads, so a double click cannot send two POSTs.
  const attempt: Attempt = { kind: 'create', scene: { ...scene }, nodeId, targetRef: target, active: true };
  attempts.set(key, attempt);
  let sent = false;
  try {
    const fresh = await readNativeNavigationFacts(scene); currentTarget(scene, nodeId, fresh, target, isCurrent);
    const present = fresh.markers.filter(marker => matching(marker, scene, target));
    if (present.length > 1) throw error('同一目标已有多笔固定记录，未继续新增。');
    if (present.length) { attempts.delete(key); return present[0]!; }
    currentTarget(scene, nodeId, fresh, target, isCurrent);
    sent = true;
    const receipt = await request(base(scene) + '/spatial-markers', 'POST', { targetRef: target, scope: 'local', sourceSurfaceRef: scene.surfaceRef });
    validateMarkers([receipt], scene.projectId);
    if (!matching(receipt, scene, target)) throw error('固定回执与原目标不一致。', 'unknown');
    attempt.createReceipt = receipt;
    const after = await readNativeNavigationFacts(scene); requireScene(scene, isCurrent);
    const confirmed = after.markers.filter(marker => matching(marker, scene, target));
    if (confirmed.length !== 1 || confirmed[0]!.id !== receipt.id) {
      attempts.delete(key);
      throw Object.assign(error('固定状态刚有变化，请按当前记录核对。', 'rejected', 409),
        { code: 'NAVIGATION_MARKER_CHANGED', facts: after });
    }
    attempts.delete(key); return confirmed[0]!;
  } catch (cause) {
    if (!sent || definiteRejection(cause)) { attempts.delete(key); throw cause; }
    throw error('固定结果尚未确认，请核对原记录；不会自动重复提交。', 'unknown');
  } finally { attempt.active = false; }
}

export async function removeNativeNavigationMarker(scene: NativeNavigationScene, markerId: string, isCurrent: Current,
  options?:{selectedMarker:NativeNavigationRecord}): Promise<void> {
  requireScene(scene, isCurrent);
  if (!text(markerId)) throw error('未选择准确的固定记录。');
  if (options && isNativeNavigationNodeMarker(options.selectedMarker)) {
    if (options.selectedMarker.id !== markerId || options.selectedMarker.projectId !== scene.projectId) throw error('选中的固定记录已变化，未取消其他目标。');
    await setNativeNavigationNodePinned(scene, nativeNavigationRecordTarget(options.selectedMarker) as NativeNavigationNodeTarget, false, isCurrent); return;
  }
  const key = keyFor(scene, ['remove', markerId]);
  if (attempts.has(key)) throw error('上一笔取消固定尚未确认，请先核对。', 'unknown');
  const attempt: Attempt = { kind: 'remove', scene: { ...scene }, markerId, active: true };
  attempts.set(key, attempt);
  let sent = false;
  try {
    const facts = await readNativeNavigationFacts(scene); requireScene(scene, isCurrent);
    const marker = facts.markers.find(marker => marker.id === markerId);
    if (!marker) { attempts.delete(key); return; }
    if(options){const selected=options.selectedMarker as SpatialMarkerIntentV0;
      if(selected.projectId!==scene.projectId||selected.id!==markerId||!sameTarget(selected.targetRef,marker.targetRef)
        ||selected.scope!==marker.scope||selected.sourceSurfaceRef!==marker.sourceSurfaceRef)
        throw error('选中的固定记录已变化，未取消其他目标。');
    }else if (marker.scope !== 'local' || marker.sourceSurfaceRef !== scene.surfaceRef) throw error('该固定记录不属于当前现场，未取消其他现场的固定。');
    sent = true;
    try {
      const receipt = await request(base(scene) + '/spatial-markers/' + encodeURIComponent(markerId), 'DELETE');
      if (receipt?.deleted !== true || receipt.markerId !== markerId) throw error('取消固定回执未确认。', 'unknown');
      attempt.removeAcknowledged = true;
    } catch (cause: any) {
      if (cause?.status !== 404) throw cause;
      // The original exact DELETE 404 is a completed request too. A later
      // Undo can restore this ID, but this request cannot delete it late.
      attempt.removeAcknowledged = true;
    }
    const after = await readNativeNavigationFacts(scene); requireScene(scene, isCurrent);
    if (after.markers.some(marker => marker.id === markerId)) {
      if (attempt.removeAcknowledged) {
        attempts.delete(key);
        throw Object.assign(error('固定状态刚有变化，请按当前记录核对。', 'rejected', 409),
          { code: 'NAVIGATION_MARKER_CHANGED', facts: after });
      }
      throw error('取消固定尚未读回确认。', 'unknown');
    }
    attempts.delete(key);
  } catch (cause) {
    if (!sent || definiteRejection(cause)) { attempts.delete(key); throw cause; }
    throw error('取消固定结果尚未确认，请核对原记录；不会自动重放。', 'unknown');
  } finally { attempt.active = false; }
}

/** Same GUI adapter as the Agent, through its existing user-scoped route.
 * No Host token, Core marker, domain identity or coordinate copy is created. */
async function setNativeNavigationNodePinned(scene: NativeNavigationScene, target: NativeNavigationNodeTarget, pinned: boolean,
  isCurrent: Current): Promise<NativeNavigationNodeMarker> {
  requireScene(scene, isCurrent);
  if (target.projectId !== scene.projectId) throw error('这个固定不属于原项目。');
  const key = keyFor(scene, ['native-node', target.canvasId, target.nodeId]);
  if (attempts.has(key)) throw error('上一笔固定结果尚未确认，请只读核对；不会重复提交。', 'unknown');
  const attempt: Attempt = { kind: pinned ? 'create' : 'remove', nativeNode: target, scene: { ...scene }, nodeId: target.nodeId, active: true };
  attempts.set(key, attempt); let sent = false;
  try {
    const facts = await readNativeNavigationFacts(scene); requireScene(scene, isCurrent);
    const owners = rows(facts.graph.workspaces).filter(row => row.projectId === target.projectId && row.canvasId === target.canvasId && !row.archivedAt);
    if (owners.length !== 1) throw error('原节点现场的归属已变化，没有修改固定。');
    const workspace = owners[0]!, targetScene = { ...scene, canvasId: target.canvasId, workspaceId: workspace.id,
      surfaceRef: workspace.canvasId === scene.canvasId ? scene.surfaceRef : 'workspace:' + workspace.id };
    const savedNodes = await readNativeNavigationCanvas(target.canvasId); requireScene(scene, isCurrent);
    const matches = savedNodes.filter(row => row.id === target.nodeId), node = matches.length === 1 ? matches[0] : undefined;
    const current = nativeNavigationNodeTarget(node, targetScene, facts);
    if (!sameNativeNavigationTarget(current, target) || node?.dragging || node?.resizing || node?.data?.locked) throw error('原节点或归属已变化，没有修改固定。');
    const prior = node.data.lcos_gui_navigation_pin === true;
    if (prior === pinned) { attempts.delete(key); return nativeMarker(targetScene, node); }
    if (target.canvasId === scene.canvasId) {
      const live = liveNode(scene, target.nodeId);
      if (!sameNativeNavigationTarget(nativeNavigationNodeTarget(live, scene, facts), target) || live?.dragging || live?.resizing || live?.data?.locked) throw error('原节点正在操作，没有修改固定。');
    }
    sent = true;
    const response = await fetch('/api/lcos/canvases/' + encodeURIComponent(target.canvasId) + '/gui', { method: 'POST', cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'SET_NAVIGATION_PIN', nodeId: target.nodeId, pinned, scope: 'local' }) });
    const payload = await response.json(), receipt = payload.data ?? payload.value;
    if (!response.ok || !(payload.code === 0 || payload.ok === true)) throw error(payload.error?.message ?? '固定暂未保存。', 'rejected', response.status);
    if (receipt?.status === 'rejected') throw error(receipt.reason ?? '固定状态刚有变化。', 'rejected', 409);
    if (receipt?.status !== 'confirmed' || receipt.nativeNode?.canvasId !== target.canvasId || receipt.nativeNode?.nodeId !== target.nodeId
      || receipt.changed !== false && !(receipt.spatialReceipt?.canvasId === target.canvasId && receipt.spatialReceipt.spatialSaved === true
        && Number.isSafeInteger(receipt.spatialReceipt.fromVersion) && Number.isSafeInteger(receipt.spatialReceipt.toVersion)
        && receipt.spatialReceipt.toVersion > receipt.spatialReceipt.fromVersion && receipt.spatialReceipt.changedNodeIds?.includes(target.nodeId))) throw error('固定结果尚未确认。', 'unknown');
    attempt.nativeAcknowledged = true;
    const after = await readNativeNavigationFacts(scene); requireScene(scene, isCurrent);
    const afterNodes = await readNativeNavigationCanvas(target.canvasId); requireScene(scene, isCurrent);
    const afterMatches = afterNodes.filter(row => row.id === target.nodeId), latest = afterMatches.length === 1 ? afterMatches[0] : undefined;
    if (!sameNativeNavigationTarget(nativeNavigationNodeTarget(latest, targetScene, after), target) || (latest?.data?.lcos_gui_navigation_pin === true) !== pinned) {
      attempts.delete(key); throw Object.assign(error('固定状态刚有变化，请按当前记录核对。', 'rejected', 409), { code: 'NAVIGATION_MARKER_CHANGED', facts: after });
    }
    attempts.delete(key); return nativeMarker(targetScene, latest!);
  } catch (cause) {
    if (!sent || definiteRejection(cause)) { attempts.delete(key); throw cause; }
    throw error('固定结果尚未确认，请核对原记录；不会自动重复提交。', 'unknown');
  } finally { attempt.active = false; }
}
function nativeMarker(scene: NativeNavigationScene, node: Row): NativeNavigationNodeMarker {
  return { kind: 'native-node', id: 'native-node:' + JSON.stringify([scene.canvasId, node.id]), projectId: scene.projectId,
    scope: 'local', sourceSurfaceRef: scene.surfaceRef, nativeNode: { canvasId: scene.canvasId, nodeId: node.id }, title: String(node.data?.title ?? node.data?.label ?? '已固定节点') };
}
