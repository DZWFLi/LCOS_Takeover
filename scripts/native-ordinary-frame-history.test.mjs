import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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


const canvasId='canvas-frame-title-history',projectId='project-frame-title-history';
const nodeId='frame',operationId='frame-title-op',clone=x=>JSON.parse(JSON.stringify(x));
const frame={id:nodeId,type:'group',position:{x:100,y:120},width:420,height:260,measured:{width:420,height:260},
 data:{id:nodeId,title:'未命名框',label:null,lcos_ordinary_frame_title:true,lcos_gui_navigation_pin:false,color_pins:[],createdBy:'client',layoutType:'none'}};
const child={id:'child',type:'text',parentId:nodeId,position:{x:12,y:16},data:{id:'child',text:'原子正文'}};
const beforeNodes=[frame,child],afterNodes=[{...frame,data:{...frame.data,title:'新框'}},child];
const operation={version:1,operationId,kind:'frame-title',phase:'apply',title:{nodeId,before:'未命名框',beforeLabel:null,after:'新框'}};
const fetchCalls=[];let currentVersion=1;
const sandbox={
 console,Date,Promise,Map,Set,WeakMap,Object,Array,Math,Number,String,Boolean,JSON,structuredClone,setTimeout,clearTimeout,
 crypto:{randomUUID:()=>operationId},ef:value=>typeof value==='number'?value:Number(value),F0:value=>value!==null&&typeof value==='object',
 NN:Math.max,MN:Math.min,_c:()=>Date.now(),kN:'Expected a function',qp(){},ee:{PILE:'pile'},xs:()=>{throw Error('Frame title must not remap IDs');}
};
sandbox.window=sandbox;const context=vm.createContext(sandbox);
vm.runInContext(runtimeSource,context);
for(const name of originalNames)sandbox[name]=vm.runInContext('('+original.get(name)+')',context);
sandbox.Ra=vm.runInContext('('+debounceCode+')',context);
const intent=sandbox.__LCOS_NATIVE_INTENT__,ownerApi={getNode:id=>liveNodes.find(n=>n.id===id)};
sandbox.__LCOS_NODE_LAB__={api:ownerApi,canvasId,currentCanvasId:canvasId,projectId};
let liveNodes=clone(beforeNodes),lastChanges=[],batches=[],harness,receiptPorts;
const sourceBackfill=intent.backfillHistoryReceipt;
intent.backfillHistoryReceipt=input=>{receiptPorts=input;return sourceBackfill(input);};
const options={enabled:true,maxHistorySize:30,debounceDelay:1000,canvasId,
 defaultOnNodesChange(changes){lastChanges=changes;intent.tagChanges(changes,id=>liveNodes.find(n=>n.id===id),canvasId);liveNodes=applyOriginalChanges(liveNodes,changes);},
 defaultOnEdgesChange(){},onBatchOperations(nodes,edges){batches.push({nodes,edges});return Promise.resolve({});},
 setNodes:nodes=>{liveNodes=nodes;},setEdges(){}};
options.onBatchOperations.readExternalGeometryReadiness=()=>({canvasId,idle:true});
harness=new HookHarness(sandbox.O8);
sandbox.l={useState:(...a)=>harness.useState(...a),useRef:(...a)=>harness.useRef(...a),useMemo:(...a)=>harness.useMemo(...a),
 useCallback:(...a)=>harness.useCallback(...a),useEffect:(...a)=>harness.useEffect(...a)};
