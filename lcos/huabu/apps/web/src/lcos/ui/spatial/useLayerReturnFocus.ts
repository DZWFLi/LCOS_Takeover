import { useLayoutEffect, useRef } from 'react';

/** Reuses the native opener-focus pattern from Huabu Modal without owning an overlay stack. */
export function useLayerReturnFocus(present: boolean) {
  const layer = useRef<HTMLDivElement>(null);
  const opener = useRef(typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
    ? document.activeElement : null);
  useLayoutEffect(() => {
    const restore = (): void => {
      const target = opener.current;
      const focused = document.activeElement;
      // A new Composer/route may already own focus. Returning must not steal it back.
      if (target?.isConnected && (focused === document.body || layer.current?.contains(focused))) {
        target.focus({ preventScroll: true });
      }
    };
    if (!present) restore();
    return () => { if (present) restore(); };
  }, [present]);
  return layer;
}
