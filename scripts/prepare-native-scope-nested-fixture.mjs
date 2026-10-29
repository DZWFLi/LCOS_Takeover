import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const origin = new URL(process.argv.find(value => value.startsWith('--base-url='))?.slice(11) ?? 'http://127.0.0.1:56311').origin;
assert.equal(new URL(origin).hostname,'127.0.0.1'); assert.ok(process.argv.includes('--prepare-synthetic'));
const projectId='disposable-surface-core-facade',prefix='/api/lcos/core/projects/'+projectId;
const output=path.resolve('output/Scope嵌套与跨现场_20261022');await fs.mkdir(output,{recursive:true});
const ledger=path.join(output,'准备回执.json');let history=[];try{history=JSON.parse(await fs.readFile(ledger,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const request=async(address,method='GET',body)=>{const item=method==='GET'?null:{address,method,body,at:new Date().toISOString(),confirmed:false};
 if(item){history.push(item);await fs.writeFile(ledger,JSON.stringify(history,null,2));}
 const response=await fetch(origin+address,{method,redirect:'error',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const result=await response.json();if(item){Object.assign(item,{status:response.status,result});await fs.writeFile(ledger,JSON.stringify(history,null,2));}
 assert.ok(response.ok&&result.ok===true,address+': '+JSON.stringify(result));if(item){item.confirmed=true;await fs.writeFile(ledger,JSON.stringify(history,null,2));}return result.value;};
const health=await(await fetch(origin+'/health')).json();assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');assert.equal(health.realCoreConnected,true);
const graph=await request(prefix+'/graph'),scope=graph.scopes.find(row=>row.id==='scope-surface-core-context');assert.ok(scope);
const note=graph.notes.find(row=>row.id==='note-project-mvp-boundary');assert.ok(note);
const marker='scope-nested-return-20261022',title='Scope 嵌套对话 · 人工历史';
const [connected,sessions]=await Promise.all([request(prefix+'/connected-conversations'),request(prefix+'/conversations')]);
let conversation=connected.find(row=>row.conversationRef===marker),imported=sessions.find(row=>row.title===title);
assert.ok(connected.filter(row=>row.conversationRef===marker).length<=1&&sessions.filter(row=>row.title===title).length<=1);
if(!conversation)conversation=await request(prefix+'/connected-conversations','POST',{action:'connect',provider:'codex',executorId:'synthetic-scope-nested',conversationRef:marker,label:title});
if(!imported){const result=await request(prefix+'/conversations/import-manual','POST',{title,scopeId:scope.id,entries:[
 {role:'user',contentText:'人工导入：从 Scope 进入这个既有对话，再回到原集合和原输入。'},
 {role:'assistant',contentText:'这是一段人工准备的嵌套入口验证历史；没有请求模型，也没有发送新消息。'}]});imported=result.session;}
if(conversation.conversationSessionId!==imported.id){assert.ok(!conversation.conversationSessionId,'Existing different linked session is preserved');
 const result=await request(prefix+'/connected-conversations/'+encodeURIComponent(conversation.id)+'/link-session','POST',{conversationSessionId:imported.id});conversation=result.connectedConversation;}
const artifact=graph.artifacts.find(row=>row.title==='Workflow · 交付现场');assert.ok(artifact);
let collections=await request(prefix+'/collections');
async function ensureCollection(title,members){let value=collections.find(row=>row.title===title);assert.ok(collections.filter(row=>row.title===title).length<=1);
 if(!value){value=await request(prefix+'/collections','POST',{title,members});collections=[...collections,value];}
 const snapshot=await request(prefix+'/collections/'+encodeURIComponent(value.id)+'/members');
 assert.deepEqual(snapshot.members.map(row=>row.memberRef).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),members.slice().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));return value;}
const inner=await ensureCollection('Scope 嵌套内层集合 · 20261022',[{type:'artifact',id:artifact.id},{type:'note',id:note.id}]);
const outer=await ensureCollection('Scope 嵌套外层集合 · 20261022',[{type:'collection',id:inner.id},{type:'conversation',id:conversation.id},{type:'scope',id:scope.id}]);
const presentations=await request(prefix+'/presentations'),presentation=presentations.find(row=>row.id==='presentation:context:'+scope.id);assert.ok(presentation);
const added=[{type:'collection',id:outer.id},{type:'note',id:note.id},{type:'conversation',id:conversation.id}];
const beforeRefs=presentation.state.memberEntityRefs??[],extra=added.filter(ref=>!beforeRefs.some(existing=>existing.type===ref.type&&existing.id===ref.id));
if(extra.length)await request(prefix+'/presentations/'+encodeURIComponent(presentation.id),'PUT',{contract:{...presentation,state:{...presentation.state,memberEntityRefs:[...beforeRefs,...extra]}},expectedVersion:presentation.version});
const fixture={projectId,scopeId:scope.id,scopeTitle:scope.name,noteId:note.id,noteTitle:note.body.split('\n').find(line=>line.trim())?.slice(0,72).trim()||'空白附注',noteBody:note.body,
 conversationId:conversation.id,conversationTitle:title,outer,inner,artifactId:artifact.id,artifactTitle:artifact.title};
await fs.writeFile(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));console.log(JSON.stringify({prepared:true,fixture,ledger},null,2));
