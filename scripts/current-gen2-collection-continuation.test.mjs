import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeParent = path.join(workspaceRoot, '.runtime')
const reportDir = path.join(runtimeParent, 'current-gen2-collection-continuation')
const reportPath = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
await mkdir(reportDir, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(reportDir, 'case-'))

// These settings make this a fresh local Core fixture. Provider credentials,
// bridge endpoints and inherited service paths are removed by name only.
for (const key of [
  'HUABU_DATA_DIR', 'HUABU_HOST_URL', 'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN',
  'HUABU_AGENTLET_ID', 'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD',
  'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LOCAL_CORE_DB_PATH', 'LOCAL_CORE_TEST_PORT',
  'LOCAL_CORE_API_TOKEN', 'LOCAL_CORE_DEV_WORKSPACE_ROOT', 'LOCAL_CORE_ENABLE_MVP_SAMPLE',
  'LOCAL_CORE_MVP_SAMPLE_ROOT', 'LOCAL_CORE_ALLOWED_ORIGINS', 'LCOS_CODEX_AUTO_EXECUTION',
  'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT', 'LCOS_CAPTURE_STAGING_ROOT',
  'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON', 'LCOS_OLLAMA_URL', 'LCOS_OLLAMA_EMBED_MODEL',
  'LCOS_REPO_ROOT', 'LCOS_SQLITE_VEC_EXTENSION', 'LCOS_RUNTIME_REGISTRY', 'LCOS_PROJECTS_DIR',
  'LCOS_INTELLIGENCE_PROVIDERS', 'LCOS_COMPATIBLE_BASE_URL', 'OPENAI_BASE_URL', 'OPENAI_API_KEY',
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'GEMINI_BASE_URL', 'GEMINI_API_KEY', 'GOOGLE_API_KEY',
  'OPENROUTER_BASE_URL', 'OPENROUTER_API_KEY', 'GROQ_BASE_URL', 'GROQ_API_KEY', 'MISTRAL_BASE_URL',
  'MISTRAL_API_KEY', 'XAI_BASE_URL', 'XAI_API_KEY', 'QWEN_BASE_URL', 'DASHSCOPE_API_KEY',
  'ZHIPU_BASE_URL', 'ZHIPU_API_KEY', 'MOONSHOT_BASE_URL', 'MOONSHOT_API_KEY', 'SILICONFLOW_BASE_URL',
  'SILICONFLOW_API_KEY', 'MINIMAX_BASE_URL', 'MINIMAX_API_KEY', 'HUNYUAN_BASE_URL', 'HUNYUAN_API_KEY',
  'QIANFAN_BASE_URL', 'QIANFAN_API_KEY', 'COHERE_BASE_URL', 'COHERE_API_KEY', 'TOGETHER_BASE_URL',
  'TOGETHER_API_KEY', 'FIREWORKS_BASE_URL', 'FIREWORKS_API_KEY', 'PERPLEXITY_BASE_URL', 'PERPLEXITY_API_KEY',
  'BEDROCK_BASE_URL', 'BEDROCK_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_API_VERSION', 'LMSTUDIO_BASE_URL',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')

const report = {
  at: new Date().toISOString(),
  mode: 'buildPilotEntry adopted current Gen2 owners → real SQLite repository/import/continuation owners',
  transportBoundary: 'recording adapter only; no external provider, bridge, executor, browser, or server started',
  fixtureKind: 'disposable original Core SQLite project with original ConversationImportService and ConversationContinuationService',
  currentSourceRoot: currentGen2Root,
  originalUserDatabaseOpened: false,
  liveServiceAccessed: false,
  externalProviderStarted: false,
  browserStarted: false,
  rawSqlUsed: false,
  networkPolicy: 'global fetch rejects before networking; no Core HTTP server or provider transport is started',
  mimeFixtureBoundary: 'seven UTF-8 bodies are produced by the original text Artifact producer; FileRecord MIME is assigned through the original repository API to exercise the current exact-reader allowlist, not MIME-specific import detection',
  runtimeRoot,
  reportPath,
  network: { rejectedFetches: [] },
  adoptedSources: [],
  cases: [],
  failure: undefined,
  cleanup: { runtimeContained: false, importerClosed: false, repositoryClosed: false, runtimeRemoved: false },
}

const originalFetch = globalThis.fetch
let fetchInstalled = false
let metadata
let importer
let runtimeOwners
let cleanupFailure = false

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function installNoNetworkBoundary() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
    const url = new URL(address)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    report.network.rejectedFetches.push({ method, origin: url.origin, path: url.pathname })
    throw new Error('This collection/continuation test permits no network request; provider transport is recording-only.')
  }
}

