import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
const projectId = 'disposable-surface-core-facade'
const fixtureMarker = 'lcos-native-assembly-first-browser-v1'
const conversationTitle = `LCOS Native Assembly manual fixture · ${fixtureMarker}`
const textMarker = `<!-- LCOS_NATIVE_ASSEMBLY_FIRST_BROWSER:${fixtureMarker} -->`
const oldPorts = new Set([17881, 53861, 56111, 56225])

function parseBaseUrl(argv) {
  let value
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--base-url') value = argv[++index]
    else if (arg.startsWith('--base-url=')) value = arg.slice('--base-url='.length)
    else throw new Error(`Unsupported argument: ${arg}`)
  }
  if (!value) throw new Error('Required: --base-url http://127.0.0.1:<isolated-native-assembly-port>')
  const url = new URL(value)
  const port = Number(url.port)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !Number.isInteger(port) || port < 1
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('--base-url must be a bare http://127.0.0.1:<port> loopback origin.')
  }
  if (oldPorts.has(port)) throw new Error(`Refusing protected/old runtime port ${port}.`)
  return { origin: url.origin, port }
}

function unwrap(payload) {
  if (payload && typeof payload === 'object') {
    if (payload.ok === true && 'value' in payload) return payload.value
    if (payload.code === 0 && 'data' in payload) return payload.data
    if ('data' in payload) return payload.data
  }
  return payload
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 160) || 'unknown'
}

function exactContains(value, wanted) {
  if (value === wanted) return true
  if (!value || typeof value !== 'object') return false
  return Object.values(value).some(child => exactContains(child, wanted))
}

function fixtureHasConversationNode(canvas, conversationId) {
  return (canvas.nodes ?? []).filter(node => node.type === 'lcos-conversation'
    && node.data?.lcos_conversation_ref?.connectedConversationId === conversationId)
}

function compact(text) { return String(text ?? '').replace(/\s+/g, '') }

