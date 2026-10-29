import type { PointerEvent as ReactPointerEvent } from 'react';

type Point = { readonly x: number; readonly y: number };
type Rect = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
export interface RailwayReorderItem {
  readonly key: string;
  readonly element: HTMLElement;
  readonly readRect: () => Rect | undefined;
}
export interface RailwayReorderIntent {
  readonly key: string;
  readonly targetKey: string;
  readonly where: 'before' | 'after';
}
export interface RailwayReorderPreview extends RailwayReorderIntent {
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly pointer: Point;
  readonly shifts: readonly { readonly key: string; readonly x: number; readonly y: number }[];
}
export interface RailwayPointerReorderPort {
  /** Only stored, visible, explicitly reorderable destinations, in displayed order. */
  readonly items: () => readonly RailwayReorderItem[];
  /** The host checks busy, current project/order version and source eligibility. */
  readonly isCurrent: (key: string) => boolean;
  readonly onStart: (key: string) => void;
  readonly onUpdate: (preview: RailwayReorderPreview | null) => void;
  /** Undefined means cancelled/no order change: never write Core for it. */
  readonly onFinish: (intent: RailwayReorderIntent | undefined) => void;
}

interface Session {
  readonly pointerId: number;
  readonly key: string;
  readonly source: HTMLElement;
  readonly origin: Point;
  readonly slots: readonly { readonly key: string; readonly rect: Rect }[];
  moved: boolean;
}

