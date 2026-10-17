import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = path.join(root, '.runtime', 'native-project-text-create-' + Date.now())
await mkdir(runtimeRoot, { recursive: true })
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
process.env.LCOS_RECOVERY_TRANSPORT = 'none'

const facadeEntry = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'facade.mjs'))
const receiptEntry = await buildPilotEntry('lab/pilot/native-project-text-create-receipt.ts', path.join(runtimeRoot, 'receipt-port.mjs'))
const callerEntry = await buildPilotEntry('lab/pilot/native-project-text-create.ts', path.join(runtimeRoot, 'native-project-text-create-caller.mjs'), 'browser')
const { startSurfaceCoreFacade } = await import(pathToFileURL(facadeEntry).href)
const { createNativeProjectTextReceiptPort, NativeProjectTextCreateError } = await import(pathToFileURL(receiptEntry).href)

const report = {
  implementation: 'original NodeLab addNodes + native create/apply history intent + real Core/Huabu text producer + exact Core GET',
  runtimeRoot,
  originalUserDatabaseOpened: false,
  providerExecutionStarted: false,
  typedCallerBuild: true,
  coreWrites: 0,
  nativeAdds: 0,
  cases: [],
}

let facade
let server
let origin
let rejectCreateBatch = false
let deferCreateResponse = false
let createResponseCommitted = false
let releaseCreateResponse

