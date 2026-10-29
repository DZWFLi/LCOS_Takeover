import { toast } from '@/components/Common/Toast';
import useCanvasStore from '@/store/canvasStore';

import { canvasExternalUrl, saveProjectUrl, singleHttpUrl } from './projectUrlImport';
import { createLcosCoreSession } from '../app/lcosCoreClient';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { waitForProjectedEntity } from '../navigation/waitForProjectedEntity';
import { useLcosShellStore } from '../shell/lcosShellStore';

/** Synchronous capture for both DataTransfer and asynchronous clipboard text
 * fallback. A claimed URL never falls through to a second native web node. */
export function receiveCanvasUrlText(projectId: string, text: string, position: { x: number; y: number }): boolean {
  const url = singleHttpUrl(text);
  if (!url) return false;
  const shell = useLcosShellStore.getState(); const canvasId = useCanvasStore.getState().canvasId;
  const workspaceId = shell.activeWorkspaceId;
  if (shell.projectId !== projectId || !canvasId || !workspaceId) {
    toast('当前现场尚未就绪，链接还没有保存。', { tone: 'danger' });
    return true;
  }
  const current = () => useLcosShellStore.getState().projectId === projectId && useCanvasStore.getState().canvasId === canvasId
    && useLcosShellStore.getState().activeWorkspaceId === workspaceId;
  void (async () => {
    const result = await saveProjectUrl(createLcosCoreSession(), { projectId, canvasId, workspaceId, url, position }, { isCurrent: current });
    if (!current()) return;
    useLcosReferenceStore.getState().requestNodeBindingRefresh();
    if (!result.workspaceMember) {
      toast(`链接已保存，现场显示尚未确认：${result.membershipError ?? '成员读取失败。'}`, { tone: 'danger' });
      return;
    }
    const nodeId = await waitForProjectedEntity({ projectId, canvasId, entityType: 'artifact', entityId: result.saved.artifactId,
      artifactViewId: result.saved.viewId });
    if (!current()) return;
    if (nodeId) useLcosShellStore.getState().requestLocate({ reqId: `url-import-${crypto.randomUUID()}`,
      surface: useLcosShellStore.getState().activeSurface, canvasId, nodeId, status: 'projected', preserveSelection: true });
    toast(nodeId ? '链接已保存；需要时可打开原网页。' : '链接已保存，正在同步画布显示。');
  })().catch(error => {
    if (current()) toast(error instanceof Error ? error.message : '链接尚未保存，请保留原地址。', { tone: 'danger' });
  });
  return true;
}

export function receiveCanvasUrlDrop(projectId: string, transfer: DataTransfer, position: { x: number; y: number }): boolean {
  const url = canvasExternalUrl(transfer);
  return url ? receiveCanvasUrlText(projectId, url, position) : false;
}