async function buildOwners() {
  const entry = path.join(runtimeRoot, 'current-gen2-continuation-test-owners.mjs')
  await buildPilotEntry('lab/pilot/current-gen2-continuation-test-owners.ts', entry)
  const manifest = JSON.parse(await readFile(`${entry}.sources.json`, 'utf8'))
  assert.equal(manifest.currentRoot, currentGen2Root, 'bundle must resolve to the configured read-only Gen2 source root')
  const adopted = new Set((manifest.resources ?? []).map((resource) => resource.resourcePath))
  for (const source of [
    'apps/local-core/src/metadata-repository.ts',
    'apps/local-core/src/text-artifact-service.ts',
    'apps/local-core/src/conversation-import-service.ts',
    'apps/local-core/src/conversation-continuation-service.ts',
    'apps/local-core/src/collection-content.ts',
  ]) assert.ok(adopted.has(source), `actual bundle must execute selected current owner ${source}`)
  report.adoptedSources = [...adopted].sort()
  runtimeOwners = await import(pathToFileURL(entry).href)
  for (const symbol of [
    'SqliteMetadataRepository', 'createMvpSampleSnapshot', 'createTextArtifact',
    'reviseManagedTextArtifact', 'ConversationImportService', 'ConversationContinuationService', 'ProjectEventHub',
  ]) assert.equal(typeof runtimeOwners[symbol], 'function', `built owner export ${symbol}`)
}

function makeCollection(collectionId, title, projectId, members, startAt = Date.parse('2026-10-14T00:00:00.000Z')) {
  const createdAt = new Date(startAt).toISOString()
  const collection = { id: collectionId, projectId, title, createdAt, updatedAt: createdAt }
  const collectionMembershipAdds = members.map((memberRef, index) => ({
    collectionId,
    memberRef,
    relationId: `collection-member-${collectionId}-${String(index + 1).padStart(2, '0')}`,
    addedAt: new Date(startAt + index * 1_000).toISOString(),
  }))
  metadata.runCurationMutation({ projectId, collectionAdds: [collection], collectionMembershipAdds })
  return collection
}

function appendCollectionMember(collectionId, projectId, memberRef, suffix, at) {
  metadata.runCurationMutation({ projectId, collectionMembershipAdds: [{
    collectionId, memberRef, relationId: `collection-member-${collectionId}-${suffix}`, addedAt: new Date(at).toISOString(),
  }] })
}

function createRecordingAdapter(responses) {
  const calls = { attach: [], send: [], unexpected: [] }
  const badMethod = (name) => async () => { calls.unexpected.push(name); throw new Error(`Unexpected recording adapter call: ${name}`) }
  const adapter = {
    adapterId: 'test-recording-transport-no-provider',
    provider: 'codex',
    probe: badMethod('probe'),
    createSession: badMethod('createSession'),
    continueExisting: badMethod('continueExisting'),
    nativeFork: badMethod('nativeFork'),
    status: badMethod('status'),
    cancel: badMethod('cancel'),
    recoverExisting: badMethod('recoverExisting'),
    async attachContext(input) {
      calls.attach.push(structuredClone(input))
      return {
        schemaVersion: 1,
        operationId: input.operationId,
        correlationId: input.correlationId,
        provider: input.provider,
        adapterId: adapter.adapterId,
        action: 'attach_context',
        outcome: 'attached',
        externalSessionId: input.externalSessionId,
        contextAttachmentId: `recorded-attachment:${input.messageId}`,
        messageId: input.messageId,
        contextAttached: true,
        nativeFork: false,
        degradedFromNativeFork: false,
        retryAction: 'none',
        observedAt: new Date().toISOString(),
      }
    },
    async send(input) {
      calls.send.push(structuredClone(input))
      const outcome = responses.shift() ?? 'sent'
      return {
        schemaVersion: 1,
        operationId: input.operationId,
        correlationId: input.correlationId,
        provider: input.provider,
        adapterId: adapter.adapterId,
        action: 'send',
        outcome,
        externalSessionId: input.externalSessionId,
        ...(outcome === 'sent' ? { responseText: 'recorded transport receipt; no external provider was called' } : {}),
        messageId: input.payload.contextAttachment?.messageId,
        contextAttached: input.payload.contextAttachment !== undefined,
        nativeFork: false,
        degradedFromNativeFork: false,
        retryAction: outcome === 'sent' ? 'none' : 'reconcile',
        ...(outcome === 'failed' ? { error: { code: 'recording_declared_no_dispatch', message: 'Synthetic definite failure before provider handoff.', retryable: true, outcomeUnknown: false } } : {}),
        observedAt: new Date().toISOString(),
      }
    },
  }
  return { adapter, calls }
}

