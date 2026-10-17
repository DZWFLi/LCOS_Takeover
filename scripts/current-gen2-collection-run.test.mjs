import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { Server as NetServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Resources, currentGen2Root } from '../lab/current-gen2-resources.mjs'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeParent = path.join(workspaceRoot, '.runtime')
const reportDir = path.join(runtimeParent, 'current-gen2-collection-run')
await mkdir(reportDir, { recursive: true })
const reportPath = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
const runtimeRoot = await mkdtemp(path.join(reportDir, 'case-'))
const runtimeRootResolved = path.resolve(runtimeRoot)
const timestamp = '2026-10-14T00:00:00.000Z'
const blockedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])

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
  'ZHIPU_BASE_URL', 'ZHIPU_API_KEY', 'MOONSHOT_BASE_URL', 'SILICONFLOW_BASE_URL', 'SILICONFLOW_API_KEY',
  'MINIMAX_BASE_URL', 'MINIMAX_API_KEY', 'HUNYUAN_BASE_URL', 'HUNYUAN_API_KEY', 'QIANFAN_BASE_URL',
  'QIANFAN_API_KEY', 'COHERE_BASE_URL', 'COHERE_API_KEY', 'TOGETHER_BASE_URL', 'TOGETHER_API_KEY',
  'FIREWORKS_BASE_URL', 'FIREWORKS_API_KEY', 'PERPLEXITY_BASE_URL', 'PERPLEXITY_API_KEY',
  'BEDROCK_BASE_URL', 'BEDROCK_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_API_VERSION', 'LMSTUDIO_BASE_URL',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
// All accidental local embedding attempts stop at the fetch boundary below.
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const report = {
  at: new Date().toISOString(),
  reportPath,
  mode: 'current Gen2 Core owners → real isolated Core HTTP Run create → Collection manifest',
  fixtureKind: 'temporary SQLite project, original ImportCopy/Text/Conversation/Core Run owners; no provider execution',
  currentRoot: currentGen2Root,
  process: { pid: process.pid, serverStartedInThisProcess: false },
  originalUserDatabaseOpened: false,
  live17881Accessed: false,
  browserStarted: false,
  providerOrBridgeStarted: false,
  rawSqlUsed: false,
  schemaChanged: false,
  network: { allowedCoreRequests: [], pinnedOllamaRejected: [], blocked: [], activeCoreOrigins: [], bootstrapBaseline: [] },
  cases: [],
  cleanup: { targetContained: false, coreClosed: false, importerClosed: false, repositoryClosed: false, listenerReleased: false, runtimeRemoved: false },
}

const originalFetch = globalThis.fetch.bind(globalThis)
let fetchInstalled = false
let coreBootstrapInProgress = false
let coreServer
let repository
let importer
let runtime
let owners
let coreOrigin
const coreOrigins = new Set()

function isLoopback(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
}

function activeListeningLoopbackOrigins() {
  const origins = new Set()
  for (const handle of process._getActiveHandles()) {
    if (!(handle instanceof NetServer) || !handle.listening) continue
    const address = handle.address()
    if (!address || typeof address === 'string' || !isLoopback(address.address) || !Number.isInteger(address.port)) continue
    const hostname = address.address.includes(':') ? `[${address.address}]` : address.address
    origins.add(`http://${hostname}:${address.port}`)
  }
  return origins
}

function assertContained(parent, target, prefix) {
  const resolvedParent = path.resolve(parent)
  const resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedParent, resolvedTarget)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.resolve(resolvedParent, relative) !== resolvedTarget
    || (prefix && !path.basename(resolvedTarget).startsWith(prefix))) {
    throw new Error(`Refusing to clean a path outside this test-owned root: ${resolvedTarget}`)
  }
}

function installFetchBoundary() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
    const url = new URL(address)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (url.origin === 'http://127.0.0.1:1') {
      report.network.pinnedOllamaRejected.push({ method, origin: url.origin, path: url.pathname })
      throw new Error('The Collection test rejects its pinned dead Ollama origin without networking.')
    }
    const active = activeListeningLoopbackOrigins()
    const bootstrapCore = coreBootstrapInProgress && active.size === 1 && active.has(url.origin)
    const registeredCore = coreOrigins.has(url.origin) && active.has(url.origin)
    if (url.protocol === 'http:' && isLoopback(url.hostname) && !blockedPorts.has(url.port)
      && (bootstrapCore || registeredCore)) {
      const response = await originalFetch(input, init)
      let requestBody
      if (method.toUpperCase() === 'POST' && typeof init?.body === 'string') {
        try { requestBody = JSON.parse(init.body) } catch { /* request body remains unreported */ }
      }
      report.network.allowedCoreRequests.push({ method: method.toUpperCase(), origin: url.origin, path: url.pathname,
        status: response.status, ...(requestBody === undefined ? {} : { requestBody }) })
      return response
    }
    report.network.blocked.push({ method: method.toUpperCase(), origin: url.origin, path: url.pathname })
    throw new Error('The Collection test permits only its active temporary Core and rejects all other network access.')
  }
}

