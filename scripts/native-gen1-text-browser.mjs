import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const valueArg = name => process.argv.slice(2).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)
const requestedPhase = valueArg('--phase') || (args.has('--readback-only') ? 'load' : null)
const phases = new Set(['load', 'edit', 'format', 'faces', 'outline'])
const writePhase = ['edit', 'format', 'faces', 'outline'].includes(requestedPhase)
const guardErrors = []
if (!args.has('--deployed')) guardErrors.push('缺少 --deployed；脚本不会访问服务。')
if (!requestedPhase || !phases.has(requestedPhase)) guardErrors.push('请提供 --phase=load|edit|format|faces|outline。')
if (args.has('--save-heading-format') && requestedPhase !== 'format') guardErrors.push('--save-heading-format 仅用于 format 阶段。')
if (args.has('--readback-only') && requestedPhase !== 'load') guardErrors.push('--readback-only 只能搭配 load 阶段。')
if (writePhase && !args.has('--allow-target-text-edits')) guardErrors.push('写阶段必须显式带 --allow-target-text-edits。')

if (guardErrors.length) {
  console.error(JSON.stringify({ runState: 'not-started', errors: guardErrors }, null, 2))
  process.exitCode = 2
} else {
  await run()
}

async function run() {
  const baseUrl = valueArg('--base-url') || 'http://127.0.0.1:17881'
  const base = new URL(baseUrl)
  assert.equal(base.protocol, 'http:', 'Only the explicitly local HTTP deployment is in scope.')
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'The browser must stay on loopback.')
  assert.equal(base.pathname, '/', 'Pass only an origin, not a route prefix.')
  assert.equal(base.search, '')
  assert.equal(base.hash, '')
  const origin = base.origin
  const canvasId = 'surface-core-context'
  const nodeId = 'surface-context-text'
  const artifactId = 'artifact-text-b61f2255-6755-467b-8a5f-0c2cf6fe27cd'
  const headingOne = 'Gen1 原生文本验收'
  const headingTwo = '正文与 Core 版本回读'
  const outlineSuffix = ' · 大纲分支回读'
  const outlineHeading = headingTwo + outlineSuffix
  const screenshotRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const evidenceDir = path.join(root, '.runtime', 'native-gen1-text')
  const reportPath = path.join(evidenceDir, `${stamp}-${requestedPhase}.json`)
  const report = {
    at: new Date().toISOString(),
    runState: 'starting',
    mode: args.has('--readback-only') ? 'readback-only' : writePhase ? 'explicit target text edit enabled' : 'read-only load',
    target: { origin, route: `/canvas/${canvasId}`, canvasId, nodeId, artifactId, phase: requestedPhase },
    scope: 'Context only; one pre-existing Core-bound text node. No Main/Workflow navigation, fixture creation/deletion, provider task or non-target write.',
    browser: { engine: 'Chrome', freshContext: true, viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'blocked' },
    guard: { deployedFlag: true, targetTextEditsFlag: args.has('--allow-target-text-edits'), readbackOnly: args.has('--readback-only') },
    network: { allowedOrigin: origin, externalHttpBlocked: [], blockedWrites: [], webSocketsClosed: 0,
      allowedTargetBatches: [], apiFailures: [], providerTaskRequests: [], requestFailures: [] },
    pageErrors: [], consoleErrors: [], screenshots: [], cases: [],
    passed: false,
    notes: [
      'All browser interactions use the original TapNow Canvas, node body, Milkdown editor, text-face tabs, branch editor and history keyboard.',
      'The only browser write admitted is an update-only batch for the exact Context text node; Core PUT and all lifecycle/provider writes are blocked.',
      'Core text, revisions and FileRecord bytes are read through the same-origin /api/lcos/core proxy. No hashes or synthetic Core writes are used.',
      'Background 4xx/5xx, blocked requests and console errors remain visible; this is not a global zero-network-error claim.',
    ],
  }

  let browser
  let page
  let context
  let initialCanvas
  let initialCore
  let initialRef
  let serverStatus
  const allowedBatchByRequest = new WeakMap()
  const latestCanvasRef = { current: null }
  const networkRecords = []

  const safePath = value => {
    try { const url = new URL(value); return url.origin + url.pathname } catch { return String(value).slice(0, 300) }
  }
  const cleanText = value => String(value)
    .replace(/((?:token|secret|credential|authorization|api.?key)\s*[:=]\s*)[^\s,;]+/ig, '$1[redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/g, value => safePath(value))
    .slice(0, 1200)
  const refSummary = ref => ref && typeof ref === 'object' ? {
    version: ref.version, entityType: ref.entityType, entityId: ref.entityId,
    artifactId: ref.artifactId, artifactViewId: ref.artifactViewId, revisionId: ref.revisionId,
  } : null
  const bodyOf = node => typeof node?.data?.text === 'string' ? node.data.text
    : typeof node?.data?.content === 'string' ? node.data.content : null
  const finite = value => typeof value === 'number' && Number.isFinite(value)
  const geometryOf = node => ({
    position: node?.position ?? null,
    width: node?.width ?? null,
    height: node?.height ?? null,
    measured: node?.measured ?? null,
    style: node?.style ?? null,
  })
  const nodeSnapshot = node => ({ id: String(node.id), type: node.type,
    body: bodyOf(node), ref: refSummary(node.data?.lcos_ref ?? node.lcos_ref),
    revisionId: node.lcos_revision_id ?? null, geometry: geometryOf(node) })
  const stable = value => JSON.stringify(value)
  const dimensionsOf = node => {
    const width = [node?.measured?.width, node?.width, node?.style?.width].find(finite)
    const height = [node?.measured?.height, node?.height, node?.style?.height].find(finite)
    return { width: width ?? null, height: height ?? null }
  }
  const routeForCore = suffix => `/api/lcos/core${suffix}`

  async function readJson(pathname, label) {
    const response = await fetch(new URL(pathname, origin), { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error' })
    let payload
    try { payload = await response.json() } catch { payload = null }
    const read = { label, method: 'GET', path: pathname, status: response.status,
      coreEnvelopeOk: payload?.ok === true, tapNowCode: payload?.code ?? null }
    report.reads ??= []
    report.reads.push(read)
    if (!response.ok) report.network.apiFailures.push({ method: 'GET', path: pathname, status: response.status,
      code: payload?.error?.code ?? payload?.code ?? null, message: cleanText(payload?.error?.message ?? payload?.message ?? '') })
    return { response, payload }
  }

  async function readCanvas() {
    const result = await readJson(`/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`, 'original TapNow canvas')
    assert.equal(result.response.status, 200, 'The original Context Canvas read must succeed.')
    assert.equal(result.payload?.code, 0, 'Canvas must return its original TapNow envelope.')
    assert.ok(Array.isArray(result.payload?.data?.nodes), 'Canvas read must contain the original node projection.')
    return result.payload.data
  }

  async function readCoreText() {
    const query = new URLSearchParams({ canvasId, spatialId: nodeId })
    const result = await readJson(routeForCore(`/projects/${encodeURIComponent(serverStatus.projectId)}/curation/canvas-text?${query}`), 'Core canonical canvas text')
    assert.equal(result.response.status, 200, 'Core CanvasText GET must succeed through the same-origin proxy.')
    assert.equal(result.payload?.ok, true, 'Core CanvasText must preserve the original Core envelope.')
    assert.ok(result.payload?.value && typeof result.payload.value.body === 'string', 'Core must return exact canonical text bytes as a body.')
    return result.payload.value
  }

  async function readRevisions(id) {
    const result = await readJson(routeForCore(`/artifacts/${encodeURIComponent(id)}/revisions`), 'Core Artifact revisions')
    assert.equal(result.response.status, 200, 'Core Artifact revision list must succeed through the same-origin proxy.')
    assert.equal(result.payload?.ok, true)
    assert.ok(Array.isArray(result.payload?.value))
    return result.payload.value
  }

  async function readFileBytes(fileRecordId) {
    const pathname = routeForCore(`/projects/${encodeURIComponent(serverStatus.projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`)
    const response = await fetch(new URL(pathname, origin), { headers: { Accept: '*/*' }, cache: 'no-store', redirect: 'error' })
    const bytes = Buffer.from(await response.arrayBuffer())
    report.reads ??= []
    report.reads.push({ label: 'Core FileRecord bytes', method: 'GET', path: pathname, status: response.status, byteLength: bytes.length })
    if (!response.ok) report.network.apiFailures.push({ method: 'GET', path: pathname, status: response.status, code: null, message: 'Core FileRecord content read failed.' })
    return { response, bytes }
  }

  async function readCanonicalBundle() {
    const value = await readCoreText()
    assert.equal(value.projectId, serverStatus.projectId)
    assert.equal(value.canvasId, canvasId)
    assert.equal(value.spatialId, nodeId)
    assert.equal(value.artifactId, artifactId)
    const revisions = await readRevisions(artifactId)
    const file = await readFileBytes(String(value.fileRecordId))
    assert.equal(file.response.status, 200)
    assert.equal(file.bytes.toString('utf8'), value.body, 'Registered FileRecord bytes must equal the canonical Core text exactly.')
    assert.ok(revisions.some(revision => String(revision.id) === String(value.revisionId)), 'Current Core revision must be present in its original Artifact history.')
    return { value, revisions, file, bytesMatch: true,
      revisionListed: true, ref: { artifactId: value.artifactId, revisionId: value.revisionId, viewId: value.viewId } }
  }

  async function waitForCanvas(predicate, label, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs
    let canvas
    do {
      canvas = await readCanvas()
      const node = canvas.nodes.find(item => String(item.id) === nodeId)
      if (node && predicate(node, canvas)) return { canvas, node }
      await new Promise(resolve => setTimeout(resolve, 120))
    } while (Date.now() < deadline)
    throw new Error(`${label} did not persist through the original Canvas GET. Last node=${JSON.stringify(canvas?.nodes?.find(item => String(item.id) === nodeId) ?? null)}`)
  }

  function assertNonTargetInvariants(beforeCanvas, afterCanvas, label) {
    const beforeIds = beforeCanvas.nodes.map(node => String(node.id)).sort()
    const afterIds = afterCanvas.nodes.map(node => String(node.id)).sort()
    assert.deepEqual(afterIds, beforeIds, `${label}: node IDs/count must remain exact; no create/delete is in scope.`)
    const beforeById = new Map(beforeCanvas.nodes.map(node => [String(node.id), nodeSnapshot(node)]))
    for (const node of afterCanvas.nodes) {
      const id = String(node.id)
      if (id === nodeId) continue
      assert.equal(stable(nodeSnapshot(node)), stable(beforeById.get(id)), `${label}: non-target node ${id} body, Core ref and geometry must remain unchanged.`)
    }
    return { nodeCount: beforeIds.length, exactNonTargetBodiesRefsGeometry: true }
  }

  function validateRef(candidate) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return { ok: false, reason: 'lcos_ref is not a plain object.' }
    const before = initialRef
    if (candidate.entityType !== 'artifact' || candidate.entityId !== artifactId || candidate.artifactId !== artifactId
      || candidate.artifactViewId !== before.artifactViewId || candidate.version !== before.version
      || typeof candidate.revisionId !== 'string' || !candidate.revisionId.trim()) {
      return { ok: false, reason: 'lcos_ref is not the exact existing ArtifactView; only a real revision receipt may vary.' }
    }
    return { ok: true }
  }

  const allowedDataKeys = new Set(['id', 'title', 'label', 'text', 'content', 'prompt', 'params', 'lcos_ref',
    'lcosTextViewMode', 'lcosTextCollapsedIds', 'lcosTextBeforeMindMapSize'])
  const presentationKeys = new Set(['lcosTextViewMode', 'lcosTextCollapsedIds', 'lcosTextBeforeMindMapSize'])
  const geometryKeys = new Set(['position', 'measured'])

  function validateTargetBatch(request) {
    let body
    try { body = request.postDataJSON() } catch { return { ok: false, reason: 'Batch body was not JSON.' } }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'Batch body was not a record.' }
    const bodyKeys = Object.keys(body)
    const allowedTopKeys = ['canvas_id', 'actions', 'lcos_expected_revisions', 'lcos_refs', 'created_by_role']
    if (bodyKeys.some(key => !allowedTopKeys.includes(key))) {
      return { ok: false, reason: `Unsupported top-level batch fields: ${bodyKeys.filter(key => !allowedTopKeys.includes(key)).join(',')}` }
    }
    if (body.created_by_role !== undefined && body.created_by_role !== 'user') return { ok: false, reason: `Non-user native batch role: ${String(body.created_by_role)}` }
    if (body.canvas_id !== canvasId || !Array.isArray(body.actions) || body.actions.length < 1) return { ok: false, reason: 'Batch is not scoped to the exact Context canvas.' }
    if (body.lcos_expected_revisions !== undefined && (!body.lcos_expected_revisions || typeof body.lcos_expected_revisions !== 'object'
      || Array.isArray(body.lcos_expected_revisions) || Object.entries(body.lcos_expected_revisions).some(([id, revision]) => {
        if (id === nodeId) return typeof revision !== 'string' || !revision.trim()
        const known = initialCanvas.nodes.find(node => String(node.id) === id)
        return !known || revision !== (known.lcos_revision_id ?? known.data?.lcos_ref?.revisionId)
      }))) {
      return { ok: false, reason: 'Revision map has unknown identities or changed non-target revision echoes.' }
    }
    if (body.lcos_refs !== undefined && (!body.lcos_refs || typeof body.lcos_refs !== 'object' || Array.isArray(body.lcos_refs)
      || Object.keys(body.lcos_refs).some(id => id !== nodeId) || body.lcos_refs[nodeId] && !validateRef(body.lcos_refs[nodeId]).ok)) {
      return { ok: false, reason: 'Reference map contains a non-target or changed Core identity.' }
    }
    const changes = []
    for (const action of body.actions) {
      if (!action || action.action !== 'update' || Object.keys(action).some(key => !['action', 'updates', 'canvas_id'].includes(key))) {
        return { ok: false, reason: 'Only original update actions are admitted.' }
      }
      if (action.canvas_id !== undefined && action.canvas_id !== canvasId) return { ok: false, reason: 'Action canvas does not match Context.' }
      if (!Array.isArray(action.updates) || action.updates.length < 1) return { ok: false, reason: 'Update action has no node updates.' }
      for (const update of action.updates) {
        if (!update || update.id !== nodeId) return { ok: false, reason: 'Batch includes a non-target node.' }
        const unknownNodeKeys = Object.keys(update).filter(key => !['id', 'type', 'data', 'position', 'measured', 'lcos_ref', 'parent_id'].includes(key))
        if (unknownNodeKeys.length) return { ok: false, reason: `Unsupported node update fields: ${unknownNodeKeys.join(',')}` }
        const originalTarget = initialCanvas.nodes.find(node => String(node.id) === nodeId)
        if (update.parent_id !== undefined && (update.parent_id !== '' || originalTarget?.parentId || originalTarget?.parent_id)) {
          return { ok: false, reason: 'Only the unchanged root-parent echo from original history is allowed.' }
        }
        if (update.type !== undefined && !['note', 'text'].includes(update.type)) return { ok: false, reason: 'Target renderer type changed.' }
        if (update.position !== undefined && (!update.position || !finite(update.position.x) || !finite(update.position.y))) return { ok: false, reason: 'Geometry position is not finite.' }
        if (update.measured !== undefined && (!update.measured || !finite(update.measured.width) || !finite(update.measured.height)
          || update.measured.width <= 0 || update.measured.height <= 0)) return { ok: false, reason: 'Geometry size is not positive and finite.' }
        if (update.lcos_ref !== undefined) {
          const check = validateRef(update.lcos_ref)
          if (!check.ok) return check
        }
        if (update.data !== undefined) {
          if (!update.data || typeof update.data !== 'object' || Array.isArray(update.data)) return { ok: false, reason: 'Node data patch is not a record.' }
          for (const [key, value] of Object.entries(update.data)) {
            if (!allowedDataKeys.has(key)) return { ok: false, reason: `Unsupported data field: ${key}` }
            if (!presentationKeys.has(key) && key !== 'text' && key !== 'content' && key !== 'lcos_ref') {
              const oldValue = initialCanvas.nodes.find(node => String(node.id) === nodeId)?.data?.[key]
              if (stable(value) !== stable(oldValue)) return { ok: false, reason: `Non-editable data field changed: ${key}` }
            }
            if (key === 'text' || key === 'content') {
              if (typeof value !== 'string') return { ok: false, reason: 'Text body must stay a string.' }
            } else if (key === 'lcos_ref') {
              const check = validateRef(value)
              if (!check.ok) return check
            } else if (key === 'lcosTextViewMode' && !['text', 'outline', 'mindmap'].includes(value)) {
              return { ok: false, reason: 'Unsupported text face mode.' }
            } else if (key === 'lcosTextCollapsedIds' && (!Array.isArray(value) || value.some(id => typeof id !== 'string'))) {
              return { ok: false, reason: 'Collapsed branch IDs must be strings.' }
            } else if (key === 'lcosTextBeforeMindMapSize' && (!value || !finite(value.width) || !finite(value.height)
              || value.width <= 0 || value.height <= 0)) return { ok: false, reason: 'Stored pre-map size must be positive and finite.' }
          }
        }
        const changedDataKeys = update.data ? Object.keys(update.data).filter(key => stable(update.data[key]) !== stable(initialCanvas.nodes.find(node => String(node.id) === nodeId)?.data?.[key])) : []
        changes.push({ id: update.id, type: update.type ?? null, changedDataKeys,
          bodyLength: typeof update.data?.text === 'string' ? update.data.text.length : typeof update.data?.content === 'string' ? update.data.content.length : null,
          geometry: { position: update.position ?? null, measured: update.measured ?? null },
          revisionKeys: body.lcos_expected_revisions ? Object.keys(body.lcos_expected_revisions) : [] })
      }
    }
    return { ok: true, body, changes }
  }

  async function checkPageIdentity(stage) {
    const identity = await page.evaluate(() => ({
      title: document.title,
      pathname: location.pathname,
      canvasId: window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId ?? null,
      reactFlowRoots: document.querySelectorAll('.react-flow').length,
      nodeBridgeApiPresent: Boolean(window.__LCOS_NODE_LAB__?.api),
      surfaceReady: document.querySelector('[data-lcos-professional-surface-state]')?.getAttribute('data-lcos-professional-surface-state') ?? null,
      nativeTextState: document.querySelector('[data-lcos-native-text-body] [data-lcos-inline-text]')?.getAttribute('data-state') ?? null,
      overlays: [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], .animate-spin, [data-lcos-loading-overlay]')]
        .filter(element => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; })
        .map(element => ({ tag: element.tagName, role: element.getAttribute('role'), text: (element.textContent || '').trim().slice(0, 100) })),
    }))
    report.pageIdentity ??= {}
    report.pageIdentity[stage] = identity
    assert.equal(identity.pathname, `/canvas/${canvasId}`)
    assert.equal(identity.canvasId, canvasId, 'The original NodeBridge must identify the one Context canvas.')
    assert.equal(identity.reactFlowRoots, 1, 'Keep the original single Canvas/ReactFlow root.')
    assert.equal(identity.nodeBridgeApiPresent, true)
    assert.equal(identity.overlays.length, 0, 'No modal/loading overlay may cover the Context text test.')
    const expectedTitle = String(initialCanvas.name ?? initialCanvas.title ?? '')
    assert.ok(expectedTitle.trim(), 'Original Canvas GET must provide a metadata title.')
    assert.ok(identity.title.includes(expectedTitle), `Original dynamic document title must include Canvas metadata name “${expectedTitle}”.`)
    return identity
  }

  async function closeOriginalAgentPanelIfOpen() {
    const panel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (!await panel.count() || !await panel.isVisible()) return
    report.originalAgentPanel = { initiallyVisible: true, text: (await panel.innerText()).slice(0, 500), closeAction: null }
    await screenshot('original-agent-panel-before-close')
    const close = page.getByRole('button', { name: '关闭 Agent 面板', exact: true })
    await close.waitFor({ state: 'visible', timeout: 8000 })
    await close.click()
    await panel.waitFor({ state: 'hidden', timeout: 10000 })
    report.originalAgentPanel.closeAction = 'Clicked the original controlled panel close button; no data/API write was enabled.'
  }

  async function screenshot(stage, targetLocator = null) {
    await mkdir(screenshotRoot, { recursive: true })
    const pagePath = path.join(screenshotRoot, `tapnow-native-gen1-text-${stamp}-${requestedPhase}-${stage}.png`)
    await page.screenshot({ path: pagePath, fullPage: false })
    report.screenshots.push({ stage, kind: 'full-viewport', path: pagePath })
    if (targetLocator) {
      const nodePath = path.join(screenshotRoot, `tapnow-native-gen1-text-${stamp}-${requestedPhase}-${stage}-node.png`)
      await targetLocator.screenshot({ path: nodePath })
      report.screenshots.push({ stage, kind: 'exact-target-node', path: nodePath })
    }
  }

  async function assertCoreIdentity(core, label) {
    assert.equal(core.projectId, serverStatus.projectId, `${label}: wrong Core project.`)
    assert.equal(core.canvasId, canvasId, `${label}: wrong Canvas.`)
    assert.equal(core.spatialId, nodeId, `${label}: wrong spatial node.`)
    assert.equal(core.artifactId, artifactId, `${label}: wrong Artifact.`)
    assert.equal(core.viewId, initialRef.artifactViewId, `${label}: original ArtifactView changed.`)
    assert.equal(core.body, typeof core.body === 'string' ? core.body : null)
  }

  async function verifyBodyRevision(before, expectedHeading = null) {
    const deadline = Date.now() + 20000
    let bundle
    do {
      bundle = await readCanonicalBundle()
      if (bundle.value.revisionId !== before.value.revisionId
        && (!expectedHeading || bundle.value.body.includes(expectedHeading))) break
      if (bundle.value.revisionId === before.value.revisionId && expectedHeading && bundle.value.body.includes(expectedHeading)) break
      await new Promise(resolve => setTimeout(resolve, 150))
    } while (Date.now() < deadline)
    assert.ok(bundle.value.body.includes(headingOne), 'Canonical body must keep the first original keyboard-created heading.')
    assert.ok(bundle.value.body.includes(expectedHeading || headingTwo), 'Canonical body must include the exact target hierarchy text.')
    assert.equal(bundle.value.artifactId, artifactId, 'Editing revises the existing Artifact; it never creates/replaces one.')
    assert.equal(bundle.value.viewId, initialRef.artifactViewId, 'Editing retains the original ArtifactView identity.')
    assert.ok(bundle.revisions.some(revision => String(revision.id) === String(bundle.value.revisionId)))
    assert.equal(bundle.file.bytes.toString('utf8'), bundle.value.body, 'The exact registered FileRecord bytes must equal Core body.')
    return bundle
  }

  function assertNoProviderSubmit() {
    assert.equal(report.network.providerTaskRequests.length, 0, 'No provider/model task request may be submitted.')
  }

  try {
    const healthRead = await readJson('/health', 'deployed integration health')
    const health = healthRead.payload
    assert.equal(health?.profile, 'original-tapnow-full-integration-in-progress')
    assert.equal(health?.realCoreConnected, true)
    assert.ok(Number.isInteger(health?.pid) && health.pid > 0)
    const statusRead = await readJson('/api/surface-core/status', 'Surface Core project and workspace status')
    assert.equal(statusRead.response.status, 200)
    assert.equal(statusRead.payload?.code, 0)
    serverStatus = statusRead.payload.data
    assert.equal(typeof serverStatus.projectId, 'string')
    const contextWorkspace = serverStatus.workspaces?.find(workspace => workspace.canvasId === canvasId && workspace.preferredSurface === 'context')
      ?? serverStatus.workspaces?.find(workspace => workspace.canvasId === canvasId)
    assert.ok(contextWorkspace, 'The existing Context workspace must point to the one target canvas.')
    report.server = { pid: health.pid, profile: health.profile, fullScopeComplete: health.fullScopeComplete ?? null,
      projectId: serverStatus.projectId, coreConnected: serverStatus.core?.connected ?? null,
      workspace: { id: contextWorkspace.id, canvasId: contextWorkspace.canvasId, scopeId: contextWorkspace.scopeId ?? null } }

    initialCanvas = await readCanvas()
    assert.equal(initialCanvas.id, canvasId)
    const targetMatches = initialCanvas.nodes.filter(node => String(node.id) === nodeId)
    assert.equal(targetMatches.length, 1, 'The fixture node ID must be unique on the existing Context Canvas.')
    const target = targetMatches[0]
    assert.ok(['note', 'text'].includes(target.type), 'The exact fixture remains a native note/text node.')
    assert.equal(target.data?.lcos_ref?.entityType, 'artifact')
    assert.equal(target.data?.lcos_ref?.artifactId, artifactId)
    assert.equal(target.data?.lcos_ref?.entityId, artifactId)
    assert.ok(target.data?.lcos_ref?.artifactViewId && target.data?.lcos_ref?.revisionId)
    initialRef = target.data.lcos_ref
    latestCanvasRef.current = initialCanvas
    const dimensions = dimensionsOf(target)
    assert.ok(finite(dimensions.width) && dimensions.width > 0 && finite(dimensions.height) && dimensions.height > 0,
      'Read the actual persisted fixture geometry, including a previously saved Mindmap size; never reset it for a test.')
    const initialBundle = await readCanonicalBundle()
    initialCore = initialBundle.value
    await assertCoreIdentity(initialCore, 'initial read')
    assert.equal(String(initialCore.revisionId), String(initialRef.revisionId), 'Canvas ref and Core current revision must match before interaction.')
    assert.equal(bodyOf(target), initialCore.body, 'Original node body and Core canonical body must agree before editing.')
    report.fixtureBefore = {
      canvasId, nodeId, nodeType: target.type, geometry: geometryOf(target),
      canvasTitle: initialCanvas.name ?? initialCanvas.title ?? null,
      nonTargetNodeCount: initialCanvas.nodes.length - 1,
      reference: refSummary(initialRef),
      core: { projectId: initialCore.projectId, canvasId: initialCore.canvasId, spatialId: initialCore.spatialId,
        artifactId: initialCore.artifactId, viewId: initialCore.viewId, revisionId: initialCore.revisionId,
        fileRecordId: initialCore.fileRecordId, body: initialCore.body, bytesMatch: initialBundle.bytesMatch,
        byteLength: initialBundle.file.bytes.length, revisionCount: initialBundle.revisions.length,
        currentRevisionListed: initialBundle.revisionListed },
    }
    const beforeById = new Map(initialCanvas.nodes.map(node => [String(node.id), nodeSnapshot(node)]))

    const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' })
    await context.route('**/*', async route => {
      const request = route.request()
      const url = new URL(request.url())
      const method = request.method().toUpperCase()
      if (url.origin !== origin) {
        report.network.externalHttpBlocked.push({ method, url: safePath(url.href), resourceType: request.resourceType() })
        return route.abort('blockedbyclient')
      }
      if (method === 'GET' || method === 'HEAD' || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
      const exactBatch = method === 'POST' && url.pathname === `/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`
      if (writePhase && exactBatch) {
        const validation = validateTargetBatch(request)
        if (validation.ok) {
          const record = { method, path: url.pathname, status: null, targetNodeId: nodeId,
            changedDataKeys: [...new Set(validation.changes.flatMap(change => change.changedDataKeys))].sort(),
            changes: validation.changes, expectedRevisionNodeIds: validation.body.lcos_expected_revisions ? Object.keys(validation.body.lcos_expected_revisions) : [] }
          report.network.allowedTargetBatches.push(record)
          allowedBatchByRequest.set(request, record)
          networkRecords.push(record)
          return route.continue()
        }
        const blocked = { method, path: url.pathname, reason: validation.reason, requestSummary: validation.changes ?? null }
        report.network.blockedWrites.push(blocked)
        return route.abort('blockedbyclient')
      }
      const blocked = { method, path: url.pathname, reason: exactBatch ? 'Target text edits were not enabled for this run.' : 'Only the exact target node batch update is allowed.' }
      report.network.blockedWrites.push(blocked)
      const path = url.pathname.toLowerCase()
      if (/(?:^|\/)(?:runs?|generate|generation|execute|completions?|inference|provider)(?:\/|$)/i.test(path)) {
        report.network.providerTaskRequests.push({ method, path: url.pathname, blocked: true })
      }
      return route.abort('blockedbyclient')
    })
    await context.routeWebSocket('**/*', socket => { report.network.webSocketsClosed += 1; socket.close() })
    page = await context.newPage()
    page.on('pageerror', error => report.pageErrors.push(cleanText(error.message)))
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(cleanText(message.text())) })
    page.on('requestfailed', request => {
      const url = new URL(request.url())
      report.network.requestFailures.push({ method: request.method(), path: safePath(url.href),
        failure: cleanText(request.failure()?.errorText ?? 'unknown') })
    })
    page.on('response', async response => {
      const request = response.request()
      const url = new URL(response.url())
      if (url.origin !== origin) return
      const allowed = allowedBatchByRequest.get(request)
      let payload = null
      if (/json/i.test(response.headers()['content-type'] ?? '')) {
        try { payload = await response.json() } catch { payload = null }
      }
      if (allowed) {
        allowed.status = response.status()
        allowed.code = payload?.code ?? null
        allowed.errorCode = payload?.error?.code ?? null
        allowed.coreSaved = payload?.data?.core_saved ?? null
        allowed.spatialSaved = payload?.data?.spatial_saved ?? null
        allowed.expectedRevisionNodeIds = Object.keys(payload?.data?.lcos_expected_revisions ?? {})
      }
      if (url.pathname.startsWith('/api/') && response.status() >= 400) {
        const failure = { method: request.method(), path: url.pathname, status: response.status(),
          code: payload?.error?.code ?? payload?.code ?? null,
          message: cleanText(payload?.error?.message ?? payload?.message ?? '') }
        report.network.apiFailures.push(failure)
        if (/(?:^|\/)(?:runs?|generate|generation|execute|completions?|inference|provider)(?:\/|$)/i.test(url.pathname.toLowerCase())) {
          report.network.providerTaskRequests.push({ method: request.method(), path: url.pathname, status: response.status(), blocked: false })
        }
      }
      if (url.pathname.startsWith('/api/') && request.method() !== 'GET' && request.method() !== 'HEAD'
        && !allowed && !report.network.blockedWrites.some(item => item.path === url.pathname)) {
        report.network.blockedWrites.push({ method: request.method(), path: url.pathname, reason: 'Unexpected mutating API observed.' })
      }
    })

    await page.goto(new URL(`/canvas/${canvasId}`, origin).href, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(({ expectedCanvasId }) => Boolean(window.__LCOS_NODE_LAB__?.api)
      && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === expectedCanvasId
      && document.querySelector('.react-flow'), { expectedCanvasId: canvasId }, { timeout: 30000 })
    const targetNode = page.locator(`.react-flow__node[data-id="${nodeId}"]`)
    await targetNode.waitFor({ state: 'visible', timeout: 30000 })
    const nativeBody = targetNode.locator(`[data-lcos-native-text-body="${nodeId}"]`)
    await nativeBody.waitFor({ state: 'visible', timeout: 30000 })
    const matureTextBody = targetNode.locator('[data-lcos-inline-text][data-state="ready"]')
    await matureTextBody.waitFor({ state: 'visible', timeout: 30000 })
    report.matureTextBody = { selector: '[data-lcos-inline-text][data-state="ready"]', state: 'ready', visible: true }
    await closeOriginalAgentPanelIfOpen()
    await checkPageIdentity('initial')
    const bodyHit = await inspectNativeBodyExposure(nativeBody)
    report.targetDom = { selector: `[data-lcos-native-text-body="${nodeId}"]`, ...bodyHit }
    assert.ok(bodyHit.rect.width > 0 && bodyHit.rect.height > 0)
    assert.equal(bodyHit.exposed, true, 'At least one actual text/body point must be exposed in the exact node; do not force an interaction through a handle or overlay.')
    assert.equal(bodyHit.exposedHit.closestNodeId, nodeId, 'Exposed text point must belong to the exact original ReactFlow node, not a nearby card.')
    assert.equal(await page.locator('.react-flow').count(), 1)
    await screenshot('loaded', targetNode)

    if (args.has('--inspect-text-factory')) {
      const factory = await page.evaluate(async () => {
        const shim = await import('/lcos/native-flow.js')
        const vendor = await import('/assets/UnlimitedModeToggle-D4wysAbz.js')
        const api = window.__LCOS_NODE_LAB__?.api
        const beforeIds = api.getNodes().map(node => node.id)
        const body = '# Native text factory read-only probe\n\nConstruct only; never queue or save.'
        const position = { x: 1234, y: 432 }
        const carrier = shim.createOriginalTextCarrier({ text: body, prompt: '' }, { position })
        return { exactVendorFunction: shim.createOriginalTextCarrier === vendor.b_,
          id: carrier.id, type: carrier.type, bodyMatches: carrier.data?.text === body,
          boundRef: carrier.data?.lcos_ref ?? null, parentId: carrier.parentId ?? null,
          position: carrier.position, width: carrier.width, height: carrier.height,
          nativeNodeIdsUnchanged: JSON.stringify(api.getNodes().map(node => node.id)) === JSON.stringify(beforeIds),
        }
      })
      assert.equal(factory.exactVendorFunction, true)
      assert.equal(factory.type, 'text')
      assert.equal(factory.bodyMatches, true)
      assert.equal(factory.boundRef, null)
      assert.equal(factory.parentId, null)
      assert.deepEqual(factory.position, { x: 1234, y: 432 })
      assert.equal(factory.nativeNodeIdsUnchanged, true)
      report.originalTextFactory = factory
      report.cases.push({ name: '原b_/XD/fi工厂实际执行的只读carrier构造；未addNodes或保存', passed: true, detail: factory })
    }

    if (requestedPhase === 'format' || requestedPhase === 'faces' || requestedPhase === 'outline') {
      const selectionBefore = await readNativeSelectionSnapshot(page, nodeId)
      await nativeBody.click({ position: bodyHit.exposedLocalPoint })
      await page.waitForFunction(id => {
        const node = document.querySelector(`.react-flow__node[data-id="${id}"]`)
        return node?.classList.contains('selected')
          || window.__LCOS_NODE_LAB__?.api?.getSelection?.()?.nodeIds?.map(String).includes(id)
      }, nodeId, { timeout: 10000 })
      await waitForTwoFrames(page)
      const selectionAfter = await readNativeSelectionSnapshot(page, nodeId)
      assert.deepEqual(selectionAfter.rect, selectionBefore.rect, 'Natural selection must raise the node without moving or resizing it.')
      report.originalPointerSelection = { selectionBefore, selectionAfter, chosenPoint: bodyHit.exposedPoint }
      await screenshot('selected', targetNode)
    }

    if (requestedPhase === 'load') {
      const selectionBefore = await readNativeSelectionSnapshot(page, nodeId)
      assert.ok(selectionBefore)
      const exactHitBeforeClick = await page.evaluate(({ x, y, expectedId }) => {
        const hit = document.elementFromPoint(x, y)
        const body = document.querySelector(`[data-lcos-native-text-body="${expectedId}"]`)
        const node = hit?.closest?.('.react-flow__node[data-id]') ?? null
        return { hitTag: hit?.tagName ?? null, hitClass: hit?.className?.toString?.() ?? null,
          closestNodeId: node?.getAttribute('data-id') ?? null, insideTargetBody: Boolean(hit && body && body.contains(hit)) }
      }, { ...bodyHit.exposedPoint, expectedId: nodeId })
      report.readOnlyInteraction = { selectionBefore, chosenPoint: bodyHit.exposedPoint,
        chosenHitBeforeClick: exactHitBeforeClick, targetGeometryBefore: selectionBefore.rect,
        sequence: ['real pointer click at scanned exposed non-control text point', 'double requestAnimationFrame',
          'capture original viewport and exact-node crop', 'open original inline editor by exposed-point double-click', 'cancel without typing or saving'] }
      assert.equal(exactHitBeforeClick.closestNodeId, nodeId)
      assert.equal(exactHitBeforeClick.insideTargetBody, true)
      await nativeBody.click({ position: bodyHit.exposedLocalPoint })
      await page.waitForFunction(id => {
        const node = document.querySelector(`.react-flow__node[data-id="${id}"]`)
        const selection = window.__LCOS_NODE_LAB__?.api?.getSelection?.()
        return Boolean(node?.classList.contains('selected') || selection?.nodeIds?.map(String).includes(id))
      }, nodeId, { timeout: 10000 })
      await waitForTwoFrames(page)
      const selectionAfter = await readNativeSelectionSnapshot(page, nodeId)
      assert.ok(selectionAfter?.selectedClass || selectionAfter?.selectedNodeIds.includes(nodeId), 'Original Canvas click must naturally select the exact target node.')
      report.readOnlyInteraction.selectionAfter = selectionAfter
      report.readOnlyInteraction.selectionChanged = stable(selectionBefore.selectedNodeIds) !== stable(selectionAfter.selectedNodeIds)
        || selectionBefore.selectedClass !== selectionAfter.selectedClass
      report.readOnlyInteraction.closestNodeAfterClick = await page.evaluate(({ x, y }) => {
        const hit = document.elementFromPoint(x, y)
        const node = hit?.closest?.('.react-flow__node[data-id]') ?? null
        return { hitTag: hit?.tagName ?? null, hitClass: hit?.className?.toString?.() ?? null,
          closestNodeId: node?.getAttribute('data-id') ?? null }
      }, bodyHit.exposedPoint)
      await screenshot('selected', targetNode)

      const selectedExposure = await inspectNativeBodyExposure(nativeBody)
      report.readOnlyInteraction.exposedPointAfterSelection = selectedExposure.exposedPoint
      report.readOnlyInteraction.exposedHitAfterSelection = selectedExposure.exposedHit
      assert.equal(selectedExposure.exposed, true, 'Target must retain a real exposed text point after original selection raises its layer.')
      assert.equal(selectedExposure.exposedHit.closestNodeId, nodeId)
      await nativeBody.dblclick({ position: selectedExposure.exposedLocalPoint })
      const matureEditSurface = targetNode.locator('.lcos-inline-text-editor')
      await matureEditSurface.waitFor({ state: 'visible', timeout: 12000 })
      const contenteditableDiagnostics = await targetNode.evaluate(node => [...node.querySelectorAll('[contenteditable="true"]')].map(element => {
        const ancestry = []
        let current = element
        for (let depth = 0; current && depth < 12; depth += 1, current = current.parentElement) {
          ancestry.push({ tag: current.tagName, role: current.getAttribute('role'), className: String(current.className ?? '').slice(0, 220),
            nodeId: current.getAttribute('data-id'), nativeTextBody: current.getAttribute('data-lcos-native-text-body'),
            keyboardScope: current.getAttribute('data-keyboard-scope'),
            inlineTextEditor: current.matches?.('.lcos-inline-text-editor') === true,
            milkdown: current.matches?.('.milkdown') === true,
            mediaTextPanel: current.matches?.('.media-viewer__text-panel') === true,
            dialog: current.getAttribute('role') === 'dialog' })
          if (current.matches?.('.react-flow__node[data-id]')) break
        }
        const node = element.closest('.react-flow__node[data-id]')
        return { tag: element.tagName, role: element.getAttribute('role'), contenteditable: element.getAttribute('contenteditable'),
          className: String(element.className ?? '').slice(0, 260), text: (element.innerText ?? '').slice(0, 300),
          closestNodeId: node?.getAttribute('data-id') ?? null, ancestors: ancestry }
      }))
      report.readOnlyInteraction.contenteditableDiagnostics = contenteditableDiagnostics
      const readOnlyEditor = matureEditSurface.locator('.ProseMirror[contenteditable="true"]')
      assert.equal(await readOnlyEditor.count(), 1, 'The mature LCOS editor must be located under its exact original `.lcos-inline-text-editor` owner.')
      await page.waitForFunction(({ id, needle }) => {
        const node = document.querySelector(`.react-flow__node[data-id="${id}"]`)
        const editor = node?.querySelector('.lcos-inline-text-editor .ProseMirror[contenteditable="true"]')
        return Boolean(editor && (editor.innerText ?? '').includes(needle))
      }, { id: nodeId, needle: '检查参考图与反馈' }, { timeout: 10000 })
      const editorTextBeforeCancel = await readOnlyEditor.innerText()
      await readOnlyEditor.waitFor({ state: 'visible', timeout: 8000 })
      report.readOnlyInteraction.inlineEditor = { openedBy: 'original body double-click at current exposed non-control point',
        visible: true, contenteditable: await readOnlyEditor.getAttribute('contenteditable'),
        textLength: editorTextBeforeCancel.length, textSample: editorTextBeforeCancel.slice(0, 500),
        textStillMatchesCore: editorTextBeforeCancel.includes('检查参考图与反馈'),
        saveButtonObserved: await targetNode.getByRole('button', { name: '保存', exact: true }).isVisible() }
      report.readOnlyInteraction.otherEditableControl = contenteditableDiagnostics.find(item =>
        item.ancestors.some(ancestor => ancestor.className.includes('generation-input-bar'))) ?? null
      if (report.readOnlyInteraction.otherEditableControl) {
        report.readOnlyInteraction.otherEditableControlBoundary = 'Original generation prompt bar, outside the mature LCOS text-editor owner; observed but not focused, typed, hidden or submitted.'
      }
      await waitForTwoFrames(page)
      await screenshot('mature-inline-editor-open-no-input', targetNode)
      const cancelEdit = matureEditSurface.getByRole('button', { name: '取消编辑', exact: true })
      await cancelEdit.waitFor({ state: 'visible', timeout: 8000 })
      report.readOnlyInteraction.cancelLayout = await cancelEdit.evaluate(button => {
        const ancestry = []
        for (let element = button; element; element = element.parentElement) {
          const box = element.getBoundingClientRect(), css = getComputedStyle(element)
          ancestry.push({ className: String(element.className ?? '').slice(0, 180),
            rect: { x: box.x, y: box.y, width: box.width, height: box.height },
            height: css.height, minHeight: css.minHeight, maxHeight: css.maxHeight, position: css.position,
            display: css.display, overflowY: css.overflowY, bottom: css.bottom, padding: css.padding,
            scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
          })
          if (element.matches('.react-flow__node')) break
        }
        const box = button.getBoundingClientRect()
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        return { ancestry, centreHitClass: String(hit?.className ?? ''), centreHitIsButton: hit === button || button.contains(hit) }
      })
      const cancelLayout = report.readOnlyInteraction.cancelLayout
      const cancelBox = cancelLayout.ancestry[0].rect
      const editorBox = cancelLayout.ancestry.find(item => item.className.includes('lcos-inline-text-editor')).rect
      const originalNodeBox = cancelLayout.ancestry.at(-1).rect
      assert.equal(cancelLayout.centreHitIsButton, true, 'Cancel must be exposed to real pointer hit-testing, not hidden by the original prompt.')
      assert.ok(editorBox.height <= originalNodeBox.height + .5, 'The mature editor scrollport must fit the actual original node height, not an outer shell minimum.')
      assert.ok(cancelBox.y + cancelBox.height <= originalNodeBox.y + originalNodeBox.height + .5,
        'The original sticky actions must remain within the real Canvas node boundary.')
      await cancelEdit.click({ timeout: 8000 })
      await matureEditSurface.waitFor({ state: 'hidden', timeout: 10000 })
      await targetNode.locator('[data-lcos-inline-text][data-state="ready"]').waitFor({ state: 'visible', timeout: 12000 })
      const coreAfterCancel = await readCanonicalBundle()
      assert.equal(coreAfterCancel.value.artifactId, initialCore.artifactId)
      assert.equal(coreAfterCancel.value.viewId, initialCore.viewId)
      assert.equal(coreAfterCancel.value.revisionId, initialCore.revisionId)
      assert.equal(coreAfterCancel.value.body, initialCore.body)
      assert.equal(coreAfterCancel.file.bytes.toString('utf8'), initialCore.body)
      const canvasAfterCancel = await readCanvas()
      const nodeAfterCancel = canvasAfterCancel.nodes.find(node => String(node.id) === nodeId)
      assert.equal(stable(nodeSnapshot(nodeAfterCancel)), stable(nodeSnapshot(target)), 'Opening and cancelling the original editor must not change body, Core ref or geometry.')
      report.readOnlyInteraction.cancelledEditorWithoutWrite = true
      report.readOnlyInteraction.targetNodeAfterCancel = nodeSnapshot(nodeAfterCancel)
      report.readOnlyInteraction.allowedBatchCountAfterInteraction = report.network.allowedTargetBatches.length
      assert.equal(report.network.allowedTargetBatches.length, 0, 'Read-only select/open/cancel must issue no Canvas update batch.')
      await waitForTwoFrames(page)
      await screenshot('selected-editor-cancelled', targetNode)
      report.visualReview = 'Screenshots are preserved for human visual review; DOM/API assertions do not certify pixels.'
      report.cases.push({ name: '原 ReactFlow 正文可见点自然选择 → 原 Milkdown 编辑器打开再取消；无Core/Canvas写入', passed: true,
        detail: report.readOnlyInteraction })

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(({ expectedCanvasId }) => Boolean(window.__LCOS_NODE_LAB__?.api)
        && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === expectedCanvasId
        && document.querySelector('.react-flow'), { expectedCanvasId: canvasId }, { timeout: 30000 })
      await targetNode.waitFor({ state: 'visible', timeout: 30000 })
      await nativeBody.waitFor({ state: 'visible', timeout: 30000 })
      await targetNode.locator('[data-lcos-inline-text][data-state="ready"]').waitFor({ state: 'visible', timeout: 30000 })
      await closeOriginalAgentPanelIfOpen()
      await checkPageIdentity('afterReload')
      const reloadCore = await readCanonicalBundle()
      assert.equal(reloadCore.value.artifactId, initialCore.artifactId)
      assert.equal(reloadCore.value.viewId, initialCore.viewId)
      assert.equal(reloadCore.value.revisionId, initialCore.revisionId)
      assert.equal(reloadCore.value.body, initialCore.body)
      assert.equal(reloadCore.file.bytes.toString('utf8'), initialCore.body)
      const reloadCanvas = await readCanvas()
      const reloadNode = reloadCanvas.nodes.find(node => String(node.id) === nodeId)
      assert.equal(stable(nodeSnapshot(reloadNode)), stable(nodeSnapshot(target)), 'Real reload must preserve the exact original node body/ref/geometry.')
      report.readOnlyInteraction.afterReload = { pageSelection: await readNativeSelectionSnapshot(page, nodeId),
        targetNode: nodeSnapshot(reloadNode), artifactId: reloadCore.value.artifactId,
        artifactViewId: reloadCore.value.viewId, revisionId: reloadCore.value.revisionId,
        bodyAndFileBytesUnchanged: true, targetCanvasBatchCount: report.network.allowedTargetBatches.length }
      assert.equal(report.network.allowedTargetBatches.length, 0, 'Selection/editor probe/reload must produce no target batch update.')
      await waitForTwoFrames(page)
      await screenshot('after-reload', targetNode)
      report.cases.push({ name: '取消后真实 page.reload：原 NodeID/Core ArtifactView/Revision/FileRecord 正文与几何读回一致；未提交批次',
        passed: true, detail: report.readOnlyInteraction.afterReload })
    }

    if (requestedPhase === 'edit') {
      const before = await readCanonicalBundle()
      const alreadyHeadings = headingLevel(before.value.body, headingOne) === 1 && headingLevel(before.value.body, headingTwo) === 2
      const partialHeadings = before.value.body.includes(headingOne) || before.value.body.includes(headingTwo)
      if (alreadyHeadings) {
        report.cases.push({ name: '键盘层级标题已由此前阶段写入；本轮避免重复写入', passed: true, writeSkipped: true,
          revisionId: before.value.revisionId, bodyContainsBothHeadings: true })
      } else {
        assert.equal(partialHeadings, false, 'Fixture contains a partial heading marker; stop rather than append duplicate or overwrite user text.')
        const editorTarget = targetNode.locator('[data-lcos-inline-text]')
        await nativeBody.dblclick({ position: bodyHit.exposedLocalPoint })
        const editSurface = editorTarget.locator('.lcos-inline-text-editor')
        const editor = editSurface.locator('.ProseMirror[contenteditable="true"]')
        await editor.waitFor({ state: 'visible', timeout: 12000 })
        const inputGeometry = await editor.evaluate(element => ({ contenteditable: element.getAttribute('contenteditable'), textLength: (element.textContent ?? '').length }))
        assert.equal(inputGeometry.contenteditable, 'true')
        report.edit = { entry: 'exact native body double-click', editor: inputGeometry, keyboard: [] }
        await editor.focus()
        await page.keyboard.press('Control+End')
        await page.keyboard.press('Enter')
        await page.keyboard.press('Enter')
        await page.keyboard.type('#')
        await page.keyboard.press('Space')
        await page.keyboard.type(headingOne)
        await page.keyboard.press('Enter')
        await page.keyboard.press('Enter')
        await page.keyboard.type('##')
        await page.keyboard.press('Space')
        await page.keyboard.type(headingTwo)
        await page.keyboard.press('Enter')
        report.edit.keyboard = ['Control+End', 'Enter×2', '# + Space + heading text + Enter', 'Enter', '## + Space + heading text + Enter']
        const editorState = await editor.evaluate(element => ({ html: element.innerHTML, text: element.innerText }))
        report.edit.editorStateBeforeSave = { html: editorState.html.slice(-1600), text: editorState.text.slice(-600) }
        assert.ok(editorState.text.includes(headingOne) && editorState.text.includes(headingTwo), 'Two headings must be present in the real Milkdown editor before saving.')
        const saveButton = editorTarget.getByRole('button', { name: '保存', exact: true })
        await saveButton.waitFor({ state: 'visible', timeout: 8000 })
        const saveResponsePromise = page.waitForResponse(response => {
          const url = new URL(response.url())
          return response.request().method() === 'POST' && url.origin === origin
            && url.pathname === `/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`
        }, { timeout: 30000 })
        await saveButton.click()
        const saveResponse = await saveResponsePromise
        assert.equal(saveResponse.status(), 200, 'The real original Canvas batch must return success for the body save.')
        await editSurface.waitFor({ state: 'hidden', timeout: 20000 })
        const saved = await verifyBodyRevision(before, headingTwo)
        assert.notEqual(String(saved.value.revisionId), String(before.value.revisionId), 'A changed body must create one new Core revision.')
        assert.ok(new RegExp(`^#\\s+${escapeRegExp(headingOne)}$`, 'm').test(saved.value.body), 'Core markdown must preserve the keyboard-created H1.')
        assert.ok(new RegExp(`^##\\s+${escapeRegExp(headingTwo)}$`, 'm').test(saved.value.body), 'Core markdown must preserve the keyboard-created H2 hierarchy.')
        report.edit.saved = { artifactId: saved.value.artifactId, artifactViewId: saved.value.viewId,
          priorRevisionId: before.value.revisionId, revisionId: saved.value.revisionId,
          fileRecordId: saved.value.fileRecordId, body: saved.value.body,
          currentRevisionListed: saved.revisionListed, exactFileBytesMatch: saved.bytesMatch,
          nativeBatch: report.network.allowedTargetBatches.at(-1) ?? null }
        report.cases.push({ name: '原节点双击 → Milkdown 键盘输入 H1/H2 → 原保存按钮 → Core Revision/FileRecord 精确回读',
          passed: true, detail: report.edit.saved })
      }
    }

    if (requestedPhase === 'format') {
      const before = await readCanonicalBundle()
      const beforeLevels = { parent: headingLevel(before.value.body, headingOne), child: headingLevel(before.value.body, headingTwo) }
      assert.ok(beforeLevels.parent > 0 && beforeLevels.child > beforeLevels.parent,
        'Format phase only targets the two existing synthetic heading blocks; it never appends or replaces a document.')
      const expectedFormattedBody = before.value.body
        .replace(new RegExp(`^#{${beforeLevels.parent}}\\s+${escapeRegExp(headingOne)}$`, 'm'), `# ${headingOne}`)
        .replace(new RegExp(`^#{${beforeLevels.child}}\\s+${escapeRegExp(headingTwo)}$`, 'm'), `## ${headingTwo}`)
      const textTab = targetNode.locator('[data-lcos-text-face-mode="text"]')
      if (await textTab.getAttribute('aria-selected') !== 'true') {
        await textTab.click()
        await waitForCanvas(node => node.data?.lcosTextViewMode === 'text', 'original Text mode before formatting')
      }
      const exposedText = await inspectNativeBodyExposure(nativeBody)
      assert.equal(exposedText.exposed, true)
      await nativeBody.dblclick({ position: exposedText.exposedLocalPoint })
      const editSurface = targetNode.locator('.lcos-inline-text-editor')
      const editor = editSurface.locator('.ProseMirror[contenteditable="true"]')
      await editor.waitFor({ state: 'visible', timeout: 12000 })
      report.format = { beforeLevels, saveEnabled: args.has('--save-heading-format'), steps: [] }
      for (const [title, level] of [[headingOne, 1], [headingTwo, 2]]) {
        const block = editor.locator('h1,h2,h3,h4,h5,h6').filter({ hasText: title })
        assert.equal(await block.count(), 1)
        assert.equal(await block.innerText(), title)
        await block.click({ clickCount: 3 })
        const selection = await page.evaluate(() => {
          const current = document.getSelection()
          return { text: current?.toString() ?? '', anchorTag: current?.anchorNode?.parentElement?.closest('h1,h2,h3,h4,h5,h6')?.tagName ?? null }
        })
        assert.ok(selection.text.trim().length > 0, 'Real pointer selection must be nonempty before the existing floating toolbar can open.')
        // Common/Button owns its title as a Tooltip, not a DOM title attr.
        // Locate the real current-block button by its visible text instead.
        const blockTypeButton = page.locator('[data-floating-chrome]').getByRole('button', {
          name: /^(标题 [1-6]|Heading [1-6]|editor\.blocks\.heading[1-6])$/,
        })
        await blockTypeButton.waitFor({ state: 'visible', timeout: 8000 })
        const blockTypeTitle = await blockTypeButton.innerText()
        await blockTypeButton.click()
        const menu = page.getByRole('menu')
        await menu.waitFor({ state: 'visible', timeout: 8000 })
        const menuTitles = await menu.locator('button').allTextContents()
        report.format.steps.push({ title, level, selection, blockTypeTitle, menuTitles })
        const headingOption = menu.getByRole('button', { name: new RegExp(`^(标题 ${level}|Heading ${level}|editor\\.blocks\\.heading${level})$`) })
        await headingOption.waitFor({ state: 'visible', timeout: 8000 })
        await headingOption.click()
        await editor.locator(`h${level}`).filter({ hasText: title }).waitFor({ state: 'visible', timeout: 8000 })
        assert.equal(await editor.locator(`h${level}`).filter({ hasText: title }).innerText(), title)
      }
      await screenshot('absolute-heading-toolbar-draft', targetNode)
      if (args.has('--save-heading-format') && expectedFormattedBody !== before.value.body) {
        const saveResponsePromise = page.waitForResponse(response => new URL(response.url()).pathname === `/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`
          && response.request().method() === 'POST', { timeout: 30000 })
        await editSurface.getByRole('button', { name: '保存', exact: true }).click()
        assert.equal((await saveResponsePromise).status(), 200)
        await editSurface.waitFor({ state: 'hidden', timeout: 20000 })
        const saved = await verifyBodyRevision(before, headingTwo)
        assert.equal(headingLevel(saved.value.body, headingOne), 1)
        assert.equal(headingLevel(saved.value.body, headingTwo), 2)
        assert.equal(saved.value.body, expectedFormattedBody, 'The real formatting commands must preserve every other source byte.')
        assert.equal(saved.revisions.length, before.revisions.length + 1, 'One changed formatting save must create exactly one new Core revision.')
        report.format.saved = { body: saved.value.body, revisionId: saved.value.revisionId, fileRecordId: saved.value.fileRecordId,
          exactFileBytesMatch: saved.bytesMatch, revisionCount: saved.revisions.length }
      } else {
        page.once('dialog', dialog => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss())
        await editSurface.getByRole('button', { name: '取消编辑', exact: true }).click()
        await editSurface.waitFor({ state: 'hidden', timeout: 10000 })
        const cancelled = await readCanonicalBundle()
        assert.equal(cancelled.value.body, before.value.body)
        assert.equal(cancelled.value.revisionId, before.value.revisionId)
        report.format.cancelledWithoutBodyWrite = true
        if (args.has('--save-heading-format')) report.format.writeSkipped = 'Exact H1/H2 formatting was already persisted; no repeat save.'
      }
      report.cases.push({ name: '原 Milkdown 浮动块菜单的绝对 H1/H2 命令，真实选区与鼠标点击', passed: true, detail: report.format })
    }

    if (requestedPhase === 'faces') {
      const coreBeforeFaces = await readCanonicalBundle()
      const parentLevel = headingLevel(coreBeforeFaces.value.body, headingOne)
      const childLevel = headingLevel(coreBeforeFaces.value.body, headingTwo)
      assert.ok(parentLevel > 0 && childLevel > parentLevel,
        'Faces require an actual persisted parent/child heading hierarchy, but do not certify absolute H1/H2 formatting.')
      report.faceHeadingPrecondition = { parentLevel, childLevel, absoluteH1H2Verified: parentLevel === 1 && childLevel === 2 }
      const targetBeforeFaces = (await readCanvas()).nodes.find(node => String(node.id) === nodeId)
      const startingCollapsed = Array.isArray(targetBeforeFaces.data?.lcosTextCollapsedIds) ? [...targetBeforeFaces.data.lcosTextCollapsedIds] : []
      const modeTab = mode => targetNode.locator(`[data-lcos-text-face-mode="${mode}"]`)
      const outlineTab = modeTab('outline')
      await outlineTab.click()
      await outlineTab.waitFor({ state: 'visible' })
      await page.waitForFunction(() => document.querySelector('[data-lcos-text-face-mode="outline"]')?.getAttribute('aria-selected') === 'true', null, { timeout: 10000 })
      const outlineState = await waitForCanvas(node => node.data?.lcosTextViewMode === 'outline', 'original Outline tab preference')
      const startingGeometry = geometryOf(outlineState.node)
      const startingSize = dimensionsOf(outlineState.node)
      const tree = targetNode.getByRole('tree', { name: /大纲/ })
      await tree.waitFor({ state: 'visible', timeout: 10000 })
      const parentRow = tree.getByRole('treeitem').filter({ hasText: headingOne })
      assert.equal(await parentRow.count(), 1, 'The actual persisted parent heading must have one exact original outline branch row.')
      const toggle = parentRow.getByRole('button').first()
      const initialExpanded = await toggle.getAttribute('aria-label') === `折叠 ${headingOne}`
      assert.ok(initialExpanded || await toggle.getAttribute('aria-label') === `展开 ${headingOne}`, 'The parent branch must expose its original collapse/expand control.')
      const childText = tree.getByText(headingTwo, { exact: true })
      const collapsedIdsBefore = Array.isArray(outlineState.node.data?.lcosTextCollapsedIds) ? [...outlineState.node.data.lcosTextCollapsedIds] : []
      if (initialExpanded) {
        await toggle.click()
        await childText.waitFor({ state: 'detached', timeout: 10000 })
        const collapsedState = await waitForCanvas(node => Array.isArray(node.data?.lcosTextCollapsedIds)
          && node.data.lcosTextCollapsedIds.length > collapsedIdsBefore.length, 'original persisted outline collapse')
        await parentRow.getByRole('button').first().click()
        await childText.waitFor({ state: 'visible', timeout: 10000 })
        const expandedState = await waitForCanvas(node => stable(node.data?.lcosTextCollapsedIds ?? []) === stable(collapsedIdsBefore), 'original persisted outline expand')
        report.faces = { collapseExpandedFromInitiallyOpen: true,
          collapsedIds: collapsedState.node.data.lcosTextCollapsedIds, restoredCollapsedIds: expandedState.node.data.lcosTextCollapsedIds }
      } else {
        await toggle.click()
        await childText.waitFor({ state: 'visible', timeout: 10000 })
        const expandedState = await waitForCanvas(node => stable(node.data?.lcosTextCollapsedIds ?? []) !== stable(collapsedIdsBefore), 'original persisted outline expand')
        await parentRow.getByRole('button').first().click()
        await childText.waitFor({ state: 'detached', timeout: 10000 })
        const collapsedState = await waitForCanvas(node => stable(node.data?.lcosTextCollapsedIds ?? []) === stable(collapsedIdsBefore), 'original persisted outline collapse restore')
        report.faces = { collapseExpandedFromInitiallyClosed: true,
          expandedIds: expandedState.node.data.lcosTextCollapsedIds, restoredCollapsedIds: collapsedState.node.data.lcosTextCollapsedIds }
      }
      assert.equal(stable((await readCanvas()).nodes.find(node => String(node.id) === nodeId).data?.lcosTextCollapsedIds ?? []),
        stable(startingCollapsed), 'Outline collapse/expand must restore its initial persisted preference exactly.')
      // TapNow's existing O8 history records debounced snapshots. Let this real
      // outline state settle before exercising a separate native undo step.
      await page.waitForTimeout(1300)
      const mindmapTab = modeTab('mindmap')
      await mindmapTab.click()
      await page.waitForFunction(() => document.querySelector('[data-lcos-text-face-mode="mindmap"]')?.getAttribute('aria-selected') === 'true', null, { timeout: 10000 })
      const mapState = await waitForCanvas(node => node.data?.lcosTextViewMode === 'mindmap', 'original Mindmap tab preference')
      const mapGeometry = geometryOf(mapState.node)
      const mapSize = dimensionsOf(mapState.node)
      const previousSize = mapState.node.data?.lcosTextBeforeMindMapSize
      assert.deepEqual(previousSize, startingSize, 'Original Mindmap preference must store the prior TapNow node dimensions.')
      report.faces.modeAndSize = { modeBefore: targetBeforeFaces.data?.lcosTextViewMode ?? 'text', modeAfter: mapState.node.data.lcosTextViewMode,
        sizeBefore: startingSize, sizeAfter: mapSize, storedPreviousSize: previousSize,
        geometryBefore: startingGeometry, geometryAfter: mapGeometry }
      await page.waitForTimeout(1300)
      await page.keyboard.press('Control+z')
      const undone = await waitForCanvas(node => node.data?.lcosTextViewMode === 'outline', 'one original keyboard Undo of Mindmap mode+size')
      assert.equal(stable(geometryOf(undone.node)), stable(startingGeometry), 'One native Undo must restore both the prior mode and the exact previous geometry.')
      await page.keyboard.press('Control+Shift+z')
      const redone = await waitForCanvas(node => node.data?.lcosTextViewMode === 'mindmap', 'one original keyboard Redo of Mindmap mode+size')
      assert.equal(stable(geometryOf(redone.node)), stable(mapGeometry), 'One native Redo must restore the exact persisted Mindmap geometry.')
      const coreAfterFaces = await readCanonicalBundle()
      assert.equal(String(coreAfterFaces.value.revisionId), String(coreBeforeFaces.value.revisionId), 'Text-face and history operations must not revise canonical Core text.')
      assert.equal(coreAfterFaces.value.body, coreBeforeFaces.value.body)
      const afterCanvas = await readCanvas()
      report.faces.nonTargetInvariants = assertNonTargetInvariants(initialCanvas, afterCanvas, 'text-faces')
      report.faces.finalMode = redone.node.data.lcosTextViewMode
      report.faces.finalGeometry = geometryOf(redone.node)
      report.cases.push({ name: '原正文/大纲/脑图切换、持久折叠恢复、Mindmap 模式+尺寸由原键盘单次 Undo/Redo 回读', passed: true, detail: report.faces })
    }

    if (requestedPhase === 'outline') {
      const before = await readCanonicalBundle()
      assert.ok(headingLevel(before.value.body, headingOne) === 1 && headingLevel(before.value.body, headingTwo) === 2,
        'Run edit phase first; outline editor requires the persisted H1/H2 fixture hierarchy.')
      const alreadyEdited = before.value.body.includes(`## ${outlineHeading}`)
      if (alreadyEdited) {
        report.outline = { branchEditAlreadyPersisted: true, writeSkipped: true, body: before.value.body,
          revisionId: before.value.revisionId, exactFileBytesMatch: before.file.bytes.toString('utf8') === before.value.body }
      } else {
        const mindmapTab = targetNode.locator('[data-lcos-text-face-mode="mindmap"]')
        if (await mindmapTab.getAttribute('aria-selected') !== 'true') {
          await mindmapTab.click()
          await page.waitForFunction(() => document.querySelector('[data-lcos-text-face-mode="mindmap"]')?.getAttribute('aria-selected') === 'true', null, { timeout: 10000 })
          await waitForCanvas(node => node.data?.lcosTextViewMode === 'mindmap', 'original Mindmap mode for branch editor')
        }
        await targetNode.getByRole('button', { name: '编辑导图', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: '编辑大纲导图', exact: true })
        await dialog.waitFor({ state: 'visible', timeout: 10000 })
        const branch = dialog.locator('g.lcos-mindmap-topic').filter({ hasText: headingTwo })
        assert.equal(await branch.count(), 1, 'The exact H2 branch must exist once in the original structure editor.')
        await branch.dblclick()
        const branchInput = dialog.locator('input')
        await branchInput.waitFor({ state: 'visible', timeout: 8000 })
        const inputBefore = await branchInput.inputValue()
        assert.equal(inputBefore, headingTwo, 'The original branch input must contain the exact pre-edit heading.')
        await branchInput.click()
        await page.keyboard.press('Control+a')
        await page.keyboard.type(outlineHeading)
        await dialog.locator('header strong').click()
        await branchInput.waitFor({ state: 'detached', timeout: 8000 })
        assert.ok(await dialog.getByText(outlineHeading, { exact: true }).count(), 'Branch edit must be visible in the real original diagram before save.')
        report.outline = { entry: 'original mindmap tab → 编辑导图 → actual H2 branch double-click → input keyboard edit',
          originalBranchText: inputBefore, editedBranchText: outlineHeading, saveButton: '保存导图' }
        const saveResponsePromise = page.waitForResponse(response => {
          const url = new URL(response.url())
          return response.request().method() === 'POST' && url.origin === origin
            && url.pathname === `/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`
        }, { timeout: 30000 })
        await dialog.getByRole('button', { name: '保存导图', exact: true }).click()
        const saveResponse = await saveResponsePromise
        assert.equal(saveResponse.status(), 200)
        await dialog.waitFor({ state: 'hidden', timeout: 20000 })
        const saved = await verifyBodyRevision(before, outlineHeading)
        assert.notEqual(String(saved.value.revisionId), String(before.value.revisionId), 'One actual branch text change must create a new Core revision.')
        assert.ok(new RegExp(`^##\\s+${escapeRegExp(outlineHeading)}$`, 'm').test(saved.value.body), 'Core body must exactly reflect the branch input edit.')
        assert.ok(saved.value.body.includes(`# ${headingOne}`), 'The original parent heading must remain byte-for-byte present as text.')
        report.outline.saved = { artifactId: saved.value.artifactId, artifactViewId: saved.value.viewId,
          priorRevisionId: before.value.revisionId, revisionId: saved.value.revisionId,
          fileRecordId: saved.value.fileRecordId, body: saved.value.body,
          currentRevisionListed: saved.revisionListed, exactFileBytesMatch: saved.bytesMatch,
          nativeBatch: report.network.allowedTargetBatches.at(-1) ?? null }
      }
      const afterCanvas = await readCanvas()
      report.outline.nonTargetInvariants = assertNonTargetInvariants(initialCanvas, afterCanvas, 'outline branch edit')
      const readback = await readCanonicalBundle()
      assert.equal(readback.value.artifactId, artifactId)
      assert.equal(readback.value.viewId, initialRef.artifactViewId)
      assert.equal(readback.file.bytes.toString('utf8'), readback.value.body)
      report.cases.push({ name: '原大纲结构编辑器双击分支输入并保存回原 Artifact/Core 正文，精确保护父级内容与 FileRecord 字节',
        passed: true, detail: report.outline })
    }

    if (requestedPhase === 'load' || args.has('--readback-only')) {
      const current = await readCanonicalBundle()
      report.load = { exactBody: current.value.body, artifactId: current.value.artifactId,
        artifactViewId: current.value.viewId, revisionId: current.value.revisionId,
        currentRevisionListed: current.revisionListed, exactFileBytesMatch: current.bytesMatch,
        renderedNativeTextHost: true, providerTaskSubmitted: false }
      report.cases.push({ name: '单一 Context Canvas 中原始 Core-bound Text 节点、动态画布标题和 Core 正文/Revision/FileRecord 均可读', passed: true, detail: report.load })
    }

    const after = await readCanvas()
    report.nonTargetInvariants ??= assertNonTargetInvariants(initialCanvas, after, requestedPhase)
    assertNoProviderSubmit()
    report.final = { targetNode: nodeSnapshot(after.nodes.find(node => String(node.id) === nodeId)),
      allowedTargetBatchCount: report.network.allowedTargetBatches.length,
      blockedWriteCount: report.network.blockedWrites.length,
      blockedExternalHttpCount: report.network.externalHttpBlocked.length,
      pageErrorCount: report.pageErrors.length, consoleErrorCount: report.consoleErrors.length,
      apiFailureCount: report.network.apiFailures.length, fullScopeComplete: report.server.fullScopeComplete }
    await checkPageIdentity('final')
    await screenshot('final', targetNode)
    report.passed = true
    report.runState = args.has('--readback-only') ? 'executed deployed read-only inspection; no writes enabled'
      : writePhase ? `executed deployed ${requestedPhase} phase; only exact target update batches were permitted`
        : 'executed deployed read-only load phase; no writes enabled'
  } catch (error) {
    report.failure = cleanText(error?.stack || error)
    report.passed = false
    report.runState = 'executed; failure and diagnostics preserved'
    if (page) {
      report.failurePage = await page.evaluate(expectedNodeId => ({ title: document.title, pathname: location.pathname,
        bodyText: (document.body?.innerText ?? '').slice(0, 1500), reactFlowRoots: document.querySelectorAll('.react-flow').length,
        canvasId: window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId ?? null,
        nodeIds: [...document.querySelectorAll('.react-flow__node[data-id]')].map(node => node.getAttribute('data-id')),
        nativeTextPending: window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.getPending?.() ?? null,
        nativeTarget: (() => { const node = window.__LCOS_NODE_LAB__?.api?.getNode?.(expectedNodeId);
          return node ? { id: node.id, type: node.type, text: node.data?.text, content: node.data?.content,
            ref: node.data?.lcos_ref, selected: node.selected, position: node.position, measured: node.measured } : null; })(),
        nativeTextHosts: [...document.querySelectorAll('[data-lcos-native-text-body]')].map(node => ({
          id: node.getAttribute('data-lcos-native-text-body'),
          outerReadState: node.getAttribute('data-lcos-native-text-read-state'),
          matureBodyState: node.querySelector('[data-lcos-inline-text]')?.getAttribute('data-state') ?? null,
        }))
      }), nodeId).catch(() => null)
      await screenshot('failure').catch(error => report.screenshotFailure = cleanText(error?.message || error))
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
    await mkdir(evidenceDir, { recursive: true })
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  }

  console.log(JSON.stringify({ runState: report.runState, passed: report.passed, phase: requestedPhase,
    target: report.target, fixtureBefore: report.fixtureBefore, edit: report.edit, faces: report.faces,
    outline: report.outline, load: report.load, final: report.final,
    allowedTargetBatches: report.network.allowedTargetBatches.length,
    blockedWrites: report.network.blockedWrites, blockedExternalHttp: report.network.externalHttpBlocked.length,
    apiFailures: report.network.apiFailures, providerTaskRequests: report.network.providerTaskRequests,
    pageErrors: report.pageErrors, consoleErrors: report.consoleErrors, screenshots: report.screenshots,
    failure: report.failure, evidence: reportPath }, null, 2))
  if (!report.passed) process.exitCode = 1
}

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function headingLevel(body, title) {
  const matches = [...body.matchAll(new RegExp(`^(#{1,6})\\s+${escapeRegExp(title)}$`, 'gm'))]
  assert.equal(matches.length, body.includes(title) ? 1 : 0, `Heading marker must occur exactly once: ${title}`)
  return matches[0]?.[1].length ?? 0
}

