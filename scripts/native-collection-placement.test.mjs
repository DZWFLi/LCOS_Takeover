import assert from 'node:assert/strict'
import { Server as NetServer } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'
import { createNativeUiSourceTransforms } from '../lab/native-ui-source-transforms.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportRoot = path.join(root, '.runtime', 'native-collection-placement')
await mkdir(reportRoot, { recursive: true })
const reportPath = path.join(reportRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
const runtimeRoot = await mkdtemp(path.join(reportRoot, 'case-'))
const runtimeRootResolved = path.resolve(runtimeRoot)
const browserRequire = createRequire(path.join(currentGen2Root, 'package.json'))
const { chromium } = browserRequire('playwright-core')
const blockedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])

const report = {
  at: new Date().toISOString(), reportPath,
  test: 'native-collection-placement',
  mode: 'one browser/nativeReact bundle: current placeAssemblyCollections + lab native adapter + fresh isolated Core facade',
  adapterBoundary: 'recording TapNow-native API methods; not real vendor O8/history implementation; flush writes through original facade nodes:batchActions and Huabu executor',
  currentRoot: currentGen2Root,
  originalUserDatabaseOpened: false,
  live17881Accessed: false,
  browserStarted: false,
  providerOrBridgeStarted: false,
  rawSqlUsed: false,
  schemaChanged: false,
  network: { allowedCoreRequests: [], browserLoopbackRequests: [], blockedBrowserRequests: [], blockedNodeFetches: [], pinnedOllamaRejected: [], bootstrapBaseline: [], activeLoopbackOrigins: [] },
  facadeRequests: [],
  apiCalls: [],
  pageErrors: [],
  consoleErrors: [],
  cases: [],
  cleanup: { targetContained: false, facadeClosed: false, uiServerClosed: false, browserClosed: false, listenersReleased: false, runtimeRemoved: false },
}

const originalFetch = globalThis.fetch.bind(globalThis)
let fetchInstalled = false
let bootstrapFacade = false
let facade
let repository
let coreOrigin
let uiServer
let browser
let page
let uiOrigin
let mismatchCanvasReadbacks = 0
let membersGate = null
const coreOrigins = new Set()
const localOrigins = new Set()

function isLoopback(host) { return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' }

function activeLoopbackOrigins() {
  const result = new Set()
  for (const handle of process._getActiveHandles()) {
    if (!(handle instanceof NetServer) || !handle.listening) continue
    const address = handle.address()
    if (!address || typeof address === 'string' || !isLoopback(address.address) || !Number.isInteger(address.port)) continue
    result.add(`http://${address.address.includes(':') ? `[${address.address}]` : address.address}:${address.port}`)
  }
  return result
}

function assertContained(parent, target, prefix) {
  const resolvedParent = path.resolve(parent), resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedParent, resolvedTarget)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.resolve(resolvedParent, relative) !== resolvedTarget
    || (prefix && !path.basename(resolvedTarget).startsWith(prefix))) throw new Error(`Refusing cleanup outside test runtime: ${resolvedTarget}`)
}

function installFetchBoundary() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
    const url = new URL(address)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (url.origin === 'http://127.0.0.1:1') {
      report.network.pinnedOllamaRejected.push({ method, origin: url.origin, path: url.pathname })
      throw new Error('Pinned local semantic-index endpoint is deliberately dead in this isolated test.')
    }
    const active = activeLoopbackOrigins()
    const boot = bootstrapFacade && active.size === 1 && active.has(url.origin)
    if (url.protocol === 'http:' && isLoopback(url.hostname) && !blockedPorts.has(url.port)
      && ((coreOrigins.has(url.origin) && active.has(url.origin)) || boot)) {
      const response = await originalFetch(input, init)
      report.network.allowedCoreRequests.push({ method, origin: url.origin, path: url.pathname, status: response.status })
      return response
    }
    report.network.blockedNodeFetches.push({ method, origin: url.origin, path: url.pathname })
    throw new Error('Only this test-owned Core loopback listener and pinned dead Ollama endpoint are allowed.')
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', chunk => chunks.push(Buffer.from(chunk)))
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' })
  response.end(JSON.stringify(body))
}

function callFacade(url, method, body) {
  return facade.handle({ method, pathname: url.pathname, url, body })
}

