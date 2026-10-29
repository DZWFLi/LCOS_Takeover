import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { useNativePreviewCanEdit } from '@/lcos-seam/previewEditingPolicy';

import { NativeWorkspaceBody } from './NativeWorkspaceBody';
import { useLcosReferenceStore } from '../lcosReferenceState';

vi.mock('@/components/Panels/PreviewWorkspace/PreviewWorkspacePanel', () => ({
  PreviewWorkspacePanel: () => <><input data-native-node="bound" disabled={!useNativePreviewCanEdit('bound')} />
    <input data-native-node="local" disabled={!useNativePreviewCanEdit('local')} /></>,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('preserves native editing for unbound nodes while Core-bound content uses the canonical editor', async () => {
  useLcosReferenceStore.getState().reset();
  useLcosReferenceStore.setState({ bindingIdentitiesReady: false });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<NativeWorkspaceBody onClose={() => {}} />));
    const input = (id: string) => host.querySelector<HTMLInputElement>(`[data-native-node="${id}"]`);
    expect(input('local')?.disabled).toBe(true);
    await act(async () => {
      useLcosReferenceStore.getState().registerNodeEntity('bound', { entityType: 'artifact', entityId: 'material' });
      useLcosReferenceStore.setState({ bindingIdentitiesReady: true });
    });
    expect(input('local')?.disabled).toBe(false);
    expect(input('bound')?.disabled).toBe(true);
  } finally { act(() => root.unmount()); host.remove(); useLcosReferenceStore.getState().reset(); }
});
