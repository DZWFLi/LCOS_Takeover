import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'
import { matchesProcessIdentity, queryCommandLine, reserveLoopbackPort, stopExactProcess,
  waitForCommandLine, waitForExit, waitForHealth, waitForProcessGone } from './native-execution-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
const runtimeLabel = 'isolated-native-image-title-' + Date.now()
const runtimeRoot = path.join(runtimeBase, runtimeLabel)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const reportPath = path.join(runtimeBase, 'native-image-title', stamp + '.json')
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
const projectId = 'disposable-surface-core-facade'
const canvasId = 'surface-core-context'
const imageNodeId = 'surface-context-image'
const changedTitle = '图片标题真实改名 ' + stamp.slice(0, 19)
const stable = value => JSON.stringify(value)
const clone = value => JSON.parse(JSON.stringify(value))
const imageNodeSelector = id => '.react-flow__node[data-id="' + String(id).replaceAll('"', '\\"') + '"]'
const renameStatusSelector = id => '[data-lcos-native-material-rename-status="ready"]'
  + '[data-canvas-id="' + canvasId + '"][data-node-id="' + String(id).replaceAll('"', '\\"') + '"]'
const exists = async target => { try { await stat(target); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--run-isolated')) {
    console.error('Not started: use --run-isolated. This script never targets existing services or user databases.')
    process.exitCode = 2
  } else await run()
}

