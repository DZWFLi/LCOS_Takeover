import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
const root=path.resolve(import.meta.dirname,'..'), base=path.join(root,'.runtime');
await mkdir(base,{recursive:true});
const temp=await mkdtemp(path.join(base,'native-surface-dock-drop-'));
try {
  const entry=path.join(temp,'entry.ts'),output=path.join(temp,'entry.mjs');
  await writeFile(entry,[
    'export * from "../../lab/pilot/native-surface-dock-drop.tsx";',
    'export {DropTargetRegistry} from "../../lcos/huabu/apps/web/src/lcos/drop/dropTargetRegistry.ts";',
    'export {resolveDropIntent} from "../../lcos/huabu/apps/web/src/lcos/drop/dropIntentResolver.ts";',
  ].join('\n'));
  await buildPilotEntry(path.relative(root,entry),output,'browser');
  const module=await import(pathToFileURL(output).href), {createNativeSurfaceDockDropTarget,DropTargetRegistry,resolveDropIntent}=module;
  const provenance=JSON.parse(await readFile(output+'.sources.json','utf8'));
  assert.ok(provenance.resources.some(row=>row.resourcePath==='huabu/apps/web/src/lcos/shell/surfaceDockDrop.ts'));
  const api={},roots={main:'main-canvas',context:'context-canvas',workflow:'workflow-canvas'};
  const workspaces=[
    {id:'main-root',canvasId:'main-canvas',scopeId:'root',preferredSurface:'main',name:'Main Root'},
    {id:'context-root',canvasId:'context-canvas',scopeId:'root',preferredSurface:'context',name:'Context Root'},
    {id:'workflow-root',canvasId:'workflow-canvas',scopeId:'root',preferredSurface:'workflow',name:'Workflow Root'},
    {id:'workflow-child',canvasId:'child-canvas',scopeId:'child',preferredSurface:'workflow',name:'Child'},
  ];
  let live={projectId:'p',canvasId:'child-canvas',api,ready:true,surfaceCanvasId:roots,context:{projectId:'p',workspaces}};
  let box={left:10,top:20,width:80,height:44},front,clicks=0;
  const button={isConnected:true,disabled:false,closest:()=>null,getBoundingClientRect:()=>box,
    contains:item=>item===button,click:()=>clicks++,ownerDocument:{
      defaultView:{getComputedStyle:()=>({display:'block',visibility:'visible'})},elementsFromPoint:()=>[front],
    }};
  button.closest=()=>null;front=button;
  const payload={kind:'objects',objects:[{entityType:'artifact',entityId:'a',artifactId:'a',artifactViewId:'v',revisionId:'r'}]};
  for(const surface of ['main','context','workflow']){
    const target=createNativeSurfaceDockDropTarget(surface,button,()=>live);
    assert.equal(target.targetId,'native-surface-dock:'+surface);
    assert.equal(module.nativeSurfaceForDropTargetId(target.targetId),surface);
    assert.equal(target.label,{main:'Main',context:'Context',workflow:'Workflow'}[surface]);
    assert.equal(target.enabled,true);
    assert.deepEqual(target.semantic,{kind:'spatial-membership',targetRef:surface==='main'?{kind:'main'}:{kind:surface,id:'root'}});
    const resolved=resolveDropIntent(payload,target);
    assert.equal(resolved.status,'ready');assert.equal(resolved.intent.kind,'assembly-apply');
    assert.deepEqual(resolved.intent.sourceRefs,[{kind:'artifactView',id:'v'}]);
    assert.deepEqual(resolved.intent.targetRef,target.semantic.targetRef);
  }
  assert.equal(module.nativeSurfaceForDropTargetId('workflow'),undefined);
  assert.equal(module.nativeSurfaceForDropTargetId('native-surface-dock:wrong'),undefined);
  const target=createNativeSurfaceDockDropTarget('context',button,()=>live), registry=new DropTargetRegistry();
  registry.register({...target,targetId:'canvas-fallback',priority:1,semantic:{kind:'canvas',targetRef:{kind:'main'}}});
  registry.register(target);
  assert.equal(registry.hitTest({x:20,y:30}).targetId,target.targetId);
  box={left:40,top:60,width:70,height:42};
  assert.deepEqual(registry.get(target.targetId).rect,box,'registry reads current button geometry');
  button.disabled=true;
  assert.equal(target.enabled,false);
  assert.equal(registry.hitTest({x:50,y:70}).targetId,target.targetId,'disabled button remains opaque to canvas fallback');
  assert.equal(resolveDropIntent(payload,registry.get(target.targetId)).status,'ineligible');
  button.disabled=false;
  const overlay={closest:()=>null};front=overlay;
  assert.equal(target.acceptsPoint({x:50,y:70}),false,'covered Dock does not receive through overlay');
  front=button;
  const original=live;
  live={...original,api:{}};
  assert.equal(target.enabled,false,'same IDs with another native API disable stale receiver');
  live={...original,projectId:'other'};
  assert.equal(target.enabled,false);
  live={...original,surfaceCanvasId:{...roots,context:'child-canvas'}};
  assert.equal(target.enabled,false,'root map changing invalidates the captured target');
  const wrongRoot=createNativeSurfaceDockDropTarget('context',button,()=>live);
  assert.equal(wrongRoot.enabled,false,'Workflow child cannot impersonate Context root');
  live={...original,surfaceCanvasId:{}};
  const unavailable=createNativeSurfaceDockDropTarget('context',button,()=>live);
  assert.equal(unavailable.semantic.kind,'drop-exclusion');assert.equal(unavailable.enabled,false);
  live={...original,context:{projectId:'p',workspaces:[...workspaces,{...workspaces[1],id:'duplicate'}]}};
  assert.equal(createNativeSurfaceDockDropTarget('context',button,()=>live).enabled,false,'ambiguous root mapping is not guessed');
  live=original;button.isConnected=false;
  assert.equal(target.readRect(),undefined);
  assert.equal(clicks,0,'registration never selects a destination or runs navigation');
  console.log(JSON.stringify({passed:true,scope:'actual selected Surface semantic factory + resolver + live target registry; no Core/browser/Provider writes',
    checks:['three exact root addresses, child origin allowed','single objects resolver','explicit target IDs','dynamic DOM rectangle',
    'disabled receiver does not leak to Canvas','real occlusion','stale API/project/root reject','missing and duplicate root reject','no navigation action']}));
}finally{
  assert.ok(path.resolve(temp).startsWith(base+path.sep)&&path.basename(temp).startsWith('native-surface-dock-drop-'));
  await rm(temp,{recursive:true,force:true});
}
