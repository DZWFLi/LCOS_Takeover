import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformNativeMaterialViewerScript } from '../lab/native-material-viewer-transform.mjs';
import { withNativeReaderRecoverySourceTransforms, nativeReaderRecoverySourceTransforms,
  transformNativeReaderRestoreViewer } from '../lab/native-reader-recovery-source-transform.mjs';
import { createNativeUiSourceTransforms } from '../lab/native-ui-source-transforms.mjs';
import { withNativeChatSourceTransforms } from '../lab/native-chat-owner-transform.mjs';
import { withNativeMaterialReaderSourceTransforms } from '../lab/native-material-reader-source-transform.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/原生文件Drop整合_20261017i/旧Reader独立委托', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const temporary = await fs.mkdtemp(path.join(root, '.runtime/native-reader-recovery-'));
const require = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json'));
const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
const React = require('react'), { Window } = require('happy-dom'), { createStore } = require('zustand/vanilla');
const { createRoot } = require('react-dom/client');
const report = { passed: false, at: new Date().toISOString(), scope: 'Actual setProject/layout persistence, production Reader delegate/ViewerHost in installed React+happy-dom, exact original wa lifecycle/store and runtime wrapper; controlled same-loopback Core GET DTOs/bytes. Manual original markOpen/finishClose stand in for animation callbacks. No candidate, browser, Core/DB, model, server or full-app build.', cases: [] };
const pass = (name, evidence) => report.cases.push({ name, passed: true, evidence });
let dom, reactRoot;
try {
  for (const [file, transform] of Object.entries(nativeReaderRecoverySourceTransforms)) {
    const source = await fs.readFile(path.join(root, file), 'utf8'), adapted = transform(source);
    assert.equal(transform(adapted), adapted); assert.notEqual(source, adapted);
    assert.throws(() => transform(source.replace(file.includes('Stage') ? 'const windows =' : 'windows: sameTabRestored?.windows', 'unknownSeam')), /seam changed/);
  }
  const viewerFile = 'lab/pilot/native-material-viewer.tsx', viewerSource = await fs.readFile(path.join(root, viewerFile), 'utf8');
  assert.equal(transformNativeReaderRestoreViewer(viewerSource), viewerSource);
  const transforms = withNativeReaderRecoverySourceTransforms(withNativeMaterialReaderSourceTransforms(withNativeChatSourceTransforms(createNativeUiSourceTransforms({ nativeRailPilot: true }))));
  assert.ok(!Object.keys(transforms).some(file => file.startsWith('lab/')), 'No builder path boundary is widened');
  const stageFile = 'lcos/huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.tsx';
  const stage = await fs.readFile(path.join(root, stageFile), 'utf8'), changedStage = transforms[stageFile](stage, { sourcePath: path.join(root, stageFile) });
  assert.match(changedStage, /fallback=\{\(\s*<ArtifactReaderBody/);
  assert.ok(changedStage.includes('source={readerWindow} onClose={onClose}'));
  for (const original of ['const returnComposerFromWindow =', 'const returnReader =', 'const close =']) {
    const start = stage.indexOf(original), end = stage.indexOf('\n  };', start) + 5;
    assert.ok(start >= 0 && end > start); assert.ok(changedStage.includes(stage.slice(start, end)), 'Original Stage return owner unchanged: ' + original);
  }
  pass('exact shell/Stage transforms parse/idempotent and compose with actual native/chat/reader transforms; old branch and original close/return owners preserved');

  dom = new Window({ url: 'http://127.0.0.1:32123/' });
  Object.assign(globalThis, { window: dom, document: dom.document, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node,
    Event: dom.Event, CustomEvent: dom.CustomEvent, requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.navigator });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: dom.localStorage });
  const entry = path.join(temporary, 'entry.tsx');
  await fs.writeFile(entry, `export * from ${JSON.stringify(path.join(root, 'lab/pilot/native-reader-recovery.tsx').replaceAll('\\', '/'))};
export * from ${JSON.stringify(path.join(root, 'lab/pilot/native-reader-recovery-state.ts').replaceAll('\\', '/'))};
export {NativeMaterialViewerHost} from ${JSON.stringify(path.join(root, viewerFile).replaceAll('\\', '/'))};
export {requestNativeMaterialView} from ${JSON.stringify(path.join(root, 'lab/pilot/native-material-viewer-port.ts').replaceAll('\\', '/'))};
export {useLcosShellStore} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts').replaceAll('\\', '/'))};
export {useLcosReferenceStore} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts').replaceAll('\\', '/'))};
export {readerReturnWindowId} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/professional/readerReturnWindow.ts').replaceAll('\\', '/'))};
export {writeProfessionalWindowLayout,readProfessionalWindowLayout} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/professional/professionalWindowPersistence.ts').replaceAll('\\', '/'))};
export {createWindowRegion} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/shell/windowRegionTopology.ts').replaceAll('\\', '/'))};
export {buildSurfaceCanvasMap} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/app/useLcosWorksite.ts').replaceAll('\\', '/'))};
export {default as nativeCanvas} from ${JSON.stringify(path.join(root, 'lab/pilot/native-canvas-port.ts').replaceAll('\\', '/'))};`);
  const bundle = path.join(temporary, 'entry.js');
  await buildPilotEntry(path.relative(root, entry), bundle, 'browser', { nativeReact: true, sourceTransforms: transforms,
    sourceOverrides: { 'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts' } });
  let code = await fs.readFile(bundle, 'utf8');
  for (const [native, module] of [['native-react', 'react'], ['native-jsx-runtime', 'react/jsx-runtime'], ['native-react-dom', 'react-dom'], ['native-router', 'react-router-dom']])
    code = code.replaceAll('"/lcos/' + native + '.js"', JSON.stringify(pathToFileURL(require.resolve(module)).href));
  const surfaceStub = 'data:text/javascript;base64,' + Buffer.from('export function requestNativeSurfaceSelection(){throw Error("No navigation is invoked by this controlled test")}').toString('base64');
  code = code.replaceAll('"/surface-dock-ui.js"', JSON.stringify(surfaceStub));
  const m = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const stageAst = ts.createSourceFile(stageFile, stage, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const stageArrow = name => {
    const found = [];
    const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(stageAst) === name) found.push(node.initializer); ts.forEachChild(node, visit); }; visit(stageAst);
    assert.equal(found.length, 1);
    const node = ts.isCallExpression(found[0]) ? found[0].arguments[0] : found[0];
    return ts.transpileModule('const extracted = ' + node.getText(stageAst) + ';', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  };
  const actualReturn = (name, bindings) => new Function(...Object.keys(bindings), stageArrow(name) + '\nreturn extracted;')(...Object.values(bindings));
  const hostFile = path.join(root, 'lab/pilot/native-professional-host.tsx');
  const hostSource = await fs.readFile(hostFile, 'utf8'), hostAst = ts.createSourceFile(hostFile, hostSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hostEffects = [], hostHelpers = [];
  const visitHost = node => {
    if (ts.isCallExpression(node) && node.expression.getText(hostAst) === 'useEffect'
      && node.arguments[0]?.getText(hostAst).includes('session.projects.getProjectGraph')) hostEffects.push(node.arguments[0]);
    if (ts.isFunctionDeclaration(node) && ['isRecord', 'isNonEmptyString', 'parseWorkspaceRows'].includes(node.name?.text)) hostHelpers.push(node.getText(hostAst));
    ts.forEachChild(node, visitHost);
  }; visitHost(hostAst);
  assert.equal(hostEffects.length, 1); assert.equal(hostHelpers.length, 3);
  const hostEffectCode = ts.transpileModule(hostHelpers.join('\n') + '\nconst extracted = ' + hostEffects[0].getText(hostAst) + ';',
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const actualHostMappingEffect = bindings => new Function(...Object.keys(bindings), hostEffectCode + '\nreturn extracted;')(...Object.values(bindings));
  const assetName = 'course-api-base-url-CifxI1ia.js', raw = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', assetName), 'utf8');
  const tree = parseOriginalDonorScript(raw, assetName);
  const waNode = tree.body.flatMap(node => node.type === 'VariableDeclaration' ? node.declarations : []).find(node => node.id?.name === 'wa');
  assert.ok(waNode?.init);
  const makeWa = () => new Function('Jn', 'SZ', 'return ' + raw.slice(waNode.init.start, waNode.init.end))(createStore, () => { throw Error('resources merge not exercised'); });
  const runtimeCode = transformNativeMaterialViewerScript(assetName, raw).split('const LCOSNativeMaterialViewerRuntime=')[1].split('const LCOSNativeViewerParts=')[0];
  const makeRuntime = wa => new Function('wa', 'NZ', 'return ' + runtimeCode.trim().replace(/;$/, ''))(wa, () => undefined);
  pass('targeted bundle uses current source selections/transforms; lifecycle executes exact original wa initializer and shipped runtime wrapper, no replacement viewer/queue');

  let fixture, reads = [], requestTargets = [];
  const fetch = async (url, init = {}) => {
    const address = new URL(url, dom.location.href); assert.equal(address.hostname, '127.0.0.1');
    const method = init.method ?? 'GET'; assert.equal(method, 'GET', 'Recovery is read-only'); reads.push(address.pathname);
    if (fixture.deferred) await fixture.deferred;
    if (fixture.error) return Response.json({ ok: false, error: { code: 'fixture', message: 'controlled read failure' } }, { status: 503 });
    const p = address.pathname;
    if (p.endsWith('/artifacts/a')) return Response.json({ ok: true, value: { artifact: { id: 'a', projectId: fixture.projectId, title: '准确历史正文', currentRevisionId: 'r2' }, currentRevisionId: 'r2', revisions: [] } });
    if (p.endsWith('/artifacts/a/revisions')) return Response.json({ ok: true, value: ['r1', 'r2', 'draft-r3'].map(id => ({ id, artifactId: 'a', status: id === 'r1' ? 'superseded' : id === 'r2' ? 'current' : 'draft', fileRecordId: 'f-' + id, contentHash: 'bytes-' + id })) });
    if (p.endsWith('/graph')) return Response.json({ ok: true, value: { project: { id: fixture.projectId }, artifacts: [], scopes: [], artifactViews: [], relations: [],
      fileRecords: ['r1', 'r2', 'draft-r3'].map(id => ({ id: 'f-' + id, projectId: fixture.projectId, availability: 'current', contentHash: 'bytes-' + id, observedHash: 'bytes-' + id, mimeType: 'text/markdown' })) } });
    if (/\/file-records\/f-([^/]+)\/content$/.test(p)) return new Response('# EXACT ' + p.match(/\/file-records\/f-([^/]+)\/content$/)[1], { headers: { 'content-type': 'text/markdown' } });
    throw Error('Unexpected controlled read: ' + p);
  };
  globalThis.fetch = fetch; dom.fetch = fetch;
  const act = React.act, tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 8)); }); };
  const wait = async (predicate, label) => { for (let count = 0; count < 100; count++) { if (predicate()) return; await tick(); } throw Error('Timed out: ' + label); };
  let sequence = 0;
  const openFixture = async ({ revision = 'r1', blocked = false, draft = false, error = false, deferred, occupied = false,
    bootUnmapped = false, mappedCanvas = 'c', inputMismatch = false } = {}) => {
    const projectId = 'reader-test-' + ++sequence;
    fixture = { projectId, error, deferred, blocked, draft }; reads = []; requestTargets = [];
    const nodes = [{ id: 'n', type: 'text', data: { text: 'existing node bytes', lcos_ref: { version: 1, entityType: 'artifact', entityId: 'a', artifactId: 'a', artifactViewId: 'v', revisionId: 'r2' } } }];
    const api = { getNodes: () => nodes, getEdges: () => [], getSelection: () => ({ nodeIds: [], edgeIds: [] }), getViewport: () => ({ x: 1, y: 2, zoom: 1 }), subscribeNative: () => () => {} };
    dom.__LCOS_NODE_LAB__ = { projectId, currentCanvasId: 'c', api };
    const origin = { id: 'origin', bodyKey: 'collection', target: 'collection', title: '原集合', active: false };
    const source = { id: 'old-reader', bodyKey: 'reader', title: '阅读', target: 'a', readerRevisionId: revision,
      readerSource: { surface: 'main', nodeId: 'n' }, sourceLocator: { kind: 'lines', start: 2, end: 4 }, active: true,
      ...(inputMismatch ? { composerOriginKey: 'an-original-different-input' } : {}) };
    m.writeProfessionalWindowLayout(projectId, [origin, source], [m.createWindowRegion('r-origin', ['origin'], 'origin'), m.createWindowRegion('r-reader', ['old-reader'], 'old-reader')]);
    await act(async () => { m.useLcosShellStore.getState().setProject(projectId); if (!bootUnmapped) m.useLcosShellStore.getState().setSurfaceCanvasMap({ main: mappedCanvas }); });
    const restored = m.useLcosShellStore.getState().windows.find(row => row.id === source.id);
    // The original persisted layout intentionally excludes returnToWindowId; a
    // same-tab source return is captured here as an ordinary local fixture.
    const withReturn = { ...restored, returnToWindowId: origin.id,
      ...(inputMismatch ? { composerOriginKey: 'an-original-different-input' } : {}) };
    await act(async () => m.useLcosShellStore.setState({ windows: m.useLcosShellStore.getState().windows.map(row => row === restored ? withReturn : row), composerPrompt: '原草稿不回写', composerCaret: { start: 2, end: 3 } }));
    const storedBefore = dom.localStorage.getItem('lcos.professional-window-layout.v1.' + projectId);
    const wa = makeWa(), runtime = makeRuntime(wa);
    if (occupied) wa.getState().open({ id: 'existing-editor', media: { type: 'text', markdown: 'unfinished' }, mode: 'edit' });
    let closeCalls = 0;
    const adapter = { shell: m.useLcosShellStore.getState, canvas: m.nativeCanvas.getState,
      hasPending: () => fixture.blocked, hasLocalDraft: () => fixture.draft,
      request: target => { requestTargets.push(target); m.requestNativeMaterialView(target); } };
    const returnToSource = actualReturn('returnReaderToSource', { useLcosShellStore: m.useLcosShellStore, useLcosReferenceStore: m.useLcosReferenceStore,
      readerReturnWindowId: m.readerReturnWindowId, projectId, closeWindow: id => m.useLcosShellStore.getState().closeWindow(id),
      requestLocate: request => m.useLcosShellStore.getState().requestLocate(request) });
    const returnReader = actualReturn('returnReader', { returnReaderToSource: returnToSource, returnComposerFromWindow: () => { throw Error('no input detour in this return fixture'); },
      closeWindow: id => m.useLcosShellStore.getState().closeWindow(id) });
    const stageClose = actualReturn('close', { returnReader, returnComposerFromWindow: () => { throw Error('no input detour in this return fixture'); },
      closeWindow: id => m.useLcosShellStore.getState().closeWindow(id) });
    const rootElement = dom.document.createElement('div'); dom.document.body.appendChild(rootElement); reactRoot = createRoot(rootElement);
    const plain = ({ children }) => React.createElement('div', {}, children), text = ({ markdown }) => React.createElement('div', {}, markdown);
    const parts = { ActionBar: plain, ActionButton: plain, TextBody: text, Facts: plain, Popover: plain };
    let releaseMapping;
    const mappingGate = new Promise(resolve => { releaseMapping = resolve; });
    const hostMappingEffect = actualHostMappingEffect({ projectId, canvas: m.nativeCanvas.getState(),
      setMappedWorkspace: () => {}, setSurfaceRows: () => {}, setSurfaceState: () => {}, setSurfaceMessage: () => {},
      session: { projects: {
        getProjectGraph: async () => { await mappingGate; return { project: { id: projectId }, scopes: [{ id: 'root', projectId, kind: 'root' }] }; },
        getWorkspaces: async () => { await mappingGate; return [{ id: 'w', projectId, canvasId: 'c', scopeId: 'root', name: 'Main', preferredSurface: 'main' }]; },
      } }, buildSurfaceCanvasMap: m.buildSurfaceCanvasMap, useLcosShellStore: m.useLcosShellStore });
    function ActualHostMappingEffect() { React.useEffect(hostMappingEffect, []); return null; }
    function Harness() {
      const windows = m.useLcosShellStore(state => state.windows), regions = m.useLcosShellStore(state => state.windowRegions);
      const layout = m.useNativeReaderRecoveryLayout(projectId, windows, regions), row = windows.find(item => item.id === 'old-reader');
      return React.createElement(React.Fragment, {}, bootUnmapped && React.createElement(ActualHostMappingEffect), React.createElement(m.NativeMaterialViewerHost, { runtime, parts }),
        layout.windows.some(item => item.id === 'old-reader') && React.createElement('section', { 'data-old-reader-presentation': '' }, React.createElement(m.NativeRestoredReaderBody, { projectId, source: row,
          onClose: () => { closeCalls++; stageClose(row); }, fallback: React.createElement('div', { 'data-old-reader-body': '' }, 'legacy body retained') })));
    }
    await act(async () => reactRoot.render(React.createElement(m.NativeReaderRecoveryProvider, { runtime, adapter }, React.createElement(Harness))));
    return { projectId, wa, runtime, restored: withReturn, rootElement, api, storedBefore, closeCalls: () => closeCalls,
      releaseMapping,
      close: async () => { await act(async () => reactRoot.unmount()); reactRoot = null; rootElement.remove(); } };
  };

  let value = await openFixture({ bootUnmapped: true });
  await tick();
  assert.deepEqual(value.runtime.getState().session, null); assert.equal(value.runtime.getState().phase, 'open');
  assert.equal(requestTargets.length, 0); assert.equal(reads.length, 0);
  assert.equal(value.rootElement.querySelectorAll('[data-old-reader-body]').length, 0);
  assert.ok(value.rootElement.querySelector('[data-native-reader-recovery="loading"]'));
  assert.deepEqual(m.useLcosShellStore.getState().surfaceCanvasId, {});
  await act(async () => value.releaseMapping());
  await wait(() => value.runtime.getState().session?.mode === 'view', 'actual asynchronous Host mapping wakes restored Reader');
  assert.equal(requestTargets.length, 1); assert.equal(requestTargets[0].revisionId, 'r1');
  assert.ok(value.rootElement.querySelector('[data-old-reader-presentation]'));
  assert.equal(value.runtime.getState().session.lcosControlled.readerRecovery.accepted, false);
  await act(async () => value.wa.getState().markOpen());
  await wait(() => !value.rootElement.querySelector('[data-old-reader-presentation]'), 'only actual phase open acknowledges after async mapping');
  assert.equal(m.useLcosShellStore.getState().windows.length, 2);
  pass('actual Host mapping effect executes its real ready→Core GET await→setSurfaceCanvasMap order: boot waits without legacy fallback; real mapping wakes one exact request; only wa open retires presentation, durable source remains', { requests: requestTargets.length, revisionId: requestTargets[0].revisionId, fullStageMounted: false });
  await value.close();

  value = await openFixture();
  await wait(() => value.wa.getState().session?.mode === 'view', 'exact bytes read');
  assert.ok(value.rootElement.querySelector('[data-old-reader-presentation]')); assert.equal(value.rootElement.querySelectorAll('[data-old-reader-body]').length, 0);
  assert.equal(requestTargets.length, 1); assert.equal(requestTargets[0].revisionId, 'r1'); assert.deepEqual(requestTargets[0].sourceLocator, { kind: 'lines', start: 2, end: 4 });
  assert.ok(reads.some(path => path.endsWith('/f-r1/content'))); assert.ok(!reads.some(path => path.endsWith('/f-r2/content')));
  assert.equal(m.useLcosShellStore.getState().windows.length, 2); assert.equal(dom.localStorage.getItem('lcos.professional-window-layout.v1.' + value.projectId), value.storedBefore);
  await act(async () => value.wa.getState().markOpen());
  await wait(() => !value.rootElement.querySelector('[data-old-reader-presentation]'), 'real phase open retires presentation');
  assert.equal(m.useLcosShellStore.getState().windows.length, 2); assert.equal(dom.localStorage.getItem('lcos.professional-window-layout.v1.' + value.projectId), value.storedBefore);
  assert.equal(m.useLcosShellStore.getState().composerPrompt, '原草稿不回写'); assert.deepEqual(m.useLcosShellStore.getState().composerCaret, { start: 2, end: 3 });
  pass('actual restored historical reader: only exact r1 bytes, initial loading is not acknowledgement, actual wa open removes old presentation/body while durable source/layout and input/caret remain unchanged', { reads, materialPosts: 0 });
  await act(async () => value.runtime.close(value.wa.getState().session.id));
  assert.equal(value.closeCalls(), 0); assert.equal(m.useLcosShellStore.getState().windows.length, 2);
  await act(async () => value.wa.getState().finishClose());
  assert.equal(value.closeCalls(), 1); assert.equal(m.useLcosShellStore.getState().windows.length, 1); assert.equal(m.useLcosShellStore.getState().windows[0].active, true);
  assert.equal(m.readProfessionalWindowLayout(value.projectId).windows.some(row => row.bodyKey === 'reader'), false);
  pass('only actual finishClose consumes accurate original reader record and invokes its supplied original Stage return seam once; phase closing alone does not delete'); await value.close();

  value = await openFixture({ revision: 'draft-r3' }); await wait(() => value.wa.getState().session?.mode === 'view', 'draft exact read');
  assert.ok(reads.some(path => path.endsWith('/f-draft-r3/content'))); await act(async () => value.wa.getState().markOpen());
  assert.equal(m.useLcosShellStore.getState().windows.length, 2); pass('explicit draft revision stays its real exact bytes, never falls back to Current'); await value.close();

  value = await openFixture({ error: true }); await wait(() => value.rootElement.querySelector('[data-native-reader-recovery="error"]'), 'read failure feedback');
  await act(async () => value.wa.getState().markOpen());
  assert.ok(value.rootElement.querySelector('[data-old-reader-presentation]')); assert.equal(value.closeCalls(), 0);
  await act(async () => value.wa.getState().finishClose()); assert.equal(m.useLcosShellStore.getState().windows.length, 2);
  fixture.error = false;
  await act(async () => value.rootElement.querySelector('button').click());
  await wait(() => value.wa.getState().session?.mode === 'view', 'same version explicit retry'); await act(async () => value.wa.getState().markOpen());
  assert.equal(value.rootElement.querySelector('[data-old-reader-presentation]'), null); pass('failed read and even an error viewer reaching open never retire the source; explicit same-version retry can accept later'); await value.close();

  let release; value = await openFixture({ deferred: new Promise(resolve => { release = resolve; }) });
  await wait(() => reads.length > 0, 'slow real typed GET');
  await act(async () => { dom.__LCOS_NODE_LAB__ = { projectId: value.projectId, currentCanvasId: 'c', api: { ...value.api } }; release(); });
  await tick(); await tick(); assert.equal(value.closeCalls(), 0); assert.equal(m.useLcosShellStore.getState().windows.length, 2);
  assert.ok(!value.wa.getState().session?.lcosControlled?.readerRecovery?.accepted); pass('same Canvas but changed native API during GET refuses late proof/retirement; durable source retained'); await value.close();

  for (const options of [{ blocked: true }, { draft: true }, { occupied: true }, { mappedCanvas: 'a-confirmed-other-canvas' }, { inputMismatch: true }]) {
    value = await openFixture(options); await tick(); assert.equal(requestTargets.length, 0); assert.equal(reads.length, 0);
    assert.equal(value.rootElement.querySelectorAll('[data-old-reader-body]').length, options.occupied ? 0 : 1); assert.equal(m.useLcosShellStore.getState().windows.length, 2);
    pass(options.blocked ? 'existing local unknown/pending uses original reader body; no normal-read takeover or new request'
      : options.draft ? 'existing unsent exact-occurrence map draft retains original recovery body and address, no Current read'
        : options.mappedCanvas ? 'a confirmed mapped foreign scene keeps the original Reader body; missing boot mapping is not confused with this protection'
          : options.inputMismatch ? 'a confirmed different Composer input keeps the original Reader body and never consumes its source'
            : 'an existing original edit/view session is never displaced; recovered Reader waits without mounting the old body', { requests: 0 }); await value.close();
  }
  value = await openFixture({ blocked: true });
  fixture.blocked = false;
  await act(async () => m.useLcosShellStore.setState({ windows: [...m.useLcosShellStore.getState().windows] }));
  assert.equal(requestTargets.length, 0); assert.equal(value.rootElement.querySelectorAll('[data-old-reader-body]').length, 1);
  pass('clearing a pending flag alone does not silently unmount a protected legacy body or auto-consume its local state');
  fixture.blocked = true;
  await act(async () => m.requestNativeMaterialView({ projectId: value.projectId, artifactId: 'a', revisionId: 'r1' }));
  await wait(() => value.wa.getState().session?.mode === 'view', 'ordinary explicit request');
  assert.equal(value.wa.getState().session.lcosControlled.readerRecovery, undefined);
  await act(async () => { value.wa.getState().markOpen(); value.wa.getState().finishClose(); });
  assert.equal(value.closeCalls(), 0); assert.equal(m.useLcosShellStore.getState().windows.length, 2);
  pass('ordinary actual requestNativeMaterialView path has no recovery proof or source consumption; existing local pending and legacy source remain'); await value.close();
  report.passed = true;
} catch (error) {
  report.error = { message: error.message, stack: error.stack }; process.exitCode = 1;
} finally {
  if (reactRoot) await React.act(async () => reactRoot.unmount());
  await dom?.happyDOM?.close();
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, error: report.error?.message, report: path.join(output, 'report.json') }));
}