async function run() {
  await mkdir(path.dirname(reportPath), { recursive: true })
  await mkdir(visualRoot, { recursive: true })
  assert.equal(await exists(runtimeRoot), false, 'Never reuse an existing isolated runtime.')
  await mkdir(runtimeRoot, { recursive: true })
  let runtimePrepared = true
  const report = { at: new Date().toISOString(), passed: false, runtimeLabel, runtimeRoot, reportPath,
    flow: 'isolated Core image → native duplicate view → Gen2 original F2 title entry → Core metadata title → dismiss/reopen/reload → move old view and native Undo/Redo',
    browser: { viewport: { width: 1440, height: 1000 }, engine: 'installed Chrome', browserPluginAvailable: false,
      fallback: 'Browser plugin/skill absent; existing repository playwright-core', serviceWorkers: 'blocked' },
    target: { projectId, canvasId, imageNodeId, changedTitle },
    providerExecution: false, modelExecution: false, fixtureWrites: [], titleRequests: [], batches: [], routeErrors: [],
    blockedWrites: [], blockedHttp: [], blockedWebSockets: [], deniedNodeFetches: [], diagnostics: [], syncs: [],
    pageErrors: [], consoleErrors: [], consoleWarnings: [], apiFailures: [], cases: [], screenshots: [], launcher: {} }
  for (const key of ['LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LCOS_CODEX_AUTO_EXECUTION',
    'LCOS_WORKBUDDY_AUTO_EXECUTION', 'HUABU_HOST_URL', 'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN',
    'HUABU_AGENTLET_ID', 'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD', 'HUABU_DATA_DIR',
    'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON', 'LCOS_OLLAMA_EMBED_MODEL']) delete process.env[key]
  Object.assign(process.env, { LCOS_RECOVERY_TRANSPORT: 'none', LCOS_OLLAMA_URL: 'http://127.0.0.1:1',
    LCOS_CAPTURE_STAGING_ROOT: path.join(runtimeRoot, 'capture'), LCOS_OCR_RUNTIME_DIR: path.join(runtimeRoot, 'ocr') })

  let facade, browser, context, page, launcher, serverPid, uiPort, origin
  let bootstrapping = false, stage = 'bootstrap', stdout = '', stderr = ''
  let sourceArtifactId, initialTitle, duplicateNodeId, duplicateViewId, initialCanvas, initialGraph, graphBeforeTitle
  let movedPosition
  let launcherClosed, launcherState, bootstrapCoreOrigin
  const allowedOrigins = new Set()
  const originalFetch = globalThis.fetch.bind(globalThis)
  const bootstrapOrigins = () => process._getActiveHandles().filter(handle => handle instanceof net.Server && handle.listening)
    .map(handle => handle.address()).filter(address => address && typeof address !== 'string' && address.address === '127.0.0.1')
    .map(address => 'http://127.0.0.1:' + address.port)
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const bootstrap = bootstrapping ? bootstrapOrigins() : []
    if (url.protocol === 'http:' && (allowedOrigins.has(url.origin) || bootstrap.length === 1 && bootstrap[0] === url.origin)) {
      return originalFetch(input, init)
    }
    report.deniedNodeFetches.push({ origin: url.origin, path: url.pathname })
    throw new Error('Only this test-owned loopback Core/UI origin is allowed; model and remote endpoints are blocked.')
  }

  const appCore = suffix => '/api/lcos/core/projects/' + encodeURIComponent(projectId) + suffix
  async function get(pathname, tapNow = false) {
    const response = await fetch(origin + pathname, { redirect: 'error', cache: 'no-store' })
    const payload = await response.json()
    assert.equal(response.status, 200, pathname + ': ' + stable(payload))
    assert.equal(tapNow ? payload.code === 0 : payload.ok === true, true, pathname)
    return tapNow ? payload.data : payload.value
  }
  const readCanvas = id => get('/api/canvas/v1/canvases/' + encodeURIComponent(id), true)
  const readGraph = () => get(appCore('/graph'))
  const readBindings = () => get(appCore('/spatial/bindings'))
  const readRuns = () => get(appCore('/runs'))
  const readPresentations = () => get(appCore('/presentations'))
  function normalizeGraphForTitle(graph, artifactId) {
    const normalized = clone(graph)
    normalized.artifacts = normalized.artifacts.map(artifact => {
      if (String(artifact.id) !== String(artifactId)) return artifact
      const allowedTitleFields = { ...artifact }
      for (const field of ['title', 'titleMode', 'updatedAt']) delete allowedTitleFields[field]
      return allowedTitleFields
    })
    return normalized
  }
  function assertGraphStableExceptTargetTitle(before, after, label) {
    assert.deepEqual(normalizeGraphForTitle(after, sourceArtifactId), normalizeGraphForTitle(before, sourceArtifactId),
      label + ': only target Artifact title/titleMode/updatedAt may differ in the complete Core graph.')
  }
  function joinCanvasNodeToCore(canvas, graph, bindings, nodeId) {
    const rows = canvas.nodes.filter(node => String(node.id) === String(nodeId))
    assert.equal(rows.length, 1, 'Canvas must contain exactly one material node ' + nodeId)
    const node = rows[0]
    assert.equal(node.type, 'image')
    const ref = node.data?.lcos_ref
    assert.ok(ref, 'Canvas image must carry the original Core lcos_ref: ' + nodeId)
    assert.equal(ref.version, 1)
    assert.equal(String(ref.artifactId), sourceArtifactId)
    assert.ok(['artifact', 'view'].includes(ref.entityType))
    assert.equal(String(ref.entityId), String(ref.entityType === 'artifact' ? ref.artifactId : ref.artifactViewId))
    assert.ok(ref.artifactViewId && ref.revisionId, 'The exact View and Revision are required even for an Artifact-bound primary image.')

    const matches = bindings.filter(binding => String(binding.projectId) === projectId
      && String(binding.canvasId) === canvasId && binding.spatialKind === 'node' && String(binding.spatialId) === String(nodeId))
    assert.equal(matches.length, 1, 'Core must own one exact node ProjectionBinding for ' + nodeId)
    const binding = matches[0]
    assert.equal(binding.entityType, ref.entityType)
    assert.equal(String(binding.entityId), String(ref.entityId))

    const viewRows = graph.artifactViews.filter(view => String(view.id) === String(ref.artifactViewId))
    assert.equal(viewRows.length, 1, 'Exact ArtifactView must join the image reference.')
    const view = viewRows[0]
    assert.equal(String(view.artifactId), String(ref.artifactId))
    assert.equal(String(view.revisionId), String(ref.revisionId))
    const artifactRows = graph.artifacts.filter(artifact => String(artifact.id) === String(ref.artifactId))
    assert.equal(artifactRows.length, 1, 'Exact Artifact must join through ArtifactView.')
    const artifact = artifactRows[0]
    assert.equal(String(artifact.projectId), projectId)
    const revisionRows = graph.artifactRevisions.filter(revision => String(revision.id) === String(ref.revisionId))
    assert.equal(revisionRows.length, 1, 'Exact Revision must join through the image reference.')
    const revision = revisionRows[0]
    assert.equal(String(revision.artifactId), String(artifact.id))
    const fileRows = graph.fileRecords.filter(file => String(file.id) === String(revision.fileRecordId))
    assert.equal(fileRows.length, 1, 'The exact Revision must resolve one FileRecord.')
    assert.equal(String(fileRows[0].projectId), projectId)
    return { nodeId: String(nodeId), ref: clone(ref), binding: clone(binding), viewId: String(view.id),
      artifactId: String(artifact.id), revisionId: String(revision.id), fileRecordId: String(fileRows[0].id) }
  }
  async function bytesFor(fileId) {
    const response = await fetch(origin + appCore('/file-records/' + encodeURIComponent(fileId) + '/content'), { redirect: 'error', cache: 'no-store' })
    assert.equal(response.status, 200)
    return Buffer.from(await response.arrayBuffer())
  }
  async function screenshot(label) {
    if (!page) return
    const target = path.join(visualRoot, 'tapnow-native-image-title-' + stamp + '-' + label + '.png')
    await page.screenshot({ path: target, fullPage: false })
    report.screenshots.push({ label, path: target })
  }
  function findArtifact(graph, id) { return graph.artifacts.find(row => String(row.id) === String(id)) }
  function revisionsFor(graph, artifactId) { return graph.artifactRevisions.filter(row => String(row.artifactId) === String(artifactId)) }
  function viewsFor(graph, artifactId) { return graph.artifactViews.filter(row => String(row.artifactId) === String(artifactId)) }
  function assertViewsUnchangedExceptNativeMove(beforeGraph, afterGraph, viewId, finalNativePosition) {
    assert.deepEqual(afterGraph.artifactViews.map(row => String(row.id)).sort(), beforeGraph.artifactViews.map(row => String(row.id)).sort(),
      'Canvas movement cannot add or delete ArtifactViews.')
    let geometryOwner = 'no Core View geometry update observed'
    for (const beforeView of beforeGraph.artifactViews) {
      const afterView = afterGraph.artifactViews.find(row => String(row.id) === String(beforeView.id))
      assert.ok(afterView)
      if (String(beforeView.id) !== String(viewId)) {
        assert.deepEqual(afterView, beforeView, 'Unmoved ArtifactView changed: ' + beforeView.id)
        continue
      }
      const moved = stable(afterView.position) !== stable(beforeView.position)
      if (moved) {
        assert.deepEqual(afterView.position, finalNativePosition,
          'If the real geometry owner mirrors this moved View into Core, only its exact final native position may differ.')
        geometryOwner = 'Core ArtifactView.position exactly mirrors the moved native image position'
      }
      assert.deepEqual({ ...afterView, position: beforeView.position }, beforeView,
        'Only the moved ArtifactView position may change.')
    }
    return geometryOwner
  }
  function inspectRendererImageTitle(renderer, input) {
    const { nodeId, titles } = input
    const node = renderer.querySelector('.react-flow__node[data-id="' + CSS.escape(nodeId) + '"]')
    if (!node) return { ok: false, reason: 'NODE_NOT_IN_RENDERER', nodeId, candidates: [] }
    const nodeRect = node.getBoundingClientRect()
    const selector = '.canvas-node-title,[data-lcos-native-image-title],.min-w-0.truncate'
    const candidates = [...renderer.querySelectorAll(selector)].flatMap(candidate => {
      const text = (candidate.innerText || candidate.textContent || '').trim()
      if (!titles.some(title => text.includes(title))
        || [...candidate.children].some(child => (child.innerText || child.textContent || '').trim() === text)) return []
      const box = candidate.getBoundingClientRect(), style = getComputedStyle(candidate)
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
        && box.width > 0 && box.height > 0
      if (!visible || box.right < nodeRect.left - 24 || box.left > nodeRect.right + 24
        || box.bottom < nodeRect.top - 140 || box.top > nodeRect.top + 28) return []

      let portalRoot = candidate
      while (portalRoot.parentElement && portalRoot.parentElement !== renderer) portalRoot = portalRoot.parentElement
      const portalRect = portalRoot.getBoundingClientRect()
      const identityAttributes = ['data-node-id', 'data-nodeid', 'data-spatial-id', 'data-id', 'data-node']
      const identityChain = []
      let ancestor = candidate
      while (ancestor && ancestor !== renderer) {
        for (const attribute of identityAttributes) {
          const value = ancestor.getAttribute(attribute)
          if (value !== null) identityChain.push({ attribute, value })
        }
        ancestor = ancestor.parentElement
      }
      const identityLinked = identityChain.some(item => item.value === nodeId)
      const portalLeftDelta = portalRect.left - nodeRect.left
      const portalTopDelta = portalRect.top - nodeRect.top
      const anchoredToNodeGeometry = Math.abs(portalLeftDelta) <= 8
        && portalTopDelta >= -140 && portalTopDelta <= 28
      if (!identityLinked && !anchoredToNodeGeometry) return []
      return [{ text, tag: candidate.tagName, className: typeof candidate.className === 'string' ? candidate.className : null,
        titleAttribute: candidate.getAttribute('title'), visible, identityLinked, identityChain,
        association: identityLinked ? 'exact-node-id-chain' : 'ReactFlow-renderer portal anchor geometry',
        portalRoot: { tag: portalRoot.tagName, className: typeof portalRoot.className === 'string' ? portalRoot.className : null,
          attributes: [...portalRoot.attributes].filter(attribute => attribute.name.startsWith('data-'))
            .map(attribute => [attribute.name, attribute.value]),
          box: { x: portalRect.x, y: portalRect.y, width: portalRect.width, height: portalRect.height },
          deltaFromNode: { x: portalLeftDelta, y: portalTopDelta } },
        box: { x: box.x, y: box.y, width: box.width, height: box.height } }]
    })
    return { ok: true, nodeId, nodeBox: { x: nodeRect.x, y: nodeRect.y, width: nodeRect.width, height: nodeRect.height },
      candidates }
  }
  async function imageDomFacts(id) {
    const nodeFacts = await page.locator(imageNodeSelector(id)).evaluate(element => {
      const image = element.querySelector('img')
      const rect = element.getBoundingClientRect()
      return { visibleText: (element.innerText || '').trim(), ariaLabel: element.getAttribute('aria-label'),
        titleAttribute: element.getAttribute('title'), imageAlt: image?.getAttribute('alt') ?? null,
        imageTitle: image?.getAttribute('title') ?? null, imageLoaded: image ? image.complete && image.naturalWidth > 0 : false,
        box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
    })
    const rendererTitle = await page.locator('.react-flow__renderer').evaluate(inspectRendererImageTitle,
      { nodeId: id, titles: [initialTitle, changedTitle] })
    return { ...nodeFacts, rendererTitle }
  }
  function compareVisibleTitle(before, after) {
    const has = (facts, title) => facts.visibleText.includes(title)
      || facts.ariaLabel === title || facts.titleAttribute === title
      || facts.imageAlt === title || facts.imageTitle === title
      || facts.rendererTitle.candidates.some(candidate => candidate.text.includes(title) && candidate.visible)
    const newTitleVisible = has(after, changedTitle)
    const oldTitleStillVisible = has(after, initialTitle)
    return { oldTitle: initialTitle, newTitle: changedTitle,
      before: { visibleText: before.visibleText, ariaLabel: before.ariaLabel, titleAttribute: before.titleAttribute,
        imageAlt: before.imageAlt, imageTitle: before.imageTitle, rendererTitle: before.rendererTitle },
      after: { visibleText: after.visibleText, ariaLabel: after.ariaLabel, titleAttribute: after.titleAttribute,
        imageAlt: after.imageAlt, imageTitle: after.imageTitle, rendererTitle: after.rendererTitle },
      newTitleVisible, oldTitleStillVisible,
      outcome: newTitleVisible ? 'new-title-visible' : oldTitleStillVisible ? 'stale-old-title-visible' : 'no-visible-title-evidence' }
  }
  async function assertVisibleImageHeaderTitle(nodeId, title, phase, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs
    let facts, matches = [], polls = 0
    do {
      facts = await imageDomFacts(nodeId)
      assert.equal(facts.rendererTitle.ok, true, 'Read the original image title portal from the active ReactFlow renderer.')
      matches = facts.rendererTitle.candidates.filter(candidate => candidate.visible && candidate.text.includes(title))
      polls += 1
      if (matches.length === 1) break
      if (Date.now() < deadline) await page.waitForTimeout(100)
    } while (Date.now() < deadline)
    report.imageHeaderChecks ??= []
    report.imageHeaderChecks.push({ phase, nodeId, title, polls, facts: facts.rendererTitle, matchingCandidateCount: matches.length })
    assert.equal(matches.length, 1,
      `The original ReactFlow image header for ${nodeId} must visibly show exactly one '${title}' title candidate; got ${stable(facts.rendererTitle.candidates)}`)
    return facts
  }
  async function assertPage(label) {
    assert.equal(new URL(page.url()).origin, origin)
    assert.equal(new URL(page.url()).pathname, '/canvas/' + canvasId)
    const title = await page.title()
    assert.match(title, /TapNow|LCOS/)
    const body = await page.locator('body').innerText()
    assert.ok(body.length > 40)
    assert.equal(await page.locator('vite-error-overlay,nextjs-portal,[data-nextjs-dialog]').count(), 0)
    report.pageChecks ??= []
    report.pageChecks.push({ label, title, url: page.url(), meaningfulBody: true, frameworkOverlay: false })
  }
  async function waitForRenameReady(nodeId) {
    const selector = renameStatusSelector(nodeId)
    await page.locator(selector).waitFor({ state: 'attached', timeout: 15000 })
    const facts = await page.locator(selector).first().evaluate(element => ({
      status: element.getAttribute('data-lcos-native-material-rename-status'),
      canvasId: element.getAttribute('data-canvas-id'), nodeId: element.getAttribute('data-node-id'),
    }))
    assert.deepEqual(facts, { status: 'ready', canvasId, nodeId }, 'Only the verified current image binding can enable the original F2 entry.')
    report.renameReadiness ??= []
    report.renameReadiness.push(facts)
    return facts
  }
  async function focusPane() {
    const point = await page.locator('.react-flow__pane').first().evaluate(element => {
      const rect = element.getBoundingClientRect()
      for (const fy of [.08, .16, .84, .92]) for (const fx of [.08, .16, .84, .92]) {
        const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy, hit = document.elementFromPoint(x, y)
        if (hit?.closest('.react-flow__pane') && !hit.closest('.react-flow__node,button,input,textarea,[contenteditable="true"],.react-flow__controls,.react-flow__minimap')) return { x, y }
      }
    })
    assert.ok(point, 'A real unobstructed Canvas point is required for native keyboard history.')
    await page.mouse.click(point.x, point.y)
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('input,textarea,[contenteditable="true"]')), false)
  }
  async function selectedImage(id) {
    const node = page.locator(imageNodeSelector(id))
    await node.waitFor({ state: 'visible', timeout: 10000 })
    await node.click({ position: { x: 28, y: 28 } })
    await page.waitForFunction(id => {
      const node = document.querySelector('.react-flow__node[data-id="' + CSS.escape(id) + '"]')
      return !!node && (node.classList.contains('selected') || node.getAttribute('aria-selected') === 'true')
    }, id, { timeout: 5000 })
    await waitForRenameReady(id)
    return node
  }
  async function openF2(nodeId) {
    await selectedImage(nodeId)
    await page.keyboard.press('F2')
    const input = page.getByRole('textbox', { name: '节点名称', exact: true })
    await input.waitFor({ state: 'visible', timeout: 5000 })
    return input
  }
  function summarizeActions(body) {
    const actions = body?.actions ?? (body?.action ? [body.action] : [])
    return actions.map(action => ({ action: action.action, ids: [
      ...(Array.isArray(action.updates) ? action.updates.map(row => row.id) : []),
      ...(Array.isArray(action.creates) ? action.creates.map(row => row.id) : []),
      ...(Array.isArray(action.delete_ids) ? action.delete_ids : []),
    ], updates: Array.isArray(action.updates) ? action.updates.map(row => ({ id: row.id, keys: Object.keys(row).sort(),
      dataKeys: row.data && typeof row.data === 'object' ? Object.keys(row.data).sort() : [],
      title: typeof row.data?.title === 'string' ? row.data.title : undefined,
      position: row.position, measured: row.measured })) : undefined,
    creates: Array.isArray(action.creates) ? action.creates.map(row => ({ id: row.id, type: row.type,
      ref: row.lcos_ref ?? row.data?.lcos_ref, title: row.data?.title, position: row.position, measured: row.measured })) : undefined }))
  }
  async function dragNode(id, dx, dy) {
    const probe = await page.locator(imageNodeSelector(id)).evaluate(element => {
      const rect = element.getBoundingClientRect()
      const samples = []
      for (const fy of [.2, .35, .5, .65, .8]) for (const fx of [.2, .35, .5, .65, .8]) {
        const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy, hit = document.elementFromPoint(x, y)
        // React Flow image wrappers themselves carry `.nopan`; that disables
        // canvas panning on their pixels, not node dragging. `.nodrag` is the
        // actual child-control exclusion needed for a draggable point.
        const blocked = hit?.closest('button,input,textarea,[contenteditable="true"],.nodrag,[data-no-node-drag]')
        const hitNode = hit?.closest('.react-flow__node[data-id]')
        samples.push({ x: Math.round(x), y: Math.round(y), hit: hit ? {
          tag: hit.tagName, id: hit.id || null, className: typeof hit.className === 'string' ? hit.className : null,
          nodeId: hitNode?.getAttribute('data-id') ?? null, blockedBy: blocked ? {
            tag: blocked.tagName, id: blocked.id || null,
            className: typeof blocked.className === 'string' ? blocked.className : null,
          } : null,
        } : null })
        if (hitNode === element && !blocked) return { start: { x, y }, rect: {
          x: rect.x, y: rect.y, width: rect.width, height: rect.height }, samples }
      }
      const style = getComputedStyle(element)
      return { start: null, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        nodeStyle: { pointerEvents: style.pointerEvents, display: style.display, zIndex: style.zIndex }, samples }
    })
    if (!probe.start) {
      report.dragDiagnostics ??= []
      report.dragDiagnostics.push({ stage, nodeId: id, ...probe })
      throw new Error('A real draggable point inside the native image node is required; hit-test diagnostics: ' + stable(probe))
    }
    const start = probe.start
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 12 })
    await page.mouse.up()
    return start
  }
  async function positionOf(id) {
    const canvas = await readCanvas(canvasId)
    const node = canvas.nodes.find(row => String(row.id) === String(id))
    assert.ok(node, 'Expected native image node ' + id)
    return clone(node.position)
  }
  async function inspectNativeHistory(nodeId) {
    const history = await page.evaluate(({ canvasId, nodeId }) => {
      const host = window.__LCOS_NODE_LAB__
      const api = host?.api
      if (!api || (host.currentCanvasId ?? host.canvasId) !== canvasId || typeof api.inspectNativeHistory !== 'function') {
        return { ok: false, reason: 'ORIGINAL_O8_INSPECTOR_UNAVAILABLE' }
      }
      return api.inspectNativeHistory({ canvasId, requestedCanvasId: canvasId, nodeId })
    }, { canvasId, nodeId })
    assert.equal(history?.ok, true, 'Use only the original read-only O8 history inspector: ' + stable(history))
    return history
  }
  function historyNodePosition(history, target, nodeId) {
    const node = history?.[target]?.nodes?.find(row => String(row.id) === String(nodeId))
    return node?.position ? clone(node.position) : null
  }
  function samePositionWithin(left, right) {
    return !!left && !!right && Number.isFinite(left.x) && Number.isFinite(left.y)
      && Math.abs(left.x - right.x) <= 0.000001 && Math.abs(left.y - right.y) <= 0.000001
  }
  async function waitForOriginalHistoryPositions(phase, nodeId, expected) {
    const beforeWait = await inspectNativeHistory(nodeId)
    report.nativeHistoryObservations ??= []
    report.nativeHistoryObservations.push({ phase: phase + '-before-debounce-settle', nodeId,
      historySize: beforeWait.historySize, currentIndex: beforeWait.currentIndex,
      current: historyNodePosition(beforeWait, 'currentEntry', nodeId),
      undo: historyNodePosition(beforeWait, 'undoTarget', nodeId),
      redo: historyNodePosition(beforeWait, 'redoTarget', nodeId), expected: clone(expected) })
    try {
      await page.waitForFunction(({ canvasId, nodeId, expected }) => {
        const api = window.__LCOS_NODE_LAB__?.api
        const history = api?.inspectNativeHistory({ canvasId, requestedCanvasId: canvasId, nodeId })
        if (!history?.ok) return false
        const position = target => history[target]?.nodes?.find(row => String(row.id) === String(nodeId))?.position
        const equal = (left, right) => !right || !!left && Number.isFinite(left.x) && Number.isFinite(left.y)
          && Math.abs(left.x - right.x) <= 0.000001 && Math.abs(left.y - right.y) <= 0.000001
        return equal(position('currentEntry'), expected.current)
          && equal(position('undoTarget'), expected.undo)
          && equal(position('redoTarget'), expected.redo)
      }, { canvasId, nodeId, expected }, { timeout: 12000 })
    } catch (error) {
      const afterWait = await inspectNativeHistory(nodeId).catch(readError => ({ ok: false, error: String(readError.stack ?? readError) }))
      report.nativeHistoryObservations.push({ phase: phase + '-debounce-wait-failed', nodeId,
        expected: clone(expected), afterWait })
      throw error
    }
    const settled = await inspectNativeHistory(nodeId)
    const observation = { phase: phase + '-settled', nodeId, historySize: settled.historySize,
      currentIndex: settled.currentIndex, current: historyNodePosition(settled, 'currentEntry', nodeId),
      undo: historyNodePosition(settled, 'undoTarget', nodeId), redo: historyNodePosition(settled, 'redoTarget', nodeId),
      expected: clone(expected) }
    report.nativeHistoryObservations.push(observation)
    return settled
  }
  function armResponse(predicate, timeout) {
    const pending = page.waitForResponse(predicate, { timeout })
    // Attach immediately to the original promise so an action failure/page close
    // cannot create an unhandled rejection during the runner's finally path.
    pending.catch(() => {})
    return pending
  }
  function waitBatch(stageName) {
    stage = stageName
    return armResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions', 20000)
  }

  try {
    uiPort = await reserveLoopbackPort()
    assert.ok(![17879, 17880, 17881].includes(uiPort), 'Never use an existing historical or live port.')
    origin = 'http://127.0.0.1:' + uiPort
    report.origin = origin; report.uiPort = uiPort
    const bundlePath = path.join(runtimeRoot, 'bootstrap', 'facade.mjs')
    await buildPilotEntry('lab/pilot/surface-core-facade.ts', bundlePath)
    const { startSurfaceCoreFacade } = await import(pathToFileURL(bundlePath).href)
    assert.deepEqual(bootstrapOrigins(), [])
    bootstrapping = true
    try { facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true }) }
    finally { bootstrapping = false }
    bootstrapCoreOrigin = facade.core.origin
    allowedOrigins.add(facade.core.origin)
    allowedOrigins.add(origin)
    const facadeData = async (method, pathname, body) => {
      const result = await facade.handle({ method, pathname, url: new URL(pathname, origin), body })
      assert.equal(result.status, 200, stable(result.body)); assert.equal(result.body.code, 0)
      if (method !== 'GET') report.fixtureWrites.push({ method, path: pathname, status: result.status, bootstrapOnly: true })
      return result.body.data
    }
    const bootCanvas = await facadeData('GET', '/api/canvas/v1/canvases/' + canvasId)
    const bootImage = bootCanvas.nodes.find(node => String(node.id) === imageNodeId && node.type === 'image')
    assert.ok(bootImage?.data?.lcos_ref?.artifactId, 'Disposable bootstrap must have a Core-bound image, not a fabricated label-only node.')
    sourceArtifactId = String(bootImage.data.lcos_ref.artifactId)
    initialTitle = String(bootImage.data.title)
    assert.ok(initialTitle.trim() && initialTitle !== changedTitle)
    await facade.spatial.execute(canvasId, [{ type: 'SET_NODE_GEOMETRY', items: [
      { nodeId: imageNodeId, size: { width: 375, height: 250 } },
    ] }])
    report.fixture = { bootstrapOnly: true, imageNodeId, artifactId: sourceArtifactId, title: initialTitle,
      measured: { width: 375, height: 250 }, providerExecuted: false }
    await facade.close(); report.bootstrapFacadeClosed = true; facade = undefined
    allowedOrigins.clear(); allowedOrigins.add(origin)

    launcher = spawn(process.execPath, [path.join(root, 'scripts/start-full-integration.mjs'),
      '--runtime-label=' + runtimeLabel, '--port=' + uiPort], { cwd: root, windowsHide: true,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        LCOS_RECOVERY_TRANSPORT: 'none', LCOS_OLLAMA_URL: 'http://127.0.0.1:1' }, stdio: ['ignore', 'pipe', 'pipe'] })
    launcher.stdout.setEncoding('utf8').on('data', chunk => { stdout = (stdout + chunk).slice(-16000) })
    launcher.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-16000) })
    launcherState = { closed: undefined }
    launcher.once('close', (code, signal) => { launcherClosed = { code, signal }; launcherState.closed = launcherClosed })
    report.launcher.launcherPid = launcher.pid
    report.launcher.launcherCommandLine = await waitForCommandLine(launcher.pid,
      line => matchesProcessIdentity(line, path.join(root, 'scripts/start-full-integration.mjs'), runtimeLabel, uiPort), launcherState)
    const health = await waitForHealth(origin, launcherState, () => stdout + stderr)
    assert.equal(health.realCoreConnected, true); assert.equal(health.cloudBackendConnected, false)
    assert.equal(health.profile, 'original-tapnow-full-integration-in-progress')
    serverPid = Number(health.pid)
    report.launcher.serverPid = serverPid
    report.launcher.serverCommandLine = await waitForCommandLine(serverPid,
      line => matchesProcessIdentity(line, path.join(root, 'lab/server.mjs'), runtimeLabel, uiPort), launcherState)
    report.fixture.publicCoreReadback = true

    initialCanvas = clone(await readCanvas(canvasId))
    const initialNode = initialCanvas.nodes.find(node => String(node.id) === imageNodeId)
    assert.ok(initialNode?.data?.lcos_ref?.artifactId)
    assert.equal(String(initialNode.data.lcos_ref.artifactId), sourceArtifactId)
    assert.equal(initialNode.data.title, initialTitle)
    initialGraph = clone(await readGraph())
    assert.deepEqual(await readRuns(), [])
    const presentationsBefore = clone(await readPresentations())
    const otherCanvasesBefore = new Map()
    for (const id of ['surface-core-main', 'surface-core-workflow']) otherCanvasesBefore.set(id, clone(await readCanvas(id)))
    const sourceArtifact = findArtifact(initialGraph, sourceArtifactId)
    assert.ok(sourceArtifact)
    const currentRevision = initialGraph.artifactRevisions.find(row => String(row.id) === String(sourceArtifact.currentRevisionId))
    assert.ok(currentRevision)
    const originalImageBytes = await bytesFor(String(currentRevision.fileRecordId))
    const protectedFiles = new Map()
    for (const file of initialGraph.fileRecords) protectedFiles.set(String(file.id), await bytesFor(String(file.id)))
    report.before = { canvasVersion: initialCanvas.version, nodeCount: initialCanvas.nodes.length, artifact: clone(sourceArtifact),
      viewIds: viewsFor(initialGraph, sourceArtifactId).map(view => String(view.id)),
      revisionIds: revisionsFor(initialGraph, sourceArtifactId).map(revision => String(revision.id)),
      fileRecordIds: initialGraph.fileRecords.map(file => String(file.id)), fileBytes: originalImageBytes.length }

    const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: report.browser.viewport, locale: 'zh-CN', serviceWorkers: 'block' })
    const cdp = await browser.newBrowserCDPSession()
    const { browserContextIds } = await cdp.send('Target.getBrowserContexts')
    assert.equal(browserContextIds.length, 1)
    await cdp.send('Browser.grantPermissions', { permissions: [], origin, browserContextId: browserContextIds[0] })
    report.browser.osClipboardAccess = 'denied by real browser permission; this flow does not use the OS clipboard'

    await context.route('**/*', async route => {
      try {
        const request = route.request(), url = new URL(request.url()), method = request.method().toUpperCase()
        if (['data:', 'blob:'].includes(url.protocol)) return route.continue()
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
          report.blockedHttp.push({ method, origin: url.origin, path: url.pathname })
          return route.abort('blockedbyclient')
        }
        if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.continue()
        if (method === 'POST' && url.pathname === '/api/events') {
          const event = request.postDataJSON()
          const kinds = ['diagnostics-installed', 'remote-fetch-attempt', 'remote-fetch-blocked', 'http-failed',
            'fetch-failed', 'csp-blocked', 'action-not-connected', 'request-rejected', 'page-error']
          if (event?.source === 'renderer' && kinds.includes(event.kind)) {
            report.diagnostics.push(event.kind); return route.continue()
          }
        }
        if (method === 'POST' && url.pathname === '/api/agent-gateway/v1/conversations/suggestions/dynamic') {
          const response = await route.fetch()
          assert.equal(response.status(), 501, 'Dynamic suggestions remain an explicit dead end; no model/provider runs.')
          report.knownUnavailableWrites ??= []
          report.knownUnavailableWrites.push({ path: url.pathname, status: response.status(), expected: 501 })
          return route.fulfill({ response })
        }
        if (method === 'POST' && url.pathname === '/api/lcos/canvases/' + canvasId + '/execution:reconcile') {
          assert.deepEqual(request.postDataJSON(), {})
          assert.deepEqual(await readRuns(), [])
          report.syncs.push({ path: url.pathname, noRuns: true })
          return route.continue()
        }

        const titlePath = '/api/lcos/core/entities/artifact/' + encodeURIComponent(sourceArtifactId) + '/title'
        if (method === 'POST' && url.pathname === titlePath && stage === 'rename') {
          const body = request.postDataJSON()
          assert.deepEqual(body, { title: changedTitle, mode: 'manual', generatedBy: 'user' })
          const entry = { stage, method, path: url.pathname, body, status: null }
          report.titleRequests.push(entry)
          const response = await route.fetch()
          let payload = null; try { payload = await response.json() } catch { /* body is retained by fulfill below */ }
          entry.status = response.status(); entry.receipt = payload?.value ?? payload
          return route.fulfill({ response, json: payload })
        }

        const batchPath = '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions'
        if (method === 'POST' && url.pathname === batchPath && ['duplicate', 'prepare-copy-move', 'move', 'undo', 'redo'].includes(stage)) {
          const body = request.postDataJSON()
          assert.equal(body.canvas_id, canvasId)
          const actions = body.actions ?? (body.action ? [body.action] : [])
          assert.ok(actions.length > 0)
          const summary = { stage, path: url.pathname, operation: body.lcos_operation ?? null,
            actions: summarizeActions(body), titleEchoes: [], status: null }
          for (const action of actions) {
            if (Array.isArray(action.updates)) for (const update of action.updates) {
              if (update.id === imageNodeId || update.id === duplicateNodeId) {
                if (typeof update.data?.title === 'string') summary.titleEchoes.push({ id: update.id, title: update.data.title })
                assert.ok(['move', 'undo', 'redo', 'prepare-copy-move'].includes(stage), 'Only geometry phases may update an image node.')
                assert.ok(Object.keys(update).every(key => ['id', 'canvas_id', 'type', 'position', 'measured', 'parent_id', 'data', 'lcos_ref'].includes(key)))
              }
            }
            if (stage === 'duplicate') {
              assert.equal(action.action, 'create')
              assert.equal(action.creates?.length, 1)
              const created = action.creates[0]
              assert.equal(created.type, 'image')
              assert.equal(String((created.lcos_ref ?? created.data?.lcos_ref)?.artifactId), sourceArtifactId)
              assert.equal(body.lcos_operation?.kind, 'duplicate-view')
              assert.equal(body.lcos_operation?.phase, 'apply')
            } else {
              assert.equal(action.action, 'update', 'Move/Undo/Redo may change geometry only, not create/delete material.')
              assert.ok(action.updates?.length)
              assert.ok(action.updates.every(update => update.id === duplicateNodeId), 'Only the old duplicate image may move in this phase.')
            }
          }
          report.batches.push(summary)
          const response = await route.fetch()
          let payload = null; try { payload = await response.json() } catch { /* preserve original response below */ }
          summary.status = response.status(); summary.error = payload?.error
          return route.fulfill({ response, json: payload })
        }

        report.blockedWrites.push({ stage, method, path: url.pathname })
        return route.abort('blockedbyclient')
      } catch (error) {
        report.routeErrors.push({ stage, method: route.request().method(), path: new URL(route.request().url()).pathname,
          error: String(error.stack ?? error) })
        await route.abort('blockedbyclient').catch(() => {})
      }
    })
    await context.routeWebSocket('**/*', socket => { report.blockedWebSockets.push(socket.url()); socket.close() })
    page = await context.newPage()
    page.on('pageerror', error => report.pageErrors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); else if (message.type() === 'warning') report.consoleWarnings.push(message.text()) })
    page.on('response', response => {
      try {
        if (new URL(response.url()).origin === origin && response.status() >= 400) {
          report.apiFailures.push({ stage, method: response.request().method(), path: new URL(response.url()).pathname, status: response.status() })
        }
      } catch (error) { report.routeErrors.push({ stage, responseUrl: response.url(), error: String(error) }) }
    })
    stage = 'page-load'
    await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, { timeout: 30000 })
    const originalImageLocator = page.locator(imageNodeSelector(imageNodeId))
    await originalImageLocator.locator('img').first().waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForFunction(id => {
      const image = document.querySelector('.react-flow__node[data-id="' + CSS.escape(id) + '"] img')
      return !!image && image.complete && image.naturalWidth > 0
    }, imageNodeId, { timeout: 15000 })
    const agentPanel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (await agentPanel.isVisible()) await agentPanel.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
    await assertPage('initial')
    assert.equal(await page.locator('.react-flow').count(), 1, 'There must be one original Canvas, not a copied second spatial view.')
    report.initialImageDom = await imageDomFacts(imageNodeId)
    report.cases.push('Fresh isolated original Canvas loads the Core-bound image and only the current native ReactFlow tree.')
    await screenshot('before')

    // Add a second, genuine View using TapNow's own duplicate action. Move that
    // old-title view aside before renaming so it remains a real stale copy.
    stage = 'duplicate'
    const beforeDuplicate = clone(await readCanvas(canvasId))
    await originalImageLocator.click({ button: 'right', position: { x: 120, y: 85 } })
    const duplicateOption = page.getByRole('option', { name: '副本', exact: true })
    await duplicateOption.waitFor({ state: 'visible', timeout: 10000 })
    const duplicateResponse = armResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions', 20000)
    await duplicateOption.click()
    const duplicateResult = await duplicateResponse
    assert.equal(duplicateResult.status(), 200)
    await page.waitForFunction(sourceId => {
      const nodes = window.__LCOS_NODE_LAB__.api.getNodes()
      return nodes.some(node => node.type === 'image' && node.id !== sourceId)
    }, imageNodeId, { timeout: 15000 })
    const afterDuplicate = clone(await readCanvas(canvasId))
    const createdNode = afterDuplicate.nodes.find(node => node.type === 'image' && !beforeDuplicate.nodes.some(row => row.id === node.id))
    assert.ok(createdNode?.id, 'The original duplicate command must create one new native image node.')
    duplicateNodeId = String(createdNode.id)
    assert.equal(String(createdNode.data?.lcos_ref?.artifactId), sourceArtifactId)
    assert.equal(createdNode.data?.lcos_ref?.entityType, 'view')
    duplicateViewId = String(createdNode.data.lcos_ref.artifactViewId)
    assert.equal(afterDuplicate.nodes.length, beforeDuplicate.nodes.length + 1)
    assert.equal(viewsFor(await readGraph(), sourceArtifactId).length, viewsFor(initialGraph, sourceArtifactId).length + 1)
    report.duplicate = { nativeNodeId: duplicateNodeId, artifactId: sourceArtifactId, artifactViewId: duplicateViewId,
      staleTitleBeforeRename: createdNode.data.title }
    assert.equal(createdNode.data.title, initialTitle)

    stage = 'prepare-copy-move'
    const preMovePosition = clone(createdNode.position)
    const prepareBatch = waitBatch('prepare-copy-move')
    await dragNode(duplicateNodeId, 120, 80)
    const prepareResponse = await prepareBatch
    assert.equal(prepareResponse.status(), 200)
    const preparedPosition = await positionOf(duplicateNodeId)
    assert.notDeepEqual(preparedPosition, preMovePosition, 'Move the additional View away so the original remains directly selectable.')
    report.duplicate.preparedPosition = preparedPosition
    stage = 'title-baseline'
    graphBeforeTitle = clone(await readGraph())
    const canvasBeforeTitle = clone(await readCanvas(canvasId))
    report.titleBaseline = { canvasVersion: canvasBeforeTitle.version, batchCount: report.batches.length,
      title: findArtifact(graphBeforeTitle, sourceArtifactId)?.title,
      revisions: revisionsFor(graphBeforeTitle, sourceArtifactId).map(row => String(row.id)),
      views: viewsFor(graphBeforeTitle, sourceArtifactId).map(row => String(row.id)) }
    assert.equal(report.titleBaseline.title, initialTitle)

    stage = 'select-image'
    await selectedImage(imageNodeId)
    const currentTitle = findArtifact(await readGraph(), sourceArtifactId)?.title
    assert.equal(currentTitle, initialTitle)
    const originalBeforeRenameDom = await imageDomFacts(imageNodeId)
    report.selectedBeforeRenameDom = originalBeforeRenameDom
    await screenshot('selected-before-rename')
    const beforeTitleBatchCount = report.batches.length
    stage = 'rename'
    const input = await openF2(imageNodeId)
    assert.equal(await input.inputValue(), initialTitle, 'Original F2 input must initialize from the bound Core descriptor.')
    await input.fill(changedTitle)
    const titleResponse = armResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/lcos/core/entities/artifact/' + encodeURIComponent(sourceArtifactId) + '/title', 15000)
    await page.getByRole('button', { name: '保存名称', exact: true }).click()
    const titleResult = await titleResponse
    assert.equal(titleResult.status(), 200)
    await page.getByRole('textbox', { name: '节点名称', exact: true }).waitFor({ state: 'detached', timeout: 5000 })
    assert.equal(report.titleRequests.length, 1, 'One intentional F2 save must call the Core title owner exactly once.')
    assert.equal(report.titleRequests[0].body.title, changedTitle)
    assert.deepEqual(report.titleRequests[0].receipt, { id: sourceArtifactId, entity: 'artifact', title: changedTitle, mode: 'manual' })
    let graphAfterTitle = clone(await readGraph())
    assert.equal(findArtifact(graphAfterTitle, sourceArtifactId)?.title, changedTitle)
    assert.equal(report.batches.length, beforeTitleBatchCount, 'Artifact metadata rename must create zero Canvas/O8 batches.')
    assert.equal(stable(revisionsFor(graphAfterTitle, sourceArtifactId)), stable(revisionsFor(graphBeforeTitle, sourceArtifactId)),
      'Artifact title metadata does not create a text/image Revision.')
    assert.equal(stable(graphAfterTitle.artifactViews), stable(graphBeforeTitle.artifactViews),
      'Renaming metadata cannot create/remap/move ArtifactViews.')
    assert.equal(stable(graphAfterTitle.fileRecords), stable(graphBeforeTitle.fileRecords), 'Renaming cannot add or replace FileRecords.')
    assert.deepEqual(graphAfterTitle.artifacts.map(row => String(row.id)).sort(), graphBeforeTitle.artifacts.map(row => String(row.id)).sort())
    for (const beforeArtifact of graphBeforeTitle.artifacts) {
      const afterArtifact = findArtifact(graphAfterTitle, String(beforeArtifact.id))
      assert.ok(afterArtifact)
      if (String(beforeArtifact.id) !== sourceArtifactId) assert.deepEqual(afterArtifact, beforeArtifact, 'Unrelated Core Artifact changed.')
      else {
        const normalized = { ...afterArtifact }
        for (const key of ['title', 'updatedAt', 'titleMode', 'title_mode']) delete normalized[key]
        const expected = { ...beforeArtifact }
        for (const key of ['title', 'updatedAt', 'titleMode', 'title_mode']) delete expected[key]
        assert.deepEqual(normalized, expected, 'Only the target Artifact title metadata may change.')
      }
    }
    report.cases.push('Original Gen2 F2 entry → Core Artifact title producer: one metadata POST, no Canvas/O8 batch, Revision, View, FileRecord, or content-byte change.')
    report.afterTitleDom = await imageDomFacts(imageNodeId)
    report.titlePresentationAfterSave = compareVisibleTitle(report.selectedBeforeRenameDom, report.afterTitleDom)
    await screenshot('renamed')

    stage = 'reopen'
    const reopenedInput = await openF2(imageNodeId)
    assert.equal(await reopenedInput.inputValue(), changedTitle, 'Reopened original F2 input must read the current Core descriptor.')
    const titleRequestsBeforeCancel = report.titleRequests.length
    const batchesBeforeCancel = report.batches.length
    stage = 'cancel'
    await reopenedInput.press('Escape')
    await reopenedInput.waitFor({ state: 'detached', timeout: 5000 })
    await page.waitForTimeout(200)
    assert.equal(report.titleRequests.length, titleRequestsBeforeCancel, 'Escape dismisses the existing editor with no Core write.')
    assert.equal(report.batches.length, batchesBeforeCancel, 'Cancel must not fall back to local Canvas rename/history.')
    assert.equal(findArtifact(await readGraph(), sourceArtifactId)?.title, changedTitle)
    assert.deepEqual(report.routeErrors, [])
    report.cases.push('Reopen reads the renamed descriptor; Escape cancels with zero Core title writes and zero Canvas batches.')
    await screenshot('cancelled')

    // The duplicate remains backed by the same Artifact but its live node DTO
    // still carries the old title. Its real move/history must not write that
    // stale presentation field back into Core.
    stage = 'move'
    const staleLocalTitle = await page.evaluate(id => {
      const node = window.__LCOS_NODE_LAB__?.api?.getNode(id) ?? window.__LCOS_NODE_LAB__?.api?.getNodes().find(row => row.id === id)
      return node?.data?.title
    }, duplicateNodeId)
    report.duplicate.staleNativeTitleBeforeMove = staleLocalTitle
    assert.equal(staleLocalTitle, initialTitle, 'The additional View must retain its live old title alias until a fresh canvas projection.')
    const beforeMoveCanvas = clone(await readCanvas(canvasId))
    const beforeMovePosition = clone(beforeMoveCanvas.nodes.find(node => node.id === duplicateNodeId).position)
    const moveBatch = waitBatch('move')
    await dragNode(duplicateNodeId, 145, 95)
    const moveResponse = await moveBatch
    assert.equal(moveResponse.status(), 200, 'The real image drag must be accepted; do not hide unsupported stale-title echoes.')
    movedPosition = await positionOf(duplicateNodeId)
    assert.notDeepEqual(movedPosition, beforeMovePosition)
    const moveSummary = report.batches.filter(row => row.stage === 'move').flatMap(row => row.titleEchoes)
    report.duplicate.moveTitleEchoes = moveSummary
    const graphAfterMove = clone(await readGraph())
    report.coreViewGeometry ??= {}
    report.coreViewGeometry.move = assertViewsUnchangedExceptNativeMove(graphBeforeTitle, graphAfterMove,
      duplicateViewId, movedPosition)
    assert.equal(findArtifact(graphAfterMove, sourceArtifactId)?.title, changedTitle,
      'Moving the stale same-Artifact View must not revert the shared Core title.')
    const afterMoveCanvas = clone(await readCanvas(canvasId))
    assert.equal(afterMoveCanvas.nodes.length, beforeMoveCanvas.nodes.length)
    for (const node of beforeMoveCanvas.nodes.filter(row => row.id !== duplicateNodeId)) {
      assert.equal(stable(afterMoveCanvas.nodes.find(row => row.id === node.id)), stable(node), 'Non-target node changed during image drag: ' + node.id)
    }
    report.cases.push('Real drag of the pre-rename additional image View preserves the Core title and all unrelated canvas nodes.')

    await focusPane()
    stage = 'undo'
    const undoBatch = waitBatch('undo')
    await page.keyboard.press('Control+Z')
    const undoResponse = await undoBatch
    assert.equal(undoResponse.status(), 200)
    const undonePosition = await positionOf(duplicateNodeId)
    assert.deepEqual(undonePosition, beforeMovePosition, 'Original Canvas Ctrl+Z must restore the prior image position.')
    const graphAfterUndo = clone(await readGraph())
    report.coreViewGeometry.undo = assertViewsUnchangedExceptNativeMove(graphBeforeTitle, graphAfterUndo,
      duplicateViewId, undonePosition)
    assert.equal(findArtifact(graphAfterUndo, sourceArtifactId)?.title, changedTitle,
      'Canvas geometry Undo must not undo Core Artifact metadata.')
    report.history = { beforeMovePosition, movedPosition, undonePosition, nativeCtrlZ: true }
    await focusPane()
    stage = 'redo'
    const redoBatch = waitBatch('redo')
    await page.keyboard.press('Control+Shift+Z')
    const redoResponse = await redoBatch
    assert.equal(redoResponse.status(), 200)
    const redonePosition = await positionOf(duplicateNodeId)
    assert.deepEqual(redonePosition, movedPosition, 'Original Canvas Redo must restore the moved image position.')
    const graphAfterRedo = clone(await readGraph())
    report.coreViewGeometry.redo = assertViewsUnchangedExceptNativeMove(graphBeforeTitle, graphAfterRedo,
      duplicateViewId, redonePosition)
    assert.equal(findArtifact(graphAfterRedo, sourceArtifactId)?.title, changedTitle,
      'Canvas geometry Redo must preserve the Core Artifact metadata title.')
    report.history.redonePosition = redonePosition
    report.history.nativeRedo = true
    report.cases.push('Original Canvas Ctrl+Z/Redo replays only the real image movement; Core title stays renamed throughout.')
    await screenshot('after-redo')

    stage = 'reload'
    const beforeReload = clone(await readCanvas(canvasId))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, { timeout: 30000 })
    await page.locator(imageNodeSelector(imageNodeId)).locator('img').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForFunction(id => {
      const image = document.querySelector('.react-flow__node[data-id="' + CSS.escape(id) + '"] img')
      return !!image && image.complete && image.naturalWidth > 0
    }, imageNodeId, { timeout: 15000 })
    await assertPage('reload')
    const afterReloadCanvas = clone(await readCanvas(canvasId))
    assert.equal(stable(afterReloadCanvas), stable(beforeReload), 'Reload must recover the same native image nodes and geometry.')
    assert.equal(await page.locator('.react-flow').count(), 1)
    graphAfterTitle = clone(await readGraph())
    assert.equal(findArtifact(graphAfterTitle, sourceArtifactId)?.title, changedTitle)
    assert.equal(stable(revisionsFor(graphAfterTitle, sourceArtifactId)), stable(revisionsFor(graphBeforeTitle, sourceArtifactId)))
    const finalNativeDuplicate = afterReloadCanvas.nodes.find(node => node.id === duplicateNodeId)
    assert.ok(finalNativeDuplicate)
    report.coreViewGeometryOwner = assertViewsUnchangedExceptNativeMove(graphBeforeTitle, graphAfterTitle,
      duplicateViewId, finalNativeDuplicate.position)
    assert.equal(stable(graphAfterTitle.fileRecords), stable(graphBeforeTitle.fileRecords))
    assert.deepEqual(await readRuns(), [])
    assert.equal(stable(await readPresentations()), stable(presentationsBefore))
    for (const [id, saved] of otherCanvasesBefore) assert.equal(stable(await readCanvas(id)), stable(saved), 'Unrelated Canvas changed: ' + id)
    assert.equal(afterReloadCanvas.nodes.find(node => node.id === imageNodeId)?.data?.title, changedTitle)
    assert.equal(afterReloadCanvas.nodes.find(node => node.id === duplicateNodeId)?.data?.title, changedTitle)
    for (const [fileId, bytes] of protectedFiles) assert.deepEqual(await bytesFor(fileId), bytes, 'Existing FileRecord bytes changed: ' + fileId)
    assert.deepEqual(report.routeErrors, [])
    assert.deepEqual(report.blockedWrites, [])
    assert.deepEqual(report.pageErrors, [])
    assert.equal(report.titleRequests.length, 1)
    assert.equal(report.batches.filter(row => row.stage === 'rename' || row.stage === 'cancel').length, 0)
    const titlePath = '/api/lcos/core/entities/artifact/' + encodeURIComponent(sourceArtifactId) + '/title'
    const batchPath = '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions'
    const reconcilePath = '/api/lcos/canvases/' + canvasId + '/execution:reconcile'
    const knownUnavailablePath = '/api/agent-gateway/v1/conversations/suggestions/dynamic'
    const generationHistoryPath = '/api/canvas/v1/canvases/' + canvasId + '/nodes/'
      + encodeURIComponent(imageNodeId) + '/generation-history'
    const known501 = report.apiFailures.filter(row => row.status === 501 && (
      row.method === 'POST' && row.path === knownUnavailablePath
      || row.method === 'POST' && row.path === reconcilePath
        && report.syncs.some(item => item.path === reconcilePath && item.noRuns)
      || row.method === 'GET' && row.path === generationHistoryPath
    ))
    const unexpectedApiFailures = report.apiFailures.filter(row => {
      return row.status !== 501 || !known501.includes(row)
    })
    report.apiFailureClassification = { knownUnavailable501: known501, unexpected: unexpectedApiFailures }
    assert.deepEqual(unexpectedApiFailures, [], 'Target title/history failures and unknown API failures remain fatal; only exact known 501 paths are non-fatal.')
    report.finalImageDom = await imageDomFacts(imageNodeId)
    report.titlePresentationAfterReload = compareVisibleTitle(report.initialImageDom, report.finalImageDom)
    report.pageChecks.push({ label: 'reloaded-image-presentation', visibleImageTitle: report.titlePresentationAfterReload.newTitleVisible,
      note: 'If original image UI does not display title, no replacement header is created by this test.' })
    report.cases.push('Real reload preserves Core title, native image identity/positions, exact Views/Revisions/FileRecords, unrelated canvases/materials, and bytes.')
    report.passed = true
  } catch (error) {
    report.failure = String(error.stack ?? error)
    report.failedStage = stage
    if (page) {
      report.failureUrl = page.url()
      report.failureBody = (await page.locator('body').innerText().catch(() => '')).slice(-10000)
      await screenshot('failure').catch(() => {})
    }
  } finally {
    await context?.close().catch(() => {})
    await browser?.close().catch(() => {})
    if (facade) {
      try { await facade.close(); report.bootstrapFacadeClosed = true }
      catch (error) { report.bootstrapFacadeClosed = false; report.bootstrapCloseError = String(error) }
    }
    try {
      if (!serverPid && launcher) {
        const candidates = [...stdout.matchAll(/Isolated full-integration child PID:\s*(\d+)/g)].map(match => Number(match[1]))
        if (new Set(candidates).size === 1) serverPid = candidates[0]
      }
      if (serverPid) {
        const response = origin && await originalFetch(origin + '/health', { redirect: 'error', cache: 'no-store' }).catch(() => undefined)
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
      const probe = port => port === undefined ? Promise.resolve(false) : new Promise(resolve => {
        const socket = net.connect({ host: '127.0.0.1', port })
        socket.once('connect', () => { socket.destroy(); resolve(true) })
        socket.once('error', () => resolve(false))
      })
      const listener = await probe(uiPort)
      const coreListener = bootstrapCoreOrigin ? await probe(Number(new URL(bootstrapCoreOrigin).port)) : false
      report.launcher.listenerAfterStop = listener
      report.launcher.bootstrapCoreListenerAfterClose = coreListener
      const launcherSafe = !launcher || launcher.exitCode !== null && report.launcher.launcherExited === true
      const serverSafe = !serverPid || report.launcher.cleanupServer?.exited === true
      const facadeSafe = report.bootstrapCloseError === undefined
        && (!bootstrapCoreOrigin || report.bootstrapFacadeClosed === true) && !coreListener
      if (runtimePrepared && launcherSafe && serverSafe && facadeSafe && !listener && await exists(runtimeRoot)) {
        const base = await realpath(runtimeBase), target = await realpath(runtimeRoot), relative = path.relative(base, target)
        assert.equal(relative, runtimeLabel)
        assert.match(path.basename(target), /^isolated-native-image-title-\d+$/)
        assert.equal(path.isAbsolute(relative), false)
        await rm(target, { recursive: true, force: true })
        report.runtimeRemoved = true
        runtimePrepared = false
      } else if (runtimePrepared) report.runtimeRetainedForRecovery = true
    } catch (error) { report.cleanupError = String(error.stack ?? error); report.runtimeRetainedForRecovery = true }
    globalThis.fetch = originalFetch
    report.launcher.launcherClosed = launcherClosed ?? null
    report.launcher.stdoutTail = stdout; report.launcher.stderrTail = stderr
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
    console.log(JSON.stringify({ passed: report.passed, runtimeLabel, origin, titleRequests: report.titleRequests,
      batches: report.batches.map(row => ({ stage: row.stage, status: row.status, operation: row.operation, titleEchoes: row.titleEchoes })),
      cases: report.cases, titlePresentationAfterSave: report.titlePresentationAfterSave,
      titlePresentationAfterReload: report.titlePresentationAfterReload,
      failure: report.failure, cleanupError: report.cleanupError,
      runtimeRemoved: report.runtimeRemoved, runtimeRetainedForRecovery: report.runtimeRetainedForRecovery, reportPath }, null, 2))
    if (!report.passed) process.exitCode = 1
  }
}
