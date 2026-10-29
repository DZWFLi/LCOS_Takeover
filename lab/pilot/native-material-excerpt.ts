import { createHash } from 'node:crypto';
import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts';
import { CoreRelationClient } from '../../lcos/apps/web-gen2/src/backend/relations.ts';
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.ts';
import { encodeNativeMaterialSourceAnchor } from './native-text-location-persistence';
import { normalizeNativeTextLocator, type NativeTextSingleLocator, type NativeTextSourceLocator } from './native-text-location';

export const nativeMaterialExcerptKey = 'lcos_material_excerpt';
export type NativeExcerptSource = { projectId: string; artifactId: string; revisionId: string; fileRecordId: string;
  viewId?: string; title: string; locator: NativeTextSourceLocator; sourceAnchor: string };
type Failure = (status: number, code: string, message: string, details?: unknown) => never;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const address = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/** Validate the same material-transfer payload before any carrier/producer.
 * The supplied projection follows the actual Reader's visible text semantics;
 * rendered UTF16 coordinates must never be interpreted as Markdown offsets. */
export async function validateNativeMaterialExcerpt({ repository, projectId, value, body, read, projectText, fail }: {
  repository: SqliteMetadataRepository; projectId: string; value: unknown; body: string;
  read(filePath: string): Promise<Buffer>; projectText(markdown: string): Promise<string>; fail: Failure;
}): Promise<NativeExcerptSource> {
  if (!record(value) || value.schemaVersion !== 1 || value.kind !== 'material-transfer' || !record(value.source)
    || !record(value.content) || value.content.kind !== 'text' || value.content.text !== body || !body.trim())
    fail(400, 'EXCERPT_PAYLOAD_INVALID', '这份摘录的正文或来源无法识别，原文保留。');
  const raw = value.source;
  if (raw.projectId !== projectId || ![raw.artifactId, raw.revisionId, raw.fileRecordId].every(address)
    || typeof raw.title !== 'string' || raw.viewId !== undefined && !address(raw.viewId))
    fail(409, 'EXCERPT_SOURCE_ADDRESS_INVALID', '摘录缺少同一项目的准确版本地址，未改用其他材料。');
  const artifactId = raw.artifactId as string, revisionId = raw.revisionId as string, fileRecordId = raw.fileRecordId as string;
  const locator = normalizeNativeTextLocator(raw.locator);
  if (!locator) fail(409, 'EXCERPT_LOCATION_INVALID', '这份摘录没有可核对的准确位置，请从原正文重新选中。');
  const exact = () => {
    const artifact = repository.getArtifact(artifactId), revision = repository.getArtifactRevision(revisionId), file = repository.getFileRecord(fileRecordId);
    const view = typeof raw.viewId === 'string' ? repository.getArtifactView(raw.viewId) : undefined;
    if (!artifact || String(artifact.projectId) !== projectId || artifact.archivedAt !== undefined || !['markdown', 'text'].includes(String(artifact.kind))
      || !revision || String(revision.artifactId) !== artifactId || revision.status === 'draft' || String(revision.fileRecordId) !== fileRecordId
      || !file || String(file.projectId) !== projectId || file.availability !== 'current' || file.observedHash !== revision.contentHash
      || typeof raw.viewId === 'string' && (!view || String(view.artifactId) !== artifactId
        || String(view.revisionId ?? artifact.currentRevisionId ?? '') !== revisionId
        || !repository.getScopes(projectId).some(scope => String(scope.id) === String(view.scopeId))))
      fail(409, 'EXCERPT_SOURCE_UNAVAILABLE', '原材料的所选版本、位置或文件已变化，未创建替代摘录。');
    return { artifact, revision, file };
  };
  const source = exact();
  let bytes: Buffer;
  try { bytes = await read(source.file.observedPath); }
  catch (error) { fail(409, 'EXCERPT_SOURCE_BYTES_UNAVAILABLE', '所选原文件暂时无法读取，未创建替代摘录；原材料保留。',
    { cause: error instanceof Error ? error.message : String(error) }); }
  // Reuse the revision's existing immutable content hash; no new identity or
  // baseline is introduced. A changed file cannot masquerade as old bytes.
  if (createHash('sha256').update(bytes).digest('hex') !== source.revision.contentHash)
    fail(409, 'EXCERPT_SOURCE_BYTES_CHANGED', '所选版本的原文件内容已变化，未把其他正文当作来源。');
  const markdown = bytes.toString('utf8');
  const locations = 'locations' in locator ? locator.locations : [locator];
  let visibleText: string | undefined;
  if (locations.some(location => 'textRange' in location)) {
    try { visibleText = await projectText(markdown); }
    catch (error) {
      if ((error as { code?: string })?.code === 'EXCERPT_RENDERER_NOT_READY') throw error;
      fail(409, 'EXCERPT_TEXT_UNAVAILABLE', '原正文暂时无法准确核对，未创建替代摘录；原文保留。',
        { cause: error instanceof Error ? error.message : String(error) });
    }
  }
  const textAt = (location: NativeTextSingleLocator): string => {
    if ('textRange' in location) {
      const range = location.textRange;
      const boundary = (offset: number) => !(visibleText && offset > 0 && offset < visibleText.length
        && /[\uD800-\uDBFF]/.test(visibleText[offset - 1]!) && /[\uDC00-\uDFFF]/.test(visibleText[offset]!));
      if (!boundary(range.start) || !boundary(range.end) || visibleText?.slice(range.start, range.end) !== range.quote)
        fail(409, 'EXCERPT_QUOTE_MISMATCH', '摘录文字与原版本的所选位置不一致，请重新选中。');
      return range.quote;
    }
    if (location.kind === 'lines') {
      const lines = markdown.split(/\r?\n/);
      if (location.end >= lines.length) fail(409, 'EXCERPT_LOCATION_UNAVAILABLE', '摘录所选原文行已无法核对，原文保留。');
      return lines.slice(location.start, location.end + 1).join('\n');
    }
    fail(409, 'EXCERPT_LOCATION_UNSUPPORTED', '这类来源位置尚不能用于画布文本摘录，请在正文里重新选中文字。');
  };
  for (const location of locations) textAt(location);
  const selected = 'locations' in locator ? locator.selected : locator;
  if (!selected) fail(409, 'EXCERPT_LOCATION_CHOICE_REQUIRED', '这份引用有多处位置，请先选定一处再摘录到画布。');
  if (textAt(selected) !== body) fail(409, 'EXCERPT_QUOTE_MISMATCH', '新摘录正文与选定来源不一致，未创建其他文字。');
  const after = exact();
  if (after.file.observedPath !== source.file.observedPath || after.revision.contentHash !== source.revision.contentHash)
    fail(409, 'EXCERPT_SOURCE_CHANGED', '来源在读取时发生变化，原文保留，请重新摘录。');
  const sourceAnchor = encodeNativeMaterialSourceAnchor(locator);
  if (!sourceAnchor) fail(409, 'EXCERPT_LOCATION_INVALID', '来源位置尚未确认，未继续保存这份摘录。');
  return { projectId, artifactId, revisionId, fileRecordId, ...(typeof raw.viewId === 'string' ? { viewId: raw.viewId } : {}),
    title: raw.title as string, locator, sourceAnchor };
}

