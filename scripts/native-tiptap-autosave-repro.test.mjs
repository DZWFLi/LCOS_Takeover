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
import { transformNativeTiptapAutosaveScript } from '../lab/native-tiptap-autosave-transform.mjs';

// The old d reports preserve the pre-fix reproduction. This e fixture executes
// the actual donor vZ/hl/G7, original asynchronous dr/Gb/Wb/Bf/Ub/Ff writer,
// r6/request hook and production wrapper; there is no second save writer.
// Only non-save UI services, Canvas API injection and HTTP peer are controlled.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'reference/tapnow-installed/resources/web/assets');
const outputRoot = path.join(root, 'output/原生文本整合_20261017e/原Tiptap自动保存验证');
const output = path.join(outputRoot, new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const require = createRequire(path.join(installedRoot, 'package.json'));
const { chromium } = require('playwright-core');
const store = path.join(installedRoot, 'huabu/node_modules/.pnpm');
const traverse = require(path.join(store, fs.readdirSync(store).find(n => n.startsWith('@babel+traverse@')),
  'node_modules/@babel/traverse/lib/index.js')).default;
function scoped(source, filename) {
  const ast = parseOriginalDonorScript(source, filename);
  let program;
  traverse({ type: 'File', program: ast }, { Program(current) { program = current; current.stop(); } });
  return program;
}
const filename = 'page-Da_DfwiK.js';
const raw = fs.readFileSync(path.join(assets, filename), 'utf8');
const transformed = transformHistoryIntentScript(filename,
  transformSurfaceDockScript(filename, transformNodeBridgeScript(filename, transformCutScript(filename, raw))));
const program = scoped(transformed, filename);
const environmental = new Set(['he', 'vd', '$e', 'dn', 'se', 'e6']);
const selected = new Map(), imports = new Map();
function select(name) {
  if (environmental.has(name) || selected.has(name) || imports.has(name)) return;
  const binding = program.scope.getBinding(name);
  assert.ok(binding, 'Unresolved original r6 dependency ' + name);
  if (binding.path.isImportSpecifier()) {
    const specifier = binding.path.node, declaration = binding.path.parent;
    imports.set(name, `import{${specifier.imported.name} as ${name}}from"/assets/${path.basename(declaration.source.value)}";`);
    return;
  }
  assert.ok(binding.path.isVariableDeclarator() || binding.path.isFunctionDeclaration());
  selected.set(name, binding.path.node);
  binding.path.traverse({ ReferencedIdentifier(reference) {
    if (reference.scope.getBinding(reference.node.name)?.scope === program.scope) select(reference.node.name);
  } });
}
select('r6');
let queueModule = [...imports.values()].join('\n') + `
const translate=key=>key,navigate=()=>{},getEdge=id=>window.fixture.edges.find(e=>e.id===id);
const he=()=>({t:translate}),vd=()=>navigate,$e=()=>({getEdge});
const log=(...a)=>fixture.logs.push(a),logger={warn:log,error:log},dn=()=>logger;
const se={error:(...a)=>fixture.logs.push(a)},e6={error:(...a)=>fixture.logs.push(a)};
` + [...selected.values()].sort((a, b) => a.start - b.start).map(node =>
  (node.type === 'VariableDeclarator' ? program.scope.getBinding(node.id.name).path.parent.kind + ' ' : '')
  + transformed.slice(node.start, node.end) + ';').join('\n') + '\nexport{r6};';
// Read-only queue instrumentation. Coalescing/timers/retry/cleanup stay original.
assert.equal(queueModule.split('{handleNodeChange:Ve,handleEdgeChange:We,executeBatchOperations:je}').length - 1, 1);
queueModule = queueModule.replace('{handleNodeChange:Ve,handleEdgeChange:We,executeBatchOperations:je}',
  '{handleNodeChange:Ve,handleEdgeChange:We,executeBatchOperations:je,readOriginalPending:()=>structuredClone(g.current)}');

const course = transformNativeTiptapAutosaveScript('course-api-base-url-CifxI1ia.js',
  fs.readFileSync(path.join(assets, 'course-api-base-url-CifxI1ia.js'), 'utf8'));
const courseProgram = scoped(course, 'course-api-base-url-CifxI1ia.js');
function originalDeclaration(name) {
  const binding = courseProgram.scope.getBinding(name);
  assert.ok(binding);
  const node = binding.path.node;
  return (node.type === 'VariableDeclarator' ? binding.path.parent.kind + ' ' : '') + course.slice(node.start, node.end) + ';';
}
const editorModule = `
import{cd as d,ce as a}from'/assets/index-BAQXnPag.js';
import{L as G7}from'/assets/editor-B8HR4RTZ.js';
import{dr as _t}from'/actual-flow-writer.js';
const translate=key=>key,Me=()=>({t:translate}),Br=()=>true;
const bZ=()=>d.useRef(null),uZ=({children})=>children,UX=()=>null,CT=()=>null;
const ka=({children})=>children,Un={div:'div'};
${originalDeclaration('Ln')}
${originalDeclaration('hl')}
${originalDeclaration('vZ')}
export{vZ,hl};
`;
const flowSource = fs.readFileSync(path.join(assets, 'UnlimitedModeToggle-D4wysAbz.js'), 'utf8');
const flowProgram = scoped(flowSource, 'UnlimitedModeToggle-D4wysAbz.js');
const flowDeclarations = ['Lm','Ff','Ub','Bf','Gb','Wb','dr'].map(name => {
  const binding = flowProgram.scope.getBinding(name); assert.ok(binding);
  const node = binding.path.node;
  return (node.type === 'VariableDeclarator' ? binding.path.parent.kind + ' ' : '') + flowSource.slice(node.start, node.end) + ';';
}).join('\n');
let flowModule = `import{cd as b,ce as h}from'/assets/index-BAQXnPag.js';
const Dm=b.useLayoutEffect,we=()=>fixture.store,jb=()=>({}),ce=()=>false,Hb=()=>false;
${flowDeclarations}\nexport{dr,Gb};`;
const actualPatch = 'updateNodeData:(d,f,p={replace:!1})=>{c(d,m=>{const g=typeof f=="function"?f(m):f;';
assert.equal(flowModule.split(actualPatch).length - 1, 1);
flowModule = flowModule.replace(actualPatch, actualPatch + 'fixture.apiCalls.push({id:d,data:{text:g.text},time:Date.now()});');
parseOriginalDonorScript(flowModule, 'actual-flow-writer.js');
parseOriginalDonorScript(queueModule, 'actual-r6.js');
parseOriginalDonorScript(editorModule, 'actual-vz-hl.js');
let indexSource = fs.readFileSync(path.join(assets, 'index-BAQXnPag.js'), 'utf8');
assert.equal(indexSource.split(';hFl();').length - 1, 1);
indexSource = indexSource.replace(';hFl();', ';/* test: no full App boot */')
  .replace('VITE_API_BASE_URL:"https://app.tapnow.ai"', 'VITE_API_BASE_URL:window.location.origin')
  + '\nexport{tos as TestReactDOM,Rv as TestPersistRegistry,_y as TestFailedRegistry};';

const transport = String.raw`
window.fixture={nodes:[],edges:[],requests:[],logs:[],apiCalls:[],backfills:[],mode:'success',sequence:1,receiptAvailable:false};
const f=window.fixture;
f.ref={version:1,entityType:'artifact',entityId:'a',artifactId:'a',artifactViewId:'v',revisionId:'r1'};
f.nodes=[{id:'n',type:'text',position:{x:0,y:0},data:{id:'n',text:'before',lcos_ref:f.ref}}];
f.snapshot={projectId:'p',canvasId:'c',spatialId:'n',artifactId:'a',viewId:'v',revisionId:'r1',fileRecordId:'f1',body:'before'};
f.response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input),location.href),method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
 const raw=init?.body??(input instanceof Request?await input.clone().text():undefined),body=typeof raw==='string'?JSON.parse(raw):null;
 if(url.pathname.startsWith('/api/'))f.requests.push({method,path:url.pathname,query:url.search,body,time:Date.now()});
 if(url.pathname.includes('/curation/canvas-text'))return f.response({ok:true,value:f.snapshot});
 if(url.pathname.includes('/text-save-receipts/'))return !f.receiptAvailable||!f.lastRequest?f.response({ok:false},404):f.response({ok:true,value:{requestId:decodeURIComponent(url.pathname.split('/').at(-1)),canvasId:'c',wireBody:f.lastRequest.body,status:200,body:f.lastRequest.result}});
 if(url.pathname==='/api/canvas/v1/canvases/c'&&method==='GET')return f.response({code:0,data:{id:'c',nodes:f.nodes.map(n=>({...n,lcos_revision_id:f.snapshot.revisionId})),connections:[]}});
 if(url.pathname.endsWith('/nodes:batchActions')&&method==='POST'){
  const item=body.actions.flatMap(a=>a.updates||[]).find(n=>n.id==='n'&&typeof n.data?.text==='string');
  if(!item)return f.response({code:0,data:{}});
  // The first unknown request commits; subsequent stale CAS is rejected,
  // rather than pretending duplicate updates all create valid revisions.
  if(body.lcos_expected_revisions?.n!==f.snapshot.revisionId)return f.response({ok:false,error:{code:'STALE_REVISION',message:'Synthetic exact CAS conflict'}},409);
  const revisionId='r'+(++f.sequence),ref={...f.ref,revisionId};
  f.snapshot={...f.snapshot,body:item.data.text,revisionId,fileRecordId:'f'+f.sequence};
  const result={code:0,data:{core_saved:true,spatial_saved:true,lcos_expected_revisions:{n:revisionId},lcos_text_receipts:[{projectId:'p',canvasId:'c',nodeId:'n',artifactId:'a',revisionId,body:item.data.text,ref}]}};
  f.lastRequest={body:structuredClone(body),result:structuredClone(result)};
  if(f.mode==='lost')throw new TypeError('Synthetic response lost after committed original autosave');
  if(f.mode==='late')return new Promise(resolve=>{f.releaseLate=()=>resolve(f.response(result))});
  return f.response(result);
 }
 return f.response({code:0,data:{}});
};
`;
const app = `
import{cd as React,TestReactDOM,TestPersistRegistry,TestFailedRegistry}from'/assets/index-BAQXnPag.js';
import{r6}from'/actual-r6.js';import{vZ}from'/actual-vz-hl.js';
import{dr,Gb}from'/actual-flow-writer.js';
const f=window.fixture;
f.api={getNode:id=>f.nodes.find(n=>n.id===id),getNodes:()=>f.nodes,
 updateNodeData:(...args)=>f.nativeApi.updateNodeData(...args),
 backfillNodeReceipt(receipt){f.backfills.push(receipt);return window.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt({...receipt,history:[],currentNodesRef:{get current(){return f.nodes},set current(nodes){f.nodes=nodes}},setNodes:nodes=>f.setNodes(nodes)})}};
function Hook(){
 f.nativeApi=dr();
 const[nodes,setNodes]=React.useState(f.nodes),[open,setOpen]=React.useState(true);f.nodes=nodes;f.setNodes=setNodes;f.setOpen=setOpen;
 const changes=React.useCallback(items=>setNodes(previous=>{let next=previous.slice();for(const c of items){if(c.type==='replace')next=next.map(n=>n.id===c.id?c.item:n)}return next}),[]);
 const edges=React.useCallback(()=>{},[]);
 f.queue=r6({canvasId:'c',onNodesChange:changes,onEdgesChange:edges,getNode:id=>f.nodes.find(n=>n.id===id)});
 return open?React.createElement(vZ,{nodeId:'n',phase:'open',media:{type:'text',markdown:nodes[0].data.text},mode:'edit',onOpened(){},onClosed(){}}):null;
}
f.store={getState:()=>({nodes:f.nodes,edges:f.edges,nodeLookup:new Map(f.nodes.map(n=>[n.id,{internals:{userNode:n}}])),edgeLookup:new Map(),hasDefaultNodes:false,hasDefaultEdges:false,onNodesChange:items=>f.queue.handleNodeChange(items),onEdgesChange(){},onNodesChangeMiddlewareMap:new Map(),fitViewQueued:false})};
window.__LCOS_NODE_LAB__={canvasId:'c',currentCanvasId:'c',projectId:'p',api:f.api};
f.root=TestReactDOM.createRoot(document.getElementById('app'));f.root.render(React.createElement(Gb,null,React.createElement(Hook)));
f.flush=()=>TestPersistRegistry.get('c')?.flush();f.retry=()=>TestFailedRegistry.get('c')?.retry()??TestPersistRegistry.get('c')?.retry();
f.close=()=>f.setOpen(false);f.unmount=()=>f.root.unmount();f.ready=true;
`;
const routes = new Map([
  ['/transport.js', transport], ['/app.js', app], ['/actual-r6.js', queueModule], ['/actual-vz-hl.js', editorModule], ['/actual-flow-writer.js',flowModule],
  ['/assets/index-BAQXnPag.js', indexSource],
  ...['startup-history-intent.js', 'native-text-save-port.js', 'startup-surface-core.js'].map(name =>
    ['/' + name, fs.readFileSync(path.join(root, 'lab', name), 'utf8')]),
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
  res.end('<!doctype html><style>.tiptap{min-height:200px;width:700px;border:1px solid #aaa}</style><script src="/transport.js"></script><script src="/startup-history-intent.js"></script><script src="/native-text-save-port.js"></script><script src="/startup-surface-core.js"></script><div id="app"></div><script type="module" src="/app.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = { passed: false, meaning: 'Native autosave registration and original asynchronous writer validation',
  scope: 'Actual original vZ/hl + G7 Tiptap DOM editor + actual dr/Gb/Wb/Bf/Ub/Ff async queue + transformed original r6/request hook + production wrapper/port. Controlled non-save UI/store environment/HTTP peer and clock; no full App or real Core writes.',
  sourceOwners: { viewer: 'course-api-base-url-CifxI1ia.js vZ', debounce: 'course-api-base-url-CifxI1ia.js hl (300ms)', editor: 'editor-B8HR4RTZ.js G7=b3', queue: 'page-Da_DfwiK.js r6' }, checks: [], errors: [] };
let activePage;
async function fixture(mode) {
  const context = await browser.newContext(), page = await context.newPage(); activePage = page;
  page.on('pageerror', error => report.errors.push(error.stack || error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.clock.install({ time: new Date('2026-10-17T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-17T00:00:00Z'));
  await page.goto(base);
  await page.locator('[contenteditable="true"]').waitFor({ timeout: 30000 });
  await page.evaluate(async mode => { fixture.mode = mode; await fetch('/api/canvas/v1/canvases/c'); }, mode);
  return { page, context, editor: page.locator('[contenteditable="true"]') };
}
async function pump(page, ms) { await page.clock.runFor(ms); await page.evaluate(() => Promise.resolve()); }
async function noPending(page) { await page.waitForFunction(() => window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length === 0, null, {polling:10,timeout:3000}); }
async function state(page) { return page.evaluate(() => ({
  apiCalls: fixture.apiCalls, requests: fixture.requests, pending: window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending(),
  originalQueue: fixture.queue.readOriginalPending(), nodes: fixture.nodes, corePeer: fixture.snapshot,
  editor: document.querySelector('[contenteditable="true"]')?.textContent ?? null, backfills: fixture.backfills,
})); }
const posts = value => value.requests.filter(r => r.method === 'POST' && r.path.endsWith('/nodes:batchActions'));
const bodies = value => posts(value).map(r => r.body.actions.flatMap(a => a.updates || []).find(n => n.id === 'n')?.data?.text);
try {
  {
    const { page, context, editor } = await fixture('success');
    await editor.fill('rapid one'); await pump(page, 100);
    await editor.fill('rapid two'); await pump(page, 100);
    await editor.fill('rapid latest'); await pump(page, 299);
    let value = await state(page); assert.equal(value.apiCalls.length, 0, 'original hl keeps the 300ms pending editor input');
    assert.equal(value.editor, 'rapid latest');
    await pump(page, 1); value = await state(page);
    assert.deepEqual(value.apiCalls.map(c => c.data.text), ['rapid latest']);
    await pump(page, 501); await noPending(page); value = await state(page);
    assert.deepEqual(bodies(value), ['rapid latest']); assert.deepEqual(value.pending, []);
    assert.ok(posts(value).every(r => r.query.includes('lcos_text_save_request')), 'actual asynchronous donor writer preserves autosave source until r6 claims it');
    report.checks.push({ name: 'actual-tiptap-input-original-hl-debounce-and-r6-latest-only-success', ...value });
    await context.close();
  }
  {
    const { page, context, editor } = await fixture('lost');
    await editor.fill('first autosave unknown'); await pump(page, 801);
    let value = await state(page); assert.equal(posts(value).length, 1); assert.equal(value.pending[0].source,'native-autosave');
    const checkpoints = [{ advancedMs: 801, posts: 1, editor: value.editor }];
    for (const ms of [2600, 5100, 10100, 25100]) {
      await pump(page, ms); value = await state(page);
      checkpoints.push({ advancedMs: ms, posts: posts(value).length, editor: value.editor, queueSize: value.originalQueue.length });
    }
    assert.equal(posts(value).length, 1, 'registered original autosave never repeats the unknown POST');
    assert.ok(posts(value).every(r => r.query.includes('lcos_text_save_request')));
    assert.ok(posts(value).every(r => r.body.lcos_expected_revisions.n === 'r1'), 'unknown replay retains stale observed CAS');
    assert.equal(value.corePeer.revisionId, 'r2', 'synthetic CAS rejects duplicate commits even while original requests repeat');
    assert.equal(value.editor, 'first autosave unknown');
    report.checks.push({ name: 'registered-primary-autosave-holds-unknown-without-original-retry', checkpoints, ...value });
    await context.close();
  }
  {
    const { page, context, editor } = await fixture('lost');
    await editor.fill('unknown already submitted body'); await pump(page, 801);
    await editor.fill('new local draft one'); await pump(page, 100);
    await editor.fill('new local draft latest'); await pump(page, 301);
    const queuedLater = await state(page);
    assert.equal(posts(queuedLater).length, 1);
    assert.equal(queuedLater.editor, 'new local draft latest');
    assert.equal(queuedLater.originalQueue.at(-1).data.text, 'new local draft latest');
    for (const ms of [2600, 5100, 10100]) await pump(page, ms);
    const afterRetries = await state(page);
    assert.equal(posts(afterRetries).length, 1);
    assert.equal(afterRetries.editor, 'new local draft latest');
    assert.equal(afterRetries.nodes[0].data.text, 'new local draft latest');
    assert.ok(afterRetries.originalQueue.some(item => item.data?.text === 'new local draft latest'),
      'original g retains the later body while the older unknown group fails');
    assert.equal(afterRetries.pending[0].body,'unknown already submitted body');
    await page.evaluate(()=>{fixture.receiptAvailable=true});
    const verified=await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending()[0].operationId));
    assert.equal(verified.status,'confirmed');await pump(page,2);await noPending(page);await pump(page,1001);
    const afterVerify=await state(page);assert.equal(posts(afterVerify).length,1,'GET recovery does not silently submit the later draft');
    assert.equal(await page.evaluate(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.readQueuedAutosave('n')?.canResume),true);
    await page.evaluate(()=>{fixture.mode='success'});
    const resumes=await page.evaluate(()=>[window.__LCOS_NATIVE_TEXT_SAVE_PORT__.resumeAutosave('n'),window.__LCOS_NATIVE_TEXT_SAVE_PORT__.resumeAutosave('n')]);
    assert.deepEqual(resumes,[true,false]);await pump(page,1001);await noPending(page);
    const continued=await state(page);assert.deepEqual(bodies(continued),['unknown already submitted body','new local draft latest']);
    assert.deepEqual(posts(continued).map(item=>item.body.lcos_expected_revisions.n),['r1','r2']);
    report.checks.push({ name: 'held-unknown-older-group-preserves-later-original-draft-and-explicit-continuation', queuedLater, afterRetries,verified,afterVerify,continued });
    await context.close();
  }
  {
    const { page, context, editor } = await fixture('late');
    await editor.fill('in flight older body'); await pump(page, 801);
    await editor.fill('later draft one'); await pump(page, 100);
    await editor.fill('later draft latest'); await pump(page, 301);
    const beforeRelease = await state(page);
    assert.equal(posts(beforeRelease).length, 1);
    assert.equal(beforeRelease.editor, 'later draft latest');
    assert.equal(beforeRelease.nodes[0].data.text, 'later draft latest');
    assert.equal(beforeRelease.pending[0].body,'in flight older body');
    await page.evaluate(() => fixture.releaseLate()); await pump(page, 2);
    await page.waitForFunction(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending()[0]?.body!=='in flight older body',null,{polling:10,timeout:3000});
    await pump(page, 1001);await pump(page,2);
    const afterRelease = await state(page);
    assert.equal(afterRelease.editor, 'later draft latest');
    assert.equal(afterRelease.nodes[0].data.text, 'later draft latest', 'old response does not overwrite the newer editor body');
    assert.deepEqual(bodies(afterRelease), ['in flight older body', 'later draft latest']);
    assert.deepEqual(posts(afterRelease).map(item => item.body.lcos_expected_revisions.n), ['r1', 'r2'],
      'the original later group uses the first real response observed by the production wrapper');
    report.checks.push({ name: 'original-inflight-group-and-later-rapid-editor-draft-observed', beforeRelease, afterRelease });
    await context.close();
  }
  {
    const { page, context, editor } = await fixture('success');
    await editor.fill('pending body flushed on original viewer unmount'); await pump(page, 100);
    assert.equal((await state(page)).apiCalls.length, 0);
    await page.evaluate(() => fixture.close()); await pump(page, 1);
    const closed = await state(page);
    assert.deepEqual(closed.apiCalls.map(c => c.data.text), ['pending body flushed on original viewer unmount']);
    await pump(page, 501); const committed = await state(page);
    assert.deepEqual(bodies(committed), ['pending body flushed on original viewer unmount']);
    report.checks.push({ name: 'original-hl-unmount-flush-preserves-last-pending-editor-body', closed, committed });
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  if (activePage && !activePage.isClosed()) report.lastState = await state(activePage).catch(e => ({ error: e.message }));
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outputRoot, 'latest.json'), JSON.stringify({ passed: report.passed, report: path.join(output, 'report.json') }, null, 2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.map(c => c.name), failure: report.failure?.message, report: path.join(output, 'report.json') }));
