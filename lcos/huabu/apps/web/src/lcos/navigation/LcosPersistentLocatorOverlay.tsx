import { computeLocatorGeometry, toScreenRect } from '@local-creative-os/web-gen2';
import { useReactFlow, useViewport } from '@xyflow/react';
import { useEffect, useState } from 'react';

import { Tooltip } from '@/components/Common/Tooltip';
import { getReliableNodeBounds } from '@/components/Panels/CanvasLayerPanel/focusNodesOnCanvas';
import useCanvasStore from '@/store/canvasStore';

import { LcosLocatorCluster } from './LcosLocatorCluster';
import { projectLocatorDensity } from './locatorDensity';
import { layoutLocatorMarkers } from './locatorMarkerLayout';
import { LOCATOR_HUD_OBSTACLES, useHudObstacleRects } from './useHudObstacleRects';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { LcosSpatialCursorMark } from './LcosSpatialCursorMark';
import { useHudViewport } from './useHudViewport';
import { useOptionalLcosColorPins } from '../pin/LcosColorPinProvider';
import { projectedPinTargets, type ProjectedPinTarget } from '../pin/projectedPinTargets';
import { useLcosShellStore } from '../shell/lcosShellStore';
import { lcosTokens } from '../ui/lcosTokens';

/** Screen-space projection of actual marked or explicitly selected objects. No camera/state owner. */
export function LcosPersistentLocatorOverlay(): React.JSX.Element | null {
  const rf = useReactFlow();
  const viewport = useViewport();
  const screen = useHudViewport();
  const hudObstacles = useHudObstacleRects(LOCATOR_HUD_OBSTACLES);
  const nodes = useCanvasStore((state) => state.nodes);
  const canvasId = useCanvasStore((state) => state.canvasId);
  const refs = useLcosReferenceStore((state) => state.nodeEntityRefs);
  const pin = useOptionalLcosColorPins();
  const environment = useLcosShellStore((state) => state.windowEnvironment);
  const surface = useLcosShellStore((state) => state.activeSurface);
  const request = useLcosShellStore((state) => state.locateRequest);
  const requestLocate = useLcosShellStore((state) => state.requestLocate);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [expandedCluster,setExpandedCluster]=useState<string>();
  useEffect(() => {
    const root = document.querySelector('.react-flow');
    if (!(root instanceof HTMLElement)) { setRect(null); return; }
    const measure = (): void => setRect(root.getBoundingClientRect());
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(root);
    return () => observer?.disconnect();
  }, [canvasId, screen.width, screen.height]);
  if (!rect || rect.width <= 0 || rect.height <= 0 || !canvasId) return null;
  const safe = environment?.safeRect;
  const safeRect = { left: Math.max(rect.left, safe?.x ?? rect.left), top: Math.max(rect.top, safe?.y ?? rect.top),
    right: Math.min(rect.right, safe ? safe.x + safe.width : rect.right), bottom: Math.min(rect.bottom, safe ? safe.y + safe.height : rect.bottom) };
  if (safeRect.right - safeRect.left < 64 || safeRect.bottom - safeRect.top < 64) return null;
  const pinned = pin ? projectedPinTargets(nodes, refs, pin) : [];
  const pinnedIds = new Set(pinned.map((target) => target.nodeId));
  const selected: ProjectedPinTarget[] = nodes.filter((node) => node.selected && !node.hidden && !pinnedIds.has(node.id))
    .map((node) => ({ nodeId: node.id, label: refs.get(node.id)?.descriptor?.title ?? refs.get(node.id)?.displayLabel ?? '所选对象', colors: [] }));
  const occupied = [...(environment?.occupiedRects ?? []), ...hudObstacles].map(toScreenRect);
  const currentRequestTargets = new Set(request?.nodeIds ?? (request?.nodeId ? [request.nodeId] : []));
  const candidates = [...pinned, ...selected].flatMap((target) => {
    if (currentRequestTargets.has(target.nodeId)) return [];
    const bounds = getReliableNodeBounds(rf, [target.nodeId]);
    if (!bounds) return [];
    const targetRect = { left: rect.left + bounds.x * viewport.zoom + viewport.x,
      top: rect.top + bounds.y * viewport.zoom + viewport.y,
      right: rect.left + (bounds.x + bounds.width) * viewport.zoom + viewport.x,
      bottom: rect.top + (bounds.y + bounds.height) * viewport.zoom + viewport.y };
    const geometry = computeLocatorGeometry({ targetRect, safeRect, edgeInset: 26, nearEdgeDistance: 72 });
    // Local marks belong to the node agent. Locator only takes over as the target approaches the edge.
    if (geometry.state === 'local') return [];
    // `geometry.state` is narrowed to 'near-edge' | 'edge' after the guard above,
    // but storing the whole `geometry` object widens it back to LocatorStateKind.
    // Capture the narrowed phase so the cursor mark gets a truthful discriminant.
    const phase = geometry.state;
    const edge = geometry.edgeAnchor ?? geometry.directionAnchor ?? geometry.targetCenter;
    const progress = geometry.progress;
    const origin = { x: targetRect.right - 10, y: targetRect.top + 10 };
    const anchor = { x: origin.x + (edge.x - origin.x) * progress,
      y: origin.y + (edge.y - origin.y) * progress };
    return [{ target, geometry, phase, progress, anchor, edge }];
  });
  const selectedIds=new Set(nodes.filter(node=>node.selected).map(node=>node.id));
  const density=projectLocatorDensity(candidates.map(candidate=>{
    const color=candidate.target.colors[0];
    const definition=pin?.snapshot.definitions.find(item=>item.color===color);
    const direction=candidate.geometry.direction;
    const horizontal=Math.abs(direction.x)>=Math.abs(direction.y);
    return {...candidate,id:candidate.target.nodeId,label:candidate.target.label,x:candidate.anchor.x,y:candidate.anchor.y,
      selected:selectedIds.has(candidate.target.nodeId),surface,phase:candidate.phase,
      edge:horizontal?direction.x<0?'left':'right':direction.y<0?'top':'bottom',
      groupKey:definition?.id??'navigation',groupLabel:definition?.label??'空间标记'};
  }),viewport.zoom);
  const singles=density.flatMap(projection=>projection.kind==='marker'?[projection.marker]:[]);
  const clusters=density.flatMap(projection=>projection.kind==='cluster'?[projection]:[]);
  const positions = layoutLocatorMarkers(singles.map(({ target, anchor, edge: _edge, geometry }) => ({
    id: target.nodeId, ...anchor, edgeX: (geometry.edgeAnchor??geometry.targetCenter).x, edgeY: (geometry.edgeAnchor??geometry.targetCenter).y, width: 44, height: 44,
  })), safeRect, occupied);
  const clusterPositions=layoutLocatorMarkers(clusters.map(cluster=>({id:cluster.id,x:cluster.x,y:cluster.y,edgeX:cluster.x,edgeY:cluster.y,width:44,height:44})),
    safeRect,[...occupied,...positions.map(position=>({left:position.x-26,top:position.y-26,right:position.x+26,bottom:position.y+26}))]);
  const markers = singles.map(({ target, phase, geometry, progress }, index) => {
    const anchor = positions[index];
    if (!anchor) return null;
    const color = target.colors[0] ?? lcosTokens.color.accent;
    const pinSummary = target.colors.length === 0 ? '' : ` · ${target.colors.length} 个颜色组`;
    const angle = Math.atan2(geometry.direction.y, geometry.direction.x) * 180 / Math.PI;
    const horizontal = Math.abs(geometry.direction.x) >= Math.abs(geometry.direction.y);
    const labelPlacement = horizontal
      ? geometry.direction.x < 0 ? 'right' as const : 'left' as const
      : geometry.direction.y < 0 ? 'below' as const : 'above' as const;
    return <Tooltip key={target.nodeId} content={`${target.label}${pinSummary}`}>
      <button type="button" data-lcos-persistent-locator={geometry.state}
        data-lcos-locator-node={target.nodeId} data-lcos-locator-crowded={anchor.crowded || undefined}
        data-lcos-locator-kind={target.colors.length > 0 ? 'pin-target' : 'selection'}
        aria-label={`前往 ${target.label}${target.colors.length > 0 ? `（属于 ${target.colors.length} 个颜色组）` : ''}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); requestLocate({ reqId: crypto.randomUUID(), surface, canvasId,
          nodeId: target.nodeId, status: 'projected', preserveSelection: true }); }}
        className="pointer-events-auto fixed z-[64] grid h-11 w-11 place-items-center rounded-full border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ left: anchor.x, top: anchor.y, transform: 'translate(-50%, -50%)' }}>
        <LcosSpatialCursorMark surface={surface} phase={phase} angleDeg={angle} progress={progress}
          accent={color} badge={target.colors.length} labelPlacement={labelPlacement}
          label={geometry.state === 'edge' ? target.label : undefined} />
      </button>
    </Tooltip>;
  });
  return <>{markers}{clusters.map((cluster,index)=><LcosLocatorCluster key={cluster.id} id={cluster.id} x={clusterPositions[index]?.x??cluster.x} y={clusterPositions[index]?.y??cluster.y}
    members={cluster.members} surface={surface} expanded={expandedCluster===cluster.id}
    onExpandedChange={open=>setExpandedCluster(open?cluster.id:undefined)}
    onLocate={nodeIds=>requestLocate({reqId:crypto.randomUUID(),surface,canvasId,nodeId:nodeIds[0],nodeIds,status:'projected',preserveSelection:true})} />)}</>;
}
