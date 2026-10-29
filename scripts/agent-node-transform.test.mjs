import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { nativeReferencePickOwner, transformNativeReferencePickSource } from '../lab/native-reference-pick-source-transform.mjs';
import { createNativeUiSourceTransforms, transformNativeTextReadOnlyEffects } from '../lab/native-ui-source-transforms.mjs';
import { nativeComposerSourceOverride } from '../lab/native-composer-source-transform.mjs';
import { withNativeChatSourceTransforms } from '../lab/native-chat-owner-transform.mjs';
import { transformAgentNodeScript, countAgentNodeReactFlowRoots } from '../lab/agent-node-transform.mjs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformRendererScript } from '../lab/startup-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryName = 'page-Da_DfwiK.js';
const sourceFile = path.join(workspaceRoot, 'reference/tapnow-installed/resources/web/assets', entryName);
const source = fs.readFileSync(sourceFile, 'utf8');
const textFacesPath = 'lcos/huabu/apps/web/src/lcos/nodes/text/LcosTextFaces.tsx';
const textFacesSource = fs.readFileSync(path.join(workspaceRoot, textFacesPath), 'utf8');
const guardedTextFaces = transformNativeTextReadOnlyEffects(textFacesSource);
assert.equal(guardedTextFaces, textFacesSource.replace('    previousBody.current = markdown;',
  '    previousBody.current = markdown;\n    if (disabled) return;').replace('}, [markdown, nodeId, storedCollapsed]);',
  '}, [markdown, nodeId, storedCollapsed, disabled]);'), 'only the automatic effect respects existing disabled; no fake node identity');
assert.equal(transformNativeTextReadOnlyEffects(guardedTextFaces), guardedTextFaces);
assert.throws(() => transformNativeTextReadOnlyEffects(guardedTextFaces.replace('storedCollapsed, disabled]);', 'storedCollapsed]);')),
  /partial\/duplicate/, 'half-installed read-only policy must not be silently accepted');
assert.throws(() => transformNativeTextReadOnlyEffects(textFacesSource.replace('previousBody.current = markdown;', 'previousBody.current = nextBody;')),
  /read-only effect seam changed/);
const effectBody = guardedTextFaces.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[markdown, nodeId, storedCollapsed, disabled\]\);/)?.[1];
assert(effectBody, 'the exact guarded original effect is observable');
const executeEffect = new Function('previousBody', 'markdown', 'nodeId', 'storedCollapsed', 'disabled', 'useCanvasStore', effectBody);
const effectWrites = [];
const effectStore = { getState: () => ({ updateNodeData: (...args) => effectWrites.push(args) }) };
executeEffect({ current: 'before' }, 'after', 'real-result-node', ['h1'], true, effectStore);
assert.equal(effectWrites.length, 0, 'actual disabled effect never clears read-only result preferences');
executeEffect({ current: 'before' }, 'after', 'real-primary-node', ['h1'], false, effectStore);
assert.deepEqual(effectWrites, [['real-primary-node', { lcosTextCollapsedIds: [] }]], 'editable primary keeps the original automatic cleanup');
assert.equal(fs.readFileSync(path.join(workspaceRoot, textFacesPath), 'utf8'), textFacesSource, 'donor TextFaces stays byte-identical');
const floatingPopoverPath = 'lcos/huabu/apps/web/src/components/Common/CanvasFloatingPopover.tsx';
const floatingPopoverSource = fs.readFileSync(path.join(workspaceRoot, floatingPopoverPath), 'utf8');
const adaptFloatingPopover = createNativeUiSourceTransforms()[floatingPopoverPath];
assert.equal(typeof adaptFloatingPopover, 'function', 'the same live/test registry ports the mature floating query hooks');
const adaptedFloatingPopover = adaptFloatingPopover(floatingPopoverSource);
assert.equal(adaptedFloatingPopover, floatingPopoverSource.replace(
  "import { useStore, useViewport } from '@xyflow/react';",
  "import { useStore, useViewport } from '/lcos/native-flow.js';"),
  'only the query-hook dependency changes; focus, dismissal, avoidance, portal and positioning behavior remain original');
