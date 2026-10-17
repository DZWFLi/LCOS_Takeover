import { useCallback, useEffect, useRef, useState } from 'react';

import { MilkdownPreview } from '@/components/Milkdown';

import type { ReaderFormatContent } from '../../professional/readerFormats';
import type { ReactNode, Ref, UIEventHandler } from 'react';

interface ReaderFormatContentViewProps {
  readonly content: Exclude<ReaderFormatContent, { readonly kind: 'pptx' }>;
  readonly fileName: string;
  readonly contentRef?: Ref<HTMLDivElement>;
  readonly onScroll?: UIEventHandler<HTMLDivElement>;
  readonly onContentReady?: (content: ReaderFormatContent) => void;
  readonly zoom?: number;
  readonly feedback?: ReactNode;
}

/** Formats are rendered only from revision-bound content already supplied by
 * Reader. No node data, preprocessing request, browser URL, or Current lookup.
 */
export function ReaderFormatContentView(props: ReaderFormatContentViewProps): React.JSX.Element {
  return <ReaderFormatBody key={props.content.viewKey ?? `${props.fileName}:${props.content.kind}`} {...props} />;
}

function ReaderFormatBody({ content, fileName, contentRef, onScroll, onContentReady, zoom = 100, feedback }: ReaderFormatContentViewProps): React.JSX.Element {
  const [source, setSource] = useState(false);
  const [renderError, setRenderError] = useState<string>();
  const notified = useRef<ReaderFormatContent | null>(null);
  const rendered = useCallback((): void => {
    if (notified.current === content) return;
    notified.current = content;
    onContentReady?.(content);
  }, [content, onContentReady]);
  useEffect(() => {
    // Source and genuinely empty Office files render without an async parser.
    if (source || content.kind === 'office' && !content.value.trim()) rendered();
  }, [content, rendered, source]);
  return <div ref={contentRef} onScroll={onScroll} data-lcos-reader-content={content.kind}
    className="lcos-reader-format-content" style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
    {content.kind === 'html' ? <>
      <div role="group" aria-label="HTML 阅读方式" style={{ display: 'flex', gap: 8 }}>
        <button type="button" aria-pressed={!source} onClick={() => setSource(false)}>网页预览</button>
        <button type="button" aria-pressed={source} onClick={() => setSource(true)}>HTML 源码</button>
      </div>
      {source ? <pre data-lcos-reader-html-source style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: `${zoom}%` }}><code>{content.value}</code></pre>
        : <iframe title={`${fileName} · 网页预览`} srcDoc={content.value} sandbox="allow-scripts allow-forms allow-popups"
            referrerPolicy="no-referrer" onLoad={rendered} style={{ width: '100%', flex: '1 0 440px', border: 0, background: 'white' }} />}
    </> : <>
      <span className="lcos-reader-format-description">{content.format.toUpperCase()} · 只读内容预览</span>
      {renderError ? <div role="alert">Office 内容显示失败 · {renderError}</div>
        : !content.value.trim() ? <p>此版本没有可提取的正文。</p>
        : <div style={{ fontSize: `${zoom}%` }}><MilkdownPreview markdown={content.value} onRendered={rendered}
            onError={(error) => setRenderError(error.message)} /></div>}
    </>}
    {feedback}
  </div>;
}
