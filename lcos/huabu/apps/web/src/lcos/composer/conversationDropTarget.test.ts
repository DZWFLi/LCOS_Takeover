import { describe, expect, it } from 'vitest';
import { conversationDropTarget } from './conversationDropTarget';
const intent = {
  kind: 'collaboration-reference' as const, targetId: 'glyth:node-two',
  conversationId: 'conversation-two', reference: { entityType: 'note', entityId: 'note-one' },
};
const geometry = { screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x: x / 2, y: y / 2 }), getZoom: () => 2 };
const target = {
  targetId: intent.targetId, kind: 'collaboration-reference' as const, label: '设计会话',
  priority: 20, enabled: true, rect: { left: 400, top: 200, width: 92, height: 92 },
  semantic: { kind: 'collaboration-reference' as const, conversationId: 'conversation-two' },
};
describe('conversation drop anchors', () => {
  it('uses real receiver geometry and current zoom', () => {
    expect(conversationDropTarget(intent, target, geometry, 'workspace-one')).toMatchObject({
      nodeId: 'node-two', receiverConversationId: 'conversation-two', workspaceId: 'workspace-one',
      anchor: { x: 200, y: 100, width: 46, height: 46 },
    });
  });
  it('fails for a receiver that unmounted instead of opening at world origin', () => {
    expect(conversationDropTarget(intent, { ...target, readRect: () => undefined }, geometry, null)).toBeUndefined();
    expect(conversationDropTarget(intent, undefined, geometry, null)).toBeUndefined();
  });
});
