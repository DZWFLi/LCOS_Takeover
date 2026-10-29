import { describe, expect, it } from 'vitest';
import { avoidNearbyControls, type PopoverHitRect } from './boundedPopoverAvoidance';
const bounds = { x: 0, y: 0, width: 1280, height: 720 };
const hits = [{ x: -7, y: -7, width: 44, height: 44 }, { x: 39, y: -1, width: 44, height: 44 }, { x: 45, y: 45, width: 44, height: 44 }];
const intersects = (a: PopoverHitRect, b: PopoverHitRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
describe('bounded near-node floating control avoidance', () => {
  it('keeps the exact Figma anchor when neighbouring controls are already clear', () => {
    expect(avoidNearbyControls({ x: 100, y: 100 }, hits, [{ x: 300, y: 300, width: 50, height: 50 }], bounds)).toEqual({ x: 100, y: 100 });
  });
  it('moves the real overlapping More hit area off adjacent Glyth with the least local displacement', () => {
    const origin = { x: 962, y: 114 }; const glyth = { x: 1009.8066, y: 166.2873, width: 56.2708, height: 67.5249 };
    const result = avoidNearbyControls(origin, hits, [glyth], bounds);
    expect(Math.hypot(result.x - origin.x, result.y - origin.y)).toBeLessThanOrEqual(48);
    expect(result).not.toEqual(origin);
    expect(hits.some((hit) => intersects({ ...hit, x: hit.x + result.x, y: hit.y + result.y }, glyth))).toBe(false);
  });
  it('does not react to controls in the transparent gap of the orbit', () => {
    const origin = { x: 100, y: 100 };
    expect(avoidNearbyControls(origin, hits, [{ x: 100, y: 152, width: 30, height: 20 }], bounds)).toEqual(origin);
  });
  it('cannot move a 44px target outside a small canvas while avoiding another control', () => {
    const result = avoidNearbyControls({ x: 260, y: 30 }, hits, [{ x: 302, y: 78, width: 40, height: 40 }], { x: 0, y: 0, width: 360, height: 280 });
    for (const hit of hits) { expect(result.x + hit.x).toBeGreaterThanOrEqual(0); expect(result.y + hit.y).toBeGreaterThanOrEqual(0); expect(result.x + hit.x + hit.width).toBeLessThanOrEqual(360); }
  });
  it('does not detach the local chrome when there is no better placement within the bound', () => {
    const origin = { x: 100, y: 100 };
    expect(avoidNearbyControls(origin, hits, [{ x: 0, y: 0, width: 500, height: 500 }], bounds)).toEqual(origin);
  });
  it('More panel does not trigger any move if its real rectangle already clears the adjacent object', () => {
    const origin = { x: 716, y: 210 };
    expect(avoidNearbyControls(origin, [{ x: 0, y: 0, width: 280, height: 310 }], [{ x: 1009, y: 166, width: 57, height: 68 }], bounds)).toEqual(origin);
  });
});
