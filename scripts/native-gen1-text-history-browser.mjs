import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const valueArg = name => process.argv.slice(2).find(value => value.startsWith(name + '='))?.slice(name.length + 1)
const errors = []
if (!args.has('--deployed')) errors.push('缺少 --deployed；未显式确认目标部署时不会访问服务。')
if (!args.has('--allow-target-history-edits')) errors.push('缺少 --allow-target-history-edits；本专项会产生三条真实Core正文修订。')
if (args.has('--help')) {
  console.log('Usage: node scripts/native-gen1-text-history-browser.mjs --deployed --allow-target-history-edits [--base-url=http://127.0.0.1:17881] [--expected-initial-revision-count=N] [--expected-initial-revision-id=ID] [--expected-h2=TITLE]')
} else if (errors.length) {
  console.error(JSON.stringify({ runState: 'not-started', errors }, null, 2))
  process.exitCode = 2
} else {
  await run()
}

async function run() {
  const base = new URL(valueArg('--base-url') || 'http://127.0.0.1:17881')
  assert.equal(base.protocol, 'http:')
  assert.equal(base.hostname, '127.0.0.1')
  assert.equal(base.port, '17881')
  assert.equal(base.pathname, '/')
  assert.equal(base.search, '')
  assert.equal(base.hash, '')
  const origin = base.origin
  const canvasId = 'surface-core-context'
  const nodeId = 'surface-context-text'
  const artifactId = 'artifact-text-b61f2255-6755-467b-8a5f-0c2cf6fe27cd'
  const headingOne = 'Gen1 原生文本验收'
  const headingTwo = valueArg('--expected-h2') || '正文与 Core 版本回读 · 大纲分支回读'
  const expectedInitialRevisionCount = Number(valueArg('--expected-initial-revision-count') || '4')
  assert.ok(Number.isSafeInteger(expectedInitialRevisionCount) && expectedInitialRevisionCount > 0)
  const expectedInitialRevisionId = valueArg('--expected-initial-revision-id')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const suffix = ' history-' + stamp.slice(11, 19)
  const editedHeading = headingTwo + suffix
  const screenshotRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
  const evidenceDir = path.join(root, '.runtime', 'native-gen1-text-history')
  const reportPath = path.join(evidenceDir, stamp + '.json')
  const report = {
    at: new Date().toISOString(), runState: 'starting',
    target: { origin, route: '/canvas/' + canvasId, canvasId, nodeId, artifactId,
      expectedInitialRevisionCount, expectedInitialRevisionId: expectedInitialRevisionId ?? null, expectedHeadingTwo: headingTwo },
    scope: 'One existing Context node. Original TapNow Canvas, Milkdown, O8 history and actual keyboard remain owners.',
    browser: { engine: 'installed Chrome', freshContext: true, viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'blocked' },
    network: { allowedOrigin: origin, externalHttpBlocked: [], blockedWrites: [], webSocketsClosed: 0,
      allowedTargetBatches: [], apiFailures: [], providerTaskRequests: [], requestFailures: [] },
    historyAudit: { available: false, steps: [], events: [] },
    screenshots: [], reads: [], pageErrors: [], consoleErrors: [], cases: [], passed: false,
    notes: [
      'Only exact-target original nodes:batchActions updates are admitted; direct Core writes, lifecycle/provider requests and non-target writes are blocked.',
      'The ASCII suffix is appended through real pointer selection of the unique existing H2 and keyboard input; no API undo is called.',
      'Apply, Control+Z and Control+Shift+Z each require one 200 native batch, one new Core revision and exact FileRecord bytes.',
      'The original Text-face selection is a separate presentation history step and must settle before body history.',
      'Core revisions/FileRecords are never removed; target geometry is read and recorded, never hard-coded or reset.',
    ],
  }
  let browser, context, page, serverStatus
  let initialCanvas, latestCanvas, initialBundle, latestBundle, initialRef, liveTarget
  let activeStep = null
  let expectedBody = null
  const knownRevisions = new Set()
  const batchRecords = new WeakMap()
  const safePath = value => { try { const u = new URL(value); return u.origin + u.pathname } catch { return String(value).slice(0, 300) } }
  const clean = value => String(value).replace(/((?:token|secret|credential|authorization|api.?key)\s*[:=]\s*)[^\s,;]+/ig, '$1[redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/g, value => safePath(value)).slice(0, 1200)
  const stable = value => JSON.stringify(value)
  const finite = value => typeof value === 'number' && Number.isFinite(value)
  const bodyOf = node => typeof node?.data?.text === 'string' ? node.data.text
    : typeof node?.data?.content === 'string' ? node.data.content : null
  const refOf = ref => ref && typeof ref === 'object' ? {
    version: ref.version, entityType: ref.entityType, entityId: ref.entityId,
    artifactId: ref.artifactId, artifactViewId: ref.artifactViewId, revisionId: ref.revisionId,
  } : null
  const geometryOf = node => ({ position: node?.position ?? null, width: node?.width ?? null,
    height: node?.height ?? null, measured: node?.measured ?? null, style: node?.style ?? null })
  const snapshot = node => ({ id: String(node.id), type: node.type, body: bodyOf(node),
    ref: refOf(node?.data?.lcos_ref ?? node?.lcos_ref), revisionId: node?.lcos_revision_id ?? null,
    geometry: geometryOf(node) })
  const corePath = suffixPath => '/api/lcos/core' + suffixPath

  async function getJson(pathname, label, accept = 'application/json') {
    const response = await fetch(new URL(pathname, origin), { headers: { Accept: accept }, cache: 'no-store', redirect: 'error' })
    let payload = null
    if (accept === 'application/json') { try { payload = await response.json() } catch { payload = null } }
    report.reads.push({ label, method: 'GET', path: pathname, status: response.status })
    if (!response.ok) report.network.apiFailures.push({ method: 'GET', path: pathname, status: response.status,
      code: payload?.error?.code ?? payload?.code ?? null, message: clean(payload?.error?.message ?? payload?.message ?? '') })
    return { response, payload }
  }
  async function readCanvas() {
    const result = await getJson('/api/canvas/v1/canvases/' + encodeURIComponent(canvasId), 'original Context Canvas')
    assert.equal(result.response.status, 200); assert.equal(result.payload?.code, 0)
    assert.ok(Array.isArray(result.payload?.data?.nodes))
    return result.payload.data
  }
  async function readCore() {
    const query = new URLSearchParams({ canvasId, spatialId: nodeId })
    const result = await getJson(corePath('/projects/' + encodeURIComponent(serverStatus.projectId)
      + '/curation/canvas-text?' + query), 'Core canonical CanvasText')
    assert.equal(result.response.status, 200); assert.equal(result.payload?.ok, true)
    assert.ok(typeof result.payload?.value?.body === 'string')
    return result.payload.value
  }
  async function readBundle() {
    const value = await readCore()
    assert.equal(value.projectId, serverStatus.projectId); assert.equal(value.canvasId, canvasId)
    assert.equal(value.spatialId, nodeId); assert.equal(value.artifactId, artifactId)
    assert.equal(value.viewId, initialRef.artifactViewId)
    const history = await getJson(corePath('/artifacts/' + encodeURIComponent(artifactId) + '/revisions'), 'Core Artifact revisions')
    assert.equal(history.response.status, 200); assert.equal(history.payload?.ok, true)
    const revisions = history.payload.value
    assert.ok(Array.isArray(revisions))
    const filePath = corePath('/projects/' + encodeURIComponent(serverStatus.projectId)
      + '/file-records/' + encodeURIComponent(String(value.fileRecordId)) + '/content')
    const file = await getJson(filePath, 'Core FileRecord bytes', '*/*')
    const bytes = Buffer.from(await file.response.arrayBuffer())
    assert.equal(file.response.status, 200); assert.equal(bytes.toString('utf8'), value.body)
    assert.ok(revisions.some(item => String(item.id) === String(value.revisionId)))
    knownRevisions.add(String(value.revisionId))
    return { value, revisions, bytes }
  }
  function headingMatches(body, level, title) {
    const prefix = '#'.repeat(level) + ' '
    const matches = []
    let offset = 0
    for (const raw of body.split('\n')) {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
      if (line.startsWith(prefix) && line.slice(prefix.length) === title) matches.push({ index: offset, length: line.length })
      offset += raw.length + 1
    }
    return matches
  }
  function appendSuffix(body) {
    const matches = headingMatches(body, 2, headingTwo)
    assert.equal(matches.length, 1, 'The exact existing H2 must be unique.')
    const end = matches[0].index + matches[0].length
    return body.slice(0, end) + suffix + body.slice(end)
  }
  function validRef(ref) {
    return Boolean(ref && ref.version === 1 && ref.entityType === 'artifact'
      && ref.entityId === artifactId && ref.artifactId === artifactId
      && ref.artifactViewId === initialRef.artifactViewId
      && typeof ref.revisionId === 'string' && knownRevisions.has(ref.revisionId))
  }
  function assertNonTargets(before, after, label) {
    const beforeIds = before.nodes.map(node => String(node.id)).sort()
    const afterIds = after.nodes.map(node => String(node.id)).sort()
    assert.deepEqual(afterIds, beforeIds, label + ': node IDs/count changed.')
    const map = new Map(before.nodes.map(node => [String(node.id), snapshot(node)]))
    for (const node of after.nodes) if (String(node.id) !== nodeId) {
      assert.equal(stable(snapshot(node)), stable(map.get(String(node.id))), label + ': non-target node changed.')
    }
  }
  const allowedData = new Set(['id', 'title', 'label', 'text', 'content', 'prompt', 'params', 'lcos_ref',
    'lcosTextViewMode', 'lcosTextCollapsedIds', 'lcosTextBeforeMindMapSize'])
  const presentationKeys = new Set(['lcosTextViewMode', 'lcosTextCollapsedIds', 'lcosTextBeforeMindMapSize'])
  function validateBatch(request) {
    let wire
    try { wire = request.postDataJSON() } catch { return { ok: false, reason: 'Batch is not JSON.' } }
    if (!wire || typeof wire !== 'object' || Array.isArray(wire)) return { ok: false, reason: 'Invalid batch record.' }
    if (Object.keys(wire).some(key => !['canvas_id', 'actions', 'created_by_role', 'lcos_expected_revisions', 'lcos_refs'].includes(key))) {
      return { ok: false, reason: 'Unsupported batch top-level field.' }
    }
    if (wire.canvas_id !== canvasId || wire.created_by_role !== 'user' || !activeStep) return { ok: false, reason: 'Wrong canvas/role or no staged UI action.' }
    if (!wire.lcos_expected_revisions || wire.lcos_expected_revisions[nodeId] !== String(latestBundle.value.revisionId)) {
      return { ok: false, reason: 'Target CAS revision is not the last Core readback.' }
    }
    for (const [id, revision] of Object.entries(wire.lcos_expected_revisions)) {
      if (id === nodeId) continue
      const other = initialCanvas.nodes.find(node => String(node.id) === id)
      if (!other || revision !== (other.lcos_revision_id ?? other.data?.lcos_ref?.revisionId)) {
        return { ok: false, reason: 'Non-target revision echo changed or names an unknown node.' }
      }
    }
    if (wire.lcos_refs !== undefined && (!wire.lcos_refs || typeof wire.lcos_refs !== 'object'
      || Array.isArray(wire.lcos_refs) || Object.keys(wire.lcos_refs).some(id => id !== nodeId)
      || wire.lcos_refs[nodeId] && !validRef(wire.lcos_refs[nodeId]))) return { ok: false, reason: 'Non-target/unknown ref map.' }
    if (!Array.isArray(wire.actions) || wire.actions.length !== 1) return { ok: false, reason: 'Only one action is admitted.' }
    const action = wire.actions[0]
    if (!action || action.action !== 'update' || Object.keys(action).some(key => !['action', 'updates', 'canvas_id'].includes(key))
      || action.canvas_id !== undefined && action.canvas_id !== canvasId
      || !Array.isArray(action.updates) || action.updates.length !== 1) return { ok: false, reason: 'Only one original update action is admitted.' }
    const update = action.updates[0]
    const original = initialCanvas.nodes.find(node => String(node.id) === nodeId)
    if (!update || update.id !== nodeId) return { ok: false, reason: 'Batch includes a non-target node.' }
    if (Object.keys(update).some(key => !['id', 'type', 'data', 'position', 'measured', 'lcos_ref', 'parent_id'].includes(key))) {
      return { ok: false, reason: 'Unsupported target update field.' }
    }
    if (update.parent_id !== undefined && (update.parent_id !== '' || original.parentId || original.parent_id)) {
      return { ok: false, reason: 'Only unchanged empty root-parent echo is allowed.' }
    }
    if (update.type !== undefined && update.type !== original.type) return { ok: false, reason: 'Target renderer type changed.' }
    if (update.position !== undefined && (!finite(update.position?.x) || !finite(update.position?.y))) return { ok: false, reason: 'Invalid target position.' }
    if (update.measured !== undefined && (!finite(update.measured?.width) || !finite(update.measured?.height)
      || update.measured.width <= 0 || update.measured.height <= 0)) return { ok: false, reason: 'Invalid target geometry.' }
    if (!update.data || typeof update.data !== 'object' || Array.isArray(update.data)) return { ok: false, reason: 'Target data is required.' }
    const targetRef = update.data.lcos_ref ?? update.lcos_ref ?? wire.lcos_refs?.[nodeId]
    if (!validRef(targetRef)) return { ok: false, reason: 'Exact Artifact/View binding with known revision required.' }
    const oldData = liveTarget.data ?? {}
    const primaryBodyKey = update.data.text !== undefined ? 'text' : 'content'
    if (update.data[primaryBodyKey] !== expectedBody) return { ok: false, reason: 'Authoritative original body does not match the staged payload.' }
    const changedDataKeys = []
    const changedPresentationKeys = []
    let bodyFields = 0
    for (const [key, value] of Object.entries(update.data)) {
      if (!allowedData.has(key)) return { ok: false, reason: 'Unsupported target data field: ' + key }
      if (key === 'id' && value !== nodeId) return { ok: false, reason: 'Native data ID changed.' }
      if (key === 'lcos_ref') {
        if (!validRef(value)) return { ok: false, reason: 'Data ref changed identity or known revision.' }
      } else if (key === 'text' || key === 'content') {
        // TapNow owns `text`; the original full DTO may echo the unchanged
        // legacy `content` alias. The facade uses the same explicit priority.
        if (typeof value !== 'string' || value !== expectedBody && (key === primaryBodyKey || value !== oldData[key])) {
          return { ok: false, reason: 'Body/unchanged auxiliary echo mismatch: ' + key }
        }
        bodyFields++
        if (value !== oldData[key]) changedDataKeys.push(key)
      } else if (stable(value) !== stable(oldData[key])) {
        if (activeStep.kind !== 'presentation' || !presentationKeys.has(key)) return { ok: false, reason: 'Non-body data changed outside Text-face selection.' }
        if (key === 'lcosTextViewMode' && value !== 'text') return { ok: false, reason: 'Only original Text face selection is allowed.' }
        changedDataKeys.push(key); changedPresentationKeys.push(key)
      }
    }
    if (!bodyFields) return { ok: false, reason: 'Exact unchanged/expected body echo is required.' }
    if (activeStep.kind === 'body' && !changedDataKeys.some(key => key === 'text' || key === 'content')) return { ok: false, reason: 'Body stage did not change body.' }
    if (activeStep.kind === 'presentation' && !changedPresentationKeys.length) return { ok: false, reason: 'Text-face stage has no presentation change.' }
    if (activeStep.kind === 'body' && changedPresentationKeys.length) return { ok: false, reason: 'Body/presentation history mixed.' }
    return { ok: true, changes: [{ step: activeStep.label, id: nodeId, changedDataKeys, changedPresentationKeys,
      bodyLength: expectedBody.length, expectedRevision: latestBundle.value.revisionId, ref: refOf(targetRef),
      position: update.position ?? null, measured: update.measured ?? null }] }
  }
  async function waitBatch(index, label, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const item = report.network.allowedTargetBatches[index]
      if (item && item.status !== null) {
        assert.equal(item.status, 200, label + ': HTTP status')
        assert.equal(item.code, 0, label + ': TapNow envelope')
        assert.equal(item.coreSaved, true, label + ': Core receipt')
        assert.equal(item.spatialSaved, true, label + ': spatial receipt')
        return item
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error(label + ': exact target batch receipt not observed.')
  }
  async function waitCanvas(predicate, label, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs
    do {
      const canvas = await readCanvas()
      const node = canvas.nodes.find(item => String(item.id) === nodeId)
      if (node && predicate(node)) { latestCanvas = canvas; liveTarget = node; return { canvas, node } }
      await new Promise(resolve => setTimeout(resolve, 120))
    } while (Date.now() < deadline)
    throw new Error(label + ': exact native Canvas readback not observed.')
  }
  async function waitCoreBody(body, before, label, timeoutMs = 25000) {
    const deadline = Date.now() + timeoutMs
    let value
    do {
      value = await readCore()
      if (value.body === body && String(value.revisionId) !== String(before.value.revisionId)) break
      await new Promise(resolve => setTimeout(resolve, 150))
    } while (Date.now() < deadline)
    assert.equal(value?.body, body, label + ': exact Core body')
    assert.notEqual(String(value.revisionId), String(before.value.revisionId), label + ': fresh revision')
    const bundle = await readBundle()
    assert.equal(bundle.value.body, body)
    assert.equal(bundle.revisions.length, before.revisions.length + 1, label + ': exactly one new revision')
    latestBundle = bundle
    return bundle
  }
  async function currentReceipt(bundle, label) {
    const result = await waitCanvas(node => bodyOf(node) === bundle.value.body
      && node.data?.lcos_ref?.artifactId === artifactId
      && node.data?.lcos_ref?.artifactViewId === initialRef.artifactViewId
      && String(node.data?.lcos_ref?.revisionId) === String(bundle.value.revisionId), label + ' canonical projected ref')
    await page.waitForFunction(({ id, body, artifact, view, revision }) => {
      const node = window.__LCOS_NODE_LAB__?.api?.getNode?.(id)
      return node?.data?.text === body && node.data?.lcos_ref?.artifactId === artifact
        && node.data?.lcos_ref?.artifactViewId === view && node.data?.lcos_ref?.revisionId === revision
    }, { id: nodeId, body: bundle.value.body, artifact: artifactId, view: initialRef.artifactViewId,
      revision: bundle.value.revisionId }, { timeout: 12000 })
    const liveRef = await page.evaluate(id => window.__LCOS_NODE_LAB__?.api?.getNode?.(id)?.data?.lcos_ref ?? null, nodeId)
    return { nodeId, body: bodyOf(result.node), ref: refOf(result.node.data?.lcos_ref),
      originalLiveNodeRef: refOf(liveRef),
      refMatchesCoreRevision: String(result.node.data?.lcos_ref?.revisionId) === String(bundle.value.revisionId),
      geometry: geometryOf(result.node) }
  }
  async function readAudit(label) {
    const events = await page.evaluate(() => window.__LCOS_NATIVE_HISTORY_AUDIT__?.map(event => ({ ...event })) ?? null)
    assert.ok(Array.isArray(events), 'O8 history audit instrumentation is unavailable.')
    report.historyAudit.available = true
    report.historyAudit.steps.push({ label, eventCount: events.length })
    report.historyAudit.events = events
    return events
  }
  async function screenshot(label, locator = null) {
    await mkdir(screenshotRoot, { recursive: true })
    const full = path.join(screenshotRoot, 'tapnow-native-gen1-history-' + stamp + '-' + label + '.png')
    await page.screenshot({ path: full, fullPage: false })
    report.screenshots.push({ label, kind: 'viewport', path: full })
    if (locator) {
      const crop = path.join(screenshotRoot, 'tapnow-native-gen1-history-' + stamp + '-' + label + '-node.png')
      await locator.screenshot({ path: crop })
      report.screenshots.push({ label, kind: 'target-node', path: crop })
    }
  }
  async function bodyExposure(nativeBody) {
    return nativeBody.evaluate(element => {
      for (const candidate of [...element.querySelectorAll('[data-lcos-node-preview], .lcos-document-title, .lcos-text-face-content, .lcos-document-full'), element]) {
        const rect = candidate.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) continue
        for (const fx of [.2, .35, .5, .65, .8]) for (const fy of [.3, .5, .7]) {
          const x = rect.left + rect.width * fx
          const y = rect.top + rect.height * fy
          const hit = document.elementFromPoint(x, y)
          const control = hit?.closest?.('button,input,textarea,select,a,[role="button"],[role="tab"],[data-floating-chrome]')
          const owner = hit?.closest?.('.react-flow__node[data-id]')
          if (hit && (hit === element || element.contains(hit)) && !control
            && owner?.getAttribute('data-id') === 'surface-context-text') {
            const bodyRect = element.getBoundingClientRect()
            return { exposed: true, pointLocal: { x: x - bodyRect.left, y: y - bodyRect.top } }
          }
        }
      }
      return { exposed: false }
    })
  }

  try {
    const health = await getJson('/health', '17881 health')
    assert.equal(health.payload?.profile, 'original-tapnow-full-integration-in-progress')
    assert.equal(health.payload?.realCoreConnected, true)
    assert.ok(Number.isInteger(health.payload?.pid) && health.payload.pid > 0)
    const status = await getJson('/api/surface-core/status', 'Surface Core status')
    assert.equal(status.response.status, 200); assert.equal(status.payload?.code, 0)
    serverStatus = status.payload.data
    assert.equal(serverStatus.core?.connected, true)
    const workspace = serverStatus.workspaces?.find(item => item.canvasId === canvasId && item.preferredSurface === 'context')
      ?? serverStatus.workspaces?.find(item => item.canvasId === canvasId)
    assert.ok(workspace)
    report.server = { pid: health.payload.pid, profile: health.payload.profile,
      fullScopeComplete: health.payload.fullScopeComplete ?? null, projectId: serverStatus.projectId,
      workspaceId: workspace.id, workspaceCanvasId: workspace.canvasId }
    initialCanvas = await readCanvas(); latestCanvas = initialCanvas
    assert.equal(initialCanvas.id, canvasId); assert.equal(initialCanvas.nodes.length, 9)
    const targets = initialCanvas.nodes.filter(node => String(node.id) === nodeId)
    assert.equal(targets.length, 1)
    liveTarget = targets[0]
    assert.ok(['note', 'text'].includes(liveTarget.type))
    initialRef = liveTarget.data?.lcos_ref
    assert.ok(initialRef?.version === 1 && initialRef.entityType === 'artifact')
    assert.equal(initialRef.artifactId, artifactId); assert.equal(initialRef.entityId, artifactId)
    assert.ok(initialRef.artifactViewId && initialRef.revisionId)
    const originalBody = bodyOf(liveTarget)
    assert.equal(typeof originalBody, 'string')
    assert.equal(headingMatches(originalBody, 1, headingOne).length, 1)
    assert.equal(headingMatches(originalBody, 2, headingTwo).length, 1)
    assert.equal(headingMatches(originalBody, 3, headingTwo).length, 0)
    initialBundle = await readBundle(); latestBundle = initialBundle
    assert.equal(String(initialBundle.value.revisionId), String(initialRef.revisionId))
    assert.equal(initialBundle.value.body, originalBody)
    assert.equal(initialBundle.revisions.length, expectedInitialRevisionCount)
    if (expectedInitialRevisionId) assert.equal(initialBundle.value.revisionId, expectedInitialRevisionId)
    knownRevisions.add(String(initialBundle.value.revisionId))
    report.fixtureBefore = { nodeCount: 9, nonTargetCount: 8, target: snapshot(liveTarget),
      projectId: initialBundle.value.projectId, artifactId, artifactViewId: initialBundle.value.viewId,
      revisionId: initialBundle.value.revisionId, fileRecordId: initialBundle.value.fileRecordId,
      body: originalBody, revisionCount: initialBundle.revisions.length, fileByteLength: initialBundle.bytes.length }

    const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' })
    await context.addInitScript(targetId => {
      const events = []
      let intent
      const clone = value => { try { return JSON.parse(JSON.stringify(value)) } catch { return null } }
      const body = node => typeof node?.data?.text === 'string' ? node.data.text : typeof node?.data?.content === 'string' ? node.data.content : null
      const ref = value => value ? { version: value.version, entityType: value.entityType, entityId: value.entityId,
        artifactId: value.artifactId, artifactViewId: value.artifactViewId, revisionId: value.revisionId } : null
      const nodeSummary = node => node ? { id: String(node.id), type: node.type, body: body(node),
        ref: ref(node.data?.lcos_ref ?? node.lcos_ref), mode: node.data?.lcosTextViewMode ?? null,
        geometry: { position: clone(node.position ?? null), width: node.width ?? null, height: node.height ?? null,
          measured: clone(node.measured ?? null), style: clone(node.style ?? null) } } : null
      const graphTarget = graph => Array.isArray(graph?.nodes)
        ? nodeSummary(graph.nodes.find(node => String(node?.id) === targetId)) : null
      const summarizeAction = action => ({ nodeId: action?.nodeId ?? null, aliases: clone(action?.aliases ?? []),
        carrierId: action?.carrierId ?? null, changeType: action?.changeType ?? null,
        operation: clone(action?.lcos_operation ?? null), ref: ref(action?.lcos_ref),
        unsupported: action?.lcos_intent_unsupported ?? null, snapshot: nodeSummary(action?.lcos_snapshot) })
      const live = () => { try { return nodeSummary(window.__LCOS_NODE_LAB__?.api?.getNode?.(targetId)) } catch { return null } }
      const log = event => { try { events.push({ sequence: events.length + 1, at: Date.now(), ...event }) } catch {} }
      Object.defineProperty(window, '__LCOS_NATIVE_HISTORY_AUDIT__', {
        configurable: false, enumerable: false, writable: false, value: events,
      })
      Object.defineProperty(window, '__LCOS_NATIVE_INTENT__', {
        configurable: true, enumerable: false,
        get() { return intent },
        set(next) {
          if (!next || typeof next !== 'object' || next === intent) { intent = next; return }
          const original = next
          intent = {
            ...original,
            recordHistoryTransition(...args) {
              const result = original.recordHistoryTransition.apply(original, args)
              log({ kind: 'o8-snapshot-transition', canvasId: args[0] ?? null,
                previousTarget: graphTarget(args[1]), nextTarget: graphTarget(args[2]),
                historyOperations: (result?.lcos_history_operations ?? [])
                  .filter(action => action?.nodeId === targetId || (action?.aliases ?? []).includes(targetId)).map(summarizeAction) })
              return result
            },
            withHistoryEntry(canvasId, phase, entry, remap, callback) {
              const pairs = remap && typeof remap.entries === 'function' ? [...remap.entries()] : []
              log({ kind: 'o8-history-replay', phase, canvasId, entryTarget: graphTarget(entry?.state),
                historyOperations: (entry?.lcos_history_operations ?? [])
                  .filter(action => action?.nodeId === targetId || (action?.aliases ?? []).includes(targetId)).map(summarizeAction),
                remap: pairs.map(pair => pair.map(String)), liveTargetBefore: live() })
              const wrapped = typeof callback === 'function' ? function (...args) {
                const before = live()
                try { return callback.apply(this, args) }
                finally { log({ kind: 'o8-history-apply-callback', phase, beforeTarget: before, liveTargetAfter: live() }) }
              } : callback
              return original.withHistoryEntry.call(original, canvasId, phase, entry, remap, wrapped)
            },
            rememberNodeRef(canvasId, id, value, operation) {
              const result = original.rememberNodeRef.call(original, canvasId, id, value, operation)
              if (String(id) === targetId) log({ kind: 'native-node-ref-remembered', canvasId,
                nodeId: targetId, ref: ref(value), operation: clone(operation ?? null), liveTarget: live() })
              return result
            },
            backfillHistoryReceipt(input) {
              const result = original.backfillHistoryReceipt.call(original, input)
              if (String(input?.nodeId) === targetId) log({ kind: 'history-receipt-backfill',
                canvasId: input.canvasId, nodeId: targetId, ref: ref(input.ref),
                operation: clone(input.operation ?? null), candidateCount: (input.history ?? [])
                  .flatMap(entry => entry?.lcos_history_operations ?? [])
                  .filter(action => action?.lcos_operation?.operationId === input.operation?.operationId).length,
                result: clone(result), liveTarget: live() })
              return result
            },
          }
        },
      })
    }, nodeId)
    await context.route('**/*', async route => {
      const request = route.request()
      let url
      try { url = new URL(request.url()) } catch {
        report.network.blockedWrites.push({ method: request.method(), path: request.url().slice(0, 240), reason: 'Unknown protocol/URL.' })
        return route.abort('blockedbyclient')
      }
      const method = request.method().toUpperCase()
      if (url.origin !== origin) {
        report.network.externalHttpBlocked.push({ method, path: safePath(url.href), protocol: url.protocol, resourceType: request.resourceType() })
        return route.abort('blockedbyclient')
      }
      if (method === 'GET' || method === 'HEAD') return route.continue()
      const exact = method === 'POST' && url.pathname === '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions'
      if (exact && activeStep) {
        const check = validateBatch(request)
        if (check.ok) {
          const record = { step: activeStep.label, kind: activeStep.kind, method, path: url.pathname,
            status: null, targetNodeId: nodeId, changes: check.changes, expectedRevision: latestBundle.value.revisionId }
          report.network.allowedTargetBatches.push(record)
          batchRecords.set(request, record)
          return route.continue()
        }
        report.network.blockedWrites.push({ method, path: url.pathname, stage: activeStep.label, reason: check.reason })
        return route.abort('blockedbyclient')
      }
      if (/(?:^|\/)(?:runs?|generate|generation|execute|completions?|inference|provider)(?:\/|$)/i.test(url.pathname.toLowerCase())) {
        report.network.providerTaskRequests.push({ method, path: url.pathname, blocked: true })
      }
      report.network.blockedWrites.push({ method, path: url.pathname,
        reason: exact ? 'No explicitly staged UI action.' : 'Only exact target update batches are allowed.' })
      return route.abort('blockedbyclient')
    })
    await context.routeWebSocket('**/*', socket => { report.network.webSocketsClosed += 1; socket.close() })
    page = await context.newPage()
    page.on('pageerror', error => report.pageErrors.push(clean(error.message)))
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(clean(message.text())) })
    page.on('requestfailed', request => {
      try { const url = new URL(request.url()); report.network.requestFailures.push({ method: request.method(),
        path: safePath(url.href), failure: clean(request.failure()?.errorText ?? 'unknown') }) } catch {}
    })
    page.on('response', async response => {
      let url
      try { url = new URL(response.url()) } catch { return }
      if (url.origin !== origin) return
      const request = response.request()
      const allowed = batchRecords.get(request)
      let payload = null
      if (/json/i.test(response.headers()['content-type'] ?? '')) { try { payload = await response.json() } catch {} }
      if (allowed) {
        allowed.status = response.status(); allowed.code = payload?.code ?? null
        allowed.errorCode = payload?.error?.code ?? null
        allowed.coreSaved = payload?.data?.core_saved ?? null; allowed.spatialSaved = payload?.data?.spatial_saved ?? null
        allowed.revisionEchoes = payload?.data?.lcos_expected_revisions ?? null
        allowed.lifecycleResultCount = Array.isArray(payload?.data?.lifecycle_results) ? payload.data.lifecycle_results.length : 0
      }
      if (url.pathname.startsWith('/api/') && response.status() >= 400) report.network.apiFailures.push({
        method: request.method(), path: url.pathname, status: response.status(),
        code: payload?.error?.code ?? payload?.code ?? null, message: clean(payload?.error?.message ?? payload?.message ?? '') })
      if (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method()) && !allowed) {
        report.network.blockedWrites.push({ method: request.method(), path: url.pathname, reason: 'Unexpected mutating API response.' })
      }
    })

    await page.goto(new URL('/canvas/' + canvasId, origin).href, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(id => Boolean(window.__LCOS_NODE_LAB__?.api)
      && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === id
      && document.querySelector('.react-flow'), canvasId, { timeout: 30000 })
    const targetNode = page.locator('.react-flow__node[data-id="' + nodeId + '"]')
    await targetNode.waitFor({ state: 'visible', timeout: 30000 })
    const nativeBody = targetNode.locator('[data-lcos-native-text-body="' + nodeId + '"]')
    await nativeBody.waitFor({ state: 'visible', timeout: 30000 })
    await targetNode.locator('[data-lcos-inline-text][data-state="ready"]').waitFor({ state: 'visible', timeout: 30000 })
    assert.equal(await page.locator('.react-flow').count(), 1)
    const agentPanel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (await agentPanel.count() && await agentPanel.isVisible()) {
      report.originalAgentPanel = { initiallyVisible: true, closedThroughOriginalButton: false }
      await page.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
      await agentPanel.waitFor({ state: 'hidden', timeout: 10000 })
      report.originalAgentPanel.closedThroughOriginalButton = true
    }
    const auditReady = await page.evaluate(id => ({
      intent: Boolean(window.__LCOS_NATIVE_INTENT__),
      record: typeof window.__LCOS_NATIVE_INTENT__?.recordHistoryTransition === 'function',
      replay: typeof window.__LCOS_NATIVE_INTENT__?.withHistoryEntry === 'function',
      canvasId: window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId ?? null,
      node: window.__LCOS_NODE_LAB__?.api?.getNode?.(id) ?? null,
    }), nodeId)
    assert.equal(auditReady.intent, true); assert.equal(auditReady.record, true); assert.equal(auditReady.replay, true)
    assert.equal(auditReady.canvasId, canvasId)
    report.historyAudit.available = true
    report.historyAudit.initialLiveRef = refOf(auditReady.node?.data?.lcos_ref)
    await screenshot('loaded', targetNode)

    const textTab = targetNode.locator('[data-lcos-text-face-mode="text"]')
    assert.equal(await textTab.count(), 1)
    const priorMode = await textTab.getAttribute('aria-selected')
    if (priorMode !== 'true') {
      activeStep = { kind: 'presentation', label: 'text-face-before-body-history' }
      expectedBody = latestBundle.value.body
      const batchIndex = report.network.allowedTargetBatches.length
      await textTab.click()
      await page.waitForFunction(() => document.querySelector('[data-lcos-text-face-mode="text"]')?.getAttribute('aria-selected') === 'true',
        null, { timeout: 10000 })
      await waitCanvas(node => node.data?.lcosTextViewMode === 'text', 'Original Text face selection')
      const modeBundle = await readBundle()
      assert.equal(modeBundle.value.body, latestBundle.value.body)
      assert.equal(String(modeBundle.value.revisionId), String(latestBundle.value.revisionId))
      assert.ok(report.network.allowedTargetBatches.length > batchIndex)
      report.presentationBaseline = { from: priorMode, to: 'text',
        batches: report.network.allowedTargetBatches.slice(batchIndex), bodyUnchanged: true,
        coreRevisionUnchanged: true, geometry: geometryOf(liveTarget) }
      latestBundle = modeBundle
      activeStep = null; expectedBody = null
      await page.waitForTimeout(1500)
    } else {
      report.presentationBaseline = { from: 'text', to: 'text', batches: [],
        bodyUnchanged: true, coreRevisionUnchanged: true, geometry: geometryOf(liveTarget) }
    }
    assert.equal(await textTab.getAttribute('aria-selected'), 'true')
    assertNonTargets(initialCanvas, latestCanvas, 'Text face baseline')
    const auditBeforeEdit = await page.evaluate(() => window.__LCOS_NATIVE_HISTORY_AUDIT__?.map(event => ({ ...event })) ?? [])
    report.historyAudit.steps.push({ label: 'presentation-history-settled-before-body-edit', eventCount: auditBeforeEdit.length })

    const editedBody = appendSuffix(originalBody)
    assert.ok(!originalBody.includes(suffix))
    const exposure = await bodyExposure(nativeBody)
    report.targetDom = exposure
    assert.equal(exposure.exposed, true)
    await nativeBody.dblclick({ position: exposure.pointLocal })
    const editSurface = targetNode.locator('.lcos-inline-text-editor')
    const editor = editSurface.locator('.ProseMirror[contenteditable="true"]')
    await editor.waitFor({ state: 'visible', timeout: 12000 })
    const h2 = editor.locator('h2').filter({ hasText: headingTwo })
    assert.equal(await h2.count(), 1)
    assert.equal((await h2.innerText()).trim(), headingTwo)
    const box = await h2.evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element)
      const rect = range.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        text: element.textContent ?? '', inEditor: Boolean(element.closest('.ProseMirror')) }
    })
    assert.equal(box.text.trim(), headingTwo); assert.equal(box.inEditor, true)
    assert.ok(box.right > box.left && box.bottom > box.top)
    // The heading may wrap. The original browser/editor triple-click selects
    // its real block without guessing a one-line text-range endpoint.
    await h2.click({ clickCount: 3 })
    const selection = await editor.evaluate(element => {
      const s = document.getSelection(); const h = element.querySelector('h2')
      return { text: s?.toString() ?? '', collapsed: s?.isCollapsed ?? true,
        active: element.contains(document.activeElement),
        anchorInH2: Boolean(s?.anchorNode && h?.contains(s.anchorNode)),
        focusInH2: Boolean(s?.focusNode && h?.contains(s.focusNode)) }
    })
    assert.equal(selection.text, headingTwo); assert.equal(selection.collapsed, false)
    assert.equal(selection.active, true); assert.equal(selection.anchorInH2, true); assert.equal(selection.focusInH2, true)
    await page.keyboard.press('ArrowRight')
    const caret = await editor.evaluate(element => {
      const s = document.getSelection(); const h = element.querySelector('h2')
      if (!s || !h || !s.isCollapsed || !s.anchorNode || !h.contains(s.anchorNode)) return { prefix: null }
      const range = document.createRange(); range.selectNodeContents(h); range.setEnd(s.anchorNode, s.anchorOffset)
      return { prefix: range.toString() }
    })
    assert.equal(caret.prefix, headingTwo)
    await page.keyboard.type(suffix)
    await page.waitForFunction(({ id, title }) => {
      const root = document.querySelector('.react-flow__node[data-id="' + id + '"] .lcos-inline-text-editor .ProseMirror')
      return [...(root?.querySelectorAll('h2') ?? [])].some(item => (item.textContent ?? '').trim() === title)
    }, { id: nodeId, title: editedHeading }, { timeout: 10000 })
    report.bodyEdit = { input: 'Text tab → exposed body double-click → real H2 mouse selection → ArrowRight → typed suffix',
      originalH2: headingTwo, suffix, editedH2: editedHeading, selection, caret }
    await screenshot('typed-before-save', targetNode)

    const save = editSurface.getByRole('button', { name: '保存', exact: true })
    await save.waitFor({ state: 'visible', timeout: 8000 })
    const applyIndex = report.network.allowedTargetBatches.length
    activeStep = { kind: 'body', label: 'body-apply' }; expectedBody = editedBody
    await save.click()
    await editSurface.waitFor({ state: 'hidden', timeout: 20000 })
    const applyBatch = await waitBatch(applyIndex, 'Body apply')
    latestBundle = await waitCoreBody(editedBody, latestBundle, 'Body apply')
    const applyRef = await currentReceipt(latestBundle, 'Body apply')
    latestCanvas = await readCanvas(); liveTarget = latestCanvas.nodes.find(node => String(node.id) === nodeId)
    assertNonTargets(initialCanvas, latestCanvas, 'Body apply')
    assert.equal(headingMatches(latestBundle.value.body, 1, headingOne).length, 1)
    assert.equal(headingMatches(latestBundle.value.body, 2, editedHeading).length, 1)
    assert.equal(latestBundle.value.body.replace(suffix, ''), originalBody)
    report.bodyEdit.apply = { batch: applyBatch, currentNativeRef: applyRef,
      revisionId: latestBundle.value.revisionId, revisionCount: latestBundle.revisions.length,
      fileRecordId: latestBundle.value.fileRecordId, fileBytesExact: latestBundle.bytes.toString('utf8') === editedBody,
      targetGeometry: geometryOf(liveTarget) }
    activeStep = null; expectedBody = null
    await page.waitForTimeout(1500)
    const beforeUndo = await readAudit('after-O8-body-snapshot-debounce')
    const bodyEntry = beforeUndo.find(event => event.kind === 'o8-snapshot-transition'
      && event.previousTarget?.body === originalBody && event.nextTarget?.body === editedBody)
    assert.ok(bodyEntry, 'Original O8 must record the exact body transition before Ctrl+Z.')
    assert.equal(bodyEntry.nextTarget.ref?.artifactId, artifactId)
    assert.equal(bodyEntry.nextTarget.ref?.artifactViewId, initialRef.artifactViewId)
    report.historyAudit.bodyEntry = bodyEntry
    report.historyAudit.presentationBeforeBody = beforeUndo.filter(event => event.kind === 'o8-snapshot-transition'
      && event.previousTarget?.body === originalBody && event.nextTarget?.body === originalBody
      && event.previousTarget?.mode !== event.nextTarget?.mode)

    const undoIndex = report.network.allowedTargetBatches.length
    const undoAuditStart = beforeUndo.length
    activeStep = { kind: 'body', label: 'body-undo' }; expectedBody = originalBody
    await page.keyboard.press('Control+z')
    const undoBatch = await waitBatch(undoIndex, 'Real Ctrl+Z body undo', 20000)
    latestBundle = await waitCoreBody(originalBody, latestBundle, 'Real Ctrl+Z body undo')
    const undoRef = await currentReceipt(latestBundle, 'Real Ctrl+Z body undo')
    latestCanvas = await readCanvas(); liveTarget = latestCanvas.nodes.find(node => String(node.id) === nodeId)
    assertNonTargets(initialCanvas, latestCanvas, 'Body undo')
    assert.equal(bodyOf(liveTarget), originalBody)
    assert.equal(liveTarget.data?.lcosTextViewMode ?? 'text', 'text', 'Body Undo must not undo presentation history.')
    report.bodyUndo = { input: 'real Control+z', batch: undoBatch, currentNativeRef: undoRef,
      revisionId: latestBundle.value.revisionId, revisionCount: latestBundle.revisions.length,
      fileRecordId: latestBundle.value.fileRecordId, fileBytesExact: latestBundle.bytes.toString('utf8') === originalBody,
      presentationModeStayedText: true, targetGeometry: geometryOf(liveTarget) }
    activeStep = null; expectedBody = null
    const undoAudit = await readAudit('after-real-Control+z')
    const undoReplay = undoAudit.slice(undoAuditStart).find(event => event.kind === 'o8-history-replay' && event.phase === 'undo')
    assert.ok(undoReplay, 'Ctrl+Z must pass through original O8 history-entry callback.')
    report.bodyUndo.originalHistoryEntry = undoReplay

    const redoIndex = report.network.allowedTargetBatches.length
    const redoAuditStart = undoAudit.length
    activeStep = { kind: 'body', label: 'body-redo' }; expectedBody = editedBody
    await page.keyboard.press('Control+Shift+z')
    const redoBatch = await waitBatch(redoIndex, 'Real Ctrl+Shift+Z body redo', 20000)
    latestBundle = await waitCoreBody(editedBody, latestBundle, 'Real Ctrl+Shift+Z body redo')
    const redoRef = await currentReceipt(latestBundle, 'Real Ctrl+Shift+Z body redo')
    latestCanvas = await readCanvas(); liveTarget = latestCanvas.nodes.find(node => String(node.id) === nodeId)
    assertNonTargets(initialCanvas, latestCanvas, 'Body redo')
    assert.equal(bodyOf(liveTarget), editedBody)
    assert.equal(liveTarget.data?.lcosTextViewMode ?? 'text', 'text', 'Body Redo must not replay presentation as body content.')
    report.bodyRedo = { input: 'real Control+Shift+z', batch: redoBatch, currentNativeRef: redoRef,
      revisionId: latestBundle.value.revisionId, revisionCount: latestBundle.revisions.length,
      fileRecordId: latestBundle.value.fileRecordId, fileBytesExact: latestBundle.bytes.toString('utf8') === editedBody,
      presentationModeStayedText: true, targetGeometry: geometryOf(liveTarget) }
    activeStep = null; expectedBody = null
    const redoAudit = await readAudit('after-real-Control+Shift+z')
    const redoReplay = redoAudit.slice(redoAuditStart).find(event => event.kind === 'o8-history-replay' && event.phase === 'redo')
    assert.ok(redoReplay, 'Ctrl+Shift+Z must pass through original O8 history-entry callback.')
    report.bodyRedo.originalHistoryEntry = redoReplay
    await screenshot('redone-before-reload', targetNode)
    assert.equal(latestBundle.revisions.length, initialBundle.revisions.length + 3,
      'Apply, Undo and Redo must each add one retained Core revision.')
    report.historyAudit.events = await readAudit('before-reload')
    report.historyAudit.summary = {
      presentationTransitionCount: report.historyAudit.presentationBeforeBody.length,
      bodyApplySnapshotCount: report.historyAudit.events.filter(event => event.kind === 'o8-snapshot-transition'
        && event.previousTarget?.body === originalBody && event.nextTarget?.body === editedBody).length,
      undoReplayCount: report.historyAudit.events.filter(event => event.kind === 'o8-history-replay' && event.phase === 'undo').length,
      redoReplayCount: report.historyAudit.events.filter(event => event.kind === 'o8-history-replay' && event.phase === 'redo').length,
      originalNativeHistoryOwnerOnly: true,
    }
    assert.equal(report.historyAudit.summary.undoReplayCount, 1)
    assert.equal(report.historyAudit.summary.redoReplayCount, 1)
    assert.equal(report.historyAudit.summary.bodyApplySnapshotCount, 1,
      'Metadata backfill must not append a second body-edit frame in the original O8 history.')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(id => Boolean(window.__LCOS_NODE_LAB__?.api)
      && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === id
      && document.querySelector('.react-flow'), canvasId, { timeout: 30000 })
    await targetNode.locator('[data-lcos-inline-text][data-state="ready"]').waitFor({ state: 'visible', timeout: 30000 })
    const reloadAgentPanel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (await reloadAgentPanel.count() && await reloadAgentPanel.isVisible()) {
      await page.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
      await reloadAgentPanel.waitFor({ state: 'hidden', timeout: 10000 })
    }
    const reloadedCanvas = await readCanvas()
    const reloadedNode = reloadedCanvas.nodes.find(node => String(node.id) === nodeId)
    assert.ok(reloadedNode)
    assert.equal(bodyOf(reloadedNode), editedBody)
    assert.equal(reloadedNode.data?.lcos_ref?.artifactId, artifactId)
    assert.equal(reloadedNode.data?.lcos_ref?.artifactViewId, initialRef.artifactViewId)
    assert.ok(knownRevisions.has(String(reloadedNode.data?.lcos_ref?.revisionId)))
    const reloadBundle = await readBundle()
    assert.equal(reloadBundle.value.body, editedBody)
    assert.equal(String(reloadBundle.value.revisionId), String(latestBundle.value.revisionId))
    assert.equal(reloadBundle.revisions.length, initialBundle.revisions.length + 3)
    report.afterReloadLiveReceipt = await currentReceipt(reloadBundle, 'Final ready UI reload')
    assertNonTargets(initialCanvas, reloadedCanvas, 'Final reload')
    report.afterReload = { target: snapshot(reloadedNode), artifactId: reloadBundle.value.artifactId,
      artifactViewId: reloadBundle.value.viewId, revisionId: reloadBundle.value.revisionId,
      revisionCount: reloadBundle.revisions.length, fileRecordId: reloadBundle.value.fileRecordId,
      fileBytesExact: reloadBundle.bytes.toString('utf8') === editedBody, nodeCount: reloadedCanvas.nodes.length }
    const knownBlockedBackground = new Set(['/api/events', '/api/agent-gateway/v1/conversations/suggestions/dynamic'])
    assert.equal(report.network.blockedWrites.filter(item => !(item.method === 'POST' && knownBlockedBackground.has(item.path))).length, 0,
      'No target/Core/unknown business write may be blocked; known offline telemetry/suggestions remain recorded.')
    assert.equal(report.network.providerTaskRequests.length, 0)
    report.final = { allowedBatches: report.network.allowedTargetBatches.length,
      perStep: Object.fromEntries(['text-face-before-body-history', 'body-apply', 'body-undo', 'body-redo']
        .map(label => [label, report.network.allowedTargetBatches.filter(item => item.step === label).length])),
      blockedWrites: report.network.blockedWrites.length, externalHttpBlocked: report.network.externalHttpBlocked.length,
      webSocketsClosed: report.network.webSocketsClosed, providerTasks: report.network.providerTaskRequests.length,
      apiFailures: report.network.apiFailures, pageErrors: report.pageErrors.length, consoleErrors: report.consoleErrors.length,
      retainedVersions: true }
    assert.equal(report.final.perStep['body-apply'], 1)
    assert.equal(report.final.perStep['body-undo'], 1)
    assert.equal(report.final.perStep['body-redo'], 1)
    await screenshot('final-after-reload', targetNode)
    report.cases.push({ name: '原Milkdown H2短后缀保存 → 原O8 Ctrl+Z/Control+Shift+Z → Core三版/同ArtifactView/刷新读回',
      passed: true, detail: { apply: report.bodyEdit.apply, undo: report.bodyUndo,
        redo: report.bodyRedo, afterReload: report.afterReload, history: report.historyAudit.summary } })
    report.passed = true
    report.runState = 'executed deployed original-history apply/undo/redo and exact Core reload readback'
  } catch (error) {
    report.failure = clean(error?.stack || error)
    report.runState = 'executed; diagnostics and any committed revisions were preserved'
    if (page) {
      report.failurePage = await page.evaluate(id => ({
        title: document.title, pathname: location.pathname,
        canvasId: window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId ?? null,
        reactFlowRoots: document.querySelectorAll('.react-flow').length,
        nodeIds: [...document.querySelectorAll('.react-flow__node[data-id]')].map(node => node.getAttribute('data-id')),
        currentNode: (() => { const node = window.__LCOS_NODE_LAB__?.api?.getNode?.(id)
          return node ? { id: node.id, type: node.type, body: typeof node.data?.text === 'string' ? node.data.text : node.data?.content ?? null,
            ref: node.data?.lcos_ref ?? null, mode: node.data?.lcosTextViewMode ?? null,
            geometry: { position: node.position, width: node.width, height: node.height, measured: node.measured } } : null })(),
        nativeTextPending: window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.getPending?.({
          canvasId: 'surface-core-context', nodeId: id }) ?? null,
        historyAudit: window.__LCOS_NATIVE_HISTORY_AUDIT__ ?? [],
      }), nodeId).catch(() => null)
      await screenshot('failure').catch(error => { report.screenshotFailure = clean(error?.message || error) })
    }
  } finally {
    activeStep = null; expectedBody = null
    if (browser) await browser.close().catch(() => {})
    await mkdir(evidenceDir, { recursive: true })
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  }
  console.log(JSON.stringify({ runState: report.runState, passed: report.passed, target: report.target,
    fixtureBefore: report.fixtureBefore, presentationBaseline: report.presentationBaseline,
    bodyEdit: report.bodyEdit, bodyUndo: report.bodyUndo, bodyRedo: report.bodyRedo,
    afterReload: report.afterReload, historyAudit: report.historyAudit.summary,
    allowedBatches: report.network.allowedTargetBatches, blockedWrites: report.network.blockedWrites,
    externalHttpBlocked: report.network.externalHttpBlocked.length, providerTasks: report.network.providerTaskRequests,
    pageErrors: report.pageErrors, consoleErrors: report.consoleErrors, apiFailures: report.network.apiFailures,
    screenshots: report.screenshots, failure: report.failure, evidence: reportPath }, null, 2))
  if (!report.passed) process.exitCode = 1

}

