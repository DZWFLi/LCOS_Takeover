import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import './native-library-preview-layout.css';

type Box = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>;
export type NativeLibraryPreviewPadding = { top: number; right: number; bottom: number; left: number };
const CONTENT = 'native-library-notice-preview';
const TOAST = '[data-sonner-toaster] [data-sonner-toast]';
const baseline = (): NativeLibraryPreviewPadding => ({ top: 16, right: 16, bottom: 16, left: 16 });
/** Feed the existing Radix collision owner. No custom popup coordinates or
 * viewport/notification state is written here. */
export function nativeLibraryPreviewPadding(input: { viewportHeight: number; left: number; right: number;
  toasts: readonly Box[] }): NativeLibraryPreviewPadding {
  const result = baseline(), { viewportHeight, left, right } = input;
  if (![viewportHeight, left, right].every(Number.isFinite) || viewportHeight <= 0 || right <= left) return result;
  for (const box of input.toasts) if ([box.left, box.right, box.top, box.bottom, box.width, box.height].every(Number.isFinite)
    && box.width > 0 && box.height > 0 && box.right > left && box.left < right && box.bottom > 0 && box.top < viewportHeight)
    result.bottom = Math.max(result.bottom, Math.min(viewportHeight, viewportHeight - Math.max(0, box.top) + 8));
  return result;
}

/** Called only by one currently open qualified native row on narrow screens. */
export function attachNativeLibraryPreviewLayout(trigger: HTMLElement, onPadding: (padding: NativeLibraryPreviewPadding) => void) {
  const documentRef = trigger.ownerDocument, view = documentRef.defaultView;
  if (!view) return { dispose() {} };
  let active = true, frame: number | undefined;
  const observed = new Set<Element>();
  const schedule = () => { if (active && frame === undefined) frame = view.requestAnimationFrame(measure); };
  const resize = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(schedule) : null;
  const observe = (elements: readonly Element[]) => {
    const next = new Set(elements);
    for (const element of observed) if (!next.has(element)) { resize?.unobserve(element); observed.delete(element); }
    for (const element of next) if (!observed.has(element)) { resize?.observe(element); observed.add(element); }
  };
  const content = () => {
    const id = trigger.getAttribute('aria-controls');
    const element = id ? documentRef.getElementById(id) : null;
    return element?.classList.contains(CONTENT) ? element : null;
  };
  const visible = (element: Element) => {
    if (!element.isConnected || !element.getClientRects().length || element.closest('[hidden],[aria-hidden="true"]')) return false;
    const style = view.getComputedStyle(element), box = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && Number(style.opacity) !== 0
      && box.width > 0 && box.height > 0 && box.right > 0 && box.left < view.innerWidth && box.bottom > 0 && box.top < view.innerHeight;
  };
  function measure() {
    frame = undefined; if (!active) return;
    if (documentRef.hidden || !visible(trigger)) { onPadding(baseline()); observe([trigger]); return; }
    const popup = content(), target = popup && visible(popup) ? popup : trigger, box = target.getBoundingClientRect();
    const candidates = [...documentRef.querySelectorAll<HTMLElement>(TOAST)].filter(element => element.closest('[data-sonner-toaster]')?.getAttribute('data-y-position') === 'bottom');
    observe([trigger, ...(popup ? [popup] : []), ...candidates]);
    const padding = nativeLibraryPreviewPadding({ viewportHeight: view.innerHeight, left: box.left, right: box.right,
      toasts: candidates.filter(visible).map(element => element.getBoundingClientRect()) });
    const ratio = Number.isFinite(view.devicePixelRatio) && view.devicePixelRatio > 0 ? view.devicePixelRatio : 1;
    padding.bottom = Math.ceil(padding.bottom * ratio) / ratio;
    onPadding(padding);
    // Follow finite original entrance/exit movement, including an initially
    // transparent toast, then stop. Decorative infinite effects do not poll.
    if (candidates.some(element => element.getAnimations?.({ subtree: true }).some(animation => animation.playState === 'running'
      && animation.effect?.getTiming().iterations !== Infinity))) schedule();
  }
  const relevant = (node: Node | null, descendants = false) => node instanceof view.Element
    && (node === trigger || trigger.contains(node) || node === content() || !!node.closest('[data-sonner-toaster],.' + CONTENT)
      || descendants && (node.contains(trigger) || !!node.querySelector('[data-sonner-toaster],[data-sonner-toast],.' + CONTENT)));
  const mutation = new view.MutationObserver(records => {
    if (records.some(record => relevant(record.target, record.type === 'attributes')
      || [...record.addedNodes, ...record.removedNodes].some(node => relevant(node, true)))) schedule();
  });
  mutation.observe(documentRef.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'aria-controls', 'data-state', 'data-visible', 'data-mounted', 'data-removed'] });
  const transition = (event: Event) => { if (relevant(event.target as Node | null)) schedule(); };
  view.addEventListener('resize', schedule); documentRef.addEventListener('scroll', schedule, true);
  documentRef.addEventListener('visibilitychange', schedule); documentRef.addEventListener('transitionend', transition, true);
  documentRef.addEventListener('animationend', transition, true); measure();
  return { dispose() {
    if (!active) return; active = false; if (frame !== undefined) view.cancelAnimationFrame(frame);
    resize?.disconnect(); observed.clear(); mutation.disconnect(); view.removeEventListener('resize', schedule);
    documentRef.removeEventListener('scroll', schedule, true); documentRef.removeEventListener('visibilitychange', schedule);
    documentRef.removeEventListener('transitionend', transition, true); documentRef.removeEventListener('animationend', transition, true);
  } };
}

type Owner = { projectId?: string | null; canvasId?: string; api?: unknown };
export type NativeLibraryPreviewLayout = { triggerRef: RefObject<HTMLDivElement | null>;
  collisionPadding?: NativeLibraryPreviewPadding; contentClassName?: string };
export function useNativeLibraryPreviewLayout(open: boolean, owner: Owner): NativeLibraryPreviewLayout {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<NativeLibraryPreviewPadding>();
  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') { setLayout(old => old === undefined ? old : undefined); return; }
    let active = true, attached: ReturnType<typeof attachNativeLibraryPreviewLayout> | undefined;
    const media = window.matchMedia('(max-width: 700px)');
    const publish = (value: NativeLibraryPreviewPadding) => { if (active) setLayout(old => old
      && old.bottom === value.bottom && old.left === value.left && old.right === value.right && old.top === value.top ? old : value); };
    const update = () => {
      attached?.dispose(); attached = undefined; if (!active) return;
      if (!media.matches) { setLayout(old => old === undefined ? old : undefined); return; }
      publish(baseline()); if (triggerRef.current) attached = attachNativeLibraryPreviewLayout(triggerRef.current, publish);
    };
    update(); media.addEventListener('change', update);
    return () => { active = false; attached?.dispose(); media.removeEventListener('change', update); };
  }, [open, owner.projectId, owner.canvasId, owner.api]);
  return { triggerRef, collisionPadding: open ? layout : undefined, contentClassName: open && layout ? CONTENT : undefined };
}
