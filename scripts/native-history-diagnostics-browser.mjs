import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flags = new Set(argv.filter(value => !value.includes('=')))
const valueArg = name => argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)
const help = flags.has('--help') || flags.has('-h')

if (help) {
  console.log('Usage: node scripts/native-history-diagnostics-browser.mjs --deployed [--base-url=http://127.0.0.1:17881]')
  console.log('Read-only only: fresh Chrome, no Canvas writes, no undo/redo, no Core writes.')
  process.exit(0)
}

const guardErrors = []
if (!flags.has('--deployed')) guardErrors.push('缺少 --deployed；脚本不会访问服务或启动浏览器。')
if (argv.some(value => !value.startsWith('--base-url=') && value !== '--deployed')) {
  guardErrors.push('只接受 --deployed 与可选的 --base-url=<loopback-origin>。')
}
if (argv.filter(value => value.startsWith('--base-url=')).length > 1) guardErrors.push('--base-url 只能出现一次。')
if (valueArg('--base-url') !== undefined) {
  try {
    const candidate = new URL(valueArg('--base-url'))
    if (candidate.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(candidate.hostname)
      || candidate.pathname !== '/' || candidate.search || candidate.hash || candidate.username || candidate.password) {
      guardErrors.push('--base-url 只能是无路径/凭据的 loopback HTTP origin。')
    }
  } catch { guardErrors.push('--base-url 不是有效 URL。') }
}
if (guardErrors.length) {
  console.error(JSON.stringify({ runState: 'not-started', errors: guardErrors }, null, 2))
  process.exitCode = 2
} else {
  await run()
}

