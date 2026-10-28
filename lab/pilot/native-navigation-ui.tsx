import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { Pin, Navigation2, ArrowLeft, RefreshCw } from 'lucide-react';
import useCanvasStore from './native-canvas-port';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { useCollaborationSessionStore } from '../../lcos/huabu/apps/web/src/lcos/collaboration/collaborationSessionStore';
import { visibleCanvas } from './native-material-placement-client';
import { nativeNavigationNodeTargets, nativeNavigationRecords, nativeNavigationRecordTarget } from './native-navigation-markers';
import { interruptNavigationDirectory, createNativeNavigationDirectoryProjectReader } from './native-navigation-directory-state';
import { clusterNativeNavigationMarkers, type NativeNavigationMarker, type NavigationRect } from './native-navigation-geometry';
import { readNativeNavigationObstacles, layoutNativeNavigationMarkers } from './native-navigation-obstacles';
import { watchNativeNavigationLayout } from './native-navigation-layout-watch';
import { nativeNavigationSnapshot,subscribeNativeNavigation,refreshNativeNavigation,navigationSceneCurrent,sameNavigationTarget,
  locateNativeNavigationNode,returnNativeNavigationView,interruptNativeNavigation,verifyNativeNavigationPending,adoptNativeNavigationLayout } from './native-navigation-state';
import { currentNativeNavigationScene, createNativeNavigationProjectReader } from './native-navigation-state';
import './native-navigation-ui.css';
import '../../lcos/huabu/apps/web/src/lcos/ui/materials/soft-underlight.css';
type Parts={Popover:ComponentType<any>;ActionButton:ComponentType<any>};
const label=(node:any)=>String(node.data?.title??node.data?.label??node.data?.lcos_execution_facts?.title??'已固定目标');
/** Only GUI identity changes invalidate saved reads. Pan, geometry, selection
 * and per-frame measurements must not create a request loop. */
