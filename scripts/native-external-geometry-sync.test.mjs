import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createNativeCanvasGeometrySync, canvasGeometry, readNativeCanvasSyncStream } from '../lab/native-canvas-sync.js';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';
const copy = value => JSON.parse(JSON.stringify(value));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test) { const deadline = Date.now() + 2000; while (!test()) { if (Date.now() > deadline) throw new Error('Test did not settle.'); await sleep(3); } }
const report = { passed: false, checks: [], networkRequests: 0, modelCalls: 0 };
const output = path.resolve('output/原画布外部工具实时接入_20261023'); fs.mkdirSync(output, { recursive: true });
const node = (x = 1) => ({ id: 'native-text', type: 'text', position: { x, y: 2 }, width: 300, height: 180,
  measured: { width: 300, height: 180 }, data: { id: 'native-text', text: 'Original user body', lcos_gui_emphasis: false, lcos_ref: { entityId: 'artifact-original' } } });
const response = body => ({ ok: true, json: async () => body });
const update = (from, to, before, after) => ({ type: 'update', data: { fromVersion: from, toVersion: to,
  deltas: [{ type: 'REPLACE_NODE', prev: before, next: after }], pendingEffects: { mutatedNodes: [after], deletedNodeIds: [], contentEditedNodeIds: [], deferredFitFrameIds: [] } } });
