import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { transformNativeMemberNodeScript } from '../lab/native-member-node-transform.mjs';
import { transformAgentNodeScript, parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformNativeFirstTextScript } from '../lab/native-text-first-transform.mjs';
import { transformNativeMaterialViewerScript } from '../lab/native-material-viewer-transform.mjs';
import { transformRendererScript } from '../lab/startup-transform.mjs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';

const require = createRequire(path.join(currentGen2Root, 'package.json')), ts = require('typescript');
const source = await fs.readFile('lab/pilot/native-member-ui.tsx', 'utf8');
const file = ts.createSourceFile('native-member-ui.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(file.parseDiagnostics.length, 0);
const names = ['readNativeMemberNode', 'nativeMemberSurfaceMatches', 'nativeMemberOwnerCurrent', 'openNativeMemberSource', 'restoreNativeMemberNode', 'LCOSNativeMemberBody'];
const declarations = file.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)
  || ts.isVariableStatement(node) && node.declarationList.declarations.some(value => ['record', 'nonEmpty'].includes(value.name.getText(file))));
const compiled = ts.transpileModule(declarations.map(node => node.getText(file).replace(/^export\s+/, '')).join('\n'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.None } }).outputText;
const checks = [], tick = () => new Promise(resolve => setImmediate(resolve));
const ref = type => ({ projectId: 'p', canvasId: 'canvas', workspaceId: 'w', entityType: type, entityId: type + '-exact' });
const nodeData = type => ({ id: 'node-' + type, title: '同名内容', lcos_member_ref: ref(type), lcos_member_facts: {
  title: '同名内容', ...(type === 'note' ? { body: '第一行\n\n真实附注 **正文**', updatedAt: 'exact-version' }
    : type === 'scope' ? { scopeId: 'scope-exact', scopeKind: 'workflow', description: '真实方法说明' }
      : { scopeId: 'scope-root', scopeKind: 'root', targetWorkspaceId: 'workspace-exact', targetCanvasId: 'target-canvas', description: '真实现场说明' }) } });
