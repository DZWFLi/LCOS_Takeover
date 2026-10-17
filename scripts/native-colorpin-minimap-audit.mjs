import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeColorPinCourseScript as transform } from '../lab/native-colorpin-course-transform.mjs';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/原生ColorPin整合_20261017h');
const assetRoot = path.join(root, 'reference/tapnow-installed/resources/web/assets');
const courseName = 'course-api-base-url-CifxI1ia.js';
const walk = (node, fn) => { if (!node?.type) return; fn(node); for (const value of Object.values(node))
  if (Array.isArray(value)) value.forEach(child => walk(child, fn)); else if (value?.type) walk(value, fn); };
const declarations = ast => ast.body.flatMap(node => node.type === 'FunctionDeclaration' ? [node]
  : node.type === 'VariableDeclaration' ? node.declarations : []);
const ownerMap = ast => new Map(declarations(ast).map(node => [node.id?.name, node]));
const exportedLocal = (ast, name) => ast.body.filter(node => node.type === 'ExportNamedDeclaration')
  .flatMap(node => node.specifiers).find(specifier => specifier.exported?.name === name)?.local.name;
const importedLocal = (ast, file, name) => ast.body.filter(node => node.type === 'ImportDeclaration' && node.source.value.endsWith(file))
  .flatMap(node => node.specifiers).find(specifier => specifier.imported?.name === name)?.local.name;
const referencedOwners = (ast, local) => declarations(ast).filter(node => {
  let found = false; walk(node, child => { if (child.type === 'Identifier' && child.name === local && child !== node.id) found = true; }); return found;
}).map(node => node.id.name);
const entries = (source, ast, names) => Object.fromEntries(names.map(name => {
  const node = ownerMap(ast).get(name); return [name, node ? { start: node.start, end: node.end, source: source.slice(node.start, node.end) } : { absent: true }];
}));
const evaluate = (source, ast, name, env) => {
  const node = ownerMap(ast).get(name), code = source.slice(node.start, node.end);
  return new Function(...Object.keys(env), 'return (' + (node.type === 'VariableDeclarator' ? code.slice(name.length + 1) : code) + ');')(...Object.values(env));
};
const createStore = initializer => { let state; const set = update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; };
  state = initializer(set); const store = selector => selector(state); store.getState = () => state; return store; };

