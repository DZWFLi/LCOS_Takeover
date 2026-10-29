import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createNativeCoreColorPinTransforms} from '../lab/native-core-color-pin-transform.mjs';
import {readCurrentGen2Resource} from '../lab/current-gen2-resources.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const [relative,transform]of Object.entries(createNativeCoreColorPinTransforms())){
  const sourcePath=path.join(root,relative),original=readCurrentGen2Resource(sourcePath)?.contents??await fs.readFile(sourcePath,'utf8');
  const adapted=transform(original,{sourcePath});assert.equal(transform(adapted,{sourcePath}),adapted);
  assert.throws(()=>transform(original,{sourcePath:path.join(root,'wrong-source.ts')}));
  assert.equal(readCurrentGen2Resource(sourcePath)?.contents??await fs.readFile(sourcePath,'utf8'),original);
}
let source=await fs.readFile(path.join(root,'scripts/native-material-placement.test.mjs'),'utf8');
const seam='  const repeated = await placement.place(destination.id, input);';
if(source.split(seam).length!==2)throw new Error('Disposable Core fixture changed');
source=source.slice(0,source.indexOf(seam)).replace("{ coreCollectionTitle: true }","{ coreCollectionTitle: true, coreColorPin: true }")
  .replace("    `export {createNativeMaterialPlacement}","    `export {CoreColorPinClient} from ${JSON.stringify(relative('lcos/apps/web-gen2/src/backend/colorPins.ts'))};`,\n    `export {createNativeMaterialPlacement}");
