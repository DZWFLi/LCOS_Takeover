import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flags = new Set(argv.filter(value => !value.includes('=')))
const valueArg = name => argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)
if (flags.has('--help') || flags.has('-h')) {
  console.log('Usage: node scripts/native-gen1-mindmap-browser.mjs --deployed --allow-target-presentation-edit [--base-url=http://127.0.0.1:17881]')
  process.exit(0)
}

const guardErrors = []
if (!flags.has('--deployed')) guardErrors.push('缺少 --deployed；不会连接服务。')
if (!flags.has('--allow-target-presentation-edit')) guardErrors.push('缺少 --allow-target-presentation-edit；不会启动浏览器或允许节点写入。')
for (const value of argv) {
  if (value.startsWith('--base-url=')) {
    try {
      const url = new URL(valueArg('--base-url'))
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
        guardErrors.push('--base-url 只能是纯 loopback HTTP origin。')
      }
    } catch { guardErrors.push('--base-url 不是有效 URL。') }
  } else if (!['--deployed', '--allow-target-presentation-edit', '--help', '-h'].includes(value)) {
    guardErrors.push(`不支持的参数：${value}`)
  }
}
if (guardErrors.length) {
  console.error(JSON.stringify({ runState: 'not-started', browserStarted: false, serviceContacted: false, errors: guardErrors }, null, 2))
  process.exitCode = 2
} else {
  await run()
}

