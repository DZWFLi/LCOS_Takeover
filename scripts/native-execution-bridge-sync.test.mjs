import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'lab/startup-node-bridge.js');
const source = fs.readFileSync(sourcePath, 'utf8');
assert.match(source, /normalizeNativeNodeParams\(normalizeNativeNodes\(nodes\)\)/,
  'the production facade must use the installed NativeFlow normalization chain');
const factoryStart = source.indexOf("const projectionTypes = new Set(['lcos-execution', 'lcos-result-material']);");
const factoryEnd = source.indexOf('export function createOriginalNodeApi', factoryStart);
assert.ok(factoryStart >= 0 && factoryEnd > factoryStart, 'createExecutionProjectionSynchronizer source slice must stay identifiable');
const factorySource = source.slice(factoryStart, factoryEnd)
  .replaceAll('export function ', 'function ');
const sandbox = { Error, JSON, Promise, Set, encodeURIComponent, setTimeout, clearTimeout };
vm.createContext(sandbox);
vm.runInContext(`${factorySource}\nglobalThis.createExecutionProjectionSynchronizer = createExecutionProjectionSynchronizer;`,
  sandbox, { filename: sourcePath });
const createExecutionProjectionSynchronizer = sandbox.createExecutionProjectionSynchronizer;
const createConversationProjectionSynchronizer = sandbox.createConversationProjectionSynchronizer;
assert.equal(typeof createExecutionProjectionSynchronizer, 'function');

const targetA = Object.freeze({ projectId: 'project-native-sync', canvasId: 'canvas-workflow-a', workspaceId: 'workspace-workflow-a' });
const targetB = Object.freeze({ projectId: 'project-native-sync', canvasId: 'canvas-context-b', workspaceId: 'workspace-context-b' });

function copy(value) { return JSON.parse(JSON.stringify(value)); }

function response(status, envelope) {
  return { ok: status >= 200 && status < 300, status, json: async () => envelope };
}

function successfulEnvelope(target, overrides = {}) {
  return { code: 0, data: {
    canvas_id: target.canvasId,
    workspace_id: target.workspaceId,
    provider_execution_started: false,
    ...overrides,
  } };
}

