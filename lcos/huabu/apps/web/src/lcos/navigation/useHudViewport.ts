import { useEffect, useState } from 'react';

/** Screen dimensions only. Camera and window geometry remain in their existing owners. */
export function useHudViewport(): { readonly width: number; readonly height: number } {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const update = (): void => {
      const next = read();
      setSize((previous) => previous.width === next.width && previous.height === next.height ? previous : next);
    };
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    update();
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return size;
}