const output=path.join(root,'output/原生ColorPin整合_20261017h/后端真实Core验证',new Date().toISOString().replaceAll(':','-').replace('.','-'));await fs.mkdir(output,{recursive:true});
const driver=`
  report.mode='actual selected-source Core ColorPin/Navigation/MutationSafety/curation transaction; typed client uses controlled facade transport to the real Core';
  const route='/api/lcos/core/projects/'+projectId+'/color-pins',target={projectId,kind:'view',id:historical.artifactViewId};
  const graphBefore=structuredClone(repository.getProjectExecutionProjection(projectId));
  const canvasBefore=await Promise.all(['surface-core-main','surface-core-context','surface-core-workflow'].map(id=>facade.spatial.read(id)));
  const core=async(method,url,body)=>{const response=await fetch(coreOrigin+url,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:response.status,body:await response.json()}};
  const assign=async targetRef=>{const response=await call('POST',route+'/memberships',{targetRef,color:'#4EA8FF',label:'Initial synthetic pin'});assert.ok([200,201].includes(response.status),JSON.stringify(response.body));return response.body};
  assert.equal((await call('GET',route)).status,200);
  const first=await assign(target),definition=first.value.definition,membership=first.value.membership;
  assert.ok(first.meta.changeSetId);assert.equal((await assign(target)).value.membership.id,membership.id);
  const otherTarget={projectId,kind:'view',id:result.node.data.lcos_ref.artifactViewId},other=await assign(otherTarget);
  assert.equal(other.value.definition.id,definition.id);assert.notEqual(other.value.membership.id,membership.id);
  const extra=await call('POST',route+'/memberships',{targetRef:target,color:'#123456'});assert.equal(extra.status,201);
  const snapshot=(await call('GET',route)).body.value;assert.equal(snapshot.definitions.length,2);assert.equal(snapshot.memberships.length,3);
  report.cases.push('original proxy snapshot/assign: same target reuse, two Views of one Artifact stay separate, multicolor including non-six-color definitions retained');
  const ownedBefore=structuredClone(snapshot.memberships),renameRoute=route+'/definitions/'+encodeURIComponent(definition.id);
  const requested={label:'  Project shared name  ',expectedUpdatedAt:definition.updatedAt,expectedLabel:definition.label??null};
  const renamed=await call('PATCH',renameRoute,requested);assert.equal(renamed.status,200,JSON.stringify(renamed.body));
  const after=renamed.body.value.definition,renameId=renamed.body.meta.changeSetId;assert.ok(renameId);
  assert.equal(after.label,'Project shared name');assert.equal(after.id,definition.id);assert.equal(after.color,definition.color);assert.equal(after.createdAt,definition.createdAt);
  assert.ok(Date.parse(after.updatedAt)>Date.parse(definition.updatedAt));assert.deepEqual(repository.listColorPinMemberships(projectId),ownedBefore);
  const change=repository.getMutationChangeSet(renameId).changes[0];assert.equal(change.type,'color_pin_definition_update');assert.deepEqual(change.before,definition);assert.deepEqual(change.after,after);
  assert.equal((await call('PATCH',renameRoute,requested)).status,409,'stale exact definition is never silently renamed');
  const observed={expectedUpdatedAt:after.updatedAt,expectedLabel:after.label};
  const unchanged=await call('PATCH',renameRoute,{...observed,label:after.label});assert.equal(unchanged.status,200);assert.equal(unchanged.body.meta,undefined);
  assert.equal((await call('PATCH',renameRoute,{...observed,label:''})).status,400);
  assert.equal((await call('PATCH',renameRoute,{...observed,label:'x',color:'#FFFFFF'})).status,400);
  assert.equal((await call('PATCH',renameRoute,{...observed,label:'x',expectedLabel:'wrong prior'})).status,409);
  report.cases.push('label-only rename uses original before/after ChangeSet and atomic old-value/timestamp CAS; IDs/color/createdAt/memberships preserved, no-op creates no ChangeSet, blank/extra/stale fields reject');
  const action=id=>'/projects/'+projectId+'/change-sets/'+encodeURIComponent(id);
  assert.equal((await core('POST',action(renameId)+'/revert',{})).status,200);assert.deepEqual(repository.getColorPinDefinition(definition.id),definition);
  assert.equal((await core('POST',action(renameId)+'/reapply',{})).status,200);assert.deepEqual(repository.getColorPinDefinition(definition.id),after);
  const competitors=await Promise.all([call('PATCH',renameRoute,{...observed,label:'Concurrent name A'}),call('PATCH',renameRoute,{...observed,label:'Concurrent name B'})]);
  assert.deepEqual(competitors.map(r=>r.status).sort(),[200,409]);
  const winner=competitors.find(r=>r.status===200),winnerDefinition=winner.body.value.definition;
  assert.equal((await core('POST',action(renameId)+'/revert',{})).status,409,'old rename cannot undo later touched definition');
  assert.deepEqual(repository.getColorPinDefinition(definition.id),winnerDefinition);
  assert.deepEqual(repository.listColorPinMemberships(projectId),ownedBefore);
  report.cases.push('actual original ChangeSet revert/reapply keeps exact same definition/memberships; two concurrent PATCHes have one winner, prior rename undo cannot overwrite newer label');
  const badChangeSet={...repository.getMutationChangeSet(winner.body.meta.changeSetId),id:'synthetic-pin-rollback-changeset',operationId:'synthetic-pin-rollback'};
  const invalidMembership={...membership,id:'synthetic-invalid-pin-membership',colorPinId:'missing-pin-definition'};
  assert.throws(()=>repository.runCurationMutation({projectId,colorPinDefinitionUpdates:[{before:winnerDefinition,after:{...winnerDefinition,label:'Must roll back'}}],
    colorPinMembershipAdds:[invalidMembership],changeSet:badChangeSet}));
  assert.deepEqual(repository.getColorPinDefinition(definition.id),winnerDefinition);assert.equal(repository.getMutationChangeSet(badChangeSet.id),undefined);
  report.cases.push('real repository curation transaction rolls label update back when a later original membership write fails, no half label or fabricated ChangeSet');
  const signal=new AbortController().signal,typedMethods=[];
  const typed=new module.CoreColorPinClient(new module.HttpClient({baseUrl:'http://127.0.0.1/api/lcos/core',fetch:async(url,options)=>{
    typedMethods.push(options.method);assert.equal(options.signal,signal);const u=new URL(String(url));
    const response=await call(options.method,u.pathname,options.body?JSON.parse(options.body):undefined);return Response.json(response.body,{status:response.status})}}));
  const typedResult=await typed.renameDefinition(projectId,definition.id,{label:'Typed rename receipt',expectedUpdatedAt:winnerDefinition.updatedAt,expectedLabel:winnerDefinition.label},signal);
  assert.ok(typedResult.changeSetId);assert.equal(typedResult.definition.id,definition.id);assert.deepEqual(typedMethods,['PATCH']);
  // Discard a committed response at caller: verification is the original snapshot GET, not another PATCH.
  const readback=await typed.snapshot(projectId,signal);assert.equal(readback.definitions.find(d=>d.id===definition.id).label,'Typed rename receipt');assert.deepEqual(typedMethods,['PATCH','GET']);
  report.cases.push('existing typed ColorPin client extension sends one PATCH with AbortSignal; discarded committed reply is verified by snapshot GET only, preserving canonical IDs');
  const nav=await call('POST','/api/lcos/core/projects/'+projectId+'/navigation/resolve',{targetRef:target});assert.equal(nav.status,200);assert.equal(nav.body.value.status,'resolved');
  const foreign=await call('POST','/api/lcos/core/projects/'+projectId+'/navigation/resolve',{targetRef:{...target,projectId:'foreign'}});assert.equal(foreign.status,200);assert.equal(foreign.body.value.status,'unresolved');
  assert.equal((await call('POST',route+'/memberships',{targetRef:{...target,projectId:'foreign'},color:'#4EA8FF'})).status,400);
  assert.equal((await call('GET','/api/lcos/core/projects/foreign/color-pins')).status,404);
  assert.equal((await call('PATCH',route+'/definitions/missing',{...observed,label:'foreign'})).status,404);
  const foreignProject='synthetic-colorpin-foreign-project',foreignRoot=path.join(temp,'foreign-project');await fs.mkdir(foreignRoot,{recursive:true});
  repository.createProject({id:foreignProject,name:'Synthetic foreign ColorPin owner',rootPath:foreignRoot});
  const foreignPin=await core('POST','/projects/'+foreignProject+'/color-pins/memberships',
    {targetRef:{projectId:foreignProject,kind:'surface',id:'main'},color:'#4EA8FF',label:'Foreign stays unchanged'});
  assert.equal(foreignPin.status,201,JSON.stringify(foreignPin.body));
  assert.equal((await call('DELETE',route+'/memberships/'+foreignPin.body.value.membership.id)).status,404);
  const foreignDefinition=foreignPin.body.value.definition;
  assert.equal((await call('PATCH',route+'/definitions/'+foreignDefinition.id,{label:'Must not cross project',
    expectedUpdatedAt:foreignDefinition.updatedAt,expectedLabel:foreignDefinition.label})).status,404);
  assert.deepEqual(repository.getColorPinDefinition(foreignDefinition.id),foreignDefinition);
  const removed=await call('DELETE',route+'/memberships/'+encodeURIComponent(membership.id));assert.equal(removed.status,200);assert.ok(removed.body.meta.changeSetId);
  assert.equal((await call('GET',route)).body.value.memberships.some(m=>m.id===membership.id),false);
  assert.ok((await call('GET',route)).body.value.memberships.some(m=>m.id===other.value.membership.id));
  assert.equal((await call('DELETE',route+'/memberships/'+encodeURIComponent(membership.id))).status,404);
  assert.deepEqual(repository.getProjectExecutionProjection(projectId),graphBefore);
  assert.deepEqual(await Promise.all(['surface-core-main','surface-core-context','surface-core-workflow'].map(id=>facade.spatial.read(id))),canvasBefore);
  assert.equal(repository.getProjectExecutionProjection(projectId).runs.length,0);
  report.cases.push('same-project original navigation/membership removal preserves foreign/unresolved semantics and other View/color relations; all Canvas state, execution projection and Runs unchanged');
  report.writes=['isolated original ColorPin definitions/memberships/ChangeSets only'];report.passed=true;
}finally{
  await facade?.close();globalThis.fetch=originalFetch;await fs.writeFile(${JSON.stringify(path.join(output,'report.json'))},JSON.stringify(report,null,2));
  if(!temp.startsWith(path.resolve(runtimeBase)+path.sep))throw new Error('Unexpected ColorPin fixture root');await fs.rm(temp,{recursive:true,force:true});
  console.log(JSON.stringify({passed:report.passed,cases:report.cases,report:${JSON.stringify(path.join(output,'report.json'))}}));
}
`;
const generated=path.join(root,'.runtime/native-colorpin-backend-'+Date.now()+'.mjs');await fs.mkdir(path.dirname(generated),{recursive:true});await fs.writeFile(generated,source+driver);
try{await import(pathToFileURL(generated).href)}finally{await fs.unlink(generated)}
