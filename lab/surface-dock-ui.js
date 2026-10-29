// This view receives the donor page's own React namespace and JSX runtime.
// It deliberately does not import React, ReactFlow, a navigation store, or a router.
const SURFACES = Object.freeze([
  { key: 'main', label: 'Main', glyph: 'root' },
  { key: 'context', label: 'Context', glyph: 'context' },
  { key: 'workflow', label: 'Workflow', glyph: 'workflow' },
]);

// An ephemeral callback port, not another router or a persistent navigation store.
// Both the existing Dock and the material Rail delegate to the original Ke producer.
let surfaceSelectionOwner = null;
export function installNativeSurfaceSelection(owner) {
  if (!owner || typeof owner.projectId !== 'string' || !owner.projectId.trim()
    || typeof owner.currentCanvasId !== 'string' || typeof owner.onSelect !== 'function'
    || !(owner.surfaces instanceof Map)) throw new TypeError('An exact original Surface selection owner is required.');
  const registration = { ...owner };
  surfaceSelectionOwner = registration;
  return () => { if (surfaceSelectionOwner === registration) surfaceSelectionOwner = null; };
}
export async function requestNativeSurfaceSelection({ projectId, sourceCanvasId, targetCanvasId }) {
  const owner = surfaceSelectionOwner;
  if (!owner || owner.projectId !== projectId || owner.currentCanvasId !== sourceCanvasId) {
    throw new Error('原现场切换入口已变化；未另开路由。');
  }
  if (owner.disabled) throw new Error('原画布正忙，请稍后明确重试。');
  if (![...owner.surfaces.values()].some(row => row.canvasId === targetCanvasId)) {
    throw new Error('目标不属于当前 Core 工作现场。');
  }
  if (targetCanvasId === sourceCanvasId) return { delegated: false, sameCanvas: true };
  await owner.onSelect({ id: targetCanvasId });
  // Ke may reject its flush/preflight. Only the arrival observer may claim success.
  return { delegated: true, sameCanvas: false };
}

// Path data copied from the existing GN2 FigmaShellGlyph root/context/workflow SVGs.
const GLYPH_PATHS = Object.freeze({
  root: [
    'M15.7502 3.675H5.2502C3.94542 3.675 2.8877 4.73273 2.8877 6.0375V14.9625C2.8877 16.2673 3.94542 17.325 5.2502 17.325H15.7502C17.055 17.325 18.1127 16.2673 18.1127 14.9625V6.0375C18.1127 4.73273 17.055 3.675 15.7502 3.675Z',
    'M2.8877 8.1375H18.1127',
  ],
  context: [
    'M10.5 13.125C11.9497 13.125 13.125 11.9497 13.125 10.5C13.125 9.05025 11.9497 7.875 10.5 7.875C9.05025 7.875 7.875 9.05025 7.875 10.5C7.875 11.9497 9.05025 13.125 10.5 13.125Z',
    'M3.9376 6.3C4.95242 6.3 5.7751 5.47732 5.7751 4.4625C5.7751 3.44768 4.95242 2.625 3.9376 2.625C2.92277 2.625 2.1001 3.44768 2.1001 4.4625C2.1001 5.47732 2.92277 6.3 3.9376 6.3Z',
    'M17.0626 6.3C18.0774 6.3 18.9001 5.47732 18.9001 4.4625C18.9001 3.44768 18.0774 2.625 17.0626 2.625C16.0478 2.625 15.2251 3.44768 15.2251 4.4625C15.2251 5.47732 16.0478 6.3 17.0626 6.3Z',
    'M17.0626 18.375C18.0774 18.375 18.9001 17.5523 18.9001 16.5375C18.9001 15.5227 18.0774 14.7 17.0626 14.7C16.0478 14.7 15.2251 15.5227 15.2251 16.5375C15.2251 17.5523 16.0478 18.375 17.0626 18.375Z',
    'M5.38135 5.90625L8.6626 8.79375M15.6188 5.90625L12.3376 8.79375M15.6188 15.0938L12.4688 12.3375',
  ],
  workflow: [
    'M6.43106 3.28125H3.6748C2.94993 3.28125 2.3623 3.86888 2.3623 4.59375V6.16875C2.3623 6.89362 2.94993 7.48125 3.6748 7.48125H6.43106C7.15593 7.48125 7.74356 6.89362 7.74356 6.16875V4.59375C7.74356 3.86888 7.15593 3.28125 6.43106 3.28125Z',
    'M17.3251 7.74374H14.5688C13.844 7.74374 13.2563 8.33137 13.2563 9.05624V10.6312C13.2563 11.3561 13.844 11.9437 14.5688 11.9437H17.3251C18.05 11.9437 18.6376 11.3561 18.6376 10.6312V9.05624C18.6376 8.33137 18.05 7.74374 17.3251 7.74374Z',
    'M6.43106 13.5187H3.6748C2.94993 13.5187 2.3623 14.1064 2.3623 14.8312V16.4062C2.3623 17.1311 2.94993 17.7187 3.6748 17.7187H6.43106C7.15593 17.7187 7.74356 17.1311 7.74356 16.4062V14.8312C7.74356 14.1064 7.15593 13.5187 6.43106 13.5187Z',
    'M7.74365 5.38126H9.9749C10.3196 5.38126 10.661 5.44915 10.9794 5.58107C11.2979 5.71299 11.5873 5.90635 11.8311 6.1501C12.0748 6.39385 12.2682 6.68323 12.4001 7.00171C12.532 7.32019 12.5999 7.66154 12.5999 8.00626V9.84376H13.2562M7.74365 15.6188H9.9749C10.3196 15.6188 10.661 15.5509 10.9794 15.4189C11.2979 15.287 11.5873 15.0937 11.8311 14.8499C12.0748 14.6062 12.2682 14.3168 12.4001 13.9983C12.532 13.6798 12.5999 13.3385 12.5999 12.9938V11.4188H13.2562',
  ],
});

