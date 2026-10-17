import { useState } from 'react';

import type { FocusEvent } from 'react';

/**
 * THIN_ADAPT: GEN1 SurfaceComponentShelf.tsx focus-capture / relatedTarget guard.
 * Presentation-only focus. It must not update Huabu Selection or draft references.
 */
export function useDescendantFocus(): {
  readonly focused: boolean;
  readonly onFocusCapture: () => void;
  readonly onBlurCapture: (event: FocusEvent<HTMLElement>) => void;
} {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    onFocusCapture: () => setFocused(true),
    onBlurCapture: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    },
  };
}
