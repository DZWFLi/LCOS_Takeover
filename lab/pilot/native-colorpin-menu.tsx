import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNativeColorPins } from './native-colorpin-port';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { downloadNativeColorPinGroup, nativeColorPinDownloadRef, type NativeColorPinDownloadResult } from './native-colorpin-download';
import { nativeManagedPinNode } from './native-colorpin-model';

type Model = ReturnType<typeof useNativeColorPins>;
type Group = Model['groups'][number];
type Scene = Pick<Model, 'projectId' | 'canvasId' | 'api' | 'enabled' | 'isCurrent'>;
type Node = { id: string; type?: string; data?: Record<string, unknown> };
export type NativeColorPinRenameCapture = { projectId: string; canvasId: string; api: object; groupId: string; color: string;
  definitionId: string | null; expectedUpdatedAt?: string; expectedLabel: string | null };
const nodeApi = (model: Scene): { getNodes(): readonly Node[] } | undefined =>
  typeof (model.api as { getNodes?: unknown } | null)?.getNodes === 'function' ? model.api as { getNodes(): readonly Node[] } : undefined;

/** UI admission only. Canonical Pin state remains in the one shared provider. */
function currentScene(scene: Scene): boolean {
  if (!scene.enabled || !scene.projectId || !scene.canvasId || !scene.api || !scene.isCurrent()) return false;
  const host = typeof window !== 'undefined' ? window.__LCOS_NODE_LAB__ : undefined;
  return !!host && host.projectId === scene.projectId && host.api === scene.api
    && (host.currentCanvasId ?? host.canvasId) === scene.canvasId;
}
export function captureNativeColorPinRename(model: Model, group: Group): NativeColorPinRenameCapture | undefined {
  if (!currentScene(model) || model.status !== 'ready' || model.busy || model.needsCheck || !group?.groupId) return;
  return { projectId: model.projectId!, canvasId: model.canvasId!, api: model.api!, groupId: group.groupId, color: group.color,
    definitionId: group.definitionId ?? null, ...(group.updatedAt ? { expectedUpdatedAt: group.updatedAt } : {}), expectedLabel: group.label ?? null };
}
function renameCaptureCurrent(model: Model, captured?: NativeColorPinRenameCapture | null): captured is NativeColorPinRenameCapture {
  return !!captured && currentScene(model) && captured.projectId === model.projectId && captured.canvasId === model.canvasId && captured.api === model.api;
}

export function useNativeColorPinBar() {
  const model = useNativeColorPins();
  return { enabled: model.enabled || model.needsCheck || model.groups.length > 0, busy: model.busy, status: model.status };
}

/** Same original u7 view props; no vendor CanvasConfig request or alias store. */
export function useNativeColorPinNames(canvasId: string) {
  const model = useNativeColorPins();
  const names = useMemo(() => Object.fromEntries(model.groups
    .filter(group => !!group.label).map(group => [group.groupId, group.label!])), [model.groups]);
  const savingGroupIds = useMemo(() => model.busy ? new Set(model.groups.map(group => group.groupId)) : new Set<string>(),
    [model.busy, model.groups]);
  const renameGroup = useCallback(async (groupId: string, label: string, observed?: NativeColorPinRenameCapture) => {
    const group = model.groups.find(row => row.groupId === groupId);
    const captured = observed ?? (group ? captureNativeColorPinRename(model, group) : undefined);
    if (!group || !renameCaptureCurrent(model, captured) || captured.groupId !== groupId || captured.color !== group.color
      || model.canvasId !== canvasId || model.busy || model.needsCheck) return false;
    try {
      const result = captured.definitionId === null
        ? await model.createDefinition({ color: captured.color, label: label.trim(), expectedDefinitionId: null })
        : captured.expectedUpdatedAt ? await model.renameDefinition({ definitionId: captured.definitionId, label: label.trim(),
          expectedUpdatedAt: captured.expectedUpdatedAt, expectedLabel: captured.expectedLabel }) : undefined;
      return result?.status === 'confirmed' && renameCaptureCurrent(model, captured);
    } catch { return false; }
  }, [model, canvasId]);
  return { names, canRename: currentScene(model) && model.canvasId === canvasId
    && model.status === 'ready' && !model.busy && !model.needsCheck, savingGroupIds, renameGroup };
}

