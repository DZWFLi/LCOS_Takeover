import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRoot = path.join(root, '.runtime', `native-text-first-facade-test-${Date.now()}-${process.pid}`);
const origin = 'http://127.0.0.1:17881'; // Handler-only facade origin; no public facade listener is started.
const envKeys = ['LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_RECOVERY_TRANSPORT'];
const priorEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
let facade;
const report = {
  implementation: 'native-text pilot default presentation through real temporary Core + Huabu facade',
  runtimeRoot: testRoot,
  originalUserDatabaseOpened: false,
  providerOrRunCalled: false,
  nativeGuiClaimed: false,
  cases: [],
};

function call(method, address, body) {
  return facade.handle({ method, pathname: new URL(address, origin).pathname, url: origin + address, body });
}

async function openRuntime(runtimeRoot, nativeTextPilot) {
  const captureRoot = path.join(runtimeRoot, 'capture-staging');
  const ocrRoot = path.join(runtimeRoot, 'ocr-runtime');
  await mkdir(captureRoot, { recursive: true });
  await mkdir(ocrRoot, { recursive: true });
  process.env.LCOS_CAPTURE_STAGING_ROOT = captureRoot;
  process.env.LCOS_OCR_RUNTIME_DIR = ocrRoot;
  process.env.LCOS_RECOVERY_TRANSPORT = 'none';

  const entry = await buildPilotEntry('lab/pilot/surface-core-facade.ts',
    path.join(runtimeRoot, 'surface-core-facade.mjs'));
  const { startSurfaceCoreFacade } = await import(pathToFileURL(entry).href);
  const running = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin,
    fullIntegration: true, nativeTextPilot });
  assert.ok(path.resolve(running.core.databasePath).startsWith(path.resolve(runtimeRoot) + path.sep),
    'the disposable Core SQLite profile belongs to this fresh runtime');
  assert.ok(path.resolve(process.env.HUABU_DATA_DIR).startsWith(path.resolve(runtimeRoot) + path.sep),
    'Huabu private profile belongs to this fresh runtime');
  assert.equal(process.env.LCOS_CAPTURE_STAGING_ROOT, captureRoot,
    'Capture staging has its own fresh runtime directory');
  report.runtimes ??= [];
  report.runtimes.push({ runtimeRoot, coreDatabasePath: running.core.databasePath,
    huabuDataPath: process.env.HUABU_DATA_DIR, captureRoot, nativeTextPilot });
  return running;
}

function primaryBinding(activeFacade, canvasId, nodeId) {
  const binding = activeFacade.core.repository.getProjectionBindings(activeFacade.core.projectId)
    .find(item => item.canvasId === canvasId && item.spatialKind === 'node' && item.spatialId === nodeId);
  assert.equal(binding?.entityType, 'artifact', 'the fixture text carrier is the primary Artifact occurrence');
  return String(binding.entityId);
}

function canvasTextPath(projectId, canvasId, nodeId) {
  return `/api/lcos/core/projects/${encodeURIComponent(projectId)}/curation/canvas-text?canvasId=${encodeURIComponent(canvasId)}&spatialId=${encodeURIComponent(nodeId)}`;
}

async function canvasFileBytes(projectId, fileRecordId) {
  const response = await call('GET', `/api/lcos/core/projects/${encodeURIComponent(projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.ok(Buffer.isBuffer(response.body));
  return response.body;
}

function exactSpatialState(value) {
  return structuredClone({ version: value.version, updatedAt: value.updatedAt, state: value.state });
}

async function setTextMode(canvasId, nodeId, ref, mode) {
  return call('POST', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}/nodes:batchActions`, {
    canvas_id: canvasId,
    actions: [{ action: 'update', updates: [{ id: nodeId,
      data: { id: nodeId, lcos_ref: ref, lcosTextViewMode: mode } }] }],
  });
}

