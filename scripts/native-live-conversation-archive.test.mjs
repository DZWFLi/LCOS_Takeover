import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { createNativeCoreLiveConversationArchiveTransforms } from '../lab/native-core-live-conversation-archive-transform.mjs'
import { createNativeCoreLiveContinuationTransforms } from '../lab/native-core-live-continuation-transform.mjs'
import { createNativeCoreMixedScopeContinuationTransforms } from '../lab/native-core-mixed-scope-continuation-transform.mjs'
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs'

const root=process.cwd(),stamp=new Date().toISOString().replaceAll(':','-')
const output=path.join(root,'output/混合Scope取用_20261022/Core实时原归档',stamp)
await fs.mkdir(output,{recursive:true})
const runtime=await fs.mkdtemp(path.join(root,'.runtime/isolated-live-archive-'))
const report={passed:false,checks:[],networkRequests:0,modelRequests:0,liveSessionsAccessed:0,
  coverage:'Core realtime messages and original context receipts. Provider internal events not returned to Core are not claimed.',runtime}
const check=message=>report.checks.push(message)
const originalFetch=globalThis.fetch
globalThis.fetch=async()=>{report.networkRequests++;throw new Error('Network forbidden in isolated archive regression.')}
let metadata,importer
try{
  const archiveTransforms=createNativeCoreLiveConversationArchiveTransforms(),mixed=createNativeCoreMixedScopeContinuationTransforms(),live=createNativeCoreLiveContinuationTransforms()
  for(const[relative,transform]of Object.entries(archiveTransforms)){
    const sourcePath=path.join(root,relative)
    let source=readCurrentGen2Resource(sourcePath)?.contents??await fs.readFile(sourcePath,'utf8')
    for(const prior of [mixed[relative],live[relative]])if(prior)source=prior(source,{sourcePath})
    const changed=transform(source,{sourcePath});assert.notEqual(changed,source);assert.equal(transform(changed,{sourcePath}),changed)
    assert.throws(()=>transform(source,{sourcePath:path.join(root,'wrong.ts')}))
  }
  const prefix=path.relative(output,root).replaceAll('\\','/')+'/'
  const exports=[
    ['SqliteMetadataRepository','lcos/apps/local-core/src/metadata-repository.ts'],
    ['ConversationImportService','lcos/apps/local-core/src/conversation-import-service.ts'],
    ['ConversationContinuationService','lcos/apps/local-core/src/conversation-continuation-service.ts'],
    ['ProjectEventHub','lcos/apps/local-core/src/project-events/project-event-hub.ts'],
    ['HuabuAgentletContinuationAdapterV1','lcos/apps/local-core/src/huabu-agentlet-continuation-adapter.ts'],
    ['createMvpSampleSnapshot','lcos/apps/local-core/src/mvp-sample-project.ts'],
    ['handleCollaborationRoute','lcos/apps/local-core/src/routes/collaboration.ts'],
    ['handleConversationsRoute','lcos/apps/local-core/src/routes/conversations.ts'],
    ['createMixedScopeReadPort,registerMixedScopeReadPort,readMixedScopeContext','lab/pilot/mixed-scope-context.ts'],
  ]
  const entry=path.join(output,'actual-owners.ts'),bundle=path.join(output,'actual-owners.mjs')
  await fs.writeFile(entry,exports.map(([names,file])=>'export {'+names+'} from '+JSON.stringify(prefix+file)).join('\n'))
  await buildPilotEntry(path.relative(root,entry),bundle,'node',{coreMixedScopeContext:true,coreLiveContinuation:true})
  const owners=await import(pathToFileURL(bundle).href)
  const {SqliteMetadataRepository,ConversationImportService,ConversationContinuationService,ProjectEventHub,
    HuabuAgentletContinuationAdapterV1,createMvpSampleSnapshot,handleCollaborationRoute,handleConversationsRoute,
    createMixedScopeReadPort,registerMixedScopeReadPort,readMixedScopeContext}=owners
  const db=path.join(runtime,'metadata.sqlite'),now='2026-10-23T01:00:00.000Z'
  metadata=new SqliteMetadataRepository(db)
  const graph=createMvpSampleSnapshot(path.join(runtime,'project'),now);await fs.mkdir(graph.project.rootPath,{recursive:true});metadata.save(graph)
  const readingScope=graph.scopes.find(scope=>scope.kind==='context')??graph.scopes[0]
  const pid=String(graph.project.id),scopeId=String(readingScope.id),events=new ProjectEventHub()
  importer=new ConversationImportService(metadata,{stagingRoot:path.join(runtime,'imports'),ollamaUrl:'http://127.0.0.1:1'})
  assert.equal(typeof importer.reconcileContinuationArchive,'function','The actual build must include the archive factory')
  let service=new ConversationContinuationService(metadata,events,importer)
  const port=()=>createMixedScopeReadPort(metadata,importer)
  registerMixedScopeReadPort(metadata,port())
  const sessions=new Map(),calls={spawn:0,attach:0,send:0},captured=[]
  let attachmentFailure=false,sendUnknown=false
  const transport={
    async spawn(input){calls.spawn++;const native=input.externalSessionId??'native-'+input.threadId;
      const value={sessionId:native,transportSessionId:native,externalSessionId:native,threadId:input.threadId,cwd:runtime,status:'running'};
      sessions.set(native,value);return value},
    async list(){return{agents:[...sessions.values()]}},async getSession(_agentlet,id){return sessions.get(id)},
    async probe(){return{session:{}}},async stop(){return{stopped:true}},async sendResource(){throw new Error('Legacy raw resource forbidden')},
    async attachContext(input){calls.attach++;captured.push(structuredClone(input));
      if(attachmentFailure){const error=new Error('Controlled unsupported attachment');error.code='embedded_context_unsupported';throw error}
      return{correlationId:input.correlationId,messageId:input.messageId,attachmentId:'attachment-'+input.messageId}},
    async sendPrompt(input){calls.send++;if(sendUnknown)throw new Error('Controlled transport timeout after acceptance');
      return{externalSessionId:input.externalSessionId,transportSessionId:input.transportSessionId,threadId:input.threadId,text:'原助手完整回应：'+input.text}},
  }
  const adapter=new HuabuAgentletContinuationAdapterV1(transport,{agentletId:'isolated-archive-agentlet',adapterId:'archive-regression'})
  let operationIndex=0
  async function bind(reader=true){
    const local=new ConversationContinuationService(metadata,events,reader?importer:undefined)
    const op='archive-operation-'+(++operationIndex)
    local.submit({schemaVersion:1,projectId:pid,operationId:op,mode:'blank_new',contextInheritance:'blank',checkout:'shared',provider:'codex'})
    let row=local.read(pid,op)
    await local.executeRecoveryAction(pid,op,'recover_external',adapter,row.revision);row=local.read(pid,op)
    await local.executeRecoveryAction(pid,op,'recover_bind',adapter,row.revision);row=local.read(pid,op)
    return{op,row,target:metadata.getConnectedConversation(pid,row.connectedConversationId)}
  }
  const initial=await bind()
  const initialArchive=await importer.reconcileContinuationArchive(pid,initial.target.conversationSessionId)
  assert.equal(initialArchive.messageCount,0);assert.equal((await importer.inspectContextSource(pid,initial.target.conversationSessionId)).sourceContentHash,initialArchive.sourceContentHash)
  const initialRecords=(await fs.readFile(initialArchive.sourcePath,'utf8')).trim().split('\n').map(JSON.parse)
  assert.equal(initialRecords[0].producer,'lcos-core-realtime');assert.equal(initialRecords[0].identity.externalSessionId,initial.target.conversationRef)
  assert.match(initialRecords[0].coverage,/not unreturned provider/)
  check('The actual transformed Core bind initializes one explicit Core realtime source archive and preserves original identity; it does not claim provider internal event completeness.')

  const legacy=await bind(false),sid=legacy.target.conversationSessionId
  assert.equal(importer.getProjection(pid,sid).session.sourceContentHash,undefined)
  const oldMessage='old-committed-message'
  const oldSent=await service.sendPrompt(pid,legacy.op,{kind:'prompt',text:'旧问题，逐字保留。'},adapter,oldMessage,{messageId:oldMessage})
  assert.equal(oldSent.outcome,'sent')
  importer.appendContinuationTurn(pid,sid,{messageId:oldMessage,userText:'旧问题，逐字保留。',assistantText:oldSent.responseText,occurredAt:oldSent.observedAt})
  const oldMessages=structuredClone(importer.getMessages(sid,{limit:1000})),sessionCount=importer.list(pid).length
  metadata.insertPresentationView({id:readingScope.kind==='context'?'presentation:context:'+scopeId:'live-self-scope',projectId:pid,scopeId,capability:readingScope.kind,renderer:'graph',
    state:{memberViewIds:[],memberEntityRefs:[{type:'conversation',id:legacy.target.id}]},version:1,createdAt:now,updatedAt:now,updatedBy:'system'})
  const firstRead=await readMixedScopeContext({projectId:pid,scopeId},port(),{maxCharacters:200000})
  assert.equal(firstRead.complete,true);assert(firstRead.text.includes('旧问题，逐字保留。'));assert(firstRead.text.includes(oldSent.responseText))
  assert.equal(importer.list(pid).length,sessionCount);assert.deepEqual(importer.getMessages(sid,{limit:1000}),oldMessages)
  const repaired=await importer.reconcileContinuationArchive(pid,sid),repairedText=await fs.readFile(repaired.sourcePath,'utf8')
  const repairedRecords=repairedText.trim().split('\n').map(JSON.parse)
  assert.equal(repairedRecords.length,3);assert.equal(repairedRecords[1].message.id,oldMessages[0].id)
  assert.equal(repairedRecords[1].message.sourceEventId,oldMessages[0].sourceEventId)
  assert.equal(repairedRecords[2].contextSources[0].promptReceipt.sendReceipt.responseText,oldSent.responseText)
  check('An original pre-fix identity plus two committed messages is repaired through the same importer during actual mixed Scope resolve; no new session, message or direct SQL is introduced.')

  async function routeSend(messageId,text,refs=[{order:0,mode:'full',ref:{type:'scope',scopeId}}]){
    let response
    const pathname='/projects/'+encodeURIComponent(pid)+'/connected-conversations/'+encodeURIComponent(legacy.target.id)+'/collaboration-send'
    const handled=await handleCollaborationRoute({method:'POST',pathname,url:new URL(pathname,'http://127.0.0.1'),request:{},response:{},signal:new AbortController().signal,
      metadata,continuation:service,conversations:importer,adapter,
      helpers:{sendJson:(_response,status,value)=>{response={status,value}},failure:(code,message)=>({ok:false,error:{code,message}}),
        readJsonBody:async()=>({conversationId:legacy.target.id,continuationOperationId:legacy.op,messageId,text,orderedReferences:refs}),
        isRecord:value=>value!==null&&typeof value==='object'&&!Array.isArray(value)}})
    assert.equal(handled,true);return response
  }
  const first=await routeSend('full-live-1','第一轮：使用完整当前Scope。')
  assert.equal(first.status,200,JSON.stringify(first.value));assert.equal(importer.getMessages(sid,{limit:1000}).length,4)
  const firstCapture=captured.at(-1);assert(firstCapture.contextResolution[0].text.includes('旧问题，逐字保留。'))
  assert(firstCapture.contextResolution[0].text.includes('continuation_prompt_pending'))
  const frozen=structuredClone(metadata.getContinuationOperationJournal(pid,legacy.op).promptReceipts.find(item=>item.messageId==='full-live-1'))
  const afterFirst=await importer.reconcileContinuationArchive(pid,sid)
  assert.notEqual(afterFirst.sourcePath,repaired.sourcePath);assert.equal(await fs.readFile(repaired.sourcePath,'utf8'),repairedText)
  const beforeRepeat={...calls}
  const repeat=await routeSend('full-live-1','第一轮：使用完整当前Scope。')
  assert.equal(repeat.status,200);assert.deepEqual(calls,beforeRepeat)
  assert.deepEqual(metadata.getContinuationOperationJournal(pid,legacy.op).promptReceipts.find(item=>item.messageId==='full-live-1'),frozen)
  assert.equal(importer.getMessages(sid,{limit:1000}).length,4)
  check('Actual collaboration-send resolves a self-containing full Scope with the real pending user event, commits the original turn and new archive; completed retry returns the same turn without re-reading changed Scope or crossing the provider boundary.')

  importer.close();metadata.close();metadata=new SqliteMetadataRepository(db)
  importer=new ConversationImportService(metadata,{stagingRoot:path.join(runtime,'imports'),ollamaUrl:'http://127.0.0.1:1'})
  service=new ConversationContinuationService(metadata,events,importer);registerMixedScopeReadPort(metadata,port())
  const second=await routeSend('full-live-2','第二轮：继续沿同一个原对话。')
  assert.equal(second.status,200,JSON.stringify(second.value));assert.equal(importer.getMessages(sid,{limit:1000}).length,6)
  const secondCapture=captured.at(-1)
  assert(secondCapture.contextResolution[0].text.includes('第一轮：使用完整当前Scope。'))
  assert(secondCapture.contextResolution[0].text.includes('原助手完整回应：第一轮：使用完整当前Scope。'))
  assert.notEqual(secondCapture.contextResolution[0].text,firstCapture.contextResolution[0].text)
  assert.deepEqual(importer.getMessages(sid,{limit:1000}).slice(0,2),oldMessages)
  assert.equal(metadata.getConnectedConversation(pid,legacy.target.id).conversationSessionId,sid)
  assert.equal(metadata.getConnectedConversation(pid,legacy.target.id).conversationRef,legacy.target.conversationRef)
  const completeRead=await readMixedScopeContext({projectId:pid,scopeId},port(),{maxCharacters:200000})
  assert(completeRead.text.includes('第二轮：继续沿同一个原对话。'))
  check('Real SQLite close/reopen preserves the same Core/native identity and archive; the second new message reads the first new turn, while old frozen message evidence and old messages remain unchanged.')

  attachmentFailure=true
  const rejected=await routeSend('full-live-attach-failed','附加失败的原用户输入。')
  attachmentFailure=false
  assert.equal(rejected.status,409);assert.equal(importer.getMessages(sid,{limit:1000}).length,6)
  const afterFailure=await importer.reconcileContinuationArchive(pid,sid)
  const failureRecords=(await fs.readFile(afterFailure.sourcePath,'utf8')).trim().split('\n').map(JSON.parse)
  assert(failureRecords.some(item=>item.type==='core_prompt_released'&&item.message.contentText==='附加失败的原用户输入。'))
  assert.equal((await importer.inspectContextSource(pid,sid)).sourceContentHash,afterFailure.sourceContentHash)
  assert.equal((await readMixedScopeContext({projectId:pid,scopeId},port(),{maxCharacters:200000})).complete,true)
  const deniedCalls={...calls};const deniedRetry=await routeSend('full-live-attach-failed','附加失败的原用户输入。')
  assert.equal(deniedRetry.status,409);assert.equal(calls.send,deniedCalls.send)
  check('A declared failed Scope attachment releases only the original pending reservation; the archive retains that Core event and failed source receipt. It remains readable, and same-message frozen evidence cannot be silently replaced to force a resend.')

  sendUnknown=true
  const unknown=await routeSend('full-live-unknown','结果未知的原用户输入。',[])
  sendUnknown=false
  assert.equal(unknown.status,409);const beforeUnknownRepeat={...calls}
  const unknownRepeat=await routeSend('full-live-unknown','结果未知的原用户输入。',[])
  assert.equal(unknownRepeat.status,409);assert.deepEqual(calls,beforeUnknownRepeat)
  const pending=importer.getContinuationTurn(pid,sid,'full-live-unknown');assert.equal(pending.status,'pending')
  const unknownArchive=await importer.reconcileContinuationArchive(pid,sid)
  const unknownRecords=(await fs.readFile(unknownArchive.sourcePath,'utf8')).trim().split('\n').map(JSON.parse)
  assert(unknownRecords.some(item=>item.message?.eventKind==='continuation_prompt_pending'&&item.message.contentText==='结果未知的原用户输入。'))
  assert.equal(unknownRecords.filter(item=>item.message?.sourceEventId==='full-live-unknown:assistant').length,0)
  check('Unknown outcomes keep the same pending user and no invented assistant; retry only reconciles original local evidence and never sends again.')

  const valid=await importer.reconcileContinuationArchive(pid,sid),validBytes=await fs.readFile(valid.sourcePath),validHash=valid.sourceContentHash
  await fs.appendFile(valid.sourcePath,'{"unexpected":"corruption"}\n')
  await assert.rejects(()=>importer.inspectContextSource(pid,sid),/改变/)
  assert.equal(importer.getProjection(pid,sid).session.sourceContentHash,validHash)
  await fs.writeFile(valid.sourcePath,validBytes)
  const displaced=valid.sourcePath+'.test-missing';await fs.rename(valid.sourcePath,displaced)
  await assert.rejects(()=>importer.inspectContextSource(pid,sid))
  assert.equal(importer.getProjection(pid,sid).session.sourceContentHash,validHash)
  await fs.rename(displaced,valid.sourcePath)
  check('Corrupt or missing already-committed source files fail original inspection; source pointers and messages are not rewritten to conceal damage.')

  const stable=await importer.reconcileContinuationArchive(pid,sid),directory=path.dirname(stable.sourcePath)
  const filesBefore=await fs.readdir(directory)
  const concurrent=importer.reconcileContinuationArchive(pid,sid)
  importer.reserveContinuationPrompt(pid,sid,{messageId:'cas-race-pending',userText:'归档CAS期间新增的原消息。'})
  await assert.rejects(()=>concurrent,/更新/)
  assert.equal(importer.getProjection(pid,sid).session.sourceContentHash,stable.sourceContentHash)
  assert.deepEqual(await fs.readdir(directory),filesBefore)
  importer.releaseContinuationPrompt(pid,sid,'cas-race-pending')
  const originalList=metadata.listContinuationOperationJournals.bind(metadata);let reads=0
  metadata.listContinuationOperationJournals=(projectId)=>{reads++;if(reads===2)throw new Error('Controlled original transaction failure');return originalList(projectId)}
  importer.reserveContinuationPrompt(pid,sid,{messageId:'rollback-pending',userText:'事务失败前的原pending。'})
  await assert.rejects(()=>importer.reconcileContinuationArchive(pid,sid),/Controlled original transaction failure/)
  metadata.listContinuationOperationJournals=originalList
  assert.equal(importer.getProjection(pid,sid).session.sourceContentHash,stable.sourceContentHash)
  assert.deepEqual(await fs.readdir(directory),filesBefore)
  assert.deepEqual(await fs.readFile(stable.sourcePath),await fs.readFile(valid.sourcePath))
  const recovered=await importer.reconcileContinuationArchive(pid,sid)
  assert.equal(recovered.messageCount,8)
  assert.equal((await importer.inspectContextSource(pid,sid)).sourceContentHash,recovered.sourceContentHash)
  check('A genuine concurrent canonical message change and an exception inside the original SQLite transaction both reject CAS, roll back pointer writes and remove only the uncommitted candidate; retry recovers without another send.')

  const manual=await importer.importManual(pid,{title:'原手动来源不可重建',scopeId,entries:[{role:'user',contentText:'原手动内容。',createdAt:now}]})
  const manualSource=path.join(graph.project.rootPath,'.creative-os','conversations',manual.session.id,'manual-conversation.jsonl')
  const manualBytes=await fs.readFile(manualSource),manualHash=manual.session.sourceContentHash
  assert.equal(await importer.reconcileContinuationArchive(pid,manual.session.id),undefined)
  assert.equal((await importer.inspectContextSource(pid,manual.session.id)).sourceContentHash,manualHash)
  assert.deepEqual(await fs.readFile(manualSource),manualBytes)
  const blocked=await bind(false),blockedSid=blocked.target.conversationSessionId
  const blockedDir=path.join(graph.project.rootPath,'.creative-os','conversations',blockedSid)
  await fs.writeFile(blockedDir,'controlled non-directory')
  await assert.rejects(()=>importer.reconcileContinuationArchive(pid,blockedSid))
  assert.equal(importer.getProjection(pid,blockedSid).session.sourceContentHash,undefined)
  await fs.unlink(blockedDir);assert.equal((await importer.reconcileContinuationArchive(pid,blockedSid)).messageCount,0)
  const restoreReconcile=importer.reconcileContinuationArchive.bind(importer)
  importer.reconcileContinuationArchive=async()=>{throw new Error('Controlled post-bind archive failure')}
  await assert.rejects(()=>bind(),/post-bind archive failure/)
  const boundAfterFailure=metadata.getContinuationOperationJournal(pid,'archive-operation-'+operationIndex)
  assert.equal(boundAfterFailure.steps.core_bind,'confirmed')
  const retained=metadata.getConnectedConversation(pid,boundAfterFailure.connectedConversationId)
  assert(retained?.conversationSessionId)
  importer.reconcileContinuationArchive=restoreReconcile
  await importer.reconcileContinuationArchive(pid,retained.conversationSessionId)
  check('Imported raw sources remain byte-identical. Real filesystem preparation failure leaves source unset; archive failure after bind preserves confirmed identity and is repairable by the same original service.')

  let refreshResponse
  const refreshPath='/projects/'+pid+'/conversations/'+sid+'/sections/refresh'
  assert.equal(await handleConversationsRoute({method:'POST',pathname:refreshPath,url:new URL(refreshPath,'http://127.0.0.1'),request:{},response:{},
    controller:new AbortController(),metadata,conversations:importer,helpers:{sendJson:(_r,status,value)=>{refreshResponse={status,value}},failure:(code,message)=>({ok:false,error:{code,message}})}}),true)
  assert.equal(refreshResponse.status,200,JSON.stringify(refreshResponse.value))
  assert.equal(report.networkRequests,0);assert.equal(report.modelRequests,0);report.passed=true
  report.controlledTransportCalls=calls;report.liveIdentity={core:sid,connected:legacy.target.id,native:legacy.target.conversationRef}
}catch(error){report.error=error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:String(error);process.exitCode=1}
finally{
  try{importer?.close()}catch{}try{metadata?.close()}catch{}globalThis.fetch=originalFetch
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify({passed:report.passed,groups:report.checks.length,report:path.join(output,'report.json'),error:report.error?.message}))
}
