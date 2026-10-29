import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

import { LcosSurfaceDock } from './LcosSurfaceDock';
import { PortalDropWorkspaceProvider } from '../drop/PortalDropWorkspaceContext';
import { useLcosDropStore } from '../lcosDropState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ switchWorksite: vi.fn() }));
vi.mock('../app/useLcosWorksiteNav', () => ({ useLcosWorksiteNav: () => ({
  busySurface: null, transitionError: null, switchWorksite: mocks.switchWorksite,
}) }));
vi.mock('../navigation/useHudViewport', () => ({ useHudViewport: () => ({ width: 1000, height: 800 }) }));
vi.mock('../navigation/useAvoidingHudPosition', () => ({ useAvoidingHudPosition: () => ({
  ref: useRef<HTMLDivElement>(null), rect: { x: 400, y: 730, width: 178, height: 58 },
  measuredSize: undefined, resolve: () => ({ available: true }),
}) }));
afterEach(() => { useLcosDropStore.getState().reset(); vi.restoreAllMocks(); mocks.switchWorksite.mockReset(); });

it('wires the existing three Dock buttons into the shared live target registry without navigating on receive', () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    left: 20, top: 20, width: 80, height: 40, x: 20, y: 20, right: 100, bottom: 60, toJSON: () => ({}),
  }));
  try {
    act(() => root.render(<MemoryRouter><PortalDropWorkspaceProvider projectId="project" workspaces={[
      { id: 'm', scopeId: 'root-scope', name: 'Main的真现场', preferredSurface: 'main', canvasId: 'main-canvas' },
      { id: 'c', scopeId: 'context-scope', name: '瞎起名', preferredSurface: 'context', canvasId: 'context-canvas' },
    ]}><LcosSurfaceDock projectId="project" canvasBySurface={{ main: 'main-canvas', context: 'context-canvas' }}
      ensureCanvas={async () => undefined} /></PortalDropWorkspaceProvider></MemoryRouter>));
    const targets = useLcosDropStore.getState().targets();
    expect(targets).toHaveLength(3);
    expect(targets.find(target => target.targetId === 'surface-dock:project:main')?.semantic)
      .toEqual({ kind: 'spatial-membership', targetRef: { kind: 'main' } });
    expect(targets.find(target => target.targetId === 'surface-dock:project:context')?.semantic)
      .toEqual({ kind: 'spatial-membership', targetRef: { kind: 'context', id: 'context-scope' } });
    expect(targets.find(target => target.targetId === 'surface-dock:project:workflow')?.kind).toBe('drop-exclusion');
    expect(mocks.switchWorksite).not.toHaveBeenCalled();
    act(() => host.querySelector<HTMLButtonElement>('[data-lcos-surface="context"]')?.click());
    expect(mocks.switchWorksite).toHaveBeenCalledExactlyOnceWith('context');
    expect(useLcosDropStore.getState().state.status).toBe('idle');
  } finally { act(() => root.unmount()); host.remove(); }
  expect(useLcosDropStore.getState().targets()).toHaveLength(0);
});
