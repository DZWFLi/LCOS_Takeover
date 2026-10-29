import { describeProjectedEntity } from '@local-creative-os/web-gen2';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { LcosNodePresentationProvider } from '@/lcos-seam/nodePresentation';

import { createLcosNodePresentationSeam } from './createLcosNodePresentationSeam';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type { Workspace } from '@local-creative-os/domain';

function workspace(id: string, scopeId: string, canvasId?: string, name = '真实现场'): Workspace {
  return { id: id as Workspace['id'], projectId: 'project-source' as Workspace['projectId'], scopeId: scopeId as Workspace['scopeId'],
    name, intent: null, viewport: { x: 0, y: 0, zoom: 1 }, focusedViewIds: [], visibleLayers: [], contextPolicy: 'workspace-related',
    ...(canvasId ? { canvasId } : {}), updatedAt: '2026-10-08T00:00:00Z' as Workspace['updatedAt'] };
}

const mocks = vi.hoisted(() => ({ getWorkspaces: vi.fn(), enter: vi.fn(), state: { canvasId: 'main-canvas', nodes: [] } }));
vi.mock('@/store/canvasStore', () => ({ default: (select: (value: typeof mocks.state) => unknown) => select(mocks.state) }));
vi.mock('./useLcosDensity', () => ({ useLcosDensity: () => 'reading' }));
vi.mock('../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({ projects: { getWorkspaces: mocks.getWorkspaces } }) }));
vi.mock('../navigation/childWorksiteNavigation', () => ({ beginChildWorksiteNavigation: mocks.enter }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement; let root: Root;
function element<T extends Element>(selector: string): T {
  const node = host.querySelector<T>(selector); if (!node) throw new Error(`Missing actual body element: ${selector}`); return node;
}
beforeEach(() => {
  useLcosReferenceStore.getState().setProject('project-source');
  useLcosReferenceStore.getState().resetNodeEntities();
  useLcosShellStore.getState().clear();
  useLcosShellStore.getState().setProject('project-source');
  mocks.getWorkspaces.mockReset(); mocks.enter.mockClear();
  mocks.getWorkspaces.mockResolvedValue([]);
  mocks.enter.mockResolvedValue(true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function mount(kind: 'image' | 'workflow') {
  const entityType = kind === 'workflow' ? 'scope' : 'artifact';
  useLcosReferenceStore.getState().registerNodeEntity('node-real', {
    entityType, entityId: 'entity-real', descriptor: describeProjectedEntity({
      entityType, entityId: 'entity-real', title: '真实对象', artifactKind: kind,
      ...(kind === 'image' ? { managed: true, sourceRunId: 'run-real', currentRevisionId: 'revision-real' } : {}),
    }),
  });
  const input = { nodeId: 'node-real', nodeType: 'note', data: { title: '真实对象', presentationMediaSrc: '/real-image.png' } };
  const Body = createLcosNodePresentationSeam().resolve(input);
  if (!Body) throw new Error('Expected actual bound body');
  await act(async () => root.render(<MemoryRouter><LcosNodePresentationProvider value={{
    worldWidth: 248, worldHeight: 244, zoom: 1, screenWidth: 248, screenHeight: 244, dpr: 1, phase: 'rest',
  }}><Body {...input} /></LcosNodePresentationProvider></MemoryRouter>));
}
it('generated image uses the actual seam body; only double click opens its real Reader target', async () => {
  await mount('image');
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/real-image.png');
  expect(host.textContent).not.toContain('待 Review');
  const body = element<HTMLElement>('[data-lcos-species-body]');
  await act(async () => body.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(useLcosShellStore.getState().windows).toHaveLength(0);
  await act(async () => body.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(useLcosShellStore.getState().windows).toHaveLength(1);
  expect(useLcosShellStore.getState().windows[0]).toMatchObject({ target: 'entity-real', bodyKey: 'reader' });
});
it('a workflow with several workspaces never silently enters the first one', async () => {
  mocks.getWorkspaces.mockResolvedValue([
    workspace('a', 'entity-real', 'canvas-a', '现场A'),
    workspace('b', 'entity-real', 'canvas-b', '现场B'),
  ]);
  await mount('workflow');
  expect(mocks.enter).not.toHaveBeenCalled();
  expect(host.querySelector('[role="menu"]')).toBeNull();
  expect(host.querySelectorAll('[data-lcos-workflow-node-entries] button')).toHaveLength(2);
  const second = host.querySelector<HTMLButtonElement>('[aria-label="进入 现场B"]');
  expect(second).toBeDefined();
  if (!second) throw new Error('Expected named actual workspace button');
  await act(async () => second.click());
  expect(mocks.enter).toHaveBeenCalledWith(expect.objectContaining({ targetWorkspace: expect.objectContaining({ id: 'b' }) }));
});
it('a known workflow target keeps the existing explicit child navigation', async () => {
  mocks.getWorkspaces.mockResolvedValue([workspace('a', 'entity-real', 'canvas-a')]);
  await mount('workflow');
  expect(host.querySelector('.lcos-workflow-collection-front')).not.toBeNull();
  expect((host.querySelector('[data-lcos-species-body]') as HTMLElement).style.background).toBe('transparent');
  await act(async () => element<HTMLButtonElement>('[aria-label="进入 Workflow · 真实对象"]').click());
  expect(mocks.enter).toHaveBeenCalledWith(expect.objectContaining({
    sourceNodeId: 'node-real', targetSurface: 'workflow', targetWorkspace: expect.objectContaining({ id: 'a' }),
  }));
});

it('retry controls never double-open Reader while repairing a failed image', async () => {
  await mount('image');
  await act(async () => element<HTMLImageElement>('img').dispatchEvent(new Event('error')));
  const retry = element<HTMLButtonElement>('button');
  expect(retry.textContent).toBe('重试');
  await act(async () => retry.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(useLcosShellStore.getState().windows).toHaveLength(0);
});

it('a workflow never enters a different scope or a workspace without a canvas', async () => {
  mocks.getWorkspaces.mockResolvedValue([
    workspace('correct-missing-canvas', 'entity-real', undefined, '真实但未就绪'),
    workspace('unrelated-ready', 'other-scope', 'other-canvas', '别的集合'),
  ]);
  await mount('workflow');
  expect(mocks.getWorkspaces).toHaveBeenCalledWith('project-source');
  expect(host.querySelector('.lcos-workflow-collection-slot')?.getAttribute('aria-disabled')).toBe('true');
  expect(host.querySelector('button')).toBeNull();
  expect(host.textContent).toContain('现场尚未就绪');
  await act(async () => element<HTMLElement>('[data-lcos-species-body]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(mocks.enter).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('别的集合');
});
