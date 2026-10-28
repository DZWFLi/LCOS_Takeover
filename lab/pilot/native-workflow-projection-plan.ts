import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts';
import { readNativeMaterialVersion } from './native-material-placement.ts';

type Row=Record<string,any>;
export type NativeWorkflowProjectionMemberType='artifact'|'view'|'collection'|'note'|'scope'|'workspace'|'conversation'|'run';
export interface NativeWorkflowProjectionMember { readonly type:NativeWorkflowProjectionMemberType;readonly id:string;readonly title:string;readonly source:Row; }
export interface NativeWorkflowProjectionPlan {
  readonly scopeId:string;readonly presentations:readonly Row[];readonly members:readonly NativeWorkflowProjectionMember[];
  readonly materials:readonly {artifactId:string;artifactViewId?:string;revisionId:string;fileRecordId:string}[];
  readonly collectionMemberships:readonly Row[];readonly runIds:readonly string[];
}
/** Reads original identities only. A Scope/Workspace remains a navigation entry;
 * Collection membership is traversed so its original expand owner has real carriers.
 * No membership, Run, View, Workspace or spatial state is written by this plan. */
export function readNativeWorkflowProjectionPlan({repository,projectId,scopeId,fail}:{
  repository:SqliteMetadataRepository;projectId:string;scopeId:string;fail(status:number,code:string,message:string):never;
}):NativeWorkflowProjectionPlan {
  const graph=repository.get(projectId),scope=graph?.scopes.find(row=>String(row.id)===scopeId&&String(row.projectId)===projectId&&row.kind==='workflow');
  if(!scope||scope.archivedAt)fail(409,'METHOD_UNAVAILABLE','方法已变化或已移除，请重新打开。');
  const presentations=repository.listPresentationViews(projectId).filter(row=>String(row.projectId)===projectId&&String(row.scopeId)===scopeId&&row.capability==='workflow')
    .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  if(!presentations.length||new Set(presentations.map(row=>row.id)).size!==presentations.length)
    fail(409,'METHOD_PRESENTATION_UNAVAILABLE','方法内容暂时无法完整读取，请重新打开；原内容保留。');
  const members:NativeWorkflowProjectionMember[]=[],materials:NativeWorkflowProjectionPlan['materials'][number][]=[],collectionMemberships:Row[]=[],seen=new Set<string>(),runIds:string[]=[];
  const own=(row:Row|undefined,type:string,id:string)=>{if(!row||String(row.id)!==id||String(row.projectId)!==projectId||row.archivedAt)
    fail(409,'METHOD_MEMBER_UNAVAILABLE',`关联${({view:'材料',artifact:'材料',collection:'集合',note:'附注',scope:'内容',workspace:'工作现场',conversation:'对话',run:'任务'} as Record<string,string>)[type]??'内容'}暂不可读取，请重新打开方法；原内容保留。`);return row!;};
  const visit=(raw:Row,ancestors:ReadonlySet<string>)=>{
    if(!raw||typeof raw.type!=='string'||typeof raw.id!=='string'||!raw.id.trim())fail(409,'METHOD_MEMBER_IDENTITY_INVALID','有一项关联内容暂时无法读取，请重新打开方法；原内容保留。');
    const type=raw.type,id=raw.id,key=JSON.stringify([type,id]);
    if(ancestors.has(key))fail(409,'METHOD_COLLECTION_CYCLE','关联集合相互嵌套，暂时无法准备现场；请检查集合内容，原内容保留。');
    if(seen.has(key))return;
    const next=new Set(ancestors);next.add(key);let source:Row,title:string;
    if(type==='view'||type==='artifact'){
      const view=type==='view'?repository.getArtifactView(id):undefined;
      if(type==='view'&&(!view||!graph!.scopes.some(row=>String(row.id)===String(view.scopeId)&&String(row.projectId)===projectId)))
        fail(409,'METHOD_MATERIAL_UNAVAILABLE','关联材料的来源暂时无法确认，请重新打开方法；已有内容保留。');
      const artifact=repository.getArtifact(String(view?.artifactId??id));own(artifact,type,id===String(artifact?.id)?id:String(view?.artifactId));
      const revisionId=String(view?.revisionId??raw.revisionId??artifact?.currentRevisionId??''),revision=repository.getArtifactRevision(revisionId);
      if(!revision)fail(409,'METHOD_MATERIAL_UNAVAILABLE','关联材料的所选版本暂不可读，请重新打开方法。');
      const input={artifactId:String(artifact!.id),...(view?{artifactViewId:id}:{}),revisionId,fileRecordId:String(revision!.fileRecordId)};
      readNativeMaterialVersion({repository,projectId,input,fail});
      materials.push(input);source={artifactId:input.artifactId,revisionId,fileRecordId:input.fileRecordId,...(view?{viewId:id,scopeId:String(view.scopeId)}:{})};title=artifact!.title;
    }else if(type==='collection'){
      const collection=own(repository.getCollection(id),'collection',id),rows=repository.listCollectionMemberships(projectId,id);
      const relations=new Set<string>(),refs=new Set<string>();
      for(const row of rows){const ref=JSON.stringify(row.memberRef);if(!row.relationId||String(row.collectionId)!==id||relations.has(String(row.relationId))||refs.has(ref))
        fail(409,'METHOD_COLLECTION_MEMBERSHIP_INVALID',`“${collection.title}”的关联内容暂不可读取，请重新打开方法。`);relations.add(String(row.relationId));refs.add(ref);}
      collectionMemberships.push(...rows);source={id,projectId};title=collection.title;
      // Validate descendants before adding a parent; projection may place them
      // in this order without inventing parent geometry or modifying membership.
      for(const row of rows)visit(row.memberRef as Row,next);
    }else if(type==='note'){
      const note=own(repository.getNote(id),'note',id);if(typeof note.body!=='string')fail(409,'METHOD_NOTE_UNAVAILABLE','关联附注暂不可读，请重新打开方法。');
      source={id,projectId};title=note.body.split('\n').find((line:string)=>line.trim())?.trim().slice(0,72)||'空白附注';
    }else if(type==='scope'){
      const target=own(graph!.scopes.find(row=>String(row.id)===id),'scope',id);
      if(!['context','workflow'].includes(target.kind))fail(501,'METHOD_MEMBER_PROJECTION_UNAVAILABLE',`“${target.name}”暂不能在画布中查看，原内容保留。`);
      source={id,projectId,kind:target.kind};title=target.name;
    }else if(type==='workspace'){
      const target=own(repository.getWorkspace(id),'workspace',id);own(graph!.scopes.find(row=>String(row.id)===String(target.scopeId)),'scope',String(target.scopeId));
      if(typeof target.canvasId!=='string'||!target.canvasId.trim()||!['main','context','workflow'].includes(target.preferredSurface))
        fail(501,'METHOD_MEMBER_PROJECTION_UNAVAILABLE',`“${target.name}”的工作现场尚不能进入，原内容保留。`);
      if(graph!.workspaces.filter(row=>row.canvasId===target.canvasId).length!==1)fail(409,'METHOD_WORKSPACE_CHANGED',`“${target.name}”的工作现场暂时无法确认，请重新打开方法。`);
      source={id,projectId,scopeId:String(target.scopeId),canvasId:target.canvasId,preferredSurface:target.preferredSurface};title=target.name;
    }else if(type==='conversation'){
      const target=own(repository.getConnectedConversation(projectId,id),'conversation',id);
      if(typeof target.conversationRef!=='string'||target.conversationRef.startsWith('pending-'))fail(409,'METHOD_CONVERSATION_UNAVAILABLE',`“${target.label}”暂时无法连接，请重新打开方法；原对话保留。`);
      source={id,projectId,conversationRef:target.conversationRef};title=target.label;
    }else if(type==='run'){
      const target=own(repository.getRun(id as never),'run',id);source={id,projectId,workspaceId:target.workspaceId,scopeId:target.scopeId};title=target.instruction||'任务';runIds.push(id);
    }else return fail(501,'METHOD_MEMBER_PROJECTION_UNAVAILABLE','有一项关联内容暂不能在画布中查看，原内容保留。');
    seen.add(key);members.push({type:type as NativeWorkflowProjectionMemberType,id,title,source});
  };
  for(const presentation of presentations){
    const operators=presentation.state.workflowOperators??{};
    for(const id of presentation.state.memberViewIds)if(!(id in operators)||!!repository.getArtifactView(id))visit({type:'view',id},new Set());
    for(const ref of presentation.state.memberEntityRefs??[])visit(ref,new Set());
    for(const action of presentation.state.workflowActions??[])for(const id of action.attachedViewIds)visit({type:'view',id},new Set());
    for(const operator of Object.values(operators))for(const branch of operator.branches??[])if(branch.targetViewId)visit({type:'view',id:branch.targetViewId},new Set());
  }
  return structuredClone({scopeId,presentations,members,materials,collectionMemberships,runIds});
}

