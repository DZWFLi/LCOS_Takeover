import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNativeColorPins } from './native-colorpin-port';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { downloadNativeColorPinGroup, nativeColorPinDownloadRef, type NativeColorPinDownloadResult } from './native-colorpin-download';

type Model = ReturnType<typeof useNativeColorPins>;
type Group = Model['groups'][number];
type Scene = Pick<Model, 'projectId' | 'canvasId' | 'api' | 'enabled' | 'isCurrent'>;
type Node = { id: string; type?: string; data?: Record<string, unknown> };
const nodeApi = (model: Scene): { getNodes(): readonly Node[] } | undefined =>
  typeof (model.api as { getNodes?: unknown } | null)?.getNodes === 'function' ? model.api as { getNodes(): readonly Node[] } : undefined;

/** UI admission only. Canonical Pin state remains in the one shared provider. */
function currentScene(scene: Scene): boolean {
  if (!scene.enabled || !scene.projectId || !scene.canvasId || !scene.api || !scene.isCurrent()) return false;
  const host = typeof window !== 'undefined' ? window.__LCOS_NODE_LAB__ : undefined;
  return !!host && host.projectId === scene.projectId && host.api === scene.api
    && (host.currentCanvasId ?? host.canvasId) === scene.canvasId;
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
  const renameGroup = useCallback(async (groupId: string, label: string) => {
    const group = model.groups.find(row => row.groupId === groupId);
    if (!group || model.canvasId !== canvasId || !currentScene(model) || model.busy || model.needsCheck) return false;
    try {
      const result = await model.renameDefinition({ definitionId: group.definitionId, label: label.trim(),
        expectedUpdatedAt: group.updatedAt, expectedLabel: group.label ?? null });
      return result.status === 'confirmed';
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
  const removeAllNodesFromGroup = useCallback(async (group: Group) => {
    if (!group?.definitionId || !Array.isArray(group.membershipIds) || !currentScene(model)
      || model.busy || model.needsCheck) return false;
    try {
      const result = await model.clearCurrentGroup(group.definitionId, {
        expectedMembershipIds: [...group.membershipIds], expectedCanvasId: model.canvasId!, expectedApi: model.api!,
      });
      return result.status === 'confirmed';
    } catch { return false; }
  }, [model]);
  return { removeAllNodesFromGroup, busy: model.busy, needsCheck: model.needsCheck, status: model.status,
    verifyPending: model.verifyPending, refresh: model.refresh };
}

const identity = (node: unknown): string | undefined => {
  if (!node || typeof node !== 'object') return undefined;
  const value = node as { id?: unknown; type?: unknown; data?: Record<string, unknown> };
  if (typeof value.id !== 'string' || !value.data) return undefined;
  return JSON.stringify({ id: value.id, type: value.type, ref: value.data.lcos_ref,
    collection: value.data.lcos_collection_ref, conversation: value.data.lcos_conversation_ref,
    execution: value.data.lcos_execution_ref });
};

/** Guard the original p7 highlight/fitView, using the current original API.
 * Coordinates are never read from the older Core scope/view resolver. */
export function useNativeColorPinLocate(nodeIds: readonly string[], group?: Group) {
  const model = useNativeColorPins();
  const [message, setMessage] = useState('');
  const nodes = nodeApi(model)?.getNodes() ?? [];
  const proofs = new Map(nodeIds.map(id => [id, identity(nodes.find(node => node.id === id))]));
  const canLocate = useCallback((nodeId: string, colorKey?: string) => {
    if (!group?.definitionId) return true;
    const live = nodeApi(model)?.getNodes().find(node => node.id === nodeId);
    const currentGroup = model.groups.find(row => row.definitionId === group.definitionId);
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
export function useNativeColorPinDownloads() {
  const model = useNativeColorPins(), latest = useRef(model); latest.current = model;
  const session = useMemo(() => createLcosCoreSession(), []);
  const [isDownloading, setDownloading] = useState(false), [message, setMessage] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => { setDownloading(false); setMessage('');
    return () => { pending.current?.abort(); pending.current = null; };
  }, [model.projectId, model.canvasId, model.api]);
  const canDownloadNodes = useCallback((ids: readonly string[]) => {
    const api = nodeApi(model);
    return currentScene(model) && !pending.current && !!api && ids.some(id =>
      !!nativeColorPinDownloadRef(api.getNodes().find(node => node.id === id)));
  }, [model]);
  const downloadNodes = useCallback(async (ids: readonly string[]): Promise<NativeColorPinDownloadResult> => {
    const api = nodeApi(model), group = model.groups.find(row => row.nodeIds.length === ids.length && row.nodeIds.every(id => ids.includes(id)));
    if (!api || !group || pending.current || !currentScene(model) || !model.projectId)
      return { success: false, downloadableNodeCount: 0, message: '本组材料或现场尚未确认，没有下载其他文件。' };
    const controller = new AbortController(); pending.current = controller; setDownloading(true); setMessage('正在读取本组准确版本…');
    try {
      const result = await downloadNativeColorPinGroup({ projectId: model.projectId, api, nodeIds: [...ids],
        label: group.label || group.color, signal: controller.signal, isCurrent: () => {
          const now = latest.current;
          return now.projectId === model.projectId && now.canvasId === model.canvasId && now.api === model.api && currentScene(now)
            && !!now.groups.find(row => row.definitionId === group.definitionId && row.membershipIds.length === group.membershipIds.length
              && row.membershipIds.every(id => group.membershipIds.includes(id)));
        } }, { session });
      if (!controller.signal.aborted && latest.current.api === model.api) setMessage(result.message);
      return result;
    } finally { if (pending.current === controller) { pending.current = null; setDownloading(false); } }
  }, [model, session]);
  return { canDownloadNodes, downloadNodes, isDownloading, message };
}