const deferred = () => { let resolve; const promise = new Promise(a => { resolve = a; }); return { promise, resolve }; };
function harness(type = 'note') {
  const data = nodeData(type), nodeId = data.id, canvasApi = {}, shell = { projectId: 'p', activeWorkspaceId: 'w', activeSurface: 'workflow',
    surfaceCanvasId: { main: 'canvas-main-root', context: 'canvas-context-root', workflow: 'canvas' } };
  const canvas = { status: 'ready', canvasId: 'canvas', rfInstance: canvasApi, nodes: [{ id: nodeId, type: 'lcos-member', canvas_id: 'canvas', data }] };
  const host = { projectId: 'p', currentCanvasId: 'canvas', api: canvasApi }, calls = { notes: [], libraries: [], workspaces: [], enters: [], restore: 0, release: [], focus: 0 };
  let current = true, stateIndex = 0, refIndex = 0, states = [], refs = [];
  const document = { activeElement: null, querySelector: () => null, querySelectorAll: () => [root] };
  const viewportButton = { focus: () => { calls.focus++; document.activeElement = viewportButton; } }, root = { dataset: { nativeMemberBody: nodeId }, querySelector: () => viewportButton, getClientRects: () => [{}] };
  const cleanup = [];
  const shellStore = { getState: () => shell }, canvasStore = selector => selector(canvas); canvasStore.getState = () => canvas;
  const target = { id: 'workspace-exact', projectId: 'p', scopeId: 'scope-root', canvasId: 'target-canvas' };
  const ports = { current: () => current, note: value => calls.notes.push(value), library: async (...value) => calls.libraries.push(value),
    workspaces: async (...value) => { calls.workspaces.push(value); return [target]; }, enter: async (...value) => calls.enters.push(value),
    restore: async () => { calls.restore++; }, release: preserve => calls.release.push(preserve) };
  const env = { useLcosShellStore: shellStore, useCanvasStore: canvasStore, window: { __LCOS_NODE_LAB__: host },
    document, requestAnimationFrame: callback => { queueMicrotask(callback); return 1; },
    useRef(value) { const i = refIndex++; return refs[i] ?? (refs[i] = { current: value }); },
    useState(value) { const i = stateIndex++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = next; }]; }, useEffect(callback) { cleanup.push(callback()); },
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.length === 1 ? children[0] : children } }) },
    requestNativeNoteView: ports.note, requestNativeLibraryMemberView: ports.library,
    enterNativeWorkspaceWithReturn: ports.enter, createLcosCoreSession: () => ({ projects: { getWorkspaces: ports.workspaces } }),
    withNativeLibraryReadingReturn: (request, lease) => ({ ...request, testLease: lease }), cancelNativeLibraryReadingReturn: () => {} };
  const actual = new Function(...Object.keys(env), compiled + ';return {' + names.join(',') + '};')(...Object.values(env));
  const parsed = actual.readNativeMemberNode(nodeId, data);
  return { ...actual, calls, ports, data, parsed, nodeId, canvas, canvasApi, shell, host, target, document, cancel: () => { current = false; }, unmount: () => cleanup.forEach(fn => fn?.()),
    render() { stateIndex = 0; refIndex = 0; return actual.LCOSNativeMemberBody({ id: nodeId, data, selected: true, TextBody: 'OriginalMarkdown', Button: 'OriginalButton' }); } };
}
for (const type of ['note', 'scope', 'workspace']) {
  const h = harness(type); assert.ok(h.parsed); assert.equal(h.nativeMemberOwnerCurrent(h.parsed), true);
  assert.equal(h.parsed.reference.entityType, type); assert.equal(h.parsed.reference.entityId, type + '-exact');
  assert.equal(h.readNativeMemberNode('other-node', h.data), undefined);
  assert.equal(h.readNativeMemberNode(h.nodeId, { ...h.data, lcos_member_facts: { ...h.data.lcos_member_facts, title: 'wrong' } }), undefined);
}
for (const patch of [{ body: undefined }, { updatedAt: '' }]) {
  const h = harness('note'); assert.equal(h.readNativeMemberNode(h.nodeId, { ...h.data, lcos_member_facts: { ...h.data.lcos_member_facts, ...patch } }), undefined);
}
{
  const h = harness('scope'); assert.equal(h.readNativeMemberNode(h.nodeId, { ...h.data, lcos_member_facts: { ...h.data.lcos_member_facts, scopeKind: 'root' } }), undefined);
}
for (const patch of [{ targetCanvasId: '' }, { targetWorkspaceId: 'other' }]) {
  const h = harness('workspace'); assert.equal(h.readNativeMemberNode(h.nodeId, { ...h.data, lcos_member_facts: { ...h.data.lcos_member_facts, ...patch } }), undefined);
}
checks.push('Actual typed parser preserves real Note body/version and Scope/Workspace identities, rejects incomplete or contradictory content, and permits existing root Workspace canvases.');

for (const invalidate of [h => h.shell.projectId = 'other', h => h.host.projectId = 'other', h => h.canvas.canvasId = 'other', h => h.host.api = {},
  h => h.shell.activeWorkspaceId = 'other', h => h.shell.activeSurface = 'context', h => h.shell.surfaceCanvasId.workflow = undefined, h => h.canvas.nodes[0].type = 'text',
  h => h.canvas.nodes[0].data = { ...h.data, lcos_member_facts: { ...h.data.lcos_member_facts, body: 'different body' } }]) {
  const h = harness(); invalidate(h); assert.equal(h.nativeMemberOwnerCurrent(h.parsed), false);
}
checks.push('Actual owner check requires the current original scene/API/workspace/surface and exact live typed node; changed content or fake Text never passes.');
for (const type of ['note', 'scope', 'workspace']) {
  const h = harness(type), roots = structuredClone(h.shell.surfaceCanvasId);
  h.canvas.canvasId = 'method-child-canvas'; h.canvas.nodes[0].canvas_id = 'method-child-canvas'; h.host.currentCanvasId = 'method-child-canvas';
  h.data.lcos_member_ref.canvasId = 'method-child-canvas'; h.data.lcos_member_ref.workspaceId = 'method-child-workspace'; h.shell.activeWorkspaceId = 'method-child-workspace';
  const child = h.readNativeMemberNode(h.nodeId, h.data);
  assert.equal(h.nativeMemberOwnerCurrent(child), true, type + ' child with root destination map');
  const newApi = {}; h.canvas.rfInstance = newApi; h.host.api = newApi;
  assert.equal(h.nativeMemberOwnerCurrent(child), true, type + ' child after original API recreation');
  await h.restoreNativeMemberNode(child); assert.equal(h.calls.focus, 3);
  h.shell.activeWorkspaceId = 'foreign-child'; assert.equal(h.nativeMemberOwnerCurrent(child), false);
  h.shell.activeWorkspaceId = 'method-child-workspace'; h.host.api = {}; assert.equal(h.nativeMemberOwnerCurrent(child), false);
  assert.deepEqual(h.shell.surfaceCanvasId, roots, 'child does not replace any of the three root destinations');
}
{
  const h = harness(); h.shell.activeSurface = 'context';
  assert.equal(h.nativeMemberOwnerCurrent(h.parsed), false, 'a root Canvas must still match its active Surface');
}
checks.push('Actual Note/Scope/Workspace owners and source restoration accept a child Canvas with the unchanged three-root destination map, including API recreation; exact child Workspace/API and root Surface checks remain enforced.');

