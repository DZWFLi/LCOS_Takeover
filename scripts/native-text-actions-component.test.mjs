import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeFirstTextScript as first } from '../lab/native-text-first-transform.mjs';
import { transformNativeTextActionsScript as actions } from '../lab/native-text-actions-transform.mjs';
import { runNativeTextActionsBrowserFixture } from './native-text-actions-browser-fixture.mjs';
const root = path.resolve(import.meta.dirname, '..'), temp = path.join(root, '.runtime', 'text-actions-component-' + Date.now());
await fs.mkdir(temp, { recursive: true });
const dep = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json'));
const esbuild = createRequire(path.join(installedRoot, 'package.json'))('esbuild');
const mapEditing = await fs.readFile(path.join(root, 'lab/pilot/native-mindmap-editing.tsx'), 'utf8');
const actualMapDraftHelper = (await esbuild.transform(mapEditing.slice(mapEditing.indexOf('const draftKey ='), mapEditing.indexOf('const terminalSuccess =')),
  { loader: 'ts', format: 'esm' })).code;
const agentFixtureModule = 'export const nativeMaterialViewerAvailable=()=>globalThis.__TEXT_ACTION_FIXTURE__.viewerReady;'
  + 'export const requestNativeMaterialView=input=>globalThis.__TEXT_ACTION_FIXTURE__.events.push({kind:"viewer",input});'
  + 'const drafts=globalThis.__TEXT_ACTION_FIXTURE__.mapDrafts;\n' + actualMapDraftHelper;
