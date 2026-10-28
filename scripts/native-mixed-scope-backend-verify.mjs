import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const argument=process.argv.find(value=>value.startsWith('--base-url='));assert.ok(argument,'Supply the current coordinated isolated runtime.');
const address=new URL(argument.slice(11));assert.equal(address.protocol,'http:');assert.equal(address.hostname,'127.0.0.1');assert.equal(address.pathname,'/');
const verifyExisting=process.argv.includes('--verify-existing');assert.ok(verifyExisting||process.argv.includes('--create-planned'),'Explicitly permit original planned-only creates or select strict existing-receipt verification; never dispatch.');
const origin=address.origin,fixture=JSON.parse(await fs.readFile('output/混合Scope取用_20261022/fixture.json','utf8')),prefix='/api/lcos/core/projects/'+fixture.projectId;
const output=path.resolve('output/混合Scope取用_20261022/实际HTTP/'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const report={passed:false,origin,output,checks:[],requests:[],createdRuns:[],reusedRuns:[],failedAttempts:[],models:0,dispatches:0,
 limitations:['The original public HTTP API has no ContextManifest inventory endpoint. Whole-failure HTTP proves unchanged execution projection and no returned manifest identity; zero orphan-manifest writes must additionally be verified by the original-service repository integration test.']};
async function request(route,method='GET',body){
 assert.ok(route.startsWith('/api/lcos/core/'),'Only original Core routes.');
 if(method!=='GET')assert.ok(method==='POST'&&route===prefix+'/runs','No mutation other than original planned-only create is allowed.');
 const receipt={at:new Date().toISOString(),route,method,...(body?{body}:{}),confirmed:false};report.requests.push(receipt);
 if(method!=='GET')await fs.writeFile(path.join(output,'提交回执.json'),JSON.stringify(report.requests,null,2));
 const response=await fetch(origin+route,{method,redirect:'error',cache:'no-store',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const result=await response.json();Object.assign(receipt,{status:response.status,result,confirmed:true});
 if(method!=='GET')await fs.writeFile(path.join(output,'提交回执.json'),JSON.stringify(report.requests,null,2));return {response,result};
}
const get=async route=>{const {response,result}=await request(route);assert.ok(response.ok&&result.ok===true,route+': '+JSON.stringify(result));return result.value;};
const health=await(await fetch(origin+'/health')).json();assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');assert.equal(health.realCoreConnected,true);report.pid=health.pid;
const expected=process.argv.find(value=>value.startsWith('--expected-pid='));if(expected)assert.equal(health.pid,Number(expected.slice(15)));
try{
 const initialGraph=await get(prefix+'/graph'),initialPresentations=await get(prefix+'/presentations'),projection=await get(prefix+'/execution-projection');
 assert.equal(initialGraph.project.id,fixture.projectId);assert.deepEqual(initialPresentations.find(row=>row.id===fixture.unsupportedScope.presentation.id),fixture.unsupportedScope.presentation);
 const workspace=initialGraph.workspaces.find(row=>row.canvasId==='surface-core-main');assert.ok(workspace);
 const manifests=[];
 for(const mode of ['ordered-reference','saved-context']){
  const instruction='混合 Scope HTTP 全文验证 · '+mode+' · 20261022';
  const matches=projection.runs.filter(row=>row.title===instruction);assert.ok(matches.length<=1,'Ambiguous previous synthetic result.');
  let review;
  if(matches.length){review=await get('/api/lcos/core/runs/'+(matches[0].runId??matches[0].id)+'/review');report.reusedRuns.push(review.run.id);}
  else{
   assert.equal(verifyExisting,false,'Strict existing-receipt verification cannot create a missing Run.');
   assert.ok(report.createdRuns.length<2);
   const input={instruction,outputIntent:'analyze',workspaceId:workspace.id,contextArtifactIds:[],...(mode==='ordered-reference'?{orderedReferences:[{ref:{type:'scope',scopeId:fixture.scopeId},order:0,mode:'full'}]}:{savedContextId:fixture.scopeId})};
   const {response,result}=await request(prefix+'/runs','POST',input);assert.ok(response.ok&&result.ok===true,JSON.stringify(result));review=result.value.review;report.createdRuns.push(review.run.id);
  }
  assert.equal(review.run.status,'created');assert.equal(review.dispatch.status,'planned');assert.equal(review.dispatch.attemptCount,0);assert.ok(!review.binding);
  assert.equal(review.run.instruction,instruction);assert.equal(review.run.projectId,fixture.projectId);
  const recipe=await get('/api/lcos/core/runs/'+review.run.id+'/recipe'),manifest=await get(prefix+'/context-manifests/v0/'+recipe.contextManifestId),canonical=JSON.parse(manifest.canonicalJson);
  const items=canonical.orderedItems.filter(item=>item.scopeContext?.scopeId===fixture.scopeId);assert.equal(items.length,1,'One whole Scope retains one manifest aggregate.');
  const item=items[0],evidence=item.scopeContext.evidence;assert.equal(item.role,mode==='ordered-reference'?'reference':'context');assert.ok(item.content.includes('<untrusted-context'));
  const find=(type,id)=>evidence.filter(row=>row.ref.type===type&&row.ref.id===id);
  for(const [type,id]of [['scope',fixture.scopeId],['scope',fixture.workspaceScopeId],['collection',fixture.outer.id],['collection',fixture.inner.id],['note',fixture.noteId],['conversation',fixture.conversationId],['run',fixture.runId],['workspace',fixture.workspace.id],['view',fixture.textViewId]])assert.ok(find(type,id).length,'Full evidence includes '+type+':'+id);
  for(const note of find('note',fixture.noteId))assert.equal(note.content,fixture.noteBody);
  for(const conversation of find('conversation',fixture.conversationId)){
   assert.equal(conversation.source.connectedConversation.conversationSessionId,fixture.conversationSessionId);
   assert.equal(conversation.source.messages.length,2);assert.deepEqual(conversation.source.messages.map(message=>message.role),['user','assistant']);
   assert.ok(conversation.content.includes('没有请求模型，也没有发送新消息。'));
  }
  for(const run of find('run',fixture.runId)){assert.equal(run.source.run.status,'created');assert.ok(run.content.includes(fixture.runTitle));}
  for(const collection of find('collection',fixture.inner.id))assert.ok(JSON.stringify(collection.source).includes(fixture.noteId));
  for(const worksite of find('workspace',fixture.workspace.id))assert.deepEqual(worksite.source.membership.map(row=>row.artifactViewId),[fixture.textViewId]);
  const exactView=find('view',fixture.textViewId);assert.ok(exactView.every(row=>row.source.revision.id===fixture.revisionId&&row.source.revision.artifactId===fixture.artifactId));
  assert.ok(exactView.every(row=>typeof row.content==='string'&&row.content.length>0));
  const all=JSON.stringify(canonical);assert.ok(!all.includes('参考图（e2e fixture）'),'No incidental PNG/sibling set is substituted into an explicit text-only Scope.');
  manifests.push({mode,runId:review.run.id,recipe,manifest,scope:item});
  report.checks.push(mode+' uses actual registered original Core reader, one real stored whole-Scope manifest and all typed member text/provenance; task remains planned with zero attempts');
 }
 report.manifests=manifests;await fs.writeFile(path.join(output,'两条真实Manifest.json'),JSON.stringify(manifests,null,2));
 const beforeFailure=await get(prefix+'/execution-projection');
 for(const mode of ['ordered-reference','saved-context']){
  const body={instruction:'原图片 Scope 必须完整拒绝 · '+mode,outputIntent:'analyze',workspaceId:workspace.id,contextArtifactIds:[],...(mode==='ordered-reference'?{orderedReferences:[{ref:{type:'scope',scopeId:fixture.unsupportedScope.id},order:0,mode:'full'}]}:{savedContextId:fixture.unsupportedScope.id})};
  const {response,result}=await request(prefix+'/runs','POST',body);assert.equal(response.ok,false);assert.equal(result.ok,false);assert.equal(result.error.code,'MIXED_SCOPE_CONTENT_UNSUPPORTED');assert.match(result.error.message,/全文|图片|完整|文本|file|unsupported/i);
  assert.equal(result.value,undefined);assert.deepEqual(await get(prefix+'/execution-projection'),beforeFailure,'Whole PNG refusal must not create a Run.');report.failedAttempts.push({mode,status:response.status,error:result.error,runProjectionUnchanged:true,manifestIdReturned:false});
 }
 report.checks.push('Both original HTTP entry paths refuse the complete original PNG Scope, return no partial receipt and leave the execution projection unchanged');
 assert.deepEqual(await get(prefix+'/graph'),initialGraph);assert.deepEqual(await get(prefix+'/presentations'),initialPresentations);
 const originalRun=await get('/api/lcos/core/runs/'+fixture.runId+'/review');assert.equal(originalRun.dispatch.status,'planned');assert.equal(originalRun.dispatch.attemptCount,0);
 report.checks.push('Real stored graph, original PNG Scope, collections and input task remain unchanged; no dispatch/cancel/provider/model request made');
 report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,createdRuns:report.createdRuns,reusedRuns:report.reusedRuns,output,limitations:report.limitations},null,2));}

