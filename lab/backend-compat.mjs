import { createCoreReader, AdapterError } from './adapters/core-read.mjs';
import { fixtureRead } from './adapters/fixtures.mjs';
import { projectFolderId, projectIdFromFolder, assertRecords, projectToCanvas, projectToFolder,
  artifactToAsset, nonNegativeInt, libraryPagination } from './adapters/projections.mjs';

/** Pure HTTP result boundary. The host owns origin checks, body parsing and response I/O. */
export function createBackendCompat({ coreOrigin, fixtureMode = false, timeoutMs = 3000 } = {}) {
  const core = createCoreReader({ coreOrigin, fixtureMode, fixtureRead, timeoutMs });
  const meta = () => ({ ...core.metadata });
  const success = data => ({ status: 200, body: { code: 0, message: '', msg: '', data, lcos_adapter: meta() } });
  const fail = (status, code, message) => ({ status, body: {
    code: status * 100, message, msg: message, data: null, error: { code, message }, lcos_adapter: meta() } });
  async function projects() {
    return assertRecords(await core.read('/projects'), ['id', 'name'], 'Project');
  }
  async function artifacts(projectId) {
    const rows = assertRecords(await core.read('/projects/' + encodeURIComponent(projectId) + '/artifacts?lifecycle=active'),
      ['id', 'projectId', 'title', 'kind', 'availability', 'createdAt', 'updatedAt'], 'Artifact');
    if (rows.some(row => row.projectId !== projectId)) throw new AdapterError(502, 'CORE_RESPONSE_INVALID', 'Artifact belongs to another project.');
    return rows.filter(row => row.archivedAt === undefined);
  }
  async function assetsFor(projectId) {
    const rows = await artifacts(projectId);
    const result = [];
    for (const row of rows) {
      const revisions = row.currentRevisionId ? assertRecords(await core.read('/artifacts/' + encodeURIComponent(row.id) + '/revisions'),
        ['id', 'artifactId', 'fileRecordId'], 'Revision') : [];
      result.push(artifactToAsset(row, revisions));
    }
    return result.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }
  return async function handleBackendCompat({ method = 'GET', pathname, url } = {}) {
    const requestUrl = url instanceof URL ? url : new URL(url || pathname || '/', 'http://127.0.0.1');
    const route = pathname || requestUrl.pathname;
    const inScope = route === '/api/compat/status' || route.startsWith('/api/canvas/') || route.startsWith('/api/library/');
    if (!inScope) return null;
    if (method !== 'GET') return fail(501, 'ACTION_NOT_IMPLEMENTED', 'This adapter is read-only. Write, generation, deletion and payment actions are not connected.');
    if (route === '/api/compat/status') {
      return success({ ...meta(), supported_reads: ['canvas-catalog', 'project-folder-tree', 'folder-asset-metadata', 'asset-search-metadata'],
        canvas_runtime_connected: false, content_bytes_connected: false, mutations_connected: false });
    }
    try {
      const params = requestUrl.searchParams;
      if (route === '/api/canvas/v1/canvases') {
        const scope = params.get('scope');
        if (scope && scope !== 'personal') throw new AdapterError(501, 'SCOPE_NOT_IMPLEMENTED', 'Team/cloud scope has no LCOS project projection.');
        if (params.get('parent_filter') === 'child_of' || (params.get('type') && params.get('type') !== 'canvas')) {
          throw new AdapterError(501, 'COLLECTION_NOT_IMPLEMENTED', 'Canvas collections are not projected.');
        }
        const keyword = (params.get('keyword') || '').trim().toLocaleLowerCase();
        let rows = (await projects()).filter(project => project.name.toLocaleLowerCase().includes(keyword)).map(projectToCanvas);
        rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
        if (params.get('sort_order') === 'asc') rows.reverse();
        const offset = nonNegativeInt(params, 'offset', 0), limit = nonNegativeInt(params, 'limit', 20, 200);
        if (!limit) throw new AdapterError(400, 'INVALID_ARGUMENT', 'limit must be positive.');
        return success({ canvases: rows.slice(offset, offset + limit), total: rows.length });
      }
      if (route === '/api/library/v1/spaces/SPACE_TYPE_PRIVATE/folders') {
        const folders = [];
        for (const project of await projects()) folders.push(projectToFolder(project, (await artifacts(project.id)).length));
        return success({ folders });
      }
      const folderMatch = /^\/api\/library\/v1\/folders\/([^/]+)\/assets$/.exec(route);
      if (folderMatch) {
        const projectId = projectIdFromFolder(decodeURIComponent(folderMatch[1]));
        if (!(await projects()).some(project => project.id === projectId)) throw new AdapterError(404, 'PROJECT_NOT_FOUND', 'Projected project folder was not found.');
        return success(libraryPagination(await assetsFor(projectId), params));
      }
      if (route === '/api/library/v1/assets:search' || route === '/api/library/v1/assets:mention') {
        if (params.get('space_type') && !['SPACE_TYPE_PRIVATE', '1'].includes(params.get('space_type'))) {
          throw new AdapterError(501, 'SCOPE_NOT_IMPLEMENTED', 'Team/cloud library scope is not projected.');
        }
        const keyword = (params.get('keyword') || '').trim().toLocaleLowerCase();
        const items = [];
        for (const project of await projects()) {
          for (const asset of await assetsFor(project.id)) if (asset.name.toLocaleLowerCase().includes(keyword)) {
            items.push({ asset, folder_id: projectFolderId(project.id), folder_name: project.name, folder_display_path: project.name });
          }
        }
        const paged = libraryPagination(items, params);
        return success({ items: paged.assets, pagination: paged.pagination });
      }
      return fail(501, 'READ_NOT_IMPLEMENTED', 'This TapNow endpoint is not connected to LCOS. No synthetic success was returned.');
    } catch (error) {
      if (error instanceof AdapterError) return fail(error.status, error.code, error.message);
      if (error instanceof URIError) return fail(400, 'INVALID_ARGUMENT', 'Invalid encoded identifier.');
      return fail(502, 'PROJECTION_FAILED', 'Read projection failed.');
    }
  };
}
