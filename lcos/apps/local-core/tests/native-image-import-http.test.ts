import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { CoreArtifactClient } from '../../web-gen2/src/backend/artifacts.js';
import { HttpClient } from '../../web-gen2/src/backend/client.js';
import { SqliteMetadataRepository } from '../src/metadata-repository.js';
import { createMvpSampleSnapshot } from '../src/mvp-sample-project.js';
import { createLocalCoreServer, type LocalCoreServer } from '../src/server.js';

const roots:string[]=[],dbs:SqliteMetadataRepository[]=[],servers:LocalCoreServer[]=[];
afterEach(async()=>{
  for(const server of servers.splice(0))await server.close();
  for(const db of dbs.splice(0))db.close();
  for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});
});
async function fixture(){
  const root=mkdtempSync(join(tmpdir(),'lcos-native-image-'));roots.push(root);
  const projectRoot=join(root,'project');mkdirSync(projectRoot);
  const dbPath=join(root,'metadata.sqlite'),db=new SqliteMetadataRepository(dbPath);dbs.push(db);
  const base=createMvpSampleSnapshot(projectRoot,'2026-10-13T00:00:00Z');
  const main={...base.workspaces[0]!,canvasId:'original-main'};
  const contextScope={...base.scopes[0]!,id:'image-context-scope' as typeof main.scopeId,kind:'context' as const,parentScopeId:main.scopeId};
  const context={...main,id:'image-context-site' as typeof main.id,scopeId:contextScope.id,canvasId:'original-context',preferredSurface:'context' as const};
  db.save({...base,scopes:[...base.scopes,contextScope],workspaces:[main,context]});
  const server=createLocalCoreServer({port:0,metadataRepository:db,apiToken:'image-test-token'});servers.push(server);
  const address=await server.start(),client=new CoreArtifactClient(new HttpClient({baseUrl:`http://${address.host}:${address.port}`,token:'image-test-token'}));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6Q0AAAAASUVORK5CYII=','base64');
  const file=new File([png],'原图片.png',{type:'image/png'});
  const input=(site:typeof main,nodeId:string)=>({file,importRequestId:`use-${nodeId}`,scopeId:String(site.scopeId),position:{x:240,y:320},
    nativeCarrier:{canvasId:site.canvasId,spatialId:nodeId,size:{width:300,height:200}}});
  return {db,dbPath,server,client,base,main,context,input,file};
}

it.each(['main','context'] as const)('claims two identical images on their own original carriers in %s, with one file and two views; retry and SQLite reopen preserve them',async(which)=>{
  const f=await fixture(),site=f[which],pid=String(f.base.project.id);
  if(which==='context')await f.client.importCopiedFile(pid,{...f.input(f.main,'normal-library'),nativeCarrier:undefined});
  const first=await f.client.importCopiedFile(pid,f.input(site,'image-one'));
  const second=await f.client.importCopiedFile(pid,{...f.input(site,'image-two'),position:{x:600,y:420}});
  expect(second.artifact.id).toBe(first.artifact.id);expect(second.revision.id).toBe(first.revision.id);
  expect(second.view.id).not.toBe(first.view.id);expect(second.view.referenceKind).toBe('explicit_additional');
  expect(first.binding).toMatchObject({canvasId:site.canvasId,spatialId:'image-one',entityType:'artifact',entityId:first.artifact.id});
  expect(second.binding).toMatchObject({canvasId:site.canvasId,spatialId:'image-two',entityType:'view',entityId:second.view.id});
  expect(second.view.position).toEqual({x:600,y:420});expect(second.view.size).toEqual({width:300,height:200});
  const originalBytes=await f.client.getFileRecordContent(pid,String(first.revision.fileRecordId));
  expect(originalBytes.type).toBe('image/png');expect(Buffer.from(await originalBytes.arrayBuffer())).toEqual(Buffer.from(await f.file.arrayBuffer()));
  const replay=await f.client.importCopiedFile(pid,{...f.input(site,'image-two'),importRequestId:'reply-lost-retry'});
  expect(replay.view.id).toBe(second.view.id);expect(replay.binding).toEqual(second.binding);
  expect(f.db.getArtifacts(pid)).toHaveLength(f.base.artifacts.length+1);expect(f.db.getFileRecords(pid)).toHaveLength(f.base.fileRecords.length+1);
  expect(f.db.listWorkspaceMembers(site.id).filter(member=>member.artifactViewId===second.view.id)).toHaveLength(1);
  await f.server.close();servers.splice(servers.indexOf(f.server),1);f.db.close();dbs.splice(dbs.indexOf(f.db),1);
  const reopened=new SqliteMetadataRepository(f.dbPath);dbs.push(reopened);
  expect(reopened.findProjectionBinding(pid,site.canvasId,'node','view',String(second.view.id))).toEqual(second.binding);
  expect(reopened.getArtifactView(String(second.view.id))?.revisionId).toBe(first.revision.id);
  expect(reopened.listWorkspaceMembers(site.id)).toEqual(expect.arrayContaining([expect.objectContaining({artifactViewId:second.view.id})]));
},30_000);