async function run() {
  const base = new URL(valueArg('--base-url') || 'http://127.0.0.1:17881')
  const origin = base.origin
  const canvasId = 'surface-core-context'
  const nodeId = 'surface-context-text'
  const expectedH2 = '正文与 Core 版本回读 · 大纲分支回读 history-01-27-27 history-01-40-51'
  const expectedSourceSize = { width: 360, height: 280 }
  const screenshotRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const evidenceDir = path.join(root, '.runtime', 'native-gen1-mindmap')
  const reportPath = path.join(evidenceDir, `${stamp}.json`)
  const report = {
    at: new Date().toISOString(), runState: 'starting', passed: false,
    mode: 'one original Mindmap-tab presentation update; no text/Core revision write',
    target: { origin, canvasId, nodeId, expectedH2 },
    scope: 'Only the existing Context source text node. No Main/Workflow, node creation/deletion, body edit, Core write, model/provider task, synthetic API mutation, or node movement.',
    guard: { deployed: true, presentationEdit: true, exactOrigin: origin, exactSourceNode: nodeId,
      maximumAllowedCanvasBatches: 1, expectedChangedDataKeys: ['lcosTextBeforeMindMapSize', 'lcosTextViewMode'] },
    browser: { engine: 'Chrome via installed playwright-core', freshContext: true,
      viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'blocked' },
    network: { allowedOrigin: origin, externalHttpBlocked: [], blockedWrites: [], knownBackgroundWritesBlocked: [],
      unexpectedBlockedWrites: [], allowedPresentationBatches: [], apiFailures: [], providerTaskRequests: [],
      webSocketsClosed: 0, requestFailures: [] },
    reads: [], screenshots: [], pageErrors: [], consoleErrors: [], cases: [],
    noAutomaticUndoRedoOrCleanup: true,
    notes: [
      'Only the real original Mindmap tab is clicked. The source body and Core Artifact/View/Revision/FileRecord bytes are read before and after.',
      'The one admitted native batch must update only surface-context-text with the exact original mode+geometry prefs; all Core PUTs, lifecycle batches, unknown browser writes and provider calls are blocked.',
      'Any blocked writes remain in evidence. Only the two exact known offline POST paths are excluded from the final business-write assertion.',
      'No guessed layout dimensions are written: the script reads the actual original tab update and exact Canvas readback.',
    ],
  }

  let browser
  let context
  let page
  let serverStatus
  let beforeCanvas
  let sourceNode
  let beforeSize
  let beforeCore
  let stage = 'read-only-setup'
  let allowedRecord
  let admittedResponse
  const requestRecords = new WeakMap()
  const knownBackgroundPaths = new Set([
    '/api/events',
    '/api/agent-gateway/v1/conversations/suggestions/dynamic',
  ])
  const isKnownBackground = item => item.method === 'POST' && knownBackgroundPaths.has(item.path)

  const finite = value => typeof value === 'number' && Number.isFinite(value)
  const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value)
  const stable = value => JSON.stringify(value)
  const cleanText = value => String(value)
    .replace(/((?:token|secret|credential|authorization|api.?key)\s*[:=]\s*)[^\s,;]+/ig, '$1[redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/g, value => { try { const url = new URL(value); return url.origin + url.pathname } catch { return '[url]' } })
    .slice(0, 1200)
  const refSummary = value => isRecord(value) ? {
    version: value.version, entityType: value.entityType, entityId: value.entityId,
    artifactId: value.artifactId, artifactViewId: value.artifactViewId, revisionId: value.revisionId,
  } : null
  const bodyOf = node => typeof node?.data?.text === 'string' ? node.data.text
    : typeof node?.data?.content === 'string' ? node.data.content : null
  const presentationSize = node => {
    const width = [node?.style?.width, node?.width, node?.measured?.width].find(value => finite(value) && value > 0)
    const height = [node?.style?.height, node?.height, node?.measured?.height].find(value => finite(value) && value > 0)
    return { width: width ?? null, height: height ?? null }
  }
  const geometryOf = node => ({ position: node?.position ?? null, width: node?.width ?? null,
    height: node?.height ?? null, measured: node?.measured ?? null, style: node?.style ?? null })
  const nodeSnapshot = node => ({ id: String(node.id), type: node.type, body: bodyOf(node), data: node.data ?? null,
    ref: refSummary(node?.data?.lcos_ref ?? node?.lcos_ref), revisionId: node?.lcos_revision_id ?? null,
    geometry: geometryOf(node), parentId: node?.parentId ?? node?.parent_id ?? null })
  const coreRoute = suffix => `/api/lcos/core${suffix}`

  function recomputeBlockedWrites() {
    report.network.knownBackgroundWritesBlocked = report.network.blockedWrites.filter(isKnownBackground)
    report.network.unexpectedBlockedWrites = report.network.blockedWrites.filter(item => !isKnownBackground(item))
    return report.network.unexpectedBlockedWrites
  }

  async function readJson(pathname, label) {
    const response = await fetch(new URL(pathname, origin), { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error' })
    let payload = null
    try { payload = await response.json() } catch { /* preserve status evidence */ }
    report.reads.push({ label, method: 'GET', path: pathname, status: response.status,
      code: payload?.code ?? null, coreEnvelopeOk: payload?.ok === true })
    if (!response.ok) report.network.apiFailures.push({ method: 'GET', path: pathname, status: response.status,
      code: payload?.error?.code ?? payload?.code ?? null,
      message: cleanText(payload?.error?.message ?? payload?.message ?? '') })
    return { response, payload }
  }

  async function readCanvas() {
    const result = await readJson(`/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`, 'original Context Canvas projection')
    assert.equal(result.response.status, 200)
    assert.equal(result.payload?.code, 0)
    assert.ok(Array.isArray(result.payload?.data?.nodes))
    return result.payload.data
  }

  async function readCoreText() {
    const query = new URLSearchParams({ canvasId, spatialId: nodeId })
    const result = await readJson(coreRoute(`/projects/${encodeURIComponent(serverStatus.projectId)}/curation/canvas-text?${query}`),
      'Core canonical source text')
    assert.equal(result.response.status, 200)
    assert.equal(result.payload?.ok, true)
    assert.ok(isRecord(result.payload.value) && typeof result.payload.value.body === 'string')
    return result.payload.value
  }

  async function readArtifact(artifactId) {
    const result = await readJson(coreRoute(`/artifacts/${encodeURIComponent(artifactId)}`), 'Core source Artifact')
    assert.equal(result.response.status, 200)
    assert.equal(result.payload?.ok, true)
    assert.ok(isRecord(result.payload.value?.artifact))
    assert.equal(result.payload.value.artifact.id, artifactId)
    assert.equal(result.payload.value.currentRevisionId, result.payload.value.artifact.currentRevisionId)
    return result.payload.value.artifact
  }

  async function readRevisions(artifactId) {
    const result = await readJson(coreRoute(`/artifacts/${encodeURIComponent(artifactId)}/revisions`), 'Core source revision list')
    assert.equal(result.response.status, 200)
    assert.equal(result.payload?.ok, true)
    assert.ok(Array.isArray(result.payload.value))
    return result.payload.value
  }

  async function readFileBytes(fileRecordId) {
    const pathname = coreRoute(`/projects/${encodeURIComponent(serverStatus.projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`)
    const response = await fetch(new URL(pathname, origin), { headers: { Accept: '*/*' }, cache: 'no-store', redirect: 'error' })
    const bytes = Buffer.from(await response.arrayBuffer())
    report.reads.push({ label: 'Core source FileRecord bytes', method: 'GET', path: pathname,
      status: response.status, byteLength: bytes.length })
    if (!response.ok) report.network.apiFailures.push({ method: 'GET', path: pathname, status: response.status,
      code: null, message: 'Core FileRecord read failed.' })
    return { response, bytes }
  }

  async function readCoreBundle() {
    const value = await readCoreText()
    assert.equal(value.projectId, serverStatus.projectId)
    assert.equal(value.canvasId, canvasId)
    assert.equal(value.spatialId, nodeId)
    const artifact = await readArtifact(String(value.artifactId))
    const revisions = await readRevisions(String(value.artifactId))
    const revision = revisions.find(item => String(item.id) === String(value.revisionId))
    assert.ok(revision, 'Current Core source revision must remain listed.')
    const file = await readFileBytes(String(value.fileRecordId))
    assert.equal(file.response.status, 200)
    assert.equal(file.bytes.toString('utf8'), value.body, 'Core body must equal the registered FileRecord bytes exactly.')
    assert.equal(artifact.projectId, serverStatus.projectId)
    assert.equal(artifact.currentRevisionId, value.revisionId)
    assert.equal(String(revision.fileRecordId), String(value.fileRecordId))
    return { value, artifact, revisions, revision, fileRecordId: String(value.fileRecordId), file, text: file.bytes.toString('utf8') }
  }

  function exactRef(value) {
    return isRecord(value) && value.version === 1 && value.entityType === 'artifact'
      && typeof value.entityId === 'string' && value.entityId.length > 0 && value.entityId === value.artifactId
      && typeof value.artifactId === 'string' && typeof value.artifactViewId === 'string'
      && typeof value.revisionId === 'string' && value.revisionId.length > 0
  }

  function knownRevisions(body) {
    if (body.lcos_expected_revisions === undefined) return { ok: true }
    if (!isRecord(body.lcos_expected_revisions)) return { ok: false, reason: 'lcos_expected_revisions is not a record.' }
    const expectedById = new Map(beforeCanvas.nodes.map(node => [String(node.id), node.lcos_revision_id ?? node.data?.lcos_ref?.revisionId]))
    for (const [id, revision] of Object.entries(body.lcos_expected_revisions)) {
      const expected = expectedById.get(id)
      if (typeof expected !== 'string' || revision !== expected) return { ok: false, reason: `Unknown/changed Core revision echo for ${id}.` }
    }
    if (body.lcos_expected_revisions[nodeId] !== beforeCore.value.revisionId) return { ok: false, reason: 'Source CAS echo is absent or changed.' }
    return { ok: true }
  }

  function validatePresentationBatch(request) {
    let body
    try { body = request.postDataJSON() } catch { return { ok: false, reason: 'Presentation batch is not JSON.' } }
    if (!isRecord(body) || body.canvas_id !== canvasId || !Array.isArray(body.actions) || body.actions.length !== 1) {
      return { ok: false, reason: 'Only one update action on the exact Context canvas is in scope.' }
    }
    const allowedTop = new Set(['canvas_id', 'actions', 'lcos_expected_revisions', 'lcos_refs', 'created_by_role', 'session_id'])
    if (Object.keys(body).some(key => !allowedTop.has(key))) return { ok: false, reason: 'Unexpected top-level batch metadata.' }
    if (body.created_by_role !== undefined && body.created_by_role !== 'user') return { ok: false, reason: 'Write is not attributed to the original user.' }
    if (body.session_id !== undefined && (typeof body.session_id !== 'string' || !body.session_id.trim())) return { ok: false, reason: 'Invalid native session metadata.' }
    const revisions = knownRevisions(body)
    if (!revisions.ok) return revisions
    if (body.lcos_refs !== undefined && (!isRecord(body.lcos_refs)
      || Object.keys(body.lcos_refs).some(id => id !== nodeId)
      || body.lcos_refs[nodeId] !== undefined && stable(refSummary(body.lcos_refs[nodeId])) !== stable(refSummary(sourceNode.data?.lcos_ref)))) {
      return { ok: false, reason: 'Reference echo is not the exact source Artifact/View/Revision.' }
    }
    const action = body.actions[0]
    if (!isRecord(action) || action.action !== 'update' || Object.keys(action).some(key => !['action', 'updates', 'canvas_id'].includes(key))
      || action.canvas_id !== undefined && action.canvas_id !== canvasId
      || !Array.isArray(action.updates) || action.updates.length !== 1) {
      return { ok: false, reason: 'Only one original update DTO is admitted.' }
    }
    const update = action.updates[0]
    if (!isRecord(update) || update.id !== nodeId) return { ok: false, reason: 'Update is not for the exact source NodeID.' }
    const allowedUpdate = new Set(['id', 'type', 'data', 'position', 'measured', 'lcos_ref', 'parent_id'])
    if (Object.keys(update).some(key => !allowedUpdate.has(key))) return { ok: false, reason: 'Unsupported native update fields.' }
    if (update.parent_id !== undefined && (update.parent_id !== '' || sourceNode.parentId || sourceNode.parent_id)) {
      return { ok: false, reason: 'Only the unchanged root-parent echo is supported.' }
    }
    if (update.type !== undefined && !['note', 'text'].includes(update.type)) return { ok: false, reason: 'Original Canvas renderer type changed.' }
    if (!isRecord(update.position) || !finite(update.position.x) || !finite(update.position.y)) return { ok: false, reason: 'Presentation update needs finite native position.' }
    if (!isRecord(update.measured) || !finite(update.measured.width) || update.measured.width <= 0
      || !finite(update.measured.height) || update.measured.height <= 0) return { ok: false, reason: 'Presentation geometry must be positive and finite.' }
    if (update.lcos_ref !== undefined && stable(refSummary(update.lcos_ref)) !== stable(refSummary(sourceNode.data?.lcos_ref))) {
      return { ok: false, reason: 'Top-level Core ref echo changed.' }
    }
    if (!isRecord(update.data)) return { ok: false, reason: 'Original update must preserve its complete text DTO data.' }

    const allowedData = new Set(['id', 'title', 'label', 'text', 'content', 'prompt', 'params', 'lcos_ref',
      'lcosTextViewMode', 'lcosTextCollapsedIds', 'lcosTextBeforeMindMapSize'])
    const changedDataKeys = []
    for (const [key, value] of Object.entries(update.data)) {
      if (!allowedData.has(key)) return { ok: false, reason: `Unsupported source data field ${key}.` }
      const oldValue = sourceNode.data?.[key]
      if (stable(value) !== stable(oldValue)) changedDataKeys.push(key)
      if (key === 'lcosTextViewMode' && value !== 'mindmap') return { ok: false, reason: 'Original mindmap tab must set mindmap mode.' }
      if (key === 'lcosTextBeforeMindMapSize' && stable(value) !== stable(beforeSize)) return { ok: false, reason: 'Stored prior text size must equal measured original size.' }
      if (key === 'lcosTextCollapsedIds' && stable(value) !== stable(sourceNode.data?.lcosTextCollapsedIds)) return { ok: false, reason: 'Collapsed outline preference must stay unchanged.' }
      if ((key === 'text' || key === 'content') && value !== beforeCore.value.body) return { ok: false, reason: 'Presentation update changed canonical text.' }
      if (key === 'lcos_ref' && stable(refSummary(value)) !== stable(refSummary(sourceNode.data?.lcos_ref))) return { ok: false, reason: 'Data ref must stay the exact primary Core identity.' }
      if (!['lcosTextViewMode', 'lcosTextBeforeMindMapSize', 'lcosTextCollapsedIds', 'text', 'content', 'lcos_ref'].includes(key)
        && stable(value) !== stable(oldValue)) return { ok: false, reason: `Non-presentation field ${key} changed.` }
    }
    if (update.data.lcosTextViewMode !== 'mindmap'
      || stable(update.data.lcosTextBeforeMindMapSize) !== stable(beforeSize)) {
      return { ok: false, reason: 'Native tab update must carry mode=mindmap and the exact text-size restore preference.' }
    }
    if (changedDataKeys.some(key => !['lcosTextViewMode', 'lcosTextBeforeMindMapSize'].includes(key))) {
      return { ok: false, reason: `Unrelated Canvas data changed: ${changedDataKeys.join(',')}.` }
    }
    const newSize = { width: update.measured.width, height: update.measured.height }
    const expectedPosition = {
      x: sourceNode.position.x + (beforeSize.width - newSize.width) / 2,
      y: sourceNode.position.y + (beforeSize.height - newSize.height) / 2,
    }
    if (update.position.x !== expectedPosition.x || update.position.y !== expectedPosition.y) {
      return { ok: false, reason: 'Position is not the original centered mode+geometry transition.' }
    }
    if (newSize.width === beforeSize.width && newSize.height === beforeSize.height) {
      return { ok: false, reason: 'The original Mindmap tab did not produce its actual layout geometry.' }
    }
    return { ok: true, body, update, changedDataKeys, newSize, expectedPosition }
  }

  function sourceSnapshot(canvas) {
    const nodes = canvas.nodes.map(node => nodeSnapshot(node))
    const source = canvas.nodes.find(node => String(node.id) === nodeId)
    return { nodes, source: nodeSnapshot(source) }
  }

  function assertNonTargetNodesUnchanged(before, after, label) {
    const beforeMap = new Map(before.nodes.map(node => [node.id, node]))
    const afterMap = new Map(after.nodes.map(node => [node.id, node]))
    assert.deepEqual([...afterMap.keys()].sort(), [...beforeMap.keys()].sort(), `${label}: node IDs/count must not change.`)
    for (const [id, prior] of beforeMap) {
      if (id === nodeId) continue
      assert.equal(stable(afterMap.get(id)), stable(prior), `${label}: non-target node ${id} changed.`)
    }
    return { exactNodeCount: beforeMap.size, nonTargetNodesByteStable: true }
  }

  async function waitForCanvas(predicate, label, timeoutMs = 25000) {
    const deadline = Date.now() + timeoutMs
    let canvas
    do {
      canvas = await readCanvas()
      const found = predicate(canvas)
      if (found) return { canvas, value: found }
      await new Promise(resolve => setTimeout(resolve, 160))
    } while (Date.now() < deadline)
    throw new Error(`${label} did not persist through original Canvas GET.`)
  }

  async function screenshot(label, locator = null) {
    await mkdir(screenshotRoot, { recursive: true })
    const pagePath = path.join(screenshotRoot, `tapnow-native-gen1-mindmap-${stamp}-${label}.png`)
    await page.screenshot({ path: pagePath, fullPage: false })
    report.screenshots.push({ label, kind: 'full-viewport', path: pagePath })
    if (locator) {
      const nodePath = path.join(screenshotRoot, `tapnow-native-gen1-mindmap-${stamp}-${label}-node.png`)
      await locator.screenshot({ path: nodePath })
      report.screenshots.push({ label, kind: 'exact-source-node', path: nodePath })
    }
  }

  async function closeOriginalAgentPanelIfOpen() {
    const panel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (!await panel.count() || !await panel.isVisible()) return
    report.agentPanelClose ??= []
    const item = { text: (await panel.innerText()).slice(0, 500), screenshot: null, action: null }
    report.agentPanelClose.push(item)
    await screenshot(`agent-panel-before-close-${report.agentPanelClose.length}`)
    item.screenshot = report.screenshots.at(-1)?.path ?? null
    await page.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
    await panel.waitFor({ state: 'hidden', timeout: 10000 })
    item.action = 'Original close button clicked; no project content edited.'
  }

  async function inspectExposedTextPoint(nodeLocator) {
    return nodeLocator.evaluate(node => {
      const expectedNodeId = node.closest('.react-flow__node[data-id]')?.getAttribute('data-id');
      const candidates = [...node.querySelectorAll('[data-lcos-node-preview], .lcos-document-title, .lcos-text-face-content, .lcos-document-full')]
        .filter(candidate => (candidate.textContent || '').trim() && candidate.getBoundingClientRect().width > 0
          && candidate.getBoundingClientRect().height > 0)
      const fractions = [.2, .35, .5, .65, .8]
      const probes = []
      for (const candidate of [...candidates, node]) {
        const rect = candidate.getBoundingClientRect()
        for (const fx of fractions) for (const fy of fractions) {
          const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy
          const hit = document.elementFromPoint(x, y)
          const hitNode = hit?.closest?.('.react-flow__node[data-id]') ?? null
          const control = hit?.closest?.('button,input,textarea,select,a,[role="button"],[role="tab"],[data-floating-chrome]') ?? null
          const exposed = Boolean(hit && node.contains(hit) && !control
            && hitNode?.getAttribute('data-id') === expectedNodeId)
          probes.push({ x, y, hitClass: hit?.className?.toString?.() ?? null,
            closestNodeId: hitNode?.getAttribute('data-id') ?? null, interactive: Boolean(control), exposed })
        }
      }
      const accepted = probes.find(item => item.exposed)
      return { exposed: Boolean(accepted), point: accepted ? { x: accepted.x, y: accepted.y } : null,
        hit: accepted ?? null, probes: probes.filter(item => item.exposed || item.closestNodeId !== expectedNodeId).slice(0, 24) }
    })
  }

  async function inspectButtonPoint(locator) {
    return locator.evaluate(button => {
      const rect = button.getBoundingClientRect()
      const probes = []
      for (const fx of [.2, .35, .5, .65, .8]) for (const fy of [.2, .35, .5, .65, .8]) {
        const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy
        const hit = document.elementFromPoint(x, y)
        const exposed = Boolean(hit && (hit === button || button.contains(hit)))
        probes.push({ x, y, hitTag: hit?.tagName ?? null, hitClass: hit?.className?.toString?.() ?? null, exposed })
      }
      const accepted = probes.find(item => item.exposed)
      return { exposed: Boolean(accepted), point: accepted ? { x: accepted.x, y: accepted.y } : null,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        probes: probes.filter(item => item.exposed).slice(0, 5) }
    })
  }

  async function waitForBatchObservation(response, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (allowedRecord?.processed) {
        assert.equal(admittedResponse, response, 'Batch response must match the one admitted native update.')
        assert.equal(allowedRecord.validationError, undefined, allowedRecord.validationError ?? 'Batch response validation failed.')
        return allowedRecord
      }
      await new Promise(resolve => setTimeout(resolve, 40))
    }
    throw new Error('The original native presentation batch response was not observed.')
  }

  function validateBatchResponse(record, response, payload) {
    record.status = response.status()
    record.code = payload?.code ?? null
    record.coreSaved = payload?.data?.core_saved ?? null
    record.spatialSaved = payload?.data?.spatial_saved ?? null
    record.expectedRevisions = payload?.data?.lcos_expected_revisions ?? null
    assert.equal(response.status(), 200)
    assert.equal(payload?.code, 0)
    assert.equal(payload?.data?.canvas_id, canvasId)
    assert.equal(payload?.data?.core_saved, false, 'A presentation-only update must not create or revise Core body text.')
    assert.equal(payload?.data?.spatial_saved, true)
    assert.ok(Array.isArray(payload?.data?.nodes))
  }

  async function assertPageIdentity(label) {
    const identity = await page.evaluate(sourceId => {
      const host = window.__LCOS_NODE_LAB__
      const api = host?.api
      const node = api?.getNode?.(sourceId)
      return { pathname: location.pathname, canvasId: host?.currentCanvasId ?? host?.canvasId ?? null,
        nodeBridgePresent: Boolean(api), reactFlowRoots: document.querySelectorAll('.react-flow').length,
        source: node ? { id: String(node.id), ref: node.data?.lcos_ref ?? node.lcos_ref ?? null } : null,
        dialogs: [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
          .filter(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 })
          .map(element => (element.textContent || '').trim().slice(0, 80)),
      }
    }, nodeId)
    report.pageIdentity ??= {}
    report.pageIdentity[label] = identity
    assert.equal(identity.pathname, `/canvas/${canvasId}`)
    assert.equal(identity.canvasId, canvasId)
    assert.equal(identity.nodeBridgePresent, true)
    assert.equal(identity.reactFlowRoots, 1)
    assert.deepEqual(identity.dialogs, [])
    assert.ok(identity.source)
    assert.equal(identity.source.id, nodeId)
    assert.equal(stable(refSummary(identity.source.ref)), stable(refSummary(sourceNode.data?.lcos_ref)))
    return identity
  }

  try {
    const healthRead = await readJson('/health', 'deployed real-Core integration health')
    assert.equal(healthRead.response.status, 200)
    assert.equal(healthRead.payload?.realCoreConnected, true)
    assert.equal(healthRead.payload?.profile, 'original-tapnow-full-integration-in-progress')
    assert.equal(healthRead.payload?.port, 17881)
    assert.equal(healthRead.payload?.bind, '127.0.0.1')
    assert.ok(Number.isInteger(healthRead.payload?.pid) && healthRead.payload.pid > 0)
    const statusRead = await readJson('/api/surface-core/status', 'Surface Core project/workspaces')
    assert.equal(statusRead.response.status, 200)
    assert.equal(statusRead.payload?.code, 0)
    serverStatus = statusRead.payload.data
    assert.equal(typeof serverStatus.projectId, 'string')
    const workspace = serverStatus.workspaces?.find(item => item.canvasId === canvasId && item.preferredSurface === 'context')
      ?? serverStatus.workspaces?.find(item => item.canvasId === canvasId)
    assert.ok(workspace, 'The existing Context workspace must own the target canvas.')
    report.server = { pid: healthRead.payload.pid, profile: healthRead.payload.profile ?? null,
      projectId: serverStatus.projectId, coreConnected: serverStatus.core?.connected ?? null,
      workspace: { id: workspace.id, canvasId: workspace.canvasId, preferredSurface: workspace.preferredSurface } }

    beforeCanvas = await readCanvas()
    assert.equal(beforeCanvas.id, canvasId)
    assert.equal(beforeCanvas.nodes.length, 9, 'Prepared Context state must contain the exact existing nine nodes.')
    const matches = beforeCanvas.nodes.filter(node => String(node.id) === nodeId)
    assert.equal(matches.length, 1)
    sourceNode = matches[0]
    assert.ok(['text', 'note'].includes(sourceNode.type))
    assert.equal(sourceNode.data?.lcosTextViewMode, 'text', 'The target must begin in original Text mode; the script does not switch canvases or restore state.')
    beforeSize = presentationSize(sourceNode)
    assert.deepEqual(beforeSize, expectedSourceSize, 'Stop before browser startup if the prepared Text source is no longer 360×280.')
    assert.ok(sourceNode.position && finite(sourceNode.position.x) && finite(sourceNode.position.y))
    assert.ok(exactRef(sourceNode.data?.lcos_ref), 'Target must already have its exact primary Core Artifact reference.')
    beforeCore = await readCoreBundle()
    assert.equal(sourceNode.data.lcos_ref.artifactId, beforeCore.value.artifactId)
    assert.equal(sourceNode.data.lcos_ref.artifactViewId, beforeCore.value.viewId)
    assert.equal(sourceNode.data.lcos_ref.revisionId, beforeCore.value.revisionId)
    assert.equal(bodyOf(sourceNode), beforeCore.value.body)
    assert.equal(beforeCore.value.body.split(/\r\n|\r|\n/).filter(line => line === `## ${expectedH2}`).length, 1,
      'Core source must contain the exact expected H2 heading once.')
    assert.equal(beforeCore.revisions.length, 8, 'The prepared Core source must have its known eight revisions before presentation setup.')
    report.before = { node: nodeSnapshot(sourceNode), size: beforeSize,
      core: { projectId: beforeCore.value.projectId, canvasId: beforeCore.value.canvasId, spatialId: beforeCore.value.spatialId,
        artifactId: beforeCore.value.artifactId, viewId: beforeCore.value.viewId, revisionId: beforeCore.value.revisionId,
        fileRecordId: beforeCore.fileRecordId, revisionCount: beforeCore.revisions.length,
        revisionIds: beforeCore.revisions.map(item => String(item.id)), fileByteLength: beforeCore.file.bytes.length,
        exactFileBytes: true, body: beforeCore.value.body },
      nodeCount: beforeCanvas.nodes.length,
      otherNodes: beforeCanvas.nodes.filter(node => String(node.id) !== nodeId).map(node => nodeSnapshot(node)) }

    const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' })
    await context.route('**/*', async route => {
      const request = route.request()
      let url
      try { url = new URL(request.url()) } catch {
        report.network.blockedWrites.push({ method: request.method(), path: '[invalid URL]', reason: 'Invalid request URL.' })
        return route.abort('blockedbyclient')
      }
      const method = request.method().toUpperCase()
      if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
      if (url.origin !== origin) {
        report.network.externalHttpBlocked.push({ method, url: url.origin + url.pathname, resourceType: request.resourceType() })
        return route.abort('blockedbyclient')
      }
      if (method === 'GET' || method === 'HEAD') return route.continue()
      const batchPath = `/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`
      if (method === 'POST' && url.pathname === batchPath && stage === 'presentation-armed' && !allowedRecord) {
        const validation = validatePresentationBatch(request)
        if (validation.ok) {
          allowedRecord = { method, path: url.pathname, status: null, phase: 'text-to-mindmap', targetNodeId: nodeId,
            operation: 'original Mindmap tab', changedDataKeys: validation.changedDataKeys,
            request: { update: validation.update, newSize: validation.newSize, expectedPosition: validation.expectedPosition },
            payload: null, processed: false }
          report.network.allowedPresentationBatches.push(allowedRecord)
          stage = 'presentation-routed'
          requestRecords.set(request, allowedRecord)
          return route.continue()
        }
        report.network.blockedWrites.push({ method, path: url.pathname, stage, reason: validation.reason })
        return route.abort('blockedbyclient')
      }
      if (/(?:^|\/)(?:runs?|generate|generation|execute|completions?|inference|provider)(?:\/|$)/i.test(url.pathname)) {
        report.network.providerTaskRequests.push({ method, path: url.pathname, blocked: true })
      }
      report.network.blockedWrites.push({ method, path: url.pathname,
        reason: method === 'POST' && url.pathname === batchPath ? `No authorized target presentation update is armed (stage=${stage}).`
          : 'Only the one exact presentation update is allowed.' })
      return route.abort('blockedbyclient')
    })
    await context.routeWebSocket('**/*', socket => { report.network.webSocketsClosed += 1; socket.close() })
    page = await context.newPage()
    page.on('pageerror', error => report.pageErrors.push(cleanText(error.message)))
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(cleanText(message.text())) })
    page.on('requestfailed', request => {
      let url
      try { url = new URL(request.url()) } catch { url = new URL('http://invalid/') }
      report.network.requestFailures.push({ method: request.method(), path: url.origin + url.pathname,
        failure: cleanText(request.failure()?.errorText ?? 'unknown') })
    })
    page.on('response', async response => {
      const request = response.request()
      const record = requestRecords.get(request)
      let payload = null
      if (/json/i.test(response.headers()['content-type'] ?? '')) {
        try { payload = await response.json() } catch { payload = null }
      }
      if (record) {
        admittedResponse = response
        record.payload = payload
        try { validateBatchResponse(record, response, payload) }
        catch (error) { record.validationError = cleanText(error instanceof Error ? error.message : error) }
        record.processed = true
      }
      const url = new URL(response.url())
      if (url.origin === origin && url.pathname.startsWith('/api/') && response.status() >= 400) {
        report.network.apiFailures.push({ method: request.method(), path: url.pathname, status: response.status(),
          code: payload?.error?.code ?? payload?.code ?? null,
          message: cleanText(payload?.error?.message ?? payload?.message ?? '') })
        if (/(?:^|\/)(?:runs?|generate|generation|execute|completions?|inference|provider)(?:\/|$)/i.test(url.pathname)) {
          report.network.providerTaskRequests.push({ method: request.method(), path: url.pathname, status: response.status(), blocked: false })
        }
      }
    })

    await page.goto(new URL(`/canvas/${canvasId}`, origin).href, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(id => Boolean(window.__LCOS_NODE_LAB__?.api)
      && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === id
      && document.querySelector('.react-flow'), canvasId, { timeout: 30000 })
    const targetNode = page.locator(`.react-flow__node[data-id="${nodeId}"]`)
    await targetNode.waitFor({ state: 'visible', timeout: 30000 })
    const nativeBody = targetNode.locator(`[data-lcos-native-text-body="${nodeId}"]`)
    await nativeBody.waitFor({ state: 'visible', timeout: 15000 })
    await targetNode.locator('[data-lcos-inline-text][data-state="ready"]').waitFor({ state: 'visible', timeout: 30000 })
    await closeOriginalAgentPanelIfOpen()
    await assertPageIdentity('initial')
    const tab = targetNode.locator('[data-lcos-text-face-mode="mindmap"]')
    assert.equal(await tab.getAttribute('aria-selected'), 'false', 'The original Canvas must still present Text before the user action.')
    await screenshot('text-mode-before', targetNode)

    const selectionBefore = await page.evaluate(id => {
      const node = document.querySelector(`.react-flow__node[data-id="${id}"]`)
      const selection = window.__LCOS_NODE_LAB__?.api?.getSelection?.()
      return { selectedClass: Boolean(node?.classList.contains('selected')),
        selectedNodeIds: Array.isArray(selection?.nodeIds) ? selection.nodeIds.map(String) : [] }
    }, nodeId)
    report.selection = { before: selectionBefore, exposedPoint: null, after: null, naturallyRaised: false }
    if (!selectionBefore.selectedClass && !selectionBefore.selectedNodeIds.includes(nodeId)) {
      const exposed = await inspectExposedTextPoint(nativeBody)
      report.selection.exposedPoint = exposed
      assert.equal(exposed.exposed, true, 'Before selection, scan a visible non-control point in the original text body; never click through an overlapping card.')
      assert.equal(exposed.hit?.closestNodeId, nodeId)
      await page.mouse.click(exposed.point.x, exposed.point.y)
      await page.waitForFunction(id => {
        const node = document.querySelector(`.react-flow__node[data-id="${id}"]`)
        const selected = window.__LCOS_NODE_LAB__?.api?.getSelection?.()?.nodeIds?.map(String) ?? []
        return Boolean(node?.classList.contains('selected') || selected.includes(id))
      }, nodeId, { timeout: 10000 })
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const after = await page.evaluate(id => {
        const node = document.querySelector(`.react-flow__node[data-id="${id}"]`)
        const selection = window.__LCOS_NODE_LAB__?.api?.getSelection?.()
        return { selectedClass: Boolean(node?.classList.contains('selected')),
          selectedNodeIds: Array.isArray(selection?.nodeIds) ? selection.nodeIds.map(String) : [] }
      }, nodeId)
      assert.ok(after.selectedClass || after.selectedNodeIds.includes(nodeId))
      report.selection.after = after
      report.selection.naturallyRaised = true
      await screenshot('source-naturally-selected', targetNode)
    } else {
      report.selection.after = selectionBefore
      report.selection.naturallyRaised = true
    }

    const tabPoint = await inspectButtonPoint(tab)
    report.mindmapTabExposure = tabPoint
    assert.equal(tabPoint.exposed, true, 'The original Mindmap tab must have a real exposed pointer point.')
    stage = 'presentation-armed'
    const responsePromise = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.origin === origin
        && url.pathname === `/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`
    }, { timeout: 45000 })
    await page.mouse.click(tabPoint.point.x, tabPoint.point.y)
    report.tabClick = { input: 'real mouse click on exact original Mindmap tab', tabLabel: await tab.innerText(),
      point: tabPoint.point, force: false, apiMutationCall: false }
    await page.waitForFunction(() => document.querySelector('[data-lcos-text-face-mode="mindmap"]')?.getAttribute('aria-selected') === 'true',
      null, { timeout: 15000 })
    const response = await responsePromise
    const record = await waitForBatchObservation(response)
    assert.equal(record.validationError, undefined)
    assert.equal(report.network.allowedPresentationBatches.length, 1)
    report.network.allowedPresentationBatches[0] = record

    const mappedRead = await waitForCanvas(canvas => canvas.nodes.find(item => String(item.id) === nodeId
      && item.data?.lcosTextViewMode === 'mindmap'), 'original Mindmap preference and geometry')
    const mappedNode = mappedRead.value
    const mappedSize = presentationSize(mappedNode)
    assert.ok(finite(mappedSize.width) && mappedSize.width > 0 && finite(mappedSize.height) && mappedSize.height > 0)
    assert.equal(stable(mappedNode.data?.lcosTextBeforeMindMapSize), stable(beforeSize))
    assert.equal(stable(mappedNode.data?.lcosTextCollapsedIds), stable(sourceNode.data?.lcosTextCollapsedIds))
    assert.equal(bodyOf(mappedNode), beforeCore.value.body)
    assert.equal(stable(refSummary(mappedNode.data?.lcos_ref)), stable(refSummary(sourceNode.data?.lcos_ref)))
    assert.deepEqual(mappedNode.measured && { width: mappedNode.measured.width, height: mappedNode.measured.height }, record.request.newSize)
    assert.deepEqual(mappedNode.position, record.request.expectedPosition)
    await screenshot('mindmap-mode-receipted', targetNode)

    const afterCore = await readCoreBundle()
    assert.equal(afterCore.value.artifactId, beforeCore.value.artifactId)
    assert.equal(afterCore.value.viewId, beforeCore.value.viewId)
    assert.equal(afterCore.value.revisionId, beforeCore.value.revisionId)
    assert.equal(afterCore.fileRecordId, beforeCore.fileRecordId)
    assert.equal(afterCore.value.body, beforeCore.value.body)
    assert.equal(afterCore.text, beforeCore.text)
    assert.deepEqual(afterCore.revisions.map(item => String(item.id)), beforeCore.revisions.map(item => String(item.id)))
    const afterCanvas = await readCanvas()
    const afterSource = afterCanvas.nodes.find(item => String(item.id) === nodeId)
    const afterSnap = sourceSnapshot(afterCanvas)
    report.transition = { batch: record, modeBefore: sourceNode.data.lcosTextViewMode,
      modeAfter: afterSource.data.lcosTextViewMode,
      beforeSize, afterSize: mappedSize, storedBeforeMindMapSize: afterSource.data.lcosTextBeforeMindMapSize,
      geometryBefore: geometryOf(sourceNode), geometryAfter: geometryOf(afterSource),
      primaryRefBefore: refSummary(sourceNode.data.lcos_ref), primaryRefAfter: refSummary(afterSource.data.lcos_ref),
      coreBodyUnchanged: afterCore.value.body === beforeCore.value.body,
      revisionIdUnchanged: afterCore.value.revisionId === beforeCore.value.revisionId,
      revisionCountBefore: beforeCore.revisions.length, revisionCountAfter: afterCore.revisions.length,
      fileRecordIdBefore: beforeCore.fileRecordId, fileRecordIdAfter: afterCore.fileRecordId,
      exactFileBytesUnchanged: afterCore.file.bytes.equals(beforeCore.file.bytes),
      nonTargetInvariants: assertNonTargetNodesUnchanged(sourceSnapshot(beforeCanvas), afterSnap, 'presentation update') }
    report.cases.push({ name: 'original Mindmap tab performs one native mode+geometry update without revising Core text', passed: true })

    stage = 'read-only-reload'
    await page.waitForTimeout(500)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(id => Boolean(window.__LCOS_NODE_LAB__?.api)
      && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === id
      && document.querySelector('.react-flow'), canvasId, { timeout: 30000 })
    const reloadedNodeDom = page.locator(`.react-flow__node[data-id="${nodeId}"]`)
    await reloadedNodeDom.waitFor({ state: 'visible', timeout: 30000 })
    await reloadedNodeDom.locator('[data-lcos-inline-text][data-state="ready"]').waitFor({ state: 'visible', timeout: 30000 })
    await closeOriginalAgentPanelIfOpen()
    await assertPageIdentity('after-reload')
    await reloadedNodeDom.locator('[data-lcos-text-face-mode="mindmap"]').waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await reloadedNodeDom.locator('[data-lcos-text-face-mode="mindmap"]').getAttribute('aria-selected'), 'true')
    const reloadedCanvas = await readCanvas()
    const reloadedNode = reloadedCanvas.nodes.find(item => String(item.id) === nodeId)
    assert.equal(reloadedNode.data?.lcosTextViewMode, 'mindmap')
    assert.equal(stable(reloadedNode.data?.lcosTextBeforeMindMapSize), stable(beforeSize))
    assert.equal(stable(reloadedNode.data?.lcosTextCollapsedIds), stable(sourceNode.data?.lcosTextCollapsedIds))
    assert.equal(stable(presentationSize(reloadedNode)), stable(mappedSize))
    assert.equal(stable(geometryOf(reloadedNode)), stable(geometryOf(mappedNode)))
    assert.equal(bodyOf(reloadedNode), beforeCore.value.body)
    assert.equal(stable(refSummary(reloadedNode.data?.lcos_ref)), stable(refSummary(sourceNode.data?.lcos_ref)))
    const reloadedCore = await readCoreBundle()
    assert.equal(reloadedCore.value.artifactId, beforeCore.value.artifactId)
    assert.equal(reloadedCore.value.viewId, beforeCore.value.viewId)
    assert.equal(reloadedCore.value.revisionId, beforeCore.value.revisionId)
    assert.equal(reloadedCore.fileRecordId, beforeCore.fileRecordId)
    assert.equal(reloadedCore.value.body, beforeCore.value.body)
    assert.equal(reloadedCore.file.bytes.toString('utf8'), beforeCore.file.bytes.toString('utf8'))
    assert.deepEqual(reloadedCore.revisions.map(item => String(item.id)), beforeCore.revisions.map(item => String(item.id)))
    const reloadedSnap = sourceSnapshot(reloadedCanvas)
    report.reload = { page: 'same original Context Canvas', inlineTextReadReady: true,
      mode: reloadedNode.data.lcosTextViewMode, currentGeometry: geometryOf(reloadedNode),
      storedBeforeMindMapSize: reloadedNode.data.lcosTextBeforeMindMapSize,
      livePrimaryRef: refSummary(reloadedNode.data.lcos_ref), coreArtifactId: reloadedCore.value.artifactId,
      coreViewId: reloadedCore.value.viewId, coreRevisionId: reloadedCore.value.revisionId,
      fileRecordId: reloadedCore.fileRecordId, exactBodyAndFileBytesUnchanged: true,
      revisionCountBefore: beforeCore.revisions.length, revisionCountAfter: reloadedCore.revisions.length,
      nonTargetInvariants: assertNonTargetNodesUnchanged(sourceSnapshot(beforeCanvas), reloadedSnap, 'after reload') }
    await screenshot('mindmap-mode-after-reload', reloadedNodeDom)
    report.cases.push({ name: 'reload keeps Mindmap preference/geometry and the same primary Core identity with unchanged eight-version body', passed: true })

    assert.equal(report.network.allowedPresentationBatches.length, 1, 'Exactly one target presentation batch is allowed.')
    assert.equal(report.network.providerTaskRequests.length, 0, 'No model/provider request may be submitted or allowed.')
    const unknownWrites = recomputeBlockedWrites()
    assert.equal(unknownWrites.length, 0, 'Only the two exact known offline POST paths are excluded; unknown, Canvas, Core and provider writes fail.')
    report.final = { sourceBodyAndCoreRevisionUnchanged: true, coreRevisionCount: beforeCore.revisions.length,
      targetMode: 'mindmap', allowedPresentationBatchCount: 1,
      knownBackgroundWritesBlocked: report.network.knownBackgroundWritesBlocked.length,
      unexpectedBlockedWrites: report.network.unexpectedBlockedWrites.length,
      providerTaskRequests: report.network.providerTaskRequests.length,
      pageErrors: report.pageErrors, consoleErrors: report.consoleErrors,
      backgroundApiFailures: report.network.apiFailures }
    report.passed = true
    report.runState = 'passed'
  } catch (error) {
    report.runState = 'failed'
    report.failureStage = stage
    report.failure = cleanText(error instanceof Error ? `${error.name}: ${error.message}` : error)
    report.noAutomaticRollbackOrRetry = true
    report.note = allowedRecord
      ? 'A presentation batch may have persisted; the script did not toggle it back or retry. Keep the recorded NodeID/state for read-only inspection.'
      : 'No lifecycle or Core write was authorized; no cleanup or resubmission was attempted.'
    if (page) {
      report.failurePage = await page.evaluate(id => ({ title: document.title, pathname: location.pathname,
        canvasId: window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId ?? null,
        source: window.__LCOS_NODE_LAB__?.api?.getNode?.(id) ?? null,
        reactFlowRoots: document.querySelectorAll('.react-flow').length,
      }), nodeId).catch(() => null)
      await screenshot('failure').catch(error => { report.screenshotFailure = cleanText(error?.message || error) })
    }
    process.exitCode = 1
  } finally {
    if (browser) await browser.close().catch(() => undefined)
    const unknownAfterClose = recomputeBlockedWrites()
    if (report.passed && unknownAfterClose.length) {
      report.passed = false
      report.runState = 'failed'
      report.failureStage = 'post-browser-write-audit'
      report.failure = `${unknownAfterClose.length} unknown browser write(s) were blocked.`
      process.exitCode = 1
    }
    if (report.final) {
      report.final.knownBackgroundWritesBlocked = report.network.knownBackgroundWritesBlocked.length
      report.final.unexpectedBlockedWrites = report.network.unexpectedBlockedWrites.length
    }
    report.atFinished = new Date().toISOString()
    report.browserClosed = true
    report.presentationWritesStopped = true
    await mkdir(evidenceDir, { recursive: true })
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(JSON.stringify({ runState: report.runState, passed: report.passed,
      reportPath, failure: report.failure ?? null }, null, 2))
  }
}
