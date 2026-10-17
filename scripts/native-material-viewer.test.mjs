import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformNativeMaterialViewerScript } from '../lab/native-material-viewer-transform.mjs';
import { transformNativeMaterialReaderSource } from '../lab/native-material-reader-source-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, 'output/原流程施工_20261017b');
fs.mkdirSync(evidence, { recursive: true });
const require = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json');
const esbuild = require('esbuild');
const ts = require('typescript');
const asset = 'course-api-base-url-CifxI1ia.js';
const source = fs.readFileSync(path.join(root, 'reference/tapnow-installed/resources/web/assets', asset), 'utf8');
const transformed = transformNativeMaterialViewerScript(asset, source);
const before = parseOriginalDonorScript(source, asset), after = parseOriginalDonorScript(transformed, asset);
assert.equal(transformNativeMaterialViewerScript(asset, transformed), transformed);
assert.equal(transformNativeMaterialViewerScript('unrelated.js', source), source);
function declarations(program) {
  return new Map(program.body.flatMap(statement => {
    const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    return node?.type === 'VariableDeclaration' ? node.declarations.map(item => [item.id?.name, item])
      : node?.type === 'FunctionDeclaration' ? [[node.id.name, node]] : [];
  }));
}
const original = declarations(before), updated = declarations(after);
const skip = new Set(['start', 'end', 'loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments']);
function containsControlled(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'Identifier' && /^lcos(?:Controlled|BodySlot|ActionsSlot|HideCopy|ExtraActions)$/.test(node.name)) return true;
  return Object.entries(node).some(([key, value]) => !skip.has(key) && (Array.isArray(value) ? value.some(containsControlled) : containsControlled(value)));
}
function normalizeDonorPath(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.filter(item => !(item?.type === 'Identifier' && item.name === 'lcosExtraActions'))
    .map(normalizeDonorPath);
  if (node.type === 'ConditionalExpression' && containsControlled(node.test)) return normalizeDonorPath(node.alternate);
  if (node.type === 'LogicalExpression' && node.operator === '??' && containsControlled(node.left)) return normalizeDonorPath(node.right);
  if (node.type === 'LogicalExpression' && node.operator === '&&' && node.left?.type === 'UnaryExpression'
    && node.left.operator === '!' && node.left.argument?.name === 'lcosHideCopy') return normalizeDonorPath(node.right);
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (skip.has(key)) continue;
    const next = (node.type === 'ObjectPattern' || node.type === 'ObjectExpression') && key === 'properties'
      ? value.filter(item => !/^lcos/.test(item.key?.name ?? item.key?.value ?? '')
        && !((item.key?.name ?? item.key?.value) === 'key' && containsControlled(item.value))) : value;
    result[key] = normalizeDonorPath(next);
  }
  return result;
}
for (const [name, node] of original) {
  assert.ok(updated.has(name), `Original owner removed: ${name}`);
  const next = updated.get(name);
  if (['c2', 'vZ', 'UX', 'd2'].includes(name)) assert.deepEqual(normalizeDonorPath(next), normalizeDonorPath(node), `${name} ordinary donor path changed`);
  else assert.equal(transformed.slice(next.start, next.end), source.slice(node.start, node.end), `Original owner changed: ${name}`);
}
assert.equal((transformed.match(/So\.createPortal\(/g) ?? []).length, (source.match(/So\.createPortal\(/g) ?? []).length,
  'No modal or portal may be added');
for (const name of ['wa', 'd2', 'Ln', 'Lx', 'g2', 'AZ', 'FX', 'kY', 'vT']) assert.ok(original.has(name));

// Execute the actual original file-info hook through the newly controlled c2
// argument. Empty id must short-circuit before the vendor API owner is called.
const vendorCalls = [];
const hook = new Function('d', 'Jr', 'mm', 'bg', '_Y', 'TY', 'RY', source.slice(original.get('kY').start, original.get('kY').end) + ';return kY;')(
  { useState: init => [init(), () => {}], useEffect: effect => effect() }, value => value || null,
  id => ({ fileId: id, data: null, loading: Boolean(id) }),
  { getFileHubSharedFileInfo: id => { vendorCalls.push(id); return Promise.resolve({}); } }, 1000, value => value, { warn() {} });
let fileInfo;
function walk(node, visit) {
  if (!node?.type) return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (skip.has(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value?.type) walk(value, visit);
  }
}
walk(updated.get('c2'), node => { if (node.type === 'CallExpression' && node.callee?.name === 'kY') fileInfo = node; });
const readInfo = new Function('t', '_', 'kY', 'return ' + transformed.slice(fileInfo.start, fileInfo.end));
readInfo({ lcosControlled: {} }, { src: 'vendor-file-id' }, hook);
assert.deepEqual(vendorCalls, []);
readInfo({}, { src: 'vendor-file-id' }, hook);
assert.deepEqual(vendorCalls, ['vendor-file-id']);

const readSource = fs.readFileSync(path.join(root, 'lab/pilot/native-material-viewer-read.ts'), 'utf8');
const readCompiled = esbuild.transformSync(readSource, { loader: 'ts', format: 'esm', target: 'es2022' }).code;
const { resolveNativeMaterialVersion: resolve, nativeMaterialVersionLabel: label, canOpenNativeMaterialMindMap: canEdit,
  resolveNativeMaterialMindMapRecoveryVersion: recoverEdit } = await import('data:text/javascript;base64,' + Buffer.from(readCompiled).toString('base64'));
function base() {
  const revisions = ['current', 'history', 'draft'].map((id, index) => ({ id, artifactId: 'material', fileRecordId: 'file-' + id,
    contentHash: 'content-' + id, status: id === 'history' ? 'superseded' : id, source: index ? 'run' : 'import', createdAt: '2026-10-17T01:00:00Z' }));
  return { target: { projectId: 'project', artifactId: 'material' },
    detail: { artifact: { id: 'material', projectId: 'project', title: '项目材料', currentRevisionId: 'current' }, currentRevisionId: 'current', revisions: [] }, revisions,
    graph: { project: { id: 'project' }, scopes: [{ id: 'scope', projectId: 'project' }],
      artifactViews: [{ id: 'view', artifactId: 'material', scopeId: 'scope', revisionId: 'history' }],
      fileRecords: revisions.map(row => ({ id: row.fileRecordId, projectId: 'project', mimeType: 'text/markdown', availability: 'current', observedHash: row.contentHash })) } };
}
const checks = [];
function test(name, modify, expected) {
  const value = base(); modify?.(value);
  if (expected === 'reject') assert.throws(() => resolve(value.target, value.detail, value.revisions, value.graph), undefined, name);
  else { const result = resolve(value.target, value.detail, value.revisions, value.graph); expected(result); }
  checks.push(name);
}
test('Current resolves its exact FileRecord', null, value => { assert.equal(value.revisionId, 'current'); assert.equal(value.fileRecordId, 'file-current'); });
test('Explicit historical revision never falls back to Current', value => { value.target.revisionId = 'history'; }, value => { assert.equal(value.revisionId, 'history'); assert.equal(value.isCurrent, false); });
test('Explicit draft output is readable', value => { value.target.revisionId = 'draft'; }, value => { assert.equal(value.isDraft, true); assert.equal(value.fileRecordId, 'file-draft'); });
test('Archived material remains readable', value => { value.detail.artifact.archivedAt = '2026-10-17T02:00:00Z'; }, value => assert.equal(value.archived, true));
test('Exact View pins its historical revision', value => { value.target.artifactViewId = 'view'; }, value => assert.equal(value.revisionId, 'history'));
test('Matching explicit View and revision retain both identities', value => { value.target.artifactViewId = 'view'; value.target.revisionId = 'history'; }, value => assert.equal(value.artifactViewId, 'view'));
test('Foreign project graph rejects', value => { value.graph.project.id = 'other'; }, 'reject');
test('Foreign material project rejects', value => { value.detail.artifact.projectId = 'other'; }, 'reject');
test('Wrong Artifact detail rejects', value => { value.detail.artifact.id = 'other'; }, 'reject');
test('Missing View rejects', value => { value.target.artifactViewId = 'absent'; }, 'reject');
test('View of another Artifact rejects', value => { value.target.artifactViewId = 'view'; value.graph.artifactViews[0].artifactId = 'other'; }, 'reject');
test('View outside current project rejects', value => { value.target.artifactViewId = 'view'; value.graph.scopes[0].projectId = 'other'; }, 'reject');
test('Conflicting View and revision reject', value => { value.target.artifactViewId = 'view'; value.target.revisionId = 'current'; }, 'reject');
test('Missing requested revision rejects without Current fallback', value => { value.target.revisionId = 'absent'; }, 'reject');
test('Revision of another Artifact rejects', value => { value.revisions[0].artifactId = 'other'; }, 'reject');
test('No selected/current revision rejects', value => { delete value.detail.currentRevisionId; delete value.detail.artifact.currentRevisionId; }, 'reject');
test('Duplicate requested revision rejects', value => { value.revisions.push({ ...value.revisions[0] }); }, 'reject');
test('Missing exact file rejects', value => { value.graph.fileRecords.shift(); }, 'reject');
test('Foreign project file rejects', value => { value.graph.fileRecords[0].projectId = 'other'; }, 'reject');
test('Wrong observed file hash rejects', value => { value.graph.fileRecords[0].observedHash = 'different'; }, 'reject');
test('Missing both existing hash facts rejects', value => { delete value.graph.fileRecords[0].observedHash; delete value.revisions[0].contentHash; }, 'reject');
for (const availability of ['stale', 'missing', 'unreadable']) test(`File availability ${availability} rejects`, value => { value.graph.fileRecords[0].availability = availability; }, 'reject');
test('Missing MIME rejects', value => { value.graph.fileRecords[0].mimeType = ''; }, 'reject');
test('Generic binary MIME remains readable/downloadable', value => { value.graph.fileRecords[0].mimeType = 'application/octet-stream'; }, value => assert.equal(value.mimeType, 'application/octet-stream'));
assert.match(label({ isCurrent: false, isDraft: true }), /待确认/);
assert.match(label({ isCurrent: false, isDraft: false }), /历史/);

const editingVersion = resolve({ projectId: 'project', artifactId: 'material' }, base().detail, base().revisions, base().graph);
const editing = { hasText: true, canvasId: 'canvas', nodeId: 'node', retainedDraft: false,
  reference: { version: 1, entityType: 'artifact', entityId: 'material', artifactId: 'material', artifactViewId: 'primary', revisionId: 'current' } };
assert.equal(canEdit(editingVersion, editing), true);
const advanced = { ...editingVersion, isCurrent: false };
assert.equal(canEdit(advanced, editing), false, 'A pinned old primary occurrence alone cannot authorize editing');
assert.equal(canEdit(advanced, { ...editing, retainedDraft: true }), true, 'Unsent exact occurrence draft remains reachable');
const pending = { canvasId: 'canvas', nodeId: 'node', artifactId: 'material', expectedRevisionId: 'current' };
assert.equal(canEdit(advanced, { ...editing, pending }), true, 'Core may advance before the original port receipt is resolved');
for (const [key, value] of [['canvasId', 'other'], ['nodeId', 'other'], ['artifactId', 'other'], ['expectedRevisionId', 'other']])
  assert.equal(canEdit(advanced, { ...editing, pending: { ...pending, [key]: value } }), false, 'Foreign pending ' + key);
for (const input of [{ ...editing, nodeId: undefined }, { ...editing, hasText: false },
  { ...editing, reference: { ...editing.reference, entityType: 'view' } },
  { ...editing, reference: { ...editing.reference, revisionId: 'history' } },
  { ...editing, reference: { ...editing.reference, entityId: 'other' } }])
  assert.equal(canEdit(advanced, { ...input, retainedDraft: true, pending }), false, 'Draft does not bypass material identity or read policy');
assert.equal(canEdit({ ...advanced, archived: true }, { ...editing, retainedDraft: true, pending }), false);
assert.equal(canEdit({ ...advanced, artifactViewId: 'other-view' }, { ...editing, retainedDraft: true, pending }), false);

function recoveryFixture() {
  const value = base();
  value.target = { ...value.target, artifactViewId: 'view', revisionId: 'history', editMode: 'mindmap', nodeId: 'node', sourceCanvasId: 'canvas' };
  value.graph.artifactViews[0] = { ...value.graph.artifactViews[0], referenceKind: 'primary', revisionId: 'current' };
  value.context = { canvasId: 'canvas', nodeId: 'node', retainedDraft: false,
    reference: { ...editing.reference, artifactViewId: 'view', revisionId: 'history' },
    pending: { ...pending, expectedRevisionId: 'history' } };
  return value;
}
const recovered = recoveryFixture();
assert.throws(() => resolve(recovered.target, recovered.detail, recovered.revisions, recovered.graph), undefined, 'Ordinary explicit View/revision conflict remains rejected');
const recoveredVersion = recoverEdit(recovered.target, recovered.detail, recovered.revisions, recovered.graph, recovered.context);
assert.equal(recoveredVersion.fileRecordId, 'file-history'); assert.equal(recoveredVersion.revisionId, 'history');
assert.equal(recoveredVersion.artifactViewId, 'view'); assert.equal(recoveredVersion.isCurrent, false);
assert.equal(recoverEdit(recovered.target, recovered.detail, recovered.revisions, recovered.graph,
  { ...recovered.context, pending: null, retainedDraft: true }).revisionId, 'history');
const inconsistentCurrent = recoveryFixture();
inconsistentCurrent.target.revisionId = 'current'; inconsistentCurrent.context.reference.revisionId = 'current';
inconsistentCurrent.context.pending = null; inconsistentCurrent.graph.artifactViews[0].revisionId = 'history';
assert.throws(() => recoverEdit(inconsistentCurrent.target, inconsistentCurrent.detail, inconsistentCurrent.revisions,
  inconsistentCurrent.graph, inconsistentCurrent.context), undefined, 'Recovery resolver always needs a real retained draft or matching operation');
for (const change of [
  value => { value.target.editMode = undefined; }, value => { value.target.nodeId = 'other'; },
  value => { value.target.sourceCanvasId = 'other'; }, value => { value.target.artifactViewId = 'other'; },
  value => { value.graph.artifactViews[0].referenceKind = 'explicit_additional'; },
  value => { value.graph.scopes[0].projectId = 'other'; }, value => { value.graph.project.id = 'other'; },
  value => { value.context.pending = null; }, value => { value.context.pending.nodeId = 'other'; },
  value => { value.context.pending.expectedRevisionId = 'current'; },
  value => { value.context.reference.entityType = 'view'; }, value => { value.context.reference.revisionId = 'current'; },
  value => { value.detail.artifact.archivedAt = '2026-10-17T03:00:00Z'; },
  value => { value.revisions = value.revisions.filter(row => row.id !== 'history'); },
  value => { value.graph.fileRecords.find(row => row.id === 'file-history').availability = 'stale'; },
]) {
  const value = recoveryFixture(); change(value);
  assert.throws(() => recoverEdit(value.target, value.detail, value.revisions, value.graph, value.context));
}

const portSource = fs.readFileSync(path.join(root, 'lab/pilot/native-material-viewer-port.ts'), 'utf8');
const portCompiled = esbuild.transformSync(portSource, { loader: 'ts', format: 'esm', target: 'es2022' }).code;
const port = await import('data:text/javascript;base64,' + Buffer.from(portCompiled).toString('base64'));
globalThis.window = new EventTarget();
const requests = []; window.addEventListener(port.nativeMaterialViewEvent, event => requests.push(event.detail));
port.requestNativeMaterialView({ projectId: 'project', artifactId: 'material', revisionId: 'draft', artifactViewId: 'view' });
assert.equal(requests[0].revisionId, 'draft');
port.requestNativeMaterialView({ projectId: 'project', artifactId: 'material', editMode: 'mindmap' });
assert.equal(requests[1].editMode, 'mindmap');
for (const editMode of ['', 'text', true]) assert.throws(() => port.requestNativeMaterialView({ projectId: 'project', artifactId: 'material', editMode }));
for (const field of ['projectId', 'artifactId', 'revisionId', 'artifactViewId', 'nodeId', 'sourceCanvasId', 'composerOriginKey', 'returnId', 'legacyReturnWindowId'])
  assert.throws(() => port.requestNativeMaterialView({ projectId: 'project', artifactId: 'material', [field]: ' ' }));
delete globalThis.window;
const shellPath = path.join(root, 'lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts');
const shellSource = fs.readFileSync(shellPath, 'utf8');
const shellConverted = transformNativeMaterialReaderSource(shellSource, { sourcePath: shellPath });
assert.equal(transformNativeMaterialReaderSource(shellConverted, { sourcePath: shellPath }), shellConverted);
const parsedShell = ts.createSourceFile(shellPath, shellConverted, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let reader;
const findReader = node => { if (ts.isPropertyAssignment(node) && node.name.getText(parsedShell) === 'openReader') reader = node.initializer; ts.forEachChild(node, findReader); };
findReader(parsedShell);assert(reader);
const readerCode = ts.transpileModule('const reader = (' + reader.getText(parsedShell) + ')', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const forwarded = [], fallback = [];
let mounted = true;
const actualReader = new Function('get', 'set', 'nativeMaterialViewerAvailable', 'requestNativeMaterialView', readerCode + ';return reader;')(
  () => ({ projectId: 'project', surfaceCanvasId: { main: 'canvas-main', context: 'canvas-context', workflow: 'canvas-workflow' } }),
  value => fallback.push(value), () => mounted, value => forwarded.push(value));
actualReader('Historical source', 'material', { revisionId: 'history', source: { surface: 'context', nodeId: 'source-node' },
  sourceLocator: { kind: 'page', pageNumber: 4 }, returnToWindowId: 'old-task', composerOriginKey: 'input-key' });
assert.deepEqual(forwarded[0], { projectId: 'project', artifactId: 'material', title: 'Historical source', revisionId: 'history',
  nodeId: 'source-node', sourceCanvasId: 'canvas-context', sourceLocator: { kind: 'page', pageNumber: 4 },
  legacyReturnWindowId: 'old-task', composerOriginKey: 'input-key' });
assert.equal(fallback.length, 0);
mounted = false;actualReader('Retained fallback', 'material');assert.equal(fallback.length, 1);
assert.equal(fs.readFileSync(shellPath, 'utf8'), shellSource);
assert.equal(fs.readFileSync(path.join(root, 'reference/tapnow-installed/resources/web/assets', asset), 'utf8'), source);
const result = { passed: true, sourceTransformParsed: true, idempotent: true, ordinaryDonorPathEquivalent: ['c2', 'vZ', 'UX', 'd2'],
  allOtherOriginalDeclarationsUntouched: true, noAdditionalPortal: true, controlledVendorFileReads: 0, ordinaryVendorFileReads: 1,
  versionChecks: checks, exactMindMapRecoveryPolicy: true, primaryViewAdvanceRecoveryChecks: 18, ordinaryPinnedViewPolicyUnchanged: true,
  addressValidation: true, legacySourceLocatorAndReturnTranslated: true, unmountedFallbackRetained: true,
  limits: 'Pure resolver and original hook execution; production entry bundle and real controlled-viewer browser fixture are separate checks.' };
fs.writeFileSync(path.join(evidence, 'native-material-viewer-source-result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