const { Window } = dep('happy-dom'), dom = new Window({ url: 'http://127.0.0.1:1/' });
const prior = Object.fromEntries(['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent']) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'window' ? dom : dom[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const donorName = 'course-api-base-url-CifxI1ia.js';
const original = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', donorName), 'utf8');
const transformed = actions(donorName, first(donorName, original)), ast = parse(transformed, donorName);
const bindings = new Map(ast.body.flatMap(node => node.type === 'FunctionDeclaration' ? [[node.id.name, node]]
  : (node.declarations ?? []).filter(n => n.id?.type === 'Identifier').map(n => [n.id.name, n])));
const names = ['t4', 'Vde', 'Hde', 'JT', 'ua', 'n4', 'iBe', 'zde', 'xl', 'rBe', 'e4', 'r4', 's4'];
const statements = names.map(name => { const node = bindings.get(name); assert.ok(node, name);
  return (node.type === 'FunctionDeclaration' ? '' : 'const ') + transformed.slice(node.start, node.end) + ';'; }).join('\n');
const entry = path.join(temp, 'fixture.tsx'), fixtureBundle = path.join(temp, 'fixture.mjs');
await fs.writeFile(entry, `
import React, {act} from 'react'; import {createRoot} from 'react-dom/client'; import * as jsx from 'react/jsx-runtime';
import {LCOSNativeTextNodeOwner,LCOSNativeTextBodySlot,LCOSUseNativeTextTools,LCOSRequestNativeTextEdit,nativeTextSaveUserNotice}
  from ${JSON.stringify(path.join(root, 'lab/pilot/native-text-first-ui.tsx'))};
import {hasNativeMindMapDraft} from '/lcos/agent-ui.js';
const env=globalThis.__TEXT_ACTION_FIXTURE__,menuContext=React.createContext(null),policyContext=React.createContext(null);
const pass=({children})=>children;
const button=({children,onClick,disabled,className,...props})=>React.createElement(props['data-testid']==='canvas-node-delete-btn'?'span':'button',{
 onClick,disabled,className,'data-testid':props['data-testid'],'aria-label':props['aria-label']},children);
const menuRoot=({children,open,onOpenChange})=>React.createElement(menuContext.Provider,{value:{open,onOpenChange}},children);
const trigger=({children})=>{const m=React.useContext(menuContext);return React.cloneElement(children,{onClick:()=>m.onOpenChange(!m.open)})};
const content=({children})=>{const m=React.useContext(menuContext);return m.open?React.createElement('div',{role:'menu'},children):null};
const item=({children,onClick,disabled})=>{const m=React.useContext(menuContext);return React.createElement('button',{role:'menuitem',disabled,
 onClick:e=>{onClick?.(e);if(!e.defaultPrevented)m.onOpenChange(false)}},children)};
const icon=()=>React.createElement('svg',{width:18,height:18,'aria-hidden':true});
const controls={d:React,a:jsx,LCOSNativeTextNodeOwner,LCOSNativeTextBodySlot,LCOSUseNativeTextTools,LCOSRequestNativeTextEdit,
 Gr:React.Fragment,Mg:pass,wr:({children})=>React.createElement('section',{'data-original-node-shell':true},children),Ni:icon,
 Qs:()=>React.useContext(policyContext).readonly,bl:()=>true,Pr:()=>React.useContext(policyContext).loading,
 _t:()=>env.api,Lx:()=>id=>env.events.push({kind:'original-edit',id}),
 CT:({markdown})=>React.createElement('div',{'data-markdown-leaf':true},markdown.split('\\n').map((line,index)=>React.createElement('p',{key:index},line))),
 Zz:()=>({handleGenerate:(...args)=>env.events.push({kind:'generate',args})}),
 cc:({visible,isDragging,children})=>visible&&!isDragging?children:null,
 JU:()=>React.createElement('div',{'data-original-generate-input':true},'原生成输入'),
 Wx:({visible,isDragging,children})=>visible&&!isDragging?React.createElement('div',{'data-original-float':true},children):null,
 Me:()=>({t:key=>({'nodes.markdownToolbar.backgroundColor':'颜色','nodes.markdownToolbar.copyAll':'复制全文',
 'library.saveToLibrary':'保存到库','nodes.markdownToolbar.fullscreen':'编辑正文','common.delete':'删除'})[key]??key}),
 vp:select=>select({openForNodes:ids=>env.events.push({kind:'save-library',ids})}),
 Dg:()=>({key:'original-optional',text:'原附加动作',buttonType:'obsidian',handle:()=>env.events.push({kind:'optional'})}),
 _z:({onColorChange})=>React.createElement('span',{'data-original-color':true,onClick:()=>onColorChange('blue')},'颜色'),oBe:()=>{},
 sO:({value})=>React.createElement('button',{onClick:()=>env.events.push({kind:'copy',value})},'复制全文'),kg:icon,sp:icon,
 ac:()=>false,rc:()=>({nodes:{deletable:true}}),wF:()=>true,xo:()=>{},NO:true,Ut:button,Jh:icon,
 ee:(...values)=>values.filter(x=>typeof x==='string').join(' '),fp:()=>env.viewport.zoom,id:()=>()=>{},
 EL:()=>({isNodeToolbarHighlighting:()=>false}),$i:pass,fn:{CANVAS:{NODE:{TOOLBAR:'canvas-node-toolbar',DELETE_BTN:'canvas-node-delete-btn',TEXT:{TEXT_CONTENT:'original-text-content'}}}},
 ak:()=>false,Fo:x=>x,Ra:button,ea:menuRoot,Ci:trigger,ta:content,co:item,
 _n:({children,content})=>React.createElement('span',{'data-original-tooltip':content},children),
 $U:()=>React.createElement('div',{'data-original-loading':true},'原加载中'),kF:()=>React.createElement('hr'),Gde:()=>false};
const originalFunctions=new Function('controls', 'with(controls){'+${JSON.stringify(statements)}+'return{r4,s4,Hde};}')(controls);
let currentRoot;const outlet=document.createElement('div');document.body.append(outlet);
function Fixture({policy}){const[,tick]=React.useState(0);React.useEffect(()=>env.api.subscribeNative(()=>tick(x=>x+1)),[]);
 return React.createElement(policyContext.Provider,{value:policy},React.createElement(policy.kind==='generative'?originalFunctions.s4:originalFunctions.r4,
 {...env.node,id:env.node.id,data:env.node.data,selected:policy.selected,dragging:policy.dragging}));}
export async function render(policy={}){currentRoot??=createRoot(outlet);await act(async()=>{currentRoot.render(React.createElement(Fixture,
 {policy:{kind:'pure',selected:true,dragging:false,readonly:false,loading:false,...policy}}));});}
export async function click(element){await act(async()=>element.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));}
export async function doubleClick(element){await act(async()=>element.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true})));}
export async function update(task){await act(async()=>task());}
export async function close(){await act(async()=>currentRoot?.unmount());}
export {nativeTextSaveUserNotice,hasNativeMindMapDraft,LCOSRequestNativeTextEdit};
`);
await esbuild.build({ entryPoints: [entry], outfile: fixtureBundle, bundle: true, platform: 'node', format: 'esm', target: 'node22', jsx: 'automatic', logLevel: 'warning',
  plugins: [{ name: 'real-component-with-explicit-fixture-leaf-ports', setup(build) {
    build.onResolve({ filter: /^\/lcos\/(native-flow|agent-ui)\.js$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.includes('native-flow')
      ? 'export const useViewport=()=>globalThis.__TEXT_ACTION_FIXTURE__.viewport;'
      : agentFixtureModule, loader: 'js' }));
    build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
    build.onResolve({ filter: /^[^./][^:]*$/ }, args => { try { return { path: dep.resolve(args.path) }; } catch {} });
  } }] });
