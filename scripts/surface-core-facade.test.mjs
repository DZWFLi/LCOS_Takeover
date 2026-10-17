import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureBytes = await readFile('E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/node-upload-fixture.png')
function pngDimensions(bytes) {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}
function pngIdat(bytes) {
  const chunks = []
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    const end = offset + 12 + length
    assert.ok(end <= bytes.length, 'PNG chunk must stay inside the file')
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length))
    offset = end
    if (type === 'IEND') break
  }
  assert.ok(chunks.length > 0, 'PNG must contain IDAT chunks')
  return Buffer.concat(chunks)
}
assert.deepEqual(pngDimensions(fixtureBytes), { width: 488, height: 325 })
assert.ok(inflateSync(pngIdat(fixtureBytes)).length > 0, 'authorized PNG fixture must contain decodable compressed pixels')
const runtimeRoot = path.join(root, '.runtime', 'surface-core-test-' + Date.now())
await mkdir(runtimeRoot, { recursive: true })
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
process.env.LCOS_RECOVERY_TRANSPORT = 'none'

const entry = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'surface-core-facade.mjs'))
const { startSurfaceCoreFacade } = await import(pathToFileURL(entry).href)
const publicOrigin = 'http://127.0.0.1:17879'
const report = {
  implementation: 'actual Local Core SQLite + sample factory + Huabu disk storage/executor',
  runtimeRoot,
  originalUserDatabaseOpened: false,
  tapNowBrowserClaimed: false,
  cases: [],
}

let facade
const request = (method, pathname, body) => facade.handle({ method, pathname, url: publicOrigin + pathname, body })

