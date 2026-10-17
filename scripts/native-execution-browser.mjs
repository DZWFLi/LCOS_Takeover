import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
const reportDir = path.join(runtimeBase, 'native-execution-browser')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const runtimeLabel = `isolated-execution-${Date.now()}`
const runtimeRoot = path.join(runtimeBase, runtimeLabel)
const reportPath = path.join(reportDir, `${stamp}.json`)
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
const projectId = 'disposable-surface-core-facade'
const phase = process.argv.find(value => value.startsWith('--phase='))?.slice('--phase='.length) ?? 'execution'
const automatic = ['automatic', 'save-blocked'].includes(phase)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
if (!process.argv.includes('--run-isolated') || !['execution', 'material', 'automatic', 'save-blocked'].includes(phase)) {
  console.error('not-started: use --run-isolated --phase=execution|material|automatic|save-blocked; only an isolated disposable runtime is created.')
  process.exitCode = 2
} else await run()
}

async function run() {
  await mkdir(reportDir, { recursive: true })
  await mkdir(visualRoot, { recursive: true })
  if (await exists(runtimeRoot)) throw new Error(`Refusing to reuse existing isolated runtime: ${runtimeLabel}`)

  const report = {
    at: new Date().toISOString(), passed: false, phase, runtimeLabel, runtimeRoot, reportPath,
    browserPluginAvailable: false, browserFallback: 'Browser plugin is not available in this session; task explicitly requests repository Playwright + installed Chrome.',
    viewport: { width: 1440, height: 1000 }, serviceWorkers: 'blocked', externalHttpAllowed: false,
    externalWebSocketAllowed: false, providerExecution: false, modelExecution: false,
    fixtureKind: 'manual synthetic ResultSlot/Run/ArtifactReturn; not a model/provider result',
    fixtureWrites: [], browserWrites: [], blockedWrites: [], blockedWebSockets: [], deniedNodeFetches: [],
    consoleErrors: [], consoleWarnings: [], pageErrors: [], apiFailures: [], requestFailures: [],
    steps: [], screenshots: [], launcher: {}, mayHaveCommitted: false,
  }

  const environmentKeysToClear = [
    'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LCOS_CODEX_AUTO_EXECUTION',
    'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT', 'HUABU_HOST_URL',
    'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN', 'HUABU_AGENTLET_ID',
    'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD',
    'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON',
    'LCOS_OLLAMA_URL', 'LCOS_OLLAMA_EMBED_MODEL', 'HUABU_DATA_DIR',
  ]
  for (const key of environmentKeysToClear) delete process.env[key]
  process.env.LCOS_RECOVERY_TRANSPORT = 'none'
  process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
  process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
  // Semantic indexing is allowed to retain local FTS but cannot reach a user's model service.
  process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

  let facade
  let browser
  let context
  let page
  let launcher
  let launcherStdout = ''
  let launcherStderr = ''
  let serverPid
  let uiPort
  let origin
  let workflow
  let slot
  let runId
  let returnId
  let artifactId
  let revisionId
  let fileRecordId
  let spatialId
  let acceptedBody
  let bootCoreOrigin
  let beforeAccept
  let flowElement
  let mainNavigations = 0
  let navigationsBeforeAccept
  let documentElement
  let blockGeometry = false
  const fixtureInstruction = '人工测试任务 · 不启动模型或执行器'
  let admitAccept = false
  let bootstrapping = false
  const allowedNodeOrigins = new Set()
  const originalFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : String(input)
    const url = new URL(address)
    const bootstrapOrigins = bootstrapping ? process._getActiveHandles().filter(handle => handle instanceof net.Server && handle.listening)
      .map(handle => handle.address()).filter(address => address && typeof address !== 'string' && address.address === '127.0.0.1')
      .map(address => `http://127.0.0.1:${address.port}`) : []
    if (url.protocol === 'http:' && (allowedNodeOrigins.has(url.origin) || bootstrapOrigins.length === 1 && bootstrapOrigins[0] === url.origin)) {
      report.localHttpOrigins ??= []
      if (!report.localHttpOrigins.includes(url.origin)) report.localHttpOrigins.push(url.origin)
      return originalFetch(input, init)
    }
    report.deniedNodeFetches.push({ method: init?.method ?? (input instanceof Request ? input.method : 'GET'), origin: url.origin, path: url.pathname })
    throw new Error('native execution browser blocked non-loopback HTTP or the reserved unavailable model port')
  }

  async function coreJson(base, method, pathname, body) {
    const response = await fetch(base + pathname, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error', cache: 'no-store',
    })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 300) } }
    report.fixtureWrites.push({ method, path: pathname, status: response.status })
    return { status: response.status, payload }
  }

  async function json(pathname, facadeEnvelope = false) {
    const response = await fetch(origin + pathname, { headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store' })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 300) } }
    assert.equal(response.status, 200, `${pathname}: HTTP ${response.status} ${JSON.stringify(payload)}`)
    if (facadeEnvelope) {
      assert.equal(payload.code, 0, `${pathname}: facade envelope ${JSON.stringify(payload)}`)
      return payload.data
    }
    assert.equal(payload.ok, true, `${pathname}: Core envelope ${JSON.stringify(payload)}`)
    return payload.value
  }

  async function screenshot(name) {
    const target = path.join(visualRoot, `tapnow-native-execution-${stamp}-${name}.png`)
    await page.screenshot({ path: target, fullPage: false })
    report.screenshots.push(target)
  }

  async function reportRuntimeAfterFailure() {
    if (!origin || !runId) return
    try {
      const prefix = `/api/lcos/core/projects/${encodeURIComponent(projectId)}`
      const [review, slots] = await Promise.all([
        json(`/api/lcos/core/runs/${encodeURIComponent(runId)}/review`),
        json(`${prefix}/result-slots`),
      ])
      report.recoveryReadback = {
        run: { id: review.run.id, status: review.run.status, dispatch: review.dispatch.status },
        returns: review.returns.map(row => ({ id: row.id, status: row.status })),
        slot: slots.find(row => row.id === slot?.id),
      }
    } catch (error) { report.recoveryReadbackError = String(error.stack ?? error) }
  }

  try {
    const portServer = net.createServer()
    await new Promise((resolve, reject) => {
      portServer.once('error', reject)
      portServer.listen(0, '127.0.0.1', resolve)
    })
    uiPort = portServer.address().port
    await new Promise((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()))
    origin = `http://127.0.0.1:${uiPort}`
    report.origin = origin

    const bootstrapBundle = path.join(runtimeRoot, 'bootstrap', 'surface-core-facade.mjs')
    await buildPilotEntry('lab/pilot/surface-core-facade.ts', bootstrapBundle)
    const { startSurfaceCoreFacade } = await import(pathToFileURL(bootstrapBundle).href)
    bootstrapping = true
    facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true })
    bootCoreOrigin = String(facade.core.origin)
    bootstrapping = false
    assert.ok(bootCoreOrigin.startsWith('http://127.0.0.1:'), 'Bootstrap Core must bind only loopback.')
    allowedNodeOrigins.add(bootCoreOrigin)
    const repository = facade.core.repository
    const project = facade.core.project
    const projectPath = `/projects/${encodeURIComponent(projectId)}`
    workflow = facade.workspaces.find(row => row.preferredSurface === 'workflow')
    assert.ok(workflow?.canvasId && workflow.scopeId, 'Use the real Core Workflow workspace/scope.')

    const slotCreated = await coreJson(bootCoreOrigin, 'POST', `${projectPath}/result-slots`, {
      scopeId: String(workflow.scopeId), workspaceId: String(workflow.id), x: 325, y: 240, width: 340, height: 210,
    })
    assert.equal(slotCreated.status, 201, JSON.stringify(slotCreated.payload))
    assert.equal(slotCreated.payload.ok, true)
    slot = slotCreated.payload.value
    assert.equal(slot.projectId, projectId)
    assert.equal(slot.workspaceId, String(workflow.id))
    assert.equal(slot.scopeId, String(workflow.scopeId))

    const reconcilePath = `/api/lcos/canvases/${encodeURIComponent(workflow.canvasId)}/execution:reconcile`
    const emptyProjection = await facade.handle({ method: 'POST', pathname: reconcilePath,
      url: new URL(reconcilePath, origin), body: {} })
    assert.equal(emptyProjection.status, 200, JSON.stringify(emptyProjection.body))
    assert.equal(emptyProjection.body?.code, 0)
    assert.equal(emptyProjection.body.data.provider_execution_started, false)
    const slotBinding = repository.getProjectionBindings(projectId).filter(binding => binding.canvasId === workflow.canvasId
      && binding.entityType === 'result-slot' && binding.entityId === slot.id)
    assert.equal(slotBinding.length, 1, 'The existing projector must create one real ResultSlot binding.')
    spatialId = String(slotBinding[0].spatialId)

    const runResponse = await coreJson(bootCoreOrigin, 'POST', `${projectPath}/runs`, {
      instruction: fixtureInstruction,
      outputIntent: 'create', workspaceId: String(workflow.id), requestedProvider: 'workbuddy', resultSlotId: String(slot.id),
    })
    assert.equal(runResponse.status, 201, JSON.stringify(runResponse.payload))
    assert.equal(runResponse.payload.ok, true)
    const createdReview = runResponse.payload.value.review
    runId = String(createdReview.run.id)
    assert.equal(createdReview.run.status, 'created')
    assert.equal(createdReview.dispatch.status, 'planned')
    assert.equal(createdReview.dispatch.attemptCount, 0)
    assert.equal(repository.getRuntimeBinding(runId), undefined)
    assert.equal(repository.getResultSlot(String(slot.id))?.runId, runId)

    const marker = `manual-native-execution-${randomUUID()}`
    artifactId = `artifact-${marker}`
    revisionId = `revision-${marker}`
    fileRecordId = `file-${marker}`
    returnId = `return-${marker}`
    acceptedBody = `# ${marker}\n\nManual synthetic Run result. No model or provider produced these bytes.\n`
    const bytes = Buffer.from(acceptedBody, 'utf8')
    const contentHash = createHash('sha256').update(bytes).digest('hex')
    const canonicalPath = path.join(project.rootPath, '.creative-os', 'runtime', runId, 'staging', `${marker}.md`)
    const projectRoot = await realpath(project.rootPath)
    const stagingPath = path.resolve(canonicalPath)
    const relativeStaging = path.relative(projectRoot, stagingPath)
    assert.ok(relativeStaging && !relativeStaging.startsWith('..') && !path.isAbsolute(relativeStaging),
      'Manual fixture bytes must stay under the synthetic Core project root.')
    await mkdir(path.dirname(canonicalPath), { recursive: true })
    await writeFile(canonicalPath, bytes)
    const now = new Date().toISOString()
    repository.createRuntimeCreatedArtifact({ id: fileRecordId, projectId, observedPath: canonicalPath,
      observedHash: contentHash, size: bytes.byteLength, modifiedAt: now, mimeType: 'text/markdown',
      availability: 'current', observedAt: now }, {
      id: artifactId, projectId, title: '人工测试产物 · 非模型生成', kind: 'markdown',
      availability: 'available', createdAt: now, updatedAt: now,
    }, {
      id: revisionId, artifactId, fileRecordId, contentHash, source: 'run', runId, status: 'draft', createdAt: now,
    }, {
      id: returnId, runId, targetArtifactId: artifactId, baseRevisionId: revisionId,
      returnedFileId: fileRecordId, contentHash, canonicalPath, action: 'created', status: 'pending_review',
      draftRevisionId: revisionId, createdAt: now, updatedAt: now,
    })
    assert.equal(repository.getArtifactReturn(returnId)?.status, 'pending_review')
    assert.equal(repository.getArtifactRevision(revisionId)?.status, 'draft')
    report.fixtureWrites.push({ method: 'SqliteMetadataRepository.createRuntimeCreatedArtifact', path: 'manual synthetic fixture', status: 'committed' })
    report.fixture = { projectId, workflow: { canvasId: workflow.canvasId, workspaceId: String(workflow.id), scopeId: String(workflow.scopeId) },
      slotId: slot.id, spatialId, runId, runStatus: createdReview.run.status, dispatchStatus: createdReview.dispatch.status,
      artifactReturnId: returnId, artifactId, revisionId, fileRecordId, explicitManualNotModel: true,
      runtimeBinding: false, providerExecution: false, artifactTitle: '人工测试产物 · 非模型生成' }

    await facade.close()
    facade = undefined
    allowedNodeOrigins.delete(bootCoreOrigin)
    report.bootstrapFacadeClosed = true
    allowedNodeOrigins.clear()
    allowedNodeOrigins.add(origin)

    launcher = spawn(process.execPath, [path.join(root, 'scripts/start-full-integration.mjs'),
      `--runtime-label=${runtimeLabel}`, `--port=${uiPort}`], {
      cwd: root,
      env: {
        PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        LCOS_RECOVERY_TRANSPORT: 'none', LCOS_OLLAMA_URL: 'http://127.0.0.1:1',
      },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    launcher.stdout.setEncoding('utf8').on('data', chunk => { launcherStdout = (launcherStdout + chunk).slice(-12000) })
    launcher.stderr.setEncoding('utf8').on('data', chunk => { launcherStderr = (launcherStderr + chunk).slice(-12000) })
    const launcherState = { closed: undefined }
    launcher.once('close', (code, signal) => {
      launcherState.closed = { code, signal }
    })
    const launcherCommandLine = await waitForCommandLine(launcher.pid,
      line => matchesProcessIdentity(line, path.join(root, 'scripts/start-full-integration.mjs'), runtimeLabel, uiPort), launcherState)
    report.launcher = { launcherPid: launcher.pid, launcherCommandLine }

    const health = await waitForHealth(origin, launcherState, () => launcherStdout + launcherStderr)
    assert.equal(health.ok, true)
    assert.equal(health.realCoreConnected, true)
    assert.equal(health.cloudBackendConnected, false)
    assert.equal(health.profile, 'original-tapnow-full-integration-in-progress')
    serverPid = Number(health.pid)
    assert.ok(Number.isInteger(serverPid) && serverPid > 0)
    const serverCommandLine = await waitForCommandLine(serverPid,
      line => matchesProcessIdentity(line, path.join(root, 'lab/server.mjs'), runtimeLabel, uiPort), launcherState)
    report.launcher.serverPid = serverPid
    report.launcher.serverCommandLine = serverCommandLine
    report.launcher.health = { profile: health.profile, realCoreConnected: health.realCoreConnected,
      cloudBackendConnected: health.cloudBackendConnected, pid: serverPid }

    // The browser is a new context on installed Chrome; Browser plugin is unavailable.
    const requireInstalled = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')
    const { chromium } = requireInstalled('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' })
    let statusRelease
    let statusStartedResolve
    const statusGate = new Promise(resolve => { statusRelease = resolve })
    const statusStarted = new Promise(resolve => { statusStartedResolve = resolve })
    await context.route('**/*', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin && url.pathname === '/api/surface-core/status' && request.method() === 'GET') {
        statusStartedResolve()
        await statusGate
        return route.continue()
      }
      if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue()
      if ((phase === 'material' || automatic) && admitAccept
        && !report.browserWrites.some(row => row.path.includes('/artifact-returns/')) && url.origin === origin
        && request.method() === 'POST' && url.pathname === `/api/lcos/core/artifact-returns/${encodeURIComponent(returnId)}/accept`) {
        const input = request.postDataJSON()
        assert.deepEqual(input, { expectedBaseRevisionId: revisionId }, 'The original UI must submit the exact Core Review CAS.')
        report.browserWrites.push({ method: 'POST', path: url.pathname, body: input })
        report.mayHaveCommitted = true
        admitAccept = false
        return route.continue()
      }
      if (automatic && url.origin === origin && request.method() === 'POST' && url.pathname === reconcilePath) {
        assert.deepEqual(request.postDataJSON(), {}, 'The automatic projection cannot override Core identity or geometry.')
        report.browserWrites.push({ method: 'POST', path: url.pathname, body: {}, source: 'original Canvas/API lifecycle sync' })
        return route.continue()
      }
      if (automatic && url.origin === origin && request.method() === 'POST'
        && url.pathname === `/api/canvas/v1/canvases/${encodeURIComponent(workflow.canvasId)}/nodes:batchActions`) {
        const input = request.postDataJSON()
        assert.equal(input.canvas_id, workflow.canvasId)
        assert.ok(input.actions.length > 0 && input.actions.every(action => action.action === 'update' && action.updates.length > 0),
          'This browser fixture permits ordinary existing-node updates, never node create/delete or model actions.')
        if (blockGeometry && input.actions.some(action => action.updates.some(update => update.id === spatialId && update.position))) {
          report.nativeSaveFaults ??= []
          report.nativeSaveFaults.push({ method: request.method(), path: url.pathname, body: input,
            fault: 'test-only browser transport abort before Core; no fabricated success response' })
          return route.abort('connectionfailed')
        }
        report.browserWrites.push({ method: 'POST', path: url.pathname, body: input, source: 'original native persistence queue' })
        return route.continue()
      }
      report.blockedWrites.push({ method: request.method(), origin: url.origin, path: url.pathname,
        ...(url.origin === origin && url.pathname.endsWith('nodes:batchActions') ? { body: request.postDataJSON() } : {}) })
      return route.abort('blockedbyclient')
    })
    await context.routeWebSocket('**/*', socket => {
      const url = typeof socket.url === 'function' ? socket.url() : String(socket.url ?? 'unknown')
      report.blockedWebSockets.push(url)
      socket.close()
    })
    page = await context.newPage()
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) {
      mainNavigations += 1
      report.frameNavigations ??= []
      report.frameNavigations.push(frame.url())
    } })
    page.on('pageerror', error => report.pageErrors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 1600))
      if (message.type() === 'warning' || message.type() === 'warn') report.consoleWarnings.push(message.text().slice(0, 1200))
    })
    page.on('response', response => {
      if (response.status() >= 400) report.apiFailures.push({ path: new URL(response.url()).pathname, status: response.status() })
    })
    page.on('requestfailed', request => report.requestFailures.push({ path: new URL(request.url()).pathname,
      method: request.method(), failure: request.failure()?.errorText ?? 'unknown' }))

    await page.goto(`${origin}/canvas/${encodeURIComponent(workflow.canvasId)}`, { waitUntil: 'domcontentloaded' })
    await Promise.race([statusStarted, new Promise((_, reject) => setTimeout(() => reject(new Error('Original UI did not request its Core surface map.')), 30000))])
    const fallback = page.locator(`[data-lcos-native-execution-node="${spatialId}"][data-lcos-native-execution-availability="unavailable"]`)
    await fallback.waitFor({ state: 'visible', timeout: 30000 })
    assert.equal(await page.locator('.react-flow').count(), 1, 'The original Flow remains the only Canvas root.')
    assert.equal(await fallback.locator('[data-lcos-execution-state="unavailable"]').count(), 1,
      'Owner-unready render uses the honest original unavailable execution mark.')
    assert.equal(await page.locator('[data-lcos-run-work]').count(), 0)
    await fallback.locator('.lcos-execution-body').dblclick()
    await fallback.locator('.lcos-execution-body').press('Enter')
    assert.equal(await page.locator('[data-lcos-run-work]').count(), 0,
      'An unavailable node cannot open a stale Run while Core Surface/Workspace identity is unresolved.')
    report.steps.push({ name: 'owner-unready fallback is visible, unavailable, and blocks stale Run opening', passed: true,
      spatialId, state: 'unavailable', onlyOneReactFlow: true })
    await screenshot('initial-unavailable')

    statusRelease()
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 30000 })
    if (automatic) {
      await page.locator('[data-lcos-native-execution-sync-state="ready"]').waitFor({ state: 'attached', timeout: 30000 })
      flowElement = await page.locator('.react-flow').elementHandle()
    }
    const workflowCanvasLocator = page.locator(`[data-lcos-native-execution-node="${spatialId}"][data-lcos-native-execution-availability="ready"]`)
    await workflowCanvasLocator.waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForFunction(name => document.title.includes(name), workflow.name, { timeout: 30000 })
    assert.equal(new URL(page.url()).pathname, `/canvas/${encodeURIComponent(workflow.canvasId)}`)
    assert.equal(await page.locator('.react-flow').count(), 1)
    const executionBody = workflowCanvasLocator.locator('.lcos-execution-body')
    await executionBody.waitFor({ state: 'visible', timeout: 20000 })
    const initialCanvas = await json(`/api/canvas/v1/canvases/${encodeURIComponent(workflow.canvasId)}`, true)
    const initialNode = initialCanvas.nodes.find(node => String(node.id) === spatialId)
    assert.ok(initialNode && initialNode.type === 'lcos-execution')
    assert.equal(initialNode.data.lcos_execution_ref.projectId, projectId)
    assert.equal(initialNode.data.lcos_execution_ref.canvasId, workflow.canvasId)
    assert.equal(initialNode.data.lcos_execution_ref.workspaceId, String(workflow.id))
    assert.equal(initialNode.data.lcos_execution_ref.entityType, 'result-slot')
    assert.equal(initialNode.data.lcos_execution_ref.entityId, slot.id)
    assert.equal(await executionBody.getAttribute('data-lcos-execution-state'), initialNode.data.lcos_execution_facts.execution.status,
      'The original ExecutionNodeBody must render the current Core facts, not a synthetic state.')
    report.steps.push({ name: 'same projected ResultSlot resolves to the original execution body after Workspace readiness', passed: true,
      spatialId, type: initialNode.type, status: initialNode.data.lcos_execution_facts.execution.status,
      originalExecutionBody: true, onlyOneReactFlow: true })
    const agentPanel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (await agentPanel.isVisible()) {
      await agentPanel.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
      await agentPanel.waitFor({ state: 'detached', timeout: 10000 })
      report.steps.push({ name: 'close the ordinary Agent panel through its real control before inspecting the canvas window', passed: true })
    }
    if (automatic) {
      blockGeometry = phase === 'save-blocked'
      const movedFrom = await page.evaluate(id => window.__LCOS_NODE_LAB__.api.getNode(id).position, spatialId)
      const bounds = await executionBody.boundingBox()
      assert.ok(bounds)
      await page.mouse.move(bounds.x + 16, bounds.y + 14)
      await page.mouse.down()
      await page.mouse.move(bounds.x + 81, bounds.y + 39, { steps: 10 })
      await page.mouse.up()
      await page.waitForFunction(({ id, previous }) => {
        const pos = window.__LCOS_NODE_LAB__.api.getNode(id)?.position
        return pos && (pos.x !== previous.x || pos.y !== previous.y)
      }, { id: spatialId, previous: movedFrom })
      // Allow the original persistence/history debounces to settle. No direct
      // save/update API or application state setter is used by this test.
      await page.waitForTimeout(1300)
      beforeAccept = await page.evaluate(({ canvasId, id }) => {
        const api = window.__LCOS_NODE_LAB__.api
        return { node: api.getNode(id), nodes: api.getNodes(), viewport: api.getViewport(),
          selection: api.getSelection(), history: api.inspectNativeHistory({ canvasId, nodeId: id }) }
      }, { canvasId: workflow.canvasId, id: spatialId })
      beforeAccept.savedCanvasNode = (await json(`/api/canvas/v1/canvases/${encodeURIComponent(workflow.canvasId)}`, true))
        .nodes.find(node => node.id === spatialId)
      if (phase === 'save-blocked') {
        assert.deepEqual(beforeAccept.savedCanvasNode.position, initialNode.position, 'The aborted native movement must not reach Core.')
        assert.notDeepEqual(beforeAccept.node.position, beforeAccept.savedCanvasNode.position, 'The unsaved native placement must remain in the original Flow.')
      } else assert.notDeepEqual(beforeAccept.savedCanvasNode.position, initialNode.position, 'The actual native queue must have saved the mouse movement.')
      report.beforeAccept = beforeAccept
      report.steps.push({ name: 'real mouse drags the existing execution carrier through its original persistence/history owners', passed: true })
    }
    await screenshot('execution-body-ready')

    await executionBody.dblclick()
    const reviewBody = page.locator(`[data-lcos-run-work="${runId}"]`)
    await reviewBody.waitFor({ state: 'visible', timeout: 20000 })
    await reviewBody.getByText('本次指令', { exact: true }).waitFor({ state: 'visible', timeout: 20000 })
    assert.ok((await reviewBody.innerText()).includes(fixtureInstruction))
    assert.equal(await page.locator('.react-flow').count(), 1)
    report.steps.push({ name: 'real execution node double-click opens the existing RunWorkViewBody', passed: true,
      runId, pendingArtifactReturn: returnId, dispatch: createdReview.dispatch.status, providerExecution: false })
    await screenshot('run-review-doubleclick')

    const runPane = page.locator('[data-lcos-window-pane]').filter({ has: reviewBody })
    await runPane.getByRole('button', { name: '关闭窗口', exact: true }).click()
    await reviewBody.waitFor({ state: 'detached', timeout: 10000 })
    await executionBody.focus()
    await executionBody.press('Enter')
    await reviewBody.waitFor({ state: 'visible', timeout: 20000 })
    await reviewBody.getByText('本次指令', { exact: true }).waitFor({ state: 'visible', timeout: 20000 })
    assert.ok((await reviewBody.innerText()).includes(fixtureInstruction))
    report.steps.push({ name: 'the same original execution body Enter key reopens the exact existing Run review', passed: true, runId })
    await screenshot('run-review-enter')

    if (phase === 'material' || automatic) {
      const accept = reviewBody.getByRole('button', { name: '采纳', exact: true })
      await accept.waitFor({ state: 'visible', timeout: 15000 })
      assert.equal(await accept.isEnabled(), true)
      const projectionsBeforeAccept = report.browserWrites.filter(row => row.path === reconcilePath).length
      navigationsBeforeAccept = mainNavigations
      documentElement = await page.locator('html').elementHandle()
      const acceptedResponse = page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === `/api/lcos/core/artifact-returns/${encodeURIComponent(returnId)}/accept`, { timeout: 20000 })
      admitAccept = true
      await accept.click()
      const response = await acceptedResponse
      assert.equal(response.status(), 200)
      const receipt = await response.json()
      assert.equal(receipt.ok, true)
      assert.equal(receipt.value.artifactReturn.id, returnId)
      assert.equal(receipt.value.artifactReturn.status, 'adopted')
      const acceptedReview = await json(`/api/lcos/core/runs/${encodeURIComponent(runId)}/review`)
      assert.equal(acceptedReview.dispatch.attemptCount, 0)
      assert.equal(acceptedReview.returns.find(row => row.id === returnId)?.status, 'adopted')
      report.steps.push({ name: 'one real original Review Accept uses exact CAS for the manual fixture, without dispatch', passed: true })
      if (phase === 'material') {
        // Explicit projection + real page reload remain a separate earlier case.
        const reconciled = await coreJson(origin, 'POST', reconcilePath, {})
        assert.equal(reconciled.status, 200, JSON.stringify(reconciled.payload))
        assert.equal(reconciled.payload.code, 0)
        report.explicitProjection = { path: reconcilePath, status: 200, automaticRefreshClaimed: false }
      } else {
        if (phase === 'save-blocked') {
          await page.locator('[data-lcos-native-execution-sync-state="blocked"]').waitFor({ state: 'attached', timeout: 30000 })
          assert.equal(await page.locator(`[data-lcos-native-result-material-node="${spatialId}"]`).count(), 0,
            'A failed original save must block projection application, not discard its pending placement.')
          assert.equal(report.browserWrites.filter(row => row.path === reconcilePath).length, projectionsBeforeAccept,
            'Failed original flush must prevent even the next spatial reconciliation POST.')
          const blockedNode = await page.evaluate(id => window.__LCOS_NODE_LAB__.api.getNode(id), spatialId)
          assert.deepEqual(blockedNode, beforeAccept.node, 'Original pending node and all its data must remain intact.')
          assert.ok(report.nativeSaveFaults?.length > 0, 'The actual original native queue must hit the injected transport failure.')
          await page.locator(`[data-lcos-native-execution-node="${spatialId}"]`).waitFor({ state: 'visible', timeout: 10000 })
          await reviewBody.waitFor({ state: 'visible', timeout: 10000 })
          report.blockedLayout = { node: await page.locator(`[data-lcos-native-execution-node="${spatialId}"]`).boundingBox(),
            review: await reviewBody.boundingBox(), viewport: await page.evaluate(() => window.__LCOS_NODE_LAB__.api.getViewport()) }
          await page.waitForTimeout(150)
          report.steps.push({ name: 'after the one real Accept, a failed original save blocks projection and preserves the unsaved original node', passed: true })
          await screenshot('save-blocked-pending-preserved')
          blockGeometry = false
          const retryButton = page.getByRole('button', { name: '重试同步执行投影', exact: true })
          await retryButton.waitFor({ state: 'visible', timeout: 10000 })
          await retryButton.click()
          report.steps.push({ name: 'one explicit original sync retry resumes the same native pending save, never the Accept or Run', passed: true })
        }
        await page.locator(`[data-lcos-native-result-material-node="${spatialId}"][data-lcos-native-result-material-availability="ready"]`)
          .waitFor({ state: 'visible', timeout: 30000 })
        await page.locator('[data-lcos-native-execution-sync-state="ready"]').waitFor({ state: 'attached', timeout: 15000 })
        assert.ok(report.browserWrites.filter(row => row.path === reconcilePath).length > projectionsBeforeAccept,
          'A real project invalidation must drive the original mounted Canvas/API after Accept.')
        assert.equal(mainNavigations, navigationsBeforeAccept, 'Automatic material display must not navigate or reload the document.')
        assert.equal(await documentElement.evaluate(element => element.isConnected), true, 'The original document must stay mounted after Accept.')
        assert.equal(await flowElement.evaluate(element => element.isConnected), true, 'The original ReactFlow root must remain mounted.')
        const afterAccept = await page.evaluate(({ canvasId, id }) => {
          const api = window.__LCOS_NODE_LAB__.api
          return { node: api.getNode(id), nodes: api.getNodes(), viewport: api.getViewport(),
            selection: api.getSelection(), history: api.inspectNativeHistory({ canvasId, nodeId: id }) }
        }, { canvasId: workflow.canvasId, id: spatialId })
        assert.deepEqual(afterAccept.node.position, beforeAccept.node.position)
        assert.deepEqual(afterAccept.viewport, beforeAccept.viewport)
        assert.deepEqual(afterAccept.selection, beforeAccept.selection)
        const ordinary = node => !['lcos-execution', 'lcos-result-material'].includes(node.type)
        assert.deepEqual(afterAccept.nodes.filter(ordinary), beforeAccept.nodes.filter(ordinary),
          'Ordinary original image/text nodes must not be replaced with a server reload.')
        assert.equal(beforeAccept.history.ok, true)
        assert.equal(afterAccept.history.ok, true)
        assert.equal(afterAccept.history.historySize, beforeAccept.history.historySize)
        assert.equal(afterAccept.history.currentIndex, beforeAccept.history.currentIndex)
        report.afterAccept = afterAccept
        report.automaticProjection = { sameMountedFlow: true, documentAndFlowStillMounted: true,
          frameNavigationsBeforeAccept: navigationsBeforeAccept, frameNavigationsAfterAccept: mainNavigations,
          projectionPosts: report.browserWrites.filter(row => row.path === reconcilePath).length,
          manualProjectionAfterAccept: false, pageReloadAfterAccept: false }
        report.steps.push({ name: 'canonical project SSE automatically promotes the same mounted original carrier, retaining geometry/camera/selection/history and ordinary nodes', passed: true })
      }
      const projected = await json(`/api/canvas/v1/canvases/${encodeURIComponent(workflow.canvasId)}`, true)
      const material = projected.nodes.find(node => node.id === spatialId)
      assert.equal(material?.type, 'lcos-result-material')
      assert.equal(material.data.content, acceptedBody)
      assert.equal(material.data.lcos_ref.revisionId, revisionId)
      // Original native transport rounds persisted coordinates to two decimals;
      // compare each owner's own values, not raw RF float vs saved DTO.
      if (phase === 'save-blocked') {
        const originalSave = report.browserWrites.filter(row => row.path.endsWith('nodes:batchActions'))
          .flatMap(row => row.body.actions.flatMap(action => action.updates)).filter(update => update.id === spatialId && update.position).at(-1)
        assert.ok(originalSave, 'Explicit original retry must really save the retained placement through native transport.')
        assert.deepEqual(material.position, originalSave.position)
      } else assert.deepEqual(material.position, automatic ? beforeAccept.savedCanvasNode.position : initialNode.position)
      assert.deepEqual(material.measured, initialNode.measured)
      if (phase === 'material') {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 30000 })
      }
      const reloadedAgent = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
      if (await reloadedAgent.isVisible()) await reloadedAgent.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
      const result = page.locator(`[data-lcos-native-result-material-node="${spatialId}"][data-lcos-native-result-material-availability="ready"]`)
      await result.waitFor({ state: 'visible', timeout: 30000 })
      const retainedReview = page.locator(`[data-lcos-run-work="${runId}"]`)
      if (await retainedReview.isVisible()) {
        await page.locator('[data-lcos-window-pane]').filter({ has: retainedReview })
          .getByRole('button', { name: '关闭窗口', exact: true }).click()
        await retainedReview.waitFor({ state: 'detached', timeout: 10000 })
      }
      const view = result.locator('[data-lcos-native-result-material-kind="text"]')
      assert.equal(await view.getAttribute('data-artifact-id'), artifactId)
      assert.equal(await view.getAttribute('data-revision-id'), revisionId)
      assert.equal(await view.getAttribute('data-artifact-view-id'), material.data.lcos_ref.artifactViewId)
      assert.equal(await result.locator('[contenteditable="true"],textarea').count(), 0)
      const materialBounds = await result.boundingBox()
      const facesBounds = await result.locator('.lcos-text-faces').boundingBox()
      assert.ok(materialBounds && facesBounds && facesBounds.height <= materialBounds.height + 1,
        'Original TextFaces must stay within the same reserved native carrier; full body scroll remains its existing owner.')
      report.materialLayout = { materialBounds, facesBounds, readonly: true }
      await screenshot('accepted-same-carrier')
      report.steps.push({ name: automatic ? 'without a reload, the same original slot renders the exact read-only result material'
        : 'explicit projection and actual reload render the same slot spatialId as the exact read-only result material', passed: true })
      const readerRequests = []
      page.on('request', request => {
        const url = new URL(request.url())
        if (url.origin === origin && request.method() === 'GET' && url.pathname.startsWith('/api/lcos/core/')) readerRequests.push(url.pathname + url.search)
      })
      await view.dblclick()
      const reader = page.locator(`[data-lcos-window-body="reader"][data-lcos-window-target="${artifactId}"]`)
      await reader.waitFor({ state: 'visible', timeout: 20000 })
      await reader.getByText('Manual synthetic Run result. No model or provider produced these bytes.', { exact: false }).waitFor({ state: 'visible', timeout: 20000 })
      // Original Reader lists canonical revisions, chooses by passed revisionId,
      // then requests that revision's FileRecord; it has no /revisions/:id GET.
      const badgeTitle = await reader.locator('[data-lcos-reader-revision-badge]').getAttribute('title')
      assert.ok(badgeTitle?.includes(`版本标识：${revisionId}；`), 'Original Reader must identify the selected exact revision in its existing badge.')
      assert(readerRequests.some(address => address.endsWith(`/file-records/${encodeURIComponent(fileRecordId)}/content`)),
        'Original Reader must read the FileRecord belonging to that exact revision.')
      report.readerRevisionBadgeTitle = badgeTitle
      report.readerRequests = readerRequests
      report.steps.push({ name: 'real material double-click opens original Artifact Reader at the exact accepted revision', passed: true })
      await screenshot('exact-revision-reader')
    }

    assert.equal(report.pageErrors.length, 0, `Browser page errors: ${report.pageErrors.join(' | ')}`)
    assert.equal(report.browserWrites.filter(row => row.path.includes('/artifact-returns/')).length,
      phase === 'material' || automatic ? 1 : 0, 'Only one selected GUI Accept may mutate review state.')
    if (!automatic) assert.equal(report.browserWrites.length, phase === 'material' ? 1 : 0)
    assert.equal(report.providerExecution, false)
    report.passed = true
    report.final = { oneOriginalReactFlow: true, originalExecutionNodeBody: true,
      originalRunWorkView: true, openMethods: ['double-click', 'Enter'], providerExecution: false,
      fixtureIsManualNotModel: true, externalHttpAllowed: false, externalWebSocketAllowed: false }
  } catch (error) {
    report.failure = String(error.stack ?? error)
    if (page) {
      report.failureUrl = page.url()
      report.failureTitle = await page.title().catch(() => '')
      report.failureBody = (await page.locator('body').innerText().catch(() => '')).slice(0, 7000)
      await screenshot('failure').catch(() => {})
    }
    if (origin) await reportRuntimeAfterFailure()
  } finally {
    await context?.close().catch(() => {})
    await browser?.close().catch(() => {})
    if (facade) {
      try { await facade.close(); report.bootstrapFacadeClosed = true }
      catch (error) { report.bootstrapCloseError = String(error.stack ?? error) }
    }
    await stopVerifiedLauncher()
    globalThis.fetch = originalFetch
    report.launcher.stdoutTail = launcherStdout
    report.launcher.stderrTail = launcherStderr
    const runtimeRemoved = await removeIsolatedRuntimeSafely()
    report.runtimeRemoved = runtimeRemoved
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ passed: report.passed, phase, runtimeLabel, origin,
      steps: report.steps.map(item => item.name), screenshots: report.screenshots,
      pageErrors: report.pageErrors, blockedWrites: report.blockedWrites.length,
      failure: report.failure ?? null, reportPath }, null, 2))
    if (!report.passed) process.exitCode = 1
  }

  async function stopVerifiedLauncher() {
    if (!launcher) return
    try {
      if (serverPid) {
        const healthResponse = await originalFetch(origin + '/health', { redirect: 'error', cache: 'no-store' }).catch(() => undefined)
        const liveHealth = healthResponse?.ok ? await healthResponse.json().catch(() => undefined) : undefined
        let serverCommandLine = ''
        let serverQuerySucceeded = true
        try { serverCommandLine = await queryCommandLine(serverPid) }
        catch { serverQuerySucceeded = false }
        const serverIdentityOk = matchesProcessIdentity(serverCommandLine, path.join(root, 'lab/server.mjs'), runtimeLabel, uiPort)
        const healthIdentityOk = liveHealth?.pid === serverPid && liveHealth?.realCoreConnected === true
          && liveHealth?.profile === 'original-tapnow-full-integration-in-progress'
        report.launcher.cleanupServer = { pid: serverPid, health: liveHealth ?? null, commandLine: serverCommandLine,
          healthIdentityOk, commandLineIdentityOk: serverIdentityOk }
        if (serverIdentityOk && healthIdentityOk) {
          stopExactProcess(serverPid, path.join(root, 'lab/server.mjs'), runtimeLabel, uiPort)
          report.launcher.cleanupServer.stopRequested = true
          report.launcher.cleanupServer.exited = await waitForProcessGone(serverPid, 15000)
        } else if (serverQuerySucceeded && !serverCommandLine && !healthResponse?.ok) {
          report.launcher.cleanupServer.exited = true
          report.launcher.cleanupServer.alreadyExited = true
        }
        if (!report.launcher.cleanupServer.exited) {
          report.launcher.cleanup = { terminated: false, reason: 'isolated server identity/health was not verified or exact server PID did not exit; runtime preserved.' }
          return
        }
      }

      if (launcher.exitCode === null) {
        // Stopping the verified server normally lets its official launcher exit.
        // Observe that exit before a CIM query can race with process teardown.
        if (report.launcher.cleanupServer?.exited) await waitForExit(launcher, 5000)
      }
      if (launcher.exitCode === null) {
        const pid = Number(launcher.pid)
        const commandLine = await queryCommandLine(pid).catch(() => '')
        const launcherIdentityOk = matchesProcessIdentity(commandLine,
          path.join(root, 'scripts/start-full-integration.mjs'), runtimeLabel, uiPort)
        if (!launcherIdentityOk) {
          report.launcher.cleanup = { terminated: false, pid, commandLine,
            reason: 'launcher PID command line did not match the exact isolated launcher; runtime preserved.' }
          return
        }
        await waitForExit(launcher, 5000)
        if (launcher.exitCode === null) {
          stopExactProcess(pid, path.join(root, 'scripts/start-full-integration.mjs'), runtimeLabel, uiPort)
          await waitForExit(launcher, 10000)
        }
        report.launcher.cleanup = { pid, commandLine, ownerVerified: true,
          method: 'verified server PID stopped individually; launcher allowed to exit, then individually verified if needed',
          terminated: launcher.exitCode !== null, exitCode: launcher.exitCode }
        if (launcher.exitCode === null) report.launcher.cleanup.reason = 'verified launcher did not exit; runtime preserved.'
      } else if (report.launcher.cleanupServer?.exited) {
        report.launcher.cleanup = { launcherPid: launcher.pid, launcherExitedAfterServerStop: true, exitCode: launcher.exitCode }
      }
    } catch (error) {
      report.launcher.cleanup = { terminated: false, reason: String(error.stack ?? error) }
    }
  }

  async function removeIsolatedRuntimeSafely() {
    if (!await exists(runtimeRoot)) return true
    if (launcher && launcher.exitCode === null) return false
    try {
      const [baseReal, targetReal] = await Promise.all([realpath(runtimeBase), realpath(runtimeRoot)])
      const relative = path.relative(baseReal, targetReal)
      if (!/^isolated-execution-\d+$/.test(path.basename(targetReal)) || relative !== path.basename(targetReal)
        || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return false
      await rm(targetReal, { recursive: true, force: true })
      return true
    } catch (error) {
      report.runtimeCleanupError = String(error.stack ?? error)
      return false
    }
  }
}

