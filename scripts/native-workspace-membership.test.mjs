import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Server } from 'node:net'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const runtimeRoot = path.join(root, '.runtime', 'workspace-member-lifecycle-' + stamp)
const output = path.join(root, 'output/原生文件Drop整合_20261017i/成员原历史恢复专项', stamp)
await mkdir(runtimeRoot, { recursive: true }); await mkdir(output, { recursive: true })
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'
const relative = value => path.relative(runtimeRoot, path.join(root, value)).replaceAll('\\', '/')
const entry = path.join(runtimeRoot, 'fixture.ts')
await writeFile(entry, `export {startSurfaceCoreFacade} from '${relative('lab/pilot/surface-core-facade.ts')}';\nexport {createNodeLifecycle} from '${relative('lab/pilot/node-lifecycle.ts')}';`)
const module = await import(pathToFileURL(await buildPilotEntry(path.relative(root, entry), path.join(runtimeRoot, 'fixture.mjs'), 'node', { coreWorkspaceMembership: true })).href)
const upstream = globalThis.fetch
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const owned = process._getActiveHandles().filter(value => value instanceof Server && value.listening).some(value => {
    const address = value.address(); return address && typeof address !== 'string' && String(address.port) === url.port && ['127.0.0.1', '::1'].includes(address.address)
  })
  if (!owned || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Test refused an unowned endpoint.')
  if (facade?.core.origin === url.origin && proxyOrigin && new Headers(options?.headers).has('x-lcos-expected-workspace-member'))
    return upstream(proxyOrigin + url.pathname + url.search, options)
  return upstream(input, options)
}
let facade, proxy, proxyOrigin, mode = '', observedCreates = 0
const requests = [], report = { passed: false, runtimeRoot, scope: 'actual lifecycle + original Core member HTTP/transaction/ChangeSet + real Huabu; controlled network response loss/race only',
  candidateAccessed: false, originalDataTouched: false, rawSql: false, modelsExecuted: false, cases: [] }
