import { getAbsolutePosition } from '@huabu/shared/canvas-engine';

import { resolveArtifactUrl } from '@/api/artifact';
import { toast } from '@/components/Common/Toast';
import useCanvasStore from '@/store/canvasStore';
import { copyCanvasClipboard, type HuabuClipboard } from '@/utils/io/clipboard';

import { useLcosHostStore } from '../host/lcosHostState';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { createAdditionalArtifactView,snapshotCopiedArtifactView,type CopiedArtifactView } from './additionalArtifactView';
import { isNodePresentationHidden } from './nodePresentationVisibility';

function copiedNodes(){const state=useCanvasStore.getState(),byId=new Map(state.nodes.map(node=>[node.id,node]));
  const ids=new Set(state.nodes.filter(node=>node.selected && !isNodePresentationHidden(node,byId)).map(node=>node.id));
  let changed=true;while(changed){changed=false;for(const node of state.nodes)if(node.parentId && ids.has(node.parentId) && !ids.has(node.id)){ids.add(node.id);changed=true;}}
  return state.nodes.filter(node=>ids.has(node.id));
}
function captures(){const nodes=copiedNodes(),referenceState=useLcosReferenceStore.getState(),refs=referenceState.nodeEntityRefs;
  if(nodes.length && referenceState.projectId && (referenceState.bindingCanvasId!==useCanvasStore.getState().canvasId || !referenceState.bindingIdentitiesReady))
    throw new Error('材料身份仍在读取，请稍后复制；原节点没有被克隆成无身份替代。');
  if(!nodes.some(node=>refs.has(node.id)))return null;
  if(nodes.some(node=>refs.get(node.id)?.entityType!=='artifact'))throw new Error('当前组合含原生节点或独立集合/会话，请分别复制；未生成无身份替代。');
  return nodes.map(node=>snapshotCopiedArtifactView(node.id));
}
/** Retain the existing Huabu clipboard envelope and readable external copy.
 * The extra field captures canonical View/revision addresses at Ctrl+C time. */
export function copyLcosSelection():boolean{
  let copies:CopiedArtifactView[]|null;try{copies=captures();}catch(error){toast(error instanceof Error?error.message:'引用身份尚未读回。',{tone:'danger'});return true;}
  if(!copies?.length)return false;
  const nodes=copiedNodes(),byId=new Map(nodes.map(node=>[node.id,node]));
  const payload=JSON.stringify({__huabu_nodes__:nodes.map(node=>({...node,position:getAbsolutePosition(useCanvasStore.getState().nodes,node.id) ?? node.position})),
    __huabu_edges__:[],__huabu_canvas_id__:useCanvasStore.getState().canvasId,__lcos_artifact_views__:copies});
  const plainText=copies.map(copy=>copy.reference.descriptor?.title ?? copy.reference.entityId).join('\n');
  const node=nodes.length===1?byId.get(copies[0]?.sourceNodeId ?? ''):undefined;
  void copyCanvasClipboard({payload,plainText,...(node?.type==='image' && typeof node.data.src==='string'
    ? {image:{src:resolveArtifactUrl(node.data.src,useCanvasStore.getState().canvasId),label:plainText}}:{})})
    .catch((error:unknown)=>toast(error instanceof Error?error.message:'复制尚未确认。',{tone:'danger'}));
  return true;
}
function parseCopies(raw:string|null|undefined):CopiedArtifactView[]|null{
  if(!raw)return null;const value:unknown=JSON.parse(raw);
  if(!value || typeof value!=='object' || !('__lcos_artifact_views__' in value))return null;
  const items=(value as {__lcos_artifact_views__?:unknown}).__lcos_artifact_views__;
  if(!Array.isArray(items) || !items.length)throw new Error('材料引用剪贴板不完整，请重新复制。');
  return items.map((item:unknown)=>{if(!item || typeof item!=='object')throw new Error('材料引用不可读取。');
    const copy=item as CopiedArtifactView;
    if(typeof copy.projectId!=='string' || copy.reference?.entityType!=='artifact' || typeof copy.reference.entityId!=='string'
      || typeof copy.reference.artifactViewId!=='string' || typeof copy.reference.revisionId!=='string'
      || !Number.isFinite(copy.position?.x) || !Number.isFinite(copy.position?.y) || !(copy.size?.width>0) || !(copy.size?.height>0))throw new Error('材料的 View 与原版本不可读取，请重新复制。');
    return copy;});
}
async function pasteCopies(copies:readonly CopiedArtifactView[],point:{x:number;y:number}){
  const canvasId=useCanvasStore.getState().canvasId,projectId=useLcosReferenceStore.getState().projectId;
  if(copies.some(copy=>copy.projectId!==projectId))throw new Error('跨项目请导入原材料；没有把另一项目引用伪装成本项目材料。');
  const left=Math.min(...copies.map(copy=>copy.position.x)),top=Math.min(...copies.map(copy=>copy.position.y));
  const nodeIds:string[]=[];
  for(const copy of copies){if(useCanvasStore.getState().canvasId!==canvasId || useLcosReferenceStore.getState().projectId!==projectId)return;
    const id=await createAdditionalArtifactView(copy,{x:point.x+copy.position.x-left,y:point.y+copy.position.y-top});if(id)nodeIds.push(id);}
  if(useCanvasStore.getState().canvasId===canvasId && nodeIds.length)useCanvasStore.getState().selectNodes(nodeIds);
}
export async function pasteLcosClipboard(raw:string|null|undefined,parsed:HuabuClipboard,point:{x:number;y:number}):Promise<void>{
  const copies=parseCopies(raw);if(copies){await pasteCopies(copies,point);return;}
  const host=useLcosHostStore.getState().host,canvasId=useCanvasStore.getState().canvasId;
  if(host){const sourceIds=new Set(parsed.nodes.flatMap(node=>node && typeof node==='object' && 'id' in node && typeof node.id==='string'?[node.id]:[]));
    const bindings=await host.bindings.list();if(bindings.some(binding=>binding.spatialKind==='node' && sourceIds.has(binding.spatialId)
      && (!parsed.srcCanvasId || binding.canvasId===parsed.srcCanvasId)))throw new Error('旧剪贴板未保留项目材料的原 View 与版本，请重新复制；未克隆成无身份节点。');
    if(useLcosHostStore.getState().host!==host || useCanvasStore.getState().canvasId!==canvasId)return;}
  useCanvasStore.getState().pasteNodes(point,parsed.nodes as Parameters<ReturnType<typeof useCanvasStore.getState>['pasteNodes']>[1],
    parsed.edges as Parameters<ReturnType<typeof useCanvasStore.getState>['pasteNodes']>[2],parsed.srcCanvasId);
}
export async function duplicateLcosSelection():Promise<void>{
  const copies=captures();if(copies?.length){await pasteCopies(copies,{x:Math.min(...copies.map(copy=>copy.position.x))+24,y:Math.min(...copies.map(copy=>copy.position.y))+24});return;}
  const state=useCanvasStore.getState(),nodes=copiedNodes();if(!nodes.length)return;
  const points=nodes.map(node=>getAbsolutePosition(state.nodes,node.id) ?? node.position);
  state.pasteNodes({x:Math.min(...points.map(point=>point.x))+24,y:Math.min(...points.map(point=>point.y))+24},nodes,
    state.edges.filter(edge=>nodes.some(node=>node.id===edge.source) && nodes.some(node=>node.id===edge.target)),state.canvasId);
}
