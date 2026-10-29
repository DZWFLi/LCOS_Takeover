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

// Independent regression: actual vZ/hl/G7/UX and r6/O8/request/wrapper execute.
// No duplicated editor, queue, history, writer or persistence implementation.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'reference/tapnow-installed/resources/web/assets');
const outputRoot = path.join(root, 'output/原生文本整合_20261017e/原Tiptap独立Hook验证');
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
select('O8');
let queueModule = [...imports.values()].join('\n') + `
const translate=key=>key,navigate=()=>{},getEdge=id=>window.fixture.edges.find(e=>e.id===id);
const he=()=>({t:translate}),vd=()=>navigate,$e=()=>({getEdge});
const dn=()=>({warn:(...a)=>fixture.logs.push(a),error:(...a)=>fixture.logs.push(a)});
const se={error:(...a)=>fixture.logs.push(a)},e6={error:(...a)=>fixture.logs.push(a)};
` + [...selected.values()].sort((a, b) => a.start - b.start).map(node =>
  (node.type === 'VariableDeclarator' ? program.scope.getBinding(node.id.name).path.parent.kind + ' ' : '')
  + transformed.slice(node.start, node.end) + ';').join('\n') + '\nexport{r6,O8};';
// Read-only queue instrumentation. Coalescing/timers/retry/cleanup stay original.
assert.equal(queueModule.split('{handleNodeChange:Ve,handleEdgeChange:We,executeBatchOperations:je}').length - 1, 1);
queueModule = queueModule.replace('{handleNodeChange:Ve,handleEdgeChange:We,executeBatchOperations:je}',
  '{handleNodeChange:Ve,handleEdgeChange:We,executeBatchOperations:je,readOriginalPending:()=>structuredClone(g.current)}');
assert.equal(queueModule.split('const __lcosInspectNativeHistory=').length-1,1);
queueModule=queueModule.replace('const __lcosInspectNativeHistory=',
  'window.fixture.rawHistory=()=>structuredClone(x.current);const __lcosInspectNativeHistory=');

const rawCourse = fs.readFileSync(path.join(assets, 'course-api-base-url-CifxI1ia.js'), 'utf8');
const course = transformNativeTiptapAutosaveScript('course-api-base-url-CifxI1ia.js',rawCourse);
assert.equal(transformNativeTiptapAutosaveScript('course-api-base-url-CifxI1ia.js',course),course);
const courseProgram = scoped(course, 'course-api-base-url-CifxI1ia.js');
const courseSelected=new Map(),courseImports=new Map();
const courseEnvironment=new Set(['Me','_t','Br','bZ','uZ','ka','Un']);
function selectCourse(name) {
  if(courseEnvironment.has(name)||courseSelected.has(name)||courseImports.has(name))return;
  const binding = courseProgram.scope.getBinding(name);
  assert.ok(binding,'unresolved original editor binding '+name);
  if(binding.path.isImportSpecifier()){
    const spec=binding.path.node,source=binding.path.parent.source.value;
    courseImports.set(name,`import{${spec.imported.name} as ${name}}from${JSON.stringify(source.startsWith('/')?source:'/assets/'+path.basename(source))};`);return;
  }
  const node = binding.path.node;
  assert.ok(binding.path.isVariableDeclarator()||binding.path.isFunctionDeclaration(),name);
  courseSelected.set(name,node);
  binding.path.traverse({ReferencedIdentifier(reference){if(reference.scope.getBinding(reference.node.name)?.scope===courseProgram.scope)selectCourse(reference.node.name)}});
}
selectCourse('vZ');
const editorModule = `
import{dr as _t}from'/actual-flow-writer.js';
const translate=key=>key,Me=()=>({t:translate}),Br=()=>true;
const bZ=()=>d.useRef(null),uZ=({children})=>children;
const ka=({children})=>children,Un={div:'div'};
${[...courseImports.values()].join('\n')}
${[...courseSelected.values()].sort((a,b)=>a.start-b.start).map(node=>(node.type==='VariableDeclarator'?courseProgram.scope.getBinding(node.id.name).path.parent.kind+' ':'')+course.slice(node.start,node.end)+';').join('\n')}
export{vZ,hl};
`;
const flowSource=fs.readFileSync(path.join(assets,'UnlimitedModeToggle-D4wysAbz.js'),'utf8');
const flowProgram=scoped(flowSource,'UnlimitedModeToggle-D4wysAbz.js');
const flowDeclarations=['Lm','Ff','Ub','Bf','Gb','Wb','dr'].map(name=>{const binding=flowProgram.scope.getBinding(name);assert.ok(binding);const node=binding.path.node;return(node.type==='VariableDeclarator'?binding.path.parent.kind+' ':'')+flowSource.slice(node.start,node.end)+';'}).join('\n');
let flowModule=`import{cd as b,ce as h}from'/assets/index-BAQXnPag.js';const Dm=b.useLayoutEffect,we=()=>fixture.store,jb=()=>({}),ce=()=>false,Hb=()=>false;${flowDeclarations}\nexport{dr,Gb};`;
const nativeUpdate='updateNodeData:(d,f,p={replace:!1})=>{c(d,m=>{const g=typeof f=="function"?f(m):f;';
assert.equal(flowModule.split(nativeUpdate).length-1,1);
flowModule=flowModule.replace(nativeUpdate,nativeUpdate+'fixture.apiCalls.push({id:d,data:{text:g.text},time:Date.now()});');
parseOriginalDonorScript(flowModule,'actual-flow-writer.js');
parseOriginalDonorScript(queueModule, 'actual-r6.js');
parseOriginalDonorScript(editorModule, 'actual-vz-hl.js');
let indexSource = fs.readFileSync(path.join(assets, 'index-BAQXnPag.js'), 'utf8');
assert.equal(indexSource.split(';hFl();').length - 1, 1);
indexSource = indexSource.replace(';hFl();', ';/* test: no full App boot */')
  .replace('VITE_API_BASE_URL:"https://app.tapnow.ai"', 'VITE_API_BASE_URL:window.location.origin')
  + '\nexport{tos as TestReactDOM,Rv as TestPersistRegistry,_y as TestFailedRegistry,vRt as TestTooltipProvider};';

