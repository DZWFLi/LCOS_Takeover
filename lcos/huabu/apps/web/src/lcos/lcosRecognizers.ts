// LCOS pointer recognizers (Phase A03 + A06) — typed intent recognizers
// injected into Huabu's canvas pointer router via hostExtension.recognizers.
//
// Design rules (Phase A task card):
//   - Recognizers produce INTENT, never mutate Core/canvas truth directly.
//   - Ctrl/Cmd+click = this-run Reference pick; Shift+click stays Huabu's
//     additive selection (Shift ALWAYS wins — pointerModifiersOf /
//     isReferencePick enforce the frozen Gen1 grammar).
//   - Mouse only: touch/pen gestures keep their Huabu owners.
//   - Reference picking only applies to nodes PROJECTED by LCOS (the
//     nodeEntityRefs map); native Huabu nodes are untouched.
//
// A06: the semantic-drop recognizer is a PURE OBSERVER ("observe" only, never
// claims a pointer). It never invents a payload — a drop only begins when a
// data source calls `acquireDrop(payload)`; the recognizer then advances the
// machine from pointer position and cancels on release.

import { isReferencePick, pointerModifiersOf } from '@local-creative-os/web-gen2';


import { toast } from '@/components/Common/Toast';
import { getDragActivationDistance } from '@/handler/canvasGestureSession';
import { nodeIdAtScreenPoint } from '@/handler/canvasNodeAtPoint';
import useCanvasStore from '@/store/canvasStore';

import { composerInputKey } from './composer/composerInputJourney';
import { prepareNativeReferencePick, type NativeReferencePickPreparation } from './composer/prepareNativeReferencePick';
import { draftReferenceUnavailableReason, snapshotDraftReference } from './composer/referenceSnapshot';
import { resolveDropPointerTarget } from './drop/dropPointerResolution';
import { canCommitDropRelease } from './drop/dropReleaseConsistency';
import { sameCanvasDropNode, snapshotCanvasDropNodes } from './drop/nativeCanvasDropGeometry';
import { createRightCarryRecognizer } from './drop/rightCarry';
import { useLcosDropStore } from './lcosDropState';
import { useLcosReferenceStore } from './lcosReferenceState';
import { beginCarryContextMenu, finishCarryContextMenu } from './referenceClickSuppressor';
import { markReferencePickCompleted } from './referenceClickSuppressor';
import { referencePickOwnerKey } from './referencePickOwnership';
import { useLcosShellStore } from './shell/lcosShellStore';

import type { CanvasDropNode } from './drop/nativeCanvasDrop';
import type { LcosNodeEntityRef } from './lcosReferenceState';
import type { CanvasPointerRouterContext } from '@/handler/canvasPointerRouterContext';
import type { PointerRecognizer } from '@/handler/pointerRouter';
import type { DropPayload } from '@local-creative-os/web-gen2';

/**
 * Ctrl/Cmd+click on an LCOS-projected node toggles it in the ordered draft
 * references and claims the pointer so React Flow never sees the click —
 * selection must NOT change (Selection ≠ Reference, the frozen A04 rule).
 *
 * The toggle fires on pointerUP only when the gesture stayed a click
 * (no drag beyond a small slop): a Ctrl+drag remains free for future
 * gestures without a phantom reference toggle.
 */
export function createReferencePickRecognizer(prepareNative: NativeReferencePickPreparation = prepareNativeReferencePick): PointerRecognizer<
  PointerEvent,
  CanvasPointerRouterContext
