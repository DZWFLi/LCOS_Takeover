import type { SpatialMarkerIntentV0, SpatialMarkerTargetRefV0 } from '../../lcos/packages/contracts/src/navigation-marker';
import { nativeNavigationCandidateCanvasIds, nativeNavigationCandidates, nativeNavigationMarkerApplies,
  type NativeNavigationCandidate, type NativeNavigationCanvasEvidence } from './native-navigation-candidates';
import { readNativeNavigationFacts, removeNativeNavigationMarker, nativeNavigationMarkerPending,
  verifyNativeNavigationMarkerPending, resolveNativeNavigationTarget, type NativeNavigationScene,
  nativeNavigationNodeMarkers, nativeNavigationRecords, nativeNavigationRecordTarget, isNativeNavigationNodeMarker,
  type NativeNavigationFacts, type NativeNavigationRecord } from './native-navigation-markers';
import { currentNativeNavigationScene, navigationSceneCurrent, locateNativeNavigationNode, nativeNavigationSnapshot,
  adoptNativeNavigationFacts, syncNativeNavigationPending, sameNavigationTarget, subscribeNativeNavigation } from './native-navigation-state';
import { enterNativeWorkspaceWithReturn, nativeWorkspaceSourceRestoring, reportNativeWorkspaceNavigationError } from './native-library-contexts';
import useCanvasStore from './native-canvas-port';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';

export type NativeNavigationDirectoryPlace = NativeNavigationCandidate & { label:string };
export type NativeNavigationDirectoryRow = { marker:NativeNavigationRecord;title:string;kindLabel:string;originLabel:string;
  status:'ready'|'missing'|'unplaced'|'unavailable';partial?:boolean;detail:string;candidates:NativeNavigationDirectoryPlace[] };
type DirectoryState = { scene:NativeNavigationScene|null;open:boolean;status:'loading'|'ready'|'error';error:string;
  rows:NativeNavigationDirectoryRow[];selectedMarkerId?:string;busy:string|null;pending:boolean;query:string;scroll:number };
