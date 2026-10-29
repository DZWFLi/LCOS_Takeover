import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {buildPilotEntry} from '../lab/pilot/build-pilot.mjs';
const root=path.resolve(import.meta.dirname,'..'),temp=await fs.mkdtemp(path.join(root,'.runtime','surface-material-drop-test-'));
const out=path.join(root,'output','原生节点跨现场投递_20261020');await fs.mkdir(out,{recursive:true});
const entry=path.join(temp,'entry.ts');await fs.writeFile(entry,[
 "export * from '../../lab/pilot/native-surface-material-drop';",
 "export {createNativeLibraryMaterialOwner} from '../../lab/pilot/native-library-material-owner';",
 "export {beginNativeLibraryAssemblyDrop} from '../../lab/pilot/native-library-drop';",
 "export {checkNativeLibraryDropReceipt,canCheckNativeLibraryDropReceipt} from '../../lab/pilot/native-library-material-dispatch';",
 "export {useLcosDropStore} from '../../lcos/huabu/apps/web/src/lcos/lcosDropState';",
 "export {useLcosShellStore} from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';",
].join('\n'));
await buildPilotEntry(path.relative(root,entry),path.join(temp,'entry.mjs'),'browser');const app=await import(pathToFileURL(path.join(temp,'entry.mjs')));
const oldFetch=globalThis.fetch,oldWindow=globalThis.window,oldDocument=globalThis.document;
const report={passed:false,scope:'actual dispatcher + receive client + owner; controlled HTTP and native API; no real Core/browser writes',cases:[],failures:[]};
function harness(surface='context',options={}){
 const projectId='p',sourceCanvas='source-main',targetCanvas='target-'+surface,workspaceId='workspace-'+surface,scope='root-scope',tx='gesture-1';
 const targetRef=surface==='main'?{kind:surface}:{kind:surface,id:scope},targetId='native-surface-dock:'+surface;
 const sourceNodes=[1,2].map(n=>({id:'source-node-'+n,type:n===1?'image':'text',position:{x:10*n,y:20},data:{title:'source '+n,lcos_ref:{version:1,entityType:'artifact',entityId:'a'+n,artifactId:'a'+n,artifactViewId:'origin-v'+n,revisionId:'r'+n}}}));
 const targetNodes=[],trace={methods:[],posts:[],placement:[],flush:[],sync:0};const existingViews=new Map();let currentCanvas=sourceCanvas,phase='commit';
 const graph={project:{id:projectId},artifacts:[1,2].map(n=>({id:'a'+n,projectId,kind:n===1?'image':'text',title:'source '+n,currentRevisionId:'r'+n,availability:'available'})),artifactRevisions:[1,2].map(n=>({id:'r'+n,artifactId:'a'+n,fileRecordId:'f'+n,status:'current',contentHash:'content-'+n})),fileRecords:[1,2].map(n=>({id:'f'+n,projectId,availability:'current',observedHash:'content-'+n,mimeType:n===1?'image/png':'text/plain',size:64})),artifactViews:[1,2].map(n=>({id:'origin-v'+n,artifactId:'a'+n,scopeId:scope,revisionId:'r'+n})),scopes:[{id:scope,projectId}]};
 const api={getNodes:()=>sourceNodes,getEdges:()=>[],getSelection:()=>({nodeIds:['source-node-1'],edgeIds:[]}),getViewport:()=>({x:0,y:0,zoom:1}),
 flushCanvas:async id=>{trace.flush.push(id);options.onFlush?.(h);return 'saved';},
 findMaterialPlacement:(size,nodes)=>{assert.ok(Array.isArray(nodes),'placement receives destination snapshot');assert.ok(!nodes.some(n=>n.id.startsWith('source-node')));trace.placement.push({size,ids:nodes.map(n=>n.id)});return{x:500+nodes.length*400,y:300};},
 synchronizeMaterialProjection:async()=>{trace.sync++;throw Error('remote destination must not publish into source');}};
 const current=()=>({projectId,canvasId:currentCanvas,workspaceId:'source-workspace',surface:'main',api});
 const target={targetId,kind:'spatial-membership',enabled:true,semantic:{kind:'spatial-membership',targetRef}};
 let payload={kind:'objects',objects:sourceNodes.slice(0,options.multi?2:1).map(n=>({entityType:'artifact',entityId:n.data.lcos_ref.artifactId,artifactId:n.data.lcos_ref.artifactId,artifactViewId:n.data.lcos_ref.artifactViewId,revisionId:n.data.lcos_ref.revisionId,displayLabel:n.data.title}))};
 if(options.library){const origin={projectId,canvasId:sourceCanvas,api,...options.libraryOrigin};let state={status:'idle'};
  const asset={id:'a1',name:'source 1',lcos_projection:{project_id:origin.projectId,artifact_id:'a1',presented_revision_id:'r1',current_revision_id:'r1',artifact_view_id:'origin-v1',file_record_id:options.captureFile??'f1',content_available:true,referenceable:true,assembly_item:{kind:'artifact',title:'source 1',entityRef:{type:'artifact',id:'a1',viewId:'origin-v1'},presentedRevisionId:'r1',mimeType:'image/png'}}};
  const event={clientX:10,clientY:20,dataTransfer:{setData(){},effectAllowed:''},preventDefault(){},stopPropagation(){}};
  assert.equal(app.beginNativeLibraryAssemblyDrop(event,asset,{readOrigin:()=>origin,read:()=>({state}),acquire:p=>{payload=p;state={status:'tracking',payload:p};},cancel(){},notice:message=>{throw Error(message);}}),'started');
 }
 const intent={kind:'assembly-apply',targetId,targetRef,sourceRefs:(options.multi?[1,2]:[1]).map(n=>({kind:'artifactView',id:'origin-v'+n}))};
 const ports={current,target:()=>target,gesture:(_p,_tx,_id,recovery)=>recovery?phase==='recovery':phase==='commit',rootCanvas:s=>s===surface?targetCanvas:'target-'+s};
 const release=current();
 const h={api,payload,intent,tx,release,ports,trace,graph,sourceNodes,targetNodes,targetRef,targetCanvas,workspaceId,scope,target,
  changeSource(){currentCanvas='changed';window.__LCOS_NODE_LAB__.canvasId='changed';},recovery(){phase='recovery';},current,
  present(artifact='a1',position={x:500,y:300},membership=false){const index=artifact.slice(1),view='target-v'+index,nodeId='received-'+index;
   const node={id:nodeId,canvas_id:targetCanvas,type:index==='1'&&!options.file?'image':'text',position:{...position},data:{id:nodeId,lcos_ref:{version:1,entityType:'view',entityId:view,artifactId:artifact,artifactViewId:view,revisionId:'r'+index},...(membership?{lcos_workspace_membership:{workspaceId,viewId:view,addedAt:'known',addedBy:'user'}}:{})}};
   const receipt={state:'present',project_id:projectId,canvas_id:targetCanvas,workspace_id:workspaceId,target_ref:targetRef,artifact_id:artifact,revision_id:'r'+index,file_record_id:'f'+index,artifact_view_id:view,provider_execution_started:false,node,binding:{projectId,canvasId:targetCanvas,spatialKind:'node',spatialId:nodeId,entityType:'view',entityId:view},presentation:{id:'presentation:'+(surface==='workflow'?'workflow':'context')+':'+scope,projectId,scopeId:scope,capability:surface==='workflow'?'workflow':'context',state:{memberViewIds:[view],positions:{[view]:{...position}}}}};
   if(options.file&&index==='1')node.data.lcos_file_ref={...sourceNodes[0].data.lcos_file_ref,artifactViewId:view};
   existingViews.set(artifact,receipt);if(!targetNodes.some(n=>n.id===nodeId))targetNodes.push(node);return receipt;
  }};
 if(options.file){const {kind,mimeType}=options.file;graph.artifacts[0].kind=kind;graph.fileRecords[0].mimeType=mimeType;graph.fileRecords[0].size=64;
  sourceNodes[0].type='text';sourceNodes[0].data.lcos_file_ref={artifactId:'a1',artifactViewId:'origin-v1',revisionId:'r1',fileRecordId:'f1',mimeType,kind,size:64};
  if(payload.kind==='objects')payload.objects[0].mimeType=mimeType;}
 options.setup?.(h);
 globalThis.window={__LCOS_NODE_LAB__:{projectId,canvasId:sourceCanvas,api},addEventListener(){},removeEventListener(){}};globalThis.document={querySelector:()=>null};
 globalThis.fetch=async(address,init={})=>{
  const url=new URL(address,'http://controlled.test'),method=init.method??'GET';assert.equal(url.origin,'http://controlled.test');trace.methods.push(method+' '+url.pathname);
  if(url.pathname.endsWith('/graph')){options.onGraph?.(h);return Response.json({ok:true,value:graph});}
  if(url.pathname.endsWith('/workspaces'))return Response.json({ok:true,value:[{id:workspaceId,projectId,canvasId:targetCanvas,scopeId:scope,preferredSurface:surface}]});
  if(url.pathname==='/api/canvas/v1/canvases/'+targetCanvas){options.onCanvas?.(h);return Response.json({code:0,data:{id:targetCanvas,workspace_id:workspaceId,nodes:targetNodes,...options.canvasOverride}});}
  assert.equal(url.pathname,'/api/lcos/canvases/'+targetCanvas+'/materials:receive');
  const selected=method==='POST'?JSON.parse(init.body):Object.fromEntries(url.searchParams);const artifact=selected.artifactId,index=artifact.slice(1);
  if(method==='POST'){trace.posts.push(selected);const receipt=h.present(artifact,selected.position);options.afterPost?.(h);if(options.losePost)throw new TypeError('controlled lost committed response');return Response.json({code:0,data:receipt});}
  options.onReceiveGet?.(h);
  const receipt=options.unconfirmedForever?undefined:existingViews.get(artifact);
  return Response.json({code:0,data:receipt??{state:'absent',project_id:projectId,canvas_id:targetCanvas,workspace_id:workspaceId,target_ref:targetRef,artifact_id:artifact,revision_id:'r'+index,file_record_id:'f'+index,artifact_view_id:'target-v'+index,provider_execution_started:false}});
 };
 return h;
}
async function test(name,run){try{await run();report.cases.push(name);}catch(error){report.failures.push({name,error:error.message});}}
const perform=h=>app.createNativeSurfaceMaterialDispatcher(h.release,h.payload,h.tx,h.ports).handle(h.intent,h.tx);
try{
 for(const surface of ['main','context','workflow'])await test('objects to '+surface+' use target nodes and never publish into source',async()=>{const h=harness(surface),original=structuredClone(h.sourceNodes),r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,1);assert.equal(h.trace.sync,0);assert.deepEqual(h.sourceNodes,original);assert.ok(h.trace.flush.every(id=>id==='source-main'));assert.deepEqual(h.trace.posts[0].targetRef,h.targetRef);});
 await test('Library to Context shares actual surface dispatcher',async()=>{const h=harness('context',{library:true}),r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,1);});
 await test('same exact version already on target yields zero POST',async()=>{const h=harness('workflow',{setup:h=>h.present('a1',{x:200,y:90},true)}),r=await perform(h);assert.equal(r.status,'success');assert.equal(h.trace.posts.length,0);assert.equal(h.trace.placement.length,0);});
 await test('multi-selection posts two exact materials, second layout sees first',async()=>{const h=harness('context',{multi:true}),r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,2);assert.deepEqual(h.trace.posts.map(p=>p.artifactId),['a1','a2']);assert.deepEqual(h.trace.placement[1].ids,['received-1']);});
 await test('lost POST response automatically recovers by GET without replay',async()=>{const h=harness('context',{losePost:true}),r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,1);assert.equal(h.trace.methods.filter(m=>m.includes('materials:receive')&&m.startsWith('GET')).length,2);});
 await test('unknown result stays partial; explicit recovery has only GET and no flush/POST',async()=>{const h=harness('workflow',{losePost:true,unconfirmedForever:true}),r=await perform(h);assert.equal(r.status,'partial',r.message);const feedback={receipt:r,attempt:{payload:h.payload}};assert.equal(app.canCheckNativeLibraryDropReceipt(feedback),true);h.recovery();const posts=h.trace.posts.length,flush=h.trace.flush.length,begin=h.trace.methods.length;const recovered=await app.checkNativeLibraryDropReceipt(feedback,new AbortController().signal);assert.equal(recovered.status,'partial');assert.equal(h.trace.posts.length,posts);assert.equal(h.trace.flush.length,flush);assert.ok(h.trace.methods.slice(begin).every(m=>m.startsWith('GET')));});
 await test('unknown reception can be confirmed GET-only after source revision advances',async()=>{const options={losePost:true,unconfirmedForever:true},h=harness('context',options),first=await perform(h);assert.equal(first.status,'partial',first.message);h.sourceNodes[0].data.lcos_ref.revisionId='later-visible-revision';options.unconfirmedForever=false;h.recovery();const posts=h.trace.posts.length,flush=h.trace.flush.length,begin=h.trace.methods.length;const recovered=await app.checkNativeLibraryDropReceipt({receipt:first,attempt:{payload:h.payload}},new AbortController().signal);assert.equal(recovered.status,'success',recovered.message);assert.equal(h.trace.posts.length,posts);assert.equal(h.trace.flush.length,flush);assert.ok(h.trace.methods.slice(begin).every(m=>m.startsWith('GET')));});
 await test('source scene changes during graph read: zero POST',async()=>{const h=harness('context',{onGraph:h=>h.changeSource()}),r=await perform(h);assert.equal(r.status,'failed');assert.equal(h.trace.posts.length,0);});
 await test('source exact revision changes before client commit: zero POST',async()=>{const h=harness('context',{onReceiveGet:h=>h.sourceNodes[0].data.lcos_ref.revisionId='later'}),r=await perform(h);assert.equal(r.status,'failed');assert.equal(h.trace.posts.length,0);});
 await test('wrong graph file identity rejected before POST',async()=>{const h=harness('context',{setup:h=>h.graph.fileRecords[0].projectId='foreign'}),r=await perform(h);assert.equal(r.status,'failed');assert.equal(h.trace.posts.length,0);});
 await test('wrong target Canvas identity cannot report existing node success',async()=>{const h=harness('context',{setup:h=>h.present('a1',{x:200,y:90},true),canvasOverride:{id:'foreign-canvas',workspace_id:'foreign-workspace'}}),r=await perform(h);assert.notEqual(r.status,'success','foreign Canvas GET was accepted as already-present');assert.equal(h.trace.posts.length,0);});
 await test('old Library source origin cannot commit in a newer release',async()=>{const h=harness('context',{library:true,libraryOrigin:{canvasId:'old-source',api:{}}}),r=await perform(h);assert.equal(r.status,'failed','old Library capture bypassed source guard');assert.equal(h.trace.posts.length,0);});
 await test('Library captured FileRecord mismatch rejected before POST',async()=>{const h=harness('context',{library:true,captureFile:'wrong-captured-file'}),r=await perform(h);assert.equal(r.status,'failed','captured file was replaced by graph file');assert.equal(h.trace.posts.length,0);});
 await test('artifact entityId and artifactId conflict rejected before POST',async()=>{const h=harness('context');h.payload.objects[0].entityId='foreign-artifact';const r=await perform(h);assert.equal(r.status,'failed','entityId conflict was discarded');assert.equal(h.trace.posts.length,0);});
 await test('production combined owner delegates Dock objects to spatial helper',async()=>{const h=harness('workflow');app.useLcosDropStore.getState().reset();app.useLcosShellStore.setState({projectId:'p',activeWorkspaceId:'source-workspace',activeSurface:'main',surfaceCanvasId:{workflow:h.targetCanvas}});const d=app.useLcosDropStore.getState();d.registerTarget({...h.target,rect:{left:0,top:0,width:100,height:100},label:'Workflow',priority:50});d.begin(h.payload,'source-node-1',['source-node-1']);d.setBounds({left:0,top:0,right:1000,bottom:700});d.advance({x:10,y:10},true,Date.now(),{targetId:h.intent.targetId,previewPoint:{x:10,y:10}},{status:'ready',intent:h.intent});d.commitAt(h.tx);const owner=app.createNativeLibraryMaterialOwner('p','source-main',h.payload,h.tx),r=await owner.handle(h.intent,h.tx);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,1);});
 const fileKinds=[['other','video/mp4'],['other','audio/wav'],['file','application/zip'],['pdf','application/pdf'],['presentation','application/vnd.openxmlformats-officedocument.presentationml.presentation']];
 for(const [kind,mimeType] of fileKinds)for(const surface of ['main','context','workflow'])await test(kind+' / '+mimeType+' exact file to '+surface,async()=>{
  const h=harness(surface,{file:{kind,mimeType}}),before=structuredClone(h.sourceNodes),r=await perform(h);
  assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,1);assert.equal(h.trace.sync,0);assert.deepEqual(h.sourceNodes,before);
  assert.equal(h.targetNodes[0].type,'text');assert.deepEqual(h.targetNodes[0].data.lcos_file_ref,{...before[0].data.lcos_file_ref,artifactViewId:'target-v1'});
 });
 for(const [label,setup] of [
  ['unknown kind',h=>h.graph.artifacts[0].kind='future-media'],
  ['source old revision',h=>h.sourceNodes[0].data.lcos_file_ref.revisionId='old'],
  ['source wrong MIME',h=>h.sourceNodes[0].data.lcos_file_ref.mimeType='audio/wav'],
  ['graph wrong MIME',h=>h.graph.fileRecords[0].mimeType='audio/wav'],
  ['captured wrong MIME',h=>h.payload.objects[0].mimeType='audio/wav'],
  ['source wrong file',h=>h.sourceNodes[0].data.lcos_file_ref.fileRecordId='other-file'],
  ['source metadata missing',h=>delete h.sourceNodes[0].data.lcos_file_ref],
  ['invalid byte length',h=>h.graph.fileRecords[0].size=-1],
 ])await test(label+' cannot admit video file',async()=>{const h=harness('context',{file:{kind:'other',mimeType:'video/mp4'},setup}),r=await perform(h);assert.equal(r.status,'failed',r.message);assert.equal(h.trace.posts.length,0);});
 await test('file MIME changes while source flushes: no POST',async()=>{const h=harness('workflow',{file:{kind:'other',mimeType:'video/mp4'},onFlush:h=>h.sourceNodes[0].data.lcos_file_ref.mimeType='audio/wav'}),r=await perform(h);assert.equal(r.status,'failed');assert.equal(h.trace.posts.length,0);});
 for(const field of ['mimeType','revisionId','fileRecordId'])await test('wrong destination file '+field+' never reports success',async()=>{const h=harness('context',{file:{kind:'other',mimeType:'video/mp4'},afterPost:h=>h.targetNodes[0].data.lcos_file_ref[field]='wrong'}),r=await perform(h);assert.equal(r.status,'partial');assert.equal(h.trace.posts.length,1);});
 await test('exact file already received does not duplicate node or POST',async()=>{const h=harness('workflow',{file:{kind:'file',mimeType:'application/zip'},setup:h=>h.present('a1',{x:100,y:100},true)}),r=await perform(h);assert.equal(r.status,'success');assert.equal(h.trace.posts.length,0);assert.equal(h.targetNodes.length,1);});
 await test('file committed response loss recovers by GET only',async()=>{const h=harness('context',{file:{kind:'other',mimeType:'audio/wav'},losePost:true}),r=await perform(h);assert.equal(r.status,'success',r.message);assert.equal(h.trace.posts.length,1);assert.equal(h.trace.methods.filter(m=>m.includes('materials:receive')&&m.startsWith('GET')).length,2);});
 report.passed=report.failures.length===0;
}finally{globalThis.fetch=oldFetch;globalThis.window=oldWindow;globalThis.document=oldDocument;const relative=path.relative(path.join(root,'.runtime'),temp);assert.ok(relative.startsWith('surface-material-drop-test-')&&!relative.includes(path.sep));await fs.rm(temp,{recursive:true,force:true});const evidence=path.join(out,'helper-test-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');await fs.writeFile(evidence,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,evidence},null,2));}
if(!report.passed)process.exitCode=1;
