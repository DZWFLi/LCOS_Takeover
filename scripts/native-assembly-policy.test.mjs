import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  nativeAssemblyItem,
  nativeAssemblyVersion,
  sameNativeAssemblyInput,
  verifyNativeAssemblyVersion,
} from '../lab/pilot/native-assembly-policy.ts'

const projectId = 'project-native-assembly'
const artifactId = 'artifact-native-assembly'
const rootScopeId = 'scope-native-root'
const workspaceId = 'workspace-native-main'
const viewId = 'view-native-current'
const currentRevisionId = 'revision-native-current'
const historicalRevisionId = 'revision-native-historical'
const currentFileId = 'file-native-current'
const historicalFileId = 'file-native-historical'
const at = '2026-10-15T00:00:00.000Z'

// Complete ProjectGraphSnapshot-shaped fixture: these identities and field
// names match Core's project/scenes/artifacts/revisions/views graph contract.
const oldGraph = {
  schemaVersion: 1,
  graphVersion: 1,
  project: { id: projectId, name: 'Native Fixture', rootPath: 'C:\\native-fixture', graphVersion: 1, createdAt: at, updatedAt: at },
  scopes: [{ id: rootScopeId, projectId, parentScopeId: null, containerViewId: null, kind: 'root', name: 'Root', createdAt: at, updatedAt: at }],
  workspaces: [{ id: workspaceId, projectId, scopeId: rootScopeId, name: 'Main', intent: null,
    viewport: { x: 0, y: 0, zoom: 1 }, focusedViewIds: [], createdAt: at, updatedAt: at }],
  artifacts: [{ id: artifactId, projectId, title: 'Native image', kind: 'image', availability: 'available',
    currentRevisionId, createdAt: at, updatedAt: at }],
  artifactViews: [{ id: viewId, artifactId, scopeId: rootScopeId, revisionId: currentRevisionId,
    referenceKind: 'primary', position: { x: 0, y: 0 }, size: { width: 320, height: 240 },
    displayMode: 'thumbnail', collapsed: false }],
  artifactRevisions: [
    { id: currentRevisionId, artifactId, fileRecordId: currentFileId, contentHash: 'current-hash', source: 'import', status: 'current', createdAt: at },
    { id: historicalRevisionId, artifactId, fileRecordId: historicalFileId, contentHash: 'historical-hash', source: 'import', status: 'superseded', createdAt: at },
  ],
  fileRecords: [
    { id: currentFileId, projectId, observedPath: 'C:\\native-fixture\\current.png', observedHash: 'current-hash', size: 12,
      modifiedAt: at, mimeType: 'image/png', availability: 'current', observedAt: at },
    { id: historicalFileId, projectId, observedPath: 'C:\\native-fixture\\historical.png', observedHash: 'historical-hash', size: 9,
      modifiedAt: at, mimeType: 'image/png', availability: 'current', observedAt: at },
  ],
  relations: [],
  notes: [],
  checkpoints: [],
}

const currentItem = {
  schemaVersion: 1,
  entityRef: { type: 'artifact', id: artifactId, viewId },
  kind: 'artifact',
  title: 'Native image',
  presentedRevisionId: currentRevisionId,
  usageCount: 0,
  visualFamily: 'image',
  mimeType: 'image/png',
}

function detailFor(item = currentItem) {
  return { asset: { id: artifactId, lcos_projection: {
    project_id: projectId,
    assembly_item: item,
    artifact_id: artifactId,
    artifact_view_id: item.entityRef.viewId ?? null,
    presented_revision_id: item.presentedRevisionId,
    file_record_id: item.presentedRevisionId === historicalRevisionId ? historicalFileId : currentFileId,
    content_available: true,
    referenceable: true,
  } } }
}

test('native Library detail accepts only a matching project, Artifact, View, and Presented Revision', () => {
  assert.deepEqual(nativeAssemblyItem(detailFor(), projectId), currentItem)
  assert.throws(() => nativeAssemblyItem(detailFor(), 'another-project'), /原材料、视图或版本/)

  const assetMismatch = detailFor()
  assetMismatch.asset.id = 'another-artifact'
  assert.throws(() => nativeAssemblyItem(assetMismatch, projectId), /原材料、视图或版本/)

  const revisionMismatch = detailFor()
  revisionMismatch.asset.lcos_projection.presented_revision_id = historicalRevisionId
  assert.throws(() => nativeAssemblyItem(revisionMismatch, projectId), /原材料、视图或版本/)

  const viewMismatch = detailFor()
  viewMismatch.asset.lcos_projection.artifact_view_id = 'another-view'
  assert.throws(() => nativeAssemblyItem(viewMismatch, projectId), /原材料、视图或版本/)

  const bytesUnavailable = detailFor()
  bytesUnavailable.asset.lcos_projection.content_available = false
  assert.throws(() => nativeAssemblyItem(bytesUnavailable, projectId), /原材料、视图或版本/)

  const notReferenceable = detailFor()
  notReferenceable.asset.lcos_projection.referenceable = false
  assert.throws(() => nativeAssemblyItem(notReferenceable, projectId), /原材料、视图或版本/)
})

