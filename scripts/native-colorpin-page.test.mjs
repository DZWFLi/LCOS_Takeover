import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeColorPinPageScript as transform } from '../lab/native-colorpin-page-transform.mjs';
import { transformNativeColorPinCourseScript } from '../lab/native-colorpin-course-transform.mjs';
import { transformNativeTiptapAutosaveScript } from '../lab/native-tiptap-autosave-transform.mjs';
import { transformNativeLightThemeScript } from '../lab/native-light-theme-transform.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'output/原生ColorPin整合_20261017h');
await fs.mkdir(output, { recursive: true });
const temp = await fs.mkdtemp(path.join(root, '.runtime/native-colorpin-page-'));
const require = createRequire(path.join(installedRoot, 'apps/local-core/package.json'));
const esbuild = createRequire(path.join(installedRoot, 'package.json'))('esbuild');
const report = { at: new Date().toISOString(), passed: false,
  scope: 'Actual original page AST/functions with controlled hook/render descriptors; production menu adapters and exact download service with controlled Core reads. Not real React lifecycle, candidate, browser, DB or GUI integration.', cases: [] };
const passed = (name, evidence) => report.cases.push({ name, passed: true, evidence });
const walk = (node, visit) => { if (!node?.type) return; visit(node); for (const value of Object.values(node))
  if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit); };
const owners = (source, filename) => new Map(parse(source, filename).body.flatMap(node => node.type === 'FunctionDeclaration' ? [[node.id.name, node]]
  : node.type === 'VariableDeclaration' ? node.declarations.map(row => [row.id?.name, row]) : []));
const clean = value => { if (!value || typeof value !== 'object') return value; if (Array.isArray(value)) return value.map(clean);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['start', 'end', 'loc', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)).map(([key, row]) => [key, clean(row)])); };
const jsx = (type, props) => ({ type, props });
const states = [], hooks = { memo: value => value, useMemo: callback => callback(), useCallback: callback => callback,
  useRef: value => ({ current: value }), useId: () => 'original-pin-menu-id', useEffect() {}, useLayoutEffect() {},
  useState: value => [typeof value === 'function' ? value() : value, next => states.push(next)] };
const evaluate = (name, source, declarations, env) => new Function(...Object.keys(env), 'return ('
  + source.slice(declarations.get(name).start, declarations.get(name).end).replace(new RegExp('^' + name + '='), '') + ');')(...Object.values(env));
const elements = tree => {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children)];
};

