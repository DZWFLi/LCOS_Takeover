import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(root, '.runtime', `native-material-rail-facade-test-${Date.now()}-${process.pid}`);
const touched = new Map();
const env = (key, value) => { if (!touched.has(key)) touched.set(key, process.env[key]);
  if (value === undefined) delete process.env[key]; else process.env[key] = value; };
for (const key of Object.keys(process.env)) if (/^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_KEY|OPENROUTER_|AZURE_OPENAI_)/.test(key)) env(key, undefined);
env('LCOS_CAPTURE_STAGING_ROOT', path.join(runtimeRoot, 'capture'));
env('LCOS_OCR_RUNTIME_DIR', path.join(runtimeRoot, 'ocr'));
env('LCOS_RECOVERY_TRANSPORT', 'none'); env('LCOS_OLLAMA_URL', 'http://127.0.0.1:1');
await mkdir(runtimeRoot, { recursive: true });
let facade;
const origin = 'http://127.0.0.1:19876'; // Handler address only, never an existing preview.
const call = (method, address, body) => facade.handle({ method, pathname: new URL(address, origin).pathname, url: origin + address, body });
const value = async address => { const r = await call('GET', address); assert.equal(r.status, 200); assert.equal(r.body.ok, true); return r.body.value; };
const native = async address => { const r = await call('GET', address); assert.equal(r.status, 200); assert.equal(r.body.code, 0); return r.body.data; };
try {
  const [entry, policyEntry] = await Promise.all([
    buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'facade.mjs'), 'node', { coreCollectionTitle: true }),
    buildPilotEntry('lab/pilot/native-material-context.ts', path.join(runtimeRoot, 'context.mjs')),
  ]);
  const { startSurfaceCoreFacade } = await import(pathToFileURL(entry).href);
  const { buildNativeMaterialContext, verifyNativeMaterialLocation } = await import(pathToFileURL(policyEntry).href);
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true,
    nativeCollectionPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeRailPilot: true });
  const pid = facade.core.projectId, project = `/api/lcos/core/projects/${encodeURIComponent(pid)}`;
  assert.ok(facade.core.databasePath.startsWith(runtimeRoot + path.sep));
  const workspaces = await value(project + '/workspaces');
  const read = async (artifactId, revisionId) => {
    const graph = await value(project + '/graph');
    const [bindings, presentations, detail, sourceResponse, canvases] = await Promise.all([
      value(project + '/spatial/bindings'), value(project + '/presentations'), value('/api/lcos/core/artifacts/' + artifactId),
      call('GET', `/api/lcos/core/artifacts/${artifactId}/source-path`),
      Promise.all(workspaces.map(async row => ({ canvasId: row.canvasId, nodes: (await native('/api/canvas/v1/canvases/' + row.canvasId)).nodes }))),
    ]);
    const input = { projectId: pid, artifactId, revisionId, graph, workspaces, bindings, presentations, canvases,
      artifactDetail: detail, sourcePath: sourceResponse.status === 200 ? { status: 'registered', ...sourceResponse.body.value } : { status: 'unregistered' } };
    return { input, context: buildNativeMaterialContext(input) };
  };
  const initial = await value(project + '/graph');
  const image = initial.artifacts.find(row => row.kind === 'image');
  const imageRead = await read(image.id, image.currentRevisionId);
  assert.equal(imageRead.context.status, 'ready');
  assert.equal(imageRead.context.source.revision.source, 'import');
  assert.equal(imageRead.context.source.revision.runId, undefined);
  assert.equal(imageRead.context.locations.length, 3);
  assert.equal(new Set(imageRead.context.locations.map(row => row.canvasId)).size, 3);
  for (const row of imageRead.context.locations) assert.equal(verifyNativeMaterialLocation(imageRead.context, row).canNavigate, true);
  const textAddress = project + '/curation/canvas-text?canvasId=surface-core-workflow&spatialId=surface-workflow-text';
  const oldText = await value(textAddress);
  const written = await call('PUT', project + '/curation/canvas-text', { canvasId: oldText.canvasId, spatialId: oldText.spatialId,
    artifactId: oldText.artifactId, expectedRevisionId: oldText.revisionId, body: oldText.body + '\n\nTemporary Rail source fixture.' });
  assert.equal(written.status, 200); assert.equal(written.body.ok, true);
  const newText = await value(textAddress);
  const oldRead = await read(oldText.artifactId, oldText.revisionId);
  assert.equal(oldRead.context.status, 'ready');
  assert.equal(oldRead.context.source.revision.revisionId, oldText.revisionId);
  assert.equal(oldRead.context.locations.length, 1);
  assert.equal(oldRead.context.locations[0].revisionId, newText.revisionId);
  assert.equal(verifyNativeMaterialLocation(oldRead.context, oldRead.context.locations[0]).canNavigate, false);
  const textRead = await read(newText.artifactId, newText.revisionId);
  assert.equal(textRead.context.locations.length, 1);
  assert.equal(verifyNativeMaterialLocation(textRead.context, textRead.context.locations[0]).canNavigate, true);
  const graphBefore = await value(project + '/graph');
  const spatialBefore = await Promise.all(workspaces.map(row => facade.spatial.read(row.canvasId)));
  const filesBefore = await Promise.all(graphBefore.fileRecords.map(async file => {
    const result = await call('GET', project + '/file-records/' + file.id + '/content'); assert.equal(result.status, 200); return Buffer.from(result.body);
  }));
  for (const workspace of workspaces) {
    const scene = await native(`/api/canvas/${workspace.canvasId}/preview-scene`);
    assert.equal(scene.canvasId, workspace.canvasId);
    assert.ok(scene.nodes.some(row => row.id === `surface-${workspace.preferredSurface}-image`));
    assert.ok(scene.nodes.every(row => Number.isFinite(row.x) && Number.isFinite(row.y) && row.width > 0 && row.height > 0));
  }
  assert.equal((await call('GET', '/api/canvas/foreign/preview-scene')).status, 404);
  assert.equal((await call('POST', '/api/canvas/surface-core-main/preview-scene', {})).status, 501);
  await read(image.id, image.currentRevisionId);
  assert.deepEqual(await value(project + '/graph'), graphBefore);
  assert.deepEqual(await Promise.all(workspaces.map(row => facade.spatial.read(row.canvasId))), spatialBefore);
  assert.deepEqual(await value(project + '/runs'), []);
  for (const [index, file] of graphBefore.fileRecords.entries()) {
    const result = await call('GET', project + '/file-records/' + file.id + '/content'); assert.equal(result.status, 200);
    assert.ok(filesBefore[index].equals(Buffer.from(result.body)));
  }
  console.log(JSON.stringify({ passed: true, runtimeRoot, realCoreAndHuabu: true,
    checks: ['same exact PNG Artifact across three Workspaces', 'selected revision source independent of registration',
      'text historical location not replaced with Current', 'original Huabu inert scene producer and ownership refusal',
      'Core, runs, three scenes and every original FileRecord byte unchanged by reads'], providerExecuted: false, originalUserDatabaseOpened: false }));
} finally {
  try { await facade?.close(); } finally { for (const [key, value] of touched) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}
