import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { GlythBodyView } from './GlythBodyView';

const mocks = vi.hoisted(() => ({ mount: vi.fn(), update: vi.fn(), destroy: vi.fn(), reduced: false }));
vi.mock('./glythPresence', () => ({ mountGlythPresence: (...args: unknown[]) => {
  mocks.mount(...args);
  return { update: mocks.update, destroy: mocks.destroy };
} }));
vi.mock('../motion/useReducedSpatialMotion', () => ({ useReducedSpatialMotion: () => mocks.reduced }));
afterEach(() => { vi.clearAllMocks(); mocks.reduced = false; });

it('mounts the real presence entry and forwards controlled state without remounting', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<GlythBodyView pose="idle" size={92} left={9} top={0} />));
    expect(mocks.mount).toHaveBeenCalledTimes(1);
    expect(mocks.mount.mock.calls[0]?.[0]).toBe(host.querySelector('svg'));
    await act(async () => root.render(<GlythBodyView pose="working" userState="thinking" selected size={92} left={9} top={0} />));
    expect(mocks.mount).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ pose: 'working', userState: 'thinking', selected: true }));
    expect(host.querySelector('svg')?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  } finally { await act(async () => root.unmount()); host.remove(); }
  expect(mocks.destroy).toHaveBeenCalledTimes(1);
});

it('forwards reduced motion and mark input rather than computing its own LOD', async () => {
  mocks.reduced = true;
  const host = document.createElement('div'); const root = createRoot(host);
  try {
    await act(async () => root.render(<GlythBodyView pose="curious" mark size={34} left={43.5} top={16} />));
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ reducedMotion: true, mark: true }));
  } finally { await act(async () => root.unmount()); }
});
