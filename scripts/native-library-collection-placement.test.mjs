import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(import.meta.dirname, '..');
const temp = await fs.mkdtemp(path.join(root, '.runtime/native-library-collection-'));
const output = path.join(root, 'output/原生库集合整合_20261017g');
const report = { passed: false, scope: 'production frontend client + actual original O8 Collection receipt owner; controlled HTTP responses, no candidate/Core writes',
  candidateWrites: 0, coreWrites: 0, models: 0, cases: [] };
const originalFetch = globalThis.fetch;
try {
  const bundle = path.join(temp, 'client.mjs');
  await buildPilotEntry('lab/pilot/native-library-collection-placement.ts', bundle);
  const client = await import(pathToFileURL(bundle));
  const historySource = await fs.readFile(path.join(root, 'lab/startup-history-intent.js'), 'utf8');
  const input = { projectId: 'project', canvasId: 'canvas', workspaceId: 'workspace', collectionId: 'collection' };
  const node = { id: 'original-pile', type: 'pile', position: { x: 123.25, y: 456.5 }, width: 248, height: 244,
    data: { id: 'original-pile', title: '合成集合', lcos_native_collection: true, memberIds: [],
      lcos_collection_ref: { ...input } } };
  const present = () => ({ ...Object.fromEntries(Object.entries(input).map(([key, value]) => [key.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase()), value])),
    state: 'present', presentation_received: true, provider_execution_started: false,
    binding: { projectId: input.projectId, canvasId: input.canvasId, spatialKind: 'node', spatialId: node.id, entityType: 'collection', entityId: input.collectionId }, node: structuredClone(node) });
  const absent = () => ({ ...present(), state: 'absent', presentation_received: false, binding: null, node: null });
  let fixture;
  const make = () => {
    const sandbox = {};
    new Function('window', historySource)(sandbox);
    const original = { id: 'kept-text', type: 'text', position: { x: 10, y: 20 }, width: 360, height: 250,
      selected: true, data: { id: 'kept-text', text: '保留后来输入的正文', locked: false } };
    let nodes = [original], current = true;
    const raw = { current: nodes }, history = [{ state: { nodes: structuredClone(nodes), edges: [] } }];
    const listeners = new Set(), requests = [], synchronizations = [], camera = { x: 17, y: 29, zoom: .8 };
    const api = { getNodes: () => nodes, getEdges: () => [{ id: 'kept-edge' }], getViewport: () => camera,
      getSelection: () => ({ nodeIds: ['kept-text'], edgeIds: [] }), getZoom: () => .8,
      findMaterialPlacement: () => ({ x: 123.25, y: 456.5 }), flushCanvas: async () => 'saved',
      subscribeNative(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      async synchronizeCollectionCarrier(value, { isCurrent }) {
        synchronizations.push(value);
        if (!isCurrent()) return { ok: false };
        return sandbox.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt({ receiptKind: 'collection-projection', ...value,
          history, getHistory: () => history, currentNodesRef: raw, flushHistory() {}, suppress() {},
          setNodes(next) { queueMicrotask(() => { nodes = next; for (const listener of listeners) listener(); }); } });
      },
    };
    fixture = { api, requests, synchronizations, raw, history, original, camera, listeners,
      current: () => current, changeScene() { current = false; }, nodes: () => nodes,
      edit() { nodes[0].data.text += ' · 用户新改动'; }, addLive(value) { nodes.push(value); raw.current = nodes; },
      handler: async (method) => method === 'POST' ? present() : absent() };
    globalThis.fetch = async (url, init = {}) => {
      const method = init.method ?? 'GET';
      requests.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
      const response = await fixture.handler(method, requests.at(-1));
      if (response instanceof Error) throw response;
      return { ok: true, json: async () => ({ code: 0, data: response }) };
    };
    return fixture;
  };
  const place = (f, extra = {}, readOnly = false) => client.placeNativeLibraryCollection({ ...input, ...extra }, { api: f.api, isCurrent: f.current, readOnly });
  const check = async (name, run) => { await run(); report.cases.push(name); console.log('PASS ' + name); };
  await check('first original pile: absent without Presentation → one POST at explicit point → actual O8 publication; old edits/selection/camera/history preserved', async () => {
    const f = make(), old = structuredClone(f.original), camera = structuredClone(f.camera);
    const result = await place(f, { position: { x: 44.25, y: -17.5 } });
    assert.equal(result.status, 'placed'); assert.equal(result.nodeId, node.id);
    assert.deepEqual(f.requests.map(row => row.method), ['GET', 'POST']);
    assert.deepEqual(f.requests[1].body, { collectionId: input.collectionId, position: { x: 44.25, y: -17.5 } });
    assert.equal(f.nodes().length, 2); assert.equal(f.nodes()[1].type, 'pile');
    assert.deepEqual(f.nodes()[0], old); assert.deepEqual(f.camera, camera);
    assert.equal(f.nodes()[1].selected, false); assert.equal(f.history.length, 1);
    assert.equal(f.history[0].state.nodes.length, 2); assert.equal(f.listeners.size, 0);
  });
  await check('present repeat: no POST, no re-layout; native geometry, selection and lock survive canonical receipt', async () => {
    const f = make(), live = structuredClone(node); live.position = { x: 999, y: 888 }; live.selected = true; live.data.locked = true;
    f.addLive(live); f.handler = async () => present();
    const result = await place(f);
    assert.equal(result.status, 'already-present'); assert.equal(f.requests.length, 1); assert.equal(f.nodes().length, 2);
    assert.deepEqual(f.nodes()[1].position, live.position); assert.equal(f.nodes()[1].selected, true); assert.equal(f.nodes()[1].data.locked, true);
  });
  await check('lost POST reply: same intent readOnly GET recovers one original pile, never reposts', async () => {
    const f = make(); f.handler = async method => method === 'POST' ? new Error('lost reply') : absent();
    assert.equal((await place(f)).status, 'unconfirmed');
    f.handler = async () => present(); assert.equal((await place(f, {}, true)).status, 'already-present');
    assert.equal(f.requests.filter(row => row.method === 'POST').length, 1); assert.equal(f.nodes().length, 2);
  });
  await check('unknown readOnly absence and partial stay unknown; no flush/POST/phantom success', async () => {
    for (const state of ['absent', 'partial']) {
      const f = make(); f.api.flushCanvas = () => { throw new Error('GET recovery must not flush a pending save'); };
      f.handler = async () => ({ ...absent(), state, presentation_received: state === 'partial' });
      assert.equal((await place(f, {}, true)).status, 'unconfirmed');
      assert.equal(f.requests.length, 1); assert.equal(f.synchronizations.length, 0);
    }
  });
  await check('project/canvas/workspace/Collection/binding/carrier mismatches reject before any write; legacy body never accepted', async () => {
    for (const mutate of [r => r.project_id = 'other', r => r.canvas_id = 'other', r => r.workspace_id = 'other',
      r => r.collection_id = 'other', r => r.binding.entityId = 'other', r => r.node.data.lcos_collection_ref.collectionId = 'other',
      r => r.node.type = 'lcos-collection']) {
      const f = make(); f.handler = async () => { const r = present(); mutate(r); return r; };
      assert.equal((await place(f)).status, 'rejected'); assert.equal(f.requests.length, 1); assert.equal(f.synchronizations.length, 0);
    }
  });
  await check('user edit during GET prevents POST; edit or scene/API owner change after POST prevents O8 backfill', async () => {
    let f = make(); f.handler = async () => { f.edit(); return absent(); };
    assert.equal((await place(f)).status, 'rejected'); assert.equal(f.requests.length, 1);
    for (const change of [value => value.edit(), value => value.changeScene()]) {
      f = make(); f.handler = async method => { if (method === 'POST') { change(f); return present(); } return absent(); };
      assert.equal((await place(f)).status, 'unconfirmed'); assert.equal(f.synchronizations.length, 0); assert.equal(f.nodes().length, 1);
    }
  });
  await check('failed original save and invalid explicit point submit nothing; original default placement point is retained', async () => {
    let f = make(); f.api.flushCanvas = async () => 'blocked';
    assert.equal((await place(f)).status, 'rejected'); assert.equal(f.requests.length, 0);
    f = make(); assert.equal((await place(f, { position: { x: NaN, y: 10 } })).status, 'rejected'); assert.equal(f.requests.length, 0);
    f = make(); assert.equal((await place(f)).status, 'placed');
    assert.deepEqual(f.requests[1].body.position, { x: 123.25, y: 456.5 });
  });
  report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); throw error; }
finally {
  globalThis.fetch = originalFetch;
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, '前端client与原O8回归.json'), JSON.stringify(report, null, 2));
  if (path.dirname(temp) === path.join(root, '.runtime') && path.basename(temp).startsWith('native-library-collection-')) await fs.rm(temp, { recursive: true, force: true });
}
