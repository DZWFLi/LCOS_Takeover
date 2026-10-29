import { expect, it, vi } from 'vitest';

import { readResourceUrlDescriptors, resourceUrlPresentation } from '../../../../../../apps/web-gen2/src/presentation/resourceUrlProjection';

import type { ResourceDescriptorV0 } from '@local-creative-os/contracts';

const descriptor = { projectId: 'p', resourceId: 'resource-real', artifactId: 'artifact-real', sourceRevisionId: 'rev-real',
  source: { kind: 'url', normalizedUrl: 'https://example.com/path' } } as ResourceDescriptorV0;
it('derives web source from the exact canonical artifact/project/revision and never current-as-history', () => {
  expect(resourceUrlPresentation([descriptor], { projectId: 'p', artifactId: 'artifact-real', revisionId: 'rev-real' }))
    .toEqual({ sourceKind: 'url', sourceUrl: 'https://example.com/path', resourceId: 'resource-real' });
  expect(resourceUrlPresentation([descriptor], { projectId: 'p', artifactId: 'resource-real', revisionId: 'rev-real' })).toBeUndefined();
  expect(resourceUrlPresentation([descriptor], { projectId: 'other', artifactId: 'artifact-real', revisionId: 'rev-real' })).toBeUndefined();
  expect(resourceUrlPresentation([descriptor], { projectId: 'p', artifactId: 'artifact-real', revisionId: 'old-rev' })).toBeUndefined();
  expect(resourceUrlPresentation([descriptor], { projectId: 'p', artifactId: 'artifact-real', revisionId: undefined })).toBeUndefined();
});
it('does not infer URLs from markdown bodies, file descriptors, or unsafe source protocols', () => {
  const target = { projectId: 'p', artifactId: 'artifact-real', revisionId: 'rev-real' };
  expect(resourceUrlPresentation([{ ...descriptor, source: { kind: 'file', normalizedUrl: 'https://example.com/' } }], target)).toBeUndefined();
  expect(resourceUrlPresentation([{ ...descriptor, source: { kind: 'url', normalizedUrl: 'javascript:alert(1)' } }], target)).toBeUndefined();
  expect(resourceUrlPresentation([{ ...descriptor, source: { kind: 'url', normalizedUrl: 'https://user:secret@example.com/' } }], target)).toBeUndefined();
});
it('reads only canonical URL resources and preserves successful entries when one descriptor is missing', async () => {
  const list = vi.fn(async () => ['resource-real', 'missing', 'file'].map(id => ({ resourceId: id, artifactId: id,
    title: id, sourceKind: id === 'file' ? 'file' : 'url', status: 'pending', analyzerVersion: 'existing' })));
  const read = vi.fn(async (_project: string, id: string) => { if (id === 'missing') throw new Error('已缺失'); return descriptor; });
  const result = await readResourceUrlDescriptors({ list, descriptor: read }, 'p');
  expect(result.descriptors).toEqual([descriptor]); expect(result.issues).toEqual(['missing: 已缺失']);
  expect(read).toHaveBeenCalledTimes(2); expect(read).not.toHaveBeenCalledWith('p', 'file', undefined);
});
