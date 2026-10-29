import { useLayoutEffect } from 'react';

const FRAME = '[data-lcos-native-chat-frame]';
const CANVAS = '[data-canvas-container]';
const TOAST = '[data-sonner-toaster] [data-sonner-toast]';
const TOASTER = '[data-sonner-toaster],[data-sonner-toast]';
const BOTTOM = '--lcos-native-chat-notice-bottom';
const HEIGHT = '--lcos-native-chat-panel-height';
type Box = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>;

/** Presentation only: the original bottom-half frame keeps one Composer and
 * one scroll slot. Reserve the actual lower notice region, including the gap
 * below it; a tall draft's real main bubble can request more original space. */
export function nativeChatNoticeLayout(input: { viewportHeight: number; left: number; right: number;
  coreHeight: number; toasts: readonly Box[] }): { bottom: number; height: number; canvasHeight: number } {
  const { viewportHeight: viewport, left, right, coreHeight } = input;
  if (![viewport, left, right, coreHeight].every(Number.isFinite) || viewport <= 0 || right <= left)
    return { bottom: 0, height: 0, canvasHeight: 0 };
  const top = input.toasts.filter(box => [box.left, box.right, box.top, box.bottom].every(Number.isFinite)
    && box.width > 0 && box.height > 0 && box.right > left && box.left < right && box.bottom > 0 && box.top < viewport)
    .reduce((value, box) => Math.min(value, Math.max(0, box.top)), viewport + 8);
  const bottom = Math.max(0, Math.min(viewport, viewport - top + 8));
  const height = Math.max(0, Math.min(520, viewport - bottom, Math.max(Math.min(viewport / 2, 520), coreHeight)));
  return { bottom, height, canvasHeight: Math.max(0, viewport - bottom - height) };
}
const pixels = (value: string) => { const number = Number.parseFloat(value); return Number.isFinite(number) ? number : 0; };

