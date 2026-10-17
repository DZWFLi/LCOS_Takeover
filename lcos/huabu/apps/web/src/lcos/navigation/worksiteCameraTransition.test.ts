import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  animateCurrentWorksiteCamera,
  entryStartViewport,
  scaleViewportAroundPoint,
} from './worksiteCameraTransition';

const mocks = vi.hoisted(() => ({
  viewport: { x: 100, y: 50, zoom: 1 },
  canvasId: 'canvas-source',
  setViewport: vi.fn(),
  rfSetViewport: vi.fn(),
  current: { x: 100, y: 50, zoom: 1 },
  reduced: false,
  wrapper: { getBoundingClientRect: () => ({ width: 1000, height: 800 }) },
}));

vi.mock('@/store/canvasStore', () => ({
  default: {
    getState: () => ({
      canvasId: mocks.canvasId,
      viewport: mocks.viewport,
      nodes: [],
      canvasWrapper: mocks.wrapper,
      setViewport: mocks.setViewport,
      rfInstance: {
        getViewport: () => mocks.current,
        setViewport: mocks.rfSetViewport,
        getInternalNode: () => undefined,
      },
    }),
  },
}));

vi.mock('../ui/motion/useReducedSpatialMotion', () => ({
  prefersReducedSpatialMotion: () => mocks.reduced,
}));

describe('worksite camera transition', () => {
  beforeEach(() => {
    mocks.current = { x: 100, y: 50, zoom: 1 };
    mocks.viewport = { x: 100, y: 50, zoom: 1 };
    mocks.reduced = false;
    mocks.setViewport.mockReset();
    mocks.rfSetViewport.mockReset();
    mocks.rfSetViewport.mockImplementation(async (target) => {
      mocks.current = target;
      return true;
    });
  });

  it('scales around the same screen-space centre', () => {
    const result = scaleViewportAroundPoint(
      { x: 100, y: 50, zoom: 1 },
      { width: 1000, height: 800 },
      1.1,
    );
    expect(result.x).toBeCloseTo(60);
    expect(result.y).toBeCloseTo(15);
    expect(result.zoom).toBeCloseTo(1.1);
  });

  it('starts destination settle slightly wider without changing its canonical target', () => {
    const target = { x: -200, y: -100, zoom: 0.8 };
    const start = entryStartViewport(target, { width: 1000, height: 800 });
    expect(start.zoom).toBeLessThan(target.zoom);
    expect(target).toEqual({ x: -200, y: -100, zoom: 0.8 });
  });

  it('uses the single RF instance and keeps the transition pose out of saved viewport state', async () => {
    await expect(animateCurrentWorksiteCamera({ direction: 'approach' }))
      .resolves.toMatchObject({ zoom: 1.1 });
    expect(mocks.rfSetViewport).toHaveBeenCalledOnce();
    expect(mocks.rfSetViewport.mock.calls[0]?.[1]).toEqual({ duration: 240 });
    expect(mocks.setViewport).toHaveBeenCalledWith({ x: 100, y: 50, zoom: 1 });
  });

  it('lands immediately when reduced motion is requested', async () => {
    mocks.reduced = true;
    await expect(animateCurrentWorksiteCamera({ direction: 'approach' }))
      .resolves.toEqual({ x: 100, y: 50, zoom: 1 });
    expect(mocks.rfSetViewport).not.toHaveBeenCalled();
  });
});
