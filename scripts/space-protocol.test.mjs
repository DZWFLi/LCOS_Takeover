import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(root, '.runtime', `space-protocol-${Date.now()}`);
await mkdir(runtimeRoot, { recursive: true });

const evidence = {
  workspace: 'LCOS-DSH-03',
  generatedAt: new Date().toISOString(),
  implementation: 'TapNow connection batch DTO translated to the real Huabu disk executor; Core workspace names remain Core-owned',
  runtime: { coreServer: 'temporary loopback server on an ephemeral port', huabuStorage: 'temporary disk workspace', fixedDevPortsOpened: false },
  cases: [],
};

const facadeEntry = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'surface-core-facade.mjs'));
const protocolEntry = await buildPilotEntry('lab/pilot/space-protocol.ts', path.join(runtimeRoot, 'space-protocol.mjs'));
const { startSurfaceCoreFacade } = await import(pathToFileURL(facadeEntry).href);
const { createSpaceProtocol } = await import(pathToFileURL(protocolEntry).href);

let facade;
try {
  facade = await startSurfaceCoreFacade({ runtimeRoot });
  const projectId = facade.core.projectId;
  const main = facade.workspaces.find((workspace) => workspace.preferredSurface === 'main');
  const context = facade.workspaces.find((workspace) => workspace.preferredSurface === 'context');
  assert.ok(main?.canvasId && main.id);
  assert.ok(context?.canvasId);
  const canvasId = main.canvasId;
  const initial = await facade.spatial.read(canvasId);
  assert.equal(initial.state.nodes.length, 2);
  const [imageNode, textNode] = initial.state.nodes;
  const coreRelationCount = facade.core.repository.getRelations(projectId).length;
  const protocol = createSpaceProtocol({ repository: facade.core.repository, projectId, spatial: facade.spatial, coreOrigin: facade.core.origin });
  const edgeId = 'tapnow-history-edge-user-id';
  const createBody = {
    canvas_id: canvasId,
    actions: [{ action: 'create', creates: [{ id: edgeId, source: imageNode.id, target: textNode.id,
      type: 'default', data: {}, source_handle: '', target_handle: '', deletable: true, selectable: true }] }],
  };

  const created = await protocol.applyConnections(canvasId, createBody);
  assert.equal(created.status, 200);
  assert.equal(created.body.code, 0);
  let scene = await facade.spatial.read(canvasId);
  assert.deepEqual(scene.state.edges.map((edge) => edge.id), [edgeId]);
  evidence.cases.push('TapNow create uses the original connection id in persisted Huabu state');

  const replay = await protocol.applyConnections(canvasId, structuredClone(createBody));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.data.actions[0].applied, false);
  assert.equal((await facade.spatial.read(canvasId)).state.edges.length, 1);
  evidence.cases.push('same-id create replay is an explicit idempotent no-op');

  const styled = await protocol.applyConnections(canvasId, {
    canvas_id: canvasId,
    actions: [{ action: 'update', updates: [{ id: edgeId, data: { edgeStyle: { label: 'TapNow edge label' } } }] }],
  });
  assert.equal(styled.status, 200);
  scene = await facade.spatial.read(canvasId);
  assert.equal(scene.state.edges[0].id, edgeId);
  assert.equal(scene.state.edges[0].data.edgeStyle.label, 'TapNow edge label');
  evidence.cases.push('update maps edge style through Huabu and keeps the original history id');

  const rerouted = await protocol.applyConnections(canvasId, {
    canvas_id: canvasId,
    actions: [{ action: 'update', updates: [{ id: edgeId, source: textNode.id, target: imageNode.id }] }],
  });
  assert.equal(rerouted.status, 200);
  scene = await facade.spatial.read(canvasId);
  assert.deepEqual({ id: scene.state.edges[0].id, source: scene.state.edges[0].source, target: scene.state.edges[0].target },
    { id: edgeId, source: textNode.id, target: imageNode.id });
  assert.equal(scene.state.edges[0].data.edgeStyle.label, 'TapNow edge label');
  evidence.cases.push('endpoint update disconnects/reconnects with the same id and retained style');

  const deleted = await protocol.applyConnections(canvasId, {
    canvas_id: canvasId, actions: [{ action: 'delete', delete_ids: [edgeId] }],
  });
  assert.equal(deleted.status, 200);
  assert.equal((await facade.spatial.read(canvasId)).state.edges.length, 0);
  evidence.cases.push('delete maps to Huabu DISCONNECT_EDGES and persists removal');

  const beforeInvalid = structuredClone((await facade.spatial.read(canvasId)).state.edges);
  const unknown = await protocol.applyConnections(canvasId, {
    canvas_id: canvasId,
    actions: [
      { action: 'create', creates: [{ id: 'valid-before-invalid', source: imageNode.id, target: textNode.id }] },
      { action: 'create', creates: [{ id: 'unknown-field-edge', source: textNode.id, target: imageNode.id, business_relation: 'depends-on' }] },
    ],
  });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error.code, 'UNKNOWN_FIELD');
  assert.deepEqual((await facade.spatial.read(canvasId)).state.edges, beforeInvalid);
  evidence.cases.push('unknown connection fields fail before any command executes');

  const crossCanvas = await protocol.applyConnections(canvasId, {
    canvas_id: canvasId,
    actions: [{ action: 'create', creates: [{ id: 'cross-canvas-edge', source: imageNode.id, target: (await facade.spatial.read(context.canvasId)).state.nodes[0].id }] }],
  });
  assert.equal(crossCanvas.status, 404);
  assert.equal(crossCanvas.body.error.code, 'CONNECTION_ENDPOINT_NOT_FOUND');
  assert.deepEqual((await facade.spatial.read(canvasId)).state.edges, beforeInvalid);
  evidence.cases.push('cross-canvas endpoints fail before the Huabu executor');

  let calls = 0;
  const flakySpatial = {
    read: facade.spatial.read,
    async execute(targetCanvasId, commands) {
      calls += 1;
      if (calls === 2) throw new Error('controlled executor transport interruption');
      return facade.spatial.execute(targetCanvasId, commands);
    },
  };
  const partialProtocol = createSpaceProtocol({ repository: facade.core.repository, projectId, spatial: flakySpatial, coreOrigin: facade.core.origin });
  const partial = await partialProtocol.applyConnections(canvasId, {
    canvas_id: canvasId,
    actions: [
      { action: 'create', creates: [{ id: 'partial-edge-committed', source: imageNode.id, target: textNode.id }] },
      { action: 'create', creates: [{ id: 'partial-edge-interrupted', source: textNode.id, target: imageNode.id }] },
    ],
  });
  assert.equal(partial.status, 503);
  assert.equal(partial.body.error.code, 'SPATIAL_WRITE_PARTIAL');
  assert.equal(partial.body.error.details.partial, true);
  const partialEdges = (await facade.spatial.read(canvasId)).state.edges;
  assert.deepEqual(partialEdges.map((edge) => edge.id), ['partial-edge-committed']);
  evidence.partialWrite = { status: partial.status, code: partial.body.error.code,
    committedIds: partialEdges.map((edge) => edge.id), interruptedIdAbsent: !partialEdges.some((edge) => edge.id === 'partial-edge-interrupted') };
  evidence.cases.push('transport interruption returns partial state and the real first Huabu write remains visible');

  assert.equal(facade.core.repository.getRelations(projectId).length, coreRelationCount);
  evidence.cases.push('spatial connections do not create Core business Relations');

  const renameProtocol = await protocol.renameCanvas(canvasId, { name: 'TapNow rename probe' });
  assert.equal(renameProtocol.status, 501);
  assert.equal(renameProtocol.body.error.code, 'CORE_WORKSPACE_RENAME_UNSUPPORTED');
  assert.equal(renameProtocol.body.error.details.attempted, false);
  const beforePut = facade.core.repository.getWorkspaces(projectId).find((workspace) => String(workspace.id) === String(main.id));
  const putResponse = await fetch(`${facade.core.origin}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(String(main.id))}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ canvasId, name: 'TapNow rename probe' }), redirect: 'error',
  });
  const putEnvelope = await putResponse.json();
  const afterPut = facade.core.repository.getWorkspaces(projectId).find((workspace) => String(workspace.id) === String(main.id));
  assert.equal(putResponse.status, 200);
  assert.equal(putEnvelope.ok, true);
  assert.equal(afterPut.name, beforePut.name);
  assert.equal(afterPut.canvasId, canvasId);
  evidence.renameProbe = { protocolStatus: renameProtocol.status, routeMethod: 'PUT', routeStatus: putResponse.status,
    routeCode: putEnvelope.ok ? 0 : putEnvelope.error?.code, requestedName: 'TapNow rename probe',
    beforeName: beforePut.name, afterName: afterPut.name, workspaceIdPreserved: String(afterPut.id) === String(main.id),
    finding: 'PUT succeeds but updates only canvasId and ignores name; protocol correctly reports unsupported without sending it' };
  evidence.cases.push('real Core PUT route confirms it preserves workspace identity but does not rename the workspace');

  evidence.passed = true;
} catch (error) {
  evidence.passed = false;
  evidence.error = error?.stack || String(error);
  process.exitCode = 1;
} finally {
  await facade?.close();
  await writeFile(path.join(root, 'evidence', 'space-protocol.json'), JSON.stringify(evidence, null, 2) + '\n');
}

console.log(JSON.stringify(evidence, null, 2));
