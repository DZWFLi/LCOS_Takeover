import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const output=path.resolve('output/原方法移除恢复_20261023/Core',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(output,{recursive:true});
const runtime=await fs.mkdtemp(path.resolve('.runtime/workflow-lifecycle-owned-'));
const originalFetch=globalThis.fetch;globalThis.fetch=(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));if(url.hostname!=='127.0.0.1'||['56311','56321'].includes(url.port))throw new Error('Only this test owns its Core.');return originalFetch(input,init)};
const report={passed:false,runtime,checks:[]};let facade;
const options={runtimeRoot:runtime,publicOrigin:'http://127.0.0.1:19877',fullIntegration:true,nativeCollectionPilot:true,nativeTextPilot:true,nativeAssemblyPilot:true,nativeRailPilot:true};
try{
 const old=await import(pathToFileURL(path.resolve('.runtime/workflow-method-save-test/facade.mjs')));facade=await old.startSurfaceCoreFacade(options);
 const project=facade.core.projectId,repo=facade.core.repository,prefix='/api/lcos/core/projects/'+project,scope='scope-workflow-lifecycle-test';
 const call=(method,url,body)=>facade.handle({method,url,body}),unwrap=r=>r.body.value??r.body.data??r.body;
 const get=async route=>{const result=await call('GET',prefix+route);assert.equal(result.status,200);return unwrap(result)};
 const input={create:true,name:'生命周期验证方法',expectedGraphVersion:repo.get(project).graphVersion,presentations:[{id:'presentation:workflow:'+scope,expectedVersion:0,workflowActions:[{id:'step-keep',label:'保留原材料',description:'这段步骤不能丢',attachedViewIds:[],x:15,y:27}],workflowActionEdges:[],workflowOperators:{}}]};
 assert.equal((await call('PUT',prefix+'/workflow/methods/'+scope,input)).status,200);
 const graph=repo.get(project),view=repo.listPresentationViews(project).find(v=>v.scopeId===scope),material=String(graph.artifactViews[0].id),now=new Date().toISOString();
 repo.compareAndSwapPresentationView({...view,state:{...view.state,memberViewIds:[material],workflowActions:view.state.workflowActions.map(a=>({...a,attachedViewIds:[material]}))}},view.version);
 repo.runCurationMutation({projectId:project,collectionAdds:[{id:'life-collection',projectId:project,title:'引用方法的集合',createdAt:now,updatedAt:now}],
  collectionMembershipAdds:[{relationId:'life-member',projectId:project,collectionId:'life-collection',memberRef:{type:'scope',id:scope},addedAt:now}],
  workspaceEntityMembershipAdds:[{workspaceId:graph.workspaces[0].id,entityType:'scope',entityId:scope,addedBy:'user',addedAt:now}]});
 repo.insertPresentationView({schemaVersion:0,id:'life-context',projectId:project,scopeId:String(graph.scopes.find(s=>s.kind==='root').id),capability:'context',renderer:'context',version:0,createdAt:now,updatedAt:now,updatedBy:'web',state:{memberViewIds:[],memberEntityRefs:[{type:'scope',id:scope}],hiddenViewIds:[],positions:{},hierarchy:{parentByViewId:{},orderByParent:{}},presentationEdges:[],pinnedViewIds:[],emphasisByViewId:{}}});
 const before=repo.get(project),beforeViews=repo.listPresentationViews(project),beforeMembers=repo.listCollectionMemberships(project),beforeWorkspaceMembers=repo.listProjectWorkspaceEntityMemberships(project),dbPath=repo.databasePath;
 await facade.close();facade=null;let db=new DatabaseSync(dbPath,{readOnly:true});assert.equal(db.prepare('PRAGMA user_version').get().user_version,57);db.close();
 const next=await import(pathToFileURL(path.resolve('.runtime/workflow-lifecycle-test/facade.mjs')));facade=await next.startSurfaceCoreFacade(options);
 const migrated=facade.core.repository;
 db=new DatabaseSync(dbPath,{readOnly:true});assert.equal(db.prepare('PRAGMA user_version').get().user_version,58);db.close();
 const withoutLife=g=>({...g,scopes:g.scopes.map(({lifecycleVersion,...s})=>s)});
 assert.deepEqual(withoutLife(migrated.get(project)),before);assert.deepEqual(migrated.listPresentationViews(project),beforeViews);
 report.checks.push('Actual v57 database migrates to v58, preserving every existing Scope/Workspace/material and Presentation; all legacy scopes remain active.');
 const state=()=>migrated.getScopes(project).find(s=>s.id===scope),transition=(action,expectedVersion)=>call('POST',prefix+'/workflow/methods/'+scope+'/'+action,{expectedVersion});
 let result=await transition('archive',0);assert.equal(result.status,200,JSON.stringify(result.body));const first=unwrap(result);assert.ok(first.scope.archivedAt);assert.equal(first.scope.lifecycleVersion,1);assert.ok(first.changeSet);
 assert.ok(!(await get('/warehouse?kinds=workflow')).items.some(i=>i.entityRef.id===scope));assert.ok((await get('/warehouse?kinds=workflow&scopeLifecycle=archived')).items.some(i=>i.entityRef.id===scope));
 assert.deepEqual(migrated.listPresentationViews(project),beforeViews);assert.deepEqual(migrated.listCollectionMemberships(project),beforeMembers);assert.deepEqual(migrated.listProjectWorkspaceEntityMemberships(project),beforeWorkspaceMembers);
 assert.deepEqual(migrated.get(project).workspaces,before.workspaces);assert.deepEqual(migrated.get(project).artifactViews,before.artifactViews);
 const readMembers=await get('/collections/life-collection/members');assert.ok(JSON.stringify(readMembers).includes(scope));
 const afterArchive=migrated.get(project);result=await transition('archive',0);assert.equal(result.status,200);assert.equal(unwrap(result).changeSet,undefined);assert.deepEqual(migrated.get(project),afterArchive);
 report.checks.push('Archive is canonical and idempotent: active/removed lists agree, same method/steps/materials/worksite/Collection/Context references remain readable and intact.');
 const existing=migrated.listPresentationViews(project).find(v=>v.scopeId===scope),edit={...input,create:false,expectedGraphVersion:migrated.get(project).graphVersion,presentations:[{id:existing.id,expectedVersion:existing.version,workflowActions:existing.state.workflowActions,workflowActionEdges:[],workflowOperators:{}}]};
 assert.throws(()=>migrated.compareAndSwapPresentationView(existing,existing.version),/方法已移除/);
 assert.throws(()=>migrated.insertPresentationView({...existing,id:'must-not-create'}),/方法已移除/);
 assert.throws(()=>migrated.applyMutations({baseVersion:migrated.get(project).graphVersion,actorKind:'user',ops:[{type:'upsert_scope',scope:{...state(),name:'不能从旧图入口改名'}}]},project),/方法已移除/);
 assert.deepEqual(migrated.get(project),afterArchive);assert.deepEqual(migrated.listPresentationViews(project),beforeViews);
 assert.equal((await call('PUT',prefix+'/workflow/methods/'+scope,edit)).status,409);
 assert.equal((await call('PUT',prefix+'/presentations/'+encodeURIComponent(existing.id),{contract:existing,expectedVersion:existing.version})).status,400);
 for(const targetRef of [{kind:'workflow',id:scope},{kind:'workspace',id:'workspace:'+scope}]){
  const dropped=await call('POST',prefix+'/assembly/apply',{schemaVersion:1,projectId:project,targetRef,sourceRefs:[{kind:'artifactView',id:material},{kind:'capture',id:'must-not-materialize-into-removed-method'}]});
  assert.equal(dropped.status,200,JSON.stringify(dropped.body));assert.equal(unwrap(dropped).allApplied,false);assert.ok(unwrap(dropped).results.every(row=>row.status==='failed'&&row.message.includes('方法已移除')));
 }
 assert.deepEqual(migrated.get(project),afterArchive);assert.deepEqual(migrated.listPresentationViews(project),beforeViews);
 assert.equal((await transition('restore',0)).status,409);assert.ok(state().archivedAt);
 const history=async(action,id)=>{const response=await fetch(facade.core.origin+'/projects/'+project+'/change-sets/'+id+'/'+action,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const d=await response.json();return {status:response.status,value:d.value??d.data,error:d.error}};
 for(let round=0;round<2;round++){const undo=await history('revert',first.changeSet.id);assert.equal(undo.status,200,JSON.stringify(undo));assert.equal(undo.value.status,'reverted');assert.equal(state().archivedAt,undefined);const redo=await history('reapply',first.changeSet.id);assert.equal(redo.status,200,JSON.stringify(redo));assert.equal(redo.value.status,'applied');assert.ok(state().archivedAt);}
 const changed=state().lifecycleVersion;result=await transition('restore',changed);assert.equal(result.status,200);assert.equal(state().archivedAt,undefined);const restoredVersion=state().lifecycleVersion;
 assert.equal((await history('revert',first.changeSet.id)).status,409);assert.equal(state().lifecycleVersion,restoredVersion);
 assert.equal((await transition('archive',0)).status,409);assert.equal(state().archivedAt,undefined);
 const beforeAuditFailure=migrated.get(project);
 assert.throws(()=>migrated.runCurationMutation({projectId:project,scopeArchiveStates:[{scopeId:scope,expectedVersion:state().lifecycleVersion,archivedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}],changeSet:first.changeSet}));
 assert.deepEqual(migrated.get(project),beforeAuditFailure);
 report.checks.push('A real duplicate audit-record failure after the lifecycle update rolls back both the removed flag and lifecycle/project versions.');
 report.checks.push('Archived method edits reject. Original ChangeSet undo/redo works repeatedly; lifecycle versions advance and stale remove/recovery/history cannot overwrite a newer restoration.');
 const finalViews=migrated.listPresentationViews(project);assert.deepEqual(finalViews,beforeViews);assert.deepEqual(migrated.get(project).workspaces,before.workspaces);assert.deepEqual(migrated.listCollectionMemberships(project),beforeMembers);
 result=await transition('archive',state().lifecycleVersion);assert.equal(result.status,200);
 await facade.close();facade=null;facade=await next.startSurfaceCoreFacade(options);
 const persisted=facade.core.repository.getScopes(project).find(s=>s.id===scope);assert.ok(persisted.archivedAt);assert.equal((await get('/warehouse?kinds=workflow&scopeLifecycle=archived')).items.find(i=>i.entityRef.id===scope).title,'生命周期验证方法');
 result=await transition('restore',persisted.lifecycleVersion);assert.equal(result.status,200);
 report.checks.push('Actual Core restart retains removed state and references; restoration returns the same method identity to the active library.');
 report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await facade?.close();globalThis.fetch=originalFetch;}
console.log(JSON.stringify({...report,output},null,2));
