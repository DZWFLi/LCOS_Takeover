import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Server as NetServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs'
import { nativeCoreRunEventSourcePath, transformNativeCoreRunEventSource } from '../lab/native-core-runtime-source-transform.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dependencyRequire = createRequire(path.join(installedRoot, 'package.json'))
const esbuild = dependencyRequire('esbuild')
const runtimeBase = path.join(root, '.runtime', 'native-core-run-events')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const runtimeRoot = path.join(runtimeBase, `case-${stamp}`)
const reportPath = path.join(runtimeBase, `${stamp}.json`)
const entryPath = path.join(runtimeRoot, 'entry.mjs')
const outputPath = path.join(runtimeRoot, 'native-core-run-events.mjs')
const serverSourcePath = path.join(root, nativeCoreRunEventSourcePath)
let originalServerSource
await mkdir(runtimeRoot, { recursive: true })

// Clear inherited integration endpoints/tokens by key name only; never read values.
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
  'TOGETHER_API_KEY', 'FIREWORKS_BASE_URL', 'FIREWORKS_API_KEY', 'ARK_BASE_URL', 'ARK_API_KEY',
  'PERPLEXITY_BASE_URL', 'PERPLEXITY_API_KEY', 'BEDROCK_BASE_URL', 'BEDROCK_API_KEY',
  'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_API_VERSION', 'LMSTUDIO_BASE_URL',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
// If an unexpected embedding path is touched, it has only a dead local destination.
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const originalFetch = globalThis.fetch.bind(globalThis)
let facadeFetchInstalled = false
const allowedCoreOrigins = new Set()
const network = { allowedCore: [], blocked: [], deadOllama: [] }
const streams = []
let coreEvents
let legacyEvents
let lastRunEventRows
let lastRunId
let facade
let failure
const report = {
  at: new Date().toISOString(),
  scope: 'real temporary Local Core RunEvent → canonical ProjectEventHub SSE',
  runtimeRoot,
  reportPath,
  originalUserDatabaseOpened: false,
  temporaryCoreDatabaseCreated: false,
  copiedSourceWritten: false,
  secondEventBusCreated: false,
  runDispatched: false,
  runAccepted: false,
  firstRunHadNoLegacyActiveContextSubscriber: true,
  secondRunHadLegacyActiveContextSubscriber: false,
  oldSinkSourceGateObserved: false,
  oldSinkNoListenerEvidence: null,
  cases: [],
  network,
}

function listeningLoopbackOrigins() {
  const origins = new Set()
  for (const handle of process._getActiveHandles()) {
    if (!(handle instanceof NetServer) || !handle.listening) continue
    const address = handle.address()
    if (!address || typeof address === 'string' || !['127.0.0.1', '::1'].includes(address.address)) continue
    const hostname = address.address.includes(':') ? `[${address.address}]` : address.address
    origins.add(`http://${hostname}:${address.port}`)
  }
  return origins
}

function installFetchBoundary() {
  if (facadeFetchInstalled) return
  facadeFetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : String(input)
    const url = new URL(address)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (url.origin === 'http://127.0.0.1:1') {
      network.deadOllama.push({ method, path: url.pathname })
      throw new Error('native Core RunEvent test blocks the pinned dead Ollama endpoint')
    }
    const live = listeningLoopbackOrigins()
    if (url.protocol === 'http:' && allowedCoreOrigins.has(url.origin) && live.has(url.origin)) {
      network.allowedCore.push({ method, origin: url.origin, path: url.pathname })
      return originalFetch(input, init)
    }
    const blocked = { method, origin: url.origin, path: url.pathname }
    network.blocked.push(blocked)
    throw new Error('native Core RunEvent test blocked non-Core or non-listening network access')
  }
}

function extractSinkBody(source) {
  const match = source.match(/  metadata\?\.setRunEventSink\?\.\(\(event\) => \{([\s\S]*?)\r?\n  \}\)\r?\n  let server/)
  assert.ok(match, 'the exact copied Core RunEvent sink must remain present')
  return match[1]
}

function executeSinkBody(body, listeners) {
  const publications = []
  let legacyCalls = 0
  const event = { runId: 'run-source-probe', payload: { projectId: 'source-probe-project' } }
  const projectEvents = { publish: (...args) => publications.push(args) }
  const metadata = { getRun: () => ({ projectId: 'source-probe-project' }) }
  const executableBody = esbuild.transformSync(body, { loader: 'ts', format: 'cjs' }).code
  const invoke = new Function('metadata', 'runEventListeners', 'projectEvents', 'event', executableBody)
  invoke(metadata, listeners, projectEvents, event)
  if (listeners.has('source-probe-project')) legacyCalls = listeners.get('source-probe-project').size
  return { publications, legacyCalls }
}

