import { LcosSurfaceFeedback } from '../LcosSurfaceFeedback';

import type { SourceVisualProps } from './sourceViewTypes';
import type { JSX } from 'react';

/** Reuse the existing feedback family, without deciding why the state exists. */
export function SourceFeedbackSlot({ feedback }: Pick<SourceVisualProps, 'feedback'>): JSX.Element | null {
  return feedback === undefined ? null : (
    <div className="lcos-source-feedback">
      <LcosSurfaceFeedback presentation={feedback.presentation} message={feedback.message} />
    </div>
  );
}
