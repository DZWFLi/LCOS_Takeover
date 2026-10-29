import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { mountSpectralRipple, type RipplePhase } from './spectralRipple';
import './soft-underlight.css';
import './spectral-ripple.css';
export function SpectralMaterial({
  children,
  className = '',
  phase = 'quiet',
  active = true,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly phase?: RipplePhase;
  readonly active?: boolean;
}) {
  const layer = useRef<HTMLSpanElement>(null),
    controller = useRef<ReturnType<typeof mountSpectralRipple> | null>(null);
  useLayoutEffect(() => {
    if (!layer.current) return;
    const ripple = mountSpectralRipple(layer.current);
    controller.current = ripple;
    return () => {
      ripple.destroy();
      controller.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    controller.current?.update({ phase, active });
  }, [phase, active]);
  return (
    <div className={`lcos-soft-underlight ${className}`}>
      <span
        ref={layer}
        className="lcos-soft-underlight-field"
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
