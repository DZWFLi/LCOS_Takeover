import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
const root=path.resolve(import.meta.dirname,'..'),runtime=await fs.mkdtemp(path.join(root,'.runtime/frame-title-wire-'));
const output=path.join(root,'output/普通Frame标题原sender_20261028',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const report={passed:false,runtimeRoot:runtime,cases:[],outgoing:[],scope:'Unmodified full production startup-surface-core fetch wrapper + production intent to real facade/Huabu/isolated Core. Controlled upstream routes call facade.handle; no browser, model or active Core. Original O8 is independently covered by native-ordinary-frame-history.test.mjs.'};
const secretPattern=/^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|OPENROUTER_|DEEPSEEK_)/;
const priorEnv=new Map(Object.entries(process.env).filter(([key])=>secretPattern.test(key))),oldFetch=globalThis.fetch;
for(const key of priorEnv.keys())delete process.env[key];
process.env.LCOS_RECOVERY_TRANSPORT='none';process.env.LCOS_OLLAMA_URL='http://127.0.0.1:1';
process.env.LCOS_CAPTURE_STAGING_ROOT=path.join(runtime,'capture');process.env.LCOS_OCR_RUNTIME_DIR=path.join(runtime,'ocr');
globalThis.fetch=async(input,init={})=>{const u=new URL(input instanceof Request?input.url:String(input));assert.equal(u.protocol,'http:');assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname));
 assert.ok(process._getActiveHandles().some(h=>h instanceof Server&&h.listening&&String(h.address()?.port)===u.port),'Only this process-owned isolated Core');return oldFetch(input,{...init,redirect:'error'});};
