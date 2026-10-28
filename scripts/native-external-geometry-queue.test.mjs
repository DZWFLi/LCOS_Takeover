import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';
import { canvasGeometry } from '../lab/native-canvas-sync.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportFile = path.join(root, 'output/原画布外部工具实时接入_20261023/原r6去重回归.json');
const report = { passed: false, networkRequests: 0, modelCalls: 0, checks: [],
  scope: 'Actual shipped r6/M8/PC/b0/DC/s6/n6, production acknowledgement injection and external-geometry receipt helper; hook registration, deterministic fingerprint encoding and wire sends are local adapters. This does not claim a browser or a live save.' };
const copy = value => JSON.parse(JSON.stringify(value));
const until = async predicate => {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Original queue did not reach the expected state.');
    await new Promise(resolve => setTimeout(resolve, 1));
  }
};
function declaration(source, ast, name) {
  for (const row of ast.body) {
    if (row.type === 'FunctionDeclaration' && row.id?.name === name) return source.slice(row.start, row.end);
    for (const item of row.declarations ?? []) if (item.id?.name === name) return source.slice(item.init.start, item.init.end);
  }
  throw new Error('Original declaration unavailable: ' + name);
}

try {
  const filename = 'page-Da_DfwiK.js';
  const raw = fs.readFileSync(path.join(root, 'reference/tapnow-installed/resources/web/assets', filename), 'utf8');
  const transformed = transformHistoryIntentScript(filename,
    transformSurfaceDockScript(filename, transformNodeBridgeScript(filename, transformCutScript(filename, raw))));
  const program = parseOriginalDonorScript(transformed, filename);
  const context = {
    assert, console, Date, Promise, Map, Set, WeakMap, Object, Array, Math, Number, String, Boolean, JSON,
    Error, structuredClone, setTimeout, clearTimeout,
    crypto: { randomUUID: () => 'external-geometry-queue-test' },
    dn: () => ({ warn() {}, error() {} }), $e: () => ({ getEdge() {} }), he: () => ({ t: value => value }), vd: () => () => {},
    bs: { batchOperateNodes: 'nodes', batchOperateLinks: 'edges' }, Sg: {},
    t6: () => ({ recordPersistFailure() {}, recordPersistSuccess() {}, syncPersistStatus() {} }),
    GN: () => false, WN: () => false, YN: (_canvasId, _owner, run) => run(), $N() {},
    ix: () => false, ox: () => false, pp: value => value, ff: JSON.stringify,
    kl: () => Promise.resolve(), Fi: { maxRetries: 0 }, v0: 25000,
    fetch() { report.networkRequests++; throw new Error('Real network is forbidden in this regression.'); },
  };
  context.window = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'lab/startup-history-intent.js'), 'utf8'), sandbox);
  for (const name of ['DC', 'PC', 'b0', 's6', 'n6', 'M8', 'r6']) {
    context[name] = vm.runInContext('(' + declaration(transformed, program, name) + ')', sandbox);
  }
  function createOwner() {
    const refs = [], sends = [];
    let holdNext = false, releaseHeld;
    context.l = {
      useMemo: factory => factory(), useCallback: callback => callback,
      useRef: initial => { const ref = { current: initial }; refs.push(ref); return ref; }, useEffect() {},
    };
    context.zi = route => ({ abort() {}, send: async payload => {
      sends.push({ route, payload: copy(payload) });
      if (holdNext) { holdNext = false; await new Promise(resolve => { releaseHeld = resolve; }); }
      return { code: 0, data: {} };
    } });
    const queue = context.r6({ canvasId: 'canvas-original', onNodesChange() {}, onEdgesChange() {} });
    const execute = queue.executeBatchOperations;
    assert.equal(typeof execute.acknowledgeExternalGeometry, 'function');
    assert.equal(typeof execute.readExternalGeometryReadiness, 'function');
    const fingerprintOwner = refs.find(ref => ref.current instanceof Map);
    assert.ok(fingerprintOwner, 'The real r6 dedupe Map must remain the sole cache.');
    return {
      queue, execute, sends, fingerprints: fingerprintOwner.current,
      hold() { holdNext = true; }, release() { assert.equal(typeof releaseHeld, 'function'); releaseHeld(); },
    };
  }
  const nodeA = { id: 'native-text', type: 'text', position: { x: 11, y: 2 }, width: 300, height: 180,
    measured: { width: 300, height: 180 }, data: { id: 'native-text', text: 'Original user body' } };
  const nodeB = { ...copy(nodeA), position: { x: 81, y: 42 } };
  const other = { ...copy(nodeA), id: 'unrelated-text', data: { id: 'unrelated-text', text: 'Unrelated original body' } };
  const operations = node => context.M8([{ type: 'replace', id: node.id, item: copy(node) }], Date.now());
  const key = node => 'canvas-original:' + node.id;

  const legacy = createOwner();
  await legacy.execute(operations(nodeA), []);
  assert.equal(legacy.sends.length, 1);
  const beforeUndoPayload = copy(context.PC(operations(nodeA)[0]));
  // Legacy receipt updates the Canvas to B without acknowledging the original r6 cache.
  // M8's next ordinary Undo produces the complete prior A payload again.
  assert.deepEqual(copy(context.PC(operations(nodeA)[0])), beforeUndoPayload);
  await legacy.execute(operations(nodeA), []);
  assert.equal(legacy.sends.length, 1, 'The former bug must be reproducible: the original r6 swallows Undo A as an old duplicate.');
  report.legacy = { savedARequests: 1, requestsAfterUndoA: legacy.sends.length, undoWasSwallowed: true };
  report.checks.push('Actual donor M8/PC/b0/r6 reproduces saved A -> unacknowledged external B -> swallowed Undo A');

  const owner = createOwner();
  await owner.execute(operations(nodeA), []);
  await owner.execute(operations(other), []);
  assert.equal(owner.sends.length, 2);
  const unrelatedFingerprint = owner.fingerprints.get(key(other));
  assert.ok(owner.fingerprints.has(key(nodeA)));
  const currentNodesRef = { current: [copy(nodeA), copy(other)] }, currentEdgesRef = { current: [] };
  const history = [{ state: { nodes: copy(currentNodesRef.current), edges: [] }, timestamp: 1 }];
  let historyAppends = 0;
  context.__LCOS_NODE_LAB__ = { canvasId: 'canvas-original', projectId: 'project-original', api: {} };
  const beforeEventSends = owner.sends.length;
  const result = context.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt({
    receiptKind: 'external-geometry', projectId: 'project-original', canvasId: 'canvas-original', fromVersion: 1, toVersion: 2,
    patches: [{ id: nodeA.id, before: canvasGeometry(nodeA), after: canvasGeometry(nodeB) }],
    expectedNodes: currentNodesRef.current, expectedEdges: currentEdgesRef.current,
    currentNodesRef, currentEdgesRef, history, getHistory: () => history, flushHistory() {}, isHistoryApplying: () => false,
    isCanvasQueueIdle: () => owner.execute.readExternalGeometryReadiness().idle,
    recordExternalGeometry(nodes, edges) { historyAppends++; history.push({ state: { nodes, edges }, timestamp: 2 }); },
    setTextReceiptNodes(nodes) { currentNodesRef.current = nodes; },
    acknowledgeExternalGeometry: receipt => owner.execute.acknowledgeExternalGeometry(receipt),
  });
  assert.equal(result.ok, true);
  assert.equal(historyAppends, 1);
  assert.equal(owner.sends.length, beforeEventSends, 'Receiving and acknowledging an external event must not enqueue a wire send.');
  assert.deepEqual(copy(currentNodesRef.current[0].position), nodeB.position);
  assert.equal(currentNodesRef.current[0].data.text, nodeA.data.text);
  assert.equal(owner.fingerprints.has(key(nodeA)), false, 'The actual production acknowledgement invalidates only the target old fingerprint.');
  assert.equal(owner.fingerprints.get(key(other)), unrelatedFingerprint);
  await owner.execute(operations(nodeA), []);
  assert.equal(owner.sends.length, beforeEventSends + 1, 'Ordinary Undo A must reach the real r6 send boundary after acknowledgement.');
  assert.deepEqual(owner.sends.at(-1).payload.actions[0].updates[0].position, nodeA.position);
  await owner.execute(operations(nodeB), []);
  assert.equal(owner.sends.length, beforeEventSends + 2, 'Ordinary Redo B must also reach the real r6 send boundary.');
  assert.deepEqual(owner.sends.at(-1).payload.actions[0].updates[0].position, nodeB.position);
  assert.equal(owner.fingerprints.get(key(other)), unrelatedFingerprint);
  report.acknowledged = { requestsBeforeExternalEvent: beforeEventSends, requestsAfterExternalEvent: beforeEventSends,
    requestsAfterUndoA: beforeEventSends + 1, requestsAfterRedoB: owner.sends.length,
    historyAppends, unrelatedFingerprintPreserved: true, originalBodyPreserved: true };
  report.checks.push('Actual external-geometry helper invokes the production r6 acknowledgement with no event send; subsequent Undo A and Redo B each send once, preserving unrelated cache/body');

  const rejected = createOwner();
  await rejected.execute(operations(nodeA), []);
  const savedFingerprint = rejected.fingerprints.get(key(nodeA));
  assert.equal(rejected.execute.acknowledgeExternalGeometry({ canvasId: 'other-canvas', nodeIds: [nodeA.id] }), false);
  assert.equal(rejected.fingerprints.get(key(nodeA)), savedFingerprint);
  await rejected.execute(operations(nodeA), []);
  assert.equal(rejected.sends.length, 1, 'A rejected cross-Canvas acknowledgement must not invalidate the old owner cache.');
  report.checks.push('Cross-Canvas acknowledgement is rejected without changing the original dedupe cache');
  rejected.hold();
  const activeSend = rejected.execute(operations(nodeB), []);
  await until(() => rejected.sends.length === 2);
  assert.equal(rejected.execute.readExternalGeometryReadiness().idle, false);
  assert.equal(rejected.execute.acknowledgeExternalGeometry({ canvasId: 'canvas-original', nodeIds: [nodeA.id] }), false);
  assert.equal(rejected.fingerprints.get(key(nodeA)), savedFingerprint, 'A busy acknowledgement may not rewrite the in-flight queue/cache.');
  rejected.release(); await activeSend;
  assert.equal(rejected.execute.readExternalGeometryReadiness().idle, true);
  report.checks.push('Actual r6 in-flight send reports busy and rejects acknowledgement until its original send settles');
  const emphasizedOwner=createOwner(), plain={...copy(nodeA),data:{...nodeA.data,lcos_gui_emphasis:false}}, emphasized={...copy(plain),data:{...plain.data,lcos_gui_emphasis:true}};
  await emphasizedOwner.execute(operations(plain),[]);
  const emphasisNodes={current:[plain]},emphasisEdges={current:[]},emphasisHistory=[{state:{nodes:[plain],edges:[]},timestamp:1}];
  const emphasisReceipt=context.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt({receiptKind:'external-geometry',projectId:'project-original',canvasId:'canvas-original',fromVersion:2,toVersion:3,
    patches:[{id:plain.id,before:canvasGeometry(plain),after:canvasGeometry(plain),emphasis:{before:false,after:true}}],expectedNodes:emphasisNodes.current,expectedEdges:emphasisEdges.current,
    currentNodesRef:emphasisNodes,currentEdgesRef:emphasisEdges,history:emphasisHistory,getHistory:()=>emphasisHistory,flushHistory(){},isHistoryApplying:()=>false,
    isCanvasQueueIdle:()=>emphasizedOwner.execute.readExternalGeometryReadiness().idle,
    recordExternalGeometry(nodes,edges){emphasisHistory.push({state:{nodes,edges},timestamp:2});},setTextReceiptNodes(nodes){emphasisNodes.current=nodes;},
    acknowledgeExternalGeometry:receipt=>emphasizedOwner.execute.acknowledgeExternalGeometry(receipt)});
  assert.equal(emphasisReceipt.ok,true);assert.equal(emphasizedOwner.sends.length,1);assert.equal(emphasisNodes.current[0].data.lcos_gui_emphasis,true);
  assert.equal(emphasizedOwner.fingerprints.has(key(plain)),false);
  await emphasizedOwner.execute(operations(plain),[]);assert.equal(emphasizedOwner.sends.length,2);assert.equal(emphasizedOwner.sends.at(-1).payload.actions[0].updates[0].data.lcos_gui_emphasis,false);
  await emphasizedOwner.execute(operations(emphasized),[]);assert.equal(emphasizedOwner.sends.length,3);assert.equal(emphasizedOwner.sends.at(-1).payload.actions[0].updates[0].data.lcos_gui_emphasis,true);
  assert.equal(emphasisNodes.current[0].data.text,nodeA.data.text);
  report.checks.push('Same actual r6 cache acknowledgement handles external emphasis without receiving POST; real M8/PC false Undo and true Redo each reach the ordinary wire boundary once');
  assert.equal(report.networkRequests, 0); assert.equal(report.modelCalls, 0);
  report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; }
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
