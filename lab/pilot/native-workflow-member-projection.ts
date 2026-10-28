import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts';
import { createId } from '../../lcos/huabu/packages/shared/src/index.ts';
import { Gen2Host } from '../../lcos/apps/web-gen2/src/host/projectionFacade.ts';
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.ts';
import { createHeadlessProjectionPort } from './headless-projection-port.ts';
import type { NativeWorkflowProjectionMember } from './native-workflow-projection-plan.ts';
type Row=Record<string,any>;
/** One original projector invocation. The source echo lives on its original
 * saved carrier, so an interrupted binding receipt cannot cause a second CREATE. */
export function createNativeWorkflowMemberProjection({repository,projectId,coreOrigin,spatial,fail}:{
  repository:SqliteMetadataRepository;projectId:string;coreOrigin:string;spatial:{read(id:string):Promise<any>;withCanvasLock(id:string,run:(locked:{read():Promise<any>;execute(commands:any[]):Promise<any>})=>Promise<any>):Promise<any>};
  fail(status:number,code:string,message:string):never;
}){
  return async(canvasId:string,member:NativeWorkflowProjectionMember,assertCurrent:()=>void)=>{
    const owners=repository.getWorkspaces(projectId).filter(row=>row.canvasId===canvasId);
    if(owners.length!==1)fail(409,'METHOD_WORKSPACE_CHANGED','当前现场的原归属尚未确认。');
    const ref={projectId,canvasId,workspaceId:String(owners[0]!.id),entityType:member.type,entityId:member.id};
    assertCurrent();
    const host=new Gen2Host({projectId,http:new HttpClient({baseUrl:coreOrigin}),rfs:createHeadlessProjectionPort({canvasId,coreOrigin,read:spatial.read,
      execute:(id,commands)=>spatial.withCanvasLock(id,async locked=>{
        assertCurrent();const saved=await locked.read();assertCurrent();
        if(!Array.isArray(saved?.state?.nodes))fail(503,'METHOD_SPACE_UNAVAILABLE','原现场暂时不可读取。');
        const creates=commands.some(command=>(command as Row).type==='CREATE_NODES');
        if(creates){
          const echoed=saved.state.nodes.some((node:Row)=>Object.entries(ref).every(([key,value])=>node.data?.lcos_method_member_ref?.[key]===value));
          const bound=repository.getProjectionBindings(projectId).some(row=>row.canvasId===id&&row.spatialKind==='node'&&row.entityType===member.type&&row.entityId===member.id);
          if(echoed||bound)fail(409,'METHOD_MEMBER_PLACEMENT_UNCONFIRMED','原成员载体已存在或绑定尚未确认，未重复创建；请检查原记录。');
        }
        const identified=commands.map(command=>{const value=command as Row;return value.type==='CREATE_NODES'?{...value,nodes:value.nodes.map((node:Row)=>({...node,id:node.id??createId('node'),data:{...node.data,lcos_method_member_ref:ref}}))}:value;});
        return locked.execute(identified);
      })})});
    // The original batch owner reads the saved outline, uses its existing
    // mechanical avoidance/actual receipt sizes, and leaves bound nodes still.
    // projectEntity alone would create an unpositioned member at (0,0).
    const report=await host.nodeProjector.projectBatchWithReport([{projectId,entityType:member.type as never,entityId:member.id,
      kind:member.type==='scope'||member.type==='workspace'?'file':'text',title:member.title,
      ...(member.type==='scope'?{sourceKind:member.source.kind}:member.type==='workspace'?{sourceKind:'scene'}:{}),size:{width:280,height:220}}]);
    assertCurrent();
    const binding=report.bindings[0];
    if(report.failures.length||report.bindings.length!==1||!binding||binding.projectId!==projectId||binding.canvasId!==canvasId
      ||binding.spatialKind!=='node'||binding.entityType!==member.type||binding.entityId!==member.id)
      fail(409,'METHOD_MEMBER_PROJECTION_UNCONFIRMED','原成员安放尚未完整确认，已有载体保留；请重新读取，未报告成功。');
    return binding;
  };
}

/** Read-only DTO from exact Core binding + canonical body/address. Geometry is
 * only the original saved Huabu carrier. Note is never relabelled as a file. */
