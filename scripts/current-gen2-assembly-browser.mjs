import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Resources, currentGen2Root } from '../lab/current-gen2-resources.mjs'
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
const reportDir = path.join(runtimeBase, 'native-gen2-assembly-browser')
const runtimeLabel = `isolated-gen2-assembly-${Date.now()}`
const runtimeRoot = path.join(runtimeBase, runtimeLabel)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const reportPath = path.join(reportDir, `${stamp}.json`)
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
const projectId = 'disposable-surface-core-facade'

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--run-isolated')) {
    console.error('Not started. Use --run-isolated to create and test a disposable Core runtime; live runtimes are not used.')
    process.exitCode = 2
  } else await run()
}

async function run() {
  const report = {
    at: new Date().toISOString(), passed: false, runtimeLabel, runtimeRoot, reportPath,
    currentGen2Root, fixtureKind: 'manual synthetic Core Capture text + manually imported conversation transcript; no model/provider result',
    viewport: { width: 1440, height: 1000 }, serviceWorkers: 'blocked', externalHttpAllowed: false,
    externalWebSocketAllowed: false, providerExecution: false, modelExecution: false,
    browserAutomation: { browserPluginAvailable: false, fallback: 'repository Playwright + installed Chrome; explicit task-approved fallback' },
    fixtureWrites: [], browserWrites: [], blockedWrites: [], blockedWebSockets: [], deniedNodeFetches: [],
    unexpectedBlockedWrites: [], diagnosticTelemetry: [], initialSpatialSynchronizations: [], executionProjectionSyncs: [],
    pageErrors: [], consoleErrors: [], apiFailures: [], requestFailures: [], warehouseReads: [], cases: [], screenshots: [], launcher: {},
  }
  const deniedEnv = [
    'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LCOS_CODEX_AUTO_EXECUTION',
    'LCOS_WORKBUDDY_AUTO_EXECUTION', 'HUABU_HOST_URL', 'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN',
    'HUABU_AGENTLET_ID', 'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD',
    'HUABU_DATA_DIR', 'LCOS_OCR_PYTHON', 'LCOS_OLLAMA_URL', 'LCOS_OLLAMA_EMBED_MODEL',
  ]
  for (const key of deniedEnv) delete process.env[key]
  process.env.LCOS_RECOVERY_TRANSPORT = 'none'
  process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
  process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
  process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

  let facade
  let browser
  let context
  let page
  let launcher
  let launcherStdout = ''
  let launcherStderr = ''
  let launcherState = { closed: undefined }
  let origin
  let uiPort
  let serverPid
  let coreOrigin
  let workflow
  let conversationId
  let captureItems = []
  const collectionMemberResponses = []
  let bootstrapInProgress = false
  let materializeReceiptCount = 0
  let warehouseMaterializedArtifactId
  let warehouseExistingImageArtifactId
  const permittedNodeOrigins = new Set()
  const originalFetch = globalThis.fetch.bind(globalThis)

  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : String(input)
    const url = new URL(address)
    const bootstrapOrigins = bootstrapInProgress
      ? process._getActiveHandles()
        .filter(handle => handle instanceof net.Server && handle.listening)
        .map(handle => handle.address())
        .filter(address => address && typeof address !== 'string' && address.address === '127.0.0.1')
        .map(address => `http://127.0.0.1:${address.port}`)
      : []
    if (url.protocol === 'http:' && (permittedNodeOrigins.has(url.origin) || bootstrapOrigins.includes(url.origin))) {
      report.localHttpOrigins ??= []
      if (!report.localHttpOrigins.includes(url.origin)) report.localHttpOrigins.push(url.origin)
      return originalFetch(input, init)
    }
    if (url.origin === 'http://127.0.0.1:1') {
      report.pinnedOllamaRejected ??= []
      report.pinnedOllamaRejected.push({ method: init?.method ?? (input instanceof Request ? input.method : 'GET'), path: url.pathname })
      throw new Error('The explicitly unavailable local Ollama port was blocked for this synthetic offline test.')
    }
    report.deniedNodeFetches.push({ method: init?.method ?? (input instanceof Request ? input.method : 'GET'), origin: url.origin, path: url.pathname })
    throw new Error('Native Gen2 Assembly browser blocked non-permitted HTTP; local model port 127.0.0.1:1 is intentionally unavailable.')
  }

  const coreCall = async (method, pathname, body) => {
    assert.ok(coreOrigin, 'Core origin must be captured from the isolated fixture facade')
    const response = await originalFetch(coreOrigin + pathname, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', cache: 'no-store',
    })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
    assert.equal(response.status, 200, `${method} ${pathname}: HTTP ${response.status}; ${JSON.stringify(payload)}`)
    assert.equal(payload.ok, true, `${method} ${pathname}: Core envelope ${JSON.stringify(payload)}`)
    return payload.value
  }

  const coreHttp = async (method, pathname, body) => {
    assert.ok(coreOrigin, 'Core origin must be captured from the isolated fixture facade')
    const response = await originalFetch(coreOrigin + pathname, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', cache: 'no-store',
    })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
    return { status: response.status, body: payload }
  }

  const appCoreCall = async (pathname) => {
    assert.ok(origin, 'isolated app origin must be ready')
    const response = await originalFetch(origin + '/api/lcos/core' + pathname, { headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store' })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
    assert.equal(response.status, 200, `GET ${pathname}: HTTP ${response.status}; ${JSON.stringify(payload)}`)
    assert.equal(payload.ok, true, `GET ${pathname}: Core envelope ${JSON.stringify(payload)}`)
    return payload.value
  }

  const appFacadeCall = async (pathname) => {
    const response = await originalFetch(origin + pathname, { headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store' })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
    assert.equal(response.status, 200, `GET ${pathname}: HTTP ${response.status}; ${JSON.stringify(payload)}`)
    assert.equal(payload.code, 0, `GET ${pathname}: facade envelope ${JSON.stringify(payload)}`)
    return payload.data
  }

  try {
    await mkdir(reportDir, { recursive: true })
    await mkdir(visualRoot, { recursive: true })
    assert.equal(await exists(runtimeRoot), false, `Refusing to reuse isolated runtime ${runtimeLabel}`)
    await mkdir(runtimeRoot, { recursive: true })

    uiPort = await reserveLoopbackPort()
    origin = `http://127.0.0.1:${uiPort}`
    report.origin = origin
    report.uiPort = uiPort

    const bootstrapDir = path.join(runtimeRoot, 'bootstrap')
    await mkdir(bootstrapDir, { recursive: true })
    const bootstrapFacadePath = path.join(bootstrapDir, 'surface-core-facade.mjs')
    await buildPilotEntry('lab/pilot/surface-core-facade.ts', bootstrapFacadePath)
    const facadeSources = JSON.parse(await (await import('node:fs/promises')).readFile(`${bootstrapFacadePath}.sources.json`, 'utf8'))
    report.sourceManifests = { bootstrap: facadeSources }
    const { startSurfaceCoreFacade } = await import(pathToFileURL(bootstrapFacadePath).href)

    bootstrapInProgress = true
    facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true })
    bootstrapInProgress = false
    coreOrigin = String(facade.core.origin)
    assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(coreOrigin), `Core must bind to loopback, got ${coreOrigin}`)
    permittedNodeOrigins.add(coreOrigin)
    report.bootstrap = { coreOrigin, projectId: facade.core.projectId, databasePath: facade.core.databasePath,
      realCore: true, fullIntegration: true }

    const ownerBundle = path.join(bootstrapDir, 'current-gen2-capture-owners.mjs')
    await buildPilotEntry('lab/pilot/current-gen2-capture-owners.ts', ownerBundle, 'node')
    const captureSources = JSON.parse(await (await import('node:fs/promises')).readFile(`${ownerBundle}.sources.json`, 'utf8'))
    report.sourceManifests.captureOwners = captureSources
    const { CaptureStagingService } = await import(pathToFileURL(ownerBundle).href)
    const staging = new CaptureStagingService(facade.core.repository, process.env.LCOS_CAPTURE_STAGING_ROOT)
    const captureTexts = [
      { title: '隔离收件 A · 可引用', text: `手工 Capture A · ${randomUUID()}\n这是一份通过原 Capture producer 暂存的合成文本。` },
      { title: '隔离收件 B · 保留原文', text: `手工 Capture B · ${randomUUID()}\n第二份合成文本，仅用于证明列表真实读取多条收件。` },
    ]
    captureItems = []
    for (const [index, capture] of captureTexts.entries()) {
      const enqueued = await staging.enqueue({ operationId: `native-gen2-assembly-${runtimeLabel}-${index + 1}`,
        kind: 'clipboard_text', payloadBytes: new TextEncoder().encode(capture.text), source: { title: capture.title }, suggestedProjects: [] })
      captureItems.push({ id: String(enqueued.id), title: capture.title, text: capture.text,
        payloadRef: String(enqueued.payloadRef), resolvedProjectId: enqueued.resolvedProjectId ?? null })
      assert.ok(/^blob:[a-f0-9]{64}$/i.test(String(enqueued.payloadRef)), 'Fixture captures must use real staged-content blob identities.')
      assert.equal(enqueued.resolvedProjectId, undefined, 'Fixture starts as unresolved Capture staging, not as a project Artifact.')
    }

    const repo = facade.core.repository
    const project = repo.getProject(projectId)
    assert.ok(project, `Synthetic project ${projectId} must be a real Core project`)
    const workspaces = facade.workspaces
    workflow = workspaces.find(row => row.preferredSurface === 'workflow')
    const contextScope = repo.getScopes(projectId).find(scope => scope.kind === 'context')
    assert.ok(workflow?.canvasId && workflow.scopeId, 'Select the exact original Core Workflow workspace/scope.')
    assert.ok(contextScope?.id, 'Select an existing canonical Context scope for the manual imported transcript.')
    report.fixtureWrites.push({ producer: 'original CaptureStagingService.enqueue', count: captureItems.length,
      ids: captureItems.map(row => row.id), projectId: null, modelExecution: false })

    const projectPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}`
    const callFacade = async (method, pathname, body) => facade.handle({ method, pathname,
      url: new URL(pathname, origin), body })
    const receiver = await callFacade('POST', `${projectPath}/connected-conversations`, {
      action: 'connect', provider: 'codex', executorId: 'synthetic-test-executor',
      conversationRef: `manual-import-${runtimeLabel}`, label: `合成对话引用 · ${runtimeLabel} · 未执行`,
    })
    assert.equal(receiver.status, 201, JSON.stringify(receiver.body))
    assert.equal(receiver.body.ok, true)
    conversationId = String(receiver.body.value.id)
    const imported = await callFacade('POST', `${projectPath}/conversations/import-manual`, {
      title: `手工导入历史 · ${runtimeLabel} · 非实时执行`, scopeId: String(contextScope.id),
      entries: [
        { role: 'user', contentText: '这段是明确标记的人工合成会话历史，不是当前 Codex 会话。' },
        { role: 'assistant', contentText: '由隔离 GUI 测试手工导入；未启动模型、Provider 或外部执行器。' },
      ],
    })
    assert.equal(imported.status, 201, JSON.stringify(imported.body))
    assert.equal(imported.body.ok, true)
    const linked = await callFacade('POST', `${projectPath}/connected-conversations/${encodeURIComponent(conversationId)}/link-session`, {
      conversationSessionId: imported.body.value.session.id,
    })
    assert.equal(linked.status, 200, JSON.stringify(linked.body))
    assert.equal(linked.body.ok, true)
    const providerStatus = await coreCall('GET', '/runtime/providers')
    assert.ok(providerStatus.every(provider => provider.availability === 'offline'), 'No provider may be represented as online in this synthetic run.')
    report.fixtureWrites.push({ producer: 'Core import-manual + ConnectedConversation connect/link-session',
      conversationId, conversationSessionId: imported.body.value.session.id, entries: 2,
      explicitManualSynthetic: true, providerExecution: false })

    const reconciled = await callFacade('POST', `/api/lcos/canvases/${encodeURIComponent(workflow.canvasId)}/conversations:reconcile`, {
      connectedConversationId: conversationId,
    })
    assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body))
    assert.equal(reconciled.body.code, 0, JSON.stringify(reconciled.body))
    assert.equal(reconciled.body.data.provider_execution_started, false)
    assert.equal(reconciled.body.data.bindings.length, 1)
    const agentBinding = reconciled.body.data.bindings[0]
    assert.equal(agentBinding.entityId, conversationId)
    assert.equal(agentBinding.entityType, 'conversation')
    report.fixtureWrites.push({ producer: 'original Gen2Host conversation projection + nodeProjector.projectBatch',
      canvasId: workflow.canvasId, binding: agentBinding, providerExecution: false })

    const runtimeItemsBefore = await coreCall('GET', '/runtime/capture-space')
    const captureBaseline = captureItems.map(item => runtimeItemsBefore.items.find(row => row.id === item.id))
    assert.ok(captureBaseline.every(item => item && item.resolvedProjectId === undefined), 'Both selected fixture captures must still be raw unresolved Capture entries.')
    const projectGraphBefore = await coreCall('GET', `${projectPath.slice('/api/lcos/core'.length)}/graph`)
    const collectionTextMember = projectGraphBefore.artifacts.map(artifact => {
      const revision = projectGraphBefore.artifactRevisions.find(row => String(row.id) === String(artifact.currentRevisionId)
        && String(row.artifactId) === String(artifact.id))
      const file = revision === undefined ? undefined : projectGraphBefore.fileRecords.find(row => String(row.id) === String(revision.fileRecordId))
      const mime = String(file?.mimeType ?? '').split(';')[0].trim().toLowerCase()
      return { artifact, revision, file, mime }
    }).find(row => row.revision !== undefined && row.file !== undefined
      && ['text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/yaml', 'application/xml', 'text/html'].includes(row.mime))
    assert.ok(collectionTextMember, 'The manual Collection fixture must use one pre-existing Core text Artifact with an exact current Revision/FileRecord.')
    const collectionTitle = `手工合成集合 · ${runtimeLabel}`
    const collectionMemberRef = { type: 'artifact', id: String(collectionTextMember.artifact.id) }
    const coreProjectPath = projectPath.slice('/api/lcos/core'.length)
    const collectionCreated = await coreHttp('POST', `${coreProjectPath}/collections`, {
      title: collectionTitle, members: [collectionMemberRef],
    })
    assert.equal(collectionCreated.status, 201, JSON.stringify(collectionCreated.body))
    assert.equal(collectionCreated.body.ok, true)
    const syntheticCollection = collectionCreated.body.value
    assert.ok(syntheticCollection?.id && syntheticCollection.projectId === projectId)
    const collectionId = String(syntheticCollection.id)
    const collectionMembersPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`
    assert.deepEqual(collectionCreated.body.meta?.members, [collectionMemberRef],
      'The original Core Collections API must acknowledge the exact manual fixture member at creation.')
    const collectionMembersRead = await coreHttp('GET', `${coreProjectPath}/collections/${encodeURIComponent(syntheticCollection.id)}/members`)
    assert.equal(collectionMembersRead.status, 200, JSON.stringify(collectionMembersRead.body))
    assert.equal(collectionMembersRead.body.ok, true)
    assert.equal(collectionMembersRead.body.value.collection.id, syntheticCollection.id)
    assert.equal(collectionMembersRead.body.value.collection.projectId, projectId)
    assert.equal(collectionMembersRead.body.value.members.length, 1)
    assert.deepEqual(collectionMembersRead.body.value.members[0].memberRef, collectionMemberRef)
    report.fixtureWrites.push({ producer: 'Local Core canonical Collections API', projectId,
      collectionId: String(syntheticCollection.id), title: collectionTitle,
      members: collectionMembersRead.body.value.members.map(row => row.memberRef),
      sourceArtifact: { artifactId: String(collectionTextMember.artifact.id), revisionId: String(collectionTextMember.revision.id),
        fileRecordId: String(collectionTextMember.file.id), mimeType: collectionTextMember.mime },
      explicitlyManualSynthetic: true, modelExecution: false })
    const projectRunsBefore = await coreCall('GET', `${projectPath.slice('/api/lcos/core'.length)}/runs`)
    const canvasBeforeResponse = await callFacade('GET', `/api/canvas/v1/canvases/${encodeURIComponent(workflow.canvasId)}`)
    assert.equal(canvasBeforeResponse.status, 200, JSON.stringify(canvasBeforeResponse.body))
    const canvasBefore = canvasBeforeResponse.body.data
    assert.equal(canvasBefore.id, workflow.canvasId)
    assert.equal(canvasBefore.nodes.filter(node => node.type === 'lcos-conversation').length, 1)
    const beforeImageNodes = canvasBefore.nodes.filter(node => node.type === 'image').map(node => node.id)
    report.before = { canvasId: workflow.canvasId, canvasNodeCount: canvasBefore.nodes.length,
      conversationNodes: canvasBefore.nodes.filter(node => node.type === 'lcos-conversation').map(node => node.id),
      imageNodeIds: beforeImageNodes, graphArtifactCount: projectGraphBefore.artifacts?.length,
      nodeSnapshots: canvasBefore.nodes.map(node => ({ id: node.id, type: node.type, position: node.position,
        measured: node.measured, reference: node.data?.lcos_ref ?? node.data?.lcos_conversation_ref ?? null,
        revisionId: node.lcos_revision_id ?? null })),
      runs: projectRunsBefore.length, captureIds: captureItems.map(row => row.id) }

    await facade.close()
    facade = undefined
    bootstrapInProgress = false
    permittedNodeOrigins.delete(coreOrigin)
    report.bootstrapFacadeClosedBeforeBrowser = true
    permittedNodeOrigins.add(origin)

    launcher = spawn(process.execPath, [path.join(root, 'scripts/start-full-integration.mjs'),
      `--runtime-label=${runtimeLabel}`, `--port=${uiPort}`], {
      cwd: root,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        LCOS_RECOVERY_TRANSPORT: 'none', LCOS_CAPTURE_STAGING_ROOT: path.join(runtimeRoot, 'capture'),
        LCOS_OCR_RUNTIME_DIR: path.join(runtimeRoot, 'ocr'), LCOS_OLLAMA_URL: 'http://127.0.0.1:1' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    launcher.stdout.setEncoding('utf8').on('data', chunk => { launcherStdout = (launcherStdout + chunk).slice(-16000) })
    launcher.stderr.setEncoding('utf8').on('data', chunk => { launcherStderr = (launcherStderr + chunk).slice(-16000) })
    launcher.once('close', (code, signal) => { launcherState.closed = { code, signal } })
    const launcherScript = path.join(root, 'scripts/start-full-integration.mjs')
    const launcherCommandLine = await waitForCommandLine(launcher.pid,
      line => matchesProcessIdentity(line, launcherScript, runtimeLabel, uiPort), launcherState)
    report.launcher = { runtimeLabel, launcherPid: launcher.pid, launcherCommandLine }
    const health = await waitForHealth(origin, launcherState, () => launcherStdout + launcherStderr)
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

    const nativeUiManifestPath = path.join(runtimeRoot, 'native-ui', 'agent-ui.js.sources.json')
    report.sourceManifests.nativeUi = JSON.parse(await (await import('node:fs/promises')).readFile(nativeUiManifestPath, 'utf8'))
    const typeOnlyDropResources = currentGen2Resources
      .filter(resource => resource.resourcePath === 'huabu/apps/web/src/lcos/drop/dropTypes.ts')
    assert.equal(typeOnlyDropResources.length, 1, 'The current catalog retains the donor Drop type source.')
    const expectedCurrentUiResources = currentGen2Resources
      .filter(resource => resource.resourcePath.startsWith('huabu/apps/web/src/lcos/')
        && resource.resourcePath !== typeOnlyDropResources[0].resourcePath)
      .map(resource => resource.resourcePath)
    const expectedCurrentBundleResources = currentGen2Resources
      .filter(resource => resource.resourcePath.startsWith('huabu/apps/web/src/lcos/')
        && resource.resourcePath !== typeOnlyDropResources[0].resourcePath
        || resource.resourcePath.startsWith('packages/contracts/src/')
        || resource.resourcePath === 'apps/web-gen2/src/spatial/worksiteProjectionInput.ts'
        || resource.resourcePath === 'huabu/apps/web/src/store/canvasCollapsedFrames.ts'
        || resource.resourcePath === 'apps/web-gen2/src/spatial/reconciliationRunner.ts')
      .map(resource => resource.resourcePath)
    const expectedBundleSet = new Set(expectedCurrentBundleResources)
    assert.equal(expectedCurrentUiResources.length, 36,
      'All 36 current Gen2 UI runtime owners in the selected catalog remain part of this native entry.')
    const originalAssemblyUiResources = [
      'huabu/apps/web/src/lcos/professional/AssemblyBody.tsx',
      'huabu/apps/web/src/lcos/professional/assemblyArtifactMedia.ts',
      'huabu/apps/web/src/lcos/professional/AssemblySourceMedia.tsx',
      'huabu/apps/web/src/lcos/professional/prepareAssemblyReferences.ts',
      'huabu/apps/web/src/lcos/ui/professional/AssemblyMasonryView.tsx',
      'huabu/apps/web/src/lcos/ui/professional/professional-assembly.css',
      'huabu/apps/web/src/lcos/ui/professional/tapnow-library.css',
    ]
    assert.equal(expectedCurrentBundleResources.length, 42,
      'The runtime closure includes 36 current Gen2 UI owners, three contracts, two worksite owners and original collapse preferences.')
    for (const required of originalAssemblyUiResources) {
      assert.ok(expectedCurrentUiResources.includes(required), `The selected source catalogue dropped required Assembly owner ${required}.`)
    }
    const currentManifest = report.sourceManifests.nativeUi
    assert.equal(currentManifest.currentRoot, currentGen2Root,
      'The GUI build must identify the current Gen2 source root, not only the copied LCOS tree.')
    assert.equal(currentManifest.resources.length, expectedCurrentBundleResources.length,
      'Actual native bundle provenance must cover the complete UI/contract/worksite runtime closure, excluding pure type-only sources and backend-only planners.')
    for (const resourcePath of expectedCurrentBundleResources) {
      const resource = currentManifest.resources.find(row => row.resourcePath === resourcePath)
      assert.ok(resource, `Actual native UI build did not load current catalog runtime source ${resourcePath}.`)
      assert.equal(resource.readOnly, true)
      assert.equal(path.resolve(resource.sourcePath), path.resolve(currentGen2Root, resourcePath))
    }
    assert.equal(currentManifest.resources.some(resource => resource.resourcePath === typeOnlyDropResources[0].resourcePath), false,
      'The pure-type Drop source is verified in the selected catalog but is not counted as a JavaScript runtime bundle input.')
    for (const resource of currentManifest.resources) {
      assert.ok(expectedBundleSet.has(resource.resourcePath),
        `Native UI build loaded a source outside the selected runtime closure: ${resource.resourcePath}.`)
      assert.equal(resource.readOnly, true)
      assert.equal(path.resolve(resource.sourcePath), path.resolve(currentGen2Root, resource.resourcePath))
    }
    report.adoptedAssemblySourceProof = {
      currentRoot: currentManifest.currentRoot,
      loadedUiResources: currentManifest.resources.filter(resource => resource.resourcePath.startsWith('huabu/apps/web/src/lcos/'))
        .map(resource => resource.resourcePath),
      loadedContractResources: currentManifest.resources.filter(resource => resource.resourcePath.startsWith('packages/contracts/src/'))
        .map(resource => resource.resourcePath),
      expectedCatalogUiResources: expectedCurrentUiResources,
      expectedRuntimeBundleResources: expectedCurrentBundleResources,
      selectedCatalogResourceCount: currentGen2Resources.length,
      typeOnlyCatalogResourcesExcludedFromRuntimeCount: typeOnlyDropResources.map(resource => resource.resourcePath),
      assemblyBodySourcePath: currentManifest.resources.find(row => row.resourcePath === 'huabu/apps/web/src/lcos/professional/AssemblyBody.tsx').sourcePath,
      actualRuntimeBundleResourceCount: currentManifest.resources.length,
    }
    permittedNodeOrigins.add(origin)

    const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: report.viewport, locale: 'zh-CN', serviceWorkers: 'block' })
    let allowCaptureMaterialize = false
    let captureMaterializeRequestCount = 0
    const expectedWarehousePath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}/warehouse`
    await context.route('**/*', async route => {
      const request = route.request()
      const address = new URL(request.url())
      if (['data:', 'blob:'].includes(address.protocol)) return route.continue()
      if (address.origin !== origin) {
        report.blockedWrites.push({ method: request.method(), origin: address.origin, path: address.pathname, reason: 'external HTTP denied' })
        return route.abort('blockedbyclient')
      }
      if (request.method() === 'GET' && address.pathname === expectedWarehousePath) {
        const requestAt = new Date().toISOString()
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
        const warehouse = payload?.ok === true ? payload.value : undefined
        const items = Array.isArray(warehouse?.items) ? warehouse.items : []
        const target = warehouseMaterializedArtifactId === undefined ? undefined
          : items.find(item => String(item.entityRef?.id) === warehouseMaterializedArtifactId)
        const existingImage = warehouseExistingImageArtifactId === undefined ? undefined
          : items.find(item => String(item.entityRef?.id) === warehouseExistingImageArtifactId)
        report.warehouseReads.push({
          requestedAt: requestAt, responseAt: new Date().toISOString(),
          query: Object.fromEntries(address.searchParams.entries()), status: response.status(),
          itemCount: items.length, totalApprox: warehouse?.totalApprox ?? null,
          materializedArtifactId: warehouseMaterializedArtifactId ?? null,
          containsMaterializedArtifact: warehouseMaterializedArtifactId === undefined ? null : target !== undefined,
          materializedItem: target ? { kind: target.kind, entityRef: target.entityRef, title: target.title,
            presentedRevisionId: target.presentedRevisionId, visualFamily: target.visualFamily } : null,
          existingImageArtifactId: warehouseExistingImageArtifactId ?? null,
          existingImageItem: existingImage ? { kind: existingImage.kind, entityRef: existingImage.entityRef,
            title: existingImage.title, presentedRevisionId: existingImage.presentedRevisionId,
            visualFamily: existingImage.visualFamily, mimeType: existingImage.mimeType } : null,
        })
        return route.fulfill({ response, body: text })
      }
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue()

      if (request.method() === 'POST' && address.pathname === '/api/events') {
        let event
        try { event = request.postDataJSON() } catch { event = undefined }
        const permittedKinds = new Set(['diagnostics-installed', 'remote-fetch-attempt', 'remote-fetch-blocked',
          'http-failed', 'fetch-failed', 'csp-blocked', 'action-not-connected', 'request-rejected'])
        if (event?.source !== 'renderer' || typeof event.kind !== 'string' || !permittedKinds.has(event.kind)) {
          report.unexpectedBlockedWrites.push({ method: request.method(), path: address.pathname,
            reason: 'only known renderer diagnostic event kinds are allowed in this isolated runtime' })
          report.blockedWrites.push({ method: request.method(), path: address.pathname, reason: 'unexpected diagnostic event' })
          return route.abort('blockedbyclient')
        }
        const response = await route.fetch()
        report.diagnosticTelemetry.push({ kind: event.kind, status: response.status() })
        return route.fulfill({ response })
      }

      const executionSyncPath = `/api/lcos/canvases/${encodeURIComponent(workflow.canvasId)}/execution:reconcile`
      if (request.method() === 'POST' && address.pathname === executionSyncPath) {
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        if (body === undefined || !isEmptyRecord(body)) {
          report.unexpectedBlockedWrites.push({ method: request.method(), path: address.pathname,
            body, reason: 'only the original no-override execution projection reconcile is in this scenario' })
          report.blockedWrites.push({ method: request.method(), path: address.pathname,
            body, reason: 'execution reconcile must be empty and target this exact Workflow' })
          return route.abort('blockedbyclient')
        }
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
        report.executionProjectionSyncs.push({ status: response.status(), receipt: payload })
        return route.fulfill({ response, body: text })
      }

      const spatialBatchMatch = /^\/api\/canvas\/v1\/canvases\/([^/]+)\/nodes:batchActions$/.exec(address.pathname)
      if (request.method() === 'POST' && spatialBatchMatch && decodeURIComponent(spatialBatchMatch[1]) === workflow.canvasId) {
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        const updates = body?.actions?.length === 1 && body.actions[0]?.action === 'update'
          ? body.actions[0]?.updates : undefined
        const beforeById = new Map(canvasBefore.nodes.map(node => [String(node.id), node]))
        const expectedRevisions = body?.lcos_expected_revisions
        const revisionMapSafe = expectedRevisions === undefined || (expectedRevisions !== null
          && typeof expectedRevisions === 'object' && !Array.isArray(expectedRevisions)
          && Object.entries(expectedRevisions).every(([nodeId, revisionId]) => {
            const before = beforeById.get(nodeId)
            return before !== undefined && typeof revisionId === 'string' && before.lcos_revision_id === revisionId
          }))
        const safeInitialProjection = body?.canvas_id === workflow.canvasId && Array.isArray(updates) && updates.length > 0
          && Object.keys(body ?? {}).every(key => ['canvas_id', 'actions', 'created_by_role', 'lcos_expected_revisions'].includes(key))
          && (body.created_by_role === undefined || body.created_by_role === 'user') && revisionMapSafe
          && updates.every(update => {
            const before = beforeById.get(String(update?.id ?? ''))
            const measured = update?.measured
            const allowedKeys = new Set(['id', 'type', 'data', 'position', 'measured'])
            return before !== undefined && Object.keys(update ?? {}).every(key => allowedKeys.has(key))
              && (update?.type === undefined || update.type === before.type)
              && (update?.data === undefined || stableJson(update.data) === stableJson(before.data))
              && (update?.position === undefined || stableJson(update.position) === stableJson(before.position))
              && measured !== undefined && Number.isFinite(measured.width) && Number.isFinite(measured.height)
              && measured.width > 0 && measured.height > 0 && measured.width <= 4096 && measured.height <= 4096
          })
        if (!safeInitialProjection) {
          report.unexpectedBlockedWrites.push({ method: request.method(), path: address.pathname,
            body, reason: 'native spatial save changed identity/data/position or exceeded bounded measured geometry' })
          report.blockedWrites.push({ method: request.method(), path: address.pathname,
            reason: 'only exact existing-node measured geometry syncs are allowed' })
          return route.abort('blockedbyclient')
        }
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
        report.initialSpatialSynchronizations.push({ status: response.status(), nodeIds: updates.map(update => String(update.id)),
          measured: updates.map(update => ({ id: String(update.id), ...update.measured })), dataAndPositionUnchanged: true,
          response: payload })
        return route.fulfill({ response, body: text })
      }

      if (request.method() === 'POST' && address.pathname === '/api/agent-gateway/v1/conversations/suggestions/dynamic') {
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        const expected = body?.canvas_id === workflow.canvasId && body?.count === 5 && body?.mode === 'mixed'
        if (!expected) {
          report.unexpectedBlockedWrites.push({ method: request.method(), path: address.pathname,
            reason: 'dynamic-suggestion request did not match the known read-only fixture request shape' })
          report.blockedWrites.push({ method: request.method(), path: address.pathname, body,
            reason: 'unexpected dynamic-suggestion request shape' })
          return route.abort('blockedbyclient')
        }
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
        report.knownBlockedUnsupported ??= []
        report.knownBlockedUnsupported.push({ method: request.method(), path: address.pathname,
          status: response.status(), body, response: payload })
        if (response.status() !== 501) report.unexpectedBlockedWrites.push({ method: request.method(), path: address.pathname,
          status: response.status(), reason: 'The isolated fixture must return its real unsupported status and never synthesize suggestions.' })
        return route.fulfill({ response, body: text })
      }

      const expectedCaptureMaterializePath = '/api/lcos/core/runtime/capture-space/materialize'
      if (request.method() === 'POST' && address.pathname === expectedCaptureMaterializePath && allowCaptureMaterialize) {
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        const exact = body !== null && typeof body === 'object' && !Array.isArray(body)
          && body.projectId === projectId && Array.isArray(body.captureIds)
          && body.captureIds.length === 1 && body.captureIds[0] === captureItems[0]?.id
          && Object.keys(body).sort().join(',') === 'captureIds,projectId'
        if (!exact || captureMaterializeRequestCount > 0) {
          report.blockedWrites.push({ method: request.method(), path: address.pathname, body,
            reason: !exact ? 'Capture materialize did not match the exact isolated project and first fixture Capture' : 'duplicate materialization denied' })
          report.unexpectedBlockedWrites.push({ method: request.method(), path: address.pathname,
            reason: !exact ? 'Capture materialize body escaped the exact fixture scope' : 'duplicate materialization attempted' })
          return route.abort('blockedbyclient')
        }
        captureMaterializeRequestCount += 1
        report.browserWrites.push({ method: request.method(), path: address.pathname, body,
          targetReason: 'original Composer → Assembly collectReferences → CoreCaptureClient.materialize',
          requestAt: new Date().toISOString(), status: 'pending' })
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 700) } }
        const write = report.browserWrites.at(-1)
        write.status = response.status()
        write.responseAt = new Date().toISOString()
        write.response = payload
        const receiptItems = payload?.ok === true && payload.value?.projectId === projectId
          && Array.isArray(payload.value?.items) ? payload.value.items : []
        const exactReceipt = receiptItems.length === 1 && receiptItems[0]?.captureId === captureItems[0]?.id
          && typeof receiptItems[0]?.artifactId === 'string' && receiptItems[0].artifactId.length > 0
          && typeof receiptItems[0]?.viewId === 'string' && receiptItems[0].viewId.length > 0
          && typeof receiptItems[0]?.revisionId === 'string' && receiptItems[0].revisionId.length > 0
          && receiptItems[0]?.reused !== true
        if (response.status() === 201 && exactReceipt) {
          materializeReceiptCount += 1
          report.materializeReceiptCount = materializeReceiptCount
          write.materializeReceiptCount = 1
          warehouseMaterializedArtifactId = String(receiptItems[0].artifactId)
        } else {
          report.unexpectedBlockedWrites.push({ method: request.method(), path: address.pathname,
            status: response.status(), response: payload,
            reason: 'The original materializer did not return one exact newly materialized Capture receipt.' })
        }
        return route.fulfill({ response, body: text })
      }

      report.blockedWrites.push({ method: request.method(), origin: address.origin, path: address.pathname,
        body: request.postData()?.slice(0, 1000), reason: 'no other browser writes are in scope' })
      report.unexpectedBlockedWrites.push({ method: request.method(), origin: address.origin, path: address.pathname,
        reason: 'no other browser writes are in scope' })
      return route.abort('blockedbyclient')
    })
    if (context.routeWebSocket) await context.routeWebSocket('**/*', socket => {
      report.blockedWebSockets.push({ url: socket.url(), reason: 'WebSocket is outside the offline fixture scope' })
      socket.close({ code: 1008, reason: 'isolated offline test' })
    })
    page = await context.newPage()
    page.on('pageerror', error => report.pageErrors.push(error.message))
    page.on('console', message => {
      if (message.type() !== 'error') return
      report.consoleErrors.push(message.text().replace(/https?:\/\/[^\s"'<>]+/g, raw => {
        try { const url = new URL(raw); url.search = url.search ? '?[redacted]' : ''; return url.href }
        catch { return '[address]' }
      }).slice(0, 1600))
    })
    page.on('requestfailed', request => report.requestFailures.push({ method: request.method(),
      path: new URL(request.url()).pathname, error: request.failure()?.errorText ?? 'unknown' }))
    page.on('response', response => {
      if (response.request().method() === 'GET' && new URL(response.url()).pathname === collectionMembersPath) {
        collectionMemberResponses.push(response)
      }
      if (response.status() >= 400) report.apiFailures.push({ method: response.request().method(),
        path: new URL(response.url()).pathname, status: response.status() })
    })

    const canvasPath = `/canvas/${encodeURIComponent(workflow.canvasId)}`
    await page.goto(origin + canvasPath, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, null, { timeout: 30000 })
    assert.equal(await page.evaluate(() => window.__LCOS_NODE_LAB__?.projectId), projectId,
      'The original NativeNodeBridge host must carry this isolated server Core project identity, not infer it from a node.')
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 30000 })
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 })
    assert.equal(await page.locator('.react-flow').count(), 1, 'The original TapNow page must retain one ReactFlow.')
    const actualTitle = await page.title()
    const rawCanvasName = String(canvasBefore.name ?? '')
    await page.waitForFunction(({ name }) => {
      const title = document.title
      return name !== '' && title.includes(name) && title.includes('TapNow')
    }, { name: rawCanvasName }, { timeout: 15000 })
    report.identity = { url: page.url(), settledTitle: await page.title(), rawInitialTitle: actualTitle,
      canvasName: rawCanvasName, canvasId: workflow.canvasId, reactFlowCount: await page.locator('.react-flow').count() }
    const closeAgent = page.getByRole('button', { name: '关闭 Agent 面板', exact: true })
    if (await closeAgent.isVisible()) await closeAgent.click()

    const glyth = page.locator('[data-lcos-node-kind="conversation"] button[aria-haspopup="dialog"]')
    await glyth.first().waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await glyth.count(), 1, 'Only the one manually confirmed conversation should be projected as a Glyth.')
    await glyth.click()
    const workView = page.locator('[data-lcos-conversation-work-view]')
    await workView.waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await page.locator('.react-flow').count(), 1)
    report.cases.push('one original ReactFlow opens the real Conversation Work View from the Core-confirmed synthetic Glyth')
    report.workView = (await workView.innerText()).slice(0, 4000)
    await screenshot('workview')

    const openDelegate = page.locator('[data-lcos-open-work-composer]')
    await openDelegate.waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await openDelegate.isDisabled(), false,
      'The Core-confirmed synthetic Conversation may expose its original Composer; no submit or provider invocation follows.')
    await openDelegate.click()
    const composer = page.locator('[data-lcos-composer-reference-surface]')
    await composer.waitFor({ state: 'visible', timeout: 12000 })
    assert.equal(await page.locator('[data-lcos-composer-input]').count(), 1)
    assert.equal(await page.locator('[data-lcos-composer-input]').inputValue(), '')
    report.cases.push('original WorkView delegate entry opens the original unsent Composer; no submission is invoked')
    await screenshot('composer-empty')

    await page.getByRole('button', { name: '从装配区找材料', exact: true }).click()
    let assembly = page.locator('[data-lcos-assembly]')
    await assembly.waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await page.locator('.react-flow').count(), 1)
    assert.equal(await assembly.getAttribute('data-reference-journey'), 'true')
    assert.equal(await assembly.getAttribute('data-lcos-assembly-target'), 'conversation')
    assert.equal(await assembly.getAttribute('data-lcos-assembly-target-id'), conversationId)
    report.cases.push('original Composer “从装配区找材料” opens the adopted Assembly collectReferences path for the same receiver')
    await assembly.locator('[data-lcos-assembly-source-tab="capture"]').click()
    const captureCards = assembly.locator('[data-lcos-assembly-capture-item]')
    await captureCards.first().waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await captureCards.count(), 2, 'The original Capture source tab must show both seeded text captures.')
    const rawCaptureCard = assembly.locator(`[data-lcos-assembly-capture-item="${captureItems[0].id}"]`)
    await rawCaptureCard.waitFor({ state: 'visible' })
    assert.equal(await rawCaptureCard.innerText().then(text => text.includes(captureItems[0].title)), true)
    const rawCaptureBefore = (await appCoreCall('/runtime/capture-space')).items.find(item => item.id === captureItems[0].id)
    assert.equal(rawCaptureBefore?.resolvedProjectId, undefined)
    report.cases.push('original Assembly Capture tab reads exact unresolved Capture IDs and retains two staged entries')
    await screenshot('capture-source')

    const addCaptureReferenceAndWait = async (captureCard = rawCaptureCard) => {
      const add = captureCard.locator('[data-lcos-assembly-add]')
      assert.equal(await add.count(), 1, 'Use the adopted original Capture-card “加入引用” action, not a synthetic control.')
      assert.equal((await add.innerText()).trim(), '加入引用')
      const beforeHover = await add.evaluate(element => {
        const rect = element.getBoundingClientRect()
        return { text: element.innerText, disabled: element.disabled,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          display: getComputedStyle(element).display, visibility: getComputedStyle(element).visibility,
          pointerEvents: getComputedStyle(element).pointerEvents, owner: element.closest('[data-lcos-assembly-capture-item]')?.getAttribute('data-lcos-assembly-capture-item') }
      })
      await captureCard.hover({ timeout: 10000 })
      const afterHover = await add.evaluate(element => {
        const rect = element.getBoundingClientRect()
        return { disabled: element.disabled, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          pointerEvents: getComputedStyle(element).pointerEvents,
          visible: Boolean(element.getClientRects().length && getComputedStyle(element).visibility === 'visible') }
      })
      report.captureCollectControls = { beforeHover, afterHover }
      assert.equal(afterHover.visible, true)
      assert.equal(afterHover.disabled, false)
      assert.notEqual(afterHover.pointerEvents, 'none',
        'The real Capture card hover must reveal an actually pointer-receptive collect action before the click.')
      await screenshot('capture-reference-action-hovered')
      allowCaptureMaterialize = true
      const responsePromise = page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/lcos/core/runtime/capture-space/materialize', { timeout: 15000 })
        .then(response => ({ response }), error => ({ error }))
      report.captureMaterializeActionAt = new Date().toISOString()
      await add.click({ timeout: 10000 })
      const waited = await responsePromise
      if (waited.error) throw waited.error
      const response = waited.response
      allowCaptureMaterialize = false
      const payload = await response.json()
      const write = report.browserWrites.at(-1)
      assert.ok(write, 'The one exact Core Capture materialize request must be captured by the strict route allowlist.')
      assert.equal(write.path, '/api/lcos/core/runtime/capture-space/materialize')
      assert.equal(write.status, response.status())
      report.captureMaterializeResponses ??= []
      report.captureMaterializeResponses.push({ status: response.status(), payload,
        requestAt: write.requestAt, responseAt: write.responseAt })
      return payload
    }

    const beforeCaptureMaterializeWrites = report.browserWrites.length
    const warehouseReadCountBeforeMaterialize = report.warehouseReads.length
    const automaticWarehouseRefreshPromise = page.waitForResponse(response => response.request().method() === 'GET'
      && new URL(response.url()).pathname === expectedWarehousePath, { timeout: 15000 })
    const captureMaterializePayload = await addCaptureReferenceAndWait()
    assert.equal(report.browserWrites.length, beforeCaptureMaterializeWrites + 1)
    assert.equal(captureMaterializeRequestCount, 1, 'The original collect action may materialize this exact Capture once.')
    assert.equal(captureMaterializePayload.ok, true, `Core materialize response: ${JSON.stringify(captureMaterializePayload)}`)
    assert.equal(captureMaterializePayload.value.projectId, projectId)
    assert.equal(captureMaterializePayload.value.imported, 1)
    assert.equal(captureMaterializePayload.value.items.length, 1)
    const captureReceipt = captureMaterializePayload.value.items[0]
    assert.equal(captureReceipt.captureId, captureItems[0].id)
    assert.ok(captureReceipt.artifactId && captureReceipt.viewId && captureReceipt.revisionId)
    assert.equal(materializeReceiptCount, 1, 'Count only the exact Core materialization receipt captured from the original UI request.')

    const automaticWarehouseResponse = await automaticWarehouseRefreshPromise
    assert.equal(automaticWarehouseResponse.status(), 200,
      'After the original collect succeeds, the Assembly owner should issue a read-only Warehouse refresh; it must not retry materialization.')
    const automaticWarehouseRead = report.warehouseReads.slice(warehouseReadCountBeforeMaterialize)
      .find(read => Date.parse(read.requestedAt) > Date.parse(report.captureMaterializeResponses.at(-1).responseAt))
    assert.ok(automaticWarehouseRead, 'A canonical Warehouse GET must begin after the one successful Capture materialization response.')
    assert.equal(automaticWarehouseRead.status, 200)
    assert.equal(automaticWarehouseRead.containsMaterializedArtifact, true)
    const warehouseBaselineRead = report.warehouseReads[warehouseReadCountBeforeMaterialize - 1]
    assert.ok(warehouseBaselineRead, 'The earlier Warehouse query is retained for before/after comparison.')
    assert.equal(stableJson(automaticWarehouseRead.query), stableJson(warehouseBaselineRead.query),
      'The success refresh must preserve the original Warehouse query rather than changing filters to make the item appear.')
    assert.equal(automaticWarehouseRead.itemCount, warehouseBaselineRead.itemCount + 1,
      'In this isolated runtime exactly the one materialized Capture Artifact should increase Warehouse count by one.')
    report.warehouseAutomaticRefresh = { readCount: report.warehouseReads.length - warehouseReadCountBeforeMaterialize,
      baselineItemCount: warehouseBaselineRead.itemCount,
      requestedAt: automaticWarehouseRead.requestedAt, responseAt: automaticWarehouseRead.responseAt,
      query: automaticWarehouseRead.query, itemCount: automaticWarehouseRead.itemCount,
      containsMaterializedArtifact: automaticWarehouseRead.containsMaterializedArtifact,
      materializedItem: automaticWarehouseRead.materializedItem,
      startedAfterMaterializeResponse: Date.parse(automaticWarehouseRead.requestedAt)
        > Date.parse(report.captureMaterializeResponses.at(-1).responseAt) }

    const captureSnapshotAfter = await appCoreCall('/runtime/capture-space')
    const pendingCaptureAfter = captureSnapshotAfter.items.find(item => item.id === captureItems[0].id)

    const materializedArtifactId = String(captureReceipt.artifactId)
    warehouseMaterializedArtifactId = materializedArtifactId
    const materializedArtifactDetail = await appCoreCall(`/artifacts/${encodeURIComponent(materializedArtifactId)}`)
    const materializedArtifact = materializedArtifactDetail.artifact
    assert.ok(materializedArtifact)
    assert.equal(String(materializedArtifact.projectId), projectId)
    assert.equal(String(materializedArtifactDetail.currentRevisionId), String(captureReceipt.revisionId))
    const projectGraphAfter = await appCoreCall(`${projectPath.slice('/api/lcos/core'.length)}/graph`)
    const graphArtifact = projectGraphAfter.artifacts.find(item => String(item.id) === materializedArtifactId)
    const graphView = projectGraphAfter.artifactViews.find(item => String(item.id) === String(captureReceipt.viewId)
      && String(item.artifactId) === materializedArtifactId)
    const graphRevision = projectGraphAfter.artifactRevisions.find(item => String(item.id) === String(captureReceipt.revisionId)
      && String(item.artifactId) === materializedArtifactId)
    assert.ok(graphArtifact && graphView && graphRevision, 'Core graph must read back the exact materialized Artifact/View/Revision identity.')
    assert.equal(String(graphArtifact.projectId), projectId)
    const captureMaterialized = String(graphArtifact.id) === materializedArtifactId
      && String(graphView.id) === String(captureReceipt.viewId)
      && String(graphRevision.id) === String(captureReceipt.revisionId)
    assert.equal(captureMaterialized, true,
      'Derive materialization success only after the post-click canonical project graph read matches the exact UI receipt.')
    const originalArtifactIds = new Set(projectGraphBefore.artifacts.map(item => String(item.id)))
    const newlyRegisteredArtifacts = projectGraphAfter.artifacts.filter(item => !originalArtifactIds.has(String(item.id)))
    assert.deepEqual(newlyRegisteredArtifacts.map(item => String(item.id)), [materializedArtifactId],
      'Only the selected Capture should add one canonical project Artifact in this synthetic runtime.')
    const graphFile = projectGraphAfter.fileRecords.find(item => item.id === graphRevision.fileRecordId)
    assert.ok(graphFile && String(graphFile.projectId) === projectId)
    const fileResponse = await originalFetch(origin + `/api/lcos/core/projects/${encodeURIComponent(projectId)}/file-records/${encodeURIComponent(graphFile.id)}/content`, {
      headers: { Accept: '*/*' }, redirect: 'error', cache: 'no-store',
    })
    assert.equal(fileResponse.status, 200)
    const fileBytes = Buffer.from(await fileResponse.arrayBuffer())
    assert.deepEqual(fileBytes, Buffer.from(captureItems[0].text, 'utf8'))
    assert.equal(fileResponse.headers.get('content-type')?.split(';')[0], graphFile.mimeType)
    report.captureMaterialization = { captureId: captureItems[0].id, targetProjectId: projectId,
      artifactId: materializedArtifactId, artifactViewId: String(captureReceipt.viewId), revisionId: String(captureReceipt.revisionId),
      fileRecordId: graphFile.id, mimeType: graphFile.mimeType, byteLength: fileBytes.byteLength,
      exactUtf8Bytes: true, pendingCaptureListedAfter: pendingCaptureAfter !== undefined, materializeReceiptCount }
    report.captureMaterializationUi = true
    report.cases.push('original Composer→Assembly Capture “加入引用” invoked one exact Core materialize producer and read back the same Capture→Artifact/View/Revision/file bytes')

    const runsAfterCaptureMaterialize = await appCoreCall(`${projectPath.slice('/api/lcos/core'.length)}/runs`)
    assert.equal(runsAfterCaptureMaterialize.length, 0, 'This reference flow does not create or dispatch a Run.')
    const referenceCard = page.locator('[data-lcos-composer-ref]')
    await referenceCard.waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await referenceCard.count(), 1, 'The original composer draft should receive exactly one prepared Capture reference.')
    const referenceLabel = await referenceCard.locator('.lcos-composer-reference-label').innerText()
    assert.equal(referenceLabel, String(materializedArtifact.title))
    const draftReferenceKey = await referenceCard.getAttribute('data-reference-key')
    assert.ok(draftReferenceKey, 'The original Composer reference strip exposes its actual keyed reference.')
    assert.equal(draftReferenceKey, JSON.stringify(['artifact', materializedArtifactId, String(captureReceipt.revisionId), 'full']),
      'The original draft key must point at the exact Core Artifact and captured Revision, not merely a matching title.')
    assert.equal(await page.locator('[data-lcos-composer-input]').inputValue(), '',
      'Adding a Capture reference does not submit or invent prompt text.')
    report.composerReference = { artifactId: materializedArtifactId, artifactViewId: String(captureReceipt.viewId),
      revisionId: String(captureReceipt.revisionId), label: referenceLabel, draftReferenceKey,
      referenceCount: await referenceCard.count(), prompt: '', submitted: false }
    await screenshot('composer-capture-reference')
    report.cases.push('the original prepareAssemblyReferences helper attaches the exact saved Capture reference to the original unsent Composer draft')

    const existingImageNode = canvasBefore.nodes.find(node => node.type === 'image' && node.data?.lcos_ref?.artifactId)
    assert.ok(existingImageNode, 'Choose a real existing Workflow image Artifact/View already projected on the original Canvas.')
    const existingImageRef = existingImageNode.data.lcos_ref
    warehouseExistingImageArtifactId = String(existingImageRef.artifactId)
    const existingImageArtifact = projectGraphBefore.artifacts.find(row => String(row.id) === String(existingImageRef.artifactId))
    assert.ok(existingImageArtifact && String(existingImageArtifact.projectId) === projectId)
    report.projectMaterials = { existingImage: { nodeId: existingImageNode.id, artifactId: existingImageRef.artifactId,
      artifactViewId: existingImageRef.artifactViewId, revisionId: existingImageRef.revisionId, title: existingImageArtifact.title } }

    const projectTab = assembly.locator('[data-lcos-assembly-source-tab="project"]')
    const warehouseReadsBeforeTabSwitch = report.warehouseReads.length
    await projectTab.click()
    await page.waitForFunction(() => document.querySelector('[data-lcos-assembly-source-panel]')?.getAttribute('data-lcos-assembly-source-panel') === 'project')
    const materializedCard = assembly.locator(`[data-lcos-assembly-item="${materializedArtifactId}"]`)
    const targetCountBeforeManualRefresh = await materializedCard.count()
    const statusBeforeRefresh = await assembly.locator('.lcos-assembly-result-meta [role="status"]').innerText()
    const lastWarehouseReadBeforeRefresh = report.warehouseReads.at(-1) ?? null
    report.warehouseBeforeManualRefresh = { readCount: report.warehouseReads.length,
      readCountBeforeTabSwitch: warehouseReadsBeforeTabSwitch,
      tabSwitchIssuedNewWarehouseGet: report.warehouseReads.length > warehouseReadsBeforeTabSwitch,
      itemStatusText: statusBeforeRefresh, materializedArtifactCardCount: targetCountBeforeManualRefresh,
      automaticRefreshRead: report.warehouseAutomaticRefresh,
      latestRead: lastWarehouseReadBeforeRefresh,
      latestReadRequestStartedBeforeMaterialize: lastWarehouseReadBeforeRefresh !== null
        && report.captureMaterializeActionAt !== undefined
        && Date.parse(lastWarehouseReadBeforeRefresh.requestedAt) < Date.parse(report.captureMaterializeActionAt),
      latestReadResponseArrivedBeforeMaterialize: lastWarehouseReadBeforeRefresh !== null
        && report.captureMaterializeActionAt !== undefined
        && Date.parse(lastWarehouseReadBeforeRefresh.responseAt) < Date.parse(report.captureMaterializeActionAt) }
    assert.equal(report.warehouseAutomaticRefresh.containsMaterializedArtifact, true,
      'The post-materialize Warehouse GET must return the exact new Core Artifact before tab selection.')
    assert.equal(targetCountBeforeManualRefresh, 1,
      'Switching back to Project after success should render the automatically refreshed item without manual reload.')
    assert.equal(report.warehouseReads.length, warehouseReadsBeforeTabSwitch,
      'The Project tab switch should reuse the post-success canonical Warehouse read, not issue a duplicate request.')
    report.warehouseAutomaticRefreshResolvedMaterializedArtifact = true
    await screenshot('warehouse-after-automatic-refresh-before-manual')

    const refreshButton = assembly.getByRole('button', { name: '刷新当前来源', exact: true })
    await refreshButton.waitFor({ state: 'visible', timeout: 10000 })
    assert.equal(await refreshButton.isDisabled(), false)
    const warehouseRefreshResponsePromise = page.waitForResponse(response => response.request().method() === 'GET'
      && new URL(response.url()).pathname === expectedWarehousePath, { timeout: 15000 })
    await refreshButton.click()
    const warehouseRefreshResponse = await warehouseRefreshResponsePromise
    const warehouseRefreshEnvelope = await warehouseRefreshResponse.json()
    assert.equal(warehouseRefreshResponse.status(), 200)
    assert.equal(warehouseRefreshEnvelope.ok, true)
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-lcos-assembly] .lcos-assembly-result-meta [role="status"]')
      return Boolean(status?.textContent && !status.textContent.includes('正在读取材料'))
    }, null, { timeout: 15000 })
    const targetCountAfterRefresh = await materializedCard.count()
    const statusAfterRefresh = await assembly.locator('.lcos-assembly-result-meta [role="status"]').innerText()
    const warehouseRefreshRead = report.warehouseReads.at(-1)
    assert.ok(warehouseRefreshRead, 'The visible original refresh control must issue an observable canonical Warehouse GET.')
    assert.equal(warehouseRefreshRead.status, 200)
    const previousWarehouseRead = report.warehouseBeforeManualRefresh.latestRead
    report.warehouseAfterRefresh = { responseStatus: warehouseRefreshResponse.status(),
      responseItemCount: warehouseRefreshRead.itemCount, totalApprox: warehouseRefreshRead.totalApprox,
      query: warehouseRefreshRead.query, itemStatusText: statusAfterRefresh,
      materializedArtifactCardCount: targetCountAfterRefresh,
      containsMaterializedArtifact: warehouseRefreshRead.containsMaterializedArtifact,
      matchingMaterializedItem: warehouseRefreshRead.materializedItem,
      existingImageItem: warehouseRefreshRead.existingImageItem,
      sameQueryAsPriorWarehouseRead: previousWarehouseRead
        ? stableJson(previousWarehouseRead.query) === stableJson(warehouseRefreshRead.query) : false }
    report.warehouseRefreshResolvedMaterializedArtifact = warehouseRefreshRead.containsMaterializedArtifact === true
      && targetCountAfterRefresh === 1
    const warehouseImageItem = warehouseRefreshRead.existingImageItem
    const canvasImageView = projectGraphBefore.artifactViews.find(view => String(view.id) === String(existingImageRef.artifactViewId))
    const warehouseImageView = projectGraphBefore.artifactViews.find(view => String(view.id) === String(warehouseImageItem?.entityRef?.viewId))
    const imageArtifact = projectGraphBefore.artifacts.find(artifact => String(artifact.id) === String(existingImageRef.artifactId))
    const imageRevision = projectGraphBefore.artifactRevisions.find(revision => String(revision.id) === String(existingImageRef.revisionId)
      && String(revision.artifactId) === String(existingImageRef.artifactId))
    report.warehouseImageIdentity = {
      canvas: { artifactId: String(existingImageRef.artifactId), viewId: String(existingImageRef.artifactViewId), revisionId: String(existingImageRef.revisionId),
        graphViewFound: Boolean(canvasImageView), graphViewArtifactId: canvasImageView?.artifactId ?? null,
        graphViewRevisionId: canvasImageView?.revisionId ?? null },
      warehouse: { artifactId: String(warehouseImageItem?.entityRef?.id ?? ''), viewId: String(warehouseImageItem?.entityRef?.viewId ?? ''),
        revisionId: String(warehouseImageItem?.presentedRevisionId ?? ''), graphViewFound: Boolean(warehouseImageView),
        graphViewArtifactId: warehouseImageView?.artifactId ?? null, graphViewRevisionId: warehouseImageView?.revisionId ?? null },
      artifactFound: Boolean(imageArtifact), revisionFound: Boolean(imageRevision),
      distinctViewIds: String(existingImageRef.artifactViewId) !== String(warehouseImageItem?.entityRef?.viewId),
    }
    report.warehouseImageSameArtifactRevisionAsCanvas = String(warehouseImageItem?.entityRef?.id) === String(existingImageRef.artifactId)
      && String(warehouseImageItem?.presentedRevisionId) === String(existingImageRef.revisionId)
      && String(canvasImageView?.artifactId) === String(existingImageRef.artifactId)
      && String(canvasImageView?.revisionId) === String(existingImageRef.revisionId)
      && String(warehouseImageView?.artifactId) === String(existingImageRef.artifactId)
      && String(warehouseImageView?.revisionId) === String(existingImageRef.revisionId)
      && String(imageArtifact?.id) === String(existingImageRef.artifactId)
      && String(imageRevision?.id) === String(existingImageRef.revisionId)
    await screenshot('warehouse-after-manual-refresh')
    if (report.warehouseRefreshResolvedMaterializedArtifact) {
      assert.equal(await materializedCard.getAttribute('data-lcos-assembly-item-kind'), 'artifact')
      assert.equal(await materializedCard.getAttribute('data-lcos-assembly-item'), materializedArtifactId)
      report.warehouseDiagnosis = `The original collect success triggered a canonical Warehouse GET and the item appeared before tab selection; switching to Project caused no additional GET. The original visible refresh also returned the same item using the same query: ${report.warehouseAfterRefresh.sameQueryAsPriorWarehouseRead}. This rules out persistent project/scope/filter exclusion for this Artifact.`
      report.cases.push('original Capture collect success refreshed the canonical Warehouse; Project tab reused the updated item and the original manual refresh remained functional')
    } else {
      report.warehouseDiagnosis = 'The original refresh control issued the canonical project Warehouse GET, but its returned DTO/DOM still omitted the exact materialized Artifact; stale local state alone does not explain the remaining absence.'
      report.findings ??= []
      report.findings.push({ severity: 'unresolved', area: 'Assembly Project Warehouse', before: report.warehouseBeforeManualRefresh,
        after: report.warehouseAfterRefresh, expectedArtifactId: materializedArtifactId })
    }

    const collectionCard = assembly.locator(`[data-lcos-assembly-item="${collectionId}"]`)
    await collectionCard.waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await collectionCard.getAttribute('data-lcos-assembly-item-kind'), 'collection')
    assert.equal((await collectionCard.innerText()).includes(collectionTitle), true,
      'The Project Warehouse must expose the exact manually created canonical Collection card.')
    const collectionFace = collectionCard.locator(`[data-lcos-canonical-collection="${collectionId}"]`)
    await collectionFace.waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForFunction(({ id }) => {
      const face = document.querySelector(`[data-lcos-canonical-collection="${id}"]`)
      return face?.getAttribute('data-member-read-status') === 'ready'
    }, { id: collectionId }, { timeout: 15000 })
    const collectionMembersResponse = collectionMemberResponses.at(-1)
    assert.ok(collectionMembersResponse,
      'The original CollectionView must read its same-project Core members route, not merely render the Composer ref.')
    assert.equal(collectionMembersResponse.status(), 200)
    const collectionMembersEnvelope = await collectionMembersResponse.json()
    assert.equal(collectionMembersEnvelope.ok, true)
    const collectionMembersSnapshot = collectionMembersEnvelope.value
    assert.equal(collectionMembersSnapshot.collection.id, collectionId)
    assert.equal(collectionMembersSnapshot.collection.projectId, projectId)
    assert.equal(collectionMembersSnapshot.members.length, 1)
    assert.deepEqual(collectionMembersSnapshot.members[0].memberRef, collectionMemberRef)
    assert.equal(collectionMembersSnapshot.previews.length, 1)
    const collectionMemberPreview = collectionMembersSnapshot.previews[0]
    assert.equal(collectionMemberPreview.type, 'artifact')
    assert.equal(collectionMemberPreview.id, String(collectionTextMember.artifact.id))
    assert.equal(collectionMemberPreview.label, String(collectionTextMember.artifact.title))
    assert.equal(collectionMemberPreview.kind, 'text')
    assert.equal(collectionMemberPreview.availability, 'available')
    assert.equal(collectionMemberPreview.revisionId, String(collectionTextMember.revision.id))
    assert.equal(collectionMemberPreview.fileRecordId, String(collectionTextMember.file.id))
    assert.equal(collectionMemberPreview.mimeType, collectionTextMember.file.mimeType)
    assert.equal(collectionMemberPreview.byteSize, collectionTextMember.file.size)
    assert.equal(Object.hasOwn(collectionMemberPreview, 'content'), false,
      'Collection members readback is preview metadata; it must not return full Artifact text as model input.')
    assert.equal(Object.hasOwn(collectionMemberPreview, 'excerpt'), false,
      'The Assembly compact Collection member path does not deliver a body excerpt as the full source.')
    assert.equal(await collectionFace.getAttribute('data-member-read-status'), 'ready')
    assert.equal(await collectionFace.getAttribute('data-member-count'), '1')
    const collectionMemberCard = collectionFace.locator(`[data-lcos-member-preview="artifact:${collectionMemberPreview.id}"]`)
    await collectionMemberCard.waitFor({ state: 'visible', timeout: 10000 })
    assert.equal(await collectionMemberCard.getAttribute('data-member-revision'), String(collectionTextMember.revision.id))
    assert.equal(await collectionMemberCard.getAttribute('data-preview-kind'), 'text')
    assert.equal(await collectionMemberCard.getAttribute('data-preview-state'), 'available')
    const collectionPreviewTitle = await collectionMemberCard.getAttribute('title')
    assert.ok(collectionPreviewTitle?.includes(String(collectionTextMember.artifact.title)))
    const collectionPreviewLabelPrefix = (await collectionMemberCard.innerText()).trim()
    assert.equal(collectionPreviewLabelPrefix, String(collectionTextMember.artifact.title).slice(0, 18),
      'The original compact face shows the bounded member label prefix, not full document text.')
    report.collectionMembersReadback = { status: collectionMembersResponse.status(), path: collectionMembersPath,
      projectId, collectionId, memberRef: collectionMembersSnapshot.members[0].memberRef,
      preview: { type: collectionMemberPreview.type, id: collectionMemberPreview.id, label: collectionMemberPreview.label,
        kind: collectionMemberPreview.kind, availability: collectionMemberPreview.availability,
        revisionId: collectionMemberPreview.revisionId, fileRecordId: collectionMemberPreview.fileRecordId,
        mimeType: collectionMemberPreview.mimeType, byteSize: collectionMemberPreview.byteSize,
        contentFieldPresent: Object.hasOwn(collectionMemberPreview, 'content'), excerptFieldPresent: Object.hasOwn(collectionMemberPreview, 'excerpt') },
      dom: { collectionReadStatus: await collectionFace.getAttribute('data-member-read-status'),
        memberCount: await collectionFace.getAttribute('data-member-count'), memberKey: await collectionMemberCard.getAttribute('data-lcos-member-preview'),
        memberRevision: await collectionMemberCard.getAttribute('data-member-revision'), memberFamily: await collectionMemberCard.getAttribute('data-preview-kind'),
        availability: await collectionMemberCard.getAttribute('data-preview-state'), labelPrefix: collectionPreviewLabelPrefix },
      fullBodyDelivered: false, composerReferenceOnly: true }
    report.collectionMembersReadPassed = true
    assert.equal(report.apiFailures.some(failure => failure.path === collectionMembersPath), false,
      'The original Collection members route must no longer fail with the prior 501 response.')
    await screenshot('collection-member-readback')
    const addCollectionToDraft = collectionCard.locator('[data-lcos-assembly-add]')
    assert.equal(await addCollectionToDraft.count(), 1,
      'Use the original Collection card “加入引用” action; no substitute control or Shell-store insertion.')
    assert.equal((await addCollectionToDraft.innerText()).trim(), '加入引用')
    await collectionCard.hover({ timeout: 10000 })
    report.collectionDraftAction = await addCollectionToDraft.evaluate(element => {
      const rect = element.getBoundingClientRect()
      return { label: element.innerText.trim(), disabled: element.disabled,
        visible: Boolean(element.getClientRects().length && getComputedStyle(element).visibility === 'visible'),
        pointerEvents: getComputedStyle(element).pointerEvents,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        ownerCollectionId: element.closest('[data-lcos-assembly-item]')?.getAttribute('data-lcos-assembly-item') }
    })
    assert.equal(report.collectionDraftAction.visible, true)
    assert.equal(report.collectionDraftAction.disabled, false)
    assert.notEqual(report.collectionDraftAction.pointerEvents, 'none')
    assert.equal(report.collectionDraftAction.ownerCollectionId, collectionId)
    await screenshot('collection-reference-action-hovered')

    const expectedCollectionDraftKey = JSON.stringify(['collection', collectionId, null, 'full'])
    const browserWritesBeforeCollectionTake = report.browserWrites.length
    await addCollectionToDraft.click({ timeout: 10000 })
    await page.waitForFunction(({ key }) => [...document.querySelectorAll('[data-lcos-composer-ref]')]
      .some(element => element.getAttribute('data-reference-key') === key), { key: expectedCollectionDraftKey }, { timeout: 15000 })
    const composerReferences = page.locator('[data-lcos-composer-ref]')
    assert.equal(await composerReferences.count(), 2,
      'The original unsent Composer must retain the Capture reference and add exactly one Collection reference.')
    report.collectionDraftReference = await composerReferences.evaluateAll(elements => elements.map(element => ({
      key: element.getAttribute('data-reference-key'), label: element.querySelector('.lcos-composer-reference-label')?.textContent?.trim() ?? '',
    })))
    assert.ok(report.collectionDraftReference.some(reference => reference.key === expectedCollectionDraftKey
      && reference.label === collectionTitle), 'Composer must expose the exact canonical Collection identity and label.')
    assert.equal(await page.locator('[data-lcos-composer-input]').inputValue(), '',
      'Taking an existing Collection into the Composer must not invent prompt text or submit it.')
    assert.equal(report.browserWrites.length, browserWritesBeforeCollectionTake,
      'Collection-to-draft is an in-memory reference action, not Collection membership or AssemblyApply mutation.')
    assert.equal((await appCoreCall(`${projectPath.slice('/api/lcos/core'.length)}/runs`)).length, 0)
    report.collectionToComposerReferencePassed = true
    report.collectionComposerScope = 'Original Project Collection card → original Assembly add-to-draft → exact collection reference key in the same unsent Composer; no membership write, generic AssemblyApply, Run, or provider call.'
    report.cases.push('original canonical Collection card adds its exact identity to the existing unsent Composer with no generic Apply or Run')
    await screenshot('composer-collection-reference')

    const listMode = assembly.getByRole('button', { name: '列表视图', exact: true })
    await listMode.click()
    await page.waitForFunction(() => document.querySelector('[data-lcos-assembly]')?.getAttribute('data-lcos-assembly-layout') === 'list')
    const imageCard = assembly.locator(`[data-lcos-assembly-item="${existingImageRef.artifactId}"]`)
    await imageCard.waitFor({ state: 'visible', timeout: 20000 })
    assert.equal(await imageCard.getAttribute('data-lcos-assembly-item-kind'), 'artifact')
    assert.equal(await imageCard.getAttribute('data-lcos-assembly-visual-family'), 'image')
    assert.equal(report.warehouseImageSameArtifactRevisionAsCanvas, true,
      'Warehouse and Canvas may project different Views, but both exact Core View records must resolve to the same Artifact and Revision before preview.')
    report.listModeImageInteraction = await imageCard.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const quickPreview = element.querySelector('[data-lcos-assembly-quick-preview]')
      const centerHit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return { cardId: element.getAttribute('data-lcos-assembly-item'), tabIndex: element.tabIndex,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        quickPreviewDisplay: quickPreview ? getComputedStyle(quickPreview).display : null,
        quickPreviewLabel: quickPreview?.getAttribute('aria-label') ?? null,
        centerHitCardId: centerHit?.closest('[data-lcos-assembly-item]')?.getAttribute('data-lcos-assembly-item') ?? null,
        centerHitTag: centerHit?.tagName ?? null, centerHitButton: Boolean(centerHit?.closest('button')) }
    })
    assert.equal(report.listModeImageInteraction.tabIndex, 0,
      'The original list card is keyboard-focusable because it owns an onPreview action.')
    assert.equal(report.listModeImageInteraction.quickPreviewDisplay, 'none',
      'The current Gen2 list CSS hides the grid quick-preview button; use the original list-card keyboard handler instead.')
    assert.equal(report.listModeImageInteraction.centerHitCardId, String(existingImageRef.artifactId),
      'The observed screen-space hit must belong to the exact existing image Artifact card.')
    await imageCard.focus()
    await page.keyboard.press('Enter')
    const preview = assembly.locator('[data-lcos-assembly-preview]')
    await preview.waitFor({ state: 'visible', timeout: 10000 })
    await preview.locator('img').first().waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForFunction(() => {
      const image = document.querySelector('[data-lcos-assembly-preview] img')
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
    }, null, { timeout: 15000 })
    report.imagePreview = await preview.evaluate(element => ({ title: element.innerText.slice(0, 500),
      images: [...element.querySelectorAll('img')].map(image => ({ naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight, loaded: image.complete && image.naturalWidth > 0,
        blobUrl: image.src.startsWith('blob:') })) }))
    assert.ok(report.imagePreview.images.some(image => image.loaded && image.naturalWidth > 0),
      'Original Assembly list-card Enter handler must open the exact existing image through Core-backed preview bytes.')
    assert.equal(report.warehouseImageSameArtifactRevisionAsCanvas, true,
      'The previewed Warehouse item must preserve the exact Canvas Artifact/Revision and each independently verified View identity.')
    report.imagePreview.source = { artifactId: existingImageRef.artifactId,
      canvasArtifactViewId: existingImageRef.artifactViewId,
      warehouseArtifactViewId: report.warehouseImageIdentity.warehouse.viewId,
      viewsAreDistinct: report.warehouseImageIdentity.distinctViewIds,
      revisionId: existingImageRef.revisionId,
      openedBy: 'native keyboard Enter on the list card; original AssemblyItemView onKeyDownCapture → onPreview' }
    report.imagePreviewListModePassed = true
    assert.equal(await page.locator('.react-flow').count(), 1)
    await screenshot('assembly-image-preview-list-mode')
    report.cases.push('original Assembly list mode opens the exact existing Canvas image using its native keyboard preview handler and loads Core-backed image bytes')

    assert.equal(report.materializeReceiptCount, 1)
    assert.equal(captureMaterializeRequestCount, 1)
    assert.equal((await appCoreCall(`${projectPath.slice('/api/lcos/core'.length)}/runs`)).length, 0)
    assert.equal(await page.locator('[data-lcos-professional-stage] [data-lcos-window-body="assembly"]').count(), 1)
    assert.equal(await page.locator('.react-flow').count(), 1, 'Original TapNow must retain exactly one Canvas in the same workflow.')
    assert.equal(report.pageErrors.length, 0, `Browser page errors: ${JSON.stringify(report.pageErrors)}`)
    assert.equal(report.unexpectedBlockedWrites.length, 0, `Unexpected writes were denied: ${JSON.stringify(report.unexpectedBlockedWrites)}`)
    assert.equal(report.deniedNodeFetches.length, 0, `Unexpected Node fetch attempts outside the pinned dead Ollama port: ${JSON.stringify(report.deniedNodeFetches)}`)
    assert.equal(await page.locator('[data-lcos-composer-input]').inputValue(), '')
    report.providerStatus = providerStatus
    const canvasAfter = await appFacadeCall(`/api/canvas/v1/canvases/${encodeURIComponent(workflow.canvasId)}`)
    assert.equal(canvasAfter.nodes.length, canvasBefore.nodes.length, 'Capture→Composer collection must not add a second Canvas node.')
    report.after = {
      canvasNodeCount: canvasAfter.nodes.length,
      captureMaterialized,
      remainingPendingCaptureIds: captureSnapshotAfter.items.map(item => item.id),
      runCount: (await appCoreCall(`${projectPath.slice('/api/lcos/core'.length)}/runs`)).length,
      browserWrites: report.browserWrites.length,
      captureMaterializeReceipts: report.materializeReceiptCount,
      promptSubmitted: false,
    }
    report.captureToComposerReferencePassed = captureMaterialized === true && report.composerReference?.referenceCount === 1
    report.overallCaptureEndToEndPassed = report.captureToComposerReferencePassed
    report.captureMaterializationUi = captureMaterialized === true
    report.captureComposerReference = report.overallCaptureEndToEndPassed
    report.captureMaterializationScope = 'Original WorkView delegate → Composer → Assembly collectReferences → Core materialize → exact prepared unsent Composer reference. This does not claim model execution, artifact return, or a node projected back onto Canvas.'
    report.modelExecution = false
    report.artifactReturnToCanvasVerified = false
    report.uiRefreshAndPreviewPassed = report.warehouseAutomaticRefreshResolvedMaterializedArtifact === true
      && report.warehouseRefreshResolvedMaterializedArtifact === true
      && report.imagePreviewListModePassed === true
    report.guiSubsetsPassed = report.captureToComposerReferencePassed && report.uiRefreshAndPreviewPassed
    report.passed = report.captureToComposerReferencePassed && report.uiRefreshAndPreviewPassed
      && report.collectionMembersReadPassed === true
      && report.collectionToComposerReferencePassed === true
    if (!report.warehouseRefreshResolvedMaterializedArtifact) report.blockedReason = report.warehouseDiagnosis
  } catch (error) {
    report.failure = String(error.stack ?? error)
    if (page) {
      report.failureUrl = page.url()
      report.failureTitle = await page.title().catch(() => '')
      report.failureBody = (await page.locator('body').innerText().catch(() => '')).slice(0, 10000)
      await screenshot('failure').catch(() => {})
      report.captureMaterializeRequests = report.browserWrites.filter(write => write.path?.endsWith('/runtime/capture-space/materialize'))
    }
    if (origin && launcher) {
      try {
        const snapshot = await appCoreCall('/runtime/capture-space')
        report.captureReadbackOnFailure = captureItems.map(item => snapshot.items.find(row => row.id === item.id) ?? null)
      } catch (readError) { report.captureReadbackError = String(readError.stack ?? readError) }
    }
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
    report.runtimeRemoved = await removeRuntimeSafely()
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ passed: report.passed, runtimeLabel, origin, cases: report.cases,
      captureMaterializeReceipts: report.materializeReceiptCount, screenshots: report.screenshots,
      pageErrors: report.pageErrors, apiFailures: report.apiFailures, blockedWrites: report.blockedWrites.length,
      failure: report.failure?.split('\n')[0] ?? null, reportPath }, null, 2))
    if (!report.passed) process.exitCode = 1
  }

  async function screenshot(name) {
    if (!page) return
    const target = path.join(visualRoot, `tapnow-current-gen2-assembly-${stamp}-${name}.png`)
    await page.screenshot({ path: target, fullPage: false })
    report.screenshots.push(target)
  }

  async function stopVerifiedLauncher() {
    if (!launcher) return
    try {
      if (!serverPid && launcher.exitCode === null) {
        report.launcher.cleanup = { terminated: false,
          reason: 'No health-verified isolated server PID was captured; launcher was left running rather than stopping an unverified child tree.' }
        return
      }
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
        report.launcher.cleanupServer = { pid: serverPid, health: liveHealth ?? null,
          commandLine: serverCommandLine, healthIdentityOk, commandLineIdentityOk: serverIdentityOk }
        if (serverIdentityOk && healthIdentityOk) {
          stopExactProcess(serverPid, path.join(root, 'lab/server.mjs'), runtimeLabel, uiPort)
          report.launcher.cleanupServer.stopRequested = true
          report.launcher.cleanupServer.exited = await waitForProcessGone(serverPid, 15000)
        } else if (serverQuerySucceeded && !serverCommandLine && !healthResponse?.ok) {
          report.launcher.cleanupServer.exited = true
          report.launcher.cleanupServer.alreadyExited = true
        }
        if (!report.launcher.cleanupServer.exited) {
          report.launcher.cleanup = { terminated: false, reason: 'Isolated server process identity was not verified or its exact process did not exit; runtime preserved.' }
          return
        }
      }
      if (launcher.exitCode === null && report.launcher.cleanupServer?.exited) await waitForExit(launcher, 5000)
      if (launcher.exitCode === null) {
        const pid = Number(launcher.pid)
        const commandLine = await queryCommandLine(pid).catch(() => '')
        const launcherIdentityOk = matchesProcessIdentity(commandLine, path.join(root, 'scripts/start-full-integration.mjs'), runtimeLabel, uiPort)
        if (!launcherIdentityOk) {
          report.launcher.cleanup = { terminated: false, pid, commandLine,
            reason: 'Launcher command line did not match the exact isolated runtime label and port; runtime preserved.' }
          return
        }
        await waitForExit(launcher, 5000)
        if (launcher.exitCode === null) {
          stopExactProcess(pid, path.join(root, 'scripts/start-full-integration.mjs'), runtimeLabel, uiPort)
          await waitForExit(launcher, 10000)
        }
        report.launcher.cleanup = { pid, commandLine, ownerVerified: true,
          method: 'stopped exact verified server PID, awaited official launcher, and only then individually verified launcher if needed',
          terminated: launcher.exitCode !== null, exitCode: launcher.exitCode }
      } else if (report.launcher.cleanupServer?.exited) {
        report.launcher.cleanup = { launcherPid: launcher.pid, launcherExitedAfterServerStop: true, exitCode: launcher.exitCode }
      }
    } catch (error) { report.launcher.cleanup = { terminated: false, reason: String(error.stack ?? error) } }
  }

  async function removeRuntimeSafely() {
    if (!await exists(runtimeRoot)) return true
    if (launcher && launcher.exitCode === null) return false
    try {
      const [baseReal, targetReal] = await Promise.all([realpath(runtimeBase), realpath(runtimeRoot)])
      const relative = path.relative(baseReal, targetReal)
      if (!/^isolated-gen2-assembly-\d+$/.test(path.basename(targetReal)) || relative !== path.basename(targetReal)
        || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return false
      await rm(targetReal, { recursive: true, force: true })
      return true
    } catch (error) { report.runtimeCleanupError = String(error.stack ?? error); return false }
  }
}

async function exists(target) {
  try { await realpath(target); return true } catch { return false }
}

function isEmptyRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
