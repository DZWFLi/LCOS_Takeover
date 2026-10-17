import type { ArtifactDetailProjection } from '../../lcos/apps/web-gen2/src/backend/artifacts';
import type { ArtifactRevision } from '../../lcos/packages/domain/src/index';
import type { ProjectGraphSnapshot } from '../../lcos/packages/contracts/src/index';
import type { NativeMaterialViewRequest } from './native-material-viewer-port';
import type { NativeTextSavePending } from './native-text-save';

export interface NativeMaterialVersion {
  readonly projectId: string;
  readonly artifactId: string;
  readonly revisionId: string;
  readonly fileRecordId: string;
  readonly artifactViewId?: string;
  readonly title: string;
  readonly mimeType: string;
  readonly createdAt?: string;
  readonly archived: boolean;
  readonly isCurrent: boolean;
  readonly currentRevisionId?: string;
  readonly isDraft: boolean;
  readonly revisions: readonly ArtifactRevision[];
}

/** Enter the original edit content, not permission to write. A lost original
 * save receipt or an unsent draft must remain reachable after Core advances;
 * the editor still verifies its original occurrence and revision before save. */
export function canOpenNativeMaterialMindMap(version: NativeMaterialVersion, input: {
  hasText: boolean; canvasId: string; nodeId?: string; reference?: Readonly<Record<string, unknown>>;
  retainedDraft: boolean; pending?: NativeTextSavePending | null;
}): boolean {
  const ref = input.reference;
  if (!input.hasText || !input.nodeId || version.archived || ref?.version !== 1
    || ref.entityType !== 'artifact' || ref.entityId !== version.artifactId || ref.artifactId !== version.artifactId
    || ref.revisionId !== version.revisionId || typeof ref.artifactViewId !== 'string' || !ref.artifactViewId.trim()
    || version.artifactViewId && ref.artifactViewId !== version.artifactViewId) return false;
  const pending = input.pending;
  return version.isCurrent || input.retainedDraft || !!(pending && pending.canvasId === input.canvasId
    && pending.nodeId === input.nodeId && pending.artifactId === version.artifactId
    && pending.expectedRevisionId === version.revisionId);
}

/** Reader permission is different from Assembly admission: an explicit draft
 * result or archived material remains readable. Never substitute Current when
 * an explicit revision/view is missing or belongs to another artifact. */
export function resolveNativeMaterialVersion(target: NativeMaterialViewRequest, detail: ArtifactDetailProjection,
  revisions: readonly ArtifactRevision[], graph: ProjectGraphSnapshot): NativeMaterialVersion {
  const artifact = detail.artifact;
  if (String(graph.project.id) !== target.projectId || String(artifact.projectId) !== target.projectId
    || String(artifact.id) !== target.artifactId) throw new Error('这份材料不属于当前项目。');
  const view = target.artifactViewId ? graph.artifactViews.find(row => String(row.id) === target.artifactViewId) : undefined;
  if (target.artifactViewId && (!view || String(view.artifactId) !== target.artifactId
    || !graph.scopes.some(scope => String(scope.id) === String(view.scopeId) && String(scope.projectId) === target.projectId)))
    throw new Error('原视图的阅读地址已变化，未打开其他材料。');
  const selected = target.revisionId ?? (view ? String(view.revisionId) : detail.currentRevisionId ?? artifact.currentRevisionId);
  if (!selected || view && String(view.revisionId) !== selected)
    throw new Error('所选视图与版本不一致，未替换为最新版本。');
  const matches = revisions.filter(row => String(row.id) === String(selected) && String(row.artifactId) === target.artifactId);
  if (matches.length !== 1) throw new Error('这个版本暂时无法读取，未替换为最新版本。');
  const revision = matches[0]!;
  const file = graph.fileRecords.find(row => String(row.id) === String(revision.fileRecordId));
  if (!file || String(file.projectId) !== target.projectId || !file.mimeType
    || file.availability !== 'current' || typeof file.observedHash !== 'string' || !file.observedHash
    || typeof revision.contentHash !== 'string' || !revision.contentHash || file.observedHash !== revision.contentHash)
    throw new Error('这个版本的原文件暂时不可读，请重读同一版本。');
  return {
    projectId: target.projectId, artifactId: target.artifactId, revisionId: String(revision.id), fileRecordId: String(file.id),
    ...(view ? { artifactViewId: String(view.id) } : {}), title: artifact.title, mimeType: file.mimeType,
    createdAt: revision.createdAt, archived: artifact.archivedAt !== undefined,
    isCurrent: String(detail.currentRevisionId ?? artifact.currentRevisionId) === String(revision.id),
    currentRevisionId: detail.currentRevisionId ?? artifact.currentRevisionId,
    isDraft: revision.status === 'draft', revisions: revisions.filter(row => String(row.artifactId) === target.artifactId),
  };
}

/** A primary View follows Core Current even if the original Canvas receipt is
 * still unknown. Resume only that occurrence's existing draft/operation using
 * its exact old FileRecord; ordinary pinned reads remain strictly unchanged. */
export function resolveNativeMaterialMindMapRecoveryVersion(target: NativeMaterialViewRequest, detail: ArtifactDetailProjection,
  revisions: readonly ArtifactRevision[], graph: ProjectGraphSnapshot, input: {
    canvasId: string; nodeId: string; reference?: Readonly<Record<string, unknown>>;
    retainedDraft: boolean; pending?: NativeTextSavePending | null;
  }): NativeMaterialVersion {
  const ref = input.reference;
  const view = graph.artifactViews.find(row => String(row.id) === target.artifactViewId);
  if (target.editMode !== 'mindmap' || target.nodeId !== input.nodeId || !target.revisionId
    || target.sourceCanvasId && target.sourceCanvasId !== input.canvasId
    || !target.artifactViewId || ref?.artifactViewId !== target.artifactViewId || !view
    || view.referenceKind !== 'primary' || String(view.artifactId) !== target.artifactId
    || !graph.scopes.some(scope => String(scope.id) === String(view.scopeId) && String(scope.projectId) === target.projectId))
    throw new Error('原导图草稿的位置暂时无法核对，未更换材料或版本。');
  const exact = resolveNativeMaterialVersion({ ...target, artifactViewId: undefined }, detail, revisions, graph);
  const version = { ...exact, artifactViewId: target.artifactViewId };
  // This exceptional resolver always requires recovery evidence, even if
  // some other current fact would normally make an editor readable.
  if (!canOpenNativeMaterialMindMap({ ...version, isCurrent: false }, { ...input, hasText: true }))
    throw new Error('原导图草稿或保存地址暂时无法核对，未授权新的写入。');
  return version;
}

export function nativeMaterialVersionLabel(version: Pick<NativeMaterialVersion, 'isDraft' | 'isCurrent' | 'createdAt'>): string {
  const date = version.createdAt && Number.isFinite(Date.parse(version.createdAt))
    ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(version.createdAt)) : '';
  return [version.isDraft ? '待确认版本' : version.isCurrent ? '当前版本' : '历史版本', date].filter(Boolean).join(' · ');
}
