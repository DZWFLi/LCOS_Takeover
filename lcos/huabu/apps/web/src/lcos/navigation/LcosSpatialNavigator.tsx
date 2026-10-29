// LCOS Spatial Navigator is presentation only. Every action and state below
// is produced by the current Huabu Canvas / React Flow context.
import {
  Grid3X3,
  Lock,
  Map,
  Maximize2,
  Minus,
  Plus,
  Unlock,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { TapnowMiniMap } from './TapnowMiniMap';
import { useAvoidingHudPosition } from './useAvoidingHudPosition';
import { useHudViewport } from './useHudViewport';
import { useLcosShellStore } from '../shell/lcosShellStore';
import { LcosSpatialNavigatorView } from '../ui/families/LcosSpatialNavigatorView';
import '../ui/nearfield/spatial-navigator-gen1.css';

import type { CanvasSpatialNavigatorControls } from '@/lcos-seam/types';

export function LcosSpatialNavigator(
  controls: CanvasSpatialNavigatorControls,
): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const requestCamera = useLcosShellStore((state) => state.requestCamera);
  const miniMap = controls.minimapEnabled ? <TapnowMiniMap /> : null;
  const edgesVisible = controls.edgesVisible;
  const viewport = useHudViewport();
  const toggleExpanded = (): void => {
    if (expanded) setMapExpanded(false);
    setExpanded((value) => !value);
  };
  const toggleMap = (): void => {
    const next = !mapExpanded;
    if (next && !controls.minimapEnabled) controls.toggleMinimap();
    setMapExpanded(next);
  };
  // A compact tool island must yield when the user returns to the canvas.
  // Capture only observes the gesture; the clicked Canvas/Window still receives
  // its pointer event and the existing Huabu camera/selection remains owner.
  useEffect(() => {
    if (!expanded) return undefined;
    const onOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      // Pin/menu actions are part of the same navigation tool cluster: keep
      // the map visible while its canonical color-group members highlight.
      if (target instanceof Element && target.closest('[data-lcos-spatial-navigator-host],[data-lcos-navigator-island],[data-lcos-color-pin-hud],.lcos-tapnow-pin-menu,[data-lcos-pin-overflow]')) return;
      setMapExpanded(false);
      setExpanded(false);
    };
    document.addEventListener('pointerdown', onOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', onOutsidePointerDown, true);
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !(event.target instanceof Element)
        || !event.target.closest('[data-lcos-spatial-navigator-host]')) return;
      event.preventDefault();
      event.stopPropagation();
      if (mapExpanded) setMapExpanded(false);
      else setExpanded(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expanded, mapExpanded]);
  const placement = useAvoidingHudPosition({ x: 24, y: viewport.height - 24, width: expanded ? 232 : 52,
    height: expanded ? (mapExpanded ? 260 : 102) : 48 }, { y: 'end' }, '[data-lcos-surface-dock]');

  return (
    <div ref={placement.ref} data-lcos-spatial-navigator-host className="pointer-events-auto fixed z-40"
      style={{ left: placement.rect.x, top: placement.rect.y }}>
    <LcosSpatialNavigatorView
      style={{ position: 'relative', left: 0, bottom: 'auto' }}
      zoom={controls.zoom}
      minimapEnabled={controls.minimapEnabled}
      gridEnabled={controls.gridEnabled}
      edgesVisible={edgesVisible}
      interactivityLocked={controls.interactivityLocked}
      miniMap={miniMap}
      expanded={expanded}
      mapExpanded={mapExpanded}
      onToggleExpanded={toggleExpanded}
      onToggleMap={toggleMap}
      onZoomOut={() => requestCamera('zoom-out')}
      onResetZoom={() => requestCamera('reset')}
      onZoomIn={() => requestCamera('zoom-in')}
      onFit={() => requestCamera('fit')}
      onToggleInteractivity={controls.toggleInteractivity}
      onToggleMinimap={controls.toggleMinimap}
      onToggleGrid={controls.toggleGrid}
      onToggleEdges={controls.toggleEdges}
      zoomOutIcon={<Minus aria-hidden size={17} />}
      zoomInIcon={<Plus aria-hidden size={17} />}
      fitIcon={<Maximize2 aria-hidden size={17} />}
      lockIcon={controls.interactivityLocked
        ? <Lock aria-hidden size={17} />
        : <Unlock aria-hidden size={17} />}
      minimapIcon={<Map aria-hidden size={17} />}
      gridIcon={<Grid3X3 aria-hidden size={17} />}
    />
    </div>
  );
}
