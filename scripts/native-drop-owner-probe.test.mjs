import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Reuse the real disposable Core/Gen2Host/Huabu producer setup; do not run its
// other tests, create a Run, alter a product owner, or touch the candidate.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(root, 'scripts/native-material-placement.test.mjs'), 'utf8');
const seam = '  const repeated = await placement.place(destination.id, input);';
if (source.split(seam).length !== 2) throw new Error('Disposable material producer fixture seam changed.');
const output = path.join(root, 'output/原生文本整合_20261017e/Drop源View确版探针', new Date().toISOString().replaceAll(':', '-').replace('.', '-'));
await fs.mkdir(output, { recursive: true });
const driver = `
  const sourceView = {...repository.getArtifactView(historical.artifactViewId), id:'view:synthetic-drop-owner-probe',
    revisionId:input.revisionId, referenceKind:'explicit_additional'};
  const writer = hostFor(main.id).artifacts;
  await writer.putArtifactView(projectId, sourceView);
  const workflow = repository.getWorkspaces(projectId).find(row=>row.canvasId==='surface-core-workflow');
  const captured = {...input,workspaceId:String(workflow.id),artifactViewId:String(sourceView.id),position:{x:123.5,y:-248.25}};
  assert.equal((await placement.inspect('surface-core-workflow',captured)).state,'absent');
  const nextRevision = String(repository.getArtifact(input.artifactId).currentRevisionId);
  await writer.putArtifactView(projectId,{...sourceView,revisionId:nextRevision});
  await assert.rejects(placement.place('surface-core-workflow',captured),error=>error.code==='MATERIAL_SOURCE_VIEW_CHANGED');
  const pinnedId='view:native-library:'+ [captured.workspaceId,captured.artifactId,captured.revisionId].map(encodeURIComponent).join(':');
  assert.equal(repository.getArtifactView(pinnedId),undefined,'changed source refuses before creating the target View');
  report.cases.push('captured mutable source View changed before commit is rejected before new target View or membership');
  await writer.putArtifactView(projectId,sourceView);
  const placed=await placement.place('surface-core-workflow',captured);
  assert.equal(placed.state,'present');assert.equal(placed.node.data.lcos_ref.revisionId,captured.revisionId);
  assert.deepEqual(placed.node.position,captured.position);
  await writer.putArtifactView(projectId,{...sourceView,revisionId:nextRevision});
  const recoveredExact=await placement.inspect('surface-core-workflow',captured);
  assert.equal(recoveredExact.state,'present');assert.equal(recoveredExact.node.id,placed.node.id);
  const {artifactViewId:_originView,...exactReadback}=captured;
  const actual=await placement.inspect('surface-core-workflow',exactReadback);
  assert.equal(actual.state,'present');assert.equal(actual.node.id,placed.node.id);
  assert.equal(actual.node.data.lcos_ref.revisionId,captured.revisionId);
  assert.equal(repository.getArtifactView(placed.artifact_view_id).revisionId,captured.revisionId);
  for(const artifactViewId of ['missing-foreign-source',String(repository.getArtifactViewsByProject(projectId).find(view=>String(view.artifactId)!==input.artifactId).id)])
    await assert.rejects(placement.inspect('surface-core-workflow',{...captured,artifactViewId}),error=>error.code==='MATERIAL_SOURCE_VIEW_CHANGED');
  const outsideScope={...sourceView,id:'view:synthetic-source-foreign-scope',scopeId:'scope-not-in-this-project'};
  await writer.putArtifactView(projectId,outsideScope);
  await assert.rejects(placement.inspect('surface-core-workflow',{...captured,artifactViewId:outsideScope.id}),error=>error.code==='MATERIAL_SOURCE_VIEW_CHANGED');
  report.cases.push('lost response recovery with an advanced same-owner source View reads the original exact carrier; missing/foreign-scope/another-Artifact sources still reject');
  const routeInput={...input,revisionId:nextRevision,fileRecordId:String(repository.getArtifactRevision(nextRevision).fileRecordId),
    artifactViewId:String(sourceView.id),position:{x:-892,y:420.25}};
  await writer.putArtifactView(projectId,{...sourceView,revisionId:nextRevision});
  const endpoint='/api/lcos/canvases/'+destination.id+'/materials:place';
  const lost200=await call('POST',endpoint,routeInput);assert.equal(lost200.status,200,JSON.stringify(lost200.body));
  const nodeCountAfterCommit=(await canvas(destination.id)).nodes.length;
  // The real producer has committed; the caller loses this one HTTP200 body.
  // Advance only its source View, then recover with an actual facade GET.
  await writer.putArtifactView(projectId,sourceView);
  const {position:_point,...queryInput}=routeInput;
  const recovered200=await call('GET',endpoint+'?'+new URLSearchParams(queryInput));
  assert.equal(recovered200.status,200,JSON.stringify(recovered200.body));
  assert.equal(recovered200.body.data.node.id,lost200.body.data.node.id);
  assert.equal(recovered200.body.data.node.data.lcos_ref.revisionId,nextRevision);
  assert.deepEqual(recovered200.body.data.node.position,routeInput.position);
  assert.equal((await canvas(destination.id)).nodes.length,nodeCountAfterCommit);
  report.cases.push('real facade POST commits HTTP200; discarded caller response plus origin View advance recovers the same exact node/position with one GET and no placement replay');
  const lateOwner=module.createNativeMaterialPlacement({repository,projectId,projectionHost:hostFor,spatial:facade.spatial,
    projectNativeNodes:async id=>{const nodes=(await canvas(id)).nodes;await writer.putArtifactView(projectId,{...sourceView,scopeId:'scope-now-foreign'});return nodes},fail});
  await assert.rejects(lateOwner.inspect('surface-core-workflow',captured),error=>error.code==='MATERIAL_SOURCE_VIEW_CHANGED');
  await writer.putArtifactView(projectId,sourceView);
  report.cases.push('source View rebound to a foreign Scope during asynchronous projected readback is rejected by the final identity check, never confirmed from an old snapshot');
  report.probe={selectedRevisionId:captured.revisionId,laterSourceRevisionId:nextRevision,
    sourceViewId:String(sourceView.id),targetViewId:placed.artifact_view_id,nodeId:actual.node.id,
    samePinnedCarrierReadbackWithoutMutableOrigin:true,sourceViewRecoveryFixed:true,foreignSourceStillRejected:true};
  report.writes=['isolated synthetic source View via real Core putArtifactView','exact historical placement through real existing producer','source View revision changes via same existing owner'];
  report.passed=true;
} finally {
  await facade?.close();globalThis.fetch=originalFetch;
  await fs.writeFile(${JSON.stringify(path.join(output, 'report.json'))},JSON.stringify(report,null,2));
  if(!temp.startsWith(path.resolve(runtimeBase)+path.sep))throw new Error('Unexpected disposable probe directory');
  await fs.rm(temp,{recursive:true,force:true});
  console.log(JSON.stringify({passed:report.passed,cases:report.cases,probe:report.probe,report:${JSON.stringify(path.join(output, 'report.json'))}}));
}
`;
const generated = path.join(root, '.runtime/native-drop-owner-probe-' + Date.now() + '.mjs');
await fs.mkdir(path.dirname(generated), { recursive: true });
await fs.writeFile(generated, source.slice(0, source.indexOf(seam)) + driver);
try { await import(pathToFileURL(generated).href); }
finally { await fs.unlink(generated); }
