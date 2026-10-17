import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ArchiveBody } from './ArchiveBody';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  listArtifacts: vi.fn(),
  restoreArtifact: vi.fn(),
  openReader: vi.fn(),
  notifyMutationSuccess: vi.fn(),
  watchArtifactChanges: vi.fn(),
  artifactListeners: new Map<string, () => void>(),
}));

vi.mock('../app/lcosCoreClient', () => ({
  createLcosCoreSession: () => ({
    artifacts: {
      listArtifacts: mocks.listArtifacts,
      restoreArtifact: mocks.restoreArtifact,
    },
  }),
}));
vi.mock('../host/lcosHostState', () => ({
  useLcosHostStore: Object.assign(() => undefined, {
    getState: () => ({ host: { notifyMutationSuccess: mocks.notifyMutationSuccess } }),
  }),
}));
vi.mock('../collaboration/collaborationSessionStore', () => ({
  useCollaborationSessionStore: {
    getState: () => ({ watchArtifactChanges: mocks.watchArtifactChanges }),
  },
}));
vi.mock('../shell/lcosShellStore', () => {
  const state = { openReader: mocks.openReader };
  return {
    useLcosShellStore: Object.assign(
      (selector: (value: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});
vi.mock('../ui/lcosTokens', () => ({
  lcosTokens: {
    color: {
      text: '#111',
      muted: '#777',
      raised: '#eee',
      danger: '#a00',
      info: '#06c',
    },
  },
}));

let host: HTMLDivElement;
let root: Root;
let rootUnmounted: boolean;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  rootUnmounted = false;
  mocks.listArtifacts.mockReset();
  mocks.restoreArtifact.mockReset();
  mocks.openReader.mockReset();
  mocks.notifyMutationSuccess.mockReset();
  mocks.watchArtifactChanges.mockReset();
  mocks.artifactListeners.clear();
  mocks.watchArtifactChanges.mockImplementation((projectId: string, listener: () => void) => {
    mocks.artifactListeners.set(projectId, listener);
    return () => {
      if (mocks.artifactListeners.get(projectId) === listener) mocks.artifactListeners.delete(projectId);
    };
  });
});

afterEach(async () => {
  if (!rootUnmounted) await act(async () => root.unmount());
  host.remove();
});

it('lists archived objects as read-only, opens Reader, and restores the same identity', async () => {
  const archived = {
    id: 'artifact-1',
    projectId: 'project-1',
    title: '归档材料',
    kind: 'markdown',
    availability: 'available',
    archivedAt: '2026-09-20T00:00:00.000Z',
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
  };
  mocks.listArtifacts
    .mockResolvedValueOnce([archived])
    .mockResolvedValueOnce([]);
  mocks.restoreArtifact.mockResolvedValue({
    ...archived,
    archivedAt: undefined,
  });

  await act(async () => root.render(<ArchiveBody projectId="project-1" />));
  await act(async () => mocks.listArtifacts.mock.results[0]?.value);
  expect(mocks.listArtifacts).toHaveBeenCalledWith('project-1', 'archived');
  expect(
    host.querySelector('[data-lcos-archive-item="artifact-1"]')?.textContent,
  ).toContain('只读');

  const buttons = [
    ...host.querySelectorAll<HTMLButtonElement>(
      '[data-lcos-archive-item="artifact-1"] button',
    ),
  ];
  await act(async () =>
    buttons.find((button) => button.textContent?.includes('查看'))?.click(),
  );
  expect(mocks.openReader).toHaveBeenCalledWith('归档材料', 'artifact-1');

  await act(async () =>
    buttons.find((button) => button.textContent?.includes('恢复'))?.click(),
  );
  await act(async () => mocks.restoreArtifact.mock.results[0]?.value);
  await act(async () => mocks.listArtifacts.mock.results[1]?.value);
  expect(mocks.restoreArtifact).toHaveBeenCalledWith('project-1', 'artifact-1');
  expect(mocks.notifyMutationSuccess).toHaveBeenCalledOnce();
  expect(host.textContent).toContain('按当前现场重新落位');
  expect(mocks.listArtifacts).toHaveBeenCalledTimes(2);
  expect(mocks.listArtifacts).toHaveBeenLastCalledWith('project-1', 'archived');
});

it('refetches the archived list after an artifact event from the shared project subscriber', async () => {
  const archived = {
    id: 'artifact-1', projectId: 'project-1', title: '外部归档材料', kind: 'markdown',
    availability: 'available', archivedAt: '2026-09-20T00:00:00.000Z',
    createdAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z',
  };
  mocks.listArtifacts.mockResolvedValueOnce([archived]).mockResolvedValueOnce([]);

  await act(async () => root.render(<ArchiveBody projectId="project-1" />));
  await act(async () => mocks.listArtifacts.mock.results[0]?.value);
  expect(host.querySelector('[data-lcos-archive-item="artifact-1"]')).not.toBeNull();
  expect(mocks.watchArtifactChanges).toHaveBeenCalledWith('project-1', expect.any(Function));

  await act(async () => mocks.artifactListeners.get('project-1')?.());
  await act(async () => mocks.listArtifacts.mock.results[1]?.value);
  expect(mocks.listArtifacts).toHaveBeenLastCalledWith('project-1', 'archived');
  expect(host.querySelector('[data-lcos-archive-item="artifact-1"]')).toBeNull();
});

it('ignores an older list response when a later artifact invalidation has already refreshed the list', async () => {
  let resolveOld!: (value: unknown[]) => void;
  const oldResponse = new Promise<unknown[]>((resolve) => { resolveOld = resolve; });
  mocks.listArtifacts.mockReturnValueOnce(oldResponse).mockResolvedValueOnce([]);

  await act(async () => root.render(<ArchiveBody projectId="project-1" />));
  await act(async () => mocks.artifactListeners.get('project-1')?.());
  await act(async () => mocks.listArtifacts.mock.results[1]?.value);
  resolveOld([{
    id: 'stale-artifact', projectId: 'project-1', title: '迟到旧归档', kind: 'markdown',
  }]);
  await act(async () => oldResponse);

  expect(host.querySelector('[data-lcos-archive-item="stale-artifact"]')).toBeNull();
  expect(host.textContent).toContain('没有匹配的归档对象');
});

it('unsubscribes on project switch and ignores late reads and queued events from the old project', async () => {
  let resolveOld!: (value: unknown[]) => void;
  const oldResponse = new Promise<unknown[]>((resolve) => { resolveOld = resolve; });
  mocks.listArtifacts.mockReturnValueOnce(oldResponse).mockResolvedValueOnce([{
    id: 'new-project-artifact', projectId: 'project-2', title: '新项目归档', kind: 'markdown',
  }]);

  await act(async () => root.render(<ArchiveBody projectId="project-1" />));
  const queuedOldEvent = mocks.artifactListeners.get('project-1');
  await act(async () => root.render(<ArchiveBody projectId="project-2" />));
  expect(mocks.artifactListeners.has('project-1')).toBe(false);
  await act(async () => mocks.listArtifacts.mock.results[1]?.value);
  resolveOld([{
    id: 'old-project-artifact', projectId: 'project-1', title: '旧项目迟到归档', kind: 'markdown',
  }]);
  await act(async () => oldResponse);
  await act(async () => queuedOldEvent?.());

  expect(host.querySelector('[data-lcos-archive-item="new-project-artifact"]')).not.toBeNull();
  expect(host.querySelector('[data-lcos-archive-item="old-project-artifact"]')).toBeNull();
  expect(mocks.listArtifacts).toHaveBeenCalledTimes(2);
});

it('unsubscribes on unmount and ignores already-queued artifact callbacks and list replies', async () => {
  let resolveList!: (value: unknown[]) => void;
  const pendingList = new Promise<unknown[]>((resolve) => { resolveList = resolve; });
  mocks.listArtifacts.mockReturnValueOnce(pendingList);
  await act(async () => root.render(<ArchiveBody projectId="project-1" />));
  const queuedEvent = mocks.artifactListeners.get('project-1');

  await act(async () => root.unmount());
  rootUnmounted = true;
  expect(mocks.artifactListeners.has('project-1')).toBe(false);
  await act(async () => queuedEvent?.());
  resolveList([]);
  await act(async () => pendingList);
  expect(mocks.listArtifacts).toHaveBeenCalledTimes(1);
});
