import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';

const root = path.resolve(import.meta.dirname, '..'), assets = path.join(root, 'reference/tapnow-installed/resources/web/assets');
const output = path.join(root, 'output/原生文件Drop整合_20261017i/原文件创建ID独立验证', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const require = createRequire(path.join(installedRoot, 'package.json')), { chromium } = require('playwright-core');
const packages = path.join(installedRoot, 'huabu/node_modules/.pnpm');
const traverse = require(path.join(packages, fs.readdirSync(packages).find(name => name.startsWith('@babel+traverse@')), 'node_modules/@babel/traverse/lib/index.js')).default;
const filename = 'page-Da_DfwiK.js', original = fs.readFileSync(path.join(assets, filename), 'utf8');
const changed = transformHistoryIntentScript(filename, transformSurfaceDockScript(filename, transformNodeBridgeScript(filename, transformCutScript(filename, original))));
const ast = parseOriginalDonorScript(changed, filename); let program;
traverse({ type: 'File', program: ast }, { Program(value) { program = value; value.stop(); } });
const environmental = new Set(['he', 'vd', '$e', 'dn', 'se', 'e6']), selected = new Map(), imports = new Map();
function select(name) {
  if (environmental.has(name) || selected.has(name) || imports.has(name)) return;
  const binding = program.scope.getBinding(name); assert.ok(binding, name);
  if (binding.path.isImportSpecifier()) { imports.set(name, 'import{' + binding.path.node.imported.name + ' as ' + name + '}from"/assets/' + path.basename(binding.path.parent.source.value) + '";'); return; }
  assert.ok(binding.path.isVariableDeclarator() || binding.path.isFunctionDeclaration()); selected.set(name, binding.path.node);
  binding.path.traverse({ ReferencedIdentifier(value) { if (value.scope.getBinding(value.node.name)?.scope === program.scope) select(value.node.name); } });
}
select('r6'); select('O8');
let hooks = [...imports.values()].join('\n') + `
const he=()=>({t:key=>key}),vd=()=>((...args)=>fixture.redirects.push(args)),$e=()=>({getEdge:id=>fixture.edges.find(edge=>edge.id===id)});
const dn=()=>({warn:(...args)=>fixture.logs.push(args),error:(...args)=>fixture.logs.push(args)}),se={error:(...args)=>fixture.logs.push(args)},e6=se;
` + [...selected.values()].sort((a, b) => a.start - b.start).map(node => (node.type === 'VariableDeclarator' ? program.scope.getBinding(node.id.name).path.parent.kind + ' ' : '') + changed.slice(node.start, node.end) + ';').join('\n') + '\nexport{r6,O8};';
assert.equal(hooks.split('const __lcosInspectNativeHistory=').length - 1, 1);
hooks = hooks.replace('const __lcosInspectNativeHistory=', 'window.fixture.rawHistory=()=>({index:p.current,history:structuredClone(x.current)});const __lcosInspectNativeHistory=');
parseOriginalDonorScript(hooks, 'actual-hooks.js');
let index = fs.readFileSync(path.join(assets, 'index-BAQXnPag.js'), 'utf8');
assert.equal(index.split(';hFl();').length - 1, 1);
index = index.replace(';hFl();', ';/* no whole App in isolated hook fixture */').replace('VITE_API_BASE_URL:"https://app.tapnow.ai"', 'VITE_API_BASE_URL:window.location.origin')
  + '\nexport{tos as TestReactDOM,Rv as TestPersistRegistry};';
const peer = `
window.fixture={nodes:[{id:'other',type:'text',position:{x:300,y:0},data:{id:'other',text:'untouched'}}],edges:[],requests:[],logs:[],redirects:[],backfills:[]};
const f=window.fixture;f.mode=new URL(location.href).searchParams.get('mode')||'normal';
if(f.mode==='target-collision')f.nodes.push({id:'canonical-file',type:'text',position:{x:600,y:0},data:{id:'canonical-file',text:'other occurrence'}});
f.reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
f.ref={version:1,entityType:'view',entityId:'v-file',artifactId:'a-file',artifactViewId:'v-file',revisionId:'r-file'};
f.file={artifactId:'a-file',artifactViewId:'v-file',revisionId:'r-file',fileRecordId:'file-record',mimeType:'application/pdf',kind:'pdf',size:874};
if(f.mode.startsWith('text-upload'))f.file={...f.file,mimeType:'text/plain',kind:'markdown'};
f.member={workspaceId:'workspace',viewId:'v-file',addedAt:'2026-10-21T00:00:00Z',addedBy:'user'};
f.client={id:'client-file',type:'text',position:{x:10.123,y:20.234},selected:true,data:{id:'client-file',title:'original.pdf',text:'',lcos_upload_url:location.origin+'/api/conversation/storage/uploads/synthetic',lcos_file_ref:f.file}};
if(f.mode==='placed-view-no-upload')delete f.client.data.lcos_upload_url;
if(f.mode.startsWith('excerpt')){f.client.data={id:'client-file',type:'pure',params:{model:'gemini-3.1-flash-lite',provider:'google'},title:'摘录',text:'Bold and 😀',prompt:'',lcos_material_excerpt:{version:1,source:{projectId:'p',artifactId:'a-parent',artifactViewId:'v-parent',revisionId:'r-parent',fileRecordId:'f-parent'},content:{kind:'text',text:'Bold and 😀'}}};}
window.fetch=async(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input),location.href),method=(init?.method||'GET').toUpperCase(),body=typeof init?.body==='string'?JSON.parse(init.body):null;
 if(url.pathname.startsWith('/api/'))f.requests.push({method,path:url.pathname,body});
 if(method==='GET'&&url.pathname==='/api/canvas/v1/canvases/c')return f.reply({code:0,data:{id:'c',nodes:f.nodes,connections:f.edges}});
 if(method==='POST'&&url.pathname.endsWith('/nodes:batchActions')){
  const creates=body.actions.flatMap(action=>action.creates||[]);
  if(creates.length){const submitted=creates[0],canonical=f.mode==='same-id'||f.mode.startsWith('excerpt-same-id')||body.lcos_operation?.phase==='redo'?submitted.id:'canonical-file',operation=structuredClone(body.lcos_operation),ref=structuredClone(f.ref);
   if(f.mode.startsWith('placed-view')){ref.artifactViewId='received-v-file';ref.entityId='received-v-file';}
   if(f.mode==='wrong-operation')operation.operationId='foreign-operation';if(f.mode==='wrong-ref')ref.artifactId='foreign';
   const map={[submitted.id]:canonical},node={clientNodeId:submitted.id,nodeId:canonical,type:'text',data:{id:canonical,title:'original.pdf',text:'',lcos_file_ref:{...f.file,artifactViewId:ref.artifactViewId},lcos_workspace_membership:{...f.member,viewId:ref.artifactViewId,addedAt:operation.phase==='redo'?'2026-10-21T00:01:00Z':f.member.addedAt}},lcos_ref:ref};
   if(f.mode.startsWith('text-upload')){node.imported_file_ref=node.data.lcos_file_ref;delete node.data.lcos_file_ref;Object.assign(node.data,{text:'Original imported text',content:'Original imported text',lcosTextViewMode:'text'});if(f.mode==='text-upload-wrong-file')node.imported_file_ref.fileRecordId='foreign';if(f.mode==='text-upload-no-proof')delete node.imported_file_ref;}
   if(f.mode.startsWith('excerpt')){delete node.data.lcos_file_ref;Object.assign(node.data,{title:'摘录',text:f.mode==='excerpt-wrong-body'?'Wrong body':'Bold and 😀',content:f.mode==='excerpt-wrong-body'?'Wrong body':'Bold and 😀'});}
   const mismatch={"placed-view-wrong-file":'fileRecordId',"placed-view-wrong-mime":'mimeType',"placed-view-wrong-revision":'revisionId',"placed-view-wrong-target":'artifactViewId',"placed-view-wrong-size":'size'}[f.mode];if(mismatch)node.data.lcos_file_ref[mismatch]=mismatch==='size'?875:'foreign';
   const result={canvas_id:'c',operation,nodes:[node],lcos_refs:{[canonical]:ref},client_to_spatial_ids:map,core_saved:true,spatial_saved:true};
   const payload={code:0,data:{canvas_id:'c',nodes:[],connections:[],core_saved:true,spatial_saved:true,lcos_expected_revisions:{[canonical]:'r-file'},client_to_spatial_ids:map,lifecycle_results:[result]}};
   if(f.mode==='wrong-map')payload.data.client_to_spatial_ids[submitted.id]='foreign-map';
   f.createdResponse=payload;if(operation.phase==='redo')return f.reply(payload);
   if(f.mode.startsWith('excerpt')&&f.mode.endsWith('partial')){const cause={coreBound:true,spatialSaved:true,nodeId:canonical,completed:[node],lcos_refs:result.lcos_refs,client_to_spatial_ids:map};const partial={code:40900,data:null,message:'来源连接尚未确认',error:{code:'PARTIAL_LIFECYCLE_COMMIT',details:{canvas_id:'c',operation,completed:[node],lcos_refs:result.lcos_refs,client_to_spatial_ids:map,causeCode:'EXCERPT_SOURCE_LINK_UNCONFIRMED',causeDetails:cause}}};return new Promise(resolve=>{f.release=()=>resolve(f.reply(partial,409))});}
   if(f.mode==='excerpt-unknown')return new Promise((resolve,reject)=>{f.release=()=>reject(new TypeError('Controlled response loss after submission'))});
   return new Promise(resolve=>{f.release=()=>resolve(f.reply(payload))});
  }
  const updates=body.actions.flatMap(action=>action.updates||[]);if(!f.mode.startsWith('excerpt-same-id')&&updates.some(item=>item.id==='client-file'))return f.reply({code:404,msg:'Unknown temporary node'},404);
  return f.reply({code:0,data:{core_saved:true,spatial_saved:true}});
 }
 if(method==='POST'&&url.pathname.endsWith('/connections:batchActions'))return f.reply({code:0,data:{}});
 return f.reply({code:0,data:{}});
};`;
const app = `
import{cd as React,TestReactDOM,TestPersistRegistry}from'/assets/index-BAQXnPag.js';import{r6,O8}from'/actual-hooks.js';const f=window.fixture;
function Hook(){const[nodes,setNodes]=React.useState(f.nodes),[edges,setEdges]=React.useState(f.edges);f.nodes=nodes;f.edges=edges;
 const nodeChanges=React.useCallback(changes=>setNodes(previous=>{let next=previous.slice();for(const change of changes){const id=change.item?.id??change.id,index=next.findIndex(node=>node.id===id);if(change.type==='add')next.push(change.item);else if(change.type==='replace')next[index]=change.item;else if(change.type==='remove')next=next.filter(node=>node.id!==id);else if(change.type==='dimensions'&&index>=0)next[index]={...next[index],measured:change.dimensions};else if(change.type==='position'&&index>=0)next[index]={...next[index],position:change.position};}return next}),[]);
 const edgeChanges=React.useCallback(changes=>setEdges(previous=>{const next=previous.slice();for(const change of changes)if(change.type==='add')next.push(change.item);return next}),[]);
 f.queue=r6({canvasId:'c',onNodesChange:nodeChanges,onEdgesChange:edgeChanges,getNode:id=>f.nodes.find(node=>node.id===id)??(f.displayGhost?.id===id?f.displayGhost:undefined)});
 const receiptSetNodes=React.useCallback(value=>{if(f.mode==='setter-error'&&!f.setterThrew&&value.some(node=>node.id==='canonical-file')){f.setterThrew=true;throw Error('Synthetic original setter failure')}setNodes(value)},[]);
 f.history=O8(nodes,edges,{canvasId:'c',enabled:true,disableShortcuts:true,defaultOnNodesChange:nodeChanges,defaultOnEdgesChange:edgeChanges,onBatchOperations:f.queue.executeBatchOperations,setNodes:receiptSetNodes,setEdges});return null;
}
const api={getNode:id=>f.nodes.find(node=>node.id===id)??(f.displayGhost?.id===id?f.displayGhost:undefined),getNodes:()=>f.displayGhost?[...f.nodes,f.displayGhost]:f.nodes,readOriginalNode:id=>f.nodes.find(node=>node.id===id),backfillNodeReceipt(receipt){f.backfills.push(receipt);return f.history.backfillNodeReceipt(receipt)}};
window.__LCOS_NODE_LAB__={canvasId:'c',currentCanvasId:'c',projectId:'p',api};
f.root=TestReactDOM.createRoot(document.getElementById('app'));f.root.render(React.createElement(Hook));
f.start=()=>f.queue.handleNodeChange([{type:'add',item:structuredClone(f.client)}]);
f.measure=()=>f.queue.handleNodeChange([{type:'dimensions',id:'client-file',dimensions:{width:250,height:250},resizing:false}]);
f.rename=()=>{const node=api.getNode('client-file');f.queue.handleNodeChange([{type:'replace',id:node.id,item:{...node,data:{...node.data,title:'later-local-title.pdf'}}}]);};
f.link=()=>f.queue.handleEdgeChange([{type:'add',item:{id:'edge-file',source:'client-file',target:'other',type:'default',data:{}}}]);
f.flush=()=>TestPersistRegistry.get('c').flush();f.ready=true;
`;
const routes = new Map([['/peer.js', peer], ['/app.js', app], ['/actual-hooks.js', hooks], ['/assets/index-BAQXnPag.js', index],
  ['/startup-surface-core.js', fs.readFileSync(path.join(root, 'lab/startup-surface-core.js'), 'utf8')],
  ['/startup-history-intent.js', fs.readFileSync(path.join(root, 'lab/startup-history-intent.js'), 'utf8')]]);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (routes.has(pathname)) { res.setHeader('Content-Type', 'text/javascript'); res.end(routes.get(pathname)); return; }
  if (pathname.startsWith('/assets/')) { const target = path.resolve(assets, pathname.slice(8)); if (target.startsWith(assets + path.sep) && fs.existsSync(target)) { res.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); res.end(fs.readFileSync(target)); return; } res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');res.end('<!doctype html><head><meta charset="utf-8"><script src="/peer.js"></script><script src="/startup-history-intent.js"></script><script src="/startup-surface-core.js"></script></head><body><div id="app"></div><script type="module" src="/app.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = { passed: false, scope: 'Actual transformed original r6/O8, installed React/request hook/serializer and production wrapper/receipt helper in isolated Chrome; HTTP peer controlled, no real Core/candidate/model or App GUI claim.', cases: [], errors: [], excludedModes: process.argv.includes('--exclude-history-roundtrip') ? ['history-roundtrip'] : [] };
let activePage;
async function fixture(mode) {
  const context = await browser.newContext(), page = await context.newPage(); activePage = page;
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await context.routeWebSocket('**/*', socket => socket.close());
  await page.clock.install({ time: new Date('2026-10-17T00:00:00Z') }); await page.clock.pauseAt(new Date('2026-10-17T00:00:00Z'));
  await page.goto(base + '/?mode=' + mode); await page.waitForFunction(() => fixture.ready && fixture.flush && fixture.rawHistory, null, { polling: 10 });
  await page.evaluate(async () => { await fetch('/api/canvas/v1/canvases/c'); fixture.start(); });
  if(mode==='same-flush'){await page.clock.runFor(5);await page.evaluate(()=>{fixture.measure();fixture.link()});}
  await page.clock.runFor(501); await page.waitForFunction(() => typeof fixture.release === 'function', null, { polling: 10 });
  return { context, page };
}
const state = page => page.evaluate(() => ({ nodes: fixture.nodes, edges: fixture.edges, requests: fixture.requests, backfills: fixture.backfills, history: fixture.rawHistory(), redirects: fixture.redirects, logs: fixture.logs }));
try {
  const requestedMode = process.argv.find(value=>value.startsWith('--mode='))?.slice(7);
  const modes = ['excerpt','excerpt-history','excerpt-partial','excerpt-unknown','excerpt-wrong-body','excerpt-same-id','excerpt-same-id-history','excerpt-same-id-partial','late-measurement', 'presence-measurement', 'placed-view', 'same-flush', 'normal', 'later-edit', 'history-roundtrip', 'text-upload', 'text-upload-wrong-file', 'text-upload-no-proof', 'wrong-operation', 'wrong-ref', 'wrong-api', 'wrong-scene', 'wrong-map', 'target-collision', 'setter-error', 'same-id', 'placed-view-wrong-file', 'placed-view-wrong-mime', 'placed-view-wrong-revision', 'placed-view-wrong-target', 'placed-view-wrong-size', 'placed-view-no-upload'];
  assert.ok(!requestedMode || modes.includes(requestedMode));
  for (const mode of modes.filter(mode => (!requestedMode || mode===requestedMode) && (!process.argv.includes('--excerpt-only') || mode.startsWith('excerpt')) && (!process.argv.includes('--exclude-history-roundtrip') || mode !== 'history-roundtrip'))) {
    const { context, page } = await fixture(mode);
    await page.evaluate(mode => { if(mode!=='same-flush')fixture.measure(); if(!mode.startsWith('excerpt')&&!['same-flush','history-roundtrip'].includes(mode))fixture.link(); if (mode === 'wrong-api') window.__LCOS_NODE_LAB__ = { ...window.__LCOS_NODE_LAB__, api: { ...window.__LCOS_NODE_LAB__.api } };if(mode==='wrong-scene')window.__LCOS_NODE_LAB__={...window.__LCOS_NODE_LAB__,canvasId:'foreign-canvas',currentCanvasId:'foreign-canvas'}; }, mode);
    await page.clock.runFor(5);
    if (mode === 'later-edit') { await page.evaluate(() => fixture.rename()); await page.clock.runFor(5); }
    const before = await state(page);
    await page.evaluate(() => fixture.release()); await page.clock.runFor(1600); await page.waitForTimeout(150);
    if(mode==='late-measurement'){await page.evaluate(()=>fixture.measure());await page.clock.runFor(1100);await page.waitForTimeout(100);}
    if(mode==='presence-measurement'){await page.evaluate(()=>{fixture.displayGhost={...structuredClone(fixture.client),className:'canvas-node-presence-exiting',draggable:false};fixture.measure();});await page.clock.runFor(1100);await page.waitForTimeout(100);}
    const value = await state(page);
    if(mode.startsWith('excerpt')){
      const accepted=!['excerpt-unknown','excerpt-wrong-body'].includes(mode),id=accepted&&!mode.startsWith('excerpt-same-id')?'canonical-file':'client-file',node=value.nodes.find(n=>n.id===id);
      assert.ok(node);assert.equal(value.nodes.filter(n=>n.id!=='other').length,1);
      if(accepted){assert.equal(node.data.lcos_material_excerpt,undefined);assert.equal(node.data.type,undefined);assert.equal(node.data.params,undefined);assert.equal(node.data.text,'Bold and 😀');assert.equal(node.data.lcos_ref.artifactId,'a-file');for(const entry of value.history.history){for(const n of entry.state.nodes)assert.equal(n.data.lcos_material_excerpt,undefined);for(const action of entry.lcos_history_operations||[])assert.equal(action.lcos_snapshot?.data?.lcos_material_excerpt,undefined);}}
      else assert.ok(node.data.lcos_material_excerpt,'unaccepted receipt preserves the attempted source');
      const proof=await page.evaluate(()=>{const host=window.__LCOS_NODE_LAB__;return window.__LCOS_NATIVE_INTENT__.readAcceptedCreateReceipt({projectId:'p',canvasId:'c',clientNodeId:'client-file',api:host.api})??null});
      if(accepted&&!mode.endsWith('partial'))assert.equal(proof?.nodeId,id);else assert.equal(proof,null,'partial source relationship cannot claim accepted excerpt');
      if(mode.endsWith('partial')||['excerpt-unknown','excerpt-wrong-body'].includes(mode)){
        await page.evaluate(id=>fixture.queue.handleNodeChange([{type:'position',id,position:{x:77,y:88},dragging:false}]),id);
        await page.clock.runFor(15000);await page.waitForTimeout(100);await page.evaluate(()=>{fixture.flush().then(value=>fixture.manualFlushResult=value)});await page.clock.runFor(15000);await page.waitForFunction(()=>fixture.manualFlushResult!==undefined);await page.waitForTimeout(100);
        const held=await state(page);assert.equal(held.requests.filter(r=>r.body?.actions?.some(a=>a.creates?.length)).length,1,'unconfirmed fresh producer must never be retried');report.excerptHeld={mode,requests:held.requests.length};
      }
      if(mode.endsWith('history')){
        await page.evaluate(()=>fixture.history.undo());await page.clock.runFor(1200);await page.waitForTimeout(100);assert.equal((await state(page)).nodes.some(n=>n.id===id),false);
        await page.evaluate(()=>fixture.history.redo());await page.clock.runFor(1200);await page.waitForTimeout(100);const redo=await state(page);const restored=redo.nodes.find(n=>n.id!=='other');assert.equal(restored.data.lcos_material_excerpt,undefined);assert.equal(restored.data.lcos_ref.artifactId,'a-file');const creates=redo.requests.filter(r=>r.body?.actions?.some(a=>a.creates?.length));assert.equal(creates.length,2);assert.equal(creates[1].body.lcos_operation.phase,'redo');assert.equal(creates[1].body.actions[0].creates[0].data.lcos_material_excerpt,undefined);report.excerptHistory=redo;
      }
    } else if (['late-measurement', 'presence-measurement', 'placed-view', 'same-flush', 'normal', 'later-edit', 'history-roundtrip','text-upload'].includes(mode)) {
      assert.equal(value.nodes.filter(node => node.id === 'canonical-file').length, 1); assert.equal(value.nodes.some(node => node.id === 'client-file'), false);
      const node = value.nodes.find(node => node.id === 'canonical-file'); assert.equal(node.data.id, node.id); assert.equal(node.data.lcos_ref.artifactId, 'a-file');
      assert.equal(node.selected, true); assert.deepEqual(node.position, { x: 10.123, y: 20.234 }); assert.deepEqual(node.measured, { width: 250, height: 250 });
      assert.equal(node.data.title, mode === 'later-edit' ? 'later-local-title.pdf' : 'original.pdf');
      assert.equal(node.data.lcos_upload_url, undefined); assert.deepEqual(value.nodes.find(node => node.id === 'other'), before.nodes.find(node => node.id === 'other'));
      const creates = value.requests.filter(item => item.method === 'POST' && item.path.endsWith('/nodes:batchActions') && item.body?.actions?.some(action => action.creates?.length)); assert.equal(creates.length, 1);
      const updates = value.requests.filter(item => item.method === 'POST').flatMap(item => item.body?.actions?.flatMap(action => action.updates || []) || []);
      assert.ok(updates.length > 0); assert.ok(updates.every(item => item.id === 'canonical-file'));
      if(mode!=='history-roundtrip')assert.equal(value.edges[0].source, 'canonical-file');
      assert.equal(value.redirects.length, 0);
      for (const entry of value.history.history) { assert.ok(!entry.state.nodes.some(node => node.id === 'client-file')); for (const edge of entry.state.edges) assert.notEqual(edge.source, 'client-file'); }
      const action = value.history.history.flatMap(entry => entry.lcos_history_operations || []).find(action => action.changeType === 'add');
      assert.ok(action.aliases.includes('client-file') && action.aliases.includes('canonical-file')); assert.equal(action.carrierId, 'canonical-file'); assert.equal(action.lcos_ref.artifactId, 'a-file');
      assert.equal(action.nodeId,'canonical-file','original history source follows the same accepted snapshot identity');
      assert.equal(action.lcos_snapshot.id,'canonical-file');assert.equal(action.lcos_snapshot.data.lcos_workspace_membership.viewId,node.data.lcos_ref.artifactViewId);
      if(mode==='text-upload'){assert.equal(node.data.lcos_file_ref,undefined);assert.equal(node.data.text,'Original imported text');assert.equal(node.data.content,node.data.text);}
      if(mode==='presence-measurement'){
        const guards=await page.evaluate(()=>{
          const saved=window.__LCOS_NODE_LAB__,read=saved.api.readOriginalNode,results=[];
          for(const mode of ['wrong-api','wrong-project','wrong-canvas','old-id-reused','ref-changed','new-size','position','data','lifecycle','extra-dimensions']){
            const operation={id:'client-file',operationType:'update',dimensions:{width:250,height:250},timestamp:Date.now()};
            if(mode==='position')operation.position={x:9,y:9};if(mode==='data')operation.data={title:'new'};
            if(mode==='lifecycle')operation.operationType='create';if(mode==='extra-dimensions')operation.dimensions.newField=true;
            if(mode==='wrong-api')window.__LCOS_NODE_LAB__={...saved,api:{...saved.api}};
            if(mode==='wrong-project')window.__LCOS_NODE_LAB__={...saved,projectId:'other'};
            if(mode==='wrong-canvas')window.__LCOS_NODE_LAB__={...saved,currentCanvasId:'other'};
            saved.api.readOriginalNode=id=>{
              if(mode==='old-id-reused'&&id==='client-file')return fixture.client;
              const n=read(id);if(!n)return n;
              if(mode==='ref-changed')return {...n,data:{...n.data,lcos_ref:{...n.data.lcos_ref,revisionId:'new'}}};
              return mode==='new-size'?{...n,measured:{width:500,height:500}}:n;
            };
            window.__LCOS_NATIVE_INTENT__.normalizeQueuedCreateMeasurements('c',[operation]);
            results.push({mode,id:operation.id});saved.api.readOriginalNode=read;window.__LCOS_NODE_LAB__=saved;
          }return results;
        });assert.ok(guards.every(v=>v.id==='client-file'));report.queuedMeasurementGuards=guards;
      }
      if(mode==='late-measurement'){
        const guards=await page.evaluate(()=>{
          const saved=window.__LCOS_NODE_LAB__,results=[];
          for(const mode of ['wrong-api','wrong-project','wrong-canvas','old-id-reused','ref-changed','new-size','resize','position']){
            const change=mode==='position'?{type:'position',id:'client-file',position:{x:9,y:9},dragging:false}:{type:'dimensions',id:'client-file',dimensions:{width:250,height:250},resizing:mode==='resize'};
            if(mode==='wrong-api')window.__LCOS_NODE_LAB__={...saved,api:{...saved.api}};
            if(mode==='wrong-project')window.__LCOS_NODE_LAB__={...saved,projectId:'other'};
            if(mode==='wrong-canvas')window.__LCOS_NODE_LAB__={...saved,currentCanvasId:'other'};
            const getNode=id=>{if(mode==='old-id-reused'&&id==='client-file')return fixture.client;const n=saved.api.getNode(id);if(!n)return n;
              if(mode==='ref-changed')return {...n,data:{...n.data,lcos_ref:{...n.data.lcos_ref,revisionId:'new'}}};
              if(mode==='new-size')return {...n,measured:{width:500,height:500}};return n;};
            window.__LCOS_NATIVE_INTENT__.tagChanges([change],getNode,'c');results.push({mode,id:change.id});window.__LCOS_NODE_LAB__=saved;
          }return results;
        });assert.ok(guards.every(v=>v.id==='client-file'));report.lateMeasurementGuards=guards;
      }
      if(mode==='history-roundtrip'){
        assert.equal(value.history.index,1,'one real file creation history entry');
        await page.evaluate(()=>fixture.history.undo());await page.clock.runFor(1100);await page.waitForTimeout(100);
        const undo=await state(page);assert.ok(!undo.nodes.some(node=>node.id==='canonical-file'));assert.equal(undo.history.index,0);
        const deletes=undo.requests.filter(item=>item.path.endsWith('/nodes:batchActions')&&item.body?.actions?.some(action=>action.action==='delete'));assert.equal(deletes.length,1);assert.deepEqual(deletes[0].body.actions[0].delete_ids,['canonical-file']);assert.equal(deletes[0].body.lcos_operation.phase,'undo');
        assert.deepEqual(deletes[0].body.lcos_snapshots['canonical-file'].data.lcos_workspace_membership,{workspaceId:'workspace',viewId:'v-file',addedAt:'2026-10-21T00:00:00Z',addedBy:'user'});
        await page.evaluate(()=>fixture.history.redo());await page.clock.runFor(1100);await page.waitForTimeout(100);
        const redo=await state(page),restored=redo.nodes.filter(node=>node.id!=='other');assert.equal(restored.length,1);assert.equal(restored[0].data.lcos_ref.artifactId,'a-file');assert.equal(restored[0].data.lcos_file_ref.fileRecordId,'file-record');assert.equal(restored[0].data.lcos_upload_url,undefined);assert.equal(redo.history.index,1);
        const restoredCreate=redo.requests.filter(item=>item.path.endsWith('/nodes:batchActions')&&item.body?.lcos_operation?.phase==='redo');assert.equal(restoredCreate.length,1);assert.equal(restoredCreate[0].body.actions[0].creates[0].data.lcos_upload_url,undefined);assert.equal(redo.redirects.length,0);
        assert.equal(redo.history.history[1].state.nodes.find(node=>node.id!=='other').id,restored[0].id,'confirmed recreation and its original history snapshot share one carrier identity');
        await page.evaluate(id=>fixture.queue.handleNodeChange([{type:'dimensions',id,dimensions:{width:250,height:250},resizing:false}]),restored[0].id);await page.clock.runFor(1200);await page.waitForTimeout(100);
        assert.equal((await state(page)).history.index,1,'post-redo native measurement must not record the recreated ID as another action');
        await page.evaluate(id=>fixture.queue.handleNodeChange([{type:'position',id,position:{x:400,y:500},dragging:false}]),restored[0].id);await page.clock.runFor(1200);await page.waitForTimeout(100);await page.clock.runFor(1200);
        const edited=await state(page);assert.equal(edited.history.index,2,'a real edit after redo must still record');assert.deepEqual(edited.nodes.find(n=>n.id===restored[0].id).position,{x:400,y:500});
        await page.evaluate(()=>fixture.history.undo());await page.clock.runFor(1100);await page.waitForTimeout(100);
        const editUndo=await state(page);assert.deepEqual(editUndo.nodes.find(n=>n.id===restored[0].id).position,{x:10.123,y:20.234});assert.equal(editUndo.requests.filter(r=>r.body?.actions?.some(a=>a.creates?.length)).length,2,'undoing the edit updates the same carrier instead of recreating it');
        await page.evaluate(()=>fixture.history.undo());await page.clock.runFor(1100);await page.waitForTimeout(100);
        const secondUndo=await state(page),secondDeletes=secondUndo.requests.filter(item=>item.body?.actions?.some(action=>action.action==='delete'));assert.equal(secondDeletes.length,2);
        const removed=secondDeletes[1].body;assert.deepEqual(removed.actions[0].delete_ids,[restored[0].id]);assert.equal(removed.lcos_snapshots[restored[0].id].id,restored[0].id);assert.equal(removed.lcos_snapshots[restored[0].id].data.lcos_workspace_membership.addedAt,'2026-10-21T00:01:00Z');
        report.historyRoundtrip={undo,redo};
      }
    } else if (mode === 'same-id') {
      assert.ok(value.nodes.some(node => node.id === 'client-file')); assert.equal(value.backfills.some(receipt => receipt.receiptKind === 'native-create-identity'), false);
    } else {
      assert.ok(value.nodes.some(node => node.id === 'client-file'));
      if(mode==='target-collision')assert.equal(value.nodes.filter(node=>node.id==='canonical-file').length,1);
      else assert.equal(value.nodes.some(node => node.id === 'canonical-file'), false);
      assert.equal(value.backfills.filter(receipt => receipt.receiptKind === 'native-create-identity').length, (['wrong-ref','setter-error'].includes(mode)||mode.startsWith('placed-view')||mode.startsWith('text-upload')) ? 1 : 0);
    }
    report.cases.push({ name: mode, before, after: value }); await context.close();
  }
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) {
  report.error = { message: error.message, stack: error.stack }; process.exitCode = 1;
  if (activePage && !activePage.isClosed()) try { report.failure = await state(activePage); } catch {}
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, output, error: report.error }, null, 2));
}