function normalizeStatus(payload) {
  const status = payload && payload.data && typeof payload.data === 'object'
    ? payload.data : payload;
  if (!status || typeof status.projectId !== 'string' || !status.projectId.trim()
      || !Array.isArray(status.workspaces)) {
    throw new Error('现场状态格式无效');
  }

  const bySurface = new Map();
  for (const workspace of status.workspaces) {
    if (!workspace || typeof workspace !== 'object') continue;
    const surface = workspace.preferredSurface;
    if (!SURFACES.some((item) => item.key === surface)) continue;
    if (bySurface.has(surface)) throw new Error('现场映射不唯一');
    if (typeof workspace.id !== 'string' || !workspace.id.trim()
        || typeof workspace.canvasId !== 'string' || !workspace.canvasId.trim()
        || typeof workspace.name !== 'string' || !workspace.name.trim()) {
      throw new Error('现场信息不完整');
    }
    bySurface.set(surface, workspace);
  }

  if (bySurface.size !== SURFACES.length) throw new Error('三个一级现场尚未全部就绪');
  return bySurface;
}

function installDockStyles() {
  const documentRef = globalThis.document;
  if (!documentRef) return undefined;
  const root = documentRef.documentElement;
  root?.setAttribute('data-lcos-surface-dock-active', 'true');
  let ownedLink = false;
  if (!documentRef.querySelector('link[data-lcos-surface-dock-css]')) {
    const link = documentRef.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/surface-dock.css';
    link.setAttribute('data-lcos-surface-dock-css', '');
    documentRef.head?.append(link);
    ownedLink = true;
  }
  return () => {
    root?.removeAttribute('data-lcos-surface-dock-active');
    if (ownedLink) documentRef.querySelector('link[data-lcos-surface-dock-css]')?.remove();
  };
}

function renderGlyph(runtime, surface) {
  const paths = GLYPH_PATHS[surface.glyph] || [];
  return runtime.jsx('svg', {
    'data-lcos-figma-glyph': surface.glyph,
    'aria-hidden': 'true',
    focusable: 'false',
    viewBox: '0 0 21 21',
    className: 'lcos-surface-dock-glyph',
    children: paths.map((d, index) => runtime.jsx('path', {
      key: surface.glyph + '-' + index,
      d,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    })),
  });
}

function visibleScreenRect(element, viewport) {
  if (!element?.isConnected) return null;
  for (let ancestor = element; ancestor?.nodeType === 1; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (ancestor.hidden || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < .01) return null;
  }
  const rect = element.getBoundingClientRect();
  const left = Math.max(0, rect.left), right = Math.min(viewport.width, rect.right);
  const top = Math.max(0, rect.top), bottom = Math.min(viewport.height, rect.bottom);
  return right > left && bottom > top ? { left, right, top, bottom, width: right - left, height: bottom - top } : null;
}

