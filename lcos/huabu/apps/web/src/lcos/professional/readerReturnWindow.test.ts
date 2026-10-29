import { describe, expect, it } from 'vitest';
import { readerReturnWindowId, withoutReaderOpenOrigin } from './readerReturnWindow';
import { collectionMembershipRefreshTransaction } from './collectionRefreshIntent';

const collection = { id: 'collection-window', bodyKey: 'collection' as const };
const reader = { id: 'reader-1', bodyKey: 'reader' as const, returnToWindowId: collection.id };

describe('Reader window-origin return', () => {
  it('returns to the existing Collection window', () => {
    expect(readerReturnWindowId(reader, [collection, reader])).toBe(collection.id);
  });
  it('returns from source material to the still-open extracted material Reader', () => {
    const extracted = { id: 'extracted-reader', bodyKey: 'reader' as const };
    expect(readerReturnWindowId({ ...reader, returnToWindowId: extracted.id }, [extracted, reader])).toBe(extracted.id);
  });
  it('fails closed if Collection was closed or replaced by an unrelated body', () => {
    expect(readerReturnWindowId(reader, [reader])).toBeUndefined();
    expect(readerReturnWindowId(reader, [{ ...collection, bodyKey: 'portal-preview' }])).toBeUndefined();
  });
  it('returns from a candidate result to its exact live conversation or task window', () => {
    for (const bodyKey of ['conversation', 'run-review'] as const) {
      const origin = { id: 'result-origin', bodyKey };
      expect(readerReturnWindowId({ ...reader, returnToWindowId: origin.id }, [origin, reader])).toBe(origin.id);
      expect(readerReturnWindowId({ ...reader, returnToWindowId: origin.id }, [reader])).toBeUndefined();
    }
  });
  it('does not invent a return for canvas Reader, recursive self or non-Reader', () => {
    expect(readerReturnWindowId({ ...reader, returnToWindowId: undefined }, [collection])).toBeUndefined();
    expect(readerReturnWindowId({ ...reader, returnToWindowId: reader.id }, [reader])).toBeUndefined();
    expect(readerReturnWindowId({ ...reader, bodyKey: 'collection' }, [collection])).toBeUndefined();
  });
  it('clears old canvas and Collection origins when reopening an existing Reader', () => {
    const oldReader = { ...reader, readerSource: { surface: 'main', nodeId: 'old-canvas-node' }, sourceLocator: { kind: 'page', pageNumber: 2 } };
    expect(withoutReaderOpenOrigin(oldReader)).toEqual({ id: 'reader-1', bodyKey: 'reader' });
  });
});

describe('Collection receipt-driven invalidation', () => {
  const event = (status: string, collectionId = 'collection-a', projectId = 'p') => ({
    originalIntent: { intent: { kind: 'collection-membership', collectionId } },
    receipt: { transactionId: 'tx-9', status, projectId },
  });
  it('invalidates after confirmed success and partial success only', () => {
    expect(collectionMembershipRefreshTransaction(event('success'), 'p', 'collection-a')).toBe('tx-9');
    expect(collectionMembershipRefreshTransaction(event('partial'), 'p', 'collection-a')).toBe('tx-9');
    expect(collectionMembershipRefreshTransaction(event('failed'), 'p', 'collection-a')).toBeUndefined();
  });
  it('rejects other collection, other project, draft intent and absent receipts', () => {
    expect(collectionMembershipRefreshTransaction(event('success'), 'p', 'collection-b')).toBeUndefined();
    expect(collectionMembershipRefreshTransaction(event('success', 'collection-a', 'other'), 'p', 'collection-a')).toBeUndefined();
    expect(collectionMembershipRefreshTransaction({ ...event('success'), originalIntent: { intent: { kind: 'assembly-apply' } } }, 'p', 'collection-a')).toBeUndefined();
    expect(collectionMembershipRefreshTransaction(null, 'p', 'collection-a')).toBeUndefined();
  });
});
