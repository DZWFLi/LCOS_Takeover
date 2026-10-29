import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Reuse source extraction/environment setup only. All actions below execute
// the transformed original O8/r6/request hooks and production wrapper/port.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixtureSource=fs.readFileSync(path.join(root,'scripts/native-text-retry.test.mjs'),'utf8');
const boundary="\ntry {\n  const { context, page } = await fixture('success');";
assert.equal(fixtureSource.split(boundary).length,2);
let setup=fixtureSource.slice(0,fixtureSource.indexOf(boundary));
function replaceOnce(before,after){assert.equal(setup.split(before).length,2,before);setup=setup.replace(before,after)}
replaceOnce("path.join(root, 'output/原流程收口_20261017d/原队列重试验证')","path.join(root, 'output/原生文本整合_20261017e/原历史正文独立验证')");
const serializerSeam="parseOriginalDonorScript(queueModule, 'actual-native-queue.js');";
replaceOnce(serializerSeam,`assert.equal(queueModule.split('{handleNodeChange:Ve,handleEdgeChange:We,executeBatchOperations:je}').length,2);queueModule=queueModule.replace('{handleNodeChange:Ve,handleEdgeChange:We,executeBatchOperations:je}','{handleNodeChange:Ve,handleEdgeChange:We,executeBatchOperations:je,readOriginalPending:()=>structuredClone(g.current)}');\n${serializerSeam}`);
replaceOnce("if(text){\n   if(f.mode==='conflict')","if(text){\n   if(body.lcos_expected_revisions?.n!==f.snapshot.revisionId)return f.response({ok:false,error:{code:'STALE_REVISION',message:'Exact independent history CAS conflict',details:{nodeId:'n'}}},409);\n   if(f.mode==='conflict')");
replaceOnce("if(f.mode==='lost')throw","if(f.mode==='lost'||f.mode==='history-lost')throw");
replaceOnce("f.lastTextRequest={body:structuredClone(body),result:structuredClone(result)};","f.lastTextRequest={body:structuredClone(body),result:structuredClone(result)};const requestId=url.searchParams.get('lcos_text_save_request');if(requestId){f.receipts??={};f.receipts[requestId]={requestId,canvasId:'c',wireBody:structuredClone(body),status:200,body:structuredClone(result)}}");
const receiptPeer=`  if(!f.receiptAvailable||!f.lastTextRequest)return f.response({ok:false},404);
  const requestId=decodeURIComponent(url.pathname.split('/').at(-1));
  const wireBody=structuredClone(f.lastTextRequest.body);
  if(f.wrongReceiptWire)wireBody.actions[0].updates[0].data.text='someone else';
  return f.response({ok:true,value:{requestId,canvasId:'c',wireBody,status:200,body:f.lastTextRequest.result}});`;
replaceOnce(receiptPeer,`  const requestId=decodeURIComponent(url.pathname.split('/').at(-1)),receipt=f.receipts?.[requestId];
  if(!f.receiptAvailable||!receipt)return f.response({ok:false},404);
  const value=structuredClone(receipt);if(f.wrongReceiptWire)value.wireBody.actions[0].updates[0].data.text='someone else';
  return f.response({ok:true,value});`);
replaceOnce("if(url.pathname.includes('/curation/canvas-text'))return f.response({ok:true,value:structuredClone(f.snapshot)});","if(url.pathname.includes('/curation/canvas-text')){const value=structuredClone(f.snapshot);if(f.holdNextCoreRead){f.holdNextCoreRead=false;return new Promise(resolve=>{f.releaseCoreRead=()=>resolve(f.response({ok:true,value}))})}return f.response({ok:true,value})}");
replaceOnce("const[nodes,setNodes]=React.useState(f.nodes),[edges,setEdges]=React.useState(f.edges);f.nodes=nodes;f.edges=edges;","const[nodes,setNodes]=React.useState(f.nodes),[edges,setEdges]=React.useState(f.edges);f.nodes=nodes;f.edges=edges;f.replacePrimary=()=>setNodes(previous=>previous.map(node=>node.id==='n'?{...node,data:{...node.data,text:'replacement B must stay',lcos_ref:{...node.data.lcos_ref,entityId:'b',artifactId:'b',artifactViewId:'bv',revisionId:'br1'}}}:node));");
replaceOnce("  if(f.mode==='ordinary-fail'&&f.attempts[key]<5)","  if(f.holdOrdinaryResponse&&ids.includes('ordinary-blocker'))return new Promise(resolve=>{f.releaseOrdinary=()=>resolve(f.response({code:0,data:{}}))});\n  if(f.mode==='ordinary-fail'&&f.attempts[key]<5)");

