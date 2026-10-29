import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'
import {
  matchesProcessIdentity,
  queryCommandLine,
  reserveLoopbackPort,
  stopExactProcess,
  waitForCommandLine,
  waitForExit,
  waitForHealth,
  waitForProcessGone,
} from './native-execution-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
const reportDir = path.join(runtimeBase, 'native-pile-collection-browser')
const runId = Date.now()
const runtimeLabel = `isolated-native-pile-collection-${runId}`
const runtimeRoot = path.join(runtimeBase, runtimeLabel)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const reportPath = path.join(reportDir, `${stamp}.json`)
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
const projectId = 'disposable-surface-core-facade'
const reservedPorts = new Set([17879, 17880, 17881, 53861])
const stable = value => JSON.stringify(value)
const clone = value => JSON.parse(JSON.stringify(value))
const canonicalize = value => Array.isArray(value) ? value.map(canonicalize)
  : isRecord(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])])) : value
const sameJson = (left, right) => stable(canonicalize(left)) === stable(canonicalize(right))
const projectPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}`
const publicCorePath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}`
const canvasNodeSelector = id => `.react-flow__node[data-id="${cssValue(id)}"]`
const pileNodeSelector = id => `[data-pile-node="${cssValue(id)}"]`
const collectionBindingPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}/spatial/bindings`
const exists = async target => { try { await stat(target); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }

function cssValue(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\a ')
}

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }

function normalizeRefs(rows) {
  return rows.map(ref => ({ type: String(ref.type), id: String(ref.id) }))
    .sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`))
}

