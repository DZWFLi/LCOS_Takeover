/**
 * THIN_ADAPT: Huabu SpacePreviewViewport.tsx native wheel lifetime.
 * The callback changes a producer-owned time window, never a Canvas camera.
 * Copyright (c) Microsoft Corporation. Licensed under the MIT license.
 */
export function bindTemporalWheel(
  root: HTMLElement,
  onShift: (direction: -1 | 1) => void,
): () => void {
  const onWheel = (event: WheelEvent): void => {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    if (Number.isFinite(event.deltaY) && event.deltaY !== 0) onShift(event.deltaY > 0 ? 1 : -1);
  };
  root.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return () => root.removeEventListener('wheel', onWheel, true);
}
