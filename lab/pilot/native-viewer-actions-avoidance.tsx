import { useLayoutEffect } from 'react';
import type { NativeMaterialViewerRuntime } from './native-material-viewer-types';

const ROOT = '[data-lcos-native-viewer-owner]';
const ACTIONS = '[data-lcos-native-viewer-actions="text"]';
const TOAST = '[data-sonner-toaster] [data-sonner-toast]';
const TOASTER = '[data-sonner-toaster],[data-sonner-toast]';
const LIFT = '--lcos-native-viewer-actions-lift';
type Box = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>;
type Owner = { sessionId: string; requestKey: number };
const equalOwner = (a: Owner | undefined, b: Owner | undefined) => !!a && !!b && a.sessionId === b.sessionId && a.requestKey === b.requestKey;
function currentOwner(runtime: NativeMaterialViewerRuntime): Owner | undefined {
  const state = runtime.getState(), requestKey = state.session?.lcosControlled?.requestKey;
  return ['open', 'opening', 'closing'].includes(state.phase) && state.session && Number.isFinite(requestKey)
    ? { sessionId: state.session.id, requestKey: requestKey! } : undefined;
}

/** Current rect + this owner's already-applied lift recovers the native
 * bottom-7 rect. The original native CSS owns its size, placement and motion. */
export function nativeViewerActionsLift(actions: Box, toasts: readonly Box[], appliedLift: number): number {
  if (![actions.left, actions.right, actions.top, actions.bottom, appliedLift].every(Number.isFinite) || actions.width <= 0 || actions.height <= 0) return 0;
  const top = actions.top + appliedLift, bottom = actions.bottom + appliedLift;
  const relevant = toasts.filter(toast => [toast.left, toast.right, toast.top, toast.bottom].every(Number.isFinite) && toast.width > 0 && toast.height > 0
    && toast.left < actions.right && toast.right > actions.left).sort((a, b) => b.top - a.top);
  let required = 0;
  // Monotone candidate movement: a lower notification can move the native
  // bar into an upper stacked toast, so test the resulting rect again there.
  for (const toast of relevant) {
    const candidateTop = top - required, candidateBottom = bottom - required;
    if (candidateBottom + 8 <= toast.top || candidateTop >= toast.bottom + 8) continue;
    required = Math.max(required, bottom - toast.top + 8);
  }
  // If notifications consume the entire viewport, retain a reachable native
  // bar at the top instead of moving its original controls offscreen.
  return Math.max(0, Math.min(required, Math.max(0, top)));
}

/** Passive geometry on the existing controlled Viewer root. No second bar,
 * notice renderer, global state, event routing, animation or domain writer. */
