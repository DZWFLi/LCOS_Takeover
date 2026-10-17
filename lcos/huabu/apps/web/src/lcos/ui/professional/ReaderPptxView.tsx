// Main/page rail adopted from Gen1@3e99769 PptMaterialViewer; exact bytes remain Reader-owned.
import { useEffect, useState } from 'react';

import { LCOS_MATERIAL_TRANSFER_MIME, serializeMaterialTransfer } from './donor/Gen1TextTransfer';
import './reader-pptx.css';

import type { MaterialSourceV1, MaterialTransferPayloadV1 } from './donor/Gen1TextTransfer';
import type { ReaderPptxContent } from '../../professional/readerPptx';
import type { KeyboardEvent, Ref, UIEventHandler } from 'react';

const rememberedSlides = new Map<string, number>();
export function pptxSlideTransfer(source: MaterialSourceV1, page: number, svg: string): MaterialTransferPayloadV1 | undefined {
  if (!source.projectId || !source.artifactId || !source.revisionId || !source.fileRecordId) return;
  return { schemaVersion: 1, kind: 'material-transfer', capturedAt: new Date().toISOString(),
    source: { ...source, locator: { kind: 'slide', slideNumber: page, label: `第 ${page} 页` } },
    content: { kind: 'presentation-slide', slideNumber: page, svg } };
}

export function ReaderPptxView({ content, fileName, source, contentRef, onScroll, onContentReady, zoom = 100 }: {
  readonly content: ReaderPptxContent; readonly fileName: string; readonly source?: MaterialSourceV1;
  readonly contentRef?: Ref<HTMLDivElement>; readonly onScroll?: UIEventHandler<HTMLDivElement>;
  readonly onContentReady?: (content: ReaderPptxContent) => void; readonly zoom?: number;
}): React.JSX.Element {
  const count = content.slides.length;
  const [page, setPage] = useState(() => Math.min(Math.max(1,
    source?.locator?.kind === 'slide' ? source.locator.slideNumber : content.viewKey ? rememberedSlides.get(content.viewKey) ?? 1 : 1), Math.max(1, count)));
  const select = (next: number) => {
    const bounded = Math.min(Math.max(1, next), Math.max(1, count));
    setPage(bounded);
    if (content.viewKey) rememberedSlides.set(content.viewKey, bounded);
  };
  useEffect(() => { onContentReady?.(content); }, [content, onContentReady]);
  useEffect(() => {
    if (source?.locator?.kind === 'slide') {
      const requested = source.locator.slideNumber;
      if (requested > 0 && requested <= count) {
        setPage(requested); if (content.viewKey) rememberedSlides.set(content.viewKey, requested);
      }
    }
  }, [content.viewKey, count, source?.locator]);
  const keyboardPage = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); select(page + 1); }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); select(page - 1); }
  };
  const exactSource = Boolean(source?.projectId && source.artifactId && source.revisionId && source.fileRecordId);
  if (source?.locator?.kind === 'slide' && (!Number.isSafeInteger(source.locator.slideNumber)
    || source.locator.slideNumber < 1 || source.locator.slideNumber > count))
    return <div data-lcos-reader-content="pptx" role="alert">引用的第 {source.locator.slideNumber} 页不在此版本中，未切换到其它页或当前版本。</div>;
  return <div ref={contentRef} onScroll={onScroll} data-lcos-reader-content="pptx" className="lcos-pptx-reader">
    <aside aria-label="PPT 页面" className="lcos-pptx-page-rail">
      <strong>{count} 页</strong>
      {content.slides.map((svg, index) => <button key={index} type="button" aria-label={`第 ${index + 1} 页`}
        aria-current={page === index + 1 ? 'page' : undefined} onClick={() => select(index + 1)}
        draggable={exactSource} data-lcos-pptx-slide={index + 1} onDragStart={event => {
          const payload = source ? pptxSlideTransfer(source, index + 1, svg) : undefined;
          if (!payload) { event.preventDefault(); return; }
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData(LCOS_MATERIAL_TRANSFER_MIME, serializeMaterialTransfer(payload));
          event.dataTransfer.setData('text/plain', `${fileName} · 第 ${index + 1} 页`);
        }}><span className="lcos-pptx-thumb" dangerouslySetInnerHTML={{ __html: svg }} /><span>{index + 1}</span></button>)}
    </aside>
    <main aria-label={`${fileName} · 当前页面`} className="lcos-pptx-page-stage">
      {count ? <>
        <nav aria-label="PPT 翻页"><button type="button" disabled={page <= 1} onClick={() => select(page - 1)} onKeyDown={keyboardPage}>上一页</button>
          <span>第 {page} / {count} 页</span><button type="button" disabled={page >= count} onClick={() => select(page + 1)} onKeyDown={keyboardPage}>下一页</button></nav>
        <div data-lcos-pptx-current-page={page} className="lcos-pptx-sheet" style={{ width: `${Math.max(10, zoom)}%` }} dangerouslySetInnerHTML={{ __html: content.slides[page - 1] ?? '' }} />
        {exactSource && <small>缩略页可拖出，保留此版本与页码来源</small>}
      </> : <p>此版本没有可读取的幻灯片。</p>}
    </main>
  </div>;
}
