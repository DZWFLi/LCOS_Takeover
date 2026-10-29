// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { describe, expect, it, vi } from 'vitest';

import {
  anchorViewportCentre,
  fitNodesOnCanvas,
  focusNodeGroupOnCanvas,
  focusNodesOnCanvas,
  getReliableNodeBounds,
  locateNodesOnCanvas,
  revealBoundsInViewport,
  revealBoundsInScreenRect,
} from './focusNodesOnCanvas';

import type { ReactFlowInstance } from '@xyflow/react';

const createInstance = () => {
  const internalNodes = {
    first: {
      measured: {},
      style: { width: 200, height: 120 },
      internals: { positionAbsolute: { x: 1000, y: 500 } },
    },
    second: {
      measured: { width: 80, height: 60 },
      style: {},
      internals: { positionAbsolute: { x: 1400, y: 800 } },
    },
  };
  const fitBounds = vi.fn().mockResolvedValue(true);
  const instance = {
    getInternalNode: (id: string) =>
      internalNodes[id as keyof typeof internalNodes],
    fitBounds,
  } as unknown as ReactFlowInstance;
  return { instance, fitBounds };
};

describe('reliable canvas node bounds', () => {
  it('uses persisted style dimensions for unmeasured nodes', () => {
    const { instance } = createInstance();

    expect(getReliableNodeBounds(instance, ['first', 'second'])).toEqual({
      x: 1000,
      y: 500,
      width: 480,
      height: 360,
    });
  });

  it('fits the resolved bounds', async () => {
    const { instance, fitBounds } = createInstance();

    await expect(
      fitNodesOnCanvas(instance, ['first', 'second'], 0.2),
    ).resolves.toBe(true);

    expect(fitBounds).toHaveBeenCalledWith(
      { x: 1000, y: 500, width: 480, height: 360 },
      { padding: 0.2 },
    );
  });

  it('reports when no visible node bounds can be resolved', async () => {
    const { instance, fitBounds } = createInstance();

    await expect(fitNodesOnCanvas(instance, [])).resolves.toBe(false);
    expect(fitBounds).not.toHaveBeenCalled();
  });

  it('resolves only after Huabu camera settle and reports a missing target honestly', async () => {
    const setCenter = vi.fn().mockResolvedValue(undefined);
    const instance = {
      getInternalNode: (id: string) => id === 'first' ? {
        measured: {},
        style: { width: 200, height: 120 },
        internals: { positionAbsolute: { x: 1000, y: 500 } },
      } : undefined,
      getZoom: () => 0.8,
      setCenter,
    } as unknown as ReactFlowInstance;

    await expect(focusNodesOnCanvas(instance, ['first'], 800)).resolves.toBe(true);
    expect(setCenter).toHaveBeenCalledWith(1100, 560, { duration: 800, zoom: 0.8 });
    await expect(focusNodesOnCanvas(instance, ['missing'])).resolves.toBe(false);
  });

  it('fits one multi-target group once without zooming past the current view', async () => {
    const { instance } = createInstance();
    const setViewport = vi.fn().mockResolvedValue(true);
    Object.assign(instance, { getZoom: () => 0.72, setViewport });

    await expect(
      focusNodeGroupOnCanvas(
        instance,
        ['first', 'second'],
        { width: 1200, height: 800 },
        640,
        0.18,
      ),
    ).resolves.toBe(true);

    expect(setViewport).toHaveBeenCalledOnce();
    const [viewport, options] = setViewport.mock.calls[0] ?? [];
    expect(viewport.zoom).toBeLessThanOrEqual(0.72);
    expect(options).toEqual({ duration: 640 });
  });
});

describe('canvas viewport anchoring', () => {
  it('keeps the same flow point centred when the viewport grows', () => {
    expect(
      anchorViewportCentre(
        { x: 100, y: 40, zoom: 0.75 },
        { width: 800, height: 600 },
        { width: 1200, height: 700 },
      ),
    ).toEqual({ x: 300, y: 90, zoom: 0.75 });
  });

  it('does not move bounds that are already safely visible', () => {
    const viewport = { x: 0, y: 0, zoom: 1 };

    expect(
      revealBoundsInViewport(
        viewport,
        { width: 800, height: 600 },
        { x: 100, y: 100, width: 200, height: 120 },
      ),
    ).toBe(viewport);
  });

  it('uses the smallest pan needed to reveal clipped bounds', () => {
    expect(
      revealBoundsInViewport(
        { x: 0, y: 0, zoom: 1 },
        { width: 600, height: 500 },
        { x: 500, y: 200, width: 140, height: 100 },
        20,
      ),
    ).toEqual({ x: -60, y: 0, zoom: 1 });
  });

  it('centres oversized bounds without changing zoom', () => {
    expect(
      revealBoundsInViewport(
        { x: 10, y: 20, zoom: 2 },
        { width: 500, height: 400 },
        { x: 0, y: 10, width: 300, height: 80 },
      ),
    ).toEqual({ x: -50, y: 20, zoom: 2 });
  });

  it('reveals bounds inside an offset professional-window safe rect', () => {
    expect(
      revealBoundsInScreenRect(
        { x: 0, y: 0, zoom: 1 },
        { left: 100, top: 50, right: 1100, bottom: 850 },
        { left: 100, top: 50, right: 700, bottom: 850 },
        { x: 720, y: 240, width: 160, height: 100 },
        20,
      ),
    ).toEqual({ x: -300, y: 0, zoom: 1 });
  });

  it('locates through the RF viewport promise and preserves zoom', async () => {
    const { instance } = createInstance();
    const setViewport = vi.fn().mockResolvedValue(undefined);
    Object.assign(instance, {
      getViewport: () => ({ x: 0, y: 0, zoom: 0.75 }),
      setViewport,
    });

    await expect(locateNodesOnCanvas(instance, ['second'], {
      canvasRect: { left: 0, top: 0, right: 1200, bottom: 800 },
      safeRect: { left: 0, top: 0, right: 760, bottom: 800 },
      duration: 0,
      padding: 20,
    })).resolves.toBe(true);

    expect(setViewport).toHaveBeenCalledOnce();
    expect(setViewport.mock.calls[0]?.[0].zoom).toBe(0.75);
    expect(setViewport.mock.calls[0]?.[1]).toEqual({ duration: 0 });
  });
});
