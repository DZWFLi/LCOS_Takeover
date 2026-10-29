import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';

import { CoreProjectClient } from '../../lcos/apps/web-gen2/src/backend/projects.ts';
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.ts';
import type { WarehouseItemV1 } from '../../lcos/packages/contracts/src/assembly.ts';
import type { Workspace } from '../../lcos/packages/domain/src/index.ts';
import { ContextAtlasStage } from '../../lcos/huabu/apps/web/src/lcos/surfaces/context/ContextAtlasStage.tsx';
import { ContextAtlasView } from '../../lcos/huabu/apps/web/src/lcos/ui/context/ContextAtlasView.tsx';
import { LcosSurfaceFeedback } from '../../lcos/huabu/apps/web/src/lcos/ui/LcosSurfaceFeedback.tsx';
import { LcosButton } from '../../lcos/huabu/apps/web/src/lcos/ui/primitives/LcosButton.tsx';
import { workspaceTargetsForItem } from '../../lcos/huabu/apps/web/src/lcos/navigation/workspaceTargets.ts';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import useCanvasStore from './native-canvas-port.ts';
import { readNativeSavedContextWorkspaces } from './native-saved-context-workspaces.ts';
import './native-saved-context-host.css';

interface NativeSavedContextAtlasProps {
  readonly projectId: string;
  readonly canvasId: string;
  readonly onClose: () => void;
}

type AtlasModel =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly workspaces: readonly Workspace[]; readonly current: Workspace };

function assertCurrentAtlasOwner(projectId: string, canvasId: string): void {
  const canvas = useCanvasStore.getState();
  const host = window.__LCOS_NODE_LAB__;
  const hostCanvasId = host?.currentCanvasId ?? host?.canvasId;
  if (canvas.status !== 'ready' || canvas.canvasId !== canvasId || !canvas.rfInstance
    || host?.api !== canvas.rfInstance || hostCanvasId !== canvasId
    || typeof host?.projectId === 'string' && host.projectId !== projectId
    || useLcosReferenceStore.getState().projectId !== projectId
    || useLcosShellStore.getState().projectId !== projectId) {
    throw new Error('当前项目或原画布已切换；请关闭集合，从当前画布重新打开。');
  }
}

/** Atlas leaf in the original React/Router tree; no ContextWorksite/Canvas host. */
export function NativeSavedContextAtlas({ projectId, canvasId, onClose }: NativeSavedContextAtlasProps): JSX.Element | null {
  const canvas = useCanvasStore(state => state);
  const navigate = useNavigate();
  const [model, setModel] = useState<AtlasModel>({ status: 'loading' });
  const [readKey, setReadKey] = useState(0);
  const [navigationError, setNavigationError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const api = canvas.rfInstance;
    setModel({ status: 'loading' });
    void (async () => {
      try {
        assertCurrentAtlasOwner(projectId, canvasId);
        const projects = new CoreProjectClient(new HttpClient({ baseUrl: `${window.location.origin}/api/lcos/core` }));
        const rows = await projects.getWorkspaces(projectId, controller.signal);
        if (controller.signal.aborted) return;
        assertCurrentAtlasOwner(projectId, canvasId);
        if (useCanvasStore.getState().rfInstance !== api) throw new Error('原 Canvas API 已更换；请重新打开集合。');
        setModel({ status: 'ready', ...readNativeSavedContextWorkspaces(projectId, canvasId, rows) });
      } catch (error) {
        if (!controller.signal.aborted) setModel({ status: 'error', message: error instanceof Error ? error.message : 'Core 工作现场读取失败。' });
      }
    })();
    return () => controller.abort();
  }, [projectId, canvasId, canvas.canvasId, canvas.status, canvas.rfInstance, readKey]);

  const enterItem = (item: WarehouseItemV1, selected?: Workspace): boolean => {
    try {
      assertCurrentAtlasOwner(projectId, canvasId);
      if (model.status !== 'ready') return false;
      const candidates = workspaceTargetsForItem(item, model.workspaces);
      const target = selected
        ? candidates.find(row => row.id === selected.id && row.canvasId === selected.canvasId)
        : candidates.length === 1 ? candidates[0] : undefined;
      if (target) {
        if (!target.canvasId) throw new Error('该 Core 工作现场尚无原画布映射。');
        if (target.canvasId !== canvasId) navigate(`/canvas/${encodeURIComponent(target.canvasId)}`);
        onClose();
        return true;
      }
      if (candidates.length) throw new Error('请从卡片选择一个明确的工作现场。');
      const nodeId = [...useLcosReferenceStore.getState().nodeEntityRefs.entries()].find(([, ref]) =>
        ref.entityType === item.entityRef.type && ref.entityId === item.entityRef.id)?.[0];
      const live = useCanvasStore.getState();
      if (!nodeId || !live.nodes.some(node => node.id === nodeId) || !live.rfInstance?.fitView) {
        throw new Error('当前没有可定位的原画布投影。');
      }
      // The original camera API remains the only camera owner.
      void live.rfInstance.fitView({ nodes: [{ id: nodeId }], duration: 180 });
      onClose();
      return true;
    } catch (error) {
      setNavigationError(error instanceof Error ? error.message : '原画布导航未确认。');
      return false;
    }
  };

  if (typeof document === 'undefined' || !document.body) return null;
  return createPortal(<div data-lcos-native-saved-context-host data-source-canvas-id={canvasId}>
    <AnimatePresence initial={false} mode="sync">
      {model.status === 'ready' ? <ContextAtlasStage key={`${projectId}:${canvasId}`}
        projectId={projectId} workspaces={model.workspaces} currentContextId={String(model.current.scopeId)}
        onClose={onClose} onEnterSurface={enterItem} />
        : <ContextAtlasView key="read-state" ariaLabel="上下文集合" onClose={onClose}
          header={<LcosButton appearance="custom" variant="ghost" size="sm" onClick={onClose}>关闭上下文集合</LcosButton>}>
          {model.status === 'loading' ? <LcosSurfaceFeedback presentation="loading" message="正在读取 Core 上下文集合…" />
            : <LcosSurfaceFeedback presentation="error" message={model.message} actionLabel="重新读取"
              onAction={() => setReadKey(value => value + 1)} />}
        </ContextAtlasView>}
    </AnimatePresence>
    {navigationError && <div className="lcos-native-saved-context-navigation-feedback" role="alert">
      <LcosSurfaceFeedback presentation="error" message={navigationError} />
    </div>}
  </div>, document.body);
}
