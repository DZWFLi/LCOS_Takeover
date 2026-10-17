import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const require = createRequire(import.meta.url);
const { createNativeTextSavePort } = require('../lab/native-text-save-port.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(root, '.runtime', 'native-text-save-test-' + Date.now());
const facadeEntry = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'facade.mjs'));
const callerEntry = await buildPilotEntry('lab/pilot/native-text-save.ts', path.join(runtimeRoot, 'native-text-save-caller.mjs'), 'browser');
assert.match(fs.readFileSync(callerEntry, 'utf8'), /__LCOS_NATIVE_TEXT_SAVE_PORT__/,
  'typed caller resolves the ephemeral native save port instead of Core PUT');
const originalBridgeSource = fs.readFileSync(path.join(root, 'lab/startup-node-bridge.js'), 'utf8');
assert.match(originalBridgeSource, /updateNodeData:\s*\(id, data, options\) => api\.updateNodeData\(id, safeClone\(data\), options\)/,
  'the production NodeBridge forwards this call directly to TapNow useCanvasApi.updateNodeData');
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture');
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr');
process.env.LCOS_RECOVERY_TRANSPORT = 'none';
const { startSurfaceCoreFacade } = await import(pathToFileURL(facadeEntry).href);
const origin = 'http://127.0.0.1:39821'; // handler-only origin; this test never binds it or 17881
let facade;
const call = (method, address, body) => facade.handle({ method,
  pathname: new URL(address, origin).pathname, url: origin + address, body });
const callCoreText = (method, projectId, address, body) => {
  const route = '/api/lcos/core/projects/' + encodeURIComponent(projectId) + '/curation/canvas-text';
  const url = route + (method === 'GET' ? '?canvasId=' + encodeURIComponent(address.canvasId)
    + '&spatialId=' + encodeURIComponent(address.spatialId) : '');
  return call(method, url, body);
};
const waitUntil = async (predicate, label) => {
  const until = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > until) throw new Error('Timed out waiting for ' + label);
    await new Promise(resolve => setTimeout(resolve, 2));
  }
};