it('never replaces an existing carrier identity or imports another file into it',async()=>{
  const f=await fixture(),pid=String(f.base.project.id);
  f.db.upsertProjectionBinding({projectId:pid,canvasId:f.main.canvasId,spatialKind:'node',spatialId:'occupied',entityType:'conversation',entityId:'keep-original'});
  const before=f.db.getProjectionBindings(pid);
  await expect(f.client.importCopiedFile(pid,f.input(f.main,'occupied'))).rejects.toThrow('未重复导入');
  expect(f.db.getProjectionBindings(pid)).toEqual(before);
  expect(f.db.getArtifacts(pid)).toHaveLength(f.base.artifacts.length);
  expect(f.db.listWorkspaceMembers(f.main.id)).toHaveLength(0);
},30_000);

it('reports saved material honestly if another writer binds the carrier after the file commit, without overwriting that writer',async()=>{
  const f=await fixture(),pid=String(f.base.project.id),register=f.db.registerImportedSource.bind(f.db);
  const competing={projectId:pid,canvasId:f.main.canvasId,spatialKind:'node' as const,spatialId:'original',entityType:'artifact',entityId:String(f.base.artifacts[0]!.id)};
  vi.spyOn(f.db,'registerImportedSource').mockImplementation((...args)=>{register(...args);f.db.upsertProjectionBinding(competing);});
  await expect(f.client.importCopiedFile(pid,f.input(f.main,'original'))).rejects.toThrow('图片材料已保存，原节点绑定未完成');
  expect(f.db.getProjectionBindings(pid)).toEqual([competing]);
  expect(f.db.getArtifacts(pid)).toHaveLength(f.base.artifacts.length+1);
  expect(f.db.listWorkspaceMembers(f.main.id)).toHaveLength(0);
},30_000);

it('rejects an inaccurate canvas/scope or incomplete carrier fields before creating files or bindings',async()=>{
  const f=await fixture(),pid=String(f.base.project.id);
  const inaccurate={...f.input(f.main,'original'),nativeCarrier:{...f.input(f.main,'original').nativeCarrier,canvasId:f.context.canvasId}};
  await expect(f.client.importCopiedFile(pid,inaccurate)).rejects.toThrow('原图片现场');
  await expect(f.client.importCopiedFile(pid,{...f.input(f.main,'original'),nativeCarrier:{canvasId:f.main.canvasId,spatialId:'',size:{width:300,height:200}}})).rejects.toThrow('完整');
  expect(f.db.getFileRecords(pid)).toHaveLength(f.base.fileRecords.length);expect(f.db.getProjectionBindings(pid)).toHaveLength(0);
},30_000);
