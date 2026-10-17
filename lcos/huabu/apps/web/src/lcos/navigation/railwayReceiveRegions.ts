import { isDropPointExposed } from '../drop/dropOcclusion';
import { rectFromDomRect } from '../drop/dropTargetRegistry';

import type { DropRect } from '../drop/dropTypes';

/** One destination can be shown by an icon and its Peek. Both are the same
 * receiver; the space between their live DOM regions is not a receiver. */
export function railwayReceiveRegions(elements: readonly HTMLElement[]): {
  readonly readRect: () => DropRect | undefined;
  readonly acceptsPoint: (point: { readonly x: number; readonly y: number }) => boolean;
} {
  const visible = () => elements.filter(element => {
    const rect = element.getBoundingClientRect();
    return element.isConnected && rect.width > 0 && rect.height > 0;
  });
  return {
    readRect: () => {
      const rects = visible().map(element => rectFromDomRect(element.getBoundingClientRect()));
      if (!rects.length) return undefined;
      const left = Math.min(...rects.map(rect => rect.left));
      const top = Math.min(...rects.map(rect => rect.top));
      return { left, top,
        width: Math.max(...rects.map(rect => rect.left + rect.width)) - left,
        height: Math.max(...rects.map(rect => rect.top + rect.height)) - top };
    },
    acceptsPoint: point => visible().some(element => {
      const rect = element.getBoundingClientRect();
      return point.x >= rect.left && point.x <= rect.right
        && point.y >= rect.top && point.y <= rect.bottom && isDropPointExposed(element, point);
    }),
  };
}
