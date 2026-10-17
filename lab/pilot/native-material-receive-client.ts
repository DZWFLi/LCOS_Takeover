import type { NativeCanvasSnapshot } from './native-canvas-port';
import { nativeCollectionSavedPlacementMatches } from './native-collection-save-precision.mjs';

type Api = NonNullable<NativeCanvasSnapshot['rfInstance']>;
type Row = Record<string, any>;
export type NativeLibraryMaterialReceiveTarget = { kind: 'main' } | { kind: 'context' | 'workflow' | 'conversation'; id: string };
export interface NativeLibraryMaterialReceive {
  projectId: string; canvasId: string; workspaceId?: string; artifactId: string; revisionId: string; fileRecordId: string;
  artifactViewId?: string; targetRef: NativeLibraryMaterialReceiveTarget; position?: { readonly x: number; readonly y: number };
}
export type NativeLibraryMaterialReceiveResult = {
  status: 'placed' | 'already-present'; artifactViewId: string; revisionId: string; nodeId?: string; canonicalReceipt: Row;
} | { status: 'unconfirmed' | 'rejected'; message: string };
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const record = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const finitePoint = (v: unknown): v is { x: number; y: number } => record(v)
  && Number.isFinite(v.x) && Number.isFinite(v.y) && Object.keys(v).every(k => k === 'x' || k === 'y');
const samePoint = (actual: any, desired: any) => finitePoint(actual) && finitePoint(desired)
  && nativeCollectionSavedPlacementMatches(actual,desired);
// Read only the original edit state. Measurements/viewport settling is not a
// material edit; this is not another Canvas or saved snapshot owner.
const editable = (api: Api) => JSON.stringify({nodes:api.getNodes().map(node => ({id:node.id,type:node.type,data:node.data,
  position:node.position,width:node.width,height:node.height,style:node.style,parentId:node.parentId,hidden:node.hidden})),edges:api.getEdges()});

