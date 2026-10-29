import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { RefreshCw } from 'lucide-react';
import type { JSX } from 'react';
import type { RunReview } from '@local-creative-os/contracts';
import { executionStatusLabel } from '@local-creative-os/web-gen2';

import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import useCanvasStore from './native-canvas-port.ts';
import type { NativeTaskListViewProps } from './native-chat-view';

export interface NativeRunListProps {
  readonly projectId: string;
  readonly canvasId: string;
  readonly onOpen: (runId: string) => void;
  readonly View: ComponentType<NativeTaskListViewProps>;
}

interface NativeRunListOwner {
  readonly projectId: string;
  readonly canvasId: string;
  readonly api: NonNullable<ReturnType<typeof useCanvasStore.getState>['rfInstance']>;
}

type NativeRunListState =
  | { readonly status: 'waiting'; readonly message: string }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly owner: NativeRunListOwner; readonly reviews: readonly RunReview[] };

const dispatchStatusLabels: Readonly<Record<string, string>> = {
  planned: '尚未开始',
  dispatching: '正在开始',
  bound: '',
  failed: '暂时无法开始',
  recovery_required: '需要核对',
};

function currentCanvasId(host: NonNullable<Window['__LCOS_NODE_LAB__']>): string | undefined {
  const value = typeof host.currentCanvasId === 'string' && host.currentCanvasId.trim()
    ? host.currentCanvasId : host.canvasId;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function captureCurrentOwner(projectId: string, canvasId: string): NativeRunListOwner | undefined {
  const canvas = useCanvasStore.getState();
  const host = typeof window === 'undefined' ? undefined : window.__LCOS_NODE_LAB__;
  const api = canvas.rfInstance;
  if (canvas.status !== 'ready' || canvas.canvasId !== canvasId || api === null
    || !host || host.api !== api || currentCanvasId(host) !== canvasId
    || typeof host.projectId === 'string' && host.projectId !== projectId
    || useLcosShellStore.getState().projectId !== projectId) return undefined;
  return { projectId, canvasId, api };
}

function sameOwner(left: NativeRunListOwner, right: NativeRunListOwner | undefined): boolean {
  return right !== undefined && left.projectId === right.projectId
    && left.canvasId === right.canvasId && left.api === right.api;
}

function validateRunReviews(value: readonly RunReview[], projectId: string): readonly RunReview[] {
  if (!Array.isArray(value)) throw new Error('Core Run 列表不是有效数组。');
  const runIds = new Set<string>();
  const dispatchIds = new Set<string>();
  for (const review of value) {
    const runId = review?.run?.id;
    const dispatchId = review?.dispatch?.id;
    if (review?.run?.projectId !== projectId || typeof runId !== 'string' || !runId.trim()
      || typeof dispatchId !== 'string' || !dispatchId.trim() || review.dispatch.runId !== runId) {
      throw new Error('Core Run/dispatch 身份与当前项目不匹配；列表已拒绝显示。');
    }
    if (runIds.has(runId) || dispatchIds.has(dispatchId)) {
      throw new Error('Core Run 列表包含重复 Run 或 dispatch 身份；列表已拒绝显示。');
    }
    runIds.add(runId);
    dispatchIds.add(dispatchId);
  }
  return value;
}

function runLabel(review: RunReview): string {
  if (review.run.status === 'created' && review.dispatch.status === 'planned') return '已创建 · 尚未执行';
  const dispatchLabel = dispatchStatusLabels[review.dispatch.status] ?? '状态待核对';
  return [executionStatusLabel(review.run.status), dispatchLabel].filter(Boolean).join(' · ');
}

export function NativeRunList({ projectId, canvasId, onOpen, View }: NativeRunListProps): JSX.Element {
  const coreRuns = useMemo(() => createLcosCoreSession().runs, []);
  const canvas = useCanvasStore((state) => state);
  const shellProjectId = useLcosShellStore((state) => state.projectId);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [model, setModel] = useState<NativeRunListState>({
    status: 'waiting',
    message: '等待原 TapNow Canvas 与 Core 项目映射就绪。',
  });
  const [actionError, setActionError] = useState<string | null>(null);

  const liveOwner = captureCurrentOwner(projectId, canvasId);
  const visibleModel: NativeRunListState = liveOwner === undefined
    ? { status: 'waiting', message: '当前原 Canvas/API/项目已切换；任务列表不会跨现场沿用。' }
    : model.status === 'ready' && !sameOwner(model.owner, liveOwner)
      ? { status: 'waiting', message: '原 Canvas/API 已更换；正在重新读取当前项目任务。' }
      : model;

  const refresh = useCallback(() => {
    setActionError(null);
    setRefreshVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const owner = captureCurrentOwner(projectId, canvasId);
    if (owner === undefined) {
      setModel({ status: 'waiting', message: '等待原 TapNow Canvas 与 Core 项目映射就绪。' });
      return;
    }

    const controller = new AbortController();
    let active = true;
    setModel({ status: 'loading' });
    setActionError(null);
    void coreRuns.listRunReviews(projectId, controller.signal).then((reviews) => {
      if (!active || controller.signal.aborted) return;
      if (!sameOwner(owner, captureCurrentOwner(projectId, canvasId))) {
        setModel({ status: 'waiting', message: '读取期间原 Canvas/API/项目已切换；请重新读取当前现场。' });
        return;
      }
      setModel({ status: 'ready', owner, reviews: validateRunReviews(reviews, projectId) });
    }).catch((error: unknown) => {
      if (!active || controller.signal.aborted) return;
      if (!sameOwner(owner, captureCurrentOwner(projectId, canvasId))) {
        setModel({ status: 'waiting', message: '读取失败时原 Canvas/API/项目已切换；旧列表未保留。' });
        return;
      }
      setModel({ status: 'error', message: error instanceof Error ? error.message : 'Core Run 列表读取失败。' });
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [coreRuns, projectId, canvasId, canvas.status, canvas.canvasId, canvas.rfInstance,
    shellProjectId, refreshVersion]);

  const openRun = (runId: string): void => {
    setActionError(null);
    if (visibleModel.status !== 'ready') {
      setActionError('当前任务列表尚未从 Core 就绪。');
      return;
    }
    const owner = captureCurrentOwner(projectId, canvasId);
    if (!sameOwner(visibleModel.owner, owner)) {
      setActionError('当前原 Canvas/API/项目已切换；没有打开旧现场的任务。');
      setModel({ status: 'waiting', message: '现场已切换，正在重新读取任务列表。' });
      return;
    }
    const exact = visibleModel.reviews.filter((review) => review.run.id === runId
      && review.run.projectId === projectId && review.dispatch.runId === runId);
    if (exact.length !== 1) {
      setActionError('该任务在当前 Core 列表中不是唯一身份；没有打开。');
      return;
    }
    onOpen(runId);
  };

  const reviews = visibleModel.status === 'ready' ? visibleModel.reviews : [];
  return (
    <section data-lcos-native-run-list aria-label="当前项目已有任务" className="flex min-h-0 flex-1 flex-col">
      {actionError && <p role="alert" className="native-chat-notice">当前任务暂时无法打开，请重新读取。</p>}
      <View title="任务" state={visibleModel.status}
        message={visibleModel.status === 'waiting' ? '正在准备任务…' : undefined}
        actions={[{ id: 'refresh', label: '重新读取任务', icon: <RefreshCw size={14} />, disabled: visibleModel.status === 'loading', onSelect: refresh }]}
        items={reviews.map(review => ({ id: review.run.id,
          title: review.run.instruction.trim().split(/\r?\n/, 1)[0] || '未命名任务', secondary: runLabel(review),
          runStatus: review.run.status, dispatchStatus: review.dispatch.status }))} onSelect={openRun} />
    </section>
  );
}
