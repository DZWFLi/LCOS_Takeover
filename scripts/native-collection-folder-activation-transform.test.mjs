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
  nativeCanonicalCollectionViewSource,
  transformNativeCanonicalCollectionView,
} from '../lab/native-ui-source-transforms.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalPath = path.join(root, nativeCanonicalCollectionViewSource);
const faceRelativePath = 'lcos/huabu/apps/web/src/lcos/nodes/Gen1CollectionFace.tsx';
const facePath = path.join(root, faceRelativePath);
const canonicalResource = readCurrentGen2Resource(canonicalPath);
const faceResource = readCurrentGen2Resource(facePath);
assert.ok(canonicalResource && faceResource, 'the exact current Gen2 Canonical view and original Gen1 face are adopted read-only resources');
assert.equal(path.resolve(canonicalResource.sourcePath), path.resolve(currentGen2Root, 'huabu/apps/web/src/lcos/nodes/CanonicalCollectionView.tsx'));
assert.equal(path.resolve(faceResource.sourcePath), path.resolve(currentGen2Root, 'huabu/apps/web/src/lcos/nodes/Gen1CollectionFace.tsx'));
const canonical = canonicalResource.contents;
const faceSource = faceResource.contents;
const copiedCanonicalBytes = fs.readFileSync(canonicalPath);
const copiedFaceBytes = fs.readFileSync(facePath);
const transform = source => transformNativeCanonicalCollectionView(source, { sourcePath: canonicalPath });
const originalProps = 'onActivate={props.onActivate} activationLabel={props.activationLabel}';
const adaptedProps = 'onActivate={props.onActivate ?? folder?.onActivate} activationLabel={props.activationLabel ?? folder?.activationLabel}';

const transformed = transform(canonical);
assert.notEqual(transformed, canonical, 'the current shared Collection view forwards the native folder callback');
assert.match(transformed, /onActivate=\{props\.onActivate \?\? folder\?\.onActivate\} activationLabel=\{props\.activationLabel \?\? folder\?\.activationLabel\}/,
  'the original folder activation callback remains the fallback');
assert.match(transformed, /readonly collectionNodeId\?: string; readonly onArrange\?: \(\) => boolean \| Promise<boolean>/,
  'the Canonical-only folder type carries the exact native arrange identity/callback without changing Gen1 face props');
assert.match(transformed, /onArrange=\{hasNativeCollectionGroup && typeof nativeOnArrange === 'function' \? nativeOnArrange : hasCanvasHost \? arrange : undefined\}/,
  'the new native callback is offered to the original menu only for its exact canonical group, with the original frame path retained');
assert.match(transformed, /collectionNodeId: nativeCollectionNodeId, onArrange: nativeOnArrange, \.\.\.folder/,
  'the Canonical view strips adapter-only fields before spreading folder props into Gen1');
assert.equal(transformed.split(adaptedProps).length - 1, 1);
assert.equal(transform(transformed), transformed, 'the exact transform is idempotent');
assert.equal(createNativeUiSourceTransforms()[nativeCanonicalCollectionViewSource](canonical, { sourcePath: canonicalPath }), transformed,
  'the live Native UI transform registry uses this same exact current-source adaptation');

assert.throws(() => transformNativeCanonicalCollectionView(canonical), /exact copied CanonicalCollectionView sourcePath/,
  'missing source identity is rejected');
assert.throws(() => transformNativeCanonicalCollectionView(canonical, { sourcePath: facePath }), /exact copied CanonicalCollectionView sourcePath/,
  'the transform cannot be applied to a neighboring Gen1 component');
assert.throws(() => transform(canonical.replace(originalProps, originalProps + '\n      ' + originalProps)), /seam drifted/,
  'duplicate source anchors fail closed');
assert.throws(() => transform(canonical.replace(originalProps, 'onActivate={props.onActivate ?? folder?.onActivate} activationLabel={props.activationLabel}')),
  /seam drifted/,
  'a half-installed transform is rejected');
assert.throws(() => transform(transformed.replace('folder?.activationLabel', 'folder?.disabledReason')),
  /seam drifted/,
  'installed-source drift is rejected rather than silently accepted');
assert.throws(() => transform(canonical.replace('<Gen1CollectionFace {...folder}', '<CollectionFace {...folder}')),
  /seam drifted/,
  'the original Gen1 folder owner must remain the receiver');
assert.equal(fs.readFileSync(canonicalPath).equals(copiedCanonicalBytes), true, 'the copied vendor tree remains unchanged');
assert.equal(fs.readFileSync(facePath).equals(copiedFaceBytes), true, 'the original copied Gen1 face remains unchanged');

const requireFromInstalled = createRequire(path.join(installedRoot, 'package.json'));
const esbuild = requireFromInstalled('esbuild');
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
  const canvasStore = selector => {
    const state = { nodes: [] };
    return selector ? selector(state) : state;
  };
  canvasStore.getState = () => ({ nodes: [] });
  export default canvasStore;
