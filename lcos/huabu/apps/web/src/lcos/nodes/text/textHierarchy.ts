import { outlineRows, parseOutline } from './outlineTree';

export type TextPresentationMode = 'text' | 'outline' | 'mindmap';
export interface TextHierarchyRow {
  readonly id: string;
  readonly title: string;
  readonly level: number;
  readonly depth: number;
  readonly parentId: string | null;
  readonly hasChildren: boolean;
  readonly line: number;
  readonly tags: readonly string[];
}

/** Mature Gen1: each non-empty ordinary line, indentation, list and heading
 * belongs to the same outline. Fenced source code remains code, not headings. */
export function textHierarchy(markdown: string): readonly TextHierarchyRow[] {
  return outlineRows(parseOutline(markdown)).map((row, index) => ({ id: row.node.id, title: row.node.text,
    depth: row.depth, level: row.depth + 1, parentId: row.parentId, hasChildren: row.hasChildren, line: index, tags: row.node.tags }));
}

export function visibleTextHierarchy(rows: readonly TextHierarchyRow[], collapsedIds: readonly string[]): readonly TextHierarchyRow[] {
  const collapsed = new Set(collapsedIds), collapsedDepths: number[] = [];
  return rows.filter((row) => {
    while (collapsedDepths.length && row.depth <= (collapsedDepths.at(-1) ?? -1)) collapsedDepths.pop();
    const hidden = collapsedDepths.length > 0;
    if (row.hasChildren && collapsed.has(row.id)) collapsedDepths.push(row.depth);
    return !hidden;
  });
}