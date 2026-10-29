import {expect,it,vi} from 'vitest';

import {resolveDropIntent} from './dropIntentResolver';
import {createNativeCanvasDrop,type NativeCanvasDropPort} from './nativeCanvasDrop';

import type {DropResolution} from './dropTypes';
import type {DropPayload,SemanticDropState} from '@local-creative-os/web-gen2';
import type {Node} from '@xyflow/react';

function fixture(local=false,prepare=false){
  const node={id:'a',position:{x:20,y:30},data:{}} as Node;
  let position={...node.position};let payload:DropPayload={kind:'objects',objects:[]};
  let state:SemanticDropState={status:'idle'};let resolution:DropResolution|null=null;
  const snapshot=()=>[{nodeId:'a',position:{...position},absolutePosition:{...position},reference:prepare
    ?{entityType:'native-text',entityId:'a',nativeText:{nodeType:'text' as const,body:''}}
    :{entityType:'note',entityId:'note-a'}}];
  const port:NativeCanvasDropPort={
    scope:()=>({projectId:'p',canvasId:'c'}),snapshot,read:()=>({state,resolution}),
    begin:(value)=>{payload=value;state={status:'tracking',payload};},
    advance:({clientX})=>{
      if(clientX>500){state={status:'preview',payload,destination:{targetId:local?'frame:f':'railway:collection',previewPoint:{x:clientX,y:50}},carryAnchor:'left'};
        resolution=prepare?resolveDropIntent(payload,{targetId:local?'frame:f':'railway:collection',enabled:true,
          semantic:{kind:'collection-membership',collectionId:'collection-a'}})
          :{status:'ready',intent:{kind:'collection-membership',targetId:local?'frame:f':'railway:collection',collectionId:'collection-a',memberRef:{type:'note',id:'note-a'}}};}
      else {state={status:'tracking',payload};resolution=null;}
    },
    cancelDrop:vi.fn(()=>{state={status:'idle'};resolution=null;}),commit:vi.fn(()=>true),
    cancelDrag:vi.fn(()=>{position={...node.position};}),clearNativePreview:vi.fn(),markSources:vi.fn(),clearSourceMarks:vi.fn(),
    visibleCollectionFrame:vi.fn((_id,targetId)=>local&&targetId==='frame:f'?{frameId:'f',position:{x:500,y:50}}:undefined),
    holdLanding:vi.fn(),clearLanding:vi.fn(),reject:vi.fn(),
  };
  const controller=createNativeCanvasDrop(port);
  const event=(x:number)=>({clientX:x,clientY:50}) as MouseEvent;
  controller.onStart?.(event(50),node,[node]);
  return {port,controller,node,event,move:(x:number)=>{position={x,y:50};return controller.onMove?.(event(x),node,[node]);},position:()=>position};
}
it('ordinary movement stays with native geometry and never opens a semantic operation',()=>{
  const f=fixture();f.move(200);
  expect(f.controller.onStop?.(f.event(200),f.node,[f.node])).toBe(false);
  expect(f.port.cancelDrag).not.toHaveBeenCalled();expect(f.port.commit).not.toHaveBeenCalled();
});
it('entering a Rail receiver restores originals immediately; leaving cancels instead of turning back into a move',()=>{
  const f=fixture();expect(f.move(600)).toBe(true);
  expect(f.position()).toEqual({x:20,y:30});
  // React Flow position changes are ignored after semantic lift.
  expect(f.controller.filterChanges?.([{id:'a',type:'position',position:{x:300,y:50},dragging:true}])).toEqual([]);
  f.controller.onMove?.(f.event(200),f.node,[f.node]);
  expect(f.controller.onStop?.(f.event(200),f.node,[f.node])).toBe(true);
  expect(f.port.commit).not.toHaveBeenCalled();expect(f.position()).toEqual({x:20,y:30});
});
it('Rail collection receive submits references without reparenting the source into an expanded Frame',()=>{
  const f=fixture();f.move(600);f.controller.onStop?.(f.event(600),f.node,[f.node]);
  expect(f.port.commit).toHaveBeenCalledTimes(1);
  const source=vi.mocked(f.port.commit).mock.calls[0]?.[0];
  expect(source?.landing).toBeUndefined();expect(source?.nodes[0]?.position).toEqual({x:20,y:30});
});
it('direct manipulation onto the real Frame retains its separate native landing',()=>{
  const f=fixture(true);f.move(600);expect(f.port.cancelDrag).not.toHaveBeenCalled();
  f.controller.onStop?.(f.event(600),f.node,[f.node]);
  expect(vi.mocked(f.port.commit).mock.calls[0]?.[0].landing).toMatchObject({frameId:'f',collectionId:'collection-a',nodes:[{absolutePosition:{x:600,y:50}}]});
});
it('native material source preparation preserves the same visible Collection landing instead of lifting it as a remote drop',()=>{
  const f=fixture(true,true);f.move(600);
  expect(f.port.cancelDrag).not.toHaveBeenCalled();
  f.controller.onStop?.(f.event(600),f.node,[f.node]);
  expect(vi.mocked(f.port.commit).mock.calls[0]?.[0].landing).toMatchObject({frameId:'f',collectionId:'collection-a',
    nodes:[{nodeId:'a',absolutePosition:{x:600,y:50},reference:{entityType:'native-text',entityId:'a'}}]});
});
