// ContextAtlasStage — Context 现场强表征（Figma atlas 5388:24294 / 集合 5333:96 六变体）。
// 数据：真实 warehouse；事情/时间是表征轴，不把实体 kind 当组织语义。
// 进入：有明确 Workspace 映射的集合进入子现场；普通实体仅对已有投影发定位请求。
// 关闭：回到 Context worksite（camera 不动；approach/restore 动效 Wave 9）。


import { CoreAssemblyClient } from '@local-creative-os/web-gen2';
import { useIsPresent } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useCloseOnEscape } from '@/hooks/useCloseOnEscape';
import { useCanvasAttentionStore } from '@/store/canvasAttentionStore';
import useCanvasStore from '@/store/canvasStore';

import { contextAtlasDropSource } from './contextAtlasDrop';
import { ContextAtlasDropCard } from './ContextAtlasDropCard';
import { buildAtlasGroups, canAtlasLocate, isAtlasItem, isCanonicalCollectionItem } from './contextAtlasSemantics';
import { createLcosCoreSession } from '../../app/lcosCoreClient';
import { isDropPointExposed } from '../../drop/dropOcclusion';
import { rectFromDomRect } from '../../drop/dropTargetRegistry';
import { createRailwayPointerDropController } from '../../drop/railwayPointerDrop';
import { useLcosDropStore } from '../../lcosDropState';
import { useLcosReferenceStore } from '../../lcosReferenceState';
import { waitForProjectedEntity } from '../../navigation/waitForProjectedEntity';
import { childSurfaceForItem, workspaceTargetsForItem } from '../../navigation/workspaceTargets';
import { CanonicalCollectionView } from '../../nodes/CanonicalCollectionView';
import { useWarehouseBrowse } from '../../professional/useWarehouseBrowse';
import { useLcosShellStore } from '../../shell/lcosShellStore';
import atlasCloseIcon from '../../ui/context/assets/atlas-close.svg';
import { ContextAtlasView } from '../../ui/context/ContextAtlasView';
import { ContextCollectionActionGlyph } from '../../ui/context/ContextCollectionFace';
import { ContextCollectionView } from '../../ui/context/ContextCollectionView';
import { LcosSurfaceFeedback } from '../../ui/LcosSurfaceFeedback';
import { lcosTokens } from '../../ui/lcosTokens';
import '../../ui/context/context-spatial.css';

import type { RailwayPointerDropController } from '../../drop/railwayPointerDrop';
import type { WarehouseItemV1 } from '@local-creative-os/contracts';
import type { Workspace } from '@local-creative-os/domain';
import type { CollectionMemberPreview as CoreCollectionMemberPreview } from '@local-creative-os/web-gen2';

export interface ContextAtlasStageProps {
  /** Context keeps its worksite Atlas semantics; Main is a canonical Collection-only projection. */
  readonly mode?: 'context' | 'main-collections';
  readonly projectId: string;
  readonly workspaces: readonly Workspace[];
  /** Context identity comes from the active workspace's canonical scopeId. */
  readonly currentContextId?: string;
  readonly onClose: () => void;
  readonly onEnterSurface: (item: WarehouseItemV1, workspace?: Workspace) => boolean | Promise<boolean>;
  readonly onReadMember?: (collectionId: string, member: CoreCollectionMemberPreview) => void;
}

