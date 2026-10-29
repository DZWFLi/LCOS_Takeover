import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'

import { transformCutScript } from '../lab/cut-transform.mjs'
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs'
import { transformNodeBridgeScript } from '../lab/node-transform.mjs'
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs'

const pageFilename = 'page-Da_DfwiK.js'
const pageSource = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/' + pageFilename, import.meta.url), 'utf8')
const debounceSource = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-D4wysAbz.js', import.meta.url), 'utf8')

function babelParser() {
  const require = createRequire(import.meta.url)
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx')
  const cachedParser = fs.existsSync(cache)
    ? fs.readdirSync(cache).sort().map(entry => path.join(cache, entry, 'node_modules/playwright/lib/transform/babelBundle.js'))
      .find(file => fs.existsSync(file))
    : undefined
  if (cachedParser) return require(cachedParser).babelParse
  const store = 'E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/node_modules/.pnpm'
  if (!fs.existsSync(store)) throw new Error('Installed Babel parser unavailable; no download attempted.')
  const installed = fs.readdirSync(store).find(entry => entry.startsWith('@babel+parser@'))
  if (!installed) throw new Error('Installed Babel parser unavailable; no download attempted.')
  const babel = require(path.join(store, installed, 'node_modules/@babel/parser/lib/index.js'))
  return (source, filename) => babel.parse(source, { sourceType: 'module', sourceFilename: filename })
}

const parse = babelParser()
function binding(program, name) {
  const matches = []
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name === name) matches.push(declaration)
    if (declaration?.type === 'VariableDeclaration') {
      for (const item of declaration.declarations) if (item.id?.type === 'Identifier' && item.id.name === name) matches.push(item.init)
    }
  }
  assert.equal(matches.length, 1, `Expected one installed vendor binding for ${name}; found ${matches.length}.`)
  return matches[0]
}

const transformed = transformHistoryIntentScript(pageFilename,
  transformSurfaceDockScript(pageFilename,
    transformNodeBridgeScript(pageFilename,
      transformCutScript(pageFilename, pageSource))))
assert.ok(transformed.startsWith('/* __LCOS_HISTORY_INTENT_TRANSFORMED__ */'))
assert.match(transformed, /flushHistory:\(\)=>S\.flush\(\)/,
  'The receipt helper receives only the original O8 debounce flush closure.')

const program = parse(transformed, pageFilename).program
const o8Source = (() => {
  const node = binding(program, 'O8')
  return transformed.slice(node.start, node.end)
})()
const helperNames = ['IC', 'TC', 'kC', 'l0', 'P8', 'M8', 'L8', 'R8', 'j8', 'A8', 'D8', 'k8', 'PC']
const helperSources = new Map(helperNames.map(name => {
  const node = binding(program, name)
  return [name, transformed.slice(node.start, node.end)]
}))
const debounceProgram = parse(debounceSource, 'UnlimitedModeToggle-D4wysAbz.js').program
const debounceNode = binding(debounceProgram, 'PN')
const debounceCode = debounceSource.slice(debounceNode.start, debounceNode.end)

const canvasId = 'canvas-native-execution-history'
const projectId = 'project-native-execution-history'
const workspaceId = 'workspace-native-execution-history'
const slotId = 'slot-native-execution-history'
const artifactId = 'artifact-native-execution-history'
const viewId = 'view-native-execution-history'
const revisionId = 'revision-native-execution-history'

function clone(value) { return structuredClone(value) }

function slotExecutionNode() {
  const id = 'node-existing-result-slot'
  return {
    id, type: 'lcos-execution', position: { x: 12, y: 24 }, width: 220, height: 160,
    measured: { width: 220, height: 160 }, selected: true,
    data: {
      id, title: 'Synthetic Run',
      lcos_execution_ref: { projectId, canvasId, workspaceId, entityType: 'result-slot', entityId: slotId },
      lcos_execution_facts: { entityType: 'result-slot', entityId: slotId, title: 'Synthetic Run',
        execution: { status: 'review', pendingReturnCount: 1, resultSlotId: slotId } },
    },
  }
}