function parseFrame(raw) {
  const lines = raw.replaceAll('\r', '').split('\n')
  const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message'
  const dataLines = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart())
  const data = dataLines.length ? JSON.parse(dataLines.join('\n')) : undefined
  return { event, data }
}

function openSse(response, controller) {
  assert.equal(response.status, 200)
  const reader = response.body.getReader()
  let buffer = ''
  let queued = []
  const history = []
  const stream = {
    async nextMatching(predicate, label, timeoutMs = 5_000) {
      const takeQueued = () => {
        const index = queued.findIndex(predicate)
        return index < 0 ? undefined : queued.splice(index, 1)[0]
      }
      const queuedMatch = takeQueued()
      if (queuedMatch) return queuedMatch
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const remaining = deadline - Date.now()
        let timer
        const next = await Promise.race([
          reader.read(),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), remaining) }),
        ]).finally(() => clearTimeout(timer))
        if (next.done) throw new Error(`SSE stream closed before ${label}`)
        buffer += new TextDecoder().decode(next.value, { stream: true }).replaceAll('\r\n', '\n')
        let split
        while ((split = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, split)
          buffer = buffer.slice(split + 2)
          const frame = parseFrame(raw)
          history.push(frame)
          if (predicate(frame)) return frame
          queued.push(frame)
        }
        const queuedMatch = takeQueued()
        if (queuedMatch) return queuedMatch
      }
      throw new Error(`Timed out waiting for ${label}`)
    },
    frames() { return [...history] },
    queuedFrames() { return [...queued] },
    close() { controller.abort(); void reader.cancel().catch(() => {}) },
  }
  streams.push(stream)
  return stream
}

async function getJson(origin, route) {
  const response = await fetch(new URL(route, origin))
  const body = await response.json()
  assert.equal(response.status, 200, `${route}: ${JSON.stringify(body)}`)
  return body
}

async function createRun(origin, projectId, label) {
  const response = await fetch(new URL(`/projects/${encodeURIComponent(projectId)}/runs`, origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      instruction: `只读事件接缝测试 · ${label}`,
      outputIntent: 'analyze',
      requestedProvider: 'codex',
    }),
  })
  const body = await response.json()
  assert.equal(response.status, 201, `Run create: ${JSON.stringify(body)}`)
  const run = body.value?.review?.run
  assert.ok(run?.id, 'the real Core route must return the newly persisted Run')
  assert.equal(run.status, 'created', 'the test must not dispatch or execute this Run')
  assert.equal(body.value.review.dispatch.status, 'planned')
  return String(run.id)
}

async function currentProjectSeq(origin, projectId) {
  const debug = await getJson(origin, '/debug/realtime')
  return Number(debug.value?.projects?.[projectId]?.projectSeq ?? 0)
}

async function replayProjectEvents(origin, projectId, afterSequence, runtimeId) {
  const controller = new AbortController()
  const route = `/projects/${encodeURIComponent(projectId)}/events?lastSeenProjectSeq=${afterSequence}&runtimeId=${encodeURIComponent(runtimeId)}`
  const response = await fetch(new URL(route, origin), { signal: controller.signal })
  const stream = openSse(response, controller)
  try {
    const replay = await stream.nextMatching((frame) => frame.event === 'replay', 'canonical ProjectEventHub replay')
    assert.equal(replay.data?.value?.kind, 'replay')
    return replay.data.value.events
  } finally {
    stream.close()
  }
}

function runChangedFor(events, runId) {
  return events.filter((event) => event.channel === 'run' && event.type === 'run.changed'
    && event.entityRefs?.includes(runId) && event.payload?.runId === runId)
}

async function collectRunChanges(stream, runId, persistedRows, projectId) {
  const expected = new Map(persistedRows.map((row) => [String(row.sequence), row]))
  const observed = new Map()
  while (observed.size < expected.size) {
    const frame = await stream.nextMatching((item) => item.event === 'project-event'
      && item.data?.value?.type === 'run.changed'
      && item.data?.value?.entityRefs?.includes(runId)
      && item.data?.value?.payload?.runId === runId, `canonical run.changed for ${runId}`)
    const event = frame.data.value
    const sequence = String(event.payload?.sequence)
    const persisted = expected.get(sequence)
    assert.ok(persisted, `canonical run.changed did not resolve to one persisted RunEvent: ${JSON.stringify(event)}`)
    assert.equal(event.projectId, projectId)
    assert.equal(event.payload.type, persisted.type)
    assert.equal(observed.has(sequence), false, `duplicate canonical run.changed for sequence ${sequence}`)
    observed.set(sequence, event)
  }
  return [...observed.values()]
}

