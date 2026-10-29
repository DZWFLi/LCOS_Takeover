import { describe, expect, it } from 'vitest';

import { contextAtlasDropSemantic, contextAtlasDropSource } from './contextAtlasDrop';

import type { WarehouseItemV1 } from '@local-creative-os/contracts';

const context: WarehouseItemV1 = { schemaVersion: 1, kind: 'context', entityRef: { type: 'context', id: 'scope-actual' },
  title: '取名叫Collection也还是Context', usageCount: 0 };
const collection: WarehouseItemV1 = { ...context, kind: 'collection', entityRef: { type: 'collection', id: 'collection-actual' } };

describe('Atlas canonical source and receiver identities', () => {
  it('takes the Context scope as one aggregate and receives through its true context address', () => {
    expect(contextAtlasDropSource(context, 'project')).toMatchObject({ kind: 'assembly', itemId: 'scope-actual',
      sourceRef: { kind: 'context', id: 'scope-actual' }, entityRef: { type: 'scope', id: 'scope-actual' } });
    expect(contextAtlasDropSemantic(context)).toEqual({ kind: 'spatial-membership', targetRef: { kind: 'context', id: 'scope-actual' } });
  });
  it('keeps typed Collection membership separate from scope membership', () => {
    expect(contextAtlasDropSource(collection, 'project')).toMatchObject({ kind: 'assembly', itemId: 'collection-actual',
      sourceRef: { kind: 'collection', id: 'collection-actual' }, entityRef: { type: 'collection', id: 'collection-actual' } });
    expect(contextAtlasDropSemantic(collection)).toEqual({ kind: 'collection-membership', collectionId: 'collection-actual' });
  });
  it('rejects mismatched read-model identity and empty canonical IDs', () => {
    for (const item of [{ ...collection, entityRef: context.entityRef },
      { ...context, entityRef: { type: 'context' as const, id: ' ' } }]) {
      expect(contextAtlasDropSource(item, 'project')).toBeUndefined();
      expect(contextAtlasDropSemantic(item)).toBeUndefined();
    }
  });
});
