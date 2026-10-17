import { describe, expect, it } from 'vitest';

import {
  buildSelectedContextReferences,
  retainContinuationIntent,
  settleContinuationIntent,
} from './conversationContinuationActions';

describe('conversation continuation UI intents', () => {
  it('keeps the caller-owned operation id across an uncertain retry and rotates only after success', () => {
    const first = retainContinuationIntent(undefined, 'blank_new', 'p-1:c-1', () => 'op-1');
    const retry = retainContinuationIntent(first, 'blank_new', 'p-1:c-1', () => 'op-2');
    expect(retry).toEqual({ action: 'blank_new', targetKey: 'p-1:c-1', operationId: 'op-1' });
    expect(settleContinuationIntent(retry, 'blank_new', 'op-1', false)).toEqual(retry);
    expect(settleContinuationIntent(retry, 'blank_new', 'op-stale', true)).toEqual(retry);
    expect(settleContinuationIntent(retry, 'blank_new', 'op-1', true)).toBeUndefined();
  });

  it('binds an uncertain intent to its conversation and selected-context snapshot', () => {
    const originalReferences = [{ order: 0, ref: { type: 'artifact' as const, artifactId: 'a-1' } }];
    const first = retainContinuationIntent(
      undefined,
      'selected_context',
      'p-1:c-1',
      () => 'op-1',
      originalReferences,
    );
    const retry = retainContinuationIntent(
      first,
      'selected_context',
      'p-1:c-1',
      () => 'op-2',
      [{ order: 0, ref: { type: 'artifact', artifactId: 'a-2' } }],
    );
    expect(retry.operationId).toBe('op-1');
    expect(retry.orderedReferences).toEqual(originalReferences);

    const otherConversation = retainContinuationIntent(first, 'selected_context', 'p-1:c-2', () => 'op-3');
    expect(otherConversation.operationId).toBe('op-3');
    expect(otherConversation.targetKey).toBe('p-1:c-2');
  });

  it('builds ordered selected-context refs from the canonical draft and blocks unsupported kinds', () => {
    const result = buildSelectedContextReferences([
      { entityType: 'artifact', entityId: 'a-1' },
      { entityType: 'conversation', entityId: 'c-1' },
      { entityType: 'note', entityId: 'n-1' },
      { entityType: 'scope', entityId: 's-1' },
    ]);
    expect(result.orderedReferences).toEqual([
      { order: 0, ref: { type: 'artifact', artifactId: 'a-1' } },
      { order: 1, ref: { type: 'conversation', conversationSessionId: 'c-1' } },
      { order: 3, ref: { type: 'scope', scopeId: 's-1' } },
    ]);
    expect(result.unsupportedEntityTypes).toEqual(['note']);
  });
  it('copies nested reference identity so later mutations cannot rewrite a submitted snapshot', () => {
    const refs = [{ order: 0, ref: { type: 'artifact' as const, artifactId: 'before' } }];
    const intent = retainContinuationIntent(undefined, 'selected_context', 'p:c', () => 'op', refs);
    if (refs[0] !== undefined) refs[0].ref.artifactId = 'after';
    expect(intent.orderedReferences?.[0]?.ref).toEqual({ type: 'artifact', artifactId: 'before' });
  });

});
