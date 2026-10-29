import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
const reportDir = path.join(runtimeBase, 'native-review-result-slot')
const runTag = new Date().toISOString().replace(/[:.]/g, '-')
const reportPath = path.join(reportDir, `${runTag}.json`)
const expectUnwired = process.argv.includes('--expect-unwired')

await mkdir(reportDir, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(reportDir, 'native-review-result-slot-case-'))

// This is an isolated disposable Core. Clear integration variables by name only;
// never inspect or inherit an existing host URL, token, user DB, or provider key.
for (const key of [
  'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LCOS_CODEX_AUTO_EXECUTION',
  'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT', 'HUABU_HOST_URL',
  'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN', 'HUABU_AGENTLET_ID',
  'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD',
  'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON',
  'LCOS_OLLAMA_URL', 'LCOS_OLLAMA_EMBED_MODEL',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
// Semantic reindex may run fire-and-forget after Accept. Pin Ollama to an
// unusable loopback port; the fetch firewall below also blocks every non-Core origin.
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const report = {
  at: new Date().toISOString(),
  mode: expectUnwired ? '--expect-unwired diagnostic' : 'ResultSlot Accept regression',
  fixtureKind: 'manual synthetic ArtifactReturn; explicitly not a model/provider result',
  originalUserDatabaseOpened: false,
  oldEnvironmentValuesRead: false,
  providerOrBridgeStarted: false,
  dispatchCalled: false,
  externalFetchesAllowed: false,
  runtimeRoot,
  reportPath,
  requestedProvider: 'workbuddy (fixed test fixture; not a user choice)',
  semanticIndex: { status: 'not-checked-yet' },
  cases: [],
}

let repository
let repositoryAfterRestart
let coreServer
let coreServerAfterRestart
let compositionModule
let core
let runtime
let runtimeAfterRestart
let coreOrigin
let coreOriginAfterRestart
const deniedFetches = []
const coreRequests = []
const nativeFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = async (input, init) => {
  const address = input instanceof Request ? input.url : String(input)
  const parsed = new URL(address)
  const allowedOrigin = parsed.origin === coreOrigin || parsed.origin === coreOriginAfterRestart
  if (!allowedOrigin) {
    deniedFetches.push({ method: init?.method ?? (input instanceof Request ? input.method : 'GET'), origin: parsed.origin, path: parsed.pathname })
    throw new Error('native ResultSlot test blocked all non-isolated-Core fetches')
  }
  return nativeFetch(input, init)
}

async function coreRequest(origin, method, pathname, body) {
  const response = await globalThis.fetch(origin + pathname, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  })
  const text = await response.text()
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = { nonJsonBody: text.slice(0, 240) } }
  coreRequests.push({ method, path: pathname, status: response.status })
  return { status: response.status, body: parsed }
}

function values(snapshot, key) {
  const value = snapshot?.[key]
  assert.ok(Array.isArray(value), `Expected ProjectGraphSnapshot.${key} array`)
  return value
}

function byId(rows, id, label) {
  const matches = rows.filter((item) => String(item.id) === String(id))
  assert.equal(matches.length, 1, `${label} must resolve exactly once`)
  return matches[0]
}

function idSet(rows) {
  return new Set(rows.map((item) => String(item.id)))
}

function changedRows(beforeRows, afterRows) {
  const beforeIds = idSet(beforeRows)
  return afterRows.filter((row) => !beforeIds.has(String(row.id)))
}

async function createServerFor(selectedRepository, selectedRuntime) {
  const snapshot = selectedRepository.get(String(core.MVP_SAMPLE_PROJECT_ID))
  assert.ok(snapshot, 'The disposable Core sample project must remain readable')
  const catalog = new core.ExplicitProjectCatalog([{
    id: snapshot.project.id,
    name: snapshot.project.name,
    rootPath: snapshot.project.rootPath,
    graphVersion: snapshot.project.graphVersion,
  }])
  const server = core.createLocalCoreServer({
    ...selectedRuntime.coreServerOptions,
    catalog,
    port: 0,
    previewCacheRoot: path.join(runtimeRoot, 'preview-cache'),
    agentletsRoot: path.join(runtimeRoot, 'agentlets'),
    allowedOrigins: [],
  })
  const address = await server.start()
  return { server, origin: `http://${address.host}:${address.port}`, snapshot }
}

