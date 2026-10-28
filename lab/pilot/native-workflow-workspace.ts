import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository';
import { readNativeWorkflowProjectionPlan, type NativeWorkflowProjectionMember, type NativeWorkflowProjectionPlan } from './native-workflow-projection-plan.ts';

/** First-open coordination over the original Core Workspace and Huabu Space.
 * No separate canvas catalogue or copied material is persisted here. */
export function createNativeWorkflowWorkspaceOpener({repository,projectId,read,create,place,projectMember,memberTypes=[],preflight,prepareExisting,fail}:{
  repository:SqliteMetadataRepository;projectId:string;
  read(id:string):Promise<any>;create(id:string,title:string):Promise<any>;place(id:string,input:any):Promise<any>;
  projectMember?(canvasId:string,member:NativeWorkflowProjectionMember,assertCurrent:()=>void):Promise<any>;
  prepareExisting?(canvasId:string,assertCurrent:()=>void):Promise<void>;
  preflight?(plan:NativeWorkflowProjectionPlan):Promise<void>;
  memberTypes?:readonly NativeWorkflowProjectionMember['type'][];
  fail(status:number,code:string,message:string):never;
}) {
  const pending=new Map<string,Promise<any>>();
  const exact=(scopeId:string,workspaceId:string)=>{
    const graph=repository.get(projectId),scope=graph?.scopes.find(s=>String(s.id)===scopeId&&s.kind==='workflow');
    if(!scope||(scope as any).archivedAt)fail(409,'METHOD_UNAVAILABLE','方法已变化或已移除，请重新打开。');
    const workspace=repository.getWorkspace(workspaceId);
    if(workspace&&(String(workspace.projectId)!==projectId||String(workspace.scopeId)!==scopeId||workspace.preferredSurface!=='workflow'))
      fail(409,'METHOD_WORKSPACE_CHANGED','方法现场已变化，请重新打开方法。');
    if(!workspace&&(workspaceId!==`workspace:${scopeId}`||graph!.workspaces.some(w=>String(w.scopeId)===scopeId)))
      fail(409,'METHOD_WORKSPACE_CHANGED','请从方法已有的现场入口进入。');
    return{scope:scope!,workspace};
  };
  async function open(scopeId:string,workspaceId:string){
    const before=exact(scopeId,workspaceId),plan=readNativeWorkflowProjectionPlan({repository,projectId,scopeId,fail});
    const missing=plan.members.filter(member=>!['view','artifact'].includes(member.type)&&(!projectMember||!memberTypes.includes(member.type)));
    if(missing.length)fail(501,'METHOD_MEMBER_PROJECTION_UNAVAILABLE',`这些关联内容暂不能在画布中查看：${missing.map(member=>member.title).join('、')}；原内容保留。`);
    const assertMethodCurrent=()=>{
      exact(scopeId,workspaceId);
      const current=readNativeWorkflowProjectionPlan({repository,projectId,scopeId,fail});
      if(JSON.stringify(current)!==JSON.stringify(plan))fail(409,'METHOD_CONTENT_CHANGED','方法在准备现场时已更新，已安放的成员保留；请重新打开方法。');
    };
    if(preflight){await preflight(plan);assertMethodCurrent();}
    // Reversible encoding of existing primary keys, not a new hash identity.
    const candidate=before.workspace?.canvasId??'worksite-'+Buffer.from(JSON.stringify([projectId,workspaceId])).toString('base64url');
    let snapshot=await read(candidate);assertMethodCurrent();
    if(before.workspace?.canvasId&&!snapshot)fail(409,'METHOD_SPACE_MISSING','原现场暂时无法打开，请重新读取方法；原内容保留。');
    if(!before.workspace?.canvasId){
      const other=repository.getWorkspaces(projectId).filter(w=>w.canvasId===candidate&&String(w.id)!==workspaceId);
      if(other.length)fail(409,'METHOD_SPACE_COLLISION','现场地址已被使用，原内容保留。');
      if(snapshot&&(snapshot.version!==0||snapshot.state?.nodes?.length||snapshot.state?.edges?.length))
        fail(409,'METHOD_SPACE_COLLISION','已有现场暂时无法确认，请重新打开方法；原内容保留。');
      if(!snapshot){const result=await create(candidate,before.workspace?.name??before.scope.name);if(!result?.ok&&result?.reason!=='already-exists')fail(503,'METHOD_SPACE_CREATE_FAILED','现场暂未创建，方法和材料保留。');snapshot=await read(candidate);}
      if(!snapshot||snapshot.version!==0||snapshot.state?.nodes?.length||snapshot.state?.edges?.length)fail(409,'METHOD_SPACE_CHANGED','新现场状态已变化，请重新读取。');
      assertMethodCurrent();(repository as any).claimWorkflowWorkspaceCanvas(projectId,scopeId,workspaceId,candidate);
    }
    const owned=exact(scopeId,workspaceId).workspace;
    if(owned?.canvasId!==candidate)fail(409,'METHOD_WORKSPACE_CHANGED','现场暂时无法打开，请重新读取方法。');
    if(prepareExisting){await prepareExisting(candidate,assertMethodCurrent);assertMethodCurrent();}
    for(const material of plan.materials){
      assertMethodCurrent();
      // Original cross-worksite placement pins one additional View. It keeps
      // the same Artifact/FileRecord and leaves the source method reference intact.
      await place(candidate,{projectId,workspaceId,...material});assertMethodCurrent();
    }
    for(const member of plan.members)if(!['view','artifact'].includes(member.type)){
      assertMethodCurrent();await projectMember!(candidate,member,assertMethodCurrent);assertMethodCurrent();
    }
    const after=exact(scopeId,workspaceId).workspace;
    if(after?.canvasId!==candidate||!await read(candidate))fail(409,'METHOD_WORKSPACE_CHANGED','现场尚未准备完成，已有方法保留。');
    assertMethodCurrent();return{workspace:after,canvasId:candidate};
  }
  return{open(scopeId:string,workspaceId:string){const key=JSON.stringify([scopeId,workspaceId]);const current=pending.get(key);if(current)return current;
    const operation=open(scopeId,workspaceId).finally(()=>{if(pending.get(key)===operation)pending.delete(key)});pending.set(key,operation);return operation;}};
}
