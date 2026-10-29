import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
await mkdir(runtimeBase, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(runtimeBase, 'runtime-composition-'))

// Core's own composition reads these optional integration values. Remove old
// process settings without inspecting them, then provide only isolated paths.
for (const key of [
  'LCOS_BRIDGE_URL',
  'LOCAL_CORE_BRIDGE_PROJECT_ID',
  'LCOS_CODEX_AUTO_EXECUTION',
  'LCOS_WORKBUDDY_AUTO_EXECUTION',
  'LCOS_RECOVERY_TRANSPORT',
  'HUABU_HOST_URL',
  'HUABU_HOST_TOKEN',
  'HUABU_CONNECTION_TOKEN',
  'HUABU_AGENTLET_ID',
  'HUABU_AGENTLET_SPAWN_COMMAND',
  'HUABU_AGENTLET_SPAWN_CWD',
  'LCOS_CAPTURE_STAGING_ROOT',
  'LCOS_OCR_RUNTIME_DIR',
  'LCOS_OCR_PYTHON',
  'LCOS_OLLAMA_URL',
  'LCOS_OLLAMA_EMBED_MODEL',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const report = {
  mode: 'real-core-runtime-with-network-denied-rest-bridge',
  originalUserDatabaseOpened: false,
  externalBridgeOrProviderStarted: false,
  preexistingBridgeHostEnvValuesInspected: false,
  coreManagedCaptureWatchStarted: true,
  coreCaptureWatchRuleCount: 0,
  projectWatcherStarted: false,
  autoSyncStarted: false,
  coreServerClosed: false,
  bridgeOriginConfigured: false,
  bridgeAttempts: [],
  cases: [],
}

let repository
let coreServer

try {
  const compositionEntry = path.join(runtimeRoot, 'runtime-composition.mjs')
  const coreEntry = path.join(runtimeRoot, 'local-core-index.mjs')
  await buildPilotEntry('lab/pilot/runtime-composition.ts', compositionEntry)
  await buildPilotEntry('lcos/apps/local-core/src/index.ts', coreEntry)

  const [compositionModule, core] = await Promise.all([
    import(pathToFileURL(compositionEntry).href),
    import(pathToFileURL(coreEntry).href),
  ])

  const databasePath = path.join(runtimeRoot, 'core.sqlite')
  const projectRoot = path.join(runtimeRoot, 'synthetic-project')
  repository = new core.SqliteMetadataRepository(databasePath, { disposableOnly: true })
  assert.equal(core.ensureMvpSampleProject(repository, projectRoot), true)
  const project = repository.getProject(String(core.MVP_SAMPLE_PROJECT_ID))
  assert.ok(project)
  const catalog = new core.ExplicitProjectCatalog([{
    id: project.id,
    name: project.name,
    rootPath: project.rootPath,
    graphVersion: project.graphVersion,
  }])
  assert.equal(repository.listCaptureWatchRules().length, 0)

  const runtime = compositionModule.createRuntimeComposition(repository)
  report.bridgeOriginConfigured = runtime.bridgeOriginConfigured
  assert.equal(runtime.bridgeOriginConfigured, false)
  assert.equal(runtime.coreServerOptions.metadataRepository, repository)
  assert.equal(runtime.coreServerOptions.runtimeApplicationService, runtime.runtimeApplicationService)
  assert.equal(Object.hasOwn(runtime.coreServerOptions, 'runtimeReviewService'), false,
    'HTTP Review writes must use the original Core composition with its shared sidecars')
  assert.deepEqual(Object.keys(runtime.runtimeReviewReader), ['getRunReview'],
    'the separate Application review read model exposes no decision mutation port')

  coreServer = core.createLocalCoreServer({
    ...runtime.coreServerOptions,
    catalog,
    port: 0,
    previewCacheRoot: path.join(runtimeRoot, 'preview-cache'),
    agentletsRoot: path.join(runtimeRoot, 'agentlets'),
    allowedOrigins: [],
  })
  const address = await coreServer.start()
  report.coreCaptureWatchRuleCount = repository.listCaptureWatchRules().length
  const origin = `http://${address.host}:${address.port}`

  const request = async (method, route, body) => {
    const response = await fetch(origin + route, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    })
    return { status: response.status, body: await response.json() }
  }

  const providers = await request('GET', '/runtime/providers')
  assert.equal(providers.status, 200, JSON.stringify(providers.body))
  assert.deepEqual(
    providers.body.value.map((item) => [item.provider, item.availability]),
    [['workbuddy', 'offline'], ['codex', 'offline'], ['auto', 'offline']],
  )
  report.cases.push('real /runtime/providers route reports offline from rejected capability fetch')

  const create = await request('POST', `/projects/${project.id}/runs`, {
    instruction: 'Read-only isolated runtime composition check',
    outputIntent: 'analyze',
    requestedProvider: 'workbuddy',
  })
  assert.equal(create.status, 201, JSON.stringify(create.body))
  const createdReview = create.body.value.review
  const runId = String(createdReview.run.id)
  assert.deepEqual(runtime.runtimeReviewReader.getRunReview(runId), createdReview)
  assert.equal(createdReview.run.status, 'created')
  assert.equal(createdReview.dispatch.status, 'planned')
  assert.equal(repository.getRuntimeBinding(runId), undefined)
  assert.equal(repository.getPendingRunInputRequest(runId), undefined)
  const inputPackPath = path.join(project.rootPath, '.creative-os', 'runtime', runId, 'runtime-input-pack.json')
  await assert.rejects(access(inputPackPath))
  report.cases.push('offline Run create writes only created/planned journal state and does not dispatch or materialize')

  const runList = await request('GET', `/projects/${project.id}/runs`)
  assert.equal(runList.status, 200, JSON.stringify(runList.body))
  assert.ok(runList.body.value.some((item) => String(item.run.id) === runId))
  const review = await request('GET', `/runs/${encodeURIComponent(runId)}/review`)
  assert.equal(review.status, 200, JSON.stringify(review.body))
  assert.equal(review.body.value.run.status, 'created')
  assert.equal(review.body.value.dispatch.status, 'planned')
  report.cases.push('real Core Run list and Review routes read the same repository journal')

  const eventAttemptsBefore = runtime.bridgeAttempts().length
  const event = await request('POST', '/runtime/provider-events', {
    contractVersion: 'provider-run-event-v1',
    type: 'waiting_input',
    correlation: { lcosRunId: runId, externalTaskId: 'unbound-external-task' },
    request: {
      requestId: 'isolated-input-request',
      prompt: 'This event must fail without a RuntimeBinding.',
      options: ['Continue'],
      allowFreeText: false,
    },
  })
  assert.equal(event.status, 409, JSON.stringify(event.body))
  assert.match(JSON.stringify(event.body), /RuntimeBinding was not found/)
  assert.equal(repository.getPendingRunInputRequest(runId), undefined)
  assert.equal(runtime.bridgeAttempts().length, eventAttemptsBefore)
  report.cases.push('unbound provider waiting_input event is rejected without creating an input journal row')

  const dispatch = await request('POST', `/runs/${encodeURIComponent(runId)}/dispatch`, {})
  assert.equal(dispatch.status, 200, JSON.stringify(dispatch.body))
  assert.equal(dispatch.body.value.providerError.code, 'BRIDGE_UNAVAILABLE')
  assert.equal(dispatch.body.value.providerError.message, 'isolated Bridge transport not configured')
  assert.equal(dispatch.body.value.review.run.status, 'created')
  assert.equal(dispatch.body.value.review.dispatch.status, 'recovery_required')
  assert.equal(dispatch.body.value.review.dispatch.attemptCount, 1)
  assert.equal(repository.getRuntimeBinding(runId), undefined)
  const inputPack = JSON.parse(await readFile(inputPackPath, 'utf8'))
  assert.equal(inputPack.lcosRunId, runId)
  assert.deepEqual(runtime.bridgeAttempts().map((url) => new URL(url).pathname), [
    '/v1/capabilities',
    '/v1/capabilities',
    '/v1/tasks',
  ])
  report.cases.push('explicit offline dispatch records one failed local attempt and input-pack, but no binding or running state')
  report.run = {
    id: runId,
    createHttpStatus: create.status,
    statusAfterCreate: createdReview.run.status,
    dispatchAfterCreate: createdReview.dispatch.status,
    statusAfterOfflineDispatch: dispatch.body.value.review.run.status,
    dispatchAfterOfflineDispatch: dispatch.body.value.review.dispatch.status,
    offlineDispatchError: dispatch.body.value.providerError,
    runtimeInputPackMaterializedByExplicitDispatch: true,
    runtimeBindingCreated: false,
  }
  report.bridgeAttempts = runtime.bridgeAttempts().map((url) => new URL(url).pathname)
  report.passed = true
} catch (error) {
  report.passed = false
  report.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  if (coreServer) {
    await coreServer.close()
    report.coreServerClosed = true
  }
  if (repository) repository.close()
  const runtimeRootResolved = path.resolve(runtimeRoot)
  assert.equal(path.dirname(runtimeRootResolved), path.resolve(runtimeBase))
  await rm(runtimeRootResolved, { recursive: true, force: true })
  await mkdir(path.join(root, 'evidence'), { recursive: true })
  await writeFile(path.join(root, 'evidence', 'runtime-composition.json'), JSON.stringify(report, null, 2) + '\n', 'utf8')
}

console.log(JSON.stringify(report, null, 2))