let state:DirectoryState={scene:null,open:false,status:'ready',error:'',rows:[],busy:null,pending:false,query:'',scroll:0};
const listeners=new Set<()=>void>();
let serial=0,readAbort:AbortController|undefined,activeDirectoryNavigation:number|undefined;
const publish=(patch:Partial<DirectoryState>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
export const navigationDirectorySnapshot=()=>state;
export const subscribeNavigationDirectory=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
/** The same native pointer/wheel handler cancels an unfinished directory
 * journey. It never cancels or replays a marker write. */
export function interruptNavigationDirectory(){
  if(activeDirectoryNavigation===undefined||activeDirectoryNavigation!==serial){activeDirectoryNavigation=undefined;return;}
  serial++;activeDirectoryNavigation=undefined;readAbort?.abort();publish({busy:null});
}
const rows=(value:any):any[]=>Array.isArray(value)?value:[];
const sameMarker=(a:NativeNavigationRecord,b:NativeNavigationRecord)=>a.id===b.id&&a.projectId===b.projectId
  &&a.scope===b.scope&&a.sourceSurfaceRef===b.sourceSurfaceRef&&sameNavigationTarget(nativeNavigationRecordTarget(a),nativeNavigationRecordTarget(b));
const projectCurrent=(scene:NativeNavigationScene)=>useLcosShellStore.getState().projectId===scene.projectId;
/** Ke confirms its original route before the new workspace/API and navigation
 * host have necessarily mounted. Observe those same owners; never reissue Ke
 * or borrow the source API while the destination is still registering. */
function waitForDirectoryArrival(origin:NativeNavigationScene,place:Pick<NativeNavigationDirectoryPlace,'projectId'|'canvasId'|'workspaceId'>,
  operation:number,signal:AbortSignal,isCurrent:()=>boolean=()=>true){
  return new Promise<NativeNavigationScene>((resolve,reject)=>{
    let done=false,timer:ReturnType<typeof setTimeout>|undefined;
    const releases:(()=>void)[]=[];
    const finish=(error?:Error,scene?:NativeNavigationScene)=>{
      if(done)return;done=true;releases.forEach(release=>release());clearTimeout(timer);signal.removeEventListener('abort',aborted);
      if(error)reject(error);else resolve(scene!);
    };
    const aborted=()=>finish(new Error('定位已取消，没有追加相机操作。'));
    const check=()=>{
      if(operation!==serial||signal.aborted||!projectCurrent(origin)||!isCurrent())return aborted();
      const canvas=useCanvasStore.getState();
      if(canvas.status==='ready'&&canvas.canvasId!==origin.canvasId&&canvas.canvasId!==place.canvasId)
        return finish(new Error('现场已切换，没有拉回旧目标。'));
      const scene=currentNativeNavigationScene(),owner=nativeNavigationSnapshot().scene;
      if(scene?.projectId===place.projectId&&scene.canvasId===place.canvasId&&scene.workspaceId===place.workspaceId
        &&owner&&owner.api===scene.api&&navigationSceneCurrent(owner))finish(undefined,scene);
    };
    signal.addEventListener('abort',aborted,{once:true});
    for(const subscribe of [useCanvasStore.subscribe,useLcosShellStore.subscribe,subscribeNativeNavigation]){
      const release=subscribe(check);if(done)release();else releases.push(release);
    }
    if(!done){timer=setTimeout(()=>finish(new Error('原画布还未就绪，可用原返回入口返回后重试。')),10000);check();}
  });
}
const placeLabel=(place:NativeNavigationCandidate)=>{
  const names=place.scopeTrail.map(scope=>String(scope.title??scope.name??'')).filter(Boolean);
  const name=String(place.workspace.name??place.workspace.title??'画布');if(names.at(-1)!==name)names.push(name);
  return names.join(' / ')||'画布';
};
function targetDescription(target:SpatialMarkerTargetRefV0,facts:NativeNavigationFacts){
  const graph=facts.graph;
  if(target.kind==='surface'){
    const name=target.id==='main'?'主画布':target.id==='assembly'?'资料库':undefined;
    const id=target.id.slice(target.id.indexOf(':')+1);
    const items=rows(target.id.startsWith('workspace:')?graph.workspaces:target.id.startsWith('scope:')?graph.scopes:graph.connectedConversations)
      .filter(row=>row.id===id&&row.projectId===target.projectId);
    const item=items.length===1?items[0]:undefined;
    return{title:name??String(item?.name??item?.title??'已固定画布'),kindLabel:'画布'};
  }
  if(target.kind==='view'){
    const views=rows(graph.artifactViews).filter(row=>row.id===target.id),view=views.length===1?views[0]:undefined;
    const artifacts=rows(graph.artifacts).filter(row=>row.id===view?.artifactId&&row.projectId===target.projectId),item=artifacts.length===1?artifacts[0]:undefined;
    return{title:String(item?.title??view?.label??'已固定材料'),kindLabel:({image:'图片',text:'文字',file:'文件'} as Record<string,string>)[item?.kind]??'材料'};
  }
  const matches=[['artifacts','材料'],['collections','集合'],['notes','附注'],['scopes','上下文'],
    ['workspaces','画布'],['connectedConversations','对话'],['runs','任务'],['resultSlots','结果位']].flatMap(([field,kindLabel])=>
      rows(graph[field!]).filter(item=>item.id===target.id&&item.projectId===target.projectId)
        .map(item=>({title:String(item.title??item.name??'已固定目标'),kindLabel:field==='scopes'&&item.kind==='workflow'?'方法':kindLabel!})));
  if(matches.length===1)return matches[0]!;
  if(matches.length>1)return{title:'目标身份待核对',kindLabel:'目标'};
  return{title:'已固定目标',kindLabel:'目标'};
}
function originLabel(marker:NativeNavigationRecord,facts:NativeNavigationFacts){
  if(marker.scope==='cross-surface')return'项目内跨画布';
  const source=marker.sourceSurfaceRef??'',graph=facts.graph;
  if(source.startsWith('scope:')){
    const scopes=rows(graph.scopes).filter(scope=>scope.id===source.slice(6)&&scope.projectId===marker.projectId);
    return scopes.length===1?String(scopes[0].title??scopes[0].name??'原上下文'):'原上下文暂不可用';
  }
  const workspaces=rows(graph.workspaces).filter(row=>source==='main'||source==='assembly'?row.preferredSurface===source
    :source.startsWith('workspace:')?row.id===source.slice(10):source.startsWith('scope:')?row.scopeId===source.slice(6):false);
  const workspace=workspaces.length===1?workspaces[0]:undefined;
  if(workspace&&!workspace.archivedAt)return String(workspace.name??workspace.title??'原画布');
  if(source.startsWith('conversation:'))return String(rows(graph.connectedConversations).find(row=>row.id===source.slice(13))?.title??'原对话画布');
  return'原画布暂不可用';
}
async function readCanvas(canvasId:string,scene:NativeNavigationScene,signal?:AbortSignal,saved?:NativeNavigationFacts['nativeCanvas']):Promise<NativeNavigationCanvasEvidence>{
  if(saved?.canvasId===canvasId)return{canvasId,nodes:saved.nodes,...(canvasId===scene.canvasId?{surfaceRef:scene.surfaceRef}:{})};
  try{
    const response=await fetch('/api/canvas/v1/canvases/'+encodeURIComponent(canvasId),{signal,cache:'no-store',redirect:'error'});
    const payload=await response.json(),value=payload.data??payload.value;
    if(!response.ok||!(payload.ok===true||payload.code===0)||value?.id!==canvasId||!Array.isArray(value?.nodes))throw Error('Canvas read unavailable');
    return{canvasId,nodes:value.nodes,...(canvasId===scene.canvasId&&navigationSceneCurrent(scene)?{surfaceRef:scene.surfaceRef}:{})};
  }catch(error){if(signal?.aborted)throw error;return{canvasId,available:false,error:'canvas-read-failed'};}
}
async function readDirectory(scene:NativeNavigationScene,signal?:AbortSignal,confirmedFacts?:NativeNavigationFacts){
  const facts=confirmedFacts??await readNativeNavigationFacts(scene,signal);
  const ids=[...new Set([...facts.markers.flatMap(marker=>nativeNavigationCandidateCanvasIds(marker.targetRef,facts)),
    ...rows(facts.graph.workspaces).filter(row=>row.projectId===scene.projectId&&!row.archivedAt&&typeof row.canvasId==='string').map(row=>row.canvasId)])];
  // Every ordinary pin lives on its original node, so a project directory
  // reads the actual owned canvases. Bound parallelism and reuse this read's
  // current Canvas DTO; do not create a separate persisted index/cache.
  const canvases:NativeNavigationCanvasEvidence[]=new Array(ids.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{while(cursor<ids.length){
    if(signal?.aborted)throw signal.reason??Error('固定目录读取已取消。');const index=cursor++;canvases[index]=await readCanvas(ids[index]!,scene,signal,facts.nativeCanvas);
  }}));
  const nativeMarkers=canvases.flatMap(sample=>{
    const owners=rows(facts.graph.workspaces).filter(row=>row.projectId===scene.projectId&&row.canvasId===sample.canvasId&&!row.archivedAt);
    if(owners.length!==1||!Array.isArray(sample.nodes))return[];const workspace=owners[0],scope=rows(facts.graph.scopes).find(row=>row.id===workspace.scopeId&&row.projectId===scene.projectId&&!row.archivedAt);
    if(!scope)return[];const surfaceRef=sample.surfaceRef??(workspace.preferredSurface==='assembly'||workspace.preferredSurface==='main'&&scope.kind==='root'?workspace.preferredSurface:'workspace:'+workspace.id);
    return nativeNavigationNodeMarkers({...scene,canvasId:sample.canvasId,workspaceId:workspace.id,surfaceRef},facts,sample.nodes);
  });
  // Failed reads do not prove an ordinary saved pin was removed. Retain only
  // already witnessed records for that exact still-owned Canvas and show them
  // as unavailable; successful false/absence reads remove them normally.
  const failedIds=new Set(canvases.filter(sample=>sample.available===false||sample.error).map(sample=>sample.canvasId));
  for(const row of state.rows){const marker=row.marker;
    if(isNativeNavigationNodeMarker(marker)&&marker.projectId===scene.projectId&&failedIds.has(marker.nativeNode.canvasId)
      &&rows(facts.graph.workspaces).filter(workspace=>workspace.projectId===scene.projectId&&workspace.canvasId===marker.nativeNode.canvasId&&!workspace.archivedAt).length===1
      &&!nativeMarkers.some(value=>value.id===marker.id))nativeMarkers.push(marker);
  }
  const combinedFacts={...facts,nativeMarkers};
  const directoryRows=nativeNavigationRecords(combinedFacts).map(marker=>{
    const result=nativeNavigationCandidates(nativeNavigationRecordTarget(marker),combinedFacts,canvases);
    const candidates=result.candidates.filter(place=>nativeNavigationMarkerApplies(marker,place,facts)).map(place=>({...place,label:placeLabel(place)}));
    const status=result.status==='ready'&&!candidates.length?'unplaced':result.status;
    const detail=status==='missing'?'目标已不可用，固定记录仍保留。':status==='unavailable'?'位置暂时无法确认，可重试。'
      :status==='unplaced'?'尚未放到可定位的原画布。':!result.complete?'部分位置暂时读不到，已读取的位置仍可前往。':candidates.length>1?`${candidates.length} 个位置，选择后前往`
      :candidates[0]?.canvasId===scene.canvasId?'定位到当前画布': '进入原画布';
    return{marker,...(isNativeNavigationNodeMarker(marker)?{title:marker.title,kindLabel:'节点'}:targetDescription(marker.targetRef,facts)),originLabel:originLabel(marker,facts),status,partial:!result.complete,detail,candidates};
  });
  return{facts:combinedFacts,rows:directoryRows};
}
/** Quiet project invalidations share the existing directory projection. No
 * loading replacement, new journey, focus request or camera call is made. */
