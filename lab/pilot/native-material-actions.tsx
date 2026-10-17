import { useState } from 'react';
import type { JSX } from 'react';

import type { ConnectedConversationV1 } from '../../lcos/packages/contracts/src/receiver.ts';
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.ts';
import type { AssemblyApplyItemResultV1, AssemblyApplyResultV1 } from '../../lcos/packages/contracts/src/assembly.ts';
import { reviewAssemblyApply, assemblySourceKey } from '../../lcos/huabu/apps/web/src/lcos/professional/assemblyApplyReview.ts';
import { useCollaborationSessionStore, readCollaborationEntry } from '../../lcos/huabu/apps/web/src/lcos/collaboration/collaborationSessionStore.ts';
import useCanvasStore from './native-canvas-port.ts';
import type { NativeCanvasSnapshot } from './native-canvas-port.ts';
import { createNativeContextReferencePort } from './native-context-reference.ts';
import type { NativeContextReferenceNodeV1, NativeContextReferencePreviewV1 } from './native-context-reference.ts';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import { LcosButton } from '../../lcos/huabu/apps/web/src/lcos/ui/primitives/LcosButton.tsx';

export interface NativeMaterialContextActionProps {
  readonly projectId: string;
  readonly canvasId?: string;
  readonly conversation: ConnectedConversationV1;
}

type Notice =
  | { readonly status: 'idle' }
  | { readonly status: 'working'; readonly phase: 'checking' | 'applying' | 'refreshing' }
  | { readonly status: 'rejected' | 'error'; readonly message: string; readonly code?: string; readonly httpStatus?: number }
  | {
    readonly status: 'receipt';
    readonly result: AssemblyApplyResultV1;
    readonly confirmedItems: readonly AssemblyApplyItemResultV1[];
    readonly unconfirmedViewIds: readonly string[];
    readonly labelsByViewId: ReadonlyMap<string, string>;
    readonly projection: ConversationProjectionReadback;
  };

interface ConversationProjectionReadback {
  readonly status: 'confirmed' | 'partial' | 'unavailable';
  readonly expectedViewCount: number;
  readonly matchedViewCount: number;
  readonly message: string;
}

