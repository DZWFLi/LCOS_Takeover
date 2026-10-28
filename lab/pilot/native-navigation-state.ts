import { useSyncExternalStore } from 'react';
import useCanvasStore from './native-canvas-port';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { locateNativeMaterialNodes } from './native-material-placement-client';
import { readNativeNavigationFacts, nativeNavigationTarget, createNativeNavigationMarker, removeNativeNavigationMarker,
  nativeNavigationMarkerPending, verifyNativeNavigationMarkerPending, resolveNativeNavigationTarget,
  nativeNavigationNodeTarget, nativeNavigationRecords, nativeNavigationRecordTarget, sameNativeNavigationTarget,
  type NativeNavigationScene, type NativeNavigationFacts } from './native-navigation-markers';

type Viewport = { x: number; y: number; zoom: number };
type ReturnPoint = { scene: NativeNavigationScene; viewport: Viewport; nodeId: string };
type State = { scene: NativeNavigationScene | null; status: 'loading' | 'ready' | 'error'; facts?: NativeNavigationFacts;
  busy: string | null; notice: string; noticeNode?: string; pending: boolean; arrival?: {nodeId:string;until:number};
  returning?: ReturnPoint; navigating?: string; cameraMode?: 'locate'|'return';
  unplacedMarkerIds?: readonly string[]; layoutIncomplete?: boolean };
