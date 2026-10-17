// LCOS 轻量反馈原语（Figma 统一 / SurfaceFeedback 5391:357；7 呈现）。
// 只作宿主附近的短态反馈；normal 由真实回执消费，不用定时器假装成功。
// reduced-motion 保留文案与轮廓；loading 用静态符号代替旋转。

import { useState, type CSSProperties, type JSX } from 'react';

import { LcosSurfaceFeedbackView } from './LcosSurfaceFeedbackView';

export type LcosFeedbackPresentation =
  | 'loading'
  | 'empty'
  | 'normal'
  | 'focus'
  | 'disabled'
  | 'error'
  | 'recovery';

export interface LcosSurfaceFeedbackProps {
  readonly presentation: LcosFeedbackPresentation;
  /** 显式文案；未提供时按呈现给默认文案。 */
  readonly message?: string;
  readonly onAction?: () => void;
  readonly actionLabel?: string;
  readonly style?: CSSProperties;
}

const DEFAULT_MESSAGE: Readonly<Record<LcosFeedbackPresentation, string>> = {
  loading: '正在读取…',
  empty: '还没有内容 · 从装配拿来使用',
  normal: '已就绪',
  focus: '当前目标',
  disabled: '当前不可用 · 查看原因',
  error: '读取失败 · 重试',
  recovery: '尚未确认 · 核对原操作',
};

export function LcosSurfaceFeedback({
  presentation,
  message,
  onAction,
  actionLabel,
  style,
}: LcosSurfaceFeedbackProps): JSX.Element {
  const [actionPending, setActionPending] = useState(false);
  const text = message ?? DEFAULT_MESSAGE[presentation];

  return (
    <LcosSurfaceFeedbackView presentation={presentation} message={text} style={style}
      actionLabel={actionLabel} actionDisabled={actionPending || presentation === 'loading'}
      onAction={onAction === undefined ? undefined : () => {
        setActionPending(true);
        try {
          onAction();
        } finally {
          window.setTimeout(() => setActionPending(false), 600);
        }
      }} />
  );
}
