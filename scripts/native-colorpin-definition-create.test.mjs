import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Server} from 'node:net';
import {pathToFileURL} from 'node:url';
import {buildPilotEntry} from '../lab/pilot/build-pilot.mjs';
import {createNativeCoreColorPinTransforms} from '../lab/native-core-color-pin-transform.mjs';
import {readCurrentGen2Resource} from '../lab/current-gen2-resources.mjs';

const root=process.cwd(),runtime=await fs.mkdtemp(path.join(root,'.runtime/native-colorpin-definition-'));
const output=path.join(root,'output/普通颜色组独立定义_20261028',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const report={passed:false,scope:'Actual selected-source Core HTTP routes, original MutationSafety/SQLite transactions, typed client and ChangeSets. Only own repository transaction timing is controlled for race cases; no mirrored mutation implementation.',cases:[],requests:[],modelCalls:0,activeRuntimeTouched:false};
const saved=new Map(Object.entries(process.env).filter(([key])=>/^(LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|DEEPSEEK_)/.test(key)));
for(const key of saved.keys())delete process.env[key];process.env.LCOS_RECOVERY_TRANSPORT='none';process.env.LCOS_OLLAMA_URL='http://127.0.0.1:1';process.env.LCOS_CAPTURE_STAGING_ROOT=path.join(runtime,'capture');process.env.LCOS_OCR_RUNTIME_DIR=path.join(runtime,'ocr');
const originalFetch=globalThis.fetch;let facade,restoreTransaction;
globalThis.fetch=(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));const owned=process._getActiveHandles().some(handle=>{if(!(handle instanceof Server)||!handle.listening)return false;const address=handle.address();return address&&typeof address!=='string'&&['127.0.0.1','::1'].includes(address.address)&&String(address.port)===url.port;});assert.ok(owned&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Only this disposable Core owned ports');return originalFetch(input,init);};
const pass=(name,evidence={})=>report.cases.push({name,passed:true,...evidence});
try{
 for(const[relative,transform]of Object.entries(createNativeCoreColorPinTransforms())){
  const sourcePath=path.join(root,relative),original=readCurrentGen2Resource(sourcePath)?.contents??await fs.readFile(sourcePath,'utf8');
  const changed=transform(original,{sourcePath});assert.equal(transform(changed,{sourcePath}),changed);assert.throws(()=>transform(original,{sourcePath:path.join(root,'not-this-owner.ts')}));
  assert.equal(readCurrentGen2Resource(sourcePath)?.contents??await fs.readFile(sourcePath,'utf8'),original);
 }
 const entry=path.join(runtime,'fixture.ts'),rel=file=>path.relative(runtime,path.join(root,file)).replaceAll('\\','/');
 await fs.writeFile(entry,[
  'export {startSurfaceCoreFacade} from '+JSON.stringify(rel('lab/pilot/surface-core-facade.ts'))+';',
  'export {CoreColorPinClient} from '+JSON.stringify(rel('lcos/apps/web-gen2/src/backend/colorPins.ts'))+';',
  'export {HttpClient} from '+JSON.stringify(rel('lcos/apps/web-gen2/src/backend/client.ts'))+';',
  'export {MutationSafetyService} from '+JSON.stringify(rel('lcos/apps/local-core/src/mutation-safety-service.ts'))+';',
  'export {ProjectEventHub} from '+JSON.stringify(rel('lcos/apps/local-core/src/project-events/project-event-hub.ts'))+';',
 ].join('\n'));
 const bundle=await buildPilotEntry(path.relative(root,entry),path.join(runtime,'fixture.mjs'),'node',{coreColorPin:true,coreCollectionTitle:true,coreWorkspaceMembership:true,coreWorkflowCollectionMembers:true,coreMixedScopeContext:true});
 const module=await import(pathToFileURL(bundle));
 facade=await module.startSurfaceCoreFacade({runtimeRoot:path.join(runtime,'owned'),publicOrigin:'http://127.0.0.1:19993',fullIntegration:true});
 const repo=facade.core.repository,pid=facade.core.projectId,base='/projects/'+encodeURIComponent(pid)+'/color-pins',events=[],hub=new module.ProjectEventHub();
 const unwatch=hub.subscribe(pid,event=>events.push(event)),safety=new module.MutationSafetyService(repo,{},hub);
 const call=async(method,url,body)=>{report.requests.push({method,url});const response=await fetch(facade.core.origin+url,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return{status:response.status,body:await response.json()};};
 const create=async(color,label='独立颜色组')=>{const response=await call('POST',base+'/definitions',{color,label,expectedDefinitionId:null});assert.equal(response.status,201,JSON.stringify(response));assert.ok(response.body.meta.changeSetId);return{definition:response.body.value.definition,changeSetId:response.body.meta.changeSetId};};
 const action=(id,name)=>call('POST','/projects/'+pid+'/change-sets/'+encodeURIComponent(id)+'/'+name,{});
 const stable={graph:structuredClone(repo.get(pid)),execution:structuredClone(repo.getProjectExecutionProjection(pid)),bindings:structuredClone(repo.getProjectionBindings(pid)),markers:structuredClone(repo.listSpatialMarkerIntents(pid)),canvases:await Promise.all(['surface-core-main','surface-core-context','surface-core-workflow'].map(id=>facade.spatial.read(id)))};
 const bytes=await Promise.all(stable.graph.fileRecords.map(async file=>[file.id,Buffer.from(await fs.readFile(file.observedPath))]));
 const membersBefore=structuredClone(repo.listColorPinMemberships(pid));
 const first=await create('#12ab34','  普通独立组  ');assert.equal(first.definition.label,'普通独立组');assert.equal(first.definition.color,'#12AB34');
 assert.deepEqual(repo.listColorPinMemberships(pid),membersBefore);
 const cs=repo.getMutationChangeSet(first.changeSetId);assert.equal(cs.changes.length,1);assert.equal(cs.changes[0].type,'color_pin_definition_add');assert.deepEqual(cs.changes[0].definition,first.definition);
 const replay=await call('POST',base+'/definitions',{color:'#12AB34',label:'不得覆盖',expectedDefinitionId:null});assert.equal(replay.status,409);assert.equal(replay.body.error.code,'CONFLICT');assert.equal(replay.body.error.message,'STALE_COLOR_PIN_DEFINITION_ABSENCE');assert.deepEqual(repo.getColorPinDefinition(first.definition.id),first.definition);
 pass('Actual strict create adds exactly one definition/ChangeSet and no membership; color canonicalized, label trimmed; stale absence is 409 without overwrite');
 const countBefore=repo.listColorPinDefinitions(pid).length;
 for(const bad of[
  {color:'#123456',label:'x'}, {color:'#123456',label:'x',expectedDefinitionId:'old'},
  {color:'123456',label:'x',expectedDefinitionId:null},{color:'#123456',label:'   ',expectedDefinitionId:null},
  {color:'#123456',label:'x'.repeat(501),expectedDefinitionId:null},{color:'#123456',label:1,expectedDefinitionId:null},
  {color:'#123456',label:'x',expectedDefinitionId:null,targetRef:{projectId:pid,kind:'surface',id:'main'}},
 ])assert.equal((await call('POST',base+'/definitions',bad)).status,400);
 assert.equal((await call('POST','/projects/missing-project/color-pins/definitions',{color:'#123456',label:'x',expectedDefinitionId:null})).status,404);
 assert.equal(repo.listColorPinDefinitions(pid).length,countBefore);assert.deepEqual(repo.listColorPinMemberships(pid),membersBefore);
 pass('Missing/extra fields, non-null expected identity, bad color, blank/overlong/non-string label and nonexistent project reject without definitions or memberships');
 const competitors=await Promise.all(['一号','二号'].map(label=>call('POST',base+'/definitions',{color:'#223344',label,expectedDefinitionId:null})));
 assert.deepEqual(competitors.map(row=>row.status).sort(),[201,409]);assert.equal(repo.listColorPinDefinitions(pid).filter(row=>row.color==='#223344').length,1);
 pass('Two actual concurrent HTTP observed-absence creates have exactly one winner in original UNIQUE(project,color) namespace');

 assert.equal((await action(first.changeSetId,'revert')).status,200);assert.equal(repo.getColorPinDefinition(first.definition.id),undefined);
 assert.equal((await action(first.changeSetId,'reapply')).status,200);assert.deepEqual(repo.getColorPinDefinition(first.definition.id),first.definition);
 assert.equal((await action(first.changeSetId,'revert')).status,200);
 const replacement=await create('#12AB34','后来的同色组');assert.notEqual(replacement.definition.id,first.definition.id);
 assert.equal((await action(first.changeSetId,'reapply')).status,409);assert.deepEqual(repo.getColorPinDefinition(replacement.definition.id),replacement.definition);
 pass('Standalone definition original Undo/Redo keeps exact same identity; later same-color definition prevents old Redo instead of overwriting or partial writes');

 const used=await create('#334455','后来会被使用');
 const assigned=await call('POST',base+'/memberships',{targetRef:{projectId:pid,kind:'surface',id:'main'},colorPinId:used.definition.id});assert.equal(assigned.status,201);
 const usedMembers=structuredClone(repo.listColorPinMemberships(pid));
 assert.equal((await action(used.changeSetId,'revert')).status,409);assert.deepEqual(repo.getColorPinDefinition(used.definition.id),used.definition);assert.deepEqual(repo.listColorPinMemberships(pid),usedMembers);
 pass('Later actual canonical membership blocks old standalone create Undo; no CASCADE deletes the later member');

 const renamed=await create('#445566','改名前');
 const rename=await call('PATCH',base+'/definitions/'+renamed.definition.id,{label:'后来改名',expectedLabel:renamed.definition.label,expectedUpdatedAt:renamed.definition.updatedAt});assert.equal(rename.status,200);
 assert.equal((await action(renamed.changeSetId,'revert')).status,409);assert.deepEqual(repo.getColorPinDefinition(renamed.definition.id),rename.body.value.definition);
 assert.equal((await action(rename.body.meta.changeSetId,'revert')).status,200);assert.deepEqual(repo.getColorPinDefinition(renamed.definition.id),renamed.definition);
 assert.equal((await action(renamed.changeSetId,'revert')).status,200);
 pass('Later exact label/updatedAt change blocks old create Undo; undoing that rename restores the original snapshot and permits its legitimate create Undo');

 const legacy=await call('POST',base+'/memberships',{targetRef:{projectId:pid,kind:'surface',id:'main'},color:'#556677',label:'原assign'});
 assert.equal(legacy.status,201);const legacyId=legacy.body.meta.changeSetId,legacyDef=legacy.body.value.definition,legacyMember=legacy.body.value.membership;
 assert.deepEqual(repo.getMutationChangeSet(legacyId).changes.map(row=>row.type),['color_pin_definition_add','color_pin_membership_add']);
 assert.equal((await action(legacyId,'revert')).status,200);assert.equal(repo.getColorPinDefinition(legacyDef.id),undefined);assert.equal(repo.getColorPinMembership(legacyMember.id),undefined);
 assert.equal((await action(legacyId,'reapply')).status,200);assert.deepEqual(repo.getColorPinDefinition(legacyDef.id),legacyDef);assert.deepEqual(repo.getColorPinMembership(legacyMember.id),legacyMember);
 const legacyLater=await call('POST',base+'/memberships',{targetRef:{projectId:pid,kind:'view',id:stable.graph.artifactViews[0].id},colorPinId:legacyDef.id});assert.equal(legacyLater.status,201,JSON.stringify(legacyLater));
 assert.equal((await action(legacyId,'revert')).status,409);assert.deepEqual(repo.getColorPinDefinition(legacyDef.id),legacyDef);assert.deepEqual(repo.getColorPinMembership(legacyLater.body.value.membership.id),legacyLater.body.value.membership);
 pass('Original assign combined definition/member Undo still works despite original definition-first loop; Redo exact snapshots survives; later second member blocks old assign Undo');

 let injection;const originalTransaction=repo.runCurationMutation.bind(repo);
 repo.runCurationMutation=plan=>{if(injection?.when(plan)){const fn=injection.run;injection=undefined;fn();}return originalTransaction(plan);};restoreTransaction=()=>{repo.runCurationMutation=originalTransaction;};
 const raceMember=safety.createColorPinDefinition({projectId:pid,color:'#667788',label:'成员竞态',expectedDefinitionId:null});
 const beforeEvents=events.length;let injectedMember;
 injection={when:plan=>!!plan.colorPinDefinitionDeleteChecks,run:()=>{injectedMember=safety.assignColorPin({projectId:pid,targetRef:{projectId:pid,kind:'surface',id:'main'},colorPinId:raceMember.definition.id});}};
 assert.equal(safety.revert(raceMember.changeSet.id).revertable,false);assert.equal(injection,undefined);
 assert.deepEqual(repo.getColorPinDefinition(raceMember.definition.id),raceMember.definition);assert.deepEqual(repo.getColorPinMembership(injectedMember.membership.id),injectedMember.membership);assert.equal(repo.getMutationChangeSet(raceMember.changeSet.id).status,'applied');
 assert.equal(events.length,beforeEvents+1,'Only the actual later assign published, not a false revert');
 pass('Controlled later-member insertion after actual precheck but before original transaction is caught inside transaction; exact definition/member remain and failed Undo publishes no success');
 const raceRename=safety.createColorPinDefinition({projectId:pid,color:'#778899',label:'名称竞态',expectedDefinitionId:null});let injectedRename;
 injection={when:plan=>!!plan.colorPinDefinitionDeleteChecks,run:()=>{injectedRename=safety.renameColorPinDefinition({projectId:pid,colorPinId:raceRename.definition.id,label:'事务前的后名',expectedLabel:raceRename.definition.label,expectedUpdatedAt:raceRename.definition.updatedAt});}};
 assert.equal(safety.revert(raceRename.changeSet.id).revertable,false);assert.deepEqual(repo.getColorPinDefinition(raceRename.definition.id),injectedRename.definition);assert.equal(injection,undefined);
 pass('Controlled later rename after precheck is rejected by same original transaction expected snapshot, without deleting the newer definition');

 let uniqueWinner;injection={when:plan=>plan.colorPinDefinitionAdds?.some(row=>row.color==='#8899AA'),run:()=>{uniqueWinner=safety.createColorPinDefinition({projectId:pid,color:'#8899AA',label:'真实先提交者',expectedDefinitionId:null});}};
 const uniqueRace=await call('POST',base+'/definitions',{color:'#8899AA',label:'应当输掉',expectedDefinitionId:null});assert.equal(uniqueRace.status,409,JSON.stringify(uniqueRace));
 assert.equal(injection,undefined);assert.deepEqual(repo.getColorPinDefinition(uniqueWinner.definition.id),uniqueWinner.definition);assert.equal(repo.listColorPinDefinitions(pid).filter(row=>row.color==='#8899AA').length,1);
 pass('Actual UNIQUE conflict after stale absence precheck is a 409 and original transaction rolls back losing definition/ChangeSet, keeping the actual winner');
 restoreTransaction();restoreTransaction=undefined;

 const foreign='colorpin-create-other-project',foreignRoot=path.join(runtime,'foreign');await fs.mkdir(foreignRoot,{recursive:true});repo.createProject({id:foreign,name:'隔离其他项目',rootPath:foreignRoot});
 const foreignCreated=await call('POST','/projects/'+foreign+'/color-pins/definitions',{color:'#334455',label:'其他项目同色',expectedDefinitionId:null});assert.equal(foreignCreated.status,201);
 assert.notEqual(foreignCreated.body.value.definition.id,used.definition.id);
 assert.equal((await call('PATCH',base+'/definitions/'+foreignCreated.body.value.definition.id,{label:'不得跨项目',expectedLabel:foreignCreated.body.value.definition.label,expectedUpdatedAt:foreignCreated.body.value.definition.updatedAt})).status,404);
 assert.deepEqual(repo.getColorPinDefinition(used.definition.id),used.definition);
 pass('Identical color in another project owns a separate real definition; exact foreign definition cannot be renamed through current project namespace');

 const signal=new AbortController().signal,methods=[];let discard=false;
 const typed=new module.CoreColorPinClient(new module.HttpClient({baseUrl:facade.core.origin,fetch:async(url,options)=>{methods.push(options.method);assert.equal(options.signal,signal);const response=await fetch(url,options);if(discard&&options.method==='POST'){discard=false;await response.arrayBuffer();throw new TypeError('controlled lost committed create ACK');}return response;}}));
 const typedResult=await typed.createDefinition(pid,{color:'#99AABB',label:'typed入口',expectedDefinitionId:null},signal);assert.ok(typedResult.changeSetId);assert.equal(typedResult.definition.color,'#99AABB');assert.deepEqual(methods,['POST']);
 discard=true;await assert.rejects(typed.createDefinition(pid,{color:'#AABBCC',label:'丢回执保留',expectedDefinitionId:null},signal));
 const readback=await typed.snapshot(pid,signal);assert.equal(readback.definitions.filter(row=>row.color==='#AABBCC').length,1);assert.deepEqual(methods,['POST','POST','GET']);
 pass('Actual typed client createDefinition carries original signal and ChangeSet receipt; discarded committed response is inspected by one original GET, never another POST');

 assert.ok(events.some(event=>event.type==='change_set.changed'&&event.payload?.changeSetId===raceMember.changeSet.id),'Actual new create publishes original project event');
 assert.deepEqual(repo.get(pid),stable.graph);assert.deepEqual(repo.getProjectExecutionProjection(pid),stable.execution);assert.deepEqual(repo.getProjectionBindings(pid),stable.bindings);assert.deepEqual(repo.listSpatialMarkerIntents(pid),stable.markers);
 assert.deepEqual(await Promise.all(['surface-core-main','surface-core-context','surface-core-workflow'].map(id=>facade.spatial.read(id))),stable.canvases);
 for(const[id,data]of bytes){const file=stable.graph.fileRecords.find(file=>file.id===id);assert.ok((await fs.readFile(file.observedPath)).equals(data));}
 unwatch();report.eventTypes=events.map(event=>event.type);report.passed=true;
 pass('Complete graph/execution/bindings/markers, all three Canvas states and original file bytes stay unchanged; only real GUI definition/member ChangeSets in this disposable fixture changed');
}catch(error){report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{restoreTransaction?.();await facade?.close();globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(/^(LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|DEEPSEEK_)/.test(key))delete process.env[key];for(const[key,value]of saved)process.env[key]=value;await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({output,passed:report.passed,cases:report.cases,error:report.error,modelCalls:0,activeRuntimeTouched:false},null,2));