function validRect(rect: Rect | undefined): rect is Rect {
  return rect !== undefined && [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
    && rect.width > 0 && rect.height > 0;
}

/** Rail-only transient reorder gesture. The host retains the existing Core order owner. */
export function createRailwayPointerReorder(
  port: RailwayPointerReorderPort,
  events: EventTarget | undefined = typeof window === 'undefined' ? undefined : window,
  visibility: EventTarget | undefined = typeof document === 'undefined' ? undefined : document,
) {
  let session: Session | undefined;
  let suppressedKey: string | undefined;
  let suppressTimer: ReturnType<typeof setTimeout> | undefined;
  const clearSuppression = () => {
    if (suppressTimer !== undefined) clearTimeout(suppressTimer);
    suppressTimer = undefined; suppressedKey = undefined;
  };
  const finish = (active: Session, intent?: RailwayReorderIntent) => {
    if (session !== active) return;
    // releasePointerCapture can synchronously emit lostpointercapture.
    session = undefined;
    if (active.moved) {
      clearSuppression(); suppressedKey = active.key;
      suppressTimer = setTimeout(clearSuppression, 300);
    }
    try {
      if (active.source.hasPointerCapture(active.pointerId)) active.source.releasePointerCapture(active.pointerId);
    } catch { /* Browser may already have released capture. */ }
    if (active.moved) { port.onUpdate(null); port.onFinish(intent); }
  };
  const cancel = () => { if (session) finish(session); };
  const currentItems = (active: Session) => {
    const items = port.items();
    return port.isCurrent(active.key) && active.source.isConnected
      && items.length === active.slots.length && items.every((item, index) => item.key === active.slots[index]?.key)
      && items.find(item => item.key === active.key)?.element === active.source ? items : undefined;
  };
  const previewAt = (active: Session, point: Point): RailwayReorderPreview | undefined => {
    const items = currentItems(active);
    if (!items) return;
    const live = items.flatMap(item => { const rect = item.readRect(); return validRect(rect) ? [{ key: item.key, rect }] : []; });
    if (live.length !== items.length || live.length === 0) return;
    // Slots may have gutters, but leaving the actual Rail region is not a reorder target.
    if (point.x < Math.min(...live.map(item => item.rect.left)) || point.x > Math.max(...live.map(item => item.rect.left + item.rect.width))
      || point.y < Math.min(...live.map(item => item.rect.top)) || point.y > Math.max(...live.map(item => item.rect.top + item.rect.height))) return;
    const nearest = [...live].sort((a, b) =>
      Math.hypot(point.x - a.rect.left - a.rect.width / 2, point.y - a.rect.top - a.rect.height / 2)
      - Math.hypot(point.x - b.rect.left - b.rect.width / 2, point.y - b.rect.top - b.rect.height / 2))[0];
    if (!nearest) return;
    const fromIndex = live.findIndex(item => item.key === active.key);
    const targetIndex = live.findIndex(item => item.key === nearest.key);
    const where = point.y > nearest.rect.top + nearest.rect.height / 2 ? 'after' : 'before';
    const insertion = targetIndex + (where === 'after' ? 1 : 0);
    const toIndex = insertion > fromIndex ? insertion - 1 : insertion;
    const ordered = active.slots.map(item => item.key);
    ordered.splice(fromIndex, 1); ordered.splice(toIndex, 0, active.key);
    const shifts = active.slots.flatMap((slot, index) => {
      if (slot.key === active.key) return [];
      const next = ordered.indexOf(slot.key);
      const rect = active.slots[next]?.rect;
      return rect && next !== index ? [{ key: slot.key, x: rect.left - slot.rect.left, y: rect.top - slot.rect.top }] : [];
    });
    return { key: active.key, targetKey: nearest.key, where, fromIndex, toIndex, pointer: point, shifts };
  };
  const consume = (event: Event) => { event.preventDefault(); event.stopPropagation(); };
  const move = (raw: Event) => {
    const event = raw as PointerEvent;
    const active = session;
    if (!active || event.pointerId !== active.pointerId) return;
    if (event.buttons !== 1 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !currentItems(active)) { cancel(); return; }
    if (!active.moved) {
      if (Math.hypot(event.clientX - active.origin.x, event.clientY - active.origin.y) <= 4) return;
      active.moved = true;
      try { active.source.setPointerCapture(active.pointerId); } catch { /* Window events still track this gesture. */ }
      port.onStart(active.key);
    }
    consume(event);
    port.onUpdate(previewAt(active, { x: event.clientX, y: event.clientY }) ?? null);
  };
  const up = (raw: Event) => {
    const event = raw as PointerEvent;
    const active = session;
    if (!active || event.pointerId !== active.pointerId) return;
    if (!active.moved) { finish(active); return; }
    consume(event);
    const preview = event.button === 0 && event.buttons === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
      ? previewAt(active, { x: event.clientX, y: event.clientY }) : undefined;
    finish(active, preview && preview.toIndex !== preview.fromIndex
      ? { key: active.key, targetKey: preview.targetKey, where: preview.where } : undefined);
  };
  const interrupted = (raw: Event) => { if (session && (raw as PointerEvent).pointerId === session.pointerId) cancel(); };
  const key = (raw: Event) => {
    if ((raw as KeyboardEvent).key === 'Escape' && session) { consume(raw); cancel(); }
  };
  const hidden = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') cancel(); };
  const nextDown = () => { if (!session) clearSuppression(); };
  events?.addEventListener('pointerdown', nextDown, true);
  events?.addEventListener('pointermove', move, true);
  events?.addEventListener('pointerup', up, true);
  events?.addEventListener('pointercancel', interrupted, true);
  events?.addEventListener('lostpointercapture', interrupted, true);
  events?.addEventListener('keydown', key, true);
  events?.addEventListener('blur', cancel);
  visibility?.addEventListener('visibilitychange', hidden);

  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>, sourceKey: string): boolean {
      if (session || event.button !== 0 || !event.isPrimary || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
        || !port.isCurrent(sourceKey)) return false;
      const items = port.items();
      const source = items.find(item => item.key === sourceKey)?.element;
      const slots = items.flatMap(item => { const rect = item.readRect(); return validRect(rect) ? [{ key: item.key, rect }] : []; });
      if (!source?.isConnected || slots.length !== items.length) return false;
      clearSuppression();
      session = { pointerId: event.pointerId, key: sourceKey, source, origin: { x: event.clientX, y: event.clientY }, slots, moved: false };
      event.stopPropagation();
      return true;
    },
    cancel,
    consumeClick(sourceKey: string): boolean {
      if (suppressedKey !== sourceKey) return false;
      clearSuppression(); return true;
    },
    dispose() {
      cancel(); clearSuppression();
      events?.removeEventListener('pointerdown', nextDown, true);
      events?.removeEventListener('pointermove', move, true);
      events?.removeEventListener('pointerup', up, true);
      events?.removeEventListener('pointercancel', interrupted, true);
      events?.removeEventListener('lostpointercapture', interrupted, true);
      events?.removeEventListener('keydown', key, true);
      events?.removeEventListener('blur', cancel);
      visibility?.removeEventListener('visibilitychange', hidden);
    },
  };
}
