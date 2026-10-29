import { SourceFeedbackSlot } from './SourceFeedbackSlot';
import { FIGMA_SOURCE_NODE_IDS } from '../../nodes/source/sourceFigmaGeometry';
import { sourceTextLayout } from './sourceTextLayout';
import './source-presentation.css';

import type { SourceVisualProps } from './sourceViewTypes';
import type { CSSProperties, JSX } from 'react';

export function TextSourceView(props: SourceVisualProps): JSX.Element {
  const isMark = props.density === 'mark';
  const statement = isMark ? props.title : props.preview?.trim() || props.title;
  const layout = sourceTextLayout(props.density, props.worldWidth, props.worldHeight, props.zoom);
  const showCaption = props.density === 'working' || props.density === 'reading';
  return (
    <div className="lcos-source-view lcos-source-text"
      data-lcos-source-visual="text"
      data-figma-node-id={FIGMA_SOURCE_NODE_IDS.text}
      data-density={props.density}
      data-ui-interaction={props.interaction}
      style={{
        '--lcos-source-text-size': `${layout.fontSize}px`,
        '--lcos-source-text-leading': `${layout.lineHeight}px`,
        '--lcos-source-text-lines': layout.lines,
      } as CSSProperties}
    >
      <span data-lcos-node-preview className="lcos-source-statement">{statement}</span>
      {showCaption && <span className="lcos-source-caption">{props.density === 'reading' ? props.secondary || props.title : props.title}</span>}
      <SourceFeedbackSlot feedback={props.feedback} />
    </div>
  );
}
