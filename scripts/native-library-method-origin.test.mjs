import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const require = createRequire(path.join(currentGen2Root, 'package.json'));
const ts = require('typescript'), esbuild = require('esbuild');
const source = await fs.readFile('lab/pilot/native-library-contexts.tsx', 'utf8');
const file = ts.createSourceFile('library.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(file.parseDiagnostics.length, 0);
const checks = [], tick = () => new Promise(resolve => setImmediate(resolve));
async function pure(name) {
  const input = await fs.readFile('lab/pilot/' + name + '.ts', 'utf8');
  const { code } = await esbuild.transform(input, { loader: 'ts', format: 'esm', target: 'es2022' });
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const entry = await pure('native-library-entry'), reader = await pure('native-library-reading-return'), memberEntry = await pure('native-library-member-entry');
function actualFunction(name) {
  const nodes = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(nodes.length, 1, name);
  return nodes[0].getText(file).replace(/^export\s+/, '');
}
function actualVariable(name) {
  const statements = file.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(value => value.name.getText(file) === name));
  assert.equal(statements.length, 1, name);
  return statements[0].getText(file);
}
const actual = ['libraryMemberOrigin', 'memberOriginListeners', 'publishMemberOrigin'].map(actualVariable).join('\n') + '\n' +
  ['currentLibraryMemberOrigin', 'releaseLibraryMemberOrigin', 'requestNativeLibraryMemberView', 'returnLibraryMemberOrigin',
    'sameNavigationScene', 'restoreOriginalLibrary', 'LCOSNativeLibraryContextDetail'].map(name => name === 'sameNavigationScene' ? actualVariable(name) : actualFunction(name)).join('\n');
const compiled = ts.transpileModule(actual, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.None } }).outputText;
const item = (kind, id, title = '同名内容') => ({ schemaVersion: 1, kind, entityRef: { type: kind, id }, title, usageCount: 0 });
const detail = value => ({ asset: { lcos_library_entry: { projectId: 'p', item: value } } });
function harness() {
  let stateIndex = 0, refIndex = 0, states = [], refs = [], navigation = null, list;
  const calls = { events: [], entries: [], closes: 0, restore: 0, release: [], reads: [], selections: [], expanded: [], row: 0 };
  const api = {}, shell = { projectId: 'p', composerPrompt: '保留草稿', composerTarget: null, activeWorkspaceId: 'w-source', composerCaret: null };
  const canvas = { status: 'ready', canvasId: 'canvas', rfInstance: api, viewport: { x: 0, y: 0, zoom: 1 } };
  canvas.rfInstance.getViewport = () => ({ x: 18, y: 24, zoom: 0.8 });
  let sourceCurrent = true, onLibraryOpen = () => {};
  const provenance = { title: '原方法', current: () => sourceCurrent, restore: async () => { calls.restore++; }, release: preserve => calls.release.push(preserve) };
  const libraryState = { activeSpace: 'private', searchKeyword: '原查询', close: () => calls.closes++, open: () => calls.events.push('open-store'),
    setSearchKeyword: value => { libraryState.searchKeyword = value; }, setActiveSpace: async value => { libraryState.activeSpace = value; } };
  const store = { getState: () => libraryState }, scroller = { scrollTop: 51, scrollHeight: 400, clientHeight: 100 };
  const body = { scrollTop: 73 }, buttons = [];
  const root = { isConnected: true, querySelector: selector => selector === '.native-library-content-body' ? body : null, querySelectorAll: () => buttons };
  const frames = [], rows = new Map(), workspaces = [
    { id: 'w-source', projectId: 'p', scopeId: 'source-scope', canvasId: 'canvas' },
    { id: 'w-target', projectId: 'p', scopeId: 'target-scope', canvasId: 'canvas-target' }];
  const doc = { activeElement: null, querySelector: () => null, querySelectorAll: () => [scroller] };
  const hooks = { useState(value) { const index = stateIndex++; if (!(index in states)) states[index] = typeof value === 'function' ? value() : value;
    return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
    useRef(value) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: value }); },
    useEffect() {}, useLayoutEffect() {}, useSyncExternalStore: (_subscribe, read) => read() };
  const shellStore = select => select(shell); shellStore.getState = () => shell;
  const canvasStore = select => select(canvas); canvasStore.getState = () => canvas;
  list = { projectId: 'p', canvasId: 'canvas', openEntry: async (kind, id, current, signal) => {
    assert.equal(signal.aborted, false); if (current()) calls.entries.push([kind, id]); }, read: () => ['existing'], expand: ids => calls.expanded.push(ids) };
  const env = { ...hooks, useLcosShellStore: shellStore, useCanvasStore: canvasStore, nativeLibraryEntry: entry.nativeLibraryEntry,
    openNativeLibraryMemberEntry: memberEntry.openNativeLibraryMemberEntry, UserError: Error,
    window: { dispatchEvent: value => { calls.events.push(value.type); onLibraryOpen(); } }, requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    useNativeLibraryPlacementStore: () => store, useNativeLibraryInputOrigin: () => null, sameScopeReferenceInput: () => false,
    notifyNativeLibraryInputReturn: message => { throw new Error('Unexpected return failure: ' + message); },
    returnNativeLibraryInputReturn: () => { throw new Error('Not an input-origin root.'); },
    cancelNativeLibraryReadingReturn: reader.cancelNativeLibraryReadingReturn, withNativeLibraryReadingReturn: reader.withNativeLibraryReadingReturn,
    nativeMaterialViewerAvailable: () => true, requestNativeNoteView: value => calls.reads.push(value),
    requestNativeMaterialView: value => calls.reads.push(value), requestNativeConversationView: () => true, requestNativeTaskView: () => true,
    captureNativeLibraryInputReturn: () => null, readNativeConversationSelection: () => ({ id: 'original-conversation' }), restoreNativeConversationSelection: () => {},
    composerInputKey: () => '', createLcosCoreSession: () => ({ projects: { getWorkspaces: async () => workspaces } }),
    navigateNativeLibraryWorkspace: async (...value) => calls.selections.push(value), document: doc, getComputedStyle: () => ({ overflowY: 'auto' }),
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.length === 1 ? children[0] : children } }) },
    NativeLibraryScopeDetail: () => {}, LCOSNativeLibraryCollectionDetail: () => {} };
  const make = new Function(...Object.keys(env), `let libraryNavigation=null;let libraryListOwner=null;const libraryRowOwners=new Map();const publishNavigation=value=>{libraryNavigation=value};\n${compiled}\nreturn {requestNativeLibraryMemberView,currentLibraryMemberOrigin,releaseLibraryMemberOrigin,returnLibraryMemberOrigin,restoreOriginalLibrary,component:LCOSNativeLibraryContextDetail,getOrigin:()=>libraryMemberOrigin,setList:value=>libraryListOwner=value,setNavigation:value=>libraryNavigation=value,getNavigation:()=>libraryNavigation,rows:libraryRowOwners};`);
  const actualApi = make(...Object.values(env)); actualApi.setList(list);
  const render = (value = item('collection', 'root'), remount = false) => {
    if (remount) { states = []; refs = []; }
    stateIndex = 0; refIndex = 0;
    const tree = actualApi.component({ detail: detail(value), NativePreview: () => {}, onClose: () => calls.closes++ });
    tree.props.ref.current = root;
    return tree.props.children;
  };
  const drain = async () => { let count = 0; while (frames.length) { assert.ok(++count < 400, 'frame loop'); frames.shift()(); await Promise.resolve(); } await tick(); };
  return { ...actualApi, calls, provenance, shell, canvas, api, store, libraryState, body, scroller, root, workspaces, doc, render, drain,
    setSourceCurrent: value => { sourceCurrent = value; }, onLibraryOpen: callback => { onLibraryOpen = callback; }, setListOwner: value => { list = value; actualApi.setList(value); } };
}

