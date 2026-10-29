import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { Server } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, '.runtime'); await fs.mkdir(base, { recursive: true });
const runtime = await fs.mkdtemp(path.join(base, 'native-node-emphasis-lifecycle-'));
const savedEnv = new Map(Object.entries(process.env).filter(([key]) => /^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|OPENROUTER_|DEEPSEEK_)/.test(key)));
for (const key of savedEnv.keys()) delete process.env[key];
process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1';
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtime, 'capture'); process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtime, 'ocr');
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const owned = process._getActiveHandles().some(handle => {
    if (!(handle instanceof Server) || !handle.listening) return false;
    const address = handle.address(); return address && typeof address !== 'string' && ['127.0.0.1', '::1'].includes(address.address) && String(address.port) === url.port;
  });
  if (!owned || url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('Emphasis fixture refused an unowned endpoint.');
  return realFetch(input, init);
};
let facade;
const cases = [];
try {
  const sourcePath = path.join(root, 'reference/tapnow-installed/resources/web/assets/page-Da_DfwiK.js');
  const source = await fs.readFile(sourcePath, 'utf8'), ast = parseOriginalDonorScript(source, sourcePath);
  const bindings = new Map(), createDtos = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    const name = node.type === 'VariableDeclarator' ? node.id?.name : node.type === 'FunctionDeclaration' ? node.id?.name : undefined;
    if (['M8', 'PC', 'pp', 'DC', 'kP'].includes(name)) {
      assert.ok(!bindings.has(name), 'one original ' + name);
      bindings.set(name, node.type === 'VariableDeclarator' ? source.slice(node.init.start, node.init.end) : source.slice(node.start, node.end));
    }
    if (node.type === 'ObjectExpression') {
      const keys = new Set(node.properties.map(prop => prop.key?.name ?? prop.key?.value));
      if (['canvas_id', 'data', 'position', 'measured', 'type'].every(key => keys.has(key))) createDtos.push(node);
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'tokens', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast); assert.equal(createDtos.length, 1);
  const createDto = createDtos[0], idExpression = createDto.properties.find(prop => prop.key?.name === 'id').value;
  assert.equal(idExpression.type, 'MemberExpression');
  const sandbox = { window: {}, structuredClone, JSON, Date, crypto: { randomUUID: () => 'unused-serializer-fixture' } };
  vm.createContext(sandbox);
  vm.runInContext([...bindings].map(([name, body]) => `const ${name}=(${body});`).join('\n')
    + '\nglobalThis.originalM8=M8;globalThis.originalPC=PC;globalThis.originalCreate=(e,' + idExpression.object.name + ')=>(' + source.slice(createDto.start, createDto.end) + ');', sandbox);
  vm.runInContext(await fs.readFile(path.join(root, 'lab/startup-history-intent.js'), 'utf8'), sandbox);
  const serializeCreate = (node, id, canvasId) => {
    const sourceNode = { ...structuredClone(node), id, width: node.measured.width, height: node.measured.height };
    const op = sandbox.originalM8([{ type: 'add', item: sourceNode }], 1)[0];
    const dto = sandbox.originalCreate(canvasId, op);
    assert.equal(dto.data.lcos_gui_emphasis, node.data.lcos_gui_emphasis, 'actual original create serializer preserves boolean, including false');
    return JSON.parse(JSON.stringify(dto)); // actual HTTP drops undefined extent
  };
  for (const value of [false, true]) {
    const node = { id: 'serializer', type: 'text', measured: { width: 200, height: 100 }, position: { x: 1.234, y: 2.345 }, data: { id: 'serializer', lcos_gui_emphasis: value } };
    serializeCreate(node, 'copy', 'canvas');
    const op = sandbox.originalM8([{ type: 'replace', item: node }], 1)[0];
    assert.equal(sandbox.originalPC(op).data.lcos_gui_emphasis, value);
    assert.equal(sandbox.window.__LCOS_NATIVE_INTENT__.snapshot(node).data.lcos_gui_emphasis, value);
  }
  cases.push('actual installed M8, PC, pp and original r6 create DTO plus original history snapshot retain true and explicit false; no hand-written replacement serializer');

  const entry = path.join(runtime, 'fixture.ts');
  const relative = file => path.relative(runtime, path.join(root, file)).replaceAll('\\', '/');
  await fs.writeFile(entry, `export {startSurfaceCoreFacade} from ${JSON.stringify(relative('lab/pilot/surface-core-facade.ts'))};\nexport {ImportCopyService} from ${JSON.stringify(relative('lcos/apps/local-core/src/import-copy-service.ts'))};`);
  const bundle = await buildPilotEntry(path.relative(root, entry), path.join(runtime, 'fixture.mjs'), 'node', { coreWorkspaceMembership: true });
  const module = await import(pathToFileURL(bundle).href);
  facade = await module.startSurfaceCoreFacade({ runtimeRoot: path.join(runtime, 'owned'), publicOrigin: 'http://127.0.0.1:19973',
    fullIntegration: true, nativeCollectionPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeRailPilot: true });
  const repository = facade.core.repository, projectId = facade.core.projectId, canvasId = 'surface-core-main';
  const workspace = repository.getWorkspaces(projectId).find(row => row.canvasId === canvasId); assert.ok(workspace);
  const prefix = '/api/lcos/core/projects/' + projectId, route = '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions';
  let serial = 0;
  const expect = async (method, url, body, status = 200) => {
    const result = await facade.handle({ method, url, body }); assert.equal(result.status, status, JSON.stringify(result.body));
    return result.body.value ?? result.body.data;
  };
  const canvas = () => expect('GET', '/api/canvas/v1/canvases/' + canvasId);
  const readNode = async id => { const node = (await canvas()).nodes.find(node => node.id === id); assert.ok(node, 'actual GET carrier ' + id); return node; };
  const apply = async (kind, phase, action, refs, snapshots) => {
    const result = await expect('POST', route, { canvas_id: canvasId, lcos_operation: { version: 1, kind, phase, operationId: 'emphasis-lifecycle-' + ++serial },
      actions: [action], ...(refs ? { lcos_refs: refs } : {}), ...(snapshots ? { lcos_snapshots: snapshots } : {}) });
    return result.lifecycle_results[0];
  };
  const update = (id, data) => expect('POST', route, { canvas_id: canvasId, actions: [{ action: 'update', updates: [{ id, data }] }] });
  const initial = await canvas(), text = initial.nodes.find(node => node.type === 'text' && !node.data.lcos_file_ref), image = initial.nodes.find(node => node.type === 'image');
  assert.ok(text && image); assert.equal(text.data.lcos_gui_emphasis, false); assert.equal(image.data.lcos_gui_emphasis, false);
  const pdf = await new module.ImportCopyService(repository).importCopy(projectId, { importRequestId: 'emphasis-file-family', fileName: 'synthetic-emphasis.pdf',
    contentType: 'application/pdf', bytes: Buffer.from('%PDF-1.4\n% local lifecycle byte fixture\n%%EOF\n'), scopeId: workspace.scopeId, position: { x: 1500, y: 800 } });
  assert.equal(pdf.artifact.kind, 'pdf');
  const fileRef = { version: 1, entityType: 'view', entityId: pdf.view.id, artifactId: pdf.artifact.id, artifactViewId: pdf.view.id, revisionId: pdf.revision.id };
  const fileSeed = await apply('duplicate-view', 'apply', { action: 'create', creates: [{ id: 'emphasis-file-seed', type: 'text', position: { x: 1500, y: 800 },
    measured: { width: 250, height: 180 }, data: {}, lcos_ref: fileRef }] });
  const file = await readNode(fileSeed.nodes[0].nodeId); assert.equal(file.data.lcos_file_ref.kind, 'pdf');
  const families = [{ kind: 'text', id: text.id }, { kind: 'image', id: image.id }, { kind: 'file', id: file.id }];
  const textPrefs = { lcosTextViewMode: 'mindmap', lcosTextCollapsedIds: ['section-a'], lcosTextBeforeMindMapSize: { width: 244, height: 150 } };
  const sourceFacts = new Map();
  for (const family of families) {
    const node = await readNode(family.id), ref = node.data.lcos_ref;
    const artifact = structuredClone(repository.getArtifact(ref.artifactId)), revision = structuredClone(repository.getArtifactRevision(ref.revisionId));
    const fileRecord = repository.getFileRecord(revision.fileRecordId);
    sourceFacts.set(family.kind, { artifact, revision, fileRecord: structuredClone(fileRecord), bytes: await fs.readFile(fileRecord.observedPath) });
  }
  const marker = await expect('POST', prefix + '/spatial-markers', { targetRef: { projectId, kind: 'view', id: text.data.lcos_ref.artifactViewId }, scope: 'local', sourceSurfaceRef: 'main' }, 201);
  const markerSnapshot = await expect('GET', prefix + '/spatial-markers'); assert.equal(markerSnapshot.length, 1);
  const deleteAndRestore = async (snapshot, name) => {
    const ref = snapshot.data.lcos_ref, copiedSnapshot = sandbox.window.__LCOS_NATIVE_INTENT__.snapshot(snapshot);
    const removed = await apply('delete', 'apply', { action: 'delete', delete_ids: [snapshot.id] }, { [snapshot.id]: ref }, { [snapshot.id]: copiedSnapshot });
    assert.equal((await canvas()).nodes.some(node => node.id === snapshot.id), false);
    const requestedId = name + '-restored-' + ++serial;
    const input = serializeCreate(copiedSnapshot, requestedId, canvasId);
    input.lcos_ref = removed.lcos_refs[snapshot.id];
    const restored = await apply('delete', 'undo', { action: 'create', creates: [input] });
    assert.equal(restored.nodes[0].data.lcos_gui_emphasis, snapshot.data.lcos_gui_emphasis);
    const node = await readNode(restored.nodes[0].nodeId);
    assert.equal(node.data.lcos_gui_emphasis, snapshot.data.lcos_gui_emphasis);
    assert.equal((await facade.spatial.read(canvasId)).state.nodes.find(row => row.id === node.id).data.lcos_gui_emphasis, snapshot.data.lcos_gui_emphasis);
    assert.equal(node.data.lcos_ref.artifactViewId, ref.artifactViewId);
    return node;
  };
  for (const family of families) for (const value of [false, true]) {
    await update(family.id, { lcos_gui_emphasis: value, ...(family.kind === 'text' ? textPrefs : {}) });
    const sourceNode = await readNode(family.id), ref = sourceNode.data.lcos_ref;
    assert.equal(sourceNode.data.lcos_gui_emphasis, value);
    const viewsBefore = repository.getArtifactViews(ref.artifactId).length;
    const copied = await apply('duplicate-view', 'apply', { action: 'create', creates: [serializeCreate(sourceNode, family.kind + '-copy-' + ++serial, canvasId)] });
    const copy = await readNode(copied.nodes[0].nodeId);
    assert.equal(copied.nodes[0].data.lcos_gui_emphasis, value); assert.equal(copy.data.lcos_gui_emphasis, value);
    assert.equal((await facade.spatial.read(canvasId)).state.nodes.find(row => row.id === copy.id).data.lcos_gui_emphasis, value);
    assert.equal(copy.data.lcos_ref.artifactId, ref.artifactId); assert.notEqual(copy.data.lcos_ref.artifactViewId, ref.artifactViewId);
    assert.equal(repository.getArtifactViews(ref.artifactId).length, viewsBefore + 1);
    const restoredCopy = await deleteAndRestore(copy, family.kind + '-view');
    const restoredSource = await deleteAndRestore(sourceNode, family.kind + '-source'); family.id = restoredSource.id;
    if (family.kind === 'text') for (const [key, expected] of Object.entries(textPrefs)) {
      assert.deepEqual(restoredCopy.data[key], expected); assert.deepEqual(restoredSource.data[key], expected);
    }
    if (family.kind === 'file') assert.deepEqual(restoredCopy.data.lcos_file_ref.fileRecordId, sourceNode.data.lcos_file_ref.fileRecordId);
    assert.deepEqual(await expect('GET', prefix + '/spatial-markers'), markerSnapshot, 'copy/restore never copies a canonical marker');
    cases.push(family.kind + ' ' + value + ': actual GET → original M8/r6 create → View copy → delete/Undo restore of copy and original; preference persists in receipt, saved Huabu and fresh GET');
  }
  // Validation remains narrow; no new generic data pass-through.
  const sourceNode = await readNode(families[0].id);
  for (const value of [0, 1, 'true', null, {}]) {
    const dto = serializeCreate(sourceNode, 'invalid-' + ++serial, canvasId); dto.data.lcos_gui_emphasis = value;
    const result = await facade.handle({ method: 'POST', url: route, body: { canvas_id: canvasId,
      lcos_operation: { version: 1, kind: 'duplicate-view', phase: 'apply', operationId: 'invalid-' + serial }, actions: [{ action: 'create', creates: [dto] }] } });
    assert.equal(result.status, 400); assert.equal(result.body.error.code, 'INVALID_GUI_EMPHASIS');
  }
  const rejectDto = async (node, change, status) => {
    const dto = serializeCreate(node, 'guard-' + ++serial, canvasId); change(dto);
    const result = await facade.handle({ method: 'POST', url: route, body: { canvas_id: canvasId,
      lcos_operation: { version: 1, kind: 'duplicate-view', phase: 'apply', operationId: 'guard-' + serial }, actions: [{ action: 'create', creates: [dto] }] } });
    assert.equal(result.status, status, JSON.stringify(result.body));
  };
  await rejectDto(sourceNode, dto => dto.data.unrelated_internal_state = true, 501);
  await rejectDto(await readNode(families[1].id), dto => dto.data.src = 'http://127.0.0.1/unrelated-pixels', 409);
  await rejectDto(await readNode(families[1].id), dto => dto.data.prompt = 'generate replacement pixels', 501);
  await rejectDto(await readNode(families[2].id), dto => dto.data.content = 'forged authored PDF body', 409);
  await rejectDto(sourceNode, dto => dto.data.lcos_ref.revisionId = 'not-the-source-revision', 409);
  const retrySource = await readNode(families[1].id);
  await update(retrySource.id, { lcos_gui_emphasis: !retrySource.data.lcos_gui_emphasis });
  const retry = serializeCreate(retrySource, retrySource.id, canvasId);
  const conflict = await facade.handle({ method: 'POST', url: route, body: { canvas_id: canvasId,
    lcos_operation: { version: 1, kind: 'delete', phase: 'undo', operationId: 'stale-retry' }, actions: [{ action: 'create', creates: [retry] }] } });
  assert.equal(conflict.status, 409); assert.equal(conflict.body.error.code, 'CORE_RESTORE_CARRIER_CHANGED');
  assert.equal((await readNode(retrySource.id)).data.lcos_gui_emphasis, !retrySource.data.lcos_gui_emphasis);
  for (const fact of sourceFacts.values()) {
    assert.deepEqual(repository.getArtifact(fact.artifact.id), fact.artifact);
    assert.deepEqual(repository.getArtifactRevision(fact.revision.id), fact.revision);
    assert.deepEqual(repository.getFileRecord(fact.fileRecord.id), fact.fileRecord);
    assert.deepEqual(await fs.readFile(fact.fileRecord.observedPath), fact.bytes);
  }
  assert.deepEqual(await expect('GET', prefix + '/spatial-markers'), [marker]);
  assert.equal(repository.getProjectExecutionProjection(projectId).runs.length, 0);
  cases.push('non-boolean/unknown data/forged pixel source/prompt/file body/reference reject; stale restore cannot overwrite later emphasis; original artifacts, revisions, bytes and source marker unchanged; zero Runs/models');
  console.log(JSON.stringify({ passed: true, cases, runtime: 'disposable real Core/Huabu; original installed serializers; no browser or active runtime accessed' }, null, 2));
} finally {
  await facade?.close(); globalThis.fetch = realFetch;
  for (const key of Object.keys(process.env)) if (/^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|OPENROUTER_|DEEPSEEK_)/.test(key)) delete process.env[key];
  for (const [key, value] of savedEnv) process.env[key] = value;
  const absolute = path.resolve(runtime); if (!absolute.startsWith(path.resolve(base) + path.sep)) throw Error('Unexpected test path.');
  await fs.rm(absolute, { recursive: true, force: true });
}
