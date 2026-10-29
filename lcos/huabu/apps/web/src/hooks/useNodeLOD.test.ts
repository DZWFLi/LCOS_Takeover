import { describe, expect, it } from 'vitest';

import { resolveNodeLODMode } from './useNodeLOD';

describe('resolveNodeLODMode', () => {
  it('keeps Huabu native heavy nodes on the existing full/minimal boundary', () => {
    expect(
      resolveNodeLODMode({
        enabled: true,
        nodeType: 'note',
        screenWidth: 120,
        previousMode: 'full',
      }),
    ).toBe('minimal');
    expect(
      resolveNodeLODMode({
        enabled: true,
        nodeType: 'note',
        screenWidth: 170,
        previousMode: 'minimal',
      }),
    ).toBe('full');
  });

  it('forces native LOD to full when a host presentation owns density', () => {
    expect(
      resolveNodeLODMode({
        enabled: false,
        nodeType: 'note',
        screenWidth: 1,
        previousMode: 'minimal',
      }),
    ).toBe('full');
  });

  it('leaves native node types without a minimal registration at full', () => {
    expect(
      resolveNodeLODMode({
        enabled: true,
        nodeType: 'text',
        screenWidth: 1,
        previousMode: 'full',
      }),
    ).toBe('full');
  });
});
