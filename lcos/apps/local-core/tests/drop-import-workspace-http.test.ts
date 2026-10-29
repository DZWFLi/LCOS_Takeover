import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { WorkspaceMembership } from '@local-creative-os/domain';
import { CoreArtifactClient } from '../../web-gen2/src/backend/artifacts.js';
import { CoreConversationClient } from '../../web-gen2/src/backend/conversations.js';
import { HttpClient } from '../../web-gen2/src/backend/client.js';
import { coreRequest } from '../../web-gen2/src/backend/coreTypes.js';
import { SqliteMetadataRepository } from '../src/metadata-repository.js';
import { ConversationImportService } from '../src/conversation-import-service.js';
import { createMvpSampleSnapshot } from '../src/mvp-sample-project.js';
import { createLocalCoreServer, type LocalCoreServer } from '../src/server.js';

const roots:string[]=[],repositories:SqliteMetadataRepository[]=[],servers:LocalCoreServer[]=[];
const conversationServices:ConversationImportService[]=[];
afterEach(async()=>{
  for(const server of servers.splice(0))await server.close();
  for(const service of conversationServices.splice(0))service.close();
  for(const db of repositories.splice(0))db.close();
  for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});
});

it('the production upload client reuses saved bytes and the real member HTTP receipt persists arrival in Context and Workflow',async()=>{
  const root=mkdtempSync(join(tmpdir(),'lcos-drop-arrival-'));roots.push(root);
  const projectRoot=join(root,'project');mkdirSync(projectRoot);
  const dbPath=join(root,'metadata.sqlite'),db=new SqliteMetadataRepository(dbPath);repositories.push(db);
  const at='2026-10-13T00:00:00Z',base=createMvpSampleSnapshot(projectRoot,at);
  const rootScope=base.scopes.find(scope=>scope.kind==='root')!;
  const scope=(kind:'context'|'workflow')=>({...rootScope,id:`scope-drop-${kind}` as typeof rootScope.id,
    parentScopeId:rootScope.id,containerViewId:null,kind,name:kind});
  const context=scope('context'),workflow=scope('workflow');
  const workspace=(kind:'context'|'workflow',scopeId:typeof rootScope.id)=>({...base.workspaces[0]!,
    id:`workspace-drop-${kind}` as typeof base.workspaces[0]['id'],scopeId,name:kind,canvasId:`canvas-drop-${kind}`,
    preferredSurface:kind,focusedViewIds:[]});
  const contextSite=workspace('context',context.id),workflowSite=workspace('workflow',workflow.id);
  db.save({...base,scopes:[...base.scopes,context,workflow],workspaces:[...base.workspaces,contextSite,workflowSite]});
  const conversations=new ConversationImportService(db,{stagingRoot:join(root,'history-staging')});conversationServices.push(conversations);
  const server=createLocalCoreServer({port:0,metadataRepository:db,apiToken:'drop-test-token',conversationImportService:conversations});servers.push(server);
  const address=await server.start();
  const http=new HttpClient({baseUrl:`http://${address.host}:${address.port}`,token:'drop-test-token'}),artifacts=new CoreArtifactClient(http);
  const text='真实导入正文\n第二行',file=new File([text],'材料.txt',{type:'text/plain'});
  const first=await artifacts.importCopiedFile(String(base.project.id),{file,importRequestId:'drop-first',scopeId:String(rootScope.id),position:{x:10,y:20}});
  const reused=await artifacts.importCopiedFile(String(base.project.id),{file,importRequestId:'drop-again',scopeId:String(context.id),position:{x:200,y:300}});
  expect(reused.reused).toBe(true);expect(reused.view.id).toBe(first.view.id);
  expect(reused.artifact.id).toBe(first.artifact.id);expect(reused.revision.id).toBe(first.revision.id);
  expect(reused.view.scopeId).toBe(rootScope.id);
  for(const site of [contextSite,workflowSite]){
    const path=`/workspaces/${site.id}/members`,body={viewIds:[String(reused.view.id)],addedBy:'import'};
    const members=await coreRequest<readonly WorkspaceMembership[]>(http,'POST',path,{body});
    expect(members).toContainEqual(expect.objectContaining({workspaceId:site.id,artifactViewId:first.view.id,addedBy:'import'}));
    expect(members[0]).not.toHaveProperty('viewId');
    const replay=await coreRequest<readonly WorkspaceMembership[]>(http,'POST',path,{body});
    expect(replay.filter(member=>member.artifactViewId===first.view.id)).toHaveLength(1);
  }
  const bytes=await fetch(`http://${address.host}:${address.port}/projects/${base.project.id}/file-records/${first.revision.fileRecordId}/content`,
    {headers:{Authorization:'Bearer drop-test-token'}});
  expect(bytes.ok).toBe(true);expect(await bytes.text()).toBe(text);
  const nativeMeta={model_provider:'huabu',exportKind:'native-visible-history-snapshot',nativeThread:{threadId:'original-native-thread',ownerCanvasId:'original-canvas'}};
  const history=new Blob([JSON.stringify({type:'session_meta',payload:nativeMeta})+'\n'
    +JSON.stringify({type:'event_msg',payload:{type:'user_message',message:'真实保存的历史'}})+'\n'],{type:'application/x-ndjson'});
  const client=new CoreConversationClient(http);
  const upload=await client.createImportSession(String(base.project.id),{sourceKind:'manual',title:'原线程历史',sourceFileName:'huabu-native-history.jsonl',
    expectedBytes:history.size,scopeId:String(rootScope.id),workspaceId:String(base.workspaces[0]!.id)});
  await client.uploadImportChunk(String(base.project.id),upload.id,0,history);
  const saved=await client.completeImportSession(String(base.project.id),upload.id,{expectedChunks:1});
  expect(saved.session.originMeta).toEqual(nativeMeta);
  expect(await client.listSessions(String(base.project.id))).toContainEqual(expect.objectContaining({id:saved.session.id,originMeta:nativeMeta}));
  conversations.close();conversationServices.splice(conversationServices.indexOf(conversations),1);
  await server.close();servers.splice(servers.indexOf(server),1);db.close();repositories.splice(repositories.indexOf(db),1);
  const reopened=new SqliteMetadataRepository(dbPath);repositories.push(reopened);
  expect(reopened.get(base.project.id)?.artifacts.filter(artifact=>artifact.id===first.artifact.id)).toHaveLength(1);
  for(const site of [contextSite,workflowSite])
    expect(reopened.listWorkspaceMembers(site.id)).toContainEqual(expect.objectContaining({artifactViewId:first.view.id,addedBy:'import'}));
  const restoredConversations=new ConversationImportService(reopened,{stagingRoot:join(root,'history-staging')});conversationServices.push(restoredConversations);
  expect(restoredConversations.list(String(base.project.id))).toContainEqual(expect.objectContaining({id:saved.session.id,originMeta:nativeMeta,status:'ready'}));
},30_000);
