import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { Server } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformNativeHistoryScript } from '../lab/native-history-transform.mjs';
import { transformNativeLightThemeScript } from '../lab/native-light-theme-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, 'output/原流程施工_20261017b'); await fs.mkdir(evidence, { recursive: true });
await fs.mkdir(path.join(root, '.runtime'), { recursive: true });
const temp = await fs.mkdtemp(path.join(root, '.runtime/native-history-test-'));
const assets = path.join(root, 'reference/tapnow-installed/resources/web/assets');
const report = { passed: false, cases: [], liveRuntimeBuilt: false, modelsExecuted: false, originalDataTouched: false,
  boundary: 'Original source transform tests and a separate disposable real Core facade; not current 56238 browser validation.' };
function declarations(ast) { return new Map(ast.body.flatMap(node => node.type === 'FunctionDeclaration' ? [[node.id.name, node]]
  : node.type === 'VariableDeclaration' ? node.declarations.map(row => [row.id?.name, row]) : [])); }
for (const asset of ['page-Da_DfwiK.js', 'useHistoryAssetList-DmiPqiyV.js']) {
  const original = await fs.readFile(path.join(assets, asset), 'utf8');
  const transformed = transformNativeHistoryScript(asset, original);
  assert.equal(transformNativeHistoryScript(asset, transformed), transformed);
  const before = declarations(parseOriginalDonorScript(original, asset));
  const after = declarations(parseOriginalDonorScript(transformed, asset));
  const changed = new Set(asset.startsWith('page') ? ['cm', 'GH', 'l9', 'aE', 'YH', 'WH', 'r9'] : ['J', 'B']);
  for (const [name, node] of before) if (!changed.has(name)) {
    const next = after.get(name); assert.ok(next, name); assert.equal(transformed.slice(next.start, next.end), original.slice(node.start, node.end), name);
  }
  const painted = transformNativeLightThemeScript(asset, transformed);
  parseOriginalDonorScript(painted, asset);
  if (asset.startsWith('page')) {
    assert.match(transformed, /lcosApplyHistory\(q\)/); assert.match(transformed, /onApplySelection:Y/);
    assert.match(transformed, /text:lcosHistoryText,other:lcosHistoryOther/);
    assert.match(transformed, /U\.reload\(\)/);
    // Expanded original r9 and its native dialog/slider/grid were untouched.
    assert.equal(transformed.match(/"data-history-panel"/g).length, original.match(/"data-history-panel"/g).length);
  }
  assert.equal(await fs.readFile(path.join(assets, asset), 'utf8'), original);
}
assert.equal(transformNativeHistoryScript('unrelated.js', 'unchanged'), 'unchanged');
report.cases.push('actual original sidebar/expanded owner untouched except exact actions, type maps, version captions and retry; parse/idempotence/light composition');
const originalIndex = await fs.readFile(path.join(assets, 'index-BAQXnPag.js'), 'utf8');
const inOwner = declarations(parseOriginalDonorScript(originalIndex, 'index-BAQXnPag.js')).get('In');
const exactPath = vm.runInNewContext('const ' + originalIndex.slice(inOwner.start, inOwner.end) + ';In.dialog("v1/me/generation-history")');