{
  const h = harness('note'); await h.openNativeMemberSource(h.parsed, h.ports);
  assert.deepEqual(h.calls.notes, [{ projectId: 'p', noteId: 'note-exact', updatedAt: 'exact-version', title: '同名内容' }]);
  assert.equal(h.calls.libraries.length, 0); assert.equal(h.calls.enters.length, 0);
}
{
  const h = harness('scope'), controller = new AbortController(); await h.openNativeMemberSource(h.parsed, h.ports, controller.signal);
  const [project, member, origin, signal] = h.calls.libraries[0];
  assert.equal(project, 'p'); assert.equal(member.item.kind, 'workflow'); assert.equal(member.item.entityRef.id, 'scope-exact'); assert.equal(member.item.entityRef.type, 'workflow');
  assert.equal(origin.current(), true); assert.equal(signal, controller.signal); await origin.restore(); assert.equal(h.calls.restore, 1);
}
{
  const h = harness('workspace'); await h.openNativeMemberSource(h.parsed, h.ports);
  const [project, target, origin, restore] = h.calls.enters[0];
  assert.equal(project, 'p'); assert.equal(target, h.target); assert.deepEqual(origin, { kind: 'workspace', id: 'workspace-exact', title: '同名内容' });
  await restore(); assert.equal(h.calls.restore, 1); assert.equal(h.calls.libraries.length, 0);
}
for (const rows of [[], [{ id: 'workspace-exact', projectId: 'foreign', scopeId: 'scope-root', canvasId: 'target-canvas' }],
  [{ id: 'workspace-exact', projectId: 'p', scopeId: 'scope-root', canvasId: 'wrong' }]]) {
  const h = harness('workspace'); h.ports.workspaces = async () => rows;
  await assert.rejects(h.openNativeMemberSource(h.parsed, h.ports), /地址已变化/); assert.equal(h.calls.enters.length, 0);
}
for (const mode of ['current', 'abort']) {
  const h = harness('workspace'), gate = deferred(), controller = new AbortController(); h.ports.workspaces = () => gate.promise;
  const pending = h.openNativeMemberSource(h.parsed, h.ports, controller.signal);
  if (mode === 'current') h.cancel(); else controller.abort(); gate.resolve([h.target]);
  await assert.rejects(pending, /现场已切换/); assert.equal(h.calls.enters.length, 0);
}
checks.push('Actual actions dispatch the exact Note reader/Scope Library and fresh existing Workspace navigation; foreign, changed and cancelled directory results cannot enter another scene.');

{
  const h = harness('note'), tree = h.render();
  const walk = (node, test) => { if (!node || typeof node !== 'object') return undefined; if (test(node)) return node;
    for (const value of [node.props?.children].flat(Infinity)) { const found = walk(value, test); if (found) return found; } };
  const markdown = walk(tree, node => node.type === 'OriginalMarkdown'), button = walk(tree, node => node.type === 'OriginalButton');
  assert.equal(markdown.props.markdown, h.data.lcos_member_facts.body); assert.equal(button.props['data-native-member-action'], 'note'); assert.equal(button.props.disabled, undefined);
  button.props.onClick({ stopPropagation() {} }); await tick();
  assert.equal(h.calls.notes.length, 1); assert.equal(h.calls.notes[0].testLease.current(), true);
  await h.calls.notes[0].testLease.onReturn(); assert.equal(h.calls.focus, 3);
  assert.equal(tree.props['data-native-member-body'], h.nodeId); assert.equal(tree.props['data-native-member-id'], 'note-exact');
}
checks.push('Actual component renders the complete real Note through the supplied original Markdown and Button; original reading return focuses the same source action without touching a draft.');
{
  const h = harness('scope'), tree = h.render();
  const find = node => !node || typeof node !== 'object' ? undefined : node.type === 'OriginalButton' ? node
    : [node.props?.children].flat(Infinity).map(find).find(Boolean);
  find(tree).props.onClick({ stopPropagation() {} }); await tick();
  const origin = h.calls.libraries[0][2]; h.unmount();
  assert.equal(origin.current(), true, 'virtualization does not consume the Library source');
  const newApi = {}; h.canvas.rfInstance = newApi; h.host.api = newApi;
  assert.equal(h.nativeMemberOwnerCurrent(h.parsed), true);
  await origin.restore(); assert.equal(h.calls.focus, 3);
}
{
  const h = harness('note'); let visible = true, checks = 0;
  h.document.querySelector = () => { checks++; if (checks < 4) return {}; visible = false; return null; };
  await h.restoreNativeMemberNode(h.parsed); assert.equal(visible, false); assert.equal(h.calls.focus, 3); assert.ok(checks >= 6);
}
checks.push('Library source survives node-component virtualization; original-node return accepts a recreated Canvas API and waits for Viewer teardown plus three stable focus frames.');

