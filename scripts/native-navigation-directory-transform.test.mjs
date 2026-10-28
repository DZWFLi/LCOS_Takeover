import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeNavigationDirectoryScript as transform } from '../lab/native-navigation-directory-transform.mjs';
import { transformNativeColorPinPageScript } from '../lab/native-colorpin-page-transform.mjs';
import { transformNativeLightThemeScript } from '../lab/native-light-theme-transform.mjs';
import { transformNativeNavigationCourseScript } from '../lab/native-navigation-course-transform.mjs';

const filename = 'page-Da_DfwiK.js', courseFile = 'course-api-base-url-CifxI1ia.js';
const read = file => fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/' + file, import.meta.url), 'utf8');
const original = read(filename), course = read(courseFile), changed = transform(filename, original);
const changedCourse = transform(courseFile, course);
const owners = (source, file = filename) => new Map(parse(source, file).body.flatMap(node => node.type === 'FunctionDeclaration' ? [[node.id.name, node]]
  : node.type === 'VariableDeclaration' ? node.declarations.map(value => [value.id?.name, value]) : []));
const before = owners(original), after = owners(changed), originalCourseOwners = owners(course, courseFile), courseOwners = owners(changedCourse, courseFile);
const declaration = (source, map, name) => {
  const node = map.get(name); assert.ok(node, name + ' actual owner');
  return (node.type === 'VariableDeclarator' ? 'var ' : '') + source.slice(node.start, node.end) + ';';
};
assert.equal(transform(filename, changed), changed);
assert.equal(transform('other.js', original), original);
assert.equal(transform('assets/' + filename, original), changed);
for (const [name, node] of before) if (name !== 'H7') {
  const kept = after.get(name); assert.equal(changed.slice(kept.start, kept.end), original.slice(node.start, node.end), name + ' unchanged');
}
const entrySource = 'r.jsxs(r.Fragment,{children:[_e,r.jsx(LCOSNativeNavigationDirectoryEntry,{canvasId:e,disabled:ye,NativeButton:gs,NativePopover:pr})]})';
const changedH7 = changed.slice(after.get('H7').start, after.get('H7').end);
assert.equal(changedH7.replace(entrySource, '_e').replace(',"data-native-navigation-bottom-row":true', ''), original.slice(before.get('H7').start, before.get('H7').end), 'H7 changes only one original leftSlot and a DOM row tag');
assert.equal(transform(courseFile, changedCourse), changedCourse);
for (const [name, node] of originalCourseOwners) if (name !== 'xBe') {
  const kept = courseOwners.get(name); assert.equal(changedCourse.slice(kept.start, kept.end), course.slice(node.start, node.end), name + ' original course owner retained');
}
const adaptedCamera = changedCourse.slice(courseOwners.get('xBe').start, courseOwners.get('xBe').end);
assert.equal(adaptedCamera.replace(',"data-native-navigation-camera-pill":true', '').replace(',"data-native-navigation-zoom":true', ''),
  course.slice(originalCourseOwners.get('xBe').start, originalCourseOwners.get('xBe').end), 'xBe changes only two DOM tags');
