import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Resources, currentGen2Root } from '../lab/current-gen2-resources.mjs'
import { verifyCollectionManagement } from './native-collection-management-browser.mjs'
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
const reportDir = path.join(runtimeBase, 'native-collection-placement-browser')
const runId = Date.now()
const runtimeLabel = `isolated-collection-placement-${runId}`
const runtimeRoot = path.join(runtimeBase, runtimeLabel)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const reportPath = path.join(reportDir, `${stamp}.json`)
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
const projectId = 'disposable-surface-core-facade'
const mainSurfaceKey = 'main'
const surfaceArgument = process.argv.find((value) => value.startsWith('--surface='))?.slice('--surface='.length) ?? 'main'
const supportedSurfaces = new Set(['main', 'context', 'workflow'])
const verifyHistory = process.argv.includes('--verify-history')
const verifyMembers = process.argv.includes('--verify-members')
const loseMemberReply = process.argv.includes('--lose-member-reply')
const expectedMemberCount = verifyMembers ? 2 : 1

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--run-isolated')) {
    console.error('Not started. Use --run-isolated to create a disposable loopback Core runtime; live runtimes are not used.')
    process.exitCode = 2
  } else if (!supportedSurfaces.has(surfaceArgument)) {
    console.error(`Not started. --surface must be one of main|context|workflow; got ${JSON.stringify(surfaceArgument)}.`)
    process.exitCode = 2
  } else if (verifyMembers && !verifyHistory || loseMemberReply && !verifyMembers) {
    console.error('Not started. --verify-members requires --verify-history; --lose-member-reply requires --verify-members.')
    process.exitCode = 2
  } else await run()
}

function safePath(address) {
  try {
    const url = new URL(address)
    return `${url.pathname}${url.search ? '?<query-redacted>' : ''}`
  } catch { return String(address).slice(0, 300) }
}

function safeAddress(address) {
  try { const url = new URL(address); return `${url.origin}${url.pathname}${url.search ? '?<query-redacted>' : ''}` }
  catch { return String(address).slice(0, 300) }
}

function samePosition(a, b, tolerance = 0.02) {
  return !!a && !!b && Number.isFinite(a.x) && Number.isFinite(a.y)
    && Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance
}

