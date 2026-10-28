import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {installedRoot} from '../lab/pilot/build-pilot.mjs';
const ts=createRequire(path.join(installedRoot,'package.json'))('typescript');
const source=fs.readFileSync('lab/pilot/native-navigation-directory-state.ts','utf8');
const parsed=ts.createSourceFile('directory.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
assert.equal(parsed.parseDiagnostics.length,0);
const body=parsed.statements.filter(row=>!ts.isImportDeclaration(row)).map(row=>row.getText(parsed).replace(/^export /,'')).join('\n');
const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const markerFile=ts.createSourceFile('markers.ts',fs.readFileSync('lab/pilot/native-navigation-markers.ts','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const markerBody=markerFile.statements.filter(row=>!ts.isImportDeclaration(row)).map(row=>row.getText(markerFile).replace(/^export /,'')).join('\n');
const markerJs=ts.transpileModule(markerBody,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const pure=new Function(markerJs+'\nreturn {nativeNavigationNodeMarkers,nativeNavigationRecords,nativeNavigationRecordTarget,isNativeNavigationNodeMarker};')();
const target={projectId:'p',kind:'view',id:'view'};
const marker={id:'marker',projectId:'p',targetRef:target,scope:'cross-surface',createdAt:'now',updatedAt:'now'};
const workspace=id=>({id:'w-'+id,projectId:'p',scopeId:'s-'+id,canvasId:id,name:'画布'+id,preferredSurface:id==='a'?'main':'context'});
const workspaces=['a','b','c'].map(workspace),node=id=>({id:'node-'+id,data:{id:'node-'+id,title:'图片'+id}});
const nodes=Object.fromEntries(['a','b','c'].map(id=>[id,[node(id)]]));
const scenes=Object.fromEntries(['a','b','c'].map(id=>[id,{projectId:'p',canvasId:id,workspaceId:'w-'+id,surfaceRef:id==='a'?'main':'workspace:w-'+id,
  api:{getNodes:()=>nodes[id]}}]));
const place=id=>({key:id,projectId:'p',workspaceId:'w-'+id,canvasId:id,surfaceRef:scenes[id].surfaceRef,targetRef:target,
  nodeTargetRef:target,nodeId:'node-'+id,kind:'node',workspace:workspace(id),scopeTrail:[{id:'s-'+id,projectId:'p',title:'层级'+id,parentScopeId:null}],title:'图片'+id});
let active=scenes.a,facts,places,readHook,resolveHook,pending=[],removeFault=false,headerReturn,selectionHook,returnHook,restoring=false,restoringRoot,
 sceneVisible=true,ownerVisible=true,ownerOverride,immediateSubscriptions=false,navigationBusy=null,changedFault=false;
const calls=[],reads=[],canvasReads=[];
const canvasListeners=new Set(),shellListeners=new Set(),navigationListeners=new Set(),deadlines=new Set();
const subscribe=list=>listener=>{list.add(listener);if(immediateSubscriptions)listener();return()=>list.delete(listener);};
const emit=()=>{for(const list of [canvasListeners,shellListeners,navigationListeners])for(const listener of [...list])listener();};
const assertReleased=()=>{for(const list of [canvasListeners,shellListeners,navigationListeners,deadlines])assert.equal(list.size,0,'Arrival observers/deadline are released');};
const same=(a,b)=>a?.projectId===b?.projectId&&a?.kind===b?.kind&&a?.id===b?.id;
const dependencies={
 ...pure,
 nativeNavigationCandidateCanvasIds:()=>places.map(place=>place.canvasId),
 nativeNavigationCandidates:(_target,_facts,evidence)=>({status:'ready',complete:true,candidates:places.filter(place=>
   evidence.some(canvas=>canvas.canvasId===place.canvasId&&canvas.available!==false&&canvas.nodes?.some(node=>node.id===place.nodeId))),rejected:[]}),
 nativeNavigationMarkerApplies:(m,p)=>m.projectId===p.projectId&&same(m.targetRef,p.targetRef),
 readNativeNavigationFacts:async scene=>{reads.push(scene.canvasId);await readHook?.(scene);return structuredClone(facts);},
 removeNativeNavigationMarker:async(scene,id,current,options)=>{calls.push({remove:id,selected:options.selectedMarker});assert.equal(current(),true);
   if(removeFault){pending=[{kind:'remove',markerId:id}];throw Error('lost receipt');}facts.markers=facts.markers.filter(marker=>marker.id!==id);
   if(changedFault)throw Object.assign(Error('ack superseded'),{code:'NAVIGATION_MARKER_CHANGED',status:409,outcome:'rejected',facts:structuredClone(facts)});},
 nativeNavigationMarkerPending:()=>pending,
 verifyNativeNavigationMarkerPending:async()=>{calls.push({verify:true});pending=[];return{status:'confirmed',facts};},
 resolveNativeNavigationTarget:async()=>{await resolveHook?.();return{status:'resolved',target:{projectId:'p',surfaceRef:'main'}};},
 currentNativeNavigationScene:()=>sceneVisible?active:null,navigationSceneCurrent:scene=>scene===active,
 locateNativeNavigationNode:async id=>{calls.push({locate:id,canvasId:active.canvasId});},
 nativeNavigationSnapshot:()=>({notice:'',busy:navigationBusy,scene:ownerVisible?(ownerOverride??active):null}),
 subscribeNativeNavigation:subscribe(navigationListeners),adoptNativeNavigationFacts:(scene)=>{calls.push({adopt:scene.canvasId});},
 syncNativeNavigationPending:scene=>{calls.push({sync:scene.canvasId,pending:pending.length>0});},sameNavigationTarget:same,
 enterNativeWorkspaceWithReturn:async(project,target,root,restore,options)=>{
   assert.equal(options.preservePriorReturn,true);assert.equal(options.restoreComposerFocus,false,'Directory return owns focus instead of scheduling Composer focus');
   assert.equal(options.isCurrent(),true);assert.equal(project,'p');
   calls.push({enter:target.canvasId,root});const origin=active;headerReturn=async()=>{active=origin;restoring=true;restoringRoot=root;
     try{await returnHook?.();await restore();}finally{restoring=false;}};
   await selectionHook?.(target);active=scenes[target.canvasId];
 },
 nativeWorkspaceSourceRestoring:(projectId,canvasId,root)=>restoring&&active?.projectId===projectId&&active?.canvasId===canvasId
   &&(!root||root.kind===restoringRoot?.kind&&root.id===restoringRoot?.id),
 reportNativeWorkspaceNavigationError:(projectId,sourceCanvasId,destinationCanvasId,root,message)=>{
   calls.push({headerError:{projectId,sourceCanvasId,destinationCanvasId,root,message}});return true;},
 useLcosShellStore:{getState:()=>({projectId:active?.projectId}),subscribe:subscribe(shellListeners)},AbortController,
 useCanvasStore:{getState:()=>({status:'ready',canvasId:active?.canvasId}),subscribe:subscribe(canvasListeners)},
 setTimeout:(callback,ms)=>{const token={callback,ms};deadlines.add(token);return token;},clearTimeout:token=>deadlines.delete(token),
 fetch:async address=>{const id=decodeURIComponent(String(address).split('/').at(-1));canvasReads.push(id);
   return{ok:true,json:async()=>({code:0,data:{id,nodes:nodes[id]}})};},
};
const exports=['navigationDirectorySnapshot','setNavigationDirectoryOpen','refreshNavigationDirectory','setNavigationDirectoryQuery','interruptNavigationDirectory',
 'setNavigationDirectoryScroll','selectNavigationDirectoryMarker','removeNavigationDirectoryMarker','verifyNavigationDirectoryPending','backNavigationDirectoryPlaces','createNativeNavigationDirectoryProjectReader'];
const module=new Function(...Object.keys(dependencies),js+'\nreturn {'+exports.join(',')+'};')(...Object.values(dependencies));
const state=module.navigationDirectorySnapshot;
const flush=async()=>{for(let n=0;n<6;n++)await new Promise(resolve=>setImmediate(resolve));};
async function reset(nextPlaces=[place('a')]){
 module.setNavigationDirectoryOpen(active?.canvasId??'a',false);active=scenes.a;
 facts={markers:[structuredClone(marker)],graph:{project:{id:'p'},workspaces,artifacts:[{id:'artifact',projectId:'p',title:'准确图片'}],
   artifactViews:[{id:'view',artifactId:'artifact'}]},bindings:[]};
 places=nextPlaces;pending=[];removeFault=false;changedFault=false;readHook=undefined;resolveHook=undefined;selectionHook=undefined;headerReturn=undefined;
 sceneVisible=true;ownerVisible=true;ownerOverride=undefined;immediateSubscriptions=false;returnHook=undefined;restoring=false;restoringRoot=undefined;navigationBusy=null;assertReleased();
 calls.length=0;reads.length=0;canvasReads.length=0;module.setNavigationDirectoryOpen('a',true);await flush();
 assert.equal(state().status,'ready');
}
await reset();
assert.equal(state().rows[0].title,'准确图片');assert.equal(state().rows[0].candidates[0].label,'层级a / 画布a');
await module.selectNavigationDirectoryMarker('marker');
assert.deepEqual(calls.filter(call=>call.locate),[{locate:'node-a',canvasId:'a'}]);assert.equal(calls.some(call=>call.enter),false);
assert.equal(state().open,false);

await reset([place('a'),place('b')]);module.setNavigationDirectoryQuery('准确');module.setNavigationDirectoryScroll(91);
await module.selectNavigationDirectoryMarker('marker');assert.equal(state().selectedMarkerId,'marker');
assert.equal(calls.some(call=>call.enter||call.locate),false,'Multiple occurrences require a real user choice');
const selected=state().rows[0].candidates.find(place=>place.canvasId==='b');
await module.selectNavigationDirectoryMarker('marker',selected);
assert.deepEqual(calls.filter(call=>call.enter).map(call=>call.enter),['b']);
assert.deepEqual(calls.filter(call=>call.locate),[{locate:'node-b',canvasId:'b'}]);assert.equal(state().open,false);
await headerReturn();await flush();assert.equal(active.canvasId,'a');assert.equal(state().open,true);
assert.equal(state().query,'准确');assert.equal(state().scroll,91,'The original header return reopens the exact directory address without copying a draft');

await reset([place('b')]);selectionHook=()=>{sceneVisible=false;ownerVisible=false;};
const waitingForOwners=module.selectNavigationDirectoryMarker('marker');await flush();
assert.equal(active.canvasId,'b');assert.equal(calls.some(call=>call.locate),false,'Original route arrival alone cannot use an unregistered API/workspace');
sceneVisible=true;ownerVisible=true;ownerOverride={...scenes.b,api:scenes.a.api};emit();await flush();
assert.equal(calls.some(call=>call.locate),false,'An old navigation owner with the same canvas ID cannot inherit the destination API');
ownerOverride=undefined;emit();await waitingForOwners;
assert.deepEqual(calls.filter(call=>call.locate),[{locate:'node-b',canvasId:'b'}]);assertReleased();

await reset([place('b')]);selectionHook=()=>{ownerVisible=false;};
const cancelWaiting=module.selectNavigationDirectoryMarker('marker');await flush();module.interruptNavigationDirectory();
ownerVisible=true;emit();await cancelWaiting;
assert.equal(calls.some(call=>call.locate),false,'Manual input during API/host registration cancels instead of causing a late camera jump');assertReleased();

await reset([place('b')]);selectionHook=()=>{ownerVisible=false;};
const thirdScene=module.selectNavigationDirectoryMarker('marker');await flush();active=scenes.c;emit();await thirdScene;
assert.equal(calls.some(call=>call.locate),false,'A third ready scene cancels the pending destination registration');assertReleased();

await reset([place('b')]);selectionHook=()=>{ownerVisible=false;};
const expired=module.selectNavigationDirectoryMarker('marker');await flush();
assert.equal(deadlines.size,1);const deadline=[...deadlines][0];assert.equal(deadline.ms,10000);deadline.callback();await expired;
assert.equal(calls.some(call=>call.locate),false);assert.equal(state().error,'原画布还未就绪，可用原返回入口返回后重试。');
assert.equal(state().open,true,'A registration timeout is a visible retry state, never silent success');assertReleased();

await reset([place('b')]);selectionHook=()=>{sceneVisible=false;ownerVisible=false;};
const noApi=module.selectNavigationDirectoryMarker('marker');await flush();[...deadlines][0].callback();await noApi;
assert.equal(state().error,'原画布还未就绪，可用原返回入口返回后重试。');assert.equal(state().open,false);
assert.deepEqual(calls.filter(call=>call.headerError).map(call=>call.headerError),[{projectId:'p',sourceCanvasId:'a',destinationCanvasId:'b',
 root:{kind:'navigation-marker',id:'marker'},message:state().error}], 'A never-registered API reports through the exact original Header Back owner');
assert.equal(calls.some(call=>call.locate),false);assertReleased();

await reset();immediateSubscriptions=true;await module.selectNavigationDirectoryMarker('marker');
assert.equal(calls.filter(call=>call.locate).length,1);assertReleased();

await reset([place('b')]);module.setNavigationDirectoryQuery('保留的搜索');module.setNavigationDirectoryScroll(91);
await module.selectNavigationDirectoryMarker('marker');
module.setNavigationDirectoryOpen('b',true);await flush();module.setNavigationDirectoryOpen('b',false);
returnHook=()=>{sceneVisible=false;ownerVisible=false;};const returnWaiting=headerReturn();await flush();
assert.equal(state().open,false,'Returning route alone does not bind the old source API');
sceneVisible=true;emit();await flush();assert.equal(state().open,false);
ownerVisible=true;emit();await returnWaiting;await flush();
assert.equal(state().open,true);assert.equal(state().query,'保留的搜索');assert.equal(state().scroll,91);
assert.equal(calls.filter(call=>call.enter).length,1,'Return restoration waits without selecting the route a second time');assertReleased();

await reset([place('b')]);await module.selectNavigationDirectoryMarker('marker');returnHook=()=>{ownerVisible=false;};
const cancelledReturn=headerReturn();await flush();restoring=false;emit();await cancelledReturn;
assert.equal(state().open,false,'A discarded original restore frame cannot reopen the directory later');ownerVisible=true;emit();await flush();
assert.equal(state().open,false);assertReleased();

await reset([place('b')]);await module.selectNavigationDirectoryMarker('marker');returnHook=()=>{ownerVisible=false;};
const replacedReturn=headerReturn();await flush();restoringRoot={kind:'navigation-marker',id:'another-marker'};emit();await replacedReturn;
ownerVisible=true;emit();await flush();assert.equal(state().open,false,'Another valid restore frame on the same source cannot inherit the old directory callback');assertReleased();

await reset([place('b')]);await module.selectNavigationDirectoryMarker('marker');returnHook=()=>{ownerVisible=false;};
const gestureReturn=headerReturn();await flush();module.interruptNavigationDirectory();ownerVisible=true;emit();await gestureReturn;
assert.equal(state().open,false,'A manual canvas gesture cancels the pending directory reopen');assertReleased();

await reset([place('b')]);let finish;
readHook=()=>new Promise(resolve=>{finish=resolve;});const late=module.selectNavigationDirectoryMarker('marker');await flush();
module.setNavigationDirectoryOpen('a',false);readHook=undefined;finish();await late;
assert.equal(calls.some(call=>call.enter||call.locate),false,'Closing the original Popover cancels late reads before navigation');

await reset([place('b')]);let panRelease;
readHook=()=>new Promise(resolve=>{panRelease=resolve;});const panCancelled=module.selectNavigationDirectoryMarker('marker');await flush();
module.interruptNavigationDirectory();readHook=undefined;panRelease();await panCancelled;
assert.equal(calls.some(call=>call.enter||call.locate),false,'Manual Canvas input also cancels an unfinished directory locate');

await reset([place('b')]);let arrivalRelease;
readHook=scene=>scene.canvasId==='b'?new Promise(resolve=>{arrivalRelease=resolve;}):undefined;
const arrivalCancelled=module.selectNavigationDirectoryMarker('marker');await flush();assert.equal(active.canvasId,'b');
module.interruptNavigationDirectory();readHook=undefined;arrivalRelease();await arrivalCancelled;
assert.equal(calls.some(call=>call.locate),false,'Manual input after scene arrival prevents a late camera jump');

await reset([place('b')]);
resolveHook=async()=>{places=[];};await module.selectNavigationDirectoryMarker('marker');
assert.equal(calls.some(call=>call.locate),false,'A removed occurrence after resolve never inherits its old node');
assert.equal(state().error,'这个位置已变化，未定位到其他对象。');assert.equal(state().open,true);

await reset([place('b')]);selectionHook=async()=>{active={...scenes.c,projectId:'foreign'};module.setNavigationDirectoryOpen('c',false);};
await module.selectNavigationDirectoryMarker('marker');assert.equal(calls.some(call=>call.locate),false,'A cancelled project/scene transition never pans its later API');

await reset();const prior=structuredClone(facts);await module.removeNavigationDirectoryMarker('marker');
assert.equal(calls.filter(call=>call.remove).length,1);assert.deepEqual(calls.find(call=>call.remove).selected,prior.markers[0]);
assert.deepEqual(facts.graph,prior.graph);assert.deepEqual(facts.bindings,prior.bindings);assert.equal(state().rows.length,0);

await reset();removeFault=true;await module.removeNavigationDirectoryMarker('marker');assert.equal(state().pending,true);
await module.removeNavigationDirectoryMarker('marker');assert.equal(calls.filter(call=>call.remove).length,1,'Unknown deletion never resends');
const navigationCount=calls.filter(call=>call.locate).length;
await module.selectNavigationDirectoryMarker('marker');assert.equal(calls.filter(call=>call.locate).length,navigationCount+1,'Unknown marker writes do not lock independent navigation');
module.setNavigationDirectoryOpen('a',true);await flush();removeFault=false;await module.verifyNavigationDirectoryPending();
assert.equal(calls.filter(call=>call.remove).length,1);assert.equal(calls.filter(call=>call.verify).length,1);assert.equal(state().pending,false);

await reset();changedFault=true;await module.removeNavigationDirectoryMarker('marker');assert.equal(calls.filter(call=>call.remove).length,1);
assert.equal(state().rows.length,0);assert.equal(state().error,'固定状态刚有变化，已显示最新结果。');assert.equal(state().status,'ready');
assert.equal(state().pending,false);assert.ok(calls.some(call=>call.adopt));assert.deepEqual(calls.filter(call=>call.sync).at(-1),{sync:'a',pending:false});

await reset([place('a'),place('b')]);module.setNavigationDirectoryQuery('准确');module.setNavigationDirectoryScroll(81);
await module.selectNavigationDirectoryMarker('marker');assert.equal(state().selectedMarkerId,'marker');
const quiet=module.createNativeNavigationDirectoryProjectReader(active),beforeQuiet=state();let quietRelease,quietReads=0;
readHook=async()=>{quietReads++;if(quietReads===1)await new Promise(resolve=>{quietRelease=resolve;});};
facts.graph.artifacts[0].title='外部新标题';quiet.refresh();quiet.refresh();quiet.refresh();
assert.equal(state().status,'ready');assert.equal(state().open,true);assert.equal(state().rows,beforeQuiet.rows,'Quiet reading preserves the rendered list instead of replacing it with a loading state');
quietRelease();await flush();assert.equal(quietReads,2);assert.equal(state().rows[0].title,'外部新标题');
assert.equal(state().selectedMarkerId,'marker');assert.equal(state().query,'准确');assert.equal(state().scroll,81);
assert.equal(calls.some(call=>call.enter||call.locate||call.remove),false,'External project invalidation performs no camera, route or marker mutation');
readHook=async()=>{throw Error('transport unavailable');};quiet.refresh();await flush();assert.equal(state().status,'ready');assert.equal(state().rows[0].title,'外部新标题');assert.match(state().error,/暂时没有更新/);
readHook=undefined;quiet.refresh();await flush();assert.equal(state().error,'');assert.equal(state().selectedMarkerId,'marker');
facts.markers=[];quiet.refresh();await flush();assert.equal(state().rows.length,0);assert.equal(state().selectedMarkerId,undefined,'An externally removed record cannot leave an obsolete selection page');
assert.equal(state().query,'准确');assert.equal(state().scroll,81);quiet.dispose();assertReleased();

await reset();const delayed=module.createNativeNavigationDirectoryProjectReader(active);let delayedRelease,delayedReads=0;
readHook=async()=>{delayedReads++;await new Promise(resolve=>{delayedRelease=resolve;});};
navigationBusy='node-a';delayed.refresh();delayed.refresh();assert.equal(delayedReads,0);
navigationBusy=null;emit();await flush();assert.equal(delayedReads,1,'A project event deferred by the original navigation writer drains after its published idle state');
module.setNavigationDirectoryOpen('a',false);const closed=state();delayedRelease();await flush();assert.equal(state(),closed,'Closing the original Popover cancels a late quiet response');delayed.dispose();assertReleased();

await reset();const oldOwner=module.createNativeNavigationDirectoryProjectReader(active);readHook=async()=>new Promise(resolve=>{delayedRelease=resolve;});oldOwner.refresh();await flush();
active=scenes.b;emit();const switched=state();delayedRelease();await flush();assert.equal(state(),switched,'A different scene/API cannot receive the old directory response');oldOwner.dispose();assertReleased();

module.setNavigationDirectoryOpen(active?.canvasId??'a',false);
console.log(JSON.stringify({passed:true,scope:'actual directory state source with controlled canonical/camera/header ports',checks:[
 'Current-scene locate delegates to the original camera only','Multiple occurrences wait for an exact choice',
 'Cross-scene entry delegates to original Ke/Header return and reopens the saved query/scroll',
 'Ke route arrival waits for the exact workspace/API and mounted navigation owner; cancellation/third scene/timeout release every observer',
 'Source return waits for its new owner, preserves saved query/scroll across other directory operations, and respects original restore-frame cancellation',
 'Late close, cancelled project/scene, and replaced occurrence never pan an old target',
 'Removal passes the exact selected marker and preserves other facts; unknown outcome is GET-only checkable',
 'An unknown write does not bind or lock independent GUI navigation',
 'Quiet project updates coalesce GETs while preserving open/query/scroll/valid position choice; failures retain old rows, no route or camera operation',
 'Busy writer defers one fresh directory GET; closed/disposed/changed scene rejects late results'],realRuntimeWrites:0,modelCalls:0}));
