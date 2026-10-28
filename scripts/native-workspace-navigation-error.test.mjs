import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const ts = createRequire(path.join(currentGen2Root, 'package.json'))('typescript');
const source = await fs.readFile('lab/pilot/native-library-contexts.tsx', 'utf8');
const file = ts.createSourceFile('actual-native-library.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(file.parseDiagnostics.length, 0);
function declaration(name) {
  const nodes = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(value => value.name.getText(file) === name));
  assert.equal(nodes.length, 1, 'one actual source declaration: ' + name);
  return nodes[0].getText(file).replace(/^export\s+/, '');
}
const actual = ['libraryInputNoticeOwner', 'notifyNativeLibraryInputReturn', 'navigationOwner', 'libraryNavigation',
  'navigationListeners', 'publishNavigation', 'sameNavigationScene', 'reportNativeWorkspaceNavigationError',
  'LCOSUseNativeLibraryNavigationBack', 'navigateNativeLibraryWorkspace', 'restoreOriginalLibrary', 'consumeNativeWorkspaceReturn']
  .map(declaration).join('\n');
const code = ts.transpileModule(actual, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
} }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
const checks = [];
const message = '原画布还未就绪，可用原返回入口返回后重试。';
function harness() {
  const rows = ['Z', 'A', 'B', 'C'].map(name => ({ id: 'workspace-' + name, projectId: 'p', canvasId: 'canvas-' + name, scopeId: 'scope-' + name }));
  const calls = { notifications: [], publications: [], selections: [], viewports: [], restores: 0, promptWrites: 0 };
  const shell = { projectId: 'p', activeWorkspaceId: rows[1].id,
    composerTarget: Object.freeze({ messageId: 'current-message', continuationOperationId: 'current-operation', targetReferences: Object.freeze([{ revisionId: 'current-exact-revision' }]) }),
    composerCaret: Object.freeze({ text: '保留最新草稿', start: 2, end: 5 }) };
  Object.defineProperty(shell, 'composerPrompt', { get: () => '保留最新草稿', set: () => { calls.promptWrites++; throw Error('Arrival failure must not write input'); } });
  const listeners = new Set();
  // Ke can confirm the canvas before the new workspace/API is available.
  const canvas = { status: 'ready', canvasId: rows[2].canvasId, rfInstance: null,
    async setViewport(value, options) { calls.viewports.push({ value, options }); } };
  const useCanvasStore = selector => selector(canvas); useCanvasStore.getState = () => canvas;
  useCanvasStore.subscribe = callback => { listeners.add(callback); return () => listeners.delete(callback); };
  const useLcosShellStore = selector => selector(shell); useLcosShellStore.getState = () => shell;
  const prior = { projectId: 'p', source: rows[0], destination: rows[1], root: { kind: 'workflow', id: 'parent-method', title: '原方法' },
    phase: 'visiting', input: null, path: Object.freeze([{ key: 'nested-scope', scroll: 41, focus: 'exact-member' }]), query: '原搜索', listScroll: 67,
    expanded: Object.freeze(['workflow:parent']), viewport: Object.freeze({ x: 4, y: 8, zoom: .75 }) };
  const frame = { projectId: 'p', source: rows[1], destination: rows[2], root: Object.freeze({ kind: 'navigation', id: 'marker-exact', title: '固定目录' }),
    phase: 'visiting', priorReturn: prior, input: null, caret: shell.composerCaret, conversation: Object.freeze({ id: 'current-conversation' }),
    path: Object.freeze([{ key: 'current-directory', scroll: 93, focus: 'marker-exact' }]), query: '当前搜索', listScroll: 93,
    expanded: Object.freeze(['current-expanded']), viewport: Object.freeze({ x: 120, y: 140, zoom: .8 }),
    returnToSource: async () => { calls.restores++; } };
  const env = { useCanvasStore, useLcosShellStore,
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useEffect: callback => { callback(); },
    createLcosCoreSession: () => ({ projects: { async getWorkspaces() { return rows; } } }),
    nonEmpty: value => typeof value === 'string' && !!value.trim(), UserError: class UserError extends Error {},
    React: { createElement: (...args) => ({ args }) }, ArrowLeft: 'OriginalArrowLeft', setTimeout, clearTimeout,
  };
  const h = new Function(...Object.keys(env), code + '\nreturn {report:reportNativeWorkspaceNavigationError,back:LCOSUseNativeLibraryNavigationBack,read:()=>libraryNavigation,set:publishNavigation,restore:restoreOriginalLibrary,observe:cb=>navigationListeners.add(cb),owner:value=>navigationOwner=value};')(...Object.values(env));
  h.set(frame); h.observe(() => calls.publications.push(h.read()));
  const onSelect = async ({ id }) => { calls.selections.push(id); const target = rows.find(row => row.canvasId === id); assert.ok(target);
    canvas.canvasId = target.canvasId; shell.activeWorkspaceId = target.id; for (const callback of [...listeners]) callback(); };
  h.owner({ projectId: 'p', canvasId: rows[2].canvasId, disabled: false, onSelect });
  return { h, rows, calls, frame, prior, shell, canvas, listeners,
    report: (args = {}) => h.report(args.projectId ?? 'p', args.sourceCanvasId ?? rows[1].canvasId,
      args.destinationCanvasId ?? rows[2].canvasId, args.root ?? frame.root, args.message ?? message),
    notice: (canvasId = rows[2].canvasId) => h.back(canvasId, value => calls.notifications.push(value)),
  };
}
const ready = harness(); ready.notice();
const input = Object.freeze({ inputKey: 'exact-current-input', messageId: 'current-message', continuationOperationId: 'current-operation', references: ready.shell.composerTarget.targetReferences });
ready.frame.input = input;
const original = { ...ready.frame }, target = ready.shell.composerTarget, caret = ready.shell.composerCaret;
assert.equal(ready.canvas.rfInstance, null); assert.equal(ready.shell.activeWorkspaceId, ready.rows[1].id);
assert.equal(ready.report(), true, 'error remains reportable while the destination workspace/API has not mounted');
const reported = ready.h.read(); assert.notEqual(reported, ready.frame); assert.equal(reported.error, message); assert.equal(ready.frame.error, undefined);
for (const [key, value] of Object.entries(original)) assert.equal(reported[key], value, 'error-only change preserves existing ' + key);
assert.equal(ready.shell.composerTarget, target); assert.equal(ready.shell.composerCaret, caret); assert.equal(ready.shell.composerPrompt, '保留最新草稿');
assert.equal(ready.calls.promptWrites, 0); assert.deepEqual(ready.calls.notifications, [message]); assert.equal(ready.calls.publications.length, 1);
assert.deepEqual(ready.calls.selections, []); assert.deepEqual(ready.calls.viewports, []); assert.equal(ready.calls.restores, 0);
const back = ready.h.back(ready.rows[2].canvasId); assert.equal(back.title, message); assert.equal(back.busy, false); assert.equal(typeof back.onBack, 'function');
checks.push('unregistered destination workspace/API: only the exact visiting frame receives the error; original input/caret/references/path/camera/priorReturn and original Back stay intact, with no automatic navigation');

