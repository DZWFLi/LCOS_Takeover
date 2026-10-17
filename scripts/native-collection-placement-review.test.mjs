import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';

// Actual backend admission and actual original projector/entity lock. Only
// repository/Assembly/spatial/binding transports are controlled; no Core/UI.
const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'lab/pilot/native-pile-collection-placement.ts');
const out = path.join(root, 'output/原生库集合整合_20261017g/集合并发独立复核');
fs.mkdirSync(out, { recursive: true });
const current = fs.readFileSync(target, 'utf8');
const projectorSource = fs.readFileSync(path.join(root, 'lcos/apps/web-gen2/src/spatial/ProjectToSpaceProjection.ts'), 'utf8');
const facadeSource = stripTypeScriptTypes(fs.readFileSync(path.join(root, 'lab/pilot/surface-core-facade.ts'), 'utf8'), { mode: 'transform' });
const tree = parseOriginalDonorScript(facadeSource, 'surface-core-facade.js');
const projectCallbacks = [], visit = [tree];
while (visit.length) {
  const node = visit.pop(); if (!node || typeof node.type !== 'string') continue;
  if (node.type === 'ObjectProperty' && node.key?.name === 'projectCollection' && node.value?.type === 'ArrowFunctionExpression') projectCallbacks.push(node.value);
  for (const value of Object.values(node)) if (Array.isArray(value)) visit.push(...value.filter(item => item?.type)); else if (value?.type) visit.push(value);
}
assert.equal(projectCallbacks.length, 1, 'Extract one exact production scoped projectCollection callback, not a copy of its guard.');
const callback = facadeSource.slice(projectCallbacks[0].start, projectCallbacks[0].end);
assert.ok(callback.includes('lcos_collection_ref: sourceRef') && callback.includes('await locked.read()'));
const guardStart = callback.indexOf('const saved = await locked.read()');
const guardEnd = callback.indexOf('return locked.execute(identified)', guardStart);
assert.ok(guardStart > 0 && guardEnd > guardStart);
const negativeCallback = callback.slice(0, guardStart) + callback.slice(guardEnd);
const eraseImports = source => source.replace(/^import\s+[\s\S]*?;\r?\n/gm, '').replace(/^export\s+/gm, '');
const js = source => stripTypeScriptTypes(eraseImports(source), { mode: 'transform' });
const makeProjector = () => vm.runInNewContext(js(projectorSource) + '\nProjectToSpaceProjection;', {
  setTimeout, clearTimeout, console,
  HuabuRfsClient: { firstCreatedNodeId: value => value.results?.[0]?.nodes?.[0]?.id },
  resolveLcosInitialGeometryPreset: () => undefined,
  resolveVisualFamily: () => 'file', huabuNodeTypeForFamily: () => 'note',
});
async function run(source, label, { allSurfaces = false, removeGuard = false, lostBindingResponse = false, removeMemberDuringLockedRead = false } = {}) {
  const createPlacement = vm.runInNewContext(js(source) + '\ncreateNativePileCollectionPlacement;', { console });
  const Projector = makeProjector(), projectId = 'review-project', canvasId = 'review-' + label + '-main', collectionId = 'review-collection';
  const workspaces = ['main', 'context', 'workflow'].map(kind => ({ id: 'workspace-' + kind, projectId,
    canvasId: 'review-' + label + '-' + kind, scopeId: 'root', preferredSurface: kind }));
  const workspace = workspaces[0];
  const scope = { id: 'root', projectId, kind: 'root' }, collection = { id: collectionId, projectId, title: 'controlled only' };
  const presentations = new Map();
  let bindings = [], nodes = [], firstReads = 0, receiveCount = 0, projectCalls = 0, creates = 0, bindCalls = 0;
  let release;
  const firstReadGate = new Promise(resolve => { release = resolve; });
  const repository = { getWorkspaces: () => workspaces, getScopes: () => [scope], getCollection: id => id === collectionId ? collection : undefined,
    getPresentationView: (_project, id) => presentations.get(id), getProjectionBindings: () => bindings };
  const spatial = { async read(id) { if (!allSurfaces && ++firstReads <= 2) { if (firstReads === 2) release(); await firstReadGate; }
    return { state: { nodes: structuredClone(nodes.filter(node => node.canvasId === id)) } }; },
    withCanvasLock(id, operation) { return operation({ read: async () => {
      const saved = await spatial.read(id);
      if (removeMemberDuringLockedRead) for (const value of presentations.values()) value.state.memberEntityRefs = [];
      return saved;
    }, execute: async commands => {
      creates++;
      const value = commands[0].nodes[0], node = { ...value, type: value.nodeType, canvasId: id, position: value.position, width: 248, height: 244 };
      nodes.push(node); return { results: [{ nodes: [node] }] };
    } }); } };
  const binding = { async findNode(_project, id) { return bindings.find(row => row.canvasId === id); }, async bind(value) {
    if (++bindCalls === 1 && !allSurfaces) {
      if (lostBindingResponse) bindings = [...bindings.filter(row => row.canvasId !== value.canvasId), value];
      throw new Error('controlled binding reply/write failure after actual projector CREATE');
    }
    bindings = [...bindings.filter(row => row.canvasId !== value.canvasId), value];
  } };
  const projectCollection = vm.runInNewContext('(' + (removeGuard ? negativeCallback : callback) + ')', {
    repository, PROJECT_ID: projectId, coreOrigin: 'http://127.0.0.1:1', spatial,
    createId: () => 'node-' + (creates + 1),
    fail(status, code, message) { throw Object.assign(new Error(message), { status, code }); },
    HttpClient: class {}, Gen2Host: class { constructor(options) { this.nodeProjector = new Projector(options.rfs, binding); } },
    createHeadlessProjectionPort: options => ({ config: { canvasId: options.canvasId }, execute: commands => options.execute(options.canvasId, commands),
      async query(query) { return { type: query.type, result: { nodes: nodes.filter(node => node.canvasId === options.canvasId && query.ids?.includes(node.id)) } }; } }),
  });
  const placement = createPlacement({ repository, projectId, spatial,
    fail(status, code, message) { throw Object.assign(new Error(message), { status, code }); },
    projectPile(canvasId, carrier) { return { ...carrier, type: 'pile', data: { id: carrier.id, lcos_native_collection: true, memberIds: [],
      lcos_collection_ref: { projectId, canvasId, workspaceId: workspaces.find(row => row.canvasId === canvasId).id, collectionId } } }; },
    async receiveCollection(id) {
      receiveCount++;
      const capability = workspaces.find(row => row.canvasId === id).preferredSurface === 'workflow' ? 'workflow' : 'context';
      const presentationId = 'presentation:' + capability + ':root', first = !presentations.has(presentationId);
      presentations.set(presentationId, { projectId, scopeId: 'root', capability, state: { memberEntityRefs: [{ type: 'collection', id: collectionId }] } });
      return { projectId, results: [{ sourceRef: { kind: 'collection', id: collectionId }, status: first ? 'applied' : 'skipped',
        channel: first ? 'presentation-membership' : 'already-member' }] };
    },
    async projectCollection(canvasId, input, assertCurrent) {
      projectCalls++;
      return projectCollection(canvasId, input, assertCurrent);
    },
  });
  let results;
  if (allSurfaces) {
    results = [];
    for (const target of workspaces) results.push({ status: 'fulfilled', value: await placement.project(target.canvasId, { collectionId, position: { x: creates * 20, y: 2 } }) });
    for (const target of workspaces) assert.equal((await placement.project(target.canvasId, { collectionId })).already_present, true);
  } else results = await Promise.allSettled([placement.project(canvasId, { collectionId, position: { x: 1, y: 2 } }),
    placement.project(canvasId, { collectionId, position: { x: 99, y: 99 } })]);
  const finalRead = allSurfaces ? null : await placement.inspect(canvasId, collectionId);
  return { label, projectCalls, creates, bindCalls, nodeCount: nodes.length, bindings,
    savedEchoes: nodes.map(node => node.data?.lcos_collection_ref), inspectState: finalRead?.state,
    results: results.map(result => result.status === 'fulfilled' ? { status: 'fulfilled', value: result.value.state }
      : { status: 'rejected', code: result.reason.code, error: result.reason.message }) };
}
const negativeControl = await run(current, 'scoped-guard-disabled-control', { removeGuard: true });
const result = await run(current, 'current');
const crossSurface = await run(current, 'same-collection-three-surfaces', { allSurfaces: true });
const lateBindingReceipt = await run(current, 'binding-committed-response-lost', { lostBindingResponse: true });
const changedOwnerAtLockedRead = await run(current, 'membership-removed-during-locked-read', { removeMemberDuringLockedRead: true });
const report = { at: new Date().toISOString(), scope: 'Controlled repository/Assembly/spatial/binding transports, actual backend + extracted actual facade projectCollection closure + actual original ProjectToSpaceProjection/entity lock. Negative control disables only the facade lock-read guard, retaining the real CREATE echo. No bundle build/candidate/Core/browser/model.', negativeControl, result, crossSurface, lateBindingReceipt, changedOwnerAtLockedRead };
fs.writeFileSync(path.join(out, 'report-scoped-echo.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
assert.equal(negativeControl.creates, 2, 'The previous admission branch must reproduce the duplicate orphan window.');
assert.equal(result.creates, 1, 'A second already-in-flight request must not create another orphan after the first CREATE/binding failure.');
assert.equal(result.inspectState, 'partial');
assert.equal(result.savedEchoes[0].collectionId, 'review-collection');
assert.equal(crossSurface.creates, 3);
assert.equal(crossSurface.bindings.length, 3);
assert.equal(lateBindingReceipt.creates, 1);
assert.equal(lateBindingReceipt.inspectState, 'present');
assert.equal(changedOwnerAtLockedRead.creates, 0, 'Original owner must be rechecked after the awaited locked Canvas read.');
