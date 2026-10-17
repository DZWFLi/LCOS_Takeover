import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts';
import type { Gen2Host } from '../../lcos/apps/web-gen2/src/host/projectionFacade.ts';
import { readNativeMaterialVersion, assertNativeMaterialOriginVersion } from './native-material-placement.ts';
import { nativeCollectionSavedPlacementMatches } from './native-collection-save-precision.mjs';

type Row = Record<string, any>;
export type NativeMaterialReceiveTarget = { kind: 'main' } | { kind: 'context' | 'workflow' | 'conversation'; id: string };
export interface NativeMaterialReceiveInput {
  projectId: string; artifactId: string; revisionId: string; fileRecordId: string;
  artifactViewId?: string; targetRef: NativeMaterialReceiveTarget; position?: { x: number; y: number };
}
export const nativeMaterialReceiveViewId = (target: NativeMaterialReceiveTarget, artifactId: string, revisionId: string) =>
  'view:native-drop:' + [target.kind, 'id' in target ? target.id : 'root', artifactId, revisionId].map(encodeURIComponent).join(':');

/** Exact material receiver over existing View/Assembly/Presentation/Relation
 * owners. GET observes canonical results; it never repairs or resends a write. */
export function createNativeMaterialReceive({ repository, projectId, projectionHost, spatial, projectNativeNodes, fail }: {
  repository: SqliteMetadataRepository; projectId: string; projectionHost(canvasId: string): Gen2Host;
  spatial: { read(canvasId: string): Promise<any> }; projectNativeNodes(canvasId: string, snapshot: Row): Promise<Row[]>;
  fail(status: number, code: string, message: string): never;
}) {
  const nonEmpty = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
  function facts(canvasId: string, input: NativeMaterialReceiveInput, admit = false) {
    if (!input || input.projectId !== projectId || ![canvasId,input.artifactId,input.revisionId,input.fileRecordId].every(nonEmpty)
      || input.artifactViewId !== undefined && !nonEmpty(input.artifactViewId)
      || Object.keys(input).some(k => !['projectId','artifactId','revisionId','fileRecordId','artifactViewId','targetRef','position'].includes(k)))
      fail(400,'MATERIAL_SOURCE_INVALID','An exact source and existing semantic destination are required.');
    const target = input.targetRef;
    if (!target || typeof target !== 'object' || Array.isArray(target) || !['main','context','workflow','conversation'].includes(target.kind)
      || Object.keys(target).some(k => !['kind','id'].includes(k))
      || target.kind === 'main' && 'id' in target || target.kind !== 'main' && !nonEmpty(target.id))
      fail(400,'MATERIAL_TARGET_INVALID','Select an original root surface or confirmed conversation.');
    if (input.position !== undefined && (target.kind === 'conversation' || !input.position || typeof input.position !== 'object'
      || Array.isArray(input.position) || !Number.isFinite(input.position.x) || !Number.isFinite(input.position.y)
      || Object.keys(input.position).some(k => !['x','y'].includes(k))))
      fail(400,'MATERIAL_POSITION_INVALID','Only a surface receiver accepts a finite released point.');
    const owners = repository.getWorkspaces(projectId).filter(w => w.canvasId === canvasId);
    if (owners.length !== 1) fail(409,'MATERIAL_WORKSPACE_CHANGED','The original Canvas must have one project-owned Workspace.');
    const workspace = owners[0]!, scopes = repository.getScopes(projectId);
    let scopeId: string, presentationId: string | undefined, conversationArtifactId: string | undefined;
    if (target.kind === 'conversation') {
      const connected = repository.getConnectedConversation(projectId,target.id);
      const session = connected?.conversationSessionId
        ? repository.getConversationSessionRuntimeIdentity(projectId,connected.conversationSessionId) : undefined;
      conversationArtifactId = session?.conversationArtifactId;
      if (!connected || connected.conversationRef.startsWith('pending-') || !conversationArtifactId
        || String(repository.getArtifact(conversationArtifactId)?.projectId ?? '') !== projectId)
        fail(409,'MATERIAL_CONVERSATION_UNAVAILABLE','The conversation must have its original linked canonical Artifact.');
      const view = repository.getArtifactViews(conversationArtifactId!).filter(v => v.referenceKind === 'primary'
        && scopes.some(scope => String(scope.id) === String(v.scopeId)));
      if (view.length !== 1) fail(409,'MATERIAL_CONVERSATION_UNAVAILABLE','The linked conversation has no unique original primary View.');
      scopeId = String(view[0]!.scopeId);
      // The original Glyth receiver is a real node, not a guessed same-project session.
      if (!repository.getProjectionBindings(projectId).some(b => b.canvasId === canvasId && b.spatialKind === 'node'
        && b.entityType === 'conversation' && b.entityId === target.id))
        fail(409,'MATERIAL_CONVERSATION_NOT_HERE','The selected conversation is not bound to this original Canvas.');
    } else {
      const scope = target.kind === 'main' ? scopes.find(s => s.kind === 'root') : scopes.find(s => String(s.id) === target.id);
      if (!scope || target.kind !== 'main' && ![target.kind,'root'].includes(scope.kind)
        || String(workspace.scopeId) !== String(scope.id) || workspace.preferredSurface !== target.kind)
        fail(409,'MATERIAL_TARGET_CHANGED','The original Canvas does not own this surface Scope.');
      scopeId = String(scope!.id);
      presentationId = `presentation:${target.kind === 'workflow' ? 'workflow' : 'context'}:${scopeId}`;
    }
    const material = readNativeMaterialVersion({repository,projectId,input,fail,requireRenderer:target.kind !== 'conversation'});
    if (admit) assertNativeMaterialOriginVersion(material,input,fail);
    const viewId = nativeMaterialReceiveViewId(target,input.artifactId,input.revisionId), existing = repository.getArtifactView(viewId);
    if (existing && (String(existing.artifactId) !== input.artifactId || String(existing.scopeId) !== scopeId
      || String(existing.revisionId) !== input.revisionId || existing.referenceKind !== 'explicit_additional'))
      fail(409,'MATERIAL_VIEW_ID_CONFLICT','The existing semantic receiver View has a different exact identity.');
    return {...material,workspace,scopeId,presentationId,conversationArtifactId,viewId,existing};
  }
  const base = (canvasId: string,input: NativeMaterialReceiveInput,f: ReturnType<typeof facts>) => ({project_id:projectId,
    canvas_id:canvasId,workspace_id:String(f.workspace.id),target_ref:input.targetRef,artifact_id:input.artifactId,
    revision_id:input.revisionId,file_record_id:input.fileRecordId,artifact_view_id:f.viewId,provider_execution_started:false});
  async function inspect(canvasId: string,input: NativeMaterialReceiveInput) {
    let f = facts(canvasId,input); const result = base(canvasId,input,f);
    const incomplete = () => ({...result,state:'partial' as const});
    if (!f.existing) { assertNativeMaterialOriginVersion(f,input,fail); return {...result,state:'absent' as const}; }
    if (input.targetRef.kind === 'conversation') {
      const relations = repository.getRelations(projectId).filter(r => r.kind === 'conversation_context'
        && r.sourceEntityType === 'artifact' && String(r.sourceEntityId) === f.conversationArtifactId
        && r.targetEntityType === 'view' && String(r.targetEntityId) === f.viewId);
      if (relations.length > 1) fail(409,'MATERIAL_RELATION_AMBIGUOUS','More than one original context relation matches this exact View.');
      return relations.length === 1 ? {...result,state:'present' as const,relation:relations[0]} : incomplete();
    }
    const presentation = repository.getPresentationView(projectId,f.presentationId!);
    if (presentation && (String(presentation.scopeId) !== f.scopeId || presentation.projectId !== projectId
      || presentation.capability !== (input.targetRef.kind === 'workflow' ? 'workflow' : 'context')))
      fail(409,'MATERIAL_TARGET_CHANGED','The original Presentation has a different canonical address.');
    if (!presentation || !presentation.state.memberViewIds.includes(f.viewId)) return incomplete();
    const bindings = repository.getProjectionBindings(projectId).filter(b => b.canvasId === canvasId && b.spatialKind === 'node'
      && b.entityType === 'view' && b.entityId === f.viewId);
    if (bindings.length > 1) fail(409,'MATERIAL_PROJECTION_AMBIGUOUS','Several original carriers match the same semantic receiver View.');
    if (!bindings.length) return incomplete();
    const binding = bindings[0]!, saved = await spatial.read(canvasId);
    f = facts(canvasId,input); // Recheck target/identity after asynchronous read.
    if (!saved?.state?.nodes?.some((n:Row) => n.id === binding.spatialId)) return incomplete();
    const nodes = (await projectNativeNodes(canvasId,saved)).filter(n => n.id === binding.spatialId), node = nodes[0],ref=node?.data?.lcos_ref;
    f = facts(canvasId,input);
    const currentPresentation=repository.getPresentationView(projectId,f.presentationId!);
    if (nodes.length !== 1 || !['text','image'].includes(node?.type) || node.data?.id !== node.id || ref?.version !== 1
      || ref.entityType !== binding.entityType || ref.entityId !== binding.entityId || ref.artifactId !== input.artifactId
      || ref.revisionId !== input.revisionId || ref.artifactViewId !== f.viewId
      || !repository.getProjectionBindings(projectId).some(current => current.canvasId === canvasId
        && current.spatialKind === 'node' && current.spatialId === binding.spatialId
        && current.entityType === 'view' && current.entityId === f.viewId)
      || !currentPresentation?.state.memberViewIds.includes(f.viewId))
      fail(409,'MATERIAL_PROJECTION_CHANGED','The canonical surface and real carrier do not agree on the selected exact version.');
    const placement=currentPresentation.state.positions[f.viewId];
    if (placement && !nativeCollectionSavedPlacementMatches(node.position,placement)) return incomplete();
    return {...result,state:'present' as const,presentation:currentPresentation,binding,node};
  }
  async function receive(canvasId: string,input: NativeMaterialReceiveInput) {
    const old=await inspect(canvasId,input);
    if (old.state === 'present') return {...old,already_present:true};
    if (old.state === 'partial') fail(409,'MATERIAL_PLACEMENT_UNCONFIRMED','The original receiver is partly recorded. Inspect it; do not replay the write.');
    const f=facts(canvasId,input,true),host=projectionHost(canvasId);
    await host.artifacts.getFileRecordContent(projectId,input.fileRecordId); facts(canvasId,input,true);
    const view=await host.artifacts.putArtifactView(projectId,{id:f.viewId as never,artifactId:f.artifact.id,scopeId:f.scopeId as never,
      revisionId:f.revision.id,referenceKind:'explicit_additional',position:input.position ?? {x:0,y:0},
      size:f.artifact.kind === 'image' ? {width:360,height:240}:{width:360,height:280},
      displayMode:f.artifact.kind === 'image' ? 'thumbnail':'card',collapsed:false});
    facts(canvasId,input,true);
    const assemblyReceipt=await host.assembly.apply(projectId,{schemaVersion:1,projectId,
      sourceRefs:[{kind:'artifactView',id:f.viewId}],targetRef:input.targetRef,
      ...(input.position ? {placementBySource:{[f.viewId]:input.position}}:{})});
    const item=assemblyReceipt.results?.[0];
    if (assemblyReceipt.projectId !== projectId || assemblyReceipt.results.length !== 1 || item?.sourceRef.kind !== 'artifactView'
      || item.sourceRef.id !== f.viewId || !(item.status === 'applied'
        && item.channel === (input.targetRef.kind === 'conversation' ? 'relation':'presentation-membership')
        || item.status === 'skipped' && item.channel === 'already-member'))
      fail(409,'MATERIAL_MEMBERSHIP_UNCONFIRMED','The original semantic owner did not confirm the exact pinned View.');
    facts(canvasId,input);
    if (input.targetRef.kind !== 'conversation') await host.nodeProjector.projectEntity({projectId,entityType:'view',entityId:f.viewId,
      kind:f.artifact.kind as 'text'|'markdown'|'image',title:f.artifact.title,mimeType:f.file.mimeType,
      currentRevisionId:input.revisionId,fileRecordId:input.fileRecordId,position:input.position,size:view.size,
      displayMode:view.displayMode,revisionStatus:f.revision.status});
    const result=await inspect(canvasId,input);
    if (result.state !== 'present') fail(409,'MATERIAL_RECEIVE_UNCONFIRMED','The real semantic result has not been read back. No successful receipt was fabricated.');
    return {...result,already_present:false,assembly_receipt:assemblyReceipt,
      ...(item.changeSetId ? {change_set_id:item.changeSetId}:{})};
  }
  return {inspect,receive};
}
