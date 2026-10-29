import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = path.join(root, '.runtime', 'core-upload-' + Date.now())
await mkdir(runtimeRoot, { recursive: true })
await mkdir(path.join(root, 'evidence'), { recursive: true })
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
process.env.LCOS_RECOVERY_TRANSPORT = 'none'

const facadeEntry = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'surface-core-facade.mjs'))
const uploadEntry = await buildPilotEntry('lab/pilot/core-upload.ts', path.join(runtimeRoot, 'core-upload.mjs'))
const lifecycleEntry = await buildPilotEntry('lab/pilot/node-lifecycle.ts', path.join(runtimeRoot, 'node-lifecycle.mjs'))
const libraryEntry = await buildPilotEntry('lab/pilot/library-projection.ts', path.join(runtimeRoot, 'library-projection.mjs'))
const { startSurfaceCoreFacade } = await import(pathToFileURL(facadeEntry).href)
const { createCoreUpload } = await import(pathToFileURL(uploadEntry).href)
const { createNodeLifecycle } = await import(pathToFileURL(lifecycleEntry).href)
const { createLibraryProjection } = await import(pathToFileURL(libraryEntry).href)
const { CoreArtifactClient } = await import(pathToFileURL(await buildPilotEntry('lcos/apps/web-gen2/src/backend/artifacts.ts', path.join(runtimeRoot, 'core-artifacts.mjs'))).href)
const { HttpClient } = await import(pathToFileURL(await buildPilotEntry('lcos/apps/web-gen2/src/backend/client.ts', path.join(runtimeRoot, 'core-client.mjs'))).href)

const report = {
  implementation: 'TapNow single-PUT upload → CoreArtifactClient.importCopiedFile → exact Core FileRecord/Artifact/Revision/View → Huabu image carrier',
  boundary: 'real local image ingress and display binding only; this does not implement image editing or revision writeback',
  uploadLimit: { bytes: 128 * 1024 * 1024, owner: 'existing Core ImportCopyService limit; not a smaller upload-only cap' },
  unsupported: ['resumable upload', 'temporary upload retention semantics', 'TapNow cloud-folder placement', 'same-Artifact crop/image-tool revision producer'],
  runtimeRoot,
  originalUserDatabaseOpened: false,
  userProjectFilesWritten: false,
  syntheticCoreFilesWritten: true,
  modelTaskSubmitted: false,
  stagingIsRuntimeOnly: true,
  cases: [],
  passed: false,
}

let facade
let upload
let server
let origin
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6X3mQAAAAASUVORK5CYII=', 'base64')