function createHarness({ canvasId = 'surface-core-main', nodeId = 'surface-main-text', timeoutMs = 100,
  mode = 'native', deferResponse = false, loseResponse = false, raceBeforeBatch = false,
  raceBeforeBatchNodeId, mixedBatch = false, delayCoreReadsMs = 0, hideReceipt = false, foreignReceipt = false,
  failHistoryBackfill = false, requestObject = false, failReceiptOnce = false } = {}) {
  const route = '/api/canvas/v1/canvases/' + encodeURIComponent(canvasId);
  const batchPath = route + '/nodes:batchActions';
  const trace = { apiCalls: [], receiptCalls: [], batches: [], batchRequests: [], coreReads: [], receiptReads: [], externalWrites: [], errors: [], batchCommitted: null, releaseResponse: null };
  let nodes = [];
  let edges = [];
  let initialDetail;
  const queuedUpdates = new Map();
  const nativeAutosaveQueue = [];
  let multiBatchQueued = false;
  let receiptVisible = !hideReceipt;
  let rejectHistory = failHistoryBackfill;
  let receiptFailurePending = failReceiptOnce;
  async function writeCompetingCoreRevision(spatialId) {
    const prior = await callCoreText('GET', facade.core.projectId, { canvasId, spatialId });
    assert.equal(prior.status, 200, JSON.stringify(prior.body));
    const competing = await callCoreText('PUT', facade.core.projectId, { canvasId, spatialId }, {
      canvasId, spatialId, artifactId: prior.body.value.artifactId,
      expectedRevisionId: prior.body.value.revisionId, body: '# Concurrent Core writer for ' + spatialId + '\n\nNot the registered draft.\n',
    });
    assert.equal(competing.status, 200, JSON.stringify(competing.body));
    trace.externalWrites.push(competing.body.value);
  }
  async function postMultiNativeBatch() {
    if (raceBeforeBatchNodeId) await writeCompetingCoreRevision(raceBeforeBatchNodeId);
    const updates = [...queuedUpdates.values()];
    const wire = { canvas_id: canvasId, actions: [{ action: 'update', updates }] };
    const request = window.fetch(batchPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wire) });
    trace.batches.push(request);
    await request;
  }
  const api = {
    getNode(id) { return nodes.find(node => node.id === id); },
    backfillNodeReceipt(receipt) {
      // The handler harness delegates metadata to the actual history companion,
      // not a second updateNodeData/write. Real O8 timing is a browser concern.
      trace.receiptCalls.push(structuredClone(receipt));
      if (rejectHistory && receipt.receiptKind === 'text-revision') return { ok: false, reason: 'synthetic original history rejected the receipt' };
      const currentNodesRef = { get current() { return nodes; }, set current(value) { nodes = value; } };
      return window.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt({ ...receipt, history: [], currentNodesRef,
        setNodes: value => { nodes = value; }, suppress() { throw new Error('Text metadata cannot suppress the pending user edit.'); } });
    },
    updateNodeData(id, patch) {
      const current = nodes.find(node => node.id === id);
      if (!current) throw new Error('Native test API has no target node.');
      if (typeof patch === 'function') patch = patch(current);
      trace.apiCalls.push({ id, patch: structuredClone(patch) });
      if (mode === 'none') return;
      nodes = nodes.map(node => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node);
      if (mode === 'queued') {
        const live = nodes.find(node => node.id === id);
        const item = { operationType: 'update', id, type: live.type, data: live.data, position: live.position, timestamp: Date.now() };
        window.__LCOS_NATIVE_TEXT_SAVE_PORT__.captureQueuedAutosave(canvasId, item);
        nativeAutosaveQueue.push(item);
        return;
      }
      if (mode === 'multi') {
        queuedUpdates.set(id, { id, data: { ...current.data, ...patch } });
        if (!multiBatchQueued) {
          multiBatchQueued = true;
          setTimeout(() => { void postMultiNativeBatch().catch(error => trace.errors.push(error)); }, 25);
        }
        return undefined;
      }
      const updates = [{ id, data: { ...current.data, ...patch } }];
      if (mixedBatch) {
        const image = nodes.find(node => node.type === 'image');
        updates.push({ id: image.id, position: { x: image.position.x + 25, y: image.position.y + 10 } });
      }
      const postNativeBatch = async () => {
        if (mode === 'delayed') await new Promise(resolve => setTimeout(resolve, 30));
        const raceNodeId = raceBeforeBatchNodeId || (raceBeforeBatch ? nodeId : null);
        if (raceNodeId) await writeCompetingCoreRevision(raceNodeId);
        if (mode === 'bypass') {
          const prior = await callCoreText('GET', facade.core.projectId, { canvasId, spatialId: nodeId });
          const bypass = await callCoreText('PUT', facade.core.projectId, { canvasId, spatialId: nodeId }, {
            canvasId, spatialId: nodeId, artifactId: prior.body.value.artifactId,
            expectedRevisionId: prior.body.value.revisionId, body: patch.text,
          });
          trace.externalWrites.push(bypass.body.value);
          return;
        }
        const wire = { canvas_id: canvasId, actions: [{ action: 'update', updates }] };
        const requestInit = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Native-Synthetic': 'request-preserved' }, body: JSON.stringify(wire) };
        const first = requestObject ? window.fetch(new Request(origin + batchPath, requestInit)) : window.fetch(batchPath, requestInit);
        trace.batches.push(first);
        if (mode === 'duplicate') {
          const second = window.fetch(batchPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wire) });
          trace.batches.push(second);
        }
        await Promise.all(trace.batches);
      };
      void postNativeBatch().catch(error => trace.errors.push(error));
      // Matches the donor's updateNodeData API: enqueue/local state update is
      // synchronous and does not return the fetch or a save promise.
      return undefined;
    },
  };
  const host = { canvasId, projectId: facade.core.projectId, api };
  const upstreamFetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), origin);
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method === 'GET' && url.pathname.endsWith('/curation/canvas-text') && delayCoreReadsMs) {
      await new Promise(resolve => setTimeout(resolve, delayCoreReadsMs));
    }
    let body;
    if (method !== 'GET') {
      const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
      body = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
    const isReceipt = method === 'GET' && url.pathname.includes('/text-save-receipts/');
    if (isReceipt) trace.receiptReads.push(url.pathname);
    if (isReceipt && receiptFailurePending) { receiptFailurePending = false; throw new Error('synthetic original receipt GET temporarily offline'); }
    const result = isReceipt && !receiptVisible ? { status: 404, body: { ok: false, error: { code: 'TEXT_RECEIPT_NOT_FOUND' } } }
      : await call(method, url.pathname + url.search, body);
    if (isReceipt && foreignReceipt && result.body?.value) result.body.value.wireBody.canvas_id = 'another-canvas';
    if (method === 'GET' && url.pathname.endsWith('/curation/canvas-text')) trace.coreReads.push(url.pathname + url.search);
    if (url.pathname.endsWith('/nodes:batchActions')) {
      const batchObservation = { status: result.status, body, result: result.body,
        requestToken: url.searchParams.get('lcos_text_save_request'),
        syntheticHeader: new Headers(init?.headers || (input instanceof Request ? input.headers : {})).get('X-Native-Synthetic') };
      trace.batchRequests.push(batchObservation);
      trace.batchCommitted = batchObservation;
      if (deferResponse) await new Promise(resolve => { trace.releaseResponse = resolve; });
      if (loseResponse) throw new Error('synthetic transport reply loss after the real facade committed');
    }
    return new Response(JSON.stringify(result.body), { status: result.status,
      headers: { 'Content-Type': 'application/json' } });
  };
  const window = { fetch: upstreamFetch, __LCOS_NODE_LAB__: host,
    __LCOS_CREATE_NATIVE_TEXT_SAVE_PORT__: options => createNativeTextSavePort({ ...options, timeoutMs }) };
  const sandbox = { window, location: { href: origin + '/takeover/', origin }, URL, Request, Response,
    Map, Promise, console, setTimeout, clearTimeout, structuredClone, crypto: webcrypto, Headers };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'lab/startup-history-intent.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'lab/startup-surface-core.js'), 'utf8'), sandbox);
  const wrappedFetch = window.fetch;
  const reader = async (projectId, address) => {
    const result = await callCoreText('GET', projectId, address);
    if (result.status !== 200 || result.body?.ok !== true) throw new Error(result.body?.error?.message || 'Core canvas text read failed.');
    return result.body.value;
  };
  const refreshNodes = async () => {
    const response = await wrappedFetch(route);
    const payload = await response.json();
    initialDetail = payload.data;
    nodes = structuredClone(payload.data.nodes);
    edges = structuredClone(payload.data.connections || []);
    return payload.data;
  };
  const save = (body, id = nodeId, observedNode = nodes.find(node => node.id === id)) =>
    window.__LCOS_NATIVE_TEXT_SAVE_PORT__.save({ projectId: facade.core.projectId, canvasId,
      nodeId: id, artifactId: observedNode.data.lcos_ref.artifactId,
      expectedRevisionId: observedNode.lcos_revision_id, body });
  const port = window.__LCOS_NATIVE_TEXT_SAVE_PORT__;
  const queueOwner = {};
  const nativeDto = item => ({ id: item.id, type: item.type, data: item.data, position: item.position });
  const flushQueuedAutosave = async () => {
    const items = nativeAutosaveQueue.splice(0);
    if (!items.length) return 'saved';
    await port.prepareQueuedText(canvasId, items, queueOwner);
    if (port.queueDisposition(canvasId, items) === 'hold') { nativeAutosaveQueue.push(...items); return 'failed'; }
    port.queueStarted(canvasId, items);
    try {
      const response = await window.fetch(batchPath, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvas_id: canvasId, actions: [{ action: 'update', updates: items.map(nativeDto) }] }) });
      if (!response.ok || port.holdAfterResponse(canvasId, items)) { nativeAutosaveQueue.push(...items); return 'failed'; }
      port.queueSucceeded(canvasId, items);
      return 'saved';
    } catch (error) { port.holdQueue(canvasId, items, error); nativeAutosaveQueue.push(...items); return 'failed'; }
  };
  if (mode === 'queued') port.registerQueueOwner(canvasId, queueOwner, operationId => {
    const accepted = nativeAutosaveQueue.filter(item => port.canAcknowledgeQueueItem(canvasId, item, nativeDto(item), operationId));
    for (const item of accepted) nativeAutosaveQueue.splice(nativeAutosaveQueue.indexOf(item), 1);
    return accepted.length > 0;
  }, { readPending: () => nativeAutosaveQueue, resume: flushQueuedAutosave, isBusy: () => false });
  return { window, host, api, trace, nodes, get nodesNow() { return nodes; }, get edges() { return edges; },
    queueAutosave(body) { api.updateNodeData(nodeId, port.autosavePatch(nodeId, body)); },
    queueHistoryBody(body, phase='undo') {
      api.updateNodeData(nodeId,{text:body});
      const item=nativeAutosaveQueue.at(-1);
      port.captureHistoryTextOperations({canvasId,phase,intentId:'synthetic-Core-history-'+phase+'-'+Date.now(),
        changes:[{type:'replace',id:nodeId,item:{id:nodeId,type:'text',data:item.data}}],operations:[item]});
    },
    flushQueuedAutosave, nativeAutosaveQueue, restoreResponses() { loseResponse = false; deferResponse = false; },
    replaceLocalPrimary() {
      nodes=nodes.map(node=>node.id===nodeId?{...node,data:{...node.data,text:'Replacement primary survives',
        lcos_ref:{version:1,entityType:'artifact',entityId:'replacement-artifact',artifactId:'replacement-artifact',artifactViewId:'replacement-view',revisionId:'replacement-revision'}}}:node);
    },
    refreshNodes, save, reader, batchPath, route, showReceipt() { receiptVisible = true; }, acceptHistory() { rejectHistory = false; },
    get initialDetail() { return initialDetail; } };
}

