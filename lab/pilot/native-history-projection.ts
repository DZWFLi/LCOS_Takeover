import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository';

export const nativeHistoryPath = '/api/conversation/v1/me/generation-history';
type Repository = Pick<SqliteMetadataRepository, 'getProject' | 'getArtifacts' | 'getArtifactRevisions' | 'getFileRecord'
  | 'getRun' | 'getWorkspaces' | 'listWorkspaceMembers' | 'getArtifactView' | 'getProjectionBindings'>;
export type NativeHistoryType = 'image' | 'video' | 'audio' | 'threed' | 'text' | 'other';
export interface NativeHistoryReference {
  version: 1; projectId: string; artifactId: string; revisionId: string; fileRecordId: string;
  title: string; mimeType: string; status: string; source: string; runId?: string;
  archived: boolean; readable: boolean; placeable: boolean; unavailableReason?: string;
}
export interface NativeHistoryItem {
  id: string; generation_type: NativeHistoryType; generation_id?: string; file_url: string;
  prompt: string; created_at: string; lcos_history: NativeHistoryReference;
}
export function nativeHistoryType(mimeType: string | undefined): NativeHistoryType {
  const mime = mimeType?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('model/')) return 'threed';
  if (mime.startsWith('text/') || ['application/json', 'application/yaml', 'application/xml'].includes(mime)) return 'text';
  return 'other';
}
const kinds = new Set<NativeHistoryType>(['image', 'video', 'audio', 'threed', 'text', 'other']);
const fail = (status: number, code: string, message: string) => ({ status, body: { code: status * 100, msg: message,
  message, data: null, error: { code, message } } });

/** Read the existing version journal. The original transport calls these rows
 * generation-history, but imported/external versions never acquire a fake Run. */