for (const [name, change, args] of [
  ['no frame', item => item.h.set(null)],
  ['returning', item => { item.frame.phase = 'returning'; }],
  ['restoring', item => { item.frame.phase = 'restoring'; }],
  ['new project', item => { item.shell.projectId = 'new-project'; }],
  ['third scene', item => { item.canvas.canvasId = item.rows[3].canvasId; }],
  ['back at source', item => { item.canvas.canvasId = item.rows[1].canvasId; }],
  ['frame project mismatch', item => { item.frame.projectId = 'old-project'; }],
  ['frame source mismatch', item => { item.frame.source = item.rows[0]; }],
  ['frame destination mismatch', item => { item.frame.destination = item.rows[3]; }],
  ['request project mismatch', () => {}, { projectId: 'wrong-project' }],
  ['request source mismatch', () => {}, { sourceCanvasId: 'wrong-source' }],
  ['request destination mismatch', () => {}, { destinationCanvasId: 'wrong-destination' }],
  ['root kind mismatch', () => {}, { root: { kind: 'workflow', id: 'marker-exact' } }],
  ['root identity mismatch', () => {}, { root: { kind: 'navigation', id: 'other-marker' } }],
  ['empty error', () => {}, { message: '  ' }],
]) {
  const item = harness(); item.notice(); change(item); item.calls.publications.length = 0;
  const before = item.h.read(); assert.equal(item.report(args), false, name); assert.equal(item.h.read(), before, name + ' keeps frame identity');
  assert.deepEqual(item.calls.publications, [], name + ' publishes nothing'); assert.deepEqual(item.calls.notifications, []);
  assert.deepEqual(item.calls.selections, []); assert.deepEqual(item.calls.viewports, []); assert.equal(item.calls.promptWrites, 0);
}
checks.push('returning/restoring/new project/third scene/source/root mismatches reject without frame mutation, notifications, input writes or navigation');
for (const owner of ['absent', 'stale-canvas', 'stale-project']) {
  const item = harness(); if (owner === 'stale-canvas') item.notice('canvas-old');
  if (owner === 'stale-project') { item.shell.projectId = 'old-project'; item.notice(); item.shell.projectId = 'p'; }
  assert.equal(item.report(), true); assert.equal(item.h.read().error, message); assert.deepEqual(item.calls.notifications, []);
}
checks.push('an absent/stale notification owner cannot receive a different scene/project error; the original Back frame still shows it');

const returning = harness(); returning.notice(); assert.equal(returning.report(), true);
returning.h.back(returning.rows[2].canvasId).onBack();
for (let i = 0; i < 8; i++) await tick();
assert.equal(returning.canvas.canvasId, returning.rows[1].canvasId); assert.equal(returning.h.read().phase, 'restoring');
assert.equal(returning.h.read().error, undefined, 'original Back clears the displayed failure while returning');
await returning.h.restore(returning.h.read());
assert.equal(returning.h.read(), returning.prior, 'actual restoration consumes only the error frame and republishes the same prior return');
assert.equal(returning.calls.restores, 1); assert.deepEqual(returning.calls.selections, [returning.rows[1].canvasId]);
assert.deepEqual(returning.calls.viewports, [{ value: returning.frame.viewport, options: { duration: 0 } }]);
assert.equal(returning.calls.promptWrites, 0); assert.equal(returning.listeners.size, 0);
checks.push('after a reported failure, actual original HeaderBack + Ke + restoration returns one layer, restores the original camera and preserves the exact prior return frame');
console.log(JSON.stringify({ passed: true, checks, scope: 'actual TypeScript reporter/HeaderBack/Ke/restore declarations with controlled stores and native callbacks; no browser/runtime/API/model writes' }, null, 2));