export async function receiveNativeLibraryMaterial(input: NativeLibraryMaterialReceive,
  { api, isCurrent, readOnly = false, signal }: { api: Api; isCurrent(): boolean; readOnly?: boolean; signal?: AbortSignal }): Promise<NativeLibraryMaterialReceiveResult> {
  const rejected = (message: string): NativeLibraryMaterialReceiveResult => ({status:'rejected',message});
  const unconfirmed = (message: string): NativeLibraryMaterialReceiveResult => ({status:'unconfirmed',message});
  const target = input?.targetRef;
  if (!input || ![input.projectId,input.canvasId,input.artifactId,input.revisionId,input.fileRecordId].every(nonEmpty)
    || input.artifactViewId !== undefined && !nonEmpty(input.artifactViewId)
    || input.workspaceId !== undefined && !nonEmpty(input.workspaceId) || !record(target)
    || !['main','context','workflow','conversation'].includes(target.kind)
    || Object.keys(target).some(k => !['kind','id'].includes(k))
    || target.kind === 'main' && 'id' in target || target.kind !== 'main' && !nonEmpty(target.id)
    || !api?.getNodes || !api.getEdges || !readOnly && !api.flushCanvas)
    return rejected('原现场、目标或材料版本尚未就绪，没有提交投递。');
  const targetRef: NativeLibraryMaterialReceiveTarget = target.kind === 'main' ? {kind:'main'} : {kind:target.kind,id:target.id};
  if (input.position !== undefined && (!finitePoint(input.position) || targetRef.kind === 'conversation'))
    return rejected('释放位置无法确认，没有提交投递。');
  const position = input.position === undefined ? undefined : {x:input.position.x,y:input.position.y};
  // Capture all selected addresses now, not after an asynchronous GET.
  const selected = {projectId:input.projectId,artifactId:input.artifactId,revisionId:input.revisionId,
    fileRecordId:input.fileRecordId,...(input.artifactViewId ? {artifactViewId:input.artifactViewId}:{}),targetRef};
  const canvasId = input.canvasId;
  let workspaceId = input.workspaceId;
  const current = () => {
    if (signal?.aborted || !isCurrent()) return false;
    if (typeof window === 'undefined') return true;
    const host = window.__LCOS_NODE_LAB__;
    return host?.api === api && host.projectId === selected.projectId && (host.currentCanvasId ?? host.canvasId) === canvasId;
  };
  if (!current() || targetRef.kind !== 'conversation' && !api.synchronizeMaterialProjection)
    return rejected('原画布连接已变化，没有提交到其他现场。');
  const base = `/api/lcos/canvases/${encodeURIComponent(canvasId)}/materials:receive`;
  const query = new URLSearchParams({...selected,targetRef:JSON.stringify(targetRef)}).toString();
  let posted = false;
  try {
    // A read-only recovery must not flush another native POST as a side effect.
    if (!readOnly && await api.flushCanvas!(canvasId) !== 'saved') return rejected('原画布还有未确认的编辑，请先核对；没有投递材料。');
    if (!current()) return rejected('现场已切换，没有提交到其他画布。');
    const before = editable(api);
    const read = async (address: string, init?: RequestInit) => {
      if (!current()) throw new Error('Original material receiver changed.');
      const response = await fetch(address,{cache:'no-store',redirect:'error',...init,signal});
      const envelope = await response.json();
      if (!current() || !response.ok) throw new Error('Material receiving is unconfirmed.');
      if (envelope?.code === 0 && record(envelope.data)) return envelope.data;
      if (envelope?.ok === true && record(envelope.value)) return envelope.value;
      throw new Error('Material receiving receipt is unavailable.');
    };
    let conversationArtifactId: string | undefined;
    if (targetRef.kind === 'conversation') {
      const identity = await read(`/api/lcos/core/projects/${encodeURIComponent(selected.projectId)}/connected-conversations/${encodeURIComponent(targetRef.id)}/identity`);
      if (identity.projectId !== selected.projectId || identity.connectedConversation?.id !== targetRef.id
        || identity.connectedConversation.projectId !== selected.projectId || !nonEmpty(identity.conversationArtifactId)
        || identity.conversationSession?.projectId !== selected.projectId
        || identity.connectedConversation.conversationSessionId !== identity.conversationSession?.id
        || identity.conversationSession.conversationArtifactId !== identity.conversationArtifactId)
        return rejected('原会话连接尚未确认，没有加入其他会话。');
      conversationArtifactId = identity.conversationArtifactId;
    }
    const matches = (value: Row) => value.project_id === selected.projectId && value.canvas_id === canvasId
      && value.artifact_id === selected.artifactId && value.revision_id === selected.revisionId
      && value.file_record_id === selected.fileRecordId && nonEmpty(value.workspace_id)
      && (workspaceId === undefined || value.workspace_id === workspaceId) && nonEmpty(value.artifact_view_id)
      && value.provider_execution_started === false && record(value.target_ref)
      && value.target_ref.kind === targetRef.kind && Object.keys(value.target_ref).every(k => k === 'kind' || k === 'id')
      && (targetRef.kind === 'main' ? !('id' in value.target_ref) : value.target_ref.id === targetRef.id);
    let receipt = await read(base+'?'+query);
    if (!matches(receipt)) return readOnly ? unconfirmed('接收记录与原目标或材料版本不一致，请继续核对。')
      : rejected('接收记录不属于原目标或材料，没有提交新的投递。');
    workspaceId = receipt.workspace_id;
    if (!current() || before !== editable(api)) return readOnly ? unconfirmed('核对期间原编辑已变化，原内容保留。')
      : rejected('读取期间现场或编辑已变化，没有提交投递。');
    if (receipt.state === 'partial') return unconfirmed('接收关系已部分保存，但显示尚未确认；请核对原目标，不会重复投递。');
    if (receipt.state === 'absent') {
      if (readOnly) return unconfirmed('尚未读到原目标的准确接收结果，本次没有重新投递。');
      if (targetRef.kind !== 'conversation' && !position) return rejected('原释放位置尚未确认，没有替换为其他落点。');
      posted = true;
      receipt = await read(base,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({...selected,...(position ? {position}:{})})});
    }
    if (!current() || before !== editable(api)) return unconfirmed('请求后现场或编辑已变化，请核对原目标；不会重复投递。');
    if (!matches(receipt) || receipt.state !== 'present') throw new Error('Exact receiving result is unconfirmed.');
    if (targetRef.kind === 'conversation') {
      const relation = receipt.relation;
      if (!record(relation) || !nonEmpty(relation.id) || relation.projectId !== selected.projectId
        || relation.kind !== 'conversation_context' || relation.sourceEntityType !== 'artifact'
        || relation.sourceEntityId !== conversationArtifactId || relation.targetEntityType !== 'view'
        || relation.targetEntityId !== receipt.artifact_view_id || receipt.node !== undefined || receipt.binding !== undefined)
        throw new Error('The original durable conversation relation has not been confirmed.');
      return {status:posted && receipt.already_present !== true ? 'placed':'already-present',
        artifactViewId:receipt.artifact_view_id,revisionId:selected.revisionId,canonicalReceipt:receipt};
    }
    const presentation = receipt.presentation, binding = receipt.binding, node = receipt.node, ref = node?.data?.lcos_ref;
    const scopeId = presentation?.scopeId, capability = targetRef.kind === 'workflow' ? 'workflow':'context';
    const savedPoint = presentation?.state?.positions?.[receipt.artifact_view_id];
    if (!record(presentation) || presentation.projectId !== selected.projectId || !nonEmpty(scopeId)
      || targetRef.kind !== 'main' && scopeId !== targetRef.id || presentation.capability !== capability
      || presentation.id !== `presentation:${capability}:${scopeId}`
      || !Array.isArray(presentation.state?.memberViewIds) || !presentation.state.memberViewIds.includes(receipt.artifact_view_id)
      || !record(presentation.state.positions) || !finitePoint(savedPoint)
      || !record(binding) || binding.projectId !== selected.projectId || binding.canvasId !== canvasId
      || binding.spatialKind !== 'node' || binding.entityType !== 'view' || binding.entityId !== receipt.artifact_view_id
      || !nonEmpty(node?.id) || node.id !== binding.spatialId || node.canvas_id !== canvasId || node.data?.id !== node.id
      || !['text','image'].includes(node.type) || ref?.version !== 1 || ref.entityType !== binding.entityType || ref.entityId !== binding.entityId
      || ref.artifactId !== selected.artifactId || ref.artifactViewId !== receipt.artifact_view_id || ref.revisionId !== selected.revisionId
      || !samePoint(node.position,savedPoint) || posted && receipt.already_present !== true && position && !samePoint(node.position,position))
      throw new Error('The original surface membership, position, and exact native carrier do not agree.');
    const applied = await api.synchronizeMaterialProjection!({projectId:selected.projectId,canvasId,workspaceId:receipt.workspace_id,
      artifactId:selected.artifactId,artifactViewId:receipt.artifact_view_id,revisionId:selected.revisionId,node},{isCurrent:current});
    if (applied?.ok !== true || !current()) return unconfirmed('接收已提交，原画布尚未确认显示；请核对，不会重复投递。');
    const live=api.getNodes().find(candidate=>candidate.id===node.id), liveRef=live?.data?.lcos_ref as Row | undefined;
    if (liveRef?.artifactId !== selected.artifactId || liveRef.artifactViewId !== receipt.artifact_view_id
      || liveRef.revisionId !== selected.revisionId || liveRef.entityType !== binding.entityType || liveRef.entityId !== binding.entityId
      || !samePoint(live?.position,savedPoint)) return unconfirmed('原画布尚未读回准确版本和位置，不能报告投递完成。');
    return {status:posted && receipt.already_present !== true ? 'placed':'already-present',nodeId:node.id,
      artifactViewId:receipt.artifact_view_id,revisionId:selected.revisionId,canonicalReceipt:receipt};
  } catch {
    return posted || readOnly ? unconfirmed('接收结果尚未确认，原材料与编辑保留；请核对原目标，不会重复投递。')
      : rejected('原目标或材料暂时无法核对，没有提交新的投递。');
  }
}
