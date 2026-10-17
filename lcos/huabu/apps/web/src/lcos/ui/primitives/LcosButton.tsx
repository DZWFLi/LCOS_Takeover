// GEN1 features/ui/LcosButton.tsx: actual class/prop forwarding implementation.
// Thin adaptation: forwardRef supports the existing host refs and Motion; CSS uses current Figma tokens.
import { forwardRef } from 'react';

import type { ComponentPropsWithRef, ReactNode } from 'react';

import './donor-controls.css';

export interface LcosButtonProps extends ComponentPropsWithRef<'button'> {
  /** Existing bespoke families remain custom until their Figma instance is mapped. */
  appearance?: 'custom' | 'oreo';
  /** Oreo Button 23:11448. destructive maps only to its Primary + Danger variant. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  /** Legacy sizing is retained for custom callers; Oreo's face defaults to 32px. */
  size?: 'sm' | 'md';
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}


export const LcosButton = forwardRef<HTMLButtonElement, LcosButtonProps>(
  ({ appearance = 'custom', variant = 'primary', size = 'md', type = 'button',
    className, children, leadingIcon, trailingIcon, ...rest }, ref) => {
    const classes = ['lcos-btn', `lcos-btn--${variant}`, `lcos-btn--${size}`, className]
      .filter(Boolean).join(' ');
    const content = appearance === 'oreo' ? (
      <span className="lcos-oreo-face">
        <span className="lcos-oreo-content">
          {leadingIcon !== undefined && leadingIcon !== null && <span className="lcos-oreo-label-icon" aria-hidden="true">{leadingIcon}</span>}
          <span className="lcos-oreo-label">{children}</span>
          {trailingIcon !== undefined && trailingIcon !== null && <span className="lcos-oreo-label-icon" aria-hidden="true">{trailingIcon}</span>}
        </span>
      </span>
    ) : children;
    return (
      <button {...rest} ref={ref} type={type} className={classes}
        data-lcos-control-skin={appearance === 'oreo' ? 'oreo' : undefined}
        data-lcos-control-type={appearance === 'oreo' ? variant : undefined}
        data-lcos-control-kind={appearance === 'oreo' ? 'button' : undefined}>
        {content}
      </button>
    );
  },
);
LcosButton.displayName = 'LcosButton';