/** Original m7 confirmation copy states the actual relationship scope. */
export function nativeColorPinClearDescription(group: Pick<Group, 'count' | 'sharedMembershipCount' | 'surfaceMembershipCount'>,
  displayName: string): string {
  const statements = [`移除当前画布中“${displayName}”的标记（${group.count} 个节点）。节点、内容和颜色组都会保留。`];
  if (group.sharedMembershipCount > 0) statements.push(`其中 ${group.sharedMembershipCount} 个是对象共享标记，移除也会影响这些对象在其他位置的标记。`);
  if (group.surfaceMembershipCount > 0) statements.push(`其中 ${group.surfaceMembershipCount} 个属于现场标记，移除会影响对应现场的共享标记。`);
  return statements.join('');
}

export function useNativeColorPinMenuActions() {
  const model = useNativeColorPins();
  const [message, setMessage] = useState('');
  useEffect(() => { setMessage(''); }, [model.projectId, model.canvasId, model.api]);
  const removeAllNodesFromGroup = useCallback(async (group: Group) => {
    if (!group || !Array.isArray(group.membershipIds) || !currentScene(model)
      || model.busy || model.needsCheck) return false;
    try {
      const result = await model.clearGroup(group);
      if (currentScene(model)) setMessage(result.message ?? '');
      return result.status === 'confirmed';
    } catch { return false; }
  }, [model]);
  return { removeAllNodesFromGroup, message, busy: model.busy, needsCheck: model.needsCheck, status: model.status,
    captureRename: useCallback((group: Group) => captureNativeColorPinRename(model, group), [model]),
    isRenameCurrent: useCallback((captured: NativeColorPinRenameCapture) => renameCaptureCurrent(model, captured), [model]),
    verifyPending: model.verifyPending, refresh: model.refresh };
}

const identity = (node: unknown): string | undefined => {
  if (!node || typeof node !== 'object') return undefined;
  const value = node as { id?: unknown; type?: unknown; data?: Record<string, unknown> };
  if (typeof value.id !== 'string' || !value.data) return undefined;
  return JSON.stringify({ id: value.id, type: value.type, ref: value.data.lcos_ref,
    collection: value.data.lcos_collection_ref, conversation: value.data.lcos_conversation_ref,
    execution: value.data.lcos_execution_ref, run: value.data.lcos_run_ref, member: value.data.lcos_member_ref,
    result: value.data.lcos_result_ref, file: value.data.lcos_file_ref, nativeId: value.data.id,
    ordinary: typeof value.data.lcos_gui_navigation_pin === 'boolean' });
};

/** Guard the original p7 highlight/fitView, using the current original API.
 * Coordinates are never read from the older Core scope/view resolver. */
export function useNativeColorPinLocate(nodeIds: readonly string[], group?: Group) {
  const model = useNativeColorPins();
  const [message, setMessage] = useState('');
  const nodes = nodeApi(model)?.getNodes() ?? [];
  const proofs = new Map(nodeIds.map(id => [id, identity(nodes.find(node => node.id === id))]));
  const canLocate = useCallback((nodeId: string, colorKey?: string) => {
    if (!group?.definitionId && !group?.rawNodeIds) return true;
    const live = nodeApi(model)?.getNodes().find(node => node.id === nodeId);
    const currentGroup = model.groups.find(row => row.groupId === group.groupId);
    const accepted = currentScene(model) && model.status === 'ready' && !!proofs.get(nodeId)
      && identity(live) === proofs.get(nodeId) && currentGroup?.nodeIds.includes(nodeId)
      && (!colorKey || currentGroup.groupId === colorKey);
    setMessage(accepted ? '' : '标记或位置已变化，请重新读取；没有操作其他画布。');
    return !!accepted;
  }, [model, group, proofs]);
  return { canLocate, message };
}

/** A small status row inside the original menu, never a new popover/window. */
export function NativeColorPinMenuStatus({ extraMessage }: { extraMessage?: string }) {
  const model = useNativeColorPins();
  const primary = model.message || (model.busy ? '正在保存标记…'
    : model.needsCheck ? '操作结果待确认，请核对标记；不会重复提交。' : '');
  const message = [primary, extraMessage].filter((value, index, rows) => !!value && rows.indexOf(value) === index).join(' ');
  return message ? <div role="status" aria-live="polite" className="max-w-72 px-2 py-1.5 text-xs leading-5 text-muted-foreground"
    data-native-colorpin-menu-status>{message}</div> : null;
}

