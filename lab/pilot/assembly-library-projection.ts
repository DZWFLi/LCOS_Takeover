import type { WarehouseItemV1, WarehouseQueryV1 } from '@local-creative-os/contracts'
import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'
import { WarehouseService } from '../../lcos/apps/local-core/src/warehouse-service.ts'
import { resolveVisualFamily } from '../../lcos/apps/web-gen2/src/presentation/visualFamily.ts'

type ProjectionResponse = { status: number; body: Record<string, unknown> }

class ProjectionFault extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

function decodeSegment(value: string): string | undefined {
  try { return decodeURIComponent(value) } catch { return undefined }
}

/** Translate the existing Core MIME resolver into Warehouse's family vocabulary.
 * Historical selection deliberately uses MIME only: unknown MIME must not inherit
 * the current revision's family or be inferred from an Artifact title/path. */
function visualFamilyForExactMime(mimeType: string | undefined): WarehouseItemV1['visualFamily'] {
  if (!mimeType?.trim()) return undefined
  const mime = mimeType.toLowerCase().split(';', 1)[0]?.trim() ?? ''
  switch (resolveVisualFamily({ entityType: 'artifact', mimeType: mime })) {
    case 'image': return 'image'
    case 'video': return 'video'
    case 'audio': return 'audio'
    case 'text': return 'markdown'
    case 'document':
      if (mime === 'application/pdf') return 'pdf'
      if (mime.includes('presentation')) return 'ppt'
      return undefined
    default: return undefined
  }
}

function nativeTypeFilter(value: string | null): WarehouseQueryV1['materialFilter'] | undefined {
  if (value === null) return undefined
  switch (value.trim().toLocaleUpperCase('en-US')) {
    case '0':
    case 'UNSPECIFIED':
    case 'ASSET_TYPE_UNSPECIFIED':
      return undefined
    case '1':
    case 'IMAGE':
    case 'ASSET_TYPE_IMAGE':
      return 'image'
    case '4':
    case 'TEXT':
    case 'ASSET_TYPE_TEXT':
      return 'text'
    case '2':
    case 'VIDEO':
    case 'ASSET_TYPE_VIDEO':
    case '3':
    case 'AUDIO':
    case 'ASSET_TYPE_AUDIO':
      throw new ProjectionFault(501, 'LIBRARY_TYPE_FILTER_NOT_CONNECTED', 'Core Warehouse can filter media together, but cannot separate video from audio.')
    default:
      throw new ProjectionFault(400, 'INVALID_TYPE_FILTER', 'Use a supported native Library type_filter value.')
  }
}

/** Opt-in read adapter for the native TapNow Library list and asset detail routes.
 * The old createLibraryProjection remains the compatibility owner; this one
 * carries the Core Warehouse row and exact Artifact/View/Revision identity. */
