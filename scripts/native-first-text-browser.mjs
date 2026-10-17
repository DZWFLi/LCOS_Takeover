import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
const args = process.argv.slice(2)
const valueArg = name => args.find(value => value.startsWith(name + '='))?.slice(name.length + 1)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const canvasId = 'surface-core-context'
const nodeId = 'surface-context-text'
const screenshotPrefix = path.join(visualRoot, 'native-first-text-' + stamp)
const reportPath = screenshotPrefix + '.json'
const report = {
  at: new Date().toISOString(), runState: 'not-started', passed: false,
  target: { origin: null, canvasId, nodeId },
  scope: 'Synthetic Context text node; an exact recorded original image minimum-size cold bootstrap may precede the text snapshot. No direct Core writes, retries, cleanup, or provider tasks.',
  browser: { engine: 'installed Chrome via Playwright Core', freshContext: true,
    viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'blocked' },
  runtime: null, reads: [], screenshots: [], cases: [],
  network: { externalHttpBlocked: [], blockedWrites: [], allowedTargetBatches: [], unchangedImageMeasurementEchoes: [], apiFailures: [], webSocketsClosed: 0,
    providerTaskRequests: [], requestFailures: [] },
  pageErrors: [], consoleErrors: [], failure: null,
  notes: [
    'Writes require an explicit non-historical loopback --base-url, nativeTextPilot health, and a healthy isolated Core runtime.',
    'Every mutating browser request is blocked unless it is one staged exact-target native Canvas batch with the expected body and Core CAS revision.',
    'If a save receipt is missing, only readback is attempted; the native write is never replayed.',
    'The original text editor autosaves; unchanged original back-button close is no-write, never draft cancellation.',
    'Telemetry, Agent suggestions and startup execution reconciliation stay blocked and recorded; they are outside this text-only test.',
  ],
}

let browser, context, page, base, coreOrigin, serverStatus, activeStep = null
let initialCanvas, initialBundle, currentBundle, initialNode, latestCanvas
let expectedBody = null
let coldImageBootstrap = null
let coldNormalizedImage = null
const knownRevisions = new Set()
const requestRecords = new WeakMap()
const knownBackgroundWrites = new Set([
  '/api/events',
  '/api/lcos/canvases/surface-core-context/execution:reconcile',
  '/api/agent-gateway/v1/conversations/suggestions/dynamic',
])
const presentationKeys = new Set(['lcosTextViewMode', 'lcosTextCollapsedIds', 'lcosTextBeforeMindMapSize'])

function loopbackUrl(raw) {
  assert.ok(raw, 'Pass --base-url=http://127.0.0.1:<isolated-port>; there is no default URL.')
  const url = new URL(raw)
  assert.equal(url.protocol, 'http:', 'Only an explicit loopback HTTP origin is allowed.')
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Base URL must be loopback.')
  assert.ok(url.port, 'Base URL must include its explicit port.')
  assert.ok(!['17879', '17880', '17881'].includes(url.port), 'Historical/live ports are not eligible for writes.')
  assert.equal(url.pathname, '/'); assert.equal(url.search, ''); assert.equal(url.hash, '')
  assert.equal(url.username, ''); assert.equal(url.password, '')
  return url
}

function clean(value) {
  return String(value).replace(/((?:token|secret|credential|authorization|api.?key)\s*[:=]\s*)[^\s,;]+/ig, '$1[redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/g, raw => { try { const u = new URL(raw); return u.origin + u.pathname } catch { return raw } })
    .slice(0, 1200)
}
const bodyOf = node => typeof node?.data?.text === 'string' ? node.data.text
  : typeof node?.data?.content === 'string' ? node.data.content : null
const refOf = node => node?.data?.lcos_ref ?? node?.lcos_ref ?? null
const geometryOf = node => ({ position: node?.position ?? null, width: node?.measured?.width ?? node?.width ?? null,
  height: node?.measured?.height ?? node?.height ?? null, parentId: node?.parentId ?? null })
const stable = value => JSON.stringify(value)
const corePath = suffix => '/api/lcos/core' + suffix

async function jsonRead(url, label) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) })
  let payload = null
  try { payload = await response.json() } catch {}
  report.reads.push({ label, method: 'GET', url: new URL(url).origin + new URL(url).pathname, status: response.status })
  return { response, payload }
}

async function appJson(pathname, label) { return jsonRead(new URL(pathname, base), label) }

async function readCanvas() {
  const result = await appJson('/api/canvas/v1/canvases/' + encodeURIComponent(canvasId), 'original Context Canvas')
  assert.equal(result.response.status, 200); assert.equal(result.payload?.code, 0)
  assert.equal(result.payload?.data?.id, canvasId); assert.ok(Array.isArray(result.payload?.data?.nodes))
  return result.payload.data
}

async function readCoreBody() {
  const query = new URLSearchParams({ canvasId, spatialId: nodeId })
  const result = await appJson(corePath('/projects/' + encodeURIComponent(serverStatus.projectId)
    + '/curation/canvas-text?' + query), 'Core canonical CanvasText')
  assert.equal(result.response.status, 200); assert.equal(result.payload?.ok, true)
  const value = result.payload.value
  assert.equal(value.projectId, serverStatus.projectId); assert.equal(value.canvasId, canvasId); assert.equal(value.spatialId, nodeId)
  assert.ok(typeof value.body === 'string')
  return value
}

async function readBundle() {
  const value = await readCoreBody()
  const historyResult = await jsonRead(new URL('/artifacts/' + encodeURIComponent(value.artifactId) + '/revisions', coreOrigin), 'Core Artifact revisions')
  assert.equal(historyResult.response.status, 200); assert.equal(historyResult.payload?.ok, true)
  assert.ok(Array.isArray(historyResult.payload.value))
  const fileResult = await fetch(new URL('/projects/' + encodeURIComponent(serverStatus.projectId)
    + '/file-records/' + encodeURIComponent(String(value.fileRecordId)) + '/content', coreOrigin),
  { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) })
  const bytes = Buffer.from(await fileResult.arrayBuffer())
  report.reads.push({ label: 'Core FileRecord bytes', method: 'GET', status: fileResult.status, fileRecordId: String(value.fileRecordId) })
  assert.equal(fileResult.status, 200); assert.equal(bytes.toString('utf8'), value.body)
  assert.ok(historyResult.payload.value.some(item => String(item.id) === String(value.revisionId)))
  for (const item of historyResult.payload.value) knownRevisions.add(String(item.id))
  return { value, revisions: historyResult.payload.value, bytes }
}

async function readOtherFiles(canvas) {
  const rows = []
  for (const node of canvas.nodes) {
    if (String(node.id) === nodeId) continue
    const ref = refOf(node)
    if (node.type === 'image' && typeof node.data?.src === 'string') {
      const source = new URL(node.data.src, base)
      assert.equal(source.origin, base.origin)
      const match = source.pathname.match(/^\/api\/surface-core\/file-records\/([^/]+)\/content$/)
      assert.ok(match, 'Non-target image must use its local canonical FileRecord route.')
      const file = await fetch(source, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) })
      const bytes = Buffer.from(await file.arrayBuffer())
      assert.equal(file.status, 200)
      rows.push({ nodeId: String(node.id), type: 'image', fileRecordId: decodeURIComponent(match[1]), bytes: bytes.toString('base64') })
      continue
    }
    if (!['text', 'note'].includes(node.type) || ref?.entityType !== 'artifact' || !ref.artifactId) continue
    const query = new URLSearchParams({ canvasId, spatialId: String(node.id) })
    const result = await jsonRead(new URL(corePath('/projects/' + encodeURIComponent(serverStatus.projectId)
      + '/curation/canvas-text?' + query), coreOrigin), 'non-target Core text ' + node.id)
    assert.equal(result.response.status, 200); assert.equal(result.payload?.ok, true)
    const value = result.payload.value
    assert.equal(String(value.artifactId), String(ref.artifactId)); assert.equal(String(value.viewId), String(ref.artifactViewId))
    assert.equal(String(value.revisionId), String(ref.revisionId))
    const file = await fetch(new URL('/projects/' + encodeURIComponent(serverStatus.projectId)
      + '/file-records/' + encodeURIComponent(String(value.fileRecordId)) + '/content', coreOrigin),
    { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) })
    const bytes = Buffer.from(await file.arrayBuffer())
    assert.equal(file.status, 200); assert.equal(bytes.toString('utf8'), value.body)
    rows.push({ nodeId: String(node.id), type: node.type, artifactId: String(value.artifactId), viewId: String(value.viewId),
      revisionId: String(value.revisionId), fileRecordId: String(value.fileRecordId), body: value.body, bytes: bytes.toString('base64') })
  }
  return rows.sort((a, b) => a.nodeId.localeCompare(b.nodeId))
}