function resultMaterialNode({ id = 'node-existing-result-slot', slot = slotId, x = 12, y = 24 } = {}) {
  const title = 'Accepted synthetic material'
  const body = '# Canonical accepted body\n\nThis is the exact accepted slot revision.\n'
  return {
    id, type: 'lcos-result-material', position: { x, y }, width: 220, height: 160,
    measured: { width: 220, height: 160 }, selected: true,
    data: {
      id, title, text: body, content: body,
      lcos_ref: { version: 1, entityType: 'artifact', entityId: artifactId, artifactId,
        artifactViewId: viewId, revisionId },
      lcos_result_ref: { projectId, canvasId, workspaceId, slotId: slot,
        artifactId, artifactViewId: viewId, revisionId },
      lcos_result_facts: { entityType: 'artifact', entityId: artifactId, title,
        artifactViewId: viewId, presentedRevisionId: revisionId,
        artifactViewReferenceKind: 'explicit_additional', artifactKind: 'markdown', mimeType: 'text/markdown',
        canvasTextEditable: false },
    },
  }
}

function runNode(id = 'node-new-run') {
  return {
    id, type: 'lcos-execution', position: { x: 400, y: 110 }, width: 240, height: 170,
    measured: { width: 240, height: 170 }, selected: false,
    data: {
      id, title: 'New synthetic Run',
      lcos_execution_ref: { projectId, canvasId, workspaceId, entityType: 'run', entityId: 'run-native-history' },
      lcos_execution_facts: { entityType: 'run', entityId: 'run-native-history', title: 'New synthetic Run',
        execution: { status: 'dispatched', pendingReturnCount: 0, runId: 'run-native-history' } },
    },
  }
}

function newSlotNode(id = 'node-new-slot', entityId = 'slot-new-history') {
  return {
    id, type: 'lcos-execution', position: { x: 680, y: 110 }, width: 240, height: 170,
    measured: { width: 240, height: 170 }, selected: false,
    data: {
      id, title: 'New synthetic result slot',
      lcos_execution_ref: { projectId, canvasId, workspaceId, entityType: 'result-slot', entityId },
      lcos_execution_facts: { entityType: 'result-slot', entityId, title: 'New synthetic result slot',
        execution: { status: 'waiting', pendingReturnCount: 1, resultSlotId: entityId } },
    },
  }
}

function textNode() {
  return {
    id: 'ordinary-text-node', type: 'text', position: { x: 320, y: 20 }, width: 260, height: 180,
    data: { id: 'ordinary-text-node', title: 'User text', text: 'saved text', content: 'saved text', userDraft: 'untouched' },
  }
}

function imageNode() {
  return {
    id: 'ordinary-image-node', type: 'image', position: { x: 620, y: 20 }, width: 260, height: 180,
    data: { id: 'ordinary-image-node', title: 'User image', src: '/synthetic/image.png', userDraft: 'untouched' },
  }
}

function applyNodeChanges(current, changes) {
  let nodes = [...current]
  for (const change of changes) {
    if (change.type === 'remove') nodes = nodes.filter(node => node.id !== change.id)
    else if (change.type === 'add') nodes.push(change.item)
    else if (change.type === 'replace') nodes = nodes.map(node => node.id === change.id ? change.item : node)
    else if (change.type === 'position') nodes = nodes.map(node => node.id === change.id ? { ...node, position: change.position } : node)
    else if (change.type === 'dimensions') nodes = nodes.map(node => node.id === change.id ? {
      ...node, measured: change.dimensions,
      ...(change.setAttributes ? { width: change.dimensions.width, height: change.dimensions.height } : {}),
    } : node)
  }
  return nodes
}

function sameDeps(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]))
}

