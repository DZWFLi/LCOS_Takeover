import { motion, useReducedMotion } from 'motion/react';

import { WorkflowCollectionFace } from './WorkflowCollectionFace';
import { useDescendantFocus } from '../spatial/useDescendantFocus';

import type { WorkflowCollectionFaceProps } from './WorkflowCollectionFace';

import './workflow-hand.css';

export type { WorkflowCollectionRendition } from './WorkflowCollectionFace';

export interface WorkflowCollectionViewProps extends WorkflowCollectionFaceProps {
  readonly active?: boolean;
}

export function WorkflowCollectionView({
  title,
  rendition,
  previewUrl,
  disabled = false,
  disabledReason,
  active = false,
  action,
}: WorkflowCollectionViewProps): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const focus = useDescendantFocus();
  return (
    <div
      className="lcos-workflow-collection-slot"
      data-active={active ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      data-focused={focus.focused ? 'true' : undefined}
      aria-disabled={disabled || undefined}
      onFocusCapture={focus.onFocusCapture}
      onBlurCapture={focus.onBlurCapture}
    >
      <motion.div
        data-lcos-workflow-collection
        data-rendition={rendition}
        className="lcos-workflow-collection"
        initial={reducedMotion ? false : { opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: !reducedMotion && !disabled && focus.focused ? -7 : 0, scale: !reducedMotion && !disabled && focus.focused ? 1.022 : 1 }}
        whileHover={reducedMotion || disabled ? undefined : { y: -7, scale: 1.022 }}
        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 25 }}
      >
        <WorkflowCollectionFace title={title} rendition={rendition} disabled={disabled}
          {...(previewUrl === undefined ? {} : {previewUrl})}
          {...(disabledReason === undefined ? {} : {disabledReason})}
          {...(action === undefined ? {} : {action})} />
      </motion.div>
    </div>
  );
}
