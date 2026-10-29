import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { createRequire } from 'node:module';

import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';

const filename = 'page-Da_DfwiK.js';
const pageSource = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/' + filename, import.meta.url), 'utf8');
const debounceSource = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-D4wysAbz.js', import.meta.url), 'utf8');
const runtimeSource = fs.readFileSync(new URL('../lab/startup-history-intent.js', import.meta.url), 'utf8');

function parser() {
  const require = createRequire(import.meta.url);
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  const cached = fs.existsSync(cache)
    ? fs.readdirSync(cache).sort().map(entry => path.join(cache, entry, 'node_modules/playwright/lib/transform/babelBundle.js'))
      .find(file => fs.existsSync(file))
    : undefined;
  if (cached) return require(cached).babelParse;
  const store = 'E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/node_modules/.pnpm';
  const installed = fs.existsSync(store) && fs.readdirSync(store).find(entry => entry.startsWith('@babel+parser@'));
  if (!installed) throw new Error('Installed Babel parser unavailable; no download attempted.');
  const babel = require(path.join(store, installed, 'node_modules/@babel/parser/lib/index.js'));
  return (source, name) => babel.parse(source, { sourceType: 'module', sourceFilename: name });
}

const parse = parser();
const transformed = transformHistoryIntentScript(filename,
  transformSurfaceDockScript(filename,
    transformNodeBridgeScript(filename,
      transformCutScript(filename, pageSource))));
assert.ok(transformed.startsWith('/* __LCOS_HISTORY_INTENT_TRANSFORMED__ */'));
assert.equal(transformHistoryIntentScript(filename, transformed), transformed, 'history transform remains idempotent');
assert.match(transformed, /\.queueCollectionArrangeIntent=/,
  'the narrow queue is bound onto the original O8 receipt bridge, not a second history owner');
assert.match(transformed, /\.cancelCollectionArrangeIntent=/,
  'the original O8 owner exposes cancellation for an arrange that never reaches its snapshot');
assert.match(transformed, /collectionSpaceVersion\(e,[A-Za-z_$][\w$]*\.lcos_operation\)/,
  'the existing original R6 node request reads a fresh Canvas version for explicit collection intents');

function binding(program, name) {
  const matches = [];
  for (const statement of program.body) {
    const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (node?.type === 'FunctionDeclaration' && node.id?.name === name) matches.push(node);
    if (node?.type === 'VariableDeclaration') for (const item of node.declarations) {
      if (item.id?.type === 'Identifier' && item.id.name === name) matches.push(item.init);
    }
  }
  assert.equal(matches.length, 1, `Expected one original vendor binding ${name}, found ${matches.length}.`);
  return matches[0];
}

const program = parse(transformed, filename).program;
const code = (source, node) => source.slice(node.start, node.end);
const originalNames = ['O8', 'IC', 'TC', 'kC', 'l0', 'P8', 'M8', 'L8', 'R8', 'A8', 'D8', 'j8', 'k8', 'PC'];
const original = new Map(originalNames.map(name => [name, code(transformed, binding(program, name))]));
const debounceProgram = parse(debounceSource, 'UnlimitedModeToggle-D4wysAbz.js').program;
const debounceCode = code(debounceSource, binding(debounceProgram, 'PN'));

function sameDeps(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
}

class HookHarness {
  constructor(hook) { this.hook = hook; this.slots = []; this.cursor = 0; this.pendingEffects = []; this.dirty = false; }
  slot(kind) {
    const index = this.cursor++;
    let slot = this.slots[index];
    if (!slot) this.slots[index] = slot = { kind, initialized: false };
    assert.equal(slot.kind, kind, `O8 hook order changed at ${index}.`);
    return slot;
  }
  useState(initial) {
    const slot = this.slot('state');
    if (!slot.initialized) { slot.value = typeof initial === 'function' ? initial() : initial; slot.initialized = true; }
    if (!slot.setter) slot.setter = next => { slot.value = typeof next === 'function' ? next(slot.value) : next; this.dirty = true; };
    return [slot.value, slot.setter];
  }
  useRef(initial) {
    const slot = this.slot('ref');
    if (!slot.initialized) { slot.value = { current: initial }; slot.initialized = true; }
    return slot.value;
  }
  useMemo(factory, deps) {
    const slot = this.slot('memo');
    if (!slot.initialized || !sameDeps(slot.deps, deps)) { slot.value = factory(); slot.deps = deps; slot.initialized = true; }
    return slot.value;
  }
  useCallback(callback, deps) { return this.useMemo(() => callback, deps); }
  useEffect(effect, deps) {
    const slot = this.slot('effect');
    if (!slot.initialized || deps === undefined || !sameDeps(slot.deps, deps)) {
      slot.initialized = true; slot.nextEffect = effect; slot.nextDeps = deps; this.pendingEffects.push(slot);
    }
  }
  render(args) {
    for (let pass = 0; pass < 12; pass += 1) {
      this.dirty = false; this.cursor = 0; this.pendingEffects = [];
      this.output = this.hook(...args);
      const effects = this.pendingEffects;
      for (const slot of effects) {
        if (typeof slot.cleanup === 'function') slot.cleanup();
        slot.deps = slot.nextDeps; slot.cleanup = slot.nextEffect();
      }
      if (!this.dirty) return this.output;
    }
    throw new Error('O8 VM hook harness did not settle.');
  }
}