function controllerHarness() {
  let nodes = [node()], remote = { id: 'canvas-original', project_id: 'project-original', version: 1, nodes: copy(nodes) }, blocked = false, nextGet;
  const listeners = new Set(), ownerApi = {}, host = { projectId: 'project-original', canvasId: remote.id, api: ownerApi };
  const calls = { get: 0, patches: 0, histories: 0, methods: [], states: [], signals: [] };
  const sync = createNativeCanvasGeometrySync({ canvasId: remote.id, ownerApi, getHost: () => host,
    readNodes: () => nodes, readEdges: () => [], readBusy: () => blocked, normalizeNodes: copy,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, delayMs: 3, reconnectMs: 10000,
    request: async (url, options) => { calls.methods.push(options.method ?? 'GET'); calls.signals.push(options.signal);
      if (url.endsWith('/sync/stream')) return { ok: true };
      calls.get++; if (nextGet) { const read = nextGet; nextGet = undefined; await read(); }
      return response({ code: 0, data: copy(remote) }); },
    readStream: (_response, _accept, signal) => new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })),
    backfillReceipt: receipt => { calls.patches++; assert.equal(receipt.receiptKind, 'external-geometry'); assert.deepEqual(receipt.expectedNodes, nodes);
      if (receipt.patches.length) calls.histories++;
      nodes = nodes.map(n => { const patch = receipt.patches.find(p => p.id === n.id); return patch ? { ...n, position: copy(patch.after.position), width: patch.after.width, height: patch.after.height, measured: { width: patch.after.width, height: patch.after.height },
        ...(patch.emphasis || patch.nativeGui ? { data: { ...n.data, ...(patch.emphasis?{lcos_gui_emphasis:patch.emphasis.after}:{}),
          ...Object.fromEntries(Object.entries(patch.nativeGui??{}).map(([field,value])=>[field,copy(value.after)])) } } : {}) } : n; });
      return { ok: true }; }, onState: state => calls.states.push(state),
  });
  return { sync, calls, get nodes() { return nodes; }, set nodes(value) { nodes = value; }, get remote() { return remote; }, set remote(value) { remote = value; },
    setBusy(value) { blocked = value; for (const listener of [...listeners]) listener(); },
    adoptProject(value) { host.projectId = value; for (const listener of [...listeners]) listener(); },
    gateGet(fn) { nextGet = fn; }, switchOwner() { host.api = {}; for (const listener of [...listeners]) listener(); } };
}
try {
 const h = controllerHarness(); h.sync.accept({ type: 'snapshot', data: { version: 1 } }); await until(() => h.sync.inspect().appliedVersion === 1);
 assert.equal(h.calls.get, 1); assert.equal(h.calls.histories, 0);
 const before = copy(h.nodes[0]), after = { ...before, position: { x: 41, y: 22 } };
 h.remote = { ...h.remote, version: 2, nodes: [after] }; h.sync.accept(update(1, 2, before, after)); await until(() => h.sync.inspect().appliedVersion === 2);
 assert.deepEqual(h.nodes[0].position, after.position); assert.equal(h.calls.get, 1); assert.equal(h.calls.histories, 1); assert.equal(h.nodes[0].data.text, before.data.text);
 h.sync.accept(update(1, 2, before, after)); await sleep(15); assert.equal(h.calls.histories, 1);
 report.checks.push('Original snapshot establishes version through canonical GET; contiguous geometry applies once, duplicate/old event does nothing, no content or POST is produced');
 for (const reason of ['pointer/drag', 'text edit', 'original save queue']) {
  h.setBusy(true); const previous = copy(h.nodes[0]), next = { ...previous, position: { x: previous.position.x + 20, y: previous.position.y } }, from = h.remote.version;
  h.remote = { ...h.remote, version: from + 1, nodes: [next] }; h.sync.accept(update(from, from + 1, previous, next)); await sleep(20);
  assert.deepEqual(h.nodes[0], previous, reason + ' must not be overwritten'); h.setBusy(false); await until(() => h.sync.inspect().appliedVersion === from + 1);
  assert.deepEqual(h.nodes[0].position, next.position);
 }
 report.checks.push('Active drag/pointer, text edit and unconfirmed original queue defer geometry and catch up when the same owner becomes idle');
 let release; h.gateGet(() => new Promise(resolve => { release = resolve; })); const old = copy(h.nodes[0]), next = { ...old, position: { x: 190, y: 70 } };
 h.remote = { ...h.remote, version: 9, nodes: [next] }; h.sync.accept(update(8, 9, old, next)); await until(() => !!release);
 h.nodes = [{ ...h.nodes[0], data: { ...h.nodes[0].data, text: 'A newer local body' } }]; release(); await until(() => h.sync.inspect().appliedVersion === 9);
 assert.equal(h.nodes[0].data.text, 'A newer local body'); assert.deepEqual(h.nodes[0].position, next.position); assert.ok(h.calls.get >= 3);
 report.checks.push('A gap reads current original Canvas; a local edit during that GET survives and is caught up only after a fresh safe read');
 h.remote = { ...h.remote, version: 10, nodes: [...h.remote.nodes, { ...node(), id: 'unknown-node' }] };
 h.sync.accept({ type: 'update', data: { fromVersion: 9, toVersion: 10, deltas: [{ type: 'INSERT_NODE', node: h.remote.nodes[1] }], pendingEffects: {} } });
 await until(() => h.sync.inspect().appliedVersion === 10); assert.equal(h.nodes.length, 1); assert.equal(h.sync.inspect().unsupportedUpdates, 1);
 report.checks.push('Unsupported structural updates are recorded and refresh only existing geometry; no new node/body is fabricated');
 let releaseOld; h.gateGet(() => new Promise(resolve => { releaseOld = resolve; })); h.remote = { ...h.remote, version: 13, nodes: [{ ...h.remote.nodes[0], position: { x: 999, y: 999 } }] };
 h.sync.accept({ type: 'snapshot', data: { version: 13 } }); await until(() => !!releaseOld); const beforeSwitch = copy(h.nodes); h.switchOwner(); releaseOld(); await sleep(20);
 assert.deepEqual(h.nodes, beforeSwitch); assert.equal(h.sync.inspect().active, false); assert.ok(h.calls.signals.every(signal => signal.aborted)); assert.ok(h.calls.methods.every(method => method === 'GET'));
 report.checks.push('Canvas/API switch aborts its stream/read lifetime; late replies do not touch the new owner');
 const encoder = new TextEncoder(), events = [];
 await readNativeCanvasSyncStream(new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('event: snapshot\ndata: {"version":4}\n\n')); controller.close(); } })), event => events.push(event), new AbortController().signal);
 assert.deepEqual(events, [{ type: 'snapshot', data: { version: 4 } }]);
 const chunks = ['event: snapshot\r', '\ndata: {"version":5}\r', '\n\r', '\n'], splitEvents = [];
 await readNativeCanvasSyncStream(new Response(new ReadableStream({ start(controller) { for(const chunk of chunks)controller.enqueue(encoder.encode(chunk)); controller.close(); } })), event => splitEvents.push(event), new AbortController().signal);
 assert.deepEqual(splitEvents, [{ type: 'snapshot', data: { version: 5 } }]);
 const adoption = controllerHarness(); adoption.adoptProject(undefined); await sleep(12); assert.equal(adoption.sync.inspect().active, true); adoption.adoptProject('project-original'); adoption.sync.accept({type:'snapshot',data:{version:1}}); await until(()=>adoption.sync.inspect().appliedVersion===1); adoption.sync.dispose();
 report.checks.push('Original project adoption survives early store notifications, and split CRLF frames retain the actual snapshot event');
 report.checks.push('Real event/data SSE framing reaches the original CanvasSyncEvent consumer');

 const emphasis = controllerHarness(); emphasis.sync.accept({type:'snapshot',data:{version:1}}); await until(()=>emphasis.sync.inspect().appliedVersion===1);
 for(const value of [true,false]) {
  const previous=copy(emphasis.nodes[0]), next={...previous,data:{...previous.data,lcos_gui_emphasis:value}}, from=emphasis.remote.version;
  emphasis.setBusy(true); emphasis.remote={...emphasis.remote,version:from+1,nodes:[next]}; emphasis.sync.accept(update(from,from+1,previous,next));
  await sleep(20); assert.deepEqual(emphasis.nodes[0],previous); emphasis.setBusy(false); await until(()=>emphasis.sync.inspect().appliedVersion===from+1);
  assert.equal(emphasis.nodes[0].data.lcos_gui_emphasis,value); assert.equal(emphasis.nodes[0].data.text,previous.data.text); assert.deepEqual(emphasis.nodes[0].position,previous.position);
 }
 assert.equal(emphasis.calls.get,1); assert.equal(emphasis.calls.histories,2);
 let releaseEmphasis; emphasis.gateGet(()=>new Promise(resolve=>releaseEmphasis=resolve));
 emphasis.remote={...emphasis.remote,version:8,nodes:[{...emphasis.remote.nodes[0],data:{...emphasis.remote.nodes[0].data,text:'Remote content must not cross',lcos_gui_emphasis:true}}]};
 emphasis.sync.accept({type:'snapshot',data:{version:8}}); await until(()=>!!releaseEmphasis);
 emphasis.nodes=[{...emphasis.nodes[0],data:{...emphasis.nodes[0].data,text:'New local draft stays'}}]; releaseEmphasis();
 await until(()=>emphasis.sync.inspect().appliedVersion===8); assert.equal(emphasis.nodes[0].data.lcos_gui_emphasis,true); assert.equal(emphasis.nodes[0].data.text,'New local draft stays');
 let releaseLate; emphasis.gateGet(()=>new Promise(resolve=>releaseLate=resolve)); emphasis.remote={...emphasis.remote,version:9,nodes:[{...emphasis.remote.nodes[0],data:{...emphasis.remote.nodes[0].data,lcos_gui_emphasis:false}}]};
 emphasis.sync.accept({type:'snapshot',data:{version:9}}); await until(()=>!!releaseLate); const ownedBefore=copy(emphasis.nodes); emphasis.adoptProject('another-project'); releaseLate(); await sleep(20);
 assert.deepEqual(emphasis.nodes,ownedBefore); assert.equal(emphasis.sync.inspect().active,false); assert.ok(emphasis.calls.methods.every(method=>method==='GET'));
 report.checks.push('Same original sync applies saved emphasis true/false without reload or receiving POST; busy edit defers, GET-gap preserves local text, and old-project reply cannot update new owner');
 const binding=controllerHarness();binding.sync.accept({type:'snapshot',data:{version:1}});await until(()=>binding.sync.inspect().appliedVersion===1);
 const boundBefore=copy(binding.nodes);binding.remote={...binding.remote,version:2,nodes:[{...binding.remote.nodes[0],data:{...binding.remote.nodes[0].data,lcos_gui_emphasis:true,lcos_ref:{entityId:'another-artifact'}}}]};
 binding.sync.accept({type:'snapshot',data:{version:2}});await until(()=>binding.calls.states.some(state=>state.reason?.includes('different original node binding')));assert.deepEqual(binding.nodes,boundBefore);assert.equal(binding.sync.inspect().appliedVersion,1);
 binding.remote={...binding.remote,version:3,nodes:[{...boundBefore[0],data:{...boundBefore[0].data,lcos_gui_emphasis:true,lcos_ref:{...boundBefore[0].data.lcos_ref,revisionId:'new-revision'}}}]};
 binding.sync.accept({type:'snapshot',data:{version:3}});await until(()=>binding.sync.inspect().appliedVersion===3);
 assert.equal(binding.nodes[0].data.lcos_gui_emphasis,true);assert.deepEqual(binding.nodes[0].data.lcos_ref,boundBefore[0].data.lcos_ref);binding.sync.dispose();
 for(const field of ['lcos_execution_ref','lcos_member_ref']){
  const typed=controllerHarness();typed.nodes=[{...typed.nodes[0],data:{...typed.nodes[0].data,[field]:{projectId:'project-original',entityType:field==='lcos_execution_ref'?'run':'scope',entityId:'owner-a'}}}];
  typed.remote={...typed.remote,nodes:copy(typed.nodes)};typed.sync.accept({type:'snapshot',data:{version:1}});await until(()=>typed.sync.inspect().appliedVersion===1);
  const prior=copy(typed.nodes);typed.remote={...typed.remote,version:2,nodes:[{...prior[0],data:{...prior[0].data,lcos_gui_emphasis:true,[field]:{...prior[0].data[field],entityId:'owner-b'}}}]};
  typed.sync.accept({type:'snapshot',data:{version:2}});await until(()=>typed.calls.states.some(state=>state.reason?.includes('different original node binding')));assert.deepEqual(typed.nodes,prior);typed.sync.dispose();
 }
 report.checks.push('Actual canonical snapshot defers same-node-ID rebound A→B without applying B emphasis to A; same artifact/view with a newer revision still receives GUI emphasis and keeps local reference/draft');

 const ordinary=controllerHarness();ordinary.nodes=ordinary.nodes.map(n=>{const next=copy(n);delete next.data.lcos_ref;next.data.color_pins=[];next.data.lcos_gui_navigation_pin=false;return next;});ordinary.remote={...ordinary.remote,nodes:copy(ordinary.nodes)};
 ordinary.sync.accept({type:'snapshot',data:{version:1}});await until(()=>ordinary.sync.inspect().appliedVersion===1);
 for(const patch of [{lcos_gui_navigation_pin:true},{color_pins:['4EA8FF','F0606B']},{lcos_gui_navigation_pin:false},{color_pins:[]}]){
   const prior=copy(ordinary.nodes[0]),next={...prior,data:{...prior.data,...patch}},from=ordinary.remote.version;
   ordinary.setBusy(true);ordinary.remote={...ordinary.remote,version:from+1,nodes:[next]};ordinary.sync.accept(update(from,from+1,prior,next));await sleep(12);assert.deepEqual(ordinary.nodes[0],prior);
   ordinary.setBusy(false);await until(()=>ordinary.sync.inspect().appliedVersion===from+1);for(const [field,value]of Object.entries(patch))assert.deepEqual(ordinary.nodes[0].data[field],value);
   assert.equal(ordinary.nodes[0].data.text,prior.data.text);assert.deepEqual(ordinary.nodes[0].position,prior.position);
 }
 assert.equal(ordinary.calls.get,1,'Connected GUI-only deltas use the original receipt without reloading');assert.equal(ordinary.calls.histories,4);
 let releaseGui;ordinary.gateGet(()=>new Promise(resolve=>releaseGui=resolve));ordinary.remote={...ordinary.remote,version:10,nodes:[{...ordinary.remote.nodes[0],data:{...ordinary.remote.nodes[0].data,text:'Remote body never copied',color_pins:['A55CF0'],lcos_gui_navigation_pin:true}}]};ordinary.sync.accept({type:'snapshot',data:{version:10}});await until(()=>!!releaseGui);ordinary.nodes[0]={...ordinary.nodes[0],data:{...ordinary.nodes[0].data,text:'Latest original local draft'}};releaseGui();await until(()=>ordinary.sync.inspect().appliedVersion===10);assert.equal(ordinary.nodes[0].data.text,'Latest original local draft');assert.deepEqual(ordinary.nodes[0].data.color_pins,['A55CF0']);assert.equal(ordinary.nodes[0].data.lcos_gui_navigation_pin,true);
 const guiBefore=copy(ordinary.nodes);ordinary.remote={...ordinary.remote,version:11,nodes:[{...ordinary.remote.nodes[0],data:{...ordinary.remote.nodes[0].data,color_pins:['A55CF0','a55cf0']}}]};ordinary.sync.accept({type:'snapshot',data:{version:11}});await until(()=>ordinary.calls.states.some(state=>state.reason?.includes('Invalid original node GUI')));assert.deepEqual(ordinary.nodes,guiBefore);assert.equal(ordinary.sync.inspect().appliedVersion,10);
 ordinary.remote={...ordinary.remote,version:12,nodes:[{...guiBefore[0],data:{...guiBefore[0].data,lcos_method_member_ref:{projectId:'project-original',entityId:'new-owner'},color_pins:[]}}]};ordinary.sync.accept({type:'snapshot',data:{version:12}});await until(()=>ordinary.calls.states.some(state=>state.reason?.includes('different original node binding')));assert.deepEqual(ordinary.nodes,guiBefore);
 assert.ok(ordinary.calls.methods.every(method=>method==='GET'));ordinary.switchOwner();ordinary.sync.dispose();
 report.checks.push('Actual sync controller receives ordinary nav true/false and six-hex color arrays through original history receipts without receiving POST/reload; busy/draft survive, malformed duplicate colors and new method ownership are deferred.');

 // Execute the installed, transformed O8, its real equality/diff/serializer and vendor debounce.
 const assets = path.resolve('reference/tapnow-installed/resources/web/assets'), file = 'page-Da_DfwiK.js', raw = fs.readFileSync(path.join(assets, file), 'utf8');
 const transformed = transformHistoryIntentScript(file, transformSurfaceDockScript(file, transformNodeBridgeScript(file, transformCutScript(file, raw))));
 assert.equal(transformHistoryIntentScript(file, transformed), transformed);
 const program = parseOriginalDonorScript(transformed, file), code = (source, ast, name) => {
  for (const row of ast.body) { if (row.type === 'FunctionDeclaration' && row.id.name === name) return source.slice(row.start, row.end);
    for (const item of row.declarations ?? []) if (item.id?.name === name) return source.slice(item.init.start, item.init.end); }
  throw new Error('Original declaration missing: ' + name);
 };
 const unlimited = fs.readFileSync(path.join(assets, 'UnlimitedModeToggle-D4wysAbz.js'), 'utf8'), unlimitedProgram = parseOriginalDonorScript(unlimited, 'UnlimitedModeToggle-D4wysAbz.js');
 const ctx = { assert, console, Date, Promise, Map, Set, WeakMap, Object, Array, Math, Number, String, Boolean, JSON, structuredClone, setTimeout, clearTimeout,
  crypto: { randomUUID: () => 'geometry-test-id' }, ee: { IMAGE: 'image', VIDEO: 'video', PILE: 'pile' },
  ef: value => Number(value), F0: value => value !== null && typeof value === 'object', NN: Math.max, MN: Math.min, _c: () => Date.now(), kN: 'Expected a function', qp() {} };
 ctx.window = ctx; const sandbox = vm.createContext(ctx);
 vm.runInContext(fs.readFileSync('lab/startup-history-intent.js', 'utf8'), sandbox);
 for (const name of ['IC', 'TC', 'kC', 'l0', 'P8', 'M8', 'L8', 'R8', 'j8', 'A8', 'D8', 'k8', 'PC']) ctx[name] = vm.runInContext('(' + code(transformed, program, name) + ')', sandbox);
 ctx.Ra = vm.runInContext('(' + code(unlimited, unlimitedProgram, 'PN') + ')', sandbox); ctx.O8 = vm.runInContext('(' + code(transformed, program, 'O8') + ')', sandbox);
 const harnessSource = fs.readFileSync('scripts/native-history-create-measurement-replay.test.mjs', 'utf8');
 vm.runInContext(harnessSource.slice(harnessSource.indexOf('function sameDeps('), harnessSource.indexOf('function applyOriginalNodeChanges(')) + '\nglobalThis.HookHarness=HookHarness;', sandbox);
 let nodes = [node()], edges = [], queueIdle = true, batches = [], hooks;
 const setNodes = next => { nodes = next; hooks.setArgs([nodes, edges, options]); };
 const batch = (nodeOperations, edgeOperations) => { batches.push(copy({ nodeOperations, edgeOperations })); return Promise.resolve({}); };
 batch.readExternalGeometryReadiness = () => ({ canvasId: 'canvas-original', idle: queueIdle });
 batch.acknowledgeExternalGeometry = input => { assert.equal(input.canvasId,'canvas-original'); assert.deepEqual(copy(input.nodeIds),['native-text']); return queueIdle; };
 const options = { enabled: true, debounceDelay: 1, maxHistorySize: 20, canvasId: 'canvas-original', setNodes,
  defaultOnNodesChange(changes) { setNodes(nodes.map(n => { let next = n; for (const change of changes.filter(c => c.id === n.id)) {
   if (change.position) next = { ...next, position: copy(change.position) }; if (change.type === 'replace') next = copy(change.item);
   if (change.dimensions) next = { ...next, ...change.dimensions, measured: copy(change.dimensions) }; } return next; })); },
  defaultOnEdgesChange() {}, onBatchOperations: batch };
 hooks = new ctx.HookHarness(ctx.O8); ctx.l = Object.fromEntries(['useState', 'useRef', 'useMemo', 'useCallback', 'useEffect'].map(name => [name, (...args) => hooks[name](...args)]));
 ctx.__LCOS_NODE_LAB__ = { canvasId: 'canvas-original', projectId: 'project-original', api: {} };
 let api = hooks.render([nodes, edges, options]);
 nodes = [{ ...nodes[0], position: { x: 11, y: 2 } }]; api = hooks.render([nodes, edges, options]); await sleep(8); api = hooks.render([nodes, edges, options]);
 const historyBefore = copy(api.inspectNativeHistory({ canvasId: 'canvas-original', nodeId: 'native-text' })); assert.equal(historyBefore.currentIndex, 1);
 const from = copy(nodes[0]), to = { ...from, position: { x: 81, y: 42 } };
 const receipt = { receiptKind: 'external-geometry', projectId: 'project-original', canvasId: 'canvas-original', fromVersion: 1, toVersion: 2,
  patches: [{ id: from.id, before: canvasGeometry(from), after: canvasGeometry(to) }], expectedNodes: nodes, expectedEdges: edges };
 queueIdle = false; assert.equal(api.backfillNodeReceipt(receipt).ok, false); assert.deepEqual(copy(nodes[0].position), from.position); queueIdle = true;
 assert.equal(api.backfillNodeReceipt(receipt).ok, true); api = hooks.render([nodes, edges, options]); await sleep(8); api = hooks.render([nodes, edges, options]);
 assert.equal(batches.length, 0, 'Receiving external geometry never replays a server save');
 const afterHistory = copy(api.inspectNativeHistory({ canvasId: 'canvas-original', nodeId: from.id })); assert.equal(afterHistory.currentIndex, 2); assert.equal(afterHistory.historySize, 3); assert.deepEqual(copy(nodes[0].position), to.position);
 api.undo(); api = hooks.render([nodes, edges, options]); await sleep(8); api = hooks.render([nodes, edges, options]); assert.deepEqual(copy(nodes[0].position), from.position); assert.equal(batches.length, 1);
 api.redo(); api = hooks.render([nodes, edges, options]); await sleep(8); api = hooks.render([nodes, edges, options]); assert.deepEqual(copy(nodes[0].position), to.position); assert.equal(batches.length, 2);
 assert.equal(nodes[0].data.text, 'Original user body');
 report.checks.push('Actual installed O8 appends one external move without a second POST, keeps earlier user history, and its original Undo/Redo emit the ordinary native geometry operations');
 const receiveEmphasis=value=>{const current=nodes[0];return api.backfillNodeReceipt({receiptKind:'external-geometry',projectId:'project-original',canvasId:'canvas-original',fromVersion:2,toVersion:3,
  patches:[{id:current.id,before:canvasGeometry(current),after:canvasGeometry(current),emphasis:{before:current.data.lcos_gui_emphasis===true,after:value}}],expectedNodes:nodes,expectedEdges:edges});};
 const settle=async()=>{api=hooks.render([nodes,edges,options]);await sleep(8);api=hooks.render([nodes,edges,options]);};
 const batchesBefore=batches.length, hBefore=api.inspectNativeHistory({canvasId:'canvas-original',nodeId:from.id}).historySize;
 assert.equal(receiveEmphasis(true).ok,true); await settle(); assert.equal(nodes[0].data.lcos_gui_emphasis,true); assert.equal(batches.length,batchesBefore);
 assert.equal(api.inspectNativeHistory({canvasId:'canvas-original',nodeId:from.id}).historySize,hBefore+1);
 api.undo();await settle();assert.equal(nodes[0].data.lcos_gui_emphasis,false);assert.equal(batches.length,batchesBefore+1); assert.match(JSON.stringify(batches.at(-1)),/"lcos_gui_emphasis":false/);
 api.redo();await settle();assert.equal(nodes[0].data.lcos_gui_emphasis,true);assert.equal(batches.length,batchesBefore+2);assert.match(JSON.stringify(batches.at(-1)),/"lcos_gui_emphasis":true/);
 assert.equal(receiveEmphasis(false).ok,true);await settle();assert.equal(nodes[0].data.lcos_gui_emphasis,false);assert.equal(batches.length,batchesBefore+2);
 assert.equal(nodes[0].data.text,'Original user body'); assert.deepEqual(copy(nodes[0].position),to.position);
 report.checks.push('Actual original O8 receives emphasis as one ordinary history entry with no replay save; original Undo/Redo serialize false/true, external false keeps body/geometry and earlier user history');
 // A fresh actual O8 owner for a truly unbound ordinary node; the typed owner
 // above must reject a native-GUI patch instead of acquiring parallel markers.
 const typedGui=api.backfillNodeReceipt({receiptKind:'external-geometry',projectId:'project-original',canvasId:'canvas-original',fromVersion:3,toVersion:4,
   patches:[{id:nodes[0].id,before:canvasGeometry(nodes[0]),after:canvasGeometry(nodes[0]),nativeGui:{lcos_gui_navigation_pin:{before:false,after:true}}}],expectedNodes:nodes,expectedEdges:edges});assert.equal(typedGui.ok,false);assert.equal(typedGui.reason,'EXTERNAL_NATIVE_GUI_OWNER_MISMATCH');
 nodes=[{...node(),data:{id:'native-text',text:'Original ordinary body',color_pins:[],lcos_gui_navigation_pin:false}}];edges=[];batches=[];hooks=new ctx.HookHarness(ctx.O8);api=hooks.render([nodes,edges,options]);
 const receiveGui=patch=>api.backfillNodeReceipt({receiptKind:'external-geometry',projectId:'project-original',canvasId:'canvas-original',fromVersion:1,toVersion:2,
   patches:[{id:nodes[0].id,before:canvasGeometry(nodes[0]),after:canvasGeometry(nodes[0]),nativeGui:patch}],expectedNodes:nodes,expectedEdges:edges});
 for(const [field,value]of [['lcos_gui_navigation_pin',true],['color_pins',['4EA8FF']]]){
   const prior=copy(nodes[0]),count=batches.length,history=api.inspectNativeHistory({canvasId:'canvas-original',nodeId:prior.id}).historySize;
   assert.equal(receiveGui({[field]:{before:prior.data[field],after:value}}).ok,true);await settle();assert.deepEqual(copy(nodes[0].data[field]),value);assert.equal(batches.length,count);assert.equal(api.inspectNativeHistory({canvasId:'canvas-original',nodeId:prior.id}).historySize,history+1);
   api.undo();await settle();assert.deepEqual(copy(nodes[0].data[field]),prior.data[field]);assert.equal(batches.length,count+1);assert.ok(JSON.stringify(batches.at(-1)).includes(JSON.stringify(field)));
   api.redo();await settle();assert.deepEqual(copy(nodes[0].data[field]),value);assert.equal(batches.length,count+2);assert.equal(nodes[0].data.text,prior.data.text);assert.deepEqual(copy(nodes[0].position),prior.position);
 }
 const beforeInvalid=copy(nodes),batchesInvalid=batches.length;
 for(const bad of [{body:{before:'',after:'forbidden'}},{color_pins:{before:['4EA8FF'],after:['bad']}},{lcos_gui_navigation_pin:{before:'true',after:false}},{lcos_gui_navigation_pin:{before:false,after:false}}])assert.equal(receiveGui(bad).ok,false);
 assert.deepEqual(copy(nodes),beforeInvalid);assert.equal(batches.length,batchesInvalid);
 report.checks.push('Actual installed transformed O8 receives ordinary pin/color once without echo, appends original history, and original Undo/Redo serialize the same GUI fields. Typed owner, malformed values/extra fields and wrong prestate reject without body/geometry/history writes.');
 report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; }
fs.writeFileSync(path.join(output, '前端几何同步定向回归.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
