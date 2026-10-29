import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { createNativeTextSourceTransforms } from '../lab/native-text-source-transforms.mjs';
import { transformAgentNodeScript, countAgentNodeReactFlowRoots } from '../lab/agent-node-transform.mjs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformRendererScript } from '../lab/startup-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = 'page-Da_DfwiK.js';
const vendorPath = path.join(root, 'reference/tapnow-installed/resources/web/assets', target);
const vendorSource = fs.readFileSync(vendorPath, 'utf8');
const collectionPath = path.join(root, 'lab/pilot/native-collection-ui.tsx');
const collectionSource = fs.readFileSync(collectionPath, 'utf8');
const transformPath = path.join(root, 'lab/agent-node-transform.mjs');
const transformSource = fs.readFileSync(transformPath, 'utf8');
const uiEntrySource = fs.readFileSync(path.join(root, 'lab/pilot/native-agent-ui.tsx'), 'utf8');

function applyExistingServeTransforms(input) {
  const started = transformRendererScript(target, input);
  const cut = transformCutScript(target, started);
  const bridged = transformNodeBridgeScript(target, cut)
    .replace('VITE_FILE_ACCESS_URL:""', 'VITE_FILE_ACCESS_URL:window.location.origin');
  const docked = transformSurfaceDockScript(target, bridged);
  return transformHistoryIntentScript(target, docked);
}

const served = applyExistingServeTransforms(vendorSource);
const transformed = transformAgentNodeScript(target, served);
const roots = countAgentNodeReactFlowRoots(served, target);
assert.equal(roots, 1, 'the original TapNow bundle owns one ReactFlow root before this extension');
assert.equal(countAgentNodeReactFlowRoots(transformed, target), roots,
  'adding the collection body does not create or replace a Canvas/ReactFlow root');
assert.equal(transformAgentNodeScript(target, transformed), transformed, 'the exact map extension is idempotent');
assert.match(transformed,
  /nodeTypes:\(\{\.\.\.[A-Za-z_$][\w$]*,"lcos-conversation":LCOSConversationNode,"lcos-execution":LCOSExecutionNode,"lcos-result-material":LCOSResultMaterialNode,"lcos-collection":LCOSCollectionNode\}\)/,
  'the original nodeTypes map is spread-preserved and extended with the canonical Collection face');
assert.throws(() => transformAgentNodeScript(target,
  transformed.replace(',"lcos-collection":LCOSCollectionNode', '')),
/partially installed/, 'a partial Collection registration fails closed');
assert.equal(transformAgentNodeScript('unrelated.js', vendorSource), vendorSource,
  'unrelated vendor chunks remain untouched');

assert.match(uiEntrySource, /export \{ LCOSCollectionNode \} from '\.\/native-collection-ui\.tsx';/,
  'the same agent-ui module exposes the new renderer to the existing nodeTypes owner');
assert.match(collectionSource, /CollectionNodePresentation/,
  'the leaf delegates to the original Collection presentation instead of redrawing the card');
assert.match(collectionSource, /useLcosDensity\(\)/,
  'the original node density context remains the density owner');
assert.match(collectionSource, /host\?\.api !== canvas\.rfInstance/,
  'the active TapNow ReactFlow API must be the same object as the node bridge API');
assert.match(collectionSource, /shell\.surfaceCanvasId\[shell\.activeSurface\] !== reference\.canvasId/,
  'the LCOS active Surface must map to the canonical collection Canvas');
assert.match(collectionSource, /shell\.activeWorkspaceId !== reference\.workspaceId/,
  'the current LCOS Workspace must match the canonical collection owner');
assert.doesNotMatch(collectionSource, /bindingCanvasId/,
  'the Collection leaf does not demand an unwired global reference-binding reader');
assert.match(collectionSource, /entityId: expected\.reference\.collectionId,[\s\S]*?sameEntityReference\(actualReference, desiredRef\)/,
  'the live ReferenceStore entity is still checked against the exact DTO collection identity');
assert.match(collectionSource, /liveNode\.canvas_id !== reference\.canvasId/,
  'the actual node DTO is checked against the referenced Canvas');
assert.match(collectionSource, /registerNodeEntity\(id, desiredRef\)/,
  'the identity is projected through the existing LCOS ReferenceStore only');
assert.match(collectionSource, /references\.nodeEntityRefs\.get\(id\) === desiredRef/,
  'cleanup only forgets the exact reference object installed by this leaf');
