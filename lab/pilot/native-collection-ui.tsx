import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';

import type { LcosNodeEntityRef } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import { CollectionNodePresentation } from '../../lcos/huabu/apps/web/src/lcos/nodes/CollectionNodePresentation.tsx';
import { nodeMembershipDropSemantic } from '../../lcos/huabu/apps/web/src/lcos/nodes/nodeMembershipDropTarget.ts';
import { LcosButton } from '../../lcos/huabu/apps/web/src/lcos/ui/primitives/LcosButton.tsx';
import { isDropPointExposed } from '../../lcos/huabu/apps/web/src/lcos/drop/dropOcclusion.ts';
import { rectFromDomRect } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTargetRegistry.ts';
import { useLcosDropStore } from '../../lcos/huabu/apps/web/src/lcos/lcosDropState.ts';
import { useLcosDensity } from '../../lcos/huabu/apps/web/src/lcos/nodes/useLcosDensity.ts';
import useCanvasStore, { type NativeCanvasSnapshot } from './native-canvas-port.ts';

import type { DropRect, DropTargetRegistration } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTypes.ts';

interface NativeCollectionReference {
  readonly projectId: string;
  readonly canvasId: string;
  readonly workspaceId: string;
  readonly collectionId: string;
}

interface ParsedCollectionNode {
  readonly title: string;
  readonly reference: NativeCollectionReference;
}

interface OwnerCheck {
  readonly ready: boolean;
  readonly reason: string;
}

export interface LCOSCollectionNodeProps {
  readonly id?: string;
  readonly selected?: boolean;
  readonly data?: Readonly<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseCollectionNode(
  id: string | undefined,
  data: Readonly<Record<string, unknown>> | undefined,
): ParsedCollectionNode | undefined {
  if (!nonEmptyString(id) || !data || data.id !== id || !nonEmptyString(data.title)) return undefined;
  const rawReference = data.lcos_collection_ref;
  if (!isRecord(rawReference)
    || !nonEmptyString(rawReference.projectId)
    || !nonEmptyString(rawReference.canvasId)
    || !nonEmptyString(rawReference.workspaceId)
    || !nonEmptyString(rawReference.collectionId)) return undefined;

  return {
    title: data.title.trim(),
    reference: {
      projectId: rawReference.projectId,
      canvasId: rawReference.canvasId,
      workspaceId: rawReference.workspaceId,
      collectionId: rawReference.collectionId,
    },
  };
}

function hostCanvasId(host: Window['__LCOS_NODE_LAB__']): string | undefined {
  const value = nonEmptyString(host?.currentCanvasId) ? host.currentCanvasId : host?.canvasId;
  return nonEmptyString(value) ? value : undefined;
}

function sameCollectionReference(left: NativeCollectionReference, right: NativeCollectionReference | undefined): boolean {
  return right !== undefined
    && left.projectId === right.projectId
    && left.canvasId === right.canvasId
    && left.workspaceId === right.workspaceId
    && left.collectionId === right.collectionId;
}

function sameEntityReference(current: LcosNodeEntityRef | undefined, desired: LcosNodeEntityRef): boolean {
  return current?.entityType === desired.entityType && current.entityId === desired.entityId;
}

function validDropRect(rect: DropRect): boolean {
  return [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
    && rect.width > 0 && rect.height > 0;
}

function checkCurrentOwner(
  nodeId: string | undefined,
  data: Readonly<Record<string, unknown>> | undefined,
  parsed: ParsedCollectionNode | undefined,
  canvas: NativeCanvasSnapshot,
): OwnerCheck {
  if (!parsed || !nonEmptyString(nodeId)) return { ready: false, reason: '集合引用或节点身份不完整。' };
  if (typeof window === 'undefined') return { ready: false, reason: '原画布尚未就绪。' };

  const { reference, title } = parsed;
  const host = window.__LCOS_NODE_LAB__;
  if (canvas.status !== 'ready' || canvas.canvasId !== reference.canvasId || canvas.rfInstance === null
    || host?.api !== canvas.rfInstance || hostCanvasId(host) !== reference.canvasId) {
    return { ready: false, reason: '当前原 TapNow Canvas/API 尚未映射到此集合。' };
  }
  if (typeof host.projectId === 'string' && host.projectId !== reference.projectId) {
    return { ready: false, reason: '原画布宿主项目与集合引用不一致。' };
  }

  const shell = useLcosShellStore.getState();
  if (shell.projectId !== reference.projectId
    || shell.surfaceCanvasId[shell.activeSurface] !== reference.canvasId
    || shell.activeWorkspaceId !== reference.workspaceId) {
    return { ready: false, reason: 'LCOS 项目、当前 Surface 或 Workspace 与集合引用不一致。' };
  }

  const liveNode = canvas.nodes.find((node) => node.id === nodeId);
  const liveData = liveNode?.data;
  const liveParsed = liveNode?.type === 'lcos-collection' && isRecord(liveData)
    ? parseCollectionNode(nodeId, liveData) : undefined;
  if (!liveNode || liveNode.canvas_id !== reference.canvasId || !liveParsed
    || !sameCollectionReference(reference, liveParsed.reference)
    || liveParsed.title !== title || data?.id !== nodeId) {
    return { ready: false, reason: '集合节点已离开当前原画布，或其 Core 集合身份已更新。' };
  }

  return { ready: true, reason: '' };
}

interface CurrentCollectionOwner {
  readonly canvas: NativeCanvasSnapshot;
  readonly node: NativeCanvasSnapshot['nodes'][number] | undefined;
  readonly sceneReady: boolean;
  readonly ready: boolean;
  readonly referenceReady: boolean;
  readonly locked: boolean;
  readonly dragging: boolean;
}

interface CollectionSpaceToggleResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly frameId?: string;
  readonly collapsed?: boolean;
}

interface CollectionSpaceArrangeResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly frameId?: string;
  readonly idempotent?: boolean;
}