assert.equal(adaptFloatingPopover(adaptedFloatingPopover), adaptedFloatingPopover, 'the floating query seam is idempotent');
assert.equal(fs.readFileSync(path.join(workspaceRoot, floatingPopoverPath), 'utf8'), floatingPopoverSource,
  'the copied floating source stays byte-identical');
const composerPath = 'lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx';
const composerSource = fs.readFileSync(path.join(workspaceRoot, composerPath), 'utf8');
const adaptComposer = createNativeUiSourceTransforms()[composerPath];
assert.equal(typeof adaptComposer, 'function');
const layeredComposer = adaptComposer(composerSource);
assert.equal(layeredComposer, composerSource.replace(
  "import { CoreCollaborationClient, HttpError } from '@local-creative-os/web-gen2';",
  "import { HttpError, overlayLayers } from '@local-creative-os/web-gen2';\nimport { NativeCoreCollaborationClient as CoreCollaborationClient } from '../../../../../../../lab/pilot/native-collaboration-client.ts';").replace(
  'className="lcos-composer-float" boundaryRect={floatingBoundary} exitDuration={140}',
  'className="lcos-composer-float" boundaryRect={floatingBoundary} exitDuration={140} style={{ zIndex: overlayLayers.composer }}')
  .replace(/([ \t]+refs,\r?\n[ \t]*}\))\)\);/g, '$1, undefined, isCurrent));'),
  'only client import, existing identity guard argument and popover style change; draft, focus, modal and drop owners remain original');
assert.equal(adaptComposer(layeredComposer), layeredComposer, 'layer mapping is idempotent');
assert.throws(() => adaptComposer(composerSource.replace('exitDuration={140}', 'exitDuration={141}')),
  /layer seam changed/, 'source drift must not produce a partial adaptation');
assert.equal(fs.readFileSync(path.join(workspaceRoot, composerPath), 'utf8'), composerSource,
  'the copied Composer source stays byte-identical');
assert.match(fs.readFileSync(path.join(workspaceRoot, 'lab/pilot/native-workflow-host.tsx'), 'utf8'),
  /style=\{\{ position: 'relative', zIndex: overlayLayers\.workView \}\}/,
  'the original hand keeps its layout in the existing work-view stacking context');

function applyExistingServeTransforms(input) {
  const started = transformRendererScript(entryName, input);
  const cut = transformCutScript(entryName, started);
  const bridged = transformNodeBridgeScript(entryName, cut)
    .replace('VITE_FILE_ACCESS_URL:""', 'VITE_FILE_ACCESS_URL:window.location.origin');
  const docked = transformSurfaceDockScript(entryName, bridged);
  return transformHistoryIntentScript(entryName, docked);
}

const rawLFFunctionStart = source.indexOf('LF=()=>{const e=Ks(a=>a.isOpen)');
const rawLFFunctionEnd = source.indexOf(',Xa=({node:', rawLFFunctionStart);
assert(rawLFFunctionStart >= 0 && rawLFFunctionEnd > rawLFFunctionStart, 'canonical LF function markers are present');
const rawLFFunction = source.slice(rawLFFunctionStart, rawLFFunctionEnd);
const canonicalPanelCall = 'r.jsx(YT,{isOpen:s&&e,onClose:o})';
assert.equal(rawLFFunction.split(canonicalPanelCall).length - 1, 1, 'canonical LF renders one original AgentSidebar');
const adaptedLFFunction = rawLFFunction.replace(canonicalPanelCall,
  'r.jsx(LCOSConnectedConversationPanel,{isOpen:s&&e,onClose:o,NativeFrame:LCOSNativeChatFrame,NativeMessages:LCOSNativeMessages,NativeComposerParts:LCOSNativeComposerParts})')
  .replace('return r.jsx(eP,', 'l.useEffect(()=>{const a=()=>t(!0),b=()=>{if(!rp.getState().isOpen)document.querySelector(\'[data-testid="canvas-dockbar-assets-btn"]\')?.click()};window.addEventListener("lcos-native-open-conversation",a);window.addEventListener("lcos-native-open-library",b);return()=>{window.removeEventListener("lcos-native-open-conversation",a);window.removeEventListener("lcos-native-open-library",b)}},[t]);return r.jsx(eP,');
