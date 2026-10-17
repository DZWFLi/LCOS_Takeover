// Lifted from GEN1 ObjectOrbit.tsx. Only motion channels; no overlay/selection/command owner.
import type { Variants } from 'motion/react';

const SATELLITE_STAGGER = 0.06
/** 收场时长：与 LcosPopover 退场窗口同款（200ms） */
const SATELLITE_EXIT_DURATION = 0.2

export interface SatelliteCustom {
  readonly dx: number
  readonly dy: number
}

export const ringVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: SATELLITE_STAGGER, delayChildren: 0.02 } },
  exiting: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
}

export const satelliteVariants: Variants = {
  hidden: (custom: SatelliteCustom) => ({ opacity: 0, scale: 0.66, x: custom.dx, y: custom.dy }),
  visible: {
    opacity: 1,
    scale: 1,
    x: 0,
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 25 },
  },
  exiting: (custom: SatelliteCustom) => ({
    opacity: 0,
    scale: 0.8,
    x: custom.dx * 0.35,
    y: custom.dy * 0.35,
    transition: { duration: SATELLITE_EXIT_DURATION, ease: 'easeOut' },
  }),
}
