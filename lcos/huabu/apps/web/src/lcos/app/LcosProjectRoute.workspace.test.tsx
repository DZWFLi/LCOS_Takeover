import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { LcosProjectRoute } from './LcosProjectRoute';

const mock = vi.hoisted(() => ({
  search: '?workspaceId=root-context', shell: vi.fn(), redirect: vi.fn(),
  workspaces: [
    { id: 'root-context', scopeId: 'root', preferredSurface: 'context' },
    { id: 'child-context', scopeId: 'child', preferredSurface: 'context' },
  ],
}));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ projectId: 'p', surface: 'main' }),
  useLocation: () => ({ search: mock.search, hash: '#focus' }),
  Navigate: (props: unknown) => { mock.redirect(props); return null; },
}));
vi.mock('./useLcosWorksite', () => ({ useLcosWorksite: () => ({
  status: 'ready', rootScopeId: 'root', workspaces: mock.workspaces,
  surfaceCanvasId: {}, surfaceByWorkspace: new Map(),
}) }));
vi.mock('../shell/LcosProjectShell', () => ({ LcosProjectShell: (props: unknown) => { mock.shell(props); return null; } }));
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { roots.splice(0).forEach((root) => act(() => root.unmount())); vi.clearAllMocks(); });
function render(props = {}) { const root = createRoot(document.createElement('div')); roots.push(root); act(() => root.render(<LcosProjectRoute {...props} />)); }
it('canonicalizes a root even without canvasId and preserves unrelated URL state', () => {
  mock.search = '?workspaceId=root-context&view=near'; render();
  expect(mock.redirect).toHaveBeenCalledWith({ to: '/projects/p/context?view=near#focus', replace: true });
  expect(mock.shell).not.toHaveBeenCalled();
});
it('legacy canvas overrides select root surface without rewriting their URL', () => {
  render({ projectIdOverride: 'p', workspaceIdOverride: 'root-context', surfaceOverride: 'main' });
  expect(mock.redirect).not.toHaveBeenCalled();
  expect(mock.shell.mock.calls[0]?.[0]).toMatchObject({ surface: 'context' });
  expect(mock.shell.mock.calls[0]?.[0]).not.toHaveProperty('childWorkspaceId');
});
it.each(['child-context', 'missing-workspace'])('preserves explicit non-root target %s for the existing child/unavailable owner', (id) => {
  mock.search = `?workspaceId=${id}`; render();
  expect(mock.redirect).not.toHaveBeenCalled();
  expect(mock.shell.mock.calls[0]?.[0]).toMatchObject({ childWorkspaceId: id });
});
