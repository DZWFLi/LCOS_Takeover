import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { LcosRailwayView } from './LcosRailwayView';

it('keeps receiver geometry and its DOM identity when carry feedback becomes hot', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const ref = vi.fn();
    const items = [{ key: 'actual-space', label: '真实集合', icon: () => <svg />, onElement: ref }];
  try {
    await act(async () => root.render(<LcosRailwayView items={items} />));
    const compact = host.querySelector('[data-lcos-railway-item]');
    if (!compact) throw new Error('Expected the compact receiver');
    const width = (host.querySelector('[data-lcos-family=railway]') as HTMLElement).style.width;
    await act(async () => root.render(<LcosRailwayView items={items.map(item=>({...item,receivePresentation:'receive-hot' as const}))} />));
    expect(host.querySelector('[data-lcos-railway-item]')).toBe(compact);
    expect((host.querySelector('[data-lcos-family=railway]') as HTMLElement).style.width).toBe(width);
    expect(width).toBe('52px');
    expect(compact.getAttribute('aria-label')).toBe('真实集合');
    expect(compact.getAttribute('data-lcos-receive-state')).toBe('receive-hot');
    expect(ref).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<LcosRailwayView items={items} />));
    expect(host.querySelector('[data-lcos-railway-item]')).toBe(compact);
    expect(compact.getAttribute('aria-label')).toBe('真实集合');
  } finally { await act(async () => root.unmount()); host.remove(); }
});