> {
  let activePointerId: number | null = null;
  let startClient = { x: 0, y: 0 };
  let pendingNodeId: string | null = null;
  let claimedNodeId: string | null = null;
  let capturedRef: LcosNodeEntityRef | undefined;
  let capturedNative: CanvasDropNode | undefined;
  const preparingNodes = new Set<string>();
  let origin: { projectId: string | null; inputKey: string | undefined; canvasId: string | null; pickOwner?: string; inputOwner?: string; messageId?: string; continuationOperationId?: string } | null = null;

  const SLOP_PX = 4;
  const sameInput = (pick: NonNullable<typeof origin>) => {
    const shell = useLcosShellStore.getState(), references = useLcosReferenceStore.getState();
    return shell.composerOpen && shell.projectId === pick.projectId && references.projectId === pick.projectId
      && composerInputKey(shell.composerTarget) === pick.inputKey
      && shell.composerTarget?.messageId === pick.messageId && shell.composerTarget?.continuationOperationId === pick.continuationOperationId
      && (pick.pickOwner === undefined || references.referencePickOwner === pick.pickOwner)
      && useCanvasStore.getState().canvasId === pick.canvasId;
  };
  const pendingPicks = new Map<string, Promise<void>>();
  const pickQueueKey = (pick: NonNullable<typeof origin>) => JSON.stringify([pick.projectId, pick.canvasId,
    pick.inputKey, pick.messageId, pick.continuationOperationId]);
  const preparingNodeKey = (nodeId: string, pick: NonNullable<typeof origin>) => JSON.stringify([pick.projectId, pick.canvasId, nodeId]);
  const sending = (pick: NonNullable<typeof origin>) => [...useLcosReferenceStore.getState().referenceInputOperations.values()]
    .some(operation => operation.owner === pick.inputOwner && operation.kind === 'sending');
  const queuePick = (nodeId: string, pick: NonNullable<typeof origin>, native?: CanvasDropNode, captured?: LcosNodeEntityRef) => {
    if (!pick.inputOwner) return;
    const nodeKey = preparingNodeKey(nodeId, pick);
    preparingNodes.add(nodeKey);
    const references = useLcosReferenceStore.getState();
    const token = references.beginReferenceInputOperation(pick.inputOwner, 'preparing');
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && sameInput(pick) && !sending(pick);
    const cancelIfChanged = () => { if (!sameInput(pick) || sending(pick)) controller.abort(); };
    const unsubscribers = [useLcosShellStore.subscribe(cancelIfChanged), useLcosReferenceStore.subscribe(cancelIfChanged),
      useCanvasStore.subscribe(cancelIfChanged)];
    const run = async () => {
      try {
        if (!current()) throw new Error('输入或现场已改变，本次点取已取消；已保存材料保留。');
        let reference = captured;
        if (native?.reference && pick.projectId && pick.canvasId) {
          const canvas = useCanvasStore.getState();
          const liveSource = snapshotCanvasDropNodes([nodeId], canvas.nodes,
            useLcosReferenceStore.getState().nodeEntityRefs, canvas.canvasId ?? undefined)[0];
          if (!sameCanvasDropNode(native, liveSource)) throw new Error('原内容或位置已改变，本次点取已取消。');
          reference = await prepareNative({ projectId: pick.projectId, canvasId: pick.canvasId,
            source: native.reference, signal: controller.signal, isCurrent: current });
        }
        if (!current()) throw new Error('输入或现场已改变，本次点取已取消；已保存材料保留。');
        const currentReferences = useLcosReferenceStore.getState();
        const live = currentReferences.nodeEntityRefs.get(nodeId);
        const visible = live ? snapshotDraftReference(live) : undefined;
        if (!reference || !visible || visible.entityType !== reference.entityType || visible.entityId !== reference.entityId
          || native && (visible.artifactViewId !== reference.artifactViewId || visible.revisionId !== reference.revisionId))
          throw new Error('原材料的版本引用尚未确认，已保留当前输入。');
        if (!currentReferences.toggleEntityReference(reference, useLcosShellStore.getState().composerTarget?.intent))
          throw new Error(draftReferenceUnavailableReason(reference, useLcosShellStore.getState().composerTarget?.intent) ?? '引用尚未就绪。');
      } catch (error) {
        toast(controller.signal.aborted ? '输入或现场已改变，本次点取已取消；已保存材料保留。'
          : error instanceof Error ? error.message : '原材料准备未完成，当前输入保留。', { tone: 'danger' });
      } finally {
        unsubscribers.forEach(unsubscribe => unsubscribe());
        useLcosReferenceStore.getState().finishReferenceInputOperation(token);
        preparingNodes.delete(nodeKey);
      }
    };
    // Preserve explicit pick order even when the second source is already
    // bound or faster to import. No placeholder enters the ordered draft.
    const queueKey = pickQueueKey(pick);
    const queued = (pendingPicks.get(queueKey) ?? Promise.resolve()).then(run);
    pendingPicks.set(queueKey, queued);
    void queued.then(() => { if (pendingPicks.get(queueKey) === queued) pendingPicks.delete(queueKey); });
  };

  return {
    id: 'lcos/reference-pick',
    canClaim: (event, ctx) => {
      const shell = useLcosShellStore.getState();
      const references = useLcosReferenceStore.getState();
      const currentOwner = referencePickOwnerKey(shell.projectId, shell.composerTarget);
      return (
      activePointerId === null &&
      !ctx.interactivityLocked &&
      !ctx.explicitToolActive &&
      event.pointerType === 'mouse' &&
      event.button === 0 &&
      event.isPrimary &&
      shell.composerOpen &&
      shell.composerTarget !== null &&
      (isReferencePick(pointerModifiersOf(event))
        || (!event.shiftKey && !event.altKey && currentOwner !== undefined && references.referencePickOwner === currentOwner)));
    },
    onDown: (event) => {
      const nodeId = nodeIdAtScreenPoint(event.clientX, event.clientY);
      // No node under the pointer → nothing to reference.
      if (!nodeId) return 'pass';
      const target = event.target as Element | null;
      if (target?.closest?.('button,input,textarea,select,a[href],[contenteditable="true"],'
        + '[data-lcos-relation-handle],.react-flow__handle,.react-flow__resize-control,'
        + '[data-resize-handle],[data-lcos-node-resize],[data-semantic-drop-handle]')) return 'pass';
      const store = useLcosReferenceStore.getState();
      const shell = useLcosShellStore.getState();
      // An unbound object still consumes the pick gesture. It must never fall
      // through into ordinary selection, and no invented Core id is allowed.
      const ref = store.nodeEntityRefs.get(nodeId);
      capturedRef = ref ? snapshotDraftReference(ref) : undefined;
      const canvas = useCanvasStore.getState();
      capturedNative = !ref ? snapshotCanvasDropNodes([nodeId], canvas.nodes, store.nodeEntityRefs, canvas.canvasId ?? undefined)[0] : undefined;
      claimedNodeId = nodeId;
      origin = { projectId: store.projectId, inputKey: composerInputKey(shell.composerTarget),
        inputOwner: referencePickOwnerKey(shell.projectId, shell.composerTarget),
        messageId: shell.composerTarget?.messageId, continuationOperationId: shell.composerTarget?.continuationOperationId,
        ...(!isReferencePick(pointerModifiersOf(event)) && store.referencePickOwner !== null ? { pickOwner: store.referencePickOwner } : {}),
        canvasId: useCanvasStore.getState().canvasId };
      activePointerId = event.pointerId;
      startClient = { x: event.clientX, y: event.clientY };
      pendingNodeId = nodeId;
      // Suppress the default click chain early: React Flow must not turn
      // this into a selection change while we decide on pointerup.
      event.preventDefault();
      event.stopPropagation();
      return 'claim';
    },
    onMove: (event) => {
      if (event.pointerId !== activePointerId) return;
      event.preventDefault();
      event.stopPropagation();
      // Drag beyond slop cancels the pick (keeps Ctrl+drag free).
      const moved = Math.hypot(
        event.clientX - startClient.x,
        event.clientY - startClient.y,
      );
      if (moved > SLOP_PX) {
        pendingNodeId = null;
      }
    },
    onUp: (event) => {
      if (event.pointerId !== activePointerId) return;
      event.preventDefault();
      event.stopPropagation();
      if (pendingNodeId !== null && origin) {
        const references = useLcosReferenceStore.getState();
        const shell = useLcosShellStore.getState();
        const live = references.nodeEntityRefs.get(pendingNodeId);
        if (sending(origin)) {
          toast('当前输入正在发送，引用未改变。', { tone: 'danger' });
        } else if (!sameInput(origin)) {
          toast('输入或现场已改变，本次点取已取消。', { tone: 'danger' });
        } else if (preparingNodes.has(preparingNodeKey(pendingNodeId, origin))) {
          toast('这项材料正在准备引用，当前输入保留。');
        } else if (!capturedRef && capturedNative?.reference && origin.projectId && origin.canvasId
          && ['native-text', 'native-image'].includes(capturedNative.reference.entityType)) {
          const canvas = useCanvasStore.getState();
          const current = snapshotCanvasDropNodes([pendingNodeId], canvas.nodes, references.nodeEntityRefs, canvas.canvasId ?? undefined)[0];
          if (!sameCanvasDropNode(capturedNative, current)) toast('原内容或位置已改变，本次点取已取消。', { tone: 'danger' });
          else queuePick(pendingNodeId, origin, capturedNative);
        } else if (!capturedRef || !live || live.entityType !== capturedRef.entityType || live.entityId !== capturedRef.entityId) {
          toast('这项内容尚未保存为可引用材料；已保留当前选择和草稿。', { tone: 'danger' });
        } else if (pendingPicks.has(pickQueueKey(origin))) {
          queuePick(pendingNodeId, origin, undefined, capturedRef);
        } else if (!references.toggleEntityReference(capturedRef, shell.composerTarget?.intent)) {
          toast(draftReferenceUnavailableReason(capturedRef, shell.composerTarget?.intent) ?? '引用尚未就绪。', { tone: 'danger' });
        }
      }
      if (claimedNodeId) markReferencePickCompleted(claimedNodeId);
      activePointerId = null;
      pendingNodeId = null;
      claimedNodeId = null;
      origin = null;
      capturedRef = undefined;
      capturedNative = undefined;
    },
    onCancel: (event) => {
      if (event.pointerId !== activePointerId) return;
      if (claimedNodeId) markReferencePickCompleted(claimedNodeId);
      activePointerId = null;
      pendingNodeId = null;
      claimedNodeId = null;
      origin = null;
      capturedRef = undefined;
      capturedNative = undefined;
    },
  };
}

