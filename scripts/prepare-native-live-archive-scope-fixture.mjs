import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const value=name=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
const output=path.resolve('output/健康恢复卡与断线续聊_20261023');await fs.mkdir(output,{recursive:true});
const originalFile='output/混合Scope取用_20261022/fixture.json',originalText=await fs.readFile(originalFile,'utf8'),baseFixture=JSON.parse(originalText);
const liveConversationId=value('live-conversation')??'connected-conversation-b0b62164-091e-4656-b495-40da78541bf0';
const scopeId='scope-synthetic-live-archive-resume-20261023',scopeTitle='真实归档与断线恢复 Scope · 20261023',presentationId='presentation:context:'+scopeId;
const refs=[{type:'scope',id:baseFixture.scopeId},{type:'conversation',id:liveConversationId}];
if(!process.argv.includes('--execute-prepare')){
 const plan={preparedOnly:true,requests:0,modelCalls:0,scopeId,scopeTitle,memberEntityRefs:refs,originalFixtureUnchanged:true,
  flow:'Create one new explicit synthetic Scope through original Core upsert_scope and Presentation producer; preserve original all-text/PNG scopes; reference the existing all-text Scope plus the exact live canonical conversation.'};
 await fs.writeFile(path.join(output,'完整Scope准备方案.json'),JSON.stringify(plan,null,2));console.log(JSON.stringify(plan));process.exit(0);
}
const checkedUrl=name=>{const url=new URL(value(name));assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/');assert.equal(url.username,'');assert.equal(url.password,'');return url;};
assert.ok(value('base-url')&&value('core-base')&&value('expected-pid'),'Supply the coordinated isolated facade, original Core and PID.');
const facade=checkedUrl('base-url'),core=checkedUrl('core-base'),projectId=baseFixture.projectId;assert.equal(projectId,'disposable-surface-core-facade');
const prefix='/projects/'+encodeURIComponent(projectId),ledgerFile=path.join(output,'完整Scope准备回执.json'),ledger=[];
const getJson=async url=>{const response=await fetch(url,{signal:AbortSignal.timeout(20000),cache:'no-store',redirect:'error'}),body=await response.json();assert.ok(response.ok);return body;};
const health=await getJson(facade.origin+'/health');assert.equal(health.pid,Number(value('expected-pid')));assert.equal(health.realCoreConnected,true);assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');
const coreHealth=await getJson(core.origin+'/health');assert.equal(coreHealth.service,'local-core');
const pids=execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-NetTCPConnection -LocalPort ${Number(core.port)} -State Listen).OwningProcess | Select-Object -Unique`],{encoding:'utf8',windowsHide:true}).trim().split(/\s+/).filter(Boolean).map(Number);assert.deepEqual(pids,[health.pid]);
async function request(route,method='GET',body){
 const actual=core.origin+route,receipt=method==='GET'?undefined:{at:new Date().toISOString(),base:core.origin,route,method,body,confirmed:false};
 if(receipt){ledger.push(receipt);await fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));}
 const response=await fetch(actual,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000),redirect:'error',cache:'no-store'}),result=await response.json();
 if(receipt){Object.assign(receipt,{status:response.status,confirmed:response.ok&&result.ok===true});await fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));}
 assert.ok(response.ok&&result.ok===true,'Original Core fixture producer did not confirm '+route);return result.value;
}
const [initial,presentations,connected,sessions]=await Promise.all([request(prefix+'/graph'),request(prefix+'/presentations'),request(prefix+'/connected-conversations'),request(prefix+'/conversations')]);
assert.equal(initial.project.id,projectId);assert.equal(path.resolve(initial.project.rootPath).toLowerCase(),path.resolve('.runtime/isolated-node-carry-20261020/synthetic-project').toLowerCase());
const facadeGraph=await getJson(facade.origin+'/api/lcos/core'+prefix+'/graph');assert.equal(facadeGraph.ok,true);assert.deepEqual(facadeGraph.value,initial);
const live=connected.find(row=>row.id===liveConversationId);assert.ok(live?.conversationSessionId);const liveSession=sessions.find(row=>row.id===live.conversationSessionId);assert.ok(liveSession);
const messages=await request(prefix+'/conversations/'+encodeURIComponent(liveSession.id)+'/messages?offset=0&limit=100');assert.ok(Array.isArray(messages)&&messages.length>=4);assert.deepEqual(messages.slice(0,4).map(row=>row.role),['user','assistant','user','assistant']);assert.ok(messages[1].contentText.includes('真实续聊验证一'));assert.ok(messages[3].contentText.includes('真实续聊验证二'));
const basePresentation=presentations.find(row=>row.id===baseFixture.presentationId),pngPresentation=presentations.find(row=>row.id===baseFixture.unsupportedScope.presentation.id);assert.ok(basePresentation&&pngPresentation);
const root=initial.scopes.find(row=>row.kind==='root');assert.ok(root);
const now=new Date().toISOString(),existing=initial.scopes.find(row=>row.id===scopeId);
if(existing){assert.equal(existing.projectId,projectId);assert.equal(existing.name,scopeTitle);assert.equal(existing.kind,'context');}
else{
 const latest=await request(prefix+'/graph');assert.equal(latest.graphVersion,initial.graphVersion,'Concurrent graph changed; do not overwrite it.');
 const scope={id:scopeId,name:scopeTitle,projectId,parentScopeId:root.id,containerViewId:null,kind:'context',createdAt:now,updatedAt:now};
 const result=await request(prefix+'/graph','POST',{baseVersion:latest.graphVersion,actorKind:'user',ops:[{type:'upsert_scope',scope}]});assert.equal(result.appliedOps,1);
}
const state={memberViewIds:[],memberEntityRefs:refs,hiddenViewIds:[],positions:{},hierarchy:{parentByViewId:{},orderByParent:{}},presentationEdges:[],pinnedViewIds:[],emphasisByViewId:{}};
const savedPresentations=await request(prefix+'/presentations'),found=savedPresentations.find(row=>row.id===presentationId);
if(found){assert.equal(found.projectId,projectId);assert.equal(found.scopeId,scopeId);assert.deepEqual(found.state.memberViewIds,[]);assert.deepEqual(found.state.memberEntityRefs,refs);}
else await request(prefix+'/presentations/'+encodeURIComponent(presentationId),'PUT',{expectedVersion:0,contract:{schemaVersion:0,id:presentationId,projectId,scopeId,capability:'context',renderer:basePresentation.renderer,state,version:0,updatedBy:'web',createdAt:now,updatedAt:now}});
const [after,afterPresentations]=await Promise.all([request(prefix+'/graph'),request(prefix+'/presentations')]);
for(const scope of initial.scopes)assert.deepEqual(after.scopes.find(row=>row.id===scope.id),scope);
assert.deepEqual(afterPresentations.find(row=>row.id===basePresentation.id),basePresentation);assert.deepEqual(afterPresentations.find(row=>row.id===pngPresentation.id),pngPresentation);assert.equal(await fs.readFile(originalFile,'utf8'),originalText);
const fixture={...baseFixture,scopeId,scopeTitle,presentationId,memberRefs:refs,baseScopeId:baseFixture.scopeId,baseScopeTitle:baseFixture.scopeTitle,liveConversationId,liveConversationSessionId:liveSession.id,
 baselineLiveMessages:messages,liveOriginMeta:liveSession.originMeta,preparedAt:new Date().toISOString(),pid:health.pid,
 limitations:['Original fixture Scope and PNG Scope are unchanged.','Each new Scope read truthfully includes the current reserved pending user turn; it never invents a pending assistant reply.']};
const fixtureFile=path.join(output,'fixture.json');await fs.writeFile(fixtureFile,JSON.stringify(fixture,null,2));console.log(JSON.stringify({prepared:true,fixtureFile,scopeId,liveConversationId,baselineMessages:messages.length,mutations:ledger.length,modelCalls:0}));