const transport = String.raw`
window.fixture={nodes:[],edges:[],requests:[],logs:[],apiCalls:[],backfills:[],mode:'success',sequence:1,receipts:{},receiptAvailable:true,coreReads:0};
const f=window.fixture;
f.ref={version:1,entityType:'artifact',entityId:'a',artifactId:'a',artifactViewId:'v',revisionId:'r1'};
f.nodes=[{id:'n',type:'text',position:{x:0,y:0},data:{id:'n',text:'before',lcos_ref:f.ref}}];
f.snapshot={projectId:'p',canvasId:'c',spatialId:'n',artifactId:'a',viewId:'v',revisionId:'r1',fileRecordId:'f1',body:'before'};
f.response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input),location.href),method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
 const raw=init?.body??(input instanceof Request?await input.clone().text():undefined),body=typeof raw==='string'?JSON.parse(raw):null;
 if(url.pathname.startsWith('/api/'))f.requests.push({method,path:url.pathname,query:url.search,body,time:Date.now()});
 if(url.pathname.includes('/curation/canvas-text')){
  f.coreReads++;const value=structuredClone(f.snapshot);
  if(f.slowRead&&f.coreReads===1)return new Promise(resolve=>{f.releaseRead=()=>resolve(f.response({ok:true,value}))});
  return f.response({ok:true,value});
 }
 if(url.pathname.includes('/text-save-receipts/')){const requestId=decodeURIComponent(url.pathname.split('/').at(-1));return f.receiptAvailable&&f.receipts[requestId]?f.response({ok:true,value:f.receipts[requestId]}):f.response({ok:false},404)}
 if(url.pathname==='/api/canvas/v1/canvases/c'&&method==='GET')return f.response({code:0,data:{id:'c',nodes:f.nodes.map(n=>({...n,lcos_revision_id:f.snapshot.revisionId})),connections:[]}});
 if(url.pathname.endsWith('/nodes:batchActions')&&method==='POST'){
  const item=body.actions.flatMap(a=>a.updates||[]).find(n=>n.id==='n'&&typeof n.data?.text==='string');
  if(!item)return f.response({code:0,data:{}});
  // The first unknown request commits; subsequent stale CAS is rejected,
  // rather than pretending duplicate updates all create valid revisions.
  if(f.mode==='conflict'||body.lcos_expected_revisions?.n!==f.snapshot.revisionId)return f.response({ok:false,error:{code:'STALE_REVISION',message:'Synthetic exact CAS conflict',details:{nodeId:'n'}}},409);
  const revisionId='r'+(++f.sequence),ref={...f.ref,revisionId};
  f.snapshot={...f.snapshot,body:item.data.text,revisionId,fileRecordId:'f'+f.sequence};
  const result={code:0,data:{core_saved:true,spatial_saved:true,lcos_expected_revisions:{n:revisionId},lcos_text_receipts:[{projectId:'p',canvasId:'c',nodeId:'n',artifactId:'a',revisionId,body:item.data.text,ref}]}};
  const requestId=url.searchParams.get('lcos_text_save_request');if(requestId)f.receipts[requestId]={requestId,canvasId:'c',wireBody:structuredClone(body),status:200,body:structuredClone(result)};
  if(f.mode==='lost')throw new TypeError('Synthetic response lost after committed original autosave');
  if(f.mode==='late')return new Promise(resolve=>{f.releaseLate=()=>resolve(f.response(result))});
  return f.response(result);
 }
 return f.response({code:0,data:{}});
};
`;
const app = `
import{cd as React,TestReactDOM,TestPersistRegistry,TestFailedRegistry,TestTooltipProvider}from'/assets/index-BAQXnPag.js';
import{r6,O8}from'/actual-r6.js';import{vZ}from'/actual-vz-hl.js';
import{dr,Gb}from'/actual-flow-writer.js';
const f=window.fixture;
f.api={getNode:id=>f.nodes.find(n=>n.id===id),getNodes:()=>f.nodes,
 updateNodeData:(...args)=>f.nativeApi.updateNodeData(...args),
 backfillNodeReceipt(receipt){f.backfills.push(receipt);return f.history.backfillNodeReceipt(receipt)}};
function Hook(){
 f.nativeApi=dr();
 const[nodes,setNodes]=React.useState(f.nodes),[edgeList,setEdges]=React.useState(f.edges),[open,setOpen]=React.useState(true);f.nodes=nodes;f.edges=edgeList;f.setNodes=setNodes;f.setOpen=setOpen;
 const changes=React.useCallback(items=>setNodes(previous=>{let next=previous.slice();for(const c of items){if(c.type==='replace')next=next.map(n=>n.id===c.id?c.item:n);if(c.type==='add')next.push(c.item)}return next}),[]);
 const edges=React.useCallback(items=>setEdges(previous=>{let next=previous.slice();for(const c of items){if(c.type==='add')next.push(c.item);if(c.type==='replace')next=next.map(n=>n.id===c.id?c.item:n)}return next}),[]);
 f.queue=r6({canvasId:'c',onNodesChange:changes,onEdgesChange:edges,getNode:id=>f.nodes.find(n=>n.id===id)});
 f.history=O8(nodes,edgeList,{enabled:true,disableShortcuts:true,defaultOnNodesChange:changes,defaultOnEdgesChange:edges,onBatchOperations:f.queue.executeBatchOperations,canvasId:'c',setNodes});
 return open?React.createElement(vZ,{nodeId:'n',phase:'open',media:{type:'text',markdown:nodes[0].data.text},mode:'edit',onOpened(){},onClosed(){}}):null;
}
f.store={getState:()=>({nodes:f.nodes,edges:f.edges,nodeLookup:new Map(f.nodes.map(n=>[n.id,{internals:{userNode:n}}])),edgeLookup:new Map(),hasDefaultNodes:false,hasDefaultEdges:false,onNodesChange:items=>{if(f.replaceApiBeforeQueue){f.replaceApiBeforeQueue=false;window.__LCOS_NODE_LAB__.api={...f.api};f.apiReplaced=true}return f.queue.handleNodeChange(items)},onEdgesChange:items=>f.queue.handleEdgeChange(items),onNodesChangeMiddlewareMap:new Map(),fitViewQueued:false})};
window.__LCOS_NODE_LAB__={canvasId:'c',currentCanvasId:'c',projectId:'p',api:f.api};
f.root=TestReactDOM.createRoot(document.getElementById('app'));f.root.render(React.createElement(TestTooltipProvider,null,React.createElement(Gb,null,React.createElement(Hook))));
f.flush=()=>TestPersistRegistry.get('c')?.flush();f.retry=()=>TestFailedRegistry.get('c')?.retry()??TestPersistRegistry.get('c')?.retry();
f.close=()=>f.setOpen(false);f.reopen=()=>f.setOpen(true);f.unmount=()=>f.root.unmount();
f.addOrdinary=()=>f.queue.handleNodeChange([{type:'add',item:{id:'plain',type:'text',position:{x:4,y:4},data:{id:'plain',text:'ordinary'}}}]);
f.addLink=()=>f.queue.handleEdgeChange([{type:'add',item:{id:'link',source:'n',target:'plain',data:{}}}]);f.ready=true;
`;
const statusBuild=await require('esbuild').build({entryPoints:[path.join(root,'lab/pilot/native-tiptap-autosave-status.tsx')],bundle:true,write:false,outdir:'fixture',format:'esm',platform:'browser',jsx:'automatic',logLevel:'silent',plugins:[{name:'use-original-React',setup(build){build.onResolve({filter:/^react(?:\/jsx-runtime)?$/},args=>({path:args.path==='react'?'/lcos/native-react.js':'/lcos/native-jsx-runtime.js',external:true}))}}]});
const statusJs=statusBuild.outputFiles.find(file=>file.path.endsWith('.js')).text;
const routes = new Map([
  ['/transport.js', transport], ['/app.js', app], ['/actual-r6.js', queueModule], ['/actual-vz-hl.js', editorModule], ['/actual-flow-writer.js',flowModule],
  ['/assets/index-BAQXnPag.js', indexSource],
  ['/lcos/agent-ui.js',statusJs],
  ...['native-react.js','native-jsx-runtime.js'].map(name=>['/lcos/'+name,fs.readFileSync(path.join(root,'lab',name),'utf8')]),
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
const report = { passed: false, meaning: 'Independent strict original Tiptap autosave regression',
  scope: 'Actual transformed vZ/hl/G7/UX + actual root status leaf + actual asynchronous dr/Gb/Wb/Bf/Ub/Ff + transformed original r6/O8/request hook + production wrapper/port. Controlled geometry/store environment/HTTP peer and clock; no full App or real Core writes. Browser plugin unavailable; installed Playwright/Chrome used.',
  sourceOwners: { viewer: 'course-api-base-url-CifxI1ia.js vZ', debounce: 'course-api-base-url-CifxI1ia.js hl (300ms)', editor: 'editor-B8HR4RTZ.js G7=b3', queue: 'page-Da_DfwiK.js r6' }, checks: [], errors: [] };
let activePage;
async function fixture(mode,{slowRead=false}={}) {
  const context = await browser.newContext(), page = await context.newPage(); activePage = page;
  page.on('pageerror', error => report.errors.push(error.stack || error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.clock.install({ time: new Date('2026-10-17T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-17T00:00:00Z'));
  await page.goto(base);
  await page.locator('[contenteditable="true"]').waitFor({ timeout: 30000 });
  await page.evaluate(async input => { fixture.mode = input.mode;fixture.slowRead=input.slowRead; await fetch('/api/canvas/v1/canvases/c'); }, {mode,slowRead});
  return { page, context, editor: page.locator('[contenteditable="true"]') };
}
async function pump(page, ms) { await page.clock.runFor(ms); await page.evaluate(() => Promise.resolve()); }
async function state(page) { return page.evaluate(() => ({
  apiCalls: fixture.apiCalls, requests: fixture.requests, pending: window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending(),
  originalQueue: fixture.queue.readOriginalPending(), nodes: fixture.nodes, corePeer: fixture.snapshot,
  editor: document.querySelector('[contenteditable="true"]')?.textContent ?? null, backfills: fixture.backfills,
  history:fixture.history.inspectNativeHistory({canvasId:'c',nodeId:'n'}),rawHistory:fixture.rawHistory(),
  status:[...document.querySelectorAll('[data-native-tiptap-save-status]')].map(e=>({status:e.getAttribute('data-native-tiptap-save-status'),text:e.textContent})),
})); }
const posts = value => value.requests.filter(r => r.method === 'POST' && r.path.endsWith('/nodes:batchActions'));
const bodies = value => posts(value).map(r => r.body.actions.flatMap(a => a.updates || []).find(n => n.id === 'n')?.data?.text);
async function idleState(page){await page.waitForFunction(()=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length===0,null,{polling:10,timeout:3000});return state(page)}
try {
  {
    const {page,context,editor}=await fixture('success');
    await editor.fill('rapid one');await pump(page,100);await editor.fill('rapid two');await pump(page,100);await editor.fill('rapid latest');await pump(page,299);
    let value=await state(page);assert.equal(value.apiCalls.length,0);assert.equal(value.editor,'rapid latest');
    await pump(page,1);await pump(page,502);await pump(page,1100);value=await idleState(page);
    assert.deepEqual(value.apiCalls.map(c=>c.data.text),['rapid latest'],'one original update, never a second adapter update');assert.deepEqual(bodies(value),['rapid latest']);
    assert.ok(posts(value)[0].query.includes('lcos_text_save_request'));assert.deepEqual(value.pending,[]);assert.equal(value.corePeer.body,'rapid latest');assert.equal(value.nodes[0].data.lcos_ref.revisionId,'r2');
    assert.equal(value.rawHistory[value.history.currentIndex].state.nodes[0].data.lcos_ref.revisionId,'r2');
    report.checks.push({name:'rapid-three-real-G7-hl-r6-one-latest-owned-write',...value});await context.close();
  }
  {
    const {page,context,editor}=await fixture('success',{slowRead:true});
    await editor.fill('slow first');await pump(page,802);let value=await state(page);assert.equal(posts(value).length,0);assert.equal(value.pending[0]?.status,'core-preflight');
    await editor.fill('slow intermediate');await pump(page,100);await editor.fill('slow latest');await pump(page,301);
    const before=await state(page);assert.equal(before.editor,'slow latest');assert.equal(posts(before).length,0);assert.deepEqual(before.apiCalls.map(c=>c.data.text),['slow first','slow latest']);
    await page.evaluate(()=>fixture.releaseRead());await pump(page,1602);await pump(page,2);value=await idleState(page);
    assert.equal(value.corePeer.body,'slow latest');assert.equal(value.editor,'slow latest');assert.deepEqual(value.pending,[]);
    assert.deepEqual(bodies(value),['slow first','slow latest']);assert.deepEqual(posts(value).map(r=>r.body.lcos_expected_revisions.n),['r1','r2']);
    report.checks.push({name:'slow-real-Core-preflight-keeps-newer-G7-input-and-ordered-original-CAS',before,...value});await context.close();
  }
  for(const historyDelay of [0,1100]){
    const{page,context,editor}=await fixture('lost');await editor.fill('older unknown A');await pump(page,802);
    let value=await state(page);assert.equal(posts(value).length,1);assert.equal(value.pending[0]?.status,'response-lost');assert.ok(value.status.some(s=>s.text.includes('草稿已保留')));
    await editor.fill('later B');await pump(page,100);await editor.fill('later C');await pump(page,301);await pump(page,historyDelay);
    const before=await state(page);assert.equal(before.editor,'later C');assert.equal(before.nodes[0].data.text,'later C');assert.equal(posts(before).length,1);
    assert.ok(before.originalQueue.some(op=>op.data?.text==='later C'),'original g keeps newer body');
    await page.evaluate(()=>{fixture.mode='success'});
    await page.getByRole('button',{name:'核对保存',exact:true}).click();
    await page.waitForFunction(()=>{const value=window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending({canvasId:'c',nodeId:'n'});return value===null||value.status==='confirmed'},null,{polling:10,timeout:3000});const receiptImmediate=await state(page);
    assert.deepEqual(bodies(receiptImmediate),['older unknown A']);assert.equal(receiptImmediate.nodes[0].data.text,'later C');
    assert.ok(!receiptImmediate.rawHistory.some(entry=>entry.state.nodes.some(node=>node.id==='n'&&node.data.text==='older unknown A')),'old A receipt cannot invent a history frame for a body that had already been replaced');
    await pump(page,1602);await pump(page,2);const verified=await state(page);
    assert.deepEqual(bodies(verified),['older unknown A'],'verification of A is GET-only and cannot silently submit later C');
    assert.equal(verified.editor,'later C');assert.ok(verified.originalQueue.some(op=>op.data?.text==='later C'));
    await page.getByRole('button',{name:'继续保存',exact:true}).click();await pump(page,1602);await pump(page,2);value=await idleState(page);
    assert.equal(value.editor,'later C');assert.equal(value.nodes[0].data.text,'later C');assert.equal(value.corePeer.body,'later C');
    assert.deepEqual(bodies(value),['older unknown A','later C'],'old A never replays and C resumes from the actual original g');assert.deepEqual(posts(value).map(r=>r.body.lcos_expected_revisions.n),['r1','r2']);
    assert.deepEqual(value.pending,[]);assert.equal(value.status.length,0);assert.equal(value.nodes[0].data.lcos_ref.revisionId,'r3');
    const current=value.rawHistory[value.history.currentIndex].state.nodes.find(n=>n.id==='n');assert.equal(current.data.text,'later C');assert.equal(current.data.lcos_ref.revisionId,'r3');
    assert.ok(value.requests.some(r=>r.method==='GET'&&r.path.includes('/text-save-receipts/')));
    const saved=structuredClone(value);await page.evaluate(()=>fixture.close());await pump(page,2);
    await page.evaluate(()=>fixture.history.undo());await pump(page,1602);await pump(page,2);const undone=await idleState(page);
    assert.equal(undone.corePeer.body,'before');assert.equal(undone.nodes[0].data.text,'before');assert.equal(undone.history.currentIndex,0);assert.equal(undone.history.historySize,2);assert.equal(undone.history.canRedo,true);assert.equal(undone.rawHistory[0].state.nodes[0].data.lcos_ref.revisionId,'r4');assert.equal(undone.rawHistory[1].state.nodes[0].data.text,'later C');assert.equal(undone.rawHistory[1].state.nodes[0].data.lcos_ref.revisionId,'r3');
    await page.evaluate(()=>fixture.history.redo());await pump(page,1602);await pump(page,2);const redone=await idleState(page);
    assert.equal(redone.corePeer.body,'later C');assert.equal(redone.nodes[0].data.text,'later C');assert.equal(redone.history.currentIndex,1);assert.equal(redone.history.historySize,2);assert.equal(redone.rawHistory[1].state.nodes[0].data.lcos_ref.revisionId,'r5');assert.equal(redone.rawHistory[0].state.nodes[0].data.lcos_ref.revisionId,'r4');assert.deepEqual(bodies(redone),['older unknown A','later C','before','later C']);assert.deepEqual(posts(redone).map(request=>request.body.lcos_expected_revisions.n),['r1','r2','r3','r4']);
    report.checks.push({name:'unknown-old-A-new-C-real-receipt-explicit-native-resume-and-original-UndoRedo-'+(historyDelay?'after':'before')+'-original-history-debounce',before,receiptImmediate,verified,saved,undone,redone});await context.close();
  }
  {
    const{page,context,editor}=await fixture('lost');await editor.fill('unknown close/reopen draft');await pump(page,802);
    const before=await state(page);await page.evaluate(()=>fixture.close());await pump(page,2);await page.evaluate(()=>fixture.reopen());await pump(page,2);await editor.waitFor();
    assert.equal(await editor.textContent(),'unknown close/reopen draft');assert.equal(await page.getByRole('button',{name:'核对保存',exact:true}).count(),1);
    for(const ms of [2600,5100,10100,25100])await pump(page,ms);
    let value=await state(page);assert.equal(posts(value).length,1);const getStart=value.requests.length;
    await page.getByRole('button',{name:'核对保存',exact:true}).click();await pump(page,1102);value=await idleState(page);
    assert.equal(posts(value).length,1);assert.deepEqual(value.pending,[]);assert.equal(value.status.length,0);assert.equal(value.editor,'unknown close/reopen draft');
    assert.ok(value.requests.slice(getStart).some(r=>r.method==='GET'&&r.path.includes('/text-save-receipts/')));assert.ok(value.requests.slice(getStart).every(r=>r.method==='GET'));
    report.checks.push({name:'original-UX-status-restored-at-reopen-and-real-GET-only-verification',before,...value});await context.close();
  }
  {
    const{page,context,editor}=await fixture('success');await editor.fill('close before debounce');await pump(page,100);assert.equal((await state(page)).apiCalls.length,0);
    await page.evaluate(()=>fixture.close());await pump(page,2);const closed=await state(page);assert.deepEqual(closed.apiCalls.map(c=>c.data.text),['close before debounce']);
    await pump(page,1602);const value=await idleState(page);assert.deepEqual(bodies(value),['close before debounce']);assert.deepEqual(value.pending,[]);assert.equal(value.corePeer.body,'close before debounce');
    report.checks.push({name:'original-hl-close-flush-registers-same-queued-update-and-saves-once',closed,...value});await context.close();
  }
  {
    const{page,context,editor}=await fixture('conflict');await editor.fill('conflict draft');await pump(page,802);let value=await state(page);
    assert.equal(value.pending[0]?.status,'conflict');assert.equal(posts(value).length,1);assert.ok(value.status.some(s=>s.text.includes('已有新版本')));
    await editor.fill('new local conflict draft');await pump(page,301);await pump(page,60000);await page.evaluate(()=>fixture.close());await pump(page,2);await page.evaluate(()=>fixture.reopen());await pump(page,2);
    value=await state(page);assert.equal(posts(value).length,1);assert.equal(value.editor,'new local conflict draft');assert.ok(value.originalQueue.some(o=>o.data?.text==='new local conflict draft'));assert.equal(value.corePeer.body,'before');
    report.checks.push({name:'exact-conflict-retains-later-native-draft-and-never-retries',...value});await context.close();
  }
  {
    const{page,context,editor}=await fixture('late');await editor.fill('late old A');await pump(page,802);await editor.fill('late new C');await pump(page,301);const before=await state(page);assert.equal(posts(before).length,1);
    await page.evaluate(()=>{fixture.mode='success';fixture.releaseLate()});await pump(page,1602);await pump(page,2);const value=await idleState(page);
    assert.equal(value.editor,'late new C');assert.equal(value.nodes[0].data.text,'late new C');assert.equal(value.corePeer.body,'late new C');assert.deepEqual(bodies(value),['late old A','late new C']);assert.deepEqual(posts(value).map(r=>r.body.lcos_expected_revisions.n),['r1','r2']);assert.deepEqual(value.pending,[]);
    const current=value.rawHistory[value.history.currentIndex].state.nodes[0];assert.equal(current.data.text,'late new C');assert.equal(current.data.lcos_ref.revisionId,'r3');
    report.checks.push({name:'late-original-response-updates-base-without-overwriting-new-Tiptap-or-O8-body',before,...value});await context.close();
  }
  {
    const{page,context,editor}=await fixture('lost');await editor.fill('held mixed A');await pump(page,802);await page.evaluate(()=>{fixture.addOrdinary();fixture.addLink()});await pump(page,1602);await pump(page,2);const value=await state(page);
    assert.equal(posts(value).filter(r=>r.body.actions.some(a=>a.updates?.some(n=>n.id==='n'))).length,1);
    assert.equal(posts(value).filter(r=>r.body.actions.some(a=>a.creates?.some(n=>n.id==='plain'))).length,1);assert.equal(value.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/connections:batchActions')).length,1);
    report.checks.push({name:'held-primary-text-does-not-block-real-original-ordinary-node-or-link-workers',...value});await context.close();
  }
  {
    const{page,context,editor}=await fixture('success');await page.evaluate(()=>{fixture.replaceApiBeforeQueue=true});await editor.fill('belongs to replaced API');await pump(page,802);await pump(page,1602);const value=await state(page);
    assert.equal(await page.evaluate(()=>fixture.apiReplaced),true);assert.equal(posts(value).length,0,'an actual deferred original dr op cannot cross into a replacement API with the same canvas ID');assert.equal(value.pending[0]?.status,'core-preflight-failed');assert.match(value.pending[0]?.reason,/original text scene.*unavailable/);assert.equal(value.pending[0]?.body,'belongs to replaced API');assert.equal(value.originalQueue.length,1);assert.equal(value.corePeer.body,'before');assert.equal(value.nodes[0].data.lcos_ref.revisionId,'r1');
    for(const ms of [2600,5100,10100,25100])await pump(page,ms);assert.equal(posts(await state(page)).length,0);
    report.checks.push({name:'same-canvas-replacement-API-retains-deferred-original-draft-with-zero-POST',...await state(page),limitation:'Returning this held operation to its original API is not claimed as completed; only no-cross-context-write is covered.'});await context.close();
  }
  for(const action of ['undo','redo']){
    const{page,context,editor}=await fixture('success');const finalBody='Real G7 final before '+action+' loss';await editor.fill(finalBody);await pump(page,1602);await pump(page,2);let value=await idleState(page);assert.equal(value.corePeer.body,finalBody);assert.equal(value.history.currentIndex,1);assert.equal(value.history.historySize,2);
    if(action==='redo'){await page.evaluate(()=>fixture.history.undo());await pump(page,1602);await pump(page,2);value=await idleState(page);assert.equal(value.corePeer.body,'before');assert.equal(value.history.currentIndex,0)}
    const before=value,baseline=posts(value).length;await page.evaluate(action=>{fixture.mode='lost';fixture.history[action]()},action);await pump(page,1602);await pump(page,2);value=await state(page);assert.equal(posts(value).length-baseline,1);assert.equal(value.pending[0]?.source,'native-history');assert.equal(value.pending[0]?.historyPhase,action);
    const label=action==='undo'?'核对撤销':'核对重做';assert.equal(await page.getByRole('button',{name:label,exact:true}).count(),1,'the actual original UX/gm feedback must offer the correct history recovery action');assert.ok(value.status.some(status=>status.text.includes(action==='undo'?'撤销结果待确认':'重做结果待确认')));
    for(const ms of [2600,5100,10100,25100]){await pump(page,ms);assert.equal(posts(await state(page)).length-baseline,1)}
    const beforeVerify=await state(page);await page.evaluate(()=>{fixture.mode='success'});await page.getByRole('button',{name:label,exact:true}).click();await pump(page,1602);await pump(page,2);const verified=await idleState(page);
    assert.equal(posts(verified).length,posts(beforeVerify).length,'the actual original UX button is GET-only; no fixture API bypass');assert.ok(verified.requests.slice(beforeVerify.requests.length).some(request=>request.method==='GET'&&request.path.includes('/text-save-receipts/')));assert.equal(verified.status.length,0);assert.equal(verified.editor,action==='undo'?'before':finalBody);assert.equal(verified.rawHistory[verified.history.currentIndex].state.nodes[0].data.lcos_ref.revisionId,verified.corePeer.revisionId);assert.equal(await editor.count(),1,'same original G7 remains mounted');
    const opposite=action==='undo'?'redo':'undo';await page.evaluate(opposite=>fixture.history[opposite](),opposite);await pump(page,1602);await pump(page,2);const finished=await idleState(page);assert.equal(posts(finished).length-baseline,2);assert.equal(posts(finished).at(-1).body.lcos_expected_revisions.n,verified.corePeer.revisionId);assert.equal(finished.corePeer.body,action==='undo'?finalBody:'before');assert.equal(finished.editor,finished.corePeer.body);assert.equal(finished.rawHistory[finished.history.currentIndex].state.nodes[0].data.lcos_ref.revisionId,finished.corePeer.revisionId);assert.equal(finished.history.historySize,2);
    report.checks.push({name:'actual-G7-original-UX-'+action+'-loss-native-'+label+'-click-GET-only-and-opposite-raw-CAS',before,beforeVerify,verified,finished,scope:'Actual O8 action and original UX/gm recovery click; no full App physical keyboard or outer modal claim.'});await context.close();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;

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