export function nativeNavigationGuiSignature(nodes:readonly any[]):string {
  return JSON.stringify(nodes.map(node=>[node.id,node.type,node.hidden===true,node.data?.lcos_gui_navigation_pin===true,
    ...['lcos_ref','lcos_collection_ref','lcos_conversation_ref','lcos_execution_ref','lcos_run_ref','lcos_member_ref','lcos_result_ref','lcos_file_ref','lcos_method_member_ref','lcosCollectionId','lcosCollectionNodeId','lcos_native_collection']
      .map(key=>{const value=node.data?.[key];return value&&typeof value==='object'
        ? Object.fromEntries(['version','projectId','canvasId','workspaceId','entityType','entityId','artifactId','artifactViewId','viewId','revisionId','collectionId','connectedConversationId','runId','slotId'].filter(field=>value[field]!==undefined).map(field=>[field,value[field]])) : value;})]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
}
export function NativeNavigationHost({parts}:{parts:Parts}) {
  const state=useSyncExternalStore(subscribeNativeNavigation,nativeNavigationSnapshot,nativeNavigationSnapshot),canvas=useCanvasStore(s=>s);
  const project=useLcosShellStore(s=>s.projectId),workspace=useLcosShellStore(s=>s.activeWorkspaceId);
  const [layout,setLayout]=useState(0),[open,setOpen]=useState<string|null>(null),[hidden,setHidden]=useState(document.hidden);
  const previous=useRef(new Map<string,NativeNavigationMarker>()),measurements=useRef<Element[]>([]);
  const watcher=useRef<ReturnType<typeof watchNativeNavigationLayout>|null>(null);
  const presentation=useRef<{scene:NonNullable<typeof state.scene>;ids:string[];incomplete:boolean}|null>(null);
  useEffect(()=>{previous.current.clear();setOpen(null);return refreshNativeNavigation();},[project,workspace,canvas.canvasId,canvas.rfInstance,canvas.status]);
  useEffect(()=>{
    const scene=currentNativeNavigationScene();if(!project||!scene)return;
    const navigation=createNativeNavigationProjectReader(scene),directory=createNativeNavigationDirectoryProjectReader(scene);
    const unwatch=useCollaborationSessionStore.getState().watchProjectChanges(project,()=>{navigation.refresh();directory.refresh();});
    let signature=nativeNavigationGuiSignature(useCanvasStore.getState().nodes);
    const unwatchCanvas=useCanvasStore.subscribe(()=>{const next=useCanvasStore.getState(),fresh=nativeNavigationGuiSignature(next.nodes);
      if(fresh===signature)return;signature=fresh;navigation.refresh();directory.refresh();});
    return()=>{unwatch();unwatchCanvas();navigation.dispose();directory.dispose();};
  },[project,workspace,canvas.canvasId,canvas.rfInstance,canvas.status]);
  useEffect(()=>{
    const changed=()=>setLayout(v=>v+1);
    const onVisibility=()=>{setHidden(document.hidden);if(!document.hidden)changed();};
    const cancel=(event:Event)=>{if(event.target instanceof Element&&event.target.closest('.react-flow__pane,.react-flow__node')){interruptNativeNavigation();interruptNavigationDirectory();}};
    const owner=watchNativeNavigationLayout(document,changed,cancel,onVisibility);watcher.current=owner;owner.sync(measurements.current);
    return()=>{owner.dispose();if(watcher.current===owner)watcher.current=null;};
  },[canvas.canvasId]);
  useLayoutEffect(()=>{watcher.current?.sync(measurements.current);
    const value=presentation.current;if(value)adoptNativeNavigationLayout(value.scene,value.ids,value.incomplete);
  });
  // Store subscriptions follow the original native camera/nodes. DOM reads
  // only project their actual layout; no second Canvas or coordinate store.
  void layout;
  const scene=state.scene,paneElement=document.querySelector('.react-flow'),pane=paneElement?.getBoundingClientRect(),safe=visibleCanvas();
  measurements.current=paneElement?[paneElement]:[];presentation.current=null;
  if(!scene||!navigationSceneCurrent(scene)||!pane||!safe||hidden)return null;
  const api=scene.api,zoom=api.getViewport().zoom;
  const rectFor=(id:string):NavigationRect|undefined=>{const bounds=api.getNodesBounds?.([id]);if(!bounds||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)return;
    const p=api.flowToScreenPosition?.({x:bounds.x,y:bounds.y});if(!p)return;return{left:p.x,top:p.y,right:p.x+bounds.width*zoom,bottom:p.y+bounds.height*zoom};};
  const nodes=canvas.nodes.filter(node=>!node.hidden),facts=state.facts;
  const targets=nodes.flatMap(node=>{
    const targets=facts?nativeNavigationNodeTargets(node,scene,facts):[];
    const marker=facts&&nativeNavigationRecords(facts).find(row=>(row.scope==='cross-surface'||row.sourceSurfaceRef===scene.surfaceRef)&&targets.some(target=>sameNavigationTarget(nativeNavigationRecordTarget(row),target)));
    return marker?[{node,marker}]:[];
  });
  const measured=targets.length?readNativeNavigationObstacles(document,{safeRect:safe,pane:paneElement}):{rects:[],elements:[],unmeasured:[]};
  measurements.current=[...measurements.current,...measured.elements];
  const placed=layoutNativeNavigationMarkers({targets:targets.map(({node})=>({id:node.id,
    targetRect:rectFor(node.id)??{left:NaN,top:NaN,right:NaN,bottom:NaN},previousMarker:previous.current.get(node.id)})),
    safeRect:{...safe,top:safe.top+8,bottom:safe.bottom-8},obstacles:measured.rects});
  const projected=placed.markers,renderedIds=new Set(projected.map(row=>row.id));
  const renderedRecords=new Set(targets.filter(({node})=>renderedIds.has(node.id)).map(({marker})=>marker.id));
  const unplaced=new Set(placed.unplaced.map(row=>row.id));
  presentation.current={scene,ids:targets.filter(({node,marker})=>unplaced.has(node.id)&&!renderedRecords.has(marker.id)).map(({marker})=>marker.id),incomplete:measured.unmeasured.length>0};
  const activeIds=new Set(targets.map(({node})=>node.id));for(const id of previous.current.keys())if(!activeIds.has(id))previous.current.delete(id);
  for(const marker of projected)previous.current.set(marker.id,marker);
  const clusters=clusterNativeNavigationMarkers(projected),Popover=parts.Popover,Button=parts.ActionButton;
  const haloIds=new Set(nodes.filter(node=>node.data?.lcos_gui_emphasis===true).map(node=>node.id));if(state.arrival)haloIds.add(state.arrival.nodeId);
  // Native Canvas uses contain:paint, which makes fixed descendants local to
  // its narrowed pane. Keep this same screen-coordinate layer in the body so
  // its measured target positions and viewport clip use one coordinate frame.
  return createPortal(<div data-native-navigation-layer data-native-navigation-state={state.status}>
    <div className="native-navigation-halos" style={{clipPath:`inset(${Math.max(0,safe.top)}px ${Math.max(0,innerWidth-safe.right)}px ${Math.max(0,innerHeight-safe.bottom)}px ${Math.max(0,safe.left)}px)`}}>
    {[...haloIds].map(id=>{const rect=rectFor(id);if(!rect)return null;return <div key={id} data-native-node-emphasis={id} data-arrival={state.arrival?.nodeId===id||undefined}
      className="native-navigation-halo lcos-soft-underlight" style={{left:rect.left-6,top:rect.top-6,width:rect.right-rect.left+12,height:rect.bottom-rect.top+12}}>
      <div className="lcos-soft-underlight-field"/><div className="native-navigation-halo-line"/>
    </div>;})}
    </div>
    {clusters.map(cluster=>{
      const many=cluster.members.length>1,node=nodes.find(row=>row.id===cluster.members[0]?.id),title=many?`${cluster.members.length} 个固定目标`:node?label(node):'已固定目标';
      const trigger=<button type="button" className="native-navigation-marker" data-native-navigation-marker={cluster.id} data-phase={cluster.phase}
        aria-label={many?`查看${title}`:`前往 ${title}`} title={title} style={{left:cluster.x,top:cluster.y,'--marker-progress':cluster.progress} as any}
        onPointerDown={e=>e.stopPropagation()} onClick={()=>{if(!many)void locateNativeNavigationNode(cluster.members[0]!.id);}}>
        <span className="native-navigation-marker-face"><Pin size={16} style={{opacity:1-cluster.progress,transform:`scale(${1-.16*cluster.progress})`}}/>
          <Navigation2 size={17} style={{opacity:cluster.progress,transform:`rotate(${cluster.angle+Math.PI/2}rad) scale(${.84+.16*cluster.progress})`}}/>
        </span>
        {many&&<span className="native-navigation-marker-count">{cluster.members.length}</span>}
      </button>;
      return many?<Popover key={cluster.id} trigger="click" open={open===cluster.id} onOpenChange={(value:boolean)=>setOpen(value?cluster.id:null)} side="right" sideOffset={8}
        contentClassName="p-0" content={<div className="native-navigation-list" aria-label="固定目标">{cluster.members.map(member=>{
          const item=nodes.find(n=>n.id===member.id);return <button key={member.id} type="button" onClick={()=>{setOpen(null);void locateNativeNavigationNode(member.id);}}><Pin size={14}/><span>{item?label(item):'目标不可用'}</span></button>;})}</div>}>{trigger}</Popover>:<span key={cluster.id}>{trigger}</span>;
    })}
    {(state.returning||state.navigating||state.notice||state.pending)&&<div className="native-navigation-feedback" role="status" aria-live="polite" style={{left:(safe.left+safe.right)/2,top:safe.top+70}}>
      {state.returning&&<button type="button" onClick={()=>void returnNativeNavigationView()} aria-label="返回原视角"><ArrowLeft size={14}/>返回原视角</button>}
      {state.navigating&&<span>{state.cameraMode==='return'?'正在返回…':'正在前往…'}</span>}{state.notice&&<span>{state.notice}</span>}
      {state.pending&&!state.notice&&<span>固定结果待核对。</span>}
      {(state.status==='error'||state.pending)&&<button type="button" aria-label="核对固定目标" disabled={!!state.busy} onClick={()=>{if(state.pending)void verifyNativeNavigationPending();else refreshNativeNavigation();}}><RefreshCw size={14}/></button>}
    </div>}
  </div>,document.body);
}
