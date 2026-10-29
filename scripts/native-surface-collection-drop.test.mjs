import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { createNativeLibraryDropOwnerSourceTransforms, nativeLibraryDropStateSource } from '../lab/native-library-drop-owner-source-transform.mjs';
const root=path.resolve(import.meta.dirname,'..'),temp=await fs.mkdtemp(path.join(root,'.runtime','surface-collection-drop-test-'));
const output=path.join(root,'output','原生Collection跨现场投递_20261020');
const require=createRequire(path.join(installedRoot,'package.json')),esbuild=require('esbuild'),ts=require('typescript');
const transforms=createNativeLibraryDropOwnerSourceTransforms();
const report={passed:false,scope:'actual Collection dispatcher and receive client; actual source-transformed Drop store and feedback controller; controlled HTTP only, no live Core/browser writes',cases:[],failures:[],probes:[]};
const old={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document};
const entry=path.join(temp,'entry.ts'),bundle=path.join(temp,'entry.mjs');
await fs.writeFile(entry,[
 "export * from '../../lab/pilot/native-surface-collection-drop';",
 "export * from '../../lab/pilot/native-library-drop';",
 "export {checkNativeLibraryDropReceipt,canCheckNativeLibraryDropReceipt} from '../../lab/pilot/native-library-material-dispatch';",
 "export {create} from 'zustand';",
 "export {advanceDropIntent,beginDrop,completeDropDwell,confirmDrop,failDrop,idleDrop,nominalAnchorAt} from '@local-creative-os/web-gen2';",
 "export {railwayStableKeyV1} from '@local-creative-os/contracts';",
 "export * from '../../lcos/huabu/apps/web/src/lcos/drop/dropAssemblyReceipt';",
 "export * from '../../lcos/huabu/apps/web/src/lcos/drop/dropIntentResolver';",
 "export * from '../../lcos/huabu/apps/web/src/lcos/professional/assemblyApplyReview';",
 "export {DropTargetRegistry} from '../../lcos/huabu/apps/web/src/lcos/drop/dropTargetRegistry';",
].join('\n'));
await buildPilotEntry(path.relative(root,entry),bundle);const app=await import(pathToFileURL(bundle));
const storePath=path.join(root,nativeLibraryDropStateSource),storeSource=readCurrentGen2Resource(storePath)?.contents??await fs.readFile(storePath,'utf8');
const transformedStore=transforms[nativeLibraryDropStateSource](storeSource,{sourcePath:storePath});
const storeCode=(await esbuild.transform(transformedStore,{loader:'ts',format:'cjs',target:'node22'})).code,module={exports:{}};
new Function('require','module','exports',storeCode)(name=>{
 assert.ok(['zustand','@local-creative-os/contracts','@local-creative-os/web-gen2','./drop/dropAssemblyReceipt','./drop/dropTargetRegistry'].includes(name)||name.endsWith('/lab/pilot/native-library-drop'),'unexpected store dependency '+name);return app;
},module,module.exports);
const store=module.exports.useLcosDropStore;
const reactRequire=createRequire(path.join(installedRoot,'huabu/apps/web/package.json'));
const evaluate=async(source,loader,dependency)=>{const code=(await esbuild.transform(source,{loader,jsx:'automatic',format:'cjs',target:'node22'})).code;
 const module={exports:{}};new Function('require','module','exports',code)(dependency,module,module.exports);return module.exports;};