{
  const h = harness(), lease = { projectId: 'p', rootKind: 'context', rootId: 'existing-viewer', closed: false, current: () => true, onReturn: () => {} };
  const originalViewer = reader.withNativeLibraryReadingReturn({ projectId: 'p' }, lease);
  for (const kind of ['context', 'workflow', 'collection']) {
    await h.requestNativeLibraryMemberView('p', { kind: kind === 'collection' ? 'collection' : 'scope', item: item(kind, kind + '-exact') }, h.provenance);
    assert.equal(h.getOrigin().address.id, kind + '-exact'); assert.equal(reader.nativeLibraryReadingReturnCurrent(originalViewer), true);
  }
  assert.deepEqual(h.calls.entries, [['context', 'context-exact'], ['workflow', 'workflow-exact'], ['collection', 'collection-exact']]);
  assert.equal(h.calls.restore, 0); reader.cancelNativeLibraryReadingReturn(lease);
}
for (const bad of [{ kind: 'scope', item: item('collection', 'wrong') }, { kind: 'collection', item: item('workflow', 'wrong') },
  { kind: 'scope', item: { ...item('context', 'wrong'), entityRef: { type: 'workflow', id: 'wrong' } } }]) {
  const h = harness(); await assert.rejects(h.requestNativeLibraryMemberView('p', bad, h.provenance)); assert.deepEqual(h.calls.entries, []);
}
checks.push('Actual aggregate request routes each exact kind/id and rejects contradictory identities without occupying the existing global Viewer lease.');

