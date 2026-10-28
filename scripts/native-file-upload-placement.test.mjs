import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { Server } from 'node:net'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs'
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const runtimeRoot = path.join(root, '.runtime', 'native-file-upload-placement-' + stamp)
const output = path.join(root, 'output/原生文件Drop整合_20261017i/真实上传投放集成', stamp)
await mkdir(runtimeRoot, { recursive: true }); await mkdir(output, { recursive: true })
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'
const requireCore = createRequire(path.join(installedRoot, 'apps/local-core/package.json'))
const { zipSync, unzipSync, strToU8 } = requireCore('fflate')
const { startSurfaceCoreFacade } = await import(pathToFileURL(await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'facade.mjs'), 'node', { coreWorkspaceMembership: true })).href)
let originalTextFactory, nativeFileUploadNode
function walk(node, visit) {
  if (!node?.type) return; visit(node)
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit)
}
async function prepareActualFactory() {
  const original = await readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-D4wysAbz.js'), 'utf8')
  const tree = parseOriginalDonorScript(original, 'UnlimitedModeToggle-D4wysAbz.js'), initializers = {}
  walk(tree, node => {
    if (['VariableDeclarator', 'FunctionDeclaration'].includes(node.type) && ['XD', 'kM', 'SM', 'sd'].includes(node.id?.name))
      initializers[node.id.name] = original.slice(node.start, node.end)
  })
  assert.equal(Object.keys(initializers).length, 4)
  let serial = 0
  const leaf = { Ru: { getState: () => ({ mergedPolicy: {} }) }, ma: { get: () => undefined }, Di: { MODEL_PREFS: 'controlled-no-preferences' },
    Wa: { 'gemini-3.1-flash-lite': { provider: 'google' } }, TM: [], ie: { TEXT: 'text' }, Pu: () => 'fixture-' + ++serial,
    ar: { width: 250, height: 250 }, zp: { getState: () => ({ selectedNodeCount: 0 }) } }
  vm.runInNewContext(`var sd; ${initializers.sd}; const ${initializers.SM}; ${initializers.kM}; const ${initializers.XD}; globalThis.originalTextFactory=XD;`, leaf)
  originalTextFactory = leaf.originalTextFactory
  const helperSource = await readFile(path.join(root, 'lab/pilot/native-file-upload.tsx'), 'utf8')
  const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript')
  const helperAst = ts.createSourceFile('native-file-upload.tsx', helperSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const pieces = []
  const collect = node => {
    if (ts.isVariableDeclaration(node) && ['object', 'text'].includes(node.name?.text)) pieces.push('const ' + node.getText(helperAst) + ';')
    if (ts.isFunctionDeclaration(node) && ['activeFileHost', 'LCOSNativeFileUploadNode'].includes(node.name?.text)) pieces.push(node.getText(helperAst).replace(/^export /, ''))
    ts.forEachChild(node, collect)
  }
  collect(helperAst)
  assert.equal(pieces.length, 4)
  const relative = path.relative(root, path.join(runtimeRoot, 'actual-front-source.ts'))
  await writeFile(path.join(root, relative), 'type Data=Readonly<Record<string,unknown>>;\n' + pieces.join('\n') + '\nexport { LCOSNativeFileUploadNode };')
  const entry = await buildPilotEntry(relative, path.join(runtimeRoot, 'actual-front-source.mjs'))
  nativeFileUploadNode = (await import(pathToFileURL(entry).href)).LCOSNativeFileUploadNode
}
const originalFetch = globalThis.fetch
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const owned = process._getActiveHandles().filter(value => value instanceof Server && value.listening).map(value => value.address())
    .filter(value => value && typeof value !== 'string').some(value => ['127.0.0.1', '::1'].includes(value.address) && String(value.port) === url.port)
  if (!owned || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Test refused an unowned endpoint.')
  return originalFetch(input, options)
}

const report = { passed: false, coreChainPassed: false,
  scope: 'actual facade.upload HTTP singlePUT → Core imports → actual facade.handle lifecycle batch → original material placement/Assembly/projector/Huabu executor/readback',
  boundary: 'no browser/O8 hook claim; lifecycle action DTOs use production facade, not a simulated history owner',
  runtimeRoot, candidateAccessed: false, originalDataTouched: false, rawSql: false, modelOrRunSubmitted: false,
  cases: [], files: [], gaps: [], errors: [] }
let facade, server, origin
const operation = (kind, phase, operationId) => ({ version: 1, operationId, kind, phase })
const fixtureDir = path.join(root, 'lcos/huabu/apps/web/src/lcos/professional/__fixtures__')
async function office(name, part) {
  const entries = unzipSync(await readFile(path.join(fixtureDir, name)))
  entries['_rels/.rels'] = strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${part}"/></Relationships>`)
  return Buffer.from(zipSync(entries))
}
async function fixtures() {
  const audio = path.join(runtimeRoot, 'synthetic.wav'), video = path.join(runtimeRoot, 'synthetic.mp4')
  execFileSync('C:/Users/1/.local/bin/ffmpeg.exe', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=0.12', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', audio], { timeout: 30000, windowsHide: true })
  execFileSync('C:/Users/1/.local/bin/ffmpeg.exe', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=green:s=32x32:d=0.12:r=25', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video], { timeout: 30000, windowsHide: true })
  return [
    { name: 'placement.txt', mime: 'text/plain', kind: 'markdown', bytes: Buffer.from('合成原文件正文。\nOnly one imported text artifact.\n') },
    { name: 'placement.md', mime: 'text/markdown', kind: 'markdown', bytes: Buffer.from('# 合成文件\n\nMarkdown 原文，不能 freshText 再抄一次。\n') },
    { name: 'placement.pdf', mime: 'application/pdf', kind: 'pdf', bytes: await readFile(path.join(fixtureDir, 'reader-pages.pdf')) },
    { name: 'placement.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'other', bytes: await office('reader-history.docx', 'word/document.xml') },
    { name: 'placement.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'presentation', bytes: await office('reader-slides.pptx', 'ppt/presentation.xml') },
    { name: 'placement.wav', mime: 'audio/wav', kind: 'other', bytes: await readFile(audio) },
    { name: 'placement.mp4', mime: 'video/mp4', kind: 'other', bytes: await readFile(video) },
    { name: 'placement.zip', mime: 'application/zip', kind: 'other', bytes: Buffer.from(zipSync({ 'original.txt': strToU8('Synthetic original archive, no expansion.') })) },
  ]
}
async function call(method, url, body) { const result = await facade.handle({ method, url, body }); assert.ok(result, `${method} ${url}`); return result }
function counts() {
  const repository = facade.core.repository, projectId = facade.core.projectId, artifacts = repository.getArtifacts(projectId)
  return { artifacts: artifacts.length, revisions: artifacts.flatMap(value => repository.getArtifactRevisions(value.id)).length,
    files: repository.getFileRecords(projectId).length, runs: repository.getProjectExecutionProjection(projectId).runs.length }
}
async function facts(canvasId) {
  const repository = facade.core.repository, projectId = facade.core.projectId
  return { counts: counts(), artifacts: repository.getArtifacts(projectId), files: repository.getFileRecords(projectId),
    views: repository.getArtifacts(projectId).flatMap(value => repository.getArtifactViews(value.id)),
    bindings: repository.getProjectionBindings(projectId), memberships: repository.listProjectWorkspaceMemberships(projectId),
    raw: await facade.spatial.read(canvasId) }
}
async function uploadFile(file) {
  const created = await fetch(origin + '/api/files/upload-urls', { method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ file_name: file.name, mime_type: file.mime, file_size: file.bytes.length }) })
  assert.equal(created.status, 200); const initial = (await created.json()).data
  assert.equal((await fetch(initial.upload_url, { method: 'PUT', headers: { origin }, body: file.bytes })).status, 200)
  const response = await fetch(origin + `/api/files/upload-urls/${initial.file_id}/complete`, { method: 'PUT', headers: { origin } })
  const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result.data
}
function metadata(receipt) {
  return { artifactId: receipt.lcos_ref.artifactId, artifactViewId: receipt.lcos_ref.artifactViewId,
    revisionId: receipt.lcos_ref.revisionId, fileRecordId: receipt.fileRecordId, mimeType: receipt.mime_type,
    kind: receipt.artifact_kind, size: receipt.file_size }
}
async function create(canvasId, receipt, file, suffix, patch = {}) {
  const node = { id: `native-upload-${suffix}`, type: 'text', position: { x: 1300 + Number(suffix.replace(/\D/g, '') || 0) * 30, y: 700 },
    measured: { width: 250, height: 250 }, data: pendingData(receipt, file), ...patch }
  const response=await call('POST', `/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`, { canvas_id: canvasId,
    lcos_operation: operation('create', 'apply', `native-upload-intent-${suffix}`), actions: [{ action: 'create', creates: [node] }] })
  if(response.status===200){const created=response.body.data.lifecycle_results[0].nodes[0];assert.deepEqual(created.imported_file_ref,{...metadata(receipt),artifactViewId:created.lcos_ref.artifactViewId});}
  return response
}
function pendingData(receipt, file) {
  const priorWindow = globalThis.window
  globalThis.window = { __LCOS_NODE_LAB__: { projectId: facade.core.projectId, canvasId: 'surface-core-main', api: originalTextFactory } }
  try {
    const node = nativeFileUploadNode({ name: file.name }, { fileInfo: receipt }, { x: 0, y: 0 }, originalTextFactory,
      () => { throw new Error('actual file ingress must use its original Text factory') })
    assert.ok(node); return structuredClone(node.data)
  } finally { if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow }
}
async function applyHistoryReceipt(canvasId, index, receipt, file, created) {
  const sandbox = { window: {}, structuredClone, Date, crypto: { randomUUID: () => 'unused-test-uuid' } }
  vm.runInNewContext(await readFile(path.join(root, 'lab/startup-history-intent.js'), 'utf8'), sandbox)
  const intent = sandbox.window.__LCOS_NATIVE_INTENT__, originalId = `native-upload-${index}`
  const pending = { id: originalId, type: 'text', position: created.position, measured: { width: 250, height: 250 },
    selected: true, data: { id: originalId, ...pendingData(receipt, file) } }
  const unrelated = { id: 'unrelated-draft', type: 'text', position: { x: 1, y: 2 }, selected: true,
    data: { id: 'unrelated-draft', title: 'keep', text: 'unsaved unrelated draft', lcos_upload_url: 'unrelated-transport-must-stay' } }
  const action = { nodeId: originalId, aliases: [originalId], carrierId: created.nodeId,
    lcos_operation: operation('create', 'apply', `native-upload-intent-${index}`), lcos_snapshot: structuredClone(pending) }
  const history = [{ state: { nodes: [structuredClone(unrelated)], connections: [{ id: 'edge-before' }] } },
    { state: { nodes: [structuredClone(unrelated), structuredClone(pending)], connections: [{ id: 'edge-after' }] }, lcos_history_operations: [action] }]
  const unrelatedHistory = history.map(value => structuredClone(value.state.nodes[0]))
  const edges = history.map(value => structuredClone(value.state.connections))
  const currentNodesRef = { current: [unrelated, pending] }
  const result = intent.backfillHistoryReceipt({ canvasId, nodeId: originalId, ref: created.lcos_ref, data: created.data,
    operation: action.lcos_operation, history, currentNodesRef, setNodes: values => { currentNodesRef.current = values }, suppress() {} })
  assert.equal(result.ok, true, JSON.stringify(result))
  for (const target of [currentNodesRef.current[1], history[1].state.nodes[1], action.lcos_snapshot]) {
    assert.equal(target.data.lcos_upload_url, undefined)
    assert.deepEqual(target.data.lcos_ref, created.lcos_ref)
    if (file.kind === 'markdown') assert.equal(target.data.lcos_file_ref, undefined)
    else assert.deepEqual(target.data.lcos_file_ref, { ...metadata(receipt), artifactViewId: created.lcos_ref.artifactViewId })
    assert.deepEqual(target.position, pending.position); assert.equal(target.selected, true)
  }
  assert.equal(action.lcos_receipt_data.lcos_upload_url, undefined)
  assert.deepEqual(currentNodesRef.current[0], unrelated)
  for (let at = 0; at < history.length; at++) {
    assert.deepEqual(history[at].state.nodes[0], unrelatedHistory[at]); assert.deepEqual(history[at].state.connections, edges[at])
  }
  return { live: currentNodesRef.current[1], action: structuredClone(action),
    remainingDataFields: Object.keys(currentNodesRef.current[1].data), scope: 'actual production receipt helper in VM; original O8 hook/browser not executed' }
}
async function lifecycle(canvasId, kind, phase, id, action, refs, snapshots) {
  return call('POST', `/api/canvas/v1/canvases/${canvasId}/nodes:batchActions`, { canvas_id: canvasId,
    lcos_operation: operation(kind, phase, id), actions: [action], ...(refs ? { lcos_refs: refs } : {}),
    ...(snapshots ? { lcos_snapshots: snapshots } : {}) })
}
function firstNode(response) {
  assert.equal(response.status, 200, JSON.stringify(response.body))
  return response.body.data.lifecycle_results[0].nodes[0]
}
async function verifyNode(canvasId, node, receipt, file) {
  const repository = facade.core.repository, projectId = facade.core.projectId
  const ref = node.lcos_ref, view = repository.getArtifactView(ref.artifactViewId)
  assert.equal(ref.artifactId, receipt.lcos_ref.artifactId); assert.equal(ref.revisionId, receipt.lcos_ref.revisionId)
  assert.equal(view.artifactId, ref.artifactId); assert.equal(view.revisionId, ref.revisionId)
  if(node.imported_file_ref)assert.deepEqual(node.imported_file_ref,{...metadata(receipt),artifactViewId:ref.artifactViewId});
  const workspace = repository.getWorkspaces(projectId).find(value => value.canvasId === canvasId)
  assert.equal(view.scopeId, workspace.scopeId)
  assert.equal(repository.findProjectionBinding(projectId, canvasId, 'node', ref.entityType, ref.entityId)?.spatialId, node.nodeId)
  const scene = await call('GET', `/api/canvas/v1/canvases/${canvasId}`), dto = scene.body.data.nodes.find(value => value.id === node.nodeId)
  assert.ok(dto); assert.deepEqual(dto.data.lcos_ref, ref); assert.equal(dto.type, 'text')
  const raw = (await facade.spatial.read(canvasId)).state.nodes.find(value => value.id === node.nodeId)
  assert.ok(raw); assert.ok(!raw.type.startsWith('lcos-'), 'must remain an original builtin spatial type')
  if (file.kind === 'markdown') {
    assert.equal(dto.data.text, file.bytes.toString('utf8')); assert.equal(dto.data.content, file.bytes.toString('utf8'))
    assert.equal(dto.data.lcos_file_ref, undefined)
  } else {
    assert.deepEqual(dto.data.lcos_file_ref, { ...metadata(receipt), artifactViewId: ref.artifactViewId })
    for (const data of [node.data, dto.data, raw.data]) { assert.ok(data.text === undefined || data.text === ''); assert.ok(data.content === undefined || data.content === '') }
    assert.equal(scene.body.data.lcos_expected_revisions?.[node.nodeId], undefined)
  }
  const fileRecord = repository.getFileRecord(receipt.fileRecordId)
  assert.deepEqual(await readFile(fileRecord.observedPath), file.bytes)
  const content = await call('GET', `/api/surface-core/file-records/${receipt.fileRecordId}/content`)
  assert.equal(content.status, 200); assert.deepEqual(Buffer.from(content.body), file.bytes)
  return { rawType: raw.type, dtoType: dto.type, ref, workspaceId: workspace.id, exactBytes: true }
}

try {
  await prepareActualFactory()
  report.factoryScope = 'actual page fi→UnlimitedModeToggle.b_/XD initializer + actual LCOSNativeFileUploadNode function; controlled absent model preferences/policy/ids/selection/default250size, not original r6 serialization/browser'
  server = createServer(async (request, response) => {
    if (facade?.upload && await facade.upload(request, response, new URL(request.url, origin))) return
    response.writeHead(404); response.end()
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  origin = `http://127.0.0.1:${server.address().port}`
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true,
    nativeRailPilot: true, nativeAssemblyPilot: true, nativeTextPilot: true, nativeCollectionPilot: true })
  const initial = counts(), projectId = facade.core.projectId
  let index = 0
  for (const file of await fixtures()) {
    index++
    const entry = { name: file.name, passed: false, checks: [], gaps: [] }; report.files.push(entry)
    try {
      const canvasId = ['surface-core-main', 'surface-core-context', 'surface-core-workflow'][(index - 1) % 3]
      const before = counts(), receipt = await uploadFile(file), afterUpload = counts()
      assert.deepEqual(afterUpload, { ...before, artifacts: before.artifacts + 1, revisions: before.revisions + 1, files: before.files + 1 })
      assert.equal(receipt.artifact_kind, file.kind)
      const source = facade.core.repository.getArtifact(receipt.lcos_ref.artifactId)
      assert.equal(source.title, file.name); entry.receipt = receipt
      entry.checks.push('real singlePUT created exactly one Artifact/Revision/FileRecord')

      const validData = { title: file.name, lcos_upload_url: receipt.url, lcos_file_ref: metadata(receipt) }
      const invalid = [
        { label: 'wrong marker', patch: { data: { ...validData, lcos_file_ref: { ...metadata(receipt), artifactId: 'foreign-artifact' } } } },
        { label: 'wrong title', patch: { data: { ...validData, title: 'another file' } } },
        { label: 'wrong ref', patch: { lcos_ref: { ...receipt.lcos_ref, revisionId: 'foreign-revision' } } },
        { label: 'binary-as-authored-text', patch: { data: { ...validData, text: 'pretend imported bytes' } } },
        { label: 'bad position', patch: { position: { x: Number.NaN, y: 1 } } },
        { label: 'foreign project canvas', canvasId: 'foreign-project-canvas', patch: {} },
      ]
      for (const [attempt, invalidInput] of invalid.entries()) {
        const snapshot = await facts(canvasId)
        const result = await create(invalidInput.canvasId || canvasId, receipt, file, `${index}-invalid-${attempt}`, invalidInput.patch)
        assert.ok(result.status >= 400, `${invalidInput.label}: ${JSON.stringify(result.body)}`)
        assert.deepEqual(await facts(canvasId), snapshot, invalidInput.label + ' must not write')
      }
      entry.checks.push('wrong marker/title/ref/body/position/foreign canvas rejected before any canonical/spatial write')
      const created = firstNode(await create(canvasId, receipt, file, String(index)))
      entry.created = await verifyNode(canvasId, created, receipt, file)
      assert.deepEqual(created.measured, { width: 250, height: 250 }, 'native original file factory dimensions must not become GN2 defaults')
      assert.deepEqual(counts(), afterUpload, 'placement must never freshText/import a second material')
      const beforeRepeat = await facts(canvasId)
      const repeated = firstNode(await create(canvasId, receipt, file, `${index}-repeat`, { position: { x: 9999, y: 9999 } }))
      assert.equal(repeated.nodeId, created.nodeId); assert.deepEqual(await facts(canvasId), beforeRepeat, 'same upload reuses exact carrier and never moves it')
      entry.checks.push('placement has exact source/revision/scope, binary is never UTF8 Canvas body, repeat is fully read-only')
      const renamedFile = { ...file, name: 'renamed-' + file.name }, renamedReceipt = await uploadFile(renamedFile)
      assert.equal(renamedReceipt.file_name, renamedFile.name)
      assert.equal(renamedReceipt.lcos_ref.artifactId, receipt.lcos_ref.artifactId)
      assert.equal(renamedReceipt.lcos_ref.revisionId, receipt.lcos_ref.revisionId)
      assert.equal(renamedReceipt.fileRecordId, receipt.fileRecordId)
      assert.deepEqual(counts(), afterUpload, 'same bytes/new name must retain one original import')
      const beforeRenamedPlacement = await facts(canvasId)
      const renamed = firstNode(await create(canvasId, renamedReceipt, renamedFile, `${index}-renamed`, { position: { x: 9800, y: 9700 } }))
      assert.equal(renamed.nodeId, created.nodeId); assert.equal(renamed.data.title, file.name)
      assert.deepEqual(renamed.lcos_ref, created.lcos_ref)
      assert.deepEqual(await facts(canvasId), beforeRenamedPlacement, 'renamed upload placement is read-only and preserves original geometry/title')
      entry.checks.push('same bytes/new filename uses its exact confirmed receipt, original canonical title and same carrier/View; no extra material or movement')
      const patchedHistory = await applyHistoryReceipt(canvasId, index, receipt, file, created)
      entry.historyReceipt = { remainingDataFields: patchedHistory.remainingDataFields, scope: patchedHistory.scope }
      entry.checks.push('actual production history receipt removes upload transport and pending plain marker, pins file marker to target View, preserves other drafts/selection/edges')

      const duplicate = firstNode(await lifecycle(canvasId, 'duplicate-view', 'apply', `copy-${index}`, { action: 'create', creates: [{
        id: `native-copy-${index}`, type: 'text', position: { x: 2100, y: 1100 + index * 300 }, measured: created.measured,
        data: patchedHistory.live.data, lcos_ref: created.lcos_ref,
      }] }))
      assert.notEqual(duplicate.lcos_ref.artifactViewId, created.lcos_ref.artifactViewId)
      entry.copied = await verifyNode(canvasId, duplicate, receipt, file)
      assert.equal(facade.core.repository.listProjectWorkspaceMemberships(projectId).some(value => String(value.artifactViewId) === duplicate.lcos_ref.artifactViewId), false,
        'original spatial copy does not silently add the new View to a working-set')
      assert.deepEqual(counts(), afterUpload)
      entry.checks.push('copy uses another pinned View and same original Artifact/Revision/FileRecord/bytes')

      const beforeUndo = facade.core.repository.listProjectWorkspaceMemberships(projectId).filter(value => String(value.workspaceId) === entry.created.workspaceId
        && String(value.artifactViewId) === created.lcos_ref.artifactViewId)
      assert.equal(beforeUndo.length, 1, 'first placement really wrote original Assembly workspace membership')
      const undoSnapshot = { id: created.nodeId, type: created.type, position: created.position, measured: created.measured,
        data: { ...patchedHistory.action.lcos_snapshot.data, id: created.nodeId } }
      const undo = await lifecycle(canvasId, 'create', 'undo', `native-upload-intent-${index}`, { action: 'delete', delete_ids: [created.nodeId] },
        { [created.nodeId]: created.lcos_ref }, { [created.nodeId]: undoSnapshot })
      assert.equal(undo.status, 200, JSON.stringify(undo.body))
      assert.equal((await facade.spatial.read(canvasId)).state.nodes.some(value => value.id === created.nodeId), false)
      assert.equal(facade.core.repository.findProjectionBinding(projectId, canvasId, 'node', created.lcos_ref.entityType, created.lcos_ref.entityId), undefined)
      const remaining = facade.core.repository.listProjectWorkspaceMemberships(projectId).filter(value => String(value.workspaceId) === entry.created.workspaceId
        && String(value.artifactViewId) === created.lcos_ref.artifactViewId)
      if (remaining.length) {
        const gap = { name: file.name, code: 'UPLOAD_CREATE_UNDO_MEMBERSHIP_RETAINED', canvasId,
          viewId: created.lcos_ref.artifactViewId, memberships: remaining,
          message: 'Original lifecycle deleted the carrier/binding but kept the Assembly Workspace member. This is not complete file-create Undo.' }
        report.gaps.push(gap); entry.gaps.push(gap.code)
      }
      const restored = firstNode(await lifecycle(canvasId, 'create', 'redo', `native-upload-intent-${index}`, { action: 'create', creates: [{
        id: `native-redo-${index}`, type: 'text', position: created.position, measured: created.measured,
        data: patchedHistory.action.lcos_snapshot.data, lcos_ref: undo.body.data.lcos_refs[created.nodeId],
      }] }))
      assert.deepEqual(restored.lcos_ref, created.lcos_ref)
      entry.restored = await verifyNode(canvasId, restored, receipt, file)
      const restoredMember = facade.core.repository.listProjectWorkspaceMemberships(projectId).find(value => String(value.workspaceId) === entry.created.workspaceId
        && String(value.artifactViewId) === restored.lcos_ref.artifactViewId)
      assert.ok(restoredMember)
      assert.deepEqual(restored.data.lcos_workspace_membership, { workspaceId: String(restoredMember.workspaceId), viewId: String(restoredMember.artifactViewId),
        addedAt: restoredMember.addedAt, addedBy: restoredMember.addedBy })
      assert.deepEqual(counts(), afterUpload)
      entry.checks.push('original lifecycle Undo removes carrier/binding; Redo uses exact same View/revision/bytes with new Native NodeID (membership completeness separately asserted)')
      entry.passed = true
    } catch (error) { entry.error = error?.stack || String(error); report.errors.push({ name: file.name, error: entry.error }) }
  }
  assert.equal(counts().runs, initial.runs)
  report.initialCounts = initial; report.finalCounts = counts()
  report.coreChainPassed = report.files.every(value => value.passed)
  report.passed = report.coreChainPassed && report.gaps.length === 0
  if (!report.passed) process.exitCode = 1
} catch (error) { report.errors.push({ setup: true, error: error?.stack || String(error) }); process.exitCode = 1 }
finally {
  if (facade) await facade.close()
  if (server) await new Promise(resolve => server.close(resolve))
  globalThis.fetch = originalFetch
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  await writeFile(path.join(root, 'output/原生文件Drop整合_20261017i/真实上传投放集成/latest.json'), JSON.stringify({ output, passed: report.passed, coreChainPassed: report.coreChainPassed }) + '\n')
}
console.log(JSON.stringify({ passed: report.passed, coreChainPassed: report.coreChainPassed, files: report.files.map(value => ({ name: value.name, passed: value.passed, gaps: value.gaps, error: value.error })),
  gaps: report.gaps, errors: report.errors, output }, null, 2))
