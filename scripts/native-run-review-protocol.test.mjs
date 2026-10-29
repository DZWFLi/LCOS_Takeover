import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
await mkdir(runtimeBase, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(runtimeBase, 'native-run-review-protocol-'))

// This is a disposable Core with only the Review owner configured. Do not
// inherit any bridge/provider/host settings; this test never dispatches a Run.
for (const key of [
  'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LCOS_CODEX_AUTO_EXECUTION',
  'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT', 'HUABU_HOST_URL',
  'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN', 'HUABU_AGENTLET_ID',
  'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD',
  'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')

const report = {
  mode: 'exact Run/ArtifactReturn protocol routes with disposable Local Core',
  fixtureKind: 'explicit manual synthetic Review state; no model/Bridge/provider result',
  originalUserDatabaseOpened: false,
  providerOrBridgeStarted: false,
  dispatchCalled: false,
  nativeUiVerified: false,
  cases: [],
}

let repository
let coreServer
let coreOrigin
const forwardedRequests = []
const nativeFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = async (input, init) => {
  const address = input instanceof Request ? input.url : String(input)
  if (coreOrigin && address.startsWith(coreOrigin)) {
    forwardedRequests.push({
      method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
      url: new URL(address).pathname,
      body: init?.body,
    })
  }
  return nativeFetch(input, init)
}

async function directCore(method, pathname, body) {
  const response = await nativeFetch(coreOrigin + pathname, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}

function manifestFor(projectId, runId, targetArtifactId, targetRevisionId) {
  const canonicalJson = JSON.stringify({
    schemaVersion: 0,
    project: { id: projectId },
    fixtureRun: runId,
    targetArtifactId,
    targetRevisionId,
  })
  const manifestHash = createHash('sha256').update(canonicalJson).digest('hex')
  return {
    id: `manifest-${manifestHash}`,
    projectId,
    schemaVersion: 0,
    ...(targetArtifactId === undefined ? {} : { targetArtifactId }),
    ...(targetRevisionId === undefined ? {} : { targetRevisionId }),
    canonicalJson,
    manifestHash,
    createdAt: '2026-10-14T00:00:00.000Z',
  }
}

async function seedReviewRun({ projectId, projectRoot, target, runId, returnId, draftBody, action = 'created' }) {
  const now = '2026-10-14T00:00:00.000Z'
  const base = target?.currentRevisionId === undefined
    ? undefined
    : repository.getArtifactRevision(String(target.currentRevisionId))
  const manifest = manifestFor(projectId, runId, target?.id, base?.id)
  repository.createContextManifest(manifest)
  const run = {
    id: runId,
    projectId,
    contextManifestId: manifest.id,
    ...(target === undefined ? {} : { targetArtifactId: target.id, targetRevisionId: base?.id }),
    provider: 'workbuddy',
    requestedProvider: 'workbuddy',
    outputIntent: target === undefined ? 'create' : 'revise',
    returnGroupId: `return-group-${runId}`,
    status: 'running',
    instruction: 'Synthetic Review fixture; no provider result was produced.',
    createdAt: now,
    updatedAt: now,
  }
  const dispatch = {
    id: `dispatch-${runId}`,
    runId,
    provider: 'workbuddy',
    idempotencyKey: runId,
    status: 'bound',
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  repository.createRunWithDispatch(run, dispatch)

  const bytes = Buffer.from(draftBody, 'utf8')
  const contentHash = createHash('sha256').update(bytes).digest('hex')
  const returnedFileId = `file-${returnId}`
  const canonicalPath = path.join(projectRoot, '.creative-os', 'runtime', runId, 'staging', `${returnId}.md`)
  await mkdir(path.dirname(canonicalPath), { recursive: true })
  await writeFile(canonicalPath, bytes)
  const fileRecord = {
    id: returnedFileId,
    projectId,
    observedPath: canonicalPath,
    observedHash: contentHash,
    size: bytes.byteLength,
    modifiedAt: now,
    mimeType: 'text/markdown',
    availability: 'current',
    observedAt: now,
  }
  const artifactId = target?.id ?? `artifact-${returnId}`
  const draft = {
    id: `revision-${returnId}`,
    artifactId,
    fileRecordId: returnedFileId,
    ...(base === undefined ? {} : { parentRevisionId: base.id }),
    contentHash,
    source: 'run',
    runId,
    status: 'draft',
    createdAt: now,
  }
  const artifactReturn = {
    id: returnId,
    runId,
    targetArtifactId: artifactId,
    baseRevisionId: base?.id ?? draft.id,
    returnedFileId,
    contentHash,
    canonicalPath,
    action,
    status: 'pending_review',
    draftRevisionId: draft.id,
    createdAt: now,
    updatedAt: now,
  }

  if (target === undefined) {
    repository.createRuntimeCreatedArtifact(fileRecord, {
      id: artifactId,
      projectId,
      title: `Synthetic ${returnId}`,
      kind: 'document',
      availability: 'available',
      createdAt: now,
      updatedAt: now,
    }, draft, artifactReturn)
  } else {
    repository.createRuntimeDraft(fileRecord, draft, artifactReturn)
  }
  return { run, dispatch, target, base, draft, artifactReturn }
}

try {
  const coreEntry = path.join(runtimeRoot, 'local-core-index.mjs')
  const routerEntry = path.join(runtimeRoot, 'core-protocol-router.mjs')
  await buildPilotEntry('lcos/apps/local-core/src/index.ts', coreEntry)
  await buildPilotEntry('lab/pilot/core-protocol-router.ts', routerEntry)
  const [core, routerModule] = await Promise.all([
    import(pathToFileURL(coreEntry).href),
    import(pathToFileURL(routerEntry).href),
  ])

  repository = new core.SqliteMetadataRepository(path.join(runtimeRoot, 'core.sqlite'), { disposableOnly: true })
  const projectRoot = path.join(runtimeRoot, 'synthetic-project')
  const snapshot = core.createMvpSampleSnapshot(projectRoot)
  repository.save(snapshot)
  const projectId = String(snapshot.project.id)
  const localProjectRoot = String(snapshot.project.rootPath)
  const localTargets = snapshot.artifacts.slice(0, 3)
  const staleCase = await seedReviewRun({ projectId, projectRoot: localProjectRoot, target: localTargets[0],
    runId: 'run-review-stale', returnId: 'return-review-stale', draftBody: '# Manual stale-CAS draft' })
  const rejectCase = await seedReviewRun({ projectId, projectRoot: localProjectRoot, target: localTargets[1],
    runId: 'run-review-reject', returnId: 'return-review-reject', draftBody: '# Manual reject draft' })
  const retryCase = await seedReviewRun({ projectId, projectRoot: localProjectRoot, target: localTargets[2],
    runId: 'run-review-retry', returnId: 'return-review-retry', draftBody: '# Manual retry draft' })

  const foreignProjectId = 'disposable-foreign-review-project'
  const foreignRoot = path.join(runtimeRoot, 'foreign-project')
  await mkdir(foreignRoot, { recursive: true })
  repository.createProject({ id: foreignProjectId, name: 'Synthetic foreign project', rootPath: foreignRoot })
  const foreignCase = await seedReviewRun({ projectId: foreignProjectId, projectRoot: foreignRoot, target: undefined,
    runId: 'run-foreign-review', returnId: 'return-foreign-review', draftBody: '# Foreign synthetic draft', action: 'created' })

  coreServer = core.createLocalCoreServer({
    metadataRepository: repository,
    runtimeReviewService: new core.RuntimeReviewService(repository, () => '2026-10-14T00:01:00.000Z', () => 'synthetic-retry'),
    // Deliberately no RuntimeApplicationService: cancel/input routes can only
    // return Core's configured-unavailable response; no provider can run.
    port: 0,
    previewCacheRoot: path.join(runtimeRoot, 'preview-cache'),
    agentletsRoot: path.join(runtimeRoot, 'agentlets'),
    allowedOrigins: [],
  })
  const address = await coreServer.start()
  coreOrigin = `http://${address.host}:${address.port}`

  const isRunOwned = runId => String(repository.getRun(runId)?.projectId ?? '') === projectId
  const isArtifactReturnOwned = returnId => {
    const artifactReturn = repository.getArtifactReturn(returnId)
    const run = artifactReturn === undefined ? undefined : repository.getRun(artifactReturn.runId)
    return String(run?.projectId ?? '') === projectId
  }
  const router = routerModule.createCoreProtocolRouter({ coreOrigin, projectId, isRunOwned, isArtifactReturnOwned })
  const missingReturnOwnerRouter = routerModule.createCoreProtocolRouter({ coreOrigin, projectId, isRunOwned })
  const throwingReturnOwnerRouter = routerModule.createCoreProtocolRouter({ coreOrigin, projectId, isRunOwned,
    isArtifactReturnOwned: () => { throw new Error('synthetic ownership lookup failure') } })
  const call = (selectedRouter, method, pathname, body) => selectedRouter.handle({
    method,
    pathname: `/api/lcos/core${pathname}`,
    url: `${coreOrigin}/api/lcos/core${pathname}`,
    body,
  })

  const projectRunsPath = `/projects/${encodeURIComponent(projectId)}/runs`
  const staleReturnPath = `/artifact-returns/${encodeURIComponent(staleCase.artifactReturn.id)}`
  const originalCurrent = repository.getArtifact(String(staleCase.target.id)).currentRevisionId
  const staleAccept = await call(router, 'POST', `${staleReturnPath}/accept`, { expectedBaseRevisionId: 'revision-not-current' })
  assert.equal(staleAccept.status, 409, JSON.stringify(staleAccept.body))
  assert.equal(repository.getArtifact(String(staleCase.target.id)).currentRevisionId, originalCurrent,
    'stale Accept must leave Current untouched')
  assert.equal(repository.getArtifactReturn(staleCase.artifactReturn.id).status, 'pending_review')
  assert.equal(repository.getArtifactRevision(staleCase.draft.id).status, 'draft')

  const invalidAccept = await call(router, 'POST', `${staleReturnPath}/accept`, {})
  assert.equal(invalidAccept.status, 400, 'the original Core accept body validator remains authoritative')
  const accepted = await call(router, 'POST', `${staleReturnPath}/accept`, {
    expectedBaseRevisionId: String(staleCase.base.id),
  })
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
  assert.equal(accepted.body.value.artifactReturn.status, 'adopted')
  assert.equal(repository.getArtifact(String(staleCase.target.id)).currentRevisionId, staleCase.draft.id)
  report.cases.push('owned Accept passes the original expectedBaseRevisionId body to Core; stale CAS and invalid body do not mutate Current, valid Accept uses the original owner')

  const rejectReturnPath = `/artifact-returns/${encodeURIComponent(rejectCase.artifactReturn.id)}`
  const rejectCurrent = repository.getArtifact(String(rejectCase.target.id)).currentRevisionId
  const rejected = await call(router, 'POST', `${rejectReturnPath}/reject`)
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body))
  assert.equal(rejected.body.value.artifactReturn.status, 'rejected')
  assert.equal(rejected.body.value.draftRevision.status, 'draft', 'Reject retains auditable draft evidence')
  assert.equal(repository.getArtifact(String(rejectCase.target.id)).currentRevisionId, rejectCurrent,
    'Reject must not change Current')

  const retryReturnPath = `/artifact-returns/${encodeURIComponent(retryCase.artifactReturn.id)}`
  const retry = await call(router, 'POST', `${retryReturnPath}/retry`, { instruction: 'Synthetic retry instruction' })
  assert.equal(retry.status, 201, JSON.stringify(retry.body))
  assert.equal(retry.body.value.previousReturn.status, 'rejected')
  assert.equal(retry.body.value.previousRun.status, 'completed')
  assert.equal(retry.body.value.run.status, 'created')
  assert.equal(retry.body.value.dispatch.status, 'planned')
  assert.equal(retry.body.value.run.instruction, 'Synthetic retry instruction', 'retry instruction is passed through to the original producer')
  assert.equal(repository.getRuntimeBinding(String(retry.body.value.run.id)), undefined)
  assert.equal(forwardedRequests.some(row => row.url.endsWith('/dispatch') || row.url.endsWith('/sync') || row.url.endsWith('/recover')), false)
  report.cases.push('Reject retains Draft and Current; Retry uses the original optional-instruction body and creates only a created/planned journal')

  const noForwardCount = forwardedRequests.length
  const unknownReturn = await call(router, 'POST', '/artifact-returns/return-unknown/accept', { expectedBaseRevisionId: 'anything' })
  assert.equal(unknownReturn.status, 404)
  assert.equal(unknownReturn.body.error.code, 'ARTIFACT_RETURN_NOT_FOUND')
  const foreignReturnPath = `/artifact-returns/${encodeURIComponent(foreignCase.artifactReturn.id)}/accept`
  const foreignReturn = await call(router, 'POST', foreignReturnPath, { expectedBaseRevisionId: foreignCase.artifactReturn.baseRevisionId })
  assert.equal(foreignReturn.status, 404)
  assert.equal(foreignReturn.body.error.code, 'ARTIFACT_RETURN_NOT_FOUND')
  assert.equal(repository.getArtifactReturn(foreignCase.artifactReturn.id).status, 'pending_review')
  const missingOwner = await call(missingReturnOwnerRouter, 'POST', `${retryReturnPath}/accept`, {
    expectedBaseRevisionId: String(retryCase.base.id),
  })
  assert.equal(missingOwner.status, 503)
  assert.equal(missingOwner.body.error.code, 'ARTIFACT_RETURN_OWNERSHIP_UNAVAILABLE')
  const ownerError = await call(throwingReturnOwnerRouter, 'POST', `${retryReturnPath}/accept`, {
    expectedBaseRevisionId: String(retryCase.base.id),
  })
  assert.equal(ownerError.status, 503)
  assert.equal(ownerError.body.error.code, 'ARTIFACT_RETURN_OWNERSHIP_UNAVAILABLE')
  assert.equal(forwardedRequests.length, noForwardCount, 'unknown/foreign/missing/failed owner checks do not reach Core')
  report.cases.push('unknown and real foreign-project ArtifactReturns return 404; missing or failing owner callback returns 503 before Core forwarding')

  const reviewPath = `/runs/${encodeURIComponent(rejectCase.run.id)}/review`
  const reviewViaRouter = await call(router, 'GET', reviewPath)
  const reviewDirect = await directCore('GET', reviewPath)
  assert.equal(reviewViaRouter.status, 200)
  assert.deepEqual(reviewViaRouter, reviewDirect, 'existing Review GET keeps the original Core envelope')
  const recipePath = `/runs/${encodeURIComponent(rejectCase.run.id)}/recipe`
  const recipeViaRouter = await call(router, 'GET', recipePath)
  assert.equal(recipeViaRouter.status, 200, JSON.stringify(recipeViaRouter.body))
  assert.equal(recipeViaRouter.body.value.runId, rejectCase.run.id)
  assert.equal(recipeViaRouter.body.value.projectId, projectId)
  const runList = await call(router, 'GET', projectRunsPath)
  const runListDirect = await directCore('GET', projectRunsPath)
  assert.equal(runList.status, 503, 'this fixture deliberately omits RuntimeApplicationService')
  assert.deepEqual(runList, runListDirect, 'the existing Run list route keeps the original unavailable response')
  assert.equal((await call(router, 'POST', `/runs/${encodeURIComponent(rejectCase.run.id)}/dispatch`, {})).status, 501,
    'dispatch remains intentionally unregistered')
  assert.equal((await call(router, 'POST', `/runs/${encodeURIComponent(rejectCase.run.id)}/sync`, {})).status, 501)
  assert.equal((await call(router, 'POST', `/runs/${encodeURIComponent(rejectCase.run.id)}/recover`, {})).status, 501)
  report.cases.push('Review/Recipe reads remain routed; Run list preserves Core unavailability without RuntimeApplicationService; dispatch/sync/recover stay blocked')

  const cancelPath = `/runs/${encodeURIComponent(rejectCase.run.id)}/cancel`
  const cancelViaRouter = await call(router, 'POST', cancelPath)
  const cancelDirect = await directCore('POST', cancelPath)
  assert.equal(cancelViaRouter.status, 503, 'the real Core cancellation owner is not configured in this no-provider fixture')
  assert.deepEqual(cancelViaRouter, cancelDirect, 'cancel path is forwarded without fabricating an unavailable owner')
  const answerPath = `/runs/${encodeURIComponent(rejectCase.run.id)}/input-request`
  const answerBody = { requestId: 'synthetic-not-pending', text: 'manual answer' }
  const answerViaRouter = await call(router, 'POST', answerPath, answerBody)
  const answerDirect = await directCore('POST', answerPath, answerBody)
  assert.equal(answerViaRouter.status, 503, 'the answer owner remains unconfigured; no provider is started')
  assert.deepEqual(answerViaRouter, answerDirect, 'input answer body and Core status/envelope are forwarded unchanged')
  const forwardedAnswer = forwardedRequests.findLast(row => row.method === 'POST' && row.url === answerPath)
  assert.equal(forwardedAnswer?.body, JSON.stringify(answerBody), 'the adapter must not rewrite requestId/text/selectedOptions')
  assert.equal((await call(router, 'POST', '/runs/foreign-run/cancel')).status, 404)
  assert.equal((await call(router, 'POST', '/runs/foreign-run/input-request', answerBody)).status, 404)
  report.cases.push('cancel and input-answer use owned Run routes with unchanged empty/JSON requests; Core unavailability stays honest and foreign Run IDs are rejected')

  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error.stack
  throw error
} finally {
  globalThis.fetch = nativeFetch
  await coreServer?.close()
  repository?.close()
  if (!path.resolve(runtimeRoot).startsWith(path.resolve(runtimeBase) + path.sep)
    || !path.basename(runtimeRoot).startsWith('native-run-review-protocol-')) {
    throw new Error('Disposable cleanup target escaped the intended runtime directory; preserved.')
  }
  await rm(runtimeRoot, { recursive: true, force: true })
}

console.log(JSON.stringify(report, null, 2))