const cutLFFunction = 'LF=()=>window.__LCOS_CUSTOM_PANEL__?.render(r)||null';

function assertOnlyAgentSeamChanged(before, after) {
  const importLine = 'import{LCOSConversationNode,LCOSExecutionNode,LCOSResultMaterialNode,LCOSCollectionNode,LCOSConnectedConversationPanel,LCOSProfessionalHost}from"/lcos/agent-ui.js";\n';
  assert.equal(after.split(importLine).length - 1, 1, 'the native renderer import is added once');
  const viewerImport = 'import{LCOSNativeMaterialViewerRuntime,LCOSNativeViewerParts}from"./course-api-base-url-CifxI1ia.js";\n';
  assert.equal(after.split(viewerImport).length - 1, 1, 'one bridge to the actual original Viewer session and parts');
  const thoughtRenderer = 'function LCOSNativeConversationNodeWithParts(e){return r.jsx(LCOSConversationNode,{...e,NativePopover:pr,NativeButton:LCOSNativeViewerParts.ActionButton})}';
  assert.equal(after.split(thoughtRenderer).length - 1, 1, 'one module-level conversation renderer supplies original parts without recreating a node type each render');
  const leaf = {}, popover = {}, button = {}, captured = [];
  const render = new Function('r', 'LCOSConversationNode', 'pr', 'LCOSNativeViewerParts',
    `${thoughtRenderer};return LCOSNativeConversationNodeWithParts;`)(
      { jsx: (component, props) => { captured.push({ component, props }); return props; } }, leaf, popover, { ActionButton: button });
  const data = { exact: 'original node data' }, ordinaryProps = { id: 'real-node', selected: true, data };
  render(ordinaryProps); render({ ...ordinaryProps, selected: false });
  assert.equal(captured.length, 2); assert.equal(captured[0].component, leaf);
  assert.equal(captured[0].props.data, data); assert.equal(captured[1].props.data, data);
  assert.equal(captured[0].props.NativePopover, popover); assert.equal(captured[0].props.NativeButton, button);
  assert.deepEqual(ordinaryProps, { id: 'real-node', selected: true, data }, 'parts are props, never a node-data write');
  const withoutImport = after.replace(importLine, '').replace('import{LCOSNativeChatFrame,LCOSNativeMessages,LCOSNativeComposerParts}from"./agent-host-provider-uVo_bky5.js";\n', '').replace(viewerImport, '').replace(`${thoughtRenderer}\n`, '');
  const hostPattern = /,([A-Za-z_$][\w$]*)\.jsx\(LCOSProfessionalHost,\{NativeComposerParts:LCOSNativeComposerParts,NativeViewerRuntime:LCOSNativeMaterialViewerRuntime,NativeViewerParts:\{\.\.\.LCOSNativeViewerParts,Popover:pr\}\}\)(?=\])/g;
  const hostMatches = [...withoutImport.matchAll(hostPattern)];
  assert.equal(hostMatches.length, 1, 'one integration host receives the original Viewer/Popover and follows the original NodeBridge');
  const withoutHost = withoutImport.replace(hostPattern, '');
  const mapPattern = /nodeTypes:\(\{\.\.\.([A-Za-z_$][\w$]*),"lcos-conversation":LCOSNativeConversationNodeWithParts,"lcos-execution":LCOSExecutionNode,"lcos-result-material":LCOSResultMaterialNode,"lcos-collection":LCOSCollectionNode\}\)/g;
  const matches = [...withoutHost.matchAll(mapPattern)];
  assert.equal(matches.length, 1, 'one original map is extended with conversation/execution/accepted-material leaves');
  const baseMap = matches[0][1];
  const restoredMap = withoutHost.replace(mapPattern, `nodeTypes:${baseMap}`);
  assert.equal(restoredMap.split(adaptedLFFunction).length - 1, 1,
    'the canonical LF body is reused with only its original panel component swapped');
  const restored = restoredMap.replace(adaptedLFFunction, cutLFFunction);
  assert.equal(restored, before, 'only the recognized cut LF stub, nodeTypes map, and local UI import changed');
}