function spatialNodeSnapshot(node) {
  return { id: String(node.id), type: node.type ?? null, ...geometryOf(node), data: node.data ?? null }
}

function assertNonTargets(before, after, label) {
  const left = before.nodes.filter(node => String(node.id) !== nodeId).map(spatialNodeSnapshot).sort((a, b) => a.id.localeCompare(b.id))
  const right = after.nodes.filter(node => String(node.id) !== nodeId).map(spatialNodeSnapshot).sort((a, b) => a.id.localeCompare(b.id))
  assert.deepEqual(right, left, label + ': non-target Canvas nodes changed.')
}

function validRef(ref) {
  return Boolean(ref && ref.version === 1 && ref.entityType === 'artifact'
    && String(ref.artifactId) === String(initialBundle.value.artifactId)
    && String(ref.entityId) === String(initialBundle.value.artifactId)
    && String(ref.artifactViewId) === String(initialBundle.value.viewId)
    && knownRevisions.has(String(ref.revisionId)))
}

function validateBatch(request) {
  let wire
  try { wire = request.postDataJSON() } catch { return { ok: false, reason: 'Batch body is not JSON.' } }
  if (!wire || typeof wire !== 'object' || Array.isArray(wire)) return { ok: false, reason: 'Invalid batch object.' }
  if (Object.keys(wire).some(key => !['canvas_id', 'actions', 'created_by_role', 'lcos_expected_revisions', 'lcos_refs'].includes(key))) {
    return { ok: false, reason: 'Unsupported batch field.' }
  }
  // A fresh synthetic seed is 360×240, below the donor's 250px image
  // minimum. Admit only its measured 375×250 correction BEFORE text tests;
  // keep its exact data/ref/position and retain the real request/receipt.
  if (coldImageBootstrap && !activeStep) {
    const expected = coldImageBootstrap
    const updates = wire.actions?.[0]?.updates
    const update = updates?.[0]
    if (wire.canvas_id === canvasId && wire.created_by_role === 'user'
      && wire.actions?.length === 1 && wire.actions[0].action === 'update' && updates?.length === 1
      && stable(Object.keys(update ?? {}).sort()) === stable(['id', 'type', 'data', 'position', 'measured'].sort())
      && update.id === expected.id && update.type === 'image'
      && stable(update.data) === stable(expected.data) && stable(update.position) === stable(expected.position)
      && update.measured?.width === 375 && update.measured?.height === 250
      && stable(wire.lcos_expected_revisions) === stable({ [nodeId]: String(currentBundle.value.revisionId) })
      && wire.lcos_refs === undefined) {
      return { ok: true, record: { stage: 'cold-image-minimum', kind: 'bootstrap', nodeId: expected.id,
        before: expected.measured, after: update.measured, status: null, code: null, coreSaved: null, spatialSaved: null } }
    }
  }
  const echoUpdates = wire.actions?.[0]?.updates
  const echo = echoUpdates?.[0]
  const unchangedImage = coldNormalizedImage ?? initialCanvas.nodes.find(n => n.id === 'surface-context-image' && n.type === 'image')
  if (unchangedImage && wire.canvas_id === canvasId && wire.created_by_role === 'user'
    && wire.actions?.length === 1 && wire.actions[0].action === 'update' && echoUpdates?.length === 1
    && echo?.id === unchangedImage.id
    && Object.keys(echo).every(key => ['id', 'type', 'data', 'position', 'measured'].includes(key))
    && echo.measured?.width === unchangedImage.measured?.width && echo.measured?.height === unchangedImage.measured?.height
    && (echo.type === undefined || echo.type === unchangedImage.type)
    && (echo.data === undefined || stable(echo.data) === stable(unchangedImage.data))
    && (echo.position === undefined || stable(echo.position) === stable(unchangedImage.position))
    && stable(wire.lcos_expected_revisions) === stable({ [nodeId]: String(currentBundle.value.revisionId) })
    && wire.lcos_refs === undefined) {
    return { ok: true, record: { kind: 'unchanged-image-measurement', stage: activeStep?.label ?? null,
      nodeId: unchangedImage.id, measured: echo.measured, status: null, code: null, coreSaved: null, spatialSaved: null } }
  }
  if (!activeStep || activeStep.requestConsumed || wire.canvas_id !== canvasId || wire.created_by_role !== 'user') {
    return { ok: false, reason: 'No unused staged target UI action.' }
  }
  const expectedRevision = String(currentBundle.value.revisionId)
  if (wire.lcos_expected_revisions?.[nodeId] !== expectedRevision) return { ok: false, reason: 'Target CAS revision is not the latest Core readback.' }
  for (const [id, revision] of Object.entries(wire.lcos_expected_revisions ?? {})) {
    if (id === nodeId) continue
    const existing = initialCanvas.nodes.find(node => String(node.id) === id)
    const originalRevision = existing?.lcos_revision_id ?? refOf(existing)?.revisionId
    if (!existing || String(revision) !== String(originalRevision ?? '')) return { ok: false, reason: 'Non-target CAS echo changed.' }
  }
  if (!Array.isArray(wire.actions) || wire.actions.length !== 1 || wire.actions[0]?.action !== 'update'
    || !Array.isArray(wire.actions[0]?.updates) || wire.actions[0].updates.length !== 1) return { ok: false, reason: 'Only one native update is admitted.' }
  const update = wire.actions[0].updates[0]
  if (!update || String(update.id) !== nodeId) {
    report.lastRejectedTarget = { id: update?.id ?? null, keys: Object.keys(update ?? {}), expectedId: nodeId,
      update, original: initialCanvas.nodes.find(n => String(n.id) === String(update?.id)) }
    return { ok: false, reason: 'Batch is not the exact target node.' }
  }
  const current = latestCanvas?.nodes.find(node => String(node.id) === nodeId) ?? initialNode
  const allowedUpdateKeys = new Set(['id', 'type', 'position', 'width', 'height', 'measured', 'parentId', 'parent_id', 'lcos_ref', 'data'])
  if (Object.keys(update).some(key => !allowedUpdateKeys.has(key))) {
    report.lastRejectedUpdateFields = Object.keys(update).filter(key => !allowedUpdateKeys.has(key));
    return { ok: false, reason: 'Unsupported target update field.' };
  }
  if (update.type !== undefined && update.type !== current.type) return { ok: false, reason: 'Target node type changed.' }
  if (update.lcos_ref !== undefined && !validRef(update.lcos_ref)) return { ok: false, reason: 'Top-level Core reference is not the exact known material/version.' }
  if (update.parent_id !== undefined && (update.parent_id !== '' || current.parentId || current.parent_id)) {
    return { ok: false, reason: 'Only the unchanged empty root-parent native history echo is allowed.' };
  }
  for (const key of ['position', 'width', 'height', 'parentId']) {
    const rootParentEcho = key === 'parentId' && current[key] == null && update[key] === ''
    const presentationGeometry = ['presentation', 'geometry'].includes(activeStep.kind) && ['position', 'width', 'height'].includes(key)
    const validPresentationGeometry = presentationGeometry && (key === 'position'
      ? Number.isFinite(update[key]?.x) && Number.isFinite(update[key]?.y)
      : Number.isFinite(update[key]) && update[key] > 0)
    if (update[key] !== undefined && !rootParentEcho && !validPresentationGeometry
      && stable(update[key]) !== stable(current[key] ?? null)) return { ok: false, reason: 'Target geometry/parent changed.' }
  }
  if (update.data && (typeof update.data !== 'object' || Array.isArray(update.data))) return { ok: false, reason: 'Target data patch is invalid.' }
  const data = update.data ?? {}
  const allowedData = new Set([...Object.keys(current.data ?? {}), 'id', 'text', 'content', 'lcos_ref',
    'lcosTextViewMode', 'lcosTextCollapsedIds', 'lcosTextBeforeMindMapSize'])
  if (Object.keys(data).some(key => !allowedData.has(key))) return { ok: false, reason: 'Unsupported target data key.' }
  for (const [key, value] of Object.entries(data)) {
    if (key === 'text' || key === 'content') {
      // TapNow's producer writes `text`; the existing Huabu DTO may echo its
      // unchanged old `content` mirror in the same full-data update. Never
      // accept an independent alias edit or a differing canonical text.
      if (key === 'content' && data.text === expectedBody
        && (value === current.data?.content || value === initialNode.data?.content)) continue;
      if (value !== expectedBody) {
        report.lastRejectedText = { field: key, actual: value, expected: expectedBody };
        return { ok: false, reason: 'Target ' + key + ' differs from the staged exact body.' }
      }
    } else if (key === 'lcos_ref') {
      if (!validRef(value)) return { ok: false, reason: 'Target Artifact/View/revision ref is not known.' }
    } else if (activeStep.kind === 'presentation' && presentationKeys.has(key)) {
      if (key === 'lcosTextViewMode' && !['text', 'mindmap'].includes(value)) return { ok: false, reason: 'Unsupported text face.' }
    } else if (stable(value) !== stable(current.data?.[key])) {
      return { ok: false, reason: 'Non-body target data changed outside a staged presentation action.' }
    }
  }
  if (activeStep.kind === 'body' && !Object.keys(data).some(key => ['text', 'content'].includes(key))) {
    return { ok: false, reason: 'Staged branch/history update did not include body text.' }
  }
  if (activeStep.kind === 'presentation' && !Object.keys(data).some(key => presentationKeys.has(key))) {
    return { ok: false, reason: 'Presentation batch has no text-face preference change.' }
  }
  if (activeStep.kind === 'geometry' && !['width', 'height', 'position', 'measured'].some(key => update[key] !== undefined)) {
    return { ok: false, reason: 'Resize/history batch has no geometry.' }
  }
  if (activeStep.kind === 'geometry' && update.measured !== undefined
    && (!Number.isFinite(update.measured?.width) || update.measured.width <= 0
      || !Number.isFinite(update.measured?.height) || update.measured.height <= 0)) {
    return { ok: false, reason: 'Resize measured size must be finite and positive.' }
  }
  if (wire.lcos_refs !== undefined && (!wire.lcos_refs || Array.isArray(wire.lcos_refs)
    || Object.keys(wire.lcos_refs).some(id => id !== nodeId)
    || wire.lcos_refs[nodeId] && !validRef(wire.lcos_refs[nodeId]))) return { ok: false, reason: 'Unexpected Core ref map.' }
  return { ok: true, record: { stage: activeStep.label, kind: activeStep.kind, bodyLength: expectedBody?.length ?? null,
    expectedRevision, changedDataKeys: Object.keys(data).sort(), status: null, code: null, coreSaved: null, spatialSaved: null } }
}