const op = (kind, phase, id) => ({ version: 1, kind, phase, operationId: id })
try {
  facade = await module.startSurfaceCoreFacade({ runtimeRoot, publicOrigin: 'http://127.0.0.1:19972', fullIntegration: true,
    nativeRailPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeCollectionPilot: true })
  const repository = facade.core.repository, projectId = facade.core.projectId, canvasId = 'surface-core-main'
  const workspace = repository.getWorkspaces(projectId).find(value => value.canvasId === canvasId)
  const core = async (method, route, body) => {
    const response = await fetch(facade.core.origin + route, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result
  }
  proxy = createServer(async (request, response) => {
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk)
      const body = Buffer.concat(chunks), selected = mode
      requests.push({ method: request.method, path: request.url, conditional: !!request.headers['x-lcos-expected-workspace-member'], mode: selected })
      const deleting = request.method === 'DELETE', adding = request.method === 'POST'
      if (selected === 'late-readd' && deleting) {
        mode = ''
        await core('DELETE', request.url)
        await new Promise(resolve => setTimeout(resolve, 3))
        await core('POST', `/workspaces/${workspace.id}/members`, { viewIds: [decodeURIComponent(request.url.split('/').at(-1))], addedBy: 'agent' })
      }
      if (selected === 'fail-add' && adding) { mode = ''; response.writeHead(503, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: false, error: { code: 'SYNTHETIC_INTERRUPT', message: 'before Core add' } })); return }
      if (selected === 'late-add' && adding) { mode = ''; await core('POST', request.url, { ...JSON.parse(body.toString()), addedBy: 'agent' }) }
      const headers = Object.fromEntries(Object.entries(request.headers).filter(([key]) => !['host', 'connection', 'content-length'].includes(key)))
      const result = await upstream(facade.core.origin + request.url, { method: request.method, headers, ...(body.length ? { body } : {}) })
      const bytes = Buffer.from(await result.arrayBuffer())
      if ((selected === 'lose-delete' && deleting || selected === 'lose-add' && adding) && result.status === 200) { mode = ''; response.destroy(); return }
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(bytes)
    } catch (error) { response.writeHead(500, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: String(error) })) }
  })
  await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve) })
  proxyOrigin = `http://127.0.0.1:${proxy.address().port}`
  const originalExecute = facade.spatial.execute
  facade.spatial.execute = async (id, commands) => { observedCreates += commands.filter(value => value.type === 'CREATE_NODES').length; return originalExecute(id, commands) }
  const apply = async (operation, action, refs, snapshots) => {
    const response = await facade.handle({ method: 'POST', url: `/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`, body: {
      canvas_id: canvasId, lcos_operation: operation, actions: [action], ...(refs ? { lcos_refs: refs } : {}), ...(snapshots ? { lcos_snapshots: snapshots } : {}) } })
    if (response.status >= 400) throw Object.assign(new Error(response.body.message), response.body.error, { status: response.status })
    return { result: response.body.data.lifecycle_results[0], scene: response.body.data.nodes }
  }
  let serial = 0
  const fresh = async title => {
    const response = await apply(op('create', 'apply', 'fresh-' + ++serial), { action: 'create', creates: [{
      id: 'member-fixture-' + serial, type: 'text', position: { x: 3000 + serial * 400, y: 900 }, measured: { width: 250, height: 250 },
      data: { title, text: '# Synthetic original body\n' + title } }] })
    const node = response.result.nodes[0]; assert.ok(node.data.lcos_workspace_membership)
    const visible = await facade.handle({ method: 'GET', url: `/api/canvas/v1/canvases/${canvasId}` })
    const snapshot = visible.body.data.nodes.find(value => value.id === node.nodeId)
    assert.ok(snapshot.data.lcos_ref)
    return { node, snapshot }
  }
  const row = target => repository.listWorkspaceMembers(workspace.id).find(value => String(value.artifactViewId) === target.node.lcos_ref.artifactViewId)
  const raw = async target => (await facade.spatial.read(canvasId)).state.nodes.find(value => value.id === target.node.nodeId)
  const undo = (target, snapshots = { [target.node.nodeId]: target.snapshot }) => apply(op('create', 'undo', 'intent-' + target.node.nodeId),
    { action: 'delete', delete_ids: [target.node.nodeId] }, { [target.node.nodeId]: target.node.lcos_ref }, snapshots)
  const redo = async (target, id) => (await apply(op('create', 'redo', 'intent-' + target.node.nodeId),
    { action: 'create', creates: [{ id, type: 'text', position: target.node.position, measured: target.node.measured,
      data: target.snapshot.data, lcos_ref: target.node.lcos_ref }] })).result

  const guarded = await fresh('No snapshot preserves membership'), beforeGuard = await raw(guarded), requestsBefore = requests.length
  await assert.rejects(undo(guarded, {}), error => error.code === 'WORKSPACE_MEMBERSHIP_CHANGED')
  assert.deepEqual(await raw(guarded), beforeGuard); assert.ok(row(guarded)); assert.equal(requests.length, requestsBefore)
  report.cases.push('member without exact original snapshot rejects before any Core/Canvas write')

  const raced = await fresh('Member changed while original request waits'), racedRaw = await raw(raced)
  mode = 'late-readd'; const oldAddedAt = row(raced).addedAt, requestStart = requests.length
  await assert.rejects(undo(raced), error => error.code === 'WORKSPACE_MEMBERSHIP_REMOVE_UNCONFIRMED')
  assert.equal(requests.length - requestStart, 1); assert.notEqual(row(raced).addedAt, oldAddedAt)
  assert.equal(row(raced).addedBy, 'agent'); assert.deepEqual(await raw(raced), racedRaw)
  report.cases.push('actual HTTP await remove+readd: Core original transaction rejects stale row; newer member/carrier/draft remain, one DELETE attempt')

  const lost = await fresh('Original delete and add response losses'), preChanges = repository.listMutationChangeSets(projectId, 1000).length
  mode = 'lose-delete'; const startLoss = requests.length
  await undo(lost); assert.equal(requests.length - startLoss, 1); assert.equal(row(lost), undefined); assert.equal(await raw(lost), undefined)
  mode = 'lose-add'; const createsBefore = observedCreates, addStart = requests.length
  const recovered = (await redo(lost, 'member-recovery-loss')).nodes[0]
  assert.equal(requests.length - addStart, 1); assert.equal(observedCreates - createsBefore, 1)
  assert.equal(recovered.lcos_ref.artifactViewId, lost.node.lcos_ref.artifactViewId)
  assert.ok(row(lost)); assert.equal(recovered.data.lcos_workspace_membership.addedAt, row(lost).addedAt)
  assert.ok(repository.listMutationChangeSets(projectId, 1000).length >= preChanges + 2)
  report.cases.push('actual Core DELETE/POST each commit then lose200: fresh repository read confirms, zero blind retry, one original carrier restore, real ChangeSets remain')

  const partial = await fresh('Restore partial keeps one exact carrier')
  await undo(partial); mode = 'fail-add'; const beforePartial = observedCreates
  await assert.rejects(redo(partial, 'member-partial-restore'), error => error.code === 'PARTIAL_LIFECYCLE_COMMIT')
  const partialBinding = repository.findProjectionBinding(projectId, canvasId, 'node', partial.node.lcos_ref.entityType, partial.node.lcos_ref.entityId)
  assert.equal(partialBinding.spatialId, 'member-partial-restore'); assert.equal(row(partial), undefined)
  const retried = (await redo(partial, 'member-partial-restore')).nodes[0]
  assert.equal(observedCreates - beforePartial, 1, 'explicit recovery must not recreate an existing exact carrier')
  assert.equal(retried.nodeId, 'member-partial-restore'); assert.ok(row(partial))
  report.cases.push('known failed Core add leaves exact carrier+binding; explicit same-ID restore only adds missing original member, no second CREATE')

  const edited = await fresh('Do not overwrite newer geometry')
  await undo(edited); mode = 'fail-add'
  await assert.rejects(redo(edited, 'member-later-moved'), error => error.code === 'PARTIAL_LIFECYCLE_COMMIT')
  await facade.spatial.execute(canvasId, [{ type: 'SET_NODE_GEOMETRY', items: [{ nodeId: 'member-later-moved', position: { x: 8001, y: 8002 } }] }])
  const requestsBeforeEdited = requests.length, createsBeforeEdited = observedCreates
  await assert.rejects(redo(edited, 'member-later-moved'), error => error.code === 'CORE_RESTORE_CARRIER_CHANGED')
  assert.equal(requests.length, requestsBeforeEdited); assert.equal(observedCreates, createsBeforeEdited)
  assert.deepEqual((await facade.spatial.read(canvasId)).state.nodes.find(value => value.id === 'member-later-moved').position, { x: 8001, y: 8002 })
  report.cases.push('same partial carrier moved by original spatial owner refuses recovery with zero Core POST/CREATE; newer geometry intact')

  const inserted = await fresh('Concurrent add is not claimed by old restore')
  await undo(inserted); mode = 'late-add'
  await assert.rejects(redo(inserted, 'member-late-add'), error => error.code === 'PARTIAL_LIFECYCLE_COMMIT')
  assert.equal(row(inserted).addedBy, 'agent')
  report.cases.push('Core guarded absent-add rejects a newer user member during HTTP await; no silent claim/overwrite')
  assert.equal(repository.getProjectExecutionProjection(projectId).runs.length, 0)
  report.requests = requests; report.passed = true
} catch (error) { report.error = error?.stack || String(error); process.exitCode = 1 }
finally {
  if (proxy) await new Promise(resolve => proxy.close(resolve))
  if (facade) await facade.close()
  globalThis.fetch = upstream
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  await writeFile(path.join(root, 'output/原生文件Drop整合_20261017i/成员原历史恢复专项/latest.json'), JSON.stringify({ output, passed: report.passed }) + '\n')
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases, error: report.error, output }, null, 2))
