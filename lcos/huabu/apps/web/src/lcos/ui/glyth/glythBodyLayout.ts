/** Body geometry only. Density remains owned by useLcosDensity; world geometry is never written. */
export function glythBodyLayout(width = 121, height = 142, zoom = 1) {
  const w = Number.isFinite(width) && width > 0 ? width : 121;
  const h = Number.isFinite(height) && height > 0 ? height : 142;
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const nominal = Math.min(92, w * 92 / 121, h * 92 / 142);
  // Preserve the identity silhouette in the far field. No 34/92 density switch.
  // Compensation is continuous and stays inside the same authoritative node box.
  const size = Math.min(w * .9, h * .8, Math.max(nominal, 36 / scale));
  const centerX = w * 55 / 121;
  return { size, left: Math.max(0, centerX - size / 2), top: 0,
    labelTop: Math.min(h - 20, Math.max(size + 10, h * 108 / 142)),
    labelWidth: w, labelSize: Math.max(11, 10.5 / scale), labelLeading: Math.max(18, 16 / scale) };
}
