import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copiedRoot = path.join(workspaceRoot, 'lcos');
export const currentGen2Root = 'E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926';

// Deliberately explicit existing-owner dependency closures, not an automatic
// whole-tree upgrade or a second implementation. Current source stays read-only.
export const currentGen2Resources = [
  ['apps/local-core/src/metadata-repository.ts', 'Core original composite text/Capture transaction'],
  ['apps/local-core/src/text-artifact-service.ts', 'Core original text producer with Capture staging receipt'],
  ['apps/local-core/src/capture-space-service.ts', 'Core Capture exact receipt, order, retry and original materialization'],
  ['apps/local-core/src/capture-title.ts', 'Core human title policy; transport reference remains identity'],
  ['apps/local-core/src/import-copy-service.ts', 'Core existing ImportCopy and original native image claim'],
  ['apps/local-core/src/resources/universal-resource-import-service.ts', 'Core original Resource import; MIME-aware bounded preview'],
  ['apps/local-core/src/resources/analyzers/fallback-analyzer.ts', 'Core original fallback analyzer; no binary-as-text summary'],
  ['apps/local-core/src/search-artifact-body.ts', 'Existing UTF-8 capability/full-reader dependency, not a new Run executor'],
  ['apps/local-core/src/collection-content.ts', 'Original read-only complete Collection content and member provenance'],
  ['apps/local-core/src/context-manifest-service.ts', 'Original Run manifest with exact full text and complete Collection references'],
  ['apps/local-core/src/conversation-import-service.ts', 'Original saved conversation reader and source completeness inspection'],
  ['apps/local-core/src/conversation-continuation-service.ts', 'Original continuation context resolution and retained member evidence'],
  ['apps/local-core/src/runtime-application-service.ts', 'Original Run application and shared conversation reader injection'],
  ['apps/local-core/src/compose.ts', 'Original Core composition with one shared ConversationImportService'],
  ['apps/local-core/src/routes/ordered-references.ts', 'Original shared HTTP parser for typed ordered Collection references'],
  ['apps/local-core/src/assembly-apply-service.ts', 'Current original Assembly routes Collection identity, never legacy Scope identity'],
  ['apps/local-core/src/conversation-context.ts', 'Original saved Collection context reader and aggregate Run-reference conversion'],
  ['apps/local-core/src/curation-command-service.ts', 'Original curation command validates project-owned Collection entity members'],
  ['apps/local-core/src/presentation-application-service.ts', 'Original Presentation validates Collection ownership through canonical metadata'],
  ['packages/contracts/src/run-assembly.ts', 'Existing current Run Collection reference type, not a new contract'],
  ['packages/contracts/src/continuation-provider.ts', 'Existing current continuation Collection resolution evidence type'],
  ['packages/contracts/src/presentations.ts', 'Current existing Collection Presentation member type'],
  ['packages/domain/src/index.ts', 'Current existing Collection Relation endpoint type'],
  ['apps/web-gen2/src/spatial/worksiteProjectionInput.ts', 'Current original worksite Collection member selection; no legacy Main-only inference'],
  ['apps/web-gen2/src/spatial/reconciliationRunner.ts', 'Current original Collection carrier reconciliation for explicitly received Context/Workflow collections'],
  ['huabu/apps/web/src/lcos/professional/AssemblyBody.tsx', 'Original Assembly source/reference ingress and cancellation'],
  ['huabu/apps/web/src/lcos/professional/conversationContinuationActions.ts', 'Original draft-to-Run and continuation reference conversion'],
  ['huabu/apps/web/src/lcos/composer/referenceSnapshot.ts', 'Original whole-selection validation and exact-version text capability checks'],
  ['huabu/apps/web/src/lcos/LcosHostOverlay.tsx', 'Current original semantic drop lifecycle and positive-receipt placement callback'],
  ['huabu/apps/web/src/lcos/drop/PortalDropWorkspaceContext.tsx', 'Original read-only project worksite context shared by navigation and receiving'],
  ['huabu/apps/web/src/lcos/nodes/CollectionNodePresentation.tsx', 'Original Collection presentation forwards the existing canonical folder and actions'],
  ['huabu/apps/web/src/lcos/nodes/CanvasNodeRenameEntry.tsx', 'Original F2/manual metadata rename form, not a native Canvas history writer'],
  ['huabu/apps/web/src/lcos/nodes/nodeRename.ts', 'Original Core manual title producer and exact identity/receipt refresh owner'],
  ['huabu/apps/web/src/lcos/drop/registerNativeMaterialSources.ts', 'Original confirmed-image presentation registration, never an import or Canvas writer'],
  ['huabu/apps/web/src/lcos/nodes/CanonicalCollectionView.tsx', 'Original shared Collection read, refresh, menu and member removal owner'],
  ['huabu/apps/web/src/lcos/nodes/CollectionMembersMenu.tsx', 'Original transient member menu with confirmed/unknown removal and explicit refresh'],
  ['huabu/apps/web/src/lcos/nodes/collectionMemberActions.ts', 'Original Core-first removal and no-replay readback; no fabricated frame detach'],
  ['huabu/apps/web/src/lcos/nodes/CollectionMemberPreview.tsx', 'Original MIME-aware exact-member preview, Reader action and retry'],
  ['huabu/apps/web/src/lcos/nodes/collectionPreviewMedia.ts', 'Original bounded member media reader and availability policy'],
  ['huabu/apps/web/src/lcos/nodes/Gen1CollectionFace.tsx', 'Original folder interactions preserve actual selection, drag and nested button ownership'],
  ['huabu/apps/web/src/lcos/nodes/nodeMembershipDropTarget.ts', 'Original Collection identity selects the canonical membership receiver'],
  ['huabu/apps/web/src/lcos/nodes/collectionHost.ts', 'Current original Collection binding join, first-open and explicit arrangement planner'],
  ['huabu/apps/web/src/lcos/nodes/collectionDragCompanions.ts', 'Current original nested Collection layout companions; no second geometry owner'],
  ['huabu/apps/web/src/lcos/nodes/collectionExpandLayout.ts', 'Current original size-aware Collection expansion layout and obstacle solver'],
  ['huabu/apps/web/src/store/canvasCollapsedFrames.ts', 'Current original display-only per-Canvas collapse preference reader/writer'],
  ['huabu/apps/web/src/handler/canvasCommand/resolvers/resolveGroupSelectionIntoFrame.ts', 'Current original Collection geometry/frame/parent command planning; backend-only invocation'],
  ['huabu/apps/web/src/handler/canvasCommand/utils/index.ts', 'Original grouping resolver utility barrel; shared owner retained'],
  ['huabu/apps/web/src/handler/canvasCommand/utils/local.ts', 'Original grouping selected-node helper; no frontend store is imported'],
  ['huabu/apps/web/src/lcos/professional/CollectionWorkViewBody.tsx', 'Original Collection member browsing and Reader return window; no second canvas'],
  ['huabu/apps/web/src/lcos/professional/collectionRefreshIntent.ts', 'Original settled membership receipt invalidates the same Collection read view'],
  ['huabu/apps/web/src/lcos/professional/collection-work-view.css', 'Original Collection work window layout'],
  ['huabu/apps/web/src/lcos/nodes/collection-preview.css', 'Original member preview and transient member menu layout'],
  ['huabu/apps/web/src/lcos/nodes/gen1-collection.css', 'Original Gen1 folder and member sheet layout'],
  ['huabu/apps/web/src/lcos/nodes/collection-node.css', 'Original Collection canvas geometry and density presentation'],
  ['huabu/apps/web/src/lcos/ui/professional/ReaderMediaResultsView.tsx', 'Original image gallery inside the Collection work window'],
  ['huabu/apps/web/src/lcos/shell/surfaceDockDrop.ts', 'Original canonical Surface address adapter; child Workspace is not a Surface alias'],
  ['huabu/apps/web/src/lcos/app/useLcosWorksite.ts', 'Original root-Scope Surface selection helper only; no canvas creation hook is invoked'],
  ['huabu/apps/web/src/lcos/drop/assemblyCollectionPlacement.ts', 'Original Collection carrier/binding/witness/geometry/readback landing owner'],
  ['huabu/apps/web/src/lcos/drop/composerDropPreparation.ts', 'Original message-owned whole-source preparation and cancellation'],
  ['huabu/apps/web/src/lcos/drop/dropCommitRouter.ts', 'Original positive receipt first; failed placement remains partial without resubmitting membership'],
  ['huabu/apps/web/src/lcos/drop/dropAssemblyReceipt.ts', 'Current original receipt merge preserves incomplete spatial placement instead of re-labelling canonical acceptance as success'],
  ['huabu/apps/web/src/lcos/drop/dropIntentResolver.ts', 'Current typed aggregate Collection drop resolution; no legacy Scope substitution'],
  ['huabu/apps/web/src/lcos/drop/dropTypes.ts', 'Current original gesture-only incomplete-placement receipt type'],
  ['huabu/apps/web/src/lcos/professional/prepareAssemblyReferences.ts', 'Shared exact source preparation through original Core producers'],
  ['huabu/apps/web/src/lcos/professional/assemblyArtifactMedia.ts', 'Original exact-revision artifact/resource media reader'],
  ['huabu/apps/web/src/lcos/professional/AssemblySourceMedia.tsx', 'Original visible media/retry owner'],
  ['huabu/apps/web/src/lcos/ui/professional/AssemblyMasonryView.tsx', 'Original scrolling owner and ordinary action reachability'],
  ['huabu/apps/web/src/lcos/ui/professional/professional-assembly.css', 'Current original Assembly layout'],
  ['huabu/apps/web/src/lcos/ui/professional/tapnow-library.css', 'Current original library action layout'],
].map(([resourcePath, owner]) => ({ resourcePath, owner }));

const key = value => path.resolve(value).replaceAll('\\', '/').toLowerCase();
const resourcesByCopiedPath = new Map(currentGen2Resources.map(resource => [
  key(path.join(copiedRoot, resource.resourcePath)),
  { ...resource, copiedPath: path.join(copiedRoot, resource.resourcePath),
    sourcePath: path.join(currentGen2Root, resource.resourcePath), readOnly: true },
]));

export function resolveCurrentGen2Resource(copiedPath) {
  return typeof copiedPath === 'string' ? resourcesByCopiedPath.get(key(copiedPath)) : undefined;
}

export function readCurrentGen2Resource(copiedPath) {
  const resource = resolveCurrentGen2Resource(copiedPath);
  if (!resource) return undefined;
  // No old-copy fallback: a missing selected source is a visible build error,
  // not permission to silently ship the superseded producer again.
  return { ...resource, contents: fs.readFileSync(resource.sourcePath, 'utf8') };
}
