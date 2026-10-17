export interface PopoverHitRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
const overlap = (a: PopoverHitRect, b: PopoverHitRect): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Local presentation adjustment only. No collision means the original anchor remains exact. */
export function avoidNearbyControls(origin: { x: number; y: number }, hits: readonly PopoverHitRect[],
  obstacles: readonly PopoverHitRect[], boundary: PopoverHitRect, maxShift = 48): { x: number; y: number } {
  const at = (dx: number, dy: number) => hits.map((hit) => ({ ...hit, x: origin.x + hit.x + dx, y: origin.y + hit.y + dy }));
  const area = (rects: readonly PopoverHitRect[]) => rects.reduce((sum, hit) => sum + obstacles.reduce((n, obstacle) => n + overlap(hit, obstacle), 0), 0);
  const initialArea = area(at(0, 0));
  if (initialArea === 0) return origin;
  const xs = new Set([0]); const ys = new Set([0]);
  const limit = Math.max(0, maxShift);
  for (const hit of at(0, 0)) for (const obstacle of obstacles) {
    for (const delta of [obstacle.x - hit.x - hit.width - 4, obstacle.x + obstacle.width - hit.x + 4]) if (Math.abs(delta) <= limit) xs.add(delta);
    for (const delta of [obstacle.y - hit.y - hit.height - 4, obstacle.y + obstacle.height - hit.y + 4]) if (Math.abs(delta) <= limit) ys.add(delta);
  }
  let best = { x: origin.x, y: origin.y, area: initialArea, distance: 0 };
  for (const dx of xs) for (const dy of ys) {
    const distance = Math.hypot(dx, dy);
    if (distance > limit) continue;
    const rects = at(dx, dy);
    if (rects.some((r) => r.x < boundary.x || r.y < boundary.y || r.x + r.width > boundary.x + boundary.width || r.y + r.height > boundary.y + boundary.height)) continue;
    const nextArea = area(rects);
    if (nextArea < best.area || (nextArea === best.area && distance < best.distance)) best = { x: origin.x + dx, y: origin.y + dy, area: nextArea, distance };
  }
  return best.area < initialArea ? { x: best.x, y: best.y } : origin;
}
