import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { currentGen2Resources, currentGen2Root, readCurrentGen2Resource, resolveCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { createNativeUiSourceTransforms, transformNativeCollectionDraft, transformNativeAssemblyMaterializedRefresh } from '../lab/native-ui-source-transforms.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeBase = path.join(root, '.runtime');
const runtimeRoot = path.join(runtimeBase, `current-gen2-resources-test-${Date.now()}`);
await fs.promises.mkdir(runtimeRoot, { recursive: true });

const normalized = value => path.resolve(value).replaceAll('\\', '/').toLowerCase();
const byResourcePath = new Map(currentGen2Resources.map(resource => [resource.resourcePath, resource]));
const coreResources = currentGen2Resources.filter(resource => resource.resourcePath.startsWith('apps/local-core/'));
const uiResources = currentGen2Resources.filter(resource => resource.resourcePath.startsWith('huabu/apps/web/'));
const backendPlannerPaths = new Set([
  'huabu/apps/web/src/handler/canvasCommand/resolvers/resolveGroupSelectionIntoFrame.ts',
  'huabu/apps/web/src/handler/canvasCommand/utils/index.ts',
  'huabu/apps/web/src/handler/canvasCommand/utils/local.ts',
]);

function assertAdoptionReport(outputPath, expectedResources, label) {
  const reportPath = `${outputPath}.sources.json`;
  assert.ok(fs.existsSync(reportPath), `${label} build must emit its actual source provenance sidecar`);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(normalized(report.currentRoot), normalized(currentGen2Root), `${label} provenance points to the selected source root`);
  assert.ok(Array.isArray(report.resources), `${label} provenance includes resources actually loaded by the bundler`);
  const actual = new Map(report.resources.map(resource => [resource.resourcePath, resource]));

  for (const selected of expectedResources) {
    const used = actual.get(selected.resourcePath);
    assert.ok(used, `${label} actually loaded ${selected.resourcePath}`);
    assert.equal(used.owner, selected.owner, `${label} preserves the selected owner for ${selected.resourcePath}`);
    assert.equal(normalized(used.copiedPath), normalized(path.join(root, 'lcos', selected.resourcePath)));
    assert.equal(normalized(used.sourcePath), normalized(path.join(currentGen2Root, selected.resourcePath)));
    assert.equal(used.readOnly, true, `${label} treats the selected source as read-only`);

    const copiedPath = path.join(root, 'lcos', selected.resourcePath);
    const resolved = resolveCurrentGen2Resource(copiedPath);
    const read = readCurrentGen2Resource(copiedPath);
    assert.ok(resolved && read, `the exact selected mapping remains resolvable: ${selected.resourcePath}`);
    assert.deepEqual(Buffer.from(read.contents, 'utf8'), fs.readFileSync(used.sourcePath),
      `loaded source bytes match the selected read-only source: ${selected.resourcePath}`);
  }

  for (const used of report.resources) {
    const selected = byResourcePath.get(used.resourcePath);
    assert.ok(selected, `${label} did not adopt an unregistered resource: ${used.resourcePath}`);
    assert.equal(used.owner, selected.owner);
  }
  return report;
}

let testResult;
try {
  assert.ok(fs.existsSync(currentGen2Root), 'the selected current Gen2 source root is available');
  assert.equal(currentGen2Resources.length, 69, 'the explicit catalog includes the original manual metadata rename entry and confirmed-image registration');
  assert.equal(coreResources.length, 19, 'the selected Core closure has nineteen explicit original-owner resources');
  assert.equal(uiResources.length, 44, 'the selected UI-source closure includes existing rename/registration owners, display preferences and backend-only grouping planners');
  assert.equal(byResourcePath.size, currentGen2Resources.length, 'selected resource paths are unique');

  for (const resource of currentGen2Resources) {
    const copiedPath = path.join(root, 'lcos', resource.resourcePath);
    const mapping = resolveCurrentGen2Resource(copiedPath);
    const read = readCurrentGen2Resource(copiedPath);
    const sourcePath = path.join(currentGen2Root, resource.resourcePath);
    assert.ok(mapping && read, `selected resource resolves: ${resource.resourcePath}`);
    assert.equal(mapping.resourcePath, resource.resourcePath);
    assert.equal(mapping.owner, resource.owner);
    assert.equal(normalized(mapping.copiedPath), normalized(copiedPath));
    assert.equal(normalized(mapping.sourcePath), normalized(sourcePath));
    assert.equal(mapping.readOnly, true);
    assert.ok(fs.existsSync(sourcePath), `selected source exists: ${resource.resourcePath}`);
    assert.deepEqual(Buffer.from(read.contents, 'utf8'), fs.readFileSync(sourcePath),
      `readCurrentGen2Resource returns exact source bytes: ${resource.resourcePath}`);
  }

  const missingCopiedHelper = path.join(root, 'lcos/huabu/apps/web/src/lcos/professional/prepareAssemblyReferences.ts');
  const sourceOnlyHelper = resolveCurrentGen2Resource(missingCopiedHelper);
  assert.ok(sourceOnlyHelper, 'a selected helper absent from the copied tree still resolves through the explicit catalog');
  assert.equal(fs.existsSync(missingCopiedHelper), false, 'the source-only helper is not silently restored from an old copy');
  assert.ok(fs.existsSync(sourceOnlyHelper.sourcePath), 'the selected read-only helper source exists');
  assert.equal(readCurrentGen2Resource(missingCopiedHelper)?.contents,
    fs.readFileSync(sourceOnlyHelper.sourcePath, 'utf8'), 'the source-only helper reads from the selected tree');

  const unregisteredCopy = path.join(root, 'lcos/huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.tsx');
  assert.ok(fs.existsSync(unregisteredCopy), 'the negative mapping probe is a real copied LCOS file');
  assert.equal(resolveCurrentGen2Resource(unregisteredCopy), undefined, 'unregistered copied source stays on the copied tree');
  assert.equal(readCurrentGen2Resource(unregisteredCopy), undefined, 'read does not turn unknown paths into source adoption');
  const collectionGuardPath = path.join(root, 'lcos/huabu/apps/web/src/lcos/professional/assemblySourceRef.ts');
  assert.ok(fs.existsSync(collectionGuardPath), 'the copied canonical Collection source guard exists');
  assert.equal(resolveCurrentGen2Resource(collectionGuardPath), undefined,
    'generic Collection Apply semantics remain on the copied guard');
  assert.equal(readCurrentGen2Resource(collectionGuardPath), undefined,
    'the external Assembly source helper is not implicitly adopted');
  assert.equal(resolveCurrentGen2Resource(undefined), undefined, 'invalid paths do not map');

  const helperOutput = path.join(runtimeRoot, 'assembly-source-ref.mjs');
  await buildPilotEntry('lcos/huabu/apps/web/src/lcos/professional/assemblySourceRef.ts', helperOutput);
  const helperReport = assertAdoptionReport(helperOutput, [], 'copied Assembly source guard');
  assert.equal(helperReport.resources.some(resource => resource.resourcePath.endsWith('/assemblySourceRef.ts')), false,
    'the unregistered Collection helper is not reported as a current-source adoption');
  const copiedSourceHelper = await import(pathToFileURL(helperOutput).href);
  const artifactView = {
    kind: 'artifact', title: '已保存材料', presentedRevisionId: 'revision-exact', mimeType: 'text/markdown',
    entityRef: { type: 'artifact', id: 'artifact-exact', viewId: 'view-exact' },
  };
  assert.deepEqual(copiedSourceHelper.assemblySourceRefOf(artifactView), { kind: 'artifactView', id: 'view-exact' },
    'the current copied helper preserves exact Warehouse View identity');
  assert.deepEqual(copiedSourceHelper.assemblyDraftReferenceOf(artifactView), {
    entityType: 'artifact', entityId: 'artifact-exact', revisionId: 'revision-exact', mimeType: 'text/markdown',
    artifactViewId: 'view-exact', displayLabel: '已保存材料',
  }, 'the copied helper preserves exact View, Revision, MIME, and display identity for the existing Composer draft');
  const collectionItem = { kind: 'collection', title: 'Collection guard', entityRef: { type: 'collection', id: 'collection-exact' } };
  assert.equal(copiedSourceHelper.assemblySourceRefOf(collectionItem), undefined,
    'Collection is not advertised as a whole-object generic Assembly Apply source');
  assert.equal(copiedSourceHelper.assemblyDraftReferenceOf(collectionItem), undefined,
    'the read-only copied source is not changed by native UI adaptation');

  const copiedCollectionSource = fs.readFileSync(collectionGuardPath, 'utf8');
  const currentCollectionSource = fs.readFileSync(path.join(currentGen2Root,
    'huabu/apps/web/src/lcos/professional/assemblySourceRef.ts'), 'utf8');
  const draftMarker = '/** Per-message reference is not AssemblyApply: use an existing address, never materialize on pick. */';
  const adaptedCollectionSource = transformNativeCollectionDraft(copiedCollectionSource, currentCollectionSource);
  assert.equal(adaptedCollectionSource.slice(0, adaptedCollectionSource.indexOf(draftMarker)),
    copiedCollectionSource.slice(0, copiedCollectionSource.indexOf(draftMarker)), 'generic Apply guard remains byte-for-byte copied');
  assert.equal(adaptedCollectionSource.slice(adaptedCollectionSource.indexOf(draftMarker)),
    currentCollectionSource.slice(currentCollectionSource.indexOf(draftMarker)), 'per-message draft function reuses the complete current owner');
  assert.equal(transformNativeCollectionDraft(adaptedCollectionSource, currentCollectionSource), adaptedCollectionSource);
  const nativeHelperOutput = path.join(runtimeRoot, 'native-assembly-source-ref.mjs');
  await buildPilotEntry('lcos/huabu/apps/web/src/lcos/professional/assemblySourceRef.ts', nativeHelperOutput, 'browser', {
    nativeReact: true, sourceTransforms: createNativeUiSourceTransforms(),
  });
  const nativeSourceHelper = await import(pathToFileURL(nativeHelperOutput).href);
  assert.equal(nativeSourceHelper.assemblySourceRefOf(collectionItem), undefined,
    'the actual native build still refuses incompatible generic Collection Apply');
  assert.deepEqual(nativeSourceHelper.assemblyDraftReferenceOf(collectionItem), {
    entityType: 'collection', entityId: 'collection-exact', displayLabel: 'Collection guard',
  }, 'the actual native build adds one canonical Collection reference, not a UI-expanded member subset');
  assert.deepEqual(nativeSourceHelper.assemblyDraftReferenceOf(artifactView), copiedSourceHelper.assemblyDraftReferenceOf(artifactView));

  const submissionOutput = path.join(runtimeRoot, 'composer-submission.mjs');
  await buildPilotEntry('lcos/huabu/apps/web/src/lcos/composer/composerSubmission.ts', submissionOutput);
  const submission = await import(pathToFileURL(submissionOutput).href);
  const collectionDraft = nativeSourceHelper.assemblyDraftReferenceOf(collectionItem);
  const structuredDraft = { entityType: 'artifact', entityId: 'structured-exact',
    revisionId: 'structured-historical', mimeType: 'application/json; charset=UTF-8' };
  const submissionInput = { projectId: 'synthetic-project', instruction: 'Prepare only; no execution.',
    workspaceId: 'synthetic-workspace', target: { intent: 'delegate', receiverConversationId: 'synthetic-receiver' },
    refs: [collectionDraft, structuredDraft] };
  const submissionBefore = structuredClone(submissionInput);
  const runInput = submission.buildComposerRunInput(submissionInput);
  assert.deepEqual(runInput.orderedReferences, [
    { ref: { type: 'collection', collectionId: 'collection-exact' }, order: 0 },
    { ref: { type: 'artifact', artifactId: 'structured-exact', revisionId: 'structured-historical' }, order: 1 },
  ], 'original Composer transports the aggregate identity and historical material, without UI member expansion');
  assert.deepEqual(runInput.contextArtifactIds, ['structured-exact'], 'a Collection ID must never masquerade as an Artifact ID');
  assert.deepEqual(runInput.receiverRef, { connectedConversationId: 'synthetic-receiver' });
  assert.deepEqual(submissionInput, submissionBefore, 'payload preparation leaves original draft untouched');
  const continueInput = submission.buildComposerContinuationInput({
    conversationId: 'synthetic-receiver', continuationOperationId: 'synthetic-operation',
    messageId: 'synthetic-message', text: ' Continue with the same references. ', refs: submissionInput.refs,
  });
  assert.deepEqual(continueInput.orderedReferences, runInput.orderedReferences);
  for (const mimeType of ['text/plain', 'text/markdown', 'text/csv', 'application/json',
    'application/yaml', 'application/xml', 'text/html']) {
    const payload = submission.buildComposerRunInput({ ...submissionInput,
      refs: [{ ...structuredDraft, mimeType: `${mimeType}; charset=utf-8` }] });
    assert.equal(payload.orderedReferences[0].ref.revisionId, 'structured-historical');
  }
  assert.throws(() => submission.buildComposerRunInput({ ...submissionInput,
    refs: [collectionDraft, { ...structuredDraft, mimeType: 'image/png' }] }), /图片、PDF/,
  'one unsupported entry rejects the whole original selection, rather than silently dropping it');
  assert.deepEqual(submissionInput, submissionBefore);

  // Fault injection at the original read transport only. A post-admission
  // Warehouse read error remains its own UI state, not a rejected mutation.
  const controllerOutput = path.join(runtimeRoot, 'assembly-controller.mjs');
  await buildPilotEntry('lcos/apps/web-gen2/src/lcos/assembly/assemblySourceBayController.ts', controllerOutput);
  const { AssemblySourceBayController } = await import(pathToFileURL(controllerOutput).href);
  let warehouseReads = 0;
  const warehouseBefore = { schemaVersion: 1, projectId: 'synthetic-project', totalApprox: 1,
    items: [{ ...artifactView, id: 'existing-item' }] };
  const warehouseAfter = { ...warehouseBefore, totalApprox: 2,
    items: [...warehouseBefore.items, { ...collectionItem, id: 'new-item' }] };
  const controller = new AssemblySourceBayController({ assembly: {
    queryWarehouse: async () => {
      warehouseReads += 1;
      if (warehouseReads === 2) throw new Error('Synthetic Warehouse read failure; reference already admitted.');
      return warehouseReads === 1 ? warehouseBefore : warehouseAfter;
    },
  } });
  const nextControllerState = status => new Promise((resolve, reject) => {
    let unsubscribe;
    const timer = setTimeout(() => { unsubscribe?.(); reject(new Error(`Original controller did not reach ${status}`)); }, 2000);
    unsubscribe = controller.subscribe(() => {
      if (controller.read()?.warehouseStatus !== status) return;
      clearTimeout(timer); unsubscribe(); resolve(controller.read());
    });
  });
  try {
    const opened = nextControllerState('loaded');
    controller.open('synthetic-project');
    await opened;
    const failedRead = nextControllerState('error');
    assert.equal(controller.reloadWarehouse(), undefined, 'the existing refresh is not chained to materialization completion');
    const failedState = await failedRead;
    assert.deepEqual(failedState.warehouse, warehouseBefore, 'read failure keeps the already-visible items');
    const recovered = nextControllerState('loaded');
    controller.reloadWarehouse();
    assert.deepEqual((await recovered).warehouse, warehouseAfter, 'the original refresh can recover without another mutation');
    assert.equal(warehouseReads, 3);
  } finally { controller.dispose(); }

  const coreOutput = path.join(runtimeRoot, 'surface-core-facade.mjs');
  await buildPilotEntry('lab/pilot/surface-core-facade.ts', coreOutput);
  const coreReport = assertAdoptionReport(coreOutput, coreResources, 'Core facade');

  const dropTypesPath = 'huabu/apps/web/src/lcos/drop/dropTypes.ts';
  const dropTypesOutput = path.join(runtimeRoot, 'drop-types.mjs');
  await buildPilotEntry(`lcos/${dropTypesPath}`, dropTypesOutput);
  const typeReport = assertAdoptionReport(dropTypesOutput, [byResourcePath.get(dropTypesPath)], 'explicit type-only source compilation');

  const nativeUiOutput = path.join(runtimeRoot, 'native-agent-ui.js');
  await buildPilotEntry('lab/pilot/native-agent-ui.tsx', nativeUiOutput, 'browser', {
    nativeReact: true,
    env: { LCOS_CORE_URL: '/api/lcos/core', LCOS_CORE_TOKEN: '', PROJECT_ID: 'disposable-surface-core-facade' },
    sourceOverrides: {
      'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts',
      'lcos/huabu/apps/web/src/lcos/professional/NativeWorkspaceBody.tsx': 'lab/pilot/native-professional-host.tsx',
    },
    sourceTransforms: createNativeUiSourceTransforms(),
  });
  const uiReport = assertAdoptionReport(nativeUiOutput, uiResources.filter(item => item.resourcePath !== dropTypesPath
    && !backendPlannerPaths.has(item.resourcePath)), 'native React UI');
  const bundle = fs.readFileSync(nativeUiOutput, 'utf8');
  assert.match(bundle, /\/lcos\/native-react\.js/, 'the adopted UI imports the existing React instance');
  assert.match(bundle, /\/lcos\/native-jsx-runtime\.js/, 'JSX uses the existing host runtime');
  assert.match(bundle, /\/lcos\/native-router\.js/, 'mature windows reuse the original Router context');
  assert.doesNotMatch(bundle, /react-dom\/client/, 'the addon does not create a second React root');
  assert.doesNotMatch(bundle, /__require\(["']\/lcos\/native-(?:react|jsx-runtime|react-dom|router)\.js["']\)/,
    'native host shims are statically imported rather than dynamically required');
  assert.match(bundle, /ProfessionalWindowStage/, 'the existing professional stage is retained');
  assert.match(bundle, /data-lcos-native-workspace-unavailable/, 'the legacy nested Canvas body is replaced by its explicit unavailable adapter');
  assert.doesNotMatch(bundle, /PreviewWorkspacePanel/, 'the addon bundle does not pull the nested second-Canvas Workspace body');
  assert.match(bundle, /prepareAssemblyReferences/, 'the selected source-only reference-preparation helper is in the browser bundle');
  assert.match(bundle, /takeAssemblyReferences/, 'Assembly calls the adopted source preparation flow');
  const currentAssembly = fs.readFileSync(path.join(currentGen2Root, 'huabu/apps/web/src/lcos/professional/AssemblyBody.tsx'), 'utf8');
  const refreshedAssembly = transformNativeAssemblyMaterializedRefresh(currentAssembly);
  const successSeam = '      setReferenceRetry(undefined); setReferenceNotice(`已加入 ${count} 项本次引用，尚未发送。`); setSelectedIds([]);';
  assert.equal(refreshedAssembly.replace(successSeam + '\n      controller.reloadWarehouse();', successSeam), currentAssembly,
    'Warehouse refresh adds only the existing read controller call after successful reference admission');
  assert.equal(transformNativeAssemblyMaterializedRefresh(refreshedAssembly), refreshedAssembly);
  const captureCards = currentAssembly.slice(currentAssembly.indexOf("{tab === 'capture' ? captureVisible.map"),
    currentAssembly.indexOf("{tab === 'sources' ? resourcesVisible.map"));
  assert.match(captureCards, /primaryAction=\{collectingReferences \? <LcosButton[^\n]+data-lcos-assembly-add/,
    'the current adopted Capture collect mode has its original add action; do not infer capabilities from the older copied component');
  assert.match(captureCards, /onClick=\{\(\) => addSourceReferences\(\[source\]\)\}/,
    'the original Capture add action reaches the adopted shared source preparation owner, not the non-collecting Assembly Apply path');

  assert.equal(uiReport.nativePorts.length, 2, 'the browser entry uses only the two current production native ports');
  const canvasPort = uiReport.nativePorts.find(port => normalized(port.sourcePath).endsWith('/store/canvasstore.ts'));
  const workspacePort = uiReport.nativePorts.find(port => normalized(port.sourcePath).endsWith('/professional/nativeworkspacebody.tsx'));
  assert.ok(canvasPort && workspacePort, 'the existing Canvas API port and nested Workspace no-second-Canvas port are both recorded');
  assert.equal(normalized(canvasPort.replacementPath), normalized(path.join(root, 'lab/pilot/native-canvas-port.ts')));
  assert.equal(normalized(workspacePort.replacementPath), normalized(path.join(root, 'lab/pilot/native-professional-host.tsx')));

  const actualPaths = new Set([...helperReport.resources, ...coreReport.resources, ...uiReport.resources, ...typeReport.resources]
    .map(resource => resource.resourcePath));
  assert.equal(actualPaths.size, 69, 'Node Core/planner + nativeReact UI + explicit type-only source entry consume the selected closure');
  for (const selected of currentGen2Resources) assert.ok(actualPaths.has(selected.resourcePath), `selected closure is actually loaded: ${selected.resourcePath}`);

  testResult = {
    passed: true,
    scope: 'current Gen2 source adoption mapping + actual Core/UI bundle provenance + copied Collection source guard; not GUI/runtime acceptance',
    sourceRoot: currentGen2Root,
    catalogResources: currentGen2Resources.length,
    actuallyLoadedResources: actualPaths.size,
    nativeUiActualResourcePaths: uiReport.resources.map(resource => resource.resourcePath).sort(),
    separatelyCompiledTypeOnlyResourcePaths: typeReport.resources.map(resource => resource.resourcePath).sort(),
    missingCopiedHelperResolved: 'prepareAssemblyReferences.ts',
    unregisteredCopyPathStayedCopied: true,
    collectionSourceHelperUnmapped: true,
    copiedCollectionGenericApplyGuard: true,
    currentCollectionDraftOwnerAdopted: true,
    originalComposerCollectionAndSevenTextPayloads: true,
    originalWarehouseReadFailureAndRecovery: true,
    nativeReactShared: true,
    reactDomClientImported: false,
    nestedCanvasBodyImported: false,
    upstreamVitestRun: false,
    guiRun: false,
    outputUnderRuntime: path.relative(runtimeBase, runtimeRoot).replaceAll('\\', '/'),
  };
} finally {
  const runtimeBaseReal = await fs.promises.realpath(runtimeBase);
  const runtimeRootReal = await fs.promises.realpath(runtimeRoot);
  const relative = path.relative(runtimeBaseReal, runtimeRootReal);
  assert.ok(relative && relative === path.basename(runtimeRoot) && !path.isAbsolute(relative),
    'temporary output must resolve to exactly this test-owned child under .runtime');
  await fs.promises.rm(runtimeRootReal, { recursive: true, force: true });
}

console.log(JSON.stringify(testResult, null, 2));