async function coreRequest(method, pathname, body) {
  const response = await fetch(`${coreOrigin}${pathname}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}

function projectRunIds(projectId) {
  return repository.getProjectRuns(projectId, 200).map(run => String(run.id)).sort()
}

async function createRun(projectId, collectionId, instruction) {
  return coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/runs`, {
    instruction,
    outputIntent: 'analyze',
    ...(collectionId === undefined ? {} : {
      orderedReferences: [{ order: 0, ref: { type: 'collection', collectionId } }],
    }),
  })
}

function contentMarker(item) {
  return typeof item?.content === 'string' ? item.content : ''
}

function longTextPayload(label) {
  return Array.from({ length: 105 }, (_, index) =>
    `${label} paragraph ${String(index + 1).padStart(3, '0')}: 完整 UTF-8 正文内容，保留雪、é 与实际尾部；不是索引预览。`,
  ).join('\n')
}

async function main() {
  const ownersBundle = path.join(runtimeRoot, 'current-gen2-collection-test-owners.mjs')
  await buildPilotEntry('lab/pilot/current-gen2-collection-test-owners.ts', ownersBundle)
  owners = await import(pathToFileURL(ownersBundle).href)
  assert.equal(typeof owners.createLocalCoreServer, 'function')
  assert.equal(typeof owners.persistCollectionFixture, 'function')
  const sourceManifest = JSON.parse(await readFile(`${ownersBundle}.sources.json`, 'utf8'))
  assert.equal(sourceManifest.currentRoot, currentGen2Root)
  const bundledCurrent = new Set((sourceManifest.resources ?? []).map(resource => resource.resourcePath))
  for (const resourcePath of [
    'apps/local-core/src/collection-content.ts',
    'apps/local-core/src/context-manifest-service.ts',
    'apps/local-core/src/conversation-import-service.ts',
    'apps/local-core/src/conversation-continuation-service.ts',
    'apps/local-core/src/runtime-application-service.ts',
    'apps/local-core/src/compose.ts',
    'apps/local-core/src/routes/ordered-references.ts',
    'apps/local-core/src/search-artifact-body.ts',
  ]) assert.ok(bundledCurrent.has(resourcePath), `The isolated Core bundle must use current owner ${resourcePath}`)
  const selectedCurrent = new Set(currentGen2Resources.map(resource => resource.resourcePath))
  for (const resourcePath of [
    'packages/contracts/src/run-assembly.ts',
    'packages/contracts/src/continuation-provider.ts',
  ]) assert.ok(selectedCurrent.has(resourcePath), `The adopted reference closure must select ${resourcePath}`)
  report.adoptedCurrentSources = [...bundledCurrent].sort()
  report.selectedTypeOnlyContracts = [
    'packages/contracts/src/run-assembly.ts',
    'packages/contracts/src/continuation-provider.ts',
  ]

  const baselineOrigins = activeListeningLoopbackOrigins()
  report.network.bootstrapBaseline = [...baselineOrigins]
  assert.equal(baselineOrigins.size, 0, 'The standalone test process must not inherit another loopback listener.')
  installFetchBoundary()
  coreBootstrapInProgress = true

  const databasePath = path.join(runtimeRoot, 'core.sqlite')
  const projectRoot = path.join(runtimeRoot, 'synthetic-project')
  await mkdir(projectRoot, { recursive: true })
  repository = new owners.SqliteMetadataRepository(databasePath, { disposableOnly: true })
  const projectId = `gen2-collection-test-${process.pid}`
  repository.createProject({ id: projectId, name: 'Synthetic Collection Full Text Test', rootPath: projectRoot })
  const project = repository.getProject(projectId)
  assert.ok(project)
  const rootScope = repository.getScopes(projectId).find(scope => scope.kind === 'root')
  const mainWorkspace = repository.getWorkspaces(projectId).find(workspace => String(workspace.scopeId) === String(rootScope?.id))
  assert.ok(rootScope && mainWorkspace)
  process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
  importer = new owners.ConversationImportService(repository, { stagingRoot: path.join(runtimeRoot, 'history-staging') })
  const importCopy = new owners.ImportCopyService(repository)

  runtime = owners.createRuntimeComposition(repository)
  const catalog = new owners.ExplicitProjectCatalog([{ id: project.id, name: project.name,
    rootPath: project.rootPath, graphVersion: project.graphVersion }])
  coreServer = owners.createLocalCoreServer({
    ...runtime.coreServerOptions,
    catalog,
    conversationImportService: importer,
    port: 0,
    previewCacheRoot: path.join(runtimeRoot, 'preview-cache'),
    agentletsRoot: path.join(runtimeRoot, 'agentlets'),
    allowedOrigins: [],
  })
  const address = await coreServer.start()
  report.process.serverStartedInThisProcess = true
  coreOrigin = `http://${address.host}:${address.port}`
  const activeAfterStart = activeListeningLoopbackOrigins()
  assert.ok(activeAfterStart.has(coreOrigin), 'the reported Core origin must be a live listener owned by this PID')
  assert.equal(activeAfterStart.size, 1, 'the test process may own only this temporary Core listener')
  assert.equal(blockedPorts.has(new URL(coreOrigin).port), false, 'the Core must use a fresh ephemeral loopback port')
  coreOrigins.add(coreOrigin)
  report.network.activeCoreOrigins.push(coreOrigin)
  coreBootstrapInProgress = false

  const markdownInitialBody = `MARKDOWN_INITIAL_BEGIN\n${longTextPayload('Markdown old revision')}\nTAIL_MARKDOWN_INITIAL_雪_END`
  const markdownCurrentBody = `MARKDOWN_CURRENT_BEGIN\n${longTextPayload('Markdown Current')}\nTAIL_MARKDOWN_CURRENT_尾_END`
  const markdown = await owners.createTextArtifact(repository, projectId, {
    title: 'Synthetic markdown member', body: markdownInitialBody, scopeId: String(rootScope.id),
  })
  const markdownUpdate = await owners.reviseManagedTextArtifact(repository, projectId,
    { artifactId: markdown.artifactId }, markdownCurrentBody, { expectedRevisionId: markdown.revisionId })
  assert.equal(markdownUpdate.revisionId === markdown.revisionId, false, 'the fixture must have a newer Current revision')
  const currentMarkdown = repository.getArtifact(markdown.artifactId)
  assert.equal(String(currentMarkdown?.currentRevisionId), markdownUpdate.revisionId)
  const currentMarkdownView = repository.getArtifactView(markdown.viewId)
  assert.ok(currentMarkdownView)
  const historicalViewId = 'view-collection-test-pinned-markdown'
  repository.upsertArtifactView({
    ...currentMarkdownView,
    id: historicalViewId,
    revisionId: markdown.revisionId,
    referenceKind: 'explicit_additional',
    position: { x: 20, y: 20 },
  })
  repository.addWorkspaceMembers(mainWorkspace.id, [historicalViewId], 'user', timestamp)

  const mimeFixtures = [
    { extension: 'txt', mimeType: 'text/plain', marker: 'TAIL_PLAIN_尾_END', body: `PLAIN_BEGIN\n${longTextPayload('Plain text')}\nTAIL_PLAIN_尾_END` },
    { extension: 'csv', mimeType: 'text/csv', marker: 'TAIL_CSV_尾_END', body: `id,body\n${Array.from({ length: 75 }, (_, index) => `${index + 1},${longTextPayload(`CSV row ${index + 1}`).split('\n')[0]}`).join('\n')}\nTAIL_CSV_尾_END` },
    { extension: 'json', mimeType: 'application/json', marker: 'TAIL_JSON_尾_END', body: JSON.stringify({ kind: 'json', text: longTextPayload('JSON'), tail: 'TAIL_JSON_尾_END' }, null, 2) },
    { extension: 'yaml', mimeType: 'application/yaml', marker: 'TAIL_YAML_尾_END', body: `kind: yaml\ntext: |\n${longTextPayload('YAML').split('\n').map(line => `  ${line}`).join('\n')}\ntail: TAIL_YAML_尾_END` },
    { extension: 'xml', mimeType: 'application/xml', marker: 'TAIL_XML_尾_END', body: `<doc><kind>xml</kind><text>${longTextPayload('XML')}</text><tail>TAIL_XML_尾_END</tail></doc>` },
    { extension: 'html', mimeType: 'text/html', marker: 'TAIL_HTML_尾_END', body: `<!doctype html><article><p>${longTextPayload('HTML')}</p><footer>TAIL_HTML_尾_END</footer></article>` },
  ]
  const importedTextFixtures = []
  for (const [index, fixture] of mimeFixtures.entries()) {
    const imported = await importCopy.importCopy(projectId, {
      importRequestId: `collection-mime-${fixture.extension}`,
      fileName: `member-${fixture.extension}.${fixture.extension}`,
      title: `Synthetic ${fixture.mimeType}`,
      contentType: fixture.mimeType,
      bytes: Buffer.from(fixture.body, 'utf8'),
      scopeId: String(rootScope.id),
      position: { x: 300 + index * 30, y: 80 },
    })
    assert.equal(imported.fileRecord.mimeType, fixture.mimeType, `original ImportCopy must preserve ${fixture.mimeType}`)
    importedTextFixtures.push({ ...fixture, ...imported, artifactId: String(imported.artifact.id),
      revisionId: String(imported.revision.id), fileRecordId: String(imported.fileRecord.id) })
  }
  const currentMarkdownRevision = repository.getArtifactRevision(markdownUpdate.revisionId)
  assert.ok(currentMarkdownRevision)
  const allTextFixtures = [
    { mimeType: 'text/markdown', body: markdownCurrentBody, marker: 'TAIL_MARKDOWN_CURRENT_尾_END',
      artifactId: markdown.artifactId, revisionId: markdownUpdate.revisionId, fileRecordId: String(currentMarkdownRevision.fileRecordId) },
    ...importedTextFixtures,
  ]
  assert.deepEqual(allTextFixtures.map(item => item.mimeType), [
    'text/markdown', 'text/plain', 'text/csv', 'application/json', 'application/yaml', 'application/xml', 'text/html',
  ])
  for (const fixture of allTextFixtures) {
    assert.ok(fixture.body.length >= 4_000 && fixture.body.length <= 8_000,
      `${fixture.mimeType} fixture must exercise full body beyond a short preview (${fixture.body.length} chars)`)
  }

  const noteId = 'note-collection-test'
  const noteBody = 'NOTE_MEMBER_BEGIN\n这是完整 Note 正文\nTAIL_NOTE_MEMBER_END'
  repository.upsertNote({ id: noteId, projectId, anchor: { type: 'scope', scopeId: String(rootScope.id) },
    body: noteBody, createdAt: timestamp, updatedAt: timestamp })

  const conversationId = 'connected-conversation-collection-test'
  const importedHistory = await importer.importManual(projectId, {
    title: 'Synthetic complete conversation', scopeId: String(rootScope.id), entries: [
      { role: 'user', contentText: 'CONVERSATION_FIRST_TURN_BEGIN\n第一轮完整提问。' },
      { role: 'assistant', contentText: 'CONVERSATION_LAST_TURN_END\n最后一轮完整回答：雪。' },
    ],
  })
  repository.upsertConnectedConversation({ schemaVersion: 1, id: conversationId, projectId, provider: 'codex',
    executorId: 'synthetic-test-only', conversationRef: 'synthetic-history-reference', label: 'Synthetic history',
    isRunning: false, waitingReason: null, lastActiveAt: timestamp, workspaceRef: null, branchRef: null,
    createdAt: timestamp, updatedAt: timestamp })
  repository.linkConnectedConversationSession(projectId, conversationId, importedHistory.session.id)

  // The Run member below is a fixture through Core's existing RuntimeDraft
  // producer, not a dispatched or model-produced result.
  const seedResponse = await createRun(projectId, undefined, 'Create a local no-dispatch Run fixture')
  assert.equal(seedResponse.status, 201, JSON.stringify(seedResponse.body))
  const seedReview = seedResponse.body?.value?.review
  assert.ok(seedReview?.run?.id)
  assert.equal(seedReview.run.status, 'created')
  assert.equal(seedReview.dispatch.status, 'planned')
  assert.equal(seedReview.dispatch.attemptCount, 0, 'seed Run must remain undispatched')
  assert.equal(repository.getRuntimeBinding(String(seedReview.run.id)), undefined)
  const seedRunId = String(seedReview.run.id)
  const runOutputBody = 'RUN_RETURN_BEGIN\nSynthetic pending return body; not generated by a provider.\nTAIL_RUN_RETURN_END'
  const runOutputBytes = Buffer.from(runOutputBody, 'utf8')
  const runOutputHash = createHash('sha256').update(runOutputBytes).digest('hex')
  const runOutputPath = path.join(projectRoot, '.creative-os', 'runtime', seedRunId, 'staging', 'synthetic-return.md')
  await mkdir(path.dirname(runOutputPath), { recursive: true })
  await writeFile(runOutputPath, runOutputBytes)
  const runOutputArtifactId = 'artifact-collection-test-run-output'
  const runOutputFileId = 'file-collection-test-run-output'
  const runOutputRevisionId = 'revision-collection-test-run-output'
  repository.createRuntimeCreatedArtifact({
    id: runOutputFileId, projectId, observedPath: runOutputPath, observedHash: runOutputHash,
    size: runOutputBytes.byteLength, modifiedAt: timestamp, mimeType: 'text/markdown',
    availability: 'current', observedAt: timestamp,
  }, {
    id: runOutputArtifactId, projectId, title: 'Synthetic pending Run return fixture', kind: 'markdown',
    availability: 'available', createdAt: timestamp, updatedAt: timestamp,
  }, {
    id: runOutputRevisionId, artifactId: runOutputArtifactId, fileRecordId: runOutputFileId,
    contentHash: runOutputHash, source: 'run', runId: seedRunId,
    status: 'draft', createdAt: timestamp,
  }, {
    id: 'return-collection-test-run-output', runId: seedRunId, targetArtifactId: runOutputArtifactId,
    baseRevisionId: runOutputRevisionId, returnedFileId: runOutputFileId, contentHash: runOutputHash,
    canonicalPath: runOutputPath, action: 'created', status: 'pending_review', draftRevisionId: runOutputRevisionId,
    createdAt: timestamp, updatedAt: timestamp,
  })

  // Current canonical writes all use the disposable repository and its original
  // transaction APIs. No fixture writes bypass this Core owner with SQLite SQL.
  owners.persistCollectionFixture(repository, projectId, [
    { id: 'collection-inner-test', title: 'Nested source', members: [{ type: 'artifact', id: markdown.artifactId }] },
    { id: 'collection-all-seven-test', title: 'All members and full text', members: [
      { type: 'collection', id: 'collection-inner-test' },
      { type: 'artifact', id: markdown.artifactId },
      ...importedTextFixtures.map(item => ({ type: 'artifact', id: item.artifactId })),
      { type: 'note', id: noteId },
      { type: 'conversation', id: conversationId },
      { type: 'run', id: seedRunId },
      { type: 'scope', id: String(rootScope.id) },
      { type: 'workspace', id: String(mainWorkspace.id) },
    ] },
  ], timestamp)

  const foreignProjectId = `gen2-collection-foreign-${process.pid}`
  const foreignProjectRoot = path.join(runtimeRoot, 'foreign-project')
  await mkdir(foreignProjectRoot, { recursive: true })
  repository.createProject({ id: foreignProjectId, name: 'Synthetic foreign project', rootPath: foreignProjectRoot })
  owners.persistCollectionFixture(repository, foreignProjectId, [
    { id: 'collection-foreign-test', title: 'Foreign Collection' },
  ], timestamp)

  owners.persistCollectionFixture(repository, projectId, [
    { id: 'collection-cycle-a-test', title: 'Cycle A', members: [{ type: 'collection', id: 'collection-cycle-b-test' }] },
    { id: 'collection-cycle-b-test', title: 'Cycle B', members: [{ type: 'collection', id: 'collection-cycle-a-test' }] },
  ], timestamp)

  const baselineRunIds = projectRunIds(projectId)
  assert.deepEqual(baselineRunIds, [seedRunId])
  const collectionId = 'collection-all-seven-test'
  const createResponse = await createRun(projectId, collectionId, 'Read every ordered Collection member and full body')
  assert.equal(createResponse.status, 201, JSON.stringify(createResponse.body))
  const createdReview = createResponse.body?.value?.review
  assert.ok(createdReview?.run?.id)
  assert.equal(createdReview.run.status, 'created')
  assert.equal(createdReview.dispatch.status, 'planned')
  assert.equal(createdReview.dispatch.attemptCount, 0, 'Collection Run must remain undispatched')
  const createdRunId = String(createdReview.run.id)
  assert.equal(repository.getRuntimeBinding(createdRunId), undefined, 'Run create must not dispatch or create a provider binding')
  assert.deepEqual(repository.getRunOrderedReferences(createdRunId), [
    { order: 0, ref: { type: 'collection', collectionId } },
  ], 'the original Run owner must persist the exact one-item Collection address')
  const contextManifest = repository.getContextManifest(String(createdReview.run.contextManifestId))
  assert.ok(contextManifest, 'successful HTTP create must persist its Core-owned ContextManifest')
  const manifest = JSON.parse(contextManifest.canonicalJson)
  const referenceItems = manifest.orderedItems.filter(item => item.role === 'reference')
  assert.ok(referenceItems.length >= 10, 'all direct member bodies plus nested scope/workspace material must reach the manifest')

  const firstSeven = referenceItems.slice(0, 7)
  assert.deepEqual(firstSeven.map(item => [item.artifactId, item.revisionId]),
    allTextFixtures.map(item => [item.artifactId, item.revisionId]),
    'the seven direct UTF-8 Artifact members must retain canonical Collection order through the original Run route')
  for (const fixture of allTextFixtures) {
    const revision = repository.getArtifactRevision(fixture.revisionId)
    const file = repository.getFileRecord(fixture.fileRecordId)
    assert.ok(revision && file)
    const bytes = await readFile(file.observedPath)
    const text = bytes.toString('utf8')
    assert.equal(text, fixture.body, `${fixture.mimeType} FileRecord bytes are complete and unchanged`)
    const manifestItem = referenceItems.find(item => item.artifactId === fixture.artifactId && item.revisionId === fixture.revisionId)
    assert.ok(manifestItem, `Run manifest must contain exact ${fixture.mimeType} revision`)
    assert.equal(manifestItem.mimeType, fixture.mimeType)
    assert.ok(contentMarker(manifestItem).includes(fixture.body), `${fixture.mimeType} body must be present without excerpt/truncation`)
    assert.ok(contentMarker(manifestItem).includes(fixture.marker), `${fixture.mimeType} body must retain its unique tail marker`)
  }

  const noteItem = referenceItems.find(item => contentMarker(item).includes('NOTE_MEMBER_BEGIN'))
  assert.ok(noteItem && contentMarker(noteItem).includes('TAIL_NOTE_MEMBER_END'))
  const conversationItem = referenceItems.find(item => contentMarker(item).includes('CONVERSATION_FIRST_TURN_BEGIN'))
  assert.ok(conversationItem && contentMarker(conversationItem).includes('CONVERSATION_LAST_TURN_END'))
  const runReturnItem = referenceItems.find(item => item.artifactId === runOutputArtifactId && item.revisionId === runOutputRevisionId)
  assert.ok(runReturnItem && contentMarker(runReturnItem).includes('TAIL_RUN_RETURN_END'),
    'run member must read the exact original RuntimeDraft revision, not instructions or later Current')

  const markdownDirect = referenceItems.find(item => item.artifactId === markdown.artifactId && item.revisionId === markdownUpdate.revisionId)
  assert.ok(markdownDirect && contentMarker(markdownDirect).includes(markdownCurrentBody))
  const sourceAnchor = JSON.parse(markdownDirect.sourceAnchor)
  assert.deepEqual(sourceAnchor.sourcePaths.slice(0, 2), [
    ['collection:collection-all-seven-test', 'membership:collection-all-seven-test-member-000',
      'collection:collection-inner-test', 'membership:collection-inner-test-member-000', `artifact:${markdown.artifactId}`],
    ['collection:collection-all-seven-test', 'membership:collection-all-seven-test-member-001', `artifact:${markdown.artifactId}`],
  ], 'nested plus direct duplicate source paths must be retained, while the same exact payload is emitted once')

  const historicalItem = referenceItems.find(item => item.artifactId === markdown.artifactId && item.revisionId === markdown.revisionId)
  assert.ok(historicalItem, 'workspace/scope reference must preserve the explicitly pinned historical revision')
  assert.notEqual(String(repository.getArtifact(markdown.artifactId)?.currentRevisionId), markdown.revisionId)
  assert.ok(contentMarker(historicalItem).includes(markdownInitialBody))
  assert.ok(!contentMarker(historicalItem).includes(markdownCurrentBody))
  const historicalAnchor = JSON.parse(historicalItem.sourceAnchor)
  assert.ok(historicalAnchor.sourcePaths.some(pathParts => pathParts.includes(`view:${historicalViewId}`)))
  assert.ok(historicalAnchor.sourcePaths.some(pathParts => pathParts.includes(`workspace:${mainWorkspace.id}`)))

  const createdManifests = repository.getProjectRuns(projectId, 200)
  assert.equal(createdManifests.length, 2, 'the seed and one accepted Collection HTTP create are the only successful Runs so far')
  report.cases.push('real Core POST Run resolved all seven Collection member types, every ordered UTF-8 MIME body through its tail marker, exact old view revision, and nested duplicate provenance')
  report.successfulRun = {
    seedRunId,
    collectionRunId: createdRunId,
    collectionId,
    memberTypes: ['artifact', 'note', 'collection', 'scope', 'workspace', 'conversation', 'run'],
    mimeTypes: allTextFixtures.map(item => item.mimeType),
    bodyCharacterLengths: allTextFixtures.map(item => ({ mimeType: item.mimeType, characters: item.body.length })),
    directMemberOrder: allTextFixtures.map(item => item.artifactId),
    pinnedOldRevisionId: markdown.revisionId,
    pinnedCurrentRevisionId: markdownUpdate.revisionId,
    historicalViewId,
    runtimeBindingCreated: false,
    dispatchAttemptCount: createdReview.dispatch.attemptCount,
  }

  // Keep unsupported material outside the positive Scope/Workspace fixture so
  // the successful aggregate above proves all supported members, not a partial.
  const unsupported = await importCopy.importCopy(projectId, {
    importRequestId: 'collection-unsupported-binary', fileName: 'unsupported.bin',
    title: 'Synthetic unsupported binary', contentType: 'application/octet-stream',
    bytes: Buffer.from([0, 1, 2, 3, 4, 5]), scopeId: String(rootScope.id), position: { x: 900, y: 900 },
  })
  owners.persistCollectionFixture(repository, projectId, [
    { id: 'collection-unsupported-test', title: 'Unsupported member', members: [{ type: 'artifact', id: String(unsupported.artifact.id) }] },
  ], timestamp)

  const missingFile = await importCopy.importCopy(projectId, {
    importRequestId: 'collection-missing-file', fileName: 'missing-file.txt',
    title: 'Synthetic missing FileRecord bytes', contentType: 'text/plain',
    bytes: Buffer.from('MISSING_FILE_MEMBER_BEGIN\nTAIL_MISSING_FILE_END', 'utf8'),
    scopeId: String(rootScope.id), position: { x: 930, y: 900 },
  })
  const missingFileRecord = repository.getFileRecord(String(missingFile.fileRecord.id))
  assert.ok(missingFileRecord && path.resolve(missingFileRecord.observedPath).startsWith(`${path.resolve(projectRoot)}${path.sep}`),
    'only a newly created test-owned file may be removed for the missing-file case')
  await rm(missingFileRecord.observedPath, { force: true })
  owners.persistCollectionFixture(repository, projectId, [
    { id: 'collection-missing-file-test', title: 'Valid member then missing FileRecord bytes', members: [
      { type: 'artifact', id: markdown.artifactId }, { type: 'artifact', id: String(missingFile.artifact.id) },
    ] },
  ], timestamp)

  const staleFile = await importCopy.importCopy(projectId, {
    importRequestId: 'collection-stale-file', fileName: 'stale-file.txt',
    title: 'Synthetic changed bytes with original metadata', contentType: 'text/plain',
    bytes: Buffer.from('STALE_FILE_MEMBER_ORIGINAL\nTAIL_STALE_ORIGINAL_END', 'utf8'),
    scopeId: String(rootScope.id), position: { x: 960, y: 900 },
  })
  const staleRecordBefore = repository.getFileRecord(String(staleFile.fileRecord.id))
  assert.ok(staleRecordBefore && path.resolve(staleRecordBefore.observedPath).startsWith(`${path.resolve(projectRoot)}${path.sep}`))
  await writeFile(staleRecordBefore.observedPath, 'STALE_FILE_MEMBER_CHANGED\nTAIL_STALE_CHANGED_END', 'utf8')
  assert.equal(String(repository.getFileRecord(String(staleFile.fileRecord.id))?.observedHash), String(staleRecordBefore.observedHash),
    'the fixture changes only its own bytes; Core FileRecord identity/hash metadata remains untouched')
  owners.persistCollectionFixture(repository, projectId, [
    { id: 'collection-stale-file-test', title: 'Valid member then changed bytes', members: [
      { type: 'artifact', id: markdown.artifactId }, { type: 'artifact', id: String(staleFile.artifact.id) },
    ] },
  ], timestamp)

  const overLimitBody = `OVER_LIMIT_MEMBER_BEGIN\n${'x'.repeat(32_001)}\nTAIL_OVER_LIMIT_END`
  const overLimit = await importCopy.importCopy(projectId, {
    importRequestId: 'collection-over-limit', fileName: 'over-limit.txt',
    title: 'Synthetic single-item body beyond original Core limit', contentType: 'text/plain',
    bytes: Buffer.from(overLimitBody, 'utf8'), scopeId: String(rootScope.id), position: { x: 990, y: 900 },
  })
  owners.persistCollectionFixture(repository, projectId, [
    { id: 'collection-over-limit-test', title: 'Valid member then over-limit member', members: [
      { type: 'artifact', id: markdown.artifactId }, { type: 'artifact', id: String(overLimit.artifact.id) },
    ] },
  ], timestamp)

  const invalidCases = [
    ['missing collection', 'collection-definitely-missing', 'missing Collection must fail before Run/manifest creation'],
    ['foreign collection', 'collection-foreign-test', 'foreign-project Collection must fail before Run/manifest creation'],
    ['cyclic collection', 'collection-cycle-a-test', 'recursive Collection cycle must fail before Run/manifest creation'],
    ['unsupported binary member', 'collection-unsupported-test', 'unsupported binary context must fail rather than be omitted or summarized'],
    ['missing FileRecord bytes after valid member', 'collection-missing-file-test', 'missing bytes after an earlier readable member must fail the whole collection'],
    ['changed bytes after valid member', 'collection-stale-file-test', 'mismatched bytes after an earlier readable member must fail the whole collection'],
    ['over-limit body after valid member', 'collection-over-limit-test', 'a single body above Core’s 32,000-character cap must fail the whole collection'],
  ]
  for (const [name, invalidCollectionId, assertion] of invalidCases) {
    const before = projectRunIds(projectId)
    const response = await createRun(projectId, invalidCollectionId, `Fail-closed fixture: ${name}`)
    assert.equal(response.status, 409, `${assertion}; response=${JSON.stringify(response.body)}`)
    assert.equal(response.body?.ok, false, `${assertion}; Core must return an error envelope`)
    assert.deepEqual(projectRunIds(projectId), before, `${assertion}; no Run row may be added`)
    report.cases.push(`${name}: HTTP ${response.status}, no Run count growth`)
  }

  const bridgeAttemptPaths = runtime.bridgeAttempts().map(value => {
    try { return new URL(value).pathname } catch { return String(value) }
  })
  assert.ok(bridgeAttemptPaths.every(pathname => pathname === '/v1/capabilities'),
    'offline Run creation may perform only the in-process fail-closed capability preflight; it must never send a task')
  assert.ok(!bridgeAttemptPaths.includes('/v1/tasks'))
  report.bridgeCapabilityAttemptsBlockedInProcess = bridgeAttemptPaths.length
  report.cases.push('RuntimeComposition capability preflights stayed on its injected refusing fetch; no Bridge task/Provider request was dispatched')
  assert.ok(repository.getRuntimeBinding(seedRunId) === undefined && repository.getRuntimeBinding(createdRunId) === undefined)
  assert.equal(report.network.blocked.length, 0, 'no non-Core requests may escape the boundary')
  assert.ok(report.network.allowedCoreRequests.some(request => request.path === `/projects/${encodeURIComponent(projectId)}/runs` && request.status === 201))
  assert.ok(report.network.allowedCoreRequests.filter(request => request.path === `/projects/${encodeURIComponent(projectId)}/runs`).length >= 6,
    'two successful and four fail-closed Run attempts must traverse the original HTTP route')
  report.providerOrBridgeStarted = false
  report.bridgeAttempts = bridgeAttemptPaths
  report.finalRunIds = projectRunIds(projectId)
  report.network.blockedPorts = [...blockedPorts]
  report.network.allCoreRequestsSameOrigin = report.network.allowedCoreRequests.every(request => request.origin === coreOrigin)
  assert.ok(report.network.allCoreRequestsSameOrigin)
}

