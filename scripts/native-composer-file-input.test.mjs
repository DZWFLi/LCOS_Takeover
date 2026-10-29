import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { createNativeUiSourceTransforms } from '../lab/native-ui-source-transforms.mjs';
import { withNativeChatSourceTransforms } from '../lab/native-chat-owner-transform.mjs';
import { withNativeMaterialReaderSourceTransforms } from '../lab/native-material-reader-source-transform.mjs';
import { withNativeReaderRecoverySourceTransforms } from '../lab/native-reader-recovery-source-transform.mjs';
import { withNativeComposerFileSourceTransforms, transformNativeComposerFileInputSource,
  restoreNativeComposerFileInputForComparison } from '../lab/native-composer-file-source-transform.mjs';

const root = path.resolve(import.meta.dirname, '..'), dep = createRequire(path.join(installedRoot, 'package.json'));
const ts = dep('typescript'), esbuild = dep('esbuild'), temp = path.join(root, '.runtime/composer-file-' + Date.now());
await fs.mkdir(temp, { recursive: true });
const read = async relative => readCurrentGen2Resource(path.join(root, relative))?.contents ?? await fs.readFile(path.join(root, relative), 'utf8');
const nodes = (parent, test) => { const out = []; const visit = node => { if (test(node)) out.push(node); ts.forEachChild(node, visit); }; visit(parent); return out; };
const one = (values, label) => { assert.equal(values.length, 1, label); return values[0]; };
const relative = 'lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx', sourcePath = path.join(root, relative), original = await read(relative);
const fullMap = withNativeReaderRecoverySourceTransforms(withNativeMaterialReaderSourceTransforms(withNativeChatSourceTransforms(createNativeUiSourceTransforms({ nativeRailPilot: true }))));
const prior = fullMap[relative](original, { sourcePath }), next = withNativeComposerFileSourceTransforms(fullMap)[relative](original, { sourcePath });
assert.equal(restoreNativeComposerFileInputForComparison(next, { sourcePath }), prior, 'only own additions removed = every full-map previous byte');
assert.equal(transformNativeComposerFileInputSource(next, { sourcePath }), next);
assert.throws(() => transformNativeComposerFileInputSource(original, { sourcePath: sourcePath + '.foreign' }), /exact/);
const host = ts.createSourceFile(sourcePath, next, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.deepEqual(host.parseDiagnostics, []);
const helper = await read('lab/pilot/native-composer-file-input.ts');
const ownership = await read('lcos/huabu/apps/web/src/lcos/referencePickOwnership.ts');
const controller = await read('lcos/apps/web-gen2/src/interaction/referenceController.ts');
const snapshot = await read('lcos/huabu/apps/web/src/lcos/composer/referenceSnapshot.ts');
const continuation = await read('lcos/huabu/apps/web/src/lcos/professional/conversationContinuationActions.ts');
const continuationAst = ts.createSourceFile('actions.ts', continuation, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const runRef = one(nodes(continuationAst, node => ts.isFunctionDeclaration(node) && node.name?.text === 'toRunReference'), 'actual Run ref mapper').getText(continuationAst);
const storeSource = await read('lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts'), storeAst = ts.createSourceFile('store.ts', storeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const action = name => one(nodes(storeAst, node => ts.isPropertyAssignment(node) && node.name.getText(storeAst) === name), name).initializer.getText(storeAst);
function withoutImports(value) { const ast = ts.createSourceFile('part.ts', value, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const node of [...ast.statements].reverse()) if (ts.isImportDeclaration(node)) value = value.slice(0, node.getFullStart()) + value.slice(node.end); return value; }
const policy = helper.slice(helper.indexOf('type Transfer ='), helper.indexOf('export function useNativeComposerFileInput'));
const entry = [ownership, withoutImports(controller), runRef, withoutImports(snapshot), policy,
  `export function createActualReferenceState(){let state={projectId:'project',referenceInputOperations:new Map(),draft:createReferenceControllerState('original-draft')};
  const get=()=>state,set=patch=>{state={...state,...(typeof patch==='function'?patch(state):patch)}};
  const actions={beginReferenceInputOperation:${action('beginReferenceInputOperation')},finishReferenceInputOperation:${action('finishReferenceInputOperation')},addEntitiesToDraft:${action('addEntitiesToDraft')}};
  state={...state,...actions};return{getState:()=>state,set};}`].join('\n');
const bundle = path.join(temp, 'actual-policy.mjs');
await fs.writeFile(bundle, (await esbuild.transform(entry, { loader: 'ts', format: 'esm', target: 'node22' })).code);
const { receiveNativeComposerFiles: receive, hasNativeComposerFiles, createActualReferenceState } = await import(pathToFileURL(bundle).href);
const report = { passed: false, scope: 'actual full source-map Composer handler adaptation + actual production file policy + source-extracted original reference operations/admission/controller; controlled upload/Graph/DOM ports, zero Core/Canvas/send/Run writes', cases: [] };
try {
  report.cases.push('full existing UI/chat/reader/recovery map composition parses and all earlier source bytes restore exactly; exact sourcePath/idempotence');
  const file = { name: '人工材料.md', type: 'text/markdown', size: 50 };
  const info = { file_id: 'upload', file_name: file.name, mime_type: file.type, file_size: file.size, fileRecordId: 'file-record',
    lcos_ref: { version: 1, entityType: 'artifact', entityId: 'artifact', artifactId: 'artifact', artifactViewId: 'view', revisionId: 'revision' } };
  const graph = { project: { id: 'project' }, artifacts: [{ id: 'artifact', projectId: 'project', currentRevisionId: 'revision' }],
    artifactRevisions: [{ id: 'revision', artifactId: 'artifact', fileRecordId: 'file-record', contentHash: 'original-content-fact', status: 'current' }],
    fileRecords: [{ id: 'file-record', projectId: 'project', availability: 'current', observedHash: 'original-content-fact', mimeType: file.type, size: file.size }],
    artifactViews: [{ id: 'view', artifactId: 'artifact', revisionId: 'revision', scopeId: 'scope' }], scopes: [{ id: 'scope', projectId: 'project' }] };
  function fixture() {
    const store = createActualReferenceState(), api = {};
    let context = { projectId: 'project', canvasId: 'canvas', workspaceId: 'workspace', api, inputKey: 'same-input', nodeId: 'glyth', intent: 'continue',
      receiverConversationId: 'conversation', messageId: 'message-A', operationId: 'operation-A', open: true };
    let uploads = 0, gets = 0, prompt = 'user A', restoreCalls = 0;
    const notices = [], result = { success: true, results: [{ file, result: { success: true, fileInfo: info } }] };
    const ports = { current: () => context, references: () => store.getState(), active: () => true,
      uploadFiles: async () => { uploads++; return result; }, graph: async () => { gets++; return graph; }, notice: value => notices.push(value),
      captureCaret: () => ({ text: prompt, start: 2, end: 2 }), restoreCaret: caret => { if (prompt === caret.text) restoreCalls++; } };
    return { store, ports, result, notices, context: patch => { context = { ...context, ...patch }; }, prompt: value => { if (value !== undefined) prompt = value; return prompt; },
      facts: () => ({ uploads, gets, restoreCalls, refs: store.getState().draft.orderedEntityRefs, operations: store.getState().referenceInputOperations.size }) };
  }
  let f = fixture();
  f.store.getState().addEntitiesToDraft([{ entityType: 'artifact', entityId: 'earlier', revisionId: 'earlier-revision' }], 'continue');
  const normal = await receive([file], f.ports);
  assert.equal(normal.ok, true); assert.deepEqual(f.facts().refs.map(ref => ref.entityId), ['earlier', 'artifact']);
  assert.equal(f.facts().refs[1].revisionId, 'revision'); assert.equal(f.facts().refs[1].artifactViewId, 'view');
  assert.equal(f.facts().refs[1].mimeType, file.type); assert.equal(f.prompt(), 'user A'); assert.equal(f.facts().uploads, 1); assert.equal(f.facts().gets, 1); assert.equal(f.facts().operations, 0);
  report.cases.push('normal actual admission preserves existing order and exact revision/View/MIME; no prompt mutation, one original upload and one Graph read');
  for (const change of [{ canvasId: 'other' }, { api: {} }, { messageId: 'message-B' }, { operationId: 'operation-B' }, { receiverConversationId: 'other' }, { workspaceId: 'other' }, { inputKey: 'other' }, { open: false }]) {
    f = fixture(); let release; const waiting = new Promise(resolve => { release = resolve; });
    f.ports.uploadFiles = async () => { await waiting; return f.result; };
    const pending = receive([file], f.ports);
    assert.equal(f.facts().operations, 1);
    const second = await receive([file], f.ports); assert.equal(second.ok, false);
    f.context(change); release(); const result = await pending;
    assert.equal(result.ok, false); assert.equal(f.facts().refs.length, 0); assert.equal(f.facts().operations, 0);
  }
  report.cases.push('same-input-key foreign Canvas/API/message/op/receiver/workspace/input/closed scene rejects late result; original preparing operation prevents concurrent second upload');
  f = fixture(); let release; const waiting = new Promise(resolve => { release = resolve; });
  f.ports.graph = async () => { await waiting; return graph; };
  const lateRead = receive([file], f.ports); await new Promise(resolve => setTimeout(resolve, 0));
  f.context({ messageId: 'later-message' }); release(); assert.equal((await lateRead).ok, false); assert.equal(f.facts().refs.length, 0);
  report.cases.push('fresh Graph await cannot admit into later same-key message');
  f = fixture();
  f.ports.graph = async () => ({ ...graph, artifactViews: [{ ...graph.artifactViews[0], revisionId: 'later' }] });
  assert.equal((await receive([file], f.ports)).ok, false); assert.equal(f.facts().refs.length, 0);
  report.cases.push('mutable source View advanced after upload is rejected; never adopt Current or mismatched file facts');
  f = fixture(); f.result.success = false; f.result.results = [{ file, result: { success: false, error: 'opaque failure' } }];
  assert.equal((await receive([file], f.ports)).ok, false); assert.equal(f.facts().uploads, 1); assert.equal(f.facts().gets, 0); assert.equal(f.facts().refs.length, 0);
  report.cases.push('unknown upload remains visible failure, zero automatic reupload/Graph/admission/Canvas fallback');
  f = fixture(); let finish; const held = new Promise(resolve => { finish = resolve; });
  f.ports.uploadFiles = async () => { await held; return f.result; };
  const laterDraft = receive([file], f.ports); f.prompt('user C typed later'); finish(); assert.equal((await laterDraft).ok, true);
  assert.equal(f.prompt(), 'user C typed later'); assert.equal(f.facts().restoreCalls, 0);
  report.cases.push('later text in the same valid input stays intact; attachment adds only refs and caret restoration is refused by unchanged-draft owner');
  const attrs = {};
  for (const name of ['onMaterialDragOver', 'onMaterialDrop', 'onMaterialPaste']) attrs[name] = one(nodes(host, node => ts.isJsxAttribute(node) && node.name.getText(host) === name), name).initializer.expression.getText(host);
  let captures = 0, excerpts = 0;
  const handlers = new Function('controls', 'with(controls){return {' + Object.entries(attrs).map(([key, value]) => JSON.stringify(key) + ':' + value).join(',') + '}}')({
    hasNativeComposerFiles, receiveNativeFiles: transfer => { if (!hasNativeComposerFiles(transfer)) return false; captures++; return true; },
    LCOS_MATERIAL_TRANSFER_MIME: 'application/x-lcos-material-transfer', receiveMaterial: () => { excerpts++; }, state: 'idle', voiceState: 'idle', preparingReferences: false,
  });
  for (const name of ['onMaterialDrop', 'onMaterialPaste']) {
    let prevented = false, stopped = false;
    const transfer = { types: ['Files'], files: [file] }, event = { dataTransfer: transfer, clipboardData: transfer, preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; } };
    handlers[name](event); assert.ok(prevented && stopped);
  }
  assert.equal(captures, 2); assert.equal(excerpts, 0);
  const transfer = { types: ['application/x-lcos-material-transfer'], files: [] };
  handlers.onMaterialPaste({ clipboardData: transfer, preventDefault() {}, stopPropagation() {} }); assert.equal(excerpts, 1);
  report.cases.push('actual full-map Host drop/paste DOM handlers consume Files at original input and preserve existing excerpt MIME branch');
  report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; throw error;
} finally {
  const output = path.join(root, 'output/原生文件Drop整合_20261017i/Composer文件原输入回归.json');
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ output, ...report }));
}