test('historical selection becomes an exact Artifact reference without borrowing or mutating the Current View', () => {
  const item = nativeAssemblyItem(detailFor(), projectId)
  const historical = nativeAssemblyVersion(item, historicalRevisionId, 'image/png')
  assert.deepEqual(historical.entityRef, { type: 'artifact', id: artifactId })
  assert.equal(historical.presentedRevisionId, historicalRevisionId)
  assert.equal(historical.mimeType, 'image/png')
  assert.equal(item.entityRef.viewId, viewId, 'the original Warehouse row is unchanged')
  assert.equal(oldGraph.artifactViews[0].revisionId, currentRevisionId, 'Core View remains bound to Current')
  assert.doesNotThrow(() => verifyNativeAssemblyVersion(oldGraph, projectId, historical, historicalFileId))

  const staleView = { ...historical, entityRef: { type: 'artifact', id: artifactId, viewId } }
  assert.throws(() => verifyNativeAssemblyVersion(oldGraph, projectId, staleView, historicalFileId), /准确版本已不可用/)
})

test('a missing historical revision never falls back to Current and graph/file mismatches are rejected', () => {
  const item = nativeAssemblyItem(detailFor(), projectId)
  const missingHistorical = nativeAssemblyVersion(item, 'revision-does-not-exist', 'image/png')
  assert.throws(() => verifyNativeAssemblyVersion(oldGraph, projectId, missingHistorical, historicalFileId), /准确版本已不可用/)

  assert.throws(() => verifyNativeAssemblyVersion({ ...oldGraph, project: { ...oldGraph.project, id: 'another-project' } }, projectId,
    nativeAssemblyVersion(item, historicalRevisionId, 'image/png'), historicalFileId), /准确版本已不可用/)
  assert.throws(() => verifyNativeAssemblyVersion(oldGraph, projectId,
    nativeAssemblyVersion(item, historicalRevisionId, 'image/png'), currentFileId), /准确版本已不可用/)

  const draftGraph = { ...oldGraph, artifactRevisions: oldGraph.artifactRevisions.map((revision) => revision.id === historicalRevisionId
    ? { ...revision, status: 'draft' } : revision) }
  assert.throws(() => verifyNativeAssemblyVersion(draftGraph, projectId,
    nativeAssemblyVersion(item, historicalRevisionId, 'image/png'), historicalFileId), /准确版本已不可用/)

  const wrongHashGraph = { ...oldGraph, fileRecords: oldGraph.fileRecords.map((file) => file.id === historicalFileId
    ? { ...file, observedHash: 'some-other-bytes' } : file) }
  assert.throws(() => verifyNativeAssemblyVersion(wrongHashGraph, projectId,
    nativeAssemblyVersion(item, historicalRevisionId, 'image/png'), historicalFileId), /准确版本已不可用/)

  const nonCurrentGraph = { ...oldGraph, fileRecords: oldGraph.fileRecords.map((file) => file.id === historicalFileId
    ? { ...file, availability: 'stale' } : file) }
  assert.throws(() => verifyNativeAssemblyVersion(nonCurrentGraph, projectId,
    nativeAssemblyVersion(item, historicalRevisionId, 'image/png'), historicalFileId), /准确版本已不可用/)
})

test('message and continuation input changes cancel the same native Assembly take', () => {
  const original = { key: 'input-key-1', messageId: 'message-1', continuationOperationId: 'continuation-1' }
  assert.equal(sameNativeAssemblyInput(original, { ...original }), true)
  assert.equal(sameNativeAssemblyInput(original, { ...original, key: 'input-key-2' }), false)
  assert.equal(sameNativeAssemblyInput(original, { ...original, messageId: 'message-2' }), false)
  assert.equal(sameNativeAssemblyInput(original, { ...original, continuationOperationId: 'continuation-2' }), false)
  assert.equal(sameNativeAssemblyInput({ ...original, key: undefined }, original), false)
})
