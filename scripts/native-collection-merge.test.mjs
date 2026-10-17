import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { Server as NetServer } from 'node:net'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportRoot = path.join(root, '.runtime', 'native-collection-merge')
await mkdir(reportRoot, { recursive: true })
const reportPath = path.join(reportRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
const runtimeRoot = await mkdtemp(path.join(reportRoot, 'case-'))
const blockedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])
const report = {
  at: new Date().toISOString(), reportPath, runtimeRoot,
  test: 'native-collection-merge',
  implementation: 'restricted collection-space history adapter over original Gen2 planner, same O8 operation snapshot and one locked Huabu batch per phase',
  boundary: 'existing Core curation transaction changes only target memberships and source current-Canvas binding; both Collection identities and source complete membership survive; same original O8 + locked Huabu owns geometry',
  currentRoot: currentGen2Root,
  originalUserDatabaseOpened: false,
  live17881Accessed: false,
  providerOrBridgeStarted: false,
  rawSqlUsed: false,
  schemaChanged: false,
  network: { allowedCoreRequests: [], rejectedDeadSemanticRequests: [], blockedRequests: [], activeListeners: [], activeListenersAtClose: [] },
  fixture: {}, cases: [], cleanup: { facadeClosed: false, listenersReleased: false, runtimeRemoved: false }, passed: false,
}
const originalFetch = globalThis.fetch.bind(globalThis)
const coreOrigins = new Set()
let facade
let coreOrigin
let repository
let fetchInstalled = false
let bootstrapping = false