let facade;
try{
 const entry=path.join(runtime,'entry.ts'),relative=file=>path.relative(runtime,path.join(root,file)).replaceAll('\\','/');
 await fs.writeFile(entry,'export{startSurfaceCoreFacade}from '+JSON.stringify(relative('lab/pilot/surface-core-facade.ts'))+';export{space}from '+JSON.stringify(relative('lcos/huabu/apps/server/src/modules/storage/index.ts'))+';');
 const mod=await import(pathToFileURL(await buildPilotEntry(path.relative(root,entry),path.join(runtime,'entry.mjs'),'node',{coreColorPin:true,coreCollectionTitle:true,coreWorkspaceMembership:true,coreWorkflowCollectionMembers:true,coreMixedScopeContext:true})));
 facade=await mod.startSurfaceCoreFacade({runtimeRoot:path.join(runtime,'owned'),publicOrigin:'http://127.0.0.1:19947',fullIntegration:true,nativeCollectionPilot:true,nativeTextPilot:true,nativeAssemblyPilot:true,nativeRailPilot:true});
 const canvasId='surface-core-main',projectId=facade.core.projectId,nodeId='wire-title-frame',canvasPath='/api/canvas/v1/canvases/'+canvasId,batchPath=canvasPath+'/nodes:batchActions';
 const result=await facade.spatial.execute(canvasId,[{type:'CREATE_NODES',nodes:[{id:nodeId,nodeType:'frame',position:{x:1800,y:1000},size:{width:440,height:300},data:{label:'原标题',sizing:'manual',layoutMode:'free'}}]}]);assert.ok(result.results.every(x=>x.applied===true));
 const baseline=structuredClone(await facade.spatial.read(canvasId)),graph=structuredClone(facade.core.repository.get(projectId)),bindings=structuredClone(facade.core.repository.getProjectionBindings(projectId));
 const bytes=await Promise.all(graph.fileRecords.map(async r=>({id:r.id,path:r.observedPath,bytes:await fs.readFile(r.observedPath)})));
 let liveNodes=[],currentNodesRef={current:liveNodes};
 const b={console,Date,Promise,Map,Set,WeakMap,Object,Array,Math,Number,String,Boolean,JSON,structuredClone,setTimeout,clearTimeout,URL,Request,Response,crypto:{randomUUID},location:{href:'http://127.0.0.1:19947/canvas/'+canvasId,origin:'http://127.0.0.1:19947'}};b.window=b;
 const cx=vm.createContext(b);
 vm.runInContext(await fs.readFile(path.join(root,'lab/startup-history-intent.js'),'utf8'),cx,{filename:'startup-history-intent.js'});
 const intent=b.__LCOS_NATIVE_INTENT__,ownerApi={getNode:id=>liveNodes.find(n=>n.id===id)};
 ownerApi.backfillNodeReceipt=input=>intent.backfillHistoryReceipt({...input,currentNodesRef,setTextReceiptNodes:next=>{liveNodes=next;}});
 b.__LCOS_NODE_LAB__={api:ownerApi,projectId,canvasId,currentCanvasId:canvasId};
 b.fetch=async(input,init={})=>{const url=new URL(input instanceof Request?input.url:String(input),b.location.href),method=String(init.method??'GET').toUpperCase();assert.equal(url.origin,b.location.origin);
   const body=init.body?JSON.parse(init.body):undefined;report.outgoing.push({method,path:url.pathname,...(body?{body}: {})});
   const r=await facade.handle({method,url:url.pathname+url.search,body});return new Response(JSON.stringify(r.body),{status:r.status,headers:{'content-type':'application/json'}});};
 vm.runInContext(await fs.readFile(path.join(root,'lab/startup-surface-core.js'),'utf8'),cx,{filename:'startup-surface-core.js'});
 const get=await b.fetch(canvasPath);assert.equal(get.status,200);const dto=await get.json();liveNodes=dto.data.nodes;currentNodesRef.current=liveNodes;
 const canonical=liveNodes.find(n=>n.lcos_revision_id);assert.ok(canonical,'The real GET must seed a nonempty canonical revision map');
 report.canonicalMapSample={nodeId:canonical.id,revisionId:canonical.lcos_revision_id};
 const before=liveNodes.find(n=>n.id===nodeId);assert.equal(before.data.title,'原标题');
 const operation={version:1,operationId:randomUUID(),kind:'frame-title',phase:'apply',title:{nodeId,before:'原标题',after:'新标题',beforeLabel:'原标题'}};
 const after={...before,data:{...before.data,title:'新标题'}};
 assert.equal(intent.queueFrameTitleIntent({canvasId,projectId,api:ownerApi,isCurrent:()=>true,operation,beforeNode:before,afterNode:after}).ok,true);
 liveNodes=liveNodes.map(n=>n.id===nodeId?after:n);currentNodesRef.current=liveNodes;
 const body={canvas_id:canvasId,created_by_role:'user',lcos_operation:operation,lcos_refs:{},lcos_snapshots:{},actions:[{action:'update',updates:[{id:nodeId,type:'group',position:before.position,data:after.data}]}]};
 const send=body=>b.fetch(batchPath,{method:'POST',body:JSON.stringify(body)});
 for(const [field,value]of [['lcos_expected_revisions',{[canonical.id]:canonical.lcos_revision_id}],['lcos_refs',{[nodeId]:{version:1}}],['lcos_snapshots',{[nodeId]:{data:{}}}],['lcos_expected_revisions',null],['lcos_refs',[]],['unexpected_title_capability',true]]){
   const count=report.outgoing.length;await assert.rejects(send({...body,[field]:value}));assert.equal(report.outgoing.length,count,'Invalid metadata must be rejected before actual transport');assert.deepEqual(await facade.spatial.read(canvasId),baseline);
 }
 report.cases.push('Actual full wrapper rejects explicit nonempty revisions/refs/snapshots and malformed/unknown metadata before transport; no implicit stripping or stored change');
 const apply=await send({...body,lcos_expected_revisions:{}}),payload=await apply.json();assert.equal(apply.status,200,JSON.stringify(payload));assert.equal(payload.data.frame_title_receipt.title,'新标题');
 const outgoing=report.outgoing.at(-1).body;assert.deepEqual(Object.keys(outgoing).sort(),['actions','canvas_id','created_by_role','lcos_operation']);assert.deepEqual(outgoing.actions,[{action:'update',updates:[{id:nodeId,data:{title:'新标题'}}]}]);
 assert.equal(intent.readFrameTitleResult(canvasId,nodeId).ok,true);assert.equal(liveNodes.find(n=>n.id===nodeId).data.label,'新标题');assert.equal((await mod.space(canvasId).nodes.read(nodeId)).record.label,'新标题');
 report.cases.push('Actual wrapper after real nonempty canonical GET drops only empty explicit maps, never adds the unrelated Canvas revision map, emits exact four-field title wire and obtains real Core/Huabu ACK + original label backfill');
 for(const phase of ['undo','redo','undo']){
   const op={...operation,phase},desired=phase==='undo'?'原标题':'新标题';liveNodes=liveNodes.map(n=>n.id===nodeId?{...n,data:{...n.data,title:desired}}:n);currentNodesRef.current=liveNodes;
   const r=await send({...body,lcos_operation:op,actions:[{action:'update',updates:[{id:nodeId,data:{title:desired}}]}]}),p=await r.json();assert.equal(r.status,200,JSON.stringify(p));assert.equal(p.data.frame_title_receipt.phase,phase);assert.equal((await mod.space(canvasId).nodes.read(nodeId)).record.label,desired);
   assert.equal(Object.hasOwn(report.outgoing.at(-1).body,'lcos_expected_revisions'),false);
 }
 report.cases.push('Same full wrapper and real backend accept phase-specific Undo/Redo/Undo title wire with canonical revisions still remembered; exact original label restored');
 const plain=await b.fetch(batchPath,{method:'POST',body:JSON.stringify({canvas_id:canvasId,created_by_role:'user',actions:[]})});await plain.json();
 assert.deepEqual(report.outgoing.at(-1).body.lcos_expected_revisions,{[canonical.id]:canonical.lcos_revision_id,...Object.fromEntries(dto.data.nodes.filter(n=>n.lcos_revision_id&&n.id!==canonical.id).map(n=>[n.id,n.lcos_revision_id]))});
 report.cases.push('Non-Frame original wrapper still attaches its observed whole Canvas canonical revision map; no ordinary text authorization behavior changed');
 const final=structuredClone(await facade.spatial.read(canvasId)),protectedSpatial=x=>{delete x.version;delete x.updatedAt;for(const n of x.state.nodes)if(n.id===nodeId)delete n.data.labelSource;return x;};
 assert.deepEqual(protectedSpatial(final),protectedSpatial(baseline));assert.deepEqual(facade.core.repository.get(projectId),graph);assert.deepEqual(facade.core.repository.getProjectionBindings(projectId),bindings);
 for(const row of bytes)assert.ok((await fs.readFile(row.path)).equals(row.bytes));report.protectedFacts={domain:true,bindings:true,spatialExceptFrameLabelSourceAndVersion:true,originalFiles:bytes.length};report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await facade?.close();globalThis.fetch=oldFetch;for(const key of Object.keys(process.env))if(secretPattern.test(key))delete process.env[key];for(const[key,value]of priorEnv)process.env[key]=value;
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,cases:report.cases,report:path.join(output,'report.json'),error:report.error},null,2));}