async function run() {
  const baseUrl = valueArg('--base-url') || 'http://127.0.0.1:17881'
  let base
  try { base = new URL(baseUrl) }
  catch { throw new Error('--base-url 不是有效 URL。') }
  assert.equal(base.protocol, 'http:', 'Only loopback HTTP is allowed.')
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Only loopback hosts are allowed.')
  assert.equal(base.pathname, '/', 'Pass an origin only, not a route prefix.')
  assert.equal(base.search, '')
  assert.equal(base.hash, '')
  assert.equal(base.username, '')
  assert.equal(base.password, '')

  const origin = base.origin
  const targetCanvasId = 'surface-core-context'
  const sourceNodeId = 'surface-context-text'
  const branchNodeId = 'text-3b923501-2d2b-4cc7-8beb-05de10df2db1'
  const expectedBranchArtifactId = 'artifact-text-f1877a6b-db9e-4f58-b4c6-a19635d416ed'
  const sceneCanvasIds = ['surface-core-main', 'surface-core-context', 'surface-core-workflow']
  const inspectNodeIds = [branchNodeId, sourceNodeId]
  const screenshotRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const evidenceDir = path.join(root, '.runtime', 'native-history-diagnostics')
  const reportPath = path.join(evidenceDir, `${stamp}.json`)
  const report = {
    at: new Date().toISOString(),
    runState: 'starting',
    mode: 'read-only original O8 diagnostics',
    target: { origin, canvasId: targetCanvasId, sourceNodeId, branchNodeId,
      branchArtifactId: expectedBranchArtifactId, sceneCanvasIds },
    scope: 'Read the existing Context branch/source, original O8 history summaries, Core projections, FileRecord bytes, and all three Canvas GETs. No create/delete/update/undo/redo or Core writes.',
    pageHistoryProvenance: {
      freshChromeContext: true,
      priorCreatePageReused: false,
      declaration: 'This is a new browser context and a new Canvas page seeded from persisted Canvas GET state. Its O8 index/snapshots describe this page only and do not prove the earlier create page index or Undo/Redo history.',
    },
    browser: { engine: 'Chrome via installed playwright-core', viewport: { width: 1440, height: 1000 },
      locale: 'zh-CN', serviceWorkers: 'blocked', storageState: 'fresh; none imported' },
    network: { allowedOrigin: origin, externalHttpBlocked: [], blockedWrites: [], requestFailures: [],
      apiFailures: [], webSocketsClosed: 0, browserWriteRequestsObserved: 0, browserWriteRequestsAdmitted: 0 },
    reads: [], scenesBefore: [], scenesAfter: [], materialsBefore: {}, materialsAfter: {},
    pageIdentity: {}, historyObservations: [], screenshots: [], pageErrors: [], consoleErrors: [],
    scriptUserInteractionsPerformed: 0,
    passed: false,
    notes: [
      'The only browser page actions are navigation, waits, screenshots, and read-only inspectNativeHistory observations.',
      'Every browser request other than same-origin GET/HEAD is aborted before reaching the service; all WebSockets are closed.',
      'Node-side HTTP reads are fixed GETs for the three original Canvas projections, two canonical canvas-text projections, Artifact details/revisions, and exact FileRecord bytes.',
      'History is sampled when Canvas/Professional surface reports ready, after two natural animation frames, and after a passive 1100ms wait for the existing 1000ms O8 debounce. No state is manually changed to create a history item.',
      'Each checkpoint is immediately queried twice. Equality is asserted within that checkpoint; differences between checkpoints are recorded as natural page settling, not attributed to the query.',
      'History output is schema-checked to contain only index/entry metadata and target-node IDs/dimensions; body, data, refs, content, prompt, params and source URLs are forbidden.',
      'Scene comparisons use the exact in-memory GET data objects; the report stores summaries rather than dumping all nodes from all scenes.',
    ],
  }

  let browser
  let context
  let page
  let serverStatus
  let scenesBeforeData
  let materialsBeforeData
  let finalStateRead = false
  let finalStateReadAttempted = false
  let finalStateError = null

  const stable = value => JSON.stringify(value)
  const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value)
  const refSummary = ref => isRecord(ref) ? {
    version: ref.version, entityType: ref.entityType, entityId: ref.entityId,
    artifactId: ref.artifactId, artifactViewId: ref.artifactViewId, revisionId: ref.revisionId,
  } : null
  const bodyOf = node => typeof node?.data?.text === 'string' ? node.data.text
    : typeof node?.data?.content === 'string' ? node.data.content : null
  const geometryOf = node => ({ position: node?.position ?? null, width: node?.width ?? null,
    height: node?.height ?? null, measured: node?.measured ?? null, style: node?.style ?? null,
    parentId: node?.parentId ?? node?.parent_id ?? null })
  const sceneSummary = data => ({ canvasId: String(data.id), name: data.name ?? data.title ?? null,
    nodeCount: Array.isArray(data.nodes) ? data.nodes.length : null,
    connectionCount: Array.isArray(data.connections) ? data.connections.length : null,
    nodeIds: Array.isArray(data.nodes) ? data.nodes.map(node => String(node.id)).sort() : [] })
  const coreRoute = suffix => `/api/lcos/core${suffix}`
  const safePath = value => {
    try { const url = new URL(value); return url.origin + url.pathname }
    catch { return String(value).slice(0, 300) }
  }
  const cleanText = value => String(value)
    .replace(/((?:token|secret|credential|authorization|api.?key)\s*[:=]\s*)[^\s,;]+/ig, '$1[redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/g, value => safePath(value))
    .slice(0, 1200)

  async function readJson(pathname, label) {
    assert.ok(pathname.startsWith('/'), 'Read routes must be same-origin paths.')
    const response = await fetch(new URL(pathname, origin), {
      method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error',
    })
    let payload = null
    try { payload = await response.json() } catch { /* retain status evidence */ }
    report.reads.push({ label, method: 'GET', path: pathname, status: response.status,
      tapNowCode: payload?.code ?? null, coreEnvelopeOk: payload?.ok === true })
    if (!response.ok) report.network.apiFailures.push({ method: 'GET', path: pathname,
      status: response.status, code: payload?.error?.code ?? payload?.code ?? null,
      message: cleanText(payload?.error?.message ?? payload?.message ?? '') })
    return { response, payload }
  }

  async function readScene(canvasId) {
    const pathname = `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`
    const result = await readJson(pathname, `TapNow Canvas GET ${canvasId}`)
    assert.equal(result.response.status, 200, `${canvasId} Canvas GET must succeed.`)
    assert.equal(result.payload?.code, 0)
    assert.ok(isRecord(result.payload?.data) && Array.isArray(result.payload.data.nodes))
    assert.ok(Array.isArray(result.payload.data.connections), `${canvasId} uses the native connections projection.`)
    assert.equal(String(result.payload.data.id), canvasId)
    return result.payload.data
  }

  async function readAllScenes() {
    const scenes = new Map()
    for (const canvasId of sceneCanvasIds) scenes.set(canvasId, await readScene(canvasId))
    return scenes
  }

  async function readCanvasText(canvasId, nodeId) {
    const query = new URLSearchParams({ canvasId, spatialId: nodeId })
    const result = await readJson(coreRoute(`/projects/${encodeURIComponent(serverStatus.projectId)}/curation/canvas-text?${query}`),
      `Core canvas-text ${canvasId}/${nodeId}`)
    assert.equal(result.response.status, 200)
    assert.equal(result.payload?.ok, true)
    assert.ok(isRecord(result.payload?.value) && typeof result.payload.value.body === 'string')
    return result.payload.value
  }

  async function readArtifact(artifactId) {
    const result = await readJson(coreRoute(`/artifacts/${encodeURIComponent(artifactId)}`), `Core Artifact ${artifactId}`)
    assert.equal(result.response.status, 200)
    assert.equal(result.payload?.ok, true)
    assert.ok(isRecord(result.payload?.value?.artifact))
    const artifact = result.payload.value.artifact
    assert.equal(String(artifact.id), artifactId)
    assert.equal(artifact.projectId, serverStatus.projectId)
    return artifact
  }

  async function readRevisions(artifactId) {
    const result = await readJson(coreRoute(`/artifacts/${encodeURIComponent(artifactId)}/revisions`), `Core revisions ${artifactId}`)
    assert.equal(result.response.status, 200)
    assert.equal(result.payload?.ok, true)
    assert.ok(Array.isArray(result.payload?.value))
    return result.payload.value
  }

  async function readFileRecord(fileRecordId) {
    const pathname = coreRoute(`/projects/${encodeURIComponent(serverStatus.projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`)
    const response = await fetch(new URL(pathname, origin), { method: 'GET', headers: { Accept: '*/*' },
      cache: 'no-store', redirect: 'error' })
    const bytes = Buffer.from(await response.arrayBuffer())
    report.reads.push({ label: `Core FileRecord ${fileRecordId} exact bytes`, method: 'GET', path: pathname,
      status: response.status, byteLength: bytes.length })
    if (!response.ok) report.network.apiFailures.push({ method: 'GET', path: pathname,
      status: response.status, code: null, message: 'Core FileRecord byte read failed.' })
    assert.equal(response.status, 200)
    return bytes
  }

  async function readMaterial(nodeId, canvasNode) {
    const ref = canvasNode?.data?.lcos_ref
    assert.ok(isRecord(ref) && ref.version === 1 && ref.entityType === 'artifact'
      && typeof ref.artifactId === 'string' && ref.artifactId
      && ref.entityId === ref.artifactId
      && typeof ref.artifactViewId === 'string' && ref.artifactViewId
      && typeof ref.revisionId === 'string' && ref.revisionId,
    `${nodeId} must have one complete primary Artifact lcos_ref.`)
    const projection = await readCanvasText(targetCanvasId, nodeId)
    assert.equal(projection.projectId, serverStatus.projectId)
    assert.equal(projection.canvasId, targetCanvasId)
    assert.equal(projection.spatialId, nodeId)
    assert.equal(projection.artifactId, ref.artifactId)
    assert.equal(projection.viewId, ref.artifactViewId)
    assert.equal(projection.revisionId, ref.revisionId)
    assert.equal(bodyOf(canvasNode), projection.body, `${nodeId} Canvas and Core bodies must match.`)

    const artifact = await readArtifact(ref.artifactId)
    assert.equal(String(artifact.currentRevisionId), String(ref.revisionId))
    const revisions = await readRevisions(ref.artifactId)
    const revision = revisions.find(item => String(item.id) === String(ref.revisionId))
    assert.ok(revision, `${nodeId} current revision must be listed on its existing Artifact.`)
    assert.equal(String(revision.fileRecordId), String(projection.fileRecordId))
    const bytes = await readFileRecord(String(revision.fileRecordId))
    assert.equal(bytes.toString('utf8'), projection.body, `${nodeId} exact registered FileRecord bytes must equal Core body.`)

    return {
      nodeId,
      canvasNode: { id: String(canvasNode.id), type: canvasNode.type, body: bodyOf(canvasNode),
        ref: refSummary(ref), revisionId: canvasNode.lcos_revision_id ?? null, geometry: geometryOf(canvasNode) },
      coreProjection: {
        projectId: projection.projectId, canvasId: projection.canvasId, spatialId: projection.spatialId,
        artifactId: projection.artifactId, viewId: projection.viewId, revisionId: projection.revisionId,
        fileRecordId: String(projection.fileRecordId), body: projection.body,
      },
      artifact: { id: String(artifact.id), projectId: artifact.projectId,
        currentRevisionId: String(artifact.currentRevisionId) },
      revisions: revisions.map(item => ({ id: String(item.id), fileRecordId: String(item.fileRecordId) })),
      fileRecord: { id: String(revision.fileRecordId), byteLength: bytes.length, base64: bytes.toString('base64') },
      bytes,
    }
  }

  function findUniqueNode(scene, nodeId) {
    const matches = scene.nodes.filter(node => String(node.id) === nodeId)
    assert.equal(matches.length, 1, `${nodeId} must occur exactly once in Context.`)
    return matches[0]
  }

  function assertInspectorShape(value, requestedNodeId) {
    const allow = (object, keys, label) => {
      assert.ok(isRecord(object), `${label} must be an object.`)
      for (const key of Object.keys(object)) assert.ok(keys.has(key), `${label} leaked unsupported field ${key}.`)
    }
    const topKeys = new Set(['ok', 'canvasId', 'nodeId', 'currentIndex', 'historySize', 'canUndo', 'canRedo',
      'currentEntry', 'undoTarget', 'redoTarget'])
    const entryKeys = new Set(['index', 'timestamp', 'nodeCount', 'nodes', 'operations'])
    const nodeKeys = new Set(['id', 'type', 'width', 'height', 'measured'])
    const dimensionsKeys = new Set(['width', 'height'])
    const operationKeys = new Set(['nodeId', 'aliases', 'carrierId', 'changeType', 'operation', 'unsupported'])
    const operationMetadataKeys = new Set(['version', 'operationId', 'kind', 'phase'])
    allow(value, topKeys, 'history summary')
    assert.equal(value.ok, true)
    assert.equal(value.canvasId, targetCanvasId)
    assert.equal(value.nodeId, requestedNodeId)
    assert.ok(Number.isInteger(value.currentIndex) && Number.isInteger(value.historySize))
    for (const entryName of ['currentEntry', 'undoTarget', 'redoTarget']) {
      const entry = value[entryName]
      if (entry === null) continue
      allow(entry, entryKeys, entryName)
      assert.ok(Array.isArray(entry.nodes) && Array.isArray(entry.operations))
      for (const node of entry.nodes) {
        allow(node, nodeKeys, `${entryName}.node`)
        assert.equal(node.id, requestedNodeId)
        if (node.measured !== null) allow(node.measured, dimensionsKeys, `${entryName}.node.measured`)
      }
      for (const operation of entry.operations) {
        allow(operation, operationKeys, `${entryName}.operation`)
        if (operation.operation !== null) allow(operation.operation, operationMetadataKeys, `${entryName}.operation.metadata`)
      }
    }
    return value
  }

  async function readPageIdentity(label) {
    const identity = await page.evaluate(({ expectedCanvasId, branchId, sourceId }) => {
      const host = window.__LCOS_NODE_LAB__
      return {
        label: undefined,
        title: document.title,
        pathname: location.pathname,
        canvasId: host?.currentCanvasId ?? host?.canvasId ?? null,
        projectId: typeof host?.projectId === 'string' ? host.projectId : null,
        reactFlowRoots: document.querySelectorAll('.react-flow').length,
        nodeBridgeApiPresent: Boolean(host?.api),
        inspectNativeHistoryPresent: typeof host?.api?.inspectNativeHistory === 'function',
        branchNodeVisible: Boolean(document.querySelector(`.react-flow__node[data-id="${branchId}"]`)),
        sourceNodeVisible: Boolean(document.querySelector(`.react-flow__node[data-id="${sourceId}"]`)),
        professionalSurfaceState: document.querySelector('[data-lcos-professional-surface-state]')
          ?.getAttribute('data-lcos-professional-surface-state') ?? null,
        activeCanvasMatchesRoute: location.pathname === `/canvas/${expectedCanvasId}`,
        visibleDialogs: [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
          .filter(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 })
          .length,
      }
    }, { expectedCanvasId: targetCanvasId, branchId: branchNodeId, sourceId: sourceNodeId })
    identity.label = label
    assert.equal(identity.pathname, `/canvas/${targetCanvasId}`)
    assert.equal(identity.canvasId, targetCanvasId)
    assert.equal(identity.activeCanvasMatchesRoute, true)
    assert.equal(identity.reactFlowRoots, 1, 'The original page must have exactly one ReactFlow root.')
    assert.equal(identity.nodeBridgeApiPresent, true)
    assert.equal(identity.inspectNativeHistoryPresent, true, 'The deployed original NodeBridge must expose inspectNativeHistory.')
    assert.equal(identity.branchNodeVisible, true)
    assert.equal(identity.sourceNodeVisible, true)
    assert.equal(identity.professionalSurfaceState, 'ready', 'Wait for the original Professional surface to report ready.')
    report.pageIdentity[label] = identity
    return identity
  }

  async function inspectNode(nodeId) {
    const value = await page.evaluate(({ canvasId, nodeId }) => {
      const api = window.__LCOS_NODE_LAB__?.api
      if (typeof api?.inspectNativeHistory !== 'function') throw new Error('Original NodeBridge history inspector is unavailable.')
      const result = api.inspectNativeHistory({ canvasId, nodeId })
      if (result && typeof result.then === 'function') throw new Error('History inspector must be a synchronous read-only snapshot query.')
      return result
    }, { canvasId: targetCanvasId, nodeId })
    const safe = assertInspectorShape(value, nodeId)
    const serialized = JSON.stringify(safe)
    const material = materialsBeforeData?.[nodeId]
    if (material?.coreProjection?.body) assert.equal(serialized.includes(material.coreProjection.body), false,
      'History inspector response must not contain node body text.')
    if (material?.fileRecord?.base64) assert.equal(serialized.includes(material.fileRecord.base64), false,
      'History inspector response must not contain raw FileRecord bytes.')
    return safe
  }

  async function observeStage(stageName) {
    const identity = await readPageIdentity(stageName)
    const first = {}
    const immediateRepeat = {}
    for (const nodeId of inspectNodeIds) first[nodeId] = await inspectNode(nodeId)
    for (const nodeId of inspectNodeIds) immediateRepeat[nodeId] = await inspectNode(nodeId)
    assert.equal(stable(immediateRepeat), stable(first), `${stageName}: an immediate repeat query must leave index and entries unchanged.`)
    const record = { stage: stageName, identity, observedAt: new Date().toISOString(),
      summaries: first, immediateRepeatMatchedExactly: true,
      indices: Object.fromEntries(inspectNodeIds.map(id => [id, first[id].currentIndex])),
      historySizes: Object.fromEntries(inspectNodeIds.map(id => [id, first[id].historySize])) }
    report.historyObservations.push(record)
    await screenshot(stageName)
  }

  async function screenshot(label) {
    await mkdir(screenshotRoot, { recursive: true })
    const filePath = path.join(screenshotRoot, `tapnow-native-history-${stamp}-${label}.png`)
    await page.screenshot({ path: filePath, fullPage: false })
    report.screenshots.push({ label, kind: 'full-viewport', path: filePath })
  }

  async function captureFinalReadback() {
    if (!scenesBeforeData || !materialsBeforeData || finalStateRead || finalStateReadAttempted) return
    finalStateReadAttempted = true
    const scenesAfterData = await readAllScenes()
    report.scenesAfter = sceneCanvasIds.map(id => sceneSummary(scenesAfterData.get(id)))
    report.sceneComparisons = []
    for (const canvasId of sceneCanvasIds) {
      assert.deepEqual(scenesAfterData.get(canvasId), scenesBeforeData.get(canvasId),
        `Read-only history diagnostics must leave full ${canvasId} Canvas projection byte-equivalent.`)
      report.sceneComparisons.push({ canvasId,
        before: sceneSummary(scenesBeforeData.get(canvasId)), after: sceneSummary(scenesAfterData.get(canvasId)),
        exactFullProjectionEqual: true, comparedFields: 'entire native Canvas GET data including nodes and connections' })
    }

    const context = scenesAfterData.get(targetCanvasId)
    const branchNode = findUniqueNode(context, branchNodeId)
    const sourceNode = findUniqueNode(context, sourceNodeId)
    const materialsAfterData = {
      [branchNodeId]: await readMaterial(branchNodeId, branchNode),
      [sourceNodeId]: await readMaterial(sourceNodeId, sourceNode),
    }
    report.materialsAfter = Object.fromEntries(inspectNodeIds.map(id => [id, materialReport(materialsAfterData[id])]))
    for (const id of inspectNodeIds) {
      const before = materialsBeforeData[id]
      const after = materialsAfterData[id]
      assert.deepEqual(after.canvasNode, before.canvasNode, `${id} native body/ref/revision/geometry must remain unchanged.`)
      assert.deepEqual(after.coreProjection, before.coreProjection, `${id} Core canonical projection must remain unchanged.`)
      assert.deepEqual(after.artifact, before.artifact, `${id} Artifact current revision must remain unchanged.`)
      assert.deepEqual(after.revisions, before.revisions, `${id} Artifact revision list must remain unchanged.`)
      assert.equal(after.bytes.equals(before.bytes), true, `${id} raw FileRecord bytes must remain exact.`)
      assert.equal(after.fileRecord.id, before.fileRecord.id)
      assert.equal(after.fileRecord.byteLength, before.fileRecord.byteLength)
      assert.equal(after.fileRecord.base64, before.fileRecord.base64)
    }
    assert.equal(stable(scenesBeforeData.get(targetCanvasId)), stable(scenesAfterData.get(targetCanvasId)))
    report.finalReadback = { allThreeCanvasProjectionsUnchanged: true,
      branchAndSourceCanvasNodeBodiesRefsGeometryUnchanged: true,
      branchAndSourceCoreProjectionsArtifactsRevisionListsAndExactFileBytesUnchanged: true }
    finalStateRead = true
  }

  function materialReport(material) {
    return { nodeId: material.nodeId, canvasNode: material.canvasNode, coreProjection: material.coreProjection,
      artifact: material.artifact, revisions: material.revisions, fileRecord: material.fileRecord }
  }

  try {
    const health = await readJson('/health', 'deployed integration health')
    assert.equal(health.response.status, 200)
    assert.equal(health.payload?.profile, 'original-tapnow-full-integration-in-progress')
    assert.equal(health.payload?.realCoreConnected, true)
    assert.ok(Number.isInteger(health.payload?.pid) && health.payload.pid > 0)
    const status = await readJson('/api/surface-core/status', 'Surface Core project/workspace status')
    assert.equal(status.response.status, 200)
    assert.equal(status.payload?.code, 0)
    serverStatus = status.payload.data
    assert.equal(typeof serverStatus.projectId, 'string')
    assert.ok(serverStatus.workspaces?.some(workspace => workspace.canvasId === targetCanvasId),
      'Surface Core must map the exact Context workspace.')
    report.server = { pid: health.payload.pid, profile: health.payload.profile,
      coreConnected: serverStatus.core?.connected ?? null, projectId: serverStatus.projectId,
      targetCanvasId }

    scenesBeforeData = await readAllScenes()
    report.scenesBefore = sceneCanvasIds.map(id => sceneSummary(scenesBeforeData.get(id)))
    const contextBefore = scenesBeforeData.get(targetCanvasId)
    const branchNodeBefore = findUniqueNode(contextBefore, branchNodeId)
    const sourceNodeBefore = findUniqueNode(contextBefore, sourceNodeId)
    assert.equal(branchNodeBefore.type, 'text')
    assert.equal(sourceNodeBefore.type, 'text')
    assert.equal(branchNodeBefore.data?.lcos_ref?.artifactId, expectedBranchArtifactId,
      'Only the previously committed branch identity from the retained create report is in scope.')
    materialsBeforeData = {
      [branchNodeId]: await readMaterial(branchNodeId, branchNodeBefore),
      [sourceNodeId]: await readMaterial(sourceNodeId, sourceNodeBefore),
    }
    report.materialsBefore = Object.fromEntries(inspectNodeIds.map(id => [id, materialReport(materialsBeforeData[id])]))
    report.targetBefore = {
      branch: materialsBeforeData[branchNodeId].canvasNode,
      source: materialsBeforeData[sourceNodeId].canvasNode,
      branchCoreRevision: materialsBeforeData[branchNodeId].coreProjection.revisionId,
      sourceCoreRevision: materialsBeforeData[sourceNodeId].coreProjection.revisionId,
      canvasNodeCount: contextBefore.nodes.length,
      connectionCount: contextBefore.connections.length,
    }

    const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' })
    await context.route('**/*', async route => {
      const request = route.request()
      let url
      try { url = new URL(request.url()) }
      catch {
        report.network.externalHttpBlocked.push({ method: request.method(), url: '[invalid URL]' })
        return route.abort('blockedbyclient')
      }
      if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
      const method = request.method().toUpperCase()
      if (url.origin !== origin) {
        report.network.externalHttpBlocked.push({ method, url: safePath(url.href), resourceType: request.resourceType() })
        return route.abort('blockedbyclient')
      }
      if (method === 'GET' || method === 'HEAD') return route.continue()
      report.network.browserWriteRequestsObserved += 1
      report.network.blockedWrites.push({ method, path: url.pathname, reason: 'Read-only history diagnostics block every browser write.' })
      return route.abort('blockedbyclient')
    })
    await context.routeWebSocket('**/*', socket => { report.network.webSocketsClosed += 1; socket.close() })
    page = await context.newPage()
    page.on('pageerror', error => report.pageErrors.push(cleanText(error.message)))
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(cleanText(message.text())) })
    page.on('requestfailed', request => {
      report.network.requestFailures.push({ method: request.method(), path: safePath(request.url()),
        failure: cleanText(request.failure()?.errorText ?? 'unknown') })
    })
    page.on('response', async response => {
      if (response.status() < 400) return
      const request = response.request()
      const url = new URL(response.url())
      if (url.origin === origin && url.pathname.startsWith('/api/')) {
        report.network.apiFailures.push({ method: request.method(), path: url.pathname, status: response.status() })
      }
    })

    await page.goto(new URL(`/canvas/${targetCanvasId}`, origin).href, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(({ expectedCanvasId, branchId, sourceId }) => {
      const host = window.__LCOS_NODE_LAB__
      return Boolean(host?.api && typeof host.api.inspectNativeHistory === 'function'
        && (host.currentCanvasId ?? host.canvasId) === expectedCanvasId
        && document.querySelector('.react-flow')
        && document.querySelector(`.react-flow__node[data-id="${branchId}"]`)
        && document.querySelector(`.react-flow__node[data-id="${sourceId}"]`)
        && document.querySelector('[data-lcos-professional-surface-state]')
          ?.getAttribute('data-lcos-professional-surface-state') === 'ready')
    }, { expectedCanvasId: targetCanvasId, branchId: branchNodeId, sourceId: sourceNodeId }, { timeout: 45000 })
    await readPageIdentity('professional-ready')
    await observeStage('ready')

    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await observeStage('after-two-frames')

    // Passive wait only: allow the vendor's existing O8 debounce to settle naturally.
    await page.waitForTimeout(1100)
    await observeStage('after-1000ms-debounce')
    await screenshot('final-read-only')
    assert.equal(report.network.browserWriteRequestsAdmitted, 0,
      'This script never admits browser write requests.')
    report.pageHistoryProvenance.observedCurrentPageIndexOnly = true
    report.pageHistoryProvenance.historySnapshotsDescribe = 'The fresh page opened above, not the earlier create page.'

    await browser.close()
    browser = null
    context = null
    await captureFinalReadback()
    report.passed = true
    report.runState = 'passed'
  } catch (error) {
    report.runState = 'failed'
    report.failure = cleanText(error instanceof Error ? `${error.name}: ${error.message}` : error)
    report.passed = false
    process.exitCode = 1
    if (page) await screenshot('failure').catch(screenshotError => {
      report.screenshotFailure = cleanText(screenshotError instanceof Error ? screenshotError.message : screenshotError)
    })
  } finally {
    if (browser) await browser.close().catch(() => undefined)
    if (!finalStateRead && scenesBeforeData && materialsBeforeData) {
      try { await captureFinalReadback() }
      catch (error) {
        finalStateError = cleanText(error instanceof Error ? error.message : error)
        report.finalReadbackFailure = finalStateError
        if (report.passed) { report.passed = false; report.runState = 'failed'; process.exitCode = 1 }
      }
    }
    report.network.browserWriteRequestsAdmitted = 0
    report.atFinished = new Date().toISOString()
    report.browserClosed = true
    await mkdir(evidenceDir, { recursive: true })
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(JSON.stringify({ runState: report.runState, passed: report.passed, reportPath,
      historyStages: report.historyObservations.map(item => item.stage),
      allThreeCanvasReadsStable: finalStateRead && !finalStateError,
      failure: report.failure ?? report.finalReadbackFailure ?? null }, null, 2))
  }
}
