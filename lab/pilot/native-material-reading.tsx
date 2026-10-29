import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type UIEventHandler } from 'react';
import { createPortal } from 'react-dom';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { attachReaderScrollRestore } from '../../lcos/huabu/apps/web/src/lcos/professional/readerScrollRestore';
import { useReaderTextFeatures, type ReaderTextSection } from '../../lcos/huabu/apps/web/src/lcos/ui/professional/useReaderTextFeatures';
import type { MaterialSourceV1, MaterialTransferPayloadV1 } from '../../lcos/huabu/apps/web/src/lcos/ui/professional/donor/Gen1TextTransfer';
import type { NativeMaterialViewerParts } from './native-material-viewer-types';
import './native-material-viewer.css';
import { attachNativeTextLocationRestore, normalizeNativeTextLocator, readNativeTextSelection, resolveNativeTextLocation } from './native-text-location';

type NativeTextFeaturesInput = Parameters<typeof useReaderTextFeatures>[0] & { readonly selectionPayload?: () => MaterialTransferPayloadV1 | null;
  readonly onExcerptDragStart?: (payload: MaterialTransferPayloadV1, source: HTMLElement | null) => void };
const useNativeTextFeatures = useReaderTextFeatures as (input: NativeTextFeaturesInput) => ReturnType<typeof useReaderTextFeatures>;
export type NativeReadingMenu = { open: boolean; onOpenChange(open: boolean): void; content: ReactNode };

/** Original CT renders the document. Existing GEN1 selection/search/transfer
 * behavior is a content extension inside the original vZ text panel. */
