import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const origin = 'http://127.0.0.1:17881'
const canvasId = 'surface-core-context'
const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')

const report = {
  at: new Date().toISOString(),
  runState: 'prepared; browser execution intentionally deferred until Root confirms final rebuild',
  target: `${origin}/canvas/${canvasId}`,
  scope: 'Context only; Main copy/undo/redo and Workflow Agent surface are not opened or mutated',
  browser: { engine: 'Chrome', freshContext: true, viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'blocked' },
  entry: { addButtonTestId: 'canvas-dockbar-add-node-btn', textOptionName: '脚本、广告词、品牌文案' },
  syntheticText: { body: null, providerTaskSubmitted: false, qualitySettingExposed: false },
  network: { allowedOrigin: origin, externalHttpBlocked: [], webSocketsClosed: 0 },
  createRequests: [],
  textUpdateRequests: [],
  lifecycleResponses: [],
  apiFailures: [],
  undefinedCanvasDiagnostics: [],
  providerTaskRequests: [],
  pageErrors: [],
  consoleErrors: [],
  rendererBootstrap: null,
  reactFlowZoomConfig: null,
  nativeUiZoomGestureVerified: null,
  cases: [],
  passed: false,
  screenshots: [],
  notes: [
    'This is a real original TapNow menu/editor path; no API is used to create or edit a node.',
    'Text renderer discriminator type=generate is only observed as a neutral renderer value; no provider/model action is requested.',
    'Background API 501/503 and possible undefined-canvas calls remain visible in evidence and are not summarized as globally clean.',
    'A NodeBridge zoomTo diagnostic is reported distinctly from Native UI zoom input; it does not claim the slider or wheel gesture passed.',
  ],
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const safeUrl = value => {
  try { const url = new URL(value); return url.origin + url.pathname } catch { return String(value).slice(0, 300) }
}
const cleanText = value => String(value)
  .replace(/((?:token|secret|credential|authorization|api.?key)\s*[:=]\s*)[^\s,;]+/ig, '$1[redacted]')
  .replace(/https?:\/\/[^\s"'<>]+/g, value => safeUrl(value))
  .slice(0, 900)
const refSummary = value => value && typeof value === 'object' ? {
  entityType: value.entityType, entityId: value.entityId, artifactId: value.artifactId,
  artifactViewId: value.artifactViewId, revisionId: value.revisionId,
} : null

let browser
let page

async function readJson(url) {
  const response = await fetch(url)
  let body
  try { body = await response.json() } catch { body = null }
  return { response, body }
}

async function readContext() {
  const { response, body } = await readJson(`${origin}/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  assert.equal(response.status, 200, 'Context canvas read must use the live Local Core/Huabu facade.')
  assert.equal(body?.code, 0, 'Context canvas response must be successful.')
  assert.ok(Array.isArray(body?.data?.nodes), 'Context canvas must return node projections.')
  return body.data
}

async function readCoreText(projectId, nodeId) {
  const query = new URLSearchParams({ canvasId, spatialId: String(nodeId) })
  const url = `${report.server.coreOrigin}/projects/${encodeURIComponent(projectId)}/curation/canvas-text?${query}`
  const { response, body } = await readJson(url)
  assert.equal(response.status, 200, 'Core curation text read must succeed.')
  assert.equal(body?.ok, true, 'Core curation text read must return its real owner envelope.')
  assert.ok(body.value, 'Core must resolve the exact created node to a canonical text snapshot.')
  return body.value
}

async function readRevisionList(artifactId) {
  const { response, body } = await readJson(`${report.server.coreOrigin}/artifacts/${encodeURIComponent(artifactId)}/revisions`)
  assert.equal(response.status, 200, 'Core Artifact revision list must be readable.')
  assert.equal(body?.ok, true)
  assert.ok(Array.isArray(body.value))
  return body.value
}

async function readFileRecord(projectId, fileRecordId) {
  const url = `${report.server.coreOrigin}/projects/${encodeURIComponent(projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`
  const response = await fetch(url)
  const bytes = Buffer.from(await response.arrayBuffer())
  return { response, bytes }
}

async function waitForCoreText(projectId, nodeId, predicate, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let value
  do {
    value = await readCoreText(projectId, nodeId)
    if (predicate(value)) return value
    await delay(200)
  } while (Date.now() < deadline)
  return value
}

function bodySnapshot(node) {
  return {
    id: String(node.id), type: node.type,
    text: typeof node.data?.text === 'string' ? node.data.text : typeof node.data?.content === 'string' ? node.data.content : null,
    ref: refSummary(node.data?.lcos_ref ?? node.lcos_ref),
  }
}

try {
  const health = await (await fetch(`${origin}/health`)).json()
  assert.equal(health.profile, 'original-tapnow-full-integration-in-progress')
  assert.equal(health.realCoreConnected, true)
  assert.ok(Number.isInteger(health.pid) && health.pid > 0)
  const statusRead = await readJson(`${origin}/api/surface-core/status`)
  assert.equal(statusRead.response.status, 200)
  assert.equal(statusRead.body?.code, 0)
  const status = statusRead.body.data
  const targetWorkspace = status.workspaces.find(workspace => workspace.preferredSurface === 'context')
  assert.equal(targetWorkspace?.canvasId, canvasId, 'Only the original Context canvas is in scope.')
  report.server = { pid: health.pid, profile: health.profile, projectId: status.projectId,
    coreOrigin: new URL(status.core.origin).href.replace(/\/+$/, ''), coreConnected: status.core.connected,
    targetWorkspace: { id: targetWorkspace.id, canvasId: targetWorkspace.canvasId, scopeId: targetWorkspace.scopeId } }
  report.syntheticText.body = `LCOS 原生文本验收 ${Date.now()}`
  report.syntheticText.qualitySettingExposed = false
  report.syntheticText.providerTaskSubmitted = false

  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue()
    report.network.externalHttpBlocked.push({ method: route.request().method(), url: safeUrl(url.href) })
    return route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', socket => { report.network.webSocketsClosed += 1; socket.close() })
  page = await context.newPage()
  page.on('pageerror', error => report.pageErrors.push(cleanText(error.message)))
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(cleanText(message.text())) })
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss())

  const requestRecords = new WeakMap()
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) return
    let body
    try { body = request.postDataJSON() } catch { body = undefined }
    const spatialBatch = /\/canvases\/[^/]+\/(?:nodes|connections):batchActions$/.test(url.pathname)
    const maybeCanvasIds = []
    if (body && Object.hasOwn(body, 'canvas_id')) maybeCanvasIds.push(body.canvas_id)
    for (const action of body?.actions ?? []) {
      if (Object.hasOwn(action, 'canvas_id')) maybeCanvasIds.push(action.canvas_id)
      for (const item of [...(action.creates ?? []), ...(action.updates ?? [])]) {
        if (Object.hasOwn(item, 'canvas_id')) maybeCanvasIds.push(item.canvas_id)
      }
    }
    const undefinedCanvas = url.pathname.split('/').includes('undefined')
      || spatialBatch && (!body || !Object.hasOwn(body, 'canvas_id'))
      || maybeCanvasIds.some(value => value === undefined || value === null || value === 'undefined')
    if (undefinedCanvas) report.undefinedCanvasDiagnostics.push({ method: request.method(), path: url.pathname,
      canvasIdValues: maybeCanvasIds.map(value => value === undefined ? '[undefined]' : value) })
    if (request.method() !== 'GET' && /(?:^|\/)(?:runs?|generate|generation|execute|completions?|inference)(?:\/|$)/i.test(url.pathname)) {
      report.providerTaskRequests.push({ method: request.method(), path: url.pathname })
    }
    if (url.pathname.endsWith('/nodes:batchActions') && request.method() === 'POST') {
      const actions = body?.actions ?? (body?.action ? [body.action] : [])
      const summary = actions.map(action => ({ action: action.action,
        creates: (action.creates ?? []).map(node => ({ id: node.id, type: node.type,
          rendererType: node.data?.type, dataKeys: Object.keys(node.data ?? {}).sort(),
          textLength: typeof node.data?.text === 'string' ? node.data.text.length : typeof node.data?.content === 'string' ? node.data.content.length : null,
          carriesFileId: typeof node.data?.file_id === 'string', carriesLcosRef: Boolean(node.lcos_ref || node.data?.lcos_ref) })),
        updates: (action.updates ?? []).map(node => ({ id: node.id, type: node.type,
          dataKeys: Object.keys(node.data ?? {}).sort(), textLength: typeof node.data?.text === 'string' ? node.data.text.length : null,
          ref: refSummary(node.data?.lcos_ref ?? node.lcos_ref) })) }))
      const entry = { method: request.method(), path: url.pathname, canvasId: body?.canvas_id,
        operation: body?.lcos_operation, actions: summary, status: null, errorCode: null }
      report.createRequests.push(entry)
      if (summary.some(action => action.action === 'update' && action.updates?.some(update => update.id === report.createdNode?.id))) {
        report.textUpdateRequests.push(entry)
      }
      requestRecords.set(request, entry)
    }
  })
  page.on('response', async response => {
    const url = new URL(response.url())
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) return
    let responseBody
    try { responseBody = await response.json() } catch { responseBody = null }
    const request = response.request()
    const entry = requestRecords.get(request)
    if (entry) {
      entry.status = response.status()
      entry.errorCode = responseBody?.error?.code
      entry.coreSaved = responseBody?.data?.core_saved
      entry.spatialSaved = responseBody?.data?.spatial_saved
      entry.clientToSpatialIds = responseBody?.data?.client_to_spatial_ids
      entry.lifecycleRefs = responseBody?.data?.lcos_refs
      entry.expectedRevisions = responseBody?.data?.lcos_expected_revisions
      if (entry.actions.some(action => action.action === 'create')) {
        const results = responseBody?.data?.lifecycle_results ?? []
        entry.createdNodes = results.flatMap(result => result.nodes ?? []).map(node => ({
          clientNodeId: node.clientNodeId, nodeId: node.nodeId, ref: refSummary(node.lcos_ref),
        }))
      }
    }
    if (response.status() >= 400) {
      const failure = { method: request.method(), path: url.pathname, status: response.status(),
        code: responseBody?.error?.code ?? responseBody?.code, message: cleanText(responseBody?.error?.message ?? responseBody?.message ?? '') }
      report.apiFailures.push(failure)
      if (failure.code === 'INVALID_CANVAS' || /undefined/i.test(url.pathname) || /undefined/i.test(failure.message)) {
        report.undefinedCanvasDiagnostics.push({ ...failure, source: 'API response' })
      }
    }
  })

  const baseline = await readContext()
  const baselineById = new Map(baseline.nodes.map(node => [String(node.id), bodySnapshot(node)]))
  report.baseline = { nodeCount: baseline.nodes.length, nodeIds: [...baselineById.keys()],
    textNodeIds: baseline.nodes.filter(node => node.type === 'text').map(node => String(node.id)) }
  await page.goto(`${origin}/canvas/${canvasId}`)
  await page.waitForFunction(() => Boolean(window.__LCOS_NODE_LAB__?.api), { timeout: 30000 })

  await page.getByTestId('canvas-dockbar-add-node-btn').click()
  const textOption = page.getByRole('option', { name: /脚本、广告词、品牌文案/ })
  await textOption.waitFor({ state: 'visible', timeout: 8000 })
  report.entry.textOptionObserved = cleanText(await textOption.innerText())
  await textOption.click()

  const createDeadline = Date.now() + 30000
  let afterCreate
  let created
  do {
    afterCreate = await readContext()
    created = afterCreate.nodes.find(node => !baselineById.has(String(node.id)) && node.type === 'text')
    if (created && report.createRequests.some(request => request.status === 200 && request.actions.some(action => action.action === 'create'))) break
    await delay(250)
  } while (Date.now() < createDeadline)
  assert.ok(created, `No new Context text node appeared. Batch responses: ${JSON.stringify(report.createRequests)}`)
  assert.equal(afterCreate.nodes.filter(node => !baselineById.has(String(node.id))).length, 1, 'The original Add menu should create exactly one text carrier.')
  assert.equal(created.data?.lcos_ref?.entityType, 'artifact')
  assert.ok(created.data?.lcos_ref?.artifactId && created.data?.lcos_ref?.revisionId && created.data?.lcos_ref?.artifactViewId)
  const createRequest = report.createRequests.find(request => request.status === 200 && request.actions.some(action => action.action === 'create'
    && action.creates?.some(node => node.id === String(created.id))))
  assert.ok(createRequest, 'Native Add must send a real create DTO through nodes:batchActions.')
  assert.equal(createRequest.canvasId, canvasId)
  const nativeCreateDto = createRequest.actions.flatMap(action => action.creates ?? []).find(node => node.id === String(created.id))
  assert.ok(nativeCreateDto, 'Native create DTO ID must match the persisted Huabu node ID.')
  assert.equal(nativeCreateDto.rendererType, 'generate', 'The default text renderer discriminator remains a no-op, not a model job.')
  assert.ok(createRequest.createdNodes?.some(node => node.clientNodeId === String(created.id) && node.nodeId === String(created.id)))
  report.createdNode = { id: String(created.id), type: created.type, ref: refSummary(created.data.lcos_ref),
    rendererType: nativeCreateDto.rendererType, initialTextLength: typeof created.data.text === 'string' ? created.data.text.length : null }
  report.cases.push({ name: '原 Add menu 新建真实Core绑定文本carrier', passed: true, detail: report.createdNode })

  const initialCore = await readCoreText(status.projectId, created.id)
  assert.equal(String(initialCore.artifactId), String(created.data.lcos_ref.artifactId))
  assert.equal(String(initialCore.revisionId), String(created.data.lcos_ref.revisionId))
  const initialRevisions = await readRevisionList(String(initialCore.artifactId))
  assert.ok(initialRevisions.some(revision => String(revision.id) === String(initialCore.revisionId)))
  const initialFile = await readFileRecord(status.projectId, String(initialCore.fileRecordId))
  assert.equal(initialFile.response.status, 200)
  assert.equal(initialFile.bytes.toString('utf8'), initialCore.body)
  report.initialCoreText = { artifactId: String(initialCore.artifactId), revisionId: String(initialCore.revisionId),
    fileRecordId: String(initialCore.fileRecordId), title: initialCore.title, bodyLength: initialCore.body.length,
    revisionListed: true, bytesMatch: true }

  const textNode = page.locator(`.react-flow__node[data-id="${String(created.id).replaceAll('"', '')}"]`)
  await textNode.locator('[data-testid="canvas-node-text-content"]').dblclick()
  const textDialog = page.locator('[role="dialog"]').filter({ has: page.locator('[contenteditable="true"]') }).first()
  await textDialog.waitFor({ state: 'visible', timeout: 10000 })
  const editor = textDialog.locator('[contenteditable="true"]').first()
  await editor.waitFor({ state: 'visible', timeout: 8000 })
  await editor.fill(report.syntheticText.body)
  await textDialog.getByRole('radio', { name: '标题 2', exact: true }).click()
  await editor.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Control+b')
  report.editorHtmlBeforeClose = await editor.evaluate(element => element.innerHTML)
  await textDialog.getByRole('button', { name: '关闭', exact: true }).first().click()
  await textDialog.waitFor({ state: 'hidden', timeout: 15000 })

  const savedCore = await waitForCoreText(status.projectId, created.id,
    value => String(value.revisionId) !== String(initialCore.revisionId) && value.body.includes(report.syntheticText.body))
  assert.notEqual(String(savedCore.revisionId), String(initialCore.revisionId), 'Saving a rich-text edit must create a new Core Revision.')
  assert.match(savedCore.body, /^##\s+\*\*.+\*\*$/m, 'Core body must preserve H2 + bold Markdown from the original editor.')
  assert.ok(savedCore.body.includes(report.syntheticText.body))
  const savedRevisions = await readRevisionList(String(savedCore.artifactId))
  assert.ok(savedRevisions.some(revision => String(revision.id) === String(savedCore.revisionId)))
  const savedFile = await readFileRecord(status.projectId, String(savedCore.fileRecordId))
  assert.equal(savedFile.response.status, 200)
  assert.equal(savedFile.bytes.toString('utf8'), savedCore.body)
  assert.equal(String(savedCore.artifactId), String(initialCore.artifactId), 'Editing must revise, not replace, the Artifact identity.')
  report.savedCoreText = { artifactId: String(savedCore.artifactId), revisionId: String(savedCore.revisionId),
    priorRevisionId: String(initialCore.revisionId), fileRecordId: String(savedCore.fileRecordId), title: savedCore.title,
    body: savedCore.body, revisionListed: true, bytesMatch: true, richMarkdownVerified: true }
  report.cases.push({ name: '原双击编辑器H2+bold关闭保存后由Core产生新Revision和真实正文FileRecord', passed: true,
    detail: { artifactId: report.savedCoreText.artifactId, priorRevisionId: report.savedCoreText.priorRevisionId,
      revisionId: report.savedCoreText.revisionId, fileRecordId: report.savedCoreText.fileRecordId,
      body: report.savedCoreText.body, bytesMatch: true } })

  const baselineAfterEdit = await readContext()
  for (const [id, before] of baselineById) {
    const current = baselineAfterEdit.nodes.find(node => String(node.id) === id)
    assert.ok(current, `Seed/context node ${id} must remain present.`)
    const after = bodySnapshot(current)
    assert.equal(after.type, before.type, `Seed/context node ${id} type must remain unchanged.`)
    assert.equal(after.text, before.text, `Seed/context node ${id} text must remain unchanged.`)
    assert.equal(after.ref?.artifactId ?? null, before.ref?.artifactId ?? null, `Seed/context node ${id} Artifact identity must remain unchanged.`)
    assert.equal(after.ref?.revisionId ?? null, before.ref?.revisionId ?? null, `Seed/context node ${id} Revision must remain unchanged.`)
  }
  report.seedNodes = { count: baselineById.size, bodiesAndCoreRefsUnchanged: true }

  const viewportBefore = await page.evaluate(() => window.__LCOS_NODE_LAB__?.api?.getViewport?.())
  assert.ok(viewportBefore && Number.isFinite(viewportBefore.zoom), 'Original Native camera exposes its current viewport zoom.')
  report.reactFlowZoomConfig = await page.evaluate(() => {
    for (const element of document.querySelectorAll('.react-flow__renderer')) {
      const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$'))
      let fiber = fiberKey ? element[fiberKey] : null
      let depth = 0
      while (fiber && depth++ < 50) {
        const props = fiber.memoizedProps ?? {}
        if (Object.hasOwn(props, 'zoomOnScroll') && Object.hasOwn(props, 'zoomActivationKeyCode')) {
          return { zoomOnScroll: props.zoomOnScroll, zoomOnPinch: props.zoomOnPinch,
            zoomActivationKeyCode: props.zoomActivationKeyCode, panOnScroll: props.panOnScroll,
            preventScrolling: props.preventScrolling }
        }
        fiber = fiber.return
      }
    }
    return null
  })
  const zoomSlider = page.getByRole('slider').first()
  const zoomSliderCount = await page.getByRole('slider').count()
  const sliderValueBefore = zoomSliderCount ? await zoomSlider.getAttribute('aria-valuenow') : null
  let cameraMethod = 'original Native zoom slider keyboard ArrowRight'
  let cameraControlUsed = zoomSliderCount > 0
  let cameraFallback = null
  let zoomChanged = false
  if (zoomSliderCount) {
    try {
      await zoomSlider.focus()
      await page.keyboard.press('ArrowRight')
      await page.waitForFunction(previous => {
        const current = window.__LCOS_NODE_LAB__?.api?.getViewport?.()
        return current && Math.abs(current.zoom - previous) > 0.01
      }, viewportBefore.zoom, { timeout: 8000 })
      zoomChanged = true
    } catch (error) {
      cameraFallback = cleanText(error?.message || error)
    }
  }
  if (!zoomChanged) {
    cameraMethod = 'original NodeBridge api.zoomTo diagnostic (not Native UI gesture)'
    cameraControlUsed = false
    const requestedZoom = Math.min(2, Number((viewportBefore.zoom + 0.08).toFixed(3)))
    const diagnostic = await page.evaluate(async requested => {
      const api = window.__LCOS_NODE_LAB__?.api
      if (typeof api?.zoomTo !== 'function') throw new Error('Original NodeBridge zoomTo is unavailable.')
      const result = await api.zoomTo(requested, { duration: 0 })
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return { result, viewport: api.getViewport() }
    }, requestedZoom)
    report.cameraFallback = { reason: cameraFallback ?? 'No original zoom slider was present. The run used the explicit NodeBridge diagnostic fallback. '
        .trim(), requestedZoom, apiReturn: diagnostic.result }
    zoomChanged = Math.abs(diagnostic.viewport.zoom - viewportBefore.zoom) > 0.01
  }
  assert.ok(zoomChanged, 'Original zoom slider or explicitly labelled Native NodeBridge fallback must change viewport zoom.')
  report.nativeUiZoomGestureVerified = cameraControlUsed
  const viewportAfter = await page.evaluate(() => window.__LCOS_NODE_LAB__?.api?.getViewport?.())
  assert.notEqual(viewportAfter.zoom, viewportBefore.zoom)
  const sliderValueAfter = zoomSliderCount ? await zoomSlider.getAttribute('aria-valuenow') : null
  const coreAfterZoom = await readCoreText(status.projectId, created.id)
  assert.equal(String(coreAfterZoom.artifactId), String(savedCore.artifactId))
  assert.equal(String(coreAfterZoom.revisionId), String(savedCore.revisionId))
  assert.equal(String(coreAfterZoom.fileRecordId), String(savedCore.fileRecordId))
  assert.equal(coreAfterZoom.body, savedCore.body)
  report.camera = { method: cameraMethod, reactFlowZoomConfig: report.reactFlowZoomConfig,
    sliderFound: zoomSliderCount > 0, sliderCount: zoomSliderCount,
    sliderValueBefore, sliderValueAfter, cameraControlUsed, viewportBefore, viewportAfter,
    textBodyUnchanged: true, artifactIdUnchanged: true, revisionIdUnchanged: true }
  report.cases.push({ name: cameraControlUsed
    ? '原Native缩放slider只改viewport，不改Core正文/Artifact/Revision'
    : 'NodeBridge zoomTo诊断只改viewport，不改Core正文/Artifact/Revision（Native UI缩放未验证）',
    passed: true, detail: report.camera })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(window.__LCOS_NODE_LAB__?.api), { timeout: 30000 })
  const reloadedCanvas = await readContext()
  const reloadedNode = reloadedCanvas.nodes.find(node => String(node.id) === String(created.id))
  assert.ok(reloadedNode, 'New native text carrier must survive browser refresh.')
  assert.equal(String(reloadedNode.data?.lcos_ref?.artifactId), String(savedCore.artifactId))
  assert.equal(String(reloadedNode.data?.lcos_ref?.revisionId), String(savedCore.revisionId))
  assert.equal(reloadedNode.data?.text, savedCore.body)
  const reloadedCore = await readCoreText(status.projectId, created.id)
  assert.equal(String(reloadedCore.artifactId), String(savedCore.artifactId))
  assert.equal(String(reloadedCore.revisionId), String(savedCore.revisionId))
  assert.equal(reloadedCore.body, savedCore.body)
  const reloadFile = await readFileRecord(status.projectId, String(reloadedCore.fileRecordId))
  assert.equal(reloadFile.response.status, 200)
  assert.equal(reloadFile.bytes.toString('utf8'), savedCore.body)
  report.reload = { nodeId: String(reloadedNode.id), artifactId: String(savedCore.artifactId),
    revisionId: String(savedCore.revisionId), bodyAndBytesMatch: true }
  report.cases.push({ name: '刷新后原NodeID、Core Artifact/Revision与FileRecord正文仍一致', passed: true, detail: report.reload })

  const textCreateOk = report.createRequests.some(request => request.canvasId === canvasId && request.status === 200
    && request.actions.some(action => action.action === 'create' && action.creates?.some(node => node.id === String(created.id))))
  const textUpdateOk = report.createRequests.some(request => request.canvasId === canvasId && request.status === 200
    && request.actions.some(action => action.action === 'update' && action.updates?.some(update => update.id === String(created.id))))
  assert.ok(textCreateOk, 'The observed original native create action must have succeeded.')
  assert.ok(textUpdateOk, 'The observed original native text update action must have succeeded.')
  assert.equal(report.providerTaskRequests.length, 0, 'The text renderer type=generate must not submit a provider task.')
  assert.equal(report.undefinedCanvasDiagnostics.filter(entry => !['GET', 'HEAD'].includes(entry.method)).length, 0,
    'No mutating API request may use an undefined canvas ID.')
  report.passed = true
  report.runState = 'executed after Root final rebuild; scoped Context text create/edit/readback passed'
} catch (error) {
  report.rendererBootstrap = await page?.evaluate(() => {
    const lab = window.__LCOS_NODE_LAB__
    return {
      documentReadyState: document.readyState,
      route: `${location.origin}${location.pathname}`,
      lab: lab ? { mode: lab.mode ?? null, canvasId: lab.canvasId ?? null,
        apiPresent: Boolean(lab.api), apiKeys: lab.api ? Object.keys(lab.api) : [] } : null,
      reactFlowNodeCount: document.querySelectorAll('.react-flow__node').length,
      addMenuButtonCount: document.querySelectorAll('[data-testid="canvas-dockbar-add-node-btn"]').length,
      loadingSpinnerVisible: Boolean(document.querySelector('.animate-spin')),
    }
  }).catch(() => null)
  report.failure = cleanText(error?.stack || error)
  report.passed = false
  report.runState = 'executed after Root final rebuild; see failure and preserved diagnostics'
  process.exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})
  await mkdir(path.join(root, 'evidence'), { recursive: true })
  await writeFile(path.join(root, 'evidence', 'native-text-browser.json'), JSON.stringify(report, null, 2) + '\n')
}

console.log(JSON.stringify({ runState: report.runState, passed: report.passed, target: report.target,
  entry: report.entry, createdNode: report.createdNode, initialCoreText: report.initialCoreText,
  savedCoreText: report.savedCoreText, camera: report.camera, reload: report.reload,
  apiFailures: report.apiFailures, undefinedCanvasDiagnostics: report.undefinedCanvasDiagnostics,
  providerTaskRequests: report.providerTaskRequests, pageErrors: report.pageErrors, consoleErrors: report.consoleErrors,
  externalHttpBlocked: report.network.externalHttpBlocked.length, webSocketsClosed: report.network.webSocketsClosed,
  failure: report.failure }, null, 2))
