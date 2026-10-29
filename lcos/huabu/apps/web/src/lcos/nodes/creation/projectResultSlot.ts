import useCanvasStore from '@/store/canvasStore';

import { createLcosCoreSession } from '../../app/lcosCoreClient';
import { useLcosReferenceStore } from '../../lcosReferenceState';
import { waitForProjectedEntity } from '../../navigation/waitForProjectedEntity';
import { useLcosShellStore } from '../../shell/lcosShellStore';
import { restoreNodePresentationPath } from '../nodePresentationVisibility';

/** Resolves the actual Workspace/Scope before producing a canonical blank slot.
 * UI selects only the real reconciled occurrence, never a locally invented node. */
export async function createProjectResultSlot(input: { readonly projectId: string; readonly canvasId: string;
  readonly workspaceId: string; readonly position: { x: number; y: number } }): Promise<{ readonly nodeId: string | null }> {
  const current = () => useCanvasStore.getState().canvasId === input.canvasId
    && useLcosShellStore.getState().projectId === input.projectId
    && useLcosShellStore.getState().activeWorkspaceId === input.workspaceId;
  if (!current()) throw new Error('结果位创建现场已变化。');
  const session = createLcosCoreSession();
  const scenes = await session.projects.getWorkspaces(input.projectId);
  const workspace = scenes.find((item) => String(item.id) === input.workspaceId && item.canvasId === input.canvasId);
  if (!workspace || !current()) throw new Error('当前工作现场身份未确认。');
  const slot = await session.assembly.createResultSlot(input.projectId, {scopeId:String(workspace.scopeId),workspaceId:input.workspaceId,
    x:input.position.x,y:input.position.y,width:220,height:128});
  if (slot.projectId !== input.projectId || String(slot.scopeId) !== String(workspace.scopeId)) throw new Error('结果位回执身份未确认。');
  if (useLcosReferenceStore.getState().projectId === input.projectId) useLcosReferenceStore.getState().requestNodeBindingRefresh();
  if (!current()) return {nodeId:null};
  const nodeId = await waitForProjectedEntity({...input,entityType:'result-slot',entityId:slot.id});
  if (nodeId && current()) {restoreNodePresentationPath(useCanvasStore.getState(),nodeId);useCanvasStore.getState().selectNodes([nodeId]);return {nodeId};}
  return {nodeId:null};
}