export function nativeWorkflowMemberNode(repository:SqliteMetadataRepository,projectId:string,canvasId:string,node:Row,fail:(status:number,code:string,message:string)=>never){
  const bindings=repository.getProjectionBindings(projectId).filter(row=>row.canvasId===canvasId&&row.spatialKind==='node'&&row.spatialId===String(node.id));
  const binding=bindings.find(row=>['note','scope','workspace'].includes(row.entityType));if(!binding)return undefined;
  if(bindings.length!==1)fail(409,'METHOD_MEMBER_BINDING_AMBIGUOUS','成员载体有冲突的原身份。');
  const owners=repository.getWorkspaces(projectId).filter(row=>row.canvasId===canvasId);if(owners.length!==1)fail(409,'METHOD_WORKSPACE_CHANGED','成员画布没有唯一的原现场。');
  const workspace=owners[0]!,graph=repository.get(projectId),id=binding.entityId;
  const own=(row:Row|undefined)=>{if(!row||String(row.id)!==id||String(row.projectId)!==projectId||row.archivedAt)fail(409,'METHOD_MEMBER_UNAVAILABLE','原成员已变化，请重新读取。');return row!;};
  let facts:Row;
  if(binding.entityType==='note'){
    const note=own(repository.getNote(id));if(typeof note.body!=='string'||typeof note.updatedAt!=='string')fail(409,'METHOD_NOTE_UNAVAILABLE','原附注正文暂不可读取。');
    facts={title:note.body.split('\n').find((line:string)=>line.trim())?.trim().slice(0,72)||'空白附注',body:note.body,updatedAt:note.updatedAt};
  }else{
    const target=binding.entityType==='workspace'?own(repository.getWorkspace(id)):own(graph?.scopes.find(row=>String(row.id)===id));
    const scope=binding.entityType==='workspace'?graph?.scopes.find(row=>String(row.id)===String(target.scopeId)):target;
    if(!scope||String(scope.projectId)!==projectId||scope.archivedAt)fail(409,'METHOD_MEMBER_UNAVAILABLE','原现场所属 Scope 暂不可读取。');
    const presentations=repository.listPresentationViews(projectId).filter(row=>String(row.scopeId)===String(scope.id)&&row.projectId===projectId&&row.capability===scope.kind)
      .sort((left,right)=>left.id<right.id?-1:left.id>right.id?1:0);
    const artifactTitle=(artifactId:string)=>{const artifact=repository.getArtifact(artifactId);return artifact&&String(artifact.projectId)===projectId?artifact.title:undefined;};
    const viewTitle=(viewId:string)=>{const view=repository.getArtifactView(viewId);return view?artifactTitle(String(view.artifactId)):undefined;};
    const memberTitle=(ref:Row)=>{
      if(ref.type==='view')return viewTitle(ref.id);
      if(ref.type==='artifact')return artifactTitle(ref.id);
      if(ref.type==='collection')return graph?.collections?.find(row=>String(row.id)===ref.id)?.title;
      if(ref.type==='note')return graph?.notes.find(row=>String(row.id)===ref.id)?.body.split('\n').find(line=>line.trim())?.trim();
      if(ref.type==='scope')return graph?.scopes.find(row=>String(row.id)===ref.id)?.name;
      if(ref.type==='workspace')return graph?.workspaces.find(row=>String(row.id)===ref.id)?.name;
      if(ref.type==='conversation')return repository.getConnectedConversation(projectId,ref.id)?.label;
      if(ref.type==='run'){const run=repository.getRun(ref.id);return run&&String(run.projectId)===projectId?run.instruction?.split('\n')[0]:undefined;}
      return undefined;
    };
    const labels=presentations.flatMap(row=>[
      ...(scope.kind==='workflow'?(row.state.workflowActions??[]).map(action=>[action.label,action.description].filter(Boolean).join('\n')):[]),
      ...row.state.memberViewIds.map(viewTitle),...(row.state.memberEntityRefs??[]).map(memberTitle)]).filter((value):value is string=>typeof value==='string'&&!!value.trim());
    const details=binding.entityType==='workspace'?(target.focusedViewIds??[]).map(viewTitle).filter(Boolean):labels;
    const summary=[typeof target.description==='string'?target.description.trim():'',...[...new Set(details)]].filter(Boolean).join('\n');
    facts={title:binding.entityType==='workspace'?target.name:scope.name,scopeId:String(scope.id),scopeKind:scope.kind,
      ...(binding.entityType==='workspace'?{targetWorkspaceId:id,targetCanvasId:target.canvasId,preferredSurface:target.preferredSurface}:{}),
      description:summary||(binding.entityType==='workspace'?`进入${target.name}现场查看内容`:`打开${scope.name}查看内容`),updatedAt:target.updatedAt};
  }
  const size=node.measured??node.size??node.style??{};
  return{id:String(node.id),canvas_id:canvasId,type:'lcos-member',position:node.position,
    measured:{width:Number(size.width??node.width??280),height:Number(size.height??node.height??220)},
    data:{id:String(node.id),title:facts.title,lcos_member_ref:{projectId,canvasId,workspaceId:String(workspace.id),entityType:binding.entityType,entityId:id},lcos_member_facts:facts}};
}
