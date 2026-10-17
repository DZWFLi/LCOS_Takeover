import { beforeEach, expect, it, vi } from 'vitest';

import { receiveCanvasUrlText } from './canvasUrlIngress';

import type * as ProjectUrlModule from './projectUrlImport';

const state = vi.hoisted(() => ({
  shell: { projectId: 'p', activeWorkspaceId: 'w', activeSurface: 'main', requestLocate: vi.fn() },
  canvas: { canvasId: 'main' }, refresh: vi.fn(), notice: vi.fn(), save: vi.fn(), wait: vi.fn(),
}));
vi.mock('@/components/Common/Toast', () => ({ toast: state.notice }));
vi.mock('@/store/canvasStore', () => ({ default: { getState: () => state.canvas } }));
vi.mock('../shell/lcosShellStore', () => ({ useLcosShellStore: { getState: () => state.shell } }));
vi.mock('../lcosReferenceState', () => ({ useLcosReferenceStore: { getState: () => ({ requestNodeBindingRefresh: state.refresh }) } }));
vi.mock('../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({ http: 'existing-http' }) }));
vi.mock('../navigation/waitForProjectedEntity', () => ({ waitForProjectedEntity: state.wait }));
vi.mock('./projectUrlImport', async (importOriginal) => ({ ...await importOriginal<typeof ProjectUrlModule>(), saveProjectUrl: state.save }));

const saved = { artifactId: 'artifact-real', revisionId: 'revision-real', resourceId: 'resource-real', viewId: 'view-real', sourceKind: 'link' };
beforeEach(() => {
  vi.clearAllMocks(); state.shell.projectId = 'p'; state.shell.activeWorkspaceId = 'w'; state.canvas.canvasId = 'main';
  state.save.mockResolvedValue({ saved, workspaceMember: true }); state.wait.mockResolvedValue('projected-real');
});
it('claims a URL exactly once and locates its existing canonical projection without creating native nodes', async () => {
  expect(receiveCanvasUrlText('p', '普通文字', { x: 10, y: 20 })).toBe(false);
  expect(state.save).not.toHaveBeenCalled();
  expect(receiveCanvasUrlText('p', 'https://example.com/', { x: 10, y: 20 })).toBe(true);
  await vi.waitFor(() => expect(state.shell.requestLocate).toHaveBeenCalledTimes(1));
  expect(state.save).toHaveBeenCalledExactlyOnceWith({ http: 'existing-http' },
    { projectId: 'p', canvasId: 'main', workspaceId: 'w', url: 'https://example.com/', position: { x: 10, y: 20 } }, { isCurrent: expect.any(Function) });
  expect(state.refresh).toHaveBeenCalledTimes(1);
  expect(state.wait).toHaveBeenCalledExactlyOnceWith({ projectId: 'p', canvasId: 'main', entityType: 'artifact', entityId: 'artifact-real', artifactViewId: 'view-real' });
  expect(state.shell.requestLocate).toHaveBeenCalledWith(expect.objectContaining({ canvasId: 'main', nodeId: 'projected-real', preserveSelection: true }));
});
it('finishes an import addressed to the old workspace without touching the newly navigated canvas', async () => {
  let finish: ((value: { saved: typeof saved; workspaceMember: boolean }) => void) | undefined;
  state.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  expect(receiveCanvasUrlText('p', 'https://example.com/', { x: 10, y: 20 })).toBe(true);
  state.canvas.canvasId = 'new'; finish?.({ saved, workspaceMember: true });
  await Promise.resolve(); await Promise.resolve();
  expect(state.refresh).not.toHaveBeenCalled(); expect(state.wait).not.toHaveBeenCalled();
  expect(state.shell.requestLocate).not.toHaveBeenCalled(); expect(state.notice).not.toHaveBeenCalled();
});
it('reports partial success honestly instead of falling through to an unbound native web node', async () => {
  state.save.mockResolvedValueOnce({ saved, workspaceMember: false, membershipError: '原现场已移除' });
  expect(receiveCanvasUrlText('p', 'https://example.com/', { x: 10, y: 20 })).toBe(true);
  await vi.waitFor(() => expect(state.notice).toHaveBeenCalled());
  expect(state.notice).toHaveBeenCalledExactlyOnceWith('链接已保存，现场显示尚未确认：原现场已移除', { tone: 'danger' });
  expect(state.refresh).toHaveBeenCalledTimes(1); expect(state.wait).not.toHaveBeenCalled();
});
