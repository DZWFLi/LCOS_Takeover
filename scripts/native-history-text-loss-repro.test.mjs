import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Reuse the existing source-executed original-hook fixture, not its tests and
// never its file. A distinct driver below executes native O8 Undo/Redo loss.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const protectedMode=process.argv.includes('--protected');
const fixturePath=path.join(root,'scripts/native-text-retry.test.mjs');
const fixture=fs.readFileSync(fixturePath,'utf8');
const cut=fixture.indexOf("\ntry {\n  const { context, page } = await fixture('success');");
assert.ok(cut>0,'actual original O8/r6 fixture setup boundary must be exact');
let setup=fixture.slice(0,cut);
const originalOutput="path.join(root, 'output/原流程收口_20261017d/原队列重试验证')";
assert.equal(setup.split(originalOutput).length-1,1);
setup=setup.replace(originalOutput,"path.join(root, 'output/原生文本整合_20261017e/"+(protectedMode?'原历史正文丢回包修复验证':'原历史正文丢回包复现')+"')");
setup+='\nconst expectProtected='+JSON.stringify(protectedMode)+';\n';
const textBranch="if(text){\n   if(f.mode==='conflict')";
assert.equal(setup.split(textBranch).length-1,1);
setup=setup.replace(textBranch,"if(text){\n   if(f.mode==='history-lost'&&body.lcos_expected_revisions?.n!==f.snapshot.revisionId)return f.response({ok:false,error:{code:'STALE_REVISION',message:'Synthetic exact history CAS conflict',details:{nodeId:'n'}}},409);\n   if(f.mode==='conflict')");
assert.equal(setup.split("if(f.mode==='lost')throw").length-1,1);
setup=setup.replace("if(f.mode==='lost')throw","if(f.mode==='lost'||f.mode==='history-lost')throw");
const driver=String.raw`
report.kind='Actual transformed O8 owner action -> original r6/request hook/production wrapper; controlled HTTP peer/clock, no full App or real Core writes. '+(expectProtected?'Protected history text validation.':'Negative reproduction, not a product-fix PASS.');
async function detailed(page){return page.evaluate(()=>({requests:fixture.requests,pending:window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending(),raw:fixture.rawHistory(),history:fixture.history.inspectNativeHistory({canvasId:'c',nodeId:'n'}),nodes:fixture.nodes,corePeer:fixture.snapshot,logs:fixture.logs,ordinaryQueuePresent:fixture.registry.failed.has('c')}));}
const targetPosts=value=>value.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/nodes:batchActions')&&r.body.actions.some(a=>a.updates?.some(n=>n.id==='n'&&typeof n.data?.text==='string')));
try{
 for(const action of ['undo','redo']){
  const{context,page}=await fixture('success',true);
  await page.evaluate(()=>fixture.save('History saved final body'));await pump(page,1601);await settled(page);await pump(page,2);
  await page.waitForFunction(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length===0||window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending()[0]?.status==='confirmed',null,{polling:10,timeout:3000});
  await page.evaluate(()=>{if(fixture.saveResult.operationId)window.__LCOS_NATIVE_TEXT_SAVE_PORT__.acknowledge(fixture.saveResult.operationId)});
  if(action==='redo'){
   await page.evaluate(()=>fixture.history.undo());await pump(page,1601);await pump(page,2);
   await page.waitForFunction(()=>fixture.snapshot.body==='before');
  }
  const before=await detailed(page),baseline=targetPosts(before).length;
  assert.equal(before.pending.length,0);
  await page.evaluate(action=>{fixture.mode='history-lost';fixture.historyActionResult=null;fixture.historyActionPromise=Promise.resolve(fixture.history[action]()).then(result=>{fixture.historyActionResult=result;return result})},action);
  await pump(page,501);await pump(page,2);
  let current=await detailed(page),attempts=targetPosts(current).slice(baseline);
  assert.equal(attempts.length,1);
  const committedBody=action==='undo'?'before':'History saved final body';
  assert.equal(current.corePeer.body,committedBody,'the first exact history CAS really commits at the controlled peer');
  const expected=attempts[0].body.lcos_expected_revisions.n,committed=current.corePeer.revisionId;
  assert.notEqual(committed,expected);
  if(expectProtected){assert.ok(attempts[0].query.includes('lcos_text_save_request'));assert.equal(current.pending[0].source,'native-history');assert.equal(current.pending[0].historyPhase,action)}
  else assert.equal(attempts[0].query,'','history operation was not registered as an autosave handshake');
  const checkpoints=[{stage:'first-committed-response-lost',posts:1,coreRevision:committed}];
  for(const advanceMs of [3000,6000,12000,30000,60000]){
   await pump(page,advanceMs);current=await detailed(page);attempts=targetPosts(current).slice(baseline);
   checkpoints.push({stage:'original-backoff-and-reschedule',advanceMs,posts:attempts.length,historyIndex:current.history.currentIndex,historySize:current.history.historySize});
  }
  if(expectProtected)assert.equal(attempts.length,1,'registered history text never repeats unknown');
  else assert.ok(attempts.length>=4,'the actual original history request must expose repeated unknown POSTs');
  assert.ok(attempts.every(request=>request.body.lcos_expected_revisions.n===expected),'all original replays keep the unconfirmed old CAS');
  if(!expectProtected)assert.ok(attempts.every(request=>!request.query.includes('lcos_text_save_request')));
  assert.equal(current.corePeer.revisionId,committed,'the controlled peer rejects stale CAS; replays do not fake more successful revisions');
  if(expectProtected)assert.ok(['response-lost','no-receipt-yet','response-processing-late'].includes(current.pending[0].status));
  else assert.deepEqual(current.pending,[],'save port has no registered history request to hold/verify');
  const beforeExplicit=attempts.length;
  await originalAction(page,'retry');await pump(page,3001);
  current=await detailed(page);checkpoints.push({stage:'explicit-original-retry',posts:targetPosts(current).length-baseline});
  if(expectProtected){
   assert.equal(targetPosts(current).length-baseline,beforeExplicit);
   const oldOperation=current.pending[0];
   await page.evaluate(()=>{fixture.receiptAvailable=true});
   const recovered=await page.evaluate(id=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(id),oldOperation.operationId);assert.equal(recovered.status,'confirmed');await pump(page,2);
   await page.waitForFunction(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length===0,null,{polling:10,timeout:3000});
   const afterGet=await detailed(page);assert.equal(targetPosts(afterGet).length-baseline,1,'GET only confirms the exact old history write');
   assert.equal(afterGet.raw[afterGet.history.currentIndex].state.nodes.find(n=>n.id==='n').data.lcos_ref.revisionId,committed);
   assert.equal(afterGet.history.currentIndex,action==='undo'?0:1);
   const opposite=action==='undo'?'redo':'undo';
   await page.evaluate(action=>{fixture.mode='success';fixture.history[action]()},opposite);await pump(page,1601);await pump(page,2);
   await page.waitForFunction(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length===0,null,{polling:10,timeout:3000});
   const next=await detailed(page),requests=targetPosts(next).slice(baseline);assert.equal(requests.length,2);
   assert.equal(requests[1].body.lcos_expected_revisions.n,committed,'the next direction uses the real receipt revision');
   assert.notEqual(requests[1].query,requests[0].query,'each history direction has a distinct actual request identity');
   assert.equal(next.raw[next.history.currentIndex].state.nodes.find(n=>n.id==='n').data.lcos_ref.revisionId,next.corePeer.revisionId);
   // Separate subsequent history action for ordinary-work/cleanup controls:
   // adding a real node changes native history and must not be used while
   // asserting that an earlier Redo branch still exists untouched.
   const beforeMixed=targetPosts(next).length;
   await page.evaluate(action=>{fixture.mode='history-lost';fixture.history[action]()},action);await pump(page,501);await pump(page,2);
   await page.evaluate(()=>{fixture.addOrdinary();fixture.addLink()});await pump(page,501);await pump(page,2);
   const mixed=await detailed(page);assert.equal(targetPosts(mixed).length,beforeMixed+1);
   assert.ok(mixed.requests.some(r=>r.method==='POST'&&r.path.endsWith('/connections:batchActions')));
   assert.ok(mixed.requests.some(r=>r.method==='POST'&&r.body?.actions?.some(a=>a.creates?.some(n=>n.id==='ordinary'))));
   await page.evaluate(()=>fixture.unmount());await pump(page,1);await pump(page,60000);
   const cleanup=await detailed(page);assert.equal(targetPosts(cleanup).length,beforeMixed+1,'cleanup must not replay the held original history text');
   report.checks.push({name:'native-'+action+'-loss-held-GET-only-and-next-'+opposite+'-exact-revision',before,expectedRevision:expected,committedRevision:committed,oldOperation,checkpoints,recovered,afterGet,next,mixed,cleanup});
   await context.close();continue;
  }
  assert.ok(targetPosts(current).length-baseline>beforeExplicit);
  await page.evaluate(()=>fixture.unmount());await pump(page,1);await pump(page,60000);
  const afterCleanup=await detailed(page);
  checkpoints.push({stage:'original-cleanup-and-60s',posts:targetPosts(afterCleanup).length-baseline});
  report.checks.push({name:'known-P0-native-'+action+'-text-response-loss-retries-outside-autosave-registration',before,expectedRevision:expected,committedRevision:committed,checkpoints,after:afterCleanup});
  await context.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;report.knownProductDefectReproduced=!expectProtected;
}catch(error){report.failure={message:error.message,stack:error.stack};if(activePage&&!activePage.isClosed())report.lastState=await detailed(activePage).catch(error=>({error:error.message}));process.exitCode=1}
finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(outputRoot,'latest.json'),JSON.stringify({passed:report.passed,meaning:expectProtected?'Protected original history text validation':'Known product defect reproduced, not repaired',report:path.join(output,'report.json')},null,2));await browser.close();await new Promise(resolve=>server.close(resolve))}
console.log(JSON.stringify({passed:report.passed,knownProductDefectReproduced:report.knownProductDefectReproduced,checks:report.checks.map(c=>c.name),failure:report.failure?.message,report:path.join(output,'report.json')}));
`;
const runtime=path.join(root,'.runtime');fs.mkdirSync(runtime,{recursive:true});
const generated=path.join(runtime,'native-history-text-loss-fixture-'+Date.now()+'.mjs');
fs.writeFileSync(generated,setup+driver);
await import(pathToFileURL(generated).href);
