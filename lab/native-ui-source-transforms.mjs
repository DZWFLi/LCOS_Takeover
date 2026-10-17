import { createNativeTextSourceTransforms } from './native-text-source-transforms.mjs';
import { nativeSavedContextAtlasSource, transformNativeSavedContextAtlas } from './native-saved-context-transform.mjs';
import { nativeWorkflowCardPoolSource, transformNativeWorkflowCardPool } from './native-workflow-source-transform.mjs';
import { transformNativeDensityHook } from './native-density-transform.mjs';
import { nativeMaterialPeekSource, transformNativeMaterialPeek } from './native-material-peek-transform.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentGen2Root } from './current-gen2-resources.mjs';
import { createNativeLibraryDropOwnerSourceTransforms, transformNativeLibraryDropFeedbackOverlay } from './native-library-drop-owner-source-transform.mjs';
import { transformNativeLibraryMaterialOverlay } from './native-library-material-overlay-transform.mjs';
import { nativeCoreColorPinClientSource, transformNativeCoreColorPinClient } from './native-core-color-pin-transform.mjs';

export const nativeCanonicalCollectionViewSource = 'lcos/huabu/apps/web/src/lcos/nodes/CanonicalCollectionView.tsx';
export const nativeCollectionMembersMenuSource = 'lcos/huabu/apps/web/src/lcos/nodes/CollectionMembersMenu.tsx';

/** Preserve callbacks supplied by the native folder adapter when the mature
 * CanonicalCollectionView caller does not provide an overriding top-level one.
 * The Gen1 face remains the sole owner of pointer/keyboard/disabled guards. */
export function transformNativeCanonicalCollectionView(source, { sourcePath } = {}) {
  const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const expectedPath = path.resolve(workspaceRoot, nativeCanonicalCollectionViewSource);
  if (typeof sourcePath !== 'string' || path.resolve(sourcePath) !== expectedPath) {
    throw new Error('Native Collection folder callback transform only applies to the exact copied CanonicalCollectionView sourcePath.');
  }
  if (typeof source !== 'string') throw new TypeError('CanonicalCollectionView source must be text.');
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  const normalized = source.replaceAll('\r\n', '\n');

  const seams = [
    {
      original: "  readonly folder?: Omit<Gen1CollectionFaceProps, 'title' | 'previews' | 'sheets' | 'count' | 'readError' | 'onRetry'>;",
      adapted: "  readonly folder?: Omit<Gen1CollectionFaceProps, 'title' | 'previews' | 'sheets' | 'count' | 'readError' | 'onRetry'> & { readonly collectionNodeId?: string; readonly onArrange?: () => boolean | Promise<boolean> };",
    },
    {
      original: "function CollectionReadView({ projectId, collectionId, density, presentation = 'compact', sizing = 'tile', folder, onReadMember, ...props }: CanonicalCollectionViewProps): React.JSX.Element {",
      adapted: "function CollectionReadView({ projectId, collectionId, density, presentation = 'compact', sizing = 'tile', folder: nativeFolder, onReadMember, ...props }: CanonicalCollectionViewProps): React.JSX.Element {\n  const { collectionNodeId: nativeCollectionNodeId, onArrange: nativeOnArrange, ...folder } = nativeFolder ?? {};",
    },
    {
      original: "  const hasCanvasHost = useCanvasStore((state) => sizing === 'canvas'\n    && state.nodes.some((node) => node.type === 'frame' && node.data?.lcosCollectionId === collectionId));",
      adapted: "  const hasCanvasHost = useCanvasStore((state) => sizing === 'canvas'\n    && state.nodes.some((node) => node.type === 'frame' && node.data?.lcosCollectionId === collectionId));\n  const hasNativeCollectionGroup = useCanvasStore((state) => sizing === 'canvas'\n    && typeof nativeCollectionNodeId === 'string'\n    && state.nodes.some((node) => node.type === 'group'\n      && node.data?.lcosCollectionId === collectionId\n      && node.data?.lcosCollectionNodeId === nativeCollectionNodeId));",
      originalIsPreserved: true,
    },
    {
      original: '    onArrange={hasCanvasHost ? arrange : undefined} />;',
      adapted: '    onArrange={hasNativeCollectionGroup && typeof nativeOnArrange === \'function\' ? nativeOnArrange : hasCanvasHost ? arrange : undefined} />;',
    },
    {
      original: 'onActivate={props.onActivate} activationLabel={props.activationLabel}',
      adapted: 'onActivate={props.onActivate ?? folder?.onActivate} activationLabel={props.activationLabel ?? folder?.activationLabel}',
    },
  ];
  const faceOwnerCount = normalized.split('<Gen1CollectionFace {...folder} title={snapshot?.collection.title ?? props.title}').length - 1;
  const installed = seams.every(({ original, adapted, originalIsPreserved = false }) =>
    normalized.split(original).length - 1 === (originalIsPreserved ? 1 : 0)
    && normalized.split(adapted).length - 1 === 1);
  if (installed && faceOwnerCount === 1) return source;
  const pristine = seams.every(({ original, adapted }) => normalized.split(original).length - 1 === 1
    && normalized.split(adapted).length - 1 === 0);
  if (!pristine || faceOwnerCount !== 1) {
    const drift = seams.map(({ original, adapted, originalIsPreserved = false }, index) => ({ index,
      original: normalized.split(original).length - 1,
      adapted: normalized.split(adapted).length - 1,
      originalIsPreserved,
    })).filter(({ original, adapted, originalIsPreserved }) => original !== (originalIsPreserved ? 1 : 0) || adapted !== 1);
    throw new Error(`CanonicalCollectionView Gen1 folder callback seam drifted, is partial, or was duplicated; no source was adapted (face=${faceOwnerCount}, seams=${JSON.stringify(drift)}).`);
  }
  return seams.reduce((current, { original, adapted }) => current.replace(original, adapted), normalized)
    .replaceAll('\n', lineEnding);
}