try {
  server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', origin)
      const chunks = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const raw = Buffer.concat(chunks).toString('utf8')
      const body = raw ? JSON.parse(raw) : undefined
      if (rejectCreateBatch && requestUrl.pathname.endsWith('/nodes:batchActions') && body?.actions?.[0]?.action === 'create') {
        response.statusCode = 409
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ code: 40900, data: null, error: { code: 'SYNTHETIC_REFUSAL', message: 'test-only refusal before Core/Huabu producer' } }))
        return
      }
      const result = await facade.handle({ method: request.method || 'GET', pathname: requestUrl.pathname, url: requestUrl, body })
      if (deferCreateResponse && requestUrl.pathname.endsWith('/nodes:batchActions') && body?.actions?.[0]?.action === 'create') {
        createResponseCommitted = true
        await new Promise((resolve) => { releaseCreateResponse = resolve })
      }
      response.statusCode = result.status
      response.setHeader('Content-Type', result.contentType || 'application/json')
      if (Buffer.isBuffer(result.body)) response.end(result.body)
      else response.end(JSON.stringify(result.body))
    } catch (error) {
      response.statusCode = 500
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  origin = `http://127.0.0.1:${address.port}`
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true })

  const nativeIntentSource = await readFile(path.join(root, 'lab/startup-history-intent.js'), 'utf8')
  const surfaceCoreSource = await readFile(path.join(root, 'lab/startup-surface-core.js'), 'utf8')
  const call = async (method, address, body) => {
    const url = new URL(address, origin)
    const response = await fetch(url, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const payload = await response.json()
    return { status: response.status, body: payload }
  }

  const initial = await call('GET', '/api/canvas/v1/canvases/surface-core-main')
  assert.equal(initial.status, 200)
  const canvasId = 'surface-core-main'
  const projectId = facade.core.projectId
  const seededNodes = initial.body.data.nodes
  const history = []
  const listeners = new Set()
  const currentNodesRef = { current: structuredClone(seededNodes) }
  let liveNodes = currentNodesRef.current
  const trace = { addCalls: [], batchRequests: [], batchResponses: [], coreReads: [], historyBackfillResults: [] }
  const api = {
    getNodes: () => liveNodes,
    getNode: (nodeId) => liveNodes.find((node) => node.id === nodeId),
    subscribeNative(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    backfillNodeReceipt(receipt) {
      const result = globalThis.window.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt({
        ...receipt,
        canvasId,
        history,
        currentNodesRef,
        setNodes(next) {
          liveNodes = next
          for (const listener of listeners) listener()
        },
        suppress() {},
      })
      trace.historyBackfillResults.push(result)
      return result
    },
    addNodes(carriers) {
      trace.addCalls.push(structuredClone(carriers))
      report.nativeAdds += carriers.length
      const before = { nodes: liveNodes }
      const changes = carriers.map((item) => ({ type: 'add', item }))
      globalThis.window.__LCOS_NATIVE_INTENT__.tagChanges(changes, this.getNode, canvasId)
      liveNodes = [...liveNodes, ...carriers]
      currentNodesRef.current = liveNodes
      const next = { nodes: liveNodes }
      const historyTransition = globalThis.window.__LCOS_NATIVE_INTENT__.recordHistoryTransition(canvasId, before, next)
      const entry = { state: { nodes: structuredClone(liveNodes) }, ...historyTransition }
      history.unshift(entry)
      for (const listener of listeners) listener()

      const operation = globalThis.window.__LCOS_NATIVE_INTENT__.metadata(changes[0])?.lcos_operation
      const creates = carriers.map((node) => ({
        id: node.id,
        type: node.type,
        data: structuredClone(node.data),
        position: structuredClone(node.position),
        measured: { width: node.width ?? 300, height: node.height ?? 270 },
      }))
      const wireBody = { canvas_id: canvasId, lcos_operation: operation, actions: [{ action: 'create', creates }] }
      trace.batchRequests.push(structuredClone(wireBody))
      // This is the single original API call. The normal surface fetch observer
      // sees its response and backfills the same native history entry.
      void globalThis.window.fetch(`${origin}/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wireBody),
      }).then(async (response) => {
        const payload = await response.json()
        trace.batchResponses.push({ status: response.status, payload })
        if (payload?.data?.core_saved === true) report.coreWrites += 1
      }).catch((error) => { trace.batchFailure = String(error) })
      return undefined
    },
  }
  const host = { projectId, canvasId, currentCanvasId: canvasId, api }
  globalThis.window = { fetch: globalThis.fetch.bind(globalThis), __LCOS_NODE_LAB__: host }
  globalThis.location = { origin, href: origin + '/takeover/' }
  const sandbox = {
    window: globalThis.window,
    location: globalThis.location,
    URL,
    Request,
    Response,
    Map,
    Promise,
    Date,
    structuredClone,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  }
  vm.runInNewContext(nativeIntentSource, sandbox, { filename: 'startup-history-intent.js' })
  vm.runInNewContext(surfaceCoreSource, sandbox, { filename: 'startup-surface-core.js' })

  const readCanvasText = async (requestedProjectId, address) => {
    trace.coreReads.push({ projectId: requestedProjectId, ...address })
    const result = await call('GET', `/api/lcos/core/projects/${encodeURIComponent(requestedProjectId)}/curation/canvas-text?canvasId=${encodeURIComponent(address.canvasId)}&spatialId=${encodeURIComponent(address.spatialId)}`)
    if (result.status !== 200 || result.body?.ok !== true) throw new Error(result.body?.error?.message || `Core GET returned ${result.status}`)
    return result.body.value
  }

  let idSequence = 0
  const carrierFactoryCalls = []
  const createTextCarrier = (data, overrides) => {
    carrierFactoryCalls.push({ data: structuredClone(data), overrides: structuredClone(overrides) })
    idSequence += 1
    return {
      id: `text-native-project-create-${idSequence}`,
      type: 'text',
      data: { type: 'generate', title: 'Text', text: '', prompt: '', params: { model: 'gemini-3.1-flash-lite', provider: 'google' }, ...data },
      position: { x: 0, y: 0 }, width: 300, height: 270, selected: false,
      ...overrides,
    }
  }
  const options = {
    getHost: () => globalThis.window.__LCOS_NODE_LAB__,
    getCurrentProjectId: () => globalThis.window.__LCOS_NODE_LAB__?.projectId,
    getNativeIntent: () => globalThis.window.__LCOS_NATIVE_INTENT__,
    readCanvasText,
    createTextCarrier,
    timeoutMs: 750,
  }
  const waitUntil = async (predicate, label) => {
    const deadline = Date.now() + 3000
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('Timed out waiting for ' + label)
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }
  const beforeArtifactCount = facade.core.repository.getArtifacts(projectId).length
  const input = {
    projectId, canvasId, title: '分支文本 · 合成测试',
    body: '# 分支文本\n\n来自原生拖出分支的合成正文。',
    position: { x: 418, y: 236 },
  }
  const snapshot = await createNativeProjectTextReceiptPort(options).create(input)
  const createdCarrier = trace.addCalls[0]?.[0]
  const createdNodeId = createdCarrier?.id
  assert.ok(createdNodeId?.startsWith('text-'))
  assert.deepEqual(carrierFactoryCalls[0], { data: { text: input.body, prompt: '', title: input.title }, overrides: { position: input.position } })
  assert.equal(trace.addCalls.length, 1, 'the original NodeLab API receives one addNodes call')
  assert.equal(trace.batchRequests.length, 1, 'one addNodes create is persisted once through native batch')
  assert.deepEqual(trace.batchRequests[0].lcos_operation, {
    version: 1, operationId: trace.batchRequests[0].lcos_operation.operationId, kind: 'create', phase: 'apply',
  })
  assert.equal(typeof trace.batchRequests[0].lcos_operation.operationId, 'string')
  assert.equal(trace.batchRequests[0].actions[0].creates[0].id, createdNodeId, 'client NodeID is preserved across the create DTO')
  assert.equal(trace.batchRequests[0].actions[0].creates[0].data.lcos_ref, undefined, 'fresh text identity is produced by Core, never supplied by renderer')
  assert.equal(snapshot.projectId, projectId)
  assert.equal(snapshot.canvasId, canvasId)
  assert.equal(snapshot.spatialId, createdNodeId)
  assert.equal(snapshot.body, input.body)
  assert.equal(snapshot.title, input.title)
  assert.ok(snapshot.artifactId && snapshot.viewId && snapshot.revisionId && snapshot.fileRecordId)
  assert.equal(trace.coreReads.length, 1)
  assert.deepEqual(trace.coreReads[0], { projectId, canvasId, spatialId: createdNodeId })
  assert.equal(trace.historyBackfillResults.length, 1)
  assert.equal(trace.historyBackfillResults[0].ok, true)
  assert.equal(history[0].lcos_history_operations[0].lcos_operation.kind, 'create')
  assert.equal(history[0].lcos_history_operations[0].lcos_operation.phase, 'apply')
  assert.equal(history[0].state.nodes.find((node) => node.id === createdNodeId).data.lcos_ref.artifactId, snapshot.artifactId,
    'the same original native history snapshot is backfilled with the Core receipt')
  assert.equal(api.getNode(createdNodeId).data.lcos_ref.revisionId, snapshot.revisionId)
  const newArtifacts = facade.core.repository.getArtifacts(projectId)
  assert.equal(newArtifacts.length, beforeArtifactCount + 1, 'one Core text Artifact is produced')
  const revision = facade.core.repository.getArtifactRevision(snapshot.revisionId)
  const fileRecord = facade.core.repository.getFileRecord(String(revision.fileRecordId))
  assert.equal(await readFile(fileRecord.observedPath, 'utf8'), input.body, 'Core FileRecord stores the exact UTF-8 body bytes')
  assert.equal(report.coreWrites, 1)
  report.cases.push('one original addNodes call creates one native create/apply operation; startup fetch observer backfills the same history/live node; exact Core GET and real FileRecord bytes agree');

  // Commit to Core/Huabu, but hold the original response while the page switches
  // canvases. The caller must not return a snapshot into the new scene; after
  // the late native response backfills history, recovery is GET-only.
  deferCreateResponse = true
  createResponseCommitted = false
  const lateInput = { ...input, title: '延迟回执分支', body: '# 延迟回执\n\n只读恢复，不重发。' }
  let lateNodeId
  const lateCreate = createNativeProjectTextReceiptPort(options).create(lateInput)
  await waitUntil(() => createResponseCommitted, 'the real create response to be held after commit')
  host.currentCanvasId = 'surface-core-context'
  await assert.rejects(lateCreate, (error) => {
    lateNodeId = error.nodeId
    return error instanceof NativeProjectTextCreateError && error.status === 'canvas-changed'
  })
  host.currentCanvasId = canvasId
  assert.ok(lateNodeId && api.getNode(lateNodeId))
  assert.equal(api.getNode(lateNodeId).data.lcos_ref, undefined, 'backfill waits for the actual native response')
  releaseCreateResponse?.()
  deferCreateResponse = false
  await waitUntil(() => !!api.getNode(lateNodeId)?.data?.lcos_ref, 'the original observer/history receipt backfill')
  const recovered = await createNativeProjectTextReceiptPort(options).verify({ ...lateInput, nodeId: lateNodeId })
  assert.equal(recovered.spatialId, lateNodeId)
  assert.equal(recovered.body, lateInput.body)
  assert.equal(trace.addCalls.filter((items) => items[0]?.id === lateNodeId).length, 1,
    'read-only recovery does not issue another native addNodes call')
  assert.equal(history.find((entry) => entry.state.nodes.some((node) => node.id === lateNodeId))
    .state.nodes.find((node) => node.id === lateNodeId).data.lcos_ref.artifactId, recovered.artifactId)
  report.cases.push('a real committed create with held response is not acknowledged into a switched Canvas; after original history backfill, exact Core GET recovery returns the same identity without a second add')

  // The exact donor factory is supplied as an injected dependency. Confirm the
  // copied vendor symbol that Root's narrow native-flow export should expose.
  const originalFactoryBundle = await readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-D4wysAbz.js'), 'utf8')
  const originalTextPage = await readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets/page-Da_DfwiK.js'), 'utf8')
  assert.ok(originalFactoryBundle.includes('XD as b_'), 'TapNow exports the original text factory as b_')
  assert.ok(originalFactoryBundle.includes('height:ar.height,width:ar.width'), 'the original XD/fi factory owns its default text geometry')
  assert.ok(originalTextPage.includes('b_ as fi'), 'the original text page imports that factory as fi')
  assert.ok(originalTextPage.includes('fi({text:"",prompt:""}'), 'native menu creates through fi(data, overrides)')
  report.originalFactory = { symbol: 'UnlimitedModeToggle export XD as b_; page import b_ as fi', signature: 'fi(data, overrides)',
    helperInvokesInjectedFactory: true, originalVendorFunctionExecutedInTest: false }
  report.cases.push('original vendor text carrier factory symbol/signature confirmed read-only; helper accepts it by injection and does not synthesize its own native identity/geometry');
  assert.ok((await readFile(callerEntry, 'utf8')).includes('createNativeProjectTextReceiptPort'),
    'the typed production caller bundles the independent receipt helper');
  report.cases.push('typed production caller compiles with the existing CoreArtifactClient readCanvasText path');

  // Invalid/current-project cases fail before either the carrier factory or the
  // original addNodes call, preserving both native and Core state.
  const callCount = trace.addCalls.length
  const factoryCount = carrierFactoryCalls.length
  await assert.rejects(
    createNativeProjectTextReceiptPort({ ...options, getCurrentProjectId: () => 'foreign-project' }).create(input),
    (error) => error instanceof NativeProjectTextCreateError && error.status === 'project-changed',
  )
  host.currentCanvasId = 'surface-core-context'
  await assert.rejects(
    createNativeProjectTextReceiptPort(options).create(input),
    (error) => error instanceof NativeProjectTextCreateError && error.status === 'canvas-changed',
  )
  host.currentCanvasId = canvasId
  assert.equal(trace.addCalls.length, callCount)
  assert.equal(carrierFactoryCalls.length, factoryCount, 'project/canvas mismatch is rejected before consulting the donor factory')
  report.cases.push('foreign project and stale canvas are rejected before native or Core writes');

  const collisionPort = createNativeProjectTextReceiptPort({
    ...options,
    createTextCarrier: (data, overrides) => ({ ...createdCarrier, id: 'surface-main-text', data: { ...createdCarrier.data, ...data }, ...overrides }),
  })
  await assert.rejects(collisionPort.create(input), (error) => error instanceof NativeProjectTextCreateError && error.status === 'node-id-collision')
  assert.equal(trace.addCalls.length, callCount)
  report.cases.push('a donor factory NodeID collision is rejected without renaming the client identity or writing');

  const noIntentPort = createNativeProjectTextReceiptPort({ ...options, getNativeIntent: () => undefined })
  await assert.rejects(noIntentPort.create(input), (error) => error instanceof NativeProjectTextCreateError && error.status === 'native-intent-unavailable')
  assert.equal(trace.addCalls.length, callCount)
  report.cases.push('missing NativeIntent is a pre-write refusal rather than an untagged successful-looking create');

  // A failed native batch leaves the one newly queued node recoverable in the
  // original store, but the helper neither removes it nor submits a second write.
  const refusedInput = { ...input, body: '# Refused branch\n\nNo producer receipt.' }
  rejectCreateBatch = true
  const refusedPort = createNativeProjectTextReceiptPort({ ...options, timeoutMs: 80 })
  let refusedNodeId
  await assert.rejects(refusedPort.create(refusedInput), (error) => {
    refusedNodeId = error.nodeId
    return error instanceof NativeProjectTextCreateError && error.status === 'create-receipt-timeout'
  })
  rejectCreateBatch = false
  assert.ok(refusedNodeId && api.getNode(refusedNodeId), 'the original native node remains available for recovery/inspection')
  assert.equal(api.getNode(refusedNodeId).data.lcos_ref, undefined)
  const addsAfterRefusal = trace.addCalls.length
  await assert.rejects(refusedPort.verify({ ...refusedInput, nodeId: refusedNodeId }),
    (error) => error instanceof NativeProjectTextCreateError && error.status === 'history-receipt-unavailable')
  assert.equal(trace.addCalls.length, addsAfterRefusal, 'read-only verify did not replay addNodes')
  assert.equal(facade.core.repository.getArtifacts(projectId).length, beforeArtifactCount + 2,
    'the rejected create did not add a Core Artifact')
  report.cases.push('failed original batch leaves its native NodeID visible; read-only recovery does not retry or invent a Core ref');

  const finalReport = { ...report, nativeAdds: report.nativeAdds, status: 'passed', failure: null }
  await writeFile(path.join(runtimeRoot, 'report.json'), JSON.stringify(finalReport, null, 2))
  process.stdout.write(JSON.stringify(finalReport, null, 2) + '\n')
} catch (error) {
  const failure = { ...report, status: 'failed', failure: error instanceof Error ? { name: error.name, message: error.message } : String(error) }
  await writeFile(path.join(runtimeRoot, 'report.json'), JSON.stringify(failure, null, 2))
  process.stderr.write(JSON.stringify(failure, null, 2) + '\n')
  throw error
} finally {
  if (facade) await facade.close()
  if (server) await new Promise((resolve) => server.close(resolve))
  delete globalThis.window
  delete globalThis.location
}
