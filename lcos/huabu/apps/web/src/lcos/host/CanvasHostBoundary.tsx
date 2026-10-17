// CanvasHostBoundary — 唯一 Canvas 内核边界（Wave 2）。
// 职责：装配 projectId 会话 runtime（createLcosRuntime 单实例）→ host seam →
// hostExtension → `<Canvas chromeMode="lcos">`。不创建第二 ReactFlow/store/camera/history。
// 旧 chrome（NodeToolbar/Controls/MiniMap）由 chromeMode 显式隐藏，命令路径保留。

import { SkeletonLoadingIndicator } from '@/components/Common/SkeletonLoadingIndicator';
import { Canvas } from '@/components/Panels/Canvas/Canvas';
import { useLcosCanvasProps } from '@/lcos/useLcosCanvasProps';
import { useTrackCanvasAttention } from '@/store/canvasAttentionStore';
import useCanvasStore from '@/store/canvasStore';

import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';
import { lcosTokens } from '../ui/lcosTokens';
import { useReducedSpatialMotion } from '../ui/motion/useReducedSpatialMotion';

export interface CanvasHostBoundaryProps {
  readonly projectId: string;
  readonly chromeMode?: 'huabu' | 'lcos';
}

export function CanvasHostBoundary({
  projectId,
  chromeMode = 'lcos',
}: CanvasHostBoundaryProps): React.JSX.Element {
  // Both project routes and legacy deep links converge here: one attention owner.
  useTrackCanvasAttention();
  const { hostExtension } = useLcosCanvasProps(projectId);
  const canvasId = useCanvasStore((state) => state.canvasId);
  const identityCanvasId = useLcosReferenceStore((state) => state.bindingCanvasId);
  const identityProjectId = useLcosReferenceStore((state) => state.projectId);
  const identitiesReady = useLcosReferenceStore((state) => state.bindingIdentitiesReady);
  const readStatus = useLcosReferenceStore((state) => state.bindingReadStatus);
  const retry = useLcosReferenceStore((state) => state.requestNodeBindingRefresh);
  const sameCanvas = identityProjectId === projectId && identityCanvasId === canvasId;
  const awaitingIdentities = chromeMode === 'lcos' && (!sameCanvas || !identitiesReady);
  const identityReadFailed = sameCanvas && readStatus === 'error';
  const transition = useLcosShellStore((state) => state.worksiteCameraTransition);
  const reducedMotion = useReducedSpatialMotion();
  const initialViewportOverride = !reducedMotion && transition?.canvasId === canvasId
    ? transition.startViewport
    : undefined;
  return (
    <div className="relative h-full w-full">
      {/* Keep the one canvas mounted for measurement/sync; no native body is exposed before
          its canonical identity is known. A valid empty list releases all freeform nodes. */}
      <div className="absolute inset-0" aria-hidden={awaitingIdentities || undefined}
        inert={awaitingIdentities}
        style={{ visibility: awaitingIdentities ? 'hidden' : 'visible', opacity: awaitingIdentities ? 0 : 1 }}>
        <Canvas
          chromeMode={chromeMode}
          hostExtension={hostExtension}
          shortcutsDisabled={awaitingIdentities}
          {...(initialViewportOverride === undefined ? {} : { initialViewportOverride })}
        />
      </div>
      {awaitingIdentities && <div data-lcos-binding-initial-cover={identityReadFailed ? 'error' : 'loading'}
        role="status" aria-live="polite"
        className="absolute inset-0 flex items-center justify-center"
        style={{ background: lcosTokens.color.canvas, color: lcosTokens.color.text }}>
        <div className="flex w-64 flex-col gap-3 text-sm">
          {identityReadFailed ? <>
            <span>画布对象身份暂不可用</span>
            <span className="text-xs text-fg-subtle">为避免把受管对象当成自由节点编辑，暂未开放画布。可重新读取，或从左侧切换现场。</span>
            <button type="button" className="self-start rounded-lg border px-3 py-2"
              onClick={retry}>重新读取</button>
          </> : <>
            <SkeletonLoadingIndicator lines={3} />
            <span className="sr-only">正在读取画布对象</span>
          </>}
        </div>
      </div>}
    </div>
  );
}
