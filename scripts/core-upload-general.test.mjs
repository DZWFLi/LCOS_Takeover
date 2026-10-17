import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const runtimeRoot = path.join(root, '.runtime', `core-upload-general-${stamp}`)
const output = path.join(root, 'output/原生文件Drop整合_20261017i/真实Core通用导入', stamp)
await mkdir(runtimeRoot, { recursive: true }); await mkdir(output, { recursive: true })
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'
const requireCore = createRequire(path.join(installedRoot, 'apps/local-core/package.json'))
const { zipSync, unzipSync, strToU8 } = requireCore('fflate')
const { createCoreUpload } = await import(pathToFileURL(await buildPilotEntry('lab/pilot/core-upload.ts', path.join(runtimeRoot, 'upload.mjs'))).href)
const { coreUploadFormat, validCoreUploadBytes } = await import(pathToFileURL(await buildPilotEntry('lab/pilot/core-upload-format.ts', path.join(runtimeRoot, 'format.mjs'))).href)
const { startSurfaceCoreFacade } = await import(pathToFileURL(await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'facade.mjs'))).href)

const report = { scope: 'real isolated Core + original import route/ImportCopy/Resource service + real single-PUT HTTP adapter',
  fixture: 'synthetic text/archive/audio/video and readonly repository document fixtures; original projects/vendor untouched',
  runtimeRoot, originalProjectOpened: false, candidateAccessed: false, modelOrRunSubmitted: false,
  boundary: 'durable exact-byte import only; does not prove native canvas carrier, reader rendering, transcription, ZIP expansion, or URL Drop',
  cases: [], imports: [], passed: false }
let facade, server, upload, coreProxy, origin, proxyOrigin, loseComplete = false, lost = false, loseCoreReply = false
let coreImportPosts = 0
const importRequestIds = []
const fixtures = []
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6X3mQAAAAASUVORK5CYII=', 'base64')
const fixtureDir = path.join(root, 'lcos/huabu/apps/web/src/lcos/professional/__fixtures__')

