import type { WarehouseItemV1 } from '@local-creative-os/contracts';

export interface AtlasEntityRefLike {
  readonly entityId: string;
  readonly entityType: string;
}

export interface AtlasGroup {
  readonly key: string;
  readonly label: string;
  readonly list: readonly WarehouseItemV1[];
}

export function isAtlasItem(item: WarehouseItemV1): boolean {
  // Context Atlas is specifically the Context collection/large-context-block view.
  // Generic Collections belong to Main; Scenes/workspaces are destinations, not Atlas blocks.
  return item.kind === 'context' && item.entityRef.type === 'context';
}

/** Main's Atlas is a projection of canonical Collections only; scope/worksite kind is not an alias. */
export function isCanonicalCollectionItem(item: WarehouseItemV1): boolean {
  return item.kind === 'collection'
    && item.entityRef.type === 'collection'
    && item.entityRef.id.trim().length > 0;
}

/** Warehouse 当前没有明确的事情/时间组织字段，不能用 kind 或 updatedAt 伪造组织。 */
export function buildAtlasGroups(items: readonly WarehouseItemV1[]): readonly AtlasGroup[] {
  return items.length === 0 ? [] : [{ key: 'context-collection', label: '上下文集合', list: items }];
}

export function canAtlasLocate(item: WarehouseItemV1, refs: Iterable<AtlasEntityRefLike>): boolean {
  return [...refs].some((ref) => ref.entityId === item.entityRef.id && ref.entityType === item.entityRef.type);
}
