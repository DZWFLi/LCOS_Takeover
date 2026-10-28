import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Server} from 'node:net';
import {pathToFileURL} from 'node:url';
import {buildPilotEntry} from '../lab/pilot/build-pilot.mjs';

const root=path.resolve(import.meta.dirname,'..'),runtimeBase=path.join(root,'.runtime');
await fs.mkdir(runtimeBase,{recursive:true});
const runtime=await fs.mkdtemp(path.join(runtimeBase,'node-emphasis-core-'));
const output=path.join(root,'output','原节点强调回归_20261026',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(output,{recursive:true});
// This child process only; never read or inherit user model/session settings.
for(const key of Object.keys(process.env))if(/^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|OPENROUTER_|DEEPSEEK_)/.test(key))delete process.env[key];
process.env.LCOS_RECOVERY_TRANSPORT='none';process.env.LCOS_OLLAMA_URL='http://127.0.0.1:1';
process.env.LCOS_CAPTURE_STAGING_ROOT=path.join(runtime,'capture');process.env.LCOS_OCR_RUNTIME_DIR=path.join(runtime,'ocr');
const originalFetch=globalThis.fetch;
const report={passed:false,mode:'isolated real Core SQLite + original Huabu disk MERGE_NODE_DATA; handler/API, not browser Undo/Redo',runtime,output,
  modelCalls:0,runCount:0,realUserRuntimeTouched:false,cases:[],responses:[]};
