import {useEffect, useRef, type ReactNode, type PointerEvent as ReactPointerEvent} from 'react';
import {createRailwayPointerDropController, type RailwayPointerDropPort} from '../../lcos/huabu/apps/web/src/lcos/drop/railwayPointerDrop';
import {semanticCarryTriggerFromPointer} from '../../lcos/huabu/apps/web/src/lcos/drop/rightCarry';
import {acquireDrop, advanceDropAtScreenPoint} from '../../lcos/huabu/apps/web/src/lcos/lcosRecognizers';
import {useLcosDropStore} from '../../lcos/huabu/apps/web/src/lcos/lcosDropState';
import {useLcosShellStore} from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import nativeCanvasStore from './native-canvas-port';
import type {DropObjectReference, DropPayload} from '../../lcos/apps/web-gen2/src/interaction/semanticDropMachine';

export interface NativeGalleryCarrySource {
  readonly projectId:string; readonly canvasId:string; readonly workspaceId:string; readonly collectionId:string;
  readonly api:object;
  /** The Gallery owner verifies Core membership and any exact presented View. */
  readonly readReference:(memberKey:string)=>DropObjectReference|undefined;
}
interface Origin {readonly projectId:string|null; readonly canvasId:string|null; readonly workspaceId:string|null; readonly api:object|null}
interface Port extends Pick<RailwayPointerDropPort,'read'|'begin'|'advance'|'commit'|'cancel'> {readonly origin:()=>Origin}
const fingerprint=(ref:DropObjectReference|undefined)=>ref?JSON.stringify([ref.entityType,ref.entityId,ref.artifactViewId,ref.revisionId]):'';

/** A Portal row is a reference producer, never a Canvas spatial source. The
 * mature panel-pointer owner retains this one gesture while Gallery closes. */
export function createNativeGalleryCarryController(port:Port,eventTarget:EventTarget,visibilityTarget:EventTarget) {
  let source:NativeGalleryCarrySource|undefined,memberKey='',reference='',pointerId:number|undefined;
  let acquired=false,disposed=false,onAcquired:(()=>void)|undefined,cleanupTimer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>{
    const origin=port.origin();return !!source&&origin.projectId===source.projectId&&origin.canvasId===source.canvasId
      &&origin.workspaceId===source.workspaceId&&origin.api===source.api&&fingerprint(source.readReference(memberKey))===reference;
  };
  const controller=createRailwayPointerDropController({
    read:port.read,currentProjectId:()=>current()?source!.projectId:null,
    begin(payload){if(!current()||!port.begin(payload))return false;acquired=true;onAcquired?.();return true;},
    advance:point=>current()&&port.advance(point),commit:()=>current()&&port.commit(),cancel:port.cancel,
  },eventTarget,visibilityTarget);
  const dispose=()=>{if(disposed)return;disposed=true;if(cleanupTimer)clearTimeout(cleanupTimer);controller.dispose();
    eventTarget.removeEventListener('pointerup',finished,true);eventTarget.removeEventListener('pointercancel',finished,true);
    eventTarget.removeEventListener('keydown',key,true);eventTarget.removeEventListener('blur',blur);visibilityTarget.removeEventListener('visibilitychange',visibility);};
  // Keep the existing controller's trailing right-menu/click guard alive briefly.
  const finish=()=>{if(cleanupTimer)clearTimeout(cleanupTimer);cleanupTimer=setTimeout(dispose,340);};
  const finished=(event:Event)=>{if((event as PointerEvent).pointerId===pointerId)finish();};
  const key=(event:Event)=>{if((event as KeyboardEvent).key==='Escape')finish();};
  const blur=()=>finish();
  const visibility=()=>{if(typeof document!=='undefined'&&document.visibilityState==='hidden')finish();};
  eventTarget.addEventListener('pointerup',finished,true);eventTarget.addEventListener('pointercancel',finished,true);
  eventTarget.addEventListener('keydown',key,true);eventTarget.addEventListener('blur',blur);visibilityTarget.addEventListener('visibilitychange',visibility);
  return {
    start(event:ReactPointerEvent<HTMLElement>,value:NativeGalleryCarrySource,key:string,close:()=>void){
      if(disposed||source||semanticCarryTriggerFromPointer(event)===null)return false;
      const ref=value.readReference(key);if(!ref||ref.entityType!=='artifact'||!ref.entityId)return false;
      source=value;memberKey=key;reference=fingerprint(ref);pointerId=event.pointerId;onAcquired=close;
      if(!current())return false;
      const payload:Extract<DropPayload,{kind:'objects'}>=Object.freeze({kind:'objects',objects:Object.freeze([Object.freeze({...ref})])});
      return controller.onPayloadPointerDown(event,payload,value.projectId);
    },
    detach(){if(!acquired)dispose();},dispose,
  };
}