/**
 * Acquire a payload and begin a spatial drop (Phase A06 acquisition entry).
 * Called by data sources — native file drop, object drag, assembly pick —
 * once an actual payload is in hand; the recognizer never invents one.
 */
export function acquireDrop(payload: DropPayload, transportOwner?: 'panel-pointer'): void {
  useLcosDropStore.getState().begin(payload, undefined, undefined, transportOwner);
}

/**
 * Advance an in-flight drop from a screen-space point. Pointer-router and
 * native HTML5 dragover events share this exact path, so a source cannot get
 * one resolver for pointer dragging and another for browser dragging.
 */
export function advanceDropAtScreenPoint(
  point: { readonly clientX: number; readonly clientY: number },
  ctx: Pick<CanvasPointerRouterContext, 'wrapper' | 'instance'>,
  now = Date.now(),
): void {
  const store = useLcosDropStore.getState();
  const state = store.state;
  if (state.status === 'idle' || state.status === 'committing' || state.status === 'failed') return;
  const rect = ctx.wrapper.getBoundingClientRect();
  store.setBounds({
    left: 0,
    right: rect.width,
    top: 0,
    bottom: rect.height,
  });
  const { target, resolution } = resolveDropPointerTarget(state.payload,
    store.targetAt({ x: point.clientX, y: point.clientY }), {
      native: store.nativeSource !== null, rightCarry: store.carrySourceNodeId !== null,
      ...(store.nativeSource?.blockedReason === undefined ? {} : { blockedReason: store.nativeSource.blockedReason }),
    });
  const destination = target === undefined ? undefined : {
    targetId: target.targetId,
    previewPoint: { x: point.clientX - rect.left, y: point.clientY - rect.top },
  };
  const placementPoint = target?.kind === 'canvas'
    ? ctx.instance.screenToFlowPosition({
        x: point.clientX,
        y: point.clientY,
      })
    : undefined;
  store.advance(
    { x: point.clientX - rect.left, y: point.clientY - rect.top },
    target !== undefined,
    now,
    destination,
    resolution,
    placementPoint,
    { x: point.clientX, y: point.clientY },
  );
}