function isLoopback(host) { return ['127.0.0.1', 'localhost', '[::1]'].includes(host) }
function activeLoopbackOrigins() {
  const result = new Set()
  for (const handle of process._getActiveHandles()) {
    if (!(handle instanceof NetServer) || !handle.listening) continue
    const address = handle.address()
    if (!address || typeof address === 'string' || !isLoopback(address.address) || !Number.isInteger(address.port)) continue
    result.add(`http://${address.address.includes(':') ? `[${address.address}]` : address.address}:${address.port}`)
  }
  return result
}
function assertContained(parent, target) {
  const resolvedParent = path.resolve(parent), resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedParent, resolvedTarget)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.resolve(resolvedParent, relative) !== resolvedTarget) throw new Error(`Refusing cleanup outside owned runtime: ${resolvedTarget}`)
}
function installFetchBoundary() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
    const url = new URL(address)
    const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (url.origin === 'http://127.0.0.1:1') {
      report.network.rejectedDeadSemanticRequests.push({ method, path: url.pathname })
      throw new Error('Pinned dead semantic endpoint; no model/provider access is allowed.')
    }
    const active = activeLoopbackOrigins()
    if (url.protocol === 'http:' && isLoopback(url.hostname) && !blockedPorts.has(url.port)
      && ((coreOrigins.has(url.origin) && active.has(url.origin))
        || (bootstrapping && active.size === 1 && [...active][0] === url.origin))) {
      const response = await originalFetch(input, init)
      report.network.allowedCoreRequests.push({ method, origin: url.origin, path: url.pathname, status: response.status })
      return response
    }
    report.network.blockedRequests.push({ method, origin: url.origin, path: url.pathname })
    throw new Error('Only the test-owned isolated Core loopback listener and pinned dead semantic endpoint are permitted.')
  }
}
function relativeImport(fromFile, targetFile) {
  let value = path.relative(path.dirname(fromFile), targetFile).replaceAll('\\', '/')
  if (!value.startsWith('.')) value = './' + value
  return value
}
async function coreRequest(method, pathname, body) {
  const response = await fetch(`${coreOrigin}${pathname}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const payload = (response.headers.get('content-type') || '').includes('application/json')
    ? await response.json() : Buffer.from(await response.arrayBuffer())
  return { status: response.status, body: payload }
}
async function facadeCall(method, pathname, body) {
  return facade.handle({ method, pathname, url: new URL(pathname, coreOrigin), body })
}
function valueOf(result) { return result?.body?.data ?? result?.body?.value ?? result?.body }
function errorCode(result) { return result?.body?.error?.code ?? result?.body?.code ?? result?.body?.errorCode }
function statusError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; throw error }
async function exactFile(projectId, id) {
  const response = await coreRequest('GET', `/projects/${encodeURIComponent(projectId)}/file-records/${encodeURIComponent(id)}/content`)
  assert.equal(response.status, 200)
  return response.body
}
function clone(value) { return structuredClone(value) }
function parentWire(slice) { return slice.parentId ?? '' }

const providerEnv = ['LCOS_CODEX_AUTO_EXECUTION', 'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT',
  'LCOS_INTELLIGENCE_PROVIDERS', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY',
  'GEMINI_BASE_URL', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_API_KEY',
  'GROQ_BASE_URL', 'GROQ_API_KEY', 'MISTRAL_BASE_URL', 'MISTRAL_API_KEY', 'XAI_BASE_URL', 'XAI_API_KEY',
  'QWEN_BASE_URL', 'DASHSCOPE_API_KEY', 'ZHIPU_BASE_URL', 'ZHIPU_API_KEY', 'MOONSHOT_BASE_URL',
  'SILICONFLOW_BASE_URL', 'SILICONFLOW_API_KEY', 'MINIMAX_BASE_URL', 'HUNYUAN_BASE_URL', 'BEDROCK_API_KEY',
  'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'LMSTUDIO_BASE_URL', 'LCOS_BRIDGE_URL']

try {
  for (const key of providerEnv) delete process.env[key]
  process.env.LCOS_RECOVERY_TRANSPORT = 'none'
  process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'
  process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
  process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
  assert.equal(activeLoopbackOrigins().size, 0, 'history adapter test must not inherit a server listener')
  installFetchBoundary()

  const ownersEntry = path.join(runtimeRoot, 'native-collection-space-history-test-owners.ts')
  await writeFile(ownersEntry, [
    `export { startSurfaceCoreFacade } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/surface-core-facade.ts')))}`,
    `export { Gen2Host } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lcos/apps/web-gen2/src/host/projectionFacade.ts')))}`,
    `export { HttpClient } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lcos/apps/web-gen2/src/backend/client.ts')))}`,
    `export { CoreArtifactClient } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lcos/apps/web-gen2/src/backend/artifacts.ts')))}`,
    `export { createHeadlessProjectionPort } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/headless-projection-port.ts')))}`,
    `export { createNativeCollectionSpace } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/native-collection-space.ts')))}`,
    `export { createNativeCollectionSpaceHistory } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/native-collection-space-history.ts')))}`,
    `export { createNativeCollectionMerge } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/native-collection-merge.ts')))}`,
    `export { createNativePileCollectionProjection } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/native-pile-collection-projection.ts')))}`,
    `export { createNodeLifecycle } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/node-lifecycle.ts')))}`,
  ].join('\n'), 'utf8')
  const ownersBundle = path.join(runtimeRoot, 'native-collection-space-history-test-owners.mjs')
  await buildPilotEntry(path.relative(root, ownersEntry), ownersBundle)
  const owners = await import(pathToFileURL(ownersBundle).href)

  bootstrapping = true
  facade = await owners.startSurfaceCoreFacade({ runtimeRoot, fullIntegration: true })
  coreOrigin = String(facade.core.origin)
  repository = facade.core.repository
  assert.match(coreOrigin, /^http:\/\/127\.0\.0\.1:\d+$/)
  assert.equal(blockedPorts.has(new URL(coreOrigin).port), false)
  coreOrigins.add(coreOrigin)
  assert.deepEqual([...activeLoopbackOrigins()], [coreOrigin])
  report.network.activeListeners.push(coreOrigin)
  bootstrapping = false

  const projectId = String(facade.core.projectId)
  const workspace = facade.workspaces.find(row => row.preferredSurface === 'main')
  const rootScope = repository.getScopes(projectId).find(row => row.kind === 'root')
  assert.ok(workspace?.canvasId && rootScope)
  const canvasId = String(workspace.canvasId)
  const hosts = new Map()
  const projectionHost = targetCanvas => {
    if (targetCanvas !== canvasId) throw new Error('This test factory exposes only its one fresh synthetic Canvas.')
    let host = hosts.get(targetCanvas)
    if (!host) {
      host = new owners.Gen2Host({ projectId, http: new owners.HttpClient({ baseUrl: coreOrigin }),
        rfs: owners.createHeadlessProjectionPort({ canvasId, coreOrigin, read: facade.spatial.read, execute: facade.spatial.execute }) })
      hosts.set(targetCanvas, host)
    }
    return host
  }
  const host = projectionHost(canvasId)
  const artifacts = new owners.CoreArtifactClient(new owners.HttpClient({ baseUrl: coreOrigin }))
  const body = '这段合成材料用于原 O8 空间历史回归，不属于真实项目内容。\nCOLLECTION_SPACE_HISTORY_TEXT_TAIL_雪'
  const text = await artifacts.createTextArtifact(projectId, { title: 'Native Collection history fixture', body, scopeId: String(rootScope.id) })
  const makeCollection=async(title,members)=>{
    const made=await coreRequest('POST',`/projects/${projectId}/collections`,{title,members})
    assert.equal(made.status,201,JSON.stringify(made.body));const id=String(made.body.value.id)
    const received=await coreRequest('POST',`/projects/${projectId}/assembly/apply`,{schemaVersion:1,projectId,sourceRefs:[{kind:'collection',id}],targetRef:{kind:'main'}})
    assert.equal(received.status,200,JSON.stringify(received.body))
    const projected=await facadeCall('POST',`/api/lcos/canvases/${canvasId}/collections:project`,{collectionId:id})
    assert.equal(projected.status,200,JSON.stringify(projected.body));return{id,nodeId:valueOf(projected).binding.spatialId}
  }
  const source=await makeCollection('Source',[{type:'artifact',id:text.artifactId}])
  const target=await makeCollection('Target',[])
  const projected=await host.projectArtifacts([{projectId,artifactId:String(text.artifactId),kind:'text',title:text.title,fileRecordId:String(text.fileRecordId),currentRevisionId:String(text.revisionId),mimeType:'text/markdown',size:{width:260,height:180}}])
  const memberId=projected[0].spatialId
  if(process.env.MERGE_OPEN_SOURCE==='1'){
    const space=owners.createNativeCollectionSpace({repository,projectId,spatial:facade.spatial,projectionHost,fail:statusError})
    await space.apply({canvasId,collectionId:source.id,collectionNodeId:source.nodeId,expectedVersion:(await facade.spatial.read(canvasId)).version})
    if(process.env.MERGE_OPEN_TARGET==='1')await space.apply({canvasId,collectionId:target.id,collectionNodeId:target.nodeId,expectedVersion:(await facade.spatial.read(canvasId)).version})
  }
  const native=owners.createNativePileCollectionProjection({repository,projectId,spatial:facade.spatial,fail:statusError})
  const sourceDomain=clone(repository.getCollection(source.id)),targetDomain=clone(repository.getCollection(target.id))
  const sourceMembers=clone(repository.listCollectionMemberships(projectId,source.id))
  const artifactBefore=clone(repository.getArtifact(text.artifactId)),fileBefore=await exactFile(projectId,String(text.fileRecordId))
  const runsBefore=repository.getProjectRuns(projectId,100).length
  const projectNativeNodes=async(canvas,snapshot)=>{
    const live=valueOf(await facadeCall('GET',`/api/canvas/v1/canvases/${canvas}`))
    return snapshot.state.nodes.map(n=>native.node(canvas,n,snapshot.state.nodes)??{...live.nodes.find(v=>v.id===n.id),position:clone(n.position),parent_id:n.parentId??''})
  }
  const merge=owners.createNativeCollectionMerge({repository,projectId,spatial:facade.spatial,projectNativeNodes,fail:statusError})
  const plan=await merge.prepare({canvasId,sourceCollectionId:source.id,targetCollectionId:target.id})
  const operation={version:1,operationId:'merge-'+randomUUID(),kind:'collection-merge',phase:'apply',merge:plan.merge}
  const actions=(undo=false)=>{
    const from=new Map((undo?plan.after_nodes:plan.before_nodes).map(n=>[n.id,n]))
    const to=new Map((undo?plan.before_nodes:plan.after_nodes).map(n=>[n.id,n]));const result=[]
    const deletes=[...from.keys()].filter(id=>!to.has(id));if(deletes.length)result.push({action:'delete',delete_ids:deletes})
    // The actual donor PC update serializer omits canvas_id; r6's envelope
    // carries it. Its create serializer includes canvas_id explicitly.
    const wire=(n,create)=>Object.fromEntries(['id','type',...(create?['canvas_id']:[]),'position','parent_id','measured','data'].filter(k=>n[k]!==undefined).map(k=>[k,n[k]]))
    const creates=[...to.values()].filter(n=>!from.has(n.id)).map(n=>wire(n,true));if(creates.length)result.push({action:'create',creates})
    const updates=[...to.values()].filter(n=>from.has(n.id)&&JSON.stringify(n)!==JSON.stringify(from.get(n.id))).map(n=>wire(n,false));if(updates.length)result.push({action:'update',updates})
    return clone(result)
  }
  const sandbox={window:{},structuredClone,crypto:globalThis.crypto,console,setTimeout,clearTimeout}
  vm.runInNewContext(fs.readFileSync(path.join(root,'lab/startup-history-intent.js'),'utf8'),sandbox)
  const intent=sandbox.window.__LCOS_NATIVE_INTENT__
  const normalize=values=>values.map(n=>({...clone(n),width:n.width??n.measured.width,height:n.height??n.measured.height,parentId:n.parent_id||undefined}))
  const originalCanvas=valueOf(await facadeCall('GET',`/api/canvas/v1/canvases/${canvasId}`))
  const beforeById=new Map(normalize(plan.before_nodes).map(n=>[n.id,n])),afterById=new Map(normalize(plan.after_nodes).map(n=>[n.id,n]))
  const fullDto=await projectNativeNodes(canvasId,await facade.spatial.read(canvasId))
  const beforeState=normalize(fullDto)

  const afterState=beforeState.flatMap(n=>beforeById.has(n.id)?(afterById.has(n.id)?[{...n,...afterById.get(n.id)}]:[]):[n])
  const changesFor=(from,to)=>{
    const fm=new Map(from.map(n=>[n.id,n])),tm=new Map(to.map(n=>[n.id,n])),out=[]
    for(const [id,n]of fm)if(!tm.has(id))out.push({id,type:'remove'});else if(JSON.stringify(n)!==JSON.stringify(tm.get(id)))out.push({id,type:'replace',item:clone(tm.get(id))})
    for(const [id,n]of tm)if(!fm.has(id))out.push({type:'add',item:clone(n)})
    return out
  }
  const itemsFor=(changes,from)=>changes.map(c=>{const n=c.item??from.find(n=>n.id===c.id),meta=intent.metadata(c);return{id:n.id,type:n.type,operationType:{remove:'delete',add:'create',replace:'update'}[c.type],
    ...(c.type==='remove'?{}:{data:clone(n.data),position:clone(n.position),parentId:n.parentId??'',dimensions:{width:n.width,height:n.height}}),...meta}})
  assert.equal(intent.queueCollectionMergeIntent({canvasId,operation,beforeNodes:beforeState,afterNodes:afterState}).ok,true)
  const applyChanges=changesFor(beforeState,afterState)
  intent.tagChanges(applyChanges,id=>beforeState.find(n=>n.id===id),canvasId)
  const applyItems=itemsFor(applyChanges,beforeState)
  for(const item of applyItems)assert.deepEqual(clone(item.lcos_operation),operation,
    'the actual O8 port must not leak pending-map canvasId/collectionMergePlan fields into the exact Core intent')
  assert.equal(intent.partitionOperations(applyItems).length,1,'one original save group owns source removal plus target membership')
  const entry={state:{nodes:afterState},...intent.recordHistoryTransition(canvasId,{nodes:beforeState},{nodes:afterState})}
  assert.equal(entry.lcos_history_operations.length,1,'metadata is carried inside the existing O8 entry')
  assert.equal(entry.lcos_history_operations[0].lcos_intent_unsupported,undefined)
  const remap=new Map([[source.nodeId,'wrong-new-id']])
  assert.equal(intent.normalizeCollectionSpaceRedoRemaps(remap,entry,'undo',canvasId,afterState,beforeState),true)
  assert.equal(remap.size,0,'original Undo restores exact source identity')
  const undoChanges=changesFor(afterState,beforeState)
  intent.withHistoryEntry(canvasId,'undo',entry,remap,()=>intent.tagChanges(undoChanges,id=>afterState.find(n=>n.id===id),canvasId))
  const undoItems=itemsFor(undoChanges,afterState)
  intent.tagHistoryBatchOperations(canvasId,'undo',entry,remap,undoChanges,undoItems)
  assert.equal(intent.partitionOperations(undoItems).length,1,'original Undo lifecycle and updates stay one group')
  const redoChanges=changesFor(beforeState,afterState),redoItems=itemsFor(redoChanges,beforeState)
  intent.withHistoryEntry(canvasId,'redo',entry,new Map(),()=>intent.tagChanges(redoChanges,id=>beforeState.find(n=>n.id===id),canvasId))
  intent.tagHistoryBatchOperations(canvasId,'redo',entry,new Map(),redoChanges,redoItems)
  assert.equal(intent.partitionOperations(redoItems).length,1,'original Redo stays one operation')
  assert.throws(()=>intent.partitionOperations(applyItems.slice(1)),/split or incomplete/,'partial merge cannot reach persistence')
  const bridgeText=fs.readFileSync(path.join(root,'lab/startup-node-bridge.js'),'utf8').replace(/^import .+;\r?\n/gm,'').replaceAll('export function ','function ')
  for(const stale of [false,'content','sub-cent-position','different-persisted-position']){
    const bridgeWindow={};vm.runInNewContext(fs.readFileSync(path.join(root,'lab/startup-history-intent.js'),'utf8'),{window:bridgeWindow,structuredClone,crypto:globalThis.crypto,console,setTimeout,clearTimeout})
    // React Flow retains unrounded drag coordinates; donor r6/DC saves two
    // decimals. This reproduces the real mouse-drop rejection, without hiding
    // a genuinely later edit (even one below the persisted precision).
    let raw=clone(beforeState).map(n=>({...n,position:{...n.position,x:n.position.x+0.00001}})),entry,flushes=0,writes=0
    if(stale==='different-persisted-position')raw.find(n=>n.id===source.nodeId).position.x+=0.01
    const targetLivePosition=clone(raw.find(n=>n.id===target.nodeId).position)
    const uiOwner={},api={getNodes:()=>raw,getEdges:()=>[],setNodes(next){writes++;const changes=changesFor(raw,next);bridgeWindow.__LCOS_NATIVE_INTENT__.tagChanges(changes,id=>raw.find(n=>n.id===id),canvasId);entry=bridgeWindow.__LCOS_NATIVE_INTENT__.recordHistoryTransition(canvasId,{nodes:raw},{nodes:next});raw=next}}
    const factory=new Function('window','crypto',bridgeText+';return createCollectionCarrierControls;')(bridgeWindow,globalThis.crypto)
    const controls=factory({api,ownerApi:uiOwner,getHost:()=>({api:uiOwner,projectId,currentCanvasId:canvasId}),prepareHistory:()=>({ok:true}),
      readOriginalNodes:()=>raw,normalizeNodes:normalize,flushCanvas:async()=>{flushes++;return'saved'},inspectHistory:()=>({currentEntry:{operations:(entry?.lcos_history_operations||[]).map(a=>({operation:a.lcos_operation}))}}),
      request:async address=>{assert.equal(address,`/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections/${encodeURIComponent(target.id)}/space:merge-prepare?sourceCollectionId=${encodeURIComponent(source.id)}`)
        if(stale==='content')raw=raw.map(n=>n.id===memberId?{...n,data:{...n.data,content:'UNSAVED USER EDIT'}}:n)
        if(stale==='sub-cent-position')raw=raw.map(n=>n.id===memberId?{...n,position:{...n.position,y:n.position.y+0.00001}}:n)
        return{ok:true,json:async()=>({code:0,data:plan})}}})
    const result=await controls.mergeCollectionSpace({projectId,canvasId,workspaceId:String(workspace.id),collectionId:target.id,nodeId:target.nodeId,sourceCollectionId:source.id,sourceNodeId:source.nodeId},{isCurrent:()=>true})
    assert.equal(result.ok,!stale,result.reason)
    assert.equal(writes,stale?0:1,'one original setNodes or no write on a late user edit')
    if(stale==='content')assert.equal(raw.find(n=>n.id===memberId).data.content,'UNSAVED USER EDIT')
    else if(!stale){assert.equal(flushes,2);assert.equal(raw.some(n=>n.id===source.nodeId),false);assert.equal(entry.lcos_history_operations.length,1)
      assert.deepEqual(raw.find(n=>n.id===target.nodeId).position,targetLivePosition,'merge preserves exact live geometry when the persisted position is unchanged')}
  }
  const snapshot=await facade.spatial.read(canvasId),originalOther=clone(snapshot.state.nodes.find(n=>n.id===memberId))
  const foreignUpdate=actions();foreignUpdate.find(a=>a.action==='update').updates[0].canvas_id='foreign-canvas'
  await assert.rejects(()=>merge.applyOperation({canvasId,expectedVersion:snapshot.version,operation,actions:foreignUpdate}),/differs from its exact plan/)
  await assert.rejects(()=>merge.applyOperation({canvasId,expectedVersion:snapshot.version,operation:{...operation,merge:{...plan.merge,workspaceId:'wrong'}},actions:actions()}),/identity changed|belong|Merge identity/)
  assert.equal((await facade.spatial.read(canvasId)).version,snapshot.version)
  const forged=clone(operation);forged.merge.nativeAfter.find(n=>n.id===target.nodeId).data.title='forged title'
  const forgedActions=actions();forgedActions.find(a=>a.action==='update').updates.find(n=>n.id===target.nodeId).data.title='forged title'
  await assert.rejects(()=>merge.applyOperation({canvasId,expectedVersion:snapshot.version,operation:forged,actions:forgedActions}),/differs from the real Core projection/)
  const applied=await merge.applyOperation({canvasId,expectedVersion:snapshot.version,operation,actions:actions()})
  assert.equal(applied.merged,true)
  assert.equal(repository.findProjectionBinding(projectId,canvasId,'node','collection',source.id),undefined)
  assert.equal((await facade.spatial.read(canvasId)).state.nodes.some(n=>n.id===source.nodeId),false)
  assert.deepEqual(repository.getCollection(source.id),sourceDomain);assert.deepEqual(repository.getCollection(target.id),targetDomain)
  assert.deepEqual(repository.listCollectionMemberships(projectId,source.id),sourceMembers)
  assert.equal(repository.listCollectionMemberships(projectId,target.id).length,1)
  if(process.env.MERGE_OPEN_SOURCE!=='1')assert.deepEqual((await facade.spatial.read(canvasId)).state.nodes.find(n=>n.id===memberId),originalOther)
  else assert.deepEqual((await facade.spatial.read(canvasId)).state.nodes.find(n=>n.id===memberId).data,originalOther.data,'source frame member keeps authored data while original owner reparents it')
  const repeated=await merge.applyOperation({canvasId,expectedVersion:applied.to_version,operation,actions:actions()})
  assert.equal(repeated.idempotent,true)
  const auditCount=repository.listMutationChangeSets(projectId,1000).length
  const undone=await merge.applyOperation({canvasId,expectedVersion:applied.to_version,operation:{...operation,phase:'undo'},actions:actions(true)})
  assert.equal(undone.merged,false)
  assert.equal(repository.findProjectionBinding(projectId,canvasId,'node','collection',source.id).spatialId,source.nodeId)
  assert.equal(repository.listCollectionMemberships(projectId,target.id).length,0)
  const redone=await merge.applyOperation({canvasId,expectedVersion:undone.to_version,operation:{...operation,phase:'redo'},actions:actions()})
  assert.equal(redone.merged,true)
  assert.equal(repository.listMutationChangeSets(projectId,1000).length,auditCount+2)
  const repeatedUndo=await merge.applyOperation({canvasId,expectedVersion:redone.to_version,operation:{...operation,phase:'undo'},actions:actions(true)})
  assert.equal(repeatedUndo.merged,false)
  const a=await coreRequest('POST',`/projects/${projectId}/collections/${target.id}/members`,{memberType:'artifact',memberId:text.artifactId})
  assert.equal(a.status,200,JSON.stringify(a.body))
  await assert.rejects(()=>merge.applyOperation({canvasId,expectedVersion:repeatedUndo.to_version,operation:{...operation,phase:'redo'},actions:actions()}),/later work is preserved/)
  assert.deepEqual(repository.getArtifact(text.artifactId),artifactBefore)
  assert.deepEqual(await exactFile(projectId,String(text.fileRecordId)),fileBefore)
  assert.deepEqual(repository.getCollection(source.id),sourceDomain)
  assert.equal(repository.getProjectRuns(projectId,100).length,runsBefore)
  for(const failureSide of ['before','after']){
    const failureSource=await makeCollection('Unknown source '+failureSide,[{type:'artifact',id:text.artifactId}]),failureTarget=await makeCollection('Unknown target '+failureSide,[])
    const recoveryPlan=await merge.prepare({canvasId,sourceCollectionId:failureSource.id,targetCollectionId:failureTarget.id})
    const op={version:1,operationId:'merge-unknown-'+randomUUID(),kind:'collection-merge',phase:'apply',merge:recoveryPlan.merge}
    const beforeMap=new Map(recoveryPlan.before_nodes.map(n=>[n.id,n])),afterMap=new Map(recoveryPlan.after_nodes.map(n=>[n.id,n]))
    const update=clone(afterMap.get(failureTarget.nodeId));const wire=Object.fromEntries(['id','type','canvas_id','position','parent_id','measured','data'].filter(k=>update[k]!==undefined).map(k=>[k,update[k]]))
    const rawActions=[{action:'delete',delete_ids:[failureSource.nodeId]},{action:'update',updates:[wire]}]
    let executes=0
    const unreliable=owners.createNativeCollectionMerge({repository,projectId,projectNativeNodes,fail:statusError,spatial:{withCanvasLock:(id,work)=>facade.spatial.withCanvasLock(id,locked=>work({read:()=>locked.read(),execute:async commands=>{
      executes++;if(failureSide==='before')throw new Error('Simulated transport lost before spatial commit')
      await locked.execute(commands);throw new Error('Simulated successful spatial reply lost')
    }}))}})
    const auditBefore=repository.listMutationChangeSets(projectId,1000).length
    await assert.rejects(()=>unreliable.applyOperation({canvasId,expectedVersion:recoveryPlan.source_version,operation:op,actions:rawActions}),/Simulated/)
    assert.equal(executes,1,'unknown write is not automatically repeated')
    const readback=await facade.spatial.read(canvasId)
    assert.equal(readback.state.nodes.some(n=>n.id===failureSource.nodeId),failureSide==='before')
    assert.equal(repository.listCollectionMemberships(projectId,failureTarget.id).length,0,'a missing spatial reply does not claim a Core merge')
    assert.ok(repository.findProjectionBinding(projectId,canvasId,'node','collection',failureSource.id),'source binding stays until confirmed deletion')
    const recovered=await merge.applyOperation({canvasId,expectedVersion:readback.version,operation:op,actions:rawActions})
    assert.equal(recovered.merged,true)
    assert.equal(repository.listMutationChangeSets(projectId,1000).length,auditBefore+1,'explicit same-intent recovery commits Core only once')
    const auditAfter=repository.listMutationChangeSets(projectId,1000).length
    const checked=await merge.applyOperation({canvasId,expectedVersion:recovered.to_version,operation:op,actions:rawActions})
    assert.equal(checked.idempotent,true);assert.equal(repository.listMutationChangeSets(projectId,1000).length,auditAfter)
    assert.ok(repository.getCollection(failureSource.id));assert.equal(repository.getProjectRuns(projectId,100).length,runsBefore)
  }
  report.cases=['real Core Collection/Assembly/projector setup','read-only prepare','original O8 queue/tag/partition + Undo/Redo exact identity; partial batch refused','source-executed bridge uses one original setNodes+history/flush; late editor changes rejected','wrong identity and forged native content refused before mutation','lost spatial reply before/after commit does not replay; explicit same-intent readback recovery commits Core once','Apply keeps source domain and source members, flattens target members, removes only source Canvas carrier/binding','idempotent retry','real Undo/Redo restores same source NodeID/binding and exact target relation changes','later user membership prevents unsafe replay','unrelated material node/Artifact/FileRecord and Runs preserved']
  report.passed=true
} catch (error) {
  report.failure = { message: error instanceof Error ? error.message : String(error), stack: error?.stack }
  process.exitCode = 1
} finally {
  if (facade) {
    try { await facade.close(); report.cleanup.facadeClosed = true }
    catch (error) { report.cleanup.closeError = error instanceof Error ? error.message : String(error) }
  }
  report.network.activeListenersAtClose = [...activeLoopbackOrigins()]
  report.cleanup.listenersReleased = report.network.activeListenersAtClose.length === 0
  globalThis.fetch = originalFetch
  const resolvedRuntime = path.resolve(runtimeRoot)
  try {
    assertContained(reportRoot, resolvedRuntime)
    if (report.cleanup.facadeClosed && report.cleanup.listenersReleased) {
      await rm(resolvedRuntime, { recursive: true, force: true })
      report.cleanup.runtimeRemoved = true
    }
  } catch (error) {
    report.cleanup.removalError = error instanceof Error ? error.message : String(error)
    process.exitCode = 1
    report.passed = false
  }
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
}

console.log(JSON.stringify(report, null, 2))
