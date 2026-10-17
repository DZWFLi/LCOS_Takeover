/**
 * TapNow-style connection decluttering for the LCOS overview: hide idle
 * relationships, but keep the selected edge and connections at the node the
 * user is actively working on. This only chooses rendered edges; it never
 * changes the persisted edge collection.
 */
export function resolveConnectionViewEdges<
  TEdge extends {
    source: string;
    target: string;
    selected?: boolean;
    className?: string;
  },
  TNode extends {
    id: string;
    selected?: boolean;
    dragging?: boolean;
    hidden?: boolean;
  },
>(
  edges: readonly TEdge[],
  nodes: readonly TNode[],
  showAll: boolean,
): TEdge[] {
  if (showAll) return edges as TEdge[];

  const visibleNodeIds = new Set(
    nodes.filter((node) => !node.hidden).map((node) => node.id),
  );
  const activeNodeIds = new Set(
    nodes
      .filter((node) => !node.hidden && (node.selected || node.dragging))
      .map((node) => node.id),
  );

  return edges.flatMap((edge) => {
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) {
      return [];
    }

    const active =
      edge.selected ||
      activeNodeIds.has(edge.source) ||
      activeNodeIds.has(edge.target);
    if (!active) return [];

    if (edge.className?.split(/\s+/).includes('lcos-connection-active')) {
      return [edge];
    }
    return [
      {
        ...edge,
        className: [edge.className, 'lcos-connection-active']
          .filter(Boolean)
          .join(' '),
      },
    ];
  });
}
