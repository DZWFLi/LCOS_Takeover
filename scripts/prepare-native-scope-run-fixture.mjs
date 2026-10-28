import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const argument=process.argv.find(value=>value.startsWith('--base-url='));
assert.ok(argument,'Supply the coordinated isolated --base-url.');
const address=new URL(argument.slice(11));
assert.equal(address.protocol,'http:');assert.equal(address.hostname,'127.0.0.1');
assert.equal(address.pathname,'/');assert.equal(address.username,'');assert.equal(address.password,'');
assert.ok(process.argv.includes('--prepare-synthetic'),'Explicitly select synthetic fixture preparation.');
const origin=address.origin,output=path.resolve('output/ScopeRun入口_20261022');
await fs.mkdir(output,{recursive:true});
const sourceFixture=JSON.parse(await fs.readFile('output/Scope嵌套与跨现场_20261022/fixture.json','utf8'));
const fixtureFile=path.join(output,'fixture.json'),ledgerFile=path.join(output,'准备回执.json');
let ledger=[];try{ledger=JSON.parse(await fs.readFile(ledgerFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const prefix='/api/lcos/core/projects/'+sourceFixture.projectId;
async function request(route,method='GET',body){
  const receipt=method==='GET'?null:{at:new Date().toISOString(),route,method,body,confirmed:false};
  if(receipt){ledger.push(receipt);await fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));}
  const response=await fetch(origin+route,{method,redirect:'error',cache:'no-store',
    headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const result=await response.json();
  if(receipt){Object.assign(receipt,{status:response.status,result});await fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));}
  assert.ok(response.ok&&result.ok===true,route+': '+JSON.stringify(result));
  if(receipt){receipt.confirmed=true;await fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));}
  return result.value;
}
const health=await(await fetch(origin+'/health',{redirect:'error'})).json();
assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');assert.equal(health.realCoreConnected,true);
const [graph,workspaces,projection]=await Promise.all([request(prefix+'/graph'),request(prefix+'/workspaces'),request(prefix+'/execution-projection')]);
assert.equal(graph.project.id,sourceFixture.projectId);assert.equal(projection.projectId,sourceFixture.projectId);
assert.ok(graph.scopes.some(scope=>scope.id===sourceFixture.scopeId&&scope.kind==='context'));
const workspace=workspaces.find(value=>value.canvasId==='surface-core-main'&&value.projectId===sourceFixture.projectId);
assert.ok(workspace);
const artifact=graph.artifacts.find(value=>value.id===sourceFixture.artifactId);
assert.ok(artifact);
const views=graph.artifactViews.filter(value=>value.artifactId===artifact.id&&value.revisionId===artifact.currentRevisionId);
assert.ok(views.length>0,'Use an existing true View; do not manufacture task input.');
const view=views[0],instruction='人工 Scope Run 入口验证 · 20261022（仅创建，未执行）';
// Verified source owners: routes/runs.ts POST /projects/:pid/runs calls
// RuntimeApplicationService.create. It saves status=created/dispatch=planned;
// provider work belongs exclusively to /runs/:id/dispatch. No receiver/session is supplied.
const candidates=projection.runs.filter(value=>value.title===instruction);
assert.ok(candidates.length<=1,'Ambiguous fixture task; preserve it for inspection.');
let runId=candidates[0]?.runId??candidates[0]?.id;
if(!runId){
  // Recover a confirmed prior preparation even if the complete lightweight list has moved.
  const confirmed=ledger.findLast(value=>value.route===prefix+'/runs'&&value.confirmed&&value.body?.instruction===instruction);
  if(confirmed)runId=confirmed.result?.value?.review?.run?.id??confirmed.result?.value?.run?.id;
}
let review;
if(runId)review=await request('/api/lcos/core/runs/'+encodeURIComponent(runId)+'/review');
else{
  // An unknown previous create response cannot safely be repeated.
  assert.ok(!ledger.some(value=>value.route===prefix+'/runs'&&!value.confirmed),'Unconfirmed create receipt needs inspection; not creating a duplicate.');
  const created=await request(prefix+'/runs','POST',{instruction,outputIntent:'analyze',workspaceId:workspace.id,
    orderedReferences:[{ref:{type:'view',viewId:view.id},order:0}]});
  review=created.review??created;runId=review.run.id;
}
assert.equal(review.run.projectId,sourceFixture.projectId);assert.equal(review.run.instruction,instruction);
assert.equal(review.run.status,'created');assert.equal(review.dispatch.status,'planned');assert.equal(review.dispatch.attemptCount,0);
assert.ok(!review.binding,'Fixture must have no external provider binding.');
const recipe=await request('/api/lcos/core/runs/'+encodeURIComponent(runId)+'/recipe');
assert.equal(recipe.runId,runId);assert.equal(recipe.projectId,sourceFixture.projectId);assert.ok(recipe.contextManifestId);
const manifest=await request(prefix+'/context-manifests/v0/'+encodeURIComponent(recipe.contextManifestId));
assert.equal(manifest.id,recipe.contextManifestId);assert.equal(manifest.projectId,sourceFixture.projectId);
const canonical=JSON.parse(manifest.canonicalJson);
const input=canonical.orderedItems.find(value=>value.artifactId===artifact.id&&value.revisionId===view.revisionId);
assert.ok(input,'Core must preserve the exact real input in its manifest.');
const presentations=await request(prefix+'/presentations');
const presentation=presentations.find(value=>value.id==='presentation:context:'+sourceFixture.scopeId);assert.ok(presentation);
const beforeRefs=presentation.state.memberEntityRefs??[];
if(!beforeRefs.some(ref=>ref.type==='run'&&ref.id===runId))
  await request(prefix+'/presentations/'+encodeURIComponent(presentation.id),'PUT',{
    contract:{...presentation,state:{...presentation.state,memberEntityRefs:[...beforeRefs,{type:'run',id:runId}]}},
    expectedVersion:presentation.version});
