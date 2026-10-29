// Lazy first-page preview uses the existing PDF.js worker; full reading stays in Reader.
import { useState } from 'react';
import { Document, Page } from 'react-pdf';
import { PDF_DOCUMENT_OPTIONS } from '@/components/Nodes/pdf/pdfWorker';
import type { SourceMorphologyProps } from './sourceTypes';

export default function PdfSourcePreview(props: SourceMorphologyProps): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pages, setPages] = useState<number | undefined>();
  return <div className="lcos-source-view lcos-source-document lcos-source-pdf" data-lcos-source-visual="document" data-density={props.density}>
    <div className="lcos-source-paper">
      <span className="lcos-document-title">{props.title}</span>
      {failed ? <div role="status" className="lcos-source-media-error">PDF 预览读取失败
        <button type="button" className="nodrag nopan" onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => {
            event.stopPropagation(); setFailed(false); setAttempt((value) => value + 1);
          }}>重试</button></div> : <Document key={attempt} file={props.mediaSrc} options={PDF_DOCUMENT_OPTIONS}
          loading={<span className="lcos-web-domain">正在读取 PDF…</span>} error={null}
          onLoadSuccess={({ numPages }) => setPages(numPages)} onLoadError={() => setFailed(true)}>
          <Page pageNumber={1} width={Math.max(100, Math.min(600, (props.worldWidth ?? 206) - 24))}
            renderAnnotationLayer={false} renderTextLayer={false} loading={null} error={null}
            onRenderError={() => setFailed(true)} />
        </Document>}
      {props.density === 'reading' && pages !== undefined && <span className="lcos-document-source">PDF · {pages} 页</span>}
    </div>
  </div>;
}
