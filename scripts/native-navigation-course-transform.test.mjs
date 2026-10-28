import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeNavigationCourseScript as transform } from '../lab/native-navigation-course-transform.mjs';

const filename = 'course-api-base-url-CifxI1ia.js';
const original = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/' + filename, import.meta.url), 'utf8');
const changed = transform(filename, original);
const noticeImport = parse(original, filename).body.filter(node => node.type === 'ImportDeclaration'
  && /(?:^|\/)index-BAQXnPag\.js$/.test(node.source.value)).flatMap(node => node.specifiers)
  .filter(node => node.type === 'ImportSpecifier' && node.imported?.name === 'al');
assert.equal(noticeImport.length, 1, 'original shared Rt export is unambiguous');
const originalNoticeAlias = noticeImport[0].local.name;
assert.equal(transform(filename, changed), changed);
assert.equal(transform('other.js', original), original);
const owners = source => new Map(parse(source, filename).body.flatMap(node => node.type === 'FunctionDeclaration' ? [[node.id.name, node]]
  : node.type === 'VariableDeclaration' ? node.declarations.map(value => [value.id?.name, value]) : []));
const before = owners(original), after = owners(changed);
for (const [name, node] of before) if (!['Vde', 'gw'].includes(name)) {
  const kept = after.get(name);
  assert.equal(changed.slice(kept.start, kept.end), original.slice(node.start, node.end), name + ' original owner retained');
}
const sourceOf = name => { const node = after.get(name); return changed.slice(node.start, node.end); };
const originalVisibility = original.slice(before.get('gw').start, before.get('gw').end);
const priorityInsertion = 'const LCOSNavigationVisibility=LCOSUseNativeNavigationVisibility(e);';
let restoredVisibility = sourceOf('gw');
for (const [adapted, native] of [
  [priorityInsertion, ''], ['(r.current||LCOSNavigationVisibility)', 'r.current'],
  ['[s,o,LCOSNavigationVisibility]', '[s,o]'], ['(o||(LCOSNavigationVisibility&&s))', 'o'],
]) {
  assert.equal(restoredVisibility.split(adapted).length, 2, 'one exact visibility seam: ' + adapted);
  restoredVisibility = restoredVisibility.replace(adapted, native);
}
assert.equal(restoredVisibility, originalVisibility, 'gw changes only priority read, native first-entry branch, effect dependency and final return');
assert.match(changed, /^import\{LCOSUseNativeNavigationNode,LCOSUseNativeNavigationVisibility,LCOSUseNativeNodeComposer,LCOSOpenNativeNavigationDirectory\}from"\/lcos\/agent-ui.js";/);
const calls = [], originalCalls = [], hookIds = [], manageCallbacks=[];
const state = { canPin: true, pinned: false, busy: false, notice: '', canEmphasize: true, canLocate: true, emphasized: false,
  togglePin: () => calls.push('pin'), toggleEmphasis: () => calls.push('emphasis'), locate: () => calls.push('locate') };
const composer={supported:false,canUse:false,busy:false,notice:'',useForCurrentInput:()=>calls.push('use-input')},composerIds=[];
const noticePorts = [], originalNotice = Object.assign(() => 'original-notice-id', { dismiss() {} });
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const context = vm.createContext({ a: { jsx, jsxs: jsx }, d: { Fragment: 'Fragment', useState: value => [value, () => {}] },
  EL: () => ({ isNodeToolbarHighlighting: () => false }), fp: () => 1, id: () => null,
  LCOSUseNativeNavigationNode: (nodeId,manage) => { hookIds.push(nodeId);manageCallbacks.push(manage); return state; },
  LCOSOpenNativeNavigationDirectory:(...args)=>calls.push(['directory',...args]),
  [originalNoticeAlias]: originalNotice,
  LCOSUseNativeNodeComposer: (nodeId, notice) => { composerIds.push(nodeId); noticePorts.push(notice); return composer; },
  ee: (...values) => values.filter(Boolean).join(' '), fn: { CANVAS: { NODE: { TOOLBAR: 'original-node-toolbar' } } },
  $i: 'OriginalTooltipProvider', tO: 'OriginalMoreIcon', ak: () => false, Fo: value => value,
  _n: 'OriginalTooltip', Ra: 'OriginalButton', ea: 'OriginalMenu', Ci: 'OriginalMenuTrigger', ta: 'OriginalMenuContent',
  co: 'OriginalMenuItem', kF: 'OriginalSeparator', Ut: 'OriginalFallbackButton' });
