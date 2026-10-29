import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { Server } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeBase = path.join(root, '.runtime'); await fs.mkdir(runtimeBase, { recursive: true });
const temp = await fs.mkdtemp(path.join(runtimeBase, 'native-material-placement-test-'));
const originalFetch = globalThis.fetch;
const report = { passed: false, mode: 'real disposable Core + original Gen2Host / ProjectToSpaceProjection + real Huabu executor; VM of actual O8 receipt helper',
  cases: [], writes: ['synthetic current text revision', 'synthetic additional Views and Workspace memberships', 'synthetic original projector carriers'],
  modelsExecuted: false, rawSql: false, originalDataTouched: false, liveRuntimeBuilt: false };
process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1';
const allowedOrigins = () => new Set(process._getActiveHandles().filter(handle => handle instanceof Server && handle.listening).flatMap(handle => {
  const a = handle.address(); return a && typeof a !== 'string' && ['127.0.0.1', '::1'].includes(a.address)
    ? [`http://${a.address === '::1' ? '[::1]' : a.address}:${a.port}`] : [];
}));
globalThis.fetch = (address, options) => {
  const u = new URL(address instanceof Request ? address.url : String(address));
  if (!allowedOrigins().has(u.origin) || ['56238', '17879', '17880', '17881'].includes(u.port)) throw new Error('Test refused an unowned endpoint.');
  return originalFetch(address, options);
};
let facade;
try {
  const fixtureEntry = path.join(temp, 'fixture.ts');
  const relative = file => path.relative(temp, path.join(root, file)).replaceAll('\\', '/');
  await fs.writeFile(fixtureEntry, [
    `export {startSurfaceCoreFacade} from ${JSON.stringify(relative('lab/pilot/surface-core-facade.ts'))};`,
    `export {Gen2Host} from ${JSON.stringify(relative('lcos/apps/web-gen2/src/host/projectionFacade.ts'))};`,
    `export {HttpClient} from ${JSON.stringify(relative('lcos/apps/web-gen2/src/backend/client.ts'))};`,
    `export {createHeadlessProjectionPort} from ${JSON.stringify(relative('lab/pilot/headless-projection-port.ts'))};`,
    `export {createNativeMaterialPlacement} from ${JSON.stringify(relative('lab/pilot/native-material-placement.ts'))};`,
    `export {placeNativeLibraryMaterial,nativeMaterialPlacementPoint,locateNativeMaterialNodes} from ${JSON.stringify(relative('lab/pilot/native-material-placement-client.ts'))};`,
  ].join('\n'));
  const bundle = path.join(temp, 'fixture.mjs'); await buildPilotEntry(path.relative(root, fixtureEntry), bundle, 'node', { coreCollectionTitle: true });
  const module = await import(pathToFileURL(bundle));
  facade = await module.startSurfaceCoreFacade({ runtimeRoot: path.join(temp, 'owned'), publicOrigin: 'http://127.0.0.1:19917',
    fullIntegration: true, nativeCollectionPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeRailPilot: true });
  const { repository, origin: coreOrigin, projectId } = facade.core;
  const call = async (method, url, body) => {
    const response = await facade.handle({ method, url, body }); assert.ok(response, method + url); return response;
  };
  const canvas = async id => { const response = await call('GET', '/api/canvas/v1/canvases/' + id); assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body.data; };
  const main = await canvas('surface-core-main'), destination = await canvas('surface-core-context');
  const mainNode = main.nodes.find(node => node.id === 'surface-main-text');
  const historical = { ...mainNode.data.lcos_ref };
  const oldFile = repository.getArtifactRevision(historical.revisionId).fileRecordId;
  const workspace = repository.getWorkspaces(projectId).find(row => row.canvasId === destination.id);
  const input = { projectId, workspaceId: String(workspace.id), artifactId: historical.artifactId,
    revisionId: historical.revisionId, fileRecordId: String(oldFile) };
  const write = await call('PUT', `/api/lcos/core/projects/${projectId}/curation/canvas-text`, {
    canvasId: main.id, spatialId: mainNode.id, artifactId: historical.artifactId, expectedRevisionId: historical.revisionId,
    body: '人工后续版本：旧版本投放不得改用这段 Current。',
  });
  assert.equal(write.status, 200, JSON.stringify(write.body));
  assert.notEqual(repository.getArtifact(input.artifactId).currentRevisionId, input.revisionId);
  const hosts = new Map(); let projectorCalls = 0, blockProjector = false;
  const hostFor = id => {
    if (!hosts.has(id)) hosts.set(id, new module.Gen2Host({ projectId, http: new module.HttpClient({ baseUrl: coreOrigin }),
      rfs: module.createHeadlessProjectionPort({ canvasId: id, coreOrigin, ...facade.spatial }) }));
    const real = hosts.get(id);
    return { artifacts: real.artifacts, assembly: real.assembly,
      nodeProjector: { async projectEntity(value) { projectorCalls++; if (blockProjector) throw new Error('Synthetic interruption after membership.'); return real.nodeProjector.projectEntity(value); } } };
  };
  const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
  const placement = module.createNativeMaterialPlacement({ repository, projectId, projectionHost: hostFor,
    spatial: facade.spatial, projectNativeNodes: async id => (await canvas(id)).nodes, fail });
  assert.equal((await placement.inspect(destination.id, input)).state, 'absent');
  const result = await placement.place(destination.id, input);
  assert.equal(result.state, 'present'); assert.equal(result.node.data.lcos_ref.revisionId, input.revisionId);
  assert.equal(result.node.data.text, mainNode.data.text, 'historical full text comes from its real immutable FileRecord');
  assert.equal(result.binding.entityType, 'view');
  assert.equal(repository.getArtifactView(result.artifact_view_id).referenceKind, 'explicit_additional');
  assert.ok(repository.listProjectWorkspaceMemberships(projectId).some(row => String(row.workspaceId) === input.workspaceId && String(row.artifactViewId) === result.artifact_view_id));
  assert.equal(projectorCalls, 1); report.cases.push('historical revision with no View: real additional View, workspace membership, original projector binding and native full body');
  const count = (await canvas(destination.id)).nodes.length;
  const repeated = await placement.place(destination.id, input);
  assert.equal(repeated.already_present, true); assert.equal(repeated.node.id, result.node.id);
  assert.equal((await canvas(destination.id)).nodes.length, count); assert.equal(projectorCalls, 1);
  report.cases.push('repeat uses exact existing carrier without another projector write');
  const address = `/api/lcos/canvases/${destination.id}/materials:place`;
  const routeRead = await call('GET', address + '?' + new URLSearchParams(input));
  assert.equal(routeRead.status, 200, JSON.stringify(routeRead.body));
  assert.equal(routeRead.body.data.node.id, result.node.id);
  const routeRepeat = await call('POST', address, input);
  assert.equal(routeRepeat.status, 200, JSON.stringify(routeRepeat.body));
  assert.equal(routeRepeat.body.data.already_present, true);
  assert.equal((await call('DELETE', address, input)).status, 405);
  assert.equal((await call('POST', address, { ...input, workspaceId: 'foreign' })).status, 409);
  assert.equal((await call('POST', address, { ...input, position: null })).status, 400);
  report.cases.push('production facade GET/POST route reads and reuses exact carrier; wrong Workspace and unrelated methods refuse');
  const after = await canvas(destination.id);
  for (const old of destination.nodes) assert.deepEqual(after.nodes.find(node => node.id === old.id), old, 'existing saved nodes and geometry remain unchanged');
  await assert.rejects(placement.place(destination.id, { ...input, workspaceId: 'foreign' }), /Workspace/);
  await assert.rejects(placement.place(destination.id, { ...input, fileRecordId: 'foreign' }), /version/);
  assert.equal(projectorCalls, 1); report.cases.push('wrong Workspace/FileRecord refuses before projection');

  const workflow = repository.getWorkspaces(projectId).find(row => row.canvasId === 'surface-core-workflow');
  const partialInput = { ...input, workspaceId: String(workflow.id) };
  for (const override of [{ availability: 'stale' }, { availability: 'missing' }, { availability: 'unreadable' }, { observedHash: 'different-existing-metadata' }]) {
    const mismatched = new Proxy(repository, { get(target, key) {
      if (key === 'getFileRecord') return id => ({ ...repository.getFileRecord(id), ...override });
      const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
    const invalid = module.createNativeMaterialPlacement({ repository: mismatched, projectId, projectionHost: hostFor,
      spatial: facade.spatial, projectNativeNodes: async id => (await canvas(id)).nodes, fail });
    await assert.rejects(invalid.place('surface-core-workflow', partialInput), /version/);
  }
  const missingBytes = module.createNativeMaterialPlacement({ repository, projectId,
    projectionHost: id => ({ ...hostFor(id), artifacts: { getFileRecordContent: async () => { throw new Error('Synthetic missing source bytes'); } } }),
    spatial: facade.spatial, projectNativeNodes: async id => (await canvas(id)).nodes, fail });
  const expectedView = 'view:native-library:' + [partialInput.workspaceId, partialInput.artifactId, partialInput.revisionId].map(encodeURIComponent).join(':');
  await assert.rejects(missingBytes.place('surface-core-workflow', partialInput), /missing source bytes/);
  assert.equal(repository.getArtifactView(expectedView), undefined, 'source read failure precedes any new View/membership');
  assert.equal(projectorCalls, 1);
  report.cases.push('stale/missing/unreadable source and existing metadata hash mismatch refuse before writes; missing contained bytes creates no View');
  blockProjector = true;
  await assert.rejects(placement.place('surface-core-workflow', partialInput), /Synthetic interruption/);
  const callsAfterPartial = projectorCalls;
  assert.equal((await placement.inspect('surface-core-workflow', partialInput)).state, 'partial');
  await assert.rejects(placement.place('surface-core-workflow', partialInput), /partially recorded/);
  assert.equal(projectorCalls, callsAfterPartial); blockProjector = false;
  report.cases.push('partial canonical receipt is inspectable and never silently replays projection');

  // Run the actual receipt helper and native synchronizer. Unrelated objects,
  // every historic draft/position/selection and connection array stay intact.
  const intentSource = await fs.readFile(path.join(root, 'lab/startup-history-intent.js'), 'utf8');
  const sandbox = { window: {}, structuredClone, Date, crypto: { randomUUID: () => 'synthetic-unused' } };
  vm.runInNewContext(intentSource, sandbox);
  const intent = sandbox.window.__LCOS_NATIVE_INTENT__;
  const prior = structuredClone(destination.nodes[0]); prior.selected = true;
  const currentNodesRef = { current: [prior] };
  const history = [{ state: { nodes: [structuredClone(prior)], connections: ['keep-edge'] } },
    { state: { nodes: [{ ...structuredClone(prior), position: { x: 500, y: 600 } }], connections: ['keep-other-edge'] } }];
  const historyBefore = structuredClone(history), beforeLive = currentNodesRef.current[0];
  const receipt = { receiptKind: 'material-projection', projectId, canvasId: destination.id, workspaceId: input.workspaceId,
    nodes: [result.node], history, currentNodesRef, setNodes: nodes => { currentNodesRef.current = nodes; }, suppress() {}, flushHistory() {} };
  assert.equal(intent.backfillHistoryReceipt(receipt).ok, true);
  assert.equal(currentNodesRef.current[0], beforeLive);
  for (let i = 0; i < history.length; i++) { assert.deepEqual(history[i].state.nodes[0], historyBefore[i].state.nodes[0]); assert.deepEqual(history[i].state.connections, historyBefore[i].state.connections); }
  assert.equal(currentNodesRef.current.at(-1).selected, undefined, 'live incoming selection is not invented');
  assert.equal(history[0].state.nodes.at(-1).selected, false);
  assert.equal(intent.backfillHistoryReceipt(receipt).idempotent, true);
  const changed = structuredClone(result.node); changed.data.lcos_ref.revisionId = 'other-version';
  const unchanged = JSON.stringify(history);
  assert.equal(intent.backfillHistoryReceipt({ ...receipt, nodes: [changed] }).ok, false);
  assert.equal(JSON.stringify(history), unchanged); report.cases.push('real O8 receipt helper: exact identity, old history/drafts/geometry/selection/edges preserved, idempotency and conflict no partial mutation');

  const bridgeSource = (await fs.readFile(path.join(root, 'lab/startup-node-bridge.js'), 'utf8')).replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
  const bridge = { Map, Set, JSON, Promise, setTimeout, clearTimeout };
  vm.runInNewContext(bridgeSource + '\nglobalThis.materialSync=createMaterialProjectionSynchronizer;', bridge);
  const api = { getNodes: () => currentNodesRef.current, getEdges: () => [] };
  let own = true, syncs = 0;
  const sync = bridge.materialSync({ api, ownerApi: api, getHost: () => ({ api, canvasId: destination.id, projectId }),
    normalizeNodes: nodes => nodes, backfillReceipt: value => { syncs++; return intent.backfillHistoryReceipt({ ...value, history, currentNodesRef,
      setNodes: nodes => { currentNodesRef.current = nodes; }, suppress() {}, flushHistory() {} }); } });
  const syncTarget = { projectId, canvasId: destination.id, workspaceId: input.workspaceId, artifactId: input.artifactId,
    artifactViewId: result.artifact_view_id, revisionId: input.revisionId, node: result.node };
  assert.equal((await sync(syncTarget, { isCurrent: () => own })).ok, true);
  own = false; assert.equal((await sync(syncTarget, { isCurrent: () => own })).ok, false); assert.equal(syncs, 1);
  report.cases.push('native bridge rejects late owner and does not invoke addNodes/camera/selection setters');

  // A successful O8 receipt can precede React publication. The synchronizer
  // must stay pending until the original owner's subscription observes it.
  const subscribers = new Set(); let visible = [], receiptCount = 0, published = false;
  const delayedApi = { getNodes: () => visible, getEdges: () => [], subscribeNative: callback => {
    subscribers.add(callback); return () => subscribers.delete(callback);
  } };
  let delayedOwner = true;
  const delayed = bridge.materialSync({ api: delayedApi, ownerApi: delayedApi,
    getHost: () => ({ api: delayedApi, canvasId: destination.id, projectId }), normalizeNodes: nodes => nodes,
    backfillReceipt: () => { receiptCount++; return { ok: true }; }, publicationTimeoutMs: 100 });
  const awaitingPublication = delayed(syncTarget, { isCurrent: () => delayedOwner }).then(value => { published = true; return value; });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(published, false); assert.equal(subscribers.size, 1);
  visible = [result.node]; for (const callback of [...subscribers]) callback();
  assert.equal((await awaitingPublication).ok, true); assert.equal(subscribers.size, 0); assert.equal(receiptCount, 1);
  visible = [];
  const switched = delayed(syncTarget, { isCurrent: () => delayedOwner });
  delayedOwner = false; for (const callback of [...subscribers]) callback();
  assert.equal((await switched).ok, false); assert.equal(subscribers.size, 0);
  delayedOwner = true;
  const timeoutSync = bridge.materialSync({ api: delayedApi, ownerApi: delayedApi,
    getHost: () => ({ api: delayedApi, canvasId: destination.id, projectId }), normalizeNodes: nodes => nodes,
    backfillReceipt: () => { receiptCount++; return { ok: true }; }, publicationTimeoutMs: 15 });
  assert.equal((await timeoutSync(syncTarget, { isCurrent: () => true })).ok, false);
  assert.equal(subscribers.size, 0); assert.equal(receiptCount, 3, 'no automatic replay after publication timeout');
  report.cases.push('delayed React publication is awaited; timeout and scene change clean subscription and never replay O8');

  // Client recovery is tested independently from the real Core producer above.
  const originalGuardedFetch = globalThis.fetch; const methods = [];
  const clientApi = { getNodes: () => currentNodesRef.current, getEdges: () => [], flushCanvas: async () => 'saved',
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }), findMaterialPlacement: () => ({ x: 1400, y: 0 }),
    synchronizeMaterialProjection: async value => { assert.equal(value.revisionId, input.revisionId); return { ok: true }; } };
  const clientTarget = { ...input, canvasId: destination.id };
  globalThis.fetch = async (_url, options = {}) => { methods.push(options.method ?? 'GET'); return Response.json({ code: 0, data: result }); };
  assert.equal((await module.placeNativeLibraryMaterial(clientTarget, { api: clientApi, isCurrent: () => true, readOnly: true })).status, 'already-present');
  assert.deepEqual(methods, ['GET']); methods.length = 0;
  globalThis.fetch = async (_url, options = {}) => { methods.push(options.method ?? 'GET'); return Response.json({ code: 0, data: { ...result, state: 'absent' } }); };
  assert.equal((await module.placeNativeLibraryMaterial(clientTarget, { api: clientApi, isCurrent: () => true, readOnly: true })).status, 'unconfirmed');
  assert.deepEqual(methods, ['GET']); methods.length = 0;
  globalThis.fetch = async (_url, options = {}) => { methods.push(options.method ?? 'GET'); if (options.method === 'POST') throw new Error('lost reply'); return Response.json({ code: 0, data: { ...result, state: 'absent' } }); };
  assert.equal((await module.placeNativeLibraryMaterial(clientTarget, { api: clientApi, isCurrent: () => true })).status, 'unconfirmed');
  assert.deepEqual(methods, ['GET', 'POST']); globalThis.fetch = originalGuardedFetch;
  report.cases.push('client read-only recovery never POSTs; lost write reply makes exactly one POST and stays unconfirmed');

  for (const position of [null, [], { x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: '12', y: 1 }, { x: 1 }, { x: 1, y: 2, z: 3 }]) {
    methods.length = 0;
    let flushed = 0;
    globalThis.fetch = async () => { methods.push('unexpected'); throw new Error('invalid release point must not reach transport'); };
    assert.equal((await module.placeNativeLibraryMaterial({ ...clientTarget, position }, {
      api: { ...clientApi, flushCanvas: async () => { flushed++; return 'saved'; } }, isCurrent: () => true,
    })).status, 'rejected');
    assert.equal(flushed, 0); assert.deepEqual(methods, []);
  }
  globalThis.fetch = originalGuardedFetch;
  report.cases.push('malformed/non-finite explicit release points refuse before flush or transport; never fall back to button placement');

  methods.length = 0;
  globalThis.fetch = async (_url, options = {}) => { methods.push(options.method ?? 'GET'); return Response.json({ code: 0, data: { ...result, state: 'absent' } }); };
  assert.equal((await module.placeNativeLibraryMaterial(clientTarget, { api: { ...clientApi, findMaterialPlacement: undefined }, isCurrent: () => true })).status, 'rejected');
  assert.deepEqual(methods, ['GET'], 'Missing reliable geometry cannot silently POST an origin/overlapping point');
  globalThis.fetch = originalGuardedFetch;

  let observedNode = structuredClone(result.node);
  const layoutApi = { ...clientApi, getNodes: () => [observedNode] };
  globalThis.fetch = async () => {
    observedNode = { ...observedNode, measured: { width: 360, height: 280 } };
    return Response.json({ code: 0, data: result });
  };
  assert.equal((await module.placeNativeLibraryMaterial(clientTarget, { api: layoutApi, isCurrent: () => true })).status, 'already-present');
  for (const patch of [{ position: { x: 800, y: 950 } }, { width: 700 }, { style: { width: 700 } }, { data: { ...result.node.data, text: '真实编辑，不得丢失' } }]) {
    observedNode = structuredClone(result.node); methods.length = 0;
    globalThis.fetch = async (_url, options = {}) => { methods.push(options.method ?? 'GET'); observedNode = { ...observedNode, ...patch }; return Response.json({ code: 0, data: result }); };
    const rejected = await module.placeNativeLibraryMaterial(clientTarget, { api: layoutApi, isCurrent: () => true });
    assert.equal(rejected.status, 'rejected'); assert.deepEqual(methods, ['GET']);
    for (const key of Object.keys(patch)) assert.deepEqual(observedNode[key], patch[key]);
  }
  globalThis.fetch = originalGuardedFetch;
  report.cases.push('ReactFlow measurement may settle during exact read; actual movement/resize/style/text edit still refuses and remains intact');
  const bounds = { left: 336, right: 960, top: 0, bottom: 1000 }, size = { width: 288, height: 224 };
  const blockers = [{ left: 327, top: 26, right: 607, bottom: 454 }, { left: 512, top: 349, right: 917, bottom: 664 },
    { left: 100, top: 300, right: 463, bottom: 618 }, { left: 326, top: 918, right: 634, bottom: 978 }];
  const blockersBefore = structuredClone(blockers);
  const point = module.nativeMaterialPlacementPoint(bounds, size, blockers);
  assert.ok(point.x >= bounds.left && point.y >= bounds.top && point.x + size.width <= bounds.right && point.y + size.height <= bounds.bottom);
  for (const box of blockers) assert.ok(point.x + size.width <= box.left || point.x >= box.right || point.y + size.height <= box.top || point.y >= box.bottom, 'new material footprint clears the existing node, original preview and dock');
  assert.deepEqual(blockers, blockersBefore);
  const empty = module.nativeMaterialPlacementPoint({ left: 0, right: 1000, top: 0, bottom: 800 }, { width: 360, height: 280 }, []);
  assert.deepEqual(empty, { x: 320, y: 260 }, 'screen center refers to the whole new node, not its top-left');
  assert.equal(module.nativeMaterialPlacementPoint({ left: 336, right: 520, top: 0, bottom: 800 }, { width: 360, height: 280 }, []), null,
    'both rails leave no full rectangle: never clamp an oversized node into a known overlap');
  assert.equal(module.nativeMaterialPlacementPoint({ left: 0, right: 1000, top: 0, bottom: 800 }, { width: 360, height: 280 },
    [{ left: 0, right: 1000, top: 0, bottom: 800 }]), null, 'a filled canvas has no knowingly overlapping fallback');
  report.cases.push('initial material rectangle fits visible canvas between both rails, clears existing node/preview/dock; camera and old geometry untouched');

  const priorDocument = globalThis.document;
  const canvasRect = { left: 0, right: 1000, top: 0, bottom: 800, width: 1000, height: 800 };
  const railRects = [{ left: 16, right: 336, top: 64, bottom: 740, width: 320, height: 676 },
    { left: 520, right: 1000, top: 0, bottom: 800, width: 480, height: 800 }];
  let focused;
  globalThis.document = { querySelector: () => ({ getBoundingClientRect: () => canvasRect }),
    querySelectorAll: () => railRects.map(rect => ({ getBoundingClientRect: () => rect })) };
  const world = { x: 3000, y: 500, width: 360, height: 280 }, focusApi = { ...clientApi,
    getNodesBounds: ids => { assert.deepEqual(ids, [result.node.id]); return world; },
    setViewport: async viewport => { focused = viewport; return true; } };
  try {
    assert.equal(await module.locateNativeMaterialNodes([result.node.id], { api: focusApi, isCurrent: () => true }), true);
    const screen = { left: world.x * focused.zoom + focused.x, right: (world.x + world.width) * focused.zoom + focused.x,
      top: world.y * focused.zoom + focused.y, bottom: (world.y + world.height) * focused.zoom + focused.y };
    assert.ok(screen.left >= 336 && screen.right <= 520 && screen.top >= 0 && screen.bottom <= 800,
      'Explicit original camera locate fits the whole material in the actual narrow area between both rails');
    const savedFocus = focused;
    assert.equal(await module.locateNativeMaterialNodes([result.node.id], { api: focusApi, isCurrent: () => false }), false);
    assert.equal(focused, savedFocus, 'A stale owner never moves the camera');
  } finally { if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument; }
  report.cases.push('existing locate uses original camera API with actual rail bounds; narrow-screen material is visible and late owner cannot move camera');

  // Freeze another real historical revision not present in the destination.
  // Then exercise the registered route and lose that one POST's reply.
  const middleId = String(repository.getArtifact(input.artifactId).currentRevisionId);
  const middleFile = String(repository.getArtifactRevision(middleId).fileRecordId);
  const createdTask = await call('POST', `/api/lcos/core/projects/${projectId}/runs`, {
    instruction: '人工验证任务：仅创建记录核对材料版本，不派发、不执行模型。', outputIntent: 'analyze',
    orderedReferences: [{ ref: { type: 'artifact', artifactId: input.artifactId, revisionId: input.revisionId }, order: 0 },
      { ref: { type: 'view', viewId: historical.artifactViewId }, order: 1 }],
  });
  assert.equal(createdTask.status, 201, JSON.stringify(createdTask.body));
  const taskReview = createdTask.body.value.review ?? createdTask.body.value;
  assert.equal(taskReview.run.status, 'created');
  const recipeResponse = await call('GET', `/api/lcos/core/runs/${encodeURIComponent(taskReview.run.id)}/recipe`);
  assert.equal(recipeResponse.status, 200, JSON.stringify(recipeResponse.body));
  const taskRecipe = recipeResponse.body.value;
  const manifestResponse = await call('GET', `/api/lcos/core/projects/${projectId}/context-manifests/v0/${encodeURIComponent(taskRecipe.contextManifestId)}`);
  assert.equal(manifestResponse.status, 200, JSON.stringify(manifestResponse.body));
  assert.equal((await call('PUT', `/api/lcos/core/projects/${projectId}/curation/canvas-text`, {
    canvasId: main.id, spatialId: mainNode.id, artifactId: input.artifactId, expectedRevisionId: middleId,
    body: '人工第三版本：投放中间历史版本不得使用这段 Current。',
  })).status, 200);
  const imageTarget = { projectId, canvasId: destination.id, workspaceId: input.workspaceId,
    artifactId: input.artifactId, revisionId: middleId, fileRecordId: middleFile, position: { x: -620.75, y: 1080.5 } };
  const releasedPosition = { ...imageTarget.position };
  own = true; methods.length = 0;
  const realClientApi = { ...clientApi, synchronizeMaterialProjection: (value, options) => sync(value, options) };
  globalThis.fetch = async (url, options = {}) => {
    if (/^https?:/.test(String(url))) return originalGuardedFetch(url, options);
    if (options.method === 'POST') assert.deepEqual(JSON.parse(options.body).position, releasedPosition);
    else assert.equal(new URL(String(url), 'http://127.0.0.1').searchParams.has('position'), false,
      'placement point is not part of the material identity or GET-only recovery');
    methods.push(options.method ?? 'GET');
    const response = await call(options.method ?? 'GET', String(url), options.body ? JSON.parse(options.body) : undefined);
    if (!options.method && response.body.data?.state === 'absent') imageTarget.position.x = 9000;
    if (options.method === 'POST') { assert.equal(response.status, 200, JSON.stringify(response.body)); throw new Error('Synthetic lost committed placement reply'); }
    return Response.json(response.body, { status: response.status });
  };
  const missingReply = await module.placeNativeLibraryMaterial(imageTarget, { api: realClientApi, isCurrent: () => true });
  assert.equal(missingReply.status, 'unconfirmed'); assert.deepEqual(methods, ['GET', 'POST']);
  const afterCommitted = (await canvas(destination.id)).nodes.length;
  methods.length = 0;
  const recovered = await module.placeNativeLibraryMaterial(imageTarget, { api: realClientApi, isCurrent: () => true, readOnly: true });
  assert.equal(recovered.status, 'already-present', JSON.stringify(recovered)); assert.deepEqual(methods, ['GET']);
  assert.equal((await canvas(destination.id)).nodes.length, afterCommitted);
  assert.equal(currentNodesRef.current.find(node => node.id === recovered.nodeId).data.lcos_ref.revisionId, imageTarget.revisionId);
  assert.deepEqual(currentNodesRef.current.find(node => node.id === recovered.nodeId).position, releasedPosition);
  assert.deepEqual(repository.getArtifactView(recovered.artifactViewId).position, releasedPosition,
    'Core View and original projector keep the exact point released before the asynchronous read');
  methods.length = 0;
  assert.equal((await module.placeNativeLibraryMaterial({ ...imageTarget, position: { x: 4, y: 5 } },
    { api: realClientApi, isCurrent: () => true })).status, 'already-present');
  assert.deepEqual(methods, ['GET']);
  assert.deepEqual(currentNodesRef.current.find(node => node.id === recovered.nodeId).position, releasedPosition,
    'dropping an already present material is not a hidden move or duplicate intention');
  globalThis.fetch = originalGuardedFetch;
  report.cases.push('registered route commits historical material at the exact released point once; lost POST reply recovers through GET + original O8 without another POST; later drop point cannot move or duplicate the existing carrier');
  const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
  const detailSource = await fs.readFile(path.join(root, 'lab/pilot/native-task-detail.tsx'), 'utf8');
  const detail = ts.createSourceFile('native-task-detail.tsx', detailSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const helper = detail.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'nativeTaskInputRows');
  const nonEmptyDeclaration = detail.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(detail) === 'nonEmpty'));
  const js = ts.transpileModule(nonEmptyDeclaration.getText(detail) + '\n' + helper.getText(detail).replace('export ', ''),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const rowsFor = new Function(js + '\nreturn nativeTaskInputRows;')();
  const graphResponse = await call('GET', `/api/lcos/core/projects/${projectId}/graph`);
  const persistedManifest = manifestResponse.body.value;
  const rows = rowsFor(taskRecipe, graphResponse.body.value, persistedManifest);
  const versions = rows.filter(row => row.material?.artifactId === input.artifactId).map(row => row.material.revisionId);
  assert.ok(versions.includes(input.revisionId)); assert.ok(versions.includes(middleId));
  assert.ok(!versions.includes(String(repository.getArtifact(input.artifactId).currentRevisionId)), 'task inputs never use later Current');
  assert.throws(() => rowsFor(taskRecipe, graphResponse.body.value, { ...persistedManifest, projectId: 'foreign' }), /owner/);
  assert.throws(() => rowsFor(taskRecipe, graphResponse.body.value, { ...persistedManifest, canonicalJson: '{}' }), /content/);
  assert.throws(() => rowsFor(taskRecipe, graphResponse.body.value), /owner/);
  const legacy = rowsFor({ ...taskRecipe, contextManifestId: undefined,
    orderedReferences: [{ ref: { type: 'view', viewId: historical.artifactViewId }, order: 0 }] }, graphResponse.body.value);
  assert.equal(legacy[0].material, undefined); assert.equal(legacy[0].unavailable, true);
  assert.equal(repository.getRun(taskReview.run.id).status, 'created');
  report.writes.push('synthetic created/planned Run and its real frozen manifest; never dispatched');
  report.cases.push('actual Core Run manifest pins explicit and then-Current View versions after Current advances; foreign/missing/malformed snapshots and unpinned legacy View do not create misleading links');
  report.passed = true;
} finally {
  await facade?.close(); globalThis.fetch = originalFetch;
  await fs.writeFile(path.join(runtimeBase, 'native-material-placement-test-report.json'), JSON.stringify(report, null, 2));
  if (!temp.startsWith(path.resolve(runtimeBase) + path.sep)) throw new Error('Unexpected test directory.');
  await fs.rm(temp, { recursive: true, force: true });
  console.log(JSON.stringify(report, null, 2));
}