/** Explicit membership admission for a display reference only. Canonical Run
 * workspace and all ResultSlot eligibility stay with their original owners. */
export function nativeWorkflowReferencedEntityIds(repository:SqliteMetadataRepository,projectId:string,workspace:Row,type:string):ReadonlySet<string>{
  const ids=new Set<string>();
  if(workspace.projectId!==projectId||workspace.preferredSurface!=='workflow')return ids;
  const scope=repository.getScopes(projectId).find(row=>String(row.id)===String(workspace.scopeId));
  if(scope?.kind!=='workflow'||scope.archivedAt)return ids;
  const seen=new Set<string>();
  const visit=(ref:Row)=>{if(!ref||typeof ref.id!=='string')return;
    if(ref.type===type)ids.add(ref.id);
    if(ref.type==='collection'&&!seen.has(ref.id)){seen.add(ref.id);const collection=repository.getCollection(ref.id);if(collection&&String(collection.projectId)===projectId)
      for(const row of repository.listCollectionMemberships(projectId,ref.id))visit(row.memberRef);}
  };
  for(const presentation of repository.listPresentationViews(projectId))if(presentation.projectId===projectId&&String(presentation.scopeId)===String(scope.id)&&presentation.capability==='workflow')
    for(const ref of presentation.state.memberEntityRefs??[])visit(ref);
  return ids;
}

export const nativeWorkflowReferencedRunIds=(repository:SqliteMetadataRepository,projectId:string,workspace:Row)=>
  new Set([...nativeWorkflowReferencedEntityIds(repository,projectId,workspace,'run')].filter(id=>String(repository.getRun(id as never)?.projectId)===projectId));