export function ContextAtlasStage({ projectId, workspaces, currentContextId, mode = 'context', onClose, onEnterSurface, onReadMember }: ContextAtlasStageProps): React.JSX.Element {
  const session = useMemo(() => createLcosCoreSession(), []);
  const assembly = useMemo(() => new CoreAssemblyClient(session.http), [session]);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createMessage, setCreateMessage] = useState('');
  const createTitleInputRef = useRef<HTMLInputElement>(null);
  const [focusedItemRef, setFocusedItemRef] = useState<string | null>(null);
  const warehouse = useWarehouseBrowse(assembly, projectId, query, mode === 'main-collections' ? 'collection' : 'context');
  const items = useMemo(() => warehouse.items.filter(mode === 'main-collections' ? isCanonicalCollectionItem : isAtlasItem), [mode, warehouse.items]);
  const { state, error: errorDetail } = warehouse;
  const present = useIsPresent();
  const atlasHost = useRef<HTMLDivElement>(null);
  const pointerDrop = useRef<RailwayPointerDropController | undefined>(undefined);
  useEffect(() => {
    const controller = createRailwayPointerDropController();
    pointerDrop.current = controller;
    return () => { controller.dispose(); pointerDrop.current = undefined; };
  }, [projectId]);
  useLayoutEffect(() => {
    const element = atlasHost.current?.querySelector<HTMLElement>('[data-lcos-context-atlas]');
    if (!element || !present) return;
    return useLcosDropStore.getState().registerTarget({ targetId: `atlas-exclusion:${projectId}:${mode}`,
      kind: 'drop-exclusion', label: '集合总览', priority: 20, enabled: true,
      rect: rectFromDomRect(element.getBoundingClientRect()),
      readRect: () => element.isConnected && !element.closest('[inert],[aria-hidden="true"]')
        ? rectFromDomRect(element.getBoundingClientRect()) : undefined,
      acceptsPoint: (point) => isDropPointExposed(element, point),
      semantic: { kind: 'drop-exclusion', reason: '请投到具体集合卡片；总览空白区不会写入背后的画布。' } });
  }, [projectId, mode, present]);
  useCloseOnEscape(present, onClose);
  useEffect(() => { useCanvasAttentionStore.getState().setCanvasEngaged(false); }, []);
  useEffect(() => { if (createOpen) createTitleInputRef.current?.focus(); }, [createOpen]);

  const kindLabel = (): string => mode === 'main-collections' ? '集合' : '上下文集合';
  const noun = mode === 'main-collections' ? '集合' : '上下文集合';
  const groups = useMemo(() => buildAtlasGroups(items), [items]);
  const focusedItem = items.find((item) => `${item.entityRef.type}:${item.entityRef.id}` === focusedItemRef);

  const focusOnCanvas = (item: WarehouseItemV1): boolean | Promise<boolean> => onEnterSurface(item);
  const projected = (item: WarehouseItemV1): boolean => canAtlasLocate(item, useLcosReferenceStore.getState().nodeEntityRefs.values());
  const targetReason = (item: WarehouseItemV1, workspace: Workspace): string | undefined => !workspace.canvasId
    ? '现场画布尚未就绪' : childSurfaceForItem(item, workspace) === undefined ? '现场类型尚未确认' : undefined;
  const focusedTargets = focusedItem !== undefined && mode === 'context'
    ? workspaceTargetsForItem(focusedItem, workspaces) : [];
  const readyFocusedTargets = focusedItem === undefined ? [] : focusedTargets.filter((workspace) => targetReason(focusedItem, workspace) === undefined);
  const focusedTargetReasons = focusedItem === undefined ? [] : focusedTargets.map((workspace) => targetReason(focusedItem, workspace));
  const focusedProjection = focusedItem !== undefined && projected(focusedItem);
  const focusedActionHint = focusedTargets.length > 0
    ? readyFocusedTargets.length === 0
      ? `匹配现场暂不可进入：${[...new Set(focusedTargetReasons.filter((reason): reason is string => reason !== undefined))].join('；') || '目标类型尚未确认'}。`
      : readyFocusedTargets.length === 1
        ? '唯一匹配现场已就绪；卡片右下角“进入”打开此现场。'
        : `卡片直接列出 ${readyFocusedTargets.length} 个真实现场；点击现场名称即可进入${readyFocusedTargets.length < focusedTargets.length ? '，未就绪现场会标明原因' : ''}。`
    : focusedProjection
      ? `当前画布已有此${noun}的真实投影；卡片右下角“定位”可回到它。`
      : `当前没有可进入或定位的${noun}目标。`;
  const focusedPreviewHint = mode === 'main-collections'
    ? `此${noun}卡面展示真实成员预览，空集合与读取状态也会如实显示。`
    : focusedItem?.previewRef
      ? `卡面使用此${noun}的现有预览资源。`
      : `此${noun}目前没有封面素材。`;

  const createCanonicalCollection = async (): Promise<void> => {
    const title = createTitle.trim();
    if (!title) { setCreateMessage('先填写集合名称。'); return; }
    setCreateBusy(true); setCreateMessage('');
    try {
      const { collection } = await session.collections.create(projectId, title);
      const canvasId = useCanvasStore.getState().canvasId;
      if (!canvasId) { setCreateMessage('集合已创建；当前现场没有可定位画布。'); return; }
      useLcosReferenceStore.getState().requestNodeBindingRefresh();
      const nodeId = await waitForProjectedEntity({ projectId, canvasId, entityType: 'collection', entityId: collection.id, timeoutMs: 8000 });
      if (!nodeId) { setCreateMessage('集合已创建，但画布投影尚未确认；可稍后刷新现场再定位。'); return; }
      const surface = useLcosShellStore.getState().activeSurface;
      useLcosShellStore.getState().requestLocate({ reqId: crypto.randomUUID(), surface, canvasId, nodeId, status: 'projected', preserveSelection: true });
      onClose();
    } catch (error) {
      setCreateMessage(`新建失败：${error instanceof Error ? error.message : 'Core 请求未成功'}`);
    } finally { setCreateBusy(false); }
  };

  const evidenceLabel = (item: WarehouseItemV1): string => {
    const facts = [
      item.relationHint && item.relationHint.neighborCount > 0 ? `关联 ${item.relationHint.neighborCount} 项` : undefined,
      item.provenance?.origin ? `来源 ${({ 'run-return': '运行结果', import: '导入', capture: '采集', unknown: '未注明' } as const)[item.provenance.origin]}` : undefined,
      item.updatedAt ? `更新于 ${item.updatedAt.slice(0, 10)}` : undefined,
    ].filter((fact): fact is string => fact !== undefined);
    return facts.length > 0 ? `${kindLabel()} · ${facts.join(' · ')}` : kindLabel();
  };

  return (
    <div ref={atlasHost} style={{ display: 'contents' }}>
    <ContextAtlasView ariaLabel={mode === 'main-collections' ? '集合总览' : '上下文集合'} onClose={onClose} header={<>
          <label className="lcos-atlas-search"><input type="search" aria-label={`搜索${noun}`} placeholder={`搜索${noun}`} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <span role="status" aria-live="polite">{items.length} 个{noun}</span>
          {mode === 'main-collections' && <button type="button" className="lcos-atlas-create-toggle" aria-expanded={createOpen}
            onClick={() => { setCreateOpen((open) => !open); setCreateMessage(''); }}>新建集合</button>}
          <button type="button" aria-label="收回集合总览" onClick={onClose} className="lcos-atlas-close">
            <img src={atlasCloseIcon} width={22} height={22} alt="" draggable={false} />
          </button>
        </>}
    >
        {mode === 'main-collections' && createOpen && <form className="lcos-atlas-create" onSubmit={(event) => { event.preventDefault(); void createCanonicalCollection(); }}>
          <input ref={createTitleInputRef} aria-label="集合名称" maxLength={200} value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder="集合名称" />
          <button type="submit" disabled={createBusy}>{createBusy ? '创建并定位…' : '创建并定位'}</button>
          <button type="button" disabled={createBusy} onClick={() => setCreateOpen(false)}>取消</button>
          {createMessage && <span role="status" aria-live="polite">{createMessage}</span>}
        </form>}
        {state === 'loading' && items.length === 0 && <div className="py-16"><LcosSurfaceFeedback presentation="loading" message={`正在读取${noun}…`} /></div>}
        {state === 'error' && items.length === 0 && (
          <div className="py-16"><LcosSurfaceFeedback presentation="error" message={`${noun}读取失败${errorDetail ? `（${errorDetail}）` : ''}`} onAction={warehouse.retry} actionLabel="重试" /></div>
        )}
        {state === 'ready' && items.length === 0 ? <LcosSurfaceFeedback presentation="empty" message={query.trim() ? `没有匹配的${noun}` : `还没有${noun}`} /> : null}
        {items.length > 0 && (
          <>
          {focusedItem && <div className="lcos-atlas-focus-summary" role="status" aria-live="polite">
            <strong>已选中：{focusedItem.title || '未命名'}</strong>
            <span>{focusedPreviewHint}{focusedActionHint}</span>
          </div>}
          <div className="lcos-atlas-grid">
            {groups.map((group) => (
              <section key={group.key} style={{ display: 'contents' }}>
                <div style={{ display: 'contents' }}>
                  {group.list.map((item) => {
                    const childTargets = mode === 'context' ? workspaceTargetsForItem(item, workspaces) : [];
                    const reasonForTarget = (workspace: Workspace): string | undefined => targetReason(item, workspace);
                    const readyTargets = childTargets.filter((workspace) => reasonForTarget(workspace) === undefined);
                    const soleTarget = readyTargets.length === 1 ? readyTargets[0] : childTargets.length === 1 ? childTargets[0] : undefined;
                    const hasDestination = readyTargets.length > 0;
                    const hasProjection = projected(item);
                    const activate = (): void => { setFocusedItemRef(`${item.entityRef.type}:${item.entityRef.id}`); };
                    const action = (
                      <span style={{ color: hasProjection || hasDestination ? lcosTokens.color.info : lcosTokens.color.muted }}>
                        <button type="button" data-semantic-drop-handle aria-label={`拿取 ${item.title || '未命名'}`}
                          title="拖动拿取；也可以右键拖动或 Alt + 左键拖动卡片" style={{ cursor: 'grab' }}
                          onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>拿取</button>
                        {soleTarget !== undefined ? (
                          <button type="button" aria-label={`进入 ${item.title ?? '集合'} 现场${reasonForTarget(soleTarget) ? ` · ${reasonForTarget(soleTarget)}` : ''}`} title={reasonForTarget(soleTarget) ?? `进入 ${soleTarget.name}`} disabled={reasonForTarget(soleTarget) !== undefined} onClick={() => { onEnterSurface(item, soleTarget); }}>
                            <ContextCollectionActionGlyph /><span>{soleTarget && reasonForTarget(soleTarget) ? '未就绪' : '进入'}</span>
                          </button>
                        ) : childTargets.length > 1 ? (
                          <span role="group" aria-label={`${item.title ?? '集合'} 的真实现场`} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {childTargets.map((workspace) => (
                              <button type="button" key={String(workspace.id)} aria-label={`进入 ${workspace.name}`} title={reasonForTarget(workspace) ?? `进入 ${workspace.name}`} disabled={reasonForTarget(workspace) !== undefined} onClick={() => { onEnterSurface(item, workspace); }}>
                                <ContextCollectionActionGlyph /><span>{workspace.name}{reasonForTarget(workspace) === undefined ? '' : ` · ${reasonForTarget(workspace)}`}</span>
                              </button>
                            ))}
                          </span>
                        ) : hasProjection ? <button type="button" aria-label={`定位 ${item.title ?? kindLabel()}`} title={`定位到画布中的 ${item.title ?? kindLabel()}`} onClick={() => { focusOnCanvas(item); }}><ContextCollectionActionGlyph /><span>定位</span></button> : <span className="lcos-context-action-unavailable" title={mode === 'main-collections' ? '当前画布尚无可定位的集合投影' : '当前没有可进入或定位的目标'}>暂无目标</span>}
                      </span>
                    );
                    const collectionProps = {
                      projectId,
                      collectionId: item.entityRef.id,
                      title: item.title ?? '未命名',
                      atlasVisualKind: mode === 'main-collections' ? 'collection' as const : 'context' as const,
                      active: mode === 'context' && item.entityRef.id === currentContextId,
                      selected: focusedItemRef === `${item.entityRef.type}:${item.entityRef.id}`,
                      folderVisual: mode === 'context',
                      sourceLabel: kindLabel(),
                      memberSummary: evidenceLabel(item),
                      onActivate: activate,
                      activationLabel: `选中并预览 · ${item.title ?? '未命名'}`,
                      ...(item.previewRef === undefined ? {} : { previewUrl: item.previewRef }),
                      legacyAtlasKind: item.kind,
                      action,
                    };
                    return <ContextAtlasDropCard key={`${item.kind}:${item.entityRef.id}`} projectId={projectId}
                      item={item} present={present} onPointerDown={(event) => {
                        if (!present) return;
                        const payload = contextAtlasDropSource(item, projectId);
                        if (payload) pointerDrop.current?.onPayloadPointerDown(event, payload, projectId);
                      }}>
                      {mode === 'main-collections'
                        ? <CanonicalCollectionView {...collectionProps}
                            onReadMember={onReadMember ? (member) => onReadMember(item.entityRef.id, member) : undefined} />
                        : <ContextCollectionView {...collectionProps} />}
                    </ContextAtlasDropCard>;
                  })}
                </div>
              </section>
            ))}
          </div>
          </>
        )}
        {/* Page feedback belongs after the retained field: loading/retry never displaces its objects. */}
        {state === 'error' && items.length > 0 && <div className="lcos-atlas-pagination-feedback">
          <LcosSurfaceFeedback presentation="error" message={`后续集合读取失败${errorDetail ? `（${errorDetail}）` : ''}，已显示的集合仍可使用。`}
            onAction={warehouse.retry} actionLabel="重试" />
        </div>}
        {warehouse.nextCursor !== undefined && state !== 'error' && <button type="button" className="lcos-atlas-load-more" disabled={state === 'loading'} aria-busy={state === 'loading' || undefined} onClick={warehouse.loadMore}>
          {state === 'loading' ? '正在读取更多集合…' : '继续读取集合'}
        </button>}
    </ContextAtlasView>
    </div>
  );
}
