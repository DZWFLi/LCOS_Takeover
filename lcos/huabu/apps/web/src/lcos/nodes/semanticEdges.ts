import useCanvasStore from '@/store/canvasStore';

import { useLcosHostStore } from '../host/lcosHostState';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { isNodePresentationHidden } from './nodePresentationVisibility';
import { removeCanvasSelection } from './nodeRemoval';

import type { RelationKind } from '@local-creative-os/web-gen2';

/** Bindings decide the owner. Edge labels/endpoint proximity never do. */
export async function removeLcosSelection(nodeIds: readonly string[], edgeIds: readonly string[]): Promise<void> {
  const state = useCanvasStore.getState();
  if (!edgeIds.length) {removeCanvasSelection(state,useLcosReferenceStore.getState().nodeEntityRefs,nodeIds);return;}
  const host = useLcosHostStore.getState().host, canvasId = state.canvasId;
  if (!host || !canvasId || host.projectId !== useLcosReferenceStore.getState().projectId) throw new Error('连线身份尚未读回，原连线保留。');
  const current = () => useCanvasStore.getState().canvasId === canvasId && useLcosHostStore.getState().host === host;
  const bindings = (await host.bindings.list()).filter((binding)=>binding.projectId===host.projectId && binding.canvasId===canvasId
    && binding.spatialKind==='edge' && binding.entityType==='relation' && edgeIds.includes(binding.spatialId));
  if (!current()) return;
  const semantic = new Set(bindings.map((binding)=>binding.spatialId));
  for(const edgeId of semantic)if(bindings.filter(binding=>binding.spatialId===edgeId).length!==1)throw new Error('旧投影承载多条项目关系，请先核对具体关系，原边保留。');
  const unbound=edgeIds.filter(id=>!semantic.has(id));
  await confirmNativeEdges(host,canvasId,unbound);
  if(!current())return;
  try {
    for (const relationId of new Set(bindings.map((binding)=>binding.entityId))) {
      if (!current()) return;
      await host.relationProjector.deleteRelation(relationId);
    }
  } finally { if (bindings.length) {host.notifyMutationSuccess();useLcosReferenceStore.getState().requestNodeBindingRefresh();} }
  if (current()) removeCanvasSelection(useCanvasStore.getState(),useLcosReferenceStore.getState().nodeEntityRefs,nodeIds,
    edgeIds.filter((id)=>!semantic.has(id)));
}

/** Existing Relation PUT preserves relation identity, kind and evidence. The
 * existing projection owner repairs the actual endpoints after Core confirms. */
export async function reconnectSemanticEdge(edgeId:string,sourceNodeId:string,targetNodeId:string): Promise<void> {
  const host=useLcosHostStore.getState().host, canvasId=useCanvasStore.getState().canvasId;
  if(!host || !canvasId || host.projectId!==useLcosReferenceStore.getState().projectId) throw new Error('连线身份尚未读回。');
  if(sourceNodeId===targetNodeId)throw new Error('连线的两端应是不同对象。');
  const current=()=>useLcosHostStore.getState().host===host && useCanvasStore.getState().canvasId===canvasId;
  const owned=(await host.bindings.list()).filter(binding=>binding.projectId===host.projectId && binding.canvasId===canvasId
    && binding.spatialKind==='edge' && binding.entityType==='relation' && binding.spatialId===edgeId);
  if(!owned.length){
    await confirmNativeEdges(host,canvasId,[edgeId]);if(!current())return;
    const state=useCanvasStore.getState(),edge=state.edges.find(item=>item.id===edgeId),byId=new Map(state.nodes.map(node=>[node.id,node]));
    const source=byId.get(sourceNodeId),target=byId.get(targetNodeId);
    if(!edge || !source || !target || isNodePresentationHidden(source,byId) || isNodePresentationHidden(target,byId))throw new Error('原生连线端点已不可见。');
    state.onEdgesChange([{id:edgeId,type:'replace',item:{...edge,source:sourceNodeId,target:targetNodeId}}]);return;
  }
  if(owned.length!==1)throw new Error('请选择一条独立的项目关系；共享旧投影不能猜测重接哪一条。');
  const owner=owned[0];if(!owner)return;
  const [from,to,relation]=await Promise.all([host.resolveNode(sourceNodeId),host.resolveNode(targetNodeId),host.relations.getRelation(host.projectId,owner.entityId)]);
  if(!current())return;
  if(!from || !to)throw new Error('项目关系须重接到有真实项目身份的对象。');
  if(String(relation.projectId)!==host.projectId || String(relation.id)!==owner.entityId)throw new Error('原关系身份未确认。');
  const next={...relation,sourceEntityType:from.entityType,sourceEntityId:from.entityId,targetEntityType:to.entityType,targetEntityId:to.entityId};
  try {
    const saved=await host.relations.putRelation(host.projectId,next);
    if(saved.relation.id!==next.id || saved.relation.projectId!==next.projectId || saved.relation.sourceEntityType!==next.sourceEntityType
      || saved.relation.sourceEntityId!==next.sourceEntityId || saved.relation.targetEntityType!==next.targetEntityType
      || saved.relation.targetEntityId!==next.targetEntityId)throw new Error('重接回执身份未确认，请核对原关系。');
    await host.relationProjector.reconcileRelationEdge({id:String(next.id),kind:next.kind as RelationKind,from,to},sourceNodeId,targetNodeId);
  } finally {host.notifyMutationSuccess();if(current())useLcosReferenceStore.getState().requestNodeBindingRefresh();}
}

/** A Core connect may have committed before its spatial binding arrives. A
 * complete relation read prevents that narrow producer window being mistaken
 * for permission to perform a native-only delete/reconnect. */
async function confirmNativeEdges(host:NonNullable<ReturnType<typeof useLcosHostStore.getState>['host']>,canvasId:string,ids:readonly string[]):Promise<void>{
  const refs=useLcosReferenceStore.getState().nodeEntityRefs;
  const edges=useCanvasStore.getState().edges.filter(edge=>ids.includes(edge.id) && refs.has(edge.source) && refs.has(edge.target));
  if(!edges.length)return;
  const relations=await host.relations.listRelations(host.projectId);
  if(useCanvasStore.getState().canvasId!==canvasId)return;
  // Foreground refs normalize an additional View to its Artifact for material
  // input. Relation ownership must retain the durable View endpoint instead.
  for(const edge of edges){const [from,to]=await Promise.all([host.resolveNode(edge.source),host.resolveNode(edge.target)]);
    if(useCanvasStore.getState().canvasId!==canvasId || useLcosHostStore.getState().host!==host)return;
    if(relations.some(relation=>relation.sourceEntityType===from?.entityType && relation.sourceEntityId===from.entityId
      && relation.targetEntityType===to?.entityType && relation.targetEntityId===to.entityId)){
      host.notifyMutationSuccess();throw new Error('项目关系已存在，连线绑定尚未读回；原边保留，待投影核对后再操作。');
    }
  }
}