vm.runInContext(sourceOf('Hde') + ';' + sourceOf('LCOSNativeNavigationTools') + ';' + sourceOf('Vde') + ';', context);
const nodes = (tree, predicate) => { const found = []; const walk = value => {
  if (Array.isArray(value)) return value.forEach(walk); if (!value || typeof value !== 'object') return;
  if (predicate(value)) found.push(value); walk(value.props?.children);
}; walk(tree); return found; };
const more = tree => nodes(tree, node => node.type === context.Hde && node.props.buttonType === 'more').map(node => context.Hde(node.props));
const rows = tree => more(tree).flatMap(menu => nodes(menu, node => node.type === 'OriginalMenuItem'));
const label = row => row.props.children?.[1];
const click = (tree, text) => { const row = rows(tree).find(item => label(item) === text);
  assert.ok(row, text + ' reachable through actual Vde→Hde→MenuItem'); assert.equal(Boolean(row.props.disabled), false);
  row.props.onClick({ currentTarget: { text }, preventDefault() { throw new Error('Unexpected locked action'); } }); };
const copy = { key: 'copy', node: jsx('CopyIcon'), handle: () => originalCalls.push('copy'), tooltip: '复制' };
let tree = context.Vde({ nodeId: 'text-node', tools: [[copy]] });
assert.deepEqual(hookIds, ['text-node']);
assert.deepEqual(composerIds,['text-node']);
assert.equal(noticePorts[0], originalNotice, 'Vde passes the same original callable toast with its dismiss API');
assert.deepEqual(rows(tree).map(label), ['固定到导航', '强调', '定位']);
click(tree, '固定到导航'); click(tree, '强调'); click(tree, '定位');
assert.deepEqual(calls, ['pin', 'emphasis', 'locate']); assert.equal(more(tree).length, 1);
assert.equal(nodes(tree, node => node.type === 'OriginalTooltipProvider').length, 1);
const originalItem = { key: 'original-image-action', label: '原图片动作', handle: () => originalCalls.push('image') };
const existingMore = { key: 'more', buttonType: 'more', node: jsx('OriginalMoreIcon'), tooltip: '更多', onOpen: () => originalCalls.push('open'), menuItems: [originalItem] };
const tools = [[copy, existingMore]];
tree = context.Vde({ nodeId: 'image-node', tools });
assert.equal(more(tree).length, 1); assert.deepEqual(rows(tree).map(label), ['原图片动作', '固定到导航', '强调', '定位']);
click(tree, '原图片动作'); click(tree, '强调'); more(tree)[0].props.onOpenChange(true);
assert.deepEqual(originalCalls, ['image', 'open']); assert.equal(tools[0][1], existingMore); assert.equal(existingMore.menuItems.length, 1);
const merged = context.LCOSNativeNavigationTools(tools, 'image-node', state, jsx('OriginalMoreIcon'));
assert.equal(merged[0][0], copy); assert.equal(merged[0][1].menuItems[0], originalItem); assert.equal(merged[0][1].menuItems[1].separator, true);
Object.assign(composer,{supported:true,canUse:true});
tree=context.Vde({nodeId:'exact-text',tools});
assert.deepEqual(rows(tree).map(label),['原图片动作','用于当前输入','固定到导航','强调','定位']);
click(tree,'用于当前输入');assert.equal(calls.at(-1),'use-input');assert.equal(more(tree).length,1);
Object.assign(composer,{canUse:false,reason:'当前任务暂不能读取图片，可从已有对话使用。'});
tree=context.Vde({nodeId:'exact-image',tools});
const unavailable=rows(tree)[1];assert.equal(unavailable.props.disabled,true);
assert.equal(label(unavailable).props.children[0],'用于当前输入');
assert.equal(label(unavailable).props.children[1].props.children,composer.reason);
Object.assign(composer,{canUse:true,busy:true,notice:'材料已变化，当前草稿保留。'});
tree=context.Vde({nodeId:'exact-image',tools});
assert.equal(rows(tree).find(row=>label(row)==='用于当前输入').props.disabled,true);
assert.equal(more(tree).flatMap(menu=>nodes(menu,node=>node.props?.['data-native-node-composer-notice']==='exact-image')).length,1);
Object.assign(composer,{supported:false,canUse:false,busy:false,notice:'',reason:undefined});
Object.assign(state, { pinned: true, emphasized: true, busy: true, notice: '固定未保存，请重试。' });
tree = context.Vde({ nodeId: 'pile-node', tools: [[{ ...existingMore, key: 'native-collection-menu' }]] });
assert.deepEqual(rows(tree).map(label).slice(0, 4), ['原图片动作', '取消固定', '取消强调', '定位']);
assert.equal(rows(tree).find(row => label(row) === '取消固定').props.disabled, true);
assert.equal(Boolean(rows(tree).find(row => label(row) === '取消强调').props.disabled), false, 'Pin I/O does not block pure GUI emphasis');
const notices = more(tree).flatMap(menu => nodes(menu, node => node.props?.['data-native-navigation-notice'] === 'pile-node'));
assert.equal(notices.length, 1); assert.equal(notices[0].props.role, 'status');
Object.assign(state,{pinAction:'manage',busy:false});tree=context.Vde({nodeId:'dual-scope-node',tools});
assert.equal(rows(tree).filter(row=>label(row)==='管理固定').length,1);assert.equal(rows(tree).some(row=>['取消固定','固定到导航'].includes(label(row))),false);
manageCallbacks.at(-1)('same-canvas');assert.deepEqual(calls.at(-1),['directory','same-canvas',true],'Actual Vde injects the one original directory owner, not a second menu/window');
Object.assign(state, { canPin: false, pinAction:undefined, busy: false, notice: '', canEmphasize: false, canLocate: true });
tree = context.Vde({ nodeId: 'locked-node', tools: [[copy]] }); assert.deepEqual(rows(tree).map(label), ['定位']);
for (const blocked of [{ disabled: true }, { invisible: true }, { lockedTooltip: '权限说明' }]) {
  const group = [[{ ...existingMore, ...blocked }]], result = context.LCOSNativeNavigationTools(group, 'image-node', state, jsx('OriginalMoreIcon'));
  assert.equal(result.length, 1); assert.equal(result[0].length, 1); assert.equal(result[0][0], group[0][0], 'Never unlock or double an original blocked More');
}
assert.equal(context.LCOSNativeNavigationTools(tools, '', state), tools);
Object.assign(state, { canPin: false, canEmphasize: false, canLocate: false });
assert.equal(context.LCOSNativeNavigationTools(tools, 'missing-node', state), tools);
const dedicated = { ...existingMore, key: 'video_frame_capture' };
Object.assign(state, { canEmphasize: true });
const specialized = context.LCOSNativeNavigationTools([[dedicated]], 'video-node', state, jsx('OriginalMoreIcon'));
assert.equal(specialized[0][0], dedicated); assert.equal(specialized.length, 2, 'Dedicated capture menu is not a generic More');

