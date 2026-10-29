import { AdapterError } from './core-read.mjs';

export const projectFolderId = id => 'lcos-project:' + id;
export function projectIdFromFolder(folderId) {
  if (!folderId.startsWith('lcos-project:') || !folderId.slice(13)) {
    throw new AdapterError(400, 'PROJECT_FOLDER_REQUIRED', 'Use a folder ID returned by the LCOS project projection.');
  }
  return folderId.slice(13);
}
export function assertRecords(value, fields, label) {
  if (!Array.isArray(value) || value.some(row => !row || fields.some(key => typeof row[key] !== 'string' || !row[key]))) {
    throw new AdapterError(502, 'CORE_RESPONSE_INVALID', label + ' records are invalid.');
  }
  return value;
}
export function projectToCanvas(project) {
  return { id: projectFolderId(project.id), name: project.name, type: 'canvas', parent_id: null,
    updated_at: project.lastOpenedAt ?? null,
    lcos_projection: { project_id: project.id, catalog_only: true, navigation_supported: false,
      timestamp_semantics: 'lastOpenedAt, not content updatedAt' } };
}
export function projectToFolder(project, assetCount) {
  return { id: projectFolderId(project.id), name: project.name, parent_id: '0',
    space_type: 'SPACE_TYPE_PRIVATE', asset_count: assetCount,
    lcos_projection: { project_id: project.id, catalog_only: true, read_only: true } };
}
export function artifactToAsset(artifact, revisions = []) {
  const current = revisions.find(revision => revision.id === artifact.currentRevisionId && revision.artifactId === artifact.id);
  return { id: artifact.id, folder_id: projectFolderId(artifact.projectId), name: artifact.title,
    asset_type: artifact.kind === 'image' ? 1 : artifact.kind === 'markdown' ? 4 : 0,
    compliance_status: 0, source_url: '', thumbnail_url: '', content: '',
    created_at: artifact.createdAt, updated_at: artifact.updatedAt,
    lcos_projection: { artifact_id: artifact.id, project_id: artifact.projectId,
      current_revision_id: artifact.currentRevisionId ?? null, file_record_id: current?.fileRecordId ?? null,
      availability: artifact.availability, current_revision_available: Boolean(current),
      content_available: false, metadata_only: true, read_only: true } };
}
export function nonNegativeInt(params, key, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const value = params.get(key);
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
    throw new AdapterError(400, 'INVALID_ARGUMENT', key + ' must be a bounded nonnegative integer.');
  }
  return Number(value);
}
export function libraryPagination(assets, params) {
  const page = nonNegativeInt(params, 'page', 1);
  const pageSize = nonNegativeInt(params, 'page_size', 20, 200);
  if (!page || !pageSize) throw new AdapterError(400, 'INVALID_ARGUMENT', 'page and page_size must be positive.');
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) throw new AdapterError(400, 'INVALID_ARGUMENT', 'Page offset is too large.');
  return { assets: assets.slice(offset, offset + pageSize), pagination: {
    page, page_size: pageSize, total: assets.length, has_next: offset + pageSize < assets.length } };
}
