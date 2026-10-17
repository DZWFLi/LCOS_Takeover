import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const valueArg = name => process.argv.slice(2).find(value => value.startsWith(name + '='))?.slice(name.length + 1)
const readOnlyExistingMembers = args.has('--read-only-existing-members')
const missing = []
if (!args.has('--deployed')) missing.push('缺少 --deployed；未显式确认 Root 已部署版本时不会连接本地服务。')
if (readOnlyExistingMembers === args.has('--allow-context-membership-edits')) missing.push('二选一：--allow-context-membership-edits 或 --read-only-existing-members；只读恢复不重复提交。')
if (args.has('--help')) {
  console.log('Usage: node scripts/native-saved-context-browser.mjs --deployed <--allow-context-membership-edits | --read-only-existing-members> [--base-url=http://127.0.0.1:17881]')
} else if (missing.length) {
  console.error(JSON.stringify({ runState: 'not-started', errors: missing }, null, 2))
  process.exitCode = 2
} else {
  await run()
}

async function run() {
  const base = new URL(valueArg('--base-url') || 'http://127.0.0.1:17881')
  assert.equal(base.protocol, 'http:')
  assert.equal(base.hostname, '127.0.0.1')
  assert.equal(base.port, '17881')
  assert.equal(base.pathname, '/')
  assert.equal(base.search, '')
  assert.equal(base.hash, '')
  assert.equal(base.username, '')
  assert.equal(base.password, '')

  const origin = base.origin
  const projectId = 'disposable-surface-core-facade'
  const targetScopeId = 'scope-surface-core-context'
  const targetScopeTitle = '合成 Saved Context'
  const contextPresentationId = `presentation:context:${targetScopeId}`
  const surfaces = [
    { key: 'main', canvasId: 'surface-core-main', textNodeId: 'surface-main-text', imageNodeId: 'surface-main-image' },
    { key: 'context', canvasId: 'surface-core-context', textNodeId: 'surface-context-text', imageNodeId: 'surface-context-image' },
    { key: 'workflow', canvasId: 'surface-core-workflow', textNodeId: 'surface-workflow-text', imageNodeId: 'surface-workflow-image' },
  ]
  const workflow = surfaces.find(surface => surface.key === 'workflow')
  assert.ok(workflow)
  const targetNodeIds = [workflow.textNodeId, workflow.imageNodeId]
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
  const evidenceDir = path.join(root, '.runtime', 'native-saved-context')
  const evidencePath = path.join(evidenceDir, stamp + '.json')
  const expectedApplyPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}/assembly/apply`
  const report = {
    schema: 'native-saved-context-browser-v1', at: new Date().toISOString(), runState: 'starting', passed: false,
    mode: readOnlyExistingMembers ? 'read-only existing membership reopen/reload; every write blocked' : 'two explicit Saved Context membership clicks',
    target: { origin, projectId, sourceCanvasId: workflow.canvasId, targetScopeId, targetScopeTitle, presentationId: contextPresentationId,
      sourceNodeIds: targetNodeIds },
    flow: 'Workflow original Canvas pointer selection → original Agent entry Saved Context button → original ContextAtlasStage card → two explicit exact Assembly clicks → close/reopen → real reload → read-only membership confirmation',
    browser: { engine: 'installed Chrome', freshContext: true, headless: true, viewport: { width: 1440, height: 1000 },
      locale: 'zh-CN', serviceWorkers: 'blocked', onlyLoopbackOrigin: origin },
    setupWrites: 0,
    baseline: { health: null, surfaceStatus: null, canvases: null, coreGraph: null, presentations: null, materials: null },
    selection: null,
    ui: { originalAgentPanelClosedBeforeSelection: false, originalLauncherUsed: false,
      savedContextEntryUsed: false, atlasRegion: null, cardSelection: null, actionSelector: null,
      beforeFirstClick: null, firstClick: null, secondClick: null, afterReopen: null, afterReload: null,
      frameworkOverlayChecks: [], meaningfulOriginalUI: false },
    network: { allowedOrigin: origin, businessWritePath: expectedApplyPath, allowedAssemblyPosts: [],
      blockedWrites: [], scopeViolations: [], externalHttpBlocked: [], remoteWebSocketsBlocked: [], requestFailures: [], apiFailures: [], browserReads: [] },
    directReads: [], pageErrors: [], consoleErrors: [], consoleWarnings: [],
    sceneIntegrity: { afterFirstClick: null, afterSecondClick: null, afterReopen: null, afterReload: null },
    screenshots: [], cases: [], failure: null, failureRecovery: null, evidencePath,
    notes: [
      'Only two explicitly clicked POSTs to the exact same-project Core Assembly route can pass; both must carry the two original Workflow ArtifactView IDs and the exact Saved Context scope.',
      'Every other Canvas batch, direct Core mutation, Provider/Agent action, or off-origin request is blocked and retained in diagnostics; no setup/repair/fixture creation or retry is performed.',
      'Core Presentation is the membership owner. No Canvas/Workspace/Artifact/View/Revision/FileRecord or text bytes may change.',
      'The second explicit click must return per-item skipped/already-member, with no additional membership or ChangeSet.',
      'Initial baseline requires an empty presentations list; if it is not empty, the script stops before browser interaction or mutation.',
    ],
  }

  let browser, context, page
  let projectGraphBefore, canvasesBefore, coreSceneBefore, presentationsBefore, lastPresentationObservation
  let sourceRefs = []
  let activeClick = null
  let browserReadSequence = []
  const admittedAttempts = new Set()
  const applyCaptures = []

  const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value)
  const nonEmpty = value => typeof value === 'string' && value.trim().length > 0
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical)
    if (!isRecord(value)) return value
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  }
  const stable = value => JSON.stringify(canonical(value))
  const safeAddress = raw => {
    try {
      const url = new URL(raw)
      const keys = [...new Set(url.searchParams.keys())]
      url.search = keys.length ? `?${keys.map(key => `${encodeURIComponent(key)}=[redacted]`).join('&')}` : ''
      url.username = ''; url.password = ''
      return url.origin + url.pathname + url.search
    } catch { return '[unparseable address]' }
  }
  const clean = value => String(value)
    .replace(/https?:\/\/[^\s"'<>]+/g, raw => safeAddress(raw))
    .replace(/((?:token|secret|credential|authorization|api.?key)\s*[:=]\s*)[^\s,;&]+/ig, '$1[redacted]')
    .slice(0, 1400)
  const projectPath = suffix => `/projects/${encodeURIComponent(projectId)}${suffix}`
  const corePath = suffix => `/api/lcos/core${suffix}`
  const attrSelectorValue = value => String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')

  async function getJson(pathname, label) {
    assert.ok(pathname.startsWith('/'), 'Read route must be an origin-relative GET path.')
    const response = await fetch(new URL(pathname, origin), { method: 'GET', headers: { Accept: 'application/json' },
      cache: 'no-store', redirect: 'error' })
    let payload = null
    try { payload = await response.json() } catch { /* Stored as a failed read below. */ }
    const row = { label, method: 'GET', path: pathname, status: response.status,
      code: payload?.code ?? null, ok: payload?.ok ?? null,
      errorCode: payload?.error?.code ?? null, error: payload?.error?.message ? clean(payload.error.message) : null }
    report.directReads.push(row)
    if (!response.ok) report.network.apiFailures.push({ source: 'direct GET', ...row })
    return { response, payload, row }
  }

  async function tapNowData(pathname, label) {
    const result = await getJson(pathname, label)
    assert.equal(result.response.status, 200, `${label} failed (HTTP ${result.response.status}).`)
    assert.equal(result.payload?.code, 0, `${label} returned a non-success TapNow envelope.`)
    assert.ok(result.payload?.data && typeof result.payload.data === 'object', `${label} omitted data.`)
    return result.payload.data
  }

  async function coreValue(route, label) {
    const result = await getJson(corePath(route), label)
    assert.equal(result.response.status, 200, `Core GET ${route} failed (HTTP ${result.response.status}).`)
    assert.equal(result.payload?.ok, true, `Core GET ${route} did not return {ok:true,value}.`)
    assert.ok(Object.hasOwn(result.payload, 'value'), `Core GET ${route} omitted value.`)
    return result.payload.value
  }

  async function coreBytes(route, label) {
    const response = await fetch(new URL(corePath(route), origin), { method: 'GET', headers: { Accept: '*/*' }, cache: 'no-store', redirect: 'error' })
    const bytes = Buffer.from(await response.arrayBuffer())
    const row = { label, method: 'GET', path: corePath(route), status: response.status,
      contentType: response.headers.get('content-type') ?? '', byteLength: bytes.length }
    report.directReads.push(row)
    if (response.status >= 400) report.network.apiFailures.push({ source: 'direct Core bytes GET', ...row })
    assert.ok(response.ok, `Core bytes GET ${route} failed (HTTP ${response.status}).`)
    return { bytes, summary: row }
  }

  async function readCanvas(surface) {
    const pathName = `/api/canvas/v1/canvases/${encodeURIComponent(surface.canvasId)}`
    const result = await tapNowData(pathName, `Huabu Canvas ${surface.key}`)
    assert.equal(result.id, surface.canvasId)
    assert.ok(Array.isArray(result.nodes) && Array.isArray(result.connections), `${surface.key} Canvas omitted native nodes/connections.`)
    return result
  }

  async function readGraph() {
    const graph = await coreValue(projectPath('/graph'), 'Core project graph')
    assert.equal(String(graph?.project?.id), projectId)
    assert.ok(Array.isArray(graph.scopes) && Array.isArray(graph.workspaces)
      && Array.isArray(graph.artifacts) && Array.isArray(graph.artifactViews)
      && Array.isArray(graph.artifactRevisions) && Array.isArray(graph.fileRecords),
    'Core graph omitted project, scope, workspace, Artifact/View/Revision or FileRecord truth.')
    return graph
  }

  async function readPresentations(label = 'Core Presentation list') {
    const rows = await coreValue(projectPath('/presentations'), label)
    assert.ok(Array.isArray(rows), 'Core presentations route did not return an array.')
    lastPresentationObservation = { label, at: new Date().toISOString(),
      admittedAssemblyRequestsAtRead: admittedAttempts.size, rows: structuredClone(rows) }
    return rows
  }

  function exactReference(ref) {
    return isRecord(ref) && ref.version === 1 && ['artifact', 'view'].includes(ref.entityType)
      && nonEmpty(ref.entityId) && nonEmpty(ref.artifactId) && nonEmpty(ref.artifactViewId) && nonEmpty(ref.revisionId)
      && (ref.entityType !== 'artifact' || ref.entityId === ref.artifactId)
      && (ref.entityType !== 'view' || ref.entityId === ref.artifactViewId)
  }

  function exactNativeTextBody(node, label) {
    const data = isRecord(node?.data) ? node.data : {}
    if (Object.hasOwn(data, 'text')) {
      assert.equal(typeof data.text, 'string', `${label}: native data.text exists but is not a string.`)
      return data.text
    }
    assert.ok(Object.hasOwn(data, 'content'), `${label}: native text node omitted text/content.`)
    assert.equal(typeof data.content, 'string', `${label}: native data.content is not a string.`)
    return data.content
  }

  function sceneSnapshot(canvas) {
    return {
      nodes: [...canvas.nodes].map(node => structuredClone(node)).sort((left, right) => String(left.id).localeCompare(String(right.id))),
      connections: [...canvas.connections].map(connection => structuredClone(connection))
        .sort((left, right) => String(left.id).localeCompare(String(right.id))),
    }
  }

  function graphCounts(graph) {
    return Object.fromEntries(['artifacts', 'artifactViews', 'artifactRevisions', 'fileRecords', 'scopes', 'workspaces']
      .map(key => [key, Array.isArray(graph?.[key]) ? graph[key].length : null]))
  }

  async function readTextSnapshot(surface, node) {
    const query = new URLSearchParams({ canvasId: surface.canvasId, spatialId: node.id })
    const snapshot = await coreValue(projectPath('/curation/canvas-text?' + query), `Core CanvasText ${surface.key}/${node.id}`)
    const ref = node.data?.lcos_ref
    assert.equal(snapshot.projectId, projectId)
    assert.equal(snapshot.canvasId, surface.canvasId)
    assert.equal(snapshot.spatialId, node.id)
    assert.equal(snapshot.artifactId, ref.artifactId)
    assert.equal(snapshot.viewId, ref.artifactViewId)
    assert.equal(snapshot.revisionId, ref.revisionId)
    assert.equal(typeof snapshot.body, 'string')
    const canvasBody = exactNativeTextBody(node, `${surface.key}/${node.id}`)
    assert.equal(canvasBody, snapshot.body, `${surface.key} Canvas text differs from canonical Core text.`)
    const raw = Buffer.from(snapshot.body, 'utf8')
    const file = await coreBytes(projectPath(`/file-records/${encodeURIComponent(String(snapshot.fileRecordId))}/content`),
      `Core CanvasText FileRecord ${surface.key}/${node.id}`)
    assert.equal(file.bytes.equals(raw), true, `${surface.key} canonical CanvasText body differs from its FileRecord bytes.`)
    return { projectId: snapshot.projectId, canvasId: snapshot.canvasId, spatialId: snapshot.spatialId,
      artifactId: snapshot.artifactId, viewId: snapshot.viewId, revisionId: snapshot.revisionId,
      fileRecordId: snapshot.fileRecordId, body: snapshot.body, readOwner: 'Core CanvasTextService primary Artifact binding',
      bodyByteLength: raw.length, fileByteLength: file.bytes.length }
  }

  async function captureMaterialState(canvases, graph, label) {
    const materialNodes = []
    for (const surface of surfaces) {
      const canvas = canvases[surface.key]
      for (const node of canvas.nodes) {
        if (!isRecord(node?.data?.lcos_ref)) continue
        assert.ok(exactReference(node.data.lcos_ref), `${surface.key}/${node.id} contains an incomplete Core lcos_ref.`)
        if (!['image', 'text', 'note'].includes(node.type)) continue
        materialNodes.push({ surface, node })
      }
    }
    const seenViews = new Set()
    const materials = []
    const fileBytesByView = {}
    const revisionsByArtifact = new Map()
    const textSnapshots = []
    for (const { surface, node } of materialNodes) {
      const ref = node.data.lcos_ref
      assert.ok(!seenViews.has(ref.artifactViewId), `Multiple original Canvas nodes alias ArtifactView ${ref.artifactViewId}.`)
      seenViews.add(ref.artifactViewId)
      const views = graph.artifactViews.filter(item => String(item.id) === ref.artifactViewId)
      const artifacts = graph.artifacts.filter(item => String(item.id) === ref.artifactId)
      const revisions = graph.artifactRevisions.filter(item => String(item.id) === ref.revisionId)
      assert.equal(views.length, 1, `Core graph must contain exactly one ArtifactView ${ref.artifactViewId}.`)
      assert.equal(artifacts.length, 1, `Core graph must contain exactly one Artifact ${ref.artifactId}.`)
      assert.equal(revisions.length, 1, `Core graph must contain exactly one Revision ${ref.revisionId}.`)
      assert.equal(String(views[0].artifactId), ref.artifactId)
      assert.equal(String(views[0].revisionId), ref.revisionId)
      assert.equal(String(revisions[0].artifactId), ref.artifactId)
      const fileRecordId = String(revisions[0].fileRecordId)
      const files = graph.fileRecords.filter(file => String(file.id) === fileRecordId)
      assert.equal(files.length, 1, `Core graph must contain exactly one FileRecord ${fileRecordId}.`)
      const artifact = artifacts[0]
      assert.equal(String(artifact.projectId), projectId)
      let revisionList = revisionsByArtifact.get(ref.artifactId)
      if (!revisionList) {
        revisionList = await coreValue(`/artifacts/${encodeURIComponent(ref.artifactId)}/revisions`, `Artifact revisions ${ref.artifactId}`)
        assert.ok(Array.isArray(revisionList))
        revisionsByArtifact.set(ref.artifactId, revisionList)
      }
      assert.ok(revisionList.some(item => String(item.id) === ref.revisionId), `Current revision ${ref.revisionId} missing from Artifact revision list.`)
      const fileContent = await coreBytes(projectPath(`/file-records/${encodeURIComponent(fileRecordId)}/content`),
        `Artifact FileRecord ${ref.artifactViewId}`)
      fileBytesByView[ref.artifactViewId] = Buffer.from(fileContent.bytes)
      const material = { surface: surface.key, nodeId: node.id, nodeType: node.type,
        artifactId: ref.artifactId, artifactViewId: ref.artifactViewId, revisionId: ref.revisionId,
        fileRecordId, mimeType: files[0].mimeType, byteLength: fileContent.bytes.length,
        artifactRevisionCount: revisionList.length }
      if (node.type === 'text' || node.type === 'note') {
        let text
        if (ref.entityType === 'artifact') {
          text = await readTextSnapshot(surface, node)
        } else {
          assert.ok(['markdown', 'text'].includes(String(artifact.kind)),
            `${surface.key}/${node.id}: view-only reference does not resolve to a textual Artifact.`)
          assert.equal(String(views[0].revisionId), ref.revisionId,
            `${surface.key}/${node.id}: ArtifactView does not point to the exact revision in lcos_ref.`)
          const body = new TextDecoder('utf-8', { fatal: true }).decode(fileContent.bytes)
          assert.equal(exactNativeTextBody(node, `${surface.key}/${node.id}`), body,
            `${surface.key}/${node.id}: native view-only text differs from its exact Core ArtifactView → Revision → FileRecord bytes.`)
          text = { projectId, canvasId: surface.canvasId, spatialId: node.id,
            artifactId: ref.artifactId, viewId: ref.artifactViewId, revisionId: ref.revisionId,
            fileRecordId, body, readOwner: 'Core graph ArtifactView → ArtifactRevision → FileRecord bytes',
            bodyByteLength: fileContent.bytes.length, fileByteLength: fileContent.bytes.length }
        }
        textSnapshots.push(text)
        material.canvasText = { revisionId: text.revisionId, bodyByteLength: text.bodyByteLength, readOwner: text.readOwner }
      }
      materials.push(material)
    }
    return { label, nodeCount: Object.values(canvases).reduce((sum, canvas) => sum + canvas.nodes.length, 0),
      connectionCount: Object.values(canvases).reduce((sum, canvas) => sum + canvas.connections.length, 0),
      graphCounts: graphCounts(graph), materials, textSnapshots, fileBytesByView,
      revisionsByArtifact: Object.fromEntries([...revisionsByArtifact.entries()].map(([id, rows]) => [id,
        [...rows].map(row => structuredClone(row)).sort((left, right) => String(left.id).localeCompare(String(right.id)))])) }
  }

  async function captureThreeScenes(label) {
    const canvases = {}
    for (const surface of surfaces) canvases[surface.key] = await readCanvas(surface)
    const graph = await readGraph()
    const materials = await captureMaterialState(canvases, graph, label)
    const presentations = await readPresentations(`Core Presentation list · ${label}`)
    return { canvases, graph, materials, presentations,
      canvasSnapshots: Object.fromEntries(surfaces.map(surface => [surface.key, sceneSnapshot(canvases[surface.key])])) }
  }

  function assertScenesUnchanged(before, after, label) {
    for (const surface of surfaces) {
      assert.equal(stable(after.canvasSnapshots[surface.key]), stable(before.canvasSnapshots[surface.key]),
        `${label}: original ${surface.key} Canvas nodes/connections changed.`)
    }
    assert.equal(stable(after.graph), stable(before.graph), `${label}: Core Project Graph changed; Presentation membership must remain outside graph.`)
    const { label: _beforeLabel, ...beforeMaterialState } = before.materials
    const { label: _afterLabel, ...afterMaterialState } = after.materials
    delete beforeMaterialState.fileBytesByView
    delete afterMaterialState.fileBytesByView
    assert.equal(stable(afterMaterialState), stable(beforeMaterialState), `${label}: Core Artifact/View/Revision/FileRecord/text bytes changed.`)
    assert.deepEqual(Object.keys(after.materials.fileBytesByView).sort(), Object.keys(before.materials.fileBytesByView).sort(),
      `${label}: Core ArtifactView/FileRecord byte snapshot set changed.`)
    for (const viewId of Object.keys(before.materials.fileBytesByView)) {
      assert.equal(after.materials.fileBytesByView[viewId].equals(before.materials.fileBytesByView[viewId]), true,
        `${label}: Core FileRecord bytes changed for ArtifactView ${viewId}.`)
    }
    report.sceneIntegrity[label] = { threeCanvasesUnchanged: true, allNodesAndConnectionsUnchanged: true,
      coreGraphUnchanged: true, artifactRevisionListsAndFileBytesUnchanged: true,
      textSnapshotsUnchanged: true, materialCount: before.materials.materials.length,
      canvasNodeCounts: Object.fromEntries(surfaces.map(surface => [surface.key, before.canvases[surface.key].nodes.length])),
      canvasConnectionCounts: Object.fromEntries(surfaces.map(surface => [surface.key, before.canvases[surface.key].connections.length])) }
  }

  function contextPresentationRows(rows) {
    return rows.filter(row => row?.projectId === projectId && row?.scopeId === targetScopeId
      && row?.id === contextPresentationId && row?.capability === 'context')
  }

  function assertPresentationMembers(rows, expectedViewIds, label) {
    const matching = contextPresentationRows(rows)
    assert.equal(matching.length, 1, `${label}: expected exactly one canonical Saved Context Presentation.`)
    const presentation = matching[0]
    assert.equal(String(presentation.projectId), projectId)
    assert.equal(String(presentation.scopeId), targetScopeId)
    assert.equal(presentation.capability, 'context')
    const actual = presentation.state?.memberViewIds
    assert.ok(Array.isArray(actual), `${label}: Presentation state omitted memberViewIds.`)
    assert.equal(new Set(actual).size, actual.length, `${label}: duplicate ArtifactView membership in Presentation.`)
    assert.deepEqual([...actual].sort(), [...expectedViewIds].sort(), `${label}: exact Core Presentation membership mismatch.`)
    assert.deepEqual(presentation.state?.memberEntityRefs ?? [], [], `${label}: unexpected non-view members appeared.`)
    return presentation
  }

  function waitForCondition(description, predicate, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          if (await predicate()) { resolve(); return }
          if (Date.now() >= deadline) { reject(new Error(`Timed out waiting for ${description}.`)); return }
          setTimeout(poll, 50)
        } catch (error) { reject(error) }
      }
      void poll()
    })
  }

  async function screenshot(name, locator = null) {
    await mkdir(visualRoot, { recursive: true })
    const viewportPath = path.join(visualRoot, `tapnow-native-saved-context-${stamp}-${name}.png`)
    await page.screenshot({ path: viewportPath, fullPage: false, animations: 'disabled' })
    report.screenshots.push({ name, kind: 'viewport', path: viewportPath })
    if (locator) {
      const elementPath = path.join(visualRoot, `tapnow-native-saved-context-${stamp}-${name}-target.png`)
      await locator.screenshot({ path: elementPath, animations: 'disabled' })
      report.screenshots.push({ name, kind: 'target', path: elementPath })
    }
  }

  async function assertNoFrameworkErrorOverlay(phase) {
    const selectors = 'vite-error-overlay, nextjs-portal, #webpack-dev-server-client-overlay, [data-nextjs-dialog]'
    const visibleOverlays = await page.locator(selectors).evaluateAll(elements => elements.filter(element => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
        && rect.width > 0 && rect.height > 0
    }).map(element => ({ tag: element.tagName.toLowerCase(), id: element.id || null,
      className: typeof element.className === 'string' ? element.className : null })))
    assert.deepEqual(visibleOverlays, [], `${phase}: visible framework/dev error overlay is not allowed.`)
    report.ui.frameworkOverlayChecks.push({ phase, visibleOverlayCount: 0, selectors })
  }

  async function closeAgentPanelIfVisible() {
    const panel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (await panel.count() && await panel.isVisible()) {
      const close = panel.getByRole('button', { name: '关闭 Agent 面板', exact: true })
      assert.equal(await close.count(), 1)
      await close.click()
      await panel.waitFor({ state: 'hidden', timeout: 10000 })
      return true
    }
    return false
  }

  async function exposedNodeSelectionPoint(locator, nodeId) {
    return locator.evaluate((node, expectedId) => {
      const rect = node.getBoundingClientRect()
      const probes = []
      for (const fx of [.5, .7, .3, .85]) for (const fy of [.5, .7, .3, .85]) {
        const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy
        const hit = document.elementFromPoint(x, y)
        const owner = hit?.closest('.react-flow__node[data-id]')
        const control = hit?.closest('button,input,textarea,select,a,[role="button"],[role="tab"],[data-floating-chrome],[contenteditable="true"]')
        probes.push({ x, y, local: { x: x - rect.left, y: y - rect.top },
          hitTag: hit?.tagName ?? null, hitClass: hit?.className?.toString?.() ?? null,
          nodeId: owner?.getAttribute('data-id') ?? null, control: Boolean(control),
          exposed: Boolean(hit && node.contains(hit) && owner?.getAttribute('data-id') === expectedId && !control) })
      }
      const point = probes.find(probe => probe.exposed)
      return { point: point ?? null, probes }
    }, nodeId)
  }

  async function openOriginalAgentPanel() {
    const panel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (await panel.count() && await panel.isVisible()) return panel
    const launchers = page.locator('[data-pile-gallery-chrome="bottom-right"] button')
    await launchers.last().waitFor({ state: 'visible', timeout: 15000 })
    const launcher = launchers.last()
    const markup = await launcher.evaluate(element => element.outerHTML)
    assert.match(markup, /\/agent-motion\//, 'Expected the original in-app Agent entry, not a framework/replacement overlay.')
    await launcher.click()
    await panel.waitFor({ state: 'visible', timeout: 15000 })
    return panel
  }

  async function openOriginalSavedContextAtlas() {
    const panel = await openOriginalAgentPanel()
    const button = panel.getByRole('button', { name: '打开已保存上下文', exact: true })
    assert.equal(await button.count(), 1, 'Original Agent panel must expose one Saved Context entry.')
    await waitForCondition('Core project identity enables the original Saved Context entry', () => button.isEnabled(), 20000)
    await button.click()
    await panel.waitFor({ state: 'hidden', timeout: 10000 })
    const atlas = page.getByRole('region', { name: '上下文集合', exact: true })
    await atlas.waitFor({ state: 'visible', timeout: 20000 })
    assert.equal(await page.locator('.react-flow').count(), 1, 'Atlas entry must preserve the original single ReactFlow Canvas.')
    report.ui.originalLauncherUsed = true
    report.ui.savedContextEntryUsed = true
    report.ui.meaningfulOriginalUI = true
    report.ui.atlasRegion = { role: 'region', name: '上下文集合', visible: true,
      reactFlowRoots: await page.locator('.react-flow').count(), sourceCanvasId: workflow.canvasId }
    return atlas
  }

  async function focusSavedContextCard(atlas, phase) {
    const button = atlas.getByRole('button', { name: `选中并预览 · ${targetScopeTitle}`, exact: true })
    await waitForCondition(`${phase}: exact original Context folder button to render`, async () => {
      const count = await button.count()
      assert.ok(count <= 1, `${phase}: exact original Context folder button must be unique (found ${count}).`)
      return count === 1
    }, 30000)
    assert.equal(await button.count(), 1, `${phase}: exact original Context folder button must be unique.`)
    await button.click()
    const actionRoot = page.locator(`[data-lcos-native-saved-context-action="${attrSelectorValue(targetScopeId)}"]`)
    await actionRoot.waitFor({ state: 'visible', timeout: 15000 })
    const actionButton = actionRoot.getByRole('button', { name: `把当前选区添加到 ${targetScopeTitle}`, exact: true })
    assert.equal(await actionButton.count(), 1, `${phase}: action must belong to the selected canonical Context card.`)
    const members = actionRoot.locator('[data-saved-context-members][data-presentation-readback]')
    await members.waitFor({ state: 'visible', timeout: 15000 })
    await waitForCondition(`${phase} membership readback settle`, async () => {
      const status = await members.getAttribute('data-presentation-readback')
      return status !== null && status !== 'loading'
    })
    return { actionRoot, actionButton, members, cardButton: button,
      initialReadback: { status: await members.getAttribute('data-presentation-readback'),
        presentationId: await members.getAttribute('data-presentation-id'), text: clean(await members.innerText()) } }
  }

  async function readVisibleMembership(actionRoot, expectedViews, phase) {
    const memberList = actionRoot.locator('[data-saved-context-members][data-presentation-readback]')
    await memberList.waitFor({ state: 'visible', timeout: 15000 })
    await waitForCondition(`${phase} exact Presentation membership readback`, async () =>
      await memberList.getAttribute('data-presentation-readback') === 'confirmed', 30000)
    assert.equal(await memberList.getAttribute('data-presentation-id'), contextPresentationId,
      `${phase}: membership readback named a different Presentation.`)
    assert.equal(await memberList.locator('[data-saved-context-member]').count(), expectedViews.length,
      `${phase}: membership readback has an unexpected number of ArtifactViews.`)
    const rows = []
    for (const viewId of expectedViews) {
      const row = memberList.locator(`[data-saved-context-member="${attrSelectorValue(viewId)}"]`)
      assert.equal(await row.count(), 1, `${phase}: membership readback omitted/duplicated ${viewId}.`)
      rows.push({ viewId, text: clean(await row.innerText()) })
    }
    return { presentationReadback: 'confirmed', presentationId: contextPresentationId, memberRows: rows }
  }

  async function readVisibleReceipt(actionRoot, expectedViews, expectedAttempt) {
    const receipt = actionRoot.locator('[data-saved-context-action-receipt]')
    await receipt.waitFor({ state: 'visible', timeout: 30000 })
    const presentationReadback = await receipt.getAttribute('data-presentation-readback')
    assert.equal(presentationReadback, 'confirmed', `Explicit click ${expectedAttempt} did not read back the exact Core Presentation membership.`)
    assert.equal(await receipt.getAttribute('data-presentation-id'), contextPresentationId)
    assert.equal(await receipt.getAttribute('data-context-all-applied'), 'true',
      `Explicit click ${expectedAttempt} UI receipt's aggregate all-applied bit is unexpected.`)
    assert.equal(await receipt.locator('[data-saved-context-receipt-item]').count(), expectedViews.length,
      `Explicit click ${expectedAttempt} rendered an unexpected number of item receipts.`)
    const visibleRows = []
    for (const viewId of expectedViews) {
      const row = receipt.locator(`[data-saved-context-receipt-item="${attrSelectorValue(viewId)}"]`)
      assert.equal(await row.count(), 1, `Explicit click ${expectedAttempt} must render exactly one item receipt for ${viewId}.`)
      visibleRows.push({ viewId, sourceKind: await row.getAttribute('data-source-kind'),
        status: await row.getAttribute('data-status'), channel: await row.getAttribute('data-channel'),
        text: clean(await row.innerText()) })
    }
    const membership = await readVisibleMembership(actionRoot, expectedViews, `Explicit click ${expectedAttempt}`)
    return { text: clean(await receipt.innerText()), presentationReadback, presentationId: contextPresentationId,
      visibleRows, memberRows: membership.memberRows }
  }

  async function closeAtlas(atlas) {
    const close = atlas.locator('button.lcos-atlas-close[aria-label="收回集合总览"]')
    assert.equal(await close.count(), 1, 'Use the unique original Atlas header close; the mature view also has a same-label backdrop close.')
    await close.click()
    await atlas.waitFor({ state: 'hidden', timeout: 15000 })
  }

  async function recordAtlasVisualProof(actionRoot, phase) {
    const proof = await actionRoot.evaluate(root => {
      const style = getComputedStyle(root)
      const summary = root.closest('.lcos-atlas-focus-summary')
      const atlas = root.closest('[data-lcos-context-atlas]')
      const folderVisuals = [...(atlas?.querySelectorAll('.lcos-atlas-folder svg') ?? [])]
        .map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0)
      const rowRects = [...root.querySelectorAll('[data-saved-context-member]')].map(row => {
        const rect = row.getBoundingClientRect(), computed = getComputedStyle(row)
        return { id: row.getAttribute('data-saved-context-member'), top: rect.top, bottom: rect.bottom,
          height: rect.height, fontSize: computed.fontSize, lineHeight: computed.lineHeight }
      })
      return { phase: null, tokens: Object.fromEntries(['--gen2-text', '--gen2-muted', '--gen2-surface', '--lcos-text-primary']
        .map(name => [name, style.getPropertyValue(name).trim()])), lineHeight: style.lineHeight,
        summaryBackground: summary ? getComputedStyle(summary).backgroundColor : null,
        summaryBottom: summary?.getBoundingClientRect().bottom ?? null,
        minimumFolderVisualTop: folderVisuals.length ? Math.min(...folderVisuals.map(rect => rect.top)) : null,
        buttons: [...root.querySelectorAll('button')].map(button => ({
          label: button.getAttribute('aria-label'), skin: button.getAttribute('data-lcos-control-skin'),
          height: button.getBoundingClientRect().height })), memberRows: rowRects }
    })
    proof.phase = phase
    assert.ok(Object.values(proof.tokens).every(Boolean), 'Atlas leaf must receive the existing LCOS semantic tokens.')
    assert.equal(proof.buttons.length, 2)
    assert.ok(proof.buttons.every(button => button.skin === 'oreo' && button.height >= 44),
      'Use the original Oreo button face and accessible hit area, not unstyled labels.')
    assert.ok(proof.memberRows.every(row => row.height >= 14), 'Saved member rows must retain readable line boxes.')
    assert.ok(proof.minimumFolderVisualTop !== null && proof.summaryBottom !== null
      && proof.minimumFolderVisualTop >= proof.summaryBottom,
    'The adopted opening folder papers must not cover Saved Context members or receipts.')
    for (let index = 1; index < proof.memberRows.length; index++) {
      assert.ok(proof.memberRows[index].top >= proof.memberRows[index - 1].bottom,
        'Saved member text rows must not overlap.')
    }
    report.ui.visualProof ??= []
    report.ui.visualProof.push(proof)
  }

  function validateAssemblyPayload(request, attempt, selectedViews) {
    let body
    try { body = request.postDataJSON() } catch { return { ok: false, reason: 'Assembly request is not valid JSON.' } }
    if (!isRecord(body) || Object.keys(body).sort().join(',') !== ['projectId', 'schemaVersion', 'sourceRefs', 'targetRef'].sort().join(',')) {
      return { ok: false, reason: 'Assembly payload must contain only the canonical request fields; placement/foreign metadata is not allowed.' }
    }
    if (body.schemaVersion !== 1 || body.projectId !== projectId) return { ok: false, reason: 'Assembly payload schema/project mismatch.' }
    if (!isRecord(body.targetRef) || Object.keys(body.targetRef).sort().join(',') !== 'id,kind'
      || body.targetRef.kind !== 'context' || body.targetRef.id !== targetScopeId) {
      return { ok: false, reason: 'Assembly target is not the exact canonical Saved Context scope.' }
    }
    if (!Array.isArray(body.sourceRefs) || body.sourceRefs.length !== selectedViews.length) {
      return { ok: false, reason: 'Assembly source count differs from the two exact selected nodes.' }
    }
    const requested = body.sourceRefs.map(ref => ref?.id).sort()
    if (new Set(requested).size !== selectedViews.length || stable(requested) !== stable([...selectedViews].sort())) {
      return { ok: false, reason: 'Assembly source ArtifactView IDs differ from the actual selected Workflow nodes.' }
    }
    if (!body.sourceRefs.every(ref => isRecord(ref) && Object.keys(ref).sort().join(',') === 'id,kind'
      && ref.kind === 'artifactView' && selectedViews.includes(ref.id))) {
      return { ok: false, reason: 'Assembly source references must be the exact ArtifactView IDs only.' }
    }
    if (report.network.allowedAssemblyPosts.length !== attempt - 1 || activeClick !== attempt || admittedAttempts.has(attempt)) {
      return { ok: false, reason: 'Assembly write was not caused by the next one explicit UI click.' }
    }
    return { ok: true, body }
  }

  async function waitAssemblyCapture(attempt) {
    await waitForCondition(`exact Core Assembly response ${attempt}`, () => applyCaptures.length >= attempt, 30000)
    const capture = applyCaptures[attempt - 1]
    assert.ok(capture)
    return capture
  }

  function validateAssemblyReceipt(capture, attempt, viewIds) {
    assert.equal(capture.attempt, attempt)
    assert.equal(capture.path, expectedApplyPath)
    assert.equal(capture.status, 200, `Assembly apply ${attempt} must return HTTP 200.`)
    assert.equal(capture.payload?.ok, true, `Assembly apply ${attempt} must preserve the Core {ok:true,value} envelope.`)
    const result = capture.payload.value
    assert.equal(result.schemaVersion, 1)
    assert.equal(result.projectId, projectId)
    assert.equal(result.results.length, viewIds.length)
    assert.deepEqual(result.results.map(row => row?.sourceRef?.id).sort(), [...viewIds].sort())
    assert.ok(result.results.every(row => row.sourceRef?.kind === 'artifactView'))
    if (attempt === 1) {
      assert.equal(result.allApplied, true, 'Baseline Presentation was empty, so the first explicit add must apply both members.')
      assert.ok(result.results.every(row => row.status === 'applied' && row.channel === 'presentation-membership'),
        'First explicit Assembly receipt must apply exact Presentation membership for both views.')
      assert.ok(result.results.every(row => row.presentationId === contextPresentationId),
        'First receipt must name the one existing context Presentation identity.')
      assert.deepEqual(result.results.map(row => row.memberViewId).sort(), [...viewIds].sort())
      assert.ok(result.results.every(row => nonEmpty(row.changeSetId)), 'First apply receipt must carry the real semantic ChangeSet IDs.')
    } else {
      assert.equal(result.allApplied, true, 'Skipped/already-member results are successful for every requested member.')
      assert.ok(result.results.every(row => row.status === 'skipped' && row.channel === 'already-member'),
        'Second explicit click must be Core idempotency skipped/already-member for every view.')
      assert.ok(result.results.every(row => row.presentationId === contextPresentationId))
      assert.ok(result.results.every(row => row.changeSetId === undefined), 'Second click must not create a second membership ChangeSet.')
    }
    return result
  }

  try {
    // All baseline reads happen before Chrome is opened; this phase is GET-only.
    const health = await getJson('/health', '17881 health')
    assert.equal(health.response.status, 200)
    report.baseline.health = { status: health.response.status, profile: health.payload?.profile ?? null,
      pid: health.payload?.pid ?? null }
    const status = await tapNowData('/api/surface-core/status', 'Surface Core status')
    assert.equal(status.projectId, projectId, 'The deployed facade project ID differs from the scoped disposable fixture.')
    const contextStatus = status.surfaces?.filter(surface => surface?.preferredSurface === 'context' && surface?.scopeId === targetScopeId)
    const workflowStatus = status.surfaces?.filter(surface => surface?.preferredSurface === 'workflow' && surface?.canvasId === workflow.canvasId)
    assert.equal(contextStatus?.length, 1, 'Status must map the exact canonical Context scope once.')
    assert.equal(workflowStatus?.length, 1, 'Status must map the exact source Workflow Canvas once.')
    report.baseline.surfaceStatus = { projectId: status.projectId,
      surfaces: status.surfaces?.map(({ preferredSurface, canvasId, scopeId, workspaceId }) => ({ preferredSurface, canvasId, scopeId, workspaceId })) ?? [] }

    const before = await captureThreeScenes('before')
    canvasesBefore = before.canvases
    projectGraphBefore = before.graph
    coreSceneBefore = before.materials
    presentationsBefore = before.presentations
    report.baseline.canvases = Object.fromEntries(surfaces.map(surface => [surface.key, {
      canvasId: surface.canvasId, nodeCount: before.canvases[surface.key].nodes.length,
      connectionCount: before.canvases[surface.key].connections.length,
      nodes: before.canvases[surface.key].nodes.map(node => ({ id: node.id, type: node.type,
        position: node.position ?? null, positionAbsolute: node.positionAbsolute ?? null,
        width: node.width ?? null, height: node.height ?? null })),
      connections: before.canvases[surface.key].connections.map(connection => ({ id: connection.id, source: connection.source, target: connection.target,
        sourceHandle: connection.source_handle ?? null, targetHandle: connection.target_handle ?? null })),
    }]))
    report.baseline.coreGraph = { counts: graphCounts(projectGraphBefore),
      scopeIds: projectGraphBefore.scopes.map(row => row.id).sort(),
      workspaceIds: projectGraphBefore.workspaces.map(row => row.id).sort(),
      artifactIds: projectGraphBefore.artifacts.map(row => row.id).sort(),
      artifactViewIds: projectGraphBefore.artifactViews.map(row => row.id).sort(),
      revisionIds: projectGraphBefore.artifactRevisions.map(row => row.id).sort(),
      fileRecordIds: projectGraphBefore.fileRecords.map(row => row.id).sort() }
    const { fileBytesByView: _baselineFileBytes, ...baselineMaterials } = coreSceneBefore
    report.baseline.materials = baselineMaterials
    report.baseline.presentations = { count: presentationsBefore.length,
      rows: presentationsBefore.map(row => ({ id: row.id, scopeId: row.scopeId, capability: row.capability,
        version: row.version, memberViewIds: row.state?.memberViewIds ?? [], memberEntityRefs: row.state?.memberEntityRefs ?? [] })) }

    const contextScopes = projectGraphBefore.scopes.filter(scope => String(scope.id) === targetScopeId
      && String(scope.projectId) === projectId && scope.kind === 'context' && scope.name === targetScopeTitle)
    assert.equal(contextScopes.length, 1, 'Core graph must contain exactly one synthetic Saved Context scope.')
    assert.equal(contextScopes[0].kind, 'context')
    const contextWorkspace = projectGraphBefore.workspaces.filter(workspace => String(workspace.scopeId) === targetScopeId
      && workspace.preferredSurface === 'context' && String(workspace.projectId) === projectId)
    assert.equal(contextWorkspace.length, 1, 'The exact Context workspace must point at this scope.')
    if (!readOnlyExistingMembers) {
      assert.deepEqual(presentationsBefore, [], 'Expected Root-provided empty Presentation baseline; refusing to add or repair a preexisting membership.')
    } else {
      assert.equal(contextPresentationRows(presentationsBefore).length, 1,
        'Read-only recovery requires the canonical Saved Context; other existing Presentations remain preserved and compared.')
    }

    const contextWarehouse = await coreValue(projectPath('/warehouse?limit=50&kinds=context'), 'Core Context Warehouse page')
    assert.equal(contextWarehouse.projectId, projectId)
    assert.ok(Array.isArray(contextWarehouse.items))
    const warehouseTargets = contextWarehouse.items.filter(item => item?.kind === 'context'
      && item?.entityRef?.type === 'context' && item.entityRef.id === targetScopeId && item.title === targetScopeTitle)
    assert.equal(warehouseTargets.length, 1, 'The exact Saved Context must appear once in the canonical Context Warehouse page.')
    if (!readOnlyExistingMembers) assert.deepEqual(contextPresentationRows(presentationsBefore), [], 'No target Presentation exists at test start.')
    assert.deepEqual(contextWorkspace.map(row => String(row.canvasId)), [contextStatus[0].canvasId])

    const workflowCanvas = canvasesBefore.workflow
    const textNode = workflowCanvas.nodes.filter(node => String(node.id) === workflow.textNodeId)
    const imageNode = workflowCanvas.nodes.filter(node => String(node.id) === workflow.imageNodeId)
    assert.equal(textNode.length, 1, 'Original Workflow text node must exist exactly once.')
    assert.equal(imageNode.length, 1, 'Original Workflow image node must exist exactly once.')
    assert.equal(textNode[0].type, 'text')
    assert.equal(imageNode[0].type, 'image')
    sourceRefs = [textNode[0].data?.lcos_ref?.artifactViewId, imageNode[0].data?.lcos_ref?.artifactViewId]
    assert.ok(sourceRefs.every(nonEmpty) && new Set(sourceRefs).size === 2, 'The two original Workflow nodes must have distinct exact ArtifactView IDs.')
    for (const node of [textNode[0], imageNode[0]]) assert.ok(exactReference(node.data?.lcos_ref), `Source node ${node.id} lacks an exact persisted lcos_ref.`)
    report.target.sourceRefs = [textNode[0], imageNode[0]].map(node => ({ nodeId: node.id, nodeType: node.type,
      artifactId: node.data.lcos_ref.artifactId, artifactViewId: node.data.lcos_ref.artifactViewId,
      revisionId: node.data.lcos_ref.revisionId }))

    const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' })
    await context.route('**/*', async route => {
      const request = route.request()
      let url
      try { url = new URL(request.url()) } catch {
        report.network.externalHttpBlocked.push({ method: request.method(), address: '[unparseable]', reason: 'invalid/unknown request URL blocked' })
        await route.abort('blockedbyclient'); return
      }
      const method = request.method().toUpperCase()
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        if (url.origin !== origin) {
          report.network.externalHttpBlocked.push({ method, address: safeAddress(url.href), reason: 'off-origin HTTP blocked' })
          await route.abort('blockedbyclient'); return
        }
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
          const read = { method, path: url.pathname, status: 'requested' }
          report.network.browserReads.push(read)
          browserReadSequence.push({ request, read })
          await route.continue(); return
        }
        if (!readOnlyExistingMembers && method === 'POST' && url.pathname === expectedApplyPath) {
          const attempt = activeClick
          const checked = validateAssemblyPayload(request, attempt, sourceRefs)
          if (!checked.ok) {
            report.network.blockedWrites.push({ method, path: url.pathname, attempt: attempt ?? null, reason: checked.reason })
            report.network.scopeViolations.push({ method, path: url.pathname, attempt: attempt ?? null, reason: checked.reason })
            await route.abort('blockedbyclient'); return
          }
          admittedAttempts.add(attempt)
          const response = await route.fetch()
          let payload
          try { payload = await response.json() } catch { payload = { parseFailure: true } }
          const capture = { attempt, method, path: url.pathname, status: response.status(), payload,
            target: checked.body.targetRef, sourceRefs: checked.body.sourceRefs }
          applyCaptures.push(capture)
          report.network.allowedAssemblyPosts.push({ attempt, method, path: url.pathname, status: response.status(),
            projectId: payload?.value?.projectId ?? null,
            target: payload?.value ? checked.body.targetRef : null,
            sourceRefs: checked.body.sourceRefs.map(ref => ({ ...ref })),
            results: payload?.value?.results?.map(row => ({ sourceRef: row?.sourceRef, status: row?.status,
              channel: row?.channel, presentationId: row?.presentationId, memberViewId: row?.memberViewId,
              changeSetId: row?.changeSetId ?? null })) ?? [], allApplied: payload?.value?.allApplied ?? null })
          await route.fulfill({ response }); return
        }
        report.network.blockedWrites.push({ method, path: url.pathname,
          reason: 'Only two explicit exact-target Core Assembly POSTs are admitted; all other writes are blocked.' })
        await route.abort('blockedbyclient'); return
      }
      if (url.protocol === 'data:' || url.protocol === 'blob:') { await route.continue(); return }
      report.network.externalHttpBlocked.push({ method, address: safeAddress(url.href), protocol: url.protocol,
        reason: 'unknown protocol blocked' })
      await route.abort('blockedbyclient')
    })
    if (typeof context.routeWebSocket === 'function') {
      await context.routeWebSocket('**/*', async socketRoute => {
        let url
        try { url = new URL(socketRoute.url()) } catch { report.network.remoteWebSocketsBlocked.push('[unparseable]'); await socketRoute.close(); return }
        const equivalentOrigin = url.origin.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
        if (equivalentOrigin === origin) { await socketRoute.connect(); return }
        report.network.remoteWebSocketsBlocked.push(safeAddress(url.href))
        await socketRoute.close({ code: 1008, reason: 'off-origin WebSocket blocked for local Saved Context test' })
      })
    } else report.network.webSocketInterception = 'routeWebSocket unavailable in installed Playwright runtime'

    page = await context.newPage()
    page.on('pageerror', error => report.pageErrors.push(clean(error?.stack ?? error?.message ?? error)))
    page.on('console', message => {
      if (message.type() === 'error') report.consoleErrors.push(clean(message.text()))
      else if (message.type() === 'warning' || message.type() === 'warn') report.consoleWarnings.push(clean(message.text()))
    })
    page.on('requestfailed', request => report.network.requestFailures.push({ method: request.method(), address: safeAddress(request.url()),
      failure: clean(request.failure()?.errorText ?? 'request failed') }))
    page.on('response', response => {
      let url
      try { url = new URL(response.url()) } catch { return }
      if (url.origin !== origin) return
      const match = browserReadSequence.findLast(entry => entry.request === response.request())
      if (match) match.read.status = response.status()
      if (url.pathname.startsWith('/api/') && response.status() >= 400) report.network.apiFailures.push({ source: 'browser',
        method: response.request().method(), path: url.pathname, status: response.status(),
        classification: 'retained background/UI HTTP error; not silently dropped from evidence' })
    })

    await page.goto(new URL(`/canvas/${workflow.canvasId}`, origin).href, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(id => Boolean(window.__LCOS_NODE_LAB__?.api)
      && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === id
      && document.querySelector('.react-flow'), workflow.canvasId, { timeout: 30000 })
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 30000 })
    assert.equal(await page.locator('.react-flow').count(), 1, 'Expected exactly one original Workflow ReactFlow root.')
    await assertNoFrameworkErrorOverlay('initial Workflow page')

    const panelInitiallyClosed = await closeAgentPanelIfVisible()
    report.ui.originalAgentPanelClosedBeforeSelection = true
    report.ui.initialPanelWasClosed = panelInitiallyClosed
    if (readOnlyExistingMembers) {
      const viewIds = [...sourceRefs].sort()
      const initialPresentation = assertPresentationMembers(presentationsBefore, viewIds, 'Read-only recovery baseline')
      const atlas = await openOriginalSavedContextAtlas()
      const focused = await focusSavedContextCard(atlas, 'Read-only recovery first opening')
      report.ui.beforeFirstClick = await readVisibleMembership(focused.actionRoot, viewIds, 'Read-only recovery first opening')
      await closeAtlas(atlas)
      const reopenedAtlas = await openOriginalSavedContextAtlas()
      const reopened = await focusSavedContextCard(reopenedAtlas, 'Read-only close/reopen')
      report.ui.afterReopen = { atlasReopenedThroughOriginalAgentButton: true,
        ...await readVisibleMembership(reopened.actionRoot, viewIds, 'Read-only close/reopen') }
      const reopenedState = await captureThreeScenes('afterReopen')
      assertScenesUnchanged(before, reopenedState, 'afterReopen')
      assert.equal(stable(reopenedState.presentations), stable(presentationsBefore), 'Read-only reopen changed Presentation truth.')
      await screenshot('read-only-close-reopen', reopened.actionRoot)
      await closeAtlas(reopenedAtlas)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(id => Boolean(window.__LCOS_NODE_LAB__?.api)
        && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === id
        && document.querySelector('.react-flow'), workflow.canvasId, { timeout: 30000 })
      await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 30000 })
      await closeAgentPanelIfVisible()
      await assertNoFrameworkErrorOverlay('Read-only recovery after reload')
      const reloadAtlas = await openOriginalSavedContextAtlas()
      const reloaded = await focusSavedContextCard(reloadAtlas, 'Read-only real reload')
      report.ui.afterReload = { realPageReload: true, originalAgentEntryReopened: true,
        ...await readVisibleMembership(reloaded.actionRoot, viewIds, 'Read-only real reload') }
      const afterReload = await captureThreeScenes('afterReload')
      assertScenesUnchanged(before, afterReload, 'afterReload')
      assert.equal(stable(afterReload.presentations), stable(presentationsBefore), 'Read-only real reload changed Presentation truth.')
      const finalPresentation = assertPresentationMembers(afterReload.presentations, viewIds, 'Read-only final read')
      assert.equal(finalPresentation.version, initialPresentation.version)
      assert.equal(report.network.allowedAssemblyPosts.length, 0)
      assert.equal(admittedAttempts.size, 0)
      assert.equal(report.pageErrors.length, 0, 'Read-only Saved Context reopen/reload raised a page exception.')
      await recordAtlasVisualProof(reloaded.actionRoot, 'Read-only real reload')
      await screenshot('read-only-reload-confirmed', reloaded.actionRoot)
      const enterContext = reloadAtlas.getByRole('button', { name: `进入 ${targetScopeTitle} 现场`, exact: true })
      assert.equal(await enterContext.count(), 1, 'Use the original card action for the one canonical Core Context Workspace.')
      await enterContext.click()
      const contextCanvasId = String(contextWorkspace[0].canvasId)
      await page.waitForFunction(id => location.pathname === `/canvas/${id}`
        && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === id
        && Boolean(window.__LCOS_NODE_LAB__?.api), contextCanvasId, { timeout: 30000 })
      await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 30000 })
      await assertNoFrameworkErrorOverlay('Original Atlas card enters canonical Context Workspace')
      assert.equal(await page.locator('.react-flow').count(), 1)
      assert.equal(await page.locator('[data-lcos-native-saved-context-host]').count(), 0, 'The source Atlas must close after original Router navigation.')
      const enteredContext = await captureThreeScenes('afterContextEntry')
      assertScenesUnchanged(before, enteredContext, 'afterContextEntry')
      assert.equal(stable(enteredContext.presentations), stable(presentationsBefore))
      report.ui.afterContextEntry = { originalCardActionUsed: true, originalRouterUsed: true,
        fromCanvasId: workflow.canvasId, toCanvasId: contextCanvasId, workspaceId: String(contextWorkspace[0].id),
        scopeId: targetScopeId, exactlyOneReactFlow: true, atlasClosed: true, noBusinessWrite: true }
      await screenshot('read-only-card-enters-context', page.locator('.react-flow'))
      report.final = { readOnlyExistingMembers: true, allowedAssemblyPosts: 0, admittedBusinessWrites: 0,
        exactMemberViewIds: viewIds, presentationId: contextPresentationId, presentationVersion: finalPresentation.version,
        threeCanvasesUnchanged: true, coreGraphAndMaterialsUnchanged: true,
        canonicalContextEntry: report.ui.afterContextEntry,
        exactlyOneReactFlow: await page.locator('.react-flow').count() === 1, pageErrors: report.pageErrors }
      report.cases.push({ name: 'Existing exact membership → original Atlas close/reopen → real reload; all writes blocked',
        passed: true, detail: report.final })
      report.passed = true
      report.runState = 'passed read-only existing membership close/reopen and real reload; no repeated apply'
      return
    }
    const canvasSelection = await page.evaluate(ids => ({
      canvasId: window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId ?? null,
      nodeIds: window.__LCOS_NODE_LAB__?.api?.getNode ? ids.map(id => window.__LCOS_NODE_LAB__.api.getNode(id)
        ? { id, type: window.__LCOS_NODE_LAB__.api.getNode(id).type,
          ref: window.__LCOS_NODE_LAB__.api.getNode(id).data?.lcos_ref ?? null } : null) : [],
      selection: window.__LCOS_NODE_LAB__?.api?.getSelection?.()?.nodeIds ?? [],
    }), targetNodeIds)
    assert.equal(canvasSelection.canvasId, workflow.canvasId)
    assert.equal(canvasSelection.nodeIds.filter(Boolean).length, 2)
    assert.deepEqual(canvasSelection.nodeIds.map(row => row?.id).sort(), [...targetNodeIds].sort())
    for (const source of report.target.sourceRefs) {
      const live = canvasSelection.nodeIds.find(row => row?.id === source.nodeId)
      assert.deepEqual(live?.ref, (source.nodeId === workflow.textNodeId ? textNode[0] : imageNode[0]).data.lcos_ref)
    }
    await page.locator('.react-flow__pane').click({ position: { x: 12, y: 12 } })
    const textLocator = page.locator(`.react-flow__node[data-id="${workflow.textNodeId}"]`)
    const imageLocator = page.locator(`.react-flow__node[data-id="${workflow.imageNodeId}"]`)
    await textLocator.waitFor({ state: 'visible', timeout: 15000 })
    await imageLocator.waitFor({ state: 'visible', timeout: 15000 })
    const imageSelectionPoint = await exposedNodeSelectionPoint(imageLocator, workflow.imageNodeId)
    const textSelectionPoint = await exposedNodeSelectionPoint(textLocator, workflow.textNodeId)
    report.selectionProbes = { image: imageSelectionPoint, text: textSelectionPoint }
    assert.ok(imageSelectionPoint.point && textSelectionPoint.point,
      'Both nodes need a real exposed non-control selection point; text presentation tabs are not selection handles.')
    await imageLocator.click({ position: imageSelectionPoint.point.local })
    await textLocator.click({ modifiers: ['Shift'], position: textSelectionPoint.point.local })
    await page.waitForFunction(ids => {
      const selected = window.__LCOS_NODE_LAB__?.api?.getSelection?.().nodeIds ?? []
      return selected.length === ids.length && ids.every(id => selected.includes(id))
    }, targetNodeIds, { timeout: 10000 })
    const selectedIds = await page.evaluate(() => window.__LCOS_NODE_LAB__?.api?.getSelection?.().nodeIds ?? [])
    assert.deepEqual([...selectedIds].sort(), [...targetNodeIds].sort(),
      'Real mouse + Shift selection must contain exactly original surface-workflow-text and surface-workflow-image.')
    report.selection = { method: 'original ReactFlow pointer click on image then Shift+pointer click on exposed text body, avoiding presentation tabs',
      canvasId: workflow.canvasId, nodeIds: selectedIds, nodeTypes: [textNode[0].type, imageNode[0].type],
      artifactViewIds: [...sourceRefs].sort(), selectedExactlyTwoOriginalNodes: true }
    await screenshot('workflow-selection', page.locator('.react-flow'))

    const atlas = await openOriginalSavedContextAtlas()
    const focused = await focusSavedContextCard(atlas, 'first opening')
    report.ui.beforeFirstClick = { initialPresentationReadback: focused.initialReadback,
      targetCardButton: await focused.cardButton.getAttribute('aria-label'), actionButton: await focused.actionButton.getAttribute('aria-label'),
      selectedNodeIds: [...selectedIds].sort() }
    assert.notEqual(focused.initialReadback.status, 'confirmed', 'Empty baseline must not already claim target members before the first explicit click.')
    assert.equal(applyCaptures.length, 0, 'No Assembly POST may occur before the first explicit action click.')
    assert.equal(await page.locator('.react-flow').count(), 1, 'Saved Context Atlas must not mount another Canvas.')
    assert.equal(await focused.actionButton.isEnabled(), true, 'Original Saved Context action must accept the real two-node selection.')

    const viewIds = [...sourceRefs].sort()
    const clickOnce = async attempt => {
      const beforeCount = applyCaptures.length
      assert.equal(beforeCount, attempt - 1)
      activeClick = attempt
      await focused.actionButton.click()
      const capture = await waitAssemblyCapture(attempt)
      activeClick = null
      assert.equal(applyCaptures.length, attempt, `Click ${attempt} caused more than one Core Assembly request.`)
      const coreResult = validateAssemblyReceipt(capture, attempt, viewIds)
      const uiReceipt = await readVisibleReceipt(focused.actionRoot, viewIds, attempt)
      assert.deepEqual(uiReceipt.visibleRows.map(row => ({ sourceKind: row.sourceKind, status: row.status, channel: row.channel })),
        coreResult.results.map(row => ({ sourceKind: row.sourceRef.kind, status: row.status, channel: row.channel })),
        `Click ${attempt} UI receipt must echo the exact Core item receipts.`)
      return { capture, coreResult, uiReceipt }
    }

    const first = await clickOnce(1)
    report.ui.firstClick = { explicitClick: true, ...first.uiReceipt }
    assert.equal(await focused.actionButton.isEnabled(), true, 'First receipt must settle and re-enable the same original action button.')
    const presentationAfterFirst = await readPresentations('After first explicit Saved Context click')
    const firstPresentation = assertPresentationMembers(presentationAfterFirst, viewIds, 'After first explicit click')
    report.ui.firstClick.presentationVersion = firstPresentation.version
    report.ui.firstClick.memberViewIds = [...firstPresentation.state.memberViewIds]
    const firstState = await captureThreeScenes('afterFirstClick')
    assertScenesUnchanged(before, firstState, 'afterFirstClick')
    assertPresentationMembers(firstState.presentations, viewIds, 'After first click fresh Core read')
    await screenshot('first-applied-receipt', focused.actionRoot)

    const second = await clickOnce(2)
    report.ui.secondClick = { explicitClick: true, ...second.uiReceipt }
    assert.ok(second.coreResult.results.every(row => row.status === 'skipped' && row.channel === 'already-member'))
    const secondState = await captureThreeScenes('afterSecondClick')
    assertScenesUnchanged(before, secondState, 'afterSecondClick')
    assertPresentationMembers(secondState.presentations, viewIds, 'After second already-member click')
    const presentationAfterSecond = assertPresentationMembers(await readPresentations('After second explicit Saved Context click'), viewIds, 'After second click direct read')
    assert.equal(presentationAfterSecond.version, firstPresentation.version,
      'Repeated already-member click must not advance the saved Presentation version.')
    await screenshot('second-already-member', focused.actionRoot)
    assert.equal(report.network.allowedAssemblyPosts.length, 2, 'Only the two explicitly clicked exact Assembly POSTs are allowed.')
    assert.equal(report.network.scopeViolations.length, 0, 'No mismatched Assembly write was attempted.')

    await closeAtlas(atlas)
    await closeAgentPanelIfVisible()
    assert.equal(await page.locator('.react-flow').count(), 1)
    const reopenAtlas = await openOriginalSavedContextAtlas()
    const reopened = await focusSavedContextCard(reopenAtlas, 'before reload reopen')
    const reopenReadback = await readVisibleMembership(reopened.actionRoot, viewIds, 'Close/reopen')
    assert.equal(reopenReadback.presentationReadback, 'confirmed')
    report.ui.afterReopen = { atlasReopenedThroughOriginalAgentButton: true,
      cardReselected: true, ...reopenReadback }
    const reopenedState = await captureThreeScenes('afterReopen')
    assertScenesUnchanged(before, reopenedState, 'afterReopen')
    assertPresentationMembers(reopenedState.presentations, viewIds, 'After close/reopen membership readback')
    await screenshot('close-reopen-readback', reopened.actionRoot)

    await closeAtlas(reopenAtlas)
    await closeAgentPanelIfVisible()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(id => Boolean(window.__LCOS_NODE_LAB__?.api)
      && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === id
      && document.querySelector('.react-flow'), workflow.canvasId, { timeout: 30000 })
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 30000 })
    await assertNoFrameworkErrorOverlay('after real reload')
    const panelAfterReload = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (await panelAfterReload.count() && await panelAfterReload.isVisible()) await closeAgentPanelIfVisible()
    assert.equal(await page.locator('.react-flow').count(), 1, 'Real reload must keep one original Workflow ReactFlow root.')
    const afterReload = await captureThreeScenes('afterReload')
    assertScenesUnchanged(before, afterReload, 'afterReload')
    assertPresentationMembers(afterReload.presentations, viewIds, 'After real page reload')
    const reloadAtlas = await openOriginalSavedContextAtlas()
    const reloadedFocus = await focusSavedContextCard(reloadAtlas, 'after reload')
    const reloadReadback = await readVisibleMembership(reloadedFocus.actionRoot, viewIds, 'Real reload')
    report.ui.afterReload = { realPageReload: true, originalAgentEntryReopened: true,
      targetCardReselected: true, ...reloadReadback }
    assert.equal(report.network.allowedAssemblyPosts.length, 2,
      'Reload/reopen/selection readback must remain read-only; no third Assembly click was allowed.')
    assert.equal(report.network.scopeViolations.length, 0)
    await screenshot('reload-read-only-confirmation', reloadedFocus.actionRoot)
    await recordAtlasVisualProof(reloadedFocus.actionRoot, 'After explicit writes and real reload')

    report.cases.push({ name: 'Original Workflow text+image selection → Saved Context applied once, idempotent twice, close/reopen and reload readback',
      passed: true, detail: { sourceRefs: report.target.sourceRefs, first: report.network.allowedAssemblyPosts[0],
        second: report.network.allowedAssemblyPosts[1], membership: reloadReadback,
        threeCanvasesUnchanged: true, coreGraphAndMaterialsUnchanged: true } })
    report.final = { allowedAssemblyPosts: report.network.allowedAssemblyPosts.length,
      onlyExpectedWritePathAllowed: report.network.allowedAssemblyPosts.every(item => item.path === expectedApplyPath),
      blockedOtherWrites: report.network.blockedWrites.length, offOriginRequestsBlocked: report.network.externalHttpBlocked.length,
      offOriginWebSocketsBlocked: report.network.remoteWebSocketsBlocked.length,
      pageErrors: report.pageErrors, consoleErrors: report.consoleErrors,
      pageErrorPolicy: 'All page/console errors are retained for Root review; target UI and exact Core receipts are independently asserted.',
      exactlyOneReactFlow: await page.locator('.react-flow').count() === 1,
      meaningfulOriginalUI: report.ui.meaningfulOriginalUI,
      noVisibleFrameworkErrorOverlay: report.ui.frameworkOverlayChecks.every(check => check.visibleOverlayCount === 0),
      noCanvasWriteAllowed: report.network.allowedAssemblyPosts.every(item => item.path === expectedApplyPath),
      noDirectCoreMutationAllowed: report.network.allowedAssemblyPosts.every(item => item.method === 'POST' && item.path === expectedApplyPath),
      presentationId: contextPresentationId, exactMemberViewIds: viewIds,
      secondClickAlreadyMember: second.coreResult.results.every(row => row.status === 'skipped' && row.channel === 'already-member') }
    report.passed = true
    report.runState = 'executed original Agent → Saved Context Atlas → two explicit Core Assembly clicks → reload readback'
  } catch (error) {
    report.failure = clean(error?.stack ?? error?.message ?? error)
    report.runState = 'executed; any Core membership commit and all diagnostics were preserved; no cleanup/retry was attempted'
    report.failureRecovery = {
      mode: 'read-only evidence only; no automatic retry, cleanup, or extra live request',
      assembly: { admittedRequestCount: admittedAttempts.size, capturedResponseCount: applyCaptures.length,
        recordedAllowedResponseCount: report.network.allowedAssemblyPosts.length,
        mayHaveCommitted: admittedAttempts.size > 0 },
      lastReadOnlyPresentationObservation: lastPresentationObservation ? {
        label: lastPresentationObservation.label, at: lastPresentationObservation.at,
        admittedAssemblyRequestsAtRead: lastPresentationObservation.admittedAssemblyRequestsAtRead,
        targetRows: contextPresentationRows(lastPresentationObservation.rows).map(row => ({ id: row.id,
          projectId: row.projectId, scopeId: row.scopeId, capability: row.capability, version: row.version,
          memberViewIds: row.state?.memberViewIds ?? [], memberEntityRefs: row.state?.memberEntityRefs ?? [] })),
      } : null,
      readOnlyReopenNeededIfCommitIsAmbiguous: admittedAttempts.size > 0
        && (lastPresentationObservation?.admittedAssemblyRequestsAtRead ?? 0) < admittedAttempts.size,
    }
    if (page) {
      try {
        report.failurePage = await page.evaluate(() => ({ title: document.title, pathname: location.pathname,
          canvasId: window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId ?? null,
          reactFlowRoots: document.querySelectorAll('.react-flow').length,
          nodeIds: [...document.querySelectorAll('.react-flow__node[data-id]')].map(node => node.getAttribute('data-id')),
          atlasRegions: [...document.querySelectorAll('[data-lcos-context-atlas]')].map(region => ({
            visible: region.getAttribute('aria-hidden') !== 'true', ariaLabel: region.getAttribute('aria-label') })),
          selection: window.__LCOS_NODE_LAB__?.api?.getSelection?.()?.nodeIds ?? [],
          savedContextActionRoots: [...document.querySelectorAll('[data-lcos-native-saved-context-action]')].map(node => ({
            contextId: node.getAttribute('data-lcos-native-saved-context-action'), text: (node.textContent ?? '').slice(0, 500) })) }))
      } catch { report.failurePage = null }
      try { await screenshot(`failure-${Date.now()}`) } catch { /* Preserve the primary failure. */ }
    }
  } finally {
    activeClick = null
    try { await context?.close() } catch { /* preserve evidence */ }
    try { await browser?.close() } catch { /* preserve evidence */ }
    await mkdir(evidenceDir, { recursive: true })
    await writeFile(evidencePath, JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify({ runState: report.runState, passed: report.passed, mode: report.mode,
      allowedAssemblyPosts: report.network.allowedAssemblyPosts.length,
      afterReopen: report.ui.afterReopen !== null, afterReload: report.ui.afterReload !== null,
      canonicalContextEntry: report.ui.afterContextEntry ?? null,
      pageErrorCount: report.pageErrors.length, failure: report.failure, evidence: evidencePath }, null, 2))
    if (!report.passed) process.exitCode = 1
  }

}
