// ContextWorksite — Context 现场（Figma context 5388:21602）：真实画布舞台 + 现场仪器
// （Atlas 强表征 / Temporal Rail 局部时间轨 / 来源与关系 Wave 8）。Atlas=Context 现场表征，
// 不是全局 overlay；child canvas 复用同一 Huabu kernel（Portal/Surface 机制 Wave 8 精化）。

import { AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ContextAtlasStage } from './ContextAtlasStage';
import { TemporalRail } from './TemporalRail';
import { useLcosWorksiteNav } from '../../app/useLcosWorksiteNav';
import { useLcosReferenceStore } from '../../lcosReferenceState';
import { beginChildWorksiteNavigation } from '../../navigation/childWorksiteNavigation';
import { useAvoidingHudPosition } from '../../navigation/useAvoidingHudPosition';
import { useHudViewport } from '../../navigation/useHudViewport';
import { childSurfaceForItem, workspaceTargetsForItem } from '../../navigation/workspaceTargets';
import { useLcosShellStore } from '../../shell/lcosShellStore';
import { LcosWorksiteStage } from '../../shell/LcosWorksiteStage';
import { FigmaShellGlyph } from '../../ui/FigmaShellGlyph';
import { LcosSurfaceFeedback } from '../../ui/LcosSurfaceFeedback';
import '../../ui/context/context-spatial.css';

import type { LcosSurfaceKey } from '../../shell/lcosShellStore';
import type { WarehouseItemV1 } from '@local-creative-os/contracts';
import type { Workspace } from '@local-creative-os/domain';

export interface ContextWorksiteProps {
  readonly projectId: string;
  readonly surface: LcosSurfaceKey;
  readonly canvasId?: string;
  readonly canvasBySurface: Readonly<Partial<Record<LcosSurfaceKey, string>>>;
  readonly workspaces: readonly Workspace[];
  readonly ensureCanvas: (surface: LcosSurfaceKey, force?: boolean) => Promise<string | undefined>;
  /** Route-owned child identity; do not infer this from a stale browser URL. */
  readonly isChildWorksite?: boolean;
}

export function ContextWorksite({
  projectId,
  surface,
  canvasId,
  canvasBySurface,
  workspaces,
  ensureCanvas,
  isChildWorksite = false,
}: ContextWorksiteProps): React.JSX.Element {
  const navigate = useNavigate();
  const [atlasOpen, setAtlasOpen] = useState(false);
  const viewport = useHudViewport();
  const instrument = useAvoidingHudPosition({ x: 24, y: viewport.height - 140, width: 44, height: 44 }, {},
    '[data-lcos-surface-dock],[data-lcos-spatial-navigator-host]');
  const activeWorkspaceId = useLcosShellStore((state) => state.activeWorkspaceId);
  const currentContextId = workspaces.find((workspace) => String(workspace.id) === activeWorkspaceId)?.scopeId;
  const nav = useLcosWorksiteNav({ projectId, canvasBySurface, ensureCanvas });

  const enterItem = async (item: WarehouseItemV1, selectedWorkspace?: Workspace): Promise<boolean> => {
    const childTargets = workspaceTargetsForItem(item, workspaces);
    const childTarget = selectedWorkspace ?? (childTargets.length === 1 ? childTargets[0] : undefined);
    const childSurface = childSurfaceForItem(item, childTarget);
    const projectedNodeId = [...useLcosReferenceStore.getState().nodeEntityRefs.entries()].find(
      ([, ref]) => ref.entityId === item.entityRef.id && ref.entityType === item.entityRef.type,
    )?.[0];
    if (childTarget !== undefined && childSurface !== undefined) {
      if (isChildWorksite && String(childTarget.id) === activeWorkspaceId
        && childTarget.canvasId === canvasId && childSurface === surface) {
        setAtlasOpen(false);
        return true;
      }
      const rootSurface = (Object.entries(canvasBySurface) as [LcosSurfaceKey, string][]).find(
        ([, rootCanvasId]) => rootCanvasId === childTarget.canvasId,
      )?.[0];
      if (rootSurface !== undefined) {
        // A root Surface is not a child scene: no synthetic return or time rail.
        const entered = await nav.switchWorksite(rootSurface);
        if (entered) setAtlasOpen(false);
        return entered;
      }
      const shell = useLcosShellStore.getState();
      const entered = await beginChildWorksiteNavigation({
        projectId,
        sourceSurface: surface,
        ...(shell.activeWorkspaceId === null ? {} : { sourceWorkspaceId: shell.activeWorkspaceId }),
        sourceWasChild: isChildWorksite,
        targetSurface: childSurface,
        targetWorkspace: childTarget,
        ...(projectedNodeId === undefined ? {} : { sourceNodeId: projectedNodeId }),
        navigate,
      });
      if (entered) setAtlasOpen(false);
      return entered;
    }
    if (childTargets.length > 0) return false;
    // 有明确 Workspace 映射时进入子现场；其余实体只有已有投影才允许定位，避免“点一下只关闭”。
    if (projectedNodeId === undefined) return false;
    useLcosShellStore.getState().requestLocate({
      reqId: `atlas-${Date.now()}`,
      surface: 'context',
      ...(canvasId === undefined ? {} : { canvasId }),
      nodeId: projectedNodeId,
      status: 'projected',
    });
    setAtlasOpen(false);
    return true;
  };

  return (
    <div data-lcos-context-worksite data-atlas-open={atlasOpen ? 'true' : undefined} className="relative h-full w-full">
      <LcosWorksiteStage
        projectId={projectId}
        surface={surface}
        canvasId={canvasId}
        ensureCanvas={(recreate?: boolean) => ensureCanvas(surface, recreate)}
      />

      {/* Context 现场仪器入口（真实动作；Temporal Rail 只属于子现场） */}
      <div ref={instrument.ref} data-lcos-worksite-instrument-host className="pointer-events-auto fixed z-30" style={{ left: instrument.rect.x, top: instrument.rect.y }}>
        <button
          type="button"
          data-lcos-context-instrument="atlas"
          onClick={() => setAtlasOpen((open) => !open)}
          className="lcos-context-instrument-trigger"
          style={{ position: 'relative', left: 0, bottom: 'auto' }}
          aria-expanded={atlasOpen}
          aria-label={atlasOpen ? '收回上下文集合' : '打开上下文集合'}
          title={atlasOpen ? '收回上下文集合' : '上下文集合'}
        >
          <FigmaShellGlyph name="collection" size={21} />
        </button>
      </div>

      {isChildWorksite && <TemporalRail
        projectId={projectId}
        workspaceId={activeWorkspaceId ?? undefined}
        canvasId={canvasId}
      />}

      {nav.transitionError && <div role="alert" className="pointer-events-auto fixed bottom-24 left-1/2 z-[70] -translate-x-1/2">
        <LcosSurfaceFeedback presentation="error" message={nav.transitionError} />
      </div>}

      <AnimatePresence key={projectId} initial={false} mode="sync">
        {atlasOpen && (
          <ContextAtlasStage
            key="context-atlas"
            projectId={projectId}
            workspaces={workspaces}
            currentContextId={currentContextId === undefined ? undefined : String(currentContextId)}
            onClose={() => setAtlasOpen(false)}
            onEnterSurface={enterItem}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
