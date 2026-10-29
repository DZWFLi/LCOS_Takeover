import './light-curtain.css';

/** Figma 5388:25501–25503 / 5140:4159–4161. Decorative layers, no state owner. */
export function LightCurtainBackdrop({ kind }: { readonly kind: 'atlas' | 'hand' }): React.JSX.Element {
  return (
    <div className="lcos-light-curtain-backdrop" data-curtain-kind={kind} aria-hidden="true">
      <div className="lcos-light-curtain-fog" />
      <div className="lcos-light-curtain-floor"><div className="lcos-light-curtain-glow" /></div>
    </div>
  );
}

/** Native click semantics reject drags that began on a foreground control. */
export function LightCurtainDismissPlane({ onClose, disabled = false, label = '收回集合总览' }: {
  readonly onClose: () => void;
  readonly disabled?: boolean;
  readonly label?: string;
}): React.JSX.Element {
  return <button type="button" className="lcos-atlas-dismiss-plane" tabIndex={-1}
    aria-label={label} disabled={disabled} onClick={onClose} />;
}