try {
  server = createServer(async (request, response) => {
    if (upload && await upload(request, response, new URL(request.url || '/', origin))) return
    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  origin = `http://127.0.0.1:${address.port}`
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin })
  upload = createCoreUpload({ coreOrigin: facade.core.origin, repository: facade.core.repository,
    projectId: facade.core.projectId, publicOrigin: origin, runtimeRoot })

  const main = facade.workspaces.find(workspace => workspace.preferredSurface === 'main')
  const context = facade.workspaces.find(workspace => workspace.preferredSurface === 'context')
  assert.ok(main?.canvasId && main.scopeId)
  assert.ok(context?.canvasId && context.scopeId)
  report.cases.push('test starts with an isolated real Core SQLite project and Huabu disk/executor spaces')

  const createResponse = await fetch(`${origin}/api/files/upload-urls`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ file_name: 'receipt-test.png', mime_type: 'image/png', file_hash: 'tapnow-echo-only',
      file_size: png.length, folder_id: '', is_temporary: false, keep_original_filename: true,
      forbid_overwrite: true, is_resumable_mode: false, part_size: 8 * 1024 * 1024 }),
  })
  assert.equal(createResponse.status, 200)
  const created = await createResponse.json()
  assert.equal(created.code, 0)
  assert.equal(created.data.upload_strategy, 'single_put')
  assert.match(created.data.upload_url, new RegExp(`^${origin.replaceAll('.', '\\.')}\/api\/lcos-upload-staging\/core-upload-`))
  const uploadId = created.data.file_id

  const outsideOrigin = await fetch(`${origin}/api/files/upload-urls`, {
    method: 'POST', headers: { origin: 'http://example.invalid', 'content-type': 'application/json' }, body: '{}',
  })
  assert.equal(outsideOrigin.status, 403)
  const unsafeName = await fetch(`${origin}/api/files/upload-urls`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ file_name: '../escape.png', mime_type: 'image/png', file_size: png.length }),
  })
  assert.equal(unsafeName.status, 400)
  const oversizedJson = await fetch(`${origin}/api/files/upload-urls`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: ' '.repeat(128 * 1024 + 1),
  })
  assert.equal(oversizedJson.status, 413)
  const oversizedFile = await fetch(`${origin}/api/files/upload-urls`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ file_name: 'too-large.png', mime_type: 'image/png', file_size: 128 * 1024 * 1024 + 1 }),
  })
  assert.equal(oversizedFile.status, 413)
  const aboveFormerLimit = await fetch(`${origin}/api/files/upload-urls`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ file_name: 'larger-than-2m.png', mime_type: 'image/png', file_size: 3 * 1024 * 1024 }),
  })
  assert.equal(aboveFormerLimit.status, 200, 'upload layer must not impose the former arbitrary 2 MiB cap')
  const aboveFormerLimitBody = await aboveFormerLimit.json()
  const canceledLarge = await fetch(`${origin}/api/files/upload-urls/${encodeURIComponent(aboveFormerLimitBody.data.file_id)}`, {
    method: 'DELETE', headers: { origin },
  })
  assert.equal(canceledLarge.status, 200)
  const resumable = await fetch(`${origin}/api/files/upload-urls`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ file_name: 'resumable.png', mime_type: 'image/png', file_size: png.length, is_resumable_mode: true }),
  })
  assert.equal(resumable.status, 501)
  const stagingRoot = path.join(runtimeRoot, 'core-upload-staging')
  const beforePut = await readdir(stagingRoot)
  assert.deepEqual(beforePut, [])

  const invalidBytes = await fetch(created.data.upload_url, { method: 'PUT', headers: { origin, 'content-type': 'image/png' }, body: Buffer.from('not-png') })
  assert.equal(invalidBytes.status, 400)
  assert.deepEqual(await readdir(stagingRoot), [], 'invalid signatures must not reach persistent Core or survive as staged files')
  const putResponse = await fetch(created.data.upload_url, { method: 'PUT', headers: { origin, 'content-type': 'image/png' }, body: png })
  assert.equal(putResponse.status, 200)
  const stagedFiles = await readdir(stagingRoot)
  assert.equal(stagedFiles.length, 1)
  assert.ok(stagedFiles[0].startsWith(uploadId) && stagedFiles[0].endsWith('.bytes'))
  report.cases.push('single-PUT accepts a signature-valid synthetic PNG, enforces same-origin/path constraints, inherits the Core 128 MiB cap (including >2 MiB), and stages bytes only under .runtime')

  const incompleteContent = await fetch(`${origin}/api/conversation/storage/uploads/${encodeURIComponent(uploadId)}`, { headers: { origin } })
  assert.equal(incompleteContent.status, 409)
  const completeResponse = await fetch(`${origin}/api/files/upload-urls/${encodeURIComponent(uploadId)}/complete`, {
    method: 'PUT', headers: { origin },
  })
  assert.equal(completeResponse.status, 200)
  const completed = await completeResponse.json()
  assert.equal(completed.code, 0)
  assert.equal(completed.data.file_id, uploadId)
  assert.equal(completed.data.file_name, 'receipt-test.png')
  assert.equal(completed.data.mime_type, 'image/png')
  assert.equal(completed.data.file_size, png.length)
  assert.equal(completed.data.file_hash, 'tapnow-echo-only', 'the caller hash is only echoed, never used as identity')
  assert.deepEqual(await readdir(stagingRoot), [], 'successful import removes temporary staging bytes')

  const receipt = upload.resolveReceiptByUrl(completed.data.url)
  assert.ok(receipt)
  assert.deepEqual(receipt.lcos_ref, completed.data.lcos_ref)
  assert.equal(upload.resolveReceiptByUrl(completed.data.url + '?variant=thumbnail'), undefined)
  assert.equal(upload.resolveReceiptByUrl(completed.data.url.replace(uploadId, 'another-id')), undefined)
  const uploadedContent = await fetch(completed.data.url, { headers: { origin } })
  assert.equal(uploadedContent.status, 200)
  assert.equal(uploadedContent.headers.get('content-type'), 'image/png')
  assert.deepEqual(Buffer.from(await uploadedContent.arrayBuffer()), png)
  report.cases.push('complete calls Core Import Copy and returns the real Artifact/Revision/View ref; original storage URL resolves only by exact receipt URL to exact Core bytes')

  const client = new CoreArtifactClient(new HttpClient({ baseUrl: facade.core.origin }))
  const artifacts = await client.listArtifacts(facade.core.projectId)
  const importedArtifact = artifacts.find(artifact => String(artifact.id) === receipt.lcos_ref.artifactId)
  assert.ok(importedArtifact, 'imported image must be visible from Core Library artifact listing')
  const library = createLibraryProjection({ repository: facade.core.repository, projectId: facade.core.projectId, publicOrigin: origin })
  const libraryResponse = await library({ method: 'GET', url: new URL(`/api/library/v1/assets:search?keyword=receipt-test`, origin) })
  assert.ok(libraryResponse?.body.data.items.some(item => item.asset.id === receipt.lcos_ref.artifactId))
  report.cases.push('Library projection lists the Core-imported image and its exact FileRecord-backed content URL')

  const lifecycle = createNodeLifecycle({ repository: facade.core.repository, projectId: facade.core.projectId,
    spatial: facade.spatial, workspaceForCanvas: canvasId => facade.workspaces.find(workspace => workspace.canvasId === canvasId),
    publicOrigin: origin, coreOrigin: facade.core.origin })
  const mainCreated = await lifecycle.createImportedImage(main.canvasId, {
    id: 'tapnow-upload-image-main', type: 'image', position: { x: 940, y: 320 }, measured: { width: 400, height: 300 },
    data: { src: receipt.url, title: 'Upload Image', prompt: '', type: 'upload' },
  }, receipt)
  assert.equal(mainCreated.nodeId, 'tapnow-upload-image-main')
  assert.equal(mainCreated.lcos_ref.artifactId, receipt.lcos_ref.artifactId)
  assert.equal(mainCreated.lcos_ref.revisionId, receipt.lcos_ref.revisionId)
  assert.equal(mainCreated.data.src, `${origin}/api/surface-core/file-records/${encodeURIComponent(receipt.fileRecordId)}/content`)
  const mainBinding = facade.core.repository.findProjectionBinding(facade.core.projectId, main.canvasId, 'node', mainCreated.lcos_ref.entityType, mainCreated.lcos_ref.entityId)
  assert.equal(mainBinding?.spatialId, mainCreated.nodeId)

  const contextCreated = await lifecycle.createImportedImage(context.canvasId, {
    id: 'tapnow-upload-image-context', type: 'image', position: { x: 720, y: 260 }, measured: { width: 320, height: 240 },
    data: { src: receipt.url, title: 'Upload Image', prompt: '', type: 'upload' },
  }, receipt)
  assert.equal(contextCreated.nodeId, 'tapnow-upload-image-context')
  assert.equal(contextCreated.lcos_ref.artifactId, receipt.lcos_ref.artifactId)
  assert.equal(contextCreated.lcos_ref.revisionId, receipt.lcos_ref.revisionId)
  const contextBinding = facade.core.repository.findProjectionBinding(facade.core.projectId, context.canvasId, 'node', contextCreated.lcos_ref.entityType, contextCreated.lcos_ref.entityId)
  assert.equal(contextBinding?.spatialId, contextCreated.nodeId)
  const contextView = facade.core.repository.getArtifactView(contextCreated.lcos_ref.artifactViewId)
  assert.equal(String(contextView?.scopeId), String(context.scopeId))
  assert.equal(contextView?.revisionId, receipt.lcos_ref.revisionId)
  const fileRecords = facade.core.repository.getFileRecords(facade.core.projectId)
    .filter(file => String(file.id) === receipt.fileRecordId)
  assert.equal(fileRecords.length, 1, 'displaying the receipt in another workspace reuses its FileRecord')
  const contextImage = (await facade.spatial.read(context.canvasId)).state.nodes.find(node => node.id === contextCreated.nodeId)
  assert.equal(contextImage?.type, 'image')
  report.cases.push('fresh Main and Context TapNow image IDs are preserved; current Core carrier claim produces exact worksite identity/View while reusing Artifact/Revision/FileRecord')

  report.uploadReceipt = { file_id: receipt.file_id, fileRecordId: receipt.fileRecordId, artifactId: receipt.lcos_ref.artifactId,
    revisionId: receipt.lcos_ref.revisionId, uploadUrlExactLookup: true }
  report.coreLibraryVisible = true
  report.passed = true
} catch (error) {
  report.error = error?.stack || String(error)
  process.exitCode = 1
} finally {
  if (facade) await facade.close()
  if (server) await new Promise(resolve => server.close(resolve))
  await writeFile(path.join(root, 'evidence', 'core-upload.json'), JSON.stringify(report, null, 2) + '\n')
}

console.log(JSON.stringify(report, null, 2))
