import { useEffect, useMemo, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import useCanvasStore from '../../lcos/huabu/apps/web/src/store/canvasStore.ts';
import { ProfessionalWindowStage } from '../../lcos/huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.tsx';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import { NativeExecutionSync } from './native-execution-sync.tsx';
import { NativeMaterialRenameHost } from './native-material-metadata.tsx';
import { PortalDropWorkspaceProvider } from '../../lcos/huabu/apps/web/src/lcos/drop/PortalDropWorkspaceContext.tsx';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient.ts';
import { buildSurfaceCanvasMap } from '../../lcos/huabu/apps/web/src/lcos/app/useLcosWorksite.ts';

type PilotEnvironment = {
  readonly PROJECT_ID?: string;
  readonly LCOS_NATIVE_COLLECTION_PILOT?: boolean;
};

type SurfaceKey = 'main' | 'context' | 'workflow';
type SurfaceStatusRow = {
  readonly canvasId: string;
  readonly workspaceId: string;
  readonly scopeId: string;
  readonly name: string;
  readonly preferredSurface: SurfaceKey;
};
type SurfaceHostState = 'waiting' | 'loading' | 'ready' | 'unmapped' | 'error';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseWorkspaceRows(value: readonly unknown[]): readonly SurfaceStatusRow[] {
  const rows = value.map((row): SurfaceStatusRow => {
    if (!isRecord(row) || !isNonEmptyString(row.canvasId) || !isNonEmptyString(row.id)
      || !isNonEmptyString(row.scopeId) || !isNonEmptyString(row.name)
      || !['main', 'context', 'workflow'].includes(String(row.preferredSurface))) {
      throw new Error('Core surfaces 映射结构不完整。');
    }
    return {
      canvasId: row.canvasId,
      workspaceId: row.id,
      scopeId: row.scopeId,
      name: row.name,
      preferredSurface: row.preferredSurface as SurfaceKey,
    };
  });
  if (new Set(rows.map((row) => row.canvasId)).size !== rows.length
    || new Set(rows.map((row) => row.workspaceId)).size !== rows.length) {
    throw new Error('Core workspaces 映射包含重复 Canvas 或 Workspace。');
  }
  return rows;
}

function projectIdFromHost(): string | undefined {
  const configured = (import.meta as ImportMeta & { readonly env?: PilotEnvironment }).env?.PROJECT_ID;
  return typeof configured === 'string' && configured.trim().length > 0 ? configured.trim() : undefined;
}

/**
 * Mounted once as a child of the original ReactFlow owner. The DOM is portaled
 * to the screen root, while React identity, shell state and event ownership stay
 * in the original React tree. The legacy Stage still owns unmigrated windows and
 * saved layouts; a shared React tree does not mean its navigation is migrated.
 */
export function LCOSProfessionalHost({ children }: { readonly children?: ReactNode }): JSX.Element | null {
  const projectId = projectIdFromHost();
  const nativeCollectionPilot = (import.meta as ImportMeta & { readonly env?: PilotEnvironment }).env?.LCOS_NATIVE_COLLECTION_PILOT === true;
  const session = useMemo(() => createLcosCoreSession(), []);
  const canvas = useCanvasStore((state) => state);
  const mainCanvasId = useLcosShellStore(state => state.surfaceCanvasId.main);
  const [surfaceState, setSurfaceState] = useState<SurfaceHostState>('waiting');
  const [surfaceMessage, setSurfaceMessage] = useState('等待原 TapNow Canvas bridge。');
  const [mappedWorkspace, setMappedWorkspace] = useState<SurfaceStatusRow | null>(null);
  const [surfaceRows, setSurfaceRows] = useState<readonly SurfaceStatusRow[]>([]);

  useEffect(() => {
    if (projectId === undefined) return;
    const shell = useLcosShellStore.getState();
    if (shell.projectId !== projectId) shell.setProject(projectId);
    const references = useLcosReferenceStore.getState();
    if (references.projectId !== projectId) references.setProject(projectId);
  }, [projectId]);

  useEffect(() => {
    if (projectId === undefined || canvas.status !== 'ready' || canvas.canvasId === null) {
      setMappedWorkspace(null);
      setSurfaceRows([]);
      setSurfaceState('waiting');
      setSurfaceMessage('等待原 TapNow Canvas bridge。');
      return;
    }

    const controller = new AbortController();
    let active = true;
    setMappedWorkspace(null);
    setSurfaceRows([]);
    setSurfaceState('loading');
    setSurfaceMessage('正在从 Core 读取当前 Canvas 对应的 Workspace。');

    void (async () => {
      try {
        const [graph, workspaces] = await Promise.all([
          session.projects.getProjectGraph(projectId),
          session.projects.getWorkspaces(projectId, controller.signal),
        ]);
        if (graph?.project.id !== projectId || workspaces.some(row => String(row.projectId) !== projectId)) {
          throw new Error('Core 返回的项目身份与当前宿主配置不一致。');
        }
        const roots = graph.scopes.filter(scope => scope.kind === 'root' && String(scope.projectId) === projectId);
        if (roots.length !== 1) throw new Error('Core 尚未确认唯一的项目 root Scope；未猜测一级现场。');
        const surfaceCanvasId = buildSurfaceCanvasMap(workspaces, String(roots[0]!.id));
        const rows = parseWorkspaceRows(workspaces.filter(workspace => workspace.canvasId !== undefined));
        if (!active || controller.signal.aborted) return;

        const shell = useLcosShellStore.getState();
        shell.setSurfaceCanvasMap(surfaceCanvasId);
        const current = rows.find((row) => row.canvasId === canvas.canvasId);
        if (current === undefined) {
          shell.setActiveWorkspaceId(null);
          setSurfaceState('unmapped');
          setSurfaceMessage('当前原 TapNow Canvas 不在 Core Workspace 映射中；没有猜测 Surface。');
          return;
        }
        shell.setActiveSurface(current.preferredSurface);
        shell.setActiveWorkspaceId(current.workspaceId);
        setSurfaceRows(rows);
        setMappedWorkspace(current);
        setSurfaceState('ready');
        setSurfaceMessage(`当前 Canvas 已映射到 ${current.preferredSurface} Surface。`);
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setSurfaceState('error');
        setSurfaceMessage(error instanceof Error ? error.message : 'Core Surface 映射读取失败。');
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [projectId, canvas.canvasId, canvas.status, session]);

  const portalWorkspaces = useMemo(() => surfaceState === 'ready' && mappedWorkspace?.canvasId === canvas.canvasId
    ? surfaceRows.map(row => ({ id: row.workspaceId, scopeId: row.scopeId,
      canvasId: row.canvasId, name: row.name, preferredSurface: row.preferredSurface })) : [],
  [surfaceState, mappedWorkspace, canvas.canvasId, surfaceRows]);
  if (projectId === undefined || typeof document === 'undefined' || document.body === null) return null;
  return (
    <PortalDropWorkspaceProvider projectId={projectId}
      workspaces={portalWorkspaces}
      mainCanvasId={mainCanvasId}>
      <span
        hidden
        aria-live="polite"
        data-lcos-professional-surface-state={surfaceState}
      >
        {surfaceMessage}
      </span>
      {surfaceState === 'ready' && mappedWorkspace !== null && canvas.canvasId === mappedWorkspace.canvasId
        && <NativeExecutionSync projectId={projectId} canvasId={mappedWorkspace.canvasId}
          workspaceId={mappedWorkspace.workspaceId} enabled />}
      {!nativeCollectionPilot && surfaceState === 'ready' && mappedWorkspace !== null && canvas.canvasId === mappedWorkspace.canvasId
        && <NativeMaterialRenameHost projectId={projectId} canvasId={mappedWorkspace.canvasId} />}
      {createPortal(<ProfessionalWindowStage projectId={projectId} />, document.body)}
      {children}
    </PortalDropWorkspaceProvider>
  );
}

/**
 * Exact build override for the donor's nested NativeWorkspaceBody import.
 * That body mounts the legacy Huabu PreviewWorkspace/Canvas; this takeover already has
 * one original Canvas, so recovered windows are retained but render honestly
 * unavailable instead of creating a second spatial truth.
 */
export function NativeWorkspaceBody(): JSX.Element {
  return (
    <div
      role="status"
      data-lcos-native-workspace-unavailable
      style={{ padding: 20, fontSize: 13, lineHeight: 1.6 }}
    >
      这个原生画布助手尚未接入当前接管宿主；原画布保持唯一，窗口状态未被删除。
    </div>
  );
}
