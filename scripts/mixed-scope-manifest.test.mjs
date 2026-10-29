import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root=process.cwd(), output=path.join(root,'output/混合Scope取用_20261022/普通任务原Manifest',new Date().toISOString().replaceAll(':','-'))
await fs.mkdir(output,{recursive:true});await fs.mkdir(path.join(root,'.runtime'),{recursive:true})
const runtimeRoot=await fs.mkdtemp(path.join(root,'.runtime/mixed-scope-manifest-'))
const now='2026-10-22T12:30:00.000Z',copy=value=>structuredClone(value),sha=value=>createHash('sha256').update(value).digest('hex')
const report={passed:false,checks:[],controlledReadPort:true,realBrowserVerified:false,dispatchCalls:0,networkAttempts:[]}
const originalFetch=globalThis.fetch
globalThis.fetch=async input=>{report.networkAttempts.push(String(input));throw new Error('This isolated test has no network transport.')}
let metadata
try {
  const entry=path.join(output,'actual-manifest-owners.ts'), prefix=path.relative(output,root).replaceAll('\\','/')+'/'
  await fs.writeFile(entry,[
    "export {ContextManifestService} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/context-manifest-service.ts'),
    "export {RuntimeApplicationService} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/runtime-application-service.ts'),
    "export {RuntimeReviewService} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/runtime-review-service.ts'),
    "export {SqliteMetadataRepository} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/metadata-repository.ts'),
    "export {createMvpSampleSnapshot} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/mvp-sample-project.ts'),
    "export {handleF6AssemblyRoute} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/routes/f6-assembly.ts'),
    "export {handleRunsRoute} from "+JSON.stringify(prefix+'lcos/apps/local-core/src/routes/runs.ts'),
    "export {createMixedScopeReadPort,registerMixedScopeReadPort} from "+JSON.stringify(prefix+'lab/pilot/mixed-scope-context.ts'),
  ].join('\n'))
  await buildPilotEntry(path.relative(root,entry),path.join(output,'actual-manifest-owners.mjs'),'node',{coreMixedScopeContext:true})
  const {ContextManifestService,RuntimeApplicationService,RuntimeReviewService,SqliteMetadataRepository,createMvpSampleSnapshot,handleF6AssemblyRoute,handleRunsRoute,createMixedScopeReadPort,registerMixedScopeReadPort}=await import(pathToFileURL(path.join(output,'actual-manifest-owners.mjs')).href)
  metadata=new SqliteMetadataRepository(path.join(runtimeRoot,'metadata.sqlite'))
  const sample=createMvpSampleSnapshot(path.join(runtimeRoot,'project'),now);metadata.save(sample)
  const pid=String(sample.project.id), originalGet=metadata.get.bind(metadata), originalWrite=metadata.createContextManifest.bind(metadata)
  let manifestWrites=0,serial=0

  async function fixture() {
    const graph=copy(originalGet(pid)), scopes=graph.scopes, s={...scopes[0],id:'s',kind:'context',name:'整份混合 Scope',parentScopeId:scopes[0].id}
    scopes.push(s)
    const texts=['明确旧版本全文','明确新版本全文','任务实际已有产物全文'],files=[]
    for(const [i,text] of texts.entries()){
      const observedPath=path.join(runtimeRoot,'material-'+i+'.md');await fs.writeFile(observedPath,text)
      files.push({id:'f'+i,projectId:pid,mimeType:'text/markdown',availability:'current',observedPath,observedHash:sha(text),size:Buffer.byteLength(text),modifiedAt:now,observedAt:now})
    }
    graph.artifacts.push({id:'a',projectId:pid,title:'同材料两版本',kind:'markdown',currentRevisionId:'r1',availability:'current',createdAt:now,updatedAt:now},
      {id:'out',projectId:pid,title:'Run实际产物',kind:'markdown',currentRevisionId:'r2',availability:'current',createdAt:now,updatedAt:now})
    graph.fileRecords.push(...files)
    graph.artifactRevisions.push(...files.map((file,i)=>({id:'r'+i,artifactId:i===2?'out':'a',fileRecordId:file.id,contentHash:file.observedHash,status:i===0?'superseded':'current',source:'import',createdAt:now})))
    graph.artifactViews.push({id:'v0',artifactId:'a',scopeId:'s',revisionId:'r0'},{id:'v1',artifactId:'a',scopeId:'s',revisionId:'r1'})
    graph.notes.push({id:'n',projectId:pid,anchor:{type:'scope',scopeId:'s'},body:'选中附注正文\n保留：品牌名',createdAt:now,updatedAt:now},
      {id:'N2',projectId:pid,anchor:{type:'project'},body:'未选附注N2不能泄漏',createdAt:now,updatedAt:now})
    graph.collections=[{id:'c',projectId:pid,title:'外层集合'},{id:'inner',projectId:pid,title:'内层集合'},{id:'legacy',projectId:pid,title:'原Collection'}]
    graph.collectionMemberships=[
      {collectionId:'c',relationId:'rel0',memberRef:{type:'collection',id:'inner'}},
      {collectionId:'c',relationId:'rel1',memberRef:{type:'scope',id:'s'}},
      {collectionId:'inner',relationId:'rel2',memberRef:{type:'note',id:'n'}},
      {collectionId:'inner',relationId:'rel3',memberRef:{type:'artifact',id:'a'}},
      {collectionId:'inner',relationId:'rel4',memberRef:{type:'run',id:'member-run'}},
      {collectionId:'legacy',relationId:'legacy-rel1',memberRef:{type:'artifact',id:'a'}},
      {collectionId:'legacy',relationId:'legacy-rel2',memberRef:{type:'note',id:'n'}}]
    graph.workspaces.push({id:'w',projectId:pid,scopeId:'s',name:'工作集',viewport:{x:886,y:778,zoom:3},updatedAt:now})
    graph.workspaceMemberships=[...(graph.workspaceMemberships??[]),{workspaceId:'w',artifactViewId:'v0'}]
    graph.workspaceEntityMemberships=[...(graph.workspaceEntityMemberships??[]),{workspaceId:'w',entityType:'note',entityId:'n'}]
    const presentations=[{id:'presentation:context:s',projectId:pid,scopeId:'s',capability:'context',version:3,updatedAt:now,
      state:{memberViewIds:['v0','v1'],memberEntityRefs:[{type:'collection',id:'c'},{type:'note',id:'n'},{type:'conversation',id:'cc'},{type:'run',id:'member-run'},{type:'workspace',id:'w'}]}}]
    const connected={id:'cc',projectId:pid,label:'链接历史',conversationSessionId:'history'},session={id:'history',projectId:pid,status:'ready',messageCount:3,title:'原完整历史',updatedAt:now,sourceContentHash:'existing-archive-source'}
    const messages=Array.from({length:3},(_,i)=>({id:'m'+i,sessionId:'history',seq:i,role:i%2?'assistant':'user',contentText:'对话完整正文 '+i,fileRefs:[]}))
    messages[0].fileRefs=[{raw:'chosen-old.md',inProject:true,artifactId:'a',revisionId:'r0'}]
    const run={id:'member-run',projectId:pid,instruction:'已有任务原指令',status:'completed',resultSummary:'已存结果',updatedAt:now}
    const returns=[{id:'returned',runId:run.id,targetArtifactId:'out',returnedFileId:'f2',draftRevisionId:'r2',contentHash:files[2].observedHash,status:'adopted'}]
    const find=(key,id)=>copy(graph[key].find(row=>String(row.id)===id))
    const overrides={
      get:id=>id===pid?copy(graph):undefined,
      listPresentationViews:()=>copy(presentations),
      getPresentationView:(_p,id)=>copy(presentations.find(row=>row.id===id)),
      getScopes:()=>copy(graph.scopes),getNotes:()=>copy(graph.notes),getNote:id=>find('notes',id),
      getArtifact:id=>find('artifacts',id),getArtifactRevision:id=>find('artifactRevisions',id),getFileRecord:id=>find('fileRecords',id),
      getArtifactView:id=>find('artifactViews',id),getArtifactViews:id=>copy(graph.artifactViews.filter(row=>row.artifactId===id)),
      getArtifactRevisions:id=>copy(graph.artifactRevisions.filter(row=>row.artifactId===id)),
      getArtifactViewsByProject:()=>copy(graph.artifactViews),
      getCollection:id=>find('collections',id),listCollectionMemberships:(_p,id)=>copy(graph.collectionMemberships.filter(row=>id===undefined||row.collectionId===id)),
      getConnectedConversation:(_p,id)=>id==='cc'?copy(connected):undefined,
      getRun:id=>id===run.id?copy(run):metadata.getRun(id),getArtifactReturns:id=>id===run.id?copy(returns):metadata.getArtifactReturns(id),
      getWorkspace:id=>find('workspaces',id),
      createContextManifest:input=>{manifestWrites++;return originalWrite(input)},
    }
    const repository=new Proxy(metadata,{get(target,key){if(key in overrides)return overrides[key];const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
    const history={inspectContextSource:async()=>({sourceContentHash:session.sourceContentHash,unsupportedMediaKinds:[]}),getProjection:(p,id)=>p===pid&&id===session.id?{session:copy(session)}:undefined,getMessages:(id,{offset,limit})=>id===session.id?copy(messages.slice(offset,offset+limit)):[]}
    const port=createMixedScopeReadPort(repository,history)
    registerMixedScopeReadPort(repository,port)
    const manifests=new ContextManifestService(repository)
    const adapter={providersStatus:async()=>[],dispatch:()=>{report.dispatchCalls++;throw new Error('No dispatch allowed')}}
    const application=new RuntimeApplicationService(repository,manifests,adapter,{},new RuntimeReviewService(repository),()=>now,()=>String(++serial))
    return {graph,presentations,messages,connected,session,run,returns,repository,port,manifests,application}
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
  const refs=[{order:4,mode:'full',ref:{type:'scope',scopeId:'s'}}]
  const create=(f,extra={})=>f.application.create(pid,{instruction:'原普通任务完整使用混合Scope',outputIntent:'analyze',requestedProvider:'codex',orderedReferences:refs,...extra})
  const contents=manifest=>manifest.orderedItems.map(item=>item.content??'').join('\n')
  const manifestFor=run=>JSON.parse(metadata.getContextManifest(run.contextManifestId).canonicalJson)
  async function recipe(f,run){
    let status,payload
    const handled=await handleF6AssemblyRoute({method:'GET',pathname:'/runs/'+run.id+'/recipe',url:new URL('http://127.0.0.1/runs/'+run.id+'/recipe'),request:{},response:{},controller:{},metadata:f.repository,
      helpers:{sendJson:(_r,s,b)=>{status=s;payload=b},failure:(code,message)=>({ok:false,error:{code,message}}),isRecord:value=>value&&typeof value==='object'}})
    assert.equal(handled,true);assert.equal(status,200);return payload.value
  }

  let f=await fixture(), result=await create(f), run=result.review.run, manifest=manifestFor(run)
  assert.equal(run.status,'created');assert.equal(result.review.dispatch.status,'planned');assert.equal(result.review.dispatch.attemptCount,0)
  const scopeItems=manifest.orderedItems.filter(item=>item.scopeContext)
  assert.ok(scopeItems[0].scopeContext.evidence.some(row=>row.path.some(part=>part.includes('attachment'))&&row.source.revision?.id==='r0'),'History attachment uses explicit original revision')
  assert.ok(manifest.lockedElements.includes('品牌名'),'Selected member Keep/保留 lines must reach original lockedElements')
  assert.equal(scopeItems.length,1);assert.equal(scopeItems[0].scopeContext.scopeId,'s');assert.equal(scopeItems[0].identity,'reference:4:scope:s')
  for(const token of ['明确旧版本全文','明确新版本全文','外层集合','内层集合','选中附注正文','对话完整正文 2','已有任务原指令','已存结果','任务实际已有产物全文','backReference'])assert.ok(contents(manifest).includes(token),token)
  assert.ok(!contents(manifest).includes('未选附注N2不能泄漏'));assert.ok(!contents(manifest).includes('viewport'))
  assert.deepEqual(new Set(manifest.references.filter(ref=>ref.artifactId==='a').map(ref=>ref.revisionId)),new Set(['r0','r1']))
  assert.deepEqual(metadata.getRunOrderedReferences(run.id),refs)
  const firstRecipe=await recipe(f,run);assert.deepEqual(firstRecipe.orderedReferences,refs);assert.equal(firstRecipe.contextManifestId,run.contextManifestId)
  const compiledContextPrompt=f.application.contextPrompt(run.id).compiledContextPrompt
  const actualTaskText=compiledContextPrompt.stablePrefix+compiledContextPrompt.dynamicTail
  for(const token of ['明确旧版本全文','明确新版本全文','外层集合','内层集合','选中附注正文','对话完整正文 2','已有任务原指令','任务实际已有产物全文','品牌名'])assert.ok(actualTaskText.includes(token),'Original contextPrompt must consume full ordered item: '+token)
  assert.ok(!actualTaskText.includes('未选附注N2不能泄漏'));assert.ok(compiledContextPrompt.dynamicTail.includes('reference:4:scope:s'))
  await fs.writeFile(path.join(output,'created-run-manifest.json'),JSON.stringify({run,dispatch:result.review.dispatch,recipe:firstRecipe,manifest,compiledContextPrompt},null,2))
  report.checks.push('Actual RuntimeApplicationService and ContextManifestService bundle creates only a created/planned Run; one Scope ordered item carries all mixed members, nested paths, cycle, Run output, two explicit revisions; original RunRecipe retains one Scope address. Graph/history are an explicitly controlled read adapter; journal/manifest writes use actual SQLite owners.')

  f=await workflowFixture();result=await create(f);run=result.review.run;manifest=manifestFor(run)
  const workflowItem=manifest.orderedItems.find(item=>item.scopeContext),workflowEvidence=workflowItem.scopeContext.evidence
  const workflowRoot=workflowEvidence.find(row=>row.ref.type==='scope'&&row.path.length===1)
  assert.equal(workflowItem.scopeContext.presentationId,'workflow:a');assert.equal(workflowItem.sourceAnchor,'scope:s/presentation:workflow:a')
  assert.deepEqual(workflowRoot.source.presentations.map(row=>[row.id,row.version]),[['workflow:a',4],['workflow:b',9]])
  assert.deepEqual(workflowRoot.source.presentation,workflowRoot.source.presentations[0])
  for(const source of workflowRoot.source.presentations){
    const original=f.presentations.find(row=>row.id===source.id)
    assert.deepEqual(source.memberViewIds,original.state.memberViewIds);assert.deepEqual(source.memberEntityRefs,original.state.memberEntityRefs)
    assert.deepEqual(source.actions,original.state.workflowActions.map(({x,y,...action})=>action))
    assert.deepEqual(source.actionEdges,original.state.workflowActionEdges);assert.deepEqual(source.operators,original.state.workflowOperators)
  }
  assert.ok(workflowEvidence.some(row=>row.ref.type==='view'&&row.ref.id==='v0'&&row.path.length===3&&row.path[1]==='presentation:workflow:a'),'A real View remains a direct group member even when its id is an operator key')
  const groupMembers=[['workflow:a',['collection:c','note:n','conversation:cc','run:member-run']],['workflow:b',['collection:cb','note:nb','conversation:ccb','run:run-b']]]
  for(const [id,members] of groupMembers)for(const member of members)assert.ok(workflowEvidence.some(row=>row.path[1]==='presentation:'+id&&row.ref.type+':'+row.ref.id===member),id+' owns '+member)
  const workflowTokens=['外层集合','选中附注正文','对话完整正文 2','已有任务原指令','任务实际已有产物全文','乙组独有集合','乙组独有附注正文','乙组独有对话全文 1','乙组已有任务原指令','乙组已存任务结果','乙组任务实际产物全文','甲组核对步骤','甲组连线条件','甲组独有条件','乙组核对步骤','乙组步骤原说明','乙组连线条件','乙组独有条件','乙组已核对']
  const workflowPrompt=f.application.contextPrompt(run.id).compiledContextPrompt
  for(const token of workflowTokens){assert.ok(contents(manifest).includes(token),token);assert.ok((workflowPrompt.stablePrefix+workflowPrompt.dynamicTail).includes(token),'Original task prompt retains '+token)}
  assert.ok(manifest.lockedElements.includes('乙组标识'));assert.deepEqual(metadata.getRunOrderedReferences(run.id),refs)
  await fs.writeFile(path.join(output,'workflow-multiple-presentations-manifest.json'),JSON.stringify({run,manifest,compiledContextPrompt:workflowPrompt},null,2))
  report.checks.push('Whole Workflow with reversed stored Presentation order reaches the original persisted SQLite manifest and compiled task prompt as one Scope: both actual ids/versions, every group-exclusive Collection/Note/Conversation/Run/output, exact historical revisions, actions/edges/operators and per-group provenance remain. A real View sharing an operator id is retained; legacy markers are not invented files.')

  for(const [name,mutate] of [
    ['second group missing Note',f=>f.graph.notes.splice(f.graph.notes.findIndex(row=>row.id==='nb'),1)],
    ['second group unsupported material',f=>{f.graph.fileRecords.find(row=>row.id==='fb0').mimeType='image/png'}],
    ['second group missing Conversation',f=>{f.connectedB.conversationSessionId='unlinked'}],
    ['second group missing Run',f=>{const get=f.port.getRun;f.port.getRun=id=>id==='run-b'?undefined:get(id)}],
    ['second group step changed during read',f=>{const read=f.port.readTextFile;let changed=false;f.port.readTextFile=async(...args)=>{const text=await read(...args);if(!changed){changed=true;f.presentations.find(row=>row.id==='workflow:b').state.workflowActions[0].description='读取期间新步骤'}return text}}],
    ['second group added during read',f=>{const read=f.port.readTextFile;let changed=false;f.port.readTextFile=async(...args)=>{const text=await read(...args);if(!changed){changed=true;f.presentations.push({...copy(f.presentations[0]),id:'workflow:c'})}return text}}],
  ]){
    f=await workflowFixture();mutate(f);const writes=manifestWrites,runs=metadata.getProjectRuns(pid,1000).length
    await assert.rejects(create(f),name);assert.equal(manifestWrites,writes,name);assert.equal(metadata.getProjectRuns(pid,1000).length,runs,name)
  }
  report.checks.push('A missing/unsupported second-group member or concurrent step/group-set change fails the whole Workflow before any new Manifest or Run is persisted; the valid first group is never accepted alone.')

  f=await fixture();result=await create(f,{orderedReferences:undefined,savedContextId:'s'});manifest=manifestFor(result.review.run)
  const saved=manifest.orderedItems.filter(item=>item.scopeContext)
  assert.equal(saved.length,1);assert.equal(saved[0].scopeContext.scopeId,'s');assert.deepEqual(manifest.cachePlan.stableItemIdentities,['saved-scope:s'])
  for(const token of ['明确旧版本全文','明确新版本全文','选中附注正文','对话完整正文 2','已有任务原指令'])assert.ok(contents(manifest).includes(token))
  assert.ok(!contents(manifest).includes('未选附注N2不能泄漏'))
  const savedPrompt=f.application.contextPrompt(result.review.run.id).compiledContextPrompt
  for(const token of ['选中附注正文','对话完整正文 2','已有任务原指令','任务实际已有产物全文'])assert.ok(savedPrompt.stablePrefix.includes(token),'Saved Scope must reach original stable prompt: '+token)
  assert.ok(!savedPrompt.dynamicTail.includes('选中附注正文'),'Saved Scope is not repeated or filtered down to Artifact refs')
  report.checks.push('Legacy savedContextId resolves the same complete selected Scope and both versions; original artifact-only stable fallback cannot drop heterogeneous members or leak unrelated Notes.')

  f=await fixture();f.presentations[0].state.memberViewIds=[];f.presentations[0].state.memberEntityRefs=[]
  result=await create(f,{orderedReferences:undefined,savedContextId:'s'});manifest=manifestFor(result.review.run)
  const rawScope=manifest.orderedItems.find(item=>item.scopeContext).content
  const wrapped=/^<untrusted-context identity="[^"]*">\r?\n([\s\S]*)\r?\n<\/untrusted-context>$/u.exec(rawScope)
  assert.ok(wrapped,'Original untrusted wrapper must use actual newlines')
  const empty=JSON.parse(wrapped[1])
  assert.equal(empty.root.children.length,0);assert.ok(!contents(manifest).includes('明确旧版本全文'));assert.ok(!contents(manifest).includes('选中附注正文'))
  assert.ok(!contents(manifest).includes('未选附注N2不能泄漏'))
  report.checks.push('Empty actual Presentation stays empty despite existing scope Views and the old SavedContext fallback; no accidental whole-project/whole-scope expansion.')

  for(const [name,mutate] of [
    ['missing Note',f=>f.graph.notes.splice(f.graph.notes.findIndex(row=>row.id==='n'),1)],
    ['unlinked Conversation',f=>f.connected.conversationSessionId='unlinked'],
    ['missing Run',f=>{f.port.getRun=()=>undefined}],
    ['missing archive',f=>{f.port.inspectConversationSource=()=>{throw new Error('原archive不存在')}}],
    ['changed archive',f=>{f.port.inspectConversationSource=()=>({sourceContentHash:'different-archive',unsupportedMediaKinds:[]})}],
    ['unsupported archive media',f=>{f.port.inspectConversationSource=()=>({sourceContentHash:'existing-archive-source',unsupportedMediaKinds:['image']})}],
    ['unresolved history file',f=>{f.messages[0].fileRefs=[{inProject:false,raw:'missing.png'}]}],
    ['history file lacks original revision',f=>{delete f.messages[0].fileRefs[0].revisionId}],
    ['binary',f=>{f.graph.fileRecords.find(row=>row.id==='f0').mimeType='image/png'}],
    ['budget',f=>{f.graph.notes.find(row=>row.id==='n').body='超'.repeat(128001)}],
    ['missing Revision',f=>f.graph.artifactRevisions.splice(f.graph.artifactRevisions.findIndex(row=>row.id==='r0'),1)],
  ]){
    f=await fixture();mutate(f);const writes=manifestWrites,runs=metadata.getProjectRuns(pid,1000).length
    await assert.rejects(create(f),name);assert.equal(manifestWrites,writes,name);assert.equal(metadata.getProjectRuns(pid,1000).length,runs,name)
  }
  report.checks.push('Missing Note/Run/Revision, broken Conversation, unsupported binary and total budget fail before manifest persistence or Run journal creation; zero partial prepared task.')

  f=await fixture();const firstFile=f.graph.fileRecords.find(row=>row.id==='f0'),long='完整正文'.repeat(8001)
  await fs.writeFile(firstFile.observedPath,long);firstFile.observedHash=sha(long);firstFile.size=Buffer.byteLength(long)
  f.graph.artifactRevisions.find(row=>row.id==='r0').contentHash=firstFile.observedHash
  let writes=manifestWrites
  await assert.rejects(create(f),/额度|限额|超过/);assert.equal(manifestWrites,writes)
  report.checks.push('Original 32000-character per-material limit remains inside aggregate Scope; an oversized file fails instead of truncating or silently raising its limit.')

  f=await fixture();const oldRead=f.port.readTextFile;let changed=false
  f.port.readTextFile=async(...args)=>{const value=await oldRead(...args);if(!changed){changed=true;f.graph.notes.find(row=>row.id==='n').body='同更新时间的并发正文'}return value}
  writes=manifestWrites;await assert.rejects(create(f),/变化|改变/);assert.equal(manifestWrites,writes)
  report.checks.push('Same-timestamp selected content mutation during read is rejected before the original manifest write.')

  f=await fixture();let legacy=await f.manifests.build(pid,{orderedReferences:[{order:0,ref:{type:'artifact',artifactId:'a',revisionId:'r0'}}]})
  assert.ok(contents(legacy).includes('明确旧版本全文'));assert.ok(!legacy.orderedItems.some(item=>item.scopeContext))
  legacy=await f.manifests.build(pid,{orderedReferences:[{order:0,ref:{type:'collection',collectionId:'legacy'}}]})
  assert.ok(contents(legacy).includes('明确新版本全文'));assert.ok(contents(legacy).includes('选中附注正文'));assert.ok(!legacy.orderedItems.some(item=>item.scopeContext))
  writes=manifestWrites;await assert.rejects(f.manifests.build(pid,{orderedReferences:[{order:0,ref:{type:'artifact',artifactId:'a',revisionId:'absent'}}]}));assert.equal(manifestWrites,writes)
  report.checks.push('No-Scope original Artifact exact-version and canonical Collection member paths remain in their original resolver; missing requested revision protection remains.')
  const routeFailures=[]
  async function createThroughOriginalRoute(f,input){
    let status,payload
    const pathname='/projects/'+pid+'/runs'
    const handled=await handleRunsRoute({method:'POST',pathname,url:new URL('http://127.0.0.1'+pathname),request:{},response:{},controller:new AbortController(),metadata:f.repository,
      runtimeApplication:f.application,runtimeReview:undefined,contextManifest:f.manifests,previewWorker:undefined,
      helpers:{sendJson:(_response,code,body)=>{status=code;payload=body},failure:(code,message)=>({ok:false,error:{code,message}}),readJsonBody:async()=>input,
        isRecord:value=>value!==null&&typeof value==='object'&&!Array.isArray(value),isStringArray:value=>Array.isArray(value)&&value.every(item=>typeof item==='string')}})
    assert.equal(handled,true);return {status,payload}
  }
  for(const [name,mutate,expectedCode,extra] of [
    ['Scope PNG',f=>{f.graph.fileRecords.find(row=>row.id==='f0').mimeType='image/png'},'MIXED_SCOPE_CONTENT_UNSUPPORTED'],
    ['Scope archived image',f=>{f.port.inspectConversationSource=()=>({sourceContentHash:'existing-archive-source',unsupportedMediaKinds:['image']})},'MIXED_SCOPE_CONTENT_UNSUPPORTED'],
    ['Scope missing Note',f=>f.graph.notes.splice(f.graph.notes.findIndex(row=>row.id==='n'),1),'CONFLICT'],
    ['Scope missing exact Revision',f=>f.graph.artifactRevisions.splice(f.graph.artifactRevisions.findIndex(row=>row.id==='r0'),1),'CONFLICT'],
    ['Scope stale hash',f=>{f.graph.fileRecords.find(row=>row.id==='f0').observedHash='changed-existing-content'},'CONFLICT'],
    ['Scope unsupported charset',f=>{f.graph.fileRecords.find(row=>row.id==='f0').mimeType='text/plain; charset=gbk'},'CONFLICT'],
    ['Scope total budget',f=>{f.graph.notes.find(row=>row.id==='n').body='超'.repeat(128001)},'CONFLICT'],
    ['Original missing material',()=>{},'CONFLICT',{orderedReferences:[{order:0,ref:{type:'artifact',artifactId:'missing'}}]}],
  ]) {
    f=await fixture();mutate(f);const beforeWrites=manifestWrites,beforeRuns=metadata.getProjectRuns(pid,1000).length
    const response=await createThroughOriginalRoute(f,{instruction:'原路由整份Scope',outputIntent:'analyze',requestedProvider:'codex',orderedReferences:refs,...extra})
    assert.equal(response.status,409,name);assert.equal(response.payload.error.code,expectedCode,name)
    assert.equal(manifestWrites,beforeWrites,name);assert.equal(metadata.getProjectRuns(pid,1000).length,beforeRuns,name)
    if(expectedCode==='MIXED_SCOPE_CONTENT_UNSUPPORTED')assert.equal(response.payload.error.message,'这份内容包含暂不能完整加入对话的文件；输入和引用已保留。',name)
    routeFailures.push({name,status:response.status,code:response.payload.error.code,manifestWrites:0,runWrites:0})
  }
  report.routeFailures=routeFailures
  await fs.writeFile(path.join(output,'original-create-route-failures.json'),JSON.stringify(routeFailures,null,2))
  report.checks.push('Actual original create-Run route maps only Scope unsupported MIME/archive-media errors to HTTP409 MIXED_SCOPE_CONTENT_UNSUPPORTED with original-input guidance; missing Note/Revision/material, stale hash, charset and total budget retain CONFLICT. Every failure occurs before manifest or Run writes.')
  assert.equal(report.dispatchCalls,0);assert.deepEqual(report.networkAttempts,[])
  report.passed=true
} catch(error) {report.error={name:error.name,message:error.message,stack:error.stack};process.exitCode=1}
finally {
  try{metadata?.close()}catch{}
  globalThis.fetch=originalFetch
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify({report:path.join(output,'report.json'),passed:report.passed,checks:report.checks.length,...(report.error?{error:report.error}:{})},null,2))
}