type SelectedCanvasRead =
  | { readonly status: 'ready'; readonly nodes: readonly NativeContextReferenceNodeV1[]; readonly labelsByViewId: ReadonlyMap<string, string> }
  | { readonly status: 'unavailable'; readonly message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function readSelectedCanvasNodes(canvas: NativeCanvasSnapshot): SelectedCanvasRead {
  const ids = canvas.selectedNodeIds;
  if (ids.length === 0) return { status: 'unavailable', message: '先在原画布选中已有 Core 引用的文本或图片。' };
  if (new Set(ids).size !== ids.length) {
    return { status: 'unavailable', message: '当前原画布选区含重复节点身份；请重新点选。' };
  }

  const byId = new Map<string, typeof canvas.nodes[number]>();
  for (const node of canvas.nodes) {
    if (byId.has(node.id)) return { status: 'unavailable', message: 'Huabu 当前节点快照含重复 ID，未提交。' };
    byId.set(node.id, node);
  }

  const selected: NativeContextReferenceNodeV1[] = [];
  const labelsByViewId = new Map<string, string>();
  for (const id of ids) {
    const node = byId.get(id);
    if (!node) return { status: 'unavailable', message: `选中的节点 ${id} 已从当前 Canvas 快照消失；未提交。` };
    const data = node.data;
    selected.push({ nodeId: node.id, type: typeof node.type === 'string' ? node.type : '',
      data: { lcos_ref: data?.lcos_ref } });
    const reference = isRecord(data?.lcos_ref) ? data.lcos_ref : undefined;
    const rawLabel = data?.title ?? data?.label;
    const label = typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim() : `画布节点 ${node.id}`;
    if (reference && nonEmpty(reference.artifactViewId)) labelsByViewId.set(reference.artifactViewId, label);
  }
  return { status: 'ready', nodes: selected, labelsByViewId };
}

function currentCanvasIdentity(canvas: NativeCanvasSnapshot, expectedCanvasId: string | undefined,
  expectedProjectId: string, conversation: ConnectedConversationV1): string | undefined {
  const shellProjectId = useLcosShellStore.getState().projectId;
  const referenceProjectId = useLcosReferenceStore.getState().projectId;
  const nodeLabProjectId = typeof window === 'undefined' ? undefined : window.__LCOS_NODE_LAB__?.projectId;
  const nodeLab = typeof window === 'undefined' ? undefined : window.__LCOS_NODE_LAB__;
  const nodeLabCanvasId = nonEmpty(nodeLab?.currentCanvasId) ? nodeLab?.currentCanvasId : nodeLab?.canvasId;

  if (canvas.status !== 'ready' || canvas.canvasId === null) return '原 Huabu Canvas 尚未提供可读的当前现场。';
  if (!expectedCanvasId || canvas.canvasId !== expectedCanvasId || nodeLabCanvasId !== expectedCanvasId) {
    return '当前 Canvas 身份刚刚变化；请确认选区后重试。';
  }
  if (conversation.projectId !== expectedProjectId || shellProjectId !== expectedProjectId
    || referenceProjectId !== expectedProjectId
    || (nonEmpty(nodeLabProjectId) && nodeLabProjectId !== expectedProjectId)) {
    return '目标会话、原画布与 Core 项目身份不一致；未提交。';
  }
  return undefined;
}

function coreHttpForCurrentOrigin(): HttpClient {
  if (typeof window === 'undefined') throw new Error('当前环境没有浏览器 Core 代理。');
  // The existing local runtime exposes only this same-origin loopback facade prefix.
  // The port independently rejects non-loopback origins and unknown base paths.
  return new HttpClient({ baseUrl: `${window.location.origin}/api/lcos/core` });
}

function receiptLabel(item: AssemblyApplyItemResultV1): string {
  if (item.status === 'applied') return `已应用 · ${item.channel}`;
  if (item.status === 'skipped' && item.channel === 'already-member') return '已在目标中 · 未新增';
  if (item.status === 'skipped' && item.channel === 'unsupported') return 'Core 未支持';
  if (item.status === 'failed') return `失败 · ${item.channel}`;
  return `未添加 · ${item.channel}`;
}

function resultSummary(confirmed: readonly AssemblyApplyItemResultV1[], unconfirmedCount: number): string {
  const applied = confirmed.filter((item) => item.status === 'applied').length;
  const already = confirmed.filter((item) => item.status === 'skipped' && item.channel === 'already-member').length;
  const failed = confirmed.filter((item) => item.status === 'failed').length;
  const unsupported = confirmed.filter((item) => item.channel === 'unsupported').length;
  const skipped = confirmed.filter((item) => item.status === 'skipped' && item.channel !== 'already-member'
    && item.channel !== 'unsupported').length;
  const parts = [
    applied ? `${applied} 项新增` : undefined,
    already ? `${already} 项已在目标中` : undefined,
    failed ? `${failed} 项失败` : undefined,
    unsupported ? `${unsupported} 项不支持` : undefined,
    skipped ? `${skipped} 项跳过` : undefined,
    unconfirmedCount ? `${unconfirmedCount} 项回执未确认` : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? 'Core 未返回可确认的逐项回执。' : parts.join(' · ');
}

async function readConversationProjection(
  projectId: string,
  conversationId: string,
  expectedViewIds: readonly string[],
): Promise<ConversationProjectionReadback> {
  const store = useCollaborationSessionStore.getState();
  store.watch(projectId, conversationId);
  try {
    await useCollaborationSessionStore.getState().refresh(projectId, conversationId);
    const entry = readCollaborationEntry(useCollaborationSessionStore.getState().entries, projectId, conversationId);
    if (entry?.status !== 'ready' || entry.projection?.projectId !== projectId
      || entry.projection?.conversationId !== conversationId) {
      return { status: 'unavailable', expectedViewCount: expectedViewIds.length, matchedViewCount: 0,
        message: 'Assembly 回执已保留，但原 Collaboration Session 投影暂未确认；请从会话窗口重新读取。' };
    }
    const boundViews = new Set((entry.projection.relation.boundContext ?? []).flatMap(({ entityRef }) =>
      entityRef.type === 'artifact' && nonEmpty(entityRef.viewId) ? [entityRef.viewId] : []));
    const matchedViewCount = expectedViewIds.filter((id) => boundViews.has(id)).length;
    if (matchedViewCount === expectedViewIds.length) {
      return { status: 'confirmed', expectedViewCount: expectedViewIds.length, matchedViewCount,
        message: expectedViewIds.length === 0 ? 'Core 投影已读取；本次没有新增或既有成员可确认。'
          : `原 Glyth Collaboration 投影已读回 ${matchedViewCount}/${expectedViewIds.length} 项精确 ArtifactView 引用。` };
    }
    return { status: 'partial', expectedViewCount: expectedViewIds.length, matchedViewCount,
      message: `已读回原 Glyth 投影，但精确引用只确认 ${matchedViewCount}/${expectedViewIds.length} 项；以逐项 Core 回执为准。` };
  } catch (error: unknown) {
    return { status: 'unavailable', expectedViewCount: expectedViewIds.length, matchedViewCount: 0,
      message: error instanceof Error ? `Core 投影重读失败：${error.message}` : 'Core 投影重读失败。' };
  } finally {
    useCollaborationSessionStore.getState().unwatch(projectId, conversationId);
  }
}

function itemTitle(item: AssemblyApplyItemResultV1, labelsByViewId: ReadonlyMap<string, string>): string {
  return item.sourceRef.kind === 'artifactView'
    ? labelsByViewId.get(item.sourceRef.id) ?? `ArtifactView ${item.sourceRef.id}`
    : `${item.sourceRef.kind} ${item.sourceRef.id}`;
}

export function NativeMaterialContextAction({ projectId, canvasId, conversation }: NativeMaterialContextActionProps): JSX.Element {
  const canvas = useCanvasStore((state) => state);
  const [notice, setNotice] = useState<Notice>({ status: 'idle' });
  const selected = readSelectedCanvasNodes(canvas);
  const identityError = currentCanvasIdentity(canvas, canvasId, projectId, conversation);
  const buttonDisabled = notice.status === 'working' || identityError !== undefined || selected.status !== 'ready';
  const selectionLabel = selected.status === 'ready'
    ? `当前选区 ${selected.nodes.length} 项 · 原画布实时快照`
    : selected.message;

  const applyCurrentSelection = async (): Promise<void> => {
    const liveCanvas = useCanvasStore.getState();
    const liveIdentityError = currentCanvasIdentity(liveCanvas, canvasId, projectId, conversation);
    if (liveIdentityError) { setNotice({ status: 'rejected', message: liveIdentityError }); return; }
    const liveSelection = readSelectedCanvasNodes(liveCanvas);
    if (liveSelection.status !== 'ready') { setNotice({ status: 'rejected', message: liveSelection.message }); return; }

    const target = { kind: 'conversation' as const, id: conversation.id, projectId };
    const port = createNativeContextReferencePort({ http: coreHttpForCurrentOrigin(), projectId });
    setNotice({ status: 'working', phase: 'checking' });
    let preview: NativeContextReferencePreviewV1;
    try {
      preview = await port.preview({ projectId, selectedNodes: liveSelection.nodes, target });
    } catch (error: unknown) {
      setNotice({ status: 'error', message: error instanceof Error ? error.message : 'Core 预览失败。' });
      return;
    }
    if (preview.status !== 'ready') {
      setNotice({ status: preview.status, message: preview.message,
        ...('code' in preview ? { code: preview.code } : {}),
        ...('httpStatus' in preview && preview.httpStatus !== undefined ? { httpStatus: preview.httpStatus } : {}) });
      return;
    }

    setNotice({ status: 'working', phase: 'applying' });
    let rawResult: AssemblyApplyResultV1;
    try {
      // Explicit click is the only write boundary. The returned Core receipt is not synthesized.
      rawResult = await port.apply(preview);
    } catch (error: unknown) {
      setNotice({ status: 'error', message: error instanceof Error
        ? `未收到 Assembly 回执；写入结果未知，请先重读会话上下文再决定是否重试。${error.message}`
        : '未收到 Assembly 回执；写入结果未知，请先重读会话上下文再决定是否重试。' });
      return;
    }

    const reviewed = reviewAssemblyApply(preview.request, rawResult);
    const unknownKeys = new Set(reviewed.unknownKeys);
    const confirmedItems = reviewed.result.results.filter((item) => !unknownKeys.has(assemblySourceKey(item.sourceRef)));
    const expectedViewIds = confirmedItems.flatMap((item) => item.sourceRef.kind === 'artifactView'
      && (item.status === 'applied' || (item.status === 'skipped' && item.channel === 'already-member'))
      ? [item.sourceRef.id] : []);
    setNotice({ status: 'working', phase: 'refreshing' });
    const projection = await readConversationProjection(projectId, conversation.id, expectedViewIds);
    setNotice({ status: 'receipt', result: reviewed.result, confirmedItems,
      unconfirmedViewIds: reviewed.unknownKeys.length === 0 ? [] : preview.request.sourceRefs
        .filter((ref) => reviewed.unknownKeys.includes(assemblySourceKey(ref)) && ref.kind === 'artifactView')
        .map((ref) => ref.id), labelsByViewId: liveSelection.labelsByViewId, projection });
  };

  const workingLabel = notice.status === 'working'
    ? notice.phase === 'checking' ? '正在核对选区和 Core 身份…'
      : notice.phase === 'applying' ? '正在提交到 Core…' : '正在重读原 Glyth 会话投影…'
    : undefined;

  return (
    <div data-lcos-native-context-action={conversation.id} style={{ minWidth: 190, maxWidth: 260 }}>
      <div style={{ display: 'grid', gap: 5, justifyItems: 'end' }}>
        <span style={{ fontSize: 10, lineHeight: 1.3, opacity: 0.68, textAlign: 'right' }}>{selectionLabel}</span>
        <LcosButton appearance="custom" variant="secondary" size="sm" className="nodrag"
          disabled={buttonDisabled}
          aria-label={`把当前选区添加为 ${conversation.label} 的上下文`}
          onClick={() => { void applyCurrentSelection(); }}>
          添加选区上下文
        </LcosButton>
      </div>
      {identityError && <p role="status" style={{ margin: '5px 0 0', fontSize: 10, textAlign: 'right', opacity: 0.72 }}>{identityError}</p>}
      {workingLabel && <p role="status" style={{ margin: '6px 0 0', fontSize: 10, textAlign: 'right' }}>{workingLabel}</p>}
      {(notice.status === 'rejected' || notice.status === 'error') && (
        <p role="alert" data-context-action-error={notice.code ?? undefined}
          style={{ margin: '6px 0 0', maxWidth: 300, fontSize: 10, textAlign: 'right', color: 'var(--lcos-color-danger, #a62929)' }}>
          {notice.message}{notice.httpStatus === undefined ? '' : `（HTTP ${notice.httpStatus}）`}
        </p>
      )}
      {notice.status === 'receipt' && (
        <div role="status" data-context-action-receipt data-context-all-applied={notice.result.allApplied ? 'true' : 'false'}
          style={{ margin: '7px 0 0', maxWidth: 360, fontSize: 10, textAlign: 'right' }}>
          <strong>{resultSummary(notice.confirmedItems, notice.unconfirmedViewIds.length)}</strong>
          <ul style={{ display: 'grid', gap: 3, margin: '5px 0 0', padding: 0, listStyle: 'none' }}>
            {notice.confirmedItems.map((item) => (
              <li key={`${item.sourceRef.kind}:${item.sourceRef.id}`} title={item.sourceRef.id}>
                {itemTitle(item, notice.labelsByViewId)}：{receiptLabel(item)}
                {item.message ? ` · ${item.message}` : ''}
                {item.changeSetId ? ` · ChangeSet ${item.changeSetId}` : ''}
              </li>
            ))}
            {notice.unconfirmedViewIds.map((viewId) => (
              <li key={`unconfirmed:${viewId}`} title={viewId}>ArtifactView {viewId}：Core 回执未确认</li>
            ))}
          </ul>
          <span style={{ display: 'block', marginTop: 5, opacity: 0.78 }}>{notice.projection.message}</span>
        </div>
      )}
    </div>
  );
}