async function listen(value) {
  await new Promise((resolve, reject) => { value.once('error', reject); value.listen(0, '127.0.0.1', resolve) })
  return `http://127.0.0.1:${value.address().port}`
}
async function json(url, method, body) {
  const response = await fetch(url, { method, headers: { origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, body: await response.json() }
}
async function create(file, extra = {}) {
  return json(`${origin}/api/files/upload-urls`, 'POST', {
    file_name: file.name, mime_type: file.mime, file_size: file.bytes.length, ...extra,
  })
}
async function put(created, bytes) {
  return fetch(created.body.data.upload_url, { method: 'PUT', headers: { origin }, body: bytes })
}
function completeUrl(created) { return `${origin}/api/files/upload-urls/${created.body.data.file_id}/complete` }
function counts() {
  return { artifacts: facade.core.repository.getArtifacts(facade.core.projectId).length,
    files: facade.core.repository.getFileRecords(facade.core.projectId).length,
    runs: facade.core.repository.getProjectExecutionProjection(facade.core.projectId).runs.length }
}
function clip(name, codecArgs) {
  const file = path.join(runtimeRoot, name)
  execFileSync('C:/Users/1/.local/bin/ffmpeg.exe', ['-hide_banner', '-loglevel', 'error', '-y', ...codecArgs, file],
    { timeout: 30000, windowsHide: true })
  return file
}
async function officeFixture(name, part) {
  const entries = unzipSync(await readFile(path.join(fixtureDir, name)))
  // Existing reader fixtures exercise text extraction and omit the package's
  // root relationship. Complete the synthetic package rather than weakening
  // production admission to accept a wrong/partial Office container.
  entries['_rels/.rels'] = strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${part}"/></Relationships>`)
  return Buffer.from(zipSync(entries))
}

try {
  fixtures.push({ name: '合成材料.txt', mime: 'text/plain', bytes: Buffer.from('真实 UTF-8 文件\nSynthetic text fixture.\n'), kind: 'markdown' },
    { name: 'synthetic-note.md', mime: '', bytes: Buffer.from('# 合成材料\n\nMarkdown **正文**与原字节。\n'), kind: 'markdown' },
    { name: 'synthetic-data.json', mime: 'application/json', bytes: Buffer.from('{"synthetic":true,"text":"原值"}\n'), kind: 'other' },
    { name: 'synthetic.csv', mime: 'text/csv', bytes: Buffer.from('name,value\nsynthetic,1\n'), kind: 'markdown' },
    { name: 'synthetic.yaml', mime: 'text/yaml', bytes: Buffer.from('synthetic: true\n'), kind: 'other' },
    { name: 'synthetic.xml', mime: 'text/xml', bytes: Buffer.from('<synthetic>original file</synthetic>\n'), kind: 'other' },
    { name: 'synthetic.html', mime: 'text/html', bytes: Buffer.from('<!doctype html><title>Synthetic file</title><p>Stored original.</p>'), kind: 'markdown' },
    { name: 'synthetic.png', mime: 'image/png', bytes: png, kind: 'image' },
    { name: 'reader-pages.pdf', mime: 'application/pdf', bytes: await readFile(path.join(fixtureDir, 'reader-pages.pdf')), kind: 'pdf' },
    { name: 'synthetic-reader-history.docx', mime: 'application/octet-stream', bytes: await officeFixture('reader-history.docx', 'word/document.xml'), kind: 'other' },
    { name: 'synthetic-reader-slides.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes: await officeFixture('reader-slides.pptx', 'ppt/presentation.xml'), kind: 'presentation' },
    { name: 'synthetic.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'other', bytes: Buffer.from(zipSync({
      '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>'),
      '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
      'xl/workbook.xml': strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>'),
    })) },
    { name: 'synthetic.zip', mime: 'application/x-zip-compressed', bytes: Buffer.from(zipSync({ 'note.txt': strToU8('Synthetic ZIP original file, no expansion requested.') })), kind: 'other' })
  const audio = ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.12', '-ar', '16000', '-ac', '1']
  const video = ['-f', 'lavfi', '-i', 'color=c=blue:s=32x32:d=0.12:r=25', '-an']
  for (const [name, mime, args] of [
    ['synthetic.wav', 'audio/x-wav', [...audio, '-c:a', 'pcm_s16le']],
    ['synthetic.mp3', 'audio/mpeg', [...audio, '-c:a', 'libmp3lame']],
    ['synthetic.m4a', 'audio/x-m4a', [...audio, '-c:a', 'aac']],
    ['synthetic.mp4', 'video/mp4', [...video, '-c:v', 'libx264', '-pix_fmt', 'yuv420p']],
    ['synthetic.mov', 'video/quicktime', [...video, '-c:v', 'libx264', '-pix_fmt', 'yuv420p']],
    ['synthetic.webm', 'video/webm', [...video, '-c:v', 'libvpx-vp9']],
  ]) fixtures.push({ name, mime, bytes: await readFile(clip(name, args)), kind: 'other' })
  for (const fixture of fixtures) {
    const format = coreUploadFormat(fixture.name, fixture.mime)
    assert.ok(format, `${fixture.name}: canonical MIME must be recognized`)
    assert.equal(format.artifactKind, fixture.kind)
    assert.equal(validCoreUploadBytes(fixture.bytes, fixture.name, format.mimeType), true, `${fixture.name}: actual fixture/container`)
  }

  server = createServer(async (request, response) => {
    if (upload) {
      const wrapped = loseComplete && !lost && request.url.endsWith('/complete') ? {
        writeHead: (...args) => response.writeHead(...args), end: () => { lost = true; response.destroy() },
      } : response
      if (await upload(request, wrapped, new URL(request.url, origin))) return
    }
    response.writeHead(404); response.end()
  })
  origin = await listen(server)
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin })
  const projectId = facade.core.projectId
  const initial = counts()
  coreProxy = createServer(async (request, response) => {
    if (request.method === 'POST' && /\/imports$/.test(request.url)) coreImportPosts++
    const chunks = []; for await (const part of request) chunks.push(part)
    if (request.method === 'POST' && /\/imports$/.test(request.url)) importRequestIds.push(/name="importRequestId"\r\n\r\n([^\r\n]+)/.exec(Buffer.concat(chunks).toString('utf8'))?.[1])
    const remote = await fetch(new URL(request.url, facade.core.origin), { method: request.method,
      headers: { 'content-type': request.headers['content-type'] || 'application/octet-stream' },
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) })
    const bytes = Buffer.from(await remote.arrayBuffer())
    if (loseCoreReply && request.method === 'POST' && /\/imports$/.test(request.url)) {
      loseCoreReply = false; response.destroy(); return
    }
    response.writeHead(remote.status, Object.fromEntries(remote.headers)); response.end(bytes)
  })
  proxyOrigin = await listen(coreProxy)
  upload = createCoreUpload({ coreOrigin: proxyOrigin, repository: facade.core.repository, projectId, publicOrigin: origin, runtimeRoot })

  for (const fixture of fixtures) {
    const before = counts(), postBefore = coreImportPosts
    const created = await create(fixture)
    assert.equal(created.status, 200, `${fixture.name} create: ${JSON.stringify(created.body)}`)
    assert.equal((await put(created, fixture.bytes)).status, 200)
    const completed = await json(completeUrl(created), 'PUT')
    assert.equal(completed.status, 200, `${fixture.name} complete: ${JSON.stringify(completed.body)}`)
    const receipt = completed.body.data
    const artifact = facade.core.repository.getArtifact(receipt.lcos_ref.artifactId)
    const revision = facade.core.repository.getArtifactRevision(receipt.lcos_ref.revisionId)
    const view = facade.core.repository.getArtifactView(receipt.lcos_ref.artifactViewId)
    const fileRecord = facade.core.repository.getFileRecord(receipt.fileRecordId)
    assert.equal(artifact.projectId, projectId); assert.equal(artifact.kind, fixture.kind)
    assert.equal(receipt.artifact_kind, artifact.kind)
    assert.equal(revision.artifactId, artifact.id); assert.equal(revision.fileRecordId, fileRecord.id)
    assert.equal(view.artifactId, artifact.id); assert.equal(view.revisionId, revision.id)
    assert.equal(fileRecord.projectId, projectId); assert.equal(fileRecord.size, fixture.bytes.length)
    assert.equal(receipt.mime_type, fileRecord.mimeType)
    assert.deepEqual(await readFile(fileRecord.observedPath), fixture.bytes)
    const content = await fetch(receipt.url, { headers: { origin } })
    assert.equal(content.status, 200); assert.equal(content.headers.get('content-type'), fileRecord.mimeType)
    if (artifact.kind !== 'image') assert.ok(content.headers.get('content-disposition')?.startsWith('attachment;'), 'non-image opaque URL must not execute uploaded HTML/XML as the host page')
    assert.deepEqual(Buffer.from(await content.arrayBuffer()), fixture.bytes)
    assert.deepEqual((await json(completeUrl(created), 'PUT')).body.data, receipt)
    assert.equal(coreImportPosts - postBefore, 1, 'same completion must not import twice')
    assert.deepEqual(counts(), { ...before, artifacts: before.artifacts + 1, files: before.files + 1 })
    const resource = facade.core.repository.listResourceDescriptors(projectId).find(value => value.sourceRevisionId === revision.id)
    assert.ok(resource, 'original resource descriptor must be attached by the actual Core import route')
    assert.equal((await put(created, fixture.bytes)).status, 409, 'completed exact import cannot be replaced')
    report.imports.push({ name: fixture.name, inputMime: fixture.mime, mime: fileRecord.mimeType, kind: artifact.kind,
      artifactId: artifact.id, revisionId: revision.id, viewId: view.id, fileRecordId: fileRecord.id,
      resourceId: resource.resourceId, understandingStatus: resource.understanding?.status, size: fileRecord.size, exactBytes: true })
  }
  report.cases.push(`${fixtures.length} real formats canonical import + exact Core Artifact/Revision/View/FileRecord/resource + storage bytes + repeated completion one import`)

  const invalid = [
    ['truncated.pdf', 'application/pdf', Buffer.from('%PDF-1.7\ntruncated')],
    ['wrong.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fixtures.find(f => f.name.endsWith('.pptx')).bytes],
    ['truncated.zip', 'application/zip', fixtures.find(f => f.name.endsWith('.zip')).bytes.subarray(0, -3)],
    ['invalid.txt', 'text/plain', Buffer.from([0xff, 0xfe, 0, 10])],
    ['invalid.json', 'application/json', Buffer.from('{broken')],
    ['truncated.wav', 'audio/wav', fixtures.find(f => f.name.endsWith('.wav')).bytes.subarray(0, -1)],
    ['truncated.mp3', 'audio/mpeg', fixtures.find(f => f.name.endsWith('.mp3')).bytes.subarray(0, -1)],
    ['truncated.mp4', 'video/mp4', fixtures.find(f => f.name.endsWith('.mp4')).bytes.subarray(0, -1)],
    ['truncated.webm', 'video/webm', fixtures.find(f => f.name.endsWith('.webm')).bytes.subarray(0, -1)],
  ]
  for (const [name, mime, bytes] of invalid) {
    const before = counts(), postBefore = coreImportPosts, created = await create({ name, mime, bytes })
    assert.equal(created.status, 200)
    assert.equal((await put(created, bytes)).status, 400, name)
    assert.equal((await json(completeUrl(created), 'PUT')).status, 409)
    assert.deepEqual(counts(), before); assert.equal(coreImportPosts, postBefore)
    assert.equal((await json(`${origin}/api/files/upload-urls/${created.body.data.file_id}`, 'DELETE')).status, 200)
  }
  for (const file of [{ name: 'wrong.pdf', mime: 'image/png', bytes: png },
    { name: '../escape.txt', mime: 'text/plain', bytes: png },
    { name: 'shortcut.url', mime: 'text/plain', bytes: Buffer.from('https://example.invalid') }]) {
    const response = await create(file); assert.ok([400, 415].includes(response.status))
  }
  const limit = await create({ name: 'large.zip', mime: 'application/zip', bytes: Buffer.alloc(1) }, { file_size: 128 * 1024 * 1024 })
  assert.equal(limit.status, 200)
  assert.equal((await json(`${origin}/api/files/upload-urls/${limit.body.data.file_id}`, 'DELETE')).status, 200)
  assert.equal((await create({ name: 'too-large.zip', mime: 'application/zip', bytes: Buffer.alloc(1) }, { file_size: 128 * 1024 * 1024 + 1 })).status, 413)
  report.cases.push('9 bad/truncated containers/encoding plus wrong extension-MIME, unsafe path, URL shortcut rejected; 128MiB unchanged')

  const cancelFile = { name: 'cancel.txt', mime: 'text/plain', bytes: Buffer.from('synthetic canceled intent') }
  const canceled = await create(cancelFile), beforeCancel = counts()
  let requestStarted
  const started = new Promise(resolve => { requestStarted = resolve })
  const pausedRequest = httpRequest(canceled.body.data.upload_url, { method: 'PUT', headers: { origin } })
  const pausedResponse = new Promise((resolve, reject) => { pausedRequest.on('response', response => { response.resume(); response.on('end', () => resolve(response.statusCode)) }); pausedRequest.on('error', reject) })
  pausedRequest.flushHeaders(); pausedRequest.write(cancelFile.bytes.subarray(0, 2)); requestStarted()
  await started; await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal((await json(`${origin}/api/files/upload-urls/${canceled.body.data.file_id}`, 'DELETE')).status, 409)
  pausedRequest.end(cancelFile.bytes.subarray(2)); assert.equal(await pausedResponse, 200)
  assert.equal((await json(`${origin}/api/files/upload-urls/${canceled.body.data.file_id}`, 'DELETE')).status, 200)
  assert.equal((await json(completeUrl(canceled), 'PUT')).status, 404)
  assert.deepEqual(counts(), beforeCancel)
  report.cases.push('busy staging cannot falsely confirm cancellation; actual post-stage cancel deletes only transient bytes and makes completion404, zero canonical writes')

  const lostFile = { name: 'lost-complete.md', mime: 'text/markdown', bytes: Buffer.from('# Synthetic lost response\nOne durable original import.\n') }
  const unknown = await create(lostFile), beforeLost = counts(), postBeforeLost = coreImportPosts
  assert.equal((await put(unknown, lostFile.bytes)).status, 200)
  loseComplete = true
  await assert.rejects(() => json(completeUrl(unknown), 'PUT'))
  assert.equal(lost, true)
  const recovered = await json(completeUrl(unknown), 'PUT')
  assert.equal(recovered.status, 200)
  assert.equal(coreImportPosts - postBeforeLost, 1)
  assert.deepEqual(counts(), { ...beforeLost, artifacts: beforeLost.artifacts + 1, files: beforeLost.files + 1 })
  report.cases.push('lost complete200 after real commit reuses the same live upload receipt; explicit completion check does not repeat Core import')

  loseComplete = false
  const coreLostFile = { name: 'lost-core-reply.txt', mime: 'text/plain', bytes: Buffer.from('Synthetic original Core response loss, same request identity.\n') }
  const coreUnknown = await create(coreLostFile), beforeCoreLoss = counts(), postsCoreBefore = coreImportPosts
  assert.equal((await put(coreUnknown, coreLostFile.bytes)).status, 200)
  loseCoreReply = true
  assert.equal((await json(completeUrl(coreUnknown), 'PUT')).status, 500)
  assert.deepEqual(counts(), { ...beforeCoreLoss, artifacts: beforeCoreLoss.artifacts + 1, files: beforeCoreLoss.files + 1 })
  const retryCore = await json(completeUrl(coreUnknown), 'PUT')
  assert.equal(retryCore.status, 200)
  assert.equal(coreImportPosts - postsCoreBefore, 2, 'a lost upstream import reply is not falsely described as GET-only recovery')
  assert.equal(importRequestIds.at(-1), importRequestIds.at(-2), 'explicit completion retry must keep the same original Core importRequestId')
  assert.deepEqual(counts(), { ...beforeCoreLoss, artifacts: beforeCoreLoss.artifacts + 1, files: beforeCoreLoss.files + 1 })
  report.cases.push('lost upstream Core reply leaves staged intent unconfirmed; explicit complete retry uses the same existing Core request identity and real Core reuses one Artifact/FileRecord (two upstream POSTs, not GET-only)')
  assert.equal(counts().runs, initial.runs, 'no Run dispatched or created')
  assert.deepEqual(await readdir(path.join(runtimeRoot, 'core-upload-staging')), [])
  report.finalCounts = counts(); report.initialCounts = initial; report.coreImportPosts = coreImportPosts
  report.passed = true
} catch (error) { report.error = error?.stack || String(error); process.exitCode = 1 }
finally {
  if (facade) await facade.close()
  if (coreProxy) await new Promise(resolve => coreProxy.close(resolve))
  if (server) await new Promise(resolve => server.close(resolve))
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  await writeFile(path.join(root, 'output/原生文件Drop整合_20261017i/真实Core通用导入/latest.json'), JSON.stringify({ output, passed: report.passed }) + '\n')
}
console.log(JSON.stringify({ passed: report.passed, output, cases: report.cases, error: report.error }, null, 2))