try {
  const filename = 'page-Da_DfwiK.js', original = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', filename), 'utf8');
  const changed = transform(filename, original), before = owners(original, filename), after = owners(changed, filename);
  assert.equal(transform(filename, changed), changed); assert.equal(transform('else.js', original), original);
  const patched = new Set(['eG', 'v7', 'y7', 'm7', 'p7']);
  for (const [name, node] of before) if (!patched.has(name)) assert.equal(changed.slice(after.get(name).start, after.get(name).end),
    original.slice(node.start, node.end), name + ' retains its original owner');
  assert.equal((changed.match(/createPortal\(/g) ?? []).length, (original.match(/createPortal\(/g) ?? []).length);
  const oldReturn = before.get('eG').init.arguments[0].body.body.find(node => node.type === 'ReturnStatement').argument;
  const newReturn = after.get('eG').init.arguments[0].body.body.find(node => node.type === 'ReturnStatement').argument;
  assert.equal(newReturn.arguments[0].name, 'LCOSNativeColorPinProvider');
  const child = newReturn.arguments[1].properties.find(row => row.key?.name === 'children').value;
  assert.deepEqual(clean(child), clean(oldReturn));
  const providers = []; walk(parse(changed, filename), node => { if (node.type === 'CallExpression' && node.arguments[0]?.name === 'LCOSNativeColorPinProvider') providers.push(node); });
  assert.equal(providers.length, 1); assert.match(original.slice(oldReturn.start, oldReturn.end), /jsx\(BC,/); assert.match(original.slice(oldReturn.start, oldReturn.end), /jsx\(H7,/);
  passed('page transform parses/idempotent; unchanged original w7/u7/bB/g7; one common eG Provider encloses BC and sibling H7 without changing its returned tree', { originalOwners: before.size, changedOriginalOwners: [...patched] });

  for (const file of [filename, 'course-api-base-url-CifxI1ia.js']) {
    const source = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', file), 'utf8');
    const a = transformNativeTiptapAutosaveScript(file, source), b = transformNativeColorPinCourseScript(file, a), c = transform(file, b), d = transformNativeLightThemeScript(file, c);
    parse(d, file); assert.equal(transform(file, d), d); assert.equal(transformNativeColorPinCourseScript(file, d), d);
  }
  passed('final server autosave → course → page → light order parses for both actual assets', { noCandidateBuild: true });

  let nativeEnabled = true, cloudCalls = 0;
  const group = { groupId: '123ABC', color: '#123ABC', definitionId: 'definition', label: '项目素材', updatedAt: '1',
    group: { id: '123ABC', hex: '#123ABC' }, nodeIds: ['a'], count: 1, membershipIds: ['m1'], sharedMembershipCount: 1, surfaceMembershipCount: 0 };
  const common = { l: hooks, r: { jsx, jsxs: jsx }, he: () => ({ t: (key, value) => value?.name ?? key }), ie: (...values) => values.filter(Boolean).join(' '),
    LCOSUseNativeColorPinBar: () => ({ enabled: nativeEnabled }), aT: () => false, Rj: () => [group], w7: 'OriginalW7', LCOSNativePinBar: 'NativeW7' };
  const bar = evaluate('v7', changed, after, common);
  assert.equal(bar().type, 'NativeW7'); nativeEnabled = false; assert.equal(bar(), null);
  const button = evaluate('y7', changed, after, { ...common, m7: 'OriginalM7' });
  const rendered = button({ group, open: true, customName: '项目素材', onRename() {} });
  assert.equal(rendered.props.defaultName, '#123ABC'); assert.equal(rendered.props.displayName, '项目素材');
  const unnamed = button({ group, open: false, onRename() {} }); assert.equal(unnamed.props.displayName, '#123ABC');
  const nativeBar = evaluate('LCOSNativePinBar', changed, after, { ...common, Hs: () => ({ canvasId: 'c' }), ai: 'OriginalTooltipProvider', b7: { borderRadius: 10 }, y7: 'OriginalGroupButton', Lj() {},
    LCOSUseNativeColorPinDownloads: () => ({ canDownloadNodes: () => true, downloadNodes: async () => ({ success: true }), isDownloading: false, message: '' }),
    LCOSUseNativeColorPinNames: () => ({ names: { '123ABC': '项目素材' }, canRename: true, savingGroupIds: new Set(), renameGroup() {} }),
    LCOSUseNativeColorPinMenuActions: () => ({ removeAllNodesFromGroup() {} }),
    Eu: selector => selector({ filteredGroupId: '123ABC', setGroupOpen() {}, clearFilter() {} }),
    u7() { cloudCalls++; }, iw() { cloudCalls++; }, Mj() { cloudCalls++; } });
  assert.equal(nativeBar({ groups: [group] }).type, 'OriginalTooltipProvider'); assert.equal(cloudCalls, 0);
  passed('actual v7 capability branch and y7 preserve original group/menu layout; existing non-six colors retain hex/name', { arbitraryColor: group.groupId });

  const nodes = [{ id: 'a', type: 'text', data: { title: '真实标题', lcos_ref: { artifactId: 'artifact', artifactViewId: 'v1', revisionId: 'r1' } }, position: { x: 123, y: -50 } }];
  const fit = [], high = [], analytics = []; let allowed = true;
  const locate = evaluate('p7', changed, after, { ...common, $e: () => ({ getNodes: () => nodes, fitView: value => fit.push(value) }),
    Mh: selector => selector({ addHighlightedNodes: ids => high.push(ids), clearHighlightedNodes: () => high.push('clear') }), ew: () => nodes,
    h7: node => ({ id: node.id, label: node.data.title }), f7: { duration: 400 }, jj: () => nodes, Pj: value => analytics.push(value),
    LCOSUseNativeColorPinLocate: () => ({ canLocate: () => allowed, message: '' }) });
  const located = locate(['a'], group); assert.equal(located.locateNode('a', group.groupId), true);
  assert.deepEqual(fit, [{ nodes: [{ id: 'a' }], duration: 400 }]); assert.deepEqual(high, ['clear', ['a']]);
  allowed = false; assert.equal(located.locateNode('a', group.groupId), false); assert.equal(fit.length, 1);
  const member = evaluate('g7', changed, after, { ...common, pt: 'OriginalMemberRow', x7: 'OriginalThumbnail' });
  let prevented = 0; member({ node: { id: 'a', label: '标题' }, onLocate: () => false }).props.onSelect({ preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  passed('actual p7 keeps original fitView/current node/highlights and actual g7 keeps rejected menu open; no Core coordinates or Surface switch', { originalFit: fit[0] });

  // Execute the production adapter hooks with an explicit controlled hook owner.
  // This checks closure payloads, not React lifecycle or provider integration.
  const calls = []; const api = { getNodes: () => nodes };
  let model = { enabled: true, projectId: 'p', canvasId: 'c', api, status: 'ready', busy: false, needsCheck: false, message: '', groups: [group],
    isCurrent: () => true, renameDefinition: async input => { calls.push(['rename', input]); return { status: 'confirmed' }; },
    clearCurrentGroup: async (...args) => { calls.push(['clear', ...args]); return { status: 'confirmed' }; }, verifyPending: async () => ({ status: 'confirmed' }), refresh: async () => {} };
  globalThis.window = { __LCOS_NODE_LAB__: { projectId: 'p', currentCanvasId: 'c', api } };
  const compiled = esbuild.transformSync(await fs.readFile(path.join(root, 'lab/pilot/native-colorpin-menu.tsx'), 'utf8'), { loader: 'tsx', format: 'cjs', jsxFactory: 'React.createElement' }).code;
  const menuModule = { exports: {} }, react = { ...hooks, createElement: jsx };
  new Function('require', 'module', 'exports', compiled)(specifier => {
    if (specifier === 'react') return react;
    if (specifier === './native-colorpin-port') return { useNativeColorPins: () => model };
    if (specifier.endsWith('lcosCoreClient')) return { createLcosCoreSession: () => ({}) };
    if (specifier === './native-colorpin-download') return { nativeColorPinDownloadRef: () => undefined };
    throw new Error('Unexpected adapter test dependency: ' + specifier);
  }, menuModule, menuModule.exports);
  const adapters = menuModule.exports;
  assert.equal(await adapters.useNativeColorPinNames('c').renameGroup('123ABC', ' 新名称 '), true);
  assert.deepEqual(calls[0], ['rename', { definitionId: 'definition', label: '新名称', expectedUpdatedAt: '1', expectedLabel: '项目素材' }]);
  const actions = adapters.useNativeColorPinMenuActions(); assert.equal(await actions.removeAllNodesFromGroup(group), true);
  assert.deepEqual(calls[1], ['clear', 'definition', { expectedMembershipIds: ['m1'], expectedCanvasId: 'c', expectedApi: api }]);
  model = { ...model, needsCheck: true, enabled: false }; assert.equal(adapters.useNativeColorPinBar().enabled, true);
  assert.equal(await adapters.useNativeColorPinNames('c').renameGroup('123ABC', 'again'), false); assert.equal(calls.length, 2);
  model = { ...model, needsCheck: false, enabled: true }; window.__LCOS_NODE_LAB__ = { projectId: 'p', currentCanvasId: 'c', api: {} };
  assert.equal(await adapters.useNativeColorPinMenuActions().removeAllNodesFromGroup(group), false); assert.equal(calls.length, 2);
  window.__LCOS_NODE_LAB__.api = api;
  const guard = adapters.useNativeColorPinLocate(['a'], group); assert.equal(guard.canLocate('a', '123ABC'), true);
  nodes[0].data.lcos_ref.revisionId = 'r2'; assert.equal(guard.canLocate('a', '123ABC'), false);
  passed('production UI adapters capture real definition CAS and exact confirmation memberships; unknown/API/ref changes refuse mutations/locate', { mutations: calls.length });

  const clearDescription = adapters.nativeColorPinClearDescription(group, '项目素材');
  assert.match(clearDescription, /当前画布/); assert.match(clearDescription, /其他位置/); assert.match(clearDescription, /节点、内容和颜色组都会保留/);
  let confirmation;
  const nativeActions = { busy: false, needsCheck: false, status: 'ready', verifyPending() {}, refresh() {} };
  const menuEnv = { ...common, LCOSUseNativeColorPinMenuActions: () => nativeActions,
    LCOSColorPinClearDescription: adapters.nativeColorPinClearDescription, LCOSColorPinMenuStatus: 'NativeStatus',
    p7: () => ({ locateNode() {}, nodeDisplays: [], notice: '' }), Dj: () => ({ triggerContainerRef: {}, closeTooltip() {}, handleTooltipOpenChange() {}, markPointerInteraction() {}, markKeyboardInteraction() {}, handleCloseAutoFocus() {} }),
    Ah: { confirm: value => { confirmation = value; } }, jw: 40,
    ...Object.fromEntries(['Ir', 'Pt', 'Tr', 'kr', 'zl', 'ja', 'md', 'Jr', 'iT', 'g7', 'pt', 'ka', 'oT'].map(name => [name, name])) };
  const menu = evaluate('m7', changed, after, menuEnv), cleared = [];
  let menuTree = menu({ group, open: true, canDownload: true, displayName: '项目素材', onOpenChange() {}, onDownload() {}, onRemoveAllNodes: value => cleared.push(value), onRenameName: async () => false });
  const scopeLabels = elements(menuTree).filter(row => row.type === 'span' && row.props.children === '项目共享'); assert.equal(scopeLabels.length, 1);
  const clearRow = elements(menuTree).find(row => row.type === 'pt' && row.props.children?.[1] === '移除此画布标记'); clearRow.props.onSelect();
  assert.equal(confirmation.title, '移除此画布的标记'); assert.match(confirmation.description, /其他位置/); confirmation.onConfirm(); assert.equal(cleared[0], group);
  nativeActions.needsCheck = true; menuTree = menu({ group, open: true, displayName: '项目素材', onOpenChange() {}, onDownload() {}, onRemoveAllNodes() {} });
  assert.ok(elements(menuTree).some(row => row.type === 'pt' && row.props.children?.[1] === '核对标记结果'));
  assert.equal(elements(menuTree).find(row => row.type === 'pt' && row.props.children?.[1] === '移除此画布标记').props.disabled, true);
  passed('actual original m7 shows project-shared inline scope and precise clear impact; captures entire group confirmation; pending retains original GET-check row', { description: confirmation.description });

  nativeActions.needsCheck = false;
  let renameAccepted = false, renameCalls = 0, stateCursor = 0; const renameSets = [];
  const renameHooks = { ...hooks, useState(value) { const index = stateCursor++; return [index === 0 ? true : index === 1 ? '原处新名字' : value, next => renameSets.push([index, next])]; } };
  const inlineMenu = evaluate('m7', changed, after, { ...menuEnv, l: renameHooks });
  const renderInline = () => { stateCursor = 0; return inlineMenu({ group, open: true, displayName: '项目素材', onOpenChange() {}, onDownload() {}, onRemoveAllNodes() {},
    onRenameName: async () => { renameCalls++; return renameAccepted; } }); };
  const inline = renderInline(); assert.equal(elements(inline).find(row => row.type === 'input').props['aria-label'], '颜色组名称（本项目）');
  assert.equal(elements(inline).filter(row => row.type === 'span' && row.props.children === '项目共享').length, 1);
  elements(inline).find(row => row.type === 'button' && typeof row.props.onClick === 'function').props.onClick();
  await Promise.resolve(); await Promise.resolve(); assert.equal(renameCalls, 1); assert.equal(renameSets.length, 0, 'Rejected rename keeps original input/draft open');
  renameAccepted = true; elements(renderInline()).find(row => row.type === 'button' && typeof row.props.onClick === 'function').props.onClick();
  await Promise.resolve(); await Promise.resolve(); assert.deepEqual(renameSets, [[0, false], [2, undefined]]);
  nativeActions.needsCheck = true; assert.equal(elements(renderInline()).find(row => row.type === 'input').props.readOnly, true);
  passed('actual original inline rename waits for confirmed receipt; rejection keeps input text, pending makes original input read-only and never re-submits', { failedDraftKept: true });

  const bundle = path.join(temp, 'download.mjs'); await buildPilotEntry('lab/pilot/native-colorpin-download.ts', bundle);
  await buildPilotEntry('lab/pilot/native-colorpin-menu.tsx', path.join(temp, 'menu.js'), 'browser', { nativeReact: true });
  const { downloadNativeColorPinGroup: download, nativeColorPinDownloadName: fileName } = await import(pathToFileURL(bundle));
  const fflate = require('fflate');
  const fixture = () => {
    const currentNodes = ['a', 'b'].map((id, index) => ({ id, data: { lcos_ref: { version: 1, entityType: 'view', entityId: 'view-' + id,
      artifactId: 'asset-' + id, artifactViewId: 'view-' + id, revisionId: 'history-' + id } } }));
    const graph = { project: { id: 'p' }, scopes: [{ id: 'scope', projectId: 'p' }],
      artifactViews: currentNodes.map(node => ({ id: node.data.lcos_ref.artifactViewId, artifactId: node.data.lcos_ref.artifactId, scopeId: 'scope', revisionId: node.data.lcos_ref.revisionId })),
      artifactRevisions: currentNodes.flatMap(node => ['history-', 'current-'].map(prefix => ({ id: prefix + node.id, artifactId: node.data.lcos_ref.artifactId,
        fileRecordId: prefix + 'file-' + node.id, contentHash: prefix + 'hash-' + node.id, status: prefix === 'history-' ? 'superseded' : 'current' }))),
      fileRecords: currentNodes.flatMap(node => ['history-', 'current-'].map(prefix => ({ id: prefix + 'file-' + node.id, projectId: 'p', mimeType: 'text/markdown',
        observedHash: prefix + 'hash-' + node.id, observedPath: 'controlled/' + node.id + '.md', availability: 'current' }))) };
    let live = true; const reads = [], saved = [];
    const session = { projects: { getProjectGraph: async () => { reads.push('graph'); return graph; } }, artifacts: {
      getArtifactDetail: async id => { reads.push(['detail', id]); return { artifact: { id, projectId: 'p', title: '同名材料', currentRevisionId: 'current-' + id.slice(-1) }, currentRevisionId: 'current-' + id.slice(-1) }; },
      getFileRecordContent: async (project, file) => { reads.push(['content', project, file]); return new Blob([file], { type: 'text/markdown' }); } } };
    return { currentNodes, graph, reads, saved, session, input: { projectId: 'p', nodeIds: ['a', 'b'], api: { getNodes: () => currentNodes }, label: '项目素材.v2', isCurrent: () => live },
      stop() { live = false; }, save: async (blob, name) => saved.push({ blob, name }) };
  };
  let f = fixture(), result = await download(f.input, { session: f.session, save: f.save });
  assert.equal(result.success, true); assert.equal(f.saved.length, 1); assert.equal(f.saved[0].name, '项目素材.v2.zip');
  const zip = fflate.unzipSync(new Uint8Array(await f.saved[0].blob.arrayBuffer())); assert.deepEqual(Object.keys(zip), ['同名材料.md', '同名材料 (2).md']);
  assert.equal(new TextDecoder().decode(zip['同名材料.md']), 'history-file-a');
  assert.equal(new TextDecoder().decode(zip['同名材料 (2).md']), 'history-file-b');
  assert.ok(f.reads.filter(row => Array.isArray(row) && row[0] === 'content').every(row => row[2].startsWith('history-')));
  assert.equal(fileName('图像', 'image/png'), '图像.png'); assert.equal(fileName('../../危险/名', 'application/octet-stream', 'thing.glb'), '.._.._危险_名.glb');
  passed('production group download reads exact pinned historical FileRecords, one ZIP preserves title/extensions and duplicate names without Current or multi-download permission tricks', { downloadedNames: Object.keys(zip), groupArchive: f.saved[0].name });

  for (const failure of ['wrong-view', 'hash-mismatch', 'missing-file', 'late-scene', 'late-ref']) {
    f = fixture(); f.input.nodeIds = ['a'];
    if (failure === 'wrong-view') f.graph.artifactViews[0].artifactId = 'foreign';
    if (failure === 'hash-mismatch') f.graph.fileRecords[0].observedHash = 'wrong';
    if (failure === 'missing-file') f.graph.fileRecords.shift();
    if (failure.startsWith('late')) f.session.artifacts.getFileRecordContent = async () => {
      if (failure === 'late-scene') f.stop(); else f.currentNodes[0].data.lcos_ref.revisionId = 'later';
      return new Blob(['must not save']);
    };
    result = await download(f.input, { session: f.session, save: f.save }); assert.equal(result.success, false, failure); assert.equal(f.saved.length, 0, failure);
  }
  f = fixture(); f.currentNodes.push({ id: 'not-file', data: {} }); f.input.nodeIds.push('not-file');
  result = await download(f.input, { session: f.session, save: f.save }); assert.equal(result.success, false); assert.equal(result.downloadableNodeCount, 2); assert.match(result.message, /1 项未确认/); assert.equal(f.saved.length, 1);
  passed('download refuses foreign View/hash/missing file/scene or ref change; non-file members remain explicitly reported while valid exact files download', { rejectedCases: 5, partialMemberCount: 1 });
  assert.equal(await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', filename), 'utf8'), original);
  report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); throw error; }
finally {
  delete globalThis.window;
  await fs.writeFile(path.join(output, '原组菜单与准确下载测试.json'), JSON.stringify(report, null, 2));
  if (path.dirname(temp) === path.join(root, '.runtime') && path.basename(temp).startsWith('native-colorpin-page-')) await fs.rm(temp, { recursive: true, force: true });
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, output: path.join(output, '原组菜单与准确下载测试.json') }));
