import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectionSourcePath = path.join(workspaceRoot, 'lab/pilot/native-collection-frame-projection.ts');
const runtimeParent = path.join(workspaceRoot, '.runtime');
await fs.mkdir(runtimeParent, { recursive: true });
const runtimeRoot = await fs.mkdtemp(path.join(runtimeParent, 'native-collection-frame-projection-'));
const runtimeRootResolved = path.resolve(runtimeRoot);
const sourceBefore = await fs.readFile(projectionSourcePath);
const clone = (value) => structuredClone(value);

function makeFrame({ id, collectionId, collectionNodeId, parentId, position, measured }) {
  return {
    id,
    type: 'frame',
    position: { ...position },
    width: measured.width,
    height: measured.height,
    measured: { ...measured },
    ...(parentId ? { parentId } : {}),
    data: { lcosCollectionId: collectionId, lcosCollectionNodeId: collectionNodeId },
  };
}

function makeFixture() {
  const projectId = 'project-frame-projection-fixture';
  const canvasId = 'canvas-frame-projection-fixture';
  const rootCollectionId = 'collection-root';
  const childCollectionId = 'collection-child';
  const rootCarrierId = 'node-uuid-root-collection-carrier';
  const childCarrierId = 'node-uuid-child-collection-carrier';
  const rootFrameId = 'node-uuid-root-frame';
  const childFrameId = 'node-uuid-child-frame';
  const memberNodeId = 'node-uuid-frame-member';
  const state = {
    collections: [
      { id: rootCollectionId, projectId, title: 'Evidence collection' },
      { id: childCollectionId, projectId, title: 'Nested collection' },
    ],
    workspaces: [{ id: 'workspace-main', projectId, canvasId }],
    bindings: [
      { projectId, canvasId, spatialKind: 'node', spatialId: rootCarrierId,
        entityType: 'collection', entityId: rootCollectionId },
      { projectId, canvasId, spatialKind: 'node', spatialId: childCarrierId,
        entityType: 'collection', entityId: childCollectionId },
    ],
    nodes: [
      makeFrame({ id: rootFrameId, collectionId: rootCollectionId, collectionNodeId: rootCarrierId,
        position: { x: 410, y: 220 }, measured: { width: 640, height: 420 } }),
      makeFrame({ id: childFrameId, collectionId: childCollectionId, collectionNodeId: childCarrierId,
        parentId: rootFrameId, position: { x: 34, y: 46 }, measured: { width: 310, height: 210 } }),
      { id: rootCarrierId, type: 'lcos-collection', position: { x: 430, y: 250 },
        data: { id: rootCarrierId, lcos_collection_ref: { projectId, canvasId, collectionId: rootCollectionId } } },
      { id: childCarrierId, type: 'lcos-collection', position: { x: 450, y: 280 },
        data: { id: childCarrierId, lcos_collection_ref: { projectId, canvasId, collectionId: childCollectionId } } },
      { id: memberNodeId, type: 'image', parentId: childFrameId, position: { x: 18, y: 24 },
        measured: { width: 200, height: 120 }, data: { id: memberNodeId, title: 'Member' } },
    ],
  };
  const readCalls = { collection: 0, workspaces: 0, bindings: 0 };
  const repository = Object.freeze({
    getCollection(id) {
      readCalls.collection++;
      return state.collections.find((row) => row.id === id);
    },
    getWorkspaces(forProjectId) {
      readCalls.workspaces++;
      return state.workspaces.filter((row) => row.projectId === forProjectId);
    },
    getProjectionBindings(forProjectId) {
      readCalls.bindings++;
      return state.bindings.filter((row) => row.projectId === forProjectId);
    },
  });
  return { projectId, canvasId, rootCollectionId, childCollectionId, rootCarrierId, childCarrierId,
    rootFrameId, childFrameId, memberNodeId, state, repository, readCalls };
}

function snapshotFixture(fixture) {
  return {
    collections: clone(fixture.state.collections),
    workspaces: clone(fixture.state.workspaces),
    bindings: clone(fixture.state.bindings),
    nodes: clone(fixture.state.nodes),
  };
}