function createContinuation(service, projectId, connectedConversationId, operationId) {
  const submitted = service.submit({
    schemaVersion: 1,
    operationId,
    projectId,
    connectedConversationId,
    mode: 'continue_existing',
    contextInheritance: 'inherit',
    checkout: 'shared',
    provider: 'codex',
  })
  assert.equal(submitted.created, true)
  service.advanceStep(projectId, operationId, {
    step: 'external_create',
    outcome: 'confirmed',
    externalEvidence: {
      schemaVersion: 1,
      provider: 'codex',
      externalSessionId: `recorded-session:${operationId}`,
      correlationId: `recorded-correlation:${operationId}`,
      createdAt: '2026-10-14T00:00:00.000Z',
    },
  })
}

async function closeCoreOwners() {
  if (importer) {
    try { importer.close() } catch (error) {
      cleanupFailure = true
      report.cleanup.closeError = error instanceof Error ? error.message : String(error)
      throw error
    }
    importer = undefined
    report.cleanup.importerClosed = true
  }
  if (metadata) {
    try { metadata.close() } catch (error) {
      cleanupFailure = true
      report.cleanup.closeError = error instanceof Error ? error.message : String(error)
      throw error
    }
    metadata = undefined
    report.cleanup.repositoryClosed = true
  }
}