interface CollectionSpaceToggleApi {
  toggleCollectionSpace?: (
    input: { readonly projectId: string; readonly canvasId: string; readonly workspaceId: string;
      readonly collectionId: string; readonly nodeId: string },
    options: { readonly isCurrent: () => boolean },
  ) => Promise<CollectionSpaceToggleResult>;
}

interface CollectionSpaceArrangeApi {
  arrangeCollectionSpace?: (
    input: { readonly projectId: string; readonly canvasId: string; readonly workspaceId: string;
      readonly collectionId: string; readonly nodeId: string },
    options: { readonly isCurrent: () => boolean },
  ) => Promise<CollectionSpaceArrangeResult>;
}

interface CollectionSpacePresentation {
  readonly frameCount: number;
  readonly frameId?: string;
  readonly expanded: boolean;
}

function readCollectionSpacePresentation(
  nodes: NativeCanvasSnapshot['nodes'],
  collectionId: string,
  collectionNodeId: string,
): CollectionSpacePresentation {
  const frames = nodes.filter((node) => node.type === 'group'
    && node.data?.lcosCollectionId === collectionId
    && node.data?.lcosCollectionNodeId === collectionNodeId);
  if (frames.length !== 1) return { frameCount: frames.length, expanded: false };
  const frame = frames[0];
  // The original display projection marks a collapsed host itself hidden and
  // hides its descendants. A child may also be hidden because its own nested
  // Collection is folded; that must not make this parent appear collapsed.
  const expanded = frame.hidden !== true;
  return { frameCount: frames.length, frameId: frame.id, expanded };
}

function collectionSpaceToggleFor(api: NativeCanvasSnapshot['rfInstance']) {
  if (!api) return undefined;
  const toggle = (api as typeof api & CollectionSpaceToggleApi).toggleCollectionSpace;
  return typeof toggle === 'function' ? toggle.bind(api) : undefined;
}

function collectionSpaceArrangeFor(api: NativeCanvasSnapshot['rfInstance']) {
  if (!api) return undefined;
  const arrange = (api as typeof api & CollectionSpaceArrangeApi).arrangeCollectionSpace;
  return typeof arrange === 'function' ? arrange.bind(api) : undefined;
}

function collectionSpaceFailure(reason: string | undefined): string {
  const detail = reason?.trim();
  return detail ? `集合空间操作未完成：${detail}。未自动重试。`
    : '集合空间状态未确认。请核对当前画布后再操作；未自动重试。';
}

