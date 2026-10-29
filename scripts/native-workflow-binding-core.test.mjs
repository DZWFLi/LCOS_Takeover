import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const output=path.resolve('output/原方法材料与连线_20261023/Core',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(output,{recursive:true});
const runtime=await fs.mkdtemp(path.resolve('.runtime/workflow-binding-owned-'));
const {startSurfaceCoreFacade}=await import(pathToFileURL(path.resolve('.runtime/workflow-binding-test/facade.mjs')));
const options={runtimeRoot:runtime,publicOrigin:'http://127.0.0.1:19876',fullIntegration:true,nativeCollectionPilot:true,nativeTextPilot:true,nativeAssemblyPilot:true,nativeRailPilot:true};
let facade=await startSurfaceCoreFacade(options);const {projectId,repository}=facade.core,prefix='/api/lcos/core/projects/'+projectId;
const report={passed:false,runtime,checks:[]};
const graph=()=>repository.get(projectId),views=()=>repository.listPresentationViews(projectId),scope='scope-workflow-binding-test';
const editable=v=>({id:v.id,expectedVersion:v.version,memberViewIds:[...v.state.memberViewIds],workflowActions:structuredClone(v.state.workflowActions??[]),workflowActionEdges:structuredClone(v.state.workflowActionEdges??[]),workflowOperators:structuredClone(v.state.workflowOperators??{})});
const save=(item,name='材料连接验证')=>facade.handle({method:'PUT',url:prefix+'/workflow/methods/'+scope,body:{create:!graph().scopes.some(s=>s.id===scope),name,expectedGraphVersion:graph().graphVersion,presentations:[item]}});
try{
 const before=graph(),otherViews=views();
 const materials=before.artifactViews.filter(v=>{const a=before.artifacts.find(a=>a.id===v.artifactId),r=before.artifactRevisions.find(r=>r.id===(v.revisionId??a?.currentRevisionId));return !!r&&before.fileRecords.some(f=>f.id===r.fileRecordId)}).slice(0,3).map(v=>v.id);assert.equal(materials.length,3);
 const [a,b,c]=materials;
 const data={id:'presentation:workflow:'+scope,expectedVersion:0,memberViewIds:[a,b,c],workflowActions:[{id:'read',label:'阅读材料',description:'完整原文',attachedViewIds:[a,b],x:12,y:34},{id:'write',label:'整理结果',attachedViewIds:[c],x:56,y:78}],workflowActionEdges:[{id:'next',fromActionId:'read',toActionId:'write',label:'核对之后'}],workflowOperators:{'standalone-condition':{kind:'condition',label:'判断材料',branches:[{id:'yes',label:'齐全',predicateText:'全部核对完成',targetViewId:a},{id:'no',label:'补充',targetViewId:b}]}}};
 let r=await save(data);assert.equal(r.status,200,JSON.stringify(r.body));let current=views().find(v=>v.id===data.id);assert.deepEqual(current.state.memberViewIds,materials);
 report.checks.push('Real Core atomically creates material pool, per-step bindings, a directed connection and standalone condition branches.');
 // Set existing presentation geometry through its canonical repository, then detach a parent.
 const seeded={...current,version:current.version+1,state:{...current.state,positions:{[a]:{x:1,y:2},[b]:{x:3,y:4},[c]:{x:5,y:6}},hiddenViewIds:[a],pinnedViewIds:[a,c],emphasisByViewId:{[a]:'primary',[c]:'secondary'},gridLayout:{order:[a,b,c],columns:3},hierarchy:{parentByViewId:{[a]:null,[b]:a,[c]:null},orderByParent:{'':[a,c],[a]:[b]}},presentationEdges:[{id:'ab',fromViewId:a,toViewId:b},{id:'bc',fromViewId:b,toViewId:c}],memberEntityRefs:[{type:'view',id:a},{type:'view',id:c}],colonies:[{id:'only-a',surface:'workflow',memberIds:[a],contour:{points:[{x:0,y:0},{x:10,y:0},{x:10,y:10}]}},{id:'keep',surface:'workflow',memberIds:[a,b],contour:{points:[{x:0,y:0},{x:10,y:0},{x:10,y:10}]}}],surfaceElements:[{id:'compare',projectId,surface:'workflow',type:'compare',bounds:{x:1,y:2,w:300,h:100},binding:{projectViewId:a,projectViewIds:[a],workflowId:scope}}],trackSegments:[{id:'segment',memberViewIds:[a,c],order:0,collapsed:false}]}};
 assert.equal(repository.compareAndSwapPresentationView(seeded,current.version).updated,true);current=views().find(v=>v.id===data.id);
 const detached=editable(current);detached.memberViewIds=[b,c]; // Core also cleans old attached references atomically.
 r=await save(detached);assert.equal(r.status,200,JSON.stringify(r.body));current=views().find(v=>v.id===data.id);const s=current.state;
 assert.deepEqual(s.workflowActions[0].attachedViewIds,[b]);assert.equal(s.workflowOperators['standalone-condition'].branches[0].targetViewId,undefined);assert.equal(s.workflowOperators['standalone-condition'].branches[1].targetViewId,b);
 assert.deepEqual(s.positions,{[b]:{x:3,y:4},[c]:{x:5,y:6}});assert.deepEqual(s.gridLayout,{order:[b,c],columns:3});assert.deepEqual(s.hierarchy,{parentByViewId:{[b]:null,[c]:null},orderByParent:{'':[c,b]}});assert.deepEqual(s.presentationEdges,[seeded.state.presentationEdges[1]]);
 assert.deepEqual(s.colonies,[{...seeded.state.colonies[1],memberIds:[b]}]);assert.deepEqual(s.surfaceElements,[{...seeded.state.surfaceElements[0],binding:{workflowId:scope}}]);assert.deepEqual(s.trackSegments,[{...seeded.state.trackSegments[0],memberViewIds:[c]}]);assert.deepEqual(s.memberEntityRefs,[{type:'view',id:c}]);assert.deepEqual(s.pinnedViewIds,[c]);assert.deepEqual(s.hiddenViewIds,[]);assert.deepEqual(s.emphasisByViewId,{[c]:'secondary'});
 for(const k of ['artifacts','artifactViews','artifactRevisions','fileRecords'])assert.deepEqual(graph()[k],before[k],k);assert.deepEqual(views().filter(v=>v.scopeId!==scope),otherViews);
 report.checks.push('Explicit detach cleans only that method’s bindings, branch target, hierarchy/order, edges and view placement metadata; originals and other presentations remain byte-identical.');
 const archivedArtifacts=[a,b].map(id=>before.artifacts.find(artifact=>artifact.id===before.artifactViews.find(view=>view.id===id).artifactId));
 repository.runCurationMutation({projectId,artifactArchiveStates:archivedArtifacts.map(artifact=>({artifactId:artifact.id,archivedAt:new Date().toISOString(),updatedAt:artifact.updatedAt}))});
 assert.ok(graph().artifacts.find(artifact=>artifact.id===archivedArtifacts[0].id).archivedAt);
 r=await save(editable(current));assert.equal(r.status,200,JSON.stringify(r.body));current=views().find(v=>v.id===data.id);assert.deepEqual(current.state.memberViewIds,[b,c]);
 const archivedBefore=graph(),archivedViews=views(),tryNew=editable(current);tryNew.memberViewIds.push(a);r=await save(tryNew);assert.equal(r.status,409);assert.deepEqual(graph(),archivedBefore);assert.deepEqual(views(),archivedViews);
 repository.runCurationMutation({projectId,artifactArchiveStates:archivedArtifacts.map(artifact=>({artifactId:artifact.id,updatedAt:artifact.updatedAt}))});
 assert.deepEqual(graph().artifacts,before.artifacts);report.checks.push('Actual archived material keeps existing method bindings editable/readable; adding a new archived reference rejects atomically.');
 const protectedGraph=graph(),protectedViews=views();
 for(const kind of ['foreign-material','branch-target','self-edge','missing-edge','duplicate-material','invalid-structure']){
  const bad=editable(current);
  if(kind==='foreign-material')bad.memberViewIds.push('foreign');if(kind==='branch-target')bad.workflowOperators['standalone-condition'].branches[0].targetViewId=a;
  if(kind==='self-edge')bad.workflowActionEdges[0].toActionId='read';if(kind==='missing-edge')bad.workflowActionEdges[0].toActionId='missing';if(kind==='duplicate-material')bad.memberViewIds.push(b);if(kind==='invalid-structure')bad.workflowOperators['standalone-condition'].kind='unsupported';
  r=await save(bad,'不得半保存');assert.equal(r.status,409,kind);assert.deepEqual(graph(),protectedGraph,kind);assert.deepEqual(views(),protectedViews,kind);
 }
 report.checks.push('Invalid material, branch target, self/missing connection, duplicate member and unsupported operator all reject without partial rename or writes.');
 const exported=await fetch(facade.core.origin+'/projects/'+projectId+'/workflow/export?scopeId='+scope);assert.equal(exported.status,200);const bytes=await exported.arrayBuffer();
 const form=new FormData();form.set('name','分支导入验证');form.set('file',new Blob([bytes],{type:'application/zip'}),'method.lcos-workflow.zip');
 const imported=await fetch(facade.core.origin+'/projects/'+projectId+'/workflow/import-as-workflow',{method:'POST',body:form});const result=await imported.json();assert.equal(imported.status,201,JSON.stringify(result));
 const copy=views().find(v=>v.scopeId===(result.value??result.data).scopeId);assert.ok(copy);for(const key of ['memberViewIds','workflowActions','workflowActionEdges','workflowOperators','surfaceElements'])assert.deepEqual(copy.state[key],current.state[key],key);
 report.checks.push('Actual original ZIP export/import roundtrip retains standalone structures, full branch predicates, targets, step connections and exact material identities.');
 const stable=structuredClone(current);await facade.close();facade=await startSurfaceCoreFacade(options);assert.deepEqual(facade.core.repository.listPresentationViews(projectId).find(v=>v.id===stable.id),stable);
 report.checks.push('Closing and reopening the original Core preserves the exact saved method.');report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await facade.close();}
console.log(JSON.stringify({...report,output},null,2));
