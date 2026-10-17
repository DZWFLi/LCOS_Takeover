/**
 * GEN1 ObjectOrbit.tsx @3e99769: visible spring 400/25; exiting duration .2.
 * The existing Motion runtime owns interpolation and velocity. No new clock.
 * Figma 5392:4932 / 5392:4890 supplies pose/curtain semantics, not a timeline.
 */
export const PRESENTATION_SPRING = { type: 'spring', stiffness: 400, damping: 25 } as const;
export const PRESENTATION_EXIT = { duration: 0.2, ease: 'easeOut' } as const;

export function presentationPose(reduced: boolean, focused: boolean, disabled = false) {
  const attention = focused && !disabled && !reduced;
  return { opacity: 1, y: attention ? -8 : 0, scale: attention ? 1.025 : 1 };
}