async function exists(pathname) {
  try { await realpath(pathname); return true } catch { return false }
}

export async function reserveLoopbackPort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

export async function waitForHealth(origin, launcherState, logs) {
  const deadline = Date.now() + 90000
  let lastError = ''
  while (Date.now() < deadline) {
    const closed = launcherState.closed
    if (closed) throw new Error(`Official isolated launcher exited before health: ${JSON.stringify(closed)}\n${logs()}`)
    try {
      const response = await fetch(origin + '/health', { redirect: 'error', cache: 'no-store' })
      if (response.ok) return await response.json()
      lastError = `health HTTP ${response.status}`
    } catch (error) { lastError = error instanceof Error ? error.message : String(error) }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for isolated launcher health: ${lastError}\n${logs()}`)
}

export async function queryCommandLine(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) throw new Error('Cannot query an invalid process id.')
  const command = `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); (Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(pid)}").CommandLine`
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', windowsHide: true, timeout: 8000,
  }).trim()
}

export function matchesProcessIdentity(commandLine, scriptPath, runtimeLabel, port) {
  const normalizedCommand = String(commandLine).replaceAll('\\', '/').toLowerCase()
  const normalizedPath = path.resolve(scriptPath).replaceAll('\\', '/').toLowerCase()
  const portArg = new RegExp(`(?:--port=|--port\\s+)${Number(port)}(?:\\s|$)`, 'i')
  return normalizedCommand.includes(normalizedPath)
    && normalizedCommand.includes(`--runtime-label=${runtimeLabel}`.toLowerCase())
    && portArg.test(normalizedCommand)
}

