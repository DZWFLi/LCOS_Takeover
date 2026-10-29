// GEN1 features/ui/LcosIconButton.tsx: actual class/prop forwarding implementation.
// Thin adaptation: forwardRef supports the existing host refs and Motion; CSS uses current Figma tokens.
import { forwardRef } from 'react';

import './donor-controls.css';

import type { ComponentPropsWithRef } from 'react';

export interface LcosIconButtonProps extends ComponentPropsWithRef<'button'> {
  appearance?: 'custom' | 'oreo';
  /** Oreo Rounded is a circle; Rectangle is r8. capsule is a retained legacy alias. */
  shape?: 'circle' | 'capsule' | 'rectangle';
  size?: 'sm' | 'md';
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Figma supplies floating variants only for Secondary + Rounded. */
  floating?: boolean;
}


export const LcosIconButton = forwardRef<HTMLButtonElement, LcosIconButtonProps>(
  ({ appearance = 'custom', shape = 'circle', size = 'md', variant = 'ghost',
    floating = false, type = 'button', className, children, ...rest }, ref) => {
    const classes = ['lcos-icon-btn', `lcos-icon-btn--${shape}`, `lcos-icon-btn--${size}`, className]
      .filter(Boolean).join(' ');
    return (
      <button {...rest} ref={ref} type={type} className={classes}
        data-lcos-control-skin={appearance === 'oreo' ? 'oreo' : undefined}
        data-lcos-control-type={appearance === 'oreo' ? variant : undefined}
        data-lcos-control-kind={appearance === 'oreo' ? 'icon' : undefined}
        data-lcos-control-shape={appearance === 'oreo' ? shape : undefined}
        data-lcos-control-floating={appearance === 'oreo' && floating
          && variant === 'secondary' && shape === 'circle' ? 'true' : undefined}>
        {appearance === 'oreo' ? <span className="lcos-oreo-face">{children}</span> : children}
      </button>
    );
  },
);
LcosIconButton.displayName = 'LcosIconButton';