/** Keep the original menu's boolean result contract and unknown/error paths,
 * while making native idempotent success non-misleading about undo history. */
export function transformNativeCollectionArrangeNotice(source, { sourcePath } = {}) {
  const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const expectedPath = path.resolve(workspaceRoot, nativeCollectionMembersMenuSource);
  if (typeof sourcePath !== 'string' || path.resolve(sourcePath) !== expectedPath) {
    throw new Error('Native Collection arrange notice transform only applies to the exact copied CollectionMembersMenu sourcePath.');
  }
  if (typeof source !== 'string') throw new TypeError('CollectionMembersMenu source must be text.');

  const original = "if (mounted.current) setNotice(ok ? '成员已排好，可撤销；原材料与集合关系保留。' : '当前现场或可排列成员已变化，已保留原布局。');";
  const adapted = "if (mounted.current) setNotice(ok ? '排列已核对；如有布局变化可撤销，原材料与集合关系保留。' : '当前现场或可排列成员已变化，已保留原布局。');";
  const originalCount = source.split(original).length - 1;
  const adaptedCount = source.split(adapted).length - 1;
  if (originalCount === 0 && adaptedCount === 1) return source;
  if (originalCount !== 1 || adaptedCount !== 0) {
    throw new Error('Original Collection arrange success notice seam drifted, is partial, or was duplicated; no source was adapted.');
  }
  return source.replace(original, adapted);
}

/** Reuse the current per-message reference owner without opening the separate
 * generic Apply button before its native placement callback is connected.
 * The adopted Core already recognizes Collections; receipt alone is not landing. */
export function transformNativeCollectionDraft(source, currentSource) {
  const marker = '/** Per-message reference is not AssemblyApply: use an existing address, never materialize on pick. */';
  if (source.split(marker).length !== 2 || currentSource.split(marker).length !== 2) {
    throw new Error('Assembly draft reference owner changed; no partial adaptation was applied.');
  }
  const prefix = source.slice(0, source.indexOf(marker));
  const draft = currentSource.slice(currentSource.indexOf(marker));
  if (!/case 'collection':\s*return undefined;/.test(prefix)
    || !draft.includes("if (item.kind === 'collection') return { entityType: 'collection', entityId: item.entityRef.id, displayLabel: item.title };")) {
    throw new Error('Collection draft/Apply ownership changed; original generic Apply protection must remain.');
  }
  return prefix + draft;
}

/** A successful original materialization has already committed the reference.
 * Refresh through the existing controller; its read failure must not turn into
 * a materialization retry or clear that committed reference. */
export function transformNativeAssemblyMaterializedRefresh(source) {
  const original = '      setReferenceRetry(undefined); setReferenceNotice(`已加入 ${count} 项本次引用，尚未发送。`); setSelectedIds([]);';
  const refreshed = original + '\n      controller.reloadWarehouse();';
  if (source.includes(refreshed) && source.split(original).length === 2) return source;
  if (source.split(original).length !== 2) {
    throw new Error('Original Assembly materialization success seam changed; no partial adaptation was applied.');
  }
  return source.replace(original, refreshed);
}