export function attachNativeChatNoticeAvoidance(documentRef: Document = document) {
  const view = documentRef.defaultView;
  if (!view) return { dispose() {} };
  let active = true, frame: number | undefined;
  type Applied = { parent: HTMLElement; chat: HTMLElement; canvas: HTMLElement; values: Map<string, { before: string; priority: string; written: string }> };
  let applied: Applied | undefined;
  const observed = new Set<Element>();
  const clear = () => {
    const old = applied; applied = undefined; if (!old) return;
    for (const [key, value] of old.values) if (old.parent.style.getPropertyValue(key) === value.written) {
      if (value.before) old.parent.style.setProperty(key, value.before, value.priority); else old.parent.style.removeProperty(key);
    }
  };
  const schedule = () => { if (active && frame === undefined) frame = view.requestAnimationFrame(measure); };
  const resize = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(schedule) : null;
  const observe = (elements: readonly Element[]) => {
    const next = new Set(elements);
    for (const element of observed) if (!next.has(element)) { resize?.unobserve(element); observed.delete(element); }
    for (const element of next) if (!observed.has(element)) { resize?.observe(element); observed.add(element); }
  };
  const visible = (element: Element) => {
    if (!element.isConnected || !element.getClientRects().length || element.closest('[hidden],[aria-hidden="true"]')
      || element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) return false;
    const style = view.getComputedStyle(element), rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && Number(style.opacity) !== 0
      && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < view.innerWidth && rect.bottom > 0 && rect.top < view.innerHeight;
  };
  const vertical = (element: Element, margin = true) => {
    const style = view.getComputedStyle(element);
    return pixels(style.paddingTop) + pixels(style.paddingBottom) + pixels(style.borderTopWidth) + pixels(style.borderBottomWidth)
      + (margin ? pixels(style.marginTop) + pixels(style.marginBottom) : 0);
  };
  const write = (key: string, value: number) => {
    if (!applied) return;
    const next = `${value}px`, old = applied.values.get(key);
    if (!old) applied.values.set(key, { before: applied.parent.style.getPropertyValue(key), priority: applied.parent.style.getPropertyPriority(key), written: next });
    else old.written = next;
    if (applied.parent.style.getPropertyValue(key) !== next) applied.parent.style.setProperty(key, next);
  };
  const media = view.matchMedia('(max-width: 640px)');
  function measure() {
    frame = undefined; if (!active) return;
    if (!media.matches || documentRef.hidden) { clear(); observe([]); return; }
    const chats = [...documentRef.querySelectorAll<HTMLElement>(FRAME)].filter(element => {
      if (!element.isConnected || element.closest('[hidden],[aria-hidden="true"]') || !element.getClientRects().length) return false;
      const style = view.getComputedStyle(element);
      // Our own available-height clamp may legitimately allocate zero. That
      // is congestion, not a closed owner; clearing here would alternate zero
      // and50dvh on every ResizeObserver callback.
      return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
    });
    const chat = chats.length === 1 ? chats[0] : undefined, parent = chat?.parentElement;
    const canvases = chat && parent ? [...parent.children].filter((element): element is HTMLElement => element instanceof view.HTMLElement
      && element.matches(CANVAS) && !!(element.compareDocumentPosition(chat) & 4)) : [];
    const canvas = canvases.length === 1 ? canvases[0] : undefined;
    if (!chat || !parent || !canvas) { clear(); observe([]); return; }
    if (applied && (applied.chat !== chat || applied.parent !== parent || applied.canvas !== canvas)) clear();
    const inner = chat.firstElementChild, header = chat.querySelector<HTMLElement>('[data-lcos-native-chat-header]');
    const slot = inner ? [...inner.children].find((element): element is HTMLElement => element instanceof view.HTMLElement
      && element.classList.contains('relative') && element.classList.contains('z-10')) : undefined;
    const bubble = slot?.querySelector<HTMLElement>('[data-canvas-input-bubble]');
    let coreHeight = header ? header.getBoundingClientRect().height + pixels(view.getComputedStyle(header).marginTop) + pixels(view.getComputedStyle(header).marginBottom) : 0;
    coreHeight += vertical(chat, false) + (inner ? vertical(inner, false) : 0);
    if (slot && bubble) {
      const bubbleStyle = view.getComputedStyle(bubble);
      coreHeight += bubble.getBoundingClientRect().height + pixels(bubbleStyle.marginTop) + pixels(bubbleStyle.marginBottom) + vertical(slot, false);
      for (let element = bubble.parentElement; element && element !== slot; element = element.parentElement) coreHeight += vertical(element);
    }
    const toasts = [...documentRef.querySelectorAll<HTMLElement>(TOAST)].filter(element => {
      const edge = element.closest('[data-sonner-toaster]')?.getAttribute('data-y-position');
      return edge === 'bottom' && visible(element);
    });
    observe([parent, chat, canvas, ...(header ? [header] : []), ...(slot ? [slot] : []), ...(bubble ? [bubble] : []), ...toasts]);
    const rect = chat.getBoundingClientRect(), layout = nativeChatNoticeLayout({ viewportHeight: view.innerHeight,
      left: rect.left, right: rect.right, coreHeight, toasts: toasts.map(element => element.getBoundingClientRect()) });
    const ratio = Number.isFinite(view.devicePixelRatio) && view.devicePixelRatio > 0 ? view.devicePixelRatio : 1;
    if (!applied) applied = { parent, chat, canvas, values: new Map() };
    // Round upward to keep the notice clearance and measured main bubble. The
    // result depends on real content/notice boxes, never our already-set height.
    write(BOTTOM, Math.ceil(layout.bottom * ratio) / ratio);
    write(HEIGHT, Math.floor(layout.height * ratio) / ratio);
    if (toasts.some(element => element.getAnimations?.({ subtree: true }).some(animation => animation.playState === 'running'
      && animation.effect?.getTiming().iterations !== Infinity))) schedule();
  }
  const relevant = (node: Node | null, descendants = false) => node instanceof view.Element
    && (!!node.closest(`${FRAME},${TOASTER}`) || node === applied?.parent || node === applied?.canvas
      || descendants && !!node.querySelector(`${FRAME},${CANVAS},${TOASTER}`));
  const mutation = new view.MutationObserver(records => {
    if (records.some(record => {
      if (record.type === 'attributes' && record.target === applied?.parent && record.attributeName === 'style') return false;
      return relevant(record.target, record.type === 'attributes' && ['hidden', 'aria-hidden'].includes(record.attributeName ?? '')) || [...record.addedNodes, ...record.removedNodes].some(node => relevant(node, true));
    })) schedule();
  });
  mutation.observe(documentRef.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-visible', 'data-mounted', 'data-removed', 'data-y-position', 'data-x-position'] });
  const transition = (event: Event) => { if (relevant(event.target as Node | null)) schedule(); };
  media.addEventListener('change', schedule); view.addEventListener('resize', schedule); documentRef.addEventListener('scroll', schedule, true);
  documentRef.addEventListener('visibilitychange', schedule); documentRef.addEventListener('transitionend', transition, true); documentRef.addEventListener('animationend', transition, true);
  measure();
  return { dispose() {
    if (!active) return; active = false; if (frame !== undefined) view.cancelAnimationFrame(frame);
    clear(); resize?.disconnect(); observed.clear(); mutation.disconnect(); media.removeEventListener('change', schedule);
    view.removeEventListener('resize', schedule); documentRef.removeEventListener('scroll', schedule, true); documentRef.removeEventListener('visibilitychange', schedule);
    documentRef.removeEventListener('transitionend', transition, true); documentRef.removeEventListener('animationend', transition, true);
  } };
}

export function useNativeChatNoticeAvoidance(open: boolean, owner: { projectId?: string | null; canvasId?: string; api?: unknown }): void {
  useLayoutEffect(() => {
    if (!open) return;
    const observer = attachNativeChatNoticeAvoidance(); return () => observer.dispose();
  }, [open, owner.projectId, owner.canvasId, owner.api]);
}
