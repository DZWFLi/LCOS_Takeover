import type { ProjectGraphSnapshot } from '@local-creative-os/contracts';
import type { ArtifactView } from '@local-creative-os/domain';
import type { ProjectedEntityFacts } from '../presentation/projectedNodeDescriptor.js';
import type { SpaceEntityProjectionSource } from './projectToSpaceProjection.js';

/** Additional occurrences reuse canonical View identities, never overwrite the
 * one artifact binding used by existing relation and foreground consumers. */
export function additionalArtifactViews(graph:ProjectGraphSnapshot|undefined,views:readonly ArtifactView[],
  defaults:ReadonlyMap<string,{viewId:string}>,boundViewIds:ReadonlySet<string>=new Set()) {
  const entries:{source:SpaceEntityProjectionSource;facts:ProjectedEntityFacts}[]=[];
  const failures:{viewId:string;message:string}[]=[];
  const unavailableFacts:ProjectedEntityFacts[]=[];
  for(const view of views){
    if(view.referenceKind!=='explicit_additional' || defaults.get(String(view.artifactId))?.viewId===String(view.id)
      && !boundViewIds.has(String(view.id)))continue;
    const artifact=graph?.artifacts.find(item=>String(item.id)===String(view.artifactId) && item.archivedAt===undefined);
    if(!artifact)continue;
    const revisionId=view.revisionId===undefined ? artifact.currentRevisionId : view.revisionId;
    const revision=graph?.artifactRevisions?.find(item=>String(item.id)===String(revisionId) && String(item.artifactId)===String(artifact.id));
    if(!revision){failures.push({viewId:String(view.id),message:'追加引用的原版本不可读取，未改用 Current。'});
      // Preserve an existing occurrence's exact address as unavailable; it must
      // neither spin forever waiting for facts nor read another revision.
      unavailableFacts.push({entityType:'artifact',entityId:String(artifact.id),title:artifact.title,artifactKind:artifact.kind,
        managed:artifact.managed,availability:'missing',currentRevisionId:artifact.currentRevisionId===undefined?undefined:String(artifact.currentRevisionId),
        presentedRevisionId:revisionId===undefined?undefined:String(revisionId),artifactViewId:String(view.id),artifactViewReferenceKind:'explicit_additional'});
      continue;}
    const file=graph?.fileRecords?.find(item=>String(item.id)===String(revision.fileRecordId) && String(item.projectId)===String(artifact.projectId));
    const kind=['image','pdf','presentation','markdown','text','file'].includes(artifact.kind) ? artifact.kind as SpaceEntityProjectionSource['kind'] : 'other';
    entries.push({source:{projectId:String(artifact.projectId),entityType:'view',entityId:String(view.id),kind,title:artifact.title,
      fileRecordId:String(revision.fileRecordId),currentRevisionId:String(revision.id),managed:artifact.managed,revisionStatus:revision.status,
      sourceRunId:revision.runId===undefined?undefined:String(revision.runId),mimeType:file?.mimeType,size:view.size,displayMode:view.displayMode,position:view.position},
      facts:{entityType:'artifact',entityId:String(artifact.id),title:artifact.title,artifactKind:artifact.kind,managed:artifact.managed,
        availability:artifact.availability,currentRevisionId:artifact.currentRevisionId===undefined?undefined:String(artifact.currentRevisionId),
        presentedRevisionId:String(revision.id),artifactViewId:String(view.id),artifactViewReferenceKind:'explicit_additional',
        revisionStatus:revision.status,sourceRunId:revision.runId===undefined?undefined:String(revision.runId),fileRecordId:String(revision.fileRecordId),mimeType:file?.mimeType}});
  }
  return {entries,failures,unavailableFacts};
}
