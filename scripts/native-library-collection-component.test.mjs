import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(import.meta.dirname, '..'), dep = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json'));
const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
const React = dep('react'), { createRoot } = dep('react-dom/client'), { Window } = dep('happy-dom');
const temp = await fs.mkdtemp(path.join(root, '.runtime/native-library-collection-component-'));
const output = path.join(root, 'output/原生库集合整合_20261017g');
const report = { passed: false, productUnknownRetentionPassed: false,
  scope: 'source-extracted actual Collection detail React function + actual production client/preview helper; controlled transport/native leaf ports, happy-dom, no candidate/Core',
  candidateWrites: 0, coreWrites: 0, models: 0, cases: [] };
const keys = ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
const old = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const dom = new Window({ url: 'http://127.0.0.1:1/' });
for (const key of keys.slice(0, 6)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'window' ? dom : dom[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let mounted;
try {
  const entry = path.join(temp, 'ports.ts'), bundle = path.join(temp, 'ports.mjs');
  await fs.writeFile(entry, `export * from ${JSON.stringify(path.join(root, 'lab/pilot/native-library-collection-placement.ts'))};
export {collectionPreviewMembers,validateCollectionMembersSnapshot} from ${JSON.stringify(path.join(root, 'lcos/apps/web-gen2/src/backend/collections.ts'))};`);
  await buildPilotEntry(path.relative(root, entry), bundle);
  const ports = await import(pathToFileURL(bundle));
  const source = await fs.readFile(path.join(root, 'lab/pilot/native-library-contexts.tsx'), 'utf8');
  const program = ts.createSourceFile('actual-detail.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const get = name => { const statement = program.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name); assert.ok(statement, name); return statement.getText(program); };
  const transpile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const evaluate = (text, env) => {
    const module = { exports: {} };
    new Function('require', 'exports', ...Object.keys(env), transpile(text))(specifier => dep(specifier), module.exports, ...Object.values(env));
    return module.exports;
  };
  const input = { projectId: 'project', canvasId: 'canvas', workspaceId: 'workspace', collectionId: 'collection' };
  const collection = { id: input.collectionId, projectId: input.projectId, title: '原库关开验证', createdAt: '2026-10-17', updatedAt: '2026-10-17' };
  const labels = ['可用成员', '暂不可读成员', '已缺失成员', '已变化成员'];
  const snapshot = ports.validateCollectionMembersSnapshot({ collection,
    members: labels.map((label, index) => ({ collectionId: collection.id, relationId: 'relation-' + index, addedAt: '2026-10-17', memberRef: { type: 'artifact', id: 'member-' + index } })),
    previews: labels.map((label, index) => ({ type: 'artifact', id: 'member-' + index, label, kind: 'text', availability: ['available', 'unreadable', 'missing', 'stale'][index] })),
  }, input.projectId, input.collectionId);
  let nodes = [], canonical = false, firstReply, postCount = 0;
  const requests = [], api = { getNodes: () => nodes, getEdges: () => [], getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    flushCanvas: async () => 'saved', findMaterialPlacement: () => ({ x: 500, y: 300 }),
    async synchronizeCollectionCarrier({ node }) { nodes = [node]; canvas.nodes = nodes; return { ok: true }; } };
  const shell = { projectId: input.projectId, activeWorkspaceId: input.workspaceId, activeSurface: 'main', surfaceCanvasId: { main: input.canvasId } };
  const canvas = { canvasId: input.canvasId, status: 'ready', rfInstance: api, nodes };
  const shellHook = select => select(shell); shellHook.getState = () => shell;
  const canvasHook = select => select(canvas); canvasHook.getState = () => canvas;
  window.__LCOS_NODE_LAB__ = { api };
  const projection = () => ({ project_id: input.projectId, canvas_id: input.canvasId, workspace_id: input.workspaceId, collection_id: input.collectionId,
    state: canonical ? 'present' : 'absent', presentation_received: canonical, provider_execution_started: false,
    binding: canonical ? { projectId: input.projectId, canvasId: input.canvasId, spatialKind: 'node', spatialId: 'one-pile', entityType: 'collection', entityId: input.collectionId } : null,
    node: canonical ? { id: 'one-pile', type: 'pile', position: { x: 500, y: 300 }, data: { id: 'one-pile', lcos_native_collection: true, memberIds: [], lcos_collection_ref: input } } : null });
  globalThis.fetch = async (address, init = {}) => {
    const method = init.method ?? 'GET'; requests.push({ address, method });
    if (method === 'POST') {
      postCount++;
      if (postCount === 1) return new Promise(resolve => { firstReply = () => resolve({ ok: true, json: async () => ({ code: 0, data: projection() }) }); });
      return { ok: false, json: async () => ({ code: 40900, message: 'synthetic concurrent first owner still pending' }) };
    }
    return { ok: true, json: async () => ({ code: 0, data: projection() }) };
  };
  const nativeEntry = evaluate(get('nativeLibraryEntry'), { record: value => !!value && typeof value === 'object' && !Array.isArray(value),
    nonEmpty: value => typeof value === 'string' && !!value.trim(), kinds: ['context', 'workflow', 'collection'] }).nativeLibraryEntry;
  const env = { useLcosShellStore: shellHook, useCanvasStore: canvasHook, nativeLibraryEntry: nativeEntry,
    useNativeLibraryInputOrigin: () => null, createLcosCoreSession: () => ({ collections: { members: async () => snapshot } }),
    ...Object.fromEntries(['useEffect', 'useMemo', 'useRef', 'useState'].map(name => [name, React[name]])),
    placeNativeLibraryCollection: ports.placeNativeLibraryCollection, readNativeLibraryCollectionProjection: ports.readNativeLibraryCollectionProjection,
    isNativeLibraryCollectionCarrier: ports.isNativeLibraryCollectionCarrier, collectionPreviewMembers: ports.collectionPreviewMembers,
    locateNativeMaterialNodes: () => { throw new Error('No camera gesture in this read/lifetime test'); }, buttonClass: 'original-slot-button' };
  const component = evaluate(get('LCOSNativeLibraryCollectionDetail') + '\nexports.Detail=LCOSNativeLibraryCollectionDetail;', env).Detail;
  const detail = { asset: { lcos_library_entry: { projectId: input.projectId, item: { schemaVersion: 1, kind: 'collection', entityRef: { type: 'collection', id: collection.id }, title: collection.title, usageCount: 0 } } } };
  const Preview = ({ bodySlot, metaSlot, actionsSlot }) => React.createElement('section', { 'data-original-ts-slot-fixture': true }, metaSlot, bodySlot, actionsSlot);
  const outlet = document.createElement('div'); document.body.append(outlet);
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const render = async () => { mounted = createRoot(outlet); await React.act(async () => { mounted.render(React.createElement(component, { detail, NativePreview: Preview })); await tick(); }); };
  const button = label => [...document.querySelectorAll('button')].find(element => element.textContent === label);
  const click = async label => { const element = button(label); assert.ok(element && !element.disabled, label); await React.act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); await tick(); }); };
  await render();
  for (const label of labels) assert.ok(document.body.textContent.includes(label), 'Every canonical member stays visible: ' + label);
  assert.equal(document.querySelectorAll('li').length, 4); assert.equal([...document.querySelectorAll('li')].filter(row => row.textContent.includes('暂不可读取')).length, 3);
  report.cases.push('Actual Collection detail preserves all available/unreadable/missing/stale canonical members; no private filtering');
  await click('放到画布'); assert.equal(postCount, 1); assert.ok(button('放到画布').disabled);
  await React.act(async () => { mounted.unmount(); mounted = null; });
  await render();
  assert.ok(button('放到画布') && !button('放到画布').disabled); assert.equal(button('核对放置结果'), undefined);
  await click('放到画布'); assert.equal(postCount, 2);
  assert.ok(button('核对放置结果'), 'Second ambiguous POST switches this fresh component to explicit GET only');
  canonical = true;
  await React.act(async () => { firstReply(); await tick(); });
  assert.equal(nodes.length, 0, 'The unmounted old detail cannot backfill its late successful reply');
  await click('核对放置结果'); assert.equal(postCount, 2); assert.equal(nodes.length, 1); assert.equal(nodes[0].type, 'pile');
  assert.ok(button('定位到画布'));
  report.requests = requests;
  report.cases.push('Known UI limitation strictly reproduced: closing first pending Popover/remounting GET absent loses unknown and exposes another POST; this is NOT GET-only retained recovery');
  report.cases.push('Late old detail result cannot publish; current original action explicitly GET-checks into one pile, with no third POST');
  report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); throw error; }
finally {
  if (mounted) await React.act(async () => mounted.unmount());
  await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, '详情关开与全成员实际组件.json'), JSON.stringify(report, null, 2));
  for (const key of keys) if (old[key]) Object.defineProperty(globalThis, key, old[key]); else delete globalThis[key];
  dom.happyDOM.abort();
  if (path.dirname(temp) === path.join(root, '.runtime') && path.basename(temp).startsWith('native-library-collection-component-')) await fs.rm(temp, { recursive: true, force: true });
}
