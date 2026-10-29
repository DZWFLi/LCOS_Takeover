import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { currentGen2Root, readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { createNativeUiSourceTransforms, nativeCanonicalCollectionViewSource, transformNativeCanonicalCollectionView }
  from '../lab/native-ui-source-transforms.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalPath = path.join(root, nativeCanonicalCollectionViewSource);
const canonicalResource = readCurrentGen2Resource(canonicalPath);
assert.ok(canonicalResource, 'the selected CanonicalCollectionView is an adopted current Gen2 resource');
assert.equal(path.resolve(canonicalResource.sourcePath),
  path.resolve(currentGen2Root, 'huabu/apps/web/src/lcos/nodes/CanonicalCollectionView.tsx'));
const copiedCanonicalBefore = fs.readFileSync(canonicalPath);
const source = canonicalResource.contents;
const transformed = transformNativeCanonicalCollectionView(source, { sourcePath: canonicalPath });
assert.equal(transformNativeCanonicalCollectionView(transformed, { sourcePath: canonicalPath }), transformed,
  'the exact adopted-source adaptation is idempotent');
assert.equal(createNativeUiSourceTransforms()[nativeCanonicalCollectionViewSource](source, { sourcePath: canonicalPath }), transformed,
  'the live source registry uses the same Canonical collection seam');
assert.throws(() => transformNativeCanonicalCollectionView(source), /exact copied CanonicalCollectionView sourcePath/,
  'the transform refuses an unknown source owner');
assert.throws(() => transformNativeCanonicalCollectionView(transformed.replace('node.type === \'group\'', 'node.type === \'frame\''),
  { sourcePath: canonicalPath }), /seam drifted/, 'an altered group identity check fails closed');

const requireFromInstalled = createRequire(path.join(installedRoot, 'package.json'));
const esbuild = requireFromInstalled('esbuild');
const runtime = { canvas: { nodes: [] } };
const stubModule = `
  export function jsx(type, props, key) { return { type, props: props || {}, ...(key === undefined ? {} : { key }) }; }
  export const jsxs = jsx;
  export const Fragment = Symbol.for('test.fragment');
  export function useMemo(create) { return create(); }
  export function useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}]; }
  export function useRef(initial) { return { current: initial }; }
  export function useEffect() {}
  export function useCallback(callback) { return callback; }
  export function collectionPreviewMembers() { return []; }
  export function arrangeCollectionHost() { return false; }
  export function collectionProjectedMemberIds() { return []; }
  export function removeCollectionMember() { return Promise.resolve(false); }
  export function CollectionMemberPreview() { return null; }
  export function isReadableCollectionArtifact() { return false; }
  export function CollectionMembersMenu() { return null; }
  export function Gen1CollectionGlyph() { return null; }
  export function RotateCw() { return null; }
  export function ContextCollectionView() { return null; }
  export function createLcosCoreSession() { return { collections: { members: async () => ({}) }, artifacts: {} }; }
  export const useCollaborationSessionStore = Object.assign(() => ({}), { getState: () => ({ watchProjectChanges: () => () => {} }) });
  export class SessionRefreshQueue { refresh() { return Promise.resolve(); } release() {} }
  export function useLcosHostStore(selector) { const state = { host: undefined }; return selector ? selector(state) : state; }
  export const useLcosReferenceStore = Object.assign(selector => {
    const state = { projectId: undefined, bindingRefreshVersion: 0, nodeEntityRefs: new Map() };
    return selector ? selector(state) : state;
  }, { getState: () => ({ projectId: undefined, bindingRefreshVersion: 0, nodeEntityRefs: new Map() }), subscribe: () => () => {} });
  const canvasStore = selector => selector ? selector(globalThis.__runtime.canvas) : globalThis.__runtime.canvas;
  canvasStore.getState = () => globalThis.__runtime.canvas;
  export default canvasStore;
`;
const faceResource = readCurrentGen2Resource(path.join(root, 'lcos/huabu/apps/web/src/lcos/nodes/Gen1CollectionFace.tsx'));
assert.ok(faceResource, 'the original Gen1 face is also from the selected current Gen2 tree');
const built = await esbuild.build({
  stdin: { contents: transformed, sourcefile: canonicalPath, resolveDir: path.dirname(canonicalPath), loader: 'tsx' },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  jsx: 'automatic',
  logLevel: 'silent',
  plugins: [{
    name: 'compile-real-collection-view-with-small-owner-stubs',
    setup(build) {
      build.onResolve({ filter: /.*/ }, args => {
        if (args.kind === 'entry-point') return undefined;
        if (args.path === './Gen1CollectionFace') return { path: 'current-Gen1CollectionFace.tsx', namespace: 'adopted-face' };
        return { path: args.path, namespace: 'collection-stubs' };
      });
      build.onLoad({ filter: /.*/, namespace: 'adopted-face' }, () => ({ contents: faceResource.contents, loader: 'tsx' }));
      build.onLoad({ filter: /.*/, namespace: 'collection-stubs' }, args => ({
        contents: args.path.endsWith('.css') ? '' : stubModule,
        loader: 'js',
      }));
    },
  }],
});
assert.equal(built.errors.length, 0, 'the actual adopted Canonical view and Gen1 face compile with adapter-only type fields');
const moduleRecord = { exports: {} };
vm.runInNewContext(built.outputFiles[0].text, {
  module: moduleRecord,
  exports: moduleRecord.exports,
  window: { addEventListener() {}, removeEventListener() {} },
  console,
  __runtime: runtime,
}, { filename: canonicalPath });
const { CanonicalCollectionView } = moduleRecord.exports;

function findElement(value, componentName) {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findElement(child, componentName);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  if (typeof value.type === 'function' && value.type.name === componentName) return value;
  return findElement(value.props?.children, componentName);
}

function render({ nodes, collectionId = 'collection-exact', carrierId = 'carrier-exact', nativeArrange }) {
  runtime.canvas = { nodes };
  const element = CanonicalCollectionView({
    title: 'Exact Collection', projectId: 'project-exact', collectionId,
    density: 'working', presentation: 'compact', sizing: 'canvas',
    folder: { selected: true, expanded: false, collectionNodeId: carrierId, onArrange: nativeArrange },
  });
  const readView = element.type(element.props);
  return {
    menu: findElement(readView, 'CollectionMembersMenu'),
    face: findElement(readView, 'Gen1CollectionFace'),
  };
}

const arrange = async () => true;
const exactGroup = {
  id: 'group-exact', type: 'group',
  data: { lcosCollectionId: 'collection-exact', lcosCollectionNodeId: 'carrier-exact' },
};
const exact = render({ nodes: [exactGroup], nativeArrange: arrange });
assert.ok(exact.menu, 'the mature original member menu remains rendered for the selected folder');
assert.equal(exact.menu.props.onArrange, arrange, 'the exact existing menu receives the native arrange callback');
assert.ok(exact.face, 'the original Gen1 face is still rendered');
assert.equal(Object.hasOwn(exact.face.props, 'onArrange'), false, 'adapter callback does not leak into Gen1 face props');
assert.equal(Object.hasOwn(exact.face.props, 'collectionNodeId'), false, 'adapter identity does not leak into Gen1 face props');

const noGroup = render({ nodes: [], nativeArrange: arrange });
assert.equal(noGroup.menu.props.onArrange, undefined, 'without the corresponding original group the native Arrange item stays absent');
const otherCarrier = render({ nodes: [{ ...exactGroup, data: { ...exactGroup.data, lcosCollectionNodeId: 'other-carrier' } }],
  nativeArrange: arrange });
assert.equal(otherCarrier.menu.props.onArrange, undefined, 'another Collection carrier cannot inherit this callback');
const otherCollection = render({ nodes: [{ ...exactGroup, data: { ...exactGroup.data, lcosCollectionId: 'other-collection' } }],
  nativeArrange: arrange });
assert.equal(otherCollection.menu.props.onArrange, undefined, 'another Core collection cannot inherit this callback');

const donorFrame = render({ nodes: [{ id: 'legacy-frame', type: 'frame', data: { lcosCollectionId: 'collection-exact' } }],
  nativeArrange: arrange });
assert.equal(typeof donorFrame.menu.props.onArrange, 'function', 'the donor-owned frame arrangement path remains available independently');
assert.notEqual(donorFrame.menu.props.onArrange, arrange, 'native group callback is not selected when its exact group is absent');

assert.equal(fs.readFileSync(canonicalPath).equals(copiedCanonicalBefore), true, 'the copied vendor source was not edited');

const runtimeDir = path.join(root, '.runtime', `native-collection-arrange-ui-${Date.now()}`);
const output = path.join(runtimeDir, 'native-collection.js');
await buildPilotEntry('lab/pilot/native-collection-ui.tsx', output, 'browser', {
  nativeReact: true,
  sourceTransforms: createNativeUiSourceTransforms(),
  env: { LCOS_CORE_URL: '/api/lcos/core', LCOS_CORE_TOKEN: '', PROJECT_ID: 'disposable-surface-core-facade' },
  sourceOverrides: { 'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts' },
});
const bundle = fs.readFileSync(output, 'utf8');
assert.match(bundle, /arrangeCollectionSpace/, 'the native leaf includes the narrow arrangement capability');
assert.match(bundle, /data-lcos-native-collection-space-arrangement/, 'the native leaf reports exact arrangement availability');
assert.match(bundle, /data-lcos-collection-arrange/, 'the menu action remains the original CollectionMembersMenu item');
assert.doesNotMatch(bundle, /ReactFlowProvider|<ReactFlow/, 'the arrangement leaf does not create a second Canvas/provider');
assert.doesNotMatch(bundle, /react-dom\/client/, 'the arrangement leaf does not create a second React root');

process.stdout.write(JSON.stringify({
  test: 'native-collection-arrange-ui',
  source: path.relative(root, canonicalPath).replaceAll('\\', '/'),
  menuOwner: 'adopted current Gen2 CanonicalCollectionView → original CollectionMembersMenu',
  exactGroupCallback: exact.menu.props.onArrange === arrange,
  unrelatedAndMissingGroupsWithheld: noGroup.menu.props.onArrange === undefined
    && otherCarrier.menu.props.onArrange === undefined && otherCollection.menu.props.onArrange === undefined,
  nativePropsSanitizedFromGen1: !Object.hasOwn(exact.face.props, 'onArrange')
    && !Object.hasOwn(exact.face.props, 'collectionNodeId'),
  donorFrameFallbackPreserved: typeof donorFrame.menu.props.onArrange === 'function'
    && donorFrame.menu.props.onArrange !== arrange,
  copiedSourceUnchanged: true,
  browserBundle: path.relative(root, output).replaceAll('\\', '/'),
  secondCanvasOrReactRoot: false,
}, null, 2) + '\n');
