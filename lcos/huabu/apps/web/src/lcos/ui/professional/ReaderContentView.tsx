import { PanelRight } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';

import { Button } from '@/components/Common/Button';
import { MilkdownPreview } from '@/components/Milkdown';

import { Gen1ImageZoomStage } from './donor/Gen1ImageZoomStage';
import ScrollProgress from './donor/ScrollProgress';
import { ReaderFormatContentView } from './ReaderFormatContent';
import { ReaderMediaInfoView, type ReaderMediaInfoField } from './ReaderMediaInfoView';
import { ReaderPptxView } from './ReaderPptxView';
import { useReaderTextFeatures, type ReaderTextSection } from './useReaderTextFeatures';
import './donor/gen1-reader.css';
import './professional-reading.css';
import './reader-scroll-progress.css';
import './reader-media-information.css';
import './tapnow-text-reader.css';

import type { MaterialSourceV1 } from './donor/Gen1TextTransfer';
import type { ReaderFormatContent } from '../../professional/readerFormats';
import type { ReactNode, Ref, UIEventHandler } from 'react';

const PdfReader = lazy(() => import('./ReaderPdfView').then((module) => ({ default: module.ReaderPdfView })));
const AudioReader = lazy(() => import('../../nodes/source/AudioSourceMorphology').then((module) => ({ default: module.AudioSourceMorphology })));
const VideoReader = lazy(() => import('./VideoReaderContentView').then((module) => ({ default: module.VideoReaderContentView })));

/** The owning Reader supplies revision bytes. No loading, URL or revision owner lives here. */
export type ReaderVisibleContent =
  | { readonly kind: 'text'; readonly value: string; readonly viewKey?: string; readonly mimeType?: string }
  | { readonly kind: 'image'; readonly url: string; readonly mimeType: string; readonly viewKey?: string }
  | { readonly kind: 'pdf' | 'video' | 'audio'; readonly url: string; readonly mimeType: string; readonly viewKey?: string }
  | ReaderFormatContent
  | null;

export function readerArtifactKindLabel(kind: string): string {
  switch (kind) {
    case 'markdown': return '文本文档';
    case 'image': return '图片';
    case 'presentation': return '演示文稿';
    case 'pdf': return 'PDF 文档';
    case 'other': return '其他文件';
    default: return '其他材料';
  }
}

export interface ReaderContentViewProps {
  readonly content: ReaderVisibleContent;
  readonly kind: string;
  readonly fileName: string;
  readonly contentRef?: Ref<HTMLDivElement>;
  readonly onScroll?: UIEventHandler<HTMLDivElement>;
  /** Content has rendered, not merely arrived from the file service. */
  readonly onContentReady?: (content: NonNullable<ReaderVisibleContent>) => void;
  /** The owner keeps the reader's continuity/zoom state; this view only presents it. */
  readonly zoom?: number;
  readonly loading?: boolean;
  readonly error?: string;
  readonly onRetry?: () => void;
  /** Reuse the host's renderer when one is available; never parse or fetch a second copy. */
  readonly renderedText?: ReactNode;
  readonly unavailableGlyph?: ReactNode;
  /** Optional owner-supplied loading/error/recovery presentation. null content is NOT success. */
  readonly feedback?: ReactNode;
  readonly textSource?: MaterialSourceV1;
  readonly onCiteSelection?: () => void;
  readonly mediaActions?: ReactNode;
}