async function proxyCoreRequest(request, response, url) {
  const prefix = '/api/lcos/core'
  const targetPath = `${url.pathname.slice(prefix.length) || '/'}${url.search}`
  if (!targetPath.startsWith('/projects/')) return sendJson(response, 404, { code: 40400, error: { code: 'TEST_PROXY_ROUTE_REJECTED' } })
  const gateMatch = membersGate && targetPath.endsWith(`/collections/${membersGate.collectionId}/members`)
  if (gateMatch) {
    const gate = membersGate
    membersGate = null
    gate.arrived()
    await gate.releasedPromise
  }
  const bytes = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request)
  const forwarded = await originalFetch(`${coreOrigin}${targetPath}`, {
    method: request.method,
    headers: bytes ? { 'content-type': request.headers['content-type'] || 'application/json' } : undefined,
    body: bytes,
  })
  const raw = await forwarded.text()
  report.network.browserLoopbackRequests.push({ method: request.method, path: url.pathname, status: forwarded.status, forwardedTo: targetPath })
  response.writeHead(forwarded.status, { 'content-type': forwarded.headers.get('content-type') || 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(raw)
}

async function proxyFacadeRequest(request, response, url) {
  const rawBody = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request)
  let body
  if (rawBody?.length) body = JSON.parse(rawBody.toString('utf8'))
  const result = await callFacade(url, request.method, body)
  if (request.method === 'GET' && url.pathname.startsWith('/api/canvas/v1/canvases/') && mismatchCanvasReadbacks > 0) {
    mismatchCanvasReadbacks -= 1
    const value = result.body?.data
    const node = value?.nodes?.find(item => item.type === 'lcos-collection')
    if (node) node.position = { x: node.position.x + 0.25, y: node.position.y + 0.25 }
    report.facadeRequests.push({ method: request.method, path: url.pathname, status: result.status, fault: 'one readback DTO shifted by +0.25 after actual persistence' })
  } else report.facadeRequests.push({ method: request.method, path: url.pathname, status: result.status, code: result.body?.error?.code ?? null })
  sendJson(response, result.status, result.body)
}

async function staticFile(response, filePath) {
  const info = await stat(filePath)
  if (!info.isFile()) return sendJson(response, 404, { error: 'not found' })
  const extension = path.extname(filePath).toLowerCase()
  const type = extension === '.mjs' || extension === '.js' ? 'text/javascript; charset=utf-8'
    : extension === '.css' ? 'text/css; charset=utf-8'
      : extension === '.svg' ? 'image/svg+xml' : extension === '.woff2' ? 'font/woff2' : 'application/octet-stream'
  response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
  response.end(await readFile(filePath))
}

