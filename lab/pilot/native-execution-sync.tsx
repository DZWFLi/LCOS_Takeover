import { useEffect, useMemo, useRef, useState, type JSX } from 'react';

import { HostLifecycleReconciler } from '../../lcos/apps/web-gen2/src/host/lifecycleReconciler.ts';
import { useCollaborationSessionStore } from '../../lcos/huabu/apps/web/src/lcos/collaboration/collaborationSessionStore.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import useCanvasStore, { type NativeCanvasSnapshot } from './native-canvas-port.ts';
import { useNativeDropNotice } from './native-library-drop-feedback';
import { createNativeExecutionSyncFeedbackController } from './native-execution-sync-feedback';

export interface NativeExecutionProjectionTarget {
  readonly projectId: string;
  readonly canvasId: string;
  readonly workspaceId: string;
}

export interface NativeExecutionProjectionSyncState {
  readonly status: 'ready' | 'syncing' | 'blocked' | 'unavailable';
  readonly message: string;
}

/** The controller keeps its diagnostic message. User-facing feedback describes
 * the task update and retained content, never a transport or projection detail. */
export function nativeExecutionSyncPresentation(state: NativeExecutionProjectionSyncState): {
  readonly message: string;
  readonly retryLabel: string;
} {
  const message = state.status === 'ready' ? '画布中的任务已更新。'
    : state.status === 'syncing' ? '正在更新画布中的任务…'
      : '画布中的任务暂时无法更新，已有内容保留。';
  return { message, retryLabel: '重试更新' };
}

export interface NativeExecutionProjectionApi extends NonNullable<NativeCanvasSnapshot['rfInstance']> {
  synchronizeExecutionProjection?(target: NativeExecutionProjectionTarget, options?: {
    readonly isCurrent?: () => boolean;
    readonly retryPendingSave?: boolean;
  }): Promise<{
    readonly ok: boolean;
    readonly reason?: string;
  }>;
}

export interface NativeExecutionProjectionOwner {
  readonly projectId: string;
  readonly canvasId: string;
  readonly workspaceId: string;
  readonly api: NativeExecutionProjectionApi;
}

export type NativeExecutionProjectionOwnerRead =
  | { readonly status: 'ready'; readonly owner: NativeExecutionProjectionOwner }
  | { readonly status: 'blocked' | 'unavailable'; readonly message: string };

export interface NativeExecutionProjectionSyncControllerOptions {
  readonly target: NativeExecutionProjectionTarget;
  readonly readOwner: () => NativeExecutionProjectionOwnerRead;
  readonly watchProjectChanges: (projectId: string, listener: () => void) => () => void;
  readonly onState: (state: NativeExecutionProjectionSyncState) => void;
  /** Test timing only; production uses the canonical reconciler defaults. */
  readonly cooldownMs?: number;
  readonly debounceMs?: number;
}

export interface NativeExecutionProjectionSyncController {
  /** An explicit user retry; no Core mutation or provider action is triggered. */
  retry(): void;
  dispose(): void;
}

export function sameNativeExecutionProjectionOwner(
  expected: NativeExecutionProjectionOwner,
  current: NativeExecutionProjectionOwner | undefined,
): boolean {
  return current !== undefined
    && expected.projectId === current.projectId
    && expected.canvasId === current.canvasId
    && expected.workspaceId === current.workspaceId
    && expected.api === current.api;
}

/**
 * Small lifecycle adapter around the original HostLifecycleReconciler.
 * Tests inject only an API-shaped fake and a project-change subscription; this
 * controller does not own Canvas state or perform a second projection itself.
 */