/** Thin presentation adaptation of GEN1 ArtifactViewerHost's content/fallback junction. */
export function ReaderContentView({
  content,
  kind,
  fileName,
  contentRef,
  onScroll,
  onContentReady,
  zoom = 100,
  loading = false,
  error,
  onRetry,
  renderedText,
  unavailableGlyph,
  feedback,
  textSource,
  onCiteSelection,
  mediaActions,
}: ReaderContentViewProps): React.JSX.Element {
  if (loading) {
    return (
      <div data-lcos-reader-content="loading" className="lcos-reader-unavailable" aria-live="polite">
        正在读取正文…
      </div>
    );
  }

  if (error !== undefined) {
    return (
      <div data-lcos-reader-content="error" className="lcos-reader-unavailable" role="alert">
        <span>正文读取失败 · {error}</span>
        {onRetry === undefined ? null : (
          <button type="button" data-lcos-reader-retry onClick={onRetry}>重读同一版本</button>
        )}
      </div>
    );
  }

  if (content?.kind === 'pptx') return <ReaderPptxView key={content.viewKey ?? fileName} content={content} fileName={fileName}
    source={textSource} contentRef={contentRef} onScroll={onScroll} onContentReady={onContentReady} zoom={zoom} />;
  if (content?.kind === 'office' || content?.kind === 'html') {
    return <ReaderFormatContentView content={content} fileName={fileName} contentRef={contentRef}
      onScroll={onScroll} onContentReady={onContentReady} zoom={zoom} feedback={feedback} />;
  }

  if (content?.kind === 'text') {
    return <ReaderTextContent key={content.viewKey ?? fileName} content={content} kind={kind}
      contentRef={contentRef} onScroll={onScroll} onContentReady={onContentReady}
      zoom={zoom} renderedText={renderedText} feedback={feedback} textSource={textSource} onCiteSelection={onCiteSelection} />;
  }

  if (content?.kind === 'pdf') return <Suspense fallback={<div role="status">正在载入预览…</div>}>
    <PdfReader key={content.viewKey ?? content.url} content={content as NonNullable<ReaderVisibleContent> & { kind: 'pdf' }} fileName={fileName} source={textSource}
      contentRef={contentRef} onScroll={onScroll} onContentReady={onContentReady} zoom={zoom} onRetry={onRetry} feedback={feedback} />
  </Suspense>;

  if (content?.kind === 'video' || content?.kind === 'audio') {
    return <div ref={contentRef} onScroll={onScroll} className="lcos-reader-media-page lcos-reader-document-media" data-lcos-reader-content={content.kind}>
      <Suspense fallback={<div role="status">正在载入预览…</div>}>
        {content.kind === 'audio' ? <AudioReader key={content.url} family="audio" title={fileName} density="reading" mediaSrc={content.url} />
          : <VideoReader key={content.url} src={content.url} title={fileName} />}
      </Suspense>
      {feedback}
    </div>;
  }

  if (content?.kind === 'image') {
    return <ReaderImageContent key={content.viewKey ?? content.url} content={content} fileName={fileName}
      contentRef={contentRef} onScroll={onScroll} onRetry={onRetry} feedback={feedback} source={textSource} actions={mediaActions} />;
  }

  return (
    <div data-lcos-reader-content="unavailable" className="lcos-reader-unavailable">
      {feedback === undefined ? (
        <>
          <span aria-hidden="true" className="lcos-reader-unavailable-glyph">{unavailableGlyph}</span>
          <span>{fileName} · {readerArtifactKindLabel(kind)} · 暂无可用正文读取通道</span>
        </>
      ) : feedback}
    </div>
  );
}

/** TapNow yCe/Y0e media/info arrangement. Existing Stage and GEN1 image
 * interaction remain the owners; this component only folds the info pane. */
