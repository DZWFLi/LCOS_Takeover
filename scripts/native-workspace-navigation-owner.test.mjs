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
const actual = ['navigationOwner', 'libraryNavigation', 'navigationListeners', 'publishNavigation', 'sameNavigationScene',
  'LCOSNativeLibraryNavigationOwner', 'restoreOriginalLibrary', 'consumeNativeWorkspaceReturn', 'nativeWorkspaceSourceRestoring']
  .map(declaration).join('\n');
const code = ts.transpileModule(actual, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
const checks = [];
function harness() {
  const shell = { projectId: 'p', activeWorkspaceId: 'workspace-main' };
  const canvas = { status: 'ready', canvasId: 'main', rfInstance: { mounted: 'main' } };
  const calls = { restores: 0, selections: [], publications: [], notifications: [] }, effects = [];
  const useCanvasStore = selector => selector(canvas); useCanvasStore.getState = () => canvas;
  const useLcosShellStore = selector => selector(shell); useLcosShellStore.getState = () => shell;
  const env = { useCanvasStore, useLcosShellStore, useEffect: callback => effects.push(callback),
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(), UserError: class UserError extends Error {} };
  const h = new Function(...Object.keys(env), code + '\nreturn {owner:LCOSNativeLibraryNavigationOwner,read:()=>libraryNavigation,set:publishNavigation,restoring:nativeWorkspaceSourceRestoring,observe:callback=>navigationListeners.add(callback)};')(...Object.values(env));
  const source = { id: 'workspace-main', canvasId: 'main' };
  const prior = { projectId: 'p', source: { id: 'workspace-parent', canvasId: 'parent' }, destination: source, phase: 'visiting',
    root: { kind: 'workflow', id: 'parent-method', title: '原方法' }, path: [{ key: 'nested-scope', scroll: 71 }], query: '上一层搜索', listScroll: 71 };
  const frame = { projectId: 'p', source, destination: source, phase: 'restoring', input: null,
    root: { kind: 'navigation-marker', id: 'marker-a', title: '已固定' }, priorReturn: prior,
    returnToSource: async () => { calls.restores++; }, notify: value => calls.notifications.push(value) };
  h.set(frame); h.observe(() => calls.publications.push(h.read()));
  return { h, shell, canvas, frame, prior, calls, effects,
    render(canvasId) { effects.length = 0; h.owner({ canvasId, disabled: false, onSelect: value => calls.selections.push(value) }); },
    flushFirst() { assert.equal(typeof effects[0], 'function'); effects.shift()(); },
    flushAll() { for (const callback of effects.splice(0)) callback(); },
  };
}
const staleContext = harness();
staleContext.render('context'); staleContext.flushAll();
assert.equal(staleContext.h.read(), staleContext.frame, 'old Context props cannot clear the valid Main restoring frame');
assert.equal(staleContext.calls.restores, 0, 'old Context owner cannot restore Main before its owner commits');
assert.deepEqual(staleContext.calls.publications, []); assert.deepEqual(staleContext.calls.selections, []);
staleContext.render('main'); staleContext.flushAll();
for (let i = 0; i < 4; i++) await tick();
assert.equal(staleContext.calls.restores, 1); assert.equal(staleContext.h.read(), staleContext.prior);
assert.deepEqual(staleContext.calls.selections, []); assert.deepEqual(staleContext.calls.notifications, []);
checks.push('global Main ready + old Context props keeps the exact restoring frame; committed Main owner runs actual restoration once and restores the same prior frame without navigation');

const capturedNull = harness(); capturedNull.shell.projectId = null; capturedNull.render('main');
capturedNull.shell.projectId = 'p'; capturedNull.flushFirst();
assert.equal(capturedNull.h.read(), capturedNull.frame, 'queued passive effect must not use its captured null project');
capturedNull.effects.length = 0; capturedNull.render('main'); capturedNull.flushAll();
for (let i = 0; i < 4; i++) await tick();
assert.equal(capturedNull.calls.restores, 1); assert.equal(capturedNull.h.read(), capturedNull.prior);
checks.push('captured project=null with a current nonempty matching project does not swallow restoration');

const temporarilyUnknown = harness(); temporarilyUnknown.render('context'); temporarilyUnknown.shell.projectId = null;
temporarilyUnknown.canvas.canvasId = 'third'; temporarilyUnknown.flushFirst();
assert.equal(temporarilyUnknown.h.read(), temporarilyUnknown.frame, 'unknown live project does not confirm an unrelated scene');
checks.push('a temporarily empty live project waits for a real current project before invalidation');

for (const [label, change] of [
  ['real third scene', item => { item.canvas.canvasId = 'third'; }],
  ['real new project', item => { item.shell.projectId = 'other-project'; }],
]) {
  const item = harness(); item.render('main'); change(item); item.flushFirst();
  assert.equal(item.h.read(), null, label + ' clears the old frame despite stale Main props');
  assert.equal(item.calls.publications.length, 1); assert.equal(item.calls.restores, 0); assert.deepEqual(item.calls.selections, []);
}
checks.push('actual getState third-scene and project departure still dispose stale returns, even when component props point at the old allowed scene');

const pendingSelection = harness(); pendingSelection.frame.phase = 'visiting';
pendingSelection.frame.source = { id: 'workspace-main', canvasId: 'main' };
pendingSelection.frame.destination = { id: 'workspace-context', canvasId: 'context' };
for (const scene of ['main', 'context']) { pendingSelection.canvas.canvasId = scene; pendingSelection.render('old-other-props'); pendingSelection.flushFirst(); assert.equal(pendingSelection.h.read(), pendingSelection.frame); }
pendingSelection.canvas.status = 'loading'; pendingSelection.canvas.canvasId = 'next-unconfirmed'; pendingSelection.render('context'); pendingSelection.flushFirst();
assert.equal(pendingSelection.h.read(), pendingSelection.frame);
checks.push('valid visiting source/destination and unconfirmed loading transitions retain their existing return frame');

const matching = harness(), root = { kind: 'navigation-marker', id: 'marker-a' };
assert.equal(matching.h.restoring('p', 'main', root), true, 'exact root accepts an independently allocated kind/id value');
assert.equal(matching.h.restoring('p', 'main'), true, 'old two-argument callers keep their original behavior');
matching.h.set({ ...matching.frame, root: { kind: 'navigation-marker', id: 'marker-b' } });
assert.equal(matching.h.restoring('p', 'main', root), false, 'same source and project cannot revive a different marker callback');
assert.equal(matching.h.restoring('p', 'main'), true);
matching.h.set({ ...matching.frame, root: { kind: 'workflow', id: 'marker-a' } });
assert.equal(matching.h.restoring('p', 'main', root), false, 'root kind is part of the exact address');
for (const [label, frame] of [
  ['error frame', { ...matching.frame, error: '未恢复' }],
  ['visiting frame', { ...matching.frame, phase: 'visiting' }],
  ['no restoration callback', { ...matching.frame, returnToSource: undefined }],
  ['foreign project', { ...matching.frame, projectId: 'other-project' }],
  ['different source', { ...matching.frame, source: { id: 'workspace-other', canvasId: 'other' } }],
]) { matching.h.set(frame); assert.equal(matching.h.restoring('p', 'main', root), false, label); }
assert.deepEqual(matching.calls.selections, []); assert.equal(matching.calls.restores, 0);
checks.push('optional root matches kind+id, rejects replacement roots and invalid frames, and keeps old two-argument restoration callers compatible');
console.log(JSON.stringify({ passed: true, checks, scope: 'actual TypeScript navigation owner/restore/consume/helper declarations with controlled passive-effect order and native stores; no browser/runtime/API/model writes' }, null, 2));