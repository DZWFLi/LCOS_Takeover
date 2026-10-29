import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
let source = await fs.readFile(path.join(root, 'scripts/native-material-placement.test.mjs'), 'utf8');
const seam = "  const main = await canvas('surface-core-main'), destination = await canvas('surface-core-context');";
if (source.split(seam).length !== 2) throw new Error('Owned disposable Core fixture changed');
source = source.slice(0, source.indexOf(seam)).replace('{ coreCollectionTitle: true }', '{ coreCollectionTitle: true, coreColorPin: true }')
  .replace('    `export {createNativeMaterialPlacement}', `    \`export {CoreColorPinClient} from \${JSON.stringify(relative('lcos/apps/web-gen2/src/backend/colorPins.ts'))};\`,
    \`export {createNativeColorPinController} from \${JSON.stringify(relative('lab/pilot/native-colorpin-controller.ts'))};\`,
    \`export {createNativeMaterialPlacement}`);
const output = path.join(root, 'output/原生ColorPin整合_20261017h/节点真实Core对接', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const driver = `
  report.mode='production native Pin controller/model + original typed ColorPin client + real isolated Core/facade/MutationSafety';
  report.writes=['synthetic exact-view and shared entity Pin definitions/memberships/label/ChangeSets only'];
  const beforeGraph=(await call('GET','/api/lcos/core/projects/'+projectId+'/graph')).body.value;
  const beforeCanvases=await Promise.all(['main','context','workflow'].map(surface=>facade.spatial.read('surface-core-'+surface)));
  const main=await canvas('surface-core-main'),other=await canvas('surface-core-context'),node=main.nodes.find(n=>n.type==='text'&&n.data?.lcos_ref?.artifactViewId);
  const otherNode=other.nodes.find(n=>n.type==='text'&&n.data?.lcos_ref?.artifactViewId);
  const workspace=repository.getWorkspaces(projectId).find(w=>w.canvasId===main.id);
  let current={projectId,canvasId:main.id,workspaceId:String(workspace.id),api:{},nodes:main.nodes,surfaceRef:'main'},loseNext=false,raceRename=false,unavailableNext=false;
  const requests=[],http=new module.HttpClient({baseUrl:'http://127.0.0.1/api/lcos/core',fetch:async(address,options)=>{
    const url=new URL(address),record={method:options.method,path:url.pathname,body:options.body?JSON.parse(options.body):null};requests.push(record);
    if(raceRename&&options.method==='PATCH'){
      raceRename=false;const raced=await call('PATCH',url.pathname,{...record.body,label:'Concurrent exact definition winner'});assert.equal(raced.status,200);
    }
    const response=await call(options.method,url.pathname,options.body?record.body:undefined);record.status=response.status;
    if(loseNext&&options.method==='POST'&&url.pathname.endsWith('/memberships')&&response.status<300){loseNext=false;throw new Error('Synthetic committed assign reply withheld')}
    if(unavailableNext&&options.method==='POST'&&url.pathname.endsWith('/memberships')&&response.status<300){unavailableNext=false;return Response.json({ok:false,error:{code:'UNAVAILABLE',message:'Synthetic 503 after committed write'}},{status:503});}
    return Response.json(response.body,{status:response.status});
  }}),typed=new module.CoreColorPinClient(http);
  const facts=async()=>{
    const [snapshot,g,b]=await Promise.all([typed.snapshot(projectId),call('GET','/api/lcos/core/projects/'+projectId+'/graph'),call('GET','/api/lcos/core/projects/'+projectId+'/spatial/bindings')]);
    assert.equal(g.status,200);assert.equal(b.status,200);return{snapshot,graph:g.body.value,bindings:b.body.value};
  };
  const debugErrors=[];
  const owner=module.createNativeColorPinController({scene:()=>current,facts,client:typed,log:error=>debugErrors.push(String(error.stack??error))});await owner.refresh();
  report.errors=debugErrors;
  assert.ok(owner.read().projection,JSON.stringify(debugErrors));
  report.identity={node,bindings:owner.read().facts.bindings.filter(b=>b.spatialId===node.id),view:owner.read().facts.graph.artifactViews.find(v=>v.id===node.data.lcos_ref.artifactViewId),
    artifact:owner.read().facts.graph.artifacts.find(v=>v.id===node.data.lcos_ref.artifactId),revisions:owner.read().facts.graph.artifactRevisions.filter(v=>v.artifactId===node.data.lcos_ref.artifactId)};
  assert.ok(owner.read().projection.byNode.get(node.id).target,JSON.stringify(report.identity));
  assert.equal((await owner.toggleNode(node.id,'123ABC')).status,'confirmed');
  let snapshot=await typed.snapshot(projectId),definition=snapshot.definitions.find(d=>d.color==='#123ABC');assert.ok(definition);
  const membership=snapshot.memberships.find(m=>m.colorPinId===definition.id);assert.equal(membership.targetRef.kind,'view');assert.equal(membership.targetRef.id,node.data.lcos_ref.artifactViewId);
  assert.equal(owner.read().projection.groups[0].group.hex,'#123ABC');assert.equal(owner.read().projection.groups[0].count,1);
  assert.ok(owner.read().projection.choices.some(choice=>choice.id==='123ABC'));
  assert.equal((await owner.toggleNode(node.id,'4EA8FF')).status,'confirmed');assert.equal(owner.read().projection.byNode.get(node.id).pins.length,2);
  assert.equal((await owner.toggleNode(node.id,'123ABC')).status,'confirmed');assert.equal((await typed.snapshot(projectId)).memberships.some(m=>m.id===membership.id),false);
  report.cases.push('real exact View assignment/removal through original typed client: multi-color + non-six-color choices/groups, no Canvas fields or revision writes');
  const otherAssigned=await typed.assign(projectId,{targetRef:{projectId,kind:'view',id:otherNode.data.lcos_ref.artifactViewId},color:'#4EA8FF'});
  const shared=await typed.assign(projectId,{targetRef:{projectId,kind:'entity',id:node.data.lcos_ref.artifactId},color:'#4EA8FF'});
  await owner.refresh();let group=owner.read().projection.groups.find(group=>group.color==='#4EA8FF');
  assert.equal(group.sharedMembershipCount,1);assert.ok(!group.membershipIds.includes(otherAssigned.membership.id));
  const cleared=await owner.clearCurrentGroup(group.definitionId,{expectedMembershipIds:group.membershipIds,expectedCanvasId:main.id,expectedApi:current.api});
  assert.equal(cleared.status,'confirmed');snapshot=await typed.snapshot(projectId);
  assert.ok(snapshot.memberships.some(m=>m.id===otherAssigned.membership.id));assert.ok(!snapshot.memberships.some(m=>m.id===shared.membership.id));
  report.cases.push('actual current-Canvas clear enumerates exact View/entity memberships and preserves same-color other-Canvas membership/definition');
  const writesBefore=requests.filter(r=>r.method==='POST').length;loseNext=true;
  assert.equal((await owner.toggleNode(node.id,'123ABC')).status,'unknown');assert.equal(owner.read().needsCheck,true);
  assert.equal((await owner.toggleNode(node.id,'123ABC')).status,'rejected');
  const beforeCheck=requests.length;assert.equal((await owner.verifyPending()).status,'confirmed');
  assert.ok(requests.slice(beforeCheck).every(r=>r.method==='GET'));assert.equal(requests.filter(r=>r.method==='POST').length,writesBefore+1);
  snapshot=await typed.snapshot(projectId);definition=snapshot.definitions.find(d=>d.color==='#123ABC');
  assert.equal((await owner.renameDefinition({definitionId:definition.id,label:'Project native Pin',expectedUpdatedAt:definition.updatedAt,expectedLabel:definition.label??null})).status,'confirmed');
  const renamed=(await typed.snapshot(projectId)).definitions.find(d=>d.id===definition.id);assert.equal(renamed.label,'Project native Pin');assert.equal(renamed.color,definition.color);
  report.cases.push('real committed assign response discarded: same native owner holds unknown, explicit check is GET-only; original typed rename CAS keeps definition ID/color');
  raceRename=true;
  assert.equal((await owner.renameDefinition({definitionId:renamed.id,label:'Must lose this CAS',expectedUpdatedAt:renamed.updatedAt,expectedLabel:renamed.label})).status,'rejected');
  assert.equal(owner.read().needsCheck,false,'Actual original typed CoreApiError.status409 is definitive rejection, never a permanent unknown hold');
  assert.ok(owner.read().message.includes('刚有变化'));assert.equal((await typed.snapshot(projectId)).definitions.find(d=>d.id===renamed.id).label,'Concurrent exact definition winner');
  assert.equal((await owner.toggleNode(node.id,'4EA8FF')).status,'confirmed','After actual Core CAS409 a new explicit valid action remains possible');
  unavailableNext=true;
  assert.equal((await owner.toggleNode(node.id,'A55CF0')).status,'unknown');assert.equal(owner.read().needsCheck,true);
  const before503Check=requests.length;assert.equal((await owner.verifyPending()).status,'confirmed');assert.ok(requests.slice(before503Check).every(r=>r.method==='GET'));
  report.cases.push('real original typed CAS409 maps to visible rejected notice and next explicit mutation remains usable; synthetic 503 after real commit still holds unknown and only GET recovers');
  assert.deepEqual(await Promise.all(['main','context','workflow'].map(surface=>facade.spatial.read('surface-core-'+surface))),beforeCanvases);
  const afterGraph=(await call('GET','/api/lcos/core/projects/'+projectId+'/graph')).body.value;
  for(const key of ['artifacts','artifactRevisions','artifactViews','notes','scopes','workspaces','collections'])assert.deepEqual(afterGraph[key],beforeGraph[key],key+' remains unchanged');
  assert.equal(repository.getProjectExecutionProjection(projectId).runs.length,0);report.requests=requests;report.passed=true;
}finally{
  await facade?.close();globalThis.fetch=originalFetch;await fs.writeFile(${JSON.stringify(path.join(output, 'report.json'))},JSON.stringify(report,null,2));
  if(path.dirname(temp)!==path.resolve(runtimeBase)||!path.basename(temp).startsWith('native-material-placement-test-'))throw new Error('Unexpected owned ColorPin fixture');
  await fs.rm(temp,{recursive:true,force:true});console.log(JSON.stringify({passed:report.passed,cases:report.cases,report:${JSON.stringify(path.join(output, 'report.json'))}}));
}
`;
const generated = path.join(root, '.runtime/native-colorpin-node-core-' + Date.now() + '.mjs');
await fs.writeFile(generated, source + driver);
try { await import(pathToFileURL(generated)); } finally { await fs.unlink(generated); }