export function createAssemblyLibraryProjection({ repository, projectId, publicOrigin }: {
  repository: SqliteMetadataRepository; projectId: string; publicOrigin: string
}) {
  const folderId = 'lcos-project:' + projectId
  const warehouse = new WarehouseService(repository)
  const success = (data: unknown): ProjectionResponse => ({ status: 200, body: { code: 0, msg: '', message: '', data,
    lcos_adapter: { source: 'real-local-core-warehouse', core_connected: true, content_bytes_connected: true, billing_connected: false } } })
  const failure = (status: number, code: string, message: string): ProjectionResponse => ({ status,
    body: { code: status * 100, data: null, msg: message, message, error: { code, message } } })

  function query(query: WarehouseQueryV1 = {}) {
    return warehouse.query(projectId, { ...query, kinds: ['artifact'] })
  }

  function readWarehouseItem(artifactId: string): WarehouseItemV1 | undefined {
    const artifact = repository.getArtifact(artifactId)
    if (!artifact || String(artifact.projectId) !== projectId || artifact.archivedAt !== undefined) return undefined
    const search = artifact.title.trim() || undefined
    let cursor: string | undefined
    const readCursors = new Set<string>()
    while (true) {
      const snapshot = query({ ...(search === undefined ? {} : { search }), limit: 200, ...(cursor === undefined ? {} : { cursor }) })
      const item = snapshot.items.find((candidate) => candidate.kind === 'artifact'
        && candidate.entityRef.type === 'artifact' && candidate.entityRef.id === artifactId)
      if (item) return item
      cursor = snapshot.nextCursor
      if (cursor === undefined) return undefined
      if (readCursors.has(cursor)) throw new ProjectionFault(409, 'WAREHOUSE_CURSOR_REPEATED', 'Library detail could not resolve a stable Warehouse page.')
      readCursors.add(cursor)
    }
  }

  function projectAsset(item: WarehouseItemV1, selectedRevisionId = item.presentedRevisionId) {
    if (item.kind !== 'artifact' || item.entityRef.type !== 'artifact' || !item.entityRef.id.trim()) {
      throw new ProjectionFault(409, 'ASSEMBLY_ITEM_IDENTITY_MISMATCH', 'Library only exposes canonical Artifact Warehouse rows.')
    }
    const artifactId = item.entityRef.id
    const artifact = repository.getArtifact(artifactId)
    if (!artifact || String(artifact.projectId) !== projectId || artifact.archivedAt !== undefined) {
      throw new ProjectionFault(409, 'ASSEMBLY_ARTIFACT_IDENTITY_MISMATCH', 'Warehouse Artifact is no longer available in this project.')
    }

    const artifactViewId = item.entityRef.viewId?.trim() || undefined
    const view = artifactViewId ? repository.getArtifactView(artifactViewId) : undefined
    const viewBelongsToArtifact = artifactViewId === undefined
      || (!!view && String(view.artifactId) === artifactId)
    const rowRevisionId = item.presentedRevisionId?.trim() || undefined
    const rowRevision = rowRevisionId ? repository.getArtifactRevision(rowRevisionId) : undefined
    const rowRevisionBelongsToArtifact = rowRevisionId === undefined
      || (!!rowRevision && String(rowRevision.artifactId) === artifactId)
    const rowViewMatchesRevision = artifactViewId === undefined
      || (!!view && rowRevisionId !== undefined && String(view.revisionId) === rowRevisionId)
    const warehouseIdentityCoherent = viewBelongsToArtifact && rowRevisionBelongsToArtifact && rowViewMatchesRevision

    const revisionId = selectedRevisionId?.trim() || undefined
    const revision = revisionId ? repository.getArtifactRevision(revisionId) : undefined
    if (revisionId && (!revision || String(revision.artifactId) !== artifactId)) {
      throw new ProjectionFault(404, 'ASSEMBLY_REVISION_NOT_FOUND', 'Requested Artifact revision is unavailable.')
    }
    const fileRecordId = revision ? String(revision.fileRecordId) : undefined
    const file = fileRecordId ? repository.getFileRecord(fileRecordId) : undefined
    const contentAvailable = warehouseIdentityCoherent && !!revision && !!file
      && revision.status !== 'draft' && String(file.projectId) === projectId && file.availability === 'current'
      && String(file.observedHash) === String(revision.contentHash)
    const sourceUrl = contentAvailable
      ? `${publicOrigin}/api/surface-core/file-records/${encodeURIComponent(fileRecordId!)}/content`
      : ''
    const historicalSelection = warehouseIdentityCoherent && revisionId !== rowRevisionId && revision !== undefined
    const selectedVisualFamily = historicalSelection ? visualFamilyForExactMime(file?.mimeType) : item.visualFamily
    const selectedItem = historicalSelection
      ? (() => {
        const { mimeType: _rowMimeType, visualFamily: _rowVisualFamily, ...row } = item
        return { ...row, entityRef: { type: 'artifact' as const, id: artifactId }, presentedRevisionId: revisionId,
          ...(selectedVisualFamily === undefined ? {} : { visualFamily: selectedVisualFamily }),
          ...(file?.mimeType ? { mimeType: file.mimeType } : {}) }
      })()
      : item
    const presentedViewId = selectedItem.entityRef.viewId?.trim() || undefined
    const assetType = selectedVisualFamily === 'image' ? 1 : selectedVisualFamily === 'video' ? 2
      : selectedVisualFamily === 'audio' ? 3 : selectedVisualFamily === 'markdown' ? 4 : 0

    return {
      asset: {
        id: artifactId,
        folder_id: folderId,
        name: item.title,
        asset_type: assetType,
        compliance_status: 0,
        source_url: sourceUrl,
        thumbnail_url: selectedVisualFamily === 'image' ? sourceUrl : '',
        content: '',
        created_at: artifact.createdAt,
        updated_at: item.updatedAt ?? (artifact as { readonly updatedAt?: string }).updatedAt,
        lcos_projection: {
          source: 'assembly-warehouse',
          project_id: projectId,
          assembly_item: selectedItem,
          warehouse_item: item,
          artifact_id: artifactId,
          artifact_view_id: presentedViewId ?? null,
          presented_revision_id: revisionId ?? null,
          current_revision_id: artifact.currentRevisionId === undefined ? null : String(artifact.currentRevisionId),
          file_record_id: fileRecordId ?? null,
          content_available: contentAvailable,
          content_url: sourceUrl,
          metadata_only: !contentAvailable,
          referenceable: contentAvailable,
          read_only: true,
        },
      },
    }
  }

  function assetList(params: URLSearchParams) {
    const page = Number(params.get('page') || 1)
    const pageSize = Number(params.get('page_size') || 20)
    const offset = (page - 1) * pageSize
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200
      || !Number.isSafeInteger(offset)) {
      throw new ProjectionFault(400, 'INVALID_PAGINATION', 'Use positive bounded Library pagination.')
    }
    const requestedFolder = params.get('folder_id')
    if (requestedFolder !== null && requestedFolder !== folderId) {
      throw new ProjectionFault(404, 'PROJECT_FOLDER_NOT_FOUND', 'Use the folder returned by the local Warehouse projection.')
    }
    const keyword = (params.get('keyword') || '').trim()
    const materialFilter = nativeTypeFilter(params.get('type_filter'))
    const snapshot = query({
      ...(keyword === '' ? {} : { search: keyword }),
      ...(materialFilter === undefined ? {} : { materialFilter }),
      limit: pageSize,
      ...(offset === 0 ? {} : { cursor: `offset:${offset}` }),
    })
    const assets = snapshot.items.map((item) => projectAsset(item).asset)
    return { assets, pagination: { page, page_size: pageSize, total: snapshot.totalApprox, has_next: snapshot.nextCursor !== undefined } }
  }

  return async function handle({ method = 'GET', pathname, url }: { method?: string; pathname?: string; url?: string | URL }) {
    const incoming = url instanceof URL ? url : new URL(url || pathname || '/', publicOrigin)
    const route = pathname || incoming.pathname
    if (!route.startsWith('/api/library/')) return null
    if (method.toUpperCase() !== 'GET') return failure(501, 'LIBRARY_ACTION_NOT_CONNECTED', 'Material deletion and folder mutations require their canonical Core owner.')

    const project = repository.getProject(projectId)
    if (!project) return failure(404, 'PROJECT_NOT_FOUND', 'Local project is unavailable.')
    const params = incoming.searchParams
    const requestedSpace = params.get('space_type')
    if (requestedSpace !== null && !['SPACE_TYPE_PRIVATE', '1'].includes(requestedSpace)) {
      return failure(501, 'CLOUD_LIBRARY_NOT_CONNECTED', 'Only this isolated local project is connected.')
    }

    try {
      const spaceFolders = /^\/api\/library\/v1\/spaces\/([^/]+)\/folders$/.exec(route)
      if (spaceFolders) {
        const spaceType = decodeSegment(spaceFolders[1]!)
        if (spaceType === undefined) return failure(400, 'INVALID_SPACE_TYPE', 'Library space identity is invalid.')
        if (!['SPACE_TYPE_PRIVATE', '1'].includes(spaceType)) return failure(501, 'CLOUD_LIBRARY_NOT_CONNECTED', 'Only this isolated local project is connected.')
        const count = query({ limit: 1 }).totalApprox
        return success({ folders: [{ id: folderId, name: project.name, parent_id: '0', space_type: 'SPACE_TYPE_PRIVATE',
          asset_count: count, lcos_projection: { project_id: projectId, read_only: true, catalog_only: false } }] })
      }

      const folderAssets = /^\/api\/library\/v1\/folders\/([^/]+)\/assets$/.exec(route)
      if (folderAssets) {
        const folder = decodeSegment(folderAssets[1]!)
        if (folder !== folderId) return failure(404, 'PROJECT_FOLDER_NOT_FOUND', 'Use the folder returned by the local Warehouse projection.')
        return success(assetList(params))
      }

      const isSearch = route === '/api/library/v1/assets:search' || route === '/api/library/v1/assets:mention'
      if (isSearch) {
        const page = assetList(params)
        return success({ items: page.assets.map((asset) => ({
          asset, folder_id: folderId, folder_name: project.name, folder_display_path: project.name,
        })), pagination: page.pagination })
      }

      const detail = /^\/api\/library\/v1\/assets\/([^/]+)$/.exec(route)
      if (detail) {
        const artifactId = decodeSegment(detail[1]!)
        if (artifactId === undefined || artifactId === '') return failure(400, 'INVALID_ASSET_ID', 'Library asset identity is invalid.')
        const item = readWarehouseItem(artifactId)
        if (!item) return failure(404, 'PROJECT_ASSET_NOT_FOUND', 'Artifact is not available in this project Warehouse.')
        const requestedRevisionId = params.get('revision_id')
        if (requestedRevisionId !== null && requestedRevisionId.trim() === '') {
          return failure(400, 'INVALID_REVISION_ID', 'Revision identity cannot be empty.')
        }
        const projected = projectAsset(item, requestedRevisionId ?? item.presentedRevisionId)
        return success({ asset: projected.asset, folder_id: folderId, folder_name: project.name, folder_display_path: project.name })
      }

      return failure(501, 'LIBRARY_READ_NOT_CONNECTED', 'This Library read has no registered local Warehouse mapping.')
    } catch (error) {
      if (error instanceof ProjectionFault) return failure(error.status, error.code, error.message)
      throw error
    }
  }
}
