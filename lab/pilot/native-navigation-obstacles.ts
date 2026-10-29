import { projectNativeNavigationMarker, type NavigationRect, type NativeNavigationMarker } from './native-navigation-geometry.ts';

// These are actual shipped/installed Canvas owners. The Canvas node selector
// scopes material reads; document-level Library/Popover text is never material.
export const NATIVE_NAVIGATION_CHROME_SELECTOR = [
  '.canvas-header-chrome', '[data-lcos-surface-dock]', '[data-lcos-native-collapsed-assistant]',
  '[data-testid="canvas-dockbar-container"]', '[data-library-view="library"]', '[data-lcos-native-chat-frame]',
  '[data-pile-gallery-chrome="bottom-left"]', '[data-pile-gallery-chrome="top-right"]', '[data-pile-gallery-chrome="left"]',
  '.react-flow__node-toolbar', '.react-flow__controls', '[data-testid="rf__minimap"]', '.react-flow__minimap',
  '[data-state="open"][role="dialog"]', '[data-state="open"][role="menu"]', '[data-sonner-toaster] [data-sonner-toast]',
  '.native-navigation-feedback',
].join(',');
export const NATIVE_NAVIGATION_MATERIAL_TEXT_SELECTOR = [
  '.canvas-node-title', '.canvas-text-markdown', '[data-testid="canvas-node-text-content"]',
  '[data-lcos-native-text-body]', '[data-lcos-inline-text]', '.lcos-document-title', '[data-lcos-node-preview]',
  '.lcos-source-caption', '.lcos-document-source', '.lcos-text-outline-row', '.lcos-text-mindmap-root', '.lcos-text-mindmap-node',
].join(',');
const NODE_CONTROLS = 'button,input,textarea,[role="button"],[data-floating-chrome]';
const finiteRect = (r: NavigationRect | undefined): r is NavigationRect => !!r
  && [r.left, r.top, r.right, r.bottom, r.right - r.left, r.bottom - r.top].every(Number.isFinite) && r.right > r.left && r.bottom > r.top;
const rect = (r: DOMRect | DOMRectReadOnly): NavigationRect => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
function intersection(a: NavigationRect, b: NavigationRect): NavigationRect | undefined {
  const value = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
  return finiteRect(value) ? value : undefined;
}
const clips = (overflow: string | undefined) => /^(auto|scroll|hidden|clip|overlay)$/.test(overflow ?? '');

export type NativeNavigationObstacles = {
  rects: NavigationRect[];
  /** Observe these existing owners for resize/scroll/visibility changes. */
  elements: Element[];
  /** A failed DOM measurement is distinct from empty material content. */
  unmeasured: Element[];
};

/** Read visible text runs/lines, not whole material cards or per-character boxes.
 * Geometry remains the actual DOM; unused card whitespace stays available.
 * Call again after the original camera/DOM/scroll/resize owners change. */
