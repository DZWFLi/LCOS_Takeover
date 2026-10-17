import type { PresentationDensity } from '@local-creative-os/web-gen2';

/** Presentation only. Huabu size and the existing density resolver remain owners. */
export function sourceTextLayout(density: PresentationDensity, width = 385, height = 142, zoom = 1): {
  readonly fontSize: number; readonly lineHeight: number; readonly lines: number;
} {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 385;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 142;
  const scale = Math.min(1, safeWidth / 385);
  const base = { mark: 14, summary: 24, working: 30, reading: 37 }[density];
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const fontSize = Math.max(density === 'mark' ? 12 : 16, Math.round(base * scale), 12 / safeZoom);
  const lineHeight = density === 'reading' ? Math.round(fontSize * 58 / 37) : Math.round(fontSize * 1.45);
  const captionHeight = density === 'working' || density === 'reading' ? 20 : 0;
  const lineLimit = { mark: 1, summary: 2, working: 4, reading: 8 }[density];
  const lines = Math.max(1, Math.min(lineLimit, Math.floor((safeHeight - captionHeight) / lineHeight)));
  return { fontSize, lineHeight, lines };
}