let state: State = { scene:null,status:'loading',busy:null,notice:'',pending:false };
const listeners = new Set<()=>void>();
let readSerial=0, navigationSerial=0, readAbort:AbortController|undefined, arrivalTimer:ReturnType<typeof setTimeout>|undefined;
const publish=(patch:Partial<State>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
export const nativeNavigationSnapshot=()=>state;
export const subscribeNativeNavigation=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
/** A read-only hint for the original visibility hook. It may skip its entry
 * debounce for this exact navigation target, but never replaces its own
 * viewport intersection or delayed offscreen unloading. */
export function LCOSUseNativeNavigationVisibility(nodeId:string):boolean {
  const value=useSyncExternalStore(subscribeNativeNavigation,nativeNavigationSnapshot,nativeNavigationSnapshot);
  return !!nodeId&&!!value.scene&&navigationSceneCurrent(value.scene)
    &&(value.cameraMode==='locate'&&value.navigating===nodeId||value.arrival?.nodeId===nodeId);
}
export const sameNavigationTarget=sameNativeNavigationTarget;
const identity=(node:any)=>JSON.stringify([node?.id,node?.type,node?.data?.lcos_ref,node?.data?.lcos_collection_ref,
  node?.data?.lcos_conversation_ref,node?.data?.lcos_execution_ref,node?.data?.lcos_member_ref]);
export function currentNativeNavigationScene():NativeNavigationScene|null {
  const canvas=useCanvasStore.getState(),shell=useLcosShellStore.getState(),host=window.__LCOS_NODE_LAB__;
  if(canvas.status!=='ready'||!canvas.canvasId||!canvas.rfInstance||!shell.projectId||!shell.activeWorkspaceId
    ||host?.api!==canvas.rfInstance||host.projectId!==shell.projectId||(host.currentCanvasId??host.canvasId)!==canvas.canvasId)return null;
  return {projectId:shell.projectId,canvasId:canvas.canvasId,workspaceId:shell.activeWorkspaceId,api:canvas.rfInstance,
    surfaceRef:shell.surfaceCanvasId.main===canvas.canvasId?'main':'workspace:'+shell.activeWorkspaceId};
}
export function navigationSceneCurrent(scene:NativeNavigationScene):boolean {
  const current=currentNativeNavigationScene();return !!current&&['projectId','canvasId','workspaceId','surfaceRef','api'].every(key=>current[key as keyof NativeNavigationScene]===scene[key as keyof NativeNavigationScene]);
}
export function refreshNativeNavigation():()=>void {
  const operation=++readSerial,scene=currentNativeNavigationScene();readAbort?.abort();readAbort=new AbortController();
  navigationSerial++;clearTimeout(arrivalTimer);
  publish({scene,status:'loading',facts:undefined,busy:null,notice:'',pending:false,arrival:undefined,returning:undefined,navigating:undefined,cameraMode:undefined,unplacedMarkerIds:[],layoutIncomplete:false});
  if(scene){const controller=readAbort;void readNativeNavigationFacts(scene,controller.signal).then(facts=>{
    if(!controller.signal.aborted&&operation===readSerial&&navigationSceneCurrent(scene))publish({facts,status:'ready',pending:nativeNavigationMarkerPending(scene).length>0});
  }).catch(()=>{if(!controller.signal.aborted&&operation===readSerial&&navigationSceneCurrent(scene))publish({status:'error',notice:'固定目标暂时无法读取，可重试。'});});}
  return()=>{if(operation===readSerial)readAbort?.abort();};
}
/** A fresh directory read may update marker facts without consuming the
 * user's camera return point, arrival feedback or current navigation. */
export function adoptNativeNavigationFacts(scene:NativeNavigationScene,facts:NativeNavigationFacts):boolean {
  if(!navigationSceneCurrent(scene)||!state.scene||!navigationSceneCurrent(state.scene))return false;
  readSerial++;readAbort?.abort();
  publish({facts,status:'ready',pending:nativeNavigationMarkerPending(scene).length>0,
    ...(state.status==='error'&&!state.noticeNode?{notice:''}:{})});return true;
}
/** An original producer can finish after its menu/directory has closed. Echo
 * its real attempt count; never clear the producer's unknown-result records. */
export function syncNativeNavigationPending(scene:NativeNavigationScene):boolean {
  if(!navigationSceneCurrent(scene)||!state.scene||!navigationSceneCurrent(state.scene))return false;
  const pending=nativeNavigationMarkerPending(scene).length>0;
  if(state.pending!==pending)publish({pending});return true;
}
/** Project invalidation is only a fresh read. It must not consume the camera
 * journey/return state as the scene-initialization refresh intentionally does. */
export function createNativeNavigationProjectReader(scene:NativeNavigationScene) {
  const failure='固定目标暂时没有更新，已有记录保留。';
  let active=true,queued=false,running=false,controller:AbortController|undefined;
  const current=()=>active&&navigationSceneCurrent(scene)&&!!state.scene&&navigationSceneCurrent(state.scene);
  const drain=async()=>{
    if(!current()){queued=false;controller?.abort();return;}
    if(running||!queued||state.busy)return;
    queued=false;running=true;const request=new AbortController();controller=request;
    try{const facts=await readNativeNavigationFacts(scene,request.signal);
      if(current()&&!request.signal.aborted&&!state.busy){
        const clear=state.notice===failure;
        if(adoptNativeNavigationFacts(scene,facts)&&clear)publish({notice:''});
      }
    }catch{if(current()&&!request.signal.aborted&&(!state.notice||state.notice===failure))
      publish({...(state.facts?{}:{status:'error' as const}),notice:failure});}
    finally{if(controller===request)controller=undefined;running=false;if(queued)void drain();}
  };
  const unsubscribe=subscribeNativeNavigation(()=>{
    if(!current()){queued=false;controller?.abort();return;}
    if(state.busy&&running){queued=true;controller?.abort();}
    if(queued&&!state.busy)void drain();
  });
  return { refresh(){if(!current())return;queued=true;void drain();},
    dispose(){active=false;queued=false;controller?.abort();unsubscribe();} };
}
/** Ephemeral presentation only. Canonical records and spatial truth remain in
 * their existing owners; a cramped viewport never removes a fixed target. */
export function adoptNativeNavigationLayout(scene:NativeNavigationScene,ids:readonly string[],incomplete=false):boolean {
  if(!navigationSceneCurrent(scene)||!state.scene||state.scene.api!==scene.api||!navigationSceneCurrent(state.scene)||!state.facts)return false;
  const known=new Set(nativeNavigationRecords(state.facts).map(row=>row.id));
  const next=[...new Set(ids.filter(id=>known.has(id)))].sort();
  if(!!state.layoutIncomplete===incomplete&&next.length===(state.unplacedMarkerIds?.length??0)
    &&next.every((id,index)=>id===state.unplacedMarkerIds?.[index]))return true;
  publish({unplacedMarkerIds:next,layoutIncomplete:incomplete});return true;
}
export function navigationMarkersForNode(nodeId:string) {
  const {scene,facts}=state;if(!scene||!facts||!navigationSceneCurrent(scene))return [];
  const node=scene.api.getNodes().find((row:any)=>row.id===nodeId),target=nativeNavigationNodeTarget(node,scene,facts);
  return target?nativeNavigationRecords(facts).filter(marker=>(marker.scope==='cross-surface'||marker.scope==='local'&&marker.sourceSurfaceRef===scene.surfaceRef)
    &&sameNavigationTarget(nativeNavigationRecordTarget(marker),target)):[];
}
export async function toggleNativeNavigationPin(nodeId:string,manageDirectory?:(canvasId:string)=>void) {
  const {scene,facts}=state;if(!scene||!facts||state.busy||!navigationSceneCurrent(scene))return;
  publish({busy:nodeId,notice:'',noticeNode:nodeId});
  try{
    if(nativeNavigationMarkerPending(scene).length){const checked=await verifyNativeNavigationMarkerPending(scene,()=>navigationSceneCurrent(scene));
      if(!navigationSceneCurrent(scene))return;publish({facts:checked.facts,pending:checked.status==='unknown',notice:checked.status==='unknown'?'固定结果仍待核对，未重复提交。':checked.changed?'固定状态刚有变化，已显示最新结果。':'已核对固定结果。'});return;}
    const markers=navigationMarkersForNode(nodeId);
    if(markers.length>1){manageDirectory?.(scene.canvasId);return;}
    if(markers.length)await removeNativeNavigationMarker(scene,markers[0]!.id,()=>navigationSceneCurrent(scene),{selectedMarker:markers[0]!});
    else await createNativeNavigationMarker(scene,nodeId,facts,()=>navigationSceneCurrent(scene));
    const fresh=await readNativeNavigationFacts(scene);if(navigationSceneCurrent(scene))publish({facts:fresh,status:'ready',pending:false});
  }catch(cause:any){if(navigationSceneCurrent(scene)){const pending=nativeNavigationMarkerPending(scene).length>0;
    if(cause?.code==='NAVIGATION_MARKER_CHANGED'&&cause.facts){adoptNativeNavigationFacts(scene,cause.facts);
      publish({notice:'固定状态刚有变化，已显示最新结果。',pending});}
    else publish({notice:pending?'固定结果尚未确认，请核对；不会重复提交。':'固定暂未保存，请重试。原目标和位置已保留。',pending});}}
  finally{syncNativeNavigationPending(scene);if(navigationSceneCurrent(scene))publish({busy:null});}
}
export async function verifyNativeNavigationPending() {
  const scene=currentNativeNavigationScene();if(!scene||state.busy)return;
  publish({busy:'checking'});
  try{const checked=await verifyNativeNavigationMarkerPending(scene,()=>navigationSceneCurrent(scene));
    if(navigationSceneCurrent(scene))publish({facts:checked.facts,status:'ready',pending:checked.status==='unknown',
      notice:checked.status==='unknown'?'固定结果仍待核对，未重复提交。':checked.changed?'固定状态刚有变化，已显示最新结果。':'',noticeNode:undefined});
  }catch{if(navigationSceneCurrent(scene))publish({notice:'暂时无法核对，请稍后重试。'});}
  finally{syncNativeNavigationPending(scene);if(navigationSceneCurrent(scene))publish({busy:null});}
}
export async function toggleNativeNodeEmphasis(nodeId:string) {
  const scene=currentNativeNavigationScene();if(!scene)return;
  const node=scene.api.getNodes().find((row:any)=>row.id===nodeId);if(!node||node.data?.locked||!scene.api.updateNodeData)return;
  const next=node.data?.lcos_gui_emphasis!==true;
  try{
    scene.api.updateNodeData(nodeId,{lcos_gui_emphasis:next});
    if(scene.api.flushCanvas&&await scene.api.flushCanvas(scene.canvasId)!=='saved')throw Error('强调显示已保留在画布中，保存结果还需核对。');
    if(navigationSceneCurrent(scene))publish({notice:'',noticeNode:nodeId});
  }catch{if(navigationSceneCurrent(scene))publish({notice:'强调暂未保存，请核对画布。',noticeNode:nodeId});}
}
export function interruptNativeNavigation() {
  if(!state.navigating)return;navigationSerial++;
  const scene=state.scene;
  if(scene&&navigationSceneCurrent(scene)&&scene.api.setViewport)void scene.api.setViewport(scene.api.getViewport(),{duration:0});
  publish({navigating:undefined,cameraMode:undefined,arrival:undefined});
}
export async function locateNativeNavigationNode(nodeId:string) {
  const scene=currentNativeNavigationScene();if(!scene)return;
  const first=scene.api.getNodes().find((row:any)=>row.id===nodeId);if(!first)return;
  const proof=identity(first),operation=++navigationSerial,viewport={...scene.api.getViewport()};
  const current=()=>operation===navigationSerial&&navigationSceneCurrent(scene)
    &&identity(scene.api.getNodes().find((row:any)=>row.id===nodeId))===proof;
  publish({navigating:nodeId,cameraMode:'locate',notice:'',noticeNode:nodeId,arrival:undefined});
  try{
    if(state.facts&&state.scene&&navigationSceneCurrent(state.scene)){
      const target=nativeNavigationTarget(first,scene,state.facts);
      if(target){const fresh=await readNativeNavigationFacts(scene);if(!current())return;
        const live=scene.api.getNodes().find((row:any)=>row.id===nodeId);
        if(!sameNavigationTarget(target,nativeNavigationTarget(live,scene,fresh)))throw Error('这个位置已变化，未前往其他对象。');
        // Resolve domain identity, never use its legacy coordinates. Some old
        // entity branches lack Collection/Run support; exact current binding
        // and fresh entity evidence still permit this native node to be located.
        const resolution=await resolveNativeNavigationTarget(scene,target);if(!current())return;
        if(resolution.status==='unresolved'&&target.kind==='view')throw Error('目标已不可用，原视角保留。');
        const latest=await readNativeNavigationFacts(scene);if(!current())return;
        if(!sameNavigationTarget(target,nativeNavigationTarget(scene.api.getNodes().find((row:any)=>row.id===nodeId),scene,latest)))
          throw Error('这个位置已变化，未前往其他对象。');
        publish({facts:latest});
      }
    }
    if(!current()||!await locateNativeMaterialNodes([nodeId],{api:scene.api,isCurrent:current})||!current())return;
    clearTimeout(arrivalTimer);
    publish({navigating:undefined,cameraMode:undefined,returning:{scene,viewport,nodeId},arrival:{nodeId,until:Date.now()+2200}});
    arrivalTimer=setTimeout(()=>{if(operation===navigationSerial)publish({arrival:undefined});},2200);
  }catch(error){if(current())publish({notice:error instanceof Error&&/^(这个位置|目标已不可用)/.test(error.message)?error.message:'暂时无法定位，请重试。',noticeNode:nodeId,navigating:undefined,cameraMode:undefined});}
  finally{if(operation===navigationSerial&&state.navigating===nodeId)publish({navigating:undefined,cameraMode:undefined});}
}
export async function returnNativeNavigationView() {
  const point=state.returning;if(!point)return;const operation=++navigationSerial;
  if(!navigationSceneCurrent(point.scene)){publish({returning:undefined,arrival:undefined});return;}
  clearTimeout(arrivalTimer);publish({navigating:point.nodeId,cameraMode:'return',arrival:undefined});
  try{if(typeof point.scene.api.setViewport!=='function')throw Error('Original camera unavailable');
    const result=await point.scene.api.setViewport(point.viewport,{duration:180});
    if(result===false)throw Error('暂时无法返回，当前视角已保留。');
    if(operation===navigationSerial&&navigationSceneCurrent(point.scene))publish({returning:undefined,navigating:undefined,cameraMode:undefined});
  }catch{if(operation===navigationSerial&&navigationSceneCurrent(point.scene))publish({notice:'暂时无法返回，当前视角已保留。',navigating:undefined,cameraMode:undefined});}
}
export function LCOSUseNativeNavigationNode(nodeId:string,manageDirectory?:(canvasId:string)=>void) {
  const value=useSyncExternalStore(subscribeNativeNavigation,nativeNavigationSnapshot,nativeNavigationSnapshot);
  const canvas=useCanvasStore(s=>s),node=canvas.nodes.find(row=>row.id===nodeId),scene=value.scene;
  const markers=navigationMarkersForNode(nodeId);
  return {canPin:!!scene&&!!value.facts&&navigationSceneCurrent(scene)&&!!nativeNavigationNodeTarget(node,scene,value.facts),
    pinned:markers.length>0,pinAction:markers.length>1?'manage':markers.length?'remove':'create',busy:!!value.busy||value.pending,
    canEmphasize:!!node&&!node.data?.locked,canLocate:!!node&&!node.hidden,
    emphasized:node?.data?.lcos_gui_emphasis===true,notice:value.noticeNode===nodeId?value.notice:'',
    togglePin:()=>{void toggleNativeNavigationPin(nodeId,manageDirectory);},toggleEmphasis:()=>{void toggleNativeNodeEmphasis(nodeId);},locate:()=>{void locateNativeNavigationNode(nodeId);}};
}
