import { describe, expect, it } from 'vitest';

import { assemblyComposerOwnsTarget } from './AssemblyBody';
import { conversationComposerOwnsTarget } from './ConversationWorkViewBody';

describe('Composer presentation ownership', () => {
  it('does not mount an Assembly input when Assembly and its receiver Conversation overlap', () => {
    const target = {
      nodeId: 'assembly:conversation:conversation-a',
      receiverConversationId: 'conversation-a',
    } as const;

    const owners = [
      assemblyComposerOwnsTarget(true, target),
      conversationComposerOwnsTarget(true, target, 'conversation-a'),
    ].filter(Boolean);

    expect(owners).toHaveLength(0); // The original nearfield host remains the input owner.
  });

  it('keeps a normal Conversation intent owned by its Conversation window', () => {
    const target = {
      nodeId: 'conversation:conversation-a',
      receiverConversationId: 'conversation-a',
    } as const;

    expect(assemblyComposerOwnsTarget(true, target)).toBe(false);
    expect(conversationComposerOwnsTarget(true, target, 'conversation-a')).toBe(true);
  });

  it('does not claim a closed or different receiver intent', () => {
    const target = {
      nodeId: 'conversation:conversation-a',
      receiverConversationId: 'conversation-a',
    } as const;

    expect(assemblyComposerOwnsTarget(false, target)).toBe(false);
    expect(conversationComposerOwnsTarget(true, target, 'conversation-b')).toBe(false);
  });
});