function readCurrentCollectionOwner(
  nodeId: string,
  expected: ParsedCollectionNode,
  expectedApi: NativeCanvasSnapshot['rfInstance'],
): CurrentCollectionOwner {
  const canvas = useCanvasStore.getState();
  const node = canvas.nodes.find((candidate) => candidate.id === nodeId);
  const nodeData = isRecord(node?.data) ? node.data : undefined;
  const current = parseCollectionNode(nodeId, nodeData);
  const references = useLcosReferenceStore.getState();
  const desiredRef: LcosNodeEntityRef = {
    entityType: 'collection',
    entityId: expected.reference.collectionId,
  };
  const actualReference = references.nodeEntityRefs.get(nodeId);
  const referenceReady = references.projectId === expected.reference.projectId
    && sameEntityReference(actualReference, desiredRef);
  const exactDto = current !== undefined
    && sameCollectionReference(expected.reference, current.reference)
    && expected.title === current.title;
  const sceneReady = exactDto && canvas.rfInstance === expectedApi
    && checkCurrentOwner(nodeId, nodeData, current, canvas).ready;
  return {
    canvas,
    node,
    sceneReady,
    ready: sceneReady && referenceReady,
    referenceReady,
    locked: nodeData?.locked === true,
    dragging: node?.dragging === true,
  };
}

/**
 * The TapNow node remains the sole spatial owner. This leaf only verifies its
 * exact Core collection identity, registers that identity in the existing
 * LCOS reference cache, and renders the original CollectionNodePresentation.
 * The original Work View and membership receiver stay independent. Folder
 * activation and the existing Arrange menu action delegate only to narrow
 * original-Canvas space/history ports; generic frame writes stay unavailable.
 */
