import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(root, '.runtime', `native-assembly-facade-test-${Date.now()}-${process.pid}`);
const touched = new Map();
const replaceEnv = (key, value) => { if (!touched.has(key)) touched.set(key, process.env[key]);
  if (value === undefined) delete process.env[key]; else process.env[key] = value; };
for (const key of Object.keys(process.env)) {
  if (/^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_KEY|OPENROUTER_|AZURE_OPENAI_)/.test(key)) replaceEnv(key, undefined);
}
replaceEnv('LCOS_CAPTURE_STAGING_ROOT', path.join(runtimeRoot, 'capture'));
replaceEnv('LCOS_OCR_RUNTIME_DIR', path.join(runtimeRoot, 'ocr'));
replaceEnv('LCOS_RECOVERY_TRANSPORT', 'none');
replaceEnv('LCOS_OLLAMA_URL', 'http://127.0.0.1:1');
await mkdir(runtimeRoot, { recursive: true });
const origin = 'http://127.0.0.1:19876'; // handler address only; not an existing preview
let facade;
const call = (method, address, body) => facade.handle({ method, pathname: new URL(address, origin).pathname, url: origin + address, body });
const value = async address => { const response = await call('GET', address); assert.equal(response.status, 200);
  assert.equal(response.body.ok, true); return response.body.value; };
const native = async address => { const response = await call('GET', address); assert.equal(response.status, 200);
  assert.equal(response.body.code, 0); return response.body.data; };
try {
  const entry = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'facade.mjs'), 'node', { coreCollectionTitle: true });
  const { startSurfaceCoreFacade } = await import(pathToFileURL(entry).href);
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true,
    nativeCollectionPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true });
  assert.ok(facade.core.databasePath.startsWith(runtimeRoot + path.sep));
  const pid = facade.core.projectId, project = '/api/lcos/core/projects/' + encodeURIComponent(pid);
  const canvasId = 'surface-core-workflow', nodeId = 'surface-workflow-text';
  const textPath = project + '/curation/canvas-text?canvasId=' + canvasId + '&spatialId=' + nodeId;
  const original = await value(textPath);
  const written = await call('PUT', project + '/curation/canvas-text', { canvasId, spatialId: nodeId,
    artifactId: original.artifactId, expectedRevisionId: original.revisionId, body: original.body + '\n\nAssembly exact-version fixture.' });
  assert.equal(written.status, 200); assert.equal(written.body.ok, true);
  const current = await value(textPath);
  assert.notEqual(current.revisionId, original.revisionId);
  const graphBefore = await value(project + '/graph');
  const spatialBefore = await facade.spatial.read(canvasId);
  const folders = await native('/api/library/v1/spaces/SPACE_TYPE_PRIVATE/folders');
  const folderId = folders.folders[0].id;
  const list = await native('/api/library/v1/folders/' + encodeURIComponent(folderId) + '/assets?page_size=1&type_filter=4');
  assert.equal(list.assets.length, 1); assert.equal(list.assets[0].asset_type, 4); assert.ok(list.pagination.has_next);
  const search = await native('/api/library/v1/assets:search?space_type=SPACE_TYPE_PRIVATE&keyword=Workflow&type_filter=4');
  const row = search.items.find(item => item.asset.id === current.artifactId).asset;
  assert.equal(row.lcos_projection.project_id, pid);
  assert.equal(row.lcos_projection.presented_revision_id, current.revisionId);
  assert.equal(row.lcos_projection.artifact_view_id, current.viewId);
  const detail = await native('/api/library/v1/assets/' + encodeURIComponent(current.artifactId) + '?revision_id=' + encodeURIComponent(original.revisionId));
  assert.equal(detail.asset.lcos_projection.presented_revision_id, original.revisionId);
  assert.equal(detail.asset.lcos_projection.artifact_view_id, null);
  assert.equal(detail.asset.lcos_projection.assembly_item.entityRef.viewId, undefined);
  const bytes = await call('GET', new URL(detail.asset.source_url).pathname);
  assert.equal(bytes.status, 200); assert.ok(Buffer.isBuffer(bytes.body)); assert.equal(bytes.body.toString('utf8'), original.body);
  assert.equal((await call('GET', '/api/library/v1/assets/' + encodeURIComponent(current.artifactId) + '?revision_id=foreign')).status, 404);
  assert.equal((await call('GET', '/api/library/v1/assets/foreign')).status, 404);
  assert.equal((await call('GET', '/api/library/v1/assets:search?type_filter=2')).status, 501);
  assert.equal((await call('DELETE', '/api/library/v1/assets/' + encodeURIComponent(current.artifactId))).status, 501);
  assert.equal((await call('GET', '/api/library/v1/spaces/SPACE_TYPE_TEAM/folders')).status, 501);
  assert.deepEqual(await value(project + '/graph'), graphBefore, 'Library reads cannot mutate Core graph, refs or revisions.');
  assert.deepEqual(await facade.spatial.read(canvasId), spatialBefore, 'Library reads cannot mutate the original spatial owner.');
  assert.deepEqual(await value(textPath), current, 'Historical preview cannot change Current text or View.');
  assert.deepEqual(await value(project + '/runs'), []);
  console.log(JSON.stringify({ passed: true, runtimeRoot, realCoreAndHuabu: true,
    checks: ['Warehouse search and type filtering before pagination', 'exact historical FileRecord bytes with no borrowed Current View',
      'foreign identities and unsupported mutation/cloud rejected', 'Core/spatial/body/runs unchanged after reads'],
    originalDatabaseOpened: false, providerExecuted: false }));
} finally {
  try { await facade?.close(); } finally {
    for (const [key, old] of touched) { if (old === undefined) delete process.env[key]; else process.env[key] = old; }
  }
}
