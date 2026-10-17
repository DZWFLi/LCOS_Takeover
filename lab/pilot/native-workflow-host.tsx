import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { overlayLayers } from '@local-creative-os/web-gen2';

import { CoreProjectClient } from '../../lcos/apps/web-gen2/src/backend/projects.ts';
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.ts';
import type { Workspace } from '../../lcos/packages/domain/src/index.ts';
import { WorkflowCardPool } from '../../lcos/huabu/apps/web/src/lcos/surfaces/workflow/WorkflowCardPool.tsx';
import { WorkflowHandView } from '../../lcos/huabu/apps/web/src/lcos/ui/workflow/WorkflowHandView.tsx';
import { LcosSurfaceFeedback } from '../../lcos/huabu/apps/web/src/lcos/ui/LcosSurfaceFeedback.tsx';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import { useCanvasAttentionStore } from '../../lcos/huabu/apps/web/src/store/canvasAttentionStore.ts';
import { useCloseOnEscape } from '../../lcos/huabu/apps/web/src/hooks/useCloseOnEscape.ts';
import useCanvasStore from './native-canvas-port.ts';
import { readNativeSavedContextWorkspaces } from './native-saved-context-workspaces.ts';
import { useLcosDropStore } from '../../lcos/huabu/apps/web/src/lcos/lcosDropState.ts';
import './native-workflow-host.css';

type NativeWorkflowSurface = 'main' | 'context' | 'workflow';

export interface NativeWorkflowHandProps {
  readonly projectId: string;
  readonly canvasId: string;
  /** Keep the host mounted while false so WorkflowHandView can complete its original exit presence. */
  readonly open: boolean;
  readonly onClose: () => void;
}

type WorkflowHostModel =
  | { readonly status: 'waiting'; readonly message: string }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | {
    readonly status: 'ready';
    readonly workspaces: readonly Workspace[];
    readonly current: Workspace;
    readonly sourceSurface: NativeWorkflowSurface;
  };