let api=harness.render([liveNodes,[],options]);
ownerApi.backfillNodeReceipt=api.backfillNodeReceipt;
const report={passed:false,scope:'Actual transformed O8/M8, original PN timer, production intent/wire observers and metadata-only receipt setter in isolated VM. Controlled Flow/transport ports; no browser, Core, model, or live scene.',cases:[]};
const pass=name=>report.cases.push(name);
const output=path.resolve('output/普通Frame标题原历史_20261028',new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(output,{recursive:true});
try{
 assert.equal(intent.queueFrameTitleIntent({canvasId,projectId,api:ownerApi,isCurrent:()=>true,operation,beforeNode:liveNodes[0],afterNode:afterNodes[0]}).ok,true);
 const change={type:'replace',id:nodeId,item:afterNodes[0]};intent.tagChanges([change],id=>liveNodes.find(n=>n.id===id),canvasId);
 assert.equal(intent.metadata(change).lcos_operation.kind,'frame-title');
 liveNodes=clone(afterNodes);api=harness.render([liveNodes,[],options]);api.backfillNodeReceipt.prepareCollectionGeometryHistory();
 api=harness.render([liveNodes,[],options]);
 const history=api.inspectNativeHistory({canvasId,nodeId});assert.equal(history.currentIndex,1);assert.equal(history.currentEntry.operations[0].operation.kind,'frame-title');
 pass('One exact apply replace is attached to the real O8 snapshot with nullable original label; no second title history');

 const wire={canvas_id:canvasId,lcos_operation:operation,actions:[{action:'update',updates:[{id:nodeId,type:'group',position:frame.position,measured:frame.measured,data:afterNodes[0].data}]}]};
 const prepared=intent.prepareFrameTitleBatch({canvasId,wireBody:wire,owner:{api:ownerApi,projectId}});
 assert.deepEqual(clone(prepared.actions),[{action:'update',updates:[{id:nodeId,data:{title:'新框'}}]}]);
 const receipt={canvasId,nodeId,operationId,phase:'apply',before:'未命名框',after:'新框',beforeLabel:null,title:'新框',spatialSaved:true,fromVersion:1,toVersion:2};
 intent.observeFrameTitleBatch({canvasId,wireBody:prepared,owner:{api:ownerApi,projectId},ok:true,status:200,payload:{code:0,data:{frame_title_receipt:receipt}}});
 assert.equal(intent.readFrameTitleResult(canvasId,nodeId).ok,true);assert.equal(liveNodes[0].data.label,'新框');
 api=harness.render([liveNodes,[],options]);assert.equal(api.inspectNativeHistory({canvasId,nodeId}).historySize,2);
 pass('Exact real receipt patches only live label through original metadata-only setter; no extra O8 entry, wire contains sole title update');

 // Controlled external adoption uses the real owner receipt setter, without
 // recording another user frame. This models the exact reported interleaving;
 // it is not evidence that the whole Agent/SSE browser path was exercised.
 const moved=liveNodes.map(n=>({...n,position:{x:n.position.x+240,y:n.position.y+160},data:{...n.data,color_pins:['123ABC'],lcos_gui_navigation_pin:true}}));
 receiptPorts.currentNodesRef.current=moved;receiptPorts.setTextReceiptNodes(moved);liveNodes=moved;
 api=harness.render([liveNodes,[],options]);assert.equal(api.inspectNativeHistory({canvasId,nodeId}).historySize,2);
 const geometry=clone(liveNodes.map(n=>[n.id,n.position,n.parentId,n.data.color_pins,n.data.lcos_gui_navigation_pin]));
 api.undo();api=harness.render([liveNodes,[],options]);
 assert.equal(liveNodes[0].data.title,'未命名框');assert.equal(liveNodes[0].data.label,null);
 assert.deepEqual(clone(liveNodes.map(n=>[n.id,n.position,n.parentId,n.data.color_pins,n.data.lcos_gui_navigation_pin])),geometry);
 assert.equal(liveNodes[1].data.text,'原子正文');
 assert.equal(batches.at(-1).nodes.length,1);assert.equal(batches.at(-1).nodes[0].lcos_operation.phase,'undo');
 assert.equal(intent.partitionOperations(batches.at(-1).nodes)[0].lcos_operation.kind,'frame-title');
 await new Promise(resolve=>setTimeout(resolve,5));
 api.redo();api=harness.render([liveNodes,[],options]);
 assert.equal(liveNodes[0].data.title,'新框');assert.deepEqual(clone(liveNodes.map(n=>[n.id,n.position,n.parentId,n.data.color_pins,n.data.lcos_gui_navigation_pin])),geometry);
 assert.equal(batches.at(-1).nodes[0].lcos_operation.phase,'redo');
 pass('Actual original O8 Undo/Redo overlay title/null-label only on current nodes; externally adopted geometry, GUI flags, parent and child body survive; M8 persists same pair without ID remap');

 const beforeReplay=clone(history);
 assert.throws(()=>intent.normalizeFrameTitleHistoryReplay(canvasId,{lcos_history_operations:[{nodeId,lcos_operation:operation}]},'undo',
   liveNodes.map(n=>n.id===nodeId?{...n,data:{...n.data,lcos_ref:undefined}}:n),[],{nodes:beforeNodes,edges:[]}));
 assert.deepEqual(clone(history),beforeReplay);
 pass('Reserved own undefined refuses ordinary fallback; old snapshots remain unmodified');
 const q={operationType:'update',id:nodeId,timestamp:1,data:{title:'新框'},lcos_operation:operation},other={operationType:'update',id:nodeId,timestamp:2,data:{color_pins:['ABCDEF']}};
 const coalesced=intent.coalesceExcerptQueue([q,other],items=>items);
 assert.equal(coalesced.length,2);intent.holdExcerptQueue([q]);assert.equal(intent.excerptQueueDisposition([q]),'hold');
 assert.equal(intent.coalesceExcerptQueue([q,other],items=>items).length,2);assert.equal(intent.excerptQueueDisposition([other]),'hold');
 pass('Original queue helper isolates title from same-ID other edits; unknown hold survives coalescing and never authorizes a replay');

 const originalOwner=sandbox.__LCOS_NODE_LAB__.api;sandbox.__LCOS_NODE_LAB__.api={};
 assert.throws(()=>intent.prepareFrameTitleBatch({canvasId,wireBody:{...wire,lcos_operation:{...operation,phase:'redo'}},owner:{api:originalOwner,projectId}}));
 sandbox.__LCOS_NODE_LAB__.api=originalOwner;
 pass('Late old API request refuses before transport and cannot acquire a different current scene');
 const bridgeSource=fs.readFileSync(new URL('../lab/startup-node-bridge.js',import.meta.url),'utf8');
 const bridgeProgram=parse(bridgeSource,'startup-node-bridge.js').program;
 const bridgeCode=code(bridgeSource,binding(bridgeProgram,'createFrameTitleControls'));
 const nonemptyCode=code(bridgeSource,binding(bridgeProgram,'nonEmptyString'));
 async function controlsCase({ack=true,failBackfill=false,serialOwner=false,disposeBeforeVerify=false,newerAfterAck=false}={}) {
   const cid=canvasId+'-controls-'+report.cases.length,pid=projectId;
   let nodes=clone(beforeNodes),localApi,localHarness,writes=0,reads=0,backfills=0,flushes=0,serial=1,lifetime=1;
   const b={console,Date,Promise,Map,Set,WeakMap,Object,Array,Math,Number,String,Boolean,JSON,structuredClone,setTimeout,clearTimeout,
     crypto:{randomUUID:()=>cid+'-op'},ef:sandbox.ef,F0:sandbox.F0,NN:Math.max,MN:Math.min,_c:()=>Date.now(),kN:'Expected a function',qp(){},ee:{PILE:'pile'},xs:sandbox.xs};
   b.window=b;const cx=vm.createContext(b);vm.runInContext(runtimeSource,cx);
   for(const name of originalNames)b[name]=vm.runInContext('('+original.get(name)+')',cx);
   b.Ra=vm.runInContext('('+debounceCode+')',cx);
   b.nonEmptyString=vm.runInContext('('+nonemptyCode+')',cx);
   const ni=b.__LCOS_NATIVE_INTENT__,oa={getNode:id=>nodes.find(n=>n.id===id)};
   b.__LCOS_NODE_LAB__={api:oa,canvasId:cid,currentCanvasId:cid,projectId:pid};
   const opts={...options,canvasId:cid,
     defaultOnNodesChange(changes){ni.tagChanges(changes,id=>nodes.find(n=>n.id===id),cid);nodes=applyOriginalChanges(nodes,changes);},
     setNodes(next){nodes=next;},onBatchOperations(){return Promise.resolve({});}};
   opts.onBatchOperations.readExternalGeometryReadiness=()=>({canvasId:cid,idle:true});
   localHarness=new HookHarness(b.O8);
   b.l={useState:(...a)=>localHarness.useState(...a),useRef:(...a)=>localHarness.useRef(...a),useMemo:(...a)=>localHarness.useMemo(...a),
     useCallback:(...a)=>localHarness.useCallback(...a),useEffect:(...a)=>localHarness.useEffect(...a)};
   const render=()=>{localApi=localHarness.render([nodes,[],opts]);return localApi;};render();
   oa.backfillNodeReceipt=input=>{backfills++;if(failBackfill&&backfills===1)return{ok:false,reason:'controlled-original-port-unavailable'};return localApi.backfillNodeReceipt(input);};
   const flow={getNodes:()=>nodes,updateNodeData(id,data){
     const old=nodes.find(n=>n.id===id),changes=[{type:'replace',id,item:{...old,data:{...old.data,...data}}}];
     opts.defaultOnNodesChange(changes);render();
   }};
   const controls=vm.runInContext('('+bridgeCode+')',cx)({api:flow,ownerApi:oa,getHost:()=>b.__LCOS_NODE_LAB__,readOriginalNodes:()=>nodes,
     prepareHistory(){const result=localApi.backfillNodeReceipt.prepareCollectionGeometryHistory();render();return result;},
     inspectHistory:query=>localApi.inspectNativeHistory(query),
     async flushCanvas(){flushes++;if(flushes===1)return'saved';
       const op=ni.readFrameTitleResult(cid,nodeId).operation;
       const wire=ni.prepareFrameTitleBatch({canvasId:cid,wireBody:{canvas_id:cid,lcos_operation:op,actions:[{action:'update',updates:[{id:nodeId,data:{title:'新框'}}]}]},owner:{api:oa,projectId:pid}});
       writes++;const receipt={canvasId:cid,nodeId,operationId:op.operationId,phase:'apply',before:'未命名框',after:'新框',beforeLabel:null,title:'新框',spatialSaved:true,fromVersion:1,toVersion:2};
       ni.observeFrameTitleBatch({canvasId:cid,wireBody:wire,owner:{api:oa,projectId:pid},ok:ack,status:ack?200:0,
         transportFailure:!ack,payload:ack?{code:0,data:{frame_title_receipt:receipt}}:undefined});render();return ack?'saved':'blocked';},
     async request(url,options){reads++;assert.equal(options.method,'GET');assert.match(url,/\/api\/canvas\/v1\/canvases\//);
       const dto=nodes.map(n=>n.id===nodeId?{...n,data:{...n.data,title:newerAfterAck?'后来名称':'新框',label:newerAfterAck?'后来名称':'新框'}}:n);
       return{ok:true,json:async()=>({code:0,data:{id:cid,nodes:dto}})};}});
   const saveSerial=serial,saveLifetime=lifetime;
   const owner=()=>lifetime===saveLifetime&&(!serialOwner||serial===saveSerial);
   const result=await controls.commitFrameTitle({nodeId,title:'新框',expectedTitle:'未命名框',expectedLabel:null},{isCurrent:owner});
   assert.equal(writes,1);assert.equal(result.ok,ack&&!failBackfill);
   if(failBackfill||!ack){assert.equal(result.unknown,true);assert.equal(nodes[0].data.label,null);}
   serial++;if(disposeBeforeVerify)lifetime++;
   const verified=await controls.verifyFrameTitle({nodeId},{isCurrent:()=>lifetime===saveLifetime});
   assert.equal(writes,1,'verify never resubmits the title mutation');
   const knownRestored=ack&&failBackfill&&!serialOwner&&!disposeBeforeVerify&&!newerAfterAck;
   if(knownRestored){assert.equal(verified.ok,true);assert.equal(reads,1);assert.equal(backfills,2);assert.equal(nodes[0].data.label,'新框');
     assert.equal(localApi.inspectNativeHistory({canvasId:cid,nodeId}).historySize,2);}
   if(!ack){assert.equal(verified.ok,false);assert.equal(verified.unknown,true);assert.equal(verified.currentTitle,'新框');assert.equal(reads,1);assert.equal(backfills,0);}
   if(serialOwner||disposeBeforeVerify){assert.equal(verified.ok,false);assert.equal(verified.unknown,true);assert.equal(reads,0);assert.equal(backfills,1);}
   if(newerAfterAck){assert.equal(verified.ok,false);assert.equal(verified.unknown,false);assert.equal(verified.currentTitle,'后来名称');assert.equal(backfills,1);}
   return {result:clone(result),verified:clone(verified),writes,reads,backfills,historySize:localApi.inspectNativeHistory({canvasId:cid,nodeId}).historySize};
 }
 report.controls=[];
 report.controls.push(await controlsCase({ack:true,failBackfill:true}));
 pass('Actual bridge + original O8: stable controller owner survives UI serial change; real ACK with first metadata backfill failure is recovered by one verify GET and original receipt, without save replay or new history');
 report.controls.push(await controlsCase({ack:false}));
 pass('Actual bridge: no ACK plus exact matching GET title remains unknown, keeps raw-label draft state and never resubmits');
 report.controls.push(await controlsCase({ack:true,failBackfill:true,serialOwner:true}));
 pass('Serial-bound authorization counterexample stays invalid: verify cannot borrow a new callback to revive an expired save owner');
 report.controls.push(await controlsCase({ack:true,failBackfill:true,disposeBeforeVerify:true}));
 pass('Disposed controller owner denies late verify before GET and preserves original unknown attempt');
 report.controls.push(await controlsCase({ack:true,failBackfill:true,newerAfterAck:true}));
 pass('Valid earlier ACK plus later renamed GET refuses old metadata backfill, exposes current name and preserves draft without replay');

 report.passed=true;
}catch(error){report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,cases:report.cases,error:report.error,report:path.join(output,'report.json')},null,2));
