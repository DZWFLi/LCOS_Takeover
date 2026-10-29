import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = path.join(workspaceRoot, '.runtime', `assembly-library-projection-${Date.now()}`)
await mkdir(runtimeRoot, { recursive: true })

const providerKeys = [
  'LCOS_INTELLIGENCE_PROVIDERS', 'LCOS_COMPATIBLE_BASE_URL',
  'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY',
  'GEMINI_BASE_URL', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_API_KEY',
  'GROQ_BASE_URL', 'GROQ_API_KEY', 'MISTRAL_BASE_URL', 'MISTRAL_API_KEY', 'XAI_BASE_URL', 'XAI_API_KEY',
  'QWEN_BASE_URL', 'DASHSCOPE_API_KEY', 'ZHIPU_BASE_URL', 'ZHIPU_API_KEY', 'MOONSHOT_BASE_URL',
  'MOONSHOT_API_KEY', 'SILICONFLOW_BASE_URL', 'SILICONFLOW_API_KEY', 'MINIMAX_BASE_URL', 'MINIMAX_API_KEY',
  'HUNYUAN_BASE_URL', 'HUNYUAN_API_KEY', 'QIANFAN_BASE_URL', 'QIANFAN_API_KEY', 'COHERE_BASE_URL',
  'COHERE_API_KEY', 'TOGETHER_BASE_URL', 'TOGETHER_API_KEY', 'FIREWORKS_BASE_URL', 'FIREWORKS_API_KEY',
  'PERPLEXITY_BASE_URL', 'PERPLEXITY_API_KEY', 'BEDROCK_BASE_URL', 'BEDROCK_API_KEY',
  'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_API_VERSION', 'LMSTUDIO_BASE_URL',
]
for (const key of providerKeys) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'

const report = {
  task: 'opt-in TapNow Library projection over the original Core Warehouse Artifact rows',
  runtimeRoot,
  providerEnvironmentCleared: providerKeys.every((key) => process.env[key] === undefined),
  recoveryTransport: process.env.LCOS_RECOVERY_TRANSPORT,
  originalUserDatabaseOpened: false,
  coreServiceStarted: false,
  browserStarted: false,
  providerStarted: false,
  cases: [],
  passed: false,
}

const entry = await buildPilotEntry('lab/pilot/assembly-library-projection.ts', path.join(runtimeRoot, 'assembly-library-projection.mjs'))
const { createAssemblyLibraryProjection } = await import(pathToFileURL(entry).href)