export function attachNativeViewerActionsAvoidance(runtime: NativeMaterialViewerRuntime, documentRef: Document = document) {
  const view = documentRef.defaultView;
  if (!view) return { dispose() {} };
  let active = true, frame: number | undefined;
  let applied: { root: HTMLElement; owner: Owner; lift: number; previous: string; priority: string } | undefined;
  const observed = new Set<Element>();
  const clear = () => {
    if (!applied) return;
    const old = applied; applied = undefined;
    if (old.root.style.getPropertyValue(LIFT) !== `${old.lift}px`) return;
    if (old.previous) old.root.style.setProperty(LIFT, old.previous, old.priority);
    else old.root.style.removeProperty(LIFT);
  };
  const schedule = () => { if (active && frame === undefined) frame = view.requestAnimationFrame(measure); };
  const resize = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(schedule) : null;
  const visible = (element: Element) => {
    if (!element.isConnected || !element.getClientRects().length || element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) return false;
    const style = view.getComputedStyle(element), rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && Number(style.opacity) !== 0
      && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < view.innerWidth && rect.bottom > 0 && rect.top < view.innerHeight;
  };
  const observe = (elements: readonly Element[]) => {
    const next = new Set(elements);
    for (const element of observed) if (!next.has(element)) { resize?.unobserve(element); observed.delete(element); }
    for (const element of next) if (!observed.has(element)) { resize?.observe(element); observed.add(element); }
  };
  function measure() {
    frame = undefined; if (!active) return;
    const owner = currentOwner(runtime);
    const roots = owner ? [...documentRef.querySelectorAll<HTMLElement>(ROOT)].filter(root => root.getAttribute('data-lcos-native-viewer-owner') === String(owner.requestKey)) : [];
    const root = roots.length === 1 ? roots[0] : undefined, actions = root?.querySelector<HTMLElement>(ACTIONS);
    if (!owner || !root || !actions) { clear(); observe([]); return; }
    if (applied && (!equalOwner(applied.owner, owner) || applied.root !== root)) clear();
    // Preserve this exact session's reservation through the original finite
    // exit. Re-measuring its animated translate would counteract native motion.
    if (runtime.getState().phase === 'closing') { observe([]); return; }
    const toasts = [...documentRef.querySelectorAll<HTMLElement>(TOAST)];
    observe([root, actions, ...toasts]);
    if (!visible(actions)) { clear(); return; }
    // Layout owns the reservation; the existing Framer translate owns its
    // enter/exit motion. Measuring that animated y as layout would cancel the
    // original18→0 slide by continuously changing lift93→75 underneath it.
    const physical = actions.getBoundingClientRect(), transform = view.getComputedStyle(actions).transform;
    let motionY = 0;
    if (transform && transform !== 'none') {
      try { motionY = new view.DOMMatrixReadOnly(transform).m42; } catch { return; }
      if (!Number.isFinite(motionY)) return;
    }
    const layout = { left: physical.left, right: physical.right, width: physical.width, height: physical.height,
      top: physical.top - motionY, bottom: physical.bottom - motionY };
    const measuredLift = nativeViewerActionsLift(layout, toasts.filter(visible).map(toast => toast.getBoundingClientRect()), applied?.lift ?? 0);
    // DOM rects and transform matrices quantize independently. Snap this
    // layout preference to a real display pixel so a settled native animation
    // cannot feed fractional75.001→75.002 adjustments back into itself.
    const pixelRatio = Number.isFinite(view.devicePixelRatio) && view.devicePixelRatio > 0 ? view.devicePixelRatio : 1;
    const lift = Math.round(measuredLift * pixelRatio) / pixelRatio;
    if (lift <= 0) clear();
    else {
      if (!applied) applied = { root, owner, lift, previous: root.style.getPropertyValue(LIFT), priority: root.style.getPropertyPriority(LIFT) };
      if (applied.lift !== lift || root.style.getPropertyValue(LIFT) !== `${lift}px`) { applied.lift = lift; root.style.setProperty(LIFT, `${lift}px`); }
    }
    // Follow actual finite native entry/exit animations. Decorative infinite
    // loops are irrelevant and never keep this observer's RAF alive.
    if ([actions, ...toasts].some(element => element.getAnimations?.({ subtree: true }).some(animation => animation.playState === 'running'
      && animation.effect?.getTiming().iterations !== Infinity))) schedule();
  }
  const relevant = (node: Node | null, descendants = false) => {
    if (!(node instanceof view.Element)) return false;
    return !!node.closest(`${ROOT},${TOASTER}`) || descendants && !!node.querySelector(`${ROOT},${TOASTER}`);
  };
  const mutation = new view.MutationObserver(records => {
    if (records.some(record => {
      // This adapter's own root variable must not feed another measurement.
      // Real bar/root size changes still arrive through ResizeObserver.
      if (record.type === 'attributes' && record.target === applied?.root && record.attributeName === 'style') return false;
      return relevant(record.target) || [...record.addedNodes, ...record.removedNodes].some(node => relevant(node, true));
    })) schedule();
  });
  mutation.observe(documentRef.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-visible', 'data-mounted', 'data-removed', 'data-y-position', 'data-x-position', 'data-lcos-native-viewer-owner', 'data-lcos-native-viewer-actions'] });
  const transition = (event: Event) => { if (relevant(event.target as Node | null)) schedule(); };
  const release = runtime.subscribe(() => {
    if (applied && !equalOwner(applied.owner, currentOwner(runtime))) clear();
    schedule();
  });
  view.addEventListener('resize', schedule); documentRef.addEventListener('scroll', schedule, true);
  documentRef.addEventListener('transitionend', transition, true); documentRef.addEventListener('animationend', transition, true);
  measure();
  return { dispose() {
    if (!active) return; active = false; if (frame !== undefined) view.cancelAnimationFrame(frame);
    clear(); release(); resize?.disconnect(); observed.clear(); mutation.disconnect();
    view.removeEventListener('resize', schedule); documentRef.removeEventListener('scroll', schedule, true);
    documentRef.removeEventListener('transitionend', transition, true); documentRef.removeEventListener('animationend', transition, true);
  } };
}

export function useNativeViewerActionsAvoidance(runtime: NativeMaterialViewerRuntime): void {
  useLayoutEffect(() => { const owner = attachNativeViewerActionsAvoidance(runtime); return () => owner.dispose(); }, [runtime]);
}