async function startUiServer(uiBundle) {
  const assetRoot = path.resolve(root, 'reference/tapnow-installed/resources/web')
  const server = createHttpServer((request, response) => {
    void (async () => {
      const origin = uiOrigin || 'http://127.0.0.1'
      const url = new URL(request.url || '/', origin)
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type,authorization', 'access-control-max-age': '0' })
        return response.end()
      }
      if (request.method === 'GET' && url.pathname === '/test.html') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        response.end('<!doctype html><html><head><meta charset="utf-8"></head><body><main id="test">isolated adapter test</main><script type="module">import("/native-collection-placement-ui.mjs").then(()=>{window.__bundleReady=true}).catch(error=>{window.__bundleError=String(error?.stack||error)})</script></body></html>')
        return
      }
      if (request.method === 'GET' && url.pathname === '/native-collection-placement-ui.mjs') return await staticFile(response, uiBundle)
      if (request.method === 'GET' && url.pathname === '/lcos/native-react.js') return await staticFile(response, path.join(root, 'lab/native-react.js'))
      if (request.method === 'GET' && url.pathname === '/lcos/native-flow.js') return await staticFile(response, path.join(root, 'lab/native-flow.js'))
      if (request.method === 'GET' && url.pathname === '/lcos/native-router.js') return await staticFile(response, path.join(root, 'lab/native-router.js'))
      if (request.method === 'GET' && url.pathname === '/lcos/native-jsx-runtime.js') return await staticFile(response, path.join(root, 'lab/native-jsx-runtime.js'))
      if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
        const target = path.resolve(assetRoot, url.pathname.slice(1))
        if (!target.startsWith(assetRoot + path.sep)) return sendJson(response, 400, { error: 'asset path rejected' })
        return await staticFile(response, target)
      }
      if (url.pathname === '/api/lcos/core' || url.pathname.startsWith('/api/lcos/core/')) return await proxyCoreRequest(request, response, url)
      if (url.pathname.startsWith('/api/lcos/canvases/') || url.pathname.startsWith('/api/canvas/v1/canvases/')) return await proxyFacadeRequest(request, response, url)
      sendJson(response, 404, { error: 'not found' })
    })().catch(error => {
      if (!response.headersSent) sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
      else response.destroy(error)
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('The test-owned UI loopback listener failed to bind.')
  uiOrigin = `http://127.0.0.1:${address.port}`
  localOrigins.add(uiOrigin)
  return server
}

function armMembersGate(collectionId) {
  let arrived
  let release
  const arrivedPromise = new Promise(resolve => { arrived = resolve })
  const releasedPromise = new Promise(resolve => { release = resolve })
  membersGate = { collectionId, arrived, releasedPromise, release }
  return { arrivedPromise, release }
}

async function coreRequest(method, pathname, body) {
  const response = await fetch(`${coreOrigin}${pathname}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}

async function responseFromFacade(method, pathname, body) {
  const result = await facade.handle({ method, pathname, url: new URL(pathname, coreOrigin), body })
  return result
}

async function main() {
  for (const key of ['HUABU_DATA_DIR', 'HUABU_HOST_URL', 'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN',
    'HUABU_AGENTLET_ID', 'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD', 'LCOS_BRIDGE_URL',
    'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LOCAL_CORE_DB_PATH', 'LOCAL_CORE_TEST_PORT', 'LOCAL_CORE_API_TOKEN',
    'LOCAL_CORE_DEV_WORKSPACE_ROOT', 'LOCAL_CORE_ENABLE_MVP_SAMPLE', 'LOCAL_CORE_MVP_SAMPLE_ROOT',
    'LOCAL_CORE_ALLOWED_ORIGINS', 'LCOS_CODEX_AUTO_EXECUTION', 'LCOS_WORKBUDDY_AUTO_EXECUTION',
    'LCOS_RECOVERY_TRANSPORT', 'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON',
    'LCOS_OLLAMA_URL', 'LCOS_OLLAMA_EMBED_MODEL', 'LCOS_REPO_ROOT', 'LCOS_SQLITE_VEC_EXTENSION',
    'LCOS_RUNTIME_REGISTRY', 'LCOS_PROJECTS_DIR', 'LCOS_INTELLIGENCE_PROVIDERS', 'LCOS_COMPATIBLE_BASE_URL',
    'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'GEMINI_BASE_URL',
    'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_API_KEY', 'GROQ_BASE_URL',
    'GROQ_API_KEY', 'MISTRAL_BASE_URL', 'MISTRAL_API_KEY', 'XAI_BASE_URL', 'XAI_API_KEY', 'QWEN_BASE_URL',
    'DASHSCOPE_API_KEY', 'ZHIPU_BASE_URL', 'ZHIPU_API_KEY', 'MOONSHOT_BASE_URL', 'SILICONFLOW_BASE_URL',
    'SILICONFLOW_API_KEY', 'MINIMAX_BASE_URL', 'MINIMAX_API_KEY', 'HUNYUAN_BASE_URL', 'HUNYUAN_API_KEY',
    'QIANFAN_BASE_URL', 'COHERE_BASE_URL', 'COHERE_API_KEY', 'TOGETHER_BASE_URL', 'TOGETHER_API_KEY',
    'FIREWORKS_BASE_URL', 'FIREWORKS_API_KEY', 'PERPLEXITY_BASE_URL', 'PERPLEXITY_API_KEY', 'BEDROCK_BASE_URL',
    'BEDROCK_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_API_VERSION', 'LMSTUDIO_BASE_URL']) delete process.env[key]
  process.env.LCOS_RECOVERY_TRANSPORT = 'none'
  process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'
  process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
  process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')

  const initialListeners = activeLoopbackOrigins()
  report.network.bootstrapBaseline = [...initialListeners]
  assert.equal(initialListeners.size, 0, 'test process starts without inherited listeners')
  installFetchBoundary()
  bootstrapFacade = true
  const coreOwnersBundle = path.join(runtimeRoot, 'placement-core-owners.mjs')
  await buildPilotEntry('lab/pilot/current-gen2-assembly-apply-test-owners.ts', coreOwnersBundle)
  const coreOwners = await import(pathToFileURL(coreOwnersBundle).href)
  facade = await coreOwners.startSurfaceCoreFacade({ runtimeRoot, publicOrigin: 'http://127.0.0.1:19879', fullIntegration: true })
  report.browserStarted = false
  const nowListening = activeLoopbackOrigins()
  coreOrigin = String(facade.core.origin)
  assert.ok(nowListening.has(coreOrigin))
  assert.equal(nowListening.size, 1, 'facade bootstrap owns the only active listener so far')
  assert.equal(blockedPorts.has(new URL(coreOrigin).port), false)
  coreOrigins.add(coreOrigin)
  report.network.activeLoopbackOrigins.push(coreOrigin)
  bootstrapFacade = false
  repository = facade.core.repository
  const projectId = String(facade.core.projectId)
  const mainWorkspace = facade.workspaces.find(workspace => workspace.preferredSurface === 'main')
  assert.ok(mainWorkspace)
  const canvasId = String(mainWorkspace.canvasId)
  const workspaceId = String(mainWorkspace.id)
  const initialRunCount = repository.getProjectRuns(projectId, 100).length
  assert.equal(initialRunCount, 0)

  const rootScope = repository.getScopes(projectId).find(scope => scope.kind === 'root')
  assert.ok(rootScope)
  const body = 'Synthetic placement fixture only. This Collection is not a user document.'
  const text = await coreOwners.createTextArtifact(repository, projectId, { title: 'Collection placement fixture member', body, scopeId: String(rootScope.id) })
  const createdCollection = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Native placement synthetic Collection', members: [{ type: 'artifact', id: text.artifactId }],
  })
  assert.equal(createdCollection.status, 201, JSON.stringify(createdCollection.body))
  const collectionId = String(createdCollection.body?.value?.id ?? '')
  assert.ok(collectionId)
  assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId).map(row => row.memberRef), [{ type: 'artifact', id: text.artifactId }])

  const uiOwnersEntry = path.join(runtimeRoot, 'native-collection-placement-ui.mjs')
  await buildPilotEntry('lab/pilot/native-collection-placement-test-owners.ts', uiOwnersEntry, 'browser', {
    nativeReact: true,
    sourceTransforms: createNativeUiSourceTransforms(),
    sourceOverrides: { 'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts' },
    env: { LCOS_CORE_URL: '/api/lcos/core', LCOS_CORE_TOKEN: '', PROJECT_ID: projectId },
  })
  const uiManifest = JSON.parse(await readFile(`${uiOwnersEntry}.sources.json`, 'utf8'))
  const currentPlacement = (uiManifest.resources ?? []).find(resource => resource.resourcePath === 'huabu/apps/web/src/lcos/drop/assemblyCollectionPlacement.ts')
  assert.ok(currentPlacement, 'the browser bundle must resolve the exact current upstream placement owner')
  assert.ok((uiManifest.nativePorts ?? []).some(port => String(port.sourcePath).replaceAll('\\', '/').toLowerCase().endsWith('/store/canvasstore.ts')
    && String(port.replacementPath).replaceAll('\\', '/').toLowerCase().endsWith('/native-canvas-port.ts')),
  'the same bundle must map the original Canvas store import to its lab native bridge')
  const builtUi = await readFile(uiOwnersEntry, 'utf8')
  assert.match(builtUi, /placeAssemblyCollections/)
  assert.match(builtUi, /synchronizeCollectionCarrier/)
  assert.doesNotMatch(builtUi, /ReactFlowProvider|createRoot\(/, 'placement adapter does not create a second React root or Canvas')
  report.bundle = { entry: path.relative(root, uiOwnersEntry).replaceAll('\\', '/'), nativeReactExternal: true,
    oneUiBundle: true, currentPlacementSource: currentPlacement.resourcePath, nativeCanvasPortMapped: true }

  uiServer = await startUiServer(uiOwnersEntry)
  const uiListening = activeLoopbackOrigins()
  assert.ok(uiListening.has(uiOrigin))
  localOrigins.add(uiOrigin)
  report.network.activeLoopbackOrigins.push(uiOrigin)
  const hostBrowser = await chromium.launch({ channel: 'chrome', headless: true })
  browser = hostBrowser
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === uiOrigin) return route.continue()
    report.network.blockedBrowserRequests.push({ method: route.request().method(), origin: url.origin, path: url.pathname })
    return route.abort('blockedbyclient')
  })
  page = await context.newPage()
  page.on('pageerror', error => report.pageErrors.push(error.stack || error.message))
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()) })
  page.on('websocket', socket => { report.network.blockedBrowserRequests.push({ method: 'WS', origin: new URL(socket.url()).origin, path: new URL(socket.url()).pathname }); socket.close() })
  await page.goto(`${uiOrigin}/test.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__bundleReady === true || window.__bundleError, { timeout: 30000 })
  const bundleError = await page.evaluate(() => window.__bundleError ?? null)
  assert.equal(bundleError, null, `browser bundle import: ${bundleError}`)
  report.browserStarted = true

  const initialCanvasResponse = await responseFromFacade('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  assert.equal(initialCanvasResponse.status, 200)
  const initialNodes = initialCanvasResponse.body.data.nodes
  const installed = await page.evaluate(input => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.install(input), {
    projectId, canvasId, workspaceId, nodes: initialNodes,
  })
  assert.deepEqual(installed, { hostCurrent: true, apiIdentity: true })

  const wrongCanvasHost = await page.evaluate(input => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.makePlacementHost(input.projectId, 'surface-not-current'), { projectId })
  assert.equal(wrongCanvasHost, null, 'the collection owner factory rejects a non-current Canvas before any request')
  const initialState = await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())
  assert.equal(initialState.assemblyApplyCalls, 0)

  // The real Core Apply commits first. A blocked original flush must make the
  // router report partial and preserve that receipt without resending it.
  await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.setFaults({ flushBlocked: 1 }))
  const blockedApplyCountBefore = (await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())).assemblyApplyCalls
  const blockedReceipt = await page.evaluate(input => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.commitAssembly(input), {
    transactionId: 'collection-placement-flush-blocked', projectId, canvasId, workspaceId, collectionId, point: { x: 344.5, y: 224.25 },
  })
  assert.equal(blockedReceipt.status, 'partial', JSON.stringify(blockedReceipt))
  assert.equal(repository.listCollectionMemberships(projectId, collectionId).length, 1, 'canonical membership remains exactly one after spatial flush block')
  assert.ok(repository.getPresentationView(projectId, `presentation:context:${rootScope.id}`)?.state.memberEntityRefs
    ?.some(ref => ref.type === 'collection' && ref.id === collectionId), 'Core membership survives local placement failure')
  assert.equal(report.facadeRequests.filter(item => item.path.endsWith('/collections:project')).length, 0,
    'blocked pre-project flush must not send the spatial projection request')
  const blockedState = await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())
  assert.equal(blockedState.events.filter(event => event.method === 'prepareCollectionGeometryHistory').length, 0)
  assert.equal(blockedState.events.filter(event => event.method === 'placeCollectionCarrier').length, 0)
  const mutationsAfterBlocked = repository.listMutationChangeSets(projectId, 200).map(item => String(item.id)).sort()
  const sameBlocked = await page.evaluate(input => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.commitAssembly(input), {
    transactionId: 'collection-placement-flush-blocked', projectId, canvasId, workspaceId, collectionId, point: { x: 344.5, y: 224.25 },
  })
  assert.deepEqual(sameBlocked, blockedReceipt, 'same transaction replay reuses the original partial receipt')
  assert.equal((await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())).assemblyApplyCalls, blockedApplyCountBefore + 1,
    'DropCommitRouter does not resend the Core Assembly Apply after partial placement')
  assert.deepEqual(repository.listMutationChangeSets(projectId, 200).map(item => String(item.id)).sort(), mutationsAfterBlocked)
  report.cases.push('real Core Assembly Apply succeeds once; blocked original flush yields partial; replay of that gesture does not resend Assembly or membership')

  // A new transaction can retry only the spatial phase. Core responds
  // already-member; one existing projected carrier is then moved and flushed
  // through the original facade batch-action/geometry owner.
  const canvasBeforeSuccess = await responseFromFacade('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  const beforeSuccessIds = canvasBeforeSuccess.body.data.nodes.map(node => String(node.id)).sort()
  const changesBeforeSpatialRetry = repository.listMutationChangeSets(projectId, 200).map(item => String(item.id)).sort()
  const placementPoint = { x: 344.5, y: 224.25 }
  const placedReceipt = await page.evaluate(input => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.commitAssembly(input), {
    transactionId: 'collection-placement-success-after-partial', projectId, canvasId, workspaceId, collectionId, point: placementPoint,
  })
  assert.equal(placedReceipt.status, 'success', JSON.stringify(placedReceipt))
  assert.equal(placedReceipt.assemblyItems?.[0]?.status, 'skipped', 'the retry consumes exact already-member receipt, not a second membership')
  assert.deepEqual(repository.listMutationChangeSets(projectId, 200).map(item => String(item.id)).sort(), changesBeforeSpatialRetry,
    'spatial retry does not create a second Core Assembly ChangeSet')
  const canvasAfterSuccess = await responseFromFacade('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  assert.equal(canvasAfterSuccess.status, 200)
  const carrier = canvasAfterSuccess.body.data.nodes.find(node => node.type === 'lcos-collection'
    && node.data?.lcos_collection_ref?.collectionId === collectionId)
  assert.ok(carrier, 'saved Core/Huabu GET returns one exact Collection carrier')
  assert.equal(carrier.canvas_id, canvasId)
  assert.deepEqual(carrier.position, placementPoint)
  assert.deepEqual(canvasAfterSuccess.body.data.nodes.map(node => String(node.id)).sort(), [...beforeSuccessIds, String(carrier.id)].sort())
  const binding = repository.findProjectionBinding(projectId, canvasId, 'node', 'collection', collectionId)
  assert.equal(binding?.spatialId, carrier.id)
  assert.equal(repository.getCollection(collectionId)?.id, collectionId)
  assert.equal(repository.listCollectionMemberships(projectId, collectionId).length, 1)
  const successfulState = await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())
  assert.deepEqual(successfulState.events.filter(event => ['prepareCollectionGeometryHistory', 'placeCollectionCarrier'].includes(event.method))
    .map(event => event.method), ['placeCollectionCarrier'], 'native placement delegates O8 flush and final validation to one original geometry call')
  const applyCountAtSuccess = successfulState.assemblyApplyCalls
  const repeatedSuccess = await page.evaluate(input => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.commitAssembly(input), {
    transactionId: 'collection-placement-success-after-partial', projectId, canvasId, workspaceId, collectionId, point: placementPoint,
  })
  assert.deepEqual(repeatedSuccess, placedReceipt)
  assert.equal((await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())).assemblyApplyCalls, applyCountAtSuccess)
  report.savedCarrier = { canvasId, workspaceId, nodeId: String(carrier.id), point: carrier.position,
    originalCanvasApiCalls: successfulState.events.map(event => event.method), flushSavedThrough: '/api/canvas/v1/canvases/:id/nodes:batchActions',
    savedGetVerified: true, sameCoreCollectionAndMembership: true }
  report.cases.push('current placement helper uses Core Collection/Binding readbacks, recording native history/geometry methods, facade batch save and persisted GET at the requested point')

  // Readback mismatch is an explicit transport fault injection after a real
  // persistence. The router keeps the canonical success as partial and caches
  // it, so the same gesture cannot issue a second Apply.
  mismatchCanvasReadbacks = 1
  const readbackFailureMutations = repository.listMutationChangeSets(projectId, 200).map(item => String(item.id)).sort()
  const mismatchPoint = { x: 401.75, y: 286.5 }
  const mismatchReceipt = await page.evaluate(input => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.commitAssembly(input), {
    transactionId: 'collection-placement-readback-mismatch', projectId, canvasId, workspaceId, collectionId, point: mismatchPoint,
  })
  assert.equal(mismatchReceipt.status, 'partial', JSON.stringify(mismatchReceipt))
  assert.match(mismatchReceipt.message, /原画布保存确认/)
  const mismatchRetry = await page.evaluate(input => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.commitAssembly(input), {
    transactionId: 'collection-placement-readback-mismatch', projectId, canvasId, workspaceId, collectionId, point: mismatchPoint,
  })
  assert.deepEqual(mismatchRetry, mismatchReceipt)
  assert.deepEqual(repository.listMutationChangeSets(projectId, 200).map(item => String(item.id)).sort(), readbackFailureMutations,
    'readback mismatch stays a placement-only partial; no new Core membership ChangeSet is generated')
  const mismatchState = await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())
  report.apiCalls = mismatchState.events
  report.browserBootstrapNote = report.pageErrors.some(message => message.includes('Minified React error #299'))
    ? 'The shipped vendor entry exports the real React object but also attempts its app mount; this isolated test intentionally mounts no TapNow root, so the vendor emits #299. Adapter assertions do not treat it as a product GUI result.'
    : 'No vendor root-mount page error observed.'
  report.cases.push('one intentionally altered readback DTO makes the original placement owner throw; DropCommitRouter returns/caches partial without resending Assembly')

  // Workspace and API identity are captured by the existing host. Switches
  // during Core members readback are rejected before projector POST/history.
  async function testLateSwitch(collectionTitle, switchKind) {
    const create = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
      title: collectionTitle, members: [{ type: 'artifact', id: text.artifactId }],
    })
    assert.equal(create.status, 201)
    const lateCollectionId = String(create.body.value.id)
    const gate = armMembersGate(lateCollectionId)
    const routePostCountBefore = report.facadeRequests.filter(item => item.path.endsWith('/collections:project')).length
    const nativeGeometryCallsBefore = (await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())).events
      .filter(event => event.method === 'prepareCollectionGeometryHistory' || event.method === 'placeCollectionCarrier').length
    const pendingCommit = page.evaluate(input => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.commitAssembly(input), {
      transactionId: `late-${switchKind}-placement`, projectId, canvasId, workspaceId, collectionId: lateCollectionId,
      point: { x: 510, y: 340 },
    })
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${switchKind} Core member read`)), 10000)
      gate.arrivedPromise.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
    })
    if (switchKind === 'workspace') await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.setWorkspace('workspace-switched-during-read'))
    else if (switchKind === 'surface') await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.setSurface('context'))
    else await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.replaceApi())
    gate.release()
    const result = await pendingCommit
    assert.equal(result.status, 'partial')
    assert.equal(report.facadeRequests.filter(item => item.path.endsWith('/collections:project')).length, routePostCountBefore,
      `${switchKind} change during awaited Core read rejects before a spatial POST`)
    assert.equal((await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())).events
      .filter(event => event.method === 'prepareCollectionGeometryHistory' || event.method === 'placeCollectionCarrier').length,
      nativeGeometryCallsBefore,
      `${switchKind} change must not reach native geometry/history APIs`)
    assert.equal(repository.getPresentationView(projectId, `presentation:context:${rootScope.id}`)?.state.memberEntityRefs
      ?.some(ref => ref.type === 'collection' && ref.id === lateCollectionId), true,
    'Core membership remains confirmed even though late local placement is refused')
    return { collectionId: lateCollectionId, receiptStatus: result.status, projectionPostCount: 0 }
  }
  const lateWorkspace = await testLateSwitch('Late workspace switch fixture', 'workspace')
  await page.evaluate(workspace => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.setWorkspace(workspace), workspaceId)
  assert.equal(await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState().hostCurrent), true,
    'the exact captured workspace restoration makes the existing host current again')
  const lateSurface = await testLateSwitch('Late active Surface switch fixture', 'surface')
  await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.setSurface('main'))
  assert.equal(await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState().hostCurrent), true,
    'the same captured surface mapping restoration makes the existing host current again')
  const lateApiCollectionResponse = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Late API identity switch during native receipt fixture', members: [{ type: 'artifact', id: text.artifactId }],
  })
  assert.equal(lateApiCollectionResponse.status, 201)
  const lateApiCollectionId = String(lateApiCollectionResponse.body.value.id)
  await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.setFaults({ holdSynchronization: true }))
  const syncEventsBefore = (await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())).events
    .filter(event => event.method === 'synchronizeCollectionCarrier').length
  const geometryCallsBeforeApiRace = (await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())).events
    .filter(event => event.method === 'prepareCollectionGeometryHistory' || event.method === 'placeCollectionCarrier').length
  const projectionPostsBeforeApiRace = report.facadeRequests.filter(item => item.path.endsWith('/collections:project')).length
  const apiRaceCommit = page.evaluate(input => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.commitAssembly(input), {
    transactionId: 'late-api-change-during-native-receipt', projectId, canvasId, workspaceId,
    collectionId: lateApiCollectionId, point: { x: 612, y: 388 },
  })
  await page.waitForFunction(previous => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState().events
    .filter(event => event.method === 'synchronizeCollectionCarrier').length > previous, syncEventsBefore, { timeout: 10000 })
  await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.replaceApi())
  await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.releaseSynchronization())
  const lateApiReceipt = await apiRaceCommit
  assert.equal(lateApiReceipt.status, 'partial')
  assert.equal(report.facadeRequests.filter(item => item.path.endsWith('/collections:project')).length, projectionPostsBeforeApiRace + 1,
    'the original exact Canvas projection request may have committed before the API switched')
  const geometryCallsAfterApiRace = (await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())).events
    .filter(event => event.method === 'prepareCollectionGeometryHistory' || event.method === 'placeCollectionCarrier').length
  assert.equal(geometryCallsAfterApiRace, geometryCallsBeforeApiRace,
    'a late original-API change during synchronizeCollectionCarrier cannot reach native geometry')
  const lateApiBinding = repository.findProjectionBinding(projectId, canvasId, 'node', 'collection', lateApiCollectionId)
  assert.ok(lateApiBinding?.spatialId, 'Core/Huabu retains the exact committed projection identity for recovery; no replacement was guessed')
  const savedLateApiCanvas = await responseFromFacade('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  assert.ok(savedLateApiCanvas.body.data.nodes.some(node => String(node.id) === String(lateApiBinding.spatialId)))
  const applyCallsAfterLateApi = (await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())).assemblyApplyCalls
  const retryLateApi = await page.evaluate(input => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.commitAssembly(input), {
    transactionId: 'late-api-change-during-native-receipt', projectId, canvasId, workspaceId,
    collectionId: lateApiCollectionId, point: { x: 612, y: 388 },
  })
  assert.deepEqual(retryLateApi, lateApiReceipt, 'the partial receipt remains cached after the API changes')
  assert.equal((await page.evaluate(() => window.__NATIVE_COLLECTION_PLACEMENT_TEST__.currentState())).assemblyApplyCalls, applyCallsAfterLateApi,
    'replaying a late API partial must not submit another Core Assembly Apply')
  report.lateSwitches ??= {}
  report.lateSwitches.api = { collectionId: lateApiCollectionId, receiptStatus: lateApiReceipt.status,
    projectorCommittedBeforeSwitch: true, exactBindingRetained: String(lateApiBinding.spatialId), geometryRejected: true,
    partialRetryDidNotResubmit: true }
  report.cases.push('workspace/surface changes during Core reads refuse projection; API change while native receipt is pending refuses geometry, preserves the exact committed binding and caches partial without reapplying Assembly')

  const finalCanvas = await responseFromFacade('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  assert.equal(finalCanvas.status, 200)
  assert.equal(repository.getProjectRuns(projectId, 100).length, initialRunCount, 'placement adapter test does not create or dispatch Runs')
  assert.equal(report.network.blockedBrowserRequests.length, 0, 'browser network stays on the own loopback UI host')
  assert.equal(report.network.blockedNodeFetches.length, 0, 'server-side network stays on the isolated Core listener')
  assert.ok(report.network.pinnedOllamaRejected.every(request => request.origin === 'http://127.0.0.1:1' && request.path === '/api/embed'))
  assert.ok(report.network.browserLoopbackRequests.every(request => request.forwardedTo.startsWith('/projects/')))
  report.fixture = { projectId, canvasId, workspaceId, collectionId, artifactId: text.artifactId,
    originalMembershipRows: repository.listCollectionMemberships(projectId, collectionId).length }
  report.lateSwitches = { workspace: lateWorkspace, surface: lateSurface, api: report.lateSwitches.api,
    apiIdentityRejected: true, wrongCanvasFactoryReturnedNull: true }
  report.summary = { coreAssemblyApplyRequests: report.network.browserLoopbackRequests.filter(request => request.forwardedTo.endsWith('/assembly/apply')).length,
    facadeCollectionProjectionPosts: report.facadeRequests.filter(request => request.path.endsWith('/collections:project')).length,
    nativeGeometryPrepareCalls: mismatchState.events.filter(event => event.method === 'prepareCollectionGeometryHistory').length,
    nativeGeometryPlaceCalls: mismatchState.events.filter(event => event.method === 'placeCollectionCarrier').length,
    persistedCanvasNodes: finalCanvas.body.data.nodes.length,
    runsCreated: repository.getProjectRuns(projectId, 100).length,
    providerDispatches: 0, pinnedOllamaAttemptsRejected: report.network.pinnedOllamaRejected.length,
    blockedBrowserRequests: report.network.blockedBrowserRequests.length, blockedNodeFetches: report.network.blockedNodeFetches.length }
}

try {
  await main()
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error)
  process.exitCode = 1
} finally {
  if (membersGate) membersGate.release()
  if (page) {
    try { await page.close(); report.cleanup.browserClosed = true } catch (error) { report.cleanup.browserCloseError = String(error) }
  } else report.cleanup.browserClosed = true
  if (browser) {
    try { await browser.close(); report.cleanup.browserClosed = true } catch (error) { report.cleanup.browserCloseError = String(error) }
  }
  if (uiServer) {
    try { await new Promise((resolve, reject) => uiServer.close(error => error ? reject(error) : resolve())); report.cleanup.uiServerClosed = true }
    catch (error) { report.cleanup.uiServerCloseError = String(error) }
  } else report.cleanup.uiServerClosed = true
  if (facade) {
    try { await facade.close(); report.cleanup.facadeClosed = true }
    catch (error) { report.cleanup.facadeCloseError = String(error) }
  } else report.cleanup.facadeClosed = true
  await new Promise(resolve => setImmediate(resolve))
  const remaining = activeLoopbackOrigins(), baseline = new Set(report.network.bootstrapBaseline)
  report.cleanup.listenersReleased = [...remaining].every(origin => baseline.has(origin)) && [...baseline].every(origin => remaining.has(origin))
  report.cleanup.remainingLoopbackOrigins = [...remaining]
  report.cleanup.ownerPid = process.pid
  try {
    assert.equal(path.dirname(runtimeRootResolved), path.resolve(reportRoot))
    assertContained(reportRoot, runtimeRootResolved, 'case-')
    report.cleanup.targetContained = true
  } catch (error) { report.cleanup.pathError = String(error) }
  if (report.cleanup.facadeClosed && report.cleanup.uiServerClosed && report.cleanup.browserClosed
    && report.cleanup.listenersReleased && report.cleanup.targetContained) {
    try { await rm(runtimeRootResolved, { recursive: true, force: true }); report.cleanup.runtimeRemoved = true }
    catch (error) { report.cleanup.cleanupError = String(error) }
  } else report.cleanup.runtimePreservedOnCloseFailure = true
  if (fetchInstalled) globalThis.fetch = originalFetch
  await import('node:fs/promises').then(({ writeFile }) => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'))
  console.log(JSON.stringify(report, null, 2))
}

if (!report.cleanup.facadeClosed || !report.cleanup.uiServerClosed || !report.cleanup.browserClosed
  || !report.cleanup.listenersReleased || !report.cleanup.targetContained || !report.cleanup.runtimeRemoved) process.exitCode = 1