/**
 * Semantic-drop recognizer: positional driver for an in-flight drop. Pure
 * observer — it never claims a pointer (so it never fights node drag /
 * selection) and only advances the machine while a drop with a payload is
 * active in the store. On pointer release it cancels any uncommitted
 * tracking/dwell/preview.
 */
export function createDropRecognizer(): PointerRecognizer<
  PointerEvent,
  CanvasPointerRouterContext
> {
  let activePointerId: number | null = null;
  const hasOtherTransportOwner = (): boolean => {
    const store = useLcosDropStore.getState();
    return store.transportOwner === 'panel-pointer' || store.carrySourceNodeId !== null
      || store.nativeSource !== null || ('payload' in store.state && store.state.payload.kind === 'assembly');
  };

  return {
    id: 'lcos/drop',
    canClaim: () => false,
    onDown: () => 'pass' as const,
    observe: {
      onDown: (event) => {
        if (hasOtherTransportOwner()) { activePointerId = null; return; }
        if (event.pointerType !== 'mouse') return;
        if (useLcosDropStore.getState().state.status === 'idle') return;
        activePointerId = event.pointerId;
      },
      onMove: (event, ctx) => {
        if (hasOtherTransportOwner()) { activePointerId = null; return; }
        // Native drag sources can acquire the payload just after pointerdown;
        // accept the first subsequent move for the in-flight gesture instead
        // of silently missing the whole drop.
        if (activePointerId === null) {
          if (useLcosDropStore.getState().state.status === 'idle') return;
          activePointerId = event.pointerId;
        }
        if (event.pointerId !== activePointerId) return;
        advanceDropAtScreenPoint(event, ctx);
      },
      onUp: (event, ctx) => {
        if (hasOtherTransportOwner()) { activePointerId = null; return; }
        if (event.pointerId !== activePointerId) return;
        const before = useLcosDropStore.getState();
        advanceDropAtScreenPoint(event, ctx);
        activePointerId = null;
        const store = useLcosDropStore.getState();
        const status = store.state.status;
        if (canCommitDropRelease(before, store)) {
          const id = globalThis.crypto?.randomUUID?.() ?? `drop-${Date.now()}`;
          store.commitAt(id);
          return;
        }
        if (status === 'tracking' || status === 'dwell' || status === 'preview') {
          store.cancel();
        }
      },
      onCancel: (event) => {
        // Native HTML5 drag emits pointercancel when the browser takes over.
        // Its drop/dragend transport, not this observer, ends that gesture.
        if (hasOtherTransportOwner()) { activePointerId = null; return; }
        if (event.pointerId !== activePointerId) return;
        activePointerId = null;
        const status = useLcosDropStore.getState().state.status;
        if (status !== 'idle' && status !== 'committing' && status !== 'failed') {
          useLcosDropStore.getState().cancel();
        }
      },
    },
  };
}

