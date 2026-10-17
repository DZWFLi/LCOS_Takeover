import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts';
import { nativeCollectionSavedPlacementMatches } from './native-collection-save-precision.mjs';

type Row=Record<string,any>;
export interface NativeMaterialGeometryRoot { canvasId:string; workspaceId:string; scopeId:string; surface:'main'|'context'|'workflow' }
type Item={nodeId:string;viewId:string;artifactId:string;revisionId:string;position:{x:number;y:number}};
type Group={canvasId:string;root:NativeMaterialGeometryRoot;presentation:Row;items:Item[]};
export interface NativeMaterialGeometryReceipt { ok:boolean; savedPresentationIds:string[]; changedNodeIds:string[];
  failedPresentationId?:string; code?:string; reason?:string }
/** The existing root mapping admits layout writes; live membership and binding
 * remain canonical. This transient plan lives only in one original HTTP batch. */
export function createNativeMaterialGeometry({repository,projectId,roots,readReference,savePresentation}:{
  repository:SqliteMetadataRepository;projectId:string;roots:readonly NativeMaterialGeometryRoot[];
  readReference(canvasId:string,nodeId:string):Promise<Row|undefined>;
  savePresentation(presentation:Row,positions:Record<string,{x:number;y:number}>):Promise<Row>;
}) {
  const point=(v:any):v is {x:number;y:number}=>!!v&&Number.isFinite(v.x)&&Number.isFinite(v.y);
  function target(canvasId:string) {
    const known=roots.filter(root=>root.canvasId===canvasId),owners=repository.getWorkspaces(projectId).filter(w=>w.canvasId===canvasId);
    if(known.length!==1||owners.length!==1)return undefined;
    const root=known[0]!,w=owners[0]!;
    if(String(w.id)!==root.workspaceId||String(w.scopeId)!==root.scopeId||w.preferredSurface!==root.surface)return undefined;
    const capability=root.surface==='workflow'?'workflow':'context';
    const presentation=repository.getPresentationView(projectId,`presentation:${capability}:${root.scopeId}`);
    if(!presentation||presentation.projectId!==projectId||String(presentation.scopeId)!==root.scopeId||presentation.capability!==capability)return undefined;
    return {root,presentation};
  }
  const conflict=(message:string)=>Object.assign(new Error(message),{code:'MATERIAL_LAYOUT_MEMBER_CHANGED'});
  function identity(canvasId:string,root:NativeMaterialGeometryRoot,presentation:Row,nodeId:string) {
    const bindings=repository.getProjectionBindings(projectId).filter(b=>b.canvasId===canvasId&&b.spatialKind==='node'&&b.spatialId===nodeId);
    const b=bindings[0];if(bindings.length!==1||b?.entityType!=='view')return undefined;
    if(!presentation.state.memberViewIds.includes(b.entityId)||!point(presentation.state.positions[b.entityId]))return undefined;
    const view=repository.getArtifactView(b.entityId),artifact=view?repository.getArtifact(String(view.artifactId)):undefined;
    const revision=view?.revisionId?repository.getArtifactRevision(String(view.revisionId)):undefined;
    if(!view||!artifact||String(artifact.projectId)!==projectId||String(view.scopeId)!==root.scopeId
      ||!revision||String(revision.artifactId)!==String(artifact.id))throw conflict('The identified root member no longer has its exact canonical material identity.');
    return {nodeId,viewId:String(view.id),artifactId:String(artifact.id),revisionId:String(revision.id)};
  }
  const sameIdentity=(a:ReturnType<typeof identity>,b:ReturnType<typeof identity>)=>!!a&&!!b
    &&a.nodeId===b.nodeId&&a.viewId===b.viewId&&a.artifactId===b.artifactId&&a.revisionId===b.revisionId;
  function currentIdentity(canvasId:string,expected:ReturnType<typeof identity>,presentationId:string) {
    const t=target(canvasId);
    if(!expected||!t||t.presentation.id!==presentationId||!sameIdentity(expected,identity(canvasId,t.root,t.presentation,expected.nodeId)))
      throw conflict('The original root material binding or membership changed during its layout operation.');
    return t;
  }
  async function member(canvasId:string,root:NativeMaterialGeometryRoot,presentation:Row,nodeId:string) {
    const expected=identity(canvasId,root,presentation,nodeId);if(!expected)return undefined;
    const ref=await readReference(canvasId,nodeId);
    currentIdentity(canvasId,expected,presentation.id);
    if(ref?.version!==1||ref.entityType!=='view'||ref.entityId!==expected.viewId||ref.artifactId!==expected.artifactId
      ||ref.artifactViewId!==expected.viewId||ref.revisionId!==expected.revisionId)
      throw conflict('The identified root material reference could not be confirmed after its asynchronous read.');
    return expected;
  }
  async function prepare(canvasId:string,geometry:readonly Row[]):Promise<Group[]> {
    const t=target(canvasId);if(!t)return[];const items:Item[]=[];
    for(const item of geometry){
      if(!point(item.position))continue;
      const m=await member(canvasId,t.root,t.presentation,item.nodeId);if(!m)continue;
      if(nativeCollectionSavedPlacementMatches(item.position,t.presentation.state.positions[m.viewId]))continue;
      items.push({...m,position:{x:item.position.x,y:item.position.y}});
    }
    for(const item of items)currentIdentity(canvasId,item,t.presentation.id);
    return items.length?[{canvasId,root:t.root,presentation:t.presentation,items}]:[];
  }
  async function commit(groups:readonly Group[]):Promise<NativeMaterialGeometryReceipt> {
    const receipt:NativeMaterialGeometryReceipt={ok:true,savedPresentationIds:[],changedNodeIds:[]};
    for(const group of groups){
      try{
        const t=target(group.canvasId);
        if(!t||t.presentation.id!==group.presentation.id)throw Object.assign(new Error('Original root Presentation changed after the spatial save.'),{code:'MATERIAL_LAYOUT_OWNER_CHANGED'});
        const positions:Record<string,{x:number;y:number}>={};
        for(const item of group.items){
          const current=await member(group.canvasId,t.root,t.presentation,item.nodeId);
          if(!current||current.viewId!==item.viewId||current.artifactId!==item.artifactId||current.revisionId!==item.revisionId)
            throw Object.assign(new Error('Original material membership or exact binding changed after the spatial save.'),{code:'MATERIAL_LAYOUT_MEMBER_CHANGED'});
          // Exact same-position native retry has no additional Core mutation.
          if(!nativeCollectionSavedPlacementMatches(item.position,t.presentation.state.positions[item.viewId]))positions[item.viewId]=item.position;
        }
        // Later member reads may yield after earlier items were validated.
        // Recheck the entire original group synchronously before its CAS.
        for(const item of group.items)currentIdentity(group.canvasId,item,group.presentation.id);
        if(!Object.keys(positions).length)continue;
        const saved=await savePresentation(group.presentation,positions);
        // The original Core owner has accepted its CAS; keep that fact even if
        // a later readback or a later target fails. Never synthesize rollback.
        receipt.savedPresentationIds.push(group.presentation.id);
        receipt.changedNodeIds.push(...group.items.filter(i=>positions[i.viewId]).map(i=>i.nodeId));
        for(const item of group.items){
          const current=await member(group.canvasId,t.root,target(group.canvasId)?.presentation??t.presentation,item.nodeId);
          if(!sameIdentity(item,current))throw conflict('The material binding changed while the original layout receipt arrived.');
        }
        for(const item of group.items)currentIdentity(group.canvasId,item,group.presentation.id);
        const readback=target(group.canvasId)?.presentation;
        if(!saved||saved.id!==group.presentation.id||saved.projectId!==projectId||!readback
          ||Object.entries(positions).some(([id,p])=>!readback.state.memberViewIds.includes(id)
            ||readback.state.positions[id]?.x!==p.x||readback.state.positions[id]?.y!==p.y))
          throw Object.assign(new Error('The original Presentation position receipt has not been read back.'),{code:'MATERIAL_LAYOUT_READBACK_UNCONFIRMED'});
      }catch(error){
        return {...receipt,ok:false,failedPresentationId:group.presentation.id,
          code:(error as any)?.code??((error as any)?.status===409?'STALE_PRESENTATION_VERSION':'MATERIAL_LAYOUT_UNCONFIRMED'),
          reason:error instanceof Error?error.message:'Original material layout is unconfirmed.'};
      }
    }
    return receipt;
  }
  return {prepare,commit};
}
