/** History headings use the viewer's calendar day; timestamps stay unchanged. */
export function nativeHistoryLocalDateKey(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const day = new Date(value + 'T00:00:00Z');
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value ? value : '';
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}
