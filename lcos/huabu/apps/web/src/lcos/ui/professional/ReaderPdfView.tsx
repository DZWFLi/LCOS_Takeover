// Gen1@3e99769 PdfViewer: page rail, actual page canvas/text and exact-source transfer.
// Rendering stays on the existing react-pdf/PDF.js wheel (MIT/Apache-2.0).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { PDF_DOCUMENT_OPTIONS } from '@/components/Nodes/pdf/pdfWorker';

import { LCOS_MATERIAL_TRANSFER_MIME, serializeMaterialTransfer } from './donor/Gen1TextTransfer';
import { pdfPageText, pdfPageTransfer } from './readerPdfMaterial';
import './reader-pdf.css';

import type { MaterialSourceV1 } from './donor/Gen1TextTransfer';
import type { ReaderVisibleContent } from './ReaderContentView';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { KeyboardEvent, ReactNode, Ref, UIEventHandler } from 'react';

type PdfContent = NonNullable<ReaderVisibleContent> & { readonly kind: 'pdf' };
const rememberedPages = new Map<string, number>();

export function ReaderPdfView({ content, fileName, source, contentRef, onScroll, onContentReady, onRetry, feedback, zoom = 100 }: {
  readonly content: PdfContent; readonly fileName: string; readonly source?: MaterialSourceV1;
  readonly contentRef?: Ref<HTMLDivElement>; readonly onScroll?: UIEventHandler<HTMLDivElement>;
  readonly onContentReady?: (content: PdfContent) => void; readonly onRetry?: () => void; readonly zoom?: number; readonly feedback?: ReactNode;
}): React.JSX.Element {
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(() => Math.max(1, source?.locator?.kind === 'page' ? source.locator.pageNumber
    : content.viewKey ? rememberedPages.get(content.viewKey) ?? 1 : 1));
  const [width, setWidth] = useState(720);
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const [rendered, setRendered] = useState<ReadonlySet<number>>(() => new Set());
  const [mainRenderedPage, setMainRenderedPage] = useState<number>();
  const [texts, setTexts] = useState<ReadonlyMap<number, string>>(() => new Map());
  const active = useRef(true);
  const stage = useRef<HTMLElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (source?.locator?.kind === 'page' && count > 0) {
      const requested = source.locator.pageNumber;
      if (!Number.isSafeInteger(requested) || requested < 1 || requested > count) return;
      setPage(requested); if (content.viewKey) rememberedPages.set(content.viewKey, requested);
    }
  }, [content.viewKey, count, source?.locator]);
  useEffect(() => {
    const element = stage.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => { if (element.clientWidth > 0) setWidth(Math.max(240, element.clientWidth - 24)); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [count]);
  const select = (next: number) => {
    const bounded = Math.min(Math.max(1, next), Math.max(1, count)); setPage(bounded);
    if (content.viewKey) rememberedPages.set(content.viewKey, bounded);
  };
  const keyboardPage = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); select(page + 1); }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); select(page - 1); }
  };
  const loadedPage = useCallback((pdfPage: PDFPageProxy) => {
    void pdfPageText(pdfPage).then(text => {
      if (active.current) setTexts(current => new Map(current).set(pdfPage.pageNumber, text));
    }).catch(() => { /* A rendered image page can still be extracted from its actual canvas. */ });
  }, []);
  const failure = (reason: Error) => setError(reason.message || 'PDF 页面不可读取');
  const exactSource = Boolean(source?.projectId && source.artifactId && source.revisionId && source.fileRecordId);
  const locatorError = source?.locator?.kind === 'page' && count > 0 && (!Number.isSafeInteger(source.locator.pageNumber)
    || source.locator.pageNumber < 1 || source.locator.pageNumber > count)
    ? `引用的第 ${source.locator.pageNumber} 页不在此版本中，未切换到其它页或当前版本。` : undefined;
  if (error || locatorError) return <div data-lcos-reader-content="pdf" role="alert">PDF 预览失败 · {error ?? locatorError}
    {onRetry && <button type="button" onClick={onRetry}>重读同一版本</button>}</div>;
  return <div ref={contentRef} onScroll={onScroll} data-lcos-reader-content="pdf" className="lcos-pdf-reader">
    <Document file={content.url} options={PDF_DOCUMENT_OPTIONS} className="lcos-pdf-document"
      loading={<span role="status">正在渲染 PDF…</span>} onLoadError={failure} onSourceError={failure}
      onLoadSuccess={document => { setCount(document.numPages); setPage(current => Math.min(Math.max(1, current), Math.max(1, document.numPages))); }}>
      <aside aria-label="PDF 页面" className="lcos-pdf-page-rail"><strong>{count || '…'} 页</strong>
        {Array.from({ length: count }, (_, index) => index + 1).map(number => <button key={number} type="button"
          aria-label={`第 ${number} 页`} aria-current={page === number ? 'page' : undefined} data-lcos-pdf-page={number}
          onClick={() => select(number)} draggable={exactSource && (rendered.has(number) || Boolean(texts.get(number)))}
          onDragStart={event => {
            const mainCanvas = page === number && mainRenderedPage === number ? stage.current?.querySelector('canvas') : undefined;
            const canvas = mainCanvas && mainCanvas.style.visibility !== 'hidden' ? mainCanvas : event.currentTarget.querySelector('canvas');
            let snapshot: string | undefined;
            try { snapshot = canvas?.toDataURL('image/png'); } catch { /* Real page text is the only permitted fallback. */ }
            const payload = source ? pdfPageTransfer(source, number, snapshot, texts.get(number)) : undefined;
            if (!payload) { event.preventDefault(); setNote('该页的快照或文字尚未读出，未摘取空白材料。'); return; }
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData(LCOS_MATERIAL_TRANSFER_MIME, serializeMaterialTransfer(payload));
            event.dataTransfer.setData('text/plain', texts.get(number) || `${fileName} · 第 ${number} 页`);
            setNote(undefined);
          }}><Page pageNumber={number} width={118} renderTextLayer={false} renderAnnotationLayer={false}
            onLoadSuccess={loadedPage} onRenderSuccess={() => setRendered(current => new Set(current).add(number))} />
          <span>{number}</span></button>)}
      </aside>
      <main ref={stage} className="lcos-pdf-page-stage" aria-label={`${fileName} · 当前页面`}>
        <nav aria-label="PDF 翻页"><button type="button" disabled={page <= 1} onClick={() => select(page - 1)} onKeyDown={keyboardPage}>上一页</button>
          <span>第 {page} / {count || '…'} 页</span><button type="button" disabled={page >= count} onClick={() => select(page + 1)} onKeyDown={keyboardPage}>下一页</button></nav>
        {count > 0 && <div className="lcos-pdf-page-sheet" data-lcos-pdf-current-page={page}>
          <Page key={page} pageNumber={page} width={Math.max(240, Math.min(2400, width * zoom / 100))} renderTextLayer renderAnnotationLayer
            onLoadSuccess={loadedPage} onRenderError={failure} onRenderSuccess={() => { setMainRenderedPage(page); onContentReady?.(content); }} />
        </div>}
        {exactSource && <small>拖动缩略页摘取，保留此版本与页码来源</small>}
        {note && <span role="status">{note}</span>}
      </main>
    </Document>
    {feedback}
  </div>;
}