const donorDir = 'reference/tapnow-installed/resources/web/assets/';
const courseName = 'course-api-base-url-CifxI1ia.js', pageName = 'page-Da_DfwiK.js';
const rawCourse = await fs.readFile(donorDir + courseName, 'utf8'), rawPage = await fs.readFile(donorDir + pageName, 'utf8');
const course = transformNativeMemberNodeScript(courseName, rawCourse);
assert.equal(transformNativeMemberNodeScript(courseName, course), course);
assert.ok(course.includes(rawCourse));
const combinedCourse = transformNativeMaterialViewerScript(courseName, transformNativeFirstTextScript(courseName, course));
parseOriginalDonorScript(combinedCourse, courseName);
const servedPage = transformHistoryIntentScript(pageName, transformSurfaceDockScript(pageName, transformNodeBridgeScript(pageName,
  transformCutScript(pageName, transformRendererScript(pageName, rawPage))).replace('VITE_FILE_ACCESS_URL:""', 'VITE_FILE_ACCESS_URL:window.location.origin')));
const agentPage = transformAgentNodeScript(pageName, servedPage), page = transformNativeMemberNodeScript(pageName, agentPage);
assert.equal(transformNativeMemberNodeScript(pageName, page), page);
assert.equal(transformAgentNodeScript(pageName, page), page);
const ast = parseOriginalDonorScript(course, courseName); let wrapper;
function visit(node) { if (!node?.type) return; if (node.type === 'VariableDeclarator' && node.id?.name === 'LCOSNativeMemberNode') wrapper = node.init;
  for (const [key, value] of Object.entries(node)) { if (['loc', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value); } }
visit(ast); assert.ok(wrapper);
const jsx = (type, props) => ({ type, props }), native = { Tw: Symbol('original-disabled-selection'), Gr: Symbol('original-shell'), wr: Symbol('original-title-resize'), CT: Symbol('original-markdown'), Ut: Symbol('original-button'), LCOSNativeMemberBody: Symbol('typed-content') };
const render = new Function('d', 'a', ...Object.keys(native), 'return ' + course.slice(wrapper.start, wrapper.end))({ memo: fn => fn }, { jsx }, ...Object.values(native));
const tree = render({ id: 'typed', data: nodeData('note'), selected: true, width: 320, height: 240 });
assert.equal(tree.props['data-native-member-node'], 'typed');
const disabled = tree.props.children, shell = disabled.props.children, frame = shell.props.children, body = frame.props.children;
assert.equal(disabled.type, native.Tw); assert.equal(shell.type, native.Gr); assert.equal(frame.type, native.wr);
assert.equal(frame.props.resizable, true); assert.equal(frame.props.isConnectable, false); assert.equal(frame.props.canProvideOutput, false);
assert.equal(frame.props.width, 320); assert.equal(frame.props.height, 240); assert.equal(body.type, native.LCOSNativeMemberBody);
assert.equal(body.props.TextBody, native.CT); assert.equal(body.props.Button, native.Ut);
checks.push('Actual donor transform retains original source, Tw/Gr/wr selection/title/resize and CT/Ut content controls; typed registry composes idempotently with existing Agent/Text/Viewer transforms.');

console.log(JSON.stringify({ passed: true, checks, networkRequests: 0, domainWrites: 0, browserVerified: false,
  unverified: ['Actual rendered native frame sizing and responsive visual review', 'Real original Viewer/Library/Workspace end-to-end navigation and scene return'] }, null, 2));