class HookHarness {
  constructor(hook) { this.hook = hook; this.slots = []; this.cursor = 0; this.effects = []; this.dirty = false; this.args = []; this.output = undefined }
  slot(kind) {
    const index = this.cursor++
    let slot = this.slots[index]
    if (!slot) this.slots[index] = slot = { kind, initialized: false }
    assert.equal(slot.kind, kind, `Original O8 hook order changed at slot ${index}.`)
    return slot
  }
  useState(initial) {
    const slot = this.slot('state')
    if (!slot.initialized) { slot.value = typeof initial === 'function' ? initial() : initial; slot.initialized = true }
    if (!slot.setter) slot.setter = next => { slot.value = typeof next === 'function' ? next(slot.value) : next; this.dirty = true }
    return [slot.value, slot.setter]
  }
  useRef(initial) {
    const slot = this.slot('ref')
    if (!slot.initialized) { slot.value = { current: initial }; slot.initialized = true }
    return slot.value
  }
  useMemo(factory, deps) {
    const slot = this.slot('memo')
    if (!slot.initialized || !sameDeps(slot.deps, deps)) { slot.value = factory(); slot.deps = deps; slot.initialized = true }
    return slot.value
  }
  useCallback(callback, deps) { return this.useMemo(() => callback, deps) }
  useEffect(effect, deps) {
    const slot = this.slot('effect')
    if (!slot.initialized || deps === undefined || !sameDeps(slot.deps, deps)) {
      slot.initialized = true; slot.nextEffect = effect; slot.nextDeps = deps; this.effects.push(slot)
    }
  }
  setArgs(args) { this.args = args }
  render(args = this.args) {
    this.args = args
    for (let pass = 0; pass < 12; pass += 1) {
      this.dirty = false; this.cursor = 0; this.effects = []
      this.output = this.hook(...this.args)
      const pending = this.effects
      for (const slot of pending) {
        if (typeof slot.cleanup === 'function') slot.cleanup()
        slot.deps = slot.nextDeps
        slot.cleanup = slot.nextEffect()
      }
      if (!this.dirty) return this.output
    }
    throw new Error('Original O8 hook harness did not settle.')
  }
  historyRef() {
    const slot = this.slots.find(item => item.kind === 'ref' && Array.isArray(item.value.current)
      && item.value.current.every(entry => entry?.state && Array.isArray(entry.state.nodes)))
    assert.ok(slot, 'Original O8 history ref must be present in the real Hook owner.')
    return slot.value
  }
}