let facade;
globalThis.fetch=(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  const ownedPorts=process._getActiveHandles().filter(h=>h instanceof Server&&h.listening).map(h=>h.address()?.port);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!ownedPorts.includes(Number(url.port)))throw new Error('Only the test-owned random Core loopback listener is allowed.');
  return originalFetch(input,init);
};
try{
  const entry=await buildPilotEntry('lab/pilot/surface-core-facade.ts',path.join(runtime,'facade.mjs'),'node',
    {coreWorkspaceMembership:true,coreCollectionTitle:true,coreWorkflowCollectionMembers:true,coreMixedScopeContext:true});
  const {startSurfaceCoreFacade}=await import(pathToFileURL(entry));
  const origin='http://127.0.0.1:19976'; // Handler identity only; no listener on this port.
  facade=await startSurfaceCoreFacade({runtimeRoot:path.join(runtime,'owned'),publicOrigin:origin,fullIntegration:true,
    nativeCollectionPilot:true,nativeTextPilot:true,nativeAssemblyPilot:true,nativeRailPilot:true});
  const repository=facade.core.repository,projectId=facade.core.projectId,prefix='/api/lcos/core/projects/'+projectId;
  const call=(method,url,body)=>facade.handle({method,url:new URL(url,origin),pathname:new URL(url,origin).pathname,body});
  const value=r=>r.body.value??r.body.data??r.body;
  const expect=async(name,method,url,body,status=200,code)=>{
    const response=await call(method,url,body);report.responses.push({name,status:response.status,code:response.body?.error?.code});
    assert.equal(response.status,status,name+': '+JSON.stringify(response.body));
    if(code)assert.equal(response.body.error.code,code,name);return value(response);
  };
  const canvasPath=id=>'/api/canvas/v1/canvases/'+id;
  const canvas=async id=>expect('read '+id,'GET',canvasPath(id));
  const mainId='surface-core-main',initial=await canvas(mainId),image=initial.nodes.find(n=>n.type==='image'),text=initial.nodes.find(n=>n.type==='text');
  assert.ok(image&&text);assert.equal(repository.getProjectExecutionProjection(projectId).runs.length,0);

  const collection=await expect('real canonical collection producer','POST',prefix+'/collections',
    {title:'强调回归的真实集合',members:[{type:'artifact',id:image.data.lcos_ref.artifactId??image.data.lcos_ref.entityId}]},201);
  const placed=await expect('real native pile producer','POST','/api/lcos/canvases/'+mainId+'/collections:project',
    {collectionId:collection.id,position:{x:1080,y:120}});
  assert.equal(placed.node.type,'pile');assert.equal(placed.provider_execution_started,false);
  const conversation=await expect('confirmed synthetic conversation; no execution','POST',prefix+'/connected-conversations',
    {action:'connect',provider:'codex',executorId:'isolated-emphasis-no-execution',conversationRef:'isolated-emphasis-session',label:'强调回归的原会话'},201);
  const workspace=repository.getWorkspaces(projectId).find(w=>w.canvasId===mainId);
  const imported=await expect('manual synthetic history; no model','POST',prefix+'/conversations/import-manual',
    {title:'强调回归的两条原消息',scopeId:String(workspace.scopeId),entries:[{role:'user',contentText:'保留这条原始消息。'},{role:'assistant',contentText:'手工合成回复，不执行模型。'}]},201);
  await expect('same canonical session link','POST',prefix+'/connected-conversations/'+conversation.id+'/link-session',
    {conversationSessionId:imported.session.id});
  const reconciled=await expect('original conversation projector','POST','/api/lcos/canvases/'+mainId+'/conversations:reconcile',
    {connectedConversationId:conversation.id});assert.equal(reconciled.provider_execution_started,false);
  const projected=await canvas(mainId),pile=projected.nodes.find(n=>n.type==='pile'&&n.data.lcos_collection_ref.collectionId===collection.id),
    glyth=projected.nodes.find(n=>n.type==='lcos-conversation'&&n.data.lcos_conversation_ref.connectedConversationId===conversation.id);
  assert.ok(pile&&glyth);assert.equal(repository.getProjectExecutionProjection(projectId).runs.length,0);

  // A real method entry projects an actual Note through the existing member producer.
  // Direct repository calls below create only this explicitly synthetic fixture.
  const memberScope='scope-emphasis-member',note={id:'note-emphasis-member',projectId,anchor:{type:'project'},body:'附注原正文，不是画布可编辑文本。',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  repository.upsertNote(note);
  const materialView=repository.get(projectId).artifactViews.find(v=>String(v.artifactId)===String(image.data.lcos_ref.artifactId??image.data.lcos_ref.entityId));assert.ok(materialView);
  await expect('real method producer','PUT',prefix+'/workflow/methods/'+memberScope,{create:true,name:'强调回归的原方法',expectedGraphVersion:repository.get(projectId).graphVersion,
    presentations:[{id:'presentation:workflow:'+memberScope,expectedVersion:0,memberViewIds:[materialView.id],workflowActions:[{id:'check',label:'核对原材料',attachedViewIds:[materialView.id],x:0,y:0}],workflowActionEdges:[],workflowOperators:{[materialView.id]:{kind:'reference'}}}]});
  const memberPresentation=repository.getPresentationView(projectId,'presentation:workflow:'+memberScope);
  assert.equal(repository.compareAndSwapPresentationView({...memberPresentation,version:memberPresentation.version+1,state:{...memberPresentation.state,memberEntityRefs:[{type:'note',id:note.id}]}},memberPresentation.version).updated,true);
  const opened=await expect('original mixed method workspace opener','POST','/api/lcos/workflow/'+memberScope+'/workspace:open',{workspaceId:'workspace:'+memberScope});
  const methodCanvas=await canvas(opened.canvasId),member=methodCanvas.nodes.find(n=>n.type==='lcos-member'&&n.data.lcos_member_ref?.entityType==='note'&&n.data.lcos_member_ref.entityId===note.id);
  assert.ok(member,'real method Note must project one read-only lcos-member');assert.equal(member.data.lcos_member_facts.body,note.body);
  const graph=async()=>expect('unchanged graph','GET',prefix+'/graph');
  const messages=async()=>expect('unchanged original messages','GET',prefix+'/conversations/'+imported.session.id+'/messages');
  const graphBefore=await graph(),runsBefore=structuredClone(repository.getProjectExecutionProjection(projectId)),messagesBefore=await messages();
  const snapshot=repository.get(projectId),filesBefore=[];
  assert.ok(Array.isArray(snapshot.fileRecords)&&snapshot.fileRecords.length>0,'actual project FileRecords must be available');
  for(const record of snapshot.fileRecords){
    const response=await call('GET',prefix+'/file-records/'+encodeURIComponent(record.id)+'/content');
    assert.equal(response.status,200,JSON.stringify(response.body));filesBefore.push({id:record.id,body:Buffer.from(response.body)});
  }
  const assertCoreUnchanged=async()=>{
    assert.deepEqual(await graph(),graphBefore,'emphasis cannot alter graph truth');
    assert.deepEqual(repository.getProjectExecutionProjection(projectId),runsBefore,'emphasis cannot create/mutate a Run or result');
    assert.deepEqual(await messages(),messagesBefore,'emphasis cannot append or rewrite conversation messages');
    for(const file of filesBefore)assert.deepEqual((await call('GET',prefix+'/file-records/'+encodeURIComponent(file.id)+'/content')).body,file.body,'exact registered bytes '+file.id);
  };
  const batch=(node,data,{full=false,revision=true}={})=>({canvas_id:node.canvas_id??mainId,created_by_role:'user',
    ...(revision&&node.lcos_revision_id?{lcos_expected_revisions:{[node.id]:node.lcos_revision_id}}:{}),
    actions:[{action:'update',updates:[{id:node.id,type:node.type,data,
      ...(full?{position:structuredClone(node.position),measured:structuredClone(node.measured)}:{})}]}]});
  const write=async(name,node,data,options={},status=200,code)=>expect(name,'POST',canvasPath(node.canvas_id??mainId)+'/nodes:batchActions',batch(node,data,options),status,code);
  const readNode=async (id,canvasId=mainId)=>(await canvas(canvasId)).nodes.find(n=>n.id===id);
  const noEmphasis=nodes=>nodes.map(n=>{const copy=structuredClone(n);delete copy.data.lcos_gui_emphasis;return copy;});
  // First measurement is a distinct existing operation: its full DTO may persist
  // exactly the observed default text mode/measured dimensions. Prove that first,
  // then keep emphasis-only and subsequent echo comparisons fully strict.
  report.initialEchoNormalizations=[];
  for(const node of [image,text,pile,glyth,member]){
    const targetCanvas=node.canvas_id??mainId,fresh=await readNode(node.id,targetCanvas),before=await facade.spatial.read(targetCanvas);
    assert.equal(fresh.data.lcos_gui_emphasis,false);
    await write(node.type+' first original false measurement DTO',fresh,structuredClone(fresh.data),{full:true});
    assert.deepEqual(await readNode(node.id,targetCanvas),fresh,'first full DTO must preserve exact presented bounds/body/title/reference/identity');
    const after=await facade.spatial.read(targetCanvas),expected=structuredClone(before.state.nodes),expectedNode=expected.find(n=>n.id===node.id),actualNode=after.state.nodes.find(n=>n.id===node.id),added=[];
    if(!Object.hasOwn(expectedNode,'measured')&&Object.hasOwn(actualNode,'measured')){
      assert.deepEqual(actualNode.measured,fresh.measured,'first measured value must be the exact originally presented bounds');
      expectedNode.measured=structuredClone(fresh.measured);added.push('measured: exact original GET bounds');
    }
    if(!Object.hasOwn(expectedNode.data,'lcosTextViewMode')&&Object.hasOwn(actualNode.data,'lcosTextViewMode')){
      assert.equal(node.type,'text');assert.equal(actualNode.data.lcosTextViewMode,'text');assert.equal(fresh.data.lcosTextViewMode,'text');
      expectedNode.data.lcosTextViewMode='text';added.push('lcosTextViewMode: exact original GET default text');
    }
    assert.deepEqual(after.state.nodes,expected,'first false DTO may add only the two explicitly observed original defaults, never emphasis/content/geometry/other fields');
    assert.deepEqual(after.state.connections,before.state.connections);await assertCoreUnchanged();
    report.initialEchoNormalizations.push({nodeType:node.type,added});
  }
  report.cases.push('first original full measurement DTO is separately proved: exact GET identity/body/title/references/bounds unchanged; raw may only add original default text mode and exact measured dimensions, with each actual addition recorded');
  for(const node of [image,text,pile,glyth,member]){
    const targetCanvas=node.canvas_id??mainId,current=await readNode(node.id,targetCanvas);assert.equal(current.data.lcos_gui_emphasis,false,'GET must expose explicit false for '+node.type);
    const rawBefore=await facade.spatial.read(targetCanvas);
    for(const emphasis of [true,false,true,false]){
      await write(node.type+' emphasis '+emphasis,current,{lcos_gui_emphasis:emphasis});
      const readback=await readNode(node.id,targetCanvas),raw=await facade.spatial.read(targetCanvas);
      assert.equal(readback.data.lcos_gui_emphasis,emphasis);assert.equal(raw.state.nodes.find(n=>n.id===node.id).data.lcos_gui_emphasis,emphasis);
      assert.deepEqual(noEmphasis(raw.state.nodes),noEmphasis(rawBefore.state.nodes),'only the one presentation boolean may change, no geometry/body/identity');
      assert.deepEqual(raw.state.connections,rawBefore.state.connections,'connections cannot change');
      for(const other of rawBefore.state.nodes.filter(n=>n.id!==node.id))assert.deepEqual(raw.state.nodes.find(n=>n.id===other.id),other,'unrelated spatial node unchanged');
      await assertCoreUnchanged();
    }
    const fresh=await readNode(node.id,targetCanvas);
    await write(node.type+' full GET false history/measurement echo',fresh,structuredClone(fresh.data),{full:true});
    assert.equal((await readNode(node.id,targetCanvas)).data.lcos_gui_emphasis,false);
    const echoed=await facade.spatial.read(targetCanvas);assert.deepEqual(noEmphasis(echoed.state.nodes),noEmphasis(rawBefore.state.nodes),'full false echo cannot change geometry or any other node field');assert.deepEqual(echoed.state.connections,rawBefore.state.connections);
    await assertCoreUnchanged();
    report.cases.push(node.type+': GET false → true → false → true → false through original user batch and MERGE_NODE_DATA; full GET false measurement/history DTO echoed; exact bytes/graph/runs/messages/other nodes/geometry unchanged');
  }
  const reject=async(name,node,data,status,code,options={})=>{
    const before=await facade.spatial.read(node.canvas_id??mainId);
    await write(name,node,data,options,status,code);assert.deepEqual(await facade.spatial.read(node.canvas_id??mainId),before,name+' must not partially save emphasis');await assertCoreUnchanged();
  };
  for(const wrong of [null,0,1,'true',{},[]])await reject('invalid boolean '+JSON.stringify(wrong),image,{lcos_gui_emphasis:wrong},400,'INVALID_GUI_EMPHASIS');
  await reject('image unknown data with valid emphasis',image,{lcos_gui_emphasis:true,unsupported:true},501,'IMAGE_NODE_DATA_NOT_IMPLEMENTED');
  await reject('text unknown data with valid emphasis',text,{lcos_gui_emphasis:true,unsupported:true},501,'NODE_DATA_PATCH_NOT_IMPLEMENTED');
  await reject('image forged revision with valid emphasis',image,{lcos_gui_emphasis:true,lcos_ref:{...image.data.lcos_ref,revisionId:'forged'}},409,'CORE_REFERENCE_MISMATCH');
  await reject('image title protection',image,{lcos_gui_emphasis:true,title:'未经 Core 改名'},501,'IMAGE_TITLE_UPDATE_NOT_IMPLEMENTED');
  await reject('image source protection',image,{lcos_gui_emphasis:true,src:origin+'/forged'},409,'CORE_SOURCE_MISMATCH');
  await reject('text body still needs expected revision',text,{lcos_gui_emphasis:true,text:'不得通过视觉偏好偷改正文'},409,'EXPECTED_REVISION_REQUIRED',{revision:false});
  await reject('text title still needs expected revision',text,{lcos_gui_emphasis:true,title:'不得通过视觉偏好偷改标题'},409,'EXPECTED_REVISION_REQUIRED',{revision:false});
  const stale=batch(text,{lcos_gui_emphasis:true,text:'过期正文'});stale.lcos_expected_revisions[text.id]='stale';
  const beforeStale=await facade.spatial.read(mainId);await expect('stale body protection','POST',canvasPath(mainId)+'/nodes:batchActions',stale,409,'STALE_REVISION');assert.deepEqual(await facade.spatial.read(mainId),beforeStale);await assertCoreUnchanged();
  await reject('pile unknown projected data',pile,{lcos_gui_emphasis:true,unsupported:true},501,'PROJECTED_NODE_DATA_NOT_CONNECTED');
  await reject('pile canonical title protection',pile,{lcos_gui_emphasis:true,title:'伪造集合名'},409,'PROJECTED_NODE_FACTS_MISMATCH');
  await reject('conversation unknown data',glyth,{lcos_gui_emphasis:true,unsupported:true},501,'CONVERSATION_NODE_DATA_NOT_CONNECTED');
  await reject('conversation title protection',glyth,{lcos_gui_emphasis:true,title:'伪造对话名'},501,'CONVERSATION_RENAME_NOT_CONNECTED');
  await reject('conversation forged owner',glyth,{lcos_gui_emphasis:true,lcos_conversation_ref:{...glyth.data.lcos_conversation_ref,connectedConversationId:'foreign'}},409,'CONVERSATION_REFERENCE_MISMATCH');
  await reject('member unknown projected data',member,{lcos_gui_emphasis:true,unsupported:true},501,'PROJECTED_NODE_DATA_NOT_CONNECTED');
  await reject('member original Note body protection',member,{lcos_gui_emphasis:true,lcos_member_facts:{...member.data.lcos_member_facts,body:'伪造附注正文'}},409,'PROJECTED_NODE_FACTS_MISMATCH');
  assert.deepEqual(repository.getNote(note.id),note);
  const mixed={canvas_id:mainId,created_by_role:'user',actions:[{action:'update',updates:[{id:text.id,type:text.type,data:{lcos_gui_emphasis:true}},
    {id:image.id,type:image.type,data:{lcos_gui_emphasis:true,src:origin+'/not-the-file'}}]}]};
  const beforeMixed=await facade.spatial.read(mainId);await expect('later invalid member cannot commit earlier emphasis','POST',canvasPath(mainId)+'/nodes:batchActions',mixed,409,'CORE_SOURCE_MISMATCH');assert.deepEqual(await facade.spatial.read(mainId),beforeMixed);await assertCoreUnchanged();
  report.cases.push('invalid boolean, unknown fields, forged reference/source, projected facts, text/title expected-revision and stale-revision guards reject atomically; valid emphasis in the same bad request never leaks into spatial data');
  report.cases.push('mixed batch validates every item before MERGE_NODE_DATA; a later forged image cannot partially save earlier text emphasis');
  report.fileCount=filesBefore.length;report.runCount=repository.getProjectExecutionProjection(projectId).runs.length;assert.equal(report.runCount,0);report.passed=true;
}catch(error){report.error=error.stack;throw error;}
finally{
  try{await facade?.close();}finally{
    globalThis.fetch=originalFetch;
    const relative=path.relative(runtimeBase,path.resolve(runtime));assert.ok(relative.startsWith('node-emphasis-core-')&&!relative.includes(path.sep)&&!path.isAbsolute(relative),'only this disposable mkdtemp runtime may be removed');
    await fs.rm(runtime,{recursive:true,force:true});report.runtimeRemoved=true;
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,cases:report.cases,fileCount:report.fileCount,runCount:report.runCount,modelCalls:report.modelCalls,requests:report.responses.length,runtimeRemoved:report.runtimeRemoved,report:path.join(output,'report.json'),error:report.error},null,2));
  }
}




