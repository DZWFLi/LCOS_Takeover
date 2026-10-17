import { describeProjectedEntity } from '@local-creative-os/web-gen2';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useLcosReferenceStore } from '../lcosReferenceState';
import { BoundNodeLoadingBody } from './BoundNodeLoadingBody';
import { createLcosNodePresentationSeam } from './createLcosNodePresentationSeam';
vi.mock('@/components/Common/SkeletonLoadingIndicator', () => ({ SkeletonLoadingIndicator: () => <div data-existing-skeleton /> }));
let host: HTMLDivElement; let root: Root;
const input = { nodeId: 'bound', nodeType: 'note', data: {} };
beforeEach(() => { useLcosReferenceStore.getState().reset(); useLcosReferenceStore.getState().setProject('p'); useLcosReferenceStore.getState().beginNodeBindingRead('p', 'c');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('only confirmed identities use the shared skeleton; freeform nodes remain native', async () => {
  const seam = createLcosNodePresentationSeam();
  expect(seam.resolve(input)).toBeUndefined();
  useLcosReferenceStore.getState().applyNodeBindings('p','c',[{ spatialId:'bound', entityType:'artifact', entityId:'real-artifact' }],'loading');
  expect(seam.resolve(input)).toBe(BoundNodeLoadingBody);
  expect(seam.resolveHostPresentation?.(input)?.surface).toBe('transparent');
  await act(async () => root.render(<BoundNodeLoadingBody {...input} />)); expect(host.querySelector('[data-existing-skeleton]')).not.toBeNull();
  const descriptor = describeProjectedEntity({ entityType:'artifact', entityId:'real-artifact', artifactKind:'image', title:'实图' });
  await act(async () => useLcosReferenceStore.getState().applyNodeBindings('p','c',[{ spatialId:'bound', entityType:'artifact', entityId:'real-artifact', descriptor }],'ready'));
  expect(seam.resolve(input)).not.toBe(BoundNodeLoadingBody);
  expect(seam.resolve({ ...input, nodeId:'authored-native' })).toBeUndefined();
});
it('failed or missing descriptions offer a real retry, not an endless loading skeleton', async () => {
  useLcosReferenceStore.getState().applyNodeBindings('p','c',[{ spatialId:'bound', entityType:'artifact', entityId:'real-artifact' }],'loading');
  await act(async () => root.render(<BoundNodeLoadingBody {...input} />));
  await act(async () => useLcosReferenceStore.getState().failNodeBindingRead('p','c'));
  expect(host.querySelector('[data-existing-skeleton]')).toBeNull(); expect(host.textContent).toContain('对象内容暂不可用');
  const before = useLcosReferenceStore.getState().bindingRefreshVersion;
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(useLcosReferenceStore.getState().bindingRefreshVersion).toBe(before+1);
});
it('wrong project/canvas updates cannot replace current binding identities', () => {
  useLcosReferenceStore.getState().applyNodeBindings('other','c',[{ spatialId:'bad',entityType:'artifact',entityId:'bad' }],'ready');
  useLcosReferenceStore.getState().applyNodeBindings('p','other',[{ spatialId:'bad',entityType:'artifact',entityId:'bad' }],'ready');
  expect(useLcosReferenceStore.getState().nodeEntityRefs.size).toBe(0);
  expect(useLcosReferenceStore.getState().bindingReadStatus).toBe('loading');
});