export function createNativeNavigationDirectoryProjectReader(scene:NativeNavigationScene){
  const failure='已固定目标暂时没有更新，已有记录保留。';
  let active=true,queued=false,running=false,controller:AbortController|undefined;
  const current=()=>active&&navigationSceneCurrent(scene)&&state.open&&!!state.scene
    &&state.scene.projectId===scene.projectId&&state.scene.canvasId===scene.canvasId&&state.scene.workspaceId===scene.workspaceId
    &&state.scene.surfaceRef===scene.surfaceRef&&state.scene.api===scene.api;
  const busy=()=>!!state.busy||state.status==='loading'||!!nativeNavigationSnapshot().busy;
  const drain=async()=>{
    if(!current()){queued=false;controller?.abort();return;}
    if(running||!queued||busy())return;
    queued=false;running=true;const request=new AbortController();controller=request;
    try{const result=await readDirectory(scene,request.signal);
      if(!current()||request.signal.aborted)return;
      if(busy()){queued=true;return;}
      adoptNativeNavigationFacts(scene,result.facts);
      publish({rows:result.rows,status:'ready',pending:nativeNavigationMarkerPending(scene).length>0,
        selectedMarkerId:result.rows.some(row=>row.marker.id===state.selectedMarkerId)?state.selectedMarkerId:undefined,
        error:state.status==='error'||state.error===failure?'':state.error});
    }catch{if(current()&&!request.signal.aborted)publish({error:failure,
      status:state.rows.length||state.status==='ready'?'ready':'error'});}
    finally{if(controller===request)controller=undefined;running=false;if(queued)void drain();}
  };
  const changed=()=>{if(!current()){queued=false;controller?.abort();return;}
    if(busy()&&running){queued=true;controller?.abort();}
    if(queued&&!busy())void drain();};
  const unsubscribes=[subscribeNavigationDirectory(changed),subscribeNativeNavigation(changed)];
  return{refresh(){if(!current())return;queued=true;void drain();},
    dispose(){active=false;queued=false;controller?.abort();unsubscribes.forEach(unsubscribe=>unsubscribe());}};
}
export function setNavigationDirectoryQuery(query:string){publish({query,scroll:0});}
export function setNavigationDirectoryScroll(scroll:number){if(Number.isFinite(scroll)&&scroll>=0)publish({scroll});}
export function backNavigationDirectoryPlaces(){publish({selectedMarkerId:undefined,error:''});}
export function setNavigationDirectoryOpen(canvasId:string,open:boolean){
  const scene=currentNativeNavigationScene();
  if(!open){serial++;activeDirectoryNavigation=undefined;readAbort?.abort();publish({open:false,busy:null});return;}
  if(!scene||scene.canvasId!==canvasId)return;
  const same=state.scene?.projectId===scene.projectId&&state.scene.canvasId===scene.canvasId;
  publish({scene,open:true,selectedMarkerId:undefined,...(!same?{query:'',scroll:0,rows:[]}:{} )});
  void refreshNavigationDirectory();
}
export async function refreshNavigationDirectory(notice=''){
  const scene=currentNativeNavigationScene();if(!scene||!state.open)return;
  const operation=++serial;readAbort?.abort();const controller=new AbortController();readAbort=controller;
  publish({scene,status:'loading',error:'',busy:null});
  try{const result=await readDirectory(scene,controller.signal);
    if(operation!==serial||controller.signal.aborted||!navigationSceneCurrent(scene))return;
    adoptNativeNavigationFacts(scene,result.facts);
    publish({rows:result.rows,status:'ready',pending:nativeNavigationMarkerPending(scene).length>0,error:notice});
  }catch{if(operation===serial&&!controller.signal.aborted&&navigationSceneCurrent(scene))publish({status:'error',error:'暂时无法读取已固定目标，原记录保留。'});}
}
export async function verifyNavigationDirectoryPending(){
  const scene=currentNativeNavigationScene();if(!scene||state.busy)return;
  const operation=++serial;publish({busy:'checking',error:''});
  try{const result=await verifyNativeNavigationMarkerPending(scene,()=>operation===serial&&navigationSceneCurrent(scene));
    if(operation!==serial||!navigationSceneCurrent(scene))return;
    publish({pending:result.status==='unknown',busy:null,error:result.status==='unknown'?'结果仍待核对，没有重复提交。':''});
    await refreshNavigationDirectory(result.changed?'固定状态刚有变化，已显示最新结果。':'');
  }catch{if(operation===serial&&navigationSceneCurrent(scene))publish({busy:null,error:'暂时无法核对，原记录仍保留。'});}
  finally{syncNativeNavigationPending(scene);}
}
export async function removeNavigationDirectoryMarker(markerId:string){
  const scene=currentNativeNavigationScene(),row=state.rows.find(row=>row.marker.id===markerId);
  if(!scene||!row||state.busy||state.pending||state.scene?.projectId!==scene.projectId)return;
  const operation=++serial;publish({busy:markerId,error:''});
  try{
    await removeNativeNavigationMarker(scene,markerId,()=>operation===serial&&navigationSceneCurrent(scene),{selectedMarker:row.marker});
    if(operation!==serial||!navigationSceneCurrent(scene))return;
    publish({busy:null,selectedMarkerId:undefined});await refreshNavigationDirectory();
  }catch(cause:any){if(operation===serial&&navigationSceneCurrent(scene)){
    if(cause?.code==='NAVIGATION_MARKER_CHANGED'&&cause.facts){
      adoptNativeNavigationFacts(scene,cause.facts);
      try{const result=await readDirectory(scene,undefined,cause.facts);
        if(operation===serial&&navigationSceneCurrent(scene))publish({rows:result.rows,status:'ready',busy:null,
          selectedMarkerId:result.rows.some(row=>row.marker.id===state.selectedMarkerId)?state.selectedMarkerId:undefined,
          pending:nativeNavigationMarkerPending(scene).length>0,error:'固定状态刚有变化，已显示最新结果。'});
      }catch{if(operation===serial&&navigationSceneCurrent(scene))publish({busy:null,error:'固定状态刚有变化，位置暂时无法读取，已有记录保留。'});}
    }else publish({busy:null,pending:nativeNavigationMarkerPending(scene).length>0,
      error:nativeNavigationMarkerPending(scene).length?'取消结果待核对，没有重复提交。':'暂时无法取消固定，原目标和记录保留。'});
  }}finally{syncNativeNavigationPending(scene);}
}
/** The selected occurrence is always proved again. Original Ke changes scene,
 * original Header Back owns cross-scene return, and original camera owns locate. */