async function collectLegacyRunNotices(stream, runId, count) {
  const observed = []
  for (let index = 0; index < count; index += 1) {
    const frame = await stream.nextMatching((item) => item.event === 'runs'
      && Array.isArray(item.data?.value)
      && item.data.value.some((row) => String(row?.run?.id) === runId), `legacy runs refresh ${index + 1} for ${runId}`)
    observed.push(frame.data.value)
  }
  return observed
}

try {
  const originalSource = await readFile(serverSourcePath, 'utf8')
  originalServerSource = originalSource
  const originalSinkBody = extractSinkBody(originalSource)
  report.oldSinkSourceGateObserved = originalSinkBody.includes('if (listeners === undefined) return')
  assert.equal(report.oldSinkSourceGateObserved, true,
    'the copied source used for this build must contain the gate before Root\'s build-time transform')

  const oldWithoutCanvasListener = executeSinkBody(originalSinkBody, new Map())
  assert.equal(oldWithoutCanvasListener.publications.length, 0,
    'baseline source sink must demonstrate the lost canonical event when the old listener map is empty')
  report.oldSinkNoListenerEvidence = { canonicalPublications: 0, legacyListenerMapPresent: false }
  const oldWithCanvasListenerMap = new Map([['source-probe-project', new Set([() => {}])]])
  const oldWithCanvasListener = executeSinkBody(originalSinkBody, oldWithCanvasListenerMap)
  assert.equal(oldWithCanvasListener.publications.length, 1)
  report.cases.push('executed original sink body: no legacy listener returns before canonical publish; populated legacy listener still publishes once')

  const transformedSource = transformNativeCoreRunEventSource(originalSource, { sourcePath: serverSourcePath })
  assert.notEqual(transformedSource, originalSource)
  assert.equal(transformNativeCoreRunEventSource(transformedSource, { sourcePath: serverSourcePath }), transformedSource,
    'the one fixed build transform is idempotent')
  const transformedSinkBody = extractSinkBody(transformedSource)
  const transformedWithoutCanvasListener = executeSinkBody(transformedSinkBody, new Map())
  assert.equal(transformedWithoutCanvasListener.publications.length, 1)
  const transformedWithCanvasListenerMap = new Map([['source-probe-project', new Set([() => {}])]])
  const transformedWithCanvasListener = executeSinkBody(transformedSinkBody, transformedWithCanvasListenerMap)
  assert.equal(transformedWithCanvasListener.publications.length, 1)
  assert.equal(transformedWithCanvasListener.legacyCalls, 1)
  report.cases.push('transformed original sink body publishes once without a legacy subscriber and retains the existing optional listener callback')

  assert.throws(() => transformNativeCoreRunEventSource(originalSource, { sourcePath: path.join(root, 'lcos/apps/local-core/src/not-server.ts') }), /only applies to/)
  assert.throws(() => transformNativeCoreRunEventSource(originalSource.replace(
    'if (listeners === undefined) return', 'if (listeners === undefined) { return',
  ), { sourcePath: serverSourcePath }), /source drifted/)
  assert.throws(() => transformNativeCoreRunEventSource(originalSource + '\n' + originalSinkBody, { sourcePath: serverSourcePath }), /source drifted/)
  report.cases.push('wrong source path, partial seam drift, and duplicate seam fail closed')

  const sourceSpecifier = (target) => {
    const relative = path.relative(path.dirname(entryPath), target).replaceAll('\\', '/')
    return relative.startsWith('.') ? relative : `./${relative}`
  }
  const entrySource = `
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createLocalCoreServer } from ${JSON.stringify(sourceSpecifier(serverSourcePath))};
import { SqliteMetadataRepository } from ${JSON.stringify(sourceSpecifier(path.join(root, 'lcos/apps/local-core/src/metadata-repository.ts')))};
import { createMvpSampleSnapshot, MVP_SAMPLE_PROJECT_ID } from ${JSON.stringify(sourceSpecifier(path.join(root, 'lcos/apps/local-core/src/mvp-sample-project.ts')))};
import { ExplicitProjectCatalog } from ${JSON.stringify(sourceSpecifier(path.join(root, 'lcos/apps/local-core/src/project-catalog.ts')))};
import { createRuntimeComposition } from ${JSON.stringify(sourceSpecifier(path.join(root, 'lab/pilot/runtime-composition.ts')))};
export async function startTemporaryCore(runtimeRoot) {
  const projectRoot = path.join(runtimeRoot, 'synthetic-project');
  await mkdir(projectRoot, { recursive: true });
  const repository = new SqliteMetadataRepository(path.join(runtimeRoot, 'core.sqlite'));
  repository.save(createMvpSampleSnapshot(projectRoot));
  const project = repository.getProject(String(MVP_SAMPLE_PROJECT_ID));
  const catalog = new ExplicitProjectCatalog([{ id: project.id, name: project.name, rootPath: project.rootPath, graphVersion: project.graphVersion }]);
  const runtime = createRuntimeComposition(repository);
  const server = createLocalCoreServer({ metadataRepository: repository, ...runtime.coreServerOptions, catalog, port: 0 });
  const address = await server.start();
  const origin = 'http://' + address.host + ':' + address.port;
  return { repository, server, projectId: String(project.id), origin,
    async close() { await server.close(); repository.close(); } };
}
`
  await writeFile(entryPath, entrySource, 'utf8')
  await buildPilotEntry(path.relative(root, entryPath), outputPath, 'node')
  const bundleSource = await readFile(outputPath, 'utf8')
  assert.match(bundleSource, /runEventListeners\.get\(projectId\)[\s\S]{0,220}listeners\s*\?\?\s*\[\]/,
    'the actual Core bundle must contain the fixed transformed optional-listener sink')
  assert.deepEqual(await readFile(serverSourcePath), Buffer.from(originalSource), 'the copied Core donor remains byte-identical')
  report.cases.push('normal Node buildPilotEntry bundle contains the transformed copied server.ts while the source file stays unchanged')

  installFetchBoundary()
  const { startTemporaryCore } = await import(pathToFileURL(outputPath).href)
  facade = await startTemporaryCore(runtimeRoot)
  report.temporaryCoreDatabaseCreated = true
  const activeOrigins = listeningLoopbackOrigins()
  assert.ok(activeOrigins.has(facade.origin), 'temporary Core origin must be served by this process')
  assert.equal(activeOrigins.size, 1, 'this integration test process must have only its temporary Core server listening')
  allowedCoreOrigins.add(facade.origin)

  const coreEventsController = new AbortController()
  const coreEventsResponse = await fetch(new URL(`/projects/${encodeURIComponent(facade.projectId)}/events`, facade.origin), { signal: coreEventsController.signal })
  coreEvents = openSse(coreEventsResponse, coreEventsController)
  const initialSnapshot = await coreEvents.nextMatching((frame) => frame.event === 'snapshot', 'initial canonical ProjectEventHub snapshot')
  assert.equal(initialSnapshot.data?.value?.projectId, facade.projectId)
  const runtimeId = initialSnapshot.data.value.runtimeId
  report.cases.push('subscribed only to canonical GET /projects/:projectId/events before creating a Run')

  const seqBeforeNoLegacy = await currentProjectSeq(facade.origin, facade.projectId)
  const firstRunId = await createRun(facade.origin, facade.projectId, 'no-old-subscriber')
  report.runIds = [firstRunId]
  const firstPersistedRunEvents = (await getJson(facade.origin, `/runs/${encodeURIComponent(firstRunId)}/events`)).value
  lastRunEventRows = firstPersistedRunEvents
  lastRunId = firstRunId
  assert.ok(firstPersistedRunEvents.length > 0)
  const firstReplay = await replayProjectEvents(facade.origin, facade.projectId, seqBeforeNoLegacy, runtimeId)
  const firstRunChanged = runChangedFor(firstReplay, firstRunId)
  assert.deepEqual(firstRunChanged.map((event) => String(event.payload.sequence)).sort(),
    firstPersistedRunEvents.map((event) => String(event.sequence)).sort(),
    'each durable RunEvent must be represented once, without duplicate canonical events')
  assert.equal(await coreEvents.nextMatching((item) => item.event === 'project-event'
    && item.data?.value?.type === 'run.changed'
    && item.data?.value?.payload?.runId === firstRunId, `live canonical run.changed for ${firstRunId}`).then((frame) => frame.data.value.payload.sequence),
    firstPersistedRunEvents[0].sequence)
  assert.equal(firstRunChanged.length, firstPersistedRunEvents.length,
    'each durable RunEvent must be represented once, without duplicate canonical events')
  assert.ok(await currentProjectSeq(facade.origin, facade.projectId) > seqBeforeNoLegacy)
  report.firstRunEventTypes = firstPersistedRunEvents.map((event) => event.type)
  report.firstCanonicalRunEvents = firstRunChanged.map((event) => ({ sequence: event.payload.sequence, type: event.payload.type }))
  report.cases.push('real un-dispatched Run with no active-context subscriber emits exactly one canonical event per durable RunEvent')

  const legacyController = new AbortController()
  const legacyResponse = await fetch(new URL(`/projects/${encodeURIComponent(facade.projectId)}/active-context/events`, facade.origin), { signal: legacyController.signal })
  legacyEvents = openSse(legacyResponse, legacyController)
  await legacyEvents.nextMatching((frame) => frame.event === 'snapshot', 'legacy active-context initial snapshot')
  report.secondRunHadLegacyActiveContextSubscriber = true
  const seqBeforeWithLegacy = await currentProjectSeq(facade.origin, facade.projectId)
  const secondRunId = await createRun(facade.origin, facade.projectId, 'legacy-listener-present')
  report.runIds.push(secondRunId)
  const secondPersistedRunEvents = (await getJson(facade.origin, `/runs/${encodeURIComponent(secondRunId)}/events`)).value
  lastRunEventRows = secondPersistedRunEvents
  lastRunId = secondRunId
  const secondReplay = await replayProjectEvents(facade.origin, facade.projectId, seqBeforeWithLegacy, runtimeId)
  const secondRunChanged = runChangedFor(secondReplay, secondRunId)
  assert.deepEqual(secondRunChanged.map((event) => String(event.payload.sequence)).sort(),
    secondPersistedRunEvents.map((event) => String(event.sequence)).sort(),
    'legacy listener notification and canonical ProjectEventHub publication must not duplicate RunEvents')
  const secondLiveRunChanged = await collectRunChanges(coreEvents, secondRunId, secondPersistedRunEvents, facade.projectId)
  const secondLegacyRunNotices = await collectLegacyRunNotices(legacyEvents, secondRunId, secondPersistedRunEvents.length)
  assert.equal(secondRunChanged.length, secondPersistedRunEvents.length)
  assert.equal(secondLiveRunChanged.length, secondPersistedRunEvents.length)
  assert.ok(secondLegacyRunNotices.every((rows) => rows.some((item) => String(item?.run?.id) === secondRunId)))
  assert.ok(await currentProjectSeq(facade.origin, facade.projectId) > seqBeforeWithLegacy)
  report.secondRunEventTypes = secondPersistedRunEvents.map((event) => event.type)
  report.secondCanonicalRunEvents = secondRunChanged.map((event) => ({ sequence: event.payload.sequence, type: event.payload.type }))
  report.legacyRunRefreshCount = secondLegacyRunNotices.length
  report.cases.push('with the old active-context listener present, its Run refresh remains live and one canonical event is recorded per durable RunEvent')

  coreEvents.close()
  legacyEvents.close()
  report.runDispatched = false
  report.runAccepted = false
  report.passed = true
} catch (error) {
  failure = error
  report.passed = false
  report.error = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error)
  report.lastRunId = lastRunId
  report.lastRunEventRows = lastRunEventRows
  report.coreSseFrames = coreEvents?.frames()
  report.coreSseQueuedFrames = coreEvents?.queuedFrames()
  report.legacySseFrames = legacyEvents?.frames()
  report.legacySseQueuedFrames = legacyEvents?.queuedFrames()
  if (facade !== undefined) {
    try { report.coreRealtimeState = (await getJson(facade.origin, '/debug/realtime')).value }
    catch (debugError) { report.coreRealtimeStateError = debugError instanceof Error ? debugError.message : String(debugError) }
  }
} finally {
  for (const stream of streams) stream.close()
  if (facade !== undefined) {
    try { await facade.close() } catch (error) { report.closeError = error instanceof Error ? error.message : String(error) }
  }
  globalThis.fetch = originalFetch
  report.blockedNetworkRequests = network.blocked.length
  report.pinnedEmbeddingAttempts = network.deadOllama.length
  report.sourcePath = nativeCoreRunEventSourcePath
  report.copiedSourceUntouched = originalServerSource !== undefined
    && (await readFile(serverSourcePath, 'utf8')) === originalServerSource
  await mkdir(runtimeBase, { recursive: true })
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
}

if (failure !== undefined) {
  console.error(JSON.stringify({ passed: false, reportPath, error: report.error }, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({ passed: true, scope: report.scope, reportPath, runIds: report.runIds,
    cases: report.cases, copiedSourceUntouched: report.copiedSourceUntouched,
    runDispatched: report.runDispatched, runAccepted: report.runAccepted, network }, null, 2))
}
