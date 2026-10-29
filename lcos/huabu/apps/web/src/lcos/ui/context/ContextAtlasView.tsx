import { motion, useIsPresent, useReducedMotion } from 'motion/react';

import { ContextAtlasLayout } from './ContextAtlasLayout';
import { useHudObstacleRects } from '../../navigation/useHudObstacleRects';
import { LightCurtainBackdrop, LightCurtainDismissPlane } from '../spatial/LightCurtainBackdrop';
import { PRESENTATION_EXIT } from '../spatial/presentationMotion';
import { useLayerReturnFocus } from '../spatial/useLayerReturnFocus';

import './context-spatial.css';
import type { CSSProperties, ReactNode } from 'react';

export interface ContextAtlasViewProps {
  readonly header: ReactNode;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly ariaLabel?: string;
}

/** Kept alive by ContextWorksite's existing-state conditional inside AnimatePresence. */
export function ContextAtlasView({ header, children, onClose, ariaLabel = '集合总览' }: ContextAtlasViewProps): React.JSX.Element {
  const present = useIsPresent();
  const reduced = Boolean(useReducedMotion());
  const layer = useLayerReturnFocus(present);
  // Read existing HUD geometry; the light curtain never moves its navigation owners.
  const hud = useHudObstacleRects('[data-lcos-shell-project-cluster],[data-lcos-navigator-island]');
  const safeTop = Math.max(0, ...hud.map((rect) => rect.y + rect.height + 12));
  return (
    <motion.div
      ref={layer}
      data-lcos-context-atlas
      data-presentation-present={present ? 'true' : 'false'}
      className="lcos-atlas-light-curtain"
      style={{ '--lcos-atlas-safe-top': `${safeTop}px` } as CSSProperties}
      role="region"
      aria-label={ariaLabel}
      aria-hidden={!present || undefined}
      inert={!present || undefined}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduced ? { duration: 0 } : PRESENTATION_EXIT}
    >
      <LightCurtainBackdrop kind="atlas" />
      <LightCurtainDismissPlane disabled={!present} onClose={onClose} />
      <ContextAtlasLayout header={header}>{children}</ContextAtlasLayout>
    </motion.div>
  );
}