function makeProjection(module, fixture) {
  return module.createNativeCollectionFrameProjection({
    repository: fixture.repository,
    projectId: fixture.projectId,
    fail(status, code, message) {
      const error = new Error(message);
      error.status = status;
      error.code = code;
      throw error;
    },
  });
}

function expectFailure(label, fixture, module, expectedCode, operation, expectedStatus) {
  const before = snapshotFixture(fixture);
  let failure;
  try { operation(makeProjection(module, fixture), fixture); }
  catch (error) { failure = error; }
  assert.ok(failure, `${label}: expected projection refusal`);
  assert.equal(failure.code, expectedCode, `${label}: fail-closed reason`);
  if (expectedStatus !== undefined) assert.equal(failure.status, expectedStatus, `${label}: status`);
  assert.deepEqual(snapshotFixture(fixture), before, `${label}: rejected projection does not mutate nodes, bindings, workspace or Collection data`);
  return { name: label, status: failure.status, code: failure.code };
}

try {
  const bundlePath = await buildPilotEntry(
    'lab/pilot/native-collection-frame-projection.ts',
    path.join(runtimeRoot, 'native-collection-frame-projection.mjs'),
    'node',
  );
  const bundleSource = await fs.readFile(bundlePath, 'utf8');
  assert.match(bundleSource, /createNativeCollectionFrameProjection/,
    'the test executes the production projection module through buildPilotEntry');
  const { createNativeCollectionFrameProjection } = await import(pathToFileURL(bundlePath).href);

  const fixture = makeFixture();
  const beforeProjection = snapshotFixture(fixture);
  const projection = makeProjection({ createNativeCollectionFrameProjection }, fixture);
  const rootFrame = fixture.state.nodes.find((node) => node.id === fixture.rootFrameId);
  const childFrame = fixture.state.nodes.find((node) => node.id === fixture.childFrameId);
  const rootGroup = projection.frame(fixture.canvasId, rootFrame, fixture.state.nodes);
  const childGroup = projection.frame(fixture.canvasId, childFrame, fixture.state.nodes);
  const memberParent = projection.parent(fixture.canvasId,
    fixture.state.nodes.find((node) => node.id === fixture.memberNodeId), fixture.state.nodes);

  assert.deepEqual(rootGroup, {
    id: fixture.rootFrameId,
    canvas_id: fixture.canvasId,
    type: 'group',
    position: { x: 410, y: 220 },
    measured: { width: 640, height: 420 },
    width: 640,
    height: 420,
    data: {
      id: fixture.rootFrameId,
      title: 'Evidence collection',
      createdBy: 'client',
      loading: false,
      layoutType: 'none',
      lcosCollectionId: fixture.rootCollectionId,
      lcosCollectionNodeId: fixture.rootCarrierId,
    },
  }, 'root RFS frame projects as a TapNow GroupNode with the original Huabu ID and geometry');
  assert.deepEqual(childGroup, {
    id: fixture.childFrameId,
    canvas_id: fixture.canvasId,
    type: 'group',
    position: { x: 34, y: 46 },
    measured: { width: 310, height: 210 },
    width: 310,
    height: 210,
    parent_id: fixture.rootFrameId,
    data: {
      id: fixture.childFrameId,
      title: 'Nested collection',
      createdBy: 'client',
      loading: false,
      layoutType: 'none',
      lcosCollectionId: fixture.childCollectionId,
      lcosCollectionNodeId: fixture.childCarrierId,
    },
  }, 'nested frame keeps its original ID, parent ID, local position and measured size');
  assert.deepEqual(memberParent, { parent_id: fixture.childFrameId },
    'member parent readback points at the connected nested Collection group');

  {
    const partial = makeFixture();
    const partialFrame = partial.state.nodes.find((node) => node.id === partial.rootFrameId);
    partialFrame.measured = { width: 321 };
    partialFrame.style = { width: 290, height: 171 };
    partialFrame.width = 270;
    partialFrame.height = 160;
    const before = snapshotFixture(partial);
    const partialProjection = makeProjection({ createNativeCollectionFrameProjection }, partial)
      .frame(partial.canvasId, partialFrame, partial.state.nodes);
    assert.deepEqual(partialProjection.measured, { width: 321, height: 171 },
      'each axis resolves independently: measured width wins while missing measured height falls back to style');
    assert.equal(partialProjection.width, 321);
    assert.equal(partialProjection.height, 171);
    assert.deepEqual(snapshotFixture(partial), before,
      'partial measured/style dimension readback remains a pure projection');
  }

  {
    const locked = makeFixture();
    const lockedFrame = locked.state.nodes.find((node) => node.id === locked.rootFrameId);
    lockedFrame.data.locked = true;
    const before = snapshotFixture(locked);
    const lockedProjection = makeProjection({ createNativeCollectionFrameProjection }, locked)
      .frame(locked.canvasId, lockedFrame, locked.state.nodes);
    assert.equal(lockedProjection.data.locked, true,
      'canonical locked state survives frame-to-group projection');
    assert.equal(lockedProjection.draggable, false,
      'locked Collection group is not draggable in the native projection');
    assert.deepEqual(lockedProjection.position, { x: 410, y: 220 });
    assert.deepEqual(snapshotFixture(locked), before,
      'locked readback does not mutate the source frame or its Collection binding');
  }

  assert.deepEqual(snapshotFixture(fixture), beforeProjection,
    'successful frame/member projection is a pure read and does not mutate source or binding state');
  assert.ok(fixture.readCalls.collection > 0 && fixture.readCalls.workspaces > 0 && fixture.readCalls.bindings > 0,
    'the mapping is grounded in canonical Collection, Workspace and projection-binding reads');

  const failures = [];

  {
    const test = makeFixture();
    test.state.collections.find((row) => row.id === test.rootCollectionId).projectId = 'foreign-project';
    failures.push(expectFailure('foreign Collection', test, { createNativeCollectionFrameProjection },
      'COLLECTION_FRAME_IDENTITY_MISMATCH', (owner, current) => owner.frame(current.canvasId,
        current.state.nodes.find((node) => node.id === current.rootFrameId), current.state.nodes), 409));
  }

  {
    const test = makeFixture();
    test.state.bindings.push({ ...test.state.bindings[0] });
    failures.push(expectFailure('repeated owner binding', test, { createNativeCollectionFrameProjection },
      'COLLECTION_FRAME_IDENTITY_MISMATCH', (owner, current) => owner.frame(current.canvasId,
        current.state.nodes.find((node) => node.id === current.rootFrameId), current.state.nodes), 409));
  }

  {
    const test = makeFixture();
    test.state.bindings.find((row) => row.entityId === test.rootCollectionId).spatialId = 'node-uuid-wrong-owner';
    failures.push(expectFailure('binding points at a different carrier', test, { createNativeCollectionFrameProjection },
      'COLLECTION_FRAME_IDENTITY_MISMATCH', (owner, current) => owner.frame(current.canvasId,
        current.state.nodes.find((node) => node.id === current.rootFrameId), current.state.nodes), 409));
  }

  {
    const test = makeFixture();
    test.state.nodes.push(makeFrame({ id: 'node-uuid-duplicate-frame', collectionId: test.rootCollectionId,
      collectionNodeId: test.rootCarrierId, position: { x: 0, y: 0 }, measured: { width: 100, height: 100 } }));
    failures.push(expectFailure('duplicate frame for one Collection', test, { createNativeCollectionFrameProjection },
      'COLLECTION_FRAME_IDENTITY_MISMATCH', (owner, current) => owner.frame(current.canvasId,
        current.state.nodes.find((node) => node.id === current.rootFrameId), current.state.nodes), 409));
  }

  {
    const test = makeFixture();
    test.state.nodes.push({ id: test.rootCarrierId, type: 'lcos-collection', data: { id: test.rootCarrierId } });
    failures.push(expectFailure('duplicate carrier owner node', test, { createNativeCollectionFrameProjection },
      'COLLECTION_FRAME_IDENTITY_MISMATCH', (owner, current) => owner.frame(current.canvasId,
        current.state.nodes.find((node) => node.id === current.rootFrameId), current.state.nodes), 409));
  }

  {
    const test = makeFixture();
    const child = test.state.nodes.find((node) => node.id === test.childFrameId);
    child.parentId = 'node-uuid-missing-parent';
    failures.push(expectFailure('missing parent frame', test, { createNativeCollectionFrameProjection },
      'COLLECTION_FRAME_PARENT_UNAVAILABLE', (owner, current) => owner.frame(current.canvasId, child, current.state.nodes), 409));
  }

  {
    const test = makeFixture();
    test.state.nodes.find((node) => node.id === test.rootFrameId).parentId = test.childFrameId;
    failures.push(expectFailure('cyclic parent chain', test, { createNativeCollectionFrameProjection },
      'COLLECTION_FRAME_PARENT_CYCLE', (owner, current) => owner.frame(current.canvasId,
        current.state.nodes.find((node) => node.id === current.rootFrameId), current.state.nodes), 409));
  }

  {
    const test = makeFixture();
    test.state.nodes.find((node) => node.id === test.rootFrameId).measured.width = 0;
    failures.push(expectFailure('non-positive frame geometry', test, { createNativeCollectionFrameProjection },
      'COLLECTION_FRAME_GEOMETRY_INVALID', (owner, current) => owner.frame(current.canvasId,
        current.state.nodes.find((node) => node.id === current.rootFrameId), current.state.nodes), 409));
  }

  {
    const test = makeFixture();
    test.state.nodes.find((node) => node.id === test.rootFrameId).position.x = Number.NaN;
    failures.push(expectFailure('non-finite frame position', test, { createNativeCollectionFrameProjection },
      'COLLECTION_FRAME_GEOMETRY_INVALID', (owner, current) => owner.frame(current.canvasId,
        current.state.nodes.find((node) => node.id === current.rootFrameId), current.state.nodes), 409));
  }

  {
    const test = makeFixture();
    const ordinaryFrame = { id: 'node-uuid-unmapped-frame', type: 'frame', position: { x: 0, y: 0 },
      measured: { width: 200, height: 140 }, data: { label: 'Ordinary frame, not a Collection' } };
    test.state.nodes.push(ordinaryFrame);
    const ordinaryBefore = snapshotFixture(test), ordinaryGroup = makeProjection({ createNativeCollectionFrameProjection }, test)
      .frame(test.canvasId, ordinaryFrame, test.state.nodes);
    assert.equal(ordinaryGroup.id, ordinaryFrame.id); assert.equal(ordinaryGroup.type, 'group');
    assert.equal(ordinaryGroup.data.createdBy, 'client'); assert.equal(ordinaryGroup.data.layoutType, 'none');
    assert.equal(ordinaryGroup.data.lcosCollectionId, undefined); assert.deepEqual(ordinaryGroup.position, ordinaryFrame.position);
    assert.deepEqual(snapshotFixture(test), ordinaryBefore, 'ordinary Frame projection never creates canonical identity or changes geometry');
  }

  {
    const test = makeFixture();
    const member = { id: 'node-uuid-orphan-member', parentId: 'node-uuid-unmapped-frame' };
    const ordinaryFrame = { id: member.parentId, type: 'frame', data: {}, position: { x: 0, y: 0 } };
    test.state.nodes.push(ordinaryFrame);
    failures.push(expectFailure('member parent is an ordinary unmapped frame', test, { createNativeCollectionFrameProjection },
      'FRAME_GEOMETRY_INVALID', (owner, current) => owner.parent(current.canvasId, member,
        [...current.state.nodes, member]), 409));
  }

  assert.deepEqual(await fs.readFile(projectionSourcePath), sourceBefore,
    'the production module remains read-only during the test');
  console.log(JSON.stringify({
    test: 'native-collection-frame-projection',
    source: 'lab/pilot/native-collection-frame-projection.ts via buildPilotEntry node bundle',
    repository: 'read-only in-memory fixture only; no Core/SQLite/server/GUI',
    positive: [
      'root frame preserves node-uuid as group id and exact geometry',
      'nested frame parent/local coordinate readback',
      'member parent readback',
      'partial measured dimensions fall back per-axis to style without mutation',
      'locked frame preserves locked state and disables dragging',
    ],
    rejected: failures,
    mutations: 'none: input nodes, Collection records, Workspaces, and projection bindings remained unchanged',
  }, null, 2));
} finally {
  const resolved = path.resolve(runtimeRoot);
  const relative = path.relative(path.resolve(runtimeParent), resolved);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    'temporary bundle cleanup remains inside this test runtime');
  await fs.rm(resolved, { recursive: true, force: true });
}
