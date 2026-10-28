import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {buildPilotEntry,installedRoot} from '../lab/pilot/build-pilot.mjs';
import {parseOriginalDonorScript as parse} from '../lab/agent-node-transform.mjs';
const root=path.resolve(import.meta.dirname,'..'),dep=createRequire(path.join(installedRoot,'huabu/apps/web/package.json'));
const React=dep('react'),{createRoot}=dep('react-dom/client'),{create}=dep('zustand'),{Window}=dep('happy-dom');
const ts=createRequire(path.join(installedRoot,'package.json'))('typescript');
const output=path.join(root,'output/原生ColorPin整合_20261017h/原库放置恢复验证',new Date().toISOString().replaceAll(':','-').replace('.','-'));
const temp=await fs.mkdtemp(path.join(root,'.runtime/native-library-placement-state-'));
const report={passed:false,scope:'actual UnlimitedMode mO initializer + real Zustand + production placement-state + extracted real Collection Detail + whole Artifact Tools React module and production clients; transport/native publication leaves controlled',
  coreWrites:0,candidateWrites:0,models:0,cases:[]};
const globals=['window','document','navigator','HTMLElement','Event','MouseEvent','IS_REACT_ACT_ENVIRONMENT','fetch'];
const previous=Object.fromEntries(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const dom=new Window({url:'http://127.0.0.1:1/'});let mounted;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const transpile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const evaluate=(text,env={})=>{const module={exports:{}};new Function('require','exports',...Object.keys(env),transpile(text))(
  name=>dep(name),module.exports,...Object.values(env));return module.exports};
try{
  for(const key of globals.slice(0,6))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='window'?dom:dom[key]});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const original=await fs.readFile(path.join(root,'reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-D4wysAbz.js'),'utf8');
  const ast=parse(original,'UnlimitedModeToggle-D4wysAbz.js');
  const declaration=ast.body.flatMap(node=>node.declarations??[]).find(node=>node.id?.name==='mO');assert.ok(declaration);
  assert.equal(ast.body.flatMap(node=>node.type==='ExportNamedDeclaration'?node.specifiers:[]).find(node=>node.exported?.name==='aa')?.local.name,'mO');
  assert.equal(declaration.init.callee.name,'tn');
  let cancelledVendorSearches=0;
  const store=new Function('tn','$e','is','let $n=0;return '+original.slice(declaration.init.start,declaration.init.end))(
    create,{SPACE_TYPE_PRIVATE:'private'},()=>{cancelledVendorSearches++});
  const originalOpen=store.getState().open,originalClose=store.getState().close;
  // Only network leaf replacement: every Library lifecycle function stays the
  // actual initializer function and the one real Zustand store remains owner.
  store.setState({fetchFolders:async()=>[]});
  const stateSource=await fs.readFile(path.join(root,'lab/pilot/native-library-placement-state.tsx'),'utf8'),state=evaluate(stateSource);
  const {nativeLibraryPlacementAddress:address,readNativeLibraryPlacementAttempt:read,beginNativeLibraryPlacementAttempt:begin,
    settleNativeLibraryPlacementAttempt:settle}=state;
  const base={projectId:'project',canvasId:'canvas',workspaceId:'workspace'};
  const collection=address({...base,source:{kind:'collection',collectionId:'collection'}});
  const exact=address({...base,source:{kind:'material',artifactId:'artifact',revisionId:'r1',fileRecordId:'f1',artifactViewId:'v1'}});
  const keys=[collection,exact,address({...base,projectId:'other',source:{kind:'collection',collectionId:'collection'}}),
    address({...base,canvasId:'other',source:{kind:'collection',collectionId:'collection'}}),address({...base,workspaceId:'other',source:{kind:'collection',collectionId:'collection'}}),
    address({...base,source:{kind:'material',artifactId:'artifact',revisionId:'r2',fileRecordId:'f2',artifactViewId:'v1'}}),
    address({...base,source:{kind:'material',artifactId:'artifact',revisionId:'r1',fileRecordId:'f1',artifactViewId:'v2'}})];
  assert.equal(new Set(keys).size,keys.length);assert.equal(read(null,collection),null);assert.equal(begin(store,null,false),null);
  const first=begin(store,collection,false);assert.ok(first);assert.equal(first.readOnly,false);assert.equal(read(store,collection).status,'pending');
  const beforeClose=read(store,collection);store.getState().open();store.getState().close();store.getState().open();
  assert.equal(store.getState().open,originalOpen);assert.equal(store.getState().close,originalClose);assert.equal(read(store,collection),beforeClose);
  assert.equal(begin(store,collection,false),null);assert.equal(begin(store,collection,true),null);
  const material=begin(store,exact,false);assert.ok(material);assert.equal(read(store,collection),beforeClose);
  settle(store,collection,first,'unconfirmed');assert.equal(read(store,collection).status,'unconfirmed');
  store.getState().setSearchKeyword('other');await store.getState().setActiveSpace('team');store.getState().close();store.getState().open();
  const check=begin(store,collection,false);assert.ok(check);assert.equal(check.readOnly,true,'unknown survives original search/space/open/close and forces GET-only');
  settle(store,collection,first,'placed');assert.equal(read(store,collection).operation,check,'late original success cannot clear current check');
  settle(store,collection,check,'rejected');assert.equal(read(store,collection).status,'unconfirmed');
  const checked=begin(store,collection,true);settle(store,collection,checked,'already-present');assert.equal(read(store,collection),null);
  const replacement=begin(store,collection,false);settle(store,collection,check,'unconfirmed');assert.equal(read(store,collection).operation,replacement);
  settle(store,collection,replacement,'rejected');assert.equal(read(store,collection),null,'initial definite rejection may clear');
  settle(store,exact,material,'placed');assert.equal(read(store,exact),null);
  report.cases.push('real mO/Zustand owner retains pending/unknown through original Library close/open/search/space changes, blocks pending reentry, forces unknown read-only; material/exact-version/project/Canvas/Workspace addresses remain separate');
  report.cases.push('operation identity prevents stale success/failure from clearing a newer attempt; rejected check stays unknown, definite first rejection clears, confirmed result clears exact address only');

  const outlet=document.createElement('div');document.body.append(outlet);let renders=0,seenStore;
  const subscribed=[];
  function Probe(){renders++;seenStore=state.useNativeLibraryPlacementStore();const value=state.useNativeLibraryPlacementAttempt(seenStore,collection);subscribed.push(value);return React.createElement('span',null,value?.status??'none')}
  mounted=createRoot(outlet);await React.act(async()=>{mounted.render(React.createElement(state.NativeLibraryPlacementProvider,{store},React.createElement(Probe)));await tick()});
  assert.equal(seenStore,store);const idleRenders=renders;
  await React.act(async()=>{store.setState({searchKeyword:'unrelated search'});await tick()});assert.equal(renders,idleRenders,'stable snapshot does not rerender on unrelated original store updates');
  let hooked;await React.act(async()=>{hooked=begin(store,collection,false);await tick()});assert.equal(document.body.textContent,'pending');
  const stable=read(store,collection),pendingRenders=renders;
  await React.act(async()=>{store.getState().clearSearch();await tick()});assert.equal(read(store,collection),stable);assert.equal(renders,pendingRenders);
  await React.act(async()=>{settle(store,collection,hooked,'placed');await tick()});assert.equal(document.body.textContent,'none');
  await React.act(async()=>{mounted.unmount();mounted=null});
  report.cases.push('production Provider uses exact original mO store; useSyncExternalStore gets stable object snapshots and actual React subscriptions without loops/unrelated rerenders');

  const entry=path.join(temp,'ports.ts'),bundle=path.join(temp,'ports.mjs');await fs.writeFile(entry,
    `export * from ${JSON.stringify(path.join(root,'lab/pilot/native-library-collection-placement.ts'))};
export * from ${JSON.stringify(path.join(root,'lab/pilot/native-assembly-policy.ts'))};
export {nativeLibraryEntry} from ${JSON.stringify(path.join(root,'lab/pilot/native-library-entry.ts'))};
export {placeNativeLibraryMaterial} from ${JSON.stringify(path.join(root,'lab/pilot/native-material-placement-client.ts'))};
export {readAssemblyArtifactMedia} from ${JSON.stringify(path.join(root,'lcos/huabu/apps/web/src/lcos/professional/assemblyArtifactMedia.ts'))};
export {collectionPreviewMembers,validateCollectionMembersSnapshot} from ${JSON.stringify(path.join(root,'lcos/apps/web-gen2/src/backend/collections.ts'))};`);
  await buildPilotEntry(path.relative(root,entry),bundle);const ports=await import(pathToFileURL(bundle));
  const detailSource=await fs.readFile(path.join(root,'lab/pilot/native-library-contexts.tsx'),'utf8');
  const program=ts.createSourceFile('actual-detail.tsx',detailSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const get=name=>{const node=program.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(node,name);return node.getText(program)};
  // The original helper now lives in its shared production module; do not duplicate it in the extracted component harness.
  const nativeEntry=ports.nativeLibraryEntry;
  assert.equal(typeof nativeEntry,'function');
  const uiInput={...base,collectionId:'actual-component-collection'},uiAddress=address({...base,source:{kind:'collection',collectionId:uiInput.collectionId}});
  const uiCollection={id:uiInput.collectionId,projectId:base.projectId,title:'Original Library retained recovery',createdAt:'2026-10-17',updatedAt:'2026-10-17'};
  const labels=['可用成员','暂不可读成员','已缺失成员','已变化成员'];
  const snapshot=ports.validateCollectionMembersSnapshot({collection:uiCollection,
    members:labels.map((_,i)=>({collectionId:uiInput.collectionId,relationId:'relation-'+i,addedAt:'2026-10-17',memberRef:{type:'artifact',id:'member-'+i}})),
    previews:labels.map((label,i)=>({type:'artifact',id:'member-'+i,label,kind:'text',availability:['available','unreadable','missing','stale'][i]}))},base.projectId,uiInput.collectionId);
  let nodes=[],canonical=false,postCount=0,flushes=0,reply;
  const requests=[],api={getNodes:()=>nodes,getEdges:()=>[],getViewport:()=>({x:0,y:0,zoom:1}),
    flushCanvas:async()=>{flushes++;return 'saved'},findMaterialPlacement:()=>({x:500,y:300}),
    synchronizeCollectionCarrier:async({node})=>{nodes=[node];canvas.nodes=nodes;return{ok:true}}};
  const shell={projectId:base.projectId,activeWorkspaceId:base.workspaceId,activeSurface:'main',surfaceCanvasId:{main:base.canvasId}},canvas={canvasId:base.canvasId,status:'ready',rfInstance:api,nodes};
  const shellHook=select=>select(shell);shellHook.getState=()=>shell;const canvasHook=select=>select(canvas);canvasHook.getState=()=>canvas;
  window.__LCOS_NODE_LAB__={api,projectId:base.projectId,currentCanvasId:base.canvasId};
  const projection=()=>({project_id:base.projectId,canvas_id:base.canvasId,workspace_id:base.workspaceId,collection_id:uiInput.collectionId,
    state:canonical?'present':'absent',presentation_received:canonical,provider_execution_started:false,
    binding:canonical?{projectId:base.projectId,canvasId:base.canvasId,spatialKind:'node',spatialId:'only-pile',entityType:'collection',entityId:uiInput.collectionId}:null,
    node:canonical?{id:'only-pile',type:'pile',position:{x:500,y:300},data:{id:'only-pile',lcos_native_collection:true,memberIds:[],lcos_collection_ref:uiInput}}:null});
  globalThis.fetch=async(url,init={})=>{const method=init.method??'GET';requests.push({method,url:String(url)});
    if(method==='POST'){postCount++;assert.equal(postCount,1,'unknown must never issue a second placement POST');return new Promise((resolve,reject)=>{reply={resolve,reject}})}
    return{ok:true,json:async()=>({code:0,data:projection()})}};
  const env={...state,useLcosShellStore:shellHook,useCanvasStore:canvasHook,nativeLibraryEntry:nativeEntry,useNativeLibraryInputOrigin:()=>null,
    createLcosCoreSession:()=>({collections:{members:async()=>snapshot}}),...Object.fromEntries(['useEffect','useMemo','useRef','useState'].map(key=>[key,React[key]])),
    placeNativeLibraryCollection:ports.placeNativeLibraryCollection,readNativeLibraryCollectionProjection:ports.readNativeLibraryCollectionProjection,
    isNativeLibraryCollectionCarrier:ports.isNativeLibraryCollectionCarrier,collectionPreviewMembers:ports.collectionPreviewMembers,
    locateNativeMaterialNodes:()=>{throw new Error('No camera command expected')},buttonClass:'original-slot-button'};
  const Detail=evaluate(get('LCOSNativeLibraryCollectionDetail')+'\nexports.Detail=LCOSNativeLibraryCollectionDetail;',env).Detail;
  const detail={asset:{lcos_library_entry:{projectId:base.projectId,item:{schemaVersion:1,kind:'collection',entityRef:{type:'collection',id:uiInput.collectionId},title:uiCollection.title,usageCount:0}}}};
  const Preview=({bodySlot,metaSlot,actionsSlot})=>React.createElement('section',{'data-original-ts-slot-fixture':true},metaSlot,bodySlot,actionsSlot);
  const render=async()=>{store.getState().open();mounted=createRoot(outlet);await React.act(async()=>{mounted.render(React.createElement(state.NativeLibraryPlacementProvider,{store},React.createElement(Detail,{detail,NativePreview:Preview})));await tick()})};
  const close=async()=>{await React.act(async()=>{store.getState().close();mounted.unmount();mounted=null;await tick()})};
  const button=label=>[...document.querySelectorAll('button')].find(node=>node.textContent===label);
  const click=async label=>{const node=button(label);assert.ok(node&&!node.disabled,label);await React.act(async()=>{node.dispatchEvent(new MouseEvent('click',{bubbles:true}));await tick()})};
  await render();for(const label of labels)assert.ok(document.body.textContent.includes(label));assert.equal(document.querySelectorAll('li').length,4);
  await click('放到画布');assert.equal(postCount,1);assert.equal(read(store,uiAddress).status,'pending');await close();await render();
  assert.equal(button('放到画布'),undefined);assert.ok(button('核对放置结果')?.disabled,'remount sees original pending and cannot POST/check concurrently');assert.equal(postCount,1);
  await React.act(async()=>{reply.reject(new Error('Controlled lost response'));await tick()});assert.equal(read(store,uiAddress).status,'unconfirmed');
  assert.ok(button('核对放置结果')&&!button('核对放置结果').disabled);assert.equal(nodes.length,0);
  await click('核对放置结果');assert.equal(postCount,1);assert.equal(flushes,1);assert.equal(read(store,uiAddress).status,'unconfirmed');
  await close();await render();assert.equal(button('放到画布'),undefined);assert.ok(button('核对放置结果')&&!button('核对放置结果').disabled);
  canonical=true;await click('核对放置结果');assert.equal(postCount,1);assert.equal(flushes,1);assert.equal(nodes.length,1);assert.equal(nodes[0].id,'only-pile');
  assert.equal(read(store,uiAddress),null);assert.ok(button('定位到画布'));
  report.cases.push('actual Collection Detail keeps all four member availability states and original action slot; close/reopen while POST pending blocks another POST, original lost result becomes shared unknown');
  report.cases.push('actual Detail unknown survives another close/reopen; absent GET stays unknown, present GET publishes one original pile and clears exact attempt, total POST1/flush1 and no camera operation');
  report.component={requests,postCount,flushes,finalNodes:nodes.map(node=>({id:node.id,type:node.type}))};
  await close();
  const artifact=await fs.readFile(path.join(root,'lab/pilot/native-assembly-ui.tsx'),'utf8');
  const materialProgram=ts.createSourceFile('actual-material.tsx',artifact,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const tools=materialProgram.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='LCOSNativeAssemblyTools');assert.ok(tools);
  const materialText=tools.getText(materialProgram);assert.ok(materialText.includes("source: { kind: 'material', artifactId:"));
  for(const field of ['revisionId: ready.item.presentedRevisionId','fileRecordId: ready.fileRecordId','artifactViewId: ready.item.entityRef.viewId'])assert.ok(materialText.includes(field),field);
  for(const method of ['useNativeLibraryPlacementStore','useNativeLibraryPlacementAttempt','beginNativeLibraryPlacementAttempt','settleNativeLibraryPlacementAttempt'])assert.ok(materialText.includes(method),method);
  const artifactWithoutImports=materialProgram.statements.filter(node=>!ts.isImportDeclaration(node)).map(node=>node.getText(materialProgram)).join('\n').replaceAll('import.meta.env','({})');
  const artifactId='actual-component-artifact',revisionId='selected-r1',fileRecordId='selected-f1',receiverView='pinned-receiver-r1';
  const artifactRow={id:artifactId,projectId:base.projectId,kind:'text',title:'Exact selected text',currentRevisionId:revisionId,availability:'available'};
  const revisionRow={id:revisionId,artifactId,fileRecordId,status:'current',contentHash:'existing-fixture-content-proof',createdAt:'2026-10-17'};
  const fileRow={id:fileRecordId,projectId:base.projectId,mimeType:'text/plain',availability:'current',observedHash:revisionRow.contentHash};
  const graph={project:{id:base.projectId},artifacts:[artifactRow],artifactRevisions:[revisionRow],fileRecords:[fileRow],
    artifactViews:['origin-v1','origin-v2'].map(id=>({id,artifactId,revisionId,scopeId:'scope'})),scopes:[{id:'scope',projectId:base.projectId,kind:'root'}]};
  const materialSession={projects:{getProjectGraph:async()=>graph},artifacts:{listArtifactRevisions:async()=>[revisionRow],
    getArtifactDetail:async()=>({artifact:artifactRow,currentRevisionId:revisionId}),getFileRecordContent:async()=>new Blob(['selected full text'],{type:'text/plain'})}};
  nodes=[];canvas.nodes=nodes;let materialCanonical=false,materialPosts=0,materialFlushes=0,materialReply,navigationCancels=0;
  api.flushCanvas=async()=>{materialFlushes++;return 'saved'};
  api.synchronizeMaterialProjection=async({node})=>{nodes=[node];canvas.nodes=nodes;return{ok:true}};
  window.__LCOS_NODE_LAB__={projectId:base.projectId,currentCanvasId:base.canvasId,api};
  const materialRequests=[];
  const materialProjection=()=>({project_id:base.projectId,canvas_id:base.canvasId,workspace_id:base.workspaceId,artifact_id:artifactId,
    revision_id:revisionId,file_record_id:fileRecordId,state:materialCanonical?'present':'absent',provider_execution_started:false,artifact_view_id:receiverView,
    binding:materialCanonical?{projectId:base.projectId,canvasId:base.canvasId,spatialKind:'node',spatialId:'only-material',entityType:'view',entityId:receiverView}:null,
    node:materialCanonical?{id:'only-material',type:'text',position:{x:500,y:300},data:{id:'only-material',text:'selected full text',
      lcos_ref:{version:1,entityType:'view',entityId:receiverView,artifactId,artifactViewId:receiverView,revisionId}}}:null});
  globalThis.fetch=async(url,init={})=>{const method=init.method??'GET';materialRequests.push({url:String(url),method});
    if(method==='POST'){materialPosts++;assert.equal(materialPosts,1,'material remount unknown must not create a second POST');return new Promise((resolve,reject)=>{materialReply={resolve,reject}})}
    return{ok:true,json:async()=>({code:0,data:materialProjection()})}};
  const MaterialModule=evaluate(artifactWithoutImports,{...state,...Object.fromEntries(['useEffect','useMemo','useRef','useState','useSyncExternalStore'].map(key=>[key,React[key]])),
    useLcosShellStore:shellHook,useCanvasStore:canvasHook,useNativeLibraryInputOrigin:()=>null,createLcosCoreSession:()=>materialSession,
    nativeAssemblyItem:ports.nativeAssemblyItem,nativeAssemblyVersion:ports.nativeAssemblyVersion,verifyNativeAssemblyVersion:ports.verifyNativeAssemblyVersion,
    sameNativeAssemblyInput:ports.sameNativeAssemblyInput,readAssemblyArtifactMedia:ports.readAssemblyArtifactMedia,
    placeNativeLibraryMaterial:ports.placeNativeLibraryMaterial,cancelNativeMaterialNavigation:()=>{navigationCancels++},
    locateNativeMaterialNodes:()=>{throw new Error('No material camera operation expected')},requestNativeMaterialView:()=>{throw new Error('No Viewer action expected')}});
  const detailFor=viewId=>({asset:{id:artifactId,name:'Exact selected text',asset_type:4,lcos_projection:{project_id:base.projectId,artifact_id:artifactId,
    artifact_view_id:viewId,presented_revision_id:revisionId,file_record_id:fileRecordId,content_available:true,referenceable:true,
    assembly_item:{schemaVersion:1,kind:'artifact',entityRef:{type:'artifact',id:artifactId,viewId},title:'Exact selected text',presentedRevisionId:revisionId,usageCount:0}}}});
  const detailA=detailFor('origin-v1'),detailB=detailFor('origin-v2');
  const materialAddress=viewId=>address({...base,source:{kind:'material',artifactId,revisionId,fileRecordId,artifactViewId:viewId}});
  const NativeButton=props=>React.createElement('button',props);
  let transitionTrace=null;
  const MaterialPreview=({detail,lcosActions})=>{const viewId=detail.asset.lcos_projection.artifact_view_id;
    if(transitionTrace)transitionTrace.push(viewId);
    return React.createElement('article',{'data-fixture-preview-view':viewId},detail.asset.content,lcosActions)};
  const until=async condition=>{for(let i=0;i<20&&!condition();i++)await React.act(async()=>{await tick()});assert.ok(condition(),document.body.textContent)};
  const renderMaterial=async(detail)=>{store.getState().open();mounted=createRoot(outlet);await React.act(async()=>{
    mounted.render(React.createElement(state.NativeLibraryPlacementProvider,{store},React.createElement(MaterialModule.LCOSNativeAssemblyTools,{detail,NativeButton,NativePreview:MaterialPreview})));await tick()});
    await until(()=>!!document.querySelector('[data-native-assembly-state="ready"]'))};
  await renderMaterial(detailA);assert.ok(document.body.textContent.includes('selected full text'));
  await click('放到画布');assert.equal(materialPosts,1);await close();await renderMaterial(detailA);
  assert.ok(button('正在放置…')?.disabled);assert.ok(button('核对放置结果')?.disabled);assert.equal(materialPosts,1);
  await React.act(async()=>{materialReply.reject(new Error('Controlled material response loss'));await tick()});assert.equal(read(store,materialAddress('origin-v1')).status,'unconfirmed');
  assert.ok(button('放置待确认')?.disabled);assert.ok(button('核对放置结果')&&!button('核对放置结果').disabled);
  await close();await renderMaterial(detailB);assert.ok(button('放到画布')&&!button('放到画布').disabled,'same revision but another exact View has its own address');
  assert.equal(button('核对放置结果'),undefined);assert.equal(read(store,materialAddress('origin-v1')).status,'unconfirmed');
  await close();await renderMaterial(detailA);await click('核对放置结果');assert.equal(materialPosts,1);assert.equal(materialFlushes,1);assert.equal(read(store,materialAddress('origin-v1')).status,'unconfirmed');
  materialCanonical=true;await click('核对放置结果');assert.equal(materialPosts,1);assert.equal(materialFlushes,1);assert.equal(nodes.length,1);
  assert.equal(nodes[0].data.lcos_ref.artifactViewId,receiverView);assert.equal(read(store,materialAddress('origin-v1')),null);
  report.artifactComponent={requests:materialRequests,postCount:materialPosts,flushes:materialFlushes,navigationCancels,viewAUnknownDoesNotContaminateB:true};
  report.cases.push('actual Artifact Tools module/selection/effects + actual policy/media reader/material placement client: remount pending blocks POST2, response loss persists unknown, exact same revision/different View separates attempts, old View GET-only recovers one exact pinned carrier (POST1/flush1)');
  await close();
  if(process.argv.includes('--probe-two-material-details')){
    const detailTree=entries=>React.createElement(state.NativeLibraryPlacementProvider,{store},React.createElement(React.Fragment,null,
      ...entries.map(([detail,index])=>React.createElement('div',{key:index,'data-fixture-source-view':index===0?'origin-v1':'origin-v2'},
        React.createElement(MaterialModule.LCOSNativeAssemblyTools,{detail,NativeButton,NativePreview:MaterialPreview})))));
    mounted=createRoot(outlet);await React.act(async()=>{mounted.render(React.createElement(state.NativeLibraryPlacementProvider,{store},
      React.createElement(React.Fragment,null,...[detailA,detailB].map((detail,index)=>React.createElement('div',{
        key:index,'data-fixture-source-view':index===0?'origin-v1':'origin-v2'},React.createElement(MaterialModule.LCOSNativeAssemblyTools,{detail,NativeButton,NativePreview:MaterialPreview}))))));await tick()});
    await until(()=>document.querySelector('[data-fixture-source-view="origin-v2"] [data-native-assembly-state="ready"]'));
    await React.act(async()=>{await tick();await tick()});
    const mountedViews=[...document.querySelectorAll('[data-fixture-source-view]')].map(node=>({source:node.getAttribute('data-fixture-source-view'),
      preview:node.querySelector('[data-fixture-preview-view]')?.getAttribute('data-fixture-preview-view')}));
    await React.act(async()=>{mounted.render(detailTree([[detailB,1]]));await tick();await tick()});
    const afterOldUnmount=document.querySelector('[data-fixture-source-view="origin-v2"] [data-native-assembly-state]');
    report.twoMountedArtifactDetails={mountedViews,afterOldUnmount:{state:afterOldUnmount?.getAttribute('data-native-assembly-state'),
      preview:afterOldUnmount?.querySelector('[data-fixture-preview-view]')?.getAttribute('data-fixture-preview-view'),text:afterOldUnmount?.textContent},
      coreWrites:0,boundary:'two actually mounted production Tools instances and removal of old instance with stable other key; reachability of simultaneous original Popovers not asserted'};
    assert.notEqual(mountedViews[0].preview,'origin-v2','a still-mounted first exact View must not adopt the other same-Artifact View preview');
    assert.equal(afterOldUnmount?.getAttribute('data-native-assembly-state'),'ready','closing old exact View must not clear the newer exact View selection');
    await close();
    // Equal source identities still belong to different component lifetimes.
    // Keep the newer instance/key intact while removing only the old owner.
    mounted=createRoot(outlet);await React.act(async()=>{mounted.render(detailTree([[detailA,0],[detailA,1]]));await tick()});
    await until(()=>document.querySelector('[data-fixture-source-view="origin-v2"] [data-native-assembly-state="ready"]'));
    await React.act(async()=>{mounted.render(detailTree([[detailA,1]]));await tick();await tick()});
    const sameSourceSurvivor=document.querySelector('[data-fixture-source-view="origin-v2"] [data-native-assembly-state]');
    report.sameExactSourceInstances={state:sameSourceSurvivor?.getAttribute('data-native-assembly-state'),
      preview:sameSourceSurvivor?.querySelector('[data-fixture-preview-view]')?.getAttribute('data-fixture-preview-view')};
    assert.equal(report.sameExactSourceInstances.state,'ready','old identical-source instance cleanup must not clear the newer owner');
    assert.equal(report.sameExactSourceInstances.preview,'origin-v1');
    await close();await renderMaterial(detailA);
    transitionTrace=[];
    await React.act(async()=>{mounted.render(React.createElement(state.NativeLibraryPlacementProvider,{store},
      React.createElement(MaterialModule.LCOSNativeAssemblyTools,{detail:detailB,NativeButton,NativePreview:MaterialPreview})));await tick()});
    await until(()=>document.querySelector('[data-fixture-preview-view="origin-v2"]'));
    report.detailPropsTransition={previewRenderTrace:[...transitionTrace],
      boundary:'same actual mounted Tools instance changes exact source View; logs real Preview render calls including the render before the Open effect'};
    assert.ok(transitionTrace.length>0);
    assert.ok(transitionTrace.every(viewId=>viewId==='origin-v2'),'changed detail props must not render prior exact View before the new Open effect');
    transitionTrace=null;
    report.cases.push('actual Artifact Tools overlapping instances: different View or identical exact source cannot steal the newer selection on old cleanup; same instance source-props transition never renders the prior View');
  }
  report.originalStore={source:'UnlimitedModeToggle-D4wysAbz.js',export:'aa -> mO',initializer:declaration.init.type,create:'real Zustand create',originalOpenClosePreserved:true,cancelledVendorSearches};
  report.passed=true;
}catch(error){report.error=String(error.stack??error);throw error}
finally{
  if(mounted)await React.act(async()=>mounted.unmount());
  await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  for(const key of globals)if(previous[key])Object.defineProperty(globalThis,key,previous[key]);else delete globalThis[key];
  dom.happyDOM.abort();if(path.dirname(temp)===path.join(root,'.runtime')&&path.basename(temp).startsWith('native-library-placement-state-'))await fs.rm(temp,{recursive:true,force:true});
  console.log(JSON.stringify({passed:report.passed,cases:report.cases,report:path.join(output,'report.json')}));
}