assert.match(collectionSource, /selected: selectedInNativeCanvas,[\s\S]*?expanded: collectionSpace\.expanded,[\s\S]*?suppressActivation: !canToggleCollectionSpace/,
  'the original folder face reflects native RF selection and actual group hidden state; unsupported toggling stays suppressed');
assert.match(collectionSource, /onActivate: canToggleCollectionSpace \? toggleCollectionSpace : undefined/,
  'the original Gen1 folder activation is used without consuming the separate original action slot');
assert.match(collectionSource, /function collectionSpaceToggleFor\([\s\S]*?typeof toggle === 'function' \? toggle\.bind\(api\) : undefined/,
  'a folder click is enabled only when the captured original NativeNodeBridge exposes its narrow toggle method');
assert.match(collectionSource, /function readCollectionSpacePresentation\([\s\S]*?node\.type === 'group'[\s\S]*?lcosCollectionId === collectionId[\s\S]*?lcosCollectionNodeId === collectionNodeId[\s\S]*?const expanded = frame\.hidden !== true;/,
  'expanded is derived only from the exact original host group visibility, not a child-hidden heuristic or second space store');

// Execute the real pure helper body from the leaf (not a reimplementation).
// A folded nested group is hidden under its expanded parent; that child flag
// must not make the parent folder itself appear collapsed.
const helperStart = collectionSource.indexOf('function readCollectionSpacePresentation(');
const helperEnd = collectionSource.indexOf('\nfunction collectionSpaceToggleFor(', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'the original leaf presentation helper remains an exact source seam');
const helperSource = collectionSource.slice(helperStart, helperEnd)
  + '\n globalThis.__readCollectionSpacePresentation = readCollectionSpacePresentation;';
const esbuildRequire = createRequire(path.join(installedRoot, 'package.json'));
const helperJs = esbuildRequire('esbuild').transformSync(helperSource, { loader: 'ts', format: 'iife' }).code;
const helperContext = { globalThis: {} };
vm.runInNewContext(helperJs, helperContext, { filename: 'native-collection-space-presentation.ts' });
const readCollectionSpacePresentation = helperContext.globalThis.__readCollectionSpacePresentation;
assert.equal(typeof readCollectionSpacePresentation, 'function');
const nestedPresentation = readCollectionSpacePresentation([
  { id: 'outer-frame', type: 'group', hidden: false,
    data: { lcosCollectionId: 'outer-collection', lcosCollectionNodeId: 'outer-carrier' } },
  { id: 'inner-frame', type: 'group', parentId: 'outer-frame', hidden: true,
    data: { lcosCollectionId: 'inner-collection', lcosCollectionNodeId: 'inner-carrier' } },
  { id: 'inner-carrier', type: 'lcos-collection', parentId: 'outer-frame', hidden: false },
  { id: 'outer-sibling', type: 'note', parentId: 'outer-frame', hidden: false },
], 'outer-collection', 'outer-carrier');
assert.deepEqual({ ...nestedPresentation }, { frameCount: 1, frameId: 'outer-frame', expanded: true },
  'an independently folded inner Collection does not mark its expanded parent as collapsed');
const independentHiddenChild = readCollectionSpacePresentation([
  { id: 'host', type: 'group', hidden: false,
    data: { lcosCollectionId: 'collection', lcosCollectionNodeId: 'carrier' } },
  { id: 'hidden-member', type: 'note', parentId: 'host', hidden: true },
], 'collection', 'carrier');
assert.equal(independentHiddenChild.expanded, true,
  'an independently hidden child does not determine the parent folder toggle state');
const collapsedHost = readCollectionSpacePresentation([
  { id: 'host', type: 'group', hidden: true,
    data: { lcosCollectionId: 'collection', lcosCollectionNodeId: 'carrier' } },
  { id: 'member', type: 'note', parentId: 'host', hidden: true },
], 'collection', 'carrier');
assert.equal(collapsedHost.expanded, false, 'the original display projection hides the exact collapsed host itself');
assert.deepEqual({ ...readCollectionSpacePresentation([], 'collection', 'carrier') },
  { frameCount: 0, expanded: false }, 'an unopened Collection remains collapsed/unexpanded');
assert.match(collectionSource, /toggle\(\{[\s\S]*?collectionId: parsed\.reference\.collectionId,[\s\S]*?nodeId: id,[\s\S]*?\}, \{ isCurrent \}\)/,
  'the exact Project/Canvas/Workspace/Collection/carrier owner and live-current guard are passed to the bridge');
assert.match(collectionSource, /!collectionNodeLocked && !collectionNodeDragging/,
  'the existing collection owner cannot toggle a locked or actively moving carrier');
assert.match(collectionSource, /latest\.ready && latest\.canvas\.rfInstance === capturedApi\s*&& !latest\.locked && !latest\.dragging/,
  'the async bridge callback rechecks the original live API, owner, lock, and drag state');
assert.match(collectionSource, /if \(!isCurrent\(\)\) return;[\s\S]*?if \(!result\?\.ok\)/,
  'the async completion is revalidated before any success or error notice is attached to the current leaf');
assert.ok(collectionSource.includes('function collectionSpaceArrangeFor(api: NativeCanvasSnapshot')
  && collectionSource.includes("return typeof arrange === 'function' ? arrange.bind(api) : undefined;"),
  'the optional narrow arrangement capability is taken only from the captured original Canvas API');
assert.ok(collectionSource.includes('const canArrangeCollectionSpace = ready && arrangeCollectionSpaceApi !== undefined')
  && collectionSource.includes('&& collectionSpace.frameCount === 1 && !collectionNodeLocked && !collectionNodeDragging && !spaceBusy'),
  'native arrangement requires the exact ready owner, one canonical group, unlocked/non-dragging carrier, and the shared busy guard');
assert.ok(collectionSource.includes('collectionNodeId: collectionSpace.frameCount === 1 ? id : undefined,')
  && collectionSource.includes('onArrange: canArrangeCollectionSpace ? arrangeCollectionSpace : undefined,'),
  'the original Canonical menu receives the carrier ID for its exact group check and an arrange callback only with the live API');
assert.ok(collectionSource.includes('latest.ready && latest.canvas.rfInstance === capturedApi')
  && collectionSource.includes('latestSpace.frameId === capturedFrameId')
  && collectionSource.includes('!latest.locked && !latest.dragging'),
  'the async arrange callback remains bound to the captured API/group and rechecks owner, lock, and drag after awaits');
assert.ok(collectionSource.includes("data-lcos-native-collection-space-arrangement={canArrangeCollectionSpace ? 'ready' : 'unavailable'}"),
  'arrangement status is ready only when the narrow API and exact group are available');
assert.doesNotMatch(collectionSource, /disabledReason: '集合空间展开/,
  'unavailable spatial activation must not aria-disable the supported nested WorkView button');
assert.match(collectionSource, /selectedInNativeCanvas = id !== undefined && canvas\.selectedNodeIds\.includes\(id\)/,
  'folder selection comes from the sole TapNow ReactFlow snapshot');
assert.match(collectionSource, /data-lcos-native-collection-frame-management=\{toggleCollectionSpaceApi[\s\S]*?'first-open-and-display' : 'unavailable'/,
  'first-open and display toggling are reported only when the original bridge method exists');
assert.match(collectionSource, /data-lcos-native-open-collection-work-window=[\s\S]*?aria-label="打开集合工作窗口"[\s\S]*?onClick=\{openCollectionWorkView\}/,
  'the collection exposes an explicit original Work View action, not an expansion alias');
assert.match(collectionSource, /shell\.openWindow\('collection', `集合 · \$\{parsed\.title\}`, parsed\.reference\.collectionId\)/,
  'opening the existing Collection Work View uses the current original Shell window owner');
assert.match(collectionSource, /readCurrentCollectionOwner\(id, parsed, canvas\.rfInstance\)/,
  'the open action rechecks live DTO, Canvas/API, Core Project, Workspace and ReferenceStore identity');
assert.match(collectionSource, /nodeMembershipDropSemantic\(currentRefAtRegistration\)/,
  'drop membership semantic is derived from the existing canonical ReferenceStore identity');
assert.match(collectionSource, /targetId: `node-membership:\$\{id\}`/,
  'the receiver keeps the original node-membership target identity');
assert.match(collectionSource, /priority: 30/,
  'the receiver retains original drop-target priority 30');
assert.match(collectionSource, /rectFromDomRect\(liveElement\.getBoundingClientRect\(\)\)/,
  'the receiver rect comes from the exact live native node element');
assert.match(collectionSource, /isDropPointExposed\(element, point\)/,
  'the receiver uses the production DOM exposure hit test');
assert.match(collectionSource, /if \(!liveElement\?\.isConnected\) return undefined;[\s\S]*?rectFromDomRect\(liveElement\.getBoundingClientRect\(\)\)/,
  'live geometry is retained while the exact DOM receiver remains connected and valid');
assert.doesNotMatch(collectionSource.match(/const readRect = \(\): DropRect \| undefined => \{[\s\S]*?\n    \};/)?.[0] ?? '',
  /sceneReady|canvas\.status|canvasId/,
  'Canvas/API identity cannot remove a still-visible receiver rectangle');
assert.match(collectionSource, /return isDropPointExposed\(element, point\)/,
  'the visible receiver remains opaque based only on original DOM exposure');
assert.match(collectionSource,
  /get enabled\(\) \{[\s\S]*?return latest\.ready && membership !== undefined && !latest\.locked && !latest\.dragging;/,
  'lock, drag, and unresolved identity are dynamic ineligibility, not hit-test holes');
assert.match(collectionSource,
  /get ineligibleReason\(\) \{[\s\S]*?latest\.locked[\s\S]*?latest\.dragging[\s\S]*?!membership/,
  'the original resolver receives a current reason for locked, moving, or unconfirmed nodes');
assert.match(collectionSource,
  /useEffect\(\(\) => \{\s*const element = elementRef\.current;\s*if \(!id \|\| !parsed \|\| !element \|\| !element\.isConnected\) return;/,
  'initial receiver registration requires a real visible node, not an already-ready owner');
assert.doesNotMatch(collectionSource, /frameSelectedNodes|arrangeCollectionHost|toggleCollectionHostWithMotion|moveNodeOutOfFrame/,
  'the native leaf does not introduce unsupported physical-frame or arrangement writes');
const canvasPort = fs.readFileSync(path.join(root, 'lab/pilot/native-canvas-port.ts'), 'utf8');
assert.match(canvasPort, /arrangeCollectionSpace\?\(input:[\s\S]*?options: \{ readonly isCurrent: \(\) => boolean \}/,
  'the only arrangement entry is the explicit captured-owner bridge API');
assert.match(canvasPort, /setNodeGeometry: UnsupportedCanvasWrite/,
  'generic Canvas geometry writes remain explicitly unsupported');
assert.match(collectionSource, /semantic = membership \?\? \{[\s\S]*?kind: 'drop-exclusion'/,
  'an unresolved visible collection remains a rejection target rather than falling through to the Canvas');
assert.equal(fs.readFileSync(vendorPath, 'utf8'), vendorSource, 'the installed TapNow bundle remains read-only');

const runtimeDir = path.join(root, '.runtime', `native-collection-node-${Date.now()}`);
const output = path.join(runtimeDir, 'native-collection.js');
await buildPilotEntry('lab/pilot/native-collection-ui.tsx', output, 'browser', {
  nativeReact: true,
  sourceTransforms: createNativeTextSourceTransforms(),
  env: {
    LCOS_CORE_URL: '/api/lcos/core',
    LCOS_CORE_TOKEN: '',
    PROJECT_ID: 'disposable-surface-core-facade',
  },
  sourceOverrides: {
    'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts',
  },
});

const bundle = fs.readFileSync(output, 'utf8');
assert.match(bundle, /CollectionNodePresentation/, 'the target browser bundle contains the existing collection face');
assert.match(bundle, /CanonicalCollectionView/, 'the same bundle retains Core-backed canonical member reads');
assert.match(bundle, /CollectionMembersMenu/, 'selected original collection face retains the existing member menu');
assert.match(bundle, /data-lcos-native-open-collection-work-window/,
  'the existing collection node includes its explicit Work View action in the browser bundle');
assert.match(bundle, /data-lcos-native-collection-availability/, 'the bundle exposes honest ready/unavailable owner state');
assert.match(bundle, /native-flow\.js/, 'the node density hook shares the existing ReactFlow context bridge');
assert.doesNotMatch(bundle, /react-dom\/client/, 'the leaf does not create a second React root');
assert.doesNotMatch(collectionSource, /ReactFlowProvider|<ReactFlow/,
  'the leaf does not create a second ReactFlow provider or Canvas');
assert.match(bundle, /data-member-read-status/, 'the original member read status remains visible in the adapted bundle');

console.log(JSON.stringify({
  test: 'native-collection-node',
  tapNowBundle: path.relative(root, vendorPath).replaceAll('\\', '/'),
  originalReactFlowRoots: roots,
  transform: 'original nodeTypes map extended once; idempotence, drift rejection, unchanged unrelated chunks',
  body: 'existing CollectionNodePresentation + canonical Core member view',
  owner: 'exact Canvas/API/Project/active Surface/Workspace + Core collection ref',
  management: 'original Work View and member menu; first-open/display toggle and existing-menu arrangement require their narrow original bridge APIs and exact group identity',
  bundle: path.relative(root, output).replaceAll('\\', '/'),
  sharedReact: true,
  secondReactRootOrCanvas: false,
}, null, 2));
