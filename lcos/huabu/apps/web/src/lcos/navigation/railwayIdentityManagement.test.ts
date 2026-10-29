import { expect,it,vi } from 'vitest';

import { navigationGraph } from './navigationFixtures';
import { projectSpatialDestinations } from './projectNavigationIndex';
import { railwayIdentityCapabilities,removeRailwayWorkspace,renameRailwayIdentity } from './railwayIdentityManagement';

it('renames the exact Scope using the existing graph version and preserving all non-name fields',async()=>{
  const graph=navigationGraph({scopes:[{id:'scope',projectId:'p',kind:'context',name:'原名',parentScopeId:'root',containerViewId:'view'}]});
  const apply=vi.fn().mockResolvedValue({appliedOps:1,graphVersion:3});
  await renameRailwayIdentity({projects:{getProjectGraph:async()=>graph,applyGraphMutations:apply}},'p',
    {kind:'spatial',projectId:'p',entityType:'scope',entityId:'scope'},'  新名  ');
  expect(apply).toHaveBeenCalledWith('p',{baseVersion:2,actorKind:'user',ops:[{type:'upsert_scope',scope:expect.objectContaining({id:'scope',name:'新名',kind:'context',parentScopeId:'root',containerViewId:'view'})}]});
});
it('removes only a non-root Workspace through its true existing producer',async()=>{
  const graph=navigationGraph({scopes:[{id:'root',kind:'root'},{id:'context',kind:'context'}],workspaces:[
    {id:'root-workspace',projectId:'p',scopeId:'root',name:'根'}, {id:'child',projectId:'p',scopeId:'context',name:'子现场'},
  ]});
  const apply=vi.fn().mockResolvedValue({appliedOps:1,graphVersion:3});const session={projects:{getProjectGraph:async()=>graph,applyGraphMutations:apply}};
  await expect(removeRailwayWorkspace(session,'p',{kind:'worksite',projectId:'p',worksiteId:'root-workspace'})).rejects.toThrow('根工作面保留');
  expect(apply).not.toHaveBeenCalled();
  await removeRailwayWorkspace(session,'p',{kind:'worksite',projectId:'p',worksiteId:'child'});
  expect(apply).toHaveBeenCalledExactlyOnceWith('p',{baseVersion:2,actorKind:'user',ops:[{type:'delete_workspace',workspaceId:'child'}]});
});
it('does not advertise or emulate unsupported Collection CRUD / Scope delete',async()=>{
  const graph=navigationGraph({scopes:[{id:'scope',projectId:'p',kind:'workflow',name:'流程'}]});
  const destinations=projectSpatialDestinations('p',graph,[{id:'collection',projectId:'p',title:'集合',createdAt:'',updatedAt:''}]);
  const scope=destinations.find(item=>item.ref.kind==='spatial'&&item.ref.entityType==='scope');
  const collection=destinations.find(item=>item.ref.kind==='spatial'&&item.ref.entityType==='collection');
  if(!scope||!collection)throw new Error('Fixture identities missing');
  expect(railwayIdentityCapabilities(scope)).toEqual({rename:true,remove:false});
  expect(railwayIdentityCapabilities(collection)).toEqual({rename:false,remove:false});
  const apply=vi.fn();const session={projects:{getProjectGraph:async()=>graph,applyGraphMutations:apply}};
  await expect(renameRailwayIdentity(session,'p',collection.ref,'改名')).rejects.toThrow('尚未提供更名');
  await expect(removeRailwayWorkspace(session,'p',scope.ref)).rejects.toThrow('这里只移除真实工作现场');
  expect(apply).not.toHaveBeenCalled();
});
