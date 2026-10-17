import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flags = new Set(argv)
const valueArg = name => argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)

if (flags.has('--help')) {
  console.log('Usage: node scripts/native-workflow-browser.mjs --deployed [--base-url=http://127.0.0.1:17881] [--workflow-scope-id=<canonical-workflow-scope>]')
} else if (!flags.has('--deployed')) {
  console.error(JSON.stringify({ runState: 'not-started', reason: '缺少 --deployed；未连接浏览器或本地服务。' }, null, 2))
  process.exitCode = 2
} else {
  await run()
}

async function run() {
  const base = parseLoopback(valueArg('--base-url') ?? 'http://127.0.0.1:17881')
  const origin = base.origin
  const projectArg = valueArg('--project-id')
  const scopeArg = valueArg('--workflow-scope-id')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
  const evidenceDir = path.join(root, '.runtime', 'native-workflow-browser')
  const evidencePath = path.join(evidenceDir, `${stamp}.json`)
  const report = {
    schema: 'native-workflow-browser-v1', at: new Date().toISOString(), runState: 'starting', passed: false,
    target: { origin, projectId: projectArg ?? null, workflowScopeId: scopeArg ?? null },
    flow: 'original TapNow Agent launcher → native Workflow hand/card preview → original Composer draft → close/reopen duplicate-prevention read → original Router Workflow entry → real page reload and Core-backed method read/retake',
    browser: { engine: 'installed Chrome via playwright-core', freshContext: true, headless: true,
      viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'blocked', loopbackOnly: true },
    sourceContracts: {
      agentLauncher: 'original [data-pile-gallery-chrome="bottom-right"] button whose rendered markup contains /agent-motion/; external connector/header plug is not used',
      agentPanel: '[role="dialog"][aria-label="本地 Agent 会话入口"]',
      workflowOpenAction: 'button[aria-label="打开工作流方法"]',
      hand: '[data-lcos-workflow-hand][role="region"][aria-label="工作流手牌"]',
      cardPool: '[data-lcos-workflow-pool]',
      card: '[data-lcos-workflow-task-card] containing the exact Core Warehouse workflow title',
      preview: '.lcos-workflow-card-preview[role="group"]',
      take: 'preview button whose accessible name contains 加入当前草稿',
      composer: '[data-lcos-composer]',
      composerText: '[data-lcos-composer-input]',
      composerReferences: '[data-lcos-composer-ref][data-reference-key]',
      receiverBlocked: '[data-lcos-composer-receiver-blocked] and disabled button[aria-label="提交"]',
      routeEntry: 'preview button with visible text 打开工作流现场 or 进入「…」',
      canonicalCanvasReady: '[data-lcos-professional-surface-state="ready"] plus original window.__LCOS_NODE_LAB__.api/currentCanvasId',
    },
    baseline: null, method: null, ui: { initial: null, firstTake: null, duplicatePrevention: null,
      routerEntry: null, afterReload: null },
    network: { browserWritesBlocked: [], offOriginHttpBlocked: [], unknownProtocolBlocked: [],
      webSocketsBlocked: [], requestFailures: [], apiFailures: [], browserReads: [], allowedBrowserMethods: ['GET', 'HEAD'] },
    pageErrors: [], consoleErrors: [], consoleWarnings: [], screenshots: [], cases: [], failure: null,
    evidencePath, screenshotRoot: visualRoot,
    limitations: [
      'No submit/Run/provider actions are clicked. Composer receiver remains unselected/blocked; the method is an unsent draft only.',
      'The original card removes its take action once alreadyInDraft is true. Duplicate prevention is checked through the real reopened preview and unchanged Composer; the script never calls store methods or dispatches synthetic clicks.',
      'A page reload does not imply that ephemeral Composer state is persistent. The post-reload branch observes whether the original app naturally restores the draft; if not, it takes the still-Core-backed method again through the visible original control.',
      'All browser non-GET/HEAD HTTP requests and all WebSockets are blocked; Core/Huabu snapshots use direct GET only. Any attempted write or HTTP/API/UI error remains in this report.',
    ],
  }

  let browser
  let context
  let page
  let before
  let selectedSurfaceMap
  let methodDraft
  let workflowCardMetadata
  let finalSnapshot
  const browserReadEntries = []
  const clean = value => String(value)
    .replace(/https?:\/\/[^\s"'<>]+/g, raw => safeAddress(raw))
    .replace(/((?:token|secret|credential|authorization|api.?key)\s*[:=]\s*)[^\s,;&]+/ig, '$1[redacted]')
    .slice(0, 1600)
  const safePath = url => `${url.pathname}${url.search ? '?[redacted-query]' : ''}`
  const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value)
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical)
    if (!isRecord(value)) return value
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  }
  const stable = value => JSON.stringify(canonical(value))
  const projectPath = suffix => `/projects/${encodeURIComponent(report.target.projectId)}${suffix}`
  const corePath = suffix => `/api/lcos/core${suffix}`

  async function getJson(pathname, label) {
    assert.ok(pathname.startsWith('/'), 'Direct reads must use an origin-relative path.')
    const response = await fetch(new URL(pathname, origin), { method: 'GET', headers: { Accept: 'application/json' },
      cache: 'no-store', redirect: 'error' })
    let payload = null
    try { payload = await response.json() } catch { /* retained as a failed JSON read */ }
    const row = { label, method: 'GET', path: pathname.replace(/\?.*$/, value => value ? '?[redacted-query]' : ''),
      status: response.status, code: payload?.code ?? null, ok: payload?.ok ?? null,
      errorCode: payload?.error?.code ?? null,
      error: payload?.error?.message ? clean(payload.error.message) : null }
    report.baseline?.directReads?.push(row)
    if (response.status >= 400) report.network.apiFailures.push({ source: 'direct GET', ...row })
    return { response, payload, row }
  }

  async function tapNowData(pathname, label) {
    const result = await getJson(pathname, label)
    assert.equal(result.response.status, 200, `${label} failed with HTTP ${result.response.status}.`)
    assert.equal(result.payload?.code, 0, `${label} did not preserve the TapNow {code:0,data} envelope.`)
    assert.ok(isRecord(result.payload.data), `${label} omitted data.`)
    return result.payload.data
  }

  async function coreValue(route, label) {
    const result = await getJson(corePath(route), label)
    assert.equal(result.response.status, 200, `${label} failed with HTTP ${result.response.status}.`)
    assert.equal(result.payload?.ok, true, `${label} did not preserve the Core {ok:true,value} envelope.`)
    assert.ok(Object.hasOwn(result.payload, 'value'), `${label} omitted value.`)
    return result.payload.value
  }

  async function coreBytes(fileRecordId, label) {
    const route = corePath(projectPath(`/file-records/${encodeURIComponent(fileRecordId)}/content`))
    const response = await fetch(new URL(route, origin), { method: 'GET', headers: { Accept: '*/*' },
      cache: 'no-store', redirect: 'error' })
    const bytes = Buffer.from(await response.arrayBuffer())
    const row = { label, method: 'GET', path: route, status: response.status,
      contentType: response.headers.get('content-type') ?? '', byteLength: bytes.length }
    report.baseline?.directReads?.push(row)
    if (response.status >= 400) report.network.apiFailures.push({ source: 'direct FileRecord bytes GET', ...row })
    assert.ok(response.ok, `${label} failed with HTTP ${response.status}.`)
    return { bytes, row }
  }

  async function readSurfaceMap(label) {
    const status = await tapNowData('/api/surface-core/status', `${label}: Surface Core status`)
    if (report.target.projectId === null) report.target.projectId = status.projectId
    assert.equal(status.projectId, report.target.projectId, 'Surface status resolved a different Core project.')
    assert.ok(Array.isArray(status.surfaces), 'Surface status omitted the existing surface mapping.')
    const rows = {}
    for (const key of ['main', 'context', 'workflow']) {
      const matches = status.surfaces.filter(surface => surface?.preferredSurface === key)
      assert.equal(matches.length, 1, `Core status must map exactly one existing ${key} surface.`)
      assert.ok(typeof matches[0].canvasId === 'string' && matches[0].canvasId.length > 0,
        `${key} surface omitted its existing Canvas ID.`)
      rows[key] = { preferredSurface: key, canvasId: matches[0].canvasId,
        workspaceId: matches[0].workspaceId ?? null, scopeId: matches[0].scopeId ?? null,
        name: matches[0].name ?? null }
    }
    if (scopeArg) assert.equal(rows.workflow.scopeId, scopeArg, 'Requested Workflow scope does not match the live Core surface map.')
    return { projectId: status.projectId, surfaces: rows }
  }

  async function readCanvas(surface, label) {
    const data = await tapNowData(`/api/canvas/v1/canvases/${encodeURIComponent(surface.canvasId)}`,
      `${label}: ${surface.preferredSurface} Canvas`)
    assert.equal(String(data.id), surface.canvasId)
    assert.ok(Array.isArray(data.nodes) && Array.isArray(data.connections),
      `${surface.preferredSurface} Canvas omitted original nodes/connections.`)
    return data
  }

  function referencedFileIds(graph, canvases, presentations) {
    const viewIds = new Set()
    for (const canvas of Object.values(canvases)) for (const node of canvas.nodes) {
      const ref = node?.data?.lcos_ref
      if (typeof ref?.artifactViewId === 'string') viewIds.add(ref.artifactViewId)
    }
    for (const presentation of presentations) {
      for (const viewId of presentation?.state?.memberViewIds ?? []) if (typeof viewId === 'string') viewIds.add(viewId)
      for (const action of presentation?.state?.workflowActions ?? [])
        for (const viewId of action?.attachedViewIds ?? []) if (typeof viewId === 'string') viewIds.add(viewId)
    }
    const fileIds = new Set()
    for (const viewId of viewIds) {
      const view = graph.artifactViews.find(row => String(row.id) === viewId)
      if (!view) continue
      const revision = graph.artifactRevisions.find(row => String(row.id) === String(view.revisionId))
      if (revision?.fileRecordId) fileIds.add(String(revision.fileRecordId))
    }
    return [...fileIds].sort()
  }

  async function readSnapshot(label) {
    const surfaceMap = await readSurfaceMap(label)
    const projectId = surfaceMap.projectId
    const graph = await coreValue(`/projects/${encodeURIComponent(projectId)}/graph`, `${label}: Core graph`)
    assert.equal(String(graph?.project?.id), projectId)
    for (const key of ['scopes', 'workspaces', 'artifacts', 'artifactViews', 'artifactRevisions', 'fileRecords'])
      assert.ok(Array.isArray(graph[key]), `${label}: Core graph omitted ${key}.`)
    const presentations = await coreValue(`/projects/${encodeURIComponent(projectId)}/presentations`, `${label}: Core presentations`)
    assert.ok(Array.isArray(presentations), `${label}: Core presentations value is not an array.`)
    const runs = await coreValue(`/projects/${encodeURIComponent(projectId)}/runs`, `${label}: Core runs`)
    const canvases = {}
    for (const key of ['main', 'context', 'workflow']) canvases[key] = await readCanvas(surfaceMap.surfaces[key], label)
    const fileIds = referencedFileIds(graph, canvases, presentations)
    const files = {}
    for (const fileId of fileIds) {
      const matches = graph.fileRecords.filter(row => String(row.id) === fileId)
      assert.equal(matches.length, 1, `${label}: graph must uniquely identify referenced FileRecord ${fileId}.`)
      const result = await coreBytes(fileId, `${label}: referenced FileRecord ${fileId}`)
      const expectedMime = String(matches[0].mimeType ?? '').toLowerCase()
      const actualMime = result.row.contentType.split(';', 1)[0].trim().toLowerCase()
      assert.ok(expectedMime.length > 0 && actualMime === expectedMime,
        `${label}: Core FileRecord ${fileId} returned MIME ${actualMime || '(empty)'}, graph says ${expectedMime || '(empty)'}.`)
      if (Number.isFinite(Number(matches[0].size))) {
        assert.equal(result.bytes.length, Number(matches[0].size),
          `${label}: FileRecord ${fileId} bytes do not match the canonical graph size.`)
      }
      files[fileId] = result
    }
    return { surfaceMap, graph, presentations, runs, canvases, files }
  }

  function summarySnapshot(snapshot) {
    const files = Object.fromEntries(Object.entries(snapshot.files).map(([id, value]) => [id,
      { byteLength: value.bytes.length, contentType: value.row.contentType }]))
    return { surfaceMap: snapshot.surfaceMap,
      graph: { scopeCount: snapshot.graph.scopes.length, workspaceCount: snapshot.graph.workspaces.length,
        artifactCount: snapshot.graph.artifacts.length, artifactViewCount: snapshot.graph.artifactViews.length,
        revisionCount: snapshot.graph.artifactRevisions.length, fileRecordCount: snapshot.graph.fileRecords.length },
      canvases: Object.fromEntries(Object.entries(snapshot.canvases).map(([key, canvas]) => [key,
        { id: canvas.id, name: canvas.name ?? null, nodes: canvas.nodes.length, connections: canvas.connections.length }])),
      presentationCount: snapshot.presentations.length,
      presentations: snapshot.presentations.map(row => ({ id: row.id, scopeId: row.scopeId,
        capability: row.capability, version: row.version,
        memberViewIds: row.state?.memberViewIds ?? [], workflowActionCount: row.state?.workflowActions?.length ?? 0,
        workflowOperatorCount: Object.keys(row.state?.workflowOperators ?? {}).length })),
      runCount: Array.isArray(snapshot.runs) ? snapshot.runs.length : null,
      referencedFileRecordBytes: files }
  }

  function buildMethodDraft(graph, presentations, projectId, scopeId) {
    assert.equal(String(graph.project.id), projectId)
    const scope = graph.scopes.find(row => String(row.id) === scopeId && row.kind === 'workflow')
    assert.ok(scope, `Core graph has no canonical Workflow scope ${scopeId}.`)
    const methods = presentations.filter(row => row.projectId === projectId && String(row.scopeId) === scopeId
      && row.capability === 'workflow'
      && ((row.state?.workflowActions?.length ?? 0) > 0 || Object.keys(row.state?.workflowOperators ?? {}).length > 0))
    assert.ok(methods.length > 0, `Core has no saved workflow method on current scope ${scopeId}.`)
    const text = [`工作流方法：${scope.name}`, `来源 Project：${projectId}`, `来源 Scope：${scopeId}`]
    const viewIds = new Set()
    for (const method of methods) {
      text.push(`来源 Presentation：${method.id} · version ${method.version}`)
      const actions = method.state.workflowActions ?? []
      const operators = method.state.workflowOperators ?? {}
      const actionNames = new Map(actions.map(action => [action.id, action.label]))
      for (const action of actions) {
        text.push(`动作：${action.label}${action.description?.trim() ? `\n${action.description}` : ''}`)
        for (const id of action.attachedViewIds ?? []) viewIds.add(id)
      }
      for (const edge of method.state.workflowActionEdges ?? [])
        text.push(`动作连接：${actionNames.get(edge.fromActionId) ?? edge.fromActionId} → ${actionNames.get(edge.toActionId) ?? edge.toActionId}${edge.label ? `（${edge.label}）` : ''}`)
      for (const [id, operator] of Object.entries(operators)) {
        text.push(`结构标记：${operator.label || id} · ${operator.kind}`)
        for (const branch of operator.branches ?? [])
          text.push(`分支：${branch.label}${branch.predicateText ? `；条件说明：${branch.predicateText}` : ''}${branch.targetViewId ? `；目标：${branch.targetViewId}` : ''}`)
      }
      for (const id of method.state.memberViewIds ?? []) if (!(id in operators)) viewIds.add(id)
    }
    const references = [...viewIds].map(viewId => {
      const view = graph.artifactViews.find(row => String(row.id) === String(viewId))
      const artifact = view ? graph.artifacts.find(row => String(row.id) === String(view.artifactId)) : undefined
      const revisionId = view?.revisionId ?? artifact?.currentRevisionId
      const revision = graph.artifactRevisions.find(row => String(row.id) === String(revisionId)
        && String(row.artifactId) === String(artifact?.id))
      const file = revision ? graph.fileRecords.find(row => String(row.id) === String(revision.fileRecordId)) : undefined
      assert.ok(view && artifact && revision && file, `Workflow method refers to unresolved Core ArtifactView ${viewId}.`)
      return { entityType: 'artifact', entityId: String(artifact.id), artifactId: String(artifact.id),
        artifactViewId: String(view.id), revisionId: String(revision.id), fileRecordId: String(file.id),
        mimeType: String(file.mimeType), displayLabel: String(artifact.title) }
    })
    assert.ok(references.length > 0, 'Saved method has no canonical Core Artifact references.')
    return { prompt: text.join('\n\n'), methods: methods.map(row => ({ id: row.id, version: row.version })), references }
  }

  function draftReferenceKey(reference) {
    return JSON.stringify(['artifact', reference.entityId, reference.revisionId, 'full'])
  }

  function countOccurrences(text, needle) {
    if (!needle) return 0
    return text.split(needle).length - 1
  }

  function assertMethodVisible(snapshot, phase) {
    const { prompt, references } = methodDraft
    assert.ok(snapshot.prompt.includes(prompt), `${phase}: Composer does not contain the exact method text projected from Core.`)
    assert.equal(countOccurrences(snapshot.prompt, prompt), 1, `${phase}: method text appears more than once in the Composer.`)
    const keys = snapshot.references.map(row => row.key)
    for (const reference of references) {
      const key = draftReferenceKey(reference)
      assert.equal(keys.filter(item => item === key).length, 1,
        `${phase}: exact Artifact/revision reference ${reference.artifactViewId} must appear once.`)
    }
    assert.equal(snapshot.receiverBlocked, true, `${phase}: no receiver must remain honestly blocked.`)
    assert.equal(snapshot.submitDisabled, true, `${phase}: Composer submit must stay disabled without a receiver.`)
    assert.equal(String(snapshot.contextLabel ?? '').trim(), '当前工作目标', `${phase}: Composer must not claim an active receiver.`)
    assert.equal(snapshot.receiverIdentityCount, 0, `${phase}: Composer must not render an unverified receiver identity.`)
  }

  function assertUnchanged(initial, final, label) {
    assert.deepEqual(final.surfaceMap, initial.surfaceMap, `${label}: Core surface/canvas mapping changed.`)
    assert.equal(stable(final.graph), stable(initial.graph), `${label}: Core graph changed.`)
    assert.equal(stable(final.presentations), stable(initial.presentations), `${label}: a Core Presentation changed.`)
    assert.equal(stable(final.runs), stable(initial.runs), `${label}: Core Run journal changed.`)
    for (const key of ['main', 'context', 'workflow'])
      assert.equal(stable(final.canvases[key]), stable(initial.canvases[key]), `${label}: ${key} Canvas changed.`)
    assert.deepEqual(Object.keys(final.files).sort(), Object.keys(initial.files).sort(), `${label}: referenced FileRecord set changed.`)
    for (const fileId of Object.keys(initial.files))
      assert.equal(final.files[fileId].bytes.equals(initial.files[fileId].bytes), true,
        `${label}: referenced FileRecord ${fileId} bytes changed.`)
  }

  async function doubleAnimationFrame(targetPage) {
    await targetPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }

  async function saveScreenshot(name, locator) {
    await doubleAnimationFrame(page)
    const fullPath = path.join(visualRoot, `tapnow-native-workflow-${stamp}-${name}.png`)
    await page.screenshot({ path: fullPath, fullPage: false })
    report.screenshots.push(fullPath)
    if (locator) {
      const cropPath = path.join(visualRoot, `tapnow-native-workflow-${stamp}-${name}-crop.png`)
      try {
        if (await locator.isVisible()) {
          await locator.screenshot({ path: cropPath, animations: 'disabled' })
          report.screenshots.push(cropPath)
        }
      } catch (error) {
        report.screenshotFailures ??= []
        report.screenshotFailures.push({ name, path: cropPath, error: clean(error?.message ?? error) })
      }
    }
    return fullPath
  }

  async function waitCanvasReady(targetPage, canvasId, titleTokens, phase) {
    await targetPage.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 30000 })
    await targetPage.waitForFunction(id => Boolean(window.__LCOS_NODE_LAB__?.api)
      && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === id
      && document.querySelector('.react-flow'), canvasId, { timeout: 30000 })
    await targetPage.waitForFunction(tokens => {
      const title = document.title
      return /tapnow/i.test(title) && tokens.some(token => token && title.includes(token))
    }, titleTokens, { timeout: 30000 })
    assert.equal(await targetPage.locator('.react-flow').count(), 1, `${phase}: expected the one existing ReactFlow root.`)
    const currentCanvas = await targetPage.evaluate(() => window.__LCOS_NODE_LAB__?.currentCanvasId
      ?? window.__LCOS_NODE_LAB__?.canvasId ?? null)
    assert.equal(currentCanvas, canvasId, `${phase}: original NodeLab is not on the intended Core Canvas.`)
  }

  async function openAgentPanel(targetPage) {
    const panel = targetPage.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (await panel.isVisible().catch(() => false)) {
      await panel.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
      await panel.waitFor({ state: 'hidden', timeout: 10000 })
    }
    const launchers = targetPage.locator('[data-pile-gallery-chrome="bottom-right"] button')
    await launchers.last().waitFor({ state: 'visible', timeout: 15000 })
    const count = await launchers.count()
    const candidates = []
    for (let index = 0; index < count; index++) {
      const launcher = launchers.nth(index)
      const markup = await launcher.evaluate(node => node.outerHTML)
      if (markup.includes('/agent-motion/')) candidates.push({ index, markup: markup.slice(0, 900) })
    }
    assert.equal(candidates.length, 1, 'Could not uniquely identify the original Glyth Agent launcher; external connector buttons are excluded.')
    report.ui.originalAgentLauncher ??= { selector: '[data-pile-gallery-chrome="bottom-right"] button with /agent-motion/ markup',
      matchCount: candidates.length, markup: candidates[0].markup }
    const launcher = launchers.nth(candidates[0].index)
    await launcher.hover()
    await doubleAnimationFrame(targetPage)
    assert.equal(await panel.isVisible().catch(() => false), false, 'Hover must not open a second Agent panel state.')
    await launcher.click()
    await panel.waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await targetPage.locator('.react-flow').count(), 1, 'Opening original Agent panel must not mount another Canvas.')
    return panel
  }

  async function openWorkflowHand(targetPage) {
    const panel = await openAgentPanel(targetPage)
    await panel.getByRole('button', { name: '打开工作流方法', exact: true }).click()
    await panel.waitFor({ state: 'hidden', timeout: 10000 })
    const hand = targetPage.getByRole('region', { name: '工作流手牌', exact: true })
    await hand.waitFor({ state: 'visible', timeout: 20000 })
    await hand.locator('[data-lcos-workflow-pool]').waitFor({ state: 'visible', timeout: 20000 })
    assert.equal(await targetPage.locator('.react-flow').count(), 1, 'Workflow hand must remain a leaf over the original Canvas.')
    const currentCanvasId = await targetPage.evaluate(() => window.__LCOS_NODE_LAB__?.currentCanvasId
      ?? window.__LCOS_NODE_LAB__?.canvasId ?? null)
    const workflowHost = targetPage.locator('[data-lcos-native-workflow-host][data-open="true"]')
    assert.equal(await workflowHost.getAttribute('data-source-canvas-id'), currentCanvasId,
      'Native Workflow hand source identity must be the current original NodeLab Canvas.')
    return hand
  }

  async function findWorkflowCard(targetPage, hand) {
    const exactEntity = `workflow:${selectedSurfaceMap.surfaces.workflow.scopeId}`
    const escaped = exactEntity.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
    const titleSelector = workflowCardMetadata.title.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
    const card = hand.locator(`[data-lcos-workflow-task-card][aria-label^="${titleSelector} ·"]`)
    await card.waitFor({ state: 'visible', timeout: 30000 })
    assert.equal(await card.count(), 1, 'The exact Core Warehouse workflow title must identify one original card.')
    const renderedEntityIds = await card.locator('[data-lcos-card-entity]').evaluateAll(nodes => nodes
      .map(node => node.getAttribute('data-lcos-card-entity')).filter(Boolean))
    if (renderedEntityIds.length) assert.deepEqual(renderedEntityIds, [exactEntity],
      'When the original take action is rendered, its entity must match the exact Core Workflow scope.')
    return card
  }

  async function previewWorkflowCard(targetPage, hand, phase) {
    const card = await findWorkflowCard(targetPage, hand)
    const preview = card.locator('.lcos-workflow-card-preview')
    if (!(await preview.isVisible().catch(() => false))) {
      await card.locator('.lcos-workflow-task-copy').click()
    }
    await preview.waitFor({ state: 'visible', timeout: 10000 })
    assert.equal(await card.getAttribute('data-preview'), 'true', `${phase}: original card did not enter preview state.`)
    await targetPage.waitForFunction(expected => {
      const status = document.querySelector('[data-lcos-workflow-preview-status]')?.textContent ?? ''
      return status.includes('方法步骤已读到') || status.includes('已加入草稿') || status.includes('已加入当前草稿')
        || status.includes('方法暂未读到') || status.includes('未加入当前草稿')
    }, null, { timeout: 30000 })
    const statusText = (await hand.locator('[data-lcos-workflow-preview-status]').innerText()).trim()
    assert.ok(!statusText.includes('方法暂未读到') && !statusText.includes('未加入当前草稿'),
      `${phase}: original card method/reference preview reported a failure: ${statusText}`)
    return { card, preview, statusText }
  }

  async function readComposer(targetPage, phase) {
    const composer = targetPage.locator('[data-lcos-composer]')
    await composer.waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await composer.count(), 1, `${phase}: expected one existing Composer owner.`)
    const input = composer.locator('[data-lcos-composer-input]')
    await input.waitFor({ state: 'visible', timeout: 10000 })
    const prompt = await input.inputValue()
    const references = await composer.locator('[data-lcos-composer-ref][data-reference-key]').evaluateAll(rows => rows.map(row => ({
      key: row.getAttribute('data-reference-key'), label: row.querySelector('.lcos-composer-reference-label')?.textContent?.trim() ?? '',
      order: row.getAttribute('data-reference-order'),
    })))
    const receiverBlocked = await composer.locator('[data-lcos-composer-receiver-blocked]').isVisible().catch(() => false)
    const submit = composer.locator('button[aria-label="提交"]')
    const submitDisabled = await submit.count() === 1 && await submit.isDisabled()
    const snapshot = { prompt, references, receiverBlocked, submitDisabled,
      uiState: await composer.getAttribute('data-ui-state'), targetId: await composer.getAttribute('data-lcos-composer-target'),
      contextLabel: await composer.locator('[data-lcos-composer-context-label]').textContent().catch(() => null),
      receiverIdentityCount: await composer.locator('.lcos-composer-identity').count() }
    assertMethodVisible(snapshot, phase)
    return snapshot
  }

  async function closeHand(hand) {
    if (await hand.isVisible().catch(() => false)) {
      await hand.getByRole('button', { name: '收回手牌', exact: true }).click()
      await hand.waitFor({ state: 'hidden', timeout: 10000 })
    }
  }

  async function pageEvidence(targetPage, phase) {
    return targetPage.evaluate(phaseName => ({ phase: phaseName, title: document.title, pathname: location.pathname,
      canvasId: window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId ?? null,
      reactFlowRoots: document.querySelectorAll('.react-flow').length,
      workflowHands: [...document.querySelectorAll('[data-lcos-workflow-hand]')].map(node => ({
        visible: node.getAttribute('aria-hidden') !== 'true', present: node.getAttribute('data-presentation-present'),
        text: (node.textContent ?? '').slice(0, 500) })),
      composerCount: document.querySelectorAll('[data-lcos-composer]').length,
      frameworkOverlays: [...document.querySelectorAll('.vite-error-overlay,#webpack-dev-server-client-overlay,[data-lcos-framework-error]')]
        .filter(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0).length,
    }), phase)
  }

  try {
    const health = await getJson('/health', 'local integration health')
    assert.equal(health.response.status, 200)
    report.baseline = { directReads: [], health: { status: health.response.status,
      profile: health.payload?.profile ?? null, bind: health.payload?.bind ?? null } }
    before = await readSnapshot('before')
    report.target.projectId = before.surfaceMap.projectId
    selectedSurfaceMap = before.surfaceMap
    assert.ok(!projectArg || projectArg === report.target.projectId, 'Requested project differs from the Core status project.')
    const workflow = selectedSurfaceMap.surfaces.workflow
    assert.ok(workflow.scopeId, 'Core status omitted the current canonical Workflow scope id.')
    assert.ok(!scopeArg || scopeArg === workflow.scopeId)
    report.target.workflowScopeId = workflow.scopeId
    const workflowScope = before.graph.scopes.filter(row => String(row.id) === workflow.scopeId && row.kind === 'workflow')
    assert.equal(workflowScope.length, 1, 'Current Workflow scope must be unique in the Core project graph.')
    const workspaceForSurface = key => before.graph.workspaces.find(row => String(row.id) === String(selectedSurfaceMap.surfaces[key].workspaceId)
      && String(row.canvasId) === selectedSurfaceMap.surfaces[key].canvasId && row.preferredSurface === key)
    const workflowWorkspace = workspaceForSurface('workflow')
    const contextWorkspace = workspaceForSurface('context')
    assert.ok(workflowWorkspace, 'Core graph does not map the exact Workflow Canvas to its canonical Workspace.')
    assert.ok(contextWorkspace, 'Core graph does not map the exact Context Canvas to its canonical Workspace.')
    assert.notEqual(selectedSurfaceMap.surfaces.context.canvasId, workflow.canvasId,
      'Context-to-Workflow navigation must cross two distinct existing Canvas IDs.')
    const contextTitleTokens = [...new Set([selectedSurfaceMap.surfaces.context.name,
      before.canvases.context.name, contextWorkspace.name].filter(value => typeof value === 'string' && value.trim()))]
    const workflowTitleTokens = [...new Set([workflow.name, before.canvases.workflow.name, workflowWorkspace.name]
      .filter(value => typeof value === 'string' && value.trim()))]
    assert.ok(contextTitleTokens.length > 0 && workflowTitleTokens.length > 0,
      'Original Context and Workflow Canvas/Core metadata are required to verify each settled title.')

    const methodPages = []
    let cursor
    const cursors = new Set()
    do {
      const query = new URLSearchParams({ kinds: 'workflow', limit: '50' })
      if (cursor) query.set('cursor', cursor)
      const warehouse = await coreValue(`/projects/${encodeURIComponent(report.target.projectId)}/warehouse?${query}`,
        `Core Workflow Warehouse page ${methodPages.length + 1}`)
      assert.equal(String(warehouse.projectId), report.target.projectId)
      assert.ok(Array.isArray(warehouse.items), 'Core Warehouse omitted items.')
      methodPages.push(...warehouse.items)
      cursor = warehouse.nextCursor
      if (cursor) {
        assert.ok(!cursors.has(cursor), 'Core Workflow Warehouse repeated a pagination cursor.')
        cursors.add(cursor)
      }
    } while (cursor)
    const cards = methodPages.filter(item => item?.kind === 'workflow' && item?.entityRef?.type === 'workflow'
      && String(item.entityRef.id) === workflow.scopeId)
    assert.equal(cards.length, 1, 'The current Core Workflow scope must appear as one canonical Warehouse card.')
    workflowCardMetadata = { id: String(cards[0].entityRef.id), title: String(cards[0].title), kind: cards[0].kind,
      entityType: cards[0].entityRef.type }
    assert.ok(workflowCardMetadata.title.length > 0)
    methodDraft = buildMethodDraft(before.graph, before.presentations, report.target.projectId, workflow.scopeId)
    const exactTextRefs = methodDraft.references.filter(reference => /^text\//i.test(reference.mimeType))
    assert.ok(exactTextRefs.length > 0, 'Current method has no text/Markdown Artifact reference in Core.')
    const textCarrierMatches = before.canvases.workflow.nodes.filter(node => node.type === 'text'
      && exactTextRefs.some(reference => reference.artifactViewId === node.data?.lcos_ref?.artifactViewId))
    assert.ok(textCarrierMatches.length > 0, 'Core method text references do not resolve to an existing original Workflow text node.')
    const carrierRef = textCarrierMatches[0].data.lcos_ref
    const exactTextRef = exactTextRefs.find(reference => reference.artifactViewId === carrierRef.artifactViewId)
    assert.ok(exactTextRef)
    assert.equal(String(carrierRef.artifactId), exactTextRef.artifactId)
    assert.equal(String(carrierRef.revisionId), exactTextRef.revisionId)
    const sourceTextBytes = before.files[exactTextRef.fileRecordId]
    assert.ok(sourceTextBytes?.bytes.length > 0, 'Text Artifact FileRecord bytes were not read from Core.')
    new TextDecoder('utf-8', { fatal: true }).decode(sourceTextBytes.bytes)
    report.baseline.snapshot = summarySnapshot(before)
    report.baseline.contextPresentationPreservation = before.presentations
      .filter(row => row.capability === 'context' && before.graph.scopes.some(scope => String(scope.id) === String(row.scopeId) && scope.kind === 'context'))
      .map(row => ({ id: row.id, scopeId: row.scopeId, version: row.version,
        memberViewIds: row.state?.memberViewIds ?? [], branchCount: Object.values(row.state?.workflowOperators ?? {})
          .reduce((count, operator) => count + (operator?.branches?.length ?? 0), 0) }))
    report.method = { presentationCountForScope: methodDraft.methods.length, presentations: methodDraft.methods,
      prompt: methodDraft.prompt, referenceCount: methodDraft.references.length,
      references: methodDraft.references.map(({ entityType, entityId, artifactId, artifactViewId, revisionId, fileRecordId, mimeType, displayLabel }) =>
        ({ entityType, entityId, artifactId, artifactViewId, revisionId, fileRecordId, mimeType, displayLabel })),
      exactCurrentWorkflowTextCarrier: { nodeId: textCarrierMatches[0].id, nodeType: textCarrierMatches[0].type,
        artifactViewId: exactTextRef.artifactViewId, revisionId: exactTextRef.revisionId,
        fileRecordId: exactTextRef.fileRecordId, mimeType: exactTextRef.mimeType,
        fileByteLength: sourceTextBytes.bytes.length, strictUtf8: true },
      sourceOwner: 'Core ProjectGraph ArtifactView → ArtifactRevision → FileRecord plus every current Workflow Presentation method; draft projection mirrors the existing readWorkflowMethodDraft contract' }

    const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' })
    await context.route('**/*', async route => {
      const request = route.request()
      let url
      try { url = new URL(request.url()) } catch {
        report.network.unknownProtocolBlocked.push({ method: request.method(), address: '[unparseable]', reason: 'unparseable browser request blocked' })
        await route.abort('blockedbyclient'); return
      }
      const method = request.method().toUpperCase()
      if (url.protocol === 'data:' || url.protocol === 'blob:') { await route.continue(); return }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        report.network.unknownProtocolBlocked.push({ method, address: safeAddress(url.href), reason: `unsupported protocol ${url.protocol}` })
        await route.abort('blockedbyclient'); return
      }
      if (url.origin !== origin) {
        report.network.offOriginHttpBlocked.push({ method, address: safeAddress(url.href), reason: 'off-origin HTTP blocked' })
        await route.abort('blockedbyclient'); return
      }
      if (method === 'GET' || method === 'HEAD') {
        const read = { method, path: safePath(url), status: 'requested' }
        report.network.browserReads.push(read)
        browserReadEntries.push({ request, read })
        await route.continue(); return
      }
      report.network.browserWritesBlocked.push({ method, path: safePath(url), reason: 'This browser run admits no HTTP writes; original Core/Huabu remain read-only.' })
      await route.abort('blockedbyclient')
    })
    if (typeof context.routeWebSocket !== 'function') {
      report.network.webSocketInterception = 'Playwright routeWebSocket unavailable; failed closed before page navigation.'
      throw new Error(report.network.webSocketInterception)
    }
    await context.routeWebSocket('**/*', async socketRoute => {
      report.network.webSocketsBlocked.push({ address: safeAddress(socketRoute.url()), reason: 'all WebSocket channels are blocked for this read-only workflow draft test' })
      await socketRoute.close({ code: 1008, reason: 'WebSocket blocked for read-only local workflow test' })
    })
    page = await context.newPage()
    page.on('pageerror', error => report.pageErrors.push(clean(error?.stack ?? error?.message ?? error)))
    page.on('console', message => {
      if (message.type() === 'error') report.consoleErrors.push(clean(message.text()))
      else if (message.type() === 'warning' || message.type() === 'warn') report.consoleWarnings.push(clean(message.text()))
    })
    page.on('requestfailed', request => report.network.requestFailures.push({ method: request.method(),
      address: safeAddress(request.url()), failure: clean(request.failure()?.errorText ?? 'request failed') }))
    page.on('response', response => {
      let url
      try { url = new URL(response.url()) } catch { return }
      if (url.origin !== origin) return
      const entry = browserReadEntries.findLast(row => row.request === response.request())
      if (entry) entry.read.status = response.status()
      if (response.status() >= 400) report.network.apiFailures.push({ method: response.request().method(),
        path: safePath(url), status: response.status(),
        classification: 'retained same-origin browser HTTP failure; not silently reclassified as success' })
    })

    await page.goto(new URL(`/canvas/${encodeURIComponent(selectedSurfaceMap.surfaces.context.canvasId)}`, origin).href,
      { waitUntil: 'domcontentloaded' })
    await waitCanvasReady(page, selectedSurfaceMap.surfaces.context.canvasId, contextTitleTokens, 'initial canonical Context route')
    report.ui.initial = await pageEvidence(page, 'initial')
    const overlayCount = await page.locator('.vite-error-overlay,#webpack-dev-server-client-overlay,[data-lcos-framework-error]')
      .evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0).length)
    assert.equal(overlayCount, 0, 'A visible framework error overlay blocks meaningful UI verification.')
    const initialScreenshot = await saveScreenshot('initial-context-canvas')
    report.cases.push({ name: 'Original Context route and unique TapNow Canvas before opening Workflow hand', passed: true,
      detail: { ...report.ui.initial, screenshot: initialScreenshot, titleMetadataTokens: contextTitleTokens } })

    let hand = await openWorkflowHand(page)
    let preview = await previewWorkflowCard(page, hand, 'first preview')
    report.ui.initial.handRegion = await pageEvidence(page, 'workflow hand + preview')
    report.ui.initial.previewStatus = preview.statusText
    report.ui.initial.screenshot = await saveScreenshot('workflow-card-preview', preview.preview)
    const firstTake = preview.preview.getByRole('button', { name: /加入当前草稿/ })
    assert.equal(await firstTake.count(), 1, 'Original preview must expose one visible take action for the unsaved method.')
    assert.equal(await firstTake.isDisabled(), false)
    await firstTake.click()
    const composer = page.locator('[data-lcos-composer]')
    await composer.waitFor({ state: 'visible', timeout: 15000 })
    await page.waitForFunction(() => document.querySelector('[data-lcos-composer-receiver-blocked]') !== null,
      null, { timeout: 10000 })
    await hand.waitFor({ state: 'hidden', timeout: 10000 })
    const firstComposer = await readComposer(page, 'first original take')
    assert.ok(['blocked', 'editing'].includes(firstComposer.uiState),
      `Unexpected Composer state after draft take: ${firstComposer.uiState}`)
    assert.equal(firstComposer.receiverIdentityCount, 0, 'No receiver identity may be fabricated for this draft.')
    report.ui.firstTake = { usedOriginalPreviewButton: true, oneUnsentComposer: true,
      exactCoreMethodVisible: true, exactCoreTextArtifactReferenceVisible: true,
      receiverBlocked: firstComposer.receiverBlocked, submitDisabled: firstComposer.submitDisabled,
      prompt: firstComposer.prompt, references: firstComposer.references, composer: firstComposer,
      screenshot: await saveScreenshot('first-take-composer', composer) }
    report.cases.push({ name: 'Original Workflow method preview → original Composer draft with exact Core text reference', passed: true,
      detail: { presentationIds: methodDraft.methods.map(row => row.id), referenceIds: methodDraft.references.map(row => row.artifactViewId),
        receiverStillBlocked: true, noSubmitOrRun: true } })

    hand = await openWorkflowHand(page)
    preview = await previewWorkflowCard(page, hand, 'reopened duplicate-prevention preview')
    const repeatedTake = preview.preview.getByRole('button', { name: /加入当前草稿/ })
    const repeatActionCount = await repeatedTake.count()
    if (repeatActionCount > 0) {
      assert.equal(repeatActionCount, 1)
      assert.equal(await repeatedTake.isDisabled(), false)
      await repeatedTake.click()
      await hand.waitFor({ state: 'hidden', timeout: 10000 })
      const afterRepeatClick = await readComposer(page, 'explicit second take via original visible button')
      assert.deepEqual(afterRepeatClick, firstComposer,
        'Original UI second take must leave the current unsent Composer prompt and ordered references unchanged.')
      report.ui.duplicatePrevention = { originalButtonWasVisible: true, explicitSecondTake: true,
        promptAndReferencesUnchanged: true, before: firstComposer, after: afterRepeatClick }
    } else {
      const cardState = await preview.card.getAttribute('data-state')
      assertMethodVisible(firstComposer, 'reopened duplicate-prevention preview')
      assert.equal(await preview.preview.getByRole('button', { name: /加入当前草稿/ }).count(), 0,
        'Already-in-draft original card must not expose a second take action.')
      report.ui.duplicatePrevention = { originalButtonWasVisible: false, explicitSecondTake: false,
        preventionOwner: 'original WorkflowCardPool alreadyInDraft → canUseInDraft=false; original TaskCardView omits onUse/take button',
        cardState, originalPreviewStatus: preview.statusText,
        promptAndReferencesUnchanged: true,
        before: firstComposer,
        detail: 'No second take was forced; the shipped original UI prevents duplicate take once the same method is already represented in the Composer.' }
    }
    report.ui.duplicatePrevention.screenshot = await saveScreenshot('duplicate-prevention', preview.preview)
    await closeHand(hand)
    const afterDuplicateObservation = await readComposer(page, 'after closing duplicate-prevention hand')
    assert.deepEqual(afterDuplicateObservation, firstComposer,
      'Closing/reopening the original hand and observing duplicate prevention must leave Composer prompt/references unchanged.')
    report.ui.duplicatePrevention.after = afterDuplicateObservation
    report.cases.push({ name: 'Close/reopen original hand and verify duplicate prevention without bypassing the original UI', passed: true,
      detail: report.ui.duplicatePrevention })

    // Use the card's actual entry action. The host delegates to the same Router and Core workspace mapping.
    hand = await openWorkflowHand(page)
    preview = await previewWorkflowCard(page, hand, 'canonical workflow entry preview')
    const routeButton = preview.preview.locator('button').filter({ hasText: /打开工作流现场|进入「/ })
    assert.equal(await routeButton.count(), 1, 'Original card preview must expose one canonical Workflow entry action.')
    await routeButton.click()
    await hand.waitFor({ state: 'hidden', timeout: 10000 })
    const fromCanvasId = selectedSurfaceMap.surfaces.context.canvasId
    const canonicalPath = `/canvas/${encodeURIComponent(selectedSurfaceMap.surfaces.workflow.canvasId)}`
    await page.waitForFunction(pathname => location.pathname === pathname, canonicalPath, { timeout: 15000 })
    await waitCanvasReady(page, selectedSurfaceMap.surfaces.workflow.canvasId, workflowTitleTokens, 'original Router Workflow entry')
    assert.notEqual(fromCanvasId, selectedSurfaceMap.surfaces.workflow.canvasId)
    report.ui.routerEntry = { usedOriginalCardEntryButton: true, fromCanvasId,
      toCanvasId: selectedSurfaceMap.surfaces.workflow.canvasId, routePath: new URL(page.url()).pathname,
      exactCoreWorkspace: { workspaceId: workflowWorkspace.id, canvasId: workflowWorkspace.canvasId, preferredSurface: workflowWorkspace.preferredSurface },
      currentNodeLabCanvasId: selectedSurfaceMap.surfaces.workflow.canvasId,
      reactFlowRoots: await page.locator('.react-flow').count(), noSecondCanvas: true,
      screenshot: await saveScreenshot('canonical-workflow-entry') }
    report.cases.push({ name: 'Original Workflow card entry uses Core workspace mapping and original Router on the same Canvas', passed: true,
      detail: report.ui.routerEntry })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitCanvasReady(page, selectedSurfaceMap.surfaces.workflow.canvasId, workflowTitleTokens, 'real page reload')
    report.ui.afterReload = await pageEvidence(page, 'after real reload before reopening hand')
    const restoredComposer = page.locator('[data-lcos-composer]')
    const restoredComposerVisible = await restoredComposer.isVisible().catch(() => false)
    let reloadDraft = null
    if (restoredComposerVisible) {
      const input = restoredComposer.locator('[data-lcos-composer-input]')
      const prompt = await input.inputValue().catch(() => '')
      const refs = await restoredComposer.locator('[data-lcos-composer-ref][data-reference-key]').evaluateAll(rows => rows.map(row => ({
        key: row.getAttribute('data-reference-key'), label: row.querySelector('.lcos-composer-reference-label')?.textContent?.trim() ?? '',
        order: row.getAttribute('data-reference-order'),
      })))
      const submit = restoredComposer.locator('button[aria-label="提交"]')
      reloadDraft = { visible: true, prompt, references: refs,
        containsMethod: prompt.includes(methodDraft.prompt),
        receiverBlocked: await restoredComposer.locator('[data-lcos-composer-receiver-blocked]').isVisible().catch(() => false),
        submitDisabled: await submit.count() === 1 && await submit.isDisabled(),
        uiState: await restoredComposer.getAttribute('data-ui-state'),
        targetId: await restoredComposer.getAttribute('data-lcos-composer-target'),
        contextLabel: await restoredComposer.locator('[data-lcos-composer-context-label]').textContent().catch(() => null),
        receiverIdentityCount: await restoredComposer.locator('.lcos-composer-identity').count() }
    } else reloadDraft = { visible: false, prompt: '', references: [], containsMethod: false }
    if (reloadDraft.containsMethod) assertMethodVisible(reloadDraft, 'natural Composer restoration after reload')

    hand = await openWorkflowHand(page)
    preview = await previewWorkflowCard(page, hand, 'Core-backed method re-read after reload')
    const reloadTake = preview.preview.getByRole('button', { name: /加入当前草稿/ })
    if (reloadDraft.containsMethod) {
      report.ui.afterReload.draftOutcome = { state: 'naturally-restored-by-original-app', retakePerformed: false,
        promptAndReferencesStillExact: true, composer: reloadDraft }
      assert.equal(await reloadTake.count(), 0,
        'If the app naturally restored the existing draft, the original card must prevent a duplicate take.')
    } else {
      assert.equal(await reloadTake.count(), 1,
        'After real reload reset the ephemeral Composer draft, the Core-backed original method should be available to take again.')
      assert.equal(await reloadTake.isDisabled(), false)
      await reloadTake.click()
      await page.locator('[data-lcos-composer]').waitFor({ state: 'visible', timeout: 15000 })
      await page.waitForFunction(() => document.querySelector('[data-lcos-composer-receiver-blocked]') !== null,
        null, { timeout: 10000 })
      await hand.waitFor({ state: 'hidden', timeout: 10000 })
      const reloadedComposer = await readComposer(page, 'Core-backed method retake after reload')
      report.ui.afterReload.draftOutcome = { state: restoredComposerVisible ? 'visible-but-method-was-not-restored' : 'ephemeral-draft-cleared-on-reload',
        retakePerformed: true, originalCardPreviewMethodRead: preview.statusText, composer: reloadedComposer }
      report.ui.afterReload.screenshot = await saveScreenshot('reload-core-method-retake', page.locator('[data-lcos-composer]'))
    }
    assert.equal(await page.locator('.react-flow').count(), 1, 'Reload and Core method retake must retain the single original Canvas.')
    report.ui.afterReload.draftBeforeReopen = reloadDraft
    report.ui.afterReload.previewStatus = preview.statusText
    report.ui.afterReload.previewScreenshot = await saveScreenshot('reload-method-preview', preview.preview)
    report.cases.push({ name: 'Real reload and Core-backed method re-read; retake only when the original app did not restore an ephemeral draft', passed: true,
      detail: report.ui.afterReload.draftOutcome })

    finalSnapshot = await readSnapshot('after UI flow')
    assertUnchanged(before, finalSnapshot, 'after native Workflow hand/Composer UI flow')
    assert.equal(report.pageErrors.length, 0,
      `Browser page errors must be zero for this focused Workflow UI verification; retained: ${JSON.stringify(report.pageErrors)}`)
    report.finalSnapshot = summarySnapshot(finalSnapshot)
    report.final = { originalReactFlowRootCount: await page.locator('.react-flow').count(),
      allThreeCanvasesUnchanged: true, graphUnchanged: true, everyPresentationUnchanged: true,
      runsUnchanged: true, referencedFileRecordBytesUnchanged: true,
      contextPresentationVersionAndBranchPreserved: true,
      browserWriteAttemptsBlocked: report.network.browserWritesBlocked.length,
      websocketAttemptsBlocked: report.network.webSocketsBlocked.length,
      offOriginHttpBlocked: report.network.offOriginHttpBlocked.length,
      pageErrors: report.pageErrors.length, consoleErrors: report.consoleErrors.length,
      apiFailures: report.network.apiFailures, noProviderOrRunActionClicked: true,
      composerState: 'unsent; receiver remains blocked; no Core Run was created' }
    report.cases.push({ name: 'Core/Huabu readback is exact: 3 Canvases, graph, all Presentations, Run journal, and referenced FileRecord bytes', passed: true,
      detail: report.final })
    report.passed = true
    report.runState = 'completed original Agent → Workflow method draft and read-only Core/Huabu comparison'
  } catch (error) {
    report.failure = clean(error?.stack ?? error?.message ?? error)
    report.runState = 'executed; all writes were blocked; no cleanup/retry or provider action was attempted'
    if (page) {
      try { report.failurePage = await pageEvidence(page, 'failure') } catch { report.failurePage = null }
      try { report.failureScreenshot = await saveScreenshot(`failure-${Date.now()}`) } catch { report.failureScreenshot = null }
    }
    if (before) {
      try {
        finalSnapshot = await readSnapshot('failure recovery read-only observation')
        report.failureReadback = summarySnapshot(finalSnapshot)
        report.failureReadbackUnchanged = {
          graph: stable(finalSnapshot.graph) === stable(before.graph),
          presentations: stable(finalSnapshot.presentations) === stable(before.presentations),
          runs: stable(finalSnapshot.runs) === stable(before.runs),
          canvases: Object.fromEntries(['main', 'context', 'workflow'].map(key => [key,
            stable(finalSnapshot.canvases[key]) === stable(before.canvases[key])])),
          referencedFileRecordBytes: Object.keys(before.files).every(fileId => finalSnapshot.files[fileId]
            && finalSnapshot.files[fileId].bytes.equals(before.files[fileId].bytes)),
        }
      } catch (readError) { report.failureReadbackError = clean(readError?.stack ?? readError?.message ?? readError) }
    }
  } finally {
    try { await context?.close() } catch { /* preserve primary evidence */ }
    try { await browser?.close() } catch { /* preserve primary evidence */ }
    await mkdir(evidenceDir, { recursive: true })
    await writeFile(evidencePath, JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify({ runState: report.runState, passed: report.passed,
      projectId: report.target.projectId, workflowScopeId: report.target.workflowScopeId,
      presentationCountForScope: report.method?.presentationCountForScope ?? null,
      firstTake: report.ui.firstTake?.exactCoreMethodVisible ?? false,
      duplicatePrevention: report.ui.duplicatePrevention?.originalButtonWasVisible === false ? 'original UI prevented repeat' : report.ui.duplicatePrevention?.explicitSecondTake ? 'explicit original button no-op checked' : null,
      reloadOutcome: report.ui.afterReload?.draftOutcome?.state ?? null,
      blockedWrites: report.network.browserWritesBlocked.length, apiFailures: report.network.apiFailures.length,
      failure: report.failure, evidence: evidencePath }, null, 2))
    if (!report.passed) process.exitCode = 1
  }
}

function parseLoopback(raw) {
  const base = new URL(raw)
  const loopbackNames = new Set(['127.0.0.1', 'localhost', '[::1]'])
  assert.equal(base.protocol, 'http:', 'Only an explicit local HTTP origin is supported.')
  assert.ok(loopbackNames.has(base.hostname.toLowerCase()), 'Base URL must resolve syntactically to a loopback host.')
  assert.equal(base.pathname, '/', 'Base URL may not select an application subpath.')
  assert.equal(base.search, '', 'Base URL may not contain query data.')
  assert.equal(base.hash, '', 'Base URL may not contain a fragment.')
  assert.equal(base.username, '')
  assert.equal(base.password, '')
  return base
}

function safeAddress(raw) {
  try {
    const url = new URL(raw)
    const keys = [...new Set(url.searchParams.keys())]
    url.search = keys.length ? `?${keys.map(key => `${encodeURIComponent(key)}=[redacted]`).join('&')}` : ''
    url.username = ''; url.password = ''
    return url.origin + url.pathname + url.search
  } catch { return '[unparseable address]' }
}
