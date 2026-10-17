export interface RailwayPresentationPreference { readonly columns: 'auto' | 1 | 2; readonly hiddenKeys: readonly string[] }
const storageKey = (projectId: string): string => `lcos-railway-ui:${encodeURIComponent(projectId)}`;
/** Disposable presentation preferences only: no Graph/membership/camera data. */
export function readRailwayPresentationPreference(projectId: string): RailwayPresentationPreference {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(projectId)) ?? 'null');
    if (value && typeof value === 'object') {
      const record = value as Record<string,unknown>;
      return { columns: record.columns === 1 || record.columns === 2 ? record.columns : 'auto',
        hiddenKeys: Array.isArray(record.hiddenKeys) ? record.hiddenKeys.filter((key): key is string => typeof key === 'string') : [] };
    }
  } catch { /* A disposable preference must not prevent the real project opening. */ }
  return { columns: 'auto',hiddenKeys: [] };
}
export function saveRailwayPresentationPreference(projectId: string, value: RailwayPresentationPreference): void {
  try { localStorage.setItem(storageKey(projectId),JSON.stringify(value)); }
  catch { /* Session presentation still works when browser preference storage is denied. */ }
}