/** The existing Relation API owns IDs/validation/ChangeSets. Read after an
 * uncertain response, never repeat text creation or guess a child by content. */
export function createNativeMaterialExcerptRelations({ repository, projectId, coreOrigin, fail }: {
  repository: SqliteMetadataRepository; projectId: string; coreOrigin: string; fail: Failure;
}) {
  const relations = new CoreRelationClient(new HttpClient({ baseUrl: coreOrigin }));
  return async (childArtifactId: string, source: NativeExcerptSource) => {
    const sourceDetails = { childArtifactId, sourceArtifactId: source.artifactId, sourceRevisionId: source.revisionId,
      sourceFileRecordId: source.fileRecordId, ...(source.viewId ? { sourceViewId: source.viewId } : {}), sourceAnchor: source.sourceAnchor };
    const matching = () => repository.getRelations(projectId).filter(row => row.kind === 'reference' && row.sourceEntityType === 'artifact'
      && String(row.sourceEntityId) === childArtifactId && row.targetEntityType === 'artifact' && String(row.targetEntityId) === source.artifactId);
    let current = matching(), cause: unknown;
    if (!current.length) {
      try { await relations.createRelation(projectId, { sourceEntityType: 'artifact', sourceEntityId: childArtifactId,
        targetEntityType: 'artifact', targetEntityId: source.artifactId, kind: 'reference' }); } catch (error) { cause = error; }
      current = matching();
    }
    if (current.length !== 1) fail(409, 'EXCERPT_SOURCE_LINK_UNCONFIRMED', '摘录已保存，来源关系尚未确认；原文保留，请勿重复创建。',
      { ...sourceDetails, cause: cause instanceof Error ? cause.message : undefined });
    let relation = current[0]!;
    const linked = () => repository.getRelation(String(relation.id))?.evidenceRefs?.some(item => item.kind === 'artifact'
      && String(item.id) === source.artifactId && item.revisionId === source.revisionId && item.sourceAnchor === source.sourceAnchor) === true;
    if (!linked()) {
      try { await relations.putRelation(projectId, { ...relation, evidenceRefs: [...(relation.evidenceRefs ?? []),
        { kind: 'artifact', id: source.artifactId, label: source.title, revisionId: source.revisionId, sourceAnchor: source.sourceAnchor }] }); }
      catch (error) { cause = error; }
    }
    if (!linked()) fail(409, 'EXCERPT_SOURCE_LINK_UNCONFIRMED', '摘录已保存，来源位置尚未确认；原文保留，请勿重复创建。',
      { ...sourceDetails, relationId: String(relation.id), cause: cause instanceof Error ? cause.message : undefined });
    return String(relation.id);
  };
}
