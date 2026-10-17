import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Execute an already archived pre-fix production bundle against a new Core.
// This preserves the real old failure; it does not alter current source or the
// running candidate and does not synthesize a mock import/placement receipt.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const oldReport = path.join(root, 'output/原生文件Drop整合_20261017i/真实上传投放集成/2026-10-17T13-15-23-819Z/report.json')
const old = JSON.parse(await readFile(oldReport, 'utf8'))
const bundle = path.join(old.runtimeRoot, 'facade.mjs')
assert.ok(path.resolve(bundle).startsWith(path.join(root, '.runtime') + path.sep))
const output = path.join(root, 'output/原生文件Drop整合_20261017i/同字节新文件名旧owner复现', stamp)
const runtimeRoot = path.join(root, '.runtime', 'same-bytes-old-owner-' + stamp)
await mkdir(output, { recursive: true }); await mkdir(runtimeRoot, { recursive: true })
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'
const { startSurfaceCoreFacade } = await import(pathToFileURL(bundle).href)
const report = { passed: false, meaning: 'PASS means the historical bug reproduced; current fix is tested by native-file-upload-placement.test.mjs',
  oldBundle: bundle, oldReport, runtimeRoot, candidateAccessed: false, originalDataTouched: false, modelOrRunSubmitted: false }
let server, facade, origin
try {
  server = createServer(async (request, response) => {
    if (facade?.upload && await facade.upload(request, response, new URL(request.url, origin))) return
    response.writeHead(404); response.end()
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  origin = `http://127.0.0.1:${server.address().port}`
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true,
    nativeRailPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeCollectionPilot: true })
  const bytes = Buffer.from('Synthetic same exact bytes; different original upload names.\n')
  const upload = async name => {
    const created = await fetch(origin + '/api/files/upload-urls', { method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ file_name: name, mime_type: 'text/plain', file_size: bytes.length }) })
    assert.equal(created.status, 200); const initial = (await created.json()).data
    assert.equal((await fetch(initial.upload_url, { method: 'PUT', headers: { origin }, body: bytes })).status, 200)
    const result = await fetch(origin + `/api/files/upload-urls/${initial.file_id}/complete`, { method: 'PUT', headers: { origin } })
    assert.equal(result.status, 200); return (await result.json()).data
  }
  const place = (receipt, id) => facade.handle({ method: 'POST', url: '/api/canvas/v1/canvases/surface-core-context/nodes:batchActions', body: {
    canvas_id: 'surface-core-context', lcos_operation: { version: 1, kind: 'create', phase: 'apply', operationId: id },
    actions: [{ action: 'create', creates: [{ id, type: 'text', position: { x: 1500, y: 500 }, measured: { width: 250, height: 250 },
      data: { title: receipt.file_name, lcos_upload_url: receipt.url, lcos_file_ref: { artifactId: receipt.lcos_ref.artifactId,
        artifactViewId: receipt.lcos_ref.artifactViewId, revisionId: receipt.lcos_ref.revisionId, fileRecordId: receipt.fileRecordId,
        mimeType: receipt.mime_type, kind: receipt.artifact_kind, size: receipt.file_size } } }] }] } })
  const first = await upload('original-name.txt'), placed = await place(first, 'old-owner-first')
  assert.equal(placed.status, 200, JSON.stringify(placed.body))
  const before = { artifacts: facade.core.repository.getArtifacts(facade.core.projectId),
    files: facade.core.repository.getFileRecords(facade.core.projectId), scene: await facade.spatial.read('surface-core-context') }
  const second = await upload('different-name.txt')
  assert.equal(second.lcos_ref.artifactId, first.lcos_ref.artifactId); assert.equal(second.fileRecordId, first.fileRecordId)
  const rejected = await place(second, 'old-owner-renamed')
  assert.equal(rejected.status, 409); assert.equal(rejected.body.error.code, 'CORE_TITLE_MISMATCH')
  assert.deepEqual(facade.core.repository.getArtifacts(facade.core.projectId), before.artifacts)
  assert.deepEqual(facade.core.repository.getFileRecords(facade.core.projectId), before.files)
  assert.deepEqual(await facade.spatial.read('surface-core-context'), before.scene)
  report.first = first; report.second = second; report.rejected = rejected
  assert.equal(facade.core.repository.getProjectExecutionProjection(facade.core.projectId).runs.length, 0)
  report.passed = true
} catch (error) { report.error = error?.stack || String(error); process.exitCode = 1 }
finally {
  await facade?.close(); if (server) await new Promise(resolve => server.close(resolve))
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify({ passed: report.passed, meaning: report.meaning, output, error: report.error }, null, 2))
