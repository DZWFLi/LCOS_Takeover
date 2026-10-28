import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root, readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs'
import { createNativeCoreLiveContinuationTransforms } from '../lab/native-core-live-continuation-transform.mjs'
import { createNativeCoreMixedScopeContinuationTransforms, nativeCoreMixedScopeHostSource, nativeCoreMixedScopeAcpSource } from '../lab/native-core-mixed-scope-continuation-transform.mjs'

const root = process.cwd()
const output = path.join(root, 'output/混合Scope取用_20261022/续聊原发送链', new Date().toISOString().replaceAll(':','-'))
await fs.mkdir(output,{recursive:true})
await fs.mkdir(path.join(root,'.runtime'),{recursive:true})
const runtimeRoot=await fs.mkdtemp(path.join(root,'.runtime/mixed-scope-continuation-'))
const report={passed:false,checks:[],remoteModelRequests:0,runDispatches:0,realBrowserVerified:false}
const copy=value=>structuredClone(value)
const sha=text=>createHash('sha256').update(text).digest('hex')
const now='2026-10-22T12:00:00.000Z'
let metadata
try {
  const transforms=createNativeCoreMixedScopeContinuationTransforms()
  for(const [relative,transform] of Object.entries(transforms)) {
    const sourcePath=path.join(root,relative), source=readCurrentGen2Resource(sourcePath)?.contents??await fs.readFile(sourcePath,'utf8'), transformed=transform(source,{sourcePath})
    assert.notEqual(transformed,source);assert.equal(transform(transformed,{sourcePath}),transformed)
    assert.throws(()=>transform(source,{sourcePath:path.join(root,'wrong.ts')}))
  }
  report.checks.push('Exact source transforms are idempotent and refuse unrelated files; original sources remain read-only.')
  const entry=path.join(output,'actual-owners.ts')
  const prefix=path.relative(output,root).replaceAll('\\','/')+'/'
  await fs.writeFile(entry,[
    "export {ConversationContinuationService} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/conversation-continuation-service.ts'),
    "export {SqliteMetadataRepository} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/metadata-repository.ts'),
    "export {ProjectEventHub} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/project-events/project-event-hub.ts'),
    "export {ReceiverRuntimeService} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/receiver-runtime-service.ts'),
    "export {HuabuAgentletContinuationAdapterV1} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/huabu-agentlet-continuation-adapter.ts'),
    "export {HuabuAgentletHostTransportV1} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/huabu-agentlet-host-transport.ts'),
    "export {createMvpSampleSnapshot} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/mvp-sample-project.ts'),
    "export {createMixedScopeReadPort,registerMixedScopeReadPort} from "+JSON.stringify(prefix+'lab/pilot/mixed-scope-context.ts'),
  ].join('\n'))
  await buildPilotEntry(path.relative(root,entry),path.join(output,'actual-owners.mjs'),'node',{coreMixedScopeContext:true,coreLiveContinuation:true})
  const owners=await import(pathToFileURL(path.join(output,'actual-owners.mjs')).href)
  const ts=createRequire(path.join(currentGen2Root,'package.json'))('typescript')
  const actualFunctions=(source,names)=>{
    const ast=ts.createSourceFile('actual.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
    return ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text)).map(node=>node.getText(ast)).join('\n')
  }
  const parserNames=['isRecord','asThreadId','asReference','asOrderedReferences','asResolvedReferences','asContextResolution','contextAttachmentId','asContextManifestBody','asContextAttachment']
  let source=await fs.readFile(path.join(root,nativeCoreMixedScopeHostSource),'utf8')
  source=transforms[nativeCoreMixedScopeHostSource](source,{sourcePath:path.join(root,nativeCoreMixedScopeHostSource)})
  let extracted=actualFunctions(source,parserNames)
  assert.equal((extracted.match(/function /g)||[]).length,parserNames.length)
  extracted+='\nexport {asContextManifestBody,asContextAttachment};'
  source=await fs.readFile(path.join(root,nativeCoreMixedScopeAcpSource),'utf8')
  source=transforms[nativeCoreMixedScopeAcpSource](source,{sourcePath:path.join(root,nativeCoreMixedScopeAcpSource)})
  extracted+='\n'+actualFunctions(source,['referenceIdentity','continuationReferenceBlocks'])
  const parsers=path.join(output,'actual-host-parsers.ts')
  await fs.writeFile(parsers,extracted)
  await buildPilotEntry(path.relative(root,parsers),path.join(output,'actual-host-parsers.mjs'),'node')
  const host=await import(pathToFileURL(path.join(output,'actual-host-parsers.mjs')).href)


  const routeSourcePath=path.join(root,nativeCoreMixedScopeHostSource)
  let actualRouteSource=readCurrentGen2Resource(routeSourcePath)?.contents??await fs.readFile(routeSourcePath,'utf8')
  actualRouteSource=transforms[nativeCoreMixedScopeHostSource](actualRouteSource,{sourcePath:routeSourcePath})
  actualRouteSource=createNativeCoreLiveContinuationTransforms()[nativeCoreMixedScopeHostSource](actualRouteSource,{sourcePath:routeSourcePath})
  // Match the running Host: Scope parser is installed, but omitted/default mode comparison is still the original strict comparison.
  actualRouteSource=actualRouteSource.replace("(ordered.mode ?? 'full') !== (resolved.mode ?? 'full')", "ordered.mode !== resolved.mode")
  const routeAst=ts.createSourceFile('actual-route.ts',actualRouteSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  const originalPlugin=routeAst.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(decl=>decl.name.getText(routeAst)==='continuationTransportRoutes')).getText(routeAst)
  const acpSourcePath=path.join(root,nativeCoreMixedScopeAcpSource)
  let actualAcpSource=readCurrentGen2Resource(acpSourcePath)?.contents??await fs.readFile(acpSourcePath,'utf8')
  actualAcpSource=transforms[nativeCoreMixedScopeAcpSource](actualAcpSource,{sourcePath:acpSourcePath})
  const originalRouteFunctions=actualFunctions(actualRouteSource,['errorBody','connectedGateway','isRecord','asThreadId','asReference','asOrderedReferences','asResolvedReferences','asContextResolution','contextAttachmentId','asContextManifestBody','supportsEmbeddedContext','asContextAttachment','asPromptBody','ensureContinuationOwner','projectSession'])
  const originalPromptFunctions=actualFunctions(actualAcpSource,['record','textFromUpdate','referenceIdentity','continuationReferenceBlocks','promptExistingAcpSession'])
  const handlerHarness=[
    'const handlers = new Map(); let owner; let gatewayConnection;',
    'import {acpSessionRegistry} from '+JSON.stringify(prefix+'lcos/huabu/external/agenetes/packages/acp-driver/src/session-registry.ts'),
    'const gateway = { getAgentlet: id => id===owner?.agentletId ? {status:"connected"} : undefined, getSession: (id,sessionId) => id===owner?.agentletId && sessionId===gatewayConnection?.sessionId ? gatewayConnection : undefined };',
    'const getAgentletGateway = () => gateway;',
    'const forbidden = () => { throw new Error("Unexpected side effect in original handler regression"); };',
    'const ensureAcpSession = forbidden, forwardAcpPermissionRequestToCore = forbidden, answerProviderRunInput = forbidden, registerProviderRunInput = forbidden, removeProviderRunInput = forbidden, reportEntryState = forbidden;',
    originalRouteFunctions,
    originalPromptFunctions,
    originalPlugin,
    'export async function callOriginalHost(kind, params, body, entry, connectionOverride) {',
    '  owner=entry; if(!gatewayConnection) gatewayConnection={sessionId:params.sessionId,agentletId:params.agentletId,status:"connected",sessionProfile:{appId:entry.threadId}}; Object.assign(gatewayConnection,connectionOverride); entry.client._testConnection??=gatewayConnection; acpSessionRegistry.set(entry.agentletId,entry.threadId,entry);',
    '  if(!handlers.size) await continuationTransportRoutes({ post:(path,handler)=>handlers.set("POST "+path,handler), get:(path,handler)=>handlers.set("GET "+path,handler), log:{error:forbidden,warn:forbidden,info:()=>{}} });',
    '  const base="/continuation/agentlets/:agentletId/sessions/:sessionId"; const path=kind==="read"?base:base+"/"+kind; const handler=handlers.get((kind==="read"?"GET ":"POST ")+path); if(!handler)throw new Error("Original handler missing");',
    '  let status=200,returned; const reply={status:value=>{status=value;return reply},send:value=>{returned=value;return value}};',
    '  const result=await handler({params,body},reply); return {status,value:returned??result};',
    '}',
  ].join('\n')
  const handlerEntry=path.join(output,'actual-host-handlers.ts')
  await fs.writeFile(handlerEntry,handlerHarness)
  await buildPilotEntry(path.relative(root,handlerEntry),path.join(output,'actual-host-handlers.mjs'),'node',{coreLiveContinuation:true})
  const handlers=await import(pathToFileURL(path.join(output,'actual-host-handlers.mjs')).href)

  const {SqliteMetadataRepository,ConversationContinuationService,ProjectEventHub,ReceiverRuntimeService,HuabuAgentletContinuationAdapterV1,createMvpSampleSnapshot,createMixedScopeReadPort,registerMixedScopeReadPort}=owners
  const db=path.join(runtimeRoot,'metadata.sqlite')
  metadata=new SqliteMetadataRepository(db)
  const sample=createMvpSampleSnapshot(path.join(runtimeRoot,'project'),now);metadata.save(sample)
  const pid=String(sample.project.id), events=new ProjectEventHub()
  let service=new ConversationContinuationService(metadata,events)
  const target=new ReceiverRuntimeService(metadata,events).connectConversation({projectId:pid,conversationRef:'mixed-scope-target',executorId:'executor-test',provider:'codex',label:'合成续聊接收者'})

  async function fixture() {
    const bodies=['明确旧版本正文','明确新版本正文','任务实际产物全文']
    const files=[]
    for(const [i,body] of bodies.entries()){
      const observedPath=path.join(runtimeRoot,'source-'+i+'.md');await fs.writeFile(observedPath,body)
      files.push({id:'f'+i,projectId:pid,mimeType:'text/markdown',availability:'current',observedPath,observedHash:sha(body),size:Buffer.byteLength(body)})
    }
    const graph={project:{id:pid},scopes:[{id:'s',projectId:pid,kind:'context',name:'混合 Scope 完整引用',updatedAt:now}],
      artifacts:[{id:'a',projectId:pid,title:'同一材料两版',kind:'markdown',currentRevisionId:'r1'},{id:'out',projectId:pid,title:'真实已有产物',kind:'markdown',currentRevisionId:'r2'}],
      artifactViews:[{id:'v0',artifactId:'a',scopeId:'s',revisionId:'r0'},{id:'v1',artifactId:'a',scopeId:'s',revisionId:'r1'}],
      artifactRevisions:files.map((file,i)=>({id:'r'+i,artifactId:i===2?'out':'a',fileRecordId:file.id,contentHash:file.observedHash})),fileRecords:files,
      notes:[{id:'n',projectId:pid,body:'选中附注全文',updatedAt:now},{id:'other',projectId:pid,body:'未选附注不可混入',updatedAt:now}],
      collections:[{id:'c',projectId:pid,title:'外层集合'},{id:'inner',projectId:pid,title:'内层集合'}],
      collectionMemberships:[
        {collectionId:'c',relationId:'rel0',memberRef:{type:'collection',id:'inner'}},
        {collectionId:'c',relationId:'rel1',memberRef:{type:'scope',id:'s'}},
        {collectionId:'inner',relationId:'rel2',memberRef:{type:'note',id:'n'}},
        {collectionId:'inner',relationId:'rel3',memberRef:{type:'artifact',id:'a'}},
        {collectionId:'inner',relationId:'rel4',memberRef:{type:'run',id:'run'}}],
      workspaces:[{id:'w',projectId:pid,scopeId:'s',name:'原工作集',viewport:{x:999,y:777,zoom:2}}],
      workspaceMemberships:[{workspaceId:'w',artifactViewId:'v0'}],workspaceEntityMemberships:[{workspaceId:'w',entityType:'note',entityId:'n'}]}
    const presentations=[{id:'presentation:context:s',projectId:pid,scopeId:'s',capability:'context',version:2,updatedAt:now,
      state:{memberViewIds:['v0','v1'],memberEntityRefs:[{type:'collection',id:'c'},{type:'note',id:'n'},{type:'conversation',id:'cc'},{type:'run',id:'run'},{type:'workspace',id:'w'}]}}]
    const connected={id:'cc',projectId:pid,label:'原身份对话',conversationSessionId:'history'}
    const session={id:'history',projectId:pid,title:'完整历史',status:'ready',messageCount:205,updatedAt:now,sourceContentHash:'existing-archive-source'}
    const messages=Array.from({length:205},(_,i)=>({id:'m'+i,sessionId:'history',seq:i,role:i%2?'assistant':'user',contentText:'原对话第 '+i+' 条正文',fileRefs:[]}))
    messages[0].fileRefs=[{raw:'chosen-old.md',inProject:true,artifactId:'a',revisionId:'r0'}]
    const run={id:'run',projectId:pid,instruction:'既有任务指令',status:'completed',resultSummary:'已存任务结果',updatedAt:now}
    const returns=[{id:'return',runId:'run',targetArtifactId:'out',returnedFileId:'f2',draftRevisionId:'r2',contentHash:files[2].observedHash,status:'adopted'}]
    const fixtureMetadata={get:()=>copy(graph),listPresentationViews:()=>copy(presentations),getConnectedConversation:(_p,id)=>id==='cc'?copy(connected):undefined,getRun:id=>id==='run'?copy(run):undefined,getArtifactReturns:id=>id==='run'?copy(returns):[]}
    const history={inspectContextSource:async()=>({sourceContentHash:session.sourceContentHash,unsupportedMediaKinds:[]}),getProjection:(p,id)=>p===pid&&id==='history'?{session:copy(session)}:undefined,getMessages:(id,{offset,limit})=>id==='history'?copy(messages.slice(offset,offset+limit)):[]}
    const port=createMixedScopeReadPort(fixtureMetadata,history)
    registerMixedScopeReadPort(metadata,port)
    return {graph,presentations,connected,session,messages,run,returns,port}
  }
  async function workflowFixture() {
    const f=await fixture(),scope=f.graph.scopes.find(row=>row.id==='s')
    scope.kind='workflow';scope.name='两组完整方法'
    const extraFile=[]
    for(const [i,body] of ['乙组独有材料全文','乙组任务实际产物全文'].entries()){
      const observedPath=path.join(runtimeRoot,'workflow-b-'+i+'.md');await fs.writeFile(observedPath,body)
      const file={id:'fb'+i,projectId:pid,mimeType:'text/markdown',availability:'current',observedPath,observedHash:sha(body),size:Buffer.byteLength(body),modifiedAt:now,observedAt:now}
      extraFile.push(file);f.graph.fileRecords.push(file)
      f.graph.artifacts.push({id:i===0?'ab':'outb',projectId:pid,title:i===0?'乙组材料':'乙组任务产物',kind:'markdown',currentRevisionId:'rb'+i,availability:'current',createdAt:now,updatedAt:now})
      f.graph.artifactRevisions.push({id:'rb'+i,artifactId:i===0?'ab':'outb',fileRecordId:file.id,contentHash:file.observedHash,status:'current',source:'import',createdAt:now})
    }
    f.graph.artifactViews.push({id:'vb',artifactId:'ab',scopeId:'s',revisionId:'rb0'})
    f.graph.notes.push({id:'nb',projectId:pid,body:'乙组独有附注正文\n保留：乙组标识',createdAt:now,updatedAt:now})
    f.graph.collections.push({id:'cb',projectId:pid,title:'乙组独有集合'})
    f.graph.collectionMemberships.push({collectionId:'cb',relationId:'b-note',memberRef:{type:'note',id:'nb'}},{collectionId:'cb',relationId:'b-view',memberRef:{type:'view',id:'vb'}})
    const connectedB={id:'ccb',projectId:pid,label:'乙组独有对话',conversationSessionId:'history-b'}
    const sessionB={id:'history-b',projectId:pid,status:'ready',messageCount:2,title:'乙组完整历史',updatedAt:now,sourceContentHash:'existing-workflow-b-archive'}
    const messagesB=Array.from({length:2},(_,i)=>({id:'bm'+i,sessionId:sessionB.id,seq:i,role:i?'assistant':'user',contentText:'乙组独有对话全文 '+i,fileRefs:[]}))
    const runB={id:'run-b',projectId:pid,instruction:'乙组已有任务原指令',status:'completed',resultSummary:'乙组已存任务结果',updatedAt:now}
    const returnsB=[{id:'returned-b',runId:runB.id,targetArtifactId:'outb',returnedFileId:'fb1',draftRevisionId:'rb1',contentHash:extraFile[1].observedHash,status:'adopted'}]
    const resolve=f.port.resolveConversation,inspect=f.port.inspectConversationSource,history=f.port.getConversationMessages,getRun=f.port.getRun,getReturns=f.port.getRunReturns
    f.port.resolveConversation=(project,id)=>id==='ccb'?{connected:copy(connectedB),session:copy(sessionB)}:resolve(project,id)
    f.port.inspectConversationSource=(project,id)=>id===sessionB.id?{sourceContentHash:sessionB.sourceContentHash,unsupportedMediaKinds:[]}:inspect(project,id)
    f.port.getConversationMessages=(id,input)=>id===sessionB.id?copy(messagesB.slice(input.offset,input.offset+input.limit)):history(id,input)
    f.port.getRun=id=>id===runB.id?copy(runB):getRun(id)
    f.port.getRunReturns=id=>id===runB.id?copy(returnsB):getReturns(id)
    const a={...copy(f.presentations[0]),id:'workflow:a',capability:'workflow',version:4,state:{...copy(f.presentations[0].state),
      memberViewIds:['v0','v1','legacy-a-op'],
      workflowActions:[{id:'a-read',label:'甲组核对步骤',description:'甲组步骤原说明',attachedViewIds:['v1'],x:11,y:12},{id:'a-write',label:'甲组整理步骤',attachedViewIds:[],x:21,y:22}],
      workflowActionEdges:[{id:'edge-a',fromActionId:'a-read',toActionId:'a-write',label:'甲组连线条件'}],
      workflowOperators:{v0:{kind:'reference',label:'甲组真实材料的运算说明'},'legacy-a-op':{kind:'condition',label:'甲组独有条件',branches:[{id:'branch-a',label:'甲组通过',predicateText:'甲组已核对',targetViewId:'v1'}]}}}}
    const b={id:'workflow:b',projectId:pid,scopeId:'s',capability:'workflow',version:9,updatedAt:now,state:{memberViewIds:['vb','legacy-b-op'],
      memberEntityRefs:[{type:'collection',id:'cb'},{type:'note',id:'nb'},{type:'conversation',id:'ccb'},{type:'run',id:'run-b'}],
      workflowActions:[{id:'b-read',label:'乙组核对步骤',description:'乙组步骤原说明',attachedViewIds:['vb'],x:31,y:32},{id:'b-write',label:'乙组输出步骤',attachedViewIds:[],x:41,y:42}],
      workflowActionEdges:[{id:'edge-b',fromActionId:'b-read',toActionId:'b-write',label:'乙组连线条件'}],
      workflowOperators:{'legacy-b-op':{kind:'condition',label:'乙组独有条件',branches:[{id:'branch-b',label:'乙组通过',predicateText:'乙组已核对',targetViewId:'vb'}]}}}}
    // Deliberately reversed storage order: the transport must still retain every group in stable id order.
    f.presentations.splice(0,f.presentations.length,b,a)
    return Object.assign(f,{connectedB,sessionB,messagesB,runB,returnsB})
  }
  class LocalTransport {
    kind='fake';attachCalls=[];promptCalls=[];resourceCalls=[];failAttach=false;failSend=false
    async attachContext(params){
      const manifest=host.asContextManifestBody(params)
      assert.ok(manifest,'Actual Host parser must accept original attached manifest')
      this.attachCalls.push(copy(params))
      if(this.failAttach)throw new Error('Local attach refused')
      return {attachmentId:manifest.attachmentId,messageId:params.messageId,correlationId:params.correlationId}
    }
    async sendPrompt(params){
      const attachment=params.contextAttachment===undefined?undefined:host.asContextAttachment(params.contextAttachment,params.threadId,params.externalSessionId)
      if(params.contextAttachment!==undefined)assert.ok(attachment,'Actual Host prompt parser must accept the same original attachment')
      const blocks=attachment===undefined?[]:host.continuationReferenceBlocks(attachment)
      this.promptCalls.push(copy(params));this.resourceCalls.push(copy(blocks))
      if(this.failSend)throw new Error('prompt timed out')
      return {externalSessionId:'native-local',transportSessionId:'transport-local',threadId:'thread-local',text:'本地传输验证完成'}
    }
  }
  let serial=0
  function operation(){
    const id='scope-operation-'+(++serial)
    service.submit({schemaVersion:1,projectId:pid,connectedConversationId:target.id,operationId:id,mode:'continue_existing',contextInheritance:'inherit',checkout:'shared',provider:'codex'})
    service.advanceStep(pid,id,{step:'external_create',outcome:'confirmed',externalEvidence:{schemaVersion:1,provider:'codex',externalSessionId:'native-local',transportSessionId:'transport-local',threadId:'thread-local',correlationId:id,createdAt:now}})
    return id
  }
  const references=[{order:7,mode:'full',ref:{type:'scope',scopeId:'s'}}]
  const send=(id,t,message='message-'+id,refs=references)=>service.sendPrompt(pid,id,{kind:'prompt',text:'沿原对话使用完整上下文'},new HuabuAgentletContinuationAdapterV1(t,{adapterId:'mixed-local'}),message,{messageId:message,orderedReferences:refs})
  const wireValue=value=>JSON.parse(JSON.stringify(value))
  function assertWorkflowAttachment(attachment,f,blocks,address) {
    assert.ok(host.asContextAttachment(attachment,address.threadId,address.externalSessionId),'Original Host parser accepts complete multi-group Scope at its actual operation thread')
    const evidence=attachment.contextResolution[0],body=attachment.resolvedReferences[0].text
    assert.equal(evidence.kind,'scope');assert.equal(evidence.presentationId,'workflow:a');assert.equal(evidence.text,body)
    const root=evidence.members.find(row=>row.ref.type==='scope'&&row.path.length===1)
    assert.deepEqual(root.source.presentations.map(row=>[row.id,row.version]),[['workflow:a',4],['workflow:b',9]])
    assert.deepEqual(root.source.presentation,root.source.presentations[0])
    for(const source of root.source.presentations){
      const original=f.presentations.find(row=>row.id===source.id)
      assert.deepEqual(source.memberViewIds,original.state.memberViewIds);assert.deepEqual(source.memberEntityRefs,original.state.memberEntityRefs)
      assert.deepEqual(wireValue(source.actions),wireValue(original.state.workflowActions.map(({x,y,...action})=>action)))
      assert.deepEqual(source.actionEdges,original.state.workflowActionEdges);assert.deepEqual(source.operators,original.state.workflowOperators)
    }
    const parsed=JSON.parse(body)
    assert.deepEqual(parsed.root.source,wireValue(root.source))
    assert.ok(parsed.root.children.some(row=>row.ref.type==='view'&&row.ref.id==='v0'&&row.path[1]==='presentation:workflow:a'),'Real View sharing operator id is not dropped')
    const members=[['workflow:a',['collection:c','note:n','conversation:cc','run:run']],['workflow:b',['collection:cb','note:nb','conversation:ccb','run:run-b']]]
    for(const [id,refs] of members)for(const ref of refs)assert.ok(evidence.members.some(row=>row.path[1]==='presentation:'+id&&row.ref.type+':'+row.ref.id===ref),id+' owns '+ref)
    for(const token of ['外层集合','选中附注全文','原对话第 204 条正文','既有任务指令','任务实际产物全文','乙组独有材料全文','乙组独有集合','乙组独有附注正文','乙组独有对话全文 1','乙组已有任务原指令','乙组已存任务结果','乙组任务实际产物全文','甲组核对步骤','甲组步骤原说明','甲组连线条件','甲组独有条件','乙组核对步骤','乙组步骤原说明','乙组连线条件','乙组独有条件','乙组已核对'])assert.ok(body.includes(token),token)
    assert.ok(!body.includes('未选附注不可混入'));assert.ok(!body.includes('viewport'))
    const resource=blocks.find(row=>row.type==='resource')
    assert.equal(resource.resource.text,body);assert.deepEqual(resource._meta.lcos.resolution.members,evidence.members)
    assert.deepEqual(resource._meta.lcos.resolution.members.find(row=>row.ref.type==='scope'&&row.path.length===1).source.presentations,root.source.presentations)
    return {root,body,evidence}
  }
  let f=await fixture(), op=operation(), t=new LocalTransport()
  const before=copy({graph:f.graph,presentations:f.presentations,messages:f.messages,run:f.run,returns:f.returns})
  let result=await send(op,t)
  assert.equal(result.outcome,'sent');assert.equal(t.attachCalls.length,1);assert.equal(t.promptCalls.length,1)
  const attachment=t.promptCalls[0].contextAttachment
  assert.deepEqual(attachment.orderedReferences,references);assert.equal(attachment.resolvedReferences.length,1)
  const body=attachment.resolvedReferences[0].text
  for(const token of ['明确旧版本正文','明确新版本正文','外层集合','内层集合','选中附注全文','原对话第 204 条正文','既有任务指令','已存任务结果','任务实际产物全文','backReference'])assert.ok(body.includes(token),token)
  assert.ok(!body.includes('未选附注不可混入'));assert.ok(!body.includes('viewport'))
  const scopeEvidence=attachment.contextResolution[0]
  assert.ok(scopeEvidence.members.some(row=>row.path.some(part=>part.includes('attachment'))&&row.source.revision?.id==='r0'),'Historical attachment must carry explicit old revision text')
  assert.equal(scopeEvidence.kind,'scope');assert.equal(scopeEvidence.text,body);assert.equal(scopeEvidence.artifactId,undefined);assert.ok(scopeEvidence.members.some(row=>row.ref.type==='conversation'))
  assert.equal(t.resourceCalls[0][0].resource.text,body);assert.equal(t.resourceCalls[0][0]._meta.lcos.resolution.scopeId,'s')
  assert.deepEqual(before,{graph:f.graph,presentations:f.presentations,messages:f.messages,run:f.run,returns:f.returns})
  await fs.writeFile(path.join(output,'actual-context-attachment.json'),JSON.stringify(attachment,null,2))
  report.checks.push('Original service, SQLite journal and Huabu adapter attach one Scope through actual Host parser/ACP resource blocks: nested Collections, selected Notes, 205-history pagination, Runs/outputs, Workspaces, v1/v2 and cycle provenance all reach text; no unselected Note or camera.')
  await send(op,t);assert.equal(t.attachCalls.length,1);assert.equal(t.promptCalls.length,1)



  const conflict=await send(op,t,undefined,[{...references[0],order:8}]);assert.equal(conflict.error.code,'prompt_reference_conflict');assert.equal(t.promptCalls.length,1)
  report.checks.push('Same sent message returns the original receipt without a second attach or prompt; reference/order conflict cannot overwrite it.')

  f=await workflowFixture();op=operation();t=new LocalTransport();result=await send(op,t)
  assert.equal(result.outcome,'sent');assert.equal(t.attachCalls.length,1);assert.equal(t.promptCalls.length,1)
  const workflowAttachment=copy(t.promptCalls[0].contextAttachment)
  assertWorkflowAttachment(workflowAttachment,f,t.resourceCalls[0],t.promptCalls[0])
  assert.deepEqual(metadata.getContinuationOperationJournal(pid,op).promptReceipts[0].contextResolution,wireValue(workflowAttachment.contextResolution))
  await send(op,t);assert.equal(t.attachCalls.length,1);assert.equal(t.promptCalls.length,1)
  f.presentations.reverse();op=operation();t=new LocalTransport();result=await send(op,t)
  assert.equal(result.outcome,'sent');assert.equal(t.promptCalls[0].contextAttachment.resolvedReferences[0].text,workflowAttachment.resolvedReferences[0].text,'Storage enumeration order does not change the whole Workflow')
  assert.deepEqual(t.promptCalls[0].contextAttachment.contextResolution,workflowAttachment.contextResolution)
  await fs.writeFile(path.join(output,'workflow-multiple-presentations-attachment.json'),JSON.stringify(workflowAttachment,null,2))
  report.checks.push('Original continuation service and SQLite receipt keep every group in one Scope. Original Host parser and ACP resource blocks round-trip both actual source ids/versions, exclusive Collection/Note/Conversation/Run/output bodies and complete actions/edges/operators with group-specific paths; reversing stored groups changes neither text nor evidence. Real View/operator identity overlap remains a material.')

  for(const [name,mutate] of [
    ['second group missing Note',f=>f.graph.notes.splice(f.graph.notes.findIndex(row=>row.id==='nb'),1)],
    ['second group unsupported material',f=>{f.graph.fileRecords.find(row=>row.id==='fb0').mimeType='image/png'}],
    ['second group unlinked Conversation',f=>{f.connectedB.conversationSessionId='unlinked'}],
    ['second group incomplete history',f=>{f.messagesB.pop()}],
    ['second group missing Run',f=>{const get=f.port.getRun;f.port.getRun=id=>id==='run-b'?undefined:get(id)}],
    ['second group source changed during read',f=>{const read=f.port.readTextFile;let changed=false;f.port.readTextFile=async(...args)=>{const body=await read(...args);if(!changed){changed=true;f.presentations.find(row=>row.id==='workflow:b').state.workflowActions[0].description='读取期间步骤发生变化'}return body}}],
    ['group added during read',f=>{const read=f.port.readTextFile;let changed=false;f.port.readTextFile=async(...args)=>{const body=await read(...args);if(!changed){changed=true;f.presentations.push({...copy(f.presentations[0]),id:'workflow:c'})}return body}}],
  ]){
    f=await workflowFixture();mutate(f);op=operation();t=new LocalTransport();result=await send(op,t)
    assert.equal(result.outcome,'unsupported',name);assert.equal(t.attachCalls.length,0,name);assert.equal(t.promptCalls.length,0,name)
    const receipt=metadata.getContinuationOperationJournal(pid,op).promptReceipts[0]
    assert.deepEqual(receipt.orderedReferences,references,name);assert.equal(receipt.contextResolution?.length??0,0,name)
    assert.equal(metadata.getProjectRuns(pid,1000).length,0,name)
  }
  report.checks.push('Any unreadable second-group member, incomplete archive or selected source/group-set mutation fails the whole Workflow before attach or prompt. The original one-Scope request stays journaled; no partial context, new Run or provider send is created.')
  f=await fixture();op=operation()
  const implicitReferences=[{order:0,ref:{type:'scope',scopeId:'s'}}]
  const wireOriginal=copy(implicitReferences),httpCalls=[],acpCalls=[]
  const originalFetch=globalThis.fetch
  let liveOwner
  const initializeOwner=threadId=>{
    if(liveOwner?.threadId===threadId)return liveOwner
    return liveOwner={
    agentletId:'mixed-local-agentlet',threadId,sessionId:'native-local',persistedToDisk:true,selectionsReplay:Promise.resolve(),
    client:{isClosed:false,transportSessionId:'transport-local',initializeResult:{agentCapabilities:{promptCapabilities:{embeddedContext:true}}},
      shutdown(){this.isClosed=true},
      isConnectedTo(connection){return !this.isClosed&&connection===this._testConnection&&connection?.status==='connected'},
      resolvePermission(){throw new Error('No permission request expected in this local regression')},
      async prompt(sessionId,blocks,onUpdate){
        acpCalls.push(copy({sessionId,blocks}))
        onUpdate({sessionUpdate:'agent_message_chunk',content:{type:'text',text:'本地原ACP helper受控响应'}})
        return {stopReason:'end_turn'}
      }},
    }
  }
  try {
    globalThis.fetch=async(url,init)=>{
      const parsed=new URL(url)
      assert.equal(parsed.origin,'http://original-host.test');assert.equal(init.method,'POST')
      const match=/^\/api\/acp\/continuation\/agentlets\/([^/]+)\/sessions\/([^/]+)\/(context-attachments|prompt)$/.exec(parsed.pathname)
      assert(match)
      const body=JSON.parse(init.body),owner=initializeOwner(body.threadId)
      httpCalls.push(copy({kind:match[3],body}))
      const response=await handlers.callOriginalHost(match[3],{agentletId:decodeURIComponent(match[1]),sessionId:decodeURIComponent(match[2])},body,owner)
      return new Response(JSON.stringify(response.value),{status:response.status,headers:{'content-type':'application/json'}})
    }
    const realHostTransport=new owners.HuabuAgentletHostTransportV1({hostBaseUrl:'http://original-host.test',agentletId:'mixed-local-agentlet'})
    const actualAdapter=new HuabuAgentletContinuationAdapterV1(realHostTransport,{agentletId:'mixed-local-agentlet',adapterId:'original-host-wire-audit'})
    const message='omitted-mode-wire-message'
    result=await service.sendPrompt(pid,op,{kind:'prompt',text:'完整 Scope 默认正文'},actualAdapter,message,{messageId:message,orderedReferences:implicitReferences})
    assert.equal(result.outcome,'sent')
    assert.equal(httpCalls.length,2);assert.equal(acpCalls.length,1)
    assert.deepEqual(httpCalls.map(call=>call.kind),['context-attachments','prompt'])
    assert.equal(httpCalls[0].body.orderedReferences[0].mode,'full')
    assert.equal(httpCalls[1].body.contextAttachment.orderedReferences[0].mode,'full')
    assert.equal(httpCalls[1].body.contextAttachment.contextResolution[0].mode,'full')
    assert.equal(httpCalls[1].body.contextAttachment.resolvedReferences[0].mode,'full')
    assert.deepEqual(implicitReferences,wireOriginal)
    const journal=metadata.getContinuationOperationJournal(pid,op)
    const turn=journal.promptReceipts.find(receipt=>receipt.messageId===message)
    assert.deepEqual(turn.orderedReferences,wireOriginal)
    assert.equal(turn.attachReceipt.outcome,'attached')
    assert.equal(turn.sendReceipt.outcome,'sent')
    const resource=acpCalls[0].blocks.find(item=>item.type==='resource')
    assert.equal(resource._meta.lcos.mode,'full')
    assert.equal(resource._meta.lcos.resolution.kind,'scope')
    for(const token of ['选中附注全文','原对话第 204 条正文','既有任务指令','任务实际产物全文','明确旧版本正文','明确新版本正文'])assert(resource.resource.text.includes(token),token)
    assert.equal(acpCalls[0].sessionId,'native-local')
    const params={agentletId:liveOwner.agentletId,sessionId:'transport-local'}
    // Actual daemon hello does not carry appId: original Host GET must project exact owner from the original registry/connection.
    const withoutAppId=await handlers.callOriginalHost('read',params,undefined,liveOwner,{sessionProfile:{agent:{pid:99,cwd:'isolated'}}})
    assert.equal(withoutAppId.status,200);assert.equal(withoutAppId.value.externalSessionId,'native-local');assert.equal(withoutAppId.value.threadId,liveOwner.threadId)
    assert.equal(withoutAppId.value.transportSessionId,'transport-local')
    const wrongHint=await handlers.callOriginalHost('read',params,undefined,liveOwner,{sessionProfile:{appId:'another-thread'}})
    assert.equal(wrongHint.value.externalSessionId,undefined);assert.equal(wrongHint.value.threadId,undefined)
    liveOwner.client.isClosed=true
    const closedOwner=await handlers.callOriginalHost('read',params,undefined,liveOwner,{sessionProfile:{}})
    assert.equal(closedOwner.value.externalSessionId,undefined);assert.equal(closedOwner.value.threadId,undefined)
    liveOwner.client.isClosed=false
    const legacyUnnormalized=copy(httpCalls[0].body);delete legacyUnnormalized.orderedReferences[0].mode
    assert.equal((await handlers.callOriginalHost('context-attachments',params,legacyUnnormalized,liveOwner)).status,400,'Reproduce the real failure against the unchanged running Host comparison')
    for(const mutate of [
      body=>{body.orderedReferences[0].mode='summary'},
      body=>{body.orderedReferences[0].ref.scopeId='unrelated-scope'},
      body=>{body.orderedReferences.push(copy(body.orderedReferences[0]))},
      body=>{body.orderedReferences[0].order=88},
    ]){
      const body=copy(httpCalls[0].body);mutate(body)
      assert.equal((await handlers.callOriginalHost('context-attachments',params,body,liveOwner)).status,400)
    }
    const wrongPrompt=copy(httpCalls[1].body);wrongPrompt.contextAttachment.resolvedReferences[0].mode='summary'
    assert.equal((await handlers.callOriginalHost('prompt',params,wrongPrompt,liveOwner)).status,400)
    assert.equal(acpCalls.length,1)
    result=await service.sendPrompt(pid,op,{kind:'prompt',text:'完整 Scope 默认正文'},actualAdapter,message,{messageId:message,orderedReferences:implicitReferences})
    assert.equal(result.outcome,'sent');assert.equal(httpCalls.length,2);assert.equal(acpCalls.length,1)

    f=await workflowFixture();op=operation()
    const workflowMessage='workflow-original-host-wire-message'
    result=await service.sendPrompt(pid,op,{kind:'prompt',text:'完整双组方法原发送'},actualAdapter,workflowMessage,{messageId:workflowMessage,orderedReferences:implicitReferences})
    assert.equal(result.outcome,'sent');assert.equal(httpCalls.length,4);assert.equal(acpCalls.length,2)
    const wireAttachment=httpCalls[3].body.contextAttachment
    assertWorkflowAttachment(wireAttachment,f,acpCalls[1].blocks,httpCalls[3].body)
    const workflowTurn=metadata.getContinuationOperationJournal(pid,op).promptReceipts.find(row=>row.messageId===workflowMessage)
    assert.deepEqual(workflowTurn.contextResolution,wireAttachment.contextResolution)
    assert.deepEqual(workflowTurn.orderedReferences,implicitReferences)
    assert.equal(workflowTurn.attachReceipt.outcome,'attached');assert.equal(workflowTurn.sendReceipt.outcome,'sent')
    assert.equal(acpCalls[1].sessionId,'native-local')
    await fs.writeFile(path.join(output,'workflow-original-host-acp-roundtrip.json'),JSON.stringify({requests:httpCalls.slice(2),acp:acpCalls[1],journal:workflowTurn},null,2))
    result=await service.sendPrompt(pid,op,{kind:'prompt',text:'完整双组方法原发送'},actualAdapter,workflowMessage,{messageId:workflowMessage,orderedReferences:implicitReferences})
    assert.equal(result.outcome,'sent');assert.equal(httpCalls.length,4);assert.equal(acpCalls.length,2)
  } finally {globalThis.fetch=originalFetch}
  report.checks.push('Real no-appId Host GET projects native/thread only from exact original registry transport owner; conflicting appId/closed owner withhold identity. Real omitted-mode regression: original service + original HostTransport HTTP serialization + unchanged running Host attachment/prompt handlers + original ACP prompt helper accept full Scope with only wire mode normalized to full. SQLite refs remain omitted, attached/sent receipts persist, all member text reaches ACP resource, retries do not POST again. Explicit summary, wrong Scope/order, duplicate order and conflicting prompt mode still fail before ACP.')
  report.checks.push('Whole multi-group Workflow also travels through original HostTransport serialization, original attachment/prompt HTTP handlers and original ACP prompt helper to the controlled provider client. SQLite and ACP retain complete source.presentations metadata and every exclusive member; retry repeats no HTTP or ACP call. No service, actual model or Run dispatch is started.')

  for(const [name,mutate] of [
    ['missing Note',f=>f.graph.notes.splice(0,1)],
    ['unlinked Conversation',f=>f.connected.conversationSessionId='different'],
    ['incomplete history',f=>f.messages.pop()],
    ['missing archive',f=>{f.port.inspectConversationSource=()=>{throw new Error('原archive不存在')}}],
    ['changed archive',f=>{f.port.inspectConversationSource=()=>({sourceContentHash:'different-archive',unsupportedMediaKinds:[]})}],
    ['unsupported archive media',f=>{f.port.inspectConversationSource=()=>({sourceContentHash:'existing-archive-source',unsupportedMediaKinds:['image']})}],
    ['unresolved history file',f=>{f.messages[0].fileRefs=[{inProject:false,raw:'missing.png'}]}],
    ['history file lacks original revision',f=>{delete f.messages[0].fileRefs[0].revisionId}],
    ['missing Run',f=>{f.port.getRun=()=>undefined}],
    ['binary content',f=>{f.graph.fileRecords[0].mimeType='image/png'}],
    ['budget',f=>{f.graph.notes[0].body='超'.repeat(200_001)}],
  ]){
    f=await fixture();mutate(f);op=operation();t=new LocalTransport();result=await send(op,t)
    assert.equal(result.outcome,'unsupported',name);assert.equal(t.attachCalls.length,0,name);assert.equal(t.promptCalls.length,0,name)
    assert.ok(metadata.getContinuationOperationJournal(pid,op).promptReceipts[0].orderedReferences.length===1,name)
  }
  report.checks.push('Missing Note/Run, broken linked Conversation, incomplete history, binary material and budget fail the whole Scope before attach/send; same original Scope reference remains in receipt.')

  for(const mutate of [
    f=>{f.graph.notes[0].body='同时间但不同附注正文'},
    f=>{f.messages[0].contentText='同时间但不同对话正文'},
    f=>{f.run.resultSummary='任务结果已改变'},
    f=>{f.graph.collectionMemberships.reverse()},
  ]){
    f=await fixture();op=operation();t=new LocalTransport();t.failAttach=true
    result=await send(op,t);assert.equal(result.outcome,'outcome_unknown');assert.equal(t.promptCalls.length,0)
    const retained=copy(metadata.getContinuationOperationJournal(pid,op).promptReceipts[0].contextResolution)
    mutate(f);t.failAttach=false;result=await send(op,t)
    assert.equal(result.error.code,'context_resolution_conflict');assert.equal(t.attachCalls.length,1);assert.equal(t.promptCalls.length,0)
    assert.deepEqual(metadata.getContinuationOperationJournal(pid,op).promptReceipts[0].contextResolution,retained)
  }
  report.checks.push('Retry compares original complete evidence/text: same-timestamp Note/history changes, Run result and membership reorder refuse replacement, preserve original receipt and never send a partial/new version.')

  f=await fixture();op=operation();t=new LocalTransport();t.failSend=true
  result=await send(op,t);assert.equal(result.outcome,'outcome_unknown')
  const original=copy(t.promptCalls[0].contextAttachment)
  metadata.close();metadata=new SqliteMetadataRepository(db);service=new ConversationContinuationService(metadata,events);registerMixedScopeReadPort(metadata,f.port)
  const retry=new LocalTransport();result=await send(op,retry)
  assert.equal(result.outcome,'sent');assert.equal(retry.attachCalls.length,0);assert.equal(retry.promptCalls.length,1)
  assert.deepEqual(retry.promptCalls[0].contextAttachment,original)
  await send(op,retry);assert.equal(retry.promptCalls.length,1)
  report.checks.push('Explicit retry after SQLite reopen uses the original confirmed attachment, stable message/session/thread and identical full Scope; no repeat attach or later duplicate send.')

  f=await fixture();op=operation();t=new LocalTransport();t.failSend=true
  result=await send(op,t);assert.equal(result.outcome,'outcome_unknown')
  const confirmed=copy(metadata.getContinuationOperationJournal(pid,op).promptReceipts[0].attachReceipt), bodyBefore=f.graph.notes[0].body
  f.graph.notes[0].body='读取失败后不能覆盖已确认附加事实';result=await send(op,t)
  assert.equal(result.error.code,'context_resolution_conflict');assert.equal(t.attachCalls.length,1);assert.equal(t.promptCalls.length,1)
  assert.deepEqual(metadata.getContinuationOperationJournal(pid,op).promptReceipts[0].attachReceipt,confirmed)
  f.graph.notes[0].body=bodyBefore;t.failSend=false;result=await send(op,t)
  assert.equal(result.outcome,'sent');assert.equal(t.attachCalls.length,1);assert.equal(t.promptCalls.length,2)
  report.checks.push('A later Scope read conflict never replaces a previously confirmed attachment fact; restoring exact original content reuses that attachment without duplication.')

  const malformed=copy(original);malformed.contextResolution[0].scopeId='foreign'
  assert.equal(host.asContextAttachment(malformed,'thread-local','native-local'),undefined)
  const substituted=copy(original);substituted.resolvedReferences[0].text='偷偷省掉全部内容'
  assert.equal(host.asContextAttachment(substituted,'thread-local','native-local'),undefined)
  const missingEvidence=copy(original);delete missingEvidence.contextResolution[0].members
  assert.equal(host.asContextAttachment(missingEvidence,'thread-local','native-local'),undefined)
  report.checks.push('Original Host validation rejects wrong Scope identity, substituted payload body or missing member evidence before ACP prompt.')

  op=operation();t=new LocalTransport()
  const artifact=[{order:0,mode:'full',ref:{type:'artifact',artifactId:'artifact-brief',revisionId:'revision-brief-initial'}}]
  result=await send(op,t,undefined,artifact);assert.equal(result.outcome,'sent');assert.match(t.promptCalls[0].contextAttachment.resolvedReferences[0].text,/PortaSplit MVP Brief/)
  assert.equal(t.promptCalls[0].contextAttachment.contextResolution[0].artifactId,'artifact-brief')
  const viewId=String(metadata.getArtifactViews('artifact-brief')[0].id)
  op=operation();t=new LocalTransport();result=await send(op,t,undefined,[{order:0,mode:'full',ref:{type:'view',viewId}}])
  assert.equal(result.outcome,'sent');assert.match(t.promptCalls[0].contextAttachment.resolvedReferences[0].text,/PortaSplit MVP Brief/)
  assert.equal(t.promptCalls[0].contextAttachment.contextResolution[0].revisionId,'revision-brief-initial')
  op=operation();t=new LocalTransport();result=await send(op,t,undefined,[{order:0,ref:{type:'artifact',artifactId:'missing'}}])
  assert.equal(result.outcome,'unsupported');assert.equal(t.promptCalls.length,0)
  report.checks.push('Original Artifact/View content path retains real FileRecord/Revision/hash evidence and missing-material rejection unchanged.')
  assert.equal(metadata.getProjectRuns(pid,1000).length,0)
  report.passed=true
} catch(error) {
  report.error={name:error.name,message:error.message,stack:error.stack};process.exitCode=1
} finally {
  try{metadata?.close()}catch{}
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify({report:path.join(output,'report.json'),passed:report.passed,checks:report.checks.length,...(report.error?{error:report.error}:{} )},null,2))
}
