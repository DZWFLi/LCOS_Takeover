import { createAbsolutePositionGetter, getLayoutNodeSize, indexById, type NestableNode } from '@huabu/shared/canvas-engine';

import type { CanvasNodeGeometryUpdate } from '@huabu/shared';
import type { Node } from '@xyflow/react';

export interface CollectionLayoutRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const overlaps = (a: CollectionLayoutRect, b: CollectionLayoutRect, gap = 18): boolean =>
  a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
  && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;

/**
 * Geometry donor: DZWFLi/LCOS-local-creativeOS@3e99769bf106d68cecc54094662352bfaecf2bdd
 * apps/web/src/features/canvas/collectionExpandLayout.ts::layoutExpandedCollectionMembers.
 * Keep the donor's small fan-out; larger groups use a balanced local grid. Huabu remains
 * the only geometry/history owner; this function never changes membership.
 */
export function layoutCollectionMembers(
  container: CollectionLayoutRect,
  members: readonly CollectionLayoutRect[],
  obstacles: readonly CollectionLayoutRect[],
): CanvasNodeGeometryUpdate[] {
  const gapX = 42;
  const gapY = 24;
  const columnGap = 30;
  const maxColumns = members.length > 16 ? 5 : 4;
  if (members.length > 9) {
    return layoutBalancedCollection(container, members, obstacles, columnGap, gapY, maxColumns);
  }
  const ordered = [...members].sort((a, b) =>
    Math.abs(a.y - container.y) - Math.abs(b.y - container.y) || a.y - b.y || a.x - b.x);
  const placed: CollectionLayoutRect[] = [];
  const updates: CanvasNodeGeometryUpdate[] = [];
  let x = container.x + container.width + gapX;
  const maxColumnHeight = Math.max(560, container.height * 3.2);
  // Plan tracks using every member's real width before placing any of them.
  // A wide late member must not grow backwards into an earlier column.
  const columns: CollectionLayoutRect[][] = [[]];
  let trackHeight = 0;
  for (const member of ordered) {
    if (trackHeight > 0 && trackHeight + member.height > maxColumnHeight && columns.length < maxColumns) {
      columns.push([]);
      trackHeight = 0;
    }
    columns[columns.length - 1]?.push(member);
    trackHeight += member.height + gapY;
  }
  for (const column of columns) {
    let y = container.y;
    for (const member of column) {
      let candidate = { ...member, x, y };
      // Jump directly past each blocking bottom. The old 30 x 28px walk
      // exhausted its budget inside tall objects and still emitted overlaps.
      let blockers = [...placed, ...obstacles].filter((other) => overlaps(candidate, other));
      while (blockers.length) {
        candidate = { ...candidate, y: Math.max(...blockers.map((other) => other.y + other.height + 18)) };
        blockers = [...placed, ...obstacles].filter((other) => overlaps(candidate, other));
      }
      updates.push({ nodeId: member.id as CanvasNodeGeometryUpdate['nodeId'], position: { x: candidate.x, y: candidate.y } });
      placed.push(candidate);
      y = candidate.y + member.height + gapY;
    }
    x += Math.max(0, ...column.map((member) => member.width)) + columnGap;
  }
  return updates;
}

