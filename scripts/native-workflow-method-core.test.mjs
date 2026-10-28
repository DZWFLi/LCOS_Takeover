import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const output=path.resolve('output/原方法编辑接续_20261023/Core',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(output,{recursive:true});
const runtime=await fs.mkdtemp(path.resolve('.runtime/workflow-method-owned-'));
const facadeArg=process.argv.find(arg=>arg.startsWith('--facade='))?.slice('--facade='.length);
const {startSurfaceCoreFacade}=await import(pathToFileURL(path.resolve(facadeArg??'.runtime/workflow-method-save-test/facade.mjs')));
const facade=await startSurfaceCoreFacade({runtimeRoot:runtime,publicOrigin:'http://127.0.0.1:19876',fullIntegration:true,nativeCollectionPilot:true,nativeTextPilot:true,nativeAssemblyPilot:true,nativeRailPilot:true});
const {projectId,repository}=facade.core,prefix='/api/lcos/core/projects/'+projectId;
const report={passed:false,runtime,checks:[]};
const call=(method,url,body)=>facade.handle({method,url,body});
const unwrap=r=>r.body.value??r.body.data??r.body;
const graph=()=>repository.get(projectId),views=()=>repository.listPresentationViews(projectId);
const editable=view=>({id:view.id,expectedVersion:view.version,workflowActions:structuredClone(view.state.workflowActions??[]),workflowActionEdges:structuredClone(view.state.workflowActionEdges??[]),workflowOperators:structuredClone(view.state.workflowOperators??{})});
try{
 const before=graph(),scope='scope-workflow-real-core-test';
 const body={create:true,name:'原方法创建验证',expectedGraphVersion:before.graphVersion,presentations:[{id:'presentation:workflow:'+scope,expectedVersion:0,workflowActions:[{id:'test-step',label:'核对材料',description:'完整原文',attachedViewIds:[],x:0,y:0}],workflowActionEdges:[],workflowOperators:{}}]};
 let response=await call('PUT',prefix+'/workflow/methods/'+scope,body);assert.equal(response.status,200,JSON.stringify(response.body));
 assert.equal(graph().scopes.find(s=>s.id===scope)?.name,body.name);assert.equal(graph().workspaces.filter(w=>w.scopeId===scope).length,1);assert.equal(views().find(v=>v.scopeId===scope)?.state.workflowActions[0].description,'完整原文');
 assert.equal(graph().graphVersion,Number(before.graphVersion)+1);report.checks.push('One transaction creates canonical workflow Scope + Workspace + Presentation with real steps.');
 const afterCreate=graph();response=await call('PUT',prefix+'/workflow/methods/'+scope,body);assert.equal(response.status,409);assert.deepEqual(graph(),afterCreate);
 const seed=views().find(v=>v.scopeId===scope),material=String(graph().artifactViews[0].id);assert.ok(seed&&material);
 repository.compareAndSwapPresentationView({...seed,state:{...seed.state,memberViewIds:[material],workflowActions:seed.state.workflowActions.map(a=>({...a,attachedViewIds:[material]}))}},seed.version);
 const existing=views().find(v=>v.scopeId===scope);assert.ok(existing);
 const original=structuredClone(existing),model=editable(existing);model.workflowActions[0].description='更新的完整步骤说明';
 const binding=model.workflowActions[0].attachedViewIds[0]??existing.state.memberViewIds[0];assert.ok(binding);
 model.workflowOperators[binding]={kind:'condition',label:'检查是否齐全',branches:[{id:'branch-real-test',label:'齐全',predicateText:'全部材料已核对',targetViewId:binding}]};
 const update={create:false,name:'原方法编辑验证',expectedGraphVersion:graph().graphVersion,presentations:[model]};
 response=await call('PUT',prefix+'/workflow/methods/'+existing.scopeId,update);assert.equal(response.status,200,JSON.stringify(response.body));
 const updated=views().find(v=>v.id===existing.id);assert.equal(updated.version,existing.version+1);assert.deepEqual(updated.state.memberViewIds,original.state.memberViewIds);
 for(const key of Object.keys(original.state).filter(key=>!['workflowActions','workflowActionEdges','workflowOperators'].includes(key)))assert.deepEqual(updated.state[key],original.state[key],key);
 assert.equal(updated.state.workflowOperators[binding].branches[0].targetViewId,binding);report.checks.push('Rename, step edits and condition edits commit together; all existing membership, material bindings, geometry and other state remain intact.');
 const protectedGraph=graph(),protectedViews=views();
 for(const kind of ['graph','presentation','foreign-material','wrong-scope','bad-link','duplicate-step']){
  const patch={create:false,name:'不能半保存',expectedGraphVersion:protectedGraph.graphVersion,presentations:[editable(updated)]};let target=existing.scopeId;
  if(kind==='graph')patch.expectedGraphVersion--;
  if(kind==='presentation')patch.presentations[0].expectedVersion--;
  if(kind==='foreign-material')patch.presentations[0].workflowActions[0].attachedViewIds.push('foreign-view');
  if(kind==='wrong-scope')target=String(protectedGraph.scopes.find(s=>s.kind==='root').id);
  if(kind==='bad-link')patch.presentations[0].workflowActionEdges.push({id:'missing-edge',fromActionId:'missing',toActionId:'also-missing'});
  if(kind==='duplicate-step')patch.presentations[0].workflowActions.push(structuredClone(patch.presentations[0].workflowActions[0]));
  response=await call('PUT',prefix+'/workflow/methods/'+target,patch);assert.equal(response.status,409,kind);assert.deepEqual(graph(),protectedGraph,kind);assert.deepEqual(views(),protectedViews,kind);
 }
 report.checks.push('Stale graph/presentation, foreign material, non-workflow scope, broken edge and duplicate action reject without partial rename or state writes.');
 // Force a conflict after Scope upsert. The original transaction must roll it back.
 const collision='scope-workflow-workspace-collision';repository.upsertWorkspace({...graph().workspaces[0],id:'workspace:'+collision});
 const collisionBefore=graph(),collisionViews=views();response=await call('PUT',prefix+'/workflow/methods/'+collision,{...body,expectedGraphVersion:collisionBefore.graphVersion,presentations:[{...body.presentations[0],id:'presentation:workflow:'+collision}]});
 assert.equal(response.status,409);assert.deepEqual(graph(),collisionBefore);assert.deepEqual(views(),collisionViews);
 report.checks.push('Actual late Workspace identity collision rolls back the already-staged Scope; no half-created method or stolen workspace.');
 report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await facade.close();}
console.log(JSON.stringify({...report,output},null,2));