try {
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true });
  const initial = await call('GET', '/api/canvas/v1/canvases/surface-core-main');
  assert.equal(initial.status, 200, JSON.stringify(initial.body));
  const primary = initial.body.data.nodes.find(node => node.type === 'text');
  assert.ok(primary?.data?.lcos_ref?.artifactId);
  const duplicate = await call('POST', '/api/canvas/v1/canvases/surface-core-main/nodes:batchActions', {
    canvas_id: 'surface-core-main', lcos_operation: { version: 1, operationId: 'text-save-view-fixture', kind: 'duplicate-view', phase: 'apply' },
    actions: [{ action: 'create', creates: [{ id: 'native-text-save-view', type: 'text', position: { x: 600, y: 500 },
      measured: { width: 300, height: 250 }, lcos_ref: primary.data.lcos_ref,
      data: { text: primary.data.text, title: primary.data.title } }] }],
  });
  assert.equal(duplicate.status, 200, JSON.stringify(duplicate.body));
  assert.equal(duplicate.body.data.lcos_refs['native-text-save-view'].entityType, 'view');
  const secondCreate = await call('POST', '/api/canvas/v1/canvases/surface-core-main/nodes:batchActions', {
    canvas_id: 'surface-core-main', lcos_operation: { version: 1, operationId: 'native-text-save-second-create', kind: 'create', phase: 'apply' },
    actions: [{ action: 'create', creates: [{ id: 'native-text-save-second', type: 'text', position: { x: 700, y: 180 },
      measured: { width: 300, height: 240 }, data: { type: 'generate', title: 'Second native text',
        text: 'Second initial body', prompt: '', params: { model: 'gemini-3.1-flash-lite', provider: 'google' } } }] }],
  });
  assert.equal(secondCreate.status, 200, JSON.stringify(secondCreate.body));

  // One true primary text update through the surface wrapper and real Core + Huabu facade.
  const native = createHarness({ mixedBatch: true });
  await native.refreshNodes();
  const before = native.nodesNow.find(node => node.id === 'surface-main-text');
  const body = '# Single native writer\n\nThe original updateNodeData path owns this save.\n';
  const confirmed = await native.save(body);
  assert.equal(confirmed.status, 'confirmed', JSON.stringify(confirmed));
  assert.equal(native.trace.apiCalls.length, 1, 'one original updateNodeData call is the only save submission');
  assert.equal(native.trace.batches.length, 1, 'one matching native batch was observed');
  assert.equal(native.trace.batchRequests.length, 1);
  assert.equal(native.trace.batchCommitted.status, 200);
  assert.equal(native.trace.batchCommitted.body.lcos_expected_revisions['surface-main-text'], before.lcos_revision_id,
    'the exact pre-observed revision was attached by the existing wrapper owner');
  assert.equal(native.trace.batchCommitted.body.actions[0].updates.find(item => item.id === 'surface-main-text').data.text, body);
  assert.equal(confirmed.value.projectId, facade.core.projectId);
  assert.equal(confirmed.value.canvasId, 'surface-core-main');
  assert.equal(confirmed.value.spatialId, 'surface-main-text');
  assert.equal(confirmed.value.artifactId, before.data.lcos_ref.artifactId);
  assert.equal(confirmed.value.body, body);
  assert.ok(native.trace.coreReads.length >= 2, 'preflight and confirmation use the exact Core GET endpoint, not a supplied callback or a direct PUT');
  assert.notEqual(confirmed.value.revisionId, before.lcos_revision_id);
  assert.equal(native.trace.receiptCalls.length, 1, 'the canonical revision returns through the existing original history receipt port');
  assert.equal(native.nodesNow.find(node => node.id === before.id).data.lcos_ref.revisionId, confirmed.value.revisionId,
    'actual metadata companion backfills the live primary reference without an API echo');
  assert.equal(native.nodesNow.find(node => node.id === before.id).data.content, before.data.content,
    'the original legacy content alias is untouched when text owns the body');
  const current = facade.core.repository.getArtifactRevision(confirmed.value.revisionId);
  assert.ok(current);
  const record = facade.core.repository.getFileRecord(String(current.fileRecordId));
  const savedBytes = await call('GET', '/api/lcos/core/projects/' + encodeURIComponent(facade.core.projectId)
    + '/file-records/' + encodeURIComponent(String(record.id)) + '/content');
  assert.equal(savedBytes.status, 200, JSON.stringify(savedBytes.body));
  assert.equal(Buffer.from(savedBytes.body).toString('utf8'), body, 'the new real FileRecord API returns exact UTF-8 body bytes');
  const afterCanvas = await call('GET', native.route);
  assert.equal(afterCanvas.body.data.nodes.find(node => node.id === 'surface-main-text').data.text, body);
  assert.equal(afterCanvas.body.data.nodes.find(node => node.id === 'surface-main-image').position.x,
    native.nodesNow.find(node => node.id === 'surface-main-image').position.x + 25,
    'one matching text update remains identifiable when the batch also updates another node');
  assert.ok(!native.trace.externalWrites.length, 'the save port made no direct Core PUT');

  // Existing queued autosave adoption has no writer of its own. This transport
  // harness is not r6; the separate real-dr/G7/r6 browser fixture covers that.
  const adopted = createHarness({ mode: 'queued' });
  await adopted.refreshNodes();
  const adoptedBefore = adopted.nodesNow.find(node => node.id === 'surface-main-text').data.lcos_ref.revisionId;
  adopted.queueAutosave('# Existing autosave DTO adopted once\n');
  assert.equal(adopted.trace.apiCalls.length, 1);
  assert.equal(adopted.trace.batchRequests.length, 0);
  assert.equal(await adopted.flushQueuedAutosave(), 'saved');
  assert.equal(adopted.trace.apiCalls.length, 1, 'prepare only registers the already queued native update');
  assert.equal(adopted.trace.batchRequests.length, 1);
  assert.equal(adopted.trace.batchRequests[0].body.lcos_expected_revisions['surface-main-text'], adoptedBefore);
  assert.ok(adopted.trace.batchRequests[0].requestToken?.startsWith('surface-native-batch-'));
  const adoptedCore = await adopted.reader(facade.core.projectId, { canvasId: 'surface-core-main', spatialId: 'surface-main-text' });
  assert.equal(adoptedCore.body, '# Existing autosave DTO adopted once\n');
  assert.notEqual(adoptedCore.revisionId, adoptedBefore);
  assert.equal(adopted.nativeAutosaveQueue.length, 0);
  assert.equal(adopted.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length, 0);
  const unchangedQueued = createHarness({ mode: 'queued' });
  await unchangedQueued.refreshNodes();
  const sameQueuedBody = unchangedQueued.nodesNow.find(node => node.id === 'surface-main-text').data.text;
  const sameQueuedRevision = unchangedQueued.nodesNow.find(node => node.id === 'surface-main-text').data.lcos_ref.revisionId;
  unchangedQueued.queueAutosave(sameQueuedBody);
  assert.equal(await unchangedQueued.flushQueuedAutosave(), 'saved');
  assert.equal(unchangedQueued.trace.apiCalls.length,1);
  assert.equal(unchangedQueued.trace.batchRequests.length,1,'the original op is retained for native spatial/title behavior');
  assert.equal(unchangedQueued.trace.batchRequests[0].requestToken,null,'an unchanged body cannot claim a new text revision handshake');
  assert.equal(unchangedQueued.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length,0);
  assert.equal((await unchangedQueued.reader(facade.core.projectId,{canvasId:'surface-core-main',spatialId:'surface-main-text'})).revisionId,sameQueuedRevision);

  const adoptedLost = createHarness({ mode: 'queued', loseResponse: true });
  await adoptedLost.refreshNodes();
  adoptedLost.queueAutosave('# Exact old queued autosave committed with lost response\n');
  assert.equal(await adoptedLost.flushQueuedAutosave(), 'failed');
  const heldAutosave = adoptedLost.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending()[0];
  assert.equal(heldAutosave.status, 'response-lost');
  adoptedLost.queueAutosave('# Newer queued autosave draft survives old receipt\n');
  const verifiedAutosave = await adoptedLost.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(heldAutosave.operationId);
  assert.equal(verifiedAutosave.status, 'confirmed', JSON.stringify(verifiedAutosave));
  assert.equal(adoptedLost.trace.batchRequests.length, 1, 'GET recovery must not submit the later draft');
  assert.equal(adoptedLost.nodesNow.find(node => node.id === 'surface-main-text').data.text,
    '# Newer queued autosave draft survives old receipt\n');
  assert.equal(adoptedLost.nativeAutosaveQueue.length, 1);
  assert.equal(adoptedLost.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.readQueuedAutosave('surface-main-text')?.canResume, true);
  adoptedLost.restoreResponses();
  assert.equal(adoptedLost.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.resumeAutosave('surface-main-text'), true);
  assert.equal(adoptedLost.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.resumeAutosave('surface-main-text'), false);
  await waitUntil(() => adoptedLost.nativeAutosaveQueue.length === 0
    && adoptedLost.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length === 0, 'explicit original queued continuation');
  assert.equal(adoptedLost.trace.batchRequests.length, 2);
  assert.equal(adoptedLost.trace.batchRequests[1].body.lcos_expected_revisions['surface-main-text'], verifiedAutosave.value.revisionId);
  assert.equal((await adoptedLost.reader(facade.core.projectId, { canvasId: 'surface-core-main', spatialId: 'surface-main-text' })).body,
    '# Newer queued autosave draft survives old receipt\n');

  const historyLost=createHarness({mode:'queued',loseResponse:true});
  await historyLost.refreshNodes();
  historyLost.queueHistoryBody('# Synthetic original Undo DTO exact body\n','undo');
  assert.equal(await historyLost.flushQueuedAutosave(),'failed');
  const historyOperation=historyLost.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending()[0];
  assert.equal(historyOperation.source,'native-history');assert.equal(historyOperation.historyPhase,'undo');
  assert.equal(historyLost.trace.apiCalls.length,1,'history adoption never submits a second editor update');
  const historyRecovered=await historyLost.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(historyOperation.operationId);
  assert.equal(historyRecovered.status,'confirmed',JSON.stringify(historyRecovered));
  assert.equal(historyLost.trace.batchRequests.length,1,'history receipt GET is read-only');
  historyLost.restoreResponses();
  historyLost.queueHistoryBody('# Synthetic original Redo DTO exact body\n','redo');
  assert.equal(await historyLost.flushQueuedAutosave(),'saved');
  assert.equal(historyLost.trace.batchRequests.length,2);
  assert.equal(historyLost.trace.batchRequests[1].body.lcos_expected_revisions['surface-main-text'],historyRecovered.value.revisionId);
  assert.equal(historyLost.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length,0);

  // The wrapper can serialize this owned text request behind an older ordinary
  // HTTP response. Scope must be checked when the queued send actually runs.
  for(const replacement of ['api','primary','none']) {
    const delayedScope=createHarness({mode:'queued',deferResponse:true});await delayedScope.refreshNodes();
    const priorText=await delayedScope.reader(facade.core.projectId,{canvasId:'surface-core-main',spatialId:'surface-main-text'});
    const blocker=delayedScope.window.fetch(delayedScope.batchPath,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({canvas_id:'surface-core-main',actions:[{action:'update',updates:[{id:'surface-main-image',position:{x:155,y:111}}]}]})});
    await waitUntil(()=>typeof delayedScope.trace.releaseResponse==='function','ordinary response to hold the original wrapper send');
    delayedScope.queueHistoryBody('# Deferred history send '+replacement+'\n','undo');
    const waiting=delayedScope.flushQueuedAutosave();
    await waitUntil(()=>delayedScope.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending()[0]?.status==='waiting-batch','owned history preflight before serialized send');
    if(replacement==='api')delayedScope.host.api={...delayedScope.api};
    if(replacement==='primary')delayedScope.replaceLocalPrimary();
    delayedScope.restoreResponses();delayedScope.trace.releaseResponse();await blocker;
    const result=await waiting;
    if(replacement==='none') {
      assert.equal(result,'saved');assert.equal(delayedScope.trace.batchRequests.length,2);
      assert.ok(delayedScope.trace.batchRequests[1].requestToken);
    } else {
      assert.equal(result,'failed');assert.equal(delayedScope.trace.batchRequests.length,1,'stale owned request must never downgrade to ordinary upstream POST');
      assert.equal((await delayedScope.reader(facade.core.projectId,{canvasId:'surface-core-main',spatialId:'surface-main-text'})).revisionId,priorText.revisionId);
      assert.ok(delayedScope.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length);
      assert.equal(delayedScope.nativeAutosaveQueue.length,1);
      if(replacement==='primary')assert.equal(delayedScope.nodesNow.find(node=>node.id==='surface-main-text').data.text,'Replacement primary survives');
    }
  }

  // Two node-keyed drafts may share one original native batch and receive independent exact Core receipts.
  const multi = createHarness({ mode: 'multi', timeoutMs: 1500 });
  await multi.refreshNodes();
  const primaryBeforeMulti = multi.nodesNow.find(node => node.id === 'surface-main-text');
  const secondBeforeMulti = multi.nodesNow.find(node => node.id === 'native-text-save-second');
  const primaryMultiBody = '# Parallel main text save\n\nNode one remains distinct.\n';
  const secondMultiBody = '# Parallel second text save\n\nNode two remains distinct.\n';
  const [primaryMultiResult, secondMultiResult] = await Promise.all([
    multi.save(primaryMultiBody, primaryBeforeMulti.id, primaryBeforeMulti),
    multi.save(secondMultiBody, secondBeforeMulti.id, secondBeforeMulti),
  ]);
  assert.equal(primaryMultiResult.status, 'confirmed', JSON.stringify(primaryMultiResult));
  assert.equal(secondMultiResult.status, 'confirmed', JSON.stringify(secondMultiResult));
  assert.equal(multi.trace.apiCalls.length, 2, 'both original updateNodeData calls were issued once');
  assert.equal(multi.trace.batches.length, 1, 'the native queue combined both node changes into one real batch');
  assert.equal(multi.trace.batchRequests[0].body.actions[0].updates.length, 2);
  assert.equal(multi.trace.batchRequests[0].body.lcos_expected_revisions[primaryBeforeMulti.id], primaryBeforeMulti.lcos_revision_id);
  assert.equal(multi.trace.batchRequests[0].body.lcos_expected_revisions[secondBeforeMulti.id], secondBeforeMulti.lcos_revision_id);
  assert.equal(primaryMultiResult.value.body, primaryMultiBody);
  assert.equal(secondMultiResult.value.body, secondMultiBody);
  for (const result of [primaryMultiResult, secondMultiResult]) {
    const revision = facade.core.repository.getArtifactRevision(result.value.revisionId);
    const file = facade.core.repository.getFileRecord(String(revision.fileRecordId));
    const bytes = await call('GET', '/api/lcos/core/projects/' + encodeURIComponent(facade.core.projectId)
      + '/file-records/' + encodeURIComponent(String(file.id)) + '/content');
    assert.equal(bytes.status, 200);
    const expectedBody = result.value.spatialId === primaryBeforeMulti.id ? primaryMultiBody : secondMultiBody;
    assert.equal(Buffer.from(bytes.body).toString('utf8'), expectedBody);
  }

  // If one member fails CAS, the shared response is attributed by nodeId; its sibling is never called the conflict.
  const multiRace = createHarness({ mode: 'multi', timeoutMs: 1500, raceBeforeBatchNodeId: 'native-text-save-second' });
  await multiRace.refreshNodes();
  const primaryBeforeRace = multiRace.nodesNow.find(node => node.id === 'surface-main-text');
  const secondBeforeRace = multiRace.nodesNow.find(node => node.id === 'native-text-save-second');
  const [primaryRejected, secondConflict] = await Promise.all([
    multiRace.save('# sibling should not inherit other node conflict', primaryBeforeRace.id, primaryBeforeRace),
    multiRace.save('# second node loses its own CAS', secondBeforeRace.id, secondBeforeRace),
  ]);
  assert.equal(multiRace.trace.batches.length, 1);
  assert.equal(multiRace.trace.batchRequests[0].status, 409);
  assert.equal(primaryRejected.status, 'batch-failed-other-node', JSON.stringify(primaryRejected));
  assert.equal(secondConflict.status, 'conflict', JSON.stringify(secondConflict));
  assert.equal(multiRace.trace.apiCalls.length, 2);

  // A view cannot borrow the source Artifact as its write address.
  const viewHarness = createHarness({ nodeId: 'native-text-save-view' });
  await viewHarness.refreshNodes();
  const viewNode = viewHarness.nodesNow.find(node => node.id === 'native-text-save-view');
  const viewResult = await viewHarness.save('# must remain read-only', viewNode.id, viewNode);
  assert.equal(viewResult.status, 'wrong-node-or-view');
  assert.equal(viewHarness.trace.apiCalls.length, 0);
  const foreignCanvasResult = await viewHarness.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.save({
    projectId: facade.core.projectId, canvasId: 'surface-core-context', nodeId: 'surface-main-text',
    artifactId: primary.data.lcos_ref.artifactId, expectedRevisionId: primary.lcos_revision_id,
    body: '# foreign canvas must not write',
  });
  assert.equal(foreignCanvasResult.status, 'wrong-canvas');
  assert.equal(viewHarness.trace.apiCalls.length, 0);

  // A racing Core producer after preflight receives the old wrapper CAS and loses cleanly.
  const racing = createHarness({ raceBeforeBatch: true });
  await racing.refreshNodes();
  const racingNode = racing.nodesNow.find(node => node.id === 'surface-main-text');
  const raceResult = await racing.save('# stale native draft');
  assert.equal(raceResult.status, 'conflict', JSON.stringify(raceResult));
  assert.equal(racing.trace.apiCalls.length, 1);
  assert.equal(racing.trace.batchCommitted.status, 409);
  assert.equal(racing.trace.batchCommitted.body.lcos_expected_revisions['surface-main-text'], racingNode.lcos_revision_id);
  assert.equal((await racing.reader(facade.core.projectId, { canvasId: 'surface-core-main', spatialId: 'surface-main-text' })).body,
    racing.trace.externalWrites[0].body, 'the stale draft did not overwrite the competing Core revision');

  // Duplicate native batch is not a second receipt: only the first request can claim the pending save.
  const duplicateHarness = createHarness({ mode: 'duplicate' });
  await duplicateHarness.refreshNodes();
  const duplicateBefore = duplicateHarness.nodesNow.find(node => node.id === 'surface-main-text');
  const duplicateSave = await duplicateHarness.save('# exactly one receipt');
  assert.equal(duplicateSave.status, 'confirmed');
  assert.equal(duplicateHarness.trace.apiCalls.length, 1);
  assert.equal(duplicateHarness.trace.batches.length, 2);
  assert.equal(duplicateHarness.trace.batchRequests[0].body.lcos_expected_revisions['surface-main-text'], duplicateBefore.lcos_revision_id,
    'the confirmed first request used the one registered CAS');
  assert.deepEqual(duplicateHarness.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending(), [],
    'the duplicate response did not attach itself as another operation receipt');

  // No batch receipt times out as unknown; read-only GET can identify direct Core bypass but never bless it as native save.
  const bypass = createHarness({ mode: 'bypass', timeoutMs: 10 });
  await bypass.refreshNodes();
  const bypassResult = await bypass.save('# written only through direct Core bypass');
  assert.equal(bypassResult.status, 'no-receipt-yet');
  await waitUntil(() => bypass.trace.externalWrites.length > 0, 'synthetic bypass commit before its read-only evidence check');
  const bypassVerified = await bypass.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(bypassResult.operationId);
  assert.equal(bypassVerified.status, 'readback-matched-unconfirmed');
  assert.equal(bypassVerified.value.body, '# written only through direct Core bypass');
  assert.equal(bypass.trace.apiCalls.length, 1);
  assert.equal(bypass.trace.batches.length, 0, 'a direct Core PUT cannot impersonate a native batch receipt');

  const requestBased = createHarness({ requestObject: true });
  await requestBased.refreshNodes();
  const requestSaved = await requestBased.save('# actual Request body and header stay original');
  assert.equal(requestSaved.status, 'confirmed');
  assert.equal(requestBased.trace.batchRequests.length, 1);
  assert.match(requestBased.trace.batchCommitted.requestToken, /^surface-native-batch-[a-f0-9-]{36}$/);
  assert.equal(requestBased.trace.batchCommitted.syntheticHeader, 'request-preserved');

  const rejectedHistory = createHarness({ failHistoryBackfill: true, failReceiptOnce: true });
  await rejectedHistory.refreshNodes();
  const notConfirmed = await rejectedHistory.save('# HTTP 200 does not replace original O8 acceptance');
  assert.equal(notConfirmed.status, 'history-receipt-rejected');
  assert.equal(rejectedHistory.trace.batchCommitted.status, 200);
  assert.equal(rejectedHistory.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length, 1);
  const readUnavailable = await rejectedHistory.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(notConfirmed.operationId);
  assert.equal(readUnavailable.status, 'readback-failed');
  const stillRejected = await rejectedHistory.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(notConfirmed.operationId);
  assert.equal(stillRejected.status, 'readback-matched-unconfirmed', 'a failed GET cannot turn an unaccepted O8 response into a body-only success');
  rejectedHistory.acceptHistory();
  const acceptedHistory = await rejectedHistory.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(notConfirmed.operationId);
  assert.equal(acceptedHistory.status, 'confirmed');
  assert.equal(rejectedHistory.trace.batchRequests.length, 1);
  assert.equal(rejectedHistory.trace.apiCalls.length, 1);

  // A GET of the real original result confirms both owners, without a second native write.
  const lost = createHarness({ loseResponse: true, timeoutMs: 500 });
  await lost.refreshNodes();
  const lostResult = await lost.save('# Core committed, response lost');
  assert.equal(lostResult.status, 'response-lost');
  assert.equal(lost.trace.batchCommitted.status, 200);
  assert.equal(lost.trace.apiCalls.length, 1);
  const lostVerified = await lost.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(lostResult.operationId);
  assert.equal(lostVerified.status, 'confirmed');
  assert.equal(lostVerified.value.body, '# Core committed, response lost');
  assert.equal(lost.trace.apiCalls.length, 1, 'readback recovery never retries updateNodeData');
  assert.ok(lost.trace.coreReads.length >= 2, 'recovery performs read-only Core GET');
  assert.equal(lost.trace.receiptReads.length, 1);
  assert.equal(lost.trace.batchRequests.length, 1, 'receipt recovery never replays nodes:batchActions');

  for (const options of [{ hideReceipt: true }, { foreignReceipt: true }, { failHistoryBackfill: true }]) {
    const missing = createHarness({ loseResponse: true, timeoutMs: 500, ...options });
    await missing.refreshNodes();
    const unknown = await missing.save('# original HTTP proof is required ' + JSON.stringify(options));
    assert.equal(unknown.status, 'response-lost');
    const verified = await missing.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(unknown.operationId);
    assert.equal(verified.status, 'readback-matched-unconfirmed', JSON.stringify({ options, verified }));
    assert.equal(missing.trace.batchRequests.length, 1);
    assert.equal(missing.trace.apiCalls.length, 1);
    assert.equal(missing.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length, 1,
      'absent/foreign/history-rejected proof cannot clear the exact pending edit');
    if (options.hideReceipt) {
      missing.showReceipt();
      const lateProof = await missing.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(unknown.operationId);
      assert.equal(lateProof.status, 'confirmed', 'a nonterminal matching body can be verified again when the original receipt arrives later');
      assert.equal(missing.trace.receiptReads.length, 2);
      assert.equal(missing.trace.batchRequests.length, 1);
    }
  }

  // A late response after a canvas switch cannot confirm into the new scene.
  const late = createHarness({ deferResponse: true, timeoutMs: 10, hideReceipt: true });
  await late.refreshNodes();
  const lateSave = await late.save('# late response stays on the old context');
  assert.equal(lateSave.status, 'response-processing-late');
  await waitUntil(() => late.trace.batchCommitted !== null && typeof late.trace.releaseResponse === 'function', 'late native batch to reach real facade');
  assert.equal(late.trace.batchCommitted.status, 200);
  const preResponseReadback = await late.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(lateSave.operationId);
  assert.equal(preResponseReadback.status, 'readback-matched-unconfirmed',
    'Core body alone is not promoted to a native/spatial receipt while the response is pending');
  late.host.canvasId = 'surface-core-context';
  late.trace.releaseResponse();
  await waitUntil(() => late.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending(lateSave.operationId)?.status === 'context-changed', 'late response classification');
  const lateResult = await late.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(lateSave.operationId);
  assert.equal(lateResult.status, 'context-changed', JSON.stringify(lateResult));
  assert.equal(lateResult.readback.body, '# late response stays on the old context');
  assert.equal(late.trace.apiCalls.length, 1);
  assert.equal(late.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.acknowledge(lateSave.operationId), true);

  // The native queue itself may be delayed beyond the caller's wait window. Its one eventual exact receipt remains pollable.
  const delayed = createHarness({ mode: 'delayed', timeoutMs: 10 });
  await delayed.refreshNodes();
  const delayedResult = await delayed.save('# native queue arrived after timeout');
  assert.equal(delayedResult.status, 'no-receipt-yet');
  await waitUntil(() => delayed.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending(delayedResult.operationId)?.status === 'confirmed', 'delayed native receipt');
  const delayedVerified = await delayed.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.verify(delayedResult.operationId);
  assert.equal(delayedVerified.status, 'confirmed');
  assert.equal(delayedVerified.value.body, '# native queue arrived after timeout');
  assert.equal(delayed.trace.apiCalls.length, 1, 'a delayed receipt never triggers a second updateNodeData call');
  assert.equal(delayed.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.acknowledge(delayedResult.operationId), true);

  // No native batch at all remains unresolved and cannot issue a second write.
  const absent = createHarness({ mode: 'none', timeoutMs: 10 });
  await absent.refreshNodes();
  const absentResult = await absent.save('# no native queue event');
  assert.equal(absentResult.status, 'no-receipt-yet');
  const explicitRef = absent.nodesNow.find(node => node.id === 'surface-main-text').data.lcos_ref;
  const explicitScope = { projectId: facade.core.projectId, canvasId: 'surface-core-main', nodeId: 'surface-main-text',
    artifactId: explicitRef.artifactId, artifactViewId: explicitRef.artifactViewId,
    revisionId: explicitRef.revisionId, api: absent.api };
  const readCountBeforeGuard = absent.trace.coreReads.length;
  assert.equal(absent.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.canResumeExplicitSave(absentResult.operationId, explicitScope), true);
  for (const field of ['projectId','canvasId','nodeId','artifactId','artifactViewId','revisionId','api']) {
    assert.equal(absent.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.canResumeExplicitSave(absentResult.operationId,
      {...explicitScope,[field]:field==='api'?{}:'foreign'}),false,'foreign explicit draft '+field);
  }
  assert.equal(absent.trace.coreReads.length,readCountBeforeGuard,'explicit draft proof is purely read-only metadata');
  const secondAttempt = await absent.save('# a second draft must not be sent');
  assert.equal(secondAttempt.status, 'busy');
  assert.equal(secondAttempt.operationId, absentResult.operationId, 'same-node duplicate preserves the first operation identity');
  assert.equal(absent.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending({ canvasId: 'surface-core-main', nodeId: 'surface-main-text' }).body,
    '# no native queue event', 'the same-node pending payload is not replaced');
  assert.equal(absent.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending().length, 1);
  assert.equal(absent.trace.apiCalls.length, 1);
  assert.equal(absent.trace.batches.length, 0);

  const sameNodeRace = createHarness({ mode: 'none', timeoutMs: 10, delayCoreReadsMs: 40 });
  await sameNodeRace.refreshNodes();
  const sameNodeFirst = sameNodeRace.save('# first same-node payload');
  const sameNodeDuplicate = await sameNodeRace.save('# replacement payload must be rejected');
  assert.equal(sameNodeDuplicate.status, 'busy');
  assert.equal(sameNodeRace.window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending({ canvasId: 'surface-core-main', nodeId: 'surface-main-text' }).body,
    '# first same-node payload', 'the first caller reserves the node before asynchronous Core preflight');
  const sameNodeFirstResult = await sameNodeFirst;
  assert.equal(sameNodeFirstResult.status, 'no-receipt-yet');
  assert.equal(sameNodeRace.trace.apiCalls.length, 1);

  console.log('PASS: one native updateNodeData call -> exact TapNow batch/CAS -> real Core revision/FileRecord -> exact Core GET receipt.');
  console.log('PASS: two distinct node saves share one batch with independent Core revisions/bytes; one-node CAS failure is attributed only to that node.');
  console.log('PASS: actual Request body/header/token, read-only original HTTP receipt recovery, absent/foreign/history-rejected proof, and later receipt availability.');
  console.log('PASS: view identity, duplicate same-node save/batch, Core bypass, late scene switch, and no receipt stay explicit without a writer retry.');
  console.log('SCOPE: isolated temporary Core + Huabu handler integration; not a real-browser/native GUI history acceptance.');
} finally {
  await facade?.close();
}
