import type { ArtifactDetailProjection, CanvasTextSnapshot } from '../../lcos/apps/web-gen2/src/backend/artifacts.ts';
import type { ProjectedEntityFacts } from '../../lcos/apps/web-gen2/src/presentation/projectedNodeDescriptor.ts';
import type { LcosNodeRefV1 } from './node-lifecycle.ts';

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Read only the explicit lifecycle receipt; a spatial ID is never a Core ID. */
export function readNativeTextReference(value: unknown): LcosNodeRefV1 | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const ref = value as Record<string, unknown>;
  if (ref.version !== 1 || !['artifact', 'view'].includes(String(ref.entityType))
    || !['entityId', 'artifactId', 'artifactViewId', 'revisionId'].every(key => nonEmpty(ref[key]))
    || ref.entityType === 'artifact' && ref.entityId !== ref.artifactId
    || ref.entityType === 'view' && ref.entityId !== ref.artifactViewId) return undefined;
  return { version: 1, entityType: ref.entityType as 'artifact' | 'view', entityId: String(ref.entityId),
    artifactId: String(ref.artifactId), artifactViewId: String(ref.artifactViewId), revisionId: String(ref.revisionId) };
}

export function nativeTextFacts(input: {
  readonly projectId: string; readonly canvasId: string; readonly nodeId: string;
  readonly reference: LcosNodeRefV1; readonly detail: ArtifactDetailProjection;
  readonly text: CanvasTextSnapshot | null;
}): ProjectedEntityFacts {
  const { projectId, canvasId, nodeId, reference, detail, text } = input;
  const artifact = detail.artifact;
  if (reference.entityType !== 'artifact' || !text || text.projectId !== projectId
    || text.canvasId !== canvasId || text.spatialId !== nodeId || text.artifactId !== reference.artifactId
    || text.viewId !== reference.artifactViewId || String(artifact?.id) !== reference.artifactId
    || String(artifact?.projectId) !== projectId || artifact.managed !== true || artifact.archivedAt !== undefined
    || !['text', 'markdown'].includes(artifact.kind) || String(artifact.currentRevisionId) !== text.revisionId) {
    throw new Error('原节点、材料或正文版本尚未一致，未另建正文或切换材料。');
  }
  return { entityType: 'artifact', entityId: text.artifactId, title: text.title, artifactKind: artifact.kind,
    managed: artifact.managed, availability: artifact.availability, currentRevisionId: text.revisionId,
    presentedRevisionId: text.revisionId, revisionStatus: 'current', artifactViewId: text.viewId,
    fileRecordId: text.fileRecordId, canvasTextEditable: true, preview: text.body };
}

/** The original measured world size is the density input, never a second layout. */
export function nativeTextWorldSize(node: Readonly<Record<string, unknown>> | undefined,
  width?: number, height?: number): { width: number; height: number } {
  const measured = node?.measured as { width?: unknown; height?: unknown } | undefined;
  const style = node?.style as { width?: unknown; height?: unknown } | undefined;
  const dimension = (values: unknown[], fallback: number) => values.find(value => typeof value === 'number'
    && Number.isFinite(value) && value > 0) as number | undefined ?? fallback;
  return { width: dimension([width, measured?.width, node?.width, style?.width], 300),
    height: dimension([height, measured?.height, node?.height, style?.height], 200) };
}