// The mature function's legacy type asks for a whole ReactFlow instance, but
// this exact implementation only reads screenToFlowPosition. Narrow that read
// port instead of inventing native setNodes/addNodes methods.
const advanceNativeGalleryPoint = advanceDropAtScreenPoint as (
  point:{readonly clientX:number;readonly clientY:number},
  context:{readonly wrapper:HTMLDivElement;readonly instance:{screenToFlowPosition(point:{x:number;y:number}):{x:number;y:number}}},
)=>void;
const origin=():Origin=>{
  const canvas=nativeCanvasStore.getState(),shell=useLcosShellStore.getState(),host=window.__LCOS_NODE_LAB__;
  return canvas.status==='ready'&&host?.api===canvas.rfInstance&&(host.currentCanvasId??host.canvasId)===canvas.canvasId
    &&host.projectId===shell.projectId?{projectId:shell.projectId,canvasId:canvas.canvasId,workspaceId:shell.activeWorkspaceId,api:canvas.rfInstance}
    :{projectId:null,canvasId:null,workspaceId:null,api:null};
};
/** This component is exported only from agent-ui.js, sharing its exact stores. */
export interface NativeGalleryMemberCarryProps {readonly source?:NativeGalleryCarrySource;readonly memberKey:string;readonly enabled:boolean;readonly onAcquired:()=>void;readonly children:ReactNode}
export function NativeGalleryMemberCarry({source,memberKey,enabled,onAcquired,children}:NativeGalleryMemberCarryProps) {
  const session=useRef<ReturnType<typeof createNativeGalleryCarryController>|null>(null);
  useEffect(()=>()=>session.current?.detach(),[]);
  const down=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(!enabled||!source||semanticCarryTriggerFromPointer(event)===null||event.pointerType!=='mouse'||!event.isPrimary)return;
    const target=event.target;
    if(target instanceof Element&&target.closest('input,textarea,select,button,a,[contenteditable="true"]'))return;
    const state=useLcosDropStore.getState().state;if(state.status!=='idle'&&state.status!=='failed')return;
    session.current?.dispose();
    const next=createNativeGalleryCarryController({origin,read:()=>useLcosDropStore.getState(),
      begin:payload=>{acquireDrop(payload,'panel-pointer');const state=useLcosDropStore.getState().state;return 'payload'in state&&state.payload===payload;},
      advance:point=>{const canvas=nativeCanvasStore.getState();if(!(canvas.canvasWrapper instanceof HTMLDivElement)||!canvas.rfInstance?.screenToFlowPosition)return false;
        advanceNativeGalleryPoint(point,{wrapper:canvas.canvasWrapper,instance:{screenToFlowPosition:p=>canvas.rfInstance!.screenToFlowPosition!(p)}});return true;},
      commit:()=>{useLcosDropStore.getState().commitAt(crypto.randomUUID());return useLcosDropStore.getState().state.status==='committing';},
      cancel:()=>useLcosDropStore.getState().cancel(),
    },window,document);
    session.current=next;if(!next.start(event,source,memberKey,onAcquired)){next.dispose();session.current=null;}
  };
  return <div style={{display:'contents'}} data-native-gallery-carry={memberKey} onPointerDownCapture={down}>{children}</div>;
}
