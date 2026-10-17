import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
await mkdir(runtimeBase, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(runtimeBase, 'core-event-stream-'))

// Do not inherit ambient provider, Bridge, or Host settings into this fresh Core.
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
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')

const report = {
  mode: 'real-core-project-event-sse-byte-relay',
  originalUserDatabaseOpened: false,
  externalBridgeOrProviderStarted: false,
  inheritedBridgeHostValuesInspected: false,
  coreManagedCaptureWatchStarted: true,
  coreCaptureWatchRuleCount: 0,
  projectWatcherStarted: false,
  autoSyncStarted: false,
  coreServerClosed: false,
  relayDisposed: false,
  cases: [],
}

let repository
let coreServer
let relayServer
let relay
const directControllers = []
const directReaders = []

function eventName(frame) {
  return frame.split('\n').find((line) => line.startsWith('event: '))?.slice('event: '.length)
}

function eventValue(frame) {
  const data = frame.split('\n').filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n')
  assert.ok(data, `SSE frame needs data: ${frame}`)
  return JSON.parse(data).value
}

async function readFrame(reader, state, timeoutMs = 3000) {
  for (;;) {
    const boundary = state.text.indexOf('\n\n')
    if (boundary >= 0) {
      const frame = state.text.slice(0, boundary + 2)
      state.text = state.text.slice(boundary + 2)
      return frame
    }
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out while reading Core SSE frame.')), timeoutMs)
    })
    let chunk
    try {
      chunk = await Promise.race([reader.read(), timeout])
    } finally {
      clearTimeout(timer)
    }
    if (chunk.done) throw new Error('Core SSE closed before the expected frame arrived.')
    state.text += state.decoder.decode(chunk.value, { stream: true })
  }
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}

function openDirect(coreOrigin, pathname) {
  const controller = new AbortController()
  directControllers.push(controller)
  return fetch(coreOrigin + pathname, { signal: controller.signal }).then((response) => {
    const reader = response.body.getReader()
    directReaders.push(reader)
    return { response, reader, state: { text: '', decoder: new TextDecoder() }, controller }
  })
}

function openRelay(relayOrigin, pathname) {
  return fetch(relayOrigin + pathname).then((response) => ({
    response,
    reader: response.body.getReader(),
    state: { text: '', decoder: new TextDecoder() },
  }))
}

