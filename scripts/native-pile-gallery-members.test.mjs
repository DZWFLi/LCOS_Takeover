import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativePileCollectionScript as transform } from '../lab/native-pile-collection-transform.mjs';

const rootDir = path.resolve(import.meta.dirname, '..'), output = path.join(rootDir, 'output/原生ColorPin整合_20261017h');
await fs.mkdir(output, { recursive: true });
const temporary = await fs.mkdtemp(path.join(rootDir, '.runtime/native-pile-gallery-members-'));
const report = { passed: false, at: new Date().toISOString(), scope: 'Actual original Gallery source owners + production read projection/hook in real installed React/happy-dom, controlled Core HTTP DTOs only. No candidate/browser/Core/DB/fixture write or model.', cases: [] };
const passed = (name, evidence) => report.cases.push({ name, passed: true, evidence });
let dom, reactRoot;
try {
  const appRequire = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json'));
  const react = appRequire('react'), { Window } = appRequire('happy-dom');
  dom = new Window({ url: 'http://127.0.0.1:32123/' });
  dom.matchMedia = query => ({ matches: query.includes('prefers-reduced-motion'), media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  Object.assign(globalThis, { window: dom, document: dom.document, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node,
    Event: dom.Event, CustomEvent: dom.CustomEvent, MouseEvent: dom.MouseEvent,
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.navigator });
  const bundle = path.join(temporary, 'pile-ui.js'); await buildPilotEntry('lab/pilot/native-pile-ui.tsx', bundle, 'browser', { nativeReact: true });
  let built = await fs.readFile(bundle, 'utf8');
  for (const [native, module] of [['native-react', 'react'], ['native-jsx-runtime', 'react/jsx-runtime'], ['native-react-dom', 'react-dom']])
    built = built.replaceAll('"/lcos/' + native + '.js"', JSON.stringify(pathToFileURL(appRequire.resolve(module)).href));
  const { LCOSNativePileDisplay: display, LCOSUseNativePileGallery: useGallery } = await import('data:text/javascript;base64,' + Buffer.from(built).toString('base64'));
  const sourceFile = 'course-api-base-url-CifxI1ia.js', source = await fs.readFile(path.join(rootDir, 'reference/tapnow-installed/resources/web/assets', sourceFile), 'utf8');
  const changed = transform(sourceFile, source); assert.equal(transform(sourceFile, changed), changed);
  const owners = text => new Map(parse(text, sourceFile).body.flatMap(node => node.type === 'FunctionDeclaration' ? [[node.id.name, node]] : node.type === 'VariableDeclaration' ? node.declarations.map(row => [row.id?.name, row]) : []));
  const before = owners(source), after = owners(changed), slice = (text, nodes, name) => text.slice(nodes.get(name).start, nodes.get(name).end);
  for (const name of ['Ri', 'qy', 'Pz', 'wFe', 'aFe', 'FVe', 'IDe', 'kDe', 'vDe', 'D3']) assert.equal(slice(changed, after, name), slice(source, before, name), name + ' physical/layout/session owner unchanged');
  passed('actual original exclusive Ri, physical wFe, Gallery provider, geometry and item renderer remain byte-identical; transformed source parses/idempotent');
  // Execute the exact current server's source pipeline body without importing
  // server.mjs (which would start a listener) or invoking any backend factory.
  const server = await fs.readFile(path.join(rootDir, 'lab/server.mjs'), 'utf8');
  const modules = {};
  for (const match of server.matchAll(/(\w+Transform)\s*=\s*await import\('([^']+)'\)/g))
    modules[match[1]] = await import(pathToFileURL(path.join(rootDir, 'lab', match[2])));
  const start = server.indexOf('    const startupSource ='), end = server.indexOf("    if (typeof transformed !== 'string')", start);
  assert.ok(start >= 0 && end > start);
  const flags = { fullIntegration: true, cut: true, nodes: true, surfaceCore: true, nativeTextPilot: true, nativeCollectionPilot: true, nativeAssemblyPilot: true, nativeRailPilot: true };
  const env = { ...modules, ...flags, path };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const pipeline = new AsyncFunction(...Object.keys(env), 'file', 'original', server.slice(start, end) + '\nreturn transformed;');
  for (const file of [sourceFile, 'page-Da_DfwiK.js']) {
    const original = file === sourceFile ? source : await fs.readFile(path.join(rootDir, 'reference/tapnow-installed/resources/web/assets', file), 'utf8');
    const combined = await pipeline(...Object.values(env), file, original); parse(combined, file);
    assert.equal(transform(file, combined), combined);
  }
  passed('exact current full server transform pipeline executes/parses for both actual assets including Gallery→Viewer→autosave→ColorPin→light; no server/backend start', { sourceModules: Object.keys(modules).length });

  const ref = (artifact, view, revision) => ({ version: 1, entityType: 'view', entityId: view, artifactId: artifact, artifactViewId: view, revisionId: revision });
  const members = [
    { id: 'image-a-old', type: 'image', position: { x: 10, y: 20 }, data: { id: 'image-a-old', title: '历史图', src: '/api/canvas/c/artifact/a', lcos_ref: ref('asset-a', 'view-old', 'history-r1') } },
    { id: 'image-a-current', type: 'image', position: { x: 110, y: 120 }, data: { id: 'image-a-current', title: '另一位置', src: '/api/canvas/c/artifact/b', lcos_ref: ref('asset-a', 'view-new', 'current-r9') } },
    { id: 'text-b', type: 'text', position: { x: 210, y: 220 }, data: { id: 'text-b', title: '文字', text: '准确正文', lcos_ref: ref('asset-b', 'view-b', 'text-r2') } },
  ];
  const target = { projectId: 'p', canvasId: 'c', workspaceId: 'w', collectionId: 'collection-c', carrierId: 'pile-c' };
  const makePile = id => ({ id, type: 'pile', position: { x: 30, y: 40 }, data: { id, memberIds: members.map(node => node.id), lcos_native_collection: true,
    lcos_collection_ref: { ...target, collectionId: 'collection-' + id.slice(-1) } } });
  const piles = ['pile-a', 'pile-b', 'pile-c'].map(makePile), sourceNodes = [...members, ...piles];
  const oldDisplay = sourceNodes.map(node => node.type === 'pile' ? { ...node, data: { ...node.data, displayMembers: node.id === 'pile-a' ? members.map(node => ({ node })) : [] } }
    : { ...node, position: { x: 999, y: 999 }, draggable: false, selectable: false });
  const sourceBefore = structuredClone(sourceNodes), displayBefore = structuredClone(oldDisplay);
  const projected = display(sourceNodes, oldDisplay, node => ({ node }));
  assert.ok(projected.filter(node => node.type === 'pile').every(pile => pile.data.displayMembers.length === 3));
  for (let i = 0; i < members.length; i++) assert.equal(projected[i], oldDisplay[i], 'Physical display ownership/geometry stays the original object');
  assert.deepEqual(sourceNodes, sourceBefore); assert.deepEqual(oldDisplay, displayBefore);
  assert.equal(projected[5].data.displayMembers[0].node, members[0]);
  const ordinary = { ...piles[0], data: { id: 'ordinary', memberIds: ['image-a-old'] } };
  assert.equal(display([ordinary], [ordinary], node => ({ node }))[0], ordinary);
  passed('production display restores actual shared occurrences for each managed read display; source/physical geometry and ordinary Piles are untouched', { logicalMembers: 2, actualOccurrences: 3 });

  let canonical = [{ memberRef: { type: 'artifact', id: 'asset-a' } }, { memberRef: { type: 'artifact', id: 'asset-b' } }];
  let previews = [{ type: 'artifact', id: 'asset-a', label: '图像材料', availability: 'available', revisionId: 'current-r9' }, { type: 'artifact', id: 'asset-b', label: '文字材料', availability: 'available' }];
  let nativeNodes = structuredClone(sourceNodes), currentNodes = structuredClone(sourceNodes), readDeferred;
  const api = { getNodes: () => currentNodes, getNode: id => currentNodes.find(node => node.id === id) };
  window.__LCOS_NODE_LAB__ = { projectId: 'p', currentCanvasId: 'c', api };
  const bindings = nativeNodes.map(node => ({ projectId: 'p', canvasId: 'c', spatialKind: 'node', spatialId: node.id,
    entityType: node.type === 'pile' ? 'collection' : 'view', entityId: node.type === 'pile' ? node.data.lcos_collection_ref.collectionId : node.data.lcos_ref.artifactViewId }));
  const requests = [];
  const fetch = async (address, init = {}) => {
    const url = new URL(address, window.location.href); requests.push({ method: init.method ?? 'GET', path: url.pathname });
    assert.equal(init.method ?? 'GET', 'GET', 'Gallery read must not write');
    if (readDeferred) await readDeferred;
    if (url.pathname.endsWith('/collections/collection-c/members')) return Response.json({ ok: true, value: { collection: { id: 'collection-c', projectId: 'p', title: '共享成员集合' }, members: canonical, previews } });
    if (url.pathname.endsWith('/spatial/bindings')) return Response.json({ ok: true, value: bindings });
    if (url.pathname === '/api/canvas/v1/canvases/c') return Response.json({ code: 0, data: { nodes: nativeNodes } });
    throw new Error('Unexpected test request ' + url.pathname);
  };
  globalThis.fetch = fetch; window.fetch = fetch;
  const session = { pileId: 'pile-c', lcosCollectionGallery: { ...target, api } };
  let captured;
  function Harness({ original = [], value = session }) { captured = useGallery(value, original); return react.createElement('main', {}, captured?.content,
    react.createElement('output', { 'data-actual-node-ids': true }, JSON.stringify(captured?.nodes.map(node => node.id)))); }
  const { createRoot } = appRequire('react-dom/client'), { act } = react;
  const container = document.createElement('div'); document.body.append(container); reactRoot = createRoot(container);
  const settle = async callback => { await act(async () => { callback?.(); await new Promise(resolve => setTimeout(resolve, 20)); }); };
  await settle(() => reactRoot.render(react.createElement(Harness)));
  assert.deepEqual(captured.nodes.map(node => node.id), members.map(node => node.id));
  assert.match(container.textContent, /2 个成员 · 3 个位置/);
  assert.equal(captured.nodes[0].data.lcos_ref.revisionId, 'history-r1'); assert.equal(captured.nodes[1].data.lcos_ref.revisionId, 'current-r9');
  assert.equal(container.querySelectorAll('[data-native-collection-gallery-member]').length, 0, 'Normal readable cards are not duplicated into an inspector list');
  assert.equal(container.querySelector('button'), null, 'Normal caption has no always-on diagnostic refresh button');
  assert.doesNotMatch(container.querySelector('[data-native-collection-gallery-info]').className, /border|shadow|bg-|absolute|fixed/, 'Caption is a light original-content row, not another card/panel');
  assert.equal(requests.length, 3);
  passed('real React production hook reads canonical 2 independently of original empty display; shows 3 real occurrences and preserves historical/current exact refs', { requests: requests.slice() });

  canonical = [...canonical, { memberRef: { type: 'note', id: 'unprojected-note' } }, { memberRef: { type: 'artifact', id: 'missing-asset' } }];
  previews = [...previews, { type: 'note', id: 'unprojected-note', label: '未投影笔记', availability: 'available' }, { type: 'artifact', id: 'missing-asset', label: '丢失材料', availability: 'missing' }];
  const refresh = () => { const button = container.querySelector('button');
    if (button) button.dispatchEvent(new dom.MouseEvent('click', { bubbles: true }));
    else window.dispatchEvent(new dom.CustomEvent('lcos:native-collection-updated', { detail: target }));
  };
  await settle(refresh); assert.equal(container.querySelectorAll('[data-native-collection-gallery-member]').length, 2, 'Only missing/unprojected member rows supplement real original cards');
  assert.match(container.textContent, /未投影笔记/); assert.match(container.textContent, /丢失材料/); assert.match(container.textContent, /材料缺失/);
  assert.match(container.textContent, /4 个成员 · 3 个位置/); assert.equal(captured.nodes.length, 3);
  const audio = { id: 'audio-real', type: 'audio', position: { x: 300, y: 400 }, data: { id: 'audio-real', title: '音频', src: '/api/canvas/c/artifact/audio', lcos_ref: ref('audio-asset', 'audio-view', 'audio-history') } };
  const note = { id: 'note-real', type: 'text', position: { x: 400, y: 500 }, data: { id: 'note-real', title: '真实笔记位置', noteRef: 'unprojected-note' } };
  nativeNodes.push(audio, note); currentNodes.push(structuredClone(audio), structuredClone(note));
  nativeNodes.find(node => node.id === 'pile-c').data.memberIds.push(audio.id, note.id);
  bindings.push({ projectId: 'p', canvasId: 'c', spatialKind: 'node', spatialId: audio.id, entityType: 'view', entityId: 'audio-view' },
    { projectId: 'p', canvasId: 'c', spatialKind: 'node', spatialId: note.id, entityType: 'note', entityId: 'unprojected-note' });
  canonical.push({ memberRef: { type: 'artifact', id: 'audio-asset' } }); previews.push({ type: 'artifact', id: 'audio-asset', label: '音频材料', availability: 'available' });
  await settle(refresh); assert.equal(captured.nodes.length, 4); assert.equal(captured.nodes.at(-1).data.lcos_ref.revisionId, 'audio-history');
  assert.match(container.textContent, /5 个成员 · 5 个位置/);
  const noteLabel = container.querySelector('[data-native-collection-gallery-member="note:unprojected-note"]').textContent;
  assert.match(noteLabel, /1 个位置（暂不支持此预览）/);
  passed('original media types retain real audio occurrence/history; unsupported canonical Note keeps its real projected count and explicit preview limitation', { previewOccurrences: 4, actualPositions: 5 });
  canonical = [{ memberRef: { type: 'artifact', id: 'missing-asset' } }]; previews = previews.filter(row => row.id === 'missing-asset');
  nativeNodes.find(node => node.id === 'pile-c').data.memberIds = [];
  await settle(refresh); assert.deepEqual(captured.nodes, []); assert.match(container.textContent, /1 个成员 · 0 个位置/); assert.match(container.textContent, /材料缺失/);
  canonical = []; previews = []; await settle(refresh); assert.match(container.textContent, /这个集合暂时没有成员/);
  passed('canonical unprojected and missing members remain visible; projected-zero and fully empty Collection keep one real dialog state slot with GET refresh, no fake member node', { fullMembersPreserved: 4, noFabricatedNodes: true });

  canonical = [{ memberRef: { type: 'artifact', id: 'unprojected-available' } }];
  previews = [{ type: 'artifact', id: 'unprojected-available', label: '尚未放置的材料', availability: 'available', revisionId: 'entity-current' }];
  await settle(refresh);
  const materialRequests = []; window.addEventListener('lcos-native-open-material', event => materialRequests.push(event.detail));
  const view = () => [...container.querySelectorAll('button')].find(button => button.textContent === '查看').dispatchEvent(new dom.MouseEvent('click', { bubbles: true }));
  const beforeView = requests.length; await settle(view);
  assert.deepEqual(materialRequests, [{ projectId: 'p', artifactId: 'unprojected-available', title: '尚未放置的材料' }]);
  assert.equal(requests.length, beforeView + 3, 'View preflight reuses exactly the existing read-only canonical/binding/Canvas reader');
  assert.ok(requests.every(row => row.method === 'GET'));
  passed('available unprojected Artifact opens existing native material event only after exact fresh read; no fake projection/node or write, while projected cards retain their pinned refs', { request: materialRequests[0] });

  const walk = (node, visit) => { if (!node?.type) return; visit(node); for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit); };
  const dec = (owner, name) => { const all = []; walk(owner, node => { if (node.type === 'VariableDeclarator' && node.id?.name === name) all.push(node); }); assert.equal(all.length, 1); return all[0]; };
  const openSource = dec(after.get('yFe'), 'ae').init.arguments[0];
  const galleryOpens = [], openEnv = { B: true, S: [], g: null, s: { current: { closest: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }) }), getBoundingClientRect: () => ({ left: 10, top: 20 }) } },
    IDe: value => ({ sources: new Map(), sourceGeometry: value }), i: () => ({ zoom: 1 }), ne: {}, m: value => galleryOpens.push(value), L: true, e: 'pile-c', fFe: 1, u: 'small', lcosCollectionGallery: session.lcosCollectionGallery };
  const runOpen = () => new Function(...Object.keys(openEnv), 'return (' + changed.slice(openSource.start, openSource.end) + ')')(...Object.values(openEnv))();
  runOpen(); assert.equal(galleryOpens.length, 1); assert.equal(galleryOpens[0].lcosCollectionGallery.api, api);
  openEnv.lcosCollectionGallery = undefined; runOpen(); assert.equal(galleryOpens.length, 1, 'Ordinary empty Pile still does not open');
  passed('actual transformed yFe opens the same FVe session for managed empty/missing read; ordinary empty-Pile admission remains unchanged');

  const jsx = (type, props) => ({ type, props }), hookStub = { useCallback: callback => callback };
  const fullNodes = members, geometry = { centerX: 20, centerY: 30, zoom: 1, previewExpansion: {} };
  const liveSession = { ...session, canEdit: true, portalContainer: container, snapshot: { sources: new Map(), sourceGeometry: geometry } };
  const readerResult = { nodes: fullNodes, content: captured.content };
  const lve = new Function('D3', 'Ms', 'd', 'aFe', 'LCOSUseNativePileGallery', 'Ep', 'iFe', 'So', 'a', 'I3', 'tFe', '_3',
    slice(changed, after, 'LVe') + ';return LVe;')(
    () => ({ session: liveSession }), callback => callback({ nodeLookup: new Map([['pile-c', { type: 'pile', data: { displayMembers: [] } }]]) }), hookStub,
    node => node.data.displayMembers, () => readerResult, (node, variant) => ({ node, variant }), () => ({ portalContainer: null }), {}, { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'OriginalTransition', 'OriginalGallery',
    (pack, point) => new Map(pack.map(item => [item.node.id, { point }])));
  const galleryElement = lve().props.children[0]; assert.equal(galleryElement.type, 'OriginalGallery');
  assert.deepEqual(galleryElement.props.members.map(row => row.node.id), fullNodes.map(node => node.id));
  assert.equal(galleryElement.props.snapshot.sources.size, 3); assert.equal(galleryElement.props.snapshot.sourceGeometry, geometry);
  assert.equal(galleryElement.props.canEdit, true); assert.equal(galleryElement.props.lcosCollectionSpatialReadOnly, true);
  assert.equal(galleryElement.props.lcosCollectionContent, captured.content);
  const dragSource = dec(after.get('tFe'), 'Mt').init.arguments[0]; const dragWrites = [];
  const dragEnv = { lcosCollectionSpatialReadOnly: true, n: true, C: 'open', V: { current: null }, U: { current: new Map([['image-a-old', { getBoundingClientRect: () => ({ left: 0, top: 0, width: 250, height: 200 }) }]]) },
    Z: [{ node: fullNodes[0] }], qE: value => value, J: value => dragWrites.push(value), wDe: () => ({ x: 0, y: 0 }) };
  const runDrag = () => new Function(...Object.keys(dragEnv), 'return (' + changed.slice(dragSource.start, dragSource.end) + ')')(...Object.values(dragEnv))({ active: { id: 'image-a-old' } });
  runDrag(); assert.equal(dragWrites.length, 0); dragEnv.lcosCollectionSpatialReadOnly = false; runDrag(); assert.equal(dragWrites.length, 1);
  passed('actual original LVe/tFe plumbing keeps accurate Ep/_3 snapshot and original read/media actions while isolating only unowned physical drag; ordinary original drag still runs', { originalNodeLookupCount: 0, controlledReadOccurrences: 3 });

  const escapeSource = dec(after.get('tFe'), 'pe').init.arguments[0]; let galleryCloses = 0;
  const escapeEnv = { lcosCollectionContent: {}, document, A: null, C: 'open', T: null, se: () => galleryCloses++ };
  const escape = () => new Function(...Object.keys(escapeEnv), 'return (' + changed.slice(escapeSource.start, escapeSource.end) + ')')(...Object.values(escapeEnv))({ key: 'Escape', defaultPrevented: false, preventDefault() {} });
  const viewer = document.createElement('div'); viewer.setAttribute('data-media-viewer', 'true'); document.body.append(viewer);
  escape(); assert.equal(galleryCloses, 0, 'Existing Viewer close keeps original Gallery session');
  viewer.remove(); escape(); assert.equal(galleryCloses, 1, 'After Viewer DOM closes, original Gallery Escape works again');
  const hit = []; walk(after.get('tFe'), node => { if (node.type === 'StringLiteral' && node.value === '[data-native-collection-gallery-info], [data-media-viewer]') hit.push(node); });
  assert.equal(hit.length, 1, 'Original Gallery outside-click owner admits original Viewer interaction rather than closing the Gallery underneath it');
  passed('actual original Gallery Escape owner yields to existing media Viewer then resumes; existing Viewer pointer actions stay inside the same Gallery return path');

  let release; readDeferred = new Promise(resolve => release = resolve);
  await act(async () => { view(); await new Promise(resolve => setTimeout(resolve, 0)); });
  window.__LCOS_NODE_LAB__.api = { ...api };
  release(); readDeferred = undefined; await settle();
  assert.equal(materialRequests.length, 1, 'Owner change during View read cannot open any material');
  await settle(() => window.dispatchEvent(new dom.CustomEvent('lcos-native-bridge-changed')));
  assert.deepEqual(captured.nodes, []); assert.match(container.textContent, /现场已切换/);
  const count = requests.length; await settle(refresh); assert.equal(requests.length, count, 'Old Gallery session must not read through the new API identity');
  assert.ok(requests.every(row => row.method === 'GET'));
  passed('late API change refuses adoption and later refresh from old session; all controlled transport requests remain GET-only', { totalGetRequests: requests.length });
  report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); throw error; }
finally {
  if (reactRoot) { const req = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json')); await req('react').act(async () => reactRoot.unmount()); }
  if (dom) await dom.happyDOM.close();
  await fs.writeFile(path.join(output, '共享成员原Gallery修复测试.json'), JSON.stringify(report, null, 2));
  if (path.dirname(temporary) === path.join(rootDir, '.runtime') && path.basename(temporary).startsWith('native-pile-gallery-members-')) await fs.rm(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, output: path.join(output, '共享成员原Gallery修复测试.json') }));