export function stopExactProcess(pid, scriptPath, runtimeLabel, port) {
  const escapedScriptPath = path.resolve(scriptPath).replaceAll("'", "''")
  const escapedRuntimeLabel = runtimeLabel.replaceAll("'", "''")
  const expected = `if (-not $p.CommandLine.Contains('${escapedScriptPath}') -or -not $p.CommandLine.Contains('--runtime-label=${escapedRuntimeLabel}') -or ($p.CommandLine -notmatch '(?:--port=|--port\\s+)${Number(port)}(?:\\s|$)')) { exit 45 }; Stop-Process -Id ${Number(pid)} -Force`
  const command = `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(pid)}"; if (-not $p) { exit 44 }; ${expected}`
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', windowsHide: true, timeout: 8000,
  })
}

export async function waitForProcessGone(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const commandLine = await queryCommandLine(pid)
      if (!commandLine) return true
    } catch { return true }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return false
}

export async function waitForCommandLine(pid, predicate, launcherState) {
  const deadline = Date.now() + 15000
  let last = ''
  while (Date.now() < deadline) {
    const closed = launcherState.closed
    if (closed) throw new Error(`Launcher exited before exact command-line identity was recorded: ${JSON.stringify(closed)}`)
    try { last = await queryCommandLine(pid) } catch { last = '' }
    if (last && predicate(last)) return last
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Process ${pid} command line was not the expected exact child: ${last}`)
}

export async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return true
  return await Promise.race([
    new Promise(resolve => child.once('close', () => resolve(true))),
    new Promise(resolve => setTimeout(() => resolve(false), timeoutMs)),
  ])
}
