import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';

const root = path.resolve(import.meta.dirname, '..');
const dependency = createRequire(path.join(currentGen2Root, 'package.json'));
const web = createRequire(path.join(currentGen2Root, 'huabu/apps/web/package.json'));
const ts = dependency('typescript'), { createStore } = web('zustand/vanilla');
const output = path.join(root, 'output/原库引用返回输入_20261026', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, checks: [], models: 0, network: 0, coreWrites: 0,
  scope: 'Actual capture/return/restore functions and current-input predicate, original mO Library store initializer/close, controlled original editor/frames; no live runtime or real-page claim.' };
try {
  const source = await fs.readFile(path.join(root, 'lab/pilot/native-library-contexts.tsx'), 'utf8');
  const file = ts.createSourceFile('contexts.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = name => { const values = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name); assert.equal(values.length, 1, name); return values[0].getText(file).replace(/^export\s+/, ''); };
  const variable = name => { const values = file.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(node => node.name.getText(file) === name)); assert.equal(values.length, 1, name); return values[0].getText(file); };
  const actual = ['libraryInputOrigin','originListeners','libraryListOwner','sameScopeReferenceInput'].map(variable).join('\n') + '\n'
    + ['setLibraryInputOrigin','captureNativeLibraryInputReturn','restoreNativeLibraryInputReturn','returnNativeLibraryInputReturn','captureNativeLibraryInputUseReturn'].map(fn).join('\n');
  const compiled = ts.transpileModule(actual, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const original = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-D4wysAbz.js'), 'utf8');
  const ast = parseOriginalDonorScript(original, 'UnlimitedModeToggle-D4wysAbz.js');
  const storeNode = ast.body.flatMap(node => node.type === 'VariableDeclaration' ? node.declarations : []).find(node => node.id?.name === 'mO');
  assert.ok(storeNode?.init);
  const makeStore = () => new Function('tn', '$e', 'is', 'let $n=0;return (' + original.slice(storeNode.init.start, storeNode.init.end) + ');')(
    createStore, { SPACE_TYPE_PRIVATE: 'private' }, () => {});
  const fresh = () => {
    const library = makeStore(); library.setState({ isOpen: true, searchKeyword: '原搜索', searchResults: [{ id: 'original' }] });
    let target = { nodeId: 'agent', messageId: 'message', continuationOperationId: 'operation' };
    const shell = createStore(() => ({ projectId: 'p', composerTarget: target, composerPrompt: '原草稿', composerCaret: { projectId: 'p', targetKey: 'agent', text: '原草稿', start: 1, end: 2 }, resumeComposer: () => true, rememberComposerCaret: caret => shell.setState({ composerCaret: caret }) }));
    const api = {}, canvas = createStore(() => ({ status: 'ready', canvasId: 'canvas', rfInstance: api }));
    const frames = [], events = [], notices = [];
    const editor = { isConnected: true, closest: () => null, getClientRects: () => [1], value: '原草稿', selectionStart: 1, selectionEnd: 2, focus: () => events.push('focus'), setSelectionRange: (start, end) => events.push(['caret', start, end]) };
    const ports = { shell: shell.getState, canvas: canvas.getState, editor: () => editor, open: () => events.push('open-input'), frame: callback => frames.push(callback) };
    const env = { useLcosShellStore: shell, useCanvasStore: canvas, composerInputKey: value => value?.nodeId ?? null,
      inputReturnPorts: ports, notifyNativeLibraryInputReturn: (message, retry) => notices.push({ message, retry }) };
    const m = new Function(...Object.keys(env), compiled + '\nreturn {capture:captureNativeLibraryInputUseReturn,captureInput:captureNativeLibraryInputReturn,set:(origin,list)=>{setLibraryInputOrigin(origin);libraryListOwner=list},origin:()=>libraryInputOrigin};')(...Object.values(env));
    const input = { projectId: 'p', inputKey: 'agent', nodeId: 'agent', messageId: 'message', continuationOperationId: 'operation', canvasId: 'canvas', api };
    const origin = { ...input }, list = { projectId: 'p', canvasId: 'canvas', store: library };
    m.set(origin, list);
    const flush = async promise => { for (let i = 0; i < 12; i++) { await Promise.resolve(); if (frames.length) frames.shift()(0); } return promise; };
    return { library, shell, canvas, input, origin, list, m, events, notices, flush };
  };
  let h = fresh(), action = h.m.capture(h.input); assert.equal(typeof action, 'function');
  const draft = h.shell.getState().composerPrompt;
  assert.equal(await h.flush(action()), true); assert.equal(h.library.getState().isOpen, false);
  assert.equal(h.library.getState().searchKeyword, ''); assert.deepEqual(h.library.getState().searchResults, []);
  assert.deepEqual(h.events, ['open-input','focus',['caret',1,2]]); assert.equal(h.shell.getState().composerPrompt, draft); assert.equal(h.m.origin(), null);
  report.checks.push('actual original mO.close clears only its Library; existing input return focuses original editor/latest caret without changing draft');

  for (const change of ['origin-reopened','list-replaced','message','operation','project','canvas','api']) {
    h = fresh(); action = h.m.capture(h.input);
    if (change === 'origin-reopened') h.m.set({ ...h.origin }, h.list);
    else if (change === 'list-replaced') h.m.set(h.origin, { ...h.list });
    else if (change === 'message') h.shell.setState({ composerTarget: { ...h.shell.getState().composerTarget, messageId: 'later' } });
    else if (change === 'operation') h.shell.setState({ composerTarget: { ...h.shell.getState().composerTarget, continuationOperationId: 'later' } });
    else if (change === 'project') h.shell.setState({ projectId: 'later' });
    else if (change === 'canvas') h.canvas.setState({ canvasId: 'later' });
    else h.canvas.setState({ rfInstance: {} });
    assert.equal(await action(), false, change); assert.equal(h.library.getState().isOpen, true, change); assert.deepEqual(h.events, [], change);
  }
  report.checks.push('late callback rejects reopened origin/list and changed message/op/project/Canvas/API before close or focus');
  for (const patch of [{ inputKey: 'other' }, { messageId: 'other' }, { continuationOperationId: 'other' }, { canvasId: 'other' }, { api: {} }]) {
    h = fresh(); assert.equal(h.m.capture({ ...h.input, ...patch }), undefined);
  }
  h = fresh(); h.m.set(null, h.list); assert.equal(h.m.capture(h.input), undefined); assert.equal(h.m.capture(null), undefined);
  report.checks.push('ordinary Library without explicit Composer origin and mismatched captured addresses acquire no close callback');
  h = fresh(); action = h.m.capture(h.input); const returnPromise = action();
  h.shell.setState({ composerTarget: { ...h.shell.getState().composerTarget, messageId: 'during-return' } });
  assert.equal(await h.flush(returnPromise), false); assert.equal(h.library.getState().isOpen, false); assert.deepEqual(h.events, ['open-input']);
  report.checks.push('owner changes after original close but before RAF prevent late textarea focus; no draft restored into next message');
  h = fresh(); action = h.m.capture(h.input); assert.equal(await h.flush(action()), true);
  h.library.setState({ isOpen: true, searchKeyword: 'later library' }); h.m.set({ ...h.origin }, h.list);
  assert.equal(await action(), false); assert.equal(h.library.getState().isOpen, true); assert.equal(h.library.getState().searchKeyword, 'later library');
  report.checks.push('consumed close action cannot close a subsequently reopened original store instance');
  const assemblySource = await fs.readFile(path.join(root, 'lab/pilot/native-assembly-ui.tsx'), 'utf8');
  const assemblyFile = ts.createSourceFile('assembly.tsx', assemblySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let addReference;
  const find = node => { if (ts.isVariableDeclaration(node) && node.name.getText(assemblyFile) === 'addReference') addReference = node; ts.forEachChild(node, find); }; find(assemblyFile); assert.ok(addReference);
  const actionSource = ts.transpileModule('const ' + addReference.getText(assemblyFile) + ';', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const policySource = await fs.readFile(path.join(root, 'lab/pilot/native-assembly-policy.ts'), 'utf8');
  const policyFile = ts.createSourceFile('policy.ts', policySource, ts.ScriptTarget.Latest, true);
  const sameInput = policyFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'sameNativeAssemblyInput'); assert.ok(sameInput);
  const actualSameInput = new Function(ts.transpileModule(sameInput.getText(policyFile).replace(/^export\s+/, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + ';return sameNativeAssemblyInput;')();
  for (const mode of ['collecting', 'ordinary', 'reopened-during-read']) {
    h = fresh(); const callbacks = [], refs = [];
    const referenceState = { projectId: 'p', referenceInputOperations: new Map(), beginReferenceInputOperation: () => 'token', finishReferenceInputOperation: token => callbacks.push(['finish', token]), addEntitiesToDraft: values => { refs.push(...values); return {}; } };
    let resolveGraph; const graphPromise = new Promise(resolve => { resolveGraph = resolve; });
    const env = { current: { projectId: 'p' }, ready: { item: { id: 'a' }, fileRecordId: 'f' }, isCurrent: () => true, pending: null, key: 'read', collectingReferences: mode !== 'ordinary',
      useLcosShellStore: h.shell, useLcosReferenceStore: { getState: () => referenceState },
      captureNativeLibraryInputReturn: projectId => h.m.captureInput(projectId), captureNativeLibraryInputUseReturn: h.m.capture,
      restoreNativeLibraryInputReturn: async () => { callbacks.push('ordinary-restore'); return true; }, composerInputKey: value => value?.nodeId,
      referencePickOwnerKey: () => 'owner', sameNativeAssemblyInput: actualSameInput,
      session: { projects: { getProjectGraph: () => graphPromise } }, setPending: () => {}, verifyNativeAssemblyVersion: () => {},
      assemblyDraftReferenceOf: () => ({ entityId: 'a', revisionId: 'r1' }), prepareDraftReferences: values => ({ ok: true, references: values }), runReferenceUnavailableReason: () => undefined,
      onClose: () => callbacks.push('row-close'), say: () => {}, mounted: { current: true } };
    const handler = new Function(...Object.keys(env), actionSource + '\nreturn addReference;')(...Object.values(env));
    const promise = handler(); if (mode === 'reopened-during-read') h.m.set({ ...h.origin }, h.list); resolveGraph({}); await h.flush(promise);
    assert.equal(refs.length, 1); assert.ok(callbacks.includes('row-close')); assert.equal(h.shell.getState().composerPrompt, '原草稿');
    assert.equal(h.library.getState().isOpen, mode !== 'collecting', mode);
    if (mode === 'ordinary') assert.ok(callbacks.includes('ordinary-restore'));
    if (mode === 'reopened-during-read') assert.deepEqual(h.events, [], 'old pick must not focus through a later Library');
  }
  report.checks.push('actual Assembly addReference handler: explicit collecting closes original mO + returns input; ordinary Rail keeps Library; reopened origin during read is not closed or focused (reference/read ports controlled)');
  const viewer = await fs.readFile(path.join(root, 'lab/pilot/native-material-viewer.tsx'), 'utf8');
  assert.match(viewer, /returning !== undefined && previous\?\.inputReturn === inputReturn\s*\? previous\.inputUseReturn : captureNativeLibraryInputUseReturn\(inputReturn\)/);
  const release = viewer.slice(viewer.indexOf('const release = runtime.subscribe'));
  assert.ok(release.indexOf('releaseNativeLibraryReadingReturn') < release.indexOf('if (owner.inputUse && owner.inputUseReturn)'));
  assert.ok(release.indexOf('if (owner.inputUse && owner.inputUseReturn)') < release.indexOf('if (closeNativeReaderRecovery'));
  assert.match(release, /void restoreNativeLibraryInputReturn\(owner\.inputReturn\)/);
  report.checks.push('Viewer same-inputReturn handoffs inherit captured callback; Scope lease remains first and ordinary no-Library restore remains present (source wiring; full Host separately tested)');
  report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; }
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, checks: report.checks, error: report.error, output }, null, 2));