function currentCanvasId(host: NonNullable<Window['__LCOS_NODE_LAB__']>): string | undefined {
  const value = typeof host.currentCanvasId === 'string' && host.currentCanvasId.trim()
    ? host.currentCanvasId : host.canvasId;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function assertCurrentWorkflowOwner(projectId: string, canvasId: string, api: object): void {
  const canvas = useCanvasStore.getState();
  const host = typeof window === 'undefined' ? undefined : window.__LCOS_NODE_LAB__;
  if (canvas.status !== 'ready' || canvas.canvasId !== canvasId || canvas.rfInstance !== api
    || host?.api !== api || !host || currentCanvasId(host) !== canvasId
    || typeof host.projectId === 'string' && host.projectId !== projectId
    || useLcosReferenceStore.getState().projectId !== projectId
    || useLcosShellStore.getState().projectId !== projectId) {
    throw new Error('项目、原 Canvas 或 ReactFlow API 已切换；请重新打开 Workflow。');
  }
}

function isWorkflowSurface(value: unknown): value is NativeWorkflowSurface {
  return value === 'main' || value === 'context' || value === 'workflow';
}

/**
 * Native Workflow Hand leaf. It reuses the original card pool, task cards,
 * method readers, and Composer draft owner; it never mounts a Workflow Canvas.
 */
export function NativeWorkflowHand({ projectId, canvasId, open, onClose }: NativeWorkflowHandProps): JSX.Element | null {
  const canvas = useCanvasStore((state) => state);
  const navigate = useNavigate();
  const shellProjectId = useLcosShellStore((state) => state.projectId);
  const shellWorkspaceId = useLcosShellStore((state) => state.activeWorkspaceId);
  const shellSurface = useLcosShellStore((state) => state.activeSurface);
  const referenceProjectId = useLcosReferenceStore((state) => state.projectId);
  const nativeAssemblyDropActive = useLcosDropStore((drop) => {
    const state = drop.state;
    const pending = state.status === 'tracking' || state.status === 'dwell' || state.status === 'preview';
    return pending && 'payload' in state && state.payload.kind === 'assembly';
  });
  const [model, setModel] = useState<WorkflowHostModel>({ status: 'waiting', message: '等待原 TapNow Canvas 与 Core 工作现场映射。' });
  const [readKey, setReadKey] = useState(0);
  const [navigationMessage, setNavigationMessage] = useState<string | null>(null);

  useCloseOnEscape(open && !nativeAssemblyDropActive, onClose);
  useEffect(() => {
    if (open) useCanvasAttentionStore.getState().setCanvasEngaged(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (shellProjectId !== projectId || referenceProjectId !== projectId) {
      setModel({ status: 'waiting', message: '等待原 LCOS Shell 与 Reference Store 映射到当前 Core 项目。' });
      return;
    }
    if (canvas.status !== 'ready' || canvas.canvasId !== canvasId || !canvas.rfInstance) {
      setModel({ status: 'waiting', message: '当前原 TapNow Canvas 尚未就绪或已切换。' });
      return;
    }

    const controller = new AbortController();
    const api = canvas.rfInstance;
    let active = true;
    setModel({ status: 'loading' });
    setNavigationMessage(null);

    void (async () => {
      try {
        assertCurrentWorkflowOwner(projectId, canvasId, api);
        const projects = new CoreProjectClient(new HttpClient({ baseUrl: `${window.location.origin}/api/lcos/core` }));
        const rows = await projects.getWorkspaces(projectId, controller.signal);
        if (!active || controller.signal.aborted) return;
        assertCurrentWorkflowOwner(projectId, canvasId, api);
        if (useCanvasStore.getState().rfInstance !== api) throw new Error('原 Canvas API 已更换；工作流现场读取已作废。');

        const current = readNativeSavedContextWorkspaces(projectId, canvasId, rows);
        const sourceSurface = current.current.preferredSurface;
        if (!isWorkflowSurface(sourceSurface)) throw new Error('Core 当前 Workspace 没有受支持的真实 Surface 映射。');
        if (String(current.current.id) !== shellWorkspaceId || sourceSurface !== shellSurface) {
          throw new Error('Core Workspace 与当前原 Shell 映射尚未一致；未猜测来源现场。');
        }
        setModel({ status: 'ready', workspaces: current.workspaces, current: current.current, sourceSurface });
      } catch (error: unknown) {
        if (active && !controller.signal.aborted) {
          setModel({ status: 'error', message: error instanceof Error ? error.message : 'Core Workflow 工作现场读取失败。' });
        }
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [open, projectId, canvasId, canvas.status, canvas.canvasId, canvas.rfInstance,
    shellProjectId, shellWorkspaceId, shellSurface, referenceProjectId, readKey]);

  const enterNativeWorkflow = async (targetWorkspace: Workspace): Promise<boolean> => {
    try {
      if (!open || model.status !== 'ready') throw new Error('Workflow 卡池尚未从 Core 就绪。');
      assertCurrentWorkflowOwner(projectId, canvasId, canvas.rfInstance ?? {});
      const exactTargets = model.workspaces.filter((workspace) => String(workspace.id) === String(targetWorkspace.id)
        && workspace.projectId === projectId
        && String(workspace.scopeId) === String(targetWorkspace.scopeId)
        && workspace.canvasId === targetWorkspace.canvasId);
      if (exactTargets.length !== 1 || !targetWorkspace.canvasId) {
        throw new Error('目标不是本次 Core 返回的唯一工作流 Workspace/Canvas；未导航。');
      }
      setNavigationMessage(null);
      // This is the same original-router route used by the native Saved Context leaf.
      navigate(`/canvas/${encodeURIComponent(targetWorkspace.canvasId)}`);
      return true;
    } catch (error: unknown) {
      setNavigationMessage(error instanceof Error ? error.message : '原 Router 导航未确认。');
      return false;
    }
  };

  if (typeof document === 'undefined' || !document.body) return null;
  // Keep the original hand's layout inside the existing work-view layer, above
  // the retained Composer. No new overlay/store or altered drop policy.
  return createPortal(<div data-lcos-native-workflow-host data-source-canvas-id={canvasId} data-open={open ? 'true' : 'false'}
    style={{ position: 'relative', zIndex: overlayLayers.workView }}>
    <WorkflowHandView open={open} onClose={onClose} nativeAssemblyDropActive={nativeAssemblyDropActive} header={<>
      <span>工作流</span>
      <button type="button" aria-label="收回手牌" onClick={onClose} className="lcos-workflow-hand-close">
        <X className="h-[22px] w-[22px]" aria-hidden />
      </button>
    </>}>
      {open && model.status === 'waiting' && <LcosSurfaceFeedback presentation="loading" message={model.message} />}
      {open && model.status === 'loading' && <LcosSurfaceFeedback presentation="loading" message="正在从 Core 读取当前 Workflow 工作现场…" />}
      {open && model.status === 'error' && <LcosSurfaceFeedback presentation="error" message={model.message}
        actionLabel="重新读取" onAction={() => setReadKey((value) => value + 1)} />}
      {open && model.status === 'ready' && <>
        {navigationMessage && <div data-lcos-native-workflow-navigation-feedback role="alert">
          <LcosSurfaceFeedback presentation="error" message={navigationMessage} />
        </div>}
        <WorkflowCardPool projectId={projectId} workspaces={model.workspaces} sourceSurface={model.sourceSurface}
          sourceWasChild={false} onLeaveHand={onClose} onNativeEnter={enterNativeWorkflow} />
      </>}
    </WorkflowHandView>
  </div>, document.body);
}