assert.equal((changed.match(/createPortal\(/g) ?? []).length, (original.match(/createPortal\(/g) ?? []).length, 'no extra portal/window implementation');
assert.throws(() => transform(filename, original.replace('leftSlot:_e,hideFitView:q', 'leftSlot:null,hideFitView:q')), /leftSlot changed/);
assert.throws(() => transform(filename, original.replace('H7=({canvasId:e,', 'H7=({differentId:e,')), /canvas props changed/);
assert.throws(() => transform(filename, original + '\nconst LCOSNativeNavigationDirectoryEntry=0;'), /partially installed/);

const elements = tree => {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...elements(tree.props?.children)];
};
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const updates = [], calls = [], menuCalls = [];
const hooks = { Fragment: 'OriginalFragment', useState: value => [typeof value === 'function' ? value() : value, value => updates.push(value)],
  useRef: value => ({ current: value }), useEffect() {}, useCallback: value => value };
let tutorial = false, minimapHidden = false, minimapLocked = false, narrowDevice = false, minimapOpen = false;
const can = { fitView: false, zoomSlider: false, snapToGrid: false };
const t = value => value;
const originalButton = function NativeButton(props) { return jsx('OriginalButtonLeaf', props); };
const originalPopover = function NativePopover(props) { return jsx('OriginalPopoverLeaf', props); };
const directory = function LCOSNativeNavigationDirectoryEntry(props) {
  menuCalls.push(props);
  return jsx(props.NativePopover, { trigger: jsx(props.NativeButton, { disabled: props.disabled, 'aria-label': '已固定', onClick: () => calls.push('directory-open') }),
    children: 'Controlled directory contents' });
};
const env = {
  r: { jsx, jsxs: jsx, Fragment: 'OriginalFragment' }, l: hooks, a: { jsx, jsxs: jsx, Fragment: 'OriginalFragment' }, d: hooks,
  window: { location: { host: '127.0.0.1:56311' } }, he: () => ({ t }), Me: { CANVAS: { EDITOR: { TOOLBAR: 'original-toolbar', FIT_VIEW_BTN: 'original-fit' }, SHARE: { JOIN_COMMUNITY_BTN: 'original-join-community' } } },
  ie: (...values) => values.filter(Boolean).join(' '), ee: (...values) => values.filter(Boolean).join(' '),
  wT: () => [''], Hs: () => ({ openSettingsModal() {} }), oo: () => ({ isActive: false }), Ht: () => ({ isActive: false }),
  kd: () => ({ isActive: false }), Ma: () => ({ isActive: false }), $e: () => ({ setNodes() {}, addNodes() {} }),
  Nt: select => select({ nodes: [] }), zv: () => ({ getNextPosition() {}, moveToPosition() {} }),
  of: select => select({ isOpen: false, close() {} }), wt: select => select({ isOpen: false, close() {}, openElementLibrary() {} }),
  nr: () => false, rr: () => false, vv: () => undefined, Mo: key => key === 'minimap' ? minimapLocked : !!can[key],
  Bn: key => key === 'minimap' ? minimapHidden : false, kv: () => ({ creditsVisible: false }), _T: () => [], ST: () => [], bv: () => ({ min: .1, max: 4 }),
  St: select => select({}), Uv: () => undefined, Oj: select => select({ badges: {} }), $l: select => select({ actionsByPlugin: {} }),
  to: select => select({ open: false, relatedNodeIds: [], close() {} }), Bj: () => false, Td: () => ({ isInTutorialCanvas: false, isShowingTutorial: false }),
  Ua: 'OriginalTutorialAtom', xn: () => tutorial, ZC() {}, Vj: () => false, lo: { min: .1, max: 4 }, rd: {}, id: 'original-control',
  mt: { div: 'OriginalMotion' }, MeTutorial: () => {}, gs: originalButton, pr: originalPopover, LCOSNativeNavigationDirectoryEntry: directory,
  fp: () => 1, fM: select => select({ snapToGrid: false, toggleSnapToGrid: () => calls.push('grid') }),
  Fb: select => select({ edgesVisible: true, setEdgesVisible() {}, toggleEdgesVisibility: () => calls.push('edges') }),
  _t: () => ({ zoomTo: value => calls.push(['zoom', value]), fitView: value => calls.push(['fit', value]) }), Qs: () => false,
  Gl: { min: .1, max: 4 }, fn: { CANVAS: { EDITOR: { FIT_VIEW_BTN: 'original-fit' } } },
  Nn: { canvas: { trackCanvasViewControlClicked() {}, trackCanvasZoomControlClicked() {} } },
  Ms: select => select({ nodes: [] }), O0: Object.assign(select => select({ isOpen: minimapOpen, setOpen: value => { minimapOpen = value; } }), { getState: () => ({ toggle: () => { minimapOpen = !minimapOpen; } }) }),
  a$: () => narrowDevice, Cx: select => select({ nodeIds: new Set() }),
};
for (const name of ['P7','DB','c7','Di','qt','fH','jF','l9','w9','iU','v7','I7','UH','V7','CT','IH','TH','FH','F7','Wj','E7','wE','H9','fV','Or','Ts','W9','gP','lE','k7','j7','ZB',
  '$i','c$','c9','h$','p$','d$','d9','Ol','br','vr','yr','wi','l$','l9','yBe','u$']) env[name] ??= 'Original:' + name;
function walk(node, visit) {
  if (!node?.type) return; visit(node);
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(child => walk(child, visit));
  else if (value?.type) walk(value, visit);
}
walk(after.get('H7'), node => {
  if (node.type === 'CallExpression' && node.callee?.object?.name === 'r' && ['jsx','jsxs'].includes(node.callee.property?.name)
    && node.arguments[0]?.type === 'Identifier') env[node.arguments[0].name] ??= 'Original:' + node.arguments[0].name;
});
// The course and page each import a different Me alias. Execute their untouched
// bodies in separate contexts, exactly as the real modules do.
const courseEnv = { ...env, Me: () => ({ t }) };
const courseContext = vm.createContext(courseEnv);
vm.runInContext(['iv', 'av', 'hBe', 'UVe', 'xBe'].map(name => declaration(changedCourse, courseOwners, name)).join('\n'), courseContext);
env.Hj = courseContext.UVe; env.Gj = courseContext.xBe;
const context = vm.createContext(env);
vm.runInContext(declaration(changed, after, 'H7'), context);
function cameraTree(canvasId = 'surface-core-main') {
  const tree = context.H7({ canvasId });
  const panels = elements(tree).filter(node => node.type === 'Original:Di' && node.props['data-pile-gallery-chrome'] === 'bottom-left');
  assert.equal(panels.length, 1);
  const wrapper = panels[0].props.children; assert.equal(wrapper.type, courseContext.UVe);
  const originalMinimapTree = wrapper.type(wrapper.props);
  const cameras = elements(originalMinimapTree).filter(node => node.type === courseContext.xBe); assert.equal(cameras.length, 1);
  const camera = cameras[0], controls = camera.type(camera.props);
  const entries = elements(controls).filter(node => node.type === directory); assert.equal(entries.length, 1);
  return { tree, panel: panels[0], wrapper, originalMinimapTree, camera, controls, entry: entries[0] };
}
let result = cameraTree();
assert.equal(result.entry.props.canvasId, 'surface-core-main'); assert.equal(result.entry.props.disabled, false);
assert.equal(result.entry.props.NativeButton, originalButton); assert.equal(result.entry.props.NativePopover, originalPopover);
assert.deepEqual(Object.keys(result.camera.props).sort(), ['leftSlot','hideFitView','hideSnapToGrid','hideZoomSlider','hideEdgeVisibilityControl','lockFitView','lockSnapToGrid','lockZoomSlider','zoomBounds'].sort());
assert.equal(result.camera.props.leftSlot.type, 'OriginalFragment');
assert.equal(elements(result.controls).filter(node => node.props?.['data-native-navigation-camera-pill']).length, 1);
assert.equal(elements(result.controls).filter(node => node.props?.['data-native-navigation-zoom']).length, 1);
assert.equal(elements(result.originalMinimapTree).filter(node => node.props?.['data-native-navigation-bottom-row']).length, 1);
assert.equal(result.camera.props.leftSlot.props.children[1], result.entry, 'entry lives in original camera leftSlot');
const minimap = elements(result.controls).find(node => node.type === 'button' && node.props['data-active'] === undefined && !node.props.type);
assert.ok(minimap, 'actual original UVe minimap button retained'); minimap.props.onClick(); assert.equal(minimapOpen, true);
const buttons = elements(result.controls).filter(node => node.type === 'button');
buttons.find(node => node.props['aria-label'] === 'canvas.zoomSlider.snapToGrid').props.onClick();
buttons.find(node => node.props['aria-label'] === 'canvas.zoomSlider.hideNodeConnections').props.onClick();
buttons.find(node => node.props['data-testid'] === 'original-fit').props.onClick();
const slider = elements(result.controls).find(node => node.type === 'Original:Ol');
slider.props.onValueChange([1.5]); assert.deepEqual(JSON.parse(JSON.stringify(calls)), ['grid','edges',['fit',{ duration: 300 }],['zoom',1.5]]);
const mounted = directory(result.entry.props); assert.equal(mounted.type, originalPopover);
assert.equal(mounted.props.trigger.type, originalButton); mounted.props.trigger.props.onClick(); assert.equal(calls.at(-1), 'directory-open');
assert.ok(elements(result.originalMinimapTree).some(node => node.type === 'Original:UH'), 'help remains sibling in original row');
assert.ok(elements(result.originalMinimapTree).some(node => node.type === 'Original:I7'), 'existing sibling control remains');
minimapHidden = true; result = cameraTree('nested-canvas');
assert.equal(result.camera.props.leftSlot.props.children[0], null); assert.equal(result.entry.props.canvasId, 'nested-canvas', 'minimap hiding does not hide directory');
minimapHidden = false; narrowDevice = true; result = cameraTree(); assert.equal(result.camera.props.leftSlot.props.children[0], null, 'native device-hidden minimap preserved');
narrowDevice = false; minimapLocked = true; result = cameraTree(); assert.equal(result.wrapper.props.locked, true); assert.equal(result.entry.props.disabled, false, 'minimap-only lock does not lock unrelated directory');
tutorial = true; result = cameraTree(); assert.equal(result.panel.props['aria-disabled'], true); assert.equal(result.entry.props.disabled, true, 'whole original tutorial protection retained');
Object.assign(can, { fitView: true, zoomSlider: true, snapToGrid: true }); result = cameraTree();
assert.equal(result.camera.props.lockFitView, true); assert.equal(result.camera.props.lockZoomSlider, true); assert.equal(result.camera.props.lockSnapToGrid, true);

const composed = transformNativeLightThemeScript(filename, transform(filename, transformNativeColorPinPageScript(filename, original)));
parse(composed, filename); assert.equal(transform(filename, composed), composed);
parse(transformNativeLightThemeScript(courseFile, transform(courseFile, transformNativeNavigationCourseScript(courseFile, course))), courseFile);
const server = fs.readFileSync(new URL('../lab/server.mjs', import.meta.url), 'utf8');
assert.match(server, /nativeNavigationDirectoryTransform = await import\('\.\/native-navigation-directory-transform\.mjs'\)/);
assert.match(server, /const navigationDirectory = nativeRailPilot \? nativeNavigationDirectoryTransform\.transformNativeNavigationDirectoryScript\(path\.basename\(file\), colorPinPage\) : colorPinPage;/);
assert.match(server, /transformNativeFileUploadScript\(path\.basename\(file\), navigationDirectory\)/);
assert.equal(read(filename), original); assert.equal(read(courseFile), course);
console.log(JSON.stringify({ passed: true, scope: 'Actual original H7 → UVe → xBe execution with controlled React/store descriptors; original Button/Popover identities forwarded. No browser, service, model or DB mutation.',
  checks: ['only H7.leftSlot modified', 'original minimap/camera/help siblings retained', 'actual minimap/grid/edges/fit/zoom handlers reachable',
    'one directory in original camera pill', 'canvas identity and original gs/pr leaves passed', 'minimap hidden/device/lock independent',
    'whole tutorial protection and camera locks retained', 'page ColorPin→directory→light parses', 'formal server stage wired', 'vendor sources unchanged'] }));