function initialNodes(target = targetA) {
  return [
    { id: 'ordinary-text', type: 'text', position: { x: 17, y: 23 }, width: 300, height: 180,
      style: { width: 300, height: 180 }, data: { id: 'ordinary-text', content: "keep this user's draft" } },
    { id: 'execution-candidate', type: 'lcos-execution', position: { x: 360, y: 120 }, data: {
      lcos_execution_ref: { ...target, entityType: 'run', entityId: 'run-native-sync' },
    } },
    { id: 'material-candidate', type: 'lcos-result-material', position: { x: 720, y: 120 }, data: {
      lcos_result_ref: { ...target, slotId: 'slot-native-sync', artifactId: 'artifact-native-sync',
        artifactViewId: 'view-native-sync', revisionId: 'revision-native-sync' },
    } },
  ];
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function harness({ target = targetA, nodes = initialNodes(target), edges = [], flush, retry, http, normalize, backfill,
  factory = createExecutionProjectionSynchronizer } = {}) {
  const counts = { events: [], flush: [], retry: [], http: [], normalize: [], backfill: [], addNodes: 0, updateNode: 0, updateNodeData: 0 };
  const nativeListeners = new Set();
  const ownerApi = Object.freeze({ identity: 'original-flow-facade', subscribeNative(listener) {
    nativeListeners.add(listener); return () => nativeListeners.delete(listener);
  } });
  let host = { projectId: target.projectId, canvasId: target.canvasId, currentCanvasId: target.canvasId, api: ownerApi };
  const api = {
    getNodes: () => nodes,
    getEdges: () => edges,
    addNodes: () => { counts.addNodes += 1; },
    updateNode: () => { counts.updateNode += 1; },
    updateNodeData: () => { counts.updateNodeData += 1; },
  };
  const sync = factory({
    api,
    ownerApi,
    getHost: () => host,
    flushCanvas: async canvasId => {
      counts.events.push('flush');
      counts.flush.push(canvasId);
      return flush ? flush(canvasId) : 'saved';
    },
    retryCanvas: async canvasId => {
      counts.events.push('retry');
      counts.retry.push(canvasId);
      return retry ? retry(canvasId) : 'saved';
    },
    request: async (address, options) => {
      counts.events.push(options?.method ?? 'GET');
      counts.http.push({ address, method: options?.method ?? 'GET', options: copy(options ?? {}) });
      if (http) return http(address, options, counts.http.length);
      if (options?.method === 'POST') return response(200, successfulEnvelope(target));
      return response(200, { code: 0, data: { id: target.canvasId, workspace_id: target.workspaceId, nodes } });
    },
    normalizeNodes: candidates => {
      counts.events.push('normalize');
      counts.normalize.push(copy(candidates));
      return normalize ? normalize(candidates) : candidates.map(node => ({ ...node, normalizedByOriginalChain: true }));
    },
    backfillReceipt: receipt => {
      counts.events.push('backfill');
      counts.backfill.push(copy(receipt));
      return backfill ? backfill(receipt) : { ok: true };
    },
  });
  return {
    target, nodes, edges, api, ownerApi, counts, sync,
    setHost(patch) { host = { ...host, ...patch }; },
    getHost() { return host; },
    emitNative() { for (const listener of nativeListeners) listener(); },
    nativeSubscriberCount() { return nativeListeners.size; },
  };
}

const cases = [];
const assertBlocked = (result, pattern, label) => {
  assert.equal(result.ok, false, label);
  assert.match(result.reason, pattern, label);
};

{
  const h = harness({ flush: async () => 'failed' });
  assertBlocked(await h.sync(targetA), /未确认保存/, 'automatic flush must remain blocked');
  assert.equal(h.counts.retry.length, 0, 'automatic synchronization cannot reset a failed original save');
  assert.equal(h.counts.http.length, 0);
  assert.equal((await h.sync(targetA, { retryPendingSave: true })).ok, true);
  assert.deepEqual(h.counts.retry, [targetA.canvasId], 'only explicit user recovery calls the original retry owner');
  assert.equal(h.counts.backfill.length, 1);
  assertBlocked(await h.sync(targetA), /未确认保存/, 'later automatic synchronization uses ordinary flush again');
  assert.equal(h.counts.retry.length, 1);
  cases.push('only explicit user retry resets original native save failure; subsequent automatic calls use flush again');
}

// A happy path must flush first, then POST, then GET; only canonical leaves
// may pass through the real converter seam and reach the existing O8 backfill.
{
  const gate = deferred();
  const h = harness({ flush: () => gate.promise });
  const pending = h.sync(targetA);
  await waitUntil(() => h.counts.flush.length === 1);
  assert.deepEqual(h.counts.events, ['flush'], 'no HTTP starts until the original flush has resolved saved');
  gate.resolve('saved');
  const result = await pending;
  assert.deepEqual(copy(result), { ok: true });
  assert.deepEqual(h.counts.flush, [targetA.canvasId]);
  assert.equal(h.counts.http.length, 2);
  assert.equal(h.counts.http[0].method, 'POST');
  assert.equal(h.counts.http[0].address,
    `/api/lcos/canvases/${encodeURIComponent(targetA.canvasId)}/execution:reconcile`);
  assert.equal(h.counts.http[0].options.body, '{}');
  assert.equal(h.counts.http[1].method, 'GET');
  assert.equal(h.counts.http[1].address, `/api/canvas/v1/canvases/${encodeURIComponent(targetA.canvasId)}`);
  assert.equal(h.counts.normalize.length, 1);
  assert.deepEqual(h.counts.normalize[0].map(node => node.type), ['lcos-execution', 'lcos-result-material']);
  assert.equal(h.counts.backfill.length, 1);
  assert.equal(h.counts.backfill[0].receiptKind, 'execution-projection');
  assert.equal(h.counts.backfill[0].canvasId, targetA.canvasId);
  assert.deepEqual(h.counts.backfill[0].nodes.map(node => node.normalizedByOriginalChain), [true, true]);
  assert.deepEqual(h.counts.events, ['flush', 'POST', 'GET', 'normalize', 'backfill'],
    'the normalizer/backfill run only after saved flush and both successful reads');
  assert.deepEqual({ addNodes: h.counts.addNodes, updateNode: h.counts.updateNode, updateNodeData: h.counts.updateNodeData },
    { addNodes: 0, updateNode: 0, updateNodeData: 0 }, 'bridge sync cannot mutate native nodes directly');
  assert.equal(JSON.stringify(h.nodes), JSON.stringify(initialNodes()), 'readback leaves the source draft graph untouched');
  cases.push('saved flush → exact POST → read-only GET → only execution/material candidates → original normalizer → history backfill');
}

// Flush failure blocks before any HTTP and keeps ordinary draft content intact.
{
  const h = harness({ flush: async () => 'failed' });
  const before = copy(h.nodes);
  const result = await h.sync(targetA);
  assertBlocked(result, /未确认保存|未覆盖/, 'failed flush is an honest blocked receipt');
  assert.equal(h.counts.http.length, 0, 'failed flush must cause zero HTTP calls');
  assert.equal(h.counts.backfill.length, 0);
  assert.deepEqual(h.nodes, before, 'failed flush cannot replace an ordinary draft');
  cases.push('flush failed → zero HTTP/backfill and unchanged draft graph');
}

// HTTP errors at either stage never reach original history backfill.
for (const failingStage of ['POST', 'GET']) {
  const h = harness({ http: async (_address, options, index) => {
    if ((failingStage === 'POST' && options.method === 'POST')
      || (failingStage === 'GET' && options.method !== 'POST')) {
      return response(failingStage === 'POST' ? 503 : 502, { code: 500, message: `${failingStage} fixture failure` });
    }
    return options.method === 'POST'
      ? response(200, successfulEnvelope(targetA))
      : response(200, { code: 0, data: { id: targetA.canvasId, workspace_id: targetA.workspaceId, nodes: h.nodes } });
  } });
  const before = copy(h.nodes);
  const result = await h.sync(targetA);
  assert.equal(result.ok, false, `${failingStage} failure must block the projection`);
  assert.equal(h.counts.backfill.length, 0, `${failingStage} failure must not backfill`);
  assert.deepEqual(h.nodes, before, `${failingStage} failure leaves the draft graph unchanged`);
  assert.equal(h.counts.http.filter(call => call.method === 'POST').length, 1);
  assert.equal(h.counts.http.filter(call => call.method === 'GET').length, failingStage === 'POST' ? 0 : 1);
  cases.push(`${failingStage} HTTP failure → no history backfill and unchanged draft graph`);
}

// Workspace and canonical reference mismatches are rejected before backfill.
for (const failureKind of ['receipt-workspace', 'canvas-workspace', 'execution-ref', 'material-ref']) {
  const h = harness({ http: async (_address, options) => {
    if (options.method === 'POST') {
      return response(200, successfulEnvelope(targetA,
        failureKind === 'receipt-workspace' ? { workspace_id: 'foreign-workspace' } : {}));
    }
    const nodes = copy(h.nodes);
    if (failureKind === 'execution-ref') nodes.find(node => node.type === 'lcos-execution').data.lcos_execution_ref.workspaceId = 'foreign-workspace';
    if (failureKind === 'material-ref') nodes.find(node => node.type === 'lcos-result-material').data.lcos_result_ref.projectId = 'foreign-project';
    return response(200, { code: 0, data: { id: targetA.canvasId,
      workspace_id: failureKind === 'canvas-workspace' ? 'foreign-workspace' : targetA.workspaceId, nodes } });
  } });
  const result = await h.sync(targetA);
  assert.equal(result.ok, false, `${failureKind} must fail closed`);
  assert.equal(h.counts.backfill.length, 0, `${failureKind} cannot enter O8 backfill`);
  assert.equal(h.counts.normalize.length, 0, `${failureKind} is rejected before normalizer`);
  if (failureKind === 'receipt-workspace') assert.equal(h.counts.http.length, 1, 'bad reconcile receipt stops before Canvas GET');
  cases.push(`${failureKind} identity mismatch → no normalization or history backfill`);
}

// If the owner changes while flush, POST, or GET is awaiting, stop before the
// next stage or backfill. Each case changes the captured-owner callback.
{
  const gate = deferred();
  const h = harness({ flush: () => gate.promise });
  let isCurrent = true;
  const pending = h.sync(targetA, { isCurrent: () => isCurrent });
  await Promise.resolve();
  isCurrent = false;
  gate.resolve('saved');
  assertBlocked(await pending, /Canvas\/API 已切换/, 'owner switch during flush blocks before HTTP');
  assert.equal(h.counts.http.length, 0);
  assert.equal(h.counts.backfill.length, 0);
  cases.push('captured-owner callback false during flush stops before HTTP');
}

{
  const postGate = deferred();
  const h = harness({ http: async (_address, options) => options.method === 'POST'
    ? postGate.promise
    : response(200, { code: 0, data: { id: targetA.canvasId, workspace_id: targetA.workspaceId, nodes: h.nodes } }) });
  let isCurrent = true;
  const pending = h.sync(targetA, { isCurrent: () => isCurrent });
  await waitUntil(() => h.counts.http.some(call => call.method === 'POST'));
  isCurrent = false;
  postGate.resolve(response(200, successfulEnvelope(targetA)));
  assertBlocked(await pending, /Canvas\/API 已切换/, 'owner API switch during POST blocks before Canvas GET');
  assert.equal(h.counts.http.filter(call => call.method === 'GET').length, 0);
  assert.equal(h.counts.backfill.length, 0);
  cases.push('captured-owner callback false during POST stops before Canvas GET');
}

{
  const getGate = deferred();
  const h = harness({ http: async (_address, options) => options.method === 'POST'
    ? response(200, successfulEnvelope(targetA))
    : getGate.promise });
  let isCurrent = true;
  const pending = h.sync(targetA, { isCurrent: () => isCurrent });
  await waitUntil(() => h.counts.http.some(call => call.method === 'GET'));
  isCurrent = false;
  getGate.resolve(response(200, { code: 0, data: { id: targetA.canvasId, workspace_id: targetA.workspaceId, nodes: h.nodes } }));
  assertBlocked(await pending, /Canvas\/API 已切换/, 'project switch during GET blocks before backfill');
  assert.equal(h.counts.backfill.length, 0);
  cases.push('captured-owner callback false during GET stops before history backfill');
}

// New ordinary data/geometry changes during HTTP invalidate the receipt,
// while selection/camera/measurement fields remain intentionally outside it.
for (const editKind of ['data', 'geometry']) {
  const postGate = deferred();
  const h = harness({ http: async (_address, options) => options.method === 'POST'
    ? postGate.promise
    : response(200, { code: 0, data: { id: targetA.canvasId, workspace_id: targetA.workspaceId, nodes: h.nodes } }) });
  const pending = h.sync(targetA);
  await waitUntil(() => h.counts.http.some(call => call.method === 'POST'));
  if (editKind === 'data') h.nodes[0].data.content = 'new user edit while request is in flight';
  else h.nodes[0].position.x += 31;
  postGate.resolve(response(200, successfulEnvelope(targetA)));
  assertBlocked(await pending, /新编辑/, `${editKind} changes during HTTP block the stale projection`);
  assert.equal(h.counts.backfill.length, 0);
  assert.equal(h.nodes[0].data.content, editKind === 'data' ? 'new user edit while request is in flight' : "keep this user's draft");
  assert.equal(h.counts.updateNode, 0);
  assert.equal(h.counts.updateNodeData, 0);
  cases.push(`ordinary ${editKind} edit during HTTP rejects backfill and stays untouched`);
}

// Same target shares exactly one in-flight promise; another target is rejected
// instead of accidentally inheriting the first target's receipt.
{
  const postGate = deferred();
  const h = harness({ http: async (_address, options) => options.method === 'POST'
    ? postGate.promise
    : response(200, { code: 0, data: { id: targetA.canvasId, workspace_id: targetA.workspaceId, nodes: h.nodes } }) });
  const first = h.sync(targetA);
  await waitUntil(() => h.counts.http.some(call => call.method === 'POST'));
  const sameTarget = h.sync({ ...targetA });
  assert.equal(sameTarget, first, 'same exact target reuses the in-flight synchronization promise');
  const differentTarget = await h.sync(targetB);
  assert.equal(differentTarget.ok, false);
  assert.match(differentTarget.reason, /另一工作现场/);
  assert.equal(h.counts.flush.length, 1, 'the conflicting target cannot start another flush');
  assert.equal(h.counts.http.length, 1, 'the conflicting target cannot send another request');
  postGate.resolve(response(200, successfulEnvelope(targetA)));
  assert.deepEqual(copy(await first), { ok: true });
  assert.equal(h.counts.backfill.length, 1, 'same-target concurrent callers still produce one backfill');
  cases.push('same-target concurrent call runs once; different-target call is explicitly blocked');
}

// The synchronizer delegates normalization/backfill only; source must not add,
// reload, or patch native nodes itself.
assert.doesNotMatch(factorySource, /location\.reload|\.addNodes\s*\(|\.updateNode(Data)?\s*\(/,
  'synchronizer source cannot reload or write native Canvas nodes directly');

const conversationTarget = { ...targetA, connectedConversationId: 'confirmed-conversation-sync' };
const conversationNode = () => ({ id: 'conversation-native-node', type: 'lcos-conversation', position: { x: 44, y: 55 },
  measured: { width: 96, height: 96 }, data: { id: 'conversation-native-node', title: 'Confirmed local conversation',
    lcos_conversation_ref: { ...conversationTarget }, lcos_conversation_state: { provider: 'codex', isRunning: false, waitingReason: null } } });
const conversationHarness = options => harness({ target: conversationTarget, nodes: [initialNodes()[0], conversationNode()],
  factory: createConversationProjectionSynchronizer, ...options });
{
  const h = conversationHarness();
  assert.equal((await h.sync(conversationTarget)).ok, true);
  assert.deepEqual(h.counts.events, ['flush', 'GET', 'normalize', 'backfill']);
  assert.equal(h.counts.http.length, 1, 'confirmed placement readback never replays conversations:reconcile');
  const receipt = h.counts.backfill[0];
  assert.equal(receipt.receiptKind, 'conversation-projection');
  assert.equal(receipt.connectedConversationId, conversationTarget.connectedConversationId);
  assert.equal(receipt.nodes.length, 1);
  assert.equal(receipt.nodes[0].selected, false, 'new canonical placement does not steal selection');
  assert.equal(h.counts.addNodes + h.counts.updateNode + h.counts.updateNodeData, 0);
  cases.push('confirmed conversation flush → GET only → exact O8 receipt, no reload/direct native writes');
}
for (const mismatch of ['projectId', 'canvasId', 'workspaceId', 'connectedConversationId', 'duplicate', 'normalizedId']) {
  const h = conversationHarness({
    http: async () => { const node = conversationNode();
      if (['projectId', 'canvasId', 'workspaceId', 'connectedConversationId'].includes(mismatch)) node.data.lcos_conversation_ref[mismatch] = 'wrong-owner';
      return response(200, { code: 0, data: { id: targetA.canvasId, workspace_id: targetA.workspaceId,
        nodes: mismatch === 'duplicate' ? [node, copy(node)] : [node] } });
    }, normalize: nodes => mismatch === 'normalizedId' ? nodes.map(node => ({ ...node, id: 'changed-native-id' })) : nodes,
  });
  assert.equal((await h.sync(conversationTarget)).ok, false, mismatch);
  assert.equal(h.counts.backfill.length, 0, `${mismatch} never reaches original history`);
}
cases.push('conversation project/canvas/workspace/conversation/native-ID and duplicate placement mismatches refused');
for (const change of ['draft', 'geometry', 'owner', 'conversation']) {
  const read = deferred(); let active = true;
  const h = conversationHarness({ http: async () => read.promise });
  const pending = h.sync(conversationTarget, { isCurrent: () => active });
  await waitUntil(() => h.counts.http.length === 1);
  if (change === 'draft') h.nodes[0].data.content = 'new unsaved text';
  if (change === 'geometry') h.nodes[0].position.x = 999;
  if (change === 'owner') h.setHost({ currentCanvasId: targetB.canvasId });
  if (change === 'conversation') active = false;
  read.resolve(response(200, { code: 0, data: { id: targetA.canvasId, workspace_id: targetA.workspaceId, nodes: [conversationNode()] } }));
  assert.equal((await pending).ok, false, change); assert.equal(h.counts.backfill.length, 0);
}
cases.push('late conversation readback cannot overwrite unsaved text/geometry or cross scene/selection ownership');
{
  const read = deferred(), h = conversationHarness({ http: async () => read.promise });
  const first = h.sync(conversationTarget);
  await waitUntil(() => h.counts.http.length === 1);
  assert.equal(h.sync({ ...conversationTarget }), first);
  assert.equal((await h.sync({ ...conversationTarget, connectedConversationId: 'another-conversation' })).ok, false);
  read.resolve(response(200, { code: 0, data: { id: targetA.canvasId, workspace_id: targetA.workspaceId, nodes: [conversationNode()] } }));
  assert.equal((await first).ok, true); assert.equal(h.counts.http.length, 1); assert.equal(h.counts.backfill.length, 1);
  const blocked = conversationHarness({ flush: async () => 'blocked' });
  assert.equal((await blocked.sync(conversationTarget)).ok, false); assert.equal(blocked.counts.http.length, 0);
}
cases.push('same confirmed conversation shares one readback; failed native save keeps draft and sends no request');
{
  let published = false;
  const h = conversationHarness({ nodes: [initialNodes()[0]],
    http: async () => response(200, { code: 0, data: { id: targetA.canvasId, workspace_id: targetA.workspaceId, nodes: [conversationNode()] } }),
    backfill: () => { setTimeout(() => { h.nodes.push(conversationNode()); published = true; h.emitNative(); }, 10); return { ok: true }; },
  });
  const result = await h.sync(conversationTarget);
  assert.equal(result.ok, true); assert.equal(published, true, 'method waits until original Flow publishes the React/O8 update');
  assert.equal(h.nodes.some(node => node.type === 'lcos-conversation'), true);
  assert.equal(h.nativeSubscriberCount(), 0, 'the original store observation is released after acknowledgement');
  assert.equal(h.counts.http.length, 1); assert.equal(h.counts.backfill.length, 1);
}
cases.push('conversation sync awaits original Flow publication before resolving, without extra GET/POST or another store');

async function waitUntil(predicate, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.fail('timed out waiting for synchronizer stage');
}

console.log(JSON.stringify({
  passed: true,
  scope: 'execution/conversation projection fake-port controllers; actual O8 behavior is covered separately in native-execution-history.test.mjs',
  sourcePath: path.relative(root, sourcePath).replaceAll('\\', '/'),
  cases,
}, null, 2));
