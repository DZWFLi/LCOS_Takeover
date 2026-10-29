import { PointerRouterCore } from '../../lcos/huabu/apps/web/src/handler/pointerRouter';
import type { CanvasPointerRouterContext } from '../../lcos/huabu/apps/web/src/handler/canvasPointerRouterContext';
import type { PointerRecognizer } from '../../lcos/huabu/apps/web/src/handler/pointerRouter';
import { createRightCarryRecognizer, type RightCarryPort } from '../../lcos/huabu/apps/web/src/lcos/drop/rightCarry';
import { snapshotCanvasDropNodes, sameCanvasDropNode, type NativeDropRef } from '../../lcos/huabu/apps/web/src/lcos/drop/nativeCanvasDropGeometry';
import { draftReferenceForGesture } from '../../lcos/huabu/apps/web/src/lcos/composer/referenceSnapshot';
import { beginCarryContextMenu, finishCarryContextMenu, markReferencePickCompleted } from '../../lcos/huabu/apps/web/src/lcos/referenceClickSuppressor';
import type { NativeCanvasNode } from './native-canvas-port';
import type { Node } from '@xyflow/react';

export interface NativeNodeCarryWorld {
  readonly projectId: string;
  readonly canvasId: string;
  readonly workspaceId: string | null;
  readonly api: object & { screenToFlowPosition(point: { x: number; y: number }): { x: number; y: number } };
  readonly wrapper: HTMLDivElement;
  readonly nodes: readonly NativeCanvasNode[];
  readonly selectedNodeIds: readonly string[];
  readonly refs: ReadonlyMap<string, NativeDropRef>;
  /** Original page input owners, distinct from a material's geometry lock. */
  readonly interaction?: { readonly interactivityLocked: boolean; readonly explicitToolActive: boolean };
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/** Read the actual native lifecycle receipt. A malformed saved receipt must not
 * fall back to a new text/image import, and an explicit old version stays old. */
export function nativeCarryReference(value: unknown): NativeDropRef | undefined {
  if (!record(value) || value.version !== 1 || !['artifact', 'view'].includes(String(value.entityType))
    || !nonEmpty(value.artifactId) || !nonEmpty(value.artifactViewId) || !nonEmpty(value.revisionId)
    || value.entityType === 'view' && value.entityId !== value.artifactViewId
    || value.entityType === 'artifact' && value.entityId !== undefined && value.entityId !== value.artifactId) return undefined;
  return { entityType: 'artifact', entityId: value.artifactId, artifactId: value.artifactId,
    artifactViewId: value.artifactViewId, revisionId: value.revisionId };
}

/** Only adapt source identity/geometry. Targets, preparation, writes and result
 * ownership remain with the existing resolver and DropCommitRouter. */
export function snapshotNativeCarryNodes(world: NativeNodeCarryWorld, ids: readonly string[]) {
  const refs = new Map(world.refs), rejected = new Set<string>();
  const nodes: Node[] = world.nodes.flatMap(node => {
    if (!node.position || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) return [];
    const data = node.data ?? {};
    const cached = refs.get(node.id), address = cached ? draftReferenceForGesture(cached) : undefined;
    const saved = data.lcos_ref;
    if (Object.hasOwn(data, 'lcos_ref')) {
      if (record(saved) && ['artifact', 'view'].includes(String(saved.entityType))) {
        const exact = nativeCarryReference(saved);
        const sameOwner = !address || address.entityType === 'artifact' && address.entityId === exact?.entityId
          || ['view', 'artifactView'].includes(address.entityType) && address.entityId === exact?.artifactViewId;
        if (!exact || !sameOwner || address?.artifactViewId && address.artifactViewId !== exact.artifactViewId
          || address?.revisionId && address.revisionId !== exact.revisionId) rejected.add(node.id);
        else refs.set(node.id, { ...cached, ...exact });
      } else if (!record(saved) || saved.version !== 1 || !nonEmpty(saved.entityType) || !nonEmpty(saved.entityId)
        || !address || address.entityType !== saved.entityType || address.entityId !== saved.entityId) rejected.add(node.id);
    }
    // These UI owners register verified aggregate/conversation identities in
    // the shared ref map. Validate their current binding, never invent a ref.
    for (const [key, kind, idKey] of [
      ['lcos_collection_ref', 'collection', 'collectionId'],
      ['lcos_conversation_ref', 'conversation', 'connectedConversationId'],
    ] as const) {
      if (!Object.hasOwn(data, key)) continue;
      const saved = data[key];
      if (!record(saved) || saved.projectId !== world.projectId || saved.canvasId !== world.canvasId
        || saved.workspaceId !== world.workspaceId || !nonEmpty(saved[idKey])
        || address?.entityType !== kind || address.entityId !== saved[idKey]) rejected.add(node.id);
    }
    if (Object.hasOwn(data, 'lcos_result_ref')) {
      const result = data.lcos_result_ref, exact = nativeCarryReference(saved);
      if (!record(result) || result.projectId !== world.projectId || result.canvasId !== world.canvasId
        || result.workspaceId !== world.workspaceId || !exact || result.artifactId !== exact.entityId
        || result.artifactViewId !== exact.artifactViewId || result.revisionId !== exact.revisionId) rejected.add(node.id);
    }
    if (data.contentMissing === true || data.artifactMissing === true || data.locked === true) rejected.add(node.id);
    return [{ ...node, position: { ...node.position }, data: { ...data } } as Node];
  });
  return snapshotCanvasDropNodes(ids, nodes, refs, world.canvasId).map(node => {
    if (rejected.has(node.nodeId)) return { ...node, reference: undefined };
    const data = world.nodes.find(item => item.id === node.nodeId)?.data;
    const label = [node.reference?.displayLabel, data?.title, data?.label].find(nonEmpty);
    return node.reference && label ? { ...node, reference: { ...node.reference, displayLabel: label } } : node;
  });
}

export interface NativeNodeCarryPort extends Pick<RightCarryPort, 'read' | 'begin' | 'advance' | 'commit' | 'cancel' | 'reject'> {
  world(): NativeNodeCarryWorld | null;
  readonly referenceRecognizer?: PointerRecognizer<PointerEvent, CanvasPointerRouterContext>;
}
const sameWorld = (a: NativeNodeCarryWorld, b: NativeNodeCarryWorld | null) => !!b
  && a.projectId === b.projectId && a.canvasId === b.canvasId && a.workspaceId === b.workspaceId
  && a.api === b.api && a.wrapper === b.wrapper;

/** Capture-phase adapter for the shipped TapNow DOM. PointerRouterCore still
 * arbitrates the gesture; RightCarry still owns slop, payload, menu and release.
 * No native positions, selections, history or drafts are written here. */
export function bindNativeNodeCarry(host: Window, port: NativeNodeCarryPort) {
  let origin: NativeNodeCarryWorld | null = null;
  let lastContext: CanvasPointerRouterContext | null = null;
  const context = (): CanvasPointerRouterContext | null => {
    const world = port.world();
    if (!world) return lastContext ? { ...lastContext, interactivityLocked: true } : null;
    lastContext = { wrapper: world.wrapper,
      // The existing recognizer only reads screenToFlowPosition; the original
      // native API was checked by the host before it reached this boundary.
      instance: world.api as CanvasPointerRouterContext['instance'], inputMode: 'mouse',
      interactivityLocked: world.interaction?.interactivityLocked === true,
      explicitToolActive: world.interaction?.explicitToolActive === true,
      onTouchTakeover() {}, onEmptyCanvasTap() {}, onNodeTap() {} };
    return lastContext;
  };
  const recognizer = createRightCarryRecognizer({
    ...port,
    acquire(event) {
      const world = port.world(), target = event.target;
      if (!world || !(target instanceof Element) || !world.wrapper.contains(target)) return undefined;
      const handle = target.closest<HTMLElement>('[data-semantic-drop-handle][data-node-carry-id]');
      if (!handle && target.closest('input,textarea,select,button,.react-flow__handle,.react-flow__resize-control,[data-resize-handle],[data-lcos-node-resize]')) return undefined;
      const editor = target.closest('[contenteditable="true"]');
      if (!handle && editor?.contains(world.wrapper.ownerDocument.activeElement)) return undefined;
      const element = target.closest<HTMLElement>('.react-flow__node[data-id]');
      const nodeId = handle?.dataset.nodeCarryId ?? element?.dataset.id;
      const primary = world.nodes.find(node => node.id === nodeId);
      // The shipped NodeWrapper derives this class from the original Flow
      // isDraggable value, including hand/tool mode. Do not bypass its input
      // owner just because our window capture sees the event first.
      if (!element || !element.classList.contains('draggable') || !primary
        || primary.hidden === true || primary.data?.locked === true) return undefined;
      const selected = world.selectedNodeIds;
      const ids = selected.includes(primary.id) ? selected : [primary.id];
      if (!ids.length || new Set(ids).size !== ids.length) return undefined;
      const nodes = snapshotNativeCarryNodes(world, ids);
      if (nodes.length !== ids.length || !nodes.find(node => node.nodeId === primary.id)?.reference) return undefined;
      origin = world;
      return { scope: { projectId: world.projectId, canvasId: world.canvasId }, primaryNodeId: primary.id, nodes, element };
    },
    isCurrent(source) {
      const world = port.world();
      if (!origin || !sameWorld(origin, world) || !world || !source.element.classList.contains('draggable')) return false;
      const current = snapshotNativeCarryNodes(world, source.nodes.map(node => node.nodeId));
      return source.nodes.every(node => sameCanvasDropNode(node, current.find(candidate => candidate.nodeId === node.nodeId)));
    },
    threshold: () => 4,
    beginMenu: beginCarryContextMenu, finishMenu: finishCarryContextMenu, suppressClick: markReferencePickCompleted,
  });
  const recognizers = port.referenceRecognizer ? [port.referenceRecognizer, recognizer] : [recognizer];
  const router = new PointerRouterCore(recognizers, context);
  const cancel = () => { router.cancelAll(); origin = null; };
  const invalidate = () => { if (origin && !sameWorld(origin, port.world())) cancel(); };
  const down = (event: PointerEvent) => {
    if (router.hasActiveOwner()) return;
    const world = port.world();
    if (!world || !(event.target instanceof Element) || !world.wrapper.contains(event.target)) return;
    const currentContext = context();
    if (!currentContext || !recognizers.some(candidate => candidate.canClaim(event, currentContext))) return;
    router.handleDown(event);
    if (router.hasActiveOwner()) origin = world;
    if (!router.ownerOf(event.pointerId)) router.handleCancel(event);
  };
  const move = (event: PointerEvent) => { if (router.ownerOf(event.pointerId)) router.handleMove(event); };
  const up = (event: PointerEvent) => { if (router.ownerOf(event.pointerId)) router.handleUp(event); if (!router.hasActiveOwner()) origin = null; };
  const cancelled = (event: PointerEvent) => { if (router.ownerOf(event.pointerId)) router.handleCancel(event); if (!router.hasActiveOwner()) origin = null; };
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && router.hasActiveOwner()) { event.preventDefault(); event.stopPropagation(); cancel(); } };
  const capture = { capture: true };
  host.addEventListener('pointerdown', down, capture);
  host.addEventListener('pointermove', move, capture);
  host.addEventListener('pointerup', up, capture);
  host.addEventListener('pointercancel', cancelled, capture);
  host.addEventListener('lostpointercapture', cancelled, capture);
  host.addEventListener('keydown', escape, capture);
  host.addEventListener('blur', cancel);
  return { invalidate, dispose() {
    cancel();
    host.removeEventListener('pointerdown', down, capture); host.removeEventListener('pointermove', move, capture);
    host.removeEventListener('pointerup', up, capture); host.removeEventListener('pointercancel', cancelled, capture);
    host.removeEventListener('lostpointercapture', cancelled, capture); host.removeEventListener('keydown', escape, capture);
    host.removeEventListener('blur', cancel);
  } };
}
