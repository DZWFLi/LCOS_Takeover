import type { DropPayload } from '../../lcos/apps/web-gen2/src/interaction/semanticDropMachine';
import type { DropAssemblyApplyIntent, DropCommitReceipt } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTypes';
import type { NativeLibraryRelease, NativeLibraryMaterialPorts } from './native-library-material-dispatch';
import { withNativeLibraryDropRecovery } from './native-library-material-dispatch';
import { readNativeDropFeedbackCapture, captureNativeDropFeedback, markNativeLibraryPlacementReceipt } from './native-library-drop';
import { nativeSurfaceForDropTargetId } from './native-surface-dock-drop';
import { placeNativeLibraryCollection } from './native-library-collection-placement';
import type { NativeCanvasNode } from './native-canvas-port';

type Row=Record<string,unknown>;
const row=(value:unknown):Row=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.map(row):[];
const text=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
interface Ports extends NativeLibraryMaterialPorts { rootCanvas(surface:'main'|'context'|'workflow'):string|undefined }

/** A Collection stays one entity. Membership, children and source geometry
 * remain with their existing owners; this adapter only chooses the addressed
 * native receiver, just like the material adapter in the same Drop Router. */
export function createNativeSurfaceCollectionDispatcher(release:NativeLibraryRelease,payload:DropPayload,
  transactionId:string,ports:Ports) {
  return { async handle(intent:DropAssemblyApplyIntent,tx:string,signal?:AbortSignal):Promise<DropCommitReceipt|undefined> {
    const dockSurface=nativeSurfaceForDropTargetId(intent.targetId);
    const registered=ports.target(intent.targetId);
    const canvasDrop=registered?.semantic.kind==='canvas';
    const surface=dockSurface??(['main','context','workflow'] as const).find(value=>canvasDrop&&value===release.surface);

    const objects=payload.kind==='objects'?payload.objects:payload.kind==='assembly'&&payload.sourceRef?.kind==='collection'
      ? [{entityType:'collection',entityId:payload.sourceRef.id,displayLabel:payload.reference?.displayLabel}]:[];
    if((!dockSurface&&!canvasDrop)||!objects.some(item=>item.entityType==='collection')) return undefined;
    const {projectId,canvasId:sourceCanvasId,api}=release;
    const targetCanvasId=dockSurface?ports.rootCanvas(dockSurface):sourceCanvasId;

    const fail=(message:string):DropCommitReceipt=>({status:'failed',transactionId:tx,targetId:intent.targetId,projectId,message});
    if(!surface||!sourceCanvasId||!targetCanvasId||!api?.flushCanvas||(!canvasDrop&&!api.findMaterialPlacement)||tx!==transactionId
      ||(!canvasDrop&&intent.targetRef.kind!==surface)||intent.portalReceive||intent.railwayReceive||intent.railwayDestinationRef)
      return fail('目标现场地址尚未就绪，集合保持原状。');
    const point=intent.placementPoint;
    if(canvasDrop&&(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)))
      return fail('原画布释放位置尚未确认，集合保持原状。');
    const releasedPosition=canvasDrop&&point?{x:point.x,y:point.y}:undefined;

    if(objects.some(item=>item.entityType!=='collection'||!text(item.entityId)))
      return fail('这组对象还未完整接上现场投放，没有拆开投递。');
    const ids=[...new Set(objects.map(item=>item.entityId))];
    if(intent.sourceRefs.length!==ids.length||intent.sourceRefs.some(ref=>ref.kind!=='collection'||!ids.includes(ref.id)))
      return fail('集合引用与本次拖放不一致，原集合保留。');
    const capture=readNativeDropFeedbackCapture(payload);
    const sourceCurrent=()=>capture?capture.projectId===projectId&&capture.canvasId===sourceCanvasId&&capture.api===api
      :payload.kind==='objects'&&ids.every(id=>api.getNodes().some(node=>{
        const ref=row(node.data?.lcos_collection_ref);
        return ref.projectId===projectId&&ref.canvasId===sourceCanvasId&&ref.workspaceId===release.workspaceId&&ref.collectionId===id;
      }));
    const current=(recovery=false,s?:AbortSignal)=>{
      const now=ports.current(),target=ports.target(intent.targetId);
      return !s?.aborted&&now.projectId===projectId&&now.canvasId===sourceCanvasId&&now.api===api
        &&now.workspaceId===release.workspaceId&&now.surface===release.surface
        &&(!dockSurface||ports.rootCanvas(dockSurface)===targetCanvasId)
        &&ports.gesture(payload,tx,intent.targetId,recovery)&&target?.enabled===true
        &&target.semantic.kind===(canvasDrop?'canvas':'spatial-membership')
        &&('targetRef' in target.semantic)&&JSON.stringify(target.semantic.targetRef)===JSON.stringify(intent.targetRef);

    };
    const get=async(address:string,recovery:boolean,s?:AbortSignal):Promise<unknown>=>{
      if(!current(recovery,s))throw new Error('原现场已变化，未改投其他位置。');
      const response=await fetch(address,{cache:'no-store',redirect:'error',signal:s}),envelope=row(await response.json());
      if(!response.ok||!current(recovery,s))throw new Error('集合与现场暂时无法核对。');
      if(envelope.ok===true)return envelope.value;
      if(envelope.code===0)return envelope.data;
      throw new Error('未收到准确的集合记录。');
    };
    let workspaceId:string,labels:string[];
    try{
      if(!sourceCurrent())throw new Error('原集合已变化，未投放。');
      const workspaces=rows(await get('/api/lcos/core/projects/'+encodeURIComponent(projectId)+'/workspaces',false,signal));
      const matches=workspaces.filter(w=>w.canvasId===targetCanvasId&&w.projectId===projectId&&w.preferredSurface===surface),workspace=matches[0];
      if(matches.length!==1||!text(workspace?.id)||!text(workspace.scopeId)
        ||canvasDrop&&workspace.id!==release.workspaceId
        ||(intent.targetRef.kind==='workspace'?workspace.id!==intent.targetRef.id
          :intent.targetRef.kind!=='main'&&workspace.scopeId!==intent.targetRef.id))throw new Error('目标现场地址不一致。');

      workspaceId=workspace.id;
      labels=await Promise.all(ids.map(async id=>{
        const snapshot=row(await get('/api/lcos/core/projects/'+encodeURIComponent(projectId)+'/collections/'+encodeURIComponent(id)+'/members',false,signal));
        const collection=row(snapshot.collection);
        if(collection.id!==id||collection.projectId!==projectId)throw new Error('原集合身份尚未确认。');
        return text(collection.title)?collection.title:'集合';
      }));
      if(!capture&&(payload.kind==='objects'||payload.kind==='assembly'))captureNativeDropFeedback(payload,{
        projectId,canvasId:sourceCanvasId,api,title:labels.length===1?labels[0]!:labels.length+' 个集合',
      });
    }catch(error){return fail(error instanceof Error?error.message:'集合暂未投放。')}
    const confirmed=new Map<string,unknown>();
    const make=(status:DropCommitReceipt['status'],message:string)=>markNativeLibraryPlacementReceipt({
      status,transactionId:tx,targetId:intent.targetId,projectId,message,
      canonicalReceipt:{destination:{canvasId:targetCanvasId,workspaceId},collections:[...confirmed.values()]},
    },payload);
    const run=async(recovery:boolean,s?:AbortSignal):Promise<DropCommitReceipt>=>{
      const pending=(message:string)=>withNativeLibraryDropRecovery(make('partial',message),next=>run(true,next));
      try{
        if(!current(recovery,s)||!recovery&&!sourceCurrent())throw new Error('现场已变化，集合保持原状。');
        for(const id of ids){
          if(confirmed.has(id))continue;
          const canvas=row(await get('/api/canvas/v1/canvases/'+encodeURIComponent(targetCanvasId),recovery,s));
          if(canvas.id!==targetCanvasId||canvas.workspace_id!==workspaceId)throw new Error('目标画布响应不一致。');
          const layout=rows(canvas.nodes).map(node=>({...node,...(node.parent_id?{parentId:node.parent_id}:{})})) as NativeCanvasNode[];
          const position=releasedPosition??api.findMaterialPlacement!({width:250,height:244},layout);
          if(!position)throw new Error('目标现场暂时无法确定集合空位。');
          const input={projectId,sourceCanvasId,canvasId:targetCanvasId,workspaceId,collectionId:id,position};
          const receive=(readOnly:boolean)=>placeNativeLibraryCollection(input,{api,readOnly,signal:s,
            isCurrent:()=>current(recovery,s)&&(readOnly||sourceCurrent())});
          let result=await receive(recovery);
          if(result.status==='unconfirmed'&&!recovery&&current(false,s))result=await receive(true);
          if('message'in result)return result.status==='unconfirmed'||recovery||confirmed.size?pending(result.message):make('failed',result.message);
          confirmed.set(id,result.canonicalReceipt);
        }
        return make('success',canvasDrop?'集合已放到画布，原集合保留。':'集合已放入 '+surface+'，原集合保留。');
      }catch(error){return confirmed.size||recovery?pending('集合接收结果待核对，没有重复投放。')
        :make('failed',error instanceof Error?error.message:'集合暂未投放。')}
    };
    return run(false,signal);
  }};
}
