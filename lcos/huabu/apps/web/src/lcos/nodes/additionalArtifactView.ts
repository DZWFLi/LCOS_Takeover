import { describeProjectedEntity, additionalArtifactViews } from '@local-creative-os/web-gen2';

import { getAbsolutePosition } from '@huabu/shared/canvas-engine';

import useCanvasStore from '@/store/canvasStore';

import { snapshotDraftReference } from '../composer/referenceSnapshot';
import { useLcosHostStore } from '../host/lcosHostState';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { waitForProjectedEntity } from '../navigation/waitForProjectedEntity';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type { LcosNodeEntityRef } from '../lcosReferenceState';
import type { ArtifactView, ArtifactViewId,ArtifactRevisionId,ScopeId } from '@local-creative-os/domain';

export interface CopiedArtifactView {readonly projectId:string;readonly sourceNodeId:string;readonly reference:LcosNodeEntityRef;readonly position:{x:number;y:number};readonly size:{width:number;height:number};readonly textFace?:'text'|'outline'|'mindmap';readonly collapsedIds?:readonly string[]}
export function snapshotCopiedArtifactView(nodeId:string):CopiedArtifactView {
  const canvas=useCanvasStore.getState(),refs=useLcosReferenceStore.getState();
  const node=canvas.nodes.find(item=>item.id===nodeId),ref=refs.nodeEntityRefs.get(nodeId);
  if(!node || !refs.projectId || ref?.entityType!=='artifact')throw new Error('所选对象不是可追加引用的项目材料。');
  const reference=snapshotDraftReference(ref),position=getAbsolutePosition(canvas.nodes,nodeId);
  if(!position || !reference.artifactViewId || !reference.revisionId)throw new Error('材料的原 View 与版本尚未读回，未复制成无身份节点。');
  const width=Number(node.style?.width ?? node.width ?? node.measured?.width),height=Number(node.style?.height ?? node.height ?? node.measured?.height);
  const face=node.data.lcosTextViewMode;
  const collapsed=node.data.lcosTextCollapsedIds;
  return {projectId:refs.projectId,sourceNodeId:nodeId,reference,position,
    ...(face==='text'||face==='outline'||face==='mindmap'?{textFace:face}:{}),
    ...(Array.isArray(collapsed)?{collapsedIds:collapsed.filter((id):id is string=>typeof id==='string')}:{}),
    size:{width:Number.isFinite(width)&&width>0?width:244,height:Number.isFinite(height)&&height>0?height:150}};
}

/** Existing full ArtifactView PUT is the producer. Both identity and pinned
 * revision are checked before the independent View binding is projected. */
export async function createAdditionalArtifactView(input:CopiedArtifactView,position:{x:number;y:number}):Promise<string|undefined>{
  const host=useLcosHostStore.getState().host,canvasId=useCanvasStore.getState().canvasId,shell=useLcosShellStore.getState();
  if(!host || !canvasId || host.projectId!==input.projectId || shell.projectId!==input.projectId)throw new Error('追加引用只在同一真实项目现场创建，未克隆原节点。');
  const workspaceId=shell.activeWorkspaceId;
  const current=()=>useLcosHostStore.getState().host===host && useCanvasStore.getState().canvasId===canvasId && useLcosShellStore.getState().activeWorkspaceId===workspaceId;
  const graph=await host.projects.getProjectGraph(input.projectId);
  const workspace=graph?.workspaces.find(item=>String(item.id)===workspaceId && item.canvasId===canvasId);
  const artifact=graph?.artifacts.find(item=>String(item.id)===input.reference.entityId && item.archivedAt===undefined);
  const original=graph?.artifactViews.find(view=>String(view.id)===input.reference.artifactViewId && String(view.artifactId)===input.reference.entityId);
  const revision=graph?.artifactRevisions.find(item=>String(item.id)===input.reference.revisionId && String(item.artifactId)===input.reference.entityId);
  if(!graph || !workspace || !artifact || !original || !revision || !current())throw new Error('原材料、原 View、原版本或目标现场已不可读取，未改用 Current。');
  const view:ArtifactView={...original,id:`view-${crypto.randomUUID()}` as ArtifactViewId,scopeId:String(workspace.scopeId) as ScopeId,
    revisionId:String(revision.id) as ArtifactRevisionId,referenceKind:'explicit_additional',position,size:input.size};
  try {
    const saved=await host.artifacts.putArtifactView(input.projectId,view);
    if(String(saved.id)!==String(view.id) || String(saved.artifactId)!==input.reference.entityId || String(saved.scopeId)!==String(view.scopeId)
      || String(saved.revisionId)!==input.reference.revisionId || saved.referenceKind!=='explicit_additional')throw new Error('追加 View 回执未确认，请先查看已有引用。');
    if(!current())return undefined;
    const confirmed={...graph,artifactViews:[...graph.artifactViews.filter(item=>String(item.id)!==String(saved.id)),saved]};
    const entry=additionalArtifactViews(confirmed,[saved],new Map()).entries[0];if(!entry)throw new Error('追加引用版本不可读取，已保存 View 但未伪造节点。');
    const binding=await host.nodeProjector.projectEntity(entry.source);
    if(current()){
      useLcosReferenceStore.getState().registerNodeEntity(binding.spatialId,{entityType:'artifact',entityId:input.reference.entityId,
        descriptor:describeProjectedEntity(entry.facts)});
      useLcosReferenceStore.getState().requestNodeBindingRefresh();
    }
    const shown=await waitForProjectedEntity({projectId:input.projectId,canvasId,entityType:'artifact',entityId:input.reference.entityId,nodeId:binding.spatialId});
    if(shown && current() && input.textFace)useCanvasStore.getState().updateNodeData(shown,{lcosTextViewMode:input.textFace,
      ...(input.collapsedIds?{lcosTextCollapsedIds:input.collapsedIds}: {})});
    return shown;
  } finally {host.notifyMutationSuccess();}
}