/**
 * All LCOS recognizers for the canvas host extension, in claim order.
 * Each entry is a fresh instance — the array itself is memoized once per
 * host by the caller (useLcosCanvasProps) so the router never re-installs
 * mid-gesture.
 */
export function createLcosRecognizers(): readonly PointerRecognizer<
  PointerEvent,
  CanvasPointerRouterContext
>[] {
  return [createReferencePickRecognizer(), createNodeCarryRecognizer(), createDropRecognizer()];
}

/** T3 Right Carry shares the native pointer router and the existing drop owner. */
export function createNodeCarryRecognizer(): PointerRecognizer<PointerEvent, CanvasPointerRouterContext> {
  const sourceScope = () => {
    const canvas = useCanvasStore.getState();
    const reference = useLcosReferenceStore.getState();
    const projectId = useLcosShellStore.getState().projectId;
    return projectId && canvas.canvasId && !canvas.isLoading && reference.projectId === projectId
      && reference.bindingCanvasId === canvas.canvasId ? { projectId, canvasId: canvas.canvasId } : undefined;
  };
  const snapshot = (ids: readonly string[]) => snapshotCanvasDropNodes(ids,
    useCanvasStore.getState().nodes, useLcosReferenceStore.getState().nodeEntityRefs, useCanvasStore.getState().canvasId ?? undefined);
  return createRightCarryRecognizer({
    acquire: (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return undefined;
      const handle=target.closest<HTMLElement>('[data-semantic-drop-handle][data-node-carry-id]');
      if (!handle && target.closest(
        'input,textarea,select,button,.react-flow__handle,.react-flow__resize-control,[data-resize-handle],[data-lcos-node-resize]',
      )) return undefined;
      // Native notes mount an editable DOM even while idle. That must not make
      // their entire body impossible to carry. A focused editor keeps its text
      // selection/menu; the explicit handle remains available during editing.
      const editor = target.closest('[contenteditable="true"]');
      if (!handle && editor?.contains(document.activeElement)) return undefined;
      const element = target.closest<HTMLElement>('.react-flow__node');
      const nodeId = handle?.dataset.nodeCarryId ?? element?.dataset.id ?? nodeIdAtScreenPoint(event.clientX, event.clientY);
      const scope = sourceScope();
      const canvas = useCanvasStore.getState();
      const primary = canvas.nodes.find((node) => node.id === nodeId);
      if (!scope || !primary || !element) return undefined;
      const ids = primary.selected ? canvas.nodes.filter((node) => node.selected).map((node) => node.id) : [primary.id];
      const nodes = snapshot(ids);
      return nodes.length === ids.length && nodes.find(node=>node.nodeId===primary.id)?.reference
        ? { scope, primaryNodeId: primary.id, nodes, element } : undefined;
    },
    isCurrent: (source) => {
      const scope = sourceScope();
      const current = snapshot(source.nodes.map((node) => node.nodeId));
      return scope?.projectId === source.scope.projectId && scope.canvasId === source.scope.canvasId
        && source.nodes.every((node) => sameCanvasDropNode(node, current.find((item) => item.nodeId === node.nodeId)));
    },
    read: () => useLcosDropStore.getState(),
    begin: (payload, sourceNodeId, sourceNodeIds) => useLcosDropStore.getState().begin(payload, sourceNodeId, sourceNodeIds),
    advance: advanceDropAtScreenPoint,
    commit: () => useLcosDropStore.getState().commitAt(crypto.randomUUID()),
    cancel: () => useLcosDropStore.getState().cancel(),
    reject: (message) => toast(message, { tone: 'danger' }),
    threshold: () => getDragActivationDistance('mouse'),
    beginMenu: beginCarryContextMenu,
    finishMenu: finishCarryContextMenu,
    suppressClick: markReferencePickCompleted,
  });
}
