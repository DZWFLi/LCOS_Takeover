// Figma 5391:357. Keep the primitive and optional action as separate visual surfaces.
import { FigmaShellGlyph } from './FigmaShellGlyph';
import { LcosButton } from './primitives/LcosButton';

import type { LcosFeedbackPresentation } from './LcosSurfaceFeedback';
import type { CSSProperties } from 'react';

import './surface-feedback.css';

export interface LcosSurfaceFeedbackViewProps {
  readonly presentation: LcosFeedbackPresentation;
  readonly message: string;
  readonly onAction?: () => void;
  readonly actionLabel?: string;
  readonly actionDisabled?: boolean;
  readonly style?: CSSProperties;
}

export function LcosSurfaceFeedbackView({ presentation, message, onAction,
  actionLabel = '重试', actionDisabled = false, style }: LcosSurfaceFeedbackViewProps): React.JSX.Element {
  return (
    <div role="status" aria-atomic="true" data-lcos-family="surface-feedback"
      data-lcos-variant={presentation} data-lcos-surface-feedback={presentation} style={style}>
      <span data-lcos-feedback-body>
        <FigmaShellGlyph name={presentation} size={18} monochrome />
        <span data-lcos-feedback-message>{message}</span>
      </span>
      {onAction !== undefined && (
        <LcosButton type="button" appearance="oreo" variant="secondary"
          data-lcos-feedback-action disabled={actionDisabled} onClick={onAction}>
          {actionLabel}
        </LcosButton>
      )}
    </div>
  );
}
