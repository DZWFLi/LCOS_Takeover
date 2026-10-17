import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeParent = path.join(root, '.runtime')
await mkdir(runtimeParent, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(runtimeParent, 'native-material-navigation-'))

try {
  const entry = await buildPilotEntry('lab/pilot/native-material-navigation.ts', path.join(runtimeRoot, 'navigation.mjs'))
  const { cancelNativeMaterialNavigation, materialNavigationSnapshot, navigateNativeMaterialLocation } = await import(pathToFileURL(entry).href)
  const projectId = 'project-navigation-fixture'
  const location = (overrides = {}) => ({ projectId, workspaceId: 'workspace-a', scopeId: 'scope-root',
    canvasId: 'canvas-a', nodeId: 'node-a', artifactId: 'artifact-a', artifactViewId: 'view-a',
    revisionId: 'revision-a', fileRecordId: 'file-a', sameVersion: true,
    position: { x: 10, y: 20 }, size: { width: 40, height: 30 }, bindingEntityType: 'artifact', ...overrides })
  const context = (where, identity = {}) => ({ status: 'ready', identity: {
    projectId, artifactId: 'artifact-a', revisionId: 'revision-a', ...identity,
  }, memberships: [], locations: [where], rejectedLocations: [], issues: [] })
  const node = (where, overrides = {}) => ({ id: where.nodeId, data: { lcos_ref: {
    version: 1, entityType: where.bindingEntityType,
    entityId: where.bindingEntityType === 'view' ? where.artifactViewId : where.artifactId,
    artifactId: where.artifactId, artifactViewId: where.artifactViewId, revisionId: where.revisionId,
  } }, ...overrides })
  let fittedApi
  const api = (nodes = []) => {
    const instance = { fitCalls: [], getNodes: () => nodes, fitView: async options => {
      fittedApi = instance
      instance.fitCalls.push(options)
      apiCalls.push(options)
      return true
    } }
    return instance
  }
  let apiCalls = []
  const makeHarness = (initial, options = {}) => {
    let state = initial
    let activeProject = projectId
    const listeners = new Set()
    const harness = {
      getState: () => state,
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
      listenerCount: () => listeners.size,
      projectId: () => activeProject,
      setProject: value => { activeProject = value },
      setState: value => { state = value; for (const listener of listeners) setImmediate(listener) },
      select: options.select ?? (async () => {}),
    }
    return harness
  }
  const ready = (canvasId, rfInstance) => ({ status: 'ready', canvasId, rfInstance })
  const waitTurn = () => new Promise(resolve => setImmediate(resolve))
  const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
  const withShortDeadline = async run => {
    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (callback, delay, ...args) => originalSetTimeout(callback, delay === 12000 ? 15 : delay, ...args)
    try { return await run() } finally { globalThis.setTimeout = originalSetTimeout }
  }

  // Same Canvas: exact identity is enough to reuse the live API; selection is not called.
  apiCalls = []
  const same = location()
  const sameApi = api([node(same)])
  const sameHarness = makeHarness(ready(same.canvasId, sameApi), { select: async () => { throw new Error('must not select') } })
  const sameResult = await navigateNativeMaterialLocation({ projectId, location: same, read: async () => ({ context: context(same) }) }, sameHarness)
  assert.equal(sameResult.ok, true)
  assert.equal(apiCalls.length, 1)
  assert.equal(fittedApi, sameApi)
  assert.deepEqual(apiCalls[0].nodes, [{ id: same.nodeId }])

  // A false fitView result is not a located state; void remains accepted by the implementation.
  apiCalls = []
  const falseFitApi = { getNodes: () => [node(same)], fitView: async options => { apiCalls.push(options); return false } }
  const falseFitResult = await navigateNativeMaterialLocation({ projectId, location: same,
    read: async () => ({ context: context(same) }) }, makeHarness(ready(same.canvasId, falseFitApi)))
  assert.equal(falseFitResult.ok, false)
  assert.match(falseFitResult.reason, /没有确认相机定位完成/)
  assert.equal(materialNavigationSnapshot()?.state, 'error')
  assert.equal(apiCalls.length, 1)

  // Cross Canvas: wait through the native API refresh, then require the exact live node before fitView.
  apiCalls = []
  const target = location({ canvasId: 'canvas-target', workspaceId: 'workspace-target', nodeId: 'node-target' })
  const sourceApi = api([])
  const targetApi = api([])
  const exactTargetApi = api([node(target)])
  const arrivalHarness = makeHarness(ready('canvas-source', sourceApi))
  const readsAt = []
  let crossCanvasSelectCalls = 0
  arrivalHarness.select = async request => {
    crossCanvasSelectCalls += 1
    assert.deepEqual(request, { projectId, sourceCanvasId: 'canvas-source', targetCanvasId: 'canvas-target' })
    setImmediate(() => {
      arrivalHarness.setState(ready('canvas-target', targetApi))
      setImmediate(() => arrivalHarness.setState(ready('canvas-target', exactTargetApi)))
    })
  }
  const arrivalResult = await navigateNativeMaterialLocation({ projectId, location: target, read: async () => {
    const snapshot = arrivalHarness.getState()
    readsAt.push(snapshot.canvasId)
    return { context: context(target) }
  } }, arrivalHarness)
  assert.equal(arrivalResult.ok, true)
  assert.deepEqual(readsAt, ['canvas-source', 'canvas-target'], 're-read and verify after exact-node arrival')
  assert.equal(crossCanvasSelectCalls, 1)
  assert.equal(apiCalls.length, 1)
  assert.equal(fittedApi, exactTargetApi, 'do not fit the refreshed API until it exposes the exact node')

  // The target page may renew its ReactFlow API while the second Core read is pending.
  apiCalls = []
  const arrivingExactApi = api([node(target)])
  const renewedTargetApi = api([node(target)])
  const renewalHarness = makeHarness(ready('canvas-source', api([])))
  renewalHarness.select = async () => {
    setImmediate(() => renewalHarness.setState(ready('canvas-target', arrivingExactApi)))
  }
  let renewalReads = 0
  const renewedResult = await navigateNativeMaterialLocation({ projectId, location: target, read: async () => {
    renewalReads += 1
    if (renewalReads === 2) renewalHarness.setState(ready('canvas-target', renewedTargetApi))
    return { context: context(target) }
  } }, renewalHarness)
  assert.equal(renewedResult.ok, true)
  assert.equal(renewalReads, 2)
  assert.equal(arrivingExactApi.fitCalls.length, 0, 'arrival API is evidence only; do not use its stale handle')
  assert.equal(renewedTargetApi.fitCalls.length, 1, 'fit through the current exact-node API after the second read')
  assert.equal(fittedApi, renewedTargetApi)
  assert.equal(apiCalls.length, 1)

  // Re-read final state inside the fit callback: an API renewal in the intervening microtask wins.
  apiCalls = []
  const gapArrivalApi = api([node(target)])
  const gapCurrentApi = api([node(target)])
  const gapHarness = makeHarness(ready('canvas-source', api([])))
  const originalGetState = gapHarness.getState
  let renewOnFinalSnapshot = false
  gapHarness.getState = () => {
    const snapshot = originalGetState()
    if (renewOnFinalSnapshot) {
      renewOnFinalSnapshot = false
      queueMicrotask(() => gapHarness.setState(ready('canvas-target', gapCurrentApi)))
    }
    return snapshot
  }
  gapHarness.select = async () => {
    setImmediate(() => gapHarness.setState(ready('canvas-target', gapArrivalApi)))
  }
  let gapReads = 0
  const gapResult = await navigateNativeMaterialLocation({ projectId, location: target, read: async () => {
    gapReads += 1
    if (gapReads === 2) renewOnFinalSnapshot = true
    return { context: context(target) }
  } }, gapHarness)
  assert.equal(gapResult.ok, true)
  assert.equal(gapArrivalApi.fitCalls.length, 0)
  assert.equal(gapCurrentApi.fitCalls.length, 1)
  assert.equal(fittedApi, gapCurrentApi)
  assert.equal(materialNavigationSnapshot()?.arrivalApiRenewed, true)

  // Explicit cancel interrupts a native selector wait; the already-delegated Ke switch is not replayed.
  apiCalls = []
  const selectEntered = deferred()
  const selectorCompletion = deferred()
  const cancelledSelectHarness = makeHarness(ready('canvas-source', api([])))
  let cancelledSelectCalls = 0
  cancelledSelectHarness.select = async () => {
    cancelledSelectCalls += 1
    selectEntered.resolve()
    return selectorCompletion.promise
  }
  const cancelledSelectNavigation = navigateNativeMaterialLocation({ projectId, location: target,
    read: async () => ({ context: context(target) }) }, cancelledSelectHarness)
  await selectEntered.promise
  cancelNativeMaterialNavigation()
  assert.equal((await cancelledSelectNavigation).ok, false)
  assert.equal(cancelledSelectCalls, 1)
  assert.equal(apiCalls.length, 0)
  assert.equal(materialNavigationSnapshot(), null)
  assert.equal(cancelledSelectHarness.listenerCount(), 0, 'cancel removes the Canvas arrival subscription')
  selectorCompletion.resolve()
  await waitTurn()
  assert.equal(cancelledSelectCalls, 1, 'late native selector completion is never replayed')
  assert.equal(apiCalls.length, 0, 'late native selector completion cannot add a fitView')

  // Explicit cancel also interrupts the final Core read after an evidenced arrival.
  apiCalls = []
  const finalReadEntered = deferred()
  let finalReadSignal
  const cancelledReadArrivalApi = api([node(target)])
  const cancelledReadHarness = makeHarness(ready('canvas-source', api([])))
  cancelledReadHarness.select = async () => {
    setImmediate(() => cancelledReadHarness.setState(ready('canvas-target', cancelledReadArrivalApi)))
  }
  let cancelledReadCount = 0
  const cancelledReadNavigation = navigateNativeMaterialLocation({ projectId, location: target, read: async signal => {
    cancelledReadCount += 1
    if (cancelledReadCount === 2) {
      finalReadEntered.resolve()
      finalReadSignal = signal
      return new Promise(() => {})
    }
    return { context: context(target) }
  } }, cancelledReadHarness)
  await finalReadEntered.promise
  cancelNativeMaterialNavigation()
  assert.equal((await cancelledReadNavigation).ok, false)
  assert.equal(finalReadSignal.aborted, true)
  assert.equal(cancelledReadArrivalApi.fitCalls.length, 0)
  assert.equal(apiCalls.length, 0)
  assert.equal(materialNavigationSnapshot(), null)
  assert.equal(cancelledReadHarness.listenerCount(), 0)

  // The shared deadline covers a hung first Core read, final Core read, and original selector.
  await withShortDeadline(async () => {
    apiCalls = []
    let readSignal
    const timedReadHarness = makeHarness(ready('canvas-source', api([])))
    const timedRead = await navigateNativeMaterialLocation({ projectId, location: target, read: signal => {
      readSignal = signal
      return new Promise(() => {})
    } }, timedReadHarness)
    assert.equal(timedRead.ok, false)
    assert.match(timedRead.reason, /超时/)
    assert.equal(readSignal.aborted, true)
    assert.equal(apiCalls.length, 0)
    assert.equal(timedReadHarness.listenerCount(), 0)
  })

  await withShortDeadline(async () => {
    apiCalls = []
    const timedFinalReadApi = api([node(target)])
    const timedFinalReadHarness = makeHarness(ready('canvas-source', api([])))
    timedFinalReadHarness.select = async () => {
      setImmediate(() => timedFinalReadHarness.setState(ready('canvas-target', timedFinalReadApi)))
    }
    let reads = 0
    const timedFinalRead = await navigateNativeMaterialLocation({ projectId, location: target, read: () => {
      reads += 1
      return reads === 1 ? Promise.resolve({ context: context(target) }) : new Promise(() => {})
    } }, timedFinalReadHarness)
    assert.equal(timedFinalRead.ok, false)
    assert.match(timedFinalRead.reason, /超时/)
    assert.equal(timedFinalReadApi.fitCalls.length, 0)
    assert.equal(apiCalls.length, 0)
    assert.equal(timedFinalReadHarness.listenerCount(), 0)
  })

  await withShortDeadline(async () => {
    apiCalls = []
    const selectEnteredBeforeTimeout = deferred()
    const lateSelectCompletion = deferred()
    let timedSelectCalls = 0
    const timedSelectHarness = makeHarness(ready('canvas-source', api([])))
    timedSelectHarness.select = async () => {
      timedSelectCalls += 1
      selectEnteredBeforeTimeout.resolve()
      return lateSelectCompletion.promise
    }
    const timedSelectNavigation = navigateNativeMaterialLocation({ projectId, location: target,
      read: async () => ({ context: context(target) }) }, timedSelectHarness)
    await selectEnteredBeforeTimeout.promise
    const timedSelect = await timedSelectNavigation
    assert.equal(timedSelect.ok, false)
    assert.match(timedSelect.reason, /超时/)
    assert.equal(timedSelectCalls, 1)
    assert.equal(apiCalls.length, 0)
    assert.equal(timedSelectHarness.listenerCount(), 0, 'timeout removes the Canvas arrival subscription')
    lateSelectCompletion.resolve()
    await waitTurn()
    assert.equal(timedSelectCalls, 1, 'late timed-out selector completion is not replayed')
    assert.equal(apiCalls.length, 0, 'late timed-out selector completion cannot fit the old camera')
  })

  // Foreign project and another Revision are refused before the original selector is called.
  for (const [badLocation, badContext] of [
    [location(), context(location(), { projectId: 'foreign-project' })],
    [location({ revisionId: 'revision-old', sameVersion: false }), context(location({ revisionId: 'revision-old', sameVersion: false }))],
  ]) {
    apiCalls = []
    const refusedApi = api([])
    const refusedHarness = makeHarness(ready('canvas-a', refusedApi))
    let refusedSelectCalls = 0
    refusedHarness.select = async () => { refusedSelectCalls += 1 }
    let reads = 0
    const result = await navigateNativeMaterialLocation({ projectId, location: badLocation,
      read: async () => { reads += 1; return { context: badContext } } }, refusedHarness)
    assert.equal(result.ok, false)
    assert.equal(refusedSelectCalls, 0)
    assert.equal(reads, 1)
    assert.equal(apiCalls.length, 0, 'refusal does not fit another camera')
  }

  // Not-ready and a changed source Canvas are both fail-closed.
  const notReadyHarness = makeHarness({ status: 'waiting', canvasId: null, rfInstance: null })
  const notReady = await navigateNativeMaterialLocation({ projectId, location: target, read: async () => ({ context: context(target) }) }, notReadyHarness)
  assert.equal(notReady.ok, false)
  assert.equal(apiCalls.length, 0)
  const delayed = deferred()
  const changedHarness = makeHarness(ready('canvas-source', api([])))
  const changedRead = navigateNativeMaterialLocation({ projectId, location: target, read: () => delayed.promise }, changedHarness)
  changedHarness.setState(ready('canvas-other', api([])))
  delayed.resolve({ context: context(target) })
  assert.equal((await changedRead).ok, false)
  assert.equal(apiCalls.length, 0)

  // A source API replacement during the first read invalidates the original preflight.
  apiCalls = []
  const initialSourceApi = api([])
  const replacementSourceApi = api([])
  const sourceApiRead = deferred()
  const sourceApiHarness = makeHarness(ready('canvas-source', initialSourceApi))
  let sourceApiSelectCalls = 0
  sourceApiHarness.select = async () => { sourceApiSelectCalls += 1 }
  const sourceApiChange = navigateNativeMaterialLocation({ projectId, location: target, read: () => sourceApiRead.promise }, sourceApiHarness)
  sourceApiHarness.setState(ready('canvas-source', replacementSourceApi))
  sourceApiRead.resolve({ context: context(target) })
  assert.equal((await sourceApiChange).ok, false)
  assert.equal(sourceApiSelectCalls, 0)
  assert.equal(apiCalls.length, 0)

  // A newer request wins while the old read is pending; its late result never switches or fits.
  apiCalls = []
  const staleRead = deferred()
  const newer = location({ nodeId: 'node-newer' })
  const newerApi = api([node(newer)])
  const latestHarness = makeHarness(ready('canvas-a', newerApi), { select: async () => { throw new Error('stale request must not select') } })
  const oldTarget = location({ canvasId: 'canvas-old', nodeId: 'node-old' })
  const oldResult = navigateNativeMaterialLocation({ projectId, location: oldTarget, read: () => staleRead.promise }, latestHarness)
  await waitTurn()
  const newResult = await navigateNativeMaterialLocation({ projectId, location: newer, read: async () => ({ context: context(newer) }) }, latestHarness)
  staleRead.resolve({ context: context(oldTarget) })
  assert.equal(newResult.ok, true)
  assert.equal((await oldResult).ok, false)
  assert.equal(apiCalls.length, 1)
  assert.equal(fittedApi, newerApi)
  assert.deepEqual(apiCalls[0].nodes, [{ id: newer.nodeId }])

  // The original selector's rejection is final; the adapter never retries or replays it.
  apiCalls = []
  let selectCalls = 0
  const rejectHarness = makeHarness(ready('canvas-source', api([])), { select: async () => {
    selectCalls += 1
    throw new Error('Ke preflight refused')
  } })
  const refusedSelect = await navigateNativeMaterialLocation({ projectId, location: target,
    read: async () => ({ context: context(target) }) }, rejectHarness)
  assert.equal(refusedSelect.ok, false)
  assert.match(refusedSelect.reason, /Ke preflight refused/)
  assert.equal(selectCalls, 1)
  assert.equal(apiCalls.length, 0)

  process.stdout.write(JSON.stringify({
    test: 'native-material-navigation', sameCanvasExactFit: true, crossCanvasWaitsForExactApiNode: true,
    crossCanvasUsesRenewedCurrentApi: true, sourceApiChangeDuringFirstReadRefused: true,
    fitUsesLatestApiAfterFinalSnapshotGap: true,
    cancelInterruptsSelectorAndFinalRead: true, deadlineCoversFirstAndFinalReadAndSelector: true,
    lateSelectorCompletionNeverFitsOrReplays: true,
    explicitFalseFitDoesNotLocate: true,
    foreignAndOtherRevisionRefused: true, notReadyAndChangedSourceRefused: true,
    staleReadCannotStealCamera: true, originalSelectRejectionNotReplayed: true,
  }) + '\n')
} finally {
  await rm(runtimeRoot, { recursive: true, force: true })
}
