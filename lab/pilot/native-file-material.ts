/** Metadata for a read-only file in the original Text frame. It is not the
 * file body and never authorizes a write. lcos_ref remains the Core identity. */
export interface NativeFileMaterialMetadata {
  readonly artifactId: string;
  readonly artifactViewId: string;
  readonly revisionId: string;
  readonly fileRecordId: string;
  readonly mimeType: string;
  readonly kind: string;
  readonly size: number;
}

export function isNativeFileMaterial(kind: unknown): boolean {
  return ['pdf', 'presentation', 'file', 'other'].includes(String(kind));
}

export function nativeFileMaterialMetadata({ artifact, view, revision, file }: {
  artifact: { id: unknown; kind: unknown };
  view: { id: unknown };
  revision: { id: unknown };
  file: { id: unknown; mimeType: unknown; size: unknown };
}): NativeFileMaterialMetadata {
  const ids = [artifact.id, view.id, revision.id, file.id].map(String);
  const mimeType = String(file.mimeType).split(';', 1)[0]!.trim().toLowerCase();
  if (!isNativeFileMaterial(artifact.kind) || ids.some(id => !id || id === 'undefined')
    || !mimeType || !Number.isSafeInteger(file.size) || Number(file.size) < 0)
    throw new Error('The selected file metadata is incomplete.');
  return { artifactId: ids[0]!, artifactViewId: ids[1]!, revisionId: ids[2]!, fileRecordId: ids[3]!,
    mimeType, kind: String(artifact.kind), size: Number(file.size) };
}

export function sameNativeFileMaterialMetadata(value: unknown, expected: NativeFileMaterialMetadata): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  const keys = Object.keys(expected) as (keyof NativeFileMaterialMetadata)[];
  return Object.keys(data).length === keys.length && keys.every(key => data[key] === expected[key]);
}