`;

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
    name: 'compile-current-collection-view-and-gen1-face-with-behavior-stubs',
    setup(build) {
      build.onResolve({ filter: /.*/ }, args => {
        if (args.kind === 'entry-point') return undefined;
        if (args.path === './Gen1CollectionFace') return { path: 'current-Gen1CollectionFace.tsx', namespace: 'adopted-current-face' };
        return { path: args.path, namespace: 'collection-stubs' };
      });
      build.onLoad({ filter: /.*/, namespace: 'adopted-current-face' }, () => ({ contents: faceSource, loader: 'tsx' }));
      build.onLoad({ filter: /.*/, namespace: 'collection-stubs' }, args => ({
        contents: args.path.endsWith('.css') ? '' : stubModule,
        loader: 'js',
      }));
    },
  }],
});
assert.equal(built.errors.length, 0, 'the actual current TSX modules compile after source adaptation');
const commonJs = built.outputFiles[0]?.text;
assert.ok(commonJs);
const moduleRecord = { exports: {} };
vm.runInNewContext(commonJs, {
  module: moduleRecord,
  exports: moduleRecord.exports,
  window: { addEventListener() {}, removeEventListener() {} },
  console,
}, { filename: canonicalPath });
const canonicalModule = moduleRecord.exports;
assert.equal(typeof canonicalModule.CanonicalCollectionView, 'function');

function findElementByName(value, name) {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findElementByName(child, name);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  if (typeof value.type === 'function' && value.type.name === name) return value;
  return findElementByName(value.props?.children, name);
}

function renderGen1FaceProps(folder, topLevel = {}) {
  const collectionElement = canonicalModule.CanonicalCollectionView({
    title: 'Native callback fixture',
    projectId: 'project-callback-test',
    collectionId: 'collection-callback-test',
    density: 'mark',
    presentation: 'compact',
    sizing: 'canvas',
    folder,
    ...topLevel,
  });
  const readView = collectionElement.type(collectionElement.props);
  const faceElement = findElementByName(readView, 'Gen1CollectionFace');
  assert.ok(faceElement, 'the original Canonical view rendered its actual Gen1CollectionFace element');
  const faceRoot = faceElement.type(faceElement.props);
  assert.equal(typeof faceRoot.props.onPointerDownCapture, 'function');
  assert.equal(typeof faceRoot.props.onClick, 'function');
  return { faceProps: faceElement.props, eventProps: faceRoot.props };
}

function clickOriginalFace(eventProps) {
  const target = { closest: () => null };
  const pointer = { target, button: 0, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
    pointerId: 1, clientX: 20, clientY: 30 };
  eventProps.onPointerDownCapture(pointer);
  eventProps.onClick({ target, defaultPrevented: false, shiftKey: false, ctrlKey: false, metaKey: false,
    altKey: false, stopPropagation() {} });
}

let folderCalls = 0;
const folderCallback = () => { folderCalls += 1; };
const inherited = renderGen1FaceProps({ onActivate: folderCallback, activationLabel: '来自 folder 的激活' });
assert.equal(inherited.faceProps.onActivate, folderCallback, 'top-level undefined falls back to the original folder callback');
assert.equal(inherited.faceProps.activationLabel, '来自 folder 的激活', 'top-level undefined preserves the folder label');
clickOriginalFace(inherited.eventProps);
assert.equal(folderCalls, 1, 'the compiled original Gen1 pointer/click handlers invoke the inherited callback');

let folderPreferredCalls = 0;
let explicitCalls = 0;
const explicit = renderGen1FaceProps({
  onActivate: () => { folderPreferredCalls += 1; }, activationLabel: 'folder label',
}, {
  onActivate: () => { explicitCalls += 1; }, activationLabel: 'top-level label',
});
assert.equal(explicit.faceProps.activationLabel, 'top-level label', 'an explicit top-level label remains preferred');
clickOriginalFace(explicit.eventProps);
assert.equal(explicitCalls, 1, 'an explicit top-level callback has priority');
assert.equal(folderPreferredCalls, 0, 'the lower-priority folder callback is not also invoked');

let guardedCalls = 0;
const suppressed = renderGen1FaceProps({ onActivate: () => { guardedCalls += 1; }, suppressActivation: true });
clickOriginalFace(suppressed.eventProps);
assert.equal(guardedCalls, 0, 'the original suppressActivation pointer guard remains effective');
const disabled = renderGen1FaceProps({ onActivate: () => { guardedCalls += 1; }, disabledReason: 'disabled fixture' });
clickOriginalFace(disabled.eventProps);
assert.equal(guardedCalls, 0, 'the original disabledReason click guard remains effective');

process.stdout.write(JSON.stringify({
  currentResources: [canonicalResource.resourcePath, faceResource.resourcePath],
  transform: 'exact current-source fallback, top-level callback/label priority, idempotence and drift rejection',
  compiledOriginalInteraction: {
    folderCallbackInvoked: folderCalls === 1,
    explicitTopLevelPreferred: explicitCalls === 1 && folderPreferredCalls === 0,
    suppressActivationBlocked: guardedCalls === 0,
    disabledReasonBlocked: guardedCalls === 0,
  },
  copiedSourcesUnchanged: fs.readFileSync(canonicalPath).equals(copiedCanonicalBytes)
    && fs.readFileSync(facePath).equals(copiedFaceBytes),
}, null, 2) + '\n');