try {
  const compositionEntry = path.join(runtimeRoot, 'core-event-stream.mjs')
  const coreEntry = path.join(runtimeRoot, 'local-core-index.mjs')
  await buildPilotEntry('lab/pilot/core-event-stream.ts', compositionEntry)
  await buildPilotEntry('lcos/apps/local-core/src/index.ts', coreEntry)
  const [streamModule, core] = await Promise.all([
    import(pathToFileURL(compositionEntry).href),
    import(pathToFileURL(coreEntry).href),
  ])

  repository = new core.SqliteMetadataRepository(path.join(runtimeRoot, 'core.sqlite'), { disposableOnly: true })
  const projectRoot = path.join(runtimeRoot, 'synthetic-project')
  const snapshot = core.createMvpSampleSnapshot(projectRoot)
  repository.save(snapshot)
  const projectId = String(snapshot.project.id)
  assert.equal(repository.listCaptureWatchRules().length, 0)

  coreServer = core.createLocalCoreServer({
    metadataRepository: repository,
    port: 0,
    previewCacheRoot: path.join(runtimeRoot, 'preview-cache'),
    agentletsRoot: path.join(runtimeRoot, 'agentlets'),
    allowedOrigins: [],
  })
  const coreAddress = await coreServer.start()
  const coreOrigin = `http://${coreAddress.host}:${coreAddress.port}`
  report.coreCaptureWatchRuleCount = repository.listCaptureWatchRules().length

  // Credentials in coreOrigin are rejected before a relay listener can use it.
  assert.throws(() => streamModule.createCoreEventStream({
    coreOrigin: coreOrigin.replace('http://', 'http://user:secret@'),
    projectId,
  }), /explicit loopback HTTP origin/)

  relay = streamModule.createCoreEventStream({ coreOrigin, projectId, connectTimeoutMs: 3000 })
  relayServer = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
    void relay.handle(request, response, url).then((handled) => {
      if (!handled && !response.headersSent) {
        response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'No relay route.' } }))
      }
    }).catch((error) => {
      if (!response.headersSent) {
        response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ ok: false, error: { code: 'RELAY_ERROR', message: String(error) } }))
      } else if (!response.destroyed) response.destroy(error)
    })
  })
  const relayOrigin = await listen(relayServer)
  const relayPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}/events`
  const directPath = `/projects/${encodeURIComponent(projectId)}/events`

  const relayed = await openRelay(relayOrigin, relayPath)
  assert.equal(relayed.response.status, 200)
  assert.equal(relayed.response.headers.get('content-type'), 'text/event-stream; charset=utf-8')
  assert.match(relayed.response.headers.get('cache-control') ?? '', /no-cache/)
  assert.match(relayed.response.headers.get('cache-control') ?? '', /no-transform/)
  const direct = await openDirect(coreOrigin, directPath)
  assert.equal(direct.response.status, 200)
  const relayedSnapshotFrame = await readFrame(relayed.reader, relayed.state)
  const directSnapshotFrame = await readFrame(direct.reader, direct.state)
  assert.equal(eventName(relayedSnapshotFrame), 'snapshot')
  assert.equal(relayedSnapshotFrame, directSnapshotFrame, 'relay must preserve the actual Core snapshot frame bytes')
  const snapshotValue = eventValue(relayedSnapshotFrame)
  assert.equal(snapshotValue.projectId, projectId)
  const runtimeId = snapshotValue.runtimeId
  assert.ok(runtimeId)
  report.cases.push('snapshot frame bytes match the same live Core ProjectEventHub stream')

  // Connect through the actual Core Receiver route. It writes a canonical
  // ConnectedConversation and publishes continuity.changed on Core's hub.
  const connectedResponse = await fetch(`${coreOrigin}/projects/${encodeURIComponent(projectId)}/connected-conversations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'connect',
      provider: 'codex',
      executorId: 'event-stream-test-executor',
      conversationRef: 'event-stream-test-session',
      label: 'Core SSE receiver test',
    }),
  })
  const connectedBody = await connectedResponse.json()
  assert.equal(connectedResponse.status, 201, JSON.stringify(connectedBody))
  const connectedId = connectedBody.value.id
  const relayedProjectFrame = await readFrame(relayed.reader, relayed.state)
  const directProjectFrame = await readFrame(direct.reader, direct.state)
  assert.equal(eventName(relayedProjectFrame), 'project-event')
  assert.equal(relayedProjectFrame, directProjectFrame, 'relay must preserve the actual Core event frame bytes')
  const envelope = eventValue(relayedProjectFrame)
  assert.equal(envelope.projectId, projectId)
  assert.equal(envelope.runtimeId, runtimeId)
  assert.equal(envelope.channel, 'continuity')
  assert.equal(envelope.type, 'continuity.changed')
  assert.equal(envelope.payload.kind, 'receiver.connected')
  assert.deepEqual(envelope.entityRefs, [connectedId])
  report.cases.push('real Receiver connect produces the exact Core project-event frame through the relay')

  // Preserve the incoming query exactly. The active Core owner recognizes
  // lastSeenProjectSeq/runtimeId; afterSeq remains present but that owner does
  // not consume it (the older events.ts handler is shadowed by this route).
  const reconnectQuery = `?afterSeq=999&runtimeId=${encodeURIComponent(runtimeId)}&lastSeenProjectSeq=0`
  const relayedReplay = await openRelay(relayOrigin, relayPath + reconnectQuery)
  const directReplay = await openDirect(coreOrigin, directPath + reconnectQuery)
  assert.equal(relayedReplay.response.status, 200)
  assert.equal(directReplay.response.status, 200)
  const relayedReplayFrame = await readFrame(relayedReplay.reader, relayedReplay.state)
  const directReplayFrame = await readFrame(directReplay.reader, directReplay.state)
  assert.equal(eventName(relayedReplayFrame), 'replay')
  assert.equal(relayedReplayFrame, directReplayFrame, 'reconnect frame must match Core byte-for-byte')
  assert.equal(eventValue(relayedReplayFrame).events[0].payload.kind, 'receiver.connected')
  report.cases.push('afterSeq/runtimeId query is forwarded unchanged; current Core owner replays via lastSeenProjectSeq')

  // Unknown query parameters are interpreted by the real owner. It currently
  // accepts them and sends its snapshot; the relay adds no invented rejection.
  const unknownQuery = '?unknownQuery=keep-me'
  const relayedUnknown = await openRelay(relayOrigin, relayPath + unknownQuery)
  const directUnknown = await openDirect(coreOrigin, directPath + unknownQuery)
  assert.equal(relayedUnknown.response.status, 200)
  assert.equal(directUnknown.response.status, 200)
  const unknownRelayFrame = await readFrame(relayedUnknown.reader, relayedUnknown.state)
  const unknownCoreFrame = await readFrame(directUnknown.reader, directUnknown.state)
  assert.equal(eventName(unknownRelayFrame), 'snapshot')
  assert.equal(unknownRelayFrame, unknownCoreFrame)
  report.cases.push('unknown query follows actual Core behavior: 200 snapshot, not a relay-invented error')

  // Foreign IDs reach this isolated Core so its own 404 status and body remain
  // authoritative. No successful foreign stream is forwarded by the relay.
  const foreignPath = '/api/lcos/core/projects/foreign-event-project/events'
  const foreignRelayResponse = await fetch(relayOrigin + foreignPath)
  const foreignCoreResponse = await fetch(`${coreOrigin}/projects/foreign-event-project/events`)
  const [foreignRelayBytes, foreignCoreBytes] = await Promise.all([
    foreignRelayResponse.arrayBuffer(),
    foreignCoreResponse.arrayBuffer(),
  ])
  assert.equal(foreignRelayResponse.status, 404)
  assert.equal(foreignCoreResponse.status, 404)
  assert.deepEqual(Buffer.from(foreignRelayBytes), Buffer.from(foreignCoreBytes))
  report.cases.push('foreign-project 404 status and body are preserved from Core')

  const wrongMethod = await fetch(relayOrigin + relayPath, { method: 'POST' })
  assert.equal(wrongMethod.status, 405)
  assert.equal(wrongMethod.headers.get('allow'), 'GET')
  const encodedSeparator = await fetch(`${relayOrigin}/api/lcos/core/projects/${encodeURIComponent(projectId)}%2Fforeign/events`)
  assert.equal(encodedSeparator.status, 400)
  const credentialQuery = await fetch(relayOrigin + relayPath + '?token=must-not-forward')
  assert.equal(credentialQuery.status, 400)
  report.cases.push('wrong method, encoded separator, and credential query are rejected before Core fetch')

  await relay.dispose()
  report.relayDisposed = true
  const terminalReads = await Promise.all([
    relayed.reader.read(),
    relayedReplay.reader.read(),
  ])
  assert.ok(terminalReads.every((result) => result.done), 'dispose must close all active relayed streams')
  for (const controller of directControllers) controller.abort()
  await Promise.all(directReaders.map((reader) => reader.cancel().catch(() => undefined)))
  report.subscribersAfterClose = []
  let subscriberCount = -1
  const closeDeadline = Date.now() + 1500
  while (Date.now() < closeDeadline) {
    const realtime = await fetch(`${coreOrigin}/debug/realtime`).then((response) => response.json())
    subscriberCount = realtime.value.projects[projectId].subscribers
    report.subscribersAfterClose.push(subscriberCount)
    if (subscriberCount === 0) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(subscriberCount, 0, `Core ProjectEventHub still has subscribers: ${report.subscribersAfterClose.join(',')}`)
  report.cases.push('dispose cancels upstream Core subscriptions and closes downstream streams')
  report.runtimeId = runtimeId
  report.projectId = projectId
  report.relayBodyFramesComparedByteForByte = 3
  report.coreOwnerObservedUnknownQueryStatus = unknownRelayFrame.length > 0 ? 200 : null
  report.passed = true
} catch (error) {
  report.passed = false
  report.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  if (relay) await relay.dispose()
  report.relayDisposed = true
  for (const controller of directControllers) controller.abort()
  await Promise.all(directReaders.map((reader) => reader.cancel().catch(() => undefined)))
  if (relayServer) await new Promise((resolve) => relayServer.close(() => resolve()))
  if (coreServer) {
    await coreServer.close()
    report.coreServerClosed = true
  }
  if (repository) repository.close()
  const runtimeRootResolved = path.resolve(runtimeRoot)
  assert.equal(path.dirname(runtimeRootResolved), path.resolve(runtimeBase))
  await rm(runtimeRootResolved, { recursive: true, force: true })
  await writeFile(path.join(root, 'evidence', 'core-event-stream.json'), JSON.stringify(report, null, 2) + '\n', 'utf8')
}

console.log(JSON.stringify(report, null, 2))
