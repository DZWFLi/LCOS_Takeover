import { useEffect, useId, useLayoutEffect, useRef, useState, type UIEventHandler } from 'react';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { attachReaderScrollRestore } from '../../lcos/huabu/apps/web/src/lcos/professional/readerScrollRestore';
import { useReaderTextFeatures, type ReaderTextSection } from '../../lcos/huabu/apps/web/src/lcos/ui/professional/useReaderTextFeatures';
import type { MaterialSourceV1 } from '../../lcos/huabu/apps/web/src/lcos/ui/professional/donor/Gen1TextTransfer';
import type { NativeMaterialViewerParts } from './native-material-viewer-types';
import './native-material-viewer.css';

/** Original CT renders the document. Existing GEN1 selection/search/transfer
 * behavior is a content extension inside the original vZ text panel. */
export function NativeMaterialTextReading({ markdown, source, parts, onCiteSelection }: {
  markdown: string; source: MaterialSourceV1; parts: NativeMaterialViewerParts; onCiteSelection(): void | Promise<string>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState<readonly ReaderTextSection[]>([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const prefix = `native-reading-${useId().replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const positionKey = JSON.stringify([source.projectId, source.artifactId, source.revisionId]);
  const [note, setNote] = useState('');
  const [zoom, setZoom] = useState(() => useLcosShellStore.getState().readerPositions[positionKey]?.zoom ?? 100);
  const features = useReaderTextFeatures({ containerRef: container, sections, prefix, source, onCiteSelection: () => {
    void Promise.resolve().then(onCiteSelection).then(value => { if (value) setNote(value); })
      .catch(error => setNote(error instanceof Error ? error.message : '摘录暂未加入，所选正文保留。'));
  } });
  const TextBody = parts.TextBody;
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
    const restore = attachReaderScrollRestore(element, saved?.scrollTop ?? 0);
    return () => restore.dispose();
  }, [markdown, positionKey, prefix]);
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
  return <div data-lcos-native-text-reading data-lcos-reader-content-frame className="native-material-text-reading">
    <details open={toolsOpen} className="native-material-reading-options" onToggle={event => setToolsOpen(event.currentTarget.open)}>
      <summary>阅读工具</summary>{features.controls}
      <div className="native-material-reading-zoom"><button aria-label="缩小阅读字号" disabled={zoom <= 75} onClick={() => changeZoom(zoom - 10)}>A−</button>
        <button aria-label="恢复阅读字号" onClick={() => changeZoom(100)}>{zoom}%</button>
        <button aria-label="放大阅读字号" disabled={zoom >= 175} onClick={() => changeZoom(zoom + 10)}>A+</button></div>
      {features.outline}
    </details>
    <div ref={container} tabIndex={0} className="native-material-text-scroll size-full overflow-y-auto px-10 py-8"
      onScroll={onScroll} onCopyCapture={features.onCopyCapture} onDragStartCapture={features.onDragStartCapture}
      onKeyDownCapture={event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault(); event.stopPropagation(); setToolsOpen(true);
          requestAnimationFrame(() => {
            const input = container.current?.parentElement?.querySelector<HTMLInputElement>('[aria-label="在文档中查找"]');
            input?.focus(); input?.select();
          });
        } else features.onKeyDownCapture(event);
      }}>
      <div className="lcos-reader-measure" style={{ zoom: zoom / 100 }}><TextBody markdown={markdown} /></div>
    </div>
    {note && <p className="native-material-reading-note" role="status">{note}</p>}
    {features.selectionToolbar}
  </div>;
}