async function screenshot(label) {
  const file = screenshotPrefix + '-' + label + '.png'
  await page.screenshot({ path: file, fullPage: false })
  report.screenshots.push(file)
}

function ordinaryBranches(body) {
  return body.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^#{1,6}\s/.test(line)
    && !/^(?:[-*+]\s|\d+[.)]\s|>|```)/.test(line))
}

function replaceSourceLine(body, before, after) {
  const lines = body.split(/(?<=\n)/)
  const matches = lines.filter(raw => (raw.endsWith('\n') ? raw.slice(0, -1) : raw).replace(/\r$/, '') === before)
  assert.equal(matches.length, 1, 'The chosen ordinary outline branch must map to one exact source line.')
  let changed = false
  return lines.map(raw => {
    if (changed || (raw.endsWith('\n') ? raw.slice(0, -1) : raw).replace(/\r$/, '') !== before) return raw
    changed = true
    const ending = raw.endsWith('\r\n') ? '\r\n' : raw.endsWith('\n') ? '\n' : ''
    return after + ending
  }).join('')
}

async function waitBatchResponse(index, label) {
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    const rejected = report.network.blockedWrites.find(item => item.stage === activeStep?.label && item.path.endsWith('/nodes:batchActions'));
    if (rejected) throw new Error(label + ': exact target request was blocked: ' + rejected.reason);
    const record = report.network.allowedTargetBatches[index]
    if (record?.status !== null && record?.status !== undefined) {
      assert.equal(record.status, 200, label + ': HTTP status')
      assert.equal(record.code, 0, label + ': TapNow response envelope')
      assert.equal(record.spatialSaved, true, label + ': spatial receipt')
      if (record.kind === 'body') assert.equal(record.coreSaved, true, label + ': Core receipt')
      return record
    }
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  throw new Error(label + ': native batch response receipt was not observed; no write retry will be sent.')
}

async function waitForCoreBody(body, before, label) {
  const deadline = Date.now() + 25000
  let value, canvas, node, bundle
  do {
    value = await readCoreBody()
    if (value.body === body && String(value.revisionId) !== String(before.value.revisionId)) {
      bundle = await readBundle(); canvas = await readCanvas(); node = canvas.nodes.find(item => String(item.id) === nodeId)
      if (bodyOf(node) === body && String(refOf(node)?.revisionId) === String(bundle.value.revisionId)) {
        latestCanvas = canvas; break
      }
    }
    await new Promise(resolve => setTimeout(resolve, 150))
  } while (Date.now() < deadline)
  if (!bundle || value?.body !== body || String(value.revisionId) === String(before.value.revisionId)
    || bodyOf(node) !== body || String(refOf(node)?.revisionId) !== String(bundle.value.revisionId)) {
    throw new Error(label + ': Core/FileRecord/Canvas ref readback is not synchronized; the browser write will not be replayed.')
  }
  assert.equal(bundle.value.body, body)
  assert.equal(bundle.revisions.length, before.revisions.length + 1, label + ': exactly one retained Core revision expected.')
  assert.equal(bundle.bytes.toString('utf8'), body)
  currentBundle = bundle
  return bundle
}

async function nativeHistory() {
  const value = await page.evaluate(({ canvasId, nodeId }) => window.__LCOS_NODE_LAB__?.api
    ?.inspectNativeHistory?.({ canvasId, nodeId }) ?? null, { canvasId, nodeId })
  assert.ok(value?.ok && Number.isInteger(value.historySize) && Number.isInteger(value.currentIndex),
    'Original O8 history inspection must be available for this native text run.')
  return value
}

async function waitHistory(size, index, label) {
  const deadline = Date.now() + 15000
  let value
  do {
    value = await nativeHistory()
    if (value.historySize === size && value.currentIndex === index) return value
    await new Promise(resolve => setTimeout(resolve, 100))
  } while (Date.now() < deadline)
  throw new Error(label + ': original O8 history cursor did not reach the expected snapshot.')
}

async function stageBodyAction(label, body, action) {
  const batchIndex = report.network.allowedTargetBatches.length
  activeStep = { kind: 'body', label, requestConsumed: false }; expectedBody = body
  try {
    await action()
    await waitBatchResponse(batchIndex, label)
  } catch (error) {
    report.lastReadbackAfterUnconfirmedAction = await readBundle().then(bundle => ({
      bodyMatchesExpected: bundle.value.body === body, revisionId: bundle.value.revisionId,
      revisionCount: bundle.revisions.length, fileBytesExact: bundle.bytes.toString('utf8') === bundle.value.body,
    })).catch(readError => ({ failed: clean(readError?.message || readError) }))
    throw error
  } finally { activeStep = null; expectedBody = null }
}

async function stagePresentation(label, mode, action) {
  const batchIndex = report.network.allowedTargetBatches.length
  activeStep = { kind: 'presentation', label, requestConsumed: false }; expectedBody = currentBundle.value.body
  try {
    await action()
    await waitBatchResponse(batchIndex, label)
    await page.locator(`[data-native-first-text-body="${nodeId}"]`).waitFor({ state: 'visible' })
    await page.waitForFunction(({ id, mode }) => document.querySelector(`[data-native-first-text-body="${id}"]`)
      ?.getAttribute('data-native-first-mode') === mode, { id: nodeId, mode }, { timeout: 10000 })
    latestCanvas = await readCanvas()
    assertNonTargets(initialCanvas, latestCanvas, label)
    const observed = await readBundle()
    assert.equal(observed.value.body, currentBundle.value.body)
    assert.equal(String(observed.value.revisionId), String(currentBundle.value.revisionId))
    assert.equal(observed.bytes.toString('utf8'), currentBundle.value.body)
  } finally { activeStep = null; expectedBody = null }
}

async function stageGeometry(label, action) {
  const batchIndex = report.network.allowedTargetBatches.length
  activeStep = { kind: 'geometry', label, requestConsumed: false }; expectedBody = currentBundle.value.body
  try {
    await action(); await waitBatchResponse(batchIndex, label)
    latestCanvas = await readCanvas(); assertNonTargets(initialCanvas, latestCanvas, label)
    const observed = await readBundle()
    assert.equal(observed.value.body, currentBundle.value.body)
    assert.equal(String(observed.value.revisionId), String(currentBundle.value.revisionId))
    assert.deepEqual(observed.bytes, currentBundle.bytes)
    return latestCanvas.nodes.find(node => String(node.id) === nodeId)
  } finally { activeStep = null; expectedBody = null }
}

async function preflight() {
  base = loopbackUrl(valueArg('--base-url'))
  report.target.origin = base.origin
  const healthRead = await appJson('/health', 'isolated native text health')
  assert.equal(healthRead.response.status, 200)
  const health = healthRead.payload
  assert.equal(health?.ok, true)
  assert.equal(health?.nativeTextPilot, true, 'This script writes only to the nativeTextPilot runtime.')
  assert.match(String(health?.runtimeLabel ?? ''), /^isolated-[a-z0-9][a-z0-9-]*$/)
  assert.equal(health?.port, Number(base.port)); assert.equal(health?.bind, '127.0.0.1')
  assert.ok(Number.isInteger(health?.pid) && health.pid > 0)
  assert.equal(health?.profile, 'original-tapnow-full-integration-in-progress')
  assert.equal(health?.realCoreConnected, true); assert.equal(health?.cloudBackendConnected, false)
  assert.equal(health?.localBackendMode, 'isolated-core-headless-huabu')
  const statusRead = await appJson('/api/surface-core/status', 'isolated Core/Huabu status')
  assert.equal(statusRead.response.status, 200); assert.equal(statusRead.payload?.code, 0)
  serverStatus = statusRead.payload.data
  assert.equal(serverStatus.core?.connected, true)
  const runtimePath = String(serverStatus.core?.databasePath ?? '').replaceAll('\\', '/').toLowerCase()
  assert.ok(runtimePath.includes('/.runtime/' + String(health.runtimeLabel).toLowerCase() + '/'),
    'Core database must live under this explicit isolated runtime label.')
  assert.ok(runtimePath.endsWith('/core.sqlite'))
  const workspace = serverStatus.workspaces?.find(item => item.canvasId === canvasId && item.preferredSurface === 'context')
  assert.ok(workspace, 'The isolated Core project must own the Context canvas under test.')
  coreOrigin = new URL(serverStatus.core.origin)
  assert.equal(coreOrigin.protocol, 'http:')
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(coreOrigin.hostname), 'Core origin must be loopback.')
  report.runtime = { profile: health.profile, pid: health.pid, nativeTextPilot: health.nativeTextPilot,
    runtimeLabel: health.runtimeLabel, localBackendMode: health.localBackendMode,
    projectId: serverStatus.projectId, coreOrigin: coreOrigin.origin,
    coreDatabasePathContained: true, canvasId: workspace.canvasId, workspaceId: workspace.id }
}

async function setupBrowser() {
  const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
  context = await browser.newContext({ viewport: report.browser.viewport, locale: 'zh-CN', serviceWorkers: 'block' })
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method().toUpperCase()
    if (url.origin !== base.origin) {
      report.network.externalHttpBlocked.push({ method, url: url.origin + url.pathname, resourceType: request.resourceType() })
      return route.abort('blockedbyclient')
    }
    if (['GET', 'HEAD'].includes(method) || ['data:', 'blob:'].includes(url.protocol)) return route.continue()
    const exactBatch = method === 'POST' && url.pathname === `/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`
    const check = exactBatch ? validateBatch(request) : { ok: false, reason: 'Only a staged exact-target native Canvas body batch is allowed.' }
    if (!check.ok) {
      report.network.blockedWrites.push({ method, path: url.pathname, stage: activeStep?.label ?? null, reason: check.reason,
        ...(exactBatch ? { wire: request.postDataJSON() } : {}) })
      if (/provider|generation|generate|execute|run/i.test(url.pathname)) report.network.providerTaskRequests.push({ method, path: url.pathname })
      return route.abort('blockedbyclient')
    }
    if (check.record.kind === 'bootstrap') {
      coldNormalizedImage = { ...coldImageBootstrap, measured: { ...check.record.after } }
      coldImageBootstrap = null
    }
    else if (check.record.kind !== 'unchanged-image-measurement') activeStep.requestConsumed = true
    const record = { method, path: url.pathname, ...check.record }
    if (check.record.kind === 'unchanged-image-measurement') report.network.unchangedImageMeasurementEchoes.push(record)
    else report.network.allowedTargetBatches.push(record)
    requestRecords.set(request, record)
    return route.continue()
  })
  await context.routeWebSocket('**/*', socket => { report.network.webSocketsClosed += 1; socket.close() })
  page = await context.newPage()
  page.on('pageerror', error => report.pageErrors.push(clean(error.message)))
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(clean(message.text())) })
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.origin === base.origin && url.pathname.startsWith('/api/') && response.status() >= 400) {
      report.network.apiFailures.push({ method: response.request().method(), path: url.pathname, status: response.status() })
    }
  })
  page.on('requestfailed', request => { report.network.requestFailures.push({ method: request.method(),
    url: (() => { try { const u = new URL(request.url()); return u.origin + u.pathname } catch { return request.url() } })(),
    failure: clean(request.failure()?.errorText ?? 'unknown') }) })
  page.on('response', async response => {
    const record = requestRecords.get(response.request())
    if (!record) return
    try {
      const payload = await response.json()
      record.code = payload?.code ?? null
      record.coreSaved = payload?.data?.core_saved === true || payload?.data?.coreSaved === true
      record.spatialSaved = payload?.data?.spatial_saved === true || payload?.data?.spatialSaved === true
    } catch {}
    // Publish completion only after the body/receipt has been consumed; the
    // polling loop must not observe status=200 with an unparsed envelope.
    record.status = response.status()
  })
}

async function run() {
  await preflight()
  initialCanvas = await readCanvas(); latestCanvas = initialCanvas
  const matches = initialCanvas.nodes.filter(node => String(node.id) === nodeId)
  assert.equal(matches.length, 1, 'Expected one exact synthetic target node.')
  initialNode = matches[0]
  assert.ok(['text', 'note'].includes(initialNode.type))
  assert.equal(refOf(initialNode)?.entityType, 'artifact')
  initialBundle = await readBundle(); currentBundle = initialBundle
  assert.equal(String(refOf(initialNode).artifactId), String(initialBundle.value.artifactId))
  assert.equal(String(refOf(initialNode).artifactViewId), String(initialBundle.value.viewId))
  assert.equal(String(refOf(initialNode).revisionId), String(initialBundle.value.revisionId))
  assert.equal(bodyOf(initialNode), initialBundle.value.body)
  report.fixtureBefore = { nodeCount: initialCanvas.nodes.length, nonTargetCount: initialCanvas.nodes.length - 1,
    nodeType: initialNode.type, geometry: geometryOf(initialNode), artifactId: initialBundle.value.artifactId,
    viewId: initialBundle.value.viewId, revisionId: initialBundle.value.revisionId,
    fileRecordId: initialBundle.value.fileRecordId, bodyLength: initialBundle.value.body.length,
    fileBytesExact: initialBundle.bytes.toString('utf8') === initialBundle.value.body,
    revisionCount: initialBundle.revisions.length }
  const otherFilesBefore = await readOtherFiles(initialCanvas)
  const seedImage = initialCanvas.nodes.find(node => node.id === 'surface-context-image')
  if (seedImage?.type === 'image' && seedImage.measured?.width === 360 && seedImage.measured?.height === 240) {
    coldImageBootstrap = structuredClone(seedImage)
  }
  const expectsColdBootstrap = !!coldImageBootstrap
  await setupBrowser()
  await page.goto(new URL('/canvas/' + canvasId, base).href, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(id => Boolean(window.__LCOS_NODE_LAB__?.api)
    && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === id
    && document.querySelector('.react-flow'), canvasId, { timeout: 30000 })
  const target = page.locator(`.react-flow__node[data-id="${nodeId}"]`)
  const nativeText = target.locator(`[data-native-first-text-body="${nodeId}"]`)
  await target.waitFor({ state: 'visible', timeout: 30000 }); await nativeText.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForFunction(id => document.querySelector(`[data-native-first-text-body="${id}"]`)
    ?.getAttribute('data-native-first-state') === 'ready', nodeId, { timeout: 30000 })
  if (expectsColdBootstrap) {
    await waitBatchResponse(0, 'Original image minimum-size cold bootstrap')
    const bootCanvas = await readCanvas()
    const bootImage = bootCanvas.nodes.find(node => node.id === seedImage.id)
    assert.deepEqual(bootImage.measured, { width: 375, height: 250 })
    assert.deepEqual(bootImage.data, seedImage.data); assert.deepEqual(bootImage.position, seedImage.position)
    assert.equal(bodyOf(bootCanvas.nodes.find(node => node.id === nodeId)), initialBundle.value.body)
    const bootBundle = await readBundle(); assert.equal(bootBundle.value.revisionId, initialBundle.value.revisionId)
    report.coldBootstrap = { nodeId: seedImage.id, before: seedImage.measured, after: bootImage.measured,
      originalImageMinimumOnly: true, coreBodyRevisionAndBytesUnchanged: true }
    initialCanvas = bootCanvas; latestCanvas = bootCanvas
    await page.waitForTimeout(1300)
  }
  assert.equal(await page.locator('.react-flow').count(), 1)
  const agent = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
  if (await agent.count() && await agent.isVisible()) {
    await agent.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
    await agent.waitFor({ state: 'hidden', timeout: 10000 })
  }
  await target.click()
  await nativeText.locator('.native-first-toolbar').waitFor({ state: 'visible', timeout: 10000 })
  await screenshot('loaded')

  const textButton = nativeText.getByRole('button', { name: '正文', exact: true })
  await textButton.waitFor({ state: 'visible', timeout: 10000 })
  if (await nativeText.getAttribute('data-native-first-mode') !== 'text') {
    const historyBeforeText = await nativeHistory()
    await stagePresentation('text-face', 'text', () => textButton.click())
    await waitHistory(historyBeforeText.historySize + 1, historyBeforeText.currentIndex + 1, 'Text face history')
  }
  const historyBeforeReadOnly = await nativeHistory()
  const batchCountBeforeReadOnly = report.network.allowedTargetBatches.length
  const bodyDialog = page.getByRole('dialog', { name: String(initialBundle.value.title), exact: true })
  const originalEditor = bodyDialog.locator('.tiptap.ProseMirror.canvas-text-markdown[contenteditable="true"]')
  await nativeText.dblclick()
  await bodyDialog.waitFor({ state: 'visible', timeout: 15000 })
  await originalEditor.waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await originalEditor.count(), 1, 'Use only the original Canvas markdown editor, not the separate Composer.')
  await originalEditor.click()
  await originalEditor.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))))
  await page.waitForFunction(title => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(e => e.getAttribute('aria-label') === title)
    if (!dialog) return false
    for (let element = dialog; element; element = element.parentElement) {
      if (Number(getComputedStyle(element).opacity) < .99) return false
    }
    return true
  }, String(initialBundle.value.title), { timeout: 10000 })
  await screenshot('original-body-editor-open')
  await bodyDialog.getByRole('button', { name: '返回', exact: true }).click()
  await bodyDialog.waitFor({ state: 'hidden', timeout: 10000 })
  let checkBundle = await readBundle()
  assert.equal(checkBundle.value.body, initialBundle.value.body)
  assert.equal(String(checkBundle.value.revisionId), String(initialBundle.value.revisionId))
  assert.equal(String(checkBundle.value.fileRecordId), String(initialBundle.value.fileRecordId))
  assert.deepEqual(checkBundle.bytes, initialBundle.bytes)
  assert.deepEqual(await nativeHistory(), historyBeforeReadOnly)
  assert.equal(report.network.allowedTargetBatches.length, batchCountBeforeReadOnly)
  report.cases.push({ name: '原正文→原TapNow编辑器打开→原返回按钮退出（未改字）', passed: true,
    selector: '.tiptap.ProseMirror.canvas-text-markdown[contenteditable="true"]', coreRevisionUnchanged: true, batches: 0 })

  const bodySuffix = ' · native-first-' + stamp.slice(11, 19).replaceAll('-', '')
    + (Array.from(initialBundle.value.body).length < 200
      ? '。长文缩放验证：正文保留完整内容，远看只改变呈现，不裁掉文件；改宽仍由原节点负责换行。'.repeat(4) : '')
  const trailingNewlines = initialBundle.value.body.match(/(?:\r?\n)*$/)?.[0] ?? ''
  const bodyBase = trailingNewlines ? initialBundle.value.body.slice(0, -trailingNewlines.length) : initialBundle.value.body
  const editedTextBody = bodyBase + bodySuffix + trailingNewlines
  const historyBeforeBody = await nativeHistory()
  const textBatchIndex = report.network.allowedTargetBatches.length
  activeStep = { kind: 'body', label: 'original-body-autosave', requestConsumed: false }; expectedBody = editedTextBody
  try {
    await nativeText.dblclick(); await bodyDialog.waitFor({ state: 'visible', timeout: 15000 })
    await originalEditor.waitFor({ state: 'visible', timeout: 10000 })
    const paragraphs = originalEditor.locator('p')
    assert.ok(await paragraphs.count() > 0, 'Original markdown editor must expose an editable final paragraph.')
    const lastParagraph = paragraphs.last()
    await lastParagraph.click(); await page.keyboard.press('Control+End'); await page.keyboard.type(bodySuffix)
    assert.ok((await lastParagraph.innerText()).endsWith(bodySuffix), 'Suffix must be typed at the end of the original last paragraph.')
    await waitBatchResponse(textBatchIndex, 'Original text autosave')
  } catch (error) {
    report.lastReadbackAfterUnconfirmedAction = await readBundle().then(bundle => ({
      bodyMatchesExpected: bundle.value.body === editedTextBody, revisionId: bundle.value.revisionId,
      revisionCount: bundle.revisions.length, fileBytesExact: bundle.bytes.toString('utf8') === bundle.value.body,
    })).catch(readError => ({ failed: clean(readError?.message || readError) }))
    throw error
  } finally { activeStep = null; expectedBody = null }
  currentBundle = await waitForCoreBody(editedTextBody, initialBundle, 'Original text autosave')
  const bodyHistoryApplied = await waitHistory(historyBeforeBody.historySize + 1, historyBeforeBody.currentIndex + 1, 'Original body autosave history')
  await bodyDialog.getByRole('button', { name: '返回', exact: true }).click()
  await bodyDialog.waitFor({ state: 'hidden', timeout: 10000 })
  checkBundle = await readBundle()
  assert.equal(checkBundle.value.body, editedTextBody)
  await page.waitForTimeout(350)
  assert.equal(report.network.allowedTargetBatches.length, textBatchIndex + 1, 'Autosave must not replay or duplicate its native batch.')
  await screenshot('original-body-autosaved')
  const bodyUndoBundle = currentBundle
  await page.waitForTimeout(1300)
  await stageBodyAction('original-body-undo', initialBundle.value.body, () => page.keyboard.press('Control+z'))
  currentBundle = await waitForCoreBody(initialBundle.value.body, bodyUndoBundle, 'Original text Ctrl+Z')
  const bodyHistoryUndone = await waitHistory(bodyHistoryApplied.historySize, historyBeforeBody.currentIndex, 'Original body Undo')
  await screenshot('original-body-undone')
  const bodyRedoBundle = currentBundle
  await stageBodyAction('original-body-redo', editedTextBody, () => page.keyboard.press('Control+Shift+z'))
  currentBundle = await waitForCoreBody(editedTextBody, bodyRedoBundle, 'Original text Ctrl+Shift+Z')
  const bodyHistoryRedone = await waitHistory(bodyHistoryApplied.historySize, bodyHistoryApplied.currentIndex, 'Original body Redo')
  report.cases.push({ name: '原TapNow正文300ms autosave→原Ctrl+Z/Redo→Core/FileRecord精确读回', passed: true,
    suffix: bodySuffix, revisions: [currentBundle.value.revisionId],
    o8: { before: historyBeforeBody, applied: bodyHistoryApplied, undone: bodyHistoryUndone, redone: bodyHistoryRedone } })

  // Exercise the original resize handle by pointer, not updateNode or a size API.
  await target.click()
  latestCanvas = await readCanvas()
  const beforeResize = geometryOf(latestCanvas.nodes.find(node => String(node.id) === nodeId))
  const beforeWorldWidth = Number(await nativeText.getAttribute('data-native-first-world-width'))
  const beforeParagraph = await nativeText.locator('p').first().evaluate(e => ({
    width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height, fontSize: getComputedStyle(e).fontSize }))
  const resizeDelta = beforeWorldWidth > 330 ? -78 : 78
  const beforeResizeHistory = await nativeHistory()
  const handle = target.locator('.react-flow__resize-control.right.line')
  const handleBox = await handle.boundingBox(); assert.ok(handleBox)
  const start = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + Math.min(handleBox.height / 2, 120) }
  const resized = await stageGeometry('original-text-resize', async () => {
    await page.mouse.move(start.x, start.y); await page.mouse.down()
    try { await page.mouse.move(start.x + resizeDelta, start.y, { steps: 6 }) }
    finally { await page.mouse.up() }
  })
  const resizedGeometry = geometryOf(resized)
  assert.ok(Number.isFinite(resizedGeometry.width) && Math.abs(resizedGeometry.width - beforeWorldWidth) > 20
    && Math.sign(resizedGeometry.width - beforeWorldWidth) === Math.sign(resizeDelta), 'Original right-edge drag must actually change text width in the pointer direction.')
  await page.waitForFunction(({ id, width }) => Math.abs(Number(document.querySelector(`[data-native-first-text-body="${id}"]`)
    ?.getAttribute('data-native-first-world-width')) - width) < .01, { id: nodeId, width: resizedGeometry.width }, { timeout: 10000 })
  const resizedParagraph = await nativeText.locator('p').first().evaluate(e => ({
    width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height, fontSize: getComputedStyle(e).fontSize }))
  assert.ok(Math.abs(resizedParagraph.width - beforeParagraph.width) > 10, 'Original Markdown paragraph must actually reflow with the resized native shell.')
  const resizedHistory = await waitHistory(beforeResizeHistory.historySize + 1, beforeResizeHistory.currentIndex + 1, 'Original resize history')
  await screenshot('text-resized')
  await page.waitForTimeout(1300)
  const resizeUndone = await stageGeometry('original-resize-undo', () => page.keyboard.press('Control+z'))
  // An untouched synthetic node starts with null DTO sizes; original O8 stores
  // its measured size, so compare to the actual pre-drag world size.
  assert.equal(geometryOf(resizeUndone).width, beforeWorldWidth)
  await waitHistory(resizedHistory.historySize, beforeResizeHistory.currentIndex, 'Original resize Undo')
  const resizeRedone = await stageGeometry('original-resize-redo', () => page.keyboard.press('Control+Shift+z'))
  assert.deepEqual(geometryOf(resizeRedone), resizedGeometry)
  await waitHistory(resizedHistory.historySize, resizedHistory.currentIndex, 'Original resize Redo')
  report.resize = { gesture: 'original right-edge pointer drag', start, deltaX: resizeDelta, before: beforeResize,
    beforeWorldWidth, beforeParagraph, resizedParagraph, resized: resizedGeometry, undone: geometryOf(resizeUndone), redone: geometryOf(resizeRedone), coreBodyRevisionAndBytesUnchanged: true }
  report.cases.push({ name: '原生正文改宽→worldWidth同步→原O8撤销重做，Core正文不变', passed: true, detail: report.resize })

  const outlineButton = nativeText.getByRole('button', { name: '导图', exact: true })
  const historyBeforeMap = await nativeHistory()
  if (await nativeText.getAttribute('data-native-first-mode') !== 'mindmap') {
    await stagePresentation('mindmap-face', 'mindmap', () => outlineButton.click())
    await waitHistory(historyBeforeMap.historySize + 1, historyBeforeMap.currentIndex + 1, 'Mindmap face history')
  }
  const mapHistory = await nativeHistory()
  const mapNode = latestCanvas.nodes.find(node => String(node.id) === nodeId)
  const mapGeometry = geometryOf(mapNode)
  await page.waitForTimeout(1300)
  await stagePresentation('mindmap-face-undo', 'text', () => page.keyboard.press('Control+z'))
  await waitHistory(mapHistory.historySize, historyBeforeMap.currentIndex, 'Mindmap face Undo')
  assert.deepEqual(geometryOf(latestCanvas.nodes.find(node => String(node.id) === nodeId)), resizedGeometry)
  await stagePresentation('mindmap-face-redo', 'mindmap', () => page.keyboard.press('Control+Shift+z'))
  await waitHistory(mapHistory.historySize, mapHistory.currentIndex, 'Mindmap face Redo')
  assert.deepEqual(geometryOf(latestCanvas.nodes.find(node => String(node.id) === nodeId)), mapGeometry)
  const mapShellBounds = await target.boundingBox(), mapBodyBounds = await nativeText.boundingBox()
  assert.ok(Math.abs(mapShellBounds.height - mapBodyBounds.height) < 1 && Math.abs(mapShellBounds.width - mapBodyBounds.width) < 1,
    'Map body must fit the original shell bounds; native 250px minimum must not overflow the selected geometry.')
  report.mapBounds = { shell: mapShellBounds, body: mapBodyBounds, originalMinimumRespected: true }
  report.cases.push({ name: '正文/导图模式与居中尺寸为原O8一帧，Undo/Redo不改Core正文', passed: true })
  const editMapButton = nativeText.getByRole('button', { name: '编辑导图', exact: true })
  await editMapButton.waitFor({ state: 'visible', timeout: 10000 })
  await screenshot('map-face')

  const branchText = ordinaryBranches(currentBundle.value.body).find(text => ordinaryBranches(currentBundle.value.body).filter(item => item === text).length === 1)
  assert.ok(branchText, 'The canonical Core body needs one unique ordinary paragraph branch.')
  const suffix = ' native-first-' + stamp.slice(11, 19).replaceAll('-', '')
  const editedBranch = branchText + suffix
  const bodyBeforeOutlineSave = currentBundle.value.body
  const editedBody = replaceSourceLine(bodyBeforeOutlineSave, branchText, editedBranch)
  await editMapButton.click()
  const dialog = page.getByRole('dialog', { name: '编辑大纲导图', exact: true })
  await dialog.waitFor({ state: 'visible', timeout: 10000 })
  // The mature map deliberately ellipsizes labels. Identify one unique
  // visible prefix, then prove the FULL source by its original edit input.
  const branchPrefix = branchText.slice(0, 12)
  const branch = dialog.locator('g.lcos-mindmap-topic').filter({ hasText: new RegExp('^' + branchPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
  assert.equal(await branch.count(), 1, 'The exact ordinary paragraph branch must be unique in the original diagram.')
  await branch.dblclick()
  const branchInput = dialog.locator('input')
  await branchInput.waitFor({ state: 'visible', timeout: 8000 })
  assert.equal(await branchInput.inputValue(), branchText)
  const batchesBeforeCancel = report.network.allowedTargetBatches.length
  await branchInput.click(); await page.keyboard.press('Control+a'); await page.keyboard.type(branchText + ' 这段应取消')
  await dialog.locator('header strong').click()
  await dialog.getByRole('button', { name: '取消编辑', exact: true }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 10000 })
  const canceledBundle = await readBundle()
  assert.deepEqual(canceledBundle.bytes, currentBundle.bytes)
  assert.equal(String(canceledBundle.value.revisionId), String(currentBundle.value.revisionId))
  assert.equal(report.network.allowedTargetBatches.length, batchesBeforeCancel)
  assert.deepEqual(await nativeHistory(), mapHistory)
  report.cases.push({ name: 'Gen1导图草稿取消不写Core、不留O8历史', passed: true })
  await editMapButton.click(); await dialog.waitFor({ state: 'visible', timeout: 10000 })
  await branch.dblclick(); await branchInput.waitFor({ state: 'visible', timeout: 8000 })
  assert.equal(await branchInput.inputValue(), branchText, 'Canceled draft must not replace the canonical source on reopen.')
  await branchInput.click(); await page.keyboard.press('Control+a'); await page.keyboard.type(editedBranch)
  await dialog.locator('header strong').click()
  await branchInput.waitFor({ state: 'detached', timeout: 8000 })
  await branch.waitFor({ state: 'visible', timeout: 8000 })
  await screenshot('map-edited-before-save')
  const mapBeforeSave = currentBundle
  await stageBodyAction('outline-save', editedBody, () => dialog.getByRole('button', { name: '保存导图', exact: true }).click())
  await dialog.waitFor({ state: 'hidden', timeout: 20000 })
  currentBundle = await waitForCoreBody(editedBody, mapBeforeSave, 'Outline save')
  const outlineHistoryApplied = await waitHistory(mapHistory.historySize + 1, mapHistory.currentIndex + 1, 'Outline save history')
  let savedCanvas = await readCanvas(); latestCanvas = savedCanvas
  let savedTarget = savedCanvas.nodes.find(node => String(node.id) === nodeId)
  assert.equal(bodyOf(savedTarget), editedBody)
  assert.equal(String(refOf(savedTarget)?.revisionId), String(currentBundle.value.revisionId))
  assert.equal(String(currentBundle.value.viewId), String(initialBundle.value.viewId))
  assert.deepEqual(geometryOf(savedTarget), mapGeometry, 'Outline save must retain the chosen native map geometry.')
  assert.equal(savedTarget.data?.lcosTextViewMode, 'mindmap')
  assertNonTargets(initialCanvas, savedCanvas, 'Outline save')
  await screenshot('map-saved')
  report.cases.push({ name: '导图分支编辑/保存→Core exact body/FileRecord', passed: true,
    originalBranch: branchText, editedBranch, revisionId: currentBundle.value.revisionId,
    fileRecordId: currentBundle.value.fileRecordId, exactFileBytes: true })

  const saveBundle = currentBundle
  await page.waitForTimeout(1300)
  await stageBodyAction('outline-undo', bodyBeforeOutlineSave, async () => { await page.keyboard.press('Control+z') })
  currentBundle = await waitForCoreBody(bodyBeforeOutlineSave, saveBundle, 'Original Ctrl+Z')
  const outlineHistoryUndone = await waitHistory(outlineHistoryApplied.historySize, mapHistory.currentIndex, 'Outline Undo history')
  savedCanvas = await readCanvas(); latestCanvas = savedCanvas
  savedTarget = savedCanvas.nodes.find(node => String(node.id) === nodeId)
  assert.equal(bodyOf(savedTarget), bodyBeforeOutlineSave)
  assert.equal(String(refOf(savedTarget)?.revisionId), String(currentBundle.value.revisionId))
  assert.deepEqual(geometryOf(savedTarget), mapGeometry); assert.equal(savedTarget.data?.lcosTextViewMode, 'mindmap')
  assertNonTargets(initialCanvas, savedCanvas, 'Outline Undo')
  await screenshot('map-undone')
  report.cases.push({ name: '原始 Ctrl+Z 经 O8 恢复正文并生成 Core Revision', passed: true,
    revisionId: currentBundle.value.revisionId, revisionCount: currentBundle.revisions.length })

  const undoBundle = currentBundle
  await stageBodyAction('outline-redo', editedBody, async () => { await page.keyboard.press('Control+Shift+z') })
  currentBundle = await waitForCoreBody(editedBody, undoBundle, 'Original Ctrl+Shift+Z')
  const outlineHistoryRedone = await waitHistory(outlineHistoryApplied.historySize, outlineHistoryApplied.currentIndex, 'Outline Redo history')
  savedCanvas = await readCanvas(); latestCanvas = savedCanvas
  savedTarget = savedCanvas.nodes.find(node => String(node.id) === nodeId)
  assert.equal(bodyOf(savedTarget), editedBody)
  assert.equal(String(refOf(savedTarget)?.revisionId), String(currentBundle.value.revisionId))
  assert.deepEqual(geometryOf(savedTarget), mapGeometry); assert.equal(savedTarget.data?.lcosTextViewMode, 'mindmap')
  assertNonTargets(initialCanvas, savedCanvas, 'Outline Redo')
  await screenshot('map-redone')
  report.cases.push({ name: '原始 Ctrl+Shift+Z 经 O8 重做正文并生成 Core Revision', passed: true,
    revisionId: currentBundle.value.revisionId, revisionCount: currentBundle.revisions.length,
    o8: { before: mapHistory, applied: outlineHistoryApplied, undone: outlineHistoryUndone, redone: outlineHistoryRedone } })
  assert.equal(currentBundle.revisions.length, initialBundle.revisions.length + 6)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(id => Boolean(window.__LCOS_NODE_LAB__?.api)
    && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === id
    && document.querySelector('.react-flow'), canvasId, { timeout: 30000 })
  const reloadedBody = page.locator(`.react-flow__node[data-id="${nodeId}"] [data-native-first-text-body="${nodeId}"]`)
  await reloadedBody.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForFunction(id => document.querySelector(`[data-native-first-text-body="${id}"]`)
    ?.getAttribute('data-native-first-state') === 'ready', nodeId, { timeout: 30000 })
  const reloadCanvas = await readCanvas(); latestCanvas = reloadCanvas
  const reloadTarget = reloadCanvas.nodes.find(node => String(node.id) === nodeId)
  const reloadBundle = await readBundle()
  assert.equal(bodyOf(reloadTarget), editedBody); assert.equal(reloadBundle.value.body, editedBody)
  assert.equal(String(refOf(reloadTarget)?.revisionId), String(reloadBundle.value.revisionId))
  assert.equal(reloadBundle.revisions.length, initialBundle.revisions.length + 6)
  assertNonTargets(initialCanvas, reloadCanvas, 'Reload')
  report.reload = { bodyAndFileBytesExact: reloadBundle.bytes.toString('utf8') === editedBody,
    artifactId: reloadBundle.value.artifactId, viewId: reloadBundle.value.viewId,
    revisionId: reloadBundle.value.revisionId, revisionCount: reloadBundle.revisions.length }
  assert.deepEqual(geometryOf(reloadTarget), mapGeometry)
  report.cases.push({ name: '真实刷新恢复同Artifact/View、正文、Core版本与原生尺寸', passed: true })
  if (await agent.count() && await agent.isVisible()) {
    await agent.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
    await agent.waitFor({ state: 'hidden', timeout: 10000 })
  }
  await screenshot('after-reload')

  // Real input only: no NodeBridge zoomTo, setViewport, zoomIn, or zoomOut calls.
  const viewportBefore = await page.evaluate(() => window.__LCOS_NODE_LAB__?.api?.getViewport?.())
  assert.ok(viewportBefore && Number.isFinite(viewportBefore.zoom))
  const densityNode = target.locator('[data-native-first-density]')
  await densityNode.waitFor({ state: 'visible', timeout: 10000 })
  const densityBefore = await densityNode.getAttribute('data-native-first-density')
  const bodyZoomBefore = Number(await reloadedBody.getAttribute('data-native-first-zoom'))
  const worldWidth = Number(await reloadedBody.getAttribute('data-native-first-world-width'))
  assert.equal(bodyZoomBefore, viewportBefore.zoom, 'Native text host must start at the original viewport zoom.')
  // The original Agent dialog closes before its animated full-screen backdrop
  // finishes fading. Wait for actual pointer access, never remove that backdrop.
  await page.waitForFunction(() => {
    const pane = document.querySelector('.react-flow__pane'); if (!pane) return false
    const rect = pane.getBoundingClientRect()
    for (let y = Math.max(rect.y + 40, 40); y < rect.bottom - 60; y += 18) for (let x = Math.max(rect.x + 32, 32); x < rect.right - 32; x += 18) {
      const hit = document.elementFromPoint(x, y)
      if (hit && pane.contains(hit) && !hit.closest('.react-flow__node,.react-flow__edge,button,input,textarea,[contenteditable="true"],.react-flow__controls,.react-flow__minimap,[role="slider"],[data-testid="common-loading-overlay"]')) return true
    }
    return false
  }, null, { timeout: 10000 })
  const point = await page.locator('.react-flow__pane').first().evaluate(element => {
    const rect = element.getBoundingClientRect()
    for (let y = Math.max(rect.y + 40, 40); y < rect.bottom - 60; y += 18) for (let x = Math.max(rect.x + 32, 32); x < rect.right - 32; x += 18) {
      const hit = document.elementFromPoint(x, y)
      if (hit && element.contains(hit) && !hit.closest('.react-flow__node,.react-flow__edge,button,input,textarea,[contenteditable="true"],.react-flow__controls,.react-flow__minimap,[role="slider"],[data-testid="common-loading-overlay"]')) return { x, y, tag: hit.tagName, className: String(hit.className ?? '').slice(0, 120) }
    }
    return null
  })
  assert.ok(point, 'A real unobstructed blank pane point is required for Control+wheel.')
  const wheelDelta = worldWidth * viewportBefore.zoom > 160 ? 480 : -480
  const wheelSteps = []
  await page.mouse.move(point.x, point.y); await page.keyboard.down('Control')
  try {
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, wheelDelta); await page.waitForTimeout(350)
      const state = await page.evaluate(id => {
        const host = document.querySelector(`[data-native-first-text-body="${id}"]`)
        return { zoom: window.__LCOS_NODE_LAB__?.api?.getViewport?.().zoom,
          hostZoom: Number(host?.getAttribute('data-native-first-zoom')),
          density: host?.getAttribute('data-native-first-density') }
      }, nodeId)
      wheelSteps.push(state)
      if (state.density !== densityBefore && (wheelDelta > 0 ? ['summary', 'mark'].includes(state.density)
        : ['working', 'reading'].includes(state.density))) break
    }
  } finally { await page.keyboard.up('Control') }
  const viewportAfter = await page.evaluate(() => window.__LCOS_NODE_LAB__?.api?.getViewport?.())
  const zoomAfter = Number(viewportAfter.zoom)
  const densityAfter = await densityNode.getAttribute('data-native-first-density')
  assert.ok(Math.abs(viewportAfter.zoom - viewportBefore.zoom) > 0.01)
  assert.equal(zoomAfter, viewportAfter.zoom)
  assert.equal(Number(await reloadedBody.getAttribute('data-native-first-zoom')), zoomAfter)
  assert.notEqual(densityAfter, densityBefore, '[data-native-first-density] must respond to the real zoom gesture.')
  const afterZoomCanvas = await readCanvas(); assertNonTargets(initialCanvas, afterZoomCanvas, 'Control+wheel zoom')
  const afterZoomBundle = await readBundle()
  assert.equal(afterZoomBundle.value.body, editedBody); assert.equal(afterZoomBundle.bytes.toString('utf8'), editedBody)
  assert.equal(String(afterZoomBundle.value.revisionId), String(reloadBundle.value.revisionId))
  const zoomedText = await reloadedBody.innerText()
  if (densityAfter === 'summary' && Array.from(editedBody.trim()).length > 160) {
    assert.ok(zoomedText.includes('…') && !zoomedText.includes(editedBranch), 'Real summary view must shorten the long text, not only change a density attribute.')
  }
  report.zoom = { gesture: 'Control + real mouse wheel over blank ReactFlow pane', deltaY: wheelDelta, steps: wheelSteps, point,
    viewportBefore: viewportBefore.zoom, viewportAfter: viewportAfter.zoom,
    bodyZoomBefore, bodyZoomAfter: zoomAfter,
    densityBefore, densityAfter, visibleExcerptEllipsis: zoomedText.includes('…'), canonicalBodyLength: editedBody.length,
    coreRevisionUnchanged: true, bodyAndFileBytesUnchanged: true }
  report.cases.push({ name: '真实Control+wheel同步原画布zoom与[data-native-first-density]', passed: true, detail: report.zoom })
  await screenshot('zoomed')

  const responsiveBatchCount = report.network.allowedTargetBatches.length
  await page.setViewportSize({ width: 1100, height: 760 })
  await reloadedBody.waitFor({ state: 'visible', timeout: 10000 })
  const responsive = await page.evaluate(id => ({ width: innerWidth, height: innerHeight,
    rootCount: document.querySelectorAll('.react-flow').length,
    state: document.querySelector(`[data-native-first-text-body="${id}"]`)?.getAttribute('data-native-first-state'),
    viewport: window.__LCOS_NODE_LAB__?.api?.getViewport?.() }), nodeId)
  assert.equal(responsive.rootCount, 1); assert.equal(responsive.state, 'ready')
  assert.equal(report.network.allowedTargetBatches.length, responsiveBatchCount)
  await screenshot('smaller-viewport')
  report.responsive = responsive
  report.cases.push({ name: '1100×760缩小窗口仍保留唯一原画布、ready正文且零额外写', passed: true })

  const otherFilesAfter = await readOtherFiles(afterZoomCanvas)
  assert.deepEqual(otherFilesAfter, otherFilesBefore, 'Non-target Core bodies and FileRecord bytes changed.')
  assert.equal(report.network.providerTaskRequests.length, 0)
  const echoDeadline = Date.now() + 10000
  while (report.network.unchangedImageMeasurementEchoes.some(entry => entry.status === null) && Date.now() < echoDeadline) {
    await page.waitForTimeout(40)
  }
  for (const echo of report.network.unchangedImageMeasurementEchoes) {
    assert.equal(echo.status, 200); assert.equal(echo.code, 0); assert.equal(echo.spatialSaved, true); assert.equal(echo.coreSaved, false)
  }
  const unexpectedBlocked = report.network.blockedWrites.filter(item => !knownBackgroundWrites.has(item.path))
  assert.deepEqual(unexpectedBlocked, [], 'Unexpected browser write was blocked; inspect report before accepting this run.')
  report.nonTargetFiles = { count: otherFilesAfter.length, unchanged: true }
  report.network.summary = { targetBatches: report.network.allowedTargetBatches.filter(entry => entry.kind !== 'bootstrap').length,
    coldBootstrapBatches: report.network.allowedTargetBatches.filter(entry => entry.kind === 'bootstrap').length,
    totalAllowedCanvasBatches: report.network.allowedTargetBatches.length + report.network.unchangedImageMeasurementEchoes.length,
    unchangedImageMeasurementEchoes: report.network.unchangedImageMeasurementEchoes.length,
    unexpectedBlockedWrites: unexpectedBlocked.length, providerTasks: 0,
    apiFailures: report.network.apiFailures.length,
    externalHttpBlocked: report.network.externalHttpBlocked.length, webSocketsClosed: report.network.webSocketsClosed }
  report.runState = 'executed original text autosave, map edit/O8 history, reload, and Control+wheel density check'
  report.passed = report.cases.every(test => test.passed === true)
}

try {
  if (args.includes('--help')) {
    console.log('Usage: node scripts/native-first-text-browser.mjs --base-url=http://127.0.0.1:<isolated-port>')
  } else {
    await mkdir(visualRoot, { recursive: true })
    await run()
  }
} catch (error) {
  report.failure = clean(error?.stack || error)
  report.runState = 'failed; inspect report; any dispatched save is read back only and never replayed'
  if (page) {
    await screenshot('failed').catch(() => {})
    report.failureEditor = await page.locator('.canvas-text-markdown[contenteditable="true"]').evaluateAll(es =>
      es.map(e => ({ text: e.innerText, html: e.innerHTML }))).catch(() => [])
  }
  process.exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})
  if (!args.includes('--help')) {
    await mkdir(visualRoot, { recursive: true })
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
  }
}

console.log(JSON.stringify({ runState: report.runState, passed: report.passed, target: report.target,
  runtime: report.runtime, fixtureBefore: report.fixtureBefore, cases: report.cases,
  reload: report.reload, zoom: report.zoom, network: report.network.summary,
  pageErrors: report.pageErrors, consoleErrors: report.consoleErrors,
  failure: report.failure, evidence: args.includes('--help') ? null : reportPath }, null, 2))
