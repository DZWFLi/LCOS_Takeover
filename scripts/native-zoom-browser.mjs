import assert from 'node:assert/strict'
import { access, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const origin = 'http://127.0.0.1:17881'
const canvasId = 'surface-core-context'
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
const runId = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
const screenshotPrefix = path.join(visualRoot, `tapnow-native-zoom-context-${runId}`)
const screenshotPaths = {
  before: `${screenshotPrefix}-before.png`,
  afterControlWheel: `${screenshotPrefix}-after-control-wheel.png`,
  afterSliderDrag: `${screenshotPrefix}-after-slider-drag.png`,
  afterZoomButton: `${screenshotPrefix}-after-zoom-button.png`,
  afterRestore: `${screenshotPrefix}-after-restore.png`,
  afterReload: `${screenshotPrefix}-after-reload.png`,
}
const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')

const report = {
  at: new Date().toISOString(),
  runId,
  runState: 'prepared',
  passed: false,
  target: `${origin}/canvas/${canvasId}`,
  scope: 'Single Context canvas only; no Main/Workflow navigation or content write.',
  browser: { engine: 'Chrome', freshContext: true, viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'blocked' },
  policy: { pageOrigins: [origin], dataAndBlobAllowed: true, webSockets: 'rejected', providerTasksAllowed: false,
    nodeBridgeZoomMutationUsed: false, canvasContentMutationAllowed: false },
  server: null,
  loadingOverlay: null,
  reactFlowZoomProps: null,
  cameraControls: null,
  beforeState: null,
  controlWheel: null,
  sliderDrag: null,
  zoomButton: null,
  restoration: null,
  cameraReloadPersistence: null,
  afterReload: null,
  invariants: [],
  apiFailures: [],
  apiMutationRequests: [],
  disallowedMutationRequests: [],
  providerRequests: [],
  externalHttpBlocked: [],
  webSocketsRejected: 0,
  pageErrors: [],
  consoleErrors: [],
  screenshots: {},
  failureReasons: [],
  notes: [
    'All canvas/content/Core checks are read-only; camera gestures use real pointer/keyboard/wheel input only.',
    'No NodeBridge zoomTo/setViewport/zoomIn/zoomOut call is used as an input gesture.',
    'The common loading overlay is allowed to disappear naturally; the script never hides, removes, or bypasses it.',
    'Evidence records identities, body lengths, byte counts, and equality only; text bodies and file bytes are not copied into the report.',
    'Camera reload state is measured as UI/ReactFlow viewport state and is not claimed as a Core-owned Artifact/Revision.',
  ],
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const safePath = value => {
  try { const url = new URL(value); return `${url.origin}${url.pathname}` } catch { return String(value).slice(0, 300) }
}
const cleanText = value => String(value)
  .replace(/((?:token|secret|credential|authorization|api.?key)\s*[:=]\s*)[^\s,;]+/ig, '$1[redacted]')
  .replace(/https?:\/\/[^\s"'<>]+/g, raw => safePath(raw))
  .slice(0, 900)
const refSnapshot = ref => ref && typeof ref === 'object' ? {
  version: ref.version ?? null,
  entityType: ref.entityType ?? null,
  entityId: ref.entityId ?? null,
  artifactId: ref.artifactId ?? null,
  artifactViewId: ref.artifactViewId ?? null,
  revisionId: ref.revisionId ?? null,
} : null

async function captureScreenshot(page, key) {
  const screenshotPath = screenshotPaths[key]
  assert.ok(screenshotPath, `Screenshot key ${key} is not configured.`)
  await page.screenshot({ path: screenshotPath, fullPage: false })
  report.screenshots[key] = screenshotPath
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
  let body = null
  try { body = await response.json() } catch { body = null }
  return { response, body }
}

async function readContext() {
  const { response, body } = await fetchJson(`${origin}/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  assert.equal(response.status, 200, 'Context canvas read must remain available through the local facade.')
  assert.equal(body?.code, 0)
  assert.ok(Array.isArray(body?.data?.nodes))
  return body.data
}

async function readRevisionIds(coreOrigin, artifactId) {
  const url = `${coreOrigin}/artifacts/${encodeURIComponent(artifactId)}/revisions`
  const { response, body } = await fetchJson(url)
  assert.equal(response.status, 200, `Core revision list read failed for ${artifactId}.`)
  assert.equal(body?.ok, true)
  assert.ok(Array.isArray(body.value), `Core revision list is not an array for ${artifactId}.`)
  return body.value.map(revision => String(revision.id))
}

async function readFileRecord(coreOrigin, projectId, fileRecordId) {
  const url = `${coreOrigin}/projects/${encodeURIComponent(projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
  const bytes = Buffer.from(await response.arrayBuffer())
  return { response, bytes }
}

async function readCoreSnapshot(canvas, { projectId, coreOrigin }) {
  const rows = []
  const internal = new Map()
  const revisionCache = new Map()
  const nodes = [...canvas.nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)))

  for (const node of nodes) {
    const ref = refSnapshot(node.data?.lcos_ref ?? node.lcos_ref)
    const row = {
      id: String(node.id),
      type: node.type ?? null,
      position: node.position && Number.isFinite(node.position.x) && Number.isFinite(node.position.y)
        ? { x: node.position.x, y: node.position.y } : null,
      width: Number.isFinite(node.width) ? node.width : null,
      height: Number.isFinite(node.height) ? node.height : null,
      parentId: node.parentId ?? null,
      ref,
      coreRevisionListed: null,
      fileRecordId: null,
      contentType: null,
      bodyLength: null,
      byteCount: null,
      bodyBytesMatch: null,
    }
    const core = { body: null, bytes: null }

    if (ref?.artifactId && ref.revisionId) {
      let revisionIds = revisionCache.get(ref.artifactId)
      if (!revisionIds) {
        revisionIds = await readRevisionIds(coreOrigin, ref.artifactId)
        revisionCache.set(ref.artifactId, revisionIds)
      }
      row.coreRevisionListed = revisionIds.includes(String(ref.revisionId))
      assert.equal(row.coreRevisionListed, true, `Canvas node ${node.id} ref revision must exist in Core.`)

      if (node.type === 'text') {
        const query = new URLSearchParams({ canvasId, spatialId: String(node.id) })
        const { response, body } = await fetchJson(`${coreOrigin}/projects/${encodeURIComponent(projectId)}/curation/canvas-text?${query}`)
        assert.equal(response.status, 200, `Core text read failed for Context node ${node.id}.`)
        assert.equal(body?.ok, true)
        const value = body.value
        assert.equal(String(value.artifactId), String(ref.artifactId))
        assert.equal(String(value.viewId), String(ref.artifactViewId))
        assert.equal(String(value.revisionId), String(ref.revisionId))
        const nativeBody = typeof node.data?.text === 'string' ? node.data.text
          : typeof node.data?.content === 'string' ? node.data.content : null
        if (nativeBody !== null) assert.equal(nativeBody, value.body, `Context node ${node.id} projection body must match Core.`)
        const file = await readFileRecord(coreOrigin, projectId, String(value.fileRecordId))
        assert.equal(file.response.status, 200, `Core FileRecord read failed for Context node ${node.id}.`)
        const bodyBytes = Buffer.from(String(value.body), 'utf8')
        row.fileRecordId = String(value.fileRecordId)
        row.contentType = file.response.headers.get('content-type')
        row.bodyLength = String(value.body).length
        row.byteCount = file.bytes.length
        row.bodyBytesMatch = file.bytes.equals(bodyBytes)
        assert.equal(row.bodyBytesMatch, true, `Core text bytes must equal body for Context node ${node.id}.`)
        core.body = String(value.body)
        core.bytes = file.bytes
      } else if (node.type === 'image') {
        assert.equal(typeof node.data?.src, 'string', `Context image ${node.id} is missing its canonical source route.`)
        const sourceUrl = new URL(node.data.src, origin)
        assert.equal(sourceUrl.origin, origin, `Context image ${node.id} must use the local canonical FileRecord route.`)
        const match = sourceUrl.pathname.match(/^\/api\/surface-core\/file-records\/([^/]+)\/content$/)
        assert.ok(match, `Context image ${node.id} source is not a canonical FileRecord route.`)
        const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(12000) })
        const bytes = Buffer.from(await response.arrayBuffer())
        assert.equal(response.status, 200, `Context image FileRecord read failed for node ${node.id}.`)
        row.fileRecordId = decodeURIComponent(match[1])
        row.contentType = response.headers.get('content-type')
        row.byteCount = bytes.length
        core.bytes = bytes
      }
    }

    rows.push(row)
    internal.set(String(node.id), {
      row,
      body: core.body,
      bytes: core.bytes,
      projectedBody: typeof node.data?.text === 'string' ? node.data.text
        : typeof node.data?.content === 'string' ? node.data.content : null,
    })
  }

  return { summary: { canvasId, nodeCount: canvas.nodes.length, nodes: rows }, internal }
}

function assertContentInvariant(before, after, label) {
  assert.deepEqual(after.summary, before.summary, `${label}: node geometry, Core refs/revisions, FileRecord IDs, body lengths and byte counts changed.`)
  assert.deepEqual([...after.internal.keys()].sort(), [...before.internal.keys()].sort(), `${label}: Context node IDs changed.`)
  for (const id of before.internal.keys()) {
    const left = before.internal.get(id)
    const right = after.internal.get(id)
    assert.equal(right.body, left.body, `${label}: Core text body changed for ${id}.`)
    assert.equal(right.projectedBody, left.projectedBody, `${label}: native projected text changed for ${id}.`)
    if (left.bytes || right.bytes) {
      assert.ok(left.bytes && right.bytes, `${label}: Core/FileRecord bytes became unavailable for ${id}.`)
      assert.ok(right.bytes.equals(left.bytes), `${label}: Core/FileRecord bytes changed for ${id}.`)
    }
  }
  return { nodeCount: before.summary.nodeCount, identitiesUnchanged: true, textBodiesUnchanged: true,
    FileRecordBytesUnchanged: true, exactBodyBytesVerified: true }
}

async function readViewport(page) {
  return page.evaluate(() => {
    const viewport = window.__LCOS_NODE_LAB__?.api?.getViewport?.()
    return viewport ? { x: viewport.x, y: viewport.y, zoom: viewport.zoom,
      devicePixelRatio: window.devicePixelRatio, visualScale: window.visualViewport?.scale ?? null } : null
  })
}

async function waitUntilOverlayHidden(page, timeout = 20000) {
  const overlay = page.locator('[data-testid="common-loading-overlay"]')
  const count = await overlay.count()
  let initialText = null
  if (count) {
    try { initialText = cleanText(await overlay.first().innerText()) } catch { initialText = null }
    await overlay.first().waitFor({ state: 'hidden', timeout })
  }
  return { initiallyPresent: count > 0, initialText, waitedMs: count ? null : 0,
    hiddenAfterWait: await overlay.count() === 0 || !(await overlay.first().isVisible()) }
}

function recordReactFlowZoomProps(page) {
  return page.evaluate(() => {
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
}

async function findEmptyPanePoint(page) {
  return page.evaluate(() => {
    const pane = document.querySelector('.react-flow__pane')
    if (!pane) return null
    const bounds = pane.getBoundingClientRect()
    for (let y = Math.max(bounds.y + 40, 40); y < bounds.bottom - 70; y += 16) {
      for (let x = Math.max(bounds.x + 32, 32); x < bounds.right - 32; x += 16) {
        const target = document.elementFromPoint(x, y)
        if (!target || !pane.contains(target)) continue
        if (target.closest('.react-flow__node, .react-flow__edge, button, [role="slider"], [data-testid="common-loading-overlay"]')) continue
        return { x, y, targetTag: target.tagName, targetClass: String(target.className ?? '').slice(0, 120),
          withinCanvasPane: true, nodeOrControlHit: false }
      }
    }
    return null
  })
}

async function clickOrDragSlider(page, targetX, startPoint = null) {
  const slider = page.getByRole('slider').first()
  const thumb = await slider.boundingBox()
  assert.ok(thumb, 'Native zoom slider thumb must be visible before pointer drag.')
  const start = startPoint ?? { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  try { await page.mouse.move(targetX, start.y, { steps: 6 }) }
  finally { await page.mouse.up() }
  return { start, target: { x: targetX, y: start.y }, thumbBefore: thumb }
}

let browser
let page
let beforeStateSnapshot
let beforeCanvasState

try {
  await access(visualRoot)
  const health = await (await fetch(`${origin}/health`)).json()
  assert.equal(health.pid, 41392, 'Use the already-running Root integration service; do not restart it.')
  assert.equal(health.profile, 'original-tapnow-full-integration-in-progress')
  assert.equal(health.realCoreConnected, true)
  const { response: statusResponse, body: statusBody } = await fetchJson(`${origin}/api/surface-core/status`)
  assert.equal(statusResponse.status, 200)
  assert.equal(statusBody?.code, 0)
  const status = statusBody.data
  const targetWorkspace = status.workspaces.find(workspace => workspace.preferredSurface === 'context')
  assert.equal(targetWorkspace?.canvasId, canvasId)
  const coreOrigin = new URL(status.core.origin).href.replace(/\/+$/, '')
  assert.equal(new URL(coreOrigin).hostname, '127.0.0.1', 'Core reads must remain loopback-only.')
  report.server = { pid: health.pid, profile: health.profile, projectId: status.projectId,
    coreOrigin, coreConnected: status.core.connected, targetWorkspace: { id: targetWorkspace.id, canvasId } }

  beforeCanvasState = await readContext()
  assert.ok(beforeCanvasState.nodes.length > 0)
  beforeStateSnapshot = await readCoreSnapshot(beforeCanvasState, { projectId: status.projectId, coreOrigin })
  report.beforeState = beforeStateSnapshot.summary

  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue()
    report.externalHttpBlocked.push({ method: route.request().method(), url: safePath(url.href) })
    return route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', socket => { report.webSocketsRejected += 1; socket.close() })
  page = await context.newPage()
  page.on('pageerror', error => report.pageErrors.push(cleanText(error.message)))
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(cleanText(message.text())) })
  const apiRequests = new WeakMap()
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) return
    const entry = { method: request.method(), path: url.pathname, status: null }
    apiRequests.set(request, entry)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      report.apiMutationRequests.push(entry)
      if (/nodes:batchActions|connections:batchActions|upload-urls|lcos-upload-staging|(?:^|\/)(?:runs?|generate|generation|execute)(?:\/|$)/i.test(url.pathname)) {
        report.disallowedMutationRequests.push(entry)
      }
    }
    if (/(?:^|\/)(?:runs?|generate|generation|execute|completions?|inference)(?:\/|$)/i.test(url.pathname)
      && !['GET', 'HEAD'].includes(request.method())) {
      report.providerRequests.push({ method: request.method(), path: url.pathname })
    }
  })
  page.on('response', async response => {
    const url = new URL(response.url())
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) return
    const entry = apiRequests.get(response.request())
    if (entry) entry.status = response.status()
    if (response.status() >= 400) {
      let body = null
      try { body = await response.json() } catch { body = null }
      report.apiFailures.push({ method: response.request().method(), path: url.pathname, status: response.status(),
        code: body?.error?.code ?? body?.code ?? null })
    }
  })

  const pageStart = Date.now()
  const navigation = await page.goto(`${origin}/canvas/${canvasId}`, { waitUntil: 'domcontentloaded' })
  assert.equal(navigation?.status(), 200)
  await page.waitForFunction(() => Boolean(window.__LCOS_NODE_LAB__?.api), { timeout: 30000 })
  const overlay = page.locator('[data-testid="common-loading-overlay"]')
  const overlayCount = await overlay.count()
  const overlayText = overlayCount ? cleanText(await overlay.first().innerText().catch(() => '')) : null
  if (overlayCount) await overlay.first().waitFor({ state: 'hidden', timeout: 30000 })
  report.loadingOverlay = { initiallyPresent: overlayCount > 0, initialText: overlayText,
    naturalWaitMs: Date.now() - pageStart, hiddenBeforeInteraction: overlayCount === 0 || !(await overlay.first().isVisible()) }
  assert.equal(report.loadingOverlay.hiddenBeforeInteraction, true, 'Do not interact while the product loading overlay blocks input.')
  await page.waitForFunction(expectedCount => window.__LCOS_NODE_LAB__?.api?.getNodes?.().length === expectedCount,
    beforeCanvasState.nodes.length, { timeout: 15000 })
  report.reactFlowZoomProps = await recordReactFlowZoomProps(page)
  report.cameraControls = await page.evaluate(() => {
    const sliders = [...document.querySelectorAll('[role="slider"]')]
    const buttons = [...document.querySelectorAll('button')].map(button => ({
      text: (button.innerText || '').trim().slice(0, 60),
      ariaLabel: button.getAttribute('aria-label'),
      title: button.getAttribute('title'),
      testId: button.getAttribute('data-testid'),
    }))
    return {
      sliders: sliders.map(element => {
        const thumb = element.getBoundingClientRect()
        const track = element.parentElement?.parentElement?.getBoundingClientRect()
        return { role: element.getAttribute('role'), ariaLabel: element.getAttribute('aria-label'),
          min: element.getAttribute('aria-valuemin'), max: element.getAttribute('aria-valuemax'), value: element.getAttribute('aria-valuenow'),
          orientation: element.getAttribute('aria-orientation'), tabIndex: element.getAttribute('tabindex'),
          thumbCenter: { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 },
          thumbRect: { x: thumb.x, y: thumb.y, width: thumb.width, height: thumb.height },
          trackRect: track ? { x: track.x, y: track.y, width: track.width, height: track.height } : null,
          className: String(element.className).slice(0, 180) }
      }),
      zoomButtons: buttons.filter(button => /zoom|缩放|放大|缩小|重置/i.test([button.text, button.ariaLabel, button.title, button.testId].join(' '))),
    }
  })
  const viewportBefore = await readViewport(page)
  assert.ok(viewportBefore && Number.isFinite(viewportBefore.zoom))
  await captureScreenshot(page, 'before')

  const emptyPoint = await findEmptyPanePoint(page)
  const controlWheelViewportBefore = await readViewport(page)
  if (emptyPoint) {
    await page.mouse.move(emptyPoint.x, emptyPoint.y)
    await page.keyboard.down('Control')
    try { await page.mouse.wheel(0, -320) } finally { await page.keyboard.up('Control') }
    await delay(1200)
    const after = await readViewport(page)
    report.controlWheel = {
      gesture: 'Control key held + mouse wheel deltaY=-320 over an empty point in the Context ReactFlow pane.',
      target: emptyPoint,
      reactFlowZoomProps: report.reactFlowZoomProps,
      viewportBefore: controlWheelViewportBefore,
      viewportAfter: after,
      zoomChanged: Math.abs(after.zoom - controlWheelViewportBefore.zoom) > 0.01,
      panChanged: Math.abs(after.x - controlWheelViewportBefore.x) > 0.5 || Math.abs(after.y - controlWheelViewportBefore.y) > 0.5,
      browserScaleChanged: after.visualScale !== controlWheelViewportBefore.visualScale
        || after.devicePixelRatio !== controlWheelViewportBefore.devicePixelRatio,
      result: Math.abs(after.zoom - controlWheelViewportBefore.zoom) > 0.01 ? 'canvas zoom changed'
        : report.reactFlowZoomProps?.zoomOnScroll === false ? 'no canvas zoom; ReactFlow zoomOnScroll=false'
          : 'no canvas zoom observed with Control held',
    }
  } else {
    report.controlWheel = { gesture: 'Control + mouse wheel over empty Context ReactFlow pane', status: 'not-attempted',
      reason: 'No unobstructed empty pane point was found; no overlay was hidden and no node was targeted.' }
    report.failureReasons.push({ action: 'control-wheel', reason: report.controlWheel.reason })
  }
  await captureScreenshot(page, 'afterControlWheel')
  const afterWheelCanvas = await readContext()
  const afterWheelCore = await readCoreSnapshot(afterWheelCanvas, { projectId: status.projectId, coreOrigin })
  report.invariants.push({ stage: 'after-Control-wheel', ...assertContentInvariant(beforeStateSnapshot, afterWheelCore, 'after-Control-wheel') })

  let sliderZoomSucceeded = false
  const slider = page.getByRole('slider').first()
  const sliderCount = await page.getByRole('slider').count()
  report.sliderDrag = { gesture: 'Native zoom slider thumb pointer drag to the right; exact DOM node is [role="slider"].',
    attempted: sliderCount > 0, sliderCount }
  if (sliderCount) {
    const sliderVisible = await slider.isVisible()
    const overlayHidden = await overlay.count() === 0 || !(await overlay.first().isVisible())
    report.sliderDrag.visible = sliderVisible
    report.sliderDrag.loadingOverlayHidden = overlayHidden
    if (sliderVisible && overlayHidden) {
      const values = await slider.evaluate(element => {
        const box = element.getBoundingClientRect()
        const track = element.parentElement?.parentElement?.getBoundingClientRect()
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        return { value: element.getAttribute('aria-valuenow'), min: Number(element.getAttribute('aria-valuemin')),
          max: Number(element.getAttribute('aria-valuemax')), orientation: element.getAttribute('aria-orientation'),
          thumb: { x: box.x, y: box.y, width: box.width, height: box.height },
          track: track ? { x: track.x, y: track.y, width: track.width, height: track.height } : null,
          pointerHit: hit === element || Boolean(hit?.closest('[role="slider"]')),
          hitTestId: hit?.getAttribute('data-testid'), hitTag: hit?.tagName }
      })
      report.sliderDrag.dom = values
      const beforeSliderViewport = await readViewport(page)
      report.sliderDrag.viewportBefore = beforeSliderViewport
      report.sliderDrag.valueBefore = values.value
      if (values.pointerHit && values.track && values.track.width > 20) {
        const centerX = values.thumb.x + values.thumb.width / 2
        const centerY = values.thumb.y + values.thumb.height / 2
        const rightRoom = values.track.x + values.track.width - centerX - 4
        const leftRoom = centerX - values.track.x - 4
        const delta = rightRoom >= 8 ? Math.min(12, rightRoom) : -Math.min(12, leftRoom)
        const targetX = centerX + delta
        report.sliderDrag.pointerDeltaPx = delta
        report.sliderDrag.pointer = await clickOrDragSlider(page, targetX, { x: centerX, y: centerY })
        try {
          await page.waitForFunction(previous => {
            const current = window.__LCOS_NODE_LAB__?.api?.getViewport?.()
            return current && Math.abs(current.zoom - previous) > 0.01
          }, beforeSliderViewport.zoom, { timeout: 5000 })
          sliderZoomSucceeded = true
        } catch (error) {
          report.sliderDrag.failureReason = cleanText(error?.message || error)
        }
        report.sliderDrag.valueAfter = await slider.getAttribute('aria-valuenow')
        report.sliderDrag.viewportAfter = await readViewport(page)
        report.sliderDrag.zoomChanged = sliderZoomSucceeded
        report.sliderDrag.result = sliderZoomSucceeded ? 'pointer drag changed Canvas zoom'
          : 'pointer drag did not change Canvas zoom'
      } else {
        report.sliderDrag.result = 'slider thumb was not the pointer hit target or track geometry was unavailable'
        report.sliderDrag.failureReason = 'The visible DOM slider could not be reached by an unoccluded pointer hit test.'
      }
    } else {
      report.sliderDrag.result = 'slider interaction was not attempted because it was hidden or an overlay remained visible'
      report.sliderDrag.failureReason = 'A visible UI obstacle remained; it was not hidden or bypassed.'
    }
  } else {
    report.sliderDrag.result = 'no role=slider zoom control exists'
    report.sliderDrag.failureReason = 'No original slider DOM node was found.'
  }
  await captureScreenshot(page, 'afterSliderDrag')
  const afterSliderCanvas = await readContext()
  const afterSliderCore = await readCoreSnapshot(afterSliderCanvas, { projectId: status.projectId, coreOrigin })
  report.invariants.push({ stage: 'after-slider-drag', ...assertContentInvariant(beforeStateSnapshot, afterSliderCore, 'after-slider-drag') })

  let zoomButtonSucceeded = false
  if (!sliderZoomSucceeded && Math.abs((await readViewport(page)).zoom - viewportBefore.zoom) <= 0.01) {
    const resetButton = page.getByTestId('canvas-editor-fit-view-btn')
    const resetCount = await resetButton.count()
    report.zoomButton = { attempted: resetCount > 0, testId: 'canvas-editor-fit-view-btn',
      accessibleName: resetCount ? await resetButton.getAttribute('aria-label') : null,
      intent: 'Original visible Reset/Fit View camera button; considered only because wheel/slider did not zoom.' }
    if (resetCount && await resetButton.isVisible()) {
      const beforeButtonViewport = await readViewport(page)
      await resetButton.click()
      await delay(1200)
      const afterButtonViewport = await readViewport(page)
      zoomButtonSucceeded = Math.abs(afterButtonViewport.zoom - beforeButtonViewport.zoom) > 0.01
      report.zoomButton.viewportBefore = beforeButtonViewport
      report.zoomButton.viewportAfter = afterButtonViewport
      report.zoomButton.zoomChanged = zoomButtonSucceeded
      report.zoomButton.result = zoomButtonSucceeded ? 'visible Reset/Fit View changed Canvas zoom'
        : 'visible Reset/Fit View did not change Canvas zoom'
    } else {
      report.zoomButton.result = 'no visible original camera button was found'
    }
    await captureScreenshot(page, 'afterZoomButton')
    const afterButtonCanvas = await readContext()
    const afterButtonCore = await readCoreSnapshot(afterButtonCanvas, { projectId: status.projectId, coreOrigin })
    report.invariants.push({ stage: 'after-camera-button', ...assertContentInvariant(beforeStateSnapshot, afterButtonCore, 'after-camera-button') })
  } else {
    report.zoomButton = { attempted: false, result: 'not needed because a real GUI gesture already changed zoom' }
  }

  const userGestureZoomSucceeded = Boolean(report.controlWheel?.zoomChanged || sliderZoomSucceeded || zoomButtonSucceeded)
  report.nativeGuiZoomVerified = userGestureZoomSucceeded
  if (!userGestureZoomSucceeded) {
    report.failureReasons.push({ action: 'native-GUI-zoom', reason: 'Control+wheel, slider pointer drag, and the visible Fit View camera button did not change Canvas zoom.' })
  }

  const currentViewport = await readViewport(page)
  const beforeSliderPoint = report.cameraControls.sliders?.[0]?.thumbCenter ?? null
  const beforeViewport = viewportBefore
  if (Math.abs(currentViewport.zoom - beforeViewport.zoom) > 0.01 && beforeSliderPoint && await slider.isVisible()) {
    const currentBox = await slider.boundingBox()
    if (currentBox) {
      const from = { x: currentBox.x + currentBox.width / 2, y: currentBox.y + currentBox.height / 2 }
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      try { await page.mouse.move(beforeSliderPoint.x, beforeSliderPoint.y, { steps: 6 }) }
      finally { await page.mouse.up() }
      try {
        await page.waitForFunction(previous => {
          const viewport = window.__LCOS_NODE_LAB__?.api?.getViewport?.()
          return viewport && Math.abs(viewport.zoom - previous) <= 0.01
        }, beforeViewport.zoom, { timeout: 5000 })
        report.restoration = { gesture: 'Native zoom slider pointer drag back to its original thumb screen coordinate.',
          attempted: true, restored: true, viewportBefore: currentViewport, viewportAfter: await readViewport(page) }
      } catch (error) {
        report.restoration = { gesture: 'Native zoom slider pointer drag back to its original thumb screen coordinate.',
          attempted: true, restored: false, reason: cleanText(error?.message || error), viewportBefore: currentViewport,
          viewportAfter: await readViewport(page) }
        report.failureReasons.push({ action: 'restore-camera', reason: report.restoration.reason })
      }
    }
  } else {
    report.restoration = { attempted: false, restored: Math.abs(currentViewport.zoom - beforeViewport.zoom) <= 0.01,
      note: 'Canvas zoom was unchanged or no slider thumb was available; no programmatic camera API was used.' }
  }
  await captureScreenshot(page, 'afterRestore')
  const afterRestoreCanvas = await readContext()
  const afterRestoreCore = await readCoreSnapshot(afterRestoreCanvas, { projectId: status.projectId, coreOrigin })
  report.invariants.push({ stage: 'after-camera-restoration', ...assertContentInvariant(beforeStateSnapshot, afterRestoreCore, 'after-camera-restoration') })

  const beforeReloadViewport = await readViewport(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(window.__LCOS_NODE_LAB__?.api), { timeout: 30000 })
  const reloadOverlay = page.locator('[data-testid="common-loading-overlay"]')
  const reloadOverlayCount = await reloadOverlay.count()
  if (reloadOverlayCount) await reloadOverlay.first().waitFor({ state: 'hidden', timeout: 30000 })
  const afterReloadViewport = await readViewport(page)
  const reloadedCanvas = await readContext()
  const afterReloadCore = await readCoreSnapshot(reloadedCanvas, { projectId: status.projectId, coreOrigin })
  report.cameraReloadPersistence = {
    owner: 'UI/ReactFlow viewport measurement; not a Core Artifact/Revision field',
    viewportBeforeReload: beforeReloadViewport,
    viewportAfterReload: afterReloadViewport,
    sameZoomAcrossReload: Math.abs(afterReloadViewport.zoom - beforeReloadViewport.zoom) <= 0.001,
  }
  report.afterReload = { viewportBeforeReload: beforeReloadViewport, viewportAfterReload: afterReloadViewport,
    loadingOverlayInitiallyPresent: reloadOverlayCount > 0,
    ...assertContentInvariant(beforeStateSnapshot, afterReloadCore, 'after-reload') }
  report.invariants.push({ stage: 'after-reload', ...report.afterReload })
  await captureScreenshot(page, 'afterReload')

  const forbiddenWrites = report.disallowedMutationRequests
  assert.equal(forbiddenWrites.length, 0, 'No node/canvas content, upload, or provider mutation may be sent during camera-only testing.')
  assert.equal(report.providerRequests.length, 0, 'No provider task may be submitted during camera-only testing.')
  assert.ok(userGestureZoomSucceeded, 'At least one real native GUI gesture must change Canvas zoom; NodeBridge zoom mutations are not an accepted substitute.')
  report.passed = true
  report.runState = 'executed; scoped Context native GUI camera gesture and Core immutability verified'
} catch (error) {
  report.failure = cleanText(error?.stack || error)
  report.failureReasons.push({ action: 'run', reason: report.failure })
  report.passed = false
  report.runState = 'executed; inspect per-gesture results and retained diagnostics'
} finally {
  if (browser) await browser.close().catch(() => {})
  await writeFile(path.join(root, 'evidence', 'native-zoom-browser.json'), JSON.stringify(report, null, 2) + '\n')
  const gestureEvidence = {
    at: report.at,
    runId,
    target: report.target,
    reactFlowZoomProps: report.reactFlowZoomProps,
    controlWheel: report.controlWheel,
    sliderDrag: report.sliderDrag,
    zoomButton: report.zoomButton,
    restoration: report.restoration,
    cameraReloadPersistence: report.cameraReloadPersistence,
    afterReload: report.afterReload,
    failureReasons: report.failureReasons,
    screenshots: report.screenshots,
  }
  await writeFile(path.join(root, 'evidence', 'native-zoom-browser-gestures.json'), JSON.stringify(gestureEvidence, null, 2) + '\n')
}

console.log(JSON.stringify({ runState: report.runState, passed: report.passed, target: report.target,
  server: report.server, loadingOverlay: report.loadingOverlay, reactFlowZoomProps: report.reactFlowZoomProps,
  controlWheel: report.controlWheel, sliderDrag: report.sliderDrag, zoomButton: report.zoomButton,
  nativeGuiZoomVerified: report.nativeGuiZoomVerified, restoration: report.restoration, afterReload: report.afterReload,
  invariants: report.invariants, disallowedMutationRequests: report.disallowedMutationRequests,
  providerRequests: report.providerRequests, apiFailures: report.apiFailures, pageErrors: report.pageErrors,
  consoleErrors: report.consoleErrors, externalHttpBlocked: report.externalHttpBlocked.length,
  webSocketsRejected: report.webSocketsRejected, failureReasons: report.failureReasons,
  screenshots: report.screenshots }, null, 2))
