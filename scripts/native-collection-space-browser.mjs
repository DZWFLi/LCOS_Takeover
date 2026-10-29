import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Resources, currentGen2Root } from '../lab/current-gen2-resources.mjs'
import {
  matchesProcessIdentity,
  queryCommandLine,
  reserveLoopbackPort,
  stopExactProcess,
  waitForCommandLine,
  waitForExit,
  waitForHealth,
  waitForProcessGone,
} from './native-execution-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
const reportDir = path.join(runtimeBase, 'native-collection-space-browser')
const verifyHistory = process.argv.includes('--verify-history')
const verifyNested = process.argv.includes('--verify-nested')
const verifyArrange = verifyNested || process.argv.includes('--verify-arrange')
const runtimeLabel = 'isolated-collection-space-' + (verifyNested ? 'nested-' : verifyArrange ? 'arrange-' : verifyHistory ? 'history-' : '') + Date.now()
const runtimeRoot = path.join(runtimeBase, runtimeLabel)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const reportPath = path.join(reportDir, stamp + '.json')
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
const projectId = 'disposable-surface-core-facade'

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--run-isolated')) {
    console.error('Not started. Use --run-isolated to create a fresh loopback-only Core runtime; live runtimes are never used.')
    process.exitCode = 2
  } else await run()
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}'
  }
  return JSON.stringify(value) ?? 'undefined'
}

function safeAddress(value) {
  try {
    const url = new URL(value)
    return url.origin + url.pathname + (url.search ? '?<query-redacted>' : '')
  } catch { return String(value).slice(0, 300) }
}

function readRef(node) {
  const ref = node?.data?.lcos_ref
  if (!isRecord(ref) || ref.version !== 1 || !['artifact', 'view'].includes(ref.entityType)
    || typeof ref.artifactId !== 'string' || !ref.artifactId
    || typeof ref.artifactViewId !== 'string' || !ref.artifactViewId
    || typeof ref.revisionId !== 'string' || !ref.revisionId) return undefined
  return ref
}

function parentIdOf(node) {
  const value = node?.parent_id ?? node?.parentId
  return typeof value === 'string' && value ? value : undefined
}

function absolutePosition(nodes, nodeId) {
  const byId = new Map(nodes.map(node => [String(node.id), node]))
  const visited = new Set()
  const node = byId.get(String(nodeId))
  if (!node || !Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y)) return undefined
  let x = node.position.x
  let y = node.position.y
  let parentId = parentIdOf(node)
  while (parentId) {
    if (visited.has(parentId)) return undefined
    visited.add(parentId)
    const parent = byId.get(parentId)
    if (!parent || !Number.isFinite(parent.position?.x) || !Number.isFinite(parent.position?.y)) return undefined
    x += parent.position.x
    y += parent.position.y
    parentId = parentIdOf(parent)
  }
  return { x, y }
}

function fingerprintNode(node) {
  return { id: node.id, type: node.type ?? null, position: node.position ?? null,
    parent_id: node.parent_id ?? node.parentId ?? null, width: node.width ?? null,
    height: node.height ?? null, measured: node.measured ?? null,
    selected: node.selected === true, data: node.data ?? null }
}

function fingerprintCanvas(canvas) {
  return { id: canvas?.id ?? null, version: canvas?.version ?? null,
    viewport: canvas?.viewport ?? canvas?.state?.viewport ?? null,
    nodes: Array.isArray(canvas?.nodes) ? canvas.nodes.map(fingerprintNode) : [],
    edges: Array.isArray(canvas?.edges) ? canvas.edges : [] }
}

function closeTo(a, b, epsilon = 0.021) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon
}

function mutationParentId(node) {
  const value = node?.parent_id ?? node?.parentId
  return typeof value === 'string' && value ? value : ''
}

function expectedArrangementScope(nodes, frameId, admittedIds) {
  const byId = new Map(nodes.map(node => [String(node.id), node]))
  const ids = new Set([frameId, ...nodes.filter(node => parentIdOf(node) === frameId).map(node => String(node.id)), ...admittedIds])
  const visited = new Set([frameId])
  let parent = parentIdOf(byId.get(frameId))
  while (parent) {
    assert.equal(visited.has(parent), false, 'Fixture ancestry must be acyclic.')
    visited.add(parent)
    const ancestor = byId.get(parent)
    assert.equal(ancestor?.type, 'group', 'Nested fixture ancestors must be actual projected Collection groups.')
    ids.add(parent)
    for (const node of nodes.filter(node => parentIdOf(node) === parent)) ids.add(String(node.id))
    parent = parentIdOf(ancestor)
  }
  return [...ids].sort()
}

function collectionSpaceActions(plan, phase, canvasId) {
  const beforeById = new Map((plan.before_nodes ?? []).map(node => [String(node.id), node]))
  const afterById = new Map((plan.after_nodes ?? []).map(node => [String(node.id), node]))
  const spaceBefore = new Map((plan.space?.before ?? []).map(node => [String(node.id), node]))
  const spaceAfter = new Map((plan.space?.after ?? []).map(node => [String(node.id), node]))
  const children = [...spaceBefore.keys()].filter(id => id !== String(plan.frame_id))
  const frameId = String(plan.frame_id)
  const makeUpdate = (id, side) => {
    const source = beforeById.get(id) ?? afterById.get(id)
    const target = side === 'after' ? afterById.get(id) : beforeById.get(id)
    const slice = (side === 'after' ? spaceAfter : spaceBefore).get(id)
    assert.ok(source && target && slice, 'Prepared Collection plan omitted native child ' + id)
    return { id, canvas_id: canvasId, type: source.type, data: source.data,
      position: target.position, measured: target.measured, parent_id: slice.parentId ?? '' }
  }
  const createFrame = () => {
    const frame = afterById.get(frameId)
    assert.ok(frame, 'Prepared Collection plan omitted its native group DTO.')
    return { id: frame.id, canvas_id: canvasId, type: frame.type, position: frame.position,
      measured: frame.measured, data: frame.data,
      ...(mutationParentId(frame) ? { parent_id: mutationParentId(frame) } : {}) }
  }
  if (phase === 'apply' || phase === 'redo') return [
    { action: 'create', nodes: [createFrame()] },
    { action: 'update', updates: children.map(id => makeUpdate(id, 'after')) },
  ]
  if (phase === 'undo') return [
    { action: 'delete', delete_ids: [frameId] },
    { action: 'update', updates: children.map(id => makeUpdate(id, 'before')) },
  ]
  throw new Error('Unsupported Collection history phase: ' + phase)
}

export function assertCollectionSpaceBatchShape(body, plan, phase, canvasId) {
  assert.ok(isRecord(body))
  const allowedTopLevel = new Set(['canvas_id', 'actions', 'created_by_role', 'lcos_operation',
    'lcos_expected_canvas_version', 'lcos_expected_revisions', 'lcos_refs', 'lcos_snapshots'])
  assert.ok(Object.keys(body).every(key => allowedTopLevel.has(key)), 'Collection space batch has an unknown top-level field.')
  assert.equal(body.canvas_id, canvasId)
  assert.equal(body.created_by_role === undefined || body.created_by_role === 'user', true)
  assert.ok(Number.isSafeInteger(body.lcos_expected_canvas_version) && body.lcos_expected_canvas_version >= 0)
  for (const key of ['lcos_refs', 'lcos_snapshots']) {
    if (body[key] === undefined) continue
    assert.ok(isRecord(body[key]) && Object.keys(body[key]).length === 0,
      key + ' cannot carry material identity or lifecycle data for a spatial Collection operation.')
  }
  if (body.lcos_expected_revisions !== undefined) {
    assert.ok(isRecord(body.lcos_expected_revisions))
    const beforeById = new Map(plan.before_nodes.map(node => [String(node.id), node]))
    for (const [id, revisionId] of Object.entries(body.lcos_expected_revisions)) {
      assert.equal(revisionId, readRef(beforeById.get(id))?.revisionId,
        'Original material revision CAS must match this exact scoped canonical node.')
      assert.equal(typeof revisionId, 'string')
    }
  }
  const operation = body.lcos_operation
  assert.ok(isRecord(operation))
  assert.deepEqual(Object.keys(operation).sort(), ['kind', 'operationId', 'phase', 'space', 'version'])
  assert.equal(operation.version, 1)
  assert.equal(operation.kind, 'collection-space')
  assert.equal(operation.phase, phase)
  assert.equal(typeof operation.operationId, 'string')
  assert.ok(operation.operationId.trim())
  assert.equal(stableJson(operation.space), stableJson(plan.space), 'O8 must replay the exact prepared space slices.')
  const expected = collectionSpaceActions(plan, phase, canvasId)
  const normalizedActions = body.actions.map(action => {
    if (action.action === 'create') {
      assert.equal(Object.hasOwn(action, 'creates') !== Object.hasOwn(action, 'nodes'), true)
      assert.ok(Object.keys(action).every(key => ['action', 'creates', 'nodes'].includes(key)))
      return { action: 'create', nodes: (action.nodes ?? action.creates).map(node => {
        // M8 redo serializes an absent root parent as the original empty string.
        if (node.parent_id !== '') return node
        const { parent_id, ...rootNode } = node
        return rootNode
      }) }
    }
    if (action.action === 'update') return { ...action, updates: action.updates.map(node => ({ canvas_id: canvasId, ...node })) }
    return action
  })
  assert.equal(stableJson(normalizedActions), stableJson(expected),
    'Native O8 actions must be the exact original create/delete plus child-geometry batch from the prepared DTO.')
}

export function assertCollectionArrangeBatchShape(body, plan, phase, canvasId) {
  assert.ok(isRecord(body))
  assert.ok(Object.keys(body).every(key => ['canvas_id', 'actions', 'created_by_role', 'lcos_operation',
    'lcos_expected_canvas_version', 'lcos_expected_revisions', 'lcos_refs', 'lcos_snapshots'].includes(key)))
  assert.equal(body.canvas_id, canvasId)
  assert.ok(body.created_by_role === undefined || body.created_by_role === 'user')
  assert.ok(Number.isSafeInteger(body.lcos_expected_canvas_version) && body.lcos_expected_canvas_version >= 0)
  for (const key of ['lcos_refs', 'lcos_snapshots']) if (body[key] !== undefined) assert.deepEqual(body[key], {})
  const operation = body.lcos_operation
  assert.deepEqual(Object.keys(operation).sort(), ['kind', 'operationId', 'phase', 'space', 'version'])
  assert.equal(operation.version, 1)
  assert.equal(operation.kind, 'collection-arrange')
  assert.equal(operation.phase, phase)
  assert.ok(typeof operation.operationId === 'string' && operation.operationId.trim())
  assert.equal(stableJson(operation.space), stableJson(plan.space))
  const before = new Map(plan.space.before.map(slice => [slice.id, slice]))
  const sameSlice = (a, b) => stableJson(a) === stableJson(b)
  const changed = plan.space.after.filter(slice => !sameSlice(before.get(slice.id), slice)).map(slice => slice.id)
  assert.deepEqual([...changed].sort(), [...plan.changed_node_ids].sort())
  const dtos = new Map((phase === 'undo' ? plan.before_nodes : plan.after_nodes).map(node => [String(node.id), node]))
  if (body.lcos_expected_revisions !== undefined) {
    assert.ok(isRecord(body.lcos_expected_revisions))
    for (const [id, revision] of Object.entries(body.lcos_expected_revisions)) {
      // The original revision map can protect an unchanged material in the
      // exact operation scope; it is not a request to update that node.
      assert.ok(before.has(id))
      assert.equal(typeof revision, 'string')
      assert.equal(revision, readRef(dtos.get(id))?.revisionId)
    }
  }
  assert.equal(body.actions.length, 1)
  assert.deepEqual(Object.keys(body.actions[0]).sort(), ['action', 'updates'])
  assert.equal(body.actions[0].action, 'update')
  const updates = body.actions[0].updates
  assert.deepEqual(updates.map(node => String(node.id)).sort(), [...changed].sort())
  assert.equal(new Set(updates.map(node => node.id)).size, updates.length)
  for (const patch of updates) {
    const dto = dtos.get(String(patch.id))
    assert.ok(dto)
    assert.ok(Object.keys(patch).every(key => ['id', 'canvas_id', 'type', 'data', 'position', 'measured', 'parent_id'].includes(key)))
    if (patch.canvas_id !== undefined) assert.equal(patch.canvas_id, canvasId)
    assert.equal(patch.type, dto.type)
    assert.deepEqual(patch.data, dto.data)
    assert.deepEqual(patch.position, dto.position)
    assert.deepEqual(patch.measured, dto.measured)
    assert.equal(patch.parent_id ?? '', mutationParentId(dto))
  }
}

function nodeSelector(id) {
  const safe = String(id).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  return '.react-flow__node[data-id="' + safe + '"]'
}

