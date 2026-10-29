import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root, readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs'
import { createNativeCoreMixedScopeContinuationTransforms } from '../lab/native-core-mixed-scope-continuation-transform.mjs'
import { createNativeCoreMixedScopeManifestTransforms } from '../lab/native-core-mixed-scope-manifest-transform.mjs'
import { createNativeCoreLiveContinuationTransforms } from '../lab/native-core-live-continuation-transform.mjs'

const root=process.cwd()
const output=path.join(root,'output/混合Scope取用_20261022/原续聊来源与目标身份',new Date().toISOString().replaceAll(':','-'))
await fs.mkdir(output,{recursive:true})
await fs.mkdir(path.join(root,'.runtime'),{recursive:true})
const runtimeRoot=await fs.mkdtemp(path.join(root,'.runtime/live-continuation-ownership-'))
const report={passed:false,checks:[],transport:'Controlled in-process transport; actual original adapter/service/SQLite/import owner.',modelRequests:0,runDispatches:0,networkRequests:0,guiVerified:false}
const checks=message=>report.checks.push(message)
const originalFetch=globalThis.fetch
globalThis.fetch=async()=>{report.networkRequests++;throw new Error('Network forbidden in ownership regression.')}
let metadata,importer
try {
  const live=createNativeCoreLiveContinuationTransforms()
  const mixed={...createNativeCoreMixedScopeContinuationTransforms(),...createNativeCoreMixedScopeManifestTransforms()}
  for(const [relative,transform] of Object.entries(live)) {
    const sourcePath=path.join(root,relative)
    for(const variant of ['copied','adopted']) {
      let source=variant==='adopted'?(readCurrentGen2Resource(sourcePath)?.contents??await fs.readFile(sourcePath,'utf8')):await fs.readFile(sourcePath,'utf8')
      if(mixed[relative])source=mixed[relative](source,{sourcePath})
      const changed=transform(source,{sourcePath})
      assert.notEqual(source,changed);assert.equal(transform(changed,{sourcePath}),changed)
      assert.throws(()=>transform(source,{sourcePath:path.join(root,'wrong.ts')}))
    }
  }
  checks('Ten exact source transforms compose after mixed Scope, cover copied/adopted originals, are idempotent and refuse unrelated sources.')
  const prefix=path.relative(output,root).replaceAll('\\','/')+'/'
  const sources=[
    ['ConversationContinuationService,RecoveryActionUnsupportedError','lcos/apps/local-core/src/conversation-continuation-service.ts'],
    ['SqliteMetadataRepository','lcos/apps/local-core/src/metadata-repository.ts'],
    ['ProjectEventHub','lcos/apps/local-core/src/project-events/project-event-hub.ts'],
    ['ReceiverRuntimeService','lcos/apps/local-core/src/receiver-runtime-service.ts'],
    ['ConversationImportService','lcos/apps/local-core/src/conversation-import-service.ts'],
    ['ConversationIdentityService','lcos/apps/local-core/src/conversation-identity-service.ts'],
    ['CollaborationProjectionService','lcos/apps/local-core/src/collaboration-projection-service.ts'],
    ['AcpAgentClient','lcos/huabu/external/agenetes/packages/acp-driver/src/client.ts'],
    ['acpSessionRegistry','lcos/huabu/external/agenetes/packages/acp-driver/src/session-registry.ts'],
    ['HuabuAgentletContinuationAdapterV1','lcos/apps/local-core/src/huabu-agentlet-continuation-adapter.ts'],
    ['HuabuAgentletHostTransportV1','lcos/apps/local-core/src/huabu-agentlet-host-transport.ts'],
    ['createMvpSampleSnapshot','lcos/apps/local-core/src/mvp-sample-project.ts'],
  ]
  const entry=path.join(output,'actual-owners.ts')
  await fs.writeFile(entry,sources.map(([names,relative])=>'export {'+names+'} from '+JSON.stringify(prefix+relative)).join('\n'))
  await buildPilotEntry(path.relative(root,entry),path.join(output,'actual-owners.mjs'),'node',{coreMixedScopeContext:true,coreLiveContinuation:true})
  const owners=await import(pathToFileURL(path.join(output,'actual-owners.mjs')).href)
  const {SqliteMetadataRepository,ProjectEventHub,ReceiverRuntimeService,ConversationImportService,ConversationContinuationService,HuabuAgentletContinuationAdapterV1,HuabuAgentletHostTransportV1,RecoveryActionUnsupportedError,createMvpSampleSnapshot}=owners
  const db=path.join(runtimeRoot,'metadata.sqlite'),now='2026-10-22T15:00:00.000Z'
  metadata=new SqliteMetadataRepository(db)
  const graph=createMvpSampleSnapshot(path.join(runtimeRoot,'project'),now);metadata.save(graph)
  const pid=String(graph.project.id),scopeId=String(graph.scopes[0].id),events=new ProjectEventHub()
  let service=new ConversationContinuationService(metadata,events)
  const receiver=new ReceiverRuntimeService(metadata,events)
  importer=new ConversationImportService(metadata,{stagingRoot:path.join(runtimeRoot,'imports'),ollamaUrl:'http://127.0.0.1:1'})
  const manual=await importer.importManual(pid,{title:'必须保留的原手工历史',scopeId,entries:[
    {role:'user',contentText:'原始问题：逐字不变。',createdAt:now},
    {role:'assistant',contentText:'原始回答：没有被冒充为新会话。',createdAt:now},
  ]})
  const source=receiver.connectConversation({projectId:pid,provider:'codex',executorId:'local-audit',conversationRef:'manual-source-native-ref',label:'原来源'})
  metadata.linkConnectedConversationSession(pid,source.id,manual.session.id)
  const secondSource=receiver.connectConversation({projectId:pid,provider:'codex',executorId:'local-audit',conversationRef:'second-source-native-ref',label:'第二来源'})
  const sourcePath=path.join(graph.project.rootPath,'.creative-os/conversations',manual.session.id,'manual-conversation.jsonl')
  const snapshotSource=async()=>({
    connected:metadata.getConnectedConversation(pid,source.id),
    identity:metadata.getConversationSessionRuntimeIdentity(pid,manual.session.id),
    // Project-wide semanticIndex.updatedAt is computed at read time; retain every canonical history field.
    projection:(({semanticIndex,...canonicalHistory})=>canonicalHistory)(importer.getProjection(pid,manual.session.id)),
    messages:importer.getMessages(manual.session.id,{limit:500000}),
    sourceBytes:(await fs.readFile(sourcePath)).toString('base64'),
  })
  const before=await snapshotSource()
  const assertSource=async()=>assert.deepEqual(await snapshotSource(),before)
  assert.equal(before.projection.session.sourceKind,'manual')
  assert.equal(before.messages.length,2)
  const calls=[]
  const sessions=new Map()
  let nextCreateExternal,nextResumeExternal,nextResumeTransport,nextThrow,pauseCreate
  const transport={
    kind:'local-ownership-audit',
    async spawn(input) {
      calls.push(structuredClone(input))
      if(nextThrow){const error=nextThrow;nextThrow=undefined;throw new Error(error)}
      if(input.externalSessionId!==undefined) return {
        sessionId:nextResumeTransport??input.sessionId,
        transportSessionId:nextResumeTransport??input.sessionId,
        externalSessionId:nextResumeExternal??input.externalSessionId,pid:4242,cwd:runtimeRoot,loaded:true,
      }
      if(pauseCreate)await pauseCreate.promise
      const externalSessionId=nextCreateExternal??'native-'+input.threadId
      const transportSessionId='transport-'+input.threadId
      nextCreateExternal=undefined
      const result={sessionId:transportSessionId,transportSessionId,externalSessionId,pid:4242,cwd:runtimeRoot}
      sessions.set(transportSessionId,{...result,threadId:input.threadId,status:'running'})
      return result
    },
    async list(){return {agents:[...sessions.values()]}},
    async getSession(_agentlet,id){return sessions.get(id)},
    async stop(){return {stopped:true}},
    async sendResource(){throw new Error('Raw send forbidden')},
    async sendPrompt(){report.modelRequests++;throw new Error('Model send forbidden')},
    async probe(){return {session:{}}},
  }
  const adapter=new HuabuAgentletContinuationAdapterV1(transport,{agentletId:'local-owned-agentlet',adapterId:'ownership-audit'})
  const input=(operationId,mode='blank_new',sourceId=source.id,extra={})=>({
    schemaVersion:1,operationId,projectId:pid,...(sourceId===null?{}:{connectedConversationId:sourceId}),
    mode,contextInheritance:mode==='blank_new'?'blank':'inherit',checkout:'shared',provider:'codex',...extra,
  })
  const action=async(op,kind)=>{const current=service.read(pid,op);return service.executeRecoveryAction(pid,op,kind,adapter,current.revision)}
  const bound=[]
  for(const mode of ['blank_new','selected_context','native_full_fork']){
    const request=input('new-'+mode,mode,source.id,mode==='selected_context'?{orderedReferences:[{order:0,mode:'full',ref:{type:'scope',scopeId}}]}:{})
    let operation=service.submit(request).projection
    assert.equal(operation.requestConnectedConversationId,source.id)
    assert.match(operation.runtimeThreadId,/^core-continuation-/)
    assert.notEqual(operation.runtimeThreadId,'core-conversation-'+source.id)
    assert.equal(service.submit(request).created,false)
    for(const changed of [
      {connectedConversationId:secondSource.id},{runtimeThreadId:'different-thread'},{checkout:'isolated'},
      {mode:'continue_existing'},{contextInheritance:mode==='blank_new'?'inherit':'blank'},
      {orderedReferences:[{order:0,mode:'full',ref:{type:'scope',scopeId:'different-scope'}}]},
    ])assert.throws(()=>service.submit({...request,...changed}),/conflict/i)
    const start=calls.length
    operation=await action(operation.operationId,'recover_external')
    assert.equal(operation.steps.external_create,'confirmed')
    assert.equal(calls.length,start+1)
    operation=await action(operation.operationId,'recover_bind')
    assert.equal(operation.steps.core_bind,'confirmed')
    assert.notEqual(operation.connectedConversationId,source.id)
    assert.equal(operation.requestConnectedConversationId,source.id)
    const target=metadata.getConnectedConversation(pid,operation.connectedConversationId)
    assert.notEqual(target.conversationSessionId,manual.session.id)
    assert.notEqual(target.conversationRef,source.conversationRef)
    assert.equal(calls.length,start+2)
    assert.equal(calls[start].externalSessionId,undefined)
    assert.equal(calls[start+1].externalSessionId,operation.externalEvidence.externalSessionId)
    assert.equal(calls[start+1].threadId,operation.runtimeThreadId)
    assert.equal(service.submit(request).created,false)
    assert.equal(service.submit(request).projection.connectedConversationId,target.id)
    assert.throws(()=>service.submit({...request,connectedConversationId:secondSource.id}),/conflict/i)
    await assertSource()
    bound.push({request,operation,target})
  }
  assert.equal(new Set(bound.map(item=>item.operation.runtimeThreadId)).size,3)
  assert.equal(new Set(bound.map(item=>item.target.conversationSessionId)).size,3)
  checks('blank_new / selected_context / native_full_fork use fresh threads, Connected IDs and canonical sessions; original manual history, metadata, message bytes and raw archive stay exactly unchanged. Original source/refs/mode/checkout/thread idempotency survives bind.')

  const noSource=input('new-without-source','blank_new',null)
  let without=service.submit(noSource).projection
  assert.equal(without.requestConnectedConversationId,null)
  without=await action(without.operationId,'recover_external');without=await action(without.operationId,'recover_bind')
  assert.equal(without.steps.core_bind,'confirmed');assert.equal(service.submit(noSource).created,false)
  assert.equal(service.submit(noSource).projection.requestConnectedConversationId,null)
  const trusted=bound[0].target
  importer.appendContinuationTurn(pid,trusted.conversationSessionId,{messageId:'owned-existing-turn',userText:'既有原生用户消息',assistantText:'既有原生助手消息',occurredAt:now})
  const trustedMessages=importer.getMessages(trusted.conversationSessionId,{limit:500000})
  const resumeRequest=input('resume-owned','continue_existing',trusted.id)
  let resumed=service.submit(resumeRequest).projection
  assert.equal(resumed.runtimeThreadId,bound[0].operation.runtimeThreadId)
  const resumeCalls=calls.length
  resumed=await action(resumed.operationId,'recover_external');resumed=await action(resumed.operationId,'recover_bind')
  assert.equal(resumed.steps.core_bind,'confirmed')
  assert.equal(resumed.connectedConversationId,trusted.id)
  assert.equal(metadata.getConnectedConversation(pid,trusted.id).conversationSessionId,trusted.conversationSessionId)
  assert.equal(calls.length,resumeCalls+2)
  assert(calls.slice(resumeCalls).every(call=>call.externalSessionId===trusted.conversationRef&&call.sessionId&&call.threadId===resumed.runtimeThreadId))
  assert.deepEqual(importer.getMessages(trusted.conversationSessionId,{limit:500000}),trustedMessages)
  assert.equal(service.submit(resumeRequest).created,false)
  checks('A trusted original Core/provider identity resumes its exact external session/transport/thread and keeps canonical history; continue_existing never calls create. A source-less new request keeps null request identity through bind.')

  const absent=service.submit(input('resume-unproven','continue_existing')).projection
  const noCall=calls.length
  await assert.rejects(()=>action(absent.operationId,'recover_external'),error=>error instanceof RecoveryActionUnsupportedError)
  assert.equal(calls.length,noCall)
  assert.equal(service.read(pid,absent.operationId).steps.external_create,'not_started')
  const mismatchThread=service.submit(input('resume-wrong-thread','continue_existing',trusted.id,{runtimeThreadId:'unrelated-thread'})).projection
  await assert.rejects(()=>action(mismatchThread.operationId,'recover_external'),error=>error instanceof RecoveryActionUnsupportedError)
  assert.equal(calls.length,noCall)
  assert.equal(service.read(pid,mismatchThread.operationId).steps.external_create,'not_started')
  checks('Imported/manual history without authoritative runtime identity and an explicit wrong thread fail unsupported before claiming a provider side effect; no substitute session/create or stuck pending operation.')

  nextCreateExternal=source.conversationRef
  let reused=service.submit(input('new-must-not-rebind-source')).projection
  reused=await action(reused.operationId,'recover_external')
  assert.equal(reused.steps.external_create,'confirmed')
  reused=await action(reused.operationId,'recover_bind')
  assert.equal(reused.steps.core_bind,'failed')
  assert.match(reused.errorEvidence,/已绑定/)
  await assertSource()
  let wrong=service.submit(input('new-wrong-resume-receipt')).projection
  wrong=await action(wrong.operationId,'recover_external')
  nextResumeExternal='not-the-confirmed-external'
  wrong=await action(wrong.operationId,'recover_bind')
  nextResumeExternal=undefined
  assert.equal(wrong.steps.core_bind,'failed')
  assert.match(wrong.errorEvidence,/身份不一致/)
  await assertSource()
  nextResumeTransport='unexpected-existing-transport'
  let wrongResume=service.submit(input('resume-wrong-provider-receipt','continue_existing',trusted.id)).projection
  wrongResume=await action(wrongResume.operationId,'recover_external')
  nextResumeTransport=undefined
  assert.equal(wrongResume.steps.external_create,'outcome_unknown')
  assert.equal(wrongResume.steps.core_bind,'not_started')
  const trustedBeforeMismatch=metadata.getConnectedConversation(pid,trusted.id)
  nextResumeExternal='a-new-native-session-is-not-resume'
  let replacedNative=service.submit(input('resume-refuses-replacement-native','continue_existing',trusted.id)).projection
  const replacedStart=calls.length
  replacedNative=await action(replacedNative.operationId,'recover_external')
  nextResumeExternal=undefined
  assert.equal(replacedNative.steps.external_create,'outcome_unknown')
  assert.equal(replacedNative.steps.core_bind,'not_started')
  assert.equal(calls.length,replacedStart+1)
  assert.equal(calls[replacedStart].externalSessionId,trusted.conversationRef)
  assert.equal(calls[replacedStart].sessionId,bound[0].operation.externalEvidence.transportSessionId)
  assert.equal(calls[replacedStart].threadId,bound[0].operation.runtimeThreadId)
  assert.deepEqual(metadata.getConnectedConversation(pid,trusted.id),trustedBeforeMismatch)
  assert.deepEqual(importer.getMessages(trusted.conversationSessionId,{limit:500000}),trustedMessages)
  const afterWrong=calls.length
  await assert.rejects(()=>action(wrongResume.operationId,'recover_external'),/not allowed/)
  assert.equal(calls.length,afterWrong)
  checks('A create returning any already bound identity and a mismatched bind receipt cannot alter a source. A mismatched continue receipt or replacement native session stays unknown, cannot bind or silently create/retry; original canonical history remains unchanged.')

  let release
  pauseCreate={promise:new Promise(resolve=>{release=resolve})}
  const pendingRequest=input('new-concurrent')
  let pending=service.submit(pendingRequest).projection
  const pendingStart=calls.length
  const inFlight=action(pending.operationId,'recover_external')
  await new Promise(resolve=>setTimeout(resolve,0))
  pending=service.read(pid,pending.operationId)
  assert.equal(pending.steps.external_create,'pending')
  assert.equal(service.submit(pendingRequest).created,false)
  await assert.rejects(()=>service.executeRecoveryAction(pid,pending.operationId,'recover_external',adapter,0),/stale/i)
  await assert.rejects(()=>action(pending.operationId,'recover_external'),/not allowed/)
  assert.equal(calls.length,pendingStart+1)
  release();pauseCreate=undefined
  pending=await inFlight;assert.equal(pending.steps.external_create,'confirmed')
  pending=await action(pending.operationId,'recover_bind');assert.equal(pending.steps.core_bind,'confirmed')
  nextThrow='connection timed out after uncertain create'
  let unknown=service.submit(input('new-unknown')).projection
  const unknownStart=calls.length
  unknown=await action(unknown.operationId,'recover_external')
  assert.equal(unknown.steps.external_create,'outcome_unknown')
  assert.equal(calls.length,unknownStart+1)
  assert.equal(service.submit(input('new-unknown')).created,false)
  await assert.rejects(()=>action(unknown.operationId,'recover_external'),/not allowed/)
  assert.equal(calls.length,unknownStart+1)
  await assertSource()
  checks('Original SQLite CAS and side-effect claims prevent concurrent duplicate creates. Timeout remains outcome_unknown; same submit/read does not retry or generate a new provider request.')

  const legacyInput=input('legacy-no-request-field','blank_new')
  service.submit(legacyInput)
  const legacyRow=metadata.getContinuationOperationJournal(pid,legacyInput.operationId)
  const {requestConnectedConversationId:ignored,...legacy}=legacyRow
  metadata.saveContinuationOperationJournal({...legacy,runtimeThreadId:'core-conversation-'+source.id})
  assert.equal(service.submit(legacyInput).created,false)
  assert.equal('requestConnectedConversationId' in service.read(pid,legacyInput.operationId),false)
  assert.throws(()=>service.submit({...legacyInput,connectedConversationId:secondSource.id}),/conflict/i)
  importer.close();importer=undefined;metadata.close()
  metadata=new SqliteMetadataRepository(db);service=new ConversationContinuationService(metadata,events)
  importer=new ConversationImportService(metadata,{stagingRoot:path.join(runtimeRoot,'imports'),ollamaUrl:'http://127.0.0.1:1'})
  for(const item of bound){
    const duplicate=service.submit(item.request)
    assert.equal(duplicate.created,false);assert.equal(duplicate.projection.connectedConversationId,item.target.id)
    assert.equal(duplicate.projection.requestConnectedConversationId,source.id)
    assert.throws(()=>service.submit({...item.request,connectedConversationId:secondSource.id}),/conflict/i)
  }
  assert.equal(service.submit(resumeRequest).created,false)
  await assertSource()
  checks('Persisted JSON request identity survives real SQLite close/reopen, preserves post-bind source idempotency and rejects a second source ID. Old rows omit the optional projection field and retain their original comparison.')

  let fetchMode='online',hostReads=0
  globalThis.fetch=async(url,init)=>{
    assert.equal(init.method,'GET');assert.match(String(url),/^http:\/\/controlled-host\.invalid\/api\/acp\/continuation\/agentlets\/.*\/sessions$/)
    hostReads++
    if(fetchMode==='offline')throw new Error('connection refused')
    return new Response(JSON.stringify({value:{agents:[]}}),{status:200,headers:{'content-type':'application/json'}})
  }
  const hostOptions={hostBaseUrl:'http://controlled-host.invalid',agentletId:'probe-agentlet'}
  const unavailable=new HuabuAgentletHostTransportV1(hostOptions)
  let probe=await unavailable.probe()
  assert.equal(probe.session.createSession,undefined);assert.equal(probe.session.continueExisting,undefined);assert.equal(probe.session.attachContext,undefined)
  const blank=new HuabuAgentletHostTransportV1({...hostOptions,spawnCommand:'   '})
  const blankProbe=await blank.probe();assert.equal(blankProbe.session.createSession,undefined);assert.equal(blankProbe.session.continueExisting,undefined)
  const configured=new HuabuAgentletHostTransportV1({...hostOptions,spawnCommand:'configured-local-test-owner'})
  probe=await configured.probe()
  assert.equal(probe.session.createSession.value,true)
  assert.equal(probe.session.createSession.source,'adapter_declaration')
  assert.equal(probe.session.createSession.evidenceRef,'HuabuAgentletHostTransportV1.spawn')
  assert.equal(probe.session.continueExisting.value,true)
  assert.equal(probe.session.continueExisting.source,'adapter_declaration')
  assert.equal(probe.session.continueExisting.evidenceRef,'HuabuAgentletHostTransportV1.spawn:externalSessionId')
  assert.equal(probe.session.attachContext,undefined)
  fetchMode='offline'
  probe=await configured.probe()
  assert.equal(probe.session.createSession,undefined);assert.deepEqual(probe.session,{})
  assert.equal(hostReads,4)
  checks('Original Host transport declares create and exact continue attempt only after successful list plus nonblank spawn recipe; neither is proof of success. Offline/missing/blank recipe stay unknown; attach is unchanged and no POST occurs.')

  const composePath=path.join(root,'lcos/apps/local-core/src/compose.ts')
  let compose=readCurrentGen2Resource(composePath)?.contents??await fs.readFile(composePath,'utf8')
  compose=live['lcos/apps/local-core/src/compose.ts'](compose,{sourcePath:composePath})
  const ts=createRequire(path.join(currentGen2Root,'package.json'))('typescript')
  const ast=ts.createSourceFile('compose.ts',compose,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  let argument
  const visit=node=>{
    if(ts.isNewExpression(node)&&node.expression.getText(ast)==='HuabuAgentletHostTransportV1')argument=node.arguments[0].getText(ast)
    ts.forEachChild(node,visit)
  }
  visit(ast);assert(argument)
  const optionReader=new Function('process','huabuHostToken','return ('+argument+')')
  for(const [value,expected] of [[undefined,10000],['',10000],['NaN',10000],['-1',10000],['1.1',10000],['180001',10000],['120000',120000],['180000',180000]]){
    const options=optionReader({env:{HUABU_HOST_URL:hostOptions.hostBaseUrl,HUABU_HOST_TIMEOUT_MS:value}})
    const owner=new HuabuAgentletHostTransportV1(options)
    assert.equal(owner.timeoutMs,expected)
  }
  checks('Actual transformed compose option expression retains original 10s default for unset/invalid values and accepts explicit positive integer Host timeouts up to 180s; original transport owns timeout, no retry added.')

  let originalProbeExpression
  const findProbe=node=>{
    if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='collaborationCapabilityProbe')originalProbeExpression=node.initializer.getText(ast)
    ts.forEachChild(node,findProbe)
  }
  findProbe(ast);assert(originalProbeExpression)
  const probeEntry=path.join(output,'actual-target-probe.ts')
  await fs.writeFile(probeEntry,'export function createOriginalTargetProbe(metadata, recoveryAdapter, liveContinuationTransport) { return ('+originalProbeExpression+'); }\n')
  await buildPilotEntry(path.relative(root,probeEntry),path.join(output,'actual-target-probe.mjs'),'node')
  const {createOriginalTargetProbe}=await import(pathToFileURL(path.join(output,'actual-target-probe.mjs')).href)
  const previousAgentlet=process.env.HUABU_AGENTLET_ID
  const ownerIdentity=metadata.getConversationSessionRuntimeIdentity(pid,trusted.conversationSessionId).originMeta
  const canonicalBeforeProbe=metadata.getConnectedConversation(pid,trusted.id)
  const ownerResponses=[]
  let lookup='connected',lookupCalls=0,listReads=0
  process.env.HUABU_AGENTLET_ID='local-owned-agentlet'
  try {
    globalThis.fetch=async(url,init)=>{
      const parsed=new URL(url)
      assert.equal(parsed.origin,'http://controlled-owner.test');assert.equal(init.method,'GET')
      if(parsed.pathname.endsWith('/sessions')){
        listReads++
        return new Response(JSON.stringify({agents:[]}),{status:200})
      }
      lookupCalls++
      assert(parsed.pathname.endsWith('/sessions/'+encodeURIComponent(ownerIdentity.continuationTransportSessionId)))
      if(lookup==='unreachable')throw new Error('Host read disconnected')
      if(lookup==='missing')return new Response(JSON.stringify({error:{code:'session_not_found',message:'Session lookup miss'}}),{status:404})
      const session={
        agentletId:'local-owned-agentlet',sessionId:ownerIdentity.continuationTransportSessionId,
        externalSessionId:ownerIdentity.continuationExternalSessionId,transportSessionId:ownerIdentity.continuationTransportSessionId,
        threadId:ownerIdentity.continuationThreadId,status:'connected',
      }
      if(lookup==='wrong-native')session.externalSessionId='another-native'
      if(lookup==='wrong-transport')session.transportSessionId='another-transport'
      if(lookup==='wrong-thread')session.threadId='another-thread'
      if(lookup==='no-native')delete session.externalSessionId
      if(lookup==='closed')session.status='disconnected'
      return new Response(JSON.stringify(session),{status:200})
    }
    const ownerTransport=new HuabuAgentletHostTransportV1({hostBaseUrl:'http://controlled-owner.test',agentletId:'local-owned-agentlet',spawnCommand:'never-executed-local-command'})
    const ownerAdapter=new HuabuAgentletContinuationAdapterV1(ownerTransport,{agentletId:'local-owned-agentlet'})
    const targetProbe=createOriginalTargetProbe(metadata,ownerAdapter,ownerTransport)
    const identityService=new owners.ConversationIdentityService(metadata,importer,undefined,events)
    const projections=new owners.CollaborationProjectionService(metadata,identityService,service,new ReceiverRuntimeService(metadata,events),undefined,targetProbe,importer)
    let projection=await projections.getSession(pid,trusted.id)
    assert.equal(projection.capabilities.canSend,true)
    assert.equal(projection.capabilities.canResume,true)
    ownerResponses.push({lookup,canSend:projection.capabilities.canSend,canResume:projection.capabilities.canResume})
    for(const state of ['missing','unreachable','wrong-native','wrong-transport','wrong-thread','no-native','closed']){
      lookup=state
      projection=await projections.getSession(pid,trusted.id)
      assert.equal(projection.capabilities.canSend,false,state)
      assert.equal(projection.capabilities.canResume,true,state)
      assert(projection.capabilityReasons.canSend)
      ownerResponses.push({lookup:state,canSend:projection.capabilities.canSend,canResume:projection.capabilities.canResume})
    }
    lookup='connected'
    projection=await projections.getSession(pid,trusted.id)
    assert.equal(projection.capabilities.canSend,true)
    assert.equal(projection.capabilities.canResume,true)
    const beforeManualLookup=lookupCalls
    const manualProjection=await projections.getSession(pid,source.id)
    assert.equal(manualProjection.capabilities.canSend,false)
    assert.equal(manualProjection.capabilities.canResume,false)
    assert.equal(lookupCalls,beforeManualLookup)
    assert.equal(listReads,1,'Only adapter declaration is cached; every target live-owner GET must be fresh')
    assert.equal(lookupCalls,9)
    assert.deepEqual(metadata.getConnectedConversation(pid,trusted.id),canonicalBeforeProbe)
    assert.deepEqual(importer.getMessages(trusted.conversationSessionId,{limit:500000}),trustedMessages)
    await assertSource()
    await fs.writeFile(path.join(output,'actual-target-owner-projection.json'),JSON.stringify(ownerResponses,null,2))
  } finally {
    if(previousAgentlet===undefined)delete process.env.HUABU_AGENTLET_ID
    else process.env.HUABU_AGENTLET_ID=previousAgentlet
  }
  checks('Actual transformed compose probe and original CollaborationProjection read exact canonical native/transport/thread through original HostTransport on every GET: connected canSend true; missing, unreachable, wrong native/transport/thread, missing native and closed all false while trusted resume stays available. Manual source without trusted origin cannot send/resume. Restoring same live identity re-enables send; no POST or canonical/history mutation.')

  const {AcpAgentClient,acpSessionRegistry}=owners
  const connection=sessionId=>({sessionId,agentletId:'registry-machine',role:'agent-session',status:'connected',
    send(){},onMessage(){return ()=>{}},onLifecycle(){return ()=>{}},disconnect(){}})
  const exactConnection=connection('registry-transport-a')
  const exactClient=new AcpAgentClient(exactConnection,{scopeName:'registry-project'})
  const ownerA={agentletId:'registry-machine',threadId:'registry-thread-a',sessionId:'provider-native-distinct-from-transport',client:exactClient}
  acpSessionRegistry.set(ownerA.agentletId,ownerA.threadId,ownerA)
  assert.equal(exactClient.transportSessionId,'registry-transport-a')
  assert.equal(acpSessionRegistry.getByTransportSession('registry-machine','registry-transport-a',exactConnection),ownerA)
  assert.equal(acpSessionRegistry.getByTransportSession('another-machine','registry-transport-a',exactConnection),undefined)
  assert.equal(acpSessionRegistry.getByTransportSession('registry-machine',ownerA.sessionId,exactConnection),undefined,'Native identity must not be guessed as a transport ID')
  const replacedBridge=connection('registry-transport-a')
  assert.equal(exactClient.isConnectedTo(replacedBridge),false)
  assert.equal(acpSessionRegistry.getByTransportSession('registry-machine','registry-transport-a',replacedBridge),undefined,'Same transport ID on a new bridge cannot reuse an old client')
  const duplicateClient=new AcpAgentClient(exactConnection,{scopeName:'registry-project'})
  const ownerB={agentletId:'registry-machine',threadId:'registry-thread-b',sessionId:'another-native',client:duplicateClient}
  acpSessionRegistry.set(ownerB.agentletId,ownerB.threadId,ownerB)
  assert.equal(acpSessionRegistry.getByTransportSession('registry-machine','registry-transport-a',exactConnection),undefined,'Ambiguous original owners must not be picked arbitrarily')
  acpSessionRegistry.remove(ownerB.agentletId,ownerB.threadId)
  assert.equal(acpSessionRegistry.getByTransportSession('registry-machine','registry-transport-a',exactConnection),ownerA)
  exactConnection.sessionId='registry-transport-updated'
  assert.equal(exactClient.transportSessionId,'registry-transport-updated')
  assert.equal(acpSessionRegistry.getByTransportSession('registry-machine','registry-transport-a',exactConnection),undefined)
  assert.equal(acpSessionRegistry.getByTransportSession('registry-machine','registry-transport-updated',exactConnection),ownerA)
  exactClient.shutdown('local-test-closed')
  assert.equal(acpSessionRegistry.getByTransportSession('registry-machine','registry-transport-updated',exactConnection),undefined)
  acpSessionRegistry.remove(ownerA.agentletId,ownerA.threadId)
  checks('Actual original AcpAgentClient derives transport identity from its one connection; original registry uniquely matches exact agentlet/transport, keeps distinct native identity, refuses wrong node, ambiguity and closed clients, and never uses an appId hint or a parallel session map.')


  const sessionSourcePath=path.join(root,'lcos/huabu/external/agenetes/packages/acp-driver/src/session.ts')
  let sessionSource=readCurrentGen2Resource(sessionSourcePath)?.contents??await fs.readFile(sessionSourcePath,'utf8')
  sessionSource=live['lcos/huabu/external/agenetes/packages/acp-driver/src/session.ts'](sessionSource,{sourcePath:sessionSourcePath})
  const sessionAst=ts.createSourceFile('actual-session.ts',sessionSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  const ensureInner=sessionAst.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='ensureAcpSessionInner').getText(sessionAst)
  const snapshotOriginal=sessionAst.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='snapshotEntryState').getText(sessionAst)
  const ensureHarness=[
    'import {AcpAgentClient} from '+JSON.stringify(prefix+'lcos/huabu/external/agenetes/packages/acp-driver/src/client.ts'),
    'import {acpSessionRegistry} from '+JSON.stringify(prefix+'lcos/huabu/external/agenetes/packages/acp-driver/src/session-registry.ts'),
    'import {LiveAgentletConnection} from '+JSON.stringify(prefix+'lcos/huabu/external/agenetes/packages/agentlet-gateway/src/connection.ts'),
    'import {AcpServiceError} from '+JSON.stringify(prefix+'lcos/huabu/external/agenetes/packages/acp-driver/src/errors.ts'),
    'let currentConnection; let failResume=false; const priorCalls=[]; const agentletId="ensure-machine", threadId="ensure-thread", native="native-keep";',
    'const logger={debug(){},info(){},warn(){},error(){}};',
    'const makeConnection=()=>new LiveAgentletConnection({agentletId,sessionId:native,role:"agent-session",metadata:{},ws:{readyState:1,send(){},close(){}},outboundBufferLimit:10,inboundPreAttachBufferLimit:10,logger,sessionProfile:{session:{initializeResult:{agentCapabilities:{loadSession:true,promptCapabilities:{embeddedContext:true}}}}}});',
    'const gateway={getSession:(node,id)=>node===agentletId&&id===native?currentConnection:undefined}; const getAgentletGateway=()=>gateway;',
    'const ensureAgentForThread=async(node,thread,recipe,prior)=>{priorCalls.push({node,thread,prior});if(prior!==native)throw new Error("A create fallback would be forbidden");if(failResume)throw new AcpServiceError("session_resume_unavailable","Original native unavailable");if(!currentConnection||currentConnection.status!=="connected")currentConnection=makeConnection();return {sessionId:native,pid:1};};',
    'const profileCachePort=undefined; const snapshotEntryMeta=()=>({}); const seedEntryFromNewSessionResult=()=>{}; const hydrateSelectionsFromPersistedMeta=()=>{}; const seedInitialPreferences=()=>{}; const handleSessionMetaUpdate=()=>{}; const hydrateEntryFromPersistedMeta=()=>{}; const reconcileSessionSelections=async()=>{};',
    snapshotOriginal,
    ensureInner,
    'export async function exerciseOriginalEnsure(kind){',
    '  priorCalls.length=0;failResume=false;const oldConnection=makeConnection();currentConnection=oldConnection;const oldClient=new AcpAgentClient(oldConnection,{scopeName:"ensure-project"});',
    '  const oldEntry={agentletId,threadId,sessionId:native,client:oldClient,profileId:"ensure-profile",namespace:{name:"ensure-project"},cwd:"isolated",bindingRecipe:{command:"not-executed",alias:"ensure"},persistedToDisk:true,initialPreambleDelivered:true,selections:{},availableCommands:[],availableModes:[],availableModels:[],configOptions:[]};',
    '  acpSessionRegistry.set(agentletId,threadId,oldEntry);',
    '  if(kind==="replaced")currentConnection=makeConnection();else oldConnection.disconnect("controlled-gateway-disconnect");',
    '  const closedBefore=oldClient.isClosed; if(kind==="unavailable")failResume=true;',
    '  let result,error;try{result=await ensureAcpSessionInner({agentletId,threadId,binding:{alias:"ensure",profileId:"ensure-profile"},namespace:{name:"ensure-project"},recipe:{command:"not-executed",alias:"ensure"},priorSessionId:native,logger});}catch(e){error={code:e.code,message:e.message};}',
    '  const output={closedBefore,closedAfter:oldClient.isClosed,priorCalls:[...priorCalls],native:result?.sessionId,newClient:result?.client!==oldClient,currentConnection:result?.client.isConnectedTo(currentConnection),error};',
    '  acpSessionRegistry.remove(agentletId,threadId);return output;',
    '}',
  ].join('\n')
  const ensureEntry=path.join(output,'actual-ensure-connection.ts')
  await fs.writeFile(ensureEntry,ensureHarness)
  await buildPilotEntry(path.relative(root,ensureEntry),path.join(output,'actual-ensure-connection.mjs'),'node',{coreLiveContinuation:true})
  const {exerciseOriginalEnsure}=await import(pathToFileURL(path.join(output,'actual-ensure-connection.mjs')).href)
  const ensureResults=[]
  for(const kind of ['disconnected','replaced','unavailable']){
    const result=await exerciseOriginalEnsure(kind);ensureResults.push({kind,...result})
    assert.equal(result.closedBefore,false,'Reproduce a lifecycle event that has not yet marked the old SDK client closed')
    assert.equal(result.closedAfter,true)
    assert.equal(result.priorCalls.length,1)
    assert.equal(result.priorCalls[0].prior,'native-keep')
    if(kind==='unavailable'){assert.equal(result.error.code,'session_resume_unavailable');assert.equal(result.native,undefined)}
    else{assert.equal(result.error,undefined);assert.equal(result.native,'native-keep');assert.equal(result.newClient,true);assert.equal(result.currentConnection,true)}
  }
  await fs.writeFile(path.join(output,'actual-ensure-prior-connection.json'),JSON.stringify(ensureResults,null,2))
  checks('Original LiveAgentletConnection disconnect and a same-ID replacement bridge leave old SDK isClosed initially false; actual transformed ensureAcpSessionInner closes the stale original client and calls original prior-session branch once with the same native identity, creates a client on current connection, and propagates resume_unavailable without create fallback.')


  const spawnSourcePath=path.join(root,'lcos/huabu/external/agenetes/packages/acp-driver/src/spawn-orchestrator.ts')
  let spawnSource=readCurrentGen2Resource(spawnSourcePath)?.contents??await fs.readFile(spawnSourcePath,'utf8')
  spawnSource=live['lcos/huabu/external/agenetes/packages/acp-driver/src/spawn-orchestrator.ts'](spawnSource,{sourcePath:spawnSourcePath})
  const spawnAst=ts.createSourceFile('actual-spawn.ts',spawnSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  const spawnNames=['isSessionResumeUnavailableError','agentletThreadKey','readTargetAgentlet','waitForTargetAgentlet','waitForAgentConnection','ensureAgentForThread']
  const spawnFunctions=spawnAst.statements.filter(node=>ts.isFunctionDeclaration(node)&&spawnNames.includes(node.name?.text)).map(node=>node.getText(spawnAst)).join('\n')
  const spawnHarness=[
    'import {AcpServiceError} from '+JSON.stringify(prefix+'lcos/huabu/external/agenetes/packages/acp-driver/src/errors.ts'),
    'class AgentletRequestError extends Error {data;}; const AGENTLET_READY_TIMEOUT_MS=20000;',
    'const threadToAgent=new Map(); const spawns=[];let connection={sessionId:"native-cache",status:"connected"};',
    'const gateway={getAgentlet:()=>({status:"connected"}),getSession:(_a,id)=>id==="native-cache"?connection:undefined,spawnOnAgentlet:async(_a,input)=>{spawns.push(input);if(input.sessionId!=="native-cache")throw new Error("Unexpected create");return {sessionId:"native-cache",pid:1};}};',
    'const getAgentletGateway=()=>gateway,getDaemonSupervisor=()=>({hasGivenUp:()=>false}),getSupervisedAgentletId=()=>"cache-machine";',
    spawnFunctions,
    'export async function exerciseOriginalSpawn(){',
    ' const recipe={command:"not-executed",alias:"cache"};await ensureAgentForThread("cache-machine","cache-thread",recipe,"native-cache");',
    ' const first=spawns.length;await ensureAgentForThread("cache-machine","cache-thread",recipe,"native-cache");const warm=spawns.length;',
    ' connection={sessionId:"native-cache",status:"connected"};',
    ' await ensureAgentForThread("cache-machine","cache-thread",recipe,"native-cache");return {first,warm,replaced:spawns.length,priorIds:spawns.map(row=>row.sessionId)};',
    '}',
  ].join('\n')
  const spawnEntry=path.join(output,'actual-spawn-connection.ts')
  await fs.writeFile(spawnEntry,spawnHarness)
  await buildPilotEntry(path.relative(root,spawnEntry),path.join(output,'actual-spawn-connection.mjs'),'node')
  const {exerciseOriginalSpawn}=await import(pathToFileURL(path.join(output,'actual-spawn-connection.mjs')).href)
  const spawnCacheResult=await exerciseOriginalSpawn()
  assert.equal(spawnCacheResult.first,1);assert.equal(spawnCacheResult.warm,1);assert.equal(spawnCacheResult.replaced,2)
  assert.deepEqual(spawnCacheResult.priorIds,['native-cache','native-cache'])
  await fs.writeFile(path.join(output,'actual-spawn-current-connection.json'),JSON.stringify(spawnCacheResult,null,2))
  checks('Actual original ensureAgentForThread reuses the same current Gateway connection, but invalidates its existing cache for a same-ID replacement connection and invokes the original spawn/resume port again with the exact prior native ID, never a create request.')

  assert.equal(report.modelRequests,0);assert.equal(report.runDispatches,0);assert.equal(report.networkRequests,0)
  report.passed=true
} catch(error) {
  report.error=error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:String(error)
  process.exitCode=1
} finally {
  try{importer?.close()}catch{}
  try{metadata?.close()}catch{}
  globalThis.fetch=originalFetch
  report.runtimeRoot=runtimeRoot
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify({passed:report.passed,groups:report.checks.length,report:path.relative(root,path.join(output,'report.json')),error:report.error?.message}))
}
