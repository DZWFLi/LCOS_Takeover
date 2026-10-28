import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
const origin=new URL(process.argv.find(v=>v.startsWith('--base-url='))?.slice(11)??'http://127.0.0.1:56311').origin;
assert.equal(new URL(origin).hostname,'127.0.0.1');assert.ok(process.argv.includes('--prepare-synthetic'));
const output=path.resolve('output/Scope嵌套与跨现场_20261022'),fixturePath=path.join(output,'fixture.json'),fixture=JSON.parse(await fs.readFile(fixturePath,'utf8'));
const prefix='/api/lcos/core/projects/'+fixture.projectId,ledger=path.join(output,'跨现场准备回执.json');let history=[];try{history=JSON.parse(await fs.readFile(ledger,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const request=async(address,method='GET',body)=>{let row;if(method!=='GET'){row={address,method,body,confirmed:false};history.push(row);await fs.writeFile(ledger,JSON.stringify(history,null,2));}
 const response=await fetch(origin+address,{method,redirect:'error',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined}),result=await response.json();
 if(row){Object.assign(row,{status:response.status,result});await fs.writeFile(ledger,JSON.stringify(history,null,2));}assert.ok(response.ok&&result.ok===true,JSON.stringify(result));if(row){row.confirmed=true;await fs.writeFile(ledger,JSON.stringify(history,null,2));}return result.value;};
const health=await(await fetch(origin+'/health')).json();assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');assert.equal(health.realCoreConnected,true);
const workspaces=await request(prefix+'/workspaces'),context=workspaces.find(row=>row.canvasId==='surface-core-context'),workflow=workspaces.find(row=>row.canvasId==='surface-core-workflow');assert.ok(context&&workflow);
const rows=await request(prefix+'/presentations'),presentation=rows.find(row=>row.id==='presentation:context:'+fixture.scopeId);assert.ok(presentation);
const refs=presentation.state.memberEntityRefs??[];
if(!refs.some(ref=>ref.type==='workspace'&&ref.id===context.id))await request(prefix+'/presentations/'+encodeURIComponent(presentation.id),'PUT',{
 contract:{...presentation,state:{...presentation.state,memberEntityRefs:[...refs,{type:'workspace',id:context.id}]}},expectedVersion:presentation.version});
const members=await request(prefix+'/collections/'+fixture.inner.id+'/members');
if(!members.members.some(row=>row.memberRef.type==='workspace'&&row.memberRef.id===workflow.id))await request(prefix+'/collections/'+fixture.inner.id+'/members','POST',{memberType:'workspace',memberId:workflow.id});
fixture.cross={context,workflow};await fs.writeFile(fixturePath,JSON.stringify(fixture,null,2));console.log(JSON.stringify({prepared:true,cross:fixture.cross,ledger},null,2));