test('current Gen2 Collection continuation uses ordered whole-content evidence and retries retained Core revisions', async () => {
  let ownerEntry
  let thrown
  try {
    installNoNetworkBoundary()
    await buildOwners()

    const projectRoot = path.join(runtimeRoot, 'project')
    const databasePath = path.join(runtimeRoot, 'metadata.sqlite')
    await mkdir(projectRoot, { recursive: true })
    const graph = runtimeOwners.createMvpSampleSnapshot(projectRoot, '2026-10-14T00:00:00.000Z')
    metadata = new runtimeOwners.SqliteMetadataRepository(databasePath)
    metadata.save(graph)
    const projectId = String(graph.project.id)
    const scope = graph.scopes.find((item) => item.kind === 'root')
    assert.ok(scope, 'fresh original Core fixture has its canonical root Scope')
    const scopeId = String(scope.id)
    const stagingRoot = path.join(runtimeRoot, 'conversation-imports')
    importer = new runtimeOwners.ConversationImportService(metadata, {
      stagingRoot,
      ollamaUrl: 'http://127.0.0.1:1',
    })
    const imported = await importer.importManual(projectId, {
      title: '合成历史全文',
      scopeId,
      entries: [
        { role: 'user', contentText: '原始历史问题：请保留完整上下文。' },
        { role: 'assistant', contentText: '原始历史回答：UTF-8 保持原样，结尾是 🚀。' },
      ],
    })
    const connectedConversationId = 'connected-collection-continuation-fixture'
    const timestamp = '2026-10-14T00:00:00.000Z'
    metadata.upsertConnectedConversation({
      schemaVersion: 1,
      id: connectedConversationId,
      projectId,
      provider: 'codex',
      executorId: 'recording-transport-test-only',
      conversationRef: 'synthetic-imported-history',
      label: '合成历史全文',
      isRunning: false,
      waitingReason: null,
      lastActiveAt: timestamp,
      workspaceRef: null,
      branchRef: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    metadata.linkConnectedConversationSession(projectId, connectedConversationId, String(imported.session.id))
    assert.equal(importer.getProjection(projectId, String(imported.session.id))?.session.status, 'ready')
    const importedSource = await importer.inspectContextSource(projectId, String(imported.session.id))
    assert.deepEqual(importedSource.unsupportedMediaKinds, [], 'the saved raw archive is fully readable plain-text history')

    const mimes = [
      'text/markdown', 'text/plain', 'text/csv', 'application/json',
      'application/yaml', 'application/xml', 'text/html',
    ]
    const materials = []
    for (const [index, mimeType] of mimes.entries()) {
      const tailMarker = `TAIL-UTF8-${index + 1} · ${mimeType} · 🚩\n`
      const longMiddle = Array.from({ length: 160 }, (_, line) =>
        `第${String(line + 1).padStart(3, '0')}行 · 完整正文材料 ${index + 1} · Unicode 文本保真 🚀\n`,
      ).join('')
      const body = `UTF8-CONTENT-${index + 1} · ${mimeType}\n中文、かな、한글、العربية、emoji 🧪-${index + 1}\n${longMiddle}${tailMarker}`
      assert.ok(body.length >= 4_000 && body.length <= 8_000,
        `fixture ${index + 1} should be long enough to exceed preview-sized reads without approaching the Core limit`)
      assert.ok(body.endsWith(tailMarker), `fixture ${index + 1} has a unique end-of-file marker`)
      const title = `全文材料-${index + 1}`
      const created = await runtimeOwners.createTextArtifact(metadata, graph.project.id, { title, body, scopeId })
      const fileRecord = metadata.getFileRecord(created.fileRecordId)
      assert.ok(fileRecord)
      metadata.upsertFileRecord({ ...fileRecord, mimeType })
      materials.push({ ...created, title, mimeType, body, tailMarker })
    }
    assert.deepEqual(materials.map((item) => item.mimeType), mimes)

    const conversationTitle = '合成历史全文'
    const collectionId = 'collection-full-utf8-and-history'
    const orderedMembers = [
      ...materials.map((item) => ({ type: 'artifact', id: item.artifactId })),
      { type: 'conversation', id: connectedConversationId },
    ]
    makeCollection(collectionId, '七种 UTF-8 + 保存历史', projectId, orderedMembers)
    const orderedReferences = [{ order: 0, mode: 'full', ref: { type: 'collection', collectionId } }]

    // Separately preserve an unsupported member case. A valid member before the
    // unsupported one proves Core does not attach/send only a convenient subset.
    const unsupportedMaterial = await runtimeOwners.createTextArtifact(metadata, graph.project.id, {
      title: '不支持的二进制格式标记', body: '这一项被声明为 PDF，不能伪装成全文。', scopeId,
    })
    const unsupportedFile = metadata.getFileRecord(unsupportedMaterial.fileRecordId)
    assert.ok(unsupportedFile)
    metadata.upsertFileRecord({ ...unsupportedFile, mimeType: 'application/pdf' })
    const unsupportedCollectionId = 'collection-with-unsupported-pdf'
    makeCollection(unsupportedCollectionId, '含不支持材料', projectId, [
      { type: 'artifact', id: materials[0].artifactId },
      { type: 'artifact', id: unsupportedMaterial.artifactId },
    ], Date.parse('2026-10-14T00:01:00.000Z'))

    // A second unsupported case uses an actual imported archive with image media.
    const mediaBytes = Buffer.from([
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [
        { type: 'input_text', text: '历史里有文字，也包含尚不支持的图片。' },
        { type: 'input_image', image_url: 'data:image/png;base64,bG9jYWwtZml4dHVyZQ==' },
      ] } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: '保存的文字历史仍然留存。' } }),
    ].join('\n') + '\n', 'utf8')
    const mediaImport = await importer.createImportSession(projectId, {
      sourceKind: 'manual', title: '带图片的合成历史', sourceFileName: 'media-fixture.jsonl',
      scopeId, expectedBytes: mediaBytes.byteLength,
    })
    await importer.appendChunk(projectId, mediaImport.id, 0, mediaBytes)
    const mediaConversation = await importer.completeImport(projectId, mediaImport.id, { expectedChunks: 1 })
    const mediaConnectedId = 'connected-collection-image-history-fixture'
    metadata.upsertConnectedConversation({
      schemaVersion: 1, id: mediaConnectedId, projectId, provider: 'codex', executorId: 'recording-transport-test-only',
      conversationRef: 'synthetic-image-history', label: '带图片的合成历史', isRunning: false, waitingReason: null,
      lastActiveAt: timestamp, workspaceRef: null, branchRef: null, createdAt: timestamp, updatedAt: timestamp,
    })
    metadata.linkConnectedConversationSession(projectId, mediaConnectedId, String(mediaConversation.session.id))
    assert.ok((await importer.inspectContextSource(projectId, String(mediaConversation.session.id))).unsupportedMediaKinds.includes('input_image'))
    const unsupportedHistoryCollectionId = 'collection-with-unsupported-history-media'
    makeCollection(unsupportedHistoryCollectionId, '含未支持图片历史', projectId, [
      { type: 'artifact', id: materials[0].artifactId },
      { type: 'conversation', id: mediaConnectedId },
    ], Date.parse('2026-10-14T00:02:00.000Z'))

    const events = new runtimeOwners.ProjectEventHub()
    let continuation = new runtimeOwners.ConversationContinuationService(metadata, events, importer)
    const { adapter, calls } = createRecordingAdapter(['failed', 'sent'])
    const mainOperation = 'continuation-collection-full-retry'
    const mainPromptText = '请逐项读取完整集合和原始历史。'
    createContinuation(continuation, projectId, connectedConversationId, mainOperation)

    const firstAttempt = await continuation.sendPrompt(projectId, mainOperation,
      { kind: 'prompt', text: mainPromptText }, adapter, `corr:${mainOperation}`,
      { orderedReferences, messageId: 'message-collection-retry' })
    assert.equal(firstAttempt.outcome, 'failed', 'recording transport returns a declared no-dispatch failure after attach')
    assert.equal(calls.attach.length, 1)
    assert.equal(calls.send.length, 1)
    const attachedEvidence = calls.attach[0].contextResolution
    assert.equal(attachedEvidence.length, 1)
    assert.equal(attachedEvidence[0].ref.type, 'collection')
    assert.deepEqual(attachedEvidence[0].members.map((member) => member.kind === 'artifact' ? member.artifactId : member.connectedConversationId),
      [...materials.map((item) => item.artifactId), connectedConversationId], 'Core expansion keeps Collection member order')
    assert.deepEqual(attachedEvidence[0].members.slice(0, 7).map((member) => member.revisionId), materials.map((item) => item.revisionId),
      'message evidence pins every exact material revision used for the attach')

    const originalImportedMessages = importer.getMessages(String(imported.session.id), { offset: 0, limit: 20 })
    const originalConversationText = originalImportedMessages.map((message) =>
      `## ${message.seq + 1} · ${message.role}${message.toolName ? ` · ${message.toolName}` : ''}\n${message.contentText}`,
    ).join('\n\n')
    // Build the exact original provider payload the owner composed: numbered
    // member title followed by the complete body, no truncation/prefix path.
    const expectedSections = [
      ...materials.map((item) => `## ${materials.indexOf(item) + 1}. ${item.title}\n\n${item.body}`),
      `## ${materials.length + 1}. ${conversationTitle}\n\n${originalConversationText}`,
    ]
    const expectedPayloadText = expectedSections.join('\n\n')
    assert.ok(expectedPayloadText.length < 200_000, 'complete Collection payload remains below the original continuation text limit')
    const initialAttachment = calls.send[0].payload.contextAttachment
    assert.ok(initialAttachment)
    assert.equal(initialAttachment.messageId, 'message-collection-retry')
    assert.equal(initialAttachment.resolvedReferences.length, 1)
    assert.equal(initialAttachment.resolvedReferences[0].ref.collectionId, collectionId)
    assert.equal(initialAttachment.resolvedReferences[0].text, expectedPayloadText, 'all seven UTF-8 MIME bodies and saved history are exact full text')
    for (const material of materials) {
      assert.ok(initialAttachment.resolvedReferences[0].text.includes(material.body), `complete body for ${material.title} is present`)
      assert.ok(initialAttachment.resolvedReferences[0].text.includes(material.tailMarker), `end marker for ${material.title} survives the exact read`)
    }

    // After attachment, deliberately move Current and add a member. A safe retry
    // must use the durable message evidence, not either live collection change.
    const first = materials[0]
    const moved = await runtimeOwners.reviseManagedTextArtifact(metadata, projectId, { artifactId: first.artifactId },
      'CURRENT-ONLY newer revision; it must not replace the attached old body.', { expectedRevisionId: first.revisionId })
    const laterMaterial = await runtimeOwners.createTextArtifact(metadata, graph.project.id, {
      title: '后来加入的成员', body: '该成员不属于已发送消息的原始集合快照。', scopeId,
    })
    appendCollectionMember(collectionId, projectId, { type: 'artifact', id: laterMaterial.artifactId }, '99', Date.parse('2026-10-14T00:10:00.000Z'))
    assert.equal(metadata.listCollectionMemberships(projectId, collectionId).length, materials.length + 2)

    // Reopen the actual SQLite file before retrying: the operation journal owns
    // the frozen message evidence; no in-memory test snapshot is passed forward.
    await closeCoreOwners()
    assert.equal(isWithin(reportDir, runtimeRoot), true)
    metadata = new runtimeOwners.SqliteMetadataRepository(databasePath)
    report.cleanup.repositoryClosed = false
    importer = new runtimeOwners.ConversationImportService(metadata, {
      stagingRoot,
      ollamaUrl: 'http://127.0.0.1:1',
    })
    report.cleanup.importerClosed = false
    continuation = new runtimeOwners.ConversationContinuationService(metadata, new runtimeOwners.ProjectEventHub(), importer)
    const retainedBeforeRetry = metadata.getContinuationOperationJournal(projectId, mainOperation)?.promptReceipts?.find((receipt) => receipt.messageId === 'message-collection-retry')
    assert.ok(retainedBeforeRetry?.contextResolution, 'frozen evidence is durable across SQLite close/reopen')
    assert.deepEqual(retainedBeforeRetry.contextResolution[0].members.map((member) => member.kind === 'artifact' ? member.artifactId : member.connectedConversationId),
      [...materials.map((item) => item.artifactId), connectedConversationId])

    const retry = await continuation.sendPrompt(projectId, mainOperation,
      { kind: 'prompt', text: mainPromptText }, adapter, `corr:${mainOperation}`,
      { orderedReferences, messageId: 'message-collection-retry' })
    assert.equal(retry.outcome, 'sent')
    assert.equal(calls.attach.length, 1, 'confirmed attach is not repeated on retry')
    assert.equal(calls.send.length, 2)
    assert.equal(calls.send[1].payload.contextAttachment.resolvedReferences[0].text, expectedPayloadText,
      'retry reuses the retained historical bodies despite Current and Collection membership drift')
    assert.equal(calls.send[1].payload.contextAttachment.resolvedReferences[0].text.includes('CURRENT-ONLY'), false)
    assert.equal(calls.send[1].payload.contextAttachment.resolvedReferences[0].text.includes('后来加入的成员'), false)
    assert.deepEqual(calls.send[1].payload.contextAttachment.contextResolution, retainedBeforeRetry.contextResolution)
    assert.equal(String(metadata.getArtifact(first.artifactId).currentRevisionId), moved.revisionId)
    report.cases.push('ordered Collection expansion, seven exact UTF-8 MIME full bodies, and imported full-history attach passed')
    report.cases.push('definite no-dispatch retry after SQLite reopen reused retained exact revisions and ignored live Current/membership drift')

    const priorAttachCount = calls.attach.length
    const priorSendCount = calls.send.length
    const pdfOperation = 'continuation-unsupported-pdf-no-send'
    createContinuation(continuation, projectId, connectedConversationId, pdfOperation)
    const pdfResult = await continuation.sendPrompt(projectId, pdfOperation, { kind: 'prompt', text: '不应发送不支持的整组。' },
      adapter, `corr:${pdfOperation}`, {
        orderedReferences: [{ order: 0, mode: 'full', ref: { type: 'collection', collectionId: unsupportedCollectionId } }],
        messageId: 'message-unsupported-pdf',
      })
    assert.equal(pdfResult.outcome, 'unsupported')
    assert.equal(calls.attach.length, priorAttachCount, 'unsupported PDF member prevents attach of the otherwise readable prefix')
    assert.equal(calls.send.length, priorSendCount, 'unsupported PDF member prevents prompt send')

    const imageOperation = 'continuation-unsupported-history-media-no-send'
    createContinuation(continuation, projectId, connectedConversationId, imageOperation)
    const imageResult = await continuation.sendPrompt(projectId, imageOperation, { kind: 'prompt', text: '含图片历史不可只截文字发出。' },
      adapter, `corr:${imageOperation}`, {
        orderedReferences: [{ order: 0, mode: 'full', ref: { type: 'collection', collectionId: unsupportedHistoryCollectionId } }],
        messageId: 'message-unsupported-history-media',
      })
    assert.equal(imageResult.outcome, 'unsupported')
    assert.equal(calls.attach.length, priorAttachCount, 'unsupported imported media history prevents attach')
    assert.equal(calls.send.length, priorSendCount, 'unsupported imported media history prevents send')
    assert.deepEqual(calls.unexpected, [])
    report.cases.push('unsupported PDF and original imported image-history collections failed closed before adapter attach/send')

    const durableRow = metadata.getContinuationOperationJournal(projectId, mainOperation)
    assert.ok(durableRow)
    const durableReceipt = durableRow.promptReceipts?.find((receipt) => receipt.messageId === 'message-collection-retry')
    assert.equal(durableReceipt?.sendReceipt?.outcome, 'sent')
    assert.deepEqual(durableReceipt?.contextResolution, retainedBeforeRetry.contextResolution)
    assert.equal(calls.send[0].payload.text, calls.send[1].payload.text, 'a retry keeps the exact original prompt body with the stable messageId')
    report.operationId = mainOperation
    report.messageId = 'message-collection-retry'
    report.collectionId = collectionId
    report.finalFacts = {
      retainedMemberCount: durableReceipt.contextResolution[0].members.length,
      liveMembershipCountAfterDrift: metadata.listCollectionMemberships(projectId, collectionId).length,
      sevenSupportedMimes: mimes,
      fullBodyLengths: materials.map((item) => item.body.length),
      endMarkersPreserved: materials.every((item) => calls.send[1].payload.contextAttachment.resolvedReferences[0].text.includes(item.tailMarker)),
      completePayloadLength: calls.send[1].payload.contextAttachment.resolvedReferences[0].text.length,
      firstMemberRetainedRevision: durableReceipt.contextResolution[0].members[0].revisionId,
      firstMemberCurrentRevisionAfterDrift: String(metadata.getArtifact(first.artifactId).currentRevisionId),
      adapterAttachCalls: calls.attach.length,
      adapterSendCalls: calls.send.length,
      adapterUnexpectedCalls: calls.unexpected.length,
    }
  } catch (error) {
    thrown = error
    report.failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    throw error
  } finally {
    let finalizationError
    try { await closeCoreOwners() } catch (error) {
      cleanupFailure = true
      report.cleanup.closeError ??= error instanceof Error ? error.message : String(error)
      finalizationError = error
    }
    const resolvedRoot = path.resolve(runtimeRoot)
    const relative = path.relative(path.resolve(reportDir), resolvedRoot)
    const contained = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
      && path.basename(resolvedRoot).startsWith('case-')
    report.cleanup.runtimeContained = contained
    if (contained && !cleanupFailure && report.cleanup.importerClosed && report.cleanup.repositoryClosed) {
      try {
        await rm(resolvedRoot, { recursive: true, force: true })
        report.cleanup.runtimeRemoved = true
      } catch (error) {
        cleanupFailure = true
        report.cleanup.runtimeCleanupError = error instanceof Error ? error.message : String(error)
        report.cleanup.retainedForInspection = true
        finalizationError ??= error
      }
    } else {
      report.cleanup.cleanupRefused = true
      report.cleanup.retainedForInspection = true
    }
    if (fetchInstalled) globalThis.fetch = originalFetch
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    if (finalizationError && !thrown) throw finalizationError
  }
})