function makeHarness(initialNodes) {
  const captures = { nativeBatches: [], nodeChanges: [], setNodesCalls: 0 }
  let liveNodes = clone(initialNodes)
  const edges = []
  let harness
  let networkCalls = 0
  const sandbox = {
    console, Date, Promise, Map, Set, WeakMap, Object, Array, Math, Number, String, Boolean, JSON,
    structuredClone, setTimeout, clearTimeout, setImmediate,
    crypto: { randomUUID: () => 'test-native-history-id' },
    fetch: () => { networkCalls += 1; throw new Error('This O8 test has no network owner.') },
    ee: { IMAGE: 'image', VIDEO: 'video', PILE: 'pile' },
    ef: value => typeof value === 'number' ? value : Number(value),
    F0: value => value !== null && typeof value === 'object',
    NN: Math.max, MN: Math.min, _c: () => Date.now(), kN: 'Expected a function', qp() {},
  }
  sandbox.window = sandbox
  const context = vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(new URL('../lab/startup-history-intent.js', import.meta.url), 'utf8'), context,
    { filename: 'startup-history-intent.js' })
  for (const [name, source] of helperSources) sandbox[name] = vm.runInContext('(' + source + ')', context, { filename: `vendor-${name}` })
  sandbox.Ra = vm.runInContext('(' + debounceCode + ')', context, { filename: 'vendor-original-debounce' })
  sandbox.O8 = vm.runInContext('(' + o8Source + ')', context, { filename: 'vendor-original-O8' })

  const options = {
    enabled: true, maxHistorySize: 30, debounceDelay: 1000,
    defaultOnNodesChange(changes) {
      captures.nodeChanges.push(clone(changes))
      liveNodes = applyNodeChanges(liveNodes, changes)
      harness.setArgs([liveNodes, edges, options])
    },
    defaultOnEdgesChange() {},
    onBatchOperations(nodeOperations, edgeOperations) {
      captures.nativeBatches.push({ nodeOperations: clone(nodeOperations), edgeOperations: clone(edgeOperations) })
      return Promise.resolve({})
    },
    canvasId,
    setNodes(nodes) {
      captures.setNodesCalls += 1
      liveNodes = nodes
      harness.setArgs([liveNodes, edges, options])
    },
  }
  harness = new HookHarness(sandbox.O8)
  sandbox.l = {
    useState: (...args) => harness.useState(...args),
    useRef: (...args) => harness.useRef(...args),
    useMemo: (...args) => harness.useMemo(...args),
    useCallback: (...args) => harness.useCallback(...args),
    useEffect: (...args) => harness.useEffect(...args),
  }
  const render = () => { harness.render([liveNodes, edges, options]); return harness.output }
  const setLiveNodes = nodes => { liveNodes = nodes; harness.setArgs([liveNodes, edges, options]); return render() }
  const currentNodesRef = () => {
    const slot = harness.slots.find(item => item.kind === 'ref' && item.value.current === liveNodes)
    assert.ok(slot, 'Original O8 current-node ref must refer to the live ReactFlow nodes.')
    return slot.value
  }
  const state = nodeId => sandbox.__LCOS_NATIVE_INTENT__.inspectNativeHistory({
    canvasId, requestedCanvasId: canvasId, nodeId, history: harness.historyRef().current,
    currentIndex: harness.slots.find(item => item.kind === 'state' && Number.isInteger(item.value))?.value,
  })
  render()
  return {
    captures, canvasId, currentNodesRef, get api() { return harness.output }, get liveNodes() { return liveNodes },
    harness, networkCalls: () => networkCalls, render, sandbox, setLiveNodes, state,
  }
}

const initialSlot = slotExecutionNode()
const originalText = textNode()
const originalImage = imageNode()
const h = makeHarness([initialSlot, originalText, originalImage])
const historyRef = h.harness.historyRef()
historyRef.current[0].lcos_history_operations = [{
  nodeId: initialSlot.id, aliases: [initialSlot.id], carrierId: initialSlot.id, changeType: 'delete',
  lcos_operation: { version: 1, operationId: 'existing-slot-delete', kind: 'delete', phase: 'apply' },
  lcos_snapshot: clone(initialSlot),
}]

// A real native graph change is still inside O8's 1000ms debounce. The receipt
// must flush that one user frame first, then patch only Core-owned projection data.
const pendingDraft = 'ordinary text body pending in the original graph debounce'
const editedNodes = h.liveNodes.map(node => {
  if (node.id === initialSlot.id) return { ...node, position: { x: 92, y: 118 }, width: 276, height: 184,
    measured: { width: 276, height: 184 } }
  if (node.id === originalText.id) return { ...node, data: { ...node.data, text: pendingDraft, content: pendingDraft } }
  return node
})
h.setLiveNodes(editedNodes)
assert.equal(h.state(initialSlot.id).historySize, 1, 'The user edit remains debounced before the receipt arrives.')
assert.equal(h.state(initialSlot.id).currentIndex, 0)

const promoted = resultMaterialNode({ x: 12, y: 24 })
const newRun = runNode()
const newSlot = newSlotNode()
const historyBeforeReceipt = historyRef.current
let historyAfterNativeFlush
let bridgeObservedFreshHistory = false
const originalBackfill = h.sandbox.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt
h.sandbox.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt = input => {
  if (input?.receiptKind === 'execution-projection') {
    const getHistory = input.getHistory
    input.getHistory = () => {
      const latest = getHistory()
      bridgeObservedFreshHistory = input.history !== latest
      historyAfterNativeFlush = clone(latest)
      return latest
    }
  }
  return originalBackfill(input)
}
const result = h.api.backfillNodeReceipt({ receiptKind: 'execution-projection', canvasId, nodes: [promoted, newRun, newSlot] })
h.sandbox.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt = originalBackfill
const apiAfterReceipt = h.render()
await new Promise(resolve => setTimeout(resolve, 5))

