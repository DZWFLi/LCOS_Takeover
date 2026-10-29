import { canCommitDropRelease } from './dropReleaseConsistency';

import type { DropResolution } from './dropTypes';
import type { CanvasDropNode, CanvasDropScope } from './nativeCanvasDrop';
import type { CanvasPointerRouterContext } from '../../handler/canvasPointerRouterContext';
import type { PointerRecognizer } from '../../handler/pointerRouter';
import type { DropPayload, SemanticDropState } from '@local-creative-os/web-gen2';

export interface RightCarrySource {
  readonly scope: CanvasDropScope;
  readonly primaryNodeId: string;
  readonly nodes: readonly CanvasDropNode[];
  readonly element: Element;
}
export interface RightCarryPort {
  acquire(event: PointerEvent, ctx: CanvasPointerRouterContext): RightCarrySource | undefined;
  isCurrent(source: RightCarrySource): boolean;
  read(): { readonly state: SemanticDropState; readonly resolution: DropResolution | null };
  begin(payload: DropPayload, sourceNodeId: string, sourceNodeIds: readonly string[]): void;
  advance(event: PointerEvent, ctx: CanvasPointerRouterContext): void;
  commit(): void;
  cancel(): void;
  reject(message: string): void;
  threshold(): number;
  /** Defer the native context menu until click-vs-carry is known. */
  beginMenu(element: Element): void;
  finishMenu(show: boolean, event: PointerEvent): void;
  suppressClick?(nodeId: string): void;
}

export type SemanticCarryTrigger = 'secondary-pointer' | 'modifier-primary' | 'handle-primary';

/** G1 default right carry; ordinary primary movement/selection is never a carry. */
export function semanticCarryTriggerFromPointer(event: Pick<PointerEvent,'button'|'altKey'|'target'>
  & Partial<Pick<PointerEvent,'ctrlKey'|'metaKey'|'shiftKey'>>): SemanticCarryTrigger | null {
  if(event.button===2) return 'secondary-pointer';
  if(event.button!==0 || event.shiftKey || event.ctrlKey || event.metaKey) return null;
  const handle=typeof Element !== 'undefined' && event.target instanceof Element && event.target.closest('[data-semantic-drop-handle]');
  if(handle) return 'handle-primary';
  return event.altKey ? 'modifier-primary' : null;
}

export function nodeCarryTrigger(event: Pick<PointerEvent,'button'|'altKey'|'ctrlKey'|'metaKey'|'shiftKey'|'target'>): 'secondary'|'primary'|undefined {
  const trigger = semanticCarryTriggerFromPointer(event);
  return trigger === 'secondary-pointer' ? 'secondary' : trigger === null ? undefined : 'primary';
}

/** A recognizer for the EXISTING pointer router. No position, selection or Core writes.
 * One owner handles right-button release. The generic drop observer must not also commit it.
 */
