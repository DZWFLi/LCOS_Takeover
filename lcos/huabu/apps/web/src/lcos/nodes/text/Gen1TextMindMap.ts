// Mature Gen1 pure text geometry @3e99769. RFS/ReactFlow remains the only canvas.
import { mindmapLayout, MINDMAP_PREVIEW, MINDMAP_ROOT_ID } from './MatureMindMapLayout';

import type { OutlineNode } from './outlineTree';
import type { TextHierarchyRow } from './textHierarchy';

interface Rect { x: number; y: number; width: number; height: number }
export interface TextMindMapPlacement extends Rect { readonly row: TextHierarchyRow; readonly side: -1 | 1; readonly branch: number; readonly displayText: string; readonly fontSize: number }

export function layoutTextMindMap(rows: readonly TextHierarchyRow[], title = '文本') {
  const tree = new Map(rows.map((row) => [row.id, { id: row.id, text: row.title, depth: row.depth, tags: row.tags, children: [] as OutlineNode[] }]));
  const roots: OutlineNode[] = [];
  for (const row of rows) {
    const node = tree.get(row.id); if (!node) continue;
    const parent = row.parentId ? tree.get(row.parentId) : undefined;
    if (parent) parent.children.push(node); else roots.push(node);
  }
  const layout = mindmapLayout(roots, title, MINDMAP_PREVIEW);
  const root = layout.placements.find((item) => item.id === MINDMAP_ROOT_ID);
  const rootCenter = root ? { x: root.x + 14, y: root.y + 14, width: root.width, height: MINDMAP_PREVIEW.nodeH[0] ?? 30 }
    : { x: 14, y: 14, width: 180, height: 30 };
  const branchById = new Map<string, number>();
  const markBranch = (node: OutlineNode, index: number) => { branchById.set(node.id, index); node.children.forEach((child) => markBranch(child, index)); };
  roots.forEach(markBranch);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const placements: TextMindMapPlacement[] = layout.placements.flatMap((item) => {
    const row = rowById.get(item.id); if (!row) return [];
    return [{ row, displayText: item.text, fontSize: MINDMAP_PREVIEW.fontByDepth[Math.min(item.depth, 3)] ?? 9,
      side: item.side === -1 ? -1 : 1, branch: branchById.get(item.id) ?? 0,
      x: item.x + 14, y: item.y + 14, width: item.width, height: MINDMAP_PREVIEW.nodeH[Math.min(item.depth, 3)] ?? 22 }];
  });
  return { placements, rootCenter, width: Math.max(240, layout.width + 28), height: Math.max(120, layout.height + 28) };
}

export function textMindMapEdgePath(from: Rect, to: TextMindMapPlacement): string {
  const startX = to.side > 0 ? from.x + from.width : from.x, startY = from.y + from.height / 2;
  const endX = to.side > 0 ? to.x : to.x + to.width, endY = to.y + to.height / 2;
  const delta = (endX - startX) * .5;
  return `M ${startX} ${startY} C ${startX + delta} ${startY}, ${endX - delta} ${endY}, ${endX} ${endY}`;
}
