import { describe, expect, it } from 'vitest';

import { fitImageInStage, zoomImageAtPoint } from './imageZoomMath';

describe('GEN1 Reader image-local zoom', () => {
  it('fits a large original image without truncation', () => {
    expect(fitImageInStage(1000, 750, 4000, 3000)).toEqual({ scale: .25, pan: { x: 0, y: 0 } });
  });
  it('keeps a small image at native resolution', () => {
    expect(fitImageInStage(1000, 750, 200, 100)).toEqual({ scale: 1, pan: { x: 400, y: 325 } });
  });
  it.each([0, -1, NaN, Infinity])('does not commit impossible stage dimensions (%s)', (width) => {
    expect(fitImageInStage(width, 700, 4000, 3000)).toBeUndefined();
  });
  it('can fit under the old fixed .2 lower bound', () => {
    expect(fitImageInStage(280, 450, 4000, 3000)?.scale).toBe(.07);
  });
  it('preserves the pointer coordinate on the original media', () => {
    const p = { x: 320, y: 140 };
    const pan = { x: 42, y: -17 };
    const scale = .7;
    const next = zoomImageAtPoint(scale, pan, p, 1.15, .1, 8);
    expect((p.x - next.pan.x) / next.scale).toBeCloseTo((p.x - pan.x) / scale, 10);
    expect((p.y - next.pan.y) / next.scale).toBeCloseTo((p.y - pan.y) / scale, 10);
  });
  it('enforces only media-local min/max zoom', () => {
    expect(zoomImageAtPoint(7, { x: 0, y: 0 }, { x: 50, y: 50 }, 2, .05, 8).scale).toBe(8);
    expect(zoomImageAtPoint(.1, { x: 0, y: 0 }, { x: 50, y: 50 }, .1, .05, 8).scale).toBe(.05);
  });
});