function applyOriginalChanges(nodes, changes) {
  let result = [...nodes];
  for (const change of changes) {
    if (change.type === 'remove') result = result.filter(node => node.id !== change.id);
    else if (change.type === 'add') result.push(change.item);
    else if (change.type === 'replace') result = result.map(node => node.id === change.id ? change.item : node);
  }
  return result;
}


const root=path.resolve(import.meta.dirname,'..'),runtime=fs.mkdtempSync(path.join(root,'.runtime/frame-title-rejected-'));
const output=path.join(root,'output/普通Frame标题拒绝恢复_20261028',new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(output,{recursive:true});
const report={passed:false,diagnostic:true,cases:[],states:[],transport:[],scope:'Actual original O8/M8 + production Frame editor controller/bridge/intent + full production fetch wrapper to real isolated facade/Huabu/Core. Controlled Flow/scheduling ports; no browser, live Core or provider.'};
const oldFetch=globalThis.fetch,oldWindow=globalThis.window,pattern=/^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|OPENROUTER_|DEEPSEEK_)/,env=new Map(Object.entries(process.env).filter(([k])=>pattern.test(k)));
for(const k of env.keys())delete process.env[k];process.env.LCOS_RECOVERY_TRANSPORT='none';process.env.LCOS_OLLAMA_URL='http://127.0.0.1:1';process.env.LCOS_CAPTURE_STAGING_ROOT=path.join(runtime,'capture');process.env.LCOS_OCR_RUNTIME_DIR=path.join(runtime,'ocr');
globalThis.fetch=async(input,init={})=>{const u=new URL(input instanceof Request?input.url:String(input));assert.equal(u.protocol,'http:');assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname));assert.ok(process._getActiveHandles().some(h=>h instanceof Server&&h.listening&&String(h.address()?.port)===u.port));return oldFetch(input,{...init,redirect:'error'});};
let facade;
try{
 const entry=path.join(runtime,'entry.ts'),rel=f=>path.relative(runtime,path.join(root,f)).replaceAll('\\','/');
 fs.writeFileSync(entry,'export{startSurfaceCoreFacade}from '+JSON.stringify(rel('lab/pilot/surface-core-facade.ts'))+';export{space}from '+JSON.stringify(rel('lcos/huabu/apps/server/src/modules/storage/index.ts'))+';export{createNativeFrameTitleEditor}from '+JSON.stringify(rel('lab/pilot/native-frame-title.ts'))+';');
 const mod=await import(pathToFileURL(await buildPilotEntry(path.relative(root,entry),path.join(runtime,'entry.mjs'),'node',{coreColorPin:true,coreCollectionTitle:true,coreWorkspaceMembership:true,coreWorkflowCollectionMembers:true,coreMixedScopeContext:true})));
 facade=await mod.startSurfaceCoreFacade({runtimeRoot:path.join(runtime,'owned'),publicOrigin:'http://127.0.0.1:19946',fullIntegration:true,nativeCollectionPilot:true,nativeTextPilot:true,nativeAssemblyPilot:true,nativeRailPilot:true});
 const canvasId='surface-core-main',projectId=facade.core.projectId,nodeId='rejected-title-frame',canvasPath='/api/canvas/v1/canvases/'+canvasId,batchPath=canvasPath+'/nodes:batchActions';
 const rawcreate=await facade.spatial.execute(canvasId,[{type:'CREATE_NODES',nodes:[{id:nodeId,nodeType:'frame',position:{x:1800,y:1000},size:{width:420,height:260},data:{label:'原标题',sizing:'manual',layoutMode:'free'}}]}]);assert.ok(rawcreate.results.every(x=>x.applied));
 const domain=structuredClone(facade.core.repository.get(projectId)),bytes=await Promise.all(domain.fileRecords.map(async r=>({path:r.observedPath,bytes:await fs.promises.readFile(r.observedPath)})));
 let liveNodes=[],api,harness;const clone=x=>JSON.parse(JSON.stringify(x));
 const b={console,Date,Promise,Map,Set,WeakMap,Object,Array,Math,Number,String,Boolean,JSON,structuredClone,setTimeout,clearTimeout,URL,Request,Response,crypto:{randomUUID},location:{href:'http://127.0.0.1:19946/canvas/'+canvasId,origin:'http://127.0.0.1:19946'},
 ef:v=>typeof v==='number'?v:Number(v),F0:v=>v!==null&&typeof v==='object',NN:Math.max,MN:Math.min,_c:()=>Date.now(),kN:'Expected a function',qp(){},ee:{PILE:'pile'},xs(){throw Error('No remap');}};b.window=b;const cx=vm.createContext(b);
 vm.runInContext(runtimeSource,cx);for(const n of originalNames)b[n]=vm.runInContext('('+original.get(n)+')',cx);b.Ra=vm.runInContext('('+debounceCode+')',cx);
 const intent=b.__LCOS_NATIVE_INTENT__,ownerApi={getNode:id=>liveNodes.find(n=>n.id===id),getNodes:()=>liveNodes};b.__LCOS_NODE_LAB__={api:ownerApi,canvasId,currentCanvasId:canvasId,projectId};
 b.fetch=async(input,init={})=>{const url=new URL(input instanceof Request?input.url:String(input),b.location.href);assert.equal(url.origin,b.location.origin);const method=String(init.method??'GET').toUpperCase(),body=init.body?JSON.parse(init.body):undefined;
 const r=await facade.handle({method,url:url.pathname+url.search,body});report.transport.push({method,path:url.pathname,status:r.status,...(body?{body}: {})});return new Response(JSON.stringify(r.body),{status:r.status,headers:{'content-type':'application/json'}});};
 vm.runInContext(fs.readFileSync(path.join(root,'lab/startup-surface-core.js'),'utf8'),cx);
 liveNodes=(await(await b.fetch(canvasPath)).json()).data.nodes;
 const opts={enabled:true,maxHistorySize:30,debounceDelay:1000,canvasId,defaultOnNodesChange(changes){intent.tagChanges(changes,id=>liveNodes.find(n=>n.id===id),canvasId);liveNodes=applyOriginalChanges(liveNodes,changes);},defaultOnEdgesChange(){},onBatchOperations(){return Promise.resolve({});},setNodes:n=>{liveNodes=n;},setEdges(){}};
 opts.onBatchOperations.readExternalGeometryReadiness=()=>({canvasId,idle:true});harness=new HookHarness(b.O8);b.l={useState:(...a)=>harness.useState(...a),useRef:(...a)=>harness.useRef(...a),useMemo:(...a)=>harness.useMemo(...a),useCallback:(...a)=>harness.useCallback(...a),useEffect:(...a)=>harness.useEffect(...a)};
 const render=()=>{api=harness.render([liveNodes,[],opts]);return api;};render();ownerApi.backfillNodeReceipt=input=>api.backfillNodeReceipt(input);
 const bridgeSource=fs.readFileSync(path.join(root,'lab/startup-node-bridge.js'),'utf8'),bp=parse(bridgeSource,'startup-node-bridge.js').program;b.nonEmptyString=vm.runInContext('('+code(bridgeSource,binding(bp,'nonEmptyString'))+')',cx);
 const transmitted=new Set();
 const controls=vm.runInContext('('+code(bridgeSource,binding(bp,'createFrameTitleControls'))+')',cx)({api:{getNodes:()=>liveNodes,updateNodeData(id,data){const old=liveNodes.find(n=>n.id===id);opts.defaultOnNodesChange([{type:'replace',id,item:{...old,data:{...old.data,...data}}}]);render();}},ownerApi,getHost:()=>b.__LCOS_NODE_LAB__,readOriginalNodes:()=>liveNodes,
 prepareHistory(){const result=api.backfillNodeReceipt.prepareCollectionGeometryHistory();render();return result;},inspectHistory:q=>api.inspectNativeHistory(q),request:(...a)=>b.fetch(...a),
 async flushCanvas(){const r=intent.readFrameTitleResult(canvasId,nodeId),op=r.operation;if(!op||transmitted.has(op.operationId))return'saved';transmitted.add(op.operationId);const title=op.phase==='undo'?op.title.before:op.title.after;
 const response=await b.fetch(batchPath,{method:'POST',body:JSON.stringify({canvas_id:canvasId,created_by_role:'user',lcos_operation:op,lcos_refs:{},lcos_snapshots:{},actions:[{action:'update',updates:[{id:nodeId,data:{title}}]}]})});await response.json();render();return response.ok?'saved':'blocked';}});
 Object.assign(ownerApi,controls);globalThis.window=b;
 const controller=mod.createNativeFrameTitleEditor({projectId,canvasId,api:ownerApi,nodeId,parentId:null},'原标题',state=>report.states.push(clone(state)));
 // Original independent actor saves a new label after this editor observed the old one.
 const agentWire={canvas_id:canvasId,lcos_operation:{version:1,operationId:randomUUID(),kind:'frame-title',phase:'apply',title:{nodeId,before:'原标题',after:'外部新名',beforeLabel:'原标题'}},actions:[{action:'update',updates:[{id:nodeId,data:{title:'外部新名'}}]}]};
 assert.equal((await facade.handle({method:'POST',url:batchPath,body:agentWire})).status,200);
 controller.change('未保存用户稿');const rejected=await controller.save();assert.equal(rejected.ok,false);assert.equal(rejected.unknown,false);assert.equal(controller.getState().dirty,true);
 report.afterRejected={result:clone(rejected),editor:controller.getState(),live:clone(ownerApi.getNode(nodeId)),storedLabel:(await mod.space(canvasId).nodes.read(nodeId)).record.label,history:clone(api.inspectNativeHistory({canvasId,nodeId}))};
 assert.equal(report.afterRejected.storedLabel,'外部新名');assert.equal(ownerApi.getNode(nodeId).data.title,'未保存用户稿');
 assert.equal(report.transport.at(-1).status,409);const writes=report.transport.filter(r=>r.method==='POST').length;
 const verify=await controller.verify();assert.equal(verify.ok,false);assert.equal(report.transport.filter(r=>r.method==='POST').length,writes);
 controller.cancel();report.afterEsc={editor:controller.getState(),liveTitle:ownerApi.getNode(nodeId).data.title,storedLabel:(await mod.space(canvasId).nodes.read(nodeId)).record.label};
 assert.equal(report.afterEsc.editor.dirty,false);assert.equal(report.afterEsc.editor.value,'未保存用户稿');assert.equal(report.afterEsc.storedLabel,'外部新名');
 controller.change('再次编辑');const again=await controller.save();report.retry={result:clone(again),editor:controller.getState(),lastTransport:report.transport.at(-1)};
 assert.equal(again.ok,false);assert.equal(report.transport.at(-1).status,409);assert.equal((await mod.space(canvasId).nodes.read(nodeId)).record.label,'外部新名');
 assert.equal(report.transport.filter(r=>r.method==='POST').length,writes+1);
 assert.deepEqual(facade.core.repository.get(projectId),domain);for(const f of bytes)assert.ok((await fs.promises.readFile(f.path)).equals(f.bytes));
 report.cases.push('CONFIRMED DEFECT: real 409 preserves user draft but leaves optimistic Flow title and old raw label; current Esc accepts unsaved local title as clean, and a new edit repeats stale CAS rejection with no route to adopt actual external title');
 report.cases.push('Known rejected state has unknown=false so original editor verify does not GET; no automatic resend, stored external name/domain/file bytes preserved');
 report.passed=true;report.productRecoveryPassed=false;controller.dispose();
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await facade?.close();globalThis.fetch=oldFetch;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;for(const k of Object.keys(process.env))if(pattern.test(k))delete process.env[k];for(const[k,v]of env)process.env[k]=v;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,productRecoveryPassed:report.productRecoveryPassed,cases:report.cases,report:path.join(output,'report.json'),error:report.error},null,2));}
