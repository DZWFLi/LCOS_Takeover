import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {installedRoot} from '../lab/pilot/build-pilot.mjs';
const ts=createRequire(path.join(installedRoot,'package.json'))('typescript');
const source=fs.readFileSync('lab/pilot/native-navigation-state.ts','utf8');
const file=ts.createSourceFile('native-navigation-state.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
assert.equal(file.parseDiagnostics.length,0);
const body=file.statements.filter(row=>!ts.isImportDeclaration(row)).map(row=>row.getText(file).replace(/^export /,'')).join('\n');
const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const markerFile=ts.createSourceFile('markers.ts',fs.readFileSync('lab/pilot/native-navigation-markers.ts','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const markerBody=markerFile.statements.filter(row=>!ts.isImportDeclaration(row)).map(row=>row.getText(markerFile).replace(/^export /,'')).join('\n');
const markerJs=ts.transpileModule(markerBody,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const pure=new Function(markerJs+'\nreturn {nativeNavigationRecords,nativeNavigationRecordTarget,sameNativeNavigationTarget};')();
const ref={version:1,entityType:'artifact',entityId:'a',artifactId:'a',artifactViewId:'v',revisionId:'r'};
let viewport={x:10,y:20,zoom:1},nodes=[{id:'n',type:'image',data:{id:'n',lcos_ref:ref,lcos_gui_emphasis:false}}];
const cameras=[],writes=[],calls=[],selectedRemovals=[];const facts={markers:[],graph:{},bindings:[]};
let freshRead=async()=>facts,resolve=async()=>({status:'resolved',target:{}}),locate=async()=>{cameras.push('locate');viewport={x:800,y:600,zoom:1.1};return true;};
let pending=[],mutationHook;
const api={getNodes:()=>nodes,getViewport:()=>viewport,setViewport:async(value,options)=>{cameras.push({value,options});viewport={...value};return true;},
 updateNodeData:(id,patch)=>{writes.push({id,patch});nodes=nodes.map(n=>n.id===id?{...n,data:{...n.data,...patch}}:n);},flushCanvas:async()=> 'saved'};
const canvas={status:'ready',canvasId:'canvas',rfInstance:api,nodes};
const shell={projectId:'project',activeWorkspaceId:'workspace',surfaceCanvasId:{main:'canvas'}};
const host={api,projectId:'project',currentCanvasId:'canvas'};
const dependencies={...pure,useSyncExternalStore:(_subscribe,getSnapshot)=>getSnapshot(),useCanvasStore:{getState:()=>canvas},useLcosShellStore:{getState:()=>shell},
 locateNativeMaterialNodes:(...args)=>locate(...args),readNativeNavigationFacts:(...args)=>freshRead(...args),
 nativeNavigationTarget:(node,_scene,proof)=>node&&!proof?.missingBinding?{projectId:'project',kind:'view',id:node.data.lcos_ref.artifactViewId}:undefined,
 nativeNavigationNodeTarget:(node,_scene,proof)=>node&&!proof?.missingBinding?{projectId:'project',kind:'view',id:node.data.lcos_ref.artifactViewId}:undefined,
 createNativeNavigationMarker:async()=>{calls.push('create');await mutationHook?.();},removeNativeNavigationMarker:async(_scene,id,_current,options)=>{calls.push('remove');selectedRemovals.push({id,options});await mutationHook?.();},
 nativeNavigationMarkerPending:()=>pending,verifyNativeNavigationMarkerPending:async()=>{calls.push('verify');pending=[];return{status:'confirmed',facts};},
 resolveNativeNavigationTarget:(...args)=>resolve(...args),window:{__LCOS_NODE_LAB__:host},setTimeout,clearTimeout};
const state=new Function(...Object.keys(dependencies),js+'\nreturn {nativeNavigationSnapshot,refreshNativeNavigation,locateNativeNavigationNode,returnNativeNavigationView,interruptNativeNavigation,toggleNativeNodeEmphasis,toggleNativeNavigationPin,verifyNativeNavigationPending,LCOSUseNativeNavigationVisibility,adoptNativeNavigationFacts,adoptNativeNavigationLayout,createNativeNavigationProjectReader,navigationMarkersForNode,syncNativeNavigationPending};')(...Object.values(dependencies));
const flush=()=>new Promise(r=>setImmediate(r));
const reset=async()=>{freshRead=async()=>facts;resolve=async()=>({status:'resolved',target:{}});state.refreshNativeNavigation();await flush();cameras.length=0;};
try{
 await reset();assert.equal(state.LCOSUseNativeNavigationVisibility('n'),false);const start={...viewport};await state.locateNativeNavigationNode('n');assert.deepEqual(cameras,['locate']);
 assert.equal(state.nativeNavigationSnapshot().arrival.nodeId,'n');assert.deepEqual(state.nativeNavigationSnapshot().returning.viewport,start);
 assert.equal(state.LCOSUseNativeNavigationVisibility('n'),true);assert.equal(state.LCOSUseNativeNavigationVisibility('other'),false);
 const priorReturn=state.nativeNavigationSnapshot().returning,priorArrival=state.nativeNavigationSnapshot().arrival;
 assert.equal(state.adoptNativeNavigationFacts(state.nativeNavigationSnapshot().scene,facts),true);
 assert.equal(state.nativeNavigationSnapshot().returning,priorReturn);assert.equal(state.nativeNavigationSnapshot().arrival,priorArrival);
 assert.deepEqual(cameras,['locate'],'Refreshing a fixed directory cannot move the camera or consume its return point');
 const layoutFacts={...facts,markers:[{id:'fixed-a'},{id:'fixed-b'}]},layoutScene=state.nativeNavigationSnapshot().scene;
 state.adoptNativeNavigationFacts(layoutScene,layoutFacts);
 assert.equal(state.adoptNativeNavigationLayout(layoutScene,['fixed-b','unknown','fixed-b','fixed-a'],true),true);
 assert.deepEqual(state.nativeNavigationSnapshot().unplacedMarkerIds,['fixed-a','fixed-b']);
 assert.equal(state.nativeNavigationSnapshot().returning,priorReturn);assert.equal(state.nativeNavigationSnapshot().arrival,priorArrival);
 const stableLayout=state.nativeNavigationSnapshot();state.adoptNativeNavigationLayout(layoutScene,['fixed-a','fixed-b'],true);
 assert.equal(state.nativeNavigationSnapshot(),stableLayout,'Equivalent presentation does not publish a render loop');
 shell.activeWorkspaceId='other-workspace';assert.equal(state.adoptNativeNavigationLayout(layoutScene,[],false),false);
 assert.equal(state.nativeNavigationSnapshot(),stableLayout);shell.activeWorkspaceId='workspace';
 assert.deepEqual(cameras,['locate']);assert.deepEqual(writes,[]);assert.deepEqual(calls,[]);
 console.log('Layout: canonical dedup, equivalent-read stability, exact scene ownership and independent camera/arrival/return PASS');
 await state.returnNativeNavigationView();assert.deepEqual(viewport,start);assert.equal(state.nativeNavigationSnapshot().returning,undefined);
 assert.equal(state.LCOSUseNativeNavigationVisibility('n'),false);
 assert.deepEqual(writes,[]);assert.deepEqual(calls,[],'Locate/arrival/return do not create fixed markers or write GUI/business data');

 await reset();assert.deepEqual(state.nativeNavigationSnapshot().unplacedMarkerIds,[]);assert.equal(state.nativeNavigationSnapshot().layoutIncomplete,false);
 let release;freshRead=()=>new Promise(r=>{release=r;});const cancelled=state.locateNativeNavigationNode('n');
 assert.equal(state.LCOSUseNativeNavigationVisibility('n'),true);
 state.interruptNativeNavigation();release(facts);await cancelled;assert.ok(!cameras.includes('locate'),'Manual Canvas input interrupts the old asynchronous locate');
 assert.equal(state.nativeNavigationSnapshot().arrival,undefined);
 assert.equal(state.LCOSUseNativeNavigationVisibility('n'),false);

 await reset();let changedRead;freshRead=()=>new Promise(r=>{changedRead=r;});const stale=state.locateNativeNavigationNode('n');
 shell.activeWorkspaceId='other-workspace';assert.equal(state.LCOSUseNativeNavigationVisibility('n'),false);changedRead(facts);await stale;assert.deepEqual(cameras,[],'A workspace change never moves the old API');shell.activeWorkspaceId='workspace';

 await reset();let replacedRead;freshRead=()=>new Promise(r=>{replacedRead=r;});const replaced=state.locateNativeNavigationNode('n');
 nodes=[{...nodes[0],data:{...nodes[0].data,lcos_ref:{...ref,revisionId:'new-r'}}}];replacedRead(facts);await replaced;
 assert.deepEqual(cameras,[],'A replaced exact reference cannot inherit an earlier navigation');nodes=[{...nodes[0],data:{...nodes[0].data,lcos_ref:ref}}];

 await reset();resolve=async()=>({status:'unresolved',reason:'target-missing'});await state.locateNativeNavigationNode('n');
 assert.deepEqual(cameras,[]);assert.match(state.nativeNavigationSnapshot().notice,/目标已不可用/);

 await reset();let resolveRelease;resolve=()=>new Promise(r=>{resolveRelease=r;});
 const rebound=state.locateNativeNavigationNode('n');await flush();freshRead=async()=>({...facts,missingBinding:true});
 resolveRelease({status:'resolved',target:{}});await rebound;assert.deepEqual(cameras,[],'A binding replaced during resolve is checked again before moving the original camera');

 await reset();await state.locateNativeNavigationNode('n');const oldSetter=api.setViewport;let finishReturn;
 api.setViewport=(value,options)=>options?.duration===180?new Promise(r=>{finishReturn=r;}):oldSetter(value,options);
 const returning=state.returnNativeNavigationView();assert.equal(state.nativeNavigationSnapshot().cameraMode,'return');
 assert.equal(state.LCOSUseNativeNavigationVisibility('n'),false,'Return navigation does not force the departure target to render');
 state.interruptNativeNavigation();finishReturn(true);await returning;api.setViewport=oldSetter;
 assert.equal(state.nativeNavigationSnapshot().navigating,undefined);assert.equal(state.nativeNavigationSnapshot().returning.nodeId,'n','An interrupted return does not consume the departure view');

 pending=[{kind:'create',nodeId:'n'}];await reset();assert.equal(state.nativeNavigationSnapshot().pending,true);
 await state.verifyNativeNavigationPending();assert.equal(state.nativeNavigationSnapshot().pending,false);assert.deepEqual(calls,['verify'],'An unknown result remains checkable after returning to the scene, using reads rather than a repeated create');

 await reset();await state.locateNativeNavigationNode('n');
 const journey=state.nativeNavigationSnapshot(),reader=state.createNativeNavigationProjectReader(journey.scene);
 let quietRelease,quietReads=0;freshRead=async()=>{quietReads++;if(quietReads===1)await new Promise(resolve=>{quietRelease=resolve;});return {...facts,markers:[{id:'external-'+quietReads}]};};
 reader.refresh();reader.refresh();reader.refresh();assert.equal(quietReads,1);
 assert.equal(state.nativeNavigationSnapshot().status,'ready');assert.equal(state.nativeNavigationSnapshot().returning,journey.returning);
 quietRelease();await flush();await flush();assert.equal(quietReads,2,'Several project notifications during one read coalesce into one fresh follow-up');
 assert.equal(state.nativeNavigationSnapshot().facts.markers[0].id,'external-2');assert.equal(state.nativeNavigationSnapshot().returning,journey.returning);
 assert.equal(state.nativeNavigationSnapshot().arrival,journey.arrival);assert.deepEqual(cameras,['locate'],'Project readback cannot consume a journey or move its camera');
 reader.dispose();

 await reset();const busyReader=state.createNativeNavigationProjectReader(state.nativeNavigationSnapshot().scene);
 let mutationRelease,readsWhileBusy=0;mutationHook=()=>new Promise(resolve=>{mutationRelease=resolve;});freshRead=async()=>{readsWhileBusy++;return facts;};
 const pin=state.toggleNativeNavigationPin('n');busyReader.refresh();busyReader.refresh();assert.equal(readsWhileBusy,0,'A shared project event is deferred during the original marker writer');
 mutationRelease();await pin;await flush();assert.equal(readsWhileBusy,2,'Original write readback plus one queued pure GET');mutationHook=undefined;
 assert.deepEqual(cameras,[]);busyReader.dispose();

 await reset();const staleReader=state.createNativeNavigationProjectReader(state.nativeNavigationSnapshot().scene);
 let staleRelease;freshRead=async()=>{await new Promise(resolve=>{staleRelease=resolve;});return {...facts,markers:[{id:'must-not-adopt'}]};};
 staleReader.refresh();staleReader.dispose();const beforeLate=state.nativeNavigationSnapshot();staleRelease();await flush();assert.equal(state.nativeNavigationSnapshot(),beforeLate,'Disposed Host rejects an already resolved old project read');
 const switchedReader=state.createNativeNavigationProjectReader(state.nativeNavigationSnapshot().scene);switchedReader.refresh();shell.activeWorkspaceId='new-owner';staleRelease();await flush();
 assert.equal(state.nativeNavigationSnapshot(),beforeLate,'An old workspace cannot publish into its successor');shell.activeWorkspaceId='workspace';switchedReader.dispose();

 await reset();mutationHook=async()=>{throw Error('explicit save failed');};await state.toggleNativeNavigationPin('n');mutationHook=undefined;
 const ownNotice=state.nativeNavigationSnapshot().notice,errorReader=state.createNativeNavigationProjectReader(state.nativeNavigationSnapshot().scene);
 freshRead=async()=>{throw Error('project update failed');};errorReader.refresh();await flush();assert.equal(state.nativeNavigationSnapshot().notice,ownNotice,'Quiet read failure cannot erase an existing action error');errorReader.dispose();
 await reset();const retryReader=state.createNativeNavigationProjectReader(state.nativeNavigationSnapshot().scene);
 freshRead=async()=>{throw Error('project update failed');};retryReader.refresh();await flush();assert.equal(state.nativeNavigationSnapshot().status,'ready');assert.match(state.nativeNavigationSnapshot().notice,/暂时没有更新/);
 freshRead=async()=>facts;retryReader.refresh();await flush();assert.equal(state.nativeNavigationSnapshot().notice,'');retryReader.dispose();
 console.log('Shared project refresh: coalesced GET, busy defer, journey/return/arrival preserved, errors retained, disposed/stale owner rejected PASS');

 await reset();const pinScene=state.nativeNavigationSnapshot().scene,target={projectId:'project',kind:'view',id:'v'};
 const crossMarker={id:'cross',projectId:'project',targetRef:target,scope:'cross-surface',createdAt:'now',updatedAt:'now'},
   localMarker={...crossMarker,id:'local',scope:'local',sourceSurfaceRef:pinScene.surfaceRef};
 state.adoptNativeNavigationFacts(pinScene,{...facts,markers:[crossMarker]});
 assert.deepEqual(state.navigationMarkersForNode('n'),[crossMarker]);await state.toggleNativeNavigationPin('n');
 assert.deepEqual(selectedRemovals.at(-1),{id:'cross',options:{selectedMarker:crossMarker}},'A single cross-surface marker is cancelled only via its exact selected-record proof');
 state.adoptNativeNavigationFacts(pinScene,{...facts,markers:[crossMarker,localMarker]});const beforeManage=calls.length,managed=[];
 await state.toggleNativeNavigationPin('n',canvasId=>managed.push(canvasId));assert.deepEqual(managed,['canvas']);assert.equal(calls.length,beforeManage,'Mixed local/cross markers open the one original directory, without guessed deletion or duplicate creation');
 state.adoptNativeNavigationFacts(pinScene,{...facts,markers:[{...localMarker,sourceSurfaceRef:'workspace:elsewhere'}]});assert.deepEqual(state.navigationMarkersForNode('n'),[],'A different local worksite is not represented as a current pin');
 assert.deepEqual(cameras,[]);console.log('Single cross-surface exact cancellation and mixed-scope one-directory management PASS');

 await reset();await state.locateNativeNavigationNode('n');const pendingJourney=state.nativeNavigationSnapshot();pending=[{kind:'remove',markerId:'completed'}];
 state.adoptNativeNavigationFacts(pendingJourney.scene,facts);assert.equal(state.nativeNavigationSnapshot().pending,true);
 pending=[];state.syncNativeNavigationPending(pendingJourney.scene);assert.equal(state.nativeNavigationSnapshot().pending,false);
 assert.equal(state.nativeNavigationSnapshot().returning,pendingJourney.returning);assert.equal(state.nativeNavigationSnapshot().arrival,pendingJourney.arrival);
 const synced=state.nativeNavigationSnapshot();state.syncNativeNavigationPending(pendingJourney.scene);assert.equal(state.nativeNavigationSnapshot(),synced,'Equivalent real attempt counts do not publish a loop');
 pending=[{kind:'create',nodeId:'n'}];state.syncNativeNavigationPending(pendingJourney.scene);assert.equal(state.nativeNavigationSnapshot().pending,true,'Unknown producer record is never cleared by the UI echo');
 shell.activeWorkspaceId='elsewhere';pending=[];assert.equal(state.syncNativeNavigationPending(pendingJourney.scene),false);assert.equal(state.nativeNavigationSnapshot().pending,true);shell.activeWorkspaceId='workspace';pending=[];
 await reset();const superseded={...facts,markers:[crossMarker]};mutationHook=async()=>{throw Object.assign(Error('acknowledged marker superseded'),{code:'NAVIGATION_MARKER_CHANGED',status:409,outcome:'rejected',facts:superseded});};
 await state.toggleNativeNavigationPin('n');mutationHook=undefined;assert.equal(state.nativeNavigationSnapshot().facts,superseded);assert.equal(state.nativeNavigationSnapshot().pending,false);
 assert.equal(state.nativeNavigationSnapshot().notice,'固定状态刚有变化，已显示最新结果。');assert.deepEqual(cameras,[]);
 console.log('Real pending-count echo clears only settled attempts, keeps unknown/stale-owner protections; acknowledged concurrent change adopts exact fresh facts and one notice PASS');

 await reset();freshRead=async()=>{throw Error('offline');};state.refreshNativeNavigation();await flush();assert.equal(state.nativeNavigationSnapshot().status,'error');
 await state.toggleNativeNodeEmphasis('n');assert.equal(nodes[0].data.lcos_gui_emphasis,true);assert.deepEqual(writes.at(-1),{id:'n',patch:{lcos_gui_emphasis:true}});
 assert.deepEqual(cameras,[],'Core marker read failure cannot turn an independent GUI emphasis into a camera or Run operation');
 console.log(JSON.stringify({passed:true,checks:['Original state service executes with camera-only locate/arrival/return','Manual pan cancels both pending locate and animated return','Workspace, replaced refs and bindings changed during resolve suppress stale camera work','Only the exact current locate/arrival target receives the read-only media visibility hint; cancel, scene change, unrelated nodes and return do not','Unknown writes remain checkable after re-entry without another create','Unavailable exact View is not rebound','Emphasis works independently of marker reads and business workflow'],modelCalls:0,realRuntimeWrites:0}));
}finally{state.refreshNativeNavigation();}