const beforeMembers=await request(prefix+'/collections/'+sourceFixture.inner.id+'/members');
if(!beforeMembers.members.some(row=>row.memberRef.type==='run'&&row.memberRef.id===runId))
  await request(prefix+'/collections/'+sourceFixture.inner.id+'/members','POST',{memberType:'run',memberId:runId});
const [afterPresentations,afterMembers,afterProjection,afterReview]=await Promise.all([
  request(prefix+'/presentations'),request(prefix+'/collections/'+sourceFixture.inner.id+'/members'),
  request(prefix+'/execution-projection'),request('/api/lcos/core/runs/'+encodeURIComponent(runId)+'/review')]);
const afterPresentation=afterPresentations.find(value=>value.id===presentation.id);
for(const ref of beforeRefs)assert.ok(afterPresentation.state.memberEntityRefs.some(value=>value.type===ref.type&&value.id===ref.id),'Preserve every prior Scope member.');
for(const row of beforeMembers.members)assert.ok(afterMembers.members.some(value=>value.memberRef.type===row.memberRef.type&&value.memberRef.id===row.memberRef.id),'Preserve every prior Collection member.');
assert.equal(afterReview.run.status,'created');assert.equal(afterReview.dispatch.status,'planned');assert.equal(afterReview.dispatch.attemptCount,0);
assert.ok(afterProjection.runs.some(value=>(value.runId??value.id)===runId));
const fixture={...sourceFixture,runId,instruction,workspace,source:{artifactId:artifact.id,revisionId:view.revisionId,artifactViewId:view.id,title:artifact.title,
  manifestId:recipe.contextManifestId,manifestContent:input.content},preparedAt:new Date().toISOString(),pid:health.pid,
  createSemantics:'Core create only: created/planned, attemptCount=0, no dispatch/cancel/retry/provider invocation.'};
await fs.writeFile(fixtureFile,JSON.stringify(fixture,null,2));
console.log(JSON.stringify({prepared:true,runId,phase:afterReview.presentationPhase,runStatus:afterReview.run.status,dispatchStatus:afterReview.dispatch.status,ledgerFile,fixtureFile},null,2));


