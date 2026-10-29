import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'
import { createOutlineSourceSession } from '../lab/pilot/native-outline-source.ts'
import { matchesProcessIdentity, queryCommandLine, reserveLoopbackPort, stopExactProcess,
  waitForCommandLine, waitForExit, waitForHealth, waitForProcessGone } from './native-execution-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
const runtimeLabel = 'isolated-gen1-structure-' + Date.now()
const runtimeRoot = path.join(runtimeBase, runtimeLabel)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const reportPath = path.join(runtimeBase, 'native-gen1-structure', stamp + '.json')
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
const projectId = 'disposable-surface-core-facade'
const canvasId = 'surface-core-context'
const nodeId = 'surface-context-text'
const delayUndoFacts = process.argv.includes('--delay-undo-facts')
const source = '# Structure fixture\r\n- Parent\r\n  - **Lift me** #keep\r\n    - Grandchild\r\n- Anchor\r\n\r\n```ts\r\nconst keep = "opaque";\r\n```\r\n'
const stable = value => JSON.stringify(value)
const bodyOf = node => node.data.text ?? node.data.content
const snapshotNode = node => ({ id: node.id, type: node.type, position: node.position,
  parent_id: node.parent_id ?? node.parentId ?? null, measured: node.measured,
  width: node.width ?? null, height: node.height ?? null, data: node.data })
