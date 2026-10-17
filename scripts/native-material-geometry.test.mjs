import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let source=await fs.readFile(path.join(root,'scripts/native-material-placement.test.mjs'),'utf8');
const seam='  const repeated = await placement.place(destination.id, input);';
if(source.split(seam).length!==2)throw new Error('Disposable original geometry fixture changed');
source=source.slice(0,source.indexOf(seam)).replace("    `export {createNativeMaterialPlacement}","    `export {createNativeMaterialGeometry} from ${JSON.stringify(relative('lab/pilot/native-material-geometry.ts'))};`,\n    `export {createNativeMaterialPlacement}")
  .replace('return originalFetch(address, options);','return globalThis.__nativeGeometryTestTransport?.(address,options,originalFetch) ?? originalFetch(address, options);');
const output=path.join(root,'output/原生文本整合_20261017e/Drop原几何写桥验证',new Date().toISOString().replaceAll(':','-').replace('.','-'));await fs.mkdir(output,{recursive:true});
const driver=`
  const selected={projectId,artifactId:input.artifactId,revisionId:input.revisionId,fileRecordId:input.fileRecordId,targetRef:{kind:'main'}};
  const route='/api/lcos/canvases/'+main.id+'/materials:receive';
  const created=await call('POST',route,{...selected,position:{x:480.123,y:-100.456}});assert.equal(created.status,200,JSON.stringify(created.body));
  const r=created.body.data,pid=r.presentation.id;
  const move=async point=>call('POST','/api/canvas/v1/canvases/'+main.id+'/nodes:batchActions',
    {canvas_id:main.id,actions:[{action:'update',updates:[{id:r.node.id,type:r.node.type,position:point}]}]});
  const concurrent={x:777,y:888},spatialPoint={x:1020.25,y:390.5};let intercepted=false;
  globalThis.__nativeGeometryTestTransport=async(address,options,upstream)=>{
    const u=new URL(String(address));
    if(!intercepted&&options?.method==='PUT'&&u.pathname.endsWith('/presentations/'+encodeURIComponent(pid))){
      intercepted=true;const request=JSON.parse(options.body);const changed={...request.contract,state:{...request.contract.state,positions:{...request.contract.state.positions,[r.artifact_view_id]:concurrent}}};
      const commit=await upstream(address,{...options,body:JSON.stringify({contract:changed,expectedVersion:request.expectedVersion})});
      assert.equal(commit.status,200,await commit.clone().text());
    }
    return upstream(address,options);
  };
  const conflicted=await move(spatialPoint);delete globalThis.__nativeGeometryTestTransport;
  assert.equal(intercepted,true);assert.equal(conflicted.status,409,JSON.stringify(conflicted.body));assert.equal(conflicted.body.error.code,'PARTIAL_COMMIT');
  assert.equal(conflicted.body.error.details.spatialSaved,true);assert.deepEqual(conflicted.body.error.details.corePresentationSavedIds,[]);
  assert.deepEqual(repository.getPresentationView(projectId,pid).state.positions[r.artifact_view_id],concurrent);
  assert.deepEqual((await canvas(main.id)).nodes.find(n=>n.id===r.node.id).position,spatialPoint);
  report.cases.push('real Core concurrent Presentation PUT wins; original native batch keeps its saved geometry and returns explicit PARTIAL_COMMIT with spatialSaved=true, no overwrite/rollback of concurrent Core layout');
  const roots=repository.getWorkspaces(projectId).map(w=>({canvasId:w.canvasId,workspaceId:String(w.id),scopeId:String(w.scopeId),surface:w.preferredSurface}));
  const originalView=repository.getArtifactView(r.artifact_view_id),writer=hostFor(main.id).artifacts;
  const foreignScope=repository.getScopes(projectId).find(scope=>String(scope.id)!==String(originalView.scopeId));
  assert.ok(foreignScope,'fixture requires a real distinct canonical Scope; all three root Workspaces share root Scope');
  const expected=r.node.data.lcos_ref;
  let reads=0,saves=0,mode='none';
  const make=()=>module.createNativeMaterialGeometry({repository,projectId,roots,
    readReference:async()=>{reads++;if(mode==='prepare'||mode==='commit'&&reads===2||mode==='readback'&&reads===3)
      await writer.putArtifactView(projectId,{...originalView,scopeId:String(foreignScope.id)});return expected},
    savePresentation:async(p,positions)=>{saves++;const response=await fetch(coreOrigin+'/projects/'+projectId+'/presentations/'+encodeURIComponent(p.id),
      {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({contract:{...p,state:{...p.state,positions:{...p.state.positions,...positions}}},expectedVersion:p.version})});
      assert.equal(response.status,200,await response.clone().text());return(await response.json()).value}});
  const operation=[{nodeId:r.node.id,position:{x:1600,y:720}}];
  mode='prepare';reads=0;await assert.rejects(make().prepare(main.id,operation),/identity|binding|membership/);assert.equal(saves,0);await writer.putArtifactView(projectId,originalView);
  mode='commit';reads=0;const owner=make(),prepared=await owner.prepare(main.id,operation);const declined=await owner.commit(prepared);
  assert.equal(declined.ok,false);assert.equal(saves,0);await writer.putArtifactView(projectId,originalView);
  mode='readback';reads=0;const lateOwner=make(),late=await lateOwner.prepare(main.id,operation);const uncertain=await lateOwner.commit(late);
  assert.equal(uncertain.ok,false);assert.equal(saves,1);assert.deepEqual(uncertain.savedPresentationIds,[pid]);await writer.putArtifactView(projectId,originalView);
  report.cases.push('actual exact View switched Scope during prepare/commit/readback async leaf: identified member is never silently skipped, pre-CAS refuses, post-CAS retains truthful saved Presentation evidence');
  const foreignRoot=module.createNativeMaterialGeometry({repository,projectId,roots:roots.filter(root=>root.canvasId!==main.id),readReference:async()=>expected,savePresentation:async()=>{throw new Error('foreign child must never save root')}});
  assert.deepEqual(await foreignRoot.prepare(main.id,operation),[]);
  const workspaceCarrier=await placement.place('surface-core-workflow',{...input,workspaceId:String(repository.getWorkspaces(projectId).find(w=>w.canvasId==='surface-core-workflow').id),position:{x:50,y:90}});
  const noMember=await make().prepare('surface-core-workflow',[{nodeId:workspaceCarrier.node.id,position:{x:70,y:110}}]);assert.deepEqual(noMember,[]);
  report.cases.push('no registered root Canvas mapping or only Workspace membership cannot update/add a root Presentation member');
  assert.equal(repository.getProjectExecutionProjection(projectId).runs.length,0);report.writes=['isolated original View/Presentation and native geometry owners, controlled concurrency via real original HTTP PUT'];report.passed=true;
}finally{
  delete globalThis.__nativeGeometryTestTransport;await facade?.close();globalThis.fetch=originalFetch;
  await fs.writeFile(${JSON.stringify(path.join(output,'report.json'))},JSON.stringify(report,null,2));
  if(!temp.startsWith(path.resolve(runtimeBase)+path.sep))throw new Error('Unexpected geometry fixture');await fs.rm(temp,{recursive:true,force:true});
  console.log(JSON.stringify({passed:report.passed,cases:report.cases,report:${JSON.stringify(path.join(output,'report.json'))}}));
}
`;
const generated=path.join(root,'.runtime/native-material-geometry-'+Date.now()+'.mjs');await fs.mkdir(path.dirname(generated),{recursive:true});await fs.writeFile(generated,source+driver);
try{await import(pathToFileURL(generated).href)}finally{await fs.unlink(generated)}
