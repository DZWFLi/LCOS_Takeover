import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { ContextWorksite } from './ContextWorksite';

import type { WarehouseItemV1 } from '@local-creative-os/contracts';
import type { Workspace } from '@local-creative-os/domain';

const m = vi.hoisted(() => ({
  switchWorksite: vi.fn(), child: vi.fn(), navigate: vi.fn(), entered: vi.fn(),
  item: { schemaVersion: 1, kind: 'scene', title: '目标现场', usageCount: 0, entityRef: { type: 'scene', id: 'target' } } as WarehouseItemV1,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => m.navigate }));
vi.mock('../../app/useLcosWorksiteNav', () => ({ useLcosWorksiteNav: () => ({ switchWorksite: m.switchWorksite }) }));
vi.mock('../../navigation/childWorksiteNavigation', () => ({ beginChildWorksiteNavigation: m.child }));
vi.mock('../../lcosReferenceState', () => ({ useLcosReferenceStore: { getState: () => ({ nodeEntityRefs: new Map() }) } }));
vi.mock('../../shell/lcosShellStore', () => ({ useLcosShellStore: Object.assign(
  (selector: (state: { activeWorkspaceId: string }) => unknown) => selector({ activeWorkspaceId: 'source' }),
  { getState: () => ({ activeWorkspaceId: 'source' }) },
) }));
vi.mock('../../shell/LcosWorksiteStage', () => ({ LcosWorksiteStage: () => null }));
vi.mock('./TemporalRail', () => ({ TemporalRail: () => <div data-temporal /> }));
vi.mock('./ContextAtlasStage', () => ({ ContextAtlasStage: ({ onEnterSurface }: { onEnterSurface: (item: WarehouseItemV1) => boolean | Promise<boolean> }) => <button data-atlas-enter onClick={() => { void Promise.resolve(onEnterSurface(m.item)).then(m.entered); }}>打开</button> }));
vi.mock('motion/react', () => ({ AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(() => { for (const root of roots.splice(0)) act(() => root.unmount()); document.body.replaceChildren(); vi.resetAllMocks(); });
async function mount(canvasId: string, isChildWorksite = false, currentTarget = false) {
  const el = document.createElement('div'); document.body.append(el);
  const root = createRoot(el); roots.push(root);
  const workspace = { id: currentTarget ? 'source' : 'target', scopeId: 'target', name: '目标现场', preferredSurface: 'context', canvasId } as Workspace;
  m.item = { ...m.item, entityRef: { type: 'scene', id: String(workspace.id) } };
  await act(async () => root.render(<ContextWorksite projectId="p" surface="context" canvasId={currentTarget ? canvasId : undefined} workspaces={[workspace]} canvasBySurface={{ main: 'main-root', context: 'context-root' }} ensureCanvas={async () => undefined} isChildWorksite={isChildWorksite} />));
  await act(async () => el.querySelector<HTMLButtonElement>('[data-lcos-context-instrument="atlas"]')?.click());
  expect(el.querySelector<HTMLButtonElement>('[data-lcos-context-instrument="atlas"]')?.getAttribute('aria-expanded')).toBe('true');
  await act(async () => el.querySelector<HTMLButtonElement>('[data-atlas-enter]')?.click());
  return el;
}
it('opens the current root Context through the surface owner and only retracts its Atlas', async () => {
  m.switchWorksite.mockResolvedValue(true);
  const el = await mount('context-root');
  expect(m.switchWorksite).toHaveBeenCalledWith('context');
  expect(m.child).not.toHaveBeenCalled();
  expect(el.querySelector('[data-atlas-enter]')).toBeNull();
  expect(el.querySelector('[data-temporal]')).toBeNull();
});
it('switches another root without inventing a nested return chain', async () => {
  m.switchWorksite.mockResolvedValue(true);
  await mount('main-root');
  expect(m.switchWorksite).toHaveBeenCalledWith('main');
  expect(m.child).not.toHaveBeenCalled();
});
it('leaves Atlas visible when the root transition could not complete', async () => {
  m.switchWorksite.mockResolvedValue(false);
  const el = await mount('context-root');
  expect(el.querySelector('[data-atlas-enter]')).not.toBeNull();
  expect(m.entered).toHaveBeenCalledWith(false);
});
it('retains the original child navigation and source child identity for real child workspaces', async () => {
  m.child.mockReturnValue(true);
  const el = await mount('child-canvas', true);
  expect(m.switchWorksite).not.toHaveBeenCalled();
  expect(m.child).toHaveBeenCalledWith(expect.objectContaining({
    sourceWasChild: true, sourceWorkspaceId: 'source', targetWorkspace: expect.objectContaining({ canvasId: 'child-canvas' }),
  }));
  expect(el.querySelector('[data-temporal]')).not.toBeNull();
});
it('reopening the active child retracts Atlas while retaining its address and original return', async () => {
  const el = await mount('current-child', true, true);
  expect(m.child).not.toHaveBeenCalled();
  expect(m.switchWorksite).not.toHaveBeenCalled();
  expect(m.navigate).not.toHaveBeenCalled();
  expect(m.entered).toHaveBeenCalledWith(true);
  expect(el.querySelector('[data-atlas-enter]')).toBeNull();
  expect(el.querySelector('[data-temporal]')).not.toBeNull();
});

it('does not acknowledge a root switch before the existing navigation owner confirms it', async () => {
  let resolve!: (value: boolean) => void;
  m.switchWorksite.mockReturnValue(new Promise<boolean>((done) => { resolve = done; }));
  const el = await mount('context-root');
  expect(m.entered).not.toHaveBeenCalled();
  expect(el.querySelector('[data-atlas-enter]')).not.toBeNull();
  await act(async () => { resolve(true); });
  expect(m.entered).toHaveBeenCalledWith(true);
  expect(el.querySelector('[data-atlas-enter]')).toBeNull();
});
