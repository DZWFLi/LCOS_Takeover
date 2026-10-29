import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { installedRoot } from '../lab/pilot/build-pilot.mjs';
import { currentGen2Root, readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import {
  createNativeUiSourceTransforms,
  nativeCollectionMembersMenuSource,
  transformNativeCollectionArrangeNotice,
} from '../lab/native-ui-source-transforms.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const menuPath = path.join(root, nativeCollectionMembersMenuSource);
const menuResource = readCurrentGen2Resource(menuPath);
assert.ok(menuResource, 'the exact current Gen2 CollectionMembersMenu is an adopted resource');
assert.equal(path.resolve(menuResource.sourcePath),
  path.resolve(currentGen2Root, 'huabu/apps/web/src/lcos/nodes/CollectionMembersMenu.tsx'));
const source = menuResource.contents;
const copiedBytesBefore = fs.readFileSync(menuPath);
const sourcePath = menuPath;
const original = "if (mounted.current) setNotice(ok ? '成员已排好，可撤销；原材料与集合关系保留。' : '当前现场或可排列成员已变化，已保留原布局。');";
const success = "排列已核对；如有布局变化可撤销，原材料与集合关系保留。";
const adapted = original.replace('成员已排好，可撤销；原材料与集合关系保留。', success);
const transformed = transformNativeCollectionArrangeNotice(source, { sourcePath });
assert.equal(transformed, source.replace(original, adapted), 'only the original boolean success copy changes');
assert.equal(transformNativeCollectionArrangeNotice(transformed, { sourcePath }), transformed,
  'the exact success-copy transform is idempotent');
assert.equal(createNativeUiSourceTransforms()[nativeCollectionMembersMenuSource](source, { sourcePath }), transformed,
  'the live transform registry uses the same exact adopted-menu adaptation');
assert.throws(() => transformNativeCollectionArrangeNotice(source), /exact copied CollectionMembersMenu sourcePath/,
  'the transform refuses missing source identity');
assert.throws(() => transformNativeCollectionArrangeNotice(source.replace(original, `${original}\n${original}`), { sourcePath }),
  /seam drifted/, 'duplicated success seams fail closed');
assert.throws(() => transformNativeCollectionArrangeNotice(transformed.replace(success, '改写后的成功'), { sourcePath }),
  /seam drifted/, 'post-install drift fails closed');
assert.match(transformed, /if \(pending\.current \|\| !onArrange\) return;/,
  'the original pending/no-handler guard remains unchanged');
assert.match(transformed, /const ok = await onArrange\(\);/,
  'the existing boolean arrange result contract remains unchanged');
assert.match(transformed, /当前现场或可排列成员已变化，已保留原布局。/,
  'the original false/error feedback is untouched');

const requireFromInstalled = createRequire(path.join(installedRoot, 'package.json'));
const esbuild = requireFromInstalled('esbuild');
const runtime = { slots: [], hookIndex: 0 };
const stubs = `
  export function jsx(type, props, key) { return { type, props: props || {}, ...(key === undefined ? {} : { key }) }; }
  export const jsxs = jsx;
  export const Fragment = Symbol.for('test.fragment');
  export function useState(initial) {
    const index = globalThis.__runtime.hookIndex++;
    if (!(index in globalThis.__runtime.slots)) globalThis.__runtime.slots[index] = {
      kind: 'state', value: typeof initial === 'function' ? initial() : initial,
    };
    const slot = globalThis.__runtime.slots[index];
    return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
  }
  export function useRef(initial) {
    const index = globalThis.__runtime.hookIndex++;
    if (!(index in globalThis.__runtime.slots)) globalThis.__runtime.slots[index] = { kind: 'ref', value: { current: initial } };
    return globalThis.__runtime.slots[index].value;
  }
  export function useCallback(callback) { return callback; }
  export function useEffect() {}
  export function useCloseOnEscape() {}
  export const COLLECTION_PREVIEW_LABELS = {};
  export function LcosButton(props) {
    if (props.ref) props.ref.current = { getBoundingClientRect: () => ({ left: 20, bottom: 30 }), focus() {} };
    const { ref, ...buttonProps } = props;
    return jsx('button', buttonProps);
  }
  export function Popover(props) { return jsx('div', { children: props.children }); }
`;
const built = await esbuild.build({
  stdin: { contents: transformed, sourcefile: menuPath, resolveDir: path.dirname(menuPath), loader: 'tsx' },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  jsx: 'automatic',
  logLevel: 'silent',
  plugins: [{
    name: 'compile-real-adopted-collection-menu-with-small-runtime-stubs',
    setup(build) {
      build.onResolve({ filter: /.*/ }, args => args.kind === 'entry-point'
        ? undefined : { path: args.path, namespace: 'collection-menu-stubs' });
      build.onLoad({ filter: /.*/, namespace: 'collection-menu-stubs' }, args => ({
        contents: args.path.endsWith('.css') ? '' : stubs,
        loader: 'js',
      }));
    },
  }],
});
assert.equal(built.errors.length, 0, 'the adopted current CollectionMembersMenu compiles after the one-text adaptation');
const moduleRecord = { exports: {} };
vm.runInNewContext(built.outputFiles[0].text, {
  module: moduleRecord,
  exports: moduleRecord.exports,
  console,
  __runtime: runtime,
}, { filename: menuPath });
const { CollectionMembersMenu } = moduleRecord.exports;

function resetHooks() {
  runtime.slots = [];
  runtime.hookIndex = 0;
}

function renderMenu(onArrange) {
  runtime.hookIndex = 0;
  const raw = CollectionMembersMenu({ title: 'Exact menu', members: [], status: 'ready',
    refresh() {}, remove: async () => ({ proof: 'readback', spatialPending: false }), onArrange });
  return materialize(raw);
}

function materialize(node) {
  if (Array.isArray(node)) return node.map(materialize);
  if (!node || typeof node !== 'object') return node;
  if (typeof node.type === 'function') return materialize(node.type(node.props));
  return { ...node, props: { ...node.props, children: materialize(node.props?.children) } };
}

function find(node, predicate) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = find(child, predicate);
      if (result) return result;
    }
    return undefined;
  }
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}