function ReaderImageContent({ content, fileName, contentRef, onScroll, onRetry, feedback, source, actions }: {
  content: Exclude<ReaderVisibleContent, null> & { kind: 'image' };
  fileName: string;
  contentRef: ReaderContentViewProps['contentRef'];
  onScroll: ReaderContentViewProps['onScroll'];
  onRetry: ReaderContentViewProps['onRetry'];
  feedback: ReactNode;
  source: ReaderContentViewProps['textSource'];
  actions: ReactNode;
}): React.JSX.Element {
  const [infoOpen, setInfoOpen] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>();
  const fields: ReaderMediaInfoField[] = [
    { key: 'name', label: '名称', value: fileName },
    { key: 'mime', label: '格式', value: content.mimeType },
  ];
  if (dimensions) fields.push({ key: 'dimensions', label: '尺寸', value: `${dimensions.width} × ${dimensions.height} px` });
  if (dimensions) fields.push({ key: 'ratio', label: '比例', value: `${dimensions.width / gcd(dimensions.width, dimensions.height)} : ${dimensions.height / gcd(dimensions.width, dimensions.height)}` });
  if (source?.revisionId) fields.push({ key: 'revision', label: '阅读版本', value: '已固定', hint: source.revisionId });
  return <div ref={contentRef} onScroll={onScroll} data-lcos-reader-content="image"
    className="lcos-reader-media-page lcos-reader-image-frame">
    <div className="lcos-reader-image-layout">
    <div className="lcos-reader-image-main">
      <figure className="lcos-reader-figure" onLoadCapture={event => {
        const image = event.target;
        if (image instanceof HTMLImageElement && image.naturalWidth > 0 && image.naturalHeight > 0)
          setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      }}>
        <Gen1ImageZoomStage src={content.url} alt={fileName} {...(onRetry === undefined ? {} : { onRetry })} />
      </figure>
      <span className="lcos-professional-sr-only">{content.mimeType}</span>
      {!infoOpen && <button type="button" className="lcos-reader-info-toggle" aria-label="展开材料信息" aria-expanded={false}
        onClick={() => setInfoOpen(true)}><PanelRight size={15} aria-hidden />信息</button>}
      {feedback}
    </div>
    {infoOpen && <ReaderMediaInfoView fields={fields} onClose={() => setInfoOpen(false)}
      {...(source?.artifactId && source.revisionId ? { description: { label: '版本来源', value: `artifact:${source.artifactId}@${source.revisionId}` } } : {})}
      actions={actions} />}
    </div>
    {!infoOpen && actions}
  </div>;
}

function gcd(width: number, height: number): number {
  return height === 0 ? width : gcd(height, width % height);
}

/** Reuse the same parser/schema as the canvas document and editor. The owner
 * continues to supply immutable revision bytes; this surface never fetches Current. */
