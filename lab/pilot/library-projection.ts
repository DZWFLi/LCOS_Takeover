import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'

/** Reuses the real metadata owner; only the vendor folder/asset presentation is
 * translated. No cloud library, asset table, or file-name identity is invented. */
export function createLibraryProjection({ repository, projectId, publicOrigin }: {
  repository: SqliteMetadataRepository; projectId: string; publicOrigin: string
}) {
  const folderId = 'lcos-project:' + projectId
  const success = (data: unknown) => ({ status: 200, body: { code: 0, msg: '', message: '', data,
    lcos_adapter: { source: 'real-local-core', core_connected: true, content_bytes_connected: true, billing_connected: false } } })
  const failure = (status: number, code: string, message: string) => ({ status, body: { code: status * 100, data: null, msg: message, message, error: { code, message } } })
  const assets = () => repository.getArtifacts(projectId).filter((artifact) => artifact.archivedAt === undefined).map((artifact) => {
    const revision = artifact.currentRevisionId ? repository.getArtifactRevision(String(artifact.currentRevisionId)) : undefined
    const file = revision ? repository.getFileRecord(String(revision.fileRecordId)) : undefined
    const contentAvailable = !!file && String(file.projectId) === projectId && file.availability === 'current'
    const source = contentAvailable ? publicOrigin + '/api/surface-core/file-records/' + encodeURIComponent(String(file.id)) + '/content' : ''
    return { id: String(artifact.id), folder_id: folderId, name: artifact.title,
      asset_type: artifact.kind === 'image' ? 1 : ['markdown', 'text'].includes(artifact.kind) ? 4 : 0,
      compliance_status: 0, source_url: source, thumbnail_url: artifact.kind === 'image' ? source : '', content: '',
      created_at: artifact.createdAt, updated_at: artifact.updatedAt,
      lcos_projection: { artifact_id: String(artifact.id), project_id: projectId, current_revision_id: revision?.id ?? null,
        file_record_id: file?.id ?? null, availability: artifact.availability, content_available: contentAvailable,
        content_url: source, metadata_only: !contentAvailable, read_only: true, reference_creation_connected: false } }
  }).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))

  return async function handle({ method = 'GET', pathname, url }: { method?: string; pathname?: string; url?: string | URL }) {
    const incoming = url instanceof URL ? url : new URL(url || pathname || '/', publicOrigin)
    const route = pathname || incoming.pathname
    if (!route.startsWith('/api/library/')) return null
    if (method.toUpperCase() !== 'GET') return failure(501, 'LIBRARY_ACTION_NOT_CONNECTED', 'Material deletion and folder mutations require their real Core owner; this projection is read-only.')
    const params = incoming.searchParams
    if (params.get('space_type') && !['SPACE_TYPE_PRIVATE', '1'].includes(params.get('space_type')!)) return failure(501, 'CLOUD_LIBRARY_NOT_CONNECTED', 'Only this isolated local project is connected.')
    const project = repository.getProject(projectId)
    if (!project) return failure(404, 'PROJECT_NOT_FOUND', 'Local project is unavailable.')
    const rows = assets()
    if (route === '/api/library/v1/spaces/SPACE_TYPE_PRIVATE/folders') return success({ folders: [{ id: folderId, name: project.name,
      parent_id: '0', space_type: 'SPACE_TYPE_PRIVATE', asset_count: rows.length,
      lcos_projection: { project_id: projectId, read_only: true, catalog_only: false } }] })
    const folder = /^\/api\/library\/v1\/folders\/([^/]+)\/assets$/.exec(route)
    if (folder && decodeURIComponent(folder[1]!) !== folderId) return failure(404, 'PROJECT_FOLDER_NOT_FOUND', 'Use the folder returned by the local projection.')
    const search = route === '/api/library/v1/assets:search' || route === '/api/library/v1/assets:mention'
    if (!folder && !search) return failure(501, 'LIBRARY_READ_NOT_CONNECTED', 'This library read has no registered mapping.')
    const page = Number(params.get('page') || 1), size = Number(params.get('page_size') || 20)
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || size > 200
      || !Number.isSafeInteger((page - 1) * size)) return failure(400, 'INVALID_PAGINATION', 'Use positive bounded library pagination.')
    const keyword = (params.get('keyword') || '').trim().toLocaleLowerCase()
    const matching = rows.filter((asset) => asset.name.toLocaleLowerCase().includes(keyword))
    const result = matching.slice((page - 1) * size, page * size)
    const pagination = { page, page_size: size, total: matching.length, has_next: page * size < matching.length }
    return success(search ? { items: result.map((asset) => ({ asset, folder_id: folderId, folder_name: project.name, folder_display_path: project.name })), pagination }
      : { assets: result, pagination })
  }
}