try {
  await main()
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error)
  process.exitCode = 1
} finally {
  if (coreServer) {
    try {
      await coreServer.close()
      report.cleanup.coreClosed = true
    } catch (error) {
      report.cleanup.coreCloseError = error instanceof Error ? error.message : String(error)
    }
  } else report.cleanup.coreClosed = true
  if (importer) {
    try { importer.close(); report.cleanup.importerClosed = true }
    catch (error) { report.cleanup.importerCloseError = error instanceof Error ? error.message : String(error) }
  }
  if (repository) {
    try { repository.close(); report.cleanup.repositoryClosed = true }
    catch (error) { report.cleanup.repositoryCloseError = error instanceof Error ? error.message : String(error) }
  }
  await new Promise(resolve => setImmediate(resolve))
  const remainingOrigins = activeListeningLoopbackOrigins()
  const baselineOrigins = new Set(report.network.bootstrapBaseline)
  report.cleanup.listenerReleased = [...remainingOrigins].every(origin => baselineOrigins.has(origin))
    && [...baselineOrigins].every(origin => remainingOrigins.has(origin))
  report.cleanup.remainingLoopbackOrigins = [...remainingOrigins]
  report.cleanup.ownerPid = process.pid
  report.cleanup.pidMatchesOwner = report.process.pid === process.pid
  try {
    assert.equal(path.dirname(runtimeRootResolved), path.resolve(reportDir))
    assertContained(reportDir, runtimeRootResolved, 'case-')
    report.cleanup.targetContained = true
  } catch (error) {
    report.cleanup.cleanupError = error instanceof Error ? error.message : String(error)
  }
  const safeToRemoveRuntime = report.cleanup.coreClosed && report.cleanup.importerClosed
    && report.cleanup.repositoryClosed && report.cleanup.listenerReleased && report.cleanup.targetContained
  if (safeToRemoveRuntime) {
    try {
      await rm(runtimeRootResolved, { recursive: true, force: true })
      report.cleanup.runtimeRemoved = true
    } catch (error) {
      report.cleanup.cleanupError = error instanceof Error ? error.message : String(error)
    }
  } else report.cleanup.runtimePreservedOnCloseFailure = true
  // Keep the network boundary installed until Core, importer, repository, and
  // their pending callbacks have all been closed; only then restore fetch.
  if (fetchInstalled) globalThis.fetch = originalFetch
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
}

if (!report.cleanup.coreClosed || !report.cleanup.importerClosed || !report.cleanup.repositoryClosed
  || !report.cleanup.listenerReleased || !report.cleanup.targetContained || !report.cleanup.runtimeRemoved
  || !report.cleanup.pidMatchesOwner) {
  process.exitCode = 1
}
