import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
const root = path.resolve(import.meta.dirname, '..'), runtime = await fs.mkdtemp(path.join(root, '.runtime/ordinary-frame-title-'));
const runtimeRoot = path.join(runtime, 'owned'), output = path.join(root, 'output/普通Frame原名与子文字_20261028', new Date().toISOString().replace(/[:.]/g, '-')); await fs.mkdir(output, { recursive: true });
const report = { passed: false, runtimeRoot, output, cases: [], requests: [], network: [], models: 0, browsers: 0, activeCoreRequests: 0,
  scope: 'Actual original facade/Huabu/temporary Core frame-title wire and exact NodeContent read. No live fixture/Main, browser, model, manual SQLite/file mutation or long-running service.' };
const secretPattern = /^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|OPENROUTER_|DEEPSEEK_)/;
const beforeEnv = new Map(Object.entries(process.env).filter(([key]) => secretPattern.test(key))), oldFetch = globalThis.fetch;
for (const key of beforeEnv.keys()) delete process.env[key];
process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1';
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtime, 'capture'); process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtime, 'ocr');
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input)); assert.equal(url.protocol, 'http:');
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
  assert.ok(process._getActiveHandles().some(handle => handle instanceof Server && handle.listening && String(handle.address()?.port) === url.port), 'Only this test process owns the Core port');
  report.network.push({ path: url.pathname, method: init.method ?? 'GET' }); return oldFetch(input, { ...init, redirect: 'error' });
};
let facade;
const copy = structuredClone;
try {
  const entry = path.join(runtime, 'entry.ts'), relative = file => path.relative(runtime, path.join(root, file)).replaceAll('\\', '/');
  await fs.writeFile(entry, 'export{startSurfaceCoreFacade}from ' + JSON.stringify(relative('lab/pilot/surface-core-facade.ts'))
    + ';export{space}from ' + JSON.stringify(relative('lcos/huabu/apps/server/src/modules/storage/index.ts')) + ';');
  const module = await import(pathToFileURL(await buildPilotEntry(path.relative(root, entry), path.join(runtime, 'entry.mjs'), 'node',
    { coreColorPin: true, coreCollectionTitle: true, coreWorkspaceMembership: true, coreWorkflowCollectionMembers: true, coreMixedScopeContext: true })));
  facade = await module.startSurfaceCoreFacade({ runtimeRoot, publicOrigin: 'http://127.0.0.1:19948', fullIntegration: true,
    nativeCollectionPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeRailPilot: true });
  const repo = facade.core.repository, projectId = facade.core.projectId, canvasId = 'surface-core-main';
  const canvasPath = '/api/canvas/v1/canvases/' + canvasId, batchPath = canvasPath + '/nodes:batchActions';
  const call = async (method, url, body) => { const response = await facade.handle({ method, url, body }); report.requests.push({ method, url, status: response.status }); return response; };
  const ok = async (method, url, body) => { const response = await call(method, url, body); assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body.value ?? response.body.data ?? response.body; };
  const read = () => ok('GET', canvasPath), content = async id => (await module.space(canvasId).nodes.read(id))?.record;
  const raw = () => facade.spatial.read(canvasId);
  const assertApplied = result => assert.ok(result.results.every(row => row.applied === true), JSON.stringify(result));
  const run = async commands => { const result = await facade.spatial.execute(canvasId, commands); assertApplied(result); return result; };
  const titleWire = (nodeId, before, after, beforeLabel = before, phase = 'apply', operationId = randomUUID()) => ({ canvas_id: canvasId,
    actions: [{ action: 'update', updates: [{ id: nodeId, data: { title: phase === 'undo' ? before : after } }] }],
    lcos_operation: { version: 1, operationId, kind: 'frame-title', phase, title: { nodeId, before, after, beforeLabel } } });
  const phase = (wire, next) => titleWire(wire.lcos_operation.title.nodeId, wire.lcos_operation.title.before, wire.lcos_operation.title.after,
    wire.lcos_operation.title.beforeLabel, next, wire.lcos_operation.operationId);
  const initialCanvas = await read(), originalCanonical = copy(initialCanvas.nodes.find(node => node.id === 'surface-main-text'));
  assert.ok(originalCanonical?.data?.lcos_ref); assert.ok(originalCanonical.data.text);
  await run([{ type: 'CREATE_NODES', nodes: [
    { id: 'title-frame', nodeType: 'frame', position: { x: 1800, y: 1000 }, size: { width: 900, height: 700 }, data: { label: '原外框', sizing: 'manual', layoutMode: 'free' } },
    { id: 'title-nested', nodeType: 'frame', position: { x: 1900, y: 1100 }, size: { width: 440, height: 300 }, data: { label: '原内框', sizing: 'manual', layoutMode: 'free' } },
    { id: 'title-unnamed', nodeType: 'frame', position: { x: 2900, y: 1100 }, size: { width: 300, height: 240 }, data: { label: null, sizing: 'manual', layoutMode: 'free' } },
    { id: 'title-note', nodeType: 'note', position: { x: 1970, y: 1175 }, size: { width: 220, height: 140 }, data: { label: '原子标题', content: '原子正文保持\n第二行\n\n👋🏽 **原格式**' } },
  ] }, { type: 'SET_NODE_PARENT', nodeIds: ['title-nested'], parentId: 'title-frame' },
  { type: 'SET_NODE_PARENT', nodeIds: ['title-note', 'surface-main-text'], parentId: 'title-nested' }]);
  // Explicit null is an original NodeContent value, not a display placeholder.
  const unnamed = await module.space(canvasId).nodes.read('title-unnamed'); assert.ok(unnamed);
  if (unnamed.record.label !== null) {
    const saved = await module.space(canvasId).nodes.put({ nodeId: 'title-unnamed', expectedRevision: unnamed.revision, record: { ...unnamed.record, label: null } });
    assert.equal(saved.ok, true); assert.equal(saved.record.label, null);
  }
  // Lock rejection is proved against its exact locked state. The original
  // lock owner adds className/neutral draggable fields on unlock (and currently
  // appends another nopan token each cycle), so do this explicit initialization
  // before the title-only comparison rather than ignoring those fields later.
  const beforeLocks = copy(await raw()), coreBeforeLocks = copy(repo.get(projectId));
  for (const locked of ['title-frame', 'title-nested']) {
    await run([{ type: 'SET_NODE_LOCKED', items: [{ nodeId: locked, locked: true }] }]);
    for (const target of locked === 'title-frame' ? ['title-frame','title-nested'] : ['title-nested']) {
      const exact = copy(await raw()), exactRecords = new Map(); for (const node of exact.state.nodes) exactRecords.set(node.id, copy(await content(node.id)));
      const label = target === 'title-frame' ? '原外框' : '原内框'; const response = await call('POST', batchPath, titleWire(target, label, '锁定时不能改'));
      assert.equal(response.status, 409, JSON.stringify(response.body)); assert.equal(response.body.error.code, 'NODE_LOCKED'); assert.deepEqual(await raw(), exact);
      for (const [id, record] of exactRecords) assert.deepEqual(await content(id), record);
      assert.deepEqual(repo.get(projectId), coreBeforeLocks);
    }
    await run([{ type: 'SET_NODE_LOCKED', items: [{ nodeId: locked, locked: false }] }]);
  }
  const lockFields = value => value.state.nodes.map(node => ({ id: node.id, className: node.className, draggable: node.draggable, locked: node.data?.locked }));
  report.originalLockInitialization = { before: lockFields(beforeLocks), after: lockFields(await raw()),
    boundary: 'Original SET_NODE_LOCKED/unlock materializes neutral fields and can append duplicate nopan classes; no title request is allowed to change them. Title-only comparisons start after these explicit original fixture operations.' };
  report.cases.push('Actual original own/ancestor locks reject title requests with exact complete spatial/NodeContent/Core equality; explicit original unlock metadata is recorded before title-only comparisons');
  const frameIds = new Set(['title-frame','title-nested','title-unnamed']);
  const baseline = copy(await raw()), graph = copy(repo.get(projectId)), bindings = copy(repo.getProjectionBindings(projectId)), execution = copy(repo.getProjectExecutionProjection(projectId));
  const bytes = await Promise.all(graph.fileRecords.map(async row => ({ id: row.id, file: row.observedPath, bytes: await fs.readFile(row.observedPath) }))); assert.equal(bytes.length, 7);
  const records = new Map(); for (const node of baseline.state.nodes) records.set(node.id, copy(await content(node.id)));
  const protectedSpatial = snapshot => { const value = copy(snapshot); delete value.version; delete value.updatedAt;
    for (const node of value.state.nodes) if (frameIds.has(node.id)) for (const key of ['label','labelSource']) delete node.data[key]; return value; };
  const protectedRecord = (id, record) => { const value = copy(record); if (frameIds.has(id)) for (const key of ['label','labelSource']) delete value[key]; return value; };
  const preserve = async label => {
    assert.deepEqual(protectedSpatial(await raw()), protectedSpatial(baseline), label + ' original geometry/parent/body/GUI');
    assert.deepEqual(repo.get(projectId), graph, label + ' Core domain'); assert.deepEqual(repo.getProjectionBindings(projectId), bindings, label + ' canonical bindings');
    assert.deepEqual(repo.getProjectExecutionProjection(projectId), execution, label + ' Run/result state');
    for (const row of bytes) assert.ok((await fs.readFile(row.file)).equals(row.bytes), row.id + ' seven original file bytes');
    for (const [id, original] of records) assert.deepEqual(protectedRecord(id, await content(id)), protectedRecord(id, original), id + ' original NodeContent body/type/meta');
  };
  const beforeReject = async (label, body, expected = 409) => {
    const prior = copy(await raw()), priorRecords = new Map(); for (const node of prior.state.nodes) priorRecords.set(node.id, copy(await content(node.id)));
    const response = await call('POST', batchPath, body); assert.equal(response.status, expected, label + ': ' + JSON.stringify(response.body));
    assert.deepEqual(await raw(), prior, label + ' rejected before spatial write');
    for (const [id, original] of priorRecords) assert.deepEqual(await content(id), original, label + ' original record unchanged');
    assert.deepEqual(repo.get(projectId), graph); assert.deepEqual(repo.getProjectionBindings(projectId), bindings); return response;
  };
  const submit = async wire => {
    const before = await raw(), data = await ok('POST', batchPath, wire), meta = wire.lcos_operation, desired = meta.phase === 'undo' ? meta.title.before : meta.title.after;
    const receipt = data.frame_title_receipt; assert.ok(receipt); assert.deepEqual(receipt, { canvasId, nodeId: meta.title.nodeId, operationId: meta.operationId, phase: meta.phase,
      ...meta.title, title: desired, spatialSaved: true, fromVersion: before.version, toVersion: (await raw()).version });
    assert.equal(data.spatial_saved, true); assert.equal(data.core_saved, false); assert.equal((await read()).nodes.find(node => node.id === meta.title.nodeId).data.title, desired);
    assert.equal((await content(meta.title.nodeId)).label, meta.phase === 'undo' ? meta.title.beforeLabel : meta.title.after); await preserve('title ' + meta.phase); return receipt;
  };
  let dto = await read(); const note = dto.nodes.find(node => node.id === 'title-note'), noteRecord = await content('title-note');
  assert.equal(note.parent_id, 'title-nested'); assert.equal(note.type, 'text'); assert.equal(note.data.type, 'pure'); assert.equal(note.data.lcos_ordinary_text_readonly, true);
  assert.equal(note.data.title, noteRecord.label); assert.equal(note.data.text, noteRecord.content); assert.equal(note.data.content, noteRecord.content); assert.equal(Object.hasOwn(note.data, 'lcos_ref'), false);
  const canonical = dto.nodes.find(node => node.id === 'surface-main-text'); assert.equal(canonical.parent_id, 'title-nested'); assert.deepEqual(canonical.data, originalCanonical.data);
  assert.equal(canonical.lcos_revision_id, originalCanonical.lcos_revision_id); assert.equal(canonical.data.lcos_ordinary_text_readonly, undefined);
  report.cases.push('Actual facade reads original ordinary note label/content through nodes.read into pure readonly text, parent/local geometry retained; original bound text child still has exact Core ref/revision/body and is not downgraded');
  for (const [id, name, next] of [['title-frame','原外框','外框新名'], ['title-nested','原内框','内框新名']]) {
    const wire = titleWire(id, name, next); await submit(wire); await submit(phase(wire, 'undo')); await submit(phase(wire, 'redo'));
    await beforeReject('old observed title', titleWire(id, name, '过期输入不能盖'));
    const later = titleWire(id, next, next + '·后来改名'); await submit(later);
    const rejected = await beforeReject('later rename prevents old Undo', phase(wire, 'undo')); assert.equal(rejected.body.error.code, 'FRAME_TITLE_STALE');
    await submit(phase(later, 'undo')); await submit(phase(wire, 'undo'));
  }
  report.cases.push('Top and nested exact original title wire apply→Undo→Redo use original labels and receipts; stale edits and an old Undo after a later rename reject without overwriting, original labels restored');
  assert.equal((await content('title-unnamed')).label, null); assert.equal((await read()).nodes.find(node => node.id === 'title-unnamed').data.title, '未命名框');
  const unnamedWire = titleWire('title-unnamed', '未命名框', '现在有名字', null); await submit(unnamedWire); await submit(phase(unnamedWire, 'undo'));
  assert.equal((await content('title-unnamed')).label, null); await submit(phase(unnamedWire, 'redo')); await submit(phase(unnamedWire, 'undo'));
  report.cases.push('Unnamed Frame beforeLabel:null displays 未命名框, but actual original Undo restores null rather than persisting the display placeholder');
  const mixed = titleWire('title-frame', '原外框', '不能混写'); mixed.actions[0].updates[0].position = { x: 1, y: 2 }; await beforeReject('mixed position', mixed, 400);
  const bodyMix = titleWire('title-frame', '原外框', '不能混正文'); bodyMix.actions[0].updates[0].data.content = '不该写入'; await beforeReject('mixed body', bodyMix, 400);
  const guiMix = titleWire('title-frame', '原外框', '不能混GUI'); guiMix.actions[0].updates[0].data.color_pins = ['F0606B']; await beforeReject('mixed GUI', guiMix, 400);
  await beforeReject('ordinary note is not frame-title', titleWire('title-note', '原子标题', '不能改成框'));
  await beforeReject('canonical text is not frame-title', titleWire('surface-main-text', originalCanonical.data.title, '不能改材料'));
  report.cases.push('The actual title route refuses geometry/body/GUI fields, ordinary child-note title and canonical text title; no generic patch/edit capability is inferred');
  await run([{ type: 'CREATE_NODES', nodes: [{ id: 'title-bad-ref', nodeType: 'frame', position: { x: 3600, y: 1100 }, size: { width: 250, height: 200 }, data: { label: '坏引用框', lcos_ref: null } }] }]);
  const bad = await beforeReject('reserved null ref cannot become ordinary', titleWire('title-bad-ref', '坏引用框', '不能降级'));
  assert.equal(bad.body.error.code, 'FRAME_TITLE_IDENTITY_MISMATCH'); await run([{ type: 'DELETE_NODES', nodeIds: ['title-bad-ref'] }]);
  await preserve('final');
  for (const id of frameIds) assert.deepEqual((await content(id)).label, records.get(id).label);
  report.cases.push('A real malformed Frame with reserved lcos_ref:null is refused as ordinary, then removed through original spatial test fixture lifecycle; no fake Artifact/View/member or label fallback');
  report.fileCount = bytes.length; report.filesUnchanged = true; report.domainUnchanged = true; report.originalGeometryParentGuiUnchanged = true;
  report.allowedMetadata = 'Original Frame title operations may add labelSource:user in their original MERGE_NODE_DATA/NodeContent records; only these Frame label/labelSource fields were excluded during intermediate comparison, final labels equal originals.';
  report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
  await facade?.close(); globalThis.fetch = oldFetch;
  for (const key of Object.keys(process.env)) if (secretPattern.test(key)) delete process.env[key]; for (const [key, value] of beforeEnv) process.env[key] = value;
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, report: path.join(output, 'report.json'), cases: report.cases, fileCount: report.fileCount,
    filesUnchanged: report.filesUnchanged, domainUnchanged: report.domainUnchanged, error: report.error, modelCalls: 0, browsers: 0, activeCoreRequests: 0 }, null, 2));
}
