import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { createNativeUiSourceTransforms } from '../lab/native-ui-source-transforms.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeParent = path.join(root, '.runtime')
await mkdir(runtimeParent, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(runtimeParent, 'native-material-metadata-'))

try {
  const policyFile = path.join(runtimeRoot, 'native-material-metadata-policy.mjs')
  await buildPilotEntry('lab/pilot/native-material-metadata-policy.ts', policyFile)
  const {
    nativeImageReferenceSignature,
    nativeImagePresentedTitle,
    nativeMaterialRenameIdentityKey,
    resolveNativeMaterialMetadata,
  } = await import(pathToFileURL(policyFile).href)

  const projectId = 'project-material-fixture'
  const canvasId = 'canvas-material-fixture'
  const nodeId = 'node-image-a'
  const coreGraph = {
    project: { id: projectId },
    scopes: [{ id: 'scope-main', projectId }],
    workspaces: [{ id: 'workspace-main', projectId, canvasId, scopeId: 'scope-main' }],
    artifacts: [
      { id: 'artifact-a', projectId, title: 'Core title A', kind: 'image', managed: true,
        availability: 'available', currentRevisionId: 'revision-a' },
      { id: 'artifact-b', projectId, title: 'Core title B', kind: 'image', managed: true,
        availability: 'available', currentRevisionId: 'revision-b' },
    ],
    artifactViews: [
      { id: 'view-a-primary', artifactId: 'artifact-a', scopeId: 'scope-main', referenceKind: 'primary', revisionId: 'revision-a' },
      { id: 'view-a-additional', artifactId: 'artifact-a', scopeId: 'scope-main', referenceKind: 'explicit_additional', revisionId: 'revision-a-old' },
      { id: 'view-b-primary', artifactId: 'artifact-b', scopeId: 'scope-main', referenceKind: 'primary', revisionId: 'revision-b' },
    ],
    artifactRevisions: [
      { id: 'revision-a', artifactId: 'artifact-a', status: 'current', fileRecordId: 'file-a' },
      { id: 'revision-a-old', artifactId: 'artifact-a', status: 'superseded', fileRecordId: 'file-a-old' },
      { id: 'revision-b', artifactId: 'artifact-b', status: 'current', fileRecordId: 'file-b' },
    ],
    fileRecords: [
      { id: 'file-a', projectId, mimeType: 'image/png' },
      { id: 'file-a-old', projectId, mimeType: 'image/jpeg' },
      { id: 'file-b', projectId, mimeType: 'image/webp' },
    ],
  }
  const imageNode = (reference, overrides = {}) => ({
    id: nodeId, type: 'image', position: { x: 0, y: 0 }, selected: true,
    data: { title: 'DTO title is not Core truth', lcos_ref: reference }, ...overrides,
  })
  const artifactRef = {
    version: 1, entityType: 'artifact', entityId: 'artifact-a', artifactId: 'artifact-a',
    artifactViewId: 'view-a-primary', revisionId: 'revision-a',
  }
  const artifactBinding = {
    projectId, canvasId, spatialKind: 'node', spatialId: nodeId,
    entityType: 'artifact', entityId: 'artifact-a',
  }
  const resolve = (reference = artifactRef, bindings = [artifactBinding], graph = coreGraph, nodes = [imageNode(reference)]) =>
    resolveNativeMaterialMetadata({ projectId, canvasId, nodes, graph, bindings })

  const primary = resolve()
  assert.equal(primary.status, 'ready')
  assert.equal(primary.byNodeId.get(nodeId)?.descriptor.title, 'Core title A', 'descriptor title comes from the exact Core Artifact')
  assert.equal(primary.byNodeId.get(nodeId)?.reference.artifactViewId, 'view-a-primary')
  assert.equal(primary.byNodeId.get(nodeId)?.descriptor.currentRevisionId, 'revision-a')
  assert.equal(primary.byNodeId.get(nodeId)?.descriptor.presentedRevisionId, 'revision-a')

  const additionalViewRef = {
    version: 1, entityType: 'view', entityId: 'view-a-additional', artifactId: 'artifact-a',
    artifactViewId: 'view-a-additional', revisionId: 'revision-a-old',
  }
  const additionalBinding = { ...artifactBinding, entityType: 'view', entityId: 'view-a-additional' }
  const additional = resolve(additionalViewRef, [additionalBinding])
  assert.equal(additional.byNodeId.get(nodeId)?.descriptor.artifactViewReferenceKind, 'explicit_additional')
  assert.equal(additional.byNodeId.get(nodeId)?.descriptor.currentRevisionId, 'revision-a')
  assert.equal(additional.byNodeId.get(nodeId)?.descriptor.presentedRevisionId, 'revision-a-old',
    'the exact selected additional view keeps its historical presented revision separate from current')

  // Same-project A binding plus forged B DTO facts used to join B after checking
  // only the binding's entityId against the mismatched ref.entityId.
  const forgedCrossArtifact = {
    ...artifactRef, artifactId: 'artifact-b', artifactViewId: 'view-b-primary', revisionId: 'revision-b',
  }
  const forgedResult = resolve(forgedCrossArtifact)
  assert.equal(forgedResult.byNodeId.has(nodeId), false,
    'artifact bindings require lcos_ref.entityId === lcos_ref.artifactId before joining any same-project Artifact')
  assert.match(forgedResult.rejectedByNodeId.get(nodeId), /完整的 Core Artifact\/View 引用/)

  const duplicateBindings = resolve(artifactRef, [artifactBinding, { ...artifactBinding }])
  assert.equal(duplicateBindings.byNodeId.has(nodeId), false, 'ambiguous real bindings fail closed')
  const wrongProjectBinding = resolve(artifactRef, [{ ...artifactBinding, projectId: 'foreign-project' }])
  assert.equal(wrongProjectBinding.byNodeId.has(nodeId), false, 'cross-project bindings fail closed')

  const stableIdentity = nativeMaterialRenameIdentityKey(projectId, canvasId, nodeId, imageNode(artifactRef))
  const titleAndRevisionOnly = imageNode({ ...artifactRef, revisionId: 'revision-a-new' }, {
    data: { title: 'A newer display title', lcos_ref: { ...artifactRef, revisionId: 'revision-a-new' } },
  })
  assert.equal(nativeMaterialRenameIdentityKey(projectId, canvasId, nodeId, titleAndRevisionOnly), stableIdentity,
    'title and revision refreshes preserve the original F2 entry identity and its draft')
  assert.notEqual(nativeMaterialRenameIdentityKey(projectId, canvasId, nodeId,
    imageNode({ ...artifactRef, entityId: 'artifact-b', artifactId: 'artifact-b', artifactViewId: 'view-b-primary' })), stableIdentity,
  'a material identity switch remounts the original F2 entry and discards its stale target')
  assert.notEqual(nativeMaterialRenameIdentityKey(projectId, canvasId, '', undefined), stableIdentity,
    'missing or unsupported selection cannot retain the previous submit target')
  assert.notEqual(nativeMaterialRenameIdentityKey(projectId, canvasId, 'node-text',
    { id: 'node-text', type: 'text', data: { lcos_ref: artifactRef } }), stableIdentity,
  'a selected non-image node cannot retain the previous image submit target')

  const selectedAndMoved = imageNode(artifactRef, { position: { x: 999, y: 42 }, selected: false,
    data: { title: 'Changed DTO display title', lcos_ref: artifactRef } })
  assert.equal(nativeImageReferenceSignature([imageNode(artifactRef)]), nativeImageReferenceSignature([selectedAndMoved]),
    'selection, geometry and DTO title are not Core graph read dependencies')
  assert.notEqual(nativeImageReferenceSignature([imageNode(artifactRef)]),
    nativeImageReferenceSignature([imageNode({ ...artifactRef, revisionId: 'revision-a-next' })]),
  'an image identity/revision change triggers a fresh exact Core read')

  const titleInput = {
    nodeId, node: imageNode(artifactRef), rendererData: imageNode(artifactRef).data,
    reference: { entityType: 'artifact', entityId: 'artifact-a', descriptor: primary.byNodeId.get(nodeId).descriptor },
    canvasId, canvasStatus: 'ready', projectId, shellProjectId: projectId, originalTitle: 'Original filename.png',
  }
  const titleBefore = structuredClone(titleInput)
  assert.equal(nativeImagePresentedTitle(titleInput), 'Core title A')
  assert.deepEqual(titleInput, titleBefore, 'read-only title selection cannot mutate native DTO or registered facts')
  for (const overrides of [
    { canvasStatus: 'loading' }, { canvasId: null }, { shellProjectId: 'foreign-project' },
    { node: { ...titleInput.node, type: 'text' } }, { nodeId: 'another-node' },
    { reference: undefined },
    { rendererData: { lcos_ref: { ...artifactRef, revisionId: 'stale-revision' } } },
    { reference: { ...titleInput.reference, entityId: 'artifact-b' } },
    { reference: { ...titleInput.reference, descriptor: { ...titleInput.reference.descriptor, artifactViewId: 'wrong-view' } } },
    { reference: { ...titleInput.reference, descriptor: { ...titleInput.reference.descriptor, presentedRevisionId: 'wrong-revision' } } },
  ]) assert.equal(nativeImagePresentedTitle({ ...titleInput, ...overrides }), titleInput.originalTitle,
    'unready, non-image, unverified or mismatched presentation must retain the original shell fallback')
  assert.equal(nativeImagePresentedTitle({ ...titleInput, node: imageNode(additionalViewRef),
    rendererData: imageNode(additionalViewRef).data,
    reference: { entityType: 'artifact', entityId: 'artifact-a', descriptor: additional.byNodeId.get(nodeId).descriptor } }),
  'Core title A', 'an exact historical additional View reads shared Artifact metadata without switching revision')

  const hostFile = path.join(runtimeRoot, 'native-material-metadata.js')
  await buildPilotEntry('lab/pilot/native-material-metadata.tsx', hostFile, 'browser', {
    nativeReact: true,
    sourceTransforms: createNativeUiSourceTransforms(),
    env: { LCOS_CORE_URL: '/api/lcos/core', LCOS_CORE_TOKEN: '', PROJECT_ID: 'disposable-surface-core-facade' },
    sourceOverrides: { 'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts' },
  })
  const hostBundle = await readFile(hostFile, 'utf8')
  const hostSource = await readFile(path.join(root, 'lab/pilot/native-material-metadata.tsx'), 'utf8')
  assert.match(hostBundle, /CanvasNodeRenameEntry/, 'hydration delegates F2 and submit to the original rename owner')
  assert.match(hostBundle, /registerNativeMaterialSources/, 'only the existing reference registration owner is reused')
  assert.match(hostBundle, /nativeMaterialRenameIdentityKey/, 'the original entry is keyed by live material identity')
  assert.doesNotMatch(hostBundle, /resolveNativeMaterialSources/, 'hydration cannot import/claim or create unbound material')
  assert.doesNotMatch(hostBundle, /react-dom\/client/, 'the host does not create a second React root')
  assert.match(hostSource, /const sceneReady = canvasStatus === 'ready' && liveCanvasId === canvasId/)
  assert.match(hostSource, /const canRename = sceneReady &&/,
    'rendered readiness cannot retain an old enabled state while Canvas leaves ready')
  assert.match(hostSource, /\{sceneReady && <CanvasNodeRenameEntry/,
    'a still-open original form is removed when its project/Canvas is no longer ready')
  assert.match(hostSource, /JSON\.stringify\(\[projectId, canvasId, imageRefsKey, bindingRefreshVersion\]\)/,
    'Core graph freshness includes the observed binding refresh revision')
  assert.match(hostSource, /key=\{entryIdentityKey\} disabled=\{!canRename\}/,
    'readiness refreshes do not key/remount the original entry')
  assert.match(hostSource, /return selected\.length === 1/,
    'missing and multiselection states do not keep one previous selected node as rename target')
  assert.match(hostSource, /if \(referenceHasExpectedOwner\(existing, entry\)\) \{[\s\S]*?continue\s*\}/,
    'an already-current reference does not register a fresh object and retrigger its own React effect')
  assert.match(hostSource, /for \(const entry of currentRead\.byNodeId\.values\(\)\)/,
    'verified existing image Views reuse one reference owner for shared read-only title presentation')
  assert.match(hostSource, /references\.forgetNode\(nodeId\)/,
    'a refresh invalidates only the exact registration owner before the original submit-time binding check')
  assert.match(hostSource, /for \(const \[nodeId, owned\] of registrationOwners\.current\)/)
  assert.match(hostSource, /references\.nodeEntityRefs\.get\(nodeId\) === owned/)
  assert.match(hostSource, /return invalidateOwnedRegistrations/,
    'scene/reference changes and unmount remove only exact owned image presentation refs, not unrelated bindings')

  process.stdout.write(JSON.stringify({
    test: 'native-material-metadata',
    primaryArtifactAndExactAdditionalView: true,
    forgedSameProjectCrossArtifactRejected: true,
    duplicateAndForeignBindingsRejected: true,
    titleRevisionPreserveF2Identity: true,
    materialSwitchAndMissingSelectionChangeIdentity: true,
    graphReadsIgnoreSelectionGeometryAndTitle: true,
    originalHeaderReadOnlyTitleAndFallback: true,
    originalRenameAndRegistrationOwnersReused: true,
    importingOrClaimingMaterial: false,
    secondReactRoot: false,
  }, null, 2) + '\n')
} finally {
  await rm(runtimeRoot, { recursive: true, force: true })
}
