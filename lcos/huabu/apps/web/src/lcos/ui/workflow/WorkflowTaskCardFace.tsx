import { PreviewMedia } from '../spatial/PreviewMedia';
import flowIcon from './assets/workflow-flow-23.svg';
import chevronIcon from './assets/workflow-use-chevron.svg';
import paperclipIcon from './assets/workflow-use-paperclip.svg';
import './workflow-hand.css';

export type WorkflowTaskCardVisualState =
  | '静息' | '悬停' | '预览' | '已选目标' | '草稿中' | '不可用' | '键盘焦点';

export interface WorkflowCardActionAnchor {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WorkflowTaskCardFaceProps {
  readonly title: string;
  readonly summary?: string;
  readonly disabledReason?: string;
  readonly previewUrl?: string;
  readonly state: WorkflowTaskCardVisualState;
  readonly onUse?: (anchor: WorkflowCardActionAnchor) => void;
  readonly dataSource?: string;
  readonly dataEntity?: string;
}

/** Inner geometry of the existing card; no state producer or parallel renderer. */
export function workflowTaskSecondary({state, disabledReason, summary}: WorkflowTaskCardFaceProps): string {
  return state === '草稿中' ? '已加入草稿 · 未发送'
    : state === '不可用' ? disabledReason ?? '当前不可用' : summary ?? '工作流';
}

export function WorkflowTaskCardFace(props: WorkflowTaskCardFaceProps): React.JSX.Element {
  const {title, previewUrl, state, onUse, dataSource, dataEntity} = props;
  const disabled = state === '不可用';
  // The current production caller owns draft capture; the face only suppresses
  // actions for an unavailable or already-selected target.
  const actionAllowed = onUse !== undefined && !disabled && state !== '已选目标';
  const secondary = workflowTaskSecondary(props);
  return <>
        <div className="lcos-workflow-task-plate" aria-hidden />
        <div className="lcos-workflow-task-cover">
          <PreviewMedia src={previewUrl} label={`${title} 封面`} />
          <span className="lcos-workflow-task-badge" aria-hidden><img src={flowIcon} alt="" draggable={false} /></span>
          {actionAllowed ? (
            <button type="button" data-lcos-card-take data-lcos-task-take
              {...(dataSource === undefined ? {} : { 'data-lcos-card-source': dataSource })}
              {...(dataEntity === undefined ? {} : { 'data-lcos-card-entity': dataEntity })}
              className="lcos-workflow-task-use" onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onUse?.({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
              }}>
              <img src={paperclipIcon} alt="" draggable={false} aria-hidden />
              <span>加入当前草稿</span>
              <img src={chevronIcon} alt="" draggable={false} aria-hidden />
            </button>
          ) : null}
        </div>
        <div className="lcos-workflow-task-copy">
          <strong title={title}>{title}</strong>
          <span title={secondary}>{secondary}</span>
        </div>
  </>;
}
