import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let source=await fs.readFile(path.join(root,'scripts/native-material-placement.test.mjs'),'utf8');
const seam='  const repeated = await placement.place(destination.id, input);';
if(source.split(seam).length!==2)throw new Error('Disposable real material owner fixture changed');
source=source.slice(0,source.indexOf(seam)).replace("    `export {createNativeMaterialPlacement}","    `export {createNativeMaterialReceive} from ${JSON.stringify(relative('lab/pilot/native-material-receive.ts'))};`,\n    `export {receiveNativeLibraryMaterial} from ${JSON.stringify(relative('lab/pilot/native-material-receive-client.ts'))};`,\n    `export {createNativeMaterialPlacement}");
const output=path.join(root,'output/原生文本整合_20261017e/Drop语义目标真实Core验证',new Date().toISOString().replaceAll(':','-').replace('.','-'));
await fs.mkdir(output,{recursive:true});
const driver=`
  const realHost=new module.Gen2Host({projectId,http:new module.HttpClient({baseUrl:coreOrigin}),rfs:module.createHeadlessProjectionPort({canvasId:main.id,coreOrigin,...facade.spatial})});
  const before=await realHost.projects.getProjectGraph(projectId);
  assert.equal(repository.getProjectExecutionProjection(projectId).runs.length,0);
  const sourceView={...repository.getArtifactView(historical.artifactViewId),id:'view:synthetic-semantic-source',revisionId:input.revisionId,referenceKind:'explicit_additional'};
  const writer=hostFor(main.id).artifacts;
  const later=String(repository.getArtifact(input.artifactId).currentRevisionId);
  const routeFor=id=>'/api/lcos/canvases/'+id+'/materials:receive';
  const query=value=>new URLSearchParams({...value,targetRef:JSON.stringify(value.targetRef)});
  const firstReceipts=[];
  for(const [index,kind] of ['main','context','workflow'].entries()){
    const w=repository.getWorkspaces(projectId).find(w=>w.canvasId==='surface-core-'+kind);
    await writer.putArtifactView(projectId,sourceView);
    const targetRef=kind==='main'?{kind}:{kind,id:String(w.scopeId)};
    const selected={projectId,artifactId:input.artifactId,revisionId:input.revisionId,fileRecordId:input.fileRecordId,artifactViewId:sourceView.id,targetRef};
    assert.equal((await call('GET',routeFor(w.canvasId)+'?'+query(selected))).body.data.state,'absent');
    const point={x:420+index*450,y:-120-index*50};
    const response=await call('POST',routeFor(w.canvasId),{...selected,position:point});assert.equal(response.status,200,JSON.stringify(response.body));
    const receipt=response.body.data;firstReceipts.push(receipt);
    assert.equal(receipt.state,'present');assert.equal(receipt.workspace_id,String(w.id));assert.deepEqual(receipt.target_ref,targetRef);
    assert.equal(receipt.assembly_receipt.results[0].channel,'presentation-membership');assert.ok(receipt.change_set_id);
    assert.equal(receipt.assembly_receipt.results[0].sourceRef.id,receipt.artifact_view_id);
    assert.equal(receipt.node.data.lcos_ref.revisionId,input.revisionId);assert.deepEqual(receipt.node.position,point);
    assert.ok(receipt.presentation.state.memberViewIds.includes(receipt.artifact_view_id));
    assert.equal(repository.getArtifactView(receipt.artifact_view_id).referenceKind,'explicit_additional');
    // Discard the committed HTTP200 at the caller, advance only the mutable origin, then GET.
    const count=(await canvas(w.canvasId)).nodes.length;
    await writer.putArtifactView(projectId,{...sourceView,revisionId:later});
    const recovered=await call('GET',routeFor(w.canvasId)+'?'+query(selected));assert.equal(recovered.status,200,JSON.stringify(recovered.body));
    assert.equal(recovered.body.data.node.id,receipt.node.id);assert.equal(recovered.body.data.node.data.lcos_ref.revisionId,input.revisionId);
    assert.deepEqual(recovered.body.data.node.position,point);assert.equal((await canvas(w.canvasId)).nodes.length,count);
    assert.equal(recovered.body.data.assembly_receipt,undefined,'GET never synthesizes Assembly rows');
    const repeat=await call('POST',routeFor(w.canvasId),{...selected,position:{x:9000,y:9000}});
    assert.equal(repeat.status,200);assert.equal(repeat.body.data.already_present,true);assert.deepEqual(repeat.body.data.node.position,point);
    const wrong=await call('POST',routeFor(w.canvasId),{...selected,targetRef:{kind:kind==='workflow'?'context':'workflow',id:String(w.scopeId)}});
    assert.equal(wrong.status,409);
    const foreign=await call('GET',routeFor(w.canvasId)+'?'+query({...selected,artifactViewId:'foreign-view'}));assert.equal(foreign.status,409);
    report.cases.push('root '+kind+': exact historical pinned View, real Presentation/ChangeSet+projector/readback, lost HTTP200+origin advance only GET, no node duplicate or hidden move');
  }
  const image=before.artifacts.find(a=>a.kind==='image');assert.ok(image,'real fixture image required');
  const imageRevision=repository.getArtifactRevision(String(image.currentRevisionId));
  const imageSource=repository.getArtifactViews(String(image.id)).find(v=>v.referenceKind==='primary');
  const imageTarget=repository.getWorkspaces(projectId).find(w=>w.canvasId==='surface-core-context');
  const imageInput={projectId,artifactId:String(image.id),revisionId:String(imageRevision.id),fileRecordId:String(imageRevision.fileRecordId),
    artifactViewId:String(imageSource.id),targetRef:{kind:'context',id:String(imageTarget.scopeId)},position:{x:2100,y:40}};
  const imageResponse=await call('POST',routeFor(imageTarget.canvasId),imageInput);assert.equal(imageResponse.status,200,JSON.stringify(imageResponse.body));
  assert.equal(imageResponse.body.data.node.type,'image');assert.ok(imageResponse.body.data.node.data.src);
  assert.equal(imageResponse.body.data.node.data.lcos_ref.revisionId,imageInput.revisionId);
  assert.deepEqual(imageResponse.body.data.node.position,imageInput.position);
  report.cases.push('real existing image FileRecord uses original image projector/native renderer, exact View/Revision and released position, not text conversion');
  const afterSurfaces=await realHost.projects.getProjectGraph(projectId);
  assert.deepEqual(afterSurfaces.workspaceMemberships,before.workspaceMemberships,'surface reception must never become Workspace working-set membership');
  const mainTarget={kind:'main'},laterFile=String(repository.getArtifactRevision(later).fileRecordId);
  const fresh={projectId,artifactId:input.artifactId,revisionId:later,fileRecordId:laterFile,artifactViewId:sourceView.id,targetRef:mainTarget};
  await writer.putArtifactView(projectId,sourceView);
  assert.equal((await call('POST',routeFor(main.id),fresh)).status,409,'absent + origin no longer denotes this version must refuse before target creation');
  const nextTargetId='view:native-drop:'+['main','root',input.artifactId,later].map(encodeURIComponent).join(':');
  assert.equal(repository.getArtifactView(nextTargetId),undefined);
  const foreignProject='synthetic-semantic-foreign-project';
  const foreignRoot=path.join(temp,'foreign-project');await fs.mkdir(foreignRoot,{recursive:true});
  repository.createProject({id:foreignProject,name:'Isolated foreign ownership fixture',rootPath:foreignRoot});
  const foreignScope=String(repository.getScopes(foreignProject)[0].id);
  const foreignView={...sourceView,id:'view:synthetic-semantic-foreign-scope',scopeId:foreignScope};
  await writer.putArtifactView(projectId,foreignView);
  const existingMain={projectId,artifactId:input.artifactId,revisionId:input.revisionId,fileRecordId:input.fileRecordId,targetRef:mainTarget};
  for(const artifactViewId of [foreignView.id,String(repository.getArtifactViewsByProject(projectId).find(v=>String(v.artifactId)!==input.artifactId).id)])
    assert.equal((await call('GET',routeFor(main.id)+'?'+query({...existingMain,artifactViewId}))).status,409);
  await writer.putArtifactView(projectId,{...sourceView,id:nextTargetId,revisionId:input.revisionId});
  await writer.putArtifactView(projectId,{...sourceView,revisionId:later});
  assert.equal((await call('POST',routeFor(main.id),fresh)).status,409,'an occupied exact View PK must not be overwritten');
  report.cases.push('absent + changed origin, foreign-scope/another-Artifact source even with existing result, wrong semantic target, and conflicting pinned View PK all refuse without fallback');
  const receiveOwner=module.createNativeMaterialReceive({repository,projectId,projectionHost:hostFor,spatial:facade.spatial,projectNativeNodes:async id=>(await canvas(id)).nodes,fail});
  const workflow=repository.getWorkspaces(projectId).find(w=>w.canvasId==='surface-core-workflow');
  const partialSource={...fresh,targetRef:{kind:'workflow',id:String(workflow.scopeId)},position:{x:1850,y:700}};
  blockProjector=true;
  await assert.rejects(receiveOwner.receive(workflow.canvasId,partialSource),/Synthetic interruption/);
  const partial=await receiveOwner.inspect(workflow.canvasId,partialSource);assert.equal(partial.state,'partial');
  const version=repository.getPresentationView(projectId,'presentation:workflow:'+workflow.scopeId).version;
  blockProjector=false;
  await assert.rejects(receiveOwner.receive(workflow.canvasId,partialSource),error=>error.code==='MATERIAL_PLACEMENT_UNCONFIRMED');
  assert.equal(repository.getPresentationView(projectId,'presentation:workflow:'+workflow.scopeId).version,version);
  assert.equal((await receiveOwner.inspect(workflow.canvasId,partialSource)).state,'partial');
  report.cases.push('interruption after real Presentation membership preserves that ChangeSet and exact View; GET stays partial and neither GET nor repeated POST silently replays membership/projector');
  const p='/api/lcos/core/projects/'+projectId;
  const connected=await call('POST',p+'/connected-conversations',{action:'connect',provider:'codex',executorId:'synthetic-semantic-receive',conversationRef:'synthetic-semantic-drop',label:'人工会话接收验证'});
  assert.equal(connected.status,201,JSON.stringify(connected.body));const cid=connected.body.value.id;
  const manual=await call('POST',p+'/conversations/import-manual',{title:'人工导入会话，不执行模型',scopeId:String(repository.getWorkspaces(projectId).find(w=>w.canvasId===main.id).scopeId),entries:[{role:'user',contentText:'合成材料接收验证'}]});
  assert.equal(manual.status,201,JSON.stringify(manual.body));
  assert.equal((await call('POST',p+'/connected-conversations/'+cid+'/link-session',{conversationSessionId:manual.body.value.session.id})).status,200);
  assert.equal((await call('POST','/api/lcos/canvases/'+main.id+'/conversations:reconcile',{connectedConversationId:cid})).status,200);
  const oldNodes=(await canvas(main.id)).nodes,oldBindings=repository.getProjectionBindings(projectId).length;
  await writer.putArtifactView(projectId,sourceView);
  const selected={projectId,artifactId:input.artifactId,revisionId:input.revisionId,fileRecordId:input.fileRecordId,artifactViewId:sourceView.id,targetRef:{kind:'conversation',id:cid}};
  const response=await call('POST',routeFor(main.id),selected);assert.equal(response.status,200,JSON.stringify(response.body));const receipt=response.body.data;
  assert.equal(receipt.state,'present');assert.equal(receipt.assembly_receipt.results[0].channel,'relation');assert.ok(receipt.change_set_id);
  assert.equal(receipt.relation.kind,'conversation_context');assert.equal(String(receipt.relation.targetEntityId),receipt.artifact_view_id);
  assert.equal(receipt.node,undefined);assert.equal(receipt.binding,undefined);
  assert.deepEqual((await canvas(main.id)).nodes,oldNodes);assert.equal(repository.getProjectionBindings(projectId).length,oldBindings);
  await writer.putArtifactView(projectId,{...sourceView,revisionId:later});
  const recovered=await call('GET',routeFor(main.id)+'?'+query(selected));assert.equal(recovered.status,200,JSON.stringify(recovered.body));
  assert.equal(recovered.body.data.relation.id,receipt.relation.id);assert.equal(recovered.body.data.assembly_receipt,undefined);
  assert.equal(repository.getArtifactView(receipt.artifact_view_id).revisionId,input.revisionId);
  const repeat=await call('POST',routeFor(main.id),selected);assert.equal(repeat.status,200);assert.equal(repeat.body.data.already_present,true);
  assert.equal((await call('POST',routeFor('surface-core-context'),selected)).status,409,'foreign Canvas must not target a Glyth which is not there');
  assert.equal((await call('POST',routeFor(main.id),{...selected,position:{x:1,y:2}})).status,400);
  assert.equal(repository.getProjectExecutionProjection(projectId).runs.length,0);
  assert.deepEqual((await realHost.projects.getProjectGraph(projectId)).workspaceMemberships,before.workspaceMemberships);
  report.cases.push('Glyth: official manual-import/link/projected identity -> original durable conversation_context Relation/ChangeSet pinned to exact Revision; lost response recovery only GET, no material node/binding/workspace membership or Run');
  const oldWindow=globalThis.window,transport=globalThis.fetch,clientMethods=[];
  try{
    const localNodes=(await canvas(main.id)).nodes;let clientSync=0;
    const api={getNodes:()=>localNodes,getEdges:()=>[],flushCanvas:()=>{throw new Error('GET-only client recovery must not flush')},
      synchronizeMaterialProjection:async()=>{clientSync++;return{ok:true}}};
    globalThis.window={__LCOS_NODE_LAB__:{projectId,canvasId:main.id,api}};
    const signal=new AbortController().signal;
    globalThis.fetch=async(url,options={})=>{
      if(/^https?:/.test(String(url)))return transport(url,options);
      clientMethods.push(options.method??'GET');assert.equal(options.signal,signal);
      const result=await call(options.method??'GET',String(url),options.body?JSON.parse(options.body):undefined);
      return Response.json(result.body,{status:result.status});
    };
    const surfaceClient=await module.receiveNativeLibraryMaterial({...existingMain,canvasId:main.id,workspaceId:firstReceipts[0].workspace_id,artifactViewId:sourceView.id},
      {api,isCurrent:()=>true,readOnly:true,signal});
    assert.equal(surfaceClient.status,'already-present',JSON.stringify(surfaceClient));assert.equal(surfaceClient.nodeId,firstReceipts[0].node.id);
    const conversationClient=await module.receiveNativeLibraryMaterial({...selected,canvasId:main.id,workspaceId:receipt.workspace_id},
      {api,isCurrent:()=>true,readOnly:true,signal});
    assert.equal(conversationClient.status,'already-present',JSON.stringify(conversationClient));assert.equal(conversationClient.nodeId,undefined);
    assert.equal(conversationClient.canonicalReceipt.relation.id,receipt.relation.id);assert.equal(clientSync,1);
    assert.deepEqual(clientMethods,['GET','GET','GET']);
    report.cases.push('actual receive client uses real facade/linked identity receipts with advanced origin: surface and Glyth GET-only contract passes, all requests use supplied signal, no flush/POST; native publication callback is controlled (not original O8)');
  }finally{globalThis.fetch=transport;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow}
  report.writes=['isolated original View/Assembly Presentation/Relation producers and Huabu projection','official synthetic conversation import/connect/link, no model/executor/Run'];
  report.receipts=firstReceipts.map(r=>({target:r.target_ref,view:r.artifact_view_id,node:r.node.id,changeSet:r.change_set_id}));
  report.passed=true;
}finally{
  await facade?.close();globalThis.fetch=originalFetch;
  await fs.writeFile(${JSON.stringify(path.join(output,'report.json'))},JSON.stringify(report,null,2));
  if(!temp.startsWith(path.resolve(runtimeBase)+path.sep))throw new Error('Unexpected disposable producer directory');
  await fs.rm(temp,{recursive:true,force:true});
  console.log(JSON.stringify({passed:report.passed,cases:report.cases,report:${JSON.stringify(path.join(output,'report.json'))}}));
}
`;
const generated=path.join(root,'.runtime/native-material-receive-test-'+Date.now()+'.mjs');
await fs.mkdir(path.dirname(generated),{recursive:true});await fs.writeFile(generated,source+driver);
try{await import(pathToFileURL(generated).href)}finally{await fs.unlink(generated)}
