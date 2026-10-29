import { describe, expect, it } from 'vitest';

import {
  buildComposerContinuationInput,
  buildComposerRunInput,
  canSubmitComposerContinuation,
  canSubmitComposerTarget,
} from './composerSubmission';

const target = (receiverConversationId?: string) => ({
  nodeId: 'conversation-work-view',
  title: '会话',
  anchor: { x: 0, y: 0, width: 0, height: 0 },
  ...(receiverConversationId === undefined ? {} : { receiverConversationId }),
});

describe('shared Composer receiver mapping', () => {
  it('foreground image is context, not an automatically picked explicit reference', () => {
    const selected = { ...target(), targetReferences: [{ entityType: 'artifact', entityId: 'image-a', mimeType: 'image/png' }] };
    const payload = buildComposerRunInput({ projectId: 'project-1', workspaceId: 'workspace-1', instruction: '看当前材料', target: selected, refs: [] });
    expect(payload.contextArtifactIds).toEqual(['image-a']);
    expect(payload.orderedReferences).toEqual([]);
    expect(payload.targetArtifactId).toBeUndefined();
    expect(canSubmitComposerTarget(selected, '看当前材料', 'workspace-1')).toBe(true);
    expect(() => buildComposerRunInput({ projectId: 'project-1', workspaceId: 'workspace-1', instruction: '看当前材料', target: selected,
      refs: [{ entityType: 'artifact', entityId: 'other-image', mimeType: 'image/png' }] })).toThrow('图片、PDF');
  });
  it('uses an existing empty result slot as output without pretending it is a reference', () => {
    const payload = buildComposerRunInput({ projectId: 'project-1', workspaceId: 'workspace-1', instruction: '生成结果', target: { ...target(), resultSlotId: 'slot-a' }, refs: [] });
    expect(payload.resultSlotId).toBe('slot-a'); expect(payload.outputIntent).toBe('create');
    expect(payload.orderedReferences).toEqual([]);
  });
  it('never replaces a selected historical binary version with current context', () => {
    const selected = { ...target(), targetReferences: [{ entityType: 'artifact', entityId: 'image-a', mimeType: 'image/png', revisionId: 'old',
      descriptor: { entityType: 'artifact', entityId: 'image-a', currentRevisionId: 'now', presentedRevisionId: 'old' } }] };
    expect(canSubmitComposerTarget(selected, '看这个版本', 'workspace-1')).toBe(false);
    expect(() => buildComposerRunInput({ projectId: 'project-1', workspaceId: 'workspace-1', instruction: '看这个版本', target: selected, refs: [] })).toThrow('未改用最新版');
    const current = { ...selected, targetReferences: [{ ...selected.targetReferences[0]!, revisionId: 'now' }] };
    expect(buildComposerRunInput({ projectId: 'project-1', workspaceId: 'workspace-1', instruction: '看当前材料', target: current, refs: [] }).contextArtifactIds).toEqual(['image-a']);
  });
  it('inline Work View session A creates a Run addressed to receiver A', () => {
    const payload = buildComposerRunInput({
      projectId: 'project-1',
      instruction: '继续整理',
      workspaceId: 'workspace-1',
      target: target('connected-A'),
      refs: [],
    });

    expect(payload.receiverRef).toEqual({ connectedConversationId: 'connected-A' });
  });

  it('does not allow send before the receiver is confirmed', () => {
    const blocked = { ...target(), receiverBlockedReason: 'receiver pending' };
    expect(canSubmitComposerTarget(blocked, '继续整理', 'workspace-1')).toBe(false);
  });

  it('switching from A to B never carries receiver A into the B payload', () => {
    const payload = buildComposerRunInput({
      projectId: 'project-1',
      instruction: '继续整理',
      workspaceId: 'workspace-1',
      target: target('connected-B'),
      refs: [],
    });

    expect(payload.receiverRef).toEqual({ connectedConversationId: 'connected-B' });
    expect(JSON.stringify(payload)).not.toContain('connected-A');
  });

  it('continuation uses operation/message identity and does not require a workspace', () => {
    const continuationTarget = {
      ...target('connected-A'),
      intent: 'continue' as const,
      continuationOperationId: 'operation-A',
      messageId: 'message-A',
    };
    expect(canSubmitComposerContinuation(continuationTarget, '继续', [])).toBe(true);
    expect(buildComposerContinuationInput({
      conversationId: 'connected-A',
      continuationOperationId: 'operation-A',
      messageId: 'message-A',
      text: ' 继续 ',
      refs: [],
    })).toEqual({
      conversationId: 'connected-A',
      continuationOperationId: 'operation-A',
      messageId: 'message-A',
      text: '继续',
    });
  });

  it('continuation carries supported draft references as typed orderedReferences', () => {
    const continuationTarget = {
      ...target('connected-A'),
      intent: 'continue' as const,
      continuationOperationId: 'operation-A',
      messageId: 'message-A',
    };
    const refs = [{ entityType: 'artifact', entityId: 'a-1' }];
    expect(canSubmitComposerContinuation(continuationTarget, '继续', refs)).toBe(true);
    expect(buildComposerContinuationInput({
      conversationId: 'connected-A',
      continuationOperationId: 'operation-A',
      messageId: 'message-A',
      text: '继续',
      refs,
    }).orderedReferences).toEqual([{ order: 0, ref: { type: 'artifact', artifactId: 'a-1' } }]);
  });

  it('continuation blocks references without an authoritative typed mapping', () => {
    const continuationTarget = {
      ...target('connected-A'),
      intent: 'continue' as const,
      continuationOperationId: 'operation-A',
      messageId: 'message-A',
    };
    expect(canSubmitComposerContinuation(continuationTarget, '继续', [{ entityType: 'note', entityId: 'n-1' }])).toBe(false);
  });
});
