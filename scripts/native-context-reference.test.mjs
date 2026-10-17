import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
await mkdir(runtimeBase, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(runtimeBase, 'native-context-reference-'))

// Keep this disposable Core independent of inherited host/provider/Bridge configuration.
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
  mode: 'real-core-native-context-reference-port',
  originalUserDatabaseOpened: false,
  providerOrBridgeStarted: false,
  providerRunCreated: false,
  freshCoreRunCount: 0,
  freshCoreRuntimeBindingCount: 0,
  nativeGuiVerified: false,
  coreManagedCaptureWatchStarted: true,
  coreCaptureWatchRuleCount: 0,
  projectWatcherStarted: false,
  autoSyncStarted: false,
  coreClosed: false,
  cases: [],
}

let repository
let coreServer
let port
let coreOrigin
const observedRequests = []

async function call(method, pathname, body) {
  const response = await fetch(coreOrigin + pathname, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json()
  return { status: response.status, body: payload }
}

function foreignSnapshot(snapshot, rootPath) {
  const prefix = 'foreign-'
  const id = (value) => `${prefix}${String(value)}`
  const foreignProjectId = 'disposable-foreign-native-reference-project'
  const mapRef = (value) => typeof value === 'string' ? id(value) : value
  return {
    ...snapshot,
    project: { ...snapshot.project, id: foreignProjectId, rootPath },
    scopes: snapshot.scopes.map((scope) => ({ ...scope, id: id(scope.id), projectId: foreignProjectId })),
    workspaces: snapshot.workspaces.map((workspace) => ({
      ...workspace,
      id: id(workspace.id), projectId: foreignProjectId, scopeId: id(workspace.scopeId),
      focusedViewIds: workspace.focusedViewIds.map(id),
    })),
    artifacts: snapshot.artifacts.map((artifact) => ({
      ...artifact,
      id: id(artifact.id), projectId: foreignProjectId, currentRevisionId: id(artifact.currentRevisionId),
    })),
    artifactViews: snapshot.artifactViews.map((view) => ({
      ...view,
      id: id(view.id), artifactId: id(view.artifactId), revisionId: id(view.revisionId), scopeId: id(view.scopeId),
    })),
    relations: snapshot.relations.map((relation) => ({
      ...relation,
      id: id(relation.id), projectId: foreignProjectId,
      sourceEntityId: mapRef(relation.sourceEntityId), targetEntityId: mapRef(relation.targetEntityId),
    })),
    notes: snapshot.notes.map((note) => ({
      ...note,
      id: id(note.id), projectId: foreignProjectId,
      anchor: note.anchor.type === 'artifact_view' ? { ...note.anchor, viewId: id(note.anchor.viewId) } : note.anchor,
    })),
    artifactRevisions: snapshot.artifactRevisions.map((revision) => ({
      ...revision,
      id: id(revision.id), artifactId: id(revision.artifactId), fileRecordId: id(revision.fileRecordId),
    })),
    fileRecords: snapshot.fileRecords.map((file) => ({ ...file, id: id(file.id), projectId: foreignProjectId })),
    checkpoints: snapshot.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      id: id(checkpoint.id), projectId: foreignProjectId, scopeId: id(checkpoint.scopeId),
    })),
  }
}

