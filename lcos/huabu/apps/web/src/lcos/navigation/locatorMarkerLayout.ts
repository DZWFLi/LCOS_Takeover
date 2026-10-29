/** T2 C2-3A §§24/52–54: place each exact cue in screen space, never mutate the camera. */
export interface LocatorRect { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
export interface LocatorMarkerInput { readonly id: string; readonly x: number; readonly y: number; readonly edgeX: number; readonly edgeY: number; readonly width: number; readonly height: number }
export interface LocatorMarkerPlacement { readonly id: string; readonly x: number; readonly y: number; readonly crowded: boolean }
const GAP = 6;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(v, b));
const overlaps = (a: LocatorRect, b: LocatorRect) => a.left < b.right + GAP && a.right > b.left - GAP && a.top < b.bottom + GAP && a.bottom > b.top - GAP;

/** Full hit rectangles, deterministic per target. Same-edge positions are preferred, then an inner lane. No synthetic group/hidden member. */
export function layoutLocatorMarkers(markers: readonly LocatorMarkerInput[], safe: LocatorRect, obstacles: readonly LocatorRect[]): readonly LocatorMarkerPlacement[] {
  const occupied = [...obstacles];
  const placed = new Map<string, LocatorMarkerPlacement>();
  const edgeOf = (m: LocatorMarkerInput): 'left' | 'right' | 'top' | 'bottom' => {
    const edges = [['left', Math.abs(m.edgeX - safe.left)], ['right', Math.abs(m.edgeX - safe.right)], ['top', Math.abs(m.edgeY - safe.top)], ['bottom', Math.abs(m.edgeY - safe.bottom)]] as const;
    return [...edges].sort((a,b) => a[1] - b[1])[0]![0];
  };
  // Target ordering does not depend on a Pin snapshot's iteration order.
  const ordered = [...markers].sort((a,b) => edgeOf(a).localeCompare(edgeOf(b)) || (edgeOf(a) === 'left' || edgeOf(a) === 'right' ? a.y-b.y : a.x-b.x) || a.id.localeCompare(b.id));
  for (const m of ordered) {
    const halfW = m.width/2, halfH = m.height/2;
    const minX = safe.left+halfW+6, maxX = Math.max(minX,safe.right-halfW-6);
    const minY = safe.top+halfH+6, maxY = Math.max(minY,safe.bottom-halfH-6);
    const desired = { x: clamp(m.x,minX,maxX), y: clamp(m.y,minY,maxY) };
    const edge = edgeOf(m), vertical = edge === 'left' || edge === 'right';
    const makeRect = (p: { x:number;y:number }): LocatorRect => ({left:p.x-halfW,right:p.x+halfW,top:p.y-halfH,bottom:p.y+halfH});
    const available = (p: {x:number;y:number}) => !occupied.some((o) => overlaps(makeRect(p),o));
    let choice: {x:number;y:number}|undefined = available(desired) ? desired : undefined;
    if (!choice) {
      const candidates: {x:number;y:number}[] = [];
      // Dense rays continue along their true edge; additional lanes stay parallel to it.
      const laneStep = (vertical ? m.width : m.height)+GAP;
      const axisStep = (vertical ? m.height : m.width)+GAP;
      const laneCount = Math.floor(((vertical ? maxX-minX : maxY-minY))/laneStep)+1;
      const axisMin = vertical ? minY : minX, axisMax = vertical ? maxY : maxX;
      const initialAxis = vertical ? desired.y : desired.x;
      const axes = [initialAxis, axisMin, axisMax];
      for (let offset=axisStep; offset<=axisMax-axisMin+axisStep; offset+=axisStep) axes.push(clamp(initialAxis-offset,axisMin,axisMax),clamp(initialAxis+offset,axisMin,axisMax));
      // Obstacle edges supply exact feasible slots instead of leaving avoidable gaps.
      for (const o of occupied) axes.push(clamp((vertical?o.top:o.left)-(vertical?halfH:halfW)-GAP,axisMin,axisMax),clamp((vertical?o.bottom:o.right)+(vertical?halfH:halfW)+GAP,axisMin,axisMax));
      for (let lane=0; lane<laneCount; lane++) {
        const normal = edge === 'right' ? maxX-lane*laneStep : edge === 'left' ? minX+lane*laneStep : edge === 'bottom' ? maxY-lane*laneStep : minY+lane*laneStep;
        for(const axis of new Set(axes)) candidates.push(vertical ? {x:normal,y:axis} : {x:axis,y:normal});
      }
      const cost=(p:{x:number;y:number})=>vertical ? Math.abs(p.x-desired.x)*4+Math.abs(p.y-desired.y) : Math.abs(p.y-desired.y)*4+Math.abs(p.x-desired.x);
      choice = candidates.filter(available).sort((a,b)=>cost(a)-cost(b)||a.y-b.y||a.x-b.x)[0];
    }
    // Physically exhausted viewport stays explicit; callers never silently discard identities.
    const final = choice ?? desired;
    occupied.push(makeRect(final)); placed.set(m.id,{ id:m.id,...final,crowded:choice===undefined });
  }
  return markers.map((m)=>placed.get(m.id)!);
}
