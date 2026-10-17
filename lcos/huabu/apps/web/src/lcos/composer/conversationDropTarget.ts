import type { DropCollaborationReferenceIntent, DropTargetRegistration } from '../drop/dropTypes';
import type { LcosComposerTarget } from '../shell/lcosShellStore';

interface CanvasGeometry {
  screenToFlowPosition(point: { x: number; y: number }): { x: number; y: number };
  getZoom(): number;
}

/** Anchor to the actual accepting surface, including Railway, instead of synthetic (0,0). */
export function conversationDropTarget(
  intent: DropCollaborationReferenceIntent,
  target: DropTargetRegistration | undefined,
  geometry: CanvasGeometry | null,
  workspaceId: string | null,
): LcosComposerTarget | undefined {
  const rect = target?.readRect ? target.readRect() : target?.rect;
  if (!rect || !geometry) return undefined;
  const point = geometry.screenToFlowPosition({ x: rect.left, y: rect.top });
  const zoom = Math.max(geometry.getZoom(), 0.01);
  return {
    nodeId: target?.targetId.startsWith('glyth:')
      ? target.targetId.slice('glyth:'.length) : 'conversation:' + intent.conversationId,
    title: target?.label ?? '会话引用',
    anchor: { ...point, width: rect.width / zoom, height: rect.height / zoom },
    ...(workspaceId === null ? {} : { workspaceId }),
    receiverConversationId: intent.conversationId,
  };
}