try {
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin })
  const health = await fetch(facade.core.origin + '/health')
  assert.equal(health.status, 200)
  report.cases.push('real Local Core loopback HTTP server starts on an ephemeral port')

  const status = await request('GET', '/api/surface-core/status')
  assert.equal(status.status, 200)
  assert.equal(status.body.data.core.connected, true)
  assert.equal(status.body.data.surfaces.length, 3)
  assert.equal(status.body.data.workspaces.length, 3)
  assert.deepEqual(new Set(status.body.data.workspaces.map((item) => item.preferredSurface)), new Set(['main', 'context', 'workflow']))
  assert.deepEqual(new Set(status.body.data.surfaces.map((item) => item.preferredSurface)), new Set(['main', 'context', 'workflow']))
  assert.equal(status.body.data.core.databasePath, facade.core.databasePath)
  report.cases.push('status reports three real Core Workspaces with distinct canvas identities')

  const listed = await request('GET', '/api/canvas/v1/canvases')
  assert.equal(listed.status, 200, JSON.stringify(listed.body))
  const canvases = listed.body.data.canvases
  assert.equal(canvases.length, 3)
  assert.equal(new Set(canvases.map((item) => item.id)).size, 3)
  assert.ok(canvases.every((item) => item.node_count === 2))
  report.cases.push('TapNow canvas list reads Huabu spaces resolved through Core Workspaces')

  const details = await Promise.all(canvases.map((canvas) => request('GET', '/api/canvas/v1/canvases/' + encodeURIComponent(canvas.id))))
  assert.ok(details.every((response) => response.status === 200))
  const detailBySurface = new Map(details.map((response) => [response.body.data.preferred_surface, response.body.data]))
  const main = detailBySurface.get('main')
  const context = detailBySurface.get('context')
  const workflow = detailBySurface.get('workflow')
  assert.ok(main && context && workflow)
  for (const detail of [main, context, workflow]) {
    assert.equal(detail.nodes.length, 2)
    const image = detail.nodes.find((node) => node.type === 'image')
    const text = detail.nodes.find((node) => node.type === 'text')
    assert.ok(image?.data.src.startsWith(publicOrigin + '/api/surface-core/file-records/'))
    assert.ok(text?.data.text.startsWith('# '))
    assert.deepEqual(text?.data.params, { model: 'gemini-3.1-flash-lite', provider: 'google' })
    assert.ok(text?.lcos_revision_id)
  }
  assert.notEqual(main.nodes.find((node) => node.type === 'text').data.text, context.nodes.find((node) => node.type === 'text').data.text)
  assert.notEqual(context.nodes.find((node) => node.type === 'text').data.text, workflow.nodes.find((node) => node.type === 'text').data.text)
  report.cases.push('three TapNow detail payloads expose independent image/text projections with canonical data.text')

  const image = main.nodes.find((node) => node.type === 'image')
  assert.equal(image.data.defaultOpenGallery, false)
  assert.deepEqual(image.data.__metadata, { url: image.data.src, width: 488, height: 325 })
  const imageContent = await request('GET', new URL(image.data.src).pathname)
  assert.equal(imageContent.status, 200)
  assert.equal(imageContent.contentType, 'image/png')
  assert.ok(Buffer.isBuffer(imageContent.body))
  assert.deepEqual(imageContent.body, fixtureBytes)
  assert.deepEqual(pngDimensions(imageContent.body), { width: 488, height: 325 })
  assert.ok(inflateSync(pngIdat(imageContent.body)).length > 0, 'Core FileRecord response must contain decodable PNG pixels')
  const imageBinding = facade.core.repository.getProjectionBindings(facade.core.projectId).find((item) => item.canvasId === main.id && item.spatialId === image.id)
  assert.ok(imageBinding)
  report.cases.push('composite PNG is read by Core FileRecord ID and the image node has a Core projection binding')

  const mainRoute = '/api/canvas/v1/canvases/' + main.id + '/nodes:batchActions'
  const nativeImageFlush = await request('POST', mainRoute, {
    canvas_id: main.id,
    created_by_role: 'user',
    lcos_expected_revisions: {},
    actions: [{ action: 'update', updates: [{ id: image.id, type: 'image', data: {
      id: image.id, title: image.data.title, src: image.data.src, type: 'upload', prompt: '', defaultOpenGallery: false,
      __metadata: { url: image.data.src, width: 488, height: 325 },
    }, position: { x: 120, y: 100 }, measured: { width: 250, height: 250 } }] }],
  })
  assert.equal(nativeImageFlush.status, 200, JSON.stringify(nativeImageFlush.body))
  assert.equal(nativeImageFlush.body.data.spatial_saved, true)
  const imageAfterFlush = await request('GET', '/api/canvas/v1/canvases/' + main.id)
  const flushedImage = imageAfterFlush.body.data.nodes.find((node) => node.type === 'image')
  assert.equal(flushedImage.data.src, image.data.src)
  assert.deepEqual(flushedImage.position, { x: 120, y: 100 })
  assert.ok(flushedImage.measured.width > 0 && flushedImage.measured.height > 0)
  const mismatchedType = await request('POST', mainRoute, { canvas_id: main.id, created_by_role: 'user', lcos_expected_revisions: {},
    actions: [{ action: 'update', updates: [{ id: image.id, type: 'text', position: { x: 900, y: 900 } }] }] })
  assert.equal(mismatchedType.status, 409)
  assert.equal(mismatchedType.body.error.code, 'CANVAS_NODE_TYPE_MISMATCH')
  report.cases.push('full TapNow image batch flush accepts exact Core source/type and renderer metadata')

  const mainText = main.nodes.find((node) => node.type === 'text')
  const oldText = facade.core.repository.getProjectionBindings(facade.core.projectId).find((item) => item.canvasId === main.id && item.spatialId === mainText.id)
  const oldArtifact = facade.core.repository.getArtifact(oldText.entityId)
  const oldRevisionId = oldArtifact.currentRevisionId
  assert.equal(mainText.lcos_revision_id, oldRevisionId)
  const nextTitle = 'Main · 已更新'
  const nextBody = '# Main · 已更新\n\n正文由 Local Core 管理，节点只呈现这个版本。'
  const emptyParamsNoop = await request('POST', mainRoute, {
    canvas_id: main.id,
    created_by_role: 'user',
    lcos_expected_revisions: { [mainText.id]: mainText.lcos_revision_id },
    actions: [{ action: 'update', updates: [{ id: mainText.id, type: 'text', data: { id: mainText.id, text: mainText.data.text,
      content: mainText.data.text, params: {} } }] }],
  })
  assert.equal(emptyParamsNoop.status, 200, JSON.stringify(emptyParamsNoop.body))
  assert.equal(emptyParamsNoop.body.data.core_saved, false)
  const alteredParamsUpdate = await request('POST', mainRoute, {
    canvas_id: main.id,
    created_by_role: 'user',
    lcos_expected_revisions: { [mainText.id]: mainText.lcos_revision_id },
    actions: [{ action: 'update', updates: [{ id: mainText.id, type: 'text', data: { id: mainText.id, title: nextTitle,
      text: nextBody, content: mainText.data.text, prompt: '', params: { model: 'gemini-3.1-flash-lite', provider: 'other' } } }] }],
  })
  assert.equal(alteredParamsUpdate.status, 501)
  assert.equal(alteredParamsUpdate.body.error.code, 'NODE_PARAMS_NOT_IMPLEMENTED')
  const afterAlteredParams = await request('GET', '/api/canvas/v1/canvases/' + main.id)
  assert.equal(afterAlteredParams.body.data.nodes.find((node) => node.type === 'text').data.text, mainText.data.text)
  report.cases.push('TextNode empty params are a no-op; altered model/provider pair returns 501 without changing Core text')
  const update = await request('POST', mainRoute, {
    canvas_id: main.id,
    lcos_expected_revisions: { [mainText.id]: mainText.lcos_revision_id },
    actions: [{ action: 'update', updates: [
      { id: mainText.id, type: 'text', position: { x: 620, y: 150 }, measured: { width: 420, height: 300 },
        data: { id: mainText.id, title: nextTitle, text: nextBody, content: mainText.data.text, prompt: '',
          params: { model: 'gemini-3.1-flash-lite', provider: 'google' } } },
    ] }],
  })
  assert.equal(update.status, 200, JSON.stringify(update.body))
  report.cases.push('full TextNode body edit accepts the exact install-default params pair as unchanged serializer metadata')
  const updated = await request('GET', '/api/canvas/v1/canvases/' + main.id)
  const updatedText = updated.body.data.nodes.find((node) => node.type === 'text')
  assert.equal(updatedText.data.text, nextBody)
  assert.equal(updatedText.data.title, nextTitle)
  assert.equal(updatedText.lcos_revision_id, update.body.data.lcos_expected_revisions[mainText.id])
  assert.notEqual(updatedText.lcos_revision_id, mainText.lcos_revision_id)
  assert.deepEqual(updatedText.position, { x: 620, y: 150 })
  assert.deepEqual(updatedText.measured, { width: 420, height: 300 })
  const nextArtifact = facade.core.repository.getArtifact(oldText.entityId)
  assert.notEqual(nextArtifact.currentRevisionId, oldRevisionId)
  const contextBinding = facade.core.repository.getProjectionBindings(facade.core.projectId).find((item) => item.canvasId === context.id && item.spatialId === context.nodes.find((node) => node.type === 'text').id)
  assert.ok(contextBinding)
  assert.notEqual(contextBinding.entityId, oldText.entityId)
  const contextAfter = await request('GET', '/api/canvas/v1/canvases/' + context.id)
  assert.equal(contextAfter.body.data.nodes.find((node) => node.type === 'text').data.text, context.nodes.find((node) => node.type === 'text').data.text)

  const mergedBody = '# Main · 合并结果\n\n重复节点 patch 合并后只写入一次 Core revision。'
  const duplicateUpdate = await request('POST', mainRoute, {
    canvas_id: main.id,
    lcos_expected_revisions: { [mainText.id]: updatedText.lcos_revision_id },
    actions: [{ action: 'update', updates: [
      { id: mainText.id, position: { x: 630, y: 160 }, measured: { width: 430, height: 310 }, data: { text: '# 中间稿', content: mainText.data.text } },
      { id: mainText.id, position: { x: 650, y: 170 }, data: { text: mergedBody, content: mainText.data.text } },
    ] }],
  })
  assert.equal(duplicateUpdate.status, 200, JSON.stringify(duplicateUpdate.body))
  let currentMain = await request('GET', '/api/canvas/v1/canvases/' + main.id)
  let currentText = currentMain.body.data.nodes.find((node) => node.type === 'text')
  assert.equal(currentText.data.text, mergedBody)
  assert.deepEqual(currentText.position, { x: 650, y: 170 })
  assert.deepEqual(currentText.measured, { width: 430, height: 310 })
  assert.notEqual(currentText.lcos_revision_id, updatedText.lcos_revision_id)
  report.cases.push('data.text wins over stale data.content and repeated updates to one node coalesce before Core CAS')

  const titleOnly = 'Main · 标题单独更新'
  const titleUpdate = await request('POST', mainRoute, {
    canvas_id: main.id,
    lcos_expected_revisions: { [mainText.id]: currentText.lcos_revision_id },
    actions: [{ action: 'update', updates: [{ id: mainText.id, data: { id: mainText.id, title: titleOnly } }] }],
  })
  assert.equal(titleUpdate.status, 200, JSON.stringify(titleUpdate.body))
  currentMain = await request('GET', '/api/canvas/v1/canvases/' + main.id)
  currentText = currentMain.body.data.nodes.find((node) => node.type === 'text')
  assert.equal(currentText.data.text, mergedBody)
  assert.equal(currentText.data.title, titleOnly)
  assert.equal(currentText.lcos_revision_id, titleUpdate.body.data.lcos_expected_revisions[mainText.id])
  assert.equal(currentText.lcos_revision_id, duplicateUpdate.body.data.lcos_expected_revisions[mainText.id])
  const missingExpected = await request('POST', mainRoute, {
    canvas_id: main.id,
    actions: [{ action: 'update', updates: [{ id: mainText.id, data: { text: '# 未携带 revision' } }] }],
  })
  assert.equal(missingExpected.status, 409)
  assert.equal(missingExpected.body.error.code, 'EXPECTED_REVISION_REQUIRED')
  const afterMissingExpected = await request('GET', '/api/canvas/v1/canvases/' + main.id)
  assert.equal(afterMissingExpected.body.data.nodes.find((node) => node.type === 'text').data.text, mergedBody)
  report.cases.push('text writes without a Core revision token are rejected without changing canonical text')

  const imageTitleOnly = await request('POST', mainRoute, {
    canvas_id: main.id,
    actions: [{ action: 'update', updates: [{ id: image.id, data: { id: image.id, title: 'Unsupported image title' } }] }],
  })
  assert.equal(imageTitleOnly.status, 501)
  report.cases.push('title-only text updates persist in Core; unsupported image title edits return 501')

  const expectedBeforeRace = currentText.lcos_revision_id
  const raceBodyA = '# Main · 并发写入 A\n\n先入队的写入应提交。'
  const raceBodyB = '# Main · 并发写入 B\n\n同一旧 revision 的后续写入必须冲突。'
  const [raceA, raceB] = await Promise.all([
    request('POST', mainRoute, { canvas_id: main.id, lcos_expected_revisions: { [mainText.id]: expectedBeforeRace },
      actions: [{ action: 'update', updates: [{ id: mainText.id, data: { text: raceBodyA, content: mergedBody } }] }] }),
    request('POST', mainRoute, { canvas_id: main.id, lcos_expected_revisions: { [mainText.id]: expectedBeforeRace },
      actions: [{ action: 'update', updates: [{ id: mainText.id, data: { text: raceBodyB, content: mergedBody } }] }] }),
  ])
  assert.equal(raceA.status, 200, JSON.stringify(raceA.body))
  assert.equal(raceB.status, 409)
  assert.equal(raceB.body.error.code, 'STALE_REVISION')
  const afterRace = await request('GET', '/api/canvas/v1/canvases/' + main.id)
  const afterRaceText = afterRace.body.data.nodes.find((node) => node.type === 'text')
  assert.equal(afterRaceText.data.text, raceBodyA)
  assert.equal(afterRaceText.lcos_revision_id, raceA.body.data.lcos_expected_revisions[mainText.id])
  report.cases.push('same-facade batch writes serialize; stale second writer receives 409 without overwriting Core text')

  const wrongCanvas = await request('POST', '/api/canvas/v1/canvases/' + context.id + '/nodes:batchActions', {
    canvas_id: main.id, actions: [{ action: 'update', updates: [{ id: context.nodes.find((node) => node.type === 'text').id, position: { x: 10, y: 20 } }] }],
  })
  assert.equal(wrongCanvas.status, 400)
  const create = await request('POST', '/api/canvas/v1/canvases/' + main.id + '/nodes:batchActions', {
    canvas_id: main.id, actions: [{ action: 'create', creates: [{ id: 'fake-new-node', type: 'text', position: { x: 0, y: 0 }, data: { text: 'unsupported' } }] }],
  })
  assert.equal(create.status, 501)
  assert.equal((await request('POST', '/api/canvas/v1/canvases', { name: 'Not a Workspace' })).status, 501)
  assert.equal((await request('DELETE', '/api/canvas/v1/canvases/' + main.id)).status, 501)
  report.cases.push('cross-canvas identity mismatch rejected; create, delete, and new canvas return 501')

  await facade.close()
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin })
  const reopened = await request('GET', '/api/canvas/v1/canvases/' + main.id)
  const reopenedText = reopened.body.data.nodes.find((node) => node.type === 'text')
  assert.equal(reopenedText.data.text, raceBodyA)
  assert.equal(reopenedText.data.title, titleOnly)
  assert.equal(reopenedText.lcos_revision_id, afterRaceText.lcos_revision_id)
  assert.deepEqual(reopenedText.position, { x: 650, y: 170 })
  assert.deepEqual(reopenedText.measured, { width: 430, height: 310 })
  report.cases.push('closing and reopening both real stores recovers canonical revision and Huabu geometry')
  report.passed = true
} catch (error) {
  report.passed = false
  report.error = error?.stack || String(error)
  process.exitCode = 1
} finally {
  await facade?.close()
  await writeFile(path.join(root, 'evidence', 'surface-core-facade.json'), JSON.stringify(report, null, 2) + '\n')
}

console.log(JSON.stringify(report, null, 2))