try {
  const nativeRuntime = path.join(testRoot, 'native-text-pilot');
  await mkdir(nativeRuntime, { recursive: true });
  facade = await openRuntime(nativeRuntime, true);

  const canvasId = 'surface-core-main';
  const nodeId = 'surface-main-text';
  const canvasPath = `/api/canvas/v1/canvases/${canvasId}`;
  const initialSpatial = await facade.spatial.read(canvasId);
  const rawInitial = initialSpatial.state.nodes.find(node => node.id === nodeId);
  assert.ok(rawInitial);
  assert.equal(Object.hasOwn(rawInitial.data, 'lcosTextViewMode'), false,
    'the persisted synthetic note starts without a presentation override');

  const artifactId = primaryBinding(facade, canvasId, nodeId);
  const initialCoreResponse = await call('GET', canvasTextPath(facade.core.projectId, canvasId, nodeId));
  assert.equal(initialCoreResponse.status, 200, JSON.stringify(initialCoreResponse.body));
  const initialCore = structuredClone(initialCoreResponse.body.value);
  const revisionsBeforeGet = facade.core.repository.getArtifactRevisions(artifactId).map(item => item.id);
  const filesBeforeGet = facade.core.repository.getFileRecords(facade.core.projectId).map(({ id, observedPath, observedHash, size, mimeType }) =>
    ({ id, observedPath, observedHash, size, mimeType }));
  const initialRevision = facade.core.repository.getArtifactRevision(initialCore.revisionId);
  assert.ok(initialRevision);
  const initialFileRecordId = String(initialRevision.fileRecordId);
  const initialFile = facade.core.repository.getFileRecord(initialFileRecordId);
  assert.ok(initialFile);
  const initialBytes = await canvasFileBytes(facade.core.projectId, initialFileRecordId);
  assert.equal(initialBytes.toString('utf8'), initialCore.body);

  const initialCanvasResponse = await call('GET', canvasPath);
  assert.equal(initialCanvasResponse.status, 200, JSON.stringify(initialCanvasResponse.body));
  const initialDto = initialCanvasResponse.body.data.nodes.find(node => node.id === nodeId);
  assert.equal(initialDto?.data?.lcosTextViewMode, 'text',
    'nativeTextPilot opts the read DTO into an explicit default text face');
  assert.equal(initialDto.data.lcos_ref.artifactId, artifactId);
  const spatialAfterGet = await facade.spatial.read(canvasId);
  assert.deepEqual(exactSpatialState(spatialAfterGet), exactSpatialState(initialSpatial),
    'the read-only default is projected; Canvas GET does not MERGE into Huabu');
  const coreAfterGetResponse = await call('GET', canvasTextPath(facade.core.projectId, canvasId, nodeId));
  assert.deepEqual(coreAfterGetResponse.body.value, initialCore,
    'Canvas GET does not create or advance a canonical Core text revision');
  assert.deepEqual(facade.core.repository.getArtifactRevisions(artifactId).map(item => item.id), revisionsBeforeGet);
  assert.deepEqual(facade.core.repository.getFileRecords(facade.core.projectId).map(({ id, observedPath, observedHash, size, mimeType }) =>
    ({ id, observedPath, observedHash, size, mimeType })), filesBeforeGet,
  'Canvas GET does not add, replace, or reobserve any project FileRecord');
  assert.deepEqual(await canvasFileBytes(facade.core.projectId, initialFileRecordId), initialBytes,
    'the existing immutable FileRecord bytes are unchanged by GET');
  report.cases.push('opt-in Canvas GET returns text default without Core revision/FileRecord change or Huabu spatial write');

  const originalData = structuredClone(initialDto.data);
  const toMindMap = await setTextMode(canvasId, nodeId, originalData.lcos_ref, 'mindmap');
  assert.equal(toMindMap.status, 200, JSON.stringify(toMindMap.body));
  const mindMapDtoResponse = await call('GET', canvasPath);
  assert.equal(mindMapDtoResponse.body.data.nodes.find(node => node.id === nodeId).data.lcosTextViewMode, 'mindmap');
  const mindMapSpatial = await facade.spatial.read(canvasId);
  assert.equal(mindMapSpatial.state.nodes.find(node => node.id === nodeId).data.lcosTextViewMode, 'mindmap',
    'the original nodes:batchActions presentation patch reaches Huabu MERGE');

  // O8 captures the original read DTO. Restoring its initial `text` value is
  // the backend MERGE case under test; native GUI/history interaction is not.
  const restoreText = await setTextMode(canvasId, nodeId, originalData.lcos_ref, originalData.lcosTextViewMode);
  assert.equal(restoreText.status, 200, JSON.stringify(restoreText.body));
  const restoredDtoResponse = await call('GET', canvasPath);
  assert.equal(restoredDtoResponse.status, 200, JSON.stringify(restoredDtoResponse.body));
  const restoredDto = restoredDtoResponse.body.data.nodes.find(node => node.id === nodeId);
  assert.equal(restoredDto.data.lcosTextViewMode, 'text',
    'the initial read DTO explicitly restores text instead of omitting the field');
  const restoredSpatial = await facade.spatial.read(canvasId);
  assert.equal(restoredSpatial.state.nodes.find(node => node.id === nodeId).data.lcosTextViewMode, 'text');
  const restoredCoreResponse = await call('GET', canvasTextPath(facade.core.projectId, canvasId, nodeId));
  assert.deepEqual(restoredCoreResponse.body.value, initialCore,
    'switching mode and restoring the initial mode leaves canonical body and revision unchanged');
  assert.deepEqual(facade.core.repository.getArtifactRevisions(artifactId).map(item => item.id), revisionsBeforeGet);
  assert.deepEqual(facade.core.repository.getFileRecords(facade.core.projectId).map(({ id, observedPath, observedHash, size, mimeType }) =>
    ({ id, observedPath, observedHash, size, mimeType })), filesBeforeGet,
  'presentation-only native batches do not create or rewrite project FileRecords');
  const restoredRevision = facade.core.repository.getArtifactRevision(initialCore.revisionId);
  assert.equal(String(restoredRevision.fileRecordId), initialFileRecordId);
  assert.deepEqual(await canvasFileBytes(facade.core.projectId, initialFileRecordId), initialBytes);
  report.cases.push('native nodes:batchActions toggles mindmap then restores the initial text DTO through backend MERGE; Core body/revision/FileRecord stay unchanged');

  await facade.close();
  facade = undefined;

  // Independent default-mode runtime verifies the opt-in flag does not alter
  // the pre-existing DTO shape.
  const defaultRuntime = path.join(testRoot, 'default-facade');
  await mkdir(defaultRuntime, { recursive: true });
  facade = await openRuntime(defaultRuntime, false);
  const defaultSpatial = await facade.spatial.read(canvasId);
  const defaultRaw = defaultSpatial.state.nodes.find(node => node.id === nodeId);
  assert.equal(Object.hasOwn(defaultRaw.data, 'lcosTextViewMode'), false);
  const defaultDtoResponse = await call('GET', canvasPath);
  assert.equal(defaultDtoResponse.status, 200, JSON.stringify(defaultDtoResponse.body));
  const defaultDto = defaultDtoResponse.body.data.nodes.find(node => node.id === nodeId);
  assert.equal(Object.hasOwn(defaultDto.data, 'lcosTextViewMode'), false,
    'nativeTextPilot=false preserves the old DTO omission');
  assert.deepEqual(exactSpatialState(await facade.spatial.read(canvasId)), exactSpatialState(defaultSpatial));
  report.cases.push('independent nativeTextPilot=false runtime keeps legacy DTO omission and read-only spatial state');

  console.log(JSON.stringify(report, null, 2));
  console.log('SCOPE: real disposable Local Core SQLite + Huabu disk facade. O8/GUI history behavior was not exercised.');
} finally {
  try { await facade?.close(); }
  finally {
    for (const key of envKeys) {
      if (priorEnv[key] === undefined) delete process.env[key];
      else process.env[key] = priorEnv[key];
    }
  }
}