/** Large collections move as one block rather than growing an endless last column. */
function layoutBalancedCollection(
  container: CollectionLayoutRect,
  members: readonly CollectionLayoutRect[],
  obstacles: readonly CollectionLayoutRect[],
  gapX: number,
  gapY: number,
  maxColumns: number,
): CanvasNodeGeometryUpdate[] {
  const ordered = [...members].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  const columns = Math.max(3, Math.min(maxColumns, Math.ceil(Math.sqrt(ordered.length))));
  const rows = Math.ceil(ordered.length / columns);
  const columnWidths = Array<number>(columns).fill(0);
  const rowHeights = Array<number>(rows).fill(0);
  ordered.forEach((member, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    columnWidths[column] = Math.max(columnWidths[column] ?? 0, member.width);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, member.height);
  });
  const columnOffsets: number[] = [];
  const rowOffsets: number[] = [];
  let width = 0;
  let height = 0;
  columnWidths.forEach((value, index) => { columnOffsets[index] = width; width += value + gapX; });
  rowHeights.forEach((value, index) => { rowOffsets[index] = height; height += value + gapY; });
  width -= gapX;
  height -= gapY;
  const baseX = container.x + container.width + gapX + 12;
  const candidates = [
    { x: baseX, y: container.y },
    { x: baseX, y: container.y - height * 0.35 },
    { x: baseX, y: container.y + container.height + gapY },
    { x: container.x, y: container.y + container.height + gapY + 18 },
    { x: container.x - width - gapX - 18, y: container.y },
  ];
  const free = (point: { x: number; y: number }): boolean => obstacles.every((obstacle) =>
    !overlaps({ id: container.id, ...point, width, height }, obstacle, 20));
  // The G1 candidate strategy is retained. When all five candidates are occupied,
  // move the WHOLE block below the obstacles, never individual rows into a snake.
  const origin = candidates.find(free) ?? {
    x: baseX,
    y: obstacles.reduce((bottom, obstacle) => Math.max(bottom, obstacle.y + obstacle.height + 20), container.y),
  };
  return ordered.map((member, index) => ({
    nodeId: member.id as CanvasNodeGeometryUpdate['nodeId'],
    position: {
      x: origin.x + (columnOffsets[index % columns] ?? 0),
      y: origin.y + (rowOffsets[Math.floor(index / columns)] ?? 0),
    },
  }));
}

function nodeRect(node: Node, absolute: { x: number; y: number }): CollectionLayoutRect {
  const fallback = getLayoutNodeSize(node);
  const width = node.measured?.width ?? node.width ?? fallback.w;
  const height = node.measured?.height ?? node.height ?? fallback.h;
  return { id: node.id, ...absolute, width, height };
}

export function collectionExpansionGeometry(
  nodes: readonly Node[],
  containerId: string,
  memberIds: readonly string[],
  additionalObstacleIds: readonly string[] = [],
): CanvasNodeGeometryUpdate[] {
  const container = nodes.find((node) => node.id === containerId);
  if (!container) return [];
  const memberSet = new Set(memberIds);
  // Reuse Huabu's parent-chain resolver. Child positions are frame-relative;
  // comparing them with root coordinates makes newly added members overlap.
  const absolutePosition = createAbsolutePositionGetter(indexById(nodes as NestableNode[]));
  const rectOf = (node: Node): CollectionLayoutRect => nodeRect(node, absolutePosition(node.id) ?? node.position);
  const companionFrames = new Map(nodes.filter((node) => node.type === 'frame' && !node.parentId
    && typeof node.data?.lcosCollectionNodeId === 'string' && memberSet.has(node.id))
    .map((node) => [String(node.data.lcosCollectionNodeId), node]));
  const companionIds = new Set([...companionFrames.values()].map((node) => node.id));
  const offsets = new Map<string, { x: number; y: number }>();
  const members = nodes.filter((node) => memberSet.has(node.id) && !node.parentId && !companionIds.has(node.id)).map((node) => {
    const body = rectOf(node);
    const frame = companionFrames.get(node.id);
    if (!frame) return body;
    // A nested collection's body and existing expanded host are one moving
    // footprint, never two independently packed canonical members.
    const host = rectOf(frame);
    const x = Math.min(body.x, host.x), y = Math.min(body.y, host.y);
    offsets.set(node.id, { x: body.x - x, y: body.y - y });
    return { ...body, x, y, width: Math.max(body.x + body.width, host.x + host.width) - x,
      height: Math.max(body.y + body.height, host.y + host.height) - y };
  });
  if (members.length === 0) return [];
  const included = new Set([containerId, ...memberIds]);
  const extraObstacles = new Set(additionalObstacleIds);
  // Do not avoid the invisible Collection Frame itself while adding to it.
  // Its actual children are the obstacles; otherwise its bounding box can
  // push an addition far outside the collection even when a gap is available.
  const hostIds = new Set(nodes.filter((node) => extraObstacles.has(node.id) && node.parentId)
    .map((node) => node.parentId));
  const obstacles = nodes.filter((node) => !included.has(node.id) && !hostIds.has(node.id)
    && (!node.hidden || extraObstacles.has(node.id))
    && (!node.parentId || extraObstacles.has(node.id))).map(rectOf);
  return layoutCollectionMembers(rectOf(container), members, obstacles).map((update) => {
    const offset = offsets.get(String(update.nodeId));
    return offset && update.position ? { ...update, position: { x: update.position.x + offset.x, y: update.position.y + offset.y } } : update;
  });
}
