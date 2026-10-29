import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { RailwayPeek } from './RailwayPeek';
const m = vi.hoisted(() => ({ value: {} as Record<string, unknown>, hook: vi.fn(), retry: vi.fn() }));
vi.mock('@/store/spacePreviewSceneCache', () => ({ useSpacePreviewScene: (id: string, enabled: boolean) => { m.hook(id, enabled); return m.value; } }));
vi.mock('@/api/artifact', () => ({ resolveArtifactUrl: (src: string) => src }));
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { for (const root of roots.splice(0)) act(() => root.unmount()); document.body.replaceChildren(); vi.clearAllMocks(); });
it('renders true scene coordinates/assets and discloses partial data without a second viewport', async () => {
  m.value = { scene: { canvasId: 'canvas-a', title: '真实现场', bounds: { x: 10, y: 20, width: 500, height: 300 },
    nodes: [{ id: 'node-a', kind: 'content', x: 10, y: 20, width: 200, height: 120, imageSrc: '/real.png' }], edges: [], truncated: { nodes: true, edges: false } }, retry: m.retry };
  const host = document.createElement('div'); const root = createRoot(host); roots.push(root);
  await act(async () => root.render(<RailwayPeek canvasId="canvas-a" />));
  expect(m.hook).toHaveBeenCalledWith('canvas-a', true);
  expect(host.querySelector('svg')?.getAttribute('viewBox')).toBe('10 20 500 300');
  expect(host.querySelector('image')?.getAttribute('href')).toBe('/real.png');
  expect(host.textContent).toContain('显示部分内容'); expect(host.querySelector('button')).toBeNull();
});
it('keeps unavailable state truthful and retry reads the original cache', async () => {
  m.value = { scene: null, loading: false, error: new Error('offline'), retry: m.retry };
  const host = document.createElement('div'); const root = createRoot(host); roots.push(root);
  await act(async () => root.render(<RailwayPeek canvasId="canvas-a" />));
  expect(host.querySelector('svg')).toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click()); expect(m.retry).toHaveBeenCalledOnce();
});