export function transformNativeCollectionPlacement(source) {
  const apiImport = "import { getCanvas } from '@/api/canvas';";
  const storeImport = "import useCanvasStore, { drainPendingSaves } from '@/store/canvasStore';";
  const hostImport = "import type { Gen2Host } from '@local-creative-os/web-gen2';";
  const originalGeometry = "  canvas.beginGesture('SET_NODE_GEOMETRY');\n  canvas.setNodeGeometry(geometry);";
  const savedComparison = 'placed.some(id => !placementMatches(getAbsolutePosition(nodes, id), point))';
  const normalized = source.replaceAll('\r\n', '\n');
  for (const seam of [apiImport, storeImport, hostImport, originalGeometry, savedComparison]) {
    if (normalized.split(seam).length !== 2) throw new Error('Original Collection placement seam changed; no partial adaptation was applied.');
  }
  return "import { nativeCollectionSavedPlacementMatches } from '../../../../../../../lab/pilot/native-collection-save-precision.mjs';\n" + normalized.replace(apiImport,
    "import { readNativeCollectionCanvas as getCanvas, drainNativeCollectionSaves as drainPendingSaves, commitNativeCollectionGeometry } from '../../../../../../../lab/pilot/native-collection-placement.ts';")
    .replace(storeImport, "import useCanvasStore from '@/store/canvasStore';")
    .replace(hostImport, "import type { NativeCollectionPlacementHost as Gen2Host } from '../../../../../../../lab/pilot/native-collection-placement.ts';")
    .replace(originalGeometry, '  if (planned[0]) await commitNativeCollectionGeometry({ projectId, canvasId,\n    collectionId: planned[0].collectionId, nodeId: planned[0].nodeId, position: geometry[0]!.position });')
    .replace(savedComparison, 'placed.some(id => !nativeCollectionSavedPlacementMatches(getAbsolutePosition(nodes, id), point))');
}

export function transformNativeCollectionOverlay(source) {
  const original = '    const placementHost = useLcosHostStore.getState().host;';
  const comparison = 'useLcosHostStore.getState().host === placementHost';
  const target = "    const targetRef = activeSurface === 'main'\n      ? { kind: 'main' as const }\n      : activeWorkspaceId === null\n        ? undefined\n        : { kind: 'workspace' as const, id: activeWorkspaceId };";
  const hook = '  const canvasWrapper = useCanvasStore((state) => state.canvasWrapper);';
  const dependencies = '    activeSurface,\n    activeWorkspaceId,\n    canvasId,\n    canvasWrapper,';
  const normalized = source.replaceAll('\r\n', '\n');
  if ([original, comparison, target, hook, dependencies].some(seam => normalized.split(seam).length !== 2)) {
    throw new Error('Original Collection drop owner seam changed; no partial adaptation was applied.');
  }
  return "import { createNativeCollectionPlacementHost } from '../../../../../../lab/pilot/native-collection-placement.ts';\n"
    + "import { useNativeWorksiteDropTarget } from '../../../../../../lab/pilot/native-worksite-drop.ts';\n"
    + normalized.replace(original, '    const placementHost = createNativeCollectionPlacementHost(projectId, dropCanvasId);')
      .replace(comparison, 'placementHost?.isCurrent() === true')
      .replace(hook, '  const nativeWorksiteTargetRef = useNativeWorksiteDropTarget(projectId, canvasId, activeSurface, activeWorkspaceId);\n' + hook)
      .replace(target, '    const targetRef = nativeWorksiteTargetRef;')
      .replace(dependencies, '    nativeWorksiteTargetRef,\n' + dependencies);
}

