import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformNativeMaterialViewerScript } from '../lab/native-material-viewer-transform.mjs';
import { withNativeReferenceLocationTransforms } from '../lab/native-reference-location-source-transform.mjs';
import { withNativeTextLocationPersistenceSourceTransforms } from '../lab/native-text-location-persistence-source-transform.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/文本准确定位_R02_20261026/Viewer接线专项', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const temporary = await fs.mkdtemp(path.join(root, '.runtime/native-text-viewer-location-'));
const require = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json'));
const React = require('react'), { Window } = require('happy-dom'), { createStore } = require('zustand/vanilla');
const { createRoot } = require('react-dom/client');
const report = { passed: false, mode: 'complete current NativeMaterialViewerHost + real MaterialOptions JSX/callbacks, installed React/happyDOM, original wa/runtime and actual reference/Shell stores; controlled exact GET DTOs/bytes and action leaves',
  cases: [], reads: [], realPageClaimed: false, models: 0, sends: 0, coreWrites: 0, actualRuntimeTouched: false };
let dom, reactRoot, activeFixture;
const originalFetch = globalThis.fetch;
const pass = (name, details) => report.cases.push({ name, passed: true, details });
try {
  dom = new Window({ url: 'http://127.0.0.1:32126/' });
  for (const key of ['window','document','HTMLElement','HTMLTextAreaElement','Element','Node','Event','CustomEvent','MutationObserver','ResizeObserver','DOMParser'])
    globalThis[key] = key === 'window' ? dom : key === 'document' ? dom.document : dom[key];
  Object.assign(globalThis, { requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.navigator });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: dom.localStorage });
  const entry = path.join(temporary, 'entry.tsx');
  const spec = file => JSON.stringify(path.join(root, file).replaceAll('\\', '/'));
  await fs.writeFile(entry, [
    `export {NativeMaterialViewerHost} from ${spec('lab/pilot/native-material-viewer.tsx')};`,
    `export {LCOSNativeLibraryContexts as LibraryOwner} from ${spec('lab/pilot/native-library-contexts.tsx')};`,
    `export {nativeReaderRecoveryRequest} from ${spec('lab/pilot/native-reader-recovery-state.ts')};`,
    `export {requestNativeMaterialView} from ${spec('lab/pilot/native-material-viewer-port.ts')};`,
    `export {useLcosShellStore as S} from ${spec('lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts')};`,
    `export {useLcosReferenceStore as R} from ${spec('lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts')};`,
    `export {composerInputKey} from ${spec('lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts')};`,
    `export {referencePickOwnerKey} from ${spec('lcos/huabu/apps/web/src/lcos/referencePickOwnership.ts')};`,
    `export {materialCitationBlock} from ${spec('lcos/huabu/apps/web/src/lcos/ui/professional/donor/Gen1TextTransfer.ts')};`,
    `export {default as C} from ${spec('lab/pilot/native-canvas-port.ts')};`,
  ].join('\n'));
  const bundle = path.join(temporary, 'entry.js');
  await buildPilotEntry(path.relative(root, entry), bundle, 'browser', { nativeReact: true,
    sourceTransforms: withNativeTextLocationPersistenceSourceTransforms(withNativeReferenceLocationTransforms({})),
    sourceOverrides: { 'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts' } });
  let code = await fs.readFile(bundle, 'utf8');
  for (const [native, module] of [['native-react','react'],['native-jsx-runtime','react/jsx-runtime'],['native-react-dom','react-dom'],['native-router','react-router-dom']])
    code = code.replaceAll('"/lcos/' + native + '.js"', JSON.stringify(pathToFileURL(require.resolve(module)).href));
  const noSurface = 'data:text/javascript;base64,' + Buffer.from('export function requestNativeSurfaceSelection(){throw Error("No surface navigation in this Viewer wiring fixture")}').toString('base64');
  code = code.replaceAll('"/surface-dock-ui.js"', JSON.stringify(noSurface));
  const m = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const asset = 'course-api-base-url-CifxI1ia.js', raw = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', asset), 'utf8');
  const ast = parseOriginalDonorScript(raw, asset), wa = ast.body.flatMap(node => node.type === 'VariableDeclaration' ? node.declarations : []).find(node => node.id?.name === 'wa');
  assert.ok(wa?.init);
  const makeWa = () => new Function('Jn','SZ','return ' + raw.slice(wa.init.start, wa.init.end))(createStore, () => { throw Error('resource merge is outside this fixture'); });
  const wrapper = transformNativeMaterialViewerScript(asset, raw).split('const LCOSNativeMaterialViewerRuntime=')[1].split('const LCOSNativeViewerParts=')[0].trim().replace(/;$/, '');
  const makeRuntime = state => new Function('wa','NZ','return ' + wrapper)(state, () => undefined);
  const librarySource = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-D4wysAbz.js'), 'utf8');
  const libraryAst = parseOriginalDonorScript(librarySource, 'UnlimitedModeToggle-D4wysAbz.js');
  const libraryInit = libraryAst.body.flatMap(node => node.type === 'VariableDeclaration' ? node.declarations : []).find(node => node.id?.name === 'mO')?.init;
  assert.ok(libraryInit);
  const makeLibrary = () => new Function('tn','$e','is','let $n=0;return (' + librarySource.slice(libraryInit.start, libraryInit.end) + ')')(
    createStore, { SPACE_TYPE_PRIVATE: 'private' }, () => {});
  const act = React.act;
  const tick = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  const wait = async (predicate, label) => { for (let i = 0; i < 160; i++) { if (predicate()) return; await tick(); } throw Error('Timed out: ' + label); };
  const click = async element => { assert.ok(element, 'actual action DOM exists'); await act(async () => element.dispatchEvent(new dom.MouseEvent('click', { bubbles: true }))); };
  const Button = ({ label, onClick, children, disabled }) => React.createElement('button', { type: 'button', 'aria-label': label, disabled, onClick }, children);
  const Popover = ({ open, onOpenChange, content, children }) => React.createElement('div', {},
    React.createElement('span', { onClick: () => onOpenChange(!open) }, children), open && React.createElement('div', { role: 'dialog' }, content));
  const plain = ({ children }) => React.createElement('div', {}, children);
  const parts = { ActionButton: Button, ActionBar: plain, Popover, Facts: plain, TextBody: ({ markdown }) => React.createElement('p', {}, markdown) };
  let sequence = 0;
  const text = '开头\n重复句子🙂\n中间\n重复句子🙂\n结尾', quote = '重复句子🙂';
  const a = { kind: 'selection', label: 'A', textRange: { start: text.indexOf(quote), end: text.indexOf(quote) + quote.length, quote } };
  const b = { kind: 'selection', label: 'B', textRange: { start: text.lastIndexOf(quote), end: text.lastIndexOf(quote) + quote.length, quote } };
  const group = { kind: 'selection', locations: [a, b] };
  const sourceLocator = { kind: 'selection', label: '原来源', textRange: { start: 0, end: 2, quote: '源文' } };
  globalThis.fetch = dom.fetch = async (url, init = {}) => {
    const address = new URL(url, dom.location.href), method = init.method ?? 'GET';
    assert.equal(address.origin, dom.location.origin); assert.equal(method, 'GET', 'Viewer fixture blocks every business write/model send');
    report.reads.push(address.pathname); const fixture = activeFixture; assert.ok(fixture);
    if (fixture.gate) await fixture.gate;
    if (fixture.readError) return Response.json({ ok: false, error: { code: 'controlled-read', message: 'Controlled read unavailable' } }, { status: 503 });
    const pathname = address.pathname;
    if (pathname.endsWith('/warehouse')) return Response.json({ ok: true, value: { schemaVersion: 1, projectId: fixture.projectId, items: [], totalApprox: 0 } });
    if (/\/artifacts\/(a|parent)$/.test(pathname)) {
      const id = pathname.split('/').at(-1); return Response.json({ ok: true, value: { artifact: { id, projectId: fixture.projectId, title: id === 'a' ? '两处相同正文' : '来源正文', currentRevisionId: id === 'a' ? 'r2' : 'parent-r2' }, currentRevisionId: id === 'a' ? 'r2' : 'parent-r2', revisions: [] } });
    }
    if (/\/artifacts\/(a|parent)\/revisions$/.test(pathname)) {
      const id = pathname.split('/').at(-2), ids = id === 'a' ? ['r1','r2','r3'] : ['parent-r1','parent-r2'];
      return Response.json({ ok: true, value: ids.map(revision => ({ id: revision, artifactId: id, fileRecordId: 'f-' + revision, contentHash: 'bytes-' + revision,
        status: revision.endsWith('r1') ? 'superseded' : 'current', createdAt: '2026-10-20T00:00:00Z' })) });
    }
    if (pathname.endsWith('/graph')) return Response.json({ ok: true, value: {
      project: { id: fixture.projectId }, scopes: [{ id: 'scope', projectId: fixture.projectId }],
      artifacts: [{ id: 'a', projectId: fixture.projectId, title: '两处相同正文', currentRevisionId: 'r2' }, { id: 'parent', projectId: fixture.projectId, title: '来源正文', currentRevisionId: 'parent-r2' }],
      artifactRevisions: ['r1','r2','r3','parent-r1','parent-r2'].map(id => ({ id, artifactId: id.startsWith('parent') ? 'parent' : 'a', fileRecordId: 'f-' + id, contentHash: 'bytes-' + id })),
      artifactViews: ['r1','r2','r3'].map((id, index) => ({ id: 'v' + (index + 1), artifactId: 'a', revisionId: id, scopeId: 'scope', referenceKind: 'primary' })),
      fileRecords: ['r1','r2','r3','parent-r1','parent-r2'].map(id => ({ id: 'f-' + id, projectId: fixture.projectId, availability: 'current', contentHash: 'bytes-' + id, observedHash: 'bytes-' + id, mimeType: 'text/markdown' })),
      relations: [{ id: 'exact-parent', projectId: fixture.projectId, kind: 'reference', sourceEntityType: 'artifact', sourceEntityId: 'a', targetEntityType: 'artifact', targetEntityId: 'parent',
        evidenceRefs: [{ kind: 'artifact', id: 'parent', revisionId: 'parent-r1', sourceAnchor: 'text-selection:' + JSON.stringify(sourceLocator) }] }],
    } });
    if (/\/file-records\/f-[^/]+\/content$/.test(pathname)) return new Response(pathname.includes('parent') ? '源文确版' : text, { headers: { 'content-type': 'text/markdown' } });
    if (/\/artifacts\/a\/source-path$/.test(pathname)) return Response.json({ ok: true, value: { path: '', exists: false, isUrl: false } });
    throw Error('Unexpected controlled Viewer read: ' + pathname);
  };
  const createFixture = async ({ revision = 'r1', view = 'v1', locator = group, intent = 'continue', edit = false, withLibrary = false, withRecovery = false } = {}) => {
    assert.equal(reactRoot, undefined, 'previous real React Host is released');
    const projectId = 'viewer-location-' + ++sequence;
    activeFixture = { projectId, gate: null, readError: false };
    const n2 = { id: 'n2', type: 'text', data: { text, lcos_ref: { version: 1, entityType: 'artifact', entityId: 'a', artifactId: 'a', revisionId: 'r2', artifactViewId: 'v2' } } };
    const canvasApi = { getNodes: () => [n2], getEdges: () => [], getSelection: () => ({ nodeIds: [], edgeIds: [] }), getViewport: () => ({ x: 40, y: 80, zoom: 1 }), subscribeNative: () => () => {} };
    dom.__LCOS_NODE_LAB__ = { projectId, currentCanvasId: 'canvas', api: canvasApi };
    const target = { nodeId: 'agent', intent, workspaceId: 'workspace', messageId: 'message-1', continuationOperationId: 'operation-1' };
    await act(async () => {
      m.S.getState().setProject(projectId); m.R.getState().reset(); m.R.getState().setProject(projectId);
      m.S.setState({ composerTarget: target, composerOpen: true, composerPrompt: '前文尾文', composerCaret: null, activeWorkspaceId: 'workspace', activeSurface: 'main', surfaceCanvasId: { main: 'canvas' } });
      m.S.getState().rememberComposerCaret({ projectId, targetKey: m.composerInputKey(target), text: '前文尾文', start: 2, end: 2 });
    });
    const originalWa = makeWa(), runtime = makeRuntime(originalWa), container = dom.document.createElement('section'); dom.document.body.append(container);
    const library = withLibrary ? makeLibrary() : null;
    if (library) library.setState({ isOpen: true, searchKeyword: '原库搜索' });
    const editorHost = dom.document.createElement('div'), editor = dom.document.createElement('textarea');
    if (withLibrary) {
      editorHost.setAttribute('data-lcos-composer-target', 'agent'); editor.setAttribute('data-lcos-composer-input', '');
      editor.value = m.S.getState().composerPrompt; editor.getClientRects = () => [{ width: 100, height: 100 }];
      editor.setSelectionRange(2, 2); editorHost.append(editor); dom.document.body.append(editorHost);
    }
    function ExistingViewerActionSlot() {
      const state = React.useSyncExternalStore(runtime.subscribe, runtime.getState, runtime.getState);
      return state.session?.lcosControlled?.textActionsSlot ?? null;
    }
    reactRoot = createRoot(container);
    await act(async () => reactRoot.render(React.createElement(React.Fragment, {},
      library && React.createElement(m.LibraryOwner, { NativeLibrary: () => null, NativeLibraryStore: library, canvasId: 'canvas', originalProps: { roots: [], expandedFolderIds: [], searchKeyword: '' } }),
      React.createElement(m.NativeMaterialViewerHost, { runtime, parts }), React.createElement(ExistingViewerActionSlot))));
    if (library) await act(async () => dom.dispatchEvent(new dom.CustomEvent('lcos-native-open-library', { detail: { projectId, composerOriginKey: m.composerInputKey(target) } })));
    let request = { projectId, artifactId: 'a', revisionId: revision, artifactViewId: view, sourceLocator: locator,
      composerOriginKey: m.composerInputKey(target), ...(edit ? { editMode: 'mindmap', nodeId: 'n2', sourceCanvasId: 'canvas' } : {}) };
    let recoveryClosed = 0;
    const recovery = withRecovery ? { projectId, source: { id: 'legacy-reader', bodyKey: 'reader' }, canvasId: 'canvas', api: canvasApi,
      isCurrent: () => true, onClosed: () => { recoveryClosed++; }, onStatus: () => {}, cancelled: false, accepted: false, closed: false } : undefined;
    if (recovery) request = m.nativeReaderRecoveryRequest(request, recovery);
    const loaded = () => runtime.getState().session?.mode === (edit ? 'edit' : 'view') && runtime.getState().session?.lcosControlled?.bodySlot;
    await act(async () => m.requestNativeMaterialView(request)); await wait(loaded, 'original Host loaded exact requested bytes');
    await act(async () => originalWa.getState().markOpen());
    const state = () => runtime.getState().session;
    const body = () => state()?.lcosControlled?.bodySlot;
    const buttons = () => container.querySelectorAll('button');
    const button = label => [...buttons()].find(element => element.getAttribute('aria-label') === label || element.textContent === label);
    const more = async () => { await click(button('阅读选项')); await wait(() => container.querySelector('[data-lcos-native-material-options]'), 'actual MaterialOptions JSX displayed'); };
    const waitNew = async key => wait(() => state()?.mode === 'view' && state()?.lcosControlled?.requestKey !== key, 'new exact operation presented');
    const payload = (locator = a) => ({ schemaVersion: 1, kind: 'material-transfer', capturedAt: '2026-10-26T00:00:00Z', source: {
      projectId, artifactId: 'a', revisionId: revision, viewId: view, fileRecordId: 'f-' + revision, title: '两处相同正文', locator }, content: { kind: 'text', text: locator.textRange.quote } });
    const close = async () => { await act(async () => reactRoot.unmount()); reactRoot = undefined; container.remove(); editorHost.remove(); };
    return { projectId, originalWa, runtime, request, canvasApi, state, body, button, more, waitNew, payload, close, container, library, editor, recovery, recoveryClosed: () => recoveryClosed };
  };

  let value = await createFixture();
  const inputBefore = m.S.getState().composerPrompt, cite = value.body().props.onCiteSelection;
  const unrelated = dom.document.createElement('p'); unrelated.textContent = '这不是当前正文'; dom.document.body.append(unrelated);
  const range = dom.document.createRange(); range.selectNodeContents(unrelated); dom.getSelection().removeAllRanges(); dom.getSelection().addRange(range);
  let result; await act(async () => { result = await cite(value.payload(a)); });
  assert.match(result, /尚未发送/); assert.equal(value.runtime.getState().phase, 'closing');
  const source = { projectId: value.projectId, artifactId: 'a', revisionId: 'r1', fileRecordId: 'f-r1', viewId: 'v1', title: '两处相同正文', locator: a };
  const expectedInsertion = '\n\n' + m.materialCitationBlock(source, quote) + '\n\n';
  assert.equal(m.S.getState().composerPrompt, inputBefore.slice(0, 2) + expectedInsertion + inputBefore.slice(2));
  assert.equal(m.S.getState().composerCaret.start, 2 + expectedInsertion.length); assert.equal(m.S.getState().composerCaret.end, 2 + expectedInsertion.length);
  const firstRef = m.R.getState().draft.orderedEntityRefs[0]; assert.equal(firstRef.revisionId, 'r1'); assert.equal(firstRef.artifactViewId, 'v1'); assert.deepEqual(firstRef.sourceLocations, [a]);
  assert.doesNotMatch(m.S.getState().composerPrompt, /这不是当前正文/); unrelated.remove();
  pass('full Host exact selection callback ignores unrelated global Selection; exact source metadata admitted once, citation inserted at actual original caret, no send, original viewer close requested'); await value.close();

  value = await createFixture();
  const valid = value.payload(), protectedBefore = () => JSON.stringify({ prompt: m.S.getState().composerPrompt, caret: m.S.getState().composerCaret, refs: m.R.getState().draft });
  for (const mutation of ['projectId','artifactId','revisionId','viewId','fileRecordId','quote','kind','range']) {
    const bad = structuredClone(valid);
    if (['projectId','artifactId','revisionId','viewId','fileRecordId'].includes(mutation)) bad.source[mutation] = 'other';
    else if (mutation === 'quote') bad.content.text = '不同正文';
    else if (mutation === 'kind') bad.content.kind = 'image';
    else bad.source.locator.textRange.end++;
    const before = protectedBefore();
    await assert.rejects(value.body().props.onCiteSelection(bad), /选区或版本已变化/);
    assert.equal(protectedBefore(), before); assert.equal(value.runtime.getState().phase, 'open');
  }
  pass('actual callback rejects wrong project/artifact/revision/View/FileRecord, content-kind/quote/range mismatch before draft/caret/close'); await value.close();

  for (const change of ['message','operation','canvas-api','project','unmounted']) {
    value = await createFixture(); const stale = value.body().props.onCiteSelection, payload = value.payload(), oldState = value.state();
    await act(async () => {
      if (change === 'message') m.S.setState({ composerTarget: { ...m.S.getState().composerTarget, messageId: 'message-2' } });
      if (change === 'operation') m.S.setState({ composerTarget: { ...m.S.getState().composerTarget, continuationOperationId: 'operation-2' } });
      if (change === 'project') m.S.setState({ projectId: 'new-project' });
      if (change === 'canvas-api') { dom.__LCOS_NODE_LAB__ = { ...dom.__LCOS_NODE_LAB__, api: { ...value.canvasApi } }; dom.dispatchEvent(new dom.Event('lcos-native-bridge-changed')); }
    });
    if (change === 'unmounted') await value.close();
    const before = protectedBefore(); await assert.rejects(stale(payload), /输入已变化|目标已变化|选区或版本已变化/); assert.equal(protectedBefore(), before);
    if (change === 'message' || change === 'operation') assert.equal(value.state(), oldState, 'input mismatch does not close the current reading');
    if (change !== 'unmounted') await value.close();
  }
  pass('same inputKey with new message/op, new Canvas API/project or unmount rejects captured old callbacks; no new input admission or stale close');

  value = await createFixture();
  await value.more();
  let locations = [...value.container.querySelectorAll('[data-native-material-location-index]')]; assert.equal(locations.length, 2);
  assert.deepEqual(locations.map(button => button.getAttribute('aria-pressed')), ['false','false']);
  const oldAction = value.state().lcosControlled.textActionsSlot, firstKey = value.state().lcosControlled.requestKey;
  let release; activeFixture.gate = new Promise(resolve => { release = resolve; });
  await click(locations[1]);
  await act(async () => { release(); activeFixture.gate = null; }); await value.waitNew(firstKey);
  assert.deepEqual(value.body().props.source.locator, { ...group, selected: b }); assert.equal(value.body().props.source.revisionId, 'r1');
  assert.notEqual(value.state().lcosControlled.textActionsSlot.key, oldAction.key, 'same version new operation remounts only its action owner');
  await value.more(); locations = [...value.container.querySelectorAll('[data-native-material-location-index]')];
  assert.deepEqual(locations.map(button => button.getAttribute('aria-pressed')), ['false','true']);
  assert.ok(locations.every(button => button.disabled === false), 'old busy state did not leak into same-version new locator owner');
  const bKey = value.state().lcosControlled.requestKey; await click(locations[0]); await value.waitNew(bKey);
  assert.deepEqual(value.body().props.source.locator.selected, a); assert.equal(value.body().props.source.revisionId, 'r1');
  pass('real MaterialOptions JSX displays A/B with no default; B then A call exact same-version Host reopen; selected tracks accurately and new action key clears old busy state');

  await value.more(); const beforeVersion = value.state().lcosControlled.requestKey, select = value.container.querySelector('select[aria-label="阅读版本"]');
  await act(async () => { select.value = 'r2'; select.dispatchEvent(new dom.Event('change', { bubbles: true })); });
  await value.waitNew(beforeVersion); assert.equal(value.body().props.source.revisionId, 'r2'); assert.equal(value.body().props.source.locator, undefined);
  pass('actual explicit revision select clears previous locator and does not apply old offsets to new version'); await value.close();

  const sourceReturnLocator = { ...group, selected: b };
  value = await createFixture({ locator: sourceReturnLocator }); await value.more();
  const sourceButton = [...value.container.querySelectorAll('button')].find(button => button.textContent.startsWith('来源 · 来源正文'));
  const beforeSource = value.state().lcosControlled.requestKey; await click(sourceButton); await value.waitNew(beforeSource);
  assert.equal(value.body().props.source.artifactId, 'parent'); assert.equal(value.body().props.source.revisionId, 'parent-r1'); assert.deepEqual(value.body().props.source.locator, sourceLocator);
  const sourceKey = value.state().lcosControlled.requestKey; await click(value.button('返回上一份材料')); await value.waitNew(sourceKey);
  assert.equal(value.body().props.source.artifactId, 'a'); assert.equal(value.body().props.source.revisionId, 'r1'); assert.deepEqual(value.body().props.source.locator, sourceReturnLocator);
  pass('actual source action rechecks canonical evidence and opens exact historical parent/offset; original Back trail returns exact prior revision and full A/B group with chosen B'); await value.close();

  value = await createFixture({ revision: 'r2', view: 'v2', edit: true });
  const savedCallback = value.body().props.children.props.onSaved, editKey = value.state().lcosControlled.requestKey;
  await act(async () => savedCallback({ revisionId: 'r3', viewId: 'v3' })); await value.waitNew(editKey);
  assert.equal(value.body().props.source.revisionId, 'r3'); assert.equal(value.body().props.source.viewId, 'v3'); assert.equal(value.body().props.source.locator, undefined);
  pass('actual saved-edit callback enters confirmed new revision/View and clears old text locator; controlled callback only, no editor save/producer claim'); await value.close();

  value = await createFixture({ locator: a, intent: 'delegate' });
  await click(value.button('加入当前输入'));
  await wait(() => value.runtime.getState().phase === 'closing', 'original whole material action close');
  assert.equal(m.S.getState().composerPrompt, '前文尾文'); assert.deepEqual(m.R.getState().draft.orderedEntityRefs[0].sourceLocations, [a]);
  assert.equal(m.R.getState().draft.orderedEntityRefs[0].revisionId, 'r1');
  pass('ordinary task whole-material cite remains available with no selection payload; same original reference and locator metadata admitted, existing text/caret untouched'); await value.close();
  value = await createFixture();
  m.S.getState().rememberReaderRevision(JSON.stringify([value.projectId, 'a']), 'r2');
  const beforeUnversioned = value.state().lcosControlled.requestKey;
  const beforeReads = report.reads.length, beforeUnversionedInput = protectedBefore();
  await act(async () => m.requestNativeMaterialView({ projectId: value.projectId, artifactId: 'a', sourceLocator: { ...group, selected: a } }));
  await wait(() => value.state()?.lcosControlled?.requestKey !== beforeUnversioned, 'unversioned locator resolves to an honest error');
  report.unversionedObservation = { source: value.body()?.props?.source, error: value.body()?.props?.error, message: value.body()?.props?.message,
    additionalReads: report.reads.length - beforeReads };
  assert.equal(value.body()?.props?.error, true, 'an explicit text locator without revision/View must not be applied to remembered/current bytes');
  assert.match(value.body().props.message, /来源没有(?:记录)?准确版本/); assert.equal(report.reads.length, beforeReads);
  assert.equal(protectedBefore(), beforeUnversionedInput);
  const errorKey = value.state().lcosControlled.requestKey;
  await act(async () => m.requestNativeMaterialView({ projectId: value.projectId, artifactId: 'a' })); await value.waitNew(errorKey);
  assert.equal(value.body().props.source.revisionId, 'r2'); assert.equal(value.body().props.source.locator, undefined);
  pass('locator with no explicit revision/View gives original named error before GET; draft retained; ordinary no-locator last-read r2 remains available'); await value.close();

  value = await createFixture();
  let changedAfterAdmission = false;
  const releaseAdmission = m.R.subscribe(state => {
    if (changedAfterAdmission || state.draft.orderedEntityRefs.length === 0) return;
    changedAfterAdmission = true;
    m.S.setState({ composerTarget: { ...m.S.getState().composerTarget, messageId: 'new-message-after-admission' }, composerPrompt: '新消息草稿', composerCaret: null });
  });
  let admissionError;
  await act(async () => { try { await value.body().props.onCiteSelection(value.payload()); } catch (error) { admissionError = error; } });
  releaseAdmission();
  report.admissionObservation = { changedAfterAdmission, error: admissionError?.message, prompt: m.S.getState().composerPrompt, phase: value.runtime.getState().phase };
  assert.equal(changedAfterAdmission, true);
  assert.equal(m.S.getState().composerPrompt, '新消息草稿', 'a synchronous original ReferenceStore publication changing message may not insert old excerpt into the new input');
  assert.equal(value.runtime.getState().phase, 'open'); assert.match(admissionError?.message ?? '', /输入已变化|目标已变化/);
  pass('actual ReferenceStore admission publication changing message is rechecked before excerpt or close; the new input stays exact'); await value.close();

  value = await createFixture();
  let sendingToken;
  await act(async () => { sendingToken = m.R.getState().beginReferenceInputOperation(m.referencePickOwnerKey(value.projectId, m.S.getState().composerTarget), 'sending'); });
  const sendingBefore = protectedBefore();
  await assert.rejects(value.body().props.onCiteSelection(value.payload()), /正在发送/);
  assert.equal(protectedBefore(), sendingBefore); assert.equal(value.runtime.getState().phase, 'open');
  assert.equal(value.body().props.source.revisionId, 'r1', 'sending does not remove the readable original version');
  await act(async () => m.R.getState().finishReferenceInputOperation(sendingToken));
  await click(value.button('加入当前输入')); await wait(() => value.runtime.getState().phase === 'closing', 'ordinary draft use recovers after the original sending lock ends');
  pass('actual original sending owner lock rejects draft mutation while retaining readable detail; ending that exact operation restores whole-material admission'); await value.close();

  value = await createFixture();
  let changedAfterPrompt = false;
  const newCaret = { projectId: value.projectId, targetKey: 'new-input-caret', text: '另一个输入', start: 1, end: 1 };
  const releasePrompt = m.S.subscribe(state => {
    if (changedAfterPrompt || !state.composerPrompt.includes(quote)) return;
    changedAfterPrompt = true;
    m.S.setState({ composerTarget: { ...state.composerTarget, continuationOperationId: 'new-operation-after-prompt' }, composerPrompt: '另一个输入', composerCaret: newCaret });
  });
  let promptError;
  await act(async () => { try { await value.body().props.onCiteSelection(value.payload()); } catch (error) { promptError = error; } });
  releasePrompt();
  assert.equal(changedAfterPrompt, true); assert.equal(m.S.getState().composerPrompt, '另一个输入'); assert.deepEqual(m.S.getState().composerCaret, newCaret);
  assert.equal(value.runtime.getState().phase, 'open'); assert.match(promptError?.message ?? '', /输入已切换|输入已变化/);
  pass('actual prompt publication changing operation preserves the new draft and its new caret; old citation callback does not remember a stale caret or close reading'); await value.close();

  value = await createFixture({ withLibrary: true });
  await value.more();
  await click(value.container.querySelector('[data-native-material-location-index="1"]'));
  await wait(() => value.body()?.props?.source?.locator?.selected?.label === 'A', 'same-version location handoff');
  await act(async () => value.originalWa.getState().markOpen());
  await click(value.button('加入当前输入'));
  await act(async () => value.originalWa.getState().finishClose());
  await wait(() => value.library.getState().isOpen === false && dom.document.activeElement === value.editor, 'captured original Library closes and input receives focus');
  assert.equal(value.library.getState().searchKeyword, ''); assert.equal(m.S.getState().composerPrompt, '前文尾文');
  assert.equal(m.R.getState().draft.orderedEntityRefs[0].revisionId, 'r1');
  pass('actual Contexts owner + original mO store + full Host: same-input location handoff retains explicit Composer-origin close; finishClose closes that Library and focuses original editor'); await value.close();

  value = await createFixture({ withLibrary: true });
  await act(async () => dom.dispatchEvent(new dom.CustomEvent('lcos-native-open-library', { detail: { projectId: value.projectId, composerOriginKey: m.composerInputKey(m.S.getState().composerTarget) } })));
  value.library.setState({ searchKeyword: '后来重开的库' });
  await click(value.button('加入当前输入')); await act(async () => value.originalWa.getState().finishClose());
  assert.equal(value.library.getState().isOpen, true); assert.equal(value.library.getState().searchKeyword, '后来重开的库');
  pass('full Host delayed old Viewer use cannot close a later explicit Library invocation even when original store and input address are unchanged'); await value.close();

  value = await createFixture({ withLibrary: true, withRecovery: true });
  assert.equal(value.recovery.accepted, true, 'actual wa markOpen accepts exact Reader recovery lease');
  await click(value.button('加入当前输入')); await act(async () => value.originalWa.getState().finishClose());
  await wait(() => value.library.getState().isOpen === false && dom.document.activeElement === value.editor, 'recovery use returns to same original input');
  assert.equal(value.recovery.closed, true); assert.equal(value.recoveryClosed(), 1);
  pass('accepted original Reader recovery lease receives its actual onClosed exactly once before captured Library close/input return; original recovery cleanup is not skipped'); await value.close();
  assert.ok(report.reads.length > 0); report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  if (reactRoot) await React.act(async () => reactRoot.unmount());
  globalThis.fetch = originalFetch; await dom?.happyDOM?.close();
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, error: report.error?.message, report: path.join(output, 'report.json') }));
}