export function createNativeExecutionProjectionSyncController(
  options: NativeExecutionProjectionSyncControllerOptions,
): NativeExecutionProjectionSyncController {
  const { target, readOwner, watchProjectChanges, onState } = options;
  let active = true;
  let capturedOwner: NativeExecutionProjectionOwner | undefined;
  let reconciler: HostLifecycleReconciler | undefined;
  let unwatch = (): void => {};
  let retryPendingSaveNext = false;
  const publish = (state: NativeExecutionProjectionSyncState): void => {
    if (active) onState(state);
  };

  const createReconciler = (owner: NativeExecutionProjectionOwner): HostLifecycleReconciler => new HostLifecycleReconciler({
    runOnce: async () => {
      if (!active) return { degraded: false };
      const retryPendingSave = retryPendingSaveNext;
      retryPendingSaveNext = false;
      const before = readOwner();
      if (before.status !== 'ready') {
        publish({ status: before.status, message: before.message });
        return { degraded: false };
      }
      if (!sameNativeExecutionProjectionOwner(owner, before.owner)) {
        publish({ status: 'blocked', message: '原 Canvas/API/Workspace 已变化；本轮同步未触碰旧宿主。' });
        return { degraded: false };
      }

      const synchronize = owner.api.synchronizeExecutionProjection;
      if (typeof synchronize !== 'function') {
        publish({ status: 'unavailable', message: '当前原 Canvas API 未提供 Execution Projection 同步入口。' });
        return { degraded: false };
      }

      publish({ status: 'syncing', message: '正在通过当前原 Canvas 同步 Core 执行投影…' });
      let receipt: Awaited<ReturnType<NonNullable<NativeExecutionProjectionApi['synchronizeExecutionProjection']>>>;
      try {
        receipt = await synchronize.call(owner.api, target, { isCurrent: () => {
          const current = readOwner();
          return active && current.status === 'ready' && sameNativeExecutionProjectionOwner(owner, current.owner);
        }, ...(retryPendingSave ? { retryPendingSave: true } : {}) });
      } catch (error: unknown) {
        if (!active) return { degraded: false };
        const current = readOwner();
        if (current.status !== 'ready' || !sameNativeExecutionProjectionOwner(owner, current.owner)) {
          publish({ status: 'blocked', message: '同步期间原 Canvas/API/Workspace 已变化；旧结果未显示到新现场。' });
        } else {
          publish({ status: 'blocked', message: error instanceof Error
            ? `Core 执行投影同步失败：${error.message}` : 'Core 执行投影同步失败。' });
        }
        return { degraded: false };
      }

      if (!active) return { degraded: false };
      const after = readOwner();
      if (after.status !== 'ready' || !sameNativeExecutionProjectionOwner(owner, after.owner)) {
        publish({ status: 'blocked', message: '同步已返回，但原 Canvas/API/Workspace 已变化；旧结果未沿用到新现场。' });
        return { degraded: false };
      }
      if (receipt === null || typeof receipt !== 'object' || typeof receipt.ok !== 'boolean') {
        publish({ status: 'blocked', message: '原 Canvas 同步入口没有返回可确认的执行投影回执。' });
        return { degraded: false };
      }
      if (!receipt.ok) {
        publish({ status: 'blocked', message: typeof receipt.reason === 'string' && receipt.reason.trim()
          ? receipt.reason : '原 Canvas 未确认 Core 执行投影同步。' });
        return { degraded: false };
      }

      publish({ status: 'ready', message: '当前 Canvas 的 Core 执行投影已同步。' });
      return { degraded: false };
    },
  }, target.projectId, { cooldownMs: options.cooldownMs, debounceMs: options.debounceMs });

  const attachOwner = (owner: NativeExecutionProjectionOwner, runOnProjectOpen = true): void => {
    capturedOwner = owner;
    const currentReconciler = createReconciler(owner);
    reconciler = currentReconciler;
    unwatch = watchProjectChanges(target.projectId, () => currentReconciler.onMutationSuccess());
    if (runOnProjectOpen) currentReconciler.onProjectOpen();
  };

  const releaseOwner = (): void => {
    unwatch();
    unwatch = () => {};
    reconciler?.dispose();
    reconciler = undefined;
    capturedOwner = undefined;
  };

  const initial = readOwner();
  if (initial.status === 'ready') attachOwner(initial.owner);
  else publish({ status: initial.status, message: initial.message });

  return {
    retry: () => {
      if (!active) return;
      const current = readOwner();
      if (current.status !== 'ready') {
        publish({ status: current.status, message: current.message });
        return;
      }
      if (reconciler !== undefined && capturedOwner !== undefined
        && sameNativeExecutionProjectionOwner(capturedOwner, current.owner)) {
        retryPendingSaveNext = true;
        reconciler.onMutationSuccess();
        return;
      }
      releaseOwner();
      attachOwner(current.owner, false);
      retryPendingSaveNext = true;
      reconciler?.onMutationSuccess();
    },
    dispose: () => {
      if (!active) return;
      active = false;
      releaseOwner();
    },
  };
}