assert.equal(result.ok, true, JSON.stringify(result))
assert.equal(result.idempotent, false)
assert.equal(result.framesPatched, 2, 'The one pending user edit is flushed first; both existing O8 frames receive canonical projection fields.')
assert.equal(result.framesInserted, 2, 'New Run/ResultSlot identities are inserted into each original frame, not as new frames.')
assert.equal(result.operationSnapshotsPatched, 1, 'The matching O8 operation snapshot receives the same accepted identity.')
assert.equal(bridgeObservedFreshHistory, true, 'O8 S.flush replaces x.current; the receipt must fetch the post-flush history owner, not patch its stale array argument.')
assert.notEqual(historyBeforeReceipt, historyRef.current, 'The original O8 debounce commit produces its own new history array.')
assert.equal(historyRef.current.length, 2, 'The only new frame is the pending real user edit, not the projection receipt.')
assert.equal(h.state(initialSlot.id).currentIndex, 1, 'Projection backfill does not advance or rewind the user history index.')
assert.equal(h.captures.nativeBatches.length, 0, 'Receipt processing performs no native Core/spatial persistence call; Root serializes the original persisted batch before this port.')
assert.equal(h.networkCalls(), 0, 'The receipt path performs no network or Core write.')

const latestHistory = historyRef.current
const exactRef = promoted.data.lcos_ref
const nodeIn = (entry, id) => entry.state.nodes.find(node => node.id === id)
const historyFrame0Slot = nodeIn(latestHistory[0], promoted.id)
const historyFrame1Slot = nodeIn(latestHistory[1], promoted.id)
assert.equal(historyFrame0Slot.type, 'lcos-result-material')
assert.equal(historyFrame1Slot.type, 'lcos-result-material')
assert.deepEqual(historyFrame0Slot.data.lcos_ref, exactRef)
assert.deepEqual(historyFrame1Slot.data.lcos_ref, exactRef)
assert.equal(historyFrame0Slot.data.lcos_result_ref.slotId, slotId)
assert.equal(historyFrame1Slot.data.lcos_result_ref.revisionId, revisionId)
assert.deepEqual(historyFrame0Slot.position, { x: 12, y: 24 }, 'Receipt preserves original frame geometry.')
assert.deepEqual(historyFrame0Slot.measured, { width: 220, height: 160 })
assert.deepEqual(historyFrame1Slot.position, { x: 92, y: 118 }, 'The pending user geometry edit is flushed then preserved per frame.')
assert.equal(historyFrame1Slot.width, 276)
assert.equal(historyFrame1Slot.height, 184)
assert.deepEqual(historyFrame1Slot.measured, { width: 276, height: 184 })
assert.equal(historyFrame0Slot.selected, true)
assert.equal(historyFrame1Slot.selected, true)
assert.equal(nodeIn(latestHistory[1], originalText.id).data.content, pendingDraft,
  'The original O8 debounce captured the pending ordinary text body before projection backfill.')
assert.deepEqual(nodeIn(latestHistory[0], originalImage.id), originalImage, 'Ordinary image snapshot is unchanged.')
assert.deepEqual(nodeIn(latestHistory[1], originalImage.id), originalImage, 'Ordinary image snapshot is unchanged in the newer frame too.')
assert.equal(nodeIn(latestHistory[0], newRun.id).type, 'lcos-execution', 'New canonical Run identity is injected into the original base frame.')
assert.equal(nodeIn(latestHistory[1], newRun.id).data.lcos_execution_ref.entityId, 'run-native-history')
assert.equal(nodeIn(latestHistory[0], newSlot.id).data.lcos_execution_ref.entityId, 'slot-new-history')
assert.equal(nodeIn(latestHistory[0], newRun.id).selected, false, 'Injected past frames do not inherit current selection.')