const projectId = 'project-fixture'
const artifacts = [
  { id: 'artifact-a', projectId, title: 'Alpha photo.jpg', kind: 'markdown', currentRevisionId: 'revision-a-current',
    createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-15T05:00:00.000Z' },
  { id: 'artifact-b', projectId, title: 'Alpha unavailable.jpg', kind: 'image', currentRevisionId: 'revision-b-current',
    createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-15T04:00:00.000Z' },
  { id: 'artifact-c', projectId, title: 'Alpha icon.jpg', kind: 'image', currentRevisionId: 'revision-c-current',
    createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-15T03:00:00.000Z' },
  { id: 'artifact-d', projectId, title: 'Alpha video.jpg', kind: 'other', currentRevisionId: 'revision-d-current',
    createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-15T02:00:00.000Z' },
  { id: 'artifact-e', projectId, title: 'Alpha audio.jpg', kind: 'other', currentRevisionId: 'revision-e-draft',
    createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-15T01:00:00.000Z' },
]
const revisions = [
  { id: 'revision-a-historical', artifactId: 'artifact-a', fileRecordId: 'file-a-historical', contentHash: 'a-historical', status: 'superseded' },
  { id: 'revision-a-unknown', artifactId: 'artifact-a', fileRecordId: 'file-a-unknown', contentHash: 'a-unknown', status: 'superseded' },
  { id: 'revision-a-current', artifactId: 'artifact-a', fileRecordId: 'file-a-current', contentHash: 'a-current', status: 'current' },
  { id: 'revision-b-historical', artifactId: 'artifact-b', fileRecordId: 'file-b-missing', contentHash: 'b-historical', status: 'superseded' },
  { id: 'revision-b-current', artifactId: 'artifact-b', fileRecordId: 'file-b-current', contentHash: 'b-current', status: 'current' },
  { id: 'revision-c-current', artifactId: 'artifact-c', fileRecordId: 'file-c-current', contentHash: 'c-current', status: 'current' },
  { id: 'revision-d-current', artifactId: 'artifact-d', fileRecordId: 'file-d-current', contentHash: 'd-current', status: 'current' },
  { id: 'revision-e-draft', artifactId: 'artifact-e', fileRecordId: 'file-e-draft', contentHash: 'e-draft', status: 'draft' },
]
const views = [
  { id: 'view-a', artifactId: 'artifact-a', scopeId: 'scope-fixture', revisionId: 'revision-a-current', referenceKind: 'primary' },
  { id: 'view-b', artifactId: 'artifact-b', scopeId: 'scope-fixture', revisionId: 'revision-b-historical', referenceKind: 'primary' },
  { id: 'view-c', artifactId: 'artifact-c', scopeId: 'scope-fixture', revisionId: 'revision-c-current', referenceKind: 'primary' },
  { id: 'view-d', artifactId: 'artifact-d', scopeId: 'scope-fixture', revisionId: 'revision-d-current', referenceKind: 'primary' },
  { id: 'view-e', artifactId: 'artifact-e', scopeId: 'scope-fixture', revisionId: 'revision-e-draft', referenceKind: 'primary' },
]
const files = [
  { id: 'file-a-historical', projectId, observedHash: 'a-historical', mimeType: 'image/png', availability: 'current', observedPath: 'C:\\fixture\\Alpha old.png' },
  { id: 'file-a-unknown', projectId, observedHash: 'a-unknown', mimeType: 'application/x-lcos-unknown', availability: 'current', observedPath: 'C:\\fixture\\Alpha old.unknown' },
  { id: 'file-a-current', projectId, observedHash: 'a-current', mimeType: 'text/markdown', availability: 'current', observedPath: 'C:\\fixture\\Alpha photo.jpg' },
  // The unavailable historical FileRecord is intentionally absent. Current is available and must not substitute for it.
  { id: 'file-b-current', projectId, observedHash: 'b-current', mimeType: 'image/png', availability: 'current', observedPath: 'C:\\fixture\\Alpha current.png' },
  { id: 'file-c-current', projectId, observedHash: 'c-current', mimeType: 'image/png', availability: 'current', observedPath: 'C:\\fixture\\Alpha icon.jpg' },
  { id: 'file-d-current', projectId, observedHash: 'wrong-d-hash', mimeType: 'video/mp4', availability: 'current', observedPath: 'C:\\fixture\\Alpha video.jpg' },
  { id: 'file-e-draft', projectId, observedHash: 'e-draft', mimeType: 'audio/wav', availability: 'current', observedPath: 'C:\\fixture\\Alpha audio.jpg' },
]

const repository = {
  getProject: (id) => id === projectId ? { id, name: 'Fixture Project', rootPath: 'C:\\fixture' } : undefined,
  getArtifacts: (id) => artifacts.filter((artifact) => artifact.projectId === id),
  getArtifact: (id) => artifacts.find((artifact) => artifact.id === id),
  getArtifactViews: (id) => views.filter((view) => view.artifactId === id),
  getArtifactView: (id) => views.find((view) => view.id === id),
  getArtifactRevision: (id) => revisions.find((revision) => revision.id === id),
  getFileRecord: (id) => files.find((file) => file.id === id),
  getArtifactBirthRunId: () => undefined,
  getResourceDescriptorForRevision: () => undefined,
  listProjectWorkspaceMemberships: () => [],
  listProjectWorkspaceEntityMemberships: () => [],
  getRelations: () => [],
}

const handler = createAssemblyLibraryProjection({ repository, projectId, publicOrigin: 'http://127.0.0.1:19876' })
const origin = 'http://127.0.0.1:19876'

function call(method, pathname) {
  return handler({ method, url: new URL(pathname, origin) })
}

test('private Library folder and search pages preserve exact Warehouse Artifact/View/Revision identity', async () => {
  const folder = await call('GET', '/api/library/v1/spaces/SPACE_TYPE_PRIVATE/folders')
  assert.equal(folder.status, 200)
  assert.deepEqual(folder.body.data.folders[0], {
    id: 'lcos-project:project-fixture', name: 'Fixture Project', parent_id: '0', space_type: 'SPACE_TYPE_PRIVATE',
    asset_count: 5, lcos_projection: { project_id: projectId, read_only: true, catalog_only: false },
  })

  const first = await call('GET', '/api/library/v1/assets:search?keyword=Alpha&page=1&page_size=1')
  assert.equal(first.status, 200)
  assert.equal(first.body.data.pagination.total, 5)
  assert.equal(first.body.data.pagination.has_next, true)
  const firstAsset = first.body.data.items[0].asset
  assert.equal(firstAsset.id, 'artifact-a')
  assert.equal(firstAsset.asset_type, 4, 'current list family comes from the current Warehouse row, not the .jpg title')
  assert.deepEqual(firstAsset.lcos_projection.assembly_item.entityRef, { type: 'artifact', id: 'artifact-a', viewId: 'view-a' })
  assert.equal(firstAsset.lcos_projection.project_id, projectId)
  assert.equal(firstAsset.lcos_projection.assembly_item.presentedRevisionId, 'revision-a-current')
  assert.equal(firstAsset.lcos_projection.artifact_id, 'artifact-a')
  assert.equal(firstAsset.lcos_projection.artifact_view_id, 'view-a')
  assert.equal(firstAsset.lcos_projection.presented_revision_id, 'revision-a-current')
  assert.equal(firstAsset.lcos_projection.current_revision_id, 'revision-a-current')
  assert.equal(firstAsset.lcos_projection.file_record_id, 'file-a-current')
  assert.equal(firstAsset.lcos_projection.content_available, true)
  assert.equal(firstAsset.source_url, `${origin}/api/surface-core/file-records/file-a-current/content`)

  const second = await call('GET', '/api/library/v1/folders/lcos-project%3Aproject-fixture/assets?keyword=Alpha&page=2&page_size=1')
  assert.equal(second.status, 200)
  assert.equal(second.body.data.pagination.has_next, true)
  assert.equal(second.body.data.assets[0].id, 'artifact-b')
  assert.equal(second.body.data.assets[0].lcos_projection.referenceable, false)
  assert.equal(second.body.data.assets[0].lcos_projection.presented_revision_id, 'revision-b-historical')
  assert.equal(second.body.data.assets[0].lcos_projection.current_revision_id, 'revision-b-current')
  assert.equal(second.body.data.assets[0].lcos_projection.file_record_id, 'file-b-missing')
  assert.equal(second.body.data.assets[0].lcos_projection.content_available, false)
  assert.equal(second.body.data.assets[0].source_url, '', 'an unavailable Presented Revision never falls back to Current')

  const imageFirst = await call('GET', '/api/library/v1/assets:search?keyword=Alpha&type_filter=1&page=1&page_size=1')
  const imageSecond = await call('GET', '/api/library/v1/assets:search?keyword=Alpha&type_filter=1&page=2&page_size=1')
  assert.equal(imageFirst.status, 200)
  assert.equal(imageFirst.body.data.pagination.total, 2)
  assert.equal(imageFirst.body.data.pagination.has_next, true)
  assert.equal(imageFirst.body.data.items[0].asset.id, 'artifact-b', 'Warehouse filters Image before Library pagination')
  assert.equal(imageSecond.body.data.pagination.has_next, false)
  assert.equal(imageSecond.body.data.items[0].asset.id, 'artifact-c')
  assert.equal(imageFirst.body.data.items[0].asset.asset_type, 1)

  const text = await call('GET', '/api/library/v1/assets:search?keyword=Alpha&type_filter=TEXT&page=1&page_size=1')
  assert.equal(text.body.data.pagination.total, 1)
  assert.equal(text.body.data.items[0].asset.id, 'artifact-a')

  const videoRow = await call('GET', '/api/library/v1/assets:search?keyword=Alpha&page=4&page_size=1')
  const audioRow = await call('GET', '/api/library/v1/assets:search?keyword=Alpha&page=5&page_size=1')
  assert.equal(videoRow.body.data.items[0].asset.asset_type, 2, 'video type comes from Warehouse MIME family, not the .jpg title')
  assert.equal(videoRow.body.data.items[0].asset.lcos_projection.referenceable, false, 'hash mismatch blocks video bytes')
  assert.equal(audioRow.body.data.items[0].asset.asset_type, 3, 'audio type comes from Warehouse MIME family, not the .jpg title')
  assert.equal(audioRow.body.data.items[0].asset.lcos_projection.referenceable, false, 'draft revision blocks audio bytes')
  report.cases.push('private project folder, keyword pagination, MIME-derived type, and original Warehouse identity survive projection')
})

test('asset detail reads an exact historical revision without borrowing its current View', async () => {
  const historical = await call('GET', '/api/library/v1/assets/artifact-a?revision_id=revision-a-historical')
  assert.equal(historical.status, 200)
  const asset = historical.body.data.asset
  assert.equal(asset.id, 'artifact-a')
  assert.equal(historical.body.data.folder_id, 'lcos-project:project-fixture')
  assert.equal(historical.body.data.folder_name, 'Fixture Project')
  assert.equal(historical.body.data.folder_display_path, 'Fixture Project')
  assert.equal(asset.lcos_projection.artifact_view_id, null)
  assert.deepEqual(asset.lcos_projection.assembly_item.entityRef, { type: 'artifact', id: 'artifact-a' })
  assert.equal(asset.lcos_projection.presented_revision_id, 'revision-a-historical')
  assert.equal(asset.lcos_projection.assembly_item.presentedRevisionId, 'revision-a-historical')
  assert.equal(asset.lcos_projection.warehouse_item.entityRef.viewId, 'view-a')
  assert.equal(asset.lcos_projection.warehouse_item.presentedRevisionId, 'revision-a-current')
  assert.equal(asset.lcos_projection.file_record_id, 'file-a-historical')
  assert.equal(asset.asset_type, 1, 'historical image MIME replaces the current text family')
  assert.equal(asset.thumbnail_url, asset.source_url, 'historical image MIME controls its thumbnail type')
  assert.equal(asset.lcos_projection.assembly_item.visualFamily, 'image')
  assert.equal(asset.lcos_projection.assembly_item.mimeType, 'image/png')
  assert.equal(asset.source_url, `${origin}/api/surface-core/file-records/file-a-historical/content`)
  assert.equal(repository.getArtifactView('view-a').revisionId, 'revision-a-current', 'historical selection never mutates Core View')

  const unknown = await call('GET', '/api/library/v1/assets/artifact-a?revision_id=revision-a-unknown')
  assert.equal(unknown.status, 200)
  assert.equal(unknown.body.data.asset.asset_type, 0, 'unknown historical MIME does not inherit the current image type')
  assert.equal(unknown.body.data.asset.thumbnail_url, '')
  assert.equal(unknown.body.data.asset.lcos_projection.assembly_item.visualFamily, undefined)
  assert.equal(unknown.body.data.asset.lcos_projection.assembly_item.mimeType, 'application/x-lcos-unknown')

  const foreign = await call('GET', '/api/library/v1/assets/artifact-a?revision_id=revision-b-current')
  assert.equal(foreign.status, 404)
  assert.equal(foreign.body.error.code, 'ASSEMBLY_REVISION_NOT_FOUND')
  const missing = await call('GET', '/api/library/v1/assets/artifact-a?revision_id=does-not-exist')
  assert.equal(missing.status, 404)
  report.cases.push('detail binds historical bytes as an Artifact-only ref, leaves Core View unchanged, and rejects foreign/missing revisions')
})

test('unsupported folder actions, spaces, and invalid paging fail closed', async () => {
  const team = await call('GET', '/api/library/v1/spaces/SPACE_TYPE_TEAM/folders')
  assert.equal(team.status, 501)
  assert.equal(team.body.error.code, 'CLOUD_LIBRARY_NOT_CONNECTED')
  const mutation = await call('POST', '/api/library/v1/folders/lcos-project%3Aproject-fixture/assets')
  assert.equal(mutation.status, 501)
  const invalidPage = await call('GET', '/api/library/v1/assets:search?keyword=Alpha&page=0')
  assert.equal(invalidPage.status, 400)
  const video = await call('GET', '/api/library/v1/assets:search?type_filter=2')
  assert.equal(video.status, 501, 'Core materialFilter cannot separate video from audio')
  assert.equal(video.body.error.code, 'LIBRARY_TYPE_FILTER_NOT_CONNECTED')
  const audio = await call('GET', '/api/library/v1/assets:search?type_filter=3')
  assert.equal(audio.status, 501, 'Core materialFilter cannot separate audio from video')
  assert.equal(audio.body.error.code, 'LIBRARY_TYPE_FILTER_NOT_CONNECTED')
  const invalidType = await call('GET', '/api/library/v1/assets:search?type_filter=99')
  assert.equal(invalidType.status, 400)
  report.cases.push('cloud scope and mutations remain unsupported; malformed page is rejected')
})

after(async () => {
  report.passed = report.cases.length === 3
  await writeFile(path.join(runtimeRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n')
})