async function waitForSemanticIndex(repo, projectId, artifactId, marker) {
  // RuntimeReviewService.accept intentionally starts indexing without awaiting it.
  // Poll only the disposable repository, with a small bound; do not wait for or
  // fabricate an embedding/vector result.
  const attempts = 80
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const document = repo.getSearchDocument(projectId, 'artifact', artifactId)
    const chunks = repo.getSearchDocumentChunkPlan(artifactId)
    const hit = repo.searchDocumentsFts(projectId, marker, 10)
      .some((item) => String(item.entityId) === artifactId && item.body.includes(marker))
    if (document !== undefined && chunks.length > 0 && hit) {
      return { status: 'fts-document-and-chunk-plan-read-back', attempts: attempt,
        chunkCount: chunks.length, markerFound: true, vectorsClaimed: false }
    }
    await new Promise((resolve) => setTimeout(resolve, 12))
  }
  return { status: 'not-observed-within-bounded-read-window', attempts, markerFound: false,
    vectorsClaimed: false }
}

try {
  const compositionEntry = path.join(runtimeRoot, 'runtime-composition.mjs')
  const coreEntry = path.join(runtimeRoot, 'local-core-index.mjs')
  await buildPilotEntry('lab/pilot/runtime-composition.ts', compositionEntry)
  await buildPilotEntry('lcos/apps/local-core/src/index.ts', coreEntry)
  ;[compositionModule, core] = await Promise.all([
    import(pathToFileURL(compositionEntry).href),
    import(pathToFileURL(coreEntry).href),
  ])

  const databasePath = path.join(runtimeRoot, 'core.sqlite')
  const projectRoot = path.join(runtimeRoot, 'synthetic-project')
  repository = new core.SqliteMetadataRepository(databasePath, { disposableOnly: true })
  assert.equal(core.ensureMvpSampleProject(repository, projectRoot), true)
  const projectId = String(core.MVP_SAMPLE_PROJECT_ID)
  const project = repository.getProject(projectId)
  assert.ok(project)
  const seedSnapshot = repository.get(projectId)
  assert.ok(seedSnapshot)
  const workspace = seedSnapshot.workspaces.find((item) => item.preferredSurface === 'main')
    ?? seedSnapshot.workspaces[0]
  assert.ok(workspace?.scopeId, 'Use a real scope/workspace from the Core sample project')
  assert.equal(String(workspace.projectId), projectId)
  assert.equal(repository.listCaptureWatchRules().length, 0, 'The isolated fixture must not inherit capture watchers')

  runtime = compositionModule.createRuntimeComposition(repository)
  assert.equal(runtime.bridgeOriginConfigured, false)
  assert.equal(runtime.coreServerOptions.metadataRepository, repository)
  assert.equal(runtime.coreServerOptions.runtimeApplicationService, runtime.runtimeApplicationService)
  report.project = { id: projectId, workspaceId: String(workspace.id), workspaceName: workspace.name,
    scopeId: String(workspace.scopeId), rootPathIsDisposable: path.resolve(project.rootPath).startsWith(path.resolve(runtimeRoot) + path.sep) }
  assert.equal(report.project.rootPathIsDisposable, true)

  const first = await createServerFor(repository, runtime)
  coreServer = first.server
  coreOrigin = first.origin
  const projectPath = `/projects/${encodeURIComponent(projectId)}`
  const slotPosition = { x: 318.25, y: 227.75 }
  const slotSize = { width: 321, height: 207 }
  const slotResponse = await coreRequest(coreOrigin, 'POST', `${projectPath}/result-slots`, {
    scopeId: String(workspace.scopeId),
    workspaceId: String(workspace.id),
    ...slotPosition,
    ...slotSize,
  })
  assert.equal(slotResponse.status, 201, JSON.stringify(slotResponse.body))
  assert.equal(slotResponse.body.ok, true)
  const slot = slotResponse.body.value
  assert.equal(slot.projectId, projectId)
  assert.equal(slot.scopeId, String(workspace.scopeId))
  assert.equal(slot.workspaceId, String(workspace.id))
  assert.deepEqual(slot.position, slotPosition)
  assert.deepEqual(slot.size, slotSize)
  assert.equal(slot.status, 'empty')
  report.resultSlot = { id: slot.id, statusAfterCreate: slot.status, position: slot.position, size: slot.size,
    workspaceId: slot.workspaceId, scopeId: slot.scopeId }
  report.cases.push({ name: 'Core HTTP creates a real ResultSlot in the sample workspace/scope', passed: true })

  const runResponse = await coreRequest(coreOrigin, 'POST', `${projectPath}/runs`, {
    instruction: 'Manual Review fixture only. No model, Bridge task, or provider result was produced.',
    outputIntent: 'create',
    workspaceId: String(workspace.id),
    requestedProvider: 'workbuddy',
    resultSlotId: String(slot.id),
  })
  assert.equal(runResponse.status, 201, JSON.stringify(runResponse.body))
  const createdReview = runResponse.body.value.review
  const runId = String(createdReview.run.id)
  assert.equal(createdReview.run.projectId, projectId)
  assert.equal(createdReview.run.status, 'created')
  assert.equal(createdReview.dispatch.status, 'planned')
  assert.equal(createdReview.dispatch.attemptCount, 0)
  assert.equal(repository.getRunResultSlotId(runId), String(slot.id))
  const claimedSlot = repository.getResultSlot(String(slot.id))
  assert.equal(claimedSlot?.status, 'running')
  assert.equal(claimedSlot?.runId, runId)
  report.run = { id: runId, status: createdReview.run.status, dispatch: createdReview.dispatch.status,
    dispatchAttempts: createdReview.dispatch.attemptCount, resultSlotId: repository.getRunResultSlotId(runId),
    providerExecution: false }
  report.cases.push({ name: 'Core HTTP creates only a created/planned Run and claims the slot; no dispatch', passed: true })

  // Explicitly handcrafted manual fixture using the repository's real ingestion
  // boundary. It is not a claimed Bridge binding or a model-produced result.
  const marker = `manual-result-slot-fixture-${randomUUID()}`
  const now = new Date().toISOString()
  const artifactId = `artifact-${marker}`
  const revisionId = `revision-${marker}`
  const returnId = `return-${marker}`
  const fileRecordId = `file-${marker}`
  const content = Buffer.from(`# ${marker}\n\nManual synthetic Review fixture. This is not a model or provider output.\n`, 'utf8')
  const contentHash = createHash('sha256').update(content).digest('hex')
  const canonicalPath = path.join(project.rootPath, '.creative-os', 'runtime', runId, 'staging', `${marker}.md`)
  assert.ok(path.resolve(canonicalPath).startsWith(path.resolve(project.rootPath) + path.sep))
  await mkdir(path.dirname(canonicalPath), { recursive: true })
  await writeFile(canonicalPath, content)
  const fileRecord = {
    id: fileRecordId, projectId, observedPath: canonicalPath, observedHash: contentHash,
    size: content.byteLength, modifiedAt: now, mimeType: 'text/markdown',
    availability: 'current', observedAt: now,
  }
  const artifact = {
    id: artifactId, projectId, title: `Manual fixture — not a model result (${marker})`,
    kind: 'markdown', availability: 'available', createdAt: now, updatedAt: now,
  }
  const draftRevision = {
    id: revisionId, artifactId, fileRecordId, contentHash, source: 'run', runId,
    status: 'draft', createdAt: now,
  }
  const artifactReturn = {
    id: returnId, runId, targetArtifactId: artifactId, baseRevisionId: revisionId,
    returnedFileId: fileRecordId, contentHash, canonicalPath, action: 'created',
    status: 'pending_review', draftRevisionId: revisionId, createdAt: now, updatedAt: now,
  }
  repository.createRuntimeCreatedArtifact(fileRecord, artifact, draftRevision, artifactReturn)
  assert.equal(repository.getRuntimeBinding(runId), undefined, 'Manual fixture must not claim a Bridge binding')
  assert.equal(repository.getArtifactReturn(returnId)?.status, 'pending_review')
  assert.equal(repository.getArtifactRevision(revisionId)?.status, 'draft')
  report.manualFixture = { method: 'SqliteMetadataRepository.createRuntimeCreatedArtifact', artifactId,
    revisionId, artifactReturnId: returnId, explicitNotModel: true, runtimeBinding: false }
  report.cases.push({ name: 'Manual ArtifactReturn is inserted through Core repository API and labeled non-model', passed: true })

  const reviewPath = `/runs/${encodeURIComponent(runId)}/review`
  const beforeReview = await coreRequest(coreOrigin, 'GET', reviewPath)
  assert.equal(beforeReview.status, 200, JSON.stringify(beforeReview.body))
  assert.equal(beforeReview.body.value.returns.length, 1)
  assert.equal(beforeReview.body.value.returns[0].id, returnId)
  assert.equal(beforeReview.body.value.returns[0].status, 'pending_review')

  const beforeAccept = repository.get(projectId)
  assert.ok(beforeAccept)
  const slotPath = `/result-slots/${encodeURIComponent(String(slot.id))}`
  const staleAccept = await coreRequest(coreOrigin, 'POST', `/artifact-returns/${encodeURIComponent(returnId)}/accept`, {
    expectedBaseRevisionId: `stale-${revisionId}`,
  })
  assert.equal(staleAccept.status, 409, JSON.stringify(staleAccept.body))
  assert.equal(repository.getArtifactReturn(returnId)?.status, 'pending_review')
  assert.equal(repository.getArtifact(artifactId)?.currentRevisionId, undefined)
  assert.equal(repository.getArtifactRevision(revisionId)?.status, 'draft')
  assert.equal(repository.getResultSlot(String(slot.id))?.status, 'running')
  const afterStale = repository.get(projectId)
  assert.ok(afterStale)
  assert.deepEqual(afterStale.artifacts, beforeAccept.artifacts, 'Stale Accept must not change artifact truth')
  assert.deepEqual(afterStale.artifactRevisions, beforeAccept.artifactRevisions, 'Stale Accept must not promote the Draft')
  assert.deepEqual(afterStale.artifactViews, beforeAccept.artifactViews, 'Stale Accept must not materialize a view')
  report.cases.push({ name: 'HTTP stale Accept returns 409 and leaves Current, slot, and material graph untouched', passed: true })

  const changeSetsBefore = repository.listMutationChangeSets(projectId, 200)
  const changeSetIdsBefore = idSet(changeSetsBefore)
  const accepted = await coreRequest(coreOrigin, 'POST', `/artifact-returns/${encodeURIComponent(returnId)}/accept`, {
    expectedBaseRevisionId: revisionId,
  })
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
  assert.equal(accepted.body.ok, true)
  assert.equal(accepted.body.value.artifactReturn.status, 'adopted')
  assert.equal(String(accepted.body.value.artifactReturn.id), returnId)
  assert.equal(String(accepted.body.value.currentRevision.id), revisionId)
  assert.equal(String(repository.getArtifact(artifactId)?.currentRevisionId), revisionId)
  assert.equal(repository.getArtifactRevision(revisionId)?.status, 'current')

  const materializedSlot = repository.getResultSlot(String(slot.id))
  assert.equal(materializedSlot?.status, 'materialized')
  assert.equal(materializedSlot?.runId, runId)
  assert.equal(materializedSlot?.artifactId, artifactId)
  assert.ok(materializedSlot?.artifactViewId)
  const view = repository.getArtifactView(String(materializedSlot.artifactViewId))
  assert.ok(view)
  assert.equal(String(view.artifactId), artifactId)
  assert.equal(String(view.revisionId), revisionId)
  assert.equal(String(view.scopeId), String(workspace.scopeId))
  assert.deepEqual(view.position, slotPosition)
  assert.deepEqual(view.size, slotSize)
  const workspaceAfterAccept = repository.getWorkspace(String(workspace.id))
  assert.ok(workspaceAfterAccept)
  assert.ok(workspaceAfterAccept.focusedViewIds.includes(String(view.id)), 'The selected target workspace must focus the materialized view')

  const afterAccept = repository.get(projectId)
  assert.ok(afterAccept)
  assert.equal(afterAccept.graphVersion, beforeAccept.graphVersion + 1, 'Accept may advance the project graph only once')
  assert.deepEqual(afterAccept.scopes, beforeAccept.scopes)
  assert.deepEqual(afterAccept.relations, beforeAccept.relations)
  assert.deepEqual(afterAccept.notes, beforeAccept.notes)
  const preExistingArtifacts = beforeAccept.artifacts.filter((row) => String(row.id) !== artifactId)
  assert.deepEqual(afterAccept.artifacts.filter((row) => String(row.id) !== artifactId), preExistingArtifacts,
    'No pre-existing Artifact may be changed by a new-result Accept')
  const acceptedArtifact = byId(afterAccept.artifacts, artifactId, 'manually seeded Artifact')
  const fixtureArtifactBeforeAccept = byId(beforeAccept.artifacts, artifactId, 'manually seeded Artifact before Accept')
  const { currentRevisionId: _beforeCurrentRevisionId, updatedAt: _beforeArtifactUpdatedAt, ...fixtureArtifactFieldsBefore } = fixtureArtifactBeforeAccept
  const { currentRevisionId: _afterCurrentRevisionId, updatedAt: _afterArtifactUpdatedAt, ...fixtureArtifactFieldsAfter } = acceptedArtifact
  assert.deepEqual(fixtureArtifactFieldsAfter, fixtureArtifactFieldsBefore,
    'Accept may only update the fixture Artifact Current/timestamp and its birth-Run provenance')
  assert.equal(acceptedArtifact.title, fixtureArtifactBeforeAccept.title)
  assert.equal(acceptedArtifact.projectId, fixtureArtifactBeforeAccept.projectId)
  assert.equal(acceptedArtifact.currentRevisionId, revisionId)
  assert.ok(Date.parse(acceptedArtifact.updatedAt) >= Date.parse(fixtureArtifactBeforeAccept.updatedAt))
  assert.equal(repository.getArtifactBirthRunId(artifactId), runId, 'New artifact must retain its canonical birth Run')
  assert.deepEqual(afterAccept.artifactRevisions.filter((row) => String(row.id) !== revisionId),
    beforeAccept.artifactRevisions.filter((row) => String(row.id) !== revisionId),
    'No pre-existing Revision may be changed')
  assert.deepEqual(afterAccept.fileRecords, beforeAccept.fileRecords, 'Accept must not create or rewrite a FileRecord')
  assert.deepEqual(afterAccept.artifactViews.filter((row) => String(row.id) !== String(view.id)), beforeAccept.artifactViews,
    'No pre-existing ArtifactView may be repointed or changed')
  const changedWorkspaces = afterAccept.workspaces.filter((row) => {
    const previous = beforeAccept.workspaces.find((item) => String(item.id) === String(row.id))
    return previous === undefined || JSON.stringify(previous) !== JSON.stringify(row)
  })
  assert.equal(changedWorkspaces.length, 1, 'Only the ResultSlot target workspace may change')
  assert.equal(String(changedWorkspaces[0].id), String(workspace.id))
  assert.deepEqual(changedWorkspaces[0].focusedViewIds,
    [...workspace.focusedViewIds, String(view.id)], 'The workspace change is limited to focusing the new view')
  const newRevisions = changedRows(beforeAccept.artifactRevisions, afterAccept.artifactRevisions)
  const newFiles = changedRows(beforeAccept.fileRecords, afterAccept.fileRecords)
  const newViews = changedRows(beforeAccept.artifactViews, afterAccept.artifactViews)
  assert.deepEqual(changedRows(beforeAccept.artifacts, afterAccept.artifacts), [], 'Accept must not create another Artifact')
  assert.deepEqual(newRevisions, [], 'Accept must not create another Revision')
  assert.deepEqual(newFiles, [], 'Accept must not create another FileRecord')
  assert.deepEqual(newViews.map((row) => String(row.id)), [String(view.id)])

  const changeSetsAfterAccept = repository.listMutationChangeSets(projectId, 200)
  const newChangeSets = changeSetsAfterAccept.filter((row) => !changeSetIdsBefore.has(String(row.id)))
  report.changeSet = { expectedMode: expectUnwired ? 'unwired diagnostic: zero ChangeSets' : 'wired regression: one result_slot_materialize ChangeSet',
    ids: newChangeSets.map((row) => row.id), changes: newChangeSets.flatMap((row) => row.changes.map((change) => change.type)) }
  if (expectUnwired) {
    assert.equal(newChangeSets.length, 0, 'Current baseline should materialize in the repository but have no Review ChangeSet')
  } else {
    assert.equal(newChangeSets.length, 1, 'Accept must add exactly one Review ChangeSet')
    assert.equal(newChangeSets[0].operationId, `run-accept-${returnId}`)
    assert.equal(newChangeSets[0].status, 'applied')
    assert.equal(newChangeSets[0].changes.length, 1)
    assert.equal(newChangeSets[0].changes[0].type, 'result_slot_materialize')
    assert.equal(newChangeSets[0].changes[0].slotId, String(slot.id))
    assert.equal(newChangeSets[0].changes[0].runId, runId)
    assert.equal(newChangeSets[0].changes[0].artifactViewId, String(view.id))
  }
  report.materialized = { resultSlotId: slot.id, artifactId, artifactViewId: view.id,
    acceptedRevisionId: revisionId, position: view.position, size: view.size,
    workspaceId: workspace.id, workspaceNowFocusesView: workspaceAfterAccept.focusedViewIds.includes(String(view.id)),
    unrelatedMaterialsUnchanged: true }
  report.cases.push({ name: 'Valid HTTP Accept uses the existing ResultSlot and precise accepted ArtifactView; accounting matches mode', passed: true })

  const semanticResult = expectUnwired
    ? { status: 'not-attached-in-unwired-diagnostic', attempts: 0, markerFound: false, vectorsClaimed: false }
    : await waitForSemanticIndex(repository, projectId, artifactId, marker)
  if (!expectUnwired) {
    assert.equal(semanticResult.markerFound, true, 'The default Core Review writer must reindex the accepted Markdown into local FTS')
    assert.ok(semanticResult.chunkCount > 0, 'The accepted body must have an actual chunk plan, not a fake search badge')
  }
  report.semanticIndex = { ...semanticResult,
    externalEmbeddingCallsBlocked: deniedFetches.some((item) => item.origin !== coreOrigin),
    vectorsClaimed: false }

  const changesBeforeDuplicate = repository.listMutationChangeSets(projectId, 200)
  const duplicateAccept = await coreRequest(coreOrigin, 'POST', `/artifact-returns/${encodeURIComponent(returnId)}/accept`, {
    expectedBaseRevisionId: revisionId,
  })
  assert.equal(duplicateAccept.status, 409, JSON.stringify(duplicateAccept.body))
  assert.equal(repository.getArtifactReturn(returnId)?.status, 'adopted')
  assert.equal(repository.getResultSlot(String(slot.id))?.artifactViewId, String(view.id))
  assert.deepEqual(repository.listMutationChangeSets(projectId, 200), changesBeforeDuplicate,
    'Repeated Accept must neither materialize again nor add another ChangeSet')
  assert.equal(repository.getArtifactViews(artifactId).filter((item) => String(item.revisionId) === revisionId).length, 1)
  report.cases.push({ name: 'Repeated HTTP Accept is rejected and does not duplicate view or ChangeSet', passed: true })

  const bridgePathsBeforeRestart = runtime.bridgeAttempts().map((item) => new URL(item).pathname)
  assert.equal(bridgePathsBeforeRestart.includes('/v1/tasks'), false)
  assert.equal(coreRequests.filter((item) => item.method === 'POST' && item.path.endsWith('/dispatch')).length, 0)
  assert.equal(repository.getRuntimeBinding(runId), undefined)
  report.bridgePathsBeforeRestart = bridgePathsBeforeRestart

  await coreServer.close()
  coreServer = undefined
  repository.close()
  repository = undefined
  repositoryAfterRestart = new core.SqliteMetadataRepository(databasePath, { disposableOnly: true })
  const persistedSlot = repositoryAfterRestart.getResultSlot(String(slot.id))
  const persistedArtifact = repositoryAfterRestart.getArtifact(artifactId)
  const persistedRevision = repositoryAfterRestart.getArtifactRevision(revisionId)
  const persistedView = repositoryAfterRestart.getArtifactView(String(view.id))
  const persistedWorkspace = repositoryAfterRestart.getWorkspace(String(workspace.id))
  assert.equal(persistedSlot?.status, 'materialized')
  assert.equal(persistedSlot?.artifactId, artifactId)
  assert.equal(persistedSlot?.artifactViewId, String(view.id))
  assert.equal(persistedArtifact?.currentRevisionId, revisionId)
  assert.equal(persistedRevision?.status, 'current')
  assert.equal(String(persistedView?.revisionId), revisionId)
  assert.deepEqual(persistedView?.position, slotPosition)
  assert.deepEqual(persistedView?.size, slotSize)
  assert.equal(String(persistedWorkspace?.id), String(workspace.id))
  assert.ok(persistedWorkspace?.focusedViewIds.includes(String(view.id)))

  runtimeAfterRestart = compositionModule.createRuntimeComposition(repositoryAfterRestart)
  const restarted = await createServerFor(repositoryAfterRestart, runtimeAfterRestart)
  coreServerAfterRestart = restarted.server
  coreOriginAfterRestart = restarted.origin
  const persistedSlotRead = await coreRequest(coreOriginAfterRestart, 'GET', slotPath)
  const persistedReviewRead = await coreRequest(coreOriginAfterRestart, 'GET', reviewPath)
  assert.equal(persistedSlotRead.status, 200, JSON.stringify(persistedSlotRead.body))
  assert.equal(persistedSlotRead.body.value.id, String(slot.id))
  assert.equal(persistedReviewRead.status, 200, JSON.stringify(persistedReviewRead.body))
  assert.equal(persistedReviewRead.body.value.run.id, runId)
  assert.equal(persistedReviewRead.body.value.run.status, 'completed')
  assert.equal(persistedReviewRead.body.value.returns[0].id, returnId)
  assert.equal(persistedReviewRead.body.value.returns[0].status, 'adopted')
  assert.equal(runtimeAfterRestart.bridgeAttempts().length, 0, 'Reopen/readback must not contact Bridge')
  report.reopen = { repositoryReopened: true, coreServerReopenedOnEphemeralLoopback: true,
    sameResultSlotId: persistedSlotRead.body.value.id, sameRunId: persistedReviewRead.body.value.run.id,
    sameArtifactId: persistedSlotRead.body.value.artifactId, sameArtifactViewId: persistedSlotRead.body.value.artifactViewId,
    sameAcceptedRevisionId: persistedArtifact.currentRevisionId, sameWorkspaceId: workspace.id,
    bridgeAttemptsDuringReadback: runtimeAfterRestart.bridgeAttempts().length }
  report.cases.push({ name: 'Closed/reopened disposable repository and Core read the same slot, Run, ArtifactView, and Current revision', passed: true })

  assert.equal(runtime.bridgeAttempts().some((item) => new URL(item).pathname === '/v1/tasks'), false)
  assert.equal(runtimeAfterRestart.bridgeAttempts().length, 0)
  report.providerExecution = false
  report.bridgeFetchesRejected = true
  report.deniedFetches = deniedFetches
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error instanceof Error ? error.stack : String(error)
} finally {
  globalThis.fetch = nativeFetch
  for (const [label, server] of [['primary', coreServer], ['reopened', coreServerAfterRestart]]) {
    if (server) {
      try {
        await server.close()
        report[`${label}CoreServerClosed`] = true
      } catch (error) {
        report.passed = false
        report.cleanupFailure = `${label} Core close: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
  for (const repo of [repositoryAfterRestart, repository]) {
    if (repo) {
      try { repo.close() } catch (error) {
        report.passed = false
        report.cleanupFailure = `Repository close: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
  const runtimeRootResolved = path.resolve(runtimeRoot)
  const runtimeBaseResolved = path.resolve(runtimeBase)
  if (runtimeRootResolved.startsWith(runtimeBaseResolved + path.sep)
    && path.basename(runtimeRootResolved).startsWith('native-review-result-slot-case-')) {
    try { await rm(runtimeRootResolved, { recursive: true, force: true }) } catch (error) {
      report.passed = false
      report.cleanupFailure = `Disposable cleanup: ${error instanceof Error ? error.message : String(error)}`
    }
  } else {
    report.passed = false
    report.cleanupFailure = 'Disposable cleanup target failed .runtime containment/name validation; target preserved.'
  }
  report.deniedFetches ??= deniedFetches
  report.coreRequests ??= coreRequests
  report.evidencePath = reportPath
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

console.log(JSON.stringify(report, null, 2))
if (!report.passed) process.exitCode = 1