// Run the actual gw body and its actual viewport/intersection/size helpers.
// Only React stores/hooks and time are controlled. No second visibility model
// replaces the production ready predicate, geometry or delayed state owner.
const geometryFile = new URL('../reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-D4wysAbz.js', import.meta.url);
const geometrySource = fs.readFileSync(geometryFile, 'utf8'), geometryOwners = owners(geometrySource);
const dimensionSource = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/index-BAQXnPag.js', import.meta.url), 'utf8');
const dimensionOwners = owners(dimensionSource);
const declaration = (body, map, name) => {
  const node = map.get(name); assert.ok(node, 'original helper ' + name);
  return (node.type === 'VariableDeclarator' ? 'const ' : '') + body.slice(node.start, node.end) + ';';
};
const prioritySource = fs.readFileSync(new URL('../lab/pilot/native-navigation-state.ts', import.meta.url), 'utf8');
const priorityMatch = prioritySource.match(/export function LCOSUseNativeNavigationVisibility\(nodeId:string\):boolean \{[\s\S]*?^\}/m);
assert.ok(priorityMatch, 'actual state priority hook remains identifiable');
const priorityHook = priorityMatch[0].replace('export ', '').replace('nodeId:string', 'nodeId').replace('):boolean', ')');
function visibilityHarness({ adapted = true, target = 'target', mode, navigating, arrival, ready = true, current = true } = {}) {
  let now = 0, timerId = 0, cursor = 0, dirty = false, effectQueue = [];
  const slots = [], timers = new Map();
  const node = { id: target, position: { x: 500, y: 500 }, measured: { width: 20, height: 20 } };
  const flow = { transform: [0, 0, 1], width: 100, height: 100, nodeLookup: new Map([[target, node]]) };
  const nav = { scene: {}, cameraMode: mode, navigating, arrival };
  const environment = { ready, current }, timerDelays = [], priorityIds = [];
  const hooks = {
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, value => { const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (slots[index].value !== next) { slots[index].value = next; dirty = true; } }]; },
    useEffect(callback, deps) { const index = cursor++, prior = slots[index];
      if (prior && deps.length === prior.deps.length && deps.every((value, i) => Object.is(value, prior.deps[i]))) return;
      const effect = { deps: [...deps], cleanup: undefined }; slots[index] = effect;
      effectQueue.push(() => { prior?.cleanup?.(); effect.cleanup = callback(); }); },
  };
  const hookContext = vm.createContext({ d: hooks, Wj: select => select({ isReady: environment.ready }), Ms: select => select(flow),
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(), subscribeNativeNavigation: () => () => {}, nativeNavigationSnapshot: () => nav,
    navigationSceneCurrent: () => environment.current,
    setTimeout: (callback, delay) => { const id = ++timerId; timerDelays.push(delay); timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout: id => timers.delete(id) });
  vm.runInContext(['sz', 'lz'].map(name => declaration(dimensionSource, dimensionOwners, name)).join('\n')
    + '\nconst fv=sz,hv=lz;' + ['AP', 'po', 'QD', 'JD'].map(name => declaration(geometrySource, geometryOwners, name)).join('\n')
    + '\nconst o7=QD,i7=JD;' + declaration(changed, after, 'cLe') + declaration(changed, after, 'dLe')
    + priorityHook + ';' + (adapted ? sourceOf('gw') : originalVisibility) + ';', hookContext);
  const priority = hookContext.LCOSUseNativeNavigationVisibility;
  hookContext.LCOSUseNativeNavigationVisibility = id => { priorityIds.push(id); return priority(id); };
  let last;
  function render() {
    let first, passes = 0;
    do {
      dirty = false; cursor = 0; effectQueue = [];
      last = hookContext.gw(target); if (!passes) first = last;
      const effects = effectQueue; effectQueue = []; effects.forEach(run => run());
      if (++passes > 10) throw Error('Unexpected gw render loop');
    } while (dirty);
    return first;
  }
  function advance(duration) {
    const end = now + duration;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].callback(); render();
    }
    now = end; return last;
  }
  return { node, flow, nav, environment, timerDelays, priorityIds, render, advance, value: () => last,
    enter() { node.position = { x: 20, y: 20 }; return render(); }, leave() { node.position = { x: 500, y: 500 }; return render(); } };
}
for (const adapted of [false, true]) {
  const ordinary = visibilityHarness({ adapted });
  assert.equal(ordinary.render(), false); assert.equal(ordinary.enter(), false);
  assert.equal(ordinary.advance(499), false); assert.equal(ordinary.advance(1), true);
  assert.equal(ordinary.leave(), true); assert.equal(ordinary.advance(999), true); assert.equal(ordinary.advance(1), false);
  assert.deepEqual(ordinary.timerDelays, [500, 1000], 'ordinary original debounce and delayed unmount remain unchanged');
}
const prioritized = visibilityHarness({ mode: 'locate', navigating: 'target' });
assert.equal(prioritized.render(), false, 'a real offscreen target is not forced visible');
assert.equal(prioritized.enter(), true, 'actual in-view target mounts in the same render, without 500ms');
assert.equal(prioritized.value(), true, 'the original state owner catches up through its first-entry branch');
assert.deepEqual(prioritized.timerDelays, []);
prioritized.nav.navigating = undefined; prioritized.nav.cameraMode = undefined;
assert.equal(prioritized.render(), true, 'manual cancellation before 500ms cannot unmount an already entered target');
prioritized.nav.navigating = 'target'; prioritized.nav.cameraMode = 'locate';
assert.equal(prioritized.leave(), true); assert.equal(prioritized.advance(999), true); assert.equal(prioritized.advance(1), false);
assert.deepEqual(prioritized.timerDelays, [1000], 'actual offscreen unmount retains the original 1000ms policy even while priority is true');
for (const input of [
  { mode: 'locate', navigating: 'another-node' }, { mode: 'return', navigating: 'target' },
  { mode: 'locate', navigating: 'target', current: false },
]) {
  const unrelated = visibilityHarness(input); assert.equal(unrelated.render(), false); assert.equal(unrelated.enter(), false);
  assert.deepEqual(unrelated.timerDelays, [500]); assert.equal(unrelated.advance(500), true);
}
const notReady = visibilityHarness({ mode: 'locate', navigating: 'target', ready: false });
assert.equal(notReady.render(), false); assert.equal(notReady.enter(), false, 'priority never bypasses original isReady');
notReady.environment.ready = true; assert.equal(notReady.render(), true);
const arrival = visibilityHarness({ arrival: { nodeId: 'target', until: Date.now() + 2200 } });
assert.equal(arrival.render(), false); assert.equal(arrival.enter(), true);
assert.ok(prioritized.priorityIds.every(id => id === 'target'));
assert.equal(fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/' + filename, import.meta.url), 'utf8'), original);
console.log(JSON.stringify({ passed: true, scope: 'Actual original Vde/Hde menu execution with controlled hook fixture; no service/model/UI mutation',
  checks: ['shared text/image/pile toolbar seam', 'original owners/menu leaves retained', 'exact node id hook', 'pin/emphasis/locate handlers reachable',
    'existing More rows preserved', 'busy pin independent of emphasis', 'notice in original menu', 'blocked More policy retained',
    'gw exact four edits only; original effects/store/500ms/1000ms retained', 'actual original viewport/intersection/size helpers execute',
    'exact in-view navigation/arrival target mounts immediately and cancellation retains original state',
    'ordinary/non-target/return/stale scene keep 500ms; real offscreen keeps 1000ms; isReady never bypassed',
    'vendor source unchanged'], browser: false, realBackend: false }));
