import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flags = new Set(argv.filter(value => !value.includes('=')))
const valueArg = name => argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)
function nativeCreateWirePosition(position) {
  return { x: Math.round(position.x * 100) / 100, y: Math.round(position.y * 100) / 100 }
}
function samePosition(actual, expected) {
  return actual?.x === expected?.x && actual?.y === expected?.y
}
const help = flags.has('--help') || flags.has('-h')
if (help) {
  console.log('Usage: node scripts/native-gen1-branch-browser.mjs --deployed --allow-one-native-branch-create [--base-url=http://127.0.0.1:17881]')
  console.log('Read-only recovery: node scripts/native-gen1-branch-browser.mjs --deployed --existing-created-node-id=<native-node-id> [--base-url=...]')
  console.log('Pure check: node scripts/native-gen1-branch-browser.mjs --check-coordinate-rounding')
  process.exit(0)
}

const createEnabled = flags.has('--allow-one-native-branch-create')
const recoveryNodeId = valueArg('--existing-created-node-id')
if (flags.has('--check-coordinate-rounding')) {
  const flowPoint = { x: 1662.1428571428573, y: 417.47714285714284 }
  const wirePoint = { x: 1662.14, y: 417.48 }
  assert.deepEqual(nativeCreateWirePosition(flowPoint), wirePoint)
  assert.equal(samePosition(wirePoint, nativeCreateWirePosition(flowPoint)), true)
  assert.equal(samePosition({ x: 1662.15, y: 417.48 }, nativeCreateWirePosition(flowPoint)), false,
    'A one-cent wire difference must not be accepted as coordinate tolerance.')
  console.log(JSON.stringify({ runState: 'pure-check-passed', sourceRule: 'r6 create serializer DC(position), default 2 decimals', flowPoint, wirePoint }, null, 2))
  process.exit(0)
}
const guardErrors = []
if (!flags.has('--deployed')) guardErrors.push('缺少 --deployed；不会连接运行服务。')
if (createEnabled === Boolean(recoveryNodeId)) guardErrors.push('必须二选一：--allow-one-native-branch-create 或 --existing-created-node-id=<id>。')
if (recoveryNodeId !== undefined && !recoveryNodeId.trim()) guardErrors.push('--existing-created-node-id 不能为空。')
if (argv.some(value => value.startsWith('--base-url='))) {
  try {
    const candidate = new URL(valueArg('--base-url'))
    if (candidate.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(candidate.hostname)
      || candidate.pathname !== '/' || candidate.search || candidate.hash || candidate.username || candidate.password) {
      guardErrors.push('--base-url 只能是纯 loopback HTTP origin。')
    }
  } catch { guardErrors.push('--base-url 不是有效 URL。') }
}
if (guardErrors.length) {
  console.error(JSON.stringify({ runState: 'not-started', errors: guardErrors }, null, 2))
  process.exitCode = 2
} else {
  await run()
}

