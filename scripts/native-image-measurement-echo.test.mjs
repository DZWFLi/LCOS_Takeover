import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
const root=path.resolve(import.meta.dirname,'..'), stamp=new Date().toISOString().replace(/[:.]/g,'-');
const runtimeRoot=await fs.mkdtemp(path.join(root,'.runtime','image-measurement-echo-'));
const out=path.join(root,'output','图片测量保存修复_20261020');await fs.mkdir(out,{recursive:true});
process.env.LCOS_CAPTURE_STAGING_ROOT=path.join(runtimeRoot,'capture');process.env.LCOS_OCR_RUNTIME_DIR=path.join(runtimeRoot,'ocr');process.env.LCOS_RECOVERY_TRANSPORT='none';process.env.LCOS_OLLAMA_URL='http://127.0.0.1:1';
const entry=await buildPilotEntry('lab/pilot/surface-core-facade.ts',path.join(runtimeRoot,'facade.mjs'),'node',{coreWorkspaceMembership:true});
const {startSurfaceCoreFacade}=await import(pathToFileURL(entry));
const origin='http://127.0.0.1:19763',canvasId='surface-core-main',canvasPath='/api/canvas/v1/canvases/'+canvasId;
const report={passed:false,runtimeRoot,originalUserDatabaseOpened:false,browserClaimed:false,cases:[],responses:[]};let facade;
try{
 facade=await startSurfaceCoreFacade({runtimeRoot,publicOrigin:origin,fullIntegration:true,nativeCollectionPilot:true,nativeTextPilot:true,nativeAssemblyPilot:true,nativeRailPilot:true});
 const call=(method,pathname,body)=>facade.handle({method,pathname,url:origin+pathname,body});
 const repository=facade.core.repository, projectId=facade.core.projectId;
 const graph=async()=>{const r=await call('GET','/api/lcos/core/projects/'+projectId+'/graph');assert.equal(r.status,200);return r.body.value;};
 const read=async()=>{const r=await call('GET',canvasPath);assert.equal(r.status,200);return r.body.data;};
 const initial=await read(),image=initial.nodes.find(n=>n.type==='image');assert.ok(image?.data.lcos_workspace_membership,'GET must reproduce the actual membership field seen by original metadata callback');
 const initialGraph=await graph(),initialFile=await call('GET',new URL(image.data.src).pathname);
 const update=data=>({canvas_id:canvasId,created_by_role:'user',actions:[{action:'update',updates:[{id:image.id,type:'image',data,position:{...image.position},measured:{width:375,height:250}}]}]});
 const send=async(name,body,status,code)=>{const r=await call('POST',canvasPath+'/nodes:batchActions',body);report.responses.push({name,status:r.status,code:r.body.error?.code});assert.equal(r.status,status,JSON.stringify(r.body));if(code)assert.equal(r.body.error.code,code);return r;};
 await send('original full-image measurement DTO',update(structuredClone(image.data)),200);
 const after=await read();assert.deepEqual(after.nodes.find(n=>n.id===image.id).measured,{width:375,height:250});
 assert.deepEqual(await graph(),initialGraph,'measurement echo cannot change artifacts, revisions, membership or project truth');
 assert.deepEqual((await call('GET',new URL(image.data.src).pathname)).body,initialFile.body,'original file bytes remain exact');
 const persisted=await facade.spatial.read(canvasId);assert.equal(persisted.state.nodes.find(n=>n.id===image.id).data.lcos_workspace_membership,undefined,'derived membership is never copied into spatial data');
 report.cases.push('real GET DTO → original measurement batch saves geometry; Core graph/file bytes unchanged; derived membership not persisted');
 const stableState=()=>facade.spatial.read(canvasId);
 for(const [name,change]of [['workspace',v=>v.workspaceId='foreign'],['view',v=>v.viewId='foreign'],['addedAt',v=>v.addedAt='stale'],['addedBy',v=>v.addedBy='agent'],['extra',v=>v.extra=true]]){
  const data=structuredClone(image.data);change(data.lcos_workspace_membership);const before=await stableState();
  await send('forged membership '+name,update(data),409,'WORKSPACE_MEMBERSHIP_ECHO_MISMATCH');assert.deepEqual(await stableState(),before);assert.deepEqual(await graph(),initialGraph);
 }
 report.cases.push('forged/stale Workspace, View, actor, timestamp and added fields reject before geometry writes');
 for(const [name,patch,status,code]of [
  ['source',{src:origin+'/not-source'},409,'CORE_SOURCE_MISMATCH'],
  ['title',{title:'unauthorized'},501,'IMAGE_TITLE_UPDATE_NOT_IMPLEMENTED'],
  ['extra',{unsupported:true},501,'IMAGE_NODE_DATA_NOT_IMPLEMENTED'],
  ['metadata',{__metadata:{...image.data.__metadata,width:999}},409,'IMAGE_RENDER_METADATA_MISMATCH'],
  ['revision',{lcos_ref:{...image.data.lcos_ref,revisionId:'wrong'}},409,'CORE_REFERENCE_MISMATCH'],
 ]){const before=await stableState();await send('preserved '+name+' protection',update({...image.data,...patch}),status,code);assert.deepEqual(await stableState(),before);assert.deepEqual(await graph(),initialGraph);}
 report.cases.push('image source/title/unknown data/pixel dimensions/revision protections remain active');
 const membership=image.data.lcos_workspace_membership;
 repository.removeWorkspaceMembers(membership.workspaceId,[membership.viewId]);
 const withoutMember=await graph(),beforeRemoved=await stableState();
 await send('membership removed after projection',update(image.data),409,'WORKSPACE_MEMBERSHIP_ECHO_MISMATCH');assert.deepEqual(await graph(),withoutMember);assert.deepEqual(await stableState(),beforeRemoved);
 const noEcho={...image.data};delete noEcho.lcos_workspace_membership;await send('geometry without stale membership field',update(noEcho),200);
 assert.deepEqual(await graph(),withoutMember,'ordinary geometry does not restore a removed member');
 report.cases.push('removed member is not silently restored; geometry-only request remains compatible');
 report.passed=true;
}catch(error){report.error=error.stack;throw error;}
finally{
 await facade?.close();
 const relative=path.relative(path.join(root,'.runtime'),path.resolve(runtimeRoot));
 assert.ok(relative.startsWith('image-measurement-echo-')&&!relative.includes(path.sep)&&!path.isAbsolute(relative),'only this mkdtemp runtime may be removed');
 await fs.rm(runtimeRoot,{recursive:true,force:true});report.runtimeRemoved=true;
 await fs.writeFile(path.join(out,'core-'+stamp+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
