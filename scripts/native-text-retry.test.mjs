import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';

// This fixture executes the installed request hook and the actual transformed
// r6. Only the flow/router/logging environment and HTTP peer are simulated.
// There is no second queue implementation and no access to a running Core.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'reference/tapnow-installed/resources/web/assets');
const outputRoot = path.join(root, 'output/原流程收口_20261017d/原队列重试验证');
const output = path.join(outputRoot, new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(output, { recursive: true });
const require = createRequire(path.join(installedRoot, 'package.json'));
const { chromium } = require('playwright-core');
const packageStore = path.join(installedRoot, 'huabu/node_modules/.pnpm');
const traversePath = path.join(packageStore, fs.readdirSync(packageStore).find(name => name.startsWith('@babel+traverse@')), 'node_modules/@babel/traverse/lib/index.js');
const traverse = require(traversePath).default;

const filename = 'page-Da_DfwiK.js';
const original = fs.readFileSync(path.join(assets, filename), 'utf8');
const transformed = transformHistoryIntentScript(filename,
  transformSurfaceDockScript(filename, transformNodeBridgeScript(filename, transformCutScript(filename, original))));
const parsed = parseOriginalDonorScript(transformed, filename);
let program;
traverse({ type: 'File', program: parsed }, { Program(current) { program = current; current.stop(); } });
// Keep UI services out of the fixture, retaining the actual persistence status
// hook, request hook, coalescers, serializer, cache and canvas queue registry.
const environmental = new Set(['he', 'vd', '$e', 'dn', 'se', 'e6']);
const selected = new Map(), imports = new Map();
function select(name) {
  if (environmental.has(name) || selected.has(name) || imports.has(name)) return;
  const binding = program.scope.getBinding(name);
  assert.ok(binding, 'Unresolved original queue binding: ' + name);
  if (binding.path.isImportSpecifier()) {
    const specifier = binding.path.node, declaration = binding.path.parent;
    imports.set(name, 'import{' + specifier.imported.name + ' as ' + name + '}from"/assets/' + path.basename(declaration.source.value) + '";');
    return;
  }
  assert.ok(binding.path.isVariableDeclarator() || binding.path.isFunctionDeclaration(), 'Unexpected native declaration: ' + name);
  selected.set(name, binding.path.node);
  binding.path.traverse({ ReferencedIdentifier(reference) {
    const dependency = reference.scope.getBinding(reference.node.name);
    if (dependency?.scope === program.scope) select(reference.node.name);
  } });
}
select('r6');
select('O8');
let queueModule = [...imports.values()].join('\n') + '\n'
  + `const translate=key=>key,navigate=()=>{},getEdge=id=>window.fixture.edges.find(edge=>edge.id===id);
const he=()=>({t:translate}),vd=()=>navigate,$e=()=>({getEdge});
const dn=()=>({warn:(...args)=>window.fixture.logs.push(args),error:(...args)=>window.fixture.logs.push(args)});
const se={error:(...args)=>window.fixture.logs.push(args)},e6={error:(...args)=>window.fixture.logs.push(args)};
` + [...selected.values()].sort((a, b) => a.start - b.start).map(node =>
    (node.type === 'VariableDeclarator' ? program.scope.getBinding(node.id.name).path.parent.kind + ' ' : '') + transformed.slice(node.start, node.end) + ';'
  ).join('\n') + '\nexport{r6,O8};';
assert.equal(queueModule.split('if(D&&R8(L,D))return P;').length-1,1);
// Read-only fixture instrumentation at the actual O8 comparison. It does not
// replace R8, debounce, recording, indices or keyboard/application behavior.
queueModule=queueModule.replace('if(D&&R8(L,D))return P;',
  'window.fixture.historyComparisons.push({time:Date.now(),index:M,equal:!!D&&R8(L,D),candidate:structuredClone(L),prior:structuredClone(D)});if(D&&R8(L,D))return P;');
assert.equal(queueModule.split('setTextReceiptNodes:__nodes=>{').length-1,1);
queueModule=queueModule.replace('setTextReceiptNodes:__nodes=>{',
  'setTextReceiptNodes:__nodes=>{if(window.fixture.disableReceiptMarker){__lcosHistorySetNodes(__nodes);return;}');
assert.equal(queueModule.split('const __lcosInspectNativeHistory=').length-1,1);
queueModule=queueModule.replace('const __lcosInspectNativeHistory=',
  'window.fixture.rawHistory=()=>structuredClone(x.current);const __lcosInspectNativeHistory=');
parseOriginalDonorScript(queueModule, 'actual-native-queue.js');

let indexSource = fs.readFileSync(path.join(assets, 'index-BAQXnPag.js'), 'utf8');
assert.equal(indexSource.split(';hFl();').length - 1, 1, 'Only the app boot call is disabled in this hook fixture');
assert.equal(indexSource.split('VITE_API_BASE_URL:"https://app.tapnow.ai"').length - 1, 1);
indexSource = indexSource.replace(';hFl();', ';/* fixture: no full App root */')
  .replace('VITE_API_BASE_URL:"https://app.tapnow.ai"', 'VITE_API_BASE_URL:window.location.origin')
  + '\nexport{tos as TestReactDOM,Rv as TestPersistRegistry,_y as TestFailedRegistry};';

const transport = String.raw`
window.fixture={nodes:[],edges:[],requests:[],logs:[],backfills:[],mode:'success',attempts:{},sequence:1,closed:false,receiptAvailable:false,backfillAllowed:true,historyComparisons:[],useHistory:new URL(location.href).searchParams.has('history'),disableReceiptMarker:new URL(location.href).searchParams.has('without-marker')};
const f=window.fixture;
f.snapshot={projectId:'p',canvasId:'c',spatialId:'n',artifactId:'a',viewId:'v',revisionId:'r1',fileRecordId:'f1',title:'Synthetic text',body:'before'};
const ref={version:1,entityType:'artifact',entityId:'a',artifactId:'a',artifactViewId:'v',revisionId:'r1'};
f.nodes=[{id:'n',type:'text',position:{x:0,y:0},data:{id:'n',text:'before',lcos_ref:ref}}];
f.response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input),location.href);
 const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
 const bodyText=init?.body??(input instanceof Request?await input.clone().text():undefined);
 const body=typeof bodyText==='string'?JSON.parse(bodyText):null;
 if(url.pathname.startsWith('/api/'))f.requests.push({method,path:url.pathname,query:url.search,body,time:Date.now()});
 if(url.pathname.includes('/text-save-receipts/')){
  if(!f.receiptAvailable||!f.lastTextRequest)return f.response({ok:false},404);
  const requestId=decodeURIComponent(url.pathname.split('/').at(-1));
  const wireBody=structuredClone(f.lastTextRequest.body);
  if(f.wrongReceiptWire)wireBody.actions[0].updates[0].data.text='someone else';
  return f.response({ok:true,value:{requestId,canvasId:'c',wireBody,status:200,body:f.lastTextRequest.result}});
 }
 if(url.pathname.includes('/curation/canvas-text'))return f.response({ok:true,value:structuredClone(f.snapshot)});
 if(url.pathname==='/api/canvas/v1/canvases/c'&&method==='GET')return f.response({code:0,data:{id:'c',nodes:f.nodes.map(n=>({...n,lcos_revision_id:f.snapshot.revisionId})),connections:f.edges}});
 if(/\/(nodes|connections):batchActions$/.test(url.pathname)&&method==='POST'){
  const ids=(body?.actions||[]).flatMap(a=>[...(a.updates||[]),...(a.creates||[])]).map(n=>n.id);
  const key=ids.join(',');f.attempts[key]=(f.attempts[key]||0)+1;
  const text=(body?.actions||[]).flatMap(a=>a.updates||[]).find(n=>n.id==='n'&&n.data?.text!==undefined);
  if(text){
   if(f.mode==='conflict')return f.response({ok:false,error:{code:'STALE_REVISION',message:'Exact synthetic revision conflict',details:{nodeId:'n'}}},409);
   const revisionId='r'+(++f.sequence),nextRef={...ref,revisionId};
   f.snapshot={...f.snapshot,body:text.data.text,revisionId,fileRecordId:'f'+f.sequence};
   const result={code:0,data:{core_saved:true,spatial_saved:true,lcos_expected_revisions:{n:revisionId},lcos_text_receipts:[{projectId:'p',canvasId:'c',nodeId:'n',artifactId:'a',revisionId,body:text.data.text,ref:nextRef}]}};
   f.lastTextRequest={body:structuredClone(body),result:structuredClone(result)};
   if(f.mode==='lost')throw new TypeError('Synthetic response lost after server committed');
   if(f.mode==='late')return new Promise(resolve=>{f.releaseLate=()=>resolve(f.response(result))});
   return f.response(result);
  }
  if(f.mode==='ordinary-fail'&&f.attempts[key]<5)return f.response({code:503,msg:'Synthetic ordinary transient failure'},503);
  return f.response({code:0,data:{}});
 }
 return f.response({code:0,data:{}});
};
`;
const app = `
import{cd as React,hD as NativeReactDOM,TestReactDOM,TestPersistRegistry,TestFailedRegistry}from'/assets/index-BAQXnPag.js';
import{r6,O8}from'/actual-native-queue.js';
const f=window.fixture;
if(f.disableReceiptMarker)window.__LCOS_NATIVE_INTENT__.normalizeTextReceiptHistoryState=(_canvasId,state)=>state;
function applyNodes(changes){for(const change of changes){const index=f.nodes.findIndex(n=>n.id===(change.item?.id??change.id));if(change.type==='replace')f.nodes[index]=change.item;else if(change.type==='add')f.nodes.push(change.item);else if(change.type==='remove')f.nodes.splice(index,1);else if(change.type==='position'&&index>=0)f.nodes[index]={...f.nodes[index],position:change.position};}}
function Hook(){f.queue=r6({canvasId:'c',onNodesChange:applyNodes,onEdgesChange:changes=>{for(const change of changes){if(change.type==='add')f.edges.push(change.item)}} ,getNode:id=>f.nodes.find(n=>n.id===id)});return null;}
function HistoryHook(){
 const[nodes,setNodes]=React.useState(f.nodes),[edges,setEdges]=React.useState(f.edges);f.nodes=nodes;f.edges=edges;
 const nodeChanges=React.useCallback(changes=>setNodes(previous=>{f.nodes=previous.slice();applyNodes(changes);return f.nodes}),[]);
 const edgeChanges=React.useCallback(changes=>setEdges(previous=>{const next=previous.slice();for(const change of changes)if(change.type==='add')next.push(change.item);return next}),[]);
 f.queue=r6({canvasId:'c',onNodesChange:nodeChanges,onEdgesChange:edgeChanges,getNode:id=>f.nodes.find(n=>n.id===id)});
 f.history=O8(nodes,edges,{enabled:true,disableShortcuts:true,defaultOnNodesChange:nodeChanges,defaultOnEdgesChange:edgeChanges,onBatchOperations:f.queue.executeBatchOperations,canvasId:'c',setNodes});
 return null;
}
const api={getNode:id=>f.nodes.find(n=>n.id===id),getNodes:()=>f.nodes,
 updateNodeData(id,data){const old=api.getNode(id);f.queue.handleNodeChange([{type:'replace',id,item:{...old,data:{...old.data,...data}}}]);},
 backfillNodeReceipt(receipt){f.backfills.push(receipt);if(f.useHistory)return f.backfillAllowed?f.history.backfillNodeReceipt(receipt):{ok:false,reason:'SIMULATED_HISTORY_REFUSAL'};const node=api.getNode(receipt.nodeId);if(node&&f.backfillAllowed){node.data={...node.data,text:receipt.body,lcos_ref:receipt.ref}}return{ok:!!node&&f.backfillAllowed}}};
window.__LCOS_NODE_LAB__={canvasId:'c',currentCanvasId:'c',projectId:'p',api};
f.root=TestReactDOM.createRoot(document.getElementById('app'));f.root.render(React.createElement(f.useHistory?HistoryHook:Hook));
f.flush=()=>TestPersistRegistry.get('c')?.flush();f.retry=()=>TestFailedRegistry.get('c')?.retry()??TestPersistRegistry.get('c')?.retry();
f.unmount=()=>{f.closed=true;f.root.unmount()};f.registry={active:TestPersistRegistry,failed:TestFailedRegistry};
f.save=async body=>{f.saveResult=null;const port=window.__LCOS_NATIVE_TEXT_SAVE_PORT__;f.savePromise=port.save({projectId:'p',canvasId:'c',nodeId:'n',artifactId:'a',expectedRevisionId:f.nodes[0].data.lcos_ref.revisionId,body}).then(value=>{f.saveResult=value;return value});};
f.addOrdinary=()=>f.queue.handleNodeChange([{type:'add',item:{id:'ordinary',type:'text',position:{x:25,y:25},data:{id:'ordinary',text:'plain donor node'}}}]);
f.addLink=()=>f.queue.handleEdgeChange([{type:'add',item:{id:'link-1',source:'n',target:'ordinary',data:{},type:'default'}}]);
f.moveLater=()=>f.queue.handleNodeChange([{type:'position',id:'n',position:{x:111,y:222},dragging:false}]);
f.batch=NativeReactDOM.flushSync;
f.receipt=()=>{const node=api.getNode('n');return f.history.backfillNodeReceipt({receiptKind:'text-revision',canvasId:'c',nodeId:'n',ref:{...node.data.lcos_ref,revisionId:'metadata-r'},body:node.data.text})};
f.ready=true;
`;
parseOriginalDonorScript(transport, 'transport.js');
parseOriginalDonorScript(app, 'app.js');

const routes = new Map([
  ['/transport.js', transport], ['/app.js', app], ['/actual-native-queue.js', queueModule],
  ['/native-text-save-port.js', fs.readFileSync(path.join(root, 'lab/native-text-save-port.js'), 'utf8')],
  ['/startup-surface-core.js', fs.readFileSync(path.join(root, 'lab/startup-surface-core.js'), 'utf8')],
  ['/startup-history-intent.js', fs.readFileSync(path.join(root, 'lab/startup-history-intent.js'), 'utf8')],
  ['/assets/index-BAQXnPag.js', indexSource],
]);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (routes.has(pathname)) { res.setHeader('Content-Type', 'text/javascript'); res.end(routes.get(pathname)); return; }
  if (pathname.startsWith('/assets/')) {
    const target = path.resolve(assets, pathname.slice(8));
    if (target.startsWith(assets + path.sep) && fs.existsSync(target)) {
      res.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); res.end(fs.readFileSync(target)); return;
    }
    res.writeHead(404); res.end(); return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html><head><script src="/transport.js"></script><script src="/startup-history-intent.js"></script><script src="/native-text-save-port.js"></script><script src="/startup-surface-core.js"></script></head><body><div id="app"></div><script type="module" src="/app.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = { passed: false, kind: 'Actual transformed r6 + installed original request hook + production fetch wrapper/text port; simulated HTTP peer, controlled clock; no full App or real Core writes', checks: [], errors: [] };
let activePage;
async function fixture(mode, history = false, withoutMarker = false) {
  const context = await browser.newContext(), page = await context.newPage(); activePage = page;
  page.on('pageerror', error => report.errors.push(error.stack || error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.clock.install({ time: new Date('2026-10-17T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-17T00:00:00Z'));
  await page.goto(base+(history?'/?history=1'+(withoutMarker?'&without-marker=1':''):'')); await page.waitForFunction(() => window.fixture?.ready && window.fixture.registry.active.has('c'), null, { polling: 10, timeout: 10000 });
  await page.evaluate(async mode => { window.fixture.mode = mode; await fetch('/api/canvas/v1/canvases/c'); }, mode);
  return { context, page };
}
async function pump(page, milliseconds = 0) { await page.clock.runFor(milliseconds); await page.evaluate(() => Promise.resolve()); }
async function state(page) { return page.evaluate(() => ({ result:fixture.saveResult,requests:fixture.requests,pending:window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending(),nodes:fixture.nodes,backfills:fixture.backfills,failed:fixture.registry.failed.has('c') })); }
function posts(value, route = 'nodes') { return value.requests.filter(r => r.method === 'POST' && r.path.endsWith('/' + route + ':batchActions')); }
function textPosts(value) { return posts(value).filter(r => r.body.actions.some(a => a.updates?.some(n => n.id === 'n' && n.data?.text !== undefined))); }
async function settled(page) { await page.waitForFunction(() => fixture.saveResult, null, { polling:10,timeout:5000 }); }
async function originalAction(page, action) {
  await page.evaluate(action => { fixture.lastActionResult=null;fixture.lastActionPromise=Promise.resolve(fixture[action]()).then(value=>{fixture.lastActionResult=value;return value}); },action);
  await pump(page,1);
}
try {
  const { context, page } = await fixture('success');
  await page.evaluate(() => window.fixture.save('after'));
  await pump(page, 501);
  await page.waitForFunction(() => window.fixture.saveResult);
  const value = await page.evaluate(() => ({ result: fixture.saveResult, requests: fixture.requests, pending: window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending() }));
  assert.equal(value.result.status, 'confirmed');
  assert.equal(value.requests.filter(r => r.method === 'POST').length, 1);
  report.checks.push({ name: 'original-hook-and-wrapper-smoke', ...value });
  await context.close();

  {
    const {context,page}=await fixture('lost');
    await page.evaluate(async()=>{await fixture.save('unknown draft');fixture.addOrdinary();fixture.addLink()});
    await pump(page,501);await settled(page);await pump(page,2);
    let current=await state(page);
    assert.equal(current.result.status,'response-lost');assert.equal(textPosts(current).length,1);
    assert.equal(posts(current).length,2,'held text and ordinary node are separate original request buckets');
    assert.equal(posts(current,'connections').length,1,'held text must allow original links worker to proceed');
    assert.equal(current.pending[0].body,'unknown draft');assert.ok(current.failed,'actual failed-owner registry retains original queue');
    const times=[];
    for(const delta of [2600,5100,10100,25100,60000]){await pump(page,delta);current=await state(page);assert.equal(textPosts(current).length,1,'no write after original backoff/cooldown time');times.push({advanceMs:delta,totalPosts:posts(current).length,textPosts:textPosts(current).length})}
    await originalAction(page,'flush');await originalAction(page,'retry');
    current=await state(page);assert.equal(textPosts(current).length,1);
    const busy=await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.save({projectId:'p',canvasId:'c',nodeId:'n',artifactId:'a',expectedRevisionId:'r1',body:'second attempt'}));
    assert.equal(busy.status,'busy');
    const verification=await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(fixture.saveResult.operationId));
    assert.equal(verification.status,'readback-matched-unconfirmed','Core text alone cannot confirm original spatial/history receipt');
    await page.evaluate(()=>fixture.unmount());await pump(page,1);await originalAction(page,'retry');await pump(page,60000);
    current=await state(page);assert.equal(textPosts(current).length,1,'cleanup and detached failed-owner retry cannot resend held Core text');
    assert.equal(current.pending[0].body,'unknown draft');assert.equal(current.nodes[0].data.text,'unknown draft');
    report.checks.push({name:'unknown-stops-inner-cooldown-flush-retry-cleanup-preserves-draft-and-unrelated-work',times,verification,...current});
    await context.close();
  }

  // These are the original native retries, used as a control for both queues.
  for(const kind of ['node','link']){
    const{context,page}=await fixture('ordinary-fail');
    await page.evaluate(kind=>kind==='node'?fixture.addOrdinary():fixture.addLink(),kind);
    const checkpoints=[];
    for(const delta of [501,2600,5100,10100,25100]){await pump(page,delta);checkpoints.push(posts(await state(page),kind==='node'?'nodes':'connections').length)}
    assert.deepEqual(checkpoints,[1,2,3,4,5],kind+' preserves original inner retries and 25s reschedule');
    const current=await state(page),requests=posts(current,kind==='node'?'nodes':'connections');
    assert.ok(requests.every(r=>!r.query.includes('lcos_text_save_request')),'ordinary request never claims a text receipt');
    report.checks.push({name:'ordinary-'+kind+'-original-retry-policy-retained',checkpoints,attemptTimes:requests.map(r=>r.time),...current});
    await context.close();
  }

  {
    const{context,page}=await fixture('conflict');await page.evaluate(()=>fixture.save('conflicting draft'));await pump(page,501);await settled(page);
    let current=await state(page);assert.equal(current.result.status,'conflict');assert.equal(textPosts(current).length,1);
    await pump(page,60000);await originalAction(page,'retry');await page.evaluate(()=>fixture.unmount());await pump(page,1);
    current=await state(page);assert.equal(textPosts(current).length,1);assert.equal(current.pending[0].status,'conflict');
    assert.equal(current.nodes[0].data.text,'conflicting draft');
    assert.equal(await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.acknowledge(fixture.saveResult.operationId)),false,'unaccepted held conflict cannot be erased by acknowledge');
    report.checks.push({name:'exact-conflict-keeps-original-unsaved-queue-without-retry',...current});await context.close();
  }

  {
    const{context,page}=await fixture('late');await page.evaluate(()=>fixture.save('late exact draft'));await pump(page,16000);await settled(page);
    let current=await state(page);assert.equal(current.result.status,'response-processing-late');assert.equal(textPosts(current).length,1);
    await originalAction(page,'retry');await page.evaluate(()=>fixture.unmount());await pump(page,1);
    await page.evaluate(()=>fixture.releaseLate());await pump(page,1);
    await page.waitForFunction(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending()[0]?.status==='confirmed',null,{polling:10,timeout:5000});
    current=await state(page);assert.equal(textPosts(current).length,1);assert.equal(current.pending[0].status,'confirmed');
    assert.equal(current.backfills.length,1);assert.equal(current.nodes[0].data.lcos_ref.revisionId,'r2');
    assert.equal(await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.acknowledge(fixture.saveResult.operationId)),true);
    report.checks.push({name:'late-exact-wrapper-response-after-timeout-and-cleanup-reconciles-once',...current});await context.close();
  }

  {
    const{context,page}=await fixture('lost');await page.evaluate(()=>fixture.save('recover only by exact receipt'));await pump(page,501);await settled(page);
    const first=await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(fixture.saveResult.operationId));assert.equal(first.status,'readback-matched-unconfirmed');
    await page.evaluate(()=>{fixture.receiptAvailable=true;fixture.wrongReceiptWire=true});
    const wrongWire=await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(fixture.saveResult.operationId));assert.equal(wrongWire.status,'readback-matched-unconfirmed');
    await page.evaluate(()=>{fixture.wrongReceiptWire=false;fixture.backfillAllowed=false});
    const unaccepted=await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(fixture.saveResult.operationId));assert.equal(unaccepted.status,'readback-matched-unconfirmed');
    await page.evaluate(()=>{fixture.backfillAllowed=true;fixture.moveLater()});await pump(page,501);
    let current=await state(page);assert.equal(textPosts(current).length,1,'later native edit cannot merge into a held text retry');
    const recovered=await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(fixture.saveResult.operationId));assert.equal(recovered.status,'confirmed');
    current=await state(page);assert.equal(textPosts(current).length,1,'exact receipt recovery is GET only');
    await page.evaluate(()=>{fixture.mode='success'});await originalAction(page,'retry');await pump(page,501);
    current=await state(page);assert.equal(posts(current).length,2,'original later position op remains in g and flushes once after exact receipt');
    const update=posts(current).at(-1).body.actions.flatMap(a=>a.updates||[])[0];assert.deepEqual(update,{id:'n',position:{x:111,y:222}});
    assert.equal(current.failed,false,'exact recovered text plus original later successful op release native failed owner');
    report.checks.push({name:'repeated-readonly-verification-requires-exact-wire-and-history-acceptance-preserves-later-native-op',first,wrongWire,unaccepted,recovered,...current});await context.close();
  }
  {
    const{context,page}=await fixture('success');
    await page.evaluate(()=>{fixture.backfillAllowed=false;return fixture.save('HTTP 200 is not original history acceptance')});
    await pump(page,501);await settled(page);await pump(page,2);
    let current=await state(page);assert.equal(current.result.status,'history-receipt-rejected');
    assert.equal(textPosts(current).length,1);assert.ok(current.failed,'original queue remains failed when original history refuses a successful HTTP receipt');
    assert.equal(current.nodes[0].data.lcos_ref.revisionId,'r1','unaccepted receipt cannot change the observed node reference');
    assert.equal(current.pending[0].body,'HTTP 200 is not original history acceptance');
    for(const delta of [2600,5100,10100,25100,60000]){await pump(page,delta);assert.equal(textPosts(await state(page)).length,1)}
    await originalAction(page,'flush');await originalAction(page,'retry');
    current=await state(page);assert.equal(textPosts(current).length,1);assert.ok(current.failed);
    await page.evaluate(()=>{fixture.receiptAvailable=true;fixture.backfillAllowed=true});
    const recovered=await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(fixture.saveResult.operationId));assert.equal(recovered.status,'confirmed');
    await pump(page,1);current=await state(page);
    assert.equal(current.failed,false,'only exact original history acceptance releases the original failed owner');
    assert.equal(textPosts(current).length,1);assert.equal(current.nodes[0].data.lcos_ref.revisionId,'r2');
    assert.equal(await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.acknowledge(fixture.saveResult.operationId)),true);
    report.checks.push({name:'http200-core-match-with-original-history-rejection-cannot-confirm-or-cache-success',recovered,...current});await context.close();
  }
  for(const withoutMarker of [false,true]){
    const{context,page}=await fixture('success',true,withoutMarker);
    await page.evaluate(()=>fixture.save('actual O8 after'));await pump(page,1601);await settled(page);
    let originalHistory=await page.evaluate(()=>fixture.history.inspectNativeHistory({canvasId:'c',nodeId:'n'}));
    if(withoutMarker){
      const comparisons=await page.evaluate(()=>fixture.historyComparisons);
      const metadata=comparisons.find(item=>!item.equal&&item.candidate.nodes[0].data.text===item.prior.nodes[0].data.text
        &&item.candidate.nodes[0].data.lcos_ref.revisionId!==item.prior.nodes[0].data.lcos_ref.revisionId);
      assert.ok(metadata,'test-only original setter control must expose the actual R8 revision-only false comparison');
      const normalized=structuredClone(metadata.candidate);normalized.nodes[0].data.lcos_ref.revisionId=metadata.prior.nodes[0].data.lcos_ref.revisionId;
      assert.deepEqual(normalized,metadata.prior,'the original R8 difference is only the receipt revision, with no geometry/body changes');
      assert.equal(originalHistory.currentIndex,2);assert.equal(originalHistory.historySize,3);
      report.checks.push({name:'original-O8-old-setter-control-reproduces-revision-only-extra-frame',markerDisabledOnlyInTest:true,originalHistory,metadata,comparisons,...await state(page)});
      await context.close();continue;
    }
    assert.equal(originalHistory.currentIndex,1);assert.equal(originalHistory.historySize,2);
    assert.equal((await state(page)).result.status,'confirmed');
    report.o8RawAfterSave=await page.evaluate(()=>fixture.rawHistory());
    assert.equal(report.o8RawAfterSave[1].state.nodes[0].data.lcos_ref.revisionId,'r2','the real new original history entry must contain the accepted exact receipt revision');
    await pump(page,1100);
    await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.acknowledge(fixture.saveResult.operationId));
    originalHistory=await page.evaluate(()=>fixture.history.inspectNativeHistory({canvasId:'c',nodeId:'n'}));
    assert.equal(originalHistory.currentIndex,1);assert.equal(originalHistory.historySize,2);
    await page.evaluate(()=>{fixture.mode='success';fixture.history.undo()});await pump(page,1601);await pump(page,2);
    const undone=await page.evaluate(()=>({history:fixture.history.inspectNativeHistory({canvasId:'c',nodeId:'n'}),raw:fixture.rawHistory(),snapshot:fixture.snapshot,comparisons:fixture.historyComparisons}));
    report.o8Undo=undone;
    assert.equal(undone.snapshot.body,'before');assert.equal(undone.history.currentIndex,0,'actual O8 Undo must keep its target index after exact receipt');assert.equal(undone.history.historySize,2);assert.equal(undone.history.canRedo,true);
    assert.equal(undone.raw[0].state.nodes[0].data.lcos_ref.revisionId,'r3');assert.equal(undone.raw[1].state.nodes[0].data.lcos_ref.revisionId,'r2');
    await page.evaluate(()=>fixture.history.redo());await pump(page,1601);await pump(page,2);
    const redone=await page.evaluate(()=>({history:fixture.history.inspectNativeHistory({canvasId:'c',nodeId:'n'}),raw:fixture.rawHistory(),snapshot:fixture.snapshot,comparisons:fixture.historyComparisons}));
    assert.equal(redone.snapshot.body,'actual O8 after');assert.equal(redone.history.currentIndex,1);assert.equal(redone.history.historySize,2);
    assert.equal(redone.raw[1].state.nodes[0].data.lcos_ref.revisionId,'r4');assert.equal(redone.raw[0].state.nodes[0].data.lcos_ref.revisionId,'r3');
    report.checks.push({name:'actual-original-O8-undo-redo-keeps-entry-index-and-exact-receipts',originalHistory,undone,redone,...await state(page)});await context.close();
  }
  {
    const{context,page}=await fixture('late',true);
    await page.evaluate(()=>fixture.save('O8 late response'));await pump(page,16001);await settled(page);
    assert.equal((await state(page)).result.status,'response-processing-late');
    const before=await page.evaluate(()=>fixture.history.inspectNativeHistory({canvasId:'c',nodeId:'n'}));assert.equal(before.currentIndex,1);assert.equal(before.historySize,2);
    await page.evaluate(()=>fixture.releaseLate());await pump(page,2);await pump(page,1100);
    const after=await page.evaluate(()=>({history:fixture.history.inspectNativeHistory({canvasId:'c',nodeId:'n'}),raw:fixture.rawHistory(),pending:window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending()}));
    assert.equal(after.history.currentIndex,1);assert.equal(after.history.historySize,2);assert.equal(after.raw[1].state.nodes[0].data.lcos_ref.revisionId,'r2');assert.equal(after.pending[0].status,'confirmed');
    assert.equal(textPosts(await state(page)).length,1);
    report.checks.push({name:'actual-original-O8-late-receipt-keeps-one-frame-and-exact-reference',before,after,...await state(page)});await context.close();
  }
  for(const concurrent of ['body','edge']){
    const{context,page}=await fixture('success',true);
    const accepted=await page.evaluate(concurrent=>{let accepted;fixture.batch(()=>{accepted=fixture.receipt();if(concurrent==='body')window.__LCOS_NODE_LAB__.api.updateNodeData('n',{text:'same commit user body'});else fixture.addLink()});return accepted},concurrent);
    assert.equal(accepted.ok,true);await pump(page,1601);await pump(page,2);
    const first=await page.evaluate(()=>({history:fixture.history.inspectNativeHistory({canvasId:'c',nodeId:'n'}),raw:fixture.rawHistory(),nodes:fixture.nodes,edges:fixture.edges,comparisons:fixture.historyComparisons}));
    assert.equal(first.history.currentIndex,1,'a real '+concurrent+' change in the receipt commit must still record');assert.equal(first.history.historySize,2);
    if(concurrent==='body')assert.equal(first.nodes[0].data.text,'same commit user body');else assert.equal(first.edges.length,1);
    await page.evaluate(()=>window.__LCOS_NODE_LAB__.api.updateNodeData('n',{text:'next independent edit'}));await pump(page,1601);await pump(page,2);
    const next=await page.evaluate(()=>({history:fixture.history.inspectNativeHistory({canvasId:'c',nodeId:'n'}),raw:fixture.rawHistory(),nodes:fixture.nodes,edges:fixture.edges,comparisons:fixture.historyComparisons}));
    assert.equal(next.history.currentIndex,2);assert.equal(next.history.historySize,3,'a consumed stale metadata marker must not swallow the next edit');
    report.checks.push({name:'actual-original-O8-receipt-samecommit-'+concurrent+'-and-next-edit-record',accepted,first,next,...await state(page)});await context.close();
  }
  {
    const{context,page}=await fixture('success',true);
    const accepted=await page.evaluate(()=>{let result;fixture.batch(()=>{result=fixture.receipt()});return result});assert.equal(accepted.ok,true);
    await pump(page,1100);
    const metadata=await page.evaluate(()=>({history:fixture.history.inspectNativeHistory({canvasId:'c',nodeId:'n'}),raw:fixture.rawHistory()}));
    assert.equal(metadata.history.currentIndex,0);assert.equal(metadata.history.historySize,1);assert.equal(metadata.raw[0].state.nodes[0].data.lcos_ref.revisionId,'metadata-r');
    await page.evaluate(()=>window.__LCOS_NODE_LAB__.api.updateNodeData('n',{text:'new user edit after metadata-only commit'}));await pump(page,1601);await pump(page,2);
    const edited=await page.evaluate(()=>({history:fixture.history.inspectNativeHistory({canvasId:'c',nodeId:'n'}),raw:fixture.rawHistory()}));
    assert.equal(edited.history.currentIndex,1);assert.equal(edited.history.historySize,2);assert.equal(edited.raw[1].state.nodes[0].data.text,'new user edit after metadata-only commit');
    report.checks.push({name:'actual-original-O8-metadata-only-marker-is-consumed-before-later-user-edit',accepted,metadata,edited,...await state(page)});await context.close();
  }
  assert.deepEqual(report.errors,[],'no browser module or original hook errors');
  report.passed = true;
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  if (activePage && !activePage.isClosed()) report.lastState = await activePage.evaluate(() => ({ fixture: { ...window.fixture, root: undefined, queue: undefined, registry: undefined }, pending: window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.getPending() })).catch(error => ({ error: error.message }));
  throw error;
} finally {
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outputRoot, 'latest.json'), JSON.stringify({passed:report.passed,report:path.join(output,'report.json'),checks:report.checks.map(check=>check.name)},null,2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.map(check => check.name), report: path.join(output, 'report.json') }));