const operation = latestHistory[0].lcos_history_operations[0]
assert.equal(operation.lcos_operation.operationId, 'existing-slot-delete', 'Operation identity is retained, not replaced with a create.')
assert.deepEqual(operation.lcos_ref, exactRef, 'The existing O8 operation now carries the exact accepted material reference.')
assert.equal(operation.lcos_snapshot.type, 'lcos-result-material')
assert.deepEqual(operation.lcos_snapshot.data.lcos_ref, exactRef)
assert.deepEqual(operation.lcos_snapshot.position, initialSlot.position, 'Operation snapshot geometry is preserved.')

const setNodesAfterReceipt = h.captures.setNodesCalls
const batchesAfterReceipt = h.captures.nativeBatches.length
const repeated = apiAfterReceipt.backfillNodeReceipt({ receiptKind: 'execution-projection', canvasId,
  nodes: [promoted, newRun, newSlot] })
h.render()
assert.equal(repeated.ok, true)
assert.equal(repeated.idempotent, true, 'Repeating an exact Core receipt is idempotent.')
assert.equal(h.captures.setNodesCalls, setNodesAfterReceipt, 'An idempotent receipt does not call the original setter again.')
assert.equal(h.captures.nativeBatches.length, batchesAfterReceipt, 'Projection receipt adds no native persistence request.')
assert.equal(historyRef.current.length, 2)
assert.equal(h.state(initialSlot.id).currentIndex, 1)

const beforeMismatchNodes = clone(h.liveNodes)
const beforeMismatchSetCalls = h.captures.setNodesCalls
const wrongSlot = resultMaterialNode({ slot: 'slot-does-not-match-history' })
let historyAfterMismatchFlush
const originalMismatchBackfill = h.sandbox.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt
h.sandbox.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt = input => {
  if (input?.receiptKind === 'execution-projection') {
    input.flushHistory()
    historyAfterMismatchFlush = clone(input.getHistory())
    input.flushHistory = () => {}
  }
  return originalMismatchBackfill(input)
}
const mismatch = h.api.backfillNodeReceipt({ receiptKind: 'execution-projection', canvasId, nodes: [wrongSlot] })
h.sandbox.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt = originalMismatchBackfill
assert.deepEqual(JSON.parse(JSON.stringify(mismatch)), { ok: false, reason: 'EXECUTION_PROJECTION_REFERENCE_MISMATCH' })
assert.deepEqual(JSON.parse(JSON.stringify(historyRef.current)), historyAfterMismatchFlush,
  'A slot mismatch is validated before the projection helper mutates O8 frames or operation snapshots; only the explicitly flushed native owner may update history.')
assert.deepEqual(JSON.parse(JSON.stringify(h.liveNodes)), beforeMismatchNodes)
assert.equal(h.captures.setNodesCalls, beforeMismatchSetCalls)

const ordinaryCollision = resultMaterialNode({ id: originalText.id })
const collisionHistory = clone(historyRef.current)
const collisionNodes = clone(h.liveNodes)
const collision = h.api.backfillNodeReceipt({ receiptKind: 'execution-projection', canvasId, nodes: [ordinaryCollision] })
assert.equal(collision.ok, false)
assert.equal(collision.reason, 'EXECUTION_PROJECTION_EXISTING_IDENTITY_INVALID',
  'A same-ID ordinary text node is never accepted as a Core execution/material node.')
assert.deepEqual(JSON.parse(JSON.stringify(historyRef.current)), collisionHistory)
assert.deepEqual(JSON.parse(JSON.stringify(h.liveNodes)), collisionNodes)

const noCandidates = h.api.backfillNodeReceipt({ receiptKind: 'execution-projection', canvasId, nodes: [] })
assert.equal(noCandidates.ok, true, 'An empty projection snapshot is an original-owner no-op.')
assert.equal(h.networkCalls(), 0)