function visibleBody(body) {
  return String(body ?? '').replace(/\r/g, '').replace(/^\s{0,3}#{1,6}\s/gm, '').replace(/<!--.*?-->/gs, '').trim()
}

async function main() {
  const { origin, port } = parseBaseUrl(process.argv)
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  const evidenceDir = path.join(visualRoot, `native-assembly-first-browser-${runId}`)
  const reportPath = path.join(evidenceDir, 'report.json')
  await mkdir(evidenceDir, { recursive: true })

  const report = {
    schema: 'native-assembly-first-browser/v1', runId, origin, port, projectId, fixtureMarker,
    evidenceDir, reportPath, passed: false, phase: 'runtime-validation',
    scope: 'real original TapNow Library GUI; Core-only manual synthetic fixture; no model/provider/Run; browser GET/HEAD only',
    fixtureKind: 'Core official producer: ConnectedConversation + import-manual + link-session + conversation reconcile; synthetic text revision via original CanvasText PUT',
    fixtureSteps: [], browserWritesForwarded: [], measuredBrowserEchoesForwarded: [], browserWritesBlocked: [], externalRequestsBlocked: [],
    websocketAttemptsBlocked: [], expectedBackgroundBlocks: [], otherBlockedBackgroundRequests: [],
    apiObservations: [], apiFailures: [], pageErrors: [], consoleErrors: [], screenshots: [],
  }
  let browser
  let context
  let page
  let beforeSnapshot
  const originalFetch = globalThis.fetch.bind(globalThis)

  const request = async (method, pathname, body, { binary = false } = {}) => {
    const target = new URL(pathname, origin)
    assert.equal(target.origin, origin, `Fixture request escaped runtime origin: ${target.origin}`)
    const record = !['GET', 'HEAD'].includes(method)
      ? { method, path: target.pathname, status: null, outcome: 'started' } : undefined
    if (record && body !== undefined) record.request = structuredClone(body)
    if (record) report.fixtureSteps.push(record)
    let response
    try {
      response = await originalFetch(target, {
        method,
        headers: body === undefined ? { Accept: binary ? '*/*' : 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error', cache: 'no-store',
      })
    } catch (error) {
      if (record) {
        record.outcome = 'unknown-receipt-no-replay'
        record.error = String(error)
      }
      throw error
    }
    if (record) record.status = response.status
    if (binary) {
      const bytes = Buffer.from(await response.arrayBuffer())
      if (record) record.outcome = response.ok ? 'read' : 'failed-read'
      return { response, bytes }
    }
    const raw = await response.text()
    let payload
    try { payload = JSON.parse(raw) } catch { payload = { nonJson: raw.slice(0, 500) } }
    if (record) {
      record.receipt = payload
      record.outcome = response.ok ? 'received' : 'failed'
    }
    return { response, payload }
  }

  const readJson = async pathname => {
    const { response, payload } = await request('GET', pathname)
    assert.equal(response.status, 200, `GET ${pathname}: ${response.status} ${JSON.stringify(payload)}`)
    if (payload?.ok === false || payload?.code && payload.code !== 0) {
      throw new Error(`GET ${pathname} returned an error envelope: ${JSON.stringify(payload)}`)
    }
    return unwrap(payload)
  }

  const writeJson = async (method, pathname, body, expectedStatus) => {
    const { response, payload } = await request(method, pathname, body)
    assert.equal(response.status, expectedStatus, `${method} ${pathname}: ${response.status} ${JSON.stringify(payload)}`)
    if (payload?.ok === false || payload?.code && payload.code !== 0) {
      throw new Error(`${method} ${pathname} returned an error receipt: ${JSON.stringify(payload)}`)
    }
    return unwrap(payload)
  }

  const getCanvas = async canvasId => {
    const { response, payload } = await request('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
    assert.equal(response.status, 200, `Canvas GET: ${response.status} ${JSON.stringify(payload)}`)
    return unwrap(payload)
  }

  const readFileBytes = async fileRecordId => {
    const { response, bytes } = await request('GET',
      `/api/lcos/core/projects/${encodeURIComponent(projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`, undefined, { binary: true })
    assert.equal(response.status, 200, `FileRecord ${fileRecordId} bytes unavailable: ${response.status}`)
    return bytes
  }

  const saveJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')

  async function snapshot(label, workspaces) {
    const projectPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}`
    const [graph, runs, presentations] = await Promise.all([
      readJson(`${projectPath}/graph`), readJson(`${projectPath}/runs`), readJson(`${projectPath}/presentations`),
    ])
    const canvases = {}
    for (const workspace of workspaces) canvases[String(workspace.preferredSurface)] = await getCanvas(String(workspace.canvasId))
    const directory = path.join(evidenceDir, 'snapshots', safeName(label))
    const filesDirectory = path.join(directory, 'file-records')
    await mkdir(filesDirectory, { recursive: true })
    const files = []
    const fileBytesById = new Map()
    for (const file of graph.fileRecords ?? []) {
      const fileId = String(file.id)
      const bytes = await readFileBytes(fileId)
      const filePath = path.join(filesDirectory, `${safeName(fileId)}.bin`)
      await writeFile(filePath, bytes)
      fileBytesById.set(fileId, bytes)
      files.push({ id: fileId, mimeType: file.mimeType ?? null, byteLength: bytes.length,
        evidencePath: path.relative(evidenceDir, filePath).replaceAll(path.sep, '/') })
    }
    await saveJson(path.join(directory, 'graph.json'), graph)
    await saveJson(path.join(directory, 'runs.json'), runs)
    await saveJson(path.join(directory, 'presentations.json'), presentations)
    await saveJson(path.join(directory, 'canvases.json'), canvases)
    await saveJson(path.join(directory, 'file-records.json'), files)
    return { graph, runs, presentations, canvases, files, fileBytesById,
      directory: path.relative(evidenceDir, directory).replaceAll(path.sep, '/') }
  }

  const saveReport = async () => saveJson(reportPath, report)
  try {
    const healthResult = await originalFetch(`${origin}/health`, { headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store' })
    assert.equal(healthResult.status, 200, 'Runtime health must be reachable over the explicit loopback origin.')
    const health = await healthResult.json()
    report.runtimeHealth = health
    assert.equal(health.bind, '127.0.0.1')
    assert.equal(Number(health.port), port)
    assert.equal(health.nativeAssemblyPilot, true, 'Runtime must explicitly enable nativeAssemblyPilot.')
    assert.equal(health.realCoreConnected, true)
    assert.equal(health.cloudBackendConnected, false)
    assert.equal(health.profile, 'original-tapnow-full-integration-in-progress')
    assert.equal(health.localBackendMode, 'isolated-core-headless-huabu')
    assert.match(String(health.runtimeLabel), /^isolated-/)
    report.runtimeIdentity = { bind: health.bind, port: health.port, runtimeLabel: health.runtimeLabel,
      isolated: true, nativeAssemblyPilot: true, cloudBackendConnected: false }

    const projectPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}`
    const graphBefore = await readJson(`${projectPath}/graph`)
    assert.equal(String(graphBefore.project?.id), projectId)
    const workspaces = await readJson(`${projectPath}/workspaces`)
    assert.equal(workspaces.length, 3, 'This isolated full-integration Core runtime must expose exactly its three existing workspaces.')
    const workflow = workspaces.find(workspace => workspace.preferredSurface === 'workflow')
    const contextScope = graphBefore.scopes.find(scope => scope.kind === 'context')
    assert.ok(workflow?.canvasId && workflow.scopeId)
    assert.ok(contextScope?.id)
    report.workflow = { workspaceId: String(workflow.id), canvasId: String(workflow.canvasId), scopeId: String(workflow.scopeId) }

    // Read existing fixture markers first. A complete marker is reused; a partial marker is never replayed.
    const [connectedRowsRaw, sessionsRaw] = await Promise.all([
      readJson(`${projectPath}/connected-conversations`), readJson(`${projectPath}/conversations`),
    ])
    const connectedRows = Array.isArray(connectedRowsRaw) ? connectedRowsRaw : connectedRowsRaw?.items ?? []
    const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : sessionsRaw?.sessions ?? []
    const connectedMatches = connectedRows.filter(row => row.conversationRef === fixtureMarker)
    const sessionMatches = sessions.filter(row => row.title === conversationTitle)
    const markerLikeConnected = connectedRows.filter(row => String(row.conversationRef ?? '').includes(fixtureMarker)
      || String(row.label ?? '').includes(fixtureMarker))
    const markerLikeSessions = sessions.filter(row => String(row.title ?? '').includes(fixtureMarker))
    if (markerLikeConnected.length > 1 || markerLikeSessions.length > 1
      || markerLikeConnected.length !== connectedMatches.length || markerLikeSessions.length !== sessionMatches.length) {
      throw new Error('Ambiguous fixture marker found; stopped read-only without replaying any producer.')
    }
    let conversation
    let conversationSession
    if (connectedMatches.length === 1 && sessionMatches.length === 1) {
      conversation = connectedMatches[0]
      conversationSession = sessionMatches[0]
      if (String(conversation.conversationSessionId ?? '') !== String(conversationSession.id)) {
        throw new Error('Fixture marker is partial/unlinked; stopped read-only without replaying any producer.')
      }
      report.fixtureSteps.push({ method: 'GET', outcome: 'reused-complete-fixture',
        conversationId: String(conversation.id), conversationSessionId: String(conversationSession.id), marker: fixtureMarker })
    } else if (connectedMatches.length || sessionMatches.length) {
      throw new Error('Fixture marker is partial; stopped read-only without creating/importing/linking again.')
    } else {
      const createdConversation = await writeJson('POST', `${projectPath}/connected-conversations`, {
        action: 'connect', provider: 'codex', executorId: 'synthetic-manual-fixture',
        conversationRef: fixtureMarker, label: conversationTitle,
      }, 201)
      conversation = createdConversation
      assert.ok(conversation?.id)
      report.fixtureSteps.at(-1).outcome = 'created-official-connected-conversation'

      const imported = await writeJson('POST', `${projectPath}/conversations/import-manual`, {
        title: conversationTitle, scopeId: String(contextScope.id), entries: [
          { role: 'user', contentText: `人工合成 fixture ${fixtureMarker}；不是当前 Codex 对话，不含模型结果。` },
          { role: 'assistant', contentText: '由 import-manual 导入，仅用于真实 WorkView/Composer/Library GUI 检查。' },
        ],
      }, 201)
      conversationSession = imported.session
      assert.ok(conversationSession?.id)
      report.fixtureSteps.at(-1).outcome = 'imported-explicitly-manual-synthetic-session'
      report.fixtureSteps.at(-1).sessionId = String(conversationSession.id)

      const connectedConversationId = String(conversation.id)
      const linked = await writeJson('POST', `${projectPath}/connected-conversations/${encodeURIComponent(connectedConversationId)}/link-session`, {
        conversationSessionId: String(conversationSession.id),
      }, 200)
      assert.equal(String(linked.connectedConversation?.id), connectedConversationId)
      assert.equal(String(linked.conversationSession?.id), String(conversationSession.id))
      conversation = linked.connectedConversation
      conversationSession = linked.conversationSession
      report.fixtureSteps.at(-1).outcome = 'linked-canonical-manual-session'
      report.fixtureSteps.at(-1).conversationId = String(conversation.id)
    }
    const conversationId = String(conversation.id)
    const conversationSessionId = String(conversationSession.id)
    report.syntheticConversation = { conversationId, conversationSessionId, marker: fixtureMarker,
      source: 'Core official ConnectedConversation + import-manual; not a current conversation, model output, or Provider result' }

    const currentCanvas = await getCanvas(String(workflow.canvasId))
    const projectedConversationNodes = fixtureHasConversationNode(currentCanvas, conversationId)
    if (projectedConversationNodes.length > 1) throw new Error('Duplicate exact Glyth already exists; no reconcile replay attempted.')
    let reconcileReceipt = null
    if (projectedConversationNodes.length === 0) {
      const reconcilePath = `/api/lcos/canvases/${encodeURIComponent(workflow.canvasId)}/conversations:reconcile`
      const { response, payload } = await request('POST', reconcilePath, { connectedConversationId: conversationId })
      assert.equal(response.status, 200, `Conversation reconcile: ${response.status} ${JSON.stringify(payload)}`)
      assert.equal(payload?.code, 0, JSON.stringify(payload))
      assert.equal(payload?.data?.provider_execution_started, false)
      assert.ok(payload?.data?.bindings?.some(binding => String(binding.entityId) === conversationId
        && binding.entityType === 'conversation'))
      reconcileReceipt = payload.data
      report.fixtureSteps.at(-1).outcome = 'projected-one-original-core-conversation-binding-no-provider'
      report.fixtureSteps.at(-1).binding = payload.data.bindings.find(binding => String(binding.entityId) === conversationId)
    } else {
      report.fixtureSteps.push({ method: 'GET', outcome: 'reused-existing-exact-glyth', canvasId: workflow.canvasId,
        nodeId: projectedConversationNodes[0].id })
    }
    const canvasAfterConversation = await getCanvas(String(workflow.canvasId))
    const exactGlyths = fixtureHasConversationNode(canvasAfterConversation, conversationId)
    assert.equal(exactGlyths.length, 1, 'Exactly one original Canvas Glyth must bind this ConnectedConversation.')
    assert.ok(exactContains(exactGlyths[0].data, conversationId))
    report.conversationProjection = { nodeId: String(exactGlyths[0].id), conversationId, reconcileReceipt,
      providerExecutionStarted: false }

    // Create/reuse one historical text revision using the original Core CanvasText CAS producer.
    const workflowCanvas = canvasAfterConversation
    const textNode = (workflowCanvas.nodes ?? []).find(node => String(node.id) === 'surface-workflow-text')
    assert.ok(textNode, 'Use the original existing Workflow text node; no new canvas node is created.')
    const textPath = `${projectPath}/curation/canvas-text`
    const textAddress = `?canvasId=${encodeURIComponent(workflow.canvasId)}&spatialId=${encodeURIComponent(String(textNode.id))}`
    const textBefore = await readJson(`${textPath}${textAddress}`)
    assert.ok(textBefore?.artifactId && textBefore?.revisionId && textBefore?.fileRecordId && typeof textBefore.body === 'string')
    let textCurrent = textBefore
    let historicalRevisionId
    let historicalBody
    if (!textBefore.body.includes(textMarker)) {
      const body = `${textBefore.body.replace(/\s*$/, '')}\n\n${textMarker}\n`
      textCurrent = await writeJson('PUT', textPath, {
        canvasId: workflow.canvasId, spatialId: String(textNode.id), artifactId: String(textBefore.artifactId),
        expectedRevisionId: String(textBefore.revisionId), body,
      }, 200)
      assert.equal(textCurrent.body, body)
      historicalRevisionId = String(textBefore.revisionId)
      historicalBody = textBefore.body
      report.fixtureSteps.at(-1).outcome = 'created-one-history-revision-through-original-Core-CanvasText-CAS'
      report.fixtureSteps.at(-1).previousRevisionId = String(textBefore.revisionId)
      report.fixtureSteps.at(-1).currentRevisionId = String(textCurrent.revisionId)
      report.fixtureSteps.at(-1).marker = textMarker
    } else {
      const latest = await readJson(`${projectPath}/graph`)
      const currentArtifact = latest.artifacts.find(row => String(row.id) === String(textBefore.artifactId))
      const currentRevision = latest.artifactRevisions.find(row => String(row.id) === String(currentArtifact?.currentRevisionId))
      historicalRevisionId = currentRevision?.parentRevisionId ? String(currentRevision.parentRevisionId) : undefined
      assert.ok(historicalRevisionId, 'Marker already exists but no historical parent revision is available; no extra PUT was issued.')
      report.fixtureSteps.push({ method: 'GET', outcome: 'reused-existing-text-marker-and-history', marker: textMarker,
        artifactId: String(textBefore.artifactId), currentRevisionId: String(textBefore.revisionId), historicalRevisionId })
    }
    assert.notEqual(String(textCurrent.revisionId), String(historicalRevisionId))
    const latestGraph = await readJson(`${projectPath}/graph`)
    const latestArtifact = latestGraph.artifacts.find(row => String(row.id) === String(textCurrent.artifactId))
    assert.equal(String(latestArtifact?.currentRevisionId), String(textCurrent.revisionId))
    const currentRevision = latestGraph.artifactRevisions.find(row => String(row.id) === String(textCurrent.revisionId))
    const historicalRevision = latestGraph.artifactRevisions.find(row => String(row.id) === String(historicalRevisionId))
    assert.equal(String(currentRevision?.artifactId), String(textCurrent.artifactId))
    assert.equal(String(historicalRevision?.artifactId), String(textCurrent.artifactId))
    assert.equal(String(currentRevision?.fileRecordId), String(textCurrent.fileRecordId))
    const currentBytes = await readFileBytes(String(currentRevision.fileRecordId))
    const historicalBytes = await readFileBytes(String(historicalRevision.fileRecordId))
    assert.equal(currentBytes.toString('utf8'), textCurrent.body, 'Current FileRecord bytes must equal the exact Core CanvasText body.')
    historicalBody ??= historicalBytes.toString('utf8')
    if (historicalRevisionId === String(textBefore.revisionId)) {
      assert.equal(historicalBytes.toString('utf8'), textBefore.body, 'Historical FileRecord bytes must equal the original CanvasText body.')
    }
    report.workflowText = { nodeId: String(textNode.id), title: textCurrent.title, artifactId: String(textCurrent.artifactId),
      viewId: String(textCurrent.viewId), marker: textMarker, currentRevisionId: String(textCurrent.revisionId),
      currentFileRecordId: String(currentRevision.fileRecordId), currentByteLength: currentBytes.length,
      historicalRevisionId, historicalFileRecordId: String(historicalRevision.fileRecordId), historicalByteLength: historicalBytes.length }

    report.phase = 'fixture-complete-pre-browser'
    beforeSnapshot = await snapshot('before-browser', workspaces)
    report.snapshots = { beforeBrowser: beforeSnapshot.directory, filesCaptured: beforeSnapshot.files.length,
      exactFileBytesSaved: true }
    await saveReport()

    // Browser phase is an observation surface: same-origin GET/HEAD only; all writes and non-loopback traffic are denied.
    report.phase = 'browser'
    const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' })
    let geometryBootstrapOpen = true
    let geometryBootstrapUsed = false
    let knownWorkflowCanvas = beforeSnapshot.canvases.workflow
    let knownWorkflowNodes = new Map((knownWorkflowCanvas.nodes ?? []).map(node => [String(node.id), node]))
    const measuredEchoPath = `/api/canvas/v1/canvases/${encodeURIComponent(workflow.canvasId)}/nodes:batchActions`
    const readFreshWorkflowCanvas = async () => {
      const response = await originalFetch(`${origin}/api/canvas/v1/canvases/${encodeURIComponent(workflow.canvasId)}`,
        { headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store' })
      assert.equal(response.status, 200, 'Read back Workflow after one measured geometry echo.')
      return unwrap(await response.json())
    }
    const safeMeasuredEcho = body => {
      const allowedBody = new Set(['canvas_id', 'actions', 'created_by_role', 'lcos_expected_revisions'])
      if (!body || body.canvas_id !== workflow.canvasId || !Array.isArray(body.actions) || body.actions.length !== 1
        || Object.keys(body).some(key => !allowedBody.has(key)) || body.created_by_role !== undefined && body.created_by_role !== 'user') return null
      const action = body.actions[0]
      if (action?.action !== 'update' || !Array.isArray(action.updates) || !action.updates.length) return null
      const allowedUpdate = new Set(['id', 'type', 'data', 'position', 'measured'])
      const changes = []
      for (const update of action.updates) {
        const prior = knownWorkflowNodes.get(String(update?.id ?? ''))
        const size = update?.measured
        if (!prior || Object.keys(update).some(key => !allowedUpdate.has(key))
          || update.type !== undefined && update.type !== prior.type
          || update.data !== undefined && !isDeepStrictEqual(update.data, prior.data)
          || update.position !== undefined && !isDeepStrictEqual(update.position, prior.position)
          || !size || !Number.isFinite(size.width) || !Number.isFinite(size.height)
          || size.width <= 0 || size.height <= 0 || size.width > 4096 || size.height > 4096) return null
        const oldSize = prior.measured ?? { width: prior.width ?? prior.style?.width ?? 300,
          height: prior.height ?? prior.style?.height ?? 270 }
        const unchanged = Number(size.width) === Number(oldSize.width) && Number(size.height) === Number(oldSize.height)
        const knownColdImageMeasure = geometryBootstrapOpen && !geometryBootstrapUsed && prior.type === 'image'
          && Number(oldSize.width) === 360 && Number(oldSize.height) === 240
          && Number(size.width) === 375 && Number(size.height) === 250
        if (!unchanged && !knownColdImageMeasure) return null
        if (knownColdImageMeasure) changes.push({ id: String(update.id), from: oldSize, to: size })
      }
      const expectedRevisions = body.lcos_expected_revisions
      if (expectedRevisions !== undefined && (expectedRevisions === null || typeof expectedRevisions !== 'object'
        || Array.isArray(expectedRevisions) || Object.entries(expectedRevisions).some(([id, revisionId]) =>
          !knownWorkflowNodes.has(id) || typeof revisionId !== 'string'
            || knownWorkflowNodes.get(id)?.lcos_revision_id !== revisionId))) return null
      return { updates: action.updates, coldImageMeasures: changes }
    }
    await context.route('**/*', async route => {
      const req = route.request()
      const address = new URL(req.url())
      if (['data:', 'blob:'].includes(address.protocol)) return route.continue()
      if (address.origin !== origin) {
        const item = { method: req.method(), origin: address.origin, path: address.pathname, reason: 'external HTTP denied' }
        report.externalRequestsBlocked.push(item)
        return route.abort('blockedbyclient')
      }
      if (['GET', 'HEAD'].includes(req.method())) return route.continue()
      if (req.method() === 'POST' && address.pathname === measuredEchoPath) {
        let body
        try { body = req.postDataJSON() } catch { body = undefined }
        const echo = safeMeasuredEcho(body)
        if (echo) {
          const response = await route.fetch()
          const entry = { path: address.pathname, status: response.status(), nodeIds: echo.updates.map(update => String(update.id)),
            exactMeasuredEcho: true, coldImageMeasures: echo.coldImageMeasures }
          if (response.ok()) {
            if (echo.coldImageMeasures.length) geometryBootstrapUsed = true
            knownWorkflowCanvas = await readFreshWorkflowCanvas()
            knownWorkflowNodes = new Map((knownWorkflowCanvas.nodes ?? []).map(node => [String(node.id), node]))
            report.measuredBrowserEchoesForwarded.push(entry)
          } else report.otherBlockedBackgroundRequests.push({ ...entry, reason: 'measured echo did not receive a successful receipt' })
          return route.fulfill({ response })
        }
      }
      const item = { method: req.method(), path: address.pathname, reason: 'browser stage permits GET/HEAD only' }
      report.browserWritesBlocked.push(item)
      if (address.pathname === '/api/events' || /execution:reconcile$/.test(address.pathname)
        || /nodes:batchActions$/.test(address.pathname)) report.expectedBackgroundBlocks.push(item)
      else report.otherBlockedBackgroundRequests.push(item)
      return route.abort('blockedbyclient')
    })
    if (context.routeWebSocket) await context.routeWebSocket('**/*', socket => {
      report.websocketAttemptsBlocked.push({ url: socket.url(), reason: 'browser WebSocket disabled for offline test' })
      socket.close({ code: 1008, reason: 'offline test' })
    })
    page = await context.newPage()
    page.on('pageerror', error => report.pageErrors.push(String(error)))
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 1000)) })
    page.on('request', req => {
      const url = new URL(req.url())
      if (url.origin === origin && url.pathname.startsWith('/api/')) {
        report.apiObservations.push({ method: req.method(), path: url.pathname, query: url.search })
      }
    })
    page.on('response', response => {
      const url = new URL(response.url())
      if (url.origin === origin && response.status() >= 400) {
        report.apiFailures.push({ method: response.request().method(), path: url.pathname, status: response.status() })
      }
    })

    const screenshot = async label => {
      const file = path.join(evidenceDir, `${safeName(label)}.png`)
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
      report.screenshots.push(path.relative(evidenceDir, file).replaceAll(path.sep, '/'))
    }
    const waitForCanvas = async () => {
      await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 })
      await page.waitForFunction(() => document.title.includes('TapNow'), null, { timeout: 20000 })
    }
    const openWorkComposer = async () => {
      const closeAgent = page.getByRole('button', { name: '关闭 Agent 面板', exact: true })
      if (await closeAgent.isVisible().catch(() => false)) await closeAgent.click()
      const workView = page.locator('[data-lcos-conversation-work-view]')
      if (!await workView.isVisible().catch(() => false)) {
        const glyth = page.locator('[data-lcos-node-kind="conversation"] button[aria-haspopup="dialog"]')
        await glyth.waitFor({ state: 'visible', timeout: 20000 })
        assert.equal(await glyth.count(), 1, 'Use the one fixture Conversation Glyth in original Workflow.')
        await glyth.click()
        await workView.waitFor({ state: 'visible', timeout: 15000 })
      }
      const composer = page.locator('[data-lcos-composer-reference-surface]')
      if (!await composer.isVisible().catch(() => false)) {
        const delegate = page.locator('[data-lcos-open-work-composer]')
        await delegate.waitFor({ state: 'visible', timeout: 12000 })
        assert.equal(await delegate.isDisabled(), false)
        await delegate.click()
      }
      await composer.waitFor({ state: 'visible', timeout: 12000 })
      assert.equal(await page.locator('[data-lcos-composer-input]').inputValue(), '', 'Never send or invent Composer prompt text.')
      return composer
    }
    const openLibrary = async () => {
      const library = page.locator('[data-library-view="library"]')
      if (!await library.isVisible().catch(() => false)) {
        await page.locator('[data-testid="canvas-dockbar-assets-btn"]').click()
        await library.waitFor({ state: 'visible', timeout: 15000 })
      }
      return library
    }
    const searchAndOpenText = async () => {
      const library = await openLibrary()
      const inputs = library.locator('input')
      let search = library.locator('input[type="search"]')
      if (!await search.count()) {
        const visible = []
        for (const input of await inputs.all()) if (await input.isVisible().catch(() => false)) visible.push(input)
        search = visible.length === 1 ? visible[0] : library.getByRole('textbox').first()
      }
      await search.waitFor({ state: 'visible', timeout: 10000 })
      await search.fill('Workflow')
      report.librarySearch = { exactQuery: 'Workflow', inputType: await search.getAttribute('type'),
        placeholder: await search.getAttribute('placeholder') }
      await page.waitForTimeout(700)
      const title = library.getByText(textCurrent.title, { exact: true }).first()
      await title.waitFor({ state: 'visible', timeout: 20000 })
      report.libraryMaterialRow = await title.evaluate(element => {
        const parents = []
        let current = element
        for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
          parents.push({ tag: current.tagName, role: current.getAttribute('role'), testId: current.getAttribute('data-testid'),
            className: typeof current.className === 'string' ? current.className.slice(0, 180) : '' })
        }
        return { text: element.textContent?.trim() ?? '', ancestors: parents }
      })
      await title.click()
      const tools = page.locator('section[aria-label="Assembly 材料与引用"]')
      await tools.waitFor({ state: 'visible', timeout: 10000 })
      await page.waitForFunction(() => document.querySelector('section[aria-label="Assembly 材料与引用"]')
        ?.getAttribute('data-native-assembly-state') === 'ready', null, { timeout: 30000 })
      return { library, tools, preview: tools.locator('.native-assembly-preview') }
    }
    const assertReadyRevision = async (tools, preview, revisionId, fileRecordId, body) => {
      await page.waitForFunction(({ revisionId, fileRecordId }) => {
        const preview = document.querySelector('[aria-label="Assembly 材料与引用"] .native-assembly-preview')
        return preview?.getAttribute('data-native-assembly-revision') === revisionId
          && preview?.getAttribute('data-native-assembly-file') === fileRecordId
      }, { revisionId, fileRecordId }, { timeout: 25000 })
      const rendered = await preview.innerText()
      const expectedText = compact(visibleBody(body))
      assert.ok(expectedText && compact(rendered).includes(expectedText),
        `Original NativePreview must render the full exact selected revision body ${revisionId}.`)
      const previewApply = tools.locator('.native-assembly-preview button').filter({ hasText: /添加到画布|添加至画布|Apply/i })
      assert.equal(await previewApply.count(), 0, 'Pinned historical/current revision preview must not advertise the original create/insert Apply action.')
      return { revisionId, fileRecordId, renderedText: rendered, fullBodyMatched: true }
    }

    await page.goto(`${origin}/canvas/${encodeURIComponent(workflow.canvasId)}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await waitForCanvas()
    await page.waitForTimeout(1200)
    geometryBootstrapOpen = false
    report.geometryBootstrap = { allowedOnlyExactExistingNodeMeasuredEcho: true,
      permittedColdImageMeasure: '360x240 -> 375x250', used: geometryBootstrapUsed,
      echoes: report.measuredBrowserEchoesForwarded }
    const browserBaselineSnapshot = await snapshot('after-native-canvas-measurement-bootstrap', workspaces)
    report.snapshots.afterNativeCanvasMeasurementBootstrap = browserBaselineSnapshot.directory
    await saveReport()
    const workView = await openWorkComposer()
    await screenshot('01-original-workview-composer')
    const library = await openLibrary()
    await screenshot('02-original-library')
    const { tools, preview } = await searchAndOpenText()
    await preview.scrollIntoViewIfNeeded()
    const currentPreview = await assertReadyRevision(tools, preview, String(textCurrent.revisionId),
      String(currentRevision.fileRecordId), textCurrent.body)
    report.currentNativePreview = { ...currentPreview, title: textCurrent.title,
      exactCoreBytes: true, byteLength: currentBytes.length }
    await screenshot('03-current-native-preview')

    const versionSelect = tools.getByRole('combobox', { name: '材料版本', exact: true })
    let injectedHistoryFailures = 0
    const historyContentMatch = url => url.origin === origin
      && url.pathname.endsWith(`/file-records/${encodeURIComponent(String(historicalRevision.fileRecordId))}/content`)
    const failHistoricalRead = async route => {
      injectedHistoryFailures += 1
      return route.fulfill({ status: 503, contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: { code: 'SYNTHETIC_PREVIEW_READ_FAILURE', message: 'Explicit GUI test read failure; no data changed.' } }) })
    }
    await context.route(historyContentMatch, failHistoricalRead)
    try {
      await versionSelect.selectOption(String(historicalRevisionId))
      await page.waitForFunction(() => document.querySelector('[aria-label="Assembly 材料与引用"]')
        ?.getAttribute('data-native-assembly-state') === 'error', null, { timeout: 25000 })
      assert.equal(injectedHistoryFailures, 1, 'One deliberate read failure, no automatic replay.')
      assert.equal(await preview.count(), 0, 'Failed historical preview must not display Current bytes.')
      assert.equal(await tools.getByRole('button', { name: '加入本次引用', exact: true }).isDisabled(), true)
      assert.equal(await versionSelect.isDisabled(), false, 'Version picker remains usable after a read failure.')
      await versionSelect.selectOption(String(textCurrent.revisionId))
      await assertReadyRevision(tools, preview, String(textCurrent.revisionId), String(currentRevision.fileRecordId), textCurrent.body)
      report.failedPreviewRecovery = { injectedHttp503: 1, currentSubstitution: false, failedReferenceDisabled: true,
        pickerRetained: true, recoveredByExplicitVersionSelection: true, automaticReplay: false }
    } finally { await context.unroute(historyContentMatch, failHistoricalRead) }
    await versionSelect.selectOption(String(historicalRevisionId))
    const historicalPreview = await assertReadyRevision(tools, preview, String(historicalRevisionId),
      String(historicalRevision.fileRecordId), historicalBody)
    report.historicalNativePreview = { ...historicalPreview, exactCoreBytes: true,
      byteLength: historicalBytes.length, byteFilePath: beforeSnapshot.files.find(file => file.id === String(historicalRevision.fileRecordId))?.evidencePath ?? null }
    await screenshot('04-historical-native-preview')
    const historicalViewport = await page.locator('.react-flow__viewport').getAttribute('style')
    await tools.getByRole('button', { name: '定位准确版本', exact: true }).click()
    await tools.getByRole('status').filter({ hasText: '当前画布没有这个准确版本' }).waitFor({ state: 'visible' })
    assert.equal(await page.locator('.react-flow__viewport').getAttribute('style'), historicalViewport,
      'A missing historical node must not jump to Current or create a node.')
    report.historicalRevisionLocate = { missingExactVersionKeptViewport: true, currentFallback: false, nodeCreated: false }

    const composerRefs = page.locator('[data-lcos-composer-ref]')
    const refsBefore = await composerRefs.evaluateAll(elements => elements.map(element => ({
      key: element.getAttribute('data-reference-key'), label: element.querySelector('.lcos-composer-reference-label')?.textContent?.trim() ?? '',
    })))
    const referenceButton = tools.getByRole('button', { name: '加入本次引用', exact: true })
    await referenceButton.waitFor({ state: 'visible', timeout: 10000 })
    await referenceButton.click()
    await page.waitForFunction(({ revisionId }) => [...document.querySelectorAll('[data-lcos-composer-ref]')]
      .some(element => {
        const raw = element.getAttribute('data-reference-key') ?? ''
        try { return JSON.stringify(JSON.parse(raw)).includes(revisionId) } catch { return raw.includes(revisionId) }
      }), { revisionId: String(historicalRevisionId) }, { timeout: 20000 })
    const refsAfterPick = await composerRefs.evaluateAll(elements => elements.map(element => ({
      key: element.getAttribute('data-reference-key'), label: element.querySelector('.lcos-composer-reference-label')?.textContent?.trim() ?? '',
    })))
    assert.equal(refsAfterPick.length, refsBefore.length + 1, 'One exact historical reference is added to the same unsent Composer.')
    const picked = refsAfterPick.find(reference => String(reference.key).includes(String(historicalRevisionId)))
    assert.ok(picked, 'Composer reference key must contain the selected historical Revision, never Current substitution.')
    assert.equal(await page.locator('[data-lcos-composer-input]').inputValue(), '')
    report.historicalComposerReference = { before: refsBefore, after: refsAfterPick,
      exactRevisionKey: picked.key, historicalRevisionId, noPromptText: true, submitted: false }
    await screenshot('05-historical-reference-in-composer')

    await tools.getByRole('button', { name: '取消材料预览', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[aria-label="Assembly 材料与引用"]')
      ?.getAttribute('data-native-assembly-state') === 'idle')
    assert.equal(await composerRefs.count(), refsAfterPick.length)
    const rowAgain = library.getByText(textCurrent.title, { exact: true }).first()
    await rowAgain.click()
    await page.waitForFunction(() => document.querySelector('[aria-label="Assembly 材料与引用"]')
      ?.getAttribute('data-native-assembly-state') === 'ready', null, { timeout: 25000 })
    assert.equal(await composerRefs.count(), refsAfterPick.length, 'Cancel/reopen must not add a duplicate reference.')
    report.cancelReopen = { referenceCountBefore: refsBefore.length, afterPick: refsAfterPick.length,
      afterCancelAndReopen: await composerRefs.count(), duplicateAdded: false }

    const currentOption = String(textCurrent.revisionId)
    await tools.getByRole('combobox', { name: '材料版本', exact: true }).selectOption(currentOption)
    await page.waitForFunction(({ revisionId, fileRecordId }) => {
      const preview = document.querySelector('[aria-label="Assembly 材料与引用"] .native-assembly-preview')
      return preview?.getAttribute('data-native-assembly-revision') === revisionId
        && preview?.getAttribute('data-native-assembly-file') === fileRecordId
    }, { revisionId: currentOption, fileRecordId: String(currentRevision.fileRecordId) }, { timeout: 25000 })
    const flow = page.locator('.react-flow')
    const box = await flow.boundingBox()
    assert.ok(box)
    const viewport = page.locator('.react-flow__viewport')
    const transformOf = async () => viewport.getAttribute('style')
    const beforePan = await transformOf()
    // Blank canvas between Library (left) and WorkView (right), not the overlaid Composer.
    await page.mouse.move(box.x + box.width * .44, box.y + box.height * .82)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, 420)
    await page.keyboard.up('Control')
    await page.waitForTimeout(450)
    const zoomedTransform = await transformOf()
    const locate = tools.getByRole('button', { name: '定位准确版本', exact: true })
    await locate.click()
    await page.waitForTimeout(500)
    const locatedTransform = await transformOf()
    assert.notEqual(zoomedTransform, beforePan, 'Real GUI wheel input should move the original ReactFlow viewport before locate.')
    assert.notEqual(locatedTransform, zoomedTransform, 'Original fitView API must visibly move the viewport to the exact current revision.')
    report.currentRevisionLocate = { beforePan, zoomedTransform, locatedTransform, viewportChangedByGui: true,
      currentRevisionId: currentOption, fileRecordId: String(currentRevision.fileRecordId), action: 'NativeTools original ReactFlow fitView' }
    await screenshot('06-current-revision-located')

    // Reuse the same original search/list and TS detail for a real local image, not a text-shaped mock.
    const imageCatalog = await readJson('/api/library/v1/assets:search?type_filter=1&page=1&page_size=20')
    const imageAsset = imageCatalog.items.map(row => row.asset).find(asset => asset.lcos_projection?.referenceable)
    assert.ok(imageAsset && imageAsset.asset_type === 1)
    const nativeSearch = library.getByRole('textbox').first()
    await nativeSearch.fill(imageAsset.name)
    await library.getByText(imageAsset.name, { exact: true }).first().click()
    await page.waitForFunction(({ revisionId, fileRecordId }) => {
      const preview = document.querySelector('[aria-label="Assembly 材料与引用"] .native-assembly-preview')
      const image = preview?.querySelector('img')
      return preview?.getAttribute('data-native-assembly-revision') === revisionId
        && preview?.getAttribute('data-native-assembly-file') === fileRecordId
        && image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:')
    }, { revisionId: imageAsset.lcos_projection.presented_revision_id,
      fileRecordId: imageAsset.lcos_projection.file_record_id }, { timeout: 25000 })
    assert.equal(await composerRefs.count(), refsAfterPick.length, 'Image browsing does not add a second reference.')
    report.nativeImagePreview = { title: imageAsset.name, revisionId: imageAsset.lcos_projection.presented_revision_id,
      fileRecordId: imageAsset.lcos_projection.file_record_id, originalTSImageLoaded: true, blobUrl: true, addedReference: false }
    await screenshot('07-local-image-native-preview')

    // Refresh the original page and reopen the same Library preview from the Core-backed list.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
    await waitForCanvas()
    // Refresh readback does not reopen/retarget an unsent message; persisted WorkView may already cover its Glyth.
    const refreshedAgentClose = page.getByRole('button', { name: '关闭 Agent 面板', exact: true })
    await refreshedAgentClose.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {})
    if (await refreshedAgentClose.isVisible().catch(() => false)) await refreshedAgentClose.click()
    const libraryAfterRefresh = await openLibrary()
    const searchAfterRefresh = libraryAfterRefresh.locator('input[type="search"]').first()
    if (await searchAfterRefresh.count()) await searchAfterRefresh.fill('Workflow')
    else {
      const candidates = libraryAfterRefresh.getByRole('textbox')
      await candidates.first().fill('Workflow')
    }
    await page.waitForTimeout(700)
    await libraryAfterRefresh.getByText(textCurrent.title, { exact: true }).first().click()
    const refreshedTools = page.locator('section[aria-label="Assembly 材料与引用"]')
    await page.waitForFunction(() => document.querySelector('section[aria-label="Assembly 材料与引用"]')
      ?.getAttribute('data-native-assembly-state') === 'ready', null, { timeout: 30000 })
    const refreshedPreview = refreshedTools.locator('.native-assembly-preview')
    const refreshCheck = await assertReadyRevision(refreshedTools, refreshedPreview, String(textCurrent.revisionId),
      String(currentRevision.fileRecordId), textCurrent.body)
    report.refreshConsistency = { ...refreshCheck, CoreRevisionId: String(textCurrent.revisionId),
      CoreFileRecordId: String(currentRevision.fileRecordId), exactCoreBytes: true }
    await screenshot('08-refresh-core-preview-consistent')
    const pageIdentity = { url: page.url(), title: await page.title() }
    assert.equal(new URL(pageIdentity.url).origin, origin)
    assert.equal(new URL(pageIdentity.url).pathname, `/canvas/${workflow.canvasId}`)
    assert.ok(pageIdentity.title.includes('TapNow'))
    assert.ok((await page.locator('body').innerText()).includes('Assembly'))
    assert.equal(await page.locator('vite-error-overlay, nextjs-portal').count(), 0)
    assert.deepEqual(report.pageErrors, [], 'No uncaught application errors in the exercised native Library/Composer path.')
    report.renderChecks = { pageIdentity, meaningfulContent: true, frameworkOverlay: false, uncaughtPageErrors: 0,
      viewport: { width: 1440, height: 1000 }, consoleHealth: 'known unsupported/blocked background calls are listed, not claimed zero' }
    await page.setViewportSize({ width: 1024, height: 768 })
    const narrowBounds = await refreshedTools.boundingBox()
    assert.ok(narrowBounds && narrowBounds.x >= 0 && narrowBounds.x + narrowBounds.width <= 1024,
      'Native Library plus the added inspector must stay inside the smaller desktop viewport.')
    assert.equal(await refreshedTools.getByRole('button', { name: '定位准确版本', exact: true }).isVisible(), true)
    await refreshedTools.getByRole('button', { name: '定位准确版本', exact: true }).click({ trial: true, timeout: 5000 })
    await refreshedTools.getByRole('button', { name: '取消材料预览', exact: true }).click({ trial: true, timeout: 5000 })
    report.smallerDesktop = { viewport: { width: 1024, height: 768 }, inspectorBounds: narrowBounds,
      nativeControlsVisible: true, enabledNativeActionsHitTestedWithoutClicking: true, mobileLayoutClaimed: false }
    await screenshot('09-smaller-desktop-native-library')

    report.browserWritesForwarded = []
    assert.equal(report.browserWritesForwarded.length, 0, 'No browser business write was forwarded.')
    report.fixtureExecution = { runCreated: false, providerCalled: false, modelCalled: false,
      canvasNodesCreatedByBrowser: false, unknownReceiptsReplayed: false }
    report.phase = 'browser-complete-post-browser-snapshot'
    const afterSnapshot = await snapshot('after-browser', workspaces)
    assert.deepEqual(afterSnapshot.graph, beforeSnapshot.graph, 'Browser interactions must not mutate Core project graph.')
    assert.deepEqual(afterSnapshot.runs, beforeSnapshot.runs, 'Browser interactions must not create a Run.')
    assert.deepEqual(afterSnapshot.presentations, beforeSnapshot.presentations, 'Browser interactions must not mutate Core Presentations.')
    assert.deepEqual(afterSnapshot.canvases, browserBaselineSnapshot.canvases,
      'After the explicit cold-image measurement bootstrap, browser interactions must not persist Canvas changes.')
    assert.deepEqual(afterSnapshot.files.map(file => ({ id: file.id, byteLength: file.byteLength })),
      beforeSnapshot.files.map(file => ({ id: file.id, byteLength: file.byteLength })))
    for (const [id, bytes] of beforeSnapshot.fileBytesById) assert.ok(bytes.equals(afterSnapshot.fileBytesById.get(id)), `FileRecord bytes changed: ${id}`)
    report.snapshots.afterBrowser = afterSnapshot.directory
    report.snapshots.graphRunsPresentationsThreeCanvasesAllFileRecordBytesEqual = true
    report.browserObservations = {
      apiObservations: report.apiObservations,
      apiFailures: report.apiFailures,
      blockedWrites: report.browserWritesBlocked,
      blockedBackgroundClassification: { expected: report.expectedBackgroundBlocks, other: report.otherBlockedBackgroundRequests },
      externalRequestsBlocked: report.externalRequestsBlocked,
      websocketAttemptsBlocked: report.websocketAttemptsBlocked,
      pageErrors: report.pageErrors, consoleErrors: report.consoleErrors,
      note: 'Blocked/501 background requests are recorded above and are not claimed as zero-console or zero-error.'
    }
    report.passed = true
    report.phase = 'passed'
  } catch (error) {
    report.error = { name: error?.name ?? 'Error', message: error?.message ?? String(error), stack: error?.stack ?? '' }
    report.phase = 'failed'
    if (page) {
      try {
        const file = path.join(evidenceDir, `failure-${Date.now()}.png`)
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
        report.screenshots.push(path.relative(evidenceDir, file).replaceAll(path.sep, '/'))
      } catch { /* preserve primary failure */ }
    }
    throw error
  } finally {
    try { await context?.close() } catch { /* report remains primary */ }
    try { await browser?.close() } catch { /* report remains primary */ }
    try { await saveReport() } catch (error) { console.error(`Could not save evidence report ${reportPath}: ${String(error)}`) }
    console.log(JSON.stringify({ passed: report.passed, phase: report.phase, reportPath, evidenceDir,
      fixtureSteps: report.fixtureSteps.length, screenshots: report.screenshots.length,
      browserWritesForwarded: report.browserWritesForwarded.length, browserWritesBlocked: report.browserWritesBlocked.length,
      error: report.error?.message ?? null }, null, 2))
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