/** Matches the original iw download view props, using only exact Core files. */
type OriginalDownloads = { canDownloadNodes(ids: readonly string[]): boolean;
  downloadNodes(ids: readonly string[]): Promise<{ success: boolean; downloadableNodeCount: number; task?: { file_count: number }; message?: string }>;
  isDownloading?: boolean };
export function useNativeColorPinDownloads(original?: OriginalDownloads) {
  const model = useNativeColorPins(), latest = useRef(model); latest.current = model;
  const session = useMemo(() => createLcosCoreSession(), []);
  const [isDownloading, setDownloading] = useState(false), [message, setMessage] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => { setDownloading(false); setMessage('');
    return () => { pending.current?.abort(); pending.current = null; };
  }, [model.projectId, model.canvasId, model.api]);
  const canDownloadNodes = useCallback((ids: readonly string[]) => {
    const api = nodeApi(model);
    const raw = ids.filter(id => { const node = api?.getNodes().find(node => node.id === id); return !!node && !nativeManagedPinNode(node); });
    return currentScene(model) && !pending.current && !!api && (ids.some(id =>
      !!nativeColorPinDownloadRef(api.getNodes().find(node => node.id === id))) || !!raw.length && !!original?.canDownloadNodes(raw));
  }, [model, original]);
  const downloadNodes = useCallback(async (ids: readonly string[]): Promise<NativeColorPinDownloadResult> => {
    const api = nodeApi(model), group = model.groups.find(row => row.nodeIds.length === ids.length && row.nodeIds.every(id => ids.includes(id)));
    if (!api || !group || pending.current || !currentScene(model) || !model.projectId)
      return { success: false, downloadableNodeCount: 0, message: '本组材料或现场尚未确认，没有下载其他文件。' };
    const controller = new AbortController(); pending.current = controller; setDownloading(true); setMessage('正在读取本组准确版本…');
    try {
      const isCurrent = () => {
          const now = latest.current;
          return now.projectId === model.projectId && now.canvasId === model.canvasId && now.api === model.api && currentScene(now)
            && !!now.groups.find(row => row.groupId === group.groupId && row.nodeIds.length === group.nodeIds.length
              && row.nodeIds.every(id => group.nodeIds.includes(id)) && row.membershipIds.length === group.membershipIds.length
              && row.membershipIds.every(id => group.membershipIds.includes(id)));
      };
      const raw = ids.filter(id => { const node = api.getNodes().find(node => node.id === id); return !!node && !nativeManagedPinNode(node); });
      const exact = ids.filter(id => !raw.includes(id));
      const results: NativeColorPinDownloadResult[] = [];
      if (exact.some(id => !!nativeColorPinDownloadRef(api.getNodes().find(node => node.id === id))))
        results.push(await downloadNativeColorPinGroup({ projectId: model.projectId, api, nodeIds: exact,
          label: group.label || group.color, signal: controller.signal, isCurrent }, { session }));
      if (raw.length && original?.canDownloadNodes(raw) && isCurrent() && !controller.signal.aborted) {
        const value = await original.downloadNodes(raw);
        results.push({ ...value, message: value.message || (value.success ? '原画布文件已交给原下载流程。' : '部分画布文件暂时无法下载，请重试。') });
      }
      const count = results.reduce((n, result) => n + result.downloadableNodeCount, 0), files = results.reduce((n, result) => n + (result.task?.file_count ?? 0), 0);
      const result: NativeColorPinDownloadResult = { success: !!results.length && results.every(result => result.success),
        downloadableNodeCount: count, ...(files ? { task: { file_count: files } } : {}),
        message: results.map(result => result.message).join(' ') || '本组没有可下载的原文件。' };
      if (!controller.signal.aborted && latest.current.api === model.api) setMessage(result.message);
      return result;
    } finally { if (pending.current === controller) { pending.current = null; setDownloading(false); } }
  }, [model, session, original]);
  return { canDownloadNodes, downloadNodes, isDownloading: isDownloading || !!original?.isDownloading, message };
}
