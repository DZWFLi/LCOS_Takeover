import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const nativeCoreCollectionTitleRepositorySource = 'lcos/apps/local-core/src/metadata-repository.ts';
export const nativeCoreCollectionTitleRouteSource = 'lcos/apps/local-core/src/routes/collections.ts';

const repositoryMethod = [
  '  updateCollectionTitle(projectId: string, collectionId: string, rawTitle: string): Collection | undefined {',
  '    const title = rawTitle.trim()',
  "    if (title.length === 0 || title.length > 500) throw new Error('Collection title must contain 1–500 characters.')",
  '    const updatedAt = new Date().toISOString()',
  '    const result = this.#database.prepare(',
  "      'UPDATE collections SET title = ?, updated_at = ? WHERE id = ? AND project_id = ?',",
  '    ).run(title, updatedAt, collectionId as SQLInputValue, projectId as SQLInputValue)',
  '    if (result.changes !== 1) return undefined',
  '    return this.getCollection(collectionId)',
  '  }',
  '',
].join('\n');

const collectionRouteBlock = [
  "  if (ctx.method === 'PATCH' && !isMembersRoute) {",
  '    let raw: unknown',
  '    try { raw = await ctx.helpers.readJsonBody(ctx.request, ctx.signal) } catch {',
  "      ctx.helpers.sendJson(ctx.response, 400, ctx.helpers.failure('INVALID_ARGUMENT', 'Request body must be valid JSON.'))",
  '      return true',
  '    }',
  "    if (!isRecord(raw) || Object.keys(raw).length !== 1 || !Object.hasOwn(raw, 'title')",
  "      || typeof raw.title !== 'string') {",
  "      ctx.helpers.sendJson(ctx.response, 400, ctx.helpers.failure('INVALID_ARGUMENT', 'Collection rename accepts only a title.'))",
  '      return true',
  '    }',
  '    const title = raw.title.trim()',
  '    if (title.length === 0 || title.length > 500) {',
  "      ctx.helpers.sendJson(ctx.response, 400, ctx.helpers.failure('INVALID_ARGUMENT', 'Collection title must contain 1–500 characters.'))",
  '      return true',
  '    }',
  '    const updated = ctx.metadata.updateCollectionTitle(projectId, collectionId, title)',
  '    if (updated === undefined) {',
  "      ctx.helpers.sendJson(ctx.response, 404, ctx.helpers.failure('NOT_FOUND', 'Collection not found.'))",
  '      return true',
  '    }',
  '    ctx.helpers.sendJson(ctx.response, 200, { ok: true, value: updated })',
  '    return true',
  '  }',
  '',
].join('\n');

function adaptExactSource(source, sourcePath, relativePath, original, adapted, partialMarker, label) {
  const expectedPath = path.resolve(workspaceRoot, relativePath);
  if (typeof sourcePath !== 'string' || path.resolve(sourcePath) !== expectedPath) {
    throw new Error(label + ' transform only applies to its exact copied Local Core sourcePath.');
  }
  if (typeof source !== 'string') throw new TypeError(label + ' source must be text.');
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  const normalized = source.replaceAll('\r\n', '\n');
  const originalCount = normalized.split(original).length - 1;
  const adaptedCount = normalized.split(adapted).length - 1;
  if (adaptedCount === 1 && originalCount === 1) return source;
  if (originalCount !== 1 || adaptedCount !== 0 || normalized.includes(partialMarker)) {
    throw new Error(label + ' seam drifted, is partial, or was duplicated; no source was adapted.');
  }
  return normalized.replace(original, adapted).replaceAll('\n', lineEnding);
}

export function transformNativeCoreCollectionTitleRepository(source, { sourcePath } = {}) {
  const anchor = '  hasCollectionMemberships(collectionId: string): boolean {';
  return adaptExactSource(source, sourcePath, nativeCoreCollectionTitleRepositorySource,
    anchor, repositoryMethod + anchor, 'updateCollectionTitle(projectId: string', 'Local Core Collection title repository');
}

export function transformNativeCoreCollectionTitleRoute(source, { sourcePath } = {}) {
  const anchor = "  if (ctx.method === 'GET' && isMembersRoute) {";
  return adaptExactSource(source, sourcePath, nativeCoreCollectionTitleRouteSource,
    anchor, collectionRouteBlock + anchor, "ctx.method === 'PATCH' && !isMembersRoute", 'Local Core Collection title route');
}

export function createNativeCoreCollectionTitleTransforms() {
  return {
    [nativeCoreCollectionTitleRepositorySource]: transformNativeCoreCollectionTitleRepository,
    [nativeCoreCollectionTitleRouteSource]: transformNativeCoreCollectionTitleRoute,
  };
}