{
  const h = harness(); await h.requestNativeLibraryMemberView('p', { kind: 'collection', item: item('collection', 'root') }, h.provenance);
  const origin = h.getOrigin(); assert.equal(h.currentLibraryMemberOrigin(origin), true);
  h.canvas.rfInstance = {}; assert.equal(h.currentLibraryMemberOrigin(origin), false); h.canvas.rfInstance = h.api;
  h.shell.projectId = 'other'; assert.equal(h.currentLibraryMemberOrigin(origin), false); h.shell.projectId = 'p';
  h.canvas.canvasId = 'other'; assert.equal(h.currentLibraryMemberOrigin(origin), false); h.canvas.canvasId = 'canvas';
  h.releaseLibraryMemberOrigin(origin, true); h.releaseLibraryMemberOrigin(origin, false);
  assert.equal(h.getOrigin(), null); assert.deepEqual(h.calls.release, [true]);
}
checks.push('Actual origin current/release respects project, canvas and API identity and releases an origin only once.');

{
  const h = harness(), controller = new AbortController();
  h.onLibraryOpen(() => { h.setSourceCurrent(false); controller.abort(); });
  await h.requestNativeLibraryMemberView('p', { kind:'collection', item:item('collection','root') }, h.provenance, controller.signal);
  const origin=h.getOrigin();assert.equal(origin.transferred,true);assert.equal(h.provenance.current(),false);assert.equal(controller.signal.aborted,true);
  assert.equal(h.currentLibraryMemberOrigin(origin),true);assert.deepEqual(h.calls.entries,[['collection','root']]);
  await h.returnLibraryMemberOrigin(origin,()=>h.calls.closes++);assert.equal(h.calls.restore,1);assert.equal(h.getOrigin(),null);
  const closed=harness(),aborted=new AbortController();aborted.abort();
  await assert.rejects(closed.requestNativeLibraryMemberView('p',{kind:'collection',item:item('collection','root')},closed.provenance,aborted.signal));assert.deepEqual(closed.calls.events,[]);
}
checks.push('Opening the original Library transfers the already-validated source before Gallery unmount/abort; destination remains current and root Back restores through the original Gallery owner. Pre-transfer cancellation still opens nothing.');