async function inspectNativeBodyExposure(locator) {
  return locator.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const centerHit = document.elementFromPoint(center.x, center.y)
    const candidates = [...element.querySelectorAll('[data-lcos-node-preview], .lcos-document-title, .lcos-text-face-content, .lcos-document-full')]
      .filter(candidate => (candidate.textContent || '').trim() && candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0)
    const sampleFractions = [.2, .35, .5, .65, .8]
    const probes = []
    for (const candidate of [...candidates, element]) {
      const box = candidate.getBoundingClientRect()
      for (const fx of sampleFractions) for (const fy of sampleFractions) {
        const x = box.left + box.width * fx, y = box.top + box.height * fy
        const hit = document.elementFromPoint(x, y)
        const insideBody = Boolean(hit && (hit === element || element.contains(hit)))
        const control = hit?.closest?.('button,input,textarea,select,a,[role="button"],[role="tab"],[data-floating-chrome]') ?? null
        const flowNode = hit?.closest?.('.react-flow__node[data-id]') ?? null
        probes.push({ x, y, candidate: candidate.className?.toString?.() ?? candidate.tagName,
          hitTag: hit?.tagName ?? null, hitClass: hit?.className?.toString?.() ?? null,
          closestNodeId: flowNode?.getAttribute('data-id') ?? null,
          insideBody, interactive: Boolean(control), exposed: insideBody && !control })
      }
    }
    const accepted = probes.find(probe => probe.exposed)
    const centerFlowNode = centerHit?.closest?.('.react-flow__node[data-id]') ?? null
    return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      center: { ...center, hitTag: centerHit?.tagName ?? null, hitClass: centerHit?.className?.toString?.() ?? null,
        closestNodeId: centerFlowNode?.getAttribute('data-id') ?? null,
        exposed: Boolean(centerHit && (centerHit === element || element.contains(centerHit))) },
      contentCandidates: candidates.map(candidate => ({ tag: candidate.tagName, className: candidate.className?.toString?.() ?? '',
        text: (candidate.textContent || '').trim().slice(0, 160) })),
      exposed: Boolean(accepted), exposedPoint: accepted ? { x: accepted.x, y: accepted.y } : null,
      exposedLocalPoint: accepted ? { x: accepted.x - rect.left, y: accepted.y - rect.top } : null,
      exposedHit: accepted ? { tag: accepted.hitTag, className: accepted.hitClass,
        candidate: accepted.candidate, closestNodeId: accepted.closestNodeId } : null,
      probes: probes.filter(probe => probe.exposed || probe.x === center.x && probe.y === center.y).slice(0, 16) }
  })
}

async function readNativeSelectionSnapshot(page, nodeId) {
  return page.evaluate(id => {
    const node = document.querySelector(`.react-flow__node[data-id="${id}"]`)
    if (!node) return null
    const rect = node.getBoundingClientRect()
    const api = window.__LCOS_NODE_LAB__?.api
    const selection = api?.getSelection?.()
    const computed = getComputedStyle(node)
    return { nodeId: id, className: node.className?.toString?.() ?? '', selectedClass: node.classList.contains('selected'),
      inlineZIndex: node.style.zIndex || null, computedZIndex: computed.zIndex,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      selectedNodeIds: Array.isArray(selection?.nodeIds) ? [...selection.nodeIds].map(String) : [] }
  }, nodeId)
}

async function waitForTwoFrames(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
