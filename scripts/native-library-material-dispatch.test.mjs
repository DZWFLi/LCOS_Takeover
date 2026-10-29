import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { currentGen2Root, readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { createNativeLibraryDropOwnerSourceTransforms } from '../lab/native-library-drop-owner-source-transform.mjs';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'output/原生Drop整合_20261017f/材料分派独立HTTP验证', stamp);
const temporary = path.join(root, '.runtime/native-library-material-dispatch-' + stamp);
await mkdir(output, { recursive: true }); await mkdir(temporary, { recursive: true });
const report = { at: new Date().toISOString(), output, passed: false, candidateAccessed: false,
  candidateWrites: 0, coreWrites: 0, models: 0,
  scope: 'Actual dispatcher + capture + transformed original Router/store + actual receive/place clients; loopback HTTP producer peer and controlled original API publication leaf. Not Core, browser, DOM, physical mouse, or real O8 publication.',
  cases: [] };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const clone = value => structuredClone(value);
const oldFetch = globalThis.fetch;
let app, active;
const peer = http.createServer(async (req, res) => {
  const f = active;
  try {
    assert.ok(f, 'Every request must belong to one declared isolated fixture.');
    const u = new URL(req.url, 'http://127.0.0.1'), chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString(), body = raw ? JSON.parse(raw) : undefined;
    const entry = { method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body };
    f.requests.push(entry);
    const send = (value, status = 200) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); } };
    if (u.pathname === '/api/lcos/core/projects/project/graph' && req.method === 'GET') {
      f.graphRead?.resolve(); if (f.graphGate) await f.graphGate.promise;
      return send({ ok: true, value: clone(f.graph) });
    }
    if (u.pathname === '/api/lcos/core/projects/project/connected-conversations/conversation/identity' && req.method === 'GET')
      return send({ ok: true, value: { projectId: 'project', connectedConversation: { id: 'conversation', projectId: 'project', conversationSessionId: 'session' },
        conversationArtifactId: 'conversation-artifact', conversationSession: { id: 'session', projectId: 'project', conversationArtifactId: 'conversation-artifact' } } });
    assert.ok(/^\/api\/lcos\/canvases\/canvas\/materials:(receive|place)$/.test(u.pathname), 'No unrelated, legacy, remote, or model HTTP owner: ' + u.pathname);
    const selected = body ?? { ...entry.query, ...(entry.query.targetRef ? { targetRef: JSON.parse(entry.query.targetRef) } : {}) };
    assert.equal(selected.projectId, 'project'); assert.equal(selected.artifactId, 'artifact');
    assert.equal(selected.artifactViewId, 'source-view'); assert.equal(selected.revisionId, 'r1'); assert.equal(selected.fileRecordId, 'file-r1');
    const isReceive = u.pathname.endsWith(':receive');
    if (isReceive) assert.deepEqual(selected.targetRef, f.intent.targetRef);
    else assert.equal(selected.workspaceId, 'workspace');
    const base = () => ({ project_id: 'project', canvas_id: 'canvas', workspace_id: 'workspace', artifact_id: 'artifact',
      revision_id: 'r1', file_record_id: 'file-r1', artifact_view_id: 'placed-view', provider_execution_started: false,
      ...(isReceive ? { target_ref: clone(selected.targetRef) } : {}) });
    if (req.method === 'GET') {
      if (f.placed) return send({ code: 0, data: clone(f.placed) });
      if (f.graph.artifactViews[0].revisionId !== 'r1') return send({ code: 409, message: 'Controlled peer refuses an absent advanced origin.' }, 409);
      return send({ code: 0, data: { ...base(), state: 'absent' } });
    }
    assert.equal(req.method, 'POST');
    if (f.graph.artifactViews[0].revisionId !== 'r1') return send({ code: 409, message: 'Controlled peer write admission rejects advanced origin.' }, 409);
    assert.equal(f.placed, null, 'A producer cannot be replayed into an already committed result.');
    f.peerWrites++;
    const position = clone(body.position ?? { x: 0, y: 0 });
    const target = f.intent.targetRef;
    const node = { id: 'placed-node', type: 'image', canvas_id: 'canvas', position, width: 360, height: 240,
      data: { id: 'placed-node', lcos_ref: { version: 1, entityType: 'view', entityId: 'placed-view', artifactId: 'artifact', artifactViewId: 'placed-view', revisionId: 'r1' } } };
    const binding = { projectId: 'project', canvasId: 'canvas', spatialKind: 'node', spatialId: node.id, entityType: 'view', entityId: 'placed-view' };
    const capability = target.kind === 'workflow' ? 'workflow' : 'context';
    const presentation = { projectId: 'project', id: `presentation:${capability}:scope`, scopeId: 'scope', capability,
      state: { memberViewIds: ['placed-view'], positions: { 'placed-view': position } } };
    const relation = { id: 'relation', projectId: 'project', kind: 'conversation_context', sourceEntityType: 'artifact',
      sourceEntityId: 'conversation-artifact', targetEntityType: 'view', targetEntityId: 'placed-view' };
    f.placed = { ...base(), state: 'present', already_present: false,
      ...(target.kind === 'conversation' ? { relation } : { node, binding, ...(isReceive ? { presentation } : {}) }) };
    if (f.losePost) { f.lostCommittedResponse = clone(f.placed); return req.socket.destroy(); }
    return send({ code: 0, data: clone(f.placed) });
  } catch (error) {
    f?.peerErrors.push(String(error.stack ?? error));
    if (!res.destroyed) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 500, message: String(error) })); }
  }
});
await new Promise(resolve => peer.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${peer.address().port}`;
globalThis.fetch = (input, init) => { const u = new URL(typeof input === 'string' ? input : input.url, address);
  assert.equal(u.origin, address, 'Independent test must never access the candidate or external HTTP.');
  return oldFetch(u, init); };
let serial = 0;
const runCase = async (name, work) => {
  const row = { name, passed: false };
  try { await work(row); row.passed = true; }
  catch (error) { row.failure = String(error.stack ?? error); throw error; }
  finally { if (active) { row.requests = clone(active.requests); row.peerWrites = active.peerWrites; row.flushes = active.flushes;
    row.publications = active.publications; row.peerErrors = active.peerErrors; assert.deepEqual(active.peerErrors, []); }
    report.cases.push(row); }
};
function fixture(targetRef = { kind: 'main' }, options = {}) {
  app.useLcosDropStore.getState().reset();
  const f = { targetRef, requests: [], peerErrors: [], flushes: 0, publications: 0, peerWrites: 0,
    placed: null, losePost: false, legacyCalls: 0, refreshes: [], ...options };
  f.graph = { project: { id: 'project' }, scopes: [{ id: 'scope', projectId: 'project' }],
    artifacts: [{ id: 'artifact', projectId: 'project', currentRevisionId: 'r1', availability: 'available' }],
    artifactRevisions: [{ id: 'r1', artifactId: 'artifact', status: 'current', fileRecordId: 'file-r1', contentHash: 'existing-content-proof' }],
    fileRecords: [{ id: 'file-r1', projectId: 'project', availability: 'current', observedHash: 'existing-content-proof' }],
    artifactViews: [{ id: 'source-view', artifactId: 'artifact', scopeId: 'scope', revisionId: 'r1' }] };
  f.nodes = [{ id: 'old-node', type: 'text', position: { x: 7, y: 9 }, data: { text: 'unsaved original user content' } }]; f.edges = [];
  const api = { getNodes: () => f.nodes, getEdges: () => f.edges,
    getViewport: () => ({ x: 11, y: 17, zoom: 1.5 }), getZoom: () => 1.5,
    screenToFlowPosition: () => { throw new Error('Released world point must not be recomputed.'); },
    findMaterialPlacement: () => { throw new Error('An exact released point cannot become auto placement.'); },
    flushCanvas: async canvasId => { assert.equal(canvasId, 'canvas'); f.flushes++; return 'saved'; },
    synchronizeMaterialProjection: async (value, { isCurrent }) => {
      f.publications++; assert.equal(isCurrent(), true); assert.equal(value.canvasId, 'canvas');
      assert.equal(value.artifactId, 'artifact'); assert.equal(value.artifactViewId, 'placed-view'); assert.equal(value.revisionId, 'r1');
      if (!f.nodes.some(n => n.id === value.node.id)) f.nodes.push(clone(value.node)); return { ok: true };
    } };
  f.release = { projectId: 'project', canvasId: 'canvas', workspaceId: 'workspace', surface: targetRef.kind === 'workspace' ? 'context' : targetRef.kind, api };
  f.current = { ...f.release };
  const store = app.useLcosDropStore;
  const asset = { id: 'artifact', name: '明确合成准确图', asset_type: 1, lcos_projection: { project_id: 'project', artifact_id: 'artifact',
    presented_revision_id: 'r1', current_revision_id: 'r1', artifact_view_id: 'source-view', file_record_id: 'file-r1',
    content_available: true, referenceable: true,
    assembly_item: { kind: 'artifact', title: '明确合成准确图', entityRef: { type: 'artifact', id: 'artifact', viewId: 'source-view' }, presentedRevisionId: 'r1', mimeType: 'image/png' } } };
  const notices = [];
  assert.equal(app.beginNativeLibraryAssemblyDrop({ clientX: 12, clientY: 23, dataTransfer: { effectAllowed: 'move', setData() {} },
    preventDefault() {}, stopPropagation() {} }, asset, { readOrigin: () => f.release, read: () => store.getState(),
    acquire: payload => store.getState().begin(payload), cancel: () => store.getState().cancel(), notice: n => notices.push(n) }), 'started');
  assert.deepEqual(notices, []);
  f.payload = store.getState().state.payload; f.tx = `tx-${++serial}`;
  f.intent = { kind: 'assembly-apply', targetId: 'original-target', sourceRefs: [{ kind: 'artifactView', id: 'source-view' }],
    targetRef: clone(targetRef), ...(targetRef.kind === 'conversation' ? {} : { placementPoint: { x: 321.25, y: -127.5 } }) };
  f.target = { targetId: f.intent.targetId, label: '原接收器', kind: targetRef.kind === 'conversation' ? 'collaboration-reference' : 'canvas', priority: 10,
    rect: { left: 0, top: 0, width: 1000, height: 800 }, enabled: true,
    semantic: targetRef.kind === 'conversation' ? { kind: 'collaboration-reference', conversationId: targetRef.id } : { kind: 'canvas', targetRef: clone(targetRef) } };
  store.getState().registerTarget(f.target);
  store.getState().setBounds({ left: 0, right: 1000, top: 0, bottom: 800 });
  store.getState().advance({ x: 600, y: 400 }, true, 1, { targetId: f.intent.targetId, previewPoint: { x: 600, y: 400 } },
    { status: 'ready', intent: f.intent }, f.intent.placementPoint);
  store.getState().commitAt(f.tx); assert.equal(store.getState().state.status, 'committing');
  f.ports = { current: () => f.current,
    gesture: (payload, tx, targetId, recovery) => {
      const s = store.getState();
      if (recovery) return s.state.status !== 'committing' && s.feedback?.attempt.payload === payload
        && s.feedback.receipt.transactionId === tx && s.feedback.receipt.targetId === targetId;
      return s.state.status === 'committing' && s.state.payload === payload && s.state.transactionId === tx
        && s.resolution?.intent.targetId === targetId;
    }, target: id => store.getState().targets().find(t => t.targetId === id),
    refreshConversation: (...args) => f.refreshes.push(args) };
  f.dispatcher = app.createNativeLibraryMaterialDispatcher(f.release, f.payload, f.tx, f.ports);
  f.router = new app.DropCommitRouter();
  f.owners = { projectId: 'project', handleNativeLibraryMaterial: f.dispatcher.handle,
    applyAssembly: async () => { f.legacyCalls++; throw new Error('Captured exact material cannot fall through to legacy Assembly.'); },
    addComposerReference: async () => { throw new Error('Undeclared Composer owner.'); },
    receivePortal: async () => { f.legacyCalls++; throw new Error('Captured source cannot use mutable remote View owner.'); },
    receiveRailway: async () => { f.legacyCalls++; throw new Error('Captured source cannot use mutable remote View owner.'); } };
  f.commit = signal => f.router.commit(f.intent, f.tx, f.owners, signal);
  f.settle = receipt => { store.getState().settle(receipt); return store.getState().feedback; };
  active = f; return f;
}
async function recover(f, signal = new AbortController().signal) {
  const feedback = app.useLcosDropStore.getState().feedback;
  assert.equal(app.canCheckNativeLibraryDropReceipt(feedback), true);
  const result = await app.checkNativeLibraryDropReceipt(feedback, signal);
  assert.equal(app.useLcosDropStore.getState().confirmNativeLibraryPlacementReceipt(f.tx, result), true);
  return result;
}
function facts(f) { return { requests: clone(f.requests), peerWrites: f.peerWrites, flushes: f.flushes, publications: f.publications, nodes: clone(f.nodes) }; }
try {
  const entry = path.join(temporary, 'entry.ts'), bundle = path.join(temporary, 'entry.mjs');
  await writeFile(entry, [
    `export * from ${JSON.stringify(path.join(root, 'lab/pilot/native-library-material-dispatch.ts'))};`,
    `export * from ${JSON.stringify(path.join(root, 'lab/pilot/native-library-drop.ts'))};`,
    `export {create} from 'zustand';`,
    `export {advanceDropIntent,beginDrop,completeDropDwell,confirmDrop,failDrop,idleDrop,nominalAnchorAt} from '@local-creative-os/web-gen2';`,
    `export {railwayStableKeyV1} from '@local-creative-os/contracts';`,
    `export * from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/drop/dropAssemblyReceipt.ts'))};`,
    `export * from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/drop/dropIntentResolver.ts'))};`,
    `export * from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/professional/assemblyApplyReview.ts'))};`,
    `export {DropTargetRegistry} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/drop/dropTargetRegistry.ts'))};`,
  ].join('\n'));
  // Product source transforms are intentionally browser-only in buildPilotEntry.
  // Compile its actual dependencies once, then execute the entire transformed
  // original Router/store with those same module identities, as the owner
  // regression does. No copied Router or queue implementation is substituted.
  await buildPilotEntry(path.relative(root, entry), bundle, 'node');
  report.provenance = JSON.parse(await readFile(bundle + '.sources.json', 'utf8'));
  const dependencies = await import(pathToFileURL(bundle));
  const esbuild = createRequire(path.join(currentGen2Root, 'package.json'))('esbuild');
  const owners = {};
  for (const [resource, transform] of Object.entries(createNativeLibraryDropOwnerSourceTransforms())) {
    const sourcePath = path.join(root, resource), selected = readCurrentGen2Resource(sourcePath);
    const original = selected?.contents ?? await readFile(sourcePath, 'utf8');
    if (resource.endsWith('/dropCommitRouter.ts')) {
      assert.ok(selected?.sourcePath.includes('LCOS_GEN2_GUI_RECOVERY_20260926'));
      report.selectedRouter = { copiedPath: sourcePath, sourcePath: selected.sourcePath };
    }
    const transformed = transform(original, { sourcePath });
    const code = (await esbuild.transform(transformed, { loader: 'ts', format: 'cjs', target: 'node22' })).code;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(specifier => {
      assert.ok(['@local-creative-os/contracts', '@local-creative-os/web-gen2', 'zustand', './dropAssemblyReceipt', './dropIntentResolver',
        '../professional/assemblyApplyReview', './drop/dropAssemblyReceipt', './drop/dropTargetRegistry'].includes(specifier)
        || specifier.endsWith('/lab/pilot/native-library-drop'), 'Unexpected original owner dependency: ' + specifier);
      return dependencies;
    }, module, module.exports);
    Object.assign(owners, module.exports);
  }
  app = { ...dependencies, ...owners };
  for (const target of [{ kind: 'main' }, { kind: 'context', id: 'scope' }, { kind: 'workflow', id: 'scope' }, { kind: 'workspace', id: 'workspace' }])
    await runCase(`actual original Router: ${target.kind} exact producer, one POST, captured release point`, async row => {
      const f = fixture(target), before = clone(f.nodes), first = f.commit(), duplicate = f.commit();
      assert.equal(first, duplicate, 'The original transaction de-duplication encloses the real dispatcher.');
      const result = await first; assert.equal(result.status, 'success', JSON.stringify(result)); f.settle(result);
      assert.equal(f.requests.filter(r => r.method === 'POST').length, 1); assert.equal(f.peerWrites, 1); assert.equal(f.flushes, 1);
      assert.equal(f.legacyCalls, 0); assert.deepEqual(f.nodes[0], before[0]);
      assert.deepEqual(f.placed.node.position, { x: 321.25, y: -127.5 });
      const post = f.requests.find(r => r.method === 'POST'); assert.ok(post.path.endsWith(target.kind === 'workspace' ? ':place' : ':receive'));
      assert.deepEqual(post.body.position, f.intent.placementPoint); assert.notDeepEqual(post.body.position, { x: 12, y: 23 });
      row.receipt = clone(result);
    });
  await runCase('Glyth uses canonical identity + durable relation, no node publication', async row => {
    const f = fixture({ kind: 'conversation', id: 'conversation' }), before = clone(f.nodes), result = await f.commit(); f.settle(result);
    assert.equal(result.status, 'success', JSON.stringify(result)); assert.equal(f.publications, 0); assert.deepEqual(f.nodes, before);
    assert.equal(f.requests.filter(r => r.method === 'POST').length, 1); assert.equal(f.requests.filter(r => r.path.endsWith('/identity')).length, 1);
    assert.equal(f.placed.relation.sourceEntityId, 'conversation-artifact'); assert.deepEqual(f.refreshes, [['project', 'conversation']]);
    assert.equal('position' in f.requests.find(r => r.method === 'POST').body, false); row.receipt = clone(result);
  });
  await runCase('Composer exact admission is Graph-only; input/key/source changes reject', async row => {
    const f = fixture();
    const intent = { kind: 'composer-reference', targetId: f.intent.targetId, inputKey: 'same-message-input', intent: 'delegate', reference: f.payload.reference };
    f.target.semantic = { kind: 'composer-reference', inputKey: intent.inputKey, intent: intent.intent };
    app.useLcosDropStore.getState().registerTarget(f.target);
    let inputCurrent = true;
    await f.dispatcher.admitComposer(intent, undefined, () => inputCurrent);
    assert.equal(f.requests.length, 1); assert.ok(f.requests[0].path.endsWith('/graph'));
    assert.equal(f.flushes, 0); assert.equal(f.publications, 0); assert.equal(f.peerWrites, 0);
    for (const wrong of [{ ...intent, inputKey: 'later-message' }, { ...intent, reference: { ...intent.reference, revisionId: 'r2' } },
      { ...intent, references: [intent.reference, intent.reference] }])
      await assert.rejects(() => f.dispatcher.admitComposer(wrong, undefined, () => inputCurrent));
    inputCurrent = false; await assert.rejects(() => f.dispatcher.admitComposer(intent, undefined, () => inputCurrent));
    assert.equal(f.requests.length, 1); row.graphAdmissionOnly = true;
  });
  for (const branch of ['portalReceive', 'railwayReceive', 'railwayDestinationRef'])
    await runCase(`captured ${branch} refuses legacy/mutable routing`, async () => {
      const f = fixture(); f.intent[branch] = branch === 'railwayDestinationRef' ? { kind: 'worksite', projectId: 'project', worksiteId: 'elsewhere' } : true;
      const result = await f.commit(); assert.equal(result.status, 'failed'); assert.equal(f.legacyCalls, 0); assert.equal(f.requests.length, 0);
    });
  for (const target of [{ kind: 'main' }, { kind: 'workspace', id: 'workspace' }])
    await runCase(`${target.kind}: peer commits then loses POST; old aborted signal → fresh-signal GET-only recovery`, async row => {
      const f = fixture(target, { losePost: true }), controller = new AbortController(), first = f.commit(controller.signal);
      // Mutable caller objects are not the captured released point.
      await new Promise(resolve => setImmediate(resolve));
      const result = await first; assert.equal(result.status, 'partial', JSON.stringify(result));
      assert.equal(f.peerWrites, 1); assert.ok(f.lostCommittedResponse); const feedback = f.settle(result);
      assert.equal(feedback.attempt.payload, f.payload); assert.equal(feedback.receipt.assemblyItems, undefined);
      assert.equal(feedback.receipt.retrySourceRefs, undefined); assert.equal(app.canCheckNativeLibraryDropReceipt(feedback), true);
      const before = facts(f); controller.abort();
      f.intent.placementPoint.x = 9999; f.intent.placementPoint.y = 8888;
      const checked = await recover(f); assert.equal(checked.status, 'success', JSON.stringify(checked));
      assert.equal(f.peerWrites, before.peerWrites); assert.equal(f.flushes, before.flushes);
      assert.equal(f.requests.filter(r => r.method === 'POST').length, 1); assert.deepEqual(f.placed.node.position, { x: 321.25, y: -127.5 });
      assert.equal(app.useLcosDropStore.getState().state.status, 'idle'); assert.equal(app.canCheckNativeLibraryDropReceipt(app.useLcosDropStore.getState().feedback), false);
      row.beforeCheck = before; row.afterCheck = facts(f);
    });
  await runCase('caller mutates placement during slow Graph GET: captured release point is unchanged', async row => {
    const f = fixture({ kind: 'main' }, { graphRead: deferred(), graphGate: deferred() });
    const pending = f.commit(); await f.graphRead.promise;
    f.intent.placementPoint.x = -8888; f.intent.placementPoint.y = 7777; f.graphGate.resolve();
    const result = await pending; assert.equal(result.status, 'success', JSON.stringify(result)); f.settle(result);
    assert.deepEqual(f.requests.find(r => r.method === 'POST').body.position, { x: 321.25, y: -127.5 });
    assert.deepEqual(f.placed.node.position, { x: 321.25, y: -127.5 }); row.receipt = clone(result);
  });
  await runCase('HTTP 200 committed but original publication refuses: partial, then GET-only readback publication', async row => {
    const f = fixture();
    const publish = f.release.api.synchronizeMaterialProjection;
    f.release.api.synchronizeMaterialProjection = async () => { f.publications++; return { ok: false, reason: 'Controlled original publication owner has not accepted the receipt.' }; };
    const result = await f.commit(); assert.equal(result.status, 'partial', JSON.stringify(result)); f.settle(result);
    assert.equal(f.peerWrites, 1); assert.equal(f.nodes.length, 1);
    const before = facts(f); f.release.api.synchronizeMaterialProjection = publish;
    const checked = await recover(f); assert.equal(checked.status, 'success'); assert.equal(f.nodes.length, 2);
    assert.equal(f.peerWrites, 1); assert.equal(f.flushes, before.flushes); assert.equal(f.requests.filter(r => r.method === 'POST').length, 1);
    row.beforeCheck = before; row.afterCheck = facts(f);
  });
  const changes = {
    api: f => { f.current = { ...f.current, api: {} }; },
    canvas: f => { f.current = { ...f.current, canvasId: 'new-canvas' }; },
    workspace: f => { f.current = { ...f.current, workspaceId: 'new-workspace' }; },
    target: f => { app.useLcosDropStore.getState().registerTarget({ ...f.target, semantic: { kind: 'canvas', targetRef: { kind: 'workflow', id: 'another-scope' } } }); },
    gesture: () => { app.useLcosDropStore.getState().cancel(); },
  };
  await runCase('slow source Graph GET: API/canvas/workspace/target/gesture changes reject before producer POST', async row => {
    row.subcases = [];
    for (const [name, mutate] of Object.entries(changes)) {
      const f = fixture({ kind: 'main' }, { graphRead: deferred(), graphGate: deferred() });
      const pending = f.commit(); await f.graphRead.promise; mutate(f); f.graphGate.resolve();
      const result = await pending; assert.equal(result.status, 'failed', name); assert.equal(f.peerWrites, 0); assert.equal(f.flushes, 0);
      row.subcases.push({ name, result: clone(result), facts: facts(f) });
    }
  });
  await runCase('old unknown feedback cannot check into a new API/canvas/workspace/target/gesture', async row => {
    row.subcases = [];
    for (const [name, mutate] of Object.entries(changes)) {
      const f = fixture({ kind: 'main' }, { losePost: true }), result = await f.commit(); assert.equal(result.status, 'partial'); f.settle(result);
      const feedback = app.useLcosDropStore.getState().feedback, before = facts(f); mutate(f);
      const checked = await app.checkNativeLibraryDropReceipt(feedback, new AbortController().signal);
      assert.equal(checked.status, 'partial', name); assert.equal(f.requests.length, before.requests.length);
      assert.equal(app.canCheckNativeLibraryDropReceipt({ ...feedback, receipt: checked }), true,
        'A temporarily unavailable original owner must retain the read-only recovery closure.');
      assert.equal(f.flushes, before.flushes); assert.equal(f.peerWrites, 1);
      row.subcases.push({ name, result: clone(checked), facts: facts(f) });
    }
  });
  await runCase('Composer exact reference is rechecked after slow Graph admission', async row => {
    row.subcases = [];
    for (const mutation of ['reference-revision', 'references-length']) {
      const f = fixture({ kind: 'main' }, { graphRead: deferred(), graphGate: deferred() });
      const intent = { kind: 'composer-reference', targetId: f.intent.targetId, inputKey: 'same-input', intent: 'delegate',
        reference: { ...f.payload.reference }, references: [{ ...f.payload.reference }] };
      f.target.semantic = { kind: 'composer-reference', inputKey: intent.inputKey, intent: intent.intent };
      app.useLcosDropStore.getState().registerTarget(f.target);
      const pending = f.dispatcher.admitComposer(intent, undefined, () => true);
      await f.graphRead.promise;
      if (mutation === 'reference-revision') intent.reference.revisionId = 'r2';
      else intent.references.push({ ...f.payload.reference });
      f.graphGate.resolve(); await assert.rejects(() => pending);
      assert.equal(f.requests.length, 1); assert.equal(f.peerWrites, 0); assert.equal(f.flushes, 0);
      row.subcases.push({ mutation, facts: facts(f) });
    }
  });
  await runCase('owned source View advanced after lost commit: exact existing GET recovers; foreign source cannot', async row => {
    row.subcases = [];
    for (const mode of ['owned-advanced', 'foreign-artifact', 'foreign-scope']) {
      const f = fixture({ kind: 'main' }, { losePost: true }), result = await f.commit(); assert.equal(result.status, 'partial'); f.settle(result);
      const before = facts(f);
      f.graph.artifactViews[0].revisionId = 'r2';
      if (mode === 'foreign-artifact') f.graph.artifactViews[0].artifactId = 'foreign-artifact';
      if (mode === 'foreign-scope') f.graph.scopes[0].projectId = 'foreign-project';
      const checked = await recover(f);
      assert.equal(checked.status, mode === 'owned-advanced' ? 'success' : 'partial');
      assert.equal(f.peerWrites, 1); assert.equal(f.flushes, before.flushes);
      assert.equal(f.requests.filter(r => r.method === 'POST').length, 1);
      if (mode !== 'owned-advanced') assert.equal(f.requests.length, before.requests.length + 1, 'Foreign source stops at Graph; it cannot inspect/adopt a target receipt.');
      row.subcases.push({ mode, result: clone(checked), facts: facts(f) });
    }
  });
  await runCase('advanced source with absent result rejects new material POST; no Current substitution', async row => {
    const f = fixture(); f.graph.artifactViews[0].revisionId = 'r2';
    const result = await f.commit(); assert.equal(result.status, 'failed'); assert.equal(f.peerWrites, 0);
    assert.equal(f.requests.filter(r => r.method === 'POST').length, 0); row.receipt = clone(result);
  });
  await runCase('noncaptured source alone returns undefined; captured wrong tx/multi-source/aborted gesture rejects', async () => {
    const f = fixture();
    const noncaptured = app.createNativeLibraryMaterialDispatcher(f.release, { kind: 'assembly' }, f.tx, f.ports);
    assert.equal(await noncaptured.handle(f.intent, f.tx), undefined);
    assert.equal((await f.dispatcher.handle(f.intent, 'wrong-tx')).status, 'failed');
    assert.equal((await f.dispatcher.handle({ ...f.intent, sourceRefs: [...f.intent.sourceRefs, { kind: 'artifactView', id: 'second' }] }, f.tx)).status, 'failed');
    const stop = new AbortController(); stop.abort(); assert.equal((await f.dispatcher.handle(f.intent, f.tx, stop.signal)).status, 'failed');
    assert.equal(f.requests.length, 0); assert.equal(f.peerWrites, 0);
  });
  report.passed = true;
} catch (error) { report.failure = String(error.stack ?? error); process.exitCode = 1; }
finally {
  globalThis.fetch = oldFetch;
  await new Promise(resolve => peer.close(resolve));
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.map(row => ({ name: row.name, passed: row.passed })), output, failure: report.failure }, null, 2));
}
