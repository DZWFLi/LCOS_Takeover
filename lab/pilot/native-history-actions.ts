import { useMemo, useRef, useState } from 'react';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import useCanvasStore from './native-canvas-port';
import { placeNativeLibraryMaterial } from './native-material-placement-client';
import { resolveNativeMaterialVersion } from './native-material-viewer-read';
import { nativeMaterialViewerAvailable, requestNativeMaterialView } from './native-material-viewer-port';
import type { NativeHistoryReference } from './native-history-projection';

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
export function readNativeHistoryReference(value: unknown): NativeHistoryReference {
  const row = value as { id?: unknown; lcos_history?: Partial<NativeHistoryReference> } | undefined, ref = row?.lcos_history;
  if (!ref || ref.version !== 1 || ![ref.projectId, ref.artifactId, ref.revisionId, ref.fileRecordId, ref.title].every(nonEmpty)
    || row?.id !== ref.revisionId || typeof ref.readable !== 'boolean' || typeof ref.placeable !== 'boolean'
    || typeof ref.archived !== 'boolean' || typeof ref.status !== 'string' || typeof ref.mimeType !== 'string')
    throw new Error('这条历史记录的准确版本尚未确认，请重新读取。');
  return ref as NativeHistoryReference;
}
export function LCOSOpenNativeHistoryVersion(value: unknown, notify?: (message: string) => void): boolean {
  try {
    const ref = readNativeHistoryReference(value);
    if (!ref.readable) throw new Error(ref.unavailableReason ?? '这个版本的原文件暂不可读。');
    if (useLcosShellStore.getState().projectId !== ref.projectId || !nativeMaterialViewerAvailable())
      throw new Error('原阅读入口尚未就绪，历史记录保留。');
    requestNativeMaterialView({ projectId: ref.projectId, artifactId: ref.artifactId, revisionId: ref.revisionId, title: ref.title });
    return true;
  } catch (error) { notify?.(error instanceof Error ? error.message : '阅读暂未打开，原记录保留。'); return false; }
}
// Only an uncertain user action is retained, not material/Canvas truth. Both the
// sidebar and original expanded view reuse this transient recovery state.
const pendingPlacements = new Set<string>();
export const nativeHistoryPlacementKey = (ref: NativeHistoryReference, canvasId: string, workspaceId: string) =>
  JSON.stringify([ref.projectId, canvasId, workspaceId, ref.artifactId, ref.revisionId, ref.fileRecordId]);
type Place = typeof placeNativeLibraryMaterial;
export async function applyNativeHistoryItems(items: readonly unknown[], owner: {
  projectId: string; canvasId: string; workspaceId: string; api: Parameters<Place>[1]['api']; isCurrent(): boolean;
  place?: Place; uncertain?: Set<string>;
}): Promise<{ complete: boolean; confirmed: number; message: string }> {
  const refs = items.map(readNativeHistoryReference), uncertain = owner.uncertain ?? pendingPlacements;
  if (!refs.length) return { complete: false, confirmed: 0, message: '先选择已有版本。' };
  if (new Set(refs.map(ref => ref.revisionId)).size !== refs.length)
    return { complete: false, confirmed: 0, message: '选择中有重复版本，请重新点选。' };
  let confirmed = 0;
  for (const ref of refs) {
    if (!owner.isCurrent() || ref.projectId !== owner.projectId)
      return { complete: false, confirmed, message: '当前现场已变化，保留已确认的放置，未投放到其他画布。' };
    if (!ref.placeable || !ref.readable || ref.archived || ref.status === 'draft')
      return { complete: false, confirmed, message: ref.unavailableReason ?? '此版本的画布投放尚未接入；记录与原材料保留。' };
    const key = nativeHistoryPlacementKey(ref, owner.canvasId, owner.workspaceId);
    const result = await (owner.place ?? placeNativeLibraryMaterial)({ projectId: ref.projectId, canvasId: owner.canvasId,
      workspaceId: owner.workspaceId, artifactId: ref.artifactId, revisionId: ref.revisionId, fileRecordId: ref.fileRecordId, title: ref.title },
    { api: owner.api, isCurrent: owner.isCurrent, readOnly: uncertain.has(key) });
    if (result.status === 'unconfirmed') {
      uncertain.add(key);
      return { complete: false, confirmed, message: `${confirmed ? `已确认 ${confirmed} 项。` : ''}${result.message} 再点只核对原放置结果。` };
    }
    if (result.status === 'rejected') return { complete: false, confirmed, message: `${confirmed ? `已确认 ${confirmed} 项。` : ''}${result.message}` };
    uncertain.delete(key); confirmed += 1;
  }
  return { complete: true, confirmed, message: `已在当前画布确认 ${confirmed} 个准确版本。` };
}