function nativeSerializedPoint(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined
  return { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function nodeFingerprint(node) {
  return {
    id: String(node.id), type: node.type ?? null, position: node.position ?? null,
    parentId: node.parentId ?? null, measured: node.measured ?? null,
    width: node.width ?? null, height: node.height ?? null, selected: node.selected === true,
    data: node.data ?? null,
  }
}

function canvasFingerprint(value) {
  return {
    id: value?.id ?? value?.canvasId ?? null,
    viewport: value?.viewport ?? value?.state?.viewport ?? null,
    nodes: Array.isArray(value?.nodes) ? value.nodes.map(nodeFingerprint) : [],
    edges: Array.isArray(value?.edges) ? value.edges : [],
  }
}

function closestCoreUrl(url, method) {
  return method === 'GET' && url.pathname.startsWith('/api/lcos/core/')
}

async function run() {
  const report = {
    schema: 'native-collection-placement-browser-v1',
    at: new Date().toISOString(),
    passed: false,
    runtimeLabel,
    runtimeRoot,
    reportPath,
    currentGen2Root,
    currentGen2CatalogCount: currentGen2Resources.length,
    fixture: {
      kind: `manual canonical Core Collection with ${verifyMembers ? 'existing exact text and image Artifact members plus another Collection sharing the text' : 'one existing exact text Artifact member'}; manually connected/imported Conversation only enables the original WorkView→Assembly route; no model/provider result`,
      projectId,
      browserWrites: `one real original Assembly Apply + one original collection projection + exact original Canvas position saves from drop/undo/redo${verifyMembers ? '; one original member removal and one real Assembly add-back; original WorkView/Reader/gallery reads' : ''}; no generic Apply, node injection, direct state setter, model or provider request`,
      assemblyCreatedInGui: false,
    },
    browser: { viewport: { width: 1440, height: 1000 }, serviceWorkers: 'blocked', browserPluginAvailable: false,
      fallback: 'repository Playwright-core + installed Chrome; explicit isolated-run task',
      externalHttpAllowed: false, externalWebSocketAllowed: false },
    providerExecution: false,
    modelExecution: false,
    membershipVerification: { enabled: verifyMembers, loseMemberReply, writes: [], faults: [] },
    fixtureWrites: [],
    browserWrites: [],
    surface: { requested: surfaceArgument },
    blockedWrites: [],
    unexpectedWrites: [],
    blockedHttp: [],
    blockedWebSockets: [],
    diagnosticTelemetry: [],
    executionProjectionSyncs: [],
    initialSpatialSynchronizations: [],
    pageErrors: [],
    consoleErrors: [],
    consoleWarnings: [],
    apiFailures: [],
    requestFailures: [],
    browserRequests: [],
    pointerEvidence: [],
    screenshots: [],
    steps: [],
    launcher: {},
  }

  const deniedEnvironment = [
    'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LCOS_CODEX_AUTO_EXECUTION',
    'LCOS_WORKBUDDY_AUTO_EXECUTION', 'HUABU_HOST_URL', 'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN',
    'HUABU_AGENTLET_ID', 'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD',
    'HUABU_DATA_DIR', 'LCOS_OCR_PYTHON', 'LCOS_OLLAMA_URL', 'LCOS_OLLAMA_EMBED_MODEL',
  ]
  for (const key of deniedEnvironment) delete process.env[key]
  process.env.LCOS_RECOVERY_TRANSPORT = 'none'
  process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
  process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
  process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

  let facade
  let browser
  let context
  let page
  let launcher
  let launcherSpawned = false
  let launcherStdout = ''
  let launcherStderr = ''
  let launcherState = { closed: undefined }
  let origin
  let uiPort
  let serverPid
  let coreOrigin
  let mainWorkspace
  let sourceMainWorkspace
  let targetWorkspace
  let mainCanvasBefore
  let conversationId
  let collectionId
  let collectionTitle
  let collectionMember
  let managementTextMember
  let managementImageMember
  let otherCollectionId
  let membershipPhase = 'idle'
  let membershipAddCount = 0
  let membershipRemoveCount = 0
  let collectionNodeId
  let collectionProjectReceipt
  let coreApplyReceipt
  let expectedDropPoint
  let expectedWorldPoint
  let expectedProjectionPosition
  let expectedSpatialPhase = 'before-drop'
  let coreApplyCount = 0
  let collectionProjectCount = 0
  let browserBatchCount = 0
  let initialSpatialSyncBatchCount = 0
  let browserBatchResponses = []
  let bootstrapping = false
  let fixtureCanvasBefore
  let canvasBaselinesById = new Map()
  let fixtureGraphBefore
  let presentationBefore
  let presentationsBeforeCarry
  let canvasesBeforeCarry
  let runCountBefore
  let providerRows
  let allowedNodeOrigins = new Set()
  let originalFetch = globalThis.fetch.bind(globalThis)
  let reportWriteDone = false

  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : String(input)
    const url = new URL(address)
    const bootstrapOrigins = bootstrapping
      ? process._getActiveHandles().filter((handle) => handle instanceof net.Server && handle.listening)
        .map((handle) => handle.address()).filter((value) => value && typeof value !== 'string' && value.address === '127.0.0.1')
        .map((value) => `http://127.0.0.1:${value.port}`)
      : []
    if (url.protocol === 'http:' && (allowedNodeOrigins.has(url.origin) || bootstrapOrigins.includes(url.origin))) {
      report.nodeHttpOrigins ??= []
      if (!report.nodeHttpOrigins.includes(url.origin)) report.nodeHttpOrigins.push(url.origin)
      return originalFetch(input, init)
    }
    if (url.origin === 'http://127.0.0.1:1') {
      report.pinnedOllamaRejected ??= []
      report.pinnedOllamaRejected.push({ method: init?.method ?? 'GET', path: url.pathname })
      throw new Error('This isolated fixture pins Ollama to an unavailable local port; no embedding service is started.')
    }
    report.deniedNodeFetches ??= []
    report.deniedNodeFetches.push({ method: init?.method ?? 'GET', origin: url.origin, path: url.pathname })
    throw new Error('Isolated Collection browser runner blocks all non-allowlisted Node HTTP origins.')
  }

  const coreCall = async (method, pathname, body) => {
    assert.ok(coreOrigin, 'Fixture Core origin must be captured from the isolated facade.')
    const response = await originalFetch(coreOrigin + pathname, {
      method,
      headers: body === undefined ? { Accept: 'application/json' }
        : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error', cache: 'no-store',
    })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
    assert.equal(response.status, 200, `${method} ${pathname}: HTTP ${response.status}; ${JSON.stringify(payload)}`)
    assert.equal(payload.ok, true, `${method} ${pathname}: Core envelope ${JSON.stringify(payload)}`)
    return payload.value
  }

  const coreHttp = async (method, pathname, body) => {
    assert.ok(coreOrigin, 'Manual Core fixture writes must use this fresh isolated Core origin.')
    const response = await originalFetch(coreOrigin + pathname, {
      method,
      headers: body === undefined ? { Accept: 'application/json' }
        : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error', cache: 'no-store',
    })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
    return { status: response.status, body: payload }
  }

  const callFacade = async (method, pathname, body) => {
    assert.ok(facade, 'The isolated bootstrap facade must still be open for fixture creation.')
    return facade.handle({ method, pathname, url: new URL(pathname, origin), body })
  }

  const appCoreCall = async (pathname) => {
    assert.ok(origin, 'Isolated app origin must be ready for Core readback.')
    const response = await originalFetch(origin + '/api/lcos/core' + pathname, {
      headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store',
    })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
    assert.equal(response.status, 200, `GET ${pathname}: HTTP ${response.status}; ${JSON.stringify(payload)}`)
    assert.equal(payload.ok, true, `GET ${pathname}: Core envelope ${JSON.stringify(payload)}`)
    return payload.value
  }

  const appFacadeCall = async (pathname) => {
    assert.ok(origin, 'Isolated app origin must be ready for spatial readback.')
    const response = await originalFetch(origin + pathname, {
      headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store',
    })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
    assert.equal(response.status, 200, `GET ${pathname}: HTTP ${response.status}; ${JSON.stringify(payload)}`)
    assert.equal(payload.code, 0, `GET ${pathname}: facade envelope ${JSON.stringify(payload)}`)
    return payload.data
  }

  const readRawFile = async (fileRecordId) => {
    const response = await originalFetch(`${origin}/api/lcos/core/projects/${encodeURIComponent(projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`,
      { headers: { Accept: '*/*' }, cache: 'no-store', redirect: 'error' })
    return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) }
  }

  const addStep = (name, evidence) => report.steps.push({ name, passed: true, ...evidence })

  const saveScreenshot = async (label, locator) => {
    if (!page) return undefined
    const filename = path.join(visualRoot, `tapnow-native-collection-${surfaceArgument}-${stamp}-${label}.png`)
    await mkdir(visualRoot, { recursive: true })
    if (locator) await locator.screenshot({ path: filename, animations: 'disabled' })
    else await page.screenshot({ path: filename, fullPage: false, animations: 'disabled' })
    report.screenshots.push({ label, path: filename, viewport: report.browser.viewport })
    return filename
  }

  async function removeIsolatedRuntimeSafely() {
    if (launcherSpawned) {
      if (!serverPid || report.launcher?.cleanupServer?.exited !== true) {
        return { removed: false, reason: 'isolated child identity/exit was not confirmed; runtime preserved.' }
      }
      if (report.launcher?.cleanupServer?.listenerAfterStop?.listening !== false) {
        return { removed: false, reason: 'exact isolated origin still has a listener or listener status is unknown; runtime preserved.' }
      }
    }
    const expected = path.resolve(runtimeBase, runtimeLabel)
    if (path.resolve(runtimeRoot) !== expected || !runtimeLabel.startsWith('isolated-collection-placement-')) {
      return { removed: false, reason: 'runtime path did not match the exact generated label; runtime preserved.' }
    }
    try {
      const realBase = await realpath(runtimeBase)
      const realTarget = await realpath(runtimeRoot)
      const info = await stat(realTarget)
      if (!info.isDirectory() || realTarget === realBase || !realTarget.startsWith(realBase + path.sep)) {
        return { removed: false, reason: 'real target did not resolve to a strict child directory of .runtime; preserved.' }
      }
      await rm(realTarget, { recursive: true, force: false })
      return { removed: true, exactTarget: realTarget, confinedToRuntime: true }
    } catch (error) {
      return { removed: false, reason: String(error.stack ?? error) }
    }
  }

  async function stopVerifiedLauncher() {
    if (!launcher) return
    try {
      const childPidLines = [...(launcherStdout + '\n' + launcherStderr).matchAll(/Isolated full-integration child PID:\s*(\d+)/g)]
        .map((match) => Number(match[1]))
      const uniqueChildPids = [...new Set(childPidLines)]
      report.launcher.childPidCandidatesFromStdout = uniqueChildPids
      if (!serverPid && uniqueChildPids.length === 1) {
        serverPid = uniqueChildPids[0]
        report.launcher.serverPidRecoveredFromStdout = true
      } else if (serverPid && uniqueChildPids.length === 1 && uniqueChildPids[0] !== serverPid) {
        report.launcher.childPidMismatch = { healthPid: serverPid, stdoutPid: uniqueChildPids[0] }
        report.launcher.cleanup = { terminated: false, reason: 'Health PID and launcher stdout child PID disagree; left processes and runtime untouched.' }
        return
      } else if (uniqueChildPids.length > 1) {
        report.launcher.cleanup = { terminated: false, reason: 'Launcher stdout contains multiple child PIDs; exact child is ambiguous, left processes and runtime untouched.' }
        return
      }

      if (serverPid) {
        const health = await originalFetch(`${origin}/health`, { redirect: 'error', cache: 'no-store' })
          .then((response) => response.ok ? response.json() : undefined).catch(() => undefined)
        const commandLine = await queryCommandLine(serverPid)
        const alreadyGone = !commandLine && await waitForProcessGone(serverPid, 1000)
        const verified = health?.pid === serverPid && matchesProcessIdentity(commandLine,
          path.join(root, 'lab/server.mjs'), runtimeLabel, uiPort)
        report.launcher.cleanupServer = { pid: serverPid, health: health ? { pid: health.pid,
          profile: health.profile, realCoreConnected: health.realCoreConnected } : null,
        commandLine, verified, recoveredFromStdout: report.launcher.serverPidRecoveredFromStdout === true,
        alreadyGone }
        if (alreadyGone) {
          report.launcher.cleanupServer.exited = true
        }
        if (!verified) {
          if (!alreadyGone) {
            report.launcher.cleanup = { terminated: false, reason: 'Health/complete command line did not identify the exact isolated server; preserved.' }
            return
          }
        }
        if (verified) {
          stopExactProcess(serverPid, path.join(root, 'lab/server.mjs'), runtimeLabel, uiPort)
          report.launcher.cleanupServer.stopRequested = true
          report.launcher.cleanupServer.exited = await waitForProcessGone(serverPid, 15000)
          if (!report.launcher.cleanupServer.exited) {
            report.launcher.cleanup = { terminated: false, reason: 'Exact isolated server did not exit; runtime preserved.' }
            return
          }
        }

        const listenerAfterStop = await probeLoopbackListener(uiPort)
        report.launcher.cleanupServer.listenerAfterStop = listenerAfterStop
        if (listenerAfterStop.listening) {
          report.launcher.cleanup = { terminated: false, reason: 'A listener remains on the exact isolated origin; left it untouched and preserved runtime.' }
          return
        }
        await waitForExit(launcher, 5000)
      }
      if (launcher.exitCode === null && !serverPid) {
        report.launcher.cleanup = { terminated: false, pid: launcher.pid,
          reason: 'No exact server child PID was recovered; launcher left untouched and runtime preserved.' }
        return
      }
      if (launcher.exitCode === null && serverPid && report.launcher.cleanupServer?.exited) {
        const commandLine = await queryCommandLine(launcher.pid)
        if (!matchesProcessIdentity(commandLine, path.join(root, 'scripts/start-full-integration.mjs'), runtimeLabel, uiPort)) {
          report.launcher.cleanup = { terminated: false, pid: launcher.pid, commandLine,
            reason: 'Launcher command line did not match the exact isolated runtime; left running.' }
          return
        }
        stopExactProcess(launcher.pid, path.join(root, 'scripts/start-full-integration.mjs'), runtimeLabel, uiPort)
        report.launcher.cleanup = { pid: launcher.pid, commandLine, ownerVerified: true,
          exited: await waitForProcessGone(launcher.pid, 10000) }
      } else if (report.launcher.cleanupServer?.exited) {
        report.launcher.cleanup = { launcherPid: launcher.pid, launcherExitedAfterExactServerStop: launcher.exitCode !== null,
          exitCode: launcher.exitCode }
      }
    } catch (error) {
      report.launcher.cleanup = { terminated: false, reason: String(error.stack ?? error) }
    }
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
    const bootstrapBundle = path.join(bootstrapDir, 'surface-core-facade.mjs')
    await buildPilotEntry('lab/pilot/surface-core-facade.ts', bootstrapBundle)
    const bootstrapManifest = JSON.parse(await (await import('node:fs/promises')).readFile(`${bootstrapBundle}.sources.json`, 'utf8'))
    report.sourceManifests = { bootstrap: bootstrapManifest }
    const { startSurfaceCoreFacade } = await import(pathToFileURL(bootstrapBundle).href)

    bootstrapping = true
    facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true })
    bootstrapping = false
    coreOrigin = String(facade.core.origin)
    assert.match(coreOrigin, /^http:\/\/127\.0\.0\.1:\d+$/, 'Core must be a fresh loopback server bound for this exact runtime.')
    allowedNodeOrigins.add(coreOrigin)
    report.bootstrap = { coreOrigin, projectId: facade.core.projectId,
      databasePath: facade.core.databasePath, realCore: true, fullIntegration: true }
    assert.equal(facade.core.projectId, projectId)

    const projectPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}`
    const project = facade.core.repository.getProject(projectId)
    assert.ok(project, 'The disposable Core project must exist in this new runtime.')
    const workspaces = facade.workspaces.filter((row) => String(row.projectId) === projectId && row.canvasId)
    mainWorkspace = workspaces.find((row) => row.preferredSurface === mainSurfaceKey)
    sourceMainWorkspace = mainWorkspace
    targetWorkspace = workspaces.find((row) => row.preferredSurface === surfaceArgument)
    const rootScopes = facade.core.repository.getScopes(projectId).filter((scope) => scope.kind === 'root')
    const contextScope = facade.core.repository.getScopes(projectId).find((scope) => scope.kind === 'context')
    assert.equal(rootScopes.length, 1, 'The synthetic project must have one canonical Core root Scope.')
    assert.ok(mainWorkspace?.canvasId && mainWorkspace.id,
      'Select one exact project-owned Main Workspace and Canvas from Core fixture setup.')
    assert.ok(targetWorkspace?.canvasId && targetWorkspace.id && targetWorkspace.scopeId,
      `Select one exact Core-declared ${surfaceArgument} Workspace, Canvas and Scope from fixture setup.`)
    assert.ok(contextScope?.id, 'Select one existing canonical Context scope for a manually imported session transcript.')
    assert.equal(workspaces.filter((row) => row.preferredSurface === surfaceArgument).length, 1,
      `The disposable project must declare exactly one ${surfaceArgument} root workspace.`)
    assert.ok(workspaces.every((row) => String(row.scopeId) === String(rootScopes[0].id)),
      'The three root surfaces must retain the Core-declared root Scope; context/workflow child scopes are separate fixtures, not root Surface targets.')
    const readAllCanvases = async () => {
      const snapshots = {}
      for (const workspace of workspaces) {
        snapshots[workspace.preferredSurface] = await appFacadeCall(
          `/api/canvas/v1/canvases/${encodeURIComponent(workspace.canvasId)}`)
      }
      return snapshots
    }
    const targetRef = surfaceArgument === 'main' ? { kind: 'main' }
      : { kind: surfaceArgument, id: String(targetWorkspace.scopeId) }
    const targetPresentationId = `presentation:${surfaceArgument === 'workflow' ? 'workflow' : 'context'}:${String(targetWorkspace.scopeId)}`
    report.surface = { projectId, requestedSurface: surfaceArgument, target: {
      canvasId: String(targetWorkspace.canvasId), workspaceId: String(targetWorkspace.id), scopeId: String(targetWorkspace.scopeId),
      preferredSurface: targetWorkspace.preferredSurface, targetRef, presentationId: targetPresentationId,
    }, sourceMain: { canvasId: String(mainWorkspace.canvasId), workspaceId: String(mainWorkspace.id),
      scopeId: String(mainWorkspace.scopeId), preferredSurface: mainWorkspace.preferredSurface },
    rootScopeId: String(rootScopes[0].id),
    declaredSurfaces: workspaces.map((row) => ({ preferredSurface: row.preferredSurface, canvasId: String(row.canvasId),
      workspaceId: String(row.id), scopeId: String(row.scopeId) })) }

    const graphBefore = await coreCall('GET', `${projectPath.slice('/api/lcos/core'.length)}/graph`)
    fixtureGraphBefore = graphBefore
    const candidateMember = graphBefore.artifacts.map((artifact) => {
      const revision = graphBefore.artifactRevisions.find((row) => String(row.id) === String(artifact.currentRevisionId)
        && String(row.artifactId) === String(artifact.id))
      const file = revision === undefined ? undefined : graphBefore.fileRecords.find((row) => String(row.id) === String(revision.fileRecordId))
      const mimeType = String(file?.mimeType ?? '').split(';')[0].trim().toLowerCase()
      return { artifact, revision, file, mimeType }
    }).find((row) => row.revision && row.file
      && ['text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/yaml', 'application/xml', 'text/html'].includes(row.mimeType))
    assert.ok(candidateMember, 'Manual Collection fixture needs one existing Core text Artifact with exact Revision and FileRecord.')

    collectionTitle = `手工合成集合 · ${runtimeLabel}`
    collectionMember = { type: 'artifact', id: String(candidateMember.artifact.id) }
    const initialMembers = [collectionMember]
    if (verifyMembers) {
      const imageArtifact = graphBefore.artifacts.find(artifact => artifact.kind === 'image'
        && graphBefore.artifactRevisions.some(revision => String(revision.id) === String(artifact.currentRevisionId)
          && graphBefore.fileRecords.some(file => String(file.id) === String(revision.fileRecordId) && file.mimeType === 'image/png')))
      assert.ok(imageArtifact, 'Member-management fixture requires one existing exact registered PNG Artifact.')
      const imageRevision = graphBefore.artifactRevisions.find(row => String(row.id) === String(imageArtifact.currentRevisionId))
      const imageFile = graphBefore.fileRecords.find(row => String(row.id) === String(imageRevision.fileRecordId))
      managementTextMember = { ...collectionMember, label: candidateMember.artifact.title,
        revisionId: String(candidateMember.revision.id), fileRecordId: String(candidateMember.file.id), mimeType: candidateMember.mimeType }
      managementImageMember = { type: 'artifact', id: String(imageArtifact.id), label: imageArtifact.title,
        revisionId: String(imageRevision.id), fileRecordId: String(imageFile.id), mimeType: imageFile.mimeType }
      initialMembers.push({ type: 'artifact', id: managementImageMember.id })
      const shared = await coreHttp('POST', `/projects/${encodeURIComponent(projectId)}/collections`,
        { title: `另一集合 · ${runtimeLabel}`, members: [collectionMember] })
      assert.equal(shared.status, 201)
      assert.equal(shared.body.ok, true)
      otherCollectionId = String(shared.body.value.id)
      report.fixtureWrites.push({ producer: 'Core canonical Collections API; shared membership control',
        collectionId: otherCollectionId, members: [collectionMember], manuallyCreatedOutsideGUI: true })
    }
    const collectionCreated = await coreHttp('POST', `/projects/${encodeURIComponent(projectId)}/collections`,
      { title: collectionTitle, members: initialMembers })
    assert.equal(collectionCreated.status, 201, JSON.stringify(collectionCreated.body))
    assert.equal(collectionCreated.body.ok, true)
    collectionId = String(collectionCreated.body.value.id)
    assert.equal(collectionCreated.body.value.projectId, projectId)
    const memberRead = await coreCall('GET', `${projectPath.slice('/api/lcos/core'.length)}/collections/${encodeURIComponent(collectionId)}/members`)
    assert.equal(memberRead.collection.id, collectionId)
    assert.equal(memberRead.collection.projectId, projectId)
    assert.equal(memberRead.members.length, expectedMemberCount)
    assert.ok(memberRead.members.some(row => stableJson(row.memberRef) === stableJson(collectionMember)))
    const textPreview = memberRead.previews.find(row => row.id === collectionMember.id && row.type === 'artifact')
    assert.equal(textPreview?.id, collectionMember.id)
    report.fixtureWrites.push({ producer: 'Core canonical Collections API', projectId, collectionId, title: collectionTitle,
      manuallyCreatedOutsideGUI: true, members: initialMembers, memberPreview: {
        type: textPreview?.type, id: textPreview?.id, label: textPreview?.label,
        revisionId: textPreview?.revisionId, fileRecordId: textPreview?.fileRecordId,
        mimeType: textPreview?.mimeType, byteSize: textPreview?.byteSize,
      }, sourceArtifact: { artifactId: String(candidateMember.artifact.id), revisionId: String(candidateMember.revision.id),
        fileRecordId: String(candidateMember.file.id), mimeType: candidateMember.mimeType } })

    const receiver = await facade.handle({ method: 'POST', pathname: `${projectPath}/connected-conversations`,
      url: new URL(`${projectPath}/connected-conversations`, origin), body: {
        action: 'connect', provider: 'codex', executorId: 'synthetic-test-executor',
        conversationRef: `manual-import-${runtimeLabel}`, label: `合成入口会话 · ${runtimeLabel} · 未运行`,
      } })
    assert.equal(receiver.status, 201, JSON.stringify(receiver.body))
    assert.equal(receiver.body.ok, true)
    conversationId = String(receiver.body.value.id)
    const imported = await facade.handle({ method: 'POST', pathname: `${projectPath}/conversations/import-manual`,
      url: new URL(`${projectPath}/conversations/import-manual`, origin), body: {
        title: `人工导入历史 · ${runtimeLabel} · 非实时执行`, scopeId: String(contextScope.id),
        entries: [
          { role: 'user', contentText: '用于进入原 Conversation Work View 的人工合成历史；不是当前真实会话。' },
          { role: 'assistant', contentText: '本隔离 GUI 不启动模型、Provider、Bridge 或外部执行器。' },
        ],
      } })
    assert.equal(imported.status, 201, JSON.stringify(imported.body))
    assert.equal(imported.body.ok, true)
    const linked = await facade.handle({ method: 'POST', pathname: `${projectPath}/connected-conversations/${encodeURIComponent(conversationId)}/link-session`,
      url: new URL(`${projectPath}/connected-conversations/${encodeURIComponent(conversationId)}/link-session`, origin),
      body: { conversationSessionId: imported.body.value.session.id } })
    assert.equal(linked.status, 200, JSON.stringify(linked.body))
    assert.equal(linked.body.ok, true)
    const reconciled = await facade.handle({ method: 'POST',
      pathname: `/api/lcos/canvases/${encodeURIComponent(mainWorkspace.canvasId)}/conversations:reconcile`,
      url: new URL(`/api/lcos/canvases/${encodeURIComponent(mainWorkspace.canvasId)}/conversations:reconcile`, origin),
      body: { connectedConversationId: conversationId } })
    assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body))
    assert.equal(reconciled.body.code, 0)
    assert.equal(reconciled.body.data.provider_execution_started, false)
    assert.equal(reconciled.body.data.bindings.length, 1)
    const glythBinding = reconciled.body.data.bindings[0]
    assert.equal(glythBinding.entityType, 'conversation')
    assert.equal(glythBinding.entityId, conversationId)
    report.fixtureWrites.push({ producer: 'Core connect + import-manual + link-session + original Gen2Host reconciliation',
      connectedConversationId: conversationId, sessionId: imported.body.value.session.id, entries: 2,
      canvasId: String(mainWorkspace.canvasId), binding: glythBinding, manuallyImportedSynthetic: true,
      providerExecution: false, modelExecution: false })

    providerRows = await coreCall('GET', '/runtime/providers')
    assert.ok(Array.isArray(providerRows) && providerRows.every((row) => row.availability === 'offline'),
      'All providers must remain truthfully offline in the synthetic fixture.')
    runCountBefore = await coreCall('GET', `${projectPath.slice('/api/lcos/core'.length)}/runs`)
    assert.equal(runCountBefore.length, 0, 'The fresh fixture starts with no Core Runs.')
    presentationBefore = await coreCall('GET', `${projectPath.slice('/api/lcos/core'.length)}/presentations`)
    assert.ok(Array.isArray(presentationBefore))
    assert.equal(presentationBefore.some((row) => row.state?.memberEntityRefs?.some((ref) => ref.type === 'collection' && ref.id === collectionId)), false,
      'The fixture Collection starts without a Main Presentation membership.')

    const canvasSnapshotsBefore = {}
    for (const workspace of workspaces) {
      const canvasResponse = await facade.handle({ method: 'GET',
        pathname: `/api/canvas/v1/canvases/${encodeURIComponent(workspace.canvasId)}`,
        url: new URL(`/api/canvas/v1/canvases/${encodeURIComponent(workspace.canvasId)}`, origin) })
      assert.equal(canvasResponse.status, 200, JSON.stringify(canvasResponse.body))
      const canvasSnapshot = canvasResponse.body.data
      assert.equal(canvasSnapshot.id, String(workspace.canvasId))
      canvasSnapshotsBefore[String(workspace.canvasId)] = canvasSnapshot
      canvasBaselinesById.set(String(workspace.canvasId), canvasSnapshot)
    }
    mainCanvasBefore = canvasSnapshotsBefore[String(mainWorkspace.canvasId)]
    assert.ok(mainCanvasBefore)
    assert.equal(mainCanvasBefore.nodes.filter((node) => node.type === 'lcos-conversation').length, 1)
    assert.equal(mainCanvasBefore.nodes.some((node) => node.type === 'lcos-collection' && node.data?.lcos_collection_ref?.collectionId === collectionId), false)
    fixtureCanvasBefore = canvasSnapshotsBefore[String(targetWorkspace.canvasId)]
    assert.ok(fixtureCanvasBefore)
    assert.equal(fixtureCanvasBefore.nodes.some((node) => node.type === 'lcos-collection' && node.data?.lcos_collection_ref?.collectionId === collectionId), false)
    report.before = { projectId, target: { canvasId: String(targetWorkspace.canvasId), workspaceId: String(targetWorkspace.id),
      scopeId: String(targetWorkspace.scopeId), targetRef, presentationId: targetPresentationId,
      canvas: canvasFingerprint(fixtureCanvasBefore) }, sourceMain: { canvasId: String(mainWorkspace.canvasId),
      canvas: canvasFingerprint(mainCanvasBefore) }, canvasSnapshotsById: Object.fromEntries(Object.entries(canvasSnapshotsBefore)
        .map(([canvasId, snapshot]) => [canvasId, canvasFingerprint(snapshot)])), collectionId, memberRef: collectionMember,
      runCount: runCountBefore.length, presentations: presentationBefore.length,
      providers: providerRows.map((row) => ({ provider: row.provider, availability: row.availability })) }

    // Keep Main as the real hand-carry source below, while existing target-specific
    // assertions/routes continue to use the selected workspace alias.
    mainWorkspace = targetWorkspace

    await facade.close()
    facade = undefined
    bootstrapping = false
    allowedNodeOrigins.delete(coreOrigin)
    // The process helper probes only this exact fresh UI origin for /health;
    // browser traffic remains independently origin-restricted below.
    allowedNodeOrigins.add(origin)
    report.bootstrapFacadeClosedBeforeBrowser = true

    launcher = spawn(process.execPath, [path.join(root, 'scripts/start-full-integration.mjs'),
      `--runtime-label=${runtimeLabel}`, `--port=${uiPort}`], {
      cwd: root,
      env: {
        PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        LCOS_RECOVERY_TRANSPORT: 'none', LCOS_CAPTURE_STAGING_ROOT: path.join(runtimeRoot, 'capture'),
        LCOS_OCR_RUNTIME_DIR: path.join(runtimeRoot, 'ocr'), LCOS_OLLAMA_URL: 'http://127.0.0.1:1',
      },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    launcherSpawned = true
    launcher.stdout.setEncoding('utf8').on('data', (chunk) => { launcherStdout = (launcherStdout + chunk).slice(-20000) })
    launcher.stderr.setEncoding('utf8').on('data', (chunk) => { launcherStderr = (launcherStderr + chunk).slice(-20000) })
    launcher.once('close', (code, signal) => { launcherState.closed = { code, signal } })
    const launcherCommandLine = await waitForCommandLine(launcher.pid,
      (line) => matchesProcessIdentity(line, path.join(root, 'scripts/start-full-integration.mjs'), runtimeLabel, uiPort), launcherState)
    report.launcher = { runtimeLabel, launcherPid: launcher.pid, launcherCommandLine }
    const health = await waitForHealth(origin, launcherState, () => launcherStdout + launcherStderr)
    assert.equal(health.realCoreConnected, true)
    assert.equal(health.cloudBackendConnected, false)
    assert.equal(health.profile, 'original-tapnow-full-integration-in-progress')
    serverPid = Number(health.pid)
    assert.ok(Number.isInteger(serverPid) && serverPid > 0)
    const serverCommandLine = await waitForCommandLine(serverPid,
      (line) => matchesProcessIdentity(line, path.join(root, 'lab/server.mjs'), runtimeLabel, uiPort), launcherState)
    report.launcher.serverPid = serverPid
    report.launcher.serverCommandLine = serverCommandLine
    report.launcher.health = { pid: serverPid, profile: health.profile, realCoreConnected: health.realCoreConnected,
      cloudBackendConnected: health.cloudBackendConnected, runtimeRoot: health.runtimeRoot ?? null }
    assert.notEqual(serverPid, 0)
    allowedNodeOrigins.add(origin)

    const nativeUiManifestPath = path.join(runtimeRoot, 'native-ui', 'agent-ui.js.sources.json')
    report.sourceManifests.nativeUi = JSON.parse(await (await import('node:fs/promises')).readFile(nativeUiManifestPath, 'utf8'))
    assert.equal(report.sourceManifests.nativeUi.currentRoot, currentGen2Root,
      'The isolated native bundle must identify the adopted current Gen2 source root.')
    const runtimeResources = new Set(report.sourceManifests.nativeUi.resources.map((row) => row.resourcePath))
    const requiredCurrentOwners = [
      'huabu/apps/web/src/lcos/professional/AssemblyBody.tsx',
      'huabu/apps/web/src/lcos/drop/assemblyCollectionPlacement.ts',
      'huabu/apps/web/src/lcos/drop/dropCommitRouter.ts',
      'huabu/apps/web/src/lcos/drop/dropIntentResolver.ts',
      'huabu/apps/web/src/lcos/LcosHostOverlay.tsx',
    ]
    for (const resourcePath of requiredCurrentOwners) {
      const resource = report.sourceManifests.nativeUi.resources.find((row) => row.resourcePath === resourcePath)
      assert.ok(resource, `Actual native UI source manifest omitted required current owner ${resourcePath}.`)
      assert.equal(path.resolve(resource.sourcePath), path.resolve(currentGen2Root, resourcePath))
      assert.equal(resource.readOnly, true)
    }
    report.currentGen2Provenance = { currentRoot: report.sourceManifests.nativeUi.currentRoot,
      catalogEntryCount: currentGen2Resources.length, requiredRuntimeOwners: requiredCurrentOwners,
      usedResourceCount: runtimeResources.size,
      loadedOwners: report.sourceManifests.nativeUi.resources.map((row) => row.resourcePath),
      dropTypesRuntimeResource: report.sourceManifests.nativeUi.resources.some((row) => /drop\/dropTypes\.ts$/.test(row.resourcePath)),
      note: 'Pure Drop types are not treated as a runtime dependency; actual loaded source manifest is the evidence.' }
    report.sourceManifests.nativeUi.loader = nativeUiManifestPath

    const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: report.browser.viewport, locale: 'zh-CN', serviceWorkers: 'block' })
    await context.addInitScript(() => {
      window.__lcosNativeCanvasHitTests = []
      const original = Document.prototype.elementsFromPoint
      Document.prototype.elementsFromPoint = function (x, y) {
        const elements = original.call(this, x, y)
        const filteredFront = elements.find((element) => element.closest('.react-flow__node.dragging,[data-lcos-native-drop-source],[data-lcos-native-drop-pending]') === null)
        this.defaultView.__lcosNativeCanvasHitTests.push({ x, y,
          front: filteredFront ? { tag: filteredFront.tagName, className: typeof filteredFront.className === 'string' ? filteredFront.className : '',
            insideCanvas: !!filteredFront.closest('.react-flow'), nodeId: filteredFront.closest('.react-flow__node')?.getAttribute('data-id') ?? null,
            insideWindow: !!filteredFront.closest('[data-lcos-window-pane]') } : null })
        return elements
      }
    })

    const exactAssemblyApplyPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}/assembly/apply`
    const exactCollectionProjectPath = `/api/lcos/canvases/${encodeURIComponent(mainWorkspace.canvasId)}/collections:project`
    const exactCollectionBindingPath = `/api/lcos/canvases/${encodeURIComponent(mainWorkspace.canvasId)}/collections/${encodeURIComponent(collectionId)}/projection`
    const exactBatchPath = `/api/canvas/v1/canvases/${encodeURIComponent(mainWorkspace.canvasId)}/nodes:batchActions`
    const exactExecutionSyncPath = `/api/lcos/canvases/${encodeURIComponent(mainWorkspace.canvasId)}/execution:reconcile`
    let collectionProjectSeen = false
    let canvasBatchWrites = 0
    let unexpectedBlockedWrites = []
    let writeGate = 'fixture-ready'

    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const method = request.method().toUpperCase()
      if (url.protocol === 'data:' || url.protocol === 'blob:') { await route.continue(); return }
      if (!['http:', 'https:'].includes(url.protocol)) {
        const blocked = { method, address: safeAddress(url.href), reason: 'unknown browser protocol blocked' }
        report.blockedHttp.push(blocked)
        await route.abort('blockedbyclient')
        return
      }
      if (url.origin !== origin) {
        report.blockedHttp.push({ method, address: safeAddress(url.href), reason: 'off-origin HTTP blocked' })
        await route.abort('blockedbyclient')
        return
      }
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) { await route.continue(); return }

      if (method === 'POST' && url.pathname === exactExecutionSyncPath) {
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
          const blocked = { method, path: url.pathname, body,
            reason: 'Only the original no-override execution projection sync for this exact Main Canvas is allowed.' }
          report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
          await route.abort('blockedbyclient')
          return
        }
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
        const receipt = { method, path: url.pathname, status: response.status(), body,
          providerExecutionStarted: payload?.code === 0 ? payload.data?.provider_execution_started : undefined,
          response: payload, producer: 'original NativeCanvas/HostLifecycleReconciler mount sync' }
        report.executionProjectionSyncs.push(receipt)
        report.browserWrites.push(receipt)
        if (response.status() !== 200 || payload?.code !== 0 || payload.data?.provider_execution_started !== false) {
          report.unexpectedWrites.push({ method, path: url.pathname, status: response.status(), body,
            reason: 'The original empty execution sync must succeed without provider execution.' })
        }
        await route.fulfill({ response, body: text })
        return
      }

      const executionSyncMatch = /^\/api\/lcos\/canvases\/([^/]+)\/execution:reconcile$/.exec(url.pathname)
      if (method === 'POST' && executionSyncMatch) {
        const canvasId = decodeURIComponent(executionSyncMatch[1] ?? '')
        const knownCanvasIds = new Set([...canvasBaselinesById.keys()])
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        if (!knownCanvasIds.has(canvasId) || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
          const blocked = { method, path: url.pathname, body,
            reason: 'Only an empty original execution projection sync for one of this project’s three Core-declared canvases is allowed.' }
          report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
          await route.abort('blockedbyclient')
          return
        }
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
        const receipt = { method, path: url.pathname, canvasId, status: response.status(), body,
          providerExecutionStarted: payload?.code === 0 ? payload.data?.provider_execution_started : undefined,
          response: payload, producer: 'original Canvas/HostLifecycleReconciler mount sync' }
        report.executionProjectionSyncs.push(receipt)
        report.browserWrites.push(receipt)
        if (response.status() !== 200 || payload?.code !== 0 || payload.data?.provider_execution_started !== false) {
          report.unexpectedWrites.push({ method, path: url.pathname, canvasId, status: response.status(), body,
            reason: 'The original empty execution sync must succeed without provider execution.' })
        }
        await route.fulfill({ response, body: text })
        return
      }

      if (method === 'POST' && url.pathname === '/api/agent-gateway/v1/conversations/suggestions/dynamic') {
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        const exact = canvasBaselinesById.has(String(body?.canvas_id ?? '')) && body?.count === 5 && body?.mode === 'mixed'
        if (!exact) {
          const blocked = { method, path: url.pathname, body,
            reason: 'Dynamic suggestions request escaped the known current-Canvas read-only UI request.' }
          report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
          await route.abort('blockedbyclient')
          return
        }
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
        report.knownBlockedUnsupported ??= []
        report.knownBlockedUnsupported.push({ method, path: url.pathname, canvasId: body.canvas_id,
          status: response.status(), body, response: payload })
        if (response.status() !== 501) report.unexpectedWrites.push({ method, path: url.pathname,
          status: response.status(), reason: 'Known fixture endpoint should report its actual unsupported status; suggestions are never synthesized.' })
        await route.fulfill({ response, body: text })
        return
      }

      const exactMemberPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`
      if ((method === 'POST' || method === 'DELETE') && url.pathname === exactMemberPath) {
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        const exact = verifyMembers && body && Object.keys(body).sort().join(',') === 'memberId,memberType'
          && body.memberType === 'artifact' && body.memberId === collectionMember.id
          && (method === 'DELETE' && membershipPhase === 'remove' && membershipRemoveCount === 0
            || method === 'POST' && membershipPhase === 'add' && membershipAddCount === 0)
        if (!exact) {
          const blocked = { method, path: url.pathname, body, reason: 'Only one explicitly gestured removal and one exact Assembly carry add-back of this fixture text member are permitted.' }
          report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
          await route.abort('blockedbyclient'); return
        }
        if (method === 'DELETE') membershipRemoveCount += 1
        else membershipAddCount += 1
        const response = await route.fetch()
        const text = await response.text()
        const payload = JSON.parse(text)
        const value = payload?.value
        assert.equal(response.status(), 200)
        assert.equal(payload.ok, true)
        assert.equal(value.collectionId, collectionId)
        assert.deepEqual(value.memberRef, collectionMember)
        assert.ok(method === 'DELETE' ? ['removed', 'not-member'].includes(value.status) : ['applied', 'already-member'].includes(value.status))
        const receipt = { method, path: url.pathname, request: body, status: response.status(), response: payload,
          producer: method === 'DELETE' ? 'original CollectionMembersMenu / removeCollectionMember' : 'original Assembly carry / DropCommitRouter / CoreCollectionClient.addMember' }
        report.membershipVerification.writes.push(receipt); report.browserWrites.push(receipt)
        if (method === 'DELETE' && loseMemberReply) {
          report.membershipVerification.faults.push({ phase: 'after-original-Core-removal-committed', kind: 'lost-reply', noReplayAllowed: true })
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false,
            error: { code: 'SYNTHETIC_LOST_MEMBERSHIP_REPLY', message: 'Test-only lost response after canonical removal; re-read, never replay.' } }) })
        } else await route.fulfill({ response, body: text })
        return
      }

      if (method === 'POST' && url.pathname === exactAssemblyApplyPath) {
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        const exact = writeGate === 'pointer-release' && coreApplyCount === 0
          && body?.schemaVersion === 1 && body.projectId === projectId
          && stableJson(body.targetRef) === stableJson(targetRef)
          && Array.isArray(body.sourceRefs) && body.sourceRefs.length === 1
          && body.sourceRefs[0]?.kind === 'collection' && body.sourceRefs[0]?.id === collectionId
          && Object.keys(body).sort().join(',') === 'placementBySource,projectId,schemaVersion,sourceRefs,targetRef'
          && Object.keys(body.placementBySource ?? {}).join(',') === collectionId
          && Object.keys(body.placementBySource[collectionId] ?? {}).sort().join(',') === 'x,y'
          && samePosition(body.placementBySource[collectionId], expectedDropPoint?.worldPosition, 0.000001)
        if (!exact) {
          const blocked = { method, path: url.pathname, body,
            reason: 'Only one exact current-project Collection AssemblyApply to the selected Core surface is permitted after the real receiver preview.' }
          report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
          await route.abort('blockedbyclient')
          return
        }
        coreApplyCount += 1
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
        coreApplyReceipt = { status: response.status(), request: body, payload }
        report.browserWrites.push({ method, path: url.pathname, status: response.status(), request: body,
          response: payload, producer: 'original CoreAssemblyClient.apply from Assembly carry release' })
        const value = payload?.ok === true ? payload.value : undefined
        const collectionRows = value?.results?.filter((row) => row.sourceRef?.kind === 'collection' && row.sourceRef.id === collectionId) ?? []
        if (response.status() === 200 && payload?.ok === true && collectionRows.length === 1
          && (collectionRows[0].status === 'applied' && collectionRows[0].channel === 'presentation-membership'
            || collectionRows[0].status === 'skipped' && collectionRows[0].channel === 'already-member')) {
          assert.equal(collectionRows[0].presentationId, targetPresentationId,
            'Core Apply must acknowledge the exact target surface Presentation ID derived from the selected Core Workspace scope.')
          collectionProjectSeen = true
          report.coreApplyPositive = { projectId, targetRef: body.targetRef, sourceRef: body.sourceRefs[0],
            itemReceipt: collectionRows[0], status: response.status(), expectedPresentationId: targetPresentationId }
        }
        await route.fulfill({ response, body: text })
        return
      }

      if (method === 'POST' && url.pathname === exactCollectionProjectPath) {
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        const exact = collectionProjectSeen && collectionProjectCount === 0
          && Object.keys(body ?? {}).join(',') === 'collectionId' && body.collectionId === collectionId
        if (!exact) {
          const blocked = { method, path: url.pathname, body,
            reason: 'Only one original projection of the exact positive Assembly-received Collection is permitted.' }
          report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
          await route.abort('blockedbyclient')
          return
        }
        collectionProjectCount += 1
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
        collectionProjectReceipt = { status: response.status(), request: body, payload }
        report.browserWrites.push({ method, path: url.pathname, status: response.status(), request: body,
          response: payload, producer: 'original collection projection/binding route after positive Core receipt' })
        const value = payload?.code === 0 ? payload.data : undefined
        const binding = value?.binding
        const node = value?.node
        const ref = node?.data?.lcos_collection_ref
        assert.equal(response.status(), 200)
        assert.equal(value?.canvas_id, String(mainWorkspace.canvasId))
        assert.equal(value?.workspace_id, String(mainWorkspace.id))
        assert.equal(value?.collection_id, collectionId)
        assert.equal(value?.provider_execution_started, false)
        assert.equal(binding?.projectId, projectId)
        assert.equal(binding?.canvasId, String(mainWorkspace.canvasId))
        assert.equal(binding?.entityType, 'collection')
        assert.equal(binding?.entityId, collectionId)
        assert.equal(binding?.spatialKind, 'node')
        assert.equal(node?.id, binding?.spatialId)
        assert.equal(node?.type, 'lcos-collection')
        assert.equal(node?.canvas_id, String(mainWorkspace.canvasId))
        assert.equal(ref?.projectId, projectId)
        assert.equal(ref?.canvasId, String(mainWorkspace.canvasId))
        assert.equal(ref?.workspaceId, String(mainWorkspace.id))
        assert.equal(ref?.collectionId, collectionId)
        collectionNodeId = String(node.id)
        expectedProjectionPosition = { ...node.position }
        await route.fulfill({ response, body: text })
        return
      }

      const spatialBatchMatch = /^\/api\/canvas\/v1\/canvases\/([^/]+)\/nodes:batchActions$/.exec(url.pathname)
      if (method === 'POST' && spatialBatchMatch) {
        const batchCanvasId = decodeURIComponent(spatialBatchMatch[1] ?? '')
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        const action = body?.actions?.length === 1 ? body.actions[0] : undefined
        const updates = action?.action === 'update' && Array.isArray(action.updates) ? action.updates : undefined

        if (expectedSpatialPhase === 'before-drop' && collectionProjectCount === 0) {
          const baselineCanvas = canvasBaselinesById.get(batchCanvasId)
          const beforeById = new Map((baselineCanvas?.nodes ?? []).map((node) => [String(node.id), node]))
          const revisionMap = body?.lcos_expected_revisions
          const revisionsSafe = revisionMap === undefined || revisionMap !== null
            && typeof revisionMap === 'object' && !Array.isArray(revisionMap)
            && Object.entries(revisionMap).every(([nodeId, revisionId]) => {
              const before = beforeById.get(nodeId)
              return before !== undefined && typeof revisionId === 'string' && before.lcos_revision_id === revisionId
            })
          const seenIds = new Set()
          const exactInitialSync = baselineCanvas !== undefined && body?.canvas_id === batchCanvasId
            && Array.isArray(body.actions) && body.actions.length === 1
            && Object.keys(body).every((key) => ['canvas_id', 'actions', 'created_by_role', 'lcos_expected_revisions'].includes(key))
            && (body.created_by_role === undefined || body.created_by_role === 'user')
            && revisionsSafe && updates?.length > 0
            && updates.every((candidate) => {
              const before = beforeById.get(String(candidate?.id ?? ''))
              const measured = candidate?.measured
              const allowedKeys = new Set(['id', 'type', 'data', 'position', 'measured'])
              const uniqueId = !seenIds.has(String(candidate?.id ?? ''))
              seenIds.add(String(candidate?.id ?? ''))
              return before !== undefined && uniqueId
                && Object.keys(candidate ?? {}).every((key) => allowedKeys.has(key))
                && (candidate.type === undefined || candidate.type === before.type)
                && (candidate.data === undefined || stableJson(candidate.data) === stableJson(before.data))
                && (candidate.position === undefined || stableJson(candidate.position) === stableJson(before.position))
                && measured !== undefined && Number.isFinite(measured.width) && Number.isFinite(measured.height)
                && measured.width > 0 && measured.height > 0 && measured.width <= 4096 && measured.height <= 4096
            })
          if (!exactInitialSync) {
            const blocked = { method, path: url.pathname, body,
              reason: 'Only exact existing-node measured-size syncs with identity/data/position unchanged are allowed before collection placement.' }
            report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
            await route.abort('blockedbyclient')
            return
          }
          initialSpatialSyncBatchCount += 1
          const response = await route.fetch()
          const text = await response.text()
          let payload
          try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
          const sync = { status: response.status(), canvasId: batchCanvasId,
            surface: workspaces.find((workspace) => String(workspace.canvasId) === batchCanvasId)?.preferredSurface ?? null,
            nodeIds: updates.map((update) => String(update.id)),
            measured: updates.map((update) => ({ id: String(update.id), ...update.measured })),
            dataAndPositionUnchanged: true, body, response: payload,
            producer: 'original Canvas first measured-size persistence; no node/material identity or geometry change' }
          report.initialSpatialSynchronizations.push(sync)
          report.browserWrites.push({ method, path: url.pathname, ...sync })
          await route.fulfill({ response, body: text })
          assert.equal(response.status(), 200, 'Initial exact spatial measurement sync must save successfully.')
          const savedAfterMeasure = await appFacadeCall(`/api/canvas/v1/canvases/${encodeURIComponent(batchCanvasId)}`)
          assert.equal(savedAfterMeasure.id, batchCanvasId)
          assert.equal(savedAfterMeasure.nodes.length, baselineCanvas.nodes.length,
            'Initial geometry sync must not create or delete Canvas nodes.')
          const updatedById = new Map(updates.map((update) => [String(update.id), update]))
          for (const before of baselineCanvas.nodes) {
            const saved = savedAfterMeasure.nodes.find((node) => String(node.id) === String(before.id))
            assert.ok(saved, `Initial measurement sync removed node ${before.id}.`)
            assert.equal(saved.type, before.type)
            assert.deepEqual(saved.position, before.position)
            assert.deepEqual(saved.data, before.data)
            assert.equal(saved.parentId ?? null, before.parentId ?? null)
            assert.equal(saved.selected === true, before.selected === true)
            const requestedMeasure = updatedById.get(String(before.id))?.measured
            if (requestedMeasure) assert.deepEqual(saved.measured, requestedMeasure)
            else assert.deepEqual(saved.measured ?? null, before.measured ?? null)
          }
          canvasBaselinesById.set(batchCanvasId, savedAfterMeasure)
          if (batchCanvasId === String(mainWorkspace.canvasId)) fixtureCanvasBefore = savedAfterMeasure
          sync.persistedCanvas = canvasFingerprint(savedAfterMeasure)
          return
        }

        if (batchCanvasId !== String(mainWorkspace.canvasId)) {
          const blocked = { method, path: url.pathname, body,
            reason: 'Outside measured-size initialization, only the selected target Canvas may receive the Collection carrier geometry.' }
          report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
          await route.abort('blockedbyclient')
          return
        }

        const update = updates?.length === 1 ? updates[0] : undefined
        const position = update?.position
        const ref = update?.data?.lcos_collection_ref
        const phaseTarget = expectedSpatialPhase === 'undo' ? expectedProjectionPosition
          : expectedSpatialPhase === 'redo' ? expectedDropPoint?.worldPosition
            : expectedSpatialPhase === 'drop' ? expectedDropPoint?.worldPosition : undefined
        const exactKeys = Object.keys(body ?? {}).every((key) => ['canvas_id', 'actions', 'created_by_role', 'lcos_expected_revisions'].includes(key))
          && body.canvas_id === String(mainWorkspace.canvasId)
          && (body.created_by_role === undefined || body.created_by_role === 'user')
          && updates?.length === 1 && update?.id === collectionNodeId
          && (update?.type === undefined || update.type === 'lcos-collection')
          && (position === undefined || [position.x, position.y].every(Number.isFinite))
          && (update?.data === undefined || update.data?.id === collectionNodeId
            && update.data?.title === collectionTitle && ref?.projectId === projectId
            && ref?.canvasId === String(mainWorkspace.canvasId) && ref?.workspaceId === String(mainWorkspace.id)
            && ref?.collectionId === collectionId)
          && (update?.measured === undefined || [update.measured.width, update.measured.height].every(Number.isFinite)
            && update.measured.width > 0 && update.measured.height > 0 && update.measured.width <= 4096 && update.measured.height <= 4096)
          && phaseTarget !== undefined && samePosition(position, nativeSerializedPoint(phaseTarget), 0.000001)
          && expectedSpatialPhase !== 'before-drop'
        if (!exactKeys) {
          const blocked = { method, path: url.pathname, body,
            reason: `Canvas write did not match the one exact Collection carrier position in phase ${expectedSpatialPhase}.` }
          report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
          await route.abort('blockedbyclient')
          return
        }
        canvasBatchWrites += 1
        browserBatchCount += 1
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
        const receipt = { phase: expectedSpatialPhase, status: response.status(), nodeId: collectionNodeId,
          position: update.position ?? null, measured: update.measured ?? null,
          updatesCollectionData: update.data !== undefined, response: payload }
        browserBatchResponses.push(receipt)
        report.browserWrites.push({ method, path: url.pathname, ...receipt,
          producer: 'original NativeCanvas save queue after original O8 placement/undo/redo action' })
        await route.fulfill({ response, body: text })
        return
      }

      if (method === 'POST' && url.pathname === '/api/events') {
        let event
        try { event = request.postDataJSON() } catch { event = undefined }
        const allowedKinds = new Set(['diagnostics-installed', 'remote-fetch-attempt', 'remote-fetch-blocked',
          'http-failed', 'fetch-failed', 'csp-blocked', 'action-not-connected', 'request-rejected', 'page-error'])
        if (event?.source !== 'renderer' || typeof event.kind !== 'string' || !allowedKinds.has(event.kind)) {
          const blocked = { method, path: url.pathname, body: event, reason: 'unrecognized renderer telemetry payload' }
          report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
          await route.abort('blockedbyclient')
          return
        }
        const response = await route.fetch()
        report.diagnosticTelemetry.push({ kind: event.kind, detail: event.detail ?? null, status: response.status() })
        await route.fulfill({ response })
        return
      }

      const blocked = { method, path: url.pathname,
        reason: 'No write outside one exact Assembly Apply, its original Collection projection, and original same-node position saves is permitted.' }
      report.blockedWrites.push(blocked)
      if (!url.pathname.startsWith('/api/agent-gateway/')) report.unexpectedWrites.push(blocked)
      await route.abort('blockedbyclient')
    })

    if (typeof context.routeWebSocket === 'function') {
      await context.routeWebSocket('**/*', async (socketRoute) => {
        const address = new URL(socketRoute.url())
        const expectedProtocol = new URL(origin).protocol === 'https:' ? 'wss:' : 'ws:'
        if (address.protocol === expectedProtocol && address.host === new URL(origin).host) {
          await socketRoute.connect()
          return
        }
        report.blockedWebSockets.push(safeAddress(address.href))
        await socketRoute.close({ code: 1008, reason: 'off-origin WebSocket blocked by the isolated Collection test' })
      })
    } else report.browser.websocketInterception = 'installed Playwright has no routeWebSocket; page websocket events are recorded instead'

    page = await context.newPage()
    page.on('pageerror', (error) => report.pageErrors.push(String(error.stack ?? error.message).slice(0, 3000)))
    page.on('console', (message) => {
      if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 1800))
      else if (message.type() === 'warning' || message.type() === 'warn') report.consoleWarnings.push(message.text().slice(0, 1200))
    })
    page.on('requestfailed', (request) => report.requestFailures.push({ method: request.method(), path: safePath(request.url()),
      error: request.failure()?.errorText ?? 'request failed' }))
    page.on('request', (request) => report.browserRequests.push({ method: request.method(), path: safePath(request.url()), status: 'requested' }))
    page.on('websocket', (socket) => report.browserWebSockets?.push?.(safeAddress(socket.url())))
    page.on('response', (response) => {
      const url = new URL(response.url())
      if (url.origin !== origin) return
      const matching = [...report.browserRequests].reverse().find((row) => row.status === 'requested' && row.path === safePath(response.url()))
      if (matching) matching.status = response.status()
      if (response.status() >= 400) report.apiFailures.push({ method: response.request().method(), path: safePath(response.url()),
        status: response.status(), classification: 'HTTP/API failure retained independently; not suppressed by target-flow outcome' })
    })

    const status = await appFacadeCall('/api/surface-core/status')
    const currentSurface = status?.surfaces?.find((surface) => surface.preferredSurface === mainSurfaceKey)
    assert.equal(status?.projectId, projectId)
    assert.equal(String(currentSurface?.canvasId), String(sourceMainWorkspace.canvasId))
    assert.equal(String(currentSurface?.workspaceId), String(sourceMainWorkspace.id))
    report.deployedIdentity = { projectId: status.projectId, sourceMain: currentSurface,
      selectedTarget: status.surfaces?.find((surface) => surface.preferredSurface === surfaceArgument) ?? null }
    const savedBefore = await appFacadeCall(`/api/canvas/v1/canvases/${encodeURIComponent(sourceMainWorkspace.canvasId)}`)
    assert.equal(savedBefore.id, String(sourceMainWorkspace.canvasId))
    assert.deepEqual(savedBefore.nodes.map((node) => nodeFingerprint(node)), mainCanvasBefore.nodes.map((node) => nodeFingerprint(node)),
      'Disposable source Main Canvas after official launch must match its exact prelaunch state.')
    addStep('fresh official runtime owns only the disposable Main Canvas and fixture', {
      canvasId: String(sourceMainWorkspace.canvasId), workspaceId: String(sourceMainWorkspace.id),
      nodeCount: savedBefore.nodes.length, oneCanvasOnlyInScope: true, noLiveRuntime: true,
    })

    await page.goto(`${origin}/canvas/${encodeURIComponent(sourceMainWorkspace.canvasId)}`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api?.getNodes, null, { timeout: 30000 })
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 })
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 30000 })
    await page.waitForFunction((name) => document.title.includes(name), currentSurface.name, { timeout: 30000 })
    assert.equal(await page.locator('.react-flow').count(), 1)
    const agentPanel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (await agentPanel.isVisible()) {
      await agentPanel.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
      await agentPanel.waitFor({ state: 'detached', timeout: 10000 })
    }
    report.pageIdentity = { url: page.url(), title: await page.title(), routeCanvasId: String(sourceMainWorkspace.canvasId),
      documentReadyState: await page.evaluate(() => document.readyState), reactFlowRoots: await page.locator('.react-flow').count(),
      surfaceState: await page.locator('[data-lcos-professional-surface-state]').getAttribute('data-lcos-professional-surface-state') }
    assert.equal(new URL(page.url()).origin, origin)
    assert.equal(new URL(page.url()).pathname, `/canvas/${encodeURIComponent(sourceMainWorkspace.canvasId)}`)
    await saveScreenshot('01-main-canvas-before')

    const glythNode = mainCanvasBefore.nodes.find((node) => node.type === 'lcos-conversation'
      && node.data?.lcos_conversation_ref?.connectedConversationId === conversationId)
    assert.ok(glythNode, 'The original manually-linked conversation projection must appear on this one Main Canvas.')
    const glyth = page.locator(`.react-flow__node[data-id="${String(glythNode.id).replaceAll('"', '\\"')}"]`)
    await glyth.waitFor({ state: 'visible', timeout: 20000 })
    const workButton = glyth.locator('button[aria-haspopup="dialog"]')
    await workButton.waitFor({ state: 'visible', timeout: 10000 })
    await workButton.click()
    const workView = page.locator(`[data-lcos-window-body="conversation"][data-lcos-window-target="${conversationId}"]`)
    await workView.waitFor({ state: 'visible', timeout: 20000 })
    await page.getByRole('button', { name: '打开 Assembly', exact: true }).click()
    const assemblyBody = page.locator('[data-lcos-window-body="assembly"]')
    await assemblyBody.waitFor({ state: 'visible', timeout: 20000 })
    const workPane = workView.locator('xpath=ancestor::*[@data-lcos-window-pane][1]')
    if (await workPane.count()) {
      const closeWorkView = workPane.getByRole('button', { name: '关闭窗口', exact: true })
      if (await closeWorkView.count() && await closeWorkView.isVisible()) await closeWorkView.click()
    }
    await workView.waitFor({ state: 'hidden', timeout: 10000 })
    assert.equal(await page.locator('.react-flow').count(), 1)

    if (surfaceArgument !== mainSurfaceKey) {
      const surfaceButton = page.locator(`[data-lcos-surface="${surfaceArgument}"]`)
      await surfaceButton.waitFor({ state: 'visible', timeout: 15000 })
      assert.equal(await surfaceButton.getAttribute('aria-pressed'), 'false',
        `The original Dock must show ${surfaceArgument} as not-yet-selected before the user click.`)
      await surfaceButton.click()
      await page.waitForFunction(({ canvasId, surface }) => {
        const dock = document.querySelector(`[data-lcos-surface="${CSS.escape(surface)}"]`)
        const stateElement = document.querySelector('[data-lcos-professional-surface-state]')
        const state = stateElement?.getAttribute('data-lcos-professional-surface-state')
        const message = stateElement?.textContent?.toLowerCase() ?? ''
        const nodeLab = window.__LCOS_NODE_LAB__
        return (nodeLab?.currentCanvasId ?? nodeLab?.canvasId) === canvasId
          && dock?.getAttribute('aria-pressed') === 'true' && state === 'ready' && message.includes(surface)
      }, { canvasId: String(targetWorkspace.canvasId), surface: surfaceArgument }, { timeout: 30000 })
      assert.equal(await page.locator('.react-flow').count(), 1,
        'Switching an original Surface through its Dock must keep the one TapNow ReactFlow root.')
    }

    const agentPanelAfterNavigation = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    const agentPanelWasVisibleAfterNavigation = await agentPanelAfterNavigation.isVisible()
    if (agentPanelWasVisibleAfterNavigation) {
      await agentPanelAfterNavigation.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
      await agentPanelAfterNavigation.waitFor({ state: 'detached', timeout: 10000 })
    }
    await assemblyBody.waitFor({ state: 'visible', timeout: 10000 })

    const selectedSurfaceStatus = await appFacadeCall('/api/surface-core/status')
    const selectedSurfaceRow = selectedSurfaceStatus?.surfaces?.find((surface) => surface.preferredSurface === surfaceArgument)
    assert.equal(selectedSurfaceStatus?.projectId, projectId)
    assert.equal(String(selectedSurfaceRow?.canvasId), String(targetWorkspace.canvasId))
    assert.equal(String(selectedSurfaceRow?.workspaceId), String(targetWorkspace.id))
    assert.equal(String(selectedSurfaceRow?.scopeId), String(targetWorkspace.scopeId))
    const shellLanding = await page.evaluate(async () =>
      (await import('/lcos/agent-ui.js')).inspectNativeCollectionLanding())
    assert.equal(shellLanding.canvasId, String(targetWorkspace.canvasId))
    assert.equal(shellLanding.canvasStatus, 'ready')
    assert.equal(shellLanding.projectId, projectId)
    assert.equal(shellLanding.activeSurface, surfaceArgument)
    assert.equal(shellLanding.workspaceId, String(targetWorkspace.id))
    assert.equal(shellLanding.activeSurfaceCanvasId, String(targetWorkspace.canvasId))
    assert.equal(shellLanding.placementHostReady, true)
    const targetCanvasAfterOpen = await appFacadeCall(`/api/canvas/v1/canvases/${encodeURIComponent(targetWorkspace.canvasId)}`)
    assert.equal(targetCanvasAfterOpen.id, String(targetWorkspace.canvasId))
    assert.deepEqual(canvasFingerprint(targetCanvasAfterOpen),
      canvasFingerprint(canvasBaselinesById.get(String(targetWorkspace.canvasId))),
      'Opening the target surface must not silently change its Canvas beyond the exact measured-size sync owner.')
    fixtureCanvasBefore = targetCanvasAfterOpen
    canvasBaselinesById.set(String(targetWorkspace.canvasId), targetCanvasAfterOpen)
    report.targetNavigation = { selector: `[data-lcos-surface="${surfaceArgument}"]`, clicked: surfaceArgument !== mainSurfaceKey,
      sourceCanvasId: String(sourceMainWorkspace.canvasId), currentCanvasId: String(targetWorkspace.canvasId),
      currentWorkspaceId: String(targetWorkspace.id), currentScopeId: String(targetWorkspace.scopeId),
      routeUrl: page.url(), title: await page.title(), surfaceState: await page.locator('[data-lcos-professional-surface-state]')
        .getAttribute('data-lcos-professional-surface-state'), oneReactFlow: true,
      surfaceButtonPressed: await page.locator(`[data-lcos-surface="${surfaceArgument}"]`).getAttribute('aria-pressed'),
      agentPanelWasVisibleAfterNavigation, agentPanelClosed: !await agentPanelAfterNavigation.isVisible(), shellLanding }
    await saveScreenshot(`02-${surfaceArgument}-canvas-with-original-assembly`)

    canvasesBeforeCarry = await readAllCanvases()
    for (const workspace of workspaces) {
      const canvasId = String(workspace.canvasId)
      const expected = canvasBaselinesById.get(canvasId)
      const actual = canvasesBeforeCarry[workspace.preferredSurface]
      assert.ok(expected && actual, `Missing Core Canvas baseline for ${workspace.preferredSurface}.`)
      assert.deepEqual(canvasFingerprint(actual), canvasFingerprint(expected),
        `${workspace.preferredSurface} Canvas must be at its post-open baseline before the collection carry.`)
    }
    presentationsBeforeCarry = await appCoreCall(`/projects/${encodeURIComponent(projectId)}/presentations`)
    assert.deepEqual(presentationsBeforeCarry, presentationBefore,
      'Navigating the original Dock must not mutate any Core Presentation before the Collection carry.')
    report.operationBaseline = { targetSurface: surfaceArgument,
      canvases: Object.fromEntries(Object.entries(canvasesBeforeCarry).map(([surface, canvas]) => [surface, canvasFingerprint(canvas)])),
      presentations: presentationsBeforeCarry, otherSurfaceCanvasesReadOnly: true }

    const collectionCard = assemblyBody.locator(`[data-lcos-assembly-item="${collectionId}"]`)
    await collectionCard.waitFor({ state: 'visible', timeout: 20000 })
    assert.equal(await collectionCard.getAttribute('data-lcos-assembly-item-kind'), 'collection')
    assert.ok((await collectionCard.innerText()).includes(collectionTitle))
    const genericApply = collectionCard.locator('[data-lcos-assembly-drop]')
    assert.equal(await genericApply.count(), 0,
      'The Collection keeps the existing generic Apply guard; the tested path must be the original hand-carry, not a button.')
    const carryHandle = collectionCard.locator('[data-semantic-drop-handle]')
    await carryHandle.waitFor({ state: 'attached', timeout: 10000 })
    await collectionCard.hover()
    await carryHandle.waitFor({ state: 'visible', timeout: 10000 })
    const handleEvidence = await carryHandle.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
      const hit = document.elementFromPoint(x, y)
      return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        ariaLabel: element.getAttribute('aria-label'), opacity: style.opacity, pointerEvents: style.pointerEvents,
        disabled: element.disabled, centerHitHandle: !!hit && (hit === element || element.contains(hit)),
        hitTag: hit?.tagName ?? null }
    })
    assert.ok(handleEvidence.rect.width > 0 && handleEvidence.rect.height > 0)
    assert.notEqual(handleEvidence.pointerEvents, 'none')
    assert.equal(handleEvidence.disabled, false)
    assert.equal(handleEvidence.centerHitHandle, true, 'The actual visible original Assembly handle must own its center hit point.')
    report.sourceHandle = { selector: '[data-lcos-assembly-item][data-lcos-assembly-item-kind="collection"] [data-semantic-drop-handle]',
      collectionId, label: handleEvidence.ariaLabel,
      assemblyPanelTargetAtCarry: await assemblyBody.getAttribute('data-lcos-assembly-target'), ...handleEvidence }

    const targetScan = await page.evaluate(() => {
      const root = document.querySelector('.react-flow')
      if (!root) return { error: 'original TapNow ReactFlow root is missing' }
      const rect = root.getBoundingClientRect()
      const xFractions = [0.22, 0.35, 0.48, 0.62, 0.75, 0.86]
      const yFractions = [0.22, 0.36, 0.5, 0.64, 0.78]
      const candidates = []
      for (const fy of yFractions) for (const fx of xFractions) {
        // Physical pointer events quantize fractional CSS client coordinates.
        // Use an exposed whole pixel so the measured event and our independent
        // native screenToFlowPosition witness describe exactly the same point.
        const x = Math.round(Math.max(1, Math.min(innerWidth - 2, rect.left + rect.width * fx)))
        const y = Math.round(Math.max(1, Math.min(innerHeight - 2, rect.top + rect.height * fy)))
        const hits = document.elementsFromPoint(x, y)
        const front = hits.find((element) => element.closest('.react-flow__node.dragging,[data-lcos-native-drop-source],[data-lcos-native-drop-pending]') === null)
        const node = front?.closest('.react-flow__node')
        const insideCanvas = !!front && root.contains(front)
        const blankFlowSurface = insideCanvas && !node && !front.closest('[data-lcos-window-pane]')
          && (front.matches('.react-flow,.react-flow__pane,.react-flow__viewport')
            || !!front.closest('.react-flow__pane,.react-flow__viewport'))
        candidates.push({ x, y, insideCanvas, blankFlowSurface, hitCount: hits.length,
          front: front ? { tag: front.tagName, className: typeof front.className === 'string' ? front.className : '',
            nodeId: node?.getAttribute('data-id') ?? null, insideWindow: !!front.closest('[data-lcos-window-pane]') } : null })
      }
      return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        viewport: { width: innerWidth, height: innerHeight }, candidates }
    })
    const exposedBlank = targetScan.candidates?.find((point) => point.blankFlowSurface)
    assert.ok(exposedBlank, `No real blank original Canvas hit point was exposed around current windows/nodes: ${JSON.stringify(targetScan)}`)
    expectedDropPoint = { x: exposedBlank.x, y: exposedBlank.y }
    expectedWorldPoint = await page.evaluate((point) => window.__LCOS_NODE_LAB__.api.screenToFlowPosition(point), expectedDropPoint)
    expectedDropPoint.worldPosition = expectedWorldPoint
    assert.ok(expectedWorldPoint && Number.isFinite(expectedWorldPoint.x) && Number.isFinite(expectedWorldPoint.y))
    report.receiver = { kind: 'original Canvas semantic receiver', selector: '.react-flow',
      surface: surfaceArgument, targetRef, canvasId: String(mainWorkspace.canvasId), workspaceId: String(mainWorkspace.id),
      scopeId: String(mainWorkspace.scopeId), targetId: `canvas:${projectId}:${mainWorkspace.canvasId}:${surfaceArgument}:${mainWorkspace.id}`,
      scan: targetScan, chosenExposedPoint: expectedDropPoint, nativeApiScreenToFlowPosition: expectedWorldPoint }
    await saveScreenshot(`03-${surfaceArgument}-original-assembly-and-canvas`)

    const beforeGesture = await page.evaluate((canvasId) => {
      const api = window.__LCOS_NODE_LAB__.api
      return { canvasId: window.__LCOS_NODE_LAB__.currentCanvasId ?? window.__LCOS_NODE_LAB__.canvasId,
        viewport: api.getViewport(), selection: api.getSelection(), nodes: api.getNodes().map((node) => ({ id: node.id,
          type: node.type, position: node.position, parentId: node.parentId ?? null, selected: node.selected === true,
          data: node.data, measured: node.measured ?? null })),
        history: api.inspectNativeHistory({ canvasId, nodeId: 'collection-projection-before-carrier' }) }
    }, String(mainWorkspace.canvasId))
    assert.equal(beforeGesture.canvasId, String(mainWorkspace.canvasId))
    assert.equal(beforeGesture.history.ok, true)
    report.beforeGesture = beforeGesture

    const handleBox = handleEvidence.rect
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    writeGate = 'pointer-release'
    expectedSpatialPhase = 'drop'
    await page.mouse.move(expectedDropPoint.x, expectedDropPoint.y, { steps: 18 })
    const preview = page.locator('[data-lcos-drop-preview][data-presentation="preview"]')
    await preview.waitFor({ state: 'visible', timeout: 15000 })
    const previewText = await preview.innerText()
    assert.ok(previewText.toLowerCase().includes(surfaceArgument),
      `The original receiver preview did not identify the selected ${surfaceArgument} target: ${previewText}`)
    assert.equal(coreApplyCount, 0, 'Core Apply must not be sent until the original pointer is released.')
    report.pointerEvidence.push({ phase: 'preview-before-release', source: report.sourceHandle, destination: expectedDropPoint,
      previewText, observedProductionHitTests: await page.evaluate(() => (window.__lcosNativeCanvasHitTests ?? []).slice(-100)) })
    await saveScreenshot('03-original-carry-preview-before-release')

    const applyResponsePromise = page.waitForResponse((response) => {
      const request = response.request(), url = new URL(response.url())
      return url.origin === origin && url.pathname === exactAssemblyApplyPath && request.method() === 'POST'
    }, { timeout: 25000 })
    const collectionProjectResponsePromise = page.waitForResponse((response) => {
      const request = response.request(), url = new URL(response.url())
      return url.origin === origin && url.pathname === exactCollectionProjectPath && request.method() === 'POST'
    }, { timeout: 30000 })
    const collectionBatchResponsePromise = page.waitForResponse((response) => {
      const request = response.request(), url = new URL(response.url())
      return url.origin === origin && url.pathname === exactBatchPath && request.method() === 'POST'
        && (() => { try { const body = request.postDataJSON(); return body?.actions?.[0]?.updates?.some((update) => update?.type === 'lcos-collection' || update?.id === collectionNodeId) } catch { return false } })()
    }, { timeout: 30000 })
    // Register rejection observers immediately. If an earlier assertion fails,
    // closing the page in finally must not turn the other outstanding waits
    // into an unhandled rejection that interrupts evidence/owned cleanup.
    void applyResponsePromise.catch(() => {})
    void collectionProjectResponsePromise.catch(() => {})
    void collectionBatchResponsePromise.catch(() => {})
    await page.mouse.up()
    const applyResponse = await applyResponsePromise
    const applyPayload = await applyResponse.json()
    assert.equal(applyResponse.status(), 200)
    assert.equal(applyPayload?.ok, true, JSON.stringify(applyPayload))
    assert.equal(coreApplyCount, 1, 'Exactly one real Core Assembly Apply may follow the original pointer release.')
    const applyRow = applyPayload.value?.results?.find((row) => row.sourceRef?.kind === 'collection' && row.sourceRef.id === collectionId)
    assert.ok(applyRow, 'Core positive receipt omitted the exact manual Collection source row.')
    assert.ok((applyRow.status === 'applied' && applyRow.channel === 'presentation-membership')
      || (applyRow.status === 'skipped' && applyRow.channel === 'already-member'),
    `Core did not confirm Collection presentation membership: ${JSON.stringify(applyRow)}`)
    assert.equal(applyRow.presentationId, targetPresentationId,
      'Collection membership receipt must identify this surface’s exact canonical Core Presentation.')
    report.coreApplyReceipt = coreApplyReceipt
    report.landingAfterCoreApply = await page.evaluate(async () =>
      (await import('/lcos/agent-ui.js')).inspectNativeCollectionLanding())
    const placementFailure = page.waitForFunction(() => {
      const element = document.querySelector('[data-lcos-drop-receipt][data-status]')
      const status = element?.getAttribute('data-status')
      return status === 'partial' || status === 'failed' ? { status, text: element.textContent } : false
    }, null, { timeout: 30000 }).then(async (handle) => {
      report.dropReceipt = await handle.jsonValue()
      throw new Error(`Original placement receipt is not complete: ${JSON.stringify(report.dropReceipt)}`)
    })
    void placementFailure.catch(() => {})

    const projectionResponse = await Promise.race([collectionProjectResponsePromise, placementFailure])
    assert.equal(projectionResponse.status(), 200)
    assert.ok(collectionProjectReceipt?.payload?.data?.node?.id)
    assert.equal(collectionProjectCount, 1)
    assert.ok(expectedProjectionPosition)
    const batchResponse = await Promise.race([collectionBatchResponsePromise, placementFailure])
    assert.equal(batchResponse.status(), 200)
    const dropReceipt = page.locator('[data-lcos-drop-receipt][data-status]')
    await page.waitForFunction(() => {
      const receipt = document.querySelector('[data-lcos-drop-receipt][data-status]')
      return ['success', 'partial', 'failed'].includes(receipt?.getAttribute('data-status') ?? '')
    }, null, { timeout: 20000 })
    const receiptStatus = await dropReceipt.getAttribute('data-status')
    const receiptText = await dropReceipt.innerText()
    report.dropReceipt = { status: receiptStatus, text: receiptText }
    assert.equal(receiptStatus, 'success', `Original pointer drop did not finish successfully: ${receiptText}`)
    assert.equal(collectionNodeId, String(collectionProjectReceipt.payload.data.node.id))
    assert.equal(browserBatchCount, 1,
      'The drop should persist one position update through the original native Canvas queue, not a second carrier/create batch.')
    expectedSpatialPhase = 'after-drop'

    const nodeLocator = page.locator(`[data-lcos-native-collection-node="${collectionNodeId}"][data-lcos-native-collection-availability="ready"]`)
    await nodeLocator.waitFor({ state: 'visible', timeout: 20000 })
    const canonicalFace = nodeLocator.locator(`[data-lcos-canonical-collection="${collectionId}"]`)
    await canonicalFace.waitFor({ state: 'visible', timeout: 15000 })
    await page.waitForFunction((id) => document.querySelector(`[data-lcos-canonical-collection="${CSS.escape(id)}"]`)
      ?.getAttribute('data-member-read-status') === 'ready', collectionId, { timeout: 20000 })
    assert.equal(await canonicalFace.getAttribute('data-member-count'), String(expectedMemberCount))
    assert.equal(await canonicalFace.locator('[data-lcos-collection-members-open]').count(), 0,
      'The original member menu remains selection-driven; dropping a Collection does not select or open management.')
    await saveScreenshot('04-original-collection-node-after-placement')

    const persistedAfterDrop = await appFacadeCall(`/api/canvas/v1/canvases/${encodeURIComponent(mainWorkspace.canvasId)}`)
    const savedCollectionNode = persistedAfterDrop.nodes.find((node) => String(node.id) === collectionNodeId)
    assert.ok(savedCollectionNode)
    assert.equal(savedCollectionNode.type, 'lcos-collection')
    assert.deepEqual(savedCollectionNode.data.lcos_collection_ref, {
      projectId, canvasId: String(mainWorkspace.canvasId), workspaceId: String(mainWorkspace.id), collectionId,
    })
    assert.deepEqual(savedCollectionNode.position, nativeSerializedPoint(expectedWorldPoint),
      `Saved Canvas geometry must match the donor r6 two-decimal position serializer: saved=${JSON.stringify(savedCollectionNode.position)} expected=${JSON.stringify(nativeSerializedPoint(expectedWorldPoint))}`)
    const otherNodesAfterDrop = persistedAfterDrop.nodes.filter((node) => String(node.id) !== collectionNodeId)
    assert.deepEqual(otherNodesAfterDrop.map(nodeFingerprint), fixtureCanvasBefore.nodes.map(nodeFingerprint),
      'Collection placement must not change any pre-existing node identity/data/geometry/selection.')
    const presentationAfterDrop = await appCoreCall(`/projects/${encodeURIComponent(projectId)}/presentations`)
    const collectionPresentations = presentationAfterDrop.filter((row) => row.projectId === projectId
      && Array.isArray(row.state?.memberEntityRefs)
      && row.state.memberEntityRefs.some((ref) => ref.type === 'collection' && ref.id === collectionId))
    assert.equal(collectionPresentations.length, 1,
      'Core must contain exactly one canonical target Presentation membership for the Collection after the positive receipt.')
    assert.equal(collectionPresentations[0]?.id, targetPresentationId)
    const targetPresentationBefore = presentationsBeforeCarry.find((row) => row.id === targetPresentationId)
    const targetPresentationAfter = presentationAfterDrop.find((row) => row.id === targetPresentationId)
    assert.ok(targetPresentationAfter)
    const previousEntityRefs = targetPresentationBefore?.state?.memberEntityRefs ?? []
    assert.equal(previousEntityRefs.some((ref) => ref.type === 'collection' && ref.id === collectionId), false)
    const resultingEntityRefs = targetPresentationAfter.state.memberEntityRefs ?? []
    assert.equal(resultingEntityRefs.filter((ref) => ref.type === 'collection' && ref.id === collectionId).length, 1)
    const refKey = (ref) => `${String(ref.type)}:${String(ref.id)}`
    assert.deepEqual(resultingEntityRefs.filter((ref) => !(ref.type === 'collection' && ref.id === collectionId))
      .map(refKey).sort(), previousEntityRefs.map(refKey).sort(),
    'The selected canonical Presentation should gain only this Collection entity reference.')
    const omitEntityMembers = (state) => Object.fromEntries(Object.entries(state ?? {}).filter(([key]) => key !== 'memberEntityRefs'))
    const emptyTargetScaffold = { memberViewIds: [], hiddenViewIds: [], positions: {},
      hierarchy: { parentByViewId: {}, orderByParent: {} }, presentationEdges: [], pinnedViewIds: [], emphasisByViewId: {} }
    assert.deepEqual(omitEntityMembers(targetPresentationAfter.state),
      omitEntityMembers(targetPresentationBefore?.state ?? emptyTargetScaffold),
      'Target Presentation geometry/other state must remain unchanged; Collection membership is entity-only.')
    const unrelatedPresentationsBefore = presentationsBeforeCarry.filter((row) => row.id !== targetPresentationId)
    const unrelatedPresentationsAfter = presentationAfterDrop.filter((row) => row.id !== targetPresentationId)
    assert.deepEqual(unrelatedPresentationsAfter, unrelatedPresentationsBefore,
      'Core Presentations outside the exact target surface must remain unchanged.')
    const canvasesAfterDrop = await readAllCanvases()
    for (const workspace of workspaces.filter((row) => row.preferredSurface !== surfaceArgument)) {
      assert.deepEqual(canvasFingerprint(canvasesAfterDrop[workspace.preferredSurface]),
        canvasFingerprint(canvasesBeforeCarry[workspace.preferredSurface]),
        `Collection projection must not alter the other ${workspace.preferredSurface} Canvas.`)
    }
    const currentRunsAfterDrop = await appCoreCall(`/projects/${encodeURIComponent(projectId)}/runs`)
    assert.equal(currentRunsAfterDrop.length, runCountBefore.length, 'Assembly placement must not create or dispatch a Run.')
    if (verifyHistory) await page.waitForFunction(({ canvasId, id, target, previousPoint }) => {
      const api = window.__LCOS_NODE_LAB__?.api
      const history = api?.inspectNativeHistory({ canvasId, nodeId: id })
      const point = api?.getNode(id)?.position
      const recorded = history?.currentEntry?.nodes?.[0]?.position
      const previous = history?.undoTarget?.nodes?.[0]?.position
      return history?.ok && history.canUndo
        && history.currentIndex === history.historySize - 1 && history.currentEntry?.nodes?.length === 1
        && point && Math.abs(point.x - target.x) <= 0.000001 && Math.abs(point.y - target.y) <= 0.000001
        && recorded && Math.abs(recorded.x - target.x) <= 0.000001 && Math.abs(recorded.y - target.y) <= 0.000001
        && previous && Math.abs(previous.x - previousPoint.x) <= 0.000001 && Math.abs(previous.y - previousPoint.y) <= 0.000001
    }, { canvasId: String(mainWorkspace.canvasId), id: collectionNodeId,
      previousPoint: expectedProjectionPosition, target: expectedWorldPoint }, { timeout: 15000 })
    const nativeAfterDrop = await page.evaluate(({ canvasId, id }) => {
      const api = window.__LCOS_NODE_LAB__.api
      return { node: api.getNode(id), viewport: api.getViewport(), selection: api.getSelection(),
        history: api.inspectNativeHistory({ canvasId, nodeId: id }) }
    }, { canvasId: String(mainWorkspace.canvasId), id: collectionNodeId })
    assert.ok(nativeAfterDrop.history.ok, 'The original O8 owner must expose a read-only history diagnostic after placement.')
    report.afterDrop = { receiptStatus, receiptText, binding: collectionProjectReceipt.payload.data.binding,
      node: nodeFingerprint(savedCollectionNode), worldPointer: expectedWorldPoint,
      savedPosition: savedCollectionNode.position, persistedCanvas: canvasFingerprint(persistedAfterDrop),
      collectionPresentation: collectionPresentations[0], targetPresentationId,
      otherCanvasesUnchanged: true, unrelatedPresentationsUnchanged: true,
      collectionMemberRead: {
        status: await canonicalFace.getAttribute('data-member-read-status'),
        memberCount: await canonicalFace.getAttribute('data-member-count'),
      }, nativeCanvas: nativeAfterDrop,
      otherNodesUnchanged: true,
      cameraUnchanged: JSON.stringify(nativeAfterDrop.viewport) === JSON.stringify(beforeGesture.viewport),
      selectionUnchanged: JSON.stringify(nativeAfterDrop.selection) === JSON.stringify(beforeGesture.selection),
      runsUnchanged: true }
    addStep('real Assembly collection carry gets one positive Core membership receipt, original Collection node, one native geometry submission, and saved world position', {
      collectionId, nodeId: collectionNodeId, coreReceipt: applyRow, savedPosition: savedCollectionNode.position,
      memberReadStatus: report.afterDrop.collectionMemberRead.status,
    })

    if (verifyHistory) {
    const closeAssemblyPane = assemblyBody.locator('xpath=ancestor::*[@data-lcos-window-pane][1]')
      .getByRole('button', { name: '关闭窗口', exact: true })
    if (await closeAssemblyPane.count() && await closeAssemblyPane.isVisible()) await closeAssemblyPane.click()
    await assemblyBody.waitFor({ state: 'hidden', timeout: 10000 })
    const afterFocus = await page.evaluate(({ canvasId, id }) => {
      const api = window.__LCOS_NODE_LAB__.api
      return { viewport: api.getViewport(), selection: api.getSelection(),
        history: api.inspectNativeHistory({ canvasId, nodeId: id }),
        node: api.getNode(id) }
    }, { canvasId: String(mainWorkspace.canvasId), id: collectionNodeId })
    assert.deepEqual(afterFocus.viewport, nativeAfterDrop.viewport)
    assert.deepEqual(afterFocus.selection, nativeAfterDrop.selection)

    expectedSpatialPhase = 'undo'
    const undoSavePromise = page.waitForResponse((response) => {
      const request = response.request(), url = new URL(response.url())
      if (url.origin !== origin || url.pathname !== exactBatchPath || request.method() !== 'POST') return false
      try { return request.postDataJSON()?.actions?.[0]?.updates?.some((update) => update.id === collectionNodeId
        && samePosition(update.position, nativeSerializedPoint(expectedProjectionPosition), 0.000001)) } catch { return false }
    }, { timeout: 25000 })
    void undoSavePromise.catch(() => {})
    await page.keyboard.press('Control+z')
    await page.waitForFunction(({ id, target }) => {
      const position = window.__LCOS_NODE_LAB__?.api?.getNode(id)?.position
      return position && Math.abs(position.x - target.x) <= 0.02 && Math.abs(position.y - target.y) <= 0.02
    }, { id: collectionNodeId, target: expectedProjectionPosition }, { timeout: 15000 })
    const undoResponse = await undoSavePromise
    assert.equal(undoResponse.status(), 200)
    const undoSaved = await appFacadeCall(`/api/canvas/v1/canvases/${encodeURIComponent(mainWorkspace.canvasId)}`)
    const undoNode = undoSaved.nodes.find((node) => String(node.id) === collectionNodeId)
    assert.ok(undoNode && undoNode.type === 'lcos-collection')
    assert.deepEqual(undoNode.position, nativeSerializedPoint(expectedProjectionPosition))
    assert.deepEqual(undoNode.data.lcos_collection_ref, savedCollectionNode.data.lcos_collection_ref,
      'Original Canvas Undo must revert only the geometry, not remove/alter the canonical Collection binding.')
    assert.deepEqual(undoSaved.nodes.filter((node) => String(node.id) !== collectionNodeId).map(nodeFingerprint),
      fixtureCanvasBefore.nodes.map(nodeFingerprint))
    const nativeAfterUndo = await page.evaluate(({ canvasId, id }) => {
      const api = window.__LCOS_NODE_LAB__.api
      return { node: api.getNode(id), viewport: api.getViewport(), selection: api.getSelection(),
        history: api.inspectNativeHistory({ canvasId, nodeId: id }) }
    }, { canvasId: String(mainWorkspace.canvasId), id: collectionNodeId })
    assert.equal(nativeAfterUndo.history.historySize, nativeAfterDrop.history.historySize)
    assert.equal(nativeAfterUndo.history.currentIndex, nativeAfterDrop.history.currentIndex - 1)
    assert.equal(nativeAfterUndo.history.currentEntry.nodes.length, 1)
    assert.deepEqual(nativeAfterUndo.viewport, nativeAfterDrop.viewport)
    assert.deepEqual(nativeAfterUndo.selection, nativeAfterDrop.selection)
    report.afterUndo = { savedNode: nodeFingerprint(undoNode), nativeCanvas: nativeAfterUndo,
      otherNodesUnchanged: true, canonicalBindingRetained: true }
    await saveScreenshot('05-original-ctrl-z-position-only')
    addStep('Ctrl+Z uses the original TapNow O8 history and reverts only the new Collection carrier geometry', {
      nodeId: collectionNodeId, savedPosition: undoNode.position, canonicalRefRetained: true,
      historyIndex: nativeAfterUndo.history.currentIndex, historySize: nativeAfterUndo.history.historySize,
    })

    expectedSpatialPhase = 'redo'
    const redoSavePromise = page.waitForResponse((response) => {
      const request = response.request(), url = new URL(response.url())
      if (url.origin !== origin || url.pathname !== exactBatchPath || request.method() !== 'POST') return false
      try { return request.postDataJSON()?.actions?.[0]?.updates?.some((update) => update.id === collectionNodeId
        && samePosition(update.position, nativeSerializedPoint(expectedWorldPoint), 0.000001)) } catch { return false }
    }, { timeout: 25000 })
    void redoSavePromise.catch(() => {})
    await page.keyboard.press('Control+Shift+z')
    await page.waitForFunction(({ id, target }) => {
      const position = window.__LCOS_NODE_LAB__?.api?.getNode(id)?.position
      return position && Math.abs(position.x - target.x) <= 0.02 && Math.abs(position.y - target.y) <= 0.02
    }, { id: collectionNodeId, target: expectedWorldPoint }, { timeout: 15000 })
    const redoResponse = await redoSavePromise
    assert.equal(redoResponse.status(), 200)
    const redoSaved = await appFacadeCall(`/api/canvas/v1/canvases/${encodeURIComponent(mainWorkspace.canvasId)}`)
    const redoNode = redoSaved.nodes.find((node) => String(node.id) === collectionNodeId)
    assert.ok(redoNode && redoNode.type === 'lcos-collection')
    assert.deepEqual(redoNode.position, nativeSerializedPoint(expectedWorldPoint))
    assert.deepEqual(redoNode.data.lcos_collection_ref, savedCollectionNode.data.lcos_collection_ref)
    assert.deepEqual(redoSaved.nodes.filter((node) => String(node.id) !== collectionNodeId).map(nodeFingerprint),
      fixtureCanvasBefore.nodes.map(nodeFingerprint))
    const nativeAfterRedo = await page.evaluate(({ canvasId, id }) => {
      const api = window.__LCOS_NODE_LAB__.api
      return { node: api.getNode(id), viewport: api.getViewport(), selection: api.getSelection(),
        history: api.inspectNativeHistory({ canvasId, nodeId: id }) }
    }, { canvasId: String(mainWorkspace.canvasId), id: collectionNodeId })
    assert.equal(nativeAfterRedo.history.historySize, nativeAfterDrop.history.historySize)
    assert.equal(nativeAfterRedo.history.currentIndex, nativeAfterDrop.history.currentIndex)
    assert.equal(nativeAfterRedo.history.currentEntry.nodes.length, 1)
    assert.deepEqual(nativeAfterRedo.viewport, nativeAfterDrop.viewport)
    assert.deepEqual(nativeAfterRedo.selection, nativeAfterDrop.selection)
    report.afterRedo = { savedNode: nodeFingerprint(redoNode), nativeCanvas: nativeAfterRedo,
      otherNodesUnchanged: true, canonicalBindingRetained: true }
    await saveScreenshot('06-original-ctrl-shift-z-redo')
    addStep('Ctrl+Shift+Z uses the original TapNow O8 history and restores the same canonical Collection at the released world point', {
      nodeId: collectionNodeId, savedPosition: redoNode.position, canonicalRefRetained: true,
      historyIndex: nativeAfterRedo.history.currentIndex, historySize: nativeAfterRedo.history.historySize,
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 30000 })
    await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api?.getNodes, null, { timeout: 30000 })
    assert.equal(await page.locator('.react-flow').count(), 1)
    const postReloadNodeLocator = page.locator(`[data-lcos-native-collection-node="${collectionNodeId}"][data-lcos-native-collection-availability="ready"]`)
    await postReloadNodeLocator.waitFor({ state: 'visible', timeout: 30000 })
    const postReloadFace = postReloadNodeLocator.locator(`[data-lcos-canonical-collection="${collectionId}"]`)
    await postReloadFace.waitFor({ state: 'visible', timeout: 15000 })
    await page.waitForFunction((id) => document.querySelector(`[data-lcos-canonical-collection="${CSS.escape(id)}"]`)
      ?.getAttribute('data-member-read-status') === 'ready', collectionId, { timeout: 20000 })
    const canvasAfterReload = await appFacadeCall(`/api/canvas/v1/canvases/${encodeURIComponent(mainWorkspace.canvasId)}`)
    const reloadNode = canvasAfterReload.nodes.find((node) => String(node.id) === collectionNodeId)
    assert.ok(reloadNode)
    assert.equal(reloadNode.type, 'lcos-collection')
    assert.deepEqual(reloadNode.data.lcos_collection_ref, savedCollectionNode.data.lcos_collection_ref)
    assert.deepEqual(reloadNode.position, nativeSerializedPoint(expectedWorldPoint))
    const bindingAfterReload = await appFacadeCall(exactCollectionBindingPath)
    assert.equal(bindingAfterReload.canvas_id, String(mainWorkspace.canvasId))
    assert.equal(bindingAfterReload.workspace_id, String(mainWorkspace.id))
    assert.equal(bindingAfterReload.collection_id, collectionId)
    assert.equal(bindingAfterReload.binding?.spatialId, collectionNodeId)
    assert.equal(bindingAfterReload.node?.id, collectionNodeId)
    assert.equal(bindingAfterReload.node?.type, 'lcos-collection')
    const historyAfterReload = await page.evaluate(({ canvasId, id }) => {
      const api = window.__LCOS_NODE_LAB__.api
      return { node: api.getNode(id), viewport: api.getViewport(), selection: api.getSelection(),
        history: api.inspectNativeHistory({ canvasId, nodeId: id }) }
    }, { canvasId: String(mainWorkspace.canvasId), id: collectionNodeId })
    assert.equal(historyAfterReload.history.ok, true,
      'read the new original O8 session; reload does not promise persistence of an in-memory Undo stack')
    assert.deepEqual(historyAfterReload.selection, nativeAfterRedo.selection)
    assert.deepEqual(historyAfterReload.viewport, nativeAfterRedo.viewport)
    assert.deepEqual(canvasAfterReload.nodes.filter((node) => String(node.id) !== collectionNodeId).map(nodeFingerprint),
      fixtureCanvasBefore.nodes.map(nodeFingerprint))
    report.afterReload = { canvas: canvasFingerprint(canvasAfterReload), node: nodeFingerprint(reloadNode),
      binding: bindingAfterReload.binding, memberReadStatus: await postReloadFace.getAttribute('data-member-read-status'),
      collectionMemberCount: await postReloadFace.getAttribute('data-member-count'),
      nativeHistory: historyAfterReload, oneReactFlow: true, otherNodesUnchanged: true }
    await saveScreenshot('07-reload-same-native-collection-and-binding')
    addStep('a real reload restores the same original collection NodeID, exact Core binding, saved position and member read', {
      nodeId: collectionNodeId, collectionId, binding: bindingAfterReload.binding,
      savedPosition: reloadNode.position, memberReadStatus: report.afterReload.memberReadStatus,
    })

    const presentationAfterReload = await appCoreCall(`/projects/${encodeURIComponent(projectId)}/presentations`)
    const finalCollectionPresentations = presentationAfterReload.filter((row) => row.projectId === projectId
      && row.state?.memberEntityRefs?.some((ref) => ref.type === 'collection' && ref.id === collectionId))
    assert.equal(finalCollectionPresentations.length, 1)
    assert.equal(finalCollectionPresentations[0]?.id, targetPresentationId)
    assert.deepEqual(presentationAfterReload.filter((row) => row.id !== targetPresentationId), unrelatedPresentationsBefore,
      'A real reload must preserve every non-target Core Presentation unchanged.')
    const canvasesAfterReload = await readAllCanvases()
    for (const workspace of workspaces.filter((row) => row.preferredSurface !== surfaceArgument)) {
      assert.deepEqual(canvasFingerprint(canvasesAfterReload[workspace.preferredSurface]),
        canvasFingerprint(canvasesBeforeCarry[workspace.preferredSurface]),
        `Reloaded target must not alter the other ${workspace.preferredSurface} Canvas.`)
    }
    const runsAfterReload = await appCoreCall(`/projects/${encodeURIComponent(projectId)}/runs`)
    assert.equal(runsAfterReload.length, runCountBefore.length)
    if (verifyMembers) {
      expectedSpatialPhase = 'membership'
      await verifyCollectionManagement({ page, origin, projectId, canvasId: String(mainWorkspace.canvasId),
        collectionId, collectionTitle, nodeId: collectionNodeId,
        conversationId, conversationNodeId: mainCanvasBefore.nodes.find(node => node.type === 'lcos-conversation'
          && node.data?.lcos_conversation_ref?.connectedConversationId === conversationId)?.id,
        textMember: managementTextMember, imageMember: managementImageMember, otherCollectionId,
        appCoreCall, appFacadeCall, readAllCanvases, saveScreenshot, report, addStep, readRawFile,
        setMembershipPhase: phase => { membershipPhase = phase },
        readMembershipCounts: () => ({ add: membershipAddCount, remove: membershipRemoveCount }),
      })
      assert.equal(membershipRemoveCount, 1)
      assert.equal(membershipAddCount, 1)
      assert.equal(browserBatchCount, 3, 'Membership, reading and gallery operations must not author native geometry or replace a carrier.')
    }
    assert.equal(report.pageErrors.length, 0, `Browser page errors: ${report.pageErrors.join(' | ')}`)
    assert.equal(coreApplyCount, 1)
    assert.equal(collectionProjectCount, 1)
    assert.equal(report.unexpectedWrites.length, 0, `Unexpected writes: ${JSON.stringify(report.unexpectedWrites)}`)
    assert.equal(report.providerExecution, false)
    assert.equal(report.modelExecution, false)
    report.passed = true
    report.final = { targetSurface: surfaceArgument, targetRef, targetPresentationId,
      oneOriginalReactFlow: true, originalAssemblyCarry: true, originalCanvasReceiver: true,
      corePresentationMembership: true, oneCollectionCarrier: true, sameNativeNodeAfterUndoRedoReload: true,
      otherNodesCameraSelectionPreserved: true, otherCanvasesUnchanged: true, unrelatedPresentationsUnchanged: true,
      providerExecution: false, modelExecution: false,
      canonicalCollectionMemberCount: expectedMemberCount, runCountUnchanged: true,
      ...(verifyMembers ? { originalCollectionManagement: true, membershipAddCount, membershipRemoveCount } : {}) }
    } else {
      assert.equal(report.pageErrors.length, 0, `Browser page errors: ${report.pageErrors.join(' | ')}`)
      assert.equal(coreApplyCount, 1)
      assert.equal(collectionProjectCount, 1)
      assert.equal(browserBatchCount, 1)
      assert.equal(report.unexpectedWrites.length, 0, `Unexpected writes: ${JSON.stringify(report.unexpectedWrites)}`)
      assert.equal(report.providerExecution, false)
      assert.equal(report.modelExecution, false)
      report.historyPhase = 'not-run; first pass is limited to the real carry/receipt/projection/saved geometry; use --verify-history only after reviewing that receipt.'
      report.passed = true
      report.final = { scope: 'placement-only', oneOriginalReactFlow: true, originalAssemblyCarry: true,
        originalCanvasReceiver: true, targetSurface: surfaceArgument, targetRef, targetPresentationId,
        corePresentationMembership: true, oneCollectionCarrier: true,
        savedWorldGeometry: true, providerExecution: false, modelExecution: false, runCountUnchanged: true }
    }
  } catch (error) {
    report.failure = String(error.stack ?? error)
    report.failurePhase = expectedSpatialPhase
    if (page) {
      report.failureLandingState = await page.evaluate(async () =>
        (await import('/lcos/agent-ui.js')).inspectNativeCollectionLanding()).catch((error) => ({ unavailable: String(error) }))
      report.failureUrl = page.url()
      report.failureTitle = await page.title().catch(() => '')
      report.failureBody = (await page.locator('body').innerText().catch(() => '')).slice(0, 8000)
      report.failureCanvasReadback = await appFacadeCall(`/api/canvas/v1/canvases/${encodeURIComponent(mainWorkspace?.canvasId ?? '')}`)
        .catch((readError) => ({ unavailable: String(readError.stack ?? readError) }))
      if (collectionNodeId) {
        report.failureNativeNode = await page.evaluate((id) => {
          const api = window.__LCOS_NODE_LAB__?.api
          return api ? { node: api.getNode(id), selection: api.getSelection(), viewport: api.getViewport(),
            history: api.inspectNativeHistory({ canvasId: window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId, nodeId: id }) } : null
        }, collectionNodeId).catch((readError) => ({ unavailable: String(readError.stack ?? readError) }))
      }
      await saveScreenshot('failure-current-page').catch(() => {})
    }
    report.countsAtFailure = { coreApplyCount, collectionProjectCount, browserBatchCount,
      coreApplyReceipt, collectionProjectReceipt, browserBatchResponses, dropReceipt: report.dropReceipt ?? null }
    const canvas = await appCoreCall(`/projects/${encodeURIComponent(projectId)}/graph`).catch(() => undefined)
    if (canvas) report.projectGraphAfterFailure = { projectId: canvas.project?.id,
      collectionIdPresent: canvas.collections?.some((row) => String(row.id) === collectionId) ?? null }
    // Preserve the real failure before cleanup closes any outstanding browser
    // waits. The final write below replaces this with actual cleanup results.
    report.cleanupPending = true
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
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
    report.fixtureWritesSummary = { manuallyCreatedCollection: !!collectionId, collectionId,
      conversationId, providerRows: providerRows?.map((row) => ({ provider: row.provider, availability: row.availability })) ?? null,
      modelExecution: false }
    report.runtimeCleanup = await removeIsolatedRuntimeSafely()
    report.cleanupPending = false
    try {
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
      reportWriteDone = true
    } catch (error) { console.error(`Could not preserve evidence report: ${String(error.stack ?? error)}`) }
    console.log(JSON.stringify({ passed: report.passed, runtimeLabel, origin, reportPath,
      reportWriteDone, steps: report.steps, screenshots: report.screenshots,
      counts: { coreApplyCount, collectionProjectCount, browserBatchCount,
        unexpectedWrites: report.unexpectedWrites.length, pageErrors: report.pageErrors.length,
        apiFailures: report.apiFailures.length, blockedHttp: report.blockedHttp.length,
        blockedWebSockets: report.blockedWebSockets.length },
      failure: report.failure ?? null, runtimeCleanup: report.runtimeCleanup, launcherCleanup: report.launcher.cleanup ?? null }, null, 2))
    if (!report.passed) process.exitCode = 1
  }
}

async function exists(filename) {
  try { await stat(filename); return true } catch { return false }
}

async function probeLoopbackListener(port, timeoutMs = 1500) {
  return await new Promise((resolve) => {
    let settled = false
    const finish = (listening, reason) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve({ listening, host: '127.0.0.1', port, reason })
    }
    const socket = net.createConnection({ host: '127.0.0.1', port })
    const timer = setTimeout(() => finish(false, 'connection-timeout'), timeoutMs)
    socket.once('connect', () => finish(true, 'tcp-connect'))
    socket.once('error', (error) => finish(false, `connect-error:${error.code ?? error.message}`))
  })
}