function ReaderTextContent({ content, kind, contentRef, onScroll, onContentReady, zoom, renderedText, feedback, textSource, onCiteSelection }: {
  content: Extract<ReaderVisibleContent, { kind: 'text' }>;
  kind: string;
  contentRef: ReaderContentViewProps['contentRef'];
  onScroll: ReaderContentViewProps['onScroll'];
  onContentReady: ReaderContentViewProps['onContentReady'];
  zoom: number;
  renderedText: ReactNode;
  feedback: ReactNode;
  textSource: ReaderContentViewProps['textSource'];
  onCiteSelection: ReaderContentViewProps['onCiteSelection'];
}): React.JSX.Element {
  const [renderError, setRenderError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [showSource, setShowSource] = useState(false);
  const readerAnchorPrefix = `lcos-reader-${useId().replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const readerContentRef = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState<readonly ReaderTextSection[]>([]);
  const [hasScrollableContent, setHasScrollableContent] = useState(false);
  useImperativeHandle(contentRef, () => readerContentRef.current as HTMLDivElement);
  const latest = useRef({ content, onContentReady });
  latest.current = { content, onContentReady };
  const rich = renderedText === undefined && !showSource
    && (kind === 'markdown' || content.mimeType?.split(';')[0] === 'text/markdown');
  const collectSections = useCallback(() => {
    const container = readerContentRef.current;
    if (container === null) {
      setSections([]);
      return;
    }
    const headings = Array.from(container.querySelectorAll<HTMLElement>(
      '.lcos-reader-measure h1, .lcos-reader-measure h2, .lcos-reader-measure h3, .lcos-reader-measure h4, .lcos-reader-measure h5, .lcos-reader-measure h6',
    ));
    const next: ReaderTextSection[] = [];
    const scopedIdsBySource = new Map<string, string>();
    headings.forEach((heading, index) => {
      const label = heading.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (!label) return;
      const storedSourceId = heading.getAttribute('data-lcos-reader-source-id');
      const sourceId = storedSourceId ?? heading.id;
      if (storedSourceId === null) heading.setAttribute('data-lcos-reader-source-id', sourceId);
      const baseId = sourceId || `section-${index + 1}`;
      const suffix = next.some((section) => section.id === `${readerAnchorPrefix}-${baseId}`)
        ? `-${index + 1}`
        : '';
      const scopedId = `${readerAnchorPrefix}-${baseId}${suffix}`;
      if (sourceId) scopedIdsBySource.set(sourceId, scopedId);
      if (heading.id) scopedIdsBySource.set(heading.id, scopedId);
      heading.id = scopedId;
      next.push({ id: scopedId, label, depth: Number(heading.tagName.slice(1)) });
    });
    for (const link of container.querySelectorAll<HTMLAnchorElement>('.lcos-reader-measure a[href^="#"]')) {
      const sourceId = link.getAttribute('href')?.slice(1);
      const scopedId = sourceId === undefined ? undefined : scopedIdsBySource.get(sourceId);
      if (scopedId !== undefined) link.setAttribute('href', `#${scopedId}`);
    }
    setSections(next);
  }, [readerAnchorPrefix]);
  const measureScrollableContent = useCallback(() => {
    const container = readerContentRef.current;
    const scrollable = container !== null && container.scrollHeight > container.clientHeight + 1;
    setHasScrollableContent((current) => current === scrollable ? current : scrollable);
  }, []);
  const ready = useCallback(() => {
    collectSections();
    measureScrollableContent();
    const { content: current, onContentReady: notify } = latest.current;
    notify?.(current);
  }, [collectSections, measureScrollableContent]);
  const failed = useCallback((error: Error) => setRenderError(error.message), []);
  useEffect(() => { if (!rich) ready(); }, [rich, content, renderedText, ready]);
  useEffect(() => {
    const container = readerContentRef.current;
    if (container === null) return;
    measureScrollableContent();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureScrollableContent);
    observer?.observe(container);
    const measure = container.querySelector('.lcos-reader-measure');
    if (measure) observer?.observe(measure);
    window.addEventListener('resize', measureScrollableContent);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measureScrollableContent);
    };
  }, [content, renderedText, zoom, showSource, measureScrollableContent]);
  const textFeatures = useReaderTextFeatures({ containerRef: readerContentRef, sections,
    prefix: readerAnchorPrefix, source: textSource, onCiteSelection });
  return <div data-lcos-reader-content-frame className="lcos-reader-content-frame lcos-reader-text-frame"
    onKeyDownCapture={textFeatures.onKeyDownCapture}>
    {textFeatures.controls}
    <div className="lcos-reader-text-workspace">
    {textFeatures.outline}
    {/* The read-only document needs focus for keyboard scrolling and local Find. */}
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Focusable read-only document viewport retains native keyboard scrolling. */}
    <div ref={readerContentRef} onScroll={onScroll} data-lcos-reader-content="text" role="document" aria-label="正文（只读）" tabIndex={0}
      onCopyCapture={textFeatures.onCopyCapture} onDragStartCapture={textFeatures.onDragStartCapture}
      data-figma-node-id="5388:27484" className="lcos-reader-page">
      <div className="lcos-reader-measure">
        {rich ? <div data-lcos-reader-text-scale style={{ zoom: zoom / 100 }}>
          <MilkdownPreview key={attempt} markdown={content.value} enableBlockDrag={false}
            ariaLabel="正文（只读）" className="lcos-reader-richtext lcos-reader-markdown"
            onRendered={ready} onError={failed} />
        </div> : renderedText !== undefined ? <div className="lcos-reader-richtext" style={{ zoom: zoom / 100 }}>{renderedText}</div>
          : <pre className="lcos-reader-plaintext" style={{ fontSize: `${16 * zoom / 100}px` }}>{content.value}</pre>}
        {renderError && !showSource && <div role="alert" data-lcos-reader-render-error>
          <p>此版本正文已读取，但格式预览未能载入：{renderError}</p>
          <Button size="sm" variant="ghost" onClick={() => { setRenderError(undefined); setAttempt(n => n + 1); }}>重试格式预览</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowSource(true)}>查看同一版本原文</Button>
        </div>}
      </div>
      {feedback}
    </div>
    </div>
    {textFeatures.selectionToolbar}
    {sections.length > 0 && hasScrollableContent && <ScrollProgress
      data-lcos-reader-scroll-progress
      aria-label="正文章节进度"
      sections={[...sections]}
      containerRef={readerContentRef}
      className="lcos-reader-scroll-progress"
    />}
  </div>;
}
