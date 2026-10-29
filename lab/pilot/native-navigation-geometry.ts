export type NavigationRect = { left: number; top: number; right: number; bottom: number };
export type NativeNavigationMarker = {
  id: string; x: number; y: number; angle: number;
  phase: 'local' | 'edge'; edge: 'left' | 'right' | 'top' | 'bottom'; progress: number;
};
export type NativeNavigationMarkerCluster = NativeNavigationMarker & { members: readonly NativeNavigationMarker[] };
type Edge = NativeNavigationMarker['edge'];

// Coordinates are screen pixels and x/y are the centre of one 44px hit area.
const RADIUS = 22, OBSTACLE_GAP = 4, LOCAL_GAP = 6;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const rectIsValid = (r: NavigationRect | undefined): r is NavigationRect => !!r
  && [r.left, r.top, r.right, r.bottom, r.right - r.left, r.bottom - r.top].every(Number.isFinite)
  && r.right >= r.left && r.bottom >= r.top;
const verticalEdge = (edge: Edge) => edge === 'left' || edge === 'right';
function outsideEdge(target: NavigationRect, safe: NavigationRect): Edge {
  const distances: [Edge, number][] = [
    ['right', target.left - safe.right], ['top', safe.top - target.bottom],
    ['left', safe.left - target.right], ['bottom', target.top - safe.bottom],
  ];
  // A separated target must have at least one non-negative rectangle gap.
  // Do not mistake a very wide target above the Canvas for a right-hand one.
  return distances.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}
function inflated(rect: NavigationRect, radius: number): NavigationRect {
  return { left: rect.left - radius, top: rect.top - radius, right: rect.right + radius, bottom: rect.bottom + radius };
}
function nearestFreeCoordinate(preferred: number, min: number, max: number, intervals: [number, number][]): number | undefined {
  const blocked = intervals.filter(([a, b]) => b > min && a < max).sort((a, b) => a[0] - b[0]);
  const free: [number, number][] = [];
  let cursor = min;
  for (const [a, b] of blocked) {
    if (a > cursor) free.push([cursor, Math.min(a, max)]);
    cursor = Math.max(cursor, b);
    if (cursor > max) break;
  }
  if (cursor <= max) free.push([cursor, max]);
  let best: number | undefined;
  for (const [a, b] of free) {
    if (a > b) continue;
    const point = clamp(preferred, a, b);
    if (best === undefined || Math.abs(point - preferred) < Math.abs(best - preferred)) best = point;
  }
  return best;
}

function coordinateOnSide(normal: number, vertical: boolean, preferred: number, min: number, max: number,
  obstacles: readonly NavigationRect[]): number | undefined {
  if (min > max) return undefined;
  const intervals: [number, number][] = [];
  for (const obstacle of obstacles) {
    if (vertical ? normal > obstacle.left && normal < obstacle.right : normal > obstacle.top && normal < obstacle.bottom)
      intervals.push(vertical ? [obstacle.top, obstacle.bottom] : [obstacle.left, obstacle.right]);
  }
  return nearestFreeCoordinate(preferred, min, max, intervals);
}

/** One marker per target. A visible target gets a local Pin outside its body;
 * only a truly separated target gets an edge arrow. No safe local slot returns
 * undefined for the existing directory, never a fake offscreen state.
 * The last still-feasible local side wins to avoid anchor chatter. Its actual
 * position follows the target and obstacles, not a stale screen coordinate.
 * progress selects the existing CSS Pin/arrow transition rather than deriving
 * visibility from one preferred corner's clearance. */