/** Used by the shipped aE/l9 action owners. No replacement panel or local
 * factory is created; original selection/close callbacks remain in l9. */
export function LCOSUseNativeHistoryActions({ canvasId, notify }: { canvasId?: string; notify?: (message: string) => void } = {}) {
  const session = useMemo(() => createLcosCoreSession(), []), working = useRef(false);
  const [isDownloading, setDownloading] = useState(false);
  const owner = () => {
    const canvas = useCanvasStore.getState(), shell = useLcosShellStore.getState();
    const projectId = shell.projectId, workspaceId = shell.activeWorkspaceId;
    if (!projectId || !workspaceId || !canvasId || canvas.status !== 'ready' || canvas.canvasId !== canvasId || !canvas.rfInstance)
      throw new Error('当前画布尚未就绪，历史记录保留。');
    const api = canvas.rfInstance;
    return { projectId, canvasId, workspaceId, api, isCurrent: () => {
      const live = useCanvasStore.getState(), current = useLcosShellStore.getState();
      return live.status === 'ready' && live.canvasId === canvasId && live.rfInstance === api
        && current.projectId === projectId && current.activeWorkspaceId === workspaceId;
    } };
  };
  const applyHistoryAssets = async (items: readonly unknown[]) => {
    if (working.current) return { complete: false, confirmed: 0, message: '正在核对这次放置。' };
    working.current = true;
    try { const result = await applyNativeHistoryItems(items, owner()); notify?.(result.message); return result; }
    catch (error) { const message = error instanceof Error ? error.message : '放置尚未确认，历史记录保留。'; notify?.(message);
      return { complete: false, confirmed: 0, message }; }
    finally { working.current = false; }
  };
  const downloadHistoryAssets = async (items: readonly unknown[]) => {
    if (working.current) return { success: false };
    working.current = true; setDownloading(true); let count = 0;
    try {
      const current = owner();
      for (const item of items) {
        const ref = readNativeHistoryReference(item);
        if (!current.isCurrent() || ref.projectId !== current.projectId) throw new Error('现场已切换，没有下载其他项目的文件。');
        const [detail, revisions, graph] = await Promise.all([session.artifacts.getArtifactDetail(ref.artifactId),
          session.artifacts.listArtifactRevisions(ref.artifactId), session.projects.getProjectGraph(ref.projectId)]);
        if (!current.isCurrent()) throw new Error('现场已切换，本次下载已停止。');
        const version = resolveNativeMaterialVersion({ projectId: ref.projectId, artifactId: ref.artifactId, revisionId: ref.revisionId }, detail, revisions, graph);
        if (version.fileRecordId !== ref.fileRecordId) throw new Error('这条历史记录的原文件身份已变化，请重新读取。');
        const bytes = await session.artifacts.getFileRecordContent(ref.projectId, ref.fileRecordId);
        if (!current.isCurrent()) throw new Error('现场已切换，本次下载已停止。');
        if (bytes.type.split(';')[0]?.toLowerCase() !== version.mimeType.split(';')[0]?.toLowerCase()) throw new Error('原文件格式尚未确认，没有改下载当前版本。');
        const url = URL.createObjectURL(bytes), link = document.createElement('a');
        link.href = url; link.download = version.title; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000); count += 1;
      }
      notify?.(`已请求下载 ${count} 个准确版本。`); return { success: true };
    } catch (error) { notify?.(`${count ? `已请求 ${count} 项。` : ''}${error instanceof Error ? error.message : '下载尚未确认，原记录保留。'}`); return { success: false }; }
    finally { working.current = false; setDownloading(false); }
  };
  return { applyHistoryAssets, downloadHistoryAssets, isDownloading };
}
