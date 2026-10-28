import type { WarehouseItemV1 } from '../../lcos/packages/contracts/src/index.ts';

export type NativeLibraryEntryKind = 'context' | 'workflow' | 'collection';
export interface NativeLibraryEntry { readonly projectId: string; readonly item: WarehouseItemV1 }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** One identity reader shared by the original Library preview and drag source. */
export function nativeLibraryEntry(detail: unknown, projectId?: string): NativeLibraryEntry | undefined {
  const entry = record(detail) && record(detail.asset) ? detail.asset.lcos_library_entry : undefined;
  if (!record(entry) || !nonEmpty(entry.projectId) || projectId !== undefined && entry.projectId !== projectId) return undefined;
  const item = entry.item;
  if (!record(item) || item.schemaVersion !== 1 || !['context', 'workflow', 'collection'].includes(String(item.kind))
    || typeof item.title !== 'string' || !record(item.entityRef) || item.entityRef.type !== item.kind || !nonEmpty(item.entityRef.id)
    || typeof item.usageCount !== 'number' || !Number.isFinite(item.usageCount)) return undefined;
  return entry as unknown as NativeLibraryEntry;
}
