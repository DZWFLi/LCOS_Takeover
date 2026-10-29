import type { WarehouseItemV1 } from '../../lcos/packages/contracts/src/index.ts';

const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/** Native asset identity is presentation only; the Warehouse row remains the source. */
export function nativeAssemblyItem(detail: unknown, projectId: string): WarehouseItemV1 {
  if (!record(detail) || !record(detail.asset)) throw new Error('先选一份已有材料。');
  const asset = detail.asset, projection = asset.lcos_projection, item = projection?.assembly_item;
  if (!record(projection) || projection.project_id !== projectId || !record(item)
    || item.kind !== 'artifact' || item.entityRef?.type !== 'artifact' || !text(item.entityRef.id)
    || asset.id !== item.entityRef.id || projection.artifact_id !== item.entityRef.id
    || !text(item.presentedRevisionId) || projection.presented_revision_id !== item.presentedRevisionId
    || !text(projection.file_record_id)
    || projection.content_available !== true || projection.referenceable !== true
    || (item.entityRef.viewId && projection.artifact_view_id !== item.entityRef.viewId)) {
    throw new Error('原材料、视图或版本尚未对应，未改建画布节点。');
  }
  return item as unknown as WarehouseItemV1;
}

/** Historical revisions are legal Artifact references, never a fabricated current View. */
export function nativeAssemblyVersion(item: WarehouseItemV1, revisionId: string, mimeType: string): WarehouseItemV1 {
  if (item.kind !== 'artifact' || !text(revisionId)) throw new Error('材料版本未确认。');
  return { ...item, entityRef: { type: 'artifact', id: item.entityRef.id,
    ...(revisionId === item.presentedRevisionId && item.entityRef.viewId ? { viewId: item.entityRef.viewId } : {}) },
    presentedRevisionId: revisionId, mimeType };
}

/** Recheck the exact original graph before changing a message's transient references. */
export function verifyNativeAssemblyVersion(graph: any, projectId: string, item: WarehouseItemV1,
  fileRecordId: string): void {
  const artifact = graph?.artifacts?.find((row: any) => row.id === item.entityRef.id);
  const revision = graph?.artifactRevisions?.find((row: any) => row.id === item.presentedRevisionId && row.artifactId === item.entityRef.id);
  const file = graph?.fileRecords?.find((row: any) => row.id === fileRecordId);
  const view = item.entityRef.viewId ? graph?.artifactViews?.find((row: any) => row.id === item.entityRef.viewId) : undefined;
  if (String(graph?.project?.id) !== projectId || !artifact || String(artifact.projectId) !== projectId
    || artifact.archivedAt !== undefined || !revision || revision.status === 'draft' || revision.fileRecordId !== fileRecordId
    || !file || String(file.projectId) !== projectId || file.availability !== 'current'
    || file.observedHash !== revision.contentHash
    || item.entityRef.viewId && (!view || view.artifactId !== artifact.id || view.revisionId !== revision.id
      || !graph.scopes?.some((scope: any) => scope.id === view.scopeId && String(scope.projectId) === projectId))) {
    throw new Error('所选材料的准确版本已不可用；原输入与材料保留，未替换成 Current。');
  }
}

export function sameNativeAssemblyInput(before: { key?: string; messageId?: string; continuationOperationId?: string },
  after: { key?: string; messageId?: string; continuationOperationId?: string }): boolean {
  return !!before.key && before.key === after.key && before.messageId === after.messageId
    && before.continuationOperationId === after.continuationOperationId;
}