export function projectNativeNavigationMarker(input: {
  id: string; targetRect: NavigationRect; safeRect: NavigationRect;
  obstacles?: NavigationRect[]; previousPhase?: 'local' | 'edge';
  previousMarker?: NativeNavigationMarker;
}): NativeNavigationMarker | undefined {
  if (!input || typeof input.id !== 'string' || !input.id.trim()
    || !rectIsValid(input.targetRect) || !rectIsValid(input.safeRect)) return undefined;
  const { targetRect: target, safeRect: safe } = input;
  if (target.right <= target.left || target.bottom <= target.top) return undefined;
  if (safe.right - safe.left < RADIUS * 2 || safe.bottom - safe.top < RADIUS * 2) return undefined;
  const inner = { left: safe.left + RADIUS, top: safe.top + RADIUS, right: safe.right - RADIUS, bottom: safe.bottom - RADIUS };
  const anchorX = target.right + RADIUS + LOCAL_GAP, anchorY = target.top + RADIUS;
  if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) return undefined;
  const obstacles = (Array.isArray(input.obstacles) ? input.obstacles : []).filter(rectIsValid)
    .map(r => inflated(r, RADIUS + OBSTACLE_GAP));
  const targetX = target.left + (target.right - target.left) / 2, targetY = target.top + (target.bottom - target.top) / 2;
  const marker = (x: number, y: number, edge: Edge, phase: 'local' | 'edge'): NativeNavigationMarker | undefined => {
    const angle = Math.atan2(targetY - y, targetX - x);
    return [x, y, angle].every(Number.isFinite) ? { id: input.id, x, y, angle, phase, edge, progress: phase === 'local' ? 0 : 1 } : undefined;
  };
  const visible = Math.min(target.right, safe.right) > Math.max(target.left, safe.left)
    && Math.min(target.bottom, safe.bottom) > Math.max(target.top, safe.top);
  if (visible) {
    const prior = input.previousMarker;
    const sides: Edge[] = ['right', 'left', 'top', 'bottom'];
    // previousPhase remains accepted for existing callers, but cannot override
    // actual visibility. Only a valid same-target local side is a layout hint.
    if (prior?.id === input.id && prior.phase === 'local' && validMarker(prior)) {
      sides.splice(sides.indexOf(prior.edge), 1); sides.unshift(prior.edge);
    }
    for (const side of sides) {
      const vertical = verticalEdge(side);
      const normal = side === 'right' ? anchorX : side === 'left' ? target.left - RADIUS - LOCAL_GAP
        : side === 'top' ? target.top - RADIUS - LOCAL_GAP : target.bottom + RADIUS + LOCAL_GAP;
      if (!Number.isFinite(normal) || normal < (vertical ? inner.left : inner.top) || normal > (vertical ? inner.right : inner.bottom)) continue;
      // Keep the Pin alongside the target, not arbitrarily far up/down its
      // screen edge after an obstacle. A different safe target side may win.
      const first = vertical ? target.top + RADIUS : target.left + RADIUS;
      const last = Math.max(first, vertical ? target.bottom - RADIUS : target.right - RADIUS);
      const available = coordinateOnSide(normal, vertical, first,
        Math.max(first, vertical ? inner.top : inner.left), Math.min(last, vertical ? inner.bottom : inner.right), obstacles);
      if (available !== undefined) return vertical ? marker(normal, available, side, 'local') : marker(available, normal, side, 'local');
    }
    return undefined;
  }
  const edge = outsideEdge(target, safe), vertical = verticalEdge(edge);
  const normal = edge === 'left' ? inner.left : edge === 'right' ? inner.right : edge === 'top' ? inner.top : inner.bottom;
  const available = coordinateOnSide(normal, vertical, vertical ? anchorY : anchorX,
    vertical ? inner.top : inner.left, vertical ? inner.bottom : inner.right, obstacles);
  return available === undefined ? undefined : vertical ? marker(normal, available, edge, 'edge') : marker(available, normal, edge, 'edge');
}

const angleDistance = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
function validMarker(marker: NativeNavigationMarker): boolean {
  return !!marker && typeof marker.id === 'string' && !!marker.id.trim()
    && [marker.x, marker.y, marker.angle, marker.progress].every(Number.isFinite)
    && marker.progress >= 0 && marker.progress <= 1 && ['local', 'edge'].includes(marker.phase)
    && ['left', 'right', 'top', 'bottom'].includes(marker.edge);
}
/** Groups adjacent edge markers with compatible directions. Every pair must fit
 * maxAngle (capped at 90deg), so a chain cannot merge opposing destinations.
 * Local markers remain individual; members preserve the exact input objects. */
export function clusterNativeNavigationMarkers(markers: readonly NativeNavigationMarker[], options: {
  maxGap?: number; maxAngle?: number;
} = {}): NativeNavigationMarkerCluster[] {
  const maxGap = Number.isFinite(options.maxGap) ? Math.max(0, options.maxGap!) : 48;
  const maxAngle = Number.isFinite(options.maxAngle) ? clamp(options.maxAngle!, 0, Math.PI / 2) : Math.PI / 3;
  const seen = new Set<string>(), groups: NativeNavigationMarker[][] = [], edges: Edge[] = ['left', 'right', 'top', 'bottom'];
  const valid = (Array.isArray(markers) ? markers : []).filter(marker => {
    if (!validMarker(marker) || seen.has(marker.id)) return false;
    seen.add(marker.id); return true;
  });
  for (const marker of valid.filter(m => m.phase === 'local')) groups.push([marker]);
  for (const edge of edges) {
    const coordinate = (m: NativeNavigationMarker) => verticalEdge(edge) ? m.y : m.x;
    const sorted = valid.filter(m => m.phase === 'edge' && m.edge === edge)
      .sort((a, b) => coordinate(a) - coordinate(b) || a.id.localeCompare(b.id));
    let group: NativeNavigationMarker[] | undefined;
    for (const marker of sorted) {
      if (!group || coordinate(marker) - coordinate(group[group.length - 1]!) > maxGap
        || !group.every(member => angleDistance(member.angle, marker.angle) <= maxAngle)) {
        group = []; groups.push(group);
      }
      group.push(marker);
    }
  }
  return groups.map(members => {
    if (members.length === 1) return { ...members[0]!, members };
    const first = members[0]!, count = members.length;
    const mean = (key: 'x' | 'y' | 'progress') => members.reduce((sum, m) => sum + m[key] / count, 0);
    const centre = mean(verticalEdge(first.edge) ? 'y' : 'x');
    const coordinate = (m: NativeNavigationMarker) => verticalEdge(first.edge) ? m.y : m.x;
    // The mean may sit inside a control both members successfully avoided.
    // Keep a previously valid member position instead of inventing that point.
    const representative = members.reduce((best, m) => Math.abs(coordinate(m) - centre) < Math.abs(coordinate(best) - centre) ? m : best);
    return { ...first, id: `navigation-cluster:${first.edge}:${members.map(m => encodeURIComponent(m.id)).join('|')}`,
      x: representative.x, y: representative.y, progress: mean('progress'),
      angle: Math.atan2(members.reduce((sum, m) => sum + Math.sin(m.angle), 0), members.reduce((sum, m) => sum + Math.cos(m.angle), 0)), members };
  });
}

