import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let source=await fs.readFile(path.join(root,'scripts/native-material-placement.test.mjs'),'utf8');
const seam='  const repeated = await placement.place(destination.id, input);';
if(source.split(seam).length!==2)throw new Error('Disposable original Core fixture changed');
source=source.slice(0,source.indexOf(seam)).replace('return originalFetch(address, options);',
  'return globalThis.__nativePilePlacementTransport?.(address,options,originalFetch) ?? originalFetch(address,options);');
const output=path.join(root,'output/原生库集合整合_20261017g/后端首次放置验证',new Date().toISOString().replaceAll(':','-').replace('.','-'));
await fs.mkdir(output,{recursive:true});
const driver=`
  report.mode='real disposable Core Assembly + original ProjectToSpaceProjection + durable Core binding + original Huabu + native pile readback';
  const core=async(method,url,body)=>{const response=await fetch(coreOrigin+url,{method,
    ...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:response.status,body:await response.json()}};
  const create=async(title,owner=projectId)=>{const made=await call('POST','/api/lcos/core/projects/'+owner+'/collections',
    {title,members:[{type:'artifact',id:input.artifactId}]});assert.equal(made.status,201,JSON.stringify(made));return made.body.value};
  const projectRoute=id=>'/api/lcos/canvases/'+id+'/collections:project';
  const readRoute=(id,cid)=>'/api/lcos/canvases/'+id+'/collections/'+encodeURIComponent(cid)+'/projection';
  const membershipsBefore=structuredClone(repository.listProjectWorkspaceMemberships(projectId));
  const sharedCollection=await create('Synthetic same Collection across three native Library sites');
  for(const [index,kind] of ['main','context','workflow'].entries()){
    const target='surface-core-'+kind,collection=sharedCollection,position={x:900.123+index*500,y:-180.456-index*25};
    const before=await call('GET',readRoute(target,collection.id));assert.equal(before.status,200,JSON.stringify(before.body));
    assert.equal(before.body.data.state,'absent');assert.equal(before.body.data.presentation_received,kind==='context','Main and Context share their real root Presentation');
    const nodesBefore=(await canvas(target)).nodes,created=await call('POST',projectRoute(target),{collectionId:collection.id,position});
    assert.equal(created.status,200,JSON.stringify(created.body));const receipt=created.body.data,ref=receipt.node.data.lcos_collection_ref;
    assert.equal(receipt.state,'present');assert.equal(receipt.presentation_received,true);assert.equal(receipt.project_id,projectId);
    assert.equal(receipt.provider_execution_started,false);assert.equal(receipt.node.type,'pile');assert.equal(receipt.node.data.lcos_native_collection,true);
    assert.deepEqual(receipt.node.position,position);assert.equal(ref.projectId,projectId);assert.equal(ref.canvasId,target);
    assert.equal(ref.workspaceId,receipt.workspace_id);assert.equal(ref.collectionId,collection.id);
    assert.equal(receipt.binding.entityType,'collection');assert.equal(receipt.binding.entityId,collection.id);assert.equal(receipt.binding.spatialId,receipt.node.id);
    assert.equal(receipt.assembly_receipt.results[0].sourceRef.kind,'collection');assert.equal(receipt.assembly_receipt.results[0].channel,kind==='context'?'already-member':'presentation-membership');
    if(kind==='context')assert.equal(receipt.change_set_id,undefined);else assert.ok(receipt.change_set_id);
    assert.ok(receipt.presentation.state.memberEntityRefs.some(ref=>ref.type==='collection'&&ref.id===collection.id));
    const raw=await facade.spatial.read(target),rawCarrier=raw.state.nodes.find(node=>node.id===receipt.node.id);
    assert.equal(rawCarrier.type,'note','same original RFS carrier schema, not a second pile node');assert.deepEqual(rawCarrier.position,position);
    assert.deepEqual(rawCarrier.data.lcos_collection_ref,ref,'canonical source echo is saved in the same original CREATE, not a separate journal');
    assert.equal((await canvas(target)).nodes.length,nodesBefore.length+1);assert.equal((await canvas(target)).nodes.find(node=>node.id===receipt.node.id).type,'pile');
    for(const old of nodesBefore)assert.deepEqual((await canvas(target)).nodes.find(node=>node.id===old.id),old);
    // The caller discards the committed HTTP200. Recovery only reads real owners.
    const recovered=await call('GET',readRoute(target,collection.id));assert.equal(recovered.body.data.state,'present');
    assert.equal(recovered.body.data.node.id,receipt.node.id);assert.equal(recovered.body.data.assembly_receipt,undefined);
    const version=recovered.body.data.presentation.version;
    const repeat=await call('POST',projectRoute(target),{collectionId:collection.id,position:{x:9000,y:9000}});
    assert.equal(repeat.status,200);assert.equal(repeat.body.data.already_present,true);assert.deepEqual(repeat.body.data.node.position,position);
    assert.equal(repeat.body.data.presentation.version,version);assert.equal((await canvas(target)).nodes.length,nodesBefore.length+1);
    report.cases.push(kind+': first original Library intent -> real Assembly Collection membership/ChangeSet -> one original carrier/binding -> native pile; lost200 GET and repeat keep exact ID/position and no additional semantic write');
  }
  assert.deepEqual(repository.listProjectWorkspaceMemberships(projectId),membershipsBefore,'Collection surface reception must not become Workspace membership');
  const interrupted=await create('Synthetic CREATE succeeds binding fails');let failedBindingWrites=0;
  globalThis.__nativePilePlacementTransport=async(address,options,upstream)=>{
    const url=new URL(String(address));if(options?.method==='PUT'&&url.pathname.endsWith('/spatial/bindings')
      &&JSON.parse(options.body).entityId===interrupted.id){failedBindingWrites++;return Response.json({ok:false,error:{code:'UNAVAILABLE',message:'Synthetic lost binding write before commit'}},{status:503})}
    return upstream(address,options);
  };
  const beforeInterrupted=await facade.spatial.read(main.id),failed=await call('POST',projectRoute(main.id),{collectionId:interrupted.id,position:{x:2400,y:400}});
  delete globalThis.__nativePilePlacementTransport;assert.notEqual(failed.status,200);assert.equal(failedBindingWrites,1);
  const afterInterrupted=await facade.spatial.read(main.id);assert.equal(afterInterrupted.state.nodes.length,beforeInterrupted.state.nodes.length+1,'original CREATE actually committed once');
  assert.equal(repository.findProjectionBinding(projectId,main.id,'node','collection',interrupted.id),undefined);
  const unresolved=await call('GET',readRoute(main.id,interrupted.id));assert.equal(unresolved.status,200);assert.equal(unresolved.body.data.state,'partial');
  assert.equal(unresolved.body.data.presentation_received,true);assert.equal(unresolved.body.data.binding,null);assert.equal(unresolved.body.data.node,null);
  const repeatInterrupted=await call('POST',projectRoute(main.id),{collectionId:interrupted.id});assert.equal(repeatInterrupted.status,409);
  assert.equal((await facade.spatial.read(main.id)).state.nodes.length,afterInterrupted.state.nodes.length);
  report.cases.push('real original CREATE commits but Core binding PUT fails: real Presentation membership remains; GET partial never guesses orphan by title; repeated POST refuses and no second carrier is created');
  const concurrent=await create('Synthetic two queued first placements');let receptions=0,concurrentBindingWrites=0;
  const beforeConcurrent=await facade.spatial.read(main.id);
  globalThis.__nativePilePlacementTransport=async(address,options,upstream)=>{
    const url=new URL(String(address)),body=options?.body?JSON.parse(options.body):undefined;
    if(options?.method==='POST'&&url.pathname.endsWith('/assembly/apply')&&body?.sourceRefs?.[0]?.id===concurrent.id){
      receptions++;
    }
    if(options?.method==='PUT'&&url.pathname.endsWith('/spatial/bindings')&&body?.entityId===concurrent.id){
      concurrentBindingWrites++;return Response.json({ok:false,error:{code:'UNAVAILABLE',message:'Synthetic first creator binding unavailable'}},{status:503});
    }
    return upstream(address,options);
  };
  const simultaneous=await Promise.all([call('POST',projectRoute(main.id),{collectionId:concurrent.id,position:{x:2600,y:500}}),
    call('POST',projectRoute(main.id),{collectionId:concurrent.id,position:{x:2600,y:500}})]);delete globalThis.__nativePilePlacementTransport;
  assert.equal(receptions,1,'the existing facade batchWriteTail serializes public Collection writes; the second sees partial before Assembly');
  assert.ok(simultaneous.every(response=>response.status===409),JSON.stringify(simultaneous));
  assert.equal(concurrentBindingWrites,1);assert.equal((await facade.spatial.read(main.id)).state.nodes.length,beforeConcurrent.state.nodes.length+1);
  assert.equal((await call('GET',readRoute(main.id,concurrent.id))).body.data.state,'partial');
  report.cases.push('two simultaneously requested real facade POSTs retain original batchWriteTail serialization: first CREATE/binding failure leaves an exact saved echo, second observes partial before Assembly and creates no duplicate; not a producer-level concurrent-absent proof');
  const legacy=await create('Synthetic already received without any carrier'),legacyApply=await core('POST','/projects/'+projectId+'/assembly/apply',
    {schemaVersion:1,projectId,sourceRefs:[{kind:'collection',id:legacy.id}],targetRef:{kind:'main'}});
  assert.equal(legacyApply.status,200);const legacyRead=await call('GET',readRoute(main.id,legacy.id));
  assert.equal(legacyRead.body.data.state,'absent');assert.equal(legacyRead.body.data.presentation_received,true);
  const legacyPlaced=await call('POST',projectRoute(main.id),{collectionId:legacy.id,position:{x:2700,y:800}});
  assert.equal(legacyPlaced.status,200,JSON.stringify(legacyPlaced.body));assert.equal(legacyPlaced.body.data.assembly_receipt.results[0].channel,'already-member');
  report.cases.push('legacy original Assembly already-received but never-projected Collection can first-place through the same endpoint without another semantic mutation; no blanket partial replay');
  const removed=await create('Synthetic concurrent Presentation removal'),countBefore=(await facade.spatial.read(main.id)).state.nodes.length;let removedAtAwait=false;
  globalThis.__nativePilePlacementTransport=async(address,options,upstream)=>{
    const url=new URL(String(address));if(!removedAtAwait&&(options?.method??'GET')==='GET'&&url.pathname.endsWith('/spatial/bindings')){
      removedAtAwait=true;const scope=repository.getWorkspaces(projectId).find(w=>w.canvasId===main.id).scopeId,p=repository.getPresentationView(projectId,'presentation:context:'+scope);
      assert.ok(p.state.memberEntityRefs.some(ref=>ref.type==='collection'&&ref.id===removed.id));
      const response=await upstream(coreOrigin+'/projects/'+projectId+'/presentations/'+encodeURIComponent(p.id),{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({expectedVersion:p.version,contract:{...p,state:{...p.state,memberEntityRefs:p.state.memberEntityRefs.filter(ref=>!(ref.type==='collection'&&ref.id===removed.id))}}})});
      assert.equal(response.status,200,await response.clone().text());
    }return upstream(address,options);
  };
  const raced=await call('POST',projectRoute(main.id),{collectionId:removed.id,position:{x:2900,y:400}});delete globalThis.__nativePilePlacementTransport;
  assert.equal(removedAtAwait,true);assert.equal(raced.status,409);assert.equal((await facade.spatial.read(main.id)).state.nodes.length,countBefore);
  assert.equal(repository.findProjectionBinding(projectId,main.id,'node','collection',removed.id),undefined);
  report.cases.push('real Presentation member removed during original projector async binding lookup: final assertion under original Canvas lock prevents original CREATE, no binding or replacement owner');
  const missing=await create('Synthetic missing saved carrier'),made=await call('POST',projectRoute(main.id),{collectionId:missing.id});assert.equal(made.status,200);
  await facade.spatial.execute(main.id,[{type:'DELETE_NODES',nodeIds:[made.body.data.node.id]}]);
  const missingRead=await call('GET',readRoute(main.id,missing.id));assert.equal(missingRead.body.data.state,'partial');
  assert.equal((await call('POST',projectRoute(main.id),{collectionId:missing.id})).status,409,'no original stale-binding repair replay for unknown placement');
  report.cases.push('existing binding with missing saved carrier stays partial; the first-placement endpoint never replays original stale-binding repair');
  const unknown=await call('POST',projectRoute(main.id),{collectionId:'missing-canonical-collection'});assert.equal(unknown.status,404);
  assert.equal((await call('POST',projectRoute(main.id),{collectionId:missing.id,position:{x:null,y:2}})).status,400);
  assert.equal((await call('POST',projectRoute(main.id),{collectionId:missing.id,parentId:'foreign'})).status,400);
  const foreignProject='synthetic-native-pile-foreign',foreignRoot=path.join(temp,'foreign-project');await fs.mkdir(foreignRoot,{recursive:true});
  repository.createProject({id:foreignProject,name:'Synthetic foreign Collection owner',rootPath:foreignRoot});
  const foreignResponse=await core('POST','/projects/'+foreignProject+'/collections',{title:'Foreign Collection'});assert.equal(foreignResponse.status,201);
  assert.equal((await call('POST',projectRoute(main.id),{collectionId:foreignResponse.body.value.id})).status,404);
  assert.equal((await call('POST','/api/lcos/core/projects/'+foreignProject+'/collections',{title:'Cross-project create forbidden'})).status,404);
  assert.equal((await call('POST','/api/lcos/core/projects/'+projectId+'/collections',{title:'',members:[]})).status,400);
  assert.equal((await call('POST','/api/lcos/core/projects/'+projectId+'/collections',{title:'Mismatched project',projectId:foreignProject})).status,400);
  report.cases.push('formal proxied Core Collection createFromMembers producer is live; missing/foreign Collection, cross-project create, invalid title/body project and caller geometry/parent overrides refuse');
  assert.equal(repository.getProjectExecutionProjection(projectId).runs.length,0);report.modelsExecuted=false;report.passed=true;
}finally{
  delete globalThis.__nativePilePlacementTransport;await facade?.close();globalThis.fetch=originalFetch;
  await fs.writeFile(${JSON.stringify(path.join(output,'report.json'))},JSON.stringify(report,null,2));
  if(!temp.startsWith(path.resolve(runtimeBase)+path.sep))throw new Error('Unexpected Collection fixture root');await fs.rm(temp,{recursive:true,force:true});
  console.log(JSON.stringify({passed:report.passed,cases:report.cases,report:${JSON.stringify(path.join(output,'report.json'))}}));
}
`;
const generated=path.join(root,'.runtime/native-pile-collection-placement-'+Date.now()+'.mjs');await fs.mkdir(path.dirname(generated),{recursive:true});await fs.writeFile(generated,source+driver);
try{await import(pathToFileURL(generated).href)}finally{await fs.unlink(generated)}
