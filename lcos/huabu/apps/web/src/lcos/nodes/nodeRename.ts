import { isEditableTarget } from '@/hooks/shortcuts';
import useCanvasStore from '@/store/canvasStore';

import { createLcosCoreSession } from '../app/lcosCoreClient';
import { useLcosReferenceStore } from '../lcosReferenceState';

export const RENAME_CANVAS_NODE_EVENT = 'lcos:rename-canvas-node';
export function requestCanvasNodeRename(nodeId: string): void {
  window.dispatchEvent(new CustomEvent(RENAME_CANVAS_NODE_EVENT, { detail: { nodeId } }));
}
export function canvasNodeRenameShortcut(event: KeyboardEvent): boolean {
  return event.key === 'F2' && !event.defaultPrevented && !event.repeat && !event.isComposing
    && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditableTarget(event.target);
}

export async function renameCanvasNode(nodeId: string, title: string): Promise<void> {
  const canvas = useCanvasStore.getState();
  const refs = useLcosReferenceStore.getState();
  const node = canvas.nodes.find((item) => item.id === nodeId);
  const ref = refs.nodeEntityRefs.get(nodeId);
  const next = title.trim();
  if (!node || !next) throw new Error('对象已不存在或名称为空。');
  if (node.data.lcosProjectTextCreating || node.data.lcosProjectTextCreateError) throw new Error('原文本创建尚未确认，先核对创建。');
  if (!ref && refs.bindingCanvasId === canvas.canvasId && !refs.bindingIdentitiesReady) throw new Error('对象身份正在读取，稍后再改名。');
  if (!ref) {
    if (!await canvas.tryRename('node', nodeId, next)) throw new Error('原生节点改名尚未确认。');
    return;
  }
  const entity = ref.entityType;
  if (entity !== 'artifact' && entity !== 'workspace' && entity !== 'scope') throw new Error('该对象没有通用标题写入接口，请使用它自己的管理入口。');
  const result = await createLcosCoreSession().artifacts.renameEntity(entity, ref.entityId, next);
  if (result.id !== ref.entityId || result.entity !== entity || result.title !== next || result.mode !== 'manual') throw new Error('标题改名回执未确认。');
  const live = useLcosReferenceStore.getState();
  const current = live.nodeEntityRefs.get(nodeId);
  if (live.projectId !== refs.projectId || useCanvasStore.getState().canvasId !== canvas.canvasId
    || current?.entityType !== entity || current.entityId !== ref.entityId) return;
  if (current.descriptor) live.registerNodeEntity(nodeId, { ...current, descriptor: { ...current.descriptor, title: result.title } });
  live.requestNodeBindingRefresh();
}
