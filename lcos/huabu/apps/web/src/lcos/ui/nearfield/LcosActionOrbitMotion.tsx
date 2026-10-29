import { motion, useIsPresent } from 'motion/react';

import { ringVariants } from './objectOrbitMotion';
import { useReducedSpatialMotion } from '../motion/useReducedSpatialMotion';

import type { ComponentPropsWithoutRef, ReactNode } from 'react';

/** GEN1 ObjectOrbit motion layer only; current container owns visibility and placement. */
export function LcosActionOrbitMotion({ children, width, height }: {
  readonly children: ReactNode;
  readonly width: number;
  readonly height: number;
}): React.JSX.Element {
  const reduced = useReducedSpatialMotion();
  const present = useIsPresent();
  return (
    <motion.div
      data-lcos-action-arc-orbit
      data-lcos-orbit-motion={reduced ? 'reduced' : 'gen1'}
      aria-hidden={!present}
      initial={reduced ? false : 'hidden'}
      animate="visible"
      exit="exiting"
      variants={reduced ? { hidden: {}, visible: {}, exiting: { opacity: 0, transition: { duration: 0 } } } : ringVariants}
      style={{ position: 'relative', width, height, pointerEvents: present ? undefined : 'none' }}
    >
      {children}
    </motion.div>
  );
}

/** Exiting UI cannot dispatch stale commands. The real owner still decides open/closed. */
export function LcosActionArcMotionHost(props: ComponentPropsWithoutRef<'div'>): React.JSX.Element {
  const present = useIsPresent();
  return <div {...props} inert={present ? undefined : true} aria-hidden={present ? undefined : true} />;
}