function openMembersPanel(tree) {
  const trigger = find(tree, node => node.props?.['data-lcos-collection-members-open'] !== undefined);
  assert.ok(trigger, 'the original menu trigger exists');
  trigger.props.onClick();
  const opened = renderMenu(openMembersPanel.onArrange);
  const arrange = find(opened, node => node.props?.['data-lcos-collection-arrange'] !== undefined);
  assert.ok(arrange, 'the original Arrange button appears inside the original member panel');
  return { opened, arrange };
}

resetHooks();
let successCalls = 0;
let resolveSuccess;
const successWait = new Promise(resolve => { resolveSuccess = resolve; });
const successfulTree = renderMenu(() => { successCalls += 1; return successWait; });
openMembersPanel.onArrange = () => { successCalls += 1; return successWait; };
const successPanel = openMembersPanel(successfulTree);
successPanel.arrange.props.onClick();
successPanel.arrange.props.onClick();
assert.equal(successCalls, 1, 'the original pending ref prevents a duplicate Arrange submission');
resolveSuccess(true);
await successWait;
await Promise.resolve();
await Promise.resolve();
const successReadback = renderMenu(openMembersPanel.onArrange);
const successNotice = find(successReadback, node => node.props?.['data-lcos-collection-member-notice'] !== undefined);
assert.equal(successNotice?.props.children, success,
  'compiled original menu displays the precise idempotent-safe boolean-success notice');

resetHooks();
let resolveFailure;
const failureWait = new Promise(resolve => { resolveFailure = resolve; });
const failedTree = renderMenu(() => failureWait);
openMembersPanel.onArrange = () => failureWait;
const failedPanel = openMembersPanel(failedTree);
failedPanel.arrange.props.onClick();
resolveFailure(false);
await failureWait;
await Promise.resolve();
await Promise.resolve();
const failedReadback = renderMenu(openMembersPanel.onArrange);
const failedNotice = find(failedReadback, node => node.props?.['data-lcos-collection-member-notice'] !== undefined);
assert.equal(failedNotice?.props.children, '当前现场或可排列成员已变化，已保留原布局。',
  'false keeps the original no-layout-change feedback');

assert.equal(fs.readFileSync(menuPath).equals(copiedBytesBefore), true, 'the copied vendor file was not edited');
process.stdout.write(JSON.stringify({
  test: 'native-collection-arrange-menu',
  successText: success,
  booleanContractPreserved: true,
  pendingDuplicateGuardPreserved: successCalls === 1,
  falseNoticePreserved: failedNotice?.props.children === '当前现场或可排列成员已变化，已保留原布局。',
  compiledCurrentMenu: true,
  copiedSourceUnchanged: true,
}, null, 2) + '\n');