export function createNativeHistoryProjection({ repository, projectId, publicOrigin }: {
  repository: Repository; projectId: string; publicOrigin: string;
}) {
  return async ({ method = 'GET', pathname, url }: { method?: string; pathname?: string; url?: string | URL }) => {
    const address = url instanceof URL ? url : new URL(url || pathname || '/', publicOrigin);
    if ((pathname ?? address.pathname) !== nativeHistoryPath) return null;
    if (method.toUpperCase() !== 'GET') return fail(501, 'HISTORY_WRITE_NOT_CONNECTED', 'History is read from existing material versions.');
    if (!repository.getProject(projectId)) return fail(404, 'PROJECT_NOT_FOUND', 'The current project is unavailable.');
    const params = address.searchParams;
    const type = params.get('generation_type') ?? 'image';
    const order = params.get('sort_order') ?? 'desc';
    const offset = Number(params.get('offset') ?? 0), limit = Number(params.get('limit') ?? 30);
    if (!kinds.has(type as NativeHistoryType) || !['asc', 'desc'].includes(order)
      || (params.get('sort_by') ?? 'created_at') !== 'created_at')
      return fail(400, 'HISTORY_QUERY_INVALID', 'Use the existing history type and creation-time ordering.');
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200
      || !Number.isSafeInteger(offset + limit)) return fail(400, 'HISTORY_PAGINATION_INVALID', 'Use bounded history pagination.');
    const canvasId = params.get('canvas_id');
    if (canvasId !== null && !canvasId.trim()) return fail(400, 'HISTORY_CANVAS_INVALID', 'An exact current Canvas is required.');
    const workspace = canvasId === null ? undefined : repository.getWorkspaces(projectId).filter(row => row.canvasId === canvasId);
    if (workspace && (workspace.length !== 1 || String(workspace[0]!.projectId) !== projectId))
      return fail(404, 'HISTORY_CANVAS_NOT_FOUND', 'This Canvas does not belong to the current project.');
    const site = workspace?.[0];
    const memberViewIds = new Set(site ? repository.listWorkspaceMembers(site.id).map(row => String(row.artifactViewId)) : []);
    const bindings = site ? repository.getProjectionBindings(projectId).filter(row => row.canvasId === canvasId && row.spatialKind === 'node') : [];
    const query = (params.get('search') ?? '').trim().toLocaleLowerCase();
    const items: NativeHistoryItem[] = [];
    for (const artifact of repository.getArtifacts(projectId)) {
      if (String(artifact.projectId) !== projectId) continue;
      const revisions = repository.getArtifactRevisions(String(artifact.id));
      for (const revision of revisions) {
        if (String(revision.artifactId) !== String(artifact.id)) continue;
        const file = repository.getFileRecord(String(revision.fileRecordId));
        // A foreign FileRecord/Run is an invalid relationship, never a readable
        // local history entry with someone else's URL or task attribution.
        if (file && String(file.projectId) !== projectId) continue;
        const run = revision.runId ? repository.getRun(revision.runId) : undefined;
        if (run && String(run.projectId) !== projectId) continue;
        const mime = file?.mimeType ?? '';
        const mediaType = nativeHistoryType(mime);
        if (mediaType !== type) continue;
        if (site) {
          // The filter chooses material membership, never substitutes the
          // revision being listed. A material's earlier versions remain part
          // of its history after its primary View advances to Current.
          const materialViewHere = [...memberViewIds].some(id => {
            const view = repository.getArtifactView(id);
            return view && String(view.artifactId) === String(artifact.id)
              && String(view.scopeId) === String(site.scopeId);
          });
          const materialCarrierHere = bindings.some(binding => {
            if (binding.entityType === 'artifact') return binding.entityId === String(artifact.id);
            if (binding.entityType !== 'view') return false;
            const view = repository.getArtifactView(binding.entityId);
            return view && String(view.artifactId) === String(artifact.id) && String(view.scopeId) === String(site.scopeId);
          });
          if (!materialViewHere && !materialCarrierHere && String(run?.workspaceId ?? '') !== String(site.id)) continue;
        }
        const archived = artifact.archivedAt !== undefined;
        const readable = !!file && file.availability === 'current' && !!mime && !!revision.contentHash
          && file.observedHash === revision.contentHash;
        const placeable = readable && !archived && revision.status !== 'draft'
          && (mediaType === 'image' && artifact.kind === 'image'
            || mediaType === 'text' && ['text', 'markdown'].includes(artifact.kind));
        const unavailableReason = !readable ? '此版本的原文件暂不可读'
          : archived ? '已归档版本可以阅读，恢复后再放到画布'
            : revision.status === 'draft' ? '待确认版本请在原任务中处理'
              : !placeable ? '此格式的画布投放尚未接入' : undefined;
        const role = revision.status === 'draft' ? '待确认版本'
          : String(artifact.currentRevisionId ?? '') === String(revision.id) ? '当前版本' : '历史版本';
        const label = [artifact.title, role, archived ? '已归档' : '', !readable ? '原文件暂不可读' : '',
          revision.runId && !run ? '来源任务暂不可读' : ''].filter(Boolean).join(' · ');
        if (query && ![artifact.title, label, run?.shortSummary ?? '', run?.resultSummary ?? ''].some(value => value.toLocaleLowerCase().includes(query))) continue;
        const reference: NativeHistoryReference = { version: 1, projectId, artifactId: String(artifact.id), revisionId: String(revision.id),
          fileRecordId: String(revision.fileRecordId), title: artifact.title, mimeType: mime, status: revision.status,
          source: revision.source, ...(run ? { runId: String(run.id) } : {}), archived, readable, placeable,
          ...(unavailableReason ? { unavailableReason } : {}) };
        items.push({ id: String(revision.id), generation_type: mediaType, ...(run ? { generation_id: String(run.id) } : {}),
          file_url: readable ? publicOrigin + '/api/lcos/core/projects/' + encodeURIComponent(projectId)
            + '/file-records/' + encodeURIComponent(String(file!.id)) + '/content' : '',
          prompt: label, created_at: revision.createdAt, lcos_history: reference });
      }
    }
    items.sort((a, b) => (a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)) * (order === 'asc' ? 1 : -1));
    return { status: 200, body: { code: 0, msg: '', message: '', data: { total: items.length,
      items: items.slice(offset, offset + limit) }, lcos_adapter: { source: 'real-core-material-version-journal',
      history_scope: canvasId ? 'current-workspace' : 'current-project', provider_execution_started: false } } };
  };
}