export async function selectNavigationDirectoryMarker(markerId:string,selectedPlace?:NativeNavigationDirectoryPlace){
  const origin=currentNativeNavigationScene(),initial=state.rows.find(row=>row.marker.id===markerId);
  if(!origin||!initial||state.busy||state.scene?.projectId!==origin.projectId)return;
  const operation=++serial,current=()=>operation===serial&&navigationSceneCurrent(origin);activeDirectoryNavigation=operation;
  readAbort?.abort();const controller=new AbortController();readAbort=controller;
  let destinationCanvasId:string|undefined;
  const saved={query:state.query,scroll:state.scroll};publish({busy:markerId,error:''});
  try{
    const fresh=await readDirectory(origin,controller.signal);if(!current())return;
    const row=fresh.rows.find(row=>row.marker.id===markerId);
    if(!row||!sameMarker(row.marker,initial.marker))throw Error('固定记录已变化，请重新选择。');
    adoptNativeNavigationFacts(origin,fresh.facts);publish({rows:fresh.rows});
    if(!selectedPlace&&row.candidates.length>1){publish({selectedMarkerId:markerId,busy:null});return;}
    const place=selectedPlace?row.candidates.find(place=>place.key===selectedPlace.key):row.candidates[0];
    if(!place)throw Error(row.detail);
    destinationCanvasId=place.canvasId;
    if(!isNativeNavigationNodeMarker(row.marker)){
      const resolution=await resolveNativeNavigationTarget(origin,row.marker.targetRef,controller.signal);if(!current())return;
      if(resolution.status==='unresolved'&&row.marker.targetRef.kind==='view')throw Error('目标已不可用，原视角保留。');
    }
    const reopen=async()=>{
      const restoring=()=>nativeWorkspaceSourceRestoring(origin.projectId,origin.canvasId,{kind:'navigation-marker',id:markerId});
      if(!projectCurrent(origin)||!restoring())return;
      const returningOperation=++serial;activeDirectoryNavigation=returningOperation;readAbort?.abort();
      const returningController=new AbortController();readAbort=returningController;
      try{
        const returned=await waitForDirectoryArrival(origin,origin,returningOperation,returningController.signal,restoring);
        if(returningOperation!==serial||!restoring())return;
        publish({scene:returned,open:true,busy:null,selectedMarkerId:undefined,...saved});await refreshNavigationDirectory();
      }catch(error){if(returningOperation===serial&&projectCurrent(origin)&&restoring())throw error;}
      finally{if(activeDirectoryNavigation===returningOperation)activeDirectoryNavigation=undefined;}
    };
    if(place.canvasId!==origin.canvasId){
      publish({open:false});
      await enterNativeWorkspaceWithReturn(origin.projectId,place.workspace as any,{kind:'navigation-marker',id:markerId,title:'已固定'},reopen,
        {preservePriorReturn:true,restoreComposerFocus:false,isCurrent:()=>operation===serial&&projectCurrent(origin)});
      if(operation!==serial||!projectCurrent(origin))return;
    }else publish({open:false});
    const arrival=await waitForDirectoryArrival(origin,place,operation,controller.signal);
    const latest=await readNativeNavigationFacts(arrival,controller.signal);
    if(operation!==serial||!navigationSceneCurrent(arrival))return;
    const marker=nativeNavigationRecords(latest).find(marker=>marker.id===markerId);
    const confirmed=nativeNavigationCandidates(nativeNavigationRecordTarget(row.marker),latest,[{canvasId:arrival.canvasId,nodes:[...arrival.api.getNodes()],surfaceRef:arrival.surfaceRef}])
      .candidates.find(candidate=>candidate.key===place.key&&marker&&sameMarker(marker,row.marker)&&nativeNavigationMarkerApplies(marker,candidate,latest));
    if(!confirmed)throw Error('这个位置已变化，未定位到其他对象。');
    if(confirmed.nodeId){await locateNativeNavigationNode(confirmed.nodeId);
      const navigation=nativeNavigationSnapshot();
      if(navigation.notice&&navigation.noticeNode===confirmed.nodeId)throw Error('暂时无法定位，原返回入口仍保留。');
    }
    if(operation===serial)publish({busy:null,error:''});
  }catch(error){if(operation===serial&&projectCurrent(origin)){
    const now=currentNativeNavigationScene(),canvas=useCanvasStore.getState();
    const atOrigin=now?now.canvasId===origin.canvasId&&now.workspaceId===origin.workspaceId:canvas.canvasId===origin.canvasId;
    const atDestination=now?now.canvasId===destinationCanvasId:canvas.canvasId===destinationCanvasId;
    if(!atOrigin&&!atDestination)return;
    const message=error instanceof Error&&/^(固定记录|目标已不可用|这个位置|尚未放|位置暂时|暂时无法定位|原画布还未就绪)/.test(error.message)
      ?error.message:'暂时无法前往，原内容和返回位置保留。';
    // If its API never registers, the original header still owns the route and
    // Back. Put the error there instead of discarding it behind a null scene.
    if(!now&&atDestination&&destinationCanvasId)reportNativeWorkspaceNavigationError(origin.projectId,origin.canvasId,destinationCanvasId,
      {kind:'navigation-marker',id:markerId},message);
    publish({busy:null,error:message,open:!!now,...(now?{scene:now}:{})});
  }}finally{if(activeDirectoryNavigation===operation)activeDirectoryNavigation=undefined;if(operation===serial&&state.busy===markerId)publish({busy:null});}
}
