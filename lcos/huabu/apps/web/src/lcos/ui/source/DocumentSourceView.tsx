import { MilkdownPreview } from '@/components/Milkdown';
import { FileText } from 'lucide-react';
import { documentBodyExcerpt, documentExcerpt, documentOutline, documentSourceLayout } from './documentSourceLayout';
import { SourceFeedbackSlot } from './SourceFeedbackSlot';
import { FIGMA_SOURCE_NODE_IDS } from '../../nodes/source/sourceFigmaGeometry';
import './source-presentation.css';

import type { SourceVisualProps } from './sourceViewTypes';
import type { CSSProperties, JSX } from 'react';

interface DocumentSourceViewProps extends SourceVisualProps {
  readonly canonicalMarkdown?: string;
  readonly contentStatus?: 'loading' | 'failed';
  readonly onRetryContent?: () => void;
}
export function DocumentSourceView(props: DocumentSourceViewProps): JSX.Element {
  const isMark = props.density === 'mark';
  const outline = props.canonicalMarkdown === undefined ? '' : documentOutline(props.canonicalMarkdown, props.density);
  const excerpt = outline || (props.canonicalMarkdown === undefined ? documentExcerpt(props.preview, props.density) : documentBodyExcerpt(props.canonicalMarkdown, props.density));
  const full = props.density === 'reading' && props.canonicalMarkdown !== undefined;
  const layout = documentSourceLayout(props.density, props.zoom, props.worldHeight);
  return (
    <div className="lcos-source-view lcos-source-document"
      data-lcos-source-visual="document"
      data-figma-node-id={FIGMA_SOURCE_NODE_IDS.document}
      data-density={props.density}
      data-ui-interaction={props.interaction}
      style={{
        '--lcos-document-title-size': `${layout.titleSize}px`,
        '--lcos-document-body-size': `${layout.bodySize}px`,
        '--lcos-document-body-leading': `${layout.lineHeight}px`,
        '--lcos-document-padding': `${layout.padding}px`,
        '--lcos-document-lines': layout.lines,
      } as CSSProperties}
    >
      <div className="lcos-source-paper">
        {isMark && <FileText className="lcos-document-mark" size={layout.iconSize} strokeWidth={1.5} aria-hidden />}
        <span className="lcos-document-title" title={props.title}>{props.title}</span>
        {full ? <div className="lcos-document-full nodrag nowheel" data-lcos-document-full tabIndex={0}
          onWheel={event => event.stopPropagation()}>
          <MilkdownPreview markdown={props.canonicalMarkdown!} ariaLabel={`${props.title} 完整正文`} />
        </div> : excerpt !== '' && <div className="lcos-document-excerpt-slot"><span data-lcos-node-preview className="lcos-document-excerpt">{excerpt}</span></div>}
        {props.density === 'reading' && props.contentStatus && <span className="lcos-document-load-status" role="status">
          {props.contentStatus === 'failed' ? <>正文读取失败 <button type="button" className="nodrag nopan" onClick={event => { event.stopPropagation(); props.onRetryContent?.(); }}>重试</button></> : '正在读取正文…'}
        </span>}
        {props.density === 'reading' && <span className="lcos-document-source">{props.secondary || '文档 · 只读投影'}</span>}
      </div>
      <SourceFeedbackSlot feedback={props.feedback} />
    </div>
  );
}
