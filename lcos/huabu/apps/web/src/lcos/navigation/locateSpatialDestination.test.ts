import { afterEach, expect, it, vi } from 'vitest';

import { locateSpatialDestination } from './locateSpatialDestination';
import { navigationGraph } from './navigationFixtures';
import { projectSpatialDestinations } from './projectNavigationIndex';

const m = vi.hoisted(() => ({ canvas: { canvasId: 'main', nodes: [] as Array<{ id: string; hidden?: boolean }> },
  refs: new Map<string,{entityType: string; entityId: string}>(), locate: vi.fn(), wait: vi.fn(), projectId: 'p' }));
vi.mock('@/store/canvasStore', () => ({ default: { getState: () => m.canvas } }));
vi.mock('../lcosReferenceState', () => ({ useLcosReferenceStore: { getState: () => ({ nodeEntityRefs: m.refs }) } }));
vi.mock('../shell/lcosShellStore', () => ({ useLcosShellStore: { getState: () => ({ projectId: m.projectId, activeSurface: 'main', requestLocate: m.locate }) } }));
vi.mock('./waitForProjectedEntity', () => ({ waitForProjectedEntity: m.wait }));
afterEach(() => { m.canvas.canvasId = 'main'; m.canvas.nodes = []; m.refs.clear(); m.projectId = 'p'; vi.resetAllMocks(); });
const destination = () => projectSpatialDestinations('p',navigationGraph({ scopes: [{ id: 'context', projectId: 'p', kind: 'context', name: '需求' }] }),[])[0];

it('locates an existing hidden body through the shared consumer without changing selection or opening another window', async () => {
  m.canvas.nodes = [{ id: 'scope-body', hidden: true }]; m.refs.set('scope-body',{ entityType: 'scope', entityId: 'context' });
  const navigate = vi.fn();
  expect(await locateSpatialDestination('p',destination(),{ mainCanvasId: 'main', onNavigateMain: navigate })).toBe(true);
  expect(navigate).not.toHaveBeenCalled(); expect(m.wait).not.toHaveBeenCalled();
  expect(m.locate).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'scope-body', canvasId: 'main', preserveSelection: true }));
});
it('returns to the canonical Main then waits for the real Scope projection', async () => {
  m.canvas.canvasId = 'child'; m.wait.mockResolvedValue('real-main-body');
  const navigate = vi.fn(async () => { m.canvas.canvasId = 'main'; return true; });
  expect(await locateSpatialDestination('p',destination(),{ mainCanvasId: 'main', onNavigateMain: navigate })).toBe(true);
  expect(navigate).toHaveBeenCalledOnce();
  expect(m.wait).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p', canvasId: 'main', entityType: 'scope', entityId: 'context' }));
  expect(m.locate).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'real-main-body' }));
});
it('does not replace a missing Main body with an Assembly or fabricate an address', async () => {
  const navigate = vi.fn(); m.wait.mockResolvedValue(undefined);
  expect(await locateSpatialDestination('p',destination(),{ onNavigateMain: navigate })).toBe(false);
  expect(navigate).not.toHaveBeenCalled(); expect(m.locate).not.toHaveBeenCalled();
});
it('ignores late projection arrival after navigation cancellation or a project change', async () => {
  const controller = new AbortController(); m.canvas.canvasId = 'child';
  let finish: (value: string) => void = () => { throw new Error('Wait not started'); };
  m.wait.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
  const pending = locateSpatialDestination('p',destination(),{ mainCanvasId: 'main', signal: controller.signal,
    onNavigateMain: async () => { m.canvas.canvasId = 'main'; return true; } });
  await vi.waitFor(() => expect(m.wait).toHaveBeenCalled()); controller.abort(); finish('late');
  expect(await pending).toBe(false); expect(m.locate).not.toHaveBeenCalled();
});