function visibleMiniMapRect(element, viewport, canvas, dock) {
  if (!canvas) return null;
  const measured = visibleScreenRect(element, viewport);
  if (!measured) return null;
  const left = Math.max(canvas.left, measured.left), right = Math.min(canvas.right, measured.right);
  const top = Math.max(canvas.top, measured.top), bottom = Math.min(canvas.bottom, measured.bottom);
  if (right <= left || bottom <= top) return null;
  // yBe's pointer surface is a sibling of the pointer-events-none SVG layer.
  // Ignore our own Dock when checking exposure: its current overlap is exactly
  // what this measurement resolves, and must not hide the obstacle from itself.
  const parent = element.parentElement?.parentElement;
  const surface = parent?.querySelector(':scope > div.cursor-grab') ? parent : element;
  const points = [[(left + right) / 2, (top + bottom) / 2], [left + 1, top + 1],
    [right - 1, top + 1], [left + 1, bottom - 1], [right - 1, bottom - 1]];
  if (!points.some(([x, y]) => {
    const hit = element.ownerDocument.elementsFromPoint(x, y).find(node => node !== dock && !dock.contains(node));
    return hit && surface.contains(hit);
  })) return null;
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

/** Screen-only placement from the original Canvas/chat DOM. It owns no
 * camera, route, canvas dimensions or saved presentation state. */
export function installSurfaceDockAvoidance(dock) {
  if (!dock?.ownerDocument?.body) return undefined;
  const documentRef = dock.ownerDocument;
  let frame = null, disposed = false, railOwner = null, assistantOwner = null;
  const observed = new Set();
  const schedule = () => {
    if (!disposed && frame === null) frame = requestAnimationFrame(measure);
  };
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  const write = (property, value) => {
    if (dock.style.getPropertyValue(property) !== value) dock.style.setProperty(property, value);
  };
  function measure() {
    frame = null;
    if (disposed || !dock.isConnected) return;
    const viewport = { width: innerWidth, height: innerHeight };
    const flow = documentRef.querySelector('.react-flow');
    const measuredCanvas = visibleScreenRect(flow, viewport);
    const canvas = measuredCanvas ?? { left: 0, top: 0, right: viewport.width, bottom: viewport.height, width: viewport.width, height: viewport.height };
    const panels = [...documentRef.querySelectorAll('[data-lcos-native-chat-frame]')];
    let right = canvas.right, availableBottom = canvas.bottom, bottomPanel = false;
    for (const panel of panels) {
      const rect = visibleScreenRect(panel, viewport);
      if (rect && panel.getAttribute('aria-hidden') !== 'true' && rect.left <= canvas.left + 24 && rect.right >= canvas.right - 24
        && rect.top > canvas.top && rect.top <= canvas.bottom + 1 && rect.bottom >= canvas.bottom - 24) {
        availableBottom = Math.min(availableBottom, rect.top); bottomPanel = true;
      }
      if (rect && rect.width >= 120 && rect.height >= 120 && rect.right >= canvas.right - 24 && rect.left > canvas.left) right = Math.min(right, rect.left);
    }
    const width = Math.max(0, right - canvas.left), gap = 12;
    // Preserve all three buttons when the original right pane is very wide.
    const compact = width < 350;
    const density = compact ? 'compact' : 'regular';
    if (dock.dataset.lcosSurfaceDockDensity !== density) dock.dataset.lcosSurfaceDockDensity = density;
    write('--lcos-dock-center', `${canvas.left + width / 2}px`);
    write('--lcos-dock-max-width', `${Math.max(156, width - gap * 2)}px`);
    let bottom = Math.max(24, viewport.height - availableBottom + 12, viewport.height - canvas.bottom + 24);
    const controls = [...documentRef.querySelectorAll('.react-flow__controls, .bg-tap-background-secondary, [data-sonner-toaster] [data-sonner-toast]')]
      .filter(element => !dock.contains(element) && (element.matches('[data-sonner-toast]') || element.querySelector('button[aria-label]')));
    const maps = [...documentRef.querySelectorAll('[data-testid="rf__minimap"]')];
    const own = dock.getBoundingClientRect(), dockWidth = own.width, dockHeight = own.height;
    const dockLeft = canvas.left + width / 2 - dockWidth / 2, dockRight = dockLeft + dockWidth;
    const rectangles = controls.map(element => visibleScreenRect(element, viewport))
      .filter(rect => rect && rect.height <= 100 && rect.top >= canvas.top + (availableBottom - canvas.top) * .6);
    for (const element of maps) {
      const rect = visibleMiniMapRect(element, viewport, measuredCanvas && right > canvas.left ? { ...canvas, right } : null, dock);
      if (rect) rectangles.push(rect);
    }
    // Start with the lowest obstacle. Raising above a map can meet a toast that
    // was earlier in DOM order; the same pass must clear that newly met row.
    rectangles.sort((a, b) => b.top - a.top);
    for (const rect of rectangles) {
      const dockTop = viewport.height - bottom - dockHeight;
      if (dockRight > rect.left - gap && dockLeft < rect.right + gap
        && viewport.height - bottom > rect.top - gap && dockTop < rect.bottom + gap) bottom = Math.max(bottom, viewport.height - rect.top + gap);
    }
    write('--lcos-dock-bottom', `${bottom}px`);
    // One-way layout: original controls -> Dock -> original MF. The Dock must
    // never treat MF as its own obstacle, or the two would chase each other up.
    // Measure the whole original row: UH is itself a button and has no nested
    // button[aria-label], so the older generic controls filter can miss it.
    const assistant = documentRef.querySelector('[data-lcos-native-collapsed-assistant]');
    if (assistantOwner !== assistant) { assistantOwner?.style.removeProperty('--lcos-native-assistant-bottom'); assistantOwner = assistant; }
    const bottomRows = [...documentRef.querySelectorAll('[data-pile-gallery-chrome="bottom-left"]')];
    const topChrome = [...documentRef.querySelectorAll('.canvas-header-chrome, [data-pile-gallery-chrome="top-right"], [data-pile-gallery-chrome="left"]')];
    const assistantRect = visibleScreenRect(assistant, viewport);
    const assistantParent = assistant?.offsetParent;
    if (assistantRect && measuredCanvas && right > canvas.left) {
      const parentRect = assistantParent?.getBoundingClientRect();
      const parentBottom = parentRect && Number.isFinite(parentRect.bottom)
        ? parentRect.bottom - (parseFloat(getComputedStyle(assistantParent).borderBottomWidth) || 0) : canvas.bottom;
      const assistantHeight = assistant.offsetHeight || assistantRect.height;
      let assistantBottom = Math.max(24, parentBottom - availableBottom + 24, parentBottom - canvas.bottom + 24);
      const obstacles = [...rectangles,
        ...[...bottomRows, ...topChrome].map(element => visibleScreenRect(element, viewport)).filter(Boolean),
        { left: dockLeft, right: dockRight, top: viewport.height - bottom - dockHeight, bottom: viewport.height - bottom }]
        .sort((a, b) => b.top - a.top);
      for (const rect of obstacles) {
        const top = parentBottom - assistantBottom - assistantHeight, lower = parentBottom - assistantBottom;
        if (assistantRect.right > rect.left - gap && assistantRect.left < rect.right + gap
          && lower > rect.top - gap && top < rect.bottom + gap)
          assistantBottom = Math.max(assistantBottom, parentBottom - rect.top + gap);
      }
      // Do not hide a working original control or shove it off Canvas. A screen
      // with no vertical slot keeps its original offset; the bounded no-space
      // limitation is explicitly covered/reported by the layout fixture.
      const fits = parentBottom - assistantBottom - assistantHeight >= canvas.top + gap;
      const value = `${fits ? assistantBottom : 24}px`;
      if (assistant.style.getPropertyValue('--lcos-native-assistant-bottom') !== value)
        assistant.style.setProperty('--lcos-native-assistant-bottom', value);
    } else assistant?.style.removeProperty('--lcos-native-assistant-bottom');

    // fH remains the sole left toolbar. In a half-screen canvas, let its own
    // pill scroll before it reaches this Dock, the original controls or map.
    const rail = documentRef.querySelector('[data-testid="canvas-dockbar-container"]');
    if (railOwner !== rail) { railOwner?.style.removeProperty('--lcos-native-rail-max-height'); railOwner = rail; }
    const railRect = rail && visibleScreenRect(rail, viewport);
    if (bottomPanel && viewport.width <= 640 && railRect) {
      let limit = availableBottom - gap;
      for (const rect of [...rectangles, { left: dockLeft, right: dockRight, top: viewport.height - bottom - dockHeight }]) {
        if (rect.top > railRect.top && railRect.right > rect.left - gap && railRect.left < rect.right + gap) limit = Math.min(limit, rect.top - gap);
      }
      const value = `${Math.max(48, limit - railRect.top)}px`;
      if (rail.style.getPropertyValue('--lcos-native-rail-max-height') !== value) rail.style.setProperty('--lcos-native-rail-max-height', value);
    } else rail?.style.removeProperty('--lcos-native-rail-max-height');
    const nextObserved = new Set([dock, flow, rail, assistant, assistantParent, ...panels, ...controls, ...maps, ...bottomRows, ...topChrome].filter(Boolean));
    for (const element of observed) if (!nextObserved.has(element)) { resize?.unobserve(element); observed.delete(element); }
    for (const element of nextObserved) if (!observed.has(element)) { resize?.observe(element); observed.add(element); }
  }
  const mutations = new MutationObserver(schedule);
  mutations.observe(documentRef.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'] });
  addEventListener('resize', schedule);
  documentRef.addEventListener('transitionend', schedule, true);
  documentRef.addEventListener('animationend', schedule, true);
  measure();
  return () => {
    disposed = true;
    railOwner?.style.removeProperty('--lcos-native-rail-max-height');
    assistantOwner?.style.removeProperty('--lcos-native-assistant-bottom');
    if (frame !== null) cancelAnimationFrame(frame);
    resize?.disconnect(); mutations.disconnect();
    removeEventListener('resize', schedule);
    documentRef.removeEventListener('transitionend', schedule, true);
    documentRef.removeEventListener('animationend', schedule, true);
  };
}

// Mounted beside the original TapNow header. Selection delegates to that page's
// existing Ke callback, preserving its flush, preflight, busy, and navigation path.
export function LCOSSurfaceDock({
  react, runtime, createPortal, currentCanvasId, onSelect, disabled = false,
}) {
  const [state, setState] = react.useState({ kind: 'loading', surfaces: null });
  const dockRef = react.useRef(null);

  const layoutEffect = react.useLayoutEffect || react.useEffect;
  layoutEffect(() => installDockStyles(), []);
  layoutEffect(() => installSurfaceDockAvoidance(dockRef.current), []);

  react.useEffect(() => {
    const controller = new AbortController();
    let live = true;
    globalThis.fetch('/api/surface-core/status', {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    }).then((response) => {
      if (!response.ok) throw new Error('现场状态暂不可用');
      return response.json();
    }).then((payload) => ({ projectId: (payload?.data ?? payload)?.projectId, surfaces: normalizeStatus(payload) })).then(({ projectId, surfaces }) => {
      if (live) setState({ kind: 'ready', projectId, surfaces });
    }).catch(() => {
      if (live) setState({ kind: 'error', surfaces: null });
    });
    return () => {
      live = false;
      controller.abort();
    };
  }, []);

  layoutEffect(() => {
    if (state.kind !== 'ready') return;
    return installNativeSurfaceSelection({ projectId: state.projectId, surfaces: state.surfaces,
      currentCanvasId, onSelect, disabled: Boolean(disabled) });
  }, [state, currentCanvasId, onSelect, disabled]);

  const children = state.kind === 'ready'
    ? runtime.jsxs('nav', {
      'aria-label': '工作现场',
      'data-lcos-dock-items': '',
      className: 'lcos-surface-dock-items',
      children: SURFACES.map((surface) => {
        const workspace = state.surfaces.get(surface.key);
        const selected = workspace.canvasId === currentCanvasId;
        return runtime.jsxs('button', {
          type: 'button',
          'data-lcos-surface': surface.key,
          'data-lcos-surface-active': selected ? 'true' : 'false',
          'aria-label': surface.label,
          'aria-pressed': selected,
          'aria-current': selected ? 'true' : undefined,
          'aria-busy': disabled ? 'true' : undefined,
          title: surface.label + ' · ' + workspace.name,
          disabled: Boolean(disabled),
          className: 'lcos-surface-dock-item',
          onClick: () => onSelect?.({ id: workspace.canvasId }),
          children: [
            renderGlyph(runtime, surface),
            runtime.jsx('span', { className: 'lcos-surface-dock-label', children: surface.label }),
          ],
        }, surface.key);
      }),
    })
    : runtime.jsx('div', {
      role: state.kind === 'error' ? 'alert' : 'status',
      'aria-live': 'polite',
      className: 'lcos-surface-dock-message',
      children: state.kind === 'error' ? '现场列表暂不可用' : '正在读取现场…',
    });

  const dock = runtime.jsx('div', {
    ref: dockRef,
    'data-lcos-surface-dock': '',
    'data-lcos-family': 'surface-dock',
    className: 'lcos-surface-dock-position',
    children: runtime.jsx('div', {
      className: 'lcos-dock-material lcos-soft-underlight',
      children: runtime.jsx('div', {
        className: 'lcos-soft-underlight-surface',
        children,
      }),
    }),
  });
  if (typeof createPortal !== 'function' || !globalThis.document?.body) return null;
  return createPortal(dock, globalThis.document.body);
}