const canvasSnapshot = canvas => ({ id: canvas.id, version: canvas.version, nodes: canvas.nodes.map(snapshotNode),
  edges: canvas.edges ?? [], viewport: canvas.viewport ?? null })
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
  const report = { at: new Date().toISOString(), passed: false, runtimeLabel, runtimeRoot, reportPath,
    delayUndoFacts,
    flow: 'original text mindmap → real lift/cut/paste/add/delete/cancel/save → original O8 Undo/Redo → real reload',
    fixture: { kind: 'fresh synthetic Core project and one existing text; no real project files', source },
    browser: { viewport: { width: 1440, height: 1000 }, engine: 'installed Chrome', browserPluginAvailable: false,
      fallback: 'Browser plugin/skill absent; existing repository playwright-core', serviceWorkers: 'blocked' },
    providerExecution: false, modelExecution: false, fixtureWrites: [], batches: [], diagnostics: [], syncs: [],
    blockedWrites: [], blockedHttp: [], blockedWebSockets: [], deniedNodeFetches: [],
    pageErrors: [], consoleErrors: [], consoleWarnings: [], apiFailures: [], cases: [], screenshots: [], launcher: {} }
  for (const key of ['LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LCOS_CODEX_AUTO_EXECUTION',
    'LCOS_WORKBUDDY_AUTO_EXECUTION', 'HUABU_HOST_URL', 'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN',
    'HUABU_AGENTLET_ID', 'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD', 'HUABU_DATA_DIR',
    'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON', 'LCOS_OLLAMA_EMBED_MODEL']) delete process.env[key]
  Object.assign(process.env, { LCOS_RECOVERY_TRANSPORT: 'none', LCOS_OLLAMA_URL: 'http://127.0.0.1:1',
    LCOS_CAPTURE_STAGING_ROOT: path.join(runtimeRoot, 'capture'), LCOS_OCR_RUNTIME_DIR: path.join(runtimeRoot, 'ocr') })
  let facade, browser, context, page, launcher, serverPid, uiPort, origin, bootstrapping = false, stage = 'loading'
  let stdout = '', stderr = '', expectedTextRef, expectedBody, latestCanvas
  let heldFacts = false, undoFactsRevision, releaseFacts, factsStartedResolve, factsDoneResolve
  const factsGate = new Promise(resolve => { releaseFacts = resolve })
  const factsStarted = new Promise(resolve => { factsStartedResolve = resolve })
  const factsDone = new Promise(resolve => { factsDoneResolve = resolve })
  const allowedOrigins = new Set()
  const originalFetch = globalThis.fetch.bind(globalThis)
  const bootstrapOrigins = () => process._getActiveHandles().filter(handle => handle instanceof net.Server && handle.listening)
    .map(handle => handle.address()).filter(address => address && typeof address !== 'string' && address.address === '127.0.0.1')
    .map(address => 'http://127.0.0.1:' + address.port)
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const bootstrap = bootstrapping ? bootstrapOrigins() : []
    if (url.protocol === 'http:' && (allowedOrigins.has(url.origin) || bootstrap.length === 1 && bootstrap[0] === url.origin)) return originalFetch(input, init)
    report.deniedNodeFetches.push({ origin: url.origin, path: url.pathname })
    throw new Error('Only this test-owned loopback Core/UI origin is allowed; model endpoint is blocked.')
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
  async function readBundle() {
    const value = await get(appCore('/curation/canvas-text?') + new URLSearchParams({ canvasId, spatialId: nodeId }))
    const revisions = await get('/api/lcos/core/artifacts/' + encodeURIComponent(value.artifactId) + '/revisions')
    const fileResponse = await fetch(origin + appCore('/file-records/' + encodeURIComponent(value.fileRecordId) + '/content'), { redirect: 'error', cache: 'no-store' })
    assert.equal(fileResponse.status, 200)
    const bytes = Buffer.from(await fileResponse.arrayBuffer())
    assert.equal(bytes.toString('utf8'), value.body)
    assert.ok(revisions.some(revision => String(revision.id) === value.revisionId))
    return { value, revisions, byteLength: bytes.length, fileBytesEqual: true }
  }
  async function screenshot(label) {
    const target = path.join(visualRoot, 'tapnow-native-gen1-structure-' + stamp + '-' + label + '.png')
    await page.screenshot({ path: target, fullPage: false })
    report.screenshots.push({ label, path: target })
  }
  const history = () => page.evaluate(({ canvasId, nodeId }) => window.__LCOS_NODE_LAB__?.api?.inspectNativeHistory({ canvasId, nodeId }), { canvasId, nodeId })
  const topic = (dialog, label) => dialog.locator('g.lcos-mindmap-topic').filter({ hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') })
  async function graphKey(dialog, label, key) {
    const target = topic(dialog, label)
    assert.equal(await target.count(), 1, 'Expected one exact original topic: ' + label)
    await target.click()
    assert.equal(await page.evaluate(() => document.activeElement instanceof HTMLInputElement), false,
      'Graph commands must not be sent to the inline branch input.')
    await page.keyboard.press(key)
  }
  async function openEditor() {
    await page.locator('.react-flow__node[data-id="' + nodeId + '"]').getByRole('button', { name: '编辑导图', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '编辑大纲导图', exact: true })
    await dialog.waitFor({ state: 'visible' })
    const controls = await dialog.evaluate(element => {
      const actions = [...element.querySelectorAll('.inline-note-editor-hud button')].map(button => {
        const r = button.getBoundingClientRect(), icon = button.querySelector('svg'), ir = icon?.getBoundingClientRect()
        return { label: button.getAttribute('aria-label') ?? button.textContent, width: r.width, height: r.height,
          icon: ir ? { width: ir.width, height: ir.height } : null }
      })
      const style = getComputedStyle(element), link = element.querySelector('.lcos-mindmap-link')
      return { color: style.color, background: style.backgroundColor, actions,
        linkFill: link ? getComputedStyle(link).fill : null }
    })
    assert.notEqual(controls.color, controls.background, 'Portal text must not inherit invisible page text colors.')
    for (const action of controls.actions) {
      assert.ok(action.height > 0 && action.height <= 44, 'Original map controls must remain compact and usable: ' + action.label)
      if (action.icon) assert.ok(action.icon.width <= 16 && action.icon.height <= 16)
    }
    assert.equal(controls.linkFill, 'none', 'The existing map links must be strokes, not filled wedges.')
    report.mapControls = controls
    return dialog
  }
  async function commitInput(dialog, label) {
    const input = dialog.locator('input')
    await input.waitFor({ state: 'visible' })
    await input.fill(label)
    await dialog.locator('header strong').click()
    await input.waitFor({ state: 'detached' })
    assert.equal(await topic(dialog, label).count(), 1)
  }
  async function settleHistory(expectedSize, expectedIndex) {
    await page.waitForFunction(({ canvasId, nodeId, expectedSize, expectedIndex }) => {
      const h = window.__LCOS_NODE_LAB__?.api?.inspectNativeHistory({ canvasId, nodeId })
      return h?.ok === true && h.historySize === expectedSize && h.currentIndex === expectedIndex
    }, { canvasId, nodeId, expectedSize, expectedIndex }, { timeout: 10000 })
    return history()
  }
  async function focusCanvas() {
    const point = await page.locator('.react-flow__pane').first().evaluate(element => {
      const r = element.getBoundingClientRect()
      for (const fy of [.08, .16, .84, .92]) for (const fx of [.08, .16, .84, .92]) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy, hit = document.elementFromPoint(x, y)
        if (hit?.closest('.react-flow__pane') && !hit.closest('.react-flow__node,button,input,textarea,[contenteditable="true"],.react-flow__controls,.react-flow__minimap')) return { x, y }
      }
    })
    assert.ok(point, 'A real unobstructed Canvas point is required for native keyboard history.')
    await page.mouse.click(point.x, point.y)
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('input,textarea,[contenteditable="true"]')), false)
  }
  async function saveEditor(dialog, label, beforeBundle, beforeHistory) {
    stage = label
    expectedBody = undefined
    const count = report.batches.length
    const responsePromise = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions', { timeout: 30000 })
    responsePromise.catch(() => {})
    await dialog.getByRole('button', { name: '保存导图', exact: true }).click()
    assert.equal((await responsePromise).status(), 200)
    await dialog.waitFor({ state: 'hidden', timeout: 20000 })
    const bundle = await readBundle()
    assert.equal(bundle.revisions.length, beforeBundle.revisions.length + 1)
    assert.equal(bundle.value.artifactId, beforeBundle.value.artifactId)
    assert.equal(bundle.value.viewId, beforeBundle.value.viewId)
    assert.equal(report.batches.length, count + 1, 'One map save must use one original native batch.')
    const h = await settleHistory(beforeHistory.historySize + 1, beforeHistory.currentIndex + 1)
    report.cases.push(label + ': original dialog save → one O8 entry/native batch/Core revision; exact FileRecord bytes')
    return { bundle, history: h }
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
  function assertOpaque(body) {
    assert.ok(body.includes('```ts\r\nconst keep = "opaque";\r\n```\r\n'), 'Original opaque fence and CRLF bytes must survive structure editing.')
    assert.ok(body.includes('**Lift me** #keep'), 'Original bold and tag must survive structure editing.')
  }
  function entries(body) {
    const result = []
    const walk = (nodes, parent = null) => { for (const node of nodes) { result.push({ text: node.text, parent, depth: node.depth }); walk(node.children, node.text) } }
    walk(createOutlineSourceSession(body).parseOutline())
    return result
  }
  try {
    uiPort = await reserveLoopbackPort()
    assert.ok(![17879, 17880, 17881].includes(uiPort))
    origin = 'http://127.0.0.1:' + uiPort
    report.origin = origin; report.uiPort = uiPort
    const bundlePath = path.join(runtimeRoot, 'bootstrap', 'facade.mjs')
    await buildPilotEntry('lab/pilot/surface-core-facade.ts', bundlePath)
    const { startSurfaceCoreFacade } = await import(pathToFileURL(bundlePath).href)
    assert.deepEqual(bootstrapOrigins(), [])
    bootstrapping = true
    try { facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true }) }
    finally { bootstrapping = false }
    allowedOrigins.add(facade.core.origin)
    const facadeData = async (method, pathname, body) => {
      const r = await facade.handle({ method, pathname, url: new URL(pathname, origin), body })
      assert.equal(r.status, 200, stable(r.body)); assert.equal(r.body.code, 0)
      if (method !== 'GET') report.fixtureWrites.push({ method, path: pathname, status: r.status, bootstrapOnly: true })
      return r.body.data
    }
    const before = await facadeData('GET', '/api/canvas/v1/canvases/' + canvasId)
    const textNode = before.nodes.find(node => node.id === nodeId)
    assert.equal(textNode.data.lcos_ref.entityType, 'artifact')
    await facadeData('POST', '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions', {
      canvas_id: canvasId, actions: [{ action: 'update', updates: [{ id: nodeId, type: textNode.type,
        data: { ...textNode.data, text: source, content: source } }] }],
      lcos_expected_revisions: { [nodeId]: textNode.data.lcos_ref.revisionId } })
    // Premeasure the existing synthetic image so no unrelated DOM normalization
    // is hidden in the actual structural interaction assertions.
    await facade.spatial.execute(canvasId, [{ type: 'SET_NODE_GEOMETRY', items: [
      { nodeId: 'surface-context-image', size: { width: 375, height: 250 } },
      { nodeId, position: { x: 620, y: 160 }, size: { width: 420, height: 320 } },
    ] }])
    report.fixture.premeasuredImage = true
    await facade.close(); facade = undefined
    allowedOrigins.clear(); allowedOrigins.add(origin)
    launcher = spawn(process.execPath, [path.join(root, 'scripts/start-full-integration.mjs'),
      '--runtime-label=' + runtimeLabel, '--port=' + uiPort], { cwd: root, windowsHide: true,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        LCOS_RECOVERY_TRANSPORT: 'none', LCOS_OLLAMA_URL: 'http://127.0.0.1:1' }, stdio: ['ignore', 'pipe', 'pipe'] })
    launcher.stdout.setEncoding('utf8').on('data', chunk => { stdout = (stdout + chunk).slice(-16000) })
    launcher.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-16000) })
    const launcherState = { closed: undefined }
    launcher.once('close', (code, signal) => { launcherState.closed = { code, signal } })
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
    const beforeBundle = await readBundle()
    assert.equal(beforeBundle.value.body, source)
    expectedTextRef = { artifactId: beforeBundle.value.artifactId, artifactViewId: beforeBundle.value.viewId }
    report.beforeBundle = beforeBundle
    latestCanvas = await readCanvas(canvasId)
    const beforeCanvases = new Map()
    for (const id of ['surface-core-main', 'surface-core-context', 'surface-core-workflow']) beforeCanvases.set(id, canvasSnapshot(await readCanvas(id)))
    const graphBefore = await get(appCore('/graph'))
    const presentationsBefore = await get(appCore('/presentations'))
    const runsBefore = await get(appCore('/runs'))
    assert.deepEqual(runsBefore, [])
    const protectedFiles = new Map()
    for (const file of graphBefore.fileRecords) {
      const r = await fetch(origin + appCore('/file-records/' + encodeURIComponent(file.id) + '/content'), { redirect: 'error' })
      assert.equal(r.status, 200); protectedFiles.set(String(file.id), Buffer.from(await r.arrayBuffer()))
    }
    const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: report.browser.viewport, locale: 'zh-CN', serviceWorkers: 'block' })
    // Deny OS clipboard access in this single fresh incognito context. The
    // original editor's own branch clipboard remains the actual fallback.
    const cdp = await browser.newBrowserCDPSession()
    const { browserContextIds } = await cdp.send('Target.getBrowserContexts')
    assert.equal(browserContextIds.length, 1)
    await cdp.send('Browser.grantPermissions', { permissions: [], origin, browserContextId: browserContextIds[0] })
    report.browser.osClipboardAccess = 'denied by real browser permission; original in-editor fallback only'
    await context.route('**/*', async route => { try {
      const request = route.request(), url = new URL(request.url()), method = request.method().toUpperCase()
      if (['data:', 'blob:'].includes(url.protocol)) return route.continue()
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
        report.blockedHttp.push({ method, origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient')
      }
      if (delayUndoFacts && stage === 'undo' && !heldFacts && method === 'GET'
        && url.pathname === '/api/lcos/core/artifacts/' + expectedTextRef.artifactId) {
        let heldThisResponse = false
        try {
          const response = await route.fetch()
          const payload = await response.json()
          assert.equal(response.status(), 200); assert.equal(payload.ok, true)
          if (!undoFactsRevision || payload.value?.artifact?.currentRevisionId !== undoFactsRevision) {
            await route.fulfill({ response, json: payload })
            return
          }
          heldFacts = true
          heldThisResponse = true
          report.delayedFacts = { capturedRevisionId: payload.value?.artifact?.currentRevisionId,
            artifactId: payload.value?.artifact?.id, realCoreResponse: true, fabricatedResponse: false }
          factsStartedResolve()
          await factsGate
          try { await route.fulfill({ response, json: payload }); report.delayedFacts.delivered = true }
          catch (error) { report.delayedFacts.cancelledByClient = String(error.message ?? error) }
        } finally { if (heldThisResponse) factsDoneResolve() }
        return
      }
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.continue()
      if (method === 'POST' && url.pathname === '/api/events') {
        const data = request.postDataJSON()
        const kinds = ['diagnostics-installed', 'remote-fetch-attempt', 'remote-fetch-blocked', 'http-failed',
          'fetch-failed', 'csp-blocked', 'action-not-connected', 'request-rejected', 'page-error']
        if (data?.source === 'renderer' && kinds.includes(data.kind)) { report.diagnostics.push(data.kind); return route.continue() }
      }
      if (method === 'POST' && url.pathname === '/api/agent-gateway/v1/conversations/suggestions/dynamic') {
        const response = await route.fetch()
        assert.equal(response.status(), 501, 'Do not silently admit an executable Agent backend.')
        return route.fulfill({ response })
      }
      if (method === 'POST' && url.pathname === '/api/lcos/canvases/' + canvasId + '/execution:reconcile') {
        assert.deepEqual(request.postDataJSON(), {})
        assert.deepEqual(await get(appCore('/runs')), [])
        report.syncs.push({ path: url.pathname, noRuns: true }); return route.continue()
      }
      const batchPath = '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions'
      if (method === 'POST' && url.pathname === batchPath && ['mode', 'lift-apply', 'undo', 'redo', 'compound-apply'].includes(stage)) {
        const body = request.postDataJSON()
        assert.deepEqual(Object.keys(body).filter(key => !['canvas_id', 'actions', 'lcos_expected_revisions', 'created_by_role', 'lcos_refs'].includes(key)), [])
        if (body.created_by_role !== undefined) assert.equal(body.created_by_role, 'user')
        assert.equal(body.canvas_id, canvasId)
        assert.equal(body.actions.length, 1)
        assert.equal(body.actions[0].action, 'update')
        assert.ok(Object.keys(body.actions[0]).every(key => ['action', 'updates', 'canvas_id'].includes(key)))
        if (body.actions[0].canvas_id !== undefined) assert.equal(body.actions[0].canvas_id, canvasId)
        assert.equal(body.actions[0].updates.length, 1)
        const update = body.actions[0].updates[0]
        assert.equal(update.id, nodeId, 'Structural editing cannot write any other Canvas node.')
        assert.ok(Object.keys(update).every(key => ['id', 'canvas_id', 'type', 'data', 'position', 'measured', 'parent_id', 'lcos_ref'].includes(key)))
        const current = await readCanvas(canvasId), currentNode = current.nodes.find(node => node.id === nodeId)
        if (update.type !== undefined) assert.equal(update.type, currentNode.type)
        if (update.canvas_id !== undefined) assert.equal(update.canvas_id, canvasId)
        if (update.parent_id !== undefined) assert.equal(update.parent_id, currentNode.parent_id ?? '')
        assert.ok(update.data && typeof update.data === 'object')
        const data = update.data
        const validateRef = ref => {
          assert.equal(ref.version, 1); assert.equal(ref.entityType, 'artifact')
          assert.equal(ref.entityId, expectedTextRef.artifactId); assert.equal(ref.artifactId, expectedTextRef.artifactId)
          assert.equal(ref.artifactViewId, expectedTextRef.artifactViewId)
          assert.equal(typeof ref.revisionId, 'string')
        }
        if (update.lcos_ref !== undefined) validateRef(update.lcos_ref)
        if (body.lcos_refs !== undefined) {
          assert.ok(body.lcos_refs && typeof body.lcos_refs === 'object' && !Array.isArray(body.lcos_refs))
          assert.ok(Object.keys(body.lcos_refs).every(id => id === nodeId))
          if (body.lcos_refs[nodeId] !== undefined) validateRef(body.lcos_refs[nodeId])
        }
        for (const [key, value] of Object.entries(data)) {
          if (['text', 'content', 'lcosTextViewMode', 'lcosTextCollapsedIds', 'lcosTextBeforeMindMapSize'].includes(key)) continue
          if (key === 'lcos_ref') {
            validateRef(value)
          } else if (key !== 'lcos_revision_id') assert.equal(stable(value), stable(currentNode.data[key]), 'Unrelated data rewrite: ' + key)
        }
        const bodyChange = typeof (data.text ?? data.content) === 'string' && (data.text ?? data.content) !== bodyOf(currentNode)
        if (stage === 'mode') assert.equal(bodyChange, false)
        else {
          assert.equal(bodyChange, true, 'Body history phases must be actual text changes, not geometry echoes.')
          assert.deepEqual(body.lcos_expected_revisions, { [nodeId]: currentNode.data.lcos_ref.revisionId })
          if (expectedBody !== undefined) assert.equal(data.text ?? data.content, expectedBody)
          if (update.position !== undefined) assert.deepEqual(update.position, currentNode.position)
          if (update.measured !== undefined) assert.deepEqual(update.measured, currentNode.measured)
        }
        const entry = { stage, path: url.pathname, beforeVersion: current.version, body, status: null }
        report.batches.push(entry)
        const response = await route.fetch()
        const payload = await response.json()
        entry.status = response.status(); entry.receipt = payload.data ?? payload
        assert.equal(response.status(), 200, stable(payload)); assert.equal(payload.code, 0)
        if (stage === 'undo') undoFactsRevision = payload.data?.lcos_expected_revisions?.[nodeId]
        const saved = await readCanvas(canvasId)
        entry.afterVersion = saved.version
        assert.equal(saved.version, current.version + 1, 'One original native batch must produce exactly one Canvas version.')
        for (const node of current.nodes.filter(node => node.id !== nodeId)) {
          assert.equal(stable(snapshotNode(saved.nodes.find(item => item.id === node.id))), stable(snapshotNode(node)))
        }
        latestCanvas = saved
        return route.fulfill({ response, json: payload })
      }
      report.blockedWrites.push({ stage, method, path: url.pathname })
      return route.abort('blockedbyclient')
    } catch (error) {
      report.routeErrors ??= []
      report.routeErrors.push({ stage, method: route.request().method(), path: new URL(route.request().url()).pathname,
        error: String(error.stack ?? error) })
      await route.abort('blockedbyclient').catch(() => {})
    }
    })
    await context.routeWebSocket('**/*', socket => { report.blockedWebSockets.push(socket.url()); socket.close() })
    page = await context.newPage()
    page.on('pageerror', error => report.pageErrors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); else if (message.type() === 'warning') report.consoleWarnings.push(message.text()) })
    page.on('response', response => { if (new URL(response.url()).origin === origin && response.status() >= 400) report.apiFailures.push({ method: response.request().method(), path: new URL(response.url()).pathname, status: response.status() }) })
    await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded' })
    await page.locator('[data-lcos-native-text-body="' + nodeId + '"] [data-lcos-inline-text][data-state="ready"]').waitFor({ state: 'visible', timeout: 30000 })
    const agentPanel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (await agentPanel.isVisible()) await agentPanel.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
    await assertPage('initial')
    const clipboardPermission = await page.evaluate(async () => ({ read: (await navigator.permissions.query({ name: 'clipboard-read' })).state,
      write: (await navigator.permissions.query({ name: 'clipboard-write' })).state }))
    assert.deepEqual(clipboardPermission, { read: 'denied', write: 'denied' })
    assert.equal(await page.evaluate(() => typeof navigator.clipboard?.writeText === 'function'), true)
    report.browser.clipboardPermission = clipboardPermission
    const initialHistory = await history()
    stage = 'mode'
    const targetNode = page.locator('.react-flow__node[data-id="' + nodeId + '"]')
    await targetNode.locator('[data-lcos-text-face-mode="mindmap"]').click()
    await page.waitForFunction(({ nodeId }) => document.querySelector('.react-flow__node[data-id="' + nodeId + '"] [data-lcos-text-face-mode="mindmap"]')?.getAttribute('aria-selected') === 'true', { nodeId })
    const modeHistory = await settleHistory(initialHistory.historySize + 1, initialHistory.currentIndex + 1)
    assert.equal(report.batches.length, 1)
    assert.equal((await readBundle()).value.revisionId, beforeBundle.value.revisionId)
    const beforeStructureCanvas = await readCanvas(canvasId)
    report.cases.push('Original mindmap tab persists one presentation/geometry history step without a Core text revision')
    let dialog = await openEditor()
    const beforeDepthClass = await topic(dialog, 'Lift me').getAttribute('class')
    await graphKey(dialog, 'Lift me', 'Shift+Tab')
    const afterDepthClass = await topic(dialog, 'Lift me').getAttribute('class')
    const depthClass = value => Number(value.match(/\bdepth-(\d+)\b/)?.[1])
    assert.equal(depthClass(afterDepthClass), depthClass(beforeDepthClass) - 1,
      'The actual graph depth must decrease; selection styling is not structural evidence.')
    report.lift = { beforeDepthClass, afterDepthClass, realKeyboard: 'Shift+Tab' }
    await screenshot('lift-before-save')
    const applied = await saveEditor(dialog, 'lift-apply', beforeBundle, modeHistory)
    assertOpaque(applied.bundle.value.body)
    const appliedRows = entries(applied.bundle.value.body)
    assert.deepEqual(appliedRows.find(row => row.text === 'Lift me'), { text: 'Lift me', parent: 'Structure fixture', depth: 1 })
    assert.deepEqual(appliedRows.find(row => row.text === 'Grandchild'), { text: 'Grandchild', parent: 'Lift me', depth: 2 })
    report.lift.savedRows = appliedRows
    await screenshot('lift-saved')
    await focusCanvas()
    const undoCount = report.batches.length
    stage = 'undo'; expectedBody = source
    const undoResponse = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/nodes:batchActions'))
    undoResponse.catch(() => {})
    await page.keyboard.press('Control+Z')
    assert.equal((await undoResponse).status(), 200)
    await settleHistory(applied.history.historySize, modeHistory.currentIndex)
    const undone = await readBundle()
    assert.equal(undone.value.body, source)
    assert.equal(undone.revisions.length, applied.bundle.revisions.length + 1)
    assert.equal(report.batches.length, undoCount + 1)
    if (delayUndoFacts) {
      await Promise.race([factsStarted, new Promise((_, reject) => setTimeout(() => reject(new Error('Original slot did not start its Undo revision facts refresh.')), 10000))])
      assert.equal(report.delayedFacts?.capturedRevisionId, undone.value.revisionId)
      assert.equal(report.delayedFacts?.artifactId, undone.value.artifactId)
    }
    stage = 'redo'; expectedBody = applied.bundle.value.body
    const redoResponse = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/nodes:batchActions'))
    redoResponse.catch(() => {})
    await page.keyboard.press('Control+Shift+Z')
    assert.equal((await redoResponse).status(), 200)
    await settleHistory(applied.history.historySize, applied.history.currentIndex)
    const redone = await readBundle()
    assert.equal(redone.value.body, applied.bundle.value.body)
    assert.equal(redone.revisions.length, undone.revisions.length + 1)
    if (delayUndoFacts) {
      releaseFacts()
      await factsDone
      report.delayedFacts.releasedAfterRevisionId = redone.value.revisionId
      assert.notEqual(report.delayedFacts.capturedRevisionId, redone.value.revisionId)
      report.cases.push('A real Undo facts response is held until after Redo; late read cannot roll the continuous editor back to the old Core revision')
    }
    report.history = { before: modeHistory, afterApply: applied.history, afterUndo: undone, afterRedo: redone, originalKeyboard: true }
    report.cases.push('Original Canvas Ctrl+Z/Shift+Z restore exact pre/post structural body through one batch and one new Core revision each')
    await screenshot('after-original-redo')
    // Cancel uses the explicit original button, never the save-on-outside scrim.
    stage = 'cancel'
    const beforeCancel = canvasSnapshot(await readCanvas(canvasId)), cancelHistory = await history(), cancelBatches = report.batches.length
    dialog = await openEditor()
    await topic(dialog, 'Anchor').dblclick()
    await commitInput(dialog, 'UNSAVED CANCELLED LABEL')
    await dialog.getByRole('button', { name: '取消编辑', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(stable(canvasSnapshot(await readCanvas(canvasId))), stable(beforeCancel))
    assert.equal(report.batches.length, cancelBatches)
    assert.equal((await readBundle()).value.revisionId, redone.value.revisionId)
    assert.equal((await history()).currentIndex, cancelHistory.currentIndex)
    report.cases.push('Original explicit Cancel discards the branch draft with zero Canvas/Core/O8 write')
    // Cross-level cut/paste and full-subtree copy are actual editor operations;
    // the real browser denies OS clipboard writes, exercising its existing fallback.
    dialog = await openEditor()
    await graphKey(dialog, 'Lift me', 'Control+X')
    await dialog.getByRole('status').filter({ hasText: '系统剪贴板不可用，仍可在此导图粘贴分支。' }).waitFor({ state: 'visible' })
    report.browser.clipboardFallbackObserved = { actualApiAvailable: true, writePermission: 'denied',
      originalRejectionNotice: true, osClipboardReadAttempted: false }
    assert.equal(await topic(dialog, 'Grandchild').count(), 0)
    assert.equal(await topic(dialog, 'Lift me').count(), 0)
    await graphKey(dialog, 'Structure fixture', 'Control+V')
    assert.equal(await topic(dialog, 'Grandchild').count(), 1)
    await graphKey(dialog, 'Lift me', 'Control+C')
    await graphKey(dialog, 'Parent', 'Control+V')
    assert.equal(await topic(dialog, 'Lift me').count(), 2)
    assert.equal(await topic(dialog, 'Grandchild').count(), 2, 'Copy must include the actual descendant, not just the label.')
    const copied = dialog.locator('g.lcos-mindmap-topic.depth-2').filter({ hasText: /^Lift me$/ })
    assert.equal(await copied.count(), 1, 'The pasted copy is under the Project root; the moved original is a forest root.')
    await copied.dblclick()
    await commitInput(dialog, 'Copied lift')
    await graphKey(dialog, 'Anchor', 'Tab')
    await commitInput(dialog, 'Added child')
    await graphKey(dialog, 'Added child', 'Enter')
    await commitInput(dialog, 'Temporary sibling')
    await graphKey(dialog, 'Temporary sibling', 'Delete')
    assert.equal(await topic(dialog, 'Temporary sibling').count(), 0)
    await screenshot('compound-before-save')
    const compoundHistory = await history()
    const compound = await saveEditor(dialog, 'compound-apply', redone, compoundHistory)
    assertOpaque(compound.bundle.value.body)
    const finalRows = entries(compound.bundle.value.body)
    assert.deepEqual(finalRows.find(row => row.text === 'Lift me'), { text: 'Lift me', parent: null, depth: 0 })
    assert.deepEqual(finalRows.filter(row => row.text === 'Grandchild').sort((a, b) => a.depth - b.depth), [
      { text: 'Grandchild', parent: 'Lift me', depth: 1 },
      { text: 'Grandchild', parent: 'Copied lift', depth: 2 },
    ])
    assert.deepEqual(finalRows.find(row => row.text === 'Copied lift'), { text: 'Copied lift', parent: 'Structure fixture', depth: 1 })
    assert.deepEqual(finalRows.find(row => row.text === 'Added child'), { text: 'Added child', parent: 'Anchor', depth: 2 })
    assert.equal(finalRows.some(row => row.text === 'Temporary sibling' || row.text === 'UNSAVED CANCELLED LABEL'), false)
    report.compound = { actions: ['cross-level cut/paste', 'copy/paste/rename', 'Tab add child', 'Enter add sibling', 'Delete sibling'], finalRows, bundle: compound.bundle }
    report.cases.push('Cross-level cut/paste, branch copy/rename, add child/sibling and Delete save the actual edited forest, preserving original bold/tags/opaque bytes')
    stage = 'readback'
    const beforeReload = canvasSnapshot(await readCanvas(canvasId))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-lcos-native-text-body="' + nodeId + '"] [data-lcos-inline-text][data-state="ready"]').waitFor({ state: 'visible', timeout: 30000 })
    if (await agentPanel.isVisible()) await agentPanel.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
    await assertPage('reload')
    assert.equal(await page.locator('.react-flow').count(), 1)
    assert.equal(stable(canvasSnapshot(await readCanvas(canvasId))), stable(beforeReload))
    assert.equal((await readBundle()).value.revisionId, compound.bundle.value.revisionId)
    dialog = await openEditor()
    for (const text of ['Lift me', 'Copied lift', 'Added child']) assert.equal(await topic(dialog, text).count(), 1)
    assert.equal(await topic(dialog, 'Grandchild').count(), 2)
    await screenshot('reload-reopened-structure')
    await dialog.getByRole('button', { name: '取消编辑', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await screenshot('reload-original-canvas')
    const finalCanvas = await readCanvas(canvasId)
    assert.deepEqual(finalCanvas.nodes.map(node => node.id).sort(), beforeStructureCanvas.nodes.map(node => node.id).sort())
    for (const node of beforeStructureCanvas.nodes.filter(node => node.id !== nodeId)) {
      assert.equal(stable(snapshotNode(finalCanvas.nodes.find(item => item.id === node.id))), stable(snapshotNode(node)))
    }
    for (const [id, saved] of beforeCanvases) if (id !== canvasId) assert.equal(stable(canvasSnapshot(await readCanvas(id))), stable(saved))
    assert.equal(stable(await get(appCore('/presentations'))), stable(presentationsBefore))
    assert.deepEqual(await get(appCore('/runs')), runsBefore)
    const finalGraph = await get(appCore('/graph'))
    assert.deepEqual(finalGraph.artifacts.map(item => String(item.id)).sort(), graphBefore.artifacts.map(item => String(item.id)).sort())
    assert.deepEqual(finalGraph.artifactViews.map(view => String(view.id)).sort(),
      graphBefore.artifactViews.map(view => String(view.id)).sort(), 'Editing does not remap or duplicate existing Views.')
    for (const beforeView of graphBefore.artifactViews) {
      const actual = finalGraph.artifactViews.find(view => String(view.id) === String(beforeView.id))
      assert.ok(actual)
      if (String(beforeView.id) === expectedTextRef.artifactViewId) {
        assert.equal(actual.revisionId, compound.bundle.value.revisionId,
          'The existing primary View follows the original Core text producer current revision.')
        assert.deepEqual({ ...actual, revisionId: beforeView.revisionId }, beforeView,
          'Only the original primary View revision advances, not its identity/owner/presentation.')
      } else assert.deepEqual(actual, beforeView)
    }
    for (const artifact of graphBefore.artifacts.filter(item => String(item.id) !== expectedTextRef.artifactId)) {
      assert.equal(stable(finalGraph.artifacts.find(item => String(item.id) === String(artifact.id))), stable(artifact))
    }
    for (const [id, bytes] of protectedFiles) {
      const response = await fetch(origin + appCore('/file-records/' + encodeURIComponent(id) + '/content'), { redirect: 'error' })
      assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
    }
    assert.equal((await readBundle()).revisions.length, beforeBundle.revisions.length + 4)
    assert.equal(report.batches.length, 5, 'Exactly mode, lift apply, Undo, Redo and compound save; no hidden echo/retry.')
    assert.deepEqual(report.blockedWrites, []); assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.routeErrors ?? [], [])
    assert.equal([...report.consoleErrors, ...report.consoleWarnings].some(message => /same key|unique.*key|Encountered two children/i.test(message)), false,
      'Branch copies must retain unique editor keys.')
    report.cases.push('Real reload and reopened original editor recover the same Core Artifact/View and actual tree; non-target nodes, other canvases, memberships, Runs and previous file bytes stay unchanged')
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
    releaseFacts()
    await context?.close().catch(() => {})
    await browser?.close().catch(() => {})
    if (facade) { try { await facade.close(); report.bootstrapFacadeClosed = true } catch (error) { report.bootstrapCloseError = String(error) } }
    try {
      // Recover only the exact child announced by this test's own launcher.
      if (!serverPid && launcher) {
        const candidates = [...stdout.matchAll(/Isolated full-integration child PID:\s*(\d+)/g)].map(match => Number(match[1]))
        if (new Set(candidates).size === 1) serverPid = candidates[0]
      }
      if (serverPid) {
        const response = await originalFetch(origin + '/health', { redirect: 'error', cache: 'no-store' }).catch(() => undefined)
        const health = response?.ok ? await response.json() : undefined
        const commandLine = await queryCommandLine(serverPid)
        const verified = health?.pid === serverPid && health.realCoreConnected === true
          && health.profile === 'original-tapnow-full-integration-in-progress'
          && matchesProcessIdentity(commandLine, path.join(root, 'lab/server.mjs'), runtimeLabel, uiPort)
        report.launcher.cleanupServer = { pid: serverPid, health: health ?? null, commandLine, verified }
        if (verified) { stopExactProcess(serverPid, path.join(root, 'lab/server.mjs'), runtimeLabel, uiPort); report.launcher.cleanupServer.exited = await waitForProcessGone(serverPid, 15000) }
        else if (!commandLine && !response?.ok) report.launcher.cleanupServer.exited = true
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
      }
      const listener = uiPort === undefined ? false : await new Promise(resolve => { const socket = net.connect({ host: '127.0.0.1', port: uiPort }); socket.once('connect', () => { socket.destroy(); resolve(true) }); socket.once('error', () => resolve(false)) })
      report.launcher.listenerAfterStop = listener
      if ((!launcher || launcher.exitCode !== null) && (!serverPid || report.launcher.cleanupServer?.exited) && !listener && await exists(runtimeRoot)) {
        const base = await realpath(runtimeBase), target = await realpath(runtimeRoot), relative = path.relative(base, target)
        assert.equal(relative, runtimeLabel); assert.match(path.basename(target), /^isolated-gen1-structure-\d+$/)
        assert.equal(path.isAbsolute(relative), false)
        await rm(target, { recursive: true, force: true })
        report.runtimeRemoved = true
      }
    } catch (error) { report.cleanupError = String(error.stack ?? error) }
    globalThis.fetch = originalFetch
    report.launcher.stdoutTail = stdout; report.launcher.stderrTail = stderr
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
    console.log(JSON.stringify({ passed: report.passed, runtimeLabel, origin, cases: report.cases,
      pageErrors: report.pageErrors, blockedWrites: report.blockedWrites, batches: report.batches.map(row => ({ stage: row.stage, status: row.status, beforeVersion: row.beforeVersion, afterVersion: row.afterVersion })),
      failure: report.failure, cleanupError: report.cleanupError, runtimeRemoved: report.runtimeRemoved, reportPath }, null, 2))
    if (!report.passed) process.exitCode = 1
  }
}
