import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Server } from 'node:net';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const temp = await fs.mkdtemp(path.resolve('.runtime/isolated-glyth-placement-'));
const output = path.resolve('output/原加号智能体创建_20261023/真实Core投放', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, cases: [], runtime: temp, actualProviderCreated: false, modelMessages: 0 };
const originalFetch = globalThis.fetch;
const env = Object.fromEntries(['LCOS_RECOVERY_TRANSPORT', 'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR'].map(key => [key, process.env[key]]));
process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(temp, 'capture'); process.env.LCOS_OCR_RUNTIME_DIR = path.join(temp, 'ocr');
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const ports = process._getActiveHandles().filter(value => value instanceof Server && value.listening).map(value => value.address()?.port);
  if (url.hostname !== '127.0.0.1' || !ports.includes(Number(url.port)) || ['56311', '56321'].includes(url.port)) throw new Error('Only this test owns its servers.');
  return originalFetch(input, init);
};
let facade;
try {
  const entry = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(temp, 'facade.mjs'), 'node',
    { coreCollectionTitle: true, coreColorPin: true, coreWorkspaceMembership: true, coreWorkflowCollectionMembers: true, coreMixedScopeContext: true, coreLiveContinuation: true });
  const { startSurfaceCoreFacade } = await import(pathToFileURL(entry));
  facade = await startSurfaceCoreFacade({ runtimeRoot: path.join(temp, 'owned'), publicOrigin: 'http://127.0.0.1:19938',
    fullIntegration: true, nativeCollectionPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeRailPilot: true });
  const { projectId, repository } = facade.core, canvasId = 'surface-core-main';
  const call = (method, url, body) => facade.handle({ method, url, body });
  const availability = await call('GET', '/api/lcos/canvases/' + canvasId + '/conversation-creation');
  assert.equal(availability.status, 200); assert.deepEqual(availability.body.data, { canCreate: false, provider: null });
  assert.equal((await call('GET', '/api/lcos/canvases/foreign/conversation-creation')).status, 404);
  const canvas = async () => { const result = await call('GET', '/api/canvas/v1/canvases/' + canvasId); assert.equal(result.status, 200); return result.body.data; };
  const now = new Date().toISOString();
  const fixture = suffix => repository.upsertConnectedConversation({ schemaVersion: 1, id: 'test-glyth-' + suffix, projectId,
    provider: 'codex', executorId: '', conversationRef: 'explicit-synthetic-native-' + suffix, label: '测试智能体 ' + suffix,
    isRunning: false, waitingReason: null, lastActiveAt: now, workspaceRef: null, branchRef: null, createdAt: now, updatedAt: now });
  const one = fixture('one'), two = fixture('two');
  const appearance = { shape: 'blob', color: 'cyan', motion: 'curious' }, position = { x: 814, y: 214 };
  const place = (conversation, initialPlacement) => call('POST', '/api/lcos/canvases/' + canvasId + '/conversations:reconcile',
    { connectedConversationId: conversation.id, initialPlacement });
  const before = await canvas();
  const made = await place(one, { appearance, position }); assert.equal(made.status, 200, JSON.stringify(made.body));
  const binding = made.body.data.bindings[0], first = await canvas(), node = first.nodes.find(row => row.id === binding.spatialId);
  assert.ok(node); assert.equal(first.nodes.length, before.nodes.length + 1); assert.equal(node.type, 'lcos-conversation');
  assert.deepEqual(node.position, position); assert.deepEqual(node.data.lcosGlythAppearance, appearance);
  assert.equal(node.data.lcos_conversation_ref.connectedConversationId, one.id);
  assert.deepEqual(first.nodes.filter(row => row.id !== node.id), before.nodes);
  const repeat = await place(one, { appearance, position: { x: 10, y: 20 } }); assert.equal(repeat.status, 200);
  assert.equal(repeat.body.data.bindings[0].spatialId, node.id); assert.deepEqual(await canvas(), first);
  report.cases.push('Real Core ProjectionBinding and original Huabu CREATE save exactly one conversation node with initial position and original appearance; repeated admission cannot relocate or duplicate it.');

  for (const bad of [{ appearance: { ...appearance, color: 'invented' }, position }, { appearance, position: { x: 1, y: 2, z: 3 } },
    { appearance, position, command: 'arbitrary' }]) assert.equal((await place(two, bad)).status, 400);
  assert.equal((await place(two, { appearance, position })).status, 409);
  assert.equal((await place(one, { appearance: { ...appearance, motion: 'idle' }, position })).status, 409);
  assert.deepEqual(await canvas(), first);
  report.cases.push('Invalid shape/position fields, an already occupied appearance and changing an existing conversation appearance are rejected before writing.');

  const echo = async data => call('POST', '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions', {
    canvas_id: canvasId, created_by_role: 'user', actions: [{ action: 'update', updates: [{ id: node.id, type: node.type,
      position: { x: position.x + 12, y: position.y + 8 }, data, measured: node.measured }] }] });
  assert.equal((await echo({ ...node.data, lcosGlythAppearance: { ...appearance, motion: 'idle' } })).status, 409);
  const moved = await echo(node.data); assert.equal(moved.status, 200, JSON.stringify(moved.body));
  const after = (await canvas()).nodes.find(row => row.id === node.id);
  assert.deepEqual(after.data, node.data); assert.deepEqual(after.position, { x: 826, y: 222 });
  assert.deepEqual((await facade.spatial.read(canvasId)).state.nodes.find(row => row.id === node.id).data.lcosGlythAppearance, appearance);
  report.cases.push('Original native geometry save accepts exact appearance echoes, rejects forged appearance, and persists the same presentation data in the original spatial node.');

  const historyNode = after, originalConversation = structuredClone(repository.getConnectedConversation(projectId, one.id));
  const history = (kind, phase, restore, saved = historyNode) => call('POST', '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions', {
    canvas_id: canvasId, created_by_role: 'user', lcos_operation: { version: 1, operationId: 'original-history-' + kind + '-' + saved.id, kind, phase },
    actions: [restore ? { action: 'create', creates: [saved] } : { action: 'delete', delete_ids: [saved.id] }],
    lcos_refs: {}, lcos_snapshots: restore ? {} : { [saved.id]: saved },
  });
  const preserved = await canvas();
  for (const saved of [{ ...historyNode, position: { x: 1, y: 2 } }, { ...historyNode, data: { ...historyNode.data,
    lcos_conversation_ref: { ...historyNode.data.lcos_conversation_ref, projectId: 'foreign' } } }])
    assert.equal((await history('create', 'undo', false, saved)).status, 409);
  assert.equal((await history('create', 'apply', true)).status, 409);
  assert.equal((await history('create', 'redo', true, { ...historyNode, extent: 'parent' })).status, 400);
  assert.deepEqual(await canvas(), preserved);
  for (const [kind, phases] of [['create', ['undo', 'redo']], ['delete', ['apply', 'undo']], ['delete', ['redo', 'undo']]]) {
    const removed = await history(kind, phases[0], false); assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.ok(!(await canvas()).nodes.some(row => row.id === historyNode.id));
    assert.equal(repository.findProjectionBinding(projectId, canvasId, 'node', 'conversation', one.id), undefined);
    assert.deepEqual(repository.getConnectedConversation(projectId, one.id), originalConversation);
    const removeVersion = (await canvas()).version;
    assert.equal((await history(kind, phases[0], false)).status, 200);
    assert.equal((await canvas()).version, removeVersion, 'Same confirmed removal must not write again.');
    const restored = await history(kind, phases[1], true);
    if (restored.status !== 200) report.restoreFailure = { expected: historyNode, spatial: (await facade.spatial.read(canvasId)).state.nodes, response: restored.body };
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.deepEqual((await canvas()).nodes.find(row => row.id === historyNode.id), historyNode);
    assert.equal(repository.findProjectionBinding(projectId, canvasId, 'node', 'conversation', one.id).spatialId, historyNode.id);
    assert.deepEqual(repository.getConnectedConversation(projectId, one.id), originalConversation);
    const restoreVersion = (await canvas()).version;
    assert.equal((await history(kind, phases[1], true)).status, 200);
    assert.equal((await canvas()).version, restoreVersion, 'Same confirmed restore must not create another carrier.');
  }
  assert.deepEqual((await canvas()).nodes.filter(row => row.id !== historyNode.id), preserved.nodes.filter(row => row.id !== historyNode.id));
  report.cases.push('Real original CREATE/DELETE_NODES and Core ProjectionBinding support creation undo/redo and manual removal/undo/redo with the same node, appearance, geometry and untouched conversation; duplicate receipts do not write again.');
  report.cases.push('Foreign ownership, stale position and using restore as a new-agent creation are rejected without mutation.');

  const three = fixture('three'), four = fixture('four'), free = { ...appearance, motion: 'idle' };
  const competing = await Promise.all([place(three, { appearance: free, position: { x: 100, y: 100 } }), place(four, { appearance: free, position: { x: 200, y: 100 } })]);
  assert.deepEqual(competing.map(row => row.status).sort(), [200, 409]);
  assert.equal((await canvas()).nodes.filter(row => JSON.stringify(row.data?.lcosGlythAppearance) === JSON.stringify(free)).length, 1);
  report.cases.push('Two same-canvas conversations competing for the same chosen appearance result in exactly one saved node; the other retains its existing Core conversation.');
  assert.equal((await history('create', 'undo', false)).status, 200);
  const replacement = await place(one, { appearance, position: { x: 900, y: 500 } }); assert.equal(replacement.status, 200);
  const movedAgain = await canvas(); assert.notEqual(replacement.body.data.bindings[0].spatialId, historyNode.id);
  assert.equal((await history('create', 'redo', true)).status, 409, 'An old history cannot overwrite a later explicit placement of the same conversation.');
  assert.deepEqual(await canvas(), movedAgain); assert.deepEqual(repository.getConnectedConversation(projectId, one.id), originalConversation);
  report.cases.push('After removal, a later explicit placement keeps its own new carrier; stale old redo is refused without deleting or overwriting that placement.');
  const legacy = fixture('original-projector'), legacyPlaced = await place(legacy, undefined); assert.equal(legacyPlaced.status, 200);
  const legacyNode = (await canvas()).nodes.find(node => node.id === legacyPlaced.body.data.bindings[0].spatialId);
  assert.equal((await facade.spatial.read(canvasId)).state.nodes.find(node => node.id === legacyNode.id).data.lcos_conversation_ref, undefined);
  assert.equal((await history('delete', 'apply', false, legacyNode)).status, 200);
  const legacyRestored = await history('delete', 'undo', true, legacyNode); assert.equal(legacyRestored.status, 200, JSON.stringify(legacyRestored.body));
  assert.deepEqual((await canvas()).nodes.find(node => node.id === legacyNode.id), legacyNode);
  assert.deepEqual(repository.getConnectedConversation(projectId, legacy.id), legacy);
  report.cases.push('An older original-projector conversation without an embedded node identity restores through its authoritative Core ProjectionBinding, with its original default appearance and same conversation.');
  const lock = facade.spatial.withCanvasLock;
  facade.spatial.withCanvasLock = (id, work) => lock(id, locked => work({ ...locked, execute: async commands => {
    const result = await locked.execute(commands);
    repository.upsertProjectionBinding({ projectId, canvasId, spatialKind: 'node', spatialId: 'concurrent-new-carrier', entityType: 'conversation', entityId: legacy.id });
    return result;
  } }));
  try {
    assert.equal((await history('delete', 'apply', false, legacyNode)).status, 409);
    assert.equal(repository.findProjectionBinding(projectId, canvasId, 'node', 'conversation', legacy.id).spatialId, 'concurrent-new-carrier');
    assert.deepEqual(repository.getConnectedConversation(projectId, legacy.id), legacy);
  } finally { facade.spatial.withCanvasLock = lock; }
  report.cases.push('A controlled concurrent Core binding change after the real spatial commit is reported instead of deleting or overwriting that newer binding; conversation truth stays intact.');
  report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally { await facade?.close(); globalThis.fetch = originalFetch; for (const [key, value] of Object.entries(env)) value === undefined ? delete process.env[key] : process.env[key] = value;
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ passed: report.passed, cases: report.cases, output, error: report.error?.message }, null, 2));
