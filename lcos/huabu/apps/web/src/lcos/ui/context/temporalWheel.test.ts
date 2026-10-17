// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';

import { bindTemporalWheel } from './temporalWheel';

describe('Huabu-derived local wheel lifetime', () => {
  it('isolates vertical and horizontal wheel from the host without manufacturing a camera command', () => {
    const host = document.createElement('div');
    const rail = document.createElement('aside');
    host.append(rail);
    const bubble = vi.fn();
    const shift = vi.fn();
    host.addEventListener('wheel', bubble);
    const dispose = bindTemporalWheel(rail, shift);
    const down = new WheelEvent('wheel', { deltaY: 12, bubbles: true, cancelable: true });
    rail.dispatchEvent(down);
    const sideways = new WheelEvent('wheel', { deltaX: 12, bubbles: true, cancelable: true });
    rail.dispatchEvent(sideways);
    expect(down.defaultPrevented).toBe(true);
    expect(sideways.defaultPrevented).toBe(true);
    expect(shift).toHaveBeenCalledExactlyOnceWith(1);
    expect(bubble).not.toHaveBeenCalled();
    dispose();
    rail.dispatchEvent(new WheelEvent('wheel', { deltaY: 12, bubbles: true }));
    expect(shift).toHaveBeenCalledTimes(1);
    expect(bubble).toHaveBeenCalledTimes(1);
  });

  it('does not accumulate listeners after setup/cleanup/setup', () => {
    const rail = document.createElement('aside');
    const shift = vi.fn();
    const first = bindTemporalWheel(rail, shift);
    first();
    const second = bindTemporalWheel(rail, shift);
    rail.dispatchEvent(new WheelEvent('wheel', { deltaY: -12 }));
    expect(shift).toHaveBeenCalledExactlyOnceWith(-1);
    second();
  });
});
