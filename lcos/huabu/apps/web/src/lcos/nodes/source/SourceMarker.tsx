import { lcosTokens } from '../../ui/lcosTokens';
import type { JSX } from 'react';

/** A color supplied by a real ColorPin definition. This view invents no membership. */
export function SourceMarker({ size = 11, color }: {
  readonly size?: number;
  readonly color: string;
}): JSX.Element {
  return <span data-lcos-source-corner-marker aria-hidden style={{
    display: 'block', width: size, height: size, borderRadius: 3,
    background: color,
    border: `1.5px solid ${lcosTokens.color.surface}`,
    boxShadow: `0 1px 3px color-mix(in srgb, ${color} 30%, transparent)`,
    boxSizing: 'border-box',
  }} />;
}