{
  const h = harness(); await h.requestNativeLibraryMemberView('p', { kind: 'collection', item: item('collection', 'root') }, h.provenance);
  let view = h.render(); assert.equal(view.props.parentTitle, '原方法');
  const nested = { kind: 'scope', key: '["scope","nested"]', title: '嵌套', item: item('workflow', 'nested', '嵌套') };
  await view.props.onOpenMember(nested); view = h.render();
  assert.equal(view.props.parentTitle, '同名内容'); assert.equal(entry.nativeLibraryEntry(view.props.detail).item.entityRef.id, 'nested');
  view.props.onBack(); view = h.render();
  assert.equal(entry.nativeLibraryEntry(view.props.detail).item.entityRef.id, 'root'); assert.equal(h.calls.restore, 0); assert.equal(h.calls.closes, 0);
  await view.props.onOpenMember(nested); view = h.render();
  await view.props.onOpenMember({ kind: 'collection', key: '["collection","root"]', title: '同名内容', item: item('collection', 'root') });
  view = h.render(); assert.equal(view.props.parentTitle, '原方法'); assert.equal(entry.nativeLibraryEntry(view.props.detail).item.entityRef.id, 'root');
  await view.props.onOpenMember({ kind: 'note', key: '["note","n"]', title: '附注', noteId: 'n', updatedAt: 'exact-version' });
  assert.equal(h.calls.reads.length, 1); assert.equal(h.getOrigin().closed, undefined);
  reader.releaseNativeLibraryReadingReturn(h.calls.reads[0], true); await h.drain();
  assert.equal(h.calls.restore, 0); assert.equal(h.calls.closes, 0); assert.equal(h.getOrigin().closed, undefined);
  view = h.render(); view.props.onBack(); await tick();
  assert.equal(h.calls.restore, 1); assert.equal(h.calls.closes, 2); assert.equal(h.getOrigin(), null);
}
checks.push('Actual detail callbacks keep aggregate provenance through nested Back, ancestor-cycle truncation and a child Note reading return; only root Back closes the original Library and restores Gallery.');

{
  const h = harness(); await h.requestNativeLibraryMemberView('p', { kind: 'collection', item: item('collection', 'root') }, h.provenance);
  const origin = h.getOrigin(); let view = h.render();
  await view.props.onOpenMember({ kind: 'scope', key: 'nested-key', title: '嵌套', item: item('workflow', 'nested') }); view = h.render();
  await view.props.onOpenMember({ kind: 'workspace', key: 'workspace-key', title: '目标现场', workspace: h.workspaces[1] });
  const navigation = h.getNavigation();
  assert.equal(navigation.memberOrigin, origin); assert.equal(navigation.path.length, 2); assert.equal(navigation.path[0].focus, 'nested-key');
  assert.equal(navigation.path[1].focus, 'workspace-key'); assert.equal(navigation.path[1].scroll, 73);
  assert.equal(navigation.query, '原查询'); assert.equal(navigation.listScroll, 51); assert.equal(navigation.returnToSource, undefined);
  assert.equal(h.calls.selections.length, 1); assert.equal(h.calls.restore, 0);
  const nextApi = {}; h.canvas.rfInstance = nextApi; h.setSourceCurrent(false);
  navigation.phase = 'restoring'; h.setNavigation(navigation);
  h.rows.set(JSON.stringify(['p', 'collection', 'root']), { canvasId: 'canvas', open: () => h.calls.row++ });
  h.libraryState.searchKeyword = 'changed'; h.scroller.scrollTop = 0;
  const restoring = h.restoreOriginalLibrary(navigation); await h.drain(); await restoring;
  assert.equal(origin.api, nextApi); assert.equal(origin.restored, true); assert.equal(h.currentLibraryMemberOrigin(origin), true);
  assert.equal(h.calls.row, 1); assert.equal(h.libraryState.searchKeyword, '原查询'); assert.equal(h.scroller.scrollTop, 51); assert.equal(h.calls.restore, 0);
  view = h.render(item('collection', 'root'), true);
  assert.equal(entry.nativeLibraryEntry(view.props.detail).item.entityRef.id, 'nested'); assert.equal(view.props.parentTitle, '同名内容');
  view.props.onBack(); view = h.render(); assert.equal(view.props.parentTitle, '原方法'); assert.equal(h.calls.restore, 0);
  view.props.onBack(); await tick(); assert.equal(h.calls.restore, 1);
}
checks.push('Actual workspace navigation retains aggregate origin plus full trail/focus; restoration updates its API, reopens the exact original Library row and restores trail before root Back can restore Gallery.');

console.log(JSON.stringify({ passed: true, checks, networkRequests: 0, domainWrites: 0, browserVerified: false,
  unverified: ['Real React effect cleanup and Radix mount/unmount transitions', 'Real Canvas scene arrival, DOM focus and responsive visual layering'] }, null, 2));
