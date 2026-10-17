/** One viewport observer for all renderers; never a Canvas visibility/LOD truth store. */
const listeners = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;
export function observeGlythVisibility(element: Element, notify: (visible: boolean) => void): () => void {
  if (typeof IntersectionObserver !== 'function') { notify(true); return () => {}; }
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
  });
  listeners.set(element, notify);
  observer.observe(element);
  return () => {
    observer?.unobserve(element);
    listeners.delete(element);
    if (listeners.size === 0) { observer?.disconnect(); observer = undefined; }
  };
}
export function inspectGlythVisibility() { return { observed: listeners.size, observers: observer === undefined ? 0 : 1 }; }