function transformNativeComposerLayer(source) {
  const originalImport = "import { CoreCollaborationClient, HttpError } from '@local-creative-os/web-gen2';";
  const layeredImport = "import { HttpError, overlayLayers } from '@local-creative-os/web-gen2';\nimport { NativeCoreCollaborationClient as CoreCollaborationClient } from '../../../../../../../lab/pilot/native-collaboration-client.ts';";
  const originalProps = 'className="lcos-composer-float" boundaryRect={floatingBoundary} exitDuration={140}';
  const layeredProps = `${originalProps} style={{ zIndex: overlayLayers.composer }}`;
  const originalDelegate = /([ \t]+refs,\r?\n[ \t]*}\))\)\);/g;
  const guardedDelegate = /[ \t]+refs,\r?\n[ \t]*}\), undefined, isCurrent\)\);/g;
  if (source.includes(layeredImport) && source.includes(layeredProps)
    && [...source.matchAll(guardedDelegate)].length === 1) return source;
  if (source.split(originalImport).length !== 2 || source.split(originalProps).length !== 2
    || [...source.matchAll(originalDelegate)].length !== 1) {
    throw new Error('Original Composer layer seam changed; no partial source adaptation was applied.');
  }
  return source.replace(originalImport, layeredImport).replace(originalProps, layeredProps)
    .replace(originalDelegate, '$1, undefined, isCurrent));');
}

/** Respect the existing disabled contract in its sole automatic data writer.
 * Keep real node identity; a read-only accepted View must not clear preferences
 * when canonical body changes. Editable primary text retains its old behavior. */
export function transformNativeTextReadOnlyEffects(source) {
  const original = '    previousBody.current = markdown;';
  const guarded = original + '\n    if (disabled) return;';
  const dependencies = '}, [markdown, nodeId, storedCollapsed]);';
  const guardedDependencies = '}, [markdown, nodeId, storedCollapsed, disabled]);';
  if (source.includes(guarded) || source.includes(guardedDependencies)) {
    if (source.split(guarded).length !== 2 || source.split(original).length !== 2
      || source.split(guardedDependencies).length !== 2 || source.includes(dependencies)) {
      throw new Error('Original TextFaces read-only effect seam changed; partial/duplicate adaptation is not accepted.');
    }
    return source;
  }
  if (source.split(original).length !== 2 || source.split(dependencies).length !== 2 || source.includes('    if (disabled) return;\n    if (Array.isArray(storedCollapsed)')) {
    throw new Error('Original TextFaces read-only effect seam changed; no partial adaptation was applied.');
  }
  return source.replace(original, guarded).replace(dependencies, guardedDependencies);
}

/** Live and tests share the same precise donor adaptations, not a second runtime. */
export function createNativeUiSourceTransforms({ nativeRailPilot = false } = {}) {
  const text = createNativeTextSourceTransforms();
  const textFaces = 'lcos/huabu/apps/web/src/lcos/nodes/text/LcosTextFaces.tsx';
  const collectionSource = 'lcos/huabu/apps/web/src/lcos/professional/assemblySourceRef.ts';
  const currentCollectionSource = fs.readFileSync(path.join(currentGen2Root,
    'huabu/apps/web/src/lcos/professional/assemblySourceRef.ts'), 'utf8');
  return {
    ...text,
    ...createNativeLibraryDropOwnerSourceTransforms(),
    ...(nativeRailPilot ? { [nativeMaterialPeekSource]: transformNativeMaterialPeek,
      [nativeCoreColorPinClientSource]: transformNativeCoreColorPinClient } : {}),
    [textFaces]: (source, context) => transformNativeTextReadOnlyEffects(text[textFaces](source, context)),
    [nativeSavedContextAtlasSource]: transformNativeSavedContextAtlas,
    [nativeWorkflowCardPoolSource]: transformNativeWorkflowCardPool,
    [nativeCanonicalCollectionViewSource]: transformNativeCanonicalCollectionView,
    [nativeCollectionMembersMenuSource]: transformNativeCollectionArrangeNotice,
    // Identical query-only import seam, already used by the density hook.
    // Keep the mature floating owner; read the shipped Flow provider instead.
    'lcos/huabu/apps/web/src/components/Common/CanvasFloatingPopover.tsx': transformNativeDensityHook,
    // Its existing style prop overrides generic canvas chrome (1000) with the
    // existing LCOS layer; positioning/focus/modal/drop ownership stay intact.
    'lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx': transformNativeComposerLayer,
    [collectionSource]: source => transformNativeCollectionDraft(source, currentCollectionSource),
    'lcos/huabu/apps/web/src/lcos/professional/AssemblyBody.tsx': transformNativeAssemblyMaterializedRefresh,
    'lcos/huabu/apps/web/src/lcos/LcosHostOverlay.tsx': (source, context) => transformNativeLibraryDropFeedbackOverlay(
      transformNativeLibraryMaterialOverlay(transformNativeCollectionOverlay(source)), context),
    'lcos/huabu/apps/web/src/lcos/drop/assemblyCollectionPlacement.ts': transformNativeCollectionPlacement,
  };
}
