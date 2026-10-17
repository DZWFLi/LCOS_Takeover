import type { SourceMorphologyProps } from '../../nodes/source/sourceTypes';
import type { LcosFeedbackPresentation } from '../LcosSurfaceFeedback';

/** Only the supplied density is used. No viewport/LOD resolver lives in these views. */
export interface SourceVisualProps extends SourceMorphologyProps {
  readonly interaction?: 'rest' | 'hover' | 'selected' | 'active' | 'disabled' | undefined;
  readonly feedback?: {
    readonly presentation: LcosFeedbackPresentation;
    readonly message: string;
  } | undefined;
}