function canvasFingerprint(canvas) {
  return { id: String(canvas.id ?? canvas.canvasId ?? ''), version: canvas.version ?? null,
    viewport: canvas.viewport ?? canvas.state?.viewport ?? null,
    nodes: (canvas.nodes ?? []).map(node => ({ id: String(node.id), type: node.type ?? null,
      data: node.data ?? null, position: node.position ?? null, parentId: node.parentId ?? node.parent_id ?? null,
      width: node.width ?? null, height: node.height ?? null, measured: node.measured ?? null }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: (canvas.edges ?? canvas.connections ?? []).map(edge => clone(edge)).sort((a, b) => String(a.id).localeCompare(String(b.id))) }
}

function withExpectedStatus(actual, expected, label) {
  assert.equal(actual, expected, `${label}: expected HTTP ${expected}, received ${actual}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const required = process.argv.includes('--run-isolated') && process.argv.includes('--native-collection-pilot')
  if (!required) {
    console.error('Not started: pass both --run-isolated and --native-collection-pilot. This runner never targets the live Canvas or historical ports.')
    process.exitCode = 2
  } else await run()
}

async function reserveSafeLoopbackPort() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const port = await reserveLoopbackPort()
    if (!reservedPorts.has(port)) return port
  }
  throw new Error('Could not reserve a safe ephemeral loopback port outside the historical ports.')
}

async function probeLoopback(port, timeoutMs = 800) {
  if (!Number.isInteger(Number(port))) return false
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: Number(port) })
    let settled = false
    const finish = listening => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(listening)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function run() {
  const report = {
    schema: 'native-pile-collection-browser-v1',
    at: new Date().toISOString(),
    passed: false,
    runtimeLabel,
    runtimeRoot,
    reportPath,
    runnerPid: process.pid,
    projectId,
    mode: 'TapNow native PILE + canonical Core Collection; one original ReactFlow, no GN2 folder and no second Flow',
    browser: { viewport: { width: 1440, height: 1000 }, engine: 'installed Chrome via repository playwright-core',
      profile: 'fresh incognito browser context', serviceWorkers: 'blocked', externalHttpAllowed: false, externalWebSocketAllowed: false },
    providerExecution: false,
    modelExecution: false,
    fixtureWrites: [],
    pileMeasurements: [],
    pileGeometryEchoes: [],
    browserWrites: [],
    blockedWrites: [],
    blockedHttp: [],
    blockedWebSockets: [],
    deniedNodeFetches: [],
    pinnedModelAttempts: [],
    apiFailures: [],
    requestFailures: [],
    pageErrors: [],
    consoleErrors: [],
    consoleWarnings: [],
    screenshots: [],
    stages: [],
    historyObservations: [],
    knownUnavailableRequests: [],
    diagnosticTelemetry: [],
    launcher: {},
  }

  const envKeysToClear = [
    'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LCOS_CODEX_AUTO_EXECUTION', 'LCOS_WORKBUDDY_AUTO_EXECUTION',
    'HUABU_HOST_URL', 'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN', 'HUABU_AGENTLET_ID',
    'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD', 'HUABU_DATA_DIR',
    'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON', 'LCOS_OLLAMA_URL',
    'LCOS_OLLAMA_EMBED_MODEL', 'LCOS_RECOVERY_TRANSPORT',
  ]
  for (const key of envKeysToClear) delete process.env[key]
  Object.assign(process.env, {
    LCOS_RECOVERY_TRANSPORT: 'none',
    LCOS_CAPTURE_STAGING_ROOT: path.join(runtimeRoot, 'capture'),
    LCOS_OCR_RUNTIME_DIR: path.join(runtimeRoot, 'ocr'),
    LCOS_OLLAMA_URL: 'http://127.0.0.1:1',
  })

  let facade, browser, context, page, launcher, launcherState = { closed: undefined }
  let coreOrigin, bootstrapAttempted = false, bootstrapFacadeClosed = false, bootstrapping = false, serverPid, uiPort, origin
  let preparedSpacePlan
  let sourceCanvasId, sourceWorkspaceId, sourceScopeId, collectionId, collectionTitle, pileNodeId
  let fixtureMaterials = [], initialCanvas, initialGraph, graphWithThree, protectedBytes = new Map(), presentationsBefore, runsBefore, otherCanvasesBefore = new Map()
  let launcherStdout = '', launcherStderr = '', stage = 'runtime'
  let runtimePrepared = false
  const allowedNodeOrigins = new Set()
  const originalFetch = globalThis.fetch.bind(globalThis)
  const bootstrapListeners = () => process._getActiveHandles().filter(handle => handle instanceof net.Server && handle.listening)
    .map(handle => handle.address()).filter(address => address && typeof address !== 'string' && address.address === '127.0.0.1')
    .map(address => `http://127.0.0.1:${address.port}`)

  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.origin === 'http://127.0.0.1:1') {
      report.pinnedModelAttempts.push({ method: init?.method ?? 'GET', path: url.pathname })
      throw new Error('Model service is deliberately pinned to an unavailable loopback port.')
    }
    const bootstrap = bootstrapping ? bootstrapListeners() : []
    if (url.protocol === 'http:' && (allowedNodeOrigins.has(url.origin)
      || bootstrap.length === 1 && bootstrap[0] === url.origin)) return originalFetch(input, init)
    report.deniedNodeFetches.push({ method: init?.method ?? 'GET', origin: url.origin, path: url.pathname })
    throw new Error('Only this run-owned loopback Core/UI origin is allowed from the runner process.')
  }

  async function coreJson(method, pathname, body) {
    assert.ok(coreOrigin, 'The fresh isolated Core origin has not been established.')
    const response = await originalFetch(coreOrigin + pathname, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error', cache: 'no-store',
    })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
    if (response.status >= 400) report.apiFailures.push({ source: 'Core', method, path: pathname, status: response.status, payload })
    return { status: response.status, payload }
  }

  async function coreValue(method, pathname, body) {
    const result = await coreJson(method, pathname, body)
    withExpectedStatus(result.status, method === 'POST' ? 201 : 200, `Core ${method} ${pathname}`)
    assert.equal(result.payload?.ok, true, `Core ${method} ${pathname}: ${stable(result.payload)}`)
    return result.payload.value
  }

  async function bootstrapFacadeCall(method, pathname, body) {
    assert.ok(facade, 'Bootstrap facade is closed.')
    const result = await facade.handle({ method, pathname, url: new URL(pathname, origin), body })
    if (Number(result?.status) >= 400) report.apiFailures.push({ source: 'bootstrap facade', method, path: pathname, status: result.status, payload: result.body })
    return { status: Number(result?.status), payload: result?.body }
  }

  async function bootstrapFacadeValue(method, pathname, body, expectedStatus = 200) {
    const result = await bootstrapFacadeCall(method, pathname, body)
    withExpectedStatus(result.status, expectedStatus, `Bootstrap facade ${method} ${pathname}`)
    assert.equal(result.payload?.code, 0, `Bootstrap facade ${method} ${pathname}: ${stable(result.payload)}`)
    assert.ok(isRecord(result.payload.data), `Bootstrap facade ${method} ${pathname} must return data.`)
    return result.payload.data
  }

  async function publicCoreValue(method, pathname, body, expectedStatus = 200) {
    const response = await fetch(origin + publicCorePath + pathname, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error', cache: 'no-store',
    })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
    if (response.status >= 400) report.apiFailures.push({ source: 'public Core proxy', method, path: pathname, status: response.status, payload })
    withExpectedStatus(response.status, expectedStatus, `Public Core ${method} ${pathname}`)
    assert.equal(payload?.ok, true, `Public Core ${method} ${pathname}: ${stable(payload)}`)
    return payload.value
  }

  async function publicCanvas() {
    const response = await fetch(origin + `/api/canvas/v1/canvases/${encodeURIComponent(sourceCanvasId)}`, { cache: 'no-store' })
    const payload = await response.json()
    withExpectedStatus(response.status, 200, 'Canvas readback')
    assert.equal(payload?.code, 0, `Canvas readback envelope: ${stable(payload)}`)
    return payload.data
  }

  async function publicBindings() {
    const value = await publicCoreValue('GET', '/spatial/bindings')
    return Array.isArray(value) ? value : value.bindings ?? []
  }

  async function assertCollectionBinding(label, expectedSpatialId) {
    const rows = (await publicBindings()).filter(binding => String(binding.projectId) === projectId
      && String(binding.canvasId) === sourceCanvasId && binding.spatialKind === 'node'
      && binding.entityType === 'collection' && String(binding.entityId) === collectionId)
    assert.equal(rows.length, 1, `${label}: one exact Core Collection -> native Node binding is required.`)
    if (expectedSpatialId !== undefined) assert.equal(String(rows[0].spatialId), String(expectedSpatialId), `${label}: binding spatialId mismatch.`)
    report.bindingObservations ??= []
    report.bindingObservations.push({ label, binding: clone(rows[0]) })
    return rows[0]
  }

  async function readGraphFromCore() { return coreValue('GET', `/projects/${encodeURIComponent(projectId)}/graph`) }

  function graphSource(graph, node, label) {
    assert.ok(node && ['text', 'image'].includes(node.type), `${label}: expected one original text/image Canvas node.`)
    const ref = node.data?.lcos_ref
    assert.ok(ref && ref.version === 1 && ref.artifactId && ref.artifactViewId && ref.revisionId,
      `${label}: Canvas node must carry its exact original Core Artifact/View/Revision reference.`)
    const artifacts = graph.artifacts.filter(row => String(row.id) === String(ref.artifactId))
    const views = graph.artifactViews.filter(row => String(row.id) === String(ref.artifactViewId))
    const revisions = graph.artifactRevisions.filter(row => String(row.id) === String(ref.revisionId))
    assert.equal(artifacts.length, 1, `${label}: exact Artifact must exist once.`)
    assert.equal(views.length, 1, `${label}: exact ArtifactView must exist once.`)
    assert.equal(revisions.length, 1, `${label}: exact ArtifactRevision must exist once.`)
    const artifact = artifacts[0], view = views[0], revision = revisions[0]
    assert.equal(String(artifact.projectId), projectId)
    assert.equal(String(view.artifactId), String(artifact.id))
    assert.equal(String(view.revisionId), String(revision.id))
    assert.equal(String(revision.artifactId), String(artifact.id))
    const files = graph.fileRecords.filter(row => String(row.id) === String(revision.fileRecordId))
    assert.equal(files.length, 1, `${label}: exact Revision must have one FileRecord.`)
    assert.equal(String(files[0].projectId), projectId)
    return { nodeId: String(node.id), type: node.type, title: String(artifact.title), artifactId: String(artifact.id),
      viewId: String(view.id), revisionId: String(revision.id), fileRecordId: String(files[0].id), mimeType: files[0].mimeType,
      ref: clone(ref) }
  }

  async function fileBytes(fileRecordId) {
    const response = await originalFetch(coreOrigin + `/projects/${encodeURIComponent(projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`, {
      headers: { Accept: '*/*' }, redirect: 'error', cache: 'no-store',
    })
    withExpectedStatus(response.status, 200, `FileRecord ${fileRecordId} bytes`)
    return Buffer.from(await response.arrayBuffer())
  }

  async function publicFileBytes(fileRecordId) {
    const response = await fetch(origin + `${publicCorePath}/file-records/${encodeURIComponent(fileRecordId)}/content`, {
      headers: { Accept: '*/*' }, redirect: 'error', cache: 'no-store',
    })
    withExpectedStatus(response.status, 200, `Public FileRecord ${fileRecordId} bytes`)
    return Buffer.from(await response.arrayBuffer())
  }

  async function screenshot(label, locator) {
    if (!page) return
    const target = path.join(visualRoot, `tapnow-native-pile-collection-${stamp}-${label}.png`)
    if (locator) await locator.screenshot({ path: target, animations: 'disabled' })
    else await page.screenshot({ path: target, fullPage: false, animations: 'disabled' })
    report.screenshots.push({ label, path: target })
  }

  function armResponse(predicate, timeout = 20000) {
    const pending = page.waitForResponse(predicate, { timeout })
    pending.catch(() => {})
    return pending
  }

  function armCanvasBatch(phase) {
    stage = phase
    return armResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/canvas/v1/canvases/${encodeURIComponent(sourceCanvasId)}/nodes:batchActions`, 30000)
  }

  function inspectNativeHistory(nodeId) {
    return page.evaluate(({ canvasId, nodeId }) => {
      const host = window.__LCOS_NODE_LAB__, api = host?.api
      if (!api || (host.currentCanvasId ?? host.canvasId) !== canvasId || typeof api.inspectNativeHistory !== 'function') {
        return { ok: false, reason: 'ORIGINAL_O8_INSPECTOR_UNAVAILABLE' }
      }
      return api.inspectNativeHistory({ canvasId, requestedCanvasId: canvasId, nodeId })
    }, { canvasId: sourceCanvasId, nodeId })
  }

  function historyPosition(history, key, nodeId) {
    const node = history?.[key]?.nodes?.find(row => String(row.id) === String(nodeId))
    return node?.position ? clone(node.position) : null
  }

  async function collectFailureDiagnostics() {
    const frameId = String(preparedSpacePlan?.frame_id ?? '')
    const targetNodeIds = [...new Set([pileNodeId, frameId].filter(Boolean).map(String))]
    const snapshot = await page.evaluate(({ canvasId, collectionId, pileNodeId, frameId, targetNodeIds }) => {
      const host = window.__LCOS_NODE_LAB__
      const api = host?.api
      const intent = window.__LCOS_NATIVE_INTENT__
      let rawNodes = [], getNodesError
      try {
        const value = api?.getNodes?.()
        if (Array.isArray(value)) rawNodes = value
      } catch (error) { getNodesError = String(error?.stack ?? error) }
      const summarizedNodes = rawNodes.map(node => {
        const data = node?.data && typeof node.data === 'object' ? node.data : {}
        return {
          id: node?.id === undefined ? null : String(node.id),
          type: typeof node?.type === 'string' ? node.type : null,
          position: node?.position && Number.isFinite(node.position.x) && Number.isFinite(node.position.y)
            ? { x: node.position.x, y: node.position.y } : null,
          parentId: node?.parentId ?? node?.parent_id ?? null,
          hidden: node?.hidden === true,
          width: Number.isFinite(node?.width) ? node.width : null,
          height: Number.isFinite(node?.height) ? node.height : null,
          measured: data && node?.measured && Number.isFinite(node.measured.width) && Number.isFinite(node.measured.height)
            ? { width: node.measured.width, height: node.measured.height } : null,
          data: {
            id: data.id ?? null,
            title: typeof data.title === 'string' ? data.title : null,
            lcos_ref: data.lcos_ref && typeof data.lcos_ref === 'object' ? data.lcos_ref : null,
            lcos_collection_ref: data.lcos_collection_ref && typeof data.lcos_collection_ref === 'object'
              ? data.lcos_collection_ref : null,
            memberIds: Array.isArray(data.memberIds) ? data.memberIds.map(String) : null,
            lcosCollectionId: data.lcosCollectionId ?? null,
            lcosCollectionNodeId: data.lcosCollectionNodeId ?? null,
          },
        }
      })
      const relevantIds = new Set(targetNodeIds)
      const relevantNodes = summarizedNodes.filter(node => relevantIds.has(node.id)
        || node.type === 'group' && (node.data.lcosCollectionId === collectionId
          || node.data.lcosCollectionNodeId === pileNodeId)
        || frameId && String(node.parentId ?? '') === frameId)
      const domNodes = [...document.querySelectorAll('.react-flow__node[data-id]')].flatMap(element => {
        const id = String(element.getAttribute('data-id') ?? '')
        const className = typeof element.className === 'string' ? element.className : ''
        const node = summarizedNodes.find(row => row.id === id)
        if (!relevantIds.has(id) && node?.type !== 'pile' && node?.type !== 'group'
          && !className.includes('node-pile') && !className.includes('node-group')) return []
        const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
        return [{ id, type: node?.type ?? null, className,
          hidden: element.hidden === true || element.getAttribute('aria-hidden') === 'true'
            || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0,
          ariaHidden: element.getAttribute('aria-hidden'),
          rect: { x: rect.x, y: rect.y, top: rect.top, right: rect.right, bottom: rect.bottom,
            width: rect.width, height: rect.height },
          inViewport: rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
            && rect.left < innerWidth && rect.top < innerHeight,
          display: style.display, visibility: style.visibility, opacity: style.opacity }]
      })
      const histories = targetNodeIds.map(nodeId => {
        if (typeof api?.inspectNativeHistory !== 'function') return { nodeId, available: false }
        try { return { nodeId, available: true,
          value: api.inspectNativeHistory({ canvasId, requestedCanvasId: canvasId, nodeId }) } }
        catch (error) { return { nodeId, available: true, error: String(error?.stack ?? error) } }
      })
      return {
        host: { present: !!host, canvasId: host?.canvasId ?? null,
          currentCanvasId: host?.currentCanvasId ?? host?.canvasId ?? null, projectId: host?.projectId ?? null,
          apiPresent: !!api, getNodesAvailable: typeof api?.getNodes === 'function',
          inspectNativeHistoryAvailable: typeof api?.inspectNativeHistory === 'function',
          nodeCount: rawNodes.length, getNodesError: getNodesError ?? null },
        canvasNodes: relevantNodes,
        domNodes,
        history: histories,
        originalWindowIntent: { present: !!intent, version: intent?.version ?? null,
          inspectNativeHistoryAvailable: typeof intent?.inspectNativeHistory === 'function',
          pendingSnapshotAvailable: false,
          pendingSnapshotNote: 'The exposed window intent surface has inspectNativeHistory but no public pending-intent snapshot reader; no internal Maps were read.' },
      }
    }, { canvasId: sourceCanvasId, collectionId, pileNodeId, frameId, targetNodeIds })
    return { capturedAt: new Date().toISOString(), preparedFrameId: frameId || null, snapshot }
  }

  async function waitForOriginalHistory(phase, nodeId, expectedCurrent, expectedUndo) {
    const before = await inspectNativeHistory(nodeId)
    assert.equal(before?.ok, true, `${phase}: original native O8 history inspector: ${stable(before)}`)
    report.historyObservations.push({ phase: `${phase}-before-settle`, current: historyPosition(before, 'currentEntry', nodeId),
      undo: historyPosition(before, 'undoTarget', nodeId), redo: historyPosition(before, 'redoTarget', nodeId),
      historySize: before.historySize, currentIndex: before.currentIndex, expectedCurrent, expectedUndo })
    await page.waitForFunction(({ canvasId, nodeId, expectedCurrent: expected, expectedUndo: undoExpected }) => {
      const api = window.__LCOS_NODE_LAB__?.api
      const history = api?.inspectNativeHistory({ canvasId, requestedCanvasId: canvasId, nodeId })
      if (!history?.ok) return false
      const position = key => history[key]?.nodes?.find(row => String(row.id) === String(nodeId))?.position
      const near = (a, b) => !b || !!a && Math.abs(a.x - b.x) < 0.03 && Math.abs(a.y - b.y) < 0.03
      return near(position('currentEntry'), expected) && near(position('undoTarget'), undoExpected)
    }, { canvasId: sourceCanvasId, nodeId, expectedCurrent, expectedUndo }, { timeout: 12000 })
    const settled = await inspectNativeHistory(nodeId)
    report.historyObservations.push({ phase: `${phase}-settled`, current: historyPosition(settled, 'currentEntry', nodeId),
      undo: historyPosition(settled, 'undoTarget', nodeId), redo: historyPosition(settled, 'redoTarget', nodeId),
      historySize: settled.historySize, currentIndex: settled.currentIndex, expectedCurrent, expectedUndo })
    return settled
  }

  async function assertPageIdentity(label) {
    assert.equal(new URL(page.url()).origin, origin)
    assert.equal(new URL(page.url()).pathname, `/canvas/${encodeURIComponent(sourceCanvasId)}`)
    assert.match(await page.title(), /TapNow|LCOS/i)
    assert.ok((await page.locator('body').innerText()).trim().length > 30)
    const overlays = page.locator('vite-error-overlay,nextjs-portal [data-nextjs-error-overlay],[data-webpack-error-overlay]')
    for (let i = 0; i < await overlays.count(); i += 1) assert.equal(await overlays.nth(i).isVisible(), false)
    assert.equal(await page.locator('.react-flow').count(), 1, 'All Collection/Pile/Group views must remain in the one original TapNow Flow.')
    report.stages.push({ label, origin, pathname: new URL(page.url()).pathname, oneOriginalReactFlow: true })
  }

  async function waitForEnabled(locator, label, timeout = 15000) {
    await locator.waitFor({ state: 'visible', timeout })
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (await locator.isEnabled().catch(() => false)) return locator
      await page.waitForTimeout(100)
    }
    throw new Error(`${label} remained disabled after ${timeout}ms of waiting for its live Core owner.`)
  }

  async function visibleCollectionShell(nodeKind) {
    const shell = page.locator(`[data-native-core-collection="${cssValue(collectionId)}"]:visible`)
    await shell.waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await shell.count(), 1, 'Only one visible TapNow Collection shell may own this exact Collection ID.')
    assert.equal(await shell.getAttribute('data-native-collection-kind'), nodeKind,
      `The visible original Collection shell must be a ${nodeKind} renderer.`)
    return shell
  }

  async function visibleAction(action, nodeKind = 'pile') {
    const shell = await visibleCollectionShell(nodeKind)
    const label = action === 'rename' ? '命名'
      : action === 'members' ? /^成员\s+(?:\d+|…)$/
        : action === 'expand' ? '展开到主画布'
          : action === 'collapse' ? '收起集合' : undefined
    assert.ok(label, `No accessible original Collection action is defined for ${action}.`)
    const locator = shell.getByRole('button', typeof label === 'string'
      ? { name: label, exact: true } : { name: label })
    assert.equal(await locator.count(), 1, `Expected one accessible ${action} button within the exact Collection shell.`)
    await waitForEnabled(locator, `Original Collection ${action} button`)
    return locator
  }

  async function closeAgentPanelIfOpen(label, required = false) {
    const close = page.getByRole('button', { name: '关闭 Agent 面板', exact: true })
    const count = await close.count()
    const visible = count > 0 && await close.first().isVisible().catch(() => false)
    if (!visible) {
      assert.equal(required, false, `${label}: expected the original local Agent panel close button to be visible.`)
      report.agentPanelClosures ??= []
      report.agentPanelClosures.push({ label, wasOpen: false, closedByOriginalAccessibleButton: false })
      return false
    }
    assert.equal(count, 1, `${label}: the local Agent overlay must have one original accessible close button.`)
    await close.click()
    await close.waitFor({ state: 'hidden', timeout: 10000 })
    report.agentPanelClosures ??= []
    report.agentPanelClosures.push({ label, wasOpen: true, closedByOriginalAccessibleButton: true, ariaLabel: '关闭 Agent 面板' })
    return true
  }

  async function visiblePileCard(id = pileNodeId) {
    const card = page.locator(pileNodeSelector(id))
    await card.waitFor({ state: 'visible', timeout: 20000 })
    assert.equal(await card.getAttribute('role'), 'button', 'The real TapNow PILE renderer must own its original accessible button.')
    assert.equal(await card.getAttribute('aria-haspopup'), 'dialog', 'The original PILE button opens TapNow gallery.')
    return card
  }

  async function visibleFolderPreviewAction(action) {
    const label = action === 'open' ? '开口预览' : action === 'close' ? '收纳预览' : undefined
    assert.ok(label, `No accessible original Folder preview action is defined for ${action}.`)
    const shell = await visibleCollectionShell('pile')
    const locator = shell.getByRole('button', { name: label, exact: true })
    assert.equal(await locator.count(), 1, `Expected one accessible Folder ${action} control within the exact Collection shell.`)
    await waitForEnabled(locator, `Original Folder ${action} preview button`)
    return locator
  }

  async function folderVisualState(pileButton) {
    return pileButton.evaluate(root => {
      const round = value => Number.isFinite(value) ? Number(value.toFixed(2)) : null
      const bounds = element => {
        const rect = element.getBoundingClientRect()
        return { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) }
      }
      const isVisible = element => {
        const rect = element.getBoundingClientRect()
        for (let current = element; current && current !== root.parentElement; current = current.parentElement) {
          const style = getComputedStyle(current)
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
        }
        return rect.width > 0 && rect.height > 0
      }
      const faceSlots = [...root.querySelectorAll('[data-native-pile-folder-node-id]')].map(element => ({
        nodeId: element.getAttribute('data-native-pile-folder-node-id'),
        folderOpen: element.getAttribute('data-native-pile-folder-open'),
        visible: isVisible(element),
        rect: bounds(element),
      }))
      const originalFolders = [...root.querySelectorAll('[data-slot="folder"][data-folder-open]')].map(element => ({
        folderOpen: element.getAttribute('data-folder-open'),
        visible: isVisible(element),
        rect: bounds(element),
      }))
      const members = [...root.querySelectorAll('[data-native-folder-member]')].map(element => {
        const style = getComputedStyle(element)
        return { nodeId: element.getAttribute('data-native-folder-member'), visible: isVisible(element),
          rect: bounds(element), opacity: round(Number(style.opacity)), transform: style.transform }
      })
      const openValues = [...new Set([...faceSlots.map(slot => slot.folderOpen),
        ...originalFolders.map(folder => folder.folderOpen)].filter(value => value !== null))].sort()
      return { faceSlots, originalFolders, members, openValues }
    })
  }

  async function sampleFolderAnimation(pileButton, durationMs = 450) {
    return pileButton.evaluate(async (root, duration) => {
      const round = value => Number.isFinite(value) ? Number(value.toFixed(2)) : null
      const read = () => {
        const isVisible = element => {
          const rect = element.getBoundingClientRect()
          for (let current = element; current && current !== root.parentElement; current = current.parentElement) {
            const style = getComputedStyle(current)
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
          }
          return rect.width > 0 && rect.height > 0
        }
        const members = [...root.querySelectorAll('[data-native-folder-member]')].map(element => {
          const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
          return { nodeId: element.getAttribute('data-native-folder-member'),
            visible: isVisible(element),
            rect: { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) },
            opacity: round(Number(style.opacity)), transform: style.transform }
        })
        const runningAnimations = root.getAnimations({ subtree: true })
          .filter(animation => animation.playState === 'running')
          .map(animation => ({ playState: animation.playState, currentTime: round(Number(animation.currentTime ?? 0)) }))
        return { at: round(performance.now()), members, runningAnimations }
      }
      const frames = []
      const startedAt = performance.now()
      await new Promise(resolve => {
        const frame = () => {
          frames.push(read())
          if (performance.now() - startedAt >= duration) resolve()
          else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      })
      return frames
    }, durationMs)
  }

  function folderLayoutChanged(left, right, threshold = 1) {
    const members = state => new Map(state.members.map(member => [String(member.nodeId), member]))
    const a = members(left), b = members(right)
    if (a.size !== b.size) return true
    for (const [nodeId, before] of a) {
      const after = b.get(nodeId)
      if (!after || before.visible !== after.visible) return true
      for (const key of ['x', 'y', 'width', 'height']) {
        if (Math.abs((before.rect[key] ?? 0) - (after.rect[key] ?? 0)) > threshold) return true
      }
      if (Math.abs((before.opacity ?? 0) - (after.opacity ?? 0)) > 0.05) return true
    }
    return false
  }

  function folderAnimationObserved(frames) {
    if (frames.some(frame => frame.runningAnimations.length > 0)) return true
    return frames.some((frame, index) => index > 0 && folderLayoutChanged(frames[index - 1], frame, 0.25))
  }

  function visibleFolderMemberIds(state) {
    return [...new Set(state.members.filter(member => member.visible && (member.opacity ?? 0) > 0.02)
      .map(member => String(member.nodeId)))].sort()
  }

  async function folderTruthSnapshot() {
    const history = []
    for (const nodeId of [pileNodeId, ...fixtureMaterials.map(source => source.nodeId)]) {
      history.push({ nodeId, value: await inspectNativeHistory(nodeId) })
    }
    const imageSource = fixtureMaterials.find(source => source.type === 'image')
    assert.ok(imageSource, 'The Folder preview needs the existing Core-backed image leaf.')
    const imageBytes = await publicFileBytes(imageSource.fileRecordId)
    assert.deepEqual(imageBytes, protectedBytes.get(imageSource.fileRecordId),
      'The original image FileRecord bytes must still match the pre-UI material snapshot.')
    return {
      canvas: clone(await publicCanvas()),
      collection: clone(await publicCoreValue('GET', `/collections/${encodeURIComponent(collectionId)}`)),
      members: clone(await publicCoreValue('GET', `/collections/${encodeURIComponent(collectionId)}/members`)),
      graph: clone(await publicCoreValue('GET', '/graph')),
      bindings: clone(await publicBindings()),
      runs: clone(await publicCoreValue('GET', '/runs')),
      presentations: clone(await publicCoreValue('GET', '/presentations')),
      imageBytes,
      history,
      requestWriteCount: report.requestWrites?.length ?? 0,
      browserWriteCount: report.browserWrites.length,
      blockedWriteCount: report.blockedWrites.length,
      knownUnavailableRequestCount: report.knownUnavailableRequests.length,
    }
  }

  async function assertFolderPresentationReadOnly(label, before) {
    const after = await folderTruthSnapshot()
    for (const key of ['canvas', 'collection', 'members', 'graph', 'bindings', 'runs', 'presentations', 'history']) {
      assert.ok(sameJson(after[key], before[key]), `${label}: Folder presentation changed ${key}.`)
    }
    assert.deepEqual(after.imageBytes, before.imageBytes, `${label}: Folder presentation changed the real image FileRecord bytes.`)
    const requestWrites = (report.requestWrites ?? []).slice(before.requestWriteCount)
      .filter(row => row.path !== '/api/events')
    const knownReadOnlyRequests = requestWrites.filter(row => {
      if (row.method !== 'POST') return false
      if (row.path === `/api/lcos/canvases/${encodeURIComponent(sourceCanvasId)}/execution:reconcile`)
        return isRecord(row.body) && Object.keys(row.body).length === 0
      if (row.path === '/api/agent-gateway/v1/conversations/suggestions/dynamic')
        return isRecord(row.body) && row.body.canvas_id === sourceCanvasId && row.body.count === 5 && row.body.mode === 'mixed'
      return false
    })
    assert.equal(knownReadOnlyRequests.length,
      report.knownUnavailableRequests.length - before.knownUnavailableRequestCount,
      `${label}: every known no-Run/suggestions request must be covered by the existing exact read-only route classification.`)
    const businessRequests = requestWrites.filter(row => !knownReadOnlyRequests.includes(row))
    const browserWrites = report.browserWrites.slice(before.browserWriteCount)
      .filter(row => !['diagnostic-telemetry', 'known-no-run-reconcile', 'known-unavailable-read-only'].includes(row.kind))
    assert.deepEqual(businessRequests, [], `${label}: Folder presentation emitted a non-diagnostic, non-read-only browser write.`)
    assert.deepEqual(browserWrites, [], `${label}: Folder presentation emitted a Core/Canvas browser write.`)
    assert.equal(report.blockedWrites.length, before.blockedWriteCount,
      `${label}: Folder presentation attempted an out-of-scope write that the route guard blocked.`)
    report.folderPresentation.actions.push({ label, coreCanvasWrites: 0, blockedWriteAttempts: 0,
      exactKnownReadOnlyRequests: clone(knownReadOnlyRequests),
      unchanged: ['Canvas', 'Core Collection', 'members', 'graph', 'bindings', 'runs', 'presentations', 'history', 'image FileRecord bytes'] })
  }

  async function waitForFolderOpenState(pileButton, expected) {
    const expectedValue = String(expected)
    const deadline = Date.now() + 12000
    let current
    while (Date.now() < deadline) {
      current = await folderVisualState(pileButton)
      if (current.faceSlots.length === 1 && current.originalFolders.length === 1
        && current.faceSlots[0].folderOpen === expectedValue
        && current.originalFolders[0].folderOpen === expectedValue) return current
      await page.waitForTimeout(50)
    }
    throw new Error(`Original Folder did not reach data-folder-open=${expectedValue}: ${stable(current)}`)
  }

  async function folderViewportGeometry(pileButton, originalFolder, toolbarButton, title) {
    const shell = await visibleCollectionShell('pile')
    const [viewport, nodeRect, leafRect, folderRect, toolbarActionRect, toolbar, dom] = await Promise.all([
      page.viewportSize(),
      page.locator(canvasNodeSelector(pileNodeId)).boundingBox(),
      pileButton.locator(`[data-native-pile-folder-node-id="${cssValue(pileNodeId)}"]`).boundingBox(),
      originalFolder.boundingBox(),
      toolbarButton.boundingBox(),
      shell.evaluate(root => {
        const visible = element => {
          const rect = element.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return false
          for (let current = element; current; current = current.parentElement) {
            const style = getComputedStyle(current)
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
          }
          return true
        }
        const buttons = [...root.querySelectorAll('button')].filter(visible).map(element => {
          const rect = element.getBoundingClientRect()
          return { label: element.getAttribute('aria-label') ?? element.innerText.trim(),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
        })
        if (!buttons.length) return { buttons, rect: null }
        const left = Math.min(...buttons.map(button => button.rect.x))
        const top = Math.min(...buttons.map(button => button.rect.y))
        const right = Math.max(...buttons.map(button => button.rect.x + button.rect.width))
        const bottom = Math.max(...buttons.map(button => button.rect.y + button.rect.height))
        return { buttons, rect: { x: left, y: top, width: right - left, height: bottom - top } }
      }),
      page.evaluate(titleText => {
        const visible = element => {
          const rect = element.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return false
          for (let current = element; current; current = current.parentElement) {
            const style = getComputedStyle(current)
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
          }
          return true
        }
        const rectOf = element => {
          const rect = element.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }
        }
        const memberRects = [...document.querySelectorAll('[data-native-folder-member]')]
          .filter(visible).map(element => ({ nodeId: element.getAttribute('data-native-folder-member'), rect: rectOf(element) }))
        const titleRects = [...document.querySelectorAll('*')]
          .filter(element => element.children.length === 0 && element.textContent?.trim() === titleText && visible(element))
          .map(element => ({ tag: element.tagName.toLowerCase(), className: typeof element.className === 'string' ? element.className : '',
            rect: rectOf(element) }))
        return { viewport: { width: innerWidth, height: innerHeight }, memberRects, titleRects }
      }, title),
    ])
    const intersects = (a, b) => !!a && !!b && a.x < b.x + b.width && a.x + a.width > b.x
      && a.y < b.y + b.height && a.y + a.height > b.y
    return { viewport, nodeRect, leafRect, originalFolderRect: folderRect,
      toolbarRect: toolbar.rect, toolbarButtons: toolbar.buttons, toolbarActionRect,
      visibleMemberRects: dom.memberRects, nativeTitleRects: dom.titleRects,
      memberToolbarOverlaps: dom.memberRects.filter(member => intersects(member.rect, toolbar.rect))
        .map(member => member.nodeId),
      memberTitleOverlaps: dom.memberRects.filter(member => dom.titleRects.some(row => intersects(member.rect, row.rect)))
        .map(member => member.nodeId),
      measuredAtViewport: dom.viewport }
  }

  async function exactPileState(canvas, expectedIds) {
    const rows = canvas.nodes.filter(node => String(node.id) === String(pileNodeId))
    assert.equal(rows.length, 1, 'The Collection must retain exactly one canonical spatial carrier.')
    const pile = rows[0]
    assert.equal(pile.type, 'pile', 'The collapsed Collection must use TapNow PILE, never a GN2/Gen1 folder card.')
    assert.deepEqual([...new Set(pile.data?.memberIds ?? [])].sort(), [...expectedIds].sort(), 'Native PILE memberIds must exactly match the existing material node IDs.')
    assert.equal(String(pile.data?.lcos_collection_ref?.collectionId), collectionId,
      'The original PILE carrier must retain the exact canonical Core Collection reference.')
    return pile
  }

  async function hitPointForNode(id) {
    return page.locator(canvasNodeSelector(id)).evaluate((element, targetId) => {
      const folderSubject = [...element.querySelectorAll('[data-native-pile-folder-node-id]')]
        .find(candidate => candidate.getAttribute('data-native-pile-folder-node-id') === targetId)
      const rect = (folderSubject ?? element).getBoundingClientRect(), candidates = []
      for (const fy of [.28, .42, .58, .72]) for (const fx of [.28, .42, .58, .72]) {
        const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy
        const hit = document.elementFromPoint(x, y)
        const node = hit?.closest('.react-flow__node')
        const outerPileButton = hit?.closest('[data-pile-node]')
        const button = hit?.closest('button')
        const blocked = hit?.closest('.nodrag,a,input,textarea,select,[role="dialog"]')
          || button && button !== outerPileButton
        if (node?.getAttribute('data-id') !== targetId || blocked) continue
        candidates.push({ x, y, hitTag: hit.tagName, hitClass: typeof hit.className === 'string' ? hit.className : '' })
      }
      return { candidates, rectSource: folderSubject ? 'native-folder-subject-DOM-bounds' : 'original-reactflow-node-DOM-bounds',
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
    }, String(id))
  }

  async function dragNodeBy(id, dx, dy) {
    const hit = await hitPointForNode(id)
    assert.ok(hit.candidates.length > 0, `A real draggable hit point is required for ${id}: ${stable(hit)}`)
    const start = hit.candidates[0]
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 14 })
    await page.mouse.up()
    return { start, hit }
  }

  try {
    await mkdir(reportDir, { recursive: true })
    await mkdir(visualRoot, { recursive: true })
    assert.equal(await exists(runtimeRoot), false, 'Never reuse an isolated runtime directory.')
    await mkdir(runtimeRoot, { recursive: true })
    runtimePrepared = true

    stage = 'isolated-bootstrap'
    uiPort = await reserveSafeLoopbackPort()
    origin = `http://127.0.0.1:${uiPort}`
    report.origin = origin
    report.uiPort = uiPort

    const bootstrapDir = path.join(runtimeRoot, 'bootstrap')
    await mkdir(bootstrapDir, { recursive: true })
    const bootstrapBundle = path.join(bootstrapDir, 'surface-core-facade.mjs')
    await buildPilotEntry('lab/pilot/surface-core-facade.ts', bootstrapBundle)
    const { startSurfaceCoreFacade } = await import(pathToFileURL(bootstrapBundle).href)
    assert.deepEqual(bootstrapListeners(), [], 'Do not adopt an unrelated pre-existing listener as the bootstrap Core.')
    bootstrapping = true
    bootstrapAttempted = true
    try { facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true }) }
    finally { bootstrapping = false }
    coreOrigin = String(facade.core.origin)
    assert.match(coreOrigin, /^http:\/\/127\.0\.0\.1:\d+$/)
    assert.notEqual(Number(new URL(coreOrigin).port), uiPort)
    assert.ok(!reservedPorts.has(Number(new URL(coreOrigin).port)), 'Bootstrap Core must not bind a historical live port.')
    allowedNodeOrigins.add(coreOrigin)
    report.bootstrap = { coreOrigin, databasePath: facade.core.databasePath, projectId, realCore: true,
      fullIntegration: true, isolatedRuntime: runtimeRoot }

    const workspaces = facade.workspaces.filter(row => String(row.projectId) === projectId && row.canvasId)
    const main = workspaces.filter(row => row.preferredSurface === 'main')
    assert.equal(main.length, 1, 'The synthetic Core fixture must declare exactly one Main Workspace.')
    sourceCanvasId = String(main[0].canvasId)
    sourceWorkspaceId = String(main[0].id)
    sourceScopeId = String(main[0].scopeId)
    assert.ok(sourceCanvasId && sourceWorkspaceId && sourceScopeId)

    const bootstrapCanvasPath = `/api/canvas/v1/canvases/${encodeURIComponent(sourceCanvasId)}`
    initialCanvas = clone(await bootstrapFacadeValue('GET', bootstrapCanvasPath))
    initialGraph = clone(await readGraphFromCore())
    const seedSources = initialCanvas.nodes.map(node => {
      try { return graphSource(initialGraph, node, `seed node ${node.id}`) } catch { return undefined }
    }).filter(Boolean)
    const seedText = seedSources.find(row => row.type === 'text')
    const seedImage = seedSources.find(row => row.type === 'image')
    assert.ok(seedText, 'Fresh Main must contain one real Core-bound text material node.')
    assert.ok(seedImage, 'Fresh Main must contain one real Core-bound image material node.')

    stage = 'third-text-through-original-lifecycle-fixture'
    const requestedThirdNodeId = `native-pile-fixture-text-${randomUUID()}`
    const thirdTitle = `Pile 合成第三文本 ${runId}`
    const thirdBody = `# ${thirdTitle}\n\n这是由现有原生文本创建生命周期建立的第三份材料夹具。\n\n它有真实 Core Artifact、Revision、FileRecord、View 与同画布 Node Binding。`
    const createOperation = { version: 1, operationId: `native-pile-fixture-${randomUUID()}`, kind: 'create', phase: 'apply' }
    const createTextResult = await bootstrapFacadeValue('POST', `${bootstrapCanvasPath}/nodes:batchActions`, {
      canvas_id: sourceCanvasId,
      created_by_role: 'user',
      actions: [{ action: 'create', creates: [{ id: requestedThirdNodeId, canvas_id: sourceCanvasId, type: 'text',
        position: { x: 960, y: 110 }, measured: { width: 320, height: 210 },
        data: { title: thirdTitle, text: thirdBody, content: thirdBody } }] }],
      lcos_operation: createOperation,
    })
    assert.equal(createTextResult.core_saved, true)
    assert.equal(createTextResult.spatial_saved, true)
    const createdLifecycleNodes = createTextResult.lifecycle_results?.flatMap(result => result.nodes ?? []) ?? []
    assert.equal(createdLifecycleNodes.length, 1, 'The original create producer must return one exact native text lifecycle receipt.')
    const thirdNodeId = String(createdLifecycleNodes[0].nodeId)
    assert.ok(thirdNodeId)
    if (createdLifecycleNodes[0].clientNodeId !== undefined) assert.equal(String(createdLifecycleNodes[0].clientNodeId), requestedThirdNodeId)
    const canvasAfterThird = clone(await bootstrapFacadeValue('GET', bootstrapCanvasPath))
    const graphAfterThird = clone(await readGraphFromCore())
    const thirdNode = canvasAfterThird.nodes.find(node => String(node.id) === thirdNodeId)
    const thirdSource = graphSource(graphAfterThird, thirdNode, 'original-native-lifecycle third text')
    assert.equal(thirdSource.type, 'text')
    assert.equal(thirdNode.data?.title, thirdTitle)
    const bindingRead = await coreValue('GET', `/projects/${encodeURIComponent(projectId)}/spatial/bindings`)
    const thirdBindings = (Array.isArray(bindingRead) ? bindingRead : bindingRead.bindings ?? []).filter(binding =>
      String(binding.canvasId) === sourceCanvasId && String(binding.spatialId) === thirdNodeId)
    assert.equal(thirdBindings.length, 1, 'The original text lifecycle must create one exact Core node ProjectionBinding.')
    assert.equal(thirdBindings[0].entityType, 'artifact')
    assert.equal(String(thirdBindings[0].entityId), thirdSource.artifactId)
    report.fixtureWrites.push({ producer: 'existing native node create/apply lifecycle -> Core text owner -> Huabu carrier/binding',
      phase: 'bootstrap-only; no GUI completion claim', canvasId: sourceCanvasId, nodeId: thirdNodeId,
      title: thirdTitle, artifactId: thirdSource.artifactId, viewId: thirdSource.viewId,
      revisionId: thirdSource.revisionId, fileRecordId: thirdSource.fileRecordId })

    stage = 'canonical-collection-and-worksite-receipt-fixture'
    graphWithThree = clone(await readGraphFromCore())
    const currentCanvas = clone(await bootstrapFacadeValue('GET', bootstrapCanvasPath))
    const materialSources = [seedText, seedImage, graphSource(graphWithThree,
      currentCanvas.nodes.find(node => String(node.id) === thirdNodeId), 'third text readback')]
    assert.equal(new Set(materialSources.map(row => row.artifactId)).size, 3, 'The PILE membership fixture needs three distinct Core Artifacts.')
    assert.equal(new Set(materialSources.map(row => row.nodeId)).size, 3, 'Each Core member must join to one distinct original Canvas NodeID.')
    protectedBytes = new Map()
    for (const source of materialSources) protectedBytes.set(source.fileRecordId, await fileBytes(source.fileRecordId))
    fixtureMaterials = materialSources.map(source => ({ ...source, byteSize: protectedBytes.get(source.fileRecordId).length }))
    collectionTitle = `TapNow Pile Collection ${runtimeLabel}`
    const memberRefs = materialSources.map(source => ({ type: 'artifact', id: source.artifactId }))
    const collectionCreated = await coreValue('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
      title: collectionTitle, members: memberRefs,
    })
    collectionId = String(collectionCreated.id)
    assert.equal(String(collectionCreated.projectId), projectId)
    const membersBefore = await coreValue('GET', `/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`)
    assert.equal(String(membersBefore.collection.id), collectionId)
    assert.equal(membersBefore.members.length, 3)
    assert.deepEqual(normalizeRefs(membersBefore.members.map(row => row.memberRef)), normalizeRefs(memberRefs))
    const assemblyCall = await bootstrapFacadeCall('POST', `/api/lcos/core/projects/${encodeURIComponent(projectId)}/assembly/apply`, {
      schemaVersion: 1, projectId,
      sourceRefs: [{ kind: 'collection', id: collectionId }],
      targetRef: { kind: 'main' },
    })
    withExpectedStatus(assemblyCall.status, 200, 'Original Assembly apply fixture')
    assert.equal(assemblyCall.payload?.ok, true, `Original Assembly apply fixture: ${stable(assemblyCall.payload)}`)
    const assemblyReceipt = assemblyCall.payload.value
    assert.ok(assemblyReceipt.results?.some(row => row.sourceRef?.kind === 'collection'
      && String(row.sourceRef.id) === collectionId && row.status === 'applied'),
    'The fixture Collection must be received through the existing Main Assembly/Core producer before it is projected.')
    report.fixtureWrites.push({ producer: 'canonical Core Collections API + original Assembly apply receipt',
      collectionId, title: collectionTitle, memberRefs, memberNodes: materialSources.map(source => source.nodeId),
      assemblyReceipt, modelExecution: false, providerExecution: false })

    stage = 'bootstrap-original-project-to-space-binding'
    const bootstrapProjection = await bootstrapFacadeValue('POST',
      `/api/lcos/canvases/${encodeURIComponent(sourceCanvasId)}/collections:project`, { collectionId })
    assert.equal(String(bootstrapProjection.canvas_id), sourceCanvasId)
    assert.equal(String(bootstrapProjection.workspace_id), sourceWorkspaceId)
    assert.equal(String(bootstrapProjection.collection_id), collectionId)
    assert.equal(bootstrapProjection.provider_execution_started, false)
    assert.equal(bootstrapProjection.node?.type, 'lcos-collection',
      'The legacy bootstrap facade must use its existing original ProjectToSpaceProjection producer, not native-mode create/repair.')
    assert.equal(String(bootstrapProjection.node?.id), String(bootstrapProjection.binding?.spatialId))
    assert.equal(bootstrapProjection.binding?.projectId, projectId)
    assert.equal(bootstrapProjection.binding?.canvasId, sourceCanvasId)
    assert.equal(bootstrapProjection.binding?.spatialKind, 'node')
    assert.equal(bootstrapProjection.binding?.entityType, 'collection')
    assert.equal(String(bootstrapProjection.binding?.entityId), collectionId)
    pileNodeId = String(bootstrapProjection.binding.spatialId)
    const bootstrapCollectionBindings = (await coreValue('GET',
      `/projects/${encodeURIComponent(projectId)}/spatial/bindings`)).filter(binding =>
      String(binding.projectId) === projectId && String(binding.canvasId) === sourceCanvasId
      && binding.spatialKind === 'node' && binding.entityType === 'collection'
      && String(binding.entityId) === collectionId)
    assert.equal(bootstrapCollectionBindings.length, 1,
      'Original ProjectToSpaceProjection must establish exactly one canonical Core carrier binding before native read-only mode starts.')
    assert.deepEqual(bootstrapCollectionBindings[0], bootstrapProjection.binding)
    report.fixtureWrites.push({ producer: 'legacy bootstrap facade -> original collectionProjection.project -> original Core ProjectionBinding / Huabu carrier',
      phase: 'bootstrap-only; creates the one canonical binding before native read-only pilot',
      collectionId, canvasId: sourceCanvasId, workspaceId: sourceWorkspaceId, pileNodeId,
      binding: bootstrapProjection.binding, bootstrapNode: bootstrapProjection.node,
      providerExecution: false })

    initialCanvas = currentCanvas
    initialGraph = graphWithThree
    presentationsBefore = clone(await coreValue('GET', `/projects/${encodeURIComponent(projectId)}/presentations`))
    runsBefore = clone(await coreValue('GET', `/projects/${encodeURIComponent(projectId)}/runs`))
    assert.deepEqual(runsBefore, [], 'The isolated fixture must not start or contain provider Runs.')
    for (const workspace of workspaces.filter(row => row.preferredSurface !== 'main')) {
      const otherCanvas = await bootstrapFacadeValue('GET', `/api/canvas/v1/canvases/${encodeURIComponent(String(workspace.canvasId))}`)
      otherCanvasesBefore.set(String(workspace.canvasId), canvasFingerprint(otherCanvas))
    }
    report.fixture = { kind: 'fresh Core project; three distinct existing Core-backed Main material nodes (image + two texts); one canonical Collection; no file copies',
      collectionId, collectionTitle, canvasId: sourceCanvasId, workspaceId: sourceWorkspaceId, scopeId: sourceScopeId,
      memberRefs, materialSources: fixtureMaterials, providerExecution: false, modelExecution: false }

    if (facade) {
      await facade.close()
      bootstrapFacadeClosed = true
      facade = undefined
      allowedNodeOrigins.delete(coreOrigin)
      report.bootstrapFacadeClosedBeforeUi = true
      report.launcher.bootstrapCoreListenerAfterClose = await probeLoopback(Number(new URL(coreOrigin).port))
      assert.equal(report.launcher.bootstrapCoreListenerAfterClose, false,
        'The fixture/bootstrap Core listener must be gone before the official UI launcher starts.')
    }

    stage = 'official-native-collection-pilot-launcher'
    launcher = spawn(process.execPath, [path.join(root, 'scripts/start-full-integration.mjs'),
      `--runtime-label=${runtimeLabel}`, `--port=${uiPort}`, '--native-collection-pilot'], {
      cwd: root,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        LCOS_RECOVERY_TRANSPORT: 'none', LCOS_CAPTURE_STAGING_ROOT: path.join(runtimeRoot, 'capture'),
        LCOS_OCR_RUNTIME_DIR: path.join(runtimeRoot, 'ocr'), LCOS_OLLAMA_URL: 'http://127.0.0.1:1' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    launcher.stdout.setEncoding('utf8').on('data', chunk => { launcherStdout = (launcherStdout + chunk).slice(-18000) })
    launcher.stderr.setEncoding('utf8').on('data', chunk => { launcherStderr = (launcherStderr + chunk).slice(-18000) })
    launcher.once('close', (code, signal) => { launcherState.closed = { code, signal } })
    const launcherPath = path.join(root, 'scripts/start-full-integration.mjs')
    const launcherCommandLine = await waitForCommandLine(launcher.pid,
      line => matchesProcessIdentity(line, launcherPath, runtimeLabel, uiPort), launcherState)
    Object.assign(report.launcher, { runtimeLabel, launcherPid: launcher.pid, launcherCommandLine })
    allowedNodeOrigins.add(origin)
    const health = await waitForHealth(origin, launcherState, () => launcherStdout + launcherStderr)
    assert.equal(health.realCoreConnected, true)
    assert.equal(health.cloudBackendConnected, false)
    assert.equal(health.profile, 'original-tapnow-full-integration-in-progress')
    serverPid = Number(health.pid)
    assert.ok(Number.isInteger(serverPid) && serverPid > 0)
    const serverPath = path.join(root, 'lab/server.mjs')
    const serverCommandLine = await waitForCommandLine(serverPid,
      line => matchesProcessIdentity(line, serverPath, runtimeLabel, uiPort), launcherState)
    report.launcher.serverPid = serverPid
    report.launcher.serverCommandLine = serverCommandLine
    report.launcher.health = { pid: health.pid, profile: health.profile, realCoreConnected: health.realCoreConnected,
      cloudBackendConnected: health.cloudBackendConnected }

    stage = 'native-pile-read-existing-binding'
    const projectionPath = `/api/lcos/canvases/${encodeURIComponent(sourceCanvasId)}/collections/${encodeURIComponent(collectionId)}/projection`
    const projectResponse = await fetch(origin + projectionPath, { cache: 'no-store', redirect: 'error' })
    const projectPayload = await projectResponse.json()
    withExpectedStatus(projectResponse.status, 200, 'Native Collection existing-binding read projection')
    assert.equal(projectPayload?.code, 0, `Native Collection existing-binding projection: ${stable(projectPayload)}`)
    const projected = projectPayload.data
    assert.equal(String(projected.collection_id), collectionId)
    assert.equal(String(projected.canvas_id), sourceCanvasId)
    assert.equal(String(projected.binding?.spatialId), pileNodeId,
      'Native mode must read the exact original Core binding; it may not mint or repair a second carrier.')
    assert.deepEqual(projected.binding, bootstrapProjection.binding,
      'The read-only native PILE projection must preserve the original ProjectToSpaceProjection binding exactly.')
    assert.equal(String(projected.node?.id), pileNodeId)
    assert.equal(projected.node?.type, 'pile', `Native pilot projection must return TapNow PILE, not a GN2 folder: ${stable(projected.node)}`)
    report.fixtureReads ??= []
    report.fixtureReads.push({ producer: 'nativeCollectionPilot GET /collections/:id/projection -> exact existing Core binding -> TapNow PILE DTO',
      phase: 'read-only; native-mode POST collections:project is deliberately not used',
      collectionId, canvasId: sourceCanvasId, pileNodeId, binding: projected.binding, node: projected.node })

    const canvasAfterProjection = clone(await publicCanvas())
    const expectedNodeIds = fixtureMaterials.map(source => source.nodeId)
    const carrier = await exactPileState(canvasAfterProjection, expectedNodeIds)
    const graphAfterProjection = clone(await publicCoreValue('GET', '/graph'))
    const collectionBinding = await assertCollectionBinding('after-native-projector', pileNodeId)
    const sourceBindings = (await publicBindings()).filter(binding => String(binding.projectId) === projectId
      && String(binding.canvasId) === sourceCanvasId && binding.spatialKind === 'node'
      && fixtureMaterials.some(source => String(binding.spatialId) === source.nodeId))
      .sort((a, b) => String(a.spatialId).localeCompare(String(b.spatialId)))
    assert.equal(sourceBindings.length, fixtureMaterials.length, 'Each material node must retain its exact Core ProjectionBinding.')
    const currentMemberRead = await publicCoreValue('GET', `/collections/${encodeURIComponent(collectionId)}/members`)
    assert.deepEqual(normalizeRefs(currentMemberRead.members.map(row => row.memberRef)),
      normalizeRefs(fixtureMaterials.map(source => ({ type: 'artifact', id: source.artifactId }))))
    report.beforeGui = { canvas: clone(canvasAfterProjection), carrier: clone(carrier),
      collection: currentMemberRead.collection, members: currentMemberRead.members, binding: collectionBinding,
      graphCounts: { artifacts: graphAfterProjection.artifacts.length, revisions: graphAfterProjection.artifactRevisions.length,
        views: graphAfterProjection.artifactViews.length, files: graphAfterProjection.fileRecords.length } }

    const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: report.browser.viewport, locale: 'zh-CN',
      serviceWorkers: 'block', reducedMotion: 'no-preference' })
    const allowedMemberArtifactIds = new Set(fixtureMaterials.map(source => source.artifactId))
    const allowedSpatialIds = new Set([pileNodeId, ...fixtureMaterials.map(source => source.nodeId)])
    const exactMemberPath = `${publicCorePath}/collections/${encodeURIComponent(collectionId)}/members`
    const exactTitlePath = `${publicCorePath}/collections/${encodeURIComponent(collectionId)}`
    const exactBatchPath = `/api/canvas/v1/canvases/${encodeURIComponent(sourceCanvasId)}/nodes:batchActions`
    const exactSpacePreparePath = `/api/lcos/canvases/${encodeURIComponent(sourceCanvasId)}/collections/${encodeURIComponent(collectionId)}/space:prepare`
    await context.route('**/*', async route => {
      try {
        const request = route.request(), url = new URL(request.url()), method = request.method().toUpperCase()
        if (url.protocol === 'data:' || url.protocol === 'blob:') { await route.continue(); return }
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
          report.blockedHttp.push({ method, origin: url.origin, path: url.pathname })
          await route.abort('blockedbyclient')
          return
        }
        if (method === 'GET' && url.pathname === exactSpacePreparePath && stage === 'expand') {
          const response = await route.fetch()
          const text = await response.text()
          let payload
          try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
          const plan = payload?.data
          const frameId = String(plan?.frame_id ?? '')
          const memberNodeIds = fixtureMaterials.map(source => source.nodeId).sort()
          const canvasAtPrepare = await publicCanvas()
          const structurallyOwned = response.status() === 200 && payload?.code === 0 && isRecord(plan)
            && plan.project_id === projectId && plan.canvas_id === sourceCanvasId && plan.workspace_id === sourceWorkspaceId
            && plan.collection_id === collectionId && plan.collection_node_id === pileNodeId
            && frameId.length > 0 && plan.committed === false && plan.provider_execution_started === false
            && Number.isSafeInteger(plan.source_version) && plan.source_version === canvasAtPrepare.version
            && !canvasAtPrepare.nodes.some(node => String(node.id) === frameId)
            && Array.isArray(plan.node_ids) && stable([...plan.node_ids].map(String).sort()) === stable(memberNodeIds)
            && Array.isArray(plan.before_nodes) && stable(plan.before_nodes.map(node => String(node.id)).sort()) === stable(memberNodeIds)
            && Array.isArray(plan.after_nodes)
            && stable(plan.after_nodes.map(node => String(node.id)).sort()) === stable([...memberNodeIds, frameId].sort())
          report.spacePrepareReads ??= []
          report.spacePrepareReads.push({ status: response.status(), plan: isRecord(plan) ? clone(plan) : payload,
            exactOwner: structurallyOwned, frameId })
          if (structurallyOwned) {
            preparedSpacePlan = clone(plan)
            allowedSpatialIds.add(frameId)
          }
          await route.fulfill({ response, body: text })
          return
        }
        if (['GET', 'HEAD', 'OPTIONS'].includes(method)) { await route.continue(); return }

        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        const accept = (kind, reason) => {
          report.browserWrites.push({ stage, kind, method, path: url.pathname, body, reason })
          return route.continue()
        }
        const block = reason => {
          const item = { stage, method, path: url.pathname, body, reason }
          report.blockedWrites.push(item)
          return route.abort('blockedbyclient')
        }
        if (method === 'POST' && url.pathname === exactBatchPath && isRecord(body)) {
          const expectedRevisions = Object.fromEntries(fixtureMaterials.filter(source => source.type === 'text')
            .map(source => [source.nodeId, source.revisionId]))
          const actualRevisions = isRecord(body.lcos_expected_revisions) ? body.lcos_expected_revisions : undefined
          const revisionKeys = actualRevisions ? Object.keys(actualRevisions).sort() : []
          const update = body.actions?.length === 1 && body.actions[0]?.action === 'update'
            && body.actions[0]?.updates?.length === 1 ? body.actions[0].updates[0] : undefined
          const measured = update?.measured
          const exactKeys = (value, expected) => isRecord(value)
            && stable(Object.keys(value).sort()) === stable([...expected].sort())
          const exactPileMeasurement = stage !== 'runtime' && body.canvas_id === sourceCanvasId
            && body.created_by_role === 'user'
            && Array.isArray(body.actions) && body.actions.length === 1
            && exactKeys(body, ['canvas_id', 'actions', 'created_by_role', 'lcos_expected_revisions'])
            && exactKeys(body.actions[0], ['action', 'updates'])
            && exactKeys(update, ['id', 'measured']) && String(update.id) === pileNodeId
            && exactKeys(measured, ['width', 'height'])
            && Number.isFinite(measured.width) && measured.width > 0
            && Number.isFinite(measured.height) && measured.height > 0
            && actualRevisions !== undefined
            && stable(revisionKeys) === stable(Object.keys(expectedRevisions).sort())
            && revisionKeys.every(nodeId => actualRevisions[nodeId] === expectedRevisions[nodeId])
          if (exactPileMeasurement) {
            const receipt = { stage, nodeId: pileNodeId, measured: clone(measured), expectedRevisions: clone(actualRevisions), body: clone(body) }
            report.pileMeasurements.push(receipt)
            await accept('native-pile-measurement', 'Exact original ReactFlow measured-size receipt for the owned PILE only; no data, position, parent, membership, or other node fields.')
            return
          }
          const pileUpdates = Array.isArray(body.actions) ? body.actions.flatMap(action =>
            Array.isArray(action?.updates) ? action.updates.filter(item => String(item?.id) === pileNodeId) : []) : []
          if (pileUpdates.length > 0 && !['move', 'undo', 'redo'].includes(stage)) {
            const currentCanvas = await publicCanvas()
            const persistedPileRows = currentCanvas.nodes.filter(node => String(node.id) === pileNodeId && node.type === 'pile')
            const echoUpdate = body.actions.length === 1 && body.actions[0]?.action === 'update'
              && body.actions[0]?.updates?.length === 1 ? body.actions[0].updates[0] : undefined
            const echoMeasured = echoUpdate?.measured
            const exactPileGeometryEcho = body.canvas_id === sourceCanvasId && body.created_by_role === 'user'
              && Array.isArray(body.actions) && body.actions.length === 1
              && exactKeys(body, ['canvas_id', 'actions', 'created_by_role', 'lcos_expected_revisions'])
              && exactKeys(body.actions[0], ['action', 'updates'])
              && exactKeys(echoUpdate, ['id', 'type', 'data', 'position', 'measured'])
              && String(echoUpdate.id) === pileNodeId && echoUpdate.type === 'pile'
              && persistedPileRows.length === 1
              && sameJson(echoUpdate.data, persistedPileRows[0].data)
              && sameJson(echoUpdate.position, persistedPileRows[0].position)
              && isRecord(echoMeasured) && exactKeys(echoMeasured, ['width', 'height'])
              && Number.isFinite(echoMeasured.width) && echoMeasured.width > 0
              && Number.isFinite(echoMeasured.height) && echoMeasured.height > 0
              && actualRevisions !== undefined
              && stable(revisionKeys) === stable(Object.keys(expectedRevisions).sort())
              && revisionKeys.every(nodeId => actualRevisions[nodeId] === expectedRevisions[nodeId])
            if (exactPileGeometryEcho) {
              report.pileGeometryEchoes.push({ stage, nodeId: pileNodeId, facadeCanvasVersion: currentCanvas.version ?? null,
                persistedType: persistedPileRows[0].type, persistedPosition: clone(persistedPileRows[0].position),
                persistedData: clone(persistedPileRows[0].data), measured: clone(echoMeasured), body: clone(body) })
              await accept('native-pile-geometry-echo',
                'Exact single-node original serializer echo: existing facade PILE type/data and persisted position are unchanged; only positive finite measured dimensions are refreshed.')
              return
            }
            await block('PILE update was not an exact Core-fact geometry echo at its persisted position; no parent, membership, data or spatial change is authorized outside user move/undo/redo.')
            return
          }
          const hasPileMeasurement = pileUpdates.some(item => Object.hasOwn(item, 'measured'))
          if (hasPileMeasurement && !['move', 'undo', 'redo'].includes(stage)) {
            await block('PILE measurement was not the exact one-node measured-only receipt or exact existing-geometry echo.')
            return
          }
        }
        if (method === 'PATCH' && url.pathname === exactTitlePath && stage === 'original-pile-core-title-rename'
          && isRecord(body) && Object.keys(body).every(key => key === 'title') && typeof body.title === 'string' && body.title.trim()) {
          await accept('collection-title', 'Exact Core Collection title edit from the original PILE action.')
          return
        }
        if ((method === 'POST' || method === 'DELETE') && url.pathname === exactMemberPath
          && ['original-pile-core-membership-remove-add', 'membership-add'].includes(stage) && isRecord(body)
          && Object.keys(body).every(key => ['memberId', 'memberType', 'origin'].includes(key))
          && body.memberType === 'artifact' && allowedMemberArtifactIds.has(String(body.memberId))) {
          await accept(method === 'POST' ? 'collection-member-add' : 'collection-member-remove',
            'Exact Core membership edit for one of this fixture’s existing Artifact members.')
          return
        }
        if (method === 'POST' && url.pathname === exactBatchPath
          && ['original-pile-core-membership-remove-add', 'membership-add', 'expand', 'collapse', 'move', 'undo', 'redo'].includes(stage)
          && isRecord(body) && body.canvas_id === sourceCanvasId && Array.isArray(body.actions) && body.actions.length > 0) {
          const touched = body.actions.flatMap(action => [
            ...(Array.isArray(action?.updates) ? action.updates.map(item => String(item.id)) : []),
            ...(Array.isArray(action?.creates) ? action.creates.map(item => String(item.id)) : []),
            ...(Array.isArray(action?.nodeIds) ? action.nodeIds.map(String) : []),
            ...(Array.isArray(action?.deletes) ? action.deletes.map(item => String(item.id ?? item)) : []),
          ])
          const confined = touched.length > 0 && touched.every(id => allowedSpatialIds.has(id))
          if (!confined) { await block('Canvas batch escapes the exact native PILE/fixture material IDs.'); return }
          await accept('native-canvas-batch', 'Only fixture PILE and exact fixture material spatial IDs are in scope.')
          return
        }
        if (method === 'POST' && url.pathname === '/api/agent-gateway/v1/conversations/suggestions/dynamic'
          && isRecord(body) && body.canvas_id === sourceCanvasId && body.count === 5 && body.mode === 'mixed') {
          report.knownUnavailableRequests.push({ method, path: url.pathname, reason: 'Known read-only suggestions route; its existing offline 501 is recorded, not treated as a Collection capability.' })
          await accept('known-unavailable-read-only', 'Exact known offline dynamic-suggestions request.')
          return
        }
        if (method === 'POST' && url.pathname === `/api/lcos/canvases/${encodeURIComponent(sourceCanvasId)}/execution:reconcile`
          && isRecord(body) && Object.keys(body).length === 0) {
          report.knownUnavailableRequests.push({ method, path: url.pathname, reason: 'Known no-Run projection reconciliation only.' })
          await accept('known-no-run-reconcile', 'Exact empty read-only reconciliation request; no Run exists.')
          return
        }
        if (method === 'POST' && url.pathname === '/api/events') {
          const knownKinds = new Set(['diagnostics-installed', 'remote-fetch-attempt', 'remote-fetch-blocked', 'http-failed',
            'fetch-failed', 'csp-blocked', 'action-not-connected', 'request-rejected', 'page-error'])
          if (body?.source === 'renderer' && knownKinds.has(body.kind)) {
            report.diagnosticTelemetry.push(body.kind)
            await accept('diagnostic-telemetry', 'Known renderer diagnostics; no business mutation.')
            return
          }
        }
        await block('Browser write is not an explicitly allowlisted native Collection/Pile operation.')
      } catch (error) {
        report.routeErrors ??= []
        report.routeErrors.push(String(error.stack ?? error))
        try { await route.abort('failed') } catch { /* response already settled */ }
      }
    })
    if (typeof context.routeWebSocket === 'function') {
      await context.routeWebSocket('**/*', async socketRoute => {
        const url = new URL(socketRoute.url())
        const expectedProtocol = new URL(origin).protocol === 'https:' ? 'wss:' : 'ws:'
        if (url.protocol === expectedProtocol && url.host === new URL(origin).host) { await socketRoute.connect(); return }
        report.blockedWebSockets.push({ address: `${url.origin}${url.pathname}`, reason: 'off-origin WebSocket blocked' })
        await socketRoute.close({ code: 1008, reason: 'isolated native Collection runner' })
      })
    } else report.browser.webSocketInterception = 'routeWebSocket unavailable; page websocket events still recorded'
    page = await context.newPage()
    report.browser.reducedMotionPreference = await page.evaluate(() =>
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'no-preference')
    assert.equal(report.browser.reducedMotionPreference, 'no-preference',
      'Folder animation validation must run with reduced motion explicitly disabled for this isolated browser context.')
    page.on('pageerror', error => report.pageErrors.push(String(error.stack ?? error.message).slice(0, 3500)))
    page.on('console', message => {
      if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 1800))
      else if (message.type() === 'warning' || message.type() === 'warn') report.consoleWarnings.push(message.text().slice(0, 1500))
    })
    page.on('requestfailed', request => report.requestFailures.push({ method: request.method(), path: new URL(request.url()).pathname,
      error: request.failure()?.errorText ?? 'request failed' }))
    page.on('request', request => {
      if (request.method() !== 'GET') {
        let body
        try { body = request.postDataJSON() } catch { body = request.postData()?.slice(0, 2000) }
        report.requestWrites ??= []
        report.requestWrites.push({ stage, method: request.method(), path: new URL(request.url()).pathname, body })
      }
    })
    page.on('response', response => {
      const url = new URL(response.url())
      if (url.origin === origin && response.status() >= 400) report.apiFailures.push({ method: response.request().method(), path: url.pathname, status: response.status() })
    })

    stage = 'original-main-canvas-pile-face-and-gallery'
    await page.goto(origin + `/canvas/${encodeURIComponent(sourceCanvasId)}`, { waitUntil: 'domcontentloaded' })
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 })
    await page.locator(canvasNodeSelector(pileNodeId)).waitFor({ state: 'visible', timeout: 20000 })
    await closeAgentPanelIfOpen('initial-canvas-load', true)
    let canvas = await publicCanvas()
    let pile = await exactPileState(canvas, expectedNodeIds)
    await assertPageIdentity('initial-original-canvas')
    let pileButton = await visiblePileCard()
    report.originalPile = { selector: pileNodeSelector(pileNodeId), role: 'button', ariaHaspopup: 'dialog',
      visible: true, carrier: clone(pile), memberNodeIds: expectedNodeIds }
    await screenshot('01-original-pile-card', pileButton)

    stage = 'original-main-canvas-folder-preview'
    const imageSource = fixtureMaterials.find(source => source.type === 'image')
    assert.ok(imageSource && /^image\//i.test(imageSource.mimeType),
      'The Folder face needs the existing Core-backed image leaf with a real image MIME type.')
    assert.ok(imageSource.byteSize > 0 && protectedBytes.get(imageSource.fileRecordId)?.length === imageSource.byteSize,
      'The Folder image leaf must reference the existing non-empty Core FileRecord bytes.')
    const folderLeaf = pileButton.locator(`[data-native-pile-folder-node-id="${cssValue(pileNodeId)}"]`)
    await folderLeaf.waitFor({ state: 'visible', timeout: 12000 })
    assert.equal(await folderLeaf.count(), 1, 'The exact original PILE node must own one native Folder leaf slot.')
    const originalFolder = folderLeaf.locator('[data-slot="folder"][data-folder-open]')
    await originalFolder.waitFor({ state: 'visible', timeout: 12000 })
    assert.equal(await originalFolder.count(), 1, 'The PILE face must directly consume one original Folder renderer.')
    let folderState = await folderVisualState(pileButton)
    assert.equal(folderState.faceSlots.length, 1)
    assert.equal(folderState.faceSlots[0].nodeId, pileNodeId)
    assert.equal(folderState.faceSlots[0].folderOpen, 'false')
    assert.equal(folderState.originalFolders.length, 1)
    assert.equal(folderState.originalFolders[0].folderOpen, 'false')
    assert.deepEqual(folderState.openValues, ['false'])

    const imagePreview = pileButton.locator(`[data-native-folder-member="${cssValue(imageSource.nodeId)}"]:visible`)
    await page.waitForFunction(nodeId => [...document.querySelectorAll('[data-native-folder-member]')]
      .filter(element => element.getAttribute('data-native-folder-member') === nodeId)
      .some(element => {
        const image = element.matches('img') ? element : element.querySelector('img')
        return !!image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
      }), imageSource.nodeId, { timeout: 15000 })
    await imagePreview.first().waitFor({ state: 'visible', timeout: 10000 })
    const decodedCover = await imagePreview.first().evaluate(element => {
      const image = element.matches('img') ? element : element.querySelector('img')
      if (!image) return { found: false }
      const url = new URL(image.currentSrc || image.src, location.href)
      return { found: true, complete: image.complete, naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight, protocol: url.protocol, origin: url.origin,
        pathname: url.protocol === 'data:' ? 'inline-image' : url.pathname }
    })
    assert.equal(decodedCover.found, true, 'The exact real Core image member must render an actual image element in the Folder face.')
    assert.equal(decodedCover.complete, true)
    assert.ok(decodedCover.naturalWidth > 0 && decodedCover.naturalHeight > 0,
      `The Folder image leaf must decode real image pixels: ${stable(decodedCover)}`)
    const folderTruth = await folderTruthSnapshot()
    assert.deepEqual(folderTruth.imageBytes, protectedBytes.get(imageSource.fileRecordId),
      'The visible Folder cover must still map to the original Core image FileRecord bytes.')
    report.folderPresentation = { folderNodeId: pileNodeId, originalFolderSlot: true,
      exactCoreImageMember: { nodeId: imageSource.nodeId, artifactId: imageSource.artifactId,
        fileRecordId: imageSource.fileRecordId, mimeType: imageSource.mimeType,
        byteSize: imageSource.byteSize, decoded: decodedCover }, actions: [] }

    const beforeHoverVisual = folderState
    stage = 'folder-hover-fanout'
    await pileButton.hover()
    const hoverFrames = await sampleFolderAnimation(pileButton)
    const hoveredVisual = await folderVisualState(pileButton)
    assert.equal(hoveredVisual.faceSlots[0]?.folderOpen, 'false', 'Hover fan-out must not open or mutate the original Folder.')
    assert.deepEqual(visibleFolderMemberIds(hoveredVisual), [...expectedNodeIds].sort(),
      'Hover fan-out must expose exactly the original three Folder leaf node IDs.')
    assert.ok(folderLayoutChanged(beforeHoverVisual, hoveredVisual),
      'Hover must move or reveal original Folder leaf previews in the rendered card.')
    assert.ok(folderAnimationObserved(hoverFrames),
      `Hover fan-out must animate across sampled browser frames: ${stable(hoverFrames.slice(0, 3))}`)
    await assertFolderPresentationReadOnly('hover-fanout', folderTruth)
    report.folderPresentation.hoverFanout = { visibleMemberNodeIds: visibleFolderMemberIds(hoveredVisual),
      sampledFrames: hoverFrames.length, animationObserved: true, layoutChanged: true }
    await screenshot('01a-folder-hover-fanout')

    stage = 'folder-open-preview'
    const openFolderButton = await visibleFolderPreviewAction('open')
    const beforeOpenTruth = await folderTruthSnapshot()
    const openButtonLabel = '开口预览'
    await openFolderButton.click()
    const openFrames = await sampleFolderAnimation(pileButton)
    folderState = await waitForFolderOpenState(pileButton, true)
    assert.deepEqual(visibleFolderMemberIds(folderState), [...expectedNodeIds].sort(),
      'The opened Folder preview must render exactly the three original leaf node IDs.')
    assert.ok(folderAnimationObserved(openFrames),
      `Explicit Folder opening must animate across sampled browser frames: ${stable(openFrames.slice(0, 3))}`)
    assert.ok(folderLayoutChanged(hoveredVisual, folderState), 'Explicit opening must visibly change the Folder preview layout.')
    await assertFolderPresentationReadOnly('click-open-preview', beforeOpenTruth)
    const closeFolderButton = await visibleFolderPreviewAction('close')
    const folderGeometry = await folderViewportGeometry(pileButton, originalFolder, closeFolderButton, collectionTitle)
    report.folderPresentation.openPreview = { button: openButtonLabel, folderOpen: true,
      visibleMemberNodeIds: visibleFolderMemberIds(folderState), sampledFrames: openFrames.length,
      animationObserved: true, fullViewportGeometry: folderGeometry }
    await screenshot('01b-folder-open-preview')

    stage = 'folder-close-preview'
    const beforeCloseTruth = await folderTruthSnapshot()
    const closeButtonLabel = '收纳预览'
    await closeFolderButton.click()
    const closeFrames = await sampleFolderAnimation(pileButton)
    folderState = await waitForFolderOpenState(pileButton, false)
    assert.ok(folderAnimationObserved(closeFrames),
      `Explicit Folder closing must animate across sampled browser frames: ${stable(closeFrames.slice(0, 3))}`)
    assert.ok(folderLayoutChanged(hoveredVisual, folderState), 'Explicit closing must visibly change the Folder preview layout.')
    await assertFolderPresentationReadOnly('click-close-preview', beforeCloseTruth)
    report.folderPresentation.closePreview = { button: closeButtonLabel, folderOpen: false,
      sampledFrames: closeFrames.length, animationObserved: true }
    await screenshot('01c-folder-closed-preview')

    await pileButton.click()
    const gallery = page.locator('[role="dialog"][data-pile-gallery-phase="open"]')
    await gallery.waitFor({ state: 'visible', timeout: 15000 })
    const galleryIds = await gallery.locator('[data-pile-gallery-item]').evaluateAll(elements => elements.map(element => element.getAttribute('data-pile-gallery-item')).filter(Boolean).sort())
    assert.deepEqual(galleryIds, [...expectedNodeIds].sort(), 'The original TapNow Pile gallery must render the exact three Core-backed member nodes.')
    report.originalGallery = { selector: '[role="dialog"][data-pile-gallery-phase="open"]', memberSelector: '[data-pile-gallery-item=<nodeId>]', memberNodeIds: galleryIds }
    await screenshot('02-original-pile-gallery', gallery)
    await page.keyboard.press('Escape')
    await gallery.waitFor({ state: 'hidden', timeout: 12000 })

    stage = 'original-pile-core-title-rename'
    pileButton = await visiblePileCard()
    await pileButton.hover()
    const renameAction = await visibleAction('rename')
    const titlePost = armResponse(response => response.request().method() === 'PATCH'
      && new URL(response.url()).pathname === `${publicCorePath}/collections/${encodeURIComponent(collectionId)}`, 20000)
    const titleBatchCountBefore = report.browserWrites.filter(row => row.kind === 'native-canvas-batch').length
    const titleBlockedCountBefore = report.blockedWrites.length
    await renameAction.click()
    const titleInput = page.getByRole('textbox', { name: '集合名称', exact: true })
    await titleInput.waitFor({ state: 'visible', timeout: 10000 })
    const renamedTitle = `TapNow Collection 已命名 ${runId}`
    await titleInput.fill(renamedTitle)
    const renameSave = page.getByRole('button', { name: '保存集合名称', exact: true })
    await renameSave.click()
    const titleResponse = await titlePost
    withExpectedStatus(titleResponse.status(), 200, 'Original Collection rename producer')
    assert.equal(report.browserWrites.filter(row => row.kind === 'native-canvas-batch').length, titleBatchCountBefore,
      'Collection metadata rename must not write Canvas/O8 batch geometry.')
    assert.equal(report.blockedWrites.length, titleBlockedCountBefore,
      'Collection metadata rename must not attempt an out-of-scope Canvas or unrelated write.')
    await titleInput.waitFor({ state: 'hidden', timeout: 10000 })
    const readAfterRename = await publicCoreValue('GET', `/collections/${encodeURIComponent(collectionId)}`)
    assert.equal(readAfterRename.title, renamedTitle)
    const memberReadAfterRename = await publicCoreValue('GET', `/collections/${encodeURIComponent(collectionId)}/members`)
    assert.deepEqual(normalizeRefs(memberReadAfterRename.members.map(row => row.memberRef)),
      normalizeRefs(fixtureMaterials.map(source => ({ type: 'artifact', id: source.artifactId }))))
    report.titleRename = { userAction: 'original PILE toolbar → native Collection rename form → 保存集合名称',
      method: titleResponse.request().method(), path: new URL(titleResponse.url()).pathname, status: titleResponse.status(),
      title: readAfterRename.title, membersUnchanged: true }
    await screenshot('03-after-core-title-rename', pileButton)

    stage = 'original-pile-core-membership-remove-add'
    pileButton = await visiblePileCard()
    await pileButton.hover()
    const membersAction = await visibleAction('members')
    await membersAction.click()
    const membersPanel = page.locator('[data-native-collection-members]')
    await membersPanel.waitFor({ state: 'visible', timeout: 12000 })
    const panelCollectionId = await membersPanel.getAttribute('data-native-collection-members')
    assert.equal(panelCollectionId, collectionId, 'The visible membership panel must be owned by this exact Core Collection.')
    await screenshot('03a-original-collection-members-panel', membersPanel)
    const removeSource = fixtureMaterials.find(source => source.type === 'text' && source.title === thirdTitle)
    assert.ok(removeSource, 'The synthetic third text is the exact selected member for the one remove/add roundtrip.')
    const removeMember = membersPanel.getByRole('button', { name: `移出成员：${removeSource.artifactId}`, exact: true })
    await removeMember.waitFor({ state: 'visible', timeout: 10000 })
    const memberPath = `${publicCorePath}/collections/${encodeURIComponent(collectionId)}/members`
    const deleteResponsePromise = armResponse(response => response.request().method() === 'DELETE'
      && new URL(response.url()).pathname === memberPath, 20000)
    await removeMember.click()
    const removeResponse = await deleteResponsePromise
    withExpectedStatus(removeResponse.status(), 200, 'Original member removal')
    const afterRemove = await publicCoreValue('GET', `/collections/${encodeURIComponent(collectionId)}/members`)
    const refsAfterRemove = normalizeRefs(afterRemove.members.map(row => row.memberRef))
    assert.deepEqual(refsAfterRemove, normalizeRefs(fixtureMaterials.filter(source => source.artifactId !== removeSource.artifactId)
      .map(source => ({ type: 'artifact', id: source.artifactId }))))
    const removeCanvas = await publicCanvas()
    const removePile = await exactPileState(removeCanvas,
      fixtureMaterials.filter(source => source.artifactId !== removeSource.artifactId).map(source => source.nodeId))
    const removeNode = removeCanvas.nodes.find(node => String(node.id) === removeSource.nodeId)
    assert.ok(removeNode && removeNode.type === 'text', 'Removing membership keeps the original bound text node; no Artifact copy or deletion.')
    stage = 'membership-add'
    const addMember = membersPanel.getByRole('button', { name: `加入成员：${removeSource.artifactId}`, exact: true })
    await addMember.waitFor({ state: 'visible', timeout: 10000 })
    const addResponsePromise = armResponse(response => {
      if (response.request().method() !== 'POST' || new URL(response.url()).pathname !== memberPath) return false
      try {
        const body = response.request().postDataJSON()
        return body.memberType === 'artifact' && String(body.memberId) === removeSource.artifactId
      } catch { return false }
    }, 20000)
    await addMember.click()
    const addResponse = await addResponsePromise
    withExpectedStatus(addResponse.status(), 200, 'Original Collection member-panel add producer')
    await membersPanel.getByRole('button', { name: `移出成员：${removeSource.artifactId}`, exact: true })
      .waitFor({ state: 'visible', timeout: 10000 })
    const addCanvas = await publicCanvas()
    const addPile = await exactPileState(addCanvas, expectedNodeIds)
    const afterAdd = await publicCoreValue('GET', `/collections/${encodeURIComponent(collectionId)}/members`)
    assert.deepEqual(normalizeRefs(afterAdd.members.map(row => row.memberRef)),
      normalizeRefs(fixtureMaterials.map(source => ({ type: 'artifact', id: source.artifactId }))))
    const closeMembersPanel = membersPanel.getByRole('button', { name: '关闭', exact: true })
    await closeMembersPanel.click()
    await membersPanel.waitFor({ state: 'hidden', timeout: 10000 })
    const targetPile = await visiblePileCard()
    canvas = addCanvas
    pile = addPile
    await assertCollectionBinding('after-original-member-remove-add', pileNodeId)
    report.membership = { removedArtifactId: removeSource.artifactId, removedNodeId: removeSource.nodeId,
      removedResponseStatus: removeResponse.status(), afterRemoveMemberCount: refsAfterRemove.length,
      afterRemovePile: clone(removePile),
      addAction: `members panel -> 加入成员：${removeSource.artifactId}`,
      addResponseStatus: addResponse.status(), finalMemberCount: afterAdd.members.length,
      finalPile: clone(pile), oneRemoveOneAdd: true,
      knownLimit: 'Original PILE drag-to-add is not asserted; current Core surface has no drag-add callback.' }
    await screenshot('04-membership-restored-original-pile', targetPile)

    stage = 'same-flow-original-group-expand-collapse'
    const refsBeforeExpand = normalizeRefs((await publicCoreValue('GET', `/collections/${encodeURIComponent(collectionId)}/members`)).members.map(row => row.memberRef))
    pileButton = await visiblePileCard()
    await pileButton.hover()
    const expandAction = await visibleAction('expand')
    stage = 'expand'
    const preparePromise = armResponse(response => response.request().method() === 'GET'
      && new URL(response.url()).pathname === exactSpacePreparePath, 20000)
    const expandBatch = armCanvasBatch('expand')
    await expandAction.click()
    const prepareResponse = await preparePromise
    withExpectedStatus(prepareResponse.status(), 200, 'Original read-only Collection space prepare')
    assert.ok(preparedSpacePlan, 'The exact original space:prepare plan must be observed before its O8 batch can authorize the generated frame ID.')
    assert.equal(report.spacePrepareReads.length, 1, 'The single original expand gesture must consume one exact space:prepare receipt.')
    const expandResponse = await expandBatch
    withExpectedStatus(expandResponse.status(), 200, 'Original Collection expand-to-Group action')
    let canvasAfterExpand = await publicCanvas()
    const groupCandidates = canvasAfterExpand.nodes.filter(node => node.type === 'group'
      && expectedNodeIds.every(id => canvasAfterExpand.nodes.some(child => String(child.id) === id
        && String(child.parentId ?? child.parent_id ?? '') === String(node.id))))
    assert.equal(groupCandidates.length, 1, 'Expand must place the exact same members in one TapNow GROUP on the original Flow.')
    const group = groupCandidates[0]
    assert.equal(String(group.id), String(preparedSpacePlan.frame_id),
      'The original O8-created GROUP must use the exact frame ID from the read-only Core prepare plan.')
    const bindingAfterExpand = await assertCollectionBinding('after-main-group-expand', pileNodeId)
    report.groupExpand = { action: 'native-collection-expand', canvasResponseStatus: expandResponse.status(), groupNodeId: String(group.id),
      collectionBindingSpatialId: String(bindingAfterExpand.spatialId),
      memberNodeIds: expectedNodeIds, oneOriginalFlow: await page.locator('.react-flow').count() === 1 }
    assert.equal(await page.locator('.react-flow').count(), 1)
    const expandedGroup = page.locator(canvasNodeSelector(String(group.id)))
    await expandedGroup.waitFor({ state: 'visible', timeout: 15000 })
    const collapseAction = await visibleAction('collapse', 'group')
    const expandedFrameRect = await expandedGroup.boundingBox()
    const expandedViewport = page.viewportSize()
    assert.ok(expandedFrameRect && expandedViewport, 'Need the original Group DOM bounds and browser viewport after the expand action is enabled.')
    assert.ok(expandedFrameRect.x >= -1 && expandedFrameRect.y >= -1
      && expandedFrameRect.x + expandedFrameRect.width <= expandedViewport.width + 1
      && expandedFrameRect.y + expandedFrameRect.height <= expandedViewport.height + 1,
    `After the original collapse button becomes enabled, the Group must be fully visible in the viewport: ${stable({ expandedFrameRect, expandedViewport })}`)
    report.groupExpand.expandedScreenshot = { mode: 'full-viewport', viewport: expandedViewport, frameRect: expandedFrameRect,
      collapseButtonEnabled: await collapseAction.isEnabled() }
    await screenshot('05-main-canvas-original-group-expanded')
    const collapseBatchCountBefore = report.browserWrites.filter(row => row.kind === 'native-canvas-batch').length
    const collapseBlockedCountBefore = report.blockedWrites.length
    stage = 'collapse-preference'
    await collapseAction.click()
    await page.locator(canvasNodeSelector(String(group.id))).waitFor({ state: 'hidden', timeout: 12000 })
    await visiblePileCard()
    assert.equal(report.browserWrites.filter(row => row.kind === 'native-canvas-batch').length, collapseBatchCountBefore,
      'The original collapse control is a collapsed-view preference, not a Canvas batch mutation.')
    assert.equal(report.blockedWrites.length, collapseBlockedCountBefore,
      'The original collapse preference must not attempt an out-of-scope write.')
    const collapsedCanvas = await publicCanvas()
    const collapsedCarrier = collapsedCanvas.nodes.find(node => String(node.id) === pileNodeId && node.type === 'pile')
    assert.ok(collapsedCarrier, 'Collapse must return the same canonical Collection to the original TapNow PILE renderer.')
    assert.deepEqual([...collapsedCarrier.data.memberIds].sort(), [...expectedNodeIds].sort())
    assert.deepEqual(normalizeRefs((await publicCoreValue('GET', `/collections/${encodeURIComponent(collectionId)}/members`)).members.map(row => row.memberRef)), refsBeforeExpand)
    await assertCollectionBinding('after-group-collapse-to-pile', pileNodeId)
    report.groupExpand.collapsedToSamePileId = String(collapsedCarrier.id) === pileNodeId
    report.groupExpand.collapse = { action: 'original collapsed-view preference', canvasBatchEmitted: false }
    report.groupExpand.groupHiddenAfterCollapse = true
    await screenshot('05b-original-pile-after-collapse', await visiblePileCard())

    stage = 'original-native-move-undo-redo'
    const beforeMoveCanvas = await publicCanvas()
    const beforeMovePile = await exactPileState(beforeMoveCanvas, expectedNodeIds)
    const beforeMovePosition = clone(beforeMovePile.position)
    const beforeMoveHistory = await inspectNativeHistory(pileNodeId)
    assert.equal(beforeMoveHistory?.ok, true, `Need the original O8 history inspector before move: ${stable(beforeMoveHistory)}`)
    const moveBatch = armCanvasBatch('move')
    const dragEvidence = await dragNodeBy(pileNodeId, 145, 105)
    const moveResponse = await moveBatch
    withExpectedStatus(moveResponse.status(), 200, 'Original PILE drag')
    const movedCanvas = await publicCanvas()
    const movedPile = await exactPileState(movedCanvas, expectedNodeIds)
    const movedPosition = clone(movedPile.position)
    assert.notDeepEqual(movedPosition, beforeMovePosition, 'The PILE must move through a real physical pointer gesture.')
    const moveHistory = await waitForOriginalHistory('native-pile-move', pileNodeId, movedPosition, beforeMovePosition)
    await assertCollectionBinding('after-native-pile-move', pileNodeId)
    const titleAfterMove = await publicCoreValue('GET', `/collections/${encodeURIComponent(collectionId)}`)
    assert.equal(titleAfterMove.title, renamedTitle, 'An old Canvas title echo must not overwrite the canonical Collection name during movement.')
    const movePayloads = report.browserWrites.filter(row => row.kind === 'native-canvas-batch' && row.stage === 'move')
      .flatMap(row => (row.body?.actions ?? []).flatMap(action => action.updates ?? [])
        .filter(update => String(update.id) === pileNodeId).map(update => clone(update)))
    report.move = { beforeMovePosition, movedPosition, dragEvidence, history: moveHistory, targetPileUpdatePayloads: movePayloads }
    await screenshot('06-moved-pile-before-undo', await visiblePileCard())

    const panePoint = await page.locator('.react-flow__pane').first().evaluate(element => {
      const rect = element.getBoundingClientRect()
      return { x: rect.left + Math.min(rect.width - 20, Math.max(20, rect.width * .92)),
        y: rect.top + Math.min(rect.height - 20, Math.max(20, rect.height * .88)) }
    })
    await page.mouse.click(panePoint.x, panePoint.y)
    const undoBatch = armCanvasBatch('undo')
    await page.keyboard.press('Control+Z')
    const undoResponse = await undoBatch
    withExpectedStatus(undoResponse.status(), 200, 'Original TapNow Ctrl+Z')
    const afterUndoCanvas = await publicCanvas()
    const undoPile = await exactPileState(afterUndoCanvas, expectedNodeIds)
    assert.deepEqual(undoPile.position, beforeMovePosition, 'Original Ctrl+Z must restore the exact previous PILE geometry.')
    const undoHistory = await waitForOriginalHistory('native-pile-undo', pileNodeId, beforeMovePosition, null)
    await assertCollectionBinding('after-native-pile-undo', pileNodeId)
    assert.equal((await publicCoreValue('GET', `/collections/${encodeURIComponent(collectionId)}`)).title, renamedTitle)
    report.undo = { keyboard: 'Control+Z', status: undoResponse.status(), position: undoPile.position, history: undoHistory }

    await page.mouse.click(panePoint.x, panePoint.y)
    const redoBatch = armCanvasBatch('redo')
    await page.keyboard.press('Control+Shift+Z')
    const redoResponse = await redoBatch
    withExpectedStatus(redoResponse.status(), 200, 'Original TapNow Ctrl+Shift+Z')
    const afterRedoCanvas = await publicCanvas()
    const redoPile = await exactPileState(afterRedoCanvas, expectedNodeIds)
    assert.deepEqual(redoPile.position, movedPosition, 'Original Redo must restore the exact moved PILE geometry.')
    const redoHistory = await waitForOriginalHistory('native-pile-redo', pileNodeId, movedPosition, beforeMovePosition)
    await assertCollectionBinding('after-native-pile-redo', pileNodeId)
    report.redo = { keyboard: 'Control+Shift+Z', status: redoResponse.status(), position: redoPile.position, history: redoHistory }

    stage = 'real-reload-readback'
    const expectedReloadCanvas = clone(afterRedoCanvas)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, { timeout: 30000 })
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 })
    await closeAgentPanelIfOpen('after-real-reload')
    await visiblePileCard()
    await screenshot('07-reloaded-original-pile', await visiblePileCard())
    await assertPageIdentity('after-real-reload')
    const reloadedCanvas = await publicCanvas()
    assert.deepEqual(stable(reloadedCanvas), stable(expectedReloadCanvas), 'Real reload must restore the same native PILE, members, IDs and geometry.')
    const reloadedCollection = await publicCoreValue('GET', `/collections/${encodeURIComponent(collectionId)}`)
    const reloadedMembers = await publicCoreValue('GET', `/collections/${encodeURIComponent(collectionId)}/members`)
    assert.equal(reloadedCollection.title, renamedTitle)
    assert.deepEqual(normalizeRefs(reloadedMembers.members.map(row => row.memberRef)),
      normalizeRefs(fixtureMaterials.map(source => ({ type: 'artifact', id: source.artifactId }))))
    const collectionBindingAfterReload = await assertCollectionBinding('after-real-reload', pileNodeId)
    const finalSourceBindings = (await publicBindings()).filter(binding => String(binding.projectId) === projectId
      && String(binding.canvasId) === sourceCanvasId && binding.spatialKind === 'node'
      && fixtureMaterials.some(source => String(binding.spatialId) === source.nodeId))
      .sort((a, b) => String(a.spatialId).localeCompare(String(b.spatialId)))
    assert.deepEqual(finalSourceBindings, sourceBindings, 'Original Artifacts must keep the exact material Node -> Core bindings through all PILE operations.')
    const runsAfter = await publicCoreValue('GET', '/runs')
    assert.deepEqual(runsAfter, runsBefore)
    const presentationsAfter = await publicCoreValue('GET', '/presentations')
    assert.deepEqual(presentationsAfter, presentationsBefore)
    for (const [otherCanvasId, before] of otherCanvasesBefore) {
      const afterResponse = await fetch(origin + `/api/canvas/v1/canvases/${encodeURIComponent(otherCanvasId)}`, { cache: 'no-store' })
      const afterPayload = await afterResponse.json()
      withExpectedStatus(afterResponse.status, 200, `Unrelated Canvas ${otherCanvasId}`)
      assert.equal(stable(canvasFingerprint(afterPayload.data)), stable(before), `Collection operations changed unrelated Canvas ${otherCanvasId}.`)
    }
    for (const source of fixtureMaterials) {
      assert.deepEqual(await publicFileBytes(source.fileRecordId), protectedBytes.get(source.fileRecordId),
        `Collection operations changed exact Core FileRecord bytes for ${source.artifactId}.`)
    }
    const finalGraph = await publicCoreValue('GET', '/graph')
    assert.deepEqual(finalGraph.artifacts, graphWithThree.artifacts, 'Title and Collection member operations must not create or mutate material Artifacts.')
    assert.deepEqual(finalGraph.artifactViews, graphWithThree.artifactViews)
    assert.deepEqual(finalGraph.artifactRevisions, graphWithThree.artifactRevisions)
    assert.deepEqual(finalGraph.fileRecords, graphWithThree.fileRecords)
    assert.deepEqual(report.routeErrors ?? [], [])
    assert.deepEqual(report.pageErrors, [])
    assert.equal(report.blockedWrites?.length ?? 0, 0)
    report.reloaded = { oneOriginalReactFlow: true, sameNativePileId: true, title: reloadedCollection.title,
      exactMemberRefs: reloadedMembers.members.map(row => row.memberRef), exactCollectionBinding: collectionBindingAfterReload,
      coreGraphMaterialCollectionsUnchanged: true, fileBytesUnchanged: true, runsUnchanged: true, unrelatedCanvasesUnchanged: true }
    report.passed = true
  } catch (error) {
    report.failure = String(error.stack ?? error)
    report.failedStage = stage
    if (page) {
      report.failureUrl = page.url()
      try { report.failureDiagnostics = await collectFailureDiagnostics() }
      catch (diagnosticError) { report.failureDiagnosticsError = String(diagnosticError.stack ?? diagnosticError) }
      report.failureBody = (await page.locator('body').innerText().catch(() => '')).slice(-10000)
      await screenshot('failure').catch(() => {})
    }
  } finally {
    try { await context?.close() } catch (error) { report.browserCloseError = String(error.stack ?? error) }
    try { await browser?.close() } catch (error) { report.browserCloseError = String(error.stack ?? error) }
    if (facade) {
      try { await facade.close(); bootstrapFacadeClosed = true; facade = undefined }
      catch (error) { report.bootstrapCloseError = String(error.stack ?? error); bootstrapFacadeClosed = false }
    }
    report.bootstrapFacadeClosed = bootstrapFacadeClosed
    if (bootstrapAttempted && coreOrigin) {
      report.launcher.bootstrapCoreListenerAfterCleanup = await probeLoopback(Number(new URL(coreOrigin).port))
    }

    const keepPreview = process.argv.includes('--keep-preview') && report.passed === true
    if (keepPreview && serverPid && launcher) {
      try {
        const healthResponse = await originalFetch(origin + '/health', { redirect: 'error', cache: 'no-store' })
        const health = healthResponse.ok ? await healthResponse.json() : undefined
        const serverCommandLine = await queryCommandLine(serverPid)
        const bootstrapCoreStopped = !bootstrapAttempted || bootstrapFacadeClosed
          && report.launcher.bootstrapCoreListenerAfterCleanup === false
        const verified = health?.pid === serverPid && health.realCoreConnected === true
          && health.cloudBackendConnected === false && health.profile === 'original-tapnow-full-integration-in-progress'
          && bootstrapCoreStopped
          && matchesProcessIdentity(serverCommandLine, path.join(root, 'lab/server.mjs'), runtimeLabel, uiPort)
        const launcherCommandLine = await queryCommandLine(launcher.pid)
        const launcherVerified = matchesProcessIdentity(launcherCommandLine,
          path.join(root, 'scripts/start-full-integration.mjs'), runtimeLabel, uiPort)
        report.preview = { requested: true, verified, launcherVerified, bootstrapCoreStopped,
          url: `${origin}/canvas/${encodeURIComponent(sourceCanvasId)}`,
          runtimeLabel, runtimeRoot, serverPid, launcherPid: launcher.pid, health: health ?? null,
          serverCommandLine, launcherCommandLine, retainedForUser: verified && launcherVerified }
        if (verified && launcherVerified) {
          launcher.stdout?.unref?.(); launcher.stderr?.unref?.(); launcher.unref()
          report.runtimeRetainedForPreview = true
        } else report.runtimeRetainedForRecovery = true
      } catch (error) {
        report.preview = { requested: true, verified: false, error: String(error.stack ?? error) }
        report.runtimeRetainedForRecovery = true
      }
    } else {
      try {
        if (!serverPid && launcher) {
          const candidates = [...(launcherStdout + '\n' + launcherStderr).matchAll(/Isolated full-integration child PID:\s*(\d+)/g)]
            .map(match => Number(match[1]))
          if (new Set(candidates).size === 1) serverPid = candidates[0]
          report.launcher.recoveredServerPidCandidates = [...new Set(candidates)]
        }
        if (serverPid) {
          const response = await originalFetch(origin + '/health', { redirect: 'error', cache: 'no-store' }).catch(() => undefined)
          const health = response?.ok ? await response.json() : undefined
          const commandLine = await queryCommandLine(serverPid)
          const verified = health?.pid === serverPid && health.realCoreConnected === true
            && health.profile === 'original-tapnow-full-integration-in-progress'
            && matchesProcessIdentity(commandLine, path.join(root, 'lab/server.mjs'), runtimeLabel, uiPort)
          report.launcher.cleanupServer = { pid: serverPid, health: health ?? null, commandLine, verified }
          if (verified) {
            stopExactProcess(serverPid, path.join(root, 'lab/server.mjs'), runtimeLabel, uiPort)
            report.launcher.cleanupServer.exited = await waitForProcessGone(serverPid, 15000)
          } else if (!commandLine && !response?.ok) report.launcher.cleanupServer.exited = true
        }
        if (launcher && report.launcher.cleanupServer?.exited) {
          if (launcher.exitCode === null) await waitForExit(launcher, 5000)
          if (launcher.exitCode === null) {
            const line = await queryCommandLine(launcher.pid)
            if (matchesProcessIdentity(line, path.join(root, 'scripts/start-full-integration.mjs'), runtimeLabel, uiPort)) {
              stopExactProcess(launcher.pid, path.join(root, 'scripts/start-full-integration.mjs'), runtimeLabel, uiPort)
              await waitForExit(launcher, 10000)
            }
          }
          report.launcher.launcherExited = launcher.exitCode !== null
        } else if (launcher && launcher.exitCode !== null) report.launcher.launcherExited = true
        report.launcher.uiListenerAfterCleanup = await probeLoopback(uiPort)
        const serverSafe = !serverPid || report.launcher.cleanupServer?.exited === true
        const launcherSafe = !launcher || launcher.exitCode !== null && report.launcher.launcherExited === true
        const bootstrapSafe = !bootstrapAttempted || bootstrapFacadeClosed
          && !!coreOrigin && report.launcher.bootstrapCoreListenerAfterCleanup === false
        const browserSafe = !browser || !browser.isConnected()
        if (runtimePrepared && serverSafe && launcherSafe && bootstrapSafe && browserSafe
          && report.launcher.uiListenerAfterCleanup === false && await exists(runtimeRoot)) {
          const base = await realpath(runtimeBase), target = await realpath(runtimeRoot), relative = path.relative(base, target)
          assert.equal(relative, runtimeLabel)
          assert.equal(path.isAbsolute(relative), false)
          assert.equal(path.basename(target), runtimeLabel)
          await rm(target, { recursive: true, force: false })
          report.runtimeRemoved = true
          runtimePrepared = false
        } else if (runtimePrepared) report.runtimeRetainedForRecovery = true
      } catch (error) {
        report.cleanupError = String(error.stack ?? error)
        report.runtimeRetainedForRecovery = true
      }
    }

    globalThis.fetch = originalFetch
    report.launcher.stdoutTail = launcherStdout
    report.launcher.stderrTail = launcherStderr
    try { await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8') }
    catch (error) { report.reportWriteError = String(error.stack ?? error) }
    process.stdout.write(JSON.stringify({ passed: report.passed, stage, runtimeLabel, origin,
      collectionId, pileNodeId, preview: report.preview, failure: report.failure, cleanupError: report.cleanupError,
      runtimeRemoved: report.runtimeRemoved, runtimeRetainedForRecovery: report.runtimeRetainedForRecovery,
      reportPath, screenshots: report.screenshots }, null, 2) + '\n')
    if (!report.passed) process.exitCode = 1
  }
}