const report = { passed: false, scope: 'actual per-node React owner/body + source-extracted original r4/s4/n4/ua/rBe/iBe/xl/zde/JT/Vde/Hde; explicit controlled DOM/menu/Flow/save leaf ports in happy-dom, not full vendor app',
  candidateWrites: 0, realCoreWrites: 0, models: 0, cases: [] };
let app;
try {
  const listeners = new Set(), portListeners = new Set(), events = [], reads = [];
  const reference = { version: 1, entityType: 'artifact', entityId: 'artifact', artifactId: 'artifact', artifactViewId: 'view', revisionId: 'r1' };
  const fixture = { node: { id: 'node', type: 'text', data: { title: '人工正文', text: '# Alpha\n- Child', lcos_ref: reference },
    position: { x: 100, y: 110 }, width: 360, height: 280 }, viewport: { x: 0, y: 0, zoom: 1 }, viewerReady: true, events, failRead: false,
    pending: null, queued: null, verifyCalls: 0, resumeCalls: 0, writes: [], mapDrafts: new Map(), explicitOwner: null };
  fixture.api = { getNodes: () => [fixture.node], getNode: id => id === fixture.node.id ? fixture.node : undefined, getEdges: () => [],
    getViewport: () => fixture.viewport, getSelection: () => ({ nodeIds: ['node'], edgeIds: [] }),
    subscribeNative: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    updateNode: (id, patch) => { assert.equal(id, fixture.node.id); fixture.writes.push(patch); fixture.node = { ...fixture.node, ...patch }; [...listeners].forEach(listener => listener()); },
    updateNodeData: (id, patch) => { fixture.node = { ...fixture.node, data: { ...fixture.node.data, ...patch } }; [...listeners].forEach(listener => listener()); },
    fitView: async input => { events.push({ kind: 'original-fitView', input }); return true; },
    deleteElements: input => events.push({ kind: 'original-delete', input }) };
  globalThis.__TEXT_ACTION_FIXTURE__ = fixture;
  window.__LCOS_NODE_LAB__ = { projectId: 'project', canvasId: 'canvas', currentCanvasId: 'canvas', api: fixture.api };
  window.__LCOS_NATIVE_TEXT_SAVE_PORT__ = { subscribe: listener => { portListeners.add(listener); return () => portListeners.delete(listener); },
    getPending: () => fixture.pending,
    canResumeExplicitSave: (operationId, input) => !!fixture.explicitOwner && operationId === fixture.pending?.operationId
      && fixture.pending?.source === 'explicit' && Object.entries(fixture.explicitOwner).every(([key, value]) => input[key] === value),
    verify: async operationId => { fixture.verifyCalls++; events.push({ kind: 'verify-only', operationId }); return { status: 'unconfirmed', operationId, reason: 'HTTP 503 internal_uuid_123 queue_owner_987' }; },
    acknowledge: () => false, readQueuedAutosave: () => fixture.queued,
    resumeAutosave: () => { fixture.resumeCalls++; fixture.queued = null; [...portListeners].forEach(listener => listener()); return true; } };
  globalThis.fetch = async url => { const route = String(url); reads.push(route);
    if (fixture.failRead) return Response.json({ ok: false, error: { message: 'HTTP 503 internal_uuid_123' } }, { status: 503 });
    const value = route.includes('canvas-text?') ? { projectId: 'project', canvasId: 'canvas', spatialId: 'node', artifactId: 'artifact', viewId: 'view',
      revisionId: fixture.coreRevisionId ?? 'r1', fileRecordId: 'file', title: '人工正文', body: fixture.coreBody ?? '# Alpha\n- Child' }
      : { artifact: { id: 'artifact', projectId: 'project', kind: 'text', managed: true, currentRevisionId: fixture.coreRevisionId ?? 'r1', availability: 'available' } };
    return Response.json({ ok: true, value });
  };
  app = await import(pathToFileURL(fixtureBundle));
  const tick = async () => { await app.update(() => [...portListeners].forEach(listener => listener())); };
  const buttons = () => [...document.querySelectorAll('button')];
  const byText = text => buttons().find(button => button.textContent === text);
  const open = async () => { await app.click(document.querySelector('[data-testid="lcos-native-text-view-menu"] button')); };
  const originalAction = text => document.querySelector('[data-original-tooltip="' + text + '"] button') ?? byText(text);
  await app.render();
  assert.equal(document.querySelectorAll('[data-testid="canvas-node-toolbar"]').length, 1);
  assert.equal(document.querySelectorAll('.native-first-toolbar').length, 0);
  assert.equal(reads.length, 2, 'shared body/tools owner reads one exact text/detail pair');
  assert.equal(document.querySelector('[data-native-first-state]').getAttribute('data-native-first-state'), 'ready');
  assert.equal(document.querySelectorAll('[data-testid="lcos-native-text-view-menu"]').length, 1, 'one added compact original more entry');
  assert.equal(document.querySelectorAll('[data-testid="canvas-node-toolbar"] > ul').length, 4, 'original color/actions/delete groups plus one native more group');
  assert.ok(document.querySelector('[data-original-color]') && byText('原附加动作') && byText('复制全文'));
  assert.ok(originalAction('保存到库') && originalAction('编辑正文') && originalAction('删除'));
  await app.click(document.querySelector('[data-original-color]')); assert.equal(fixture.node.data.color, 'blue');
  await app.click(byText('原附加动作')); await app.click(byText('复制全文'));
  await app.click(originalAction('保存到库')); await app.click(originalAction('编辑正文')); await app.click(originalAction('删除'));
  for (const kind of ['optional', 'copy', 'save-library', 'original-edit', 'original-delete']) assert.equal(events.filter(event => event.kind === kind).length, 1, 'original action executes once: ' + kind);
  report.cases.push('actual iBe color/optional/copy/library/fullscreen and original zde delete remain and execute; exactly one compact native more group is added');
  await open(); assert.ok(byText('正文')?.disabled); assert.equal(byText('导图').disabled, false);
  await app.click(byText('导图')); await app.render();
  assert.equal(fixture.writes.length, 1); assert.equal(fixture.writes[0].data.lcosTextViewMode, 'mindmap');
  assert.equal(events.filter(event => event.kind === 'original-fitView').length, 1, 'existing mode fitView policy stays');
  assert.equal(reads.length, 2, 'mode/tool rerenders never fetch a second body');
  assert.equal(document.querySelectorAll('[data-testid="canvas-node-toolbar"]').length, 1);
  await open(); assert.ok(byText('编辑导图')); await app.click(byText('编辑导图'));
  assert.equal(events.at(-1).kind, 'viewer'); assert.equal(events.at(-1).input.editMode, 'mindmap');
  report.cases.push('one actual original toolbar; real Hde menu switches the shared body mode and opens same exact Viewer; original mode fitView retained; one fetch pair');
  await app.render({ readonly: true });
  assert.equal(document.querySelectorAll('[data-testid="lcos-native-text-view-menu"]').length, 0);
  assert.equal(document.querySelectorAll('[data-testid="canvas-node-toolbar"] button').length, 1, 'original zde independently retains delete under this readonly/deletable policy');
  assert.ok(originalAction('删除'));
  await app.render({ dragging: true }); assert.equal(document.querySelectorAll('[data-testid="canvas-node-toolbar"]').length, 0);
  await app.render({ selected: false }); assert.equal(document.querySelectorAll('[data-testid="canvas-node-toolbar"]').length, 0);
  await app.render({ kind: 'generative' }); assert.equal(document.querySelectorAll('[data-original-generate-input]').length, 1);
  await app.render({ kind: 'generative', loading: true }); assert.equal(document.querySelectorAll('[data-testid="canvas-node-toolbar"]').length, 0);
  await app.render();
  report.cases.push('actual n4/ua hides tools on loading/drag/unselected; readonly adds no LCOS tools and preserves original independent delete policy; original s4 cc/JU input remains');
  // Return to text before receipt tests, just as the original menu does.
  await open(); await app.click(byText('正文')); await app.render();
  const readCountBeforePort = reads.length;
  fixture.pending = { operationId: 'pending-A', status: 'unknown', canvasId: 'canvas', nodeId: 'node', artifactId: 'artifact', reason: 'internal_uuid_123' };
  fixture.queued = { projectId: 'project', canvasId: 'canvas', nodeId: 'node', count: 1, canResume: false }; await tick();
  await open(); assert.ok(byText('核对原保存')); assert.equal(byText('继续保存'), undefined);
  await app.click(byText('核对原保存')); assert.equal(fixture.verifyCalls, 1); assert.equal(fixture.resumeCalls, 0);
  assert.equal(reads.length, readCountBeforePort, 'save-port subscription refreshes pending only, never polls Core body');
  assert.ok(document.querySelector('[role="status"]').textContent.includes('草稿已保留'));
  assert.ok(!document.body.textContent.includes('internal_uuid') && !document.body.textContent.includes('HTTP 503'));
  fixture.pending = null; fixture.queued.canResume = true; await tick(); await open(); assert.ok(byText('继续保存')); assert.equal(byText('核对原保存'), undefined);
  await app.click(byText('继续保存')); assert.equal(fixture.resumeCalls, 1); assert.equal(fixture.verifyCalls, 1);
  fixture.queued = { projectId: 'foreign', canvasId: 'canvas', nodeId: 'node', count: 1, canResume: true }; await tick(); await open(); assert.equal(byText('继续保存'), undefined);
  // Close the native menu by its trigger before the following action checks.
  await open();
  report.cases.push('live port subscription exposes unknown verification without a revision change or extra GET; GET does not resume later draft; explicit same-owner continue alone wakes original queue; foreign queue refused');
  if (process.argv.includes('--check-explicit-map')) {
    fixture.queued = null;
    fixture.pending = { source: 'explicit', operationId: 'map-save-A', status: 'no-receipt-yet', canvasId: 'canvas', nodeId: 'node',
      artifactId: 'artifact', expectedRevisionId: 'r1', body: '# Saved map draft' };
    fixture.explicitOwner = { projectId: 'project', canvasId: 'canvas', nodeId: 'node', artifactId: 'artifact', artifactViewId: 'view', revisionId: 'r1', api: fixture.api };
    const mapKey = JSON.stringify(['project', 'canvas', 'node', 'artifact', 'view']);
    fixture.mapDrafts.set(mapKey, { base: { body: '# Original map' }, result: { operationId: 'map-save-A', status: 'no-receipt-yet' } });
    await app.update(() => fixture.api.updateNodeData('node', { lcosTextViewMode: 'mindmap' })); await tick();
    await open(); report.explicitMap = { editDisabled: byText('编辑导图')?.disabled, verifyPresent: !!byText('核对原保存'),
      exactExistingDraft: app.hasNativeMindMapDraft('project', 'canvas', 'node', 'artifact', 'view', 'map-save-A'), candidateWrites: 0, realCoreWrites: 0 };
    assert.equal(byText('编辑导图').disabled, false, 'same-exact explicit map pending must reopen the original retained session');
    const viewerBefore = events.filter(event => event.kind === 'viewer').length;
    await app.click(byText('编辑导图')); assert.equal(events.filter(event => event.kind === 'viewer').length, viewerBefore + 1);
    assert.deepEqual(events.at(-1).input, { projectId: 'project', artifactId: 'artifact', revisionId: 'r1', artifactViewId: 'view', nodeId: 'node', sourceCanvasId: 'canvas', title: '人工正文', editMode: 'mindmap' });
    for (const result of [undefined, { operationId: 'another-explicit' }]) {
      fixture.mapDrafts.set(mapKey, { base: {}, result }); await tick(); await open();
      assert.equal(byText('编辑导图').disabled, true, 'a draft with no/different original operation never authorizes this pending'); await open();
    }
    fixture.mapDrafts.set(mapKey, { base: {}, result: { operationId: 'map-save-A' } });
    for (const field of ['projectId', 'canvasId', 'nodeId', 'artifactId', 'artifactViewId', 'revisionId', 'api']) {
      const exact = fixture.explicitOwner[field]; fixture.explicitOwner[field] = field === 'api' ? {} : 'foreign';
      await tick(); await open(); assert.equal(byText('编辑导图').disabled, true, 'foreign explicit owner rejected: ' + field); await open();
      fixture.explicitOwner[field] = exact;
    }
    for (const source of ['native-autosave', 'native-history']) {
      fixture.pending.source = source; await tick(); await open(); assert.equal(byText('编辑导图').disabled, true);
      const beforeVerify = fixture.verifyCalls, beforeView = events.filter(event => event.kind === 'viewer').length;
      await app.click(byText('核对原保存')); assert.equal(fixture.verifyCalls, beforeVerify + 1);
      assert.equal(events.filter(event => event.kind === 'viewer').length, beforeView, 'nonexplicit verification remains GET-only without old map editor');
    }
    fixture.pending = null; fixture.explicitOwner = null; fixture.mapDrafts.clear();
    await app.update(() => fixture.api.updateNodeData('node', { lcosTextViewMode: 'text' })); await tick();
    report.cases.push('exact explicit pending + its actual retained map operation reopens same original Viewer; no/different draft result, every foreign identity/API, autosave/history all refuse editor; their verify remains GET-only');
  }
  if (process.argv.includes('--check-live-draft')) {
    fixture.pending = null; fixture.queued = { projectId: 'project', canvasId: 'canvas', nodeId: 'node', count: 1, canResume: true };
    fixture.coreRevisionId = 'rA'; fixture.coreBody = '# Saved old A';
    await app.update(() => fixture.api.updateNodeData('node', { text: '# Later live draft C',
      lcos_ref: { ...reference, revisionId: 'rA' } })); await tick();
    report.liveDraft = { rawOriginalNodeText: fixture.node.data.text, coreReadBody: fixture.coreBody,
      renderedReadingBody: document.querySelector('[data-markdown-leaf]')?.textContent,
      coreReadState: document.querySelector('[data-native-first-state]')?.getAttribute('data-native-first-state'), queued: fixture.queued,
      candidateWrites: 0, realCoreWrites: 0, resumeCalls: fixture.resumeCalls };
    assert.ok(report.liveDraft.renderedReadingBody?.includes('Later live draft C'), 'original queued live C must stay visible after GET confirms older A');
    const draftReadCount = reads.length, resumesBeforeChecks = fixture.resumeCalls;
    await open(); assert.equal(byText('导图')?.disabled, true, 'do not open a new mode intention using older Core A');
    assert.ok(byText('继续保存')); await open();
    assert.ok(document.querySelector('[data-testid="lcos-native-text-view-menu"] .rounded-full.bg-accent-primary'), 'same-owner queued draft has original more badge');
    for (const field of ['projectId', 'canvasId', 'nodeId']) {
      fixture.queued = { projectId: 'project', canvasId: 'canvas', nodeId: 'node', count: 1, canResume: true, [field]: 'foreign' }; await tick();
      assert.ok(document.querySelector('[data-markdown-leaf]')?.textContent.includes('Saved old A'), 'foreign queue does not claim this body: ' + field);
      await open(); assert.equal(byText('导图').disabled, false); assert.equal(byText('继续保存'), undefined); await open();
    }
    fixture.queued = { projectId: 'project', canvasId: 'canvas', nodeId: 'node', count: 1, canResume: false };
    fixture.pending = { operationId: 'pending-A', status: 'unknown', canvasId: 'canvas', nodeId: 'node', artifactId: 'artifact' };
    await app.update(() => fixture.api.updateNodeData('node', { lcosTextViewMode: 'mindmap' })); await tick();
    await open(); assert.equal(byText('正文').disabled, true); assert.equal(byText('编辑导图').disabled, true);
    assert.equal(byText('核对原保存').disabled, false); const viewersBefore = events.filter(event => event.kind === 'viewer').length;
    await app.click(byText('核对原保存'));
    assert.equal(events.filter(event => event.kind === 'viewer').length, viewersBefore, 'verify never opens an editor on old A while queued C exists');
    assert.equal(fixture.resumeCalls, resumesBeforeChecks, 'presence/verify never submits C');
    assert.equal(reads.length, draftReadCount, 'presence/foreign queue/mode notifications do not poll Core');
    fixture.pending = null; fixture.queued = null;
    await app.update(() => fixture.api.updateNodeData('node', { lcosTextViewMode: 'text' })); await tick();
    report.cases.push('GET-confirmed older A never hides same-original-queue live C; original badge and continue remain; mode/map-edit disabled; foreign project/canvas/node cannot claim draft; map verification remains GET-only');
  }
  for (const status of ['unknown', 'conflict', 'context-changed', 'verify-unavailable', 'identity-mismatch']) {
    const notice = app.nativeTextSaveUserNotice({ status, reason: 'HTTP 503 internal_uuid_123' });
    assert.ok(!notice.includes('HTTP') && !notice.includes('uuid') && /草稿/.test(notice));
  }
  fixture.failRead = true; await app.click(byText('重读正文'));
  assert.ok(document.body.textContent.includes('正文版本暂时无法核对'));
  assert.ok(!document.body.textContent.includes('internal_uuid') && byText('重读正文'));
  report.cases.push('save conflict/context/readback/identity failures keep honest Chinese feedback and retry; raw error remains internal only');
  if (process.argv.includes('--check-version-view')) {
    fixture.failRead = false; fixture.pending = null; fixture.queued = null;
    const readBeforeView = reads.length, writesBeforeView = fixture.writes.length;
    const oldEdits = events.filter(event => event.kind === 'original-edit').length;
    const pinned = { ...reference, entityType: 'view', entityId: 'view', revisionId: 'r1' };
    await app.update(() => fixture.api.updateNodeData('node', { text: '# Pinned exact version', lcos_ref: pinned, lcosTextViewMode: 'text' }));
    await app.render();
    assert.equal(reads.length, readBeforeView, 'View face must not call primary canvas-text GET');
    assert.equal(document.querySelector('[data-native-first-state]').getAttribute('data-native-first-state'), 'readonly');
    assert.ok(document.querySelector('[data-markdown-leaf]').textContent.includes('Pinned exact version'));
    assert.equal(document.querySelectorAll('[data-testid="lcos-native-text-view-menu"]').length, 0, 'no unsupported edit/map more menu');
    assert.ok(originalAction('阅读正文')); assert.equal(originalAction('编辑正文'), undefined);
    assert.ok(document.querySelector('[data-original-color]') && byText('复制全文') && originalAction('保存到库') && originalAction('删除'));
    const viewsBefore = events.filter(event => event.kind === 'viewer').length;
    await app.click(originalAction('阅读正文'));
    await app.doubleClick(document.querySelector('[data-markdown-leaf]'));
    assert.equal(events.filter(event => event.kind === 'viewer').length, viewsBefore + 2);
    const target = events.filter(event => event.kind === 'viewer').at(-1).input;
    assert.deepEqual(target, { projectId: 'project', artifactId: 'artifact', artifactViewId: 'view', revisionId: 'r1', nodeId: 'node', sourceCanvasId: 'canvas', title: '人工正文' });
    app.LCOSRequestNativeTextEdit('node', () => events.push({ kind: 'original-edit' }));
    assert.equal(events.filter(event => event.kind === 'viewer').length, viewsBefore + 3, 'original t4 proxy command also reads the same View');
    assert.equal(events.filter(event => event.kind === 'original-edit').length, oldEdits);
    assert.equal(fixture.writes.length, writesBeforeView, 'read actions never write Canvas geometry/body/mode');
    const priorViewerCount = events.filter(event => event.kind === 'viewer').length;
    fixture.node = { ...fixture.node, data: { ...fixture.node.data, lcos_ref: { ...pinned, artifactViewId: 'later-view', entityId: 'later-view' } } };
    await app.click(originalAction('阅读正文'));
    assert.equal(events.filter(event => event.kind === 'viewer').length, priorViewerCount, 'old original action cannot open a replaced View');
    assert.ok(document.body.textContent.includes('位置或版本暂时无法确认'));
    report.cases.push('exact version View uses original Pure reading body and same fullscreen action slot labelled 阅读正文; actual original toolbar callback/body double-click/t4 proxy open exact Viewer without editor/GET/write; late replaced View refused');
    report.versionView = { readOnly: true, primaryTextGetDelta: reads.length - readBeforeView,
      canvasWriteDelta: fixture.writes.length - writesBeforeView, originalEditorDelta: events.filter(event => event.kind === 'original-edit').length - oldEdits };
  }
  report.browser = await runNativeTextActionsBrowserFixture({ entry, temp, root, dep, esbuild, agentFixtureModule });
  assert.equal(report.browser.passed, true, 'isolated Chrome original toolbar/menu/scroll layout fixture');
  report.passed = true;
} catch (error) { report.failure = String(error.stack ?? error); process.exitCode = 1; }
finally {
  try { await app?.close(); } catch {}
  report.dom = document.body.textContent;
  await dom.happyDOM.abort(); dom.close();
  delete globalThis.__TEXT_ACTION_FIXTURE__;
  for (const [key, descriptor] of Object.entries(prior)) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  const reportDir = process.argv.includes('--check-version-view') ? 'output/原生文件Drop整合_20261017i' : 'output/原生文本整合_20261017e';
  await fs.mkdir(path.join(root, reportDir), { recursive: true });
  await fs.writeFile(path.join(root, reportDir, process.argv.includes('--check-version-view') ? 'View版本阅读组件回归.json' : process.argv.includes('--check-explicit-map') ? '原动作链explicit重开回归.json'
    : process.argv.includes('--check-live-draft') ? '原动作链live草稿复现.json' : '原动作链组件测试.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
// React's Node scheduler MessageChannel remains referenced after this isolated
// DOM unmount; all test work and artifacts are awaited above.
process.exit(report.passed ? 0 : 1);
