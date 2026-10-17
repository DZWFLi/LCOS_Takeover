import { PreviewMedia } from '../spatial/PreviewMedia';
import flowIcon from './assets/workflow-flow-22.svg';

import './workflow-hand.css';
import type { ReactNode } from 'react';

export type WorkflowCollectionRendition = '工作流现场' | '主画布' | '装配';
export interface WorkflowCollectionFaceProps {
  readonly title: string;
  readonly rendition: WorkflowCollectionRendition;
  readonly previewUrl?: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly action?: ReactNode;
}
/** Same book face used by the production Motion host and visual regression. */
export function WorkflowCollectionFace({title, previewUrl, disabled=false, disabledReason, action}: WorkflowCollectionFaceProps): React.JSX.Element {
  return <>
        <div className="lcos-workflow-collection-back" aria-hidden />
        <div className="lcos-workflow-collection-cover">
          <PreviewMedia src={previewUrl} label={`${title} 封面`} />
        </div>
        <div className="lcos-workflow-collection-front" aria-hidden />
        <div className="lcos-workflow-collection-spine" aria-hidden />
        <div className="lcos-workflow-collection-tab" aria-hidden />
        <img className="lcos-workflow-collection-icon" src={flowIcon} alt="" draggable={false} />
        <div className="lcos-workflow-collection-copy"><strong title={title}>{title}</strong><span title={disabledReason}>{disabled ? disabledReason ?? '目标当前不可用' : '工作流'}</span></div>
        <div className="lcos-workflow-collection-action">{!disabled ? action : null}</div>
  </>;
}
