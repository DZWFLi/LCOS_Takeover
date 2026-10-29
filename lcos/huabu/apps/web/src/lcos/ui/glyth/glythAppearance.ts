import { GLYTH_COLORS, GLYTH_SHAPES } from './vendor/grok-replica/renderer.js';

/** Presentation only; the same native node stores its chosen appearance. */
export interface GlythAppearance {
  readonly shape: string;
  readonly color: string;
  readonly motion: 'idle' | 'curious';
}
export const DEFAULT_GLYTH_APPEARANCE: GlythAppearance = {
  shape: 'blob',
  color: 'black',
  motion: 'idle',
};
export function readGlythAppearance(
  value: unknown,
): GlythAppearance | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  return typeof item.shape === 'string' &&
    GLYTH_SHAPES.includes(item.shape) &&
    typeof item.color === 'string' &&
    GLYTH_COLORS.includes(item.color) &&
    (item.motion === 'idle' || item.motion === 'curious')
    ? { shape: item.shape, color: item.color, motion: item.motion }
    : undefined;
}
export function appearanceKey(item: GlythAppearance): string {
  return `${item.shape}/${item.color}/${item.motion}`;
}
export function nextGlythAppearance(
  occupied: readonly GlythAppearance[],
  previous?: GlythAppearance,
  random = Math.random,
): GlythAppearance | undefined {
  const occupiedKeys = new Set(occupied.map(appearanceKey));
  const used = new Set(occupiedKeys);
  if (previous) used.add(appearanceKey(previous));
  const available: GlythAppearance[] = [];
  for (const shape of GLYTH_SHAPES)
    for (const color of GLYTH_COLORS)
      for (const motion of ['idle', 'curious'] as const) {
        const item = { shape, color, motion };
        if (!used.has(appearanceKey(item))) available.push(item);
      }
  if (!available.length)
    return previous && !occupiedKeys.has(appearanceKey(previous))
      ? previous
      : undefined;
  const value = random();
  const index = Number.isFinite(value)
    ? Math.min(
        available.length - 1,
        Math.max(0, Math.floor(value * available.length)),
      )
    : 0;
  return available[index];
}
