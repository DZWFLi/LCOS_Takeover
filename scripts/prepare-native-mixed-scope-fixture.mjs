import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const arg=process.argv.find(value=>value.startsWith('--base-url='));assert.ok(arg,'Supply the coordinated isolated URL.');
const address=new URL(arg.slice(11));assert.equal(address.protocol,'http:');assert.equal(address.hostname,'127.0.0.1');assert.equal(address.pathname,'/');
assert.ok(process.argv.includes('--prepare-synthetic'),'Explicitly prepare synthetic validation data.');
const coreArgument=process.argv.find(value=>value.startsWith('--core-base='));assert.ok(coreArgument,'Supply the verified original isolated Core URL.');
const coreAddress=new URL(coreArgument.slice(12));assert.equal(coreAddress.protocol,'http:');assert.equal(coreAddress.hostname,'127.0.0.1');assert.equal(coreAddress.pathname,'/');assert.equal(coreAddress.username,'');assert.equal(coreAddress.password,'');
const coreOrigin=coreAddress.origin;
const origin=address.origin,output=path.resolve('output/混合Scope取用_20261022');await fs.mkdir(output,{recursive:true});
const seed=JSON.parse(await fs.readFile('output/ScopeRun入口_20261022/fixture.json','utf8'));
const projectId=seed.projectId;assert.equal(projectId,'disposable-surface-core-facade');const prefix='/api/lcos/core/projects/'+projectId;
const ledgerFile=path.join(output,'准备回执.json');let ledger=[];try{ledger=JSON.parse(await fs.readFile(ledgerFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
async function request(route,method='GET',body){
  assert.ok(route.startsWith('/api/lcos/core/'),'Only original Core API routes may use the direct isolated Core.');
 const actualRoute=route.slice('/api/lcos/core'.length),actualUrl=coreOrigin+actualRoute;
 const receipt=method==='GET'?null:{at:new Date().toISOString(),base:coreOrigin,route,actualRoute,actualUrl,method,body,confirmed:false};
 if(receipt){ledger.push(receipt);await fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));}
 const response=await fetch(actualUrl,{method,redirect:'error',cache:'no-store',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const result=await response.json();if(receipt){Object.assign(receipt,{status:response.status,result});await fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));}
 assert.ok(response.ok&&result.ok===true,route+': '+JSON.stringify(result));if(receipt){receipt.confirmed=true;await fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));}return result.value;
}
const health=await(await fetch(origin+'/health')).json();assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');assert.equal(health.realCoreConnected,true);
const coreHealth=await(await fetch(coreOrigin+'/health')).json();assert.equal(coreHealth.status,'ok');assert.equal(coreHealth.service,'local-core');
const listenerPids=execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-NetTCPConnection -LocalPort ${Number(coreAddress.port)} -State Listen).OwningProcess | Select-Object -Unique`],{encoding:'utf8',windowsHide:true}).trim().split(/\s+/).filter(Boolean).map(Number);
assert.deepEqual(listenerPids,[health.pid],'Original Core must be hosted by the exact coordinated facade process.');
const initialCoreGraph=await request(prefix+'/graph'),expectedProjectRoot=path.resolve('.runtime/isolated-node-carry-20261020/synthetic-project');
assert.equal(path.resolve(initialCoreGraph.project.rootPath).toLowerCase(),expectedProjectRoot.toLowerCase());
const facadeGraph=await(await fetch(origin+prefix+'/graph')).json();assert.equal(facadeGraph.ok,true);assert.deepEqual(facadeGraph.value,initialCoreGraph);
const [initial,presentations,connected,review]=await Promise.all([request(prefix+'/graph'),request(prefix+'/presentations'),request(prefix+'/connected-conversations'),request('/api/lcos/core/runs/'+encodeURIComponent(seed.runId)+'/review')]);
assert.equal(initial.project.id,projectId);assert.equal(review.run.status,'created');assert.equal(review.dispatch.status,'planned');assert.equal(review.dispatch.attemptCount,0);assert.ok(!review.binding);
const originalPresentation=presentations.find(row=>row.id==='presentation:context:'+seed.scopeId);assert.ok(originalPresentation);
const textView=initial.artifactViews.find(row=>row.id===seed.source.artifactViewId);assert.ok(textView);
const artifact=initial.artifacts.find(row=>row.id===textView.artifactId),revision=initial.artifactRevisions.find(row=>row.id===textView.revisionId),file=initial.fileRecords.find(row=>row.id===revision?.fileRecordId);
assert.ok(artifact&&revision&&file);assert.equal(artifact.id,seed.artifactId);assert.equal(revision.artifactId,artifact.id);
assert.ok(['text/plain','text/markdown','text/csv','application/json','application/yaml','application/xml','text/html'].includes((file.mimeType??'').split(';')[0]));
const conversation=connected.find(row=>row.id===seed.conversationId);assert.ok(conversation?.conversationSessionId);
const note=initial.notes.find(row=>row.id===seed.noteId);assert.ok(note);
const scopeId='scope-synthetic-mixed-alltext-20261022',workspaceScopeId='scope-synthetic-mixed-workspace-20261022',workspaceId='workspace-synthetic-mixed-alltext-20261022';
const scopeTitle='混合 Scope 全文验证 · 20261022',workspaceTitle='混合 Scope 纯文本工作集 · 20261022';
const now=new Date().toISOString(),rootScope=initial.scopes.find(row=>row.kind==='root');assert.ok(rootScope);
const expectedScopes=[{id:scopeId,name:scopeTitle},{id:workspaceScopeId,name:'混合 Scope 工作集文本范围 · 20261022'}];
const latest=await request(prefix+'/graph');
for(const expected of expectedScopes){const matches=latest.scopes.filter(row=>row.id===expected.id);assert.ok(matches.length<=1);if(matches.length)assert.ok(matches[0].projectId===projectId&&matches[0].kind==='context'&&matches[0].name===expected.name);}
const added=expectedScopes.filter(expected=>!latest.scopes.some(row=>row.id===expected.id)).map(expected=>({...expected,projectId,parentScopeId:rootScope.id,containerViewId:null,kind:'context',createdAt:now,updatedAt:now}));
if(added.length){
 const justBefore=await request(prefix+'/graph');assert.deepEqual(justBefore,latest,'Concurrent graph change detected; preserve it rather than overwrite.');
 const accepted=await request(prefix+'/graph','POST',{baseVersion:latest.graphVersion,actorKind:'user',ops:added.map(scope=>({type:'upsert_scope',scope}))});
 assert.equal(accepted.appliedOps,added.length);
 const saved=await request(prefix+'/graph');
 for(const key of Object.keys(latest).filter(key=>!['scopes','graphVersion','project'].includes(key)))assert.deepEqual(saved[key],latest[key],'Preserve original graph field '+key);
 for(const key of Object.keys(latest.project).filter(key=>!['graphVersion','updatedAt'].includes(key)))assert.deepEqual(saved.project[key],latest.project[key],'Preserve original project field '+key);
 for(const row of latest.scopes)assert.deepEqual(saved.scopes.find(value=>value.id===row.id),row,'Preserve original Scope '+row.id);
}
const workspaces=await request(prefix+'/workspaces');let workspace=workspaces.find(row=>row.id===workspaceId);
if(!workspace)workspace=await request(prefix+'/workspaces','POST',{id:workspaceId,projectId,scopeId:workspaceScopeId,name:workspaceTitle,intent:'understand',viewport:{x:0,y:0,zoom:1},focusedViewIds:[textView.id],visibleLayers:['core'],contextPolicy:'selection-only',preferredSurface:'context',updatedAt:now});
assert.equal(workspace.scopeId,workspaceScopeId);assert.deepEqual(workspace.focusedViewIds,[textView.id]);assert.equal(workspace.canvasId,undefined,'Never fabricate an unopened Workspace canvas address.');
const memberRoute='/api/lcos/core/workspaces/'+encodeURIComponent(workspaceId)+'/members';let members=await request(memberRoute);
assert.ok(members.every(row=>row.artifactViewId===textView.id),'Unexpected existing Workspace member is preserved for inspection.');
if(!members.some(row=>row.artifactViewId===textView.id))members=await request(memberRoute,'POST',{viewIds:[textView.id],addedBy:'user'});
assert.deepEqual(members.map(row=>row.artifactViewId),[textView.id]);
async function ensurePresentation(id,views,refs){
 const list=await request(prefix+'/presentations'),found=list.find(row=>row.id==='presentation:context:'+id);
 const state={memberViewIds:views,memberEntityRefs:refs,hiddenViewIds:[],positions:{},hierarchy:{parentByViewId:{},orderByParent:{}},presentationEdges:[],pinnedViewIds:[],emphasisByViewId:{}};
 if(found){assert.deepEqual(found.state.memberViewIds,views);assert.deepEqual(found.state.memberEntityRefs??[],refs);return found;}
 return request(prefix+'/presentations/'+encodeURIComponent('presentation:context:'+id),'PUT',{expectedVersion:0,contract:{schemaVersion:0,id:'presentation:context:'+id,projectId,scopeId:id,capability:'context',renderer:originalPresentation.renderer,state,version:0,updatedBy:'web',createdAt:now,updatedAt:now}});
}
await ensurePresentation(workspaceScopeId,[textView.id],[]);
let collections=await request(prefix+'/collections');
async function ensureCollection(title,refs){
 const matches=collections.filter(row=>row.title===title);assert.ok(matches.length<=1,'Ambiguous synthetic Collection.');let value=matches[0];
 if(!value){assert.ok(!ledger.some(row=>row.route===prefix+'/collections'&&!row.confirmed&&row.body?.title===title),'Unknown prior create needs readback; do not duplicate.');value=await request(prefix+'/collections','POST',{title,members:refs});collections.push(value);}
 const snapshot=await request(prefix+'/collections/'+encodeURIComponent(value.id)+'/members');assert.deepEqual(snapshot.members.map(row=>row.memberRef),refs);return value;
}
const inner=await ensureCollection('混合 Scope 文本内层集合 · 20261022',[{type:'artifact',id:artifact.id},{type:'note',id:note.id},{type:'run',id:seed.runId}]);
const outer=await ensureCollection('混合 Scope 文本外层集合 · 20261022',[{type:'collection',id:inner.id},{type:'conversation',id:conversation.id},{type:'workspace',id:workspaceId}]);
const allRefs=[{type:'collection',id:outer.id},{type:'note',id:note.id},{type:'conversation',id:conversation.id},{type:'run',id:seed.runId},{type:'workspace',id:workspaceId},{type:'scope',id:workspaceScopeId}];
const presentation=await ensurePresentation(scopeId,[textView.id],allRefs);
const [after,afterPresentations,afterReview,capabilities]=await Promise.all([request(prefix+'/graph'),request(prefix+'/presentations'),request('/api/lcos/core/runs/'+encodeURIComponent(seed.runId)+'/review'),request(prefix+'/connected-conversations/'+encodeURIComponent(conversation.id)+'/collaboration-session')]);
assert.deepEqual(afterPresentations.find(row=>row.id===originalPresentation.id),originalPresentation,'Original PNG Scope is unchanged, including every mixed member.');
for(const key of ['artifacts','artifactRevisions','artifactViews','notes','fileRecords'])assert.deepEqual(after[key],initial[key],'Preserve existing '+key);
assert.equal(afterReview.dispatch.attemptCount,0);assert.equal(afterReview.dispatch.status,'planned');
const fixture={projectId,scopeId,scopeTitle,workspaceScopeId,workspace,outer,inner,presentationId:presentation.id,memberRefs:allRefs,textViewId:textView.id,artifactId:artifact.id,artifactTitle:artifact.title,revisionId:revision.id,fileRecordId:file.id,mimeType:file.mimeType,
 noteId:note.id,noteTitle:note.body.split('\n').find(line=>line.trim())?.slice(0,72).trim()||'空白附注',noteBody:note.body,conversationId:conversation.id,conversationSessionId:conversation.conversationSessionId,conversationTitle:conversation.label,runId:seed.runId,runTitle:seed.instruction,
 unsupportedScope:{id:seed.scopeId,title:seed.scopeTitle,presentation:originalPresentation},capabilities,preparedAt:new Date().toISOString(),pid:health.pid,coreIdentity:{origin:coreOrigin,pid:health.pid,health:coreHealth,rootPath:expectedProjectRoot},
 limitations:['New text-only Workspace is canonical and readable through actual membership, but unopened: no canvasId was fabricated.','Original PNG Scope and its collections remain unchanged for whole-selection failure and draft-preservation verification.']};
const fixtureFile=path.join(output,'fixture.json');await fs.writeFile(fixtureFile,JSON.stringify(fixture,null,2));
console.log(JSON.stringify({prepared:true,scopeId,workspaceId,outer:outer.id,inner:inner.id,canSend:capabilities.capabilities.canSend,fixtureFile,ledgerFile}));