const servedSource = applyExistingServeTransforms(source);
assert(servedSource.includes(cutLFFunction), 'the existing cut chain exposes the exact LF stub seam');
assert.throws(() => transformAgentNodeScript(entryName, source), /expects the exact cut LF stub/,
  'the transform refuses to replace the uncut canonical LF or arbitrary user code');
const rootsBefore = countAgentNodeReactFlowRoots(servedSource, entryName);
assert.equal(rootsBefore, 1, 'the shipped renderer has one ReactFlow root');
const transformed = transformAgentNodeScript(entryName, servedSource);
assert.equal(countAgentNodeReactFlowRoots(transformed, entryName), rootsBefore,
  'the collection renderer extends the original ReactFlow root in place');
assertOnlyAgentSeamChanged(servedSource, transformed);
assert.equal(transformAgentNodeScript(entryName, transformed), transformed,
  'the transform is idempotent after the named node registration is installed');
assert.throws(() => transformAgentNodeScript(entryName, transformed.replace(',"lcos-collection":LCOSCollectionNode', '')),
  /partially installed/, 'missing collection registration cannot silently downgrade the original map');
assert.throws(() => transformAgentNodeScript(entryName, transformed.replace('NativePopover:pr,NativeButton:', 'NativePopover:wrong,NativeButton:')),
  /stable thought renderer/, 'an altered original Popover binding cannot silently change the node leaf');
assert.throws(() => transformAgentNodeScript(entryName, transformed.replace('function LCOSNativeConversationNodeWithParts(e)', 'function OtherRenderer(e)')),
  /partially installed/, 'a missing stable renderer is not accepted as an installed node map');

assert.equal(transformAgentNodeScript('other-page.js', source), source,
  'unrelated page chunks pass through untouched');

const runtimeDir = path.join(workspaceRoot, '.runtime', `native-agent-ui-test-${Date.now()}`);
const outputFile = path.join(runtimeDir, 'agent-ui.js');
await buildPilotEntry('lab/pilot/native-agent-ui.tsx', outputFile, 'browser', {
  sourceTransforms: { ...withNativeChatSourceTransforms(createNativeUiSourceTransforms()),
    [nativeReferencePickOwner]: transformNativeReferencePickSource },
  nativeReact: true,
  env: {
    LCOS_CORE_URL: '/api/lcos/core',
    LCOS_CORE_TOKEN: '',
    PROJECT_ID: 'disposable-surface-core-facade',
  },
  sourceOverrides: {
    ...nativeComposerSourceOverride,
    'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts',
    'lcos/huabu/apps/web/src/lcos/professional/NativeWorkspaceBody.tsx': 'lab/pilot/native-professional-host.tsx',
  },
});

