import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts';
import type { SpaceEntityProjectionSource } from '../../lcos/apps/web-gen2/src/spatial/ProjectToSpaceProjection.ts';
import type { ProjectionBinding } from '../../lcos/apps/web-gen2/src/spatial/projectionBinding.ts';
import type { AssemblyTargetRefV1 } from '@local-creative-os/contracts';
import { nativeWorkflowReferencedEntityIds } from './native-workflow-projection-plan.ts';

type Row = Record<string, any>;
export interface NativePileCollectionPlacementInput { collectionId:string; position?:{x:number;y:number} }

/** First placement uses the existing projector and its durable binding owner.
 * Native pile is the presentation of that one carrier, never a second node. */
export function createNativePileCollectionPlacement({ repository, projectId, spatial, projectPile, receiveCollection, projectCollection, fail }: {
  repository:SqliteMetadataRepository; projectId:string;
  spatial:{read(canvasId:string):Promise<any>};
  projectPile(canvasId:string,carrier:Row,nodes:readonly Row[]):Row|undefined;
  receiveCollection(canvasId:string,collectionId:string,targetRef:AssemblyTargetRefV1):Promise<Row>;
  projectCollection(canvasId:string,input:SpaceEntityProjectionSource,assertCurrent:()=>void):Promise<ProjectionBinding>;
  fail(status:number,code:string,message:string):never;
}) {
  const nonEmpty=(value:unknown):value is string=>typeof value==='string'&&!!value.trim();
  function inputOf(input:NativePileCollectionPlacementInput) {
    if(!input||typeof input!=='object'||Array.isArray(input)||!nonEmpty(input.collectionId)
      ||Object.keys(input).some(key=>!['collectionId','position'].includes(key)))
      fail(400,'INVALID_ARGUMENT','Select one canonical Collection and an optional finite placement point.');
    if(input.position!==undefined&&(!input.position||typeof input.position!=='object'||Array.isArray(input.position)
      ||Object.keys(input.position).some(key=>!['x','y'].includes(key))||!Number.isFinite(input.position.x)||!Number.isFinite(input.position.y)))
      fail(400,'INVALID_ARGUMENT','Collection placement requires finite x/y; no parent, size or membership override is accepted.');
    return {collectionId:input.collectionId,...(input.position?{position:{x:input.position.x,y:input.position.y}}:{})};
  }
  function owner(canvasId:string,collectionId:string) {
    if(!nonEmpty(canvasId)||!nonEmpty(collectionId))fail(400,'INVALID_ARGUMENT','An exact Canvas and Collection are required.');
    const workspaces=repository.getWorkspaces(projectId).filter(w=>w.canvasId===canvasId);
    if(workspaces.length!==1||String(workspaces[0]!.projectId)!==projectId)
      fail(409,'COLLECTION_WORKSPACE_UNAVAILABLE','The original Canvas must have one project-owned Workspace.');
    const workspace=workspaces[0]!,surface=workspace.preferredSurface;
    const scope=repository.getScopes(projectId).find(s=>String(s.id)===String(workspace.scopeId));
    if(!scope||String(scope.projectId)!==projectId||!['main','context','workflow'].includes(String(surface))
      ||surface==='main'&&scope.kind!=='root'||surface==='context'&&!['root','context'].includes(scope.kind)
      ||surface==='workflow'&&!['root','workflow'].includes(scope.kind))
      fail(409,'COLLECTION_TARGET_UNAVAILABLE','The current worksite has no confirmed original Presentation address.');
    const collection=repository.getCollection(collectionId);
    if(!collection||String(collection.id)!==collectionId||String(collection.projectId)!==projectId)
      fail(404,'COLLECTION_NOT_FOUND','The canonical Collection is not owned by this project.');
    const capability=surface==='workflow'?'workflow':'context',presentationId=`presentation:${capability}:${scope.id}`;
    const presentation=repository.getPresentationView(projectId,presentationId);
    if(presentation&&(presentation.projectId!==projectId||String(presentation.scopeId)!==String(scope.id)||presentation.capability!==capability))
      fail(409,'COLLECTION_TARGET_CHANGED','The original Presentation address has changed.');
    const methodReceived=nativeWorkflowReferencedEntityIds(repository,projectId,workspace,'collection').has(collectionId);
    const received=!!presentation?.state.memberEntityRefs?.some(ref=>ref.type==='collection'&&ref.id===collectionId)||methodReceived;
    const bindings=repository.getProjectionBindings(projectId).filter(b=>b.canvasId===canvasId&&b.spatialKind==='node'
      &&b.entityType==='collection'&&b.entityId===collectionId);
    if(bindings.length>1)fail(409,'COLLECTION_BINDING_AMBIGUOUS','The Collection has several native carriers in this Canvas.');
    const targetRef:AssemblyTargetRefV1=surface==='main'?{kind:'main'}:{kind:surface as 'context'|'workflow',id:String(scope.id)};
    return {workspace,scope,targetRef,presentationId,presentation,collection,received,methodReceived,binding:bindings[0]};
  }
  function sameOwner(before:ReturnType<typeof owner>,after:ReturnType<typeof owner>) {
    return String(before.workspace.id)===String(after.workspace.id)&&String(before.scope.id)===String(after.scope.id)
      &&before.workspace.preferredSurface===after.workspace.preferredSurface&&before.presentationId===after.presentationId;
  }
  const base=(canvasId:string,f:ReturnType<typeof owner>)=>({project_id:projectId,canvas_id:canvasId,
    workspace_id:String(f.workspace.id),collection_id:String(f.collection.id),collection:f.collection,
    presentation_received:f.received,presentation:f.presentation??null,binding:f.binding??null,node:null,
    provider_execution_started:false});
  async function inspect(canvasId:string,collectionId:string) {
    const initial=owner(canvasId,collectionId),saved=await spatial.read(canvasId),f=owner(canvasId,collectionId);
    if(!sameOwner(initial,f))fail(409,'COLLECTION_TARGET_CHANGED','The original worksite changed during its carrier read.');
    if(!saved||!Array.isArray(saved.state?.nodes))fail(503,'COLLECTION_CANVAS_UNAVAILABLE','The saved original Canvas cannot be inspected.');
    const result=base(canvasId,f),nodes=saved.state.nodes as Row[];
    if(!f.binding){
      // Only an exact saved identity can be evidence of an unbound carrier.
      // A label or a similar-looking note is never used as an identity repair.
      const unbound=nodes.some(node=>node.data?.lcos_collection_ref?.collectionId===collectionId
        &&node.data.lcos_collection_ref.projectId===projectId&&node.data.lcos_collection_ref.canvasId===canvasId);
      return {...result,state:unbound?'partial' as const:'absent' as const,
        ...(unbound?{incomplete:['projection-binding']}:{})};
    }
    if(!f.received)return {...result,state:'partial' as const,incomplete:['presentation-membership']};
    const carriers=nodes.filter(node=>String(node.id)===f.binding!.spatialId);
    if(carriers.length!==1)return {...result,state:'partial' as const,incomplete:['saved-carrier']};
    if(initial.binding&&(initial.binding.spatialId!==f.binding.spatialId||initial.binding.entityId!==f.binding.entityId))
      return {...result,state:'partial' as const,incomplete:['binding-readback']};
    const node=projectPile(canvasId,carriers[0]!,nodes),after=owner(canvasId,collectionId),ref=node?.data?.lcos_collection_ref;
    if(!sameOwner(f,after)||!after.received||after.binding?.spatialId!==f.binding.spatialId
      ||node?.type!=='pile'||node.id!==f.binding.spatialId||node.data?.id!==node.id||node.data?.lcos_native_collection!==true
      ||ref?.projectId!==projectId||ref.canvasId!==canvasId||ref.workspaceId!==String(f.workspace.id)||ref.collectionId!==collectionId
      ||!Array.isArray(node.data.memberIds)||!Number.isFinite(node.position?.x)||!Number.isFinite(node.position?.y))
      fail(409,'COLLECTION_PROJECTION_CHANGED','The original Collection binding and native pile could not be read back as one identity.');
    return {...base(canvasId,after),state:'present' as const,node};
  }
  async function project(canvasId:string,value:NativePileCollectionPlacementInput) {
    const input=inputOf(value),existing=await inspect(canvasId,input.collectionId);
    if(existing.state==='present')return {...existing,already_present:true};
    if(existing.state==='partial')fail(409,'COLLECTION_PLACEMENT_UNCONFIRMED','The Collection placement is partly recorded. Inspect it; do not replay the projector.');
    const original=owner(canvasId,input.collectionId);
    // Existing method membership can live in any legitimate group or nested
    // Collection. Do not copy it into the first canonical Presentation merely
    // to obtain a receipt for a semantic write that is not needed.
    const assemblyReceipt=original.methodReceived?undefined:await receiveCollection(canvasId,input.collectionId,original.targetRef),item=assemblyReceipt?.results?.[0];
    const received=owner(canvasId,input.collectionId);
    if(!sameOwner(original,received)||!received.received||!original.methodReceived&&(assemblyReceipt?.projectId!==projectId
      ||assemblyReceipt.results?.length!==1||item?.sourceRef?.kind!=='collection'||item.sourceRef.id!==input.collectionId
      ||!(item.status==='applied'&&item.channel==='presentation-membership'
        ||item.status==='skipped'&&item.channel==='already-member')))
      fail(409,'COLLECTION_RECEIVE_UNCONFIRMED','The original semantic owner did not confirm this exact Collection and worksite.');
    const assertCurrent=()=>{
      const current=owner(canvasId,input.collectionId);
      if(!sameOwner(original,current)||!current.received)
        fail(409,'COLLECTION_NOT_RECEIVED','The current original Presentation must already contain this canonical Collection.');
    };
    assertCurrent();
    await projectCollection(canvasId,{projectId,entityType:'collection',entityId:input.collectionId,
      kind:'file',sourceKind:'collection',title:original.collection.title,size:{width:248,height:244},
      ...(input.position?{position:input.position}:{})},assertCurrent);
    const result=await inspect(canvasId,input.collectionId);
    if(result.state!=='present')fail(409,'COLLECTION_PLACEMENT_UNCONFIRMED','The original projector result has not been read back; no successful placement was fabricated.');
    return {...result,already_present:false,...(assemblyReceipt?{assembly_receipt:assemblyReceipt}:{}),
      ...(item?.changeSetId?{change_set_id:item.changeSetId}:{}),
      owner:'original Assembly / ProjectToSpaceProjection / Core binding / native pile presentation'};
  }
  return {inspect,project};
}
