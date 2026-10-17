import { Settings } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/Common/Button';
import useCanvasStore from '@/store/canvasStore';
import { usePanelStore } from '@/store/panelStore';
import { openChat } from '@/store/previewWorkspace/actions';
import { useSettingsUiStore } from '@/store/settingsUiStore';

import { useLcosShellStore } from './lcosShellStore';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { LcosActionLauncher } from '../navigation/LcosActionLauncher';
import { useAvoidingHudPosition } from '../navigation/useAvoidingHudPosition';
import { useHudViewport } from '../navigation/useHudViewport';
import { TapnowChatEntry } from '../ui/nearfield/TapnowChatEntry';
import { visibleWindowIdsForStage } from '../professional/professionalStageVisibility';
import { preferredProfessionalWindowWidth } from '../professional/professionalWindowStageLayout';
import './canvas-capabilities.css';

import type { LcosLauncherAction } from '../navigation/actionLauncher';

/** Consume Huabu's existing panel request in the existing LCOS window owner. */
export function showNativeWorkspace(projectId: string): boolean {
  const shell = useLcosShellStore.getState();
  if (shell.projectId !== projectId || !useCanvasStore.getState().canvasId) return false;
  const previous = shell.windows.find((window) => window.bodyKey === 'native-workspace');
  shell.openWindow('native-workspace', '画布助手与预览');
  if (!previous) {
    const opened = useLcosShellStore.getState().windows.find((window) => window.bodyKey === 'native-workspace');
    if (opened) useLcosShellStore.getState().detachWindowToDockRight(opened.id, preferredProfessionalWindowWidth(opened));
  }
  return true;
}

/** Common worksite capabilities remain independent of Atlas and Hand Cards. */
export function LcosCanvasCapabilities({ projectId, isChildWorksite = false }: {
  readonly projectId: string; readonly isChildWorksite?: boolean;
}): React.JSX.Element {
  const canvasId = useCanvasStore((state) => state.canvasId);
  const viewport = useHudViewport();
  const nativeVisible = useLcosShellStore((state) => {
    const nativeWindow = state.windows.find((window) => window.bodyKey === 'native-workspace');
    return nativeWindow !== undefined && visibleWindowIdsForStage(state.windows, state.windowRegions,
      { x: 0, y: 0, width: viewport.width, height: viewport.height }).windowIds.includes(nativeWindow.id);
  });
  const placement = useAvoidingHudPosition({ x: viewport.width - 112, y: 24, width: 88, height: 40 });
  const readActions = (): readonly LcosLauncherAction[] => {
    const shell = useLcosShellStore.getState();
    if (shell.projectId !== projectId) return [];
    const canvas = useCanvasStore.getState();
    const actions: LcosLauncherAction[] = [
      { id: 'settings', title: '打开设置', keywords: 'settings 应用 agent 连接', run: () => useSettingsUiStore.getState().open() },
      { id: 'runtime-doctor', title: '运行诊断', keywords: '诊断 连接恢复 doctor runtime', run: () => useLcosShellStore.getState().openWindow('runtime-doctor','运行诊断') },
      { id: 'archive', title: '查看项目归档', keywords: 'archive 历史 归档', run: () => useLcosShellStore.getState().openWindow('archive','项目归档') },
    ];
    if (canvas.canvasId) actions.push(
      { id: 'native-workspace', title: '打开画布助手', keywords: 'agent chat 对话 预览', run: () => { openChat(); showNativeWorkspace(projectId); } },
      { id: 'fit', title: '查看全部画布内容', keywords: 'fit 全览 定位', run: () => useLcosShellStore.getState().requestCamera('fit') },
      { id: 'reset-camera', title: '画布恢复100%', keywords: 'zoom reset 缩放 重置', run: () => useLcosShellStore.getState().requestCamera('reset') },
    );
    if (canvas.canvasId && !canvas.isSaving && typeof canvas.saveCanvas === 'function') actions.push({
      id: 'save', title: '保存当前画布', keywords: 'save 保存', run: () => { void useCanvasStore.getState().saveCanvas(); },
    });
    const target = shell.activeSurface === 'main' && !isChildWorksite ? { kind: 'main' as const }
      : shell.activeWorkspaceId ? { kind: 'workspace' as const, id: shell.activeWorkspaceId } : undefined;
    if (canvas.canvasId && target) actions.push({ id: 'assembly', title: '打开当前现场装配', keywords: 'assembly 来源 收件 材料',
      run: () => useLcosShellStore.getState().openAssembly(target,'当前现场装配',true) });
    const selected=(canvas.nodes??[]).filter(node=>node.selected);
    const selectedRef=selected.length===1?useLcosReferenceStore.getState().nodeEntityRefs.get(selected[0].id):undefined;
    if(selectedRef?.entityType==='artifact')actions.push({id:'read-selected',title:'阅读当前材料',keywords:'reader 阅读 原文件 版本 来源 lineage revision',
      run:()=>useLcosShellStore.getState().openReader(`阅读 · ${selectedRef.descriptor?.title??selectedRef.displayLabel??'当前材料'}`,selectedRef.entityId,
        selectedRef.revisionId?{revisionId:selectedRef.revisionId}:undefined)});
    return actions;
  };

  useEffect(() => {
    const unsubscribePanel = usePanelStore.subscribe((state, previous) => {
      if (!state.isRightCollapsed && (previous.isRightCollapsed
        || state.rightPanelAnchorNodeId !== previous.rightPanelAnchorNodeId
        || state.focusChatInputRequest !== previous.focusChatInputRequest)) showNativeWorkspace(projectId);
    });
    const unsubscribeShell = useLcosShellStore.subscribe((state, previous) => {
      if (state.projectId !== projectId || previous.projectId !== projectId) return;
      if (previous.windows.some((window) => window.bodyKey === 'native-workspace')
        && !state.windows.some((window) => window.bodyKey === 'native-workspace')) usePanelStore.getState().setRightCollapsed(true);
    });
    return () => { unsubscribePanel(); unsubscribeShell(); };
  }, [projectId]);
  useEffect(() => {
    if (canvasId && !usePanelStore.getState().isRightCollapsed
      && !useLcosShellStore.getState().windows.some((window) => window.bodyKey === 'native-workspace')) showNativeWorkspace(projectId);
  }, [canvasId, projectId]);

  return <><LcosActionLauncher projectId={projectId} readActions={readActions} />
    <div ref={placement.ref} data-lcos-canvas-capabilities className="lcos-canvas-capabilities"
    style={{ left: placement.rect.x, top: placement.rect.y }}>
    <TapnowChatEntry expanded={nativeVisible}
      onClick={() => {
        const shell = useLcosShellStore.getState();
        const nativeWindow = shell.windows.find((window) => window.bodyKey === 'native-workspace');
        const visible = nativeWindow !== undefined && visibleWindowIdsForStage(shell.windows, shell.windowRegions,
          { x: 0, y: 0, width: viewport.width, height: viewport.height }).windowIds.includes(nativeWindow.id);
        if (visible && nativeWindow) { shell.closeWindow(nativeWindow.id); return; }
        if (!canvasId) return;
        openChat(); showNativeWorkspace(projectId);
      }} />
    <Button variant="ghost" shape="pill" size="lg" iconOnly data-lcos-settings-entry
      aria-label="设置" title="设置 · 应用、Agent 与连接"
      onClick={() => useSettingsUiStore.getState().open()}><Settings /></Button>
  </div></>;
}