const bundle = fs.readFileSync(outputFile, 'utf8');
const cssFile = path.join(runtimeDir, 'agent-ui.css');
const css = fs.readFileSync(cssFile, 'utf8');
const publicAssets = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'public-assets.json'), 'utf8'));
assert.match(bundle, /\/lcos\/native-react\.js/, 'the extension shares the host React runtime');
assert.match(bundle, /\/lcos\/native-jsx-runtime\.js/, 'JSX uses the host runtime');
assert.match(bundle, /\/lcos\/native-router\.js/, 'existing professional bodies reuse the original Router context');
assert.match(bundle, /\/lcos\/assets\/search\.svg/, 'native UI image URLs are absolute in the same served asset namespace');
assert.doesNotMatch(bundle, /["']\/assets\/assets\/(?:loading|search|more)\.svg["']/,
  'native asset imports must not leak into the vendor asset namespace');
assert.doesNotMatch(bundle, /function useNavigateUnstable\(/, 'the extension does not bundle a second Router hook owner');
assert.doesNotMatch(bundle, /react-dom\/client/, 'the extension does not create a second React root');
assert.doesNotMatch(bundle, /__require\(["']\/lcos\/native-(?:react|jsx-runtime|react-dom|router)\.js["']\)/,
  'CommonJS interop cannot dynamically require native ESM host shims at runtime');
assert.match(bundle, /runtime\/providers/, 'the Agent entry reads Core runtime provider status');
assert.match(bundle, /NativeCoreCollaborationClient/, 'the active original Composer imports the thin canonical delegation adapter');
assert.match(bundle, /routingConversations\.listConnectedConversations/,
  'delegate routing reads the original project conversation owner, not UI labels or a second registry');
assert.match(bundle, /conversations:reconcile/, 'the Agent entry uses the canonical Huabu reconcile route');
assert.match(bundle, /LCOSConnectedConversationPanel/, 'the controlled local Agent panel is in the native bundle');
assert.match(bundle, /ProfessionalWindowStage/, 'the host imports the original professional window stage');
assert.match(bundle, /ConversationWorkViewBody/, 'the stage uses the original complete conversation body');
assert.match(bundle, /ConversationEventView/, 'the original event renderer remains in the composition');
assert.match(bundle, /lcos-native-bridge-changed/, 'the native Canvas adapter rebinds after bridge lifetime changes');
assert.match(bundle, /current TapNow Canvas and existing Core\/Huabu producer are not mapped/,
  'unmapped Canvas writes fail with the accurate boundary');
assert.match(bundle, /\/api\/surface-core\/status/, 'the stage host reads a real Core surface map');
assert.match(bundle, /data-lcos-professional-surface-state/, 'surface mapping remains observable without inventing a fallback');
assert.match(bundle, /data-lcos-native-workspace-unavailable/, 'the nested legacy Canvas body stays honestly unavailable');
assert.doesNotMatch(fs.readFileSync(path.join(workspaceRoot, 'lab/pilot/native-agent-ui.tsx'), 'utf8'), /\.addNodes\s*\(/,
  'conversation placement must not duplicate the canonical projector; the separate text branch producer may legitimately call original addNodes');
assert.match(bundle, /LCOSNativeLibraryContexts/, 'Saved Context and methods are rendered by the original Library list owner');
assert.match(bundle, /LCOSNativeLibraryContextDetail/, 'exact Core membership and method actions enter the original TS detail slots');
assert.match(bundle, /createNativeContextReferencePort/, 'context membership retains the canonical preview/apply owner');
assert.doesNotMatch(fs.readFileSync(path.join(workspaceRoot, 'lab/pilot/native-agent-ui.tsx'), 'utf8'),
  /NativeSavedContextAtlas|NativeWorkflowHand|createPortal/, 'Agent no longer mounts separate Atlas or Hand pages');
assert.match(bundle, /NativeRunList/, 'the original Agent panel can reopen canonical Core Runs after reload');
// The original task View owns its DOM rows now; the former button data marker
// no longer exists. Execute the actual list callback instead of inferring its
// Run admission from an obsolete marker or a bundled component name.
const runListSource = fs.readFileSync(path.join(workspaceRoot, 'lab/pilot/native-run-list.tsx'), 'utf8');
const openRunSource = runListSource.match(/  const openRun = \(runId: string\): void => \{[\s\S]*?^  \};/m)?.[0];
assert.ok(openRunSource); assert.ok(runListSource.includes('onSelect={openRun}'));
const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
const openRunJs = ts.transpileModule(openRunSource, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText;
for (const mode of ['exact','missing','duplicate','foreign','wrong-dispatch','changed-owner']) {
  const owner = {}, calls = [], errors = [], review = { run: { id: 'actual-run', projectId: 'p' }, dispatch: { runId: 'actual-run' } };
  if (mode === 'foreign') review.run.projectId = 'other';
  if (mode === 'wrong-dispatch') review.dispatch.runId = 'other';
  const model = { status: 'ready', owner, reviews: mode === 'missing' ? [] : mode === 'duplicate' ? [review, review] : [review] };
  const open = new Function('visibleModel','projectId','canvasId','captureCurrentOwner','sameOwner','setActionError','setModel','onOpen', openRunJs + ';return openRun;')(
    model, 'p', 'c', () => mode === 'changed-owner' ? {} : owner, (a,b) => a === b,
    value => { if (value) errors.push(value); }, () => {}, id => calls.push(id));
  open('actual-run');
  assert.equal(calls.length, mode === 'exact' ? 1 : 0, 'actual Run callback admission: ' + mode);
  if (mode === 'exact') assert.equal(calls[0], 'actual-run'); else assert.equal(errors.length, 1);
}
assert.ok(bundle.includes('nativeChatTaskRoute') && bundle.includes('lcos-native-open-task'), 'the current original task route bridge remains bundled');
assert.match(bundle, /RunWorkViewBody/, 'Run entry opens the existing complete Review body');
assert.match(bundle, /LCOSExecutionNode/, 'same native map exports original execution body leaf');
assert.match(bundle, /LCOSResultMaterialNode/, 'accepted materials use a distinct read-only exact-view leaf');
assert.match(bundle, /LCOSCollectionNode/, 'canonical collection carriers use the new same-canvas leaf');
assert.match(bundle, /CollectionNodePresentation/, 'the native collection leaf reuses the original collection presentation');
assert.match(bundle, /lcos-collection/, 'the original nodeTypes owner has the canonical collection registration');
assert.match(bundle, /ExecutionNodeBody/, 'execution facts render through the existing LCOS body, not a task-store imitation');
assert.match(bundle, /nativeLibraryMethodText/, 'method body is projected from canonical workflow fields in the native detail');
assert.match(bundle, /appendWorkflowMethodDraft/, 'method take uses the original Composer draft helper');
assert.match(bundle, /LCOSNativeLibraryNavigationOwner/, 'context/workflow entry delegates to the original switch/preflight caller');
assert.doesNotMatch(fs.readFileSync(path.join(workspaceRoot, 'lab/pilot/native-workflow-host.tsx'), 'utf8'),
  /(?:import|<)\s*(?:WorkflowWorksite|LcosWorksiteStage|LcosComposerHost|LcosHostOverlay)\b/,
  'the Workflow leaf cannot add a second Canvas or duplicate the existing Composer owner');
assert.match(css, /lcos-glyth-presence/, 'the original Glyth donor styles are included');
assert.match(css, /lcos-conversation-event/, 'the original conversation event styles are included');
assert(publicAssets.includes('agent-ui.css'), 'the emitted stylesheet is listed for the existing runtime asset server');

console.log(JSON.stringify({
  source: path.relative(workspaceRoot, sourceFile).replaceAll('\\', '/'),
  sourceBytes: Buffer.byteLength(source),
  existingServeTransforms: ['startup', 'cut', 'nodeBridge', 'surfaceDock', 'history'],
  originalReactFlowRoots: 1,
  transform: 'single nodeTypes map extension + canonical LF restore + same-root ProfessionalHost child; original isOpen policy and close callback preserved',
  canonicalSidebarPolicy: 'Da() / mergedPolicy.agent.enabled preserved',
  localPanelActions: 'Core projection + original Chatbox frame/U5/controlled Composer + native Library contexts/methods; no provider execution',
  professionalHost: 'original stage + conversation body/event renderer; same root via React portal; Core current-canvas map',
  canvasAdapter: 'original NodeBridge subscribe; no second Canvas store; unsupported writes remain explicit',
  nativeReactBundle: path.relative(workspaceRoot, outputFile).replaceAll('\\', '/'),
  nativeReactShared: true,
  reactDomClientImported: false,
  donorCssIncluded: true,
}, null, 2));