export function LCOSCollectionNode({ id, data }: LCOSCollectionNodeProps): JSX.Element {
  const canvas = useCanvasStore((state) => state);
  const referenceProjectId = useLcosReferenceStore((state) => state.projectId);
  const currentRef = useLcosReferenceStore((state) => state.nodeEntityRefs.get(id ?? ''));
  const shellProjectId = useLcosShellStore((state) => state.projectId);
  const activeSurface = useLcosShellStore((state) => state.activeSurface);
  const activeWorkspaceId = useLcosShellStore((state) => state.activeWorkspaceId);
  const activeSurfaceCanvasId = useLcosShellStore((state) => state.surfaceCanvasId[state.activeSurface]);
  const registerTarget = useLcosDropStore((state) => state.registerTarget);
  const density = useLcosDensity();
  const elementRef = useRef<HTMLDivElement>(null);
  const spaceOperationBusyRef = useRef(false);
  const [spaceOperationBusyOwner, setSpaceOperationBusyOwner] = useState<string | null>(null);
  const [spaceNotice, setSpaceNotice] = useState<{ readonly ownerKey: string; readonly text: string } | null>(null);

  const parsed = useMemo(() => parseCollectionNode(id, data), [id, data]);
  const liveNode = canvas.nodes.find((node) => node.id === id);
  const measured = liveNode?.measured;
  const collectionNodeLocked = liveNode?.data?.locked === true;
  const collectionNodeDragging = liveNode?.dragging === true;
  const desiredRef = useMemo<LcosNodeEntityRef | undefined>(() => parsed ? ({
    entityType: 'collection',
    entityId: parsed.reference.collectionId,
  }) : undefined, [parsed]);
  const owner = checkCurrentOwner(id, data, parsed, canvas);
  const selectedInNativeCanvas = id !== undefined && canvas.selectedNodeIds.includes(id);
  const sameProjectedScene = parsed !== undefined
    && referenceProjectId === parsed.reference.projectId
    && shellProjectId === parsed.reference.projectId
    && activeSurfaceCanvasId === parsed.reference.canvasId
    && activeWorkspaceId === parsed.reference.workspaceId;
  const referenceReady = desiredRef !== undefined && sameEntityReference(currentRef, desiredRef);
  const ready = owner.ready && sameProjectedScene && referenceReady;
  const collectionSpace = parsed && id
    ? readCollectionSpacePresentation(canvas.nodes, parsed.reference.collectionId, id)
    : { frameCount: 0, expanded: false };
  const collectionSpaceOwnerKey = parsed
    ? [parsed.reference.projectId, parsed.reference.canvasId, parsed.reference.workspaceId,
      parsed.reference.collectionId, id ?? ''].join('\0')
    : '';
  const visibleSpaceNotice = spaceNotice?.ownerKey === collectionSpaceOwnerKey ? spaceNotice.text : '';
  const toggleCollectionSpaceApi = collectionSpaceToggleFor(canvas.rfInstance);
  const arrangeCollectionSpaceApi = collectionSpaceArrangeFor(canvas.rfInstance);
  const spaceBusy = spaceOperationBusyOwner === collectionSpaceOwnerKey;
  const collectionSpaceUnavailableReason = !ready
    ? '当前 Canvas/API、项目、Workspace 或集合引用未就绪。'
    : !toggleCollectionSpaceApi
      ? '原集合空间控制接口尚未就绪。'
      : collectionNodeLocked ? '集合节点已锁定。'
        : collectionNodeDragging ? '集合节点正在移动。'
          : collectionSpace.frameCount > 1 ? '检测到多个归属相同的集合空间，已停止操作。'
            : spaceBusy ? '集合空间正在处理。' : '';
  const canToggleCollectionSpace = ready && toggleCollectionSpaceApi !== undefined
    && !collectionNodeLocked && !collectionNodeDragging && collectionSpace.frameCount <= 1 && !spaceBusy;

  const arrangementUnavailableReason = !ready
    ? '当前 Canvas/API、项目、Workspace 或集合引用未就绪。'
    : !arrangeCollectionSpaceApi
      ? '原集合排列接口尚未就绪。'
      : collectionSpace.frameCount === 0 ? '当前集合尚无对应的原画布空间。'
        : collectionSpace.frameCount !== 1 ? '检测到多个归属相同的集合空间，已停止排列。'
          : collectionNodeLocked ? '集合节点已锁定。'
            : collectionNodeDragging ? '集合节点正在移动。'
              : spaceBusy ? '集合空间正在处理。' : '';
  const canArrangeCollectionSpace = ready && arrangeCollectionSpaceApi !== undefined
    && collectionSpace.frameCount === 1 && !collectionNodeLocked && !collectionNodeDragging && !spaceBusy;

  const toggleCollectionSpace = useCallback(async (): Promise<void> => {
    if (!id || !parsed || !ready || !canvas.rfInstance || spaceOperationBusyRef.current) return;
    const capturedApi = canvas.rfInstance;
    const toggle = collectionSpaceToggleFor(capturedApi);
    if (!toggle) return;

    const initial = readCurrentCollectionOwner(id, parsed, capturedApi);
    if (!initial.ready || initial.locked || initial.dragging) return;
    const isCurrent = (): boolean => {
      const latest = readCurrentCollectionOwner(id, parsed, capturedApi);
      const latestSpace = readCollectionSpacePresentation(latest.canvas.nodes,
        parsed.reference.collectionId, id);
      return latest.ready && latest.canvas.rfInstance === capturedApi
        && !latest.locked && !latest.dragging && latestSpace.frameCount <= 1;
    };
    if (!isCurrent()) return;

    spaceOperationBusyRef.current = true;
    setSpaceOperationBusyOwner(collectionSpaceOwnerKey);
    setSpaceNotice({ ownerKey: collectionSpaceOwnerKey, text: '正在处理集合空间…' });
    try {
      const result = await toggle({
        projectId: parsed.reference.projectId,
        canvasId: parsed.reference.canvasId,
        workspaceId: parsed.reference.workspaceId,
        collectionId: parsed.reference.collectionId,
        nodeId: id,
      }, { isCurrent });
      if (!isCurrent()) return;
      if (!result?.ok) {
        setSpaceNotice({ ownerKey: collectionSpaceOwnerKey, text: collectionSpaceFailure(result?.reason) });
        return;
      }
      const message = result.collapsed === true ? '集合空间已收起。'
        : result.collapsed === false ? '集合空间已展开。'
          : '集合空间操作已提交；展开状态以当前画布节点为准。';
      setSpaceNotice({ ownerKey: collectionSpaceOwnerKey, text: message });
    } catch (error) {
      if (isCurrent()) {
        setSpaceNotice({ ownerKey: collectionSpaceOwnerKey,
          text: collectionSpaceFailure(error instanceof Error ? error.message : undefined) });
      }
    } finally {
      spaceOperationBusyRef.current = false;
      setSpaceOperationBusyOwner((current) => current === collectionSpaceOwnerKey ? null : current);
    }
  }, [id, parsed, ready, canvas.rfInstance, collectionSpaceOwnerKey]);

  const arrangeCollectionSpace = useCallback(async (): Promise<boolean> => {
    if (!id || !parsed || !ready || !canvas.rfInstance || spaceOperationBusyRef.current) return false;
    const capturedApi = canvas.rfInstance;
    const arrange = collectionSpaceArrangeFor(capturedApi);
    if (!arrange) return false;

    const initial = readCurrentCollectionOwner(id, parsed, capturedApi);
    const initialSpace = readCollectionSpacePresentation(initial.canvas.nodes,
      parsed.reference.collectionId, id);
    if (!initial.ready || initial.locked || initial.dragging || initialSpace.frameCount !== 1
      || !initialSpace.frameId) return false;
    const capturedFrameId = initialSpace.frameId;
    const isCurrent = (): boolean => {
      const latest = readCurrentCollectionOwner(id, parsed, capturedApi);
      const latestSpace = readCollectionSpacePresentation(latest.canvas.nodes,
        parsed.reference.collectionId, id);
      return latest.ready && latest.canvas.rfInstance === capturedApi
        && !latest.locked && !latest.dragging && latestSpace.frameCount === 1
        && latestSpace.frameId === capturedFrameId;
    };
    if (!isCurrent()) return false;

    spaceOperationBusyRef.current = true;
    setSpaceOperationBusyOwner(collectionSpaceOwnerKey);
    setSpaceNotice({ ownerKey: collectionSpaceOwnerKey, text: '正在按原集合规则排列画布成员…' });
    try {
      const result = await arrange({
        projectId: parsed.reference.projectId,
        canvasId: parsed.reference.canvasId,
        workspaceId: parsed.reference.workspaceId,
        collectionId: parsed.reference.collectionId,
        nodeId: id,
      }, { isCurrent });
      if (!isCurrent()) return false;
      if (!result?.ok || result.frameId !== capturedFrameId) {
        setSpaceNotice({ ownerKey: collectionSpaceOwnerKey, text: collectionSpaceFailure(result?.reason) });
        return false;
      }
      setSpaceNotice({ ownerKey: collectionSpaceOwnerKey,
        text: result.idempotent ? '原集合排列已是最新；材料与成员关系未重写。'
          : '原集合排列已完成，可用 TapNow 撤销；材料与成员关系保留。' });
      return true;
    } catch (error) {
      if (isCurrent()) {
        setSpaceNotice({ ownerKey: collectionSpaceOwnerKey,
          text: collectionSpaceFailure(error instanceof Error ? error.message : undefined) });
      }
      return false;
    } finally {
      spaceOperationBusyRef.current = false;
      setSpaceOperationBusyOwner((current) => current === collectionSpaceOwnerKey ? null : current);
    }
  }, [id, parsed, ready, canvas.rfInstance, collectionSpaceOwnerKey]);

  const openCollectionWorkView = (): void => {
    if (!id || !parsed || !ready || !canvas.rfInstance) return;
    const current = readCurrentCollectionOwner(id, parsed, canvas.rfInstance);
    if (!current.ready || current.canvas.status !== 'ready') return;
    const shell = useLcosShellStore.getState();
    if (shell.projectId !== parsed.reference.projectId
      || shell.activeWorkspaceId !== parsed.reference.workspaceId
      || shell.surfaceCanvasId[shell.activeSurface] !== parsed.reference.canvasId) return;
    shell.openWindow('collection', `集合 · ${parsed.title}`, parsed.reference.collectionId);
  };

  useEffect(() => {
    const element = elementRef.current;
    if (!id || !parsed || !element || !element.isConnected) return;

    const capturedApi = canvas.rfInstance;
    const readRect = (): DropRect | undefined => {
      const liveElement = elementRef.current;
      if (!liveElement?.isConnected) return undefined;
      // Geometry answers only whether this DOM receiver still occupies space.
      // An identity/API transition disables the receiver below; removing its
      // rectangle would reinterpret a rejected drop as a Canvas membership.
      const rect = rectFromDomRect(liveElement.getBoundingClientRect());
      return validDropRect(rect) ? rect : undefined;
    };
    const rect = readRect();
    if (!rect) return;

    const currentRefAtRegistration = useLcosReferenceStore.getState().nodeEntityRefs.get(id);
    const refMatchesAtRegistration = sameEntityReference(currentRefAtRegistration,
      { entityType: 'collection', entityId: parsed.reference.collectionId });
    const membership = refMatchesAtRegistration ? nodeMembershipDropSemantic(currentRefAtRegistration) : undefined;
    const semantic = membership ?? {
      kind: 'drop-exclusion' as const,
      reason: '集合身份尚未确认，暂不能接收材料。',
    };
    const target: DropTargetRegistration = {
      targetId: `node-membership:${id}`,
      nodeId: id,
      kind: semantic.kind,
      label: parsed.title,
      rect,
      readRect,
      acceptsPoint: (point) => {
        // A visible disabled receiver is opaque: let the original resolver
        // reject it, never turn a lock or API/identity refresh into a hole.
        return isDropPointExposed(element, point);
      },
      priority: 30,
      get enabled() {
        const latest = readCurrentCollectionOwner(id, parsed, capturedApi);
        return latest.ready && membership !== undefined && !latest.locked && !latest.dragging;
      },
      get ineligibleReason() {
        const latest = readCurrentCollectionOwner(id, parsed, capturedApi);
        return !latest.ready ? '当前 TapNow Canvas/API、Core 项目、Workspace 或集合引用尚未就绪。'
          : latest.locked ? '该集合节点已锁定，不能接收材料。'
            : latest.dragging ? '该集合节点正在移动，暂不能接收材料。'
              : !membership ? '集合身份尚未确认。' : undefined;
      },
      semantic,
    };
    const release = registerTarget(target);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { readRect(); }) : undefined;
    observer?.observe(element);
    window.addEventListener('resize', readRect);
    window.addEventListener('scroll', readRect, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', readRect);
      window.removeEventListener('scroll', readRect, true);
      release();
    };
  }, [id, parsed, canvas.status, canvas.canvasId, canvas.rfInstance, canvas.nodes, canvas.selectedNodeIds,
    owner.ready, sameProjectedScene, currentRef, referenceProjectId, shellProjectId,
    activeSurface, activeWorkspaceId, activeSurfaceCanvasId, registerTarget]);

  useEffect(() => {
    if (!id || !parsed || !desiredRef || !owner.ready || referenceProjectId !== parsed.reference.projectId) return;
    const currentCanvas = useCanvasStore.getState();
    if (!checkCurrentOwner(id, data, parsed, currentCanvas).ready) return;
    const references = useLcosReferenceStore.getState();
    if (!sameEntityReference(references.nodeEntityRefs.get(id), desiredRef)) {
      references.registerNodeEntity(id, desiredRef);
    }
  }, [id, data, parsed, desiredRef, owner.ready, referenceProjectId, canvas.canvasId, canvas.status,
    canvas.rfInstance, shellProjectId, activeSurface, activeWorkspaceId, activeSurfaceCanvasId, currentRef]);

  useEffect(() => {
    if (!id || !parsed || !desiredRef || !owner.ready) return;
    return () => {
      const references = useLcosReferenceStore.getState();
      if (references.nodeEntityRefs.get(id) === desiredRef) references.forgetNode(id);
    };
  }, [id, parsed, desiredRef, owner.ready]);

  const unavailableReason = !parsed
    ? '集合不可用：Core 引用身份不完整。'
    : !owner.ready || !sameProjectedScene
      ? owner.reason || '集合不可用：当前 Canvas/API/Project/Workspace 已切换。'
      : !referenceReady
        ? '集合身份正在映射到现有 LCOS ReferenceStore。'
        : '';
  const folder = useMemo(() => ({
    selected: selectedInNativeCanvas,
    expanded: collectionSpace.expanded,
    // Keep the original action slot independently usable when the specific
    // NativeNodeBridge toggle is unavailable, busy, stale, locked, or dragging.
    suppressActivation: !canToggleCollectionSpace,
    activationLabel: collectionSpaceUnavailableReason
      ? `集合空间暂不可操作：${collectionSpaceUnavailableReason}`
      : `${collectionSpace.expanded ? '收起' : '展开'}集合：${parsed?.title ?? ''}`,
    onActivate: canToggleCollectionSpace ? toggleCollectionSpace : undefined,
    // CanonicalCollectionView matches this against group.data.lcosCollectionNodeId,
    // which names the original Collection carrier (id), not the generated group/frame ID.
    collectionNodeId: collectionSpace.frameCount === 1 ? id : undefined,
    onArrange: canArrangeCollectionSpace ? arrangeCollectionSpace : undefined,
  }), [selectedInNativeCanvas, collectionSpace.expanded, canToggleCollectionSpace,
    collectionSpaceUnavailableReason, collectionSpace.frameCount, collectionSpace.frameId,
    canArrangeCollectionSpace, arrangeCollectionSpace, id, parsed?.title, toggleCollectionSpace]);

  return <div data-lcos-native-collection-node={id ?? ''}
    data-lcos-native-collection-availability={ready ? 'ready' : 'unavailable'}
    ref={elementRef}
    data-lcos-native-collection-selected={selectedInNativeCanvas || undefined}
    data-lcos-native-collection-management="window-and-members"
    data-lcos-native-collection-frame-management={toggleCollectionSpaceApi
      ? 'first-open-and-display' : 'unavailable'}
    data-lcos-native-collection-space-state={spaceBusy ? 'busy'
      : canToggleCollectionSpace ? 'ready' : 'unavailable'}
    data-lcos-native-collection-space-expanded={collectionSpace.expanded ? 'true' : 'false'}
    data-lcos-native-collection-space-arrangement={canArrangeCollectionSpace ? 'ready' : 'unavailable'}
    aria-label={ready ? `集合：${parsed?.title ?? ''}` : `集合不可用：${unavailableReason}`}
    title={visibleSpaceNotice || (ready ? collectionSpaceUnavailableReason || undefined : unavailableReason)}
    style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
    {ready && parsed
      ? <CollectionNodePresentation kind="collection" title={parsed.title}
        projectId={parsed.reference.projectId} collectionId={parsed.reference.collectionId}
        density={density} zoom={canvas.viewport?.zoom ?? 1}
        worldWidth={measured?.width} worldHeight={measured?.height}
        folder={folder}
        action={<LcosButton variant="secondary" size="sm"
          data-lcos-native-open-collection-work-window={parsed.reference.collectionId}
          aria-label="打开集合工作窗口" title="打开集合工作窗口"
          style={{ color: 'var(--lcos-ui-ink, #25222c)' }}
          disabled={!ready} onClick={openCollectionWorkView}>
          打开
        </LcosButton>} />
      : <div data-lcos-native-collection-unavailable role="status" className="sr-only">{unavailableReason}</div>}
    <span data-lcos-native-collection-space-status={spaceBusy ? 'busy'
      : visibleSpaceNotice ? 'notice' : collectionSpaceUnavailableReason ? 'unavailable' : 'ready'}
      role="status" aria-live="polite" className="sr-only">
      {visibleSpaceNotice || collectionSpaceUnavailableReason
        || (canArrangeCollectionSpace ? '集合空间展开、收起与原菜单排列可用。' : arrangementUnavailableReason)}
    </span>
    <span data-lcos-native-collection-management-status="partial" className="sr-only">
      {`${toggleCollectionSpaceApi ? '集合空间首次展开或折叠通过原画布桥接。' : '集合空间首次展开或折叠尚未接入。'}${canArrangeCollectionSpace
        ? '原菜单排列通过原画布桥接。' : `原菜单排列不可用：${arrangementUnavailableReason}`}成员管理继续使用原成员菜单。`}
    </span>
  </div>;
}
