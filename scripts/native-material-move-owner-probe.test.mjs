import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const original=process.argv.includes('--expect-missing-bridge');
const source=await fs.readFile(path.join(root,'scripts/native-material-placement.test.mjs'),'utf8');
const seam='  const repeated = await placement.place(destination.id, input);';
if(source.split(seam).length!==2)throw new Error('Disposable original material fixture changed');
const output=path.join(root,'output/原生文本整合_20261017e/Drop正常移动owner探针',new Date().toISOString().replaceAll(':','-').replace('.','-'));
await fs.mkdir(output,{recursive:true});
const driver=`
  const selected={projectId,artifactId:input.artifactId,revisionId:input.revisionId,fileRecordId:input.fileRecordId,targetRef:{kind:'main'}};
  const route='/api/lcos/canvases/'+main.id+'/materials:receive';
  const release={x:542.4233409610985,y:-191.24673913043478};
  const created=await call('POST',route,{...selected,position:release});assert.equal(created.status,200,JSON.stringify(created.body));
  const receipt=created.body.data,pid=receipt.presentation.id;
  const before=structuredClone(repository.getPresentationView(projectId,pid)),viewBefore=structuredClone(repository.getArtifactView(receipt.artifact_view_id));
  const moved={x:910.25,y:280.5};
  const moveWrite=await call('POST','/api/canvas/v1/canvases/'+main.id+'/nodes:batchActions',
    {canvas_id:main.id,actions:[{action:'update',updates:[{id:receipt.node.id,type:receipt.node.type,position:moved}]}]});
  assert.equal(moveWrite.status,200,JSON.stringify(moveWrite.body));assert.equal(moveWrite.body.data.spatial_saved,true);assert.equal(moveWrite.body.data.core_saved,${!original});
  const saved=(await canvas(main.id)).nodes.find(n=>n.id===receipt.node.id);assert.deepEqual(saved.position,moved);
  const after=repository.getPresentationView(projectId,pid);
  if(${original})assert.deepEqual(after,before);else{assert.equal(after.version,before.version+1);assert.deepEqual(after.state.positions[receipt.artifact_view_id],moved);assert.deepEqual(after.state.memberViewIds,before.state.memberViewIds)}
  assert.deepEqual(repository.getArtifactView(receipt.artifact_view_id),viewBefore);
  assert.deepEqual(saved.data.lcos_ref,receipt.node.data.lcos_ref);
  const read=async()=>{const response=await call('GET',route+'?'+new URLSearchParams({...selected,targetRef:JSON.stringify(selected.targetRef)}));assert.equal(response.status,200,JSON.stringify(response.body));return response.body.data};
  const observed=await read();assert.equal(observed.state,${JSON.stringify(original?'partial':'present')});
  const repeat=await call('POST',route,{...selected,position:release});assert.equal(repeat.status,${original?409:200});
  assert.deepEqual((await canvas(main.id)).nodes.find(n=>n.id===receipt.node.id).position,moved,'repeat must not revert a legitimate user move');
  report.cases.push(${JSON.stringify(original?'REPRODUCED: native move saved only Huabu and semantic GET became partial':'FIXED: original native move now saves Huabu then version-CAS synchronizes existing Presentation member; GET and repeat confirm without moving it back')});
  // Demonstrate the existing canonical spatial owner, not a product fix: its
  // original version-CAS PUT synchronizes positions only in this disposable Core.
  const address=coreOrigin+'/projects/'+encodeURIComponent(projectId)+'/presentations/'+encodeURIComponent(pid);
  const contract={...before,state:{...before.state,positions:{...before.state.positions,[receipt.artifact_view_id]:moved}}};
  if(${original}){const synchronized=await fetch(address,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({contract,expectedVersion:before.version})});assert.equal(synchronized.status,200,await synchronized.clone().text())}
  assert.equal((await read()).state,'present');
  const stale=await fetch(address,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({contract,expectedVersion:before.version})});
  assert.equal(stale.status,409);
  const confirmed=repository.getPresentationView(projectId,pid);assert.deepEqual(confirmed.state.positions[receipt.artifact_view_id],moved);
  assert.deepEqual(confirmed.state.memberViewIds,before.state.memberViewIds);assert.equal(confirmed.version,before.version+1);
  const duplicate=await call('POST',route,{...selected,position:release});assert.equal(duplicate.status,200);assert.equal(duplicate.body.data.already_present,true);
  assert.deepEqual(duplicate.body.data.node.position,moved);assert.equal(repository.getProjectExecutionProjection(projectId).runs.length,0);
  if(!${original}){
    const reverse={x:542.42,y:-191.25};
    const move=async position=>{const response=await call('POST','/api/canvas/v1/canvases/'+main.id+'/nodes:batchActions',
      {canvas_id:main.id,actions:[{action:'update',updates:[{id:receipt.node.id,type:receipt.node.type,position}]}]});assert.equal(response.status,200,JSON.stringify(response.body));return response};
    await move(reverse);assert.equal((await read()).state,'present');assert.deepEqual(repository.getPresentationView(projectId,pid).state.positions[receipt.artifact_view_id],reverse);
    await move(moved);assert.equal((await read()).state,'present');
    const version=repository.getPresentationView(projectId,pid).version;
    const idempotent=await move(moved);assert.equal(idempotent.body.data.core_saved,false);assert.equal(repository.getPresentationView(projectId,pid).version,version);
    report.cases.push('original reverse geometry body (Undo path) and forward body (Redo path) both synchronize; same-position retry has no extra Presentation version, membership or Revision');
  }
  report.cases.push(${JSON.stringify(original?'test-only original Presentation PUT restores exact GET/repeat after missing bridge; stale version remains409':'production bridge uses original Presentation version-CAS; same exact membership and moved carrier remain, stale PUT remains409')});
  report.probe={released:release,moved,spatialSaved:moveWrite.body.data.spatial_saved,coreSaved:moveWrite.body.data.core_saved,
    initialPresentationVersion:before.version,versionAfterNativeMove:after.version,stateAfterNativeMove:observed.state,
    stateAfterOriginalOwnerSync:'present',presentationOwnerBridgeMissing:${original},productionBridgeApplied:${!original}};
  report.writes=['isolated canonical material receive','original native geometry batch',${JSON.stringify(original?'test-only explicit original Presentation PUT demonstration':'product original Presentation version-CAS geometry bridge')}];report.passed=true;
}finally{
  await facade?.close();globalThis.fetch=originalFetch;await fs.writeFile(${JSON.stringify(path.join(output,'report.json'))},JSON.stringify(report,null,2));
  if(!temp.startsWith(path.resolve(runtimeBase)+path.sep))throw new Error('Unexpected move owner probe runtime');await fs.rm(temp,{recursive:true,force:true});
  console.log(JSON.stringify({passed:report.passed,cases:report.cases,probe:report.probe,report:${JSON.stringify(path.join(output,'report.json'))}}));
}
`;
const generated=path.join(root,'.runtime/native-material-move-owner-'+Date.now()+'.mjs');await fs.mkdir(path.dirname(generated),{recursive:true});
await fs.writeFile(generated,source.slice(0,source.indexOf(seam))+driver);
try{await import(pathToFileURL(generated).href)}finally{await fs.unlink(generated)}
