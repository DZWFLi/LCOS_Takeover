import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { NodeReferenceMarker } from './NodeReferenceMarker';
let host: HTMLDivElement; let root: Root;
beforeEach(() => { useLcosReferenceStore.getState().reset(); useLcosReferenceStore.getState().setProject('reference-project');
  useLcosReferenceStore.getState().registerNodeEntity('material-node', { entityType: 'artifact', entityId: 'real-material', displayLabel: '材料' });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('appears only for an actual draft reference and removes that reference without removing node identity', async () => {
  await act(async () => root.render(<NodeReferenceMarker nodeId="material-node" />)); expect(host.querySelector('button')).toBeNull();
  await act(async () => { useLcosReferenceStore.getState().toggleNodeReference('material-node'); });
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('移除 材料 的引用');
  await act(async () => host.querySelector('button')!.click());
  expect(host.querySelector('button')).toBeNull();
  expect(useLcosReferenceStore.getState().isNodeReferenced('material-node')).toBe(false);
  expect(useLcosReferenceStore.getState().nodeEntityRefs.has('material-node')).toBe(true);
});