const indexBeforeUndo = h.state(initialSlot.id).currentIndex
const historySizeBeforeUndo = historyRef.current.length
h.api.undo()
h.render()
assert.equal(h.state(initialSlot.id).currentIndex, indexBeforeUndo - 1)
assert.equal(historyRef.current.length, historySizeBeforeUndo)
const afterUndoSlot = h.liveNodes.find(node => node.id === promoted.id)
assert.equal(afterUndoSlot.type, 'lcos-result-material')
assert.deepEqual(afterUndoSlot.data.lcos_ref, exactRef, 'Original Undo keeps the accepted Artifact/View identity.')
assert.deepEqual(afterUndoSlot.position, { x: 12, y: 24 }, 'Original Undo restores the user geometry frame.')
assert.equal(h.liveNodes.find(node => node.id === originalText.id).data.content, 'saved text')
assert.ok(h.liveNodes.some(node => node.id === newRun.id), 'Server-owned Run projection survives an unrelated user Undo.')
assert.ok(h.liveNodes.some(node => node.id === newSlot.id), 'Server-owned ResultSlot projection survives an unrelated user Undo.')

h.api.redo()
h.render()
assert.equal(h.state(initialSlot.id).currentIndex, indexBeforeUndo)
assert.equal(historyRef.current.length, historySizeBeforeUndo)
const afterRedoSlot = h.liveNodes.find(node => node.id === promoted.id)
assert.equal(afterRedoSlot.type, 'lcos-result-material')
assert.deepEqual(afterRedoSlot.data.lcos_ref, exactRef, 'Original Redo keeps the exact accepted Artifact/View/Revision.')
assert.deepEqual(afterRedoSlot.position, { x: 92, y: 118 })
assert.equal(afterRedoSlot.width, 276)
assert.equal(afterRedoSlot.height, 184)
assert.equal(h.liveNodes.find(node => node.id === originalText.id).data.content, pendingDraft,
  'The original text draft is restored by its own undo/redo frame, not overwritten by the projection receipt.')
assert.equal(h.networkCalls(), 0)

console.log('PASS: original O8 flushes one pending user frame, then same-ID execution promotion patches only projection identity/facts; geometry, selection, text draft, operation snapshot, undo/redo, and history ownership remain native.')

// Conversation placements enter this exact same installed O8 owner, with a
// separate receipt identity. No second undo stack or Canvas replacement.
const connectedConversationId = 'confirmed-o8-conversation'
const conversation = (id = 'confirmed-conversation-node') => ({ id, type: 'lcos-conversation',
  position: { x: 150, y: 230 }, width: 96, height: 96, measured: { width: 96, height: 96 }, selected: false,
  data: { id, title: 'Confirmed conversation', lcos_conversation_ref: { projectId, canvasId, workspaceId, connectedConversationId },
    lcos_conversation_state: { provider: 'codex', isRunning: false, waitingReason: null } } })
const c = makeHarness([textNode(), imageNode()])
const cHistory = c.harness.historyRef()
const edited = c.liveNodes.map(node => node.type === 'text' ? { ...node, selected: true, position: { x: 910, y: 340 },
  data: { ...node.data, text: 'unsaved before placement', content: 'unsaved before placement' } } : node)