await fs.mkdir(output, { recursive: true });
const course = await fs.readFile(path.join(assetRoot, courseName), 'utf8'), courseAst = parse(course, courseName);
const changed = transform(courseName, course), changedAst = parse(changed, courseName);
const pageName = 'page-Da_DfwiK.js', page = await fs.readFile(path.join(assetRoot, pageName), 'utf8'), pageAst = parse(page, pageName);
const controlsName = 'UnlimitedModeToggle-D4wysAbz.js', controls = await fs.readFile(path.join(assetRoot, controlsName), 'utf8'), controlsAst = parse(controls, controlsName);
const pageMinimap = importedLocal(pageAst, courseName, 'M'), controlsMinimap = exportedLocal(controlsAst, 'eP');
const highlightStore = exportedLocal(controlsAst, 'bu');
const pageCallers = referencedOwners(pageAst, pageMinimap);
const controlsOwners = [...new Set([controlsMinimap, highlightStore, 'ag', 'AE', 'CE', 'TE', 'EE', 'IE', 'wE', 'Bl', 'ME', 'SE', 'PE', 'RE', ...referencedOwners(controlsAst, controlsMinimap)])];
const report = {
  scope: 'Read-only original owners and production transform; no candidate, Core, browser or mutation',
  pageMinimap, pageCallers, controlsMinimap, highlightStore,
  course: entries(course, courseAst, ['UVe', 'yBe', 'Mie', 'KT', 'pBe', 'vBe', 'bBe', 'V0', 'fBe', 'gBe', 'sF', 'rF', 'mBe', 'O0', 'iv', 'av']),
  page: entries(page, pageAst, pageCallers), controls: entries(controls, controlsAst, controlsOwners),
  changed: entries(changed, changedAst, ['pBe', 'yBe', 'UVe']), checks: [], passed: false,
};
assert.equal(report.course.yBe.source, report.changed.yBe.source);
assert.equal(report.course.UVe.source, report.changed.UVe.source);
assert.ok(!report.course.yBe.source.includes('MF('));
assert.ok(report.changed.pBe.source.includes('LCOSUseNativeColorPinGroups(Ms(t))'));
report.checks.push('actual yBe has no MF/pin policy read; production pBe uses the single native Core projection, original UVe/yBe unchanged');
const temp = await fs.mkdtemp(path.join(root, '.runtime/native-pin-minimap-'));
try {
  const modelFile = path.join(temp, 'model.mjs'); await buildPilotEntry('lab/pilot/native-colorpin-model.ts', modelFile);
  const { projectNativePins } = await import(pathToFileURL(modelFile));
  const nodes = ['one', 'two'].map((id, index) => ({ id, type: 'text', position: { x: index * 400, y: 0 }, measured: { width: 360, height: 250 },
    data: { id, lcos_ref: { version: 1, entityType: 'view', entityId: 'v' + id, artifactId: 'artifact', artifactViewId: 'v' + id, revisionId: 'revision' } } }));
  const projection = projectNativePins({ projectId: 'p', canvasId: 'c', workspaceId: 'w', api: {}, nodes }, {
    snapshot: { definitions: [{ id: 'custom', projectId: 'p', color: '#123ABC', label: '原自定义色', createdAt: '0', updatedAt: '1' }],
      memberships: [{ id: 'm', projectId: 'p', colorPinId: 'custom', targetRef: { projectId: 'p', kind: 'view', id: 'vone' }, createdAt: '0', updatedAt: '1' }] },
    graph: { project: { id: 'p' }, scopes: [{ id: 's', projectId: 'p' }], artifacts: [{ id: 'artifact', projectId: 'p' }],
      artifactRevisions: [{ id: 'revision', artifactId: 'artifact' }], artifactViews: nodes.map(node => ({ id: 'v' + node.id, scopeId: 's', artifactId: 'artifact', revisionId: 'revision' })) },
    bindings: nodes.map(node => ({ projectId: 'p', canvasId: 'c', spatialKind: 'node', spatialId: node.id, entityType: 'view', entityId: 'v' + node.id })),
  });
  const jsx = (type, props) => ({ type, props }), d = { memo: fn => fn, useMemo: fn => fn(), useCallback: fn => fn, useRef: current => ({ current }), useEffect() {} };
  const Mie = evaluate(course, courseAst, 'Mie', { Jn: createStore });
  const KT = evaluate(course, courseAst, 'KT', { Mie });
  let nativeGroups = projection.groups, highlightedNodes = new Set();
  const pBe = evaluate(changed, changedAst, 'pBe', { d, eF: [], Poe: () => '', Foe: () => [], Ms: selector => selector({ nodes }),
    LCOSUseNativeColorPinGroups: original => nativeGroups ?? original });
  const motion = value => ({ get: () => value, set() {}, jump() {}, on: () => () => {} });
  const yBe = evaluate(course, courseAst, 'yBe', { d, _t: () => ({ setViewport() {}, getViewport: () => ({ x: 0, y: 0, zoom: 1 }) }),
    Ms: selector => selector({ nodes, width: 1000, height: 800, transform: [0, 0, 1] }), bu: fn => fn,
    vBe: evaluate(course, courseAst, 'vBe', {}), Cx: selector => selector({ nodeIds: highlightedNodes }), pBe, KT,
    bBe: () => ({ x: 0, y: 0, width: 760, height: 250 }), V0: evaluate(course, courseAst, 'V0', {}),
    fBe: 'selected-fill', sF: 'neutral-fill', mBe: 'selected-class', gBe: 'selected-stroke', rF: 'neutral-stroke', tF: 200, nF: 150,
    Ak: motion, Pd: motion, a: { jsx, jsxs: jsx }, B7: 'OriginalMiniMap', Un: { div: 'OriginalMotionViewport' } });
  const miniMapProps = () => yBe().props.children[0].props.children[0].props;
  assert.equal(miniMapProps().nodeColor(nodes[0]), 'neutral-fill', 'Original no-open-group behavior remains neutral');
  Mie.getState().setGroupOpen('123ABC', true);
  let props = miniMapProps(); assert.equal(props.nodeColor(nodes[0]), '#123ABC'); assert.equal(props.nodeStrokeColor(nodes[0]), '#123ABC');
  assert.equal(props.nodeColor(nodes[1]), 'neutral-fill', 'Other occurrence of same artifact stays neutral');
  nativeGroups = null; assert.equal(miniMapProps().nodeColor(nodes[0]), 'neutral-fill', 'Counterfactual old pp-only groups do not find managed Core colors');
  nativeGroups = projection.groups; highlightedNodes = new Set(['one']); assert.equal(miniMapProps().nodeColor(nodes[0]), 'selected-fill');
  highlightedNodes = new Set(); props = miniMapProps();
  const wE = evaluate(controls, controlsAst, 'wE', { h: { jsx }, Ge: values => values.filter(v => typeof v === 'string').join(' ') });
  const lookup = new Map(nodes.map(node => [node.id, { internals: { userNode: node, positionAbsolute: node.position } }]));
  const IE = evaluate(controls, controlsAst, 'IE', { ce: selector => selector({ nodeLookup: lookup }), ke: undefined, nn: node => node.measured,
    am: () => true, h: { jsx } });
  const rectProps = IE({ id: 'one', nodeColorFunc: props.nodeColor, nodeStrokeColorFunc: props.nodeStrokeColor, nodeClassNameFunc: props.nodeClassName,
    nodeBorderRadius: 4, nodeStrokeWidth: 1, NodeComponent: wE, shapeRendering: 'crispEdges' }).props;
  const rect = wE(rectProps); assert.equal(rect.type, 'rect'); assert.equal(rect.props.style.fill, '#123ABC'); assert.equal(rect.props.style.stroke, '#123ABC');
  report.svg = { type: rect.type, className: rect.props.className, style: rect.props.style, width: rect.props.width, height: rect.props.height };
  report.checks.push('production projectNativePins exact custom-color View → actual transformed pBe → actual Mie/KT → original yBe callbacks → original IE/wE SVG rect fill and stroke #123ABC; no MF true supplied');
  report.checks.push('original unfiltered neutral, original highlightedNodes blue priority and same-artifact other-View neutrality retained; counterfactual missing native groups produces neutral');
  const O0 = evaluate(course, courseAst, 'O0', { Jn: createStore }); let track;
  const UVe = evaluate(course, courseAst, 'UVe', { Me: () => ({ t: text => text }), Ms: selector => selector({ nodes }), O0, 'a$': () => false, d,
    Cx: selector => selector({ nodeIds: new Set() }), a: { jsx, jsxs: jsx, Fragment: 'OriginalFragment' },
    Nn: { canvas: { trackCanvasViewControlClicked: (...args) => track = args } }, iv: 'original-minimap-trigger', 'l$': 'OriginalIcon', ee: (...values) => values.filter(Boolean).join(' '),
    av: 'original-hover-surface', l9: 'OriginalHoverIcon', Hs: 'OriginalLockWrapper', wi: 'OriginalTooltip', yBe: 'OriginalMinimapContainer' });
  let control = UVe({ children: trigger => trigger }); assert.equal(control.props.children[0], false);
  const tooltip = control.props.children[1]; assert.equal(tooltip.props.tooltip, 'canvas.minimap.open');
  tooltip.props.children.props.onClick(); assert.equal(O0.getState().isOpen, true); assert.deepEqual(track, ['minimap', true]);
  control = UVe({ children: trigger => trigger }); assert.equal(control.props.children[0].type, 'OriginalMinimapContainer');
  assert.equal(control.props.children[1].props.children.props['data-active'], true);
  report.checks.push('actual original UVe trigger clicks the original O0 store and mounts original yBe; tooltip/open data-active chain executed, no extra control or UI store');
} finally {
  if (path.dirname(temp) === path.join(root, '.runtime') && path.basename(temp).startsWith('native-pin-minimap-')) await fs.rm(temp, { recursive: true, force: true });
}
report.passed = true;
await fs.writeFile(path.join(output, '小地图Pin原链只读摘录.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, pageMinimap, pageCallers, controlsMinimap, controlsOwners,
  output: path.join(output, '小地图Pin原链只读摘录.json') }));
