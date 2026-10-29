import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const origin = 'http://127.0.0.1:17881'
const canvasId = 'surface-core-context'
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
const fixturePath = path.join(visualRoot, 'node-upload-fixture.png')
const screenshotPath = path.join(visualRoot, 'tapnow-native-upload.png')
const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')

const report = {
  at: new Date().toISOString(),
  target: `${origin}/canvas/${canvasId}`,
  scope: 'Context only; Main and Workflow canvases are not mutated',
  browser: { engine: 'Chrome', freshContext: true, viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'blocked' },
  entry: { addButtonTestId: 'canvas-dockbar-add-node-btn', uploadOptionText: null, fileChooserTriggeredByMenu: false },
  fixture: { name: path.basename(fixturePath), bytes: null, providerTaskSubmitted: false },
  quality: { settingExposed: false, note: 'This is a local upload flow, not an image-generation request; no quality setting was exposed or claimed.' },
  network: { allowedOrigin: origin, externalHttpBlocked: [], websocketsClosed: 0 },
  uploadRequests: [],
  lifecycleRequests: [],
  lifecycleResponses: [],
  metadataUpdates: [],
  pageErrors: [],
  consoleErrors: [],
  apiFailures: [],
  cases: [],
  passed: false,
}

const cleanText = value => String(value)
  .replace(/((?:token|secret|credential|authorization|api.?key)\s*[:=]\s*)[^\s,;]+/ig, '$1[redacted]')
  .replace(/https?:\/\/[^\s"'<>]+/g, raw => { try { const url = new URL(raw); return url.origin + url.pathname } catch { return '[url]' } })
  .slice(0, 900)
const safePath = value => { try { const url = new URL(value); return url.origin + url.pathname } catch { return String(value).slice(0, 300) } }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

let browser
let context
let page

try {
  const healthResponse = await fetch(`${origin}/health`)
  assert.equal(healthResponse.status, 200)
  const health = await healthResponse.json()
  assert.ok(Number.isInteger(health.pid) && health.pid > 0, 'Connect to the already-running 17881 full-integration service; do not replace it.')
  assert.equal(health.profile, 'original-tapnow-full-integration-in-progress')
  report.server = { pid: health.pid, profile: health.profile, realCoreConnected: health.realCoreConnected, localBackendMode: health.localBackendMode }

  const fixture = await readFile(fixturePath)
  assert.ok(fixture.length > 8 && fixture.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
  report.fixture.bytes = fixture.length

  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue()
    report.network.externalHttpBlocked.push({ method: route.request().method(), url: safePath(url.href) })
    return route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', socket => { report.network.websocketsClosed += 1; socket.close() })
  page = await context.newPage()
  page.on('pageerror', error => report.pageErrors.push(cleanText(error.message)))
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(cleanText(message.text())) })
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss())

  const requestRecords = new WeakMap()
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.origin !== origin) return
    if (url.pathname.startsWith('/api/files/upload-urls') || url.pathname.startsWith('/api/lcos-upload-staging/')) {
      let payload = null
      if (request.method() === 'POST') {
        try {
          const body = request.postDataJSON()
          payload = { file_name: body.file_name, mime_type: body.mime_type, file_size: body.file_size,
            is_temporary: body.is_temporary, is_resumable_mode: body.is_resumable_mode,
            folder_id_supplied: Boolean(body.folder_id), keep_original_filename: body.keep_original_filename,
            forbid_overwrite: body.forbid_overwrite, file_hash_supplied: typeof body.file_hash === 'string' && body.file_hash.length > 0 }
        } catch { payload = { parseable: false } }
      }
      const entry = { method: request.method(), path: url.pathname, payload, status: null, responseCode: null }
      report.uploadRequests.push(entry)
      requestRecords.set(request, entry)
    }
    if (url.pathname.endsWith('/nodes:batchActions') && request.method() === 'POST') {
      let actionSummary = null
      try {
        const body = request.postDataJSON()
        const actions = body.actions ?? (body.action ? [body.action] : [])
        actionSummary = actions.map(action => ({ action: action.action,
          creates: Array.isArray(action.creates) ? action.creates.map(node => ({ id: node.id, type: node.type,
            src: typeof node.data?.src === 'string' ? safePath(node.data.src) : null,
            carriesFileId: typeof node.data?.file_id === 'string', carriesLcosRef: Boolean(node.lcos_ref || node.data?.lcos_ref) })) : undefined,
          updates: Array.isArray(action.updates) ? action.updates.map(node => {
            const metadata = node.data?.__metadata
            return { id: node.id, type: node.type, dataKeys: Object.keys(node.data || {}).sort(),
              src: typeof node.data?.src === 'string' ? safePath(node.data.src) : null,
              lcos_ref: node.data?.lcos_ref ? { entityType: node.data.lcos_ref.entityType, entityId: node.data.lcos_ref.entityId,
                artifactId: node.data.lcos_ref.artifactId, revisionId: node.data.lcos_ref.revisionId } : undefined,
              metadata: metadata ? { keys: Object.keys(metadata).sort(), url: typeof metadata.url === 'string' ? safePath(metadata.url) : null,
                width: metadata.width, height: metadata.height } : null }
          }) : undefined }))
        report.lifecycleRequests.push({ canvasId: body.canvas_id, operation: body.lcos_operation, actionSummary })
      } catch { report.lifecycleRequests.push({ canvasId: null, actionSummary: 'unparseable' }) }
    }
  })
  page.on('response', async response => {
    const url = new URL(response.url())
    if (url.origin !== origin) return
    const requestRecord = requestRecords.get(response.request())
    if (requestRecord) {
      requestRecord.status = response.status()
      try {
        const body = await response.json()
        requestRecord.responseCode = body?.code
        if (url.pathname.endsWith('/complete')) requestRecord.receiptRef = body?.data?.lcos_ref
      } catch { requestRecord.responseCode = null }
    }
    if (response.status() >= 400 && (url.pathname.startsWith('/api/files/upload-urls')
      || url.pathname.startsWith('/api/lcos-upload-staging/') || url.pathname.endsWith('/nodes:batchActions'))) {
      report.apiFailures.push({ method: response.request().method(), path: url.pathname, status: response.status() })
    }
    if (url.pathname.endsWith('/nodes:batchActions')) {
      let body
      try { body = await response.json() } catch { body = null }
      report.lifecycleResponses.push({ status: response.status(), code: body?.error?.code,
        lifecycleResults: body?.data?.lifecycle_results?.map(item => ({ canvas_id: item.canvas_id, operation: item.operation,
          nodes: item.nodes?.map(node => ({ clientNodeId: node.clientNodeId, nodeId: node.nodeId, lcos_ref: node.lcos_ref })) })) })
      const updateRequest = report.lifecycleRequests.at(-1)
      if (updateRequest?.actionSummary?.some(action => action.action === 'update' && action.updates?.some(update => update.metadata))) {
        report.metadataUpdates.push({ status: response.status(), code: body?.error?.code,
          updates: updateRequest.actionSummary.flatMap(action => action.updates || []).filter(update => update.metadata) })
      }
    }
  })

  const readContext = async () => {
    const response = await fetch(`${origin}/api/canvas/v1/canvases/${canvasId}`)
    assert.equal(response.status, 200, 'Context canvas read must remain available through the real API.')
    const body = await response.json()
    assert.equal(body.code, 0)
    return body.data
  }

  await page.goto(`${origin}/canvas/${canvasId}`)
  await page.waitForFunction(() => Boolean(window.__LCOS_NODE_LAB__?.api), { timeout: 30000 })
  await page.getByTestId('canvas-dockbar-add-node-btn').click()
  const uploadOption = page.getByRole('option', { name: /上传/ })
  await uploadOption.waitFor({ state: 'visible', timeout: 5000 })
  report.entry.uploadOptionText = cleanText(await uploadOption.innerText())
  const before = await readContext()
  const beforeImageIds = new Set(before.nodes.filter(node => node.type === 'image').map(node => String(node.id)))
  report.cases.push({ name: '原 Add menu 可见上传入口', passed: true, detail: { buttonTestId: 'canvas-dockbar-add-node-btn', option: report.entry.uploadOptionText } })

  const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 })
  await uploadOption.click()
  const chooser = await chooserPromise
  report.entry.fileChooserTriggeredByMenu = true
  report.entry.fileChooserAccept = await chooser.element().getAttribute('accept')
  await chooser.setFiles(fixturePath)
  report.cases.push({ name: '通过真实上传菜单打开 FileChooser 并选择合成 PNG', passed: true,
    detail: { chooserAccept: report.entry.fileChooserAccept, fixtureBytes: fixture.length } })

  const deadline = Date.now() + 45000
  let after
  let created
  do {
    after = await readContext()
    created = after.nodes.find(node => node.type === 'image' && !beforeImageIds.has(String(node.id)))
    if (created && report.uploadRequests.some(item => item.path.endsWith('/complete') && item.status === 200)
      && report.lifecycleResponses.some(item => item.status === 200)) break
    await delay(300)
  } while (Date.now() < deadline)

  assert.ok(created, `No new Context image node appeared. Upload requests: ${JSON.stringify(report.uploadRequests)}; lifecycle responses: ${JSON.stringify(report.lifecycleResponses)}`)
  assert.ok(report.uploadRequests.some(item => item.method === 'POST' && item.path === '/api/files/upload-urls' && item.status === 200), 'Original upload URL request must reach the real handler.')
  assert.ok(report.uploadRequests.some(item => item.method === 'PUT' && item.path.startsWith('/api/lcos-upload-staging/') && item.status === 200), 'Original PUT must reach runtime staging.')
  assert.ok(report.uploadRequests.some(item => item.method === 'PUT' && item.path.endsWith('/complete') && item.status === 200), 'Original complete must reach Core Import Copy.')
  assert.ok(report.lifecycleRequests.some(item => item.canvasId === canvasId && item.actionSummary?.some(action => action.action === 'create'
    && action.creates?.some(node => node.type === 'image'))), 'Original canvas node create must follow upload completion.')
  assert.ok(created.data?.lcos_ref?.artifactId && created.data?.lcos_ref?.revisionId && created.data?.lcos_ref?.artifactViewId,
    'Fresh image must carry real Core Artifact/Revision/View references.')
  assert.ok(String(created.data.src).includes('/api/surface-core/file-records/'), 'Saved image src must resolve to the canonical Core FileRecord route.')
  const nativeCreate = report.lifecycleRequests.flatMap(item => item.actionSummary || []).flatMap(action => action.creates || [])
    .find(node => node.id === created.id)
  assert.ok(nativeCreate, 'Persisted Huabu node must map to the original Native create DTO ID.')
  report.nativeNode = { id: String(created.id), type: created.type, lcos_ref: created.data.lcos_ref,
    canonicalSource: safePath(created.data.src), nativeDtoCarriesFileId: nativeCreate.carriesFileId,
    nativeDtoCarriesLcosRef: nativeCreate.carriesLcosRef }

  const contentResponse = await fetch(created.data.src)
  const bytes = Buffer.from(await contentResponse.arrayBuffer())
  assert.equal(contentResponse.status, 200)
  assert.equal(contentResponse.headers.get('content-type')?.split(';')[0], 'image/png')
  assert.ok(bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
  report.coreReadback = { status: contentResponse.status, contentType: contentResponse.headers.get('content-type'), bytes: bytes.length, pngSignature: true }

  report.cases.push({ name: '上传顺序、原生ID/Core身份、真实字节与Library可见性', passed: true,
    detail: { uploadStages: report.uploadRequests.map(item => ({ method: item.method, path: item.path, status: item.status })),
      lifecycleCanvas: canvasId, nativeNodeId: String(created.id), artifactId: created.data.lcos_ref.artifactId, fileBytes: bytes.length } })

  const createdImage = page.locator(`.react-flow__node[data-id="${String(created.id).replaceAll('"', '')}"] img`).first()
  await createdImage.waitFor({ state: 'visible', timeout: 10000 })
  await createdImage.evaluate(image => image.complete ? undefined : new Promise((resolve, reject) => {
    image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', reject, { once: true })
  }))
  const metadataDeadline = Date.now() + 5000
  while (!report.metadataUpdates.length && Date.now() < metadataDeadline) await delay(100)

  const foldersResponse = await fetch(`${origin}/api/library/v1/spaces/SPACE_TYPE_PRIVATE/folders`)
  const foldersBody = await foldersResponse.json()
  const folderId = foldersBody.data?.folders?.[0]?.id
  assert.equal(foldersResponse.status, 200)
  assert.ok(folderId)
  const libraryResponse = await fetch(`${origin}/api/library/v1/folders/${encodeURIComponent(folderId)}/assets?page=1&page_size=200`)
  const libraryBody = await libraryResponse.json()
  assert.equal(libraryResponse.status, 200)
  const listedAsset = libraryBody.data.assets.find(asset => asset.id === created.data.lcos_ref.artifactId)
  assert.ok(listedAsset, 'Uploaded Artifact must be visible in the local Core Library projection by exact Artifact ID.')
  report.library = { status: libraryResponse.status, artifactVisible: true, artifactId: listedAsset.id,
    displayName: listedAsset.name, sourceUrl: safePath(listedAsset.source_url),
    note: 'Core content deduplication may retain the existing Artifact title instead of the local upload filename.' }

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(window.__LCOS_NODE_LAB__?.api), { timeout: 30000 })
  await page.waitForTimeout(900)
  const reloaded = await readContext()
  const afterReload = reloaded.nodes.find(node => String(node.id) === String(created.id))
  assert.ok(afterReload, 'Native image carrier must survive browser reload.')
  assert.equal(afterReload.data?.lcos_ref?.artifactId, created.data.lcos_ref.artifactId)
  assert.equal(afterReload.data?.lcos_ref?.revisionId, created.data.lcos_ref.revisionId)
  report.reload = { nodeId: String(afterReload.id), sameArtifact: true, sameRevision: true }
  report.cases.push({ name: '浏览器刷新后同一Huabu NodeID与Core身份仍存在', passed: true, detail: report.reload })
  const lifecycleCreateSucceeded = report.lifecycleResponses.some(item => item.status === 200
    && item.lifecycleResults?.some(result => result.nodes?.some(node => node.nodeId === String(created.id))))
  report.passed = lifecycleCreateSucceeded && report.apiFailures.length === 0 && report.pageErrors.length === 0
  if (!report.passed) report.failure = `Observed API failure(s): ${JSON.stringify(report.apiFailures)}; metadata update diagnostics: ${JSON.stringify(report.metadataUpdates)}`
} catch (error) {
  report.failure = cleanText(error?.stack || error)
  report.passed = false
  process.exitCode = 1
} finally {
  if (page) await page.screenshot({ path: screenshotPath, fullPage: false }).then(() => { report.screenshot = screenshotPath }).catch(error => {
    report.screenshotError = cleanText(error?.message || error)
  })
  if (browser) await browser.close().catch(() => {})
  await mkdir(path.join(root, 'evidence'), { recursive: true })
  await writeFile(path.join(root, 'evidence', 'native-upload-browser.json'), JSON.stringify(report, null, 2) + '\n')
}

console.log(JSON.stringify({ passed: report.passed, entry: report.entry, uploadRequests: report.uploadRequests,
  lifecycleResponses: report.lifecycleResponses, nativeNode: report.nativeNode, coreReadback: report.coreReadback,
  metadataUpdates: report.metadataUpdates, library: report.library, reload: report.reload, apiFailures: report.apiFailures, pageErrors: report.pageErrors, consoleErrors: report.consoleErrors,
  remoteBlocked: report.network.externalHttpBlocked.length, websocketsClosed: report.network.websocketsClosed, failure: report.failure }, null, 2))