const driver=String.raw`
report.kind='Independent strict transformed original O8/r6/request/wrapper/port native-history regression; controlled peer/store/clock, no full App or running Core writes.';
async function detailed(page){return page.evaluate(()=>({requests:fixture.requests,pending:window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending(),queue:fixture.queue.readOriginalPending(),raw:fixture.rawHistory(),history:fixture.history.inspectNativeHistory({canvasId:'c',nodeId:'n'}),nodes:fixture.nodes,corePeer:fixture.snapshot,backfills:fixture.backfills,failed:fixture.registry.failed.has('c')}));}
const targetPosts=value=>value.requests.filter(request=>request.method==='POST'&&request.path.endsWith('/nodes:batchActions')&&request.body.actions.some(action=>action.updates?.some(node=>node.id==='n'&&typeof node.data?.text==='string')));
const currentFrame=value=>value.raw[value.history.currentIndex].state.nodes.find(node=>node.id==='n');
async function advance(page,ms=1602){await pump(page,ms);await pump(page,2)}
async function noPending(page){await page.waitForFunction(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length===0,null,{polling:10,timeout:3000});return detailed(page)}
async function prepare(action){
 const opened=await fixture('success',true),{page}=opened;
 await page.evaluate(()=>fixture.save('History exact final body'));await advance(page);await settled(page);
 await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.acknowledge(fixture.saveResult.operationId));await advance(page,2);
 let value=await noPending(page);assert.equal(value.corePeer.revisionId,'r2');assert.equal(value.history.currentIndex,1);assert.equal(value.history.historySize,2);assert.equal(currentFrame(value).data.lcos_ref.revisionId,'r2');
 if(action==='redo'){await page.evaluate(()=>fixture.history.undo());await advance(page);value=await noPending(page);assert.equal(value.corePeer.body,'before');assert.equal(value.corePeer.revisionId,'r3');assert.equal(value.history.currentIndex,0)}
 return {...opened,before:value,baseline:targetPosts(value).length};
}
async function ownerAction(page,action,mode='history-lost'){
 await page.evaluate(({action,mode})=>{fixture.mode=mode;fixture.historyActionResult=null;fixture.historyActionPromise=Promise.resolve(fixture.history[action]()).then(value=>{fixture.historyActionResult=value;return value})},{action,mode});await advance(page);
}
async function backoffs(page,baseline){const checkpoints=[];for(const ms of [2600,5100,10100,25100,60000]){await advance(page,ms);const value=await detailed(page);assert.equal(targetPosts(value).length-baseline,1,'the actual original backoff/cooldown must not replay the registered history write');checkpoints.push({ms,posts:targetPosts(value).length-baseline,pending:value.pending})}await originalAction(page,'flush');await originalAction(page,'retry');await advance(page,1602);assert.equal(targetPosts(await detailed(page)).length-baseline,1);return checkpoints}
async function verifyOnly(page){
 const before=await detailed(page),operation=before.pending.find(value=>value.source==='native-history');assert.ok(operation,'real original history operation owns the recovery identity');
 await page.evaluate(()=>{fixture.receiptAvailable=true;fixture.mode='success'});
 const result=await page.evaluate(operationId=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(operationId),operation.operationId);assert.equal(result.status,'confirmed');await advance(page,2);const after=await noPending(page);assert.equal(targetPosts(after).length,targetPosts(before).length,'exact history verification is GET-only');assert.ok(after.requests.slice(before.requests.length).some(request=>request.method==='GET'&&request.path.includes('/text-save-receipts/')));return {result,before,after};
}
try{
 for(const action of ['undo','redo']){
  const{page,context,before,baseline}=await prepare(action);await ownerAction(page,action);
  let value=await detailed(page),operation=value.pending[0],first=targetPosts(value)[baseline];
  assert.equal(operation?.source,'native-history');assert.equal(operation.historyPhase,action);assert.equal(operation.body,action==='undo'?'before':'History exact final body');assert.ok(first.query.includes('lcos_text_save_request'));assert.equal(targetPosts(value).length-baseline,1);assert.equal(value.corePeer.body,operation.body);assert.notEqual(value.corePeer.revisionId,first.body.lcos_expected_revisions.n);
  const checkpoints=await backoffs(page,baseline),verified=await verifyOnly(page);value=verified.after;
  assert.equal(currentFrame(value).data.text,value.corePeer.body);assert.equal(currentFrame(value).data.lcos_ref.revisionId,value.corePeer.revisionId);assert.equal(value.history.currentIndex,action==='undo'?0:1);assert.equal(value.history.historySize,2);assert.deepEqual(value.queue,[]);
  const next=action==='undo'?'redo':'undo',confirmedRevision=value.corePeer.revisionId;await ownerAction(page,next,'success');const changed=await noPending(page);assert.equal(targetPosts(changed).length-baseline,2);assert.equal(targetPosts(changed).at(-1).body.lcos_expected_revisions.n,confirmedRevision);assert.equal(currentFrame(changed).data.text,changed.corePeer.body);assert.equal(currentFrame(changed).data.lcos_ref.revisionId,changed.corePeer.revisionId);assert.equal(changed.history.currentIndex,action==='undo'?1:0);assert.equal(changed.history.historySize,2);
  await page.evaluate(()=>fixture.unmount());await advance(page,60000);assert.equal(targetPosts(await detailed(page)).length-baseline,2);
  report.checks.push({name:'original-'+action+'-loss-is-held-across-backoff-and-real-retry-GET-restores-raw-ref-next-direction-uses-confirmed-CAS',before,checkpoints,verified,changed});await context.close();
 }
 for(const action of ['undo','redo']){
  const{page,context,before,baseline}=await prepare(action);await ownerAction(page,action);const first=await detailed(page),opposite=action==='undo'?'redo':'undo';await ownerAction(page,opposite);
  const queued=await detailed(page);assert.equal(targetPosts(queued).length-baseline,1);assert.ok(queued.queue.length>=2,'the actual original g retains both attempted and later opposite history DTOs');assert.equal(queued.nodes[0].data.text,action==='undo'?'History exact final body':'before');assert.equal(queued.history.currentIndex,action==='undo'?1:0);
  const verified=await verifyOnly(page);let value=verified.after;assert.equal(value.nodes[0].data.text,queued.nodes[0].data.text,'old history receipt cannot overwrite the already queued opposite state');assert.equal(value.history.currentIndex,queued.history.currentIndex);assert.equal(value.history.historySize,2);assert.equal(targetPosts(value).length-baseline,1);const queuedView=await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.readQueuedAutosave('n'));assert.ok(queuedView?.canResume&&queuedView.count>0);
  assert.equal(await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.resumeAutosave('n')),true,'explicit production resume wakes the same original g, never a fixture retry surrogate');await advance(page);value=await noPending(page);assert.equal(targetPosts(value).length-baseline,2);assert.equal(targetPosts(value).at(-1).body.lcos_expected_revisions.n,verified.after.corePeer.revisionId);assert.equal(value.corePeer.body,queued.nodes[0].data.text);assert.equal(currentFrame(value).data.text,value.corePeer.body);assert.equal(currentFrame(value).data.lcos_ref.revisionId,value.corePeer.revisionId);assert.equal(value.history.currentIndex,queued.history.currentIndex);assert.equal(value.history.historySize,2);assert.deepEqual(value.queue,[]);
  report.checks.push({name:'original-'+action+'-unknown-retains-opposite-'+opposite+'-GET-only-then-explicit-original-resume',before,first,queued,verified,resumed:value});await context.close();
 }
 {
  const{page,context,before,baseline}=await prepare('undo');await ownerAction(page,'undo');await page.evaluate(()=>{fixture.addOrdinary();fixture.addLink()});await advance(page);let value=await detailed(page);assert.equal(targetPosts(value).length-baseline,1);assert.equal(value.requests.filter(request=>request.method==='POST'&&request.path.endsWith('/nodes:batchActions')&&request.body.actions.some(action=>action.creates?.some(node=>node.id==='ordinary'))).length,1);assert.equal(value.requests.filter(request=>request.method==='POST'&&request.path.endsWith('/connections:batchActions')).length,1);
  await page.evaluate(()=>fixture.unmount());await advance(page,60000);await originalAction(page,'retry');await advance(page,60000);value=await detailed(page);assert.equal(targetPosts(value).length-baseline,1);assert.ok(value.pending.some(operation=>operation.source==='native-history'));assert.ok(value.queue.some(item=>item.id==='n'));
  report.checks.push({name:'held-original-history-text-allows-ordinary-node-links-and-cleanup-never-replays',before,...value});await context.close();
 }
 {
  const{page,context,before,baseline}=await prepare('undo');await page.evaluate(()=>{fixture.backfillAllowed=false});await ownerAction(page,'undo','success');let value=await detailed(page);assert.equal(value.pending[0]?.source,'native-history');assert.equal(value.pending[0]?.status,'history-receipt-rejected');assert.equal(targetPosts(value).length-baseline,1);await backoffs(page,baseline);await page.evaluate(()=>{fixture.backfillAllowed=true});const verified=await verifyOnly(page);value=verified.after;assert.equal(currentFrame(value).data.lcos_ref.revisionId,value.corePeer.revisionId);assert.equal(value.history.currentIndex,0);assert.equal(value.history.historySize,2);report.checks.push({name:'native-history-http200-Core-match-without-original-O8-acceptance-cannot-confirm',before,verified});await context.close();
 }
 for(const replacement of ['api','primary']){
  const{page,context,before,baseline}=await prepare('undo');await page.evaluate(()=>{fixture.holdNextCoreRead=true});await ownerAction(page,'undo','success');await page.waitForFunction(()=>typeof fixture.releaseCoreRead==='function',null,{polling:10,timeout:3000});
  await page.evaluate(replacement=>{if(replacement==='api')window.__LCOS_NODE_LAB__.api={...window.__LCOS_NODE_LAB__.api};else fixture.batch(()=>fixture.replacePrimary());fixture.releaseCoreRead()},replacement);await advance(page);let value=await detailed(page);assert.equal(targetPosts(value).length-baseline,0,'an old history preflight cannot POST into a replaced API/primary');assert.ok(value.pending.some(operation=>operation.source==='native-history'));if(replacement==='primary'){assert.equal(value.nodes[0].data.text,'replacement B must stay');assert.equal(value.nodes[0].data.lcos_ref.artifactId,'b')};await advance(page,60000);assert.equal(targetPosts(await detailed(page)).length-baseline,0);report.checks.push({name:'original-history-preflight-'+replacement+'-replacement-holds-with-zero-POST',before,...value,limitation:'No claim of manual reattachment/recovery of the original scene.'});await context.close();
 }
 for(const replacement of ['api','primary','same-owner']){
  const{page,context,before,baseline}=await prepare('undo');
  await page.evaluate(()=>{fixture.holdOrdinaryResponse=true;fixture.serialBlockerPromise=fetch('/api/canvas/v1/canvases/other/nodes:batchActions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({canvas_id:'other',actions:[{action:'update',updates:[{id:'ordinary-blocker',type:'note',data:{text:'Controlled concurrent ordinary HTTP, not a second queue'}}]}]})})});
  await page.waitForFunction(()=>typeof fixture.releaseOrdinary==='function',null,{polling:10,timeout:3000});await ownerAction(page,'undo','success');await page.waitForFunction(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending({canvasId:'c',nodeId:'n'})?.status==='waiting-batch',null,{polling:10,timeout:3000});const prepared=await detailed(page);assert.equal(targetPosts(prepared).length-baseline,0);assert.equal(prepared.pending[0].source,'native-history');
  await page.evaluate(replacement=>{if(replacement==='api')window.__LCOS_NODE_LAB__.api={...window.__LCOS_NODE_LAB__.api};if(replacement==='primary')fixture.batch(()=>fixture.replacePrimary());fixture.releaseOrdinary()},replacement);await advance(page);let value=await detailed(page);
  if(replacement==='same-owner'){value=await noPending(page);assert.equal(targetPosts(value).length-baseline,1);assert.ok(targetPosts(value).at(-1).query.includes('lcos_text_save_request'));assert.equal(value.corePeer.body,'before');assert.equal(value.history.currentIndex,0);assert.equal(value.history.historySize,2);assert.equal(currentFrame(value).data.lcos_ref.revisionId,value.corePeer.revisionId)}
  else{assert.equal(targetPosts(value).length-baseline,0,'the actual serialized send cannot downgrade a late stale owned operation to an ordinary tokenless POST');assert.ok(value.pending.some(operation=>operation.source==='native-history'));assert.ok(value.queue.some(item=>item.id==='n'));assert.equal(value.corePeer.revisionId,before.corePeer.revisionId);if(replacement==='primary')assert.equal(value.nodes[0].data.text,'replacement B must stay');await advance(page,60000);await originalAction(page,'retry');await advance(page,60000);assert.equal(targetPosts(await detailed(page)).length-baseline,0)}
  report.checks.push({name:'actual-wrapper-serialized-send-'+replacement+'-after-original-history-preflight',before,prepared,...value,scope:'A controlled concurrent ordinary HTTP response occupies the actual global wrapper pendingWrite; history action/queue/writer are original.'});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure={message:error.message,stack:error.stack};if(activePage&&!activePage.isClosed())report.lastState=await detailed(activePage).catch(error=>({error:error.message}));process.exitCode=1}
finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(outputRoot,'latest.json'),JSON.stringify({passed:report.passed,report:path.join(output,'report.json')},null,2));await browser.close();await new Promise(resolve=>server.close(resolve))}
console.log(JSON.stringify({passed:report.passed,checks:report.checks.map(check=>check.name),failure:report.failure?.message,report:path.join(output,'report.json')}));
`;
const runtime=path.join(root,'.runtime');fs.mkdirSync(runtime,{recursive:true});
const generated=path.join(runtime,'native-history-text-independent-'+Date.now()+'.mjs');
fs.writeFileSync(generated,setup+driver);
await import(pathToFileURL(generated).href);