export function readNativeNavigationObstacles(document: Document, input: {
  safeRect: NavigationRect; pane?: Element | null;
}): NativeNavigationObstacles {
  const output: NativeNavigationObstacles = { rects: [], elements: [], unmeasured: [] };
  const pane = input.pane ?? document.querySelector('.react-flow');
  if (!pane || !finiteRect(input.safeRect)) return output;
  const paneRect = rect(pane.getBoundingClientRect()), canvas = intersection(input.safeRect, paneRect);
  if (!canvas) return output;
  const observed = new Set<Element>(), failed = new Set<Element>(), measuredText = new Set<Node>(), dedup = new Set<string>();
  const view = document.defaultView;
  const style = (element: Element) => view?.getComputedStyle(element);
  const observe = (element: Element) => { observed.add(element); };
  const isVisible = (element: Element): boolean => {
    if (element.closest('.native-navigation-marker,.native-navigation-halos')) return false;
    if (element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) return false;
    for (let current: Element | null = element; current; current = current.parentElement) {
      if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return false;
      const s = style(current);
      if (s?.display === 'none' || s?.visibility === 'hidden' || s?.visibility === 'collapse' || s?.opacity === '0'
        || s?.contentVisibility === 'hidden') return false;
    }
    return true;
  };
  const clip = (value: NavigationRect, element: Element, limit: NavigationRect): NavigationRect | undefined => {
    let visible = intersection(value, limit);
    for (let current: Element | null = element; visible && current; current = current.parentElement) {
      const s = style(current), x = clips(s?.overflowX || s?.overflow), y = clips(s?.overflowY || s?.overflow);
      if (!x && !y) continue;
      observe(current);
      const box = current.getBoundingClientRect(), html = current as HTMLElement;
      // client dimensions exclude borders/scrollbars; account for the original
      // Canvas CSS transform when converting that padding box to screen pixels.
      const sx = html.offsetWidth > 0 ? box.width / html.offsetWidth : 1;
      const sy = html.offsetHeight > 0 ? box.height / html.offsetHeight : 1;
      const left = box.left + (html.clientLeft || 0) * sx, top = box.top + (html.clientTop || 0) * sy;
      const right = typeof html.clientWidth === 'number' ? left + html.clientWidth * sx : box.right;
      const bottom = typeof html.clientHeight === 'number' ? top + html.clientHeight * sy : box.bottom;
      visible = intersection(visible, { left: x ? left : limit.left, right: x ? right : limit.right,
        top: y ? top : limit.top, bottom: y ? bottom : limit.bottom });
    }
    return visible;
  };
  const add = (value: NavigationRect, element: Element, limit = canvas) => {
    if (!finiteRect(value)) return;
    const visible = clip(value, element, limit); if (!visible) return;
    const key = [visible.left, visible.top, visible.right, visible.bottom].join(':');
    if (!dedup.has(key)) { dedup.add(key); output.rects.push(visible); }
  };
  for (const element of document.querySelectorAll(NATIVE_NAVIGATION_CHROME_SELECTOR)) {
    const owner = element.closest('.react-flow'); if (owner && owner !== pane) continue;
    if (!isVisible(element)) continue;
    observe(element);
    const value = rect(element.getBoundingClientRect());
    // The existing visibleCanvas owner already reserves full Library/chat
    // side panels. Keep nearby original controls (notably fH rail) at their
    // actual boxes, including its existing 4px gap beyond the safe boundary.
    if (element.matches('[data-library-view="library"],[data-lcos-native-chat-frame]') && !intersection(value, canvas)) continue;
    add(value, element, paneRect);
  }
  for (const node of pane.querySelectorAll('.react-flow__node')) {
    if (node.closest('.react-flow') !== pane || !isVisible(node)) continue;
    for (const element of node.querySelectorAll(NODE_CONTROLS)) {
      if (!isVisible(element)) continue;
      observe(element); add(rect(element.getBoundingClientRect()), element);
    }
    for (const root of node.querySelectorAll(NATIVE_NAVIGATION_MATERIAL_TEXT_SELECTOR)) {
      if (!isVisible(root)) continue;
      observe(root);
      try {
        // One Range per text node returns its actual wrapped line fragments.
        // No per-character measurement and no full body rectangle fallback.
        const walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */);
        for (let text = walker.nextNode(); text; text = walker.nextNode()) {
          if (measuredText.has(text) || !text.textContent?.trim() || !text.parentElement || !isVisible(text.parentElement)) continue;
          measuredText.add(text);
          const range = document.createRange();
          try { range.selectNodeContents(text); for (const value of range.getClientRects()) add(rect(value), text.parentElement); }
          finally { range.detach?.(); }
        }
      } catch { failed.add(root); }
    }
  }
  output.elements = [...observed]; output.unmeasured = [...failed];
  return output;
}

export type NativeNavigationUnplaced = { id: string; reason: 'blocked' | 'insufficient-space' | 'geometry-unavailable' };
/** Keep every known target accounted for. The existing directory can visibly
 * carry unplaced IDs/count; never interpret a missing edge slot as no marker. */
export function layoutNativeNavigationMarkers(input: {
  targets: readonly { id: string; targetRect: NavigationRect; previousPhase?: 'local' | 'edge'; previousMarker?: NativeNavigationMarker }[];
  safeRect: NavigationRect; obstacles: readonly NavigationRect[];
}): { markers: NativeNavigationMarker[]; unplaced: NativeNavigationUnplaced[]; blockedIds: string[]; forbiddenRects: NavigationRect[] } {
  const markers: NativeNavigationMarker[] = [], unplaced: NativeNavigationUnplaced[] = [], seen = new Set<string>();
  const forbiddenRects = input.obstacles.filter(finiteRect).map(value => ({ ...value }));
  for (const target of input.targets) {
    if (seen.has(target.id)) continue;
    seen.add(target.id);
    const value = projectNativeNavigationMarker({ ...target, safeRect: input.safeRect, obstacles: forbiddenRects });
    if (value) { markers.push(value); continue; }
    const valid = typeof target.id === 'string' && !!target.id.trim() && finiteRect(target.targetRect) && finiteRect(input.safeRect);
    const reason = !valid ? 'geometry-unavailable' : input.safeRect.right - input.safeRect.left < 44 || input.safeRect.bottom - input.safeRect.top < 44
      ? 'insufficient-space' : 'blocked';
    unplaced.push({ id: target.id, reason });
  }
  return { markers, unplaced, blockedIds: unplaced.map(row => row.id), forbiddenRects };
}