function currentCanvasId(host: Window['__LCOS_NODE_LAB__']): string | undefined {
  const value = typeof host?.currentCanvasId === 'string' && host.currentCanvasId.trim()
    ? host.currentCanvasId : host?.canvasId;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readCurrentOwner(target: NativeExecutionProjectionTarget, workspaceSurface?: 'main'|'context'|'workflow'): NativeExecutionProjectionOwnerRead {
  if (typeof window === 'undefined') {
    return { status: 'unavailable', message: '当前环境没有原 TapNow Canvas。' };
  }
  const canvas = useCanvasStore.getState();
  const host = window.__LCOS_NODE_LAB__;
  const api = canvas.rfInstance as NativeExecutionProjectionApi | null;
  if (canvas.status !== 'ready' || canvas.canvasId === null || api === null) {
    return { status: 'unavailable', message: '等待原 TapNow Canvas/API 就绪。' };
  }
  if (canvas.canvasId !== target.canvasId || host?.api !== api || currentCanvasId(host) !== target.canvasId) {
    return { status: 'blocked', message: '当前原 Canvas 与目标现场不一致；未同步旧现场。' };
  }
  if (typeof host.projectId === 'string' && host.projectId !== target.projectId) {
    return { status: 'blocked', message: '当前原 Canvas 项目与目标 Core 项目不一致。' };
  }

  const shell = useLcosShellStore.getState();
  if (shell.projectId === null || shell.activeWorkspaceId === null
    || shell.surfaceCanvasId[shell.activeSurface] === undefined) {
    return { status: 'unavailable', message: '等待 Core Surface/Workspace 映射到当前原 Canvas。' };
  }
  if (shell.projectId !== target.projectId || shell.activeWorkspaceId !== target.workspaceId
    || (workspaceSurface ? shell.activeSurface !== workspaceSurface : shell.surfaceCanvasId[shell.activeSurface] !== target.canvasId)) {
    return { status: 'blocked', message: '当前现场与任务来源不一致，未同步旧内容。' };
  }
  return { status: 'ready', owner: {
    projectId: target.projectId,
    canvasId: target.canvasId,
    workspaceId: target.workspaceId,
    api,
  } };
}

export interface NativeExecutionSyncProps extends NativeExecutionProjectionTarget {
  readonly enabled: boolean;
  /** Supplied only by the host's exact current Core Workspace read. A child
   * scene shares a Surface kind, not the root Surface's canvas identity. */
  readonly workspaceSurface?: 'main'|'context'|'workflow';
}

export function NativeExecutionSync({ projectId, canvasId, workspaceId, enabled, workspaceSurface }: NativeExecutionSyncProps): JSX.Element {
  const controllerRef = useRef<NativeExecutionProjectionSyncController | null>(null);
  const notice = useNativeDropNotice();
  const canvas = useCanvasStore((state) => state);
  const shellProjectId = useLcosShellStore((state) => state.projectId);
  const activeSurface = useLcosShellStore((state) => state.activeSurface);
  const activeWorkspaceId = useLcosShellStore((state) => state.activeWorkspaceId);
  const activeSurfaceCanvasId = useLcosShellStore((state) => state.surfaceCanvasId[state.activeSurface] ?? null);
  const owner = useMemo(() => ({ enabled, projectId, canvasId, workspaceId, workspaceSurface, notice,
    canvasStatus: canvas.status, actualCanvasId: canvas.canvasId, api: canvas.rfInstance,
    shellProjectId, activeSurface, activeWorkspaceId, activeSurfaceCanvasId }),
  [enabled, projectId, canvasId, workspaceId, workspaceSurface, notice, canvas.status, canvas.canvasId, canvas.rfInstance,
    shellProjectId, activeSurface, activeWorkspaceId, activeSurfaceCanvasId]);
  const latestOwner = useRef<typeof owner | null>(owner);
  latestOwner.current = owner;
  const [syncState, setSyncState] = useState<NativeExecutionProjectionSyncState>({
    status: 'unavailable', message: '等待原 TapNow Canvas/API 与 Core Workspace 映射就绪。',
  });

  useEffect(() => {
    // React may replay setup after cleanup without rendering in between.
    if (latestOwner.current === null) latestOwner.current = owner;
    if (!enabled) {
      setSyncState({ status: 'unavailable', message: '执行投影同步当前未启用。' });
      controllerRef.current = null;
      return;
    }
    let active = true;
    const isCurrent = () => {
      const currentCanvas = useCanvasStore.getState(), shell = useLcosShellStore.getState();
      const host = typeof window === 'undefined' ? undefined : window.__LCOS_NODE_LAB__;
      const hostMatches = owner.canvasStatus !== 'ready' || owner.api === null
        || host?.api === owner.api && currentCanvasId(host) === owner.actualCanvasId
          && (typeof host.projectId !== 'string' || host.projectId === owner.shellProjectId);
      return active && latestOwner.current === owner && currentCanvas.status === owner.canvasStatus
        && currentCanvas.canvasId === owner.actualCanvasId && currentCanvas.rfInstance === owner.api
        && shell.projectId === owner.shellProjectId && shell.activeSurface === owner.activeSurface
        && shell.activeWorkspaceId === owner.activeWorkspaceId
        && (shell.surfaceCanvasId[shell.activeSurface] ?? null) === owner.activeSurfaceCanvasId && hostMatches;
    };
    let controller: NativeExecutionProjectionSyncController | undefined;
    const feedback = notice ? createNativeExecutionSyncFeedbackController(notice, { isCurrent,
      retry: () => { if (isCurrent()) controller?.retry(); } }) : null;
    controller = createNativeExecutionProjectionSyncController({
      target: { projectId, canvasId, workspaceId },
      readOwner: () => readCurrentOwner({ projectId, canvasId, workspaceId },workspaceSurface),
      watchProjectChanges: (watchedProjectId, listener) =>
        useCollaborationSessionStore.getState().watchProjectChanges(watchedProjectId, listener),
      onState: state => {
        if (!isCurrent()) { feedback?.invalidate(); return; }
        setSyncState(state); feedback?.update(state);
      },
    });
    controllerRef.current = controller;
    const invalidate = () => { if (!isCurrent()) feedback?.invalidate(); };
    const releaseCanvas = useCanvasStore.subscribe(invalidate);
    const releaseShell = useLcosShellStore.subscribe(invalidate);
    return () => {
      active = false;
      if (latestOwner.current === owner) latestOwner.current = null;
      releaseCanvas(); releaseShell(); feedback?.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
      controller?.dispose();
    };
  }, [owner]);

  const showFeedback = enabled && (syncState.status === 'blocked' || syncState.status === 'unavailable');
  const presentation = nativeExecutionSyncPresentation(syncState);
  return (
    <>
      <span hidden role="status" aria-live="polite" data-lcos-native-execution-sync-state={syncState.status}>
        {presentation.message}
      </span>
      {!notice && showFeedback && <div role="alert" data-lcos-native-execution-sync-feedback={syncState.status}
        className="nodrag nopan"
        style={{ position: 'absolute', left: 20, top: 86, zIndex: 20, maxWidth: 460,
          padding: '10px 12px', borderRadius: 10, background: 'var(--popover)',
          border: '1px solid var(--border)', fontSize: 12, lineHeight: 1.5,
          color: 'var(--foreground)', pointerEvents: 'auto' }}>
        <span>{presentation.message}</span>{' '}
        {syncState.status === 'blocked' && <button type="button" className="nodrag lcos-btn lcos-btn--secondary lcos-btn--sm"
          data-lcos-native-execution-sync-retry aria-label={presentation.retryLabel}
          onClick={() => controllerRef.current?.retry()}>{presentation.retryLabel}</button>}
      </div>}
    </>
  );
}
