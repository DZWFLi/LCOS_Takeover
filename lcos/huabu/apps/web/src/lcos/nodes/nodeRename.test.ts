import { describe, expect, it, vi } from 'vitest';

import useCanvasStore from '@/store/canvasStore';

import { useLcosReferenceStore } from '../lcosReferenceState';
import { renameCanvasNode } from './nodeRename';

const rename = vi.hoisted(() => vi.fn());
vi.mock('../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({ artifacts: { renameEntity: rename } }) }));
describe('canonical node manual title owner', () => {
  it('sends Core identity to the manual API and never rewrites only the Huabu label', async () => {
    useCanvasStore.getState()._setStateNoAutosave({ canvasId: undefined, nodes: [{ id: 'carrier', type: 'text', position: { x: 0, y: 0 }, data: { label: 'Native label' } }] });
    useLcosReferenceStore.getState().reset(); useLcosReferenceStore.getState().setProject('p-title');
    useLcosReferenceStore.getState().registerNodeEntity('carrier', { entityType: 'artifact', entityId: 'a-title' });
    rename.mockResolvedValue({ entity: 'artifact', id: 'a-title', title: 'Human title', mode: 'manual' });
    await renameCanvasNode('carrier', ' Human title ');
    expect(rename).toHaveBeenCalledWith('artifact', 'a-title', 'Human title');
    expect(useCanvasStore.getState().nodes[0]?.data.label).toBe('Native label');
  });
});
