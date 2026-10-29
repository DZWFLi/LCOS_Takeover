import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
const root=path.resolve(import.meta.dirname,'..'),temp=path.join(root,'.runtime','material-geometry-read-review-'+Date.now());
await fs.mkdir(temp,{recursive:true});
const entry=path.join(temp,'entry.ts'),bundle=path.join(temp,'entry.mjs');
await fs.writeFile(entry,'export {createNativeMaterialGeometry} from '+JSON.stringify(path.join(root,'lab/pilot/native-material-geometry.ts'))+';\n'
  +'export {nativeCollectionSavedPlacementMatches} from '+JSON.stringify(path.join(root,'lab/pilot/native-collection-save-precision.mjs'))+';');
await buildPilotEntry(path.relative(root,entry),bundle);
const {createNativeMaterialGeometry,nativeCollectionSavedPlacementMatches}=await import(pathToFileURL(bundle));
function fixture(options={}){
  const f={reads:0,writes:0,binding:'view-a',revision:'rev-a',presentation:{id:'presentation:context:scope',projectId:'project',scopeId:'scope',
    capability:'context',version:1,state:{memberViewIds:['view-a','view-b'],positions:{'view-a':{x:100,y:200},'view-b':{x:10,y:10}}}},
    ...options};
  const workspace={id:'workspace',canvasId:'canvas',scopeId:'scope',preferredSurface:'main'};
  const repository={getWorkspaces:()=>[workspace,{id:'child',canvasId:'child-canvas',scopeId:'scope',preferredSurface:'main'}],
    getPresentationView:()=>f.presentation,
    getProjectionBindings:()=>[{canvasId:'canvas',spatialKind:'node',spatialId:'node',entityType:'view',entityId:f.binding}],
    getArtifactView:id=>({id,artifactId:id==='view-a'?'artifact-a':'artifact-b',revisionId:id==='view-a'?f.revision:'rev-b',scopeId:'scope'}),
    getArtifact:id=>({id,projectId:'project'}),getArtifactRevision:id=>({id,artifactId:id==='rev-b'?'artifact-b':'artifact-a'})};
  f.helper=createNativeMaterialGeometry({repository,projectId:'project',roots:[{canvasId:'canvas',workspaceId:'workspace',scopeId:'scope',surface:'main'}],
    readReference:async()=>{f.reads++;const reference={version:1,entityType:'view',entityId:f.binding,artifactId:f.binding==='view-a'?'artifact-a':'artifact-b',
      artifactViewId:f.binding,revisionId:f.binding==='view-a'?f.revision:'rev-b'};f.onRead?.(f);return reference;},
    savePresentation:async(previous,positions)=>{f.writes++;assert.equal(previous.version,f.presentation.version);
      f.presentation={...f.presentation,version:f.presentation.version+1,state:{...f.presentation.state,positions:{...f.presentation.state.positions,...positions}}};return f.presentation;}});
  return f;
}
const report={scope:'actual source helper, controlled repository/ref-read/CAS leaves only; no facade/Core/candidate/O8',candidateWrites:0,coreWrites:0,models:0,cases:[]};
for(const mutation of ['binding','revision']){
  const f=fixture({onRead:f=>{if(f.reads===2){if(mutation==='binding')f.binding='view-b';else f.revision='rev-a-later';}}});
  const plan=await f.helper.prepare('canvas',[{nodeId:'node',position:{x:910.25,y:280.5}}]);const receipt=await f.helper.commit(plan);
  assert.equal(receipt.ok,false);assert.equal(f.writes,0);
  report.cases.push({name:'commit readReference await '+mutation+' race blocked',passed:true,receipt,controlledSaves:f.writes});
}
{
  const f=fixture(),plan=await f.helper.prepare('child-canvas',[{nodeId:'node',position:{x:910.25,y:280.5}}]);
  assert.deepEqual(plan,[]);assert.equal(f.reads,0);assert.equal(f.writes,0);
  report.cases.push({name:'same-Scope child Canvas is not a root geometry owner',passed:true});
}
{
  const f=fixture();f.presentation.state.positions['view-a']={x:100.004,y:200.006};
  const plan=await f.helper.prepare('canvas',[{nodeId:'node',position:{x:100,y:200.01}}]);assert.deepEqual(plan,[]);assert.equal(f.writes,0);
  report.cases.push({name:'exact native two-decimal measurement echo creates no Core layout plan',passed:true});
}
{
  const f=fixture(),requested={x:100.004,y:200};
  const plan=await f.helper.prepare('canvas',[{nodeId:'node',position:requested}]);assert.equal(plan.length,1);
  const receipt=await f.helper.commit(plan),canonical=f.presentation.state.positions['view-a'];
  assert.equal(f.writes,1,'a changed finite point is not a measurement echo merely because its rounding equals the old Core point');
  assert.deepEqual(canonical,requested);assert.equal(receipt.ok,true);assert.equal(nativeCollectionSavedPlacementMatches(requested,canonical),true);
  report.cases.push({name:'finite high-precision geometry update whose rounding equals old Core point',passed:true,receipt,requested,canonical,
    controlledSaves:f.writes,savedSpatialWouldMatchCanonical:nativeCollectionSavedPlacementMatches(requested,canonical),
    precisionDirectionDefectReproduced:f.writes===0&&!nativeCollectionSavedPlacementMatches(requested,canonical)});
}
{
  const f=fixture(),versions=[];
  for(const position of [{x:910.25,y:280.5},{x:100,y:200},{x:910.25,y:280.5}]){
    const receipt=await f.helper.commit(await f.helper.prepare('canvas',[{nodeId:'node',position}]));assert.equal(receipt.ok,true);
    assert.deepEqual(f.presentation.state.positions['view-a'],position);versions.push(f.presentation.version);
  }
  assert.deepEqual(versions,[2,3,4]);report.cases.push({name:'normal move/back/redo positions flow through same original CAS helper',passed:true,versions,
    boundary:'position sequence only; not original browser history or real Core'});
}
report.passed=report.cases.every(item=>item.passed===true);
const output=path.join(root,'output/原生Drop整合_20261017f/材料位置helper只读复核_修后.json');await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