export function createRightCarryRecognizer(port: RightCarryPort): PointerRecognizer<PointerEvent, CanvasPointerRouterContext> {
  let pointerId: number | null = null;
  let origin = { x: 0, y: 0 };
  let source: RightCarrySource | undefined;
  let payload: DropPayload | undefined;
  let wrapper: HTMLDivElement | undefined;
  let lastEvent: PointerEvent | undefined;
  let active = false;
  let trigger: 'secondary'|'primary' = 'secondary';

  // Semantic carry follows G1's click tolerance without changing native Move's threshold.
  const carryThreshold = () => Math.max(4, port.threshold());

  const stop = (event: PointerEvent) => { event.preventDefault(); event.stopPropagation(); };
  const ownsDrop = () => { const { state } = port.read(); return payload !== undefined && 'payload' in state && state.payload === payload; };
  const finish = (event: PointerEvent, showMenu = false) => {
    const primaryId=source?.primaryNodeId;
    const primaryTrigger=trigger==='primary';
    const capturedId = pointerId;
    const capturedWrapper = wrapper;
    pointerId = null; source = undefined; payload = undefined; active = false; wrapper = undefined;
    // Reset before releasePointerCapture: lostpointercapture may be dispatched synchronously.
    if (capturedId !== null && capturedWrapper?.hasPointerCapture?.(capturedId)) {
      capturedWrapper.releasePointerCapture(capturedId);
    }
    if(primaryTrigger) {if(primaryId)port.suppressClick?.(primaryId);}
    else port.finishMenu(showMenu, event);
  };
  const cancel = (event: PointerEvent, message?: string) => {
    if (ownsDrop() && port.read().state.status !== 'committing') port.cancel();
    finish(event);
    if (message) port.reject(message);
  };

  return {
    id: 'lcos/node-carry',
    canClaim: (event, ctx) => pointerId === null && !ctx.interactivityLocked && !ctx.explicitToolActive
      && event.pointerType === 'mouse' && event.isPrimary && nodeCarryTrigger(event)!==undefined
      && (port.read().state.status === 'idle' || port.read().state.status === 'failed'),
    onDown(event, ctx) {
      const acquired = port.acquire(event, ctx);
      const nextTrigger = nodeCarryTrigger(event);
      if (!acquired || !nextTrigger) return 'pass';
      source = acquired; pointerId = event.pointerId; origin = { x: event.clientX, y: event.clientY };
      trigger=nextTrigger;
      lastEvent = event; wrapper = ctx.wrapper; active = false;
      if(trigger==='secondary') port.beginMenu(acquired.element);
      stop(event);
      // Capture immediately: even a sub-threshold click can finish outside the canvas.
      try { wrapper.setPointerCapture(event.pointerId); } catch { /* Router cancellation still handles blur/unmount. */ }
      return 'claim';
    },
    onMove(event, ctx) {
      if (event.pointerId !== pointerId || !source) return;
      lastEvent = event; stop(event);
      // Chorded mouse buttons do not necessarily produce another pointerdown.
      if (event.buttons !== (trigger==='secondary'?2:1)) { cancel(event); return; }
      if (ctx.interactivityLocked || ctx.explicitToolActive || !port.isCurrent(source)) { cancel(event, '来源或工作现场已变化，未投递'); return; }
      if (!active) {
        if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) <= carryThreshold()) return;
        if (source.nodes.length === 0 || source.nodes.some((node) => !node.reference)) {
          cancel(event, '整组包含尚未绑定项目身份的对象，未投递任何一项'); return;
        }
        payload = { kind: 'objects', objects: source.nodes.flatMap((node) => node.reference ? [{ ...node.reference }] : []) };
        port.begin(payload, source.primaryNodeId, source.nodes.map((node) => node.nodeId));
        if (!ownsDrop()) { cancel(event); return; }
        active = true;
      }
      port.advance(event, ctx);
    },
    onUp(event, ctx) {
      if (event.pointerId !== pointerId || !source) return;
      lastEvent = event; stop(event);
      if (event.button !== (trigger==='secondary'?2:0) || event.buttons !== 0) { cancel(event); return; }
      if (ctx.interactivityLocked || ctx.explicitToolActive || !port.isCurrent(source)) { cancel(event, '来源或工作现场已变化，未投递'); return; }
      if (!active) {
        const stayedClick = Math.hypot(event.clientX - origin.x, event.clientY - origin.y) <= carryThreshold();
        finish(event, stayedClick); return;
      }
      if (!ownsDrop()) { finish(event); return; }
      const before = port.read();
      port.advance(event, ctx);
      const after = port.read();
      // Release may reject a preview; it may NOT discover a new operation and submit unseen.
      if (before.state.status === 'preview' && canCommitDropRelease(before, after)) {
        try { port.commit(); } finally { finish(event); }
      } else {
        // Releasing over ordinary canvas/unsupported content is a cancelled
        // carry, as in G1. Only losing a previously accepted operation is an
        // error; a non-target must not generate a persistent red toast.
        const reason = before.resolution?.status === 'ready'
          ? after.resolution?.status === 'ineligible' ? after.resolution.reason : '目标已变化，未投递'
          : undefined;
        cancel(event, reason);
      }
    },
    onCancel(event) {
      if (event.pointerId === pointerId) cancel(lastEvent ?? event);
    },
  };
}