async function run() {
  const baseUrl = valueArg('--base-url') || 'http://127.0.0.1:17881'
  const base = new URL(baseUrl)
  const origin = base.origin
  const canvasId = 'surface-core-context'
  const sourceNodeId = 'surface-context-text'
  const expectedH2Prefix = '正文与 Core 版本回读'
  const screenshotRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const evidenceDir = path.join(root, '.runtime', 'native-gen1-branch')
  const reportPath = path.join(evidenceDir, `${stamp}.json`)
  const report = {
    at: new Date().toISOString(),
    runState: 'starting',
    mode: createEnabled ? 'one explicitly authorized original branch-create + native history' : 'read-only existing-create recovery',
    target: { origin, canvasId, sourceNodeId, expectedH2Prefix },
    scope: 'Only the already-open Context canvas and one synthetic H2 branch. Main/Workflow, other nodes, providers, direct Core writes, synthetic node insertion, and cleanup are out of scope.',
    guards: {
      deployedFlag: true,
      oneNativeBranchCreateFlag: createEnabled,
      existingCreatedNodeId: recoveryNodeId ?? null,
      freshChromeContext: true,
      loopbackOnly: origin,
      browserWrites: createEnabled ? 'one exact native create, undo of its first ID, and redo through O8’s original fresh-ID remap' : 'blocked',
      nodeBridgeMutationMethods: 'not invoked',
    },
    browser: { engine: 'Chrome via installed playwright-core', freshContext: true,
      viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'blocked' },
    network: { allowedOrigin: origin, externalHttpBlocked: [], blockedWrites: [], webSocketsClosed: 0,
      allowedLifecycleBatches: [], apiFailures: [], providerTaskRequests: [], requestFailures: [] },
    reads: [], screenshots: [], pageErrors: [], consoleErrors: [], cases: [],
    createdNodeId: null,
    firstCreatedNodeId: null,
    restoredNodeId: null,
    nativeIdRemap: null,
    createCommitted: false,
    passed: false,
    notes: [
      'The expected branch body is produced from the exact Core source body by createOutlineSourceSession().serializeBranch(); it is not inferred from a title substring.',
      'The only create comes from the original LcosTextFaces branch button pointer capture and a real mouse drag to blank ReactFlow pane. No synthetic drag event, DataTransfer, NodeLab addNodes call, or Core write is used by this script.',
      'The original r6 create bucket serializes position with DC(Ue.position); DC defaults to 2 decimals using Math.round(coord * 10**digits) / 10**digits. Initial-drop screenToFlowPosition is checked against that exact wire rule; receipt/history/reload use the actually admitted request.position.',
      'Repeated POSTs carrying the same Native ID/operation after the first admission remain original queue-retry evidence; they are not counted or authorized as additional user gestures.',
      'Undo/redo use real Ctrl+Z and Ctrl+Shift+Z after the original O8 debounce interval. Any committed create is retained on failure; there is no automatic delete/retry/cleanup.',
      'O8 redo may allocate a fresh Native ID. The report keeps firstCreatedNodeId → restoredNodeId while requiring the same operationId, exact Core ref/body/position, Artifact/View/Revision/FileRecord, and no extra material revision.',
      'FileRecord bytes and Artifact/View/Revision are read-only. Existing Core material is expected to survive spatial undo unchanged.',
      'Page errors, console errors, blocked requests, and background HTTP failures remain visible; no global zero-error claim is made.',
    ],
  }

  let browser
  let context
  let page
  let serverStatus
  let beforeCanvas
  let beforeSourceCore
  let expectedBranchBody
  let branchNode
  let createOperation
  let createdRef
  let createdNodeId = null
  let restoredNodeId = null
  let originalCreatedPosition = null
  let stage = 'read-only-setup'
  const allowedBatchByRequest = new WeakMap()
  const blockedBatchByRequest = new WeakMap()
  const waiters = new Map()

  const safePath = value => {
    try { const url = new URL(value); return url.origin + url.pathname } catch { return String(value).slice(0, 300) }
  }
  const cleanText = value => String(value)
    .replace(/((?:token|secret|credential|authorization|api.?key)\s*[:=]\s*)[^\s,;]+/ig, '$1[redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/g, value => safePath(value))
    .slice(0, 1400)
  const stable = value => JSON.stringify(value)
  const finite = value => typeof value === 'number' && Number.isFinite(value)
  const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value)
  const refSummary = ref => isRecord(ref) ? {
    version: ref.version, entityType: ref.entityType, entityId: ref.entityId,
    artifactId: ref.artifactId, artifactViewId: ref.artifactViewId, revisionId: ref.revisionId,
  } : null
  const bodyOf = node => typeof node?.data?.text === 'string' ? node.data.text
    : typeof node?.data?.content === 'string' ? node.data.content : null
  const geometryOf = node => ({ position: node?.position ?? null, width: node?.width ?? null,
    height: node?.height ?? null, measured: node?.measured ?? null, style: node?.style ?? null })
  const dimensionOf = node => {
    const width = [node?.measured?.width, node?.width, node?.style?.width].find(finite)
    const height = [node?.measured?.height, node?.height, node?.style?.height].find(finite)
    return { width: width ?? null, height: height ?? null }
  }
  const nodeSnapshot = node => ({ id: String(node.id), type: node.type, data: node.data ?? null,
    body: bodyOf(node), ref: refSummary(node?.data?.lcos_ref ?? node?.lcos_ref),
    revisionId: node?.lcos_revision_id ?? null, geometry: geometryOf(node),
    parentId: node?.parentId ?? node?.parent_id ?? null })
  const coreRoute = suffix => `/api/lcos/core${suffix}`
  const knownBackgroundBlockedPaths = new Set([
    '/api/events',
    '/api/agent-gateway/v1/conversations/suggestions/dynamic',
  ])
  const isKnownBackgroundBlock = item => item.method === 'POST' && knownBackgroundBlockedPaths.has(item.path)

  function unexpectedBlockedWrites() {
    const knownBackground = report.network.blockedWrites.filter(isKnownBackgroundBlock)
    const unexpected = report.network.blockedWrites.filter(item => !isKnownBackgroundBlock(item))
    report.network.knownBackgroundWritesBlocked = knownBackground
    report.network.unexpectedBlockedWrites = unexpected
    return unexpected
  }

  async function readJson(pathname, label) {
    const response = await fetch(new URL(pathname, origin), {
      headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error',
    })
    let payload = null
    try { payload = await response.json() } catch { /* keep the unreadable response visible */ }
    const record = { label, method: 'GET', path: pathname, status: response.status,
      code: payload?.code ?? null, coreEnvelopeOk: payload?.ok === true }
    report.reads.push(record)
    if (!response.ok) report.network.apiFailures.push({ method: 'GET', path: pathname, status: response.status,
      code: payload?.error?.code ?? payload?.code ?? null,
      message: cleanText(payload?.error?.message ?? payload?.message ?? '') })
    return { response, payload }
  }

  async function readCanvas() {
    const result = await readJson(`/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`, 'original Context canvas projection')
    assert.equal(result.response.status, 200, 'Original Context Canvas GET must succeed.')
    assert.equal(result.payload?.code, 0, 'Canvas GET must retain the original TapNow envelope.')
    assert.ok(Array.isArray(result.payload?.data?.nodes), 'Original Canvas projection must contain nodes.')
    return result.payload.data
  }

  async function readCoreText(spatialId) {
    const query = new URLSearchParams({ canvasId, spatialId })
    const result = await readJson(coreRoute(`/projects/${encodeURIComponent(serverStatus.projectId)}/curation/canvas-text?${query}`),
      `Core canonical canvas text for ${spatialId}`)
    if (result.response.status !== 200 || result.payload?.ok !== true || !isRecord(result.payload.value)) return null
    return result.payload.value
  }

  async function readArtifact(artifactId, expectedCurrentRevisionId = undefined) {
    const result = await readJson(coreRoute(`/artifacts/${encodeURIComponent(artifactId)}`), `Core Artifact ${artifactId}`)
    assert.equal(result.response.status, 200, 'Core Artifact must remain readable.')
    assert.equal(result.payload?.ok, true)
    assert.ok(isRecord(result.payload.value))
    const artifact = result.payload.value.artifact
    assert.ok(isRecord(artifact), 'ArtifactDetailV0 must expose the actual artifact in value.artifact.')
    assert.equal(String(artifact.id), String(artifactId), 'Core Artifact readback must match the requested Artifact ID.')
    if (expectedCurrentRevisionId !== undefined) {
      assert.equal(String(artifact.currentRevisionId), String(expectedCurrentRevisionId),
        'Core Artifact currentRevisionId must match the exact requested/current revision.')
    }
    return artifact
  }

  async function readRevisions(artifactId) {
    const result = await readJson(coreRoute(`/artifacts/${encodeURIComponent(artifactId)}/revisions`), `Core revisions for ${artifactId}`)
    assert.equal(result.response.status, 200)
    assert.equal(result.payload?.ok, true)
    assert.ok(Array.isArray(result.payload?.value))
    return result.payload.value
  }

  async function readFileBytes(fileRecordId) {
    const pathname = coreRoute(`/projects/${encodeURIComponent(serverStatus.projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`)
    const response = await fetch(new URL(pathname, origin), { headers: { Accept: '*/*' }, cache: 'no-store', redirect: 'error' })
    const bytes = Buffer.from(await response.arrayBuffer())
    report.reads.push({ label: 'Core FileRecord bytes', method: 'GET', path: pathname,
      status: response.status, byteLength: bytes.length })
    if (!response.ok) report.network.apiFailures.push({ method: 'GET', path: pathname, status: response.status,
      code: null, message: 'Core FileRecord content read failed.' })
    return { response, bytes }
  }

  async function readMaterialBundle(artifactId, expected = {}) {
    const artifact = await readArtifact(artifactId, expected.revisionId)
    assert.equal(artifact.projectId, serverStatus.projectId, 'Artifact must belong to the isolated current project.')
    const revisions = await readRevisions(artifactId)
    const revisionId = expected.revisionId ?? artifact.currentRevisionId
    const revision = revisions.find(item => String(item.id) === String(revisionId))
    assert.ok(revision, 'Exact current revision must still be listed for its original Artifact.')
    const fileRecordId = String(revision.fileRecordId)
    const file = await readFileBytes(fileRecordId)
    assert.equal(file.response.status, 200)
    const text = file.bytes.toString('utf8')
    if (expected.body !== undefined) assert.equal(text, expected.body, 'Registered FileRecord bytes must equal the exact expected Core text.')
    return { artifact, revisions, revision, fileRecordId, file, text }
  }

  async function readInitialCoreBundle(spatialId) {
    const value = await readCoreText(spatialId)
    assert.ok(value && typeof value.body === 'string', 'Core canvas-text must return the exact canonical body.')
    assert.equal(value.projectId, serverStatus.projectId)
    assert.equal(value.canvasId, canvasId)
    assert.equal(value.spatialId, spatialId)
    const bundle = await readMaterialBundle(String(value.artifactId), { revisionId: value.revisionId, body: value.body })
    assert.equal(bundle.artifact.id, value.artifactId)
    assert.equal(bundle.artifact.currentRevisionId, value.revisionId)
    assert.equal(bundle.fileRecordId, String(value.fileRecordId))
    return { value, ...bundle }
  }

  function exactRef(value) {
    return isRecord(value) && value.version === 1 && value.entityType === 'artifact'
      && typeof value.entityId === 'string' && value.entityId.length > 0 && value.entityId === value.artifactId
      && typeof value.artifactId === 'string' && value.artifactId.length > 0
      && typeof value.artifactViewId === 'string' && value.artifactViewId.length > 0
      && typeof value.revisionId === 'string' && value.revisionId.length > 0
  }

  function flattenOutline(nodes, out = []) {
    for (const node of nodes) {
      out.push(node)
      flattenOutline(node.children ?? [], out)
    }
    return out
  }

  function assertOriginalNodesUnchanged(before, after, { createdId, deleted = false } = {}) {
    const beforeById = new Map(before.nodes.map(node => [String(node.id), nodeSnapshot(node)]))
    const afterById = new Map(after.nodes.map(node => [String(node.id), nodeSnapshot(node)]))
    for (const [id, snapshot] of beforeById) {
      assert.ok(afterById.has(id), `Existing node ${id} disappeared from Context.`)
      assert.equal(stable(afterById.get(id)), stable(snapshot), `Existing node ${id} data/body/ref/revision/geometry changed.`)
    }
    if (createdId) {
      if (deleted) assert.equal(afterById.has(createdId), false, 'Undo must remove only the new spatial carrier.')
      else assert.equal(afterById.has(createdId), true, 'The new branch carrier must remain present.')
    }
    const expectedCount = before.nodes.length + (createdId && !deleted ? 1 : 0)
    assert.equal(after.nodes.length, expectedCount, 'Only the one explicitly created branch may alter node count.')
    return { initialNodeCount: before.nodes.length, currentNodeCount: after.nodes.length,
      existingNodesByteStable: true, createdNodeId: createdId ?? null, createdCarrierExpectedPresent: createdId ? !deleted : false }
  }

  function validateOperation(operation, phase) {
    if (!isRecord(operation) || operation.version !== 1 || typeof operation.operationId !== 'string'
      || !operation.operationId.trim() || operation.operationId.length > 200 || operation.kind !== 'create'
      || operation.phase !== phase || Object.keys(operation).some(key => !['version', 'operationId', 'kind', 'phase'].includes(key))) {
      return { ok: false, reason: `Expected the original explicit create/${phase} history operation.` }
    }
    if (createOperation && operation.operationId !== createOperation.operationId) {
      return { ok: false, reason: 'Undo/redo operationId does not match the one original create history entry.' }
    }
    if (!createOperation && phase !== 'apply') return { ok: false, reason: 'History phase arrived before the one original create receipt.' }
    return { ok: true }
  }

  function validateRevisionEcho(body, { phase, candidateCreatedNodeId = null } = {}) {
    if (body.lcos_expected_revisions === undefined) return { ok: true }
    if (!isRecord(body.lcos_expected_revisions)) return { ok: false, reason: 'Observed revision echo is not a record.' }
    const beforeById = new Map(beforeCanvas.nodes.map(node => [String(node.id), node.lcos_revision_id ?? node.data?.lcos_ref?.revisionId]))
    // startup-surface-core clones its page-owned observed-revision Map for a batch
    // response and updates entries from the echoed CAS payload; spatial deletion
    // does not remove a previously observed key. O8 redo can therefore echo the
    // first ID's exact known revision alongside the new carrier ID. Do not infer
    // either ID from the ref: only these explicit native IDs are accepted.
    const replayedOriginalId = phase === 'undo' || phase === 'redo' ? createdNodeId : null
    const createdIds = new Set([replayedOriginalId, restoredNodeId, candidateCreatedNodeId]
      .filter(id => typeof id === 'string' && id.length > 0))
    for (const [id, revision] of Object.entries(body.lcos_expected_revisions)) {
      const expected = createdIds.has(id) ? createdRef?.revisionId : beforeById.get(id)
      if (expected === undefined || typeof revision !== 'string' || revision !== expected) {
        return { ok: false, reason: `Expected-revision echo has unknown/changed NodeID ${id}.` }
      }
    }
    return { ok: true }
  }

  function validateCreateDto(node, phase, expectedPosition) {
    if (!isRecord(node) || typeof node.id !== 'string' || !node.id.trim() || node.type !== 'text'
      || !isRecord(node.position) || !finite(node.position.x) || !finite(node.position.y)
      || !isRecord(node.data) || node.data.text !== expectedBranchBody || typeof node.data.prompt !== 'string' || node.data.prompt !== '') {
      return { ok: false, reason: 'Create DTO is not one original native text carrier with the exact serializer-produced branch body.' }
    }
    const allowedNodeKeys = new Set(['id', 'type', 'data', 'position', 'measured', 'canvas_id', 'parent_id', 'lcos_ref'])
    if (Object.keys(node).some(key => !allowedNodeKeys.has(key))) return { ok: false, reason: 'Create DTO contains non-native or unsupported carrier fields.' }
    if (node.canvas_id !== undefined && node.canvas_id !== canvasId) return { ok: false, reason: 'Create DTO names a different Canvas.' }
    if (node.parent_id !== undefined && node.parent_id !== '') return { ok: false, reason: 'Branch must be a new root carrier; non-empty parent semantics are unsupported.' }
    if (node.measured !== undefined && (!isRecord(node.measured) || node.measured.width !== 250 || node.measured.height !== 250)) {
      return { ok: false, reason: 'Original TapNow text factory 250×250 measured defaults changed.' }
    }
    if (phase === 'apply') {
      if (node.data.lcos_ref !== undefined || node.lcos_ref !== undefined) return { ok: false, reason: 'Fresh text create must receive its Core identity from the real producer.' }
      if (beforeCanvas.nodes.some(item => String(item.id) === node.id)) return { ok: false, reason: 'Fresh create NodeID collides with an existing Context node.' }
      if (!samePosition(node.position, nativeCreateWirePosition(expectedPosition))) return { ok: false, reason: 'Create DTO position differs from original finishBranch screenToFlowPosition(drop + 14,16) after the original r6 DC two-decimal wire serialization.' }
    } else {
      const nodeRef = node.data.lcos_ref ?? node.lcos_ref
      const originalIds = new Set(beforeCanvas.nodes.map(item => String(item.id)))
      if (restoredNodeId !== null || node.id === createdNodeId || originalIds.has(node.id)
        || !exactRef(nodeRef)
        || stable(refSummary(nodeRef)) !== stable(refSummary(createdRef))
        || (node.data.lcos_ref !== undefined && node.lcos_ref !== undefined
          && stable(refSummary(node.data.lcos_ref)) !== stable(refSummary(node.lcos_ref)))) {
        return { ok: false, reason: 'Redo must map the one original create to a fresh, non-colliding Native ID with the exact original Artifact/View/Revision ref.' }
      }
      if (node.parent_id !== '') return { ok: false, reason: 'Redo did not preserve the original root-node empty parent echo.' }
      if (!expectedPosition || !samePosition(node.position, expectedPosition)) {
        return { ok: false, reason: 'Redo remap changed the original create position.' }
      }
    }
    if (phase === 'apply' && createdNodeId && node.id !== createdNodeId) return { ok: false, reason: 'A second create NodeID was observed.' }
    return { ok: true, node }
  }

  function validateLifecycleRequest(request) {
    let body
    try { body = request.postDataJSON() } catch { return { ok: false, reason: 'Lifecycle batch body was not JSON.' } }
    if (!isRecord(body) || body.canvas_id !== canvasId || !Array.isArray(body.actions) || body.actions.length !== 1) {
      return { ok: false, reason: 'Lifecycle request is not exactly one action on the Context canvas.' }
    }
    const allowedTopKeys = new Set(['canvas_id', 'actions', 'lcos_operation', 'lcos_refs', 'lcos_snapshots',
      'lcos_expected_revisions', 'created_by_role', 'session_id'])
    if (Object.keys(body).some(key => !allowedTopKeys.has(key))) return { ok: false, reason: 'Lifecycle batch contains unexpected top-level fields.' }
    if (body.created_by_role !== undefined && body.created_by_role !== 'user') return { ok: false, reason: 'Lifecycle write is not attributed to the original user role.' }
    const action = body.actions[0]
    if (!isRecord(action)) return { ok: false, reason: 'Lifecycle action is not a record.' }
    const phaseByStage = { 'create-armed': 'apply', 'undo-armed': 'undo', 'redo-armed': 'redo' }
    const expectedPhase = phaseByStage[stage]
    if (!expectedPhase) return { ok: false, reason: `No lifecycle write is armed (stage=${stage}).` }
    const operationCheck = validateOperation(body.lcos_operation, expectedPhase)
    if (!operationCheck.ok) return operationCheck
    if (expectedPhase === 'apply' || expectedPhase === 'redo') {
      if (action.action !== 'create' || Object.keys(action).some(key => !['action', 'creates'].includes(key))
        || !Array.isArray(action.creates) || action.creates.length !== 1) {
        return { ok: false, reason: 'Only one original create carrier is allowed for this stage.' }
      }
      const expectedPosition = expectedPhase === 'apply'
        ? report.drop?.expectedFlowPosition ?? null
        : originalCreatedPosition
      if (expectedPhase === 'apply' && !expectedPosition) return { ok: false, reason: 'Expected real-drop screenToFlowPosition has not been captured.' }
      const dto = validateCreateDto(action.creates[0], expectedPhase, expectedPosition)
      if (!dto.ok) return dto
      const revisions = validateRevisionEcho(body, { phase: expectedPhase,
        candidateCreatedNodeId: expectedPhase === 'redo' ? dto.node.id : null })
      if (!revisions.ok) return revisions
      if (expectedPhase === 'apply' && body.lcos_refs !== undefined
        && (!isRecord(body.lcos_refs) || Object.keys(body.lcos_refs).length > 0)) {
        return { ok: false, reason: 'Fresh create may not guess or inject a Core identity map.' }
      }
      if (expectedPhase === 'redo' && body.lcos_refs !== undefined && (!isRecord(body.lcos_refs)
        || Object.keys(body.lcos_refs).some(id => id !== action.creates[0].id)
        || body.lcos_refs[action.creates[0].id] !== undefined
          && stable(refSummary(body.lcos_refs[action.creates[0].id])) !== stable(refSummary(createdRef)))) {
        return { ok: false, reason: 'Create reference metadata is unexpected or changed.' }
      }
      if (expectedPhase === 'apply' && createdNodeId !== null) return { ok: false, reason: 'The one authorized create has already been routed.' }
      return { ok: true, phase: expectedPhase, body, operation: body.lcos_operation, node: dto.node }
    }

    const revisions = validateRevisionEcho(body, { phase: expectedPhase })
    if (!revisions.ok) return revisions
    if (action.action !== 'delete' || Object.keys(action).some(key => !['action', 'delete_ids'].includes(key))
      || !Array.isArray(action.delete_ids) || action.delete_ids.length !== 1 || action.delete_ids[0] !== createdNodeId) {
      return { ok: false, reason: 'Undo must delete only the carrier created by this one create operation.' }
    }
    if (!isRecord(body.lcos_refs) || Object.keys(body.lcos_refs).length !== 1
      || stable(refSummary(body.lcos_refs[createdNodeId])) !== stable(refSummary(createdRef))) {
      return { ok: false, reason: 'Undo delete must retain the exact created node → Core reference translation.' }
    }
    if (body.lcos_snapshots !== undefined) {
      if (!isRecord(body.lcos_snapshots) || Object.keys(body.lcos_snapshots).some(id => id !== createdNodeId)) {
        return { ok: false, reason: 'Undo snapshot map contains a non-target NodeID.' }
      }
      const snapshot = body.lcos_snapshots[createdNodeId]
      if (!isRecord(snapshot) || snapshot.id !== createdNodeId || bodyOf(snapshot) !== expectedBranchBody
        || !exactRef(snapshot.data?.lcos_ref)
        || stable(refSummary(snapshot.data.lcos_ref)) !== stable(refSummary(createdRef))) {
        return { ok: false, reason: 'Undo snapshot does not carry the exact created body/ref identity.' }
      }
    }
    return { ok: true, phase: expectedPhase, body, operation: body.lcos_operation, nodeId: createdNodeId }
  }

  function createBatchRecord(validation) {
    const record = { phase: validation.phase, status: null, code: null, operation: validation.operation,
      nodeId: validation.node?.id ?? validation.nodeId ?? null,
      request: validation.phase === 'undo'
        ? { action: 'delete', delete_ids: [...validation.body.actions[0].delete_ids], lcos_refs: validation.body.lcos_refs,
          lcos_snapshots: validation.body.lcos_snapshots ?? null }
        : { action: 'create', node: validation.node },
      clientToSpatialIds: null, lifecycleResult: null, coreSaved: null, spatialSaved: null }
    report.network.allowedLifecycleBatches.push(record)
    allowedBatchByRequest.set(validation.request, record)
    stage = validation.phase === 'apply' ? 'create-routed' : validation.phase === 'undo' ? 'undo-routed' : 'redo-routed'
    const waiter = waiters.get(validation.phase) ?? {}
    Object.assign(waiter, { record, response: null, payload: null, processed: false })
    waiters.set(validation.phase, waiter)
    if (validation.phase === 'apply') {
      createdNodeId = validation.node.id
      originalCreatedPosition = { x: validation.node.position.x, y: validation.node.position.y }
      report.createdNodeId = createdNodeId
      report.firstCreatedNodeId = createdNodeId
      report.createRequestRouted = true
    } else if (validation.phase === 'redo') {
      restoredNodeId = validation.node.id
      report.restoredNodeId = restoredNodeId
      report.nativeIdRemap = { firstCreatedNodeId: createdNodeId, restoredNodeId,
        sameOperationId: validation.operation.operationId, receiptIdentityMatched: false,
        sameCoreIdentity: false, sameFileRecord: false, noNewRevision: false }
    }
    return record
  }

  async function waitForCanvas(predicate, label, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs
    let canvas
    do {
      canvas = await readCanvas()
      const matched = predicate(canvas)
      if (matched) return { canvas, value: matched }
      await new Promise(resolve => setTimeout(resolve, 180))
    } while (Date.now() < deadline)
    throw new Error(`${label} did not appear in original Canvas GET. Node count=${canvas?.nodes?.length ?? 'unknown'}.`)
  }

  async function waitForBatchObservation(stageName, response, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const waiter = waiters.get(stageName)
      if (waiter?.processed) {
        assert.equal(waiter.response, response, `${stageName} response must match the admitted original batch.`)
        assert.equal(waiter.record.validationError, undefined, waiter.record.validationError ?? `${stageName} response receipt must validate.`)
        return { record: waiter.record, payload: waiter.payload }
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error(`${stageName} original native batch response was not fully observed within ${timeoutMs} ms.`)
  }

  function waitForNativeCreateOutcome(timeoutMs = 45000) {
    let cancel = () => {}
    const promise = new Promise((resolve, reject) => {
      let settled = false
      let timer = null
      const cleanup = () => {
        if (timer !== null) clearTimeout(timer)
        page.off('response', onResponse)
        page.off('requestfailed', onRequestFailed)
      }
      const finish = outcome => {
        if (settled) return
        settled = true
        cleanup()
        resolve(outcome)
      }
      const onResponse = response => {
        const record = allowedBatchByRequest.get(response.request())
        if (record?.phase === 'apply') finish({ kind: 'response', response, record })
      }
      const onRequestFailed = request => {
        const blocked = blockedBatchByRequest.get(request)
        if (blocked?.phase === 'apply' && createdNodeId === null) {
          finish({ kind: 'guard-rejected', reason: blocked.reason })
          return
        }
        const record = allowedBatchByRequest.get(request)
        if (record?.phase === 'apply') {
          finish({ kind: 'request-failed', record,
            failure: cleanText(request.failure()?.errorText ?? 'unknown') })
        }
        // A later same-ID retry can be guard-rejected after the first request
        // was admitted. It is evidence of the native queue retry, not a second
        // user action and not a reason to abandon the admitted request.
      }
      timer = setTimeout(() => {
        settled = true
        cleanup()
        reject(new Error(`Timed out after ${timeoutMs} ms waiting for the admitted original create response or a decisive create failure.`))
      }, timeoutMs)
      cancel = () => {
        if (settled) return
        settled = true
        cleanup()
      }
      page.on('response', onResponse)
      page.on('requestfailed', onRequestFailed)
    })
    return { promise, cancel: () => cancel() }
  }

  function validateBatchResponse(record, response, payload) {
    record.status = response.status()
    record.code = payload?.code ?? null
    record.errorCode = payload?.error?.code ?? null
    record.coreSaved = payload?.data?.core_saved ?? null
    record.spatialSaved = payload?.data?.spatial_saved ?? null
    record.clientToSpatialIds = payload?.data?.client_to_spatial_ids ?? null
    const lifecycle = payload?.data?.lifecycle_results?.[0] ?? null
    record.lifecycleResult = lifecycle
    assert.equal(response.status(), 200, `${record.phase} native batch must succeed.`)
    assert.equal(payload?.code, 0, `${record.phase} response must retain TapNow success envelope.`)
    assert.equal(payload?.data?.canvas_id, canvasId)
    assert.equal(payload?.data?.core_saved, true)
    assert.equal(payload?.data?.spatial_saved, true)
    assert.ok(isRecord(lifecycle), 'Original lifecycle receipt must be present in the response.')
    assert.equal(lifecycle.canvas_id, canvasId)
    assert.deepEqual(lifecycle.operation, record.operation)
    if (record.phase === 'undo') {
      assert.deepEqual(lifecycle.deleted_node_ids, [createdNodeId])
      assert.equal(lifecycle.nodes.length, 0)
      assert.ok(isRecord(lifecycle.lcos_refs) && exactRef(lifecycle.lcos_refs[createdNodeId]))
      assert.equal(stable(refSummary(lifecycle.lcos_refs[createdNodeId])), stable(refSummary(createdRef)))
    } else {
      assert.equal(lifecycle.nodes.length, 1)
      const receipt = lifecycle.nodes[0]
      const expectedNodeId = record.phase === 'apply' ? createdNodeId : restoredNodeId
      assert.equal(receipt.clientNodeId, expectedNodeId, 'TapNow native NodeID must remain the Core/Huabu carrier ID for this lifecycle phase.')
      assert.equal(receipt.nodeId, expectedNodeId, 'Core/Huabu must preserve the exact client NodeID supplied by this lifecycle phase.')
      assert.equal(receipt.type, 'text')
      assert.equal(receipt.data?.text, expectedBranchBody)
      assert.ok(exactRef(receipt.lcos_ref))
      if (record.phase === 'apply') {
        assert.deepEqual(lifecycle.client_to_spatial_ids, { [expectedNodeId]: expectedNodeId })
        createdRef = receipt.lcos_ref
        record.reference = refSummary(createdRef)
        createOperation = record.operation
        assert.deepEqual(receipt.position, originalCreatedPosition, 'Initial Core receipt must preserve the exact real drop position.')
        report.createCommitted = true
        report.createMayHaveCommitted = true
        report.createReceipt = { nodeId: createdNodeId, reference: refSummary(createdRef),
          position: receipt.position, measured: receipt.measured, data: receipt.data }
      } else {
        assert.equal(stable(refSummary(receipt.lcos_ref)), stable(refSummary(createdRef)), 'Redo must restore the same Core entity identities.')
        assert.deepEqual(lifecycle.client_to_spatial_ids, { [expectedNodeId]: expectedNodeId },
          'O8 redo must report its real new-client-ID → spatial-ID mapping, not reuse the removed carrier ID.')
        assert.ok(isRecord(lifecycle.lcos_refs) && exactRef(lifecycle.lcos_refs[expectedNodeId]))
        assert.equal(stable(refSummary(lifecycle.lcos_refs[expectedNodeId])), stable(refSummary(createdRef)))
        assert.deepEqual(receipt.position, originalCreatedPosition, 'O8 redo remap must preserve the exact original branch position.')
        assert.ok(report.nativeIdRemap)
        report.nativeIdRemap.receiptIdentityMatched = true
      }
    }
  }

  async function screenshot(label, locator = null) {
    await mkdir(screenshotRoot, { recursive: true })
    const pagePath = path.join(screenshotRoot, `tapnow-native-gen1-branch-${stamp}-${label}.png`)
    await page.screenshot({ path: pagePath, fullPage: false })
    report.screenshots.push({ label, kind: 'full-viewport', path: pagePath })
    if (locator) {
      const nodePath = path.join(screenshotRoot, `tapnow-native-gen1-branch-${stamp}-${label}-node.png`)
      await locator.screenshot({ path: nodePath })
      report.screenshots.push({ label, kind: 'exact-node', path: nodePath })
    }
  }

  async function closeOriginalAgentPanelIfOpen() {
    const panel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
    if (!await panel.count() || !await panel.isVisible()) return
    report.originalAgentPanel ??= []
    const snapshot = { text: (await panel.innerText()).slice(0, 500), closeAction: null }
    report.originalAgentPanel.push(snapshot)
    await screenshot(`agent-panel-before-close-${report.originalAgentPanel.length}`)
    const close = page.getByRole('button', { name: '关闭 Agent 面板', exact: true })
    await close.waitFor({ state: 'visible', timeout: 8000 })
    await close.click()
    await panel.waitFor({ state: 'hidden', timeout: 10000 })
    snapshot.closeAction = 'Clicked the original controlled close button; no project/canvas content was edited.'
  }

  async function assertPageIdentity(label) {
    const identity = await page.evaluate(sourceId => {
      const host = window.__LCOS_NODE_LAB__
      const api = host?.api
      const liveNode = api?.getNode?.(sourceId)
      const referenceStore = window.__LCOS_REFERENCE_STORE__ ?? host?.referenceStore
      let referenceState = null
      try { referenceState = referenceStore?.getState?.() ?? null } catch { referenceState = null }
      return {
        pathname: location.pathname,
        canvasId: host?.currentCanvasId ?? host?.canvasId ?? null,
        projectId: typeof host?.projectId === 'string' ? host.projectId : null,
        referenceStoreProjectId: typeof referenceState?.projectId === 'string' ? referenceState.projectId : null,
        nodeBridge: Boolean(api),
        liveSource: liveNode ? { id: String(liveNode.id), ref: liveNode.data?.lcos_ref ?? liveNode.lcos_ref ?? null } : null,
        reactFlowRoots: document.querySelectorAll('.react-flow').length,
        dialogs: [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
          .filter(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 })
          .map(element => (element.textContent || '').trim().slice(0, 80)),
      }
    }, sourceNodeId)
    report.pageIdentity ??= {}
    report.pageIdentity[label] = identity
    assert.equal(identity.pathname, `/canvas/${canvasId}`)
    assert.equal(identity.canvasId, canvasId)
    if (identity.projectId !== null) assert.equal(identity.projectId, serverStatus.projectId,
      'When NodeLab exposes its project ID it must match Surface Core status.')
    if (identity.referenceStoreProjectId !== null) assert.equal(identity.referenceStoreProjectId, serverStatus.projectId,
      'When the original reference store is exposed it must match Surface Core status.')
    assert.ok(identity.liveSource, 'The exact current original NodeBridge must expose the source node.')
    assert.equal(identity.liveSource.id, sourceNodeId)
    assert.equal(stable(refSummary(identity.liveSource.ref)), stable(refSummary(beforeCanvas.nodes.find(node => String(node.id) === sourceNodeId)?.data?.lcos_ref)),
      'The original live NodeBridge and server-projected source must carry the same Core identity.')
    assert.equal(identity.nodeBridge, true)
    assert.equal(identity.reactFlowRoots, 1)
    assert.deepEqual(identity.dialogs, [], 'No dialog may alter branch/drop targeting.')
    report.pageIdentity[label].projectIdentityVerifiedBy = {
      statusProjectId: serverStatus.projectId,
      nodeLabProjectId: identity.projectId,
      referenceStoreProjectId: identity.referenceStoreProjectId,
      fallback: identity.projectId === null && identity.referenceStoreProjectId === null
        ? 'same project-scoped Core GET plus exact source binding on the active original NodeBridge Canvas'
        : null,
    }
    return identity
  }

  async function waitForTwoFrames(targetPage) {
    await targetPage.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    }))
  }

  async function readNativeSelectionSnapshot(targetPage, nodeId) {
    return targetPage.evaluate(id => {
      const node = [...document.querySelectorAll('.react-flow__node[data-id]')]
        .find(element => element.getAttribute('data-id') === id)
      if (!node) return null
      const api = window.__LCOS_NODE_LAB__?.api
      return { selectedClass: node.classList.contains('selected'),
        selectedNodeIds: api?.getSelection?.()?.nodeIds?.map(String) ?? [],
        zIndex: getComputedStyle(node).zIndex }
    }, nodeId)
  }

  async function inspectMindmapSelectionExposure(nodeLocator) {
    return nodeLocator.evaluate(element => {
      const candidates = [...element.querySelectorAll('.lcos-text-mindmap-root, .lcos-text-face-content, .lcos-text-mindmap')]
        .filter(candidate => (candidate.textContent || '').trim()
          && candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0)
      candidates.push(element)
      const probes = []
      const fractions = [.2, .35, .5, .65, .8]
      for (const candidate of candidates) {
        const rect = candidate.getBoundingClientRect()
        for (const fx of fractions) for (const fy of fractions) {
          const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy
          const hit = document.elementFromPoint(x, y)
          const hitNode = hit?.closest?.('.react-flow__node[data-id]') ?? null
          const control = hit?.closest?.('button,input,textarea,select,a,[role="button"],[role="tab"],[data-floating-chrome]') ?? null
          const exposed = Boolean(hit && (hit === element || element.contains(hit)) && !control
            && hitNode?.getAttribute('data-id') === element.getAttribute('data-id'))
          probes.push({ x, y, candidate: candidate.className?.toString?.() ?? candidate.tagName,
            hitTag: hit?.tagName ?? null, hitClass: hit?.className?.toString?.() ?? null,
            closestNodeId: hitNode?.getAttribute('data-id') ?? null, interactive: Boolean(control), exposed })
        }
      }
      const accepted = probes.find(probe => probe.exposed)
      return { exposed: Boolean(accepted), point: accepted ? { x: accepted.x, y: accepted.y } : null,
        hit: accepted ? { tag: accepted.hitTag, className: accepted.hitClass, candidate: accepted.candidate,
          closestNodeId: accepted.closestNodeId } : null,
        probes: probes.filter(probe => probe.exposed || probe.closestNodeId !== element.getAttribute('data-id')).slice(0, 32) }
    })
  }

  async function inspectBranchPointerPoint(buttonLocator, expectedNodeId) {
    return buttonLocator.evaluate((button, nodeId) => {
      const rect = button.getBoundingClientRect()
      const fractions = [.2, .35, .5, .65, .8]
      const probes = []
      for (const fx of fractions) for (const fy of fractions) {
        const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy
        const hit = document.elementFromPoint(x, y)
        const node = hit?.closest?.('.react-flow__node[data-id]') ?? null
        const exposed = Boolean(hit && (hit === button || button.contains(hit))
          && node?.getAttribute('data-id') === nodeId)
        probes.push({ x, y, hitTag: hit?.tagName ?? null, hitClass: hit?.className?.toString?.() ?? null,
          closestNodeId: node?.getAttribute('data-id') ?? null, exposed })
      }
      const accepted = probes.find(probe => probe.exposed)
      return { exposed: Boolean(accepted), point: accepted ? { x: accepted.x, y: accepted.y } : null,
        hit: accepted ? { tag: accepted.hitTag, className: accepted.hitClass,
          closestNodeId: accepted.closestNodeId } : null,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        probes: probes.filter(probe => probe.exposed || probe.closestNodeId !== nodeId).slice(0, 24) }
    }, expectedNodeId)
  }

  try {
    const outlineModulePath = await buildPilotEntry('lab/pilot/native-outline-source.ts',
      path.join(evidenceDir, `outline-source-${stamp}.mjs`))
    const { createOutlineSourceSession, OUTLINE_SOURCE } = await import(pathToFileURL(outlineModulePath).href)
    assert.equal(typeof createOutlineSourceSession, 'function')
    assert.equal(typeof OUTLINE_SOURCE, 'symbol')

    const healthRead = await readJson('/health', 'deployed full-integration health')
    assert.equal(healthRead.response.status, 200)
    assert.equal(healthRead.payload?.realCoreConnected, true, 'Only run against a real-Core-connected deployment.')
    assert.ok(Number.isInteger(healthRead.payload?.pid) && healthRead.payload.pid > 0)
    const statusRead = await readJson('/api/surface-core/status', 'current Core project and workspaces')
    assert.equal(statusRead.response.status, 200)
    assert.equal(statusRead.payload?.code, 0)
    serverStatus = statusRead.payload.data
    assert.equal(typeof serverStatus.projectId, 'string')
    const workspace = serverStatus.workspaces?.find(item => item.canvasId === canvasId && item.preferredSurface === 'context')
      ?? serverStatus.workspaces?.find(item => item.canvasId === canvasId)
    assert.ok(workspace, 'Only the existing Context workspace is in scope.')
    report.server = { pid: healthRead.payload.pid, profile: healthRead.payload.profile ?? null,
      projectId: serverStatus.projectId, coreConnected: serverStatus.core?.connected ?? null,
      workspace: { id: workspace.id, canvasId: workspace.canvasId, preferredSurface: workspace.preferredSurface } }

    beforeCanvas = await readCanvas()
    assert.equal(beforeCanvas.id, canvasId)
    const sourceNodes = beforeCanvas.nodes.filter(node => String(node.id) === sourceNodeId)
    assert.equal(sourceNodes.length, 1, 'The exact existing Context text node must be unique.')
    const sourceNode = sourceNodes[0]
    assert.ok(['text', 'note'].includes(sourceNode.type))
    assert.equal(sourceNode.data?.lcosTextViewMode, 'mindmap', 'The existing source must already be in Mindmap mode; this run does not switch presentation.')
    const sourceDimensions = dimensionOf(sourceNode)
    assert.ok(finite(sourceDimensions.width) && sourceDimensions.width > 0
      && finite(sourceDimensions.height) && sourceDimensions.height > 0,
    'Mindmap geometry must be present and positive; this run observes the actual size without imposing an old measurement.')
    assert.ok(exactRef(sourceNode.data?.lcos_ref), 'The source must already carry its exact Core Artifact ref.')

    beforeSourceCore = await readInitialCoreBundle(sourceNodeId)
    assert.equal(sourceNode.data.lcos_ref.artifactId, beforeSourceCore.value.artifactId)
    assert.equal(sourceNode.data.lcos_ref.artifactViewId, beforeSourceCore.value.viewId)
    assert.equal(sourceNode.data.lcos_ref.revisionId, beforeSourceCore.value.revisionId)
    assert.equal(bodyOf(sourceNode), beforeSourceCore.value.body, 'Source Canvas data and Core canonical body must agree before the branch action.')

    const outlineSession = createOutlineSourceSession(beforeSourceCore.value.body)
    const h2Matches = flattenOutline(outlineSession.parseOutline()).filter(node => node.depth === 1 && node.text.startsWith(expectedH2Prefix))
    assert.equal(h2Matches.length, 1, 'Core body must contain exactly one parsed H2 row with the requested prefix.')
    branchNode = h2Matches[0]
    expectedBranchBody = outlineSession.serializeBranch([branchNode])
    assert.ok(expectedBranchBody.trim())
    assert.equal(expectedBranchBody, outlineSession.serializeBranch([branchNode]),
      'The expected request body must be the exact output of the existing branch serializer.')
    const serializedBranchRoots = createOutlineSourceSession(expectedBranchBody).parseOutline()
    assert.equal(serializedBranchRoots.length, 1, 'The branch serializer must emit exactly one root for this selected source branch.')
    const sourceBranchContent = node => {
      const source = node?.[OUTLINE_SOURCE]
      assert.ok(source && typeof source.body === 'string', 'Every visible source-branch row must retain its native source-body mapping.')
      return { text: node.text, tags: [...node.tags], body: source.body,
        children: node.children.map(sourceBranchContent) }
    }
    assert.deepEqual(sourceBranchContent(serializedBranchRoots[0]), sourceBranchContent(branchNode),
      'The exact serialized branch must preserve the selected source rows, tags, inline/body bytes, and child structure; root heading depth may be normalized by serializeBranch.')
    const serializedRootPrefix = serializedBranchRoots[0]?.[OUTLINE_SOURCE]?.prefix ?? null
    report.source = {
      canvasNode: { id: sourceNodeId, type: sourceNode.type, position: sourceNode.position,
        geometry: geometryOf(sourceNode), mode: sourceNode.data.lcosTextViewMode,
        ref: refSummary(sourceNode.data.lcos_ref), body: beforeSourceCore.value.body },
      core: { projectId: beforeSourceCore.value.projectId, artifactId: beforeSourceCore.value.artifactId,
        viewId: beforeSourceCore.value.viewId, revisionId: beforeSourceCore.value.revisionId,
        fileRecordId: beforeSourceCore.value.fileRecordId, exactFileBytes: true,
        byteLength: beforeSourceCore.file.bytes.length, revisionListed: true },
      parsedBranch: { nodeId: branchNode.id, text: branchNode.text, depth: branchNode.depth,
        childCount: branchNode.children.length, expectedBody: expectedBranchBody,
        serializedContentValidation: { exactSerializerOutput: true, sourceBranchContentRoundTrip: true,
          sourceHeadingDepth: branchNode.depth, serializedRootDepth: serializedBranchRoots[0]?.depth ?? null,
          sourcePrefix: branchNode[OUTLINE_SOURCE]?.prefix ?? null, serializedRootPrefix } },
      initialCanvasNodeCount: beforeCanvas.nodes.length,
      initialNodes: beforeCanvas.nodes.map(node => nodeSnapshot(node)),
    }
    if (createEnabled) {
      assert.equal(beforeCanvas.nodes.length, 9, 'The prepared target Context currently has exactly nine nodes; drift stops before opening a mutating gesture.')
    } else {
      assert.equal(beforeCanvas.nodes.length, 10, 'Read-only recovery expects the original nine Context nodes plus the specified already-created branch carrier.')
    }

    if (recoveryNodeId) {
      report.mode = 'read-only existing-create recovery'
      const existing = beforeCanvas.nodes.find(node => String(node.id) === recoveryNodeId)
      assert.ok(existing, `Existing node ${recoveryNodeId} is not present on this Context canvas.`)
      assert.equal(bodyOf(existing), expectedBranchBody)
      assert.ok(exactRef(existing.data?.lcos_ref))
      const recovered = await readInitialCoreBundle(recoveryNodeId)
      assert.equal(recovered.value.body, expectedBranchBody)
      assert.equal(recovered.value.artifactId, existing.data.lcos_ref.artifactId)
      assert.equal(recovered.value.viewId, existing.data.lcos_ref.artifactViewId)
      assert.equal(recovered.value.revisionId, existing.data.lcos_ref.revisionId)
      report.recovery = { nodeId: recoveryNodeId, ref: refSummary(existing.data.lcos_ref),
        body: recovered.value.body, fileRecordId: recovered.fileRecordId, exactFileBytes: true, mutationAttempted: false }
      report.final = { canvasNodeCount: beforeCanvas.nodes.length, providerTaskRequests: 0, writesAttempted: 0 }
      report.cases.push({ name: 'read-only recovery of an already-created branch carrier', passed: true, detail: report.recovery })
      report.passed = true
      report.runState = 'passed'
      return
    }

    const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core')
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] })
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' })
    await context.route('**/*', async route => {
      const request = route.request()
      let url
      try { url = new URL(request.url()) } catch {
        report.network.blockedWrites.push({ method: request.method(), path: '[invalid URL]', reason: 'Invalid browser request URL.' })
        return route.abort('blockedbyclient')
      }
      const method = request.method().toUpperCase()
      if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
      if (url.origin !== origin) {
        report.network.externalHttpBlocked.push({ method, url: safePath(url.href), resourceType: request.resourceType() })
        return route.abort('blockedbyclient')
      }
      if (method === 'GET' || method === 'HEAD' || url.pathname.startsWith('/assets/')) return route.continue()
      const batchPath = `/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`
      if (createEnabled && method === 'POST' && url.pathname === batchPath) {
        const validation = validateLifecycleRequest(request)
        if (validation.ok) {
          validation.request = request
          const record = createBatchRecord(validation)
          return route.continue()
        }
        const blockedPhase = stage.startsWith('create-') ? 'apply'
          : stage.startsWith('undo-') ? 'undo' : stage.startsWith('redo-') ? 'redo' : null
        blockedBatchByRequest.set(request, { phase: blockedPhase, reason: validation.reason })
        report.network.blockedWrites.push({ method, path: url.pathname, stage, reason: validation.reason,
          requestSummary: (() => { try { return request.postDataJSON() } catch { return null } })() })
        return route.abort('blockedbyclient')
      }
      const isProvider = /(?:^|\/)(?:runs?|generate|generation|execute|completions?|inference|provider)(?:\/|$)/i.test(url.pathname)
      if (isProvider) report.network.providerTaskRequests.push({ method, path: url.pathname, blocked: true })
      report.network.blockedWrites.push({ method, path: url.pathname,
        reason: method === 'POST' && url.pathname === batchPath ? `No exact native operation is armed (stage=${stage}).` : 'Only the exact single-node native branch lifecycle batches are admitted.' })
      return route.abort('blockedbyclient')
    })
    await context.routeWebSocket('**/*', socket => { report.network.webSocketsClosed += 1; socket.close() })
    page = await context.newPage()
    page.on('pageerror', error => report.pageErrors.push(cleanText(error.message)))
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(cleanText(message.text())) })
    page.on('requestfailed', request => {
      let url
      try { url = new URL(request.url()) } catch { url = new URL('http://invalid/') }
      report.network.requestFailures.push({ method: request.method(), path: safePath(url.href),
        failure: cleanText(request.failure()?.errorText ?? 'unknown') })
    })
    page.on('response', async response => {
      const request = response.request()
      const allowed = allowedBatchByRequest.get(request)
      let payload = null
      if (/json/i.test(response.headers()['content-type'] ?? '')) {
        try { payload = await response.json() } catch { payload = null }
      }
      if (allowed) {
        const waiter = waiters.get(allowed.phase)
        if (waiter) { waiter.response = response; waiter.payload = payload }
        try { validateBatchResponse(allowed, response, payload) }
        catch (error) { allowed.validationError = cleanText(error instanceof Error ? error.message : error) }
        if (waiter) waiter.processed = true
      }
      const url = new URL(response.url())
      if (url.origin === origin && url.pathname.startsWith('/api/') && response.status() >= 400) {
        const failure = { method: request.method(), path: url.pathname, status: response.status(),
          code: payload?.error?.code ?? payload?.code ?? null,
          message: cleanText(payload?.error?.message ?? payload?.message ?? '') }
        report.network.apiFailures.push(failure)
        if (/(?:^|\/)(?:runs?|generate|generation|execute|completions?|inference|provider)(?:\/|$)/i.test(url.pathname.toLowerCase())) {
          report.network.providerTaskRequests.push({ method: request.method(), path: url.pathname, status: response.status(), blocked: false })
        }
      }
    })

    await page.goto(new URL(`/canvas/${canvasId}`, origin).href, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(({ expectedCanvasId }) => Boolean(window.__LCOS_NODE_LAB__?.api)
      && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === expectedCanvasId
      && document.querySelector('.react-flow'), { expectedCanvasId: canvasId }, { timeout: 30000 })
    await closeOriginalAgentPanelIfOpen()
    const target = page.locator(`.react-flow__node[data-id="${sourceNodeId}"]`)
    await target.waitFor({ state: 'visible', timeout: 30000 })
    await assertPageIdentity('initial')
    const actualMode = await target.locator('[data-lcos-text-face-mode="mindmap"]').getAttribute('aria-selected')
    assert.equal(actualMode, 'true', 'The actual original UI must already show Mindmap; script does not switch modes.')
    const map = target.locator('.lcos-text-mindmap')
    await map.waitFor({ state: 'visible', timeout: 15000 })
    const selectionBefore = await readNativeSelectionSnapshot(page, sourceNodeId)
    assert.ok(selectionBefore)
    assert.equal(selectionBefore.selectedClass || selectionBefore.selectedNodeIds.includes(sourceNodeId), false,
      'The target source must begin unselected so the original pointer selection can naturally raise it above overlapping cards.')
    const selectionPoint = await inspectMindmapSelectionExposure(target)
    report.selection = { before: selectionBefore, scannedPoint: selectionPoint }
    assert.equal(selectionPoint.exposed, true, 'A real visible non-control point in the original source Mindmap body is required for selection.')
    assert.equal(selectionPoint.hit?.closestNodeId, sourceNodeId)
    await screenshot('source-before-selection', target)
    await page.mouse.click(selectionPoint.point.x, selectionPoint.point.y)
    await page.waitForFunction(id => {
      const node = document.querySelector(`.react-flow__node[data-id="${id}"]`)
      const selected = window.__LCOS_NODE_LAB__?.api?.getSelection?.()?.nodeIds?.map(String) ?? []
      return Boolean(node?.classList.contains('selected') || selected.includes(id))
    }, sourceNodeId, { timeout: 10000 })
    await waitForTwoFrames(page)
    const selectionAfter = await readNativeSelectionSnapshot(page, sourceNodeId)
    assert.ok(selectionAfter?.selectedClass || selectionAfter?.selectedNodeIds.includes(sourceNodeId),
      'The real original Canvas pointer click must select the exact source node.')
    report.selection.after = selectionAfter
    report.selection.changedNaturally = stable(selectionBefore.selectedNodeIds) !== stable(selectionAfter.selectedNodeIds)
      || selectionBefore.selectedClass !== selectionAfter.selectedClass
    await screenshot('source-naturally-selected-raised', target)

    const buttons = await target.locator('.lcos-text-mindmap-node').evaluateAll(elements => elements.map(element => ({
      label: element.getAttribute('aria-label'), text: (element.textContent || '').trim(),
      rect: (() => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })(),
      disabled: element.disabled,
    })))
    report.branchButtonsAfterSelection = buttons
    const buttonMatches = buttons.filter(item => item.label === branchNode.text
      || item.label === `折叠 ${branchNode.text}` || item.label === `展开 ${branchNode.text}`)
    assert.equal(buttonMatches.length, 1, 'Original Mindmap must expose one exact button for the parsed Core H2 node.')
    assert.equal(buttonMatches[0].disabled, false)
    // Use an exact accessible name rather than hasText; the label is the UI's row identity.
    const branchButton = target.getByRole('button', { name: buttonMatches[0].label, exact: true })
    assert.equal(await branchButton.count(), 1, 'The exact original branch button must be unique on the Canvas.')
    const sourceBox = await branchButton.boundingBox()
    assert.ok(sourceBox && sourceBox.width > 0 && sourceBox.height > 0)
    const branchPointerPoint = await inspectBranchPointerPoint(branchButton, sourceNodeId)
    report.branchButtonExposureAfterSelection = branchPointerPoint
    assert.equal(branchPointerPoint.exposed, true,
      'After native selection raises the source, scan a real exposed point inside the exact branch button; never force through an overlapping card.')
    const pointerStart = branchPointerPoint.point

    const drop = await page.evaluate(({ sourceNodeId, branchRect }) => {
      const pane = document.querySelector('.react-flow__pane')
      const mapElement = document.querySelector(`.react-flow__node[data-id="${sourceNodeId}"] .lcos-text-mindmap`)
      if (!pane || !mapElement) return null
      const paneRect = pane.getBoundingClientRect()
      const mapRect = mapElement.getBoundingClientRect()
      const candidates = []
      for (let y = Math.ceil(paneRect.top + 36); y < paneRect.bottom - 36; y += 24) {
        for (let x = Math.ceil(paneRect.left + 36); x < paneRect.right - 36; x += 24) {
          if (x >= mapRect.left - 10 && x <= mapRect.right + 10 && y >= mapRect.top - 10 && y <= mapRect.bottom + 10) continue
          const hit = document.elementFromPoint(x, y)
          if (!hit || !hit.closest('.react-flow__pane') || hit.closest('.react-flow__node')
            || hit.closest('[role="dialog"], [aria-modal="true"], button:not(.lcos-text-mindmap-node)')) continue
          const style = getComputedStyle(hit)
          if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') continue
          candidates.push({ x, y, hit: hit.className?.baseVal ?? hit.className ?? hit.tagName })
        }
      }
      candidates.sort((a, b) => {
        const centerX = paneRect.left + paneRect.width * 0.72
        const centerY = paneRect.top + paneRect.height * 0.62
        return Math.hypot(a.x - centerX, a.y - centerY) - Math.hypot(b.x - centerX, b.y - centerY)
      })
      const chosen = candidates[0]
      if (!chosen) return null
      return { ...chosen, paneRect: { x: paneRect.x, y: paneRect.y, width: paneRect.width, height: paneRect.height },
        mapRect: { x: mapRect.x, y: mapRect.y, width: mapRect.width, height: mapRect.height },
        dropIsOutsideMindmap: !(chosen.x >= mapRect.left && chosen.x <= mapRect.right && chosen.y >= mapRect.top && chosen.y <= mapRect.bottom),
        sourceRect: branchRect }
    }, { sourceNodeId, branchRect: branchPointerPoint.rect })
    assert.ok(drop, 'A truly blank, exposed ReactFlow pane point outside all nodes and the Mindmap must exist.')
    assert.equal(drop.dropIsOutsideMindmap, true)
    const expectedFlowPosition = await page.evaluate(({ x, y }) => {
      const api = window.__LCOS_NODE_LAB__?.api
      if (typeof api?.screenToFlowPosition !== 'function') return null
      const point = api.screenToFlowPosition({ x: x + 14, y: y + 16 })
      return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null
    }, drop)
    assert.ok(expectedFlowPosition, 'The existing real ReactFlow screenToFlowPosition bridge is required; no coordinate guess is allowed.')
    const expectedWirePosition = nativeCreateWirePosition(expectedFlowPosition)
    report.drop = { screen: { x: drop.x, y: drop.y }, actualPaneHit: drop.hit,
      paneRect: drop.paneRect, mindmapRect: drop.mapRect, outsideMindmap: drop.dropIsOutsideMindmap,
      finishBranchOffset: { x: 14, y: 16 }, expectedFlowPosition, expectedWirePosition,
      wireRule: 'Original page-Da_DfwiK.js r6 create bucket applies DC(position); DC defaults to two decimal places.' }
    await screenshot('before-real-branch-drag', target)

    stage = 'create-armed'
    const createWait = waitForNativeCreateOutcome(45000)
    try {
      await page.mouse.move(pointerStart.x, pointerStart.y)
      await page.mouse.down()
      await page.mouse.move(drop.x, drop.y, { steps: 18 })
      await page.mouse.up()
      report.branchGesture = { input: 'Playwright real mouse down → pointer-captured branch button → 18 real mouse move steps → mouse up on blank Canvas pane',
        sourceButtonAccessibleName: buttonMatches[0].label, sourcePointerDown: pointerStart,
        dropScreenPoint: { x: drop.x, y: drop.y },
        syntheticDragEvent: false, dataTransfer: false, fakeApiAdd: false }
    } catch (error) {
      createWait.cancel()
      throw error
    }

    const createOutcome = await createWait.promise
    report.createWaitOutcome = createOutcome.kind
    if (createOutcome.kind === 'guard-rejected') {
      throw new Error(`The original create was promptly rejected by the exact request guard: ${createOutcome.reason}`)
    }
    if (createOutcome.kind === 'request-failed') {
      report.createTransportFailure = createOutcome.failure
      throw new Error(`The admitted original create request failed before a response; its commit state is uncertain: ${createOutcome.failure}`)
    }
    assert.equal(createOutcome.kind, 'response')
    const createResponse = createOutcome.response
    const createObserved = await waitForBatchObservation('apply', createResponse)
    const createPayload = createObserved.payload
    const createRecord = createObserved.record
    assert.ok(createRecord, 'Exactly one valid original create batch must have been admitted.')
    assert.equal(createRecord.status, 200)
    assert.deepEqual(createRecord.request.node.position, expectedWirePosition,
      'The initial request must match the exact original r6 create serializer wire position.')
    assert.deepEqual(originalCreatedPosition, createRecord.request.node.position,
      'All later receipt/history/reload checks are anchored to the exact admitted request position.')
    assert.deepEqual(createRecord.request.node.measured, { width: 250, height: 250 }, 'Original XD/fi create payload must retain its observed 250×250 defaults.')
    assert.equal(createRecord.request.node.data.text, expectedBranchBody)
    assert.equal(report.network.allowedLifecycleBatches.filter(item => item.phase === 'apply').length, 1,
      'The branch drag may submit exactly one fresh create operation.')
    report.createdNodeId = createdNodeId
    report.createOperation = createOperation
    report.createReceipt ??= { nodeId: createdNodeId, reference: refSummary(createdRef),
      position: createRecord.lifecycleResult.nodes[0].position, measured: createRecord.lifecycleResult.nodes[0].measured,
      data: createRecord.lifecycleResult.nodes[0].data }

    const createdCanvasRead = await waitForCanvas(canvas => canvas.nodes.find(node => String(node.id) === createdNodeId), 'new native text carrier')
    const createdNode = createdCanvasRead.value
    assert.equal(bodyOf(createdNode), expectedBranchBody)
    assert.ok(exactRef(createdNode.data?.lcos_ref))
    assert.equal(stable(refSummary(createdNode.data.lcos_ref)), stable(refSummary(createdRef)))
    assert.equal(createdNode.data.lcosTextViewMode, undefined, 'Fresh factory must not inherit source presentation-only state.')
    assert.deepEqual(createdNode.position, originalCreatedPosition)
    assert.deepEqual(dimensionOf(createdNode), { width: 250, height: 250 })
    const createCoreValue = await readCoreText(createdNodeId)
    assert.ok(createCoreValue)
    assert.equal(createCoreValue.projectId, serverStatus.projectId)
    assert.equal(createCoreValue.canvasId, canvasId)
    assert.equal(createCoreValue.spatialId, createdNodeId)
    assert.equal(createCoreValue.artifactId, createdRef.artifactId)
    assert.equal(createCoreValue.viewId, createdRef.artifactViewId)
    assert.equal(createCoreValue.revisionId, createdRef.revisionId)
    assert.equal(createCoreValue.body, expectedBranchBody)
    const createdBundle = await readMaterialBundle(createdRef.artifactId, { revisionId: createdRef.revisionId, body: expectedBranchBody })
    assert.equal(createdBundle.artifact.currentRevisionId, createdRef.revisionId)
    assert.equal(createdBundle.fileRecordId, String(createCoreValue.fileRecordId))
    const afterCreateCanvas = await readCanvas()
    report.create = {
      nativeBatch: createRecord, node: nodeSnapshot(createdNode), core: {
        projectId: createCoreValue.projectId, canvasId: createCoreValue.canvasId, spatialId: createCoreValue.spatialId,
        artifactId: createCoreValue.artifactId, viewId: createCoreValue.viewId, revisionId: createCoreValue.revisionId,
        fileRecordId: createCoreValue.fileRecordId, body: createCoreValue.body,
        fileByteLength: createdBundle.file.bytes.length, exactFileBytes: createdBundle.text === expectedBranchBody,
        revisionListed: createdBundle.revisions.some(item => String(item.id) === String(createCoreValue.revisionId)),
      },
      nonTargetInvariants: assertOriginalNodesUnchanged(beforeCanvas, afterCreateCanvas, { createdId: createdNodeId }),
      sourceBodyAndRevisionUnchanged: true,
    }
    assert.equal(createdBundle.text, expectedBranchBody)
    assert.ok(createdBundle.revisions.some(item => String(item.id) === String(createCoreValue.revisionId)))
    assert.equal((await readInitialCoreBundle(sourceNodeId)).value.revisionId, beforeSourceCore.value.revisionId,
      'The original source Artifact revision must not change when a branch is created.')
    await screenshot('branch-created-and-core-receipted', page.locator(`.react-flow__node[data-id="${createdNodeId}"]`))
    report.cases.push({ name: 'real original branch drag creates one exact Core-bound text carrier at real screenToFlow drop position', passed: true })

    await page.waitForTimeout(1400) // allow TapNow O8 native history to settle this create before Ctrl+Z
    stage = 'undo-armed'
    const undoResponsePromise = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.origin === origin
        && url.pathname === `/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`
    }, { timeout: 45000 })
    await page.keyboard.press('Control+z')
    const undoResponse = await undoResponsePromise
    const undoObserved = await waitForBatchObservation('undo', undoResponse)
    const undoPayload = undoObserved.payload
    const undoRecord = undoObserved.record
    assert.ok(undoRecord, 'One original Ctrl+Z delete batch must be observed.')
    assert.equal(undoRecord.operation.operationId, createOperation.operationId)
    assert.equal(undoRecord.operation.kind, 'create')
    assert.equal(undoRecord.operation.phase, 'undo')
    await waitForCanvas(canvas => canvas.nodes.find(node => String(node.id) === createdNodeId) === undefined, 'undo display removal')
    const afterUndoCanvas = await readCanvas()
    report.undo = { gesture: 'original canvas keyboard Ctrl+Z', nativeBatch: undoRecord,
      carrierRemoved: true, nonTargetInvariants: assertOriginalNodesUnchanged(beforeCanvas, afterUndoCanvas,
        { createdId: createdNodeId, deleted: true }) }
    const deletedCanvasText = await readCoreText(createdNodeId)
    report.undo.canvasTextReadback = { spatialBindingReadable: !!deletedCanvasText,
      status: report.reads.at(-1)?.status ?? null }
    assert.equal(deletedCanvasText, null, 'Undo removes the canvas binding; it does not delete the Artifact itself.')
    const retainedAfterUndo = await readMaterialBundle(createdRef.artifactId,
      { revisionId: createdRef.revisionId, body: expectedBranchBody })
    assert.equal(retainedAfterUndo.artifact.currentRevisionId, createdRef.revisionId)
    report.undo.coreMaterialRetained = { artifactId: retainedAfterUndo.artifact.id,
      viewId: createdRef.artifactViewId, revisionId: retainedAfterUndo.revision.id,
      fileRecordId: retainedAfterUndo.fileRecordId, exactBody: retainedAfterUndo.text,
      fileByteLength: retainedAfterUndo.file.bytes.length, revisionStillListed: true,
      noCoreDeleteOrFileWrite: true }
    const sourceAfterUndo = await readInitialCoreBundle(sourceNodeId)
    assert.equal(sourceAfterUndo.value.body, beforeSourceCore.value.body)
    assert.equal(sourceAfterUndo.value.revisionId, beforeSourceCore.value.revisionId)
    await screenshot('undo-removes-only-spatial-carrier')
    report.cases.push({ name: 'real Ctrl+Z removes only the new spatial binding while exact Core Artifact/Revision/FileRecord bytes remain', passed: true })

    await page.waitForTimeout(1400) // settle the original undo operation before Ctrl+Shift+Z
    stage = 'redo-armed'
    const redoResponsePromise = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.origin === origin
        && url.pathname === `/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`
    }, { timeout: 45000 })
    await page.keyboard.press('Control+Shift+z')
    const redoResponse = await redoResponsePromise
    const redoObserved = await waitForBatchObservation('redo', redoResponse)
    const redoPayload = redoObserved.payload
    const redoRecord = redoObserved.record
    assert.ok(redoRecord, 'One original Ctrl+Shift+Z restore batch must be observed.')
    assert.equal(redoRecord.operation.operationId, createOperation.operationId)
    assert.equal(redoRecord.operation.kind, 'create')
    assert.equal(redoRecord.operation.phase, 'redo')
    const restoredCanvasRead = await waitForCanvas(canvas => canvas.nodes.find(node => String(node.id) === restoredNodeId), 'redo restores the remapped carrier')
    const restoredNode = restoredCanvasRead.value
    const afterRedoCanvas = restoredCanvasRead.canvas
    assert.notEqual(restoredNodeId, createdNodeId, 'Original O8 undo/redo remaps a deleted native node to a new ID; the script must not fabricate ID reuse.')
    assert.equal(beforeCanvas.nodes.some(node => String(node.id) === restoredNodeId), false,
      'The O8-generated restored ID must not collide with any of the original nine Context nodes.')
    assert.equal(afterUndoCanvas.nodes.some(node => String(node.id) === restoredNodeId), false,
      'The restored carrier ID must be introduced only by the original redo operation.')
    assert.equal(afterUndoCanvas.nodes.some(node => String(node.id) === createdNodeId), false,
      'The first created Native ID must remain absent after undo.')
    assert.equal(bodyOf(restoredNode), expectedBranchBody)
    assert.equal(stable(refSummary(restoredNode.data?.lcos_ref)), stable(refSummary(createdRef)))
    assert.deepEqual(restoredNode.position, originalCreatedPosition)
    const restoredMatches = afterRedoCanvas.nodes.filter(node => bodyOf(node) === expectedBranchBody
      && stable(refSummary(node.data?.lcos_ref)) === stable(refSummary(createdRef))
      && stable(node.position) === stable(originalCreatedPosition))
    assert.equal(restoredMatches.length, 1, 'Redo may restore exactly one branch carrier with the original body/ref/position.')
    assert.equal(String(restoredMatches[0].id), restoredNodeId)
    assert.equal(afterRedoCanvas.nodes.filter(node => String(node.id) === restoredNodeId).length, 1,
      'The O8-generated restored Native ID must be unique on the Canvas.')
    assert.equal(afterRedoCanvas.nodes.some(node => String(node.id) === createdNodeId), false,
      'Redo must not resurrect or silently reuse the removed first Native ID.')
    const restoredCoreValue = await readCoreText(restoredNodeId)
    assert.ok(restoredCoreValue)
    assert.equal(restoredCoreValue.spatialId, restoredNodeId)
    assert.equal(restoredCoreValue.artifactId, createdRef.artifactId)
    assert.equal(restoredCoreValue.viewId, createdRef.artifactViewId)
    assert.equal(restoredCoreValue.revisionId, createdRef.revisionId)
    assert.equal(String(restoredCoreValue.fileRecordId), String(createCoreValue.fileRecordId))
    assert.equal(restoredCoreValue.body, expectedBranchBody)
    report.nativeIdRemap.sameCoreIdentity = true
    report.nativeIdRemap.sameFileRecord = true
    const restoredBundle = await readMaterialBundle(createdRef.artifactId,
      { revisionId: createdRef.revisionId, body: expectedBranchBody })
    assert.equal(restoredBundle.fileRecordId, String(restoredCoreValue.fileRecordId))
    assert.equal(restoredBundle.artifact.currentRevisionId, createdRef.revisionId)
    assert.deepEqual(restoredBundle.revisions.map(item => String(item.id)).sort(),
      createdBundle.revisions.map(item => String(item.id)).sort(),
      'Redo must not create another Core Revision for this spatial restore.')
    report.nativeIdRemap.noNewRevision = true
    report.redo = { gesture: 'original canvas keyboard Ctrl+Shift+Z', nativeBatch: redoRecord,
      node: nodeSnapshot(restoredNode), core: { artifactId: restoredCoreValue.artifactId,
        viewId: restoredCoreValue.viewId, revisionId: restoredCoreValue.revisionId,
        fileRecordId: restoredCoreValue.fileRecordId, body: restoredCoreValue.body,
        exactFileBytes: restoredBundle.text === expectedBranchBody, fileByteLength: restoredBundle.file.bytes.length,
        revisionStillListed: restoredBundle.revisions.some(item => String(item.id) === String(restoredCoreValue.revisionId)) },
      sameArtifactViewRevisionAndBody: true,
      originalToRestoredNativeId: { firstCreatedNodeId: createdNodeId, restoredNodeId,
        sameCoreIdentity: true, sameFileRecord: true, noNewRevision: true },
      nonTargetInvariants: assertOriginalNodesUnchanged(beforeCanvas, afterRedoCanvas, { createdId: restoredNodeId }) }
    assert.equal(restoredBundle.text, expectedBranchBody)
    await screenshot('redo-restores-same-core-identity', page.locator(`.react-flow__node[data-id="${restoredNodeId}"]`))
    report.cases.push({ name: 'real Ctrl+Shift+Z remaps the original create to O8’s fresh Native ID while restoring the same Core Artifact/View/Revision/FileRecord/body', passed: true })

    await page.waitForTimeout(1400)
    stage = 'read-only-reload'
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(({ expectedCanvasId }) => Boolean(window.__LCOS_NODE_LAB__?.api)
      && (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === expectedCanvasId
      && document.querySelector('.react-flow'), { expectedCanvasId: canvasId }, { timeout: 30000 })
    await closeOriginalAgentPanelIfOpen()
    await page.locator(`.react-flow__node[data-id="${sourceNodeId}"] [data-lcos-text-face-mode="mindmap"]`).waitFor({ state: 'visible', timeout: 30000 })
    await page.locator(`.react-flow__node[data-id="${restoredNodeId}"]`).waitFor({ state: 'visible', timeout: 30000 })
    await assertPageIdentity('after-reload')
    const reloadedCanvas = await readCanvas()
    const reloadedSource = reloadedCanvas.nodes.find(node => String(node.id) === sourceNodeId)
    const reloadedNode = reloadedCanvas.nodes.find(node => String(node.id) === restoredNodeId)
    assert.equal(bodyOf(reloadedSource), beforeSourceCore.value.body)
    assert.equal(stable(refSummary(reloadedSource.data?.lcos_ref)), stable(refSummary(sourceNode.data?.lcos_ref)))
    assert.equal(stable(geometryOf(reloadedSource)), stable(geometryOf(sourceNode)))
    assert.equal(bodyOf(reloadedNode), expectedBranchBody)
    assert.equal(stable(refSummary(reloadedNode.data?.lcos_ref)), stable(refSummary(createdRef)))
    assert.deepEqual(reloadedNode.position, originalCreatedPosition)
    const reloadedCoreValue = await readCoreText(restoredNodeId)
    assert.equal(reloadedCoreValue?.spatialId, restoredNodeId)
    assert.equal(reloadedCoreValue?.artifactId, createdRef.artifactId)
    assert.equal(reloadedCoreValue?.viewId, createdRef.artifactViewId)
    assert.equal(reloadedCoreValue?.revisionId, createdRef.revisionId)
    assert.equal(reloadedCoreValue?.body, expectedBranchBody)
    const reloadedBundle = await readMaterialBundle(createdRef.artifactId,
      { revisionId: createdRef.revisionId, body: expectedBranchBody })
    assert.equal(reloadedBundle.fileRecordId, String(reloadedCoreValue.fileRecordId))
    assert.deepEqual(reloadedBundle.revisions.map(item => String(item.id)).sort(),
      createdBundle.revisions.map(item => String(item.id)).sort(),
      'Reload after redo must not reveal a duplicate Core revision.')
    report.reload = { page: 'original Context canvas reloaded', sourceNodeUnchanged: true,
      sourceGeometryBefore: geometryOf(sourceNode), sourceGeometryAfter: geometryOf(reloadedSource),
      sourceGeometrySameExactly: stable(geometryOf(sourceNode)) === stable(geometryOf(reloadedSource)),
      createdNode: nodeSnapshot(reloadedNode), sameCoreIdentityAndExactFileBytes: true,
      originalToRestoredNativeId: { firstCreatedNodeId: createdNodeId, restoredNodeId,
        sameCoreIdentity: true, sameFileRecord: true, noNewRevision: true },
      cameraPersistenceClaim: 'not evaluated; only node/Core reload persistence is claimed',
      nonTargetInvariants: assertOriginalNodesUnchanged(beforeCanvas, reloadedCanvas, { createdId: restoredNodeId }) }
    assert.equal(reloadedCanvas.nodes.some(node => String(node.id) === createdNodeId), false,
      'Reload must continue to contain only the O8-restored ID, not the removed first Native ID.')
    await screenshot('after-read-only-reload', page.locator(`.react-flow__node[data-id="${restoredNodeId}"]`))
    report.cases.push({ name: 'reload retains the restored carrier and the same exact Core Artifact/View/Revision/FileRecord bytes', passed: true })

    assert.equal(report.network.providerTaskRequests.length, 0, 'No model/provider task may be submitted or allowed.')
    const unexpectedWrites = unexpectedBlockedWrites()
    assert.equal(unexpectedWrites.length, 0, 'No unknown, Canvas, or Core write may be attempted; only the two exact known offline background routes are excluded.')
    assert.equal(report.network.allowedLifecycleBatches.length, 3, 'Exactly create → undo → redo native lifecycle batches are expected.')
    assert.deepEqual(report.network.allowedLifecycleBatches.map(item => item.phase), ['apply', 'undo', 'redo'])
    assert.equal(report.network.allowedLifecycleBatches[0].operation.operationId,
      report.network.allowedLifecycleBatches[1].operation.operationId)
    assert.equal(report.network.allowedLifecycleBatches[1].operation.operationId,
      report.network.allowedLifecycleBatches[2].operation.operationId)
    const sourceAfterAll = await readInitialCoreBundle(sourceNodeId)
    assert.equal(sourceAfterAll.value.body, beforeSourceCore.value.body)
    assert.equal(sourceAfterAll.value.revisionId, beforeSourceCore.value.revisionId)
    report.final = { sourceBodyAndRevisionUnchanged: true,
      firstCreatedNodeId: createdNodeId, restoredNodeId,
      originalToRestoredNativeId: report.nativeIdRemap,
      exactLifecyclePhases: report.network.allowedLifecycleBatches.map(item => item.phase),
      providerTaskRequests: report.network.providerTaskRequests.length,
      blockedWrites: report.network.blockedWrites.length,
      knownBackgroundWritesBlocked: report.network.knownBackgroundWritesBlocked.length,
      unexpectedBlockedWrites: report.network.unexpectedBlockedWrites.length,
      browserErrors: { pageErrors: report.pageErrors, consoleErrors: report.consoleErrors },
      backgroundApiFailures: report.network.apiFailures }
    report.passed = true
    report.runState = 'passed'
  } catch (error) {
    report.runState = 'failed'
    report.failure = cleanText(error instanceof Error ? `${error.name}: ${error.message}` : error)
    report.failureStage = stage
    report.createCommitted ||= Boolean(createdRef)
    report.createMayHaveCommitted ||= Boolean(createdNodeId)
    report.createdNodeId ||= createdNodeId ?? null
    report.firstCreatedNodeId ||= createdNodeId ?? null
    report.restoredNodeId ||= restoredNodeId ?? null
    report.recoveryHintNodeId = restoredNodeId ?? createdNodeId ?? null
    report.noAutomaticCleanupOrRetry = true
    report.note = report.createCommitted
      ? 'A native create may already have committed. The script did not delete, retry, or recreate it; use recoveryHintNodeId (the currently expected carrier ID) with read-only recovery mode if needed.'
      : 'No cleanup or resubmission was attempted.'
    process.exitCode = 1
  } finally {
    if (browser) await browser.close().catch(() => undefined)
    const unexpectedAfterClose = unexpectedBlockedWrites()
    if (report.passed && unexpectedAfterClose.length > 0) {
      report.passed = false
      report.runState = 'failed'
      report.failureStage = 'post-browser-blocked-write-audit'
      report.failure = `${unexpectedAfterClose.length} unknown browser write(s) were blocked; known background routes are kept as blocked evidence.`
      process.exitCode = 1
    }
    if (report.final) {
      report.final.blockedWrites = report.network.blockedWrites.length
      report.final.knownBackgroundWritesBlocked = report.network.knownBackgroundWritesBlocked.length
      report.final.unexpectedBlockedWrites = report.network.unexpectedBlockedWrites.length
    }
    report.atFinished = new Date().toISOString()
    report.browserClosed = true
    report.lifecycleMutationStopped = true
    await mkdir(evidenceDir, { recursive: true })
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(JSON.stringify({ runState: report.runState, passed: report.passed,
      reportPath, firstCreatedNodeId: report.firstCreatedNodeId ?? report.createdNodeId,
      restoredNodeId: report.restoredNodeId, recoveryHintNodeId: report.recoveryHintNodeId ?? null,
      failure: report.failure ?? null }, null, 2))
  }
}