export function NativeMaterialTextReading({ markdown, source, parts, onCiteSelection, onExcerptDragStart, dragNotice, actionsSelector, renderActions }: {
  markdown: string; source: MaterialSourceV1; parts: NativeMaterialViewerParts; onCiteSelection(payload: MaterialTransferPayloadV1): void | Promise<string>;
  onExcerptDragStart?: (payload: MaterialTransferPayloadV1, source: HTMLElement) => void; dragNotice?: string;
  actionsSelector?: string; renderActions?(menu: NativeReadingMenu): ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState<readonly ReaderTextSection[]>([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<HTMLElement | null>(null);
  const toolsContent = useRef<HTMLElement>(null);
  const prefix = `native-reading-${useId().replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const positionKey = JSON.stringify([source.projectId, source.artifactId, source.revisionId]);
  const [note, setNote] = useState<{ message: string; error?: boolean }>({ message: '' });
  const [locationState, setLocationState] = useState<{ status: string; message?: string }>({ status: 'none' });
  const [zoom, setZoom] = useState(() => useLcosShellStore.getState().readerPositions[positionKey]?.zoom ?? 100);
  const normalizedLocator = normalizeNativeTextLocator(source.locator);
  const locatorKey = source.locator === undefined ? 'none' : normalizedLocator ? JSON.stringify(normalizedLocator) : 'invalid';
  const ownerKey = JSON.stringify([positionKey, source.viewId, source.fileRecordId, locatorKey]);
  const mounted = useRef(true), searchFrame = useRef(0);
  const latest = useRef({ ownerKey, source, onCiteSelection }); latest.current = { ownerKey, source, onCiteSelection };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelAnimationFrame(searchFrame.current); }; }, []);
  const current = () => mounted.current && latest.current.ownerKey === ownerKey && latest.current.onCiteSelection === onCiteSelection && !!container.current?.isConnected;
  const selectionPayload = (): MaterialTransferPayloadV1 | null => current()
    ? readNativeTextSelection(container.current?.querySelector<HTMLElement>('.lcos-reader-measure') ?? null, source) : null;
  const features = useNativeTextFeatures({ containerRef: container, sections, prefix, source, selectionPayload,
    onExcerptDragStart: (payload, target) => { if (current() && target) onExcerptDragStart?.(payload, target); }, onCiteSelection: () => {
    const payload = selectionPayload();
    if (!payload) { if (current()) setNote({ message: '先选中这份正文再摘录，未加入其他位置。', error: true }); return; }
    // Capture synchronously from this exact Root, before an async callback or
    // another Reader/input can replace the displayed revision/selection.
    void Promise.resolve().then(() => current() ? onCiteSelection(payload) : undefined).then(value => {
      if (current() && value) setNote({ message: value });
    }).catch(error => { if (current()) setNote({ message: error instanceof Error ? error.message : '摘录暂未加入，所选正文保留。', error: true }); });
  } });
  const TextBody = parts.TextBody;
  // The original ActionBar owns the DOM slot, exactly as its MindMap editor.
  // Keep the reading hooks and More controls in one React owner via this portal.
  useLayoutEffect(() => {
    setActionTarget(null);
    if (!actionsSelector) return;
    const viewer = container.current?.closest('[data-media-viewer]');
    if (!viewer) return;
    const find = () => { const target = viewer.querySelector<HTMLElement>(actionsSelector);
      if (target) setActionTarget(target); return !!target; };
    if (find()) return;
    const observer = new MutationObserver(() => { if (find()) observer.disconnect(); });
    observer.observe(viewer, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [actionsSelector]);
  const focusSearch = () => {
    if (!current()) return;
    setToolsOpen(true); cancelAnimationFrame(searchFrame.current);
    searchFrame.current = requestAnimationFrame(() => {
      if (!current()) return;
      const input = (toolsContent.current ?? container.current?.parentElement)
        ?.querySelector<HTMLInputElement>('[aria-label="在文档中查找"]');
      input?.focus(); input?.select();
    });
  };
  useEffect(() => {
    if (!renderActions) return;
    const viewer = container.current?.closest('[data-media-viewer]');
    if (!viewer) return;
    const key = (event: Event) => { const input = event as KeyboardEvent;
      if ((input.ctrlKey || input.metaKey) && input.key.toLowerCase() === 'f' && current()) {
        input.preventDefault(); input.stopPropagation(); focusSearch();
      } };
    viewer.addEventListener('keydown', key, true);
    return () => viewer.removeEventListener('keydown', key, true);
  }, [renderActions, ownerKey, onCiteSelection]);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const headings = [...element.querySelectorAll<HTMLElement>('.lcos-reader-measure :is(h1,h2,h3,h4,h5,h6)')];
    const links = new Map<string, string>();
    setSections(headings.map((heading, index) => {
      const originalId = heading.dataset.nativeSourceId ?? heading.id;
      if (originalId) { heading.dataset.nativeSourceId = originalId; links.set(originalId, `${prefix}-section-${index}`); }
      heading.id = `${prefix}-section-${index}`;
      return { id: heading.id, label: heading.textContent?.trim() ?? '', depth: Number(heading.tagName.slice(1)) };
    }));
    element.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach(link => {
      const href = link.dataset.nativeSourceHref ?? link.getAttribute('href')!;
      link.dataset.nativeSourceHref = href;
      const target = links.get(href.slice(1)); if (target) link.setAttribute('href', '#' + target);
    });
    const saved = useLcosShellStore.getState().readerPositions[positionKey];
    if (source.locator === undefined) {
      setLocationState(value => value.status === 'none' ? value : { status: 'none' });
      const restore = attachReaderScrollRestore(element, saved?.scrollTop ?? 0);
      return () => { restore.dispose(); cancelAnimationFrame(searchFrame.current); };
    }
    setLocationState({ status: 'locating', message: '正在定位所选正文…' });
    const restore = attachNativeTextLocationRestore(element, () => {
      const root = element.querySelector<HTMLElement>('.lcos-reader-measure');
      return root ? resolveNativeTextLocation(root, source.locator, markdown)
        : { status: 'unavailable', message: '正文尚未准备好定位，阅读版本保留。' };
    }, { highlightName: `${prefix}-source-location`, isCurrent: () => current() && container.current === element,
      onUserCancel: () => { if (current()) setLocationState({ status: 'paused', message: '已停止自动定位，可继续阅读正文。' }); },
      onState: state => {
        if (!current()) return;
        const next = { status: state.status, ...('message' in state ? { message: state.message }
          : state.status === 'ready' ? { message: '已定位到所选正文。' } : {}) };
        setLocationState(previous => previous.status === next.status && previous.message === next.message ? previous : next);
      } });
    return () => { restore.dispose(); cancelAnimationFrame(searchFrame.current); };
  }, [markdown, positionKey, prefix, locatorKey, onCiteSelection]);
  useLayoutEffect(() => { setZoom(useLcosShellStore.getState().readerPositions[positionKey]?.zoom ?? 100); setNote({ message: '' }); setToolsOpen(false); }, [positionKey, onCiteSelection]);
  const onScroll: UIEventHandler<HTMLDivElement> = () => {
    const store = useLcosShellStore.getState();
    store.rememberReaderPosition(positionKey, { scrollTop: container.current?.scrollTop ?? 0,
      zoom: store.readerPositions[positionKey]?.zoom ?? 100 });
  };
  const changeZoom = (next: number) => {
    const value = Math.min(175, Math.max(75, next)); setZoom(value);
    useLcosShellStore.getState().rememberReaderPosition(positionKey, { scrollTop: container.current?.scrollTop ?? 0, zoom: value });
  };
  useEffect(() => {
    if (!source.projectId || !source.artifactId || !source.revisionId) return;
    useLcosShellStore.getState().rememberReaderRevision(JSON.stringify([source.projectId, source.artifactId]), source.revisionId);
  }, [source.projectId, source.artifactId, source.revisionId]);
  // One existing feedback slot: keep distinct actionable explanations, while
  // a routine “located” acknowledgement need not consume a second body row.
  const locationAttention = ['unavailable', 'choice', 'paused'].includes(locationState.status);
  const feedback = [...new Set([
    locationAttention ? locationState.message : undefined,
    note.error ? note.message : undefined,
    dragNotice,
    !note.error ? note.message : undefined,
  ].filter((message): message is string => !!message))];
  if (!feedback.length && locationState.message) feedback.push(locationState.message);
  const tools = <section ref={toolsContent} className="native-material-reading-tools" aria-label="阅读工具"
    onClick={event => {
      const button = event.target instanceof Element ? event.target.closest('.lcos-reader-outline button') : null;
      if (!renderActions || !button || !current()) return;
      // The original heading handler has already scrolled to its exact node.
      // Reveal that body instead of leaving its destination behind the menu.
      const previousTools = toolsContent.current;
      setToolsOpen(false); cancelAnimationFrame(searchFrame.current);
      searchFrame.current = requestAnimationFrame(() => {
        if (!current()) return;
        const active = document.activeElement;
        if (active === document.body || active === document.documentElement || active === button
          || !!previousTools?.contains(active) || active === container.current)
          container.current?.focus({ preventScroll: true });
      });
    }}>
    <h4>阅读</h4>{features.controls}
    <div className="native-material-reading-zoom"><button aria-label="缩小阅读字号" disabled={zoom <= 75} onClick={() => changeZoom(zoom - 10)}>A−</button>
      <button aria-label="恢复阅读字号" onClick={() => changeZoom(100)}>{zoom}%</button>
      <button aria-label="放大阅读字号" disabled={zoom >= 175} onClick={() => changeZoom(zoom + 10)}>A+</button></div>
    {features.outline}
  </section>;
  return <div data-lcos-native-text-reading data-lcos-reader-content-frame className="native-material-text-reading">
    {renderActions ? actionTarget && createPortal(renderActions({ open: toolsOpen,
      onOpenChange: value => { if (current()) setToolsOpen(value); }, content: tools }), actionTarget)
      : <details open={toolsOpen} className="native-material-reading-options" onToggle={event => setToolsOpen(event.currentTarget.open)}>
        <summary>阅读工具</summary>{tools}
      </details>}
    <div ref={container} tabIndex={0} className="native-material-text-scroll size-full overflow-y-auto px-10 py-8"
      onScroll={onScroll} onCopyCapture={features.onCopyCapture} onDragStartCapture={features.onDragStartCapture}
      onKeyDownCapture={event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault(); event.stopPropagation(); focusSearch();
        } else features.onKeyDownCapture(event);
      }}>
      <div className="lcos-reader-measure" style={{ zoom: zoom / 100 }}><TextBody markdown={markdown} sourceLines /></div>
    </div>
    <style>{`::highlight(${prefix}-source-location){background:#f3dd8a;color:#262923}`}</style>
    {feedback.length > 0 && <p className="native-material-reading-note" data-native-reader-feedback
      data-native-text-location-state={locationState.message ? locationState.status : undefined}
      role={locationState.status === 'unavailable' || note.error ? 'alert' : 'status'} aria-atomic="true">{feedback.join(' ')}</p>}
    {features.selectionToolbar}
  </div>;
}
