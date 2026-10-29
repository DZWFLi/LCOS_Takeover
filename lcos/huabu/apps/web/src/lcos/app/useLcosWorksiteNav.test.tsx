import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { useLcosWorksiteNav } from './useLcosWorksiteNav';

import type { WorksiteNavHandle } from './useLcosWorksiteNav';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(), switchCanvas: vi.fn(), setActiveSurface: vi.fn(),
  pendingChild: null as { id: string } | null, consume: vi.fn(),
  canvasLoadFailure: null as { canvasId: string; kind: 'error' | 'not-found'; message: string } | null,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/store/canvasStore', () => ({ default: { getState: () => mocks } }));
vi.mock('../shell/lcosShellStore', () => ({
  useLcosShellStore: Object.assign(
    (select: (s: { setActiveSurface: typeof mocks.setActiveSurface }) => unknown) => select(mocks),
    { getState: () => ({ activeSurface: 'main', worksiteCameraTransition: mocks.pendingChild, consumeWorksiteCameraTransition: mocks.consume }) },
  ),
}));

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  vi.clearAllMocks();
  mocks.canvasLoadFailure = null; mocks.pendingChild = null;
});

it('serializes same-turn navigation and releases the lock after failure', async () => {
  let fail: (error: Error) => void = () => {};
  mocks.switchCanvas.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
  let handle: WorksiteNavHandle | undefined;
  function Probe() {
    handle = useLcosWorksiteNav({ projectId: 'p', canvasBySurface: { main: 'm', context: 'c', workflow: 'w' }, ensureCanvas: async () => undefined });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  roots.push(root);
  await act(async () => { root.render(<Probe />); });
  if (!handle) throw new Error('Navigation hook did not mount');
  const nav = handle;
  await act(async () => {
    const first = nav.switchWorksite('context');
    expect(await nav.switchWorksite('workflow')).toBe(false);
    expect(mocks.switchCanvas).toHaveBeenCalledTimes(1);
    fail(new Error('offline'));
    expect(await first).toBe(false);
  });
  expect(mocks.navigate).not.toHaveBeenCalled();
  mocks.switchCanvas.mockResolvedValueOnce(true);
  await act(async () => { expect(await nav.switchWorksite('workflow')).toBe(true); });
  expect(mocks.switchCanvas).toHaveBeenLastCalledWith('w');
  expect(mocks.navigate).toHaveBeenCalledWith('/projects/p/workflow', { replace: true });
});

it('does not navigate back to a project after its pending canvas switch completes', async () => {
  let finish: () => void = () => {};
  mocks.switchCanvas.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  let handle: WorksiteNavHandle | undefined;
  function Probe({ projectId }: { projectId: string }) {
    handle = useLcosWorksiteNav({ projectId, canvasBySurface: { context: 'c' }, ensureCanvas: async () => undefined });
    return null;
  }
  const root = createRoot(document.createElement('div')); roots.push(root);
  await act(async () => root.render(<Probe projectId="a" />));
  let pending: Promise<boolean> | undefined;
  await act(async () => { pending = handle?.switchWorksite('context'); });
  await act(async () => root.render(<Probe projectId="b" />));
  await act(async () => { finish(); expect(await pending).toBe(false); });
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(mocks.setActiveSurface).not.toHaveBeenCalled();
});

it('keeps the current route when the loader resolves false and exposes its real failure', async () => {
  mocks.switchCanvas.mockResolvedValueOnce(false);
  mocks.canvasLoadFailure = { canvasId: 'c', kind: 'error', message: '连接已断开' };
  let handle: WorksiteNavHandle | undefined;
  function Probe() {
    handle = useLcosWorksiteNav({ projectId: 'p', canvasBySurface: { context: 'c' }, ensureCanvas: async () => undefined });
    return null;
  }
  const root = createRoot(document.createElement('div')); roots.push(root);
  await act(async () => root.render(<Probe />));
  await act(async () => { expect(await handle?.switchWorksite('context')).toBe(false); });
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(handle?.transitionError).toBe('连接已断开');
  expect(mocks.setActiveSurface).not.toHaveBeenCalledWith('context');
});

it('uses the explicitly resolved child canvas and keeps workspaceId in the route', async () => {
  mocks.switchCanvas.mockResolvedValue(true);
  let handle: WorksiteNavHandle | undefined;
  const ensure = vi.fn();
  function Probe() { handle = useLcosWorksiteNav({ projectId: 'p', canvasBySurface: { context: 'root-canvas' }, ensureCanvas: ensure }); return null; }
  const root = createRoot(document.createElement('div')); roots.push(root);
  await act(async () => root.render(<Probe />));
  await act(async () => expect(await handle?.switchWorksite('context', { canvasId: 'child-canvas', workspaceId: 'child/1' })).toBe(true));
  expect(mocks.switchCanvas).toHaveBeenCalledExactlyOnceWith('child-canvas');
  expect(mocks.navigate).toHaveBeenCalledWith('/projects/p/context?workspaceId=child%2F1', { replace: true });
  expect(ensure).not.toHaveBeenCalled();
});

it('cancels the preceding child intent before loading a root and does not consume a later intent', async () => {
  mocks.pendingChild = { id: 'old-child' };
  mocks.switchCanvas.mockImplementation(async () => { expect(mocks.consume).toHaveBeenCalledExactlyOnceWith('old-child'); mocks.pendingChild = { id: 'later' }; return true; });
  let handle: WorksiteNavHandle | undefined;
  function Probe() { handle = useLcosWorksiteNav({ projectId: 'p', canvasBySurface: { main: 'm' }, ensureCanvas: async () => undefined }); return null; }
  const root = createRoot(document.createElement('div')); roots.push(root);
  await act(async () => root.render(<Probe />));
  await act(async () => expect(await handle?.switchWorksite('main')).toBe(true));
  expect(mocks.consume).toHaveBeenCalledExactlyOnceWith('old-child');
});
