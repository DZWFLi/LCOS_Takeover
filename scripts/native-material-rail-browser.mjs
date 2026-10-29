import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/16'
const protectedPorts = new Set([17881, 53861, 56111, 56225, 56234])

function parseBaseUrl(argv) {
  let value
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--base-url') {
      if (value !== undefined || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('Use --base-url exactly once with one loopback origin.')
      value = argv[++index]
    } else if (arg.startsWith('--base-url=')) {
      if (value !== undefined) throw new Error('Use --base-url exactly once.')
      value = arg.slice('--base-url='.length)
    }
    else throw new Error(`Unsupported argument: ${arg}`)
  }
  if (!value) throw new Error('Required: --base-url http://127.0.0.1:<isolated-native-rail-port>')
  const url = new URL(value)
  const port = Number(url.port)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !Number.isInteger(port) || port < 1
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('--base-url must be a bare http://127.0.0.1:<port> loopback origin.')
  }
  if (protectedPorts.has(port)) throw new Error(`Refusing protected/old runtime port ${port}.`)
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
  return String(value).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120) || 'unknown'
}

function compact(value) { return String(value ?? '').replace(/\s+/g, '') }

function visibleBody(value) {
  return String(value ?? '').replace(/\r/g, '').replace(/^\s{0,3}#{1,6}\s/gm, '').replace(/<!--.*?-->/gs, '').trim()
}

function canvasNodes(canvas) { return Array.isArray(canvas?.nodes) ? canvas.nodes : [] }

function canvasContent(canvas) {
  const clone = structuredClone(canvas)
  delete clone.version
  delete clone.updatedAt
  delete clone.updated_at
  return clone
}

function exactMaterialRef(node) {
  const ref = node?.data?.lcos_ref
  if (!ref || typeof ref !== 'object') return undefined
  const artifactId = String(ref.artifactId ?? '')
  const revisionId = String(ref.revisionId ?? '')
  const artifactViewId = String(ref.artifactViewId ?? '')
  return artifactId && revisionId && artifactViewId ? { artifactId, revisionId, artifactViewId, ref } : undefined
}

function previewSceneShape(payload, canvasId) {
  const value = unwrap(payload)
  assert.equal(String(value?.canvasId ?? value?.canvas_id ?? ''), canvasId, `Preview scene belongs to ${canvasId}.`)
  assert.ok(Array.isArray(value?.nodes) && Array.isArray(value?.edges) && value?.bounds,
    `Preview scene ${canvasId} must contain exact layout geometry.`)
  return value
}

function imageOccurrences(workspaces, canvases, graph) {
  const artifacts = new Map((graph.artifacts ?? []).map(row => [String(row.id), row]))
  const revisions = new Map((graph.artifactRevisions ?? []).map(row => [String(row.id), row]))
  const files = new Map((graph.fileRecords ?? []).map(row => [String(row.id), row]))
  const groups = new Map()
  for (const workspace of workspaces) {
    const canvas = canvases[String(workspace.preferredSurface)]
    for (const node of canvas?.nodes ?? []) {
      const ref = node.data?.lcos_ref
      const artifactId = String(ref?.artifactId ?? '')
      const revisionId = String(ref?.revisionId ?? '')
      if (!artifactId || !revisionId) continue
      const artifact = artifacts.get(artifactId)
      const revision = revisions.get(revisionId)
      if (!artifact || artifact.kind !== 'image' || String(revision?.artifactId) !== artifactId) continue
      const fileId = String(revision.fileRecordId ?? '')
      const file = files.get(fileId)
      if (!file || String(file.mimeType ?? '').toLowerCase() !== 'image/png') continue
      const key = JSON.stringify([artifactId, revisionId, fileId])
      const rows = groups.get(key) ?? []
      rows.push({ workspaceId: String(workspace.id), surface: String(workspace.preferredSurface),
        canvasId: String(workspace.canvasId), nodeId: String(node.id), artifactId, artifactViewId: String(ref.artifactViewId ?? ''),
        revisionId, fileRecordId: fileId, mimeType: file.mimeType })
      groups.set(key, rows)
    }
  }
  return [...groups.values()].map(occurrences => ({ occurrences,
    distinctWorkspaceCount: new Set(occurrences.map(row => row.workspaceId)).size }))
    .filter(group => group.distinctWorkspaceCount === workspaces.length)
    .sort((a, b) => a.occurrences[0].artifactId.localeCompare(b.occurrences[0].artifactId))
}

async function main() {
  const { origin, port } = parseBaseUrl(process.argv)
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  const evidenceDir = path.join(visualRoot, `native-material-rail-${runId}`)
  const reportPath = path.join(evidenceDir, 'report.json')
  await mkdir(evidenceDir, { recursive: true })
  const report = { schema: 'native-material-rail/v1', runId, origin, port, evidenceDir, reportPath,
    passed: false, preflightPassed: false, guiPassed: false, readyForGui: false, phase: 'runtime-validation',
    scope: 'isolated runtime; Core API reads; browser GET/HEAD, exact no-op measurement echoes, and three cold image measurements only',
    apiReads: [], browserWritesForwarded: [], browserWritesBlocked: [], externalRequestsBlocked: [],
    websocketAttemptsBlocked: [], expectedBackgroundBlocks: [], otherBlockedBackgroundRequests: [],
    apiFailures: [], pageErrors: [], consoleErrors: [], screenshots: [], error: null }
  const saveReport = async () => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  let browser
  let context
  let page
  let beforeBootstrap
  let afterBootstrap
  const get = async (pathname, binary = false) => {
    const target = new URL(pathname, origin)
    assert.equal(target.origin, origin, `Core API read escaped the isolated runtime: ${target.origin}`)
    const response = await fetch(target, { method: 'GET', headers: { Accept: binary ? '*/*' : 'application/json' },
      redirect: 'error', cache: 'no-store' })
    report.apiReads.push({ method: 'GET', path: target.pathname, status: response.status,
      bytes: binary ? Number(response.headers.get('content-length')) || null : undefined })
    assert.equal(response.status, 200, `GET ${pathname}: ${response.status}`)
    if (binary) return Buffer.from(await response.arrayBuffer())
    const payload = await response.json()
    assert.notEqual(payload?.ok, false, `GET ${pathname} returned an error envelope`)
    if (payload?.code !== undefined) assert.equal(payload.code, 0, `GET ${pathname} returned a nonzero code`)
    return unwrap(payload)
  }
  try {
    const health = await get('/health')
    assert.equal(health.bind, '127.0.0.1')
    assert.equal(Number(health.port), port)
    assert.equal(health.nativeRailPilot, true, 'Runtime must explicitly enable nativeRailPilot.')
    assert.equal(health.nativeAssemblyPilot, true, 'The original Library Assembly surface must be enabled.')
    assert.equal(health.cloudBackendConnected, false)
    assert.match(String(health.runtimeLabel), /^isolated-/)
    report.runtime = { bind: health.bind, port: Number(health.port), runtimeLabel: health.runtimeLabel,
      nativeRailPilot: true, nativeAssemblyPilot: true, cloudBackendConnected: false }

    const status = await get('/api/surface-core/status')
    const projectId = String(status.projectId ?? '')
    assert.equal(projectId, 'disposable-surface-core-facade', 'Only the isolated disposable Core project is in scope.')
    report.projectId = projectId
    const projectPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}`
    const readState = async () => {
      const [graph, runs, presentations, workspaces] = await Promise.all([
        get(`${projectPath}/graph`), get(`${projectPath}/runs`), get(`${projectPath}/presentations`), get(`${projectPath}/workspaces`),
      ])
      assert.equal(String(graph.project?.id), projectId)
      assert.equal(workspaces.length, 3, 'The isolated rail fixture must expose its three existing workspaces.')
      assert.ok(workspaces.every(workspace => workspace.canvasId && workspace.id && workspace.preferredSurface))
      assert.equal(new Set(workspaces.map(workspace => String(workspace.id))).size, 3)
      assert.equal(new Set(workspaces.map(workspace => String(workspace.canvasId))).size, 3)
      assert.equal(new Set(workspaces.map(workspace => String(workspace.preferredSurface))).size, 3)
      const canvases = {}
      for (const workspace of workspaces) {
        const surface = String(workspace.preferredSurface)
        canvases[surface] = await get(`/api/canvas/v1/canvases/${encodeURIComponent(String(workspace.canvasId))}`)
        assert.equal(String(canvases[surface].id), String(workspace.canvasId))
        if (canvases[surface].workspace_id !== undefined) assert.equal(String(canvases[surface].workspace_id), String(workspace.id))
      }
      return { graph, runs, presentations, workspaces, canvases }
    }
    const writeCoreSnapshot = async (label, snapshot) => writeFile(path.join(evidenceDir, `${label}.json`),
      `${JSON.stringify({ graph: snapshot.graph, runs: snapshot.runs, presentations: snapshot.presentations,
        workspaces: snapshot.workspaces, canvases: snapshot.canvases }, null, 2)}\n`, 'utf8')
    const beforeBootstrapState = await readState()
    beforeBootstrap = { ...beforeBootstrapState, fileBytes: new Map() }
    const workspacesBySurface = Object.fromEntries(beforeBootstrap.workspaces.map(workspace => [String(workspace.preferredSurface), workspace]))
    for (const surface of ['main', 'context', 'workflow']) assert.ok(workspacesBySurface[surface], `Missing ${surface} Workspace.`)
    report.coreSnapshot = { workspaces: beforeBootstrap.workspaces.map(workspace => ({ id: String(workspace.id),
      surface: String(workspace.preferredSurface), canvasId: String(workspace.canvasId) })),
      graphArtifacts: beforeBootstrap.graph.artifacts?.length ?? 0,
      graphRevisions: beforeBootstrap.graph.artifactRevisions?.length ?? 0,
      runs: beforeBootstrap.runs.length, presentations: beforeBootstrap.presentations.length }

    const candidates = imageOccurrences(beforeBootstrap.workspaces, beforeBootstrap.canvases, beforeBootstrap.graph)
    report.crossCanvasImageProbe = { candidateCount: candidates.length, candidates: candidates.map(group => group.occurrences) }
    const imageGroup = candidates.find(group => group.occurrences.some(row => row.surface === 'context' && row.nodeId === 'surface-context-image'))
    assert.ok(imageGroup, 'The existing PNG Artifact/Revision must be present in Main, Context and Workflow.')
    const imageBySurface = Object.fromEntries(['main', 'context', 'workflow'].map(surface => {
      const matches = imageGroup.occurrences.filter(row => row.surface === surface)
      assert.equal(matches.length, 1, `Expected exactly one exact PNG location in ${surface}.`)
      return [surface, matches[0]]
    }))
    assert.equal(imageBySurface.context.nodeId, 'surface-context-image')
    for (const [surface, location] of Object.entries(imageBySurface)) {
      const scene = previewSceneShape(await get(`/api/canvas/${encodeURIComponent(location.canvasId)}/preview-scene`), location.canvasId)
      assert.ok(scene.nodes.some(node => String(node.id) === location.nodeId), `Preview scene omitted ${surface} image node.`)
      report.previewScenes ??= {}
      report.previewScenes[location.canvasId] = scene
    }
    const imageRef = imageBySurface.workflow
    const imageCatalog = await get('/api/library/v1/assets:search?type_filter=1&page=1&page_size=20')
    const imageAssetRow = (imageCatalog.items ?? []).find(row => String(row.asset?.id) === imageRef.artifactId
      && row.asset?.lcos_projection?.presented_revision_id === imageRef.revisionId
      && row.asset?.lcos_projection?.file_record_id === imageRef.fileRecordId
      && row.asset?.lcos_projection?.referenceable === true)
    assert.ok(imageAssetRow?.asset?.name, 'The exact same-revision PNG must be listed in the original Library.')
    const imageFixture = { artifactId: imageRef.artifactId, revisionId: imageRef.revisionId,
      fileRecordId: imageRef.fileRecordId, mimeType: imageRef.mimeType, asset: imageAssetRow.asset,
      locations: imageBySurface }

    const workflow = workspacesBySurface.workflow
    const workflowCanvas = beforeBootstrap.canvases.workflow
    const textNode = canvasNodes(workflowCanvas).find(node => String(node.id) === 'surface-workflow-text')
    const textRef = exactMaterialRef(textNode)
    assert.ok(textNode && textRef, 'The existing Workflow text node must have a Core Artifact/View reference.')
    const textArtifact = beforeBootstrap.graph.artifacts.find(row => String(row.id) === textRef.artifactId)
    const textRevision = beforeBootstrap.graph.artifactRevisions.find(row => String(row.id) === textRef.revisionId
      && String(row.artifactId) === textRef.artifactId)
    const textFile = beforeBootstrap.graph.fileRecords.find(row => String(row.id) === String(textRevision?.fileRecordId))
    assert.ok(textArtifact && ['text', 'markdown'].includes(String(textArtifact.kind)))
    assert.equal(String(textArtifact.currentRevisionId), textRef.revisionId, 'Text Peek fixture must be Current.')
    assert.ok(textRevision && textFile && ['text/plain', 'text/markdown'].includes(String(textFile.mimeType)))
    const textLocations = beforeBootstrap.workspaces.flatMap(workspace => canvasNodes(beforeBootstrap.canvases[String(workspace.preferredSurface)])
      .flatMap(node => { const ref = exactMaterialRef(node); return ref?.artifactId === textRef.artifactId && ref.revisionId === textRef.revisionId
        ? [{ surface: String(workspace.preferredSurface), canvasId: String(workspace.canvasId), nodeId: String(node.id) }] : [] }))
    assert.equal(textLocations.length, 1, 'Current text fixture must have exactly one real location.')
    assert.equal(textLocations[0].surface, 'workflow')
    const textCatalog = await get('/api/library/v1/assets:search?type_filter=4&page=1&page_size=20')
    const textAssetRow = (textCatalog.items ?? []).find(row => String(row.asset?.id) === textRef.artifactId
      && row.asset?.lcos_projection?.presented_revision_id === textRef.revisionId
      && row.asset?.lcos_projection?.file_record_id === String(textFile.id)
      && row.asset?.lcos_projection?.referenceable === true)
    assert.ok(textAssetRow?.asset?.name, 'The exact Current text fixture must appear in the original Library.')
    const textFixture = { artifactId: textRef.artifactId, artifactViewId: textRef.artifactViewId,
      revisionId: textRef.revisionId, fileRecordId: String(textFile.id), mimeType: textFile.mimeType,
      asset: textAssetRow.asset, location: textLocations[0] }
    for (const [name, fixture] of [['image', imageFixture], ['text', textFixture]]) {
      const bytes = await get(`${projectPath}/file-records/${encodeURIComponent(fixture.fileRecordId)}/content`, true)
      assert.ok(bytes.length > 0, `The exact ${name} FileRecord must return non-empty bytes.`)
      if (name === 'image') assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        'The same-image GUI fixture must return exact PNG bytes.')
      beforeBootstrap.fileBytes.set(fixture.fileRecordId, bytes)
      const extension = name === 'image' ? 'png' : 'txt'
      const filePath = path.join(evidenceDir, `${safeName(fixture.fileRecordId)}.${extension}`)
      await writeFile(filePath, bytes)
      report.fixtureFiles ??= {}
      report.fixtureFiles[name] = { fileRecordId: fixture.fileRecordId, mimeType: fixture.mimeType,
        byteLength: bytes.length, evidencePath: path.basename(filePath) }
      fixture.body = name === 'text' ? bytes.toString('utf8') : undefined
    }
    for (const file of beforeBootstrap.graph.fileRecords ?? []) {
      const id = String(file.id)
      if (!beforeBootstrap.fileBytes.has(id)) beforeBootstrap.fileBytes.set(id,
        await get(`${projectPath}/file-records/${encodeURIComponent(id)}/content`, true))
    }
    report.allFileRecordByteLengths = Object.fromEntries([...beforeBootstrap.fileBytes].map(([id, bytes]) => [id, bytes.length]))
    report.crossCanvasImageProbe.selected = { artifactId: imageFixture.artifactId, revisionId: imageFixture.revisionId,
      fileRecordId: imageFixture.fileRecordId, mimeType: imageFixture.mimeType,
      occurrences: Object.values(imageBySurface), sameExactArtifactRevisionFileAcrossEveryWorkspace: true }
    report.textFixture = { artifactId: textFixture.artifactId, revisionId: textFixture.revisionId,
      fileRecordId: textFixture.fileRecordId, location: textFixture.location, exactCoreTextBytes: true }
    await writeCoreSnapshot('core-before-bootstrap', beforeBootstrap)

    const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' })
    const bootstrap = new Map(Object.values(imageBySurface).map(location => [location.canvasId, {
      location, changedForwarded: false, coldMeasure: null,
      knownNodes: new Map(canvasNodes(beforeBootstrap.canvases[location.surface]).map(node => [String(node.id), node])),
    }]))
    let bootstrapOpen = true
    let failSceneCanvas = ''
    let failSceneCount = 0
    let delaySceneCanvas = ''
    let delaySceneStartedResolve
    let delayedSceneStarted = new Promise(resolve => { delaySceneStartedResolve = resolve })
    let delayedSceneReleased = false
    let omitSceneTarget = null
    let holdNavigationGraph = false
    let graphHeldResolve
    let releaseHeldGraph
    let graphHeld = new Promise(resolve => { graphHeldResolve = resolve })
    let heldGraphRelease = new Promise(resolve => { releaseHeldGraph = resolve })
    const exactCanvasPath = canvasId => `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}/nodes:batchActions`
    const readFreshCanvas = async canvasId => {
      const value = await get(`/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
      assert.equal(String(value.id), canvasId)
      return value
    }
    const safeMeasuredEcho = (body, canvasId) => {
      const state = bootstrap.get(canvasId)
      const allowedBody = new Set(['canvas_id', 'actions', 'created_by_role', 'lcos_expected_revisions'])
      if (!state || !body || body.canvas_id !== canvasId || !Array.isArray(body.actions) || body.actions.length !== 1
        || Object.keys(body).some(key => !allowedBody.has(key)) || body.created_by_role !== undefined && body.created_by_role !== 'user') return null
      const action = body.actions[0]
      if (action?.action !== 'update' || !Array.isArray(action.updates) || !action.updates.length) return null
      const allowedUpdate = new Set(['id', 'type', 'data', 'position', 'measured'])
      const checked = []
      for (const update of action.updates) {
        const prior = state.knownNodes.get(String(update?.id ?? ''))
        const size = update?.measured
        if (!prior || Object.keys(update).some(key => !allowedUpdate.has(key))
          || update.type !== undefined && update.type !== prior.type
          || update.data !== undefined && !isDeepStrictEqual(update.data, prior.data)
          || update.position !== undefined && !isDeepStrictEqual(update.position, prior.position)
          || !size || !Number.isFinite(size.width) || !Number.isFinite(size.height)
          || size.width <= 0 || size.height <= 0 || size.width > 4096 || size.height > 4096) return null
        const old = prior.measured ?? { width: prior.width ?? prior.style?.width ?? 300, height: prior.height ?? prior.style?.height ?? 270 }
        const unchanged = Number(size.width) === Number(old.width) && Number(size.height) === Number(old.height)
        const cold = bootstrapOpen && String(update.id) === state.location.nodeId && prior.type === 'image' && !state.changedForwarded
          && Number(old.width) === 360 && Number(old.height) === 240
          && Number(size.width) === 375 && Number(size.height) === 250
        if (!unchanged && !cold) return null
        checked.push({ update, cold, previous: { width: Number(old.width), height: Number(old.height) },
          next: { width: Number(size.width), height: Number(size.height) } })
      }
      const revisions = body.lcos_expected_revisions
      if (revisions !== undefined && (revisions === null || typeof revisions !== 'object' || Array.isArray(revisions)
        || Object.entries(revisions).some(([id, revisionId]) => !state.knownNodes.has(id)
          || typeof revisionId !== 'string' || state.knownNodes.get(id)?.lcos_revision_id !== revisionId))) return null
      return { updates: checked, cold: checked.some(item => item.cold) }
    }
    await context.route('**/*', async route => {
      const request = route.request()
      const address = new URL(request.url())
      if (['data:', 'blob:'].includes(address.protocol)) return route.continue()
      if (address.origin !== origin) {
        report.externalRequestsBlocked.push({ method: request.method(), origin: address.origin, path: address.pathname })
        return route.abort('blockedbyclient')
      }
      if (request.method() === 'GET' && address.pathname === `${projectPath}/graph` && holdNavigationGraph) {
        holdNavigationGraph = false
        graphHeldResolve()
        await heldGraphRelease
        return route.continue()
      }
      if (request.method() === 'GET' && omitSceneTarget && address.pathname === `/api/canvas/${encodeURIComponent(omitSceneTarget.canvasId)}/preview-scene`) {
        const target = omitSceneTarget
        omitSceneTarget = null
        const scene = structuredClone(report.previewScenes[target.canvasId])
        scene.nodes = scene.nodes.filter(node => String(node.id) !== target.nodeId)
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: scene }) })
      }
      if (request.method() === 'GET' && address.pathname === `/api/canvas/${encodeURIComponent(failSceneCanvas)}/preview-scene` && failSceneCanvas) {
        failSceneCount += 1; failSceneCanvas = ''
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, message: 'synthetic read failure' }) })
      }
      if (request.method() === 'GET' && address.pathname === `/api/canvas/${encodeURIComponent(delaySceneCanvas)}/preview-scene` && delaySceneCanvas) {
        const target = delaySceneCanvas
        delaySceneCanvas = ''
        delaySceneStartedResolve()
        await new Promise(resolve => setTimeout(resolve, 1100))
        try {
          const scene = report.previewScenes[target]
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: scene }) })
          delayedSceneReleased = true
        } catch (error) { report.delayedSceneDeliveryError = error instanceof Error ? error.message : String(error) }
        return
      }
      if (['GET', 'HEAD'].includes(request.method())) return route.continue()
      const pathCanvasId = [...bootstrap.keys()].find(canvasId => address.pathname === exactCanvasPath(canvasId))
      if (request.method() === 'POST' && pathCanvasId) {
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        const echo = safeMeasuredEcho(body, pathCanvasId)
        if (echo) {
          const response = await route.fetch()
          const entry = { path: address.pathname, status: response.status(), canvasId: pathCanvasId,
            nodeIds: echo.updates.map(item => String(item.update.id)), exactMeasuredEcho: true,
            kind: echo.cold ? 'cold-image-measurement' : 'no-op-measurement-echo',
            changes: echo.updates.filter(item => item.cold).map(item => ({ nodeId: String(item.update.id), from: item.previous, to: item.next })) }
          if (response.ok()) {
            const state = bootstrap.get(pathCanvasId)
            if (echo.cold) { state.changedForwarded = true; state.coldMeasure = entry.changes[0] }
            state.knownNodes = new Map(canvasNodes(await readFreshCanvas(pathCanvasId)).map(node => [String(node.id), node]))
            report.browserWritesForwarded.push(entry)
          } else report.otherBlockedBackgroundRequests.push({ ...entry, reason: 'measurement echo did not receive a successful receipt' })
          return route.fulfill({ response })
        }
      }
      const item = { method: request.method(), path: address.pathname, reason: 'browser business writes are denied' }
      report.browserWritesBlocked.push(item)
      if (address.pathname === '/api/events' || /execution:reconcile$/.test(address.pathname) || /nodes:batchActions$/.test(address.pathname)) {
        report.expectedBackgroundBlocks.push(item)
      } else report.otherBlockedBackgroundRequests.push(item)
      return route.abort('blockedbyclient')
    })
    if (context.routeWebSocket) await context.routeWebSocket('**/*', socket => {
      report.websocketAttemptsBlocked.push({ url: socket.url(), reason: 'WebSocket denied in isolated GUI run' })
      socket.close({ code: 1008, reason: 'isolated GUI run' })
    })
    page = await context.newPage()
    page.on('pageerror', error => report.pageErrors.push(String(error)))
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 1000)) })
    page.on('response', response => {
      const url = new URL(response.url())
      if (url.origin === origin && response.status() >= 400) report.apiFailures.push({ method: response.request().method(), path: url.pathname, status: response.status() })
    })
    const screenshot = async label => {
      const file = path.join(evidenceDir, `${safeName(label)}.png`)
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
      report.screenshots.push(path.basename(file))
    }
    const waitForCanvas = async canvasId => {
      await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 })
      await page.waitForFunction(id => document.title.includes('TapNow')
        && (window.__LCOS_NODE_LAB__?.currentCanvasId === id || window.__LCOS_NODE_LAB__?.canvasId === id), canvasId, { timeout: 30000 })
    }

    report.phase = 'three-canvas-measurement-bootstrap'
    report.geometryBootstrap = { permittedOnlyKnownImageNode: true, coldMeasure: '360x240 -> 375x250',
      echoes: [], surfaces: [] }
    for (const surface of ['main', 'context', 'workflow']) {
      const location = imageBySurface[surface]
      await page.goto(`${origin}/canvas/${encodeURIComponent(location.canvasId)}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await waitForCanvas(location.canvasId)
      await page.locator(`.react-flow__node[data-id="${location.nodeId}"]`).waitFor({ state: 'visible', timeout: 20000 })
      await page.waitForTimeout(1200)
      await screenshot(`bootstrap-${surface}`)
      report.geometryBootstrap.surfaces.push({ surface, canvasId: location.canvasId, imageNodeId: location.nodeId,
        coldMeasureForwarded: Boolean(bootstrap.get(location.canvasId).coldMeasure),
        coldMeasure: bootstrap.get(location.canvasId).coldMeasure ?? null })
    }
    bootstrapOpen = false
    afterBootstrap = await readState()
    afterBootstrap.fileBytes = new Map()
    for (const [id, bytes] of beforeBootstrap.fileBytes) {
      afterBootstrap.fileBytes.set(id, await get(`${projectPath}/file-records/${encodeURIComponent(id)}/content`, true))
      assert.ok(bytes.equals(afterBootstrap.fileBytes.get(id)), `Bootstrap changed original FileRecord ${id} bytes.`)
    }
    assert.deepEqual(afterBootstrap.graph, beforeBootstrap.graph, 'Measurement bootstrap must not change the Core graph.')
    assert.deepEqual(afterBootstrap.runs, beforeBootstrap.runs, 'Measurement bootstrap must not create a Run.')
    assert.deepEqual(afterBootstrap.presentations, beforeBootstrap.presentations, 'Measurement bootstrap must not change Presentations.')
    for (const surface of ['main', 'context', 'workflow']) {
      const location = imageBySurface[surface]
      const oldCanvas = beforeBootstrap.canvases[surface], newCanvas = afterBootstrap.canvases[surface]
      const oldNodes = new Map(canvasNodes(oldCanvas).map(node => [String(node.id), node]))
      const newNodes = new Map(canvasNodes(newCanvas).map(node => [String(node.id), node]))
      assert.deepEqual([...oldNodes.keys()].sort(), [...newNodes.keys()].sort(), `${surface} bootstrap added or removed nodes.`)
      for (const [id, oldNode] of oldNodes) {
        const next = newNodes.get(id)
        if (id !== location.nodeId) assert.deepEqual(next, oldNode, `${surface} bootstrap changed non-target node ${id}.`)
        else {
          const stripMeasure = node => { const clone = structuredClone(node); delete clone.measured; return clone }
          assert.deepEqual(stripMeasure(next), stripMeasure(oldNode), `${surface} bootstrap changed target identity or layout outside measured size.`)
          const measurement = bootstrap.get(location.canvasId).coldMeasure
          if (measurement) assert.deepEqual(next.measured, { width: 375, height: 250 }, `${surface} cold measurement receipt did not persist its exact target size.`)
          else assert.deepEqual(next.measured, oldNode.measured, `${surface} unmeasured target changed persisted geometry.`)
          assert.deepEqual({ width: Number(next.measured?.width), height: Number(next.measured?.height) },
            { width: 375, height: 250 }, `${surface} must be standardized before the read-only GUI snapshot.`)
        }
      }
      const oldRest = canvasContent(oldCanvas), newRest = canvasContent(newCanvas)
      oldRest.nodes = oldRest.nodes.map(node => node.id === location.nodeId ? (() => { const c = structuredClone(node); delete c.measured; return c })() : node)
      newRest.nodes = newRest.nodes.map(node => node.id === location.nodeId ? (() => { const c = structuredClone(node); delete c.measured; return c })() : node)
      assert.deepEqual(newRest, oldRest, `${surface} bootstrap changed Canvas data outside the exact measured echo.`)
    }
    await writeCoreSnapshot('core-after-bootstrap-before-gui', afterBootstrap)
    report.snapshots = { beforeBootstrap: 'core-before-bootstrap.json', beforeGui: 'core-after-bootstrap-before-gui.json',
      graphRunsPresentationsUnchanged: true, onlyKnownImageMeasuredEchoesForwarded: true }
    report.geometryBootstrap.echoes = report.browserWritesForwarded
    report.preflightPassed = true
    report.readyForGui = true

    const openLibrary = async () => {
      const library = page.locator('[data-library-view="library"]')
      if (!await library.isVisible().catch(() => false)) {
        await page.locator('[data-testid="canvas-dockbar-assets-btn"]').click()
        await library.waitFor({ state: 'visible', timeout: 15000 })
      }
      return library
    }
    const openAsset = async asset => {
      const closeAgent = page.getByRole('button', { name: '关闭 Agent 面板', exact: true })
      if (await closeAgent.isVisible().catch(() => false)) await closeAgent.click()
      const library = await openLibrary()
      let search = library.locator('input[type="search"]').first()
      if (!await search.count()) search = library.getByRole('textbox').first()
      await search.fill(asset.name)
      await page.waitForTimeout(350)
      const row = library.getByText(asset.name, { exact: true }).first()
      await row.waitFor({ state: 'visible', timeout: 20000 })
      await row.click()
      const tools = page.locator('section[aria-label="Assembly 材料与引用"]')
      await tools.waitFor({ state: 'visible', timeout: 10000 })
      await page.waitForFunction(() => document.querySelector('section[aria-label="Assembly 材料与引用"]')
        ?.getAttribute('data-native-assembly-state') === 'ready', null, { timeout: 30000 })
      const rail = tools.locator('details[aria-label="材料来源与使用位置"]')
      await page.waitForFunction(() => document.querySelector('details[aria-label="材料来源与使用位置"]')
        ?.getAttribute('data-native-material-context-state') === 'ready', null, { timeout: 30000 })
      return { library, tools, rail }
    }
    const locationLocator = (rail, location) => rail.locator(`[data-native-material-location="${location.canvasId}"][data-native-material-location-node="${location.nodeId}"]`)
    const assertImageRail = async rail => {
      const locations = rail.locator('[data-native-material-location-exact="true"]')
      assert.equal(await locations.count(), 3, 'The selected Artifact/Revision must have exactly three exact locations.')
      const counts = await rail.locator('[data-native-material-location-count]').innerText()
      assert.match(counts, /3\s*处所选版本/)
      const source = rail.locator('[data-native-material-source]')
      const sourceText = await source.innerText()
      assert.ok(sourceText.includes('版本来源') && sourceText.includes('Core 登记'))
      const registeredPath = (await source.locator('dd').nth(1).innerText()).trim()
      assert.ok(registeredPath && !registeredPath.includes('没有登记来源路径') && !registeredPath.includes('登记来源暂不可读取'),
        'The chosen PNG must display its explicitly registered source path.')
      report.imageRail = { exactLocationCount: await locations.count(), countText: counts,
        source: sourceText, registeredPathLabel: registeredPath }
      for (const location of Object.values(imageBySurface)) assert.equal(await locationLocator(rail, location).count(), 1)
      return locations
    }
    const peekLocator = location => page.locator(`section[aria-label="材料位置 Peek"][data-native-material-peek="${location.canvasId}"][data-native-material-peek-node="${location.nodeId}"]`)
    const triggerLocator = location => page.getByRole('button', { name: `Peek ${location.canvasId} ${location.nodeId}`, exact: true })
    const waitPeekState = async (location, revisionId, state) => {
      await page.waitForFunction(({ canvasId, nodeId, revisionId, state }) => {
        const peek = document.querySelector(`section[aria-label="材料位置 Peek"][data-native-material-peek="${canvasId}"][data-native-material-peek-node="${nodeId}"]`)
        return peek?.getAttribute('data-native-material-peek-revision') === revisionId
          && peek?.getAttribute('data-native-material-peek-state') === state
      }, { canvasId: location.canvasId, nodeId: location.nodeId, revisionId, state }, { timeout: 30000 })
      return peekLocator(location)
    }
    const assertImagePeek = async (location, trigger) => {
      const peek = await waitPeekState(location, imageFixture.revisionId, 'ready')
      const scene = peek.locator(`[data-lcos-railway-mini-scene="${location.canvasId}"]`)
      await scene.waitFor({ state: 'visible', timeout: 10000 })
      const highlighted = scene.locator(`g[data-native-peek-target="true"][data-lcos-preview-node="${location.nodeId}"]`)
      assert.equal(await highlighted.count(), 1, 'The actual target location must be highlighted in its own scene.')
      const preview = peek.locator('.native-material-peek-preview')
      assert.equal(await preview.getAttribute('data-native-material-peek-file'), imageFixture.fileRecordId)
      await page.waitForFunction(({ canvasId, nodeId, fileRecordId }) => {
        const root = document.querySelector(`section[aria-label="材料位置 Peek"][data-native-material-peek="${canvasId}"][data-native-material-peek-node="${nodeId}"]`)
        const image = root?.querySelector('.native-material-peek-preview img')
        return image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:')
          && root?.querySelector('.native-material-peek-preview')?.getAttribute('data-native-material-peek-file') === fileRecordId
      }, { canvasId: location.canvasId, nodeId: location.nodeId, fileRecordId: imageFixture.fileRecordId }, { timeout: 20000 })
      return { peek, scene, trigger, preview }
    }
    const waitNavigation = async location => {
      const notice = page.locator(`[data-native-rail-navigation-canvas="${location.canvasId}"][data-native-rail-navigation-node="${location.nodeId}"]`)
      await page.waitForFunction(({ canvasId, nodeId }) => {
        const notice = document.querySelector('[data-native-rail-navigation-state]')
        return notice?.getAttribute('data-native-rail-navigation-canvas') === canvasId
          && notice.getAttribute('data-native-rail-navigation-node') === nodeId
          && ['located', 'error'].includes(notice.getAttribute('data-native-rail-navigation-state'))
      }, { canvasId: location.canvasId, nodeId: location.nodeId }, { timeout: 25000 })
      report.navigationAttempts ??= []
      report.navigationAttempts.push({ canvasId: location.canvasId, nodeId: location.nodeId,
        state: await notice.getAttribute('data-native-rail-navigation-state'), message: await notice.innerText(),
        arrivalApiRenewed: await notice.getAttribute('data-native-rail-arrival-api-renewed') })
      assert.equal(await notice.getAttribute('data-native-rail-navigation-state'), 'located', `Exact location navigation reported: ${await notice.innerText()}`)
      await page.waitForFunction(id => window.__LCOS_NODE_LAB__?.currentCanvasId === id || window.__LCOS_NODE_LAB__?.canvasId === id,
        location.canvasId, { timeout: 10000 })
      await page.locator('.react-flow__viewport').waitFor({ state: 'visible', timeout: 10000 })
    }
    const assertExactPosition = async (surface, location) => {
      const canvas = await readFreshCanvas(location.canvasId)
      const node = canvasNodes(canvas).find(row => String(row.id) === location.nodeId)
      const baseline = canvasNodes(afterBootstrap.canvases[surface]).find(row => String(row.id) === location.nodeId)
      assert.ok(node && baseline)
      assert.deepEqual(node.position, baseline.position, `Location record for ${surface} moved during a read-only locate.`)
      return { position: node.position, measured: node.measured }
    }

    report.phase = 'gui-material-rail'
    const mainImage = imageBySurface.main
    await page.goto(`${origin}/canvas/${encodeURIComponent(mainImage.canvasId)}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await waitForCanvas(mainImage.canvasId)
    let { library, tools, rail } = await openAsset(imageFixture.asset)
    await assertImageRail(rail)
    await screenshot('01-main-image-source-and-three-locations')

    // Change the actual original Library selection while a navigation Core read is held.
    holdNavigationGraph = true
    await locationLocator(rail, imageBySurface.context).locator('.native-material-location-row').click()
    await Promise.race([graphHeld, new Promise((_, reject) => setTimeout(() => reject(new Error('Navigation graph was not held.')), 10000))])
    await page.locator('[data-native-rail-navigation-state="pending"]').waitFor({ state: 'visible', timeout: 5000 })
    await openAsset(textFixture.asset)
    releaseHeldGraph()
    await page.waitForTimeout(350)
    assert.equal(await page.locator('[data-native-rail-navigation-state]').count(), 0, 'Changed material must cancel the old navigation status.')
    await waitForCanvas(mainImage.canvasId)
    assert.equal(new URL(page.url()).pathname, `/canvas/${mainImage.canvasId}`, 'Late old material read must not switch the scene.')
    report.changedMaterialCancelsNavigation = { heldOldRead: true, newSelection: textFixture.artifactId,
      remainedOnSourceCanvas: true, oldStatusCleared: true }
    ;({ library, tools, rail } = await openAsset(imageFixture.asset))
    await assertImageRail(rail)

    // Inject one explicit scene read failure, then recover only by closing and reopening the original HoverPopover.
    failSceneCanvas = imageBySurface.context.canvasId
    const contextTrigger = triggerLocator(imageBySurface.context)
    await contextTrigger.focus()
    const failedPeek = await waitPeekState(imageBySurface.context, imageFixture.revisionId, 'error')
    assert.equal(failSceneCount, 1, 'One scene GET 503 must not trigger an automatic replay.')
    await screenshot('02-context-peek-scene-read-failure')
    await contextTrigger.press('Escape')
    await page.waitForFunction(({ canvasId, nodeId }) => !document.querySelector(
      `section[aria-label="材料位置 Peek"][data-native-material-peek="${canvasId}"][data-native-material-peek-node="${nodeId}"]`),
    { canvasId: imageBySurface.context.canvasId, nodeId: imageBySurface.context.nodeId }, { timeout: 10000 })
    await contextTrigger.evaluate(element => element.blur())
    await contextTrigger.hover()
    const contextPeek = await assertImagePeek(imageBySurface.context, contextTrigger)
    report.scene503Recovery = { injectedStatus: 503, requests: failSceneCount, recoveredByExplicitCloseAndReopen: true,
      fileRecordId: imageFixture.fileRecordId }
    await screenshot('03-context-image-peek-recovered')

    await contextTrigger.press('Escape')
    await contextTrigger.evaluate(element => element.blur())
    await page.waitForFunction(() => !document.querySelector('section[aria-label="材料位置 Peek"]'), null, { timeout: 10000 })
    await page.mouse.move(2, 2)
    omitSceneTarget = imageBySurface.context
    await contextTrigger.focus()
    const missingTargetPeek = await waitPeekState(imageBySurface.context, imageFixture.revisionId, 'error')
    assert.match(await missingTargetPeek.innerText(), /没有包含这个准确节点/)
    report.missingSceneTarget = { sameCanvasResponse: true, missingTargetRefused: true, substitutedOtherNode: false }
    await contextTrigger.press('Escape')
    await contextTrigger.evaluate(element => element.blur())
    await page.waitForFunction(() => !document.querySelector('section[aria-label="材料位置 Peek"]'), null, { timeout: 10000 })
    await page.mouse.move(2, 2)
    await contextTrigger.hover()
    await assertImagePeek(imageBySurface.context, contextTrigger)

    // Hold the Workflow scene response, close the hover, then release it after the Peek has gone away.
    delaySceneCanvas = imageBySurface.workflow.canvasId
    delayedSceneStarted = new Promise(resolve => { delaySceneStartedResolve = resolve })
    const workflowTrigger = triggerLocator(imageBySurface.workflow)
    await workflowTrigger.hover()
    await Promise.race([delayedSceneStarted, new Promise((_, reject) => setTimeout(() => reject(new Error('Delayed scene request never started.')), 15000))])
    await page.mouse.move(2, 2)
    await page.waitForFunction(() => !document.querySelector('section[aria-label="材料位置 Peek"]'), null, { timeout: 10000 })
    await page.waitForTimeout(1250)
    assert.equal(await page.locator('section[aria-label="材料位置 Peek"]').count(), 0,
      'A late response must not reopen the dismissed HoverPopover or replace its target.')
    report.hoverCloseLateResponse = { delayedCanvasId: imageBySurface.workflow.canvasId,
      responseReleasedAfterClose: delayedSceneReleased, deliveryError: report.delayedSceneDeliveryError ?? null,
      dismissedPeekStayedClosed: true, newTargetContamination: false }

    // Reopen the Context Preview after the late Workflow response, then let the original Ke switch to Context.
    await contextTrigger.hover()
    await assertImagePeek(imageBySurface.context, contextTrigger)
    await contextPeek.peek.getByRole('button', { name: '定位这个准确位置', exact: true }).click()
    await waitNavigation(imageBySurface.context)
    report.mainToContext = { sourceCanvasId: mainImage.canvasId, targetCanvasId: imageBySurface.context.canvasId,
      targetNodeId: imageBySurface.context.nodeId, originalNavigationNotice: true, exactNodeConfirmed: true }
    await screenshot('04-main-peek-located-context')

    // The Assembly selection is canvas/API scoped. Re-select through the original Library after the native switch.
    ;({ library, tools, rail } = await openAsset(imageFixture.asset))
    await assertImageRail(rail)
    const workflowPeekTrigger = triggerLocator(imageBySurface.workflow)
    await workflowPeekTrigger.focus()
    const workflowPeek = await assertImagePeek(imageBySurface.workflow, workflowPeekTrigger)
    await workflowPeek.peek.getByRole('button', { name: '定位这个准确位置', exact: true }).click()
    await waitNavigation(imageBySurface.workflow)
    report.contextToWorkflow = { sourceCanvasId: imageBySurface.context.canvasId, targetCanvasId: imageBySurface.workflow.canvasId,
      targetNodeId: imageBySurface.workflow.nodeId, originalNavigationNotice: true, exactNodeConfirmed: true }
    await screenshot('05-context-peek-located-workflow')

    ;({ library, tools, rail } = await openAsset(imageFixture.asset))
    await assertImageRail(rail)
    const workflowLocation = locationLocator(rail, imageBySurface.workflow)
    await workflowLocation.scrollIntoViewIfNeeded()
    const flow = page.locator('.react-flow')
    const flowBox = await flow.boundingBox()
    assert.ok(flowBox)
    const viewport = page.locator('.react-flow__viewport')
    const beforePosition = await assertExactPosition('workflow', imageBySurface.workflow)
    await page.mouse.move(flowBox.x + flowBox.width * .44, flowBox.y + flowBox.height * .82)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, 420)
    await page.keyboard.up('Control')
    await page.waitForTimeout(400)
    const zoomedTransform = await viewport.getAttribute('style')
    await workflowLocation.locator('.native-material-location-row').click()
    await waitNavigation(imageBySurface.workflow)
    const locatedTransform = await viewport.getAttribute('style')
    assert.notEqual(locatedTransform, zoomedTransform, 'Same-canvas locate must move the original camera to the exact node.')
    const afterPosition = await assertExactPosition('workflow', imageBySurface.workflow)
    assert.deepEqual(afterPosition.position, beforePosition.position, 'Camera locate must not rewrite the saved node position.')
    report.sameCanvasLocate = { canvasId: imageBySurface.workflow.canvasId, nodeId: imageBySurface.workflow.nodeId,
      zoomedTransform, locatedTransform, viewportChanged: true, savedPositionUnchanged: true }
    await screenshot('06-workflow-same-canvas-row-located')

    const workflowPath = `/canvas/${encodeURIComponent(imageBySurface.workflow.canvasId)}`
    if (new URL(page.url()).pathname !== workflowPath) {
      await page.goto(`${origin}${workflowPath}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await waitForCanvas(imageBySurface.workflow.canvasId)
    }
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
    await waitForCanvas(imageBySurface.workflow.canvasId)
    ;({ library, tools, rail } = await openAsset(imageFixture.asset))
    await assertImageRail(rail)
    const refreshedImageTrigger = triggerLocator(imageBySurface.context)
    await refreshedImageTrigger.focus()
    await assertImagePeek(imageBySurface.context, refreshedImageTrigger)
    report.refreshImageConsistency = { artifactId: imageFixture.artifactId, revisionId: imageFixture.revisionId,
      fileRecordId: imageFixture.fileRecordId, exactLocations: 3, contextSceneAndImageLoaded: true }
    await screenshot('07-image-rail-after-refresh')

    // Original Library text preview: exact Current bytes at its single evidenced Workflow location.
    ;({ library, tools, rail } = await openAsset(textFixture.asset))
    const textCount = await rail.locator('[data-native-material-location-exact="true"]').count()
    assert.equal(textCount, 1, 'Current text fixture must show its one exact native location.')
    assert.equal(await locationLocator(rail, textFixture.location).count(), 1)
    const textTrigger = triggerLocator(textFixture.location)
    await textTrigger.focus()
    const textPeek = await waitPeekState(textFixture.location, textFixture.revisionId, 'ready')
    const textPreview = textPeek.locator('.native-material-peek-preview')
    assert.equal(await textPreview.getAttribute('data-native-material-peek-file'), textFixture.fileRecordId)
    const renderedText = await textPreview.innerText()
    const expectedText = compact(visibleBody(textFixture.body))
    assert.ok(expectedText && compact(renderedText).includes(expectedText),
      `Original NativePreview must render the exact Current text bytes at ${textFixture.location.nodeId}.`)
    assert.equal(await textPreview.locator('button').filter({ hasText: /添加到画布|添加至画布|Apply/i }).count(), 0)
    report.currentTextPeek = { artifactId: textFixture.artifactId, revisionId: textFixture.revisionId,
      fileRecordId: textFixture.fileRecordId, exactLocations: textCount, renderedExactCoreBody: true,
      bodyByteLength: Buffer.byteLength(textFixture.body) }
    await screenshot('08-current-text-single-location-peek')

    await textTrigger.press('Escape')
    await textTrigger.evaluate(element => element.blur())
    await page.setViewportSize({ width: 1024, height: 768 })
    await textTrigger.scrollIntoViewIfNeeded()
    const triggerHit = await textTrigger.evaluate(element => {
      const box = element.getBoundingClientRect()
      const x = box.left + box.width / 2, y = box.top + box.height / 2
      const hit = document.elementFromPoint(x, y)
      return { inViewport: x >= 0 && y >= 0 && x < innerWidth && y < innerHeight,
        receivesPointer: element === hit || element.contains(hit) }
    })
    assert.deepEqual(triggerHit, { inViewport: true, receivesPointer: true }, 'Narrow viewport Peek control must remain reachable.')
    await textTrigger.focus()
    await waitPeekState(textFixture.location, textFixture.revisionId, 'ready')
    const peekBounds = await peekLocator(textFixture.location).boundingBox()
    assert.ok(peekBounds && peekBounds.x >= 0 && peekBounds.y >= 0
      && peekBounds.x + peekBounds.width <= 1025 && peekBounds.y + peekBounds.height <= 769,
    'Narrow viewport Peek must stay inside the visible window.')
    report.narrowViewport = { width: 1024, height: 768, triggerHit, peekBounds, keyboardPeek: true }
    await screenshot('09-narrow-current-text-peek')

    assert.deepEqual(report.pageErrors, [], 'No uncaught application errors in the material source/location/Peek path.')
    assert.ok(report.browserWritesForwarded.every(write => write.exactMeasuredEcho === true), 'Only exact known image measurement echoes may be forwarded.')
    const afterGui = await readState()
    afterGui.fileBytes = new Map()
    for (const [id, bytes] of afterBootstrap.fileBytes) {
      afterGui.fileBytes.set(id, await get(`${projectPath}/file-records/${encodeURIComponent(id)}/content`, true))
      assert.ok(bytes.equals(afterGui.fileBytes.get(id)), `GUI interaction changed original FileRecord ${id} bytes.`)
    }
    assert.deepEqual(afterGui.graph, afterBootstrap.graph, 'Peek/locate must not mutate the Core graph.')
    assert.deepEqual(afterGui.runs, afterBootstrap.runs, 'Peek/locate must not create a Run or provider execution.')
    assert.deepEqual(afterGui.presentations, afterBootstrap.presentations, 'Peek/locate must not mutate Core Presentations.')
    for (const surface of ['main', 'context', 'workflow']) {
      assert.deepEqual(canvasContent(afterGui.canvases[surface]), canvasContent(afterBootstrap.canvases[surface]),
        `Peek/locate changed persisted ${surface} Canvas nodes, layout or connections.`)
    }
    await writeCoreSnapshot('core-after-gui', afterGui)
    report.snapshots.afterGui = 'core-after-gui.json'
    report.snapshots.graphRunsPresentationsCanvasContentAndExactFileBytesUnchangedSinceBootstrap = true
    report.snapshots.allowedNoOpCanvasEchoesAfterBootstrap = report.browserWritesForwarded
      .filter(write => write.kind === 'no-op-measurement-echo').length
    report.snapshots.canvasVersions = Object.fromEntries(['main', 'context', 'workflow'].map(surface => [surface, {
      before: afterBootstrap.canvases[surface].version ?? null, after: afterGui.canvases[surface].version ?? null,
      updatedAtBefore: afterBootstrap.canvases[surface].updated_at ?? afterBootstrap.canvases[surface].updatedAt ?? null,
      updatedAtAfter: afterGui.canvases[surface].updated_at ?? afterGui.canvases[surface].updatedAt ?? null,
    }]))
    report.fixtureExecution = { newArtifact: false, newRevision: false, newCanvasNode: false,
      newRun: false, providerCalled: false, dropPerformed: false }
    report.browserWritePolicy = { policy: 'GET/HEAD pass; exact measured no-ops pass; only each known image 360x240→375x250 cold echo may change Canvas during bootstrap; all other writes abort',
      forwarded: report.browserWritesForwarded, blockedBusinessWrites: report.browserWritesBlocked,
      externalRequestsBlocked: report.externalRequestsBlocked.length, websocketAttemptsBlocked: report.websocketAttemptsBlocked.length }
    report.guiPassed = true
    report.passed = true
    report.phase = 'passed'
  } catch (error) {
    report.error = { name: error?.name ?? 'Error', message: error?.message ?? String(error), stack: error?.stack ?? '' }
    report.phase = 'failed'
    if (page) {
      try {
        const file = path.join(evidenceDir, `failure-${Date.now()}.png`)
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
        report.screenshots.push(path.basename(file))
      } catch { /* preserve the primary GUI failure */ }
    }
  } finally {
    try { await context?.close() } catch { /* preserve the primary result */ }
    try { await browser?.close() } catch { /* preserve the primary result */ }
    await saveReport()
    console.log(JSON.stringify({ passed: report.passed, preflightPassed: report.preflightPassed,
      guiPassed: report.guiPassed, readyForGui: report.readyForGui, phase: report.phase, reportPath,
      crossCanvasImageCandidates: report.crossCanvasImageProbe?.candidateCount ?? 0,
      browserWritesForwarded: report.browserWritesForwarded.length, browserWritesBlocked: report.browserWritesBlocked.length,
      error: report.error?.message ?? null }, null, 2))
    if (!report.passed) process.exitCode = 1
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
