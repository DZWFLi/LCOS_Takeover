import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Server } from 'node:net';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root=process.cwd(),runtime=await fs.mkdtemp(path.join(root,'.runtime/native-node-navigation-'));
const output=path.join(root,'output/普通节点导航固定_20261027/原模块与隔离Core',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const keys=Object.keys(process.env).filter(key=>/^(LCOS_|HUABU_|LOCAL_CORE_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|DEEPSEEK_)/.test(key)),saved=new Map(keys.map(key=>[key,process.env[key]]));
for(const key of keys)delete process.env[key];process.env.LCOS_RECOVERY_TRANSPORT='none';process.env.LCOS_OLLAMA_URL='http://127.0.0.1:1';process.env.LCOS_CAPTURE_STAGING_ROOT=path.join(runtime,'capture');process.env.LCOS_OCR_RUNTIME_DIR=path.join(runtime,'ocr');
const upstream=globalThis.fetch,checks=[],requests=[];let facade,fault;
globalThis.fetch=async(input,init={})=>{
  const address=String(input),method=init.method??'GET';
  if(address.startsWith('/api/')){
    requests.push({method,path:address,...(init.body?{body:JSON.parse(init.body)}:{})});
    if(fault?.when(method,address)&&fault.before){const current=fault;fault=undefined;return current.before();}
    const result=await facade.handle({method,url:address,body:init.body?JSON.parse(init.body):undefined});assert.ok(result,address);
    const response=Response.json(result.body,{status:result.status});
    if(fault?.when(method,address)){const current=fault;fault=undefined;return current.after(response);}
    return response;
  }
  const url=new URL(address),owned=process._getActiveHandles().some(handle=>{if(!(handle instanceof Server)||!handle.listening)return false;const a=handle.address();return a&&typeof a!=='string'&&['127.0.0.1','::1'].includes(a.address)&&String(a.port)===url.port;});
  assert.ok(owned&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname),'No active runtime or remote network');return upstream(input,init);
};
const report={passed:false,checks,requests,modelCalls:0,activeRuntimeTouched:false,scope:'Actual navigation modules + original user GUI route + disposable Core/Huabu. No browser or provider; controlled transport failures are labelled.'};
try{
  const rel=file=>path.relative(runtime,path.join(root,file)).replaceAll('\\','/'),entry=path.join(runtime,'fixture.ts');
  await fs.writeFile(entry,`export * from ${JSON.stringify(rel('lab/pilot/native-navigation-markers.ts'))};export * from ${JSON.stringify(rel('lab/pilot/native-navigation-candidates.ts'))};export {startSurfaceCoreFacade} from ${JSON.stringify(rel('lab/pilot/surface-core-facade.ts'))};`);
  const bundle=await buildPilotEntry(path.relative(root,entry),path.join(runtime,'fixture.mjs'),'node',{coreCollectionTitle:true,coreColorPin:true,coreWorkspaceMembership:true,coreWorkflowCollectionMembers:true,coreMixedScopeContext:true});
  const module=await import(pathToFileURL(bundle).href);
  facade=await module.startSurfaceCoreFacade({runtimeRoot:path.join(runtime,'owned'),publicOrigin:'http://127.0.0.1:19992',fullIntegration:true,nativeRailPilot:true,nativeCollectionPilot:true,nativeTextPilot:true,nativeAssemblyPilot:true});
  const projectId=facade.core.projectId,repo=facade.core.repository;
  const call=async(method,url,body,status=200)=>{const result=await facade.handle({method,url,body});assert.equal(result.status,status,JSON.stringify(result.body));return result.body.value??result.body.data;};
  for(const canvasId of ['surface-core-main','surface-core-context'])await facade.spatial.execute(canvasId,[{type:'CREATE_NODES',nodes:[{id:'ordinary-'+canvasId,nodeType:'note',position:{x:80,y:110},size:{width:260,height:180},data:{label:'普通便笺 '+canvasId,content:'这是独立画布文字，无 Artifact、View 或 Run。'}}]}]);
  const scene=async canvasId=>{const workspace=repo.getWorkspaces(projectId).find(row=>row.canvasId===canvasId);const value={projectId,canvasId,workspaceId:workspace.id,surfaceRef:canvasId==='surface-core-main'?'main':'workspace:'+workspace.id,api:{}};let nodes=(await call('GET','/api/canvas/v1/canvases/'+canvasId)).nodes;value.api={getNodes:()=>nodes,getNode:id=>nodes.find(node=>node.id===id)};return{value,refresh:async()=>{nodes=(await call('GET','/api/canvas/v1/canvases/'+canvasId)).nodes;return nodes;}};};
  const main=await scene('surface-core-main'),context=await scene('surface-core-context'),id='ordinary-surface-core-main',node=main.value.api.getNode(id),facts=await module.readNativeNavigationFacts(main.value);
  assert.ok(node);assert.equal(module.nativeNavigationTarget(node,main.value,facts),undefined);
  const target=module.nativeNavigationNodeTarget(node,main.value,facts);assert.deepEqual(target,{kind:'native-node',projectId,canvasId:main.value.canvasId,nodeId:id});
  assert.deepEqual(facts.nativeMarkers,[]);assert.equal(repo.getProjectionBindings(projectId).some(binding=>binding.spatialId===id),false);
  const before={graph:repo.get(projectId),execution:repo.getProjectExecutionProjection(projectId),bindings:repo.getProjectionBindings(projectId),markers:repo.listSpatialMarkerIntents(projectId),main:await facade.spatial.read(main.value.canvasId),context:await facade.spatial.read(context.value.canvasId)};
  checks.push('Original Huabu CREATE_NODES ordinary notes project through actual Canvas GET with no fabricated Artifact/View/binding/Run; native-node target is a local lab union only.');
  const writes=()=>requests.filter(row=>row.method==='POST'&&row.path.endsWith('/gui'));
  const marker=await module.createNativeNavigationMarker(main.value,id,facts,()=>true);assert.equal(marker.kind,'native-node');assert.equal(Object.hasOwn(marker,'targetRef'),false);assert.equal(Object.hasOwn(marker,'createdAt'),false);
  assert.deepEqual(writes().at(-1).body,{type:'SET_NAVIGATION_PIN',nodeId:id,pinned:true,scope:'local'});assert.equal((await facade.spatial.read(main.value.canvasId)).state.nodes.find(node=>node.id===id).data.lcos_gui_navigation_pin,true);
  let count=writes().length;await module.createNativeNavigationMarker(main.value,id,facts,()=>true);assert.equal(writes().length,count);
  await main.refresh();const pinnedFacts=await module.readNativeNavigationFacts(main.value),evidence=[{canvasId:main.value.canvasId,nodes:main.value.api.getNodes(),surfaceRef:'main'}];
  const candidates=module.nativeNavigationCandidates(target,pinnedFacts,evidence);assert.equal(candidates.status,'ready');assert.equal(candidates.candidates.length,1);assert.equal(candidates.candidates[0].nodeId,id);assert.equal(Object.hasOwn(candidates.candidates[0],'position'),false);
  assert.equal(module.nativeNavigationMarkerApplies(marker,candidates.candidates[0],pinnedFacts),true);
  await module.removeNativeNavigationMarker(main.value,marker.id,()=>true,{selectedMarker:marker});assert.equal((await facade.spatial.read(main.value.canvasId)).state.nodes.find(node=>node.id===id).data.lcos_gui_navigation_pin,false);
  assert.deepEqual(repo.listSpatialMarkerIntents(projectId),before.markers);checks.push('Actual original user /api/lcos/canvases/:canvas/gui true/false read back original persisted bool; repeat true uses GET only. Directory candidate carries exact node/workspace and no copied coordinates or Core marker identity.');
  for(const change of [n=>n.data.lcos_ref={version:1},n=>n.data.lcos_result_ref={},n=>n.data.lcos_native_collection=true,n=>n.canvas_id='foreign',n=>n.data.id='foreign']){const bad=structuredClone(node);change(bad);assert.equal(module.nativeNavigationNodeTarget(bad,main.value,facts),undefined);}
  const bound={...facts,bindings:[{projectId,canvasId:main.value.canvasId,spatialKind:'node',spatialId:id,entityType:'artifact',entityId:'missing'}]};assert.equal(module.nativeNavigationNodeTarget(node,main.value,bound),undefined);
  assert.equal(module.nativeNavigationCandidates({...target,projectId:'foreign'},facts,evidence).status,'unavailable');
  const badEvidence=structuredClone(evidence);badEvidence[0].nodes.find(n=>n.id===id).hidden=true;assert.equal(module.nativeNavigationCandidates(target,facts,badEvidence).reason,'node-hidden');
  const duplicate=structuredClone(evidence);duplicate[0].nodes.push(structuredClone(duplicate[0].nodes.find(n=>n.id===id)));assert.equal(module.nativeNavigationCandidates(target,facts,duplicate).reason,'node-identity-ambiguous');
  assert.equal(module.nativeNavigationCandidates(target,facts,[{canvasId:target.canvasId,available:false}]).reason,'canvas-read-failed');
  checks.push('Broken canonical hints, real/foreign binding, foreign canvas/project, hidden node, duplicate ID and failed read never fall back to ordinary target or a guessed occurrence.');
  // Execute the actual shared-identity/candidate functions against an exact
  // material carrier from the disposable Core. The added slot relation is a
  // controlled read model, not a claim that an Accept flow ran here.
  const material=main.value.api.getNodes().find(n=>n.data?.lcos_ref),materialRef=material.data.lcos_ref,owner=repo.getWorkspaces(projectId).find(w=>w.canvasId===main.value.canvasId),slotId='controlled-shared-result-slot';
  const promotedFacts=structuredClone(facts);promotedFacts.graph.resultSlots=[...(promotedFacts.graph.resultSlots??[]),{id:slotId,projectId,scopeId:owner.scopeId,workspaceId:owner.id,artifactId:materialRef.artifactId,artifactViewId:materialRef.artifactViewId,status:'empty'}];
  const promoted=structuredClone(material);promoted.data.lcos_result_ref={projectId,canvasId:main.value.canvasId,workspaceId:owner.id,slotId,artifactId:materialRef.artifactId,artifactViewId:materialRef.artifactViewId,revisionId:materialRef.revisionId};
  const slotTarget={projectId,kind:'entity',id:slotId},promotedEvidence=[{canvasId:main.value.canvasId,nodes:[promoted]}];
  assert.ok(module.nativeNavigationNodeTargets(promoted,main.value,promotedFacts).some(t=>module.sameNativeNavigationTarget(t,slotTarget)));
  const promotedCandidates=module.nativeNavigationCandidates(slotTarget,promotedFacts,promotedEvidence);assert.equal(promotedCandidates.status,'ready',JSON.stringify(promotedCandidates));assert.deepEqual(promotedCandidates.candidates.map(row=>row.nodeId),[promoted.id]);
  assert.equal(module.nativeNavigationTarget(promoted,main.value,promotedFacts).kind,'view','The material More keeps its exact View authoring target');
  const sharedMarker={id:'controlled-existing-slot-marker',projectId,targetRef:slotTarget,scope:'local',sourceSurfaceRef:'main',createdAt:'original',updatedAt:'original'};
  assert.equal(module.nativeNavigationMarkerApplies(sharedMarker,promotedCandidates.candidates[0],promotedFacts),true);
  for(const change of [n=>n.data.lcos_result_ref.projectId='foreign',n=>n.data.lcos_result_ref.workspaceId='foreign',n=>n.data.lcos_result_ref.artifactViewId='other',n=>n.data.lcos_result_ref.revisionId='other']){const bad=structuredClone(promoted);change(bad);assert.equal(module.nativeNavigationCandidates(slotTarget,promotedFacts,[{canvasId:main.value.canvasId,nodes:[bad]}]).status,'unavailable');}
  const unrelated=structuredClone(material);assert.equal(module.nativeNavigationCandidates(slotTarget,promotedFacts,[{canvasId:main.value.canvasId,nodes:[unrelated]}]).candidates.length,0);
  checks.push('Controlled ResultSlot→actual material View read model executes real shared target/candidate functions: exact resultRef/binding/owner preserves the existing slot marker after promotion, View remains authoring target; wrong relation cannot steal another Artifact occurrence. No Run/status prerequisite or Accept-flow claim.');
  fault={when:(method,url)=>method==='POST'&&url.endsWith('/gui'),after:async response=>{assert.equal(response.status,200);await response.text();throw Error('Controlled lost reply after actual persisted write');}};
  await assert.rejects(module.createNativeNavigationMarker(main.value,id,facts,()=>true),cause=>cause.outcome==='unknown');count=writes().length;
  await assert.rejects(module.createNativeNavigationMarker(main.value,id,facts,()=>true),cause=>cause.outcome==='unknown');assert.equal(writes().length,count);
  assert.equal((await module.verifyNativeNavigationMarkerPending(main.value,()=>true)).status,'confirmed');assert.equal(writes().length,count);
  await module.removeNativeNavigationMarker(main.value,marker.id,()=>true,{selectedMarker:marker});
  fault={when:(method,url)=>method==='POST'&&url.endsWith('/gui'),before:()=>{throw Error('Controlled unknown transport before observed commit');}};
  await assert.rejects(module.createNativeNavigationMarker(main.value,id,facts,()=>true),cause=>cause.outcome==='unknown');count=writes().length;
  assert.equal((await module.verifyNativeNavigationMarkerPending(main.value,()=>true)).status,'unknown');assert.equal(writes().length,count);
  await facade.spatial.execute(main.value.canvasId,[{type:'MERGE_NODE_DATA',patches:[{nodeId:id,patch:{lcos_gui_navigation_pin:true}}]}]);
  assert.equal((await module.verifyNativeNavigationMarkerPending(main.value,()=>true)).status,'confirmed');await module.removeNativeNavigationMarker(main.value,marker.id,()=>true,{selectedMarker:marker});
  checks.push('Controlled lost ACK after actual commit verifies saved true without a second POST; unknown no-commit stays pending and blocks replay until original spatial read supplies confirmation.');
  const contextId='ordinary-surface-core-context',contextFacts=await module.readNativeNavigationFacts(context.value),contextMarker=await module.createNativeNavigationMarker(context.value,contextId,contextFacts,()=>true);
  const mainVersion=(await facade.spatial.read(main.value.canvasId)).version;
  await module.removeNativeNavigationMarker(main.value,contextMarker.id,()=>true,{selectedMarker:contextMarker});
  assert.equal((await facade.spatial.read(context.value.canvasId)).state.nodes.find(n=>n.id===contextId).data.lcos_gui_navigation_pin,false);assert.equal((await facade.spatial.read(main.value.canvasId)).version,mainVersion);
  assert.deepEqual(writes().at(-1).body,{type:'SET_NAVIGATION_PIN',nodeId:contextId,pinned:false,scope:'local'});assert.equal(writes().at(-1).path,'/api/lcos/canvases/'+context.value.canvasId+'/gui');
  checks.push('Directory-style exact selected Context node can be cancelled from Main through the same user adapter, with no source scene write, camera operation, duplicate node or shared cross-surface target.');
  await call('POST','/api/lcos/canvases/'+main.value.canvasId+'/gui',{type:'SET_NAVIGATION_PIN',nodeId:id,pinned:true,scope:'cross-surface'},422);
  await facade.spatial.execute(main.value.canvasId,[{type:'MERGE_NODE_DATA',patches:[{nodeId:id,patch:{locked:true}}]}]);await main.refresh();count=writes().length;
  await assert.rejects(module.createNativeNavigationMarker(main.value,id,facts,()=>true),/操作|归属/);assert.equal(writes().length,count);
  await facade.spatial.execute(main.value.canvasId,[{type:'MERGE_NODE_DATA',patches:[{nodeId:id,patch:{locked:false}}]}]);await main.refresh();
  const after=repo.get(projectId);assert.deepEqual(after,before.graph);assert.deepEqual(repo.getProjectExecutionProjection(projectId),before.execution);assert.deepEqual(repo.getProjectionBindings(projectId),before.bindings);assert.deepEqual(repo.listSpatialMarkerIntents(projectId),before.markers);
  for(const [entry,initial] of [[await facade.spatial.read(main.value.canvasId),before.main],[await facade.spatial.read(context.value.canvasId),before.context]]){
    const clean=record=>{const copy=structuredClone(record);delete copy.version;delete copy.updatedAt;for(const n of copy.state.nodes){delete n.data.lcos_gui_navigation_pin;if(n.id===id)delete n.data.locked;}return copy;};assert.deepEqual(clean(entry),clean(initial));
  }
  checks.push('Original lock and explicit local-only protections remain; full Core graph/execution/bindings/marker records, ordinary body/label/geometry and other nodes are unchanged. Only tested GUI bool and original spatial counters differ.');
  report.passed=true;
}catch(error){report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{await facade?.close();globalThis.fetch=upstream;for(const key of Object.keys(process.env))if(/^(LCOS_|HUABU_|LOCAL_CORE_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|DEEPSEEK_)/.test(key))delete process.env[key];for(const [key,value]of saved)process.env[key]=value;await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,checks,error:report.error,output},null,2));
