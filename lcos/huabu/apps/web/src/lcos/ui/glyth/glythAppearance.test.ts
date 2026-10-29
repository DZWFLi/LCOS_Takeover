import { expect, it } from 'vitest';
import { GLYTH_COLORS, GLYTH_SHAPES } from './vendor/grok-replica/renderer.js';
import {
  appearanceKey,
  nextGlythAppearance,
  readGlythAppearance,
} from './glythAppearance';
it('uses original donor catalogs and avoids both the displayed agent and all occupied combinations', () => {
  expect(GLYTH_SHAPES).toHaveLength(18);
  expect(GLYTH_COLORS).toHaveLength(11);
  const occupied = [{ shape: 'blob', color: 'black', motion: 'idle' as const }];
  const first = nextGlythAppearance(occupied, undefined, () => 0)!;
  const second = nextGlythAppearance(occupied, first, () => 0)!;
  expect(appearanceKey(first)).not.toBe(appearanceKey(occupied[0]));
  expect(appearanceKey(second)).not.toBe(appearanceKey(first));
});
it('handles a full canvas catalog without retry loops or reusing an occupied appearance', () => {
  const occupied = GLYTH_SHAPES.flatMap((shape) =>
    GLYTH_COLORS.flatMap((color) =>
      ['idle', 'curious'].map((motion) => ({
        shape,
        color,
        motion: motion as 'idle' | 'curious',
      })),
    ),
  );
  expect(nextGlythAppearance(occupied)).toBeUndefined();
  expect(
    readGlythAppearance({ shape: 'invented', color: 'blue', motion: 'idle' }),
  ).toBeUndefined();
});
it('retains the last unused candidate when no alternative remains', () => {
  const previous = { shape: 'leaf', color: 'gray', motion: 'curious' as const };
  const occupied = GLYTH_SHAPES.flatMap((shape) =>
    GLYTH_COLORS.flatMap((color) =>
      ['idle', 'curious'].map((motion) => ({
        shape,
        color,
        motion: motion as 'idle' | 'curious',
      })),
    ),
  ).filter((item) => appearanceKey(item) !== appearanceKey(previous));
  expect(nextGlythAppearance(occupied, previous)).toEqual(previous);
  expect(
    nextGlythAppearance([...occupied, previous], previous),
  ).toBeUndefined();
});