c.setLiveNodes(edited)
const cInput = { receiptKind: 'conversation-projection', projectId, canvasId, workspaceId, connectedConversationId, nodes: [conversation()] }
assert.equal(c.api.backfillNodeReceipt(cInput).ok, true)
c.render(); await new Promise(resolve => setTimeout(resolve, 5))
assert.equal(cHistory.current.length, 2, 'only the pending ordinary user edit creates a native history frame')
assert.equal(c.liveNodes.filter(node => node.id === conversation().id).length, 1)
assert.equal(c.liveNodes.find(node => node.type === 'text').data.content, 'unsaved before placement')
assert.deepEqual(c.liveNodes.find(node => node.type === 'text').position, { x: 910, y: 340 })
assert.equal(c.liveNodes.find(node => node.type === 'text').selected, true)
const cSetters = c.captures.setNodesCalls
assert.equal(c.api.backfillNodeReceipt(cInput).idempotent, true)
assert.equal(c.captures.setNodesCalls, cSetters, 'repeat confirmed placement is a native history no-op')
assert.equal(cHistory.current.length, 2)
c.api.undo(); c.render()
assert.equal(c.liveNodes.find(node => node.type === 'text').data.content, 'saved text')
assert.equal(c.liveNodes.filter(node => node.id === conversation().id).length, 1, 'unrelated Undo cannot discard canonical placement')
c.api.redo(); c.render()
assert.equal(c.liveNodes.find(node => node.type === 'text').data.content, 'unsaved before placement')
assert.equal(c.liveNodes.filter(node => node.id === conversation().id).length, 1)
const beforeConversationFailure = clone(c.liveNodes), beforeConversationHistory = clone(cHistory.current)
for (const key of ['projectId', 'canvasId', 'workspaceId', 'connectedConversationId']) {
  const wrong = conversation(); wrong.data.lcos_conversation_ref[key] = 'wrong-identity'
  assert.equal(c.api.backfillNodeReceipt({ ...cInput, nodes: [wrong] }).ok, false)
}
assert.equal(c.api.backfillNodeReceipt({ ...cInput, nodes: [conversation('ordinary-text-node')] }).ok, false)
assert.equal(c.api.backfillNodeReceipt({ receiptKind: 'execution-projection', canvasId, nodes: [conversation()] }).ok, false,
  'execution receipt remains closed to conversation payloads')
assert.deepEqual(clone(c.liveNodes), beforeConversationFailure)
assert.deepEqual(clone(cHistory.current), beforeConversationHistory)
const existingConversation = conversation(); existingConversation.selected = true; existingConversation.position = { x: 77, y: 88 }
existingConversation.data.localDraft = 'keep local conversation draft'; existingConversation.data.avatar = { seed: 'user-choice' }
const d = makeHarness([existingConversation, textNode()])
const updatedConversation = conversation(); updatedConversation.data.title = 'Updated confirmed label'; updatedConversation.data.lcos_conversation_state.isRunning = true
assert.equal(d.api.backfillNodeReceipt({ ...cInput, nodes: [updatedConversation] }).ok, true)
d.render(); await new Promise(resolve => setTimeout(resolve, 5))
const retained = d.liveNodes.find(node => node.id === existingConversation.id)
assert.deepEqual(retained.position, existingConversation.position); assert.equal(retained.selected, true)
assert.deepEqual(retained.measured, existingConversation.measured)
assert.equal(retained.data.localDraft, 'keep local conversation draft'); assert.deepEqual(retained.data.avatar, { seed: 'user-choice' })
assert.equal(retained.data.title, 'Updated confirmed label'); assert.equal(retained.data.lcos_conversation_state.isRunning, true)
assert.equal(c.networkCalls() + d.networkCalls(), 0)
for (const key of ['projectId', 'canvasId', 'workspaceId', 'connectedConversationId']) {
  const wrongExisting = conversation(); wrongExisting.data.lcos_conversation_ref[key] = 'another-existing-owner'
  const ownerMismatch = makeHarness([wrongExisting, textNode()])
  const originalOwnerNodes = clone(ownerMismatch.liveNodes), originalOwnerHistory = clone(ownerMismatch.harness.historyRef().current)
  assert.equal(ownerMismatch.api.backfillNodeReceipt(cInput).ok, false, `existing ${key} cannot be relabelled as this conversation`)
  assert.deepEqual(clone(ownerMismatch.liveNodes), originalOwnerNodes)
  assert.deepEqual(clone(ownerMismatch.harness.historyRef().current), originalOwnerHistory)
}
console.log('PASS: confirmed conversation uses original O8 receipt, preserves pending user drafts/geometry/selection and undo/redo, rejects wrong binding/collision, and repeats idempotently without reload.')

