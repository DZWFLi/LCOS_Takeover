import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Server } from 'node:net';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { createNativeCoreNavigationPinTransforms } from '../lab/native-core-navigation-pin-transform.mjs';
const root=path.resolve(import.meta.dirname,'..'),temp=await fs.mkdtemp(path.join(root,'.runtime/native-core-navigation-pin-'));
const output=path.resolve('output/导航固定与ColorPin_Agent接回_20261027/Core导航',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const report={passed:false,cases:[],requests:[],runtime:temp,models:0,rawSql:false,activeRuntimeTouched:false,scope:'Actual selected original Core HTTP/SQLite/MutationSafety and NavigationMarkerService; own ephemeral runtime. Archived/optional-scope fault inputs are explicitly controlled repository reads, not a schema claim.'};
for(const key of Object.keys(process.env))if(/API_KEY|TOKEN|SECRET|BASE_URL|_PROXY|^HUABU_|^LCOS_|^LOCAL_CORE_/.test(key))delete process.env[key];
process.env.LCOS_RECOVERY_TRANSPORT='none';process.env.LCOS_OLLAMA_URL='http://127.0.0.1:1';process.env.LCOS_CAPTURE_STAGING_ROOT=path.join(temp,'capture');process.env.LCOS_OCR_RUNTIME_DIR=path.join(temp,'ocr');
const originalFetch=globalThis.fetch;let core;
const owned=()=>new Set(process._getActiveHandles().filter(h=>h instanceof Server&&h.listening).map(h=>h.address()).filter(a=>a&&typeof a!=='string'&&a.address==='127.0.0.1').map(a=>'http://127.0.0.1:'+a.port));
globalThis.fetch=(input,options)=>{assert.ok(owned().has(new URL(input instanceof Request?input.url:String(input)).origin),'Only this process owned loopback listener');return originalFetch(input,options);};
const test=async(name,fn)=>{await fn();report.cases.push(name);};
try{
 const transforms=createNativeCoreNavigationPinTransforms();
 await test('Exact source seams, CRLF/idempotence, wrong owner and changed-source refusal',async()=>{for(const[file,transform]of Object.entries(transforms)){const source=await fs.readFile(path.join(root,file),'utf8'),fixed=transform(source,{sourcePath:path.join(root,file)});assert.notEqual(fixed,source);assert.equal(transform(fixed,{sourcePath:path.join(root,file)}),fixed);assert.throws(()=>transform(source,{sourcePath:path.join(root,'lab/unrelated.ts')}),/exact original source/);assert.throws(()=>transform('export const changed = true;',{sourcePath:path.join(root,file)}),/seam changed/);}});
 const entry=path.join(temp,'entry.ts');await fs.writeFile(entry,[
  "export {startCorePilot} from '../../lab/pilot/core-service';",
  "export {NavigationMarkerService} from '../../lcos/apps/local-core/src/navigation-marker-service';",
  "export {handleNavigationMarkersRoute} from '../../lcos/apps/local-core/src/routes/navigation-markers';",
  "export {MutationSafetyService} from '../../lcos/apps/local-core/src/mutation-safety-service';",
  "export {PresentationApplicationService} from '../../lcos/apps/local-core/src/presentation-application-service';",
  "export {createMvpSampleSnapshot} from '../../lcos/apps/local-core/src/mvp-sample-project';",
  "export {ContextManifestService} from '../../lcos/apps/local-core/src/context-manifest-service';",
 ].join('\n'));
 const bundle=await buildPilotEntry(path.relative(root,entry),path.join(temp,'actual-core.mjs'),'node',{coreColorPin:true,coreCollectionTitle:true});
 const app=await import(pathToFileURL(bundle));core=await app.startCorePilot({runtimeRoot:path.join(temp,'owned')});
 const repo=core.repository,pid=core.projectId,base='/projects/'+pid,now=new Date().toISOString(),rootScope=repo.getScopes(pid).find(row=>row.kind==='root');
 // Only this newly created fixture: remove unrelated synthetic sample files
 // before testing navigation, then use the original empty-context builder.
 const fixture=repo.get(pid);repo.save({...fixture,artifacts:[],artifactViews:[],fileRecords:[],artifactRevisions:[],relations:[],notes:[],checkpoints:[]});
 const request=async(method,url,body)=>{const response=await fetch(core.origin+url,{method,redirect:'error',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});const json=await response.json();report.requests.push({method,path:url,status:response.status});return{status:response.status,json};};
 const note=id=>repo.upsertNote({id,projectId:pid,anchor:{type:'project'},body:'Synthetic exact target',createdAt:now,updatedAt:now});
 const input=id=>({targetRef:{projectId:pid,kind:'entity',id},scope:'local',sourceSurfaceRef:'main'});
 const service=new app.MutationSafetyService(repo,new app.PresentationApplicationService(repo,repo));
 const markerCount=()=>repo.listSpatialMarkerIntents(pid).length,changeCount=()=>repo.listMutationChangeSets(pid,10000).length;
 const one='note-pin-repeat';note(one);let first;
 await test('Real HTTP repeat returns original marker200 with no extra ChangeSet',async()=>{const count=changeCount();first=await request('POST',base+'/spatial-markers',input(one));assert.equal(first.status,201,JSON.stringify(first.json));const original=repo.listSpatialMarkerIntents(pid);const repeat=await request('POST',base+'/spatial-markers',input(one));assert.equal(repeat.status,200);assert.deepEqual(repeat.json.value,first.json.value);assert.equal(repeat.json.meta,undefined);assert.deepEqual(repo.listSpatialMarkerIntents(pid),original);assert.equal(changeCount(),count+1);});
 await test('Real parallel same-target twelve requests create exactly one original transaction',async()=>{const id='note-pin-concurrent';note(id);const count=changeCount(),markers=markerCount();const receipts=await Promise.all(Array.from({length:12},()=>request('POST',base+'/spatial-markers',input(id))));assert.equal(receipts.filter(row=>row.status===201).length,1);assert.equal(receipts.filter(row=>row.status===200).length,11);assert.equal(new Set(receipts.map(row=>row.json.value.id)).size,1);assert.equal(markerCount(),markers+1);assert.equal(changeCount(),count+1);});
 await test('Scope/sourceSurfaceRef remain exact independent original identities',async()=>{const cross=await request('POST',base+'/spatial-markers',{targetRef:input(one).targetRef,scope:'cross-surface'});assert.equal(cross.status,201);const workspace=repo.getWorkspaces(pid)[0];const local=await request('POST',base+'/spatial-markers',{...input(one),sourceSurfaceRef:'workspace:'+workspace.id});assert.equal(local.status,201);assert.notEqual(cross.json.value.id,first.json.value.id);assert.notEqual(local.json.value.id,first.json.value.id);assert.equal((await request('POST',base+'/spatial-markers',{...input(one),sourceSurfaceRef:'workspace:'+workspace.id})).status,200);});
 await test('Legacy duplicates return409 preserving every record and ChangeSet',async()=>{service.addSpatialMarker({...input(one),projectId:pid,actorKind:'agent'});const before=repo.listSpatialMarkerIntents(pid),changes=changeCount();const result=await request('POST',base+'/spatial-markers',input(one));assert.equal(result.status,409);assert.deepEqual(repo.listSpatialMarkerIntents(pid),before);assert.equal(changeCount(),changes);});
 await test('Original unavailable MutationSafety guard wins before duplicate success',async()=>{const sent=[];await app.handleNavigationMarkersRoute({method:'POST',pathname:base+'/spatial-markers',metadata:repo,mutationSafety:undefined,controller:new AbortController(),request:{},response:{},helpers:{sendJson:(_res,status,body)=>sent.push({status,body}),failure:(code,message)=>({ok:false,error:{code,message}}),readJsonBody:async()=>input('note-pin-concurrent'),isRecord:value=>value!==null&&typeof value==='object'&&!Array.isArray(value)}});assert.equal(sent[0].status,503);});
 let collection,run;
 await test('Canonical Collection and created-only Run resolve through actual HTTP without executing Run',async()=>{collection=service.createCollection({projectId:pid,title:'Synthetic canonical Collection'}).collection;
  const manifest=await new app.ContextManifestService(repo).build(pid,{contextArtifactIds:[],orderedReferences:[]});
  run={id:'run-canonical-pin',projectId:pid,workspaceId:core.workspaceId,contextManifestId:manifest.id,provider:'codex',requestedProvider:'codex',outputIntent:'analyze',returnGroupId:'return-group-canonical-pin',status:'created',instruction:'Synthetic navigation identity only; never dispatch',createdAt:now,updatedAt:now};
  repo.createRunWithDispatch(run,{id:'dispatch-canonical-pin',runId:run.id,provider:'codex',idempotencyKey:run.id,status:'planned',attemptCount:0,createdAt:now,updatedAt:now});
  assert.equal(repo.getRun(run.id).status,'created');assert.equal(repo.getRuntimeDispatch(run.id).status,'planned');
  for(const entity of[collection,run]){const resolved=await request('POST',base+'/navigation/resolve',{targetRef:{projectId:pid,kind:'entity',id:entity.id}});assert.equal(resolved.status,200);assert.equal(resolved.json.value.status,'resolved');assert.equal(resolved.json.value.target.anchorRef,entity.id);assert.equal(resolved.json.value.target.worldPosition,undefined);if(entity===run)assert.equal(resolved.json.value.target.surfaceRef,'workspace:'+core.workspaceId);else assert.equal(resolved.json.value.target.surfaceRef,'main');}
 });
 await test('New canonical types join existing cross-table collision count',async()=>{const id=run.id;repo.insertCollection({...collection,id});const resolved=await request('POST',base+'/navigation/resolve',{targetRef:{projectId:pid,kind:'entity',id}});assert.equal(resolved.json.value.status,'unresolved');note(collection.id);const collision=await request('POST',base+'/navigation/resolve',{targetRef:{projectId:pid,kind:'entity',id:collection.id}});assert.equal(collision.json.value.status,'unresolved');});
 await test('Actual original resolver optional-scope/archive/fault reads never guess a fallback',async()=>{const nav=new app.NavigationMarkerService(repo),original=repo.getCollection.bind(repo),id='controlled-typed-owner';
  const resolve=value=>{repo.getCollection=key=>key===id?value:original(key);return nav.resolveNavigationTarget(pid,{projectId:pid,kind:'entity',id});};
  try{const entity={...collection,id};const main=resolve(entity);assert.equal(main.status,'resolved');assert.equal(main.target.worldPosition,undefined);
   const scoped=resolve({...entity,scopeId:rootScope.id});assert.equal(scoped.target.surfaceRef,'main');
   const workspace=repo.getWorkspaces(pid)[0];const own=resolve({...entity,workspaceId:workspace.id,scopeId:'fault-unused-scope'});assert.equal(own.target.surfaceRef,'workspace:'+workspace.id);assert.equal(own.target.worldPosition,undefined);
   for(const fault of[{archivedAt:now},{workspaceId:'missing'},{workspaceId:''},{scopeId:'missing'},{scopeId:''}])assert.equal(resolve({...entity,...fault}).status,'unresolved');
   assert.equal(resolve({...entity,projectId:'foreign'}).status,'unresolved');
   const originalWorkspace=repo.getWorkspace.bind(repo),originalScopes=repo.getScopes.bind(repo);
   try{
    for(const fault of[{projectId:'foreign'},{archivedAt:now}]){repo.getWorkspace=key=>key===workspace.id?{...workspace,...fault}:originalWorkspace(key);assert.equal(resolve({...entity,workspaceId:workspace.id}).status,'unresolved');}
    repo.getWorkspace=originalWorkspace;repo.getScopes=project=>originalScopes(project).map(row=>row.id===workspace.scopeId?{...row,archivedAt:now}:row);
    assert.equal(resolve({...entity,workspaceId:workspace.id}).status,'unresolved');assert.equal(resolve({...entity,scopeId:workspace.scopeId}).status,'unresolved');
   }finally{repo.getWorkspace=originalWorkspace;repo.getScopes=originalScopes;}
  }finally{repo.getCollection=original;}
 });
 await test('Original cross-project/source validation and exact removal remain active',async()=>{const before=markerCount();assert.equal((await request('POST',base+'/spatial-markers',{...input(one),targetRef:{...input(one).targetRef,projectId:'foreign'}})).status,422);assert.equal((await request('POST',base+'/spatial-markers',{...input(one),sourceSurfaceRef:'workspace:missing'})).status,422);assert.equal(markerCount(),before);const id=repo.listSpatialMarkerIntents(pid).find(row=>row.targetRef.id==='note-pin-concurrent').id;assert.equal((await request('DELETE',base+'/spatial-markers/'+id)).status,200);assert.equal(repo.listSpatialMarkerIntents(pid).some(row=>row.id===id),false);});
 report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await core?.close();globalThis.fetch=originalFetch;await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,report:path.join(output,'report.json'),error:report.error,models:0},null,2));}
