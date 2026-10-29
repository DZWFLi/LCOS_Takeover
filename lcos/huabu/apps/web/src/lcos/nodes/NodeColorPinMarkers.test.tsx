import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { colorPinTargetKey } from '@local-creative-os/web-gen2';

import { LcosNodePresentationProvider } from '@/lcos-seam/nodePresentation';
import { NodeColorPinMarkers } from './NodeColorPinMarkers';
import { useLcosReferenceStore } from '../lcosReferenceState';
import type { ColorPinMembershipV0 } from '@local-creative-os/contracts';

const pins = vi.hoisted(() => ({
  projectId: 'project-pin',
  snapshot: { definitions: [{ id: 'red', projectId: 'project-pin', color: '#d93c3c', label: '待整理', createdAt: '', updatedAt: '' }], memberships: [] },
  membershipsByTargetKey: new Map<string, readonly ColorPinMembershipV0[]>(),
  openAuthoring: vi.fn(),
}));
vi.mock('../pin/LcosColorPinProvider', () => ({ useOptionalLcosColorPins: () => pins }));
let host: HTMLDivElement; let root: Root;
const target = { projectId: 'project-pin', kind: 'entity' as const, id: 'artifact-real' };
function assign(kind: 'entity' | 'view' = 'entity') {
  const targetRef = { ...target, kind };
  pins.membershipsByTargetKey = new Map([[colorPinTargetKey(targetRef), [{
    id: 'membership-real', projectId: pins.projectId, colorPinId: 'red', targetRef, createdAt: '', updatedAt: '',
  }]]]);
}
async function render(zoom = 1, worldWidth = 410) {
  await act(async () => root.render(<LcosNodePresentationProvider value={{
    worldWidth, worldHeight: 273, zoom, dpr: 1, screenWidth: worldWidth * zoom,
    screenHeight: 273 * zoom, phase: 'rest',
  }}><NodeColorPinMarkers nodeId="node-real" /></LcosNodePresentationProvider>));
}
beforeEach(() => {
  pins.membershipsByTargetKey = new Map(); pins.openAuthoring.mockClear();
  useLcosReferenceStore.getState().setProject('project-pin');
  useLcosReferenceStore.getState().resetNodeEntities();
  useLcosReferenceStore.getState().registerNodeEntity('node-real', { entityType: 'artifact', entityId: 'artifact-real', displayLabel: '图片' });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('shows no fabricated marker without membership; reacts to add/remove', async () => {
  await render(); expect(host.querySelector('button')).toBeNull();
  assign(); await render(); expect(host.querySelectorAll('button')).toHaveLength(1);
  pins.membershipsByTargetKey = new Map(); await render(); expect(host.querySelector('button')).toBeNull();
});
it('uses the canonical color independent of node width and opens the exact same target', async () => {
  assign(); await render(1, 410);
  const color = (host.querySelector('[data-pin-color="D93C3C"]') as HTMLElement).style.background;
  await render(.5, 205);
  expect((host.querySelector('[data-pin-color="D93C3C"]') as HTMLElement).style.background).toBe(color);
  expect((host.querySelector('[data-lcos-node-color-pins]') as HTMLElement).style.transform).toBe('scale(2)');
  await act(async () => host.querySelector('button')!.click());
  expect(pins.openAuthoring).toHaveBeenCalledWith({ targetRef: target, label: '图片' });
});
it('does not merge an entity marker with a view-specific marker', async () => {
  assign('view'); await render(); expect(host.querySelector('button')).toBeNull();
  useLcosReferenceStore.getState().registerNodeEntity('node-real', { entityType: 'view', entityId: 'artifact-real' });
  await render(); expect(host.querySelector('button')?.dataset.lcosPinTargetKind).toBe('view');
});