try {
  const moduleEntry = path.join(runtimeRoot, 'native-context-reference.mjs')
  const coreEntry = path.join(runtimeRoot, 'local-core-index.mjs')
  const httpEntry = path.join(runtimeRoot, 'web-gen2-http-client.mjs')
  await buildPilotEntry('lab/pilot/native-context-reference.ts', moduleEntry)
  await buildPilotEntry('lcos/apps/local-core/src/index.ts', coreEntry)
  await buildPilotEntry('lcos/apps/web-gen2/src/backend/client.ts', httpEntry)
  const [module, core, httpModule] = await Promise.all([
    import(pathToFileURL(moduleEntry).href),
    import(pathToFileURL(coreEntry).href),
    import(pathToFileURL(httpEntry).href),
  ])

  repository = new core.SqliteMetadataRepository(path.join(runtimeRoot, 'core.sqlite'), { disposableOnly: true })
  const sampleRoot = path.join(runtimeRoot, 'sample-project')
  const snapshot = core.createMvpSampleSnapshot(sampleRoot)
  const projectId = String(snapshot.project.id)
  const createdAt = new Date().toISOString()
  const savedContextId = 'scope-saved-context-native-reference'
  const enrichedSnapshot = {
    ...snapshot,
    scopes: [...snapshot.scopes, {
      id: savedContextId,
      projectId: snapshot.project.id,
      parentScopeId: snapshot.scopes[0].id,
      containerViewId: null,
      kind: 'context',
      name: '真实 Core Saved Context fixture',
      createdAt,
      updatedAt: createdAt,
    }],
  }
  repository.save(enrichedSnapshot)
  const foreignRoot = path.join(runtimeRoot, 'foreign-project')
  const foreignFixture = foreignSnapshot(core.createMvpSampleSnapshot(foreignRoot), foreignRoot)
  repository.save(foreignFixture)
  const foreignProjectId = String(foreignFixture.project.id)
  const foreignContextId = String(foreignFixture.scopes[0].id)
  assert.equal(repository.listCaptureWatchRules().length, 0)

  coreServer = core.createLocalCoreServer({
    metadataRepository: repository,
    port: 0,
    previewCacheRoot: path.join(runtimeRoot, 'preview-cache'),
    agentletsRoot: path.join(runtimeRoot, 'agentlets'),
    allowedOrigins: [],
  })
  const address = await coreServer.start()
  coreOrigin = `http://${address.host}:${address.port}`
  report.coreCaptureWatchRuleCount = repository.listCaptureWatchRules().length

  // Count the actual typed-client requests to verify preview is read-only and
  // each explicit apply call makes exactly one Assembly POST.
  const originalFetch = globalThis.fetch.bind(globalThis)
  const observedFetch = async (input, init) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
    observedRequests.push({ method: init?.method ?? 'GET', url: new URL(url).pathname })
    return originalFetch(input, init)
  }
  const http = new httpModule.HttpClient({ baseUrl: coreOrigin, fetch: observedFetch })
  port = module.createNativeContextReferencePort({ http, projectId })
  const prefixedPort = module.createNativeContextReferencePort({
    http: new httpModule.HttpClient({ baseUrl: `${coreOrigin}/api/lcos/core` }), projectId,
  })
  assert.equal(typeof prefixedPort.preview, 'function', 'registered Core API prefix is accepted without a default origin')
  assert.throws(() => module.createNativeContextReferencePort({
    http: new httpModule.HttpClient({ baseUrl: `${coreOrigin}/api/lcos/core/unknown` }), projectId,
  }), /explicit loopback HTTP origin/)
  report.cases.push('explicit loopback origin and exact /api/lcos/core prefix are accepted; unknown URL path is rejected')

  async function connectConversation(label, conversationRef) {
    const connected = await call('POST', `/projects/${encodeURIComponent(projectId)}/connected-conversations`, {
      action: 'connect', provider: 'codex', executorId: 'native-reference-test-executor', conversationRef, label,
    })
    assert.equal(connected.status, 201, JSON.stringify(connected.body))
    return connected.body.value
  }

  const confirmedConversation = await connectConversation('Local confirmed conversation', 'native-reference-explicit-session')
  const imported = await call('POST', `/projects/${encodeURIComponent(projectId)}/conversations/import-manual`, {
    title: 'Local manual conversation fixture', scopeId: 'scope-mvp-root',
    entries: [
      { role: 'user', contentText: 'Local synthetic user entry.' },
      { role: 'assistant', contentText: 'Local synthetic assistant entry; no provider executed.' },
    ],
  })
  assert.equal(imported.status, 201, JSON.stringify(imported.body))
  const linked = await call('POST', `/projects/${encodeURIComponent(projectId)}/connected-conversations/${encodeURIComponent(confirmedConversation.id)}/link-session`, {
    conversationSessionId: imported.body.value.session.id,
  })
  assert.equal(linked.status, 200, JSON.stringify(linked.body))
  const unlinkedConversation = await connectConversation('Unlinked conversation', 'native-reference-unlinked-session')

  const graphResponse = await call('GET', `/projects/${encodeURIComponent(projectId)}/graph`)
  assert.equal(graphResponse.status, 200, JSON.stringify(graphResponse.body))
  const graph = graphResponse.body.value
  const foreignGraphResponse = await call('GET', `/projects/${encodeURIComponent(foreignProjectId)}/graph`)
  assert.equal(foreignGraphResponse.status, 200, JSON.stringify(foreignGraphResponse.body))
  const foreignGraph = foreignGraphResponse.body.value
  function canvasNode(nodeId, type, viewId, ownerGraph = graph) {
    const view = ownerGraph.artifactViews.find((row) => String(row.id) === viewId)
    assert.ok(view, `fixture Core graph must contain ${viewId}`)
    const artifact = ownerGraph.artifacts.find((row) => String(row.id) === String(view.artifactId))
    assert.ok(artifact, `fixture Core graph must contain Artifact for ${viewId}`)
    return {
      nodeId,
      type,
      data: { lcos_ref: {
        version: 1,
        entityType: 'view',
        entityId: String(view.id),
        artifactId: String(artifact.id),
        artifactViewId: String(view.id),
        revisionId: String(view.revisionId),
      } },
    }
  }

  const imageNode = canvasNode('canvas-image-reference', 'image', 'view-reference')
  const textNode = canvasNode('canvas-text-brief', 'text', 'view-brief')
  const feedbackNode = canvasNode('canvas-text-feedback', 'text', 'view-feedback')
  const foreignNode = canvasNode('foreign-canvas-image', 'image', 'foreign-view-reference', foreignGraph)
  const contextTarget = { kind: 'context', id: savedContextId, projectId }
  const conversationTarget = { kind: 'conversation', id: confirmedConversation.id, projectId }
  const assemblyPostCount = () => observedRequests.filter((request) => request.method === 'POST'
    && request.url === `/projects/${encodeURIComponent(projectId)}/assembly/apply`).length

  // Rejected Canvas input never reaches Core apply.
  let beforePosts = assemblyPostCount()
  const wrongNode = await port.preview({ projectId, selectedNodes: [{ ...imageNode, type: 'note' }], target: contextTarget })
  assert.equal(wrongNode.status, 'rejected'); assert.equal(wrongNode.code, 'wrong-node-type')
  const missingRef = await port.preview({ projectId, selectedNodes: [{ nodeId: 'missing-ref', type: 'text', data: {} }], target: contextTarget })
  assert.equal(missingRef.status, 'rejected'); assert.equal(missingRef.code, 'missing-view-reference')
  const ambiguous = await port.preview({ projectId, selectedNodes: [imageNode, { ...imageNode, nodeId: 'duplicate-canvas-node' }], target: contextTarget })
  assert.equal(ambiguous.status, 'rejected'); assert.equal(ambiguous.code, 'ambiguous-selection')
  const crossProjectSelection = await port.preview({ projectId: foreignProjectId, selectedNodes: [foreignNode], target: contextTarget })
  assert.equal(crossProjectSelection.status, 'rejected'); assert.equal(crossProjectSelection.code, 'project-mismatch')
  assert.equal(assemblyPostCount(), beforePosts)
  report.cases.push('wrong node, missing lcos_ref, ambiguous selection and foreign Canvas project reject before any Assembly POST')

  const malformedBinding = {
    ...imageNode,
    data: { lcos_ref: { ...imageNode.data.lcos_ref, artifactId: 'mismatched-artifact' } },
  }
  const bindingMismatch = await port.preview({ projectId, selectedNodes: [malformedBinding], target: contextTarget })
  assert.equal(bindingMismatch.status, 'rejected'); assert.equal(bindingMismatch.code, 'binding-mismatch')
  const wrongKindContext = await port.preview({ projectId, selectedNodes: [imageNode], target: { kind: 'context', id: 'scope-mvp-root', projectId } })
  assert.equal(wrongKindContext.status, 'rejected'); assert.equal(wrongKindContext.code, 'incompatible-target')
  const foreignContext = await port.preview({ projectId, selectedNodes: [imageNode], target: { kind: 'context', id: foreignContextId, projectId } })
  assert.equal(foreignContext.status, 'rejected'); assert.equal(foreignContext.code, 'target-not-found')
  const unconfirmedConversation = await port.preview({ projectId, selectedNodes: [imageNode], target: { kind: 'conversation', id: 'native-reference-explicit-session', projectId } })
  assert.equal(unconfirmedConversation.status, 'rejected'); assert.equal(unconfirmedConversation.code, 'conversation-not-confirmed')
  const unlinkedPreview = await port.preview({ projectId, selectedNodes: [imageNode], target: { kind: 'conversation', id: unlinkedConversation.id, projectId } })
  assert.equal(unlinkedPreview.status, 'rejected'); assert.equal(unlinkedPreview.code, 'conversation-not-linked')
  assert.equal(assemblyPostCount(), beforePosts)
  report.cases.push('binding contradiction, root-vs-SavedContext kind, foreign Context, external conversationRef and unlinked Conversation fail closed')

  const contextPreview = await port.preview({ projectId, selectedNodes: [imageNode], target: contextTarget })
  assert.equal(contextPreview.status, 'ready', JSON.stringify(contextPreview))
  assert.deepEqual(contextPreview.request.sourceRefs, [{ kind: 'artifactView', id: 'view-reference' }])
  assert.deepEqual(contextPreview.request.targetRef, { kind: 'context', id: savedContextId })
  assert.ok(observedRequests.slice(-1).every((request) => request.method === 'GET'))
  assert.equal(assemblyPostCount(), beforePosts, 'preview is read-only')

  const contextReceipt = await port.apply(contextPreview)
  assert.equal(contextReceipt.projectId, projectId)
  assert.equal(contextReceipt.allApplied, true)
  assert.equal(contextReceipt.results[0].status, 'applied')
  assert.equal(contextReceipt.results[0].channel, 'presentation-membership')
  assert.equal(contextReceipt.results[0].presentationId, `presentation:context:${savedContextId}`)
  assert.equal(repository.listPresentationViews(projectId).find((view) => view.id === `presentation:context:${savedContextId}`).state.memberViewIds.includes('view-reference'), true)
  assert.equal(assemblyPostCount(), beforePosts + 1)
  const repeatedContextReceipt = await port.apply(contextPreview)
  assert.equal(repeatedContextReceipt.results[0].status, 'skipped')
  assert.equal(repeatedContextReceipt.results[0].channel, 'already-member')
  assert.equal(assemblyPostCount(), beforePosts + 2)
  report.cases.push('explicit apply returns the real SavedContext receipt; same preview can be deliberately replayed and Core returns already-member')

  const conversationPreviewPostsBefore = assemblyPostCount()
  const conversationPreview = await port.preview({ projectId, selectedNodes: [textNode], target: conversationTarget })
  assert.equal(conversationPreview.status, 'ready', JSON.stringify(conversationPreview))
  assert.deepEqual(conversationPreview.request.sourceRefs, [{ kind: 'artifactView', id: 'view-brief' }])
  assert.deepEqual(conversationPreview.request.targetRef, { kind: 'conversation', id: confirmedConversation.id })
  beforePosts = assemblyPostCount()
  assert.equal(beforePosts, conversationPreviewPostsBefore, 'the preview itself must not POST')
  const conversationReceipt = await port.apply(conversationPreview)
  assert.equal(conversationReceipt.results[0].status, 'applied')
  assert.equal(conversationReceipt.results[0].channel, 'relation')
  const conversationArtifactId = String(imported.body.value.session.conversationArtifactId)
  assert.ok(repository.getRelations(projectId).some((relation) => relation.kind === 'conversation_context'
    && String(relation.sourceEntityId) === conversationArtifactId
    && relation.targetEntityType === 'view' && String(relation.targetEntityId) === 'view-brief'))
  assert.equal(assemblyPostCount(), beforePosts + 1)
  report.cases.push('confirmed linked Conversation receives the ArtifactView through Core conversation_context relation, separate from SavedContext Presentation')

  // Core remains the owner of missing/foreign view outcomes and item-level partial receipts.
  const missingViewNode = {
    nodeId: 'canvas-missing-view', type: 'text', data: { lcos_ref: {
      version: 1, entityType: 'view', entityId: 'missing-artifact-view', artifactId: 'missing-artifact',
      artifactViewId: 'missing-artifact-view', revisionId: 'missing-revision',
    } },
  }
  const missingViewPreview = await port.preview({ projectId, selectedNodes: [missingViewNode], target: contextTarget })
  assert.equal(missingViewPreview.status, 'ready')
  const missingViewReceipt = await port.apply(missingViewPreview)
  assert.equal(missingViewReceipt.results[0].status, 'failed')
  assert.equal(missingViewReceipt.results[0].channel, 'error')
  assert.match(missingViewReceipt.results[0].message, /Artifact view not found/)
  assert.equal(missingViewReceipt.allApplied, false)

  const partialPreview = await port.preview({ projectId, selectedNodes: [feedbackNode, foreignNode], target: contextTarget })
  assert.equal(partialPreview.status, 'ready')
  const partialReceipt = await port.apply(partialPreview)
  assert.equal(partialReceipt.results.length, 2)
  assert.equal(partialReceipt.results[0].status, 'applied')
  assert.equal(partialReceipt.results[1].status, 'failed')
  assert.match(partialReceipt.results[1].message, /another project/)
  assert.equal(partialReceipt.allApplied, false)
  assert.equal(repository.listPresentationViews(projectId).find((view) => view.id === `presentation:context:${savedContextId}`).state.memberViewIds.includes('foreign-view-reference'), false)
  const partialRetryReceipt = await port.apply(partialPreview)
  assert.equal(partialRetryReceipt.results.length, 2)
  assert.equal(partialRetryReceipt.results[0].status, 'skipped')
  assert.equal(partialRetryReceipt.results[0].channel, 'already-member')
  assert.equal(partialRetryReceipt.results[1].status, 'failed')
  assert.match(partialRetryReceipt.results[1].message, /another project/)
  assert.equal(partialRetryReceipt.allApplied, false)
  report.cases.push('missing/foreign ArtifactViews keep Core errors; explicit retry of partial preview reports already-member plus persistent foreign failure, never synthesized complete')

  const repeatContextPreview = await port.preview({ projectId, selectedNodes: [imageNode], target: contextTarget })
  assert.equal(repeatContextPreview.status, 'ready')
  const alreadyMemberReceipt = await port.apply(repeatContextPreview)
  assert.equal(alreadyMemberReceipt.results[0].status, 'skipped')
  assert.equal(alreadyMemberReceipt.results[0].channel, 'already-member')
  report.cases.push('re-previewing an existing member returns Core already-member receipt without copying or inventing success')

  assert.equal(observedRequests.some((request) => /\/runs(?:\/|$)/.test(request.url)), false)
  assert.equal(observedRequests.some((request) => /bridge|executor|provider/i.test(request.url)), false)
  const verificationDb = new DatabaseSync(path.join(runtimeRoot, 'core.sqlite'), { readOnly: true })
  try {
    report.freshCoreRunCount = Number(verificationDb.prepare('SELECT COUNT(*) AS count FROM runs').get().count)
    report.freshCoreRuntimeBindingCount = Number(verificationDb.prepare('SELECT COUNT(*) AS count FROM runtime_bindings').get().count)
  } finally { verificationDb.close() }
  assert.equal(report.freshCoreRunCount, 0)
  assert.equal(report.freshCoreRuntimeBindingCount, 0)
  report.coreCaptureWatchRuleCount = repository.listCaptureWatchRules().length
  assert.equal(report.coreCaptureWatchRuleCount, 0)
  report.cases.push('fresh isolated Core DB has zero Runs/runtime bindings; test made no executor/provider/Bridge HTTP requests, started no ProjectWatcher/AutoSync, and Core CaptureWatch has zero saved rules')
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error.stack
  throw error
} finally {
  try { await coreServer?.close() } finally {
    repository?.close()
    report.coreClosed = coreServer !== undefined
    await mkdir(path.join(root, 'evidence'), { recursive: true })
    const evidencePath = path.join(root, 'evidence', 'native-context-reference.json')
    await (await import('node:fs/promises')).writeFile(evidencePath, JSON.stringify(report, null, 2) + '\n')
    await rm(runtimeRoot, { recursive: true, force: true })
  }
}

console.log(JSON.stringify(report, null, 2))
