/** Restored from CURRENT WorkflowCardPool.tsx@802b7a5, removed by Stage5. */
export function filterWorkflowTitles<T extends { readonly title?: string | null }>(
  items: readonly T[], query: string,
): readonly T[] {
  const q = query.trim().toLowerCase();
  if (q === '') return items;
  return items.filter((item) => (item.title ?? '').toLowerCase().includes(q));
}
