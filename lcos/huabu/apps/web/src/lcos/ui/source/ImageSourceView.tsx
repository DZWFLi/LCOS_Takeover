import { SourceFeedbackSlot } from './SourceFeedbackSlot';
import { FIGMA_SOURCE_GEOMETRY, FIGMA_SOURCE_NODE_IDS } from '../../nodes/source/sourceFigmaGeometry';
import { PreviewMedia } from '../spatial/PreviewMedia';
import './source-presentation.css';

import type { SourceVisualProps } from './sourceViewTypes';
import type { JSX } from 'react';

export function ImageSourceView(props: SourceVisualProps): JSX.Element {
  // Preserve the current thumbnail rule; this is not a new zoom/LOD threshold.
  const compact = (props.worldWidth ?? FIGMA_SOURCE_GEOMETRY.image.width) <= 240;
  return (
    <div className="lcos-source-view lcos-source-image"
      data-lcos-source-visual="image"
      data-figma-node-id={compact ? FIGMA_SOURCE_NODE_IDS.imageThumbnail : FIGMA_SOURCE_NODE_IDS.image}
      data-density={props.density}
      data-thumbnail={compact || undefined}
      data-ui-interaction={props.interaction}
    >
      <div data-lcos-source-media className="lcos-image-media">
        <PreviewMedia label={props.title} fit="contain"
          {...(props.mediaSrc === undefined ? {} : { src: props.mediaSrc })} />
      </div>
      {props.density !== 'mark' && (
        <span className="lcos-source-caption">
          {props.title}{props.density === 'reading' && props.secondary ? ` · ${props.secondary}` : ''}
        </span>
      )}
      <SourceFeedbackSlot feedback={props.feedback} />
    </div>
  );
}