process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1';
const originalFetch = globalThis.fetch;
const ownedOrigins = () => new Set(process._getActiveHandles().filter(handle => handle instanceof Server && handle.listening).flatMap(handle => {
  const value = handle.address(); return value && typeof value !== 'string' && ['127.0.0.1', '::1'].includes(value.address)
    ? [`http://${value.address === '::1' ? '[::1]' : value.address}:${value.port}`] : [];
}));
globalThis.fetch = (address, options) => {
  const value = new URL(address instanceof Request ? address.url : String(address));
  if (!ownedOrigins().has(value.origin) || ['56238', '17879', '17880', '17881'].includes(value.port)) throw new Error('History test refused an unowned endpoint.');
  return originalFetch(address, options);
};
let facade;
try {
  const entry = path.join(temp, 'fixture.ts'), relative = file => path.relative(temp, path.join(root, file)).replaceAll('\\', '/');
  await fs.writeFile(entry, [
    `export {startSurfaceCoreFacade} from ${JSON.stringify(relative('lab/pilot/surface-core-facade.ts'))};`,
    `export {createNativeHistoryProjection,nativeHistoryPath,nativeHistoryType} from ${JSON.stringify(relative('lab/pilot/native-history-projection.ts'))};`,
    `export {applyNativeHistoryItems,readNativeHistoryReference,nativeHistoryPlacementKey} from ${JSON.stringify(relative('lab/pilot/native-history-actions.ts'))};`,
  ].join('\n'));
  const bundle = path.join(temp, 'fixture.mjs');
  await buildPilotEntry(path.relative(root, entry), bundle, 'node', { coreCollectionTitle: true });
  const mod = await import(pathToFileURL(bundle));
  assert.equal(mod.nativeHistoryPath, exactPath, 'route comes from actual original In.dialog prefix');
  facade = await mod.startSurfaceCoreFacade({ runtimeRoot: path.join(temp, 'owned'), publicOrigin: 'http://127.0.0.1:19927',
    fullIntegration: true, nativeCollectionPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeRailPilot: true });
  const { repository, projectId } = facade.core;
  const call = (method, url, body) => facade.handle({ method, url, body });
  const read = async query => { const response = await call('GET', exactPath + '?' + new URLSearchParams(query));
    assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body.data; };
  const main = (await call('GET', '/api/canvas/v1/canvases/surface-core-main')).body.data;
  const ref = main.nodes.find(row => row.id === 'surface-main-text').data.lcos_ref;
  const oldRevision = ref.revisionId;
  const edited = await call('PUT', `/api/lcos/core/projects/${projectId}/curation/canvas-text`, {
    canvasId: main.id, spatialId: 'surface-main-text', artifactId: ref.artifactId, expectedRevisionId: ref.revisionId,
    body: 'History fixture current text. Earlier immutable bytes must stay separately addressable.',
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  const text = await read({ generation_type: 'text', offset: '0', limit: '200' });
  const sameMaterial = text.items.filter(row => row.lcos_history.artifactId === ref.artifactId);
  assert.equal(sameMaterial.length, 2); assert.ok(sameMaterial.some(row => row.id === oldRevision && row.prompt.includes('历史版本')));
  assert.ok(sameMaterial.some(row => row.prompt.includes('当前版本')));
  for (const row of text.items) {
    const revision = repository.getArtifactRevision(row.id);
    assert.equal(row.id, row.lcos_history.revisionId); assert.equal(String(revision.fileRecordId), row.lcos_history.fileRecordId);
    assert.equal(row.generation_id, undefined, 'imported/external text has no invented generation Run');
  }
  const scoped = await read({ generation_type: 'text', canvas_id: main.id });
  assert.equal(scoped.items.filter(row => row.lcos_history.artifactId === ref.artifactId).length, 2);
  assert.ok(scoped.items.length < text.items.length);
  const pages = await Promise.all([0, 1].map(offset => read({ generation_type: 'text', offset: String(offset), limit: '1' })));
  assert.equal(pages[0].items.length, 1); assert.equal(pages[1].items.length, 1); assert.notEqual(pages[0].items[0].id, pages[1].items[0].id);
  assert.equal(pages[0].total, text.total);
  const image = await read({ generation_type: 'image' }); assert.ok(image.total >= 1, 'real import deduplication may share one image across Workspaces');
  const selected = image.items[0], content = await call('GET', new URL(selected.file_url).pathname);
  assert.equal(content.status, 200); assert.ok(Buffer.isBuffer(content.body)); assert.ok(content.body.length > 0);
  const search = await read({ generation_type: 'text', search: repository.getArtifact(ref.artifactId).title });
  assert.ok(search.items.some(row => row.id === oldRevision));
  for (const type of ['video', 'audio', 'threed']) assert.equal((await read({ generation_type: type })).total, 0, 'no fabricated ' + type + ' history');
  assert.equal((await call('GET', exactPath + '?canvas_id=foreign&generation_type=text')).status, 404);
  assert.equal((await call('GET', exactPath + '?limit=0')).status, 400);
  assert.equal((await call('GET', exactPath + '?offset=-1')).status, 400);
  assert.equal((await call('POST', exactPath, {})).status, 501);
  report.cases.push('registered production GET reads actual disposable SQLite ArtifactRevision journal, immutable old/current FileRecords, original offset pagination/search/type/workspace filter and real bytes');

  // Read-model edge cases use explicit repository fixtures, separate from the
  // preceding real Core proof. No runtime/model execution is inferred.
  const artifact = { ...repository.getArtifact(ref.artifactId) }, revision = { ...repository.getArtifactRevision(oldRevision) };
  const file = { ...repository.getFileRecord(String(revision.fileRecordId)) };
  const site = repository.getWorkspaces(projectId).find(row => row.canvasId === main.id);
  let artifactRow = artifact, revisionRow = revision, fileRow = file, runRow;
  const mocked = { getProject: () => ({ id: projectId }), getArtifacts: () => [artifactRow], getArtifactRevisions: () => [revisionRow],
    getFileRecord: () => fileRow, getRun: () => runRow, getWorkspaces: () => [site], listWorkspaceMembers: () => [],
    getArtifactView: () => undefined, getProjectionBindings: () => [] };
  const unit = mod.createNativeHistoryProjection({ repository: mocked, projectId, publicOrigin: 'http://127.0.0.1:19927' });
  const unitRead = async (type = 'text', query = '') => (await unit({ url: exactPath + '?generation_type=' + type + query })).body.data.items;
  revisionRow = { ...revision, runId: 'real-fixture-run', source: 'run', status: 'draft' };
  runRow = { id: 'real-fixture-run', projectId, workspaceId: site.id, shortSummary: '任务输出' };
  let records = await unitRead('text', '&canvas_id=' + main.id); assert.equal(records.length, 1);
  assert.equal(records[0].generation_id, runRow.id); assert.equal(records[0].lcos_history.placeable, false);
  assert.equal(records[0].lcos_history.status, 'draft');
  runRow = undefined; records = await unitRead(); assert.equal(records.length, 1);
  assert.equal(records[0].generation_id, undefined); assert.match(records[0].prompt, /来源任务暂不可读/);
  runRow = { id: 'real-fixture-run', projectId, workspaceId: site.id, shortSummary: '任务输出' };
  runRow = { ...runRow, projectId: 'foreign' }; assert.equal((await unitRead()).length, 0);
  revisionRow = revision; runRow = undefined;
  artifactRow = { ...artifact, archivedAt: '2026-10-17T00:00:00.000Z' };
  records = await unitRead(); assert.equal(records[0].lcos_history.readable, true); assert.equal(records[0].lcos_history.placeable, false);
  artifactRow = artifact; fileRow = { ...file, availability: 'missing' };
  records = await unitRead(); assert.equal(records.length, 1); assert.equal(records[0].file_url, ''); assert.equal(records[0].lcos_history.readable, false);
  fileRow = { ...file, observedHash: 'different' }; assert.equal((await unitRead())[0].lcos_history.readable, false);
  fileRow = undefined; records = await unitRead('other'); assert.equal(records.length, 1); assert.equal(records[0].lcos_history.readable, false);
  fileRow = { ...file, projectId: 'foreign' }; assert.equal((await unitRead()).length, 0);
  assert.equal(mod.nativeHistoryType('application/pdf'), 'other'); assert.equal(mod.nativeHistoryType('model/gltf-binary'), 'threed');
  report.cases.push('read-model fixtures: actual Run attribution only, draft/archived/missing/hash-mismatch records retained with honest capabilities; foreign links excluded; unknown MIME not cast to text');

  const uncertain = new Set(), calls = [], row = sameMaterial.find(row => row.id === oldRevision);
  const owner = { projectId, canvasId: main.id, workspaceId: String(site.id), api: {}, isCurrent: () => true, uncertain,
    place: async (input, options) => { calls.push({ input, readOnly: options.readOnly }); return calls.length === 1
      ? { status: 'unconfirmed', message: 'Synthetic lost confirmation.' } : { status: 'already-present', nodeId: 'existing', artifactViewId: 'exact-view', revisionId: input.revisionId }; } };
  assert.equal((await mod.applyNativeHistoryItems([row], owner)).complete, false);
  assert.equal((await mod.applyNativeHistoryItems([row], owner)).complete, true);
  assert.equal(calls[0].readOnly, false); assert.equal(calls[1].readOnly, true);
  assert.equal(calls[1].input.revisionId, oldRevision); assert.equal(uncertain.size, 0);
  assert.equal((await mod.applyNativeHistoryItems([{ ...row, lcos_history: { ...row.lcos_history, status: 'draft', placeable: false } }], owner)).complete, false);
  assert.equal(calls.length, 2);
  assert.throws(() => mod.readNativeHistoryReference({ ...row, id: 'another-version' }));
  assert.equal((await mod.applyNativeHistoryItems([row], { ...owner, isCurrent: () => false })).complete, false);
  report.cases.push('actual apply coordinator preserves historical revision, shares exact placement producer, unknown retry is readOnly verification, refuses draft/wrong address/changed scene');
  report.passed = true;
  await fs.writeFile(path.join(evidence, 'history-source-core-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await facade?.close(); globalThis.fetch = originalFetch; }