// These synthetic source bodies contain only a Markdown heading and plain
// paragraphs. Compare their visible lines, not literal Markdown syntax which
// the original Gen1 rich-text renderer intentionally does not display.
function fixtureVisibleLines(body) {
  return String(body).split(/\r?\n/).map(line => line.replace(/^#{1,6}\s+/, '').trim()).filter(Boolean)
}

async function loopbackListening(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    let settled = false
    const finish = listening => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ listening })
    }
    socket.setTimeout(800)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function run() {
  const report = {
    schema: 'native-collection-space-browser-v1',
    mode: verifyNested ? 'native-menu-nested-arrange-ancestor-fit-undo-redo'
      : verifyArrange ? 'native-menu-arrange-admission-undo-redo' : verifyHistory ? 'native-o8-first-open-undo-redo' : 'bootstrap-first-open-readback',
    at: new Date().toISOString(),
    passed: false,
    runtimeLabel,
    runtimeRoot,
    reportPath,
    projectId,
    flowScope: verifyNested ? 'original nested Collection arrange, ancestor fit and sibling geometry, O8 undo/redo, independent subtree display and reload in one original TapNow Flow'
      : verifyArrange ? 'original collection member menu, arrange existing children plus free-member admission, O8 undo/redo and reload in one original TapNow Flow'
      : verifyHistory ? 'original folder first-open, O8 apply/undo/redo and display-only collapse/reopen in one original TapNow Flow'
      : 'bottom-level original Huabu frame to TapNow group readback only',
    userExpandClick: false,
    o8Undo: false,
    o8Redo: false,
    providerExecution: false,
    modelExecution: false,
    fixture: {
      kind: verifyNested ? 'real inner/outer Core Collections and original first-open hierarchy; one synthetic sibling text created by the original native lifecycle; no Artifact copy or model output'
        : 'manual Core Collection references existing Main text/image Artifacts; no Artifact copy or generated result',
      browserMutation: verifyNested
        ? 'original inner member menu arrange, original O8 Undo/Redo, four independent inner/outer folder display clicks and real reload; both first-open operations and sibling creation are bootstrap fixtures'
        : verifyArrange
        ? 'original member menu click arranges one existing frame; keyboard Undo and Redo use the original history path; first-open and duplicate view are bootstrap fixtures'
        : verifyHistory
        ? 'original collection face click creates one O8 space operation; keyboard Undo and Redo use the original history path'
        : 'no user business action; original image DOM-size measurement is recorded separately; space operation is bootstrap only',
    },
    browser: {
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'blocked',
      browserPluginAvailable: false,
      fallback: 'repository playwright-core plus installed Chrome; isolated terminal run requested',
      externalHttpAllowed: false,
      externalWebSocketAllowed: false,
    },
    fixtureWrites: [],
    spaceOperation: null,
    spaceHistoryOperations: [],
    browserWrites: [],
    blockedWrites: [],
    unexpectedWrites: [],
    blockedHttp: [],
    blockedWebSockets: [],
    deniedNodeFetches: [],
    pinnedOllamaRejected: [],
    diagnosticTelemetry: [],
    knownBlockedUnsupported: [],
    pageErrors: [],
    consoleErrors: [],
    consoleWarnings: [],
    apiFailures: [],
    requestFailures: [],
    screenshots: [],
    cases: [],
    launcher: {},
    cleanup: {},
  }

  const envKeys = [
    'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LCOS_CODEX_AUTO_EXECUTION',
    'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT', 'HUABU_HOST_URL',
    'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN', 'HUABU_AGENTLET_ID',
    'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD', 'HUABU_DATA_DIR',
    'LCOS_OCR_PYTHON', 'LCOS_OLLAMA_URL', 'LCOS_OLLAMA_EMBED_MODEL',
  ]
  for (const key of envKeys) delete process.env[key]
  process.env.LCOS_RECOVERY_TRANSPORT = 'none'
  process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
  process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
  process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

  const originalFetch = globalThis.fetch.bind(globalThis)
  const allowedNodeOrigins = new Set()
  let bootstrapping = false
  const bootstrapListeners = () => process._getActiveHandles().flatMap(handle => {
    if (!(handle instanceof net.Server) || !handle.listening) return []
    const address = handle.address()
    if (!address || typeof address === 'string' || address.address !== '127.0.0.1'
      || !Number.isInteger(address.port) || [17879, 17880, 17881].includes(address.port)) return []
    return ['http://127.0.0.1:' + address.port]
  })
  let coreOrigin
  let origin
  let uiPort
  let mainWorkspace
  let collectionId
  let collectionNodeId
  let facade
  let launcher
  let launcherSpawned = false
  let launcherStdout = ''
  let launcherStderr = ''
  let launcherState = { closed: undefined }
  let serverPid
  let browser
  let context
  let page
  let canvasBeforeSpace
  let canvasAfterSpace
  let sourceNodes = []
  let sourceRecords = []

  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : String(input)
    const url = new URL(address)
    if (url.origin === 'http://127.0.0.1:1') {
      report.pinnedOllamaRejected.push({ method: init?.method ?? 'GET', path: url.pathname })
      throw new Error('Ollama is pinned to an unavailable loopback port; no embedding service is started.')
    }
    const bootstrapOrigins = bootstrapping ? bootstrapListeners() : []
    if (url.protocol === 'http:' && (allowedNodeOrigins.has(url.origin)
      || bootstrapOrigins.length === 1 && bootstrapOrigins[0] === url.origin)) return originalFetch(input, init)
    report.deniedNodeFetches.push({ method: init?.method ?? 'GET', origin: url.origin, path: url.pathname })
    throw new Error('Isolated Collection space runner blocks non-allowlisted Node HTTP origins.')
  }

  async function coreJson(method, pathname, body) {
    assert.ok(coreOrigin)
    const response = await originalFetch(coreOrigin + pathname, {
      method,
      headers: body === undefined ? { Accept: 'application/json' }
        : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      cache: 'no-store',
    })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
    if (response.status >= 400) report.apiFailures.push({ source: 'Core', method, path: pathname, status: response.status })
    return { status: response.status, payload, response }
  }

  async function coreValue(method, pathname, body) {
    const result = await coreJson(method, pathname, body)
    assert.equal(result.status, method === 'POST' ? 201 : 200,
      'Core ' + method + ' ' + pathname + ' failed: ' + JSON.stringify(result.payload))
    assert.equal(result.payload?.ok, true, 'Core request returned no {ok,value} envelope.')
    return result.payload.value
  }

  async function facadeCall(method, pathname, body) {
    assert.ok(facade)
    const result = await facade.handle({ method, pathname, url: new URL(pathname, origin), body })
    if (Number(result?.status) >= 400) report.apiFailures.push({ source: 'bootstrap facade', method, path: pathname, status: result.status })
    return { status: result?.status, payload: result?.body }
  }

  async function facadeData(method, pathname, body, statuses = [200]) {
    const result = await facadeCall(method, pathname, body)
    assert.ok(statuses.includes(Number(result.status)),
      'Facade ' + method + ' ' + pathname + ' failed: ' + JSON.stringify(result.payload))
    assert.equal(result.payload?.code, 0,
      'Facade ' + method + ' ' + pathname + ' returned no TapNow success envelope: ' + JSON.stringify(result.payload))
    assert.ok(isRecord(result.payload.data))
    return result.payload.data
  }

  const projectPath = () => '/projects/' + encodeURIComponent(projectId)
  const appCorePath = suffix => '/api/lcos/core' + projectPath() + suffix

  async function appJson(method, pathname, body) {
    const response = await originalFetch(origin + pathname, {
      method,
      headers: body === undefined ? { Accept: 'application/json' }
        : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      cache: 'no-store',
    })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
    if (response.status >= 400) report.apiFailures.push({ source: 'same-origin read', method, path: pathname, status: response.status })
    assert.ok(response.ok, 'Same-origin request failed: ' + method + ' ' + pathname + ' ' + JSON.stringify(payload))
    return { status: response.status, payload }
  }

  async function appCoreValue(suffix) {
    const result = await appJson('GET', appCorePath(suffix))
    assert.equal(result.payload?.ok, true, 'Core GET returned no {ok,value} envelope: ' + suffix)
    return result.payload.value
  }

  async function appCanvas(canvasId) {
    const result = await appJson('GET', '/api/canvas/v1/canvases/' + encodeURIComponent(canvasId))
    assert.equal(result.payload?.code, 0)
    assert.ok(Array.isArray(result.payload?.data?.nodes))
    return result.payload.data
  }

  async function appCoreBytes(suffix) {
    const response = await originalFetch(origin + '/api/lcos/core' + projectPath() + suffix, {
      headers: { Accept: '*/*' }, redirect: 'error', cache: 'no-store',
    })
    const bytes = Buffer.from(await response.arrayBuffer())
    if (response.status >= 400) report.apiFailures.push({ source: 'Core bytes', method: 'GET', path: suffix, status: response.status })
    assert.ok(response.ok)
    return { bytes, contentType: response.headers.get('content-type') ?? '' }
  }

  async function screenshot(label, locator) {
    if (!page) return
    const filepath = path.join(visualRoot, 'tapnow-native-collection-space-' + stamp + '-' + label + '.png')
    await mkdir(visualRoot, { recursive: true })
    if (locator) await locator.screenshot({ path: filepath, animations: 'disabled' })
    else await page.screenshot({ path: filepath, fullPage: false, animations: 'disabled' })
    report.screenshots.push({ label, path: filepath, viewport: report.browser.viewport })
  }

  async function stopLauncher() {
    if (!launcher) return
    try {
      const stdoutChildren = [...(launcherStdout + '\n' + launcherStderr)
        .matchAll(/Isolated full-integration child PID:\s*(\d+)/g)].map(match => Number(match[1]))
      const uniqueChildren = [...new Set(stdoutChildren)]
      report.launcher.childPidCandidatesFromStdout = uniqueChildren
      if (!serverPid && uniqueChildren.length === 1) {
        serverPid = uniqueChildren[0]
        report.launcher.serverPidRecoveredFromStdout = true
      } else if (serverPid && uniqueChildren.length === 1 && uniqueChildren[0] !== serverPid) {
        report.launcher.cleanup = { terminated: false, reason: 'Health and launcher stdout child PID disagree; preserved.' }
        return
      } else if (uniqueChildren.length > 1) {
        report.launcher.cleanup = { terminated: false, reason: 'Multiple isolated child PIDs are ambiguous; preserved.' }
        return
      }

      if (serverPid) {
        const health = await originalFetch(origin + '/health', { redirect: 'error', cache: 'no-store' })
          .then(response => response.ok ? response.json() : undefined).catch(() => undefined)
        const commandLine = await queryCommandLine(serverPid)
        const alreadyGone = !commandLine && await waitForProcessGone(serverPid, 1000)
        const verified = health?.pid === serverPid
          && matchesProcessIdentity(commandLine, path.join(root, 'lab', 'server.mjs'), runtimeLabel, uiPort)
        report.launcher.cleanupServer = {
          pid: serverPid, health: health ? { pid: health.pid, profile: health.profile, realCoreConnected: health.realCoreConnected } : null,
          commandLine, verified, alreadyGone, recoveredFromStdout: report.launcher.serverPidRecoveredFromStdout === true,
        }
        if (alreadyGone) report.launcher.cleanupServer.exited = true
        if (!verified && !alreadyGone) {
          report.launcher.cleanup = { terminated: false, reason: 'Health and full command line did not prove exact server identity; preserved.' }
          return
        }
        if (verified) {
          stopExactProcess(serverPid, path.join(root, 'lab', 'server.mjs'), runtimeLabel, uiPort)
          report.launcher.cleanupServer.stopRequested = true
          report.launcher.cleanupServer.exited = await waitForProcessGone(serverPid, 15000)
          if (!report.launcher.cleanupServer.exited) {
            report.launcher.cleanup = { terminated: false, reason: 'Exact isolated server did not exit; preserved.' }
            return
          }
        }
        report.launcher.cleanupServer.listenerAfterStop = await loopbackListening(uiPort)
        if (report.launcher.cleanupServer.listenerAfterStop.listening) {
          report.launcher.cleanup = { terminated: false, reason: 'The exact isolated port still has a listener; preserved.' }
          return
        }
        await waitForExit(launcher, 5000)
      }

      if (launcher.exitCode === null && !serverPid) {
        report.launcher.cleanup = { terminated: false, reason: 'No exact child PID found; launcher left untouched and runtime preserved.' }
        return
      }
      if (launcher.exitCode === null && serverPid && report.launcher.cleanupServer?.exited === true) {
        const commandLine = await queryCommandLine(launcher.pid)
        if (!matchesProcessIdentity(commandLine, path.join(root, 'scripts', 'start-full-integration.mjs'), runtimeLabel, uiPort)) {
          report.launcher.cleanup = { terminated: false, pid: launcher.pid, commandLine,
            reason: 'Launcher identity did not match this isolated label/port; left running.' }
          return
        }
        stopExactProcess(launcher.pid, path.join(root, 'scripts', 'start-full-integration.mjs'), runtimeLabel, uiPort)
        report.launcher.cleanup = { launcherPid: launcher.pid, commandLine, ownerVerified: true,
          exited: await waitForProcessGone(launcher.pid, 10000) }
      } else if (report.launcher.cleanupServer?.exited === true) {
        report.launcher.cleanup = { launcherPid: launcher.pid, launcherExitedAfterExactServerStop: launcher.exitCode !== null,
          exitCode: launcher.exitCode }
      }
    } catch (error) {
      report.launcher.cleanup = { terminated: false, reason: String(error.stack ?? error) }
    }
  }

  async function removeRuntime() {
    if (launcherSpawned && (report.launcher.cleanupServer?.exited !== true
      || report.launcher.cleanupServer?.listenerAfterStop?.listening !== false
      || report.launcher.cleanup?.launcherExitedAfterExactServerStop !== true && report.launcher.cleanup?.exited !== true)) {
      return { removed: false, reason: 'Exact server/launcher exit and port release were not all confirmed; preserved.' }
    }
    if (path.resolve(runtimeRoot) !== path.resolve(runtimeBase, runtimeLabel)
      || !runtimeLabel.startsWith('isolated-collection-space-')) {
      return { removed: false, reason: 'Runtime target did not match the exact isolated .runtime child; preserved.' }
    }
    try {
      const [base, target, info] = await Promise.all([realpath(runtimeBase), realpath(runtimeRoot), stat(runtimeRoot)])
      if (!info.isDirectory() || target === base || !target.startsWith(base + path.sep)) {
        return { removed: false, reason: 'Real runtime path did not resolve to a strict .runtime child; preserved.' }
      }
      await rm(target, { recursive: true, force: false })
      return { removed: true, exactTarget: target, confinedToRuntime: true }
    } catch (error) {
      if (error?.code === 'ENOENT') return { removed: true, alreadyAbsent: true, confinedToRuntime: true }
      return { removed: false, reason: String(error.stack ?? error) }
    }
  }

  try {
    await mkdir(reportDir, { recursive: true })
    await mkdir(visualRoot, { recursive: true })
    try { await stat(runtimeRoot); assert.fail('Refusing to reuse existing isolated runtime ' + runtimeLabel) }
    catch (error) { if (error?.code !== 'ENOENT') throw error }
    await mkdir(runtimeRoot, { recursive: true })

    uiPort = await reserveLoopbackPort()
    origin = 'http://127.0.0.1:' + uiPort
    report.origin = origin
    report.uiPort = uiPort
    const bootstrapDir = path.join(runtimeRoot, 'bootstrap')
    await mkdir(bootstrapDir, { recursive: true })
    const bootstrapBundle = path.join(bootstrapDir, 'surface-core-facade.mjs')
    await buildPilotEntry('lab/pilot/surface-core-facade.ts', bootstrapBundle)
    report.sourceManifests = { bootstrap: JSON.parse(await (await import('node:fs/promises')).readFile(bootstrapBundle + '.sources.json', 'utf8')) }
    const { startSurfaceCoreFacade } = await import(pathToFileURL(bootstrapBundle).href)
    assert.deepEqual(bootstrapListeners(), [], 'No pre-existing listener in this process may become a bootstrap Core.')
    bootstrapping = true
    try { facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true }) }
    finally { bootstrapping = false }
    coreOrigin = String(facade.core.origin)
    assert.match(coreOrigin, /^http:\/\/127\.0\.0\.1:\d+$/, 'Core must be a fresh loopback service.')
    allowedNodeOrigins.add(coreOrigin)
    assert.equal(facade.core.projectId, projectId)
    report.bootstrap = { coreOrigin, projectId, databasePath: facade.core.databasePath, realCore: true, fullIntegration: true }

    const workspaces = facade.workspaces.filter(row => String(row.projectId) === projectId && row.canvasId)
    const mains = workspaces.filter(row => row.preferredSurface === 'main')
    assert.equal(mains.length, 1, 'The disposable Core project must declare one Main Workspace.')
    mainWorkspace = mains[0]
    const rootScopes = facade.core.repository.getScopes(projectId).filter(scope => scope.kind === 'root')
    assert.equal(rootScopes.length, 1, 'The project must own one canonical Core root Scope.')
    assert.equal(String(mainWorkspace.scopeId), String(rootScopes[0].id))
    assert.ok(workspaces.every(row => String(row.scopeId) === String(rootScopes[0].id)))
    const project = projectPath()

    const graph = await coreValue('GET', project + '/graph')
    assert.ok(Array.isArray(graph.artifacts) && Array.isArray(graph.artifactViews)
      && Array.isArray(graph.artifactRevisions) && Array.isArray(graph.fileRecords))
    const beforeCanvas = await facadeData('GET', '/api/canvas/v1/canvases/' + encodeURIComponent(String(mainWorkspace.canvasId)))
    assert.equal(beforeCanvas.id, String(mainWorkspace.canvasId))
    const viewById = new Map(graph.artifactViews.map(row => [String(row.id), row]))
    const artifactById = new Map(graph.artifacts.map(row => [String(row.id), row]))
    const revisionById = new Map(graph.artifactRevisions.map(row => [String(row.id), row]))
    const fileById = new Map(graph.fileRecords.map(row => [String(row.id), row]))
    const resolveSource = node => {
      const ref = readRef(node)
      if (!ref) return undefined
      const artifact = artifactById.get(String(ref.artifactId))
      const view = viewById.get(String(ref.artifactViewId))
      const revision = revisionById.get(String(ref.revisionId))
      const file = revision && fileById.get(String(revision.fileRecordId))
      if (!artifact || !view || !revision || !file
        || String(view.artifactId) !== String(artifact.id) || String(view.revisionId) !== String(revision.id)
        || String(revision.artifactId) !== String(artifact.id) || String(artifact.currentRevisionId) !== String(revision.id)
        || String(file.projectId) !== projectId) return undefined
      return { node, ref, artifact, view, revision, file }
    }
    const projected = beforeCanvas.nodes.map(resolveSource).filter(Boolean)
    const textSource = projected.find(row => row.node.type === 'text'
      && ['text/plain', 'text/markdown'].includes(String(row.file.mimeType).split(';')[0].trim().toLowerCase()))
    const imageSource = projected.find(row => row.node.type === 'image'
      && String(row.file.mimeType).split(';')[0].trim().toLowerCase().startsWith('image/'))
    assert.ok(textSource, 'Main must already contain one real Core-bound text Artifact node.')
    assert.ok(imageSource, 'Main must already contain one real Core-bound image Artifact node.')
    sourceNodes = [textSource, imageSource]
    const sourceBytes = []
    const nestedProtectedSources = []
    for (const row of sourceNodes) {
      assert.equal(parentIdOf(row.node), undefined, 'Both original member carriers must be unparented before first-open.')
      assert.notEqual(row.node.data?.locked, true, 'Locked sources are not first-open Collection members.')
      const response = await originalFetch(coreOrigin + project + '/file-records/' + encodeURIComponent(String(row.file.id)) + '/content',
        { headers: { Accept: '*/*' }, redirect: 'error', cache: 'no-store' })
      const bytes = Buffer.from(await response.arrayBuffer())
      assert.ok(response.ok && bytes.length > 0, 'The selected Core FileRecord must contain actual bytes.')
      if (row.node.type === 'text' && typeof row.node.data?.content === 'string') {
        assert.deepEqual(Buffer.from(row.node.data.content, 'utf8'), bytes,
          'The existing Main text body must match its exact selected Core Revision bytes.')
      }
      sourceBytes.push({ type: row.node.type, nodeId: String(row.node.id), artifactId: String(row.artifact.id),
        artifactViewId: String(row.view.id), revisionId: String(row.revision.id),
        fileRecordId: String(row.file.id), mimeType: row.file.mimeType, bytes })
    }
    report.fixture.sources = sourceBytes.map(row => ({ ...row, bytes: undefined, byteLength: row.bytes.length }))
    const memberRefs = sourceBytes.map(row => ({ type: 'artifact', id: row.artifactId }))
    const title = '空间底层夹具 · ' + runtimeLabel
    const collection = await coreValue('POST', project + '/collections', { title, members: memberRefs })
    collectionId = String(collection.id)
    assert.equal(collection.projectId, projectId)
    const memberRead = await coreValue('GET', project + '/collections/' + encodeURIComponent(collectionId) + '/members')
    assert.equal(memberRead.collection.id, collectionId)
    assert.deepEqual(memberRead.members.map(row => ({ type: row.memberRef.type, id: row.memberRef.id })).sort((a, b) => a.id.localeCompare(b.id)),
      memberRefs.map(row => ({ ...row })).sort((a, b) => a.id.localeCompare(b.id)))
    report.fixtureWrites.push({ producer: 'Local Core Collections API', collectionId, title, members: memberRefs,
      existingNodeIds: sourceBytes.map(row => row.nodeId), copiedArtifacts: false })

    const presentationsPath = project + '/presentations'
    const presentationsBefore = await coreValue('GET', presentationsPath)
    assert.ok(Array.isArray(presentationsBefore))
    // Original worksiteProjectionInput addresses Main through the existing
    // root Context capability; there is no new "main" Presentation kind.
    const mainPresentationId = 'presentation:context:' + String(rootScopes[0].id)
    // The original Assembly producer creates this canonical Presentation lazily.
    // A fresh project may legitimately have no Presentation before that apply.
    assert.equal(presentationsBefore.some(row => (row.state?.memberEntityRefs ?? [])
      .some(ref => ref.type === 'collection' && ref.id === collectionId)), false)
    const runsBeforeFixture = await coreValue('GET', project + '/runs')
    assert.equal(runsBeforeFixture.length, 0)
    const providers = await coreValue('GET', '/runtime/providers')
    assert.ok(Array.isArray(providers) && providers.every(row => row.availability === 'offline'))

    const apply = await facadeCall('POST', '/api/lcos/core' + project + '/assembly/apply', {
      schemaVersion: 1,
      projectId,
      sourceRefs: [{ kind: 'collection', id: collectionId }],
      targetRef: { kind: 'main' },
    })
    assert.equal(apply.status, 200, 'Original Core Assembly fixture setup failed: ' + JSON.stringify(apply.payload))
    assert.equal(apply.payload?.ok, true)
    const appliedRows = apply.payload?.value?.results?.filter(row => row.sourceRef?.kind === 'collection' && row.sourceRef.id === collectionId) ?? []
    assert.equal(appliedRows.length, 1)
    assert.equal(appliedRows[0].status, 'applied')
    assert.equal(appliedRows[0].channel, 'presentation-membership')
    assert.equal(appliedRows[0].presentationId, mainPresentationId)
    const mainPresentation = (await coreValue('GET', presentationsPath)).find(row => row.id === mainPresentationId
      && row.projectId === projectId && row.capability === 'context'
      && String(row.scopeId) === String(rootScopes[0].id))
    assert.ok(mainPresentation, 'Original Assembly Apply must create/read its canonical Main Presentation.')
    report.fixtureWrites.push({ producer: 'original Core Assembly Apply contract; bootstrap fixture setup only',
      collectionId, targetRef: { kind: 'main' }, itemReceipt: appliedRows[0], noBrowserGesture: true })

    const projectedCollection = await facadeData('POST',
      '/api/lcos/canvases/' + encodeURIComponent(String(mainWorkspace.canvasId)) + '/collections:project', { collectionId })
    assert.equal(projectedCollection.canvas_id, String(mainWorkspace.canvasId))
    assert.equal(projectedCollection.workspace_id, String(mainWorkspace.id))
    assert.equal(projectedCollection.collection_id, collectionId)
    assert.equal(projectedCollection.provider_execution_started, false)
    assert.equal(projectedCollection.binding?.projectId, projectId)
    assert.equal(projectedCollection.binding?.canvasId, String(mainWorkspace.canvasId))
    assert.equal(projectedCollection.binding?.spatialKind, 'node')
    assert.equal(projectedCollection.binding?.entityType, 'collection')
    assert.equal(projectedCollection.binding?.entityId, collectionId)
    assert.equal(projectedCollection.node?.id, projectedCollection.binding?.spatialId)
    assert.equal(projectedCollection.node?.type, 'lcos-collection')
    collectionNodeId = String(projectedCollection.node.id)
    report.fixtureWrites.push({ producer: 'original Gen2Host ProjectToSpaceProjection / Core ProjectionBinding / Huabu',
      canvasId: String(mainWorkspace.canvasId), workspaceId: String(mainWorkspace.id), collectionId, collectionNodeId,
      binding: projectedCollection.binding, providerExecution: false })

    canvasBeforeSpace = await facadeData('GET', '/api/canvas/v1/canvases/' + encodeURIComponent(String(mainWorkspace.canvasId)))
    assert.ok(Number.isInteger(canvasBeforeSpace.version))
    assert.equal(canvasBeforeSpace.nodes.filter(node => String(node.id) === collectionNodeId).length, 1)
    const sourceIds = sourceBytes.map(row => row.nodeId)
    for (const sourceId of sourceIds) {
      const source = canvasBeforeSpace.nodes.find(node => String(node.id) === sourceId)
      assert.ok(source)
      assert.equal(parentIdOf(source), undefined)
    }
    assert.equal(canvasBeforeSpace.nodes.filter(node => node.type === 'frame'
      && node.data?.lcosCollectionId === collectionId).length, 0, 'This Core Collection has no prior spatial frame.')
    const otherCanvasesBefore = {}
    for (const workspace of workspaces.filter(row => String(row.canvasId) !== String(mainWorkspace.canvasId))) {
      const data = await facadeData('GET', '/api/canvas/v1/canvases/' + encodeURIComponent(String(workspace.canvasId)))
      otherCanvasesBefore[String(workspace.canvasId)] = fingerprintCanvas(data)
    }
    let graphBeforeSpace = await coreValue('GET', project + '/graph')
    let presentationsBeforeSpace = await coreValue('GET', presentationsPath)
    let membersBeforeSpace = await coreValue('GET', project + '/collections/' + encodeURIComponent(collectionId) + '/members')
    let runsBeforeSpace = await coreValue('GET', project + '/runs')

    const spacePath = '/api/lcos/canvases/' + encodeURIComponent(String(mainWorkspace.canvasId))
      + '/collections/' + encodeURIComponent(collectionId) + '/space'
    const spacePreparePath = '/api/lcos/canvases/' + encodeURIComponent(String(mainWorkspace.canvasId))
      + '/collections/' + encodeURIComponent(collectionId) + (verifyArrange ? '/space:arrange-prepare' : '/space:prepare')
    let group
    let children = []
    let spaceRead
    let expected
    if (!verifyHistory) {
    const spacePost = await facadeCall('POST', spacePath, { collectionNodeId, expectedVersion: canvasBeforeSpace.version })
    assert.equal(spacePost.status, 200, 'One bootstrap Collection space operation failed: ' + JSON.stringify(spacePost.payload))
    assert.equal(spacePost.payload?.code, 0)
    assert.ok(isRecord(spacePost.payload.data))
    assert.equal(spacePost.payload.data.canvas_id, String(mainWorkspace.canvasId))
    assert.equal(spacePost.payload.data.workspace_id, String(mainWorkspace.id))
    assert.equal(spacePost.payload.data.collection_id, collectionId)
    assert.deepEqual((spacePost.payload.data.node_ids ?? []).map(String).sort(), sourceIds.slice().sort())
    assert.equal(spacePost.payload.data.from_version, canvasBeforeSpace.version)
    assert.equal(spacePost.payload.data.to_version, canvasBeforeSpace.version + 1)
    assert.equal(spacePost.payload.data.created, true)
    assert.equal(spacePost.payload.data.provider_execution_started, false)
    report.spaceOperation = { method: 'POST', path: spacePath,
      request: { collectionNodeId, expectedVersion: canvasBeforeSpace.version },
      status: spacePost.status, receipt: spacePost.payload.data,
      invokedThrough: 'isolated bootstrap facade.handle', userExpandClick: false, o8Undo: false }

    spaceRead = await facadeData('GET', spacePath)
    assert.equal(spaceRead.canvas_id, String(mainWorkspace.canvasId))
    assert.equal(spaceRead.workspace_id, String(mainWorkspace.id))
    assert.equal(spaceRead.collection_id, collectionId)
    assert.equal(spaceRead.collection_node_id, collectionNodeId)
    assert.equal(spaceRead.version, canvasBeforeSpace.version + 1)
    assert.equal(spaceRead.created, false, 'GET reports the already-saved frame as existing; it must not create another one.')
    assert.equal(spaceRead.provider_execution_started, false)
    assert.deepEqual((spaceRead.node_ids ?? []).map(String).sort(), sourceIds.slice().sort())
    canvasAfterSpace = await facadeData('GET', '/api/canvas/v1/canvases/' + encodeURIComponent(String(mainWorkspace.canvasId)))
    assert.equal(canvasAfterSpace.id, String(mainWorkspace.canvasId))
    assert.equal(canvasAfterSpace.version, canvasBeforeSpace.version + 1,
      'One first-open spatial batch must advance only the target Canvas version once.')
    const groups = canvasAfterSpace.nodes.filter(node => node.type === 'group'
      && node.data?.lcosCollectionId === collectionId
      && node.data?.lcosCollectionNodeId === collectionNodeId)
    assert.equal(groups.length, 1, 'The original Huabu frame must project as one same-ID TapNow group.')
    group = groups[0]
    assert.equal(group.data.id, group.id)
    assert.equal(spaceRead.frame_id, String(group.id))
    assert.equal(spacePost.payload.data.frame_id, String(group.id))
    assert.equal(group.data.title, title)
    assert.equal(group.data.createdBy, 'client')
    assert.equal(group.data.loading, false)
    assert.equal(group.data.layoutType, 'none')
    assert.equal(parentIdOf(group), undefined)
    assert.ok(Number.isFinite(group.position?.x) && Number.isFinite(group.position?.y))
    const groupSize = group.measured ?? { width: group.width, height: group.height }
    assert.ok(Number.isFinite(groupSize.width) && groupSize.width > 0)
    assert.ok(Number.isFinite(groupSize.height) && groupSize.height > 0)
    children = canvasAfterSpace.nodes.filter(node => parentIdOf(node) === String(group.id))
    assert.deepEqual(children.map(node => String(node.id)).sort(), sourceIds.slice().sort(),
      'Only the existing Core-bound text/image node IDs may be parented into the Collection group.')
    assert.equal(children.some(node => String(node.id) === collectionNodeId), false,
      'The canonical Collection node remains outside its own member group.')
    const memberSpatialReadback = []
    for (const sourceId of sourceIds) {
      const before = canvasBeforeSpace.nodes.find(node => String(node.id) === sourceId)
      const after = children.find(node => String(node.id) === sourceId)
      const identity = sourceBytes.find(row => row.nodeId === sourceId)
      assert.ok(before && after && identity)
      assert.equal(after.type, before.type)
      assert.deepEqual(readRef(after), readRef(before))
      assert.deepEqual(after.data, before.data, 'The group operation cannot rewrite/copy material bytes or identity.')
      const beforeWorld = absolutePosition(canvasBeforeSpace.nodes, sourceId)
      const afterWorld = absolutePosition(canvasAfterSpace.nodes, sourceId)
      assert.ok(beforeWorld && afterWorld)
      assert.ok(Number.isFinite(after.position?.x) && Number.isFinite(after.position?.y),
        'Each child must have a saved finite parent-relative position.')
      memberSpatialReadback.push({ nodeId: sourceId,
        beforeRelativePosition: before.position, savedRelativePosition: after.position,
        beforeWorldPosition: beforeWorld, savedWorldPosition: afterWorld,
        worldPositionChangedByOriginalFirstOpenLayout: !closeTo(beforeWorld.x, afterWorld.x)
          || !closeTo(beforeWorld.y, afterWorld.y) })
    }
    report.memberSpatialReadback = memberSpatialReadback
    for (const before of canvasBeforeSpace.nodes) {
      const after = canvasAfterSpace.nodes.find(node => String(node.id) === String(before.id))
      assert.ok(after, 'Spatial group operation deleted an existing node.')
      if (sourceIds.includes(String(before.id))) continue
      const beforeUnselected = fingerprintNode(before)
      const afterUnselected = fingerprintNode(after)
      delete beforeUnselected.selected
      delete afterUnselected.selected
      assert.deepEqual(afterUnselected, beforeUnselected,
        'Unrelated node data, parent and geometry must remain unchanged (the original group resolver may update selection).')
    }
    assert.equal(canvasAfterSpace.nodes.length, canvasBeforeSpace.nodes.length + 1,
      'The first-open operation must add one container without duplicating members.')
    assert.equal(new Set(canvasAfterSpace.nodes.map(node => String(node.id))).size, canvasAfterSpace.nodes.length)
    assert.equal(stableJson(canvasAfterSpace.edges ?? []), stableJson(canvasBeforeSpace.edges ?? []))
    assert.equal(stableJson(canvasAfterSpace.viewport ?? null), stableJson(canvasBeforeSpace.viewport ?? null))

    const graphAfterSpace = await coreValue('GET', project + '/graph')
    const presentationsAfterSpace = await coreValue('GET', presentationsPath)
    const membersAfterSpace = await coreValue('GET', project + '/collections/' + encodeURIComponent(collectionId) + '/members')
    const runsAfterSpace = await coreValue('GET', project + '/runs')
    assert.equal(stableJson(graphAfterSpace), stableJson(graphBeforeSpace),
      'The spatial operation cannot create/copy Artifacts, Views, Revisions or FileRecords.')
    assert.equal(stableJson(presentationsAfterSpace), stableJson(presentationsBeforeSpace),
      'The spatial operation cannot mutate Core Presentation membership or layout.')
    assert.equal(stableJson(membersAfterSpace), stableJson(membersBeforeSpace),
      'Huabu parent state must not be written as Core Collection membership.')
    assert.equal(stableJson(runsAfterSpace), stableJson(runsBeforeSpace), 'The spatial operation cannot create a Run.')
    for (const source of sourceBytes) {
      const response = await originalFetch(coreOrigin + project + '/file-records/' + encodeURIComponent(source.fileRecordId) + '/content',
        { headers: { Accept: '*/*' }, redirect: 'error', cache: 'no-store' })
      const bytes = Buffer.from(await response.arrayBuffer())
      assert.ok(response.ok)
      assert.deepEqual(bytes, source.bytes, 'Core FileRecord bytes must be unchanged after group creation.')
    }
    const otherCanvasesAfter = {}
    for (const workspace of workspaces.filter(row => String(row.canvasId) !== String(mainWorkspace.canvasId))) {
      const data = await facadeData('GET', '/api/canvas/v1/canvases/' + encodeURIComponent(String(workspace.canvasId)))
      otherCanvasesAfter[String(workspace.canvasId)] = fingerprintCanvas(data)
      assert.equal(stableJson(otherCanvasesAfter[String(workspace.canvasId)]),
        stableJson(otherCanvasesBefore[String(workspace.canvasId)]),
        'Other Core Workspace canvases must stay unchanged.')
    }
    report.beforeSpace = { canvas: fingerprintCanvas(canvasBeforeSpace), sourceNodeIds: sourceIds,
      sourceRefs: sourceBytes.map(row => ({ nodeId: row.nodeId, artifactId: row.artifactId,
        artifactViewId: row.artifactViewId, revisionId: row.revisionId, fileRecordId: row.fileRecordId })),
      sourceWorldPositions: sourceIds.map(id => ({ id, position: absolutePosition(canvasBeforeSpace.nodes, id) })),
      collectionMembers: memberRefs, runCount: runsBeforeSpace.length, otherCanvases: otherCanvasesBefore }
    report.afterSpace = { canvas: fingerprintCanvas(canvasAfterSpace), group: fingerprintNode(group),
      children: children.map(node => ({ ...fingerprintNode(node), absolutePosition: absolutePosition(canvasAfterSpace.nodes, node.id) })),
      readProjection: spaceRead, versionDelta: canvasAfterSpace.version - canvasBeforeSpace.version,
      CoreGraphUnchanged: true, presentationUnchanged: true, collectionMembershipUnchanged: true,
      sourceBytesUnchanged: true, otherCanvasesUnchanged: true, runsUnchanged: true }
    report.cases.push(
      'Core Collection owns the two exact existing Main text/image Artifact references',
      'Original Core Assembly Apply receives the Collection into Main and original Gen2Host projects one carrier',
      'One isolated bootstrap space operation persists a TapNow group with the same existing child IDs and parent_id',
      'Space receipt plus persisted Canvas GET prove the original Huabu layout was committed as parent-relative group geometry; any original first-open world-position change is recorded, not hidden',
      'Core refs/bytes, unrelated node data and geometry, camera and edges are preserved; original resolver selection changes are allowed',
      'Core graph, Main Presentation, Collection membership, FileRecord bytes, Runs and other canvases are unchanged by space creation',
    )
    report.overallFrameReadbackPassed = true

    expected = { canvasId: String(mainWorkspace.canvasId), collectionId,
      collectionNodeId, groupId: String(group.id), sourceNodeIds: sourceIds, version: canvasAfterSpace.version }
    } else {
      // The history mode leaves the existing Main materials free and only reads
      // the plan after the browser has completed the original image measurement.
      canvasAfterSpace = canvasBeforeSpace
      expected = { canvasId: String(mainWorkspace.canvasId), collectionId,
        collectionNodeId, groupId: null, sourceNodeIds: sourceIds, version: canvasBeforeSpace.version }
      report.spaceOperation = { method: 'POST nodes:batchActions', path: '/api/canvas/v1/canvases/'
        + encodeURIComponent(String(mainWorkspace.canvasId)) + '/nodes:batchActions',
        preparePath: spacePreparePath, bootstrapPost: false, invokedThrough: 'original Gen1 folder activation and O8',
        userExpandClick: false, o8Undo: false, o8Redo: false }
      report.beforeSpace = { canvas: fingerprintCanvas(canvasBeforeSpace), sourceNodeIds: sourceIds,
        sourceRefs: sourceBytes.map(row => ({ nodeId: row.nodeId, artifactId: row.artifactId,
          artifactViewId: row.artifactViewId, revisionId: row.revisionId, fileRecordId: row.fileRecordId })),
        sourceWorldPositions: sourceIds.map(id => ({ id, position: absolutePosition(canvasBeforeSpace.nodes, id) })),
        collectionMembers: memberRefs, runCount: runsBeforeSpace.length, otherCanvases: otherCanvasesBefore }
    }
    if (verifyArrange) {
      // Deliberately messy but real persisted fixture, before any browser opens.
      // The new free carrier is an additional View of the same canonical text,
      // not a copied Artifact or a fabricated Core member.
      const duplicateId = 'node-' + randomUUID()
      const duplicate = await facadeCall('POST', '/api/canvas/v1/canvases/' + encodeURIComponent(String(mainWorkspace.canvasId)) + '/nodes:batchActions', {
        canvas_id: String(mainWorkspace.canvasId),
        actions: [{ action: 'create', creates: [{ id: duplicateId, type: 'text', position: { x: 850, y: 80 },
          measured: { width: 360, height: 280 }, lcos_ref: textSource.ref,
          data: { title: textSource.node.data.title, text: textSource.node.data.content, content: textSource.node.data.content } }] }],
        lcos_operation: { version: 1, operationId: randomUUID(), kind: 'duplicate-view', phase: 'apply' },
      })
      assert.equal(duplicate.status, 200, JSON.stringify(duplicate.payload))
      const shuffled = await facade.spatial.execute(String(mainWorkspace.canvasId), [{ type: 'SET_NODE_GEOMETRY', items: [
        { nodeId: String(textSource.node.id), position: { x: 170, y: 430 } },
        { nodeId: String(imageSource.node.id), position: { x: 0, y: 70 }, size: { width: 375, height: 250 } },
      ] }])
      assert.ok(shuffled.results.every(row => row.applied === true || row.reason === 'no-op'))
      canvasAfterSpace = await facadeData('GET', '/api/canvas/v1/canvases/' + encodeURIComponent(String(mainWorkspace.canvasId)))
      const added = canvasAfterSpace.nodes.find(node => String(node.id) === duplicateId)
      assert.ok(added && readRef(added)?.entityType === 'view')
      assert.equal(readRef(added).artifactId, String(textSource.artifact.id))
      assert.equal(parentIdOf(added), undefined)
      sourceNodes.push({ ...textSource, node: added, ref: readRef(added) })
      sourceBytes.push({ ...sourceBytes.find(row => row.type === 'text'), nodeId: duplicateId,
        artifactViewId: readRef(added).artifactViewId })
      sourceIds.push(duplicateId)
      group = canvasAfterSpace.nodes.find(node => String(node.id) === String(group.id))
      expected = { ...expected, sourceNodeIds: [...sourceIds], version: canvasAfterSpace.version }
      graphBeforeSpace = await coreValue('GET', project + '/graph')
      presentationsBeforeSpace = await coreValue('GET', presentationsPath)
      membersBeforeSpace = await coreValue('GET', project + '/collections/' + encodeURIComponent(collectionId) + '/members')
      runsBeforeSpace = await coreValue('GET', project + '/runs')
      report.fixtureWrites.push({ producer: 'real native duplicate-view + Huabu geometry fixture before Browser',
        duplicateId, canonicalArtifactId: String(textSource.artifact.id), frameId: String(group.id),
        freeCarrier: true, copiedArtifact: false, syntheticPremeasuredImage: { width: 375, height: 250 },
        bootstrapOnly: true, noBrowserGestureClaim: true })
      report.arrangementFixture = { before: fingerprintCanvas(canvasAfterSpace), freeCarrierId: duplicateId,
        frameId: String(group.id), sameCoreMembership: true }
    }
    if (verifyNested) {
      const { createNestedCollectionFixture } = await import('./native-collection-nested-fixture.mjs')
      const nested = await createNestedCollectionFixture({ projectId, canvasId: String(mainWorkspace.canvasId),
        workspaceId: String(mainWorkspace.id), innerCollectionId: collectionId,
        innerCollectionNodeId: collectionNodeId, innerFrameId: String(group.id), facade, facadeCall, coreValue })
      canvasAfterSpace = nested.canvas
      assert.equal(parentIdOf(canvasAfterSpace.nodes.find(node => String(node.id) === String(group.id))), nested.outerFrameId)
      assert.equal(parentIdOf(canvasAfterSpace.nodes.find(node => String(node.id) === collectionNodeId)), nested.outerFrameId)
      assert.equal(parentIdOf(canvasAfterSpace.nodes.find(node => String(node.id) === report.arrangementFixture.freeCarrierId)), undefined,
        'The extra inner member remains free until the real inner Arrange click.')
      group = canvasAfterSpace.nodes.find(node => String(node.id) === String(group.id))
      const nestedGraph = await coreValue('GET', project + '/graph')
      const siblingRevision = nestedGraph.artifactRevisions.find(row => String(row.id) === nested.siblingRef.revisionId)
      assert.ok(siblingRevision?.fileRecordId)
      const fileResponse = await originalFetch(coreOrigin + project + '/file-records/' + encodeURIComponent(String(siblingRevision.fileRecordId)) + '/content',
        { headers: { Accept: '*/*' }, redirect: 'error', cache: 'no-store' })
      assert.equal(fileResponse.ok, true)
      const bytes = Buffer.from(await fileResponse.arrayBuffer())
      assert.ok(bytes.length > 0)
      nestedProtectedSources.push({ nodeId: nested.siblingNodeId, fileRecordId: String(siblingRevision.fileRecordId), bytes })
      report.fixtureWrites.push(...nested.fixtureWrites)
      report.nestedFixture = { outerCollectionId: nested.outerCollectionId, outerCarrierId: nested.outerCarrierId,
        outerFrameId: nested.outerFrameId, siblingNodeId: nested.siblingNodeId, siblingRef: nested.siblingRef,
        outerMemberRefs: nested.outerMembers,
        outerMembers: await coreValue('GET', project + '/collections/' + encodeURIComponent(nested.outerCollectionId) + '/members'),
        outerOriginalSpaceReceipt: nested.outerOriginalSpaceReceipt, bootstrapOnly: true,
        siblingFileRecordId: String(siblingRevision.fileRecordId), siblingByteLength: bytes.length,
        before: fingerprintCanvas(canvasAfterSpace),
        protectedWorldPositions: [collectionNodeId, nested.siblingNodeId].map(id => ({ id, position: absolutePosition(canvasAfterSpace.nodes, id) })) }
      expected = { ...expected, version: canvasAfterSpace.version, nested: true,
        outerFrameId: nested.outerFrameId, outerCollectionId: nested.outerCollectionId }
      report.arrangementFixture.before = fingerprintCanvas(canvasAfterSpace)
      graphBeforeSpace = nestedGraph
      presentationsBeforeSpace = await coreValue('GET', presentationsPath)
      membersBeforeSpace = await coreValue('GET', project + '/collections/' + encodeURIComponent(collectionId) + '/members')
      runsBeforeSpace = await coreValue('GET', project + '/runs')
      report.cases.push('Original Core Collections/Assembly/Projection and two original first-open operations build a genuine nested frame/carrier tree without hand-written parent or owner markers')
    }
    report.expectedUi = expected
    await facade.close()
    facade = undefined
    allowedNodeOrigins.delete(coreOrigin)
    report.bootstrapFacadeClosedBeforeUi = true

    const launcherPath = path.join(root, 'scripts', 'start-full-integration.mjs')
    launcher = spawn(process.execPath, [launcherPath, '--runtime-label=' + runtimeLabel, '--port=' + uiPort], {
      cwd: root,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        LCOS_RECOVERY_TRANSPORT: 'none', LCOS_CAPTURE_STAGING_ROOT: path.join(runtimeRoot, 'capture'),
        LCOS_OCR_RUNTIME_DIR: path.join(runtimeRoot, 'ocr'), LCOS_OLLAMA_URL: 'http://127.0.0.1:1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    launcherSpawned = true
    launcher.stdout.setEncoding('utf8').on('data', chunk => { launcherStdout = (launcherStdout + chunk).slice(-16000) })
    launcher.stderr.setEncoding('utf8').on('data', chunk => { launcherStderr = (launcherStderr + chunk).slice(-16000) })
    launcher.once('close', (code, signal) => { launcherState.closed = { code, signal } })
    const launcherCommandLine = await waitForCommandLine(launcher.pid,
      line => matchesProcessIdentity(line, launcherPath, runtimeLabel, uiPort), launcherState)
    report.launcher = { runtimeLabel, launcherPid: launcher.pid, launcherCommandLine }
    // The shared health helper uses the guarded global fetch, so admit this
    // exact reserved origin only after the official launcher identity matches.
    allowedNodeOrigins.add(origin)
    const health = await waitForHealth(origin, launcherState, () => launcherStdout + launcherStderr)
    assert.equal(health.realCoreConnected, true)
    assert.equal(health.cloudBackendConnected, false)
    assert.equal(health.profile, 'original-tapnow-full-integration-in-progress')
    serverPid = Number(health.pid)
    assert.ok(Number.isInteger(serverPid) && serverPid > 0)
    const serverCommandLine = await waitForCommandLine(serverPid,
      line => matchesProcessIdentity(line, path.join(root, 'lab', 'server.mjs'), runtimeLabel, uiPort), launcherState)
    report.launcher.serverPid = serverPid
    report.launcher.serverCommandLine = serverCommandLine
    report.launcher.health = { pid: serverPid, profile: health.profile,
      realCoreConnected: health.realCoreConnected, cloudBackendConnected: health.cloudBackendConnected }
    allowedNodeOrigins.add(origin)

    const manifestPath = path.join(runtimeRoot, 'native-ui', 'agent-ui.js.sources.json')
    report.sourceManifests.nativeUi = JSON.parse(await (await import('node:fs/promises')).readFile(manifestPath, 'utf8'))
    assert.equal(report.sourceManifests.nativeUi.currentRoot, currentGen2Root)
    const requiredOwners = [
      'huabu/apps/web/src/lcos/nodes/CollectionNodePresentation.tsx',
      'huabu/apps/web/src/lcos/nodes/CanonicalCollectionView.tsx',
      'huabu/apps/web/src/lcos/nodes/Gen1CollectionFace.tsx',
      'huabu/apps/web/src/lcos/nodes/collectionHost.ts',
      'huabu/apps/web/src/lcos/nodes/collectionExpandLayout.ts',
      'huabu/apps/web/src/store/canvasCollapsedFrames.ts',
    ]
    const catalogPaths = new Set(currentGen2Resources.map(resource => resource.resourcePath))
    const loaded = report.sourceManifests.nativeUi.resources ?? []
    for (const resourcePath of requiredOwners) {
      assert.ok(catalogPaths.has(resourcePath), 'Current catalog omitted ' + resourcePath)
      const row = loaded.find(resource => resource.resourcePath === resourcePath)
      assert.ok(row, 'Actual native UI bundle did not load current Collection owner ' + resourcePath)
      assert.equal(row.readOnly, true)
      assert.equal(path.resolve(row.sourcePath), path.resolve(currentGen2Root, resourcePath))
    }
    report.currentGen2Provenance = { currentRoot: report.sourceManifests.nativeUi.currentRoot,
      selectedCatalogCount: currentGen2Resources.length, actualLoadedCount: loaded.length, requiredOwners }

    const require = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')
    const { chromium } = require('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: report.browser.viewport, locale: 'zh-CN', serviceWorkers: 'block' })
    const savedNodes = new Map(canvasAfterSpace.nodes.map(node => [String(node.id), node]))
    let expectedUiCanvas = fingerprintCanvas(canvasAfterSpace)
    let executionSyncCount = 0
    let noOpCanvasEchoCount = 0
    let imageMeasurementCount = 0
    let preparedSpacePlan
    let expectedRepeatArrangeStage
    let historyPhaseIndex = 0
    const historyPhases = ['apply', 'undo', 'redo']
    let historyOperationId
    const historyReceipts = []
    await context.route('**/*', async route => {
      const request = route.request()
      const url = new URL(request.url())
      const method = request.method().toUpperCase()
      if (url.protocol === 'data:' || url.protocol === 'blob:') { await route.continue(); return }
      if (!['http:', 'https:'].includes(url.protocol)) {
        report.blockedHttp.push({ method, address: safeAddress(url.href), reason: 'unknown protocol blocked' })
        await route.abort('blockedbyclient')
        return
      }
      if (url.origin !== origin) {
        report.blockedHttp.push({ method, address: safeAddress(url.href), reason: 'off-origin HTTP blocked' })
        await route.abort('blockedbyclient')
        return
      }
      if ((verifyHistory || verifyArrange) && method === 'GET' && url.pathname === spacePreparePath) {
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
        if (response.status() !== 200 || payload?.code !== 0 || !isRecord(payload.data)) {
          report.apiFailures.push({ method, path: url.pathname, status: response.status(), response: payload })
          await route.fulfill({ response, body: text })
          return
        }
        const plan = payload.data
        const frameId = String(plan.frame_id ?? '')
        assert.equal(plan.project_id, projectId)
        assert.equal(plan.canvas_id, String(mainWorkspace.canvasId))
        assert.equal(plan.workspace_id, String(mainWorkspace.id))
        assert.equal(plan.collection_id, collectionId)
        assert.equal(plan.collection_node_id, collectionNodeId)
        assert.ok(frameId)
        if (verifyArrange) {
          assert.equal(frameId, String(group.id))
          assert.equal(plan.same_frame, true)
          assert.equal(plan.created, false)
          if (expectedRepeatArrangeStage) {
            assert.deepEqual(plan.changed_node_ids, [], 'Repeating nested Arrange must not move the frame again.')
            assert.deepEqual(plan.admitted_node_ids, [])
            assert.equal(stableJson(plan.space?.before), stableJson(plan.space?.after))
          } else {
            assert.ok(plan.changed_node_ids?.length > 0)
            assert.deepEqual(plan.admitted_node_ids, [report.arrangementFixture.freeCarrierId])
          }
        } else assert.equal(canvasBeforeSpace.nodes.some(node => String(node.id) === frameId), false)
        assert.equal(plan.committed, false)
        assert.equal(plan.provider_execution_started, false)
        const preparedCanvas = await appCanvas(mainWorkspace.canvasId)
        assert.equal(plan.source_version, preparedCanvas.version,
          'Prepare must describe the fully flushed current Main before any native O8 mutation.')
        const beforeIds = verifyArrange
          ? expectedArrangementScope(preparedCanvas.nodes, frameId, plan.admitted_node_ids)
          : sourceBytes.map(row => row.nodeId).sort()
        assert.deepEqual((plan.node_ids ?? []).map(String).sort(), beforeIds)
        assert.deepEqual((plan.before_nodes ?? []).map(node => String(node.id)).sort(), beforeIds)
        assert.deepEqual((plan.after_nodes ?? []).map(node => String(node.id)).sort(),
          verifyArrange ? beforeIds : [...sourceBytes.map(row => row.nodeId), frameId].sort())
        assert.equal(plan.space?.projectId, projectId)
        assert.equal(plan.space?.canvasId, String(mainWorkspace.canvasId))
        assert.equal(plan.space?.workspaceId, String(mainWorkspace.id))
        assert.equal(plan.space?.collectionId, collectionId)
        assert.equal(plan.space?.collectionNodeId, collectionNodeId)
        assert.equal(plan.space?.frameId, frameId)
        assert.equal(plan.space?.sourceVersion, plan.source_version)
        assert.equal(plan.space?.before?.some(slice => slice.id === frameId), verifyArrange)
        assert.equal(plan.space?.after?.some(slice => slice.id === frameId), true)
        const preparedBeforeById = new Map((plan.before_nodes ?? []).map(node => [String(node.id), node]))
        for (const sourceId of sourceBytes.map(row => row.nodeId)) {
          const native = preparedBeforeById.get(sourceId)
          const persisted = preparedCanvas.nodes.find(node => String(node.id) === sourceId)
          assert.ok(native && persisted, 'Prepare lost the exact existing material carrier ' + sourceId)
          assert.equal(native.type, persisted.type)
          assert.deepEqual(native.position, persisted.position)
          assert.deepEqual(native.measured ?? null, persisted.measured ?? null)
          assert.deepEqual(native.data, persisted.data)
          assert.equal(mutationParentId(native), parentIdOf(persisted) ?? '')
        }
        const currentHistory = await page.evaluate(({ canvasId: targetCanvas, targetNode }) => {
          const host = window.__LCOS_NODE_LAB__
          if (!host?.api || (host.currentCanvasId ?? host.canvasId) !== targetCanvas
            || typeof host.api.inspectNativeHistory !== 'function') return { ok: false, reason: 'original history inspector unavailable' }
          return host.api.inspectNativeHistory({ canvasId: targetCanvas, requestedCanvasId: targetCanvas, nodeId: targetNode })
        }, { canvasId: String(mainWorkspace.canvasId), targetNode: frameId })
        assert.equal(currentHistory?.ok, true, 'Original O8 baseline must be readable before setNodes applies the plan.')
        if (expectedRepeatArrangeStage) {
          report.repeatArrangePrepares ??= []
          report.repeatArrangePrepares.push({ stage: expectedRepeatArrangeStage, status: response.status(), plan, history: currentHistory })
        } else {
          report.o8HistoryBaseline = currentHistory
          preparedSpacePlan = plan
          report.spacePrepare = { method, path: url.pathname, status: response.status(), plan }
        }
        await route.fulfill({ response, body: text })
        return
      }
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) { await route.continue(); return }

      if (method === 'POST' && url.pathname === '/api/events') {
        let event
        try { event = request.postDataJSON() } catch { event = undefined }
        const kinds = new Set(['diagnostics-installed', 'remote-fetch-attempt', 'remote-fetch-blocked',
          'http-failed', 'fetch-failed', 'csp-blocked', 'action-not-connected', 'request-rejected', 'page-error'])
        if (event?.source !== 'renderer' || typeof event.kind !== 'string' || !kinds.has(event.kind)) {
          const blocked = { method, path: url.pathname, body: event, reason: 'unrecognized renderer telemetry blocked' }
          report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
          await route.abort('blockedbyclient')
          return
        }
        const response = await route.fetch()
        report.diagnosticTelemetry.push({ kind: event.kind, detail: event.detail ?? null, status: response.status() })
        await route.fulfill({ response })
        return
      }

      const executionPath = '/api/lcos/canvases/' + encodeURIComponent(String(mainWorkspace.canvasId)) + '/execution:reconcile'
      if (method === 'POST' && url.pathname === executionPath) {
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        if (!isRecord(body) || Object.keys(body).length !== 0) {
          const blocked = { method, path: url.pathname, body, reason: 'Only exact empty no-override execution reconciliation is in scope.' }
          report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
          await route.abort('blockedbyclient')
          return
        }
        executionSyncCount += 1
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
        const runs = await appCoreValue('/runs')
        const receipt = { method, path: url.pathname, status: response.status(), body,
          providerExecutionStarted: payload?.code === 0 ? payload.data?.provider_execution_started : undefined,
          runCount: Array.isArray(runs) ? runs.length : null, response: payload }
        report.browserWrites.push(receipt)
        if (response.status() !== 200 || payload?.code !== 0 || payload.data?.provider_execution_started !== false
          || !Array.isArray(runs) || runs.length !== 0) {
          report.unexpectedWrites.push({ ...receipt, reason: 'Execution projection must remain offline and create zero Runs.' })
        }
        await route.fulfill({ response, body: text })
        return
      }

      const batchMatch = /^\/api\/canvas\/v1\/canvases\/([^/]+)\/nodes:batchActions$/.exec(url.pathname)
      if (method === 'POST' && batchMatch && decodeURIComponent(batchMatch[1] ?? '') === String(mainWorkspace.canvasId)) {
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        if ((verifyHistory || verifyArrange) && body?.lcos_operation?.kind === (verifyArrange ? 'collection-arrange' : 'collection-space')) {
          const phase = historyPhases[historyPhaseIndex]
          try {
            assert.ok(preparedSpacePlan, 'The native space batch arrived without the original read-only prepare plan.')
            assert.ok(phase, 'A fourth Collection space batch is outside this one apply/undo/redo test.')
            ;(verifyArrange ? assertCollectionArrangeBatchShape : assertCollectionSpaceBatchShape)(body, preparedSpacePlan, phase, String(mainWorkspace.canvasId))
            if (historyOperationId === undefined) historyOperationId = body.lcos_operation.operationId
            assert.equal(body.lcos_operation.operationId, historyOperationId,
              'Undo and Redo must carry the original O8 operation identity.')
            const before = await appCanvas(mainWorkspace.canvasId)
            assert.equal(body.lcos_expected_canvas_version, before.version,
              'Each native replay must carry the freshly read current Canvas version.')
            assert.equal(stableJson(fingerprintCanvas(before)), stableJson(expectedUiCanvas),
              'A user edit changed the Canvas between collection-space history phases.')
            const response = await route.fetch()
            const text = await response.text()
            let payload
            try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 500) } }
            const after = await appCanvas(mainWorkspace.canvasId)
            const expectedSide = phase === 'undo' ? 'before' : 'after'
            const expectedDtos = phase === 'undo' ? preparedSpacePlan.before_nodes : preparedSpacePlan.after_nodes
            const expectedIdSet = new Set(before.nodes.map(node => String(node.id)))
            if (!verifyArrange) {
              if (phase === 'undo') expectedIdSet.delete(String(preparedSpacePlan.frame_id))
              else expectedIdSet.add(String(preparedSpacePlan.frame_id))
            }
            assert.equal(response.status(), 200, 'Original Canvas batch failed: ' + JSON.stringify(payload))
            assert.equal(payload?.code, 0, 'Original Core spatial history rejected the batch: ' + JSON.stringify(payload))
            assert.equal(payload.data?.canvas_id, String(mainWorkspace.canvasId))
            assert.equal(payload.data?.workspace_id, String(mainWorkspace.id))
            assert.equal(payload.data?.collection_id, collectionId)
            assert.equal(payload.data?.frame_id, String(preparedSpacePlan.frame_id))
            assert.equal(payload.data?.provider_execution_started, false)
            assert.equal(payload.data?.from_version, before.version)
            assert.equal(payload.data?.to_version, before.version + 1)
            assert.equal(payload.data?.idempotent, false)
            assert.equal(payload.data?.created, verifyArrange ? false : phase !== 'undo')
            if (verifyArrange) assert.equal(payload.data?.arranged, true)
            assert.deepEqual(after.nodes.map(node => String(node.id)).sort(), [...expectedIdSet].sort())
            assert.equal(after.version, before.version + 1)
            const dtoById = new Map(expectedDtos.map(node => [String(node.id), node]))
            const scopedIds = new Set(preparedSpacePlan.space[expectedSide].map(slice => String(slice.id)))
            for (const id of scopedIds) {
              const actual = after.nodes.find(node => String(node.id) === id)
              const dto = dtoById.get(id)
              assert.ok(actual && dto, 'The original batch failed exact node readback for ' + id)
              assert.equal(actual.type, dto.type, 'Native projected node type drifted: ' + id)
              assert.equal(parentIdOf(actual) ?? '', mutationParentId(dto), 'Native parent readback drifted: ' + id)
              assert.deepEqual(actual.position, dto.position, 'Native position readback drifted: ' + id)
              assert.deepEqual(actual.measured ?? null, dto.measured ?? null, 'Native size readback drifted: ' + id)
              assert.deepEqual(actual.data, dto.data, 'Material or container data changed outside the prepared plan: ' + id)
            }
            for (const prior of before.nodes) {
              const id = String(prior.id)
              if (scopedIds.has(id) || !verifyArrange && phase === 'undo' && id === String(preparedSpacePlan.frame_id)) continue
              const current = after.nodes.find(node => String(node.id) === id)
              assert.ok(current, 'A node outside the prepared scope disappeared: ' + id)
              const left = fingerprintNode(prior), right = fingerprintNode(current)
              delete left.selected; delete right.selected
              assert.deepEqual(right, left, 'Node outside the prepared space scope changed: ' + id)
            }
            assert.deepEqual(after.edges ?? [], before.edges ?? [], 'Space history cannot mutate Canvas connections.')
            assert.deepEqual(after.viewport ?? null, before.viewport ?? null, 'Space history cannot mutate the camera.')
            const receipt = { phase, operationId: body.lcos_operation.operationId, request: body,
              status: response.status(), response: payload.data, beforeVersion: before.version,
              afterVersion: after.version, expectedSide, scopedNodeIds: [...scopedIds].sort() }
            historyReceipts.push(receipt)
            report.spaceHistoryOperations.push(receipt)
            report.browserWrites.push({ historyPhase: phase, path: url.pathname, method, status: response.status(),
              operationId: body.lcos_operation.operationId, fromVersion: before.version, toVersion: after.version,
              nodeIds: [...scopedIds].sort(), providerExecutionStarted: payload.data.provider_execution_started })
            historyPhaseIndex += 1
            expectedUiCanvas = fingerprintCanvas(after)
            for (const node of after.nodes) savedNodes.set(String(node.id), node)
            if (!verifyArrange && phase === 'undo') savedNodes.delete(String(preparedSpacePlan.frame_id))
            await route.fulfill({ response, body: text })
            return
          } catch (error) {
            const blocked = { method, path: url.pathname, body, reason: String(error.stack ?? error) }
            report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
            await route.abort('blockedbyclient')
            return
          }
        }
        const action = body?.actions?.length === 1 ? body.actions[0] : undefined
        const updates = action?.action === 'update' && Array.isArray(action.updates) ? action.updates : undefined
        const seen = new Set()
        let normalizesImage = false
        const revisionMap = body?.lcos_expected_revisions
        const revisionsSafe = revisionMap === undefined || isRecord(revisionMap)
          && Object.entries(revisionMap).every(([id, revision]) => readRef(savedNodes.get(id))?.revisionId === revision)
        const exactEchoOrInitialMeasure = isRecord(body) && body.canvas_id === String(mainWorkspace.canvasId)
          && Array.isArray(body.actions) && body.actions.length === 1 && revisionsSafe
          && Object.keys(body).every(key => ['canvas_id', 'actions', 'created_by_role', 'lcos_expected_revisions'].includes(key))
          && (body.created_by_role === undefined || body.created_by_role === 'user')
          && Array.isArray(updates) && updates.length > 0
          && updates.every(update => {
            const before = savedNodes.get(String(update?.id ?? ''))
            const allowed = new Set(['id', 'type', 'data', 'position', 'measured', 'parent_id'])
            if (!before || seen.has(String(update.id)) || Object.keys(update).some(key => !allowed.has(key))) return false
            seen.add(String(update.id))
            const exactMeasurement = update.measured === undefined || stableJson(update.measured) === stableJson(before.measured)
            // This fixture's original TapNow image sizing result is 375x250.
            // Only its first observed DOM-size measurement is admitted, never
            // an arbitrary measurement, member move or parent change.
            const initialImageMeasurement = !exactMeasurement && imageMeasurementCount === 0
              && updates.length === 1 && before.type === 'image'
              && sourceBytes.some(source => source.type === 'image' && source.nodeId === String(update.id))
              && stableJson(before.measured) === stableJson({ width: 360, height: 240 })
              && stableJson(update.measured) === stableJson({ width: 375, height: 250 })
            if (initialImageMeasurement) normalizesImage = true
            return (update.type === undefined || update.type === before.type)
              && (update.data === undefined || stableJson(update.data) === stableJson(before.data))
              && (update.position === undefined || stableJson(update.position) === stableJson(before.position))
              && (update.parent_id === undefined || (typeof update.parent_id === 'string' && !update.parent_id
                ? undefined : update.parent_id) === parentIdOf(before))
              && (exactMeasurement || initialImageMeasurement)
          })
        if (!exactEchoOrInitialMeasure) {
          const blocked = { method, path: url.pathname, body,
            reason: 'Only exact node/parent/data/position echoes and one original 375x250 image normalization are allowed.' }
          report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
          await route.abort('blockedbyclient')
          return
        }
        const before = await appCanvas(mainWorkspace.canvasId)
        const response = await route.fetch()
        const text = await response.text()
        const after = await appCanvas(mainWorkspace.canvasId)
        const unchanged = stableJson(fingerprintCanvas(before)) === stableJson(fingerprintCanvas(after))
        const expected = fingerprintCanvas(before)
        if (normalizesImage) {
          const changed = expected.nodes.find(node => String(node.id) === String(updates[0].id))
          changed.measured = { width: 375, height: 250 }
          if (!verifyHistory) {
            // Original Huabu executor refits the affected hug-frame in the same
            // batch (executor.ts -> fitFrames). For these exact two fixture
            // children, only width grows 424 -> 439; no parent/position changes.
            const frame = expected.nodes.find(node => node.id === changed.parent_id)
            assert.equal(frame?.type, 'group')
            assert.deepEqual(frame.measured, { width: 424, height: 608 })
            frame.width = 439
            frame.measured = { width: 439, height: 608 }
          } else {
            // The history variant measures the image before the first-open plan
            // exists, so no frame is created or resized by this initial DOM write.
            assert.equal(changed.parent_id, null)
          }
          expected.version += 1
        }
        const matchesExpected = response.status() === 200
          && stableJson(fingerprintCanvas(after)) === stableJson(expected)
        const receipt = { method, path: url.pathname, status: response.status(), request: body,
          nodeIds: updates.map(update => String(update.id)), noCanvasStateChange: unchanged,
          beforeVersion: before.version, afterVersion: after.version, onlyExpectedSizeChange: matchesExpected,
          producer: normalizesImage ? 'original DOM image measurement' : 'original no-op Canvas geometry echo' }
        report.browserWrites.push(receipt)
        if (!matchesExpected) report.unexpectedWrites.push({ ...receipt, reason: 'Canvas state differed from the exact echo or one permitted original image size change.' })
        else {
          if (normalizesImage) imageMeasurementCount += 1
          else noOpCanvasEchoCount += 1
          expectedUiCanvas = fingerprintCanvas(after)
          for (const node of after.nodes) savedNodes.set(String(node.id), node)
        }
        await route.fulfill({ response, body: text })
        return
      }

      if (method === 'POST' && url.pathname === '/api/agent-gateway/v1/conversations/suggestions/dynamic') {
        let body
        try { body = request.postDataJSON() } catch { body = undefined }
        if (!isRecord(body) || body.canvas_id !== String(mainWorkspace.canvasId) || body.count !== 5 || body.mode !== 'mixed') {
          const blocked = { method, path: url.pathname, body, reason: 'Dynamic suggestions request escaped the known read-only request shape.' }
          report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
          await route.abort('blockedbyclient')
          return
        }
        const response = await route.fetch()
        const text = await response.text()
        let payload
        try { payload = JSON.parse(text) } catch { payload = { nonJsonBody: text.slice(0, 400) } }
        report.knownBlockedUnsupported.push({ method, path: url.pathname, status: response.status(), body, response: payload })
        await route.fulfill({ response, body: text })
        return
      }

      const blocked = { method, path: url.pathname, reason: 'No browser business mutation is in scope; the one space call was bootstrap-only.' }
      report.blockedWrites.push(blocked); report.unexpectedWrites.push(blocked)
      await route.abort('blockedbyclient')
    })
    if (typeof context.routeWebSocket === 'function') {
      await context.routeWebSocket('**/*', async socketRoute => {
        const socketUrl = new URL(socketRoute.url())
        if (socketUrl.host === new URL(origin).host && ['ws:', 'wss:'].includes(socketUrl.protocol)) {
          await socketRoute.connect()
          return
        }
        report.blockedWebSockets.push({ address: safeAddress(socketUrl.href), reason: 'off-origin WebSocket blocked' })
        await socketRoute.close({ code: 1008, reason: 'isolated offline Collection space check' })
      })
    } else report.browser.webSocketInterception = 'installed Playwright has no routeWebSocket'

    page = await context.newPage()
    page.on('pageerror', error => report.pageErrors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') report.consoleErrors.push(message.text().replace(/https?:\/\/[^\s"'<>]+/g, raw => {
        try { const url = new URL(raw); url.search = url.search ? '?<query-redacted>' : ''; return url.href }
        catch { return '[address]' }
      }).slice(0, 1600))
      else if (message.type() === 'warning') report.consoleWarnings.push(message.text().slice(0, 1600))
    })
    page.on('requestfailed', request => report.requestFailures.push({ method: request.method(),
      path: safeAddress(request.url()), error: request.failure()?.errorText ?? 'unknown' }))
    page.on('response', response => {
      const url = new URL(response.url())
      if (response.status() >= 400) report.apiFailures.push({ method: response.request().method(),
        path: url.pathname, status: response.status() })
    })

    const canvasRoute = '/canvas/' + encodeURIComponent(String(mainWorkspace.canvasId))
    await page.goto(origin + canvasRoute, { waitUntil: 'domcontentloaded' })
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 })
    const agentPanel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (await agentPanel.isVisible()) await agentPanel.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
    const collectionFace = page.locator('[data-lcos-native-collection-node="' + collectionNodeId
      + '"][data-lcos-native-collection-availability="ready"]')
    await collectionFace.waitFor({ state: 'visible', timeout: 30000 })
    const collectionLocator = page.locator(nodeSelector(collectionNodeId))
    await collectionLocator.waitFor({ state: 'visible', timeout: 30000 })
    const flowCount = await page.locator('.react-flow').count()
    assert.equal(flowCount, 1, 'Only the original TapNow ReactFlow may own spatial content.')
    const assertPageIdentity = async stage => {
      const url = new URL(page.url()), pageTitle = await page.title()
      assert.equal(url.origin, origin)
      assert.equal(url.pathname, canvasRoute)
      assert.match(pageTitle, /TapNow|LCOS/i, 'Page title must identify the original local app, not an error document.')
      assert.ok((await page.locator('body').innerText()).trim().length > 30)
      const overlays = page.locator('vite-error-overlay, nextjs-portal [data-nextjs-error-overlay], [data-webpack-error-overlay]')
      let visibleFrameworkOverlays = 0
      for (let index = 0; index < await overlays.count(); index++) if (await overlays.nth(index).isVisible()) visibleFrameworkOverlays++
      assert.equal(visibleFrameworkOverlays, 0)
      ;(report.pageChecks ??= []).push({ stage, url: url.href, title: pageTitle, meaningfulBody: true, visibleFrameworkOverlays })
    }
    await assertPageIdentity('before-original-interaction')
    if (!verifyHistory && !verifyArrange) {
    const groupLocator = page.locator(nodeSelector(String(group.id)))
    await groupLocator.waitFor({ state: 'visible', timeout: 30000 })
    const browserMaterials = []
    for (const source of sourceBytes) {
      const node = sourceNodes.find(row => String(row.node?.id) === source.nodeId)
      const child = page.locator(nodeSelector(source.nodeId))
      await child.waitFor({ state: 'visible', timeout: 20000 })
      if (source.type === 'image') {
        const image = child.locator('img').first()
        await image.waitFor({ state: 'visible', timeout: 20000 })
        const dimensions = await image.evaluate(element => ({
          complete: element.complete, naturalWidth: element.naturalWidth,
          naturalHeight: element.naturalHeight, currentSrc: element.currentSrc,
        }))
        assert.equal(dimensions.complete, true)
        assert.ok(dimensions.naturalWidth > 0 && dimensions.naturalHeight > 0,
          'The original image renderer must decode the actual Core-backed image bytes.')
        browserMaterials.push({ type: 'image', nodeId: source.nodeId, ...dimensions })
      } else {
        const visibleText = await child.innerText()
        assert.ok(visibleText.trim().length > 0, 'The original Main text node must display actual body text.')
        const exactBody = String(node.node.data?.content ?? '')
        const sourceLines = fixtureVisibleLines(exactBody)
        assert.ok(sourceLines.length >= 2, 'The actual Core fixture must have a heading and body paragraph.')
        assert.ok(sourceLines.every(line => visibleText.includes(line)),
          'The original text renderer must show every visible line of the selected Core Revision: ' + JSON.stringify({ sourceLines, visibleText }))
        browserMaterials.push({ type: 'text', nodeId: source.nodeId, visibleTextLength: visibleText.length,
          sourceLines, exactCoreBodyLinesVisible: true })
      }
    }
    const groupClass = await groupLocator.getAttribute('class')
    assert.ok((groupClass ?? '').includes('group'), 'The saved type=group must hit TapNow’s original group renderer.')
    const measurementDeadline = Date.now() + 20000
    while (imageMeasurementCount === 0 && Date.now() < measurementDeadline) await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(imageMeasurementCount, 1, 'The original image size normalization must commit once before reload.')
    await screenshot('original-group-and-text-image-children', null)
    await screenshot('original-group-container', groupLocator)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 })
    const agentPanelAfterReload = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (await agentPanelAfterReload.isVisible()) await agentPanelAfterReload.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
    const flowCountAfterReload = await page.locator('.react-flow').count()
    assert.equal(flowCountAfterReload, 1, 'A real page reload must still render exactly one original ReactFlow.')
    const collectionFaceAfterReload = page.locator('[data-lcos-native-collection-node="' + collectionNodeId
      + '"][data-lcos-native-collection-availability="ready"]')
    await collectionFaceAfterReload.waitFor({ state: 'visible', timeout: 30000 })
    const groupAfterReload = page.locator(nodeSelector(String(group.id)))
    await groupAfterReload.waitFor({ state: 'visible', timeout: 30000 })
    const reloadMaterialEvidence = []
    for (const source of sourceBytes) {
      const child = page.locator(nodeSelector(source.nodeId))
      await child.waitFor({ state: 'visible', timeout: 20000 })
      if (source.type === 'image') {
        const image = child.locator('img').first()
        await image.waitFor({ state: 'visible', timeout: 20000 })
        const dimensions = await image.evaluate(element => ({
          complete: element.complete, naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight,
        }))
        assert.equal(dimensions.complete, true)
        assert.ok(dimensions.naturalWidth > 0 && dimensions.naturalHeight > 0)
        reloadMaterialEvidence.push({ type: 'image', nodeId: source.nodeId, ...dimensions })
      } else {
        const text = await child.innerText()
        const sourceNode = sourceNodes.find(row => String(row.node?.id) === source.nodeId)
        const exactBody = String(sourceNode?.node.data?.content ?? '').trim()
        const sourceLines = fixtureVisibleLines(exactBody)
        assert.ok(text.trim().length > 0)
        assert.ok(sourceLines.length >= 2 && sourceLines.every(line => text.includes(line)))
        reloadMaterialEvidence.push({ type: 'text', nodeId: source.nodeId,
          visibleTextLength: text.length, sourceLines, exactCoreBodyLinesVisible: true })
      }
    }
    await screenshot('after-page-reload-original-group-and-children', null)

    const canvasAfterUi = await appCanvas(mainWorkspace.canvasId)
    assert.equal(stableJson(fingerprintCanvas(canvasAfterUi)), stableJson(expectedUiCanvas),
      'GUI reload must preserve the saved parent/position/data after the one original DOM image-size measurement.')
    assert.equal(canvasAfterUi.version, canvasAfterSpace.version + 1)
    const domWorldGeometry = []
    for (const id of [String(group.id), ...sourceIds]) {
      const expectedWorld = absolutePosition(canvasAfterUi.nodes, id)
      const saved = canvasAfterUi.nodes.find(node => String(node.id) === id)
      const dom = await page.locator(nodeSelector(id)).evaluate(element => {
        const style = getComputedStyle(element)
        const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform)
        return { x: matrix.m41, y: matrix.m42, width: parseFloat(style.width), height: parseFloat(style.height) }
      })
      assert.ok(expectedWorld && closeTo(dom.x, expectedWorld.x) && closeTo(dom.y, expectedWorld.y),
        'Original ReactFlow DOM must place each node at saved parent-plus-relative world coordinates: ' + id)
      assert.ok(closeTo(dom.width, saved.measured.width) && closeTo(dom.height, saved.measured.height))
      domWorldGeometry.push({ id, expectedWorld, dom })
    }
    const [finalGraph, finalPresentations, finalMembers, finalRuns] = await Promise.all([
      appCoreValue('/graph'), appCoreValue('/presentations'),
      appCoreValue('/collections/' + encodeURIComponent(collectionId) + '/members'), appCoreValue('/runs'),
    ])
    assert.equal(stableJson(finalGraph), stableJson(graphBeforeSpace))
    assert.equal(stableJson(finalPresentations), stableJson(presentationsBeforeSpace))
    assert.equal(stableJson(finalMembers), stableJson(membersBeforeSpace))
    assert.equal(stableJson(finalRuns), stableJson(runsBeforeSpace))
    for (const source of sourceBytes) {
      const actual = await appCoreBytes('/file-records/' + encodeURIComponent(source.fileRecordId) + '/content')
      assert.deepEqual(actual.bytes, source.bytes)
    }
    for (const [id, before] of Object.entries(otherCanvasesBefore)) {
      assert.equal(stableJson(fingerprintCanvas(await appCanvas(id))), stableJson(before))
    }
    assert.deepEqual(report.pageErrors, [], 'The original group renderer raised a browser page error.')
    assert.deepEqual(report.unexpectedWrites, [],
      'No user business writes are in scope; only the separately measured original image size normalization may change Canvas state.')
    report.gui = { route: canvasRoute, title: await page.title(), viewport: report.browser.viewport,
      reactFlowCount: flowCount, collectionNodeId, groupId: String(group.id), groupDomClass: groupClass,
      childNodeIds: sourceIds, materials: browserMaterials,
      pageReload: { performed: true, reactFlowCount: flowCountAfterReload,
        groupVisible: true, materials: reloadMaterialEvidence, domWorldGeometry },
      userExpandClick: false, o8Undo: false }
    report.afterUi = { canvas: fingerprintCanvas(canvasAfterUi), imageMeasurementCount,
      spatialVersionDeltaAfterBootstrap: canvasAfterUi.version - canvasAfterSpace.version,
      coreGraphUnchanged: true, presentationUnchanged: true, collectionMembershipUnchanged: true,
      sourceBytesUnchanged: true, otherCanvasesUnchanged: true, runCount: finalRuns.length }
    report.browserWritesSummary = { emptyExecutionProjectionSyncs: executionSyncCount,
      exactNoOpCanvasEchoes: noOpCanvasEchoCount, originalImageMeasurements: imageMeasurementCount }
    report.cases.push(
      'Fresh TapNow GUI renders one original ReactFlow with the same Core Collection carrier and same-ID group',
      'Original group contains the same text/image node IDs, visible Core text and decoded Core image bytes',
      'GUI reload reads persisted parent_id and relative geometry without a user expansion click or O8 history claim',
      'Reloaded original ReactFlow DOM matches saved group and child world coordinates/sizes; Core truth, file bytes, Runs and other canvases stay unchanged after native image normalization',
    )
    report.overallGuiGroupReadbackPassed = true
    report.passed = true
    } else if (verifyArrange) {
      await page.locator('[data-lcos-native-collection-node="' + collectionNodeId
        + '"][data-lcos-native-collection-space-arrangement="ready"]').waitFor({ state: 'visible', timeout: 20000 })
      const frameId = String(group.id)
      const beforeArrange = await appCanvas(mainWorkspace.canvasId)
      assert.equal(stableJson(fingerprintCanvas(beforeArrange)), stableJson(expectedUiCanvas))
      assert.equal(parentIdOf(beforeArrange.nodes.find(node => String(node.id) === report.arrangementFixture.freeCarrierId)), undefined)
      assert.equal(imageMeasurementCount, 0, 'This arrangement fixture was explicitly premeasured before Browser; do not claim a new DOM measurement.')
      const readHistory = nodeId => page.evaluate(({ canvasId, nodeId }) => window.__LCOS_NODE_LAB__?.api?.inspectNativeHistory({ canvasId, nodeId }),
        { canvasId: String(mainWorkspace.canvasId), nodeId })
      const batchResponse = phase => page.waitForResponse(response => {
        if (response.request().method() !== 'POST') return false
        const url = new URL(response.url())
        if (url.pathname !== '/api/canvas/v1/canvases/' + encodeURIComponent(String(mainWorkspace.canvasId)) + '/nodes:batchActions') return false
        try { const body = response.request().postDataJSON(); return body?.lcos_operation?.kind === 'collection-arrange' && body.lcos_operation.phase === phase }
        catch { return false }
      }, { timeout: 30000 })
      if (await collectionFace.getAttribute('data-lcos-native-collection-selected') !== 'true') {
        await collectionLocator.click({ modifiers: ['Shift'] })
      }
      await collectionFace.locator('[data-lcos-collection-members-open]').click()
      const memberPanel = page.locator('[data-lcos-collection-members-panel]')
      await memberPanel.waitFor({ state: 'visible', timeout: 15000 })
      const arrangeButton = memberPanel.locator('[data-lcos-collection-arrange]')
      await arrangeButton.waitFor({ state: 'visible', timeout: 15000 })
      const verifyRepeatArrange = async (stage, anchorId, expectedHistory) => {
        const savedBefore = fingerprintCanvas(await appCanvas(mainWorkspace.canvasId))
        const batchesBefore = historyReceipts.length
        const writesBefore = report.browserWrites.length
        const echoesBefore = noOpCanvasEchoCount
        const prepareCountBefore = report.repeatArrangePrepares?.length ?? 0
        expectedRepeatArrangeStage = stage
        try {
          const preparedResponse = page.waitForResponse(response => response.request().method() === 'GET'
            && new URL(response.url()).pathname === spacePreparePath, { timeout: 15000 })
          await arrangeButton.click()
          assert.equal((await preparedResponse).status(), 200)
          await collectionFace.getByText('原集合排列已是最新；材料与成员关系未重写。', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
          assert.equal(report.repeatArrangePrepares.length, prepareCountBefore + 1)
          const history = await readHistory(anchorId)
          assert.equal(history.historySize, expectedHistory.historySize)
          assert.equal(history.currentIndex, expectedHistory.currentIndex)
          assert.equal(historyReceipts.length, batchesBefore, 'A no-op original Arrange click must not submit any save batch.')
          assert.equal(report.browserWrites.length, writesBefore, 'A no-op original Arrange click must not submit a generic Canvas batch either.')
          assert.equal(noOpCanvasEchoCount, echoesBefore, 'An exact geometry echo is still a request, not a zero-write no-op.')
          assert.equal(stableJson(fingerprintCanvas(await appCanvas(mainWorkspace.canvasId))), stableJson(savedBefore))
          report.repeatArrangeClicks ??= []
          report.repeatArrangeClicks.push({ stage, originalMenuClick: true, changedNodeIds: [],
            canvasVersion: savedBefore.version, historySize: history.historySize, currentIndex: history.currentIndex,
            noCanvasWrite: true, noNewHistoryEntry: true })
        } finally { expectedRepeatArrangeStage = undefined }
      }
      await screenshot('arrange-before-original-menu-click', null)
      const applyPromise = batchResponse('apply')
      await arrangeButton.click()
      report.userArrangeClick = true
      const applyResponse = await applyPromise
      assert.equal(applyResponse.status(), 200)
      assert.equal(historyPhaseIndex, 1)
      const anchorId = preparedSpacePlan.changed_node_ids[0]
      // The original save batch can complete before O8's debounced snapshot.
      // Observe the actual O8 receipt; a network response alone is not history.
      await page.waitForFunction(({ canvasId, nodeId, operationId }) => {
        const history = window.__LCOS_NODE_LAB__?.api?.inspectNativeHistory({ canvasId, nodeId })
        return history?.currentEntry?.operations?.some(row => row.operation?.kind === 'collection-arrange'
          && row.operation.operationId === operationId) === true
      }, { canvasId: String(mainWorkspace.canvasId), nodeId: anchorId, operationId: historyOperationId }, { timeout: 7000 })
      const appliedHistory = await readHistory(anchorId)
      report.arrangeHistoryAfterApply = appliedHistory
      assert.equal(appliedHistory.ok, true)
      assert.equal(appliedHistory.historySize, report.o8HistoryBaseline.historySize + 1)
      assert.equal(appliedHistory.currentIndex, report.o8HistoryBaseline.currentIndex + 1)
      const action = appliedHistory.currentEntry?.operations?.find(row => row.operation?.kind === 'collection-arrange')
      assert.ok(action)
      assert.deepEqual([...action.aliases].sort(), [...preparedSpacePlan.changed_node_ids].sort())
      const afterApply = await appCanvas(mainWorkspace.canvasId)
      assert.deepEqual(afterApply.nodes.filter(node => parentIdOf(node) === frameId).map(node => String(node.id)).sort(), sourceIds.slice().sort())
      assert.equal(afterApply.nodes.length, beforeArrange.nodes.length, 'Arrangement may not recreate nodes or duplicate the frame.')
      if (verifyNested) {
        assert.equal(parentIdOf(afterApply.nodes.find(node => String(node.id) === frameId)), report.nestedFixture.outerFrameId)
        const beforeOuter = beforeArrange.nodes.find(node => String(node.id) === report.nestedFixture.outerFrameId)
        const afterOuter = afterApply.nodes.find(node => String(node.id) === report.nestedFixture.outerFrameId)
        const outerGeometry = node => ({ position: node.position, measured: node.measured,
          width: node.width ?? null, height: node.height ?? null })
        assert.notEqual(stableJson(outerGeometry(beforeOuter)), stableJson(outerGeometry(afterOuter)),
          'This nested fixture must actually exercise ancestor fit, not only a nested parent label.')
        const protectedWorldPositions = report.nestedFixture.protectedWorldPositions.map(row => {
          const actual = absolutePosition(afterApply.nodes, row.id)
          assert.deepEqual(actual, row.position, 'Original hug-fit must preserve the world position of the target carrier and outer sibling: ' + row.id)
          assert.equal(parentIdOf(afterApply.nodes.find(node => String(node.id) === row.id)), report.nestedFixture.outerFrameId)
          return { id: row.id, before: row.position, after: actual }
        })
        report.nestedAncestorFit = { before: fingerprintNode(beforeOuter), after: fingerprintNode(afterOuter),
          protectedWorldPositions, completeScopeIds: preparedSpacePlan.node_ids }
      }
      await screenshot('arrange-after-native-apply-and-admission', null)
      report.arrangeApply = { history: appliedHistory, frameId, admittedIds: preparedSpacePlan.admitted_node_ids,
        beforeVersion: beforeArrange.version, afterVersion: afterApply.version }
      if (verifyNested) await verifyRepeatArrange('after-apply', anchorId, appliedHistory)
      await memberPanel.getByRole('button', { name: '收起成员列表', exact: true }).click()
      await memberPanel.waitFor({ state: 'hidden', timeout: 10000 })
      const focusPoint = await page.locator('.react-flow__pane').first().evaluate(element => {
        const rect = element.getBoundingClientRect()
        for (const fy of [0.08, 0.16, 0.84, 0.92]) for (const fx of [0.08, 0.16, 0.84, 0.92]) {
          const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy, hit = document.elementFromPoint(x, y)
          if (hit?.closest('.react-flow__pane') && !hit.closest('.react-flow__node,button,input,textarea,[contenteditable="true"],.react-flow__controls,.react-flow__minimap')) return { x, y }
        }
      })
      assert.ok(focusPoint)
      await page.mouse.click(focusPoint.x, focusPoint.y)
      const undoPromise = batchResponse('undo')
      await page.keyboard.press('Control+Z')
      const undoResponse = await undoPromise
      assert.equal(undoResponse.status(), 200)
      assert.equal(historyPhaseIndex, 2)
      const undoHistory = await readHistory(anchorId)
      assert.equal(undoHistory.currentIndex, report.o8HistoryBaseline.currentIndex)
      assert.equal(undoHistory.historySize, appliedHistory.historySize)
      const afterUndo = await appCanvas(mainWorkspace.canvasId)
      const withoutVersion = value => { const result = fingerprintCanvas(value); delete result.version; return result }
      assert.equal(stableJson(withoutVersion(afterUndo)), stableJson(withoutVersion(beforeArrange)),
        'Original Undo must restore every pre-arrange node, parent and bound; no material truth changes.')
      await screenshot('arrange-after-native-control-z', null)
      report.arrangeUndo = { history: undoHistory, freeCarrierRestored: true, version: afterUndo.version }
      const redoPromise = batchResponse('redo')
      await page.keyboard.press('Control+Shift+Z')
      const redoResponse = await redoPromise
      assert.equal(redoResponse.status(), 200)
      assert.equal(historyPhaseIndex, 3)
      const redoHistory = await readHistory(anchorId)
      assert.equal(redoHistory.currentIndex, appliedHistory.currentIndex)
      assert.equal(redoHistory.historySize, appliedHistory.historySize)
      const afterRedo = await appCanvas(mainWorkspace.canvasId)
      assert.equal(stableJson(withoutVersion(afterRedo)), stableJson(withoutVersion(afterApply)))
      report.arrangeRedo = { history: redoHistory, sameFrameId: true, sameChildIds: true, version: afterRedo.version }
      await screenshot('arrange-after-native-control-shift-z', null)
      if (verifyNested) {
        if (await collectionFace.getAttribute('data-lcos-native-collection-selected') !== 'true') {
          await collectionLocator.click({ modifiers: ['Shift'] })
        }
        await collectionFace.locator('[data-lcos-collection-members-open]').click()
        await memberPanel.waitFor({ state: 'visible', timeout: 10000 })
        await verifyRepeatArrange('after-redo', anchorId, redoHistory)
        await memberPanel.getByRole('button', { name: '收起成员列表', exact: true }).click()
        await memberPanel.waitFor({ state: 'hidden', timeout: 10000 })
        const outer = report.nestedFixture
        const outerFace = page.locator('[data-lcos-native-collection-node="' + outer.outerCarrierId + '"]')
        const assertExpanded = async (face, expanded) => {
          assert.equal(await face.getAttribute('data-lcos-native-collection-space-expanded'), String(expanded))
        }
        const toggleFolder = async (carrierId, face, expanded, label) => {
          await page.locator('[data-lcos-native-collection-node="' + carrierId
            + '"][data-lcos-native-collection-space-state="ready"]').waitFor({ state: 'visible', timeout: 10000 })
          if (await face.getAttribute('data-lcos-native-collection-selected') !== 'true') {
            await page.locator(nodeSelector(carrierId)).click({ modifiers: ['Shift'] })
          }
          await face.locator('[data-lcos-simple-collection] .lcos-collection-folder-face').click()
          await page.locator('[data-lcos-native-collection-node="' + carrierId
            + '"][data-lcos-native-collection-space-expanded="' + String(expanded) + '"]').waitFor({ state: 'visible', timeout: 10000 })
          const current = await readHistory(anchorId)
          assert.equal(current.historySize, redoHistory.historySize)
          assert.equal(current.currentIndex, redoHistory.currentIndex)
          assert.equal(historyReceipts.length, 3)
          assert.equal(stableJson(fingerprintCanvas(await appCanvas(mainWorkspace.canvasId))), stableJson(fingerprintCanvas(afterRedo)),
            'Nested display state must not be persisted as Canvas geometry or hidden flags.')
          const preference = await page.evaluate(canvasId => JSON.parse(localStorage.getItem('huabu:canvas:' + canvasId + ':collapsed-frames') ?? '[]'), mainWorkspace.canvasId)
          await screenshot(label, null)
          return { carrierId, expanded, preference, historySize: current.historySize, currentIndex: current.currentIndex, canvasVersion: afterRedo.version }
        }
        const innerCollapse = await toggleFolder(collectionNodeId, collectionFace, false, 'nested-display-inner-collapsed')
        for (const id of [frameId, ...sourceIds]) await page.locator(nodeSelector(id)).waitFor({ state: 'hidden', timeout: 10000 })
        for (const id of [outer.outerFrameId, outer.siblingNodeId, collectionNodeId]) await page.locator(nodeSelector(id)).waitFor({ state: 'visible', timeout: 10000 })
        await assertExpanded(outerFace, true)
        assert.ok(innerCollapse.preference.includes(frameId) && !innerCollapse.preference.includes(outer.outerFrameId))
        const outerCollapse = await toggleFolder(outer.outerCarrierId, outerFace, false, 'nested-display-outer-collapsed')
        for (const id of [outer.outerFrameId, outer.siblingNodeId, collectionNodeId, frameId, ...sourceIds]) {
          await page.locator(nodeSelector(id)).waitFor({ state: 'hidden', timeout: 10000 })
        }
        assert.ok(outerCollapse.preference.includes(frameId) && outerCollapse.preference.includes(outer.outerFrameId))
        const outerReopen = await toggleFolder(outer.outerCarrierId, outerFace, true, 'nested-display-outer-reopened-inner-still-collapsed')
        for (const id of [outer.outerFrameId, outer.siblingNodeId, collectionNodeId]) await page.locator(nodeSelector(id)).waitFor({ state: 'visible', timeout: 10000 })
        for (const id of [frameId, ...sourceIds]) await page.locator(nodeSelector(id)).waitFor({ state: 'hidden', timeout: 10000 })
        await assertExpanded(collectionFace, false)
        assert.ok(outerReopen.preference.includes(frameId) && !outerReopen.preference.includes(outer.outerFrameId))
        const innerReopen = await toggleFolder(collectionNodeId, collectionFace, true, 'nested-display-all-reopened')
        for (const id of [frameId, ...sourceIds, outer.outerFrameId, outer.siblingNodeId]) await page.locator(nodeSelector(id)).waitFor({ state: 'visible', timeout: 10000 })
        await assertExpanded(outerFace, true)
        assert.ok(!innerReopen.preference.includes(frameId) && !innerReopen.preference.includes(outer.outerFrameId))
        report.nestedDisplay = { originalFolderClicks: 4, innerCollapse, outerCollapse, outerReopen, innerReopen,
          noSpatialWrite: true, noNewHistoryEntry: true, independentCollapsePreferences: true }
      }
      assert.equal(historyReceipts.length, 3)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 })
      const reloadAgentPanel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
      if (await reloadAgentPanel.isVisible()) await reloadAgentPanel.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
      assert.equal(await page.locator('.react-flow').count(), 1)
      await assertPageIdentity('after-real-reload')
      const reloadCanvas = await appCanvas(mainWorkspace.canvasId)
      assert.equal(stableJson(fingerprintCanvas(reloadCanvas)), stableJson(expectedUiCanvas))
      const domWorldGeometry = []
      const domNodeIds = [frameId, ...sourceIds, ...(verifyNested ? [report.nestedFixture.outerFrameId,
        collectionNodeId, report.nestedFixture.outerCarrierId, report.nestedFixture.siblingNodeId] : [])]
      for (const id of domNodeIds) {
        const locator = page.locator(nodeSelector(id))
        await locator.waitFor({ state: 'visible', timeout: 20000 })
        const saved = reloadCanvas.nodes.find(node => String(node.id) === id), expectedWorld = absolutePosition(reloadCanvas.nodes, id)
        const dom = await locator.evaluate(element => {
          const style = getComputedStyle(element), matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform)
          return { x: matrix.m41, y: matrix.m42, width: parseFloat(style.width), height: parseFloat(style.height) }
        })
        assert.ok(closeTo(dom.x, expectedWorld.x) && closeTo(dom.y, expectedWorld.y)
          && closeTo(dom.width, saved.measured.width) && closeTo(dom.height, saved.measured.height), 'Original DOM geometry drift: ' + id)
        const source = sourceBytes.find(row => row.nodeId === id)
        if (source?.type === 'image') {
          const image = await locator.locator('img').first().evaluate(element => ({ complete: element.complete, width: element.naturalWidth, height: element.naturalHeight }))
          assert.ok(image.complete && image.width > 0 && image.height > 0)
        } else if (source) {
          const content = sourceNodes.find(row => String(row.node.id) === id).node.data.content
          const text = await locator.innerText()
          assert.ok(fixtureVisibleLines(content).every(line => text.includes(line)))
        } else if (verifyNested && id === report.nestedFixture.siblingNodeId) {
          const text = await locator.innerText()
          assert.ok(fixtureVisibleLines(saved.data.content ?? saved.data.text).every(line => text.includes(line)))
        }
        domWorldGeometry.push({ id, expectedWorld, dom })
      }
      await screenshot('arrange-after-reload-same-ids-and-dom', null)
      const [finalGraph, finalPresentations, finalMembers, finalRuns] = await Promise.all([
        appCoreValue('/graph'), appCoreValue('/presentations'), appCoreValue('/collections/' + encodeURIComponent(collectionId) + '/members'), appCoreValue('/runs') ])
      assert.equal(stableJson(finalGraph), stableJson(graphBeforeSpace))
      assert.equal(stableJson(finalPresentations), stableJson(presentationsBeforeSpace))
      assert.equal(stableJson(finalMembers), stableJson(membersBeforeSpace))
      assert.equal(stableJson(finalRuns), stableJson(runsBeforeSpace))
      for (const source of [...sourceBytes, ...nestedProtectedSources]) assert.deepEqual((await appCoreBytes('/file-records/' + encodeURIComponent(source.fileRecordId) + '/content')).bytes, source.bytes)
      if (verifyNested) {
        assert.equal(stableJson(await appCoreValue('/collections/' + encodeURIComponent(report.nestedFixture.outerCollectionId) + '/members')),
          stableJson(report.nestedFixture.outerMembers), 'Space history may not change outer canonical Collection membership.')
      }
      for (const [id, expectedCanvas] of Object.entries(otherCanvasesBefore)) assert.equal(stableJson(fingerprintCanvas(await appCanvas(id))), stableJson(expectedCanvas))
      assert.deepEqual(report.pageErrors, [])
      assert.deepEqual(report.unexpectedWrites, [])
      assert.equal(historyPhaseIndex, 3)
      assert.equal(noOpCanvasEchoCount, 0, 'Arrangement must not hide delayed generic Canvas echoes behind the three original history batches.')
      report.gui = { singleOriginalFlow: true, originalMemberMenuClick: true, sameFrameId: frameId,
        childIds: [...sourceIds], admittedExistingView: report.arrangementFixture.freeCarrierId,
        domWorldGeometry, realReload: true, CoreGraphUnchanged: true, otherCanvasesUnchanged: true }
      report.browserWritesSummary = { collectionArrangeHistoryBatches: historyReceipts.length,
        emptyExecutionProjectionSyncs: executionSyncCount, exactNoOpCanvasEchoes: noOpCanvasEchoCount, originalImageMeasurements: imageMeasurementCount }
      report.cases.push('Original member-menu Arrange admits the existing free View and reflows existing image/text in one original O8 entry and one native update batch',
        'Original Ctrl+Z restores the free View parent and complete pre-arrange geometry; Ctrl+Shift+Z restores same frame/child IDs without remap',
        'Reloaded single original Flow DOM matches saved parent-relative/world coordinates, sizes, actual image and canonical text',
        'Core graph, Collection/Presentation memberships, file bytes, Runs and other Workspaces remain unchanged by all three spatial phases')
      if (verifyNested) report.cases.push(
        'Nested original Arrange records the actual outer-frame fit and same-parent sibling local offsets in the same O8 entry; outer sibling and target-carrier world positions stay unchanged',
        'Two repeated original Arrange clicks after Apply and Redo return zero changes without any Canvas version or O8 history increment',
        'Four original folder clicks independently collapse inner/outer subtrees and restore the prior inner preference without any Canvas write or new O8 history')
      report.passed = true
    } else {
      const browserMaterials = []
      for (const source of sourceBytes) {
        const original = sourceNodes.find(row => String(row.node?.id) === source.nodeId)
        const child = page.locator(nodeSelector(source.nodeId))
        await child.waitFor({ state: 'visible', timeout: 20000 })
        if (source.type === 'image') {
          const image = child.locator('img').first()
          await image.waitFor({ state: 'visible', timeout: 20000 })
          const dimensions = await image.evaluate(element => ({ complete: element.complete,
            naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight }))
          assert.equal(dimensions.complete, true)
          assert.ok(dimensions.naturalWidth > 0 && dimensions.naturalHeight > 0)
          browserMaterials.push({ type: 'image', nodeId: source.nodeId, ...dimensions })
        } else {
          const visibleText = await child.innerText()
          const exactBody = String(original?.node.data?.content ?? '')
          const sourceLines = fixtureVisibleLines(exactBody)
          assert.ok(sourceLines.length >= 2 && sourceLines.every(line => visibleText.includes(line)))
          browserMaterials.push({ type: 'text', nodeId: source.nodeId, sourceLines, exactCoreBodyLinesVisible: true })
        }
      }
      await screenshot('history-before-folder-activation', null)
      const measurementDeadline = Date.now() + 20000
      while (imageMeasurementCount === 0 && Date.now() < measurementDeadline) await new Promise(resolve => setTimeout(resolve, 100))
      assert.equal(imageMeasurementCount, 1, 'The original ungrouped image must finish its one native DOM-size write before prepare.')
      const canvasBeforeO8 = await appCanvas(mainWorkspace.canvasId)
      assert.equal(stableJson(fingerprintCanvas(canvasBeforeO8)), stableJson(expectedUiCanvas),
        'Native image measurement must be saved before the original folder creates an O8 entry.')
      report.beforeO8 = { canvas: fingerprintCanvas(canvasBeforeO8), imageMeasurementCount,
        sourceWorldPositions: sourceBytes.map(row => ({ nodeId: row.nodeId,
          position: absolutePosition(canvasBeforeO8.nodes, row.nodeId) })) }

      const readHistory = async nodeId => page.evaluate(({ canvasId: targetCanvas, targetNode }) => {
        const host = window.__LCOS_NODE_LAB__
        if (!host?.api || (host.currentCanvasId ?? host.canvasId) !== targetCanvas
          || typeof host.api.inspectNativeHistory !== 'function') return { ok: false, reason: 'original history inspector unavailable' }
        return host.api.inspectNativeHistory({ canvasId: targetCanvas, requestedCanvasId: targetCanvas, nodeId: targetNode })
      }, { canvasId: String(mainWorkspace.canvasId), targetNode: nodeId })
      const batchResponse = phase => page.waitForResponse(response => {
        const request = response.request()
        if (request.method() !== 'POST') return false
        const url = new URL(response.url())
        if (url.pathname !== '/api/canvas/v1/canvases/' + encodeURIComponent(String(mainWorkspace.canvasId)) + '/nodes:batchActions') return false
        try {
          const body = request.postDataJSON()
          return body?.lcos_operation?.kind === 'collection-space' && body.lcos_operation.phase === phase
        } catch { return false }
      }, { timeout: 30000 })
      const faceAction = collectionFace.locator('[data-lcos-simple-collection] .lcos-collection-folder-face')
      await faceAction.waitFor({ state: 'visible', timeout: 15000 })
      assert.equal(await collectionFace.getAttribute('data-lcos-native-collection-space-state'), 'ready')
      await page.evaluate(() => {
        window.__LCOS_COLLECTION_CLICK_TRACE__ = []
        for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) {
          document.addEventListener(type, event => {
            if (!event.target?.closest?.('[data-lcos-native-collection-node]')) return
            const row = { type, target: event.target.tagName, className: String(event.target.className),
              x: event.clientX, y: event.clientY, button: event.button,
              blockedTarget: !!event.target.closest('button,input,textarea,a[href],[contenteditable="true"]'),
              defaultPreventedAtCapture: event.defaultPrevented }
            window.__LCOS_COLLECTION_CLICK_TRACE__.push(row)
            queueMicrotask(() => { row.defaultPreventedAfterDispatch = event.defaultPrevented })
          }, true)
        }
      })
      const applyResponsePromise = batchResponse('apply')
      await faceAction.click()
      report.userExpandClick = true
      report.spaceOperation.userExpandClick = true
      const applyResponse = await applyResponsePromise
      assert.equal(historyPhaseIndex, 1, 'Exactly one original apply batch must be committed by the folder click.')
      const frameId = String(preparedSpacePlan?.frame_id ?? '')
      assert.ok(frameId)
      const groupLocator = page.locator(nodeSelector(frameId))
      await groupLocator.waitFor({ state: 'visible', timeout: 20000 })
      assert.equal(await collectionFace.getAttribute('data-lcos-native-collection-space-expanded'), 'true')
      const applyHistory = await readHistory(frameId)
      assert.equal(applyHistory.ok, true, 'Original O8 inspector must read the frame-owned history entry.')
      assert.equal(applyHistory.historySize, report.o8HistoryBaseline.historySize + 1)
      assert.equal(applyHistory.currentIndex, report.o8HistoryBaseline.currentIndex + 1)
      assert.equal(applyHistory.currentEntry?.operations?.some(row => row.operation?.kind === 'collection-space'
        && row.operation.phase === 'apply' && row.nodeId === frameId), true)
      const canvasAfterApply = await appCanvas(mainWorkspace.canvasId)
      const groupAfterApply = canvasAfterApply.nodes.find(node => String(node.id) === frameId)
      assert.ok(groupAfterApply?.type === 'group')
      const visibleChildren = canvasAfterApply.nodes.filter(node => parentIdOf(node) === frameId).map(node => String(node.id)).sort()
      assert.deepEqual(visibleChildren, sourceBytes.map(row => row.nodeId).sort())
      for (const source of sourceBytes) await page.locator(nodeSelector(source.nodeId)).waitFor({ state: 'visible', timeout: 15000 })
      await screenshot('history-after-original-folder-apply', null)
      report.o8Apply = { before: report.o8HistoryBaseline, after: applyHistory,
        actualResponseStatus: applyResponse.status(), frameId, childIds: visibleChildren }

      const pane = page.locator('.react-flow__pane').first()
      const focusPoint = await pane.evaluate(element => {
        const rect = element.getBoundingClientRect()
        const fractions = [0.08, 0.16, 0.84, 0.92]
        for (const fy of fractions) for (const fx of fractions) {
          const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy
          const hit = document.elementFromPoint(x, y)
          if (hit && hit.closest('.react-flow__pane') && !hit.closest('.react-flow__node,button,input,textarea,[contenteditable="true"],.react-flow__controls,.react-flow__minimap')) {
            return { x, y, hitTag: hit.tagName, hitClass: typeof hit.className === 'string' ? hit.className : '' }
          }
        }
        return undefined
      })
      assert.ok(focusPoint, 'Could not find a real unoccluded blank point on the original ReactFlow pane for keyboard history.')
      report.nativeHistoryFocus = focusPoint
      await page.mouse.click(focusPoint.x, focusPoint.y)
      const focusedEditor = await page.evaluate(() => {
        const active = document.activeElement
        return !!active?.closest?.('input,textarea,[contenteditable="true"]')
      })
      assert.equal(focusedEditor, false, 'Undo/Redo must be sent to the original Canvas, not a text editor.')
      const undoResponsePromise = batchResponse('undo')
      await page.keyboard.press('Control+Z')
      const undoResponse = await undoResponsePromise
      assert.equal(historyPhaseIndex, 2)
      await groupLocator.waitFor({ state: 'detached', timeout: 20000 })
      assert.equal(await collectionFace.getAttribute('data-lcos-native-collection-space-expanded'), 'false')
      const undoHistory = await readHistory(frameId)
      assert.equal(undoHistory.ok, true)
      assert.equal(undoHistory.currentIndex, report.o8HistoryBaseline.currentIndex)
      assert.equal(undoHistory.canRedo, true)
      assert.equal(undoHistory.redoTarget?.operations?.some(row => row.operation?.kind === 'collection-space'
        && row.operation.phase === 'apply' && row.nodeId === frameId), true)
      const canvasAfterUndo = await appCanvas(mainWorkspace.canvasId)
      assert.equal(canvasAfterUndo.nodes.some(node => String(node.id) === frameId), false)
      for (const source of sourceBytes) {
        const restored = canvasAfterUndo.nodes.find(node => String(node.id) === source.nodeId)
        const before = canvasBeforeO8.nodes.find(node => String(node.id) === source.nodeId)
        assert.ok(restored && before)
        assert.equal(parentIdOf(restored), undefined)
        assert.deepEqual(restored.position, before.position)
        assert.deepEqual(restored.data, before.data)
      }
      await screenshot('history-after-native-control-z-undo', null)
      report.o8Undo = { keyboard: 'Control+Z', actualResponseStatus: undoResponse.status(), state: undoHistory,
        frameRemoved: true, sourceNodesRestored: true }

      const redoResponsePromise = batchResponse('redo')
      await page.keyboard.press('Control+Shift+Z')
      const redoResponse = await redoResponsePromise
      assert.equal(historyPhaseIndex, 3)
      await groupLocator.waitFor({ state: 'visible', timeout: 20000 })
      assert.equal(await collectionFace.getAttribute('data-lcos-native-collection-space-expanded'), 'true')
      const redoHistory = await readHistory(frameId)
      assert.equal(redoHistory.ok, true)
      assert.equal(redoHistory.currentIndex, report.o8HistoryBaseline.currentIndex + 1)
      assert.equal(redoHistory.currentEntry?.operations?.some(row => row.operation?.kind === 'collection-space'
        && row.operation.phase === 'apply' && row.nodeId === frameId), true)
      const canvasAfterRedo = await appCanvas(mainWorkspace.canvasId)
      assert.equal(String(canvasAfterRedo.nodes.find(node => String(node.id) === frameId)?.id), frameId,
        'Redo must restore the original stable frame ID.')
      assert.deepEqual(canvasAfterRedo.nodes.filter(node => parentIdOf(node) === frameId).map(node => String(node.id)).sort(),
        sourceBytes.map(row => row.nodeId).sort())
      for (const source of sourceBytes) await page.locator(nodeSelector(source.nodeId)).waitFor({ state: 'visible', timeout: 15000 })
      await screenshot('history-after-native-control-shift-z-redo', null)
      report.o8Redo = { keyboard: 'Control+Shift+Z', actualResponseStatus: redoResponse.status(), state: redoHistory,
        sameFrameId: true, sameChildIds: true }

      const clickDisplay = async collapsed => {
        await collectionFace.locator('[data-lcos-simple-collection] .lcos-collection-folder-face').click()
        await page.locator('[data-lcos-native-collection-node="' + collectionNodeId
          + '"][data-lcos-native-collection-space-state="ready"][data-lcos-native-collection-space-expanded="'
          + String(!collapsed) + '"]').waitFor({ state: 'visible', timeout: 15000 })
        for (const id of [frameId, ...sourceBytes.map(row => row.nodeId)]) {
          await page.locator(nodeSelector(id)).waitFor({ state: collapsed ? 'hidden' : 'visible', timeout: 15000 })
        }
        const history = await readHistory(frameId)
        assert.equal(history.historySize, redoHistory.historySize, 'Display toggle must not append an O8 entry.')
        assert.equal(history.currentIndex, redoHistory.currentIndex, 'Display toggle must not move the O8 cursor.')
        assert.equal(stableJson(fingerprintCanvas(await appCanvas(mainWorkspace.canvasId))), stableJson(fingerprintCanvas(canvasAfterRedo)),
          'Display toggle must not change saved geometry, parents, data or Canvas version.')
        assert.equal(historyReceipts.length, 3, 'Display toggle must not submit a fourth space batch.')
        const stored = await page.evaluate(canvasId => JSON.parse(localStorage.getItem('huabu:canvas:' + canvasId + ':collapsed-frames') ?? '[]'), mainWorkspace.canvasId)
        assert.equal(stored.includes(frameId), collapsed, 'The original Gen2 collapse preference must match the real display.')
        return { collapsed, historySize: history.historySize, currentIndex: history.currentIndex, canvasVersion: canvasAfterRedo.version }
      }
      const collapseReadback = await clickDisplay(true)
      await screenshot('history-display-only-collapsed', null)
      const reopenReadback = await clickDisplay(false)
      await screenshot('history-display-only-reopened', null)
      report.displayOnlyToggle = { originalFolderClicks: 2, collapse: collapseReadback, reopen: reopenReadback,
        noSpatialWrite: true, noNewHistoryEntry: true }

      assert.equal(historyPhaseIndex, 3, 'The browser must issue exactly apply, undo and redo; no retry/replay is allowed.')
      assert.equal(historyReceipts.length, 3)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 })
      const agentPanelAfterReload = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
      if (await agentPanelAfterReload.isVisible()) await agentPanelAfterReload.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
      assert.equal(await page.locator('.react-flow').count(), 1,
        'Reload must still use the single original TapNow ReactFlow.')
      const collectionFaceAfterReload = page.locator('[data-lcos-native-collection-node="' + collectionNodeId
        + '"][data-lcos-native-collection-availability="ready"]')
      await collectionFaceAfterReload.waitFor({ state: 'visible', timeout: 30000 })
      const groupAfterReload = page.locator(nodeSelector(frameId))
      await groupAfterReload.waitFor({ state: 'attached', timeout: 30000 })
      const reloadCanvas = await appCanvas(mainWorkspace.canvasId)
      assert.equal(stableJson(fingerprintCanvas(reloadCanvas)), stableJson(expectedUiCanvas),
        'Reload must recover the same original group, members and committed geometry.')
      const reloadMaterials = []
      for (const source of sourceBytes) {
        const child = page.locator(nodeSelector(source.nodeId))
        await child.waitFor({ state: 'attached', timeout: 20000 })
        const actual = reloadCanvas.nodes.find(node => String(node.id) === source.nodeId)
        assert.equal(parentIdOf(actual), frameId)
        if (source.type === 'image') {
          const dimensions = await child.locator('img').first().evaluate(element => ({
            complete: element.complete, naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight }))
          assert.equal(dimensions.complete, true)
          assert.ok(dimensions.naturalWidth > 0 && dimensions.naturalHeight > 0)
          reloadMaterials.push({ type: 'image', nodeId: source.nodeId, ...dimensions })
        } else {
          const content = String(sourceNodes.find(row => String(row.node?.id) === source.nodeId)?.node.data?.content ?? '')
          const visibleText = await child.innerText()
          const lines = fixtureVisibleLines(content)
          assert.ok(lines.every(line => visibleText.includes(line)))
          reloadMaterials.push({ type: 'text', nodeId: source.nodeId, lines, sameBody: true })
        }
      }
      const domWorldGeometry = []
      for (const id of [frameId, ...sourceBytes.map(row => row.nodeId)]) {
        const expectedWorld = absolutePosition(reloadCanvas.nodes, id)
        const saved = reloadCanvas.nodes.find(node => String(node.id) === id)
        const dom = await page.locator(nodeSelector(id)).evaluate(element => {
          const style = getComputedStyle(element)
          const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform)
          return { x: matrix.m41, y: matrix.m42, width: parseFloat(style.width), height: parseFloat(style.height) }
        })
        assert.ok(expectedWorld && closeTo(dom.x, expectedWorld.x) && closeTo(dom.y, expectedWorld.y),
          'Reloaded original ReactFlow DOM must match saved world geometry: ' + id)
        assert.ok(closeTo(dom.width, saved.measured.width) && closeTo(dom.height, saved.measured.height),
          'Reloaded original ReactFlow DOM size must match the saved same-ID node: ' + id)
        domWorldGeometry.push({ id, expectedWorld, dom })
      }
      report.domWorldGeometry = domWorldGeometry
      await screenshot('history-after-reload-same-frame-and-members', null)
      const [graphAfter, presentationsAfter, membersAfter, runsAfter] = await Promise.all([
        appCoreValue('/graph'), appCoreValue('/presentations'),
        appCoreValue('/collections/' + encodeURIComponent(collectionId) + '/members'), appCoreValue('/runs'),
      ])
      assert.equal(stableJson(graphAfter), stableJson(graphBeforeSpace))
      assert.equal(stableJson(presentationsAfter), stableJson(presentationsBeforeSpace))
      assert.equal(stableJson(membersAfter), stableJson(membersBeforeSpace))
      assert.equal(stableJson(runsAfter), stableJson(runsBeforeSpace))
      for (const source of sourceBytes) assert.deepEqual((await appCoreBytes('/file-records/'
        + encodeURIComponent(source.fileRecordId) + '/content')).bytes, source.bytes)
      for (const [id, before] of Object.entries(otherCanvasesBefore)) {
        assert.equal(stableJson(fingerprintCanvas(await appCanvas(id))), stableJson(before))
      }
      assert.deepEqual(report.pageErrors, [], 'The original Collection/history flow raised a browser page error.')
      assert.deepEqual(report.unexpectedWrites, [], 'Only the one measured original image update and exact three O8 batches are in scope.')
      assert.equal(report.browserWrites.filter(write => write.historyPhase).length, 3)
      report.userExpandClick = true
      report.spaceOperation.userExpandClick = true
      report.spaceOperation.o8Undo = true
      report.spaceOperation.o8Redo = true
      report.gui = { route: canvasRoute, title: await page.title(), viewport: report.browser.viewport,
        reactFlowCount: flowCount, collectionNodeId, groupId: frameId, childNodeIds: sourceBytes.map(row => row.nodeId),
        materials: browserMaterials, pageReload: { performed: true, sameFrameId: true, sameChildIds: true, materials: reloadMaterials },
        userExpandClick: true, o8Undo: true, o8Redo: true, historyReceipts }
      report.afterSpace = { canvas: fingerprintCanvas(canvasAfterRedo), groupId: frameId,
        childIds: sourceBytes.map(row => row.nodeId), imageMeasurementCount,
        historyVersionDelta: canvasAfterRedo.version - canvasBeforeO8.version,
        CoreGraphUnchanged: true, presentationUnchanged: true, collectionMembershipUnchanged: true,
        sourceBytesUnchanged: true, otherCanvasesUnchanged: true, runsUnchanged: true }
      report.browserWritesSummary = { emptyExecutionProjectionSyncs: executionSyncCount,
        exactNoOpCanvasEchoes: noOpCanvasEchoCount, originalImageMeasurements: imageMeasurementCount,
        collectionSpaceHistoryBatches: historyReceipts.length }
      report.cases.push(
        'Original Gen1 Collection folder click commits one exact prepared group/member operation through the original ReactFlow and O8 history owner',
        'Original Canvas Ctrl+Z dissolves only the frame and restores existing member parent/positions; Ctrl+Shift+Z restores the same frame and material IDs',
        'Original folder collapse/reopen only changes the original Gen2 display preference; no Canvas version, parent, geometry, history cursor or new batch changes',
        'A real page reload reads the same frame, child refs/content and file bytes in the single original ReactFlow',
        'Core graph, Presentation membership, Collection membership, Run count, FileRecord bytes and the other two Workspaces remain unchanged',
      )
      report.overallO8CollectionSpaceGuiPassed = true
      report.passed = true
    }
  } catch (error) {
    report.failure = String(error.stack ?? error)
    report.passed = false
    if (page) {
      report.failureUrl = page.url()
      report.failureBody = (await page.locator('body').innerText().catch(() => '')).slice(0, 9000)
      report.failureCollectionClickTrace = await page.evaluate(() => window.__LCOS_COLLECTION_CLICK_TRACE__ ?? []).catch(() => [])
      report.failureCollectionDom = await page.locator('[data-lcos-native-collection-node]').evaluateAll(elements => elements.map(element => ({
        attrs: Object.fromEntries([...element.attributes].map(attr => [attr.name, attr.value])),
        folder: element.querySelector('[data-lcos-simple-collection]')?.outerHTML?.slice(0, 1800),
        status: element.querySelector('[data-lcos-native-collection-space-status]')?.textContent,
      }))).catch(() => [])
      report.failureCanvasReadback = await appCanvas(mainWorkspace.canvasId).catch(readError => ({ unavailable: String(readError) }))
      await screenshot('failure-current-page', null).catch(() => {})
    }
    if (facade) {
      try { await facade.close(); report.bootstrapFacadeClosed = true }
      catch (closeError) { report.bootstrapCloseError = String(closeError.stack ?? closeError) }
      facade = undefined
    }
  } finally {
    if (page) { try { await page.close() } catch {} }
    if (context) { try { await context.close() } catch {} }
    if (browser) { try { await browser.close() } catch {} }
    if (facade) {
      try { await facade.close(); report.bootstrapFacadeClosed = true }
      catch (error) { report.bootstrapCloseError = String(error.stack ?? error) }
      facade = undefined
    }
    report.launcher.stdoutTail = launcherStdout
    report.launcher.stderrTail = launcherStderr
    await stopLauncher()
    report.cleanup.runtime = await removeRuntime()
    report.runtimeRemoved = report.cleanup.runtime.removed === true
    report.pinnedOllamaAttempted = report.pinnedOllamaRejected.length > 0
    try { await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8') }
    catch (error) { report.reportWriteError = String(error.stack ?? error) }
    process.stdout.write(JSON.stringify({
      passed: report.passed,
      runtimeLabel,
      origin,
      cases: report.cases,
      userExpandClick: report.userExpandClick === true,
      userArrangeClick: report.userArrangeClick === true,
      o8Undo: report.o8Undo?.sourceNodesRestored === true || report.arrangeUndo?.freeCarrierRestored === true,
      o8Redo: (report.o8Redo?.sameFrameId === true && report.o8Redo?.sameChildIds === true)
        || (report.arrangeRedo?.sameFrameId === true && report.arrangeRedo?.sameChildIds === true),
      pageErrors: report.pageErrors,
      apiFailures: report.apiFailures,
      blockedWrites: report.blockedWrites.map(({ method, path: requestPath, reason }) => ({ method, path: requestPath, reason: String(reason).split('\n')[0] })),
      unexpectedWrites: report.unexpectedWrites.map(({ method, path: requestPath, reason }) => ({ method, path: requestPath, reason: String(reason).split('\n')[0] })),
      cleanup: report.cleanup,
      runtimeRemoved: report.runtimeRemoved,
      reportPath,
    }, null, 2) + '\n')
    if (!report.passed || report.reportWriteError) process.exitCode = 1
  }
}