const ui=await evaluate(await fs.readFile(path.join(root,'lab/pilot/native-library-drop-feedback.tsx'),'utf8'),'tsx',specifier=>{
 if(specifier==='react'||specifier==='react/jsx-runtime')return reactRequire(specifier);
 if(specifier.endsWith('/lcosDropState'))return{useLcosDropStore:store};
 if(specifier==='./native-library-drop'||specifier==='./native-library-material-owner')return app;
 return {default(){throw Error('Canvas hook is outside controller test');},useLcosShellStore(){throw Error('Shell hook is outside controller test');}};
});
const aggregatePath=path.join(root,'lcos/huabu/apps/web/src/lcos/drop/railwayAssemblyDrop.ts');
const aggregateModule=await evaluate(readCurrentGen2Resource(aggregatePath)?.contents??await fs.readFile(aggregatePath,'utf8'),'ts',()=>({useLcosDropStore:store,acquireDrop(){throw Error('producer pointer transport is not executed');}}));
function harness(surface='context',options={}) {
 const projectId='p',sourceCanvasId='source-main',targetCanvasId=options.canvas?sourceCanvasId:'target-'+surface,workspaceId=options.canvas?'source-workspace':'workspace-'+surface,scopeId='root-scope',transactionId='collection-gesture';
 const targetId=options.canvas?'original-canvas-target':'native-surface-dock:'+surface,targetRef=options.targetRef??(surface==='main'?{kind:surface}:{kind:surface,id:scopeId});
 const sourceNodes=[1,2].map(n=>({id:'source-pile-'+n,type:'pile',position:{x:50*n,y:100},data:{id:'source-pile-'+n,title:'Collection '+n,lcos_native_collection:true,lcos_collection_ref:{projectId,canvasId:sourceCanvasId,workspaceId:'source-workspace',collectionId:'c'+n},memberIds:['source-member-'+n]}}));
 const targetNodes=[],receipts=new Map(),trace={requests:[],posts:[],flush:[],placements:[],sync:0};let phase='commit',liveCanvas=sourceCanvasId;
 const api={getNodes:()=>sourceNodes,getEdges:()=>[],getViewport:()=>({x:0,y:0,zoom:1}),getSelection:()=>({nodeIds:['source-pile-1'],edgeIds:[]}),
  flushCanvas:async id=>{trace.flush.push(id);options.onFlush?.(h);return 'saved';},
  findMaterialPlacement:(size,nodes)=>{assert.ok(Array.isArray(nodes));assert.ok(nodes.every(n=>!n.id.startsWith('source-')));trace.placements.push({size,ids:nodes.map(n=>n.id)});return options.noPosition?undefined:{x:300+nodes.length*400,y:200};},
  synchronizeCollectionCarrier:async(input,control)=>{trace.sync++;assert.ok(options.canvas,'remote Collection must not publish into source');assert.equal(input.canvasId,sourceCanvasId);assert.equal(control.isCurrent(),true);const at=sourceNodes.findIndex(n=>n.id===input.node.id);if(at<0)sourceNodes.push(structuredClone(input.node));else sourceNodes[at]=structuredClone(input.node);return {ok:true};}};
 const release={projectId,canvasId:sourceCanvasId,workspaceId:'source-workspace',surface:options.canvas?surface:'main',api};
 const payload={kind:'objects',objects:(options.multi?[1,2]:[1]).map(n=>({entityType:'collection',entityId:'c'+n,displayLabel:'Collection '+n}))};
 const intent={kind:'assembly-apply',targetId,targetRef,...(options.canvas?{placementPoint:{x:725,y:480}}:{}),sourceRefs:(options.multi?[1,2]:[1]).map(n=>({kind:'collection',id:'c'+n}))};
 const target={targetId,kind:options.canvas?'canvas':'spatial-membership',enabled:true,semantic:{kind:options.canvas?'canvas':'spatial-membership',targetRef}};
 const ports={current:()=>({...release,canvasId:liveCanvas}),target:()=>target,gesture:(_p,_tx,_id,recovery)=>recovery?phase==='recovery':phase==='commit',rootCanvas:s=>'target-'+s};
 const h={api,release,payload,intent,target,ports,transactionId,sourceNodes,targetNodes,trace,targetCanvasId,workspaceId,
  recovery(){phase='recovery';},changeSource(){liveCanvas='changed';window.__LCOS_NODE_LAB__.canvasId='changed';},
  present(id='c1',position={x:9,y:8}){const nodeId='received-'+id,node={id:nodeId,type:'pile',position:{...position},data:{id:nodeId,title:'Collection '+id,lcos_native_collection:true,lcos_collection_ref:{projectId,canvasId:targetCanvasId,workspaceId,collectionId:id},memberIds:['member-a','member-b']}};
   const receipt={state:'present',presentation_received:true,project_id:projectId,canvas_id:targetCanvasId,workspace_id:workspaceId,collection_id:id,provider_execution_started:false,node,binding:{projectId,canvasId:targetCanvasId,spatialKind:'node',spatialId:nodeId,entityType:'collection',entityId:id}};
   receipts.set(id,receipt);if(!targetNodes.some(n=>n.id===nodeId))targetNodes.push(node);return receipt;}};
 options.setup?.(h);
 globalThis.window={__LCOS_NODE_LAB__:{projectId,canvasId:sourceCanvasId,api},addEventListener(){},removeEventListener(){}};
 globalThis.document={querySelector:()=>null};
 globalThis.fetch=async(address,init={})=>{
  const url=new URL(address,'http://controlled.test'),method=init.method??'GET';assert.equal(url.origin,'http://controlled.test');trace.requests.push({method,path:url.pathname});
  if(url.pathname==='/api/lcos/core/projects/p/workspaces')return Response.json({ok:true,value:[{id:workspaceId,projectId,canvasId:targetCanvasId,scopeId,preferredSurface:surface,...options.workspaceOverride}]});
  if(url.pathname.startsWith('/api/lcos/core/projects/p/collections/')){const id=url.pathname.split('/').at(-2);assert.equal(url.pathname.split('/').at(-1),'members');options.onMembers?.(h);return Response.json({ok:true,value:{collection:{id,projectId,title:'Collection '+id,...options.collectionOverride},members:[{kind:'artifactView',id:'view-a'},{kind:'artifactView',id:'view-b'}]}});}
  if(url.pathname==='/api/canvas/v1/canvases/'+targetCanvasId)return Response.json({code:0,data:{id:targetCanvasId,workspace_id:workspaceId,nodes:targetNodes,...options.canvasOverride}});
  if(method==='POST'){
   assert.equal(url.pathname,'/api/lcos/canvases/'+targetCanvasId+'/collections:project');const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body).sort(),['collectionId','position']);trace.posts.push(body);
   const receipt=h.present(body.collectionId,body.position);options.afterPost?.(h);if(options.losePost)throw new TypeError('controlled committed response loss');return Response.json({code:0,data:receipt});
  }
  const match=url.pathname.match(/^\/api\/lcos\/canvases\/([^/]+)\/collections\/([^/]+)\/projection$/);assert.ok(match,'unexpected fetch '+url.pathname);assert.equal(match[1],targetCanvasId);options.onProjection?.(h);
  const id=match[2],receipt=options.unconfirmed?undefined:receipts.get(id);return Response.json({code:0,data:receipt??{state:'absent',presentation_received:false,project_id:projectId,canvas_id:targetCanvasId,workspace_id:workspaceId,collection_id:id,provider_execution_started:false,binding:null,node:null}});
 };
 return h;
}
const perform=h=>app.createNativeSurfaceCollectionDispatcher(h.release,h.payload,h.transactionId,h.ports).handle(h.intent,h.transactionId);
const commit=h=>{store.getState().reset();const d=store.getState();d.begin(h.payload);d.setBounds({left:0,top:0,right:1000,bottom:800});d.advance({x:500,y:400},true,1,{targetId:h.intent.targetId,previewPoint:{x:500,y:400}},{status:'ready',intent:h.intent});d.commitAt(h.transactionId);assert.equal(store.getState().state.status,'committing');};
async function test(name,run){try{await run();report.cases.push(name);}catch(error){report.failures.push({name,error:error.stack??String(error)});}}
try{
 for(const surface of ['main','context','workflow'])await test('whole Collection to '+surface+' preserves members/source and uses one addressed producer',async()=>{const h=harness(surface),before=structuredClone(h.sourceNodes),r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,1);assert.equal(h.trace.posts[0].collectionId,'c1');assert.deepEqual(h.sourceNodes,before);assert.equal(h.trace.sync,0);assert.ok(h.trace.flush.every(id=>id==='source-main'));assert.deepEqual(r.canonicalReceipt.collections[0].node.data.memberIds,['member-a','member-b']);});
 await test('existing Collection uses zero POST and preserves saved position',async()=>{const h=harness('context',{setup:h=>h.present()}),r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,0);assert.deepEqual(r.canonicalReceipt.collections[0].node.position,{x:9,y:8});});
 await test('multiple Collections stay two aggregates; next placement sees prior target carrier',async()=>{const h=harness('workflow',{multi:true}),r=await perform(h);assert.equal(r.status,'success',r.message);assert.deepEqual(h.trace.posts.map(p=>p.collectionId),['c1','c2']);assert.equal(r.canonicalReceipt.collections.length,2);assert.deepEqual(h.trace.placements[1].ids,['received-c1']);});
 await test('mixed Collection/material multi-selection rejects entire group before writes',async()=>{const h=harness();h.payload.objects.push({entityType:'artifact',entityId:'a1'});h.intent.sourceRefs.push({kind:'artifact',id:'a1'});const r=await perform(h);assert.equal(r.status,'failed');assert.equal(h.trace.posts.length,0);});
 for(const [name,options] of [
  ['wrong target scope',{workspaceOverride:{scopeId:'foreign'}}],['wrong target Canvas',{canvasOverride:{id:'foreign'}}],['wrong target workspace',{canvasOverride:{workspace_id:'foreign'}}],['wrong Collection identity',{collectionOverride:{id:'foreign'}}],['wrong Collection project',{collectionOverride:{projectId:'foreign'}}],
  ['source pile origin mismatch',{setup:h=>h.sourceNodes[0].data.lcos_collection_ref.canvasId='foreign'}],
  ['captured source origin mismatch',{setup:h=>app.captureNativeDropFeedback(h.payload,{projectId:'p',canvasId:'old-source',api:h.api,title:'old'})}],
 ])await test(name+' rejects without POST',async()=>{const h=harness('context',options),r=await perform(h);assert.equal(r.status,'failed',r.message);assert.equal(h.trace.posts.length,0);});
 await test('scene changed during preflight rejects before POST',async()=>{const h=harness('context',{onMembers:h=>h.changeSource()}),r=await perform(h);assert.equal(r.status,'failed');assert.equal(h.trace.posts.length,0);});
 await test('source edits during original projection GET reject before POST',async()=>{const h=harness('context',{onProjection:h=>h.sourceNodes[0].position.x++}),r=await perform(h);assert.equal(r.status,'failed');assert.equal(h.trace.posts.length,0);});
 await test('lost POST response recovers by GET with only one producer call',async()=>{const h=harness('context',{losePost:true}),r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,1);assert.ok(h.trace.requests.filter(r=>r.path.endsWith('/projection')).length>=2);});
 await test('generic feedback has no invented Artifact fields and settles in actual original store',async()=>{const h=harness();commit(h);const r=await perform(h),capture=app.readNativeDropFeedbackCapture(h.payload);assert.deepEqual(Object.keys(capture).sort(),['api','canvasId','projectId','title']);assert.equal(app.readNativeLibraryDropCapture(h.payload),null);assert.ok(app.isNativeLibraryPlacementReceipt(r,h.payload));store.getState().settle(r);assert.equal(store.getState().state.status,'idle');assert.equal(store.getState().feedback.receipt,r);assert.equal(r.assemblyItems,undefined);assert.equal(r.retrySourceRefs,undefined);assert.equal(r.canonicalReceipt.collections[0].collection_id,'c1');});
 await test('unknown result remains in original feedback; notice check adopts GET-only recovery once',async()=>{
  const options={losePost:true,unconfirmed:true},h=harness('workflow',options);commit(h);const r=await perform(h);assert.equal(r.status,'partial',r.message);store.getState().settle(r);assert.equal(store.getState().state.status,'failed');assert.equal(store.getState().feedback.receipt,r);assert.equal(r.retrySourceRefs,undefined);
  const notices=[],dismissed=[];const notice=o=>{notices.push(o);return o.id??'notice-1';};notice.dismiss=id=>dismissed.push(id);
  let completed;const finished=new Promise(resolve=>completed=resolve),controller=ui.createNativeLibraryDropFeedbackController(notice,{read:()=>store.getState(),isCurrent:c=>c.api===h.api&&c.canvasId==='source-main',canCheck:app.canCheckNativeLibraryDropReceipt,check:async(f,s)=>{const result=await app.checkNativeLibraryDropReceipt(f,s);completed();return result;}});
  controller.sync();assert.equal(notices.at(-1).action.label,'核对放置结果');assert.equal(notices.at(-1).duration,0);
  options.unconfirmed=false;h.recovery();const start=h.trace.requests.length,posts=h.trace.posts.length,flush=h.trace.flush.length;let prevented=0;
  notices.at(-1).action.onClick({preventDefault(){prevented++;}});await finished;await Promise.resolve();await Promise.resolve();
  assert.equal(prevented,1);assert.equal(store.getState().state.status,'idle');assert.equal(store.getState().feedback.receipt.status,'success');assert.equal(h.trace.posts.length,posts);assert.equal(h.trace.flush.length,flush);assert.ok(h.trace.requests.slice(start).every(r=>r.method==='GET'));assert.equal(notices.at(-1).title,'已放到工作流。');controller.dispose();assert.deepEqual(dismissed,['notice-1']);
 });
 await test('recovery remains GET-only while target outcome is still unknown',async()=>{const h=harness('context',{losePost:true,unconfirmed:true}),r=await perform(h);assert.equal(r.status,'partial');h.recovery();const begin=h.trace.requests.length,flush=h.trace.flush.length;const next=await app.checkNativeLibraryDropReceipt({receipt:r,attempt:{payload:h.payload}},new AbortController().signal);assert.equal(next.status,'partial');assert.equal(h.trace.posts.length,1);assert.equal(h.trace.flush.length,flush);assert.ok(h.trace.requests.slice(begin).every(r=>r.method==='GET'));});
 const aggregate=()=>aggregateModule.railwayAggregatePayload({projectId:'p',sourceRef:{kind:'collection',id:'c1'},entityRef:{type:'collection',id:'c1'},label:'Frozen Collection',available:true},'p');
 await test('mature frozen aggregate with original capture succeeds without mutation or fake Artifact identity',async()=>{
  const h=harness();h.payload=aggregate();assert.ok(Object.isFrozen(h.payload));const json=JSON.stringify(h.payload),keys=Reflect.ownKeys(h.payload);app.captureNativeDropFeedback(h.payload,{projectId:'p',canvasId:'source-main',api:h.api,title:'Frozen Collection'});
  commit(h);const r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,1);assert.equal(JSON.stringify(h.payload),json);assert.deepEqual(Reflect.ownKeys(h.payload),keys);assert.equal(app.readNativeLibraryDropCapture(h.payload),null);assert.equal(app.readNativeDropFeedbackCapture({...h.payload}),null);assert.equal(app.isNativeLibraryPlacementReceipt(r,{...h.payload}),false);store.getState().settle(r);assert.equal(store.getState().state.status,'idle');
 });
 await test('uncaptured aggregate is refused with zero POST',async()=>{const h=harness();h.payload=aggregate();const r=await perform(h);assert.equal(r.status,'failed');assert.equal(h.trace.posts.length,0);assert.equal(app.readNativeDropFeedbackCapture(h.payload),null);});
 await test('captured frozen aggregate from old scene is refused with zero POST',async()=>{const h=harness();h.payload=aggregate();app.captureNativeDropFeedback(h.payload,{projectId:'p',canvasId:'old-source',api:h.api,title:'Frozen Collection'});const r=await perform(h);assert.equal(r.status,'failed');assert.equal(h.trace.posts.length,0);});
 await test('actual Library Collection producer creates captured frozen payload and reaches Dock',async()=>{
  const h=harness(),asset={lcos_library_entry:{projectId:'p',item:{schemaVersion:1,kind:'collection',title:'Library Collection',entityRef:{type:'collection',id:'c1'},usageCount:0}}};let state={status:'idle'};const types=[];
  const result=app.beginNativeLibraryAssemblyDrop({clientX:12,clientY:34,dataTransfer:{effectAllowed:'move',setData(type,value){types.push({type,value});}},preventDefault(){},stopPropagation(){}},asset,{aggregatePayload:aggregateModule.railwayAggregatePayload,readOrigin:()=>({projectId:'p',canvasId:'source-main',api:h.api}),read:()=>({state}),acquire:payload=>{h.payload=payload;state={status:'tracking',payload};},cancel(){throw Error('valid producer unexpectedly cancelled');},notice:message=>{throw Error(message);}});
  assert.equal(result,'started');assert.ok(Object.isFrozen(h.payload));assert.equal(h.payload.sourceRef.kind,'collection');assert.equal(app.readNativeLibraryDropCapture(h.payload),null);assert.equal(app.readNativeDropFeedbackCapture(h.payload).title,'Library Collection');assert.equal(types.length,1);assert.equal(JSON.parse(types[0].value).sourceRef.id,'c1');const r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,1);
 });
 for(const surface of ['main','context','workflow'])await test('Library frozen Collection to current '+surface+' Canvas uses released point and original synchronization',async()=>{
  const h=harness(surface,{canvas:true});h.payload=aggregate();app.captureNativeDropFeedback(h.payload,{projectId:'p',canvasId:'source-main',api:h.api,title:'Collection'});h.ports.rootCanvas=()=>{throw Error('Canvas must not resolve Dock root');};delete h.api.findMaterialPlacement;
  const r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,1);assert.deepEqual(h.trace.posts[0].position,{x:725,y:480});assert.equal(h.trace.placements.length,0);assert.equal(h.trace.sync,1);assert.ok(h.sourceNodes.some(n=>n.id==='received-c1'));
 });
 await test('workspace-addressed current Canvas accepts only current workspace',async()=>{const h=harness('context',{canvas:true,targetRef:{kind:'workspace',id:'source-workspace'}});h.payload=aggregate();app.captureNativeDropFeedback(h.payload,{projectId:'p',canvasId:'source-main',api:h.api,title:'Collection'});assert.equal((await perform(h)).status,'success');assert.equal(h.trace.sync,1);});
 for(const [name,change] of [['missing release point',h=>delete h.intent.placementPoint],['invalid release point',h=>h.intent.placementPoint.x=NaN],['different registered target',h=>h.target.semantic.targetRef={kind:'workspace',id:'other'}]])await test('current Canvas '+name+' rejects without POST',async()=>{const h=harness('main',{canvas:true});change(h);const r=await perform(h);assert.equal(r.status,'failed');assert.equal(h.trace.posts.length,0);assert.equal(h.trace.sync,0);});
 await test('current Canvas wrong workspace response rejects before producer',async()=>{const h=harness('context',{canvas:true,workspaceOverride:{id:'other'}}),r=await perform(h);assert.equal(r.status,'failed');assert.equal(h.trace.posts.length,0);});
 await test('current Canvas already-present Collection keeps saved position with zero POST',async()=>{const h=harness('main',{canvas:true,setup:h=>h.present('c1',{x:33,y:44})}),r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,0);assert.equal(h.trace.sync,1);assert.deepEqual(h.sourceNodes.find(n=>n.id==='received-c1').position,{x:33,y:44});});
 await test('current Canvas lost response still projects only once',async()=>{const h=harness('main',{canvas:true,losePost:true}),r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,1);assert.equal(h.trace.sync,1);});
 await test('two existing current-Canvas Collection objects keep each original carrier and position with zero POST',async()=>{const h=harness('main',{canvas:true,multi:true,setup:h=>{h.present('c1',{x:31,y:42});h.present('c2',{x:640,y:59});h.sourceNodes.splice(0,h.sourceNodes.length,...structuredClone(h.targetNodes));}}),before=structuredClone(h.sourceNodes),r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,0);assert.equal(h.trace.sync,2);assert.deepEqual(h.sourceNodes,before);assert.deepEqual(r.canonicalReceipt.collections.map(c=>c.collection_id),['c1','c2']);});
 // These modules are checked strictly against real selected source and production store injection.
 const files=['native-surface-collection-drop.ts','native-library-drop.ts','native-library-drop-feedback.tsx','native-library-material-owner.ts','native-library-entry.ts','native-library-contexts.tsx','native-library-scope-preview-drop.ts','native-library-scope-preview-target.tsx'].map(name=>path.join(root,'lab/pilot',name));
 const options={strict:true,noUnusedLocals:true,noUnusedParameters:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,allowImportingTsExtensions:true,resolveJsonModule:true,lib:['lib.es2022.d.ts','lib.dom.d.ts'],paths:{'@/*':[path.join(root,'lcos/huabu/apps/web/src/*')],'@huabu/shared':[path.join(root,'lcos/huabu/packages/shared/src/index.ts')],'@huabu/canvas-engine':[path.join(root,'lcos/huabu/packages/canvas-engine/src/index.ts')],'@local-creative-os/web-gen2':[path.join(root,'lcos/apps/web-gen2/src/index.ts')],'@local-creative-os/domain':[path.join(root,'lcos/packages/domain/src/index.ts')],'@local-creative-os/contracts':[path.join(root,'lcos/packages/contracts/src/index.ts')]}};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),normalize=p=>path.resolve(p).replaceAll('\\','/').toLowerCase();
 host.readFile=p=>normalize(p)===normalize(storePath)?transformedStore:readCurrentGen2Resource(p)?.contents??read(p);
 host.getSourceFile=(p,version)=>{const source=host.readFile(p);return source===undefined?undefined:ts.createSourceFile(p,source,version,true);};
 host.resolveModuleNames=(names,containing)=>names.map(name=>ts.resolveModuleName(name,containing,options,host).resolvedModule??(!name.startsWith('.')&&!path.isAbsolute(name)?ts.resolveModuleName(name,path.join(installedRoot,'huabu/apps/web/src','__native_types__.ts'),options,host).resolvedModule:undefined));
 const viteTypes=path.join(path.dirname(reactRequire.resolve('vite/package.json')),'client.d.ts');
 const program=ts.createProgram([...files,viteTypes],options,host);report.ownDiagnostics=files.flatMap(file=>{const source=program.getSourceFile(file);assert.ok(source);return [...program.getSyntacticDiagnostics(source),...program.getSemanticDiagnostics(source)].map(d=>({file:path.relative(root,file),line:source.getLineAndCharacterOfPosition(d.start??0).line+1,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}));});
 await test('strict ownDiagnostics for eight actual modules with production store source transform',()=>assert.deepEqual(report.ownDiagnostics,[]));
 report.passed=report.failures.length===0;
}finally{
 Object.assign(globalThis,old);await fs.mkdir(output,{recursive:true});const evidence=path.join(output,'helper-test-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');await fs.writeFile(evidence,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,evidence},null,2));
 const relative=path.relative(path.join(root,'.runtime'),temp);assert.ok(relative.startsWith('surface-collection-drop-test-')&&!relative.includes(path.sep));await fs.rm(temp,{recursive:true,force:true});
}
if(!report.passed)process.exitCode=1;
